#!/usr/bin/env node
'use strict';

// Deterministic, entirely synthetic adversarial fixtures. The generated files
// are intentionally awkward, but every direct identifier is fictional.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '../native/ocr/pilot/node_modules/@napi-rs/canvas/index.js';
import { pdf } from '../tests/helpers/conversion-fixtures.mjs';

const require = createRequire(import.meta.url);
const { zipStore } = require('../tests/lib/zip');
const { opcControlEntries } = require('../tests/lib/opc');
const { encodeBmp } = require('../plugins/data-secure/server/images/bmp');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version;

export const identities = Object.freeze([
  Object.freeze({ person: 'Dr.-Ing. Aylin Öztürk', shortPerson: 'Aylin Öztürk', company: 'Mühlen & Partner GmbH',
    email: 'aylin.oetztuerk@beispiel-muehle.de', phone: '+49 40 555 0182', iban: 'DE89 3704 0044 0532 0130 00',
    address: 'Wiesenweg 17, 20457 Hamburg' }),
  Object.freeze({ person: 'Max Mustermann', shortPerson: 'Max Mustermann', company: 'Nordstern Gesundheit AG',
    email: 'max.mustermann@nordstern-beispiel.de', phone: '+49 30 555 0147', iban: 'DE44 5001 0517 5407 3249 31',
    address: 'Beispielallee 8, 10115 Berlin' }),
  Object.freeze({ person: 'María-José Núñez', shortPerson: 'María-José Núñez', company: 'Société Lumière SAS',
    email: 'maria-jose.nunez@lumiere-exemple.fr', phone: '+33 1 55 50 40 30', iban: 'FR76 3000 6000 0112 3456 7890 189',
    address: '7 Rue Exemple, 75001 Paris' })
]);

export const preserveTerms = Object.freeze([
  'Separation of Concerns', 'FHIR', 'Kubernetes', 'ISO 27001', 'MCP26-01', 'Golden Test', 'Vier-Augen-Prinzip'
]);
export const reviewCandidates = Object.freeze(['Ferdinand Quastenflosser']);

const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const paragraph = (number, identity = identities[number % identities.length]) => {
  const themes = [
    'Die fachliche Analyse trennt Konvertierung, Extraktionsreichweite und Anonymisierung konsequent. Separation of Concerns ist dabei keine bloße Überschrift, sondern begrenzt Verantwortlichkeiten und verhindert versteckte Seiteneffekte.',
    'Im technischen Lösungsbild werden FHIR, Kubernetes und MCP26-01 als harmlose Fachbegriffe erhalten. Ein Golden Test prüft nicht nur die Existenz einer Ausgabedatei, sondern auch Reihenfolge, Absätze, Tabellenwerte und ausdrücklich erwartete Warnungen.',
    'Das Vier-Augen-Prinzip schützt die Freigabe. ISO 27001 bleibt als Qualifikations- und Methodenkontext lesbar; weder Rollenbezeichnungen noch Architekturmuster dürfen irrtümlich als Person klassifiziert werden.',
    'Die lange Prosa enthält bewusst Nebensätze, Gedankenstriche, Klammern, Aufzählungsbezüge und wiederkehrende Entitäten. Dadurch werden Satzgrenzen, Unicode-Schreibweisen und die stapelweite Zuordnung unter realistischen Bedingungen geprüft.'
  ];
  return `Abschnitt ${number + 1}: ${themes[number % themes.length]} ${identity.shortPerson} arbeitet bei ${identity.company}. ` +
    `${identity.shortPerson} verantwortet die Prüfstufe; Rückfragen gehen an ${identity.email} oder ${identity.phone}. ` +
    `Die rein synthetische Korrespondenz nennt ${identity.address} und das Testkonto ${identity.iban}.`;
};
const longProse = (count = 42) => Array.from({ length: count }, (_, index) => paragraph(index)).join('\n\n');

