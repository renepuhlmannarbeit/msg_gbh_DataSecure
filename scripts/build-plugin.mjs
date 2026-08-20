// Packages plugins/data-secure as an installable Claude plugin ZIP.
//
// The plugin directory is the canonical product: it contains the runtime, the
// PowerShell helpers and the skills. Nothing is substituted at build time, so
// what a marketplace install resolves from the repository is byte-identical to
// what this ZIP contains.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { collectFiles, writeZip } from './lib/zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = path.join(root, 'plugins', 'data-secure');
const dist = path.join(root, 'dist');

const plugin = JSON.parse(fs.readFileSync(path.join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf8'));
const out = path.join(dist, `DataSecure-Privacy-Preflight-v${plugin.version}.zip`);

// Fail closed on a plugin tree that would not start on the user's machine.
const entryPoint = path.join(pluginDir, 'server', 'index.js');
if (!fs.existsSync(entryPoint)) throw new Error('plugin runtime entry point missing');

const entrySource = fs.readFileSync(entryPoint, 'utf8');
if (/require\((['"])(?:\.\.\/){2,}/.test(entrySource)) {
  throw new Error('plugin entry point requires a path outside the plugin root');
}

const mcp = JSON.parse(fs.readFileSync(path.join(pluginDir, '.mcp.json'), 'utf8'));
const arg = mcp?.['data-secure-local']?.args?.[0];
if (arg !== '${CLAUDE_PLUGIN_ROOT}/server/index.js') throw new Error('unexpected MCP entry point');

for (const helper of ['windows-ocr.ps1', 'rasterize-image.ps1']) {
  const file = path.join(pluginDir, 'scripts', helper);
  if (!fs.existsSync(file)) throw new Error(`bundled helper missing: ${helper}`);
  if (fs.readFileSync(file, 'utf8').includes('sync incomplete')) {
    throw new Error(`bundled helper is still a placeholder: ${helper}`);
  }
}

for (const skill of fs.readdirSync(path.join(pluginDir, 'skills'))) {
  const file = path.join(pluginDir, 'skills', skill, 'SKILL.md');
  if (!fs.existsSync(file)) throw new Error(`skill ${skill} has no SKILL.md`);
}

fs.rmSync(out, { force: true });
const files = collectFiles(pluginDir);
const result = writeZip(out, files);
const hash = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');

console.log(`${out}\n  entries=${result.entries} bytes=${result.bytes}\n  sha256=${hash}`);
