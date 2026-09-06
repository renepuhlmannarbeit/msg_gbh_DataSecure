'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createSuite } = require('./helpers');
const { PassThrough } = require('node:stream');
const { EventEmitter } = require('node:events');
const { convertDocxForDifferential, minimalEnvironment } = require('../plugins/data-secure/server/converters/markitdown/differential-oracle');
const { sanitizeSupportTrace } = require('../plugins/data-secure/server/gateway/support-trace');

const { test, testAsync, done, assert } = createSuite('MarkItDown boundary contract');
const root = path.join(__dirname, '..', 'plugins', 'data-secure', 'server', 'converters', 'markitdown');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'runtime-contract.json'), 'utf8'));
const bridge = fs.readFileSync(path.join(root, 'bridge.py'), 'utf8');

test('upstream, version and license are exactly pinned', () => {
  assert.deepStrictEqual({ component: contract.component, version: contract.version, license: contract.license }, {
    component: 'Microsoft MarkItDown', version: '0.1.7', license: 'MIT'
  });
  assert.strictEqual(contract.upstream, 'https://github.com/microsoft/markitdown');
  assert.strictEqual(contract.runtime_install_allowed, false);
});

test('initial product gate is off and only DOCX differential conversion is permitted', () => {
  assert.strictEqual(contract.product_enabled, false);
  assert.strictEqual(contract.stage, 'docx_differential_oracle');
  assert.deepStrictEqual(contract.allowed_extensions, ['.docx']);
  assert.strictEqual(contract.persist_raw_markdown, false);
  assert.strictEqual(contract.transport_authenticated, false);
  assert.match(contract.input_transport, /engineering_only/u);
});

test('bridge accepts bytes, disables plugins/builtins/network and never emits a traceback', () => {
  assert.match(bridge, /sys\.stdin\.buffer\.read/u);
  assert.match(bridge, /convert_stream/u);
  assert.match(bridge, /enable_builtins=False, enable_plugins=False/u);
  assert.match(bridge, /register_converter\(DocxConverter\(\)\)/u);
  assert.match(bridge, /socket\.socket = _NetworkDeniedSocket/u);
  assert.doesNotMatch(bridge, /convert\(|convert_local|https?:\/\/|traceback\.print/u);
  assert.match(bridge, /MARKITDOWN_CONVERSION_STOPPED/u);
});

test('cloud, plugin and MarkItDown OCR paths are contractually unavailable', () => {
  for (const key of ['network_allowed', 'plugins_allowed', 'llm_clients_allowed', 'markitdown_ocr_allowed']) {
    assert.strictEqual(contract[key], false, key);
  }
});

test('oracle environment excludes host PATH, network and document metadata', () => {
  const environment = minimalEnvironment({ runtimeRoot: 'C:\\runtime', environment: {
    SystemRoot: 'C:\\Windows', PATH: 'C:\\attacker', USERNAME: 'person', HTTP_PROXY: 'http://proxy'
  } });
  assert.deepStrictEqual(environment, {
    SystemRoot: 'C:\\Windows', DATASECURE_ENGINEERING_MODE: '1',
    DATASECURE_ENGINEERING_MARKITDOWN_ROOT: 'C:\\runtime', PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8', PYTHONHASHSEED: '0', EU_PRIVACY_SUPPORT_MODE: '0'
  });
});

async function engineeringBridgeCase() {
  let observed;
  const spawn = (command, args, options) => {
    observed = { command, args, options };
    return fakeSpawn()();
  };
  await convertDocxForDifferential(Buffer.from('synthetic'), {
    engineeringMode: true, pythonExecutable: 'C:\\Python\\python.exe', runtimeRoot: 'C:\\runtime',
    spawn, environment: { TEMP: 'C:\\host-temp', TMP: 'C:\\host-tmp' }
  });
  assert.deepStrictEqual(observed.args.slice(0, 2), ['-I', '-S']);
  assert.strictEqual(Object.hasOwn(observed.options.env, 'TEMP'), false);
  assert.strictEqual(Object.hasOwn(observed.options.env, 'TMP'), false);
}

test('converter support events use only the closed content-free schema', () => {
  const event = sanitizeSupportTrace({
    trace_id: '1234abcd', event: 'converter_completed', method: 'unknown',
    operation: 'markitdown_docx_differential', outcome: 'ok', duration_ms: 125,
    path: 'C:\\private\\person.docx', markdown: 'Max Mustermann', stderr: 'secret'
  }, { now: 0, env: {} });
  assert.strictEqual(event.event, 'converter_completed');
  assert.strictEqual(event.operation, 'markitdown_docx_differential');
  assert.strictEqual(event.duration_ms, 125);
  assert.doesNotMatch(JSON.stringify(event), /private|Mustermann|secret|path|markdown|stderr/u);
});

function fakeSpawn({ output = '# converted', exitCode = 0 } = {}) {
  return () => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => child.emit('close', null);
    queueMicrotask(() => {
      if (output) child.stdout.end(Buffer.from(output));
      child.stderr.end(Buffer.from('private path must be discarded'));
      child.emit('close', exitCode);
    });
    return child;
  };
}

async function oracleCase() {
  const markdown = await convertDocxForDifferential(Buffer.from('synthetic'), {
    engineeringMode: true, pythonExecutable: 'C:\\Python\\python.exe', runtimeRoot: 'C:\\runtime',
    spawn: fakeSpawn(), environment: {}
  });
  assert.strictEqual(markdown, '# converted');
  await assert.rejects(convertDocxForDifferential(Buffer.from('synthetic'), {
    engineeringMode: false, pythonExecutable: 'C:\\Python\\python.exe', runtimeRoot: 'C:\\runtime',
    spawn: fakeSpawn(), environment: {}
  }), (error) => error.code === 'CONVERTER_NOT_RELEASED');
}

async function productProjectionCase() {
  const { includeInProduct, includeInEngineering } = await import('../scripts/lib/product-files.mjs');
  for (const name of ['server/converters/markitdown/bridge.py',
    'server/converters/markitdown/runtime-contract.json',
    'server/converters/markitdown/differential-oracle.js']) {
    assert.strictEqual(includeInProduct(name), false, name);
    assert.strictEqual(includeInEngineering(name), true, name);
  }
}

(async () => {
  await testAsync('engineering bridge disables Python site startup and does not inherit host temp paths', engineeringBridgeCase);
  await testAsync('engineering oracle returns only private stdout and keeps product gate closed', oracleCase);
  await testAsync('disabled MarkItDown files cannot enter the current product ZIP', productProjectionCase);
  await done();
})();
