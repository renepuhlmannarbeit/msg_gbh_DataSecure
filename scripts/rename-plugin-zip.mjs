// Upload variant of a verified self-contained product ZIP under another plugin
// identifier.
//
// Claude Desktop's personal upload path ("My Uploads") has no documented update
// mechanism; a new ZIP with the same plugin `name` did not replace an existing,
// organisation-locked entry and only landed in the Claude Code store. A ZIP
// whose manifest carries a new `name` is created as a new entry instead. This
// script rewrites exactly that manifest field (plus a display-name suffix) and
// otherwise keeps every byte and archive mode of the verified ZIP.
//
//   node scripts/rename-plugin-zip.mjs --plugin-name data-secure-rc87 [--zip dist/<file>.zip]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeZip, readCentralModes } from './lib/zip.mjs';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const PLUGIN_NAME_RE = /^[a-z][a-z0-9-]{1,63}$/u;

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  if (!process.argv[index + 1]) throw new Error(`RENAME_PLUGIN_ARGUMENT_MISSING:${name}`);
  return process.argv[index + 1];
}

function defaultZip(version) {
  const candidates = fs.readdirSync(dist)
    .filter((name) => /^DataSecure-Privacy-Preflight-(?:windows-x64|macos-x64|macos-arm64)-v[0-9][A-Za-z0-9.-]*\.zip$/u.test(name) && name.endsWith(`-v${version}.zip`))
    .sort();
  if (!candidates.length) throw new Error('RENAME_PLUGIN_ZIP_MISSING');
  return path.join(dist, candidates[0]);
}

function safeEntry(name) {
  const normalized = name.replace(/\\/gu, '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('RENAME_PLUGIN_ZIP_ENTRY_UNSAFE');
  }
  return normalized;
}

export function renamePluginZip(options = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const pluginName = String(options.pluginName || '');
  if (!PLUGIN_NAME_RE.test(pluginName)) throw new Error('RENAME_PLUGIN_NAME_INVALID');
  const zipFile = path.resolve(options.zip || defaultZip(pkg.version));
  if (path.dirname(zipFile) !== dist || !zipFile.endsWith('.zip')) throw new Error('RENAME_PLUGIN_ZIP_PATH_UNSAFE');
  const bytes = fs.readFileSync(zipFile);
  const entries = readZip(bytes);
  const modes = readCentralModes(bytes);
  const manifestBytes = entries.get('.claude-plugin/plugin.json');
  if (!manifestBytes) throw new Error('RENAME_PLUGIN_MANIFEST_MISSING');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.version !== pkg.version) throw new Error('RENAME_PLUGIN_VERSION_MISMATCH');
  if (manifest.name === pluginName) throw new Error('RENAME_PLUGIN_NAME_UNCHANGED');
  const renamed = { ...manifest, name: pluginName, displayName: `${manifest.displayName} (${pluginName})` };

  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-rename-'));
  try {
    const files = [];
    for (const [entryName, data] of entries) {
      const archivePath = safeEntry(entryName);
      if (archivePath.endsWith('/')) continue;
      const fullPath = path.join(stage, ...archivePath.split('/'));
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, archivePath === '.claude-plugin/plugin.json' ? `${JSON.stringify(renamed, null, 2)}\n` : data);
      files.push({ archivePath, fullPath, mode: modes.get(archivePath) ?? 0o100644 });
    }
    files.sort((left, right) => left.archivePath.localeCompare(right.archivePath, 'en'));
    const output = path.join(dist, `${path.basename(zipFile, '.zip')}-${pluginName}.zip`);
    const result = writeZip(output, files);
    // Self-check: same entries and modes, only the manifest differs.
    const written = readZip(fs.readFileSync(output));
    const writtenModes = readCentralModes(fs.readFileSync(output));
    if (written.size !== entries.size) throw new Error('RENAME_PLUGIN_OUTPUT_INVALID');
    for (const [entryName, data] of entries) {
      const name = safeEntry(entryName);
      if (name.endsWith('/')) continue;
      const copy = written.get(entryName);
      if (!copy || writtenModes.get(name) !== (modes.get(name) ?? 0o100644)) throw new Error('RENAME_PLUGIN_OUTPUT_INVALID');
      if (name === '.claude-plugin/plugin.json') {
        if (JSON.parse(copy.toString('utf8')).name !== pluginName) throw new Error('RENAME_PLUGIN_OUTPUT_INVALID');
      } else if (!copy.equals(data)) {
        throw new Error('RENAME_PLUGIN_OUTPUT_INVALID');
      }
    }
    return { output, pluginName, entries: result.entries, bytes: result.bytes, source: path.basename(zipFile) };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = renamePluginZip({ pluginName: option('--plugin-name'), zip: option('--zip') });
  process.stdout.write(`Renamed upload ZIP: ${result.entries} entries, ${result.bytes} bytes, plugin ${result.pluginName} <- ${result.source}\n${result.output}\n`);
}
