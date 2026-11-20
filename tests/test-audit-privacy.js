'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-audit-'));
process.env.EU_PRIVACY_ROOT = path.join(root, 'privacy');
process.env.LOCALAPPDATA = path.join(root, 'localapp');
process.env.EU_PRIVACY_DATA_ROOT = path.join(root, 'product-data');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(root, 'results');

const {
  AUDIT_SCHEMA,
  sanitizeReceipt,
  migrateLegacyAuditReceipts,
  auditStatus,
  retainAudit,
  createPreparedAuditRun,
  writePackageAudit
} = require('../plugins/data-secure/server/gateway/audit');
const { roots } = require('../plugins/data-secure/server/gateway/common');
const { releasedDocumentResult } = require('../plugins/data-secure/server/gateway/document-result-grade');

const { test, done, assert } = createSuite('Audit privacy');

function json(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('the current receipt is a strict metadata whitelist with ruleset provenance', () => {
  const secret = 'Max Mustermann';
  const receipt = sanitizeReceipt({
    operation_id: crypto.randomUUID(),
    timestamp: '2026-08-21T08:00:00.000Z',
    gateway_version: '3.2.0-rc8',
    privacy_ruleset: 'de-business/3',
    credential_context_policy: 'credential-context/2',
    profile: 'personnel_profile',
    source_extension: '.docx',
    source_bytes: 123456,
    source_sha256: crypto.createHash('sha256').update('document').digest('hex'),
    output_sha256: crypto.createHash('sha256').update('output').digest('hex'),
    value_hash: crypto.createHash('sha256').update(secret).digest('hex').slice(0, 10),
    original_filename: 'Max-Mustermann-Lebenslauf.docx',
    original_path: `C:\\Personal\\${secret}.docx`,
    raw_value: secret,
    text_entity_count: 4,
    privacy_passes: 2,
    residual_pii_verification: 'passed',
    visual_assets_total: 1,
    visual_assets_included: 0,
    visual_assets_review_required: 1,
    visual_redactions: 0
  });
  const encoded = JSON.stringify(receipt);
  assert.strictEqual(receipt.schema, AUDIT_SCHEMA);
  assert.strictEqual(receipt.privacy_ruleset, 'de-business/3');
  assert.strictEqual(receipt.credential_context_policy, 'credential-context/2');
  assert.strictEqual(receipt.source_size_class, 'tiny');
  assert.strictEqual(receipt.source_bytes, undefined);
  assert.doesNotMatch(encoded, /Max Mustermann|Lebenslauf|Personal/);
  assert.doesNotMatch(encoded, /(?:source|output|value)_(?:sha|hash)/i);
  assert.doesNotMatch(encoded, /123456/);
});

test('a prepared in-process capability skips only the duplicate audit migration scan', () => {
  const receipt = {
    operation_id: crypto.randomUUID(), timestamp: '2026-08-21T09:00:00.000Z',
    gateway_version: '3.2.0-rc34', profile: 'general', source_extension: '.txt',
    text_entity_count: 0, privacy_passes: 1, residual_pii_verification: 'passed',
    visual_assets_total: 0, visual_assets_included: 0, visual_assets_review_required: 0, visual_redactions: 0
  };
  let migrations = 0;
  const migration = () => { migrations += 1; return { legacy_pending: 0, migration_errors: 0 }; };
  const capability = createPreparedAuditRun();
  assert.strictEqual(retainAudit(receipt, { preparedAuditRun: capability, migrateLegacyAuditReceipts: migration }), true);
  assert.strictEqual(migrations, 0);
  assert.strictEqual(retainAudit({ ...receipt, operation_id: crypto.randomUUID() }, { migrateLegacyAuditReceipts: migration }), true);
  assert.strictEqual(migrations, 1);
});

test('package audit stops before creating a file when the local capacity gate rejects it', () => {
  const packageDir = path.join(root, 'package-audit-capacity');
  fs.mkdirSync(packageDir, { recursive: true });
  const error = new Error('LOCAL_CAPACITY_INSUFFICIENT');
  error.code = 'LOCAL_CAPACITY_INSUFFICIENT';
  assert.throws(
    () => writePackageAudit({
      operation_id: crypto.randomUUID(),
      timestamp: '2026-08-21T09:00:00.000Z',
      profile: 'general',
      source_extension: '.txt',
      result: 'released',
      residual_pii_verification: 'passed'
    }, packageDir, { assertWritableCapacity: () => { throw error; } }),
    (received) => received?.code === 'LOCAL_CAPACITY_INSUFFICIENT'
  );
  assert.strictEqual(fs.existsSync(path.join(packageDir, 'audit.json')), false);
  assert.deepStrictEqual(fs.readdirSync(packageDir), []);
});

test('package audit normalizes a real ENOSPC after a positive capacity check', () => {
  const packageDir = path.join(root, 'package-audit-enospc');
  fs.mkdirSync(packageDir, { recursive: true });
  const io = Object.create(fs);
  io.writeFileSync = (candidate, ...args) => {
    if (String(candidate).includes('.audit_')) {
      const error = new Error('disk full');
      error.code = 'ENOSPC';
      throw error;
    }
    return fs.writeFileSync(candidate, ...args);
  };
  assert.throws(
    () => writePackageAudit({
      operation_id: crypto.randomUUID(),
      timestamp: '2026-08-21T09:00:00.000Z',
      profile: 'general', source_extension: '.txt', result: 'released', residual_pii_verification: 'passed'
    }, packageDir, { fs: io, assertWritableCapacity: () => {} }),
    (received) => received?.code === 'LOCAL_CAPACITY_RACE'
  );
  assert.strictEqual(fs.existsSync(path.join(packageDir, 'audit.json')), false);
  assert.deepStrictEqual(fs.readdirSync(packageDir), []);
});

test('receipt migration never rewrites the separate evidence outbox namespace', () => {
  const evidence = require('../plugins/data-secure/server/gateway/batch-evidence');
  const dir = roots().audit;
  const record = evidence.evidenceRecord({ schema: 'datasecure-batch/4', profile: 'general',
    created_at: '2026-08-26T10:00:00.000Z', items: [{ status: 'stopped', error_code: 'SOURCE_TEXT_INVALID',
      document_result: require('../plugins/data-secure/server/gateway/document-result-grade').notProcessedDocumentResult('SOURCE_TEXT_INVALID') }] },
    '2026-08-26T11:00:00.000Z', 'a'.repeat(32));
  evidence.createPendingEvidence(record, { auditDir: dir });
  const pending = path.join(dir, `batch_evidence_pending_${record.receipt_id}.json`);
  const original = fs.readFileSync(pending);
  const broken = path.join(dir, `batch_evidence_pending_${'b'.repeat(32)}.json`);
  fs.writeFileSync(broken, '{');
  try {
    assert.equal(migrateLegacyAuditReceipts().migration_errors, 0);
    assert.deepEqual(fs.readFileSync(pending), original);
    assert.equal(fs.readFileSync(broken, 'utf8'), '{', 'malformed evidence is owned by evidence recovery, not receipt migration');
    fs.unlinkSync(broken);
    assert.equal(evidence.listPendingEvidence({ auditDir: dir }).length, 1);
    assert.equal(evidence.createPendingEvidence(record, { auditDir: dir }), false);
    const unknown = path.join(dir, 'unknown-schema.json');
    const unknownBytes = JSON.stringify({ schema: 'other-product/1', private: 'synthetic' });
    fs.writeFileSync(unknown, unknownBytes);
    try {
      assert.equal(migrateLegacyAuditReceipts().migration_errors, 1);
      assert.equal(fs.readFileSync(unknown, 'utf8'), unknownBytes);
    } finally { fs.unlinkSync(unknown); }
  } finally {
    if (fs.existsSync(broken)) fs.unlinkSync(broken);
    evidence.removePendingEvidence(record, { auditDir: dir });
  }
});

test('legacy audit migration removes fingerprints atomically and is idempotent', () => {
  const dir = roots().audit;
  const legacy = path.join(dir, 'legacy.json');
  const sourceHash = crypto.createHash('sha256').update('known document').digest('hex');
  const valueHash = crypto.createHash('sha256').update('Erika Beispiel').digest('hex').slice(0, 10);
  fs.writeFileSync(
    legacy,
    JSON.stringify({
      timestamp: '2026-08-21T08:00:00.000Z',
      gateway_version: '3.2.0-rc8',
      profile: 'customer',
      source_extension: '.pdf',
      source_bytes: 8123,
      source_sha256: sourceHash,
      output_sha256: 'a'.repeat(64),
      value_hash: valueHash,
      text_entity_count: 3,
      privacy_passes: 1,
      residual_pii_verification: 'passed',
      reidentification_risk: 'context_dependent',
      visual_assets_total: 0,
      visual_assets_included: 0,
      visual_assets_review_required: 0,
      visual_redactions: 0
    })
  );

  const first = migrateLegacyAuditReceipts();
  assert.strictEqual(first.legacy_pending, 0);
  assert.strictEqual(first.migration_errors, 0);
  const migrated = json(legacy);
  const operationId = migrated.operation_id;
  const encoded = JSON.stringify(migrated);
  assert.strictEqual(migrated.schema, AUDIT_SCHEMA);
  assert.strictEqual(migrated.privacy_ruleset, 'legacy/unknown');
  assert.strictEqual(migrated.credential_context_policy, 'legacy/unknown');
  assert.strictEqual(
    migrated.result,
    'verification_passed',
    'legacy receipts written before publish must not be upgraded to released'
  );
  assert.doesNotMatch(encoded, new RegExp(`${sourceHash}|${valueHash}`));
  assert.doesNotMatch(encoded, /source_bytes|source_sha256|output_sha256|value_hash/);
  assert.deepStrictEqual(
    fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')),
    [],
    'migration must not leave partial receipts'
  );

  const second = migrateLegacyAuditReceipts();
  assert.strictEqual(second.migration_errors, 0);
  assert.strictEqual(json(legacy).operation_id, operationId, 'a second pass must not rewrite the receipt identity');
});

test('a forged current receipt is canonicalized instead of trusted by schema name', () => {
  const dir = roots().audit;
  const forged = path.join(dir, 'forged-v2.json');
  fs.writeFileSync(
    forged,
    JSON.stringify({
      ...sanitizeReceipt({ profile: 'customer', source_extension: '.docx' }),
      source_sha256: 'b'.repeat(64),
      raw_value: 'Erika Beispiel',
      original_path: 'C:\\Personal\\Erika.docx'
    })
  );
  const migrated = migrateLegacyAuditReceipts();
  assert.strictEqual(migrated.migration_errors, 0);
  const encoded = JSON.stringify(json(forged));
  assert.doesNotMatch(encoded, /source_sha256|Erika|Personal/);
});

test('current package and retained audit bind the exact positive manifest result', () => {
  const r = roots();
  const operationId = crypto.randomUUID();
  const documentResult = releasedDocumentResult({
    parserWarnings: [], visualResults: [], unreviewedVisualCount: 0, imagesRemovedByExplicitRequest: 0
  });
  const receipt = sanitizeReceipt({
    operation_id: operationId,
    timestamp: '2026-08-21T09:02:00.000Z',
    profile: 'customer',
    source_extension: '.docx',
    result: 'released',
    residual_pii_verification: 'passed',
    document_result: documentResult
  });
  assert.deepStrictEqual(receipt.document_result, documentResult);
  const packageDir = path.join(r.output, 'grade-bound-package');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'manifest.json'), JSON.stringify({
    schema: 'eu-privacy-package/3',
    operation_id: operationId,
    parser_warnings: [],
    assets: [],
    pdf_unextractable_visual_objects: 0,
    images_removed_by_explicit_request: 0,
    visual_assets_withheld_at_release: 0,
    document_result: documentResult
  }));
  fs.writeFileSync(path.join(packageDir, 'audit.json'), JSON.stringify(receipt));
  assert.strictEqual(migrateLegacyAuditReceipts().write_errors, 0);
  const retained = fs.readdirSync(r.audit)
    .filter((name) => name.endsWith('.json'))
    .map((name) => json(path.join(r.audit, name)))
    .find((entry) => entry.operation_id === operationId);
  assert.deepStrictEqual(retained.document_result, documentResult);
});

