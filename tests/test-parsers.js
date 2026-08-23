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
const {
  parseOoxml, MAX_EMBEDDED_DEPTH, MAX_EMBEDDED_DOCUMENTS, MAX_EMBEDDED_BYTES,
  MAX_EMBEDDED_EXPANDED_BYTES
} = require(path.join(runtime, 'ooxml.js'));
const { readZip, inspectZipDirectory, ZipError } = require(path.join(runtime, 'zip-reader.js'));
const { parsePdf } = require(path.join(__dirname, 'helpers', 'legacy-pdf-lite.js'));
const { encodePng } = require(path.join(runtime, 'images', 'png.js'));
const pii = require(path.join(runtime, 'pii-engine.js'));

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
    ['_rels/.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<w:document xmlns:w="w"><w:body>${body}</w:body></w:document>`],
    ...extra
  ]);
}

function embeddedDocx(paragraphs, embedded, relationshipType = 'package') {
  return docx(paragraphs, [
    ['word/embeddings/nested.docx', embedded],
    ['word/_rels/document.xml.rels', `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${relationshipType}" Target="embeddings/nested.docx"/></Relationships>`]
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

test('DOCX requires one internal root officeDocument relationship', () => {
  const cases = [
    ['missing root relationship', []],
    ['external root relationship', [['_rels/.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="https://example.invalid/document.xml" TargetMode="External"/></Relationships>']]],
    ['wrong root target', [['_rels/.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/other.xml"/></Relationships>']]],
    ['duplicate root relationship', [['_rels/.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>']]]
  ];
  for (const [label, extra] of cases) {
    const entries = [['word/document.xml', '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Vertraulicher Inhalt</w:t></w:r></w:p></w:body></w:document>'], ...extra];
    const result = parseOoxml(zipStore(entries), '.docx');
    assert.strictEqual(result.warnings.length, 1, `${label} must block coverage`);
    assert.doesNotMatch(result.warnings[0], /example\.invalid|other\.xml|Vertraulicher/u, `${label} warning stays content-free`);
  }
});

test('DOCX requires the WordprocessingML main-document root before rendering', () => {
  const result = parseOoxml(zipStore([
    ['_rels/.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', '<w:unsupported xmlns:w="w"><w:p><w:r><w:t>Vertraulicher Inhalt</w:t></w:r></w:p></w:unsupported>']
  ]), '.docx');
  assert.strictEqual(result.warnings.length, 1, 'a named but non-renderable main part must block coverage');
  assert.strictEqual(result.markdown, '', 'the unsupported main root must not be rendered');
  assert.doesNotMatch(result.warnings[0], /Vertraulicher|unsupported/u, 'coverage warning stays content-free');
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
    '_rels/.rels',
    '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  ],[
    'word/document.xml',
    `<w:document xmlns:w="w" xmlns:mc="mc" xmlns:wps="wps"><w:body>${drawing}<w:p><w:r><w:t>Qualifikationen</w:t></w:r></w:p></w:body></w:document>`
  ]]), '.docx');
  assertPresent(result.markdown, 'Scrum.org Professional Scrum Product Owner I (PSPO I)', 'text-box certificate issuer');
  assertPresent(result.markdown, 'SAFe Agilist', 'text-box certificate');
  assertPresent(result.markdown, 'Scrum.org Professional Scrum Master II (PSM II)', 'last text-box paragraph');
  assert.strictEqual((result.markdown.match(/Zertifizierungen/g)||[]).length, 1, 'fallback text must not be duplicated');
  assert.ok(result.markdown.indexOf('Zertifizierungen') < result.markdown.indexOf('Qualifikationen'));
});

