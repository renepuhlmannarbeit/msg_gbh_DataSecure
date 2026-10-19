'use strict';

// The actual production module runs with modeled Darwin host facts and real
// temporary parent/leaf bindings. Resolver/supervisor outcomes and the child
// transport are explicit test adapters: this is NOT a native macOS exec proof.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { test } = require('node:test');
const runtimeFile = path.resolve(__dirname, '../plugins/data-secure/server/runtime.js');
const runtimeSource = fs.readFileSync(runtimeFile, 'utf8');
const productionRequire = createRequire(runtimeFile);
const layout = productionRequire('./standalone/macos-bundle-layout');
const { createContentGraph } = productionRequire('./content-graph');
const { positiveProfileFixtures } = require('../docs/acceptance/UAT_TEST_KIT/tools/generate-synthetic-uat-fixtures');
const isolation = error => error?.code === 'PARSER_ISOLATION_FAILED';

function fixture(model = {}) {
  const scope = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-legacy-mac-routing-'));
  const server = path.join(scope, 'Leerzeichen ünicode.app', 'Contents', 'Resources', 'server');
  const arch = model.arch || 'arm64';
  const bundle = layout.bundleContext(server, 'darwin', arch);
  const node = layout.roleFile(bundle, 'conversion_node');
  const supervisor = layout.roleFile(bundle, 'sandbox');
  const manifest = path.join(server, 'standalone', 'conversion-runtime', 'RUNTIME.json');
  const checksum = path.join(server, ...bundle.roles.sandbox.checksum.split('/'));
  for (const file of [node, supervisor, manifest, checksum]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'synthetic-role-bytes');
  }
  const events = [], spawns = [], children = [], received = [];
  let resolverCalls = 0, supervisorCalls = 0, sourceInspections = 0;
  const fakeProcess = { platform: model.platform || 'darwin', arch, execPath: bundle.core,
    versions: process.versions, env: model.env || { DATASECURE_NATIVE_EXPORT_CHANNEL: '1' } };
  const serverDirectory = model.unbundled ? path.dirname(runtimeFile) : server;
  const io = Object.create(fs);
  const opened = [];
  io.openSync = (...args) => { const fd = fs.openSync(...args); opened.push(fd); return fd; };
  const value = { scope, server, bundle, node, supervisor, manifest, checksum, events, spawns, children, received, opened };
  function spawn(command, args, options) {
    events.push('spawn');
    spawns.push({ command, args: Array.from(args), options });
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.killed = false;
    child.stdin.on('data', chunk => received.push(Buffer.from(chunk)));
    child.kill = () => {
      child.killed = true;
      if (!model.unconfirmedClose) setImmediate(() => child.emit('close', null));
      return true;
    };
    if (model.incompleteInput) child.stdin.end = () => setImmediate(() => child.stdin.emit('error', new Error('PRIVATE-EPIPE')));
    children.push(child);
    setImmediate(() => {
      if (model.hang || child.killed) return;
      const extension = spawns.at(-1).args.find(arg => /^\.(?:txt|md|markdown|csv|docx)$/u.test(arg)) || '.txt';
      const response = model.response || { schema: 'data-secure-parser-result/1', ok: true,
        result: { markdown: 'safe', attachments: [], warnings: [], content_graph: createContentGraph('safe', [], extension) } };
      child.stdout.end(JSON.stringify(response));
      child.emit('close', model.exitCode ?? 0);
    });
    return child;
  }
  const load = name => {
    if (name === 'fs') return io;
    if (name === 'child_process') return { ...require('node:child_process'), spawn };
    if (name === './standalone/macos-bundle-layout') return { ...layout,
      bundleContext: directory => layout.bundleContext(directory, fakeProcess.platform, fakeProcess.arch) };
    if (name === './sea-parser-role') return { resolveSeaParserRole: () => model.seaRole || null };
    if (name === './core/macos-static-ownership-guard') return { assertParserCore() {
      events.push('unbundled-parser-guard');
      if (model.coreOutsideBundle) throw Object.assign(new Error('closed'), { code: 'PARSER_ISOLATION_FAILED' });
    } };
    if (name === './standalone/conversion-runtime-resolver') return { resolveConversionRuntime() {
      events.push('resolver'); resolverCalls++;
      if (model.resolverFailure === resolverCalls) throw new Error('PRIVATE-RESOLVER-PATH');
      return { node: model.changedNodeAt === resolverCalls ? bundle.core : node,
        root: path.dirname(manifest) };
    } };
    if (name === './posix-supervisor') return { verifyPosixSupervisor() {
      events.push('supervisor'); supervisorCalls++;
      return model.missingSupervisorAt === supervisorCalls ? { available: false, reason: 'integrity_failed' }
        : { available: true, executable: model.changedSupervisorAt === supervisorCalls ? bundle.core : supervisor };
    } };
    if (name === './resource-limits') {
      const limits = productionRequire(name);
      return { ...limits, assertSourceSize(...args) {
        const result = limits.assertSourceSize(...args); sourceInspections++;
        model.onSourceInspection?.(value); return result;
      } };
    }
    if (name === './native-launcher') return { verifyNativeLauncherArtifact: executable => executable };
    return productionRequire(name);
  };
  const module = { exports: {} };
  const context = { require: load, module, exports: module.exports, __dirname: serverDirectory,
    __filename: runtimeFile, process: fakeProcess, Buffer,
    setTimeout: (callback, milliseconds) => setTimeout(callback, model.shortTimers
      ? milliseconds === 50000 ? 5 : milliseconds === 10000 ? 30 : milliseconds : milliseconds), clearTimeout };
  vm.runInNewContext(runtimeSource, context, { filename: runtimeFile, timeout: 5000 });
  return Object.assign(value, { convert: module.exports.convertDocument,
    counts: () => ({ resolverCalls, supervisorCalls, sourceInspections }),
    cleanup() {
      assert.equal(path.dirname(scope), os.tmpdir());
      assert.ok(path.basename(scope).startsWith('datasecure-legacy-mac-routing-'));
      fs.rmSync(scope, { recursive: true, force: true });
    } });
}

