'use strict';

const { createSuite, assertPresent } = require('./helpers');
const { createContentGraph, validateContentGraph } = require('../plugins/data-secure/server/content-graph');
const { parseDocumentBuffer } = require('../plugins/data-secure/server/document-parser');
const { validateParserResult } = require('../plugins/data-secure/server/runtime');
const { zipStore } = require('./lib/zip');
const graphSchema = require('../docs/canonical/contracts/content-graph-v1.schema.json');

const { test, done, assert } = createSuite('Content graph v1');

test('TXT uses a half-open normalized text-position locator without duplicating content', () => {
  const result = parseDocumentBuffer(Buffer.from('Ärger\r\nZeile'), '.txt');
  assert.strictEqual(result.markdown, 'Ärger\nZeile');
  assert.deepStrictEqual(result.content_graph, {
    schema: 'data-secure-content-graph/v1',
    source_format: 'txt',
    coordinate_space: 'normalized-markdown:utf16',
    nodes: [{
      id: 'node-000001', kind: 'text',
      locator: {
        source_part: 'normalized-markdown',
        selector: { type: 'TextPositionSelector', start: 0, end: 11 }
      }
    }]
  });
  assert.doesNotMatch(JSON.stringify(result.content_graph), /Ärger|Zeile/u);
});

test('CSV and XLSX are represented as table nodes', () => {
  const result = parseDocumentBuffer(Buffer.from('A;B\n1;2'), '.csv');
  assert.strictEqual(result.content_graph.nodes[0].kind, 'table');
  assert.strictEqual(result.content_graph.source_format, 'csv');
});

test('image nodes bind every asset index, media type and structural source part', () => {
  const result = parseDocumentBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), '.jpg');
  const image = result.content_graph.nodes[1];
  assert.deepStrictEqual(image, {
    id: 'node-000002', kind: 'image', asset_index: 0, media_type: 'image/jpeg',
    locator: {
      source_part: 'standalone-image',
      selector: { type: 'FragmentSelector', value: 'standalone-image' }
    }
  });
});

test('validation rejects duplicate ids, uncovered assets and forged locator bounds', () => {
  const attachments = [{ mimeType: 'image/png', source_part: 'word/media/image1.png' }];
  const graph = createContentGraph('safe', attachments, '.docx');
  assert.strictEqual(validateContentGraph(graph, 'safe', attachments), graph);
  const duplicate = structuredClone(graph);
  duplicate.nodes[1].id = duplicate.nodes[0].id;
  assert.throws(() => validateContentGraph(duplicate, 'safe', attachments), /NODE_INVALID/);
  const missing = structuredClone(graph);
  missing.nodes.pop();
  assert.throws(() => validateContentGraph(missing, 'safe', attachments), /ASSET_COVERAGE_INVALID/);
  const outside = structuredClone(graph);
  outside.nodes[0].locator.selector.end = 5;
  assert.throws(() => validateContentGraph(outside, 'safe', attachments), /TEXT_LOCATOR_INVALID/);
});

test('validation rejects traversal-shaped structural parts and extra fields', () => {
  assert.throws(() => createContentGraph('safe', [{ mimeType: 'image/png', source_part: '../x' }], '.docx'),
    /SOURCE_PART_INVALID/);
  assert.throws(() => createContentGraph('safe', [{ mimeType: 'image/png', source_part: 'C:\\private\\image.png' }], '.docx'),
    /SOURCE_PART_INVALID/);
  assert.throws(() => createContentGraph('safe', [{ mimeType: 'image/png', source_part: 'https://private.example/image.png' }], '.docx'),
    /SOURCE_PART_INVALID/);
  assert.throws(() => createContentGraph('safe', [{ mimeType: 'image/png' }], '.docx'),
    /SOURCE_PART_INVALID/);
  assert.throws(() => createContentGraph('safe', [], '.docx', [{ kind: 'text', markdown: 'safe' }]),
    /SOURCE_PART_INVALID/);
  const graph = createContentGraph('safe', [], '.txt');
  graph.nodes[0].raw_text = 'must never be duplicated';
  assert.throws(() => validateContentGraph(graph, 'safe', []), /TEXT_LOCATOR_INVALID/);
});

