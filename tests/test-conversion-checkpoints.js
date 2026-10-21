'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { createSuite } = require('./helpers');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { CheckpointStream, createCheckpointEmitter, recoveryReason, MAX_TRANSPORT_BYTES,
  MAX_RESPONSE_BYTES } = require('../plugins/data-secure/server/standalone/conversion-checkpoints');
const { test, testAsync, assert, done } = createSuite('Private bounded conversion checkpoints');
const options = Object.freeze({ schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: true });
const unit = (text = 'Sicherer Text äöüß', changes = {}) => createMarkdownExtraction({ source_type: 'pdf',
  content_options: options, markdown: text, coverage: { status: 'incomplete', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] }, ...changes });
const frame = (result = unit(), index = 0, sequence = 1) => ({ schema: 'datasecure-conversion-unit/1', sequence, index, result });
const bytes = value => Buffer.from(JSON.stringify(value));
const line = value => Buffer.concat([bytes(value), Buffer.from('\n')]);
const response = result => ({ schema: 'datasecure-conversion-response/2', ok: true, result });
const failure = code => ({ schema: 'datasecure-conversion-response/2', ok: false, error_code: code });
const stream = () => new CheckpointStream('pdf', options);

test('transport allowance covers bounded units/update/final but no product text/OS increase', () => {
  assert.equal(MAX_TRANSPORT_BYTES, MAX_RESPONSE_BYTES * 3 + 8 * 1024 * 1024);
  assert.equal(require('../plugins/data-secure/server/resource-limits').RESOURCE_LIMITS.MAX_TEXT_CHARS, 8000000);
  assert.throws(() => new CheckpointStream('md', options));
  assert.throws(() => new CheckpointStream('pdf'));
});
test('chunk boundaries split UTF-8 and JSON safely without changing German characters', () => {
  const s = stream(), payload = Buffer.concat([line(frame()), bytes(response(unit()))]);
  for (const byte of payload) s.push(Buffer.from([byte]));
  assert.deepEqual(s.response(), response(unit()));
  assert.equal(s.recover('CONVERSION_RESOURCE_LIMIT').markdown, 'Sicherer Text äöüß');
});
test('only last unit may update once; appended units stay ordered', () => {
  const s = stream();
  s.push(line(frame(unit('## Seite 1\n\nErste'), 0, 1)));
  s.push(line(frame(unit('## Seite 1\n\nErste OCR'), 0, 2)));
  s.push(line(frame(unit('## Seite 2\n\nZweite'), 1, 3)));
  assert.equal(s.recover('CONVERSION_TIMEOUT').markdown, '## Seite 1\n\nErste OCR\n\n## Seite 2\n\nZweite');
});
for (const [name, mutate] of [
  ['sequence gap', value => { value.sequence = 3; }],
  ['unknown field', value => { value.source = '/private'; }],
  ['unit index gap', value => { value.index = 2; }],
  ['wrong source type', value => { value.result = { ...value.result, source_type: 'docx' }; }],
  ['wrong options', value => { value.result = { ...value.result, content_options: { ...options, scanOcr: false } }; }],
  ['wrong schema', value => { value.result = { ...value.result, schema: 'datasecure-markdown-extraction/1' }; }],
  ['lone surrogate', value => { value.result = { ...value.result, markdown: '\ud800' }; }],
  ['unknown notice', value => { value.result = { ...value.result, coverage: { status: 'incomplete', reason_codes: ['UNTRUSTED_URL'] } }; }],
  ['invalid contact offsets', value => { value.result = { ...value.result, coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED'] },
    ocr_contacts: [{ start: 0, end: 1000, page: 1, line: 1, kind: 'email' }] }; }]
]) test(`malformed complete ${name} poisons all earlier units`, () => {
  const s = stream(); s.push(line(frame()));
  const value = frame(unit(), 1, 2); mutate(value);
  assert.throws(() => s.push(line(value)));
  assert.equal(s.recover('CONVERSION_RESOURCE_LIMIT'), null);
});
test('earlier update and third update are refused', () => {
  for (const earlier of [true, false]) {
    const s = stream(); s.push(line(frame()));
    if (earlier) s.push(line(frame(unit(), 1, 2)));
    else s.push(line(frame(unit('changed'), 0, 2)));
    assert.throws(() => s.push(line(frame(unit('invalid'), 0, 3))));
  }
});
test('aggregate text bound applies across units including join characters', () => {
  const s = stream(); s.push(line(frame(unit('a'.repeat(4000000)))));
  assert.throws(() => s.push(line(frame(unit('b'.repeat(4000000)), 1, 2))));
  assert.equal(s.recover('CONVERSION_RESOURCE_LIMIT'), null);
});
test('contact offsets rebase exactly while page and line provenance stay intact', () => {
  const s = stream(); s.push(line(frame(unit('Erster Text'))));
  const second = unit('Kontakt: test@example.invalid', {
    coverage: { status: 'incomplete', reason_codes: ['OCR_CONTACT_VALUES_UNVERIFIED', 'SOURCE_COVERAGE_UNVERIFIED'] },
    ocr_contacts: [{ start: 9, end: 29, page: 8, line: 3, kind: 'email' }] });
  s.push(line(frame(second, 1, 2)));
  const result = s.recover('CONVERSION_TIMEOUT');
  assert.equal(result.markdown.slice(result.ocr_contacts[0].start, result.ocr_contacts[0].end), 'test@example.invalid');
  assert.deepEqual(result.ocr_contacts[0], { start: 22, end: 42, page: 8, line: 3, kind: 'email' });
});
test('empty/heading-only PDF units do not invent a useful result', () => {
  for (const text of ['', '  ', '## Seite 1', '## Seite 1\n\n## Seite 2\n']) {
    const s = stream(); s.push(line(frame(unit(text))));
    assert.equal(s.recover('CONVERSION_TIMEOUT'), null);
  }
});
test('an empty native Office checkpoint cannot rescue a timeout; later actual OCR or literal source text can', () => {
  const office = markdown => unit(markdown,{source_type:'pptx'});
  for (const cause of ['CONVERSION_TIMEOUT','CONVERSION_RESOURCE_LIMIT','CONVERSION_OCR_TEXT_EMPTY']) {
    const s = new CheckpointStream('pptx',options);
    s.push(line(frame(office(''))));
    assert.equal(s.recover(cause),null);
    s.push(line(frame(office('Äußerer Bildtext'),1,2)));
    assert.equal(s.recover(cause).markdown,'Äußerer Bildtext');
  }
  const s = new CheckpointStream('pptx',options);
  s.push(line(frame(office('# Folie 1'))));
  assert.equal(s.recover('CONVERSION_TIMEOUT').markdown,'# Folie 1','real literal source headings are not deleted by a text regex');
});
test('empty omitted units keep their notice but not a document-empty warning', () => {
  const s = stream(); s.push(line(frame(unit())));
  s.push(line(frame(unit('', { coverage: { status: 'incomplete', reason_codes: ['OCR_TEXT_EMPTY', 'PDF_PAGE_NOT_READ'] } }), 1, 2)));
  const result = s.recover('CONVERSION_TIMEOUT');
  assert.ok(result.coverage.reason_codes.includes('PDF_PAGE_NOT_READ'));
  assert.ok(!result.coverage.reason_codes.includes('OCR_TEXT_EMPTY'));
});
test('only explicit recoverable errors acquire a fixed incomplete reason', () => {
  const s = stream(); s.push(line(frame()));
  for (const code of ['CONVERSION_POLICY_FAILED', 'CONVERSION_MODEL_INVALID', 'REQUEST_CANCELLED', 'CONVERSION_RESPONSE_INVALID',
    'CONVERSION_OUTPUT_LIMIT', 'CONVERSION_ISOLATION_FAILED', 'CONVERSION_INPUT_INCOMPLETE', 'CONVERSION_TERMINATION_UNCONFIRMED',
    'SOURCE_ENCRYPTED_UNSUPPORTED', 'PPTX_STRUCTURE_UNSAFE', 'CONVERSION_EXTRACTION_FAILED',
    'MARKDOWN_EXTRACTION_FAILED']) assert.equal(s.recover(code), null, code);
  for (const code of ['CONVERSION_TIMEOUT', 'CONVERSION_RESOURCE_LIMIT', 'TEXT_TOO_LARGE', 'PDF_EXTRACTION_FAILED']) {
    assert.ok(s.recover(code).coverage.reason_codes.includes(recoveryReason(code)));
  }
});
test('truncated terminal JSON is ignored only on confirmed timeout/resource end', () => {
  for (const code of ['CONVERSION_TIMEOUT', 'CONVERSION_RESOURCE_LIMIT']) {
    const s = stream(); s.push(line(frame())); s.push(Buffer.from('{"schema":"datasecure-conversion-response/2","ok":tr'));
    assert.ok(s.recover(code));
  }
  const s = stream(); s.push(line(frame())); s.push(Buffer.from('{"schema":"datasecure-conversion-response/2","ok":tr'));
  assert.equal(s.recover('PDF_EXTRACTION_FAILED'), null);
});
test('complete bad JSON, forged terminal and invalid UTF-8 cannot hide behind a checkpoint', () => {
  for (const bad of [Buffer.from('{"schema":"datasecure-conversion-response/2","ok":tr}'), bytes({ ok: true }),
    bytes(failure('MADE_UP_ERROR')), bytes(failure('CONVERSION_POLICY_FAILED')), Buffer.from([0xff])]) {
    const s = stream(); s.push(line(frame())); s.push(bad);
    assert.equal(s.recover('CONVERSION_RESOURCE_LIMIT'), null);
  }
});
test('interruption does not excuse a complete object plus garbage or impossible JSON prefixes', () => {
  for (const suffix of ['{"schema":"datasecure-conversion-response/2","ok":true}junk',
    '{"schema":"datasecure-conversion-unit/1","result":truX',
    '{"schema":"datasecure-conversion-unit/1","result":01',
    '{"schema":"datasecure-conversion-unit/1",}',
    '{"schema":"datasecure-conversion-unit/1","result":"bad\\q']) {
    const s = stream(); s.push(line(frame())); s.push(Buffer.from(suffix));
    assert.equal(s.recover('CONVERSION_RESOURCE_LIMIT'), null);
  }
});
test('terminal record prevents later checkpoint records or additional bytes', () => {
  const s = stream(); s.push(line(response(unit())));
  assert.throws(() => s.push(line(frame())));
});
test('a null or primitive complete record poisons the stream immediately', () => {
  for (const value of [null, 0, false, [], 'not a frame']) {
    const s = stream(); s.push(line(frame()));
    assert.throws(() => s.push(line(value)));
    assert.equal(s.recover('CONVERSION_RESOURCE_LIMIT'), null);
  }
});
testAsync('emitter waits for the real output promise and refuses concurrent queueing', async () => {
  let release; const written = [];
  const emit = createCheckpointEmitter({ type: 'pdf', contentOptions: options,
    write: chunk => { written.push(chunk); return new Promise(resolve => { release = resolve; }); } });
  const first = emit(unit(), 0);
  await assert.rejects(emit(unit('parallel'), 1));
  assert.equal(written.length, 1); release(); await first;
  const second = emit(unit('next'), 1); release(); await second;
  const s = stream(); written.forEach(chunk => s.push(chunk)); assert.equal(s.units.sequence, 2);
});
testAsync('emitter output failure prevents all subsequent writes', async () => {
  let writes = 0;
  const emit = createCheckpointEmitter({ type: 'pdf', contentOptions: options,
    write: async () => { writes++; throw new Error('own output failure'); } });
  await assert.rejects(emit(unit(), 0)); await assert.rejects(emit(unit(), 1));
  assert.equal(writes, 1);
});

