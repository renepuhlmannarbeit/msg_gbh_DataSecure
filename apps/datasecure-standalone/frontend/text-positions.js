'use strict';

// WHATWG HTML: textarea.value and text-control selections use the LF-normalized
// API value, with UTF-16 code-unit offsets, not the original raw value.
// https://html.spec.whatwg.org/multipage/form-elements.html#the-textarea-element
// https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#textFieldSelection
// This display-only adapter never normalizes the immutable backend text/hash.
(() => {
  const MAX_UNITS = 8 * 1024 * 1024;
  const invalid = () => Object.assign(Error('DOCUMENT_TEXT_POSITION_INVALID'), { code: 'DOCUMENT_TEXT_POSITION_INVALID' });
  const boundary = (text, offset) => Number.isSafeInteger(offset) && offset >= 0 && offset <= text.length &&
    !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/u.test(text[offset - 1]) && /[\uDC00-\uDFFF]/u.test(text[offset]));
  // In Unicode mode a paired surrogate is one astral code point, not part of
  // this range. This also works on WebViews predating String.isWellFormed().
  const validText = (text, maximum = MAX_UNITS) => typeof text === 'string' && text.length <= maximum && !/[\uD800-\uDFFF]/u.test(text);
  function create(raw) {
    if (!validText(raw)) throw invalid();
    // Only CRLF needs an offset delta. Bare CR becomes one LF, preserving
    // length; every other code unit (including both surrogate units) survives.
    let count = 0;
    for (let index = raw.indexOf('\r\n'); index !== -1; index = raw.indexOf('\r\n', index + 2)) count++;
    const pairs = new Uint32Array(count);
    let at = 0;
    for (let index = raw.indexOf('\r\n'); index !== -1; index = raw.indexOf('\r\n', index + 2)) pairs[at++] = index;
    const display = raw.replace(/\r\n?/gu, '\n');
    function preceding(offset, api) {
      let low = 0, high = pairs.length;
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2), position = pairs[middle] - (api ? middle : 0);
        if (position < offset) low = middle + 1; else high = middle;
      }
      return low;
    }
    function toBackend(offset) {
      if (!boundary(display, offset)) throw invalid();
      const result = offset + preceding(offset, true);
      if (!boundary(raw, result) || raw[result - 1] === '\r' && raw[result] === '\n') throw invalid();
      return result;
    }
    function toDisplay(offset) {
      // A boundary inside CRLF has no exact textarea counterpart. Reject it,
      // rather than silently widening a promised source/Markdown highlight.
      if (!boundary(raw, offset) || raw[offset - 1] === '\r' && raw[offset] === '\n') throw invalid();
      const result = offset - preceding(offset, false);
      if (!boundary(display, result)) throw invalid();
      return result;
    }
    function displayRange(start, end) {
      if (start > end) throw invalid();
      const result = { start: toDisplay(start), end: toDisplay(end) };
      if (raw.slice(start, end).replace(/\r\n?/gu, '\n') !== display.slice(result.start, result.end)) throw invalid();
      return result;
    }
    function backendRange(value, start, end) {
      if (value !== display || start > end) throw invalid();
      const result = { start: toBackend(start), end: toBackend(end) };
      if (raw.slice(result.start, result.end).replace(/\r\n?/gu, '\n') !== display.slice(start, end)) throw invalid();
      return result;
    }
    function correction(value) {
      // An actual textarea API value contains no CR. Reject foreign/unpaired
      // input instead of changing the backend basis or guessing its encoding.
      if (!validText(value, MAX_UNITS + 32768) || value.includes('\r')) throw invalid();
      if (value === display) return null;
      let start = 0, oldEnd = display.length, newEnd = value.length;
      while (start < oldEnd && start < newEnd && display[start] === value[start]) start++;
      if (!boundary(display, start) || !boundary(value, start)) start--;
      while (oldEnd > start && newEnd > start && display[oldEnd - 1] === value[newEnd - 1]) { oldEnd--; newEnd--; }
      if (!boundary(display, oldEnd) || !boundary(value, newEnd)) { oldEnd++; newEnd++; }
      if (!boundary(value, start) || !boundary(value, newEnd)) throw invalid();
      const range = backendRange(display, start, oldEnd);
      // The one deliberate correction retains exact original CR/LF bytes in
      // the untouched prefix/suffix. Only newly supplied replacement text uses
      // textarea LF; never resave a globally LF-normalized backend document.
      return { ...range, replacement: value.slice(start, newEnd) };
    }
    return Object.freeze({ display, backendRange, displayRange, correction });
  }
  const api = Object.freeze({ create });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.__DATASECURE_TEXT_POSITIONS__ = api;
})();