test('audit recovery refuses a formally valid grade that differs from the v3 manifest', () => {
  const r = roots();
  const operationId = crypto.randomUUID();
  const complete = releasedDocumentResult({
    parserWarnings: [], visualResults: [], unreviewedVisualCount: 0, imagesRemovedByExplicitRequest: 0
  });
  const omitted = releasedDocumentResult({
    parserWarnings: [], visualResults: [{ status: 'review_required' }], unreviewedVisualCount: 0,
    imagesRemovedByExplicitRequest: 0
  });
  const packageDir = path.join(r.output, 'grade-mismatch-package');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'manifest.json'), JSON.stringify({
    schema: 'eu-privacy-package/3', operation_id: operationId, parser_warnings: [], assets: [],
    pdf_unextractable_visual_objects: 0, images_removed_by_explicit_request: 0,
    visual_assets_withheld_at_release: 0, document_result: complete
  }));
  fs.writeFileSync(path.join(packageDir, 'audit.json'), JSON.stringify(sanitizeReceipt({
    operation_id: operationId, timestamp: '2026-08-21T09:03:00.000Z', profile: 'customer',
    source_extension: '.docx', result: 'released', residual_pii_verification: 'passed', document_result: omitted
  })));
  assert.strictEqual(migrateLegacyAuditReceipts().write_errors, 0);
  assert.strictEqual(fs.readdirSync(r.audit)
    .filter((name) => name.endsWith('.json'))
    .map((name) => json(path.join(r.audit, name)))
    .some((entry) => entry.operation_id === operationId), false);
});

