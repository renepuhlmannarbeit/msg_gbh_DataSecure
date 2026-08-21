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

test('DOCX DrawingML text boxes retain all certification text', () => {
  const drawing = [
    '<w:p><w:r><mc:AlternateContent>',
    '<mc:Choice Requires="wps"><w:drawing><wps:wsp><wps:txbx><w:txbxContent>',
    '<w:p><w:r><w:t>Zertifizierungen</w:t></w:r></w:p>',
    '<w:p><w:r><w:t>Scrum.org Professional Scrum Product Owner I (PSPO I)</w:t></w:r></w:p>',
    '<w:p><w:r><w:t>SAFe Agilist</w:t></w:r></w:p>',
    '<w:p><w:r><w:t>Scrum.org Professional Scrum Master II (PSM II)</w:t></w:r></w:p>',
    '</w:txbxContent></wps:txbx></wps:wsp></w:drawing></mc:Choice>',
    '<mc:Fallback><w:pict><w:txbxContent><w:p><w:r><w:t>Zertifizierungen</w:t></w:r></w:p></w:txbxContent></w:pict></mc:Fallback>',
    '</mc:AlternateContent></w:r></w:p>'
  ].join('');
  const result = parseOoxml(zipStore([[
    'word/document.xml',
    `<w:document xmlns:w="w" xmlns:mc="mc" xmlns:wps="wps"><w:body>${drawing}<w:p><w:r><w:t>Qualifikationen</w:t></w:r></w:p></w:body></w:document>`
  ]]), '.docx');
  assertPresent(result.markdown, 'Scrum.org Professional Scrum Product Owner I (PSPO I)', 'text-box certificate issuer');
  assertPresent(result.markdown, 'SAFe Agilist', 'text-box certificate');
  assertPresent(result.markdown, 'Scrum.org Professional Scrum Master II (PSM II)', 'last text-box paragraph');
  assert.strictEqual((result.markdown.match(/Zertifizierungen/g)||[]).length, 1, 'fallback text must not be duplicated');
  assert.ok(result.markdown.indexOf('Zertifizierungen') < result.markdown.indexOf('Qualifikationen'));
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

test('DOCX unsupported content-bearing parts are reported instead of silently omitted', () => {
  const result = parseOoxml(
    docx(['Sichtbarer Text'], [['word/embeddings/oleObject1.bin', Buffer.from('private embedded content')]]),
    '.docx'
  );
  assert.strictEqual(result.warnings.length, 1);
  assert.match(result.warnings[0], /nicht unterstützte inhaltsfähige OOXML-Part/);
  assert.doesNotMatch(result.warnings[0], /oleObject1|private embedded content/);
  const disguised = parseOoxml(
    docx(['Sichtbarer Text'], [['word/theme/oleObject1.xml', Buffer.from('<private>disguised content</private>')]]),
    '.docx'
  );
  assert.strictEqual(disguised.warnings.length, 1, 'a known directory must not allow an unknown part type');

  const objectRelationship = parseOoxml(
    docx(['Sichtbarer Text'], [[
      'word/_rels/document.xml.rels',
      Buffer.from('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="theme/theme1.xml"/></Relationships>')
    ], ['word/theme/theme1.xml', Buffer.from('<private>object content</private>')]]),
    '.docx'
  );
  assert.strictEqual(objectRelationship.warnings.length, 1, 'unknown relationship types must block coverage');

  const wrongContentType = parseOoxml(
    docx(['Sichtbarer Text'], [[
      '[Content_Types].xml',
      Buffer.from('<Types><Override PartName="/word/document.xml" ContentType="application/x-private-object"/></Types>')
    ]]),
    '.docx'
  );
  assert.strictEqual(wrongContentType.warnings.length, 1, 'content type overrides must match the parsed part class');
});

test('DOCX external relationships are technical uncertainty rather than omitted content', () => {
  const result = parseOoxml(
    docx(['Externer Link'], [[
      'word/_rels/document.xml.rels',
      Buffer.from('<Relationships><Relationship Id="rId1" Target="https://customer.example/private" TargetMode="External"/></Relationships>')
    ]]),
    '.docx'
  );
  assert.strictEqual(result.warnings.length, 1);
  assert.doesNotMatch(result.warnings[0], /customer\.example/);
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

test('XLSX table escaping handles backslashes before Markdown separators', () => {
  const buf = zipStore([
    ['xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="Blatt" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/sharedStrings.xml', '<sst><si><t>C:\\Temp|Name</t></si></sst>'],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>']
  ]);
  assertPresent(parseOoxml(buf, '.xlsx').markdown, 'C:\\\\Temp\\|Name', 'escaped table cell');
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

test('PDF forms and unsupported stream filters are reported as incomplete coverage', () => {
  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj << /Type /Catalog /AcroForm 8 0 R >> endobj\n' +
      '2 0 obj << /Filter /ASCII85Decode /Length 5 >> stream\nabcde\nendstream endobj\n' +
      '3 0 obj << /Length 35 >> stream\nBT (Kontakt Max Mustermann) Tj ET\nendstream endobj\n%%EOF\n',
    'latin1'
  );
  const result = parsePdf(pdf);
  assert.ok(result.warnings.some((warning) => /Formularfelder/.test(warning)));
  assert.ok(result.warnings.some((warning) => /nicht unterstütztem Filter/.test(warning)));
});

test('PDF custom fonts, forms, indirect filters and vector content produce coverage warnings', () => {
  const pdf = Buffer.from(
    '%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n' +
      '3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj\n' +
      '4 0 obj << /Length 53 >> stream\nBT (Sachlicher Text) Tj ET 0 0 100 100 re f\nendstream endobj\n' +
      '5 0 obj << /Subtype /Type0 /Encoding /Identity-H /ToUnicode 6 0 R >> endobj\n' +
      '6 0 obj << /Subtype /Form /Filter 9 0 R /Length 5 >> stream\nabcde\nendstream endobj\n%%EOF\n',
    'latin1'
  );
  const result = parsePdf(pdf);
  assert.ok(result.warnings.some((warning) => /komplexe Fontcodierung|Form-XObjects/.test(warning)));
  assert.ok(result.warnings.some((warning) => /nicht unterstütztem Filter/.test(warning)));
  assert.ok(result.warnings.some((warning) => /Grafikoperatoren/.test(warning)));
});

test('a PDF without an extractable text layer fails closed', () => {
  const scanned = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n', 'latin1');
  assert.throws(() => parsePdf(scanned), (e) => e instanceof Error);
});

test('a scanned PDF with an embedded JPEG is routed to the visual privacy gate', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const scanned = Buffer.from(
    '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n' +
      `2 0 obj << /Subtype /Image /Filter /DCTDecode /Length ${jpeg.length} >> stream\n` +
      jpeg.toString('latin1') +
      '\nendstream endobj\n%%EOF\n',
    'latin1'
  );
  const result = parsePdf(scanned);
  assertPresent(result.markdown, 'PDF-Scan', 'scan marker');
  assert.strictEqual(result.attachments.length, 1);
  assert.strictEqual(result.attachments[0].mimeType, 'image/jpeg');
  assert.strictEqual(result.requiresExplicitProfile, true);
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

  await testAsync('standalone PNG images are routed to the visual privacy gate', async () => {
    const png = encodePng({ width: 8, height: 8, rgba: Buffer.alloc(8 * 8 * 4, 255) });
    const file = write('scan.png', png);
    const result = await convertDocument(file);
    assertPresent(result.markdown, 'Bildinhalt', 'image marker');
    assert.strictEqual(result.attachments.length, 1);
    assert.strictEqual(result.attachments[0].mimeType, 'image/png');
    assert.strictEqual(result.requiresExplicitProfile, true);
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
