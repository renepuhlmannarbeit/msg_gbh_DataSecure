'use strict';

// RC178 review R-033, the detection gaps seen in a native run. In the released
// Markdown of five invented files stood "Antragsteller: Hans Müller" and
// "Rückruf unter 030 7654321"; a list of names under "Teilnehmer:" stayed as
// well. Each rule below is bounded, and the counter-cases are lines without a
// person that have to stay exactly as they are. Two wider versions did not
// hold: roles as person fields replaced remarks ("Patient: stabil") and then
// that word in the rest of the document, and a rule for a name in front of
// "hat" took "Letzte Woche hat der Chef angerufen" for a person and replaced
// "Letzte Woche" in every later document of the batch. Everything runs through
// the shared text privacy operation with the automatic policy of the
// Standalone app. All values are invented.
const { createSuite } = require('./helpers');
const { zipStore } = require('./lib/zip');
const { opcControlEntries } = require('./lib/opc');
const { extractMarkdownBuffer } = require('../plugins/data-secure/server/standalone/markdown-extractor');
const { prepareTextPrivacyReview, resolveTextPrivacyReview, finalizeTextPrivacyReview } =
  require('../plugins/data-secure/server/gateway/privacy-text-operation');
const { makeRegistry } = require('../plugins/data-secure/server/privacy/entities');
const policy = require('../plugins/data-secure/server/core/person-field-policy');
const { testAsync, test, assert, done } = createSuite('Role labels, name lists and attributions');
const contentOptions = { schema: 'datasecure-content-options/1', markdownOutput: 'content-v1', scanOcr: true, imageOcr: true };
const PROFILES = ['general', 'contract', 'personnel_profile', 'applicant', 'customer'];
const BS = String.fromCharCode(92);

async function release(text, profile = 'general') {
  const operation = prepareTextPrivacyReview({ text, profile, productChannel: 'standalone',
    consumerOptions: { productChannel: 'standalone', contentOptions }, registry: makeRegistry(), captureTrace: false });
  const resolved = await resolveTextPrivacyReview(operation, undefined, { reviewPolicy: 'automatic-conservative' });
  return finalizeTextPrivacyReview(operation, resolved, { prefix: '', suffix: '' }).markdown;
}
const note = (body, profile) => release(`Notiz\n\n${body}`, profile).then((markdown) => markdown.split('\n\n').slice(1).join('\n\n'));
const unchanged = async (lines, profile) => { for (const line of lines) assert.equal(await note(line, profile), line, `${profile || 'general'}: ${line}`); };

