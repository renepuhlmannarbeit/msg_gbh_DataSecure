'use strict';

// Version-neutral, cross-platform generator for the current human UAT kit.
// It uses only repository code and Node built-ins; Python and historical RC kits
// are deliberately not part of this contract.

const fs = require('fs');
const path = require('path');
const { encodePng } = require('../../../../plugins/data-secure/server/images/png');
const { zipStore } = require('../../../../tests/lib/zip');
const { opcControlEntries } = require('../../../../tests/lib/opc');

const KIT = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(KIT, 'inputs');
const LAYOUT = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture-layout.json'), 'utf8'));

const PROFILE = `# Mitarbeiterprofil – vollständig synthetisch

Name: Lina Testfeld
E-Mail: lina.testfeld@privacy-example.test
Telefon: +49 221 555 0182
IBAN: DE89 3704 0044 0532 0130 00
Arbeitgeber: Nordstern Medizin IT GmbH
Kunde: Falken Klinikverbund AG
Rolle: Product Owner
Technologien: Java, SQL, HL7 FHIR, Testautomatisierung
Zertifizierungen:
- ISTQB Certified Tester Foundation Level
- Scrum.org Professional Scrum Master II (PSM II)
Leistungsinhalt: Qualitätsgesicherte Weiterentwicklung eines klinischen Terminservices.
`;

const AMBIGUOUS = `# Zertifikatsnachweis – vollständig synthetisch

Name: Mara Beispiel
E-Mail: mara.beispiel@privacy-example.test
Organisation: Nordstern Akademie GmbH
Zertifizierung: Nordstern Akademie GmbH Certified Healthcare Product Owner
Rolle: Product Owner

Die Organisation kann Zertifikatsanbieter oder Arbeitgeber sein. Der Test
erwartet eine lokale Entscheidung oder einen dokumentierten sicheren Stopp.
`;

function xmlEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function documentXml(text, withImage = false) {
  const paragraphs = text.trimEnd().split(/\r?\n/u).map((line) =>
    `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`).join('');
  const drawing = withImage
    ? '<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdImage1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}${drawing}</w:body></w:document>`;
}

function makeDocx(text, withImage = false) {
  const entries = [
    ...opcControlEntries('docx'),
    ['word/document.xml', documentXml(text, withImage)]
  ];
  if (withImage) {
    const png = encodePng({ width: 32, height: 32, rgba: Buffer.alloc(32 * 32 * 4, 0x7f) });
    entries.push(
      ['word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>'],
      ['word/media/image1.png', png]
    );
  }
  return zipStore(entries);
}

const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';

function makeXlsx() {
  const values = [['Name', 'Lina Testfeld'], ['E-Mail', 'lina.testfeld@privacy-example.test'],
    ['Arbeitgeber', 'Nordstern Medizin IT GmbH'], ['Kunde', 'Falken Klinikverbund AG'],
    ['Rolle', 'Product Owner'], ['Technologien', 'Java, SQL, HL7 FHIR, Testautomatisierung']];
  const rows = values.map(([left, right], index) => {
    const number = index + 1;
    return `<row r="${number}"><c r="A${number}" t="inlineStr"><is><t>${xmlEscape(left)}</t></is></c>` +
      `<c r="B${number}" t="inlineStr"><is><t>${xmlEscape(right)}</t></is></c></row>`;
  }).join('');
  return zipStore([...opcControlEntries('xlsx'),
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Profil" sheetId="1" r:id="s1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${S}"><sheetData>${rows}</sheetData></worksheet>`]
  ]);
}

function makePptx() {
  const row = (left, right) => `<a:tr><a:tc><a:txBody><a:p><a:r><a:t>${xmlEscape(left)}</a:t></a:r></a:p></a:txBody></a:tc>` +
    `<a:tc><a:txBody><a:p><a:r><a:t>${xmlEscape(right)}</a:t></a:r></a:p></a:txBody></a:tc></a:tr>`;
  const table = row('Name', 'Lina Testfeld') + row('Arbeitgeber', 'Nordstern Medizin IT GmbH') +
    row('Kunde', 'Falken Klinikverbund AG') + row('Rolle', 'Product Owner') +
    row('Technologien', 'Java, SQL, HL7 FHIR, Testautomatisierung');
  return zipStore([...opcControlEntries('pptx'),
    ['ppt/presentation.xml', `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="s1"/></p:sldIdLst></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/slide" Target="slides/slide1.xml"/></Relationships>`],
    ['ppt/slides/slide1.xml', `<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld><p:spTree><a:tbl>${table}</a:tbl></p:spTree></p:cSld></p:sld>`]
  ]);
}

function expectedFiles() {
  const files = new Set();
  for (const [group, definition] of Object.entries(LAYOUT.groups)) {
    for (const name of definition.files || []) files.add(`${group}/${name}`);
    if (definition.sequence) {
      for (let index = 1; index <= definition.sequence.count; index++) {
        files.add(`${group}/${definition.sequence.pattern.replace('{index:03}', String(index).padStart(3, '0'))}`);
      }
    }
  }
  return files;
}

