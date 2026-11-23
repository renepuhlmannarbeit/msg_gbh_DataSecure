'use strict';

// RC178 review R-017. Spellings of an already known person that used
// to survive the release: inverted "Surname, Given", file-name slugs, the
// abbreviations "Hr."/"Fr.", a name inside a link target, and, across the
// documents of one run, the genitive of a remembered surname. Each case runs
// through the actual shared text privacy operation with the automatic policy.
// The counter-cases keep ordinary words and unrelated links.
const { createSuite } = require('./helpers');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } =
  require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { makeRegistry } = require('../plugins/data-secure/server/privacy/entities');
const { createBatchPseudonymState, withBatchPseudonymRegistry } = require('../plugins/data-secure/server/batch-pseudonym-context');
const pii = require('../plugins/data-secure/server/pii-engine');
const { testAsync, test, assert, done } = createSuite('Known person name variants');
const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: true };

async function release(text, registry = makeRegistry()) {
  const operation = prepareTextPrivacyReview({ text, profile: 'general', productChannel: 'standalone',
    consumerOptions: { productChannel: 'standalone', contentOptions }, registry, captureTrace: false });
  const resolved = await resolveTextPrivacyReview(operation, undefined, { reviewPolicy: 'automatic-conservative' });
  return finalizeTextPrivacyReview(operation, resolved, { prefix: '', suffix: '' }).markdown;
}
const body = (markdown) => markdown.split('\n\n').slice(1).join('\n\n');
const known = (sentence) => release(`Name: Marlene Österreicher\n\n${sentence}`).then(body);

async function main() {
  await testAsync('inverted names and file-name slugs of a known person are replaced as a whole', async () => {
    assert.equal(await known('Österreicher, Marlene ist zuständig.'), '[PERSON_001] ist zuständig.');
    assert.equal(await known('| Name | Rolle |\n|---|---|\n| Österreicher, Marlene | Leitung |'),
      '| Name | Rolle |\n|---|---|\n| [PERSON_001] | Leitung |');
    assert.equal(await known('Datei Marlene_Österreicher_Lebenslauf.pdf liegt vor.'), 'Datei [PERSON_001]_Lebenslauf.pdf liegt vor.');
    assert.equal(await known('Konto marlene.österreicher angelegt.'), 'Konto [PERSON_001] angelegt.');
  });

  await testAsync('abbreviated salutations are consumed only in front of the known person', async () => {
    assert.equal(await known('Hr. Österreicher und Fr. Österreicher kamen.'), '[PERSON_001] und [PERSON_001] kamen.');
    assert.equal(await known('Mo.-Fr. Sprechzeiten bleiben.'), 'Mo.-Fr. Sprechzeiten bleiben.');
  });

  await testAsync('a link target carrying the known name or a hidden e-mail address is replaced', async () => {
    for (const target of [
      'https://example.org/in/marlene-oesterreicher',
      'https://example.org/u/osterreicher.marlene',
      'https://example.org/profil?name=Marlene%20%C3%96sterreicher&x=1',
      'https://example.org/profil?mail=muster%40example.org'
    ]) {
      const markdown = await known(`[Profil](${target})`);
      assert.equal(markdown, '[Profil]([URL_REDACTED])', target);
    }
    const unrelated = 'Siehe https://example.org/produkte/sommer-2024 und https://example.org/team.';
    assert.equal(await known(unrelated), unrelated);
  });

  test('the residual gate reports a known full name inside a link target', () => {
    const dictionary = [{ value: 'Marlene Österreicher', type: 'PERSON' }];
    const leaking = pii.scanResidual('Siehe https://example.org/in/marlene-oesterreicher dort.', 'general', dictionary);
    assert.ok(leaking.some((finding) => finding.type === 'URL'), 'link target with the name must be a residual finding');
    const clean = pii.scanResidual('Siehe https://example.org/team dort.', 'general', dictionary);
    assert.ok(!clean.some((finding) => finding.type === 'URL'));
    const surnameOnly = pii.scanResidual('Siehe https://example.org/oesterreicher dort.', 'general', dictionary);
    assert.ok(!surnameOnly.some((finding) => finding.type === 'URL'), 'a single path word is no identity');
  });

  await testAsync('ordinary comma lists and unknown inversions are never new persons', async () => {
    const lists = 'Berlin, Hamburg und München, Köln sind Städte. Müller, Schmidt und Partner.';
    assert.equal(await known(lists), lists);
  });

  await testAsync('later documents of a run replace explicit forms of a remembered surname only', async () => {
    const state = { token: 'b'.repeat(64), ...createBatchPseudonymState({ productChannel: 'standalone' }) };
    const document = (text) => withBatchPseudonymRegistry(state, (registry) => release(text, registry));
    assert.match(await document('Name: Jörg Wüstenhagen\n\nJörg Wüstenhagen leitet das Projekt.'), /^Name: \[PERSON_001\]/u);
    assert.equal(await document('Hr. Wüstenhagen kam. Dann Wüstenhagens Büro. Später Wüstenhagen, Jörg.'),
      '[PERSON_001] kam. Dann [PERSON_001] Büro. Später [PERSON_001].');
    // A determiner or inflected adjective marks the ordinary word, and the
    // bare nominative remains the documented residual risk of DS-096.
    const state2 = { token: 'c'.repeat(64), ...createBatchPseudonymState({ productChannel: 'standalone' }) };
    const second = (text) => withBatchPseudonymRegistry(state2, (registry) => release(text, registry));
    await second('Name: Anna Sommer\n\nAnna Sommer leitet das Projekt.');
    const seasons = 'Die Hitze des Sommers und die Planung des letzten Sommers. Im Sommer ist Pause.';
    assert.equal(await second(seasons), seasons);
  });

  done();
}

main().catch((error) => { console.error(error); process.exit(1); });
