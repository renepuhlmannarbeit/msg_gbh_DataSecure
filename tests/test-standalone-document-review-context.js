'use strict';
// Real held files and production privacy verification. The only fault shim is
// an exact filesystem mutation between two document reads in one locked call.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { createSuite } = require('./helpers');
const { execFileSync } = require('node:child_process');
const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
const { safeRemovePrivateTree } = require('../plugins/data-secure/server/gateway/common');
const { test, assert, done } = createSuite('Standalone call-local document read context');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-document-context-'));
process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'artifact-private-data');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let sequence = 0;
function fixture(traced = false) {
  const index = ++sequence, batchId = index.toString(16).padStart(64, '0');
  const directory = path.join(root, String(index)), data = path.join(directory, 'private'), output = path.join(directory, 'packages');
  fs.mkdirSync(data, { recursive: true }); fs.mkdirSync(output);
  const original = 'Name: Anna Beispiel\nAnna Beispiel hat 42 Projekte.\nE-Mail: anna@example.invalid';
  const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };
  const captured = traced ? require('../plugins/data-secure/server/pii-engine').anonymize(original, 'general',
    { captureTransformPlan: true, productChannel: 'standalone', contentOptions }) : null;
  const markdown = captured?.text || '# Inhalt\n[PERSON_001] hat 42 Projekte.\n';
  const items = [1, 2].map(value => ({ id: (index * 100 + value).toString(16).padStart(32, '0'),
    name: `Quelle-${value}.pdf`, sha256: sha(original), status: 'released' }));
  const state = { product_channel: 'standalone', processing_mode: 'markdown-and-anonymize', token: batchId,
    standalone_document_review: true, items, ...(traced ? { schema: 'datasecure-batch/7', content_options: contentOptions } : {}) };
  const create = () => createDocumentReviewStore({ dataRoot: data, outputRoot: () => output,
    resultRoot: () => path.join(directory, 'results'), expectedDocuments: () => items });
  const store = create();
  for (const item of items) {
    const packageId = `ds_${item.id}`, packageDirectory = path.join(output, packageId); fs.mkdirSync(packageDirectory);
    let binding;
    if (traced) {
      const publication = require('../plugins/data-secure/server/standalone/anonymized-artifact');
      const coverage = { status: 'complete', reason_codes: [] };
      const proof = publication.verifyAnonymizedPublication({ markdown, profile: 'general', content_options: contentOptions,
        source_extraction: require('../plugins/data-secure/server/core/source-extraction-contract').createSourceExtraction({
          source_type: 'pdf', content_options: contentOptions, coverage, markdown: original }, 8_000_000),
        dictionary: captured.dictionary, strong_person_anchor: captured.strongPersonAnchor === true, reviewed_person_candidates: null });
      const artifact = publication.createAnonymizedArtifact({ package_id: packageId, content_options: contentOptions,
        source_type: 'pdf', profile: 'general', operation_id: crypto.randomUUID(), created_at: new Date().toISOString(),
        coverage, markdown, verification_proof: proof });
      const target = path.join(require('../plugins/data-secure/server/standalone/anonymized-store').anonymizedArtifactRoots().output, packageId);
      fs.mkdirSync(target); fs.writeFileSync(path.join(target, `${packageId}.md`), markdown);
      fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(artifact.manifest)); binding = artifact.expectation;
    }
    store.capture(state, item, { package_id: packageId, original_text: original, markdown,
      ...(traced ? { content_options: contentOptions, source_type: 'pdf', publication_binding: binding,
        transform_trace: captured.transform_trace, verification_context: { profile: 'general', dictionary: captured.dictionary,
          strong_person_anchor: captured.strongPersonAnchor === true,
          ruleset: require('../plugins/data-secure/server/privacy/policy').PRIVACY_RULESET_VERSION,
          credential_policy: require('../plugins/data-secure/server/privacy/policy').CREDENTIAL_CONTEXT_POLICY_VERSION,
          person_field_policy: require('../plugins/data-secure/server/core/person-field-policy').CONTENT_PERSON_FIELD_POLICY,
          publication_frame: { prefix: '', suffix: '' }, reviewed_ranges: [] } } : {}) });
    fs.writeFileSync(path.join(packageDirectory, `${packageId}.md`), markdown);
    fs.writeFileSync(path.join(packageDirectory, 'manifest.json'), JSON.stringify({ schema: 'eu-privacy-package/3',
      package_id: packageId, document: `${packageId}.md`, verification: { text_residual_pii: 'passed' }, document_sha256: sha(markdown) }));
  }
  const run = path.join(data, 'document-reviews', batchId);
  const request = action => ({ action, operation_id: crypto.randomBytes(16).toString('hex'),
    selection: store.list(batchId).documents.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 })) });
  return { batchId, create, store, items, run, request, markdown };
}
function mutateDuringSecondBody(f, mutation, action) {
  const target = path.join(f.run, f.items[1].id, 'base.json'), open = fs.openSync;
  let fired = false;
  fs.openSync = function(file, ...args) {
    if (!fired && file === target) { fired = true; mutation(); }
    return open.call(this, file, ...args);
  };
  try { action(); assert.equal(fired, true, 'the mutation ran after the first document and initial manifest read'); }
  finally { fs.openSync = open; }
}
function manifestReadCount(f, action) {
  const open = fs.openSync; let count = 0;
  fs.openSync = function(file, ...args) {
    if (file === path.join(f.run, 'manifest.json')) count++;
    return open.call(this, file, ...args);
  };
  try { action(); } finally { fs.openSync = open; }
  return count;
}
function mutateAfterFirstManifestRead(f, mutation, action) {
  const file = path.join(f.run, 'manifest.json'), open = fs.openSync, close = fs.closeSync;
  let descriptor, fired = false;
  fs.openSync = function(target, ...args) {
    const fd = open.call(this, target, ...args);
    if (!fired && target === file) descriptor = fd;
    return fd;
  };
  fs.closeSync = function(fd, ...args) {
    const result = close.call(this, fd, ...args);
    if (!fired && fd === descriptor) { fired = true; mutation(); }
    return result;
  };
  try { action(); assert.equal(fired, true, 'the manifest changed immediately after its first held read'); }
  finally { fs.openSync = open; fs.closeSync = close; }
}
test('a traced content-bound selection shares only run facts, with fresh replay and residual verification', () => {
  const f = fixture(true);
  assert.equal(manifestReadCount(f, () => assert.equal(f.store.list(f.batchId).documents.length, 2)), 2,
    'one held manifest shared with journal validation and one final identity/byte validation');
  const request = f.request('approve');
  const engine = require('../plugins/data-secure/server/pii-engine'), scan = engine.scanResidual;
  let residualChecks = 0;
  engine.scanResidual = function(...args) { residualChecks++; return scan.apply(this, args); };
  try {
    assert.equal(manifestReadCount(f, () => assert.ok(f.store.decideBatch(f.batchId, request).documents.every(row => row.approved))), 3,
      'one manifest shared with journal validation, validation before commit, and validation before the response');
  } finally { engine.scanResidual = scan; }
  assert.equal(residualChecks, 2, 'both actual traced candidates still run the real residual detector');
  const listed = f.create().list(f.batchId);
  assert.ok(listed.documents.every(row => row.approved && row.revision === 1));
  const first = listed.documents[0];
  f.store.decide(f.batchId, first.document_id, { action: 'revoke', ranges: [], revision: first.revision,
    output_sha256: first.output_sha256, operation_id: crypto.randomBytes(16).toString('hex') });
  assert.equal(f.create().list(f.batchId).documents[0].approved, false, 'a new request cannot reuse a preceding approval');
  assert.throws(() => f.store.decideBatch(f.batchId, { ...request, operation_id: crypto.randomBytes(16).toString('hex') }),
    error => error.code === 'DOCUMENT_REVIEW_STALE');
});
for (const action of ['list', 'approve']) {
  test(`${action} cannot validate an earlier commit against one manifest and adopt another for the remaining document`, () => {
    const f = fixture(), initial = f.request('approve'), first = initial.selection[0], second = initial.selection[1];
    f.store.decideBatch(f.batchId, { ...initial, selection: [first] });
    const request = { action: 'approve', operation_id: crypto.randomBytes(16).toString('hex'), selection: [second] };
    const file = path.join(f.run, 'manifest.json'), bytes = fs.readFileSync(file);
    const commits = () => fs.readdirSync(f.run).filter(name => /^commit-/u.test(name)).sort()
      .map(name => [name, sha(fs.readFileSync(path.join(f.run, name)))]);
    const before = commits(); assert.equal(before.length, 1);
    try {
      mutateAfterFirstManifestRead(f, () => {
        const value = JSON.parse(bytes); value.documents = value.documents.filter(row => row.document_id === second.document_id);
        fs.writeFileSync(file, JSON.stringify(value));
      }, () => assert.throws(() => action === 'list' ? f.store.list(f.batchId) : f.store.decideBatch(f.batchId, request),
        error => error.code === 'DOCUMENT_REVIEW_CONFLICT'));
      assert.deepEqual(commits(), before, 'the previous commit remains exact and no new selection is committed');
    } finally { fs.writeFileSync(file, bytes); }
    const listed = f.create().list(f.batchId).documents;
    assert.equal(listed[0].approved, true); assert.equal(listed[0].revision, 1);
    assert.equal(listed[1].approved, false); assert.equal(listed[1].revision, 0);
    assert.equal(f.create().decideBatch(f.batchId, request).affected_count, 1,
      'a new controlled call can retry against freshly restored evidence');
  });
  for (const change of ['replace-same-bytes', 'change-bytes', 'remove', 'replace-run', 'linked-run', 'hardlinked-manifest']) {
    test(`${action} rejects ${change} during a bound read without a partial selection commit`, () => {
      const f = fixture(), request = f.request('approve'), file = path.join(f.run, 'manifest.json');
      const bytes = fs.readFileSync(file), displaced = `${file}.original`, movedRun = `${f.run}-original`;
      let moved = false, linked = false;
      try {
        mutateDuringSecondBody(f, () => {
          if (change === 'replace-run' || change === 'linked-run') {
            fs.renameSync(f.run, movedRun); moved = true;
            if (change === 'linked-run') { fs.symlinkSync(movedRun, f.run, process.platform === 'win32' ? 'junction' : 'dir'); linked = true; }
            else fs.mkdirSync(f.run);
          }
          else if (change === 'change-bytes') {
            const value = JSON.parse(bytes); value.documents[0].name = 'Changed.pdf'; fs.writeFileSync(file, JSON.stringify(value));
          } else {
            fs.renameSync(file, displaced);
            if (change === 'replace-same-bytes') fs.writeFileSync(file, bytes);
            else if (change === 'hardlinked-manifest') fs.linkSync(displaced, file);
          }
        }, () => assert.throws(() => action === 'list' ? f.store.list(f.batchId) : f.store.decideBatch(f.batchId, request),
          error => ['DOCUMENT_REVIEW_CONFLICT', 'DOCUMENT_REVIEW_MISSING'].includes(error.code) && !error.message.includes(f.run)));
      } finally {
        if (moved) { if (linked) fs.unlinkSync(f.run); else fs.rmdirSync(f.run); fs.renameSync(movedRun, f.run); }
        else if (fs.existsSync(displaced)) { if (fs.existsSync(file)) fs.unlinkSync(file); fs.renameSync(displaced, file); }
        else fs.writeFileSync(file, bytes);
      }
      assert.equal(fs.readdirSync(f.run).filter(name => /^commit-/u.test(name)).length, 0);
      assert.ok(f.create().list(f.batchId).documents.every(row => !row.approved));
    });
  }
}
for (const action of ['approve', 'revoke', 'redact', 'restore_base', 'entities-document', 'entities-run']) {
  test(`single ${action} rejects the early manifest switch before adding any durable commit`, () => {
    const f = fixture(true), initial = f.request('approve'), first = initial.selection[0], second = initial.selection[1];
    f.store.decideBatch(f.batchId, { ...initial, selection: action === 'approve' ? [first] : [first, second] });
    const previous = f.store.list(f.batchId).documents.find(row => row.document_id === second.document_id);
    const isEntities = action.startsWith('entities-');
    const entity = isEntities && f.store.entities(f.batchId, second.document_id, previous.revision, 0).entities
      .find(row => row.kind === 'PERSON' && row.run_eligible);
    if (isEntities) assert.ok(entity, 'use an actual reversible, run-eligible person identity');
    const request = { action: isEntities ? 'entities' : action, operation_id: crypto.randomBytes(16).toString('hex'),
      ranges: action === 'redact' ? [{ start: f.markdown.indexOf('42'), end: f.markdown.indexOf('42') + 2 }] : [],
      revision: previous.revision, output_sha256: previous.output_sha256,
      ...(isEntities ? { entity_decisions: [{ entity_id: entity.entity_id, decision: 'organization' }],
        scope: action === 'entities-run' ? 'run' : 'document' } : {}) };
    const file = path.join(f.run, 'manifest.json'), bytes = fs.readFileSync(file);
    const commits = () => fs.readdirSync(f.run).filter(name => /^commit-/u.test(name)).sort()
      .map(name => [name, sha(fs.readFileSync(path.join(f.run, name)))]);
    const before = commits(); let failure;
    try {
      mutateAfterFirstManifestRead(f, () => {
        const value = JSON.parse(bytes); value.documents = value.documents.filter(row => row.document_id === second.document_id);
        fs.writeFileSync(file, JSON.stringify(value));
      }, () => { try { f.store.decide(f.batchId, second.document_id, request); } catch (error) { failure = error; } });
      assert.deepEqual(commits(), before, 'invalidated run evidence must not durably approve, revoke or edit any document');
      assert.equal(failure?.code, 'DOCUMENT_REVIEW_CONFLICT');
    } finally { fs.writeFileSync(file, bytes); }
    const restored = f.create().list(f.batchId).documents.find(row => row.document_id === second.document_id);
    assert.equal(restored.revision, previous.revision); assert.equal(restored.approved, previous.approved);
    const result = f.create().decide(f.batchId, second.document_id, request);
    assert.equal(result.ok, true, 'a separate fresh controlled call can retry after restoration');
    assert.equal(result.revision, previous.revision + 1);
    assert.equal(result.approved, action === 'approve');
    if (action === 'entities-run') assert.equal(result.affected_count, 2, 'the actual run action reaches both bound identities');
    assert.deepEqual(f.create().decide(f.batchId, second.document_id, request), result, 'an exact lost-ACK retry stays idempotent');
  });
}

