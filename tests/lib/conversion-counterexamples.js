'use strict';

const { zipStore } = require('./zip');
const { opcControlEntries } = require('./opc');

// Independent format bytes: no production spreadsheet writer or BMP encoder.
// These are synthetic regressions, not a claim of Excel/LibreOffice host UAT.
function xlsxCounterexample({ prefix = '', strict = false, quote = '"', overrides = [] } = {}) {
  const main = strict ? 'http://purl.oclc.org/ooxml/spreadsheetml/main' : 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel = strict ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const tag = name => prefix ? `${prefix}:${name}` : name;
  const ns = prefix ? `xmlns:${prefix}=${quote}${main}${quote}` : `xmlns=${quote}${main}${quote}`;
  const a = (name, value) => `${name}=${quote}${value}${quote}`;
  const inline = (ref, value) => `<${tag('c')} ${a('r', ref)} ${a('t', 'inlineStr')}><${tag('is')}><${tag('t')}>${value}</${tag('t')}></${tag('is')}></${tag('c')}>`;
  const row = (number, cells) => `<${tag('row')} ${a('r', number)}>${cells}</${tag('row')}>`;
  const cells = row(1, inline('A1', 'Debit') + inline('B1', 'Credit')) +
    row(2, `<${tag('c')} ${a('r', 'A2')}/><${tag('c')} ${a('r', 'B2')}><${tag('v')}>1000</${tag('v')}></${tag('c')}>`) +
    row(4, `<${tag('c')} ${a('r', 'A4')}></${tag('c')}>` + inline('B4', 'Original &amp; literal')) +
    row(5, `<${tag('c')} ${a('r', 'A5')} ${a('t', 's')}><${tag('v')}>0</${tag('v')}></${tag('c')}>` +
      `<${tag('c')} ${a('r', 'B5')} ${a('t', 's')}><${tag('v')}>1</${tag('v')}></${tag('c')}>`);
  return zipStore([...new Map([
    ...opcControlEntries('xlsx'),
    ['xl/workbook.xml', `<${tag('workbook')} ${ns} xmlns:link=${quote}${rel}${quote}><${tag('sheets')}><${tag('sheet')} ${a('name', 'Ledger')} ${a('sheetId', '1')} ${a('link:id', 's1')}/></${tag('sheets')}></${tag('workbook')}>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns=${quote}http://schemas.openxmlformats.org/package/2006/relationships${quote}><Relationship ${a('Id', 's1')} ${a('Type', `${rel}/worksheet`)} ${a('Target', 'worksheets/sheet1.xml')}/><Relationship ${a('Id', 'strings')} ${a('Type', `${rel}/sharedStrings`)} ${a('Target', 'sharedStrings.xml')}/></Relationships>`],
    ['xl/worksheets/sheet1.xml', `<${tag('worksheet')} ${ns}><${tag('sheetData')}>${cells}</${tag('sheetData')}></${tag('worksheet')}>`],
    ['xl/sharedStrings.xml', `<${tag('sst')} ${ns}><${tag('si')}/><${tag('si')}><${tag('r')}><${tag('t')}>Max </${tag('t')}></${tag('r')}><${tag('r')}><${tag('t')}>Mustermann</${tag('t')}></${tag('r')}></${tag('si')}></${tag('sst')}>`],
    ...overrides
  ])]);
}

function bmp32({ width, height, rgba }, { topDown = false, unused = 0 } = {}) {
  const pixels = width * height * 4;
  const out = Buffer.alloc(54 + pixels);
  out.write('BM'); out.writeUInt32LE(out.length, 2); out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14); out.writeInt32LE(width, 18); out.writeInt32LE(topDown ? -height : height, 22);
  out.writeUInt16LE(1, 26); out.writeUInt16LE(32, 28); out.writeUInt32LE(pixels, 34);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const source = (y * width + x) * 4;
    const target = 54 + ((topDown ? y : height - y - 1) * width + x) * 4;
    out[target] = rgba[source + 2]; out[target + 1] = rgba[source + 1]; out[target + 2] = rgba[source]; out[target + 3] = unused;
  }
  return out;
}

module.exports = { xlsxCounterexample, bmp32 };
