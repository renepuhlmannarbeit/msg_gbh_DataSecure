'use strict';

// Synthetic text only. The real parser, privacy gates, staged publication and
// verified package reader run beneath a fresh isolated root. No native UI,
// keyring, encryption provider, network or user documents are used.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createSuite } = require('./helpers');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-rc80-semantics-'));
process.env.EU_PRIVACY_ROOT = path.join(root, 'privacy');
process.env.LOCALAPPDATA = path.join(root, 'localapp');
process.env.XDG_DATA_HOME = path.join(root, 'xdg');
const pii = require('../plugins/data-secure/server/pii-engine');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const { credentialIssuerAmbiguities } = require('../plugins/data-secure/server/privacy/credentials');
const { anonymizeSelectedSource } = require('../plugins/data-secure/server/gateway/orchestrator');
const gateway = require('../plugins/data-secure/server/gateway');
const { test, testAsync, assert, done } = createSuite('RC80 positional semantics and publication');

const holderVariants = [
  'Zertifikat für Erika Beispielfrau ausgestellt durch Scrum.org.',
  'Zertifikat für Erika Beispielfrau, ausgestellt durch Scrum.org.',
  'Zertifikat für Erika Beispielfrau\nausgestellt durch Scrum.org.',
  'Zertifikat für Erika\nBeispielfrau ausgestellt durch Scrum.org.',
  'Zertifikat für Erika Beispielfrau verliehen am 01.06.2025, ausgestellt durch Scrum.org.',
  'Certificate for Erika Beispielfrau issued by Scrum.org.',
  'Credential for Erika Beispielfrau awarded by Example Board e.V.'
];
const ambiguousVariants = [
  'Bei Nordlicht Beispiel GmbH absolvierte ich die Weiterbildung zum ISTQB Certified Tester.',
  'Quantum Validation Expert bei Nordlicht Beispiel GmbH',
  'ISTQB Certified Tester bei Nordlicht Beispiel GmbH',
  'Zertifikat: Quantum Validation Expert, Nordlicht Beispiel GmbH'
];
const healthList = '# Kenntnisse\nFHIR R4\nHL7 V2\nSNOMED CT\nLOINC\nDICOM\nXQPROTO R9';
const productRoles = 'Arbeitgeber: Microsoft\nErfahrung mit Microsoft Azure und Microsoft Teams.';
const certificateRoles = 'Arbeitgeber: Microsoft\nMicrosoft Certified: Azure Administrator Associate';

function verify(text) {
  const result = anonymizeMarkdown(text, 'personnel_profile');
  assert.deepStrictEqual(pii.scanResidual(result.text, 'personnel_profile', result.dictionary), []);
  return result;
}

test('R80-01 explicit holders before follow-up clauses and line breaks are removed', () => {
  for (const value of holderVariants) {
    const source = `Zertifizierungen\n${value}`;
    const result = verify(source);
    assert.ok(!/Erika|Beispielfrau/u.test(result.text), result.text);
    assert.ok(result.text.includes('[PERSON_001]'));
    assert.ok(result.text.includes(value.includes('Scrum.org') ? 'Scrum.org' : 'Example Board e.V.'));
    assert.deepStrictEqual(credentialIssuerAmbiguities(source, result.text), []);
    assert.ok(pii.scanResidual(source, 'personnel_profile').some((item) => item.type === 'PERSON_CANDIDATE'));
  }
});

test('R80-02 unknown organisations need an occurrence-bound local decision in all credential contexts', () => {
  for (const heading of ['', 'Zertifizierungen\n']) {
    for (const value of ambiguousVariants) {
      const source = heading + value;
      const result = verify(source);
      const ambiguities = credentialIssuerAmbiguities(source, result.text);
      assert.strictEqual(ambiguities.length, 1, source);
      const item = ambiguities[0];
      assert.strictEqual(source.slice(item.original_start, item.original_end), 'Nordlicht Beispiel GmbH');
      assert.strictEqual(result.text.slice(item.anonymized_start, item.anonymized_end), 'Nordlicht Beispiel GmbH');
      assert.ok(!JSON.stringify(ambiguities).includes('Nordlicht'));
    }
  }
});

