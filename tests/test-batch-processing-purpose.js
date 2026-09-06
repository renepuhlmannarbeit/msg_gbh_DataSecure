'use strict';

// Actual immutable source intake, private snapshot I/O, atomic journal and
// fresh store restoration. No conversion engine or anonymizer is mocked here.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork, execFileSync } = require('node:child_process');
const { createSuite } = require('./helpers');
const { createBatchIntake } = require('../plugins/data-secure/server/gateway/batch-intake');
const { createBatchJournalStore } = require('../plugins/data-secure/server/gateway/batch-journal-store');
const { createBatchIntakeIntent } = require('../plugins/data-secure/server/gateway/batch-intake-intent');
const { createPrivateWorkStore } = require('../plugins/data-secure/server/gateway/private-work-store');
const { copySnapshotFile, assertStagingCapacity } = require('../plugins/data-secure/server/gateway/batch-snapshot');
const { planBatchAdmission } = require('../plugins/data-secure/server/gateway/batch-source-admission');
const { PROFILES, LIMITS, validateBatchLimits, storageStatus, hasReparseComponent } = require('../plugins/data-secure/server/gateway/common');
const { createBatchPseudonymState } = require('../plugins/data-secure/server/batch-pseudonym-context');
const { MODES, processingModeForBatch } = require('../plugins/data-secure/server/core/processing-mode');
const { validateBatchMessagePurpose } = require('../plugins/data-secure/server/gateway/batch-queue-envelope');
const { notProcessedDocumentResult } = require('../plugins/data-secure/server/gateway/document-result-grade');
const { test, testAsync, assert, done } = createSuite('Persistent batch processing purpose');
const token = 'a'.repeat(64);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function removeFixture(root) {
  const resolved = fs.realpathSync(root);
  assert.strictEqual(path.dirname(resolved), fs.realpathSync(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('datasecure-purpose-'));
  const targets = [];
  function inspect(directory) {
    for (const name of fs.readdirSync(directory)) {
      const full = path.join(directory, name);
      const stat = fs.lstatSync(full);
      assert.ok(!stat.isSymbolicLink());
      assert.strictEqual(fs.realpathSync(full), full);
      if (stat.isDirectory()) inspect(full);
      else assert.ok(stat.isFile());
      targets.push({ full, directory: stat.isDirectory() });
    }
  }
  inspect(resolved);
  for (const target of targets) {
    if (target.directory) fs.rmdirSync(target.full);
    else fs.unlinkSync(target.full);
  }
  fs.rmdirSync(resolved);
}

function fixture(channel = 'standalone') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-purpose-')));
  const privateRoot = path.join(root, 'private');
  fs.mkdirSync(privateRoot);
  const journals = path.join(privateRoot, 'batches');
  fs.mkdirSync(journals);
  const source = path.join(root, 'synthetic.txt');
  fs.writeFileSync(source, 'Name: Max Mustermann\nArbeitgeber: Nordstern Medizin GmbH\n');
  const original = fs.readFileSync(source);
  const paths = {
    batchPath: value => path.join(journals, `${value}.json`),
    workPath: value => path.join(journals, `${value}.work`)
  };
  const newStore = () => createBatchJournalStore({ ...paths, io: fs });
  const store = newStore();
  let seeds = 0;
  let copies = 0;
  let intentRecord;
  let admissionPurpose;
  const privateWorkStore = createPrivateWorkStore({ privateRoot });
  const intake = createBatchIntake({
    ...paths, SafeError: Error, io: fs, path, crypto, profiles: PROFILES, limits: LIMITS,
    validateBatchLimits, storageStatus: () => storageStatus(privateRoot), hasReparseComponent,
    planBatchAdmission(queue, options) {
      admissionPurpose = { mode: options.processingMode, channel: options.productChannel };
      return planBatchAdmission(queue, options);
    },
    assertStagingCapacity: queue => assertStagingCapacity(queue, () => fs.statfsSync(root)),
    tokenPattern: /^[a-f0-9]{64}$/u, privateWorkStore,
    copySnapshotFile(...args) {
      // Prove purpose is durable before the first source byte is copied.
      intentRecord = createBatchIntakeIntent({ ...paths }).read(token);
      copies++;
      return copySnapshotFile(...args);
    },
    batchTtlMs: () => 60_000, createPrivateIoSummary: value => value,
    writeState: store.writeState, readStateForMaintenance: store.readStateForMaintenance,
    safeRemoveWorkDirectory() { throw new Error('fixture unexpectedly entered failed intake cleanup'); },
    publicProgress: state => ({ batch_total: state.items.length }), productChannel: channel,
    createBatchPseudonymState(options) { seeds++; return createBatchPseudonymState(options); }
  });
  return {
    root, privateRoot, paths, source, original, store, newStore, privateWorkStore,
    get seeds() { return seeds; }, get copies() { return copies; },
    get intent() { return intentRecord; }, get admissionPurpose() { return admissionPurpose; },
    begin(mode) {
      return intake.beginBatch({ token, expectedCount: 1, processingMode: mode,
        queue: [{ name: path.basename(source), full: source, sourceBytes: original.length }] });
    },
    cleanup() { assert.strictEqual(digest(fs.readFileSync(source)), digest(original)); removeFixture(root); }
  };
}

