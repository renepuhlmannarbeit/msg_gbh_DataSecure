'use strict';
// Actual JS settings/receipt and service/channel boundaries with synthetic
// roots. Native ACL creation itself belongs to Windows/Rust integration tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-initial-output-')));
process.env.EU_PRIVACY_ROOT = path.join(base, 'workspace');
process.env.EU_PRIVACY_DATA_ROOT = path.join(base, 'private');
delete process.env.EU_PRIVACY_RESULT_ROOT;
delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL;
const config = require('../plugins/data-secure/server/gateway/result-folder-config');
const receipt = require('../plugins/data-secure/server/gateway/initial-output-binding');
const { validInitialOutputBinding, validNode22BigIntIdentity } = require('../plugins/data-secure/server/core/native-directory-identity');
const { NativeExportChannel, PUBLICATION_RESPONSE } = require('../plugins/data-secure/server/standalone/native-export-channel');
const { StandaloneApplicationService } = require('../plugins/data-secure/server/standalone/application-service');
const { createRunHistory } = require('../plugins/data-secure/server/standalone/run-history');
const crypto = require('node:crypto');
let counter = 0;
const nodeId = target => receipt.exactIdentity(fs.statSync(target, { bigint: true }));
test('legacy source adapter tolerates a genuinely absent private settings parent without inventing a receipt', () => {
  assert.equal(fs.existsSync(process.env.EU_PRIVACY_DATA_ROOT), false);
  const root = path.join(base, 'legacy-without-settings'); fs.mkdirSync(root);
  assert.equal(config.resultOutputDirectory({ root }), path.join(root, 'DataSecure-Output'));
  assert.equal(fs.existsSync(process.env.EU_PRIVACY_DATA_ROOT), false);
});
function fixture(schema = config.EXACT_SCHEMA) {
  const root = path.join(base, `result-${++counter}`); fs.mkdirSync(root);
  config.saveConfiguredResultRoot(root);
  const value = JSON.parse(fs.readFileSync(config.configPath()));
  const nativeIdentity = { volume: '1', object: '9007199254740993', created_ns: '123' };
  if (schema !== config.EXACT_SCHEMA) {
    value.schema = schema;
    if (schema !== config.EXACT_EXPORT_SCHEMA) delete value.exact_identity;
    if (schema === config.NATIVE_SCHEMA) value.native_identity = nativeIdentity;
    if ([config.EXPORT_SCHEMA, config.EXACT_EXPORT_SCHEMA].includes(schema)) value.native_export = {
      schema: 'datasecure-native-export-binding/1', root, root_identity: nativeIdentity,
      data_root_identity: nativeIdentity, private_name: `native-export-${'a'.repeat(32)}`,
      private_identity: nativeIdentity, anonymize_identity: nativeIdentity, markdown_identity: nativeIdentity
    };
    fs.writeFileSync(config.configPath(), JSON.stringify(value));
  }
  return { root, value, nativeIdentity, bytes: fs.readFileSync(config.configPath()) };
}
function provision(root) {
  for (const name of ['DataSecure-Markdown', 'DataSecure-Output']) fs.mkdirSync(path.join(root, name));
  return { schema: 'datasecure-initial-output-binding/1', root, root_identity: nodeId(root),
    markdown_identity: nodeId(path.join(root, 'DataSecure-Markdown')), output_identity: nodeId(path.join(root, 'DataSecure-Output')) };
}
for (const schema of [config.EXACT_SCHEMA, config.NATIVE_SCHEMA, config.EXPORT_SCHEMA, config.EXACT_EXPORT_SCHEMA])
  test(`initial preparation uses original exact/native admission for ${schema}, never rewrites settings`, async () => {
    const f = fixture(schema); let calls = 0;
    const recheck = await config.prepareConfiguredInitialOutputRoot(async snapshot => {
      calls++; assert.equal(snapshot.root, f.root); assert.match(snapshot.setting_sha256, /^[a-f0-9]{64}$/u);
      assert.deepEqual(snapshot.admission, schema === config.EXACT_SCHEMA ? { kind: 'node22_bigint', identity: f.value.exact_identity }
        : { kind: 'native', identity: f.nativeIdentity });
      assert.deepEqual(fs.readFileSync(config.configPath()), f.bytes);
      return provision(f.root);
    });
    assert.equal(calls, 1); recheck(); assert.deepEqual(fs.readFileSync(config.configPath()), f.bytes);
    assert.equal(config.resultOutputDirectory(), path.join(f.root, 'DataSecure-Output'));
    assert.equal(receipt.readInitialOutputBinding(f.root).root, f.root);
  });
