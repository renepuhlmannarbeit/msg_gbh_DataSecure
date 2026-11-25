'use strict';

// RC178 review R-003. A non-breaking hyphen and a positional tab are visible
// content of a Word run. The Standalone content path used to drop both, which
// joined "Müller‑Schmidt" into "MüllerSchmidt" and "2019‑2024" into "20192024"
// without any notice. The cases use the real Markdown extractor with the
// options of the Standalone conversion child.
const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { test, assert, done } = createSuite('DOCX inline run content');

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
function docx(body) {
  return zipStore([
    ...opcControlEntries('docx'),
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`]
  ]);
}
const convert = (body, options) => extractMarkdownBuffer(docx(body), '.docx', options).markdown;
const content = { partialExtraction: true, markdownOutput: 'content-v1' };
const text = (value) => `<w:t xml:space="preserve">${value}</w:t>`;

test('a non-breaking hyphen stays between the joined words', () => {
  const body = `<w:p><w:r>${text('Müller')}<w:noBreakHyphen/>${text('Schmidt, E')}<w:noBreakHyphen/>${text('Mail, 2019')}` +
    `<w:noBreakHyphen/>${text('2024')}</w:r></w:p>`;
  for (const options of [content, undefined]) {
    const markdown = convert(body, options);
    assert.match(markdown, /Müller‑Schmidt, E‑Mail, 2019‑2024/u);
    assert.doesNotMatch(markdown, /MüllerSchmidt|EMail|20192024/u);
  }
});

test('a positional tab separates its neighbours like a tab', () => {
  const body = `<w:p><w:r>${text('Muster GmbH')}<w:ptab w:relativeTo="margin" w:alignment="right" w:leader="none"/>${text('Seite 3')}</w:r></w:p>`;
  const markdown = convert(body, content);
  assert.doesNotMatch(markdown, /GmbHSeite/u);
  assert.match(markdown, /Muster GmbH(?:\t|&#9;)Seite 3/u);
});

test('an inserted symbol is a certain character or a neutral marker, never silently dropped', () => {
  const sym = (font, char) => `<w:sym w:font="${font}" w:char="${char}"/>`;
  const body = `<w:p><w:r>${text('Winkel ')}${sym('Symbol', 'F061')}${text(' bis ')}${sym('Symbol', 'F057')}${text(', ')}` +
    `${sym('Arial', '00B0')}${text(' erledigt ')}${sym('Wingdings', 'F0FC')}${text(' Punkt ')}${sym('Arial', 'F0B7')}` +
    `${text(' Zeichen ')}${sym('Symbol', 'F0B1')}${text(' defekt ')}${sym('Arial', 'ZZ')}</w:r></w:p>`;
  const markdown = convert(body, content).replace(/\\/gu, '');
  // Symbol-font letters are the Greek alphabet; an ordinary font carries its
  // Unicode character. Font-specific glyphs keep their position as a marker.
  assert.match(markdown, /Winkel α bis Ω, ° erledigt \[Symbol\] Punkt \[Symbol\] Zeichen \[Symbol\] defekt \[Symbol\]/u);
});

test('a stray inline mark outside a paragraph is ignored as before, stray text still stops', () => {
  // Found by the counter-review: the new branch must not turn a document
  // that converted before into a structure stop.
  const paragraph = `<w:p><w:r>${text('Inhalt')}</w:r></w:p>`;
  for (const mark of ['<w:sym w:font="Symbol" w:char="F061"/>', '<w:noBreakHyphen/>', '<w:ptab w:relativeTo="margin" w:alignment="right" w:leader="none"/>']) {
    assert.match(convert(mark + paragraph, content), /^Inhalt$/u, mark);
    assert.match(convert(`<w:tbl><w:tr><w:tc>${mark}${paragraph}</w:tc></w:tr></w:tbl>`, content), /\| Inhalt \|/u, mark);
  }
  assert.throws(() => convert(`<w:t>lose</w:t>${paragraph}`, content));
});

// A legacy form check box (FORMCHECKBOX) has no result text; whether it is
// ticked is stored on the begin control of its field. Dropping it turned
// "[x] Ja  [ ] Nein" into "Ja Nein".
const formField = (data, instruction = ' FORMCHECKBOX ') => `<w:r><w:fldChar w:fldCharType="begin"><w:ffData><w:name w:val="K"/><w:enabled/>${data}</w:ffData></w:fldChar></w:r>` +
  `<w:r><w:instrText xml:space="preserve">${instruction}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
const run = (value) => `<w:r>${text(value)}</w:r>`;
const firstLine = (markdown) => markdown.split('\n')[0].replace(/&#32;/gu, ' ');

test('a legacy form check box shows whether it is ticked', () => {
  const cases = [
    ['<w:checkBox><w:sizeAuto/><w:default w:val="0"/><w:checked/></w:checkBox>', '☒ Antwort'],
    ['<w:checkBox><w:sizeAuto/><w:default w:val="1"/></w:checkBox>', '☒ Antwort'],
    ['<w:checkBox><w:sizeAuto/><w:default w:val="0"/></w:checkBox>', '☐ Antwort'],
    ['<w:checkBox><w:default w:val="1"/><w:checked w:val="0"/></w:checkBox>', '☐ Antwort'],
    ['<w:checkBox><w:checked w:val="true"/></w:checkBox>', '☒ Antwort'],
    ['<w:checkBox><w:sizeAuto/></w:checkBox>', '☐ Antwort'],
    ['<w:checkBox/>', '☐ Antwort']
  ];
  for (const options of [content, undefined]) {
    for (const [data, expected] of cases) {
      assert.equal(firstLine(convert(`<w:p>${formField(data)}${run(' Antwort')}</w:p>`, options)), expected, data);
    }
    const line = firstLine(convert(`<w:p>${formField(cases[0][0])}${run(' Ja  ')}${formField(cases[2][0])}${run(' Nein')}</w:p>`, options));
    assert.match(line, /^☒ Ja +☐ Nein$/u);
    assert.match(convert(`<w:tbl><w:tblGrid><w:gridCol/></w:tblGrid><w:tr><w:tc><w:tcPr/><w:p>${formField(cases[0][0])}${run(' Zustimmung')}</w:p></w:tc></w:tr></w:tbl>`, options),
      /☒(?: |&#32;)Zustimmung/u);
  }
});

test('only a visible check box of a form field is shown, and nothing else changes', () => {
  const ticked = '<w:checkBox><w:default w:val="0"/><w:checked/></w:checkBox>';
  // A form text field keeps showing its stored result and no mark.
  const textField = `<w:p><w:r><w:fldChar w:fldCharType="begin"><w:ffData><w:name w:val="T"/><w:enabled/><w:textInput><w:default w:val="1"/></w:textInput></w:ffData></w:fldChar></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> FORMTEXT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('Eingabe')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
  // A check box inside the instruction of another field is not on the page.
  const nested = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>${formField(ticked)}<w:r><w:instrText xml:space="preserve"> QUOTE </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('Ergebnis')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
  // A check box inside the stored result of another field is.
  const inResult = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> QUOTE </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${formField(ticked)}${run(' Ergebnis')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
  // A deleted field is not part of the final text.
  const deleted = `<w:p><w:del w:id="1" w:author="A" w:date="2026-01-01T00:00:00Z"><w:r><w:fldChar w:fldCharType="begin"><w:ffData><w:name w:val="K"/>${ticked}</w:ffData></w:fldChar></w:r>` +
    `<w:r><w:delInstrText xml:space="preserve"> FORMCHECKBOX </w:delInstrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:del>${run('Rest')}</w:p>`;
  // State elements outside a check box of a form field mean nothing.
  const stray = `<w:p><w:r><w:fldChar w:fldCharType="begin"><w:ffData><w:default w:val="1"/><w:checked/></w:ffData></w:fldChar></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> FORMCHECKBOX </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>${run('Rest')}</w:p>`;
  assert.doesNotMatch(convert(textField, content), /[☒☐]/u);
  assert.match(convert(textField, content), /Eingabe/u);
  assert.doesNotMatch(convert(nested, content), /[☒☐]/u);
  assert.match(convert(nested, content), /Ergebnis/u);
  assert.match(convert(inResult, content), /☒(?: |&#32;)Ergebnis/u);
  assert.doesNotMatch(convert(deleted, content), /[☒☐]/u);
  assert.match(convert(deleted, content), /Rest/u);
  assert.equal(firstLine(convert(stray, content)), 'Rest');
});

test('a soft hyphen still produces no visible character', () => {
  const markdown = convert(`<w:p><w:r>${text('Tren')}<w:softHyphen/>${text('nung')}</w:r></w:p>`, content);
  assert.match(markdown, /Trennung/u);
});

done();
