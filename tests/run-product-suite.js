'use strict';

// Canonical product regression entry point. Retired keyring/encryption tests and
// unreleased PDF/OCR/SEA experiments have explicit scripts in package.json and
// can no longer enter a product gate by accidental string concatenation.
//
// Headless source gates and native desktop interaction have separate evidence.
// `full` on Windows requires --allow-native-ui before running ANY test; `headless`
// covers all non-GUI files and explicitly reports the six native forms NOT_RUN.
// The lists are disjoint by contract. A file listed twice
// would run twice and cost minutes without adding evidence; the runner and
// tests/test-test-path-separation.js both reject such an overlap.

const { spawnSync } = require('child_process');
const fs = require('node:fs');
const os = require('node:os');

const baseFiles = [
  'tests/test-test-harness.js',
  'tests/test-macos-static-core-workflow.mjs',
  'tests/test-import-macos-core-candidate.mjs',
  'tests/test-macos-system-make.mjs',
  'tests/test-legacy-macos-parser-routing.js',
  'tests/test-native-ui-boundary.js',
  'tests/test-bound-file-io.js',
  'tests/test-hocr-choice-groups.mjs',
  'tests/test-core-contracts.mjs',
  'tests/test-quality-benchmark.js', 'tests/test-quality-report.mjs',
  'tests/test-standalone-quality-regression.js',
  'tests/test-ocr-refinement.js',
  'tests/test-ocr-contact-review.js', 'tests/test-ocr-contact-flow.js',
  'tests/test-ocr-contact-images.js',
  'tests/test-cargo-license-inventory.mjs',
  'tests/test-standalone-font-license.mjs',
  'tests/test-mcp-input-validation.mjs',
  'tests/test-root-boundary.js', 'tests/test-claude-code-pilot.mjs',
  'tests/test-mcp-support-review.js',
  'tests/test-standalone-continuation.js',
  'tests/test-product-bootstrap.js', 'tests/test-standalone.js',
  'tests/test-standalone-frontend.js',
  'tests/test-standalone-workspace.js',
  'tests/test-workflow-presentation.js', 'tests/test-markdown-start-transport.js', 'tests/test-office-image-ocr.mjs', 'tests/test-office-image-relevance.js',
  'tests/test-partial-conversion.js', 'tests/test-conversion-checkpoints.js',
  'tests/test-office-diagrams.js', 'tests/test-office-occurrences.js',
  'tests/test-office-chart-model.js', 'tests/test-office-chartex-model.js', 'tests/test-office-math.js', 'tests/test-office-math-projection.js', 'tests/test-office-math-integration.js',
  'tests/test-office-projection-countercases.js', 'tests/test-docx-table-grid.js',
  'tests/test-office-table-context.js',
  'tests/test-office-table-projection.js', 'tests/test-sensitive-field-coverage.js',
  'tests/test-xlsx-table-ranges.js', 'tests/test-drawing-table-grid.js',
  'tests/test-xlsx-content-projection.js', 'tests/test-cfb-protection.js',
  'tests/test-xlsx-counterregressions.js',
  'tests/test-pdf-native-ocr-layout.js',
  'tests/test-standalone-document-review.js', 'tests/test-standalone-document-review-frontend.js',
  'tests/test-standalone-document-review-context.js',
  'tests/test-standalone-review-policy.js', 'tests/test-standalone-automatic-privacy.js',
  'tests/test-private-transform-trace.js', 'tests/test-standalone-entities.js', 'tests/test-standalone-run-entities.js',
  'tests/test-standalone-confidential-overview.js',
  'tests/test-standalone-review-preview.mjs',
  'tests/test-standalone-review-frontend.js', 'tests/test-standalone-review-broker.js',
  'tests/test-standalone-review-choices.js',
  'tests/test-standalone-review-ipc.js',
  'tests/test-standalone-history-probe.js',
  'tests/test-standalone-history.js',
  'tests/test-standalone-history-targeted.js',
  'tests/test-standalone-target-export-race.js',
  'tests/test-standalone-target-export-snapshot.js',
  'tests/lib/standalone-history-read-observer-cases.cjs',
  'tests/test-standalone-history-visibility.js',
    'tests/test-standalone-history-window.js',
  'tests/test-standalone-history-read-race.js',
  'tests/test-standalone-history-migration-race.js',
  'tests/test-standalone-startup-history-capture.js',
  'tests/test-standalone-status-throughput.js',
  'tests/test-standalone-startup-io.js',
  'tests/test-standalone-identity-ledger.js',
  'tests/test-standalone-sidecar.js',
  'tests/test-standalone-batch-diagnostics.js', 'tests/test-batch-epoch-release-busy.js',
  'tests/test-batch-executor-lease-finish.js', 'tests/test-batch-executor-claim-capability.js',
  'tests/test-batch-processing-admission.js',
  'tests/test-batch-processing-composition.js',
  'tests/test-result-export-diagnostics.js',
  'tests/test-mapping-diagnostics.js',
  'tests/test-worker-result-export-async.js',
  'tests/test-standalone-pause-control.js',
  'tests/test-native-export-channel.js',
  'tests/test-initial-output-provisioning.js',
  'tests/test-result-generations.js',
  'tests/test-result-companions.js',
  'tests/test-confidential-workbook.js',
  'tests/test-result-initial-exact-binding.js',
  'tests/test-result-folder-config-migration.js',
  'tests/test-standalone-terminal-failures.js',
  'tests/test-standalone-document-control.js',
  'tests/test-standalone-desktop-contract.js', 'tests/test-markitdown-contract.js',
  'tests/test-standalone-desktop-acceptance.mjs',
  'tests/test-native-smoke-integrity.js',
  'tests/test-standalone-package.js',
  'tests/test-standalone-package-integrity.mjs',
  'tests/test-standalone-build-fingerprint.mjs',
  'tests/test-windows-native-contract.mjs',
  'tests/test-ownership-guard-build-contract.mjs',
  'tests/test-ownership-control.js',
  'tests/test-ownership-guard-artifact.mjs',
  'tests/test-ownership-load-lifecycle.mjs',
  'tests/test-ownership-guard-loader.js',
  'tests/test-ownership-diagnostics.js',
  'tests/test-ownership-record-transitions.js',
  'tests/test-macos-bundle-layout.mjs',
  'tests/test-macos-core-artifact-provenance.mjs',
  'tests/test-macos-static-core-producer.mjs',
  'tests/test-native-macos-static-core-contract.mjs',
  'tests/test-processing-mode.js', 'tests/test-content-options-persistence.js', 'tests/test-content-start-readiness.js', 'tests/test-content-anonymization-operation.js', 'tests/test-conversion-content-contract.js', 'tests/test-content-consumer-binding.js', 'tests/test-content-privacy-extraction.js', 'tests/test-markdown-artifact.js', 'tests/test-markdown-extractor.js',
  'tests/test-standalone-pdf-text-layout.js',
  'tests/test-source-extraction-contract.js', 'tests/test-wide-privacy-extraction.js',
  'tests/test-standalone-anonymized-artifact.js',
  'tests/test-wide-privacy-orchestrator.js',
  'tests/test-privacy-text-operation.js',
  'tests/test-wide-mixed-batch-recovery.js',
  'tests/test-prepublication-error-policy.js',
  'tests/test-batch-processing-purpose.js', 'tests/test-markdown-batch-export.js',
  'tests/test-markdown-retention.js',
  'tests/test-markdown-lifecycle-review.js',
  // Native PDF/OCR resources are a target-build prerequisite, not a dependency
  // of the cost-capped source/CI suite. PKG-04 requires the separate real
  // test:standalone:conversion gate before it can bind either binary.
  'tests/test-support-trace.js', 'tests/test-converter-support-trace.js',
  'tests/test-debug-skill-contract.js',
  'tests/test-package-staging.js', 'tests/test-safe-private-tree.js', 'tests/test-private-root-session.js',
  'tests/test-package-staging-integration.js', 'tests/test-batch-executor-startup.js',
  'tests/test-batch-executor-boundaries.js',
  'tests/test-standalone-intake-failure.js',
  'tests/test-batch-queue-envelope.js', 'tests/test-batch-worker-queue-rejection.js',
  'tests/test-completion-summary.js', 'tests/test-completion-summary-confirmed.js',
  'tests/test-worker-terminal-presentation.js', 'tests/test-workflow-diagnostics.js', 'tests/test-workflow-diagnostics-concurrency.js', 'tests/test-transient-rename-retry.js', 'tests/test-diagnostic-causes.js', 'tests/test-startup-guard.js',
  'tests/test-private-work-store.js', 'tests/test-batch-private-artifact-migration.js',
  'tests/test-review-private-artifact-migration.js', 'tests/test-retention.js',
  'tests/test-source-format-inspector.js', 'tests/test-source-opc-preflight.js',
  'tests/test-batch-source-admission.js', 'tests/test-document-result-grade.js',
  'tests/test-batch-result-projection.js', 'scripts/verify-native.mjs',
  'tests/test-bundled-runtime.mjs',
  'tests/test-runtime-release-path.mjs',
  'tests/test-release-version.mjs',
  'tests/test-marketplace-projection.mjs',
  'tests/test-stable-data-root.js',
  'tests/make-fixtures.js', 'scripts/verify-canonical-docs.mjs',
  'tests/test-current-documentation-contract.js', 'tests/test-current-document-links.js',
  'tests/test-current-uat-kit-contract.js', 'tests/test-uat-fixture-generation.js',
  'tests/test-complex-docx-uat-corpus.mjs'
];

