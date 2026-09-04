'use strict';

// VM-only launch capture: no worker, SEA, UI, parser or child is executed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSuite } = require('./helpers');
const { test, done, assert } = createSuite('Fixed background role launcher');
const source = fs.readFileSync(path.join(__dirname,
  '../plugins/data-secure/server/background-role-launcher.js'), 'utf8');
const targets = [
  ['windows-x64', 'win32', 'x64'], ['macos-x64', 'darwin', 'x64'],
  ['macos-arm64', 'darwin', 'arm64'], ['linux-x64', 'linux', 'x64']
];
const flags = {
  batch: '--datasecure-batch-worker', review: '--datasecure-review-worker',
  companion: '--datasecure-companion'
};
const overrides = ['execPath', 'server', 'networkDeny', 'spawn', 'forkProcess',
  'platform', 'arch', 'execArgv', 'stdio', 'cwd', 'shell', 'detached', 'serialization'];

function load(configuration = {}) {
  const target = configuration.target || targets[0];
  const targetPath = target[1] === 'win32' ? path.win32 : path.posix;
  const server = target[1] === 'win32' ? 'C:\\synthetic-package\\server' : '/synthetic-package/server';
  const command = target[1] === 'win32' ? 'C:\\synthetic-package\\bin\\datasecure.exe'
    : `/synthetic-package/server/runtime/${target[0]}/datasecure`;
  const state = { calls: [], resolutions: 0, events: [] };
  const child = { synthetic: true };
  function capture(kind, executable, args, options) {
    state.events.push(kind);
    state.calls.push({ kind, executable, args: Array.from(args),
      options: { ...options, stdio: Array.from(options.stdio),
        ...(options.execArgv ? { execArgv: Array.from(options.execArgv) } : {}) } });
    if (configuration.spawnError) throw new Error('private-package-path');
    return child;
  }
  const context = vm.createContext({
    module: { exports: {} }, __dirname: server,
    process: { execPath: command, platform: target[1], arch: target[2],
      env: { NODE_OPTIONS: '--require=private-parent-script', DATASECURE_SEA: '1' } },
    require(name) {
      if (name === 'node:path') return targetPath;
      if (name === 'node:child_process') return {
        spawn: (...args) => capture('spawn', ...args),
        fork: (...args) => capture('fork', ...args)
      };
      if (name === 'node:sea') return { isSea() {
        if (configuration.seaError) throw new Error('private-sea-error');
        return Object.hasOwn(configuration, 'sea') ? configuration.sea : true;
      } };
      if (name === './durable-runtime-cache') return {
        resolveDurableRuntimeRoot() { return configuration.durable || null; }
      };
      assert.strictEqual(name, './sea-parser-role');
      return { resolveSeaParserRole() {
        state.resolutions++;
        state.events.push('resolve');
        return configuration.resolve ? configuration.resolve(state)
          : { executable: targetPath.join(server, 'runtime', target[0], 'parser'), target: target[0] };
      } };
    }
  });
  vm.runInContext(source, context, { timeout: 1000 });
  return { launch: context.module.exports.launchBackgroundRole, state,
    server, command, targetPath, child };
}

function rejects(fn) {
  assert.throws(fn, error => error.code === 'SEA_BACKGROUND_ROLE_INVALID' &&
    error.message === 'SEA_BACKGROUND_ROLE_INVALID' && error.cause === undefined);
}

for (const target of targets) for (const role of Object.keys(flags)) {
  test(`Node ${target[0]} ${role} retains its fixed default launch`, () => {
    const f = load({ target, sea: false });
    const env = { HOME: 'synthetic-home', NODE_OPTIONS: 'preserved-by-node-contract' };
    assert.strictEqual(f.launch(role, { env }), f.child);
    assert.strictEqual(f.state.resolutions, 0);
    assert.strictEqual(f.state.calls.length, 1);
    const call = f.state.calls[0];
    assert.strictEqual(call.options.env, env);
    assert.strictEqual(call.options.windowsHide, true);
    if (role === 'companion') {
      assert.strictEqual(call.kind, 'spawn');
      assert.strictEqual(call.executable, f.command);
      assert.deepStrictEqual(call.args, [
        `--require=${f.targetPath.join(f.server, 'network-deny.cjs')}`,
        f.targetPath.join(f.server, 'companion', 'stdio-server.js')
      ]);
      assert.deepStrictEqual(call.options.stdio, ['pipe', 'pipe', 'ignore', 'pipe']);
      assert.strictEqual(call.options.shell, false);
      assert.strictEqual(call.options.detached, undefined);
    } else {
      assert.strictEqual(call.kind, 'fork');
      assert.strictEqual(call.executable, f.targetPath.join(f.server, 'gateway', `${role}-worker.js`));
      assert.deepStrictEqual(call.args, []);
      assert.deepStrictEqual(call.options.execArgv,
        [`--require=${f.targetPath.join(f.server, 'network-deny.cjs')}`]);
      assert.deepStrictEqual(call.options.stdio, ['ignore', 'ignore', 'ignore', 'ipc']);
      assert.strictEqual(call.options.detached, true);
      assert.strictEqual(call.options.serialization, 'json');
      assert.strictEqual(call.options.execPath, f.command);
    }
  });
}

