'use strict';

const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');

const { test, done, assert } = createSuite('Milestone-zero architecture contracts');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, 'docs', 'canonical', 'contracts', name), 'utf8');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

test('batch snapshot contract fixes originals, private copies and crash semantics', () => {
  const text = read('BATCH_SNAPSHOT_V1.md');
  for (const required of [
    'BL-011.1', 'Originale', 'Arbeitskopien', 'atomar', 'SHA-256', 'fsync',
    'Symlink', 'Reparse-Point', '14 Tagen', 'Rechnerneustart', 'höchstens ein Stapel', 'Checkpoint'
  ]) assert.ok(text.includes(required), `snapshot contract missing: ${required}`);
  assert.match(text, /Originalpfad wird nicht erneut geöffnet/u);
  assert.match(text, /Quellpfade werden nicht[\s\S]*Antworten geschrieben/u);
  assert.match(text, /Checkpoint[\s\S]*niemals über MCP, Audit oder Diagnose/u);
});

test('every current processing route is copy-only at the source boundary', () => {
  const orchestrator = fs.readFileSync(
    path.join(root, 'plugins', 'data-secure', 'server', 'gateway', 'orchestrator.js'),
    'utf8'
  );
  const snapshot = fs.readFileSync(
    path.join(root, 'plugins', 'data-secure', 'server', 'gateway', 'read-only-source-snapshot.js'),
    'utf8'
  );
  const compliance = fs.readFileSync(
    path.join(root, 'plugins', 'data-secure', 'server', 'gateway', 'compliance.js'),
    'utf8'
  );
  const retention = fs.readFileSync(
    path.join(root, 'plugins', 'data-secure', 'server', 'gateway', 'retention.js'),
    'utf8'
  );
  assert.match(orchestrator, /copySourceToPrivateWork/u);
  assert.match(orchestrator, /original_moved_to_processed: false/u);
  assert.doesNotMatch(orchestrator, /moveProcessed|restoreProcessed|\.processing_/u);
  assert.doesNotMatch(orchestrator, /renameSync\(originalSource|unlinkSync\(originalSource/u);
  assert.doesNotMatch(compliance, /moveProcessed|restoreProcessed|moveExact/u);
  assert.match(retention, /if \(scope === 'processed'\) continue/u);
  assert.match(retention, /LEGACY_PROCESSED_SOURCE_PROTECTED/u);
  assert.match(snapshot, /O_RDONLY/u);
  assert.match(snapshot, /O_NOFOLLOW/u);
  assert.match(snapshot, /fs\.openSync\(destination, 'wx', 0o600\)/u);
  assert.match(snapshot, /fs\.fsyncSync\(destinationFd\)/u);
});

test('legacy Input is migration-only and cannot return as a normal intake route', () => {
  const common = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'gateway', 'common.js'), 'utf8');
  const intake = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'gateway', 'batch-intake.js'), 'utf8');
  const gateway = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'gateway.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'gateway', 'legacy-input-migration.js'), 'utf8');
  assert.doesNotMatch(common, /function listInput|listInput[,}]/u);
  assert.doesNotMatch(common, /ensurePrivateDirectory\(root,'Input'\)/u);
  assert.doesNotMatch(intake, /listInput/u);
  assert.match(intake, /Array\.isArray\(beginOptions\.queue\)/u);
  assert.doesNotMatch(gateway, /anonymizeNext,anonymizeAll/u);
  assert.match(migration, /datasecure-legacy-input-migration\/1/u);
  assert.match(migration, /path\.join\(privacyRoot\(\), 'Input'\)/u);
  assert.match(migration, /fs\.linkSync/u);
  assert.doesNotMatch(migration, /fs\.unlinkSync\(plan\.claim\)/u);
});

