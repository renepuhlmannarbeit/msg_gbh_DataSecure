'use strict';

const { createSuite, assertPresent } = require('./helpers');
const { createContentGraph, validateContentGraph } = require('../plugins/data-secure/server/content-graph');
const { parseDocumentBuffer } = require('../plugins/data-secure/server/document-parser');
const { validateParserResult } = require('../plugins/data-secure/server/runtime');
const { zipStore } = require('./lib/zip');

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

test('PPTX locators distinguish slide, notes and chart data', () => {
  const result = parseDocumentBuffer(zipStore([
    ['ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>'],
    ['ppt/slides/slide1.xml', '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Folientext</a:t></p:sld>'],
    ['ppt/notesSlides/notesSlide1.xml', '<p:notes xmlns:p="p" xmlns:a="a"><a:t>Notiztext</a:t></p:notes>'],
    ['ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="rId17" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/><Relationship Id="rId18" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>'],
    ['ppt/charts/chart1.xml', '<c:chart xmlns:c="c"><c:v>Diagrammwert</c:v></c:chart>']
  ]), '.pptx');
  assert.deepStrictEqual(result.content_graph.nodes.map((node) => [node.kind, node.locator.source_part]), [
    ['text', 'ppt/slides/slide1.xml'],
    ['text', 'ppt/notesSlides/notesSlide1.xml'],
    ['table', 'ppt/charts/chart1.xml']
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
