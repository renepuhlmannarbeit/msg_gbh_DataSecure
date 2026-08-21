'use strict';

const fs = require('fs');
const path = require('path');
const { runtimeReady, readStatus } = require('../runtime');
const { VERSION, listInput, listPackageDirs } = require('./common');
const { listReviewItems } = require('./review');
const { retentionStatus } = require('./retention');
const { auditStatus } = require('./audit');

function genericStatus(options = {}) {
  const engine = readStatus();
  const retention = retentionStatus(options);
  const audit = auditStatus();
  const auditBlocked =
    audit.legacy_pending > 0 || audit.migration_errors > 0 || audit.write_errors > 0;
  return {
    ok: !auditBlocked,
    version: VERSION,
    engine_ready: runtimeReady() && !auditBlocked,
    engine_phase: auditBlocked ? 'blocked_audit_migration' : engine.phase,
    engine_message: auditBlocked
      ? 'Alte Audit-Nachweise müssen lokal durch die IT bereinigt oder migriert werden.'
      : engine.message,
    text_engine: engine.text_engine,
    visual_bridge: engine.visual_bridge,
    visual_bridge_reason: engine.visual_bridge_reason,
    input_documents: listInput().length,
    anonymized_packages: listPackageDirs().filter((p) =>
      fs.existsSync(path.join(p.full, 'manifest.json'))
    ).length,
    visual_review_items: listReviewItems().items.length,
    retention_days: retention.retention_days,
    retention_due_entries: retention.due_entries,
    retention_last_cleanup: retention.last_cleanup,
    audit_schema: audit.schema,
    audit_receipts_retained: audit.receipts_retained,
    legacy_audit_pending: audit.legacy_pending,
    audit_migration_errors: audit.migration_errors,
    audit_write_errors: audit.write_errors,
    folders_ready: true,
    supported_inputs: [
      'PDF',
      'Word (.docx)',
      'Excel (.xlsx)',
      'PowerPoint (.pptx)',
      'TXT',
      'Markdown',
      'CSV',
      'PNG',
      'JPEG',
      'BMP'
    ],
    runtime_dependency_install: false,
    workflow:
      'Input -> bundled local parser -> bundled PII engine -> residual gate -> ' +
      'visual raster/OCR/redaction or local review -> Output package',
    raw_content_sent_to_claude: false
  };
}

module.exports = { genericStatus };
