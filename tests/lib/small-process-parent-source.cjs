'use strict';
// Actual parent source seams. No parent import, product launch or copied cleanup body.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const vm = require('node:vm'), { EventEmitter } = require('node:events');
const { performance } = require('node:perf_hooks');
const lifecycle = require('../helpers/qa-parent-lifecycle.cjs');
const { encodeFrame } = require('../../plugins/data-secure/server/standalone/desktop-ipc');
function read(file) { return fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/gu, '\n'); }
function unique(source, marker) {
  const at = source.indexOf(marker);
  assert.ok(at >= 0 && source.indexOf(marker, at + marker.length) < 0, marker);
  return at;
}
function between(source, start, end) {
  const first = unique(source, start), last = unique(source, end);
  assert.ok(last > first); return source.slice(first, last);
}
function closeBody(source) {
  const first = unique(source, '  } finally {') + '  } finally {'.length;
  const last = unique(source, '  // Preserve');
  const body = source.slice(first, last).trimEnd();
  assert.ok(body.endsWith('}')); return body.slice(0, -1);
}
function hook(source) {
  const text = source.slice(unique(source, '\nmain().catch(') + '\nmain().catch('.length).trimEnd();
  assert.ok(text.endsWith(');')); return text.slice(0, -2);
}
function environment(milliseconds = 20, processHost) {
  const processView = new EventEmitter(), output = [], operations = [];
  processView.env = {}; processView.execPath = process.execPath; processView.exitCode = undefined;
  if (processHost) Object.defineProperty(processView, 'exitCode', {
    enumerable: true, get: () => processHost.exitCode, set: value => { processHost.exitCode = value; }
  });
  const limit = (duration, code) => Math.min(duration,
    typeof milliseconds === 'function' ? milliseconds(duration, code) : milliseconds);
  processView.stderr = { write: value => { output.push(value); return true; } };
  const fakeFs = {
    existsSync: () => false, mkdirSync() {},
    lstatSync: () => ({ dev: 7, ino: 11, isDirectory: () => true, isSymbolicLink: () => false }),
    rmSync: () => operations.push('remove'),
    realpathSync: Object.assign(value => value, { native: () => fs.realpathSync.native(os.tmpdir()) })
  };
  return { processView, output, operations, fakeFs,
    limitedWithin: (promise, duration, code) => lifecycle.within(promise, limit(duration, code), code),
    timer: (callback, duration) => setTimeout(callback, limit(duration)) };
}
function fastModel(spawn, options = {}) {
  const source = read('test-standalone-fast-review-ipc.js'), view = environment(options.milliseconds, options.processHost);
  const root = options.root || path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-fast-ipc-model');
  const context = vm.createContext({ ...lifecycle, within: view.limitedWithin, assert, Buffer, path, os, performance,
    spawn, encodeFrame, root, stamp: { dev: 7, ino: 11 }, children: [], primary: lifecycle.firstFailure(),
    active: null, sequence: 0, server: 'synthetic-server', env: {}, sources: path.join(root, 'sources'),
    process: view.processView, fs: view.fakeFs, setTimeout: view.timer, clearTimeout, console: { error() {} },
    require: () => ({ safeRemovePrivateTree() { view.operations.push('remove'); } }),
    runPackagedFastReviewScenario: options.scenario || (async () => {}),
    endTestCliFailure: options.end || (value => { view.output.push(value); }) });
  const methods = between(source, '  const launch = () => {', '  const sources =');
  const tail = between(source, '  try {\n    await runPackagedFastReviewScenario', '\n}\nmain().catch');
  const api = vm.runInContext(methods + '\n({ launch, stop, cleanup: async () => {' + closeBody(source) +
    '}, run: async () => {' + tail + '}, end: (' + hook(source) + ') })', context, { timeout: 1000 });
  return { ...view, context, ...api };
}
function intakeModel(fork, options = {}) {
  const source = read('test-batch-intake-reservation.js'), view = environment(options.milliseconds, options.processHost);
  const harness = { module: { exports: {} }, require, process: view.processView,
    console: { log() {}, error() {} }, setTimeout, clearTimeout };
  vm.runInNewContext(read('helpers.js'), harness, { timeout: 1000 });
  const suite = harness.module.exports.createSuite('source-only intake parent');
  const context = vm.createContext({ ...lifecycle, within: view.limitedWithin, fork, path, fs: view.fakeFs,
    assert: options.assert || suite.assert, testAsync: suite.testAsync, done: suite.done, suite,
    children: [], primary: lifecycle.firstFailure(), childLifetimeUnknown: false,
    process: view.processView, __dirname: path.join(__dirname, '..'), base: options.root || 'synthetic-intake-root',
    batchRoot: () => 'synthetic-batches', resetReservationFiles() { view.operations.push('reset'); },
    console: { error() {} }, setTimeout: view.timer, clearTimeout,
    endTestCliFailure: options.end || (value => { view.output.push(value); }) });
  const methods = between(source, 'function childResult(', "\ntest('one process");
  const main = between(source, 'async function main() {', '\nmain().catch');
  const api = vm.runInContext(methods + '\n' + main + '\n({ main, end: (' + hook(source) + ') })',
    context, { timeout: 1000 });
  return { ...view, context, suite, ...api };
}
module.exports = { fastModel, intakeModel, read };