const ciFiles = [
  'test-read-only-source-snapshot.js', 'test-source-folder.js', 'test-workflow-budget.js',
  'test-manifest.js', 'test-capability-contract.js',
  'test-cowork-tool-surface-contract.js', 'test-cowork-interaction-contract.js',
  'test-cowork-boundary-mutations.js', 'test-mcp-tool-annotations.js',
  'test-cowork-documentation-contract.js', 'test-resource-limits.js',
  'test-skill-eval-corpus.js', 'test-cowork-uat-evidence.mjs',
  'test-package-read-capabilities.js', 'test-package-snapshot-async.js', 'test-batch-snapshot.js',
  'test-batch-post-publish-recovery.js', 'test-batch-processing-lock.js',
  'test-batch-maintenance.js', 'test-parallel-preparation-harness.js',
  'test-test-path-separation.js',
  'test-plugin-structure.js', 'test-host-matrix.js', 'test-runtime-start-matrix.js',
  'test-parsers.js', 'test-network-boundary.js', 'test-ui-process-policy.js',
  'test-pii-regression.js', 'test-residual-person-review.js', 'test-iban-boundary.js', 'test-format-acceptance-matrix.js',
  'test-batch-review-policy.js', 'test-batch-review-model.js', 'test-batch-review-publication.js',
  'test-batch-session.js', 'test-batch-pseudonym-registry.js', 'test-batch-pseudonym-state.js',
  'test-diagnostics.js', 'test-mapping.js', 'test-mapping-outbox.js',
  'test-normal-path-response.js', 'test-direct-picker-batch.js',
  'test-direct-picker-intake-worker.js', 'test-local-only-handoff.js',
  'test-automatic-local-review.js', 'test-automatic-review-worker-flow.js',
  'test-local-handoff-resume.js', 'test-local-handoff-reuse.js', 'test-mixed-batch-recovery.js',
  'test-archive-modes.mjs', 'test-batch-performance-contract.js',
  'test-gateway-e2e.js', 'test-mcp-protocol.js', 'test-adversarial.js',
  // DS-022/DS-069 core gates: single active batch, cross-process intake
  // reservation, executor lease, recovery and the visible result export.
  'test-batch-intake-reservation.js', 'test-process-identity.js', 'test-batch-executor-lease.js',
  'test-batch-active-lock.js', 'test-batch-recovery.js', 'test-result-folder-export.js',
  'test-result-export-startup-replay.js', 'test-native-export-test-lifecycle.js'
];

