'use strict';

// Fixed synthetic engineering data only. No test helpers, input files or
// caller-supplied strings are accepted by this module.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function fixedDocx(extended = false) {
  // A larger LAST document widens the real post-parser privacy-processing
  // window. No sleeps, parser hooks, executable content or arbitrary inputs.
  const extra = extended ? '<w:p><w:r><w:t>Technik: TypeScript, Java, SQL und automatisierte Softwaretests.</w:t></w:r></w:p>'.repeat(3072) : '';
  const parts = [
    ['[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Zertifizierung: Scrum.org PSM I</w:t></w:r></w:p><w:p><w:r><w:t>Kontakt: Carla Beispiel, carla@example.test</w:t></w:r></w:p><w:p><w:r><w:t>Technik: Java und SQL</w:t></w:r></w:p>' + extra + '<w:sectPr/></w:body></w:document>']
  ];
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of parts) {
    const filename = Buffer.from(name, 'utf8');
    const body = Buffer.from(text, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt32LE(crc32(body), 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(body.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    header.copy(entry, 6, 4, 30);
    entry.writeUInt32LE(offset, 42);
    local.push(header, filename, body);
    central.push(entry, filename);
    offset += header.length + filename.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

function createSyntheticFixtures(scenario = 'positive') {
  if (!['positive', 'disconnect', 'worker-resume'].includes(scenario)) throw new Error('SEA_BATCH_FIXTURE_INVALID');
  return [
    { name: 'synthetic-one.txt', bytes: Buffer.from('Kontakt: Alice Beispiel, alice@example.test\nTechnik: TypeScript\n', 'utf8') },
    { name: 'synthetic-two.csv', bytes: Buffer.from('Kontakt;E-Mail;Fachtext\nBob Beispiel;bob@example.test;Automatisierte Softwaretests\n', 'utf8') },
    { name: 'synthetic-three.docx', bytes: fixedDocx(scenario === 'worker-resume') }
  ];
}

module.exports = Object.freeze({ createSyntheticFixtures });
