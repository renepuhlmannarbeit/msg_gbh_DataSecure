'use strict';

const { createSuite } = require('./helpers');
const { createContentGraph, validateContentGraph } = require('../plugins/data-secure/server/content-graph');
const { parseDocumentBuffer } = require('../plugins/data-secure/server/document-parser');
const { validateParserResult } = require('../plugins/data-secure/server/runtime');

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

test('the isolated parser boundary requires the graph instead of accepting legacy output', () => {
  assert.throws(() => validateParserResult({ markdown: 'safe', attachments: [], warnings: [] }),
    /Content-Graph/);
  const result = parseDocumentBuffer(Buffer.from('safe'), '.txt');
  assert.strictEqual(validateParserResult(result), result);
});

done();
