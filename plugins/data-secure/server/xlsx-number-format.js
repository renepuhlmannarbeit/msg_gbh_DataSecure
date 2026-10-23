'use strict';

// Deliberately bounded display projection, not a spreadsheet calculation engine.
// ECMA-376/MS-XLSX numFmt codes are retained when this subset cannot represent
// them. In particular, conditions, fractions, locale calendars and fill rules
// must never silently turn a percentage/date/unit into an unqualified raw value.
const BUILTIN = new Map([[0, 'General'], [1, '0'], [2, '0.00'], [3, '#,##0'], [4, '#,##0.00'],
  [9, '0%'], [10, '0.00%'], [11, '0.00E+00'], [14, 'mm-dd-yy'], [15, 'd-mmm-yy'],
  [16, 'd-mmm'], [17, 'mmm-yy'], [18, 'h:mm AM/PM'], [19, 'h:mm:ss AM/PM'],
  [20, 'h:mm'], [21, 'h:mm:ss'], [22, 'm/d/yy h:mm'], [37, '#,##0;(#,##0)'],
  [38, '#,##0;[Red](#,##0)'], [39, '#,##0.00;(#,##0.00)'],
  [40, '#,##0.00;[Red](#,##0.00)'], [45, 'mm:ss'], [46, '[h]:mm:ss'], [49, '@']]);
