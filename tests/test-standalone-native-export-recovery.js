'use strict';
// Abrupt deaths of BOTH real test processes: fresh Node document store +
// NativeExportChannel -> real Rust broker/transaction/filesystem. The parent
// merely relays private frames and owns both ChildProcess objects for killing.
// This Rust libtest pipe is NOT Tauri, a packaged desktop or a native M2 test.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const readline = require('node:readline'), { spawn } = require('node:child_process');
const { firstFailure, within, ownChild, endTestCliFailure } = require('./helpers/qa-parent-lifecycle.cjs');
const secondary = () => { try { process.stderr.write('NATIVE_RECOVERY_SECONDARY_FAILURE\n'); } catch {} };
const repo = path.resolve(__dirname, '..'), crate = path.join(repo, 'apps/datasecure-standalone/tauri-contract');
const helper = 'native_export_broker::tests::pipe_helper';
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-export-chain-kill-'));
const evidence = [], ownedProcesses = [];
const campaignFailure = firstFailure(secondary);
let nativeBinarySha256;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function ownProcess(file, args, options = {}, onError) {
  const child = spawn(file, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], ...options });
  const owned = ownChild(child, error => {
    campaignFailure.record(error); onError?.(error);
  });
  ownedProcesses.push(owned);
  // Windows can emit EPIPE while the counterpart's exact process is killed.
  child.stdin?.on('error', () => {});
  return { child, owned, ended: owned.done };
}
async function testExecutable() {
  const cargo = ownProcess('cargo', ['test', '--locked', '--no-run', '--message-format=json'], { cwd: crate });
  let binary, stderr = '';
  cargo.child.stderr?.on('data', bytes => { stderr = (stderr + bytes).slice(-16000); });
  if (cargo.child.stdout) readline.createInterface({ input: cargo.child.stdout }).on('line', line => {
    let value; try { value = JSON.parse(line); } catch { return; }
    if (value.reason === 'compiler-artifact' && value.profile?.test && value.executable && value.target?.name === 'datasecure-standalone') binary = value.executable;
  });
  const result = await Promise.race([cargo.ended, cargo.owned.error.then(error => { throw error; })]);
  cargo.owned.failure.throwIfFailed();
  assert.equal(result.code, 0, `native test-only helper build failed: ${stderr}`);
  assert.ok(binary, 'Cargo must name the actual freshly built native test executable');
  return binary;
}
function launch(binary, directory, mode, cut, start) {
  const commands = [], queue = [], waits = [], processes = [];
  const failure = firstFailure(secondary);
  let stderr = '', native, node, stopping = false;
  const fail = error => {
    failure.record(error);
    for (const waiter of waits.splice(0)) { clearTimeout(waiter.timer); waiter.reject(failure.value); }
  };
  try {
    native = ownProcess(binary, ['--exact', helper, '--ignored', '--nocapture', '--test-threads=1'], { cwd: crate }, fail);
    processes.push(native);
    node = ownProcess(process.execPath, [path.join(__dirname, 'helpers/native-export-recovery-child.cjs'), directory, mode, cut, start],
      { cwd: repo, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] }, fail);
    processes.push(node);
  } catch (error) { fail(error); } // Keep any already created counterpart owned.
  for (const process of processes) process.child.stderr?.on('data', bytes => { stderr = (stderr + bytes).slice(-16000); });
  const replyFailure = error => {
    // Deliberate two-process death can close an in-flight private reply.
    if (stopping && ['EPIPE', 'ERR_IPC_CHANNEL_CLOSED'].includes(error?.code)) return;
    if (error) fail(error);
  };
  const receive = message => {
    const index = waits.findIndex(waiter => waiter.type === message.type);
    if (index >= 0) { const [waiter] = waits.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(message); }
    else queue.push(message);
  };
  if (node) node.child.on('message', message => {
    try {
      if (message.type === 'worker_error') { fail(Error(message.error)); return; }
      if (message.type !== 'frame') { receive(message); return; }
      commands.push(message.frame.command || message.frame.action);
      if (cut === 'node_intent' && message.frame.command === 'write_body') {
        // The production Node store sent this frame only after its real durable
        // operation intent. Do not forward it: no native body work happened yet.
        receive({ type: 'checkpoint', phase: cut }); return;
      }
      const payload = { data: path.join(directory, 'private'), outer: message.outer, frame: message.frame,
        test_cut: cut === 'node_intent' ? '' : cut };
      native?.child.stdin?.write(`${JSON.stringify(payload)}\n`);
    } catch (error) { fail(error); }
  });
  if (native?.child.stdout) readline.createInterface({ input: native.child.stdout }).on('line', line => {
    const cutMarker = line.indexOf('NATIVE_KILL_READY:');
    if (cutMarker >= 0) { receive({ type: 'checkpoint', phase: line.slice(cutMarker + 18) }); return; }
    const marker = line.indexOf('NATIVE:'); if (marker < 0) return;
    try {
      const reply = JSON.parse(line.slice(marker + 7));
      if (reply.harness_error) throw Error(reply.harness_error);
      if (node?.child.connected && typeof node.child.send === 'function') node.child.send({ type: 'reply', reply }, replyFailure);
    } catch (error) { fail(error); }
  });
  const wait = type => {
    if (failure.failed) return Promise.reject(failure.value);
    const index = queue.findIndex(message => message.type === type);
    if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { type, resolve, reject, timer: setTimeout(() => {
        waits.splice(waits.indexOf(waiter), 1); reject(Error(`Missing ${type}: ${stderr}`));
      }, 25000) };
      waits.push(waiter);
    });
  };
  const stop = async (abrupt, requireKilled = false) => {
    stopping = true;
    // Only processes created by this launch are addressed, never recorded PIDs
    // or a broad process-tree command. Wait for both handles before reopening.
    for (const waiter of waits.splice(0)) { clearTimeout(waiter.timer); waiter.reject(Error('Test processes stopped')); }
    if (abrupt) {
      for (const process of processes) {
        try { process.owned.terminate('SIGKILL'); } catch (error) { fail(error); }
      }
    } else {
      try { if (node?.child.connected && typeof node.child.send === 'function') node.child.send({ type: 'stop' }, replyFailure); }
      catch (error) { fail(error); }
      try { native?.child.stdin?.end(); } catch (error) { fail(error); }
    }
    let result;
    try {
      // Error events are already observed. These witnesses settle only on close.
      result = await within(Promise.all([node, native].filter(Boolean).map(process => process.ended)),
        6000, 'NATIVE_RECOVERY_CLOSE_UNCONFIRMED');
    } catch (error) { fail(error); }
    failure.throwIfFailed();
    if (requireKilled) assert.ok(result.every(value => value.code !== 0 || value.signal), 'both processes must be terminated without graceful cleanup');
    else if (!abrupt) assert.ok(result.every(value => value.code === 0), `fresh chain must exit cleanly: ${JSON.stringify(result)} ${stderr}`);
    return result;
  };
  let id = 0;
  const command = async command => {
    failure.throwIfFailed();
    const expected = ++id;
    if (node?.child.connected && typeof node.child.send === 'function')
      node.child.send({ type: 'command', command, id: expected }, error => { if (error) fail(error); });
    const answer = await wait('result'); assert.equal(answer.id, expected); return answer;
  };
  return { commands, wait, stop, command };
}
function copyInventory(directory, descriptor) {
  const output = path.join(directory, 'public', descriptor.mode === 'markdown-only' ? 'DataSecure-Markdown-Korrektur' : 'DataSecure-KI-Export');
  const names = fs.readdirSync(output).sort(), target = path.join(output, `Export-${descriptor.operationId}`);
  assert.ok(names.every(name => name === `Export-${descriptor.operationId}`), 'no new or suffixed operation/copy may appear');
  if (!fs.existsSync(target)) return { folders: 0 };
  const entries = fs.readdirSync(target).sort();
  assert.deepEqual(entries, descriptor.expected.map(value => value.name).sort());
  for (const value of descriptor.expected) assert.equal(fs.readFileSync(path.join(target, value.name), 'utf8'), value.text);
  return { folders: names.length, files: entries.map(name => ({ name, sha256: digest(fs.readFileSync(path.join(target, name))) })) };
}
async function scenario(binary, mode, cut) {
  const directory = path.join(root, `${mode}-${cut}`); fs.mkdirSync(directory, { mode: 0o700 });
  for (const child of ['private', 'public', 'packages']) fs.mkdirSync(path.join(directory, child), { mode: 0o700 });
  let active = launch(binary, directory, mode, cut, 'create');
  const primary = firstFailure(secondary);
  try {
    const { descriptor } = await active.wait('fixture');
    const checkpoint = await active.wait('checkpoint'); assert.equal(checkpoint.phase, cut);
    const run = path.join(directory, 'private/document-reviews', descriptor.batchId);
    const intentFile = path.join(run, `export-${descriptor.operationId}.json`);
    const intentBytes = fs.readFileSync(intentFile), intent = JSON.parse(intentBytes);
    assert.equal(intent.operation_id, descriptor.operationId); assert.deepEqual(intent.selection, descriptor.selection);
    const complete = path.join(run, `export-${descriptor.operationId}-complete.json`);
    const acknowledged = path.join(run, `export-${descriptor.operationId}-acknowledged.json`);
    assert.equal(fs.existsSync(complete), cut === 'after_ack'); assert.equal(fs.existsSync(acknowledged), false);
    const beforeDeath = copyInventory(directory, descriptor);
    assert.equal(beforeDeath.folders, ['after_rename', 'after_ack'].includes(cut) ? 1 : 0);
    const killed = await active.stop(true, true); active = null;
    const afterDeath = copyInventory(directory, descriptor); assert.deepEqual(afterDeath, beforeDeath);
    active = launch(binary, directory, mode, '', 'reopen');
    const reopened = (await active.wait('reopened')).snapshot;
    assert.deepEqual(active.commands, [], 'opening old state must not republish or ACK anything');
    assert.deepEqual(reopened.documents.map(({ approved, ...value }) => { assert.equal(approved, true); return value; }),
      descriptor.selection.map(({ document_id, output_sha256, revision }) => ({ document_id, revision, output_sha256 })));
    assert.equal(reopened.pending_exports.length, 1);
    assert.equal(reopened.pending_exports[0].operation_id, descriptor.operationId);
    assert.deepEqual(reopened.pending_exports[0].selection, descriptor.selection);
    const beforeAck = active.commands.length, ack = await active.command('ack');
    assert.deepEqual(active.commands.slice(beforeAck), ['acknowledge'], 'explicit ACK never streams a body or starts another publication');
    if (['node_intent', 'before_rename'].includes(cut)) {
      assert.equal(ack.ok, false); assert.equal(ack.error_code, 'AI_EXPORT_INCOMPLETE');
      assert.equal(ack.snapshot.summary.current_exported_count, 0);
      assert.equal(copyInventory(directory, descriptor).folders, 0);
      const resumeAt = active.commands.length;
      const resumed = await active.command('resume'); assert.equal(resumed.ok, true);
      assert.equal(resumed.value.operation_id, descriptor.operationId); assert.equal(resumed.value.exported_count, 2);
      assert.deepEqual(active.commands.slice(resumeAt), cut === 'before_rename' ? ['reconcile', 'publish'] :
        ['reconcile', 'write_body', 'write_body', 'publish'], 'explicit resume reuses the exact prepared stage or original bound bodies');
      assert.equal((await active.command('ack')).ok, true);
    } else {
      assert.equal(ack.ok, true); assert.equal(ack.value.operation_id, descriptor.operationId);
      assert.equal(ack.snapshot.summary.pending_confirmation_count, 0);
      assert.equal(ack.snapshot.summary.current_exported_count, 2);
      assert.deepEqual(copyInventory(directory, descriptor), beforeDeath, 'receipt reconciliation preserves existing exact bytes');
    }
    const repeated = await active.command('ack'); assert.equal(repeated.ok, true);
    assert.equal(repeated.snapshot.summary.pending_confirmation_count, 0);
    assert.equal(repeated.snapshot.summary.current_exported_count, 2);
    assert.equal(copyInventory(directory, descriptor).folders, 1);
    assert.deepEqual(fs.readdirSync(run).filter(name => /^export-[a-f0-9]{32}\.json$/u.test(name)), [`export-${descriptor.operationId}.json`]);
    assert.equal(digest(fs.readFileSync(intentFile)), digest(intentBytes), 'same immutable operation/selection survives fresh processes');
    await active.stop(false); active = null;
    evidence.push({ mode, cut, killed, operation_id: descriptor.operationId, intent_sha256: digest(intentBytes),
      before_death: beforeDeath, final: copyInventory(directory, descriptor), pending_confirmation_count: 0 });
    console.log(`ok ${mode}/${cut}: real two-process death, immutable selection, explicit same-operation recovery, one exact copy`);
  } catch (error) { primary.record(error); }
  finally {
    if (active) { try { await active.stop(true); } catch (error) { primary.record(error); } }
  }
  primary.throwIfFailed();
}
(async () => {
  const primary = campaignFailure;
  try {
    const binary = await testExecutable();
    nativeBinarySha256 = digest(fs.readFileSync(binary));
    for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
      for (const cut of ['node_intent', 'before_rename', 'after_rename', 'after_ack']) await scenario(binary, mode, cut);
    }
  } catch (error) { primary.record(error); }
  finally {
    // Attempt every known own teardown, including a partially launched pair/Cargo.
    for (const owned of ownedProcesses) {
      try { owned.terminate('SIGKILL'); } catch (error) { primary.record(error); }
    }
    try { await within(Promise.all(ownedProcesses.map(owned => owned.done)),
      6000, 'NATIVE_RECOVERY_CLOSE_UNCONFIRMED'); }
    catch (error) { primary.record(error); }
    for (const owned of ownedProcesses) if (owned.failure.failed) primary.record(owned.failure.value);
    try {
      // Strictly synthetic and deliberately interrupted evidence is retained.
      // No recursive cleanup or real profile/result path is involved.
      fs.writeFileSync(path.join(root, 'campaign.json'), JSON.stringify({ schema: 'datasecure-test-export-chain-death/1',
        scope: 'headless Node store + Rust libtest pipe; NOT GUI/package/M2', completed: evidence.length,
        expected: 8, node: process.version, platform: process.platform, architecture: process.arch,
        native_test_binary_sha256: nativeBinarySha256, cases: evidence }, null, 2));
      console.log(`Synthetic export-chain death evidence: ${root}`);
    } catch (error) { primary.record(error); }
  }
  primary.throwIfFailed();
})().catch(error => endTestCliFailure({ failed: true, error, retainedRoots: [root],
  unconfirmedChildren: ownedProcesses.some(owned => !owned.closed) }));
