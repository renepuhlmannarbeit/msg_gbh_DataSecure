'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { NativeExportChannel, RESPONSE_SCHEMA, PUBLICATION_RESPONSE } = require('../plugins/data-secure/server/standalone/native-export-channel');
const { FrameDecoder, validatePrivateMessage } = require('../plugins/data-secure/server/standalone/desktop-ipc');
const { validNativeDirectoryIdentity } = require('../plugins/data-secure/server/core/native-directory-identity');
const outer = () => ({ schema: 'datasecure-standalone-private-ipc/1', action: 'configure_results',
  native_export_binding: true, request_id: '1'.repeat(16), source_paths: ['/synthetic/results'] });
const identity = { volume: '18446744073709551615', object: '340282366920938463463374607431768211455', created_ns: '9007199254740993' };
function setup() {
  const frames = []; const channel = new NativeExportChannel({ write: value => frames.push(value), timeoutMs: 100 });
  const promise = channel.bindResultRoot(outer());
  const reply = { schema: RESPONSE_SCHEMA, request_id: frames[0].request_id, native_id: frames[0].native_id, sequence: 1, ok: true, identity };
  return { channel, frames, promise, reply };
}
test('native identities preserve u128 precision and reject coercion and unexpected fields', () => {
  assert.ok(validNativeDirectoryIdentity(identity));
  for (const value of [{ ...identity, volume: '18446744073709551616' }, { ...identity, object: '340282366920938463463374607431768211456' },
    { ...identity, created_ns: 9007199254740992 }, { ...identity, created_ns: '01' }, { ...identity, extra: '1' }, null])
    assert.equal(validNativeDirectoryIdentity(value), false);
});
test('closed internal channel binds only the exact outstanding callback, not renderer commands', async () => {
  const { channel, frames, promise, reply } = setup();
  assert.equal(frames[0].root, outer().source_paths[0]);
  assert.match(frames[0].native_id, /^[a-f0-9]{32}$/u);
  assert.throws(() => validatePrivateMessage(reply));
  const bytes = Buffer.from(JSON.stringify(reply)); const header = Buffer.alloc(4); header.writeUInt32BE(bytes.length);
  assert.throws(() => new FrameDecoder().push(Buffer.concat([header, bytes])));
  channel.accept(reply); assert.deepEqual(await promise, identity);
  assert.throws(() => channel.accept(reply), { code: 'STANDALONE_IPC_FAILED' });
});
test('forged response rejects pending operation; no retry or metadata adoption', async () => {
  for (const change of [{ sequence: 2 }, { native_id: 'f'.repeat(32) }, { request_id: 'a'.repeat(16) },
    { identity: { ...identity, object: 123 } }, { extra: true }, { ok: false, error_code: 'raw OS path' }]) {
    const { channel, promise, reply } = setup();
    const rejected = assert.rejects(promise, { code: 'STANDALONE_IPC_FAILED' });
    assert.throws(() => channel.accept({ ...reply, ...change }), { code: 'STANDALONE_IPC_FAILED' });
    await rejected; assert.equal(channel.pending, null);
  }
});
test('native refusal, owner shutdown and deadline remain distinct failures', async () => {
  const refused = setup();
  const { identity: omitted, ...envelope } = refused.reply;
  refused.channel.accept({ ...envelope, ok: false, error_code: 'STANDALONE_RESULT_ROOT_UNSAFE' });
  await assert.rejects(refused.promise, { code: 'STANDALONE_RESULT_ROOT_UNSAFE' });
  const cancelled = setup(); cancelled.channel.abort();
  await assert.rejects(cancelled.promise, { code: 'STANDALONE_CLOSING' });
  const channel = new NativeExportChannel({ write() {}, timeoutMs: 5 });
  await assert.rejects(channel.bindResultRoot(outer()), { code: 'STANDALONE_IPC_TIMEOUT' });
  assert.equal(channel.pending, null);
});
test('metadata callbacks require explicit native opt-in; no legacy callback expansion', async () => {
  const channel = new NativeExportChannel({ write() { assert.fail('must not send'); } });
  const { native_export_binding: omitted, ...legacy } = outer();
  await assert.rejects(channel.bindResultRoot(legacy), { code: 'STANDALONE_IPC_FAILED' });
  assert.throws(() => validatePrivateMessage({ ...outer(), native_export_binding: false }));
  assert.throws(() => validatePrivateMessage({ ...outer(), action: 'get_public_state' }));
  assert.deepEqual(validatePrivateMessage(outer()), outer());
});

test('publication callbacks keep ownership past the metadata timeout and correlate monotonic replies', async () => {
  const frames = [], channel = new NativeExportChannel({ write: v => frames.push(v), timeoutMs: 5 });
  const session = channel.publication({ request_id: 'a'.repeat(16) });
  const first = session.send('export_documents', { command: 'reconcile', operation: {} });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(channel.pending, 'no timer may release a native writer');
  function reply(status) { const f = frames.at(-1); return { schema: PUBLICATION_RESPONSE, request_id: f.request_id,
    native_id: f.native_id, sequence: f.sequence, ok: true, status }; }
  channel.accept(reply('completed')); assert.equal(await first, 'completed');
  const second = session.send('export_documents', { command: 'acknowledge', operation: {} });
  assert.equal(frames.at(-1).sequence, 2); assert.equal(frames[0].native_id, frames[1].native_id);
  channel.accept(reply('acknowledged')); assert.equal(await second, 'acknowledged');
});

test('publication status cannot masquerade as metadata or admit arbitrary failure details', async () => {
  for (const change of [{ sequence: 2 }, { status: 'success' }, { extra: 'path' }, { error_code: 'vendor path', ok: false }]) {
    const frames = [], channel = new NativeExportChannel({ write: v => frames.push(v) });
    const pending = channel.publication({ request_id: 'a'.repeat(16) }).send('export_documents', { command: 'publish', operation: {} });
    const rejected = assert.rejects(pending, { code: 'STANDALONE_IPC_FAILED' });
    const f = frames[0];
    assert.throws(() => channel.accept({ schema: PUBLICATION_RESPONSE, request_id: f.request_id, native_id: f.native_id,
      sequence: 1, ok: true, status: 'completed', ...change }), { code: 'STANDALONE_IPC_FAILED' });
    await rejected;
  }
});

test('body transfers permit bounded multi-frame sessions but never publish-status replies for body writes', async () => {
  const frames = [], channel = new NativeExportChannel({ write: v => frames.push(v) });
  const session = channel.publication({ request_id: 'a'.repeat(16) });
  for (let sequence = 1; sequence <= 8; sequence++) {
    const pending = session.send('export_documents', { command: 'write_body', operation: {}, body: {} });
    const frame = frames.at(-1); assert.equal(frame.sequence, sequence);
    channel.accept({ schema: PUBLICATION_RESPONSE, request_id: frame.request_id, native_id: frame.native_id,
      sequence, ok: true, status: sequence === 8 ? 'staged' : 'receiving' });
    assert.equal(await pending, sequence === 8 ? 'staged' : 'receiving');
  }
  const pending = session.send('export_documents', { command: 'write_body', operation: {}, body: {} });
  const rejected = assert.rejects(pending, { code: 'STANDALONE_IPC_FAILED' }), frame = frames.at(-1);
  assert.throws(() => channel.accept({ schema: PUBLICATION_RESPONSE, request_id: frame.request_id, native_id: frame.native_id,
    sequence: frame.sequence, ok: true, status: 'completed' }), { code: 'STANDALONE_IPC_FAILED' });
  await rejected;
});