test('R80-02 role labels remain private and a distinct genuine issuer is preserved', () => {
  const source = 'Zertifizierungen\nArbeitgeber: Nordlicht Beispiel GmbH\n' +
    'Quantum Validation Expert bei Nordlicht Beispiel GmbH, ausgestellt durch Scrum.org.';
  const result = verify(source);
  assert.ok(result.text.includes('Arbeitgeber: [ARBEITGEBER_001]'));
  const ambiguities = credentialIssuerAmbiguities(source, result.text);
  assert.strictEqual(ambiguities.length, 1);
  assert.ok(result.text.includes('Scrum.org'));
});

test('R80-02 table cells preserve separate employer and unresolved training-party roles', () => {
  const source = '| Arbeitgeber | Zertifizierungen |\n| --- | --- |\n' +
    '| Nordlicht Beispiel GmbH | Quantum Validation Expert bei Nordlicht Beispiel GmbH |';
  const result = verify(source);
  assert.ok(result.text.includes('| [ARBEITGEBER_001] | Quantum Validation Expert bei Nordlicht Beispiel GmbH |'));
  const ambiguities = credentialIssuerAmbiguities(source, result.text);
  assert.strictEqual(ambiguities.length, 1);
  assert.strictEqual(result.text.slice(ambiguities[0].anonymized_start, ambiguities[0].anonymized_end), 'Nordlicht Beispiel GmbH');
});

test('R80-02 repeated names map to the ambiguous occurrence after wrapped-holder redaction', () => {
  const source = 'Zertifizierungen\nZertifikat für Erika\nBeispielfrau ausgestellt durch Scrum.org.\n' +
    'Nordlicht Beispiel GmbH Certified Tester, Weiterbildung bei Nordlicht Beispiel GmbH';
  const result = verify(source);
  const ambiguities = credentialIssuerAmbiguities(source, result.text);
  assert.strictEqual(ambiguities.length, 1);
  assert.strictEqual(ambiguities[0].original_start, source.lastIndexOf('Nordlicht Beispiel GmbH'));
  assert.strictEqual(ambiguities[0].anonymized_start, result.text.lastIndexOf('Nordlicht Beispiel GmbH'));
});

test('R80-03 employer and credential roles converge in the same document', () => {
  const result = verify(certificateRoles);
  assert.strictEqual(result.passes, 1);
  assert.strictEqual(result.text, 'Arbeitgeber: [ARBEITGEBER_001]\nMicrosoft Certified: Azure Administrator Associate');
  assert.deepStrictEqual(credentialIssuerAmbiguities(certificateRoles, result.text), []);
  const failed = pii.scanResidual(result.text + '\nMicrosoft', 'personnel_profile', result.dictionary);
  assert.ok(failed.some((item) => item.type === 'RESIDUAL_ENTITY'));
});

test('R80-03 typed person literals cannot borrow vendor or credential exemptions', () => {
  const residual = pii.scanResidual('Microsoft Certified: Azure Administrator Associate', 'personnel_profile', [
    { type: 'PERSON', value: 'Microsoft' }
  ]);
  assert.ok(residual.some((item) => item.type === 'RESIDUAL_ENTITY'));
});

test('R80-04 health standards and unlisted compact technical codes are not customers', () => {
  for (const source of [healthList, healthList.replace('# Kenntnisse\n', ''), healthList.replace('# Kenntnisse', 'Technologien')]) {
    assert.strictEqual(verify(source).text, source);
    assert.deepStrictEqual(credentialIssuerAmbiguities(source, source), []);
  }
  const prose = 'Ich implementiere SNOMED CT, HL7 FHIR und DICOM in der elektronischen Patientenakte.';
  assert.strictEqual(verify(prose).text, prose);
  assert.deepStrictEqual(credentialIssuerAmbiguities(prose, prose), []);
  assert.ok(!verify('# Projekterfahrung\nXQPROTO\nProjektaufgaben').text.includes('\nXQPROTO\n'));
  assert.ok(!verify('Kunde: XQPROTO').text.includes('XQPROTO'));
});

test('R80-05 product spans survive vendor aliases without exempting private vendor occurrences', () => {
  const result = verify(productRoles + '\nKontakt beim Arbeitgeber: Microsoft');
  assert.ok(result.text.includes('Erfahrung mit Microsoft Azure und Microsoft Teams.'));
  assert.ok(result.text.includes('Arbeitgeber: [ARBEITGEBER_001]'));
  assert.ok(!result.text.includes('Arbeitgeber: Microsoft'));
  assert.ok(pii.scanResidual('Microsoft Azure', 'personnel_profile', [{ type: 'PERSON_ALIAS', value: 'Microsoft' }]).length);
  assert.ok(pii.scanResidual('Microsoft', 'personnel_profile', result.dictionary).length);
});

