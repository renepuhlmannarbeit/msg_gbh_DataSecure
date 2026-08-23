'use strict';

// Papa Parse is deliberately an oracle only. The release parser stays the
// small local finite-state implementation in document-parser.js, so this test
// makes dialect regressions visible without putting third-party code on the
// production privacy boundary.
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { createSuite } = require('./helpers');
const { parseCsvRows, csvDelimiter } = require('../plugins/data-secure/server/document-parser');

const { test, done, assert } = createSuite('CSV differential oracle');
const root = path.join(__dirname, '..');

function csvCell(value, delimiter) {
  const text = String(value);
  // For auto-detection the corpus must use an unambiguous CSV dialect. A
  // semicolon-delimited file with unquoted commas is legal, but indistinguishable
  // from a comma-delimited table in the general case and is intentionally a
  // fail-closed ambiguity in the product parser.
  return /[",;\t\r\n]/u.test(text) || text.includes(delimiter)
    ? `"${text.replace(/"/gu, '""')}"`
    : text;
}

function sourceFor(rows, delimiter, newline) {
  return rows.map((row) => row.map((value) => csvCell(value, delimiter)).join(delimiter)).join(newline);
}

test('Papa Parse is locked as a test-only MIT oracle, never a runtime dependency', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.strictEqual(manifest.dependencies, undefined, 'no production dependencies are allowed');
  assert.strictEqual(manifest.devDependencies?.papaparse, '5.5.3');
  const oracle = lock.packages?.['node_modules/papaparse'];
  assert.deepStrictEqual(oracle && {
    version: oracle.version, license: oracle.license, dev: oracle.dev,
    integrity: oracle.integrity
  }, {
    version: '5.5.3', license: 'MIT', dev: true,
    integrity: 'sha512-5QvjGxYVjxO59MGU2lHVYpRWBBtKHnlIAcSe1uNFCkkptUh63NFRj0FJQm7nR67puEruUci/ZkjmEFrjCAyP4A=='
  });
});

test('our closed CSV parser agrees with Papa Parse for 180 valid dialect and quote cases', () => {
  const delimiters = [',', ';', '\t'];
  const newlines = ['\n', '\r\n'];
  const atoms = ['plain', 'mit Leerzeichen', 'Komma, innen', 'Semikolon; innen', 'Tab\tinnen', 'Quote " innen', 'Zeile 1\nZeile 2', '', 'ÄÖÜß'];
  let assertions = 0;
  for (let index = 0; index < 180; index++) {
    const delimiter = delimiters[index % delimiters.length];
    const newline = newlines[index % newlines.length];
    const columns = 2 + (index % 4);
    const rows = Array.from({ length: 2 + (index % 5) }, (_, row) =>
      Array.from({ length: columns }, (_, column) =>
        `${atoms[(index + row * 3 + column * 5) % atoms.length]}-${row}-${column}`));
    const source = sourceFor(rows, delimiter, newline);
    const normalized = source.replace(/\r\n?/gu, '\n');
    const oracle = Papa.parse(normalized, { delimiter, skipEmptyLines: false });
    assert.deepStrictEqual(oracle.errors, [], `Papa Parse rejected valid case ${index}`);
    assert.deepStrictEqual(parseCsvRows(normalized, delimiter), oracle.data, `row mismatch in case ${index}`);
    assert.strictEqual(csvDelimiter(normalized), delimiter, `dialect mismatch in case ${index}`);
    assertions++;
  }
  assert.strictEqual(assertions, 180);
});

done();