// Execute the actual production parent closure, replacing only OS launch/clock
// dependencies. These are lifecycle counterexamples, not native OS test claims.
function parentModel({ legacy = false, flush = true } = {}) {
  const filename = path.resolve(__dirname, '../plugins/data-secure/server/standalone/conversion-worker.js');
  const originalRequire = createRequire(filename), child = new EventEmitter(), timers = new Map();
  let nextTimer = 0, killed = 0;
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.stdin.end = (_bytes, callback) => { if (flush) callback(); };
  child.stdin.destroy = () => {};
  child.kill = () => { killed++; return true; };
  const module = { exports: {} };
  const localRequire = name => {
    if (name === 'node:child_process') return { spawn: () => child };
    if (name === './conversion-runtime-resolver') return { resolveConversionRuntime: () => ({ node: 'bound-node', root: __dirname }) };
    if (name === '../native-launcher') return { verifyNativeLauncherArtifact() {} };
    if (name === '../posix-supervisor') return { verifyPosixSupervisor: () => ({ available: true, executable: 'bound-supervisor' }) };
    return originalRequire(name);
  };
  new Function('require', 'module', '__dirname', 'setTimeout', 'clearTimeout', fs.readFileSync(filename, 'utf8'))(
    localRequire, module, path.dirname(filename), (callback, ms) => { const id = ++nextTimer; timers.set(id, { callback, ms }); return id; },
    id => timers.delete(id));
  const controller = new AbortController();
  const promise = module.exports.convertBuffer(Buffer.from('bound original bytes'), '.pdf',
    { timeoutMs: 1000, signal: controller.signal, ...(legacy ? {} : { contentOptions: options }) });
  const tick = ms => { const entry = [...timers].find(([, timer]) => timer.ms === ms); assert.ok(entry); timers.delete(entry[0]); entry[1].callback(); };
  return { promise, child, controller, tick, killed: () => killed, timers,
    send: value => child.stdout.emit('data', Buffer.isBuffer(value) ? value : line(value)), close: code => child.emit('close', code) };
}
testAsync('actual parent releases a checkpoint only after confirmed resource close', async () => {
  const m = parentModel(); let settled = false; m.promise.then(() => { settled = true; });
  m.send(frame()); await Promise.resolve(); assert.equal(settled, false);
  m.close(125); const result = await m.promise;
  assert.ok(result.coverage.reason_codes.includes('CONVERSION_RESOURCE_LIMIT_PARTIAL')); assert.equal(m.timers.size, 0);
});
testAsync('actual parent timeout needs child close; missing close rejects at unchanged grace', async () => {
  const m = parentModel(); m.send(frame()); m.tick(1000); assert.equal(m.killed(), 1);
  m.tick(1500); await assert.rejects(m.promise, error => error.code === 'CONVERSION_TERMINATION_UNCONFIRMED');
});
testAsync('actual parent confirmed timeout yields an incomplete result', async () => {
  const m = parentModel(); m.send(frame()); m.tick(1000); m.close(null);
  assert.ok((await m.promise).coverage.reason_codes.includes('CONVERSION_TIMEOUT_PARTIAL'));
});
testAsync('actual parent explicit cancellation while reaping a timeout still refuses partial recovery', async () => {
  const m = parentModel(); m.send(frame()); m.tick(1000); m.controller.abort(); m.close(125);
  await assert.rejects(m.promise, error => error.code === 'REQUEST_CANCELLED');
});
testAsync('actual parent stderr overflow after timeout prevents partial recovery', async () => {
  const m = parentModel(); m.send(frame()); m.tick(1000);
  m.child.stderr.emit('data', Buffer.alloc(64 * 1024 + 1));
  assert.equal(m.killed(), 1, 'a later hard fault must not restart termination or its grace period');
  assert.deepEqual([...m.timers.values()].map(timer => timer.ms), [1500]);
  m.close(125);
  await assert.rejects(m.promise, error => error.code === 'CONVERSION_OUTPUT_LIMIT');
});
testAsync('actual parent complete protocol fault after timeout keeps its nonrecoverable cause', async () => {
  const m = parentModel(); m.send(frame()); m.tick(1000); m.send(Buffer.from('{"bad":}\n')); m.close(125);
  await assert.rejects(m.promise, error => error.code === 'CONVERSION_RESPONSE_INVALID');
});
testAsync('actual parent cancellation wins before or after a late output fault', async () => {
  for (const cancelFirst of [true, false]) {
    const m = parentModel(); m.send(frame()); m.tick(1000);
    if (cancelFirst) m.controller.abort();
    m.child.stderr.emit('data', Buffer.alloc(64 * 1024 + 1));
    if (!cancelFirst) m.controller.abort();
    m.close(125);
    await assert.rejects(m.promise, error => error.code === 'REQUEST_CANCELLED');
    assert.equal(m.killed(), 1);
  }
});
testAsync('actual parent late output fault does not relax the original termination grace', async () => {
  const m = parentModel(); m.send(frame()); m.tick(1000);
  m.child.stderr.emit('data', Buffer.alloc(64 * 1024 + 1)); m.tick(1500);
  await assert.rejects(m.promise, error => error.code === 'CONVERSION_TERMINATION_UNCONFIRMED');
});
testAsync('actual parent cancellation and isolation/input failures never recover', async () => {
  for (const kind of ['cancel', 'isolation', 'input']) {
    const m = parentModel({ flush: kind !== 'input' }); m.send(frame());
    if (kind === 'cancel') m.controller.abort();
    m.close(kind === 'isolation' ? 122 : 125);
    await assert.rejects(m.promise, error => error.code === ({ cancel: 'REQUEST_CANCELLED', isolation: 'CONVERSION_ISOLATION_FAILED', input: 'CONVERSION_RESOURCE_LIMIT' })[kind]);
  }
});
testAsync('actual parent valid terminal local failure may recover but policy failures never do', async () => {
  for (const code of ['PDF_EXTRACTION_FAILED', 'CONVERSION_POLICY_FAILED']) {
    const m = parentModel(); m.send(frame()); m.send(bytes(failure(code))); m.close(2);
    if (code === 'PDF_EXTRACTION_FAILED') assert.ok((await m.promise).coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
    else await assert.rejects(m.promise, error => error.code === code);
  }
});
testAsync('actual parent protocol failure invalidates previous units and stops worker', async () => {
  const m = parentModel(); m.send(frame()); m.send(Buffer.from('{"bad":}\n')); m.close(125);
  assert.equal(m.killed(), 1); await assert.rejects(m.promise, error => error.code === 'CONVERSION_RESPONSE_INVALID');
});
testAsync('actual parent unchanged legacy response refuses checkpoint protocol', async () => {
  const m = parentModel({ legacy: true }); m.send(frame()); m.send(bytes(response(unit()))); m.close(0);
  await assert.rejects(m.promise, error => error.code === 'CONVERSION_RESPONSE_INVALID');
});
testAsync('actual parent accepts current normal success with no checkpoint', async () => {
  const m = parentModel(); m.send(bytes(response(unit()))); m.close(0);
  assert.deepEqual(await m.promise, unit());
});

done();
