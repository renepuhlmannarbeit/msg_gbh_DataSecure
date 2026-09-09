import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertBinaryTarget, createTargetOutput, extractArchiveEntry, extractRuntime,
  normalizeRuntimeLicense, readContract, readStandaloneRuntimeContract, readRegular, sha256
} from './lib/bundled-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`BUNDLED_RUNTIME_ARGUMENT_MISSING:${name}`);
  return process.argv[index + 1];
}

const targetId = argument('--target');
const contract = targetId === 'linux-x64-glibc'
  ? readStandaloneRuntimeContract(root)
  : readContract(root);
const target = contract.targets.find((item) => item.id === targetId);
if (!target || target.os !== process.platform || target.arch !== process.arch) throw new Error('BUNDLED_RUNTIME_HOST_MISMATCH');
const archiveFile = path.resolve(argument('--archive'));
const archive = readRegular(archiveFile);
if (path.basename(archiveFile) !== target.archive || sha256(archive) !== target.archive_sha256) throw new Error('BUNDLED_RUNTIME_ARCHIVE_HASH');
const bytes = extractRuntime(archive, target);
const licenseBytes = normalizeRuntimeLicense(extractArchiveEntry(
  archive, target, target.license_path, { minimum: 100, maximum: 2 * 1024 * 1024 }
));
assertBinaryTarget(bytes, target);

const output = createTargetOutput(root, argument('--output'), target.id);
const launcher = path.join(output, target.launcher);
fs.writeFileSync(launcher, bytes, { flag: 'wx', mode: target.os === 'win32' ? 0o600 : 0o700 });
fs.writeFileSync(path.join(output, 'LICENSE.node.txt'), licenseBytes, { flag: 'wx', mode: 0o600 });
const probe = childProcess.spawnSync(launcher, ['-p', 'JSON.stringify({version:process.versions.node,platform:process.platform,arch:process.arch})'], {
  encoding: 'utf8', windowsHide: true, shell: false, env: {}, timeout: 15000, maxBuffer: 64 * 1024
});
let runtimeProbe;
try { runtimeProbe = JSON.parse(probe.stdout); } catch { throw new Error('BUNDLED_RUNTIME_PROBE_FAILED'); }
if (probe.error || probe.status !== 0 || probe.stderr !== '' || runtimeProbe.version !== contract.node_version ||
    runtimeProbe.platform !== target.os || runtimeProbe.arch !== target.arch) throw new Error('BUNDLED_RUNTIME_PROBE_FAILED');
const evidence = {
  schema: 'datasecure-bundled-runtime-target/v1', target: target.id,
  node_version: contract.node_version, archive: target.archive,
  archive_sha256: target.archive_sha256, bytes: bytes.length, sha256: sha256(bytes),
  license_bytes: licenseBytes.length, license_sha256: sha256(licenseBytes), runtime_probe: runtimeProbe
};
fs.writeFileSync(path.join(output, 'runtime-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify(evidence)}\n`);
