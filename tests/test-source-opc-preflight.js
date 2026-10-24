'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries, TYPES } = require('./lib/opc');
const { inspectSourceFormatFromFd } = require('../plugins/data-secure/server/gateway/source-format-inspector');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');

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

function modernCommentsPresentation() {
  const officeNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const packageNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const comments = ['modernComment_a1b2_c3d4.xml', 'modernComment_AABB_0011.xml'];
  const slide = (text) => '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>' +
    `<a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  return [
    ...opcControlEntries('pptx', { additionalOverrides: comments.map(name => ({
      part: `ppt/comments/${name}`, contentType: 'application/vnd.ms-powerpoint.comments+xml'
    })) }),
    ['ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
      `xmlns:r="${officeNamespace}"><p:sldIdLst><p:sldId id="256" r:id="s1"/>` +
      '<p:sldId id="257" r:id="s2"/></p:sldIdLst></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${packageNamespace}">` +
      `<Relationship Id="s1" Type="${officeNamespace}/slide" Target="slides/slide1.xml"/>` +
      `<Relationship Id="s2" Type="${officeNamespace}/slide" Target="slides/slide2.xml"/></Relationships>`],
    ...comments.flatMap((name, index) => [
      [`ppt/slides/slide${index + 1}.xml`, slide(`Folientext ${index + 1}`)],
      [`ppt/slides/_rels/slide${index + 1}.xml.rels`, `<Relationships xmlns="${packageNamespace}">` +
        '<Relationship Id="c1" Type="http://schemas.microsoft.com/office/2018/10/relationships/comments" ' +
        `Target="../comments/${name}"${index ? ' TargetMode="Internal"' : ''}/></Relationships>`],
      [`ppt/comments/${name}`, '<p188:cmLst xmlns:p188="http://schemas.microsoft.com/office/powerpoint/2018/8/main" ' +
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p188:cm><p188:txBody>' +
        '<a:p><a:r><a:t>Kommentartext ausgeschlossen</a:t></a:r></a:p></p188:txBody></p188:cm></p188:cmLst>']
    ])
  ];
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

