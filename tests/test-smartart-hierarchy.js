'use strict';

const assert = require('node:assert/strict');
const { diagramModel, ownerDiagrams } = require('../plugins/data-secure/server/office-diagrams');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const D = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const decode = value => value.replace(/&amp;/gu, '&').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>');
const pt = (id, text = '', type, extra = '') => `<d:pt modelId="${id}"${type === undefined ? '' : ` type="${type}"`}><d:t><a:p><a:r><a:t>${text}</a:t></a:r></a:p></d:t>${extra}</d:pt>`;
const cxn = (source, target, order = 0, type, extra = '') => `<d:cxn modelId="edge-${source}-${target}"${type === undefined ? '' : ` type="${type}"`} srcId="${source}" destId="${target}" srcOrd="${order}" destOrd="0"${extra}/>`;
const model = (points, edges = '', extra = '') => Buffer.from(`<d:dataModel xmlns:d="${D}" xmlns:a="${A}" xmlns:f="urn:foreign" xmlns:mc="${MC}"><d:ptLst>${points}</d:ptLst><d:cxnLst>${edges}</d:cxnLst>${extra}</d:dataModel>`);
const read = bytes => diagramModel(bytes, decode);
const unsafe = bytes => assert.throws(() => read(bytes), { code: 'PPTX_STRUCTURE_UNSAFE' });
let passed = 0;
function test(name, fn) { fn(); passed++; process.stdout.write(`PASS ${name}\n`); }

test('schema-default parOf and node preserve the same hierarchy as explicit types', () => {
  const omitted = model(pt('child', 'Child') + pt('parent', 'Parent'), cxn('parent', 'child'));
  const explicit = model(pt('child', 'Child', 'node') + pt('parent', 'Parent', 'node'), cxn('parent', 'child', 0, 'parOf'));
  assert.deepEqual(read(omitted), [{ text: 'Parent', depth: 0 }, { text: 'Child', depth: 1 }]);
  assert.deepEqual(read(omitted), read(explicit));
});

function phasedGraph() {
  const counts = [3, 3, 3, 3, 2], points = [pt('document', '', 'doc')], edges = [], expected = [];
  for (const [phase, count] of counts.entries()) {
    const id = `p${phase}`; points.push(pt(id, `Phase ${phase + 1}`));
    edges.unshift(cxn('document', id, phase));
    expected.push({ text: `Phase ${phase + 1}`, depth: 0 });
    for (let child = 0; child < count; child++) {
      const childId = `${id}c${child}`; points.unshift(pt(childId, `Detail ${phase + 1} ${child + 1}`));
      edges.unshift(cxn(id, childId, child));
      expected.push({ text: `Detail ${phase + 1} ${child + 1}`, depth: 1 });
    }
  }
  points.unshift(pt('transition', '', 'parTrans'), pt('sibling', '', 'sibTrans'), pt('presentation-root', 'ALTERNATE ROOT', 'pres'), pt('presentation-child', 'ALTERNATE CHILD', 'pres'));
  edges.unshift(cxn('document', 'presentation-root', 0, 'presOf'), cxn('presentation-root', 'presentation-child', 0, 'presParOf'));
  expected.push({text:'SmartArt-Zusatztexte · Zuordnung zum Datenbaum nicht bestätigt',depth:0},
    {text:'ALTERNATE ROOT',depth:1},{text:'ALTERNATE CHILD',depth:1});
  return { bytes: model(points.join(''), edges.join('')), expected };
}

