'use strict';

const childProcess = require('child_process');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { createSuite } = require('./helpers');
const {
  showBatchStateNoticeConfirmed
} = require('../plugins/data-secure/server/companion/completion-summary');

const { testAsync, done, assert } = createSuite('Confirmed local presentation');

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.unrefCalled = false;
  child.killed = false;
  child.unref = () => { child.unrefCalled = true; };
  child.kill = () => { child.killed = true; };
  return child;
}

async function turn() {
  await new Promise(resolve => setImmediate(resolve));
}

async function main() {
  await testAsync('Windows resolves only after the native Shown event marker', async () => {
    const original = childProcess.spawn;
    const child = fakeChild();
    let call;
    childProcess.spawn = (command, args, options) => {
      call = { command, args, options };
      return child;
    };
    try {
      let settled = false;
      const shown = showBatchStateNoticeConfirmed({
        batch_phase: 'awaiting_explicit_resume', complete: false
      }, { platform: 'win32', env: { SystemRoot: 'C:\\Windows' } });
      shown.then(() => { settled = true; }, () => { settled = true; });
      child.emit('spawn');
      await turn();
      assert.strictEqual(settled, false, 'process creation is not visible-presentation evidence');
      child.stdout.write('SH');
      await turn();
      assert.strictEqual(settled, false, 'partial output is not evidence');
      child.stdout.write('OWN\n');
      assert.strictEqual(await shown, true);
      assert.deepStrictEqual(call.options.stdio, ['ignore', 'pipe', 'ignore']);
      assert.strictEqual(call.options.shell, false);
      assert.strictEqual(child.unrefCalled, true);
      assert.strictEqual(child.killed, false);
    } finally {
      childProcess.spawn = original;
    }
  });

  await testAsync('Windows rejects exit before the Shown event without leaking child output', async () => {
    const original = childProcess.spawn;
    const child = fakeChild();
    childProcess.spawn = () => child;
    try {
      const shown = showBatchStateNoticeConfirmed({
        batch_phase: 'awaiting_explicit_resume', complete: false
      }, { platform: 'win32', env: { SystemRoot: 'C:\\Windows' } });
      child.emit('spawn');
      child.stdout.write('PRIVATE_PATH');
      child.emit('exit', 1);
      await assert.rejects(shown, error =>
        error.message === 'Die lokale Abschlussansicht konnte nicht geöffnet werden.' &&
        !String(error.stack).includes('PRIVATE_PATH'));
    } finally {
      childProcess.spawn = original;
    }
  });

  await testAsync('macOS resolves only after AppKit emits the visible-window marker', async () => {
    const original = childProcess.spawn;
    const child = fakeChild();
    let options;
    childProcess.spawn = (_command, _args, value) => { options = value; return child; };
    try {
      const shown = showBatchStateNoticeConfirmed({
        batch_phase: 'awaiting_explicit_resume', complete: false
      }, { platform: 'darwin' });
      child.emit('spawn');
      await turn();
      let settled = false;
      shown.then(() => { settled = true; }, () => { settled = true; });
      await turn();
      assert.strictEqual(settled, false);
      child.stdout.write('SHOWN\n');
      assert.strictEqual(await shown, true);
      assert.deepStrictEqual(options.stdio, ['ignore', 'pipe', 'ignore']);
    } finally {
      childProcess.spawn = original;
    }
  });

  await testAsync('Linux keeps its explicitly weaker spawn acknowledgement', async () => {
    const original = childProcess.spawn;
    const child = fakeChild();
    let options;
    childProcess.spawn = (_command, _args, value) => { options = value; return child; };
    try {
      const shown = showBatchStateNoticeConfirmed({
        batch_phase: 'awaiting_explicit_resume', complete: false
      }, { platform: 'linux' });
      child.emit('spawn');
      assert.strictEqual(await shown, true);
      assert.strictEqual(options.stdio, 'ignore');
    } finally {
      childProcess.spawn = original;
    }
  });

  done();
}

main().catch(error => { console.error(error); process.exitCode = 1; });
