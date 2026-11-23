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

test('a soft hyphen still produces no visible character', () => {
  const markdown = convert(`<w:p><w:r>${text('Tren')}<w:softHyphen/>${text('nung')}</w:r></w:p>`, content);
  assert.match(markdown, /Trennung/u);
});

done();
