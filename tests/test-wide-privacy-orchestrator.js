'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSuite } = require('./helpers');

const scope = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-wide-privacy-'));
const previous = Object.fromEntries(['EU_PRIVACY_DATA_ROOT', 'EU_PRIVACY_ROOT', 'EU_PRIVACY_RESULT_ROOT',
  'DATASECURE_PRODUCT_CHANNEL'].map(key => [key, process.env[key]]));
process.env.EU_PRIVACY_DATA_ROOT = path.join(scope, 'data');
process.env.EU_PRIVACY_ROOT = path.join(scope, 'privacy');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(scope, 'visible');
process.env.DATASECURE_PRODUCT_CHANNEL = 'standalone';
fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT, { recursive: true });

const { createMarkdownExtraction } = require('../plugins/data-secure/server/standalone/markdown-contract');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { anonymizeNext } = require('../plugins/data-secure/server/gateway/orchestrator');
const { readOutput } = require('../plugins/data-secure/server/gateway/package-store');
const { createBatchPseudonymRegistry, READABLE_CONTRACT_VERSION } = require('../plugins/data-secure/server/batch-pseudonym-registry');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { testAsync, assert, done } = createSuite('Wide Standalone privacy orchestration');

function privateEntry(name, text = 'opaque binary source') {
  return { name, private_artifact_plain: true, private_bytes: Buffer.from(text) };
}

testAsync('complete wide extraction is converted once, anonymized and published without a raw dm artifact', async () => {
  const entry = privateEntry('customer.pdf');
  let conversions = 0;
  const result = await anonymizeNext('general', {
    productChannel: 'standalone',
    inputQueue: [entry],
    async convertBuffer() {
      conversions++;
      return createMarkdownExtraction({ source_type: 'pdf',
        markdown: 'E-Mail: max.mustermann@example.org\nTelefon: +49 30 12345678\nIBAN: DE89370400440532013000',
        coverage: { status: 'complete', reason_codes: [] } });
    }
  });
  assert.equal(conversions, 1);
  assert.equal(result.document_result.grade, 'complete');
  assert.equal(result.privacy_scope, 'extracted-markdown-only');
  assert.deepEqual(result.source_extraction_coverage, { status: 'complete', reason_codes: [] });
  assert.equal(result.raw_content_sent_to_claude, false);
  assert.ok(entry.private_bytes.every(byte => byte === 0));
  const released = readOutput(result.package_id, result.read_capability);
  assert.equal(released.ok, true);
  assert.doesNotMatch(released.text, /max\.mustermann|12345678|DE89370400440532013000/iu);
  assert.match(released.text, /\[EMAIL_REDACTED\]|\[PHONE_REDACTED\]|\[BANK_DATA_REDACTED\]/u);
  const rawRoot = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'markdown-artifacts');
  assert.equal(fs.existsSync(rawRoot) ? fs.readdirSync(rawRoot).length : 0, 0);
});

