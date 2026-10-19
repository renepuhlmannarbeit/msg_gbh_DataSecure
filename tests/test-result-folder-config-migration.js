'use strict';
// Configuration transaction model. Real Node22 -> Rust handle admission is
// separately exercised in test-standalone-native-export.js on each target OS.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-config-migration-')));
process.env.EU_PRIVACY_ROOT = path.join(base, 'privacy');
process.env.EU_PRIVACY_DATA_ROOT = path.join(base, 'private');
delete process.env.EU_PRIVACY_RESULT_ROOT;
const config = require('../plugins/data-secure/server/gateway/result-folder-config');
const id = { volume: '1', object: '2', created_ns: '3' };
const binding = root => ({ schema: 'datasecure-native-export-binding/1', root, root_identity: { ...id },
  data_root_identity: { ...id, object: '4' }, private_name: `native-export-${'a'.repeat(32)}`,
  private_identity: { ...id, object: '5' }, anonymize_identity: { ...id, object: '6' }, markdown_identity: { ...id, object: '7' } });
let serial = 0;
function fixture(schema = 'datasecure-result-root/2') {
  const root = path.join(base, `results-${++serial}`); fs.mkdirSync(root);
  config.saveConfiguredResultRoot(root);
  const record = JSON.parse(fs.readFileSync(config.configPath())); record.schema = schema;
  delete record.exact_identity; // This helper deliberately constructs the named legacy shape.
  if (schema.endsWith('/1')) delete record.notices;
  if (schema.endsWith('/3')) record.native_identity = { ...id };
  if (schema.endsWith('/4')) record.native_export = binding(root);
  fs.writeFileSync(config.configPath(), JSON.stringify(record));
  return { root, record, bytes: fs.readFileSync(config.configPath()) };
}
for (const schema of ['/1', '/2', '/3']) test(`explicit export admits ${schema} only with a lossless original binding and upgrades once`, async () => {
  const f = fixture(`datasecure-result-root${schema}`); let calls = 0;
  if (schema !== '/3' && !Object.values(f.record.identity).every(value => Number.isSafeInteger(Number(value)))) {
    await assert.rejects(config.prepareConfiguredNativeExportBinding(() => assert.fail('ambiguous legacy identity')), { code: 'AI_EXPORT_CONFIGURATION_REQUIRED' });
    assert.deepEqual(fs.readFileSync(config.configPath()), f.bytes);
    return;
  }
  const result = await config.prepareConfiguredNativeExportBinding(async snapshot => {
    calls++; assert.equal(snapshot.root, f.root); assert.match(snapshot.setting_sha256, /^[a-f0-9]{64}$/u);
    assert.deepEqual(snapshot.admission, schema === '/3' ? { kind: 'native', identity: id } : { kind: 'node22', identity: f.record.identity });
    assert.deepEqual(fs.readFileSync(config.configPath()), f.bytes, 'no setting change before native ACK');
    return binding(f.root);
  });
  assert.deepEqual(result, binding(f.root));
  const record = JSON.parse(fs.readFileSync(config.configPath()));
  assert.equal(record.schema, config.EXPORT_SCHEMA); assert.deepEqual(record.identity, f.record.identity);
  assert.deepEqual(record.notices, f.record.notices || { sync: false, network: false });
  assert.deepEqual(await config.prepareConfiguredNativeExportBinding(() => assert.fail('already bound')), result);
  assert.equal(calls, 1);
});
for (const failure of ['setting-change', 'root-change', 'wrong-root', 'native-refusal', 'unsafe-number'])
  test(`legacy admission fails closed: ${failure}`, async () => {
    const f = fixture(failure === 'unsafe-number' ? 'datasecure-result-root/2' : 'datasecure-result-root/3'); let calls = 0;
    if (failure === 'unsafe-number') {
      // No native proof is attempted for a lossy Node Number identity.
      f.record.identity.ino = '9007199254740992'; fs.writeFileSync(config.configPath(), JSON.stringify(f.record));
    }
    await assert.rejects(config.prepareConfiguredNativeExportBinding(async () => {
      calls++;
      if (failure === 'setting-change') fs.writeFileSync(config.configPath(), JSON.stringify({ ...f.record, notices: { sync: true, network: false } }));
      if (failure === 'root-change') { fs.renameSync(f.root, `${f.root}-original`); fs.mkdirSync(f.root); }
      if (failure === 'native-refusal') throw Object.assign(Error('AI_EXPORT_CONFLICT'), { code: 'AI_EXPORT_CONFLICT' });
      return binding(failure === 'wrong-root' ? path.join(base, 'other') : f.root);
    }), { code: 'AI_EXPORT_CONFIGURATION_REQUIRED' });
    assert.equal(calls, failure === 'unsafe-number' ? 0 : 1);
    assert.notEqual(JSON.parse(fs.readFileSync(config.configPath())).schema, config.EXPORT_SCHEMA);
    if (!['setting-change', 'unsafe-number'].includes(failure)) assert.deepEqual(fs.readFileSync(config.configPath()), f.bytes);
  });