test('shuffled five-phase graph retains nineteen data rows in 3/3/3/3/2 groups plus separately identified extras', () => {
  const { bytes, expected } = phasedGraph(); assert.deepEqual(read(bytes), expected);
});
test('strict DrawingML namespaces use the same normative defaults', () => {
  const { bytes, expected } = phasedGraph();
  const strict = Buffer.from(bytes.toString().replaceAll(D, 'http://purl.oclc.org/ooxml/drawingml/diagram').replaceAll(A, 'http://purl.oclc.org/ooxml/drawingml/main'));
  assert.deepEqual(read(strict), expected);
});
test('presentation and transition text is preserved separately without acquiring data-tree parent authority', () => {
  const bytes = model(pt('root', 'Data') + pt('parent-transition', 'TRANSITION', 'parTrans') + pt('sibling-transition', 'SIBLING', 'sibTrans') + pt('shape', 'PRESENTATION', 'pres'), cxn('root', 'shape', 0, 'presOf'));
  assert.deepEqual(read(bytes), [{ text: 'Data', depth: 0 },
    { text:'SmartArt-Zusatztexte · Zuordnung zum Datenbaum nicht bestätigt',depth:0 },
    {text:'TRANSITION',depth:1},{text:'SIBLING',depth:1},{text:'PRESENTATION',depth:1}]);
});
test('unconfirmed presentation-only content is retained and equal text at another role is not globally deduplicated',()=>{
  const caption={text:'SmartArt-Zusatztexte · Zuordnung zum Datenbaum nicht bestätigt',depth:0};
  assert.deepEqual(read(model(pt('p','Context only','pres'))),[caption,{text:'Context only',depth:1}]);
  assert.deepEqual(read(model(pt('a','Same')+pt('p','Same','pres'),cxn('a','p',0,'presOf'))),
    [{text:'Same',depth:0},caption,{text:'Same',depth:1}]);
});
test('an assistant is a logical data node with its original text', () => {
  assert.deepEqual(read(model(pt('a', 'Leader') + pt('b', 'Assistant', 'asst'), cxn('a', 'b'))), [{ text: 'Leader', depth: 0 }, { text: 'Assistant', depth: 1 }]);
});
test('multiple independent roots retain source order without guessed parenting', () => {
  assert.deepEqual(read(model(pt('z', 'First') + pt('a', 'Second'))), [{ text: 'First', depth: 0 }, { text: 'Second', depth: 0 }]);
});
test('same text at two source identities stays twice', () => {
  assert.deepEqual(read(model(pt('r', '') + pt('a', 'Repeated') + pt('b', 'Repeated'), cxn('r', 'b', 1) + cxn('r', 'a', 0))), [{ text: 'Repeated', depth: 0 }, { text: 'Repeated', depth: 0 }]);
});
test('empty containers do not fabricate headings or visible indentation', () => {
  assert.deepEqual(read(model(pt('doc', '', 'doc') + pt('empty', '') + pt('a', 'A') + pt('b', 'B'), cxn('doc', 'empty') + cxn('empty', 'a') + cxn('a', 'b'))), [{ text: 'A', depth: 0 }, { text: 'B', depth: 1 }]);
});
test('text remains literal and occurrence-bound across paragraphs and Unicode', () => {
  const point = `<d:pt modelId="a"><d:t><a:p><a:r><a:t>Änne &amp; Büro 🙂</a:t></a:r><a:br/><a:fld><a:t>Name: Qvx / Qvy</a:t></a:fld></a:p><a:p><a:r><a:t>Second paragraph</a:t></a:r></a:p></d:t></d:pt>`;
  assert.deepEqual(read(model(point)), [{ text: 'Änne & Büro 🙂\nName: Qvx / Qvy\nSecond paragraph', depth: 0 }]);
});
test('point extension text cannot become authored diagram text', () => {
  const extra = '<d:extLst><f:metadata><a:p><a:r><a:t>NOT DATA</a:t></a:r></a:p></f:metadata></d:extLst>';
  assert.deepEqual(read(model(pt('a', 'Actual', undefined, extra))), [{ text: 'Actual', depth: 0 }]);
});
test('largest schema unsignedInt ordinal orders normally', () => {
  const bytes = model(pt('r', 'Root') + pt('late', 'Later') + pt('early', 'Earlier'), cxn('r', 'late', '4294967295') + cxn('r', 'early', '+0'));
  assert.deepEqual(read(bytes).map(row => row.text), ['Root', 'Earlier', 'Later']);
});
test('schema token whitespace around known types is normalized', () => {
  assert.deepEqual(read(model(pt('a', 'A', ' node ') + pt('b', 'B'), cxn('a', 'b', ' 0 ', ' parOf '))), [{ text: 'A', depth: 0 }, { text: 'B', depth: 1 }]);
});
test('empty point list is an empty model', () => assert.deepEqual(read(model('')), []));

