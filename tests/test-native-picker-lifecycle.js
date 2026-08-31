'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const childProcess = require('child_process');
const { createSuite } = require('./helpers');
const { pickSourcesAsync, PICKER_CANCELLED } = require('../plugins/data-secure/server/companion/file-picker');
const { pickSourceFolderAsync, SOURCE_FOLDER_CANCELLED } = require('../plugins/data-secure/server/companion/source-folder');
const completed = require('../plugins/data-secure/server/companion/completed-batch-picker');
const { test, testAsync, assert, done } = createSuite('Native picker lifecycle');

const selectedPath = path.resolve(__dirname, 'synthetic-not-read.txt');
const validation = { hasReparseComponent: () => false, fs: { lstatSync: () => ({ size: 12, isFile: () => true, isSymbolicLink: () => false }) } };
const candidates = [{ ordinal: 1, released: 2, stopped: 0 }, { ordinal: 2, released: 1, stopped: 1 }];

test('completed Windows picker fills the list silently before selecting the first item', () => {
  const script = completed.pickerCommands(candidates, { platform: 'win32' })[0].args.at(-1);
  assert.strictEqual((script.match(/\[void\]\$list.Items.Add/g) || []).length, 2);
  assert.ok(script.lastIndexOf('$list.Items.Add(') < script.indexOf('$list.SelectedIndex = 0'));
});

if (process.platform === 'win32') {
  test('real PowerShell picker preambles preserve umlauts and non-Latin source names', () => {
    const { pickerCommands } = require('../plugins/data-secure/server/companion/file-picker');
    const { sourceFolderPickerCommands } = require('../plugins/data-secure/server/companion/source-folder');
    for (const spec of [pickerCommands('win32')[0], sourceFolderPickerCommands('win32')[0]]) {
      const prefix = spec.args.at(-1).split('$dialog =')[0];
      assert.doesNotMatch(prefix, /ShowDialog/);
      const result = childProcess.spawnSync(spec.command, [...spec.args.slice(0, -1), `${prefix}[Console]::Out.Write('Müller 東京')`],
        { encoding: 'utf8', windowsHide: true, timeout: 15000 });
      assert.ifError(result.error);
      assert.strictEqual(result.status, 0, result.stderr);
      assert.strictEqual(result.stdout, 'Müller 東京');
    }
  });
  for (const ordinal of [1, 2, null]) test(`real Windows list construction returns only ${ordinal ?? 'cancellation'} without opening a dialog`, () => {
    const runner = (command, args) => {
      const original = args.at(-1);
      assert.strictEqual(original.split('$form.ShowDialog()').length, 2);
      const choice = ordinal === null
        ? '[System.Windows.Forms.DialogResult]::Cancel'
        : `[System.Windows.Forms.DialogResult]::OK; $list.SelectedIndex = ${ordinal - 1}`;
      const script = `$ErrorActionPreference = 'Stop'; ${original.replace('$form.ShowDialog()', choice)}; $form.Dispose()`;
      assert.doesNotMatch(script, /ShowDialog/);
      const result = childProcess.spawnSync(command, [...args.slice(0, -1), script], { encoding: 'utf8', windowsHide: true, shell: false, timeout: 15000 });
      assert.ifError(result.error);
      assert.strictEqual(result.status, 0, result.stderr);
      assert.strictEqual(result.stderr, '');
      assert.strictEqual(result.stdout, ordinal === null ? completed.PICKER_CANCELLED : String(ordinal));
      return result;
    };
    if (ordinal === null) assert.throws(() => completed.pickCompletedBatch(candidates, { platform: 'win32', runner }), (error) => error.code === completed.PICKER_CANCELLED);
    else assert.strictEqual(completed.pickCompletedBatch(candidates, { platform: 'win32', runner }), ordinal);
  });
}

