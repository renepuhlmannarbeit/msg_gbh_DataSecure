'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-audit-'));
process.env.EU_PRIVACY_ROOT = path.join(root, 'privacy');
process.env.LOCALAPPDATA = path.join(root, 'localapp');

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
    privacy_ruleset: 'de-business/2',
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
  assert.strictEqual(receipt.privacy_ruleset, 'de-business/2');
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
  const marker = path.join(process.env.LOCALAPPDATA, 'SecureDataMsg', 'audit-write-blocked.json');
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
  const marker = path.join(process.env.LOCALAPPDATA, 'SecureDataMsg', 'audit-write-blocked.json');
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
  const marker = path.join(process.env.LOCALAPPDATA, 'SecureDataMsg', 'audit-write-blocked.json');
  const markerValue = json(marker);
  assert.strictEqual(markerValue.schema, 'data-secure-audit-write-block/1');
  assert.strictEqual(markerValue.operation_id, receipt.operation_id);
  assert.doesNotMatch(JSON.stringify(markerValue), /Mustermann|\.txt|[A-Fa-f0-9]{64}/i);
  fs.unlinkSync(marker);
});

try {
  fs.rmSync(root, { recursive: true, force: true });
} catch {
  /* best effort */
}
done();