async function main() {
  test('a role is no person field: the label grammar of both policies is as it was', () => {
    for (const label of ['Antragsteller', 'Patient', 'Mieter', 'Zeuge', 'Arzt']) {
      assert.equal(policy.isPersonFieldLabel(label, policy.CONTENT_PERSON_FIELD_POLICY), false, label);
      assert.equal(policy.isPersonFieldLabel(label, policy.LEGACY_PERSON_FIELD_POLICY), false, label);
    }
  });

  await testAsync('a name-shaped value behind a role and a colon is replaced in every profile', async () => {
    for (const profile of PROFILES) {
      for (const source of [
        'Antragsteller: Hans Müller', 'Patientin: Hans Müller', 'Versicherter: Hans Müller', 'Mandant: Hans Müller', 'Mieter: Hans Müller',
        'Behandelnder Arzt: Hans Müller', 'Zeugin: Hans Müller', 'Ehemann: Hans Müller', 'Rechtsanwalt: Hans Müller', 'Witness: Hans Müller',
        '- Mandant: Hans Müller\n- Gegner: Muster GmbH', '**Antragsteller:** Hans Müller', 'Mieter 1: Hans Müller', 'Patient/in: Hans Müller',
        'Patient: Hans Müller wurde entlassen.', 'Antragsteller: Hans Müller, Tel. 030 1234567'
      ]) assert.doesNotMatch(await note(source, profile), /Hans|Müller|1234567/u, `${profile}: ${source}`);
    }
    assert.equal(await note('Antragsteller: Hans Müller'), 'Antragsteller: [PERSON_001]');
    // The next sentence or a field label is not part of the name.
    assert.equal(await note('Zeuge: Hans Müller Die Verhandlung beginnt um 9 Uhr.'), 'Zeuge: [PERSON_001] Die Verhandlung beginnt um 9 Uhr.');
    assert.equal(await note('Vermieter: Wohnbau Kassel Das Wetter ist schön.'), 'Vermieter: [PERSON_001] Das Wetter ist schön.');
    // "Müller, Hans" stays with the engine: one person, one pseudonym.
    assert.equal(await note('Name: Hans Müller\nZeuge: Müller, Hans'), 'Name: [PERSON_001]\nZeuge: [PERSON_001]');
    // The next label on the same line ends the name, as in a form whose
    // columns arrive in one line; each role keeps its own name.
    assert.equal(await note('Mieter: Anna Sommer Geburtsdatum: 01.02.1980'), 'Mieter: [PERSON_001] Geburtsdatum: [DATE_REDACTED]');
    assert.equal(await note('Mieter: Anna Sommer Vermieter: Otto Normal Zeuge: Hans Müller'), 'Mieter: [PERSON_001] Vermieter: [PERSON_002] Zeuge: [PERSON_003]');
    assert.equal(await note('Mieter: Anna Sommer\tVermieter: Otto Normal'), 'Mieter: [PERSON_001]\tVermieter: [PERSON_002]');
    // From Word the brackets of "(m/w/d)" arrive escaped.
    assert.equal(await note(`Antragsteller ${BS}(m/w/d${BS}): Hans Müller`), `Antragsteller ${BS}(m/w/d${BS}): [PERSON_001]`);
  });

  await testAsync('a value that is no name stays, and so does the rest of the document', async () => {
    await unchanged(['Patient: stabil, keine Beschwerden', 'Mieter: zahlt pünktlich', 'Antragsteller: siehe Anlage 3', 'Arzt: nicht erforderlich',
      'Fahrer: wechselnd', 'Zeuge: unbekannt', 'Patientenakte: vollständig', 'Mieterhöhung: 3 Prozent',
      'Patient: stabil\n\nDer Verlauf ist stabil. Stabil bleibt der Druck.',
      'Mieter: Kassel\n\nIn Kassel ist es schön. Kassel hat 200000 Einwohner.',
      '| Wohnung | Mieter |\n| --- | --- |\n| 1 | ja |\n| 2 | nein |\n\nDer Antrag wurde ja bewilligt; nein sagte der Chef.']);
  });

  await testAsync('names in a list under a person label, a role or a list cue are replaced; a list without one is not', async () => {
    for (const profile of PROFILES) {
      for (const source of [
        'Teilnehmer:\n\n- Anna Sommer\n- Erika Beispiel\n- Otto Normal',
        'Anwesend:\n- Anna Sommer, Leitung\n- Erika Beispiel (Protokoll)\n- Otto Normal',
        '## Teilnehmende\n\n1. Anna Sommer\n2. Erika Beispiel',
        'Zeugen:\n* Anna Sommer\n* Erika Beispiel',
        'Entschuldigt:\n\n- Anna Sommer'
      ]) assert.doesNotMatch(await note(source, profile), /Anna|Sommer|Erika|Beispiel|Otto|Normal/u, `${profile}: ${source}`);
      // A field label behind the name is not part of it; the number keeps its own rule.
      assert.equal(await note('Anwesend:\n- Anna Sommer Telefon: 030 1234567', profile), 'Anwesend:\n- [PERSON_001] Telefon: [PHONE_REDACTED]', profile);
    }
    assert.match(await note('Anwesend:\n- Anna Sommer, Leitung\n- Erika Beispiel (Protokoll)'),
      /^Anwesend:\n- \[PERSON_\d+\], Leitung\n- \[PERSON_\d+\] \(Protokoll\)$/u, 'only the name of an item is replaced');
    assert.equal(await note('Anwesend:\n- Erika Beispiel: Leitung\n- Otto Normal'), 'Anwesend:\n- [PERSON_001]: Leitung\n- [PERSON_002]');
    // An item that is no name stays and does not end the list.
    assert.equal(await note('Anwesend:\n- Müller (Protokoll)\n- Erika Beispiel\n- Otto Normal'), 'Anwesend:\n- Müller (Protokoll)\n- [PERSON_001]\n- [PERSON_002]');
    // A text file from Windows ends its lines with a carriage return.
    assert.equal(await note('Anwesend:\r\n- Anna Sommer\r\n- Otto Normal\r\n'), 'Anwesend:\r\n- [PERSON_001]\r\n- [PERSON_002]\r\n');
    // From Word a bracket behind the name arrives escaped.
    assert.equal(await note(`Anwesend:\n\n- Anna Sommer ${BS}(Protokoll${BS})\n\n- Erika Beispiel – Leitung`),
      `Anwesend:\n\n- [PERSON_001] ${BS}(Protokoll${BS})\n\n- [PERSON_002] – Leitung`);
    // The label names what the items are. Without it, and for items that are no names, nothing changes.
    await unchanged(['Themen:\n\n- Anna Sommer\n- Hans Müller', '- Apple Watch\n- Samsung Galaxy\n- Lenovo Yoga',
      'Anwesend:\n- Einkauf\n- Vertrieb\n- Technik', 'Mitglieder:\n\n1. Stadt Kassel\n2. Land Hessen',
      'Verteiler:\n- Abteilung Einkauf\n- Service Center']);
    // The first line that is no list item ends the list.
    assert.match(await note('Teilnehmer:\n- Anna Sommer\n\nThemen:\n- Erika Beispiel'), /- Erika Beispiel$/u);
    assert.match(await note('Teilnehmer:\n- Anna Sommer\nNächster Termin am Montag.\n- Erika Beispiel'), /- Erika Beispiel$/u);
  });

  await testAsync('a name decided at one place is the same name at its other places in the document', async () => {
    // Before, only the place with the cue was replaced, and the name in the
    // next document of the batch; two lines further down it stayed readable.
    for (const profile of PROFILES) {
      assert.equal(await note('Anna Sommer bestätigt den Termin.\n\nSpäter kam Anna Sommer wieder.', profile),
        '[PERSON_001] bestätigt den Termin.\n\nSpäter kam [PERSON_001] wieder.', profile);
      assert.equal(await note('Antragsteller: Anna Sommer\n\nSpäter kam Anna Sommer wieder.', profile),
        'Antragsteller: [PERSON_001]\n\nSpäter kam [PERSON_001] wieder.', profile);
    }
    assert.equal(await note('Teilnehmer:\n- Anna Sommer\n\nAnna Sommer wird Protokoll führen.'), 'Teilnehmer:\n- [PERSON_001]\n\n[PERSON_001] wird Protokoll führen.');
    // Where the residual scan sees a wider hint at a further place
    // ("Hans Müller IBAN"), that hint keeps the place; an earlier version
    // put its own hint across it and stopped the document.
    for (const source of ['Zeuge: Hans Müller\n\nHans Müller IBAN DE89370400440532013000',
      'Hans Müller bestätigt den Termin.\n\nHans Müller IBAN DE89370400440532013000'])
      assert.doesNotMatch(await note(source), /Hans|Müller|DE89/u, source);
    // 500 further places per document; the place with the cue does not count.
    const lines = (count) => `Zeuge: Hans Müller\n\n${Array.from({ length: count }, () => 'Hans Müller war dort.').join('\n')}`;
    assert.equal(((await note(lines(500))).match(/Hans Müller/gu) || []).length, 0);
    assert.equal(((await note(lines(520))).match(/Hans Müller/gu) || []).length, 20);
  });

  await testAsync('a replaced name between a label and its number does not stop the document', async () => {
    // The residual gate reads a placeholder as blanks: "Tel. [PERSON_001]
    // 030 …" is a label in front of its number. The redactor did not, left
    // the number, and the document stopped with RESIDUAL_PII, in RC178 as soon
    // as the name was known ("Name: …") and since R-033 for every name that
    // is a candidate elsewhere. Now the number is replaced as well.
    const cases = [['Tel. X 030 1234567', 'Tel. [PERSON_001] [PHONE_REDACTED]'],
      ['Mobil X: 0171 2345678', 'Mobil [PERSON_001]: [PHONE_REDACTED]'],
      ['Geburtsdatum X: 01.02.1980', 'Geburtsdatum [PERSON_001]: [DATE_REDACTED]'],
      ['Personalnr. X 4711', 'Personalnr. [PERSON_001] [ID_REDACTED]'],
      [`Tel${BS}. X 030 1234567`, `Tel${BS}. [PERSON_001] [PHONE_REDACTED]`],
      // From Word the brackets of the area code arrive escaped. This number
      // was released in clear behind a replaced name, without a stop.
      [`Tel. X ${BS}(030${BS}) 1234567`, 'Tel. [PERSON_001] [PHONE_REDACTED]'],
      ['| Tel. | X 030 1234567 |', '| Tel. | [PERSON_001] [PHONE_REDACTED] |']];
    for (const profile of PROFILES) for (const cue of ['Name: X', 'Zeuge: X', 'X bestätigt den Termin.']) for (const [line, expected] of cases) {
      const source = `${cue}\n\n${line}`.split('X').join('Hans Müller');
      assert.equal((await note(source, profile)).split('\n\n')[1], expected, `${profile}: ${source}`);
    }
    for (const line of ['Steuer-ID X 12345678903', 'Aktenzeichen X 12/2026', 'Notfallkontakt X 0171 2345678'])
      assert.doesNotMatch(await note(`Zeuge: X\n\n${line}`.split('X').join('Hans Müller')), /Hans|Müller|12345678903|12\/2026|2345678/u, line);
    // Without a number behind the name nothing else is taken, and a name the
    // kernel does not know keeps the line as it was: the label is then not
    // in front of the number for either reader.
    assert.equal(await note('Name: Hans Müller\n\nTel. Hans Müller Zimmer 12'), 'Name: [PERSON_001]\n\nTel. [PERSON_001] Zimmer 12');
    await unchanged(['Tel. Hans Müller 030 1234567']);
  });

  await testAsync('two capitalised words in front of "hat" are no person', async () => {
    // A rule for "Petra Lang hat … unterschrieben" would be welcome, but a name
    // is known by its shape only; the same shape is a time, a place or a product.
    await unchanged(['Letzte Woche hat der Chef angerufen.', 'Nächste Woche hat die Firma zugesagt.', 'Stadt Kassel hat den Antrag eingereicht.',
      'Windows Update hat den Rechner neu gestartet und gemeldet.', 'Bad Homburg hat unterschrieben.']);
  });

  await testAsync('"Rückruf unter" and "Rückruf an" name a telephone number', async () => {
    for (const source of ['Rückruf unter 030 7654321.', 'Bitte Rückruf an 0171 2345678 bis Freitag.', 'Rückruf gerne unter 030 7654321'])
      assert.doesNotMatch(await note(source), /7654321|2345678/u, source);
    await unchanged(['Rückruf an die Zentrale erfolgt morgen.', 'Rückruf unter der bekannten Nummer.', 'Rückruf an 12 Kunden bis Freitag.', 'Ein Rückruf unter 3 Minuten ist das Ziel.']);
  });

  await testAsync('a name in front of an escaped bracket with "geb." is found as from text', async () => {
    // From Word the bracket and the period arrive escaped. The name in front
    // of "(geb. …" was found in text only. The birth name itself stays in both
    // forms: a rule for it stopped documents in which the same surname also
    // stands alone, and was taken out again (documented as a remaining gap).
    assert.equal(await note('Anna Meier (geb. Schulz) wohnt hier.'), '[PERSON_001] (geb. Schulz) wohnt hier.');
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const buffer = zipStore([...opcControlEntries('docx'), ['word/document.xml',
      `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body><w:p><w:r><w:t xml:space="preserve">Anna Meier (geb. Schulz) wohnt hier.</w:t></w:r></w:p></w:body></w:document>`]]);
    const markdown = extractMarkdownBuffer(buffer, '.docx', { partialExtraction: true, markdownOutput: 'content-v1' }).markdown;
    assert.match(markdown, /\\\(geb\\\. Schulz\\\)/u, 'premise: the bracket and the period are escaped');
    for (const profile of PROFILES) assert.doesNotMatch(await release(markdown, profile), /Anna|Meier/u, profile);
    await unchanged(['Gebühr geb. Rechnung Nr. 5', 'Die Anlage (geb. Ausführung) liegt bei.']);
  });
  done();
}
main().catch((error) => { console.error(error); process.exit(1); });