const NUMERIC = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[Ee][+-]?[0-9]+)?$/u;
function decimalFixed(raw, decimals, percent) {
  const [mantissa, exponentText] = raw.replace(/^[+-]/u, '').toLowerCase().split('e');
  const [integer, fraction = ''] = mantissa.split('.');
  const shift = Number(exponentText || 0) - fraction.length + (percent ? 2 : 0) + decimals;
  let coefficient = BigInt((integer || '0') + fraction);
  if (shift > 512) return null;
  if (shift < -512) coefficient = 0n;
  else if (shift >= 0) coefficient *= 10n ** BigInt(shift);
  else { const divisor = 10n ** BigInt(-shift); coefficient = (coefficient + divisor / 2n) / divisor; }
  const digits = coefficient.toString().padStart(decimals + 1, '0');
  return decimals ? `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}` : digits;
}
function splitSections(code) {
  const parts = ['']; let quote = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '\\' && i + 1 < code.length) { parts[parts.length - 1] += ch + code[++i]; continue; }
    if (ch === '"') quote = !quote;
    if (ch === ';' && !quote) parts.push(''); else parts[parts.length - 1] += ch;
  }
  return quote || parts.length > 4 ? null : parts;
}
function tokens(code) {
  const result = [];
  for (let i = 0; i < code.length;) {
    const ch = code[i];
    if (ch === '"') { const end = code.indexOf('"', i + 1); if (end < 0) return null;
      result.push({ literal: code.slice(i + 1, end) }); i = end + 1; continue; }
    if (ch === '\\') { if (++i >= code.length) return null; result.push({ literal: code[i++] }); continue; }
    if (ch === '[') { const end = code.indexOf(']', i + 1); if (end < 0) return null;
      const bracket = code.slice(i + 1, end);
      if (/^(?:black|blue|cyan|green|magenta|red|white|yellow|color[0-9]+)$/iu.test(bracket)) { i = end + 1; continue; }
      const currency = /^\$([^\]-]+)-[0-9a-f]+$/iu.exec(bracket);
      if (currency) result.push({ literal: currency[1] });
      else if (/^h{1,2}$/iu.test(bracket)) result.push({ elapsed: true });
      else return null;
      i = end + 1; continue;
    }
    // Spacing/fill are layout, not text; retain the adjacent semantic units.
    if (ch === '_' || ch === '*') { if (i + 1 >= code.length) return null; i += 2; continue; }
    result.push({ code: ch }); i++;
  }
  return result;
}
function dateProjection(value, list, date1904, raw) {
  const source = list.map(t => t.code || (t.elapsed ? '[h]' : '\u0001')).join('');
  if (!/[ymdhs]/iu.test(source)) return null;
  // No weekday names, calendar/locale inference or fractional-second ambiguity.
  if (/d{3,}|m{5,}|s\.[0#]|[^ymdhs\[\]AMPat\/.: ,\-\u0001]/iu.test(source)) return false;
  if (value < 0 || value >= (date1904 ? 2957004 : 2958466) ||
      (!date1904 && value < 1 && /[yd]/iu.test(source))) return false;
  // Do not round the date-only day through an unshown time component. Work
  // from the decimal source rather than a binary float near midnight; elapsed
  // hours and clock fields must share the same rounded total-second carry.
  const [mantissa, exponentText] = raw.replace(/^\+/u, '').toLowerCase().split('e');
  const [integer, fraction = ''] = mantissa.split('.');
  const exponent = Number(exponentText || 0) - fraction.length;
  if (Math.abs(exponent) > 512) return false;
  let numerator = BigInt((integer || '0') + fraction), denominator = 1n;
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
  else denominator = 10n ** BigInt(-exponent);
  let day = Number(numerator / denominator);
  if (!date1904 && day < 1 && /[yd]/iu.test(source)) return false;
  const fractionSeconds = (numerator % denominator) * 86400n;
  let hasHour = false, hasMinute = false, hasSecond = false, fieldCursor = 0, previousField = '';
  while (fieldCursor < list.length) {
    const token = list[fieldCursor];
    if (token.elapsed) { hasHour = true; previousField = 'h'; fieldCursor++; continue; }
    if (!token.code) { fieldCursor++; continue; }
    const remaining = list.slice(fieldCursor).map(t => t.code || '\u0001').join('');
    if (/^AM\/PM/iu.test(remaining)) { fieldCursor += 5; continue; }
    const ch = token.code.toLowerCase();
    if (!/[ymdhs]/u.test(ch)) { fieldCursor++; continue; }
    let size = 1; while (list[fieldCursor + size]?.code?.toLowerCase() === ch) size++;
    const after = list.slice(fieldCursor + size).map(t => t.code || '\u0001').join('');
    if (ch === 'h') hasHour = true;
    if (ch === 's') hasSecond = true;
    if (ch === 'm' && (previousField === 'h' || /^:s/iu.test(after))) hasMinute = true;
    previousField = ch; fieldCursor += size;
  }
  const hasTime = hasHour || hasMinute || hasSecond;
  // Minute/hour-only formatting with a smaller nonzero source component has
  // display-rounding rules outside this bounded subset. Disclose raw+format
  // rather than asserting an inferred rounded clock/date.
  const quantum = hasSecond ? 1n : hasMinute ? 60n : 3600n;
  if (hasTime && !hasSecond && fractionSeconds % (denominator * quantum) !== 0n) return false;
  const roundedSeconds = hasTime ? (fractionSeconds * 2n + denominator) / (denominator * 2n) : 0n;
  const totalSeconds = BigInt(day) * 86400n + roundedSeconds;
  let seconds = Number(roundedSeconds);
  if (seconds === 86400) { day++; seconds = 0; }
  if (day >= (date1904 ? 2957004 : 2958466)) return false;
  const fakeLeap = !date1904 && day === 60;
  const time = new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 31) +
    (day - (!date1904 && day >= 60 ? 1 : 0)) * 86400000);
  const year = fakeLeap ? 1900 : time.getUTCFullYear(), month = fakeLeap ? 2 : time.getUTCMonth() + 1,
    date = fakeLeap ? 29 : time.getUTCDate(), hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds / 60) % 60;
  const pad = (v, count = 2) => String(v).padStart(count, '0');
  const ampm = /AM\/PM/iu.test(source);
  let out = '', cursor = 0, previousToken = '';
  while (cursor < list.length) {
    const token = list[cursor];
    if (token.literal !== undefined) { out += token.literal; cursor++; continue; }
    if (token.elapsed) { out += String(totalSeconds / 3600n); previousToken = 'h'; cursor++; continue; }
    const remaining = list.slice(cursor).map(t => t.code || '\u0001').join('');
    if (/^AM\/PM/iu.test(remaining)) { out += hours < 12 ? 'AM' : 'PM'; cursor += 5; continue; }
    const ch = token.code.toLowerCase();
    if (!/[ymdhs]/u.test(ch)) { out += token.code; cursor++; continue; }
    let size = 1; while (list[cursor + size]?.code?.toLowerCase() === ch) size++;
    const after = list.slice(cursor + size).map(t => t.code || '\u0001').join('');
    const minute = ch === 'm' && (previousToken === 'h' || /^:s/iu.test(after));
    if (ch === 'y') out += size <= 2 ? pad(year % 100) : pad(year, 4);
    if (ch === 'm') out += minute ? (size > 1 ? pad(minutes) : String(minutes)) : size >= 3
      ? (size === 4 ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])[month - 1]
      : (size > 1 ? pad(month) : String(month));
    if (ch === 'd') out += size > 1 ? pad(date) : String(date);
    if (ch === 'h') { const h = ampm ? (hours % 12 || 12) : hours; out += size > 1 ? pad(h) : String(h); }
    if (ch === 's') out += size > 1 ? pad(seconds % 60) : String(seconds % 60);
    previousToken = ch; cursor += size;
  }
  return out;
}
function formatXlsxNumber(raw, formatCode, { date1904 = false } = {}) {
  const original = String(raw);
  const code = typeof formatCode === 'string' ? formatCode : 'General';
  const fallback = () => ({ text: `${original} [Zahlenformat: ${code}]`, unsupported: true });
  if (code.length > 512 || original.length > 256 || !NUMERIC.test(original)) return fallback();
  if (/^(?:General|@)$/iu.test(code)) return { text: original, unsupported: false };
  const value = Number(original); if (!Number.isFinite(value)) return fallback();
  const sections = splitSections(code); if (!sections) return fallback();
  let negativeSection = value < 0 && sections.length > 1;
  const selected = sections[value === 0 && sections.length > 2 ? 2 : negativeSection ? 1 : 0];
  // Explicit empty numeric sections hide values in Excel. Keep the source value.
  if (!selected) return fallback();
  const list = tokens(selected); if (!list) return fallback();
  const date = dateProjection(value, list, date1904, original);
  if (date !== null) return date === false ? fallback() : { text: date, unsupported: false };
  const mask = list.map(t => t.code || '\u0001').join('');
  const match = /[0#][0#,]*(?:\.[0#]+)?(?:E[+-]0+)?/iu.exec(mask);
  if (!match || /[0#?@]/u.test(mask.slice(0, match.index) + mask.slice(match.index + match[0].length))) return fallback();
  const numericMask = match[0], prefix = list.slice(0, match.index), suffix = list.slice(match.index + numericMask.length);
  if (/E/iu.test(numericMask) && !/^0(?:\.[0#]+)?E[+-]0+$/iu.test(numericMask)) return fallback();
  if ([...prefix, ...suffix].some(t => t.code && !/^[ %()+\-$€£¥]$/u.test(t.code))) return fallback();
  const percentCount = list.filter(t => t.code === '%').length;
  if (percentCount > 1 || /,$/u.test(numericMask)) return fallback();
  const decimals = /\.([0#]+)/u.exec(numericMask)?.[1] || '';
  if (decimals.length > 20) return fallback();
  let absolute = Math.abs(value) * (percentCount ? 100 : 1); if (!Number.isFinite(absolute) || absolute >= 1e21) return fallback();
  let number;
  if (/E/iu.test(numericMask)) {
    const exponentDigits = /E[+-](0+)/iu.exec(numericMask)?.[1].length || 1;
    number = absolute.toExponential(decimals.length).replace(/e([+-])([0-9]+)$/u, (_, sign, exponent) => `E${sign}${exponent.padStart(exponentDigits, '0')}`);
  } else {
    number = decimalFixed(original, decimals.length, percentCount);
    if (number === null) return fallback();
    const minDecimals = decimals.replace(/#+$/u, '').length;
    if (minDecimals < decimals.length) number = number.replace(/0+$/u, '').replace(/\.$/u, '');
    const parts = number.split('.'), integerMask = numericMask.split('.')[0];
    parts[0] = parts[0].padStart((integerMask.match(/0/gu) || []).length, '0');
    if (integerMask.includes(',')) parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
    number = parts.join('.');
  }
  const literal = values => values.map(t => t.literal ?? t.code ?? '').join('');
  return { text: `${value < 0 && !negativeSection ? '-' : ''}${literal(prefix)}${number}${literal(suffix)}`, unsupported: false };
}

module.exports = Object.freeze({ BUILTIN, formatXlsxNumber });