const fullOnly = [
  'test-standalone-fast-review-ipc.js',
  'test-markdown-image-content.mjs',
  'test-standalone-native-export.js',
  'test-standalone-native-export-recovery.js',
  // Copied product projections and separate real processes belong to the
  // full local gate, not the cost-capped source CI profile.
  'test-core-policy-binding.mjs',
  'test-standalone-pause.js',
  'test-product-isolation-offline.mjs',
  'test-text-source.js', 'test-csv-source.js',
  'test-csv-differential.js', 'test-parser-isolation.js', 'test-content-graph.js',
  'test-contract-skill-acceptance.js',
  'test-contract-skill-matrix.js', 'test-contract-corpus.js', 'test-corpus-contract.js',
  'test-detector-benchmark.js', 'test-credential-catalog.js',
  'test-batch-retention-protection.js', 'test-batch-item-processor.js',
  'test-batch-next-maintenance.js', 'test-batch-processing-orchestrator.js',
  'test-batch-evidence.js', 'test-batch-terminal-evidence.js', 'test-audit-privacy.js',
  'test-companion-job-store.js', 'test-companion-retention.js',
  'test-companion-ipc.js', 'test-companion-processor.js',
  'test-companion-supervisor.js', 'test-batch-user-status.js',
  'test-batch-results.js',
  'test-batch-lease-store.js', 'test-storage-reservation-store.js',
  'exploratory-review-20.js', 'exploratory-anonymization-2000.js',
  'test-sarif-check.mjs', 'test-docx-structure.js', 'test-docx-differential.js',
  'test-native-launcher.js',
  // Batch intake, continuation, review, journal, reconciliation, delivery and
  // mapping gates previously reachable only through `pretest:fast-path`.
  'test-batch-intake.js', 'test-batch-discard.js', 'test-batch-continuation.js',
  'test-batch-snapshot-invalidation.js', 'test-batch-executor-runner.js',
  'test-batch-review-capture.js', 'test-batch-review-state.js',
  'test-batch-review-orchestrator.js',
  'test-batch-journal-store.js', 'test-batch-reconciliation.js', 'test-batch-delivery.js', 'test-batch-local-delivery-diagnostics.js',
  'test-batch-mapping-maintenance.js', 'test-local-review-executor.js',
  'test-native-picker-lifecycle.js', 'test-legacy-input-migration.js', 'test-rc80-semantics.js',
  // Product tests that were referenced by no npm script at all.
  'test-storage-capacity.js', 'test-image-sanitizer.js',
  'test-zip-permissions.mjs', 'test-parser-worker-boundary.js', 'test-background-role-launcher.js',
  'test-durable-runtime-cache.js',
  'test-companion-startup-boundary.js'
];