test('a persistent write marker is recovered from the released package receipt', () => {
  const r = roots();
  const operationId = crypto.randomUUID();
  const receipt = sanitizeReceipt({
    operation_id: operationId,
    timestamp: '2026-08-21T09:00:00.000Z',
    profile: 'customer',
    source_extension: '.pdf',
    result: 'released',
    residual_pii_verification: 'passed'
  });
  const packageDir = path.join(r.output, 'recovery-package');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'manifest.json'), JSON.stringify({ operation_id: operationId }));
  fs.writeFileSync(path.join(packageDir, 'audit.json'), JSON.stringify(receipt, null, 2));
  const marker = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'audit-write-blocked.json');
  fs.writeFileSync(
    marker,
    JSON.stringify({
      schema: 'data-secure-audit-write-block/1',
      operation_id: operationId,
      timestamp: '2026-08-21T09:00:01.000Z'
    })
  );

  const recovered = migrateLegacyAuditReceipts();
  assert.strictEqual(recovered.write_errors, 0);
  assert.ok(!fs.existsSync(marker), 'successful reconciliation must clear the persistent block');
  assert.ok(
    fs
      .readdirSync(r.audit)
      .map((name) => json(path.join(r.audit, name)))
      .some((entry) => entry.operation_id === operationId),
    'released package receipt must be restored to the retained audit'
  );
});

