'use strict';

// Parser tests. The parsers are the only code that ever touches raw document
// bytes, so their failure mode matters more than their feature set: an
// unparsable container must stop the pipeline, never silently yield empty text
// that would then pass every downstream privacy check.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite, assertPresent } = require('./helpers');
const { zipStore } = require('./lib/zip');

const runtime = path.join(__dirname, '..', 'plugins', 'data-secure', 'server');
const { convertDocument, SafeError } = require(path.join(runtime, 'runtime.js'));
const { parseOoxml } = require(path.join(runtime, 'ooxml.js'));
const { readZip, ZipError } = require(path.join(runtime, 'zip-reader.js'));
const { parsePdf } = require(path.join(runtime, 'pdf-lite.js'));
const { encodePng } = require(path.join(runtime, 'images', 'png.js'));

const { test, testAsync, done, assert } = createSuite('Parsers');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eu-privacy-parsers-'));
const write = (name, data) => {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, data);
  return file;
};

function docx(paragraphs, extra = []) {
  const body = paragraphs.map((t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`).join('');
  return zipStore([
    ['word/document.xml', `<w:document xmlns:w="w"><w:body>${body}</w:body></w:document>`],
    ...extra
  ]);
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

test('DOCX text runs are extracted in document order', () => {
  const result = parseOoxml(docx(['Erste Zeile', 'Zweite Zeile']), '.docx');
  assertPresent(result.markdown, 'Erste Zeile', 'paragraph');
  assertPresent(result.markdown, 'Zweite Zeile', 'paragraph');
  assert.ok(
    result.markdown.indexOf('Erste Zeile') < result.markdown.indexOf('Zweite Zeile'),
    'paragraph order must be preserved'
  );
});

test('DOCX XML entities are decoded', () => {
  const result = parseOoxml(docx(['M&amp;A Beratung &#8211; 2026', 'Preis &lt; 100 &euro;']), '.docx');
  assertPresent(result.markdown, 'M&A Beratung', 'ampersand entity');
  assertPresent(result.markdown, 'Preis < 100', 'less-than entity');
});

test('DOCX embedded images become attachments with a mime type', () => {
  const png = encodePng({ width: 8, height: 8, rgba: Buffer.alloc(8 * 8 * 4, 255) });
  const result = parseOoxml(docx(['Mit Bild'], [['word/media/image1.png', png]]), '.docx');
  assert.strictEqual(result.attachments.length, 1);
  assert.strictEqual(result.attachments[0].mimeType, 'image/png');
  assert.strictEqual(result.attachments[0].extension, 'png');
  assert.ok(result.attachments[0].data.length > 0, 'attachment must carry base64 data');
});

test('DOCX vector graphics are surfaced rather than dropped silently', () => {
  const result = parseOoxml(
    docx(['Mit Vektor'], [['word/media/image1.emf', Buffer.from([0x01, 0x00, 0x00, 0x00])]]),
    '.docx'
  );
  assert.strictEqual(result.attachments.length, 1, 'an EMF must not be discarded');
  assert.strictEqual(result.attachments[0].mimeType, 'image/x-emf');
});

// ---------------------------------------------------------------------------
// XLSX / PPTX
// ---------------------------------------------------------------------------

test('XLSX shared strings are resolved into table cells', () => {
  const buf = zipStore([
    ['xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="Blatt" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/sharedStrings.xml', '<sst><si><t>Kopf</t></si><si><t>Wert</t></si></sst>'],
    [
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c>' +
        '<c r="B1" t="s"><v>1</v></c></row></sheetData></worksheet>'
    ]
  ]);
  const result = parseOoxml(buf, '.xlsx');
  assertPresent(result.markdown, 'Kopf', 'shared string');
  assertPresent(result.markdown, 'Wert', 'shared string');
});

test('XLSX inline numbers are kept', () => {
  const buf = zipStore([
    ['xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="Blatt" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1"><v>42</v></c></row></sheetData></worksheet>']
  ]);
  assertPresent(parseOoxml(buf, '.xlsx').markdown, '42', 'numeric cell');
});

test('PPTX slide text and speaker notes are both extracted', () => {
  const buf = zipStore([
    [
      'ppt/slides/slide1.xml',
      '<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody>' +
        '<a:p><a:r><a:t>Folientitel</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
    ],
    ['ppt/notesSlides/notesSlide1.xml', '<p:notes xmlns:p="p" xmlns:a="a"><a:t>Notiztext</a:t></p:notes>']
  ]);
  const result = parseOoxml(buf, '.pptx');
  assertPresent(result.markdown, 'Folientitel', 'slide text');
  assertPresent(result.markdown, 'Notiztext', 'speaker note');
});

// ---------------------------------------------------------------------------
// ZIP hardening
// ---------------------------------------------------------------------------

test('a truncated ZIP container is rejected', () => {
  const full = docx(['Inhalt']);
  assert.throws(() => readZip(full.subarray(0, Math.floor(full.length / 2))), (e) => e instanceof ZipError);
});

test('a buffer that is not a ZIP at all is rejected', () => {
  assert.throws(() => readZip(Buffer.from('this is not a zip file')), (e) => e instanceof ZipError);
});

test('an OOXML container without a main part is rejected instead of returning empty text', () => {
  const buf = zipStore([['docProps/core.xml', '<coreProperties/>']]);
  assert.throws(() => parseOoxml(buf, '.docx'), (e) => e instanceof Error);
});

test('a ZIP entry with a false zero uncompressed size is rejected', () => {
  const bad = Buffer.from(docx(['Inhalt']));
  const central = bad.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(central >= 0, 'fixture must contain a central-directory entry');
  bad.writeUInt32LE(0, central + 24);
  assert.throws(() => readZip(bad), (e) => e instanceof ZipError);
});

test('ZIP limits use the sum of the extracted entry lengths', () => {
  const archive = zipStore([
    ['a.txt', '1234'],
    ['b.txt', '5678']
  ]);
  assert.throws(() => readZip(archive, { maxUncompressed: 7 }), (e) => e instanceof ZipError);
  assert.strictEqual(readZip(archive, { maxUncompressed: 8 }).size, 2);
});

test('inconsistent local and central ZIP headers are rejected', () => {
  const bad = Buffer.from(docx(['Inhalt']));
  bad.writeUInt16LE(8, 8); // local method says deflate, central directory says stored
  assert.throws(() => readZip(bad), (e) => e instanceof ZipError);
});

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

function simplePdf(lines) {
  const content = `BT /F1 12 Tf 72 720 Td ${lines.map((l) => `(${l}) Tj 0 -20 Td`).join(' ')} ET`;
  return Buffer.from(
    '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n' +
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj\n' +
      `4 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj\n%%EOF\n`,
    'latin1'
  );
}

test('PDF text layer strings are extracted', () => {
  const result = parsePdf(simplePdf(['Kunde: Max Mustermann', 'Betrag: 100 EUR']));
  assertPresent(result.markdown, 'Max Mustermann', 'pdf string');
  assertPresent(result.markdown, '100 EUR', 'pdf string');
});

test('PDF escape sequences are decoded', () => {
  const result = parsePdf(simplePdf(['Klammer \\( auf', 'Umlaut \\366']));
  assertPresent(result.markdown, 'Klammer ( auf', 'escaped parenthesis');
});

test('a PDF without an extractable text layer fails closed', () => {
  const scanned = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n', 'latin1');
  assert.throws(() => parsePdf(scanned), (e) => e instanceof Error);
});

// ---------------------------------------------------------------------------
// Plain formats and dispatch
// ---------------------------------------------------------------------------

async function main() {

  await testAsync('TXT and MD are passed through unchanged', async () => {
  const file = write('note.txt', 'Freitext mit Umlauten: Öl, Ärger, Übung.\n');
  const result = await convertDocument(file);
  assertPresent(result.markdown, 'Öl, Ärger, Übung', 'plain text');
  assert.deepStrictEqual(result.attachments, []);
});

  await testAsync('CSV content is fenced so that separators are not read as markdown', async () => {
  const file = write('liste.csv', 'Name;Ort\nMax;Köln\n');
  const result = await convertDocument(file);
  assertPresent(result.markdown, '```csv', 'code fence');
  assertPresent(result.markdown, 'Max;Köln', 'csv row');
});

  await testAsync('a CSV that contains a fence cannot break out of the code block', async () => {
  const file = write('inject.csv', 'a;b\n```\n# Überschrift\n');
  const result = await convertDocument(file);
  const fences = result.markdown.match(/```/g) || [];
  assert.strictEqual(fences.length, 2, 'exactly the opening and closing fence may remain');
});

  await testAsync('an unsupported extension is refused', async () => {
  const file = write('archiv.rar', Buffer.from([0x52, 0x61, 0x72, 0x21]));
  await assert.rejects(() => convertDocument(file), (e) => e instanceof SafeError);
});

  await testAsync('a corrupt DOCX is reported as a SafeError, not as empty content', async () => {
  const file = write('kaputt.docx', Buffer.from('nicht wirklich ein docx'));
  await assert.rejects(() => convertDocument(file), (e) => e instanceof SafeError);
});

  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  done();
}

main();