function docx(title, identity, options = {}) {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const p = value => `<w:p><w:r><w:t xml:space="preserve">${esc(value)}</w:t></w:r></w:p>`;
  const split = `<w:p><w:r><w:t>${esc(identity.shortPerson.split(' ')[0])}</w:t></w:r><w:r><w:t xml:space="preserve"> ${esc(identity.shortPerson.split(' ').slice(1).join(' '))}</w:t></w:r><w:r><w:t xml:space="preserve"> arbeitet bei ${esc(identity.company)}.</w:t></w:r></w:p>`;
  const rows = [['Feld', 'Wert'], ['Name', identity.person], ['Unternehmen', identity.company], ['E-Mail', identity.email],
    ['Telefon', identity.phone], ['IBAN', identity.iban], ['Anschrift', identity.address], ['Methode', 'Golden Test und Vier-Augen-Prinzip']];
  const table = `<w:tbl>${rows.map(row => `<w:tr>${row.map(value => `<w:tc>${p(value)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
  const body = [p(title), p('SYNTHETISCHER HÄRTETEST – KEINE REALDATEN'), split, table,
    ...longProse(options.paragraphs || 42).split('\n\n').map(p),
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>', p('Anhang: Separation of Concerns, FHIR, Kubernetes, ISO 27001, MCP26-01.')].join('');
  return zipStore([
    ...opcControlEntries('docx', { additionalOverrides: [
      { part: 'word/header1.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml' },
      { part: 'word/footer1.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml' },
      { part: 'word/comments.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml' }
    ] }),
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}<w:sectPr><w:headerReference w:type="default" r:id="head"/><w:footerReference w:type="default" r:id="foot"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`],
    ['word/_rels/document.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="head" Type="${R}/header" Target="header1.xml"/><Relationship Id="foot" Type="${R}/footer" Target="footer1.xml"/><Relationship Id="comments" Type="${R}/comments" Target="comments.xml"/></Relationships>`],
    ['word/header1.xml', `<w:hdr xmlns:w="${W}">${p(`VERTRAULICH | ${identity.shortPerson} | ${identity.company}`)}</w:hdr>`],
    ['word/footer1.xml', `<w:ftr xmlns:w="${W}">${p(`${identity.email} | Seite TEST`)}</w:ftr>`],
    ['word/comments.xml', `<w:comments xmlns:w="${W}"><w:comment w:id="0" w:author="Synthetic QA">${p(`Kommentar von ${identity.shortPerson}: ${identity.phone}`)}</w:comment></w:comments>`]
  ]);
}

