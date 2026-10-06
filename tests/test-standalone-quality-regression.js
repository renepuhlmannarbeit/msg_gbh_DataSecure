'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSuite } = require('./helpers');
const temporaryRoot = fs.realpathSync.native(os.tmpdir());
const scope = fs.mkdtempSync(path.join(temporaryRoot, 'datasecure-quality-regression-'));
process.env.EU_PRIVACY_ROOT = path.join(scope, 'private');
process.env.EU_PRIVACY_DATA_ROOT = path.join(scope, 'data');
process.env.EU_PRIVACY_RESULT_ROOT = path.join(scope, 'results');
fs.mkdirSync(process.env.EU_PRIVACY_RESULT_ROOT);
const { anonymizeSelectedSource } = require('../plugins/data-secure/server/gateway/orchestrator');
const { readOutput } = require('../plugins/data-secure/server/gateway/package-store');
const { reviewedBatchText } = require('../plugins/data-secure/server/gateway/batch-review-policy');
const { createBatchPseudonymState } = require('../plugins/data-secure/server/batch-pseudonym-context');
const { prepareStandaloneReviewChoices, mergeStandaloneReviewChoices, rememberStandaloneReviewChoices } =
  require('../plugins/data-secure/server/gateway/standalone-review-choices');
const { createBatchPseudonymRegistry, READABLE_CONTRACT_VERSION } = require('../plugins/data-secure/server/batch-pseudonym-registry');
const { personProseCandidateSpans } = require('../plugins/data-secure/server/privacy/person-ambiguities');
const { test, testAsync, done, assert } = createSuite('Standalone independent quality counterexamples');
const secret = Buffer.alloc(32, 29);
const canonical = value => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-DE');
let sequence = 0;
function runState() {
  return { token: 'd'.repeat(64), product_channel: 'standalone',
    ...createBatchPseudonymState({ productChannel: 'standalone', randomBytes: () => Buffer.from(secret) }) };
}
function registry(persistedState) {
  return createBatchPseudonymRegistry(secret, { contractVersion: READABLE_CONTRACT_VERSION, persistedState });
}
async function publish(source, context, choose, extension = 'txt') {
  const file = path.join(scope, `source-${++sequence}.${extension}`);
  fs.writeFileSync(file, source);
  let draft, decisions;
  const asked = [];
  const result = await anonymizeSelectedSource(file, 'personnel_profile', {
    productChannel: 'standalone', pseudonymRegistry: context.registry, reviewText(input) {
      draft = input;
      const plan = prepareStandaloneReviewChoices(context.state, [input]);
      const open = plan.openDrafts.map(value => ({ document_index: 1, decisions: value.ambiguities.map(candidate => {
        const literal = input.original_text.slice(candidate.original_start, candidate.original_end);
        asked.push(literal);
        assert.equal(input.anonymized_text.slice(candidate.anonymized_start, candidate.anonymized_end), literal);
        return { ambiguity_id: candidate.ambiguity_id, decision: choose(literal) };
      }) }));
      decisions = mergeStandaloneReviewChoices(plan, { action: 'reviewed', documents: open }).documents;
      return reviewedBatchText(input, decisions[0].decisions);
    }
  });
  if (draft) rememberStandaloneReviewChoices(context.state, [draft], decisions);
  assert.equal(fs.readFileSync(file, 'utf8'), source);
  return { text: readOutput(result.package_id, result.read_capability, 0, 30000).text, asked };
}
function technicalChoice(value) {
  assert.ok(['service level', 'fail closed', 'synthetischer härtetest'].includes(canonical(value)), value);
  return 'keep';
}

test('reservations are disjoint, source-bound and do not invent lower-case table identities', () => {
  const source = 'SYNTHETISCHER HÄRTETEST\nName: Anna Linden\nService Level\nFail Closed\nSynthetischer Härtetest\n' +
    '| Thema |\n| --- |\n| raw-secret [EMAIL_REDACTED] |\n| WIESENLABOR CONSULT |';
  const candidates = personProseCandidateSpans(source, { productChannel: 'standalone', profile: 'personnel_profile' })
    .sort((a, b) => a.start - b.start);
  assert.deepEqual(candidates.map(candidate => candidate.value),
    ['SYNTHETISCHER HÄRTETEST', 'Service Level', 'Fail Closed', 'Synthetischer Härtetest', 'WIESENLABOR CONSULT']);
  for (const [index, candidate] of candidates.entries()) {
    assert.equal(source.slice(candidate.start, candidate.end), candidate.value);
    if (index) assert.ok(candidates[index - 1].end <= candidate.start);
  }
  assert.deepEqual(personProseCandidateSpans(source, { productChannel: 'plugin' }), [], 'Cowork does not inherit the expanded Standalone hypotheses');
});

