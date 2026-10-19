'use strict';

// Sequential real-file countercases for the narrowly opt-in read-only snapshot.
// No native Core/GUI or CI-cause claim. All synthetic scopes are create-only
// and retained; faults delegate real stat/read/close before adding an error.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const bound = require('../plugins/data-secure/server/core/bound-file-io');
const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'datasecure-export-snapshot-'));
assert.equal(path.dirname(root), fs.realpathSync.native(os.tmpdir()));
assert.equal(fs.realpathSync.native(root), root);
assert.ok(fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink());
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
let serial = 0, passed = 0, exhausted;
const results = [];
function scope() {
  const directory = fs.mkdtempSync(path.join(root, 'case-'));
  const filename = path.join(directory, 'leaf.json');
  fs.writeFileSync(filename, 'AAAA', { flag: 'wx', mode: 0o600 });
  return { directory, filename };
}
function replace(filename, bytes = 'BBBB') {
  const temporary = `${filename}.replacement-${++serial}`;
  fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, filename);
}
function probe(filename, read, hooks = {}) {
  const real = Object.fromEntries(['lstatSync', 'openSync', 'readSync', 'closeSync'].map(name => [name, fs[name]]));
  const held = new Set(), metrics = { attempts: 0, opens: 0, reads: 0, closes: 0 };
  let phase = 'start', value, error;
  fs.lstatSync = function(file, ...args) {
    const stat = Reflect.apply(real.lstatSync, fs, [file, ...args]);
    if (file === filename && args[0]?.bigint === true && phase === 'start') {
      phase = 'opening'; metrics.attempts++; hooks.beforeOpen?.(metrics);
    }
    return stat;
  };
  fs.openSync = function(file, ...args) {
    if (file === filename) { metrics.opens++; hooks.open?.(metrics); }
    const fd = Reflect.apply(real.openSync, fs, [file, ...args]);
    if (file === filename) { held.add(fd); phase = 'held'; }
    return fd;
  };
  fs.readSync = function(fd, ...args) {
    const count = Reflect.apply(real.readSync, fs, [fd, ...args]);
    if (held.has(fd)) { metrics.reads++; hooks.afterRead?.(metrics, fd); }
    return count;
  };
  fs.closeSync = function(fd, ...args) {
    const target = held.has(fd), result = Reflect.apply(real.closeSync, fs, [fd, ...args]);
    if (target) { held.delete(fd); metrics.closes++; phase = 'start'; hooks.afterClose?.(metrics); }
    return result;
  };
  try { value = read(); } catch (failure) { error = failure; }
  finally { Object.assign(fs, real); assert.equal(held.size, 0, 'every real descriptor was closed, including failures'); }
  return { value, error, ...metrics };
}
const snapshot = filename => bound.readBoundFileSnapshot(filename, { minimum: 1, maximum: 65536 });
function refused(result, attempts, code = 'BOUND_FILE_CHANGED') {
  assert.equal(result.error?.code, code); assert.equal(result.attempts, attempts); assert.equal(result.value, undefined);
}
async function run(name, action) {
  await action(); passed++; results.push(name); console.log(`  ok ${name}`);
}
async function productionFixture() {
  const directory = fs.mkdtempSync(path.join(root, 'product-'));
  process.env.EU_PRIVACY_DATA_ROOT = path.join(directory, 'private');
  process.env.EU_PRIVACY_ROOT = path.join(directory, 'workspace');
  process.env.EU_PRIVACY_RESULT_ROOT = path.join(directory, 'results');
  process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
  delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
  fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT, { mode: 0o700 });
  const exporter = require('../plugins/data-secure/server/gateway/result-export');
  const { createDocumentReviewStore } = require('../plugins/data-secure/server/gateway/standalone-document-review-store');
  const { publishMarkdownArtifact } = require('../plugins/data-secure/server/standalone/markdown-store');
  const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
  const content = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false };
  const id = crypto.randomBytes(16).toString('hex'), bytes = Buffer.from('Synthetic snapshot negative fixture.\n');
  const item = { id, name: 'Synthetic.txt', source_label: 'Synthetic.txt', sha256: sha(bytes), status: 'pending' };
  const state = { schema: 'datasecure-batch/7', token: crypto.randomBytes(32).toString('hex'),
    product_channel: 'standalone', processing_mode: 'markdown-only', standalone_document_review: true,
    content_options: content, profile: 'general', created_at: '2026-10-19T00:00:00.000Z', items: [item] };
  createDocumentReviewStore().captureRun(state);
  Object.assign(item, await publishMarkdownArtifact(createMarkdownExtraction({ source_type: 'txt', markdown: bytes.toString('utf8'),
    coverage: { status: 'complete', reason_codes: [] }, content_options: content }), `dm_${id}`, { contentOptions: content }), { status: 'released' });
  assert.deepEqual(exporter.exportCompletedState(state), { exported: 1, pending: 0, available: true });
  const filename = exporter.recordPath(state.token);
  assert.equal(exporter.readStandaloneExportHistoryEntry(state.token).complete, true);
  return { filename, exporter, state, directory, read: () => exporter.readStandaloneExportHistoryEntry(state.token),
    owner: path.join(process.env.EU_PRIVACY_DATA_ROOT, 'result-export-owners', path.basename(filename)) };
}
async function main() {
  console.log(`Snapshot fixtures preserved: ${root}`);
  await run('stable snapshot uses one real read', () => {
    const f = scope(), result = probe(f.filename, () => snapshot(f.filename));
    assert.equal(result.value.toString(), 'AAAA'); assert.equal(result.attempts, 1); assert.equal(result.error, undefined);
  });
  await run('two proven replacements succeed on the third complete snapshot', () => {
    const f = scope(), result = probe(f.filename, () => snapshot(f.filename), {
      beforeOpen(metrics) { if (metrics.attempts <= 2) replace(f.filename, metrics.attempts === 1 ? 'BBBB' : 'CCCC'); }
    });
    assert.equal(result.value.toString(), 'CCCC'); assert.equal(result.attempts, 3); assert.equal(result.closes, 3);
  });
  await run('continuous real replacements stop after three total attempts', () => {
    const f = scope(), result = probe(f.filename, () => snapshot(f.filename), { beforeOpen() { replace(f.filename); } });
    refused(result, 3); assert.equal(result.closes, 3); exhausted = result.error;
  });
  await run('an exhausted replacement error cannot authorize a different snapshot call', () => {
    const f = scope(), result = probe(f.filename, () => snapshot(f.filename), { open() { throw exhausted; } });
    refused(result, 1); assert.equal(result.error, exhausted);
  });
  await run('default readBoundFile remains one-shot on the same real replacement', () => {
    const f = scope(), result = probe(f.filename, () => bound.readBoundFile(f.filename), { beforeOpen() { replace(f.filename); } });
    refused(result, 1);
  });
  for (const code of ['EACCES', 'EPERM', 'BOUND_FILE_CHANGED']) await run(`${code} alone is never retry authority`, () => {
    const f = scope(), result = probe(f.filename, () => snapshot(f.filename), {
      open() { throw Object.assign(Error('closed fault'), { code }); }
    });
    refused(result, 1);
  });
  await run('a later access error stops after the one already proven replacement', () => {
    const f = scope(), result = probe(f.filename, () => snapshot(f.filename), {
      beforeOpen(metrics) { if (metrics.attempts === 1) replace(f.filename); },
      open(metrics) { if (metrics.attempts === 2) throw Object.assign(Error('closed access fault'), { code: 'EACCES' }); }
    });
    refused(result, 2);
  });
  await run('a delegated close fault dominates an otherwise proven replacement', () => {
    const f = scope(), result = probe(f.filename, () => snapshot(f.filename), {
      beforeOpen() { replace(f.filename); }, afterClose() { throw Object.assign(Error('closed IO fault'), { code: 'EIO' }); }
    });
    refused(result, 1, 'BOUND_FILE_CLOSE_FAILED'); assert.equal(result.closes, 1);
  });
  await run('in-place mutation before open is not a leaf replacement', () => {
    const f = scope(), result = probe(f.filename, () => snapshot(f.filename), { beforeOpen() { fs.appendFileSync(f.filename, 'changed'); } });
    refused(result, 1);
  });
  await run('in-place mutation after the held read stays fail-closed', () => {
    const f = scope(), result = probe(f.filename, () => snapshot(f.filename), {
      afterRead(metrics) { if (metrics.reads === 1) fs.appendFileSync(f.filename, 'changed'); }
    });
    refused(result, 1);
  });
  await run('a newly multiply linked opened object is never retried', () => {
    const f = scope(), result = probe(f.filename, () => snapshot(f.filename), {
      beforeOpen() { replace(f.filename); fs.linkSync(f.filename, `${f.filename}.hardlink`); }
    });
    refused(result, 1);
  });
  await run('a dangling link cannot become a replacement capability', () => {
    const f = scope(), result = probe(f.filename, () => snapshot(f.filename), { beforeOpen() {
      fs.renameSync(f.filename, `${f.filename}.original`);
      fs.symlinkSync(path.join(f.directory, 'missing'), f.filename, process.platform === 'win32' ? 'junction' : 'file');
    } });
    refused(result, 1);
    assert.equal(fs.lstatSync(f.filename).isSymbolicLink(), true, 'a real dangling link was actually installed');
    assert.equal(fs.existsSync(f.filename), false);
  });
  await run('replacement parent is never adopted, even with a regular new leaf', () => {
    const f = scope(), result = probe(f.filename, () => snapshot(f.filename), { beforeOpen() {
      fs.renameSync(f.directory, `${f.directory}.original`); fs.mkdirSync(f.directory);
      fs.writeFileSync(f.filename, 'BBBB', { flag: 'wx' });
    } });
    refused(result, 1);
    assert.equal(fs.readFileSync(f.filename, 'utf8'), 'BBBB');
    assert.equal(fs.existsSync(`${f.directory}.original`), true);
  });
  for (const kind of ['schema', 'owner', 'purpose', 'hardlink', 'parent', 'replacement-to-invalid-json'])
    await run(`exact production reader refuses ${kind} without a generic retry`, async () => {
      const f = await productionFixture();
      if (kind === 'schema') { const value = JSON.parse(fs.readFileSync(f.filename)); value.schema = 'invalid'; replace(f.filename, JSON.stringify(value)); }
      if (kind === 'owner' || kind === 'purpose') {
        const value = JSON.parse(fs.readFileSync(f.owner));
        if (kind === 'owner') value.batch_id = 'f'.repeat(64); else value.processing_mode = 'markdown-and-anonymize';
        replace(f.owner, JSON.stringify(value));
      }
      if (kind === 'hardlink') fs.linkSync(f.filename, `${f.filename}.hardlink`);
      const result = probe(f.filename, f.read, { beforeOpen(metrics) {
        if (kind === 'parent') {
          const directory = path.dirname(f.filename), bytes = fs.readFileSync(f.filename);
          fs.renameSync(directory, `${directory}.original`); fs.mkdirSync(directory); fs.writeFileSync(f.filename, bytes, { flag: 'wx' });
        }
        if (kind === 'replacement-to-invalid-json' && metrics.attempts === 1) replace(f.filename, '{invalid');
      } });
      refused(result, kind === 'replacement-to-invalid-json' ? 2 : 1, 'STANDALONE_HISTORY_UNAVAILABLE');
    });
  fs.writeFileSync(path.join(root, 'RESULT.json'), JSON.stringify({ classification: 'SOURCE_NEGATIVE_CASES_NOT_NATIVE_ACCEPTANCE',
    node: process.version, platform: process.platform, passed, cases: results, fixtures_preserved: root }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(`Target export snapshot countercases: ${passed} passed, 0 failed (source IO only)`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