function xlsx(identity, variant = 1) {
  const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const sheetNames = variant === 1 ? ['Stammdaten', 'Projektjournal', 'Kennzahlen'] : ['Contacts', 'Long prose'];
  const entries = [], sheetRefs = [], rels = [], overrides = [];
  for (let s = 0; s < sheetNames.length; s++) {
    const number = s + 1;
    sheetRefs.push(`<sheet name="${esc(sheetNames[s])}" sheetId="${number}" r:id="s${number}"${s === 2 ? ' state="hidden"' : ''}/>`);
    rels.push(`<Relationship Id="s${number}" Type="${R}/worksheet" Target="worksheets/sheet${number}.xml"/>`);
    overrides.push({ part: `xl/worksheets/sheet${number}.xml`, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml' });
    const values = ['SYNTHETISCHER HÄRTETEST', 'Name', identity.person, 'Unternehmen', identity.company, 'E-Mail', identity.email,
      'Telefon', identity.phone, 'IBAN', identity.iban, 'Anschrift', identity.address, ...preserveTerms,
      ...Array.from({ length: 18 }, (_, index) => paragraph(index, identity))];
    const rows = values.map((value, index) => `<row r="${index + 1}"><c r="A${index + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>` +
      `<c r="B${index + 1}"><f>ROW()+${variant}</f><v>${index + 1 + variant}</v></c></row>`).join('');
    entries.push([`xl/worksheets/sheet${number}.xml`, `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${S}"><sheetData>${rows}</sheetData><mergeCells count="1"><mergeCell ref="C1:D1"/></mergeCells></worksheet>`]);
  }
  return zipStore([...opcControlEntries('xlsx', { additionalOverrides: overrides }),
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${S}" xmlns:r="${R}"><sheets>${sheetRefs.join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${PR}">${rels.join('')}</Relationships>`], ...entries]);
}

function pptx(identity, slideCount = 8) {
  const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const entries = [], ids = [], rels = [], overrides = [];
  for (let i = 1; i <= slideCount; i++) {
    ids.push(`<p:sldId id="${255 + i}" r:id="s${i}"/>`);
    rels.push(`<Relationship Id="s${i}" Type="${R}/slide" Target="slides/slide${i}.xml"/>`);
    overrides.push({ part: `ppt/slides/slide${i}.xml`, contentType: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml' });
    overrides.push({ part: `ppt/notesSlides/notesSlide${i}.xml`, contentType: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml' });
    const lines = ['SYNTHETISCHER HÄRTETEST', `Folie ${i}`, identity.person, identity.company, identity.email, identity.phone,
      identity.iban, preserveTerms[i % preserveTerms.length], paragraph(i, identity)];
    const textBody = lines.map(line => `<a:p><a:r><a:t>${esc(line.slice(0, Math.ceil(line.length / 2)))}</a:t></a:r><a:r><a:t>${esc(line.slice(Math.ceil(line.length / 2)))}</a:t></a:r></a:p>`).join('');
    entries.push([`ppt/slides/slide${i}.xml`, `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody>${textBody}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`]);
    entries.push([`ppt/slides/_rels/slide${i}.xml.rels`, `<Relationships xmlns="${PR}"><Relationship Id="note" Type="${R}/notesSlide" Target="../notesSlides/notesSlide${i}.xml"/></Relationships>`]);
    entries.push([`ppt/notesSlides/notesSlide${i}.xml`, `<p:notes xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${esc(`Notiz ${i}: ${identity.shortPerson} arbeitet bei ${identity.company}.`)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`]);
  }
  return zipStore([...opcControlEntries('pptx', { additionalOverrides: overrides }),
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst>${ids.join('')}</p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${PR}">${rels.join('')}</Relationships>`], ...entries]);
}

function raster(identity, format) {
  const canvas = createCanvas(2200, 1500), context = canvas.getContext('2d');
  context.fillStyle = '#fffdf8'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#10221b'; context.font = '52px Arial';
  const lines = ['SYNTHETISCHER HÄRTETEST', `Name: ${identity.shortPerson}`, `Unternehmen: ${identity.company}`,
    `E-Mail: ${identity.email}`, `Telefon: ${identity.phone}`, `IBAN: ${identity.iban}`, 'FHIR · Kubernetes · ISO 27001',
    'Golden Test · Vier-Augen-Prinzip'];
  lines.forEach((line, index) => context.fillText(line, 80, 130 + index * 145));
  if (format === 'jpeg') return canvas.toBuffer('image/jpeg', 88);
  if (format === 'bmp') {
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    return encodeBmp({ width: canvas.width, height: canvas.height, rgba: Buffer.from(data.data) });
  }
  return canvas.toBuffer('image/png');
}

function pdfScanRaster(identity) {
  // The shared PDF fixture contract declares embedded images as 1600x600.
  // Keep this scan byte-exactly aligned with that contract so independent
  // renderers and the OCR worker see the same complete page.
  const canvas = createCanvas(1600, 600), context = canvas.getContext('2d');
  context.fillStyle = '#fffdf8'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#10221b'; context.font = '34px Arial';
  const lines = ['SYNTHETISCHER HAERTETEST', `Name: ${identity.shortPerson}`, `Unternehmen: ${identity.company}`,
    `E-Mail: ${identity.email}`, `Telefon: ${identity.phone}`, `IBAN: ${identity.iban}`,
    'FHIR · Kubernetes · ISO 27001', 'Golden Test · Vier-Augen-Prinzip'];
  lines.forEach((line, index) => context.fillText(line, 45, 55 + index * 68));
  return canvas.toBuffer('image/jpeg', 90);
}

export function createCases() {
  const a = identities[0], b = identities[1], c = identities[2];
  const scan = pdfScanRaster(b);
  const textPages = Array.from({ length: 12 }, (_, index) => ({ textLines: [
    'SYNTHETISCHER HAERTETEST', `Seite ${index + 1}`, `Name: ${b.shortPerson}`, `Unternehmen: ${b.company}`,
    `E-Mail: ${b.email}`, preserveTerms[index % preserveTerms.length]
  ] }));
  return [
    { file: '01-direkt/01-langer-prosatext.txt', bytes: Buffer.from(`SYNTHETISCHER HÄRTETEST\n\nName: ${a.person}\nUnternehmen: ${a.company}\nE-Mail: ${a.email}\nTelefon: ${a.phone}\nIBAN: ${a.iban}\nAnschrift: ${a.address}\n\n${longProse(64)}`), kind: 'direct' },
    { file: '01-direkt/02-komplexes-markdown.md', bytes: Buffer.from(`# SYNTHETISCHER HÄRTETEST\n\n| Feld | Wert |\n|---|---|\n| Name | ${b.person} |\n| Unternehmen | ${b.company} |\n| E-Mail | [${b.email}](mailto:${b.email}) |\n| Telefon | ${b.phone} |\n| IBAN | ${b.iban} |\n\n> ${longProse(36).replaceAll('\n\n', '\n> ')}\n\nFerdinand Quastenflosser koordinierte die Einführung. Dieser seltene, unbeschriftete Namenskandidat muss eine lokale Prüfung auslösen.\n\n\`Separation of Concerns\` und **Golden Test** bleiben erhalten.`), kind: 'direct' },
    { file: '01-direkt/03-mehrzeilige-tabelle.csv', bytes: Buffer.from(`Feld;Wert;Kommentar\r\nName;"${c.person}";"mehrzeilig\r\nund vollständig synthetisch"\r\nUnternehmen;"${c.company}";"Golden Test"\r\nE-Mail;${c.email};FHIR\r\nTelefon;${c.phone};Kubernetes\r\nIBAN;${c.iban};"ISO 27001"\r\nBeschreibung;"${longProse(12).replaceAll('"', '""').replaceAll('\n\n', ' ')}";"Vier-Augen-Prinzip"\r\n`), kind: 'direct' },
    { file: '02-word/04-langer-bericht-mit-kopf-fuss-kommentar.docx', bytes: docx('Langer Prüfbericht', a, { paragraphs: 58 }), kind: 'docx' },
    { file: '02-word/05-mehrsprachiges-profil.docx', bytes: docx('Multilingual Customer Profile', c, { paragraphs: 44 }), kind: 'docx' },
    { file: '02-word/06-fragmentierte-namen.docx', bytes: docx('Fragmentierte Runs und Tabellen', b, { paragraphs: 34 }), kind: 'docx' },
    { file: '03-tabellen/07-mehrblatt-formeln-versteckt.xlsx', bytes: xlsx(a, 1), kind: 'wide' },
    { file: '03-tabellen/08-mehrsprachige-arbeitsmappe.xlsx', bytes: xlsx(c, 2), kind: 'wide' },
    { file: '04-praesentationen/09-folien-mit-notizen.pptx', bytes: pptx(b, 10), kind: 'wide' },
    { file: '04-praesentationen/10-lange-mehrsprachige-praesentation.pptx', bytes: pptx(c, 12), kind: 'wide' },
    { file: '05-pdf/11-text-pdf-zwoelf-seiten.pdf', bytes: pdf(textPages), kind: 'worker' },
    { file: '05-pdf/12-hybrid-pdf-text-und-bild.pdf', bytes: pdf([{ image: scan, textLines: [`Name: ${b.shortPerson}`, `Unternehmen: ${b.company}`, 'FHIR Kubernetes ISO 27001'] }, { image: scan }]), kind: 'worker' },
    { file: '05-pdf/13-scan-pdf-mehrseitig.pdf', bytes: pdf(Array.from({ length: 4 }, () => ({ image: scan }))), kind: 'worker' },
    { file: '06-bilder/14-dichter-scan.png', bytes: raster(a, 'png'), kind: 'worker' },
    { file: '06-bilder/15-dichter-scan.jpg', bytes: raster(b, 'jpeg'), kind: 'worker' },
    { file: '06-bilder/16-dichter-scan.bmp', bytes: raster(c, 'bmp'), kind: 'worker' }
  ];
}

export function generate(rawOutput) {
  const output = path.resolve(rawOutput || path.join(repo, 'dist', `DataSecure-Haertetestkorpus-16-${version}`));
  const archive = `${output}.zip`;
  if (fs.existsSync(output) || fs.existsSync(archive)) throw new Error(`CORPUS_DESTINATION_EXISTS: ${output}`);
  const input = path.join(output, 'EINGABEN');
  fs.mkdirSync(input, { recursive: true });
  const cases = createCases();
  const manifest = cases.map((item, index) => ({ number: index + 1, file: item.file.replaceAll('\\', '/'), bytes: item.bytes.length,
    sha256: hash(item.bytes), expected_conversion: 'markdown-created', expected_anonymization: 'all-extracted-identifiers-removed',
    source_coverage: item.kind === 'direct' || item.kind === 'docx' ? 'direct-or-complete' : 'reported-separately' }));
  for (const item of cases) {
    const file = path.join(input, ...item.file.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, item.bytes, { flag: 'wx' });
  }
  const expectations = { schema: 'datasecure-adversarial-corpus/1', version, synthetic_only: true,
    files: manifest, fictional_identifiers: identities, local_review_candidates: reviewCandidates, must_preserve: preserveTerms,
    note: 'Bei breiten Formaten bezieht sich die Anonymisierung auf den extrahierten Markdown-Inhalt; die Quellabdeckung wird separat ausgewiesen.' };
  fs.writeFileSync(path.join(output, 'ERWARTUNGEN.json'), `${JSON.stringify(expectations, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'README.txt'), [
    'DataSecure – adversarieller Golden-Härtetestkorpus', '',
    'Alle Personen, Unternehmen, Adressen, Kontakte und Kontodaten sind vollständig erfunden.',
    'Wähle in DataSecure ausschließlich den Ordner EINGABEN. Er enthält 16 Dateien in Unterordnern.', '',
    'Test 1: Nur in Markdown umwandeln. Alle 16 Eingaben müssen ein Ergebnis liefern; Originalinhalte bleiben erhalten.',
    'Test 2: Umwandeln und anonymisieren. Alle im extrahierten Markdown enthaltenen fiktiven Identifikatoren müssen ersetzt sein.',
    'Die Markdown-Datei 02 enthält zusätzlich einen absichtlich unbeschrifteten Namenskandidaten; korrekt ist eine lokale Prüfentscheidung, keine stille Freigabe.',
    'Bei XLSX, PPTX, PDF, Scan-PDF und Bildern muss DataSecure die Extraktionsreichweite getrennt vom Anonymisierungsstatus ausweisen.',
    'DOCX-Kopf- und Fußzeilen sind bei reiner Konvertierung sichtbar, bei Anonymisierung aber absichtlich ausgeschlossen.', '',
    'ERWARTUNGEN.json enthält Prüfsummen, fiktive Identifikatoren und die Fachbegriffe, die unverändert bleiben müssen.'
  ].join('\r\n'), { flag: 'wx' });
  const archiveEntries = [];
  for (const entry of fs.readdirSync(output, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    archiveEntries.push([path.relative(output, full).replaceAll('\\', '/'), fs.readFileSync(full)]);
  }
  archiveEntries.sort((left, right) => left[0].localeCompare(right[0], 'en'));
  fs.writeFileSync(archive, zipStore(archiveEntries), { flag: 'wx' });
  return { output, archive, files: cases.length, bytes: cases.reduce((sum, item) => sum + item.bytes.length, 0) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = generate(process.argv[2]);
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
}