test('unconfigured, missing and environment-only roots never become implicit permissions', async () => {
  const f = fixture(); fs.renameSync(f.root, `${f.root}-missing`);
  await assert.rejects(config.prepareConfiguredNativeExportBinding(() => assert.fail('missing')), { code: 'AI_EXPORT_CONFIGURATION_REQUIRED' });
  fs.unlinkSync(config.configPath());
  await assert.rejects(config.prepareConfiguredNativeExportBinding(() => assert.fail('unconfigured')), { code: 'AI_EXPORT_CONFIGURATION_REQUIRED' });
  process.env.EU_PRIVACY_RESULT_ROOT = path.join(base, 'environment-results');
  fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT);
  try { await assert.rejects(config.prepareConfiguredNativeExportBinding(() => assert.fail('environment')), { code: 'AI_EXPORT_CONFIGURATION_REQUIRED' }); }
  finally { delete process.env.EU_PRIVACY_RESULT_ROOT; }
});
test('a native volume refusal is not relabelled or retried and leaves settings unchanged', async () => {
  // Exercise native error propagation, not legacy Number admission. On NTFS a
  // real /2 inode may already be rounded above 2^53-1 and must be refused before
  // this callback. The separate unsafe-number case retains that early refusal.
  const f = fixture('datasecure-result-root/3'); let calls = 0;
  await assert.rejects(config.prepareConfiguredNativeExportBinding(snapshot => {
    assert.equal(snapshot.root, f.root);
    assert.deepEqual(snapshot.admission, { kind: 'native', identity: id });
    calls++; throw Object.assign(Error('AI_EXPORT_VOLUME_MISMATCH'), { code: 'AI_EXPORT_VOLUME_MISMATCH' });
  }), { code: 'AI_EXPORT_VOLUME_MISMATCH' });
  assert.equal(calls, 1); assert.deepEqual(fs.readFileSync(config.configPath()), f.bytes);
});

function exactFixture() {
  const root = path.join(base, `exact-results-${++serial}`); fs.mkdirSync(root);
  config.saveConfiguredResultRoot(root);
  const record = JSON.parse(fs.readFileSync(config.configPath())), stat = fs.statSync(root, { bigint: true });
  Object.assign(record, { schema: config.EXACT_SCHEMA,
    exact_identity: { dev: String(stat.dev), ino: String(stat.ino), birthtime_ns: String(stat.birthtimeNs) } });
  fs.writeFileSync(config.configPath(), JSON.stringify(record));
  return { root, record, bytes: fs.readFileSync(config.configPath()) };
}

