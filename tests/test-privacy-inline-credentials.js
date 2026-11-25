'use strict';

// RC178 review R-027. A credential was only recognised when its label was the
// first word of the line. "WLAN-Passwort: …", "Admin PIN: …" and "Zugang:
// Benutzer x, Passwort: …" stayed in the released Markdown without a stop.
// The label is now also recognised inside its line, still only with ":" or
// "=" behind it, and there it binds the first token behind it. The token is
// replaced last, after every other rule and with the open person hints back
// in the text; a token that belongs to something still to be decided is left
// to that decision. Everything else on such a line has to behave exactly as
// before: three wider or earlier versions of this rule released names or
// stopped documents that RC178 processed, and the counter-cases below are the
// ones that refuted them. Each case runs through the actual shared text
// privacy operation with the automatic policy, so the residual gate is part
// of it. All values are invented.
const { createSuite } = require('./helpers');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } =
  require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { makeRegistry } = require('../plugins/data-secure/server/privacy/entities');
const { findStructuredSpans, findInlineCredentialSpans } = require('../plugins/data-secure/server/privacy/structured');
const { testAsync, test, assert, done } = createSuite('Credentials behind a label inside the line');
const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: true };
const PROFILES = ['general', 'contract', 'personnel_profile', 'applicant', 'customer'];

async function release(text, profile = 'general') {
  const operation = prepareTextPrivacyReview({ text, profile, productChannel: 'standalone',
    consumerOptions: { productChannel: 'standalone', contentOptions }, registry: makeRegistry(), captureTrace: false });
  const resolved = await resolveTextPrivacyReview(operation, undefined, { reviewPolicy: 'automatic-conservative' });
  return finalizeTextPrivacyReview(operation, resolved, { prefix: '', suffix: '' }).markdown;
}
const note = (body, profile) => release(`Notiz\n\n${body}`, profile).then((markdown) => markdown.split('\n\n').slice(1).join('\n\n'));
const M = '[CREDENTIAL_REDACTED]';

