// Static packaging boundary only. Never imports a credential adapter, starts a
// product job, or opens the native credential store. A passing scan does not
// prove OS keyring isolation or unchanged-product acceptance.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSuite } = require('./helpers.js');
const { readZip } = require('../plugins/data-secure/server/zip-reader.js');
const { test, done, assert } = createSuite('Engineering keyring product/packaging boundary');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterName = 'engineering-keyring-session';
const engineeringService = 'de.msg.datasecure.engineering.private-artifacts.v1';
const engineeringFactory = 'createEngineeringKeyringSession';

// Text documentation can explain the engineering boundary. Executable files
// inside docs/ are still scanned, as are launch configuration and native files.
const inspectedExtensions = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.yaml', '.yml',
  '.ps1', '.psm1', '.psd1', '.py', '.sh', '.bash', '.zsh', '.bat', '.cmd',
  '.html', '.htm', '.c', '.cc', '.cpp', '.h', '.hpp', '.rs',
  '.node', '.exe', '.dll', '.so', '.dylib', '.wasm'
]);

function checkEntries(entries, label) {
  for (const [entryName, bytes] of entries) {
    const normalized = entryName.replaceAll('\\', '/');
    const extension = path.posix.extname(normalized).toLowerCase();
    const inspected = inspectedExtensions.has(extension) || extension === '';
    if (!inspected) continue;
    assert.ok(!normalized.toLowerCase().includes(adapterName),
      `${label}: engineering adapter file in product: ${normalized}`);
    const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    for (const marker of [adapterName, engineeringService, engineeringFactory]) {
      // UTF-16 additionally covers PowerShell/configuration and Windows native
      // constants. This is a known-marker regression gate, not a JS analyser.
      assert.ok(!content.includes(Buffer.from(marker, 'utf8')) &&
        !content.includes(Buffer.from(marker, 'utf16le')),
      `${label}: engineering keyring reference in executable/configuration: ${normalized}`);
    }
  }
}

function collectSource(directory, prefix = '') {
  const entries = new Map();
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    assert.ok(!fs.lstatSync(full).isSymbolicLink(), `product tree link: ${relative}`);
    if (item.isDirectory()) {
      for (const [name, bytes] of collectSource(full, relative)) entries.set(name, bytes);
    } else {
      assert.ok(item.isFile(), `non-regular product entry: ${relative}`);
      entries.set(relative, fs.readFileSync(full));
    }
  }
  return entries;
}

function fixture(name, source) {
  return new Map([[name, Buffer.isBuffer(source) ? source : Buffer.from(source)]]);
}

test('arguments are explicit and do not enable any native keyring operation', () => {
  assert.ok(process.argv.slice(2).every((arg) => arg === '--archives'), 'unknown option');
});

test('the complete plugin source tree contains no engineering credential adapter', () => {
  const entries = collectSource(path.join(root, 'plugins', 'data-secure'));
  assert.ok(entries.has('server/index.js'), 'product source entry point missing');
  checkEntries(entries, 'plugin source');
});

test('packaging scripts and desktop launch manifest do not reference the adapter', () => {
  const entries = new Map(['scripts/build-plugin.mjs', 'scripts/build-mcpb.mjs',
    'scripts/build-sea-plugin.mjs', 'scripts/build-sea-launcher.mjs', 'manifest.json']
    .map((name) => [name, fs.readFileSync(path.join(root, name))]));
  checkEntries(entries, 'packaging sources');
});

test('the archived credential adapter keeps its old namespace without enabling it in product', () => {
  const source = fs.readFileSync(path.join(root,
    'plugins/data-secure/server/gateway/installation-secret-store.js'), 'utf8');
  assert.match(source, /const SERVICE_NAME = 'de\.msg\.datasecure\.private-artifacts\.v1';/u);
  assert.match(source, /const ACCOUNT_NAME = 'installation-key-v1';/u);
  assert.match(source, /new native\.Entry\(SERVICE_NAME, ACCOUNT_NAME\)/u);
  checkEntries(fixture('server/gateway/installation-secret-store.js', source), 'legacy adapter source');
});

const rejectedFixtures = [
  ['copied adapter filename', `server/${adapterName}.mjs`, 'export const value = 1;'],
  ['Windows-style copied adapter path', `server\\${adapterName}.cjs`, 'module.exports = {};'],
  ['CommonJS import', 'server/index.js', `require('../../scripts/lib/${adapterName}.mjs');`],
  ['ESM import', 'server/entry.mjs', `import { ${engineeringFactory} } from './renamed.mjs';`],
  ['dynamic import', 'server/index.js', `import('../../scripts/lib/${adapterName}.mjs');`],
  ['renamed adapter service constant', 'server/innocent.js', `const service = '${engineeringService}';`],
  ['renamed adapter factory', 'server/innocent.js', `export function ${engineeringFactory}() {}`],
  ['launch configuration reference', '.mcp.json', JSON.stringify({ command: `node ${adapterName}.mjs` })],
  ['executable hidden under docs', 'docs/guide.mjs', `import '${adapterName}';`],
  ['inline HTML executable', 'server/status.html', `<script>const service = '${engineeringService}';</script>`],
  ['UTF-16 PowerShell reference', 'scripts/helper.ps1', Buffer.from(`$service = '${engineeringService}'`, 'utf16le')],
  ['native constant', 'server/helper.exe', Buffer.concat([Buffer.from([0x4d, 0x5a, 0]), Buffer.from(engineeringService)])]
];
for (const [label, name, source] of rejectedFixtures) {
  test(`rejects ${label} in both source and archive-entry inspection`, () => {
    assert.throws(() => checkEntries(fixture(name, source), 'negative fixture'),
      /engineering (?:adapter file|keyring reference)/u);
  });
}

test('ordinary documentation may mention module, factory and namespace', () => {
  for (const name of ['docs/canonical/DECISIONS.md', `docs/${adapterName}.md`,
    'skills/example/SKILL.md', 'README.txt']) {
    assert.doesNotThrow(() => checkEntries(fixture(name,
      `${adapterName}.mjs / ${engineeringFactory} / ${engineeringService}`), 'documentation'));
  }
});

test('ordinary production credential references remain allowed', () => {
  assert.doesNotThrow(() => checkEntries(fixture('server/keyring.js',
    "new Entry('de.msg.datasecure.private-artifacts.v1', 'installation-key-v1');"), 'positive control'));
});

if (process.argv.includes('--archives')) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const archive of [`DataSecure-Privacy-Preflight-v${pkg.version}.zip`,
    `DataSecure-Privacy-Gateway-v${pkg.version}.mcpb`]) {
    test(`the current ${path.extname(archive)} contains no executable engineering adapter`, () => {
      const entries = readZip(fs.readFileSync(path.join(root, 'dist', archive)));
      assert.ok(entries.has('server/index.js'), 'archive product entry point missing');
      checkEntries(entries, archive);
    });
  }
} else {
  console.log('  info archive checks not requested; use --archives after building the current version');
}

done();
