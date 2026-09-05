import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '../native/ocr/pilot/node_modules/@napi-rs/canvas/index.js';
import png from '../plugins/data-secure/server/images/png.js';
import bmp from '../plugins/data-secure/server/images/bmp.js';
import markdownContract from '../plugins/data-secure/server/standalone/markdown-contract.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pilot = path.join(root, 'native/ocr/pilot');
const children = [];
const originalSpawn = childProcess.spawn;
let onSpawn;
let passed = 0;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Observe, never replace, actual owned child processes. This proves lifecycle
// completion and preload/permission arguments without substituting OCR results.
childProcess.spawn = (...args) => {
  const child = originalSpawn(...args);
  const tracked = { child, args, closed: false };
  tracked.closedPromise = new Promise((resolve) => child.once('close', () => { tracked.closed = true; resolve(); }));
  children.push(tracked);
  onSpawn?.(child);
  return child;
};
syncBuiltinESMExports();
const { extractImageMarkdown, imageMarkdownEngineeringContract } = await import('../native/ocr/pilot/markdown.mjs');

function fixture(blank = false) {
  const canvas = createCanvas(1500, 370);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (!blank) {
    context.fillStyle = '#000000';
    context.font = '52px Arial';
    context.fillText('Max Mustermann', 45, 85);
    context.fillText('Nordstern GmbH', 45, 180);
    context.fillText('Projektmanager Software Tester', 45, 275);
  }
  return canvas.toBuffer('image/png');
}

