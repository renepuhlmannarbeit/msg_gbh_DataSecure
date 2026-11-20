'use strict';

const { isContactLine } = require('./ocr-quality');
const { createHash } = require('node:crypto');

const MAX_PREFIX_OPERATORS = 192;
const MAX_PATH_VALUES = 2048;
const MAX_DOCUMENT_GROUPS = 256;
const MAX_REPLAY_PIXELS = 2_500_000;
const MAX_WORD_PIXELS = 50_000;
const MAX_CHECKED_PIXELS = 250_000;

const near = (a, b) => Math.abs(a - b) <= 0.001;
const boundedPath = box => box?.length === 4 && box.every(Number.isFinite) && box[2] > box[0] && box[3] > box[1];

function whitePagePath(path, box, pageBox) {
  if (!boundedPath(box) || !boundedPath(pageBox) || !box.every((n, i) => near(n, pageBox[i]))) return false;
  const [left, bottom, right, top] = box;
  const expected = [0, left, bottom, 1, right, bottom, 1, right, top, 1, left, top, 4];
  return path?.length === expected.length && path.every((n, i) => near(n, expected[i]));
}

// This observer records only a bounded prefix of the actual display list.
// PDF.js lazily replaces raw path arrays with Path2D as it executes them.
function observePdfArtifactPrefix(ops) {
  let list, depth = 0, stopped = false;
  const prefix = [];
  return {
    observe(value, index) {
      if (index === 0 && list === undefined) list = value;
      if (stopped || list !== value || index !== prefix.length || index >= MAX_PREFIX_OPERATORS) return;
      const operation = value.fnArray[index];
      const args = value.argsArray[index];
      const artifact = operation === ops.beginMarkedContent && args?.[0]?.name === 'Artifact';
      if (depth === 0 && !artifact) { stopped = true; return; }
      if (artifact) depth++;
      if (operation === ops.endMarkedContent) depth--;
      if (operation === ops.constructPath) {
        const path = args?.[1]?.[0];
        prefix.push({ operation, kind: args?.[0], box: args?.[2]?.length === 4 ? Array.from(args[2]) : null,
          path: path?.length > 0 && path.length <= MAX_PATH_VALUES ? Array.from(path) : null });
      } else if (operation === ops.setGState) {
        const states = args?.[0];
        const normal = Array.isArray(states) && states.length === 2 &&
          states.some(state => state?.length === 2 && state[0] === 'BM' && state[1] === 'source-over') &&
          states.some(state => state?.length === 2 && state[0] === 'ca' && state[1] === 1);
        prefix.push({ operation, normal });
      } else prefix.push({ operation, value: operation === ops.beginMarkedContent ? args?.[0]?.name :
        operation === ops.setFillRGBColor ? args?.[0] : undefined });
    },
    plan(viewport, priorGroups) {
      const plan = artifactPlan(prefix, ops, viewport, priorGroups);
      return plan && { ...plan, list };
    }
  };
}

function artifactPlan(prefix, ops, viewport, priorGroups) {
  const groups = [];
  let next = 0;
  // Only closed leading, explicitly marked groups. One balanced q..Q scope
  // per solid fill, with no text, images, transforms, references or effects.
  while (prefix[next]?.operation === ops.beginMarkedContent && prefix[next].value === 'Artifact') {
    let depth = 0;
    const fills = [];
    do {
      const item = prefix[next];
      if (!item) return null;
      if (item.operation === ops.beginMarkedContent && item.value === 'Artifact') { depth++; next++; continue; }
      if (item.operation === ops.endMarkedContent) { depth--; next++; continue; }
      if (item.operation !== ops.save) return null;
      const start = next++;
      let clip = null;
      if ([ops.clip, ops.eoClip].includes(prefix[next]?.operation)) {
        const operation = prefix[next++].operation;
        const path = prefix[next++];
        if (path?.operation !== ops.constructPath || path.kind !== ops.endPath || !path.path?.every(Number.isFinite)) return null;
        clip = [operation, path.path];
      }
      const state = prefix[next]?.operation === ops.setGState ? prefix[next++] : null;
      const color = prefix[next++], fill = prefix[next++];
      if (color?.operation !== ops.setFillRGBColor || typeof color.value !== 'string' || !/^#[0-9a-f]{6}$/iu.test(color.value) ||
          fill?.operation !== ops.constructPath || ![ops.fill, ops.eoFill].includes(fill.kind) ||
          !boundedPath(fill.box) || !fill.path?.every(Number.isFinite) || prefix[next]?.operation !== ops.restore) return null;
      fills.push({ start, end: next++, color: color.value.toLowerCase(), fill, state, clip });
    } while (depth > 0);
    groups.push(fills);
    if (groups.length > 8) return null;
  }
  const underlay = groups[0]?.length === 1 ? groups[0][0] : null;
  const whiteUnderlay = underlay?.color === '#ffffff' && (!underlay.state || underlay.state.normal) &&
    whitePagePath(underlay.fill.path, underlay.fill.box, viewport.viewBox);
  const scopes = whiteUnderlay ? [underlay] : [];
  const regions = [];
  const seenOnThisPage = [];
  for (const group of groups.slice(whiteUnderlay ? 1 : 0)) {
    if (!group.length) continue;
    if (group.some(scope => scope.state || scope.color === '#ffffff')) return null;
    const corners = group.flatMap(({ fill }) => {
      const [left, bottom, right, top] = fill.box;
      return [viewport.convertToViewportPoint(left, bottom), viewport.convertToViewportPoint(left, top),
        viewport.convertToViewportPoint(right, bottom), viewport.convertToViewportPoint(right, top)];
    });
    const xs = corners.map(point => point[0]);
    const ys = corners.map(point => point[1]);
    const region = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    // Scope this policy to compact marginal artwork. Table, diagram and page
    // body paint are never admitted solely on the strength of a PDF tag.
    if (![region.x0, region.y0, region.x1, region.y1].every(Number.isFinite) ||
        region.x0 < 0 || region.y0 < 0 || region.x1 > viewport.width || region.y1 > viewport.height ||
        region.x1 - region.x0 > viewport.width * 0.25 || region.y1 - region.y0 > viewport.height * 0.12 ||
        (region.y1 > viewport.height * 0.17 && region.y0 < viewport.height * 0.83)) return null;
    // Explicit, repeated, identical marginal geometry. A unique labelled
    // graphic can be meaningful even if an author gave it an Artifact role.
    const hash = createHash('sha256').update(JSON.stringify(group.map(({ color, fill, clip }) =>
      [color, fill.kind, fill.path, clip, region]))).digest('hex');
    seenOnThisPage.push(hash);
    if (priorGroups.has(hash)) {
      regions.push(region);
      scopes.push(...group);
    }
  }
  for (const hash of seenOnThisPage) if (priorGroups.size < MAX_DOCUMENT_GROUPS) priorGroups.add(hash);
  if (!regions.length) return null;
  const skip = new Set();
  for (const { start, end } of scopes) for (let i = start; i <= end; i++) skip.add(i);
  return { skip, regions };
}

