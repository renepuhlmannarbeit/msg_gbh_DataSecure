'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');
const { createStatusApp, RESOURCE_URI, RESOURCE_MIME_TYPE, MAX_HTML_BYTES } = require('../plugins/data-secure/server/status-app/server');

const { test, done, assert } = createSuite('Passive status app server');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-status-app-'));
const host = { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [RESOURCE_MIME_TYPE] } } };
const enabledEnv = { EU_PRIVACY_STATUS_APP_PILOT: '1' };
const tools = [
  { name: 'start_document_batch_from_picker', inputSchema: { type: 'object' } },
  { name: 'continue_local_results_handoff', inputSchema: { type: 'object' } }
];
let sequence = 0;
function fixture(html = '<!doctype html><html><body>Fixed local status</body></html>') {
  const directory = path.join(base, String(++sequence));
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'status-card.html'), html);
  const bytes = Buffer.from(html);
  const manifest = {
    schema: 'datasecure-status-app-artifact/v1', sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length, sdk_version: '1.7.5', release_enabled: false
  };
  fs.writeFileSync(path.join(directory, 'artifact.json'), JSON.stringify(manifest));
  return { directory, manifest };
}
function app(options = {}) { return createStatusApp({ env: enabledEnv, ...options }); }
const started = {
  content: [{ type: 'text', text: 'unchanged text' }],
  structuredContent: {
    ok: true, mode: 'local_only', local_intake_pending: true, local_processing_started: true,
    next_action: 'local_processing_running_without_claude', raw_content_sent_to_claude: false
  }, isError: false
};

