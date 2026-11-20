'use strict';
// Real synthetic ZIP/OPC packages and production readers. No Office/native UI,
// candidate-module substitution, OCR result injection or user document.
const crypto = require('node:crypto');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { createSuite } = require('./helpers');
const { parseOoxml } = require('../plugins/data-secure/server/ooxml');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { test, assert, done } = createSuite('OOXML selected story and quarantined owner');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const WPS = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const paragraph = value => `<w:p><w:r><w:t>${value}</w:t></w:r></w:p>`;
const reference = (type, id, prefix = 'r') => `<w:${type}Reference w:type="default"${id === null ? '' : ` ${prefix}:id="${id}"`}/>`;
const chosen = (prefix = 'r') => reference('header', 'h1', prefix) + reference('footer', 'f1', prefix);
const excluded = (prefix = 'r') => reference('header', 'h2', prefix) + reference('footer', 'f2', prefix);
const alternate = (requires, first, fallback) => `<mc:AlternateContent><mc:Choice Requires="${requires}">${first}</mc:Choice><mc:Fallback>${fallback}</mc:Fallback></mc:AlternateContent>`;
const stories = [['header1', 'hdr', 'CHOSENHEADERCONTROL'], ['header2', 'hdr', 'EXCLUDEDHEADERCONTROL'],
  ['footer1', 'ftr', 'CHOSENFOOTERCONTROL'], ['footer2', 'ftr', 'EXCLUDEDFOOTERCONTROL']];