test('a crash-window package without a marker is reconciled on restart', () => {
  const r = roots();
  const operationId = crypto.randomUUID();
  const receipt = sanitizeReceipt({
    operation_id: operationId,
    timestamp: '2026-08-21T09:05:00.000Z',
    profile: 'personnel_profile',
    source_extension: '.docx',
    result: 'released',
    residual_pii_verification: 'passed'
  });
  const packageDir = path.join(r.output, 'crash-window-package');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'manifest.json'), JSON.stringify({ operation_id: operationId }));
  fs.writeFileSync(path.join(packageDir, 'audit.json'), JSON.stringify(receipt, null, 2));

  const reconciled = migrateLegacyAuditReceipts();
  assert.strictEqual(reconciled.write_errors, 0);
  assert.ok(
    fs
      .readdirSync(r.audit)
      .map((name) => json(path.join(r.audit, name)))
      .some((entry) => entry.operation_id === operationId),
    'startup reconciliation must close the publish-before-audit crash window'
  );
});

test('an unrecoverable persistent write marker blocks readiness', () => {
  const marker = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'audit-write-blocked.json');
  fs.writeFileSync(
    marker,
    JSON.stringify({
      schema: 'data-secure-audit-write-block/1',
      operation_id: crypto.randomUUID(),
      timestamp: '2026-08-21T09:10:00.000Z'
    })
  );
  const result = migrateLegacyAuditReceipts();
  assert.strictEqual(result.write_errors, 1);
  const { genericStatus } = require('../plugins/data-secure/server/gateway/status');
  assert.strictEqual(genericStatus().ok, false);
  fs.unlinkSync(marker);
});