for (const role of ['batch', 'review']) test(`Node ${role} preserves injected fork without forwarding extra options`, () => {
  const f = load({ sea: false });
  let capture;
  const child = {};
  const env = {};
  assert.strictEqual(f.launch(role, { env, execPath: 'ignored-executable', cwd: 'ignored-cwd',
    shell: true, stdio: 'inherit', execArgv: ['--inspect'], serialization: 'advanced',
    forkProcess(executable, args, options) { capture = { executable, args, options }; return child; }
  }), child);
  assert.strictEqual(f.state.calls.length, 0);
  assert.strictEqual(capture.executable, f.targetPath.join(f.server, 'gateway', `${role}-worker.js`));
  assert.strictEqual(capture.options.env, env);
  assert.deepStrictEqual(Object.keys(capture.options).sort(),
    ['detached', 'windowsHide', 'stdio', 'execArgv', 'execPath', 'env', 'serialization'].sort());
  assert.strictEqual(capture.options.serialization, 'json');
  assert.strictEqual(capture.options.execPath, 'ignored-executable');
});

test('Node roles use the durable projection after the temporary plugin tree is gone', () => {
  const targetPath = path.win32;
  const root = 'C:\\Users\\synthetic\\SecureDataMsg\\runtime-cache\\rc96';
  const executable = targetPath.join(root, 'runtime', 'datasecure-node.exe');
  const f = load({ sea: false, durable: { root, executable } });
  f.launch('batch', { env: {} });
  const call = f.state.calls[0];
  assert.strictEqual(call.executable, targetPath.join(root, 'server', 'gateway', 'batch-worker.js'));
  assert.strictEqual(call.options.execPath, executable);
  assert.deepStrictEqual(call.options.execArgv, [
    `--require=${targetPath.join(root, 'server', 'network-deny.cjs')}`
  ]);
});

test('Node companion preserves its existing command, preload and spawn test seams', () => {
  const f = load({ sea: false });
  let capture;
  const child = {};
  const env = {};
  assert.strictEqual(f.launch('companion', {
    execPath: 'test-node', server: 'test-server', networkDeny: 'test-deny', env,
    spawn(executable, args, options) { capture = { executable, args: Array.from(args), options }; return child; },
    arbitrary: 'not-forwarded', shell: true, detached: true
  }), child);
  assert.strictEqual(capture.executable, 'test-node');
  assert.deepStrictEqual(capture.args, ['--require=test-deny', 'test-server']);
  assert.deepStrictEqual(Object.keys(capture.options).sort(), ['stdio', 'windowsHide', 'shell', 'env'].sort());
  assert.strictEqual(capture.options.shell, false);
  assert.strictEqual(capture.options.env, env);
  assert.strictEqual(f.state.calls.length, 0);
});

for (const role of Object.keys(flags)) test(`Windows SEA ${role} selects exactly one fixed role flag`, () => {
  const f = load();
  assert.strictEqual(f.launch(role, { env: { HOME: 'synthetic-home' }, ignored: 'never-forwarded' }), f.child);
  assert.deepStrictEqual(f.state.events, ['resolve', 'resolve', 'spawn']);
  assert.strictEqual(f.state.calls.length, 1);
  const call = f.state.calls[0];
  assert.strictEqual(call.executable, f.command);
  assert.deepStrictEqual(call.args, [flags[role]]);
  assert.strictEqual(call.options.windowsHide, true);
  assert.strictEqual(call.options.shell, false);
  assert.deepStrictEqual({ ...call.options.env }, { HOME: 'synthetic-home' });
  assert.deepStrictEqual(Object.keys(call.options).sort(), (role === 'companion'
    ? ['stdio', 'windowsHide', 'shell', 'env']
    : ['detached', 'windowsHide', 'stdio', 'serialization', 'shell', 'env']).sort());
  assert.deepStrictEqual(call.options.stdio, role === 'companion'
    ? ['pipe', 'pipe', 'ignore', 'pipe'] : ['ignore', 'ignore', 'ignore', 'ipc']);
  assert.strictEqual(call.options.detached, role === 'companion' ? undefined : true);
  assert.strictEqual(call.options.serialization, role === 'companion' ? undefined : 'json');
});

for (const target of [...targets.slice(1), ['windows-arm64', 'win32', 'arm64']]) {
  test(`SEA ${target[0]} remains explicitly closed for all background roles`, () => {
    for (const role of Object.keys(flags)) {
      const f = load({ target });
      rejects(() => f.launch(role));
      assert.strictEqual(f.state.calls.length, 0);
    }
  });
}

