'use strict';

const { createSuite } = require('./helpers');
const { IBAN_RE, identifierDetectionText } = require('../plugins/data-secure/server/privacy/base');
const { ibanBoundaryEnd } = require('../plugins/data-secure/server/privacy/iban-boundary');
const { findStructuredSpans, scanStructured, replaceStructured } = require('../plugins/data-secure/server/privacy/structured');
const pii = require('../plugins/data-secure/server/pii-engine');
const { fullwidth, profiles, professionalText } = require('./lib/identifier-compatibility');

const { test, assert, done } = createSuite('IBAN prose boundaries');
const german = 'DE89 3704 0044 0532 0130 00';
const prose = ' fachlicher nachsatz';

function originalMatch(source) {
  IBAN_RE.lastIndex = 0;
  const match = IBAN_RE.exec(identifierDetectionText(source));
  assert.ok(match, 'fixture must exercise the existing broad IBAN detector');
  return match;
}

function assertConservative(source) {
  const match = originalMatch(source);
  const originalEnd = match.index + match[0].length;
  assert.strictEqual(ibanBoundaryEnd(identifierDetectionText(source), match), originalEnd, source);
  const span = findStructuredSpans(source).find(s => s.type === 'IBAN');
  assert.deepStrictEqual([span.start, span.end, span.text], [match.index, originalEnd, match[0]], source);
}

// All new descriptions/documents are synthetic. Bank examples describe syntax,
// never live customer accounts; no checksum is required for a redaction.
test('the reported ASCII prose regression is removed in every privacy profile', () => {
  const source = `IBAN: ${german}${prose}`;
  assert.ok(originalMatch(source)[0].includes('fachlicher'), 'exercise the former over-redaction');
  for (const profile of profiles) {
    const result = pii.anonymize(source, profile);
    assert.strictEqual(result.text, `IBAN: [BANK_DATA_REDACTED]${prose}`, profile);
    assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), [], profile);
  }
});

test('compact and space variants retain the same numeric boundary', () => {
  for (const value of [german.replaceAll(' ', ''), german, german.replaceAll(' ', '\t'),
    german.replaceAll(' ', '\u00a0'), german.replaceAll(' ', '\u202f'), german.replaceAll(' ', '\u2007')]) {
    const source = `IBAN: ${value}${prose}`;
    assert.strictEqual(replaceStructured(source, []), `IBAN: [BANK_DATA_REDACTED]${prose}`);
  }
});

test('grouped IBAN separators are removed completely for common country layouts', () => {
  const values = [
    'DE89370400440532013000',
    'GB82WEST12345698765432',
    'NL91ABNA0417164300',
    'AT611904300234573201',
    'BE68539007547034'
  ];
  for (const compact of values) for (const separator of [' ', '-', '.', '/', '\u2010', '\u2011', '\u2012', '\u2013', '\u2212']) {
    const grouped = compact.match(/.{1,4}/gu).join(separator);
    const source = `IBAN: ${grouped}`;
    assert.strictEqual(replaceStructured(source, []), 'IBAN: [BANK_DATA_REDACTED]', `${compact.slice(0, 2)} ${separator}`);
    assert.ok(scanStructured(source).some((finding) => finding.type === 'IBAN' && finding.text === grouped));
  }
});

test('mixed grouping remains one IBAN while short technical codes stay visible', () => {
  const grouped = 'DE89-3704.0044/0532\u20110130 00';
  assert.strictEqual(replaceStructured(`IBAN: ${grouped}`, []), 'IBAN: [BANK_DATA_REDACTED]');
  for (const source of ['DE12-ABC-123', 'Version DE12-ABC-123', 'AA12.345']) {
    assert.strictEqual(replaceStructured(source, []), source);
    assert.ok(!scanStructured(source).some((finding) => finding.type === 'IBAN'), source);
  }
});