test('DOCX secondary stories retain structured text before the privacy gate', () => {
  const result = parseOoxml(docx(['Haupttext'], [
    ['word/header1.xml', '<w:hdr xmlns:w="w"><w:p><w:r><w:t>Vertraulich</w:t><w:tab/><w:t>Max Mustermann</w:t></w:r></w:p></w:hdr>'],
    ['word/footer1.xml', '<w:ftr xmlns:w="w"><w:p><w:r><w:t>Beispiel GmbH</w:t><w:br/><w:t>Seite 1</w:t></w:r></w:p></w:ftr>'],
    ['word/comments.xml', '<w:comments xmlns:w="w"><w:comment><w:p><w:r><w:t>Kommentar von Erika Beispiel</w:t></w:r></w:p></w:comment></w:comments>'],
    ['word/footnotes.xml', '<w:footnotes xmlns:w="w"><w:footnote><w:p><w:r><w:t>Fußnote: kundenintern</w:t></w:r></w:p></w:footnote></w:footnotes>'],
    ['word/endnotes.xml', '<w:endnotes xmlns:w="w"><w:endnote><w:p><w:r><w:t>Endnote: Projekt Alpha</w:t></w:r></w:p></w:endnote></w:endnotes>'],
    ['word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes" Target="endnotes.xml"/></Relationships>']
  ]), '.docx');
  assertPresent(result.markdown, 'Vertraulich\tMax Mustermann', 'header tab');
  assertPresent(result.markdown, 'Beispiel GmbH\nSeite 1', 'footer line break');
  for (const text of ['Kommentar von Erika Beispiel', 'Fußnote: kundenintern', 'Endnote: Projekt Alpha']) {
    assertPresent(result.markdown, text, 'secondary story');
  }
  assert.deepStrictEqual(result.sections.map((section) => section.source_part), [
    'word/document.xml', 'word/header1.xml', 'word/footer1.xml',
    'word/comments.xml', 'word/footnotes.xml', 'word/endnotes.xml'
  ]);
  assert.deepStrictEqual(result.warnings, [], 'all secondary stories are internally reachable');
  const anonymized = pii.anonymize(result.markdown, 'personnel_profile').text;
  assert.doesNotMatch(anonymized, /Max Mustermann|Erika Beispiel|Beispiel GmbH/u, 'secondary-story PII reaches the privacy gate');
});

test('DOCX secondary stories require matching internal relationships', () => {
  const orphan = parseOoxml(docx(['Sichtbarer Text'], [
    ['word/header1.xml', '<w:hdr xmlns:w="w"><w:p><w:r><w:t>Vertraulicher Kopf</w:t></w:r></w:p></w:hdr>']
  ]), '.docx');
  assert.strictEqual(orphan.warnings.length, 1, 'an orphan header must block coverage');

  const missing = parseOoxml(docx(['Sichtbarer Text'], [[
    'word/_rels/document.xml.rels',
    '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header9.xml"/></Relationships>'
  ], ['word/header1.xml', '<w:hdr xmlns:w="w"><w:p><w:r><w:t>Vertraulicher Kopf</w:t></w:r></w:p></w:hdr>']]), '.docx');
  assert.strictEqual(missing.warnings.length, 1, 'a missing or mismatched relationship target must block coverage');
  assert.doesNotMatch(missing.warnings[0], /header9|Vertraulicher/u, 'coverage warning stays content-free');
});

test('DOCX secondary-story relationship traversal, external targets and type mismatches fail closed', () => {
  const cases = [
    ['parent traversal', 'header', '../header1.xml'],
    ['external target', 'header', 'https://example.invalid/header1.xml', ' TargetMode="External"'],
    ['type mismatch', 'footer', 'header1.xml']
  ];
  for (const [label, type, target, mode = ''] of cases) {
    const result = parseOoxml(docx(['Sichtbarer Text'], [
      ['word/header1.xml', '<w:hdr xmlns:w="w"><w:p><w:r><w:t>Vertraulicher Kopf</w:t></w:r></w:p></w:hdr>'],
      ['word/_rels/document.xml.rels', `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"${mode}/></Relationships>`]
    ]), '.docx');
    assert.strictEqual(result.warnings.length, 1, `${label} must block coverage`);
    assert.doesNotMatch(result.warnings[0], /header1|Vertraulicher|example\.invalid/u, `${label} warning stays content-free`);
  }
});

test('DOCX secondary stories reject duplicate relationships and mismatched Word roots', () => {
  const cases = [
    ['duplicate relationship', [
      ['word/header1.xml', '<w:hdr xmlns:w="w"><w:p><w:r><w:t>Vertraulicher Kopf</w:t></w:r></w:p></w:hdr>'],
      ['word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>']
    ]],
    ['mismatched Word root', [
      ['word/header1.xml', '<w:ftr xmlns:w="w"><w:p><w:r><w:t>Vertraulicher Kopf</w:t></w:r></w:p></w:ftr>'],
      ['word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>']
    ]]
  ];
  for (const [label, extra] of cases) {
    const result = parseOoxml(docx(['Sichtbarer Text'], extra), '.docx');
    assert.strictEqual(result.warnings.length, 1, `${label} must block coverage`);
    assert.doesNotMatch(result.warnings[0], /header1|Vertraulicher|Sichtbarer/u, `${label} warning stays content-free`);
  }
});

