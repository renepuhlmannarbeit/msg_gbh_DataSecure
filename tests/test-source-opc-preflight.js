'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries, TYPES } = require('./lib/opc');
const { inspectSourceFormatFromFd } = require('../plugins/data-secure/server/gateway/source-format-inspector');

const { test, done, assert } = createSuite('OPC source integrity preflight');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-opc-preflight-'));

function docx(controlOverrides = {}, extras = [], fixtureOptions = {}) {
  const generatedControls = opcControlEntries('docx', fixtureOptions);
  const controls = Object.fromEntries(generatedControls);
  const generatedParts = generatedControls.filter(([name]) => !['[Content_Types].xml', '_rels/.rels'].includes(name));
  return zipStore([
    ['[Content_Types].xml', controlOverrides.contentTypes ?? controls['[Content_Types].xml']],
    ['_rels/.rels', controlOverrides.relationships ?? controls['_rels/.rels']],
    ['word/document.xml', '<w:document xmlns:w="urn:test"><w:body/></w:document>'],
    ...generatedParts,
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

test('standard package metadata relationships remain valid DOCX candidates', () => {
  const result = inspect('standard-package-metadata.docx', docx({}, [], { standardPackageMetadata: true }));
  assert.strictEqual(result.verdict, 'candidate');
  assert.strictEqual(result.code, 'SOURCE_FORMAT_CANDIDATE');
});

test('an internal Microsoft 365 classification-label part is metadata, not active content', () => {
  const controls = Object.fromEntries(opcControlEntries('docx'));
  const relationships = controls['_rels/.rels'].replace(
    '</Relationships>',
    '<Relationship Id="rIdLabel" Type="http://schemas.microsoft.com/office/2020/02/relationships/classificationlabels" Target="docMetadata/LabelInfo.xml"/></Relationships>'
  );
  const contentTypes = controls['[Content_Types].xml'].replace(
    '</Types>',
    '<Override PartName="/docMetadata/LabelInfo.xml" ContentType="application/vnd.ms-office.classificationlabels+xml"/></Types>'
  );
  const result = inspect('classification-label.docx', docx(
    { relationships, contentTypes },
    [['docMetadata/LabelInfo.xml', '<LabelInfo xmlns="http://schemas.microsoft.com/office/2020/mipLabelMetadata"/>']]
  ));
  assert.strictEqual(result.verdict, 'candidate');
  assert.strictEqual(result.code, 'SOURCE_FORMAT_CANDIDATE');
});

test('the internal Microsoft styles-with-effects projection is metadata, not active content', () => {
  const controls = Object.fromEntries(opcControlEntries('docx'));
  const relationships = controls['_rels/.rels'].replace(
    '</Relationships>',
    '<Relationship Id="rIdEffects" Type="http://schemas.microsoft.com/office/2007/relationships/stylesWithEffects" Target="word/stylesWithEffects.xml"/></Relationships>'
  );
  const result = inspect('styles-with-effects.docx', docx(
    { relationships },
    [['word/stylesWithEffects.xml', '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>']]
  ));
  assert.strictEqual(result.verdict, 'candidate');
  assert.strictEqual(result.code, 'SOURCE_FORMAT_CANDIDATE');
});

test('unknown, external or misspelled Microsoft metadata relationships remain blocked', () => {
  const controls = Object.fromEntries(opcControlEntries('docx'));
  for (const [suffix, type, mode] of [
    ['unknown', 'http://schemas.microsoft.com/office/2020/02/relationships/unknown', ''],
    ['misspelled', 'http://schemas.microsoft.com/office/2020/02/relationships/classificationlabel', ''],
    ['styles-lookalike', 'http://schemas.microsoft.com/office/2007/relationships/stylesWithEffect', ''],
    ['external', 'http://schemas.microsoft.com/office/2020/02/relationships/classificationlabels', ' TargetMode="External"']
  ]) {
    const relationships = controls['_rels/.rels'].replace(
      '</Relationships>',
      `<Relationship Id="rIdLabel" Type="${type}" Target="docMetadata/LabelInfo.xml"${mode}/></Relationships>`
    );
    const result = inspect(`classification-label-${suffix}.docx`, docx(
      { relationships },
      [['docMetadata/LabelInfo.xml', '<LabelInfo/>']]
    ));
    assert.strictEqual(result.verdict, 'rejected');
    assert.strictEqual(result.code, 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
  }
});

test('a package digital-signature origin relationship remains a valid DOCX candidate', () => {
  const controls = Object.fromEntries(opcControlEntries('docx'));
  const relationships = controls['_rels/.rels'].replace(
    '</Relationships>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/digital-signature/origin" Target="_xmlsignatures/origin.sigs"/></Relationships>'
  );
  const result = inspect('digital-signature-origin.docx', docx(
    { relationships },
    [['_xmlsignatures/origin.sigs', '<SignatureOrigin/>']]
  ));
  assert.strictEqual(result.verdict, 'candidate');
  assert.strictEqual(result.code, 'SOURCE_FORMAT_CANDIDATE');
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

test('foreign relationship namespaces are rejected even when their final name looks supported', () => {
  const relationships = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="https://evil.invalid/header" Target="header1.xml"/></Relationships>';
  const result = inspect('foreign-namespace.docx', docx({}, [
    ['word/_rels/document.xml.rels', relationships],
    ['word/header1.xml', '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>']
  ]));
  assert.strictEqual(result.verdict, 'rejected');
  assert.strictEqual(result.code, 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
});

test('each blocked internal relationship type remains fail-closed', () => {
  const blockedTypes = [
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/vbaProject',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customUI',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/activeX',
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink',
    'http://purl.oclc.org/ooxml/officeDocument/relationships/package',
    'http://schemas.microsoft.com/office/2006/relationships/vbaProject',
    'http://schemas.microsoft.com/office/2006/relationships/activeXControl',
    'http://schemas.microsoft.com/office/2006/relationships/activeXControlBinary',
    'http://schemas.microsoft.com/office/2006/relationships/ui/extensibility',
    'http://schemas.microsoft.com/office/2007/relationships/ui/extensibility'
  ];
  for (const [index, type] of blockedTypes.entries()) {
    const relationships = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="${type}" Target="parts/blocked-${index}.xml"/></Relationships>`;
    const result = inspect(`blocked-relationship-${index}.docx`, docx({}, [
      ['word/_rels/document.xml.rels', relationships],
      [`word/parts/blocked-${index}.xml`, '<blocked/>']
    ]));
    assert.strictEqual(result.verdict, 'rejected', type);
    assert.strictEqual(result.code, 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED', type);
  }
});

test('internal hyperlinks resolve locally while external hyperlinks remain blocked', () => {
  const internal = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="links/reference.xml"/></Relationships>';
  const internalResult = inspect('internal-hyperlink.docx', docx({}, [
    ['word/_rels/document.xml.rels', internal],
    ['word/links/reference.xml', '<reference/>']
  ]));
  assert.strictEqual(internalResult.verdict, 'candidate');
  assert.strictEqual(internalResult.code, 'SOURCE_FORMAT_CANDIDATE');

  const external = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test" TargetMode="External"/></Relationships>';
  const externalResult = inspect('external-hyperlink.docx', docx({}, [
    ['word/_rels/document.xml.rels', external]
  ]));
  assert.strictEqual(externalResult.verdict, 'rejected');
  assert.strictEqual(externalResult.code, 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
});

test('internal relationships must resolve to a contained package part without encoded traversal', () => {
  const rel = (target) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="${target}"/></Relationships>`;
  const valid = inspect('internal-valid.docx', docx({}, [
    ['word/_rels/document.xml.rels', rel('styles.xml')],
    ['word/styles.xml', '<w:styles xmlns:w="urn:test"/>']
  ]));
  assert.strictEqual(valid.verdict, 'candidate');
  const validParent = inspect('internal-parent-valid.docx', docx({}, [
    ['word/_rels/document.xml.rels', rel('../customXml/item1.xml')],
    ['customXml/item1.xml', '<customXml/>']
  ]));
  assert.strictEqual(validParent.verdict, 'candidate');
  assert.strictEqual(validParent.code, 'SOURCE_FORMAT_CANDIDATE');
  for (const target of ['../custom.xml', '%2e%2e/custom.xml', 'missing.xml']) {
    const result = inspect(`internal-${encodeURIComponent(target)}.docx`, docx({}, [
      ['word/_rels/document.xml.rels', rel(target)]
    ]));
    assert.strictEqual(result.verdict, 'rejected');
    assert.strictEqual(result.code, 'SOURCE_CONTAINER_CORRUPT');
  }
  const escapedRoot = inspect('internal-root-escape.docx', docx({}, [
    ['word/_rels/document.xml.rels', rel('../../outside.xml')],
    ['outside.xml', '<outside/>']
  ]));
  assert.strictEqual(escapedRoot.verdict, 'rejected');
  assert.strictEqual(escapedRoot.code, 'SOURCE_CONTAINER_CORRUPT');
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

test('standard package metadata cannot unlock XLSX or PPTX', () => {
  for (const kind of ['xlsx', 'pptx']) {
    const type = TYPES[kind];
    const bytes = zipStore([
      ...opcControlEntries(kind, { standardPackageMetadata: true }),
      [type.part, '<root/>']
    ]);
    const result = inspect(`locked-with-metadata.${kind}`, bytes);
    assert.strictEqual(result.verdict, 'not_released');
    assert.strictEqual(result.code, 'SOURCE_FORMAT_NOT_RELEASED');
    assert.strictEqual(result.structure.crc_verified, true);
  }
});

done(() => fs.rmSync(root, { recursive: true, force: true }));
