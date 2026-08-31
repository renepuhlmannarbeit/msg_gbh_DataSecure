// Build/source consistency only, not a signature, binary attestation or runtime
// immutability guarantee. Reconstruct inputs locally; never trust a supplied list.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createSeaSourceEvidence, readSeaFile, seaHash, seaTreeInventory } from './sea-source-evidence.mjs';

export function launcherSeaConfig() {
  return { main: 'bootstrap.cjs', output: 'sea-prep.blob',
    disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false,
    execArgv: ['--no-warnings', '--max-old-space-size=512'], execArgvExtension: 'none' };
}

export function prepareLauncherProvenance(repositoryRoot, targetId, parserRole = null) {
  const root = path.resolve(repositoryRoot);
  const contractFile = path.join(root, 'native/sea/launcher-contract.json');
  const contractBytes = readSeaFile(contractFile, 65536);
  const contract = JSON.parse(contractBytes);
  const target = contract.targets?.find(item => item.id === targetId);
  if (contract.schema !== 'datasecure-sea-launcher-contract/v1' || contract.release_enabled !== false || !target) {
    throw new Error('SEA_PARENT_CONTRACT_INVALID');
  }
  // Callers derive non-null roles via loadParserRole, not from the build sidecar.
  if (parserRole !== null && (parserRole.schema !== 'datasecure-sea-parser-role/v1' ||
      parserRole.target !== targetId || parserRole.node_version !== contract.node_version)) {
    throw new Error('SEA_PARENT_ROLE_INVALID');
  }
  const templateBytes = readSeaFile(path.join(root, 'native/sea/bootstrap.cjs'), 1024 * 1024);
  const template = templateBytes.toString('utf8');
  for (const marker of ['__DATASECURE_TARGET__', '__DATASECURE_NODE_VERSION__', '__DATASECURE_PARSER_ROLE_JSON__']) {
    if (template.split(marker).length !== 2) throw new Error('SEA_PARENT_BOOTSTRAP_MARKER_INVALID');
  }
  const role = parserRole === null ? null : structuredClone(parserRole);
  const bootstrap = template.replace('__DATASECURE_TARGET__', targetId)
    .replace('__DATASECURE_NODE_VERSION__', contract.node_version)
    .replace("'__DATASECURE_PARSER_ROLE_JSON__'", JSON.stringify(JSON.stringify(role)));
  if (/__DATASECURE_(?:TARGET|NODE_VERSION|PARSER_ROLE_JSON)__/.test(bootstrap)) throw new Error('SEA_PARENT_BOOTSTRAP_MARKER_INVALID');
  const config = launcherSeaConfig();
  const toolchain = ['package.json', 'package-lock.json', 'scripts/build-sea-launcher.mjs',
    'scripts/lib/sea-launcher-provenance.mjs', 'scripts/lib/sea-source-evidence.mjs',
    'scripts/lib/sea-parser-bundle.mjs'].map(relative => {
    const bytes = readSeaFile(path.join(root, relative));
    return { path: relative, bytes: bytes.length, sha256: seaHash(bytes) };
  });
  const postjectRoot = path.join(root, 'node_modules/postject');
  const postjectFiles = seaTreeInventory(postjectRoot);
  const postjectBytes = readSeaFile(path.join(postjectRoot, 'package.json'), 65536);
  const postjectPackage = JSON.parse(postjectBytes);
  if (postjectPackage.version !== contract.postject_version ||
      postjectFiles.find(file => file.path === 'package.json')?.sha256 !== seaHash(postjectBytes) ||
      !postjectFiles.some(file => file.path === 'dist/cli.js')) throw new Error('SEA_PARENT_POSTJECT_INVALID');
  toolchain.push(...postjectFiles.map(file => ({ ...file, path: 'node_modules/postject/' + file.path })));
  // Pinned Postject currently executes Commander outside its own package. Keep
  // this small dependency contract closed; new dependencies require review.
  assert.deepStrictEqual(postjectPackage.dependencies, { commander: '^9.4.0' });
  const commanderRoot = path.join(root, 'node_modules/commander');
  const commanderFile = path.join(commanderRoot, 'package.json');
  if (createRequire(path.join(postjectRoot, 'dist/cli.js')).resolve('commander') !== path.join(commanderRoot, 'index.js')) {
    throw new Error('SEA_PARENT_TOOL_DEPENDENCY_INVALID');
  }
  const commanderFiles = seaTreeInventory(commanderRoot);
  const commanderBytes = readSeaFile(commanderFile, 65536);
  const commander = JSON.parse(commanderBytes);
  if (commanderFiles.find(file => file.path === 'package.json')?.sha256 !== seaHash(commanderBytes) ||
      Object.keys(commander.dependencies || {}).length || Object.keys(commander.optionalDependencies || {}).length ||
      Object.keys(postjectPackage.optionalDependencies || {}).length) throw new Error('SEA_PARENT_TOOL_DEPENDENCY_INVALID');
  toolchain.push(...commanderFiles.map(file => ({ ...file, path: 'node_modules/commander/' + file.path })));
  toolchain.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const source = createSeaSourceEvidence(path.join(root, 'plugins/data-secure'), contractFile,
    path.join(root, 'native/sea/datasecure-mcp'));
  if (source.launcher_contract_sha256 !== seaHash(contractBytes)) throw new Error('SEA_FILE_CHANGED');
  return { bootstrap, config, postjectVersion: contract.postject_version, archiveSha256: target.archive_sha256,
    provenance: { schema: 'datasecure-sea-launcher-provenance/v1', target: targetId,
      node_version: contract.node_version, parser_role: role, source_evidence: source,
      bootstrap_template_sha256: seaHash(templateBytes), bootstrap_sha256: seaHash(Buffer.from(bootstrap)),
      config: structuredClone(config), toolchain } };
}

export function assertLauncherProvenance(actual, expectedProvenance) {
  try { assert.deepStrictEqual(actual, expectedProvenance); }
  catch { throw new Error('SEA_PARENT_PROVENANCE_MISMATCH'); }
}

export function assertLauncherBuildEvidence(build, binaryBuffer, prepared) {
  const provenance = prepared.provenance;
  // The input Node digest is a builder claim, not independently extractable from
  // an injected executable. Role builds separately verify the official archive.
  if (!Buffer.isBuffer(binaryBuffer) || typeof build?.node_source?.binary_sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(build.node_source.binary_sha256)) {
    throw new Error('SEA_PARENT_BUILD_EVIDENCE_MISMATCH');
  }
  const expected = { schema: 'datasecure-sea-build-evidence/v2', release_enabled: false,
    target: provenance.target, node_version: provenance.node_version, postject_version: prepared.postjectVersion,
    bytes: binaryBuffer.length, sha256: seaHash(binaryBuffer), runtime_probe: {
      schema: 'datasecure-sea-runtime-probe/v1', target: provenance.target, node_version: provenance.node_version, sea: true
    }, parser_role_sha256: provenance.parser_role === null ? null : seaHash(Buffer.from(JSON.stringify(provenance.parser_role))),
    node_source: { binary_sha256: build.node_source.binary_sha256,
      archive_sha256: provenance.parser_role === null ? null : prepared.archiveSha256 },
    parent_provenance: provenance };
  try { assert.deepStrictEqual(build, expected); }
  catch { throw new Error('SEA_PARENT_BUILD_EVIDENCE_MISMATCH'); }
}