const invalidCases = [
  ['unknown point type', model(pt('a', 'A', 'invented'))],
  ['empty explicit point type', model(pt('a', 'A', ''))],
  ['unknown relationship enum is not an invented hierarchy', model(pt('a', 'A') + pt('b', 'B'), cxn('a', 'b', 0, 'unknownRelationship'))],
  ['unrecognized connection type', model(pt('a', 'A') + pt('b', 'B'), cxn('a', 'b', 0, 'invented'))],
  ['empty explicit connection type', model(pt('a', 'A') + pt('b', 'B'), cxn('a', 'b', 0, ''))],
  ['missing required source ordinal', model(pt('a', 'A') + pt('b', 'B'), '<d:cxn srcId="a" destId="b"/>')],
  ['negative ordinal', model(pt('a', 'A') + pt('b', 'B'), cxn('a', 'b', '-1'))],
  ['fractional ordinal', model(pt('a', 'A') + pt('b', 'B'), cxn('a', 'b', '0.5'))],
  ['overflow ordinal', model(pt('a', 'A') + pt('b', 'B'), cxn('a', 'b', '4294967296'))],
  ['nondecimal ordinal', model(pt('a', 'A') + pt('b', 'B'), cxn('a', 'b', '0x10'))],
  ['duplicate sibling ordinal is ambiguous', model(pt('r', 'Root') + pt('a', 'A') + pt('b', 'B'), cxn('r', 'a', 0) + cxn('r', 'b', 0))],
  ['duplicate sibling zero lexical variants', model(pt('r', 'Root') + pt('a', 'A') + pt('b', 'B'), cxn('r', 'a', '00') + cxn('r', 'b', '+0'))],
  ['duplicate point identity', model(pt('a', 'A') + pt('a', 'B'))],
  ['duplicate connection identity', model(pt('a', 'A') + pt('b', 'B') + pt('c', 'C'), cxn('a', 'b').replace('edge-a-b', 'same') + cxn('b', 'c').replace('edge-b-c', 'same'))],
  ['two logical parents', model(pt('a', 'A') + pt('b', 'B') + pt('c', 'C'), cxn('a', 'c') + cxn('b', 'c'))],
  ['self edge', model(pt('a', 'A'), cxn('a', 'a'))],
  ['logical cycle', model(pt('a', 'A') + pt('b', 'B'), cxn('a', 'b') + cxn('b', 'a'))],
  ['unreachable cyclic data component', model(pt('root', 'Root') + pt('a', 'A') + pt('b', 'B'), cxn('a', 'b') + cxn('b', 'a'))],
  ['missing data target', model(pt('a', 'A'), cxn('a', 'missing'))],
  ['presentation edge also binds actual targets', model(pt('a', 'A'), cxn('a', 'missing', 0, 'presOf'))],
  ['data edge cannot acquire a presentation parent', model(pt('a', 'A') + pt('p', 'P', 'pres'), cxn('p', 'a'))],
  ['transition is not a data parent', model(pt('a', 'A') + pt('t', '', 'parTrans'), cxn('t', 'a'))],
  ['presentation target is not data', model(pt('a', 'A') + pt('b', 'B'), cxn('a', 'b', 0, 'presOf'))],
  ['presentation source cannot masquerade as data source', model(pt('a', '', 'pres') + pt('b', '', 'pres'), cxn('a', 'b', 0, 'presOf'))],
  ['presentation parent tree cannot bind a data point', model(pt('a', 'A') + pt('p', '', 'pres'), cxn('p', 'a', 0, 'presParOf'))],
  ['presentation cycle', model(pt('a', '', 'pres') + pt('b', '', 'pres'), cxn('a', 'b', 0, 'presParOf') + cxn('b', 'a', 0, 'presParOf'))],
  ['presentation multiple parents', model(pt('a', '', 'pres') + pt('b', '', 'pres') + pt('c', '', 'pres'), cxn('a', 'c', 0, 'presParOf') + cxn('b', 'c', 0, 'presParOf'))],
  ['document point cannot become a child', model(pt('a', 'A') + pt('doc', '', 'doc'), cxn('a', 'doc'))],
  ['multiple document roots are not guessed', model(pt('a', '', 'doc') + pt('b', '', 'doc'))],
  ['duplicate point list', model(pt('a', 'A'), '', '<d:ptLst/>')],
  ['duplicate connection list', model(pt('a', 'A'), '', '<d:cxnLst/>')],
  ['foreign wrapper cannot own an admitted point list', Buffer.from(`<d:dataModel xmlns:d="${D}" xmlns:a="${A}" xmlns:f="urn:foreign"><f:wrapper><d:ptLst>${pt('a', 'A')}</d:ptLst></f:wrapper></d:dataModel>`)],
  ['extension cannot own an admitted connection', model(pt('a', 'A') + pt('b', 'B'), '', `<d:extLst>${cxn('a', 'b')}</d:extLst>`)],
  ['mixed diagram namespace graph', Buffer.from(`<d:dataModel xmlns:d="${D}" xmlns:s="http://purl.oclc.org/ooxml/drawingml/diagram"><s:ptLst/></d:dataModel>`)],
  ['duplicate point text body', model(pt('a', 'A').replace('</d:pt>', '<d:t/></d:pt>'))],
  ['text directly in body is not a native paragraph', model('<d:pt modelId="a"><d:t><a:t>NOT OWNED</a:t></d:t></d:pt>')],
  ['text under paragraph extension is not a native run', model('<d:pt modelId="a"><d:t><a:p><a:extLst><a:t>NOT OWNED</a:t></a:extLst></a:p></d:t></d:pt>')],
  ['model MC alternatives cannot merge data graphs', model(`<mc:AlternateContent><mc:Fallback>${pt('a', 'A')}</mc:Fallback></mc:AlternateContent>`)],
  ['model orphan MC choice is not selected', model(`<mc:Choice Requires="d">${pt('a', 'A')}</mc:Choice>`)],
  ['wrong root', Buffer.from(`<d:wrong xmlns:d="${D}"/>`)],
  ['DTD stays forbidden', Buffer.from(`<!DOCTYPE x SYSTEM "file:///private"><d:dataModel xmlns:d="${D}"><d:ptLst/></d:dataModel>`)],
  ['invalid UTF8 is a bounded model refusal', Buffer.from([0xff, 0xfe, 0xff])]
];
for (const [name, bytes] of invalidCases) test(`refuses ${name}`, () => unsafe(bytes));