test('validation rejects hidden text gaps, overlapping nodes, reordered ids and text after images', () => {
  const sections = [
    { kind: 'text', source_part: 'word/document.xml', markdown: 'Alpha' },
    { kind: 'metadata', source_part: 'docProps/core.xml', markdown: 'Beta' }
  ];
  const markdown = 'Alpha\n\nBeta';
  const graph = createContentGraph(markdown, [], '.docx', sections);
  assert.strictEqual(validateContentGraph(graph, markdown, []), graph);

  const gap = structuredClone(graph);
  gap.nodes[1].locator.selector.start++;
  assert.throws(() => validateContentGraph(gap, markdown, []), /TEXT_COVERAGE_INVALID/);

  const overlap = structuredClone(graph);
  overlap.nodes[1].locator.selector.start = 4;
  assert.throws(() => validateContentGraph(overlap, markdown, []), /TEXT_COVERAGE_INVALID/);

  const id = structuredClone(graph);
  id.nodes[0].id = 'node-000099';
  assert.throws(() => validateContentGraph(id, markdown, []), /NODE_INVALID/);

  const withImage = createContentGraph('Alpha', [{ mimeType: 'image/png', source_part: 'word/media/image1.png' }], '.docx');
  withImage.nodes.push({
    id: 'node-000003', kind: 'text',
    locator: { source_part: 'word/footer1.xml', selector: { type: 'TextPositionSelector', start: 0, end: 5 } }
  });
  assert.throws(() => validateContentGraph(withImage, 'Alpha', [{ mimeType: 'image/png', source_part: 'word/media/image1.png' }]),
    /TEXT_ORDER_INVALID/);
});

test('image locators cannot be relabelled, swapped or paired with an unsafe attachment source', () => {
  const attachments = [1, 2].map((index) => ({ mimeType: 'image/png', source_part: `word/media/image${index}.png` }));
  const graph = createContentGraph('safe', attachments, '.docx');
  const swapped = structuredClone(graph);
  swapped.nodes[1].locator = structuredClone(graph.nodes[2].locator);
  swapped.nodes[2].locator = structuredClone(graph.nodes[1].locator);
  assert.throws(() => validateContentGraph(swapped, 'safe', attachments), /IMAGE_LOCATOR_INVALID/);
  for (const source_part of ['word/media/other.png', '../private', 'word/\u0000image.png']) {
    const forged = structuredClone(attachments);
    forged[0].source_part = source_part;
    assert.throws(() => validateContentGraph(graph, 'safe', forged), /IMAGE_LOCATOR_INVALID/);
  }
});

test('image media types are validated independently even when graph and attachment agree', () => {
  const attachments = [{ mimeType: 'image/png', source_part: 'word/media/image.png' }];
  for (const mimeType of [null, 123, '', 'text/html', 'image/png\n', 'image/PNG']) {
    const graph = createContentGraph('safe', attachments, '.docx');
    graph.nodes[1].media_type = mimeType;
    assert.throws(() => validateContentGraph(graph, 'safe', [{ ...attachments[0], mimeType }]), /IMAGE_LOCATOR_INVALID/);
  }
});

test('source format has an explicit type and must match the trusted parser invocation', () => {
  const result = parseDocumentBuffer(Buffer.from('safe'), '.txt');
  assert.strictEqual(validateParserResult(result, '.txt'), result);
  for (const source_format of [123, null, ['txt'], 'txt\n', 'docx']) {
    const forged = structuredClone(result);
    forged.content_graph.source_format = source_format;
    assert.throws(() => validateParserResult(forged, '.txt'), /Content-Graph/);
  }
});