test('a newly selected native export root persists exact stat identity without upgrading any old /4 record', async () => {
  const f = fixture('datasecure-result-root/4');
  assert.equal(JSON.parse(fs.readFileSync(config.configPath())).schema, config.EXPORT_SCHEMA);
  assert.deepEqual(await config.prepareConfiguredNativeExportBinding(() => assert.fail('old native binding needs no reprovision')), binding(f.root));
  assert.deepEqual(fs.readFileSync(config.configPath()), f.bytes, 'reading a legacy /4 does not adopt fresh stat authority');
  config.saveConfiguredResultRoot(f.root, { nativeExport: binding(f.root) });
  const selected = JSON.parse(fs.readFileSync(config.configPath())), stat = fs.statSync(f.root, { bigint: true });
  assert.equal(selected.schema, config.EXACT_EXPORT_SCHEMA);
  assert.deepEqual(selected.exact_identity, { dev: String(stat.dev), ino: String(stat.ino), birthtime_ns: String(stat.birthtimeNs) });
  assert.deepEqual(config.readConfiguredNativeExportBinding(), binding(f.root));
  selected.exact_identity.ino = String(BigInt(selected.exact_identity.ino) + 1n);
  fs.writeFileSync(config.configPath(), JSON.stringify(selected));
  assert.equal(config.readConfiguredResultRootStatus().status, 'unavailable');
  assert.equal(config.readConfiguredNativeExportBinding(), null);
  assert.equal(config.recordedResultRootPath(), f.root);
});
test('new exact identity is admitted losslessly once and survives notices and service reread', async () => {
  const f = exactFixture(); let calls = 0;
  const result = await config.prepareConfiguredNativeExportBinding(async snapshot => {
    calls++; assert.deepEqual(snapshot.admission, { kind: 'node22_bigint', identity: f.record.exact_identity });
    assert.deepEqual(fs.readFileSync(config.configPath()), f.bytes);
    return binding(f.root);
  });
  assert.deepEqual(result, binding(f.root)); assert.equal(calls, 1);
  const saved = JSON.parse(fs.readFileSync(config.configPath()));
  assert.equal(saved.schema, config.EXACT_EXPORT_SCHEMA);
  assert.deepEqual(saved.exact_identity, f.record.exact_identity);
  assert.deepEqual(saved.identity, f.record.identity);
  config.consumeConfiguredResultNotices();
  assert.equal(JSON.parse(fs.readFileSync(config.configPath())).schema, config.EXACT_EXPORT_SCHEMA);
  assert.deepEqual(config.readConfiguredNativeExportBinding(), binding(f.root));
  await config.prepareConfiguredNativeExportBinding(() => assert.fail('no second native provisioning'));
});
for (const field of ['dev', 'ino', 'birthtime_ns']) test(`new exact binding refuses changed ${field} before native admission`, async () => {
  const f = exactFixture(); f.record.exact_identity[field] = String(BigInt(f.record.exact_identity[field]) + 1n);
  fs.writeFileSync(config.configPath(), JSON.stringify(f.record));
  assert.equal(config.readConfiguredResultRootStatus().status, 'unavailable');
  assert.equal(config.recordedResultRootPath(), f.root, 'an unavailable exact root remains shielded from input');
  assert.equal(config.visibleResultTreeOverlaps(path.join(f.root, 'DataSecure-Output', 'test.md')), true);
  await assert.rejects(config.prepareConfiguredNativeExportBinding(() => assert.fail('changed exact identity')), { code: 'AI_EXPORT_CONFIGURATION_REQUIRED' });
  assert.deepEqual(JSON.parse(fs.readFileSync(config.configPath())), f.record);
});
test('unavailable exact-export root stays recorded for source exclusion without authorizing access', () => {
  const f = exactFixture();
  Object.assign(f.record, { schema: config.EXACT_EXPORT_SCHEMA, native_export: binding(f.root) });
  f.record.exact_identity.ino = String(BigInt(f.record.exact_identity.ino) + 1n);
  fs.writeFileSync(config.configPath(), JSON.stringify(f.record));
  assert.equal(config.readConfiguredResultRootStatus().status, 'unavailable');
  assert.equal(config.readConfiguredNativeExportBinding(), null);
  assert.equal(config.recordedResultRootPath(), f.root);
  assert.equal(config.visibleResultTreeOverlaps(path.join(f.root, 'DataSecure-Markdown', 'test.md')), true);
});
test('new exact binding refuses stale settings across native await without erasing newer settings', async () => {
  const f = exactFixture();
  await assert.rejects(config.prepareConfiguredNativeExportBinding(async () => {
    config.saveConfiguredResultRoot(f.root, { nativeIdentity: id });
    return binding(f.root);
  }), { code: 'AI_EXPORT_CONFIGURATION_REQUIRED' });
  assert.equal(JSON.parse(fs.readFileSync(config.configPath())).schema, config.NATIVE_SCHEMA);
});
// Deliberately retain these small synthetic fault fixtures, including displaced
// folders. No recursive cleanup or permissions repair of a tampered tree.
