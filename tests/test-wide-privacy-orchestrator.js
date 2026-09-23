'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSuite } = require('./helpers');

const scope = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-wide-privacy-')));
const previous = Object.fromEntries(['EU_PRIVACY_DATA_ROOT', 'EU_PRIVACY_ROOT', 'EU_PRIVACY_RESULT_ROOT',
  'DATASECURE_PRODUCT_CHANNEL'].map(key => [key, process.env[key]]));
process.env.EU_PRIVACY_DATA_ROOT = path.join(scope, 'data');
process.env.EU_PRIVACY_ROOT = path.join(scope, 'privacy');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(scope, 'visible');
process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT, { recursive: true });

const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { extractWideSourceForPrivacy } = require('../plugins/data-secure/server/standalone/wide-privacy-extraction');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const { scanResidual } = require('../plugins/data-secure/server/privacy/engine');
const { anonymizeNext } = require('../plugins/data-secure/server/gateway/orchestrator');
const { readOutput } = require('../plugins/data-secure/server/gateway/package-store');
const { createBatchPseudonymRegistry, READABLE_CONTRACT_VERSION } = require('../plugins/data-secure/server/batch-pseudonym-registry');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { testAsync, assert, done } = createSuite('Wide Standalone privacy orchestration');

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const cell = (value) => `<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc>`;
function privacyTableDocx() {
  return zipStore([...opcControlEntries('docx', { additionalOverrides: [
    { part: 'word/header1.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml' },
    { part: 'word/footer1.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml' }
  ] }), ['word/document.xml',
    `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body><w:tbl>` +
    `<w:tr>${cell('Name')}${cell('Arbeitgeber')}</w:tr>` +
    `<w:tr>${cell('Max Mustermann')}${cell('Nordlicht GmbH')}</w:tr>` +
    '</w:tbl><w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/>' +
    '<w:footerReference w:type="default" r:id="rIdFooter1"/></w:sectPr></w:body></w:document>'],
  ['word/_rels/document.xml.rels', `<Relationships xmlns="${PR}">` +
    `<Relationship Id="rIdHeader1" Type="${R}/header" Target="header1.xml"/>` +
    `<Relationship Id="rIdFooter1" Type="${R}/footer" Target="footer1.xml"/></Relationships>`],
  ['word/header1.xml', `<w:hdr xmlns:w="${W}"><w:p><w:r><w:t>HEADER PRIVATE</w:t></w:r></w:p></w:hdr>`],
  ['word/footer1.xml', `<w:ftr xmlns:w="${W}"><w:p><w:r><w:t>FOOTER PRIVATE</w:t></w:r></w:p></w:ftr>`]]);
}
function privacyTableXlsx() {
  const row = (number, left, right) => `<row r="${number}"><c r="A${number}" t="inlineStr"><is><t>${left}</t></is></c><c r="B${number}" t="inlineStr"><is><t>${right}</t></is></c></row>`;
  return zipStore([...opcControlEntries('xlsx'),
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Kontakte" sheetId="1" r:id="s1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${S}"><sheetData>${row(1, 'Name', 'Arbeitgeber')}${row(2, 'Max Mustermann', 'Nordlicht GmbH')}</sheetData></worksheet>`]
  ]);
}
function privacyTablePptx() {
  const row = (left, right) => `<a:tr><a:tc><a:txBody><a:p><a:r><a:t>${left}</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>${right}</a:t></a:r></a:p></a:txBody></a:tc></a:tr>`;
  return zipStore([...opcControlEntries('pptx'),
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s1"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`],
    ['ppt/slides/slide1.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><a:tbl>${row('Name', 'Arbeitgeber')}${row('Max Mustermann', 'Nordlicht GmbH')}</a:tbl></p:spTree></p:cSld></p:sld>`]
  ]);
}

function privateEntry(name, text = 'opaque binary source') {
  return { name, private_artifact_plain: true, private_bytes: Buffer.from(text) };
}

// Use the real in-memory extractor and preserve its semantic option. Worker
// lifecycle options (signal/timeout) do not belong to the extractor contract.
async function directConversion(input, extension, { omitDocxHeaderFooter } = {}) {
  return extractMarkdownBuffer(input, extension, { omitDocxHeaderFooter });
}

testAsync('wide DOCX XLSX and PPTX retain an explicit source header for privacy detection', async () => {
  for (const [extension, bytes] of [['.docx', privacyTableDocx()], ['.xlsx', privacyTableXlsx()], ['.pptx', privacyTablePptx()]]) {
    const raw = extractMarkdownBuffer(bytes, extension);
    assert.match(raw.markdown, /\| Spalte 1 \| Spalte 2 \|/u, `${extension} conversion remains content preserving`);
    const extracted = await extractWideSourceForPrivacy(bytes, extension, { convertBuffer: directConversion });
    assert.match(extracted.markdown, /\| Name \| Arbeitgeber \|\n\| --- \| --- \|/u, extension);
    assert.doesNotMatch(extracted.markdown, /\| Spalte 1 \| Spalte 2 \|/u, extension);
    if (extension === '.docx') {
      assert.match(raw.markdown, /HEADER PRIVATE/u);
      assert.doesNotMatch(extracted.markdown, /HEADER PRIVATE|FOOTER PRIVATE/u);
    }
    const entry = { name: `privacy-table${extension}`, private_artifact_plain: true, private_bytes: Buffer.from(bytes) };
    const result = await anonymizeNext('personnel_profile', { productChannel: 'standalone', inputQueue: [entry],
      convertBuffer: directConversion });
    const released = readOutput(result.package_id, result.read_capability).text;
    assert.doesNotMatch(released, /Max Mustermann|Nordlicht GmbH/u, extension);
    assert.match(released, /\[PERSON_001\]|\[UNTERNEHMEN_001\]/u, extension);
  }
});

testAsync('wide privacy promotes operational person headers before anonymization', async () => {
  for (const label of ['Zuständig', 'Verantwortliche', 'Bearbeiterin', 'Sachbearbeiter', 'Betreuerin',
    'Autor', 'Verfasserin', 'Empfänger', 'Absenderin', 'Unterzeichner', 'Gesprächspartnerin', 'Kontakt']) {
    const extracted = await extractWideSourceForPrivacy(Buffer.from('fixture'), '.xlsx', {
      async convertBuffer() {
        return createMarkdownExtraction({
          source_type: 'xlsx',
          markdown: `| Spalte 1 | Spalte 2 |\n| --- | --- |\n| ${label} | Rolle |\n| Anna Berger | Product Owner |`,
          coverage: { status: 'incomplete', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] }
        });
      }
    });
    assert.match(extracted.markdown, new RegExp(`\\| ${label} \\| Rolle \\|\\n\\| --- \\| --- \\|`, 'u'), label);
    assert.doesNotMatch(extracted.markdown, /\| Spalte 1 \| Spalte 2 \|/u, label);
    const privacy = anonymizeMarkdown(extracted.markdown, 'customer_document');
    assert.doesNotMatch(privacy.text, /Anna Berger/u, label);
    assert.deepStrictEqual(scanResidual(privacy.text, 'customer_document'), [], label);
  }
});