test('batch parallelism remains opt-in, centrally committed and privacy bounded', () => {
  const text = read('BATCH_PARALLELISM_V1.md');
  for (const required of [
    'BL-011.12', 'höchstens **zwei**', 'zentrale Committer', 'private IPC',
    '0600-geschützten Zwei-Slot', '2 × Batchgröße + Headroom', 'Feature-Flag',
    'Windows, macOS und Linux'
  ]) assert.ok(text.includes(required), `parallelism contract missing: ${required}`);
  assert.match(text, /`processBatchNext` wird nicht parallel aufgerufen/u);
  assert.match(text, /keine Thread-, Worker-, CPU- oder Speicheroption/u);
  assert.match(text, /keine Texte, Pfade, Namen, Hashes, Tokens oder Fehlerdetails zurück/u);
  assert.match(text, /Mapping.*exklusiven Commit-Lock|Append-only-Ledger/u);
  const harness = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'parallel-preparation-harness.js'), 'utf8');
  assert.match(harness, /Engineering-only proof harness/u);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'gateway', 'batch.js'), 'utf8'), /parallel-preparation-harness/u);
});

test('POSIX supervisor packaging is conditional but incomplete target artifacts fail closed', () => {
  const text = read('POSIX_SUPERVISOR_PACKAGING_V1.md');
  for (const required of ['BL-011.9', 'macos-x64', 'macos-arm64', 'linux-x64', 'SHA-256', '0755', 'Fresh-Install']) {
    assert.ok(text.includes(required), `POSIX packaging contract missing: ${required}`);
  }
  const helper = fs.readFileSync(path.join(root, 'scripts', 'lib', 'posix-supervisor-artifacts.mjs'), 'utf8');
  for (const code of ['POSIX_SUPERVISOR_TARGET_INCOMPLETE', 'POSIX_SUPERVISOR_TARGET_MISMATCH', 'POSIX_SUPERVISOR_INTEGRITY_FAILED']) {
    assert.ok(helper.includes(code), `POSIX packaging gate missing: ${code}`);
  }
  const pluginBuilder = fs.readFileSync(path.join(root, 'scripts', 'build-plugin.mjs'), 'utf8');
  const mcpbBuilder = fs.readFileSync(path.join(root, 'scripts', 'build-mcpb.mjs'), 'utf8');
  assert.match(pluginBuilder, /verifyPosixSupervisorArtifacts/u);
  assert.match(mcpbBuilder, /verifyPosixSupervisorArtifacts/u);
});

test('OCR batch reuse stays disabled until a native per-frame session boundary is proven', () => {
  const text = read('OCR_BATCH_SESSION_V1.md');
  for (const required of [
    'BL-024.4', 'kein** aktiver Produktpfad', 'globaler OCR-\nDaemon ist verboten',
    'single-flight', 'length-prefixed', 'pro Anfrage', 'Windows, macOS', 'Linux x64',
    'Prozessbaum', 'release_enabled'
  ]) assert.ok(text.includes(required), `OCR batch-session contract missing: ${required}`);
  assert.match(text, /keine zusätzliche[\s\S]*Berechtigung, keine Auswahl, kein Polling/u);
  assert.match(text, /JavaScript-Timer allein genügt nicht/u);
  const harness = fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'ocr-session-harness.js'), 'utf8');
  assert.match(harness, /Engineering-only preparatory harness/u);
  assert.match(harness, /OCR_SESSION_SINGLE_FLIGHT/u);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'runtime.js'), 'utf8'), /ocr-session-harness/u);
});

test('output capacity never invents a global output cap and keeps volume checks local', () => {
  const text = read('OUTPUT_CAPACITY_V1.md');
  for (const required of [
    'BL-011.6', 'Output', 'Needs Visual Review', '2 × Eingabegröße + 64 MiB',
    'keine erfundene globale Output-Grenze', 'Bytezahl', 'Node-Dateisystemwerte',
    'Windows', 'macOS', 'Linux'
  ]) assert.ok(text.includes(required), `output-capacity contract missing: ${required}`);
  assert.match(text, /vor jedem tatsächlichen Schreiben/iu);
  assert.match(text, /vor Publish und Mapping/u);
});

test('pseudonym contract is restart-stable without a raw mapping table', () => {
  const text = read('BATCH_PSEUDONYM_V1.md');
  for (const required of [
    'BL-030.1', '256-Bit', 'HMAC-SHA-256', 'DPAPI', 'Keychain', 'Secret Service',
    'Base32', '14 Tagen', 'Rohwert und Platzhalter', 'Rechnerneustart'
  ]) assert.ok(text.includes(required), `pseudonym contract missing: ${required}`);
  assert.match(text, /Klartext-Fallback ist verboten/u);
  assert.match(text, /Zwischen Stapeln.*keine stabile Verknüpfung/u);
});

