// Local reproducible source binding, not binary signing or host attestation.
import path from 'node:path';
import assert from 'node:assert/strict';
import { builtinModules } from 'node:module';
import { build } from 'esbuild';
import { readSeaFile, seaHash } from './sea-source-evidence.mjs';

export function parserSeaConfig() {
  return { main: 'parser.cjs', output: 'parser.blob', disableExperimentalSEAWarning: true,
    useSnapshot: false, useCodeCache: false,
    execArgv: ['--no-warnings', '--permission', '--disable-proto=throw', '--max-old-space-size=384'], execArgvExtension: 'none' };
}

export function parserToolchainEvidence(root) {
  return ['package.json', 'package-lock.json', 'scripts/build-sea-parser.mjs',
    'scripts/lib/sea-parser-bundle.mjs', 'scripts/lib/sea-source-evidence.mjs',
    'node_modules/esbuild/package.json', 'node_modules/postject/package.json'].map(file =>
    ({ path: file, sha256: seaHash(readSeaFile(path.join(root, file))) }));
}

export async function bundleSeaParser(root, target, nodeVersion) {
  if (!/^[a-z]+-[a-z0-9]+$/.test(target) || !/^\d+\.\d+\.\d+$/.test(nodeVersion)) throw new Error('SEA_PARSER_TARGET_INVALID');
  const inputHashes = new Map();
  const result = await build({ absWorkingDir: root, entryPoints: ['native/sea/parser-bootstrap.cjs'], bundle: true,
    write: false, platform: 'node', format: 'cjs', target: 'node22', metafile: true, legalComments: 'inline',
    plugins: [{ name: 'verified-source-bytes', setup(builder) {
      builder.onLoad({ filter: /\.(?:c?js|json)$/ }, args => {
        const relative = path.relative(root, args.path).split(path.sep).join('/');
        if (!relative.startsWith('native/sea/') && !relative.startsWith('plugins/data-secure/server/')) throw new Error('SEA_PARSER_BUNDLE_INPUT_INVALID');
        const contents = readSeaFile(args.path);
        inputHashes.set(relative, seaHash(contents));
        return { contents, loader: relative.endsWith('.json') ? 'json' : 'js' };
      });
    } }] });
  const inputs = Object.keys(result.metafile.inputs).sort().map(file => {
    if (!inputHashes.has(file)) throw new Error('SEA_PARSER_SOURCE_EVIDENCE_MISSING');
    return { path: file, sha256: inputHashes.get(file) };
  });
  if (!inputs.length) throw new Error('SEA_PARSER_SOURCE_EVIDENCE_MISSING');
  for (const output of Object.values(result.metafile.outputs)) for (const imported of output.imports) {
    if (!imported.external || !(builtinModules.includes(imported.path) || builtinModules.includes(imported.path.replace(/^node:/, '')))) throw new Error('SEA_PARSER_BUNDLE_EXTERNAL_INVALID');
  }
  let source = result.outputFiles[0].text;
  for (const [marker, value] of [['__DATASECURE_TARGET__', target], ['__DATASECURE_NODE_VERSION__', nodeVersion]]) {
    if (source.split(marker).length !== 2) throw new Error('SEA_PARSER_MARKER_INVALID');
    source = source.replace(marker, value);
  }
  return { source, inputs, bundle_sha256: seaHash(Buffer.from(source)) };
}

export function assertParserProvenance(evidence, bundle, toolchain) {
  // The expected complete closure is rebuilt independently, never selected by
  // the supplied inventory. Equality also rejects empty, duplicate/extra rows.
  try {
    if (!bundle.inputs.length || !toolchain.length) throw new Error();
    assert.deepEqual(evidence.inputs, bundle.inputs);
    assert.equal(evidence.bundle_sha256, bundle.bundle_sha256);
    assert.deepEqual(evidence.toolchain, toolchain);
    assert.deepEqual(evidence.config, parserSeaConfig());
  } catch { throw new Error('SEA_PARSER_PROVENANCE_MISMATCH'); }
}

// Used by the parent builder BEFORE embedding a role. The caller cannot choose
// which source rows are verified; reconstruct the complete current closure.
export async function loadParserRole(root, directory, target, contract) {
  const evidence = JSON.parse(readSeaFile(path.join(directory, 'parser-build.json'), 1024 * 1024));
  const executable = path.join(directory, target.os === 'win32' ? 'datasecure-parser.exe' : 'datasecure-parser');
  const bytes = readSeaFile(executable, 128 * 1024 * 1024);
  assert.equal(evidence.schema, 'datasecure-sea-parser-build/v1');
  assert.equal(evidence.release_enabled, false); assert.equal(evidence.role, 'parser');
  assert.equal(evidence.target, target.id); assert.equal(evidence.node_version, contract.node_version);
  assert.equal(evidence.archive_sha256, target.archive_sha256);
  assert.equal(evidence.launcher_contract_sha256, seaHash(readSeaFile(path.join(root, 'native/sea/launcher-contract.json'))));
  assert.equal(evidence.bytes, bytes.length); assert.equal(evidence.sha256, seaHash(bytes));
  const bundle = await bundleSeaParser(root, target.id, contract.node_version);
  assertParserProvenance(evidence, bundle, parserToolchainEvidence(root));
  return { schema: 'datasecure-sea-parser-role/v1', target: target.id, node_version: contract.node_version,
    bytes: bytes.length, sha256: evidence.sha256,
    server_files: bundle.inputs.filter(file => file.path.startsWith('plugins/data-secure/server/'))
      .map(file => ({ path: file.path.slice('plugins/data-secure/server/'.length), sha256: file.sha256 })) };
}
