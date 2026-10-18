'use strict';
// Abrupt deaths of BOTH real test processes: fresh Node document store +
// NativeExportChannel -> real Rust broker/transaction/filesystem. The parent
// merely relays private frames and owns both ChildProcess objects for killing.
// This Rust libtest pipe is NOT Tauri, a packaged desktop or a native M2 test.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const readline = require('node:readline'), { spawn } = require('node:child_process');
const repo = path.resolve(__dirname, '..'), crate = path.join(repo, 'apps/datasecure-standalone/tauri-contract');
const helper = 'native_export_broker::tests::pipe_helper';
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-export-chain-kill-'));
const evidence = [];
let nativeBinarySha256;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function ownProcess(file, args, options = {}) {
  const child = spawn(file, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], ...options });
  const ended = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
  // Windows can emit EPIPE while the counterpart's exact process is killed.
  child.stdin?.on('error', () => {});
  return { child, ended };
}
async function testExecutable() {
  const cargo = ownProcess('cargo', ['test', '--locked', '--no-run', '--message-format=json'], { cwd: crate });
  let binary, stderr = '';
  cargo.child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-16000); });
  readline.createInterface({ input: cargo.child.stdout }).on('line', line => {
    let value; try { value = JSON.parse(line); } catch { return; }
    if (value.reason === 'compiler-artifact' && value.profile?.test && value.executable && value.target?.name === 'datasecure-standalone') binary = value.executable;
  });
  const result = await cargo.ended;
  assert.equal(result.code, 0, `native test-only helper build failed: ${stderr}`);
  assert.ok(binary, 'Cargo must name the actual freshly built native test executable');
  return binary;
}
function launch(binary, directory, mode, cut, start) {
  const native = ownProcess(binary, ['--exact', helper, '--ignored', '--nocapture', '--test-threads=1'], { cwd: crate });
  const node = ownProcess(process.execPath, [path.join(__dirname, 'helpers/native-export-recovery-child.cjs'), directory, mode, cut, start],
    { cwd: repo, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
  const commands = [], queue = [], waits = []; let stderr = '', failure;
  for (const process of [native, node]) process.child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-16000); });
  const receive = message => {
    const index = waits.findIndex(waiter => waiter.type === message.type);
    if (index >= 0) { const [waiter] = waits.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(message); }
    else queue.push(message);
  };
  const fail = error => {
    failure = error;
    for (const waiter of waits.splice(0)) { clearTimeout(waiter.timer); waiter.reject(error); }
  };
  node.child.on('message', message => {
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
    native.child.stdin.write(`${JSON.stringify(payload)}\n`);
  });
  readline.createInterface({ input: native.child.stdout }).on('line', line => {
    const cutMarker = line.indexOf('NATIVE_KILL_READY:');
    if (cutMarker >= 0) { receive({ type: 'checkpoint', phase: line.slice(cutMarker + 18) }); return; }
    const marker = line.indexOf('NATIVE:'); if (marker < 0) return;
    try {
      const reply = JSON.parse(line.slice(marker + 7));
      if (reply.harness_error) throw Error(reply.harness_error);
      if (node.child.connected) node.child.send({ type: 'reply', reply }, error => { if (error) fail(error); });
    } catch (error) { fail(error); }
  });
  const wait = type => {
    if (failure) return Promise.reject(failure);
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
    // Only processes created by this launch are addressed, never recorded PIDs
    // or a broad process-tree command. Wait for both handles before reopening.
    for (const waiter of waits.splice(0)) { clearTimeout(waiter.timer); waiter.reject(Error('Test processes stopped')); }
    if (abrupt) {
      if (node.child.exitCode === null && node.child.signalCode === null) node.child.kill('SIGKILL');
      if (native.child.exitCode === null && native.child.signalCode === null) native.child.kill('SIGKILL');
    } else {
      if (node.child.connected) node.child.send({ type: 'stop' });
      native.child.stdin.end();
    }
    const exits = await Promise.allSettled([node.ended, native.ended]);
    // Await every owned process even if one failed to spawn or emit a clean
    // result; one rejected Promise must not skip waiting for its counterpart.
    for (const value of exits) if (value.status === 'rejected') throw value.reason;
    const result = exits.map(value => value.value);
    if (requireKilled) assert.ok(result.every(value => value.code !== 0 || value.signal), 'both processes must be terminated without graceful cleanup');
    else if (!abrupt) assert.ok(result.every(value => value.code === 0), `fresh chain must exit cleanly: ${JSON.stringify(result)} ${stderr}`);
    return result;
  };
  let id = 0;
  const command = async command => {
    const expected = ++id; node.child.send({ type: 'command', command, id: expected });
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
  } finally { if (active) await active.stop(true); }
}
(async () => {
  try {
    const binary = await testExecutable();
    nativeBinarySha256 = digest(fs.readFileSync(binary));
    for (const mode of ['markdown-only', 'markdown-and-anonymize']) {
      for (const cut of ['node_intent', 'before_rename', 'after_rename', 'after_ack']) await scenario(binary, mode, cut);
    }
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally {
    // Strictly synthetic and deliberately interrupted evidence is retained.
    // No recursive cleanup or real profile/result path is involved.
    fs.writeFileSync(path.join(root, 'campaign.json'), JSON.stringify({ schema: 'datasecure-test-export-chain-death/1',
      scope: 'headless Node store + Rust libtest pipe; NOT GUI/package/M2', completed: evidence.length,
      expected: 8, node: process.version, platform: process.platform, architecture: process.arch,
      native_test_binary_sha256: nativeBinarySha256, cases: evidence }, null, 2));
    console.log(`Synthetic export-chain death evidence: ${root}`);
  }
})();