async function main() {
  await testAsync('a label after other words or as the end of a compound binds the token behind it', async () => {
    for (const [source, released] of [
      ['WLAN-Passwort: Sommer2024!', `WLAN-Passwort: ${M}`],
      ['Das WLAN Passwort: Sommer2024!', `Das WLAN Passwort: ${M}`],
      ['- Root-Kennwort = Xy!9zz\n- Admin PIN: 4711\n- Datenbankpasswort: tief!see', `- Root-Kennwort = ${M}\n- Admin PIN: ${M}\n- Datenbankpasswort: ${M}`],
      ['> WLAN-Passwort: Sommer2024!\n> Gast: frei', `> WLAN-Passwort: ${M}\n> Gast: frei`],
      ['Login sepp@firma.example, Passwort: geheim99', `Login [EMAIL_REDACTED], Passwort: ${M}`],
      ['Zugang: Benutzer sepp, Passwort: Sommer2024! und PIN: 4711', `Zugang: Benutzer sepp, Passwort: ${M} und PIN: ${M}`],
      ['Server srv01 (Benutzername: admin / Passwort: Start123!) steht im Keller.', `Server srv01 (Benutzername: ${M} / Passwort: ${M} steht im Keller.`],
      ['IBAN DE89370400440532013000, Online-PIN: 12345, TAN-Liste liegt bei.', `IBAN [BANK_DATA_REDACTED], Online-PIN: ${M} TAN-Liste liegt bei.`],
      ['Admin PIN: 7', `Admin PIN: ${M}`]
    ]) assert.equal(await note(source), released, source);
  });

  await testAsync('a value in quotation marks that close on the same line is taken whole', async () => {
    // The closing mark is a written end of the value. Only the first word
    // went before, and the rest of the secret stayed: "… [X] Garten Regen\"".
    for (const [source, released] of [
      ['WLAN-Passwort: "Tulpe Garten Regen"', `WLAN-Passwort: ${M}`],
      ['Zugang: Benutzer sepp, Passwort: „Tulpe Garten“ und PIN: 4711', `Zugang: Benutzer sepp, Passwort: ${M} und PIN: ${M}`],
      ['Das Kennwort: »blauer Himmel 7« bitte ändern.', `Das Kennwort: ${M} bitte ändern.`],
      ['Der Token: \'Xy9 kalt\' gilt bis 2026.', `Der Token: ${M} gilt bis 2026.`],
      ['Das Passwort: "Tulpe Garten". Danach weiter.', `Das Passwort: ${M}. Danach weiter.`],
      ['(Passwort: "Tulpe Garten")', `(Passwort: ${M})`],
      // Without a closing mark on the line, or with text directly behind the
      // mark, the first token is taken as before.
      ['Das Passwort: "Tulpe Garten ohne Ende', `Das Passwort: ${M} Garten ohne Ende`],
      ['Das Kennwort: "Tulpe"x Garten', `Das Kennwort: ${M} Garten`]
    ]) assert.equal(await note(source), released, source);
    // A person behind the quoted value is still found, in every profile.
    for (const profile of PROFILES) {
      const released = await release('Anna Meier ist hier.\n\nZugang: Benutzer sepp, Passwort: "x1 y2" fuer Dr. Anna Meier und weiter', profile);
      assert.doesNotMatch(released, /Anna|Meier|x1|y2/u, profile);
      assert.match(released, /Passwort: \[CREDENTIAL_REDACTED\] fuer Dr\. \[PERSON_001\] und weiter/u, profile);
    }
    // An open person hint inside the quoted value: the whole value would take
    // the hint in and is not replaced. Its first token still is, as it was
    // before quoted values were read whole. Found by the counter-check: without
    // this fall-back the first word of the secret became visible again.
    for (const profile of PROFILES) {
      for (const [source, secret] of [
        ['Zugang ist Passwort: "geheim7. Anna Sommer sagt hallo"', /geheim7/u],
        ['Zugang ist Passwort: "Hallo9. Anna Sommer sagt Tulpe" und PIN: 4711', /Hallo9|4711/u]
      ]) {
        const released = await note(source, profile);
        assert.doesNotMatch(released, secret, `${profile}: ${source}`);
        assert.doesNotMatch(released, /Anna|Sommer/u, `${profile}: ${source}`);
      }
    }
  });

  await testAsync('the text behind that token is read as before', async () => {
    // Running text keeps its sentence; only the word behind the label goes.
    assert.equal(await note('Der Auftraggeber erhält das Zugangstoken: es bleibt Eigentum des Anbieters. Haftung ausgeschlossen. Die neue PIN: 4711', 'contract'),
      `Der Auftraggeber erhält das Zugangstoken: ${M} bleibt Eigentum des Anbieters. Haftung ausgeschlossen. Die neue PIN: ${M}`);
    // A person introduced behind the value is still found, there and at the
    // other mention. A wider value hid the title cue and released the name.
    for (const profile of PROFILES) {
      const released = await release('Anna Meier ist hier.\n\nZugang: Benutzer sepp, Passwort: x1 fuer Dr. Anna Meier und weiter', profile);
      assert.doesNotMatch(released, /Anna|Meier|x1/u, profile);
      assert.match(released, /Passwort: \[CREDENTIAL_REDACTED\] fuer Dr\. \[PERSON_001\] und weiter/u, profile);
    }
    // An open person hint on the same line is still resolved; a wider value
    // swallowed its reservation and stopped the document.
    assert.equal(await release('Anna Meier ist Kundin. Hans Kurz ist Kunde.\n\nNotiz: WLAN-Passwort: abc1 siehe Frau Dr. Anna Meier; Hans Kurz sagte.\n'),
      `[PERSON_001] ist Kundin. Hans Kurz ist Kunde.\n\nNotiz: WLAN-Passwort: ${M} siehe Dr. [PERSON_001]; [PERSON_002] sagte.\n`);
    // Other identifiers behind the value keep their own replacement.
    assert.equal(await note('Ich bin hier, Passwort: x. DE89370400440532013000 anna.meier@example.org'),
      `Ich bin hier, Passwort: ${M} [BANK_DATA_REDACTED] [EMAIL_REDACTED]`);
  });

  await testAsync('a token that belongs to another finding is left to it', async () => {
    // A known person or another identifier directly behind the label is
    // replaced by its own rule, as before.
    assert.equal(await release('Name: Hans Müller\n\nDas Kennwort: Hans Müller, bitte merken.'), 'Name: [PERSON_001]\n\nDas Kennwort: [PERSON_001], bitte merken.');
    assert.equal(await note('Der Zugang, Passwort: anna.meier@example.org bitte.'), 'Der Zugang, Passwort: [EMAIL_REDACTED] bitte.');
    // A name that is only settled after the engine, through an open person
    // hint, must not be cut in two. An earlier version replaced "Hans" and
    // released "Müller", or stopped the document.
    for (const profile of PROFILES) {
      assert.equal(await note('Mit freundlichen Grüßen\nHans Müller\n\nZugang Passwort: Hans\nMüller', profile),
        'Mit freundlichen Grüßen\n[PERSON_001]\n\nZugang Passwort: [PERSON_001]', profile);
      assert.equal(await note('Hans Müller\nZugang Passwort: Hans Müller', profile), '[PERSON_001]\nZugang Passwort: [PERSON_001]', profile);
    }
    for (const profile of ['personnel_profile', 'applicant']) {
      assert.equal(await note('Zugang Login: [Anna Meier](https://example.org/in/anna-meier)', profile),
        'Zugang Login: [[PERSON_001]]([URL_REDACTED])', profile);
    }
  });

  await testAsync('the replacement is kept only when the open person hints are found as before', async () => {
    // One marker more can make a person hint on a repeated line impossible to
    // locate; the document used to stop with AMBIGUITY_REVIEW_REQUIRED. Such a
    // document now keeps the result it had before this rule: names replaced,
    // the credential as visible as it was.
    const repeated = 'Anna Schmidt, Passwort: abc\nZwischen Herr Weber\nAnna Schmidt, Passwort: x9.';
    for (const profile of ['contract', 'customer']) {
      assert.equal(await note(repeated, profile),
        '[PERSON_002], Passwort: abc\nZwischen [PERSON_001]\n[PERSON_002], Passwort: x9.', profile);
    }
    // Where the hints are found as before, the credential goes.
    assert.equal(await note(repeated), `Anna Schmidt, Passwort: ${M}\nZwischen [PERSON_001]\nAnna Schmidt, Passwort: ${M}`);
  });

  await testAsync('the field at the line start, table cells, headings and replaced values keep their previous result', async () => {
    // The line-start field still takes the rest of its line.
    assert.equal(await note('Passwort: geheim99. Danach bitte abmelden.'), `Passwort: ${M}`);
    assert.equal(await note('Benutzername: admin, Passwort: Start123!'), `Benutzername: ${M}`);
    const table = '| System | Zugang |\n|---|---|\n| WLAN | Passwort: Sommer2024! |';
    assert.equal(await note(table), '| System | Zugang |\n|---|---|\n| WLAN | Passwort: [FIELD_REDACTED] |');
    // A heading is a title, as tests/test-pii-regression.js already requires
    // for the label at the start ("# Token: Aufbau und Validierung").
    const headings = '## Das Token: Aufbau und Validierung\n\nText\n\n# Admin-Passwort: Regeln\n\nWLAN-Passwort\n=============\n\nText';
    assert.equal(await note(headings), headings);
    // A second pass over released text finds nothing new and does not stop,
    // whatever follows the replaced value on its line.
    const replaced = `Hinweis: Ihr Passwort: ${M} und mehr. Danach bitte abmelden. PIN: ${M}\nWLAN-Passwort: ${M}\nAdmin PIN: [MANUAL_REDACTION]`;
    assert.equal(await note(replaced), replaced);
  });

  await testAsync('a label without a field shape, or inside a link, is none', async () => {
    const untouched = 'Siehe https://example.org/login?token=abc123&pin=4711 und https://example.org/Login: dort. ' +
      'Passwortrichtlinie: zwölf Zeichen. Tokens: viele. Spin: nein. Das Passwort ist sicher zu wählen.';
    assert.equal(await note(untouched), untouched);
    // ";Token=", ",PIN=" and "_Token=" inside a link were read as fields by a
    // first version; the rest of the link stayed and stopped the document in
    // the profiles that replace every link.
    const links = 'Siehe https://x.example/a;Token=abc und https://x.example/a,PIN=1234 sowie https://x.example/foo_Token=abc und (https://x.example/a;Token=abc).';
    assert.equal(await note(links), links);
    for (const profile of ['personnel_profile', 'applicant', 'customer']) {
      assert.equal(await note(links, profile), 'Siehe [URL_REDACTED] und [URL_REDACTED] sowie [URL_REDACTED] und ([URL_REDACTED]).', profile);
      assert.equal(await note('Portal https://example.org/login?token=abc123 bitte nutzen. WLAN-Passwort: Sommer2024!', profile),
        `Portal [URL_REDACTED] bitte nutzen. WLAN-Passwort: ${M}`, profile);
    }
  });

  test('many labels on one long line are read in linear time', () => {
    // A first version read each value to the end of the line; 8 000 labels on
    // one line took seconds.
    const started = Date.now();
    const line = 'Der Token: es bleibt so. Danach '.repeat(20000);
    const spans = findInlineCredentialSpans(line);
    assert.equal(spans.length, 20000);
    // The ordinary scan does not know this label; every other rule sees the
    // line as before.
    assert.equal(findStructuredSpans(line).length, 0);
    assert.ok(Date.now() - started < 3000, `took ${Date.now() - started} ms`);
  });

  done();
}

main().catch((error) => { console.error(error); process.exit(1); });