const input = (extension = 'txt') => ({ inputBuffer: Buffer.from('PRIVATE synthetic input'), sourceName: `PRIVATE-source.${extension}` });

test('VM: actual production Darwin routing keeps the legacy protocol and both fixed roles for ARM/x64', async () => {
  for (const arch of ['arm64', 'x64']) for (const env of [{ DATASECURE_NATIVE_EXPORT_CHANNEL: '1' }, {}]) {
    const value = fixture({ arch, env });
    try {
      for (const extension of ['txt', 'md', 'markdown', 'csv', 'docx']) {
        const options = extension === 'docx' ? { inputBuffer: positiveProfileFixtures().get('personnel-profile.docx'),
          sourceName: 'PRIVATE.docx', omitDocxHeaderFooter: true } : input(extension);
        const receivedBefore = value.received.length;
        assert.equal((await value.convert('PRIVATE-opaque-artifact', options)).markdown, 'safe');
        assert.deepEqual(Buffer.concat(value.received.slice(receivedBefore)), options.inputBuffer);
        const launch = value.spawns.at(-1);
        assert.equal(launch.command, value.supervisor);
        assert.deepEqual(launch.args.slice(0, 8), ['--memory-mib', '768', '--cpu-ms', '40000', '--wall-ms', '45000', '--', value.node]);
        assert.deepEqual(launch.args.slice(8), ['--permission', `--allow-fs-read=${value.server}`,
          `--require=${path.join(value.server, 'network-deny.cjs')}`, '--disable-proto=throw', '--max-old-space-size=384',
          path.join(value.server, 'parser-worker.js'), `.${extension}`, '0', ...(extension === 'docx' ? ['omit-docx-header-footer'] : [])]);
        assert.equal(JSON.stringify(launch.options.env), '{}');
        assert.equal(launch.options.shell, false);
        assert.equal(JSON.stringify(launch.options.stdio), '["pipe","pipe","ignore"]');
        assert.doesNotMatch(JSON.stringify(launch), /PRIVATE|--allow-worker|--allow-addons|--allow-fs-write|--allow-child-process/u);
      }
      assert.deepEqual(value.counts(), { resolverCalls: 10, supervisorCalls: 10, sourceInspections: 5 });
      assert.ok(!value.events.includes('unbundled-parser-guard'));
      assert.ok(Buffer.concat(value.received).includes(Buffer.from('PRIVATE synthetic input')));
    } finally { value.cleanup(); }
  }
});

