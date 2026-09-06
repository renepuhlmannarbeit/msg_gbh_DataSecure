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
const { anonymizeNext } = require('../plugins/data-secure/server/gateway/orchestrator');
const { readOutput } = require('../plugins/data-secure/server/gateway/package-store');
const { createBatchPseudonymRegistry, READABLE_CONTRACT_VERSION } = require('../plugins/data-secure/server/batch-pseudonym-registry');
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
  assert.equal(result.raw_content_sent_to_claude, false);
  assert.ok(entry.private_bytes.every(byte => byte === 0));
  const released = readOutput(result.package_id, result.read_capability);
  assert.equal(released.ok, true);
  assert.doesNotMatch(released.text, /max\.mustermann|12345678|DE89370400440532013000/iu);
  assert.match(released.text, /\[EMAIL_REDACTED\]|\[PHONE_REDACTED\]|\[BANK_DATA_REDACTED\]/u);
  const rawRoot = path.join(process.env.EU_PRIVACY_DATA_ROOT, 'markdown-artifacts');
  assert.equal(fs.existsSync(rawRoot) ? fs.readdirSync(rawRoot).length : 0, 0);
});

testAsync('incomplete wide extraction publishes nothing and keeps the original source outside the result tree', async () => {
  const entry = privateEntry('scan.png', 'unchanged source bytes');
  let conversions = 0;
  let publications = 0;
  await assert.rejects(anonymizeNext('general', {
    productChannel: 'standalone', inputQueue: [entry],
    publishPackage() { publications++; },
    async convertBuffer() {
      conversions++;
      return createMarkdownExtraction({ source_type: 'png', markdown: 'Max Mustermann',
        coverage: { status: 'incomplete', reason_codes: ['OCR_NOT_VERIFIED'] } });
    }
  }), { code: 'PARSER_COVERAGE_UNVERIFIED' });
  assert.equal(conversions, 1);
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
