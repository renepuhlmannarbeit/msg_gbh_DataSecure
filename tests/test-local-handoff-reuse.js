'use strict';

// Real input files -> production anonymizer -> atomic packages / durable batch
// journals -> production candidate discovery, capabilities, snapshots and replay.
// Only the human's native-picker selection is supplied by this automated test.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { testAsync, assert, done } = createSuite('Explicit completed-batch reuse');
const base = fs.mkdtempSync(path.join(__dirname, '.tmp-handoff-reuse-'));
for (const [key, name] of Object.entries({ EU_PRIVACY_ROOT: 'privacy', EU_PRIVACY_DATA_ROOT: 'data',
  EU_PRIVACY_RESULT_ROOT: 'results', LOCALAPPDATA: 'localapp' })) {
  process.env[key] = path.join(base, name);
  fs.mkdirSync(process.env[key]);
}
const batch = require('../plugins/data-secure/server/gateway/batch');
const store = require('../plugins/data-secure/server/gateway/package-store');
const { roots } = require('../plugins/data-secure/server/gateway/common');
const { createLocalOnlyHandoff } = require('../plugins/data-secure/server/gateway/local-only-handoff');
const completedPicker = require('../plugins/data-secure/server/companion/completed-batch-picker');
const diagnostics = require('../plugins/data-secure/server/gateway/workflow-diagnostics');
const sessions = [];
let token;
let journalPath;
let confirmed;

function owned(file) {
  assert.ok(path.resolve(file).startsWith(base + path.sep), 'test mutation must stay in its owned root');
  assert.ok(!fs.lstatSync(file).isSymbolicLink(), 'test mutation must not follow links');
  return file;
}
function cleanupTree(directory) {
  assert.ok(directory === base || directory.startsWith(base + path.sep));
  assert.ok(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink());
  for (const entry of fs.readdirSync(directory)) {
    const file = owned(path.join(directory, entry));
    if (fs.lstatSync(file).isDirectory()) cleanupTree(file);
    else { assert.ok(fs.lstatSync(file).isFile()); fs.unlinkSync(file); }
  }
  fs.rmdirSync(directory);
}
function handoff(extra = {}) {
  const result = createLocalOnlyHandoff({
    completedLocalOnlyCandidates: batch.completedLocalOnlyCandidates,
    listBatchResults: batch.listBatchResults,
    verifyCompletedLocalOnlyGeneration: batch.verifyCompletedLocalOnlyGeneration,
    openVerifiedMarkdownSnapshotAsync: store.openVerifiedMarkdownSnapshotAsync,
    acknowledgeDeliveredPackages: batch.acknowledgeDeliveredPackages,
    recordWorkflowEvent: diagnostics.recordWorkflowEvent,
    pickCompletedBatch(candidates, options) {
      assert.equal(options.scope, 'reuse_completed');
      assert.equal(candidates.length, 1, 'even a single replay candidate needs local confirmation');
      assert.deepEqual(Object.keys(candidates[0]).sort(), ['completedAt', 'ordinal', 'released', 'stopped']);
      confirmed++;
      return 1;
    },
    ...extra
  });
  sessions.push(result);
  return result;
}
async function collect(session, options) {
  const documents = [];
  let page = await session.start(options);
  for (let calls = 0; calls < 30; calls++) {
    assert.equal(page.ok, true);
    documents.push(...page.documents);
    if (!page.more) { assert.equal(session.finalizeTerminal(), true); return documents; }
    page = await session.nextAsync();
  }
  assert.fail('replay must terminate within bounded page count');
}
function readJournal() { return JSON.parse(fs.readFileSync(journalPath, 'utf8')); }
function diagnosticRecorder(events) {
  return record => {
    events.push(diagnostics.sanitizeWorkflowEvent(record));
    return diagnostics.recordWorkflowEvent(record);
  };
}
function mutateJournal(mutate) {
  const previous = fs.readFileSync(owned(journalPath));
  const state = JSON.parse(previous);
  mutate(state);
  fs.writeFileSync(journalPath, JSON.stringify(state));
  return () => fs.writeFileSync(owned(journalPath), previous);
}
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

