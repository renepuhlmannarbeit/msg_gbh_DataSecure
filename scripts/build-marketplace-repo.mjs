// Git-marketplace projection of one verified self-contained product ZIP.
//
// Cowork and Claude Code can add a private Git repository as a plugin
// marketplace and update it through the marketplace "Update" action, which is
// the only officially documented update path. The personal file upload has no
// update mechanism and a blocked upload entry cannot be removed by the user.
// This script therefore unpacks the built ZIP into a repository layout:
//
//   <output>/.claude-plugin/marketplace.json   (relative plugin source, version)
//   <output>/plugins/<plugin-name>/…           (the complete ZIP content)
//   <output>/README.md, .gitattributes
//
// `--plugin-name` may deviate from the product name so a new marketplace entry
// is created next to a stuck one (test/UAT use). Everything else in the plugin
// stays byte-identical to the ZIP; only .claude-plugin/plugin.json receives the
// new name and a display-name suffix.
//
//   node scripts/build-marketplace-repo.mjs [--zip dist/<file>.zip]
//        [--plugin-name data-secure-uat] [--output dist/marketplace-repo]

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const PLUGIN_NAME_RE = /^[a-z][a-z0-9-]{1,63}$/u;

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  if (!process.argv[index + 1]) throw new Error(`MARKETPLACE_REPO_ARGUMENT_MISSING:${name}`);
  return process.argv[index + 1];
}

function defaultZip(version) {
  const candidates = fs.readdirSync(dist)
    .filter((name) => /^DataSecure-Privacy-Preflight-(?:windows-x64|macos-x64|macos-arm64)-v[0-9][A-Za-z0-9.-]*\.zip$/u.test(name) && name.includes(`-v${version}.zip`))
    .sort();
  if (!candidates.length) throw new Error('MARKETPLACE_REPO_ZIP_MISSING');
  return path.join(dist, candidates[0]);
}

function safeRelative(entryName) {
  const normalized = entryName.replace(/\\/gu, '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('MARKETPLACE_REPO_ZIP_ENTRY_UNSAFE');
  }
  return normalized;
}

