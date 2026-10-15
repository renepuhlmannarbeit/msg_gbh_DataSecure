'use strict';

// A literal/code representation is not a privacy exemption. Decode only
// candidate identifier corridors, not unrelated literal entities such as an
// example of "&amp;". Boundary maps keep those edits in SOURCE coordinates.
function normalizeEncodedIdentifiers(source, decodeEntity, candidateRanges) {
  if (!/\\?&(?:#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);|\\[&.'’+\/-]/iu.test(source)) return source;
  let text = source, boundaries = Int32Array.from({ length: source.length + 1 }, (_value, index) => index);
  for (let depth = 0; depth < 16; depth++) {
    const pieces = [], next = new Int32Array(text.length + 1); let from = 0, offset = 0, changed = false;
    const appendUnchanged = end => { pieces.push(text.slice(from, end)); next.set(boundaries.subarray(from, end + 1), offset); offset += end - from; };
    for (const match of text.matchAll(/\\?&(?:#(?:x[0-9a-f]{1,6}|[0-9]{1,7})|[a-z][a-z0-9]{1,31});|\\[&.'’+\/-]/giu)) {
      const entity = match[0].replace(/^\\/u, '');
      const punctuationEscape = /^\\[&.'’+\/-]$/u.test(match[0]);
      const replacement = punctuationEscape ? entity : decodeEntity(entity);
      // Removing a Markdown escape is not entity decoding. Unknown named
      // entities must retain their original one-to-one coordinate map.
      if ((!punctuationEscape && replacement === entity) || replacement.length > match[0].length) continue;
      appendUnchanged(match.index); pieces.push(replacement);
      for (let index = 0; index < replacement.length; index++) next[offset + index] = boundaries[match.index];
      offset += replacement.length; next[offset] = boundaries[match.index + match[0].length];
      from = match.index + match[0].length; changed = true;
    }
    if (!changed) break;
    appendUnchanged(text.length); text = pieces.join(''); boundaries = next.subarray(0, offset + 1);
  }
  if (text === source) return source;
  const ranges = candidateRanges(text).sort((a,b) => a.start - b.start || b.end - a.end), merged = [];
  for (const range of ranges) {
    if (range.start < 0 || range.end > text.length || range.end <= range.start) continue;
    const last = merged.at(-1);
    if (last && range.start < last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  const output = []; let cursor = 0;
  for (const range of merged) {
    const start = boundaries[range.start], end = boundaries[range.end];
    if (start < cursor || end <= start ||
        (range.start > 0 && boundaries[range.start] === boundaries[range.start - 1]) ||
        boundaries[range.end] === boundaries[range.end - 1]) continue;
    output.push(source.slice(cursor, start), text.slice(range.start, range.end)); cursor = end;
  }
  output.push(source.slice(cursor)); return output.join('');
}
module.exports = { normalizeEncodedIdentifiers };