test('an idempotent single-decision ACK also rejects a changed held manifest without another commit', () => {
  const f = fixture(true), row = f.request('approve').selection[0];
  const request = { action: 'approve', ranges: [], operation_id: crypto.randomBytes(16).toString('hex'),
    revision: row.revision, output_sha256: row.output_sha256 };
  const result = f.store.decide(f.batchId, row.document_id, request);
  const file = path.join(f.run, 'manifest.json'), bytes = fs.readFileSync(file);
  try {
    mutateAfterFirstManifestRead(f, () => {
      const value = JSON.parse(bytes); value.preflight_rejections = [{ document_id: 'f'.repeat(32),
        name: 'Extra.pdf', reason_code: 'SOURCE_FORMAT_UNSUPPORTED' }]; fs.writeFileSync(file, JSON.stringify(value));
    }, () => assert.throws(() => f.create().decide(f.batchId, row.document_id, request),
      error => error.code === 'DOCUMENT_REVIEW_CONFLICT'));
  } finally { fs.writeFileSync(file, bytes); }
  assert.equal(fs.readdirSync(f.run).filter(name => /^commit-/u.test(name)).length, 1);
  assert.deepEqual(f.create().decide(f.batchId, row.document_id, request), result);
});

test('a manifest switch after commit cannot gain a success ACK or erase the committed decision', () => {
  const f = fixture(true), initial = f.request('approve'), first = initial.selection[0], second = initial.selection[1];
  f.store.decideBatch(f.batchId, { ...initial, selection: [first] });
  const request = { action: 'approve', ranges: [], operation_id: crypto.randomBytes(16).toString('hex'),
    revision: second.revision, output_sha256: second.output_sha256 };
  const file = path.join(f.run, 'manifest.json'), bytes = fs.readFileSync(file), link = fs.linkSync;
  let fired = false;
  fs.linkSync = function(from, to, ...args) {
    const result = link.call(this, from, to, ...args);
    if (!fired && to === path.join(f.run, 'decision-000002.json')) {
      fired = true; const value = JSON.parse(bytes);
      value.documents = value.documents.filter(row => row.document_id === second.document_id);
      fs.writeFileSync(file, JSON.stringify(value));
    }
    return result;
  };
  try {
    assert.throws(() => f.store.decide(f.batchId, second.document_id, request), error => error.code === 'DOCUMENT_REVIEW_CONFLICT');
    assert.equal(fired, true);
    assert.equal(fs.readdirSync(f.run).filter(name => /^commit-/u.test(name)).length, 2,
      'a decision already at its durable commit point is not rolled back or silently rewritten');
  } finally { fs.linkSync = link; fs.writeFileSync(file, bytes); }
  const replay = f.create().decide(f.batchId, second.document_id, request);
  assert.equal(replay.approved, true); assert.equal(replay.revision, 1);
  assert.equal(fs.readdirSync(f.run).filter(name => /^commit-/u.test(name)).length, 2);
});

