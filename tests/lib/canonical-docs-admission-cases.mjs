// Full actual canonical validator source with a complete frozen read-only
// filesystem model. No validator algorithm copy, product export or disk mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validator = path.join(root, 'scripts/verify-canonical-docs.mjs');
const source = fs.readFileSync(validator, 'utf8');
const indexFile = path.join(root, 'docs/canonical/DOCUMENT_INDEX.json');
const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
const snapshot = new Map();
const history = index.documents.find(row => row.status === 'historical');
assert.ok(history, 'the complete real baseline must retain historical documents');
assert.equal(typeof vm.SourceTextModule, 'function', 'invoke with --experimental-vm-modules');

function addPhysical(relative) {
  const file = path.resolve(root, relative), within = path.relative(root, file);
  assert.ok(within && within !== '..' && !within.startsWith('..' + path.sep) && !path.isAbsolute(within),
    'fixture materialization reads only this repository');
  if (snapshot.has(file)) return;
  const stat = fs.lstatSync(file);
  snapshot.set(file, { kind: stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other',
    bytes: stat.isFile() ? fs.readFileSync(file) : null });
  for (let parent = path.dirname(file); ; parent = path.dirname(parent)) {
    if (!snapshot.has(parent)) snapshot.set(parent, { kind: 'directory', bytes: null });
    if (parent === root) break;
    assert.notEqual(parent, path.dirname(parent), 'fixture parent stays beneath root');
  }
}
for (const entry of fs.readdirSync(path.join(root, 'docs/canonical'), { withFileTypes: true }))
  if (entry.isFile()) addPhysical('docs/canonical/' + entry.name);
for (const entry of index.documents) addPhysical(entry.path);
addPhysical('package.json');
addPhysical('docs/IT-BETRIEBSHANDBUCH.md');

async function actualIndex(candidate, extras = []) {
  const nodes = new Map(snapshot), calls = [], logs = [];
  nodes.set(indexFile, { kind: 'file', bytes: Buffer.from(JSON.stringify(candidate)) });
  for (const [file, kind] of extras) nodes.set(path.resolve(file), {
    kind, bytes: kind === 'file' ? Buffer.from('Synthetic extra historical document.\n') : null
  });
  const lookup = (operation, file) => {
    const absolute = path.resolve(String(file)); calls.push({ operation, file: absolute });
    const node = nodes.get(absolute);
    if (!node) throw Object.assign(new Error('MODEL_ENOENT:' + absolute), { code: 'ENOENT' });
    return node;
  };
  const io = {
    existsSync(file) { const absolute = path.resolve(String(file)); calls.push({ operation: 'exists', file: absolute }); return nodes.has(absolute); },
    readFileSync(file, encoding) {
      const node = lookup('read', file); assert.equal(node.kind, 'file', 'fixture read is a regular file');
      return encoding ? node.bytes.toString(encoding) : Buffer.from(node.bytes);
    },
    lstatSync(file) {
      const node = lookup('lstat', file);
      return { isFile: () => node.kind === 'file', isDirectory: () => node.kind === 'directory',
        isSymbolicLink: () => node.kind === 'link' };
    }
  };
  const context = vm.createContext({ console: { log(...args) { logs.push(args.join(' ')); } } });
  const imports = new Map();
  const module = new vm.SourceTextModule(source, {
    context, identifier: pathToFileURL(validator).href,
    initializeImportMeta(meta) { meta.url = pathToFileURL(validator).href; }
  });
  let failed = false, error;
  try {
    await module.link(request => {
      if (!imports.has(request)) {
        const values = request === 'node:fs' ? { default: io } :
          request === 'node:path' ? { default: path } :
            request === 'node:url' ? { fileURLToPath } : null;
        assert.ok(values, 'unexpected validator import ' + request);
        imports.set(request, new vm.SyntheticModule(Object.keys(values), function() {
          for (const [name, value] of Object.entries(values)) this.setExport(name, value);
        }, { context, identifier: request }));
      }
      return imports.get(request);
    });
    await module.evaluate({ timeout: 2000 });
  } catch (caught) { failed = true; error = caught; }
  return { failed, error, logs, calls };
}
function withExtra(file) {
  return { ...index, documents: [...index.documents, { ...history, id: 'CVD-F1-EXTRA-HISTORY', path: file }] };
}
const baseline = await actualIndex(index);
assert.equal(baseline.failed, false, 'CVD_FIXTURE_BASELINE_FAILED: ' + String(baseline.error || ''));
assert.equal(baseline.logs.length, 1);
assert.match(baseline.logs[0], /^Canonical documentation: PASS \(\d+ decisions, \d+ epics, \d+ stories\)$/u);
console.log('CVD-F1 full actual source baseline PASS; existing historical documents retained.');
const { testAsync, done } = require('../helpers.js').createSuite('Canonical document index path admission');

await testAsync('a canonical regular historical file including spaces and umlauts remains admissible', async () => {
  const relative = 'docs/archive/CVD-F1 ÄÖÜ äöü ß historical.md';
  const result = await actualIndex(withExtra(relative), [[path.join(root, relative), 'file']]);
  assert.equal(result.failed, false, String(result.error || ''));
  assert.equal(result.logs.length, 1);
});
for (const [name, relative] of [['empty root spelling', ''], ['dot root spelling', '.'], ['existing directory', 'docs/canonical']]) {
  await testAsync('actual source refuses an extra indexed ' + name, async () => {
    const result = await actualIndex(withExtra(relative));
    assert.equal(result.failed, true, 'CVD_F1_NONFILE_ACCEPTED:' + name);
    assert.match(String(result.error?.message || ''), /invalid document index path:|indexed document is not a regular file:/u);
    assert.deepEqual(result.logs, [], 'no final PASS on refused index admission');
  });
}
for (const relative of ['docs/canonical/./README.md', 'docs/canonical/../canonical/README.md',
  'docs//canonical/README.md', '../outside-cvd-f1.md', '/outside-cvd-f1.md',
  'C:/outside-cvd-f1.md', 'C:\\outside-cvd-f1.md', 'C:outside-cvd-f1.md']) {
  await testAsync('actual source refuses noncanonical/foreign spelling ' + JSON.stringify(relative), async () => {
    // Availability is an explicit virtual fixture fact, not a real outside read.
    // Root/directory countercases above need no such modeled extra object.
    const legacyTarget = path.resolve(path.join(root, relative));
    const extras = snapshot.has(legacyTarget) ? [] : [[legacyTarget, 'file']];
    const result = await actualIndex(withExtra(relative), extras);
    assert.equal(result.failed, true, 'CVD_F1_NONCANONICAL_ACCEPTED:' + relative);
    assert.match(String(result.error?.message || ''), /invalid document index path:/u);
    assert.deepEqual(result.logs, []);
  });
}
await testAsync('leaf non-file and missing canonical file remain hard refusals', async () => {
  const relative = 'docs/archive/cvd-f1-nonfile.md';
  const linked = await actualIndex(withExtra(relative), [[path.join(root, relative), 'link']]);
  assert.equal(linked.failed, true);
  assert.match(String(linked.error?.message || ''), /indexed document is not a regular file:/u);
  assert.deepEqual(linked.logs, []);
  const missing = await actualIndex(withExtra('docs/archive/cvd-f1-missing.md'));
  assert.equal(missing.failed, true);
  assert.match(String(missing.error?.message || ''), /indexed document is missing:/u);
  assert.deepEqual(missing.logs, []);
});
await done();
