// Git-marketplace projection of one verified self-contained product ZIP.
//
// Cowork and Claude Code can add a private Git repository as a plugin
// marketplace and update it through its marketplace update action. Host UI and
// organizational policy remain separate acceptance gates, not build promises.
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
import { readCentralModes } from './lib/zip.mjs';
import { verifyProductSourceEntries, verifyKeyringFreeProductEntries, verifyProductRelativeRequires,
  verifyBundledProductMcp, verifyBundledProductRuntimeLicense } from './lib/product-files.mjs';
import { readContract, sha256 } from './lib/bundled-runtime.mjs';

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

export function defaultZip(version) {
  const host = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64'
    : process.platform === 'darwin' && process.arch === 'x64' ? 'macos-x64'
      : process.platform === 'darwin' && process.arch === 'arm64' ? 'macos-arm64' : null;
  if (!host) throw new Error('MARKETPLACE_REPO_EXPLICIT_ZIP_REQUIRED');
  const archive = path.join(dist, `DataSecure-Privacy-Preflight-${host}-v${version}.zip`);
  if (!fs.existsSync(archive)) throw new Error('MARKETPLACE_REPO_ZIP_MISSING');
  return archive;
}

function safeRelative(entryName) {
  const normalized = entryName.replace(/\\/gu, '/');
  if (!normalized || /[:\x00-\x1f]/u.test(normalized) || normalized.startsWith('/') || normalized.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('MARKETPLACE_REPO_ZIP_ENTRY_UNSAFE');
  }
  return normalized;
}

// Only disposable direct children of dist may be replaced; never traverse a
// link or erase a Git checkout hidden inside a generated projection.
function validateOutputTree(output) {
  if (path.dirname(output) !== dist || fs.lstatSync(dist).isSymbolicLink()) throw new Error('MARKETPLACE_REPO_OUTPUT_UNSAFE');
  let outputStat;
  try { outputStat = fs.lstatSync(output); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  const visit = (file) => {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || path.basename(file) === '.git') throw new Error('MARKETPLACE_REPO_OUTPUT_UNSAFE');
    if (stat.isDirectory()) for (const child of fs.readdirSync(file)) visit(path.join(file, child));
    else if (!stat.isFile()) throw new Error('MARKETPLACE_REPO_OUTPUT_UNSAFE');
  };
  if (outputStat.isSymbolicLink() || !outputStat.isDirectory()) throw new Error('MARKETPLACE_REPO_OUTPUT_UNSAFE');
  visit(output);
}

