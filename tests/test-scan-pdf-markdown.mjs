import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { createCanvas } from '../native/pdfjs/pilot/node_modules/@napi-rs/canvas/index.js';

// Observe the real OCR host through the PDF composition; do not replace parser
// or OCR results. A process-level assertion catches an outer cancellation race
// which isolated PDF and isolated OCR tests cannot see.
const originalSpawn = childProcess.spawn;
const children = [];
let onSpawn;
childProcess.spawn = (...args) => {
  const child = originalSpawn(...args);
  const tracked = { child, closed: false, originalKill: child.kill.bind(child) };
  tracked.closedPromise = new Promise((resolve) => child.once('close', (code) => {
    tracked.closed = true;
    tracked.exitCode = code;
    resolve();
  }));
  children.push(tracked);
  onSpawn?.(child);
  return child;
};
syncBuiltinESMExports();
const { extractPdfMarkdown, extractScanPdfMarkdown } = await import('../native/pdfjs/pilot/markdown.mjs');

async function waitForChildren() {
  let timer;
  try {
    await Promise.race([Promise.all(children.map((entry) => entry.closedPromise)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('SCAN_OCR_TEST_CLEANUP_FAILED')), 6000); })]);
  } finally { clearTimeout(timer); }
}

function scannedPdf(pages, dimensions = [800, 300]) {
  const objects = [null, null];
  const kids = [];
  for (const { image, invisibleText = '' } of pages) {
    const page = objects.length + 1;
    const content = Buffer.from(`q ${dimensions[0]} 0 0 ${dimensions[1]} 0 0 cm /Im Do Q\n` +
      (invisibleText ? `BT /F1 12 Tf 3 Tr 20 20 Td (${invisibleText}) Tj ET` : ''));
    kids.push(`${page} 0 R`);
    objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${dimensions.join(' ')}] /Resources << /XObject << /Im ${page + 2} 0 R >> /Font << /F1 ${page + 3} 0 R >> >> /Contents ${page + 1} 0 R >>`));
    objects.push(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream')]));
    objects.push(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1600 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, Buffer.from('\nendstream')]));
    objects.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
  }
  objects[0] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>');
  objects[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`);
  const chunks = [Buffer.from('%PDF-1.7\n')];
  const offsets = [0];
  let size = chunks[0].length;
  for (let i = 0; i < objects.length; i++) {
    offsets.push(size);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), objects[i], Buffer.from('\nendobj\n')]);
    chunks.push(chunk); size += chunk.length;
  }
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

function image(lines) {
  const canvas = createCanvas(1600, 600);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white'; context.fillRect(0, 0, 1600, 600);
  context.fillStyle = 'black'; context.font = '52px Arial';
  lines.forEach((line, i) => context.fillText(line, 70, 130 + i * 100));
  return canvas.toBuffer('image/jpeg');
}

