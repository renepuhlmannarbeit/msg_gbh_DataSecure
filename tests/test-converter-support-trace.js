'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const scope = fs.mkdtempSync(path.join(repo, '.tmp-standalone-package-converter-trace-'));
const environmentKeys = ['EU_PRIVACY_DATA_ROOT', 'EU_PRIVACY_ROOT', 'EU_PRIVACY_RESULT_ROOT',
  'EU_PRIVACY_SUPPORT_MODE', 'DATASECURE_PRODUCT_CHANNEL', 'DATASECURE_RUN_ID'];
const previousEnvironment = new Map(environmentKeys.map(key => [key, process.env[key]]));
process.env.EU_PRIVACY_DATA_ROOT = path.join(scope, 'bootstrap');
process.env.EU_PRIVACY_ROOT = path.join(scope, 'private');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(scope, 'visible');
process.env.EU_PRIVACY_SUPPORT_MODE = '1';
process.env.DATASECURE_PRODUCT_CHANNEL = 'plugin'; // The operation must explicitly bind standalone.
process.env.DATASECURE_RUN_ID = 'customer-derived-value-must-not-escape';
const support = require('../plugins/data-secure/server/gateway/support-trace');
const { convertNext } = require('../plugins/data-secure/server/standalone/convert-next');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const store = require('../plugins/data-secure/server/standalone/markdown-store');
const { batchWorkerEnvironment } = require('../plugins/data-secure/server/gateway/batch-executor');
const originals = { recordSupportTrace: support.recordSupportTrace, enabled: support.enabled, newTraceId: support.newTraceId };
const sourceText = 'RAW_CONTENT_SENTINEL Max Mustermann, Nordstern GmbH, DE89370400440532013000\r\n';
let number = 0, passed = 0;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(text = sourceText, extension = '.txt') {
  const root = path.join(scope, `case-${++number}`);
  fs.mkdirSync(root);
  process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'data');
  process.env.EU_PRIVACY_SUPPORT_MODE = '1';
  const source = path.join(root, `PRIVATE_NAME_SENTINEL${extension}`);
  const bytes = Buffer.from(text);
  fs.writeFileSync(source, bytes, { flag: 'wx' });
  const entry = { name: path.basename(source), full: source, private_bytes: Buffer.from(bytes), expected_sha256: digest(bytes) };
  const observed = [];
  support.recordSupportTrace = (record, options) => {
    observed.push(support.sanitizeSupportTrace(record, options));
    return originals.recordSupportTrace(record, options);
  };
  return { root, source, bytes, entry, observed, artifactId: `dm_${number.toString(16).padStart(32, '0')}` };
}
function convert(f, extra = {}) {
  return convertNext('ignored-profile', { inputQueue: [f.entry], artifactId: f.artifactId,
    convertBuffer: (bytes, extension) => extractMarkdownBuffer(bytes, extension), ...extra });
}
function evidence(f, expected) {
  assert.deepEqual(f.observed.map(event => event.event), expected);
  const traceOptions = { dataRoot: process.env.EU_PRIVACY_DATA_ROOT };
  const directory = support._test.traceDirectory(traceOptions);
  const files = support._test.eventFiles(traceOptions);
  const persisted = files.map(file => fs.readFileSync(path.join(directory, file), 'utf8'));
  assert.equal(persisted.length, expected.length, 'events are actually persisted through the existing spool');
  assert.deepEqual(persisted.map(raw => JSON.parse(raw).event).sort(), [...expected].sort());
  const raw = persisted.join('\n');
  for (const sentinel of ['RAW_CONTENT_SENTINEL', 'PRIVATE_NAME_SENTINEL', 'Max Mustermann', 'Nordstern',
    'DE89370400440532013000', f.source, f.entry.expected_sha256, f.artifactId, 'customer-derived-value']) {
    assert.ok(!raw.includes(sentinel), 'source data, paths, identities and hashes are absent');
  }
  const keys = ['schema', 'timestamp', 'gateway_version', 'product_channel', 'trace_id', 'run_id', 'event',
    'method', 'operation', 'outcome', 'duration_ms', 'error_code'].sort();
  for (const event of f.observed) {
    assert.deepEqual(Object.keys(event).sort(), keys);
    assert.equal(event.product_channel, 'standalone');
    assert.equal(event.operation, 'standalone_batch');
    assert.equal(event.method, 'unknown');
    assert.equal(event.run_id, 'none');
    assert.match(event.trace_id, /^[a-f0-9]{8}$/u);
  }
  assert.equal(new Set(f.observed.map(event => event.trace_id)).size, expected.length ? 1 : 0);
  assert.deepEqual(fs.readFileSync(f.source), f.bytes, 'the original source is unchanged');
}
async function test(name, run) { await run(); passed++; console.log(`ok ${passed} - ${name}`); }

