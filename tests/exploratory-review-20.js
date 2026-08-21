'use strict';

// Twenty black-box probes added during the post-fix review. Each case captures
// an alternative real-world representation or an ambiguous binary container
// that previously passed the privacy boundary unnoticed.

const path = require('path');
const { zipStore } = require('./lib/zip');

const runtime = path.join(__dirname, '..', 'plugins', 'data-secure', 'server');
const pii = require(path.join(runtime, 'pii-engine.js'));
const { readZip } = require(path.join(runtime, 'zip-reader.js'));
const { encodePng, decodePng } = require(path.join(runtime, 'image-sanitizer.js'));

const results = [];

function released(text, profile = 'general') {
  let candidate = text;
  const dictionary = [];
  for (let pass = 0; pass < 3; pass++) {
    const result = pii.anonymize(candidate, profile);
    candidate = result.text;
    dictionary.push(...result.dictionary);
    if (!pii.scanResidual(candidate, profile, dictionary).length) break;
  }
  return candidate;
}

function absent(name, source, needle, profile = 'general') {
  const output = released(source, profile);
  const pass = !output.toLocaleLowerCase('de-DE').includes(needle.toLocaleLowerCase('de-DE'));
  results.push({ name, pass, source, output });
}

function rejects(name, fn) {
  let pass = false;
  let output = 'accepted';
  try {
    fn();
  } catch (error) {
    pass = true;
    output = `${error.constructor.name}: ${error.message}`;
  }
  results.push({ name, pass, source: 'binary fixture', output });
}

absent('01 international phone with trunk prefix', 'Telefon: +49 (0)30 1234567', '+49 (0)30 1234567', 'customer');
absent('02 two-group phone with dash', 'Tel.: 030-123456', '030-123456', 'customer');
absent('03 phone with extension', 'Durchwahl: 030 123456-789', '030 123456-789', 'customer');
absent('04 Unicode local-part email', 'E-Mail: jörg.müller@example.de', 'jörg.müller@example.de', 'customer');
absent('05 Unicode IDN email', 'E-Mail: max@büro.de', 'max@büro.de', 'customer');
absent('06 IPv6 address', 'Client-IP: 2001:db8:85a3::8a2e:370:7334', '2001:db8:85a3::8a2e:370:7334', 'customer');
absent('07 lower-case IBAN', 'IBAN: de02120300000000202051', 'de02120300000000202051', 'contract');
absent('08 lower-case spaced IBAN', 'IBAN: de02 1203 0000 0000 2020 51', 'de02 1203 0000 0000 2020 51', 'contract');
absent('09 multi-word street', 'Neue Mainzer Straße 52', 'Neue Mainzer Straße 52', 'customer');
absent('10 prepositional street', 'Unter den Linden 5', 'Unter den Linden 5', 'customer');
absent('11 titled compound street', 'Dr.-Müller-Straße 4', 'Dr.-Müller-Straße 4', 'customer');
absent('12 lower-case city', '10115 berlin', '10115 berlin', 'customer');
absent('13 comma-formatted name', 'Mustermann, Max\nMusterstraße 12\n10115 Berlin', 'Mustermann, Max', 'customer');
absent('14 four-token name', 'Karl Theodor Maria Mustermann\nMusterstraße 12\n10115 Berlin', 'Karl Theodor Maria Mustermann', 'customer');
absent('15 name with particles', 'Anna von der Leyen\nMusterstraße 12\n10115 Berlin', 'Anna von der Leyen', 'customer');
absent('16 labelled date of birth', 'Geburtsdatum: 01.02.1990', '01.02.1990', 'applicant');
absent('17 vehicle registration', 'Kennzeichen: B-AB 1234', 'B-AB 1234', 'customer');
absent('18 non-whitelisted URL suffix', 'Profil: https://example.info/max-mustermann', 'https://example.info/max-mustermann', 'customer');

rejects('19 duplicate ZIP entry names', () => {
  readZip(zipStore([
    ['word/document.xml', '<safe/>'],
    ['word/document.xml', '<different/>']
  ]));
});

rejects('20 PNG with invalid IDAT CRC', () => {
  const png = Buffer.from(encodePng({ width: 1, height: 1, rgba: Buffer.from([255, 255, 255, 255]) }));
  const idat = png.indexOf(Buffer.from('IDAT', 'ascii')) - 4;
  const length = png.readUInt32BE(idat);
  png[idat + 8 + length] ^= 0xff;
  decodePng(png);
});

for (const result of results) {
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}`);
  if (!result.pass) console.log(`     output: ${JSON.stringify(result.output)}`);
}
const passed = results.filter((result) => result.pass).length;
console.log(`SUMMARY ${passed}/20 passed, ${20 - passed}/20 suspicious`);
process.exitCode = passed === 20 ? 0 : 1;