test('later calls freshly reject a changed content artifact instead of reusing an earlier successful list', () => {
  const f = fixture(true); assert.equal(f.store.list(f.batchId).documents.length, 2);
  const snapshot = JSON.parse(fs.readFileSync(path.join(f.run, f.items[1].id, 'base.json')));
  const target = path.join(require('../plugins/data-secure/server/standalone/anonymized-store').anonymizedArtifactRoots().output,
    snapshot.package_id, `${snapshot.package_id}.md`);
  fs.writeFileSync(target, `${f.markdown} RAW_UNBOUND_TEXT`);
  const list = f.store.list(f.batchId);
  assert.equal(list.documents.length, 1); assert.equal(list.unavailable.length, 1);
  assert.equal(list.unavailable[0].document_id, f.items[1].id);
});
function stoppedCaptureFixture() {
  const index = ++sequence, batchId = index.toString(16).padStart(64, '0');
  const data = path.join(root, String(index), 'capture-data');
  fs.mkdirSync(data, { recursive: true });
  const state = { product_channel: 'standalone', processing_mode: 'markdown-and-anonymize', token: batchId,
    standalone_document_review: true, items: [1, 2].map(offset => ({
      id: (index * 100 + offset).toString(16).padStart(32, '0'), name: `Quelle-${offset}.txt`,
      sha256: sha(`synthetic-${offset}`), status: 'stopped', error_code: 'SOURCE_READ_FAILED',
      document_result: require('../plugins/data-secure/server/gateway/document-result-grade')
        .notProcessedDocumentResult('SOURCE_READ_FAILED') })) };
  const store = createDocumentReviewStore({ dataRoot: data });
  const run = path.join(data, 'document-reviews', batchId);
  return { state, store, run, items: state.items };
}

