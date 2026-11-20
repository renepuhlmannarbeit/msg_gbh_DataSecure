'use strict';

// Source bootstrap controls only. No product module, test parent, worker, shell
// or native platform code is loaded. The three OS branches are controlled VM
// models, not native Windows/macOS/Linux acceptance.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createSuite } = require('./helpers');
const suite = createSuite('Test-parent namespace bootstrap contracts');
const { test, assert } = suite;
const contracts = JSON.parse(fs.readFileSync(path.join(__dirname, 'lib/test-root-bootstrap-contracts.json'), 'utf8'));
assert.strictEqual(contracts.schema, 'datasecure-test-root-bootstrap-contracts/2');
assert.strictEqual(contracts.scopes.length, 28);
function read(file) { return fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replaceAll('\r\n', '\n'); }
function one(source, text) {
  const index = source.indexOf(text);
  assert.ok(text && index >= 0 && index === source.lastIndexOf(text), 'one exact source fragment required');
  return index;
}
function section(source, start, end) { return source.slice(one(source, start), one(source, end)); }
const runtime = section(read('plugins/data-secure/server/runtime.js'),
  'function isClaudeTemporaryLocalData(', '// Text processing has no end-user-installed dependency.');
const common = read('plugins/data-secure/server/gateway/common.js');
const privacy = common.split('\n').filter(line => /^function (?:configuredPrivacyRoot|privacyRoot)\(/u.test(line)).join('\n');
assert.strictEqual(privacy.split('\n').length, 2);
const configuration = section(read('plugins/data-secure/server/gateway/root-boundary.js'),
  'function rootConfiguration(', 'function comparisonPath(');

// Real fs is used only for this newly acquired synthetic sentinel. All VM fs
// operations are inert or refused, including attempts to inspect a real home.
const physical = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-root-bootstrap-')));
const foreign = path.join(physical, 'synthetic-foreign');
fs.mkdirSync(foreign, { mode: 0o700 });
const leaves = ['cowork-results', 'OneDrive - Synthetic', 'data'];
const sentinelBytes = Buffer.from('Synthetic namespace sentinel: ÄÖÜß');
for (const name of leaves) {
  fs.mkdirSync(path.join(foreign, name), { mode: 0o700 });
  fs.writeFileSync(path.join(foreign, name, 'untouched.txt'), sentinelBytes, { flag: 'wx', mode: 0o600 });
}
const sentinelPaths = [physical, foreign, ...leaves.flatMap(name =>
  [path.join(foreign, name), path.join(foreign, name, 'untouched.txt')])];
const identities = sentinelPaths.map(file => fs.lstatSync(file, { bigint: true }));
function sentinel() {
  assert.deepStrictEqual(fs.readdirSync(physical), ['synthetic-foreign']);
  assert.deepStrictEqual(fs.readdirSync(foreign).sort(), [...leaves].sort());
  for (const name of leaves) {
    assert.deepStrictEqual(fs.readdirSync(path.join(foreign, name)), ['untouched.txt']);
    assert.deepStrictEqual(fs.readFileSync(path.join(foreign, name, 'untouched.txt')), sentinelBytes);
  }
  sentinelPaths.forEach((file, index) => {
    const now = fs.lstatSync(file, { bigint: true }), before = identities[index];
    assert.strictEqual(now.isSymbolicLink(), false);
    assert.strictEqual(now.dev, before.dev); assert.strictEqual(now.ino, before.ino);
    assert.strictEqual(now.isDirectory(), before.isDirectory());
    if (now.isFile()) assert.strictEqual(now.nlink, 1n);
  });
}
function below(p, parent, target, equal = false) {
  const relative = p.relative(parent, target);
  return (equal || relative !== '') && relative !== '..' &&
    !relative.startsWith('..' + p.sep) && !p.isAbsolute(relative);
}
function model(platform, inherited) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const base = platform === 'win32' ? 'R:\\r6-bootstrap' : '/r6-bootstrap';
  const temporary = p.join(base, 'temporary'), foreignRoot = p.join(base, 'synthetic-foreign');
  const environment = { LOCALAPPDATA: p.join(foreignRoot, 'localapp'),
    XDG_DATA_HOME: p.join(foreignRoot, 'xdg'), EU_PRIVACY_ROOT: p.join(foreignRoot, 'workspace'),
    ...(inherited ? { EU_PRIVACY_DATA_ROOT: p.join(foreignRoot, 'data'),
      EU_PRIVACY_RESULT_ROOT: p.join(foreignRoot, 'results') } : {}) };
  const original = { ...environment }, allocations = [], directories = [];
  const refuse = () => { throw new Error('ROOT_BOOTSTRAP_FORBIDDEN_OPERATION'); };
  const io = new Proxy({
    mkdtempSync(prefix) {
      assert.ok(below(p, temporary, prefix) || allocations.some(root => below(p, root, prefix)));
      const owned = prefix + 'owned-' + allocations.length; allocations.push(owned); return owned;
    },
    mkdirSync(directory) {
      assert.ok(allocations.some(root => below(p, root, directory))); directories.push(directory);
    },
    realpathSync: Object.assign(value => value, { native: value => value })
  }, { get(target, key) { return key in target ? target[key] : refuse; } });
  const context = { fs: io, os: { tmpdir: () => temporary, homedir: () => p.join(foreignRoot, 'home') },
    path: p, path2: p, temporaryParent: temporary, assert,
    __dirname: p.join(base, 'repo', 'tests'), process: { platform, env: environment, argv: ['node', 'fixture'] } };
  context.require = name => {
    const key = name.replace(/^node:/u, '');
    if (key === 'fs') return io;
    if (key === 'os') return context.os;
    if (key === 'path') return p;
    if (key === 'assert' || key === 'assert/strict') return assert;
    if (key === 'crypto') return {};
    if (key === 'events') return { EventEmitter: class {} };
    if (key === 'child_process') return new Proxy({}, { get: () => refuse });
    if (['./helpers', './helpers/qa-parent-lifecycle.cjs', './lib/zip', './lib/opc'].includes(name)) return {};
    return refuse();
  };
  vm.createContext(context);
  return { p, environment, original, allocations, directories, context };
}
function run(text, context, name) { return vm.runInContext(text, context, { filename: name, timeout: 1000 }); }
function choices(m) {
  // Separate context prevents a fixture's local dataRoot variable from shadowing
  // the real runtime function. Fresh owned roots have no saved configuration.
  const context = vm.createContext({ process: m.context.process, path: m.p, os: m.context.os,
    fs: m.context.fs, readConfiguredPrivacyRoot: () => '', readRootRecord: () => '',
    assertSettingsParent: () => {}, unsafe: () => new Error('UNEXPECTED_SETTINGS_FAILURE') });
  run(runtime + '\n' + privacy + '\n' + configuration +
    '\nglobalThis.observed = { data: dataRoot(), privacy: privacyRoot(), configuration: rootConfiguration() };', context, 'actual-runtime-root-choosers');
  return context.observed;
}
function isolated(m, observed) {
  const owned = target => m.allocations.some(root => below(m.p, root, target, true));
  const c = observed.configuration;
  return owned(observed.data) && owned(observed.privacy) && owned(c.internal) &&
    c.privateRoots.every(owned) && c.publicRoots.length > 0 && c.publicRoots.every(publicRoot =>
      owned(publicRoot) && c.privateRoots.every(privateRoot =>
        !below(m.p, privateRoot, publicRoot, true) && !below(m.p, publicRoot, privateRoot, true)));
}
function observe(spec, text, restore, platform, inherited, admission = '') {
  const m = model(platform, inherited);
  sentinel();
  try {
    run(admission || text, m.context, spec.id);
    assert.strictEqual(m.allocations.length, 1, 'exactly one owned parent acquisition');
    const observed = choices(m);
    const result = { isolated: isolated(m, observed), model: m, observed };
    if (restore) {
      run(restore, m.context, spec.id + ':actual-finally-namespace');
      assert.deepStrictEqual(m.environment, m.original, 'actual scoped finally restores inherited or absent values');
    }
    return result;
  } finally { sentinel(); }
}