test('unreadable-shaped legacy entries remain visible without exposing names or paths', () => {
  const dir = roots().audit;
  fs.writeFileSync(path.join(dir, 'broken.json'), '{not json');
  fs.mkdirSync(path.join(dir, 'not-a-file.json'));
  const result = migrateLegacyAuditReceipts();
  assert.strictEqual(result.legacy_pending, 2);
  assert.strictEqual(result.migration_errors, 1);
  assert.deepStrictEqual(Object.keys(result).sort(), [
    'legacy_pending',
    'migration_errors',
    'receipts_retained',
    'schema',
    'write_errors'
  ]);
  const status = auditStatus();
  assert.strictEqual(status.legacy_pending, 2);
  assert.ok(!JSON.stringify(status).includes(root), 'status must not reveal a local path');
  assert.ok(!JSON.stringify(status).includes('broken.json'), 'status must not reveal an audit filename');
  const { genericStatus } = require('../plugins/data-secure/server/gateway/status');
  const gatewayStatus = genericStatus();
  assert.strictEqual(gatewayStatus.ok, false);
  assert.strictEqual(gatewayStatus.engine_ready, false);
  assert.strictEqual(gatewayStatus.engine_phase, 'blocked_audit_migration');
});

test('a retained-audit ENOSPC leaves a local marker without retracting a package', () => {
  const receipt = {
    operation_id: crypto.randomUUID(), timestamp: '2026-08-21T09:00:00.000Z',
    gateway_version: '3.2.0-rc34', profile: 'general', source_extension: '.txt', result: 'released',
    text_entity_count: 0, privacy_passes: 1, residual_pii_verification: 'passed',
    visual_assets_total: 0, visual_assets_included: 0, visual_assets_review_required: 0, visual_redactions: 0
  };
  const io = Object.create(fs);
  io.writeFileSync = (candidate, ...args) => {
    if (String(candidate).includes('.audit_')) {
      const error = new Error('disk full');
      error.code = 'ENOSPC';
      throw error;
    }
    return fs.writeFileSync(candidate, ...args);
  };
  assert.strictEqual(retainAudit(receipt, { preparedAuditRun: createPreparedAuditRun(), fs: io, assertWritableCapacity: () => {} }), false);
  const marker = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'audit-write-blocked.json');
  const markerValue = json(marker);
  assert.strictEqual(markerValue.schema, 'data-secure-audit-write-block/1');
  assert.strictEqual(markerValue.operation_id, receipt.operation_id);
  assert.doesNotMatch(JSON.stringify(markerValue), /Mustermann|\.txt|[A-Fa-f0-9]{64}/i);
  fs.unlinkSync(marker);
});

function audit81Fixture(name) {
  const directory = path.join(root, 'audit81-' + name);
  fs.mkdirSync(directory, { mode: 0o700 });
  return { directory, receipt: sanitizeReceipt({
    operation_id: crypto.randomUUID(), timestamp: '2026-10-28T14:00:00.000Z',
    profile: 'general', source_extension: '.txt', result: 'released',
    residual_pii_verification: 'passed'
  }) };
}
function audit81Thrown(action) {
  let threw = false, received;
  try { action(); } catch (error) { threw = true; received = error; }
  assert.strictEqual(threw, true, 'the original failure must remain a throw, including falsy causes');
  return received;
}
function audit81Temp(candidate, directory) {
  assert.strictEqual(path.dirname(candidate), directory);
  assert.match(path.basename(candidate), /^\.audit_[0-9a-f-]{36}\.tmp$/i);
  return candidate;
}
const audit81PrimaryCauses = [
  undefined, null, false, 0, '',
  Object.freeze(Object.assign(new Error('synthetic audit81 I/O failure'), { code: 'EIO' }))
];