testAsync('incomplete but useful wide extraction anonymizes its Markdown once with an explicit scope notice', async () => {
  const entry = privateEntry('scan.png', 'unchanged source bytes');
  let conversions = 0;
  const result = await anonymizeNext('general', {
    productChannel: 'standalone', inputQueue: [entry],
    async convertBuffer() {
      conversions++;
      return createMarkdownExtraction({ source_type: 'png', markdown: 'Max Mustermann',
        coverage: { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED'] } });
    }
  });
  assert.equal(conversions, 1);
  assert.equal(result.document_result.grade, 'complete');
  assert.equal(result.privacy_scope, 'extracted-markdown-only');
  assert.deepEqual(result.source_extraction_coverage,
    { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED'] });
  const released = readOutput(result.package_id, result.read_capability).text;
  assert.match(released, /ausschließlich der lokal in Markdown umgewandelte Inhalt/u);
  assert.match(released, /\[PERSON_001\]/u);
  assert.doesNotMatch(released, /Max Mustermann/u);
  assert.ok(entry.private_bytes.every(byte => byte === 0));
});

testAsync('Standalone DOCX with non-rendered custom XML anonymizes extracted Markdown and reports source scope', async () => {
  const document = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body><w:p><w:r><w:t>Name: Max Mustermann</w:t></w:r></w:p></w:body></w:document>';
  const docx = zipStore([
    ...opcControlEntries('docx', { additionalOverrides: [{
      part: 'customXml/itemProps1.xml',
      contentType: 'application/vnd.openxmlformats-officedocument.customXmlProperties+xml'
    }] }),
    ['word/document.xml', document],
    ['customXml/item1.xml', '<profile><department>Vertrieb</department></profile>'],
    ['customXml/itemProps1.xml', '<ds:datastoreItem xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"/>']
  ]);
  const entry = { name: 'profile.docx', private_artifact_plain: true, private_bytes: Buffer.from(docx) };
  const result = await anonymizeNext('personnel_profile', {
    productChannel: 'standalone', inputQueue: [entry],
    async convertBuffer(input, extension) { return extractMarkdownBuffer(input, extension); }
  });
  assert.equal(result.document_result.grade, 'complete');
  assert.equal(result.privacy_scope, 'extracted-markdown-only');
  assert.deepEqual(result.source_extraction_coverage, {
    status: 'incomplete',
    reason_codes: ['SOURCE_COVERAGE_UNVERIFIED']
  });
  const released = readOutput(result.package_id, result.read_capability).text;
  assert.match(released, /\[PERSON_001\]/u);
  assert.doesNotMatch(released, /Max Mustermann|Vertrieb/u);
  assert.match(released, /Vollständigkeit der Extraktion aus der Originaldatei ist nicht garantiert/u);
  assert.ok(entry.private_bytes.every(byte => byte === 0));
});

testAsync('empty OCR publishes nothing', async () => {
  const entry = privateEntry('scan.png', 'unchanged source bytes');
  let publications = 0;
  await assert.rejects(anonymizeNext('general', {
    productChannel: 'standalone', inputQueue: [entry], publishPackage() { publications++; },
    async convertBuffer() {
      return createMarkdownExtraction({ source_type: 'png', markdown: '',
        coverage: { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED', 'OCR_TEXT_EMPTY'] } });
    }
  }), { code: 'PARSER_COVERAGE_UNVERIFIED' });
  assert.equal(publications, 0);
  assert.ok(entry.private_bytes.every(byte => byte === 0));
});

testAsync('the Cowork/plugin channel never reaches the wide converter', async () => {
  const entry = privateEntry('customer.pdf');
  let conversions = 0;
  await assert.rejects(anonymizeNext('general', { productChannel: 'plugin', inputQueue: [entry],
    async convertBuffer() { conversions++; throw new Error('must not run'); } }),
  error => ['PDF_COVERAGE_UNVERIFIED', 'FORMAT_COVERAGE_UNVERIFIED'].includes(error.code));
  assert.equal(conversions, 0);
});

testAsync('direct and converted sources share readable person and company identities in one batch registry', async () => {
  const secret = Buffer.alloc(32, 37);
  const registry = createBatchPseudonymRegistry(secret, { contractVersion: READABLE_CONTRACT_VERSION });
  try {
    const direct = await anonymizeNext('personnel_profile', { productChannel: 'standalone', pseudonymRegistry: registry,
      inputQueue: [privateEntry('profile.txt', 'Name: Max Mustermann\nArbeitgeber: Nordstern GmbH')] });
    const converted = await anonymizeNext('personnel_profile', { productChannel: 'standalone', pseudonymRegistry: registry,
      inputQueue: [privateEntry('profile.pdf')], async convertBuffer() {
        return createMarkdownExtraction({ source_type: 'pdf',
          markdown: 'Name: Max Mustermann\nKunde: Nordstern GmbH',
          coverage: { status: 'complete', reason_codes: [] } });
      } });
    const first = readOutput(direct.package_id, direct.read_capability).text;
    const second = readOutput(converted.package_id, converted.read_capability).text;
    for (const output of [first, second]) {
      assert.match(output, /\[PERSON_001\]/u);
      assert.match(output, /\[UNTERNEHMEN_001\]/u);
      assert.doesNotMatch(output, /Max Mustermann|Nordstern GmbH/u);
    }
  } finally {
    registry.dispose();
    secret.fill(0);
  }
});

done(() => {
  fs.rmSync(scope, { recursive: true, force: true });
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
