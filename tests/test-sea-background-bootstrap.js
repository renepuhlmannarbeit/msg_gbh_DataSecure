'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSuite } = require('./helpers');

const { test, testAsync, done, assert } = createSuite('SEA background bootstrap (VM contracts, not native IPC evidence)');
const template = fs.readFileSync(path.join(__dirname, '../native/sea/bootstrap.cjs'), 'utf8');
const fixturePath = path.win32;
const executable = 'C:\\sea-fixture\\bin\\datasecure-mcp.exe';
const serverRoot = 'C:\\sea-fixture\\server';
const mcpEntry = fixturePath.join(serverRoot, 'index.js');
const roles = [
  ['--datasecure-batch-worker', 'gateway/batch-worker.js'],
  ['--datasecure-review-worker', 'gateway/review-worker.js'],
  ['--datasecure-companion', 'companion/stdio-server.js']
];

// Execute the actual build template with only its three build markers replaced.
// No product worker, real filesystem mutation, UI, socket, or child is started.
// Real NODE_CHANNEL_FD initialization and detached lifetime need native tests.
function run(args = [], options = {}) {
  const target = options.target || 'windows-x64';
  const parserRole = Object.hasOwn(options, 'parserRole') ? options.parserRole : {
    schema: 'datasecure-sea-parser-role/v1', target, node_version: '22.23.2',
    bytes: 1, sha256: 'a'.repeat(64), server_files: [{ path: 'parser-worker.js', sha256: 'b'.repeat(64) }]
  };
  const source = template.replace('__DATASECURE_TARGET__', target)
    .replace('__DATASECURE_NODE_VERSION__', '22.23.2')
    .replace("'__DATASECURE_PARSER_ROLE_JSON__'", JSON.stringify(JSON.stringify(parserRole)));
  const state = { imports: [], entries: [], stats: [], requireBases: [], events: [], stdout: '', stderr: '' };
  const processStub = {
    argv: [executable, executable, ...args], execPath: executable,
    env: { ...(options.env || {}) }, connected: true, channel: {}, send() {},
    stdout: { write(value) { state.stdout += value; } },
    stderr: { write(value) { state.stderr += value; } },
    ...(options.process || {})
  };
  const sandbox = { process: processStub };
  function localRequire(name) {
    state.imports.push(name);
    if (name === './sea-batch-probe.js') return {
      runSeaBatchProbe() {
        state.events.push('acceptance-probe');
        if (options.batchFailure) return Promise.reject(options.batchFailure);
        return Promise.resolve({ schema: 'synthetic-bootstrap-result', privacy_release_verified: false });
      }
    };
    if (name === './sea-parser-role.js') return {
      resolveSeaParserRole() {
        state.events.push('parser-verified');
        const descriptor = Object.getOwnPropertyDescriptor(sandbox, '__DATASECURE_PARSER_ROLE__');
        if (!descriptor || !descriptor.value || options.parserThrows) throw new Error('private parser failure');
        assert.equal(descriptor.writable, false);
        assert.equal(descriptor.configurable, false);
        assert.equal(Object.isFrozen(descriptor.value), true);
        assert.equal(Object.isFrozen(descriptor.value.server_files), true);
        for (const file of descriptor.value.server_files) assert.equal(Object.isFrozen(file), true);
        return Object.hasOwn(options, 'parserResult') ? options.parserResult : { executable: 'fixed-parser' };
      }
    };
    if (name === './network-deny.cjs') {
      state.events.push('network-guard');
      if (options.guardThrows) throw new Error('private guard failure');
      if (options.guardDescriptor !== null) {
        Object.defineProperty(sandbox, '__DATASECURE_NETWORK_DENY_ACTIVE__', options.guardDescriptor || { value: true });
      }
      return {};
    }
    const validEntries = [mcpEntry, ...roles.map(([, file]) => fixturePath.join(serverRoot, file))];
    if (!validEntries.includes(name)) throw new Error(`unexpected import: ${name}`);
    state.events.push('entry');
    state.entries.push(name);
    if (name !== mcpEntry) {
      const marker = Object.getOwnPropertyDescriptor(sandbox, '__DATASECURE_NETWORK_DENY_ACTIVE__');
      assert.equal(marker?.value, true);
      assert.equal(marker.writable, false);
      assert.equal(marker.configurable, false);
      assert.equal(state.events[0], 'parser-verified');
      assert.equal(state.events[1], 'network-guard');
    }
    return {};
  }
  sandbox.require = (name) => {
    if (name === 'node:path') return fixturePath;
    if (name === 'node:sea') return { isSea: () => Object.hasOwn(options, 'sea') ? options.sea : true };
    if (name === 'node:module') return {
      createRequire(base) { state.requireBases.push(base); return localRequire; }
    };
    if (name === 'node:fs') return {
      lstatSync(filename) {
        state.stats.push(filename);
        const change = options.stats?.[filename] || {};
        if (change.throw) throw new Error('private stat failure');
        const isFile = filename.endsWith('.js');
        return {
          isFile: () => change.file ?? isFile,
          isDirectory: () => change.directory ?? !isFile,
          isSymbolicLink: () => change.link === true,
          nlink: Object.hasOwn(change, 'nlink') ? change.nlink : 1
        };
      },
      realpathSync(filename) { return options.realpaths?.[filename] || filename; }
    };
    throw new Error(`unexpected builtin: ${name}`);
  };
  vm.runInNewContext(source, sandbox, { filename: 'native/sea/bootstrap.cjs', timeout: 1000 });
  return { ...state, process: processStub, sandbox };
}