test('audit81 capacity refusal never addresses an unowned temporary pathname', () => {
  const causes = [
    ...audit81PrimaryCauses,
    Object.freeze(Object.assign(new Error('capacity unavailable'), { code: 'LOCAL_CAPACITY_UNAVAILABLE' })),
    Object.freeze(Object.assign(new Error('capacity insufficient'), { code: 'LOCAL_CAPACITY_INSUFFICIENT' }))
  ];
  for (const [index, primary] of causes.entries()) {
    const { directory, receipt } = audit81Fixture('preflight-' + index);
    const io = Object.create(fs);
    let writes = 0, renames = 0, unlinks = 0, checks = 0;
    io.writeFileSync = () => { writes++; throw Error('unexpected write before admitted capacity'); };
    io.renameSync = () => { renames++; throw Error('unexpected rename before admitted capacity'); };
    io.unlinkSync = candidate => { unlinks++; return fs.unlinkSync(candidate); };
    const received = audit81Thrown(() => writePackageAudit(receipt, directory, {
      fs: io, assertWritableCapacity: () => { checks++; throw primary; }
    }));
    assert.strictEqual(received, primary);
    assert.strictEqual(checks, 1);
    assert.strictEqual(writes, 0); assert.strictEqual(renames, 0); assert.strictEqual(unlinks, 0);
    assert.deepStrictEqual(fs.readdirSync(directory), []);
  }
});

test('audit81 actual wx EEXIST preserves the separately created foreign leaf', () => {
  const { directory, receipt } = audit81Fixture('actual-eexist');
  const foreign = Buffer.from('FOREIGN-AUDIT81-EXCLUSIVE-LEAF');
  const io = Object.create(fs);
  let temporary, exclusiveError, writes = 0, renames = 0, unlinks = 0;
  io.writeFileSync = (candidate, serialized, options) => {
    writes++; temporary = audit81Temp(candidate, directory);
    assert.strictEqual(options.flag, 'wx'); assert.strictEqual(options.mode, 0o600);
    // Create the competing object using the real filesystem, then obtain the
    // real exclusive-open refusal. No UUID monkeypatch or fake EEXIST success.
    fs.writeFileSync(temporary, foreign, { flag: 'wx', mode: 0o600 });
    try { fs.writeFileSync(candidate, serialized, options); }
    catch (error) { exclusiveError = error; throw error; }
    throw Error('the actual second exclusive create unexpectedly succeeded');
  };
  io.renameSync = () => { renames++; throw Error('EEXIST cannot authorize rename'); };
  io.unlinkSync = candidate => { unlinks++; return fs.unlinkSync(candidate); };
  const received = audit81Thrown(() => writePackageAudit(receipt, directory, {
    fs: io, assertWritableCapacity: () => {}
  }));
  assert.strictEqual(received, exclusiveError); assert.strictEqual(received.code, 'EEXIST');
  assert.strictEqual(writes, 1); assert.strictEqual(renames, 0); assert.strictEqual(unlinks, 0);
  assert.deepStrictEqual(fs.readFileSync(temporary), foreign);
  assert.strictEqual(fs.existsSync(path.join(directory, 'audit.json')), false);
  assert.deepStrictEqual(fs.readdirSync(directory), [path.basename(temporary)]);
});