test('graph depth is bounded even when source XML is shallow', () => {
  const points = Array.from({ length: 130 }, (_, i) => pt(`p${i}`, `Value ${i}`)).join('');
  const edges = Array.from({ length: 129 }, (_, i) => cxn(`p${i}`, `p${i + 1}`)).join('');
  unsafe(model(points, edges));
});
test('point budget remains bounded', () => unsafe(model(Array.from({ length: 5001 }, (_, i) => pt(`p${i}`, '')).join(''))));
test('all connection roles share the bounded edge budget', () => {
  const edges = Array.from({ length: 10001 }, (_, i) => cxn('a', 'p', i, 'presOf').replace('edge-a-p', `edge-${i}`)).join('');
  unsafe(model(pt('a', 'A') + pt('p', '', 'pres'), edges));
});
test('text budget remains bounded', () => unsafe(model(pt('a', 'x'.repeat(1_000_001)))));
test('model byte budget remains bounded', () => unsafe(Buffer.alloc(2 * 1024 * 1024 + 1, 32)));

function entries(body, diagram) {
  return new Map([
    ['ppt/slides/slide1.xml', Buffer.from(`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:d="${D}" xmlns:r="${R}" xmlns:mc="${MC}" xmlns:f="urn:foreign">${body}</p:sld>`)],
    ['ppt/slides/_rels/slide1.xml.rels', Buffer.from(`<Relationships xmlns="${PR}"><Relationship Id="data" Type="${R}/diagramData" Target="../diagrams/data1.xml"/></Relationships>`)],
    ['ppt/diagrams/data1.xml', diagram]
  ]);
}
test('owner MC selection uses one admitted model branch only', () => {
  const body = '<mc:AlternateContent><mc:Choice Requires="f"><d:relIds r:dm="unknown"/></mc:Choice><mc:Fallback><d:relIds r:dm="data"/></mc:Fallback></mc:AlternateContent>';
  const { bytes, expected } = phasedGraph();
  assert.deepEqual(ownerDiagrams(entries(body, bytes), 'ppt/slides/slide1.xml', decode), [{ target: 'ppt/diagrams/data1.xml', rows: expected }]);
});
test('owner relationship is still required before any model data is admitted', () => {
  const map = entries('<d:relIds r:dm="unknown"/>', phasedGraph().bytes);
  assert.throws(() => ownerDiagrams(map, 'ppt/slides/slide1.xml', decode), { code: 'PPTX_STRUCTURE_UNSAFE' });
});
test('actual extractor renders nineteen source rows once with their real nesting', () => {
  const { bytes, expected } = phasedGraph();
  const owner = `<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Visible heading</a:t></a:r></a:p></p:txBody></p:sp><p:graphicFrame><a:graphic><a:graphicData><d:relIds r:dm="data"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld>`;
  const zip = zipStore([...opcControlEntries('pptx'),
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="slide"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="slide" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`],
    ...entries(owner, bytes),
    ['ppt/diagrams/drawing1.xml', '<notTheDataModel>DO NOT DUPLICATE</notTheDataModel>']]);
  const extraction = extractMarkdownBuffer(zip, '.pptx', { markdownOutput: 'content-v1', partialExtraction: true });
  const expectedList = expected.map(row => `${'  '.repeat(row.depth)}- ${row.text}`).join('\n');
  assert.ok(extraction.markdown.includes(expectedList), 'hierarchy must survive the actual Markdown integration');
  assert.equal((extraction.markdown.match(/^## SmartArt$/gmu) || []).length, 1);
  for (const row of expected) assert.equal(extraction.markdown.split(row.text).length - 1, 1);
  assert.doesNotMatch(extraction.markdown, /DO NOT DUPLICATE/u);
});

process.stdout.write(`${passed} SmartArt hierarchy cases PASS\n`);
