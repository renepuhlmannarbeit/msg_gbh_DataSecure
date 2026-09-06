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
assert.match(verify, /host_node_required/u);
assert.match(verify, /PRODUCT_ENGINEERING_PAYLOAD_FORBIDDEN/u);

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
assert.match(read('.github/workflows/bundled-runtime-release.yml'), /verify-plugin-zip\.mjs/u);
assert.match(read('.github/workflows/bundled-runtime-release.yml'), /generate-sbom\.mjs/u);

const projected = collectProductFiles(path.join(root, 'plugins', 'data-secure'));
const entries = new Map(projected.map(file => [file.archivePath, fs.readFileSync(file.fullPath)]));
const commonModules = ['conversion-runtime-resolver.js', 'conversion-worker-contract.js', 'conversion-worker.js',
  'convert-next.js', 'markdown-artifact.js', 'markdown-contract.js', 'markdown-retention.js', 'markdown-store.js'];
assert.deepEqual([...entries.keys()].filter(name => name.startsWith('server/standalone/')).sort(),
  commonModules.map(name => `server/standalone/${name}`).sort());
assert.deepEqual(verifyProductRelativeRequires(entries), { ok: true });
for (const name of commonModules) {
  const missing = new Map(entries);
  missing.delete(`server/standalone/${name}`);
  assert.throws(() => verifyProductRelativeRequires(missing), /PRODUCT_MODULE_DEPENDENCY_MISSING/u,
    `transitive product dependency ${name} must be shipped`);
}
for (const name of ['conversion-runtime/node.exe', 'conversion-runtime/node_modules/pdfjs-dist/build/pdf.mjs',
  'conversion-runtime/models/eng.traineddata', 'conversion-worker-child.js', 'markdown-extractor.js',
  'desktop-sidecar.js', 'application-service.js', 'product-manifest.json']) {
  assert.equal(includeInProduct(`server/standalone/${name}`), false, `${name} is not a Cowork payload`);
  assert.equal(entries.has(`server/standalone/${name}`), false);
}
const broken = new Map(entries);
broken.set('server/gateway/future-shared.js', Buffer.from("require('../standalone/future-contract');"));
assert.throws(() => verifyProductRelativeRequires(broken), /PRODUCT_MODULE_DEPENDENCY_MISSING/u,
  'a future unprojected contract fails the build before runtime startup');
const modeContract = await import('../plugins/data-secure/server/core/processing-mode.js');
assert.throws(() => modeContract.default.validateProcessingMode('markdown-only', 'plugin'),
  { code: 'PROCESSING_MODE_FORBIDDEN' });

console.log('Self-contained product build, verification, SBOM and manual release path: PASS');