test('native ownership refusal precedes every creating capture access', () => {
  const data = path.join(root, 'denied-native-capture');
  const script = `const fs=require('node:fs'),path=require('node:path');
    for(const key of Object.keys(process.env))if(/^(EU_PRIVACY_|DATASECURE_)/u.test(key))delete process.env[key];
    Object.assign(process.env,{EU_PRIVACY_DATA_ROOT:process.argv[1],DATASECURE_PRODUCT_CHANNEL:'standalone',DATASECURE_NATIVE_EXPORT_CHANNEL:'1'});
    const {createDocumentReviewStore}=require(process.argv[2]);
    let code;try{createDocumentReviewStore({dataRoot:process.argv[1]}).captureRun({token:'a'.repeat(64),standalone_document_review:true});}
    catch(error){code=error.code;}
    console.log(JSON.stringify({code,created:fs.existsSync(path.join(process.argv[1],'document-reviews'))}));`;
  const result = JSON.parse(execFileSync(process.execPath, ['-e', script, data,
    require.resolve('../plugins/data-secure/server/gateway/standalone-document-review-store')],
    { encoding: 'utf8', windowsHide: true, timeout: 10000 }));
  assert.equal(result.created, false, 'an unavailable native guard must not create private review storage');
  assert.match(result.code, /^OWNERSHIP_GUARD_/u);
});

