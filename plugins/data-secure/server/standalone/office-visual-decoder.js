'use strict';

// Offline, byte-only graphic adapter for the already-authorized Office media
// path. It performs no source/file/network reads. The isolated worker supplies
// its approved Canvas API, immutable bundled fonts and CLOSED module loader.
// Each yielded unit is a separately identified frame/page, or an explicit
// omission. Never present first-frame-only decoding as a complete animation.
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { readXml, assertXmlCharacters } = require('../xml-reader');
const { MAX_PIXELS, MAX_IMAGE_BYTES } = require('../images/common');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { decodeTiffLzw, decodeTiffFax } = require('./tiff-scan-codecs');
const { createEmfPlusPreflight } = require('./emfplus-preflight');
const { flattenStaticSvgStyles, assertStaticSvgPaintSemantics } = require('./office-svg-style');
const MAX_UNITS = RESOURCE_LIMITS.MAX_VISUAL_ASSETS;
const MAX_RECORDS = 10000, MAX_SVG_BYTES = 4 * 1024 * 1024;
const SVG = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';
const MODULES = Object.freeze(['emf-converter/dist/browser.js']);
const fail = code => { throw Object.assign(new Error(code), { code }); };
const damaged = () => fail('VISUAL_CONTENT_DAMAGED');
const unsupported = () => fail('VISUAL_FEATURE_UNSUPPORTED');
const checkSize = (width, height) => {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) damaged();
  if (width * height > MAX_PIXELS || width > 32768 || height > 32768) fail('VISUAL_PROCESSING_LIMIT');
};
function input(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) damaged();
  if (bytes.length > MAX_IMAGE_BYTES) fail('VISUAL_PROCESSING_LIMIT');
}
function xmlDecode(value) {
  if (/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/u.test(value)) damaged();
  const result = value.replace(/&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/gu, token => {
    const fixed = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (Object.hasOwn(fixed, token)) return fixed[token];
    const cp = token.startsWith('&#x') ? Number.parseInt(token.slice(3, -1), 16) : Number(token.slice(2, -1));
    if (!Number.isSafeInteger(cp) || cp < 1 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) damaged();
    return String.fromCodePoint(cp);
  });
  assertXmlCharacters(result, () => Object.assign(new Error('VISUAL_CONTENT_DAMAGED'), { code: 'VISUAL_CONTENT_DAMAGED' }));
  return result;
}

