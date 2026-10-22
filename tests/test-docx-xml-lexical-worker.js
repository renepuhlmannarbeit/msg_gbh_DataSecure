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
const { CheckpointStream } = require('../plugins/data-secure/server/standalone/conversion-checkpoints');
if (process.version !== 'v22.23.2') throw Error('Use packaged Node 22.23.2 explicitly');
const server = path.resolve(__dirname, '../plugins/data-secure/server');
let checks = 0, launches = 0, protocolNegatives = 0;
const contentOptions = imageOcr => ({ schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: false, imageOcr });
function docx(value, declaration = '') {
  return zipStore([...opcControlEntries('docx'), ['word/document.xml', declaration +
    `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:body></w:document>`]]);
}
function headerDocx(value, mainValue = 'MAIN') {
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zipStore([...opcControlEntries('docx', { additionalOverrides: [{ part: 'word/header1.xml',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml' }] }),
  ['word/document.xml', `<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body><w:p><w:r><w:t>${mainValue}</w:t></w:r></w:p>` +
    '<w:sectPr><w:headerReference w:type="default" r:id="header"/></w:sectPr></w:body></w:document>'],
  ['word/header1.xml', `<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="${W}"><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:hdr>`],
  ['word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `<Relationship Id="header" Type="${R}/header" Target="header1.xml"/></Relationships>`]]);
}
function response(bytes, imageOcr) {
  assert.ok(Buffer.isBuffer(bytes));
  if (imageOcr !== undefined) {
    const stream = new CheckpointStream('docx', contentOptions(imageOcr));
    stream.push(bytes);
    return stream.response();
  }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  assert.equal(value.schema, 'datasecure-conversion-response/1'); assert.equal(typeof value.ok, 'boolean');
  assert.deepEqual(Object.keys(value).sort(), (value.ok ? ['schema', 'ok', 'result'] : ['schema', 'ok', 'error_code']).sort());
  return value;
}
function run(bytes, imageOcr, omitDocxHeaderFooter = false) {
  const policy = imageOcr === undefined ? 'markdown-output-content-v1'
    : 'content-options-v1:' + Buffer.from(JSON.stringify(contentOptions(imageOcr))).toString('base64url');
  const result = spawnSync(process.execPath, ['--no-warnings', '--permission', `--allow-fs-read=${server}`,
    '--allow-worker', '--allow-addons', '--disable-proto=throw', '--max-old-space-size=512',
    `--require=${path.join(server, 'network-deny.cjs')}`, path.join(server, 'standalone/conversion-worker-child.js'),
    'docx', String(bytes.length), policy, ...(omitDocxHeaderFooter ? ['omit-docx-header-footer'] : [])], {
    input: bytes, timeout: 10000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, shell: false,
    env: { SystemRoot: process.env.SystemRoot || '', WINDIR: process.env.WINDIR || '', PATH: '', DISABLE_SYSTEM_FONTS_LOAD: '1' }
  });
  launches++;
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  const decoded = response(result.stdout, imageOcr);
  assert.equal(result.status, decoded.ok ? 0 : 2);
  return decoded;
}
function expectMainFailure(result, imageOcr) {
  assert.equal(result.ok, false);
  assert.equal(result.error_code, imageOcr === undefined ? 'DOCX_STRUCTURE_UNSAFE' : 'OOXML_XML_CHARACTER_INVALID');
  checks += 2;
}
function expectHeaderFailureOrOmission(result, imageOcr, omitted) {
  if (imageOcr === undefined) { expectMainFailure(result, imageOcr); return; }
  assert.equal(result.ok, true); assert.equal(result.result.markdown, 'MAIN');
  assert.equal(result.result.coverage.status, 'incomplete');
  assert.ok(result.result.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
  if (omitted) assert.ok(result.result.coverage.reason_codes.includes('DOCX_HEADER_FOOTER_EXCLUDED_BY_POLICY'));
  assert.doesNotMatch(result.result.markdown, /HEADER|_TEXT|bad/u); checks += 5 + Number(omitted);
}
for (const imageOcr of [undefined, false, true]) {
  const positive = run(docx('A<!----><?probe </w:t>?><![CDATA[&lt;]]>B',
    '<?xml version="1.0" encoding="UTF-8"?>'), imageOcr);
  assert.equal(positive.ok, true); assert.equal(positive.result.markdown, 'A&amp;lt;B'); checks += 2;
  const plain = run(docx('AB'), imageOcr);
  assert.equal(plain.ok, true); assert.equal(plain.result.coverage.status, 'complete'); checks += 2;
  for (const token of ['<!--bad--->', '<!--bad--inside-->', '<??>', '<?xml version="1.0"?>']) {
    const result = run(docx(`A${token}B`), imageOcr);
    expectMainFailure(result, imageOcr);
  }
  const skipped = run(reviewDocx('<w:p><w:r><w:instrText>A<!--bad--->B</w:instrText><w:t>VISIBLE</w:t></w:r></w:p>'), imageOcr);
  expectMainFailure(skipped, imageOcr);
  const header = run(headerDocx('HEADER<!----><?probe </w:t>?>TEXT'), imageOcr);
  assert.equal(header.ok, true); assert.match(header.result.markdown, /HEADERTEXT/u); checks += 2;
  const invalidHeader = run(headerDocx('HEADER<!--bad--->_TEXT'), imageOcr);
  expectHeaderFailureOrOmission(invalidHeader, imageOcr, false);
  const omittedInvalidHeader = run(headerDocx('HEADER<!--bad--->_TEXT'), imageOcr, true);
  expectHeaderFailureOrOmission(omittedInvalidHeader, imageOcr, true);
  // A valid secondary story never authorizes recovery of a damaged main part.
  expectMainFailure(run(headerDocx('VALID_HEADER', 'A<!--bad--->B'), imageOcr), imageOcr);
}
// The full /2 transport must be validated, not a selected last stdout line.
const options = contentOptions(true), result = { schema: 'datasecure-markdown-extraction/2', processing_mode: 'markdown-only',
  anonymized: false, source_type: 'docx', markdown: 'CONTROL Ä ß', content_options: options,
  coverage: { status: 'complete', reason_codes: [] } };
const frame = { schema: 'datasecure-conversion-unit/1', sequence: 1, index: 0, result };
const terminal = { schema: 'datasecure-conversion-response/2', ok: true, result };
const line = value => Buffer.from(JSON.stringify(value) + '\n');
assert.deepEqual(response(Buffer.concat([line(frame), Buffer.from(JSON.stringify(terminal))]), true), terminal);
for (const bytes of [
  line(frame), Buffer.concat([line(terminal), line(terminal)]),
  Buffer.concat([line(terminal), line(frame)]), Buffer.from(JSON.stringify(terminal) + 'garbage'),
  line({ ...terminal, schema: 'datasecure-conversion-response/1' }),
  line({ ...terminal, result: { ...result, source_type: 'xlsx' } }),
  line({ ...terminal, result: { ...result, content_options: contentOptions(false) } }),
  line({ ...frame, sequence: 2 }), line({ ...terminal, unexpected: true }), Buffer.from([0xff])
]) { assert.throws(() => response(bytes, true)); protocolNegatives++; }
console.log(`DOCX XML LEXICAL WORKER PASS ${checks} checks; ${protocolNegatives} protocol negatives; ${launches} actual permission-bound Node ${process.version} children`);