const nativeUiFiles = ['test-native-windows-forms.js'];
const nativeUiCaseCount = 6;

// Resource-bound probes are explicit canonical entry points, never silently
// inserted into source CI. They validate the supplied artifact and runtime
// digests themselves and do not open desktop forms.
const artifactBoundFiles = Object.freeze({
  'native-lease-finish': 'tests/test-native-executor-lease-finish.js',
  'native-processing-admission': 'tests/test-native-processing-admission.js'
});

const macStaticCoreFile = 'tests/test-native-macos-static-core.mjs';

function macStaticCorePlan(args = [], platform = process.platform, arch = process.arch) {
  if (platform !== 'darwin' || !['arm64', 'x64'].includes(arch) ||
      args.length !== 4 || args[0] !== '--app' || args[2] !== '--target' ||
      typeof args[1] !== 'string' || !args[1].trim() || /[\0\r\n]/u.test(args[1]) ||
      args[3] !== 'macos-' + arch) {
    throw configurationError('MACOS_STATIC_CORE_ARGUMENT_INVALID',
      'Usage on matching Darwin host: node tests/run-product-suite.js native-macos-static-core --app <DataSecure Standalone.app> --target <macos-arm64|macos-x64>');
  }
  return { file: macStaticCoreFile, args: [...args] };
}

