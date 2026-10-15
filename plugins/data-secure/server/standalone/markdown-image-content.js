'use strict';

// Span-based presentation only, called by the isolated conversion child.
// No renderer, source path, network access, entity decision or export filter.
const { validateMarkdownText, MAX_MARKDOWN_CHARS } = require('./markdown-contract');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { MAX_IMAGE_BYTES } = require('../images/common');
const MAX_NODES = 200_000;
const fail = () => { throw Object.assign(new Error('MARKDOWN_CONTENT_TRANSFORM_FAILED'),
  { code: 'MARKDOWN_CONTENT_TRANSFORM_FAILED' }); };

function literalAlt(value) {
  return String(value || '').replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/([\\`*_[\]{}()#+.!|~=-])/gu, '\\$1');
}

function imageText(alt, title) {
  const value = String(alt || '');
  return literalAlt(value + (title && title !== value ? (value ? ' — ' : '') + title : ''));
}

function buildMarkdownImageContent(source, readers, collectMedia) {
  validateMarkdownText(source);
  if (typeof readers?.fromMarkdown !== 'function' || typeof readers?.parseFragment !== 'function') fail();
  const tree = readers.fromMarkdown(source);
  const edits = [], definitions = [], images = [], links = [], htmlRanges = [], mediaEntries = [], imageReferences = new Set(), linkReferences = new Set();
  const checkedUris = new Map();
  const groupedUris = new Map();
  let mediaBytes = 0;
  let count = 0;
  const add = (start, end, text) => {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > source.length) fail();
    const edit = { start, end, text };
    edits.push(edit);
    return edit;
  };
  const unavailable = () => { throw Object.assign(new Error('MARKDOWN_IMAGE_OCR_UNAVAILABLE'), { code: 'MARKDOWN_IMAGE_OCR_UNAVAILABLE' }); };
  const registerMedia = (edit, uri, continuation, group = edit) => {
    if (!collectMedia || !edit) return;
    // Only canonical, fully embedded raster bytes are authorized by this
    // source. An AST/HTML image URL never grants filesystem/network access.
    if (typeof uri !== 'string') unavailable();
    if (uri.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32) {
      throw Object.assign(new Error('INPUT_FORMAT_LIMIT'), { code: 'INPUT_FORMAT_LIMIT' });
    }
    // Only alternative attributes of the same physical img/picture share a
    // group. Equal bytes in separate image nodes are still separate content.
    if (groupedUris.get(group)?.has(uri)) return;
    if (mediaEntries.length >= RESOURCE_LIMITS.MAX_VISUAL_ASSETS) throw Object.assign(new Error('INPUT_FORMAT_LIMIT'), { code: 'INPUT_FORMAT_LIMIT' });
    let checked = checkedUris.get(uri);
    if (!checked) {
      const match = /^data:image\/(png|jpeg|bmp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(uri);
      if (!match || Buffer.from(match[2], 'base64').toString('base64') !== match[2]) unavailable();
      checked = { extension: match[1], mimeType: `image/${match[1]}`, data: match[2],
        bytes: match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0) };
      checkedUris.set(uri, checked);
    }
    mediaBytes += checked.bytes;
    if (mediaBytes > RESOURCE_LIMITS.MAX_ASSET_BYTES) throw Object.assign(new Error('INPUT_FORMAT_LIMIT'), { code: 'INPUT_FORMAT_LIMIT' });
    mediaEntries.push({ edit, extension: checked.extension, mimeType: checked.mimeType, data: checked.data,
      continuation: edit.continuation ?? continuation });
    if (!groupedUris.has(group)) groupedUris.set(group, new Set());
    groupedUris.get(group).add(uri);
  };
  const registerSourceSet = (edit, value, continuation, group = edit) => {
    if (!collectMedia) return;
    if (value === undefined || (typeof value === 'string' && !value.trim())) return;
    // A single canonical candidate with an optional standard descriptor. Do
    // not guess a primary image from an ambiguous/mixed srcset list.
    const match = typeof value === 'string' && /^(data:image\/(?:png|jpeg|bmp);base64,[A-Za-z0-9+/]+={0,2})(?:[ \t]+(?:[1-9][0-9]*w|(?:[1-9][0-9]*(?:\.[0-9]+)?|0\.[0-9]*[1-9][0-9]*)x))?[ \t]*$/u.exec(value);
    if (!match) unavailable();
    registerMedia(edit, match[1], continuation, group);
  };
  const registerHtmlRaster = (edit, attrs, continuation, group = edit) => {
    if (!collectMedia) return;
    const src = attrs.get('src'), srcset = attrs.get('srcset');
    const hasSrc = typeof src === 'string' && Boolean(src.trim());
    const hasSourceSet = typeof srcset === 'string' && Boolean(srcset.trim());
    if (!hasSrc && !hasSourceSet) unavailable();
    if (hasSrc) registerMedia(edit, src, continuation, group);
    if (hasSourceSet) registerSourceSet(edit, srcset, continuation, group);
  };
  const rasterGroup = node => {
    if (node.parentNode?.tagName !== 'picture') return node;
    const images = (node.parentNode.childNodes || []).filter(child => child.tagName === 'img');
    // Do not collapse multiple actual img nodes from malformed picture markup.
    // Its source-to-image alternative binding is not unambiguous.
    if (images.length !== 1) unavailable();
    return images[0];
  };
  // Walk iteratively: malicious nesting must not overflow our JavaScript stack.
  const pending = [{ node: tree, continuation: '' }];
  while (pending.length) {
    const entry = pending.pop(), node = entry.node;
    if (++count > MAX_NODES) fail();
    const start = node.position?.start?.offset, end = node.position?.end?.offset;
    if (node.type === 'image' || node.type === 'imageReference') {
      images.push({ node, continuation: entry.continuation });
      if (node.type === 'imageReference') imageReferences.add(node.identifier);
    } else if (node.type === 'linkReference') { linkReferences.add(node.identifier); links.push({ node, continuation: entry.continuation }); }
    else if (node.type === 'definition') definitions.push(node);
    else if (node.type === 'html') htmlRanges.push({ start, end, value: node.value, continuation: entry.continuation });
    let continuation = entry.continuation;
    if (node.type === 'blockquote') continuation += '> ';
    if (node.type === 'listItem') continuation += ' '.repeat(Math.max(1,
      (node.children?.[0]?.position?.start?.column || node.position.start.column + 2) - node.position.start.column));
    for (const child of node.children || []) pending.push({ node: child, continuation });
  }
  // CommonMark resolves the first definition, including its optional title.
  // The iterative walk order is not source order, so index explicitly first.
  const defined = new Map();
  for (const node of definitions.sort((a, b) => a.position.start.offset - b.position.start.offset)) {
    if (!defined.has(node.identifier)) defined.set(node.identifier, node);
  }
  for (const { node, continuation } of images) {
    const reference = node.type === 'imageReference' ? defined.get(node.identifier) : node;
    const edit = add(node.position.start.offset, node.position.end.offset,
      imageText(node.alt, reference?.title).replace(/\r\n|\r|\n/gu, ending => ending + continuation));
    registerMedia(edit, reference?.url, continuation, node);
  }
  if (htmlRanges.length) {
    htmlRanges.sort((a, b) => a.start - b.start);
    const masked = [], unmasked = [], sourceMap = [], normalizedRanges = [];
    let rawCursor = 0, normalizedOffset = 0;
    function outside(to) {
      const value = source.slice(rawCursor, to);
      masked.push(value.replace(/[^\r\n]/g, ' ')); unmasked.push(value);
      for (let i = rawCursor; i < to; i++) sourceMap.push(i);
      normalizedOffset += value.length; rawCursor = to;
    }
    for (const range of htmlRanges) {
      outside(range.start);
      const raw = source.slice(range.start, range.end);
      const rawLines = raw.match(/[^\r\n]*(?:\r\n|\r|\n|$)/gu)?.filter(Boolean) || [];
      const valueLines = range.value.match(/[^\r\n]*(?:\r\n|\r|\n|$)/gu)?.filter(Boolean) || [];
      if (rawLines.length !== valueLines.length) fail();
      let offset = range.start;
      for (let line = 0; line < rawLines.length; line++) {
        const rawLine = rawLines[line], valueLine = valueLines[line];
        // MDAST strips only CommonMark container prefixes. Check the exact
        // remaining suffix instead of guessing how many > or spaces to erase.
        if (!rawLine.endsWith(valueLine)) fail();
        const prefix = rawLine.length - valueLine.length;
        for (let i = 0; i < valueLine.length; i++) sourceMap.push(offset + prefix + i);
        offset += rawLine.length;
      }
      normalizedRanges.push({ start: normalizedOffset, end: normalizedOffset + range.value.length, continuation: range.continuation });
      normalizedOffset += range.value.length;
      masked.push(range.value); unmasked.push(range.value); rawCursor = range.end;
    }
    outside(source.length);
    const normalized = unmasked.join('');
    const rangeAt = a => {
      let low = 0, high = normalizedRanges.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (normalizedRanges[middle].start <= a) low = middle + 1; else high = middle;
      }
      const range = normalizedRanges[low - 1];
      return range && a >= range.start && a < range.end ? range : null;
    };
    const permitted = location => {
      const range = location && rangeAt(location.startOffset);
      return range && location.endOffset <= range.end;
    };
    const mappedEdit = (location, text) => {
      const a = location.startOffset, b = location.endOffset;
      if (!Number.isSafeInteger(sourceMap[a]) || !Number.isSafeInteger(sourceMap[b - 1])) fail();
      let prefix = rangeAt(a)?.continuation || '';
      for (let i = a + 1; i < b; i++) if (sourceMap[i] > sourceMap[i - 1] + 1) {
        const gap = source.slice(sourceMap[i - 1] + 1, sourceMap[i]);
        if (/^[ \t>]+$/u.test(gap)) { prefix = gap; break; }
      }
      const edit = add(sourceMap[a], sourceMap[b - 1] + 1, prefix ? text.replace(/\r\n|\r|\n/gu, ending => ending + prefix) : text);
      edit.continuation = prefix;
      return edit;
    };
    const htmlEdit = (location, text) => { if (permitted(location)) return mappedEdit(location, text); };
    // Non-HTML code cannot swallow a later real HTML tag. Parse CommonMark's
    // actual normalized HTML values with a checked map back to original bytes.
    const htmlPending = [{ node: readers.parseFragment(masked.join(''), { sourceCodeLocationInfo: true }), inPicture: false }];
    while (htmlPending.length) {
      const entry = htmlPending.pop(), html = entry.node;
      if (++count > MAX_NODES) fail();
      const location = html.sourceCodeLocation;
      if (html.tagName === 'svg' && permitted(location?.startTag) && !location?.endTag) {
        if (normalized.slice(location.startTag.startOffset, location.startTag.endOffset).endsWith('/>')) {
          htmlEdit(location.startTag, literalAlt(html.attrs?.find(item => item.name === 'aria-label')?.value));
          continue;
        }
        // An unclosed SVG has no trustworthy content boundary. Do not erase
        // subsequent prose or falsely claim its image attributes were removed.
        fail();
      }
      if (html.tagName === 'svg' && permitted(location?.startTag) && permitted(location?.endTag)) {
        const svg = readers.parseFragment(normalized.slice(location.startOffset, location.endOffset));
        const textParts = [], generatedBoundary = [], rasterUris = [], svgPending = [{ node: svg, group: -1 }];
        const blocks = new Set(['div', 'p', 'section', 'article', 'header', 'footer', 'aside', 'main',
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'table', 'li', 'ul', 'ol', 'blockquote', 'pre', 'dl', 'dt', 'dd']);
        const boundary = group => {
          if (group >= 0 && textParts[group] && !textParts[group].endsWith('\n')) {
            textParts[group] += '\n'; generatedBoundary[group] = true;
          }
        };
        while (svgPending.length) {
          const element = svgPending.pop();
          if (++count > MAX_NODES) fail();
          if (element.boundary) { boundary(element.group); continue; }
          const node = element.node;
          if (node.tagName === 'script' || node.tagName === 'style') continue;
          if (collectMedia && node.tagName === 'image') {
            rasterUris.push({ uri: node.attrs?.find(item => ['href', 'xlink:href'].includes(item.name))?.value, group: node });
          } else if (collectMedia && node.tagName === 'img') {
            const attrs = new Map((node.attrs || []).map(item => [item.name, item.value]));
            rasterUris.push({ htmlAttrs: attrs, group: rasterGroup(node) });
          } else if (collectMedia && node.tagName === 'source' && node.parentNode?.tagName === 'picture') {
            rasterUris.push({ srcset: node.attrs?.find(item => item.name === 'srcset')?.value, group: rasterGroup(node) });
          }
          let group = element.group;
          if (group < 0 && ['text', 'title', 'desc', 'foreignObject'].includes(node.tagName)) { group = textParts.length; textParts.push(''); }
          if (node.nodeName === '#text' && group >= 0) { textParts[group] += node.value; generatedBoundary[group] = false; }
          if (node.tagName === 'img' && group >= 0) {
            const attrs = new Map((node.attrs || []).map(item => [item.name, item.value]));
            const alt = attrs.get('alt') || '', title = attrs.get('title');
            textParts[group] += alt + (title && title !== alt ? `${alt ? ' — ' : ''}${title}` : '');
            generatedBoundary[group] = false;
          }
          const block = group >= 0 && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && blocks.has(node.tagName);
          if (block) { boundary(group); svgPending.push({ boundary: true, group }); }
          if (node.tagName === 'br' && group >= 0) boundary(group);
          // Reverse push preserves textual reading order, unlike the unordered
          // tag-edit walk. Keep real SVG labels/description, not path commands.
          for (let i = (node.childNodes?.length || 0) - 1; i >= 0; i--) svgPending.push({ node: node.childNodes[i], group });
        }
        const svgText = textParts.map((value, index) => generatedBoundary[index] ? value.slice(0, -1) : value).join(' '),
          label = html.attrs?.find(item => item.name === 'aria-label')?.value;
        const edit = mappedEdit(location, imageText(svgText, label));
        for (const raster of rasterUris) {
          if (Object.hasOwn(raster, 'htmlAttrs')) registerHtmlRaster(edit, raster.htmlAttrs, rangeAt(location.startOffset)?.continuation || '', raster.group);
          else if (Object.hasOwn(raster, 'srcset')) registerSourceSet(edit, raster.srcset, rangeAt(location.startOffset)?.continuation || '', raster.group);
          else registerMedia(edit, raster.uri, rangeAt(location.startOffset)?.continuation || '', raster.group);
        }
        continue;
      }
      if (html.tagName === 'img') {
        const attrs = new Map((html.attrs || []).map(item => [item.name, item.value]));
        const edit = htmlEdit(location, imageText(attrs.get('alt'), attrs.get('title')));
        if (edit) {
          const continuation = rangeAt(location.startOffset)?.continuation || '';
          registerHtmlRaster(edit, attrs, continuation, rasterGroup(html));
        }
      }
      else if (html.tagName === 'picture') {
        htmlEdit(location?.startTag, ''); htmlEdit(location?.endTag, '');
      } else if (html.tagName === 'source' && entry.inPicture) {
        const edit = htmlEdit(location, '');
        if (edit && collectMedia) registerSourceSet(edit, html.attrs?.find(item => item.name === 'srcset')?.value,
          rangeAt(location.startOffset)?.continuation || '', rasterGroup(html));
      }
      for (const child of html.childNodes || []) htmlPending.push({ node: child,
        inPicture: entry.inPicture || html.tagName === 'picture' });
      if (html.content) htmlPending.push({ node: html.content, inPicture: entry.inPicture });
    }
  }
  if (collectMedia) for (const { node, continuation } of links) if (imageReferences.has(node.identifier)) {
    // A definition shared by an image and a normal link must not retain the
    // embedded image's base64 payload. Remove only the link's own wrapper;
    // nested label/code/image spans remain independently intact.
    const first = node.children?.[0], last = node.children?.at(-1);
    if (!first || !last) add(node.position.start.offset, node.position.end.offset, '');
    else {
      if (first.position.start.offset > node.position.start.offset) add(node.position.start.offset, first.position.start.offset, '');
      if (last.position.end.offset < node.position.end.offset) add(last.position.end.offset, node.position.end.offset,
        defined.get(node.identifier)?.title ? ` — ${literalAlt(defined.get(node.identifier).title).replace(/\r\n|\r|\n/gu, ending => ending + continuation)}` : '');
    }
  }
  for (const node of definitions) if (imageReferences.has(node.identifier) && (collectMedia || !linkReferences.has(node.identifier))) {
    add(node.position.start.offset, node.position.end.offset, '');
  }
  edits.sort((a, b) => a.start - b.start || a.end - b.end);
  let cursor = 0, length = 0;
  const media = [];
  const mediaByEdit = new Map();
  for (const entry of mediaEntries) {
    if (!mediaByEdit.has(entry.edit)) mediaByEdit.set(entry.edit, []);
    mediaByEdit.get(entry.edit).push(entry);
  }
  const chunks = [];
  for (const edit of edits) {
    if (edit.start < cursor) fail();
    const prefix = source.slice(cursor, edit.start);
    length += prefix.length + edit.text.length;
    if (length > MAX_MARKDOWN_CHARS) fail();
    chunks.push(prefix, edit.text); cursor = edit.end;
    for (const entry of mediaByEdit.get(edit) || []) {
      const index = media.length + 1;
      media.push({ type: 'image', extension: entry.extension, mimeType: entry.mimeType, data: entry.data,
        source_part: `md/media/image${index}.${entry.extension}`, start: length, end: length, continuation: entry.continuation });
    }
  }
  chunks.push(source.slice(cursor));
  const markdown = chunks.join('');
  validateMarkdownText(markdown);
  return { markdown, imageNodesRemoved: edits.length > 0, ...(collectMedia ? { media } : {}) };
}

function markdownImageContent(source, readers) { return buildMarkdownImageContent(source, readers, false); }
function extractMarkdownImageMedia(source, readers) { return buildMarkdownImageContent(source, readers, true); }

module.exports = Object.freeze({ markdownImageContent, extractMarkdownImageMedia, literalAlt, MAX_NODES });
