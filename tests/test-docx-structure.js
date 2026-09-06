'use strict';

// In-memory synthetic documents only. These cases guard against silent text
// loss before the privacy engine; no source document or local keyring is used.
const { createSuite, assertAbsent, assertPresent } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { parseOoxml } = require('../plugins/data-secure/server/ooxml');
const pii = require('../plugins/data-secure/server/pii-engine');
const reviewFixtures = require('./lib/docx-review-fixtures');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { test, done, assert } = createSuite('DOCX bounded structural renderer');

const namespaces = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const escapeXml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = value => `<w:r><w:t>${escapeXml(value)}</w:t></w:r>`;
const paragraph = value => `<w:p>${run(value)}</w:p>`;
const cell = value => `<w:tc>${value}</w:tc>`;
const table = rows => `<w:tbl>${rows.map(row => `<w:tr>${row.map(cell).join('')}</w:tr>`).join('')}</w:tbl>`;
const textbox = value => `<w:r><w:drawing><wps:wsp><wps:txbx><w:txbxContent>${value}</w:txbxContent></wps:txbx></wps:wsp></w:drawing></w:r>`;
const stories = [
  ['body', null, null, null],
  ['hdr', 'header1.xml', 'header', null],
  ['ftr', 'footer1.xml', 'footer', null],
  ['comments', 'comments.xml', 'comments', 'comment'],
  ['footnotes', 'footnotes.xml', 'footnotes', 'footnote'],
  ['endnotes', 'endnotes.xml', 'endnotes', 'endnote']
];
function documentFor(content, story = stories[0]) {
  const [tag, part, relation, item] = story;
  const main = part ? paragraph('MAIN_CONTROL') : content;
  const storyContentType = {
    header: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml',
    footer: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml',
    comments: 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml',
    footnotes: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml',
    endnotes: 'application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml'
  }[relation];
  const entries = [...opcControlEntries('docx', {
    additionalOverrides: part ? [{ part: `word/${part}`, contentType: storyContentType }] : []
  }),
    ['word/document.xml', `<w:document ${namespaces}><w:body>${main}</w:body></w:document>`]];
  if (part) entries.push(
    [`word/${part}`, `<w:${tag} ${namespaces}>${item ? `<w:${item} w:id="1">${content}</w:${item}>` : content}</w:${tag}>`],
    ['word/_rels/document.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${relation}" Target="${part}"/></Relationships>`]
  );
  return zipStore(entries);
}
function parse(content, story) { return parseOoxml(documentFor(content, story), '.docx'); }
function parseMainXml(xml) {
  return parseOoxml(zipStore([
    ...opcControlEntries('docx'),
    ['word/document.xml', xml]
  ]), '.docx');
}
function onceInOrder(markdown, expected) {
  let previous = -1;
  for (const token of expected) {
    const index = markdown.indexOf(token);
    assert.ok(index > previous, `missing or reordered token ${token}`);
    assert.strictEqual(markdown.indexOf(token, index + token.length), -1, `duplicated token ${token}`);
    previous = index;
  }
}
function rejects(content, story, code = 'DOCX_STRUCTURE_UNSAFE') {
  assert.throws(() => parse(content, story), error => {
    assert.strictEqual(error.code, code);
    assert.doesNotMatch(error.message, /SECRET|example|Mustermann|word\//);
    return true;
  });
}

test('WordprocessingML uses namespace URIs instead of trusting the textual prefix', () => {
  const uri = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const result = parseMainXml(`<doc:document xmlns:doc="${uri}"><body:body xmlns:body="${uri}"><para:p xmlns:para="${uri}"><run:r xmlns:run="${uri}"><text:t xmlns:text="${uri}">ALTERNATIVE_PREFIX</text:t></run:r></para:p></body:body></doc:document>`);
  assert.deepStrictEqual(result.warnings, []);
  assertPresent(result.markdown, 'ALTERNATIVE_PREFIX');

  const defaultNamespace = parseMainXml(`<document xmlns="${uri}"><body><p><r><t>DEFAULT_NAMESPACE</t></r></p></body></document>`);
  assert.deepStrictEqual(defaultNamespace.warnings, []);
  assertPresent(defaultNamespace.markdown, 'DEFAULT_NAMESPACE');

  const falseNamespace = parseMainXml('<w:document xmlns:w="urn:not-wordprocessingml"><w:body><w:p><w:r><w:t>FALSE_NAMESPACE</w:t></w:r></w:p></w:body></w:document>');
  assert.strictEqual(falseNamespace.markdown, '');
  assert.ok(falseNamespace.warnings.length > 0);
  assertAbsent(falseNamespace.warnings.join(' '), 'FALSE_NAMESPACE');
});

test('OPC part names in a non-canonical case cannot bypass the story coverage gate', () => {
  // ECMA-376 treats part names case-insensitively, while every gate here
  // addresses fixed parts by their canonical spelling. A case-variant story
  // passed the inventory, was never rendered and was never reported.
  const commentsType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml';
  const footnotesType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml';
  const relationships = (relation, target) => `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${relation}" Target="${target}"/></Relationships>`;
  for (const [part, relation, contentType, tag, item] of [
    ['Comments.xml', 'comments', commentsType, 'comments', 'comment'],
    ['FOOTNOTES.xml', 'footnotes', footnotesType, 'footnotes', 'footnote']
  ]) {
    const result = parseOoxml(zipStore([
      ...opcControlEntries('docx', { additionalOverrides: [{ part: `word/${part}`, contentType }] }),
      ['word/document.xml', `<w:document ${namespaces}><w:body>${paragraph('MAIN_CONTROL')}</w:body></w:document>`],
      [`word/${part}`, `<w:${tag} ${namespaces}><w:${item} w:id="1">${paragraph('SECRET_STORY_TEXT')}</w:${item}></w:${tag}>`],
      ['word/_rels/document.xml.rels', relationships(relation, part)]
    ]), '.docx');
    assert.ok(result.warnings.length > 0, `${part} must produce a coverage warning`);
    assertAbsent(result.markdown, 'SECRET_STORY_TEXT');
    assertAbsent(result.warnings.join(' '), 'SECRET_STORY_TEXT');
    assertAbsent(result.warnings.join(' '), part);
  }
  // A second main part that differs only in case is one ambiguous OPC part.
  assert.throws(() => parseOoxml(zipStore([
    ...opcControlEntries('docx'),
    ['word/document.xml', `<w:document ${namespaces}><w:body>${paragraph('MAIN_CONTROL')}</w:body></w:document>`],
    ['Word/Document.xml', `<w:document ${namespaces}><w:body>${paragraph('SECRET_STORY_TEXT')}</w:body></w:document>`]
  ]), '.docx'), (error) => {
    assert.match(error.message, /doppelten Eintrag/u);
    assert.doesNotMatch(error.message, /SECRET|Document\.xml/u);
    return true;
  });
  // The canonical spelling keeps rendering exactly once.
  const canonical = parse(paragraph('CANONICAL_COMMENT'), stories[3]);
  assert.deepStrictEqual(canonical.warnings, []);
  assertPresent(canonical.markdown, 'CANONICAL_COMMENT');
});

test('blocked Word constructs cannot evade coverage with another valid prefix', () => {
  const uri = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const result = parseMainXml(`<x:document xmlns:x="${uri}"><x:body><x:p><x:r><x:instrText>PRIVATE_FIELD</x:instrText><x:t>VISIBLE</x:t></x:r></x:p></x:body></x:document>`);
  assert.ok(result.warnings.length > 0);
  assert.match(result.warnings.join(' '), /nicht unterstützte inhaltsfähige OOXML-Part/iu);

  const math = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
  const mathResult = parseMainXml(`<x:document xmlns:x="${uri}" xmlns:formula="${math}"><x:body><formula:oMath><formula:r><formula:t>PRIVATE_FORMULA</formula:t></formula:r></formula:oMath></x:body></x:document>`);
  assert.ok(mathResult.warnings.length > 0);
  assertAbsent(mathResult.warnings.join(' '), 'PRIVATE_FORMULA');
});

for (const story of stories) {
  test(`${story[0]} preserves nested tables, following cells and rows once in source order`, () => {
    const expected = ['OUTER_BEFORE', 'INNER_FIRST', 'INNER_SECOND', 'INNER_NEXT_ROW', 'OUTER_AFTER', 'NEXT_CELL', 'NEXT_OUTER_ROW', 'AFTER_TABLE'];
    const content = table([
      [paragraph(expected[0]) + table([[paragraph(expected[1]), paragraph(expected[2])], [paragraph(expected[3])]]) + paragraph(expected[4]), paragraph(expected[5])],
      [paragraph(expected[6])]
    ]) + paragraph(expected[7]);
    const result = parse(content, story);
    assert.deepStrictEqual(result.warnings, []);
    onceInOrder(result.markdown, expected);
    assert.match(result.markdown, /OUTER_BEFORE<br>\\\| INNER_FIRST \\\| INNER_SECOND \\\|<br>/);
    assert.match(result.markdown, /OUTER_AFTER \| NEXT_CELL \|/);
  });

  test(`${story[0]} preserves outer runs before, between and after text boxes`, () => {
    const expected = ['OUTER_START', 'BOX_FIRST', 'BOX_SECOND', 'OUTER_MIDDLE', 'BOX_LAST', 'OUTER_END', 'FOLLOWING_PARAGRAPH'];
    const content = `<w:p>${run(expected[0])}${textbox(paragraph(expected[1]) + paragraph(expected[2]))}${run(expected[3])}${textbox(paragraph(expected[4]))}${run(expected[5])}</w:p>${paragraph(expected[6])}`;
    const result = parse(content, story);
    assert.deepStrictEqual(result.warnings, []);
    onceInOrder(result.markdown, expected);
  });

  test(`${story[0]} rejects malformed table and text-box nesting without a partial result`, () => {
    for (const malformed of [
      `<w:tbl><w:tr><w:tc>${paragraph('SECRET')}</w:tr></w:tc></w:tbl>`,
      `<w:tbl><w:tr><w:tc>${paragraph('SECRET')}</w:tc></w:tbl>`,
      `<w:tr><w:tc>${paragraph('SECRET')}</w:tc></w:tr>`,
      `<w:tbl><w:tc>${paragraph('SECRET')}</w:tc></w:tbl>`,
      `<w:p>${run('SECRET')}${paragraph('INNER')}</w:p>`,
      `<w:p>${run('SECRET')}${textbox(paragraph('INNER')).replace('</w:txbxContent>', '</wps:txbx>')}</w:p>`,
      '<w:p><w:r><w:t>SECRET</w:r></w:t></w:p>',
      '<w:p><w:r><w:t>SECRET</w:t></w:r>'
    ]) rejects(paragraph('BEFORE') + malformed + paragraph('AFTER'), story);
  });
}

test('nested table and textbox combinations preserve each text leaf once', () => {
  let content = paragraph('INNERMOST');
  for (let index = 0; index < 8; index++) content = table([[paragraph(`BEFORE_${index}_`) + `<w:p>${textbox(content)}</w:p>` + paragraph(`AFTER_${index}_`)], [paragraph(`ROW_${index}_`)]]);
  const result = parse(content);
  const expected = Array.from({ length: 8 }, (_, i) => `BEFORE_${7 - i}_`).concat('INNERMOST', ...Array.from({ length: 8 }, (_, i) => [`AFTER_${i}_`, `ROW_${i}_`]));
  onceInOrder(result.markdown, expected);
  assert.deepStrictEqual(result.warnings, []);
});

test('table leaves escape backslashes and pipes once, including nested tables', () => {
  const result = parse(table([[paragraph('BEFORE'), table([[paragraph('A\\B|C'), paragraph('D&E')]]) + paragraph('AFTER')]]));
  assertPresent(result.markdown, 'A\\\\B\\|C');
  assertAbsent(result.markdown, 'A\\\\\\\\B');
  onceInOrder(result.markdown, ['BEFORE', 'A\\\\B\\|C', 'D&E', 'AFTER']);
});

test('run joining, paragraph styles, empty cells and paragraph boundaries remain stable', () => {
  const styled = '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t xml:space="preserve">First </w:t><w:t>part</w:t><w:tab/><w:t>second</w:t><w:br/><w:t>third</w:t></w:r></w:p>';
  const result = parse(styled + '<w:p/>' + table([[paragraph('A') + paragraph('B'), '<w:p/>'], [paragraph('C')]]));
  assert.strictEqual(result.markdown, '## First part\tsecond\nthird\n\n| A<br>B |  |\n| --- | --- |\n| C |  |');
});

test('ordinary table cells remain supported while merged Word cells fail closed', () => {
  const ordinary = parse(table([[paragraph('Name'), paragraph('Steuer-ID')], [paragraph('Max Mustermann'), paragraph('26954371827')]]));
  assert.deepStrictEqual(ordinary.warnings, []);
  assertPresent(ordinary.markdown, '| Name | Steuer-ID |');

  for (const property of [
    '<w:gridSpan w:val="2"/>',
    '<w:vMerge w:val="restart"/>',
    '<w:vMerge/>'
  ]) {
    rejects(`<w:tbl><w:tr><w:tc><w:tcPr>${property}</w:tcPr>${paragraph('SECRET')}</w:tc></w:tr></w:tbl>`);
  }
});

test('modern text-box choice does not duplicate fallback text or drop outer runs', () => {
  const result = parse(`<w:p>${run('BEFORE')}<w:r><mc:AlternateContent><mc:Choice Requires="wps">${textbox(paragraph('CHOICE'))}</mc:Choice><mc:Fallback>${textbox(paragraph('FALLBACK'))}</mc:Fallback></mc:AlternateContent></w:r>${run('AFTER')}</w:p>`);
  onceInOrder(result.markdown, ['BEFORE', 'CHOICE', 'AFTER']);
  assertAbsent(result.markdown, 'FALLBACK');
});

test('unsupported markup choice uses exactly one declared fallback', () => {
  const content = `<w:p>${run('BEFORE')}<mc:AlternateContent>` +
    `<mc:Choice Requires="vendor"><w:r><w:t>UNSUPPORTED_PRIVATE</w:t></w:r></mc:Choice>` +
    `<mc:Fallback>${run('SAFE_FALLBACK')}</mc:Fallback>` +
    `</mc:AlternateContent>${run('AFTER')}</w:p>`;
  const xml = `<w:document ${namespaces} xmlns:vendor="urn:vendor:unsupported"><w:body>${content}</w:body></w:document>`;
  const result = parseMainXml(xml);
  onceInOrder(result.markdown, ['BEFORE', 'SAFE_FALLBACK', 'AFTER']);
  assertAbsent(result.markdown, 'UNSUPPORTED_PRIVATE');
});

test('markup choice without a supported branch or fallback stops safely', () => {
  for (const content of [
    '<mc:AlternateContent><mc:Choice Requires="vendor"><w:p><w:r><w:t>PRIVATE</w:t></w:r></w:p></mc:Choice></mc:AlternateContent>',
    '<mc:AlternateContent><mc:Fallback><w:p/></mc:Fallback><mc:Fallback><w:p/></mc:Fallback></mc:AlternateContent>',
    '<mc:Choice Requires="wps"><w:p/></mc:Choice>'
  ]) {
    const xml = `<w:document ${namespaces} xmlns:vendor="urn:vendor:unsupported"><w:body>${content}</w:body></w:document>`;
    assert.throws(() => parseMainXml(xml), error => error.code === 'DOCX_STRUCTURE_UNSAFE');
  }
});

test('realistic authored comments retain their body but author metadata keeps coverage blocked', () => {
  const buffer = reviewFixtures.reviewDocx(reviewFixtures.annotatedParagraph(), {
    comments: reviewFixtures.comment('42', 'COMMENT_BODY', true) + reviewFixtures.comment('43', 'POINT_COMMENT', true)
  });
  const result = parseOoxml(buffer, '.docx');
  onceInOrder(result.markdown, ['BODY_BEFORE', 'BODY_ANCHOR', 'BODY_AFTER', 'COMMENT_BODY', 'POINT_COMMENT']);
  assert.ok(result.warnings.length > 0);
  assert.doesNotMatch(result.warnings.join(' '), /Erika|Beispiel|COMMENT_BODY|word\//u);
  const converted = extractMarkdownBuffer(buffer, '.docx');
  assert.strictEqual(converted.coverage.status, 'incomplete');
  assert.ok(converted.markdown.includes('COMMENT\\_BODY'));
});

test('matching anonymous range and point comments remain covered across namespaces and quote spellings', () => {
  for (const prefix of ['w', 'word']) for (const namespace of [reviewFixtures.W, 'http://purl.oclc.org/ooxml/wordprocessingml/main']) {
    for (const range of [false, true]) {
      const body = reviewFixtures.annotatedParagraph('+00042', range).replaceAll('"', "'");
      const buffer = reviewFixtures.reviewDocx(body, { prefix, namespace, comments: reviewFixtures.comment('42').replaceAll('"', "'") });
      const result = parseOoxml(buffer, '.docx');
      assert.deepStrictEqual(result.warnings, []);
      onceInOrder(result.markdown, ['BODY_BEFORE', 'BODY_ANCHOR', 'BODY_AFTER', 'COMMENT_BODY']);
    }
  }
});

test('missing, mismatched, duplicate or unbound comment bodies never yield a complete privacy input', () => {
  const body = reviewFixtures.annotatedParagraph();
  for (const options of [{}, { comments: '' }, { comments: reviewFixtures.comment('7') },
    { comments: reviewFixtures.comment().replace(' w:id="42"', '') },
    { comments: reviewFixtures.comment() + reviewFixtures.comment('00042', 'DUPLICATE_COMMENT') },
    { comments: reviewFixtures.comment(), related: false }]) {
    const result = parseOoxml(reviewFixtures.reviewDocx(body, options), '.docx');
    assert.ok(result.warnings.length > 0);
    assert.doesNotMatch(result.warnings.join(' '), /BODY_|COMMENT|comments\.xml|42/u);
  }
  for (const id of ['', 'not-an-id', '9'.repeat(33)]) {
    const result = parseOoxml(reviewFixtures.reviewDocx(reviewFixtures.annotatedParagraph(id), { comments: reviewFixtures.comment() }), '.docx');
    assert.ok(result.warnings.length > 0);
  }
});

test('one missing, reversed or duplicated comment range endpoint is not a valid point comment', () => {
  const start = '<w:commentRangeStart w:id="42"/>';
  const end = '<w:commentRangeEnd w:id="42"/>';
  const reference = '<w:r><w:commentReference w:id="42"/></w:r>';
  for (const range of [start, end, end + start, start + start + end, start + end + end]) {
    const result = parseOoxml(reviewFixtures.reviewDocx(`<w:p>${range}${run('CONTROL')}${reference}</w:p>`, { comments: reviewFixtures.comment() }), '.docx');
    assert.ok(result.warnings.length > 0);
  }
});

test('property revisions cannot masquerade as current formatting or bypass the revision coverage gate', () => {
  for (const prefix of ['w', 'word']) for (const [name, body] of reviewFixtures.propertyRevisions()) {
    const buffer = reviewFixtures.reviewDocx(body, { prefix });
    const result = parseOoxml(buffer, '.docx');
    assert.ok(result.warnings.length > 0, name);
    assertPresent(result.markdown, 'VISIBLE_CONTROL');
    assert.doesNotMatch(result.warnings.join(' '), /Erika|Beispiel|VISIBLE_CONTROL/u);
    if (name === 'pPrChange') assert.strictEqual(result.markdown, '# VISIBLE_CONTROL', 'old Heading2 cannot replace current Heading1');
    assert.strictEqual(extractMarkdownBuffer(buffer, '.docx').coverage.status, 'incomplete');
  }
  const clean = parse('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' + run('UNCHANGED_HEADING') + '</w:p>');
  assert.deepStrictEqual(clean.warnings, []);
  assert.strictEqual(clean.markdown, '# UNCHANGED_HEADING');
});

test('insertions, deletions, moves and revision range metadata stay blocked in every story', () => {
  for (const story of stories) for (const name of ['ins', 'del', 'moveFrom', 'moveTo', 'moveFromRangeStart', 'moveToRangeEnd',
    'customXmlInsRangeStart', 'customXmlDelRangeEnd', 'customXmlMoveFromRangeStart', 'customXmlMoveToRangeEnd']) {
    const revision = `<w:${name} w:id="7" w:author="Erika Beispiel"/>`;
    const result = parse(paragraph('CONTROL') + revision, story);
    assert.ok(result.warnings.length > 0, `${story[0]}:${name}`);
    assert.doesNotMatch(result.warnings.join(' '), /Erika|Beispiel|CONTROL/u);
  }
});

test('internal AlternateContent branch names cannot be supplied through canonical or aliased XML prefixes', () => {
  assert.throws(() => parseOoxml(reviewFixtures.invalidAlternateDocx(), '.docx'), error => error.code === 'DOCX_STRUCTURE_UNSAFE');
  for (const name of ['ChoiceSupported', 'ChoiceUnsupported']) {
    const body = `<alias:AlternateContent xmlns:alias="${reviewFixtures.MC}"><alias:${name} Requires="wps">${paragraph('SECRET')}</alias:${name}><alias:Fallback>${paragraph('FALLBACK')}</alias:Fallback></alias:AlternateContent>`;
    rejects(body);
  }
});

test('multiple AlternateContent choices resolve every required URI and select one branch only', () => {
  const body = `<w:p>${run('BEFORE')}<mc:AlternateContent>` +
    `<mc:Choice Requires="wps vendor">${run('UNSUPPORTED')}</mc:Choice>` +
    `<mc:Choice Requires="shape">${run('SELECTED')}</mc:Choice>` +
    `<mc:Choice Requires="wps">${run('LATER_CHOICE')}</mc:Choice>` +
    `<mc:Fallback>${run('FALLBACK')}</mc:Fallback></mc:AlternateContent>${run('AFTER')}</w:p>`;
  const result = parseOoxml(reviewFixtures.reviewDocx(body), '.docx');
  onceInOrder(result.markdown, ['BEFORE', 'SELECTED', 'AFTER']);
  for (const value of ['UNSUPPORTED', 'LATER_CHOICE', 'FALLBACK']) assertAbsent(result.markdown, value);
  const rebound = body.replace('Requires="shape"', 'Requires="shape" xmlns:shape="urn:unsupported"');
  const next = parseOoxml(reviewFixtures.reviewDocx(rebound), '.docx');
  onceInOrder(next.markdown, ['BEFORE', 'LATER_CHOICE', 'AFTER']);
  assertAbsent(next.markdown, 'SELECTED');
});

test('recursive DrawingML and VML text boxes retain surrounding runs with one selected nested fallback', () => {
  const inner = `<w:p>${run('INNER_BEFORE')}<mc:AlternateContent><mc:Choice Requires="vendor">${run('SKIPPED_INNER')}</mc:Choice><mc:Fallback>${run('INNER_FALLBACK')}</mc:Fallback></mc:AlternateContent>${run('INNER_AFTER')}</w:p>`;
  const vml = `<w:r><w:pict><v:shape><v:textbox><w:txbxContent>${inner}</w:txbxContent></v:textbox></v:shape></w:pict></w:r>`;
  const body = `<w:p>${run('OUTER_BEFORE')}${textbox(`<w:p>${run('BOX_BEFORE')}${vml}${run('BOX_AFTER')}</w:p>`)}${run('OUTER_AFTER')}</w:p>`;
  const result = parseOoxml(reviewFixtures.reviewDocx(body), '.docx');
  onceInOrder(result.markdown, ['OUTER_BEFORE', 'BOX_BEFORE', 'INNER_BEFORE', 'INNER_FALLBACK', 'INNER_AFTER', 'BOX_AFTER', 'OUTER_AFTER']);
  assertAbsent(result.markdown, 'SKIPPED_INNER');
  const malformed = body.replace('</v:textbox>', '</v:shape>');
  assert.throws(() => parseOoxml(reviewFixtures.reviewDocx(malformed), '.docx'), error => error.code === 'DOCX_STRUCTURE_UNSAFE');
});

test('quoted angle brackets, comments and CDATA do not corrupt structural tokenization', () => {
  const result = parse('<w:p><w:r data-note="x > y"><w:t>BEFORE<!-- not a </w:p> -->AFTER</w:t><w:t><![CDATA[<literal>]]></w:t></w:r></w:p>');
  assert.strictEqual(result.markdown, 'BEFOREAFTER<literal>');
});

test('malformed tags, attributes and out-of-paragraph text runs fail closed', () => {
  for (const malformed of [
    '<w:p data-note=SECRET/>', '<w:p a="1" a="2"/>', '<w:p a="1"b="2"/>',
    '<w:p><w:r><w:t>SECRET<w:br/></w:t></w:r></w:p>',
    '<w:p>SECRET</w:p>', '<w:tbl><w:tr><w:tc>SECRET</w:tc></w:tr></w:tbl>',
    '<w:t>SECRET</w:t>', '<w:p><w:r><w:t>SECRET</w:t></w:r></w:p extra="1">',
    '<!DOCTYPE w:p><w:p/>', '<w:p><!-- SECRET</w:p>', '<w:p><![CDATA[SECRET]]></w:p>'
  ]) rejects(malformed);
});

test('foreign namespace elements cannot hide direct text from coverage', () => {
  rejects('<w:p><ext:secret xmlns:ext="urn:private">PRIVATE_HIDDEN</ext:secret>' + run('VISIBLE') + '</w:p>');
});

test('unterminated attribute whitespace is rejected without scanning subtrees repeatedly', () => {
  rejects('<w:p ' + ' '.repeat(250000) + 'SECRET');
});

test('XML depth has a deterministic safe boundary for body and all secondary stories', () => {
  const inside = '<w:sdt>'.repeat(125) + paragraph('BOUNDARY_TOKEN') + '</w:sdt>'.repeat(125);
  // Paragraph/run/text plus 125 wrappers = 128 XML elements of nesting.
  assert.strictEqual(parse(inside).markdown, 'BOUNDARY_TOKEN');
  for (const story of stories) rejects('<w:sdt>'.repeat(129) + paragraph('SECRET') + '</w:sdt>'.repeat(129), story, 'DOCX_STRUCTURE_LIMIT');
});

test('many shallow rows remain ordered without a recursive or variadic row limit', () => {
  const rows = Array.from({ length: 5000 }, (_, index) => [paragraph(`TOKEN_${String(index).padStart(5, '0')}_`)]);
  const result = parse(table(rows));
  const found = result.markdown.match(/TOKEN_\d{5}_/g);
  assert.deepStrictEqual(found, rows.map((_, index) => `TOKEN_${String(index).padStart(5, '0')}_`));
  assert.deepStrictEqual(result.warnings, []);
});

test('structural node and XML element budgets reject excessive empty structures', () => {
  rejects('<w:p/>'.repeat(200001), undefined, 'DOCX_STRUCTURE_LIMIT');
  rejects('<w:sdt/>'.repeat(1000001), undefined, 'DOCX_STRUCTURE_LIMIT');
});

test('table padding expansion is bounded before an oversized Markdown result can escape', () => {
  const widest = Array.from({ length: 1000 }, () => '<w:p/>');
  const sparse = Array.from({ length: 3000 }, () => ['<w:p/>']);
  rejects(table([widest, ...sparse]), undefined, 'DOCX_STRUCTURE_LIMIT');
});

test('restored outer runs and adjacent cells reach de-identification while qualifications survive', () => {
  const qualification = 'Scrum.org Professional Scrum Product Owner I (PSPO I)';
  const technical = 'HL7 FHIR und Testautomatisierung';
  const content = `<w:p>${run('Name: Max Mustermann')}${textbox(paragraph(qualification))}${run('E-Mail: max.mustermann@example.org')}</w:p>` +
    table([[paragraph('Erfahrung') + table([[paragraph(technical)]]) + paragraph('Name: Erika Beispiel'), paragraph('Kontakt: erika.beispiel@example.org')]]);
  const extracted = parse(content);
  for (const value of ['Max Mustermann', 'max.mustermann@example.org', 'Erika Beispiel', 'erika.beispiel@example.org', qualification, technical]) assertPresent(extracted.markdown, value);
  const anonymized = pii.anonymize(extracted.markdown, 'personnel_profile').text;
  for (const value of ['Max Mustermann', 'max.mustermann@example.org', 'Erika Beispiel', 'erika.beispiel@example.org']) assertAbsent(anonymized, value);
  assertPresent(anonymized, qualification);
  assertPresent(anonymized, technical);
});

done();