async function run() {
  try {
    await test('the actual batch environment carries only the exact explicit support opt-in', async () => {
      for (const value of [undefined, null, '', '0', 'true', ' 1', '1 ', true, 1, 'PRIVATE_NAME_SENTINEL', '1']) {
        const env = batchWorkerEnvironment({ EU_PRIVACY_SUPPORT_MODE: value,
          API_KEY: 'RAW_CONTENT_SENTINEL', NODE_OPTIONS: '--inspect', DATASECURE_RUN_ID: 'abcd1234' });
        assert.equal(env.EU_PRIVACY_SUPPORT_MODE, value === '1' ? '1' : undefined);
        assert.equal(Object.hasOwn(env, 'EU_PRIVACY_SUPPORT_MODE'), value === '1');
        assert.equal(env.API_KEY, undefined);
        assert.equal(env.NODE_OPTIONS, undefined);
        assert.equal(env.DATASECURE_RUN_ID, 'abcd1234');
      }
      assert.equal(batchWorkerEnvironment({}).EU_PRIVACY_SUPPORT_MODE, undefined,
        'an explicit source never inherits an enabled parent flag implicitly');
    });
    await test('real TXT extraction and durable artifact publish emit the closed successful lifecycle', async () => {
      const f = fixture();
      const result = await convert(f);
      assert.equal(store.readMarkdownArtifact(result.artifact_id).markdown, sourceText);
      assert.ok(store.verifyMarkdownItem(result));
      evidence(f, ['converter_started', 'coverage_checked', 'converter_completed']);
      assert.ok(f.observed.every(event => event.error_code === 'NONE'));
      assert.deepEqual(f.observed.map(event => event.outcome), ['progress', 'ok', 'ok']);
    });
    await test('incomplete coverage remains in the real artifact, never becomes a completeness assertion in logs', async () => {
      const f = fixture(sourceText, '.md');
      const result = await convert(f, { convertBuffer: bytes => createMarkdownExtraction({ source_type: 'md',
        markdown: bytes.toString('utf8'), coverage: { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED', 'OCR_TEXT_EMPTY'] } }) });
      assert.equal(result.extraction_grade, 'incomplete');
      assert.deepEqual(result.reason_codes, ['OCR_NOT_VERIFIED', 'OCR_TEXT_EMPTY']);
      assert.equal(store.readMarkdownArtifact(result.artifact_id).markdown, sourceText);
      evidence(f, ['converter_started', 'coverage_checked', 'converter_completed']);
      assert.ok(f.observed.every(event => !Object.hasOwn(event, 'complete') && !Object.hasOwn(event, 'coverage')));
    });
    await test('real malformed CSV records the fixed parser error, without coverage or success', async () => {
      const f = fixture(`Name,Wert\n"${sourceText}`, '.csv');
      await assert.rejects(convert(f), { code: 'CSV_QUOTE_INVALID' });
      evidence(f, ['converter_started', 'converter_stopped']);
      assert.equal(f.observed.at(-1).error_code, 'CSV_QUOTE_INVALID');
      assert.equal(fs.existsSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'markdown-artifacts', f.artifactId)), false);
    });
    await test('abort after real extraction records cancellation and does not publish', async () => {
      const f = fixture(), controller = new AbortController();
      await assert.rejects(convert(f, { signal: controller.signal, onExtracted() { controller.abort(); } }), { code: 'REQUEST_CANCELLED' });
      evidence(f, ['converter_started', 'coverage_checked', 'converter_stopped']);
      assert.equal(f.observed.at(-1).error_code, 'REQUEST_CANCELLED');
      assert.equal(fs.existsSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'markdown-artifacts', f.artifactId)), false);
    });
    await test('unknown source-bearing exceptions stay original and never reach the trace record', async () => {
      const f = fixture();
      const failure = Object.assign(new Error(`RAW_CONTENT_SENTINEL ${f.source}`), { code: 'PRIVATE_NAME_SENTINEL' });
      await assert.rejects(convert(f, { convertBuffer() { throw failure; } }), cause => cause === failure);
      evidence(f, ['converter_started', 'converter_stopped']);
      assert.equal(f.observed.at(-1).error_code, 'INTERNAL_FAILURE');
    });
    await test('failed artifact publication never emits converter_completed', async () => {
      const f = fixture();
      const failure = Object.assign(new Error('PRIVATE_NAME_SENTINEL'), { code: 'MARKDOWN_ARTIFACT_INVALID' });
      await assert.rejects(convert(f, { beforePublish() { throw failure; } }), cause => cause === failure);
      evidence(f, ['converter_started', 'coverage_checked', 'converter_stopped']);
      assert.equal(f.observed.at(-1).error_code, 'MARKDOWN_ARTIFACT_INVALID');
      assert.equal(fs.existsSync(path.join(store.artifactRoot(), f.artifactId)), false);
    });
    await test('support mode disabled creates no diagnostics and does not request a correlation id', async () => {
      const f = fixture();
      process.env.EU_PRIVACY_SUPPORT_MODE = '0';
      let ids = 0;
      support.newTraceId = () => { ids++; throw new Error('not requested'); };
      try {
        const result = await convert(f);
        assert.ok(store.verifyMarkdownItem(result));
      } finally { support.newTraceId = originals.newTraceId; }
      assert.equal(ids, 0);
      evidence(f, []);
      assert.equal(fs.existsSync(path.join(process.env.EU_PRIVACY_DATA_ROOT, 'diagnostics')), false);
    });
    await test('a real invalid diagnostic directory does not block artifact publication or parser failure', async () => {
      for (const malformed of [false, true]) {
        const f = fixture(malformed ? '"RAW_CONTENT_SENTINEL' : sourceText, malformed ? '.csv' : '.txt');
        const directory = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'diagnostics');
        fs.mkdirSync(directory, { recursive: true });
        const blocked = path.join(directory, 'support-events');
        fs.writeFileSync(blocked, 'owned diagnostic obstacle', { flag: 'wx' });
        if (malformed) await assert.rejects(convert(f), { code: 'CSV_QUOTE_INVALID' });
        else assert.ok(store.verifyMarkdownItem(await convert(f)));
        assert.equal(fs.readFileSync(blocked, 'utf8'), 'owned diagnostic obstacle');
        assert.deepEqual(fs.readFileSync(f.source), f.bytes);
      }
    });
    await test('throwing diagnostic hooks cannot change success or replace the conversion exception', async () => {
      for (const hook of ['enabled', 'newTraceId', 'recordSupportTrace']) {
        for (const failing of [false, true]) {
          const f = fixture();
          const failure = new Error('original conversion failure');
          support[hook] = () => { throw new Error('diagnostic failure'); };
          try {
            if (failing) await assert.rejects(convert(f, { convertBuffer() { throw failure; } }), cause => cause === failure);
            else assert.ok(store.verifyMarkdownItem(await convert(f)));
          } finally { support[hook] = originals[hook]; }
          assert.deepEqual(fs.readFileSync(f.source), f.bytes);
        }
      }
    });
    console.log(`${passed} converter support trace groups passed`);
  } finally {
    Object.assign(support, originals);
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    const { removePackageSmokeScope } = await import('./helpers/standalone-package-scope.mjs');
    removePackageSmokeScope(repo, scope);
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