test('batch secret-store contract pins the native candidate and keeps every fallback closed', () => {
  const text = read('BATCH_SECRET_STORE_V1.md');
  for (const required of [
    'BL-030.2', '@napi-rs/keyring', '1.3.0', 'MIT', 'new Entry(service, account)',
    'setPassword', 'getPassword', 'deletePassword', '256-Bit', 'Base64url',
    'keyring-win32-x64-msvc', 'keyring-darwin-x64', 'keyring-darwin-arm64',
    'keyring-linux-x64-gnu', 'keyring-linux-x64-musl', 'BATCH_SECRET_STORE_UNAVAILABLE'
  ]) assert.ok(text.includes(required), `secret-store contract missing: ${required}`);
  assert.match(text, /vor\*\* Snapshot-Commit und Pseudonymvergabe/u);
  assert.match(text, /keinen Klartext-, Datei-, Umgebungsvariablen-, CLI-, Cloud-/u);
  assert.match(text, /Rechnerneustart zwischen Set und Get/u);
});

test('batch review contract keeps its aggregate UI anonymous and range-safe', () => {
  const text = read('BATCH_REVIEW_V1.md');
  for (const required of [
    'BL-012.1', 'Dokument 1', 'Dokument N', 'globale Entwurfskennung',
    'Rückzuordnung', 'nur im Speicher', 'Freie Bereichsredaktionen',
    'dokumentgrenzenfesten', 'stdin', 'MCP-Antworten'
  ]) assert.ok(text.includes(required), `batch-review contract missing: ${required}`);
  assert.match(text, /Originalnamen und Pfade gehören nicht in die UI-Nutzlast/u);
  assert.match(text, /positionssicheren, dokumentgrenzenfesten Abbildung gesperrt/iu);
});

test('embedded content contract fixes recursion, resources and active-content refusal', () => {
  const text = read('EMBEDDED_CONTENT_V1.md');
  for (const required of [
    'BL-020.2', 'DS-017', '3 Ebenen', '20 eingebettete Dokumente',
    '50 MiB', '100 MiB', 'VBA', 'OLE', 'ActiveX', 'externe Beziehungen',
    'inhaltsfreie Coverage-Warnung', 'source_part', 'interne Paketbeziehung'
  ]) assert.ok(text.includes(required), `embedded-content contract missing: ${required}`);
  assert.match(text, /vollständigen Dokumentbaum, nicht pro Kind/u);
  assert.match(text, /weder gestartet noch[\s\S]*abgedeckter statischer Inhalt/u);
});

test('raw-content network contract covers every local and remote escape class', () => {
  const text = read('NETWORK_BOUNDARY_V1.md');
  for (const required of [
    'BL-020.3', 'Loopback', 'RFC1918', 'ULA', 'DNS', '--allow-net',
    'network-deny.cjs', 'HTTP(S)', 'TCP/TLS', 'UDP', 'HTTP/2', 'fetch',
    'WebSocket', 'DATASECURE_NETWORK_DENIED', 'Windows-x64', 'macOS-ARM64', 'Linux-x64'
  ]) assert.ok(text.includes(required), `network contract missing: ${required}`);
  assert.match(text, /kein Versprechen einer[\s\S]*Sandbox/u);
  assert.match(text, /bleibt deshalb in Arbeit/u);
});

test('text source contract fixes strict UTF-8, inert Markdown and a closed release gate', () => {
  const text = read('TEXT_SOURCE_V1.md');
  for (const required of [
    'BL-021.1', 'UTF-8', 'BOM', 'CRLF', 'NFC', 'C0-Steuerzeichen',
    'Raw HTML', 'Frontmatter', 'Codeblöcke', 'Content-Graph V1',
    'FORMAT_COVERAGE_UNVERIFIED', 'TextDecoder', 'fatal: true', 'markdown-it'
  ]) assert.ok(text.includes(required), `text-source contract missing: ${required}`);
  assert.match(text, /rendert[\s\S]*kein HTML/u);
  assert.match(text, /Release-Gate geschlossen/u);
});

