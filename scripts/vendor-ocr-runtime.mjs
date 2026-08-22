import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateUniversalRuntime } from './lib/ocr-universal.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
const source = arg('--runtime');
const run = arg('--run');
const commit = arg('--commit');
if (!source || !/^\d+$/u.test(String(run)) || !/^[a-f0-9]{40}$/u.test(String(commit))) {
  throw new Error('Usage: node scripts/vendor-ocr-runtime.mjs --runtime <path> --run <id> --commit <sha>');
}
const evidence = validateUniversalRuntime(source, { releaseEnabled: false });
const destination = path.join(root, 'plugins', 'data-secure', 'server', 'ocr-runtime');
if (fs.existsSync(destination)) throw new Error('VENDORED_OCR_RUNTIME_ALREADY_EXISTS');
fs.cpSync(evidence.root, destination, { recursive: true, errorOnExist: true, force: false });
const copied = validateUniversalRuntime(destination, { releaseEnabled: false });
if (copied.manifestSha256 !== evidence.manifestSha256) throw new Error('VENDORED_OCR_RUNTIME_COPY_MISMATCH');
const provenance = {
  schema: 'data-secure-vendored-ocr-provenance/v1',
  source_workflow_run: Number(run), source_commit: commit,
  bundle_manifest_sha256: copied.manifestSha256,
  files: copied.files, bytes: copied.bytes, release_enabled: false
};
fs.writeFileSync(path.join(root, 'plugins', 'data-secure', 'server', 'ocr-runtime.provenance.json'),
  JSON.stringify(provenance, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(`${JSON.stringify(provenance)}\n`);