for (const schema of [config.LEGACY_SCHEMA, config.SCHEMA]) test(`initial provisioning never upgrades rounded legacy ${schema}`, async () => {
  const f = fixture(); f.value.schema = schema; delete f.value.exact_identity;
  if (schema === config.LEGACY_SCHEMA) delete f.value.notices;
  fs.writeFileSync(config.configPath(), JSON.stringify(f.value));
  await assert.rejects(config.prepareConfiguredInitialOutputRoot(() => assert.fail('no native call')), { code: 'STANDALONE_RESULT_ROOT_UNSAFE' });
  assert.equal(fs.existsSync(path.join(f.root, 'DataSecure-Output')), false);
});
for (const fault of ['settings', 'root', 'wrong-root', 'wrong-child', 'falsy', 'native-refusal'])
  test(`preparation refuses ${fault} without a worker-authorizing receipt`, async () => {
    const f = fixture();
    await assert.rejects(config.prepareConfiguredInitialOutputRoot(async () => {
      if (fault === 'native-refusal') throw Object.assign(Error('AI_EXPORT_CONFLICT'), { code: 'AI_EXPORT_CONFLICT' });
      const binding = provision(f.root);
      if (fault === 'settings') fs.writeFileSync(config.configPath(), JSON.stringify({ ...f.value, notices: { sync: true, network: false } }));
      if (fault === 'root') { fs.renameSync(f.root, `${f.root}-old`); fs.mkdirSync(f.root); }
      if (fault === 'wrong-root') binding.root = `${f.root}-other`;
      if (fault === 'wrong-child') binding.output_identity.ino = String(BigInt(binding.output_identity.ino) + 1n);
      return fault === 'falsy' ? null : binding;
    }));
    assert.equal(fs.existsSync(receipt.receiptPath(f.root)), false);
  });
for (const fault of ['receipt-replace', 'receipt-edit', 'settings', 'output', 'markdown', 'root'])
  test(`final start recheck refuses ${fault} after native acknowledgement`, async () => {
    const f = fixture(), recheck = await config.prepareConfiguredInitialOutputRoot(async () => provision(f.root));
    const target = receipt.receiptPath(f.root);
    if (fault === 'receipt-replace') { const bytes = fs.readFileSync(target); fs.renameSync(target, `${target}.old`); fs.writeFileSync(target, bytes); }
    if (fault === 'receipt-edit') { const value = JSON.parse(fs.readFileSync(target)); value.setting_sha256 = 'f'.repeat(64); fs.writeFileSync(target, JSON.stringify(value)); }
    if (fault === 'settings') fs.writeFileSync(config.configPath(), JSON.stringify({ ...f.value, notices: { sync: true, network: false } }));
    if (['output', 'markdown'].includes(fault)) {
      const child = path.join(f.root, fault === 'output' ? 'DataSecure-Output' : 'DataSecure-Markdown');
      fs.renameSync(child, `${child}-old`); fs.mkdirSync(child);
    }
    if (fault === 'root') { fs.renameSync(f.root, `${f.root}-old`); fs.mkdirSync(f.root); }
    assert.throws(recheck);
  });