async function withExpiringRealBatch(scope, verify) {
  const source = fs.mkdtempSync(path.join(base, 'capability-inputs-'));
  const queue = [
    'Name: Lina Testfeld\n\n' + 'Die technische Integration wird durch lokale Tests geprüft.\n'.repeat(210),
    'Name: Lina Testfeld\nTechnologien: Java und SQL\n'
  ].map((content, index) => {
    const full = path.join(source, `technical-${index}.txt`);
    fs.writeFileSync(full, content);
    const stat = fs.statSync(full);
    return { full, name: path.basename(full), stat, sourceBytes: stat.size };
  });
  const started = batch.beginBatch({ expectedCount: queue.length, profile: 'general', queue });
  assert.equal(started.ok, true);
  const batchToken = started.batch_token;
  const packages = [];
  for (let index = 0; index < queue.length; index++) {
    const processed = await batch.processBatchNext(batchToken, {
      reviewTextLocally() { throw Error('Unexpected review in capability fixture'); }
    });
    assert.ok(processed.package_id);
    packages.push(processed.package_id);
    batch.finalizePublishedPackageLocally(batchToken, processed.package_id);
  }
  assert.equal(batch.readBatchProgress(batchToken).complete, true);
  if (scope === 'reuse_completed') batch.acknowledgeDeliveredPackages(batchToken, packages);
  const file = owned(path.join(batch._test.batchRoot(), `${batchToken}.json`));
  const realNow = Date.now;
  const minute = 60 * 1000;
  let clock = realNow() + 60 * minute;
  let active;
  try {
    Date.now = () => clock;
    // The shorter permission is deliberately not the first listed result.
    const shortGrant = store.issueReadCapability(packages[1]);
    clock += minute;
    const longGrant = store.issueReadCapability(packages[0]);
    clock += 13 * minute;
    const deadline = Date.parse(shortGrant.read_capability_expires_at);
    assert.equal(deadline - clock, minute);
    const before = fs.readFileSync(file);
    await verify({
      get clock() { return clock; }, advanceTo: value => { clock = value; }, deadline,
      packages, grants: [longGrant, shortGrant], before, file,
      make(extra = {}) {
        active?.cancel();
        active = handoff({
          completedLocalOnlyCandidates: options => batch.completedLocalOnlyCandidates(options).filter(item => item.token === batchToken),
          readOutputs: store.readOutputs, ...extra
        });
        return active;
      }
    });
  } finally {
    active?.cancel();
    Date.now = realNow;
    // This auxiliary journal must not become a candidate in subsequent cases.
    fs.unlinkSync(owned(file));
  }
}

