import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { extractPdfMarkdown, localPdfOptions, pdfConversionEngineeringContract } from '../native/pdfjs/pilot/markdown.mjs';

function pdf(texts, catalogExtra = '', extraObjects = [], width = 800) {
  const objects = ['', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  const kids = [];
  for (const text of texts) {
    const pageId = objects.length + 1;
    const escaped = text.replace(/[\\()]/gu, '\\$&');
    const stream = `BT /F1 12 Tf 25 80 Td (${escaped}) Tj ET`;
    kids.push(`${pageId} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects[0] = `<< /Type /Catalog /Pages 2 0 R ${catalogExtra} >>`;
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  objects.push(...extraObjects);
  let body = '%PDF-1.7\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

const input = pdf(['Alice Example Example GmbH DE89370400440532013000', 'Last page']);
const hash = crypto.createHash('sha256').update(input).digest('hex');
const options = localPdfOptions(input);
assert.equal(options.stopAtErrors, true);
assert.equal(Object.hasOwn(options, 'stopEventLoop'), false);
assert.equal(Object.hasOwn(options, 'url'), false);
assert.equal(options.useWorkerFetch, false);
assert.equal(options.isEvalSupported, false);
assert.equal(pdfConversionEngineeringContract.product_enabled, false);
const extracted = await extractPdfMarkdown(input);
assert.equal(extracted.anonymized, false);
assert.match(extracted.markdown, /Alice Example Example GmbH DE89370400440532013000/u);
assert.match(extracted.markdown, /## Seite 2[\s\S]*Last page/u);
assert.equal(extracted.coverage.status, 'incomplete');
assert.ok(extracted.coverage.reason_codes.includes('SOURCE_COVERAGE_UNVERIFIED'));
assert.equal(crypto.createHash('sha256').update(input).digest('hex'), hash);

const many = await extractPdfMarkdown(pdf(Array.from({ length: 101 }, (_, i) => `Page ${i + 1}`)));
assert.equal((many.markdown.match(/^## Seite /gmu) || []).length, 101);
assert.match(many.markdown, /## Seite 101[\s\S]*Page 101/u);
const blank = await extractPdfMarkdown(pdf(['Text', '']));
assert.ok(blank.coverage.reason_codes.includes('OCR_TEXT_EMPTY'));
assert.match(blank.markdown, /## Seite 2/u);
// PDF.js can exclude off-page glyphs. A successful parser call must therefore
// never be promoted to complete-source coverage in this engineering provider.
const clipped = await extractPdfMarkdown(pdf(['Visible then off-page private text'], '', [], 40));
assert.equal(clipped.coverage.status, 'incomplete');
assert.ok(clipped.coverage.reason_codes.includes('SOURCE_COVERAGE_UNVERIFIED'));
const literal = await extractPdfMarkdown(pdf(['``` <script> *Alice* https://example.invalid']));
assert.match(literal.markdown, /````text\n``` <script> \*Alice\*/u);

const active = pdf(['Static'], '/OpenAction 6 0 R', ['<< /S /JavaScript /JS (app.alert\\(1\\)) >>']);
await assert.rejects(extractPdfMarkdown(active), { code: 'PDF_OBJECT_COVERAGE_UNVERIFIED' });
await assert.rejects(extractPdfMarkdown(Buffer.from('not a PDF')), { code: 'PDF_EXTRACTION_FAILED' });
const abort = new AbortController(); abort.abort();
await assert.rejects(extractPdfMarkdown(input, { signal: abort.signal }), { code: 'REQUEST_CANCELLED' });

// Real PDF.js loading/page promises used to remain pending after destroy().
// A pre-aborted signal cannot detect that bug. Keep an explicit test deadline
// alive so a regression fails instead of Node exiting with an unsettled await.
async function withinDeadline(operation, milliseconds = 3000) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('PDF_TEST_RESPONSE_TIMEOUT'),
          { code: 'PDF_TEST_RESPONSE_TIMEOUT' })), milliseconds);
      })
    ]);
  } finally { clearTimeout(timer); }
}

const interruptInput = pdf(Array.from({ length: 1000 }, (_, index) => `Cancel page ${index + 1}`));
const interruptHash = crypto.createHash('sha256').update(interruptInput).digest('hex');
// Cancel synchronously after starting, during the loading await, and again
// after a timer while PDF.js is processing a non-trivial multi-page document.
for (const delay of [null, 5]) {
  const controller = new AbortController();
  const pending = extractPdfMarkdown(interruptInput, { signal: controller.signal });
  let timer;
  if (delay === null) controller.abort();
  else timer = setTimeout(() => controller.abort(), delay);
  try {
    await assert.rejects(withinDeadline(pending), { code: 'REQUEST_CANCELLED' });
  } finally { clearTimeout(timer); }
  assert.equal(crypto.createHash('sha256').update(interruptInput).digest('hex'), interruptHash);
  const next = await withinDeadline(extractPdfMarkdown(input));
  assert.equal(next.anonymized, false);
  assert.equal(next.coverage.status, 'incomplete');
  assert.match(next.markdown, /## Seite 2[\s\S]*Last page/u);
}
assert.throws(() => localPdfOptions('https://example.invalid/a.pdf'), { code: 'PDF_INPUT_INVALID' });
process.stdout.write('PDF MARKDOWN ENGINEERING PASS: strict local bytes, 101 pages, identifiers, blank page, literal text, active-content refusal, pre/in-flight cancellation and restart; NOT product coverage\n');