test('public working-file edits never invalidate directory receipt and a missing child is never recreated', async () => {
  const f = fixture(), recheck = await config.prepareConfiguredInitialOutputRoot(async () => provision(f.root));
  const output = config.resultOutputDirectory(), publicFile = path.join(output, 'user-working-copy.md');
  fs.writeFileSync(publicFile, 'äöüÄÖÜß original'); recheck();
  fs.writeFileSync(publicFile, 'manual change'); recheck();
  fs.renameSync(output, `${output}-old`);
  assert.throws(() => config.resultOutputDirectory()); assert.equal(fs.existsSync(output), false);
});
test('Windows native without a receipt refuses Node mkdir; legacy adapter retains its behavior', { skip: process.platform !== 'win32' }, () => {
  const f = fixture(); process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '1';
  try { assert.throws(() => config.resultOutputDirectory()); assert.equal(fs.existsSync(path.join(f.root, 'DataSecure-Output')), false); }
  finally { delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL; }
  assert.equal(config.resultOutputDirectory(), path.join(f.root, 'DataSecure-Output'));
});
test('completed pre-receipt Windows working destinations remain resolvable without new provisioning', { skip: process.platform !== 'win32' }, () => {
  const f = fixture(), output = path.join(f.root, 'DataSecure-Markdown'); fs.mkdirSync(output);
  const exporter = require('../plugins/data-secure/server/gateway/result-export');
  const record = { schema: exporter.CONTENT_MARKDOWN_SCHEMA, result_layout: exporter.RESULT_LAYOUT, complete: true };
  process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '1';
  try {
    const destination = exporter._test.activeDestination(record); assert.equal(destination.output.path, output);
    assert.equal(fs.existsSync(receipt.receiptPath(f.root)), false);
    assert.throws(() => exporter._test.activeDestination({ ...record, complete: false }));
    assert.equal(fs.existsSync(path.join(f.root, 'DataSecure-Output')), false);
  } finally { delete process.env.DATASECURE_NATIVE_EXPORT_CHANNEL; }
});
for (const markdown of [true, false]) test(`pending ${markdown ? 'Markdown' : 'anonymized'} destination requires current native receipt IDs`, () => {
  // Real activeDestination against a native-confirmed synthetic receipt, without
  // claiming that this JS fixture itself provisioned a Windows ACL.
  return (async () => {
    const f = fixture(); await config.prepareConfiguredInitialOutputRoot(async () => provision(f.root));
    const exporter = require('../plugins/data-secure/server/gateway/result-export');
    const record = { schema: markdown ? exporter.CONTENT_MARKDOWN_SCHEMA : exporter.CONTENT_ANONYMIZED_SCHEMA,
      result_layout: exporter.RESULT_LAYOUT, complete: false };
    const destination = exporter._test.activeDestination(record);
    const expected = path.join(f.root, markdown ? 'DataSecure-Markdown' : 'DataSecure-Output');
    assert.equal(destination.output.path, expected);
    fs.renameSync(expected, `${expected}-old`); fs.mkdirSync(expected);
    assert.throws(() => exporter._test.activeDestination(record));
  })();
});
test('binding validation preserves BigInt precision and never evaluates untrusted accessors/proxies', () => {
  const f = fixture(), binding = provision(f.root); assert.ok(validInitialOutputBinding(binding));
  assert.ok(validNode22BigIntIdentity({ dev: '18446744073709551615', ino: '9007199254740993', birthtime_ns: '340282366920938463463374607431768211455' }));
  let reads = 0;
  const getter = { ...binding }; Object.defineProperty(getter, 'root', { enumerable: true, get() { reads++; throw Error('getter'); } });
  const proxy = new Proxy(binding, { getPrototypeOf() { reads++; throw Error('proxy'); } });
  for (const value of [getter, proxy, { ...binding, extra: true }, { ...binding, output_identity: { dev: '1', ino: '01', birthtime_ns: '2' } },
    { ...binding, root_identity: { dev: '1', ino: '18446744073709551616', birthtime_ns: '1' } }, null, false])
    assert.equal(validInitialOutputBinding(value), false);
  assert.equal(reads, 0);
});
const snapshot = () => ({ root: path.join(base, 'native-root'), admission: { kind: 'node22_bigint', identity: { dev: '1', ino: '9007199254740993', birthtime_ns: '3' } }, setting_sha256: 'a'.repeat(64) });
const privateOuter = (action = 'start_admitted_batch', fields = {}) => ({ schema: 'datasecure-standalone-private-ipc/1',
  action, request_id: 'b'.repeat(16), ...(action === 'start_admitted_batch' ? { processing_mode: 'markdown-only' } : {}), ...fields });
