'use strict';

// One deterministic source counteroracle, NOT a diagnosis of an observed CI
// job, a native Core/GUI test, or a concurrent-process-tree acceptance gate.
// The parent delegates every stat/open/read. Its only scheduling seam starts
// a real production publisher after the bound reader's real lstat, before open.
// Expected on the unfixed source: STANDALONE_HISTORY_UNAVAILABLE and exit 1.
// A future fix must return a coherent owner-bound row, not suppress validation.
// All create-only synthetic fixtures/evidence are preserved; no cleanup delete.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const repository = fs.realpathSync.native(path.resolve(__dirname, '..'));
const product = path.join(repository, 'plugins/data-secure/server');
const OWNER = 'DATASECURE_TARGET_EXPORT_RACE_OWNER';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identity = stat => ({ dev: String(stat.dev), ino: String(stat.ino),
  birth: String(stat.birthtimeNs ?? stat.birthtimeMs), size: String(stat.size), nlink: String(stat.nlink) });
const content = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };

function environment(root, owner) {
  const env = { ...process.env, EU_PRIVACY_DATA_ROOT: path.join(root, 'private'),
    EU_PRIVACY_ROOT: path.join(root, 'workspace'), EU_PRIVACY_RESULT_ROOT: path.join(root, 'results'),
    DATASECURE_PRODUCT_CHANNEL: 'standalone', [OWNER]: owner };
  // Explicit source runtime only, not a security bypass in a sealed app.
  delete env.DATASECURE_NATIVE_EXPORT_CHANNEL;
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  return env;
}
function verifyScope(root, create = false) {
  assert.equal(path.dirname(root), fs.realpathSync.native(os.tmpdir()));
  assert.match(path.basename(root), /^datasecure-target-export-race-[A-Za-z0-9]+$/u);
  assert.equal(fs.realpathSync.native(root), root);
  const stat = fs.lstatSync(root);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  assert.match(process.env[OWNER] || '', /^[a-f0-9]{64}$/u);
  for (const [key, leaf] of Object.entries({ EU_PRIVACY_DATA_ROOT: 'private', EU_PRIVACY_ROOT: 'workspace', EU_PRIVACY_RESULT_ROOT: 'results' }))
    assert.equal(process.env[key], path.join(root, leaf));
  assert.equal(process.env.DATASECURE_PRODUCT_CHANNEL, 'standalone');
  assert.notEqual(process.env.DATASECURE_NATIVE_EXPORT_CHANNEL, '1');
  const filename = path.join(root, 'OWNER.json');
  const marker = { root, token_sha256: sha(process.env[OWNER]) };
  if (create) {
    assert.deepEqual(fs.readdirSync(root), []);
    fs.writeFileSync(filename, JSON.stringify(marker), { flag: 'wx', mode: 0o600 });
  } else {
    const ownerStat = fs.lstatSync(filename);
    assert.ok(ownerStat.isFile() && !ownerStat.isSymbolicLink() && ownerStat.nlink === 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(filename)), marker);
  }
}
function loadProduct() {
  return require(path.join(product, 'gateway/result-export'));
}
function assertBoundRecord(exporter, target, state) {
  const bytes = fs.readFileSync(target), record = JSON.parse(bytes);
  assert.equal(exporter.validRecord(record), true);
  assert.equal(record.schema, exporter.CONTENT_MARKDOWN_SCHEMA);
  assert.equal(record.batch_id, state.token);
  assert.equal(record.product_channel, 'standalone');
  assert.equal(record.processing_mode, 'markdown-only');
  assert.deepEqual(record.content_options, content);
  const stat = fs.lstatSync(target, { bigint: true });
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n);
  const row = exporter.readStandaloneExportHistoryEntry(state.token);
  assert.equal(row.summary.processing_mode, 'markdown-only');
  assert.equal(row.summary.result_count, 1);
  assert.equal(row.export_id, path.basename(target, '.json'));
  return { record, row, sha256: sha(bytes), identity: identity(stat) };
}
function publish(root) {
  verifyScope(root);
  const { readBoundFile } = require(path.join(product, 'core/bound-file-io'));
  const state = JSON.parse(readBoundFile(path.join(root, 'fixture-state.json'), { minimum: 1, maximum: 65536 }));
  assert.match(state.token, /^[a-f0-9]{64}$/u);
  const exporter = loadProduct(), target = exporter.recordPath(state.token);
  const before = assertBoundRecord(exporter, target, state);
  assert.equal(before.record.complete, false);
  const rename = fs.renameSync, publications = [];
  // The production writer, not this observer, allocates/writes/fsyncs its
  // temporary plan and performs the atomic rename. Validate each real result.
  fs.renameSync = function(from, to, ...args) {
    const result = Reflect.apply(rename, fs, [from, to, ...args]);
    if (to === target) {
      assert.equal(path.dirname(from), path.dirname(target));
      assert.match(path.basename(from), new RegExp(`^${path.basename(target).replace(/\./gu, '\\.')}\\.${process.pid}\\.[a-f0-9]{8}\\.tmp$`, 'u'));
      const checked = assertBoundRecord(exporter, target, state);
      publications.push({ sha256: checked.sha256, identity: checked.identity,
        complete: checked.record.complete, exported: checked.row.exported_count });
    }
    return result;
  };
  let outcome;
  try {
    // The previously unavailable destination becomes available legitimately.
    assert.equal(fs.existsSync(process.env.EU_PRIVACY_RESULT_ROOT), false);
    fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT, { mode: 0o700 });
    outcome = exporter.exportCompletedState(state);
  } finally { fs.renameSync = rename; }
  assert.deepEqual(outcome, { exported: 1, pending: 0, available: true });
  assert.equal(publications.length, 3, 'destination binding, item publication, then complete plan');
  const after = assertBoundRecord(exporter, target, state);
  assert.equal(after.row.complete, true);
  assert.equal(after.row.exported_count, 1);
  assert.equal(after.row.pending_count, 0);
  assert.notEqual(before.sha256, after.sha256);
  assert.notDeepEqual(before.identity, after.identity, 'compare the full file fact, not an assumed non-reused inode');
  process.stdout.write(JSON.stringify({ pid: process.pid, outcome, publications, final_sha256: after.sha256 }) + '\n');
}
async function counteroracle() {
  const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-target-export-race-'));
  Object.assign(process.env, environment(root, crypto.randomBytes(32).toString('hex')));
  delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
  delete process.env.NODE_OPTIONS;
  delete process.env.NODE_PATH;
  verifyScope(root, true);
  const sourceFiles = ['gateway/result-export.js', 'core/bound-file-io.js', 'gateway/batch-journal-io.js'];
  const sourcePins = Object.fromEntries(sourceFiles.map(name => [name, sha(fs.readFileSync(path.join(product, name)))]));
  const bound = require(path.join(product, 'core/bound-file-io'));
  const read = bound.readBoundFile;
  let watching = false;
  const observations = { scheduled_publishers: 0, reader_opens: 0, reader_bound_errors: [], reader_error: null };
  let target;
  // Observe the real boundary's errors unchanged; never manufacture success,
  // state DTOs, stat identities or HISTORY_UNAVAILABLE.
  bound.readBoundFile = function(filename, ...args) {
    try { return Reflect.apply(read, bound, [filename, ...args]); }
    catch (error) {
      if (watching && filename === target) observations.reader_bound_errors.push(error.code || 'NO_CODE');
      throw error;
    }
  };
  const exporter = loadProduct();
  bound.readBoundFile = read;
  const { createDocumentReviewStore } = require(path.join(product, 'gateway/standalone-document-review-store'));
  const { publishMarkdownArtifact } = require(path.join(product, 'standalone/markdown-store'));
  const { createMarkdownExtraction } = require(path.join(product, 'standalone/markdown-contract'));
  const bytes = Buffer.from('Synthetic neutral export race.\n');
  const documentId = crypto.randomBytes(16).toString('hex');
  const item = { id: documentId, name: 'Synthetic.txt', source_label: 'Synthetic.txt', sha256: sha(bytes), status: 'pending' };
  const state = { schema: 'datasecure-batch/7', token: crypto.randomBytes(32).toString('hex'),
    product_channel: 'standalone', processing_mode: 'markdown-only', standalone_document_review: true,
    content_options: content, profile: 'general', created_at: '2026-10-19T00:00:00.000Z', items: [item] };
  createDocumentReviewStore().captureRun(state);
  const artifact = await publishMarkdownArtifact(createMarkdownExtraction({ source_type: 'txt', markdown: bytes.toString('utf8'),
    coverage: { status: 'complete', reason_codes: [] }, content_options: content }), `dm_${documentId}`, { contentOptions: content });
  Object.assign(item, artifact, { status: 'released' });
  fs.writeFileSync(path.join(root, 'fixture-state.json'), JSON.stringify(state), { flag: 'wx', mode: 0o600 });
  assert.equal(fs.existsSync(process.env.EU_PRIVACY_RESULT_ROOT), false);
  assert.deepEqual(exporter.exportCompletedState(state), { exported: 0, pending: 1, available: false });
  target = exporter.recordPath(state.token);
  const stableBefore = assertBoundRecord(exporter, target, state);
  assert.equal(stableBefore.row.complete, false);
  assert.equal(stableBefore.row.pending_count, 1);
  const protectedFiles = [path.join(process.env.EU_PRIVACY_DATA_ROOT, 'document-reviews', state.token, 'manifest.json'),
    path.join(process.env.EU_PRIVACY_DATA_ROOT, 'result-export-owners', path.basename(target))];
  const anchors = protectedFiles.map(filename => ({ filename, sha256: sha(fs.readFileSync(filename)),
    identity: identity(fs.lstatSync(filename, { bigint: true })) }));
  const parentBefore = identity(fs.lstatSync(path.dirname(target), { bigint: true }));
  const lstat = fs.lstatSync, open = fs.openSync;
  let publisher, row;
  let schedulingFailure;
  fs.lstatSync = function(filename, ...args) {
    const realStat = Reflect.apply(lstat, fs, [filename, ...args]);
    if (watching && filename === target && args[0]?.bigint === true && observations.scheduled_publishers === 0) {
      observations.scheduled_publishers++;
      assert.deepEqual(identity(realStat), stableBefore.identity);
      const child = cp.spawnSync(process.execPath, [__filename, '--publisher', root], {
        cwd: repository, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
        timeout: 15000, maxBuffer: 256 * 1024, windowsHide: true });
      try {
        assert.ifError(child.error);
        assert.equal(child.signal, null);
        assert.equal(child.status, 0, 'real publisher must succeed, not masquerade as a reader race: ' + child.stderr);
        publisher = { ...JSON.parse(child.stdout), close_status: child.status, close_signal: child.signal };
      } catch (error) { schedulingFailure = error; throw error; }
    }
    return realStat;
  };
  fs.openSync = function(filename, ...args) {
    if (watching && filename === target) observations.reader_opens++;
    return Reflect.apply(open, fs, [filename, ...args]);
  };
  try {
    watching = true;
    try { row = exporter.readStandaloneExportHistoryEntry(state.token); }
    catch (error) { observations.reader_error = error.code || 'NO_CODE'; }
  } finally { watching = false; fs.lstatSync = lstat; fs.openSync = open; }
  if (schedulingFailure) throw schedulingFailure;
  assert.equal(observations.scheduled_publishers, 1);
  assert.ok(observations.reader_opens >= 1);
  assert.ok(publisher?.publications.length === 3);
  const stableAfter = assertBoundRecord(exporter, target, state);
  assert.equal(stableAfter.row.complete, true);
  assert.equal(stableAfter.row.exported_count, 1);
  assert.equal(stableAfter.row.pending_count, 0);
  assert.equal(sha(fs.readFileSync(path.join(stableAfter.row.directory, 'Synthetic.md'))), sha(bytes));
  const parentAfter = identity(fs.lstatSync(path.dirname(target), { bigint: true }));
  for (const field of ['dev', 'ino', 'birth']) assert.equal(parentAfter[field], parentBefore[field], 'original outbox parent remains bound');
  for (const anchor of anchors) {
    assert.equal(sha(fs.readFileSync(anchor.filename)), anchor.sha256);
    assert.deepEqual(identity(fs.lstatSync(anchor.filename, { bigint: true })), anchor.identity);
  }
  for (const [name, pin] of Object.entries(sourcePins)) assert.equal(sha(fs.readFileSync(path.join(product, name))), pin);
  const report = { schema: 'datasecure-target-export-atomic-counteroracle/1', classification: 'SOURCE_COUNTERORACLE_NOT_NATIVE_OR_CI_DIAGNOSIS',
    source_sha256: sourcePins, platform: process.platform, node: process.version, fixture_preserved: root,
    phase: 'real-bound-lstat-before-open', controls: { stable_before: true, stable_after: true,
      product_owner_and_purpose: true, anchors_unchanged: true, original_parent_unchanged: true, visible_bytes_exact: true },
    observations, publisher, before: { sha256: stableBefore.sha256, identity: stableBefore.identity },
    after: { sha256: stableAfter.sha256, identity: stableAfter.identity } };
  fs.writeFileSync(path.join(root, 'COUNTERORACLE.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  process.stdout.write(JSON.stringify(report) + '\n');
  assert.equal(observations.reader_error, null,
    'legitimate atomic progress publication must not make the exact history reader unavailable; evidence is preserved');
  assert.equal(row.complete, true);
  assert.equal(row.exported_count, 1);
  assert.equal(row.pending_count, 0);
  process.stdout.write('TARGET EXPORT ATOMIC SOURCE COUNTERORACLE PASS (not native/CI acceptance)\n');
}

if (process.argv[2] === '--publisher') {
  try { publish(process.argv[3]); }
  catch (error) { process.stderr.write(`TARGET_EXPORT_PUBLISHER_FAILED:${error.code || error.name}\n`); process.exitCode = 1; }
} else counteroracle().catch(error => { console.error(error); process.exitCode = 1; });
