import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { bindVerifiedArchive, verifyUatInventory, digest } from '../scripts/lib/cowork-candidate.mjs';
import { parseCandidateArguments } from '../scripts/build-cowork-uat-evidence.mjs';
const require = createRequire(import.meta.url);
const {zipStore} = require('./lib/zip.js');

const commit = 'a'.repeat(40);
assert.throws(() => parseCandidateArguments([]), /COWORK_UAT_NORMAL_ZIP_REQUIRED/u);
assert.throws(() => parseCandidateArguments(['--normal-zip', 'normal.zip']), /COWORK_UAT_DEBUG_ZIP_REQUIRED/u);
assert.throws(() => parseCandidateArguments(['--normal-zip', 'normal.zip', '--debug-zip', 'debug.zip']),
  /COWORK_UAT_CANDIDATE_COMMIT_REQUIRED/u);
assert.deepEqual(parseCandidateArguments([
  '--normal-zip', 'dist/normal.zip', '--debug-zip', 'dist/debug.zip', '--candidate-commit', commit
]), { normalZip: 'dist/normal.zip', debugZip: 'dist/debug.zip', candidateCommit: commit });
console.log('Cowork UAT evidence requires explicit artifacts and a candidate commit: PASS');

const version = '1.0.0-test';
const name = `DataSecure-Privacy-Preflight-windows-x64-v${version}.zip`;
const debugName = `DataSecure-Privacy-Preflight-windows-x64-debug-v${version}.zip`;
function archive(mode, content = 'synthetic A', sourceCommit = commit) {
  return zipStore([
    ['RUNTIME-EVIDENCE.json', JSON.stringify({product_version: version, mode, source_commit: sourceCommit,
      targets: [{target: 'windows-x64'}]})], ['synthetic.txt', content]
  ]);
}
const a = archive('direct-upload-target');
const b = archive('direct-upload-target', 'synthetic B');
const debug = archive('direct-upload-debug-target');
const report = bytes => ({schema:'datasecure-product-zip-verification/1', status:'NATIVE_PASS',
  bytes:bytes.length, sha256:digest(bytes)});
const opts = {name, version, mode:'direct-upload-target', target:'windows-x64'};
// The verifier result is a controlled fault-injection boundary, not native
// execution evidence. ZIP parsing, CRCs, hashing and binding use real bytes.
const normalRecord = bindVerifiedArchive(a, report(a), opts);
const debugRecord = bindVerifiedArchive(debug, report(debug), {...opts, name:debugName, mode:'direct-upload-debug-target'});
assert.equal(normalRecord.sha256, digest(a));
assert.equal(a.length, b.length, 'size alone must not establish identity');
assert.throws(() => bindVerifiedArchive(b, report(a), opts), /VERIFIED_BYTES_MISMATCH/);
for (const invalid of [null, {}, {...report(a), status:'STATIC_PASS'}, {...report(a), bytes:a.length+1}]) {
  assert.throws(() => bindVerifiedArchive(a, invalid, opts), /VERIFIED_BYTES_MISMATCH/);
}
for (const invalid of [{...opts, mode:'direct-upload-debug-target'}, {...opts, target:'macos-arm64'}, {...opts, version:'0'}]) {
  assert.throws(() => bindVerifiedArchive(a, report(a), invalid), /ARTEFACT_EVIDENCE_INVALID/);
}
const missingCommit = archive('direct-upload-target', 'synthetic A', '');
assert.throws(() => bindVerifiedArchive(missingCommit, report(missingCommit), opts), /ARTEFACT_EVIDENCE_INVALID/);
const candidate = {schema:'datasecure-cowork-uat-candidate/2', product_version:version,
  candidate_commit:commit, platform:'Windows', architecture:'x64',
  model_gates:{full_matrix_41x3:'NOT_RUN', candidate_smoke_12x3:'NOT_RUN'}, artifacts:[normalRecord,debugRecord]};
const uat = c => zipStore([['CANDIDATE.json',JSON.stringify(c)]]);
const products = [normalRecord, debugRecord];
assert.equal(verifyUatInventory(uat(candidate), products, version).candidate_commit, commit);
const macRecords = ['macos-x64', 'macos-arm64'].map(target => ({
  name: `DataSecure-Privacy-Preflight-${target}-v${version}.zip`,
  bytes: 10, sha256: digest(Buffer.from(target)), source_commit: commit
}));
assert.equal(verifyUatInventory(uat(candidate), [...products, ...macRecords], version).platform, 'Windows');
for (const invalidProducts of [
  [...products, products[0]], [...products, {...macRecords[0], source_commit: 'b'.repeat(40)}],
  [...products, {...macRecords[0], name: 'unrelated.zip'}], [...products, null],
  [normalRecord, ...macRecords], [...products, {...macRecords[0], bytes: 0}]
]) assert.throws(() => verifyUatInventory(uat(candidate), invalidProducts, version), /SBOM_UAT_BINDING_INVALID/);
for (const mutate of [
  c => {c.artifacts.pop();},
  c => {c.artifacts[1] = c.artifacts[0];},
  c => {c.candidate_commit = 'b'.repeat(40);},
  c => {c.artifacts[0].sha256 = digest(b);},
  c => {c.artifacts[0].package_verifier.status = 'STATIC_PASS';},
  c => {c.model_gates.candidate_smoke_12x3 = 'PASS';}
]) {
  const changed = structuredClone(candidate); mutate(changed);
  assert.throws(() => verifyUatInventory(uat(changed), products, version), /SBOM_UAT_BINDING_INVALID/);
}
assert.throws(() => verifyUatInventory(uat(candidate), [normalRecord], version), /SBOM_UAT_BINDING_INVALID/);
assert.throws(() => verifyUatInventory(uat(candidate), [{...normalRecord,sha256:digest(b)},debugRecord], version), /SBOM_UAT_BINDING_INVALID/);
console.log('Real ZIP bytes: hash race, static-only proof, metadata drift and incomplete final inventories rejected: PASS');
