'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createSuite } = require('./helpers');
const { generate, positiveProfileFixtures, expectedFiles, LAYOUT } = require('../docs/acceptance/UAT_TEST_KIT/tools/generate-synthetic-uat-fixtures');
const { inspectSourceFormatFromFd } = require('../plugins/data-secure/server/gateway/source-format-inspector');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');

const { test, done, assert } = createSuite('Current UAT fixture generation');
const kit = path.resolve(__dirname, '..', 'docs', 'acceptance', 'UAT_TEST_KIT');
const output = path.join(kit, '.tmp-uat-contract');

function digestTree(root) {
  const result = new Map();
  for (const relative of [...expectedFiles()].sort()) {
    result.set(relative, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex'));
  }
  return result;
}

function inspect(relative, options = {}) {
  const target = path.join(output, relative);
  const stat = fs.lstatSync(target);
  const fd = fs.openSync(target, fs.constants.O_RDONLY);
  try { return inspectSourceFormatFromFd(fd, stat, path.extname(target), options); }
  finally { fs.closeSync(fd); }
}

test('package fixture bytes are available without a prior generated inputs directory', () => {
  const fixtures = positiveProfileFixtures();
  assert.deepStrictEqual([...fixtures.keys()], ['personnel-profile.txt', 'personnel-profile.md',
    'personnel-profile.csv', 'personnel-profile.docx', 'personnel-profile.xlsx', 'personnel-profile.pptx']);
  assert.ok([...fixtures.values()].every((bytes) => Buffer.isBuffer(bytes) && bytes.length > 0));
  assert.deepStrictEqual(positiveProfileFixtures(), fixtures);
});

test('Node generator creates exactly the current 111-file layout without historical inputs', () => {
  const result = generate(output);
  assert.strictEqual(result.count, 111);
  assert.strictEqual(LAYOUT.file_count, 111);
  assert.strictEqual(expectedFiles().size, 111);
  for (const relative of expectedFiles()) assert.ok(fs.statSync(path.join(output, relative)).isFile(), relative);
  for (const [name, bytes] of positiveProfileFixtures()) {
    assert.deepStrictEqual(fs.readFileSync(path.join(output, '01-positive', name)), bytes);
  }
  assert.match(fs.readFileSync(path.join(output, '01-positive', 'personnel-profile.txt'), 'utf8'), /Lina Testfeld/u);
  assert.ok(fs.readFileSync(path.join(output, '01-positive', 'personnel-profile.docx')).includes(Buffer.from('word/document.xml')));
  assert.ok(fs.readFileSync(path.join(output, '01-positive', 'personnel-profile.xlsx')).includes(Buffer.from('xl/worksheets/sheet1.xml')));
  assert.ok(fs.readFileSync(path.join(output, '01-positive', 'personnel-profile.pptx')).includes(Buffer.from('ppt/slides/slide1.xml')));
  assert.ok(fs.readFileSync(path.join(output, '02-review', 'personnel-profile-with-image.docx')).includes(Buffer.from('word/media/image1.png')));
  assert.strictEqual(inspect('01-positive/personnel-profile.docx').verdict, 'candidate');
  assert.strictEqual(inspect('02-review/personnel-profile-with-image.docx').verdict, 'candidate');
  const pluginPrivacy = { processingMode: 'markdown-and-anonymize', productChannel: 'plugin' };
  assert.strictEqual(inspect('01-positive/personnel-profile.xlsx', pluginPrivacy).verdict, 'candidate');
  assert.strictEqual(inspect('01-positive/personnel-profile.pptx', pluginPrivacy).verdict, 'candidate');
  assert.strictEqual(inspect('03-blocked/blocked-text.pdf', pluginPrivacy).verdict, 'not_released');
  assert.strictEqual(inspect('03-blocked/malformed.docx').verdict, 'rejected');
  const docx = fs.readFileSync(path.join(output, '01-positive', 'personnel-profile.docx'));
  const converted = extractMarkdownBuffer(docx, '.docx');
  const privacy = extractMarkdownBuffer(docx, '.docx', { omitDocxHeaderFooter: true });
  assert.match(converted.markdown, /DATENSECURE UAT KOPFZEILE/u);
  assert.match(converted.markdown, /DATENSECURE UAT FUSSZEILE/u);
  assert.doesNotMatch(privacy.markdown, /DATENSECURE UAT (?:KOPF|FUSS)ZEILE/u);
  assert.match(privacy.markdown, /Product Owner/u);
  assert.deepStrictEqual(privacy.coverage, {
    status: 'incomplete', reason_codes: [
      'DOCX_HEADER_FOOTER_EXCLUDED_BY_POLICY',
      'SOURCE_COVERAGE_UNVERIFIED'
    ]
  });
});

test('generation is byte-reproducible and rejects output outside the current kit', () => {
  const first = digestTree(output);
  generate(output);
  assert.deepStrictEqual(digestTree(output), first);
  assert.throws(() => generate(path.resolve(kit, '..', 'outside-uat')), /Output must be/u);
});

done(() => fs.rmSync(output, { recursive: true, force: true }));