function channelFixture() {
  const frames = [], channel = new NativeExportChannel({ write: frame => frames.push(frame) });
  const session = channel.publication(privateOuter());
  const promise = session.send('prepare_initial_output_root', snapshot()), frame = frames[0];
  const binding = { schema: 'datasecure-initial-output-binding/1', root: snapshot().root,
    root_identity: snapshot().admission.identity, output_identity: snapshot().admission.identity, markdown_identity: snapshot().admission.identity };
  const reply = { schema: PUBLICATION_RESPONSE, request_id: frame.request_id, native_id: frame.native_id, sequence: 1, ok: true, initial_binding: binding };
  return { frames, channel, session, promise, reply };
}
test('initial channel action is start-only, first-sequence-only and exact DTO; lost reply never confirms', async () => {
  const f = channelFixture(); assert.equal(f.frames.length, 1); assert.equal(f.frames[0].sequence, 1);
  f.channel.accept(f.reply); assert.deepEqual(await f.promise, f.reply.initial_binding);
  await assert.rejects(f.session.send('prepare_initial_output_root', snapshot()), { code: 'STANDALONE_IPC_FAILED' });
  for (const action of ['get_public_state', 'configure_results', 'export_approved_documents']) {
    const channel = new NativeExportChannel({ write() { assert.fail('unauthorized write'); } });
    await assert.rejects(channel.publication({ action, request_id: 'b'.repeat(16) }).send('prepare_initial_output_root', snapshot()));
  }
  const lost = channelFixture(); lost.channel.abort(); await assert.rejects(lost.promise, { code: 'STANDALONE_CLOSING' });
});
test('initial request refuses rounded Node, DTO aliases and accessors without evaluation or writes', async () => {
  let reads = 0;
  const getter = snapshot(); Object.defineProperty(getter, 'root', { enumerable: true, get() { reads++; return 'forged'; } });
  const proxy = new Proxy(snapshot(), { getPrototypeOf() { reads++; return Object.prototype; } });
  for (const fields of [getter, proxy, null, false, { ...snapshot(), extra: true },
    { ...snapshot(), admission: { kind: 'node22', identity: { dev: '1', ino: '2', birthtime_ms: '3' } } },
    { ...snapshot(), admission: { kind: 'node22_bigint', identity: { dev: '1', ino: 2, birthtime_ns: '3' } } }]) {
    const channel = new NativeExportChannel({ write() { assert.fail('untrusted preparation wrote a frame'); } });
    await assert.rejects(channel.publication(privateOuter()).send('prepare_initial_output_root', fields));
  }
  assert.equal(reads, 0);
});
for (const change of ['wrong-root', 'wrong-id-type', 'wrong-sequence', 'wrong-native', 'falsy', 'accessor'])
  test(`initial reply rejects ${change}`, async () => {
    const f = channelFixture(), rejected = assert.rejects(f.promise, { code: 'STANDALONE_IPC_FAILED' });
    const reply = structuredClone(f.reply);
    if (change === 'wrong-root') reply.initial_binding.root += '-other';
    if (change === 'wrong-id-type') reply.initial_binding.root_identity.ino = 1;
    if (change === 'wrong-sequence') reply.sequence = 2;
    if (change === 'wrong-native') reply.native_id = 'f'.repeat(32);
    if (change === 'falsy') reply.initial_binding = false;
    let reads = 0;
    if (change === 'accessor') Object.defineProperty(reply, 'ok', { enumerable: true, get() { reads++; return true; } });
    assert.throws(() => f.channel.accept(reply), { code: 'STANDALONE_IPC_FAILED' }); await rejected; assert.equal(reads, 0);
  });
function serviceFixture({ fresh = false, prepare, busy = () => false } = {}) {
  const root = path.join(base, `service-${++counter}`), effects = []; let configured = !fresh;
  const deps = {
    lightweightStatus: () => ({ engine_ready: true, local_intake_pending: false, batch_processing_active: false }), localWorkerActive: busy,
    readConfiguredResultRootStatus: () => ({ status: configured ? 'available' : 'unconfigured', root: configured ? root : '' }),
    fs: { mkdirSync(target) { effects.push('default-root'); assert.equal(path.basename(target), 'SecureDataMsg'); } },
    resultOutputDirectory() { assert.fail('native initial start must not create output through Node'); },
    saveConfiguredResultRoot() { effects.push('save'); configured = true; },
    prepareConfiguredInitialOutputRoot: async hook => { effects.push('prepare'); return prepare ? prepare(hook) : (await hook(snapshot()), () => effects.push('recheck')); },
    reserveIntake() { effects.push('reserve'); return { reservation_id: 'c'.repeat(64) }; },
    releaseIntake() { effects.push('release'); },
    startLocalIntakeExecutor(queue, profile, options) { effects.push('worker'); assert.equal(queue.length, 1); assert.equal(profile, 'auto');
      assert.ok(['markdown-only', 'markdown-and-anonymize'].includes(options.processingMode));
      return { ok: true, local_intake_pending: true, batch_token: 'd'.repeat(64), ipcAcknowledgement: Promise.resolve() }; }
  };
  const service = new StandaloneApplicationService({ dependencies: deps, home: base, nativeInitialOutputRequired: true,
    prepareInitialOutputRoot: async () => { effects.push('native'); return {}; } });
  service.admittedQueue = [{ full: path.join(base, 'synthetic.txt'), name: 'synthetic.txt', sourceBytes: 12 }];
  return { service, deps, effects };
}
for (const fresh of [false, true]) for (const processingMode of ['markdown-only', 'markdown-and-anonymize'])
  test(`native service preflights before worker for ${fresh ? 'default' : 'explicit'} root/${processingMode}`, async () => {
    const f = serviceFixture({ fresh }); const result = await f.service.startAdmittedBatch({ processingMode, documentReview: true });
    assert.equal(result.ok, true); assert.equal(f.service.interactionActive, false);
    assert.ok(f.effects.indexOf('native') < f.effects.indexOf('worker')); assert.ok(f.effects.lastIndexOf('recheck') < f.effects.indexOf('worker'));
    assert.deepEqual(f.effects.filter(item => item === 'default-root'), fresh ? ['default-root'] : []);
  });
