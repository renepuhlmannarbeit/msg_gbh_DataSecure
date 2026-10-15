'use strict';

const { contentOptionsForConsumer, validateContentOptions } = require('./content-options');

// Legacy is byte-for-byte the historical grammar. New Standalone source
// contracts select a different fixed policy; no global toggle or wire flag.
const LEGACY_PERSON_FIELD_POLICY = 'legacy-person-fields/1';
const CONTENT_PERSON_FIELD_POLICY = 'content-person-fields/1';
const PERSON_LABEL =
  '(?:Name|Person|Full\\s+Name|Employee\\s+Name|Candidate\\s+Name|Contact\\s+Name|Mitarbeitername|Vorname|Nachname|Kunde|Kundin|Mitarbeiter(?:in)?|Bewerber(?:in)?' +
  '|Ansprechpartner(?:in)?|Vertreter(?:in)?|Kontaktperson|(?:(?:Interner|Technischer|Fachlicher)\\s+)?Kontakt|Sachbearbeiter(?:in)?' +
  '|Zuständige?|Verantwortliche?|Empfänger(?:in)?|Absender(?:in)?|Unterzeichner(?:in)?|Gesprächspartner(?:in)?' +
  '|Betreuer(?:in)?|Berater(?:in)?|Teilnehmer(?:in)?|Autor(?:in)?|Verfasser(?:in)?|Manager(?:in)?' +
  '|Eigentümer(?:in)?|Bearbeiter(?:in)?|(?:Zuletzt\\s+)?(?:geändert|erstellt)\\s+von' +
  '|Author|Creator|Manager|Owner|Approver|Representative|Contact\\s+person|Last\\s+modified\\s+by|Modified\\s+by|Nom|Nombre|Naam|Имя|ФИО|Όνομα|姓名|氏名|이름)';
const CONTENT_PERSON_LABEL = `(?:${PERSON_LABEL}|First\\s+Name|Vollständiger\\s+Name)`;
const fail = () => { throw Object.assign(new Error('CONTENT_OPTIONS_INVALID'), { code: 'CONTENT_OPTIONS_INVALID' }); };

function personFieldPolicyForContentOptions(value) {
  if (value === undefined) return LEGACY_PERSON_FIELD_POLICY;
  validateContentOptions(value);
  return CONTENT_PERSON_FIELD_POLICY;
}

function personFieldContextForConsumer(owner) {
  let channel;
  try {
    channel = Object.getOwnPropertyDescriptor(owner, 'productChannel');
    if (channel && (!Object.hasOwn(channel, 'value') || !channel.enumerable)) fail();
  } catch { fail(); }
  const contentOptions = contentOptionsForConsumer(owner, channel?.value);
  return Object.freeze({ policy: personFieldPolicyForContentOptions(contentOptions),
    consumerOptions: contentOptions ? Object.freeze({ productChannel: 'standalone', contentOptions }) : Object.freeze({}) });
}

function personFieldPattern(policy = LEGACY_PERSON_FIELD_POLICY) {
  if (policy === LEGACY_PERSON_FIELD_POLICY) return PERSON_LABEL;
  if (policy === CONTENT_PERSON_FIELD_POLICY) return CONTENT_PERSON_LABEL;
  fail();
}

const legacyField = new RegExp(`^${PERSON_LABEL}:?$`, 'iu');
const contentField = new RegExp(`^${CONTENT_PERSON_LABEL}:?$`, 'iu');
function isPersonFieldLabel(value, policy = LEGACY_PERSON_FIELD_POLICY) {
  personFieldPattern(policy);
  return typeof value === 'string' && (policy === CONTENT_PERSON_FIELD_POLICY ? contentField : legacyField).test(value);
}

module.exports = Object.freeze({ PERSON_LABEL, LEGACY_PERSON_FIELD_POLICY, CONTENT_PERSON_FIELD_POLICY,
  personFieldPolicyForContentOptions, personFieldContextForConsumer, personFieldPattern, isPersonFieldLabel });
