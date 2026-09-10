import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeStandaloneRuntime } from '../scripts/lib/standalone-runtime-projection.mjs';
import { collectConversionRuntime, writeConversionRuntime } from '../scripts/lib/standalone-conversion-runtime.mjs';
import { removePackageSmokeScope } from './helpers/standalone-package-scope.mjs';

const require = createRequire(import.meta.url);
const { decodePng } = require('../plugins/data-secure/server/images/png');
const { encodeBmp } = require('../plugins/data-secure/server/images/bmp');
const { xlsxCounterexample, bmp32 } = require('./lib/conversion-counterexamples');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.platform === 'win32' && process.arch === 'x64' ? 'windows-x64'
  : process.platform === 'darwin' && ['x64', 'arm64'].includes(process.arch) ? `macos-${process.arch}`
    : process.platform === 'linux' && process.arch === 'x64' ? 'linux-x64-glibc' : null;
if (!target) throw new Error('CONVERSION_TEST_HOST_UNSUPPORTED');
// Resolve target-native fixture dependencies only after the explicit host gate.
const { office, image, pdf, encryptedPdf, text } = await import('./helpers/conversion-fixtures.mjs');
const scope = fs.mkdtempSync(path.join(repo, '.tmp-standalone-package-conversion-'));
const server = path.join(scope, 'server');
const runtime = path.join(server, 'standalone', 'conversion-runtime');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const originalSpawn = childProcess.spawn, children = [];
function headerFooterDocx() {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zipStore([
    ...opcControlEntries('docx', { additionalOverrides: [
      { part: 'word/header1.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml' },
      { part: 'word/footer1.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml' }
    ] }),
    ['word/document.xml', `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body><w:p><w:r><w:t>BODY PRIVATE</w:t></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="head"/><w:footerReference w:type="default" r:id="foot"/></w:sectPr></w:body></w:document>`],
    ['word/_rels/document.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="head" Type="${R}/header" Target="header1.xml"/><Relationship Id="foot" Type="${R}/footer" Target="footer1.xml"/></Relationships>`],
    ['word/header1.xml', `<w:hdr xmlns:w="${W}"><w:p><w:r><w:t>HEADER PRIVATE</w:t></w:r></w:p></w:hdr>`],
    ['word/footer1.xml', `<w:ftr xmlns:w="${W}"><w:p><w:r><w:t>FOOTER PRIVATE</w:t></w:r></w:p></w:ftr>`]
  ]);
}
let observeSpawn;
childProcess.spawn = (...args) => {
  const child = originalSpawn(...args);
  const entry = { child, closed: false, kill: child.kill.bind(child) };
  entry.done = new Promise(resolve => child.once('close', () => { entry.closed = true; resolve(); }));
  children.push(entry); observeSpawn?.(child, args);
  return child;
};
let passed = 0;
async function test(name, fn) { await fn(); passed++; process.stdout.write(`ok ${passed} - ${name}\n`); }

try {
  await test('offline runtime is pinned, deterministic, target-specific and self-contained', () => {
    const a = collectConversionRuntime(repo, target), b = collectConversionRuntime(repo, target);
    assert.deepEqual(a.map(item => [item.relative, hash(item.bytes)]), b.map(item => [item.relative, hash(item.bytes)]));
    assert.ok(a.some(item => item.relative.endsWith('.node')));
    assert.ok(!a.some(item => item.relative.includes('/.bin/') || item.relative.includes('/pilot/')));
    assert.throws(() => collectConversionRuntime(repo, 'unsupported-target'), /CONVERSION_PACKAGE_TARGET_UNSUPPORTED/u);
    writeStandaloneRuntime(path.join(repo, 'plugins', 'data-secure', 'server'), server, target);
    writeConversionRuntime(repo, runtime, target);
    assert.throws(() => writeConversionRuntime(repo, runtime, target), /CONVERSION_PACKAGE_DESTINATION_EXISTS/u);
  });
  const { convertBuffer } = require(path.join(server, 'standalone', 'conversion-worker.js'));
  const { extractSourceForPrivacy } = require(path.join(server, 'core', 'markdown-first-privacy.js'));
  const extractWideSourceForPrivacy = (bytes, extension, options = {}) => extractSourceForPrivacy(
    bytes,
    extension,
    { ...options, productChannel: 'standalone' }
  );
  async function convert(input, extension, options) {
    const original = hash(input);
    const result = await convertBuffer(input, extension, options);
    assert.equal(hash(input), original);
    assert.equal(result.anonymized, false); assert.equal(result.processing_mode, 'markdown-only');
    assert.ok(children.every(entry => entry.closed), 'success follows real supervisor close');
    return result;
  }
  for (const extension of ['.txt', '.md', '.csv', '.docx', '.xlsx', '.pptx']) {
    await test(`packaged real ${extension} preserves names and bank data`, async () => {
      const bytes = ['.docx', '.xlsx', '.pptx'].includes(extension) ? office(extension.slice(1)) :
        Buffer.from(extension === '.csv' ? `Feld,Wert\nName,${text}` : `${text}\ne\u0301\u00a0  Original\r\n`);
      const result = await convert(bytes, extension);
      assert.match(result.markdown, /Max(?: |&#32;)Mustermann/u); assert.match(result.markdown, /Nordstern(?: |&#32;)GmbH/u);
      assert.match(result.markdown, /DE89370400440532013000/u);
      if (extension === '.txt' || extension === '.md') assert.equal(result.markdown, bytes.toString('utf8'));
    });
  }
  await test('packaged DOCX keeps header and footer for conversion but omits them for privacy', async () => {
    const bytes = headerFooterDocx();
    const converted = await convert(bytes, '.docx');
    assert.match(converted.markdown, /BODY PRIVATE/u);
    assert.match(converted.markdown, /HEADER PRIVATE/u);
    assert.match(converted.markdown, /FOOTER PRIVATE/u);
    const privacy = await convert(bytes, '.docx', { omitDocxHeaderFooter: true });
    assert.match(privacy.markdown, /BODY PRIVATE/u);
    assert.doesNotMatch(privacy.markdown, /HEADER PRIVATE|FOOTER PRIVATE|## Kopfzeile|## Fußzeile/u);
    assert.ok(privacy.coverage.reason_codes.includes('DOCX_HEADER_FOOTER_EXCLUDED_BY_POLICY'));
  });
  await test('real packaged XLSX becomes Markdown once and proceeds to privacy with separate source coverage', async () => {
    const bytes = office('xlsx');
    const before = hash(bytes);
    const result = await extractWideSourceForPrivacy(bytes, '.xlsx', { convertBuffer });
    assert.match(result.markdown, /Max(?: |&#32;)Mustermann/u);
    assert.equal(result.sourceExtractionCoverage.status, 'incomplete');
    assert.ok(result.sourceExtractionCoverage.reason_codes.includes('SOURCE_COVERAGE_UNVERIFIED'));
    assert.equal(hash(bytes), before);
    assert.ok(children.every(entry => entry.closed), 'privacy handoff follows confirmed converter termination');
  });
  await test('XLSX corruption crosses real OPC admission and worker into a stopped item; the next source exports with exact columns', async () => {
    const saved = new Map(['EU_PRIVACY_DATA_ROOT', 'EU_PRIVACY_ROOT', 'EU_PRIVACY_RESULT_ROOT'].map(key => [key, process.env[key]]));
    const directory = path.join(scope, 'xlsx-regression'); fs.mkdirSync(directory);
    process.env.EU_PRIVACY_DATA_ROOT = path.join(directory, 'data');
    process.env.EU_PRIVACY_ROOT = path.join(directory, 'private');
    process.env.EU_PRIVACY_RESULT_ROOT = path.join(directory, 'visible'); fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT);
    try {
      const { SafeError } = require(path.join(server, 'runtime'));
      const { inspectSourceFormatFromFd } = require(path.join(server, 'gateway', 'source-format-inspector'));
      const { createBatchItemProcessor } = require(path.join(server, 'gateway', 'batch-item-processor'));
      const { createBatchDelivery } = require(path.join(server, 'gateway', 'batch-delivery'));
      const store = require(path.join(server, 'standalone', 'markdown-store'));
      const { exportCompletedState, visibleExportDirectory } = require(path.join(server, 'gateway', 'result-export'));
      const sources = [xlsxCounterexample({ overrides: [['xl/worksheets/sheet1.xml',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>SECRET PREFIX</t></is></c></row><row r="2"><c r="B2">']] }),
      xlsxCounterexample({ prefix: 'sheet', quote: "'", strict: true })];
      const state = { schema: 'datasecure-batch/5', product_channel: 'standalone', processing_mode: 'markdown-only',
        token: crypto.randomBytes(32).toString('hex'), created_at: new Date().toISOString(), io_summary: {},
        items: sources.map((_, index) => ({ id: crypto.randomBytes(16).toString('hex'), name: index ? 'ledger.xlsx' : 'broken.xlsx',
          source_label: index ? 'ledger.xlsx' : 'broken.xlsx', status: 'pending' })) };
      const prohibited = () => { throw new Error('Privacy operation invoked for standalone conversion'); };
      const writeState = value => fs.writeFileSync(path.join(directory, 'journal.json'), JSON.stringify(value));
      const processor = createBatchItemProcessor({ SafeError, writeState, anonymizeNext: prohibited,
        packageIdForItem: prohibited, reviewSingleBatchTextLocally: prohibited, incrementPrivateIoSummary: prohibited,
        ensureMappingOutbox: prohibited, markMappingPending: prohibited, commitPendingMapping: prohibited,
        appendMapping() {}, invalidateUnpublishedBatchCopies() {}, cleanupTerminalWorkCopy(_state, item) { delete item.work_copy_cleanup_pending; },
        createPhaseRecorder: () => ({ mark() {}, snapshot: () => ({}) }), publicProgress: () => ({}), writeTerminalEvidence: () => true });
      for (let index = 0; index < sources.length; index++) {
        const item = state.items[index], bytes = sources[index], source = path.join(directory, item.name);
        fs.writeFileSync(source, bytes, { flag: 'wx' });
        const fd = fs.openSync(source, fs.constants.O_RDONLY);
        try {
          const admission = inspectSourceFormatFromFd(fd, fs.fstatSync(fd), '.xlsx', { processingMode: 'markdown-only', productChannel: 'standalone' });
          assert.equal(admission.verdict, 'candidate'); assert.equal(admission.structure.crc_verified, true);
        } finally { fs.closeSync(fd); }
        const entry = { name: item.name, private_bytes: Buffer.from(bytes), expected_sha256: hash(bytes) };
        const result = await processor.processSingleBatchItem(state, item, entry, { convertBuffer });
        assert.equal(result.ok, Boolean(index)); assert.ok(entry.private_bytes.every(byte => byte === 0));
        assert.deepEqual(fs.readFileSync(source), bytes); assert.ok(children.every(child => child.closed));
        if (!index) {
          assert.equal(item.status, 'stopped'); assert.equal(item.error_code, 'XLSX_STRUCTURE_UNSAFE');
          assert.equal(Object.hasOwn(item, 'artifact_id'), false);
          assert.equal(fs.existsSync(path.join(store.artifactRoot(), `dm_${item.id}`)), false);
          assert.doesNotMatch(JSON.stringify(result), /SECRET PREFIX/u);
          assert.equal(exportCompletedState(state).available, false);
        }
      }
      const item = state.items[1];
      assert.equal(item.status, 'delivery_pending'); assert.equal(store.verifyMarkdownItem(item), true);
      assert.match(store.readMarkdownArtifact(item.artifact_id).markdown, /\| Debit \| Credit \|\n\|  \| 1000 \|\n\|  \|  \|/u);
      const delivery = createBatchDelivery({ SafeError, active: new Set(), acquireActiveLock() {}, releaseActiveLock() { return true; },
        readState: () => state, writeState, assertLocalExecutorAccess() {}, regularPublishedPackage: () => false,
        issueReadCapability: prohibited, publicProgress: () => ({}), writeTerminalEvidence: () => true });
      delivery.finalizePublishedPackageLocally(state.token, item.artifact_id);
      assert.equal(item.status, 'released');
      assert.equal(exportCompletedState(state).available, true);
      const run = visibleExportDirectory(state.token), names = fs.readdirSync(run);
      assert.deepEqual(names, ['ledger.md']);
      assert.equal(fs.existsSync(path.join(run, 'DataSecure-Zuordnung.csv')), false,
        'pure conversion keeps the original basename and needs no visible mapping');
    } finally {
      for (const [key, value] of saved) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
  const canvas = image(), png = canvas.toBuffer('image/png'), jpeg = canvas.toBuffer('image/jpeg');
  const bitmap = decodePng(png), bmp = encodeBmp(bitmap);
  for (const [extension, bytes] of [['.png', png], ['.bmp', bmp], ['.jpeg', jpeg]]) {
    await test(`packaged real ${extension} offline OCR retains identifiers with honest incomplete coverage`, async () => {
      const result = await convert(bytes, extension);
      assert.match(result.markdown, /Max Mustermann/u); assert.match(result.markdown, /Nordstern GmbH/u);
      assert.equal(result.coverage.status, 'incomplete');
      assert.deepEqual(result.coverage.reason_codes, ['OCR_NOT_VERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED']);
    });
  }
  await test('independent 32-bit BI_RGB with zero unused bytes remains visible through actual local OCR', async () => {
    for (const topDown of [false, true]) {
      const bytes = bmp32(bitmap, { topDown, unused: 0 });
      assert.equal(bytes.readUInt16LE(28), 32); assert.equal(bytes.readUInt32LE(30), 0);
      const result = await convert(bytes, '.bmp');
      assert.match(result.markdown, /Max Mustermann/u); assert.match(result.markdown, /Nordstern GmbH/u);
      assert.equal(result.coverage.status, 'incomplete'); assert.ok(!result.coverage.reason_codes.includes('OCR_TEXT_EMPTY'));
    }
  });
  await test('blank image is a warned empty conversion, never a complete extraction', async () => {
    const result = await convert(image(true).toBuffer('image/png'), '.png');
    assert.ok(result.coverage.reason_codes.includes('OCR_TEXT_EMPTY'));
  });
  await test('PDF uses native text, scan OCR and mixed-page extraction automatically without duplicated text', async () => {
    const pure = await convert(pdf([{ text }]), '.pdf');
    assert.match(pure.markdown, /Max Mustermann/u);
    assert.ok(!pure.coverage.reason_codes.includes('OCR_NOT_VERIFIED'));
    const scan = await convert(pdf([{ image: jpeg }]), '.pdf');
    assert.match(scan.markdown, /Max Mustermann/u); assert.ok(scan.coverage.reason_codes.includes('OCR_NOT_VERIFIED'));
    const mixed = await convert(pdf([{ text: 'Text page Max Mustermann' }, { image: jpeg }]), '.pdf');
    assert.match(mixed.markdown, /## Seite 1[\s\S]*Text page Max Mustermann[\s\S]*## Seite 2[\s\S]*Nordstern GmbH/u);
    assert.equal((mixed.markdown.match(/Max Mustermann/gu) || []).length, 2);
  });
  await test('PDF native text plus a textless image remains usable with omissions', async () => {
    const blankJpeg = image(true).toBuffer('image/jpeg');
    const source = pdf([{ text: 'Readable native text', image: blankJpeg, invisibleText: true }]);
    const result = await convert(source, '.pdf');
    assert.match(result.markdown, /Readable native text/u);
    assert.equal(result.coverage.status, 'incomplete');
    assert.ok(result.coverage.reason_codes.includes('OCR_NOT_VERIFIED'));
    assert.ok(!result.coverage.reason_codes.includes('OCR_TEXT_EMPTY'));
    const privacyInput = await extractWideSourceForPrivacy(source, '.pdf', { convertBuffer });
    assert.match(privacyInput.markdown, /Readable native text/u);
    assert.equal(privacyInput.sourceExtractionCoverage.status, 'incomplete');
  });
  await test('every real wide format hands useful Markdown to privacy with explicit source coverage', async () => {
    const sources = [
      ['.pptx', office('pptx')], ['.pdf', pdf([{ text }])], ['.pdf', pdf([{ image: jpeg }])],
      ['.png', png], ['.jpg', jpeg], ['.jpeg', jpeg], ['.bmp', bmp]
    ];
    for (const [extension, bytes] of sources) {
      const before = hash(bytes);
      const result = await extractWideSourceForPrivacy(bytes, extension, { convertBuffer });
      assert.ok(result.markdown.trim().length > 0, `${extension} supplies useful Markdown`);
      assert.ok(['complete', 'incomplete'].includes(result.sourceExtractionCoverage.status));
      assert.equal(hash(bytes), before, `${extension} source remains unchanged`);
      assert.ok(children.every(entry => entry.closed), `${extension} handoff follows converter termination`);
    }
  });
  await test('empty real OCR output remains fail-closed before privacy publication', async () => {
    const bytes = image(true).toBuffer('image/png');
    await assert.rejects(extractWideSourceForPrivacy(bytes, '.png', { convertBuffer }),
      cause => cause.code === 'PARSER_COVERAGE_UNVERIFIED');
    assert.ok(children.every(entry => entry.closed));
  });
  await test('PDF annotations stop while standard document metadata is retained as literal source text', async () => {
    await assert.rejects(convertBuffer(pdf([{ text, annotation: true }]), '.pdf'),
      cause => cause.code === 'PDF_OBJECT_COVERAGE_UNVERIFIED' && !cause.message.includes('Private'));
    const metadata = await convert(pdf([{ text }], '', { info: true }), '.pdf');
    assert.match(metadata.markdown, /# Dokumentmetadaten/u);
    assert.match(metadata.markdown, /Title: Private title/u);
    assert.match(metadata.markdown, /Author: Max Mustermann/u);
    assert.ok(children.every(entry => entry.closed));
  });
  await test('PDF forms, signatures, attachments, JavaScript and encryption stop through the real packaged parser', async () => {
    const activeSources = [
      ['AcroForm', pdf([{ text }], '', { form: true })],
      ['signature', pdf([{ text }], '', { signature: true })],
      ['attachment', pdf([{ text }], '', { attachment: true })],
      ['JavaScript', pdf([{ text }], '/OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >>')]
    ];
    for (const [label, source] of activeSources) {
      await assert.rejects(convertBuffer(source, '.pdf'),
        cause => cause.code === 'PDF_OBJECT_COVERAGE_UNVERIFIED', `${label} must stop`);
      assert.ok(children.every(entry => entry.closed));
    }
    for (const password of ['', 'secret']) {
      await assert.rejects(convertBuffer(encryptedPdf(password), '.pdf'),
        cause => cause.code === 'SOURCE_ENCRYPTED_UNSUPPORTED');
      assert.ok(children.every(entry => entry.closed));
    }
  });
  await test('hybrid PDF retains a scan body beside native page numbers and headers with one OCR session', async () => {
    let sessions = 0;
    observeSpawn = child => {
      let diagnostics = '';
      child.stderr.on('data', chunk => { diagnostics += chunk.toString('utf8'); });
      child.once('close', () => { sessions += (diagnostics.match(/CONVERSION_OCR_READY/gu) || []).length; });
    };
    try {
      const hybrid = await convert(pdf([{ image: jpeg, text: '1' }, { image: jpeg, text: 'Customer report' }]), '.pdf');
      assert.match(hybrid.markdown, /## Seite 1[\s\S]*1[\s\S]*Max Mustermann[\s\S]*Nordstern GmbH/u);
      assert.match(hybrid.markdown, /## Seite 2[\s\S]*Customer report[\s\S]*Max Mustermann[\s\S]*Nordstern GmbH/u);
      assert.equal((hybrid.markdown.match(/Customer report/gu) || []).length, 1, 'rendered native header is not appended again');
      assert.ok(hybrid.coverage.reason_codes.includes('OCR_NOT_VERIFIED'));
      assert.equal(hybrid.coverage.status, 'incomplete');
      assert.equal(sessions, 1, 'one real OCR session is reused for both hybrid pages');
    } finally { observeSpawn = null; }
  });
  await test('hybrid text layer is retained exactly and is not duplicated by its scanned image', async () => {
    const nativeLines = ['MAX  MUSTERMANN', 'Nordstern GmbH', 'Projektmanager Software Tester'];
    const native = await convert(pdf([{ textLines: nativeLines, invisibleText: true }]), '.pdf');
    const hybrid = await convert(pdf([{ image: jpeg, textLines: nativeLines, invisibleText: true }]), '.pdf');
    assert.equal(hybrid.markdown, native.markdown, 'comparison never rewrites text extracted by PDF.js');
    assert.match(hybrid.markdown, /MAX MUSTERMANN/u);
    assert.equal((hybrid.markdown.match(/mustermann/giu) || []).length, 1);
    assert.equal((hybrid.markdown.match(/Nordstern GmbH/gu) || []).length, 1);
    assert.equal((hybrid.markdown.match(/Projektmanager Software Tester/gu) || []).length, 1);
    assert.ok(hybrid.coverage.reason_codes.includes('OCR_NOT_VERIFIED'));
    assert.doesNotMatch(hybrid.markdown, /Zusätzlicher Bildtext/u);
  });
  await test('native PDF text, including unused image resources, never starts OCR', async () => {
    let starts = 0;
    observeSpawn = child => {
      let diagnostics = '';
      child.stderr.on('data', chunk => { diagnostics += chunk.toString('utf8'); });
      child.once('close', () => { starts += (diagnostics.match(/CONVERSION_OCR_STARTING/gu) || []).length; });
    };
    try {
      for (const source of [{ text }, { text, image: jpeg, unpaintedImage: true }]) {
        const result = await convert(pdf([source]), '.pdf');
        assert.match(result.markdown, /Max Mustermann/u);
        assert.ok(!result.coverage.reason_codes.includes('OCR_NOT_VERIFIED'));
      }
      assert.equal(starts, 0);
    } finally { observeSpawn = null; }
  });
  await test('malformed input returns fixed failures and never raw contents', async () => {
    for (const [input, extension, code] of [[Buffer.from('"SECRET'), '.csv', 'CSV_QUOTE_INVALID'],
      [Buffer.from('SECRET'), '.pdf', 'PDF_EXTRACTION_FAILED'], [Buffer.from('SECRET'), '.png', 'CONVERSION_IMAGE_INVALID'],
      [Buffer.from('SECRET'), '.jpeg', 'CONVERSION_IMAGE_INVALID']]) {
      await assert.rejects(convertBuffer(input, extension), cause => cause.code === code && !cause.message.includes('SECRET'));
      assert.ok(children.every(entry => entry.closed));
    }
  });
  await test('runtime IPC is local, restricted, fresh-environment and never source-path based', async () => {
    observeSpawn = (_child, [command, args, options]) => {
      assert.ok(command.startsWith(server)); assert.equal(options.windowsHide, true);
      assert.equal(options.shell, false); assert.ok(args.some(item => item.endsWith('conversion-worker-child.js')));
      assert.ok(args.some(item => item.endsWith('conversion-runtime\\node.exe') || item.endsWith('conversion-runtime/node')));
      assert.ok(!Object.hasOwn(options.env, 'NODE_OPTIONS')); assert.ok(!Object.hasOwn(options.env, 'HOME'));
      assert.ok(args.includes('--permission')); assert.ok(args.includes('--allow-addons'));
    };
    try { await convert(Buffer.from(text), '.txt'); } finally { observeSpawn = null; }
  });
  await test('bad API, pre-abort and unsupported source never launch a process', async () => {
    const before = children.length, controller = new AbortController(); controller.abort();
    await assert.rejects(convertBuffer(Buffer.from(text), '.txt', { signal: controller.signal }), { code: 'REQUEST_CANCELLED' });
    await assert.rejects(convertBuffer('https://example.invalid/source', '.txt'), { code: 'CONVERSION_INPUT_INVALID' });
    await assert.rejects(convertBuffer(Buffer.from(text), '.exe'), { code: 'MARKDOWN_FORMAT_UNSUPPORTED' });
    await assert.rejects(convertBuffer(Buffer.from(text), 'constructor'), { code: 'MARKDOWN_FORMAT_UNSUPPORTED' });
    await assert.rejects(convertBuffer(Buffer.from(text), '.txt', { runtime: 'anything' }), { code: 'CONVERSION_INPUT_INVALID' });
    assert.equal(children.length, before);
  });
  await test('inflight cancellation after actual OCR readiness confirms supervisor termination', async () => {
    const controller = new AbortController(); let ready = false;
    observeSpawn = child => { let log = ''; child.stderr.on('data', chunk => {
      log += chunk.toString(); if (!ready && log.includes('CONVERSION_OCR_READY')) { ready = true; controller.abort(); }
    }); };
    try { await assert.rejects(convertBuffer(png, '.png', { signal: controller.signal }), { code: 'REQUEST_CANCELLED' }); }
    finally { observeSpawn = null; }
    assert.equal(ready, true); assert.ok(children.every(entry => entry.closed));
  });
  await test('timeout confirms process termination rather than returning a hanging promise', async () => {
    await assert.rejects(convertBuffer(png, '.png', { timeoutMs: 1 }), { code: 'CONVERSION_TIMEOUT' });
    assert.ok(children.every(entry => entry.closed));
  });
  await test('native Windows assignment is atomic and 60 early cancellations leave no stdio-owning orphan', async () => {
    if (process.platform !== 'win32') return;
    const native = fs.readFileSync(path.join(repo, 'native', 'windows', 'datasecure-sandbox.cpp'), 'utf8');
    assert.ok(native.indexOf('PROC_THREAD_ATTRIBUTE_JOB_LIST') < native.indexOf('const BOOL created = CreateProcessW'));
    assert.doesNotMatch(native, /\bAssignProcessToJobObject\s*\(/u);
    assert.match(native, /IsProcessInJob/u);
    for (let i = 0; i < 60; i++) {
      await assert.rejects(convertBuffer(Buffer.from(text), '.txt', { timeoutMs: 1 + i % 3 }), { code: 'CONVERSION_TIMEOUT' });
      assert.ok(children.every(entry => entry.closed), `early termination ${i} confirmed every inherited pipe closed`);
    }
  });
  await test('truncated real stdin cannot promote a successfully parseable prefix to complete Markdown', async () => {
    observeSpawn = child => {
      const end = child.stdin.end.bind(child.stdin);
      child.stdin.end = (bytes, callback) => end(bytes.subarray(0, 3), callback);
    };
    try { await assert.rejects(convertBuffer(Buffer.from(text), '.txt'), { code: 'CONVERSION_INPUT_INCOMPLETE' }); }
    finally { observeSpawn = null; }
    assert.ok(children.every(entry => entry.closed));
  });
  await test('refused termination has a bounded distinct failure, no automatic escalation', async () => {
    let attempts = 0;
    const controller = new AbortController();
    observeSpawn = child => {
      child.stdin.end = () => child.stdin; // Real child waits for bytes; no output/result mock.
      child.kill = () => { attempts++; return false; };
      queueMicrotask(() => controller.abort());
    };
    try {
      await assert.rejects(convertBuffer(png, '.png', { signal: controller.signal }), { code: 'CONVERSION_TERMINATION_UNCONFIRMED' });
      assert.equal(attempts, 1); assert.equal(children.at(-1).closed, false);
    } finally {
      observeSpawn = null;
      const entry = children.at(-1); if (!entry.closed) entry.kill('SIGTERM');
      await entry.done;
    }
  });
  await test('missing or changed packaged resource has no system/pilot fallback', async () => {
    const model = path.join(runtime, 'models', 'eng.traineddata');
    const original = fs.readFileSync(model), changed = Buffer.from(original); changed[0] ^= 1;
    const before = children.length;
    // All files are fresh copies under this checked disposable scope.
    fs.writeFileSync(model, changed);
    await assert.rejects(convertBuffer(Buffer.from(text), '.txt'), { code: 'CONVERSION_RUNTIME_UNAVAILABLE' });
    fs.writeFileSync(model, original);
    const runtimeManifest = path.join(runtime, 'RUNTIME.json'), manifest = fs.readFileSync(runtimeManifest);
    fs.unlinkSync(runtimeManifest);
    await assert.rejects(convertBuffer(Buffer.from(text), '.txt'), { code: 'CONVERSION_RUNTIME_UNAVAILABLE' });
    fs.writeFileSync(runtimeManifest, manifest, { flag: 'wx' });
    assert.equal(children.length, before);
  });
  await test('100 small sources reuse validated runtime bytes rather than rehashing 188 MB per file', async () => {
    // Restore/cache after the deliberately changed manifest in the prior test.
    await convert(Buffer.from(text), '.txt');
    const originalRead = fs.readFileSync;
    let heavyReads = 0, heavyBytes = 0;
    fs.readFileSync = function(file, ...args) {
      const result = originalRead.call(this, file, ...args);
      if (typeof file === 'string' && file.startsWith(runtime + path.sep) && !file.endsWith('RUNTIME.json')) {
        heavyReads++; heavyBytes += Buffer.byteLength(result);
      }
      return result;
    };
    const started = performance.now();
    try { for (let i = 0; i < 100; i++) await convert(Buffer.from(`${text}\nDocument ${i}`), '.txt'); }
    finally { fs.readFileSync = originalRead; }
    assert.equal(heavyReads, 0); assert.equal(heavyBytes, 0);
    process.stdout.write(`100-TXT packaged runtime: ${Math.round(performance.now() - started)} ms; repeated heavy runtime reads: ${heavyReads}\n`);
  });
  process.stdout.write(`${passed} packaged conversion groups passed\n`);
} finally {
  childProcess.spawn = originalSpawn;
  for (const entry of children) if (!entry.closed) entry.kill('SIGTERM');
  let timer;
  try { await Promise.race([Promise.all(children.map(entry => entry.done)), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('CONVERSION_TEST_CLEANUP_UNCONFIRMED')), 6000);
  })]); } finally { clearTimeout(timer); }
  removePackageSmokeScope(repo, scope);
}
