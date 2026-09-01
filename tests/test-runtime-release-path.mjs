import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

console.log('Self-contained product build, verification, SBOM and manual release path: PASS');
