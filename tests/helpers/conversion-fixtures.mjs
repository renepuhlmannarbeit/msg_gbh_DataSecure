// Synthetic in-memory fixtures shared by real converter and packaged sidecar tests.
import { createRequire } from 'node:module';
import { createCanvas } from '../../native/ocr/pilot/node_modules/@napi-rs/canvas/index.js';
const require = createRequire(import.meta.url);
const { zipStore } = require('../lib/zip');
const { opcControlEntries } = require('../lib/opc');

export const text = 'Max Mustermann Nordstern GmbH DE89370400440532013000';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
export function office(type) {
  const entries = type === 'docx' ? [['word/document.xml', `<w:document xmlns:w="${W}"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`]] :
    type === 'xlsx' ? [
      ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Quelle" sheetId="1" r:id="s1"/></sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
      ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${text}</t></is></c></row></sheetData></worksheet>`]
    ] : [
      ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s1"/></p:sldIdLst></p:presentation>`],
      ['ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`],
      ['ppt/slides/slide1.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`]
    ];
  return zipStore([...opcControlEntries(type), ...entries]);
}
export function image(blank = false) {
  const canvas = createCanvas(1600, 600), ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1600, 600);
  ctx.fillStyle = 'black'; ctx.font = '54px Arial';
  if (!blank) ['Max Mustermann', 'Nordstern GmbH', 'Projektmanager Software Tester'].forEach((line, i) => ctx.fillText(line, 60, 130 + i * 110));
  return canvas;
}
export function pdf(pages, catalog = '', documentOptions = {}) {
  const objects = [null, null], kids = [];
  for (const source of pages) {
    const n = objects.length + 1; kids.push(`${n} 0 R`);
    const hasText = !source.image || source.text !== undefined || source.textLines !== undefined;
    const lines = source.textLines || [source.text || ''];
    const escaped = value => value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
    const nativeText = hasText ? `BT /F1 20 Tf ${source.invisibleText ? '3 Tr ' : ''}${lines.map((line, index) =>
      `1 0 0 1 30 ${source.image ? 280 - index * 55 : 200 - index * 35} Tm (${escaped(line)}) Tj`).join(' ')} ET` : '';
    const content = Buffer.from(`${source.image && !source.unpaintedImage ? 'q 800 0 0 300 0 0 cm /Im Do Q ' : ''}${nativeText}`);
    const resources = source.image ? `/XObject << /Im ${n + 2} 0 R >> ${hasText ? `/Font << /F1 ${n + 3} 0 R >>` : ''}` : `/Font << /F1 ${n + 2} 0 R >>`;
    const annotations = source.annotation ? ' /Annots [<< /Type /Annot /Subtype /Text /Rect [0 0 10 10] /Contents (Private note) >>]' : '';
    objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 300] /Resources << ${resources} >> /Contents ${n + 1} 0 R${annotations} >>`));
    objects.push(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream')]));
    objects.push(source.image ? Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1600 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${source.image.length} >>\nstream\n`), source.image, Buffer.from('\nendstream')]) :
      Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
    if (source.image && hasText) objects.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
  }
  const infoNumber = documentOptions.info ? objects.length + 1 : null;
  if (infoNumber) objects.push(Buffer.from('<< /Title (Private title) /Author (Max Mustermann) >>'));
  objects[0] = Buffer.from(`<< /Type /Catalog /Pages 2 0 R ${catalog} >>`);
  objects[1] = Buffer.from(`<< /Type /Pages /Count ${pages.length} /Kids [${kids.join(' ')}] >>`);
  const chunks = [Buffer.from('%PDF-1.7\n')], offsets = [0]; let size = chunks[0].length;
  objects.forEach((object, i) => {
    offsets.push(size);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]);
    chunks.push(chunk); size += chunk.length;
  });
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Root 1 0 R /Size ${objects.length + 1}${infoNumber ? ` /Info ${infoNumber} 0 R` : ''} >>\nstartxref\n${size}\n%%EOF\n`));
  return Buffer.concat(chunks);
}