test('real intake persists standalone-only conversion purpose before copy and restores without a seed', () => {
  const f = fixture();
  try {
    assert.strictEqual(f.begin(MODES.MARKDOWN).ok, true);
    assert.strictEqual(f.copies, 1);
    assert.strictEqual(f.seeds, 0);
    assert.deepStrictEqual(f.admissionPurpose, { mode: MODES.MARKDOWN, channel: 'standalone' });
    assert.strictEqual(f.intent.schema, 'datasecure-intake/2');
    assert.strictEqual(f.intent.processing_mode, MODES.MARKDOWN);
    assert.strictEqual(f.intent.product_channel, 'standalone');
    const resumed = f.newStore().readState(token);
    assert.strictEqual(resumed.schema, 'datasecure-batch/5');
    assert.strictEqual(processingModeForBatch(resumed), MODES.MARKDOWN);
    assert.ok(!Object.keys(resumed).some(key => key.startsWith('pseudonym_')));
    assert.deepStrictEqual(f.privateWorkStore.readFile(path.join(f.paths.workPath(token), resumed.items[0].work_name)), f.original);
    assert.strictEqual(fs.existsSync(path.join(path.dirname(f.paths.batchPath(token)), `${token}.intake`)), false);
  } finally { f.cleanup(); }
});

test('both historical product channels still create anonymization v4 with their seed contract', () => {
  for (const channel of ['plugin', 'standalone']) {
    const f = fixture(channel);
    try {
      f.begin(MODES.ANONYMIZE);
      const state = f.newStore().readState(token);
      assert.strictEqual(state.schema, 'datasecure-batch/4');
      assert.strictEqual(processingModeForBatch(state), MODES.ANONYMIZE);
      assert.strictEqual(f.seeds, 1);
      assert.strictEqual(typeof state.pseudonym_seed, 'string');
      assert.strictEqual(f.intent.schema, 'datasecure-intake/1');
    } finally { f.cleanup(); }
  }
});

test('unknown, null and plugin conversion purpose fail before a snapshot or journal exists', () => {
  for (const [channel, mode] of [['standalone', null], ['standalone', 'other'], ['plugin', MODES.MARKDOWN]]) {
    const f = fixture(channel);
    try {
      assert.throws(() => f.begin(mode), error => ['PROCESSING_MODE_INVALID', 'PROCESSING_MODE_FORBIDDEN'].includes(error.code));
      assert.strictEqual(f.copies, 0);
      assert.strictEqual(f.seeds, 0);
      assert.strictEqual(fs.existsSync(f.paths.workPath(token)), false);
      assert.strictEqual(fs.existsSync(f.paths.batchPath(token)), false);
    } finally { f.cleanup(); }
  }
});

test('loaded-object and fresh-object resume cannot silently change a persisted purpose', () => {
  for (const fresh of [false, true]) {
    const f = fixture();
    try {
      f.begin(MODES.MARKDOWN);
      const writer = f.newStore();
      let resumed = writer.readState(token);
      if (fresh) resumed = JSON.parse(JSON.stringify(resumed));
      const before = digest(fs.readFileSync(f.paths.batchPath(token)));
      resumed.schema = 'datasecure-batch/4';
      delete resumed.processing_mode;
      assert.throws(() => writer.writeState(resumed), error => error.code === 'BATCH_PROCESSING_MODE_CHANGED');
      assert.strictEqual(digest(fs.readFileSync(f.paths.batchPath(token))), before);
      assert.strictEqual(processingModeForBatch(f.newStore().readState(token)), MODES.MARKDOWN);
    } finally { f.cleanup(); }
  }
});

function positive(item, grade = 'complete') {
  return { ...item, status: 'released', checkpoint: 'locally_finalized',
    artifact_id: `dm_${item.id}`, artifact_sha256: 'b'.repeat(64), artifact_bytes: 42,
    extraction_grade: grade, reason_codes: grade === 'complete' ? [] : ['OCR_NOT_VERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED'] };
}

