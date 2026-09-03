// Release projection of the private marketplace catalogue: every verified
// self-contained product ZIP in dist/ becomes an `archive` plugin source with
// its SHA-256, so a Cowork or Claude Code marketplace can pin the exact build
// instead of relying on the personal upload path, which has no documented
// update mechanism. The download location is deployment-specific and comes
// from DATASECURE_ARCHIVE_BASE_URL (HTTPS); without it a clearly marked
// placeholder is written so the file can never be mistaken for a live catalogue.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const PLACEHOLDER_BASE = 'https://ARTEFAKTSERVER.BEISPIEL.INTERN/datasecure/';
const HEX = /^[a-f0-9]{64}$/u;

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function archiveBaseUrl() {
  const configured = String(process.env.DATASECURE_ARCHIVE_BASE_URL || '').trim();
  if (!configured) return { base: PLACEHOLDER_BASE, placeholder: true };
  let url;
  try { url = new URL(configured); } catch { throw new Error('RELEASE_MARKETPLACE_BASE_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) {
    throw new Error('RELEASE_MARKETPLACE_BASE_URL_INVALID');
  }
  return { base: url.href.endsWith('/') ? url.href : `${url.href}/`, placeholder: false };
}

function checksums() {
  const file = path.join(dist, 'SHA256SUMS');
  const entries = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/u)) {
    const match = /^([a-f0-9]{64})\s+(\S+)$/u.exec(line.trim());
    if (match) entries.set(match[2], match[1]);
  }
  if (!entries.size) throw new Error('RELEASE_MARKETPLACE_CHECKSUMS_MISSING');
  return entries;
}

export function buildReleaseMarketplace() {
  const pkg = readJson(path.join(root, 'package.json'));
  const plugin = readJson(path.join(root, 'plugins', 'data-secure', '.claude-plugin', 'plugin.json'));
  const catalogue = readJson(path.join(root, '.claude-plugin', 'marketplace.json'));
  if (plugin.version !== pkg.version) throw new Error('RELEASE_MARKETPLACE_VERSION_MISMATCH');
  const sums = checksums();
  const { base, placeholder } = archiveBaseUrl();
  const archives = [...sums.keys()].filter((name) => /^DataSecure-Privacy-Preflight-(?:windows-x64|macos-x64|macos-arm64)-v[0-9][A-Za-z0-9.-]*\.zip$/u.test(name) &&
    name.includes(`-v${pkg.version}.zip`)).sort();
  if (!archives.length) throw new Error('RELEASE_MARKETPLACE_ARCHIVE_MISSING');
  const template = catalogue.plugins.find((entry) => entry.name === plugin.name);
  if (!template) throw new Error('RELEASE_MARKETPLACE_PLUGIN_MISSING');
  const plugins = archives.map((archive) => {
    const target = /-(windows-x64|macos-x64|macos-arm64)-v/u.exec(archive)[1];
    const sha256 = sums.get(archive);
    if (!HEX.test(sha256)) throw new Error('RELEASE_MARKETPLACE_CHECKSUM_INVALID');
    return {
      name: `${plugin.name}-${target}`,
      displayName: `${template.displayName} (${target})`,
      description: template.description,
      version: pkg.version,
      author: template.author,
      category: template.category,
      source: { source: 'archive', url: `${base}${archive}`, sha256 }
    };
  });
  const release = {
    $schema: catalogue.$schema,
    name: catalogue.name,
    description: `${catalogue.description} Release-Projektion ${pkg.version}: selbsttragende Zielpakete mit SHA-256-Pinning.`,
    owner: catalogue.owner,
    metadata: {
      generated_by: 'scripts/build-release-marketplace.mjs',
      product_version: pkg.version,
      archive_base_url_is_placeholder: placeholder,
      note: placeholder
        ? 'Platzhalter-URL: vor der Bereitstellung DATASECURE_ARCHIVE_BASE_URL setzen und den Build wiederholen.'
        : 'Ablage-URL aus DATASECURE_ARCHIVE_BASE_URL; Prüfsummen aus dist/SHA256SUMS.'
    },
    plugins
  };
  const output = path.join(dist, 'marketplace.release.json');
  const serialized = `${JSON.stringify(release, null, 2)}\n`;
  fs.writeFileSync(output, serialized, 'utf8');
  const verified = readJson(output);
  if (verified.plugins.length !== archives.length ||
      !verified.plugins.every((entry) => entry.source.source === 'archive' && HEX.test(entry.source.sha256) && entry.source.url.startsWith('https://'))) {
    throw new Error('RELEASE_MARKETPLACE_OUTPUT_INVALID');
  }
  return { output, plugins: plugins.length, placeholder };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildReleaseMarketplace();
  process.stdout.write(`Release marketplace: ${result.plugins} archive source(s) -> ${result.output}${result.placeholder ? ' (Platzhalter-URL)' : ''}\n`);
}