function artifactBoundPlan(profile, args = [], platform = process.platform) {
  // Static-Core/Darwin admission needs its own future native context gate.
  const applicable = profile === 'native-processing-admission' ? platform === 'win32' : ['win32', 'darwin'].includes(platform);
  if (!Object.hasOwn(artifactBoundFiles, profile) || !applicable ||
      args.length !== 2 || typeof args[0] !== 'string' || !args[0].trim() || args[0].includes('\0') ||
      typeof args[1] !== 'string' || !/^[a-f0-9]{64}$/u.test(args[1])) {
    throw configurationError('NATIVE_ARTIFACT_ARGUMENT_INVALID',
      'Usage: node tests/run-product-suite.js <native-lease-finish|native-processing-admission> <build-manifest> <trusted-node-sha256>');
  }
  return { file: artifactBoundFiles[profile], args: [...args] };
}

function configurationError(code, message, exitCode = 64) {
  return Object.assign(new Error(`${code}: ${message}`), { code, exitCode });
}

function nativeUiAuthorization(args, platform = process.platform) {
  if (args.length !== 1 || args[0] !== '--allow-native-ui') {
    throw configurationError('NATIVE_UI_NOT_AUTHORIZED',
      'Native Windows forms require explicit desktop permission and --allow-native-ui. Use test:product:headless without desktop access.', 77);
  }
  if (platform !== 'win32') {
    throw configurationError('NATIVE_UI_NOT_APPLICABLE',
      'These six form tests apply only to Windows; native macOS/Linux acceptance is separate and NOT_RUN.', 78);
  }
}

function executionPlan(profile, args = [], platform = process.platform) {
  if (!['ci', 'full', 'headless', 'native-ui'].includes(profile)) {
    throw configurationError('TEST_PROFILE_INVALID', 'Usage: node tests/run-product-suite.js <ci|full|headless|native-ui> [--allow-native-ui]');
  }
  const native = profile === 'native-ui' || (profile === 'full' && platform === 'win32');
  if (native) nativeUiAuthorization(args, platform);
  else if (args.length) throw configurationError('TEST_ARGUMENT_INVALID', 'This profile takes no flags; headless/CI never open native forms.');
  const files = profile === 'native-ui' ? [] : [
    ...baseFiles, ...normalizedEntries(ciFiles, 'tests/'),
    ...(['full', 'headless'].includes(profile) ? normalizedEntries(fullOnly, 'tests/') : [])
  ];
  return {
    profile,
    headlessFiles: files,
    nativeFiles: native ? normalizedEntries(nativeUiFiles, 'tests/') : [],
    nativeStatus: native ? 'PENDING' : platform === 'win32' ? 'NOT_RUN' : 'NOT_APPLICABLE'
  };
}

function nativeCoverageStatus(platform = process.platform) {
  return `Native Windows forms: ${platform === 'win32' ? 'NOT_RUN' : 'NOT_APPLICABLE'} (${nativeUiCaseCount} cases). Standalone native GUI/package acceptance: NOT_RUN by this source suite.`;
}

// Every entry normalised to its repository-relative path, so overlaps between
// the `tests/`-prefixed base list and the bare `ciFiles`/`fullOnly` names are
// detected regardless of spelling.
function normalizedEntries(list, prefix = '') {
  return list.map((file) => `${prefix}${file}`.replaceAll('\\', '/'));
}