async function main() {
  await testAsync('a cancellation immediately before intake does not start a worker; successful workers remain independent', async () => {
    const code = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/index.js'), 'utf8');
    const source = code.slice(code.indexOf('let pickerSelectionActive='), code.indexOf('function continueAnonymizedBatchInChat('));
    assert.ok(source.includes('async function startPickerBatch('));
    let starts = 0;
    let cancelOnAccepted = true;
    let controller = new AbortController();
    const context = vm.createContext({
      process: { env: {} }, setImmediate,
      genericStatus: () => ({ engine_ready: true }),
      pickSourcesAsync: async () => [{ sourcePath: selectedPath, sourceBytes: 12 }],
      batchQueueFromSelection: (selected) => selected,
      recordWorkflowEvent: (event) => { if (cancelOnAccepted && event.event === 'picker_selection_accepted') controller.abort(); },
      startLocalIntakeExecutor: () => { starts++; return { ok: true, local_intake_pending: true }; },
      localOnlyStartResponse: (started) => ({ ok: started.ok, local_processing_started: true })
    });
    vm.runInContext(source, context);
    const cancelled = await context.startPickerBatch({}, { signal: controller.signal });
    assert.strictEqual(cancelled.error, 'local_selection_cancelled');
    assert.strictEqual(starts, 0);
    controller = new AbortController();
    cancelOnAccepted = false;
    const started = await context.startPickerBatch({}, { signal: controller.signal });
    assert.strictEqual(started.local_processing_started, true, 'a cancelled selection releases the next picker');
    controller.abort();
    assert.strictEqual(starts, 1, 'there is no cancellation hook attached to the independent intake worker');
  });

  for (const [name, picker, marker, output] of [
    ['files', pickSourcesAsync, PICKER_CANCELLED, selectedPath],
    ['folder', pickSourceFolderAsync, SOURCE_FOLDER_CANCELLED, path.dirname(selectedPath)]
  ]) {
    await testAsync(`${name}: pre-abort opens no process and late selection cannot win over cancellation`, async () => {
      const controller = new AbortController();
      controller.abort(new Error('private host reason'));
      await assert.rejects(picker({ signal: controller.signal, runner: () => { throw new Error('must not run'); } }), (error) => error.code === 'LOCAL_SELECTION_CANCELLED' && !error.message.includes('private'));
      const late = new AbortController();
      let calls = 0;
      await assert.rejects(picker({ ...validation, platform: 'linux', signal: late.signal, runner: async (_command, _args, _input, _env, signal) => {
        calls++;
        assert.strictEqual(signal, late.signal);
        late.abort();
        return { status: 0, stdout: output };
      } }), (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
      assert.strictEqual(calls, 1);
    });

    await testAsync(`${name}: unavailable helper falls back once, user cancellation never reopens`, async () => {
      const commands = [];
      await assert.rejects(picker({ platform: 'linux', runner: async (command) => {
        commands.push(command);
        return command === 'zenity' ? { error: { code: 'ENOENT' } } : { error: { code: 1 }, status: 1, stdout: '' };
      } }), (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
      assert.deepStrictEqual(commands, ['zenity', 'kdialog']);
      let calls = 0;
      await assert.rejects(picker({ platform: 'linux', runner: async () => { calls++; return { status: 0, stdout: marker }; } }), (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
      assert.strictEqual(calls, 1);
      const result = await picker({ ...validation, platform: 'linux', runner: async () => ({ status: 0, stdout: output }) });
      if (name === 'files') assert.strictEqual(result[0].sourcePath, selectedPath);
      else assert.strictEqual(result, path.dirname(selectedPath));
    });

    await testAsync(`${name}: a real asynchronous owned child is killed on abort while the event loop remains responsive`, async () => {
      const execFile = childProcess.execFile;
      const controller = new AbortController();
      let child;
      let closed;
      let aborted = false;
      childProcess.execFile = (_command, _args, options, callback) => {
        assert.strictEqual(options.signal, controller.signal);
        assert.strictEqual(options.shell, false);
        assert.strictEqual(options.windowsHide, true);
        assert.strictEqual(options.env.NODE_OPTIONS, undefined);
        // Never execute a native picker in this test. Only this synthetic
        // timer process is created, using the real async child implementation.
        child = execFile(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], options, callback);
        closed = new Promise((resolve) => child.once('close', resolve));
        return child;
      };
      let timer;
      try {
        const pending = picker({ ...validation, signal: controller.signal, env: { ...process.env, NODE_OPTIONS: '--invalid-host-option' } });
        timer = setTimeout(() => { aborted = true; controller.abort(); }, 100);
        await assert.rejects(pending, (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
        assert.strictEqual(aborted, true);
        await closed;
        assert.ok(child.exitCode !== null || child.signalCode !== null);
      } finally {
        clearTimeout(timer);
        childProcess.execFile = execFile;
        if (child && child.exitCode === null && child.signalCode === null) child.kill();
        if (closed) await closed;
      }
    });
  }
  done();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
