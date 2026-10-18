'use strict';
// The Rust parent supplies both compiler pins after env_clear. Adjacent JSON
// cannot approve new Core bytes, a different artifact or a converter role.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bound = require('./bound-file-io');
const layout = require('../standalone/macos-bundle-layout');
const fail = () => { throw Object.assign(Error('RUNTIME_INTEGRITY_FAILED'), { code: 'RUNTIME_INTEGRITY_FAILED' }); };
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail();
}
module.exports = Object.freeze({ verify(target) {
  try {
    const context = layout.bundleContext(path.resolve(__dirname, '..'));
    const corePin = process.env.DATASECURE_MACOS_STATIC_CORE_SHA256, artifactPin = process.env.DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256;
    if (!context || target !== context.target || !/^[a-f0-9]{64}$/u.test(corePin || '') ||
        !/^[a-f0-9]{64}$/u.test(artifactPin || '') || fs.realpathSync(process.execPath) !== fs.realpathSync(context.core)) fail();
    require('./macos-static-ownership-guard').loadStaticOwnershipGuard({
      schema: 'datasecure-static-ownership-core/1', abi: 1, napi: 8, target, core_sha256: corePin });
    const read = name => JSON.parse(bound.readBoundFile(path.join(context.contents, 'Resources', name),
      { maximum: 128 * 1024, minimum: 1, checkCtime: true }));
    const evidence = read('RUNTIME-EVIDENCE.json'), artifact = read('MACOS-CORE-ARTIFACT.json');
    exact(evidence, ['schema', 'target', 'node_version', 'core', 'converter']);
    exact(evidence.core, ['role', 'bytes', 'sha256', 'artifact_sha256', 'static_binding']);
    exact(evidence.converter, ['role', 'archive_sha256', 'bytes', 'sha256', 'license_sha256']);
    if (evidence.schema !== 'datasecure-standalone-macos-runtime-evidence/2' || evidence.target !== target ||
        evidence.node_version !== '22.23.2' || evidence.core.role !== 'mutating-core' ||
        evidence.converter.role !== 'official-converter' || evidence.core.sha256 !== corePin ||
        evidence.core.artifact_sha256 !== artifactPin || evidence.converter.sha256 === corePin ||
        !Number.isSafeInteger(evidence.core.bytes) || evidence.core.bytes < 64 || evidence.core.bytes > 128 * 1024 * 1024 ||
        crypto.createHash('sha256').update(JSON.stringify(stable(artifact))).digest('hex') !== artifactPin ||
        artifact.schema !== 'datasecure-macos-static-core-artifact/1' || artifact.role !== 'mutating-core' ||
        artifact.target !== target || artifact.core?.sha256 !== corePin || artifact.core?.bytes !== evidence.core.bytes ||
        JSON.stringify(stable(evidence.core.static_binding)) !== JSON.stringify(stable(layout.STATIC_OWNERSHIP_BUILTIN &&
          { name: layout.STATIC_OWNERSHIP_BUILTIN.name, abi: 1, napi: 8 })) ||
        bound.hashBoundFile(context.core, { maximum: 128 * 1024 * 1024, minimum: 64, checkCtime: true }) !== corePin) fail();
    return { checked: true, target, role: 'mutating-core', artifact_sha256: artifactPin };
  } catch { fail(); }
} });