async function main() {
  await testAsync('crossing name hypotheses form one disjoint exact review area instead of destroying internal markers', async () => {
    const context = { registry: registry(), state: runState() };
    try {
      const source = 'Name: Mara Beispiel\nAnna Beta\nBeta Gamma\nanna beta gamma';
      const result = await publish(source, context, value => {
        assert.ok(['Anna Beta', 'Beta Gamma', 'anna beta gamma'].includes(value)); return 'redact';
      });
      assert.deepEqual(result.asked, ['Anna Beta', 'Beta Gamma', 'anna beta gamma']);
      assert.doesNotMatch(result.text, /anna|beta|gamma|Mara Beispiel/iu);
      const adjacent = personProseCandidateSpans('| Anna Beta | Beta Gamma |', { productChannel: 'standalone' });
      assert.equal(adjacent.length, 2, 'adjacent cells do not become one invented identity');
    } finally { context.registry.dispose(); }
  });
  await testAsync('credential values and operational headers are never reserved as reviewable identity prose', async () => {
    const context = { registry: registry(), state: runState() };
    try {
      for (const source of ['| Hinweis | Passwort |\n| --- | --- |\n| Test | Harbor Cedar |',
        '| API Key |\n| --- |\n| Harbor Cedar |', 'Passwort: Harbor Cedar']) {
        const result = await publish(source, context, value => { throw new Error(`CREDENTIAL_RESERVED: ${value}`); }, 'md');
        assert.ok(result.text.includes('[CREDENTIAL_REDACTED]'));
        assert.doesNotMatch(result.text, /Harbor Cedar/u);
      }
    } finally { context.registry.dispose(); }
  });
  await testAsync('legal-company evidence is coordinate-bound across tabs and multiple spaces', async () => {
    const context = { registry: registry(), state: runState() };
    try {
      for (const space of ['    ', '\t']) {
        const result = await publish(`Name: Mara Beispiel\nService Level\nFirma: Service${space}Level GmbH`, context, technicalChoice);
        assert.doesNotMatch(result.text, /Service\s+Level(?:\s+GmbH)?/u);
        assert.ok(result.text.includes('[UNTERNEHMEN_'));
      }
    } finally { context.registry.dispose(); }
  });
  for (const order of [['A', 'B', 'A'], ['B', 'A', 'B']]) await testAsync(`${order.join(' → ')} never learns approved technical headings as PERSON aliases`, async () => {
    const context = { registry: registry(), state: runState() };
    try {
      const sources = {
        A: 'SYNTHETISCHER HÄRTETEST\nName: Anna Linden\nService Level\nFail Closed\nSynthetischer Härtetest',
        B: 'Name: Boris Quastenbach\nService Level\nFail Closed\nSynthetischer Härtetest'
      };
      for (const [index, variant] of order.entries()) {
        const result = await publish(sources[variant], context, technicalChoice);
        assert.equal(result.asked.length, index ? 0 : variant === 'A' ? 4 : 3, 'later phases reuse exact run-bound choices');
        assert.ok(result.text.includes('Service Level\nFail Closed\nSynthetischer Härtetest'));
        assert.doesNotMatch(result.text, /Anna Linden|Boris Quastenbach/u);
        for (const value of ['Service Level', 'Level', 'Fail Closed', 'Closed', 'Synthetischer Härtetest', 'Härtetest']) {
          assert.equal(context.registry.lookup('PERSON', value), null, `no poisoned identity: ${value}`);
        }
        const persistedState = context.registry.exportState(); context.registry.dispose();
        context.registry = registry(JSON.parse(JSON.stringify(persistedState)));
        context.state = JSON.parse(JSON.stringify(context.state));
      }
    } finally { context.registry.dispose(); }
  });
  await testAsync('native CSV headers and single-column rows require a typed company choice, reused on replay', async () => {
    const context = { registry: registry(), state: runState() };
    try {
      for (const [index, source] of ['"WIESENLABOR CONSULT"\n"Name: Anna Linden"',
        '| Spalte 1 |\n| --- |\n| WIESENLABOR CONSULT |\n| Name: Anna Linden |'].entries()) {
        const result = await publish(source, context, value => {
          assert.equal(value, 'WIESENLABOR CONSULT'); return 'redact_organization';
        }, index ? 'md' : 'csv');
        assert.deepEqual(result.asked, index ? [] : ['WIESENLABOR CONSULT']);
        assert.ok(result.text.includes('[UNTERNEHMEN_001]'));
        assert.doesNotMatch(result.text, /WIESENLABOR|Anna Linden/u);
      }
    } finally { context.registry.dispose(); }
  });
  await testAsync('approved technical spelling never exempts an explicit person label or honorific', async () => {
    const context = { registry: registry(), state: runState() };
    try {
      await publish('Name: Anna Linden\nService Level\nFail Closed', context, technicalChoice);
      const result = await publish('Name: Service Level\nHerr Fail Closed\nFirma: Lindenwerk GmbH', context,
        value => { throw new Error(`EXPLICIT_NAME_BECAME_OPTIONAL: ${value}`); });
      assert.doesNotMatch(result.text, /Service Level|Fail Closed|Lindenwerk/u);
      assert.ok(result.text.includes('[PERSON_'));
      assert.ok(result.text.includes('[UNTERNEHMEN_'));
    } finally { context.registry.dispose(); }
  });
  await testAsync('neutral unlabelled people are not silently kept; confirmed PERSON choices persist across formats', async () => {
    const context = { registry: registry(), state: runState() };
    try {
      const first = await publish('Name: Boris Quastenbach\n| Spalte 1 |\n| --- |\n| Zora Eibenhang |', context,
        value => { assert.equal(value, 'Zora Eibenhang'); return 'redact'; }, 'md');
      const second = await publish('Zora Eibenhang\nName: Boris Quastenbach', context,
        value => { throw new Error(`REPEATED_NAME: ${value}`); });
      assert.deepEqual(first.asked, ['Zora Eibenhang']);
      assert.deepEqual(second.asked, []);
      const marker = context.registry.lookup('PERSON', 'Zora Eibenhang');
      assert.ok(first.text.includes(marker) && second.text.includes(marker));
      assert.doesNotMatch(first.text + second.text, /Zora Eibenhang/u);
    } finally { context.registry.dispose(); }
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await done(); secret.fill(0);
  if (path.dirname(scope) !== temporaryRoot || !path.basename(scope).startsWith('datasecure-quality-regression-') ||
      fs.lstatSync(scope).isSymbolicLink()) throw new Error('UNSAFE_TEST_SCOPE');
  fs.rmSync(scope, { recursive: true, force: true });
});