function pathTokens(value) {
  if (!value.trim()) return 0;
  const arities = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  const token = /[MLHVCSQTAZmlhvcsqtaz]|[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?/y;
  let cursor = 0, count = 0, command = null, values = 0, first = true;
  const finish = () => { if (command && (values < arities[command] || values % arities[command])) damaged(); };
  while (cursor < value.length) {
    while (/[ ,\t\r\n]/u.test(value[cursor] || '') && cursor < value.length) cursor++;
    if (cursor === value.length) break;
    token.lastIndex = cursor; const match = token.exec(value); if (!match) unsupported(); cursor = token.lastIndex;
    if (++count > 100000) fail('VISUAL_PROCESSING_LIMIT');
    if (/^[A-Za-z]$/u.test(match[0])) {
      finish(); command = match[0].toUpperCase(); values = 0;
      if (first && command !== 'M') damaged(); first = false;
      if (command === 'Z') command = null;
    } else {
      if (!command) damaged();
      const number = Number(match[0]); if (!Number.isFinite(number) || Math.abs(number) > 1000000000) fail('VISUAL_PROCESSING_LIMIT');
      if (command === 'A' && [3, 4].includes(values % 7) && ![0, 1].includes(number)) damaged();
      values++;
    }
  }
  finish(); return count;
}

function numericList(value) {
  const number = /[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?/y;
  let cursor = 0; const result = [];
  while (cursor < value.length) {
    while (cursor < value.length && /[ ,\t\r\n]/u.test(value[cursor])) cursor++;
    if (cursor === value.length) break;
    number.lastIndex = cursor; const match = number.exec(value); if (!match) unsupported(); cursor = number.lastIndex;
    const n = Number(match[0]); if (!Number.isFinite(n) || Math.abs(n) > 1000000000) fail('VISUAL_PROCESSING_LIMIT');
    result.push(n); if (result.length > 100000) fail('VISUAL_PROCESSING_LIMIT');
  }
  return result;
}
function transformTokens(value) {
  let cursor = 0, count = 0;
  const expression = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)/y;
  while (cursor < value.length) {
    while (cursor < value.length && /[ ,\t\r\n]/u.test(value[cursor])) cursor++;
    if (cursor === value.length) break;
    expression.lastIndex = cursor; const match = expression.exec(value); if (!match) unsupported(); cursor = expression.lastIndex;
    const numbers = numericList(match[2]), counts = { matrix: [6], translate: [1, 2], scale: [1, 2], rotate: [1, 3], skewX: [1], skewY: [1] };
    if (!counts[match[1]].includes(numbers.length)) damaged(); count += numbers.length;
  }
  return count;
}

function inspectSvg(bytes) {
  if (bytes.length > MAX_SVG_BYTES) fail('VISUAL_PROCESSING_LIMIT');
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { damaged(); }
  // No entity/DTD/processing-instruction resolver, CSS escapes/imports, scripts,
  // foreignObject, filters or animation. Internal references are closed below.
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/iu.test(source)) unsupported();
  const elements = new Set(['svg', 'g', 'defs', 'style', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse', 'line',
    'polyline', 'polygon', 'text', 'tspan', 'textPath', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'use']);
  const ids = new Set(), refs = [], edges = new Map(), sizes = new Map();
  let width, height, nodes = 0, hasText = false, hasStylesheet = false, drawingTokens = 0;
  const xmlError = limit => Object.assign(new Error(limit ? 'VISUAL_PROCESSING_LIMIT' : 'VISUAL_CONTENT_DAMAGED'),
    { code: limit ? 'VISUAL_PROCESSING_LIMIT' : 'VISUAL_CONTENT_DAMAGED' });
  const root = readXml(source, { decode: xmlDecode, error: xmlError, start(node) {
    if (++nodes > MAX_RECORDS) fail('VISUAL_PROCESSING_LIMIT');
    if (node.namespaceURI !== SVG || !elements.has(node.localName)) unsupported();
    if (!node.parent && node.localName !== 'svg') damaged();
    if (node.localName === 'style') hasStylesheet = true;
    const get = name => node.attributes.get(`{}${name}`);
    const id = get('id');
    if (id !== undefined) {
      if (!/^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/u.test(id) || ids.has(id)) damaged();
      ids.add(id);
    }
    for (let owner = node; owner; owner = owner.parent) {
      const ownerId = owner.attributes.get('{}id');
      if (ownerId) sizes.set(ownerId, (sizes.get(ownerId) || 0) + 1);
    }
    if (['text', 'tspan', 'textPath'].includes(node.localName)) hasText = true;
    for (const [key, value] of node.attributes) {
      const local = key.slice(key.indexOf('}') + 1), ns = key.slice(1, key.indexOf('}'));
      if ((ns && ![XLINK, 'http://www.w3.org/XML/1998/namespace'].includes(ns)) ||
          /^on/iu.test(local) || ['filter', 'cursor', 'base'].includes(local) || /[\\@]|\/\*|!\s*important/iu.test(value)) unsupported();
      if (local === 'd') drawingTokens += pathTokens(value);
      if (local === 'points') { const numbers = numericList(value); if (numbers.length % 2) damaged(); drawingTokens += numbers.length; }
      if (['transform', 'gradientTransform', 'patternTransform'].includes(local)) drawingTokens += transformTokens(value);
      if (local === 'stroke-dasharray' && value !== 'none') { const numbers = numericList(value); if (numbers.some(n => n < 0)) damaged(); drawingTokens += numbers.length; }
      if (drawingTokens > 100000) fail('VISUAL_PROCESSING_LIMIT');
      const references = [];
      if (local === 'href') {
        if (!/^#[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/u.test(value)) fail('VISUAL_EXTERNAL_REFERENCE');
        references.push(value.slice(1));
      }
      for (const match of value.matchAll(/url\(([^)]*)\)/giu)) {
        const target = match[1].trim().replace(/^(['"])(.*)\1$/u, '$2');
        if (!/^#[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/u.test(target)) fail('VISUAL_EXTERNAL_REFERENCE');
        references.push(target.slice(1));
      }
      if (/url\s*\(/iu.test(value) && !/url\(/iu.test(value)) unsupported();
      for (const ref of references) {
        refs.push(ref);
        if (refs.length > MAX_RECORDS) fail('VISUAL_PROCESSING_LIMIT');
        // A reference inside a named definition can recursively instantiate
        // its ancestors too. Include every owning id, not only this node's id.
        for (let owner = node; owner; owner = owner.parent) {
          const ownerId = owner.attributes.get('{}id');
          if (ownerId) { if (!edges.has(ownerId)) edges.set(ownerId, []); edges.get(ownerId).push(ref); }
        }
      }
    }
    if (!node.parent) {
      const dimension = value => {
        const match = typeof value === 'string' && /^([0-9]+(?:\.[0-9]+)?)(?:px)?$/u.exec(value);
        return match ? Math.ceil(Number(match[1])) : null;
      };
      width = dimension(get('width')); height = dimension(get('height'));
      if (!width || !height) {
        const viewBox = get('viewBox')?.trim().split(/[ ,]+/u).map(Number);
        if (!Array.isArray(viewBox) || viewBox.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) unsupported();
        // Percent/physical dimensions are not silently replaced by viewBox.
        if (get('width') !== undefined || get('height') !== undefined) unsupported();
        width = Math.ceil(viewBox[2]); height = Math.ceil(viewBox[3]);
      }
      checkSize(width, height);
    }
  } });
  if (root.localName !== 'svg' || refs.some(ref => !ids.has(ref))) damaged();
  const costs = new Map(); let graphOperations = 0;
  const visit = (id, path) => {
    if (++graphOperations > MAX_RECORDS * 4) fail('VISUAL_PROCESSING_LIMIT');
    if (path.has(id)) unsupported();
    if (path.size >= 32) fail('VISUAL_PROCESSING_LIMIT');
    if (costs.has(id)) return costs.get(id);
    let cost = sizes.get(id) || 1;
    for (const ref of edges.get(id) || []) {
      cost += visit(ref, new Set([...path, id]));
      if (cost > MAX_RECORDS) fail('VISUAL_PROCESSING_LIMIT');
    }
    costs.set(id, cost); return cost;
  };
  for (const id of edges.keys()) visit(id, new Set());
  let expanded = nodes;
  for (const ref of refs) { expanded += costs.get(ref) || sizes.get(ref) || 1; if (expanded > MAX_RECORDS) fail('VISUAL_PROCESSING_LIMIT'); }
  // Embedded sheets are compiled to a closed paint-only subset before any
  // Canvas call. No stylesheet or source-selected font is newly delegated to
  // the native renderer. SVGs without a sheet retain their existing contract.
  if (hasStylesheet) source = flattenStaticSvgStyles(source, { readXml, decode: xmlDecode, error: xmlError });
  assertStaticSvgPaintSemantics(source, { readXml, decode: xmlDecode, error: xmlError });
  // Actual text nodes are collected by the same strict XML parser, not a tag
  // regex that could confuse XML entities, escaped text and attributes.
  let visibleText = '';
  readXml(source, { decode: xmlDecode, error: xmlError, text(value, node) {
    for (let owner = node; owner; owner = owner.parent) if (['text', 'tspan', 'textPath'].includes(owner.localName)) {
      visibleText += value; break;
    }
  } });
  return { width, height, source, hasText, visibleText };
}

function inspectWebp(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP' ||
      bytes.readUInt32LE(4) + 8 !== bytes.length) damaged();
  let cursor = 12, chunks = 0, width, height, canvasWidth, canvasHeight, images = 0;
  while (cursor < bytes.length) {
    if (++chunks > MAX_RECORDS || cursor + 8 > bytes.length) damaged();
    const type = bytes.toString('ascii', cursor, cursor + 4), size = bytes.readUInt32LE(cursor + 4), start = cursor + 8;
    if (start + size + (size & 1) > bytes.length) damaged();
    if (type === 'ANIM' || type === 'ANMF') fail('VISUAL_ANIMATION_UNSUPPORTED');
    if (type === 'VP8X') {
      if (size !== 10) damaged();
      if (bytes[start] & 2) fail('VISUAL_ANIMATION_UNSUPPORTED');
      canvasWidth = 1 + bytes.readUIntLE(start + 4, 3); canvasHeight = 1 + bytes.readUIntLE(start + 7, 3);
      checkSize(canvasWidth, canvasHeight);
    } else if (type === 'VP8L') {
      if (++images !== 1 || size < 5 || bytes[start] !== 0x2f) damaged();
      const bits = bytes.readUInt32LE(start + 1);
      if (bits >>> 29) unsupported();
      width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (type === 'VP8 ') {
      if (++images !== 1 || size < 10 || bytes.toString('hex', start + 3, start + 6) !== '9d012a') damaged();
      width = bytes.readUInt16LE(start + 6) & 0x3fff; height = bytes.readUInt16LE(start + 8) & 0x3fff;
    } else if (!['ALPH', 'ICCP', 'EXIF', 'XMP '].includes(type)) unsupported();
    cursor = start + size + (size & 1);
  }
  checkSize(width, height);
  if (images !== 1 || (canvasWidth !== undefined && (width !== canvasWidth || height !== canvasHeight))) damaged();
  return { width, height };
}

function inspectGif(bytes) {
  if (bytes.length < 14 || !['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) damaged();
  const width = bytes.readUInt16LE(6), height = bytes.readUInt16LE(8); checkSize(width, height);
  let cursor = 13, operations = 0, control = null;
  const palette = entries => {
    const size = entries * 3; if (cursor + size > bytes.length) damaged();
    const value = bytes.subarray(cursor, cursor + size); cursor += size; return value;
  };
  const globalPalette = bytes[10] & 128 ? palette(1 << ((bytes[10] & 7) + 1)) : null;
  const subBlocks = () => {
    const chunks = []; let size = 0;
    while (cursor < bytes.length) {
      const length = bytes[cursor++]; if (!length) return Buffer.concat(chunks, size);
      if (++operations > MAX_RECORDS) fail('VISUAL_PROCESSING_LIMIT');
      if (cursor + length > bytes.length) damaged();
      chunks.push(bytes.subarray(cursor, cursor + length)); size += length; cursor += length;
    }
    damaged();
  };
  const frames = [];
  while (cursor < bytes.length) {
    if (++operations > MAX_RECORDS) fail('VISUAL_PROCESSING_LIMIT');
    const marker = bytes[cursor++];
    if (marker === 0x3b) {
      if (cursor !== bytes.length || !frames.length) damaged();
      return { width, height, frames, globalPalette, background: bytes[11] };
    }
    if (marker === 0x21) {
      const extension = bytes[cursor++];
      if (extension === 0xf9) {
        if (control || cursor + 6 > bytes.length || bytes[cursor] !== 4 || bytes[cursor + 5] !== 0) damaged();
        const flags = bytes[cursor + 1], disposal = (flags >> 2) & 7;
        if (disposal > 3 || (flags & 2)) unsupported(); // user-input flag is not auto-play content
        control = { disposal, transparent: flags & 1 ? bytes[cursor + 4] : null }; cursor += 6;
      } else if ([0xfe, 0xff].includes(extension)) subBlocks();
      else unsupported(); // PlainText is meaningful content, not an ignorable comment.
      continue;
    }
    if (marker !== 0x2c || cursor + 9 > bytes.length) damaged();
    const frame = { left: bytes.readUInt16LE(cursor), top: bytes.readUInt16LE(cursor + 2),
      width: bytes.readUInt16LE(cursor + 4), height: bytes.readUInt16LE(cursor + 6),
      ...(control || { disposal: 0, transparent: null }), interlaced: Boolean(bytes[cursor + 8] & 64) };
    const flags = bytes[cursor + 8]; cursor += 9;
    checkSize(frame.width, frame.height);
    if (frame.left + frame.width > width || frame.top + frame.height > height) damaged();
    frame.palette = flags & 128 ? palette(1 << ((flags & 7) + 1)) : globalPalette;
    if (!frame.palette || (frame.transparent !== null && frame.transparent * 3 >= frame.palette.length)) damaged();
    frame.minCodeSize = bytes[cursor++];
    if (frame.minCodeSize < 2 || frame.minCodeSize > 8) damaged();
    frame.data = subBlocks(); frames.push(frame); control = null;
    if (frames.length > MAX_UNITS) fail('VISUAL_PROCESSING_LIMIT');
  }
  damaged();
}

// Strict bounded GIF LZW. Unlike permissive decoders, truncated streams are not
// padded with invented black/zero pixels. Every output index must be supplied
// before EOI. No output-growing Array or unbounded dictionary strings.
function gifPixels(frame) {
  const expected = frame.width * frame.height, output = new Uint8Array(expected);
  const prefix = new Uint16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
  const clear = 1 << frame.minCodeSize, end = clear + 1;
  let next = end + 1, bits = frame.minCodeSize + 1, bit = 0, previous = -1, first = 0, written = 0, ended = false;
  const read = () => {
    if (bit + bits > frame.data.length * 8) damaged();
    let value = 0;
    for (let shift = 0; shift < bits; shift++, bit++) value |= ((frame.data[bit >> 3] >> (bit & 7)) & 1) << shift;
    return value;
  };
  for (let i = 0; i < clear; i++) suffix[i] = i;
  let codes = 0;
  while (bit < frame.data.length * 8) {
    if (++codes > frame.data.length * 8) damaged();
    let code = read();
    if (code === clear) { next = end + 1; bits = frame.minCodeSize + 1; previous = -1; continue; }
    if (code === end) { ended = true; break; }
    if (code > next || (code === next && previous < 0)) damaged();
    const original = code; let length = 0;
    if (code === next) { stack[length++] = first; code = previous; }
    while (code >= clear) {
      if (code >= next || length >= 4096) damaged();
      stack[length++] = suffix[code]; code = prefix[code];
    }
    first = suffix[code]; stack[length++] = first;
    if (written + length > expected) damaged();
    while (length) output[written++] = stack[--length];
    if (previous >= 0 && next < 4096) {
      prefix[next] = previous; suffix[next] = first; next++;
      if (next === (1 << bits) && bits < 12) bits++;
    }
    previous = original;
  }
  if (!ended || written !== expected) damaged();
  if (!frame.interlaced) return output;
  const deinterlaced = new Uint8Array(expected); let row = 0;
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = start; y < frame.height; y += step) {
    deinterlaced.set(output.subarray(row * frame.width, ++row * frame.width), y * frame.width);
  }
  output.fill(0); return deinterlaced;
}

function inspectTiff(bytes) {
  if (bytes.length < 8) damaged();
  const little = bytes.toString('ascii', 0, 2) === 'II';
  if (!little && bytes.toString('ascii', 0, 2) !== 'MM') damaged();
  const u16 = offset => { if (offset < 0 || offset + 2 > bytes.length) damaged(); return little ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset); };
  const u32 = offset => { if (offset < 0 || offset + 4 > bytes.length) damaged(); return little ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset); };
  if (u16(2) !== 42) unsupported(); // BigTIFF is a distinct offset/count model.
  let offset = u32(4), valuesSeen = 0; const seen = new Set(), pages = [];
  while (offset) {
    if (seen.has(offset)) damaged(); seen.add(offset);
    if (pages.length >= MAX_UNITS) fail('VISUAL_PROCESSING_LIMIT');
    const count = u16(offset); if (count > 256 || offset + 2 + count * 12 + 4 > bytes.length) damaged();
    const tags = new Map();
    for (let index = 0; index < count; index++) {
      const entry = offset + 2 + index * 12, tag = u16(entry), type = u16(entry + 2), n = u32(entry + 4);
      if (tags.has(tag)) damaged();
      if ([266, 274].includes(tag) && type !== 3) unsupported(); // FillOrder/Orientation are SHORTs, not unrelated metadata.
      if ([292, 293].includes(tag) && type !== 4) unsupported(); // T4/T6 options are LONG bitfields.
      if (![1, 3, 4].includes(type)) {
        if ([256, 257, 258, 259, 262, 266, 273, 274, 277, 278, 279, 284, 292, 293, 317, 320, 322, 323, 324, 325, 330, 338, 339].includes(tag)) unsupported();
        continue; // unrelated rational/string metadata never reaches a decoder
      }
      const size = type === 1 ? 1 : type === 3 ? 2 : 4;
      valuesSeen += n;
      if (n > 65536 || valuesSeen > 65536 || n * size > bytes.length) fail('VISUAL_PROCESSING_LIMIT');
      const position = n * size <= 4 ? entry + 8 : u32(entry + 8);
      if (position + n * size > bytes.length) damaged();
      tags.set(tag, Array.from({ length: n }, (_, i) => size === 1 ? bytes[position + i] : size === 2 ? u16(position + i * size) : u32(position + i * size)));
    }
    const scalar = (tag, fallback) => tags.has(tag) ? tags.get(tag).length === 1 ? tags.get(tag)[0] : damaged() : fallback;
    const width = scalar(256), height = scalar(257); checkSize(width, height);
    const page = { width, height, little, tags, bits: tags.get(258) || [1], compression: scalar(259, 1), photo: scalar(262, 0),
      samples: scalar(277, 1), rows: scalar(278, height), predictor: scalar(317, 1), fillOrder: scalar(266, 1),
      orientation: scalar(274, 1), t4: scalar(292, 0), t6: scalar(293, 0) };
    page.outputWidth = page.orientation >= 5 ? height : width;
    page.outputHeight = page.orientation >= 5 ? width : height;
    const depths = new Set(page.bits);
    page.bits = page.bits[0];
    if (depths.size !== 1 || ![1, 8].includes(page.bits) || ![0, 1, 2, 3].includes(page.photo) ||
        ![1, 2, 3, 4, 5, 8, 32946, 32773].includes(page.compression) || ![1, 2, 3, 4, 5, 6, 7, 8].includes(page.orientation) || scalar(284, 1) !== 1 ||
        scalar(339, 1) !== 1 || tags.has(322) || tags.has(323) || tags.has(324) || tags.has(330) ||
        ![1, 2].includes(page.predictor) || (page.predictor === 2 && page.bits !== 8) ||
        ![1, 2].includes(page.fillOrder) || (page.fillOrder === 2 && (page.bits !== 1 || ![1, 2, 3, 4].includes(page.compression))) ||
        (page.photo === 2 ? ![3, 4].includes(page.samples) || page.bits !== 8 : ![1, 2].includes(page.samples)) ||
        (page.photo === 3 && page.samples !== 1) || (page.samples === 2 && page.bits !== 8)) page.omission_code = 'VISUAL_FEATURE_UNSUPPORTED';
    if ([2, 3, 4].includes(page.compression) && (page.bits !== 1 || page.samples !== 1 || ![0, 1].includes(page.photo) ||
        page.predictor !== 1 || ![0, 1, 4, 5].includes(page.t4) || page.t6 !== 0)) page.omission_code = 'VISUAL_FEATURE_UNSUPPORTED';
    if (page.samples === 2 || page.samples === 4) {
      const extra = scalar(338); if (![1, 2].includes(extra)) page.omission_code = 'VISUAL_FEATURE_UNSUPPORTED';
      page.associated = extra === 1;
    }
    if (!Number.isSafeInteger(page.rows) || page.rows < 1) damaged();
    const strips = tags.get(273), lengths = tags.get(279);
    if (!strips || !lengths || strips.length !== Math.ceil(height / page.rows) || strips.length !== lengths.length) damaged();
    for (let i = 0; i < strips.length; i++) if (!lengths[i] || strips[i] + lengths[i] > bytes.length) damaged();
    if (page.photo === 3 && tags.get(320)?.length !== 3 * (1 << page.bits)) damaged();
    pages.push(page); offset = u32(offset + 2 + count * 12);
  }
  if (!pages.length) damaged(); return { pages };
}

function packbits(bytes, size) {
  const out = Buffer.alloc(size); let input = 0, output = 0;
  while (input < bytes.length) {
    const n = bytes.readInt8(input++);
    if (n >= 0) {
      const count = n + 1;
      if (input + count > bytes.length || output + count > size) damaged();
      bytes.copy(out, output, input, input + count); input += count; output += count;
    } else if (n !== -128) {
      const count = 1 - n;
      if (input >= bytes.length || output + count > size) damaged();
      out.fill(bytes[input++], output, output + count); output += count;
    }
  }
  if (output !== size) damaged(); return out;
}
function tiffPixels(bytes, page) {
  const { width, height, bits, samples, tags } = page;
  const rowBytes = Math.ceil(width * samples * bits / 8), strips = tags.get(273), lengths = tags.get(279);
  const raw = Buffer.alloc(rowBytes * height), rgba = new Uint8ClampedArray(width * height * 4);
  try {
    for (let i = 0; i < strips.length; i++) {
      const startRow = i * page.rows, expected = Math.min(page.rows, height - startRow) * rowBytes;
      const compressed = bytes.subarray(strips[i], strips[i] + lengths[i]); let decoded;
      try {
        if (page.compression === 1) decoded = compressed;
        else if (page.compression === 5) decoded = decodeTiffLzw(compressed, expected);
        else if ([2, 3, 4].includes(page.compression)) decoded = decodeTiffFax(compressed, width, Math.min(page.rows, height - startRow), page);
        else if (page.compression === 32773) decoded = packbits(compressed, expected);
        else decoded = zlib.inflateSync(compressed, { maxOutputLength: expected });
        if (decoded.length !== expected) damaged(); decoded.copy(raw, startRow * rowBytes);
      } catch (cause) {
        if (cause?.code === 'ERR_BUFFER_TOO_LARGE') fail('VISUAL_PROCESSING_LIMIT');
        if (cause?.code?.startsWith('VISUAL_')) throw cause; damaged();
      } finally { if (decoded && decoded !== compressed) decoded.fill(0); }
    }
    if (page.predictor === 2) for (let y = 0; y < height; y++) for (let x = samples; x < rowBytes; x++) {
      raw[y * rowBytes + x] = (raw[y * rowBytes + x] + raw[y * rowBytes + x - samples]) & 255;
    }
    const colors = tags.get(320), paletteSize = 1 << bits;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const orientation = page.orientation || 1;
      const dx = orientation === 2 || orientation === 3 ? width - 1 - x : orientation === 5 || orientation === 8 ? y : orientation === 6 || orientation === 7 ? height - 1 - y : x;
      const dy = orientation === 3 || orientation === 4 ? height - 1 - y : orientation === 5 || orientation === 6 ? x : orientation === 7 || orientation === 8 ? width - 1 - x : y;
      const pixel = (dy * page.outputWidth + dx) * 4, source = y * rowBytes + x * samples;
      // TIFF FillOrder2 places the earliest uncompressed bilevel column in
      // the low bit. Do not guess bit order for other sample/compression
      // models (TIFF6 recommends only uncompressed or CCITT for FillOrder2).
      const value = bits === 1 ? (raw[y * rowBytes + (x >> 3)] >> (page.fillOrder === 2 && page.compression === 1 ? (x & 7) : 7 - (x & 7))) & 1 : raw[source];
      const alpha = [2, 4].includes(samples) ? raw[source + samples - 1] : 255;
      const channel = value => page.associated && alpha ? Math.min(255, Math.round(value * 255 / alpha)) : value;
      if (page.photo === 2) for (let c = 0; c < 3; c++) rgba[pixel + c] = channel(raw[source + c]);
      else if (page.photo === 3) for (let c = 0; c < 3; c++) rgba[pixel + c] = Math.round(colors[value + c * paletteSize] / 257);
      else {
        const gray = bits === 1 ? value * 255 : value;
        rgba[pixel] = rgba[pixel + 1] = rgba[pixel + 2] = channel(page.photo === 0 ? 255 - gray : gray);
      }
      rgba[pixel + 3] = alpha;
    }
    return rgba;
  } catch (error) {
    rgba.fill(0); throw error;
  } finally { raw.fill(0); }
}

// Closed GDI/EMF+ subsets only. Unknown records and effects/escapes are not passed
// to upstream's permissive replay (which otherwise warns and returns a picture).
const EMF_RECORDS = new Map([[1, 88], [14, 20], [9, 16], [10, 16], [11, 16], [12, 16], [17, 12], [18, 12],
  [19, 12], [20, 12], [21, 12], [22, 12], [24, 12], [25, 12], [27, 16], [33, 8], [34, 12],
  [35, 32], [36, 36], [37, 12], [38, 28], [39, 24], [40, 12], [42, 24], [43, 24], [54, 16],
  [59, 8], [60, 8], [61, 8], [62, 24], [63, 24], [64, 24], [67, 12], [68, 8], [70,16], [82, 104], [84, 76]]);
const WMF_RECORDS = new Map([[0x0000, 6], [0x0102, 8], [0x0103, 8], [0x0104, 8], [0x0106, 8], [0x012e, 8],
  [0x0201, 10], [0x0209, 10], [0x020b, 10], [0x020c, 10], [0x020d, 10], [0x020e, 10],
  [0x0213, 10], [0x0214, 10], [0x0418, 14], [0x041b, 14], [0x001e, 6], [0x0127, 8],
  [0x012d, 8], [0x01f0, 8], [0x02fa, 16], [0x02fc, 14], [0x02fb, 56], [0x0521, 10]]);
function inspectMetafile(bytes, format) {
  let width, height, cursor, count = 0, hasText = false, ended = false;
  if (format === 'emf') {
    if (bytes.length < 88 || bytes.readUInt32LE(0) !== 1 || bytes.readUInt32LE(40) !== 0x464d4520 ||
        bytes.readUInt32LE(48) !== bytes.length || bytes.readUInt32LE(4) < 88) damaged();
    width = bytes.readInt32LE(16) - bytes.readInt32LE(8) + 1; height = bytes.readInt32LE(20) - bytes.readInt32LE(12) + 1;
    checkSize(width, height); cursor = 0;
    const handles = new Set(), stock = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 17]);
    let saves = 0; const plus=createEmfPlusPreflight(MAX_RECORDS);
    while (cursor < bytes.length) {
      if (++count > MAX_RECORDS || cursor + 8 > bytes.length) fail('VISUAL_PROCESSING_LIMIT');
      const type = bytes.readUInt32LE(cursor), size = bytes.readUInt32LE(cursor + 4), minimum = EMF_RECORDS.get(type);
      if (!minimum) fail(type === 70 && size >= 16 && cursor + 16 <= bytes.length && bytes.readUInt32LE(cursor + 12) === 0x2b464d45
        ? 'VISUAL_EMF_PLUS_UNSUPPORTED' : 'VISUAL_METAFILE_RECORD_UNSUPPORTED');
      if (size < minimum || size % 4 || cursor + size > bytes.length) damaged();
      if (type === 1 && cursor !== 0) damaged();
      if (plus.ended && type !== 14) unsupported();
      if (type === 70) {
        if (!plus.records && count !== 2) fail('VISUAL_EMF_PLUS_UNSUPPORTED');
        if(bytes.readUInt32LE(cursor+12)!==0x2b464d45)unsupported();
        const length=bytes.readUInt32LE(cursor+8);
        if(length<4||12+length>size||size-(12+length)>3)damaged();
        plus.accept(bytes.subarray(cursor+16,cursor+12+length));
        if(count+plus.records>MAX_RECORDS)fail('VISUAL_PROCESSING_LIMIT');
      }
      if (type === 19 && bytes.readUInt32LE(cursor + 8) !== 13) unsupported(); // no approximate ROP2 composition
      if ([35, 36].includes(type)) for (let i = 0; i < 6; i++) {
        const value = bytes.readFloatLE(cursor + 8 + i * 4); if (!Number.isFinite(value) || Math.abs(value) > 1000000) unsupported();
      }
      if ([38, 39, 82].includes(type)) {
        const handle = bytes.readUInt32LE(cursor + 8);
        if (!handle || handles.has(handle) || handle >= bytes.readUInt16LE(56)) damaged();
        handles.add(handle);
      }
      if (type === 37) {
        const handle = bytes.readUInt32LE(cursor + 8);
        if (handle & 0x80000000 ? !stock.has(handle & 0x7fffffff) : !handles.has(handle)) unsupported();
      }
      if (type === 40 && !handles.delete(bytes.readUInt32LE(cursor + 8))) damaged();
      if (type === 33 && ++saves > 128) fail('VISUAL_PROCESSING_LIMIT');
      if (type === 34) {
        const relative = bytes.readInt32LE(cursor + 8);
        if (relative >= 0 || -relative > saves) unsupported(); saves += relative;
      }
      if (type === 82 && size < 332) damaged(); // EXTLOGFONTW includes the complete family/metrics structure.
      if (type === 84) {
        hasText = true;
        const length = bytes.readUInt32LE(cursor + 44), offset = bytes.readUInt32LE(cursor + 48), dx = bytes.readUInt32LE(cursor + 72);
        const textOptions = bytes.readUInt32LE(cursor + 52), advanceBytes = length * (textOptions & 0x2000 ? 8 : 4);
        if (length > 65536 || offset < 76 || offset + length * 2 > size || (dx && (dx < 76 || dx % 4 || dx + advanceBytes > size))) damaged();
        if (textOptions & 0x10) unsupported(); // ETO_GLYPH_INDEX cannot become Unicode text by guessing.
        try { new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(cursor + offset, cursor + offset + length * 2)); } catch { damaged(); }
      }
      cursor += size;
      if (type === 14) { ended = true; break; }
    }
    if (!ended || cursor !== bytes.length || count !== bytes.readUInt32LE(52)) damaged();
    const plusState=plus.finish(); hasText ||= plusState.hasText;
  } else {
    if (bytes.length < 40 || bytes.readUInt32LE(0) !== 0x9ac6cdd7) unsupported(); // no guessed bounds for nonplaceable WMF
    let checksum = 0; for (let i = 0; i < 20; i += 2) checksum ^= bytes.readUInt16LE(i);
    if (checksum !== bytes.readUInt16LE(20) || !bytes.readUInt16LE(14) || ![1, 2].includes(bytes.readUInt16LE(22)) || bytes.readUInt16LE(24) !== 9 ||
        bytes.readUInt32LE(28) * 2 + 22 !== bytes.length) damaged();
    width = Math.ceil((bytes.readInt16LE(10) - bytes.readInt16LE(6)) * 96 / bytes.readUInt16LE(14));
    height = Math.ceil((bytes.readInt16LE(12) - bytes.readInt16LE(8)) * 96 / bytes.readUInt16LE(14)); checkSize(width, height);
    cursor = 40;
    const handles = [], handleLimit = bytes.readUInt16LE(32);
    if (handleLimit > MAX_RECORDS) fail('VISUAL_PROCESSING_LIMIT');
    while (cursor < bytes.length) {
      if (++count > MAX_RECORDS || cursor + 6 > bytes.length) fail('VISUAL_PROCESSING_LIMIT');
      const size = bytes.readUInt32LE(cursor) * 2, type = bytes.readUInt16LE(cursor + 4), minimum = WMF_RECORDS.get(type);
      if (!minimum) fail('VISUAL_METAFILE_RECORD_UNSUPPORTED');
      if (size < minimum || cursor + size > bytes.length) damaged();
      if (type === 0x0104 && bytes.readUInt16LE(cursor + 6) !== 13) unsupported();
      if ([0x02fa, 0x02fc, 0x02fb].includes(type)) {
        let handle = handles.indexOf(false); if (handle < 0) handle = handles.length;
        if (handle >= handleLimit) damaged(); handles[handle] = true;
        // ANSI/default Windows character set only; no guessed Symbol/DOS/CJK
        // encoding supplied to a different installed font collection.
        if (type === 0x02fb && ![0, 1].includes(bytes[cursor + 19])) unsupported();
      }
      if (type === 0x012d && !handles[bytes.readUInt16LE(cursor + 6)]) unsupported();
      if (type === 0x01f0) { const handle = bytes.readUInt16LE(cursor + 6); if (!handles[handle]) damaged(); handles[handle] = false; }
      if (type === 0x0521) {
        hasText = true; const length = bytes.readUInt16LE(cursor + 6);
        if (8 + length + (length & 1) + 4 > size) damaged();
      }
      cursor += size;
      if (type === 0) { ended = true; break; }
    }
    if (!ended || cursor !== bytes.length) damaged();
  }
  return { width, height, hasText };
}

function inspectOfficeVisual(bytes, format) {
  input(bytes);
  switch (format) {
    case 'svg': return inspectSvg(bytes);
    case 'gif': return inspectGif(bytes);
    case 'tif': case 'tiff': return inspectTiff(bytes);
    case 'webp': return inspectWebp(bytes);
    case 'emf': case 'wmf': return inspectMetafile(bytes, format);
    default: unsupported();
  }
}

function outputSize(width, height, limit) {
  checkSize(width, height);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PIXELS) fail('VISUAL_DECODER_POLICY');
  const scale = Math.min(1, Math.sqrt(limit / (width * height)));
  let w = Math.max(1, Math.floor(width * scale)), h = Math.max(1, Math.floor(height * scale));
  if (w * h > limit) { if (w > h) w = Math.max(1, Math.floor(limit / h)); else h = Math.max(1, Math.floor(limit / w)); }
  return { width: w, height: h, downsampled: w !== width || h !== height };
}