try {
const first = image(['Alice Example', 'Example GmbH', 'Document number 123456']);
const last = image(['Last page', 'Bob Example']);
const input = scannedPdf([{ image: first }, { image: last }]);
const original = crypto.createHash('sha256').update(input).digest('hex');
const textOnly = await extractPdfMarkdown(input);
assert.doesNotMatch(textOnly.markdown, /Alice Example/u, 'Fixture must really require raster OCR');
assert.ok(textOnly.coverage.reason_codes.includes('OCR_TEXT_EMPTY'));
const scan = await extractScanPdfMarkdown(input);
assert.equal(scan.anonymized, false);
assert.equal(scan.source_type, 'pdf');
assert.equal(scan.coverage.status, 'incomplete');
assert.ok(scan.coverage.reason_codes.includes('OCR_NOT_VERIFIED'));
assert.match(scan.markdown, /Alice Example/u);
assert.match(scan.markdown, /Example GmbH/u);
assert.match(scan.markdown, /## Seite 2[\s\S]*Bob Example/u);
assert.equal(crypto.createHash('sha256').update(input).digest('hex'), original);

const layered = await extractScanPdfMarkdown(scannedPdf([{ image: first, invisibleText: 'Alice Example' }]));
assert.equal((layered.markdown.match(/Alice Example/gu) || []).length, 1, 'Do not append a hidden text layer to raster OCR');
await assert.rejects(extractScanPdfMarkdown(scannedPdf([{ image: first }], [4000, 4000])), { code: 'PDF_PIXEL_LIMIT' });
const controller = new AbortController();
const pending = extractScanPdfMarkdown(input, { signal: controller.signal });
const timer = setTimeout(() => controller.abort(), 40);
try { await assert.rejects(pending, { code: 'REQUEST_CANCELLED' }); }
finally { clearTimeout(timer); }
assert.ok(children.every((entry) => entry.closed), 'early cancellation leaves no unconfirmed owned process');

for (const refuseKill of [false, true]) {
  const cancellation = new AbortController();
  let sawReady = false;
  let killAttempts = 0;
  onSpawn = (child) => {
    if (refuseKill) child.kill = () => { killAttempts += 1; return false; };
    let phases = '';
    child.stderr.on('data', (chunk) => {
      phases += chunk.toString('utf8');
      if (!sawReady && phases.includes('OCR_WORKER_READY')) {
        sawReady = true;
        cancellation.abort();
      }
    });
  };
  try {
    let cancellationCode;
    await assert.rejects(extractScanPdfMarkdown(input, { signal: cancellation.signal }), (error) => {
      cancellationCode = error.code;
      return error.code === 'REQUEST_CANCELLED' || (refuseKill && error.code === 'OCR_TERMINATION_UNCONFIRMED');
    });
    assert.equal(sawReady, true, 'abort must occur after the actual Tesseract worker is ready');
    if (cancellationCode === 'REQUEST_CANCELLED') {
      assert.ok(children.every((entry) => entry.closed), 'PDF cancellation must await the OCR close confirmation');
    }
    if (refuseKill) {
      assert.equal(killAttempts, 1, 'a refused termination is never automatically retried');
      // On a slow host the normal OCR result may arrive after the one-second
      // grace. That must be the distinct unconfirmed outcome, not an early
      // REQUEST_CANCELLED. In either case await its natural completion.
      await waitForChildren();
      assert.equal(children.at(-1).exitCode, 0, 'the real worker completed naturally without another kill');
    }
    assert.equal(crypto.createHash('sha256').update(input).digest('hex'), original);
  } finally { onSpawn = null; }
}

for (const refusal of ['false', 'throw']) {
  const cancellation = new AbortController();
  let releaseInput;
  let killAttempts = 0;
  onSpawn = (child) => {
    const originalEnd = child.stdin.end.bind(child.stdin);
    let inputArguments;
    // Keep the real child waiting for its real image bytes to make OS kill
    // refusal deterministic. Release them after the bounded failure so the
    // actual OCR worker can finish itself; never replace an OCR result.
    child.stdin.end = (...args) => { inputArguments = args; return child.stdin; };
    releaseInput = () => {
      child.stdin.end = originalEnd;
      assert.ok(inputArguments?.length, 'the real raster reached the owned OCR adapter');
      originalEnd(...inputArguments);
    };
    child.kill = () => {
      killAttempts += 1;
      if (refusal === 'throw') throw new Error('simulated OS refusal');
      return false;
    };
    queueMicrotask(() => cancellation.abort());
  };
  try {
    const start = performance.now();
    await assert.rejects(extractScanPdfMarkdown(input, { signal: cancellation.signal }),
      (error) => error.code === 'OCR_TERMINATION_UNCONFIRMED' && error.message === error.code);
    assert.ok(performance.now() - start < 5000, 'unconfirmed termination must be bounded');
    assert.equal(killAttempts, 1);
    assert.equal(children.at(-1).closed, false, 'unconfirmed must not imply that the worker ended');
    assert.equal(cancellation.signal.aborted, true, 'catch/finally must not overwrite this failure with REQUEST_CANCELLED');
  } finally {
    onSpawn = null;
    releaseInput?.();
    await waitForChildren();
  }
  assert.equal(children.at(-1).exitCode, 0, 'the released real child completes without another kill');
  assert.equal(crypto.createHash('sha256').update(input).digest('hex'), original);
}
process.stdout.write('SCAN PDF MARKDOWN ENGINEERING PASS: real image-only PDF, page order/last page, no double text layer, preserved identifiers/source hash, pixel bound, early/ready-worker cancellation with confirmed close, refused kill and unconfirmed-termination preservation; NOT product activation\n');
} finally {
  onSpawn = null;
  childProcess.spawn = originalSpawn;
  syncBuiltinESMExports();
  for (const tracked of children) {
    tracked.child.kill = tracked.originalKill;
    if (!tracked.closed) tracked.originalKill('SIGKILL');
  }
  await waitForChildren();
}
