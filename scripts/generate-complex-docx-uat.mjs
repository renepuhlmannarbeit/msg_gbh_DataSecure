import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { zipStore } = require('../tests/lib/zip');
const { opcControlEntries } = require('../tests/lib/opc');
const { encodePng } = require('../plugins/data-secure/server/images/png');

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kit = path.join(repo, 'docs', 'acceptance', 'STANDALONE_COMPLEX_DOCX_TEST_KIT');
const defaultOutput = path.join(kit, 'inputs');

const shared = Object.freeze({
  person: 'Laura Stein',
  organization: 'Nordlicht Digital GmbH',
  email: 'laura.stein@beispiel-firma.de',
  phone: '+49 40 555 0182',
  iban: 'DE89 3704 0044 0532 0130 00',
  address: 'Wiesenweg 17, 20457 Hamburg'
});

export const fixtures = Object.freeze([
  ['01-kundenprofil-kurz.docx', 'Kundenprofil', 'Product Owner', shared],
  ['02-projektstatus-kurz.docx', 'Projektstatus', 'Sprint Review', shared],
  ['03-technische-notiz-kurz.docx', 'Techniknotiz', 'Kubernetes', null],
  ['04-betriebskonzept-kurz.docx', 'Betriebskonzept', 'Offline-Betrieb', null],
  ['05-label-metadaten-kurz.docx', 'Freigabevermerk', 'Klassifizierungsmetadaten', shared],
  ['06-rahmenvertrag-mittel.docx', 'Rahmenvertrag', 'Leistungsbeschreibung', {
    person: 'Murat Kaya', organization: 'Elbwiese Beratung GmbH', email: 'murat.kaya@elbwiese-beispiel.de',
    phone: '+49 30 555 0104', iban: 'DE44 5001 0517 5407 3249 31', address: 'Beispielallee 8, 10115 Berlin'
  }],
  ['07-bewerbungsprofil-mittel.docx', 'Bewerbungsprofil', 'FHIR', {
    person: 'Sofia Lindner', organization: 'Morgenrot Systeme KG', email: 'sofia.lindner@morgenrot-beispiel.de',
    phone: '+49 89 555 0147', iban: 'DE12 1002 0500 0001 2345 67', address: 'Teststrasse 24, 80331 Muenchen'
  }],
  ['08-prozesshandbuch-mittel.docx', 'Prozesshandbuch', 'Vier-Augen-Prinzip', null],
  ['09-architekturentscheidung-mittel.docx', 'Architekturentscheidung', 'Separation of Concerns', null],
  ['10-kundenkorrespondenz-mittel.docx', 'Kundenkorrespondenz', 'Liefergegenstand', shared],
  ['11-fallakte-lang.docx', 'Fallakte', 'Entscheidungsprotokoll', shared],
  ['12-auditbericht-lang.docx', 'Auditbericht', 'Wirksamkeitspruefung', {
    person: 'Omar Yilmaz', organization: 'Hansewerk Digital GmbH', email: 'omar.yilmaz@hansewerk-beispiel.de',
    phone: '+49 69 555 0199', iban: 'DE21 2004 0000 0123 4567 00', address: 'Pruefweg 5, 60311 Frankfurt'
  }],
  ['13-qualitaetsbericht-lang.docx', 'Qualitaetsbericht', 'Grenzwertanalyse', null],
  ['14-systemhandbuch-lang.docx', 'Systemhandbuch', 'Pruefsumme', null],
  ['15-projektchronik-lang.docx', 'Projektchronik', 'Produktivsetzung', shared]
]);

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function paragraph(value, style = '') {
  const properties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${properties}<w:r><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p>`;
}

function drawing() {
  return '<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData>' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill>' +
    '<a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdImage"/>' +
    '</pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}

function table(rows) {
  const cells = rows.map((row) => `<w:tr>${row.map((value) =>
    `<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr>${paragraph(value)}</w:tc>`).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>` +
    '<w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/>' +
    '<w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/>' +
    '<w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/>' +
    `</w:tblBorders></w:tblPr>${cells}</w:tbl>`;
}

function documentXml(title, preserve, identity) {
  const identityRows = identity ? [
    ['Feld', 'Testwert'],
    ['Name', identity.person],
    ['Unternehmen', identity.organization],
    ['E-Mail', identity.email],
    ['Telefon', identity.phone],
    ['IBAN', identity.iban],
    ['Anschrift', identity.address]
  ] : [
    ['Pruefschritt', 'Status'],
    [preserve, 'fachlich geprueft'],
    ['Retry-Strategie', 'fachlich geprueft']
  ];
  const neutral = 'Dieser Kontrollfall enthaelt absichtlich keine Kontaktadresse, keine Bankverbindung und kein kundenspezifisches Unternehmen.';
  const pii = identity
    ? `${identity.person} arbeitet fuer ${identity.organization}. Rueckfragen gehen an ${identity.email} oder ${identity.phone}. Die Korrespondenzadresse lautet ${identity.address}; das fiktive Abrechnungskonto ist ${identity.iban}.`
    : neutral;
  const repeated = Array.from({ length: 30 }, (_, index) => paragraph(
    `Pruefnotiz ${index + 1}: ${preserve} bleibt als fachlicher Erhaltungsanker unveraendert. ` +
    'Die Struktur bleibt stabil, der Inhalt wird lokal verarbeitet und der Testwert wird nicht als reale Aussage interpretiert. ' +
    'Absatzgrenzen, Tabellennaehe, Reihenfolge und Wiederaufnahme werden mit vollstaendig fiktiven Testdaten geprueft.'
  )).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' +
    paragraph(title, 'Title') + paragraph('TESTDATEN – VOLLSTAENDIG FIKTIV') + paragraph(pii) +
    paragraph('Fachliche Inhalte', 'Heading1') + paragraph(preserve, 'ListBullet') + table(identityRows) +
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' + drawing() + repeated +
    '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/>' +
    '<w:footerReference w:type="default" r:id="rIdFooter"/></w:sectPr></w:body></w:document>';
}

function makeDocx(title, preserve, identity, withClassificationLabel) {
  const overrides = [
    { part: 'word/header1.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml' },
    { part: 'word/footer1.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml' }
  ];
  if (withClassificationLabel) {
    overrides.push({ part: 'docMetadata/LabelInfo.xml', contentType: 'application/vnd.ms-office.classificationlabels+xml' });
  }
  const entries = [
    ...opcControlEntries('docx', { additionalOverrides: overrides }),
    ['word/document.xml', documentXml(title, preserve, identity)],
    ['word/header1.xml', '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' + paragraph('DATENSECURE UAT | TESTDATEN – VOLLSTAENDIG FIKTIV') + '</w:hdr>'],
    ['word/footer1.xml', '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' + paragraph(`${title} | Nicht fuer reale Verarbeitung`) + '</w:ftr>'],
    ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/test-chart.png"/></Relationships>'],
    ['word/media/test-chart.png', encodePng({ width: 24, height: 24, rgba: Buffer.alloc(24 * 24 * 4, 0x7f) })]
  ];
  entries[0][1] = entries[0][1].replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  if (withClassificationLabel) {
    entries.push(['docMetadata/LabelInfo.xml', '<?xml version="1.0" encoding="UTF-8"?><LabelInfo xmlns="http://schemas.microsoft.com/office/2020/02/metadata/ClassificationLabels"><Label id="synthetic-uat-label" enabled="1" setDate="2026-01-01T00:00:00Z"/></LabelInfo>']);
  }
  return zipStore(entries);
}

function safeOutput(rawOutput) {
  const output = path.resolve(rawOutput || defaultOutput);
  const relative = path.relative(kit, output).split(path.sep).join('/');
  if (output !== defaultOutput && !/^\.tmp-complex-docx-[a-z0-9-]+$/u.test(relative)) {
    throw new Error('Output must be the complex DOCX kit inputs folder or a .tmp-complex-docx-* test folder.');
  }
  if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error('Refusing linked output.');
  return output;
}

export function generate(rawOutput) {
  const output = safeOutput(rawOutput);
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  for (const [name, title, preserve, identity] of fixtures) {
    fs.writeFileSync(path.join(output, name), makeDocx(title, preserve, identity, name.startsWith('05-')), { flag: 'wx' });
  }
  return { output, count: fixtures.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outIndex = process.argv.indexOf('--out');
  const result = generate(outIndex >= 0 ? process.argv[outIndex + 1] : undefined);
  process.stdout.write(`Created ${result.count} deterministic complex DOCX fixtures in ${result.output}\n`);
}