export function buildMarketplaceRepo(options = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const catalogue = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const zipFile = path.resolve(options.zip || defaultZip(pkg.version));
  if (path.dirname(zipFile) !== dist) throw new Error('MARKETPLACE_REPO_ZIP_PATH_UNSAFE');
  const pluginName = String(options.pluginName || 'data-secure');
  if (!PLUGIN_NAME_RE.test(pluginName)) throw new Error('MARKETPLACE_REPO_PLUGIN_NAME_INVALID');
  const output = path.resolve(options.output || path.join(dist, 'marketplace-repo'));
  if (path.dirname(output) !== dist) throw new Error('MARKETPLACE_REPO_OUTPUT_UNSAFE');
  const target = /-(windows-x64|macos-x64|macos-arm64)-v/u.exec(path.basename(zipFile))?.[1] || 'unknown';
  const archiveBytes = fs.readFileSync(zipFile);
  const entries = readZip(archiveBytes);
  const pluginJsonBytes = entries.get('.claude-plugin/plugin.json');
  if (!pluginJsonBytes) throw new Error('MARKETPLACE_REPO_PLUGIN_MANIFEST_MISSING');
  const plugin = JSON.parse(pluginJsonBytes.toString('utf8'));
  if (plugin.version !== pkg.version) throw new Error('MARKETPLACE_REPO_VERSION_MISMATCH');

  // Reject stale/foreign archives before replacing any prior projection.
  verifyProductSourceEntries(entries, path.join(root, 'plugins', 'data-secure'), { targets: [target] });
  verifyKeyringFreeProductEntries(entries);
  verifyProductRelativeRequires(entries);
  const contract = readContract(root);
  const evidence = JSON.parse(entries.get('RUNTIME-EVIDENCE.json') || 'null');
  const runtime = evidence?.targets?.[0];
  if (target === 'unknown' || evidence?.schema !== 'datasecure-bundled-plugin/v1' ||
      evidence.mode !== 'direct-upload-target' || evidence.product_version !== pkg.version ||
      !Array.isArray(evidence.targets) || evidence.targets.length !== 1 || runtime?.target !== target ||
      evidence.plugin_command !== contract.plugin_command || evidence.host_node_required !== false ||
      evidence.runtime_dependency_install !== false || !/^[a-f0-9]{40}$/u.test(evidence.source_commit || '')) throw new Error('MARKETPLACE_REPO_EVIDENCE_INVALID');
  verifyBundledProductRuntimeLicense(entries, evidence, { errorCode: 'MARKETPLACE_REPO_RUNTIME_LICENSE_INVALID' });
  const runtimeName = target === 'windows-x64' ? 'runtime/datasecure-node.exe' : `runtime/targets/${target}/node`;
  const runtimeBytes = entries.get(runtimeName);
  if (!runtimeBytes || runtime.bytes !== runtimeBytes.length || runtime.sha256 !== sha256(runtimeBytes)) {
    throw new Error('MARKETPLACE_REPO_RUNTIME_INVALID');
  }
  verifyBundledProductMcp(entries, path.join(root, 'plugins', 'data-secure'), contract,
    { errorCode: 'MARKETPLACE_REPO_MCP_INVALID' });
  const modes = readCentralModes(archiveBytes);
  for (const name of entries.keys()) {
    safeRelative(name);
    if (![0o100644, 0o100755].includes(modes.get(name))) throw new Error('MARKETPLACE_REPO_MODE_INVALID');
  }
  if (target.startsWith('macos-') && (modes.get(runtimeName) !== 0o100755 || modes.get('runtime/datasecure-node') !== 0o100755)) {
    throw new Error('MARKETPLACE_REPO_MODE_INVALID');
  }
  // Windows Git cannot infer POSIX execute bits from its filesystem. Do not
  // silently produce a non-executable Mac Marketplace; project it on POSIX.
  if (target.startsWith('macos-') && process.platform === 'win32') throw new Error('MARKETPLACE_REPO_POSIX_HOST_REQUIRED');
  validateOutputTree(output);

  fs.rmSync(output, { recursive: true, force: true });
  const pluginRoot = path.join(output, 'plugins', pluginName);
  fs.mkdirSync(pluginRoot, { recursive: true });
  let written = 0;
  for (const [entryName, bytes] of entries) {
    const relative = safeRelative(entryName);
    const file = path.join(pluginRoot, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (relative === '.claude-plugin/plugin.json') {
      const renamed = { ...plugin, name: pluginName };
      if (pluginName !== plugin.name) renamed.displayName = `${plugin.displayName} (${pluginName})`;
      fs.writeFileSync(file, `${JSON.stringify(renamed, null, 2)}\n`);
    } else {
      fs.writeFileSync(file, bytes);
    }
    if (process.platform !== 'win32') fs.chmodSync(file, modes.get(entryName) & 0o777);
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
  const projectionEvidence = {
    schema: 'datasecure-marketplace-projection/v1', product_version: pkg.version,
    archive: path.basename(zipFile), archive_sha256: sha256(archiveBytes), target,
    source_bytes_verified: true, native_execution_verified: false,
    executables: [...modes].filter(([, mode]) => mode === 0o100755).map(([name]) => `plugins/${pluginName}/${name}`).sort()
  };
  fs.writeFileSync(path.join(output, 'PROJECTION-EVIDENCE.json'), `${JSON.stringify(projectionEvidence, null, 2)}\n`);
  fs.writeFileSync(path.join(output, 'README.md'), [
    `# GBH DataSecure – Marketplace-Release ${pkg.version} (${target})`,
    '',
    'Automatisch erzeugte, bytegeprüfte Projektion des selbsttragenden Plugin-ZIPs. Kein eigener nativer Ausführungsnachweis.',
    `Quelle: \`${path.basename(zipFile)}\`. Manuelle Änderungen werden beim nächsten Build überschrieben.`,
    '',
    `Plugin-Kennung: \`${pluginName}\`${pluginName !== plugin.name ? ` (abweichend von der Produktkennung \`${plugin.name}\`, für Test-/UAT-Installationen)` : ''}.`,
    '',
    'In Claude Desktop: Einstellungen → Anpassen → Plugins → Hinzufügen → Marketplace aus Git-Repository;',
    'Updates über den „Update“-Knopf des Marketplace. Details: docs/RELEASE.md im Quell-Repository.',
    'Vor Veröffentlichung: Zielhost-Smoke aus genau diesem ZIP und bei macOS die Execute-Bits im Git-Index prüfen (PROJECTION-EVIDENCE.json).',
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
  for (const [name, bytes] of entries) {
    const destination = path.join(pluginRoot, ...name.split('/'));
    const expectedBytes = name === '.claude-plugin/plugin.json'
      ? Buffer.from(`${JSON.stringify({ ...plugin, name: pluginName, ...(pluginName !== plugin.name ? {displayName: `${plugin.displayName} (${pluginName})`} : {}) }, null, 2)}\n`)
      : bytes;
    if (!fs.readFileSync(destination).equals(expectedBytes)) throw new Error('MARKETPLACE_REPO_OUTPUT_DRIFT');
    if (process.platform !== 'win32' && (fs.statSync(destination).mode & 0o777) !== (modes.get(name) & 0o777)) throw new Error('MARKETPLACE_REPO_MODE_DRIFT');
  }
  return { output, pluginName, files: files.length, zip: path.basename(zipFile), target, archive_sha256: projectionEvidence.archive_sha256 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildMarketplaceRepo({ zip: option('--zip'), pluginName: option('--plugin-name'), output: option('--output') });
  process.stdout.write(`Marketplace repo: ${result.files} files from ${result.zip} -> ${result.output} (plugin ${result.pluginName}, ${result.target})\n`);
}