test('bounded separator tokens cover ordinary spacing around punctuation', () => {
  const values = [
    'DE89370400440532013000',
    'GB82WEST12345698765432',
    'NL91ABNA0417164300',
    'AT611904300234573201',
    'BE68539007547034'
  ];
  const groupers = [
    (groups) => groups.join('  '),
    (groups) => groups.join(' - '),
    (groups) => groups.join('- '),
    (groups) => groups.join('.\u00a0'),
    (groups) => groups.join('\u202f/\u202f'),
    (groups) => groups.join(' \u2011 ')
  ];
  for (const compact of values) for (const group of groupers) {
    const value = group(compact.match(/.{1,4}/gu));
    const source = `IBAN: ${value}`;
    const start = source.indexOf(value);
    const span = findStructuredSpans(source).find((candidate) => candidate.type === 'IBAN');
    assert.deepStrictEqual(span && [span.start, span.end, span.text],
      [start, start + value.length, value], source);
    for (const profile of profiles) {
      const result = pii.anonymize(source, profile);
      assert.strictEqual(result.text, 'IBAN: [BANK_DATA_REDACTED]', `${profile}: ${source}`);
      assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), [], source);
    }
  }
});

test('a known numeric IBAN ends before labelled contacts and prose', () => {
  const cases = [
    [`IBAN: ${german} Tel 030 1234567`, 'IBAN: [BANK_DATA_REDACTED] Tel [PHONE_REDACTED]'],
    [`IBAN: ${german} Vielen Dank`, 'IBAN: [BANK_DATA_REDACTED] Vielen Dank'],
    [`IBAN: ${german} BIC: BYLADEM1001`, 'IBAN: [BANK_DATA_REDACTED] BIC: [BANK_DATA_REDACTED]'],
    [`IBAN: ${german} IBAN: AT61 1904 3002 3457 3201`, 'IBAN: [BANK_DATA_REDACTED] IBAN: [BANK_DATA_REDACTED]'],
    [`IBAN: ${german}`, 'IBAN: [BANK_DATA_REDACTED]']
  ];
  for (const [source, expected] of cases) for (const profile of profiles) {
    const result = pii.anonymize(source, profile);
    assert.strictEqual(result.text, expected, `${profile}: ${source}`);
    assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), []);
  }
});

test('fullwidth detection preserves original UTF-16 spans and professional text', () => {
  const value = fullwidth(german);
  const source = `${professionalText}\nIBAN: ${value}${prose}`;
  const start = source.indexOf(value);
  const span = findStructuredSpans(source).find(s => s.type === 'IBAN');
  assert.deepStrictEqual([span.start, span.end, span.text], [start, start + value.length, value]);
  assert.deepStrictEqual(scanStructured(source).find(s => s.type === 'IBAN'), {
    type: 'IBAN', start, end: start + value.length, text: value
  });
  for (const profile of profiles) {
    assert.strictEqual(pii.anonymize(source, profile).text,
      `${professionalText}\nIBAN: [BANK_DATA_REDACTED]${prose}`, profile);
  }
});

test('the small numeric international subset uses its own country length', () => {
  for (const value of ['AT61 1904 3002 3457 3201', 'BE68 5390 0754 7034']) {
    assert.strictEqual(replaceStructured(`IBAN: ${value}${prose}`, []),
      `IBAN: [BANK_DATA_REDACTED]${prose}`);
  }
});

test('invalid check digits and lowercase country prefixes are still redacted', () => {
  for (const value of [german.replace('DE89', 'DE00'), german.toLowerCase(),
    'AT00 1904 3002 3457 3201', 'BE00 5390 0754 7034']) {
    assert.strictEqual(replaceStructured(`IBAN: ${value}${prose}`, []),
      `IBAN: [BANK_DATA_REDACTED]${prose}`);
  }
});

test('numeric BBAN typos and incomplete numeric prefixes keep their broad match', () => {
  for (const value of [german.replace('0532', 'O532'), german.slice(0, -1),
    'AT61 1904 3002 3457 32', 'BE68 5390 0754 70']) assertConservative(`IBAN: ${value}${prose}`);
});

test('compact longer identifiers are never shortened at the nominal country length', () => {
  for (const ending of ['1234', 'abcdef', 'ABCDEF', 'a1B2']) {
    assertConservative(`IBAN: ${german}${ending}${prose}`);
  }
});

test('separated numeric continuations remain conservative', () => {
  for (const ending of [' 1234', ' 1234567890']) {
    assertConservative(`IBAN: ${german}${ending}${prose}`);
  }
});