test('audit81 partial own writes preserve their bytes and the exact primary even when falsy', () => {
  for (const [index, primary] of audit81PrimaryCauses.entries()) {
    const { directory, receipt } = audit81Fixture('partial-' + index);
    const target = path.join(directory, 'audit.json'), previous = Buffer.from('OLD-AUDIT81-RECEIPT');
    fs.writeFileSync(target, previous, { flag: 'wx', mode: 0o600 });
    const io = Object.create(fs);
    let temporary, partial, writes = 0, renames = 0, unlinks = 0;
    io.writeFileSync = (candidate, serialized, options) => {
      writes++; temporary = audit81Temp(candidate, directory);
      partial = Buffer.from(serialized, 'utf8').subarray(0, 23);
      fs.writeFileSync(candidate, partial, options); // Real exclusive creation and real partial bytes.
      throw primary;
    };
    io.renameSync = () => { renames++; throw Error('a failed write must not publish'); };
    io.unlinkSync = candidate => { unlinks++; return fs.unlinkSync(candidate); };
    const received = audit81Thrown(() => writePackageAudit(receipt, directory, {
      fs: io, assertWritableCapacity: () => {}
    }));
    assert.strictEqual(received, primary);
    assert.strictEqual(writes, 1); assert.strictEqual(renames, 0); assert.strictEqual(unlinks, 0);
    assert.deepStrictEqual(fs.readFileSync(temporary), partial);
    assert.deepStrictEqual(fs.readFileSync(target), previous);
    assert.strictEqual(fs.readdirSync(directory).length, 2);
  }
});

test('audit81 a post-write name replacement never becomes cleanup authority over foreign bytes', () => {
  const { directory, receipt } = audit81Fixture('replacement');
  const target = path.join(directory, 'audit.json'), previous = Buffer.from('OLD-AUDIT81-RECEIPT');
  const preserved = path.join(directory, 'preserved-own-audit.json');
  const foreign = Buffer.from('FOREIGN-AUDIT81-REPLACEMENT');
  fs.writeFileSync(target, previous, { flag: 'wx', mode: 0o600 });
  const primary = Object.freeze(Object.assign(new Error('synthetic publication refusal'), { code: 'EIO' }));
  const io = Object.create(fs);
  let temporary, ownBytes, writes = 0, renames = 0, unlinks = 0;
  io.writeFileSync = (candidate, serialized, options) => {
    writes++; temporary = audit81Temp(candidate, directory); ownBytes = Buffer.from(serialized, 'utf8');
    return fs.writeFileSync(candidate, serialized, options);
  };
  io.renameSync = (from, to) => {
    renames++; assert.strictEqual(from, temporary); assert.strictEqual(to, target);
    fs.renameSync(from, preserved);
    fs.writeFileSync(from, foreign, { flag: 'wx', mode: 0o600 });
    throw primary; // Modeled rename refusal after a real, separately witnessed object replacement.
  };
  io.unlinkSync = candidate => { unlinks++; return fs.unlinkSync(candidate); };
  const received = audit81Thrown(() => writePackageAudit(receipt, directory, {
    fs: io, assertWritableCapacity: () => {}
  }));
  assert.strictEqual(received, primary);
  assert.strictEqual(writes, 1); assert.strictEqual(renames, 1); assert.strictEqual(unlinks, 0);
  assert.deepStrictEqual(fs.readFileSync(temporary), foreign);
  assert.deepStrictEqual(fs.readFileSync(preserved), ownBytes);
  assert.deepStrictEqual(JSON.parse(ownBytes), receipt);
  assert.deepStrictEqual(fs.readFileSync(target), previous);
  assert.strictEqual(fs.readdirSync(directory).length, 3);
});

