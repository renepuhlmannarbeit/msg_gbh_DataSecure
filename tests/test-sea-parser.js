'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSuite } = require('./helpers');
const { test, done, assert } = createSuite('SEA fixed parser role contract');
const source = fs.readFileSync(path.join(__dirname, '../native/sea/parser-bootstrap.cjs'), 'utf8');
function run(args, { grant, realSea = true } = {}) {
  const calls = [], process = { versions: { node: '22.23.2' }, argv: ['sea', 'sea', ...args],
    permission: { has: scope => scope === grant }, stdout: { write(value) { calls.push(JSON.parse(value)); } } };
  const context = { process, require(name) {
    calls.push(name);
    if (name === 'node:sea') return { isSea: () => realSea };
    if (name.endsWith('network-deny.cjs')) {
      Object.defineProperty(context, '__DATASECURE_NETWORK_DENY_ACTIVE__', { value: true }); return {};
    }
    if (name === './parser-probe.cjs') return { probe: () => [] };
    if (name.endsWith('parser-worker.js')) return {};
    throw new Error('unexpected import');
  } };
  vm.runInNewContext(source.replace('__DATASECURE_TARGET__', 'windows-x64').replace('__DATASECURE_NODE_VERSION__', '22.23.2'), context, { timeout: 1000 });
  return { calls, exit: process.exitCode };
}
test('closed extensions reach the shared worker only after the network guard', () => {
  for (const ext of ['.txt', '.md', '.markdown', '.csv', '.docx']) {
    const result = run([ext, '0']);
    assert.strictEqual(result.exit, undefined);
    assert.deepStrictEqual(result.calls, ['node:sea', '../../plugins/data-secure/server/network-deny.cjs', '../../plugins/data-secure/server/parser-worker.js']);
  }
});
test('arbitrary scripts, flags, extra arguments, disabled formats and fd3 never dispatch', () => {
  for (const args of [[], ['.txt'], ['.txt', '3'], ['.txt', '0', 'extra'], ['.pdf', '0'], ['.TXT', '0'],
    ['--permission', '.txt', '0'], ['-e', 'process.exit(0)'], ['foreign.js', '0'], ['--node-options=--allow-fs-write=*']]) {
    const result = run(args);
    assert.strictEqual(result.exit, 2);
    assert.ok(!result.calls.includes('../../plugins/data-secure/server/parser-worker.js'));
  }
});
test('missing SEA and each broad permission block even the guard import', () => {
  for (const options of [{ realSea: false }, ...['fs.read', 'fs.write', 'child', 'worker', 'addon', 'inspector', 'wasi'].map(grant => ({ grant }))]) {
    const result = run(['.txt', '0'], options);
    assert.strictEqual(result.exit, 2);
    assert.strictEqual(result.calls.filter(value => typeof value === 'string').length, 1);
  }
});
test('one fixed probe cannot become an argument-driven script dispatcher', () => {
  const result = run(['--datasecure-parser-boundary-probe']);
  assert.strictEqual(result.exit, 0);
  assert.strictEqual(result.calls.at(-1).role, 'parser');
  assert.strictEqual(run(['--datasecure-parser-boundary-probe', '.txt']).exit, 2);
});
test('builder embeds a closed permission profile and accepts no online runtime source', () => {
  const builder = fs.readFileSync(path.join(__dirname, '../scripts/build-sea-parser.mjs'), 'utf8');
  const bundle = fs.readFileSync(path.join(__dirname, '../scripts/lib/sea-parser-bundle.mjs'), 'utf8');
  assert.match(builder, /const config = parserSeaConfig\(\)/);
  assert.match(bundle, /execArgv: \['--no-warnings', '--permission', '--disable-proto=throw', '--max-old-space-size=384'\]/);
  assert.match(bundle, /execArgvExtension: 'none'/);
  assert.doesNotMatch(builder, /--allow-fs|https?:|\bfetch\(/);
  assert.match(builder, /SEA_PARSER_ARCHIVE_HASH_MISMATCH/);
  assert.match(builder, /SEA_PARSER_OUTPUT_EXISTS/);
  assert.match(bundle, /inputHashes\.set\(relative, seaHash\(contents\)\)/);
});
done();
