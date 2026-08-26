'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { inspectSourceFormatFromFd } = require('../plugins/data-secure/server/gateway/source-format-inspector');

const { test, done, assert } = createSuite('OPC source integrity preflight');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-opc-preflight-'));

function docx(controlOverrides = {}, extras = []) {
  const controls = Object.fromEntries(opcControlEntries('docx'));
  return zipStore([
    ['[Content_Types].xml', controlOverrides.contentTypes ?? controls['[Content_Types].xml']],
    ['_rels/.rels', controlOverrides.relationships ?? controls['_rels/.rels']],
    ['word/document.xml', '<w:document xmlns:w="urn:test"><w:body/></w:document>'],
    ...extras
  ]);
}

function inspect(name, bytes, options = {}) {
  const target = path.join(root, name);
  fs.writeFileSync(target, bytes);
  const stat = fs.lstatSync(target);
  const fd = fs.openSync(target, fs.constants.O_RDONLY);
  try { return inspectSourceFormatFromFd(fd, stat, path.extname(name), options); }
  finally { fs.closeSync(fd); }
}

function payloadOffset(archive, wanted) {
  let offset = 0;
  while (archive.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const size = archive.readUInt32LE(offset + 18);
    const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const data = offset + 30 + nameLength + extraLength;
    if (name === wanted) return data;
    offset = data + size;
  }
  throw new Error('entry missing');
}

test('a real minimal DOCX OPC package passes every control and CRC gate', () => {
  const result = inspect('valid.docx', docx());
  assert.strictEqual(result.verdict, 'candidate');
  assert.deepStrictEqual(result.structure, {
    ooxml_type: 'docx', controls_verified: true, relationships_verified: true, crc_verified: true
  });
});

test('CRC damage in a non-control payload is rejected before snapshot', () => {
  const archive = Buffer.from(docx());
  archive[payloadOffset(archive, 'word/document.xml')] ^= 0x01;
  const result = inspect('crc-damaged.docx', archive);
  assert.strictEqual(result.verdict, 'rejected');
  assert.strictEqual(result.code, 'SOURCE_CONTAINER_CORRUPT');
});

test('bounded preflight rejects an otherwise valid OPC package above its configured entry budget', () => {
  const result = inspect('bounded.docx', docx(), { maxEntryUncompressed: 8 });
  assert.strictEqual(result.verdict, 'rejected');
  assert.strictEqual(result.code, 'SOURCE_CONTAINER_LIMIT');
});

test('missing, malformed and semantically wrong OPC controls fail closed', () => {
  const controls = Object.fromEntries(opcControlEntries('docx'));
  const cases = [
    docx({ contentTypes: '<Types>' }),
    docx({ contentTypes: `${controls['[Content_Types].xml']}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>` }),
    docx({ contentTypes: controls['[Content_Types].xml'].replace('word/document.xml', 'xl/workbook.xml') }),
    docx({ relationships: '<Relationships>' }),
    docx({ relationships: controls['_rels/.rels'].replace('word/document.xml', '../word/document.xml') }),
    docx({ relationships: controls['_rels/.rels'].replace('Target="word/document.xml"', 'Target="https://example.test/x" TargetMode="External"') })
  ];
  for (const bytes of cases) assert.strictEqual(inspect(`bad-${Math.random()}.docx`, bytes).verdict, 'rejected');
});

test('external or active relationships anywhere in the package are rejected', () => {
  const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test" TargetMode="External"/></Relationships>';
  const result = inspect('external.docx', docx({}, [['word/_rels/document.xml.rels', rels]]));
  assert.strictEqual(result.code, 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
});

test('internal relationships must resolve to a contained package part without encoded traversal', () => {
  const rel = (target) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="${target}"/></Relationships>`;
  const valid = inspect('internal-valid.docx', docx({}, [
    ['word/_rels/document.xml.rels', rel('styles.xml')],
    ['word/styles.xml', '<w:styles xmlns:w="urn:test"/>']
  ]));
  assert.strictEqual(valid.verdict, 'candidate');
  for (const target of ['../custom.xml', '%2e%2e/custom.xml', 'missing.xml']) {
    const result = inspect(`internal-${encodeURIComponent(target)}.docx`, docx({}, [
      ['word/_rels/document.xml.rels', rel(target)]
    ]));
    assert.strictEqual(result.verdict, 'rejected');
    assert.strictEqual(result.code, 'SOURCE_CONTAINER_CORRUPT');
  }
  const duplicateIds = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme.xml"/></Relationships>`;
  const duplicateResult = inspect('internal-duplicate-id.docx', docx({}, [
    ['word/_rels/document.xml.rels', duplicateIds],
    ['word/styles.xml', '<w:styles xmlns:w="urn:test"/>'],
    ['word/theme.xml', '<a:theme xmlns:a="urn:test"/>']
  ]));
  assert.strictEqual(duplicateResult.verdict, 'rejected');
  assert.strictEqual(duplicateResult.code, 'SOURCE_CONTAINER_CORRUPT');
});

test('valid XLSX structure remains structurally checked but product-locked', () => {
  const bytes = zipStore([...opcControlEntries('xlsx'), ['xl/workbook.xml', '<workbook/>']]);
  const result = inspect('locked.xlsx', bytes);
  assert.strictEqual(result.verdict, 'not_released');
  assert.strictEqual(result.code, 'SOURCE_FORMAT_NOT_RELEASED');
  assert.strictEqual(result.structure.crc_verified, true);
});

done(() => fs.rmSync(root, { recursive: true, force: true }));