test('CSV source contract fixes strict dialect parsing and literal formula handling', () => {
  const text = read('CSV_SOURCE_V1.md');
  for (const required of [
    'BL-021.2', 'RFC-4180', 'Semikolon', 'Tab', 'doppelte Anführungszeichen',
    'ungleiche Zeilenbreiten', 'Formelähnliche', 'Content-Graph-V1',
    'Papa Parse', 'Release-Gate geschlossen'
  ]) assert.ok(text.includes(required), `CSV-source contract missing: ${required}`);
  assert.match(text, /weder CSV noch XLSX als Ergebnis/u);
});

test('DOCX story contract covers secondary stories while keeping unknown parts closed', () => {
  const text = read('DOCX_STORY_COVERAGE_V1.md');
  for (const required of [
    'BL-022.1', 'word/document.xml', 'w:hdr', 'w:ftr', 'w:comments',
    'w:footnotes', 'w:endnotes', 'Textfelder', 'source_part', 'Residual-Gate',
    'externe Beziehung', 'Glossarien', 'Mammoth'
  ]) assert.ok(text.includes(required), `DOCX-story contract missing: ${required}`);
  assert.match(text, /nicht stillschweigend ausgelassen/u);
});

test('PDF and OCR stay blocked until every platform risk cell is proven', () => {
  const text = read('PDF_OCR_RISK_GATE_V1.md');
  for (const platform of ['Windows', 'macOS', 'Linux']) assert.ok(text.includes(platform));
  for (const risk of ['PDFium', 'Offline', 'Unicode', 'Verschlüsselung', 'Fuzzing', 'SBOM']) {
    assert.ok(text.includes(risk), `PDF/OCR gate missing: ${risk}`);
  }
  assert.match(text, /\| gepinnte gepflegte PDF-Engine und Lieferkette \| offen \| offen \| offen \|/u);
  assert.match(text, /Bis jede Pflichtzelle positiv belegt ist.*gesperrt/su);
});

test('PDF/OCR risk sources and the four required runner targets are pinned', () => {
  const lock = readJson('native/pdfium/pdf-ocr-risk.lock.json');
  assert.strictEqual(lock.release_enabled, false);
  assert.strictEqual(lock.pdf.repository, 'https://pdfium.googlesource.com/pdfium');
  assert.strictEqual(lock.ocr_candidate.repository, 'https://github.com/tesseract-ocr/tesseract');
  assert.deepStrictEqual(lock.ocr_candidate.models.languages, ['deu', 'eng']);
  assert.deepStrictEqual(lock.platforms.map((item) => item.id), [
    'windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64'
  ]);
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pdf-ocr-risk.yml'), 'utf8');
  for (const runner of ['windows-latest', 'macos-15-intel', 'macos-14', 'ubuntu-latest']) {
    assert.ok(workflow.includes(runner), `risk workflow missing ${runner}`);
  }
  assert.match(workflow, /Community PDFium spike became releasable/u);
});

test('PDF.js pilot is locked, offline, non-release and tested on four runner targets', () => {
  const pilotPackage = readJson('native/pdfjs/pilot/package.json');
  assert.deepStrictEqual(pilotPackage.dependencies, {
    '@napi-rs/canvas': '1.0.7',
    'pdfjs-dist': '6.2.108'
  });
  const pilotLock = readJson('native/pdfjs/pilot/package-lock.json');
  assert.strictEqual(pilotLock.lockfileVersion, 3);
  assert.match(pilotLock.packages['node_modules/pdfjs-dist'].integrity, /^sha512-/u);
  assert.match(pilotLock.packages['node_modules/@napi-rs/canvas'].integrity, /^sha512-/u);
  const source = fs.readFileSync(path.join(root, 'native', 'pdfjs', 'pilot', 'run.mjs'), 'utf8');
  for (const token of ['data: bytes', 'isEvalSupported: false', 'disableAutoFetch: true',
    'useWorkerFetch: false', "release_decision: 'no_go'", 'networkAttempts']) {
    assert.ok(source.includes(token), `PDF.js pilot missing safeguard ${token}`);
  }
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows',
    'pdfjs-stack-pilot.yml'), 'utf8');
  for (const runner of ['windows-latest', 'macos-15-intel', 'macos-14', 'ubuntu-latest']) {
    assert.ok(workflow.includes(runner), `PDF.js pilot workflow missing ${runner}`);
  }
  assert.match(workflow, /npm ci --prefix native\/pdfjs\/pilot --ignore-scripts/u);
  assert.doesNotMatch(workflow, /curl|wget|Invoke-WebRequest/iu);
});