function duplicateEntries() {
  const seen = new Map();
  const duplicates = [];
  for (const [name, entries] of [
    ['baseFiles', normalizedEntries(baseFiles)],
    ['ciFiles', normalizedEntries(ciFiles, 'tests/')],
    ['fullOnly', normalizedEntries(fullOnly, 'tests/')],
    ['nativeUiFiles', normalizedEntries(nativeUiFiles, 'tests/')]
  ]) {
    for (const entry of entries) {
      if (seen.has(entry)) duplicates.push(`${entry} (${seen.get(entry)} and ${name})`);
      else seen.set(entry, name);
    }
  }
  return duplicates;
}

function run(file, args = []) {
  const nodeFlags = file === 'tests/test-macos-core-artifact-provenance.mjs' ? ['--experimental-vm-modules'] : [];
  const result = spawnSync(process.execPath, [...nodeFlags, file, ...args], { cwd: process.cwd(), stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function argumentsForFile(profile, file) {
  // Cost-capped source CI has no target-native converter resources. The real
  // projected worker cases remain mandatory in headless/full and native builds.
  return file === 'tests/test-office-image-ocr.mjs' || profile === 'ci' && file === 'tests/test-standalone-sidecar.js' ? ['--source-only'] : [];
}

function main() {
  const profile = process.argv[2] || 'ci';
  if (profile === 'native-macos-static-core') {
    const probe = macStaticCorePlan(process.argv.slice(3));
    run(probe.file, probe.args);
    console.log('Explicit Mac Static-Core minimum gate passed; Epoch/Pause/Lease/ACL and GUI acceptance remain separate NOT_RUN gates.');
    return;
  }
  if (Object.hasOwn(artifactBoundFiles, profile)) {
    const probe = artifactBoundPlan(profile, process.argv.slice(3));
    run(probe.file, probe.args);
    console.log(`Explicit ${profile} probe passed; document pipeline and native GUI acceptance remain separate.`);
    return;
  }
  // Validate consent and platform BEFORE fixtures, temporary roots or children.
  const plan = executionPlan(profile, process.argv.slice(3));
  const duplicates = duplicateEntries();
  if (duplicates.length) {
    console.error(`Product suite lists overlap: ${duplicates.join(', ')}`);
    process.exit(65);
  }
  // GitHub Windows can expose the runner temp directory through an alias.
  // Synthetic fixture roots must use its native canonical spelling: the
  // production guards deliberately reject redirected private ancestors.
  // Separate boundary tests still exercise those hostile paths explicitly.
  if (process.platform === 'win32') {
    const temporaryRoot = fs.realpathSync.native(os.tmpdir());
    const named = fs.lstatSync(temporaryRoot);
    if (!named.isDirectory() || named.isSymbolicLink()) throw new Error('TEST_TEMP_ROOT_UNSAFE');
    process.env.TMP = temporaryRoot;
    process.env.TEMP = temporaryRoot;
  }
  console.log(`Product ${profile}: ${plan.headlessFiles.length} headless files; native Windows forms ${plan.nativeStatus}.`);
  for (const file of plan.headlessFiles) run(file, argumentsForFile(profile, file));
  for (const file of plan.nativeFiles) run(file, ['--allow-native-ui']);
  console.log(`Product ${profile} suite passed (${plan.headlessFiles.length} headless files, ${plan.nativeFiles.length ? `${nativeUiCaseCount} native Windows form cases` : 'no native GUI executed'}).`);
  if (!plan.nativeFiles.length) console.log(nativeCoverageStatus());
  else console.log('Standalone native GUI/package acceptance: NOT_RUN by these legacy form probes.');
}

module.exports = { baseFiles, ciFiles, fullOnly, nativeUiFiles, nativeUiCaseCount, duplicateEntries,
  executionPlan, nativeUiAuthorization, nativeCoverageStatus, argumentsForFile, artifactBoundFiles, artifactBoundPlan, macStaticCorePlan };

if (require.main === module) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = error.exitCode || 1; }
}