test('separated alphabetic and prose tails remain outside a fixed numeric IBAN', () => {
  for (const ending of [' ABCDEF', ' abcd efgh', ' alpha42 beta', ' alphaBeta nachsatz',
    ' alpha_beta nachsatz', ' alpha-beta nachsatz', ' alpha/beta nachsatz', ' fachlicher',
    ' abc def', ' fachlicher nachsatz 42', ' fachlicher nachsatz CODE',
    ` fachlicher ${'nachsatz '.repeat(40)}`]) {
    assert.strictEqual(replaceStructured(`IBAN: ${german}${ending}`, []),
      `IBAN: [BANK_DATA_REDACTED]${ending}`);
  }
});

test('unlisted country layouts are not truncated by a known country length', () => {
  for (const value of ['ZZ89 3704 0044 0532 0130 00',
    'FR14 2004 1010 0505 0001 3M02 606']) {
    assertConservative(`IBAN: ${value}${prose}`);
  }
});

test('known alphanumeric country layouts retain following prose', () => {
  for (const value of ['GB82 WEST 1234 5698 7654 32', 'NL91 ABNA 0417 1643 00']) {
    assert.strictEqual(replaceStructured(`IBAN: ${value}${prose}`, []),
      `IBAN: [BANK_DATA_REDACTED]${prose}`);
  }
});

test('every allowed separator can delimit a following IBAN', () => {
  for (const separator of [' ', '-', '.', '/', '\u2010', '\u2011', '\u2012', '\u2013', '\u2212']) {
    for (const first of [german, 'GB82 WEST 1234 5698 7654 32', 'FR14 2004 1010 0505 0001 3M02 606']) {
      const source = `${first}${separator}AT61 1904 3002 3457 3201`;
      assert.strictEqual(replaceStructured(source, []),
        `[BANK_DATA_REDACTED]${separator}[BANK_DATA_REDACTED]`, source);
    }
  }
});

test('numeric continuations stop before an explicit following label', () => {
  const firstValues = [
    german,
    'GB82 WEST 1234 5698 7654 32',
    'NL91 ABNA 0417 1643 00',
    'AT61 1904 3002 3457 3201',
    'BE68 5390 0754 7034'
  ];
  const cases = [
    [' Tel 030 1234567', ' Tel [PHONE_REDACTED]'],
    ['-Tel 030 1234567', '-Tel [PHONE_REDACTED]'],
    ['.BIC: BYLADEM1001', '.BIC: [BANK_DATA_REDACTED]'],
    ['/IBAN: AT61 1904 3002 3457 3201', '/IBAN: [BANK_DATA_REDACTED]'],
    ['\u2011Telefon: 030 1234567', '\u2011Telefon: [PHONE_REDACTED]']
  ];
  for (const first of firstValues) for (const [suffix, expectedSuffix] of cases) {
    const source = `${first} 1234${suffix}`;
    for (const profile of profiles) {
      const result = pii.anonymize(source, profile);
      assert.strictEqual(result.text, `[BANK_DATA_REDACTED]${expectedSuffix}`, `${profile}: ${source}`);
      assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), [], source);
    }
  }
});

test('numeric continuations preserve other explicit form labels', () => {
  const firstValues = [
    german,
    'GB82 WEST 1234 5698 7654 32',
    'NL91 ABNA 0417 1643 00',
    'AT61 1904 3002 3457 3201',
    'BE68 5390 0754 7034'
  ];
  const cases = [
    [' E-Mail: anna@example.de', ' E-Mail: [EMAIL_REDACTED]'],
    [' Name: Anna Beispiel', ' Name: [PERSON_001]'],
    [' Adresse: Testweg 1, 10115 Berlin', ' Adresse: [LOCATION_REDACTED], [LOCATION_REDACTED]'],
    [' Kundennummer: KD-123456', ' Kundennummer: [ID_REDACTED]']
  ];
  for (const first of firstValues) for (const [suffix, expectedSuffix] of cases) {
    const source = `${first} 1234${suffix}`;
    for (const profile of profiles) {
      const result = pii.anonymize(source, profile);
      assert.strictEqual(result.text, `[BANK_DATA_REDACTED]${expectedSuffix}`, `${profile}: ${source}`);
      assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), [], source);
    }
  }
});

test('unknown form labels cannot release an unowned numeric value', () => {
  for (const [label, value] of [['Konto', '030 1234567'], ['Notiz', '+49 30 1234567'], ['Geheim', '030/1234567']]) {
    const source = `${german} 1234 ${label}: ${value} Hinweis`;
    for (const profile of profiles) {
      const result = pii.anonymize(source, profile);
      assert.ok(!result.text.includes('030'), `${profile}: ${source}`);
      assert.ok(!result.text.includes('1234567'), `${profile}: ${source}`);
      assert.ok(result.text.endsWith(' Hinweis'), `${profile}: ${source}`);
      assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), [], source);
    }
  }
});