async function main() {
  await testAsync('real six-document anonymization publishes immutable packages; default handoff consumes unread only', async () => {
    const source = path.join(base, 'inputs');
    fs.mkdirSync(source);
    const queue = Array.from({ length: 6 }, (_, index) => {
      const full = path.join(source, `synthetic-${index + 1}.txt`);
      fs.writeFileSync(full, `# Technischer Bericht ${index + 1}\n\nName: Lina Testfeld\nE-Mail: lina.testfeld@privacy-example.test\nTechnologien: Java, SQL, HL7 FHIR\n\nDie Implementierung wird durch automatisierte Tests geprüft.\n`);
      const stat = fs.statSync(full);
      return { full, name: path.basename(full), stat, sourceBytes: stat.size };
    });
    const started = batch.beginBatch({ expectedCount: queue.length, profile: 'general', queue });
    assert.equal(started.ok, true);
    token = started.batch_token;
    for (let index = 0; index < queue.length; index++) {
      const result = await batch.processBatchNext(token, {
        reviewTextLocally() { throw Error('Unexpected review in synthetic replay fixture'); }
      });
      assert.ok(result.package_id, 'fixture must really publish an anonymized document');
      batch.finalizePublishedPackageLocally(token, result.package_id);
    }
    const progress = batch.readBatchProgress(token);
    assert.equal(progress.complete, true);
    assert.equal(progress.released, 6);
    journalPath = path.join(batch._test.batchRoot(), `${token}.json`);
    assert.equal(batch.completedLocalOnlyCandidates().length, 1);
    assert.deepEqual(batch.completedLocalOnlyCandidates({ scope: 'reuse_completed' }), [],
      'a never-delivered batch is not yet reusable');
    const documents = await collect(handoff());
    assert.equal(documents.length, 6);
    assert.ok(documents.every(item => !item.text.includes('Lina Testfeld') && item.text.includes('Java')));
    assert.deepEqual(batch.completedLocalOnlyCandidates(), []);
    assert.ok(readJournal().items.every(item => item.analysis_acknowledged));
    // Prove explicit reuse needs no source file and cannot re-anonymize it.
    for (const entry of queue) fs.unlinkSync(owned(entry.full));
    confirmed = 0;
  });
  if (!token || !journalPath) { await done(() => cleanupTree(base)); return; }

  await testAsync('explicit replay confirms the single batch, verifies six packages and preserves durable ACK/evidence byte-for-byte', async () => {
    const journalBefore = fs.readFileSync(journalPath);
    const beforePackages = readJournal().items.map(item => {
      const full = path.join(roots().output, item.package_id, `${item.package_id}.md`);
      return { full, digest: sha(fs.readFileSync(full)) };
    });
    const docs = await collect(handoff(), { scope: 'reuse_completed' });
    assert.equal(docs.length, 6);
    assert.equal(confirmed, 1);
    assert.deepEqual(fs.readFileSync(journalPath), journalBefore);
    assert.deepEqual(batch.completedLocalOnlyCandidates(), []);
    for (const item of beforePackages) assert.equal(sha(fs.readFileSync(item.full)), item.digest);
    assert.doesNotMatch(JSON.stringify(docs), /package_id|read_capability|[a-f0-9]{64}/u);
    assert.ok(docs.every(item => item.embedded_instructions_authorized === false));
  });

  await testAsync('native picker contracts accept and explicitly label one replay candidate on every platform', async () => {
    const candidates = [{ ordinal: 1, released: 6, stopped: 0 }];
    for (const platform of ['win32', 'darwin', 'linux']) {
      const commands = completedPicker.pickerCommands(candidates, { platform, scope: 'reuse_completed' });
      assert.match(JSON.stringify(commands), /erneuten Übergabe/u);
      assert.equal(await completedPicker.pickCompletedBatch(candidates, { platform, scope: 'reuse_completed',
        runner: async () => ({ status: 0, stdout: '1' }) }), 1);
    }
    assert.throws(() => completedPicker.validateCandidates([]));
  });

  await testAsync('cancelling native reuse confirmation never starts reading or changes ACKs', async () => {
    const before = fs.readFileSync(journalPath);
    let snapshots = 0;
    const events = [];
    const session = handoff({
      pickCompletedBatch() { throw completedPicker.cancelledError(); },
      recordWorkflowEvent: diagnosticRecorder(events),
      openVerifiedMarkdownSnapshotAsync() { snapshots++; throw Error('must not read'); }
    });
    await assert.rejects(session.start({ scope: 'reuse_completed' }), error => error.code === completedPicker.PICKER_CANCELLED);
    assert.equal(snapshots, 0);
    assert.equal(session.isActive(), false);
    assert.deepEqual(fs.readFileSync(journalPath), before);
    assert.equal(events.length, 1);
    assert.equal(events[0].event, 'local_results_reuse_cancelled');
    assert.equal(events[0].error_code, 'LOCAL_COMPLETED_BATCH_SELECTION_CANCELLED');
    assert.equal(events[0].item_count, 0, 'no result session exists before local confirmation');
    assert.match(events[0].run_id, /^[a-f0-9]{8}$/u);
    assert.ok(diagnostics._test.readWorkflowEvents().some(event => event.run_id === events[0].run_id && event.event === events[0].event));
  });

  await testAsync('native picker failures before session creation retain their path-free cause rather than claiming changed results', async () => {
    for (const [nativeResult, expected] of [
      [{ status: 1, stdout: '1', error: { code: 1, message: 'PRIVATE_NATIVE_PATH' } }, 'LOCAL_PICKER_FAILED'],
      [{ status: null, stdout: '', error: { code: 'ETIMEDOUT', message: 'PRIVATE_NATIVE_PATH' } }, 'LOCAL_PICKER_TIMEOUT'],
      [null, 'INTERNAL_FAILURE']
    ]) {
      const events = [];
      const session = handoff({
        recordWorkflowEvent: diagnosticRecorder(events),
        pickCompletedBatch(candidates, options) {
          if (!nativeResult) throw Object.assign(Error('PRIVATE_NATIVE_PATH'), { code: 'PRIVATE_NATIVE_PATH' });
          return completedPicker.pickCompletedBatch(candidates, { ...options, platform: 'win32', runner: async () => nativeResult });
        }
      });
      await assert.rejects(session.start({ scope: 'reuse_completed' }));
      assert.equal(session.isActive(), false);
      assert.equal(events.length, 1);
      assert.equal(events[0].event, 'local_results_reuse_failed');
      assert.equal(events[0].error_code, expected);
      assert.match(events[0].run_id, /^[a-f0-9]{8}$/u);
      assert.doesNotMatch(JSON.stringify(events), /PRIVATE_NATIVE_PATH|LOCAL_HANDOFF_CHANGED/u);
    }
  });

  await testAsync('replay cancellation/restart preserves default unread state and asks for a new explicit local selection', async () => {
    const before = fs.readFileSync(journalPath);
    const session = handoff();
    assert.equal((await session.start({ scope: 'reuse_completed' })).more, true);
    session.cancel();
    assert.equal((await handoff().start()).error, 'no_completed_local_batch');
    const docs = await collect(handoff(), { scope: 'reuse_completed' });
    assert.equal(docs.length, 6);
    assert.deepEqual(fs.readFileSync(journalPath), before);
  });

  await testAsync('a partly unread batch remains only in the normal unread queue', async () => {
    const restore = mutateJournal(state => { state.items[5].analysis_acknowledged = false; });
    try {
      assert.equal(batch.completedLocalOnlyCandidates()[0].released, 1);
      assert.deepEqual(batch.completedLocalOnlyCandidates({ scope: 'reuse_completed' }), []);
      assert.equal((await handoff().start({ scope: 'reuse_completed' })).error, 'no_completed_local_batch');
      assert.equal(batch.completedLocalOnlyCandidates()[0].released, 1);
      assert.equal(readJournal().items[5].analysis_acknowledged, false);
    } finally { restore(); }
  });

  await testAsync('a changed delivery state invalidates an already selected replay', async () => {
    const session = handoff();
    assert.equal((await session.start({ scope: 'reuse_completed' })).documents.length, 5);
    const restore = mutateJournal(state => { state.items[5].analysis_acknowledged = false; });
    try {
      assert.deepEqual(batch.completedLocalOnlyCandidates({ scope: 'reuse_completed' }), []);
      assert.equal(batch.completedLocalOnlyCandidates()[0].released, 1);
      await assert.rejects(session.nextAsync(), error => error.code === 'LOCAL_HANDOFF_CHANGED');
      assert.equal(session.isActive(), false);
    } finally { session.cancel(); restore(); }
  });

  await testAsync('terminal evidence changes are included in the immutable replay generation', async () => {
    const session = handoff();
    await session.start({ scope: 'reuse_completed' });
    const restore = mutateJournal(state => { state.terminal_evidence.status = 'pending'; });
    try {
      await assert.rejects(session.nextAsync());
      assert.equal(session.isActive(), false);
    } finally { restore(); }
  });

  await testAsync('journal generation changed while the picker was open fails before snapshots', async () => {
    let restore;
    let snapshots = 0;
    const session = handoff({
      pickCompletedBatch() {
        restore = mutateJournal(state => { state.items[0].package_id = state.items[1].package_id; });
        return 1;
      },
      openVerifiedMarkdownSnapshotAsync() { snapshots++; throw Error('must not read'); }
    });
    try {
      await assert.rejects(session.start({ scope: 'reuse_completed' }));
      assert.equal(snapshots, 0);
      assert.equal(session.isActive(), false);
    } finally { restore?.(); }
  });

  await testAsync('generation change between pages invalidates replay instead of silently returning another version', async () => {
    const session = handoff();
    assert.equal((await session.start({ scope: 'reuse_completed' })).documents.length, 5);
    const restore = mutateJournal(state => { state.items[5].package_id = state.items[0].package_id; });
    try {
      await assert.rejects(session.nextAsync());
      assert.equal(session.isActive(), false);
    } finally { restore(); }
  });

  await testAsync('generation change during asynchronous snapshot preparation returns no content', async () => {
    let restore;
    const session = handoff({
      async openVerifiedMarkdownSnapshotAsync(...args) {
        const snapshot = await store.openVerifiedMarkdownSnapshotAsync(...args);
        if (!restore) restore = mutateJournal(state => { state.items[5].package_id = state.items[0].package_id; });
        return snapshot;
      }
    });
    try { await assert.rejects(session.start({ scope: 'reuse_completed' })); }
    finally { restore?.(); }
    assert.equal(session.isActive(), false);
  });

  await testAsync('replay cursors are generation/scope-bound and cannot consume a default unread cursor', async () => {
    const [candidate] = batch.completedLocalOnlyCandidates({ scope: 'reuse_completed' });
    const first = batch.listBatchResults(token, { scope: 'reuse_completed', generation: candidate.generation, limit: 5 });
    assert.ok(first.next_cursor);
    assert.throws(() => batch.listBatchResults(token, { cursor: first.next_cursor }), /Cursor/u);
    const normalCursor = batch._test.resultCursor(token, 5);
    assert.throws(() => batch.listBatchResults(token, { scope: 'reuse_completed', generation: candidate.generation, cursor: normalCursor }), /Cursor/u);
    assert.throws(() => batch.listBatchResults(token, { scope: 'reuse_completed' }), error => error.code === 'LOCAL_HANDOFF_CHANGED');
    await assert.rejects(handoff().start({ scope: 'everything' }));
  });

  await testAsync('expired journals are excluded and an active replay stops after retention changes', async () => {
    const session = handoff();
    await session.start({ scope: 'reuse_completed' });
    const restore = mutateJournal(state => { state.expires_at = new Date(Date.now() - 1000).toISOString(); });
    try {
      assert.deepEqual(batch.completedLocalOnlyCandidates({ scope: 'reuse_completed' }), []);
      await assert.rejects(session.nextAsync());
      assert.equal(session.isActive(), false);
    } finally { restore(); }
  });

  await testAsync('RAM replay expires independently and never acknowledges a page after expiry', async () => {
    const before = fs.readFileSync(journalPath);
    let clock = Date.now();
    const session = handoff({ now: () => clock });
    await session.start({ scope: 'reuse_completed' });
    clock += 16 * 60 * 1000;
    assert.equal((await session.nextAsync()).error, 'local_handoff_expired');
    assert.deepEqual(fs.readFileSync(journalPath), before);
  });

  await testAsync('Standalone and pure-conversion channel journals cannot become Cowork replay candidates', async () => {
    for (const mutate of [state => { state.product_channel = 'standalone'; }, state => { state.processing_mode = 'markdown-only'; }]) {
      const restore = mutateJournal(mutate);
      try { assert.deepEqual(batch.completedLocalOnlyCandidates({ scope: 'reuse_completed' }), []); }
      finally { restore(); }
    }
  });

  await testAsync('content-free replay diagnostics contain no tokens, package identity, names or document text', async () => {
    const events = diagnostics._test.readWorkflowEvents().filter(item => item.event.startsWith('local_results_reuse_'));
    assert.ok(events.some(item => item.event === 'local_results_reuse_started'));
    assert.ok(events.some(item => item.event === 'local_results_reuse_finished'));
    assert.ok(events.some(item => item.event === 'local_results_reuse_failed'));
    assert.ok(events.some(item => item.event === 'local_results_reuse_expired'));
    assert.ok(events.every(item => /^[a-f0-9]{8}$/u.test(item.run_id)));
    const serialized = JSON.stringify(events);
    assert.ok(!serialized.includes(token));
    assert.doesNotMatch(serialized, /synthetic-|Lina|Testfeld|package_id|read_capability|Technischer Bericht|[a-f0-9]{64}/u);
  });

  for (const scope of ['unread', 'reuse_completed']) {
    for (const asynchronous of [false, true]) await testAsync(`${scope}: ${asynchronous ? 'async' : 'sync'} RAM pages expire with reused real grants, without ACK`, async () => {
      await withExpiringRealBatch(scope, async fixture => {
        const session = fixture.make(asynchronous ? {} : {
          openVerifiedMarkdownSnapshotAsync: undefined,
          openVerifiedMarkdownSnapshot: store.openVerifiedMarkdownSnapshot
        });
        const first = await session.start({ scope });
        assert.equal(first.ok, true);
        assert.equal(first.more, true);
        assert.equal(first.documents.length, 2);
        assert.equal(session._test.session().expiresAt, fixture.deadline, 'earliest actual grant, not a new 14-minute lifetime');
        const snapshot = session._test.session().entries[0].snapshot;
        assert.ok(snapshot, 'real verified Markdown is retained between chunks');
        fixture.advanceTo(fixture.deadline + (asynchronous ? 60 * 1000 : 0));
        assert.throws(() => store.requireReadCapability(fixture.packages[1], fixture.grants[1].read_capability), /abgelaufen/u);
        const result = asynchronous ? await session.nextAsync() : session.next();
        assert.equal(result.error, 'local_handoff_expired');
        assert.equal(Object.hasOwn(result, 'documents'), false);
        assert.match(result.message, /Leseberechtigung ist abgelaufen/u);
        assert.equal(session.finalizeTerminal(), false);
        assert.deepEqual(fs.readFileSync(fixture.file), fixture.before, 'expired previous page remains unacknowledged');
        assert.throws(() => snapshot.read(), /nicht mehr gültig/u);
        assert.equal(session.isActive(), false);
      });
    });

    for (const boundary of ['async-snapshot', 'sync-snapshot', 'read']) await testAsync(`${scope}: expiry during real ${boundary} discards output and wipes snapshots`, async () => {
      await withExpiringRealBatch(scope, async fixture => {
        const snapshots = [];
        function capture(snapshot) {
          assert.ok(snapshot);
          snapshots.push(snapshot);
          if (boundary !== 'read') { fixture.advanceTo(fixture.deadline); return snapshot; }
          return { bytes: snapshot.bytes, dispose: () => snapshot.dispose(), read(...args) {
            const page = snapshot.read(...args);
            fixture.advanceTo(fixture.deadline);
            return page;
          } };
        }
        const session = fixture.make(boundary === 'sync-snapshot' ? {
          openVerifiedMarkdownSnapshotAsync: undefined,
          openVerifiedMarkdownSnapshot: (...args) => capture(store.openVerifiedMarkdownSnapshot(...args))
        } : {
          openVerifiedMarkdownSnapshotAsync: async (...args) => capture(await store.openVerifiedMarkdownSnapshotAsync(...args))
        });
        const result = await session.start({ scope });
        assert.equal(result.error, 'local_handoff_expired');
        assert.equal(Object.hasOwn(result, 'documents'), false);
        assert.doesNotMatch(result.message, /keine weiteren Inhalte gelesen/u, 'local I/O may already have happened, but nothing is disclosed');
        assert.equal(snapshots.length, boundary === 'read' ? 2 : 1, 'stop opening further snapshots immediately at expiry');
        for (const snapshot of snapshots) assert.throws(() => snapshot.read(), /nicht mehr gültig/u);
        assert.deepEqual(fs.readFileSync(fixture.file), fixture.before);
        assert.equal(session.finalizeTerminal(), false);
        assert.equal(session.isActive(), false);
      });
    });

    await testAsync(`${scope}: terminal confirmation after real capability expiry does not acknowledge the final document`, async () => {
      await withExpiringRealBatch(scope, async fixture => {
        const session = fixture.make();
        let page = await session.start({ scope });
        for (let pages = 0; page.more && pages < 5; pages++) page = await session.nextAsync();
        assert.equal(page.ok, true);
        assert.equal(page.more, false);
        const beforeConfirmation = fs.readFileSync(fixture.file);
        fixture.advanceTo(fixture.deadline);
        assert.equal(session.finalizeTerminal(), false);
        assert.deepEqual(fs.readFileSync(fixture.file), beforeConfirmation);
        assert.equal(session.isActive(), false);
      });
    });
  }

  await testAsync('tampered released Markdown is rejected after local confirmation, before any text is returned', async () => {
    const item = readJournal().items[0];
    const file = owned(path.join(roots().output, item.package_id, `${item.package_id}.md`));
    let snapshots = 0;
    const events = [];
    const session = handoff({
      recordWorkflowEvent: diagnosticRecorder(events),
      pickCompletedBatch() { fs.appendFileSync(file, '\nUNAPPROVED_TEST_PAYLOAD\n'); return 1; },
      async openVerifiedMarkdownSnapshotAsync(...args) { snapshots++; return store.openVerifiedMarkdownSnapshotAsync(...args); }
    });
    await assert.rejects(session.start({ scope: 'reuse_completed' }));
    assert.equal(session.isActive(), false);
    assert.ok(snapshots <= 1, 'damaged first package prevents returning the page');
    assert.deepEqual(batch.completedLocalOnlyCandidates({ scope: 'reuse_completed' }), []);
    const failures = events.filter(event => event.event === 'local_results_reuse_failed');
    assert.equal(failures.length, 1);
    assert.equal(failures[0].error_code, 'LOCAL_HANDOFF_VERIFICATION_FAILED');
    assert.doesNotMatch(JSON.stringify(events), /UNAPPROVED_TEST_PAYLOAD|LOCAL_HANDOFF_CHANGED/u);
  });

  await done(() => { for (const session of sessions) session.cancel(); cleanupTree(base); });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