try {
  test('default, support, malformed host and absent initialization never read any artifact', () => {
    const fsApi = { lstatSync() { throw new Error('Artifact access not allowed in this case'); } };
    for (const [env, capabilities] of [
      [{}, host], [{ EU_PRIVACY_STATUS_APP_PILOT: 'true' }, host],
      [{ ...enabledEnv, EU_PRIVACY_SUPPORT_MODE: '1' }, host], [enabledEnv, undefined],
      [enabledEnv, { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: RESOURCE_MIME_TYPE } } }],
      [enabledEnv, { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html', 'text/html;profile=mcp-app '] } } }]
    ]) {
      let reads = 0;
      const server = app({ env, fsApi: { lstatSync() { reads++; return fsApi.lstatSync(); } } });
      assert.deepStrictEqual(server.capabilities(), {});
      assert.strictEqual(server.tools(tools), tools);
      assert.strictEqual(server.readResource(RESOURCE_URI), null);
      assert.strictEqual(server.listResources(), null);
      assert.strictEqual(server.toolResult(tools[0].name, started), started);
      assert.strictEqual(server.initialize(capabilities), false);
      assert.strictEqual(reads, 0);
      assert.strictEqual(server.listResources(), null);
    }
  });

  test('negotiated pilot publishes only one immutable package resource with deny-all CSP', () => {
    const server = app(fixture());
    assert.strictEqual(server.initialize(host), true);
    assert.deepStrictEqual(server.capabilities(), { resources: { subscribe: false, listChanged: false } });
    const list = server.listResources();
    assert.strictEqual(list.resources.length, 1);
    const resource = list.resources[0];
    assert.strictEqual(resource.uri, RESOURCE_URI);
    assert.strictEqual(resource.mimeType, RESOURCE_MIME_TYPE);
    const expected = { ui: { prefersBorder: true, permissions: {}, csp: {
      connectDomains: [], resourceDomains: [], frameDomains: [], baseUriDomains: []
    } } };
    assert.deepStrictEqual(resource._meta, expected);
    const read = server.readResource(RESOURCE_URI);
    assert.deepStrictEqual(read.contents[0]._meta, expected);
    assert.match(read.contents[0].text, /Fixed local status/u);
    assert.strictEqual(read.contents[0].mimeType, RESOURCE_MIME_TYPE);
    resource._meta.ui.csp.connectDomains.push('https://untrusted.invalid');
    assert.deepStrictEqual(server.readResource(RESOURCE_URI).contents[0]._meta, expected);
  });

  test('only the picker links the UI and every callable tool remains model-only', () => {
    const server = app(fixture());
    server.initialize(host);
    const listed = server.tools(tools);
    assert.deepStrictEqual(listed[0]._meta.ui, { visibility: ['model'], resourceUri: RESOURCE_URI });
    assert.deepStrictEqual(listed[1]._meta.ui, { visibility: ['model'] });
    assert.strictEqual(tools[0]._meta, undefined);
    assert.strictEqual(tools[1]._meta, undefined);
    assert.strictEqual(listed.length, tools.length);
  });

  test('the picker metadata is a fixed snapshot and content/structuredContent stay identical', () => {
    const server = app({ ...fixture(), env: { ...enabledEnv, EU_PRIVACY_LANGUAGE: 'en' } });
    server.initialize(host);
    const response = server.toolResult(tools[0].name, started);
    assert.strictEqual(response.content, started.content);
    assert.strictEqual(response.structuredContent, started.structuredContent);
    assert.strictEqual(response.isError, started.isError);
    assert.deepStrictEqual(response._meta['datasecure/status'], {
      schema: 'datasecure-status-card/v1', locale: 'en', state: 'local_start_confirmed', snapshot: true
    });
    assert.strictEqual(server.toolResult('continue_local_results_handoff', started), started);
    assert.strictEqual(server.toolResult('diagnostic_status', started), started);
    assert.strictEqual(started._meta, undefined);
  });

  test('resource traversal, query strings and alternative URI encodings are rejected', () => {
    const server = app(fixture());
    server.initialize(host);
    for (const uri of [undefined, {}, '', '../status-card.html', 'file:///etc/passwd',
      `${RESOURCE_URI}?x=1`, `${RESOURCE_URI}#x`, 'ui://data-secure/../artifact.json',
      'ui://data-secure/%73tatus-card-v1.html', 'UI://data-secure/status-card-v1.html']) {
      assert.strictEqual(server.readResource(uri), null);
    }
  });

  test('later initialize cannot escalate a non-UI connection', () => {
    const server = app(fixture());
    assert.strictEqual(server.initialize({}), false);
    assert.strictEqual(server.initialize(host), false);
    assert.strictEqual(server.listResources(), null);
  });

  test('hash mismatch, wrong size, schema, SDK, release flag and malformed manifest disable UI', () => {
    for (const change of [
      { sha256: 'a'.repeat(64) }, { bytes: 1 }, { bytes: MAX_HTML_BYTES + 1 },
      { sdk_version: '1.7.6' }, { schema: 'other/v1' }, { release_enabled: true }, { extra: true }
    ]) {
      const data = fixture();
      fs.writeFileSync(path.join(data.directory, 'artifact.json'), JSON.stringify({ ...data.manifest, ...change }));
      const server = app(data);
      assert.strictEqual(server.initialize(host), false);
      assert.strictEqual(server.toolResult(tools[0].name, started), started);
    }
    const data = fixture();
    fs.writeFileSync(path.join(data.directory, 'artifact.json'), '{');
    assert.strictEqual(app(data).initialize(host), false);
  });

  test('missing/empty/oversized HTML and directory-shaped HTML fail closed without breaking text', () => {
    for (const content of ['', 'x'.repeat(MAX_HTML_BYTES + 1)]) {
      const server = app(fixture(content));
      assert.strictEqual(server.initialize(host), false);
      assert.strictEqual(server.toolResult(tools[0].name, started), started);
    }
    const data = fixture();
    fs.unlinkSync(path.join(data.directory, 'status-card.html'));
    assert.strictEqual(app(data).initialize(host), false);
    fs.mkdirSync(path.join(data.directory, 'status-card.html'));
    assert.strictEqual(app(data).initialize(host), false);
  });

  test('symlink/reparse identity and descriptor replacement are rejected before artifact bytes are used', () => {
    const data = fixture();
    for (const filename of ['status-card.html', 'artifact.json', path.basename(data.directory)]) {
      const fsApi = { ...fs, lstatSync(target, options) {
        const stat = fs.lstatSync(target, options);
        if (path.basename(target) === filename) stat.isSymbolicLink = () => true;
        return stat;
      } };
      assert.strictEqual(app({ ...data, fsApi }).initialize(host), false);
    }
    const fsApi = { ...fs, fstatSync(fd, options) { const stat = fs.fstatSync(fd, options); stat.ino += 1n; return stat; } };
    assert.strictEqual(app({ ...data, fsApi }).initialize(host), false);
  });

  test('truncation, timestamp changes and malformed UTF-8 disable UI and close opened descriptors', () => {
    const data = fixture();
    let opened = 0;
    let closed = 0;
    const fsApi = {
      ...fs,
      openSync(...args) { opened++; return fs.openSync(...args); },
      closeSync(fd) { closed++; return fs.closeSync(fd); },
      readSync() { return 0; }
    };
    assert.strictEqual(app({ ...data, fsApi }).initialize(host), false);
    assert.strictEqual(opened, 1);
    assert.strictEqual(closed, opened);
    let calls = 0;
    const changed = { ...fs, fstatSync(fd, options) {
      const stat = fs.fstatSync(fd, options);
      if (++calls === 2) stat.mtimeNs += 1n;
      return stat;
    } };
    assert.strictEqual(app({ ...data, fsApi: changed }).initialize(host), false);
    assert.strictEqual(app(fixture(Buffer.from([0xff, 0xff]))).initialize(host), false);
  });

  test('negotiated HTML is cached in memory so later resource reads perform no disk access', () => {
    const data = fixture();
    let reads = 0;
    const fsApi = { ...fs, lstatSync(target, options) { reads++; return fs.lstatSync(target, options); } };
    const server = app({ ...data, fsApi });
    server.initialize(host);
    const initialReads = reads;
    fs.writeFileSync(path.join(data.directory, 'status-card.html'), 'tampered after negotiation');
    for (let index = 0; index < 20; index++) assert.match(server.readResource(RESOURCE_URI).contents[0].text, /Fixed local status/u);
    assert.strictEqual(reads, initialReads);
  });
} finally {
  fs.rmSync(base, { recursive: true, force: true });
}

done();
