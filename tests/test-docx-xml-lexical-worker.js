'use strict';

// Explicit headless Node-22 regression of the ACTUAL conversion child and its
// default/false/true image-OCR branches. No OCR assets, GUI, source files or
// prepared runtime mutation. This is not a native Job Object/package proof.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { W, reviewDocx } = require('./lib/docx-review-fixtures');
if (process.version !== 'v22.23.2') throw Error('Use packaged Node 22.23.2 explicitly');
const server = path.resolve(__dirname, '../plugins/data-secure/server');
let checks = 0, launches = 0;
function docx(value, declaration = '') {
  return zipStore([...opcControlEntries('docx'), ['word/document.xml', declaration +
    `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:body></w:document>`]]);
}
function headerDocx(value) {
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zipStore([...opcControlEntries('docx', { additionalOverrides: [{ part: 'word/header1.xml',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml' }] }),
  ['word/document.xml', `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body><w:p><w:r><w:t>MAIN</w:t></w:r></w:p>` +
    '<w:sectPr><w:headerReference w:type="default" r:id="header"/></w:sectPr></w:body></w:document>'],
  ['word/header1.xml', `<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="${W}"><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:hdr>`],
  ['word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="header" Type="${R}/header" Target="header1.xml"/></Relationships>`]]);
}
function run(bytes, imageOcr, omitDocxHeaderFooter = false) {
  const policy = imageOcr === undefined ? 'markdown-output-content-v1' : 'content-options-v1:' + Buffer.from(JSON.stringify({
    schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr
  })).toString('base64url');
  const result = spawnSync(process.execPath, ['--no-warnings', '--permission', `--allow-fs-read=${server}`,
    '--allow-worker', '--allow-addons', '--disable-proto=throw', '--max-old-space-size=512',
    `--require=${path.join(server, 'network-deny.cjs')}`, path.join(server, 'standalone/conversion-worker-child.js'),
    'docx', String(bytes.length), policy, ...(omitDocxHeaderFooter ? ['omit-docx-header-footer'] : [])], {
    input: bytes, encoding: 'utf8', timeout: 10000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, shell: false,
    env: { SystemRoot: process.env.SystemRoot || '', WINDIR: process.env.WINDIR || '', PATH: '', DISABLE_SYSTEM_FONTS_LOAD: '1' }
  });
  launches++;
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  const response = JSON.parse(result.stdout);
  assert.equal(result.status, response.ok ? 0 : 2);
  return response;
}
for (const imageOcr of [undefined, false, true]) {
  const positive = run(docx('A<!----><?probe </w:t>?><![CDATA[&lt;]]>B',
    '<?xml version="1.0" encoding="UTF-8"?>'), imageOcr);
  assert.equal(positive.ok, true); assert.equal(positive.result.markdown, 'A&amp;lt;B'); checks += 2;
  const plain = run(docx('AB'), imageOcr);
  assert.equal(plain.ok, true); assert.equal(plain.result.coverage.status, 'complete'); checks += 2;
  for (const token of ['<!--bad--->', '<!--bad--inside-->', '<??>', '<?xml version="1.0"?>']) {
    const result = run(docx(`A${token}B`), imageOcr);
    assert.equal(result.ok, false); assert.equal(result.error_code, 'DOCX_STRUCTURE_UNSAFE'); checks += 2;
  }
  const skipped = run(reviewDocx('<w:p><w:r><w:instrText>A<!--bad--->B</w:instrText><w:t>VISIBLE</w:t></w:r></w:p>'), imageOcr);
  assert.equal(skipped.ok, false); assert.equal(skipped.error_code, 'DOCX_STRUCTURE_UNSAFE'); checks += 2;
  const header = run(headerDocx('HEADER<!----><?probe </w:t>?>TEXT'), imageOcr);
  assert.equal(header.ok, true); assert.match(header.result.markdown, /HEADERTEXT/u); checks += 2;
  const invalidHeader = run(headerDocx('HEADER<!--bad--->_TEXT'), imageOcr);
  assert.equal(invalidHeader.ok, false); assert.equal(invalidHeader.error_code, 'DOCX_STRUCTURE_UNSAFE'); checks += 2;
  const omittedInvalidHeader = run(headerDocx('HEADER<!--bad--->_TEXT'), imageOcr, true);
  assert.equal(omittedInvalidHeader.ok, false); assert.equal(omittedInvalidHeader.error_code, 'DOCX_STRUCTURE_UNSAFE'); checks += 2;
}
console.log(`DOCX XML LEXICAL WORKER PASS ${checks} checks; ${launches} actual permission-bound Node ${process.version} children`);
