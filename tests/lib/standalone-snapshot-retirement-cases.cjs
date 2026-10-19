'use strict';
// Durable production regression with delegated real descriptors and bytes.
// POSIX leaf retirement/stat changes are explicitly MODELLED, not native.
// Caller negatives use the actual production import without loader substitution.
// No native Unix/GUI acceptance or historical CI-cause claim.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const crypto = require('node:crypto');
const repository = fs.realpathSync.native(path.resolve(__dirname, '../..')), product = path.join(repository, 'plugins/data-secure/server');
const boundaryFile = path.join(product, 'core/bound-file-io.js');
const boundary = require(boundaryFile);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const sourcePins = { boundary: sha(fs.readFileSync(boundaryFile)),
  caller: sha(fs.readFileSync(path.join(product, 'gateway/result-export.js'))) };
const evidenceParent = path.join(repository, 'dist');
try { fs.mkdirSync(evidenceParent, { mode: 0o700 }); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
assert.ok(fs.lstatSync(evidenceParent).isDirectory() && !fs.lstatSync(evidenceParent).isSymbolicLink());
assert.equal(fs.realpathSync.native(evidenceParent), evidenceParent);
const evidence = fs.mkdtempSync(path.join(evidenceParent, 'standalone-snapshot-retirement-'));
assert.equal(path.dirname(evidence), evidenceParent);
let passed = 0, currentCase = '';
const records = [];
async function test(name, action) { currentCase = name; await action(); passed++; records.push(name); }
function model({ schedule = 'post-fstat-named', fault, turns = 1, strict = 'snapshot', retiredLinks = 0 } = {}) {
  const root = fs.mkdtempSync(path.join(evidence, 'fd-')), leaf = path.join(root, 'leaf');
  const files = [leaf, path.join(root, 'versionB'), path.join(root, 'versionC'), path.join(root, 'versionD')];
  for (const [index, file] of files.entries()) fs.writeFileSync(file, String.fromCharCode(65 + index).repeat(4 + index), { flag: 'wx' });
  if (fault === 'initial-oversize') fs.writeFileSync(files[1], 'B'.repeat(2048));
  const descriptors = new Map(), ledger = [];
  let version = 0, activeFd, opens = 0, closes = 0, publications = 0, beforeRetired = false, error, value, unsafeFacts = 0;
  const retire = () => { version++; publications++; };
  function unsafeOnce(stat, kind) {
    unsafeFacts++;
    if (kind === 'links') stat.nlink = 2n;
    if (kind === 'type') stat.mode = 0o40700n;
    if (kind === 'object') stat.ino++;
    if (kind === 'size') stat.size++;
    if (kind === 'mtime') stat.mtimeNs++;
    if (kind === 'ctime') stat.ctimeNs++;
    retire();
    return stat;
  }
  const freshStat = (fd, args) => {
    const entry = descriptors.get(fd), stat = fs.fstatSync(fd, ...args);
    entry.fstats++;
    if (entry.index < version) { stat.nlink = BigInt(retiredLinks); stat.ctimeNs += 100n; }
    if (fault === 'legitimate-fd-retirement' && schedule === 'initial-two' && entry.index === 1 && entry.fstats === 2 && version === 1) {
      retire(); stat.nlink = BigInt(retiredLinks); stat.ctimeNs += 100n;
    }
    if (fault === 'initial-type' && schedule === 'initial-two' && entry.index === 1 && entry.fstats === 1) stat.mode = 0o40700n;
    if (fault === 'initial-links' && schedule === 'initial-two' && entry.index === 1 && entry.fstats === 1) stat.nlink = 2n;
    if (fault?.startsWith('sticky-fd-') && schedule === 'initial-two' && entry.index === 1 && entry.fstats === 2 && unsafeFacts === 0)
      return unsafeOnce(stat, fault.slice('sticky-fd-'.length));
    if (fault?.startsWith('old-') && entry.read && entry.fstats === 2) {
      retire();
      if (fault === 'old-size') stat.size++;
      if (fault === 'old-mtime') stat.mtimeNs++;
      if (fault === 'old-object') stat.ino++;
      if (fault === 'old-links') stat.nlink = 2n;
    }
    if (entry.index < version && entry.fstats === 3) {
      if (fault === 'fresh-access') throw Object.assign(Error('closed model fault'), { code: 'EACCES' });
      if (fault === 'fresh-object') stat.ino++;
      if (fault === 'fresh-size') stat.size++;
      if (fault === 'fresh-mtime') stat.mtimeNs++;
      if (fault === 'fresh-type') stat.mode = 0o40700n;
      if (fault === 'fresh-links') stat.nlink = 2n;
    }
    if (entry.index < version && entry.fstats === 4) {
      if (fault === 'unstable-ctime') stat.ctimeNs++;
      if (fault === 'unstable-links') stat.nlink = 1n;
    }
    return stat;
  };
  const io = { ...fs,
    lstatSync(file, ...args) {
      if (file !== leaf) {
        const stat = fs.lstatSync(file, ...args);
        if (file === root && version && fault === 'parent') stat.ino++;
        return stat;
      }
      const held = descriptors.get(activeFd);
      if (!held) {
        const stat = fs.lstatSync(files[version], ...args);
        if (schedule === 'initial-two' && !beforeRetired) { beforeRetired = true; retire(); }
        return stat;
      }
      // Original held fstat was already sampled. Publication occurs in the
      // named lstat which first establishes that the name now refers to B.
      if (schedule === 'post-fstat-named' && held.read && !held.published && publications < turns) {
        held.published = true; retire();
      }
      if (schedule === 'initial-two' && held.index === 1 && held.fstats === 1 && version === 1 &&
          !fault?.startsWith('sticky-') && fault !== 'legitimate-fd-retirement') retire();
      if (fault?.startsWith('sticky-named-') && schedule === 'initial-two' && held.index === 1 && version === 1 && unsafeFacts === 0) {
        // Return the one actual classifier observation in a bad state, then
        // make every subsequent retirement/target sample stable and good.
        // The negative may not rely on an indefinitely persistent fault.
        return unsafeOnce(fs.lstatSync(files[version], ...args), fault.slice('sticky-named-'.length));
      }
      if (held.index < version) {
        held.named++;
        if (fault === 'named-missing') throw Object.assign(Error('closed model fault'), { code: 'ENOENT' });
        if (fault === 'named-access') throw Object.assign(Error('closed model fault'), { code: 'EACCES' });
        if (fault === 'named-unstable' && held.named === 3) retire();
      }
      const stat = fs.lstatSync(files[version], ...args);
      if (held.index < version && fault === 'named-links') stat.nlink = 2n;
      if (held.index < version && fault === 'named-symlink') stat.mode = 0o120777n;
      return stat;
    },
    openSync(file, ...args) {
      if (file !== leaf) return fs.openSync(file, ...args);
      opens++; if (fault === 'initial-inplace' && opens === 1) fs.appendFileSync(files[version], 'changed');
      const fd = fs.openSync(files[version], ...args);
      activeFd = fd; const entry = { index: version, fstats: 0, named: 0, read: false, published: false };
      descriptors.set(fd, entry); ledger.push(entry);
      if (fault === 'initial-zero' && schedule === 'initial-two' && version === 1) retire();
      return fd;
    },
    fstatSync(fd, ...args) { return freshStat(fd, args); },
    readSync(fd, ...args) {
      const count = fs.readSync(fd, ...args); descriptors.get(fd).read = true;
      if (fault === 'read') throw Object.assign(Error('closed model fault'), { code: 'EIO' });
      return count;
    },
    closeSync(fd) {
      fs.closeSync(fd); descriptors.delete(fd); if (activeFd === fd) activeFd = undefined; closes++;
      if (fault === 'close') throw Object.assign(Error('closed model fault'), { code: 'EIO' });
    }
  };
  try {
    value = strict === 'record' ? boundary.readBoundFileRecord(leaf, { io, maximum: 1024 }).bytes : strict === 'hash'
      ? boundary.hashBoundFile(leaf, { io, maximum: 1024 }) : boundary.readBoundFileSnapshot(leaf, { io, minimum: 1, maximum: 1024 });
  } catch (caught) { error = caught; }
  // Keep a product descriptor leak a failure, while this isolated test still
  // releases its own real FDs before exiting. Never turn cleanup into PASS.
  if (descriptors.size) {
    const leaked = [...descriptors.keys()];
    for (const fd of leaked) fs.closeSync(fd);
    descriptors.clear();
    assert.fail('production snapshot left delegated descriptors open');
  }
  assert.equal(descriptors.size, 0, 'every real delegated FD closed');
  assert.equal(opens, closes);
  return { value, error, opens, closes, ledger, publications, unsafeFacts, root, expected: fs.readFileSync(files[version]) };
}
function refused(result, attempts = 1, code = 'BOUND_FILE_CHANGED') {
  assert.equal(result.error?.code, code); assert.equal(result.value, undefined); assert.equal(result.opens, attempts);
}
async function callerFixture() {
  const root = fs.mkdtempSync(path.join(evidence, 'caller-'));
  process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'private');
  process.env.EU_PRIVACY_ROOT = path.join(root, 'workspace');
  process.env.EU_PRIVACY_RESULT_ROOT = path.join(root, 'results');
  process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
  delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
  fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT, { mode: 0o700 });
  const targetModule = path.join(product, 'gateway/result-export.js');
  assert.equal(require.cache[targetModule], undefined, 'fresh child imports the actual production caller once');
  const exporter = require(targetModule);
  assert.ok(require.cache[targetModule].children.some(child => child.filename === boundaryFile),
    'actual caller imports the same real product boundary; no candidate/loader substitution');
  const { createDocumentReviewStore } = require(path.join(product, 'gateway/standalone-document-review-store'));
  const { publishMarkdownArtifact } = require(path.join(product, 'standalone/markdown-store'));
  const { createMarkdownExtraction } = require(path.join(product, 'standalone/markdown-contract'));
  const content = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };
  const id = crypto.randomBytes(16).toString('hex'), bytes = Buffer.from('Synthetic production snapshot validation.\n');
  const item = { id, name: 'Synthetic.txt', source_label: 'Synthetic.txt', sha256: sha(bytes), status: 'pending' };
  const state = { schema: 'datasecure-batch/7', token: crypto.randomBytes(32).toString('hex'),
    product_channel: 'standalone', processing_mode: 'markdown-only', standalone_document_review: true,
    content_options: content, profile: 'general', created_at: '2026-10-19T00:00:00.000Z', items: [item] };
  createDocumentReviewStore().captureRun(state);
  const artifact = await publishMarkdownArtifact(createMarkdownExtraction({ source_type: 'txt', markdown: bytes.toString('utf8'),
    coverage: { status: 'complete', reason_codes: [] }, content_options: content }), 'dm_' + id, { contentOptions: content });
  Object.assign(item, artifact, { status: 'released' });
  assert.deepEqual(exporter.exportCompletedState(state), { exported: 1, pending: 0, available: true });
  const file = exporter.recordPath(state.token), owner = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'result-export-owners', path.basename(file));
  assert.equal(exporter.readStandaloneExportHistoryEntry(state.token).complete, true);
  return { file, owner, read: () => exporter.readStandaloneExportHistoryEntry(state.token) };
}
function recordResult(status, error) {
  const result = { schema: 'datasecure-snapshot-retirement-model/1', classification: 'IO_MODEL_NOT_NATIVE', status,
    passed, cases: records, ...(error ? { failed_case: currentCase, error: { name: error.name || 'Error', code: error.code || 'NO_CODE' } } : {}),
    node: process.version, platform: process.platform, source_sha256: sourcePins, fixtures_preserved: evidence,
    historical_mac_phase: 'NOT_PROVEN', mac_native: 'NOT_RUN' };
  fs.writeFileSync(path.join(evidence, 'RESULT.json'), JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
}
(async () => {
  await test('production snapshot discards all original bytes and fully rereads B after post-fstat/named retirement', () => {
    const result = model(); assert.equal(result.error, undefined); assert.deepEqual(result.value, result.expected);
    assert.equal(result.opens, 2); assert.equal(result.ledger[0].read, true); assert.equal(result.ledger[1].read, true);
  });
  await test('retirement may retain one old link solely for classification, never for returning old bytes', () => {
    const result = model({ retiredLinks: 1 }); assert.equal(result.error, undefined);
    assert.deepEqual(result.value, result.expected); assert.equal(result.opens, 2);
  });
  await test('initial A-to-B-before-open then B-to-C during named classification never reads B', () => {
    const result = model({ schedule: 'initial-two' });
    assert.equal(result.error, undefined); assert.deepEqual(result.value, result.expected); assert.equal(result.opens, 2);
    assert.deepEqual(result.ledger.map(entry => entry.index), [1, 2]); assert.equal(result.ledger[0].read, false);
  });
  await test('initial different B already retired before first fstat still never supplies bytes', () => {
    const result = model({ schedule: 'initial-two', fault: 'initial-zero' });
    assert.equal(result.error, undefined); assert.deepEqual(result.value, result.expected);
    assert.equal(result.ledger[0].read, false); assert.equal(result.opens, 2);
  });
  await test('same-object initial in-place change cannot select opened as a fresh original baseline', () => {
    const result = model({ fault: 'initial-inplace' }); refused(result); assert.equal(result.ledger[0].read, false);
  });
  for (const retiredLinks of [0, 1]) await test('only unchanged-content B retirement after the first named sample may enter fallback: links=' + retiredLinks, () => {
    const result = model({ schedule: 'initial-two', fault: 'legitimate-fd-retirement', retiredLinks });
    assert.equal(result.error, undefined); assert.deepEqual(result.value, result.expected);
    assert.equal(result.opens, 2); assert.equal(result.ledger[0].read, false);
  });
  for (const fault of ['sticky-named-links', 'sticky-named-type', 'sticky-named-size', 'sticky-named-mtime', 'sticky-named-ctime',
    'sticky-fd-links', 'sticky-fd-type', 'sticky-fd-object', 'sticky-fd-size', 'sticky-fd-mtime'])
    await test('single unsafe first-classifier observation remains sticky after otherwise good B-to-C retirement: ' + fault, () => {
      const fixed = model({ schedule: 'initial-two', fault });
      refused(fixed); assert.equal(fixed.unsafeFacts, 1);
      assert.equal(fixed.ledger[0].read, false, 'bad unused B supplies no bytes or retry authority');
    });
  for (const fault of ['old-size', 'old-mtime', 'old-object', 'old-links']) await test('earlier suspicious after is not washed by fresh baseline: ' + fault, () => {
    const result = model({ fault }); refused(result); assert.equal(result.ledger[0].fstats, 2, 'reject before a fresh sample could hide earlier evidence');
  });
  for (const fault of ['fresh-object', 'fresh-size', 'fresh-mtime', 'fresh-type', 'fresh-links', 'fresh-access',
    'unstable-ctime', 'unstable-links', 'named-unstable', 'named-links', 'named-symlink', 'named-missing', 'named-access', 'parent', 'read'])
    await test('fresh/stability/named/parent/IO negative remains hard: ' + fault, () => { refused(model({ fault })); });
  for (const fault of ['initial-oversize', 'initial-type', 'initial-links']) await test('initial different B must itself be bounded and regular: ' + fault, () => {
    const result = model({ schedule: 'initial-two', fault }); refused(result); assert.equal(result.ledger[0].read, false);
  });
  await test('close failure dominates otherwise classifiable retirement', () => { refused(model({ fault: 'close' }), 1, 'BOUND_FILE_CLOSE_FAILED'); });
  await test('two retirements finish on third total attempt, three stop without a fourth', () => {
    const success = model({ turns: 2 }); assert.equal(success.error, undefined); assert.equal(success.opens, 3);
    assert.deepEqual(success.value, success.expected); refused(model({ turns: 3 }), 3);
  });
  for (const strict of ['record', 'hash']) await test('strict ' + strict + ' stays one-shot and never acquires snapshot authority', () => {
    refused(model({ strict }));
  });
  const f = await callerFixture(), recordBytes = fs.readFileSync(f.file), ownerBytes = fs.readFileSync(f.owner);
  await test('boundary only validates coherent bytes, actual caller owns schema rejection', () => {
    const value = JSON.parse(recordBytes); value.schema = 'invalid'; fs.writeFileSync(f.file, JSON.stringify(value));
    assert.equal(JSON.parse(boundary.readBoundFileSnapshot(f.file)).schema, 'invalid', 'boundary does not pretend to validate product schema');
    assert.throws(f.read, error => error.code === 'STANDALONE_HISTORY_UNAVAILABLE'); fs.writeFileSync(f.file, recordBytes);
  });
  for (const kind of ['owner', 'purpose']) await test('actual production caller refuses ' + kind, () => {
    const value = JSON.parse(ownerBytes);
    if (kind === 'owner') value.batch_id = 'f'.repeat(64); else value.processing_mode = 'markdown-and-anonymize';
    const before = fs.lstatSync(f.owner, { bigint: true }); fs.writeFileSync(f.owner, JSON.stringify(value));
    const after = fs.lstatSync(f.owner, { bigint: true });
    for (const field of ['dev', 'ino', 'birthtimeNs']) assert.equal(after[field], before[field]);
    assert.throws(f.read, error => error.code === 'STANDALONE_HISTORY_UNAVAILABLE'); fs.writeFileSync(f.owner, ownerBytes);
  });
  currentCase = 'suite source and case-count integrity';
  assert.equal(f.read().complete, true, 'caller control becomes valid again only after explicit fixture restoration');
  assert.equal(sha(fs.readFileSync(boundaryFile)), sourcePins.boundary);
  assert.equal(sha(fs.readFileSync(path.join(product, 'gateway/result-export.js'))), sourcePins.caller);
  assert.equal(passed, 46, 'the full permanent model/caller countercase set must execute');
  recordResult('PASS');
  console.log(`SNAPSHOT_RETIREMENT_IO_MODEL_PASS:${passed}`);
})().catch(error => {
  try { recordResult('FAIL', error); }
  catch { console.error('SNAPSHOT_RETIREMENT_IO_MODEL_EVIDENCE_FAILED'); }
  // No environment, raw native message, vendor payload or source text in logs.
  console.error(`SNAPSHOT_RETIREMENT_IO_MODEL_FAILED:${currentCase}:${error.code || error.name || 'UNKNOWN'}`);
  process.exitCode = 1;
});
