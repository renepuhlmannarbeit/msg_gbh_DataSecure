'use strict';

// Canonical product regression entry point. Retired keyring/encryption tests and
// unreleased PDF/OCR/SEA experiments have explicit scripts in package.json and
// can no longer enter a product gate by accidental string concatenation.

const { spawnSync } = require('child_process');

const baseFiles = [
  'tests/test-package-staging.js', 'tests/test-safe-private-tree.js',
  'tests/test-package-staging-integration.js', 'tests/test-batch-executor-startup.js',
  'tests/test-completion-summary.js', 'tests/test-workflow-diagnostics.js',
  'tests/test-private-work-store.js', 'tests/test-batch-private-artifact-migration.js',
  'tests/test-review-private-artifact-migration.js', 'tests/test-retention.js',
  'tests/test-source-format-inspector.js', 'tests/test-source-opc-preflight.js',
  'tests/test-batch-source-admission.js', 'tests/test-document-result-grade.js',
  'tests/test-batch-result-projection.js', 'scripts/verify-native.mjs',
  'tests/test-bundled-runtime.mjs',
  'tests/make-fixtures.js', 'scripts/verify-canonical-docs.mjs',
  'tests/test-current-documentation-contract.js', 'tests/test-current-document-links.js',
  'tests/test-current-uat-kit-contract.js', 'tests/test-uat-fixture-generation.js'
];

const ciFiles = [
  'test-read-only-source-snapshot.js', 'test-source-folder.js', 'test-workflow-budget.js',
  'test-workflow-diagnostics.js', 'test-manifest.js', 'test-capability-contract.js',
  'test-cowork-tool-surface-contract.js', 'test-mcp-tool-annotations.js',
  'test-cowork-documentation-contract.js', 'test-resource-limits.js',
  'test-package-read-capabilities.js', 'test-package-snapshot-async.js', 'test-batch-snapshot.js',
  'test-batch-post-publish-recovery.js', 'test-batch-processing-lock.js',
  'test-batch-maintenance.js', 'test-parallel-preparation-harness.js',
  'test-test-path-separation.js',
  'test-plugin-structure.js', 'test-host-matrix.js', 'test-runtime-start-matrix.js',
  'test-parsers.js', 'test-network-boundary.js', 'test-ui-process-policy.js',
  'test-local-password.js', 'test-pii-regression.js', 'test-format-acceptance-matrix.js',
  'test-batch-review-policy.js', 'test-mapping.js', 'test-mapping-outbox.js',
  'test-normal-path-response.js', 'test-direct-picker-batch.js',
  'test-direct-picker-intake-worker.js', 'test-local-only-handoff.js',
  'test-local-handoff-resume.js', 'test-mixed-batch-recovery.js',
  'test-archive-modes.mjs', 'test-batch-performance-contract.js',
  'test-gateway-e2e.js', 'test-mcp-protocol.js', 'test-adversarial.js',
  // DS-022/DS-069 core gates: single active batch, cross-process intake
  // reservation, executor lease, recovery and the visible result export.
  'test-batch-intake-reservation.js', 'test-batch-executor-lease.js',
  'test-batch-active-lock.js', 'test-batch-recovery.js', 'test-result-folder-export.js'
];

const fullOnly = [
  'test-skill-eval-corpus.js', 'test-text-source.js', 'test-csv-source.js',
  'test-csv-differential.js', 'test-parser-isolation.js', 'test-content-graph.js',
  'test-pii-regression.js', 'test-contract-skill-acceptance.js',
  'test-contract-skill-matrix.js', 'test-contract-corpus.js', 'test-corpus-contract.js',
  'test-detector-benchmark.js', 'test-credential-catalog.js', 'test-retention.js',
  'test-batch-retention-protection.js', 'test-batch-item-processor.js',
  'test-batch-next-maintenance.js', 'test-batch-processing-orchestrator.js',
  'test-batch-evidence.js', 'test-batch-terminal-evidence.js', 'test-audit-privacy.js',
  'test-diagnostics.js', 'test-companion-job-store.js', 'test-companion-retention.js',
  'test-companion-ipc.js', 'test-companion-processor.js', 'test-batch-review-model.js',
  'test-companion-supervisor.js', 'test-completion-summary.js', 'test-batch-user-status.js',
  'test-batch-results.js', 'test-batch-pseudonym-registry.js', 'test-batch-pseudonym-state.js', 'test-mapping.js',
  'test-mapping-outbox.js', 'test-batch-lease-store.js', 'test-storage-reservation-store.js',
  'test-batch-session.js', 'exploratory-review-20.js', 'exploratory-anonymization-2000.js',
  'test-sarif-check.mjs', 'test-docx-structure.js', 'test-docx-differential.js',
  'test-native-launcher.js',
  // Batch intake, continuation, review, journal, reconciliation, delivery and
  // mapping gates previously reachable only through `pretest:fast-path`.
  'test-batch-intake.js', 'test-batch-discard.js', 'test-batch-continuation.js',
  'test-batch-snapshot-invalidation.js', 'test-batch-executor-runner.js',
  'test-batch-review-capture.js', 'test-batch-review-state.js',
  'test-batch-review-publication.js', 'test-batch-review-orchestrator.js',
  'test-batch-journal-store.js', 'test-batch-reconciliation.js', 'test-batch-delivery.js',
  'test-batch-mapping-maintenance.js', 'test-local-review-executor.js',
  'test-native-picker-lifecycle.js', 'test-legacy-input-migration.js', 'test-rc80-semantics.js',
  // Product tests that were referenced by no npm script at all.
  'test-batch-pseudonym-context.js', 'test-storage-capacity.js', 'test-image-sanitizer.js',
  'test-zip-permissions.mjs', 'test-parser-worker-boundary.js', 'test-background-role-launcher.js',
  'test-companion-startup-boundary.js'
];

function run(file) {
  const result = spawnSync(process.execPath, [file], { cwd: process.cwd(), stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const profile = process.argv[2] || 'ci';
if (!['ci', 'full'].includes(profile)) {
  console.error('Usage: node tests/run-product-suite.js <ci|full>');
  process.exit(64);
}
for (const file of baseFiles) run(file);
const files = [...ciFiles, ...(profile === 'full' ? fullOnly : [])];
for (const file of [...new Set(files)]) run(`tests/${file}`);
console.log(`Product ${profile} suite passed (${new Set(files).size} direct test files).`);