test('schema and runtime share canonical structural source-part grammar including container chains', () => {
  const pattern = new RegExp(graphSchema.$defs.part.pattern, 'u');
  const positive = ['normalized-markdown', 'word/media/ä.png',
    'word/embeddings/inner.docx!/word/media/image1.png',
    'word/embeddings/inner.docx!/xl/embeddings/deep.xlsx!/xl/worksheets/sheet1.xml'];
  const negative = ['', '/', '/word/a', 'word//a', '.', '..', 'word/../a', 'word/./a',
    'word\\media\\a.png', 'C:/private', 'https://example.invalid/a', 'word/name\u0000.xml',
    'word/name\n.xml', 'word/name\r.xml', 'word/name\u0085.xml', 'word/a!',
    'word/a!/../x', 'word/a!//x', 'word/a!/x/..', 'word/a!x', '.!/word/a', '..!/word/a',
    'word/a\u2028/../private', 'word/a\u2029\u0000.xml', 'word/a\u2028:private', 'word/a\u2029\\private',
    'word/a.docx!/word/a\u2028/../private', 'word/a.docx!/word/a\u2029\u0000.xml',
    'word/a.docx!/word/a\u2028:private', 'word/a.docx!/word/a\u2029\\private'];
  for (const source_part of positive) {
    assert.ok(pattern.test(source_part), source_part);
    const attachments = [{ mimeType: 'image/png', source_part }];
    const graph = createContentGraph('safe', attachments, '.docx');
    assert.strictEqual(validateContentGraph(graph, 'safe', attachments), graph);
  }
  for (const source_part of negative) {
    assert.strictEqual(pattern.test(source_part), false, JSON.stringify(source_part));
    assert.throws(() => createContentGraph('safe', [{ mimeType: 'image/png', source_part }], '.docx'), /SOURCE_PART_INVALID/);
  }
});

test('constructor refuses an oversized graph before materializing nodes', () => {
  const section = { kind: 'text', source_part: 'word/document.xml', markdown: '' };
  const attachments = [{ mimeType: 'image/png', source_part: 'word/media/image.png' }];
  assert.doesNotThrow(() => createContentGraph('', attachments, '.docx', Array(999).fill(section)));
  assert.throws(() => createContentGraph('', attachments, '.docx', Array(1000).fill(section)), /NODE_LIMIT/);
  assert.throws(() => createContentGraph('', Array(1000).fill(attachments[0]), '.docx'), /NODE_LIMIT/);
});

test('1200 deterministic Unicode/container combinations agree with an independent segment oracle', () => {
  const schemaPart = graphSchema.$defs.part;
  const pattern = new RegExp(schemaPart.pattern, 'u');
  const pieces = ['word', '.', '..', '', 'media', 'a.docx!', 'a\u2028', 'a\u2029',
    'a\u0000', 'a\n', 'C:', 'a\\b', 'ä', 'a!b', '🙂'];
  let seed = 69;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (let index = 0; index < 1200; index++) {
    const part = Array.from({ length: 1 + next() % 8 }, () => pieces[next() % pieces.length]).join('/');
    const expected = part.length > 0 && part.length <= 500 &&
      !/[\u0000-\u001f\u007f-\u009f\u2028\u2029:\\]/u.test(part) &&
      part.split('!/').every((container) => !container.includes('!') &&
        container.split('/').every((segment) => segment && segment !== '.' && segment !== '..'));
    assert.strictEqual(pattern.test(part), expected, `schema case ${index}`);
    const build = () => createContentGraph('safe', [{ mimeType: 'image/png', source_part: part }], '.docx');
    if (expected) assert.doesNotThrow(build, `runtime case ${index}`);
    else assert.throws(build, /SOURCE_PART_INVALID/, `runtime case ${index}`);
  }
});

test('the isolated parser boundary requires the graph instead of accepting legacy output', () => {
  assert.throws(() => validateParserResult({ markdown: 'safe', attachments: [], warnings: [] }),
    /Content-Graph/);
  const result = parseDocumentBuffer(Buffer.from('safe'), '.txt');
  assert.strictEqual(validateParserResult(result), result);
});