export function buildMarketplaceRepo(options = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const catalogue = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const zipFile = path.resolve(options.zip || defaultZip(pkg.version));
  if (path.dirname(zipFile) !== dist) throw new Error('MARKETPLACE_REPO_ZIP_PATH_UNSAFE');
  const pluginName = String(options.pluginName || 'data-secure');
  if (!PLUGIN_NAME_RE.test(pluginName)) throw new Error('MARKETPLACE_REPO_PLUGIN_NAME_INVALID');
  const output = path.resolve(options.output || path.join(dist, 'marketplace-repo'));
  if (!output.startsWith(`${dist}${path.sep}`) && path.dirname(output) !== dist) throw new Error('MARKETPLACE_REPO_OUTPUT_UNSAFE');
  const target = /-(windows-x64|macos-x64|macos-arm64)-v/u.exec(path.basename(zipFile))?.[1] || 'unknown';

  // rc99 replaced the unsupported single-file archive projection with this
  // self-contained Git repository. Remove the one known legacy build product
  // so a release operator cannot accidentally publish the obsolete contract.
  fs.rmSync(path.join(dist, 'marketplace.release.json'), { force: true });

  const entries = readZip(fs.readFileSync(zipFile));
  const pluginJsonBytes = entries.get('.claude-plugin/plugin.json');
  if (!pluginJsonBytes) throw new Error('MARKETPLACE_REPO_PLUGIN_MANIFEST_MISSING');
  const plugin = JSON.parse(pluginJsonBytes.toString('utf8'));
  if (plugin.version !== pkg.version) throw new Error('MARKETPLACE_REPO_VERSION_MISMATCH');

  fs.rmSync(output, { recursive: true, force: true });
  const pluginRoot = path.join(output, 'plugins', pluginName);
  fs.mkdirSync(pluginRoot, { recursive: true });
  let written = 0;
  for (const [entryName, bytes] of entries) {
    const relative = safeRelative(entryName);
    if (relative.endsWith('/')) continue;
    const file = path.join(pluginRoot, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (relative === '.claude-plugin/plugin.json') {
      const renamed = { ...plugin, name: pluginName };
      if (pluginName !== plugin.name) renamed.displayName = `${plugin.displayName} (${pluginName})`;
      fs.writeFileSync(file, `${JSON.stringify(renamed, null, 2)}\n`);
    } else {
      fs.writeFileSync(file, bytes);
    }
    written++;
  }
  const template = catalogue.plugins.find((entry) => entry.name === plugin.name) || catalogue.plugins[0];
  const marketplace = {
    $schema: catalogue.$schema,
    name: pluginName === plugin.name ? `${catalogue.name}-release` : `${catalogue.name}-${pluginName}`,
    description: `${catalogue.description} Release-Projektion ${pkg.version} (${target}) aus dem verifizierten Produkt-ZIP.`,
    owner: catalogue.owner,
    plugins: [{
      name: pluginName,
      displayName: pluginName !== plugin.name ? `${template.displayName} (${pluginName})` : template.displayName,
      description: template.description,
      version: pkg.version,
      author: template.author,
      category: template.category,
      source: `./plugins/${pluginName}`
    }]
  };
  fs.mkdirSync(path.join(output, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(output, '.claude-plugin', 'marketplace.json'), `${JSON.stringify(marketplace, null, 2)}\n`);
  // No line-ending conversion: the repository content must stay byte-identical
  // to the verified ZIP so checksums and the runtime binary remain valid.
  fs.writeFileSync(path.join(output, '.gitattributes'), '* -text\n');
  fs.writeFileSync(path.join(output, 'README.md'), [
    `# GBH DataSecure – Marketplace-Release ${pkg.version} (${target})`,
    '',
    'Automatisch erzeugte Projektion des verifizierten, selbsttragenden Plugin-ZIPs.',
    `Quelle: \`${path.basename(zipFile)}\`. Manuelle Änderungen werden beim nächsten Build überschrieben.`,
    '',
    `Plugin-Kennung: \`${pluginName}\`${pluginName !== plugin.name ? ` (abweichend von der Produktkennung \`${plugin.name}\`, für Test-/UAT-Installationen)` : ''}.`,
    '',
    'In Claude Desktop: Einstellungen → Anpassen → Plugins → Hinzufügen → Marketplace aus Git-Repository;',
    'Updates über den „Update“-Knopf des Marketplace. Details: docs/RELEASE.md im Quell-Repository.',
    ''
  ].join('\n'));
  // Self-check: the plugin directory must mirror the archive except for the renamed manifest.
  const files = [];
  (function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full); else files.push(path.relative(pluginRoot, full).replace(/\\/gu, '/'));
    }
  })(pluginRoot);
  const expected = [...entries.keys()].map(safeRelative).filter((name) => !name.endsWith('/')).sort();
  if (JSON.stringify(files.sort()) !== JSON.stringify(expected) || written !== expected.length) throw new Error('MARKETPLACE_REPO_OUTPUT_INVALID');
  const mcp = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.mcp.json'), 'utf8'));
  const server = mcp?.mcpServers?.['data-secure-local'];
  if (!server || !String(server.command).includes('${CLAUDE_PLUGIN_ROOT}/runtime/')) throw new Error('MARKETPLACE_REPO_MCP_INVALID');
  return { output, pluginName, files: files.length, zip: path.basename(zipFile), target };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildMarketplaceRepo({ zip: option('--zip'), pluginName: option('--plugin-name'), output: option('--output') });
  process.stdout.write(`Marketplace repo: ${result.files} files from ${result.zip} -> ${result.output} (plugin ${result.pluginName}, ${result.target})\n`);
}