test('complete and warned conversion finality survives restoration without privacy success fields', () => {
  for (const grade of ['complete', 'incomplete']) {
    const f = fixture();
    try {
      f.begin(MODES.MARKDOWN);
      const state = f.store.readState(token);
      state.items[0] = positive(state.items[0], grade);
      f.store.writeState(state);
      const restored = f.newStore().readState(token).items[0];
      assert.strictEqual(restored.extraction_grade, grade);
      assert.deepStrictEqual(restored.reason_codes, state.items[0].reason_codes);
      for (const key of ['document_result', 'package_id', 'package_identity', 'read_capability', 'analysis_acknowledged']) assert.ok(!Object.hasOwn(restored, key));
    } finally { f.cleanup(); }
  }
});

test('partial publication permits only an unverified locator at two processing checkpoints', () => {
  const f = fixture();
  try {
    f.begin(MODES.MARKDOWN);
    const state = f.store.readState(token);
    const base = state.items[0];
    for (const checkpoint of ['package_published', 'publication_unconfirmed']) {
      state.items[0] = { ...base, status: 'processing', checkpoint, artifact_id: `dm_${base.id}` };
      f.store.writeState(state);
      assert.ok(!Object.hasOwn(f.newStore().readState(token).items[0], 'extraction_grade'));
      for (const status of ['retryable', 'delivery_pending', 'released']) {
        state.items[0].status = status;
        assert.throws(() => f.store.writeState(state), /BATCH_MARKDOWN_STATE_INVALID/u);
      }
    }
  } finally { f.cleanup(); }
});

test('stopped conversion items keep neutral not-processed evidence and no markdown artifact', () => {
  const f = fixture();
  try {
    f.begin(MODES.MARKDOWN);
    const state = f.store.readState(token);
    state.items[0] = { ...state.items[0], status: 'stopped', checkpoint: 'processing_failed',
      error_code: 'SOURCE_TEXT_INVALID', document_result: notProcessedDocumentResult('SOURCE_TEXT_INVALID') };
    f.store.writeState(state);
    assert.strictEqual(f.newStore().readState(token).items[0].document_result.grade, 'not-processed');
  } finally { f.cleanup(); }
});

test('malformed v5 records fail both normal and maintenance restoration without mutation', () => {
  const f = fixture();
  try {
    f.begin(MODES.MARKDOWN);
    const valid = f.store.readState(token);
    valid.items[0] = positive(valid.items[0], 'incomplete');
    const mutations = [
      s => { s.schema = 'datasecure-batch/4'; },
      s => { delete s.processing_mode; },
      s => { s.processing_mode = MODES.ANONYMIZE; },
      s => { s.product_channel = 'plugin'; },
      s => { s.pseudonym_seed = 'a'.repeat(43); },
      s => { s.pseudonym_contract_version = 'unknown'; },
      s => { s.package_id = `ds_${'b'.repeat(32)}`; },
      s => { s.items[0].document_result = notProcessedDocumentResult('SOURCE_TEXT_INVALID'); },
      s => { s.items[0].analysis_acknowledged = false; },
      s => { s.items[0].package_id = `ds_${s.items[0].id}`; },
      s => { s.items[0].read_capability = 'not-a-read-grant'; },
      s => { s.items[0].artifact_id = `dm_${'0'.repeat(32)}`; },
      s => { s.items[0].artifact_sha256 = 'xyz'; },
      s => { s.items[0].artifact_bytes = -1; },
      s => { s.items[0].extraction_grade = 'complete'; },
      s => { s.items[0].reason_codes = ['OCR_NOT_VERIFIED', 'OCR_NOT_VERIFIED']; },
      s => { s.items[0].reason_codes = ['VISUAL_CONTENT_NOT_EXTRACTED', 'OCR_NOT_VERIFIED']; },
      s => { s.items[0].reason_codes = ['PRIVACY_SCAN_COMPLETE']; },
      s => { delete s.items[0].extraction_grade; }
    ];
    for (const mutate of mutations) {
      const broken = JSON.parse(JSON.stringify(valid)); mutate(broken);
      fs.writeFileSync(f.paths.batchPath(token), JSON.stringify(broken));
      const before = digest(fs.readFileSync(f.paths.batchPath(token)));
      const reader = f.newStore();
      assert.throws(() => reader.readState(token));
      assert.throws(() => reader.readStateForMaintenance(token));
      assert.strictEqual(digest(fs.readFileSync(f.paths.batchPath(token))), before);
    }
  } finally { f.cleanup(); }
});

test('worker message types and persisted mode must agree; legacy cannot ignore a conversion flag', () => {
  assert.strictEqual(validateBatchMessagePurpose({ type: 'start-local-intake' }, 'plugin'), MODES.ANONYMIZE);
  assert.strictEqual(validateBatchMessagePurpose({ type: 'start-local-markdown-batch', processing_mode: MODES.MARKDOWN }, 'standalone', MODES.MARKDOWN), MODES.MARKDOWN);
  for (const message of [
    { type: 'start-local-intake', processing_mode: MODES.MARKDOWN },
    { type: 'start-local-markdown-intake' },
    { type: 'start-local-markdown-intake', processing_mode: null },
    { type: 'arbitrary', processing_mode: MODES.MARKDOWN }
  ]) assert.throws(() => validateBatchMessagePurpose(message, 'standalone'));
  assert.throws(() => validateBatchMessagePurpose({ type: 'start-local-markdown-batch', processing_mode: MODES.MARKDOWN }, 'standalone', MODES.ANONYMIZE));
});

