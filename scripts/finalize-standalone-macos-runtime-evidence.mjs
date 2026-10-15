import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashRegular, readRegular } from './lib/bundled-runtime.mjs';

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
const source = path.join(root, 'dist', target, 'runtime-evidence.json');
const sourceEvidence = JSON.parse(readRegular(source, 64 * 1024).toString('utf8'));
if (sourceEvidence.target !== target || !/^[a-f0-9]{64}$/u.test(sourceEvidence.sha256) ||
    sourceEvidence.bytes < 1) {
  throw new Error('STANDALONE_MACOS_EVIDENCE_SOURCE_INVALID');
}
const stat = fs.lstatSync(signedCore);
if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 128 * 1024 * 1024) {
  throw new Error('STANDALONE_MACOS_EVIDENCE_CORE_INVALID');
}
const evidence = {
  schema: 'datasecure-standalone-runtime-evidence/1',
  targets: [{ target, bytes: stat.size, sha256: hashRegular(signedCore, 128 * 1024 * 1024),
    source_sha256: sourceEvidence.sha256, node_version: sourceEvidence.node_version }]
};
fs.writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
fs.chmodSync(destination, 0o644);
process.stdout.write(`${JSON.stringify({ ok: true, target, signed_core_bytes: stat.size,
  source_differs_after_signing: evidence.targets[0].sha256 !== sourceEvidence.sha256 })}\n`);