testAsync('complete wide extraction is converted once, anonymized and published without a raw dm artifact', async () => {
  const entry = privateEntry('customer.pdf');
  let conversions = 0;
  const result = await anonymizeNext('general', {
    productChannel: 'standalone',
    inputQueue: [entry],
    async convertBuffer() {
      conversions++;
      return createMarkdownExtraction({ source_type: 'pdf',
        markdown: 'E-Mail: max.mustermann@example.org\nTelefon: +49 30 12345678\nIBAN: DE89370400440532013000',
        coverage: { status: 'complete', reason_codes: [] } });
    }
  });
  assert.equal(conversions, 1);
  assert.equal(result.document_result.grade, 'complete');
  assert.equal(result.privacy_scope, 'extracted-markdown-only');
  assert.deepEqual(result.source_extraction_coverage, { status: 'complete', reason_codes: [] });
  assert.equal(result.raw_content_sent_to_claude, false);
  assert.ok(entry.private_bytes.every(byte => byte === 0));
  const released = readOutput(result.package_id, result.read_capability);
  assert.equal(released.ok, true);
  assert.doesNotMatch(released.text, /max\.mustermann|12345678|DE89370400440532013000/iu);
  assert.match(released.text, /\[EMAIL_REDACTED\]|\[PHONE_REDACTED\]|\[BANK_DATA_REDACTED\]/u);
  const rawRoot = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'markdown-artifacts');
  assert.equal(fs.existsSync(rawRoot) ? fs.readdirSync(rawRoot).length : 0, 0);
});

