import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fromMarkdown } from '../native/markdown/pilot/node_modules/mdast-util-from-markdown/index.js';
import { parseFragment } from '../native/markdown/pilot/node_modules/parse5/dist/index.js';
import { literalSupplementPresentation } from './helpers/conversion-fixtures.mjs';
const require = createRequire(import.meta.url);
const { markdownImageContent, literalAlt } = require('../plugins/data-secure/server/standalone/markdown-image-content');
const { officeContent, validateMarkdownOutput } = require('../plugins/data-secure/server/standalone/markdown-output-profile');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { csvToMarkdown } = require('../plugins/data-secure/server/document-parser');
const { tableHeaderAt } = require('../plugins/data-secure/server/privacy/base');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const markdownIt = require('markdown-it')({ html: true }); // Independent rendering oracle, test-only.
const readers = { fromMarkdown, parseFragment };
const convert = source => markdownImageContent(source, readers).markdown;
const cases = [
  ['inline', 'Vor ![Überblick](picture.png) nach.', 'Vor Überblick nach.'],
  ['decorative', 'Vor ![](picture.png) nach.', 'Vor  nach.'],
  ['data', '![Titel](data:image/png;base64,AAAA)', 'Titel'],
  ['reference', '![Titel][bild]\n\n[bild]: picture.png', 'Titel\n\n'],
  ['shared reference', '![Titel][bild] [Quelle][bild]\n\n[bild]: picture.png', 'Titel [Quelle][bild]\n\n[bild]: picture.png'],
  ['shortcut', '![Titel]\n\n[Titel]: picture.png', 'Titel\n\n'],
  ['linked image', '[![Titel](picture.png)](https://example.invalid)', '[Titel](https://example.invalid)'],
  ['alt entities', '![A &amp; B](picture.png)', 'A &amp; B'],
  ['inline code', '`![Code](picture.png)` und ![Text](picture.png)', '`![Code](picture.png)` und Text'],
  ['fenced code', '```md\n![Code](picture.png)\n<img src="x">\n```\n![Text](picture.png)', '```md\n![Code](picture.png)\n<img src="x">\n```\nText'],
  ['indented code', '    ![Code](picture.png)\n\n![Text](picture.png)', '    ![Code](picture.png)\n\nText'],
  ['escaped', '\\![Code](picture.png)', '\\![Code](picture.png)'],
  ['html', 'Vor <img src="picture.png" alt="Überblick"> nach.', 'Vor Überblick nach.'],
  ['picture', '<picture><source srcset="private.png"><img src="picture.png" alt="Überblick"></picture>', 'Überblick'],
  ['figure caption', '<figure><img src="x" alt="Diagramm"><figcaption>Daten 2026</figcaption></figure>', '<figure>Diagramm<figcaption>Daten 2026</figcaption></figure>'],
  ['audio source retained', '<audio><source src="audio.ogg"></audio>', '<audio><source src="audio.ogg"></audio>'],
  ['unicode offsets', '😀 ![Ä Ö](picture.png) <img src="x" alt="ß">', '😀 Ä Ö ß'],
  ['CRLF', '> ![Bild](x)\r\n> Text\r\n', '> Bild\r\n> Text\r\n'],
  ['blockquote HTML', '> <picture>\n> <img src="x" alt="Bild">\n> </picture>\n', '> \n> Bild\n> \n'],
  ['multiline img', '<img\n src="x"\n alt="Bild">', 'Bild'],
  ['code cannot swallow HTML', '`<script>`\n\n<img src="x" alt="Bild">', '`<script>`\n\nBild'],
  ['HTML comments retained', '<!-- <img src="x" alt="literal"> -->', '<!-- <img src="x" alt="literal"> -->'],
  ['code literal tags', '`<img src="x" alt="literal">`', '`<img src="x" alt="literal">`'],
  ['prose source URL', 'Pfad picture.png und https://example.invalid/image.png bleiben.', 'Pfad picture.png und https://example.invalid/image.png bleiben.'],
  ['source heading remains', '## Zusätzlicher Bildtext (OCR)\n\nFachlich vergebene Überschrift.', '## Zusätzlicher Bildtext (OCR)\n\nFachlich vergebene Überschrift.'],
  ['table', '| Wert |\n| --- |\n| ![Bild](x) |\n| `![Literal](x)` |', '| Wert |\n| --- |\n| Bild |\n| `![Literal](x)` |'],
  ['multiline blockquote image', '> <img\n> src="secret.png"\n> alt="Diagramm">', '> Diagramm'],
  ['nested blockquote image', '> > <img\r\n> > src="data:image/png;base64,AAAA"\r\n> > alt="Diagramm">', '> > Diagramm'],
  ['list blockquote image', '- > <img\n  > alt="Bild"\n  > src="x">', '- > Bild'],
  ['multiline blockquote alt', '> <img alt="a\n> b" src="x">', '> a\n> b'],
  ['multiline blockquote picture', '> <picture>\n> <source\n> srcset="secret.png">\n> <img alt="Titel" src="x">\n> </picture>', '> \n> \n> Titel\n> '],
  ['SVG image and text', '<svg><image href="data:image/png;base64,AAAA"/><text>Textdiagramm</text></svg>', 'Textdiagramm'],
  ['inline SVG and text', 'Vor <svg><image href="x"/><text>Ä Ö &amp; ß</text></svg> nach', 'Vor Ä Ö &amp; ß nach'],
  ['SVG code literal', '`<svg><image href="data:image/png;base64,AAAA"/></svg>`', '`<svg><image href="data:image/png;base64,AAAA"/></svg>`'],
  ['image tooltip title', '![Titel](x "Fachliche Bildunterschrift")', 'Titel — Fachliche Bildunterschrift'],
  ['HTML tooltip title', '<img title="Fachtext" src="x">', 'Fachtext'],
  ['SVG tspan does not split words', '<svg><text>Name: Anna <tspan>Beispiel</tspan></text><text>42 Projekte</text></svg>', 'Name: Anna Beispiel 42 Projekte'],
  ['SVG accessibility title', '<svg aria-label="Titel"><image href="x"/></svg>', 'Titel'],
  ['SVG foreign object text', '<svg><foreignObject><p>Fachtext 42</p></foreignObject><image href="x"/></svg>', 'Fachtext 42'],
  ['self closing SVG', '<svg aria-label="Titel"/>', 'Titel'],
  ['reference title', '![Titel][bild]\n\n[bild]: x "Fachbeschreibung"', 'Titel — Fachbeschreibung\n\n'],
  ['collapsed reference title', '![Titel][]\n\n[Titel]: x "Fachbeschreibung"', 'Titel — Fachbeschreibung\n\n'],
  ['shortcut reference title', '![Titel]\n\n[Titel]: x "Fachbeschreibung"', 'Titel — Fachbeschreibung\n\n'],
  ['first reference definition wins', '![Ä][Ü]\n\n[ü]: x "Erste"\n[Ü]: y "Zweite"', 'Ä — Erste\n\n\n'],
  ['SVG separate blocks', '<svg><foreignObject><div>Erster</div><div>Zweiter</div></foreignObject></svg>', 'Erster\nZweiter'],
  ['SVG inline spans', '<svg><foreignObject><p>Anna <span>Beispiel</span><br>42 Projekte</p></foreignObject></svg>', 'Anna Beispiel\n42 Projekte'],
  ['generated paragraphs stay quoted', '> <svg><foreignObject><div>Anna&#10;&#10;Beispiel</div></foreignObject></svg>', '> Anna\n> \n> Beispiel'],
  ['generated paragraphs stay listed', '- <svg><foreignObject><pre>Anna&#10;&#10;Beispiel</pre></foreignObject></svg>', '- Anna\n  \n  Beispiel'],
  ['generated paragraphs nested containers', '> 12. <svg><foreignObject><pre>Anna&#13;&#10;&#13;&#10;Beispiel</pre></foreignObject></svg>', '> 12. Anna\r\n>     \r\n>     Beispiel']
];
for (const [label, source, expected] of cases) {
  assert.equal(convert(source), expected, label);
  assert.equal(convert(expected), expected, `${label}: idempotent`);
}
const alt = '<script> & [PERSON_011] A*B _C_ | § € ± →';
const rendered = markdownIt.renderInline(literalAlt(alt));
assert.doesNotMatch(rendered, /<script>|<em>|<strong>/u);
assert.match(rendered, /&lt;script&gt; &amp; \[PERSON_011\] A\*B _C_ \| § € ± →/u);
const quoted = markdownIt.parse(convert('> <svg><foreignObject><div>Anna&#10;&#10;Beispiel</div></foreignObject></svg>'), {});
assert.equal(quoted.filter(token => token.type === 'blockquote_open').length, 1);
assert.ok(quoted.filter(token => token.type === 'inline').every(token => token.level >= 2), 'both paragraphs remain inside quote');
const listed = markdownIt.parse(convert('- <svg><foreignObject><pre>Anna&#10;&#10;Beispiel</pre></foreignObject></svg>'), {});
assert.equal(listed.filter(token => token.type === 'list_item_open').length, 1, 'no generated extra list item');
assert.ok(listed.filter(token => token.type === 'inline').every(token => token.level >= 3), 'both paragraphs remain inside list item');
const literalSource = '![Literal](data:image/png;base64,AAAA) <img src=secret.png>\n# Kein Markdown\n1. Keine Liste\n`Code` und *Text* &amp; § € ± →';
assert.equal(extractMarkdownBuffer(Buffer.from(literalSource), '.txt').markdown, literalSource, 'legacy TXT is byte-equivalent');
assert.equal(extractMarkdownBuffer(Buffer.from(literalSource), '.txt', { markdownOutput: 'notes-v1' }).markdown,
  literalSource, 'notes TXT retains the existing presentation contract');