// Approved immutable font bytes only. Validate the Unicode cmap before a
// backend can silently select an unrelated system font for a missing glyph.
// No font interpreter, font file, system directory or document-supplied font.
function fontHasGlyph(font, cp) {
  const data = Buffer.from(font.buffer, font.byteOffset, font.byteLength);
  const u16 = offset => { if (offset < 0 || offset + 2 > data.length) fail('VISUAL_DECODER_POLICY'); return data.readUInt16BE(offset); };
  const u32 = offset => { if (offset < 0 || offset + 4 > data.length) fail('VISUAL_DECODER_POLICY'); return data.readUInt32BE(offset); };
  if (data.length < 12 || ![0x00010000, 0x4f54544f].includes(u32(0)) || u16(4) > 128) fail('VISUAL_DECODER_POLICY');
  let cmap, length;
  for (let index = 0; index < u16(4); index++) {
    const record = 12 + index * 16;
    if (record + 16 > data.length) fail('VISUAL_DECODER_POLICY');
    if (data.toString('ascii', record, record + 4) === 'cmap') { cmap = u32(record + 8); length = u32(record + 12); }
  }
  if (!cmap || !length || cmap + length > data.length || u16(cmap + 2) > 32) fail('VISUAL_DECODER_POLICY');
  for (let index = 0; index < u16(cmap + 2); index++) {
    const record = cmap + 4 + index * 8;
    const platform = u16(record), encoding = u16(record + 2);
    if (platform !== 0 && !(platform === 3 && [1, 10].includes(encoding))) continue;
    const offset = cmap + u32(record + 4), format = u16(offset);
    if (offset < cmap || offset >= cmap + length) fail('VISUAL_DECODER_POLICY');
    if (format === 12) {
      const size = u32(offset + 4), groups = u32(offset + 12);
      if (groups > 65536 || size < 16 + groups * 12 || offset + size > cmap + length) fail('VISUAL_DECODER_POLICY');
      let low = 0, high = groups - 1;
      while (low <= high) {
        const middle = (low + high) >>> 1, group = offset + 16 + middle * 12, start = u32(group), end = u32(group + 4);
        if (cp < start) high = middle - 1;
        else if (cp > end) low = middle + 1;
        else if (u32(group + 8) + cp - start !== 0) return true; else break;
      }
    } else if (format === 4 && cp <= 0xffff) {
      const size = u16(offset + 2), segments = u16(offset + 6) / 2;
      if (!Number.isInteger(segments) || segments < 1 || segments > 8192 || size < 16 + segments * 8 || offset + size > cmap + length) fail('VISUAL_DECODER_POLICY');
      const ends = offset + 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, ranges = deltas + segments * 2;
      for (let segment = 0; segment < segments; segment++) {
        if (cp < u16(starts + segment * 2) || cp > u16(ends + segment * 2)) continue;
        const range = u16(ranges + segment * 2), delta = u16(deltas + segment * 2);
        if (!range) { if (((cp + delta) & 0xffff) !== 0) return true; }
        else {
          const pointer = ranges + segment * 2 + range + (cp - u16(starts + segment * 2)) * 2;
          if (pointer < offset || pointer + 2 > offset + size) fail('VISUAL_DECODER_POLICY');
          const glyph = u16(pointer); if (glyph && ((glyph + delta) & 0xffff)) return true;
        }
      }
    }
  }
  return false;
}

