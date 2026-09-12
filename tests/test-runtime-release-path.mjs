import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { collectProductFiles, includeInProduct, verifyProductRelativeRequires } from '../scripts/lib/product-files.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const pkg = JSON.parse(read('package.json'));

const build = read('scripts/build-plugin.mjs');
assert.match(build, /buildRuntimePlugin/u);
assert.doesNotMatch(build, /writeZip|collectProductFiles|ocr-runtime|build-sea/u);
assert.match(pkg.scripts['build:plugin'], /build-plugin\.mjs/u);
assert.match(pkg.scripts['test:plugin-zip'], /verify-plugin-zip\.mjs/u);

const verify = read('scripts/verify-plugin-zip.mjs');
assert.match(verify, /RUNTIME-EVIDENCE\.json/u);
assert.match(verify, /source_commit/u, 'every released product archive binds a source commit');
assert.match(verify, /host_node_required/u);
assert.match(verify, /PRODUCT_ENGINEERING_PAYLOAD_FORBIDDEN/u);
assert.match(verify, /PRODUCT_ARCHIVE_NATIVE_HOST_REQUIRED/u);
assert.match(verify, /configuration\.command/u, 'the package manifest determines its native start');
assert.match(verify, /fs\.chmodSync\(destination, modes\.get\(name\) & 0o777\)/u);
assert.match(verify, /fs\.mkdtempSync\(path\.join\(os\.homedir\(\), '\.datasecure-product-runtime-'\)\)/u,
  'native package storage must be tested below a real local home, not an OS temp alias');
