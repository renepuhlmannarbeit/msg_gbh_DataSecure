'use strict';

const { createSuite } = require('./helpers');
const fs = require('node:fs');
const path = require('node:path');
const { Module } = require('node:module');
const { EventEmitter } = require('node:events');
const { convertBuffer } = require('../plugins/data-secure/server/standalone/conversion-worker');
const contract = require('../plugins/data-secure/server/standalone/markdown-contract');
const { test, testAsync, assert, done } = createSuite('Conversion content boundary');
const choices = (scanOcr = true, imageOcr = false, markdownOutput = 'content-v1') =>
  ({ schema: 'datasecure-content-options/1', markdownOutput, scanOcr, imageOcr });
const complete = { status: 'complete', reason_codes: [] };

// Protocol fault injection against the actual parent implementation, not an
// OCR/platform proof. Native semantics run in the separate packaged worker gate.
function injectedParent(response, code = 0, runtimeOverrides = {}) {
  const file = path.resolve(__dirname, '../plugins/data-secure/server/standalone/conversion-worker.js');
  const loaded = new Module(file);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  let invocation;
  loaded.require = function(name) {
      if (name === 'node:child_process') return { spawn(command, args, options) {
        invocation = { command, args, options };
        const child = new EventEmitter();
        child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
        child.stdin.end = (_bytes, callback) => { callback(); queueMicrotask(() => { child.stdout.emit('data', Buffer.from(JSON.stringify(response))); child.emit('close', code); }); };
        child.stdin.destroy = () => {}; child.kill = () => true;
        return child;
      } };
      if (name === './conversion-runtime-resolver') return { resolveConversionRuntime: () => ({ root: 'synthetic-runtime', node: 'synthetic-node', ...runtimeOverrides }) };
      if (name === '../native-launcher') return { verifyNativeLauncherArtifact() {} };
      if (name === '../posix-supervisor') return { verifyPosixSupervisor: () => ({ available: true, executable: 'synthetic-supervisor' }) };
      return name.startsWith('.') ? require(path.resolve(path.dirname(file), name)) : require(name);
  };
  loaded._compile(fs.readFileSync(file, 'utf8'), file);
  return { convert: loaded.exports.convertBuffer, invocation: () => invocation };
}