test('a new actual batch process resumes an interrupted conversion without creating privacy state', () => {
  const f = fixture();
  try {
    f.begin(MODES.MARKDOWN);
    const interrupted = f.store.readState(token);
    interrupted.items[0].status = 'processing';
    interrupted.items[0].checkpoint = 'extracted';
    f.store.writeState(interrupted);
    const probe = `
      try {
        const batch = require(process.argv[2]);
        if (batch.readBatchProcessingMode(process.argv[1]) !== 'markdown-only') process.exit(21);
        const result = batch.resumeBatch(process.argv[1]);
        if (result.ok !== true || result.resumed !== 1) process.exit(22);
        const state = batch._test.readState(process.argv[1]);
        if (state.processing_mode !== 'markdown-only' || state.items[0].status !== 'pending' ||
            Object.keys(state).some(k => k.startsWith('pseudonym_'))) process.exit(23);
      } catch { process.exit(24); }
    `;
    const output = execFileSync(process.execPath, ['-e', probe, token,
      path.join(__dirname, '../plugins/data-secure/server/gateway/batch.js')], {
      windowsHide: true, timeout: 10000, encoding: 'utf8',
      env: { ...process.env, DATASECURE_PRODUCT_CHANNEL: 'standalone', EU_PRIVACY_DATA_ROOT: f.privateRoot,
        EU_PRIVACY_ROOT: path.join(f.root, 'workspace'), LOCALAPPDATA: path.join(f.root, 'localapp') }
    });
    assert.strictEqual(output, '');
    const resumed = f.newStore().readState(token);
    assert.strictEqual(resumed.items[0].status, 'pending');
    assert.strictEqual(resumed.items[0].checkpoint, 'resumed');
    assert.strictEqual(processingModeForBatch(resumed), MODES.MARKDOWN);
  } finally { f.cleanup(); }
});

async function realWorkerReject(message, channel, existing) {
  const root = existing?.root || fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-purpose-')));
  const child = fork(path.join(__dirname, '../plugins/data-secure/server/gateway/batch-worker.js'), [], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, DATASECURE_PRODUCT_CHANNEL: channel, EU_PRIVACY_ROOT: path.join(root, 'workspace'),
      EU_PRIVACY_DATA_ROOT: existing?.privateRoot || path.join(root, 'private'),
      LOCALAPPDATA: path.join(root, 'localapp') }
  });
  const messages = []; let output = '';
  child.stdout.on('data', bytes => { output += bytes; });
  child.stderr.on('data', bytes => { output += bytes; });
  child.on('message', value => messages.push(value));
  let timer;
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', resolve);
    timer = setTimeout(() => child.kill(), 10000);
  });
  try {
    const full = path.join(root, 'never-read.txt');
    child.send({ batch_token: token, intake_reservation_id: 'b'.repeat(64), profile: 'auto',
      queue: [{ name: path.basename(full), full, sourceBytes: 10 }], ...message });
    assert.strictEqual(await exited, 2);
    assert.strictEqual(output, '');
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].type, existing ? 'local-batch-rejected' : 'local-intake-rejected');
    assert.ok(['PROCESSING_MODE_INVALID', 'PROCESSING_MODE_FORBIDDEN'].includes(messages[0].error_code));
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited; }
    if (!existing) removeFixture(root);
  }
}

async function main() {
  await testAsync('actual worker rejects invalid and cross-product purpose before acceptance or source I/O', async () => {
    await realWorkerReject({ type: 'start-local-intake', processing_mode: MODES.MARKDOWN }, 'standalone');
    await realWorkerReject({ type: 'start-local-markdown-intake', processing_mode: MODES.MARKDOWN }, 'plugin');
  });
  await testAsync('actual resume worker rejects a legacy message for a v5 journal before accepting ownership', async () => {
    const f = fixture();
    try {
      f.begin(MODES.MARKDOWN);
      const before = digest(fs.readFileSync(f.paths.batchPath(token)));
      await realWorkerReject({ type: 'start-local-batch' }, 'standalone', f);
      assert.strictEqual(digest(fs.readFileSync(f.paths.batchPath(token))), before);
    } finally { f.cleanup(); }
  });
  done();
}
main().catch(() => { console.error('Batch purpose test failed'); process.exitCode = 1; });
