import assert from 'node:assert/strict';
import path from 'node:path';
import { bundleSeaParser, parserToolchainEvidence, parserSeaConfig, assertParserProvenance } from '../scripts/lib/sea-parser-bundle.mjs';

const root = path.resolve(import.meta.dirname, '..');
const bundle = await bundleSeaParser(root, 'windows-x64', '22.23.2');
const toolchain = parserToolchainEvidence(root);
const evidence = { inputs: bundle.inputs, bundle_sha256: bundle.bundle_sha256, toolchain, config: parserSeaConfig() };
assertParserProvenance(evidence, bundle, toolchain);
assert.ok(bundle.inputs.some(input => input.path.endsWith('/parser-worker.js')));
assert.ok(bundle.inputs.some(input => input.path.endsWith('/network-deny.cjs')));
assert.ok(bundle.inputs.some(input => input.path.endsWith('/document-parser.js')));
assert.ok(bundle.inputs.some(input => input.path.endsWith('/parser-probe.cjs')));
const rebuilt = await bundleSeaParser(root, 'windows-x64', '22.23.2');
assert.deepEqual(rebuilt, bundle);
console.log('SEA parser provenance: complete real closure and deterministic rebundle PASS');
let cases = 2;
for (const mutate of [
  value => { value.inputs = []; },
  value => { value.inputs.pop(); },
  value => { value.inputs.push(value.inputs[0]); },
  value => { value.inputs[0].sha256 = '0'.repeat(64); },
  value => { value.inputs[0].path = '../../unexpected'; },
  value => { value.inputs[0].extra = true; },
  value => { value.bundle_sha256 = '0'.repeat(64); },
  value => { value.toolchain = []; },
  value => { value.toolchain[0].sha256 = '0'.repeat(64); },
  value => { value.config.execArgv.push('--allow-fs-write=*'); },
  value => { value.config.execArgvExtension = 'env'; }
]) {
  const changed = structuredClone(evidence); mutate(changed);
  assert.throws(() => assertParserProvenance(changed, bundle, toolchain), /SEA_PARSER_PROVENANCE_MISMATCH/);
  cases++;
}
console.log(`SEA parser provenance: ${cases} passed, 0 failed (no host release evidence)`);
