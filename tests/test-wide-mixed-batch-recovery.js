'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');

const scope = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-wide-mixed-recovery-'));
const previous = Object.fromEntries(['EU_PRIVACY_DATA_ROOT', 'EU_PRIVACY_ROOT', 'EU_PRIVACY_RESULT_ROOT',
  'LOCALAPPDATA', 'DATASECURE_PRODUCT_CHANNEL'].map(key => [key, process.env[key]]));
process.env.EU_PRIVACY_DATA_ROOT = path.join(scope, 'data');
process.env.EU_PRIVACY_ROOT = path.join(scope, 'privacy');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(scope, 'visible');
process.env.LOCALAPPDATA = path.join(scope, 'localapp');
process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT, { recursive: true });

const { roots } = require('../plugins/data-secure/server/gateway/common');
const { beginBatch, processBatchNext, resumeBatch, acknowledgeDeliveredPackage, _test } =
  require('../plugins/data-secure/server/gateway/batch');
const { parseDocumentBuffer } = require('../plugins/data-secure/server/document-parser');
const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { testAsync, done, assert } = createSuite('Wide/direct mixed batch recovery');

const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
function xlsx() {
  return zipStore([
    ...opcControlEntries('xlsx'),
    ['xl/workbook.xml', `<workbook xmlns="${S}" xmlns:r="${R}"><sheets><sheet name="Quelle" sheetId="1" r:id="s1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${PR}"><Relationship Id="s1" Type="${R}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', `<worksheet xmlns="${S}"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>opaque</t></is></c></row></sheetData></worksheet>`]
  ]);
}
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const normalDirect = async (source, options = {}) => parseDocumentBuffer(
  options.inputBuffer || fs.readFileSync(source), path.extname(options.sourceName || source).toLowerCase());
const completeWide = async () => createMarkdownExtraction({ source_type: 'xlsx',
  markdown: 'Name: Max Mustermann\nArbeitgeber: Nordstern GmbH',
  coverage: { status: 'complete', reason_codes: [] } });

async function processAndAcknowledge(token, dependencies) {
  const result = await processBatchNext(token, dependencies);
  if (result.ok && result.package_id) return { ...result, ...acknowledgeDeliveredPackage(token, result.package_id) };
  return result;
}

async function runOrder(wideFirst) {
  const input = fs.mkdtempSync(path.join(scope, wideFirst ? 'wide-first-' : 'direct-first-'));
  const files = {
    direct: path.join(input, 'profile.txt'),
    wide: path.join(input, 'profile.xlsx')
  };
  fs.writeFileSync(files.direct, 'Name: Max Mustermann\nArbeitgeber: Nordstern GmbH', 'utf8');
  fs.writeFileSync(files.wide, xlsx());
  const order = wideFirst ? [files.wide, files.direct] : [files.direct, files.wide];
  const before = order.map(digest);
  const queue = order.map(full => { const stat = fs.lstatSync(full); return {
    name: path.basename(full), sourceLabel: path.basename(full), full, stat, sourceBytes: stat.size
  }; });
  const batch = beginBatch({ expectedCount: 2, profile: 'personnel_profile', queue,
    processingMode: 'markdown-and-anonymize' });
  const first = await processAndAcknowledge(batch.batch_token, { convertDocument: normalDirect, convertBuffer: completeWide });
  assert.equal(first.released, 1, JSON.stringify(first));

  const interrupted = await processBatchNext(batch.batch_token, wideFirst ? {
    async convertDocument() { throw Object.assign(new Error('cancelled'), { code: 'REQUEST_CANCELLED' }); },
    convertBuffer: completeWide
  } : {
    convertDocument: normalDirect,
    async convertBuffer() { throw Object.assign(new Error('cancelled'), { code: 'REQUEST_CANCELLED' }); }
  });
  assert.equal(interrupted.retryable, 1, JSON.stringify(interrupted));
  assert.equal(resumeBatch(batch.batch_token).ok, true);
  const final = await processAndAcknowledge(batch.batch_token, { convertDocument: normalDirect, convertBuffer: completeWide });
  assert.equal(final.complete, true, JSON.stringify(final));

  const state = _test.readState(batch.batch_token);
  assert.equal(state.items.filter(item => item.status === 'released').length, 2);
  assert.equal(new Set(state.items.map(item => item.package_id)).size, 2);
  const results = state.items.map(item => fs.readFileSync(
    path.join(roots().output, item.package_id, `${item.package_id}.md`), 'utf8'));
  for (const output of results) {
    assert.match(output, /\[PERSON_001\]/u);
    assert.match(output, /\[UNTERNEHMEN_001\]/u);
    assert.doesNotMatch(output, /Max Mustermann|Nordstern GmbH/u);
  }
  assert.deepEqual(order.map(digest), before);
}

async function runIncompleteWideBeforeDirect() {
  const input = fs.mkdtempSync(path.join(scope, 'incomplete-wide-'));
  const wide = path.join(input, 'scan.xlsx'), direct = path.join(input, 'profile.txt');
  fs.writeFileSync(wide, xlsx());
  fs.writeFileSync(direct, 'Name: Max Mustermann\nArbeitgeber: Nordstern GmbH', 'utf8');
  const queue = [wide, direct].map(full => { const stat = fs.lstatSync(full); return {
    name: path.basename(full), sourceLabel: path.basename(full), full, stat, sourceBytes: stat.size
  }; });
  const batch = beginBatch({ expectedCount: 2, profile: 'personnel_profile', queue,
    processingMode: 'markdown-and-anonymize' });
  const stopped = await processBatchNext(batch.batch_token, { convertDocument: normalDirect,
    async convertBuffer() { return createMarkdownExtraction({ source_type: 'xlsx',
      markdown: 'Name: Max Mustermann\nArbeitgeber: Nordstern GmbH',
      coverage: { status: 'incomplete', reason_codes: ['SOURCE_COVERAGE_UNVERIFIED'] } }); } });
  assert.equal(stopped.ok, false);
  assert.equal(stopped.error, 'PARSER_COVERAGE_UNVERIFIED');
  const released = await processAndAcknowledge(batch.batch_token,
    { convertDocument: normalDirect, convertBuffer: completeWide });
  assert.equal(released.complete, true, JSON.stringify(released));
  const state = _test.readState(batch.batch_token);
  assert.equal(state.items[0].status, 'stopped');
  assert.equal(Object.hasOwn(state.items[0], 'package_id'), false);
  const output = fs.readFileSync(path.join(roots().output, state.items[1].package_id,
    `${state.items[1].package_id}.md`), 'utf8');
  assert.match(output, /\[PERSON_001\]/u);
  assert.match(output, /\[UNTERNEHMEN_001\]/u);
}

testAsync('both mixed source orders resume with stable readable identities and exactly-once release', async () => {
  // The product permits one active batch at a time, so the two orderings are
  // intentionally exercised sequentially rather than as concurrent tests.
  await runOrder(false);
  await runOrder(true);
  await runIncompleteWideBeforeDirect();
});

done(() => {
  fs.rmSync(scope, { recursive: true, force: true });
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
