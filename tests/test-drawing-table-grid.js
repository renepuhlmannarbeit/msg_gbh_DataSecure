'use strict';
const { createSuite } = require('./helpers');
const { readXml } = require('../plugins/data-secure/server/xml-reader');
const { createDrawingTableCollector } = require('../plugins/data-secure/server/drawing-table-grid');
const { test, assert, done } = createSuite('DrawingML logical table ownership');
const namespace = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const error = limit => Object.assign(new Error(limit ? 'LIMIT' : 'UNSAFE'), { code: limit ? 'LIMIT' : 'UNSAFE' });
const cell = (text, attrs = '') => `<a:tc ${attrs}><a:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></a:txBody></a:tc>`;
const row = (...cells) => '<a:tr>' + cells.join('') + '</a:tr>';
function parse(rows, columns = 2) {
  const collector = createDrawingTableCollector(value => value === namespace, error);
  readXml(`<a:tbl xmlns:a="${namespace}"><a:tblPr firstRow="1"/><a:tblGrid>${'<a:gridCol/>'.repeat(columns)}</a:tblGrid>${rows}</a:tbl>`,
    { decode: value => value, error, start: collector.start, text: collector.text, end: collector.end });
  return collector.tables;
}
test('real grid and header role retain physical origins', () => {
  const [table] = parse(row(cell('Name'), cell('Fachtext')) + row(cell('Qvx'), cell('FHIR')));
  assert.equal(table.columns, 2); assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0].header, true); assert.equal(table.rows[1].header, false);
  assert.equal(table.rows[1].cells[1].column, 1); assert.equal(table.rows[1].cells[0].text, 'Qvx');
});
test('horizontal continuation is owned and its real text is not silently dropped', () => {
  const [table] = parse(row(cell('Name', 'gridSpan="2"'), cell('REAL-CONTINUATION', 'hMerge="1"')) + row(cell('Qvx'), cell('Rst')));
  assert.equal(table.rows[0].cells[0].span, 2);
  assert.equal(table.rows[0].cells[1].continuationOf, 1);
  assert.equal(table.rows[0].cells[1].text, 'REAL-CONTINUATION');
});
test('vertical continuation belongs to the actual same-column origin', () => {
  const [table] = parse(row(cell('Name', 'rowSpan="2"'), cell('V1')) + row(cell('V2', 'vMerge="true"'), cell('V3')));
  assert.equal(table.rows[1].cells[0].continuationOf, 1);
  assert.equal(table.rows[1].cells[0].text, 'V2');
});
for (const [label, body] of [
  ['unowned continuation', row(cell('Qvx', 'vMerge="1"'), cell('Rst'))],
  ['missing horizontal flag', row(cell('Name', 'gridSpan="2"'), cell('Qvx'))],
  ['missing vertical flag', row(cell('Name', 'rowSpan="2"'), cell('Rst')) + row(cell('Qvx'), cell('S'))],
  ['span outside grid', row(cell('Name', 'gridSpan="3"'), cell('Rst'))],
  ['rowspan outside table', row(cell('Name', 'rowSpan="2"'), cell('Rst'))],
  ['wrong direction', row(cell('Name', 'gridSpan="2"'), cell('Qvx', 'vMerge="1"'))],
  ['bad boolean', row(cell('Name', 'hMerge="yes"'), cell('Rst'))],
  ['interior needs both flags', row(cell('Name','gridSpan="2" rowSpan="2"'),cell('','hMerge="1"'))+row(cell('','vMerge="1"'),cell('Qvx','hMerge="1"'))],
  ['continuation rowspan outside source rectangle',row(cell('Name','rowSpan="2"'),cell('Rst'))+row(cell('Qvx','vMerge="1" rowSpan="1024"'),cell('S'))],
  ['unequal physical width', row(cell('Name'))]
]) test(label, () => assert.throws(() => parse(body)));
test('equivalent namespace prefix does not change the model', () => {
  const collector = createDrawingTableCollector(value => value === namespace, error);
  const xml = `<x:tbl xmlns:x="${namespace}"><x:tr><x:tc><x:txBody><x:p><x:r><x:t>Qvx</x:t></x:r></x:p></x:txBody></x:tc></x:tr></x:tbl>`;
  readXml(xml, { decode: value => value, error, start: collector.start, text: collector.text, end: collector.end });
  assert.equal(collector.tables[0].rows[0].cells[0].text, 'Qvx');
});
for(const body of [
  '<a:tc><f:txBody xmlns:f="urn:foreign"><a:p><a:r><a:t>Name</a:t></a:r></a:p></f:txBody></a:tc>',
  '<a:tc><a:p><a:r><a:t>Name</a:t></a:r></a:p></a:tc>',
  '<a:tc><a:txBody><a:p><f:r xmlns:f="urn:foreign"><a:t>Name</a:t></f:r></a:p></a:txBody></a:tc>'
])test('actual text body owner is required: '+body.slice(0,60),()=>{
  const collector=createDrawingTableCollector(value=>value===namespace,error);
  assert.throws(()=>readXml(`<a:tbl xmlns:a="${namespace}"><a:tr>${body}</a:tr></a:tbl>`,{decode:value=>value,error,start:collector.start,text:collector.text,end:collector.end}));
});
done();
