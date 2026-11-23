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

async function release(text, registry = makeRegistry(), profile = 'general') {
  const operation = prepareTextPrivacyReview({ text, profile, productChannel: 'standalone',
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

  await testAsync('an enumeration of full names is never read as an inverted name', async () => {
    // Regression of the first inverted-name rule: "Müller, Hans" was matched
    // across the comma of a list and the given name in front stayed behind.
    assert.equal(await known('Unterschriften: Marlene Österreicher, Marlene Österreicher'), 'Unterschriften: [PERSON_001], [PERSON_001]');
    assert.equal(await known('Dr. Österreicher, Marlene Österreicher und andere.'), 'Dr. [PERSON_001], [PERSON_001] und andere.');
    const two = 'Name: Hans Müller\nVertreterin: Anna Müller\n\n';
    assert.equal(body(await release(`${two}Anwesend: Anna Müller, Hans Müller. Entschuldigt: Hans Müller, Anna Müller.`)),
      'Anwesend: [PERSON_002], [PERSON_001]. Entschuldigt: [PERSON_001], [PERSON_002].');
    // The inverted form next to the list still counts.
    assert.equal(body(await release(`${two}Müller, Hans; Müller, Anna`)), '[PERSON_001]; [PERSON_002]');
  });

  await testAsync('abbreviated salutations are consumed only in front of the known person', async () => {
    assert.equal(await known('Hr. Österreicher und Fr. Österreicher kamen.'), '[PERSON_001] und [PERSON_001] kamen.');
    assert.equal(await known('Mo.-Fr. Sprechzeiten bleiben.'), 'Mo.-Fr. Sprechzeiten bleiben.');
    // After a weekday range "Fr." is the Friday.
    assert.equal(await known('Mo. bis Fr. Österreicher erreichbar.'), 'Mo. bis Fr. [PERSON_001] erreichbar.');
  });

  await testAsync('profiles that replace every link replace it as a whole when it spells the name', async () => {
    // A name literal inside the link used to win over the link; the rest of
    // the link stayed behind and stopped the document as residual data.
    for (const profile of ['personnel_profile', 'applicant', 'customer']) {
      assert.equal(body(await release('Name: Laura Stein\n\nProfil: https://example.org/in/laura-stein und https://example.org/laura_stein.pdf sowie https://example.org/stein',
        undefined, profile)), 'Profil: [URL_REDACTED] und [URL_REDACTED] sowie [URL_REDACTED]', profile);
      // The link yields to nothing but name literals inside it: an e-mail
      // address whose domain spells the name stays one e-mail address, and a
      // name that reaches beyond the end of a link still stops the document.
      assert.equal(body(await release('Name: Laura Stein\n\nAn l.meier@stein-beratung.example und x.y@laura-stein.example bitte.', undefined, profile)),
        'An [EMAIL_REDACTED] und [EMAIL_REDACTED] bitte.', profile);
      await assert.rejects(release('Name: Wei Li\n\nSiehe www.example.org/team/Wei Li.pdf bitte.', undefined, profile),
        { code: 'RESIDUAL_PII' }, profile);
    }
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
    // Counter-review: a detector matching a part of the link (telephone,
    // IBAN, e-mail) must not displace the whole-link replacement. Otherwise
    // the name stays in the target and the residual gate stops the document.
    for (const tail of ['?tel=+49301234567', '?iban=DE89370400440532013000', ',jan.mustermann@example.org']) {
      assert.equal(await known(`Siehe https://example.org/in/marlene-oesterreicher${tail} ende`), 'Siehe [URL_REDACTED] ende', tail);
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