test('audit81 successful real rename leaves exactly the canonical audit without rollback deletion', () => {
  const { directory, receipt } = audit81Fixture('successful-rename');
  const io = Object.create(fs);
  let temporary, writes = 0, renames = 0, unlinks = 0;
  io.writeFileSync = (candidate, serialized, options) => {
    writes++; temporary = audit81Temp(candidate, directory);
    return fs.writeFileSync(candidate, serialized, options);
  };
  io.renameSync = (from, to) => {
    renames++; assert.strictEqual(from, temporary); assert.strictEqual(to, path.join(directory, 'audit.json'));
    return fs.renameSync(from, to);
  };
  io.unlinkSync = candidate => { unlinks++; return fs.unlinkSync(candidate); };
  const returned = writePackageAudit(receipt, directory, { fs: io, assertWritableCapacity: () => {} });
  assert.deepStrictEqual(returned, receipt);
  assert.deepStrictEqual(json(path.join(directory, 'audit.json')), receipt);
  assert.strictEqual(writes, 1); assert.strictEqual(renames, 1); assert.strictEqual(unlinks, 0);
  assert.strictEqual(fs.existsSync(temporary), false, 'the real rename, not cleanup, consumed the source name');
  assert.deepStrictEqual(fs.readdirSync(directory), ['audit.json']);
});

test('audit81 a modeled lost rename reply preserves the actually committed receipt', () => {
  const { directory, receipt } = audit81Fixture('lost-rename-reply');
  const io = Object.create(fs);
  const primary = Object.freeze(Object.assign(new Error('synthetic lost reply'), { code: 'EIO' }));
  let temporary, writes = 0, renames = 0, unlinks = 0;
  io.writeFileSync = (candidate, serialized, options) => {
    writes++; temporary = audit81Temp(candidate, directory);
    return fs.writeFileSync(candidate, serialized, options);
  };
  io.renameSync = (from, to) => {
    renames++; assert.strictEqual(from, temporary); assert.strictEqual(to, path.join(directory, 'audit.json'));
    fs.renameSync(from, to); // Actual namespace commit before the injected reply error.
    throw primary;
  };
  io.unlinkSync = candidate => { unlinks++; return fs.unlinkSync(candidate); };
  const received = audit81Thrown(() => writePackageAudit(receipt, directory, {
    fs: io, assertWritableCapacity: () => {}
  }));
  assert.strictEqual(received, primary);
  assert.strictEqual(writes, 1); assert.strictEqual(renames, 1); assert.strictEqual(unlinks, 0);
  assert.strictEqual(fs.existsSync(temporary), false);
  assert.deepStrictEqual(json(path.join(directory, 'audit.json')), receipt);
  assert.deepStrictEqual(fs.readdirSync(directory), ['audit.json']);
});

test('audit81 partial ENOSPC still normalizes capacity without deleting either retained object', () => {
  const { directory, receipt } = audit81Fixture('partial-enospc');
  const target = path.join(directory, 'audit.json'), previous = Buffer.from('OLD-AUDIT81-RECEIPT');
  fs.writeFileSync(target, previous, { flag: 'wx', mode: 0o600 });
  const primary = Object.freeze(Object.assign(new Error('synthetic disk full'), { code: 'ENOSPC' }));
  const io = Object.create(fs);
  let temporary, partial, writes = 0, renames = 0, unlinks = 0;
  io.writeFileSync = (candidate, serialized, options) => {
    writes++; temporary = audit81Temp(candidate, directory); partial = Buffer.from(serialized, 'utf8').subarray(0, 19);
    fs.writeFileSync(candidate, partial, options); // The fault is injected after an actual small exclusive write.
    throw primary;
  };
  io.renameSync = () => { renames++; throw Error('partial ENOSPC cannot publish'); };
  io.unlinkSync = candidate => { unlinks++; return fs.unlinkSync(candidate); };
  const received = audit81Thrown(() => writePackageAudit(receipt, directory, {
    fs: io, assertWritableCapacity: () => {}
  }));
  assert.notStrictEqual(received, primary); assert.strictEqual(received.code, 'LOCAL_CAPACITY_RACE');
  assert.strictEqual(primary.code, 'ENOSPC');
  assert.strictEqual(writes, 1); assert.strictEqual(renames, 0); assert.strictEqual(unlinks, 0);
  assert.deepStrictEqual(fs.readFileSync(temporary), partial);
  assert.deepStrictEqual(fs.readFileSync(target), previous);
  assert.strictEqual(fs.readdirSync(directory).length, 2);
});

try {
  fs.rmSync(root, { recursive: true, force: true });
} catch {
  /* best effort */
}
done();