function word(section, options = {}) {
  const w = options.strict ? 'http://purl.oclc.org/ooxml/wordprocessingml/main' : W;
  const r = options.strict ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : R;
  const overrides = stories.map(([name, kind]) => ({ part: `word/${name}.xml`,
    contentType: `application/vnd.openxmlformats-officedocument.wordprocessingml.${kind === 'hdr' ? 'header' : 'footer'}+xml` }));
  if (options.comment) overrides.push({ part: 'word/comments.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml' });
  const comment = options.comment ? `<w:p><w:r><w:commentReference xmlns:r="${w}" r:id="0"/></w:r></w:p>` : '';
  const prefix = options.prefixedRels ? 'pk:' : '', declaration = options.prefixedRels ? 'xmlns:pk' : 'xmlns';
  const edge = (id, kind, target) => `<${prefix}Relationship Id="${id}" Type="${r}/${kind}" Target="${target}"/>`;
  const entries = [...opcControlEntries('docx', { additionalOverrides: overrides }),
    ['word/document.xml', `<w:document xmlns:w="${w}" xmlns:r="${r}" xmlns:rel="${r}" xmlns:foo-r="urn:foreign" xmlns:foo.r="urn:foreign" xmlns:mc="${MC}" xmlns:wps="${WPS}" xmlns:u="urn:unsupported"><w:body>${paragraph('BODYCONTROL ÄÖÜß 😀')}${comment}<w:sectPr>${section}</w:sectPr></w:body></w:document>`],
    ['word/_rels/document.xml.rels', `<${prefix}Relationships ${declaration}="${PR}">${edge('h1', 'header', 'header1.xml')}${edge('h2', 'header', 'header2.xml')}${edge('f1', 'footer', 'footer1.xml')}${edge('f2', 'footer', 'footer2.xml')}${options.comment ? edge('c1', 'comments', 'comments.xml') : ''}</${prefix}Relationships>`],
    ...stories.map(([name, kind, value]) => [`word/${name}.xml`, `<w:${kind} xmlns:w="${w}">${paragraph(value)}</w:${kind}>`])];
  if (options.comment) entries.push(['word/comments.xml', `<w:comments xmlns:w="${w}"><w:comment w:id="0" w:author="Synthetic Author">${paragraph('COMMENTCONTROL')}</w:comment></w:comments>`]);
  return zipStore(entries);
}
function check(bytes, extension, mode, extra = {}) {
  const original = sha(bytes);
  try {
    const parsed = parseOoxml(bytes, extension, undefined, { preserveText: true, partialExtraction: true,
      ...(mode === 'content-v1' ? { contentMode: true, literalMarkup: true } : {}), ...extra });
    const extracted = extractMarkdownBuffer(bytes, extension, { partialExtraction: true, markdownOutput: mode, ...extra });
    return { parsed, extracted };
  } finally { assert.equal(sha(bytes), original); }
}
function expectStories(result, ids) {
  for (const text of [result.parsed.markdown, result.extracted.markdown]) {
    assert.ok(text.includes('BODYCONTROL')); assert.ok(text.includes('ÄÖÜß 😀'));
    for (const [id, marker] of [['h1', 'CHOSENHEADERCONTROL'], ['h2', 'EXCLUDEDHEADERCONTROL'], ['f1', 'CHOSENFOOTERCONTROL'], ['f2', 'EXCLUDEDFOOTERCONTROL']])
      assert.equal(text.includes(marker), ids.includes(id), marker);
  }
  const names = [...new Set(ids)].map(id => `word/${id[0] === 'h' ? 'header' : 'footer'}${id.slice(1)}.xml`);
  assert.deepEqual(result.parsed.sections.filter(row => /^word\/(?:header|footer)\d+\.xml$/u.test(row.source_part)).map(row => row.source_part), names);
}
const slideText = value => `<p:sp><p:txBody><a:p><a:r><a:t>${value}</a:t></a:r></a:p></p:txBody></p:sp>`;
function presentation(options = {}) {
  const order = options.order || [1, 2], bad = new Set(options.bad || []);
  const malformed = options.child ? '<c:chart r:id="chart"><c:unexpected/></c:chart>' : '<c:chart/>';
  const frame = `<p:graphicFrame><a:graphic><a:graphicData uri="${C}">${malformed}</a:graphicData></a:graphic></p:graphicFrame>`;
  const story = (root, value) => `<p:${root} xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree>${slideText(value)}</p:spTree></p:cSld></p:${root}>`;
  const overrides = [1, 2].map(i => ({ part: `ppt/slides/slide${i}.xml`, contentType: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml' }));
  if (options.owners) for (const [part, kind] of [['notesSlides/notesSlide1', 'notesSlide'], ['slideLayouts/slideLayout1', 'slideLayout'], ['slideMasters/slideMaster1', 'slideMaster']])
    overrides.push({ part: `ppt/${part}.xml`, contentType: `application/vnd.openxmlformats-officedocument.presentationml.${kind}+xml` });
  const edge = (id, kind, target) => `<Relationship Id="${id}" Type="${R}/${kind}" Target="${target}"/>`;
  const relations = edges => `<Relationships xmlns="${PR}">${edges}</Relationships>`;
  const entries = [...opcControlEntries('pptx', { additionalOverrides: overrides }),
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst>${order.map((part, index) => `<p:sldId id="${256 + index}" r:id="s${index}"/>`).join('')}</p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', relations(order.map((part, index) => edge(`s${index}`, 'slide', `slides/slide${part}.xml`)).join('') + (options.owners ? edge('master', 'slideMaster', 'slideMasters/slideMaster1.xml') : ''))],
    ...[1, 2].map(i => [`ppt/slides/slide${i}.xml`, `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:c="${C}" xmlns:r="${R}" xmlns:mc="${MC}" xmlns:u="urn:unsupported"><p:cSld><p:spTree>${slideText(i === 1 ? 'SLIDEONECONTROL' : 'SLIDETWOCONTROL')}${bad.has(i) ? options.unselected ? alternate('u', frame, '') : frame : ''}</p:spTree></p:cSld></p:sld>`])];
  if (options.owners) entries.push(
    ['ppt/slides/_rels/slide1.xml.rels', relations(edge('notes', 'notesSlide', '../notesSlides/notesSlide1.xml') + edge('layout', 'slideLayout', '../slideLayouts/slideLayout1.xml'))],
    ['ppt/notesSlides/notesSlide1.xml', story('notes', 'OWNERNOTECONTROL')],
    ['ppt/notesSlides/_rels/notesSlide1.xml.rels', relations(edge('slide', 'slide', '../slides/slide1.xml'))],
    ['ppt/slideLayouts/slideLayout1.xml', story('sldLayout', 'OWNERLAYOUTCONTROL')],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', relations(edge('master', 'slideMaster', '../slideMasters/slideMaster1.xml'))],
    ['ppt/slideMasters/slideMaster1.xml', story('sldMaster', 'OWNERMASTERCONTROL')]);
  if (options.sharedLayout) entries.push(['ppt/slides/_rels/slide2.xml.rels', relations(edge('layout', 'slideLayout', '../slideLayouts/slideLayout1.xml'))]);
  return zipStore(entries);
}

for (const mode of ['content-v1', 'notes-v1']) {
  test(`${mode}: genuine relationship aliases and both namespace families retain ordered stories`, () => {
    for (const strict of [false, true]) for (const prefix of ['r', 'rel']) for (const prefixedRels of [false, true])
      expectStories(check(word(chosen(prefix), { strict, prefixedRels }), '.docx', mode), ['h1', 'f1']);
    expectStories(check(word(reference('footer', 'f1') + reference('header', 'h1') + reference('footer', 'f1')), '.docx', mode), ['f1', 'h1']);
    expectStories(check(word('<w:headerReference xmlns:local="' + R + '" local:id="h1"/>'), '.docx', mode), ['h1']);
  });
  test(`${mode}: foreign prefixes and attribute-value lookalikes never select header inventory`, () => {
    for (const section of [reference('header', 'h2', 'foo-r'), reference('header', 'h2', 'foo.r'),
      '<w:headerReference xmlns:r="urn:foreign" r:id="h2"/>', '<w:headerReference id="h2"/>',
      '<w:headerReference data="r:id=\'h2\'"/>']) expectStories(check(word(section), '.docx', mode), []);
    expectStories(check(word('<w:headerReference foo-r:id="h2" rel:id="h1"/>'), '.docx', mode), ['h1']);
    assert.throws(() => check(word('<w:headerReference r:id="h1" rel:id="h2"/>'), '.docx', mode), { code: 'OOXML_XML_CHARACTER_INVALID' });
  });
  test(`${mode}: only the chosen MC arm grants story authority, including nested and empty choices`, () => {
    for (const section of [alternate('u', excluded(), chosen()), alternate('wps', chosen(), excluded()),
      alternate('u', excluded(), alternate('wps', chosen(), excluded())), alternate('u', excluded('rel'), chosen('rel'))])
      expectStories(check(word(section), '.docx', mode), ['h1', 'f1']);
    expectStories(check(word(alternate('u', excluded(), '')), '.docx', mode), []);
    expectStories(check(word(alternate('wps', reference('header', null), excluded())), '.docx', mode), []);
    expectStories(check(word(''), '.docx', mode), ['h1', 'h2', 'f1', 'f2']); // explicit legacy no-declaration contract
  });
  test(`${mode}: real Word-id under r and explicit header omission keep their distinct contracts`, () => {
    const result = check(word(chosen(), { comment: true }), '.docx', mode);
    expectStories(result, ['h1', 'f1']); assert.ok(result.extracted.markdown.includes('COMMENTCONTROL'));
    const omitted = check(word(chosen('rel')), '.docx', mode, { omitDocxHeaderFooter: true });
    expectStories(omitted, []); assert.ok(omitted.extracted.coverage.reason_codes.includes('DOCX_HEADER_FOOTER_EXCLUDED_BY_POLICY'));
  });
  test(`${mode}: quarantined slides retain independent text, original ordinals and an honest partial reason`, () => {
    for (const child of [false, true]) for (const order of [[1, 2], [2, 1], [1, 1, 2]]) {
      const result = check(presentation({ bad: [1], child, order }), '.pptx', mode);
      assert.ok(result.extracted.markdown.includes('SLIDETWOCONTROL'));
      assert.ok(!result.extracted.markdown.includes('SLIDEONECONTROL'));
      assert.ok(result.extracted.markdown.includes(`Folie ${order.indexOf(2) + 1}`));
      assert.ok(result.extracted.coverage.reason_codes.includes('DOCUMENT_PARTS_DAMAGED'));
      assert.ok(!result.parsed.sections.some(row => row.source_part === 'ppt/slides/slide1.xml'));
    }
    const ignored = check(presentation({ bad: [1], unselected: true }), '.pptx', mode);
    assert.ok(ignored.extracted.markdown.includes('SLIDEONECONTROL') && ignored.extracted.markdown.includes('SLIDETWOCONTROL'));
    const empty = check(presentation({ bad: [1, 2] }), '.pptx', mode);
    assert.equal(empty.parsed.markdown, ''); assert.equal(empty.parsed.sections.length, 0);
  });
  test(`${mode}: quarantined owner notes/layout/master disappear while legitimately shared template owners remain`, () => {
    const baseline = check(presentation({ owners: true }), '.pptx', mode);
    for (const marker of ['OWNERNOTECONTROL', 'OWNERLAYOUTCONTROL', 'OWNERMASTERCONTROL']) assert.ok(baseline.extracted.markdown.includes(marker), marker);
    const omitted = check(presentation({ owners: true, bad: [1] }), '.pptx', mode);
    for (const marker of ['OWNERNOTECONTROL', 'OWNERLAYOUTCONTROL', 'OWNERMASTERCONTROL']) assert.ok(!omitted.extracted.markdown.includes(marker), marker);
    const shared = check(presentation({ owners: true, bad: [1], sharedLayout: true }), '.pptx', mode);
    assert.ok(!shared.extracted.markdown.includes('OWNERNOTECONTROL'));
    for (const marker of ['OWNERLAYOUTCONTROL', 'OWNERMASTERCONTROL']) assert.ok(shared.extracted.markdown.includes(marker), marker);
  });
}
done();