function refused(result, beforeImports = false, message = 'DATASECURE_RUNTIME_START_FAILED\n') {
  assert.equal(result.process.exitCode, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, message);
  assert.deepEqual(result.entries, []);
  if (beforeImports) {
    assert.deepEqual(result.imports, []);
    assert.deepEqual(result.requireBases, []);
    assert.deepEqual(result.stats, []);
  }
}

for (const [flag, entry] of roles) {
  test(`${flag}: fixed entry after frozen parser metadata and immutable network guard`, () => {
    const result = run([flag]);
    assert.equal(result.process.exitCode, undefined);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, '');
    assert.deepEqual(result.imports, ['./sea-parser-role.js', './network-deny.cjs', fixturePath.join(serverRoot, entry)]);
    assert.deepEqual(result.requireBases, [mcpEntry]);
    assert.deepEqual(result.events, ['parser-verified', 'network-guard', 'entry']);
    assert.equal(result.process.env.DATASECURE_SELF_CONTAINED_RUNTIME, '1');
    assert.equal(result.process.env.DATASECURE_RUNTIME_TARGET, 'windows-x64');
  });

  test(`${flag}: no non-SEA or POSIX dispatch before filesystem/module access`, () => {
    refused(run([flag], { sea: false }), true);
    for (const target of ['linux-x64', 'macos-x64', 'macos-arm64']) refused(run([flag], { target }), true);
  });

  test(`${flag}: missing or failed parser binding prevents guard and role import`, () => {
    for (const options of [{ parserRole: null }, { parserThrows: true }, { parserResult: null }]) {
      const result = run([flag], options);
      refused(result);
      assert.deepEqual(result.imports, ['./sea-parser-role.js']);
    }
  });

  test(`${flag}: linked, hardlinked, absent and non-file role entries are refused`, () => {
    const filename = fixturePath.join(serverRoot, entry);
    for (const change of [{ link: true }, { nlink: 2 }, { nlink: 0 }, { file: false }, { throw: true }]) {
      const result = run([flag], { stats: { [filename]: change } });
      refused(result);
      assert.deepEqual(result.imports, ['./sea-parser-role.js']);
    }
    const directory = fixturePath.dirname(filename);
    for (const change of [{ link: true }, { directory: false }, { throw: true }]) {
      const result = run([flag], { stats: { [directory]: change } });
      refused(result);
      assert.deepEqual(result.imports, ['./sea-parser-role.js']);
    }
  });

  test(`${flag}: absent, false, accessor, writable or configurable guard marker fails closed`, () => {
    for (const guardDescriptor of [null, { value: false }, { value: true, writable: true },
      { value: true, configurable: true }, { get() { return true; } }]) {
      const result = run([flag], { guardDescriptor });
      refused(result);
      assert.deepEqual(result.imports, ['./sea-parser-role.js', './network-deny.cjs']);
    }
    refused(run([flag], { guardThrows: true }));
  });
}

test('batch/review require all three live IPC indicators before any filesystem/module access', () => {
  for (const [flag] of roles.slice(0, 2)) {
    for (const process of [{ send: undefined }, { send: true }, { channel: undefined },
      { channel: null }, { connected: false }, { connected: undefined }, { connected: 'true' }]) {
      refused(run([flag], { process }), true);
    }
  }
});

test('companion retains its separate FD3 bootstrap and does not require Node IPC', () => {
  const result = run(['--datasecure-companion'], { process: { send: undefined, channel: undefined, connected: false } });
  assert.equal(result.process.exitCode, undefined);
  assert.deepEqual(result.entries, [fixturePath.join(serverRoot, 'companion/stdio-server.js')]);
});

test('Node flags, script paths, unknown names and all additional arguments are rejected', () => {
  const invalid = [
    ['--require=evil.cjs'], ['--eval=evil'], ['-e', 'evil'], ['--inspect'], ['--permission'],
    ['C:\\evil\\worker.js'], ['gateway/batch-worker.js'], ['../server/index.js'],
    ['--datasecure-worker'], ['--datasecure-batch-worker=review'], ['batch'], ['__proto__'],
    ['constructor'], ['toString'], ['--'], ['']
  ];
  for (const [flag] of roles) {
    for (const extra of ['--require=evil.cjs', 'C:\\evil\\worker.js', '--datasecure-companion', '']) invalid.push([flag, extra]);
    invalid.push(['--', flag]);
  }
  invalid.push(['--datasecure-runtime-probe', 'extra']);
  for (const args of invalid) refused(run(args), true, 'DATASECURE_RUNTIME_ARGUMENTS_INVALID\n');
});