const literalMarkdown = extractMarkdownBuffer(Buffer.from(literalSource), '.txt', { markdownOutput: 'content-v1' }).markdown;
const literalHtml = markdownIt.render(literalMarkdown);
assert.doesNotMatch(literalHtml, /<(?:img|h1|ol|li|pre|code|em|strong)(?:\s|>)/u, 'TXT must not introduce Markdown/image nodes');
assert.match(literalHtml, /!\[Literal\]\(data:image\/png;base64,AAAA\) &lt;img src=secret.png&gt;/u,
  'literal source characters stay visible, not erased as a picture');
assert.match(literalHtml, /`Code` und \*Text\* &amp;amp; § € ± →/u);
const csvLiteral = '"![Literal](data:image/png;base64,AAAA)"';
assert.equal(extractMarkdownBuffer(Buffer.from(csvLiteral), '.csv', { markdownOutput: 'content-v1' }).markdown,
  extractMarkdownBuffer(Buffer.from(csvLiteral), '.csv').markdown, 'raw CSV was already inert and remains unchanged');
const privacyCsvSource = 'Personalnummer,Passwort,Name,Unternehmen,Notiz\n' +
  'AB123,verysecret,Anna Beispiel,Beispielwerke GmbH,"![Literal](data:image/png;base64,AAAA) <img src=secret.png> § € ± →"';