function artifactCandidates(data, regions, width, height) {
  if (!Array.isArray(data.blocks) || data.text.split(/\r\n|\r|\n/u).some(isContactLine)) return [];
  const tokens = data.text.match(/\S+/gu) || [];
  if (tokens.length > 20_000) return [];
  const candidates = [];
  let offset = 0, requestedPixels = 0;
  for (const block of data.blocks) {
    if (!Array.isArray(block?.paragraphs)) return [];
    for (const paragraph of block.paragraphs) {
      if (!Array.isArray(paragraph?.lines)) return [];
      for (const line of paragraph.lines) {
        if (!Array.isArray(line?.words) || typeof line.text !== 'string') return [];
        const lineTokens = line.text.match(/\S+/gu) || [];
        if (!lineTokens.length || lineTokens.length !== line.words.length) return [];
        for (const [index, word] of line.words.entries()) {
          if (!word || word.text !== lineTokens[index] || offset >= tokens.length || word.text !== tokens[offset++]) return [];
          const { x0, y0, x1, y1 } = word.bbox || {};
          if (![x0, y0, x1, y1].every(Number.isSafeInteger) || x0 < 0 || y0 < 0 || x1 > width || y1 > height ||
              x0 >= x1 || y0 >= y1) return [];
          if (!regions.some(region => x0 >= region.x0 - 2 && y0 >= region.y0 - 2 &&
              x1 <= region.x1 + 2 && y1 <= region.y1 + 2)) continue;
          const area = (x1 - x0) * (y1 - y0);
          if (area > MAX_WORD_PIXELS || (requestedPixels += area) > MAX_CHECKED_PIXELS) return [];
          candidates.push({ line, index, x0, y0, width: x1 - x0, height: y1 - y0 });
        }
      }
    }
  }
  return offset === tokens.length ? candidates : [];
}

// Replay only for a real OCR-box candidate. Transparency distinguishes a
// blank complement from a real white foreground glyph. The full OCR raster,
// native text, contact evidence and confidence inputs stay untouched.
async function provePdfArtifactWords({ data, plan, page, viewport, canvas, createCanvas,
  annotationMode, setOperatorObserver, budget }) {
  const coverage = new Map();
  const { width, height } = canvas;
  const area = width * height;
  if (!plan || area > MAX_REPLAY_PIXELS || area > budget.remainingPixels || budget.remainingProbes < 1) return coverage;
  const candidates = artifactCandidates(data, plan.regions, width, height);
  if (!candidates.length) return coverage;
  budget.remainingPixels -= area;
  budget.remainingProbes--;
  const pending = new Set(plan.skip);
  let replay, confirmedRoot = false;
  try {
    replay = createCanvas(width, height);
    setOperatorObserver((list, index) => {
      if (index === 0) confirmedRoot = list === plan.list;
    });
    const after = replay.getContext('2d');
    await page.render({ canvasContext: after, viewport, annotationMode, background: 'rgba(0,0,0,0)',
      operationsFilter(index) {
        if (!confirmedRoot || !plan.skip.has(index)) return true;
        pending.delete(index);
        return false;
      } }).promise;
    if (!confirmedRoot || pending.size) return coverage;
    const before = canvas.getContext('2d');
    for (const { line, index, x0, y0, width: w, height: h } of candidates) {
      const remaining = after.getImageData(x0, y0, w, h).data;
      if (remaining.some((n, i) => i % 4 === 3 && n !== 0)) continue;
      const original = before.getImageData(x0, y0, w, h).data;
      if (!original.some((n, i) => i % 4 !== 3 && n !== 255)) continue;
      if (!coverage.has(line)) coverage.set(line, new Set());
      coverage.get(line).add(index);
    }
    return coverage;
  } catch (cause) {
    if (cause?.code !== undefined || !['Error', 'UnknownErrorException'].includes(cause?.name)) throw cause;
    return new Map();
  } finally {
    setOperatorObserver(null);
    if (replay) { replay.width = 1; replay.height = 1; }
  }
}

module.exports = Object.freeze({ observePdfArtifactPrefix, provePdfArtifactWords });
