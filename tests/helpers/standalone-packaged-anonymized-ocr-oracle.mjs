// Independent test-only oracle for the fixed three-line raster fixture.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MarkdownIt = require('markdown-it');
// Tokenize raw HTML so it is refused rather than silently hidden or stripped.
const markdown = new MarkdownIt({ html: true });
const blocks = new Set(['paragraph_open', 'paragraph_close', 'heading_open', 'heading_close', 'inline']);
const formatting = new Set(['em_open', 'em_close', 'strong_open', 'strong_close', 's_open', 's_close']);
const artifacts = /data:image|base64,|!\[|<img\b/iu;

export function assertPackagedAnonymizedOcrMarkdown(value) {
  assert.equal(typeof value, 'string', 'PACKAGED_ANON_OCR_MARKDOWN_REQUIRED');
  // Preserve the original raw-identity and embedded-image refusals.
  assert.doesNotMatch(value, /Max Mustermann|Nordstern GmbH/iu, 'PACKAGED_ANON_OCR_ORIGINAL_IDENTITY');
  assert.doesNotMatch(value, artifacts, 'PACKAGED_ANON_OCR_IMAGE_ARTIFACT');
  const tokens = markdown.parse(value, {});
  assert.ok(tokens.every(token => blocks.has(token.type)), 'PACKAGED_ANON_OCR_UNEXPECTED_STRUCTURE');
  const text = tokens.filter(token => token.type === 'inline').map(token => {
    assert.ok(Array.isArray(token.children), 'PACKAGED_ANON_OCR_INLINE_REQUIRED');
    return token.children.map(child => {
      if (child.type === 'text' || child.type === 'code_inline') return child.content;
      if (child.type === 'softbreak' || child.type === 'hardbreak') return '\n';
      assert.ok(formatting.has(child.type), 'PACKAGED_ANON_OCR_UNEXPECTED_INLINE');
      return '';
    }).join(''); // Adjacent inline tokens do not introduce a visible space.
  }).join('\n'); // Distinct blocks do introduce a visible text boundary.
  // Parsing decodes visible character references. Also conservatively refuse
  // known recoverable identities in literal code or once-escaped references.
  const disclosed = markdown.utils.unescapeAll(text).normalize('NFKC');
  assert.doesNotMatch(disclosed, artifacts, 'PACKAGED_ANON_OCR_IMAGE_ARTIFACT');
  const identity = disclosed.replace(/\s+/gu, '').toLowerCase();
  assert.ok(!identity.includes('maxmustermann') && !identity.includes('nordsterngmbh'),
    'PACKAGED_ANON_OCR_ORIGINAL_IDENTITY');
  const visible = text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  // All four real sources end with this complete factual line. The scan may
  // additionally have a page heading; the raster contains no IBAN.
  assert.match(visible, /(?:^|\s)Projektmanager Software Tester$/iu,
    'PACKAGED_ANON_OCR_FACTUAL_LINE_CHANGED');
}