testAsync('incomplete but useful wide extraction anonymizes its Markdown once with an explicit scope notice', async () => {
  const entry = privateEntry('scan.png', 'unchanged source bytes');
  let conversions = 0;
  const result = await anonymizeNext('general', {
    productChannel: 'standalone', inputQueue: [entry],
    async convertBuffer() {
      conversions++;
      return createMarkdownExtraction({ source_type: 'png', markdown: 'Max Mustermann',
        coverage: { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED'] } });
    }
  });
  assert.equal(conversions, 1);
  assert.equal(result.document_result.grade, 'complete');
  assert.equal(result.privacy_scope, 'extracted-markdown-only');
  assert.deepEqual(result.source_extraction_coverage,
    { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED'] });
  const released = readOutput(result.package_id, result.read_capability).text;
  assert.match(released, /ausschließlich der lokal in Markdown umgewandelte Inhalt/u);
  assert.match(released, /\[PERSON_001\]/u);
  assert.doesNotMatch(released, /Max Mustermann/u);
  assert.ok(entry.private_bytes.every(byte => byte === 0));
});

testAsync('Standalone DOCX with non-rendered custom XML anonymizes extracted Markdown and reports source scope', async () => {
  const document = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body><w:p><w:r><w:t>Name: Max Mustermann</w:t></w:r></w:p></w:body></w:document>';
  const docx = zipStore([
    ...opcControlEntries('docx', { additionalOverrides: [{
      part: 'customXml/itemProps1.xml',
      contentType: 'application/vnd.openxmlformats-officedocument.customXmlProperties+xml'
    }] }),
    ['word/document.xml', document],
    ['customXml/item1.xml', '<profile><department>Vertrieb</department></profile>'],
    ['customXml/itemProps1.xml', '<ds:datastoreItem xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"/>']
  ]);
  const entry = { name: 'profile.docx', private_artifact_plain: true, private_bytes: Buffer.from(docx) };
  const result = await anonymizeNext('personnel_profile', {
    productChannel: 'standalone', inputQueue: [entry], convertBuffer: directConversion
  });
  assert.equal(result.document_result.grade, 'complete');
  assert.equal(result.privacy_scope, 'extracted-markdown-only');
  assert.deepEqual(result.source_extraction_coverage, {
    status: 'incomplete',
    reason_codes: ['DOCX_HEADER_FOOTER_EXCLUDED_BY_POLICY', 'SOURCE_COVERAGE_UNVERIFIED']
  });
  const released = readOutput(result.package_id, result.read_capability).text;
  assert.match(released, /\[PERSON_001\]/u);
  assert.doesNotMatch(released, /Max Mustermann|Vertrieb/u);
  assert.match(released, /Vollständigkeit der Extraktion aus der Originaldatei ist nicht garantiert/u);
  assert.ok(entry.private_bytes.every(byte => byte === 0));
});

testAsync('empty OCR publishes nothing', async () => {
  const entry = privateEntry('scan.png', 'unchanged source bytes');
  let publications = 0;
  await assert.rejects(anonymizeNext('general', {
    productChannel: 'standalone', inputQueue: [entry], publishPackage() { publications++; },
    async convertBuffer() {
      return createMarkdownExtraction({ source_type: 'png', markdown: '',
        coverage: { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED', 'OCR_TEXT_EMPTY'] } });
    }
  }), { code: 'PARSER_COVERAGE_UNVERIFIED' });
  assert.equal(publications, 0);
  assert.ok(entry.private_bytes.every(byte => byte === 0));
});

testAsync('the Cowork/plugin channel still blocks PDF before any wide converter', async () => {
  const entry = privateEntry('customer.pdf');
  let conversions = 0;
  await assert.rejects(anonymizeNext('general', { productChannel: 'plugin', inputQueue: [entry],
    async convertBuffer() { conversions++; throw new Error('must not run'); } }),
  error => ['PDF_COVERAGE_UNVERIFIED', 'FORMAT_COVERAGE_UNVERIFIED'].includes(error.code));
  assert.equal(conversions, 0);
});

testAsync('Cowork DOCX privacy omits header and footer through the isolated parser contract', async () => {
  const entry = { name: 'profile.docx', private_artifact_plain: true,
    private_bytes: Buffer.from(privacyTableDocx()) };
  const result = await anonymizeNext('personnel_profile', {
    productChannel: 'plugin', inputQueue: [entry]
  });
  assert.equal(result.privacy_scope, 'extracted-markdown-only');
  assert.deepEqual(result.source_extraction_coverage, {
    status: 'incomplete', reason_codes: ['DOCX_HEADER_FOOTER_EXCLUDED_BY_POLICY']
  });
  const released = readOutput(result.package_id, result.read_capability).text;
  assert.match(released, /DOCX-Struktur wurde vollständig geprüft/u);
  assert.match(released, /bewusst keine Kopf- und Fußzeilen/u);
  assert.doesNotMatch(released, /Vollständigkeit der Extraktion aus der Originaldatei ist nicht garantiert/u);
  assert.match(released, /\[PERSON_[A-Z0-9]+\]|\[UNTERNEHMEN_[A-Z0-9]+\]/u);
  assert.doesNotMatch(released, /Max Mustermann|Nordlicht GmbH|HEADER PRIVATE|FOOTER PRIVATE/u);
  assert.ok(entry.private_bytes.every(byte => byte === 0));
});

testAsync('Cowork anonymizes XLSX and PPTX through its isolated Markdown-first Office path', async () => {
  for (const extension of ['.xlsx', '.pptx']) {
    const entry = privateEntry(`customer${extension}`);
    let conversions = 0;
    const result = await anonymizeNext('personnel_profile', {
      productChannel: 'plugin', inputQueue: [entry],
      async convertDocument(_source, options) {
        conversions++;
        assert.equal(options.sourceName, `source${extension}`);
        return {
          markdown: '| Name | Arbeitgeber |\n| --- | --- |\n| Max Mustermann | Nordlicht GmbH |',
          warnings: [], attachments: [], unreviewedVisualCount: 0, requiresExplicitProfile: false
        };
      }
    });
    assert.equal(conversions, 1, extension);
    assert.equal(result.privacy_scope, 'extracted-markdown-only');
    assert.deepEqual(result.source_extraction_coverage,
      { status: 'incomplete', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] });
    assert.equal(result.raw_content_sent_to_claude, false);
    const released = readOutput(result.package_id, result.read_capability).text;
    assert.match(released, /\[PERSON_[A-Z0-9]+\]|\[UNTERNEHMEN_[A-Z0-9]+\]/u, extension);
    assert.doesNotMatch(released, /Max Mustermann|Nordlicht GmbH/u, extension);
    assert.ok(entry.private_bytes.every(byte => byte === 0));
  }
});

testAsync('the real isolated Cowork parser processes XLSX and PPTX locally', async () => {
  for (const [extension, bytes] of [['.xlsx', privacyTableXlsx()], ['.pptx', privacyTablePptx()]]) {
    const result = await anonymizeNext('personnel_profile', {
      productChannel: 'plugin',
      inputQueue: [{ name: `office${extension}`, private_artifact_plain: true, private_bytes: Buffer.from(bytes) }]
    });
    assert.equal(result.privacy_scope, 'extracted-markdown-only');
    assert.deepEqual(result.source_extraction_coverage,
      { status: 'incomplete', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] });
    const readResult = readOutput(result.package_id, result.read_capability);
    assert.equal(readResult.privacy_scope, 'extracted-markdown-only', extension);
    assert.deepEqual(readResult.source_extraction_coverage,
      { status: 'incomplete', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] }, extension);
    assert.doesNotMatch(readResult.text, /Max Mustermann|Nordlicht GmbH/u, extension);
    assert.match(readResult.text, /\[PERSON_[A-Z0-9]+\]|\[UNTERNEHMEN_[A-Z0-9]+\]/u, extension);
  }
});

testAsync('direct and converted sources share readable person and company identities in one batch registry', async () => {
  const secret = Buffer.alloc(32, 37);
  const registry = createBatchPseudonymRegistry(secret, { contractVersion: READABLE_CONTRACT_VERSION });
  try {
    const direct = await anonymizeNext('personnel_profile', { productChannel: 'standalone', pseudonymRegistry: registry,
      inputQueue: [privateEntry('profile.txt', 'Name: Max Mustermann\nArbeitgeber: Nordstern GmbH')] });
    const converted = await anonymizeNext('personnel_profile', { productChannel: 'standalone', pseudonymRegistry: registry,
      inputQueue: [privateEntry('profile.pdf')], async convertBuffer() {
        return createMarkdownExtraction({ source_type: 'pdf',
          markdown: 'Name: Max Mustermann\nKunde: Nordstern GmbH',
          coverage: { status: 'complete', reason_codes: [] } });
      } });
    const first = readOutput(direct.package_id, direct.read_capability).text;
    const second = readOutput(converted.package_id, converted.read_capability).text;
    for (const output of [first, second]) {
      assert.match(output, /\[PERSON_001\]/u);
      assert.match(output, /\[UNTERNEHMEN_001\]/u);
      assert.doesNotMatch(output, /Max Mustermann|Nordstern GmbH/u);
    }
  } finally {
    registry.dispose();
    secret.fill(0);
  }
});

done(() => {
  fs.rmSync(scope, { recursive: true, force: true });
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