test('all caller execution overrides, inherited overrides, accessors and proxies stop before role/source work', async () => {
  const fields = ['execPath', 'platform', 'arch', 'nodeVersion', 'launcherPath', 'launcherBytes',
    'launcherExpectedSha256', 'existsSync', 'spawn', 'spawnSync', 'posixSupervisorPath', 'posixSupervisorBase', 'hostProbeStatus'];
  for (const field of fields) {
    const value = fixture();
    try {
      for (const options of [{ ...input(), [field]: 'PRIVATE' }, Object.assign(Object.create({ [field]: undefined }), input())])
        await assert.rejects(value.convert('PRIVATE', options), isolation);
      assert.deepEqual(value.counts(), { resolverCalls: 0, supervisorCalls: 0, sourceInspections: 0 });
      assert.equal(value.spawns.length, 0);
    } finally { value.cleanup(); }
  }
  const value = fixture();
  try {
    let traps = 0;
    const accessor = { ...input() }; Object.defineProperty(accessor, 'spawn', { get() { traps++; throw Error('PRIVATE'); } });
    const ownProxy = new Proxy(input(), { ownKeys() { traps++; throw Error('PRIVATE'); } });
    const parentProxy = Object.assign(Object.create(new Proxy({}, { getPrototypeOf() { traps++; throw Error('PRIVATE'); } })), input());
    for (const options of [accessor, ownProxy, parentProxy]) await assert.rejects(value.convert('PRIVATE', options), isolation);
    assert.equal(traps, 0);
    assert.equal(value.spawns.length, 0);
  } finally { value.cleanup(); }
});

test('missing/foreign roles and failed repeat verification never fall back to Core or a permission-only process', async () => {
  for (const model of [{ resolverFailure: 1 }, { resolverFailure: 2 }, { missingSupervisorAt: 1 },
    { missingSupervisorAt: 2 }, { changedNodeAt: 1 }, { changedNodeAt: 2 },
    { changedSupervisorAt: 1 }, { changedSupervisorAt: 2 }, { seaRole: { executable: 'PRIVATE-SEA' } }]) {
    const value = fixture(model);
    try {
      await assert.rejects(value.convert('PRIVATE', input()), error => isolation(error) && !/PRIVATE/u.test(error.message));
      assert.equal(value.spawns.length, 0);
    } finally { value.cleanup(); }
  }
});

test('missing or hardlinked original role leaves stop before either verifier can authorize a launch', async () => {
  for (const field of ['node', 'manifest', 'supervisor', 'checksum']) for (const action of ['missing', 'hardlinked']) {
    const value = fixture();
    try {
      if (action === 'missing') fs.unlinkSync(value[field]);
      else fs.linkSync(value[field], path.join(value.scope, 'owned-extra-link'));
      await assert.rejects(value.convert('PRIVATE', input()), isolation);
      assert.equal(value.counts().resolverCalls, 0);
      assert.equal(value.spawns.length, 0);
    } finally { value.cleanup(); }
  }
});

test('original converter, manifest, supervisor, checksum and parent bindings survive until the final spawn gate', async () => {
  for (const field of ['node', 'manifest', 'supervisor', 'checksum', 'parent']) {
    const value = fixture({ onSourceInspection(state) {
      if (field === 'parent') {
        const directory = path.dirname(state.node);
        fs.renameSync(directory, `${directory}-retired`);
        fs.mkdirSync(directory);
        fs.copyFileSync(path.join(`${directory}-retired`, path.basename(state.node)), state.node);
        fs.copyFileSync(path.join(`${directory}-retired`, path.basename(state.supervisor)), state.supervisor);
      } else fs.appendFileSync(state[field], '-changed');
    } });
    try {
      await assert.rejects(value.convert('PRIVATE', input()), isolation);
      assert.equal(value.spawns.length, 0);
      assert.equal(value.counts().resolverCalls, 1, 'changed original binding must fail before fresh resolver adoption');
    } finally { value.cleanup(); }
  }
});

test('FD source remains inherited stdin, is closed on a refused final recheck, and is never put in argv', async () => {
  for (const resolverFailure of [undefined, 2]) {
    const value = fixture({ resolverFailure });
    try {
      const file = path.join(value.scope, 'PRIVATE-original.txt'); fs.writeFileSync(file, 'PRIVATE input');
      if (resolverFailure) await assert.rejects(value.convert(file), isolation);
      else {
        assert.equal((await value.convert(file)).markdown, 'safe');
        assert.equal(typeof value.spawns[0].options.stdio[0], 'number');
        assert.doesNotMatch(JSON.stringify(value.spawns[0]), /PRIVATE/u);
      }
      assert.equal(value.opened.length, 1);
      assert.throws(() => fs.fstatSync(value.opened[0]), { code: 'EBADF' });
      assert.equal(fs.readFileSync(file, 'utf8'), 'PRIVATE input');
    } finally { value.cleanup(); }
  }
});

