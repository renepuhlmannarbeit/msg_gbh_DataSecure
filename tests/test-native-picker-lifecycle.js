'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const childProcess = require('child_process');
const { createSuite } = require('./helpers');
const { pickSourcesAsync, PICKER_CANCELLED } = require('../plugins/data-secure/server/companion/file-picker');
const { pickSourceFolderAsync, SOURCE_FOLDER_CANCELLED } = require('../plugins/data-secure/server/companion/source-folder');
const { pickFolderAsync, FOLDER_PICKER_CANCELLED } = require('../plugins/data-secure/server/companion/folder-picker');
const completed = require('../plugins/data-secure/server/companion/completed-batch-picker');
const { test, testAsync, assert, done } = createSuite('Native picker lifecycle');

const selectedPath = path.resolve(__dirname, 'synthetic-not-read.txt');
const syntheticStat = { size: 12, isFile: () => true, isSymbolicLink: () => false };
const validation = {
  hasReparseComponent: () => false,
  hasReparseComponentAsync: async () => false,
  fs: { lstatSync: () => syntheticStat },
  fsPromises: { lstat: async () => syntheticStat }
};
const candidates = [{ ordinal: 1, released: 2, stopped: 0 }, { ordinal: 2, released: 1, stopped: 1 }];

test('completed Windows picker fills the list silently before selecting the first item', () => {
  const script = completed.pickerCommands(candidates, { platform: 'win32' })[0].args.at(-1);
  assert.strictEqual((script.match(/\[void\]\$list.Items.Add/g) || []).length, 2);
  assert.ok(script.lastIndexOf('$list.Items.Add(') < script.indexOf('$list.SelectedIndex = 0'));
});

