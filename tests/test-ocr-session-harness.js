'use strict';
const { createSuite } = require('./helpers');
const {
  RESULT_SCHEMA,
  encodeFrame,
  createOcrSessionHarness
} = require('../plugins/data-secure/server/ocr-session-harness');
const { testAsync, done, assert } = createSuite('OCR session harness (inactive engineering path)');

async function main() {
  await testAsync('encodes only bounded opaque frames and closes after one validated request', async () => {
    const frame = encodeFrame('a'.repeat(32), 20, 10, Buffer.from('synthetic-png'));
    const session = createOcrSessionHarness({
      execute: async ({ requestId }) => ({ schema: RESULT_SCHEMA, request_id: requestId, result: { ok: true } }),
      validateResult: (value) => assert.deepStrictEqual(value, { ok: true })
    });
    assert.deepStrictEqual(await session.request(frame), { ok: true });
    assert.deepStrictEqual(session.status(), { active: false, closed: true, frames: 1, sessionBytes: 13 });
    await assert.rejects(() => session.request(frame), (error) => error.code === 'OCR_SESSION_CLOSED');
  });
  await testAsync('invalid frames, concurrent requests and invalid results fail closed', async () => {
    const frame = encodeFrame('b'.repeat(32), 20, 10, Buffer.from('synthetic-png'));
    const envelope = ({ requestId }, result = { ok: true }) => ({ schema: RESULT_SCHEMA, request_id: requestId, result });
    const invalid = createOcrSessionHarness({ execute: envelope, validateResult: () => {} });
    await assert.rejects(() => invalid.request(Buffer.from([0, 0, 0, 1, 0])), (error) => error.code === 'OCR_SESSION_FRAME_INVALID');
    const delayed = createOcrSessionHarness({
      execute: async (request) => new Promise((resolve) => setImmediate(() => resolve(envelope(request)))),
      validateResult: () => {}, maxFrames: 2
    });
    const first = delayed.request(frame);
    await assert.rejects(() => delayed.request(frame), (error) => error.code === 'OCR_SESSION_SINGLE_FLIGHT');
    await first;
    assert.strictEqual(delayed.status().closed, true);
    const badResult = createOcrSessionHarness({ execute: (request) => envelope(request, { unsafe: true }), validateResult: () => { throw new Error('invalid result'); } });
    await assert.rejects(() => badResult.request(frame), /invalid result/);
    assert.strictEqual(badResult.status().closed, true);
  });
  await testAsync('replayed requests and mismatched responses close the whole inactive session', async () => {
    const first = encodeFrame('c'.repeat(32), 20, 10, Buffer.from('first'));
    const session = createOcrSessionHarness({
      execute: async ({ requestId }) => ({ schema: RESULT_SCHEMA, request_id: requestId, result: { ok: true } }),
      validateResult: () => {}, maxFrames: 3
    });
    await session.request(first);
    await assert.rejects(() => session.request(first), (error) => error.code === 'OCR_SESSION_REQUEST_REPLAY');
    assert.strictEqual(session.status().closed, true);

    const mismatch = createOcrSessionHarness({
      execute: async () => ({ schema: RESULT_SCHEMA, request_id: 'd'.repeat(32), result: { ok: true } }),
      validateResult: () => {}, maxFrames: 2
    });
    await assert.rejects(() => mismatch.request(first), (error) => error.code === 'OCR_SESSION_RESPONSE_MISMATCH');
  });
  await testAsync('closed schemas, pixel, byte, time and abort limits fail closed without processing', async () => {
    let calls = 0;
    const execute = async ({ requestId }) => {
      calls++;
      return { schema: RESULT_SCHEMA, request_id: requestId, result: { ok: true } };
    };
    const valid = encodeFrame('e'.repeat(32), 2, 2, Buffer.from('12345'));
    const extraHeader = Buffer.from(valid);
    const separator = extraHeader.indexOf(0, 4);
    const header = JSON.parse(extraHeader.subarray(4, separator).toString('utf8'));
    header.extra = true;
    const encodedHeader = Buffer.from(JSON.stringify(header));
    const length = Buffer.alloc(4);
    length.writeUInt32BE(encodedHeader.length + 1 + 5);
    const malformed = Buffer.concat([length, encodedHeader, Buffer.from([0]), Buffer.from('12345')]);
    const schemaSession = createOcrSessionHarness({ execute, validateResult: () => {} });
    await assert.rejects(() => schemaSession.request(malformed), (error) => error.code === 'OCR_SESSION_FRAME_INVALID');

    assert.throws(() => encodeFrame('f'.repeat(32), 100_000, 100_000, Buffer.from('x')), /OCR_SESSION_FRAME_INVALID/);
    const byteSession = createOcrSessionHarness({ execute, validateResult: () => {}, maxFrames: 2, maxSessionBytes: 4 });
    await assert.rejects(() => byteSession.request(valid), (error) => error.code === 'OCR_SESSION_RESOURCE_LIMIT');
    let tick = 0;
    const timeSession = createOcrSessionHarness({ execute, validateResult: () => {}, maxSessionMs: 5, now: () => tick });
    tick = 6;
    await assert.rejects(() => timeSession.request(valid), (error) => error.code === 'OCR_SESSION_RESOURCE_LIMIT');
    const controller = new AbortController();
    controller.abort();
    const abortSession = createOcrSessionHarness({ execute, validateResult: () => {} });
    await assert.rejects(() => abortSession.request(valid, { signal: controller.signal }), (error) => error.code === 'OCR_SESSION_ABORTED');
    assert.strictEqual(calls, 0);
  });
  done();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
