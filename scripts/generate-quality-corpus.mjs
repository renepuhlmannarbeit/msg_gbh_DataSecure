import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const { createQualityReference } = require('../benchmarks/quality-reference');
const { zipStore } = require('../tests/lib/zip');
const { opcControlEntries } = require('../tests/lib/opc');
const extensions = ['txt', 'md', 'csv', 'docx', 'xlsx', 'pptx', 'pdf', 'png', 'jpg', 'jpeg', 'bmp'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const esc = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

function textPdf(reference) {
  // Latin-1 glyphs with explicit WinAnsi encoding. UTF-8 bytes in a Type1
  // literal string would paint mojibake and invalidate the reference itself.
  const lines = reference.split('\n'), objects = [null, null], kids = [];
  for (let index = 0; index < lines.length; index += 3) {
    const n = objects.length + 1; kids.push(`${n} 0 R`);
    const stream = Buffer.from(`BT /F1 20 Tf ${lines.slice(index, index + 3).map((line, row) =>
      `1 0 0 1 30 ${200 - row * 45} Tm (${line.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')}) Tj`).join(' ')} ET`, 'latin1');
    objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 300] /Resources << /Font << /F1 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`));
    objects.push(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from('\nendstream')]));
    objects.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  }
  objects[0] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>');
  objects[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`);
  const chunks = [Buffer.from('%PDF-1.7\n')], offsets = [0]; let size = chunks[0].length;
  for (const [index, object] of objects.entries()) {
    offsets.push(size); const bytes = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]);
    chunks.push(bytes); size += bytes.length;
  }
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset =>
    `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${size}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

function office(reference, extension) {
  const lines = reference.split('\n');
  const body = extension === 'docx' ? [
    ['word/document.xml', `<w:document xmlns:w="${W}"><w:body>${lines.map(line =>
      `<w:p><w:r><w:t xml:space="preserve">${esc(line)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`]
  ] : extension === 'xlsx' ? [
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Referenz" sheetId="1" r:id="s1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${S}"><sheetData>${lines.map((line, index) =>
      `<row r="${index + 1}"><c r="A${index + 1}" t="inlineStr"><is><t>${esc(line)}</t></is></c></row>`).join('')}</sheetData></worksheet>`]
  ] : [
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s1"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`],
    ['ppt/slides/slide1.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody>${lines.map(line =>
      `<a:p><a:r><a:t>${esc(line)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`]
  ];
  return zipStore([...opcControlEntries(extension), ...body]);
}

async function renderer() {
  const { createCanvas } = await import('../native/ocr/pilot/node_modules/@napi-rs/canvas/index.js');
  const { encodeBmp } = require('../plugins/data-secure/server/images/bmp');
  return (reference, format, variant = 'clean') => {
    const canvas = createCanvas(1600, 600), context = canvas.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, 1600, 600);
    if (variant === 'rotated') { context.translate(20, 0); context.rotate(Math.PI / 180); }
    context.fillStyle = '#111111'; context.font = `${variant === 'small-font' ? 21 : 27}px Arial`;
    reference.split('\n').forEach((line, index) => context.fillText(line, 35, 36 + index * 37));
    if (variant === 'low-resolution') {
      const small = createCanvas(800, 300); small.getContext('2d').drawImage(canvas, 0, 0, 800, 300);
      context.clearRect(0, 0, 1600, 600); context.drawImage(small, 0, 0, 1600, 600);
    }
    if (format === 'bmp') return encodeBmp({ width: 1600, height: 600,
      rgba: Buffer.from(context.getImageData(0, 0, 1600, 600).data) });
    return canvas.toBuffer(format === 'png' ? 'image/png' : 'image/jpeg', variant === 'jpeg-noise' ? 30 : 92);
  };
}