(async () => {
  await testAsync('outer option getters are rejected without evaluation, even on the legacy route', async () => {
    let reads = 0;
    for (const field of ['signal', 'timeoutMs', 'omitDocxHeaderFooter', 'passiveObjects', 'markdownOutput', 'contentOptions']) {
      const options = {};
      Object.defineProperty(options, field, { enumerable: true, get() { reads++; return null; } });
      await assert.rejects(convertBuffer(Buffer.from('Synthetic text'), '.txt', options), { code: 'CONVERSION_INPUT_INVALID' });
    }
    assert.equal(reads, 0);
  });
  await testAsync('intrinsic signal listeners ignore caller method overrides and preserve real cancellation', async () => {
    let calls = 0;
    const signal = new AbortController().signal;
    Object.defineProperty(signal, 'addEventListener', { value() { calls++; } });
    Object.defineProperty(signal, 'removeEventListener', { value() { calls++; } });
    const result = contract.createMarkdownExtraction({ source_type: 'txt', markdown: 'Text', coverage: complete, content_options: choices() });
    await injectedParent({ schema: 'datasecure-conversion-response/2', ok: true, result })
      .convert(Buffer.from('Text'), '.txt', { signal, contentOptions: choices() });
    assert.equal(calls, 0);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(convertBuffer(Buffer.from('Text'), '.txt', { signal: controller.signal }), { code: 'REQUEST_CANCELLED' });
  });
  await testAsync('counterfeit signals and signal getters fail with a fixed code before any work', async () => {
    let reads = 0;
    const signal = new AbortController().signal;
    Object.defineProperty(signal, 'aborted', { get() { reads++; return true; } });
    for (const value of [signal, Object.create(AbortSignal.prototype), new Proxy(new AbortController().signal, {})]) {
      await assert.rejects(convertBuffer(Buffer.from('Synthetic text'), '.txt', { signal: value }), { code: 'CONVERSION_INPUT_INVALID' });
    }
    assert.equal(reads, 0);
  });
  test('all eight complete contracts round-trip as extraction v2 and remain immutable', () => {
    for (const markdownOutput of ['content-v1', 'notes-v1']) for (const scanOcr of [false, true]) for (const imageOcr of [false, true]) {
      const options = choices(scanOcr, imageOcr, markdownOutput);
      const result = contract.createMarkdownExtraction({ source_type: 'txt', markdown: 'Identical bytes', coverage: complete, content_options: options });
      assert.equal(result.schema, 'datasecure-markdown-extraction/2');
      assert.deepEqual(result.content_options, options);
      assert.notEqual(result.content_options, options);
      assert.equal(Object.isFrozen(result.content_options), true);
      assert.equal(contract.validateMarkdownExtractionForOptions(result, options), result);
      assert.throws(() => contract.validateMarkdownExtractionForOptions(result, { ...options, imageOcr: !imageOcr }));
    }
  });
  test('expected contract rejects legacy success, downgrade and unrequested v2', () => {
    const legacy = contract.createMarkdownExtraction({ source_type: 'txt', markdown: 'Text', coverage: complete });
    const current = contract.createMarkdownExtraction({ source_type: 'txt', markdown: 'Text', coverage: complete, content_options: choices() });
    assert.equal(contract.validateMarkdownExtractionForOptions(legacy, undefined), legacy);
    assert.throws(() => contract.validateMarkdownExtractionForOptions(legacy, choices()));
    assert.throws(() => contract.validateMarkdownExtractionForOptions(current, undefined));
    assert.throws(() => contract.validateMarkdownExtraction({ ...current, schema: legacy.schema }));
    assert.throws(() => contract.validateMarkdownExtraction({ ...current, content_options: null }));
    assert.throws(() => contract.createMarkdownExtraction({ source_type: 'txt', markdown: 'Text', coverage: complete, content_options: undefined }));
  });
  await testAsync('actual parent rejects legacy/mismatched worker success and only accepts the exact new echo', async () => {
    const legacy = contract.createMarkdownExtraction({ source_type: 'txt', markdown: 'Text', coverage: complete });
    const current = contract.createMarkdownExtraction({ source_type: 'txt', markdown: 'Text', coverage: complete, content_options: choices() });
    for (const response of [
      { schema: 'datasecure-conversion-response/1', ok: true, result: legacy },
      { schema: 'datasecure-conversion-response/2', ok: true, result: legacy },
      { schema: 'datasecure-conversion-response/2', ok: true, result: { ...current, content_options: choices(false, false) } },
      { schema: 'datasecure-conversion-response/2', ok: true, result: { ...current, extra: true } }
    ]) await assert.rejects(injectedParent(response).convert(Buffer.from('Text'), '.txt', { contentOptions: choices() }), { code: 'CONVERSION_RESPONSE_INVALID' });
    const parent = injectedParent({ schema: 'datasecure-conversion-response/2', ok: true, result: current });
    assert.deepEqual(await parent.convert(Buffer.from('Text'), '.txt', { contentOptions: choices() }), current);
    assert.equal(parent.invocation().args.filter(value => value.startsWith('content-options-v1:')).length, 1);
    assert.equal(parent.invocation().args.some(value => value.startsWith('markdown-output-')), false);
    await assert.rejects(injectedParent({ schema: 'datasecure-conversion-response/2', ok: true, result: current })
      .convert(Buffer.from('Text'), '.txt', {}), { code: 'CONVERSION_RESPONSE_INVALID' });
  });
  await testAsync('relocated macOS addon gets one exact read grant and no ambient native-loader override', async () => {
    const current = contract.createMarkdownExtraction({ source_type: 'txt', markdown: 'Text', coverage: complete, content_options: choices() });
    const response = { schema: 'datasecure-conversion-response/2', ok: true, result: current };
    const addon = path.resolve('Synthetic app.app/Contents/Frameworks/skia.darwin-arm64.node');
    const parent = injectedParent(response, 0, { canvasNative: addon });
    await parent.convert(Buffer.from('Text'), '.txt', { contentOptions: choices() });
    const invocation = parent.invocation();
    assert.equal(invocation.options.env.NAPI_RS_NATIVE_LIBRARY_PATH, addon);
    assert.equal(invocation.options.env.PATH, '');
    assert.equal(invocation.options.shell, false);
    assert.equal(invocation.args.filter(value => value === `--allow-fs-read=${addon}`).length, 1);
    assert.equal(invocation.args.includes(`--allow-fs-read=${path.dirname(addon)}`), false);
    assert.equal(invocation.options.env.NODE_OPTIONS, undefined);
    const unchanged = injectedParent(response);
    await unchanged.convert(Buffer.from('Text'), '.txt', { contentOptions: choices() });
    assert.equal(unchanged.invocation().options.env.NAPI_RS_NATIVE_LIBRARY_PATH, undefined);
    assert.equal(unchanged.invocation().args.filter(value => value.startsWith('--allow-fs-read=')).length, 1);
  });
  await testAsync('null, partial, aliases, inherited fields and conflicting profiles never reach a converter', async () => {
    for (const options of [
      { contentOptions: null }, { contentOptions: undefined }, { contentOptions: {} },
      { content_options: choices() }, { contentOptions: choices(), markdownOutput: 'content-v1' },
      { contentOptions: { ...choices(), scanOcr: 1 } }, { contentOptions: { ...choices(), imageOcr: 'false' } },
      Object.create({ contentOptions: choices() }), { contentOptions: choices(), unknown: true }
    ]) await assert.rejects(convertBuffer(Buffer.from('Text'), '.txt', options), { code: 'CONVERSION_INPUT_INVALID' });
  });
  await testAsync('standalone images need explicit image OCR, regardless of scan consent', async () => {
    for (const extension of ['.png', '.bmp', '.jpg', '.jpeg']) for (const scanOcr of [false, true]) {
      // Deliberately undecodable: policy must reject before decode/runtime/OCR.
      await assert.rejects(convertBuffer(Buffer.from([1]), extension, { contentOptions: choices(scanOcr, false) }), { code: 'IMAGE_OCR_REQUIRED' });
    }
  });
  test('PDF policy never equates native headers or image size with semantic source roles', () => {
    const { pdfOcrAction } = require('../plugins/data-secure/server/core/content-ocr-plan');
    for (const hasNativeText of [false, true]) for (const omittedSymbols of [false, true]) {
      const facts = { hasNativeText, hasPaintedImage: true, hasNonTextGraphicPaint: false, omittedSymbols };
      assert.equal(pdfOcrAction(choices(false, false), facts).action, 'none');
      assert.equal(pdfOcrAction(choices(true, true), facts).action, 'page');
      for (const options of [choices(true, false), choices(false, true)]) assert.equal(pdfOcrAction(options, facts).action, 'scope-required');
    }
    assert.equal(pdfOcrAction(choices(true, false), { hasNativeText: true, hasPaintedImage: false, hasNonTextGraphicPaint: false, omittedSymbols: false }).action, 'none');
    assert.equal(pdfOcrAction(choices(true, true), { hasNativeText: true, hasPaintedImage: false, hasNonTextGraphicPaint: true, omittedSymbols: false }).action, 'page');
    assert.throws(() => pdfOcrAction(choices(), { hasNativeText: true, hasPaintedImage: true, omittedSymbols: false, scan: true }));
  });
  test('private PDF metadata is closed, bounded and never folded into Markdown', () => {
    const metadata = { schema: 'datasecure-private-document-metadata/1', source_type: 'pdf', entries: [{ key: 'Author', value: 'Synthetic Private Author' }] };
    const result = contract.createMarkdownExtraction({ source_type: 'pdf', markdown: 'Visible author stays here', coverage: complete,
      content_options: choices(), private_document_metadata: metadata });
    assert.equal(result.markdown, 'Visible author stays here');
    assert.deepEqual(result.private_document_metadata, metadata);
    assert.equal(Object.isFrozen(result.private_document_metadata.entries[0]), true);
    for (const bad of [null, { ...metadata, extra: true }, { ...metadata, entries: [{ key: 'path', value: 'private' }] },
      { ...metadata, entries: [{ key: 'Author', value: '\ud800' }] }, { ...metadata, entries: [{ key: 'Author', value: 'x'.repeat(4097) }] },
      { ...metadata, entries: [metadata.entries[0], metadata.entries[0]] }]) {
      assert.throws(() => contract.createMarkdownExtraction({ source_type: 'pdf', markdown: 'Text', coverage: complete,
        content_options: choices(), private_document_metadata: bad }));
    }
    assert.throws(() => contract.createMarkdownExtraction({ source_type: 'txt', markdown: 'Text', coverage: complete,
      content_options: choices(), private_document_metadata: metadata }));
    assert.throws(() => contract.createMarkdownExtraction({ source_type: 'pdf', markdown: 'Text', coverage: complete, private_document_metadata: metadata }));
    let reads = 0;
    const executable = [{ key: 'Author', value: 'private' }];
    Object.defineProperty(executable, '0', { enumerable: true, get() { reads++; return metadata.entries[0]; } });
    assert.throws(() => contract.createMarkdownExtraction({ source_type: 'pdf', markdown: 'Text', coverage: complete,
      content_options: choices(), private_document_metadata: { ...metadata, entries: executable } }));
    assert.equal(reads, 0);
  });
  test('legacy artifact publication cannot strip a new options binding', () => {
    const { createMarkdownArtifact } = require('../plugins/data-secure/server/standalone/markdown-artifact');
    const current = contract.createMarkdownExtraction({ source_type: 'txt', markdown: 'Text', coverage: complete, content_options: choices() });
    assert.throws(() => createMarkdownArtifact(current, `dm_${'a'.repeat(32)}`));
  });
  done();
})().catch(error => { console.error(error); process.exitCode = 1; });