async function test(name, callback) {
  try {
    await callback();
    assert.ok(children.every((entry) => entry.closed), 'the API must settle only after each owned process closed');
    passed += 1;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (error) {
    process.stderr.write(`  ✗ ${name}\n`);
    throw error;
  } finally { onSpawn = null; }
}

async function rejectsCode(code, callback) {
  await assert.rejects(callback, (error) => error?.code === code && error.message === code);
}

function modelSnapshot() {
  return Object.fromEntries(fs.readdirSync(path.join(pilot, 'models')).sort().map((name) => [name,
    hash(fs.readFileSync(path.join(pilot, 'models', name)))]));
}

const beforeModels = modelSnapshot();
const beforeFiles = fs.readdirSync(pilot).sort();
const image = fixture();
const originalHash = hash(image);
try {
  await test('engineering contract stays unavailable to the product and does not claim an OS sandbox', async () => {
    assert.equal(imageMarkdownEngineeringContract.product_enabled, false);
    assert.equal(imageMarkdownEngineeringContract.integrated_os_sandbox, false);
    assert.equal(imageMarkdownEngineeringContract.model_downloads, false);
    assert.equal(imageMarkdownEngineeringContract.model_cache_writes, false);
    assert.equal(imageMarkdownEngineeringContract.raw_intermediate_files, false);
    assert.deepEqual(imageMarkdownEngineeringContract.source_types, ['png', 'bmp']);
  });

  await test('real PNG OCR preserves person and company names and reports unverified visual coverage', async () => {
    const result = await extractImageMarkdown(image, 'png');
    assert.equal(markdownContract.validateMarkdownExtraction(result), result);
    assert.equal(result.processing_mode, 'markdown-only');
    assert.equal(result.anonymized, false);
    assert.equal(result.source_type, 'png');
    assert.match(result.markdown, /Max Mustermann/u);
    assert.match(result.markdown, /Nordstern GmbH/u);
    assert.match(result.markdown, /Projektmanager/u);
    assert.doesNotMatch(result.markdown, /PERSON_|UNTERNEHMEN_|REDACTED/u);
    assert.deepEqual(result.coverage, { status: 'incomplete',
      reason_codes: ['OCR_NOT_VERIFIED', 'VISUAL_CONTENT_NOT_EXTRACTED'] });
    assert.equal(hash(image), originalHash);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.coverage.reason_codes));
    const { args } = children.at(-1);
    assert.ok(args[1].includes('--permission'));
    assert.ok(args[1].includes('--allow-worker'));
    assert.ok(args[1].some((value) => value.startsWith('--require=') && value.endsWith('network-deny.cjs')));
    assert.ok(!args[1].some((value) => value.startsWith('--allow-fs-write')));
    assert.deepEqual(Object.keys(args[2].env).sort(), ['DISABLE_SYSTEM_FONTS_LOAD',
      ...['SystemRoot', 'WINDIR'].filter((key) => process.env[key])].sort());
    assert.equal(args[2].env.DISABLE_SYSTEM_FONTS_LOAD, '1');
    assert.equal(args[2].windowsHide, true);
    assert.equal(args[2].shell, false);
  });

  await test('real BMP follows the same bounded pixel decoder and keeps its source type', async () => {
    const input = bmp.encodeBmp(png.decodePng(image));
    const before = hash(input);
    const result = await extractImageMarkdown(input, 'bmp');
    assert.equal(result.source_type, 'bmp');
    assert.match(result.markdown, /Max Mustermann/u);
    assert.match(result.markdown, /Nordstern GmbH/u);
    assert.equal(hash(input), before);
  });

  await test('a real blank image is incomplete and explicitly reports empty OCR', async () => {
    const result = await extractImageMarkdown(fixture(true), 'png');
    assert.equal(result.markdown.trim(), '');
    assert.deepEqual(result.coverage, { status: 'incomplete',
      reason_codes: ['OCR_NOT_VERIFIED', 'OCR_TEXT_EMPTY', 'VISUAL_CONTENT_NOT_EXTRACTED'] });
  });

  await test('corrupt or mismatched bytes fail without echoing content or changing the input', async () => {
    const corrupt = Buffer.from(image); corrupt[corrupt.length - 1] ^= 0xff;
    const before = hash(corrupt);
    await rejectsCode('OCR_IMAGE_INVALID', () => extractImageMarkdown(corrupt, 'png'));
    assert.equal(hash(corrupt), before);
    await rejectsCode('OCR_IMAGE_INVALID', () => extractImageMarkdown(image, 'bmp'));
  });

  await test('paths, URLs, unknown formats and oversized input are rejected before spawning', async () => {
    const count = children.length;
    for (const value of ['https://example.invalid/a.png', 'C:\\private.png', 'file:///private.png', null, Buffer.alloc(0)]) {
      await rejectsCode('OCR_INPUT_INVALID', () => extractImageMarkdown(value, 'png'));
    }
    for (const sourceType of ['jpeg', 'jpg', 'svg', 'gif', undefined]) {
      await rejectsCode('OCR_SOURCE_TYPE_UNSUPPORTED', () => extractImageMarkdown(image, sourceType));
    }
    await rejectsCode('OCR_INPUT_LIMIT', () => extractImageMarkdown(
      Buffer.alloc(imageMarkdownEngineeringContract.maximum_input_bytes + 1), 'png'));
    for (const timeoutMs of [0, -1, NaN, Infinity, 60_001]) {
      await rejectsCode('OCR_INPUT_INVALID', () => extractImageMarkdown(image, 'png', { timeoutMs }));
    }
    await rejectsCode('OCR_INPUT_INVALID', () => extractImageMarkdown(image, 'png', { modelPath: 'https://example.invalid' }));
    await rejectsCode('OCR_INPUT_INVALID', () => extractImageMarkdown(image, 'png', { signal: {} }));
    assert.equal(children.length, count);
  });

  await test('pre-aborted input never starts a process', async () => {
    const controller = new AbortController(); controller.abort();
    const count = children.length;
    await rejectsCode('REQUEST_CANCELLED', () => extractImageMarkdown(image, 'png', { signal: controller.signal }));
    assert.equal(children.length, count);
  });

  await test('cancellation during the real Tesseract startup terminates the owned host and worker threads', async () => {
    const controller = new AbortController();
    let sawStarting = false;
    onSpawn = (child) => child.stderr.on('data', (chunk) => {
      if (chunk.toString().includes('OCR_WORKER_STARTING')) { sawStarting = true; controller.abort(); }
    });
    await rejectsCode('REQUEST_CANCELLED', () => extractImageMarkdown(image, 'png', { signal: controller.signal }));
    assert.equal(sawStarting, true);
  });

  await test('cancellation after the real OCR worker is ready never returns a partial result', async () => {
    const controller = new AbortController();
    let sawReady = false;
    onSpawn = (child) => child.stderr.on('data', (chunk) => {
      if (chunk.toString().includes('OCR_WORKER_READY')) { sawReady = true; controller.abort(); }
    });
    await rejectsCode('REQUEST_CANCELLED', () => extractImageMarkdown(image, 'png', { signal: controller.signal }));
    assert.equal(sawReady, true);
  });

  await test('a startup timeout ends the real process before rejecting and leaves input intact', async () => {
    const started = performance.now();
    await rejectsCode('OCR_TIMEOUT', () => extractImageMarkdown(image, 'png', { timeoutMs: 1 }));
    assert.ok(performance.now() - started < 5000);
    assert.equal(hash(image), originalHash);
  });

  await test('a refused kill has a bounded distinct failure and no automatic termination retry', async () => {
    for (const refusal of ['false', 'throw']) {
      let originalKill;
      let ownedChild;
      let killAttempts = 0;
      onSpawn = (child) => {
        ownedChild = child;
        originalKill = child.kill.bind(child);
        // Keep the actual child blocked on stdin and simulate only the OS kill
        // refusal. No OCR response or conversion result is replaced by a mock.
        child.stdin.end = () => child.stdin;
        child.kill = () => {
          killAttempts += 1;
          if (refusal === 'throw') throw new Error('simulated OS refusal');
          return false;
        };
      };
      const started = performance.now();
      try {
        await rejectsCode('OCR_TERMINATION_UNCONFIRMED', () => extractImageMarkdown(image, 'png', { timeoutMs: 1 }));
        assert.ok(performance.now() - started < imageMarkdownEngineeringContract.termination_grace_ms + 4000);
        assert.equal(killAttempts, 1, 'the implementation must not automatically retry or escalate');
      } finally {
        // Test cleanup restores normal termination for this exclusively owned
        // process after the intentionally simulated refusal; no product retry.
        ownedChild.kill = originalKill;
        originalKill('SIGKILL');
        await children.at(-1).closedPromise;
      }
    }
  });

  await test('models and pilot directory are unchanged; this path does not normalize or anonymize OCR text', async () => {
    assert.deepEqual(modelSnapshot(), beforeModels);
    assert.deepEqual(fs.readdirSync(pilot).sort(), beforeFiles);
    const source = fs.readFileSync(path.join(pilot, 'markdown-worker.mjs'), 'utf8');
    assert.doesNotMatch(source, /\.normalize\(|normalizeOcrResult\(|anonymizeMarkdown\(/u);
    assert.match(source, /cacheMethod: 'none'/u);
    assert.match(source, /markdown: text/u);
  });
  process.stdout.write(`${passed} image Markdown engineering tests passed.\n`);
} finally {
  childProcess.spawn = originalSpawn;
  syncBuiltinESMExports();
  for (const tracked of children) if (!tracked.closed) tracked.child.kill('SIGKILL');
  let timer;
  try {
    await Promise.race([Promise.all(children.map((entry) => entry.closedPromise)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OCR_TEST_PROCESS_CLEANUP_FAILED')), 5000); })]);
  } finally { clearTimeout(timer); }
}