test('DOCX locators distinguish body, header and comments while keeping parser sections private', () => {
  const result = parseDocumentBuffer(zipStore([
    ['_rels/.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>'],
    ['word/document.xml', '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Hauptinhalt</w:t></w:r></w:p></w:body></w:document>'],
    ['word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>'],
    ['word/header1.xml', '<w:hdr xmlns:w="w"><w:p><w:r><w:t>Kopftext</w:t></w:r></w:p></w:hdr>'],
    ['word/comments.xml', '<w:comments xmlns:w="w"><w:comment><w:p><w:r><w:t>Kommentartext</w:t></w:r></w:p></w:comment></w:comments>'],
    ['docProps/core.xml', '<cp:coreProperties xmlns:cp="cp" xmlns:dc="dc"><dc:creator>Erika Beispiel</dc:creator><cp:lastModifiedBy>Max Muster</cp:lastModifiedBy></cp:coreProperties>'],
    ['word/media/image1.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])]
  ]), '.docx');
  assert.strictEqual(Object.hasOwn(result, 'sections'), false, 'raw section payload must not cross the parser boundary');
  assert.deepStrictEqual(result.content_graph.nodes.map((node) => node.locator.source_part), [
    'word/document.xml', 'word/header1.xml', 'word/comments.xml', 'docProps/core.xml', 'word/media/image1.png'
  ]);
  assert.strictEqual(result.content_graph.nodes[3].kind, 'metadata');
  for (const node of result.content_graph.nodes.filter((entry) => entry.kind !== 'image')) {
    const { start, end } = node.locator.selector;
    assert.ok(result.markdown.slice(start, end).length > 0, `${node.locator.source_part} must locate released Markdown`);
  }
});

test('XLSX locators distinguish worksheet, chart and drawing text', () => {
  const result = parseDocumentBuffer(zipStore([
    ['xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="Blatt" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Zelle</t></is></c></row></sheetData></worksheet>'],
    ['xl/worksheets/_rels/sheet1.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>'],
    ['xl/charts/chart1.xml', '<c:chart xmlns:c="c"><c:v>Diagrammwert</c:v></c:chart>'],
    ['xl/drawings/drawing1.xml', '<xdr:wsDr xmlns:xdr="xdr" xmlns:a="a"><a:t>Grafiktext</a:t></xdr:wsDr>'],
    ['xl/drawings/_rels/drawing1.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>']
  ]), '.xlsx');
  assert.deepStrictEqual(result.content_graph.nodes.map((node) => [node.kind, node.locator.source_part]), [
    ['table', 'xl/worksheets/sheet1.xml'],
    ['table', 'xl/charts/chart1.xml'],
    ['text', 'xl/drawings/drawing1.xml']
  ]);
});

test('PPTX locators distinguish slide, notes, chart, layout and master data', () => {
  const result = parseDocumentBuffer(zipStore([
    ['ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/></Relationships>'],
    ['ppt/slides/slide1.xml', '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Folientext</a:t><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Tabellenwert</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></p:sld>'],
    ['ppt/notesSlides/notesSlide1.xml', '<p:notes xmlns:p="p" xmlns:a="a"><a:t>Notiztext</a:t></p:notes>'],
    ['ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="rId17" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/><Relationship Id="rId18" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>'],
    ['ppt/charts/chart1.xml', '<c:chart xmlns:c="c"><c:v>Diagrammwert</c:v></c:chart>'],
    ['ppt/slideLayouts/slideLayout1.xml', '<p:sldLayout xmlns:p="p" xmlns:a="a"><a:t>Layouttext</a:t></p:sldLayout>'],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', '<Relationships><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>'],
    ['ppt/slideMasters/slideMaster1.xml', '<p:sldMaster xmlns:p="p" xmlns:a="a"><a:t>Mastertext</a:t></p:sldMaster>']
  ]), '.pptx');
  assert.deepStrictEqual(result.content_graph.nodes.map((node) => [node.kind, node.locator.source_part]), [
    ['text', 'ppt/slides/slide1.xml'],
    ['table', 'ppt/slides/slide1.xml'],
    ['text', 'ppt/notesSlides/notesSlide1.xml'],
    ['table', 'ppt/charts/chart1.xml'],
    ['text', 'ppt/slideLayouts/slideLayout1.xml'],
    ['text', 'ppt/slideMasters/slideMaster1.xml']
  ]);
});

test('embedded OOXML locators retain the complete container chain', () => {
  const inner = zipStore([[
    'word/document.xml',
    '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Innerer Inhalt</w:t></w:r></w:p></w:body></w:document>'
  ]]);
  const outer = zipStore([
    ['word/document.xml', '<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>Äußerer Inhalt</w:t></w:r></w:p></w:body></w:document>'],
    ['word/embeddings/inner.docx', inner],
    ['word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="embeddings/inner.docx"/></Relationships>']
  ]);
  const result = parseDocumentBuffer(outer, '.docx');
  assert.ok(result.content_graph.nodes.some((node) =>
    node.locator.source_part === 'word/embeddings/inner.docx!/word/document.xml'));
  assertPresent(result.markdown, 'Innerer Inhalt', 'embedded Markdown');
});

done();
