#!/usr/bin/env node
'use strict';

// Generates deterministic synthetic test data only. No real personal data may
// be added here or copied into the generated corpus.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { zipStore } = require('../tests/lib/zip');
const { opcControlEntries } = require('../tests/lib/opc');
const { encodeBmp } = require('../plugins/data-secure/server/images/bmp');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productVersion = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version;
const { createCanvas } = await import('../native/ocr/pilot/node_modules/@napi-rs/canvas/index.js');
const { pdf } = await import('../tests/helpers/conversion-fixtures.mjs');

const output = path.resolve(process.argv[2] || path.join(repo, 'dist', `DataSecure-Testkorpus-100-${productVersion}`));
const archive = `${output}.zip`;
const manifestFile = `${output}-MANIFEST.csv`;
const readmeFile = `${output}-README.txt`;
if ([output, archive, manifestFile, readmeFile].some(candidate => fs.existsSync(candidate))) {
  throw new Error(`CORPUS_DESTINATION_EXISTS: ${output}`);
}
fs.mkdirSync(output, { recursive: true });

const people = [
  ['Anna Berger', 'Elbwiese Beratung GmbH'], ['Murat Kaya', 'Nordhafen Logistik AG'],
  ['Sofia Lindner', 'Waldpfad Energie GmbH'], ['Jonas Richter', 'Morgenrot Systeme KG'],
  ['Lea Wagner', 'Seestern Handel GmbH'], ['David Hoffmann', 'Bergtal Maschinenbau AG'],
  ['Mina Scholz', 'Klarblick Forschung GmbH'], ['Tobias Klein', 'Sonnenhof Dienste KG'],
  ['Elena Neumann', 'Hansewerk Digital GmbH'], ['Omar Yilmaz', 'Feldstein Projekt AG'],
  ['Marie König', 'Silbersee Technik GmbH'], ['Lukas Braun', 'Westwind Mobilität KG'],
  ['Nora Hartmann', 'Eichenhain Medien GmbH'], ['Amir Becker', 'Brückenbau Partner AG'],
  ['Clara Wolf', 'Küstenlicht Service GmbH'], ['Felix Schröder', 'Talblick Verwaltung KG'],
  ['Isabel Krause', 'Hochwald Labor GmbH'], ['Samir Vogel', 'Rheinbogen Consulting AG'],
  ['Paula Schmitt', 'Mühlenweg Produktion GmbH'], ['Leon Fischer', 'Himmelblau Software KG'],
  ['Aylin Weber', 'Parkland Gesundheit GmbH'], ['Emil Sommer', 'Donaublick Reisen AG'],
  ['Maja Krüger', 'Steinweg Architektur GmbH'], ['Noah Peters', 'Lindenhof Bildung KG'],
  ['Lina Roth', 'Wellenkraft Infrastruktur AG']
];
const sizes = Object.freeze({ short: 5, medium: 24, large: 80 });
const manifest = [];