test('environment role/path suggestions cannot redirect a fixed background dispatch', () => {
  const result = run(['--datasecure-batch-worker'], { env: {
    DATASECURE_ROLE: 'companion', DATASECURE_ENTRY: 'C:\\evil\\entry.js',
    DATASECURE_RUNTIME_TARGET: 'linux-x64', DATASECURE_SELF_CONTAINED_RUNTIME: '0'
  } });
  assert.deepEqual(result.entries, [fixturePath.join(serverRoot, 'gateway/batch-worker.js')]);
  assert.equal(result.process.env.DATASECURE_RUNTIME_TARGET, 'windows-x64');
});

test('normal argument-free MCP dispatch still requires only the fixed inspected entry', () => {
  for (const parserRole of [null, { server_files: [] }]) {
    const result = run([], { parserRole, process: { send: undefined, channel: undefined, connected: false } });
    assert.equal(result.process.exitCode, undefined);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.deepEqual(result.imports, [mcpEntry]);
    assert.deepEqual(result.events, ['entry']);
    assert.deepEqual(result.stats, [mcpEntry]);
  }
});

test('normal MCP entry remains rejected when symlinked, non-file or resolved outside its root', () => {
  for (const options of [{ stats: { [mcpEntry]: { link: true } } },
    { stats: { [mcpEntry]: { file: false } } }, { realpaths: { [mcpEntry]: 'C:\\evil\\index.js' } }]) {
    const result = run([], options);
    refused(result);
    assert.deepEqual(result.imports, []);
  }
});

test('runtime probe remains content-free and does not inspect or import the product tree', () => {
  for (const [target, sea] of [['windows-x64', true], ['linux-x64', false]]) {
    const result = run(['--datasecure-runtime-probe'], { target, sea, parserRole: null });
    assert.equal(result.process.exitCode, undefined);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), {
      schema: 'datasecure-sea-runtime-probe/v1', target, node_version: '22.23.2', sea
    });
    assert.deepEqual(result.imports, []);
    assert.deepEqual(result.stats, []);
    assert.deepEqual(result.requireBases, []);
    assert.deepEqual(result.process.env, {});
  }
});

const acceptanceFlag = '--datasecure-batch-acceptance-probe';
test('batch acceptance requires native Windows and live IPC before filesystem access', () => {
  for (const options of [{ sea: false }, { target: 'linux-x64' }, { target: 'macos-arm64' },
    { process: { send: undefined } }, { process: { channel: null } }, { process: { connected: false } }]) {
    refused(run([acceptanceFlag], options), true);
  }
});
test('batch acceptance rejects every extra argument and cannot select a script', () => {
  for (const extra of ['', 'private.docx', '--eval=code', '--datasecure-batch-worker']) {
    refused(run([acceptanceFlag, extra]), true, 'DATASECURE_RUNTIME_ARGUMENTS_INVALID\n');
  }
});

async function acceptanceTests() {
  // Flush the actual bootstrap promise chain; no native worker or keyring runs.
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await testAsync('batch acceptance delegates only after parser binding without importing MCP or gateway', async () => {
    const result = run([acceptanceFlag]);
    await settle();
    assert.deepEqual(result.events, ['parser-verified', 'acceptance-probe']);
    assert.deepEqual(result.imports, ['./sea-parser-role.js', './sea-batch-probe.js']);
    assert.equal(result.process.exitCode, undefined);
    assert.equal(result.entries.length, 0);
    // The probe, not bootstrap, validates scope/ack before installing network deny.
  });
  await testAsync('failed parser binding never imports batch acceptance module', async () => {
    const result = run([acceptanceFlag], { parserThrows: true });
    await settle();
    assert.deepEqual(result.imports, ['./sea-parser-role.js']);
    assert.equal(result.process.exitCode, 2);
    assert.equal(result.entries.length, 0);
  });
  await testAsync('acceptance failure reports only fixed codes and no assumed cleanup', async () => {
    // Capture async writes through the live process streams, not copied strings.
    for (const [error, expectedCode, cleanup] of [
      [new Error('private-path-or-token'), 'SEA_BATCH_PROBE_FAILED', false],
      [Object.assign(new Error('SEA_BATCH_CLEANUP_PENDING'), { cleanupSafe: false }), 'SEA_BATCH_CLEANUP_PENDING', false],
      [Object.assign(new Error('SEA_BATCH_CRASH_POINT_NOT_REACHED'), { cleanupSafe: true }), 'SEA_BATCH_CRASH_POINT_NOT_REACHED', true]
    ]) {
      let output = '', errors = '';
      const result = run([acceptanceFlag], { batchFailure: error, process: {
        stdout: { write(value) { output += value; } }, stderr: { write(value) { errors += value; } }
      } });
      await settle();
      assert.equal(errors, '');
      assert.equal(result.process.exitCode, 2);
      assert.deepEqual(JSON.parse(output), { schema: 'datasecure-sea-batch-probe/v1', ok: false,
        error: expectedCode, cleanup_safe: cleanup, privacy_release_verified: false });
    }
  });
  done();
}
acceptanceTests().catch(error => { console.error(error); process.exitCode = 1; });
