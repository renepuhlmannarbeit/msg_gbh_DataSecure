'use strict';

const fs = require('fs');
const path = require('path');
const { readStatus } = require('../runtime');
const { VERSION, listInput, listPackageDirs, storageStatus } = require('./common');
const { listReviewItems } = require('./review');
const { retentionStatus } = require('./retention');
const { auditStatus } = require('./audit');
const { companionCapabilities } = require('../companion/job-store');
const { companionRetentionStatus } = require('../companion/retention');
const { recoverableBatchStatus, localCleanupStatus, openBatchPackageProtection } = require('./batch');
const { localIntakeActive } = require('./batch-executor');
const { PRIVACY_RULESET_VERSION, CREDENTIAL_CONTEXT_POLICY_VERSION } = require('../privacy/policy');
const { runtimeInfo } = require('../runtime-info');

function genericStatus(options = {}) {
  const engine = readStatus();
  const outputProtection = openBatchPackageProtection();
  const retention = retentionStatus({
    ...options,
    protectedIds: outputProtection.ids,
    outputProtectionComplete: outputProtection.complete
  });
  const audit = auditStatus();
  const companion = companionCapabilities();
  const companionRetention = companionRetentionStatus(options);
  const storage = storageStatus();
  const batches = recoverableBatchStatus();
  const localCleanup = localCleanupStatus();
  const auditBlocked =
    audit.legacy_pending > 0 || audit.migration_errors > 0 || audit.write_errors > 0;
  const engineReady = engine.text_engine === 'ready' && !auditBlocked && storage.safe;
  return {
    ok: engineReady,
    version: VERSION,
    privacy_ruleset: PRIVACY_RULESET_VERSION,
    credential_context_policy: CREDENTIAL_CONTEXT_POLICY_VERSION,
    engine_ready: engineReady,
    engine_phase: auditBlocked ? 'blocked_audit_migration' : !storage.safe ? 'blocked_unsafe_storage' : engine.phase,
    engine_message: auditBlocked
      ? 'Alte Audit-Nachweise müssen lokal durch die IT bereinigt oder migriert werden.'
      : !storage.safe
        ? 'Der konfigurierte Datenschutzordner liegt in einem bekannten Cloud-Sync- oder Netzwerkpfad. Verarbeitung bleibt gesperrt.'
      : engine.message,
    text_engine: engine.text_engine,
    parser_boundary: engine.parser_boundary,
    parser_boundary_reason: engine.parser_boundary_reason,
    parser_resource_boundary: engine.parser_resource_boundary,
    parser_hard_process_limits: engine.parser_hard_process_limits,
    visual_bridge: engine.visual_bridge,
    visual_bridge_reason: engine.visual_bridge_reason,
    visual_boundary: engine.visual_boundary,
    input_documents: listInput().length,
    local_intake_pending: localIntakeActive(),
    ...batches,
    ...localCleanup,
    anonymized_packages: listPackageDirs().filter((p) =>
      fs.existsSync(path.join(p.full, 'manifest.json'))
    ).length,
    visual_review_items: listReviewItems().items.length,
    retention_days: retention.retention_days,
    retention_due_entries: retention.due_entries,
    retention_output_protection_complete: retention.output_protection_complete,
    retention_processed_cleanup_skipped: retention.processed_cleanup_skipped,
    retention_processed_protection_complete: retention.processed_protection_complete,
    retention_protected_processed_entries: retention.protected_processed_entries,
    retention_last_cleanup: retention.last_cleanup,
    audit_schema: audit.schema,
    audit_receipts_retained: audit.receipts_retained,
    legacy_audit_pending: audit.legacy_pending,
    audit_migration_errors: audit.migration_errors,
    audit_write_errors: audit.write_errors,
    companion_api_version: companion.api_version,
    companion_phase: companion.phase,
    companion_local_ui: companion.local_ui,
    companion_supported_vertical_slice_inputs: companion.supported_vertical_slice_inputs,
    companion_private_ipc: companion.private_ipc,
    companion_binary_signing: companion.binary_signing,
    companion_job_retention: companion.job_retention,
    companion_job_retention_days: companionRetention.retention_days,
    companion_jobs_due: companionRetention.due_jobs,
    companion_job_inspection_errors: companionRetention.inspection_errors,
    companion_job_last_cleanup: companionRetention.last_cleanup,
    companion_model_can_review: companion.model_can_review,
    companion_model_can_release: companion.model_can_release,
    folders_ready: true,
    storage_safe: storage.safe,
    storage_mode: storage.mode,
    supported_inputs: [
      'Word (.docx)',
      'Markdown (.md)',
      'CSV',
      'TXT'
    ],
    blocked_inputs: [
      { format: 'PDF', reason: 'PDF_COVERAGE_UNVERIFIED' },
      { format: 'XLSX, PPTX und Bilder', reason: 'FORMAT_COVERAGE_UNVERIFIED' }
    ],
    ...runtimeInfo(),
    workflow:
      'Input -> isolated local parser process -> bundled PII engine -> residual gate -> ' +
      'visual raster/OCR/redaction or local review -> Output package',
    raw_content_sent_to_claude: false
  };
}

module.exports = { genericStatus };