function esc(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
function identity(index) {
  const [person, company] = people[index % people.length];
  const serial = String(index + 1).padStart(2, '0');
  return { person, company, email: `${person.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replaceAll(' ', '.') }@beispiel-${serial}.de`,
    phone: `+49 30 555${String(1000 + index).slice(-4)}`, iban: `DE${String(10 + index).padStart(2, '0')}3704004405320130${serial}`,
    street: `Beispielweg ${index + 3}, ${String(10115 + index)} Berlin` };
}
function prose(index, size) {
  const id = identity(index);
  const paragraphs = [
    `Projektprofil von ${id.person} bei ${id.company}.`,
    `Kontakt: ${id.email}, Telefon ${id.phone}, Anschrift ${id.street}.`,
    `Abrechnungskonto: ${id.iban}. Zertifikate: Scrum Master, ISO 27001 Foundation und Testmanagement.`,
    `${id.person} koordiniert die Einführung eines lokalen Dokumentenprozesses für ${id.company}. Der Text ist vollständig synthetisch und beschreibt keine reale Person.`,
    `Im Projekt werden Anforderungen, Risiken, Termine und offene Entscheidungen nachvollziehbar dokumentiert.`
  ];
  const target = sizes[size];
  return Array.from({ length: target }, (_, paragraph) => `${paragraph + 1}. ${paragraphs[paragraph % paragraphs.length]}`).join('\n\n');
}
function add(category, size, name, bytes, privacy = 'direct') {
  const directory = path.join(output, category, size);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx' });
  manifest.push({ number: manifest.length + 1, category, size, file: `${category}/${size}/${name}`.replaceAll('\\', '/'),
    bytes: Buffer.byteLength(bytes), markdown_conversion: 'expected', anonymization: privacy });
}
function sizeFor(index, total) {
  if (index < Math.floor(total / 3)) return 'short';
  if (index < Math.floor(total * 2 / 3)) return 'medium';
  return 'large';
}
function markdown(index, size) {
  const id = identity(index);
  return `# Synthetisches Projektprofil\n\n${prose(index, size)}\n\n## Strukturierte Angaben\n\n| Feld | Wert |\n|---|---|\n| Person | ${id.person} |\n| Unternehmen | ${id.company} |\n| E-Mail | ${id.email} |\n| Telefon | ${id.phone} |\n| IBAN | ${id.iban} |\n\n- Analyse\n- Umsetzung\n- Qualitätssicherung\n`;
}
function csv(index, size) {
  const rows = size === 'short' ? 6 : size === 'medium' ? 45 : 220;
  const lines = ['Vorgang;Person;Unternehmen;E-Mail;Telefon;IBAN;Beschreibung'];
  for (let row = 0; row < rows; row++) {
    const id = identity(index + row);
    lines.push(`${row + 1};${id.person};${id.company};${id.email};${id.phone};${id.iban};"Synthetischer Datensatz ${row + 1} mit Fließtext"`);
  }
  return `${lines.join('\r\n')}\r\n`;
}
function docx(index, size) {
  const paragraphs = prose(index, size).split('\n\n').map((text, i) =>
    `<w:p><w:r><w:t xml:space="preserve">${esc(text)}</w:t>${i > 0 && i % 18 === 0 ? '<w:br w:type="page"/>' : ''}</w:r></w:p>`).join('');
  const table = `<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Feld</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Wert</w:t></w:r></w:p></w:tc></w:tr>` +
    Object.entries(identity(index)).map(([key, value]) => `<w:tr><w:tc><w:p><w:r><w:t>${esc(key)}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>${esc(value)}</w:t></w:r></w:p></w:tc></w:tr>`).join('') + '</w:tbl>';
  return zipStore([...opcControlEntries('docx'), ['word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}${table}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`]]);
}
function col(index) {
  let value = index + 1, result = '';
  while (value) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); }
  return result;
}
function xlsx(index, size) {
  const sheetCount = size === 'short' ? 1 : size === 'medium' ? 3 : 5;
  const rowCount = size === 'short' ? 12 : size === 'medium' ? 80 : 350;
  const entries = [], sheets = [], rels = [], overrides = [];
  for (let sheet = 1; sheet <= sheetCount; sheet++) {
    sheets.push(`<sheet name="Projekt ${sheet}" sheetId="${sheet}" r:id="s${sheet}"/>`);
    rels.push(`<Relationship Id="s${sheet}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheet}.xml"/>`);
    overrides.push({ part: `xl/worksheets/sheet${sheet}.xml`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml' });
    const rows = [];
    const header = ['Person', 'Unternehmen', 'E-Mail', 'Telefon', 'IBAN', 'Kommentar'];
    rows.push(`<row r="1">${header.map((value, c) => `<c r="${col(c)}1" t="inlineStr"><is><t>${esc(value)}</t></is></c>`).join('')}</row>`);
    for (let row = 2; row <= rowCount + 1; row++) {
      const id = identity(index + row + sheet);
      const values = [id.person, id.company, id.email, id.phone, id.iban, `Synthetische Tabellenzeile ${row - 1}`];
      rows.push(`<row r="${row}">${values.map((value, c) => `<c r="${col(c)}${row}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`).join('')}</row>`);
    }
    entries.push([`xl/worksheets/sheet${sheet}.xml`, `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`]);
  }
  return zipStore([...opcControlEntries('xlsx', { additionalOverrides: overrides }),
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`], ...entries]);
}
function pptx(index, size) {
  const count = size === 'short' ? 2 : size === 'medium' ? 7 : 18;
  const ids = [], rels = [], entries = [], overrides = [];
  for (let slide = 1; slide <= count; slide++) {
    ids.push(`<p:sldId id="${255 + slide}" r:id="s${slide}"/>`);
    rels.push(`<Relationship Id="s${slide}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${slide}.xml"/>`);
    overrides.push({ part: `ppt/slides/slide${slide}.xml`, contentType: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml' });
    const id = identity(index + slide);
    const lines = [`Projektstand ${slide}`, id.person, id.company, id.email, id.phone, id.iban, 'Alle Angaben sind synthetische Testdaten.'];
    entries.push([`ppt/slides/slide${slide}.xml`, `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${lines.map(line => `<a:p><a:r><a:t>${esc(line)}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`]);
  }
  return zipStore([...opcControlEntries('pptx', { additionalOverrides: overrides }),
    ['ppt/presentation.xml', `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${ids.join('')}</p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`], ...entries]);
}
function raster(index, size, type = 'png') {
  const width = size === 'short' ? 1000 : size === 'medium' ? 1400 : 1800;
  const height = size === 'short' ? 500 : size === 'medium' ? 1000 : 1800;
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#10221b'; ctx.font = `${size === 'large' ? 34 : 40}px Arial`;
  const id = identity(index), lines = ['Synthetisches Dokument', id.person, id.company, id.email, id.phone, id.iban, id.street];
  const repeats = size === 'short' ? 1 : size === 'medium' ? 2 : 4;
  let y = 70;
  for (let repeat = 0; repeat < repeats; repeat++) for (const line of lines) { ctx.fillText(line, 55, y); y += 58; }
  if (type === 'jpeg') return canvas.toBuffer('image/jpeg');
  if (type === 'bmp') {
    const imageData = ctx.getImageData(0, 0, width, height);
    return encodeBmp({ width, height, rgba: Buffer.from(imageData.data) });
  }
  return canvas.toBuffer('image/png');
}
function pdfScanRaster(index) {
  const canvas = createCanvas(1600, 600), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1600, 600);
  ctx.fillStyle = '#10221b'; ctx.font = '48px Arial';
  const id = identity(index);
  ['Synthetisches Scan Dokument', id.person, id.company, id.email, id.phone, id.iban, id.street]
    .forEach((line, lineIndex) => ctx.fillText(line, 55, 75 + lineIndex * 72));
  return canvas.toBuffer('image/jpeg');
}

for (let i = 0; i < 25; i++) { const size = sizeFor(i, 25); add('txt', size, `profil-${String(i + 1).padStart(2, '0')}.txt`, Buffer.from(prose(i, size)), 'direct'); }
for (let i = 0; i < 24; i++) { const size = sizeFor(i, 24); add('markdown', size, `projekt-${String(i + 1).padStart(2, '0')}.md`, Buffer.from(markdown(i, size)), 'direct'); }
for (let i = 0; i < 24; i++) { const size = sizeFor(i, 24); add('csv', size, `kundenliste-${String(i + 1).padStart(2, '0')}.csv`, Buffer.from(csv(i, size)), 'direct'); }
for (const [i, size] of ['short', 'medium', 'large', 'large'].entries()) add('docx', size, `bericht-${i + 1}.docx`, docx(i, size), 'direct');
for (const [i, size] of ['short', 'medium', 'large', 'large'].entries()) add('xlsx', size, `arbeitsmappe-${i + 1}.xlsx`, xlsx(i, size), 'markdown-first');
for (const [i, size] of ['short', 'medium', 'large', 'large'].entries()) add('pptx', size, `praesentation-${i + 1}.pptx`, pptx(i, size), 'markdown-first');
for (const [i, size] of ['short', 'medium', 'large'].entries()) {
  const pages = size === 'short' ? 1 : size === 'medium' ? 5 : 14;
  add('pdf-text', size, `textdokument-${i + 1}.pdf`, pdf(Array.from({ length: pages }, (_, page) => {
    const id = identity(i + page);
    return { textLines: ['Synthetisches Projektprofil', `Name: ${id.person}`, `Firma: ${id.company}`,
      `E-Mail: ${id.email}`, `Telefon: ${id.phone}`, `IBAN: ${id.iban}`] };
  })), 'markdown-first');
}
for (const [i, size] of ['short', 'medium', 'large'].entries()) {
  const pages = size === 'short' ? 1 : size === 'medium' ? 4 : 10;
  const pageImage = pdfScanRaster(i);
  add('pdf-scan', size, `scan-${i + 1}.pdf`, pdf(Array.from({ length: pages }, () => ({ image: pageImage }))), 'markdown-first');
}
for (const [category, extension] of [['png', 'png'], ['jpeg', 'jpg'], ['bmp', 'bmp']]) {
  for (const [i, size] of ['short', 'medium', 'large'].entries()) add(category, size, `scan-${i + 1}.${extension}`, raster(i, size, category), 'markdown-first');
}

if (manifest.length !== 100) throw new Error(`CORPUS_COUNT_INVALID: ${manifest.length}`);
const csvManifest = ['Nr;Kategorie;Größe;Datei;Bytes;Markdown-Konvertierung;Anonymisierung',
  ...manifest.map(item => [item.number, item.category, item.size, item.file, item.bytes, item.markdown_conversion, item.anonymization].join(';'))].join('\r\n') + '\r\n';
fs.writeFileSync(manifestFile, csvManifest, { flag: 'wx' });
fs.writeFileSync(readmeFile, [
  'DataSecure Testkorpus mit 100 synthetischen Dateien', '',
  'Alle Namen, Unternehmen, Kontakte und Kontodaten sind erfunden.',
  'Die Ordner short, medium und large enthalten kurze, mittlere und große Beispiele.', '',
  'Test A: Nur in Markdown umwandeln',
  'Alle 100 Dateien auswählen. Es entstehen Markdown-Dateien mit Originalinhalten und ohne Zuordnungsdatei.', '',
  'Test B: Anonymisieren',
  'TXT, Markdown, CSV und DOCX können direkt anonymisiert werden.',
  'Breite Quellen werden einmal lokal in Markdown umgewandelt; anschließend wird genau dieser extrahierte Markdown-Inhalt anonymisiert.',
  'Der Extraktionsstatus wird getrennt ausgewiesen; nicht extrahierte Inhalte der Originaldatei sind nicht Bestandteil des anonymisierten Ergebnisses.', '',
  'Die separate MANIFEST-Datei nennt für jede Datei den vorgesehenen Weg.',
  'Der auswählbare Korpusordner selbst enthält exakt 100 Eingabedateien, damit er als ein Stapel aufgenommen werden kann.'
].join('\r\n'), { flag: 'wx' });

const archiveEntries = [];
for (const item of fs.readdirSync(output, { recursive: true, withFileTypes: true })) {
  if (!item.isFile()) continue;
  const full = path.join(item.parentPath, item.name);
  archiveEntries.push([path.relative(output, full).replaceAll('\\', '/'), fs.readFileSync(full)]);
}
archiveEntries.sort((a, b) => a[0].localeCompare(b[0], 'en'));
fs.writeFileSync(archive, zipStore(archiveEntries), { flag: 'wx' });
process.stdout.write(JSON.stringify({ ok: true, output, archive, files: manifest.length,
  manifest: manifestFile, readme: readmeFile,
  bytes: manifest.reduce((sum, item) => sum + item.bytes, 0) }) + '\n');