const registeredFonts = new WeakMap();
function registerFonts(inspected, options) {
  if (process.env.DISABLE_SYSTEM_FONTS_LOAD !== '1') fail('VISUAL_DECODER_POLICY');
  const api = options.canvasApi;
  const fontBuffers = options.fontBuffers || [];
  if (!Array.isArray(fontBuffers) || fontBuffers.length > 16 || fontBuffers.some(font => !(font instanceof Uint8Array) || !font.length) ||
      fontBuffers.reduce((sum, font) => sum + font.length, 0) > 8 * 1024 * 1024) fail('VISUAL_DECODER_POLICY');
  if (!inspected.hasText) return;
  if (!fontBuffers.length) fail('VISUAL_FONT_UNAVAILABLE');
  const codepoints = new Set([...inspected.visibleText].filter(character => !/\s/u.test(character)).map(character => character.codePointAt(0)));
  if (codepoints.size > 4096) fail('VISUAL_PROCESSING_LIMIT');
  for (const cp of codepoints) if (!fontBuffers.some(font => fontHasGlyph(font, cp))) fail('VISUAL_FONT_UNAVAILABLE');
  if (typeof api?.GlobalFonts?.register !== 'function') fail('VISUAL_DECODER_POLICY');
  const identity = crypto.createHash('sha256');
  for (const font of fontBuffers) identity.update(font);
  const hash = identity.digest('hex'), previous = registeredFonts.get(api);
  if (previous && previous !== hash) fail('VISUAL_DECODER_POLICY');
  if (!previous) {
    for (const font of fontBuffers) if (!api.GlobalFonts.register(Buffer.from(font), 'DataSecureOffice')) fail('VISUAL_FONT_UNAVAILABLE');
    // Retain only this fixed bundled family for this owned source process;
    // repeated unregister/re-register is neither needed nor safe in Canvas.
    registeredFonts.set(api, hash);
  }
}
function canvasSvgSource(inspected) {
  const parts = [], encode = value => value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
  readXml(inspected.source, { decode: xmlDecode, error: () => Object.assign(new Error('VISUAL_CONTENT_DAMAGED'), { code: 'VISUAL_CONTENT_DAMAGED' }),
    start(node) {
      const attributes = [];
      for (const [key, value] of node.attributes) {
        const ns = key.slice(1, key.indexOf('}')), local = key.slice(key.indexOf('}') + 1);
        if (local === 'font-family') continue;
        const name = ns === XLINK ? `xlink:${local}` : ns === 'http://www.w3.org/XML/1998/namespace' ? `xml:${local}` : local;
        // Every text node also receives a final CSS font-family override, so
        // source font shorthands cannot escape the explicitly registered alias.
        attributes.push(`${name}="${encode(local === 'style' && ['text', 'tspan', 'textPath'].includes(node.localName) ? value + ';font-family:DataSecureOffice' : value)}"`);
      }
      if (!node.parent) {
        attributes.push(`xmlns="${SVG}"`, `xmlns:xlink="${XLINK}"`, 'font-family="DataSecureOffice"');
        // A viewBox-only SVG can have fractional coordinate extents. Bind the
        // actual raster viewport to the already validated integer allocation;
        // otherwise this backend truncates them and the strict dimension check
        // rejects an intact graphic. Preserve the original viewBox geometry.
        if (!node.attributes.has('{}width') && !node.attributes.has('{}height')) {
          attributes.push(`width="${inspected.width}"`, `height="${inspected.height}"`);
        }
      }
      if (['text', 'tspan', 'textPath'].includes(node.localName)) {
        attributes.push('font-family="DataSecureOffice"');
        if (!node.attributes.has('{}style')) attributes.push('style="font-family:DataSecureOffice"');
      }
      parts.push(`<${node.localName}${attributes.length ? ' ' + attributes.join(' ') : ''}>`);
    }, text(value) { parts.push(encode(value)); }, end(node) { parts.push(`</${node.localName}>`); } });
  return Buffer.from(parts.join(''));
}
async function svgPng(inspected, options, limit) {
  const api = options.canvasApi;
  if (typeof api?.loadImage !== 'function' || typeof api.createCanvas !== 'function') fail('VISUAL_DECODER_POLICY');
  registerFonts(inspected, options);
  const image = await api.loadImage(canvasSvgSource(inspected));
  if (image.width !== inspected.width || image.height !== inspected.height) damaged();
  const target = outputSize(inspected.width, inspected.height, limit), canvas = api.createCanvas(target.width, target.height);
  try {
    const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = canvas.toBuffer('image/png');
    if (!png.length || png.length > MAX_IMAGE_BYTES) fail('VISUAL_PROCESSING_LIMIT');
    return { png, ...target };
  } finally { canvas.width = 1; canvas.height = 1; }
}
function rgbaPng(rgba, width, height, api, limit) {
  if (typeof api?.createCanvas !== 'function' || typeof api.ImageData !== 'function') fail('VISUAL_DECODER_POLICY');
  const target = outputSize(width, height, limit), canvas = api.createCanvas(target.width, target.height);
  const pixels = new Uint8ClampedArray(target.width * target.height * 4);
  try {
    const context = canvas.getContext('2d');
    // Bounded nearest-neighbour sampling; preserve the complete field of view,
    // never crop a late page/frame. Scaling is explicitly reported to caller.
    for (let y = 0; y < target.height; y++) for (let x = 0; x < target.width; x++) {
      const source = (Math.min(height - 1, Math.floor(y * height / target.height)) * width + Math.min(width - 1, Math.floor(x * width / target.width))) * 4;
      const i = (y * target.width + x) * 4, alpha = rgba[source + 3];
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.round((rgba[source + c] * alpha + 255 * (255 - alpha)) / 255);
      pixels[i + 3] = 255;
    }
    context.putImageData(new api.ImageData(pixels, target.width, target.height), 0, 0);
    const png = canvas.toBuffer('image/png');
    if (!png.length || png.length > MAX_IMAGE_BYTES) fail('VISUAL_PROCESSING_LIMIT');
    return { png, ...target };
  } finally { pixels.fill(0); canvas.width = 1; canvas.height = 1; }
}