test('DOCX embedded images become attachments with a mime type', () => {
  const png = encodePng({ width: 8, height: 8, rgba: Buffer.alloc(8 * 8 * 4, 255) });
  const result = parseOoxml(docx(['Mit Bild'], [
    ['word/media/image1.png', png],
    ['word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>']
  ]), '.docx');
  assert.strictEqual(result.attachments.length, 1);
  assert.strictEqual(result.attachments[0].mimeType, 'image/png');
  assert.strictEqual(result.attachments[0].extension, 'png');
  assert.ok(result.attachments[0].data.length > 0, 'attachment must carry base64 data');
});

test('DOCX vector graphics are surfaced rather than dropped silently', () => {
  const result = parseOoxml(
    docx(['Mit Vektor'], [
      ['word/media/image1.emf', Buffer.from([0x01, 0x00, 0x00, 0x00])],
      ['word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.emf"/></Relationships>']
    ]),
    '.docx'
  );
  assert.strictEqual(result.attachments.length, 1, 'an EMF must not be discarded');
  assert.strictEqual(result.attachments[0].mimeType, 'image/x-emf');
});

test('DOCX media must be uniquely reachable through an internal image relationship', () => {
  const png = encodePng({ width: 2, height: 2, rgba: Buffer.alloc(16, 255) });
  const cases = [
    ['orphan', []],
    ['external', [['word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.invalid/image.png" TargetMode="External"/></Relationships>']]],
    ['wrong relationship type', [['word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="media/image1.png"/></Relationships>']]]
  ];
  for (const [label, extra] of cases) {
    const result = parseOoxml(docx(['Sichtbarer Text'], [
      ['word/media/image1.png', png],
      ...extra
    ]), '.docx');
    assert.strictEqual(result.attachments.length, 0, `${label} media must not reach the local visual path`);
    assert.ok(result.warnings.length >= 1, `${label} must block coverage`);
    for (const warning of result.warnings) {
      assert.doesNotMatch(warning, /image1|example\.invalid|Sichtbarer/u, `${label} warning stays content-free`);
    }
  }
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

test('OOXML personal and custom metadata is extracted for the privacy gate', () => {
  const result = parseOoxml(docx(['Sichtbarer Text'], [
    ['docProps/core.xml', '<cp:coreProperties xmlns:cp="cp" xmlns:dc="dc"><dc:title>Profil A &amp; B</dc:title><dc:creator>Erika Beispiel</dc:creator><cp:lastModifiedBy>Max Muster</cp:lastModifiedBy></cp:coreProperties>'],
    ['docProps/app.xml', '<Properties><Manager>Maria Leitung</Manager><Company>Beispiel GmbH</Company></Properties>'],
    ['docProps/custom.xml', '<Properties><property name="Interner Kontakt"><vt:lpwstr xmlns:vt="vt">Kai Kontakt</vt:lpwstr></property></Properties>']
  ]), '.docx');
  assertPresent(result.markdown, 'Profil A & B', 'metadata entity decoding');
  assertPresent(result.markdown, 'Erika Beispiel', 'creator metadata');
  assertPresent(result.markdown, 'Max Muster', 'last modifier metadata');
  assertPresent(result.markdown, 'Maria Leitung', 'manager metadata');
  assertPresent(result.markdown, 'Beispiel GmbH', 'company metadata');
  assertPresent(result.markdown, 'Kai Kontakt', 'custom metadata');
  assert.strictEqual(result.sections.filter((section) => section.kind === 'metadata').length, 3);
  assert.deepStrictEqual(result.warnings, [], 'processed metadata parts must not trigger an unsupported-part warning');
  const anonymized = pii.anonymize(result.markdown, 'personnel_profile').text;
  for (const raw of ['Erika Beispiel', 'Max Muster', 'Maria Leitung', 'Beispiel GmbH', 'Kai Kontakt']) {
    assert.doesNotMatch(anonymized, new RegExp(raw, 'u'), `${raw} must not survive the privacy gate`);
  }
});

test('OOXML complex custom metadata fails closed instead of being flattened silently', () => {
  const result = parseOoxml(docx(['Sichtbarer Text'], [[
    'docProps/custom.xml',
    '<Properties><property name="Private Liste"><vt:vector xmlns:vt="vt"><vt:lpwstr>Geheimer Wert</vt:lpwstr></vt:vector></property></Properties>'
  ]]), '.docx');
  assert.strictEqual(result.warnings.length, 1);
  assert.match(result.warnings[0], /nicht unterstützte benutzerdefinierte Metadatenwerte/);
  assert.doesNotMatch(result.markdown, /Geheimer Wert/u, 'unsupported values must not be presented as covered output');
});

test('supported embedded OOXML packages are parsed recursively with prefixed locators', () => {
  const inner = docx(['Innerer Kontakt: Erika Beispiel']);
  const result = parseOoxml(docx(['Äußerer Inhalt'], [
    ['word/embeddings/inner.docx', inner],
    ['word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="embeddings/inner.docx"/></Relationships>']
  ]), '.docx');
  assertPresent(result.markdown, 'Innerer Kontakt: Erika Beispiel', 'embedded document text');
  assert.ok(result.sections.some((section) => section.source_part === 'word/embeddings/inner.docx!/word/document.xml'));
  assert.deepStrictEqual(result.warnings, []);
});

test('embedded OOXML recursion stops at the shared depth limit', () => {
  let nested = docx(['Tiefster Inhalt']);
  for (let depth = 0; depth <= MAX_EMBEDDED_DEPTH; depth++) {
    nested = embeddedDocx([`Ebene ${depth}`], nested);
  }
  const result = parseOoxml(nested, '.docx');
  assert.ok(result.warnings.some((warning) => /Rekursionstiefe/u.test(warning)));
});

test('embedded OOXML count and byte budgets are fixed and fail closed', () => {
  assert.strictEqual(MAX_EMBEDDED_DOCUMENTS, 20);
  assert.strictEqual(MAX_EMBEDDED_BYTES, 50 * 1024 * 1024);
  assert.strictEqual(MAX_EMBEDDED_EXPANDED_BYTES, 100 * 1024 * 1024);
  const inner = docx(['Budgetinhalt']);
  const outer = embeddedDocx(['Außen'], inner);
  const count = parseOoxml(outer, '.docx', { depth: 0, budget: {
    documents: MAX_EMBEDDED_DOCUMENTS, archiveBytes: 0, expandedBytes: 0
  } });
  assert.ok(count.warnings.some((warning) => /zu viele eingebettete Dokumente/u.test(warning)));
  const bytes = parseOoxml(outer, '.docx', { depth: 0, budget: {
    documents: 0, archiveBytes: MAX_EMBEDDED_BYTES, expandedBytes: 0
  } });
  assert.ok(bytes.warnings.some((warning) => /Archivbytebudget/u.test(warning)));
  assert.throws(() => parseOoxml(inner, '.docx', { depth: 1, budget: {
    documents: 1, archiveBytes: inner.length, expandedBytes: MAX_EMBEDDED_EXPANDED_BYTES
  } }), /EMBEDDED_EXPANDED_BUDGET_EXCEEDED/);
  assert.throws(() => parseOoxml(Buffer.from('not a zip'), '.docx', { depth: 1, budget: {
    documents: 1, archiveBytes: 9, expandedBytes: MAX_EMBEDDED_EXPANDED_BYTES
  } }), /EMBEDDED_EXPANDED_BUDGET_EXCEEDED/, 'the aggregate budget must stop processing before decompression');
});

test('corrupt supported embeddings and active XLSX content remain blocked', () => {
  const corrupt = parseOoxml(embeddedDocx(['Außen'], Buffer.from('not a zip')), '.docx');
  assert.strictEqual(corrupt.warnings.length, 1);
  assert.doesNotMatch(corrupt.warnings[0], /inner|not a zip/iu);

  const active = parseOoxml(zipStore([
    ['xl/workbook.xml', '<workbook/>'],
    ['xl/vbaProject.bin', Buffer.from('macro bytes')],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>']
  ]), '.xlsx');
  assert.ok(active.warnings.some((warning) => /aktive oder ausführbare/u.test(warning)));
  assert.doesNotMatch(JSON.stringify(active.warnings), /macro bytes|vbaProject/u);
});

test('XLSX and PPTX external or unsupported embedded content fail closed without leaking targets', () => {
  const external = parseOoxml(zipStore([
    ['ppt/slides/slide1.xml', '<p:sld/>'],
    ['ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://customer.example/private" TargetMode="External"/></Relationships>']
  ]), '.pptx');
  assert.ok(external.warnings.some((warning) => /externe Inhaltsbeziehung/u.test(warning)));
  assert.doesNotMatch(JSON.stringify(external.warnings), /customer\.example|private/u);

  const unsupported = parseOoxml(zipStore([
    ['xl/workbook.xml', '<workbook/>'],
    ['xl/embeddings/private.bin', Buffer.from('private embedded bytes')]
  ]), '.xlsx');
  assert.ok(unsupported.warnings.some((warning) => /nicht unterstützte eingebettete Datei/u.test(warning)));
  assert.doesNotMatch(JSON.stringify(unsupported.warnings), /private\.bin|private embedded bytes/u);
});

test('supported embedded extensions do not override active OOXML relationships', () => {
  const inner = docx(['Eingebetteter Text']);
  const result = parseOoxml(embeddedDocx(['Außen'], inner, 'oleObject'), '.docx');
  assert.ok(result.warnings.length > 0, 'an OLE relationship must remain blocking');
  assert.doesNotMatch(result.markdown, /Eingebetteter Text/u, 'an active relationship must not make nested text eligible');
  assert.doesNotMatch(JSON.stringify(result.warnings), /inner\.docx|Eingebetteter Text/u);
});

test('orphaned or ambiguous OOXML embeddings are never parsed by filename alone', () => {
  const inner = docx(['Nicht erreichbarer Inhalt']);
  const orphan = parseOoxml(docx(['Außen'], [['word/embeddings/orphan.docx', inner]]), '.docx');
  assert.ok(orphan.warnings.some((warning) => /interne Paketbeziehung/u.test(warning)));
  assert.doesNotMatch(orphan.markdown, /Nicht erreichbarer Inhalt/u);

  const missing = parseOoxml(docx(['Außen'], [[
    'word/_rels/document.xml.rels',
    '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="embeddings/missing.docx"/></Relationships>'
  ]]), '.docx');
  assert.ok(missing.warnings.some((warning) => /interne Paketbeziehung/u.test(warning)));
  assert.doesNotMatch(JSON.stringify(missing.warnings), /missing\.docx/u);

  const ambiguous = parseOoxml(docx(['Außen'], [
    ['word/embeddings/inner.docx', inner],
    ['word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="embeddings/inner.docx"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="embeddings/inner.docx"/></Relationships>']
  ]), '.docx');
  assert.ok(ambiguous.warnings.some((warning) => /interne Paketbeziehung/u.test(warning)));
  assert.doesNotMatch(ambiguous.markdown, /Nicht erreichbarer Inhalt/u);

  const duplicatePackage = parseOoxml(docx(['Außen'], [
    ['word/embeddings/inner.docx', inner],
    ['word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="embeddings/inner.docx"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="embeddings/inner.docx"/></Relationships>']
  ]), '.docx');
  assert.ok(duplicatePackage.warnings.some((warning) => /interne Paketbeziehung/u.test(warning)));
  assert.doesNotMatch(duplicatePackage.markdown, /Nicht erreichbarer Inhalt/u);
  assert.doesNotMatch(JSON.stringify(duplicatePackage.warnings), /inner\.docx|Nicht erreichbarer Inhalt/u);

  const unrelatedRelationship = parseOoxml(docx(['Außen'], [
    ['word/embeddings/inner.docx', inner],
    ['customXml/item1.xml', '<root/>'],
    ['customXml/_rels/item1.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../word/embeddings/inner.docx"/></Relationships>']
  ]), '.docx');
  assert.ok(unrelatedRelationship.warnings.some((warning) => /interne Paketbeziehung/u.test(warning)));
  assert.doesNotMatch(unrelatedRelationship.markdown, /Nicht erreichbarer Inhalt/u);
  assert.doesNotMatch(JSON.stringify(unrelatedRelationship.warnings), /inner\.docx|Nicht erreichbarer Inhalt|customXml/u);
});

// ---------------------------------------------------------------------------
// XLSX / PPTX
// ---------------------------------------------------------------------------

test('XLSX and PPTX require one internal officeDocument package root', () => {
  const formats = [
    ['.xlsx', 'xl/workbook.xml', '<workbook xmlns:r="r"><sheets/></workbook>'],
    ['.pptx', 'ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst/></p:presentation>']
  ];
  for (const [ext, mainPart, mainXml] of formats) {
    for (const [label, rootXml] of [
      ['missing', null],
      ['external', `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="https://example.invalid/private.xml" TargetMode="External"/></Relationships>`],
      ['wrong target', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="private.xml"/></Relationships>'],
      ['duplicate', `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${mainPart}"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${mainPart}"/></Relationships>`]
    ]) {
      const entries = [[mainPart, mainXml]];
      if (rootXml) entries.push(['_rels/.rels', rootXml]);
      const result = parseOoxml(zipStore(entries), ext);
      assert.ok(result.warnings.some((warning) => /Paketwurzel/u.test(warning)), `${ext} ${label} root must block coverage`);
      assert.doesNotMatch(JSON.stringify(result.warnings), /example\.invalid|private\.xml/u, `${ext} ${label} warning stays content-free`);
    }
  }
});

test('XLSX shared strings are resolved into table cells', () => {
  const buf = zipStore([
    ['ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>'],
    ['xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="Blatt" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
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
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/sharedStrings.xml', '<sst><si><t>C:\\Temp|Name</t></si></sst>'],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>']
  ]);
  assertPresent(parseOoxml(buf, '.xlsx').markdown, 'C:\\\\Temp\\|Name', 'escaped table cell');
});

test('XLSX inline numbers are kept', () => {
  const buf = zipStore([
    ['xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="Blatt" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1"><v>42</v></c></row></sheetData></worksheet>']
  ]);
  assertPresent(parseOoxml(buf, '.xlsx').markdown, '42', 'numeric cell');
});

test('XLSX formula cells stop coverage even when a cached value exists', () => {
  const buf = zipStore([
    ['xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="Blatt" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1"><f>CONCAT("Max", " Mustermann")</f><v>Max Mustermann</v></c></row></sheetData></worksheet>']
  ]);
  const result = parseOoxml(buf, '.xlsx');
  assert.ok(result.warnings.some((warning) => /Formelzelle/u.test(warning)));
  assert.doesNotMatch(JSON.stringify(result.warnings), /Max Mustermann|CONCAT/u, 'formula warning stays content-free');
});

test('XLSX never renders an orphan, external or non-worksheet relationship target', () => {
  const cases = [
    ['orphan', ''],
    ['external', '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="https://example.invalid/private.xml" TargetMode="External"/>'],
    ['wrong type', '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chartsheet" Target="worksheets/sheet1.xml"/>']
  ];
  for (const [label, relationship] of cases) {
    const buf = zipStore([
      ['xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="Privat" r:id="rId1"/></sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', `<Relationships>${relationship}</Relationships>`],
      ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Geheimer Tabellenwert</t></is></c></row></sheetData></worksheet>']
    ]);
    const result = parseOoxml(buf, '.xlsx');
    assert.ok(result.warnings.some((warning) => /Arbeitsblattbeziehung/u.test(warning)), `${label} must be blocked`);
    assert.doesNotMatch(result.markdown, /Geheimer Tabellenwert/u, `${label} must not render orphan text`);
    assert.doesNotMatch(JSON.stringify(result.warnings), /example\.invalid|Privat|Geheimer/u, `${label} warning stays content-free`);
  }
});

test('XLSX media needs an internal image relationship before entering the visual path', () => {
  const base = [
    ['xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="Blatt" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row><c r="A1"><v>1</v></c></row></sheetData></worksheet>'],
    ['xl/media/image1.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])]
  ];
  const valid = parseOoxml(zipStore([...base,
    ['xl/drawings/drawing1.xml', '<xdr:wsDr xmlns:xdr="xdr"/>'],
    ['xl/worksheets/_rels/sheet1.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>'],
    ['xl/drawings/_rels/drawing1.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>']
  ]), '.xlsx');
  assert.strictEqual(valid.attachments.length, 1, 'an internally referenced image remains available locally');
  assert.ok(!valid.warnings.some((warning) => /Bildbeziehung/u.test(warning)));

  const orphan = parseOoxml(zipStore([...base,
    ['xl/drawings/drawing1.xml', '<xdr:wsDr xmlns:xdr="xdr"/>'],
    ['xl/drawings/_rels/drawing1.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>']
  ]), '.xlsx');
  assert.strictEqual(orphan.attachments.length, 0, 'an image from an orphan drawing must not be surfaced');
  assert.ok(orphan.warnings.some((warning) => /Bildbeziehung/u.test(warning)));
  assert.ok(orphan.warnings.some((warning) => /Arbeitsblatt-\/Drawing-Beziehungen/u.test(warning)));
  assert.doesNotMatch(JSON.stringify(orphan.warnings), /image1|Blatt/u);
});

test('XLSX drawing and chart text require the worksheet-to-drawing relationship chain', () => {
  const result = parseOoxml(zipStore([
    ['_rels/.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="Blatt" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row><c r="A1"><v>1</v></c></row></sheetData></worksheet>'],
    ['xl/drawings/drawing1.xml', '<xdr:wsDr xmlns:xdr="xdr" xmlns:a="a"><a:t>Vertraulicher Zeichnungstext</a:t></xdr:wsDr>'],
    ['xl/charts/chart1.xml', '<c:chart xmlns:c="c"><c:v>Geheimer Diagrammwert</c:v></c:chart>'],
    ['xl/drawings/_rels/drawing1.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>']
  ]), '.xlsx');
  assert.ok(result.warnings.some((warning) => /Arbeitsblatt-\/Drawing-Beziehungen/u.test(warning)));
  assert.doesNotMatch(result.markdown, /Vertraulicher Zeichnungstext|Geheimer Diagrammwert/u);
  assert.doesNotMatch(JSON.stringify(result.warnings), /Vertraulicher|Geheimer|drawing1|chart1/u);
});

test('PPTX slide text and speaker notes are both extracted', () => {
  const buf = zipStore([
    ['ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>'],
    [
      'ppt/slides/slide1.xml',
      '<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody>' +
        '<a:p><a:r><a:t>Folientitel</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
    ],
    ['ppt/notesSlides/notesSlide1.xml', '<p:notes xmlns:p="p" xmlns:a="a"><a:t>Notiztext</a:t></p:notes>']
    ,['ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="rId17" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>']
  ]);
  const result = parseOoxml(buf, '.pptx');
  assertPresent(result.markdown, 'Folientitel', 'slide text');
  assertPresent(result.markdown, 'Notiztext', 'speaker note');
});

test('PPTX does not render orphan or external slide targets', () => {
  const cases = [
    ['orphan', ''],
    ['external', '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="https://example.invalid/private.xml" TargetMode="External"/>']
  ];
  for (const [label, relationship] of cases) {
    const result = parseOoxml(zipStore([
      ['ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>'],
      ['ppt/_rels/presentation.xml.rels', `<Relationships>${relationship}</Relationships>`],
      ['ppt/slides/slide1.xml', '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Geheimer Folientext</a:t></p:sld>']
    ]), '.pptx');
    assert.ok(result.warnings.some((warning) => /Folienbeziehung/u.test(warning)), `${label} must block coverage`);
    assert.doesNotMatch(result.markdown, /Geheimer Folientext/u, `${label} must not render orphan slide text`);
    assert.doesNotMatch(JSON.stringify(result.warnings), /example\.invalid|Geheimer/u, `${label} warning stays content-free`);
  }
});

test('PPTX does not choose between multiple notesSlide relationships', () => {
  const result = parseOoxml(zipStore([
    ['ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>'],
    ['ppt/slides/slide1.xml', '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Sichtbare Folie</a:t></p:sld>'],
    ['ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="rId17" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/><Relationship Id="rId18" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide2.xml"/></Relationships>'],
    ['ppt/notesSlides/notesSlide1.xml', '<p:notes xmlns:p="p" xmlns:a="a"><a:t>Private Notiz Eins</a:t></p:notes>'],
    ['ppt/notesSlides/notesSlide2.xml', '<p:notes xmlns:p="p" xmlns:a="a"><a:t>Private Notiz Zwei</a:t></p:notes>']
  ]), '.pptx');
  assertPresent(result.markdown, 'Sichtbare Folie', 'referenced slide');
  assert.doesNotMatch(result.markdown, /Private Notiz Eins|Private Notiz Zwei/u, 'ambiguous notes stay out of output');
});

test('PPTX media needs an internal image relationship before entering the visual path', () => {
  const base = [
    ['ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>'],
    ['ppt/slides/slide1.xml', '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Folie</a:t></p:sld>'],
    ['ppt/media/image1.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])]
  ];
  const valid = parseOoxml(zipStore([...base,
    ['ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>']
  ]), '.pptx');
  assert.strictEqual(valid.attachments.length, 1, 'an internally referenced image remains available locally');
  assert.ok(!valid.warnings.some((warning) => /Bildbeziehung/u.test(warning)));

  const orphan = parseOoxml(zipStore(base), '.pptx');
  assert.strictEqual(orphan.attachments.length, 0, 'an orphan image must not be surfaced');
  assert.ok(orphan.warnings.some((warning) => /Bildbeziehung/u.test(warning)));
  assert.doesNotMatch(JSON.stringify(orphan.warnings), /image1|Folie/u);
});

test('PPTX chart text requires an internal relationship from a reachable slide', () => {
  const result = parseOoxml(zipStore([
    ['_rels/.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'],
    ['ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>'],
    ['ppt/slides/slide1.xml', '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Sichtbare Folie</a:t></p:sld>'],
    ['ppt/charts/chart1.xml', '<c:chart xmlns:c="c"><c:v>Geheimer Diagrammwert</c:v></c:chart>']
  ]), '.pptx');
  assert.ok(result.warnings.some((warning) => /Diagrammstruktur/u.test(warning)));
  assert.doesNotMatch(result.markdown, /Geheimer Diagrammwert/u);
  assert.doesNotMatch(JSON.stringify(result.warnings), /Geheimer|chart1/u);
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

test('directory-only ZIP preflight reports bounded aggregate metadata without inflating entries', () => {
  const archive = zipStore([['a.txt', '1234'], ['folder/b.txt', '5678']]);
  assert.deepStrictEqual(inspectZipDirectory(archive, { maxUncompressed: 8 }), {
    entries: 2, files: 2, uncompressed_bytes: 8
  });
  assert.throws(() => inspectZipDirectory(archive, { maxUncompressed: 7 }), (e) => e instanceof ZipError);
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

  await testAsync('TXT is passed through unchanged', async () => {
  const file = write('note.txt', 'Freitext mit Umlauten: Öl, Ärger, Übung.\n');
  const result = await convertDocument(file);
  assertPresent(result.markdown, 'Öl, Ärger, Übung', 'plain text');
  assert.deepStrictEqual(result.attachments, []);
});

  await testAsync('CSV is converted locally to a Markdown table at the release parser boundary', async () => {
  const file = write('liste.csv', 'Name;Ort\nMax;Köln\n');
  const result = await convertDocument(file);
  assertPresent(result.markdown, '| Name | Ort |', 'CSV header');
  assertPresent(result.markdown, '| Max | Köln |', 'CSV row');
  });

  await testAsync('standalone PNG images remain blocked in the pilot', async () => {
    const png = encodePng({ width: 8, height: 8, rgba: Buffer.alloc(8 * 8 * 4, 255) });
    const file = write('scan.png', png);
    await assert.rejects(() => convertDocument(file), (e) => e.code === 'FORMAT_COVERAGE_UNVERIFIED');
  });

  await testAsync('PDF cannot enter the release parser before full coverage is proven', async () => {
    const file = write('coverage-unverified.pdf', simplePdf(['Kontakt: Max Mustermann']));
    await assert.rejects(
      () => convertDocument(file),
      (error) => error instanceof SafeError && error.code === 'PDF_COVERAGE_UNVERIFIED'
    );
  });

  await testAsync('a CSV with a fence is kept as literal table text', async () => {
  const file = write('inject.csv', 'a;b\n```\n# Überschrift\n');
  const result = await convertDocument(file);
  assertPresent(result.markdown, '\`\`\`', 'literal fence');
  assertPresent(result.markdown, '# Überschrift', 'literal heading-like cell');
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
