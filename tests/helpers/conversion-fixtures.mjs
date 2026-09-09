// Synthetic in-memory fixtures shared by real converter and packaged sidecar tests.
import crypto from 'node:crypto';
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
  const objects = [null, null], kids = [], pageObjectIndexes = [];
  for (const source of pages) {
    const n = objects.length + 1; kids.push(`${n} 0 R`); pageObjectIndexes.push(n - 1);
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
  const catalogAdditions = [catalog];
  if (documentOptions.form || documentOptions.signature) {
    const fieldNumber = objects.length + 1;
    const widgetNumber = fieldNumber + 1;
    objects.push(Buffer.from(`<< /FT /${documentOptions.signature ? 'Sig' : 'Tx'} /T (${documentOptions.signature ? 'Approval' : 'CustomerName'}) /V (${documentOptions.signature ? 'Signed' : 'Max Mustermann'}) /Kids [${widgetNumber} 0 R] >>`));
    objects.push(Buffer.from(`<< /Type /Annot /Subtype /Widget /Rect [20 20 220 50] /Parent ${fieldNumber} 0 R /P ${pageObjectIndexes[0] + 1} 0 R >>`));
    const page = objects[pageObjectIndexes[0]].toString('utf8');
    objects[pageObjectIndexes[0]] = Buffer.from(page.replace(/ >>$/u, ` /Annots [${widgetNumber} 0 R] >>`));
    catalogAdditions.push(`/AcroForm << /Fields [${fieldNumber} 0 R] >>`);
  }
  if (documentOptions.attachment) {
    const attachment = Buffer.from('Private attachment Max Mustermann');
    const streamNumber = objects.length + 1;
    objects.push(Buffer.concat([Buffer.from(`<< /Type /EmbeddedFile /Length ${attachment.length} >>\nstream\n`), attachment, Buffer.from('\nendstream')]));
    const fileSpecNumber = objects.length + 1;
    objects.push(Buffer.from(`<< /Type /Filespec /F (evidence.txt) /UF (evidence.txt) /Desc (Private evidence) /AFRelationship /Data /EF << /F ${streamNumber} 0 R /UF ${streamNumber} 0 R >> >>`));
    const nameTreeNumber = objects.length + 1;
    objects.push(Buffer.from(`<< /Names [(evidence.txt) ${fileSpecNumber} 0 R] /Limits [(evidence.txt) (evidence.txt)] >>`));
    catalogAdditions.push(`/Names << /EmbeddedFiles ${nameTreeNumber} 0 R >> /AF [${fileSpecNumber} 0 R]`);
  }
  const infoNumber = documentOptions.info ? objects.length + 1 : null;
  if (infoNumber) objects.push(Buffer.from('<< /Title (Private title) /Author (Max Mustermann) >>'));
  objects[0] = Buffer.from(`<< /Type /Catalog /Pages 2 0 R ${catalogAdditions.filter(Boolean).join(' ')} >>`);
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

// Minimal but standards-conformant PDF Standard Security Handler R2 fixture.
// This exercises PDF.js' real password/permission paths without checking a
// binary fixture into Git or relying on a host PDF authoring program.
export function encryptedPdf(password = 'secret') {
  const padding = Buffer.from([
    0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
    0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
    0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
    0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a
  ]);
  const padPassword = value => Buffer.concat([Buffer.from(value, 'binary'), padding]).subarray(0, 32);
  const rc4 = (bytes, key) => {
    const state = Uint8Array.from({ length: 256 }, (_, index) => index);
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + state[i] + key[i % key.length]) & 255;
      [state[i], state[j]] = [state[j], state[i]];
    }
    const output = Buffer.alloc(bytes.length); let i = 0; j = 0;
    for (let offset = 0; offset < bytes.length; offset++) {
      i = (i + 1) & 255; j = (j + state[i]) & 255;
      [state[i], state[j]] = [state[j], state[i]];
      output[offset] = bytes[offset] ^ state[(state[i] + state[j]) & 255];
    }
    return output;
  };
  const user = padPassword(password);
  const ownerKey = crypto.createHash('md5').update(padPassword('owner-secret')).digest().subarray(0, 5);
  const owner = rc4(user, ownerKey);
  const permissions = Buffer.alloc(4); permissions.writeInt32LE(-44);
  const id = crypto.createHash('md5').update('DataSecure encrypted PDF fixture').digest();
  const fileKey = crypto.createHash('md5').update(user).update(owner).update(permissions).update(id).digest().subarray(0, 5);
  const userEntry = rc4(padding, fileKey);
  const stream = Buffer.from('BT /F1 12 Tf 25 80 Td (Max Mustermann) Tj ET');
  const objectSalt = Buffer.from([5, 0, 0, 0, 0]);
  const objectKey = crypto.createHash('md5').update(fileKey).update(objectSalt).digest().subarray(0, 10);
  const encryptedStream = rc4(stream, objectKey);
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [4 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>'),
    Buffer.concat([Buffer.from(`<< /Length ${encryptedStream.length} >>\nstream\n`), encryptedStream, Buffer.from('\nendstream')]),
    Buffer.from(`<< /Filter /Standard /V 1 /R 2 /Length 40 /O <${owner.toString('hex')}> /U <${userEntry.toString('hex')}> /P -44 >>`)
  ];
  const chunks = [Buffer.from('%PDF-1.4\n')], offsets = [0]; let size = chunks[0].length;
  for (let index = 0; index < objects.length; index++) {
    offsets.push(size);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), objects[index], Buffer.from('\nendobj\n')]);
    chunks.push(chunk); size += chunk.length;
  }
  const idHex = id.toString('hex');
  chunks.push(Buffer.from(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Root 1 0 R /Size 7 /Encrypt 6 0 R /ID [<${idHex}><${idHex}>] >>\nstartxref\n${size}\n%%EOF\n`));
  return Buffer.concat(chunks);
}