const privacyCsv = csvToMarkdown(privacyCsvSource, { literalCells: true });
assert.doesNotMatch(markdownIt.render(privacyCsv), /<img(?:\s|>)/u, 'privacy CSV cells cannot introduce images');
assert.equal(tableHeaderAt(privacyCsv, privacyCsv.indexOf('AB123')), 'Personalnummer');
assert.equal(tableHeaderAt(privacyCsv, privacyCsv.indexOf('verysecret')), 'Passwort');
assert.equal(tableHeaderAt(privacyCsv, privacyCsv.indexOf('Anna Beispiel')), 'Name');
for (const profile of ['general', 'personnel_profile']) {
  const clean = anonymizeMarkdown(privacyCsv, profile, { deferPersonReview: true }).text;
  assert.doesNotMatch(clean, /AB123|verysecret|Anna Beispiel|Beispielwerke GmbH/u, 'privacy retains source column meaning');
  assert.match(markdownIt.render(clean), /§ € ± →/u, 'professional symbols remain');
}
assert.equal(csvToMarkdown(privacyCsvSource), csvToMarkdown(privacyCsvSource, { literalCells: false }), 'legacy CSV unchanged');
const presentationBytes = literalSupplementPresentation();
const presentation = extractMarkdownBuffer(presentationBytes, '.pptx', { markdownOutput: 'content-v1' }).markdown;
assert.doesNotMatch(markdownIt.render(presentation), /<img(?:\s|>)/u, 'chart/layout/master source text is literal too');
assert.doesNotMatch(markdownIt.render(presentation), /<s>/u, 'supplemental literal tildes retain visible source characters');
assert.equal((markdownIt.render(presentation).match(/!\[Literal\]\(data:image\/png;base64,AAAA\)/gu) || []).length, 3,
  'all three supplemental source values remain visible');