test('repeated terminal capture reads actual immutable metadata without temporary publication or fsync', () => {
  const f = stoppedCaptureFixture(); f.store.captureRun(f.state);
  const open = fs.openSync, sync = fs.fsyncSync; let temporaryWrites = 0, syncs = 0, failureReads = 0;
  const descriptors = new Map();
  fs.openSync = function(file, flags, ...args) {
    if (typeof file === 'string' && file.startsWith(f.run + path.sep)) {
      if (file.endsWith('.tmp')) temporaryWrites++;
      if (/failure-[a-f0-9]{32}\.json$/u.test(file)) failureReads++;
    }
    const fd = open.call(this, file, flags, ...args); descriptors.set(fd, file); return fd;
  };
  fs.fsyncSync = function(fd, ...args) {
    // The control-lock publication is still required and has its own fsync.
    if (String(descriptors.get(fd)).startsWith(f.run + path.sep)) syncs++;
    return sync.call(this, fd, ...args);
  };
  try { assert.equal(f.store.captureRun(f.state).ok, true); }
  finally { fs.openSync = open; fs.fsyncSync = sync; }
  assert.equal(temporaryWrites, 0); assert.equal(syncs, 0); assert.equal(failureReads, 2);
  assert.equal(f.store.notProcessed(f.state.token).length, 2);
});

