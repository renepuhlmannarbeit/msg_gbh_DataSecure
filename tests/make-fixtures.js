'use strict';

// Generates the synthetic office fixtures. Every value in here is invented; no
// real document may ever be committed to this repository.

const fs = require('fs');
const path = require('path');
const { encodePng } = require('../plugins/data-secure/server/images/png');
const { zipStore } = require('./lib/zip');

const root = path.join(__dirname, 'fixtures');
fs.mkdirSync(root, { recursive: true });

function blankPng(w = 300, h = 120) {
  return encodePng({ width: w, height: h, rgba: Buffer.alloc(w * h * 4, 255) });
}

const img = blankPng();

const docxBody = [
  '<w:p><w:r><w:t>Unternehmen: Beispiel Consulting GmbH</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Standort: Köln</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>MAX MUSTERMANN</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Product Owner</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Skillset</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Projekterfahrung</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Kunde Alpha GmbH – Einführung Portal X</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Zeitraum: 01/2024 – 08/2026</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Rolle im Projekt: Business Analyst</w:t></w:r></w:p>',
  '<w:p><w:r><w:t>Berufserfahrung</w:t></w:r></w:p>'
].join('');

fs.writeFileSync(
  path.join(root, 'synthetic_profile.docx'),
  zipStore([
    ['word/document.xml', `<w:document xmlns:w="w"><w:body>${docxBody}</w:body></w:document>`],
    ['word/media/image1.png', img]
  ])
);

fs.writeFileSync(
  path.join(root, 'synthetic_customer.xlsx'),
  zipStore([
    ['xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="Kunden" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'],
    [
      'xl/sharedStrings.xml',
      '<sst><si><t>Kunde</t></si><si><t>Max Mustermann</t></si><si><t>E-Mail</t></si>' +
        '<si><t>max@example.de</t></si><si><t>Status</t></si><si><t>Offen</t></si></sst>'
    ],
    [
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>' +
        '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" t="s"><v>5</v></c></row>' +
        '</sheetData></worksheet>'
    ],
    ['xl/media/image1.png', img]
  ])
);

fs.writeFileSync(
  path.join(root, 'synthetic_contract.pptx'),
  zipStore([
    [
      'ppt/slides/slide1.xml',
      '<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody>' +
        '<a:p><a:r><a:t>Vertrag zwischen Alpha GmbH und Max Mustermann</a:t></a:r></a:p>' +
        '<a:p><a:r><a:t>Haftung und Kündigung</a:t></a:r></a:p>' +
        '</p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
    ],
    [
      'ppt/notesSlides/notesSlide1.xml',
      '<p:notes xmlns:p="p" xmlns:a="a"><a:t>Kontakt max@example.de</a:t></p:notes>'
    ],
    ['ppt/media/image1.png', img]
  ])
);

const pdfContent =
  'BT /F1 12 Tf 72 720 Td (Kunde: Max Mustermann) Tj 0 -20 Td (E-Mail: max@example.de) Tj ET';
const pdf =
  '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
  '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n' +
  '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
  '/Resources << /Font << /F1 5 0 R >> >> >> endobj\n' +
  `4 0 obj << /Length ${pdfContent.length} >> stream\n${pdfContent}\nendstream endobj\n` +
  '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n%%EOF\n';
fs.writeFileSync(path.join(root, 'synthetic_customer.pdf'), Buffer.from(pdf, 'latin1'));

console.log('fixtures created', root);