for (const failure of ['missing-hook', 'falsy', 'native-failure', 'changed-selection', 'recheck-failure', 'busy-after-await'])
  test(`native service starts no worker after ${failure}`, async () => {
    let live = false;
    const f = serviceFixture({ busy: () => live, prepare: async hook => {
      await hook(snapshot());
      if (failure === 'native-failure') throw Object.assign(Error('AI_EXPORT_CONFLICT'), { code: 'AI_EXPORT_CONFLICT' });
      if (failure === 'changed-selection') f.service.admissionRevision++;
      if (failure === 'busy-after-await') live = true;
      return failure === 'falsy' ? null : () => { if (failure === 'recheck-failure') throw Error('changed'); };
    } });
    if (failure === 'missing-hook') f.service.prepareInitialOutputRoot = undefined;
    await assert.rejects(f.service.startAdmittedBatch({ processingMode: 'markdown-only', documentReview: true }));
    assert.equal(f.effects.includes('worker'), false); assert.equal(f.service.interactionActive, false); assert.ok(f.service.admittedQueue);
  });
test('native service exclusion remains held across await and actual worker acknowledgement', async () => {
  let unblock, acknowledge; const waiting = new Promise(resolve => { unblock = resolve; });
  const f = serviceFixture({ prepare: async hook => { await hook(snapshot()); await waiting; return () => {}; } });
  f.deps.startLocalIntakeExecutor = () => { f.effects.push('worker'); return { ok: true, local_intake_pending: true,
    batch_token: 'e'.repeat(64), ipcAcknowledgement: new Promise(resolve => { acknowledge = resolve; }) }; };
  const pending = f.service.startAdmittedBatch({ processingMode: 'markdown-only', documentReview: true });
  await Promise.resolve(); assert.equal(f.service.interactionActive, true);
  await assert.rejects(f.service.configureResults({ path: base }), { code: 'STANDALONE_BUSY' });
  await assert.rejects(f.service.startAdmittedBatch({ processingMode: 'markdown-only' }), { code: 'STANDALONE_BUSY' });
  unblock(); while (!acknowledge) await Promise.resolve(); assert.equal(f.service.interactionActive, true);
  acknowledge(); await pending; assert.equal(f.service.interactionActive, false);
});
test('manual native configuration retains its existing export binding and never mkdirs initial children', async () => {
  const f = serviceFixture(); let saved;
  f.deps.saveConfiguredResultRoot = (root, options) => { saved = { root, options }; };
  const binding = { synthetic: 'native-export-binding' }, selected = path.join(base, 'manual-native-result');
  const result = await f.service.configureResults({ path: selected, prepareNativeExport: async () => binding });
  assert.equal(result.configuration_changed, true); assert.equal(saved.root, selected); assert.equal(saved.options.nativeExport, binding);
  assert.equal(f.effects.includes('prepare'), true); assert.equal(f.effects.includes('worker'), false);
});
test('own reservation is not confused with competing intake and a failed final recheck releases the interaction even if release fails', async () => {
  const good = serviceFixture(); let reserved = false;
  good.deps.reserveIntake = () => { reserved = true; return { reservation_id: 'a'.repeat(64) }; };
  good.deps.lightweightStatus = () => ({ local_intake_pending: reserved, batch_processing_active: false });
  await good.service.startAdmittedBatch({ processingMode: 'markdown-only', documentReview: true });
  assert.equal(good.effects.includes('worker'), true);
  let checks = 0;
  const bad = serviceFixture({ prepare: async () => () => { if (++checks === 2) throw Error('changed after reservation'); } });
  bad.deps.releaseIntake = () => { throw Error('release failed'); };
  await assert.rejects(bad.service.startAdmittedBatch({ processingMode: 'markdown-only', documentReview: true }));
  assert.equal(bad.effects.includes('worker'), false); assert.equal(bad.service.interactionActive, false);
});

for (const [action, fields] of [['continue_history_batch', { batch_id: 'c'.repeat(64) }], ['continue_current_batch', {}],
  ['continue_review_session', {}], ['skip_ocr_contact_review', { batch_id: 'c'.repeat(64) }],
  ['get_run_history', { recover_exports: true, recover_batch_id: 'c'.repeat(64) }]])
  test(`initial native channel permits only first-sequence closed recovery role ${action}`, async () => {
    const frames = [], channel = new NativeExportChannel({ write: frame => frames.push(frame) });
    const session = channel.publication(privateOuter(action, fields));
    const pending = session.send('prepare_initial_output_root', snapshot()), frame = frames[0];
    assert.equal(frame.sequence, 1);
    channel.accept({ schema: PUBLICATION_RESPONSE, request_id: frame.request_id, native_id: frame.native_id, sequence: 1,
      ok: true, initial_binding: { schema: 'datasecure-initial-output-binding/1', root: snapshot().root,
        root_identity: snapshot().admission.identity, markdown_identity: snapshot().admission.identity, output_identity: snapshot().admission.identity } });
    await pending;
    await assert.rejects(session.send('prepare_initial_output_root', snapshot()));
  });