test('Tesseract.js pilot is locked to verified local models and four runner targets', () => {
  const pilotPackage = readJson('native/ocr/pilot/package.json');
  assert.deepStrictEqual(pilotPackage.dependencies, {
    '@napi-rs/canvas': '1.0.7',
    'tesseract.js': '7.0.0'
  });
  const pilotLock = readJson('native/ocr/pilot/package-lock.json');
  assert.strictEqual(pilotLock.lockfileVersion, 3);
  for (const dependency of ['tesseract.js', 'tesseract.js-core', '@napi-rs/canvas']) {
    assert.match(pilotLock.packages[`node_modules/${dependency}`].integrity, /^sha512-/u);
  }

  const models = readJson('native/ocr/pilot/models.lock.json');
  assert.strictEqual(models.raw_base,
    'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast');
  assert.strictEqual(models.commit, '65727574dfcd264acbb0c3e07860e4e9e9b22185');
  assert.deepStrictEqual(models.license, {
    file: 'LICENSE',
    spdx: 'Apache-2.0',
    bytes: 11358,
    sha256: 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'
  });
  assert.deepStrictEqual(Object.keys(models.models), ['deu', 'eng']);
  assert.strictEqual(models.models.deu.sha256,
    '19d219bbb6672c869d20a9636c6816a81eb9a71796cb93ebe0cb1530e2cdb22d');
  assert.strictEqual(models.models.eng.sha256,
    '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2');

  const fetchSource = fs.readFileSync(path.join(root, 'native', 'ocr', 'pilot',
    'fetch-models.mjs'), 'utf8');
  for (const token of ['raw.githubusercontent.com', 'MODEL_SOURCE_NOT_ALLOWLISTED',
    'MODEL_HASH_', "flag: 'wx'"]) {
    assert.ok(fetchSource.includes(token), `OCR model fetch missing safeguard ${token}`);
  }
  const source = fs.readFileSync(path.join(root, 'native', 'ocr', 'pilot', 'run.mjs'), 'utf8');
  for (const token of ["langPath: modelDir", "cacheMethod: 'none'", 'gzip: false',
    'blocks: true', 'normalizeOcrResult', "release_decision: 'no_go'",
    "product_image_gate: 'OCR_COVERAGE_UNVERIFIED'"]) {
    assert.ok(source.includes(token), `OCR pilot missing safeguard ${token}`);
  }
  const networkDeny = fs.readFileSync(path.join(root, 'native', 'ocr', 'pilot',
    'network-deny.cjs'), 'utf8');
  for (const token of ['node:http', 'node:https', 'node:net', 'node:tls', 'node:dns',
    'node:dgram', 'node:http2', "'fetch', 'WebSocket', 'EventSource'",
    'DATASECURE_NETWORK_DENIED', 'writable: false', 'configurable: false'])
    assert.ok(networkDeny.includes(token), `network deny missing ${token}`);
  const supplyChain = fs.readFileSync(path.join(root, 'native', 'ocr', 'pilot',
    'verify-supply-chain.mjs'), 'utf8');
  for (const token of ["'Apache-2.0', 'MIT', 'BSD-2-Clause'", 'PACKAGE_INTEGRITY_MISSING_',
    'PACKAGE_LICENSE_NOT_ALLOWED_', "sbom.bomFormat, 'CycloneDX'", 'model_hashes_verified']) {
    assert.ok(supplyChain.includes(token), `OCR supply-chain check missing ${token}`);
  }
  const isolated = fs.readFileSync(path.join(root, 'native', 'ocr', 'pilot',
    'isolated-run.mjs'), 'utf8');
  for (const token of ['windows_job_object', 'posix_native_supervisor', '--permission',
    '--allow-worker', '--allow-addons', '--max-old-space-size=512',
    'OCR_ISOLATION_TIMEOUT', 'OCR_ISOLATION_OUTPUT_LIMIT', 'verifyNativeLauncherArtifact',
    "passed_gates: ["]) {
    assert.ok(isolated.includes(token), `OCR isolated pilot missing safeguard ${token}`);
  }
  assert.doesNotMatch(isolated, /\.\.\.process\.env/u);
  assert.match(isolated, /stdio: \['ignore', 'pipe', 'ignore'\]/u);
  const posix = fs.readFileSync(path.join(root, 'native', 'ocr', 'pilot',
    'posix-sandbox.c'), 'utf8');
  for (const token of ['setrlimit(RLIMIT_CPU', 'setrlimit(RLIMIT_AS',
    'setrlimit(RLIMIT_DATA', 'setrlimit(RLIMIT_FSIZE', 'setrlimit(RLIMIT_NOFILE',
    'proc_pid_rusage', '/proc/%ld/statm', 'kill(-child_group, SIGKILL)',
    'datasecure-posix-sandbox/v1', 'process_group_reap', 'RESOURCE_LIMIT']) {
    assert.ok(posix.includes(token), `POSIX OCR boundary missing ${token}`);
  }

  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows',
    'tesseractjs-ocr-pilot.yml'), 'utf8');
  for (const runner of ['windows-latest', 'macos-15-intel', 'macos-14', 'ubuntu-latest']) {
    assert.ok(workflow.includes(runner), `OCR pilot workflow missing ${runner}`);
  }
  assert.match(workflow, /npm ci --prefix native\/ocr\/pilot --ignore-scripts/u);
  assert.match(workflow, /NODE_OPTIONS: --require=/u);
  assert.match(workflow, /npm sbom --prefix native\/ocr\/pilot --package-lock-only --sbom-format cyclonedx/u);
  assert.match(workflow, /verify-supply-chain\.mjs/u);
  assert.match(workflow, /isolated-run\.mjs/u);
  assert.match(workflow, /test-ocr-result-contract\.mjs/u);
  assert.match(workflow, /cc -std=c11 -O2 -Wall -Wextra -Werror/u);
  assert.match(workflow, /--sandbox-contract/u);
  assert.match(isolated, /Number\.isInteger\(code\) && code >= 120 && code <= 126/u,
    'POSIX supervisor setup failures must remain boundary failures');
  for (const token of ['build-ocr-runtime.mjs', 'test-ocr-runtime-bundle.mjs',
    'test-ocr-runtime-smoke.mjs', 'dist/ocr-runtime/${{ env.OCR_BUNDLE_TARGET }}/',
    'include-hidden-files: true', 'assemble-ocr-runtime.mjs',
    'test-ocr-universal-bundle.mjs', 'tesseractjs-ocr-universal-${{ github.sha }}',
    'build-portable-plugin.mjs', 'verify-portable-plugin-zip.mjs', 'test -x']) {
    assert.ok(workflow.includes(token), `OCR bundle workflow missing ${token}`);
  }

  const bundleBuilder = fs.readFileSync(path.join(root, 'scripts',
    'build-ocr-runtime.mjs'), 'utf8');
  for (const token of ['licenseFallbacks', "'tr46@0.0.3'",
    'OCR_BUNDLE_LICENSE_TEXT_MISSING_', 'OCR_BUNDLE_LICENSE_FALLBACK_INVALID_']) {
    assert.ok(bundleBuilder.includes(token), `OCR bundle license gate missing ${token}`);
  }
  const tr46License = fs.readFileSync(path.join(root, 'native', 'ocr', 'pilot',
    'license-fallbacks', 'tr46-0.0.3-MIT.txt'), 'utf8');
  assert.match(tr46License, /Copyright \(c\) Sebastian Mayr/u);
  assert.match(tr46License, /Permission is hereby granted/u);
});

test('OCR result v1 fixes positions, confidence, limits and content-free errors', () => {
  const contract = read('OCR_RESULT_V1.md');
  for (const required of [
    'BL-024.1', 'data-secure-ocr-result/v1', 'halb offener Pixelbox',
    'OCR_LOW_CONFIDENCE_PRESENT', 'OCR_EMPTY', '100 Prozent', '30.000.000',
    'OCR_RESULT_INVALID', 'OCR_NETWORK_POLICY_FAILED', 'macOS', 'Linux'
  ]) assert.ok(contract.includes(required), `OCR contract missing: ${required}`);
  const schema = readJson('docs/canonical/contracts/ocr-result-v1.schema.json');
  assert.strictEqual(schema.additionalProperties, false);
  assert.strictEqual(schema.properties.quality.properties.requires_visual_review.const, true);
});

done();