test('early abort, PDF disguise, unsupported format and source-size limits cannot start a parser', async () => {
  const value = fixture();
  try {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(value.convert('PRIVATE', { ...input(), signal: controller.signal }), { code: 'REQUEST_CANCELLED' });
    assert.equal(value.counts().resolverCalls, 0);
    await assert.rejects(value.convert('PRIVATE', { inputBuffer: Buffer.from('%PDF-1.7\n'), sourceName: 'PRIVATE.txt' }), { code: 'PDF_COVERAGE_UNVERIFIED' });
    await assert.rejects(value.convert('PRIVATE', input('pdf')), { code: 'PDF_COVERAGE_UNVERIFIED' });
    await assert.rejects(value.convert('PRIVATE', input('exe')), { code: 'FORMAT_COVERAGE_UNVERIFIED' });
    await assert.rejects(value.convert('PRIVATE', { inputBuffer: Buffer.alloc(1_500_001, 0x61), sourceName: 'PRIVATE.csv' }), { code: 'INPUT_TOO_LARGE' });
    assert.equal(value.spawns.length, 0);
  } finally { value.cleanup(); }
});

test('legacy negative schema, exact exit, format graph and partial stdin gates remain authoritative', async () => {
  const negative = { schema: 'data-secure-parser-result/1', ok: false, error: 'parse_failed' };
  const foreignGraph = { schema: 'data-secure-parser-result/1', ok: true,
    result: { markdown: 'safe', warnings: [], attachments: [], content_graph: createContentGraph('safe', [], '.docx') } };
  for (const [model, code] of [[{ response: negative, exitCode: 2 }, 'PARSE_FAILED'],
    [{ response: { ...negative, private: 'PRIVATE' }, exitCode: 2 }, undefined],
    [{ response: { schema: 'datasecure-conversion-response/1', ok: true, result: {} } }, undefined],
    [{ response: foreignGraph }, 'PARSE_FAILED'], [{ exitCode: 125 }, 'PARSER_RESOURCE_LIMIT'],
    [{ exitCode: 132 }, 'PARSER_ISOLATION_FAILED'], [{ incompleteInput: true }, 'PARSER_INPUT_INCOMPLETE']]) {
    const value = fixture(model);
    try { await assert.rejects(value.convert('PRIVATE', input()), error => error?.code === code && !/PRIVATE/u.test(error.message)); }
    finally { value.cleanup(); }
  }
});

test('running abort/deadline wait for child close; unconfirmed termination stays a closed failure', async () => {
  for (const mode of ['abort', 'timeout', 'unconfirmed']) {
    const value = fixture({ hang: true, shortTimers: true, unconfirmedClose: mode === 'unconfirmed' });
    try {
      const controller = new AbortController();
      const pending = value.convert('PRIVATE', { ...input(), signal: controller.signal });
      if (mode === 'abort') controller.abort();
      await assert.rejects(pending, { code: mode === 'abort' ? 'REQUEST_CANCELLED'
        : mode === 'timeout' ? 'PARSER_TIMEOUT' : 'PARSER_ISOLATION_FAILED' });
      assert.equal(value.children[0].killed, true);
    } finally { value.cleanup(); }
  }
});

test('unbundled Darwin keeps source compatibility but never permits native/Core parsing', async () => {
  for (const model of [{ env: {} }, { env: { DATASECURE_NATIVE_EXPORT_CHANNEL: '1' } }, { env: {}, coreOutsideBundle: true }]) {
    const value = fixture({ ...model, unbundled: true });
    try {
      if (model.env.DATASECURE_NATIVE_EXPORT_CHANNEL || model.coreOutsideBundle)
        await assert.rejects(value.convert('PRIVATE', input()), isolation);
      else assert.equal((await value.convert('PRIVATE', input())).markdown, 'safe');
      assert.equal(value.counts().resolverCalls, 0);
      if (model.env.DATASECURE_NATIVE_EXPORT_CHANNEL || model.coreOutsideBundle) assert.equal(value.spawns.length, 0);
    } finally { value.cleanup(); }
  }
});

test('Windows/Linux model facts do not select the Mac converter or override their established launch contract', async () => {
  for (const platform of ['win32', 'linux']) {
    const value = fixture({ platform, arch: 'x64', env: {} });
    try {
      assert.equal((await value.convert('PRIVATE', input())).markdown, 'safe');
      assert.equal(value.counts().resolverCalls, 0);
      assert.ok(!value.spawns[0].args.includes(value.node));
    } finally { value.cleanup(); }
  }
});