test('missing or failed parser-role validation never reaches spawn or fallback', () => {
  for (const resolve of [() => null, () => { throw new Error('private-parser-path'); },
    state => state.resolutions === 1 ? {} : null,
    state => { if (state.resolutions === 2) throw new Error('private-changed-path'); return {}; }]) {
    for (const role of Object.keys(flags)) {
      const f = load({ resolve });
      rejects(() => f.launch(role));
      assert.strictEqual(f.state.calls.length, 0);
    }
  }
});

for (const key of overrides) test(`SEA rejects every defined ${key} override and reads a getter only once`, () => {
  for (const value of [null, false, 0, '', 'private-override', () => {}]) {
    const f = load();
    let reads = 0;
    const options = Object.defineProperty({}, key, { get() { reads++; return value; } });
    rejects(() => f.launch('batch', options));
    assert.strictEqual(reads, 1);
    assert.strictEqual(f.state.calls.length, 0);
  }
  const f = load();
  let reads = 0;
  const options = Object.defineProperty({}, key, { get() {
    reads++;
    return reads === 1 ? undefined : 'private-later-override';
  } });
  f.launch('companion', options);
  assert.strictEqual(reads, 1);
  assert.strictEqual(f.state.calls[0].executable, f.command);
  assert.deepStrictEqual(f.state.calls[0].args, [flags.companion]);
});

test('SEA rejects inherited overrides and hides getter exceptions', () => {
  for (const key of overrides) {
    const inherited = load();
    rejects(() => inherited.launch('review', Object.create({ [key]: 'private-override' })));
    assert.strictEqual(inherited.state.calls.length, 0);
    const throwing = load();
    rejects(() => throwing.launch('companion', Object.defineProperty({}, key, {
      get() { throw new Error('private-accessor-path'); }
    })));
    assert.strictEqual(throwing.state.calls.length, 0);
  }
});

test('only exact role strings are accepted without coercing caller input', () => {
  for (const sea of [true, false]) for (const role of [undefined, null, '', 'parser', 'Batch',
    '--datasecure-batch-worker', 'constructor', '__proto__', 'toString', [], 1,
    { toString() { throw new Error('must-not-coerce'); } }]) {
    const f = load({ sea });
    rejects(() => f.launch(role));
    assert.strictEqual(f.state.calls.length, 0);
  }
});

test('SEA environment removes all case variants of inherited Node controls without reading their getters', () => {
  const env = { PATH: 'allowed-path', EU_PRIVACY_TEST: 'allowed-value' };
  const blocked = ['NODE_OPTIONS', 'NODE_PATH', 'NODE_CHANNEL_FD',
    'NODE_CHANNEL_SERIALIZATION_MODE', 'ELECTRON_RUN_AS_NODE'];
  for (const key of blocked) for (const variant of [key, key.toLowerCase(), key[0] + key.slice(1).toLowerCase()]) {
    Object.defineProperty(env, variant, { enumerable: true, get() {
      throw new Error('blocked-environment-must-not-be-read');
    } });
  }
  for (const role of Object.keys(flags)) {
    const f = load();
    f.launch(role, { env });
    assert.deepStrictEqual({ ...f.state.calls[0].options.env },
      { PATH: 'allowed-path', EU_PRIVACY_TEST: 'allowed-value' });
    assert.notStrictEqual(f.state.calls[0].options.env, env);
    assert.strictEqual(Object.keys(env).length, 17);
  }
});

test('SEA reads environment once and validates again after caller-owned getters', () => {
  const f = load();
  let envReads = 0;
  let valueReads = 0;
  const env = Object.defineProperty({}, 'HOME', { enumerable: true, get() {
    valueReads++;
    f.state.events.push('environment-value');
    return 'synthetic-home';
  } });
  const options = Object.defineProperty({}, 'env', { get() {
    envReads++;
    f.state.events.push('environment');
    return env;
  } });
  f.launch('batch', options);
  assert.strictEqual(envReads, 1);
  assert.strictEqual(valueReads, 1);
  assert.deepStrictEqual(f.state.events, ['resolve', 'environment', 'environment-value', 'resolve', 'spawn']);
  const changed = load({ resolve: state => state.resolutions === 2 ? null : {} });
  rejects(() => changed.launch('companion', options));
  assert.strictEqual(changed.state.calls.length, 0);
});

test('SEA never inherits process.env when an allowlisted environment is absent', () => {
  const f = load();
  f.launch('batch');
  assert.deepStrictEqual({ ...f.state.calls[0].options.env }, {});
});

test('SEA ignores unknown option getters and normalizes failures without private details', () => {
  const f = load();
  f.launch('review', Object.defineProperty({}, 'unknown', { get() {
    throw new Error('unknown-option-must-not-be-read');
  } }));
  assert.strictEqual(f.state.calls.length, 1);
  for (const configuration of [{ spawnError: true }, { seaError: true }, { sea: undefined },
    { sea: null }, { sea: 'true' }]) rejects(() => load(configuration).launch('batch'));
  rejects(() => load().launch('batch', Object.defineProperty({}, 'env', { get() {
    throw new Error('private-environment-path');
  } })));
});

done();