async function* decodeUnits(bytes, format, options = {}) {
  const limit = options.maxOutputPixels === undefined ? MAX_PIXELS : options.maxOutputPixels;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PIXELS) fail('VISUAL_DECODER_POLICY');
  const inspected = inspectOfficeVisual(bytes, format);
  const omit = (index, total, code) => ({ index, total, omission_code: code });
  if (format === 'tif' || format === 'tiff') {
    let work = 0;
    const unitLimit = Math.floor(limit / inspected.pages.length);
    for (const [index, page] of inspected.pages.entries()) {
      const base = { width: page.outputWidth, height: page.outputHeight, index: index + 1, total: inspected.pages.length };
      if (page.omission_code) { yield omit(base.index, base.total, page.omission_code); continue; }
      work += page.width * page.height;
      if (work > MAX_PIXELS * 4 || unitLimit < 1) { yield omit(base.index, base.total, 'VISUAL_PROCESSING_LIMIT'); continue; }
      let rgba;
      try {
        try { rgba = tiffPixels(bytes, page); }
        catch (error) {
          // Only a structurally isolated page's damaged pixel stream is
          // recoverable here. Global IFD/offset validation has already run;
          // policy, resource, cancellation and backend failures remain hard.
          if (error?.code !== 'VISUAL_CONTENT_DAMAGED') throw error;
          yield omit(base.index, base.total, error.code); continue;
        }
        const result = rgbaPng(rgba, page.outputWidth, page.outputHeight, options.canvasApi, unitLimit);
        yield { ...base, ...result, warning_codes: result.downsampled ? ['VISUAL_RASTER_DOWNSAMPLED'] : [] };
      }
      finally { rgba?.fill(0); }
    }
    return;
  }
  if (format === 'gif') {
    const { width, height, frames, globalPalette, background } = inspected;
    const unitLimit = Math.floor(limit / frames.length);
    const state = new Uint8ClampedArray(width * height * 4);
    const bg = globalPalette && background * 3 < globalPalette.length ? [...globalPalette.subarray(background * 3, background * 3 + 3), 255] : [255, 255, 255, 0];
    if (frames[0].transparent === background) bg[3] = 0;
    for (let i = 0; i < state.length; i += 4) state.set(bg, i);
    try {
      for (const [index, frame] of frames.entries()) {
        if ((index + 1) * width * height > MAX_PIXELS * 4 || unitLimit < 1) { yield omit(index + 1, frames.length, 'VISUAL_PROCESSING_LIMIT'); continue; }
        const pixels = gifPixels(frame), previous = frame.disposal === 3 && index + 1 < frames.length ? new Uint8ClampedArray(frame.width * frame.height * 4) : null;
        try {
          for (let row = 0, sourceRow = 0; row < frame.height; row++, sourceRow++) for (let x = 0; x < frame.width; x++) {
            const pos = ((frame.top + row) * width + frame.left + x) * 4, p = sourceRow * frame.width + x, color = pixels[p];
            if (previous) previous.set(state.subarray(pos, pos + 4), p * 4);
            if (color * 3 + 2 >= frame.palette.length) damaged();
            if (color !== frame.transparent) { state.set(frame.palette.subarray(color * 3, color * 3 + 3), pos); state[pos + 3] = 255; }
          }
          const result = rgbaPng(state, width, height, options.canvasApi, unitLimit);
          yield { ...result, index: index + 1, total: frames.length,
            warning_codes: result.downsampled ? ['VISUAL_RASTER_DOWNSAMPLED'] : [] };
          if (frame.disposal === 2 || previous) for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
            const pos = ((frame.top + y) * width + frame.left + x) * 4, p = (y * frame.width + x) * 4;
            state.set(previous ? previous.subarray(p, p + 4) : bg, pos);
          }
        } finally { pixels.fill(0); previous?.fill(0); }
      }
    } finally { state.fill(0); }
    return;
  }
  if (format === 'webp') {
    const api = options.canvasApi;
    if (typeof api?.loadImage !== 'function' || typeof api.createCanvas !== 'function') fail('VISUAL_DECODER_POLICY');
    // Only a preflighted static RIFF byte buffer reaches the approved existing
    // canvas backend; never SVG, a filename, URL or native decoder plug-in path.
    const image = await api.loadImage(bytes);
    if (image.width !== inspected.width || image.height !== inspected.height) damaged();
    const target = outputSize(inspected.width, inspected.height, limit), canvas = api.createCanvas(target.width, target.height);
    try {
      const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const png = canvas.toBuffer('image/png'); if (png.length > MAX_IMAGE_BYTES) fail('VISUAL_PROCESSING_LIMIT');
      yield { png, ...target, index: 1, total: 1, warning_codes: target.downsampled ? ['VISUAL_RASTER_DOWNSAMPLED'] : [] };
    } finally { canvas.width = 1; canvas.height = 1; }
    return;
  }
  let svg = inspected;
  if (format === 'emf' || format === 'wmf') {
    if (typeof options.loadBundledModule !== 'function') fail('VISUAL_DECODER_POLICY');
    const api = await options.loadBundledModule(MODULES[0]);
    if (typeof api?.convertMetafileToSvg !== 'function') fail('VISUAL_DECODER_POLICY');
    // SVG-only does not require/import the ^1.0.9 canvas peer. Bitmap, nested
    // metafile, escape and unknown records never pass the closed preflight.
    const source = await api.convertMetafileToSvg(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      { maxWidth: inspected.width, maxHeight: inspected.height, maxCanvasDimension: Math.max(inspected.width, inspected.height),
        dpiScale: 1, maxRecords: MAX_RECORDS + 1, exactRasterOps: false, gdiAntialias: true, includeSize: true, idPrefix: 'datasecure-' });
    if (typeof source !== 'string' || !source) damaged();
    svg = inspectSvg(Buffer.from(source));
  }
  const result = await svgPng(svg, options, limit);
  yield { ...result, index: 1, total: 1,
    warning_codes: [...(svg.hasText ? ['VISUAL_BUNDLED_FONT_SUBSTITUTION'] : []), ...(result.downsampled ? ['VISUAL_RASTER_DOWNSAMPLED'] : [])] };
}

async function* decodeOfficeVisual(bytes, format, options = {}) {
  try { yield* decodeUnits(bytes, format, options); }
  catch (error) {
    if (typeof error?.code === 'string' && /^(?:VISUAL_[A-Z_]+|REQUEST_CANCELLED|REQUEST_TIMEOUT)$/u.test(error.code)) throw error;
    // Decoder internals or caller-supplied backend errors never become raw
    // filesystem paths, native diagnostics or source fragments in a result.
    damaged();
  }
}

module.exports = Object.freeze({ inspectOfficeVisual, decodeOfficeVisual,
  graphicsDecoderContract: Object.freeze({ module_ids: MODULES, wasm_ids: [],
    max_bytes: MAX_IMAGE_BYTES, max_pixels: MAX_PIXELS, max_units: MAX_UNITS, max_records: MAX_RECORDS,
    no_network: true, no_filesystem: true, no_new_native_graphics_addon: true,
    canvas_version: '1.0.7', required_environment: { DISABLE_SYSTEM_FONTS_LOAD: '1' },
    font_limit: 'injected-bundled-alias; existing Canvas may initialize fixed OS system-font manager' }) });