for (const spec of contracts.scopes) {
  const source = read(spec.file);
  const after = source.includes(spec.after), actual = after ? spec.after : spec.before;
  one(source, actual);
  const restore = after ? spec.after_restore : spec.before_restore;
  const scopeSource = spec.next_title ? source.slice(one(source, actual), one(source, spec.next_title)) : source;
  if (restore) one(scopeSource, restore);
  const admission = after && spec.top_admission ? source.slice(0, one(source, actual) + actual.length) : '';
  for (const platform of ['win32', 'darwin', 'linux']) for (const inherited of [false, true]) {
    test(spec.id + ': actual ' + platform + (inherited ? ' inherited namespaces' : ' defaults'), () => {
      const result = observe(spec, actual, restore, platform, inherited, admission);
      assert.strictEqual(result.isolated, true, 'actual product chooser must select only the acquired test namespace');
    });
  }
  test(spec.id + ': causal original and corrected source controls', () => {
    for (const platform of ['win32', 'darwin', 'linux']) {
      const before = observe(spec, spec.before, spec.before_restore, platform, true);
      assert.strictEqual(before.isolated, false, 'original source admits inherited foreign data or result namespace');
      const afterControl = observe(spec, spec.after, spec.after_restore, platform, true);
      assert.strictEqual(afterControl.isolated, true);
    }
  });
  if (spec.worker) test('staging worker inherits the exact parent namespace and rejects any mismatch', () => {
    const parent = observe(spec, spec.after, '', 'win32', true).model;
    const inherited = { ...parent.environment };
    for (const key of [null, 'EU_PRIVACY_ROOT', 'EU_PRIVACY_DATA_ROOT', 'EU_PRIVACY_RESULT_ROOT', 'LOCALAPPDATA']) {
      const worker = model('win32', true);
      Object.assign(worker.environment, inherited);
      worker.context.process.argv = ['node', 'fixture', '--worker', parent.allocations[0]];
      if (key) worker.environment[key] += '-foreign';
      const prior = { ...worker.environment };
      if (key) assert.throws(() => run(spec.after, worker.context, 'staging-worker-mismatch'));
      else run(spec.after, worker.context, 'staging-worker-inheritance');
      assert.strictEqual(worker.allocations.length, 0, 'worker acquires no replacement namespace');
      assert.deepStrictEqual(worker.environment, prior, 'worker never rewrites a parent-owned binding');
    }
  });
}

