'use strict';
// QA caller models only. These do not start MCP, native pickers or product workers.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { EventEmitter } = require('events');
const lifecycle = require('./helpers/qa-parent-lifecycle.cjs');
const { createSuite } = require('./helpers');
const { testAsync, assert, done } = createSuite('MCP test-parent actual caller lifecycle');
const source = fs.readFileSync(path.join(__dirname, 'test-mcp-protocol.js'), 'utf8');
const end = source.indexOf('\nconst rpc = '), finish = source.indexOf('\nasync function finishProtocol(');
assert.ok(end > 0 && finish > end);
const finishEnd = source.indexOf('\nmain().then(', finish); assert.ok(finishEnd > finish);
const actual = source.slice(0, end) + source.slice(finish, finishEnd);
function model(fault) {
  const children = [], changes = [], endings = [];
  const cause = Object.freeze({ own: 'callback/stream failure' });
  const virtual = path.resolve(__dirname, 'QA-VIRTUAL-MCP-NO-IO');
  const fakeProcess = { env: {}, execPath: 'owned-model-node' };
  const spawn = () => {
    const child = new EventEmitter(), stdin = new EventEmitter(), stdout = new EventEmitter(), stderr = new EventEmitter();
    child.kills = 0; child.exitCode = null; child.signalCode = null;
    child.kill = () => {
      child.kills++;
      if (fault === 'write-falsy-kill-throws') throw 0;
      if (['exit-without-close', 'kill-false', 'process-error'].includes(fault)) return false;
      child.emit('close', null, 'SIGKILL'); return true;
    };
    stdin.write = (_bytes, callback) => {
      if (fault === 'write-falsy-kill-throws') throw false;
      if (fault === 'write-callback') { callback(cause); return true; }
      if (['process-error', 'stream-error', 'kill-false'].includes(fault)) return true;
      queueMicrotask(() => stdout.emit('data', Buffer.from(fault === 'malformed-json' ? '{bad}\n' : '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n')));
      return true;
    };
    stdin.end = () => {
      if (fault === 'end-throws') throw cause;
      queueMicrotask(() => {
        child.exitCode = fault === 'code17' ? 17 : 0;
        child.emit('exit', child.exitCode, null);
        if (fault !== 'exit-without-close') child.emit('close', fault === 'signal' ? null : child.exitCode,
          fault === 'signal' ? 'SIGTERM' : null);
      });
    };
    for (const [name, value] of [['stdin', stdin], ['stdout', stdout], ['stderr', stderr]])
      Object.defineProperty(child, name, { get() {
        assert.ok(child.listenerCount('error') > 0 && child.listenerCount('close') > 0,
          'actual caller must observe the returned child before touching a pipe');
        return fault === 'missing-stdout' && name === 'stdout' ? null : value;
      } });
    children.push(child);
    queueMicrotask(() => {
      if (fault === 'process-error') child.emit('error', cause);
      if (fault === 'stream-error') stderr.emit('error', cause);
    });
    return child;
  };
  const localSuite = { assert, done: async () => {}, failure: () => ({ failed: false }),
    testAsync: async (_name, action) => action() };
  const helpers = { ...lifecycle,
    within: (promise, milliseconds, code) => lifecycle.within(promise, Math.min(milliseconds, 25), code),
    endTestCliFailure(result) { if (result.failed) endings.push(result); }
  };
  const io = { mkdtempSync: () => virtual, mkdirSync: file => changes.push(['mkdir', file]),
    writeFileSync: file => changes.push(['write', file]), rmSync: file => changes.push(['remove', file]) };
  const context = vm.createContext({ __dirname, process: fakeProcess, Buffer,
    require(name) {
      if (name === 'fs') return io;
      if (name === 'os') return { tmpdir: () => virtual };
      if (name === 'path') return path;
      if (name === 'child_process') return { spawn };
      if (name === './helpers') return { createSuite: () => localSuite };
      if (name === './helpers/qa-parent-lifecycle.cjs') return helpers;
      if (name.endsWith('/batch-progress')) return {};
      if (name.endsWith('/version')) return { VERSION: 'QA-MODEL' };
      throw Error('unlisted MCP parent dependency ' + name);
    }
  });
  const api = vm.runInContext(actual + '\n({talk, finishProtocol});', context, { timeout: 1000 });
  return { api, children, changes, endings, cause };
}
async function main() {
  for (const fault of ['healthy', 'code17', 'signal', 'malformed-json', 'process-error', 'stream-error',
    'write-callback', 'write-falsy-kill-throws', 'end-throws', 'exit-without-close', 'kill-false', 'missing-stdout']) {
    await testAsync(`actual MCP test caller: ${fault}`, async () => {
      const f = model(fault); let failed = false, error, result;
      try { result = await f.api.talk([{ id: 1, method: 'owned-model' }]); }
      catch (value) { failed = true; error = value; }
      if (fault === 'healthy') {
        assert.equal(failed, false); assert.equal(result.responses[0].result.ok, true);
        await f.api.finishProtocol(); assert.equal(f.endings.length, 0);
        assert.equal(f.changes.filter(row => row[0] === 'remove').length, 1);
      } else {
        assert.equal(failed, true);
        if (fault === 'write-falsy-kill-throws') assert.strictEqual(error, false);
        if (['process-error', 'stream-error', 'write-callback', 'end-throws'].includes(fault)) assert.strictEqual(error, f.cause);
        const writes = f.changes.length;
        await assert.rejects(f.api.talk([{ id: 2, method: 'must-not-start' }]), () => true);
        assert.equal(f.children.length, 1); assert.equal(f.changes.length, writes);
        await f.api.finishProtocol(error, true); assert.equal(f.endings.length, 1);
        assert.equal(f.changes.filter(row => row[0] === 'remove').length, 0);
        if (['exit-without-close', 'kill-false', 'write-falsy-kill-throws', 'process-error'].includes(fault))
          assert.equal(f.endings[0].unconfirmedChildren, true);
      }
      assert.ok(f.children.every(child => child.kills <= 1));
    });
  }
  await done();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
