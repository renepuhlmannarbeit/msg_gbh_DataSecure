'use strict';

// RC178 review R-005. Word keeps the built-in style name "heading N" but
// derives the style ID from the localized name (German: "berschrift1"). The
// Standalone content path recognized headings only by the English ID, so such
// documents lost their outline. The level now also follows the style name of
// the bound styles part, including a style based on a heading.
const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { test, assert, done } = createSuite('DOCX heading style names');

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8"?>';
const STYLES_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml';
const paragraph = (value, style) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${value}</w:t></w:r></w:p>`;
const style = (id, name, based) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>` +
  `${based ? `<w:basedOn w:val="${based}"/>` : ''}</w:style>`;
function docx(body, styles) {
  const entries = [
    ...opcControlEntries('docx', styles ? { additionalOverrides: [{ part: 'word/styles.xml', contentType: STYLES_TYPE }] } : {}),
    ['word/document.xml', `${XML}<w:document ${W}><w:body>${body}</w:body></w:document>`]
  ];
  if (styles) {
    entries.push(['word/_rels/document.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>']);
    entries.push(['word/styles.xml', `${XML}<w:styles ${W}>${styles}</w:styles>`]);
  }
  return zipStore(entries);
}
const convert = (body, styles) => extractMarkdownBuffer(docx(body, styles), '.docx',
  { partialExtraction: true, markdownOutput: 'content-v1' }).markdown;
const lines = (markdown) => markdown.split('\n').filter(Boolean);

test('a localized style ID is a heading through its built-in style name', () => {
  const styles = style('Standard', 'Normal') + style('berschrift1', 'heading 1') + style('berschrift2', 'heading 2') +
    style('Kapitel', 'Kapitel', 'berschrift2');
  const markdown = convert(paragraph('Einleitung', 'berschrift1') + paragraph('Ziel', 'berschrift2') +
    paragraph('Abgeleitet', 'Kapitel') + paragraph('Fließtext', 'Standard'), styles);
  assert.deepEqual(lines(markdown).slice(0, 4), ['# Einleitung', '## Ziel', '## Abgeleitet', 'Fließtext']);
});

test('the English style ID keeps working with and without a styles part', () => {
  assert.equal(lines(convert(paragraph('Title', 'Heading1') + paragraph('Text')))[0], '# Title');
  assert.equal(lines(convert(paragraph('Title', 'Heading2'), style('Heading2', 'heading 2')))[0], '## Title');
});

test('a style that merely looks similar is no heading', () => {
  const styles = style('berschrift1', 'Überschrift 1') + style('Zitat', 'heading 7') + style('Liste', 'heading 1 Liste');
  const markdown = convert(paragraph('Kein Titel', 'berschrift1') + paragraph('Auch nicht', 'Zitat') +
    paragraph('Ebenso', 'Liste'), styles);
  assert.deepEqual(lines(markdown).slice(0, 3), ['Kein Titel', 'Auch nicht', 'Ebenso']);
});

done();
