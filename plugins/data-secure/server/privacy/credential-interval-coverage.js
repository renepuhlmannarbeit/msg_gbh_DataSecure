'use strict';

// Geometry only: never retain a credential's source text, hash or identity.
// Redaction and independent residual discovery keep separate semantic readers.
function invalid() { return Object.assign(new Error('PRIVACY_INTERVAL_INVALID'), { code: 'PRIVACY_INTERVAL_INVALID' }); }
function validBoundary(value) { return Number.isSafeInteger(value) && value >= 0; }

function credentialIntervals(spans) {
  const sorted = spans.filter(span => span.type === 'CREDENTIAL').map(span => {
    if (!validBoundary(span.start) || !validBoundary(span.end) || span.start >= span.end) throw invalid();
    return { start: span.start, end: span.end };
  }).sort((left, right) => left.start - right.start || left.end - right.end);
  const union = [];
  for (const interval of sorted) {
    const previous = union.at(-1);
    if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
    else union.push(interval);
  }
  return Object.freeze(union.map(interval => Object.freeze(interval)));
}

function overlapsCredential(intervals, start, end) {
  if (!validBoundary(start) || !validBoundary(end) || start > end) throw invalid();
  if (start === end) return false;
  let low = 0, high = intervals.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (intervals[middle].start < end) low = middle + 1;
    else high = middle;
  }
  return low > 0 && intervals[low - 1].end > start;
}

module.exports = Object.freeze({ credentialIntervals, overlapsCredential });