test('OPC control comments use XML grammar: empty is valid, trailing or embedded double hyphens are not', () => {
  const controls = Object.fromEntries(opcControlEntries('docx'));
  for (const [key, part] of [['contentTypes', '[Content_Types].xml'], ['relationships', '_rels/.rels']]) {
    for (const [index, comment] of ['<!---->', '<!-- ordinary -->', '<!--bad--->', '<!--bad--inside-->'].entries()) {
      const xml = controls[part].replace(/(<(?:Types|Relationships)\b[^>]*>)/u, `$1${comment}`);
      const result = inspect(`comment-${key}-${index}.docx`, docx({ [key]: xml }));
      assert.equal(result.verdict === 'candidate', index < 2, `${key}: ${comment}`);
    }
  }
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

test('Standalone Markdown-first privacy admits passive presentation objects but keeps plugin strict', () => {
  const controls = opcControlEntries('pptx');
  const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="o1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="../embeddings/oleObject1.bin"/>' +
    '<Relationship Id="h1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.test" TargetMode="External"/>' +
    '</Relationships>';
  const parts = [
    ...controls,
    ['ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>'],
    ['ppt/slides/slide1.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>'],
    ['ppt/slides/_rels/slide1.xml.rels', rels],
    ['ppt/embeddings/oleObject1.bin', Buffer.from([1, 2, 3])]
  ];
  const conversion = { processingMode: 'markdown-only', productChannel: 'standalone' };
  assert.strictEqual(inspect('passive.pptx', zipStore(parts), conversion).verdict, 'candidate');
  assert.strictEqual(inspect('private.pptx', zipStore(parts),
    { processingMode: 'markdown-and-anonymize', productChannel: 'standalone' }).verdict,
  'candidate');
  assert.strictEqual(inspect('cowork.pptx', zipStore(parts),
    { processingMode: 'markdown-only', productChannel: 'plugin' }).code,
  'SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
  assert.strictEqual(inspect('macro.pptx', zipStore([
    ...parts, ['ppt/vbaProject.bin', Buffer.from([1])]
  ]), conversion).code, 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
  assert.strictEqual(inspect('external-template.pptx', zipStore(parts.map(([name, value]) =>
    name === 'ppt/slides/_rels/slide1.xml.rels' ? [name, rels.replace('relationships/hyperlink', 'relationships/attachedTemplate')] : [name, value])),
  conversion).code, 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
});

test('Standalone admits two internal modern slide comments as ignored metadata with incomplete coverage', () => {
  const bytes = zipStore(modernCommentsPresentation());
  for (const processingMode of ['markdown-only', 'markdown-and-anonymize']) {
    const result = inspect(`modern-comments-${processingMode}.pptx`, bytes,
      { productChannel: 'standalone', processingMode });
    assert.strictEqual(result.verdict, 'candidate');
    assert.strictEqual(result.structure.crc_verified, true);
  }
  const extraction = extractMarkdownBuffer(bytes, '.pptx');
  assert.match(extraction.markdown, /Folientext 1/u);
  assert.match(extraction.markdown, /Folientext 2/u);
  assert.doesNotMatch(extraction.markdown, /Kommentartext ausgeschlossen/u);
  assert.strictEqual(extraction.coverage.status, 'incomplete');
  assert.deepStrictEqual(extraction.coverage.reason_codes, ['SOURCE_COVERAGE_UNVERIFIED']);
  for (const options of [{},
    { productChannel: 'plugin', processingMode: 'markdown-only' },
    { productChannel: 'plugin', processingMode: 'markdown-and-anonymize' }
  ]) {
    assert.strictEqual(inspect('modern-comments-strict.pptx', bytes, options).code,
      'SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
  }
});

test('modern comments keep exact relationship, owner, target and content-type constraints', () => {
  const parts = modernCommentsPresentation();
  const slideRels = 'ppt/slides/_rels/slide1.xml.rels';
  const commentPart = 'ppt/comments/modernComment_a1b2_c3d4.xml';
  const commentType = 'application/vnd.ms-powerpoint.comments+xml';
  const standalone = { productChannel: 'standalone', processingMode: 'markdown-and-anonymize' };
  const change = (part, transform) => parts.map(([name, value]) =>
    [name, name === part ? transform(value) : value]);
  const moveRelationship = (ownerRels, targetPrefix) => {
    const commentRels = parts.find(([name]) => name === slideRels)[1];
    const relationship = commentRels.match(/<Relationship\b[^>]+\/>/u)[0]
      .replace('Target="../comments/', `Target="${targetPrefix}`);
    return parts.filter(([name]) => name !== slideRels).map(([name, value]) =>
      [name, name === ownerRels ? value.replace('</Relationships>', `${relationship}</Relationships>`) : value]);
  };
  const cases = [
    ['external', change(slideRels, xml => xml.replace('Target="../comments/',
      'TargetMode="External" Target="https://example.invalid/')), 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED'],
    ['external-local-target', change(slideRels, xml => xml.replace('Target="',
      'TargetMode="External" Target="')), 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED'],
    ['unknown-target-mode', change(slideRels, xml => xml.replace('Target="',
      'TargetMode="Other" Target="')), 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED'],
    ['presentation-owner', moveRelationship('ppt/_rels/presentation.xml.rels', 'comments/'),
      'SOURCE_ACTIVE_CONTENT_UNSUPPORTED'],
    ['root-owner', moveRelationship('_rels/.rels', 'ppt/comments/'), 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED'],
    ['missing-owner', parts.filter(([name]) => name !== 'ppt/slides/slide1.xml').map(([name, value]) =>
      [name, name === 'ppt/_rels/presentation.xml.rels'
        ? value.replace(/<Relationship Id="s1"[^>]+\/>/u, '') : value]), 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED'],
    ['wrong-target-name', [
      ...change(slideRels, xml => xml.replace('modernComment_a1b2_c3d4.xml', 'comment1.xml')),
      ['ppt/comments/comment1.xml', '<cmLst/>']
    ], 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED'],
    ['nonhex-target-name', [
      ...change(slideRels, xml => xml.replace('modernComment_a1b2_c3d4.xml', 'modernComment_gg_11.xml')),
      ['ppt/comments/modernComment_gg_11.xml', '<cmLst/>']
    ], 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED'],
    ['missing-target', parts.filter(([name]) => name !== commentPart), 'SOURCE_CONTAINER_CORRUPT'],
    ['wrong-content-type', change('[Content_Types].xml', xml => xml.replace(commentType, 'application/xml')),
      'SOURCE_ACTIVE_CONTENT_UNSUPPORTED'],
    ['missing-content-type', change('[Content_Types].xml', xml => xml.replace(
      `<Override PartName="/${commentPart}" ContentType="${commentType}"/>`, '')),
      'SOURCE_ACTIVE_CONTENT_UNSUPPORTED'],
    ['lookalike-uri', change(slideRels, xml => xml.replace('/relationships/comments', '/relationships/comment')),
      'SOURCE_ACTIVE_CONTENT_UNSUPPORTED'],
    ['foreign-uri', change(slideRels, xml => xml.replace('http://schemas.microsoft.com/office/2018/10/',
      'https://example.invalid/office/2018/10/')), 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED'],
    ['macro', [...parts, ['ppt/vbaProject.bin', Buffer.from([1])]], 'SOURCE_ACTIVE_CONTENT_UNSUPPORTED']
  ];
  for (const [name, entries, code] of cases) {
    const result = inspect(`modern-comments-${name}.pptx`, zipStore(entries), standalone);
    assert.strictEqual(result.verdict, 'rejected', name);
    assert.strictEqual(result.code, code, name);
  }
});

test('modern comment admission preserves payload CRC and bounded ZIP/control gates', () => {
  const parts = modernCommentsPresentation();
  const bytes = zipStore(parts);
  const standalone = { productChannel: 'standalone', processingMode: 'markdown-only' };
  const damaged = Buffer.from(bytes);
  damaged[payloadOffset(damaged, 'ppt/comments/modernComment_a1b2_c3d4.xml')] ^= 0x01;
  assert.strictEqual(inspect('modern-comments-crc.pptx', damaged, standalone).code, 'SOURCE_CONTAINER_CORRUPT');
  const total = parts.reduce((size, [, value]) => size + Buffer.byteLength(value), 0);
  for (const options of [
    { maxEntries: parts.length - 1 }, { maxUncompressed: total - 1 },
    { maxControlPartBytes: 8 }, { maxControlBytes: 8 }
  ]) {
    assert.strictEqual(inspect('modern-comments-limited.pptx', bytes, { ...standalone, ...options }).code,
      'SOURCE_CONTAINER_LIMIT');
  }
  const oversizedComment = zipStore(parts.map(([name, value]) =>
    [name, name === 'ppt/comments/modernComment_a1b2_c3d4.xml'
      ? value.replace('Kommentartext ausgeschlossen', 'x'.repeat(4096)) : value]));
  assert.strictEqual(inspect('modern-comments-entry-limit.pptx', oversizedComment,
    { ...standalone, maxEntryUncompressed: 2048 }).code, 'SOURCE_CONTAINER_LIMIT');
});

test('Standalone reads a linked embedded workbook while keeping passive PowerPoint metadata incomplete', () => {
  const relationshipNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const packageNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const workbook = zipStore([
    ...opcControlEntries('xlsx'),
    ['xl/workbook.xml', `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${relationshipNamespace}"><sheets><sheet name="Kontakte" sheetId="1" r:id="s1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${packageNamespace}"><Relationship Id="s1" Type="${relationshipNamespace}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Kontakt: Erika Beispiel</t></is></c></row></sheetData></worksheet>']
  ]);
  const presentationRels = `<Relationships xmlns="${packageNamespace}">` +
    `<Relationship Id="s1" Type="${relationshipNamespace}/slide" Target="slides/slide1.xml"/>` +
    '<Relationship Id="a1" Type="http://schemas.microsoft.com/office/2018/10/relationships/authors" Target="authors.xml"/>' +
    '<Relationship Id="r1" Type="http://schemas.microsoft.com/office/2015/10/relationships/revisionInfo" Target="revisionInfo.xml"/>' +
    '<Relationship Id="c1" Type="http://schemas.microsoft.com/office/2016/11/relationships/changesInfo" Target="changesInfos/changesInfo1.xml"/>' +
    '</Relationships>';
  const slideRels = `<Relationships xmlns="${packageNamespace}">` +
    `<Relationship Id="p1" Type="${relationshipNamespace}/package" Target="../embeddings/data.xlsx"/>` +
    `<Relationship Id="o1" Type="${relationshipNamespace}/oleObject" Target="../embeddings/oleObject1.bin"/>` +
    '</Relationships>';
  const parts = [
    ...opcControlEntries('pptx'),
    ['ppt/presentation.xml', `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="${relationshipNamespace}"><p:sldIdLst><p:sldId id="256" r:id="s1"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', presentationRels],
    ['ppt/slides/slide1.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Folientext</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'],
    ['ppt/slides/_rels/slide1.xml.rels', slideRels],
    ['ppt/embeddings/data.xlsx', workbook],
    ['ppt/embeddings/oleObject1.bin', Buffer.from([1, 2, 3])],
    ['ppt/authors.xml', '<authorLst/>'],
    ['ppt/revisionInfo.xml', '<revInfo/>'],
    ['ppt/changesInfos/changesInfo1.xml', '<chgInfo/>']
  ];
  const bytes = zipStore(parts);
  const standalone = { productChannel: 'standalone', processingMode: 'markdown-and-anonymize' };
  assert.strictEqual(inspect('linked-workbook.pptx', bytes, standalone).verdict, 'candidate');
  assert.strictEqual(inspect('linked-workbook-plugin.pptx', bytes,
    { productChannel: 'plugin', processingMode: 'markdown-and-anonymize' }).code,
  'SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
  const extraction = extractMarkdownBuffer(bytes, '.pptx');
  assert.match(extraction.markdown, /Erika Beispiel/u);
  assert.deepStrictEqual(extraction.coverage.reason_codes,
    ['SOURCE_COVERAGE_UNVERIFIED']);
  const mislabelledWorkbook = zipStore(parts.map(([name, value]) => name === 'ppt/embeddings/data.xlsx'
    ? [name, docx()] : [name, value]));
  const mislabelledExtraction = extractMarkdownBuffer(mislabelledWorkbook, '.pptx');
  assert.doesNotMatch(mislabelledExtraction.markdown, /Erika Beispiel/u);
  assert.deepStrictEqual(mislabelledExtraction.coverage.reason_codes,
    ['SOURCE_COVERAGE_UNVERIFIED']);
  const changedTarget = zipStore(parts.map(([name, value]) => name === 'ppt/slides/_rels/slide1.xml.rels'
    ? [name, slideRels.replace('embeddings/data.xlsx', 'embeddings/oleObject1.bin')] : [name, value]));
  assert.strictEqual(inspect('wrong-package-target.pptx', changedTarget, standalone).code,
    'SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
  const externalPackage = zipStore(parts.map(([name, value]) => name === 'ppt/slides/_rels/slide1.xml.rels'
    ? [name, slideRels.replace('Target="../embeddings/data.xlsx"',
      'Target="https://example.invalid/data.xlsx" TargetMode="External"')] : [name, value]));
  assert.strictEqual(inspect('external-package.pptx', externalPackage, standalone).code,
    'SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
  const active = zipStore([...parts, ['ppt/vbaProject.bin', Buffer.from([1])]]);
  assert.strictEqual(inspect('macro-with-workbook.pptx', active, standalone).code,
    'SOURCE_ACTIVE_CONTENT_UNSUPPORTED');
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
  const cowork = inspect('locked.xlsx', bytes,
    { processingMode: 'markdown-and-anonymize', productChannel: 'plugin' });
  assert.strictEqual(cowork.verdict, 'candidate');
  assert.strictEqual(cowork.code, 'SOURCE_FORMAT_CANDIDATE');
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

const partialStandalone = Object.freeze({ processingMode: 'markdown-only', productChannel: 'standalone', partialExtraction: true });

test('explicit Standalone partial intake preserves independent bytes after leaf CRC damage without claiming full CRC', () => {
  const archive = Buffer.from(docx({}, [['word/media/image1.png', Buffer.from('SYNTHETIC_IMAGE')]]));
  archive[payloadOffset(archive, 'word/media/image1.png')] ^= 1;
  const before = Buffer.from(archive);
  const result = inspect('partial-leaf.docx', archive, partialStandalone);
  assert.strictEqual(result.verdict, 'candidate');
  assert.strictEqual(result.structure.controls_verified, true);
  assert.strictEqual(result.structure.crc_verified, false);
  assert.deepStrictEqual(result.structure.partial_findings, [{ reason: 'DOCUMENT_PARTS_DAMAGED', count: 1 }]);
  assert.deepStrictEqual(archive, before);
  for (const options of [{}, { ...partialStandalone, partialExtraction: false },
    { ...partialStandalone, productChannel: 'plugin', processingMode: 'markdown-and-anonymize' }]) {
    assert.strictEqual(inspect('strict-leaf.docx', archive, options).code, 'SOURCE_CONTAINER_CORRUPT');
  }
});

test('partial extraction never softens damaged controls, aggregate limits, source reads or archive boundaries', () => {
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml']) {
    const archive = Buffer.from(docx({}, [['word/_rels/document.xml.rels',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>']]));
    archive[payloadOffset(archive, part)] ^= 1;
    assert.strictEqual(inspect(`partial-control-${part.replace(/\W/gu, '_')}.docx`, archive, partialStandalone).code,
      'SOURCE_CONTAINER_CORRUPT');
  }
  const archive = docx({}, [['word/media/image1.png', Buffer.alloc(1024, 1)]]);
  const limited = inspect('partial-image-limit.docx', archive, { ...partialStandalone, maxEntryUncompressed: 512 });
  assert.strictEqual(limited.verdict, 'candidate');
  assert.deepStrictEqual(limited.structure.partial_findings, [{ reason: 'IMAGE_PROCESSING_LIMIT', count: 1 }]);
  assert.strictEqual(inspect('partial-global-limit.docx', archive, { ...partialStandalone, maxUncompressed: 512 }).code,
    'SOURCE_CONTAINER_LIMIT');
  assert.strictEqual(inspect('partial-trailing.docx', Buffer.concat([archive, Buffer.from('not ZIP')]), partialStandalone).code,
    'SOURCE_POLYGLOT_UNSUPPORTED');
  const mismatch = Buffer.from(archive);
  mismatch.writeUInt16LE(8, 8);
  assert.strictEqual(inspect('partial-header-mismatch.docx', mismatch, partialStandalone).code, 'SOURCE_CONTAINER_CORRUPT');
  const offset = payloadOffset(archive, 'word/media/image1.png');
  assert.throws(() => inspect('partial-read-failure.docx', archive, { ...partialStandalone,
    readSync(fd, target, start, length, position) {
      if (position === offset) throw new Error('SYNTHETIC_PRIVATE_READ_FAILURE');
      return fs.readSync(fd, target, start, length, position);
    }
  }), error => error.code === 'SOURCE_READ_FAILED');
});

test('partial intake quarantines external references with fixed findings but never an external office root', () => {
  for (const target of ['https://SYNTHETIC_SECRET.invalid/image.png', 'file:///SYNTHETIC_SECRET/image.png',
    '\\\\SYNTHETIC_SECRET\\image.png']) {
    const relationships = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="i1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}" TargetMode="External"/></Relationships>`;
    const result = inspect('partial-external.docx', docx({}, [['word/_rels/document.xml.rels', relationships]]), partialStandalone);
    assert.strictEqual(result.verdict, 'candidate');
    assert.strictEqual(result.structure.relationships_verified, false);
    assert.deepStrictEqual(result.structure.partial_findings, [{ reason: 'EXTERNAL_CONTENT_NOT_READ', count: 1 }]);
    assert.ok(!JSON.stringify(result).includes('SYNTHETIC_SECRET'));
  }
  const controls = Object.fromEntries(opcControlEntries('docx'));
  const externalRoot = controls['_rels/.rels'].replace('Target="word/document.xml"',
    'Target="https://SYNTHETIC_SECRET.invalid/main.xml" TargetMode="External"');
  assert.strictEqual(inspect('partial-external-root.docx', docx({ relationships: externalRoot }), partialStandalone).verdict,
    'rejected');
  const traversal = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="i1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../../outside.png"/></Relationships>';
  assert.strictEqual(inspect('partial-traversal.docx', docx({}, [
    ['word/_rels/document.xml.rels', traversal], ['outside.png', 'image']
  ]), partialStandalone).code, 'SOURCE_CONTAINER_CORRUPT');
});

test('partial OPC and XLSX extraction never reinterpret a noncanonical external mode as a local worksheet', () => {
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const packageNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const worksheet = value => `<worksheet xmlns="${main}"><sheetData><row><c r="A1" t="inlineStr">` +
    `<is><t>${value}</t></is></c></row></sheetData></worksheet>`;
  for (const mode of ['External', 'EXTERNAL', 'external', 'eXtErNaL']) {
    const archive = zipStore([
      ...opcControlEntries('xlsx', { additionalOverrides: [1, 2].map(index => ({
        part: `xl/worksheets/sheet${index}.xml`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
      })) }),
      ['xl/workbook.xml', `<workbook xmlns="${main}" xmlns:r="${office}"><sheets>` +
        '<sheet name="Good" sheetId="1" r:id="s1"/><sheet name="External" sheetId="2" r:id="s2"/>' +
        '</sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${packageNamespace}">` +
        `<Relationship Id="s1" Type="${office}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="s2" Type="${office}/worksheet" Target="worksheets/sheet2.xml" TargetMode="${mode}"/>` +
        '</Relationships>'],
      ['xl/worksheets/sheet1.xml', worksheet('GoodWorksheetText')],
      ['xl/worksheets/sheet2.xml', worksheet('ExternalSentinelMustNotBecomeLocalText')]
    ]);
    const before = Buffer.from(archive);
    const result = inspect(`partial-external-mode-${mode}.xlsx`, archive, partialStandalone);
    if (mode === 'External') {
      assert.strictEqual(result.verdict, 'candidate');
      assert.deepStrictEqual(result.structure.partial_findings, [{ reason: 'EXTERNAL_CONTENT_NOT_READ', count: 1 }]);
      const extracted = extractMarkdownBuffer(archive, '.xlsx', { partialExtraction: true, markdownOutput: 'content-v1' });
      assert.ok(extracted.markdown.includes('GoodWorksheetText'));
      assert.ok(!extracted.markdown.includes('ExternalSentinelMustNotBecomeLocalText'));
      assert.ok(extracted.coverage.reason_codes.includes('EXTERNAL_CONTENT_NOT_READ'));
    } else {
      assert.strictEqual(result.verdict, 'rejected');
      assert.strictEqual(result.code, 'SOURCE_CONTAINER_CORRUPT');
      assert.throws(() => extractMarkdownBuffer(archive, '.xlsx', { partialExtraction: true, markdownOutput: 'content-v1' }),
        error => error.code === 'MARKDOWN_EXTRACTION_FAILED');
    }
    assert.deepStrictEqual(archive, before);
  }
});

test('partial payload policy does not change unsupported compression into a CRC pass or soften encryption', () => {
  const archive = Buffer.from(docx({}, [['word/media/image1.png', 'SYNTHETIC_IMAGE']]));
  const payload = payloadOffset(archive, 'word/media/image1.png');
  const local = payload - 30 - Buffer.byteLength('word/media/image1.png');
  let central = archive.readUInt32LE(archive.length - 22 + 16);
  while (archive.readUInt32LE(central) === 0x02014b50) {
    const length = archive.readUInt16LE(central + 28), extra = archive.readUInt16LE(central + 30),
      comment = archive.readUInt16LE(central + 32);
    const name = archive.subarray(central + 46, central + 46 + length).toString('utf8');
    if (name === 'word/media/image1.png') break;
    central += 46 + length + extra + comment;
  }
  archive.writeUInt16LE(12, local + 8);
  archive.writeUInt16LE(12, central + 10);
  const result = inspect('partial-unsupported-method.docx', archive, partialStandalone);
  assert.strictEqual(result.verdict, 'candidate');
  assert.strictEqual(result.structure.crc_verified, false);
  assert.deepStrictEqual(result.structure.partial_findings, [{ reason: 'DOCUMENT_PARTS_DAMAGED', count: 1 }]);
  assert.strictEqual(inspect('strict-unsupported-method.docx', archive).code, 'SOURCE_CONTAINER_CORRUPT');
  archive.writeUInt16LE(archive.readUInt16LE(local + 6) | 1, local + 6);
  assert.strictEqual(inspect('partial-encrypted.docx', archive, partialStandalone).code, 'SOURCE_ENCRYPTED_UNSUPPORTED');
});

done(() => fs.rmSync(root, { recursive: true, force: true }));