assert.doesNotMatch(verify, /mkdtempSync\(path\.join\(os\.tmpdir\(\), 'datasecure-product-runtime-'/u);
assert.match(verify, /EU_PRIVACY_DATA_ROOT: process\.platform === 'win32' \? '' : path\.join\(stableRuntimeData, 'SecureDataMsg'\)/u);
assert.match(verify, /notifications\/initialized/u);
assert.match(verify, /cancel_local_results_handoff/u);
assert.match(verify, /STATIC PASS \(native not run\)/u);

const sbom = read('scripts/generate-sbom.mjs');
assert.match(sbom, /SPDXRef-Package-Node\.js/u);
assert.match(sbom, /runtime\/LICENSE\.node\.txt/u);
assert.match(sbom, /MCPB, SEA and disabled OCR are Engineering-only/u);

for (const workflow of ['release-evidence.yml', 'bundled-runtime-release.yml']) {
  const source = read(`.github/workflows/${workflow}`);
  assert.match(source, /workflow_dispatch/u);
  assert.doesNotMatch(source, /^\s*(?:push|pull_request):/mu);
  assert.match(source, /build-runtime-target\.mjs/u);
}
assert.match(read('.github/workflows/release-evidence.yml'), /npm run build/u);
assert.match(read('.github/workflows/release-evidence.yml'), /build:cowork-uat-evidence/u);
assert.match(read('.github/workflows/release-evidence.yml'), /--candidate-commit \$env:GITHUB_SHA/u);
const releaseWorkflow = read('.github/workflows/release-evidence.yml');
assert.match(releaseWorkflow, /\$archive = Join-Path \$env:RUNNER_TEMP \$archiveName/u);
assert.match(releaseWorkflow, /Invoke-WebRequest[^\n]+\$archiveName[^\n]+-OutFile \$archive/u);
assert.match(releaseWorkflow, /dist\/DataSecure-Privacy-Preflight-windows-x64-debug-v\*\.zip/u);
const inventoryStep = releaseWorkflow.indexOf('- name: Inventory the final');
assert.ok(inventoryStep > releaseWorkflow.indexOf('npm run build:cowork-uat-evidence'));
assert.ok(inventoryStep < releaseWorkflow.indexOf('- uses: actions/upload-artifact'));
assert.match(releaseWorkflow.slice(inventoryStep), /--archive[^\n]+windows-x64-v[^\n]+[\s\S]*--archive[^\n]+windows-x64-debug-v[\s\S]*--cowork-uat/u);
assert.match(read('.github/workflows/bundled-runtime-release.yml'), /verify-plugin-zip\.mjs/u);
assert.match(read('.github/workflows/bundled-runtime-release.yml'), /generate-sbom\.mjs/u);
const nativeJob = read('.github/workflows/bundled-runtime-release.yml').split('  native-package-smoke:')[1];
assert.ok(nativeJob, 'packaging alone must not pass as native evidence');
assert.match(nativeJob, /needs: \[select, package\]/u);
assert.match(nativeJob, /matrix: \$\{\{ fromJSON\(needs.select.outputs.matrix\) \}\}/u);
assert.match(nativeJob, /datasecure-cowork-plugin-\$\{\{ inputs.target \}\}-\$\{\{ github.sha \}\}/u);
assert.match(nativeJob, /verify-plugin-zip\.mjs --require-native/u);
assert.doesNotMatch(nativeJob, /build-runtime-plugin|test-bundled-runtime/u);

const projected = collectProductFiles(path.join(root, 'plugins', 'data-secure'));
const entries = new Map(projected.map(file => [file.archivePath, fs.readFileSync(file.fullPath)]));
const commonModules = ['conversion-runtime-resolver.js', 'conversion-worker-contract.js', 'conversion-worker.js',
  'convert-next.js', 'markdown-artifact.js', 'markdown-contract.js', 'markdown-retention.js', 'markdown-store.js'];
assert.deepEqual([...entries.keys()].filter(name => name.startsWith('server/standalone/')).sort(),
  commonModules.map(name => `server/standalone/${name}`).sort());
assert.deepEqual(verifyProductRelativeRequires(entries), { ok: true });
const historyStore = 'server/gateway/standalone-history-store.js';
assert.equal(entries.has(historyStore), true, 'shared journal/export persistence ships in the actual product projection');
const missingHistoryStore = new Map(entries);
missingHistoryStore.delete(historyStore);
assert.throws(() => verifyProductRelativeRequires(missingHistoryStore),
  /PRODUCT_MODULE_DEPENDENCY_MISSING:server\/gateway\/(?:batch|result-export)\.js:\.\/standalone-history-store$/u,
  'removing history persistence from the real product projection must fail its module closure');
for (const name of commonModules) {
  const missing = new Map(entries);
  missing.delete(`server/standalone/${name}`);
  assert.throws(() => verifyProductRelativeRequires(missing), /PRODUCT_MODULE_DEPENDENCY_MISSING/u,
    `transitive product dependency ${name} must be shipped`);
}
for (const name of ['conversion-runtime/node.exe', 'conversion-runtime/node_modules/pdfjs-dist/build/pdf.mjs',
  'conversion-runtime/models/eng.traineddata', 'conversion-worker-child.js', 'markdown-extractor.js',
  'wide-privacy-extraction.js', 'desktop-sidecar.js', 'application-service.js', 'run-history.js',
  'product-manifest.json']) {
  assert.equal(includeInProduct(`server/standalone/${name}`), false, `${name} is not a Cowork payload`);
  assert.equal(entries.has(`server/standalone/${name}`), false);
}
assert.equal(entries.has('server/core/markdown-first-privacy.js'), true,
  'the channel-neutral Markdown-first privacy contract ships in Cowork');
const broken = new Map(entries);
broken.set('server/gateway/future-shared.js', Buffer.from("require('../standalone/future-contract');"));
assert.throws(() => verifyProductRelativeRequires(broken), /PRODUCT_MODULE_DEPENDENCY_MISSING/u,
  'a future unprojected contract fails the build before runtime startup');
const modeContract = await import('../plugins/data-secure/server/core/processing-mode.js');
assert.throws(() => modeContract.default.validateProcessingMode('markdown-only', 'plugin'),
  { code: 'PROCESSING_MODE_FORBIDDEN' });

console.log('Self-contained product build, verification, SBOM and manual release path: PASS');