async function main() {
  await testAsync('multi-file validation stays asynchronous and observes cancellation between files', async () => {
    const controller = new AbortController();
    let stats = 0;
    let timerObserved = false;
    const secondPath = path.resolve(__dirname, 'synthetic-not-read-2.txt');
    const pending = pickSourcesAsync({
      ...validation,
      platform: 'linux',
      signal: controller.signal,
      runner: async () => ({ status: 0, stdout: `${selectedPath}\n${secondPath}\n` }),
      fsPromises: {
        async lstat() {
          stats++;
          await new Promise((resolve) => setImmediate(resolve));
          if (stats === 1) setImmediate(() => controller.abort());
          return syntheticStat;
        }
      }
    });
    setImmediate(() => { timerObserved = true; });
    await assert.rejects(pending, (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
    assert.strictEqual(timerObserved, true, 'validation must yield to the Cowork event loop');
    assert.ok(stats <= 2, 'cancellation stops validation without scanning the remaining batch');
  });
  for (const platform of ['win32', 'darwin', 'linux']) {
    await testAsync(`completed ${platform}: nonzero exits, timeouts and malformed ordinals cannot select a batch`, async () => {
      for (const result of [
        { status: 1, stdout: '1', error: { code: 1 } },
        { status: null, stdout: '1', error: { code: 'ETIMEDOUT' } },
        { status: null, stdout: '', error: { killed: true } },
        { status: null, stdout: '', signal: 'SIGTERM' },
        { status: 2, stdout: '' },
        { status: 0, stdout: '1', error: { code: 'EIO' } },
        ...['0', '3', '1e0', '0x1', '1.0', '1\n2', ''].map(stdout => ({ status: 0, stdout }))
      ]) {
        let calls = 0;
        await assert.rejects(completed.pickCompletedBatch(candidates, { platform, runner: async () => { calls++; return result; } }));
        assert.strictEqual(calls, 1, 'failure does not reopen or fall back');
      }
      for (const ordinal of [1, 2]) assert.strictEqual(await completed.pickCompletedBatch(candidates, {
        platform, runner: async () => ({ status: 0, stdout: `${ordinal}\n` })
      }), ordinal);
    });
  }
if (process.platform === 'win32') {
  test('real PowerShell picker preambles preserve umlauts and non-Latin source names', () => {
    const { pickerCommands } = require('../plugins/data-secure/server/companion/file-picker');
    const { sourceFolderPickerCommands } = require('../plugins/data-secure/server/companion/source-folder');
    const { pickerCommands: privacyFolderPickerCommands } = require('../plugins/data-secure/server/companion/folder-picker');
    for (const spec of [pickerCommands('win32')[0], sourceFolderPickerCommands('win32')[0], privacyFolderPickerCommands('win32')[0]]) {
      const prefix = spec.args.at(-1).split('$dialog =')[0];
      assert.doesNotMatch(prefix, /ShowDialog/);
      const result = childProcess.spawnSync(spec.command, [...spec.args.slice(0, -1), `${prefix}[Console]::Out.Write('Müller 東京')`],
        { encoding: 'utf8', windowsHide: true, timeout: 15000 });
      assert.ifError(result.error);
      assert.strictEqual(result.status, 0, result.stderr);
      assert.strictEqual(result.stdout, 'Müller 東京');
    }
  });
  for (const ordinal of [1, 2, null]) await testAsync(`real Windows list construction returns only ${ordinal ?? 'cancellation'} without opening a dialog`, async () => {
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
    if (ordinal === null) await assert.rejects(() => completed.pickCompletedBatch(candidates, { platform: 'win32', runner }), (error) => error.code === completed.PICKER_CANCELLED);
    else assert.strictEqual(await completed.pickCompletedBatch(candidates, { platform: 'win32', runner }), ordinal);
  });
}

  await testAsync('a cancellation immediately before intake does not start a worker; successful workers remain independent', async () => {
    const code = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/index.js'), 'utf8');
    const source = code.slice(code.indexOf('let nativeInteractionOwner='), code.indexOf('function continueAnonymizedBatchInChat('));
    assert.ok(source.includes('async function startPickerBatch('));
    let starts = 0;
    let reservationHeld = false;
    let cancelOnAccepted = true;
    let controller = new AbortController();
    const context = vm.createContext({
      process: { env: {} }, setImmediate,
      readConfiguredResultRoot: () => 'already-configured',
      reserveIntake: () => { if (reservationHeld) throw new Error('held'); reservationHeld = true; return { reservation_id: 'd'.repeat(64) }; },
      releaseIntake: () => { reservationHeld = false; return true; },
      genericStatus: (options) => { assert.strictEqual(options.ignoreIntakeReservation, true); return { engine_ready: true }; },
      pickSourcesAsync: async () => [{ sourcePath: selectedPath, sourceBytes: 12 }],
      batchQueueFromSelection: (selected) => selected,
      recordWorkflowEvent: (event) => { if (cancelOnAccepted && event.event === 'picker_selection_accepted') controller.abort(); },
      startLocalIntakeExecutor: (_selected, _profile, options) => { starts++; reservationHeld = false; assert.match(options.intakeReservationId, /^[a-f0-9]{64}$/); return { ok: true, local_intake_pending: true }; },
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

  await testAsync('the result folder is selected once and reused without another confirmation', async () => {
    const code = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/index.js'), 'utf8');
    const source = code.slice(code.indexOf('let nativeInteractionOwner='), code.indexOf('function continueAnonymizedBatchInChat('));
    let configured = false;
    let resultPickerCalls = 0;
    let sourcePickerCalls = 0;
    let reservationHeld = false;
    const resultRoot = path.resolve(__dirname, 'synthetic-cowork-root');
    const context = vm.createContext({
      require, process: { env: {} }, setImmediate,
      SafeError: class SafeError extends Error {},
      roots: () => ({ root: path.resolve(__dirname, 'synthetic-private-root') }),
      readConfiguredResultRoot: () => configured ? resultRoot : '',
      pickFolderAsync: async () => { resultPickerCalls++; return resultRoot; },
      saveConfiguredResultRoot: () => { configured = true; },
      clearConfiguredResultRoot: () => { configured = false; },
      resultOutputDirectory: () => path.join(resultRoot, 'DataSecure-Output'),
      isCommonSyncFolder: () => false,
      replayPendingResultExports: () => ({ exported: 0, pending: 0, failures: 0 }),
      reserveIntake: () => { if (reservationHeld) throw new Error('held'); reservationHeld = true; return { reservation_id: 'f'.repeat(64) }; },
      releaseIntake: () => { reservationHeld = false; return true; },
      genericStatus: () => ({ engine_ready: true, local_intake_pending: false, batch_processing_active: false }),
      pickSourcesAsync: async () => { sourcePickerCalls++; return [{ sourcePath: selectedPath, sourceBytes: 12 }]; },
      pickSourceFolderAsync: async () => path.dirname(selectedPath),
      enumerateSourceFolderAsync: async () => [],
      batchQueueFromSelection: (selected) => selected,
      recordWorkflowEvent: () => {},
      startLocalIntakeExecutor: () => { reservationHeld = false; return { ok: true, local_intake_pending: true }; },
      localOnlyStartResponse: () => ({ ok: true, next_action: 'local_intake_handoff_confirmed' })
    });
    vm.runInContext(source, context);
    assert.strictEqual((await context.startPickerBatch({})).ok, true);
    assert.strictEqual((await context.startPickerBatch({})).ok, true);
    assert.strictEqual(resultPickerCalls, 1, 'the persistent result choice is not repeated');
    assert.strictEqual(sourcePickerCalls, 2, 'each new batch still asks for its sources');
  });

  await testAsync('an unusable result folder is never persisted', async () => {
    const code = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/index.js'), 'utf8');
    const source = code.slice(code.indexOf('let nativeInteractionOwner='), code.indexOf('function continueAnonymizedBatchInChat('));
    const resultRoot = path.resolve(__dirname, 'synthetic-unusable-result-root');
    let saves = 0;
    const context = vm.createContext({
      require, process: { env: {} }, setImmediate,
      SafeError: class SafeError extends Error {},
      roots: () => ({ root: path.resolve(__dirname, 'synthetic-private-root') }),
      pickFolderAsync: async () => resultRoot,
      resultOutputDirectory: () => { throw new Error('synthetic access denied'); },
      saveConfiguredResultRoot: () => { saves++; },
      isCommonSyncFolder: () => false
    });
    vm.runInContext(source, context);
    await assert.rejects(() => context.chooseAndSaveResultFolder({}), /access denied/iu);
    assert.strictEqual(saves, 0, 'validation and output creation must complete before the choice is stored');
  });

  await testAsync('a rejected result folder reports its honest, path-free reason and reopens next time', async () => {
    const code = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/index.js'), 'utf8');
    const source = code.slice(code.indexOf('let nativeInteractionOwner='), code.indexOf('function continueAnonymizedBatchInChat('));
    class SafeError extends Error {}
    const privateRoot = path.resolve(__dirname, 'synthetic-private-root');
    let outputFailure = null;
    let saves = 0;
    let sourcePickerCalls = 0;
    const context = vm.createContext({
      require, process: { env: {} }, setImmediate, SafeError,
      roots: () => ({ root: privateRoot }),
      readConfiguredResultRoot: () => '',
      pickFolderAsync: async () => outputFailure ? path.resolve(__dirname, 'synthetic-cowork-root') : path.join(privateRoot, 'inside'),
      resultOutputDirectory: () => { if (outputFailure) throw outputFailure; },
      saveConfiguredResultRoot: () => { saves++; },
      isCommonSyncFolder: () => false,
      reserveIntake: () => ({ reservation_id: 'a'.repeat(64) }),
      releaseIntake: () => true,
      genericStatus: () => ({ engine_ready: true }),
      pickSourcesAsync: async () => { sourcePickerCalls++; return []; },
      recordWorkflowEvent: () => {}
    });
    vm.runInContext(source, context);
    const overlapping = await context.startPickerBatch({});
    assert.strictEqual(overlapping.error, 'result_folder_required');
    assert.match(overlapping.message, /außerhalb des privaten DataSecure-Arbeitsbereichs/u);
    assert.match(overlapping.message, /beim nächsten Start erneut/u);
    assert.doesNotMatch(overlapping.message, /synthetic-private-root|inside/u);
    outputFailure = Object.assign(new Error(`EACCES: permission denied, mkdir '${privateRoot}\\secret-path'`), { code: 'EACCES' });
    const unusable = await context.startPickerBatch({});
    assert.strictEqual(unusable.error, 'result_folder_required');
    assert.match(unusable.message, /nicht sicher verwendet werden/u);
    assert.doesNotMatch(unusable.message, /EACCES|secret-path|synthetic/u);
    assert.strictEqual(saves, 0, 'a rejected choice is never persisted');
    assert.strictEqual(sourcePickerCalls, 0, 'no source picker opens without a result folder');
  });

  await testAsync('privacy-root mutation and source intake share one native interaction owner', async () => {
    const code = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/index.js'), 'utf8');
    const source = code.slice(code.indexOf('let nativeInteractionOwner='), code.indexOf('function continueAnonymizedBatchInChat('));
    let resolveFolder;
    let resolveSources;
    let saves = 0;
    let clears = 0;
    let starts = 0;
    let sourcePickerCalls = 0;
    let reservationHeld = false;
    const status = { engine_ready: true, local_intake_pending: false, batch_processing_active: false, recoverable_batches: 0 };
    const context = vm.createContext({
      process: { env: {} }, setImmediate,
      readConfiguredResultRoot: () => 'already-configured',
      reserveIntake: () => { if (reservationHeld) throw new Error('held'); reservationHeld = true; return { reservation_id: 'e'.repeat(64) }; },
      releaseIntake: () => { reservationHeld = false; return true; },
      SafeError: class SafeError extends Error {},
      genericStatus: () => ({ ...status }),
      LOCAL_ONLY_HANDOFF: { isActive: () => false, finalizeTerminal: () => false },
      pickFolderAsync: () => new Promise((resolve) => { resolveFolder = resolve; }),
      storageStatus: () => ({ safe: true }),
      saveConfiguredPrivacyRoot: () => { saves++; },
      clearConfiguredPrivacyRoot: () => { clears++; },
      pickSourcesAsync: () => { sourcePickerCalls++; return new Promise((resolve) => { resolveSources = resolve; }); },
      pickSourceFolderAsync: async () => path.dirname(selectedPath),
      enumerateSourceFolderAsync: async () => [],
      batchQueueFromSelection: (selected) => selected,
      recordWorkflowEvent: () => {},
      startLocalIntakeExecutor: (_selected, _profile, options) => { starts++; reservationHeld = false; assert.match(options.intakeReservationId, /^[a-f0-9]{64}$/); return { ok: true, local_intake_pending: true }; },
      localOnlyStartResponse: (started) => ({ ok: started.ok, local_processing_started: true })
    });
    vm.runInContext(source, context);

    const configuring = context.configurePrivacyFolder({ confirmed: true });
    const blockedStart = await context.startPickerBatch({});
    assert.strictEqual(blockedStart.error, 'batch_active');
    assert.strictEqual(sourcePickerCalls, 0);
    resolveFolder(path.dirname(selectedPath));
    await configuring;
    assert.strictEqual(saves, 1);

    const starting = context.startPickerBatch({});
    await new Promise((resolve) => setImmediate(resolve));
    await assert.rejects(context.configurePrivacyFolder({ confirmed: true, reset_to_default: true }), /bereits geöffnet|unverändert/iu);
    assert.strictEqual(clears, 0);
    resolveSources([{ sourcePath: selectedPath, sourceBytes: 12 }]);
    await starting;
    assert.strictEqual(starts, 1);
  });

  for (const [name, picker, marker, output] of [
    ['files', pickSourcesAsync, PICKER_CANCELLED, selectedPath],
    ['folder', pickSourceFolderAsync, SOURCE_FOLDER_CANCELLED, path.dirname(selectedPath)],
    ['completed', (options) => completed.pickCompletedBatch(candidates, options), completed.PICKER_CANCELLED, '2']
  ]) {
    const cancelCode = name === 'completed' ? completed.PICKER_CANCELLED : 'LOCAL_SELECTION_CANCELLED';
    await testAsync(`${name}: pre-abort opens no process and late selection cannot win over cancellation`, async () => {
      const controller = new AbortController();
      controller.abort(new Error('private host reason'));
      await assert.rejects(picker({ signal: controller.signal, runner: () => { throw new Error('must not run'); } }), (error) => error.code === cancelCode && !error.message.includes('private'));
      const late = new AbortController();
      let calls = 0;
      await assert.rejects(picker({ ...validation, platform: 'linux', signal: late.signal, runner: async (_command, _args, _input, _env, signal) => {
        calls++;
        assert.strictEqual(signal, late.signal);
        late.abort();
        return { status: 0, stdout: output };
      } }), (error) => error.code === cancelCode);
      assert.strictEqual(calls, 1);
    });

    await testAsync(`${name}: unavailable helper falls back once, user cancellation never reopens`, async () => {
      const commands = [];
      await assert.rejects(picker({ platform: 'linux', runner: async (command) => {
        commands.push(command);
        return command === 'zenity' ? { error: { code: 'ENOENT' } } : { error: { code: 1 }, status: 1, stdout: '' };
      } }), (error) => error.code === cancelCode);
      assert.deepStrictEqual(commands, ['zenity', 'kdialog']);
      let calls = 0;
      await assert.rejects(picker({ platform: 'linux', runner: async () => { calls++; return { status: 0, stdout: marker }; } }), (error) => error.code === cancelCode);
      assert.strictEqual(calls, 1);
      const result = await picker({ ...validation, platform: 'linux', runner: async () => ({ status: 0, stdout: output }) });
      if (name === 'files') assert.strictEqual(result[0].sourcePath, selectedPath);
      else assert.strictEqual(result, name === 'completed' ? 2 : path.dirname(selectedPath));
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
        await assert.rejects(pending, (error) => error.code === cancelCode);
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

  await testAsync('privacy folder: cancellation owns and aborts only its asynchronous dialog', async () => {
    const controller = new AbortController();
    let observed;
    await assert.rejects(pickFolderAsync({ platform: 'win32', signal: controller.signal, runner: async (_c, _a, _i, _e, signal) => {
      observed = signal; controller.abort(); return { status: 0, stdout: path.dirname(selectedPath) };
    } }), (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
    assert.strictEqual(observed, controller.signal);
    await assert.rejects(pickFolderAsync({ platform: 'win32', runner: async () => ({ status: 0, stdout: FOLDER_PICKER_CANCELLED }) }),
      (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
  });
  done();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