test('long grouped technical identifiers keep the documented conservative direction', () => {
  const source = 'Build DE12-ABCD-EFGH-IJKL-MNOP-QR ist freigegeben';
  for (const profile of profiles) {
    const result = pii.anonymize(source, profile);
    assert.ok(result.text.includes('[BANK_DATA_REDACTED]'), profile);
    assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), [], profile);
  }
});

test('line breaks and punctuation already separating an IBAN retain their text', () => {
  for (const separator of ['\n', '\r\n', '. ', ', ', '; ']) {
    const source = `IBAN: ${german}${separator}fachlicher nachsatz`;
    assert.strictEqual(replaceStructured(source, []),
      `IBAN: [BANK_DATA_REDACTED]${separator}fachlicher nachsatz`);
  }
});

test('multiple IBANs are still scanned after a shortened match', () => {
  const source = `IBAN: ${german}${prose}\nIBAN: AT61 1904 3002 3457 3201${prose}.`;
  assert.strictEqual(findStructuredSpans(source).filter(s => s.type === 'IBAN').length, 2);
  assert.strictEqual(replaceStructured(source, []),
      `IBAN: [BANK_DATA_REDACTED]${prose}\nIBAN: [BANK_DATA_REDACTED]${prose}.`);
});

test('a following higher-priority email cannot discard the complete bank span', () => {
  for (const value of [german, fullwidth(german)]) for (const separator of [' ', '-', '.']) {
    const source = `IBAN: ${value}${separator}anna@example.de`;
    const spans = findStructuredSpans(source);
    const bank = spans.find(s => s.type === 'IBAN');
    const email = spans.find(s => s.type === 'EMAIL');
    assert.ok(bank.end < email.start, 'the two detections must not overlap');
    assert.strictEqual(bank.text, value, source);
    assert.strictEqual(email.text, 'anna@example.de', source);
    for (const profile of profiles) {
      const result = pii.anonymize(source, profile);
      assert.strictEqual(result.text,
        `IBAN: [BANK_DATA_REDACTED]${separator}[EMAIL_REDACTED]`, profile);
      assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), [], profile);
    }
  }
});

test('numeric-country OCR substitutions cannot swallow a following phone label', () => {
  for (const value of [
    'DE89 37O4 0044 0532 0130 00',
    'AT61 19O4 3002 3457 3201',
    'BE68 539O 0754 7034'
  ]) {
    const source = `IBAN: ${value} Tel 030 1234567`;
    for (const profile of profiles) {
      const result = pii.anonymize(source, profile);
      assert.strictEqual(result.text,
        'IBAN: [BANK_DATA_REDACTED] Tel [PHONE_REDACTED]', `${profile}: ${source}`);
      assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), [], source);
    }
  }
});

test('a following lower-priority phone is retained as a separate detection', () => {
  for (const ending of ['+49 30 12345678', 'Telefon: 030 12345678']) {
    const source = `IBAN: ${german} ${ending}`;
    const spans = findStructuredSpans(source);
    const bank = spans.find(s => s.type === 'IBAN');
    const phone = spans.find(s => s.type === 'PHONE');
    assert.ok(bank.end <= phone.start, 'the two detections must not overlap');
    for (const profile of profiles) {
      const result = pii.anonymize(source, profile);
      assert.ok(result.text.includes('[BANK_DATA_REDACTED]'), profile);
      assert.ok(result.text.includes('[PHONE_REDACTED]'), profile);
      assert.ok(!result.text.includes('12345678'), profile);
      assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), [], profile);
    }
  }
});

test('a second IBAN on the same line is scanned completely', () => {
  for (const second of [german, 'AT61 1904 3002 3457 3201', 'GB82 WEST 1234 5698 7654 32']) {
    const source = `IBAN: ${german} ${second}`;
    const banks = findStructuredSpans(source).filter(s => s.type === 'IBAN');
    assert.strictEqual(banks.length, 2);
    assert.ok(banks[0].end < banks[1].start);
    for (const profile of profiles) {
      assert.strictEqual(pii.anonymize(source, profile).text,
        'IBAN: [BANK_DATA_REDACTED] [BANK_DATA_REDACTED]', profile);
    }
  }
});