function safeOutput(raw) {
  const target = path.resolve(raw || DEFAULT_OUT);
  const relative = path.relative(KIT, target).split(path.sep).join('/');
  if (target !== DEFAULT_OUT && !/^\.tmp-uat-[a-z0-9-]+$/u.test(relative)) {
    throw new Error('Output must be UAT_TEST_KIT/inputs or UAT_TEST_KIT/.tmp-uat-<name>');
  }
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Refusing linked output');
  return target;
}

function generate(rawOutput) {
  if (LAYOUT.schema !== 'datasecure-synthetic-uat-layout/3') throw new Error('Unsupported fixture layout');
  const output = safeOutput(rawOutput);
  fs.rmSync(output, { recursive: true, force: true });
  for (const group of Object.keys(LAYOUT.groups)) fs.mkdirSync(path.join(output, group), { recursive: true });

  fs.writeFileSync(path.join(output, '01-positive', 'personnel-profile.txt'), PROFILE);
  fs.writeFileSync(path.join(output, '01-positive', 'personnel-profile.md'), PROFILE);
  fs.writeFileSync(path.join(output, '01-positive', 'personnel-profile.csv'), [
    'Feld,Wert', 'Name,Lina Testfeld', 'E-Mail,lina.testfeld@privacy-example.test',
    'Telefon,+49 221 555 0182', 'IBAN,DE89 3704 0044 0532 0130 00',
    'Arbeitgeber,Nordstern Medizin IT GmbH', 'Kunde,Falken Klinikverbund AG',
    'Rolle,Product Owner', 'Technologien,"Java, SQL, HL7 FHIR, Testautomatisierung"',
    'Zertifizierung,ISTQB Certified Tester Foundation Level',
    'Zertifizierung,Scrum.org Professional Scrum Master II (PSM II)', ''
  ].join('\n'));
  fs.writeFileSync(path.join(output, '01-positive', 'personnel-profile.docx'), makeDocx(PROFILE));
  fs.writeFileSync(path.join(output, '01-positive', 'personnel-profile.xlsx'), makeXlsx());
  fs.writeFileSync(path.join(output, '01-positive', 'personnel-profile.pptx'), makePptx());
  fs.writeFileSync(path.join(output, '02-review', 'ambiguous-certificate-provider.txt'), AMBIGUOUS);
  fs.writeFileSync(path.join(output, '02-review', 'personnel-profile-with-image.docx'), makeDocx(PROFILE, true));

  const blocked = path.join(output, '03-blocked');
  fs.writeFileSync(path.join(blocked, 'blocked-text.pdf'), '%PDF-1.4\n%%EOF\n');
  fs.writeFileSync(path.join(blocked, 'blocked-image.png'),
    encodePng({ width: 32, height: 32, rgba: Buffer.alloc(32 * 32 * 4, 0xff) }));
  fs.writeFileSync(path.join(blocked, 'malformed.docx'), 'Intentionally not an OOXML ZIP.');

  const filler = 'Fachlicher Kontext: Testautomatisierung und HL7 FHIR bleiben erhalten.\n'.repeat(256);
  for (let index = 1; index <= 100; index++) {
    fs.writeFileSync(path.join(output, '04-batch-100', `batch-${String(index).padStart(3, '0')}.txt`), `# Synthetischer Batchfall ${index}
Name: Testperson ${index}
E-Mail: batch-${String(index).padStart(3, '0')}@privacy-example.test
Telefon: +49 30 7000${String(index).padStart(4, '0')}
IBAN: DE89 3704 0044 0532 0130 00
Kunde: Testfirma ${index} GmbH
Rolle: Testmanager
Zertifizierung: ISTQB Certified Tester Foundation Level
${filler}`);
  }

  const actual = new Set(fs.readdirSync(output, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile()).map((entry) => {
      const parent = entry.parentPath || entry.path;
      return path.relative(output, path.join(parent, entry.name)).split(path.sep).join('/');
    }));
  const expected = expectedFiles();
  const missing = [...expected].filter((name) => !actual.has(name));
  const extra = [...actual].filter((name) => !expected.has(name));
  if (expected.size !== LAYOUT.file_count || actual.size !== LAYOUT.file_count || missing.length || extra.length) {
    throw new Error(`Fixture layout mismatch: expected=${expected.size} actual=${actual.size} missing=${missing.join(',')} extra=${extra.join(',')}`);
  }
  return { output, count: actual.size };
}

if (require.main === module) {
  const outIndex = process.argv.indexOf('--out');
  const result = generate(outIndex >= 0 ? process.argv[outIndex + 1] : undefined);
  console.log(`Synthetic UAT fixtures created: ${result.count} files`);
}

module.exports = { generate, expectedFiles, safeOutput, DEFAULT_OUT, LAYOUT };
