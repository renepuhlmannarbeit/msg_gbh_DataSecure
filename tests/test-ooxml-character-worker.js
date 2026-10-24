'use strict';

// Real permission-bound conversion children, not a mocked extraction result.
// Source-character policy only; no native host/package or OCR-assets proof.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { CheckpointStream } = require('../plugins/data-secure/server/standalone/conversion-checkpoints');
const markdown = require('markdown-it')({ html: true });
const { decodeHTML } = require('entities');
if (process.version !== 'v22.23.2') throw Error('Use packaged Node 22.23.2 explicitly');
const server = path.resolve(__dirname, '../plugins/data-secure/server');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
let checks = 0, launches = 0, protocolNegatives = 0;
const contentOptions = imageOcr => ({ schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr });
function office(type, value, location = 'body', independentSafeUnit = false) {
  const content = location === 'body' ? value : 'UNCHANGED';
  const parts = type === 'docx' ? [
    ['word/document.xml', `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${content}</w:t></w:r></w:p></w:body></w:document>`]
  ] : type === 'xlsx' ? [
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Quelle" sheetId="1" r:id="sheet"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="sheet" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${content}</t></is></c></row></sheetData></worksheet>`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml']
  ] : [
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="slide"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="slide" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`],
    ['ppt/slides/slide1.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${content}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`, 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml']
  ];
  if (independentSafeUnit) {
    assert.equal(location, 'body'); assert.ok(type === 'xlsx' || type === 'pptx');
    if (type === 'xlsx') {
      parts[0][1] = parts[0][1].replace('</sheets>', '<sheet name="Kontrolle" sheetId="2" r:id="safe"/></sheets>');
      parts[1][1] = parts[1][1].replace('</Relationships>', `<Relationship Id="safe" Type="${R}/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`);
      parts.push(['xl/worksheets/sheet2.xml', `<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>SAFE_CONTROL_Äß</t></is></c></row></sheetData></worksheet>`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml']);
    } else {
      parts[0][1] = parts[0][1].replace('</p:sldIdLst>', '<p:sldId id="257" r:id="safe"/></p:sldIdLst>');
      parts[1][1] = parts[1][1].replace('</Relationships>', `<Relationship Id="safe" Type="${R}/slide" Target="slides/slide2.xml"/></Relationships>`);
      parts.push(['ppt/slides/slide2.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>SAFE_CONTROL_Äß</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
        'application/vnd.openxmlformats-officedocument.presentationml.slide+xml']);
    }
  }
  if (location === 'skipped') {
    assert.equal(type, 'docx');
    parts[0][1] = parts[0][1].replace('<w:r>', `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>${value}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r>`)
      .replace('</w:p>', '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>');
  }
  if (location === 'literal-instr') {
    assert.equal(type, 'docx');
    parts[0][1] = parts[0][1].replace('<w:r>', `<w:r><w:instrText>${value}</w:instrText>`);
  }
  if (location === 'header') {
    assert.equal(type, 'docx');
    parts[0][1] = parts[0][1].replace(`xmlns:w="${W}"`, `xmlns:w="${W}" xmlns:r="${R}"`)
      .replace('</w:body>', '<w:sectPr><w:headerReference w:type="default" r:id="header"/></w:sectPr></w:body>');
    parts.push(['word/header1.xml', `<w:hdr xmlns:w="${W}"><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:hdr>`,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml'],
    ['word/_rels/document.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="header" Type="${R}/header" Target="header1.xml"/></Relationships>`]);
  }
  if (location === 'metadata') parts.push(['docProps/custom.xml', `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="Kontakt"><vt:lpwstr>${value}</vt:lpwstr></property></Properties>`, 'application/vnd.openxmlformats-officedocument.custom-properties+xml']);
  const controls = opcControlEntries(type, { additionalOverrides: parts.filter(item => item[2]).map(([part, , contentType]) => ({ part, contentType })) });
  if (location === 'metadata') controls[1][1] = controls[1][1].replace('</Relationships>', `<Relationship Id="custom" Type="${R}/custom-properties" Target="docProps/custom.xml"/></Relationships>`);
  return zipStore([...controls, ...parts.map(([name, data]) => [name, data])]);
}
function response(bytes, type, imageOcr) {
  assert.ok(Buffer.isBuffer(bytes));
  if (imageOcr !== undefined) {
    const stream = new CheckpointStream(type, contentOptions(imageOcr));
    stream.push(bytes); return stream.response();
  }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  assert.equal(value.schema, 'datasecure-conversion-response/1'); assert.equal(typeof value.ok, 'boolean');
  assert.deepEqual(Object.keys(value).sort(), (value.ok ? ['schema', 'ok', 'result'] : ['schema', 'ok', 'error_code']).sort());
  if (value.ok) assert.equal(value.result.source_type, type);
  return value;
}
function run(bytes, type, imageOcr, omitDocxHeaderFooter = false) {
  const policy = imageOcr === undefined ? 'markdown-output-content-v1'
    : 'content-options-v1:' + Buffer.from(JSON.stringify(contentOptions(imageOcr))).toString('base64url');
  const result = spawnSync(process.execPath, ['--no-warnings', '--permission', `--allow-fs-read=${server}`,
    '--allow-worker', '--allow-addons', '--disable-proto=throw', '--max-old-space-size=512',
    `--require=${path.join(server, 'network-deny.cjs')}`, path.join(server, 'standalone/conversion-worker-child.js'),
    type, String(bytes.length), policy, ...(omitDocxHeaderFooter ? ['omit-docx-header-footer'] : [])], { input: bytes, timeout: 10000,
    maxBuffer: 2 * 1024 * 1024, windowsHide: true, shell: false,
    env: { SystemRoot: process.env.SystemRoot || '', WINDIR: process.env.WINDIR || '', PATH: '', DISABLE_SYSTEM_FONTS_LOAD: '1' } });
  launches++;
  assert.ifError(result.error); assert.equal(result.signal, null);
  const decoded = response(result.stdout, type, imageOcr);
  assert.equal(result.status, decoded.ok ? 0 : 2);
  return decoded;
}
function expectCharacterFailure(result) {
  assert.equal(result.ok, false); assert.equal(result.error_code, 'OOXML_XML_CHARACTER_INVALID'); checks += 2;
}
function expectDamagedPartOmission(result, expectedMarkdown, omittedHeader = false) {
  assert.equal(result.ok, true); assert.equal(result.result.coverage.status, 'incomplete');
  assert.ok(result.result.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
  if (expectedMarkdown === null) assert.match(decodeHTML(markdown.render(result.result.markdown)
    .replace(/<[^>]*>/gu, '')), /SAFE_CONTROL_Äß/u);
  else assert.equal(result.result.markdown, expectedMarkdown);
  assert.doesNotMatch(result.result.markdown, /4111|1111|[\u007f-\u009f]/u);
  if (omittedHeader) assert.ok(result.result.coverage.reason_codes.includes('DOCX_HEADER_FOOTER_EXCLUDED_BY_POLICY'));
  checks += 5 + Number(omittedHeader);
}
for (const type of ['docx', 'xlsx', 'pptx']) for (const imageOcr of [undefined, false, true]) {
  const unchanged = run(office(type, 'UNCHANGED'), type, imageOcr);
  assert.equal(unchanged.ok, true); assert.match(unchanged.result.markdown, /UNCHANGED/u); checks += 2;
  const valid = run(office(type, '<![CDATA[Ä€🙂 &#127; &#x85; &unknown;]]>'), type, imageOcr);
  assert.equal(valid.ok, true);
  assert.match(decodeHTML(markdown.render(valid.result.markdown).replace(/<[^>]*>/gu, '')), /Ä€🙂 &#127; &#x85; &unknown;/u); checks += 2;
  const validMetadata = run(office(type, '<![CDATA[Ä€🙂 &#127; &unknown;]]>', 'metadata'), type, imageOcr);
  assert.equal(validMetadata.ok, true);
  // Both protocol entrances explicitly request content-v1. Valid technical
  // metadata is omitted, but invalid source scalars below remain hard errors
  // (or an explicit damaged-part omission in the partial protocol).
  assert.doesNotMatch(validMetadata.result.markdown,/Ä€🙂|unknown/u);assert.match(validMetadata.result.markdown,/UNCHANGED/u);
  checks += 2;
  for (const control of ['\u007f', '\u0080', '\u0085', '\u009f']) for (const value of [control, `<![CDATA[${control}]]>`]) {
    const actual = run(office(type, `4111${value}1111${value}1111${value}1111`, 'body', type !== 'docx'), type, imageOcr);
    if (imageOcr !== undefined && type !== 'docx') expectDamagedPartOmission(actual, null);
    else expectCharacterFailure(actual);
  }
  for (const value of ['4111\u00851111', '<![CDATA[4111\u009f1111]]>', '4111&#127;1111']) {
    const actual = run(office(type, value, 'metadata'), type, imageOcr);
    if (imageOcr === undefined) expectCharacterFailure(actual);
    else expectDamagedPartOmission(actual, unchanged.result.markdown);
  }
  if (type === 'docx') for (const value of ['4111\u00851111', '<![CDATA[4111\u009f1111]]>']) {
    for (const [location, omit] of [['header', false], ['header', true], ['skipped', false], ['literal-instr', false]]) {
      const actual = run(office(type, value, location), type, imageOcr, omit);
      if (imageOcr !== undefined && location === 'header') expectDamagedPartOmission(actual, unchanged.result.markdown, omit);
      else expectCharacterFailure(actual);
    }
  }
  if (type === 'docx') for (const [location, omit] of [['header', false], ['header', true], ['skipped', false], ['literal-instr', false]]) {
    const response = run(office(type, 'VALID', location), type, imageOcr, omit);
    assert.equal(response.ok, true); assert.match(response.result.markdown, /UNCHANGED/u); checks += 2;
    if(location === 'literal-instr') { assert.match(response.result.markdown,/VALIDUNCHANGED/u); checks++; }
    if(location === 'skipped') { assert.doesNotMatch(response.result.markdown,/VALID/u); checks++; }
  }
  if (type !== 'docx' && imageOcr !== undefined) {
    // No independent valid sheet/slide: an omission marker or generated
    // heading cannot become a successful document with no usable source text.
    const empty = run(office(type, '4111\u00851111'), type, imageOcr);
    assert.equal(empty.ok, false);
    assert.equal(empty.error_code, imageOcr ? 'CONVERSION_OCR_TEXT_EMPTY' : 'CONVERSION_EXTRACTION_FAILED'); checks += 2;
  }
}
for (const type of ['docx', 'xlsx', 'pptx']) {
  const result = { schema: 'datasecure-markdown-extraction/2', processing_mode: 'markdown-only', anonymized: false,
    source_type: type, markdown: 'Ä€🙂 literal &#127;', content_options: contentOptions(true),
    coverage: { status: 'complete', reason_codes: [] } };
  const frame = { schema: 'datasecure-conversion-unit/1', sequence: 1, index: 0, result };
  const terminal = { schema: 'datasecure-conversion-response/2', ok: true, result };
  const line = value => Buffer.from(JSON.stringify(value) + '\n');
  assert.deepEqual(response(Buffer.concat([line(frame), Buffer.from(JSON.stringify(terminal))]), type, true), terminal);
  for (const bytes of [line(frame), Buffer.concat([line(terminal), line(terminal)]),
    Buffer.concat([line(terminal), line(frame)]), Buffer.from(JSON.stringify(terminal) + 'garbage'),
    line({ ...terminal, result: { ...result, content_options: contentOptions(false) } }),
    line({ ...frame, sequence: 2 }), Buffer.from([0xff])]) {
    assert.throws(() => response(bytes, type, true)); protocolNegatives++;
  }
}
console.log(`OOXML CHARACTER WORKER PASS ${checks} checks; ${protocolNegatives} protocol negatives; ${launches} actual permission-bound Node ${process.version} children`);
