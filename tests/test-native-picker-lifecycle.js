'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const childProcess = require('child_process');
const { createRequire } = require('node:module');
const { batchNextAction } = require('../plugins/data-secure/server/gateway/batch-next-action');
const { createBatchProgress } = require('../plugins/data-secure/server/gateway/batch-progress');
const { ipcAcknowledgementCause } = require('../plugins/data-secure/server/gateway/diagnostic-causes');
const { createSuite } = require('./helpers');
const { pickSourcesAsync, PICKER_CANCELLED, batchQueueFromSelection } = require('../plugins/data-secure/server/companion/file-picker');
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
    const code = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/mcp-server.js'), 'utf8');
    const source = code.slice(code.indexOf('let nativeInteractionOwner='), code.indexOf('function continueAnonymizedBatchInChat('));
    assert.ok(source.includes('async function startPickerBatch('));
    let starts = 0;
    let reservationHeld = false;
    let cancelOnAccepted = true;
    let controller = new AbortController();
    const context = vm.createContext({
      process: { env: {} }, setImmediate, ipcAcknowledgementCause,
      readConfiguredResultRoot: () => 'already-configured',
      reserveIntake: () => { if (reservationHeld) throw new Error('held'); reservationHeld = true; return { reservation_id: 'd'.repeat(64) }; },
      releaseIntake: () => { reservationHeld = false; return true; },
      genericStatus: (options) => { assert.strictEqual(options.ignoreIntakeReservation, true); return { engine_ready: true }; },
      pickSourcesAsync: async () => [{ sourcePath: selectedPath, sourceBytes: 12 }],
      batchQueueFromSelection,
      recordWorkflowEvent: (event) => { if (cancelOnAccepted && event.event === 'picker_selection_accepted') controller.abort(); },
      startLocalIntakeExecutor: (_selected, _profile, options) => { starts++; reservationHeld = false; assert.match(options.intakeReservationId, /^[a-f0-9]{64}$/); return { ok: true, local_intake_pending: true, ipcAcknowledgement: Promise.resolve() }; },
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
    const code = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/mcp-server.js'), 'utf8');
    const source = code.slice(code.indexOf('let nativeInteractionOwner='), code.indexOf('function continueAnonymizedBatchInChat('));
    let configured = false;
    let resultPickerCalls = 0;
    let sourcePickerCalls = 0;
    let reservationHeld = false;
    const resultRoot = path.resolve(__dirname, 'synthetic-cowork-root');
    const context = vm.createContext({
      require, process: { env: {} }, setImmediate, ipcAcknowledgementCause,
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
      batchQueueFromSelection,
      recordWorkflowEvent: () => {},
      startLocalIntakeExecutor: () => { reservationHeld = false; return { ok: true, local_intake_pending: true, ipcAcknowledgement: Promise.resolve() }; },
      localOnlyStartResponse: () => ({ ok: true, next_action: 'local_intake_accepted_checkpoint_pending' })
    });
    vm.runInContext(source, context);
    assert.strictEqual((await context.startPickerBatch({})).ok, true);
    assert.strictEqual((await context.startPickerBatch({})).ok, true);
    assert.strictEqual(resultPickerCalls, 1, 'the persistent result choice is not repeated');
    assert.strictEqual(sourcePickerCalls, 2, 'each new batch still asks for its sources');
  });

  await testAsync('readiness and active-processing guards run before the one-time result-folder picker', async () => {
    const code = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/mcp-server.js'), 'utf8');
    const source = code.slice(code.indexOf('let nativeInteractionOwner='), code.indexOf('function continueAnonymizedBatchInChat('));
    for (const status of [
      { engine_ready: false, local_intake_pending: false, batch_processing_active: false },
      { engine_ready: true, local_intake_pending: false, batch_processing_active: true }
    ]) {
      let resultPickerCalls = 0;
      let sourcePickerCalls = 0;
      let reservationHeld = false;
      const context = vm.createContext({
        require, process: { env: {} }, setImmediate, ipcAcknowledgementCause,
        SafeError: class SafeError extends Error {},
        readConfiguredResultRoot: () => '',
        reserveIntake: () => { reservationHeld = true; return { reservation_id: 'e'.repeat(64) }; },
        releaseIntake: () => { reservationHeld = false; return true; },
        genericStatus: () => ({ ...status }),
        pickFolderAsync: async () => { resultPickerCalls++; return path.resolve(__dirname); },
        pickSourcesAsync: async () => { sourcePickerCalls++; return []; },
        recordWorkflowEvent: () => {},
        withDiagnostic: (response) => response
      });
      vm.runInContext(source, context);
      const result = await context.startPickerBatch({});
      assert.strictEqual(result.ok, false);
      assert.strictEqual(resultPickerCalls, 0, 'no destination dialog opens for a run that cannot start');
      assert.strictEqual(sourcePickerCalls, 0, 'no source dialog opens for a run that cannot start');
      assert.strictEqual(reservationHeld, false, 'the rejected readiness probe releases its intake reservation');
    }
  });

  await testAsync('an unusable result folder is never persisted', async () => {
    const code = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/mcp-server.js'), 'utf8');
    const source = code.slice(code.indexOf('let nativeInteractionOwner='), code.indexOf('function continueAnonymizedBatchInChat('));
    const resultRoot = path.resolve(__dirname, 'synthetic-unusable-result-root');
    let saves = 0;
    const context = vm.createContext({
      require, process: { env: {} }, setImmediate, ipcAcknowledgementCause,
      SafeError: class SafeError extends Error {},
      roots: () => ({ root: path.resolve(__dirname, 'synthetic-private-root') }),
      pickFolderAsync: async () => resultRoot,
      resultOutputDirectory: () => { throw new Error('synthetic access denied'); },
      saveConfiguredResultRoot: () => { saves++; },
      isCommonSyncFolder: () => false,
      recordWorkflowEvent: () => {}
    });
    vm.runInContext(source, context);
    await assert.rejects(() => context.chooseAndSaveResultFolder({}), /access denied/iu);
    assert.strictEqual(saves, 0, 'validation and output creation must complete before the choice is stored');
  });

  await testAsync('a rejected result folder reports its honest, path-free reason and reopens next time', async () => {
    const code = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/mcp-server.js'), 'utf8');
    const source = code.slice(code.indexOf('let nativeInteractionOwner='), code.indexOf('function continueAnonymizedBatchInChat('));
    class SafeError extends Error {}
    const privateRoot = path.resolve(__dirname, 'synthetic-private-root');
    let outputFailure = null;
    let saves = 0;
    let sourcePickerCalls = 0;
    const context = vm.createContext({
      require, process: { env: {} }, setImmediate, SafeError, ipcAcknowledgementCause,
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

  await testAsync('a continuation never starts a second executor next to a running intake or batch (DS-022)', async () => {
    const serverPath = path.join(__dirname, '../plugins/data-secure/server/mcp-server.js');
    const code = fs.readFileSync(serverPath, 'utf8');
    const source = code.slice(code.indexOf('async function continueMostRecentDocumentBatch('), code.indexOf('const LOCAL_ONLY_HANDOFF='));
    assert.ok(source.includes('batch_active'), 'the continuation guard must exist');
    let continuations = 0;
    let batchStarts = 0;
    let reviewStarts = 0;
    let acknowledgement = Promise.resolve();
    let deferredReview = 0;
    const { publicProgress } = createBatchProgress({
      deliveryPendingStatus: 'delivery_pending', deferredReviewStatus: 'deferred_review',
      mappingPendingStatus: 'mapping_pending', liveLocalExecutor: () => false, publishedPackageRecord: () => null
    });
    const status = { local_intake_pending: false, batch_processing_active: false };
    const context = vm.createContext({
      // The isolated function retains its production dependencies, including
      // the server-relative progress formatter used by the safe projection.
      batchNextAction, ipcAcknowledgementCause, require: createRequire(serverPath),
      RESOURCE_LIMITS: require('../plugins/data-secure/server/resource-limits').RESOURCE_LIMITS,
      genericStatus: () => ({ ...status }),
      continueMostRecentBatch: () => { continuations++; return { ok: true, ...publicProgress({
        token: 'c'.repeat(64), items: [{ status: deferredReview ? 'deferred_review' : 'pending' }]
      }) }; },
      startLocalBatchExecutor: () => { batchStarts++; return { ok: true, local_processing_started: true, ipcAcknowledgement: acknowledgement }; },
      startLocalReviewExecutor: () => { reviewStarts++; return { ok: true, local_review_started: true, ipcAcknowledgement: acknowledgement }; },
      recordWorkflowEvent: () => {},
      withDiagnostic: (response) => response
    });
    vm.runInContext(source, context);
    for (const active of [{ local_intake_pending: true }, { batch_processing_active: true }]) {
      Object.assign(status, { local_intake_pending: false, batch_processing_active: false }, active);
      const blocked = await context.continueMostRecentDocumentBatch();
      assert.strictEqual(blocked.ok, false);
      assert.strictEqual(blocked.error, 'batch_active');
      assert.strictEqual(blocked.local_processing_started, false);
      assert.strictEqual(blocked.next_action, 'wait_for_local_release_before_retry');
      assert.doesNotMatch(JSON.stringify(blocked), /batch_token|[a-f0-9]{64}/u);
    }
    assert.strictEqual(continuations, 0, 'no durable continuation is touched while another executor lives');
    assert.strictEqual(batchStarts + reviewStarts, 0, 'no second worker is launched');
    Object.assign(status, { local_intake_pending: false, batch_processing_active: false });
    const resumed = await context.continueMostRecentDocumentBatch();
    assert.strictEqual(resumed.ok, true);
    assert.strictEqual(resumed.local_processing_started, true);
    assert.strictEqual(continuations, 1);
    assert.strictEqual(batchStarts, 1);
    assert.doesNotMatch(JSON.stringify(resumed), /batch_token|[a-f0-9]{64}/u, 'the token never crosses the MCP boundary');

    acknowledgement = Promise.reject(new Error('bounded IPC acknowledgement timeout'));
    const failedBatch = await context.continueMostRecentDocumentBatch();
    assert.strictEqual(failedBatch.ok, false);
    assert.strictEqual(failedBatch.local_processing_started, false);
    assert.strictEqual(failedBatch.raw_content_sent_to_claude, false);
    assert.doesNotMatch(JSON.stringify(failedBatch), /batch_token|[a-f0-9]{64}|timeout/u,
      'worker acknowledgement details never cross the MCP boundary');

    deferredReview = 1;
    acknowledgement = Promise.reject(new Error('worker ended before IPC acknowledgement'));
    const failedReview = await context.continueMostRecentDocumentBatch();
    assert.strictEqual(failedReview.ok, false);
    assert.strictEqual(failedReview.local_review_started, false);
    assert.strictEqual(failedReview.raw_content_sent_to_claude, false);
    assert.strictEqual(batchStarts, 2);
    assert.strictEqual(reviewStarts, 1, 'the real readiness helper selects the review executor');
    assert.doesNotMatch(JSON.stringify(failedReview), /batch_token|[a-f0-9]{64}|worker ended/u);
  });

  await testAsync('privacy-root mutation and source intake share one native interaction owner', async () => {
    const code = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/mcp-server.js'), 'utf8');
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
      process: { env: {} }, setImmediate, ipcAcknowledgementCause,
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
      batchQueueFromSelection,
      recordWorkflowEvent: () => {},
      startLocalIntakeExecutor: (_selected, _profile, options) => { starts++; reservationHeld = false; assert.match(options.intakeReservationId, /^[a-f0-9]{64}$/); return { ok: true, local_intake_pending: true, ipcAcknowledgement: Promise.resolve() }; },
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

  await testAsync('a deliberately rejected selection names its path-free reason instead of a generic start failure', async () => {
    const code = fs.readFileSync(path.join(__dirname, '../plugins/data-secure/server/mcp-server.js'), 'utf8');
    const source = code.slice(code.indexOf('let nativeInteractionOwner='), code.indexOf('function continueAnonymizedBatchInChat('));
    class SafeError extends Error {}
    const { buildDiagnostic, causeFromError, CAUSES } = require('../plugins/data-secure/server/gateway/diagnostic-causes');
    const events = [];
    const run = async (failure) => {
      let starts = 0;
      const context = vm.createContext({
        process: { env: {} }, setImmediate, SafeError, buildDiagnostic, causeFromError, ipcAcknowledgementCause,
        readConfiguredResultRoot: () => 'already-configured',
        reserveIntake: () => ({ reservation_id: 'd'.repeat(64) }),
        releaseIntake: () => true,
        genericStatus: () => ({ engine_ready: true }),
        pickSourceFolderAsync: async () => path.dirname(selectedPath),
        enumerateSourceFolderAsync: async () => { throw failure; },
        pickSourcesAsync: async () => { throw failure; },
        batchQueueFromSelection,
        recordWorkflowEvent: (event) => { events.push(event); },
        startLocalIntakeExecutor: () => { starts++; return { ok: true, local_intake_pending: true, ipcAcknowledgement: Promise.resolve() }; },
        localOnlyStartResponse: (started) => ({ ok: started.ok })
      });
      vm.runInContext(source, context);
      const result = await context.startPickerBatch({ source_kind: 'folder' }, {});
      assert.strictEqual(starts, 0, 'no worker starts after a rejected selection');
      return result;
    };
    const rejected = await run(new SafeError('Der ausgewählte Ordner enthält 7 reguläre Dateien, davon 3 nicht freigegebene oder unbekannte Formate. Es wurde kein Stapel gestartet.'));
    assert.strictEqual(rejected.ok, false);
    assert.strictEqual(rejected.error, 'local_selection_rejected');
    assert.strictEqual(rejected.next_action, 'choose_other_selection');
    assert.match(rejected.message, /7 reguläre Dateien, davon 3 nicht freigegebene/u);
    assert.strictEqual((rejected.message.match(/Es wurde kein Stapel gestartet./gu) || []).length, 1, 'the closing sentence appears once');
    assert.doesNotMatch(JSON.stringify(rejected), /[A-Z]:[\/]|personnel|.txt/u);
    assert.ok(events.some((event) => event.event === 'picker_failed' && event.error_code === 'LOCAL_SELECTION_REJECTED'));
    // The content-free diagnostic names version, phase, cause, hint and counters.
    assert.strictEqual(rejected.diagnostic.cause, 'LOCAL_SELECTION_REJECTED');
    assert.strictEqual(rejected.diagnostic.phase, 'folder_enumeration');
    assert.strictEqual(rejected.diagnostic.hint, CAUSES.LOCAL_SELECTION_REJECTED);
    assert.deepStrictEqual([rejected.diagnostic.files_total, rejected.diagnostic.files_rejected], [7, 3]);
    assert.match(rejected.diagnostic.gateway_version, /^\d+\.\d+\.\d+/u);
    const boundedFolder = await run(Object.assign(new SafeError('Der ausgewählte Ordner enthält mehr als 200 unterstützte Dateien.'), {
      code: 'SOURCE_FOLDER_FILE_LIMIT'
    }));
    assert.strictEqual(boundedFolder.error, 'local_selection_rejected',
      'a shared recursive-folder policy error is not a Cowork picker failure');
    assert.strictEqual(boundedFolder.next_action, 'choose_other_selection');
    assert.match(boundedFolder.message, /mehr als 200 unterstützte Dateien/u);
    assert.strictEqual(boundedFolder.diagnostic.cause, 'LOCAL_SELECTION_REJECTED');
    const timeout = await run(Object.assign(new SafeError('Die lokale Ordnerauswahl wurde wegen Zeitüberschreitung beendet.'), { code: 'LOCAL_PICKER_TIMEOUT' }));
    assert.strictEqual(timeout.error, 'local_start_failed', 'a picker infrastructure failure is not a selection rejection');
    assert.strictEqual(timeout.diagnostic.cause, 'LOCAL_PICKER_TIMEOUT');
    assert.match(timeout.message, /^Die lokale Ordnerauswahl wurde wegen Zeitüberschreitung beendet. Die lokale Auswahl konnte nicht sicher vorbereitet werden/u);
    assert.ok(events.some((event) => event.error_code === 'LOCAL_PICKER_TIMEOUT'));
    const link = await run(new SafeError('Der ausgewählte Quellordner liegt hinter einem Link oder Reparse-Punkt.'));
    assert.strictEqual(link.error, 'local_selection_rejected');
    assert.match(link.message, /Reparse-Punkt. Es wurde kein Stapel gestartet.$/u);
    const generic = await run(Object.assign(new Error('ENOENT private C:\\secret\\file.txt'), { code: 'ENOENT' }));
    assert.strictEqual(generic.error, 'local_start_failed', 'unexpected errors stay a generic, content-free start failure');
    assert.strictEqual(generic.diagnostic.cause, 'LOCAL_PICKER_FAILED', 'unknown native codes never leak; the fallback cause applies');
    assert.doesNotMatch(JSON.stringify(generic), /secret|ENOENT/u);
    assert.ok(events.some((event) => event.error_code === 'LOCAL_PICKER_FAILED'));
  });

  await testAsync('privacy folder: cancellation owns and aborts only its asynchronous dialog', async () => {
    const controller = new AbortController();
    let observed;
    await assert.rejects(pickFolderAsync({ platform: 'win32', signal: controller.signal, runner: async (_c, _a, _i, _e, signal) => {
      observed = signal; controller.abort(); return { status: 0, stdout: path.dirname(selectedPath) };
    } }), (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
    assert.strictEqual(observed, controller.signal);
    await assert.rejects(pickFolderAsync({ platform: 'win32', runner: async () => ({ status: 0, stdout: FOLDER_PICKER_CANCELLED }) }),
      (error) => error.code === 'LOCAL_SELECTION_CANCELLED');
    await assert.rejects(pickFolderAsync({ platform: 'win32', purpose: 'result', runner: async () => ({ status: 0, stdout: FOLDER_PICKER_CANCELLED }) }),
      (error) => error.code === 'LOCAL_SELECTION_CANCELLED' && /Ergebnisordners/u.test(error.message));
  });
  done();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
