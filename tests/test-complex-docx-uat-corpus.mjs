import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { generate } from '../scripts/generate-complex-docx-uat.mjs';

const require = createRequire(import.meta.url);
const { planBatchAdmission } = require('../plugins/data-secure/server/gateway/batch-source-admission');
const { parseDocumentBuffer } = require('../plugins/data-secure/server/document-parser');
const { anonymizeMarkdown } = require('../plugins/data-secure/server/gateway/compliance');
const {
  createBatchPseudonymRegistry,
  SECRET_BYTES
} = require('../plugins/data-secure/server/batch-pseudonym-registry');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kit = path.join(repo, 'docs', 'acceptance', 'STANDALONE_COMPLEX_DOCX_TEST_KIT');
const inputs = path.join(kit, '.tmp-complex-docx-contract-a');
const repeatedInputs = path.join(kit, '.tmp-complex-docx-contract-b');

const expectations = Object.freeze([
  ['01-kundenprofil-kurz.docx', 'Product Owner', 'Laura Stein'],
  ['02-projektstatus-kurz.docx', 'Sprint Review', 'Laura Stein'],
  ['03-technische-notiz-kurz.docx', 'Kubernetes', null],
  ['04-betriebskonzept-kurz.docx', 'Offline-Betrieb', null],
  ['05-label-metadaten-kurz.docx', 'Klassifizierungsmetadaten', 'Laura Stein'],
  ['06-rahmenvertrag-mittel.docx', 'Leistungsbeschreibung', 'Murat Kaya'],
  ['07-bewerbungsprofil-mittel.docx', 'FHIR', 'Sofia Lindner'],
  ['08-prozesshandbuch-mittel.docx', 'Vier-Augen-Prinzip', null],
  ['09-architekturentscheidung-mittel.docx', 'Separation of Concerns', null],
  ['10-kundenkorrespondenz-mittel.docx', 'Liefergegenstand', 'Laura Stein'],
  ['11-fallakte-lang.docx', 'Entscheidungsprotokoll', 'Laura Stein'],
  ['12-auditbericht-lang.docx', 'Wirksamkeitspruefung', 'Omar Yilmaz'],
  ['13-qualitaetsbericht-lang.docx', 'Grenzwertanalyse', null],
  ['14-systemhandbuch-lang.docx', 'Pruefsumme', null],
  ['15-projektchronik-lang.docx', 'Produktivsetzung', 'Laura Stein']
]);

try {
  generate(inputs);
  generate(repeatedInputs);
} catch (error) {
  throw new Error(`Complex DOCX fixtures could not be generated. Run "npm run uat:complex-docx" for the human UAT kit. Cause: ${error.message}`);
}

const actual = fs.readdirSync(inputs).filter((name) => name.endsWith('.docx')).sort();
assert.deepEqual(actual, expectations.map(([name]) => name));
assert.deepEqual(fs.readdirSync(repeatedInputs).sort(), actual);
for (const name of actual) {
  assert.deepEqual(fs.readFileSync(path.join(inputs, name)), fs.readFileSync(path.join(repeatedInputs, name)),
    `${name} must be byte-reproducible`);
}

const queue = actual.map((name) => {
  const full = path.join(inputs, name);
  return { name, full, stat: fs.statSync(full), sourceBytes: fs.statSync(full).size };
});
const admission = planBatchAdmission(queue, {
  processingMode: 'markdown-only',
  productChannel: 'standalone'
});
assert.equal(admission.length, expectations.length);
assert.ok(admission.every((item) => item.admission === 'candidate'),
  JSON.stringify(admission.filter((item) => item.admission !== 'candidate')));

const registry = createBatchPseudonymRegistry(crypto.createHash('sha256').update('synthetic-complex-docx-uat').digest().subarray(0, SECRET_BYTES));
const sharedPeople = new Set();
const sharedOrganizations = new Set();
for (const [name, preserve, identity] of expectations) {
  const parsed = parseDocumentBuffer(fs.readFileSync(path.join(inputs, name)), '.docx');
  assert.ok(parsed.markdown.length > 2_000, `${name} should be a substantial document`);
  assert.match(parsed.markdown, /TESTDATEN – VOLLSTAENDIG FIKTIV/u, name);
  assert.ok(parsed.markdown.includes(preserve), `${name} lost preservation anchor ${preserve}`);
  const anonymized = anonymizeMarkdown(parsed.markdown, 'general', { registry });
  assert.ok(anonymized.text.includes(preserve), `${name} anonymized preservation anchor ${preserve}`);
  if (identity) {
    assert.ok(parsed.markdown.includes(identity), `${name} lost synthetic identity ${identity}`);
    assert.ok(!anonymized.text.includes(identity), `${name} retained synthetic identity ${identity}`);
    if (identity === 'Laura Stein') {
      const person = anonymized.text.match(/\| Name \| (\[PERSON_[A-Z2-7]+\]) \|/u)?.[1];
      const organization = anonymized.text.match(/\| Unternehmen \| (\[ORGANISATION_[A-Z2-7]+\]) \|/u)?.[1];
      assert.ok(person && organization, `${name} lacks typed batch pseudonyms`);
      sharedPeople.add(person);
      sharedOrganizations.add(organization);
    }
  } else {
    assert.doesNotMatch(parsed.markdown, /@beispiel|\+49|\bDE\d{2}\s/u, `${name} is a neutral control`);
    assert.equal(anonymized.text, parsed.markdown, `${name} changed neutral content`);
  }
}
registry.dispose();
assert.equal(sharedPeople.size, 1, 'Laura Stein must keep one batch-wide person pseudonym');
assert.equal(sharedOrganizations.size, 1, 'Nordlicht Digital GmbH must keep one batch-wide organization pseudonym');

fs.rmSync(inputs, { recursive: true, force: true });
fs.rmSync(repeatedInputs, { recursive: true, force: true });
process.stdout.write(`complex DOCX UAT corpus: ${expectations.length} generated files passed\n`);