assert.match(presentation, /42/u, 'stored chart value retained');
assert.doesNotMatch(presentation, /## (?:Diagrammdaten|Folienlayout|Folienmaster) [^\n]+\.xml/u, 'only generated technical part labels neutralized');
for (const extension of ['.csv']) {
  const bytes = Buffer.from('"~~Fachwort~~"');
  assert.match(markdownIt.render(extractMarkdownBuffer(bytes, extension).markdown), /<s>Fachwort<\/s>/u, 'legacy presentation retained');
  assert.equal(extractMarkdownBuffer(bytes, extension, { markdownOutput: 'notes-v1' }).markdown,
    extractMarkdownBuffer(bytes, extension).markdown, 'notes CSV remains byte-equivalent to legacy');
  const content = extractMarkdownBuffer(bytes, extension, { markdownOutput: 'content-v1' }).markdown;
  assert.doesNotMatch(markdownIt.render(content), /<s>/u, 'new literal CSV must not activate GFM strikethrough');
  assert.match(markdownIt.render(content), /~~Fachwort~~/u, 'literal tildes remain visible');
}
assert.doesNotMatch(markdownIt.render(csvToMarkdown('Notiz\n"~~Fachwort~~"', { literalCells: true })), /<s>/u);
const own = [{ source_part: 'xl/charts/chart1.xml', markdown: '## Diagrammdaten chart1.xml\n\nTitel | 1 | 2' },
  { source_part: 'word/document.xml', markdown: '## Diagrammdaten chart1.xml\n\nAutorentext' }];
assert.equal(officeContent(own), '## Diagrammdaten\n\nTitel | 1 | 2\n\n## Diagrammdaten chart1.xml\n\nAutorentext');
for (const invalid of [null, false, {}, 'content', 'content-v2', 'with-notices']) {
  assert.throws(() => validateMarkdownOutput(invalid), { code: 'CONVERSION_INPUT_INVALID' });
}
assert.equal(validateMarkdownOutput(undefined), undefined, 'no silent legacy change');
assert.throws(() => extractMarkdownBuffer(Buffer.from('![Titel](x)'), '.md', { markdownOutput: 'content-v1' }),
  { code: 'CONVERSION_INPUT_INVALID' }, 'direct synchronous extractor cannot falsely claim transformed MD');
for (const mode of ['content-v1', 'notes-v1']) assert.equal(validateMarkdownOutput(mode), mode);
assert.throws(() => convert('\ud800'), /Markdown/u);
assert.throws(() => convert('<svg><image href="data:image/png;base64,AAAA"/>'), { code: 'MARKDOWN_CONTENT_TRANSFORM_FAILED' });
console.log(`${cases.length} Markdown image syntax cases plus literal/provenance/profile counterexamples passed.`);