export async function qualityCases() {
  const raster = await renderer();
  const { pdf } = await import('../tests/helpers/conversion-fixtures.mjs');
  const reference = createQualityReference();
  const create = (sample, format, variant) => {
    let bytes;
    if (['docx', 'xlsx', 'pptx'].includes(format)) bytes = office(sample.reference, format);
    else if (format === 'csv') bytes = Buffer.from(sample.reference.split('\n').map(line => `"${line.replaceAll('"', '""')}"`).join('\r\n'));
    else if (format === 'pdf') {
      // Text PDF uses three short lines per page (fixture page height 300).
      // Scan PDF has the same full transcript in a 1600x600 raster.
      if (variant === 'scan') bytes = pdf([{ image: raster(sample.reference, 'jpeg') }]);
      else bytes = textPdf(sample.reference);
    } else if (['png', 'jpg', 'jpeg', 'bmp'].includes(format)) bytes = raster(sample.reference, format, variant);
    else bytes = Buffer.from(sample.reference);
    const file = `${sample.split}/${sample.id}-${variant || 'native'}.${format}`;
    return { sample, file, format, ocr_variant: variant || 'none', bytes,
      location: format === 'xlsx' ? 'Blatt Referenz, Spalte A' : format === 'pptx' ? 'Folie 1'
        : format === 'pdf' ? (variant === 'scan' ? 'Seite 1, OCR' : 'Seiten 1–5, Text')
          : ['png', 'jpg', 'jpeg', 'bmp'].includes(format) ? 'Bild, OCR-Zeilen' : 'Hauptinhalt' };
  };
  const cases = reference.map((sample, index) => {
    const format = extensions[index % extensions.length];
    return create(sample, format, ['png', 'jpg', 'jpeg', 'bmp'].includes(format) ? 'clean' : format === 'pdf' ? 'text' : null);
  });
  // Paired robustness variants count as variants, never extra independent
  // logical documents. All variants stay in their parent's declared split.
  for (const [index, variant, format] of [[0, 'scan', 'pdf'], [6, 'scan', 'pdf'], [12, 'scan', 'pdf'],
    [18, 'rotated', 'png'], [24, 'small-font', 'png'], [30, 'low-resolution', 'png'],
    [36, 'jpeg-noise', 'jpg'], [42, 'rotated', 'bmp'], [48, 'scan', 'pdf'],
    [49, 'small-font', 'jpeg'], [54, 'low-resolution', 'png'], [55, 'jpeg-noise', 'jpeg']]) cases.push(create(reference[index], format, variant));
  return cases;
}

export async function generateQualityCorpus(output) {
  const root = path.resolve(output);
  if (fs.existsSync(root)) throw new Error('QUALITY_DESTINATION_EXISTS');
  const cases = await qualityCases();
  fs.mkdirSync(path.dirname(root), { recursive: true });
  fs.mkdirSync(root); // Exclusive root creation, not an exists/mkdir reuse race.
  const entries = [];
  for (const item of cases) {
    const target = path.join(root, 'EINGABEN', ...item.file.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, item.bytes, { flag: 'wx' });
    entries.push({ ...item.sample, file: item.file, format: item.format, ocr_variant: item.ocr_variant,
      location: item.location, bytes: item.bytes.length, sha256: hash(item.bytes) });
  }
  const manifest = { schema: 'datasecure-quality-reference/1', synthetic_only: true,
    human_reference_review: 'NOT_RUN', logical_documents: 60, variants: entries.length,
    scope: 'engineering-corpus-not-universal-anonymity-evidence', entries };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(path.join(root, 'REFERENZ.json'), serialized, { flag: 'wx' });
  fs.writeFileSync(path.join(root, 'REFERENZ.sha256'), `${hash(serialized)}  REFERENZ.json\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(root, 'REFERENZ-PRUEFUNG.csv'), '\ufeffFall;Datei;Referenzstatus;Erstpruefung;Zweitpruefung;Kommentar\r\n' +
    entries.map(item => `${item.id};${item.file};NOT_RUN;;;`).join('\r\n') + '\r\n', { flag: 'wx' });
  fs.writeFileSync(path.join(root, 'README.txt'), [
    'DataSecure – lokaler synthetischer Qualitätsbenchmark',
    '60 logische Referenzfälle, 72 Format-/OCR-Varianten. Nur EINGABEN in der App auswählen.',
    'Personen/Kontakte sind erfunden; Kontakte verwenden die reservierte Domain .invalid.',
    '48 Entwicklungsfälle und 12 reservierte Abnahmefälle; Varianten bleiben beim jeweiligen Fall.',
    'Referenzen stammen nicht aus einer Erkennung oder deren Ausgabe. Menschliche Doppelprüfung: NOT_RUN.',
    'REFERENZ-PRUEFUNG.csv kann fachlich geprüft werden. Ein technischer Test ersetzt diese Prüfung nicht.',
    'Automatische Auswertung: npm run benchmark:quality -- --output <neuer lokaler Ordner>',
    'Die Auswertung nutzt echte lokale Konverter und Stapel; menschliche Entscheidungen sind ausdrücklich synthetisch.',
    'Berichte können Quellwerte enthalten. Nicht an KI, Supportlogs oder öffentliche CI weitergeben.',
    'Reservierte Fälle nicht zur Anpassung von Erkennungsregeln verwenden; neue Fehler in separaten Regressionen sichern.'
  ].join('\r\n'), { flag: 'wx' });
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/generate-quality-corpus.mjs <new-output-directory>');
  const result = await generateQualityCorpus(process.argv[2]);
  process.stdout.write(`${JSON.stringify({ schema: result.schema, logical_documents: 60, variants: result.variants, human_reference_review: 'NOT_RUN' })}\n`);
}