test('a changed immutable failure remains a conflict rather than being overwritten by a repeated capture', () => {
  const f = stoppedCaptureFixture(); f.store.captureRun(f.state);
  const file = path.join(f.run, `failure-${f.items[0].id}.json`);
  const original = fs.readFileSync(file), changed = Buffer.from(original.toString().replace('Quelle-1', 'Quelle-X'));
  fs.writeFileSync(file, changed);
  assert.throws(() => f.store.captureRun(f.state), error => error.code === 'DOCUMENT_REVIEW_CONFLICT');
  assert.ok(fs.readFileSync(file).equals(changed), 'conflicting evidence must survive the failed capture');
  fs.writeFileSync(file, original); assert.equal(f.store.captureRun(f.state).ok, true);
});

test('terminal capture rechecks the original manifest object after sharing it within the call', () => {
  const f = stoppedCaptureFixture(); f.store.captureRun(f.state);
  const file = path.join(f.run, 'manifest.json'), original = fs.readFileSync(file);
  mutateAfterFirstManifestRead(f, () => {
    fs.renameSync(file, path.join(f.run, 'original-manifest.json'));
    fs.writeFileSync(file, original, { flag: 'wx' });
  }, () => assert.throws(() => f.store.captureRun(f.state), error => error.code === 'DOCUMENT_REVIEW_CONFLICT'));
  assert.ok(fs.readFileSync(file).equals(original), 'equal bytes do not authorize adoption of a replacement object mid-call');
});

done(() => safeRemovePrivateTree(path.dirname(root), path.basename(root)));
