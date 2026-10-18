'use strict';

// Real permission-bound conversion children, not a mocked extraction result.
// Source-character policy only; no native host/package or OCR-assets proof.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const markdown = require('markdown-it')({ html: true });
const { decodeHTML } = require('entities');
if (process.version !== 'v22.23.2') throw Error('Use packaged Node 22.23.2 explicitly');
const server = path.resolve(__dirname, '../plugins/data-secure/server');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
let checks = 0, launches = 0;
function office(type, value, location = 'body') {
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
  if (location === 'skipped') {
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
function run(bytes, type, imageOcr, omitDocxHeaderFooter = false) {
  const policy = imageOcr === undefined ? 'markdown-output-content-v1' : 'content-options-v1:' + Buffer.from(JSON.stringify({
    schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr
  })).toString('base64url');
  const result = spawnSync(process.execPath, ['--no-warnings', '--permission', `--allow-fs-read=${server}`,
    '--allow-worker', '--allow-addons', '--disable-proto=throw', '--max-old-space-size=512',
    `--require=${path.join(server, 'network-deny.cjs')}`, path.join(server, 'standalone/conversion-worker-child.js'),
    type, String(bytes.length), policy, ...(omitDocxHeaderFooter ? ['omit-docx-header-footer'] : [])], { input: bytes, encoding: 'utf8', timeout: 10000,
    maxBuffer: 2 * 1024 * 1024, windowsHide: true, shell: false,
    env: { SystemRoot: process.env.SystemRoot || '', WINDIR: process.env.WINDIR || '', PATH: '', DISABLE_SYSTEM_FONTS_LOAD: '1' } });
  launches++;
  assert.ifError(result.error); assert.equal(result.signal, null);
  const response = JSON.parse(result.stdout);
  assert.equal(result.status, response.ok ? 0 : 2);
  return response;
}
for (const type of ['docx', 'xlsx', 'pptx']) for (const imageOcr of [undefined, false, true]) {
  const valid = run(office(type, '<![CDATA[Ä€🙂 &#127; &#x85; &unknown;]]>'), type, imageOcr);
  assert.equal(valid.ok, true);
  assert.match(decodeHTML(markdown.render(valid.result.markdown).replace(/<[^>]*>/gu, '')), /Ä€🙂 &#127; &#x85; &unknown;/u); checks += 2;
  const validMetadata = run(office(type, '<![CDATA[Ä€🙂 &#127; &unknown;]]>', 'metadata'), type, imageOcr);
  assert.equal(validMetadata.ok, true);
  assert.match(decodeHTML(markdown.render(validMetadata.result.markdown).replace(/<[^>]*>/gu, '')), /Ä€🙂 &#127; &unknown;/u); checks += 2;
  for (const control of ['\u007f', '\u0080', '\u0085', '\u009f']) for (const value of [control, `<![CDATA[${control}]]>`]) {
    const response = run(office(type, `4111${value}1111${value}1111${value}1111`), type, imageOcr);
    assert.equal(response.ok, false, `${type}/${imageOcr}/${JSON.stringify(value)}`);
    assert.equal(response.error_code, 'OOXML_XML_CHARACTER_INVALID'); checks += 2;
  }
  for (const value of ['4111\u00851111', '<![CDATA[4111\u009f1111]]>', '4111&#127;1111']) {
    const response = run(office(type, value, 'metadata'), type, imageOcr);
    assert.equal(response.ok, false); assert.equal(response.error_code, 'OOXML_XML_CHARACTER_INVALID'); checks += 2;
  }
  if (type === 'docx') for (const value of ['4111\u00851111', '<![CDATA[4111\u009f1111]]>']) {
    for (const [location, omit] of [['header', false], ['header', true], ['skipped', false]]) {
      const response = run(office(type, value, location), type, imageOcr, omit);
      assert.equal(response.ok, false); assert.equal(response.error_code, 'OOXML_XML_CHARACTER_INVALID'); checks += 2;
    }
  }
  if (type === 'docx') for (const [location, omit] of [['header', false], ['header', true], ['skipped', false]]) {
    const response = run(office(type, 'VALID', location), type, imageOcr, omit);
    assert.equal(response.ok, true); assert.match(response.result.markdown, /UNCHANGED/u); checks += 2;
  }
}
console.log(`OOXML CHARACTER WORKER PASS ${checks} checks; ${launches} actual permission-bound Node ${process.version} children`);