test('ambiguous numeric continuations remain wholly redacted even beyond 34 characters', () => {
  for (const ending of ['030 12345678', '030 12345678901', '030/12345678901',
    '030 1234567-999', '123456789012345678901234567890']) {
    const source = `IBAN: ${german} ${ending}${prose}`;
    assert.strictEqual(replaceStructured(source, []), `IBAN: [BANK_DATA_REDACTED]${prose}`);
  }
});

test('numeric and alphabetic emails after intervening number groups never overlap the bank span', () => {
  for (const middle of ['1234', '1234567890123', '1234 5678', '030/12345678901']) {
    for (const email of ['1@example.de', 'anna@example.de', '123.abc@example.de', '1-a@example.de']) {
      for (const transform of [value => value, fullwidth]) {
        const privatePrefix = transform(`${german} ${middle}`);
        const emailValue = transform(email);
        const source = `${professionalText}\n${privatePrefix} ${emailValue}`;
        const start = source.indexOf(privatePrefix);
        const spans = findStructuredSpans(source);
        const bank = spans.find(s => s.type === 'IBAN');
        const contact = spans.find(s => s.type === 'EMAIL');
        assert.deepStrictEqual([bank.start, bank.end, bank.text],
          [start, start + privatePrefix.length, privatePrefix], source);
        assert.ok(bank.end < contact.start, source);
        assert.strictEqual(contact.text, emailValue, source);
        for (const profile of profiles) {
          const result = pii.anonymize(source, profile);
          assert.strictEqual(result.text,
            `${professionalText}\n[BANK_DATA_REDACTED] [EMAIL_REDACTED]`, `${profile}: ${source}`);
          assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), [], profile);
        }
      }
    }
  }
});

test('a numeric email after a slash cannot be consumed by numerical extension', () => {
  for (const ending of ['1@example.de', 'anna@example.de']) {
    const source = `${german} 1234567890123/${ending}`;
    assert.strictEqual(replaceStructured(source, []), '[BANK_DATA_REDACTED]/[EMAIL_REDACTED]');
  }
});

test('a following IBAN after intervening groups is rescanned in full', () => {
  for (const middle of ['1234', '1234567890123', '1234 5678']) {
    for (const next of ['AT61 1904 3002 3457 3201', 'GB82 WEST 1234 5698 7654 32',
      'FR14 2004 1010 0505 0001 3M02 606']) {
      for (const transform of [value => value, fullwidth]) {
        const privatePrefix = transform(`${german} ${middle}`);
        const nextValue = transform(next);
        const source = `${privatePrefix} ${nextValue}`;
        const banks = findStructuredSpans(source).filter(s => s.type === 'IBAN');
        assert.strictEqual(banks.length, 2, source);
        assert.deepStrictEqual([banks[0].text, banks[1].text], [privatePrefix, nextValue], source);
        assert.ok(banks[0].end < banks[1].start, source);
        for (const profile of profiles) {
          const result = pii.anonymize(source, profile);
          assert.strictEqual(result.text, '[BANK_DATA_REDACTED] [BANK_DATA_REDACTED]', `${profile}: ${source}`);
          assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), [], profile);
        }
      }
    }
  }
});

test('separate follower protection also applies to first IBANs outside the numeric subset', () => {
  for (const first of ['GB82 WEST 1234 5698 7654 32', 'FR14 2004 1010 0505 0001 3M02 606']) {
    for (const middle of ['', '1234 ']) {
      for (const last of ['AT61 1904 3002 3457 3201', '1@example.de', 'anna@example.de']) {
        for (const transform of [value => value, fullwidth]) {
          const source = transform(`${first} ${middle}${last}`);
          const lastReplacement = last.includes('@') ? '[EMAIL_REDACTED]' : '[BANK_DATA_REDACTED]';
          for (const profile of profiles) {
            const result = pii.anonymize(source, profile);
            assert.strictEqual(result.text, `[BANK_DATA_REDACTED] ${lastReplacement}`, `${profile}: ${source}`);
            assert.deepStrictEqual(pii.scanResidual(result.text, profile, result.dictionary), [], profile);
          }
        }
      }
    }
  }
});

done();
