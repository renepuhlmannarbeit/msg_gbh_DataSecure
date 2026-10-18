'use strict';

const { isIP } = require('node:net');
const { identifierDetectionText, hasLabelBefore, luhnValid } = require('./base');

// Independent from structured.js's detector table and its per-class view flags.
// Restrict compatibility folding to the existing one-code-unit identifier view;
// never NFKC the released document, alter coordinates, or guess numeric meaning.
const LEFT = '(?<![\\p{L}\\p{N}_])';
const RIGHT = '(?![\\p{L}\\p{N}_])';
const CARD = new RegExp(`${LEFT}\\d(?:[ \\t-]?\\d){12,18}${RIGHT}`, 'gu');
const TAX = new RegExp(`${LEFT}\\d(?:[ \\t.-]?\\d){10}${RIGHT}`, 'gu');
const TAX_LABEL = /(?:steuer(?:[- ]?id|nummer|liche\s+identifikationsnummer)|id[- ]?nr\.?|ust[- ]?id(?:nr)?)\s*\.?\s*:?\s*$/iu;
const SOCIAL = new RegExp(`${LEFT}\\d{2}[ \\t-]?\\d{6}[ \\t-]?[A-Z][ \\t-]?\\d{3}${RIGHT}`, 'gu');
// Match a whole maximal IP-like token rather than a suffix of a longer version
// or quantity. Node's IP validator is separate from the redactor's regexes.
const IP_TOKEN = /(?<![\p{L}\p{N}_:.])[a-f0-9:.]+(?![\p{L}\p{N}_:.])/giu;

function scanNumericIdentifierResiduals(text) {
  const source = String(text || ''), view = identifierDetectionText(source), findings = [];
  const add = (type, match) => findings.push({ type, start: match.index,
    end: match.index + match[0].length, text: source.slice(match.index, match.index + match[0].length) });
  for (const match of view.matchAll(CARD)) if (luhnValid(match[0])) add('CREDIT_CARD', match);
  for (const match of view.matchAll(TAX)) if (hasLabelBefore(view, match.index, TAX_LABEL, 80)) add('DE_TAX_ID', match);
  for (const match of view.matchAll(SOCIAL)) add('DE_SOCIAL_SECURITY', match);
  for (const match of view.matchAll(IP_TOKEN)) {
    // An IPv6 literal has at most 45 ASCII characters, including an IPv4 tail.
    if (!/[.:]/u.test(match[0])) continue;
    // Terminal full stops/ellipsis are prose punctuation, not part of an IP.
    // Do not cut internal components: 1.2.3.4.5 must remain a whole non-IP.
    const token = match[0].replace(/\.+$/u, '');
    if (token.length > 45) continue;
    const family = isIP(token);
    if (family) add(family === 4 ? 'IP' : 'IPV6', { 0: token, index: match.index });
  }
  return findings;
}

module.exports = { scanNumericIdentifierResiduals };
