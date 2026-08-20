'use strict';

// Every detector in this engine contributes candidate spans instead of running
// its own text.replace(). The previous design applied one global replace pass
// per rule, so rules corrupted each other's input: the bank-data rule rewrote
// "ERIKA BEISPIEL" to "ERIKA [BANK_DATA_REDACTED]" before the person rule ran,
// and the person rule then failed to find the name it had already collected.
// Collecting spans first and resolving conflicts once makes the outcome
// independent of rule order.

const PLACEHOLDER_RE = /\[[A-ZÄÖÜ_]+(?:_\d+)?\]/gu;

function placeholderSpans(text) {
  const out = [];
  PLACEHOLDER_RE.lastIndex = 0;
  let m;
  while ((m = PLACEHOLDER_RE.exec(text))) {
    out.push({ type: 'PLACEHOLDER', start: m.index, end: m.index + m[0].length, text: m[0], priority: 1000, reserved: true });
  }
  return out;
}

// Highest priority wins; on equal priority the longer span wins; on equal
// length the earlier one wins. Overlapping losers are dropped entirely rather
// than truncated, because a partially redacted identifier is worse than none.
function resolveSpans(spans) {
  const sorted = [...spans].sort(
    (a, b) =>
      (b.priority || 0) - (a.priority || 0) ||
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start
  );
  const kept = [];
  for (const span of sorted) {
    if (span.end <= span.start) continue;
    if (kept.some((k) => span.start < k.end && k.start < span.end)) continue;
    kept.push(span);
  }
  return kept.sort((a, b) => a.start - b.start);
}

function applySpans(text, spans) {
  const resolved = resolveSpans(spans);
  let out = '';
  let cursor = 0;
  for (const span of resolved) {
    if (span.start < cursor) continue;
    out += text.slice(cursor, span.start);
    out += span.reserved ? text.slice(span.start, span.end) : span.replacement;
    cursor = span.end;
  }
  return out + text.slice(cursor);
}

function lineBoundsAt(text, index) {
  const from = text.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
  let to = text.indexOf('\n', index);
  if (to < 0) to = text.length;
  return { from, to };
}

module.exports = { PLACEHOLDER_RE, placeholderSpans, resolveSpans, applySpans, lineBoundsAt };
