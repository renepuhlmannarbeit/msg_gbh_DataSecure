import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashRegular, readRegular } from './lib/bundled-runtime.mjs';
import { finalizeMacNativeInventory } from './lib/macos-bundle-native.mjs';
import { loadMacStaticCore, assertMacCoreBundle, macRuntimeEvidence, canonicalBytes } from './lib/macos-core-artifact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const target = argument('--target');
const appArgument = argument('--app');
if (!['macos-x64', 'macos-arm64'].includes(target) || !appArgument) {
  throw new Error('STANDALONE_MACOS_EVIDENCE_ARGUMENT_INVALID');
}

const app = path.resolve(root, appArgument);
if (path.basename(app) !== 'DataSecure Standalone.app' ||
    !fs.lstatSync(app).isDirectory() || fs.lstatSync(app).isSymbolicLink()) {
  throw new Error('STANDALONE_MACOS_EVIDENCE_APP_INVALID');
}
const signedCore = path.join(app, 'Contents', 'MacOS', 'datasecure-core');
const destination = path.join(app, 'Contents', 'Resources', 'RUNTIME-EVIDENCE.json');
const build = loadMacStaticCore(root, target);
if (fs.existsSync(destination)) throw new Error('STANDALONE_MACOS_EVIDENCE_ALREADY_FINALIZED');
assertMacCoreBundle(app, build); // compare to pre-Cargo approval, never adopt new bytes
const stat = fs.lstatSync(signedCore);
if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 128 * 1024 * 1024) {
  throw new Error('STANDALONE_MACOS_EVIDENCE_CORE_INVALID');
}
const evidence = macRuntimeEvidence(build);
if (hashRegular(signedCore, 128 * 1024 * 1024) !== build.artifact.core.sha256) throw new Error('STANDALONE_MACOS_CORE_CHANGED_AFTER_CARGO');
finalizeMacNativeInventory(app, target);
fs.writeFileSync(path.join(app, 'Contents/Resources/MACOS-CORE-ARTIFACT.json'), canonicalBytes(build.artifact), { flag: 'wx', mode: 0o644 });
fs.writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
fs.chmodSync(destination, 0o644);
process.stdout.write(`${JSON.stringify({ ok: true, target, signed_core_bytes: stat.size,
  source_differs_after_signing: false, artifact_sha256: build.artifactSha256 })}\n`);