let sourceIndex = 0;
async function publish(text, deps = {}) {
  const source = path.join(root, `synthetic-${++sourceIndex}.txt`);
  fs.writeFileSync(source, text, 'utf8');
  const before = fs.readFileSync(source);
  try {
    const result = await anonymizeSelectedSource(source, 'personnel_profile', deps);
    const directory = path.join(process.env.EU_PRIVACY_ROOT, 'Output', result.package_id);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    const markdown = fs.readFileSync(path.join(directory, manifest.document), 'utf8');
    assert.strictEqual(manifest.document_sha256, crypto.createHash('sha256').update(markdown).digest('hex'));
    assert.strictEqual(manifest.verification.residual_gate_checked_dictionary_literals, true);
    const read = gateway.readOutput(result.package_id, result.read_capability);
    assert.ok(JSON.stringify(read).includes('Unterstützte Restprüfung: keine weiteren Treffer'));
    return markdown;
  } finally {
    assert.deepStrictEqual(fs.readFileSync(source), before, 'synthetic original must remain byte-for-byte unchanged');
  }
}

function removeSyntheticRoot() {
  const resolved = fs.realpathSync(root);
  const parent = fs.realpathSync(os.tmpdir());
  assert.strictEqual(path.dirname(resolved), parent);
  assert.ok(path.basename(resolved).startsWith('datasecure-rc80-semantics-'));
  const pending = [resolved];
  while (pending.length) {
    const target = pending.pop();
    const stat = fs.lstatSync(target);
    assert.ok(!stat.isSymbolicLink(), 'refuse symlink/junction cleanup');
    assert.ok(target === resolved || target.startsWith(resolved + path.sep));
    if (stat.isDirectory()) pending.push(...fs.readdirSync(target).map((name) => path.join(target, name)));
    else assert.ok(stat.isFile());
  }
  fs.rmSync(resolved, { recursive: true });
}

async function main() {
  await testAsync('R80-01 real gateway publication removes each holder and keeps the issuer', async () => {
    for (const value of holderVariants) {
      const markdown = await publish(`Zertifizierungen\n${value}`);
      assert.ok(!/Erika|Beispielfrau/u.test(markdown));
      assert.ok(markdown.includes(value.includes('Scrum.org') ? 'Scrum.org' : 'Example Board e.V.'));
    }
  });
  await testAsync('R80-02 unresolved parties block publication with no local decision', async () => {
    for (const source of ambiguousVariants) {
      const output = path.join(process.env.EU_PRIVACY_ROOT, 'Output');
      const before = fs.readdirSync(output).sort();
      await assert.rejects(() => publish(source), (error) => error.code === 'AMBIGUITY_REVIEW_REQUIRED');
      assert.deepStrictEqual(fs.readdirSync(output).sort(), before, 'no unresolved release package');
    }
  });
  await testAsync('R80-02 local redaction or preservation decisions pass the real final publication gate', async () => {
    for (const preserve of [false, true]) {
      const markdown = await publish('Zertifizierungen\n' + ambiguousVariants[1], {
        reviewText: async (draft) => {
          assert.strictEqual(draft.ambiguities.length, 1);
          const item = draft.ambiguities[0];
          return { text: preserve ? draft.anonymized_text :
            draft.anonymized_text.slice(0, item.anonymized_start) + '[KUNDE_001]' + draft.anonymized_text.slice(item.anonymized_end) };
        }
      });
      assert.strictEqual(markdown.includes('Nordlicht Beispiel GmbH'), preserve);
      assert.ok(markdown.includes('Quantum Validation Expert'));
    }
  });
  await testAsync('R80-03/04/05 combined publication retains professional content and redacts the employer', async () => {
    const source = certificateRoles + '\n' + healthList + '\nErfahrung mit Microsoft Azure und Microsoft Teams.';
    const markdown = await publish(source);
    assert.ok(markdown.includes('Arbeitgeber: [ARBEITGEBER_001]'));
    assert.ok(markdown.includes('Microsoft Certified: Azure Administrator Associate'));
    assert.ok(markdown.includes(healthList));
    assert.ok(markdown.includes('Erfahrung mit Microsoft Azure und Microsoft Teams.'));
  });
}

main().finally(removeSyntheticRoot).then(done).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
