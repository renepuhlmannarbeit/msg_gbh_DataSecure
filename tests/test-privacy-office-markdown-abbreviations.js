'use strict';

// RC178 review R-033. Markdown from Office and PDF sources writes every
// literal period as "\.". The rules for an abbreviated telephone label, for
// academic titles and for "geb." did not read that form: "Tel\. 030 …",
// "Dr\. Anna Meier" and "geb\. 12\.03\.1980" stayed in the released Markdown
// of a Word document, while the same line from a text file was replaced.
// Found in a native run, in the result of a converted Word form.
// Each case converts a real DOCX with the Standalone extractor and sends the
// result through the shared text privacy operation with the automatic policy;
// the same line as plain text is the reference. All values are invented.
const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } =
  require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { makeRegistry } = require('../plugins/data-secure/server/privacy/entities');
const { testAsync, assert, done } = createSuite('Abbreviations in Markdown from Office sources');
const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: true };
const PROFILES = ['general', 'contract', 'personnel_profile', 'applicant', 'customer'];
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function fromWord(line) {
  const escaped = line.replace(/&/gu, '&amp;').replace(/</gu, '&lt;');
  const buffer = zipStore([...opcControlEntries('docx'),
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body><w:p><w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p></w:body></w:document>`]]);
  return extractMarkdownBuffer(buffer, '.docx', { partialExtraction: true, markdownOutput: 'content-v1' }).markdown;
}
async function release(text, profile) {
  const operation = prepareTextPrivacyReview({ text, profile, productChannel: 'standalone',
    consumerOptions: { productChannel: 'standalone', contentOptions }, registry: makeRegistry(), captureTrace: false });
  const resolved = await resolveTextPrivacyReview(operation, undefined, { reviewPolicy: 'automatic-conservative' });
  return finalizeTextPrivacyReview(operation, resolved, { prefix: '', suffix: '' }).markdown;
}
// What a reader of the Markdown sees: without the escapes of literal characters.
const visible = (markdown) => markdown.replace(/\\([.\-_*#()[\]!+`>~|])/gu, '$1').replace(/&#32;/gu, ' ').trim();

async function main() {
  await testAsync('the extractor writes the period of an abbreviation as an escaped literal', async () => {
    // The premise of this file. If the extractor stops escaping, the cases below prove nothing.
    assert.equal(fromWord('Tel. 030 1234567'), 'Tel\\. 030 1234567');
    assert.equal(fromWord('Dr. Anna Meier kommt morgen.'), 'Dr\\. Anna Meier kommt morgen\\.');
  });

  await testAsync('a telephone number, a titled name and a birth date from Word are replaced as from text', async () => {
    const cases = [
      ['Tel. 030 1234567', /1234567/u],
      ['Fax. 030 1234568', /1234568/u],
      ['Rückfragen an die Zentrale, Tel. 030 1234567', /1234567/u],
      ['Dr. Anna Meier kommt morgen.', /Anna|Meier/u],
      ['Herr Dr. Meier hat unterschrieben.', /Meier/u],
      ['Frau Prof. Dr. med. Anna Meier hat unterschrieben.', /Anna|Meier/u],
      ['geb. 12.03.1980', /1980/u],
      ['Ansprechpartner: Hans Müller, Tel. 030 1234567', /Hans|Müller|1234567/u],
      // Found by the counter-check of the first three rules: the same form
      // behind "z. Hd." and behind the abbreviated number labels.
      ['z. Hd. Hans Müller', /Hans|Müller/u],
      ['Personalnr. 4711', /4711/u],
      ['Kunden-Nr. 4711', /4711/u],
      ['Rechnungsnr. 2024-1234', /1234/u],
      ['Az. 12 C 345/24', /345/u]
    ];
    for (const profile of PROFILES) {
      for (const [line, sensitive] of cases) {
        const text = await release(line, profile);
        const word = await release(fromWord(line), profile);
        assert.doesNotMatch(text, sensitive, `${profile}: text reference of ${line}`);
        assert.doesNotMatch(word, sensitive, `${profile}: from Word: ${line}`);
        assert.equal(visible(word), visible(text), `${profile}: ${line}`);
      }
    }
  });

  await testAsync('text without an escaped period is read exactly as before', async () => {
    // The optional backslash must not turn a path or a literal backslash into a title or a label.
    for (const [line, released] of [
      ['Ordner C:\\Dr\\Anna Meier\\Tel', 'Ordner C:\\Dr\\Anna Meier\\Tel'],
      ['Der Dr ist da. Die Tel ist alt.', 'Der Dr ist da. Die Tel ist alt.'],
      ['Tel. [PHONE_REDACTED]', 'Tel. [PHONE_REDACTED]']
    ]) assert.equal(await release(line, 'general'), released, line);
  });
  done();
}
main();