for (const outer of [privateOuter('get_run_history'), privateOuter('get_run_history', { recover_exports: true }),
  privateOuter('continue_history_batch'), privateOuter('continue_current_batch', { root: 'forged' }),
  privateOuter('skip_ocr_contact_review', { batch_id: 'short' })])
  test(`read-only or malformed recovery outer cannot prepare: ${JSON.stringify(outer)}`, async () => {
    const channel = new NativeExportChannel({ write() { assert.fail('must not write'); } });
    await assert.rejects(channel.publication(outer).send('prepare_initial_output_root', snapshot()));
  });
test('configure sequence2 retains nativeId and root only after its own successful configure reply', async () => {
  const fields = snapshot(), frames = [], channel = new NativeExportChannel({ write: frame => frames.push(frame) });
  const outer = privateOuter('configure_results', { native_export_binding: true, source_paths: [fields.root] });
  const session = channel.publication(outer);
  await assert.rejects(session.send('prepare_initial_output_root', fields));
  const configured = session.send('configure_export_root', { root: fields.root }), first = frames[0];
  const id = { volume: '1', object: '2', created_ns: '3' };
  const binding = { schema: 'datasecure-native-export-binding/1', root: fields.root, root_identity: id,
    data_root_identity: id, private_identity: id, private_name: `native-export-${'a'.repeat(32)}`,
    anonymize_identity: id, markdown_identity: id };
  channel.accept({ schema: PUBLICATION_RESPONSE, request_id: first.request_id, native_id: first.native_id, sequence: 1, ok: true, binding });
  await configured;
  await assert.rejects(session.send('prepare_initial_output_root', { ...fields, root: `${fields.root}-other` }));
  const prepared = session.send('prepare_initial_output_root', fields), second = frames[1];
  assert.equal(second.sequence, 2); assert.equal(second.native_id, first.native_id);
  channel.accept({ schema: PUBLICATION_RESPONSE, request_id: second.request_id, native_id: second.native_id, sequence: 2, ok: true,
    initial_binding: { schema: 'datasecure-initial-output-binding/1', root: fields.root,
      root_identity: fields.admission.identity, markdown_identity: fields.admission.identity, output_identity: fields.admission.identity } });
  await prepared;
  await assert.rejects(session.send('prepare_initial_output_root', fields));
  const rejectedFrames = [], rejectedChannel = new NativeExportChannel({ write: frame => rejectedFrames.push(frame) });
  const rejectedSession = rejectedChannel.publication(outer), failed = rejectedSession.send('configure_export_root', { root: fields.root });
  const rejected = assert.rejects(failed), request = rejectedFrames[0];
  rejectedChannel.accept({ schema: PUBLICATION_RESPONSE, request_id: request.request_id, native_id: request.native_id,
    sequence: 1, ok: false, error_code: 'AI_EXPORT_CONFLICT' });
  await rejected; await assert.rejects(rejectedSession.send('prepare_initial_output_root', fields));
});
function resumeFixture(options = {}) {
  const f = serviceFixture(options), token = 'f'.repeat(64); f.service.admittedQueue = null;
  f.deps.runHistory = { find: () => ({ resumable: true, processing_mode: 'markdown-only' }),
    captureExistingExportBindings(options) {
      assert.deepEqual(options, { requireCurrentBindings: true });
      f.effects.push('capture'); return { export_count: 0 };
    } };
  f.deps.continueStandaloneBatch = batchId => { f.effects.push('continue-mutation'); return { ok: true, batch_token: batchId, complete: false }; };
  f.deps.startLocalBatchExecutor = () => { f.effects.push('resume-worker'); return { ok: true, local_processing_started: true, ipcAcknowledgement: Promise.resolve() }; };
  f.deps.skipStandaloneOcrContactReview = () => f.effects.push('skip-mutation');
  f.deps.reviewSession = () => ({ ready: false, worker_active: false });
  return { ...f, token };
}
for (const route of ['history', 'current', 'review', 'skip']) test(`paused old run prepares once before mutation/worker through ${route}`, async () => {
  const f = resumeFixture(); f.service.observedBatchId = f.token;
  if (route === 'review') { f.deps.reviewContinuationBatchId = () => f.token; f.service.reviewSession = () => ({ continuation_available: true }); }
  const result = await (route === 'history' ? f.service.continueHistoryBatch(f.token) : route === 'current' ? f.service.continueCurrentBatch()
    : route === 'review' ? f.service.continueReviewSession() : f.service.skipOcrContactReview(f.token));
  assert.equal(result.ok, true); assert.equal(f.effects.filter(value => value === 'prepare').length, 1);
  assert.ok(f.effects.indexOf('native') < f.effects.indexOf('continue-mutation'));
  if (route === 'skip') assert.ok(f.effects.indexOf('native') < f.effects.indexOf('skip-mutation'));
  assert.equal(f.effects.includes('resume-worker'), true); assert.equal(f.service.interactionActive, false);
});
test('old paused run with no receipt acquires actual private receipt before its continuation mutation', async () => {
  const disk = fixture(), f = resumeFixture();
  assert.equal(fs.existsSync(receipt.receiptPath(disk.root)), false);
  f.deps.readConfiguredResultRootStatus = config.readConfiguredResultRootStatus;
  f.deps.prepareConfiguredInitialOutputRoot = config.prepareConfiguredInitialOutputRoot;
  f.service.prepareInitialOutputRoot = async () => provision(disk.root);
  const original = f.deps.continueStandaloneBatch;
  f.deps.continueStandaloneBatch = token => { assert.equal(receipt.readInitialOutputBinding(disk.root).root, disk.root); return original(token); };
  await f.service.continueHistoryBatch(f.token); assert.equal(f.effects.includes('resume-worker'), true);
});
for (const route of ['continue', 'skip', 'configure']) for (const fault of ['lost-reply', 'busy-after-await', 'abort'])
  test(`${route} ${fault} starts no mutation/replay/worker after preparation boundary`, async () => {
    let active = false; const controller = new AbortController();
    const f = resumeFixture({ busy: () => active, prepare: async hook => {
      await hook(snapshot());
      if (fault === 'lost-reply') throw Object.assign(Error('STANDALONE_CLOSING'), { code: 'STANDALONE_CLOSING' });
      if (fault === 'busy-after-await') active = true;
      if (fault === 'abort') controller.abort();
      return () => {};
    } });
    f.deps.replayPendingResultExports = () => { f.effects.push('replay'); return {}; };
    const action = route === 'continue' ? () => f.service.continueHistoryBatch(f.token, controller.signal)
      : route === 'skip' ? () => f.service.skipOcrContactReview(f.token)
      : () => f.service.configureResults({ path: path.join(base, 'new-output-root'), signal: controller.signal });
    if (route === 'skip' && fault === 'abort') f.service.prepareInitialOutputRoot = async () => { throw Object.assign(Error('STANDALONE_CLOSING'), { code: 'STANDALONE_CLOSING' }); };
    await assert.rejects(action());
    for (const event of ['continue-mutation', 'skip-mutation', 'resume-worker', 'replay']) assert.equal(f.effects.includes(event), false, event);
    assert.equal(f.service.interactionActive, false);
  });
