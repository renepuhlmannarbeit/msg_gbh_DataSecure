// Packages the standalone Claude Desktop extension (.mcpb).
//
// The MCPB is derived from the plugin tree: the runtime under
// plugins/data-secure/server is copied to the server/ position that
// manifest.json declares as entry point, so both artefacts always ship the same
// code.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { collectFiles, writeZip } from './lib/zip.mjs';
import { verifyNativeArtifact } from './lib/native-artifact.mjs';
import { verifyPosixSupervisorArtifacts } from './lib/posix-supervisor-artifacts.mjs';
import { verifyKeyringArtifacts } from './lib/keyring-artifacts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = path.join(root, 'plugins', 'data-secure');
const dist = path.join(root, 'dist');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const out = path.join(dist, `DataSecure-Privacy-Gateway-v${manifest.version}.mcpb`);
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'eu-privacy-mcpb-'));

// Documents that describe the security boundary travel with the extension.
const docs = [
  'manifest.json',
  'README.md',
  'SECURITY.md',
  'LICENSE',
  'ARCHITECTURE_DECISION.md',
  'THIRD_PARTY_NOTICES.md',
  'assets',
  'docs'
];

try {
  for (const rel of docs) {
    const src = path.join(root, rel);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(stage, rel), { recursive: true });
  }

  fs.cpSync(path.join(pluginDir, 'server'), path.join(stage, 'server'), { recursive: true });

  const nativeBin = path.join(pluginDir, 'server', 'native');
  verifyNativeArtifact(
    path.join(nativeBin, 'windows-x64', 'datasecure-sandbox.exe'),
    path.join(nativeBin, 'windows-x64', 'datasecure-sandbox.sha256')
  );
  const posixSupervisors = verifyPosixSupervisorArtifacts(nativeBin);
  verifyKeyringArtifacts(path.join(pluginDir, 'server', 'vendor', 'keyring'));

  fs.mkdirSync(path.join(stage, 'scripts'), { recursive: true });
  for (const helper of ['windows-ocr.ps1', 'rasterize-image.ps1']) {
    const src = path.join(pluginDir, 'scripts', helper);
    if (!fs.existsSync(src)) throw new Error(`bundled helper missing: ${helper}`);
    fs.copyFileSync(src, path.join(stage, 'scripts', helper));
  }

  const entry = path.join(stage, manifest.server.entry_point);
  if (!fs.existsSync(entry)) throw new Error(`manifest entry_point not staged: ${manifest.server.entry_point}`);

  fs.rmSync(out, { force: true });
  const posixExecutableEntries = new Set(posixSupervisors.map((target) => `server/native/${target}/datasecure-sandbox`));
  for (const file of collectFiles(path.join(stage, 'server', 'ocr-runtime'))) {
    if (/^targets\/(?:macos-x64|macos-arm64|linux-x64)\/datasecure-ocr-sandbox$/u.test(file.archivePath)) {
      posixExecutableEntries.add(`server/ocr-runtime/${file.archivePath}`);
    }
  }
  const result = writeZip(out, collectFiles(stage).map((file) => ({
    ...file, mode: posixExecutableEntries.has(file.archivePath) ? 0o100755 : 0o100644
  })));
  const hash = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
  console.log(`${out}\n  entries=${result.entries} bytes=${result.bytes}\n  sha256=${hash}`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