test('Session default-root fixture preserves the original default chooser oracle inside its own home', () => {
  const fixture = contracts.default_fixture;
  const block = section(read(fixture.file),
    "  await testAsync('default storage uses local application data and known sync roots are refused'",
    "  await testAsync('a configured privacy root behind a local link is refused before a batch starts'");
  const top = contracts.scopes.find(spec => spec.file === fixture.file);
  const source = read(fixture.file), corrected = block.includes(fixture.after);
  const bootstrap = source.includes(top.after) ? top.after : top.before;
  one(source, bootstrap); one(block, corrected ? fixture.after : fixture.before);
  if (corrected) { one(block, fixture.save); one(block, fixture.restore); }
  for (const platform of ['win32', 'darwin', 'linux']) {
    const m = model(platform, false);
    run(bootstrap, m.context, 'actual-Session-namespace');
    const environment = { ...m.environment }, homedir = m.context.os.homedir;
    if (corrected) run(fixture.save, m.context, 'actual-default-fixture-save');
    run(corrected ? fixture.after : fixture.before, m.context, 'actual-default-fixture-bootstrap');
    assert.strictEqual(isolated(m, choices(m)), true);
    if (corrected) {
      run(fixture.restore, m.context, 'actual-default-fixture-finally');
      assert.deepStrictEqual(m.environment, environment);
      assert.strictEqual(m.context.os.homedir, homedir);
    }
    const afterControl = model(platform, false);
    run(top.after + '\n' + fixture.after, afterControl.context, 'corrected-default-source-control');
    assert.strictEqual(isolated(afterControl, choices(afterControl)), true);
  }
  const beforeControl = model('darwin', false);
  run(top.before + '\n' + fixture.before, beforeControl.context, 'original-Darwin-default-source-control');
  assert.strictEqual(isolated(beforeControl, choices(beforeControl)), false);
  sentinel();
});