test('active OCR skip submits to existing review without native prep or a new worker', async () => {
  const f = resumeFixture(); let submitted = 0;
  f.deps.reviewSession = () => ({ ready: true, worker_active: true, batch_id: f.token, review_id: 'draft' });
  f.deps.submitReview = (_id, request) => { assert.equal(request.action, 'skipped'); submitted++; };
  const result = await f.service.skipOcrContactReview(f.token);
  assert.equal(result.skip_requested, true); assert.equal(result.skip_recorded, undefined); assert.equal(submitted, 1);
  assert.deepEqual(f.effects, []);
});
test('configure saves selected root, confirms initial binding, then replays under one interaction', async () => {
  const f = resumeFixture();
  f.deps.replayPendingResultExports = () => { assert.equal(f.service.interactionActive, true); f.effects.push('replay'); return {}; };
  await f.service.configureResults({ path: path.join(base, 'configured-root') });
  assert.ok(f.effects.indexOf('capture') < f.effects.indexOf('save'));
  assert.ok(f.effects.indexOf('save') < f.effects.indexOf('prepare'));
  assert.ok(f.effects.lastIndexOf('recheck') < f.effects.indexOf('replay'));
});
function recoveryHistoryFixture({ live = false, stopped = false, markdown = false, completed = false, failure } = {}) {
  const token = crypto.randomBytes(32).toString('hex'), exportId = `re_${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
  const state = { schema: 'datasecure-batch/7', product_channel: 'standalone', token, profile: 'general',
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), standalone_document_review: true,
    processing_mode: markdown ? 'markdown-only' : 'markdown-and-anonymize',
    content_options: { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr: false },
    items: [{ id: 'a'.repeat(32), name: 'synthetic.txt', status: stopped ? 'stopped' : 'released', ...(stopped ? { error_code: 'SOURCE_READ_FAILED' } : {}) }] };
  const effects = [], record = { export_id: exportId, complete: true, run_directory: 'Lauf-20261022-120000-aaaaaaaa', exported_count: 1, pending_count: 0 };
  const deps = { readStates: () => [state], readState: () => state, readExport: () => completed ? record : null,
    readExports: () => completed ? [record] : [], recoverableStates: () => [], liveExecutor: () => live,
    exportCompletedBatchResults: () => { effects.push('export'); if (failure !== undefined) throw failure; return { available: false }; } };
  const history = createRunHistory(deps);
  return { history, deps, state, effects, token, options: { recoverExports: true, recoverBatchId: token } };
}
test('targeted recovery hooks actual eligibility once, preserves cooldown, and passive reads never provision', async () => {
  const f = recoveryHistoryFixture(); let prep = 0, rechecks = 0;
  f.history.history(); assert.deepEqual(f.effects, []);
  const result = await f.history.historyWithRecoveryPreparation(f.options, async () => { prep++; return () => { rechecks++; }; });
  assert.equal(result.export_recovery.outcome, 'pending'); assert.equal(prep, 1); assert.equal(rechecks, 1); assert.deepEqual(f.effects, ['export']);
  const repeated = await f.history.historyWithRecoveryPreparation(f.options, () => assert.fail('cooldown must not prepare'));
  assert.equal(repeated.export_recovery.outcome, 'not_attempted');
});
for (const cause of ['live', 'stopped', 'markdown', 'completed']) test(`targeted ${cause} requires no provisioning when actual collector will not mutate`, async () => {
  const f = recoveryHistoryFixture({ [cause]: true });
  const result = await f.history.historyWithRecoveryPreparation(f.options, () => assert.fail('no mutation planned'));
  assert.equal(result.export_recovery.outcome, 'not_attempted'); assert.deepEqual(f.effects, []);
});
test('targeted recovery rereads eligibility after native await and does not export a newly live worker', async () => {
  const f = recoveryHistoryFixture();
  const result = await f.history.historyWithRecoveryPreparation(f.options, async () => { f.deps.liveExecutor = () => true; return () => assert.fail('now ineligible'); });
  assert.equal(result.export_recovery.outcome, 'not_attempted'); assert.deepEqual(f.effects, []);
});
test('recovery never swallows real preflight errors or falsy thrown export failures', async () => {
  const f = recoveryHistoryFixture(), expected = { sentinel: 'not our sentinel' };
  await assert.rejects(f.history.historyWithRecoveryPreparation(f.options, () => Promise.reject(expected)), error => error === expected);
  assert.deepEqual(f.effects, []);
  const falsy = recoveryHistoryFixture({ failure: null });
  const result = await falsy.history.historyWithRecoveryPreparation(falsy.options, async () => () => {});
  assert.equal(result.export_recovery.outcome, 'failed'); assert.deepEqual(falsy.effects, ['export']);
});
test('native service targeted recovery prepares only at actual mutation; readonly and no-observed resolver never do', async () => {
  const f = resumeFixture(), recovery = recoveryHistoryFixture(); f.deps.runHistory = recovery.history;
  const ordinary = f.service.history(); assert.equal(typeof ordinary.then, 'undefined'); assert.deepEqual(f.effects, []);
  const result = await f.service.history(recovery.options); assert.equal(result.export_recovery.outcome, 'pending');
  assert.equal(f.effects.filter(value => value === 'prepare').length, 1);
  f.effects.length = 0; f.service.observeCurrentRun = () => {};
  await assert.rejects(f.service.resolveCurrentResults(), { code: 'STANDALONE_RESULTS_MISSING' });
  assert.deepEqual(f.effects, []);
});
test('resume rechecks its settings/receipt after continuation mutation before starting the worker', async () => {
  let f;
  f = resumeFixture({ prepare: async () => () => {
    if (f.effects.includes('continue-mutation')) throw Object.assign(Error('STANDALONE_RESULT_ROOT_UNSAFE'), { code: 'STANDALONE_RESULT_ROOT_UNSAFE' });
  } });
  await assert.rejects(f.service.continueHistoryBatch(f.token), { code: 'STANDALONE_RESULT_ROOT_UNSAFE' });
  assert.equal(f.effects.includes('continue-mutation'), true); assert.equal(f.effects.includes('resume-worker'), false);
  assert.equal(f.effects.includes('release'), true); assert.equal(f.service.interactionActive, false);
});
test('production read-only no-observed resolver refuses before ensure or replay even without native adapter', async () => {
  const f = serviceFixture({ fresh: true }); f.service.nativeInitialOutputRequired = false;
  f.service.observeCurrentRun = () => {}; f.deps.publicStatusSnapshot = () => ({});
  f.deps.replayPendingResultExports = () => assert.fail('read-only lookup cannot replay');
  assert.throws(() => f.service.resolveResults(), { code: 'STANDALONE_RESULTS_MISSING' });
  assert.deepEqual(f.effects, []);
});
