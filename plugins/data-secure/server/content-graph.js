'use strict';

const path = require('path');

const SCHEMA = 'data-secure-content-graph/v1';
const POSITION = 'TextPositionSelector';
const FRAGMENT = 'FragmentSelector';
const MAX_NODES = 1000;

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...expected].sort().join(',');
}

function cleanPart(value) {
  const part = String(value || 'normalized-markdown').replace(/\\/gu, '/');
  if (!part || part.length > 500 || part.startsWith('/') ||
    part.split('/').some((item) => !item || item === '.' || item === '..')) {
    throw new Error('CONTENT_GRAPH_SOURCE_PART_INVALID');
  }
  return part;
}

function mainKind(ext) {
  return ext === '.csv' || ext === '.xlsx' ? 'table' : 'text';
}

function createContentGraph(markdown, attachments, ext) {
  if (typeof markdown !== 'string' || !Array.isArray(attachments)) {
    throw new Error('CONTENT_GRAPH_INPUT_INVALID');
  }
  const nodes = [{
    id: 'node-000001',
    kind: mainKind(ext),
    locator: {
      source_part: 'normalized-markdown',
      selector: { type: POSITION, start: 0, end: markdown.length }
    }
  }];
  attachments.forEach((attachment, index) => {
    const sourcePart = cleanPart(attachment.source_part);
    nodes.push({
      id: `node-${String(index + 2).padStart(6, '0')}`,
      kind: 'image',
      asset_index: index,
      media_type: String(attachment.mimeType || ''),
      locator: {
        source_part: sourcePart,
        selector: { type: FRAGMENT, value: sourcePart }
      }
    });
  });
  return {
    schema: SCHEMA,
    source_format: path.extname(`x${ext}`).slice(1).toLowerCase(),
    coordinate_space: 'normalized-markdown:utf16',
    nodes
  };
}

function validateContentGraph(graph, markdown, attachments) {
  if (!exactKeys(graph, ['schema', 'source_format', 'coordinate_space', 'nodes']) ||
    graph.schema !== SCHEMA || !/^[a-z0-9]+$/u.test(graph.source_format) ||
    graph.coordinate_space !== 'normalized-markdown:utf16' ||
    !Array.isArray(graph.nodes) || graph.nodes.length < 1 || graph.nodes.length > MAX_NODES) {
    throw new Error('CONTENT_GRAPH_INVALID');
  }
  const ids = new Set();
  let imageCount = 0;
  for (const node of graph.nodes) {
    if (!node || !/^node-[0-9]{6}$/u.test(String(node.id)) || ids.has(node.id)) {
      throw new Error('CONTENT_GRAPH_NODE_INVALID');
    }
    ids.add(node.id);
    if (node.kind === 'text' || node.kind === 'table') {
      if (!exactKeys(node, ['id', 'kind', 'locator']) ||
        !exactKeys(node.locator, ['source_part', 'selector']) ||
        cleanPart(node.locator.source_part) !== node.locator.source_part ||
        !exactKeys(node.locator.selector, ['type', 'start', 'end']) ||
        node.locator.selector.type !== POSITION ||
        !Number.isSafeInteger(node.locator.selector.start) ||
        !Number.isSafeInteger(node.locator.selector.end) ||
        node.locator.selector.start < 0 || node.locator.selector.end < node.locator.selector.start ||
        node.locator.selector.end > markdown.length) throw new Error('CONTENT_GRAPH_TEXT_LOCATOR_INVALID');
    } else if (node.kind === 'image') {
      if (!exactKeys(node, ['id', 'kind', 'asset_index', 'media_type', 'locator']) ||
        !Number.isSafeInteger(node.asset_index) || node.asset_index !== imageCount ||
        node.media_type !== attachments[node.asset_index]?.mimeType ||
        !exactKeys(node.locator, ['source_part', 'selector']) ||
        cleanPart(node.locator.source_part) !== node.locator.source_part ||
        !exactKeys(node.locator.selector, ['type', 'value']) ||
        node.locator.selector.type !== FRAGMENT ||
        node.locator.selector.value !== node.locator.source_part) {
        throw new Error('CONTENT_GRAPH_IMAGE_LOCATOR_INVALID');
      }
      imageCount++;
    } else {
      throw new Error('CONTENT_GRAPH_KIND_INVALID');
    }
  }
  if (imageCount !== attachments.length) throw new Error('CONTENT_GRAPH_ASSET_COVERAGE_INVALID');
  return graph;
}

module.exports = { SCHEMA, createContentGraph, validateContentGraph };
