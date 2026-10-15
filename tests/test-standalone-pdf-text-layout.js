'use strict';

const assert = require('node:assert/strict');
const { nativeTextSeparator, paintedTextGeometryAvailable, nativeTextRegions, nativeSingleTokenRegions, uncoveredOcrText } = require('../plugins/data-secure/server/standalone/pdf-text-layout');
let passed = 0;
function test(name, fn) { fn(); process.stdout.write(`ok ${++passed} - ${name}\n`); }
const item = (str, x, y, width = 60) => ({ str, fontName: 'font', width, transform: [10, 0, 0, 10, x, y] });
const styles = { font: { ascent: 0.9, descent: -0.2, vertical: false } };
const viewport = { convertToViewportPoint: (x, y) => [x * 2, 600 - y * 2] };
const region = { x0: 10, y0: 10, x1: 200, y1: 30, text: 'native § 392 / §393' };
const word = (text, x0, y0, x1, y1) => ({ text, bbox: { x0, y0, x1, y1 } });
const data = (...lines) => ({ text: lines.map(line => line.text).join(''), blocks: [{ paragraphs: [{ lines }] }] });
const line = (text, ...words) => ({ text, words });

test('position separates footer page number without altering source strings', () => {
  assert.equal(nativeTextSeparator(item('15.09.2026', 64, 29, 49), item('2', 42, 29, 6)), '\n');
  assert.equal(nativeTextSeparator(item('Footer', 119, 29, 303), item('2', 42, 29, 6)), '\n');
});
test('font/run boundaries preserve adjacent words, kerning and superscripts', () => {
  assert.equal(nativeTextSeparator(item('Service ', 10, 100), item('Level', 70, 100)), '');
  assert.equal(nativeTextSeparator(item('x', 10, 100), item('2', 68, 104)), '');
  assert.equal(nativeTextSeparator(item('left', 10, 100), item('right', 90, 100)), ' ');
  assert.equal(nativeTextSeparator(item('first', 10, 100), item('second', 10, 80)), '\n');
});
test('new content filtering cannot delete a graphic word in the whitespace of a multiword native run', () => {
  const wide = { x0: 0, y0: 0, x1: 300, y1: 30, text: 'Alpha          Beta' };
  const actual = data(line('Alpha\n', word('Alpha', 130, 5, 170, 25)));
  assert.equal(uncoveredOcrText(actual, [wide], { singleTokenOnly: true }), actual.text);
  assert.deepEqual(nativeSingleTokenRegions([item('Alpha          Beta', 0, 100, 150)], styles, viewport), []);
});
test('optional or unclassified marked-content layers cannot establish visible native duplication', () => {
  const ops = { beginMarkedContentProps: 11, beginMarkedContent: 12, showText: 1, endMarkedContent: 13 };
  for (const entry of [11, 12]) {
    const operators = { fnArray: [entry, 1, 13], argsArray: [['OC', { hidden: true }], [], []] };
    assert.equal(paintedTextGeometryAvailable(operators, ops, { strictMarkedContent: true }), false);
    assert.equal(paintedTextGeometryAvailable(operators, ops), true, 'Legacy geometry remains unchanged; new contracts opt into the stricter provenance rule');
  }
});
test('only proven horizontal font geometry supplies OCR coverage', () => {
  assert.deepEqual(nativeTextRegions([item('text', 10, 100)], styles, viewport), [{ x0: 20, y0: 382, x1: 140, y1: 404, text: 'text' }]);
  assert.deepEqual(nativeTextRegions([item('\uE000', 10, 100)], styles, viewport), []);
  assert.deepEqual(nativeTextRegions([item('Name \uE000', 10, 100)], styles, viewport), []);
  assert.deepEqual(nativeTextRegions([item('name', 10, 100)], {}, viewport), []);
  assert.deepEqual(nativeTextRegions([item('name', 10, 100)], { font: { ...styles.font, vertical: true } }, viewport), []);
  const rotated = { ...item('name', 10, 100), transform: [0, 10, -10, 0, 10, 100] };
  assert.deepEqual(nativeTextRegions([rotated], styles, viewport), []);
});
test('invisible, clipped or transparent native layers cannot suppress overlapping image text', () => {
  const ops = { setTextRenderingMode: 38, setGState: 9 };
  assert.equal(paintedTextGeometryAvailable({ fnArray: [38], argsArray: [[0]] }, ops), true);
  for (const mode of [3, 4, 5, 6, 7]) assert.equal(paintedTextGeometryAvailable({ fnArray: [38], argsArray: [[mode]] }, ops), false);
  assert.equal(paintedTextGeometryAvailable({ fnArray: [9], argsArray: [[['ca', 0]]] }, ops), false);
  assert.equal(paintedTextGeometryAvailable({ fnArray: [9], argsArray: [[[['ca', 0]]]] }, ops), false);
  assert.equal(paintedTextGeometryAvailable({ fnArray: [9], argsArray: [[[['ca', 1], ['BM', 'source-over']]]] }, ops), true);
  assert.equal(paintedTextGeometryAvailable({}, ops), false);
});
test('misread glyphs and different overlay text survive native overlap', () => {
  assert.equal(uncoveredOcrText(data(line('S 392 / 5393\n', word('S', 11, 11, 20, 25), word('392', 30, 11, 70, 25), word('5393', 80, 11, 130, 25))), [region]), 'S\n5393\n');
  const overlay = data(line('Name: Anna Beispiel\n', word('Name:', 11, 11, 40, 25), word('Anna', 50, 11, 80, 25), word('Beispiel', 90, 11, 130, 25)));
  assert.equal(uncoveredOcrText(overlay, [region]), overlay.text);
});
test('later image and complex paint order cannot prove native visibility', () => {
  const ops = { showText: 1, paintImageXObject: 2, fill: 3, paintFormXObjectBegin: 4 };
  for (const fnArray of [[1, 2], [1, 3], [4, 1]]) assert.equal(paintedTextGeometryAvailable({ fnArray, argsArray: fnArray.map(() => []) }, ops), false);
  assert.equal(paintedTextGeometryAvailable({ fnArray: [2, 1], argsArray: [[], []] }, ops), true);
});
test('font-split punctuation may cover one word but never bridges graphic text', () => {
  const regions = nativeTextRegions([item('name', 10, 100), { ...item('.', 70, 100, 4), transform: [9.5, 0, 0, 9.5, 70, 100] }], styles, viewport);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].x1, 148);
  assert.equal(uncoveredOcrText(data(line('name.\n', word('name.', 22, 385, 146, 400))), regions), '');
  assert.equal(nativeTextRegions([item('name', 10, 100), item('graphic', 90, 100)], styles, viewport).length, 2);
  assert.equal(nativeTextRegions([item('name', 10, 100), item('\uE000', 70, 100, 0), item('.', 70, 100, 4)], styles, viewport).length, 2);
});
test('image-only names, dates and mathematical punctuation are retained', () => {
  const value = data(line('AOK &) connect\n', word('AOK', 300, 11, 340, 25), word('&)', 350, 11, 365, 25), word('connect', 370, 11, 430, 25)));
  assert.equal(uncoveredOcrText(value, [region]), value.text);
});
test('partial line retains unseen image text without joining across native text', () => {
  const value = data(line('New native facts\n', word('New', 250, 11, 280, 25), word('native', 20, 11, 100, 25), word('facts', 300, 11, 340, 25)));
  assert.equal(uncoveredOcrText(value, [region]), 'New\nfacts\n');
});
test('nearby or partial overlap is insufficient to suppress OCR', () => {
  const value = data(line('new name\n', word('new', 190, 11, 230, 25), word('name', 10, 31, 80, 45)));
  assert.equal(uncoveredOcrText(value, [region]), value.text);
});
test('missing or malformed geometry retains the original OCR safely', () => {
  const value = data(line('new\n', { text: 'new', bbox: { x0: NaN, y0: 10, x1: 20, y1: 20 } }));
  assert.equal(uncoveredOcrText(value, [region]), value.text);
  assert.equal(uncoveredOcrText({ text: 'new\n', blocks: null }, [region]), 'new\n');
  assert.equal(uncoveredOcrText({ text: 'new\n', blocks: [] }, [region]), 'new\n');
});
test('bounded comparison fallback cannot silently drop already filtered words', () => {
  const regions = [region, ...Array.from({ length: 10000 }, () => ({ x0: 1000, y0: 1000, x1: 2000, y1: 2000 }))];
  const words = [word('native', 20, 11, 100, 25), ...Array.from({ length: 201 }, () => word('new', 300, 11, 340, 25))];
  const value = data(line('native new\n', ...words));
  assert.equal(uncoveredOcrText(value, regions), value.text);
});
const { readableText, readableNotice } = require('../plugins/data-secure/server/standalone/readable-markdown');
const { contactSpans, applyContactAnswer, buildContactDraft } = require('../plugins/data-secure/server/core/ocr-contact-review');
const { contactQuality } = require('../plugins/data-secure/server/standalone/ocr-quality');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
test('PDF prose has no generated code fence or OCR supplement heading', () => {
  assert.equal(readableText('Anna Beispiel\nService Level\n\nFHIR').markdown, 'Anna Beispiel  \nService Level  \n\nFHIR');
  assert.equal(readableText('').markdown, '');
  assert.equal(readableText('  Original e\u0301\u00a0Text  ').markdown, '  Original e\u0301\u00a0Text  ');
});
test('literal markup cannot create HTML, images, headings, lists or code blocks', () => {
  const source = '<script>x</script> &lt;literal&gt;\n![Bild](https://example.invalid/a.png)\n# Titel\n1. Wert\n- Wert\n    eingerueckt\n~~~\n```text';
  const rendered = readableText(source).markdown;
  assert.ok(rendered.includes('&lt;script&gt;x&lt;/script&gt; \\&lt;literal\\&gt;'));
  assert.match(rendered, /!\\\[Bild\\\]\(https:\/\/example\.invalid\/a\.png\)/u);
  assert.match(rendered, /\\# Titel/u);
  assert.match(rendered, /1\\\. Wert/u);
  assert.match(rendered, /\\- Wert/u);
  assert.match(rendered, /&#32;&#32;&#32;&#32;eingerueckt/u);
  assert.doesNotMatch(rendered, /(?:^|\n)(?:```|~~~|    |\t|# |1\. |- )/u);
});
test('actual Markdown sources including genuine code fences are not reformatted', () => {
  const source = '# Quelle\r\n\r\n```js\r\nconst x = "<tag>";\r\n```\r\n';
  assert.equal(extractMarkdownBuffer(Buffer.from(source), '.md').markdown, source);
});
test('contact maps remain exact after Unicode, escaping and mixed line endings', () => {
  const source = '🧪 <vorher>\r\nE-Mail: qa_a@example.invalid\rTelefon: +49 30 555 1011\nFHIR & SDK';
  const originalContacts = contactSpans(source, contactQuality({}, source), 3);
  const before = JSON.stringify(originalContacts);
  const rendered = readableText(source, originalContacts);
  assert.equal(JSON.stringify(originalContacts), before, 'input maps are immutable');
  assert.deepEqual(rendered.contacts.map(contact => rendered.markdown.slice(contact.start, contact.end)),
    originalContacts.map(contact => source.slice(contact.start, contact.end)));
  assert.deepEqual(rendered.contacts.map(contact => [contact.page, contact.line, contact.kind]), [[3, 2, 'email'], [3, 3, 'phone']]);
  assert.match(rendered.markdown, /`qa_a@example\.invalid`/u);
  const input = { original_text: rendered.markdown, contacts: rendered.contacts, source_type: 'pdf' };
  const draft = buildContactDraft(input);
  const corrected = applyContactAnswer(input, { action: 'reviewed', redactions: [], decisions:
    draft.ambiguities.map((candidate, index) => index === 0 ? { ambiguity_id: candidate.ambiguity_id,
      decision: 'correct_contact', replacement: 'qa.correct@example.invalid' }
      : { ambiguity_id: candidate.ambiguity_id, decision: 'confirm_contact' }) });
  assert.equal(corrected, rendered.markdown.replace('qa_a@example.invalid', 'qa.correct@example.invalid'));
});
test('literal contact corridors retain source punctuation rather than fake escaped OCR characters', () => {
  for (const value of ['qa_a@example.invalid', 'unknown [name] <text>', '`unknown`', 'A \\ B']) {
    const source = 'Kontakt: ' + value;
    const originalContacts = [{ start: 9, end: source.length, page: 1, line: 1, kind: 'contact' }];
    const rendered = readableText(source, originalContacts);
    assert.equal(rendered.markdown.slice(rendered.contacts[0].start, rendered.contacts[0].end), value);
    assert.equal(rendered.contacts[0].end - rendered.contacts[0].start, value.length);
  }
});
test('invalid, overlapping and multiline maps fail rather than corrupting review positions', () => {
  const map = { start: 0, end: 3, page: 1, line: 1, kind: 'contact' };
  for (const contacts of [[map, map], [{ ...map, end: 100 }], [{ ...map, end: 5 }]]) {
    assert.throws(() => readableText('abc\nd', contacts), { code: 'OCR_CONTACT_REVIEW_INVALID' });
  }
  assert.throws(() => readableText('\ud800'), { code: 'MARKDOWN_EXTRACTION_INVALID' });
});
test('one readable notice preserves omission and OCR uncertainty without raw values', () => {
  const notice = readableNotice({ image: true, symbols: true, ocr: true, contacts: true });
  assert.equal((notice.match(/> Hinweis:/gu) || []).length, 1);
  assert.match(notice, /Grafiken.*nicht enthalten/u);
  assert.match(notice, /Lesefehler und Auslassungen/u);
  assert.match(notice, /Kontaktwerte.*Original/u);
  assert.match(notice, /Symbolzeichen.*ausgelassen/u);
  assert.equal(readableNotice(), '');
  assert.equal(readableNotice({ image: true }), '> Hinweis: Grafiken und ihre visuelle Anordnung sind nicht enthalten.');
});
test('readable source contacts remain detectable and redactable by the actual privacy core', () => {
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  const source = 'Name: Max Mustermann\nFirma: Nordstern GmbH\nE-Mail: qa_a@example.invalid\nTelefon: +49 30 555 1011\nIBAN: DE89370400440532013000\nFHIR und Kubernetes';
  const rendered = readableText(source, contactSpans(source, contactQuality({}, source)));
  const result = anonymizeMarkdown(rendered.markdown, 'general');
  assert.doesNotMatch(result.text, /Max Mustermann|Nordstern GmbH|qa_a|example\.invalid|555 1011|DE89370400440532013000/u);
  assert.match(result.text, /FHIR und Kubernetes/u);
});
test('literal wording survives actual privacy canonicalization and repeated review passes', () => {
  const { canonicalizeRenderedText } = require('../plugins/data-secure/server/privacy/base');
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  for (const fact of ['Rechnung: A*B*C = 42', 'A_B_C und _Wert_', 'Pfad: C:\\Daten\\*',
    'Generisch: <value> und a < b > c', '[Sachwort] und `Beispielcode`', 'Preis: 10 & 20']) {
    const input = readableText('Name: Anna Beispiel\n' + fact).markdown;
    const canonical = canonicalizeRenderedText(input);
    assert.equal(canonicalizeRenderedText(canonical), canonical, fact + ' must be idempotent');
    const actual = anonymizeMarkdown(input, 'general').text;
    assert.doesNotMatch(actual, /Anna Beispiel/u);
    assert.ok(actual.includes(canonical.split('\n').at(-1)), fact + ' literal wording retained');
    assert.doesNotMatch(actual, /<value>/u, 'literal generic must not become hidden HTML');
  }
});
test('a correction introducing legal email punctuation remains literal and fully anonymizable', () => {
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  const source = 'E-Mail: qa@example.invalid';
  const formatted = readableText(source, [{ start: 8, end: source.length, page: 1, line: 1, kind: 'email' }]);
  const input = { original_text: formatted.markdown, contacts: formatted.contacts, source_type: 'pdf' };
  const draft = buildContactDraft(input);
  const corrected = applyContactAnswer(input, { action: 'reviewed', redactions: [], decisions: [{
    ambiguity_id: draft.ambiguities[0].ambiguity_id, decision: 'correct_contact', replacement: 'a*b*@example.invalid' }] });
  assert.equal(corrected, 'E-Mail: `a*b*@example.invalid`');
  const actual = anonymizeMarkdown(corrected, 'general').text;
  assert.doesNotMatch(actual, /example\.invalid|a\\?\*b/u);
});
test('encoded shield lookalikes and long prefixes cannot corrupt or exhaust canonicalization', () => {
  const { canonicalizeRenderedText } = require('../plugins/data-secure/server/privacy/base');
  for (const text of ['&#57344;literal:0&#57345;', '`Alpha` &#57344;literal:0&#57345;', '\uE000literal:' + ':'.repeat(64000)]) {
    const actual = canonicalizeRenderedText(text);
    assert.doesNotMatch(actual, /undefined/u); assert.ok(actual.includes('literal:'));
  }
});
test('literal entities and actual fenced Markdown stay stable without hiding real personal data', () => {
  const { canonicalizeRenderedText } = require('../plugins/data-secure/server/privacy/base');
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  for (const text of ['`&amp;`', '`&#64;`', '`a&#64;example.invalid`', '```js\nconst s = "a*b*c";\n```\n']) {
    const actual = canonicalizeRenderedText(text);
    assert.equal(canonicalizeRenderedText(actual), actual, text);
  }
  const code = '```text\nName: Anna Beispiel\nRechnung: A*B*C = 42\n```\n';
  const actual = anonymizeMarkdown(code, 'general').text;
  assert.doesNotMatch(actual, /Anna Beispiel/u);
  assert.match(actual, /```text[\s\S]*A\*B\*C = 42[\s\S]*```/u);
  assert.doesNotMatch(anonymizeMarkdown('E-Mail: `"a;b"@example.invalid`', 'general').text, /a;b|example\.invalid/u);
  assert.equal(readableText('Section\n---\nWert\n===\nEnde').markdown, 'Section  \n\\---  \nWert  \n\\===  \nEnde');
});
test('unclosed and longer fences preserve code and long delimiter runs have bounded work', () => {
  const { canonicalizeRenderedText } = require('../plugins/data-secure/server/privacy/base');
  for (const text of ['```js\nconst s = "a*b*c";\n````', '~~~js\nconst s = "a*b*c";\n~~~~', '```js\nconst s = "a*b*c";']) {
    assert.equal(canonicalizeRenderedText(text), text);
  }
  for (const text of ['`'.repeat(100000), ('```text\nx\n').repeat(10000), '\\*x'.repeat(100000), '\n'.repeat(100000)]) {
    const start = performance.now(); assert.equal(canonicalizeRenderedText(text), text);
    assert.ok(performance.now() - start < 2000, '100k source delimiters stay within a bounded local regression deadline');
  }
});
test('quoted and escaped contact corrections redact the complete accepted identity', () => {
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  for (const replacement of ['"anna\\"beispiel"@example.invalid', '""@example.invalid', '"a;b"@example.invalid']) {
    const source = 'E-Mail: qa@example.invalid', formatted = readableText(source, [{ start: 8, end: source.length, page: 1, line: 1, kind: 'email' }]);
    const input = { original_text: formatted.markdown, contacts: formatted.contacts, source_type: 'pdf' };
    const draft = buildContactDraft(input), corrected = applyContactAnswer(input, { action: 'reviewed', redactions: [], decisions: [{
      ambiguity_id: draft.ambiguities[0].ambiguity_id, decision: 'correct_contact', replacement }] });
    const actual = anonymizeMarkdown(corrected, 'general').text;
    assert.doesNotMatch(actual, /anna|beispiel|a;b|example\.invalid/u, replacement);
  }
});
test('an independent CommonMark renderer proves visible wording before and after privacy', () => {
  const MarkdownIt = require('markdown-it');
  const renderer = new MarkdownIt('commonmark', { html: true });
  const visible = text => renderer.parse(text, {}).filter(token => token.type === 'inline')
    .flatMap(token => token.children).map(token => token.content).join('');
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  for (const fact of ['Rechnung: A*B*C = 42', 'a < b > c & SDK', '<value> &lt;literal&gt;',
    '[Sachwort] und `Beispielcode`', 'Pfad: C:\\Daten\\*', '# Titel', '1. Wert', '---', '===']) {
    const raw = readableText(fact).markdown;
    assert.equal(visible(raw), fact, 'raw visible wording: ' + fact);
    const actual = anonymizeMarkdown(readableText('Name: Anna Beispiel\n' + fact).markdown, 'general').text;
    assert.ok(visible(actual).includes(fact), 'anonymized visible wording: ' + fact);
  }
  const actual = anonymizeMarkdown(readableText('Name: Anna Beispiel\nFirma: A&B GmbH\nFHIR').markdown, 'general').text;
  assert.doesNotMatch(actual, /Anna Beispiel|A\\?&B GmbH/u);
});
test('literal entity fidelity cannot waive encoded identifiers in inline, fenced or escaped prose', () => {
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  for (const source of ['Name: `Anna&#32;Beispiel`', 'E-Mail: `anna&#64;example.invalid`',
    '```text\nName: Anna&#32;Beispiel\nE-Mail: anna&#64;example.invalid\n```',
    readableText('Name: Anna&#32;Beispiel\nE-Mail: anna&#64;example.invalid').markdown,
    'E-Mail: `anna&amp;#64;example.invalid`; Syntaxbeispiel: `&amp;`',
    '> Name: `&#26446;&#26126;`', '| Name |\n| --- |\n| `&#26446;&#26126;` |']) {
    const actual = anonymizeMarkdown(source, 'general').text;
    assert.doesNotMatch(actual, /Anna|Beispiel|anna|example\.invalid|26446|26126|李明/u, source);
    if (source.includes('Syntaxbeispiel')) assert.ok(actual.includes('\\&amp;'), 'unrelated literal entity stays intact');
  }
});
test('one-column name tables redact ordinary names too without converting arbitrary pipe prose into authority', () => {
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  assert.doesNotMatch(anonymizeMarkdown('| Name |\n| --- |\n| 李明 |', 'general').text, /李明/u);
  assert.equal(anonymizeMarkdown('| Technik |\n| --- |\n| FHIR |', 'general').text, '| Technik |\n| --- |\n| FHIR |');
});
test('unknown entities cannot insert source text or destabilize repeated canonicalization', () => {
  const { canonicalizeRenderedText } = require('../plugins/data-secure/server/privacy/base');
  for (const source of ['Name: `Anna &Beispiel;`', 'Name: `\\&Anna; Beispiel`']) {
    const first = canonicalizeRenderedText(source);
    assert.equal(canonicalizeRenderedText(first), first, source);
    assert.equal((first.match(/Anna/gu) || []).length, 1);
    assert.equal((first.match(/Beispiel/gu) || []).length, 1);
  }
});
test('multiline inline code and literal backslashes match independently rendered wording', () => {
  const MarkdownIt = require('markdown-it'), renderer = new MarkdownIt('commonmark');
  const visible = text => renderer.parse(text, {}).filter(token => token.type === 'inline')
    .flatMap(token => token.children).map(token => token.content).join('');
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  for (const source of ['Syntax: `head\nA*B*C\nend`', 'Syntax: `a\\`b`', 'Syntax: `head\r\nA*B*C\r\nend`']) {
    assert.equal(visible(anonymizeMarkdown(source, 'general').text), visible(source), source);
  }
});
test('masking a value-bearing sole CSV header cannot relabel subsequent factual rows as names', () => {
  const { csvToMarkdown } = require('../plugins/data-secure/server/document-parser');
  const pii = require('../plugins/data-secure/server/pii-engine');
  const source = csvToMarkdown('"Name: Amina Lindenfels"\n"Firma: Wiesenlabor GmbH"\n"FHIR"\n"Service Level"\n"Fail Closed"');
  const actual = pii.anonymize(source, 'general');
  assert.doesNotMatch(actual.text, /Amina|Lindenfels|Wiesenlabor/u);
  assert.match(actual.text, /FHIR/u);
  assert.deepEqual(pii.scanResidual(actual.text, 'general', actual.dictionary, { strongPersonAnchor: actual.strongPersonAnchor }), []);
});
test('escaped legal company punctuation cannot publish an unlabelled name prefix', () => {
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  const { canonicalizeRenderedText } = require('../plugins/data-secure/server/privacy/base');
  for (const company of ['A&B GmbH', 'Acme&Co GmbH', 'Acme+Co GmbH', 'Acme/Co GmbH']) {
    const actual = anonymizeMarkdown(readableText(company + ' setzt FHIR ein.').markdown, 'general').text;
    assert.match(actual, /^\[ORGANISATION_\d+\] setzt FHIR ein\.$/u, company);
  }
  assert.equal(canonicalizeRenderedText('A\\&B GmbH'), canonicalizeRenderedText('A&B GmbH'),
    'same visible company has the same run identity across formatted and plain documents');
  assert.equal(canonicalizeRenderedText('Sachrechnung: A\\&B = 42'), 'Sachrechnung: A\\&B = 42',
    'unrelated escaped wording is not globally decoded');
});
test('literal encoding cannot waive any actual structured identifier grammar', () => {
  const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
  const examples = [
    ['IP: `127&#46;0&#46;0&#46;1`', /127|&#46;/u, 'general'],
    ['IBAN: `DE89&#32;3704&#32;0044&#32;0532&#32;0130&#32;00`', /DE89|3704/u, 'general'],
    ['Kreditkarte: `4111&#32;1111&#32;1111&#32;1111`', /4111|1111/u, 'general'],
    ['Password: `&#115;ynthetic-secret`', /ynthetic|&#115;/u, 'general'],
    ['Web: `https&#58;//private.example.invalid/contact?id=4711`', /private\.example|4711/u, 'personnel_profile']
  ];
  for (const [source, forbidden, profile] of examples) assert.doesNotMatch(anonymizeMarkdown(source, profile).text, forbidden, source);
});
process.stdout.write(`passed ${passed} standalone PDF/readable-text tests\n`);