const mcpSource = read('tests/test-mcp-protocol.js');
const mcpAfter = mcpSource.includes(contracts.mcp.after.parent);
const actualMcp = contracts.mcp[mcpAfter ? 'after' : 'before'];
for (const fragment of Object.values(actualMcp)) one(mcpSource, fragment);
function observeMcp(spec, platform) {
  const m = model(platform, true);
  sentinel();
  try {
    run(spec.parent + '\nglobalThis.privateFixture = root;', m.context, 'actual-MCP-parent-bootstrap');
    m.context.privacyRoot = m.context.privateFixture;
    const observations = [];
    for (let index = 0; index < 2; index++) {
      run('globalThis.talkObservation = (() => {\n' + spec.talk +
        '\nreturn { selected: ' + spec.selected + ', environment: {\n' + spec.namespace + '\n} }; })();',
      m.context, 'actual-MCP-talk-bootstrap');
      const talk = m.context.talkObservation;
      Object.assign(m.environment, talk.environment);
      const observed = choices(m), parent = m.allocations[0];
      const safe = isolated(m, observed) && below(m.p, parent, talk.selected) &&
        observed.configuration.privateRoots.every(privateRoot =>
          !below(m.p, privateRoot, talk.selected, true) && !below(m.p, talk.selected, privateRoot, true));
      observations.push({ safe, selected: talk.selected, result: talk.environment.EU_PRIVACY_RESULT_ROOT });
    }
    return observations;
  } finally { sentinel(); }
}
for (const platform of ['win32', 'darwin', 'linux']) test('MCP actual exclusive public siblings: ' + platform, () => {
  const actual = observeMcp(actualMcp, platform);
  assert.ok(actual.every(value => value.safe));
  assert.notStrictEqual(actual[0].selected, actual[1].selected);
  assert.notStrictEqual(actual[0].result, actual[1].result);
  assert.ok(observeMcp(contracts.mcp.before, platform).every(value => !value.safe));
  const after = observeMcp(contracts.mcp.after, platform);
  assert.ok(after.every(value => value.safe));
  assert.notStrictEqual(after[0].selected, after[1].selected);
});
test('audit marker fixtures follow the actual explicitly selected runtime data root', () => {
  const source = read('tests/test-audit-privacy.js');
  assert.strictEqual(source.split("path.join(process.env.EU_PRIVACY_DATA_ROOT, 'audit-write-blocked.json')").length - 1, 3);
  assert.strictEqual(source.includes("path.join(process.env.LOCALAPPDATA, 'SecureDataMsg', 'audit-write-blocked.json')"), false);
});
void suite.done(() => {
  sentinel();
  if (suite.failure().failed) { console.log('Synthetic root retained after failed bootstrap assertions: ' + physical); return; }
  for (const name of leaves) {
    fs.unlinkSync(path.join(foreign, name, 'untouched.txt')); fs.rmdirSync(path.join(foreign, name));
  }
  fs.rmdirSync(foreign); fs.rmdirSync(physical);
});
