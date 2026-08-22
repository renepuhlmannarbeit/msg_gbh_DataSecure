'use strict';

const crypto = require('crypto');

// JavaScript's \b is defined over [A-Za-z0-9_] only. In German documents that
// silently breaks every pattern anchored around umlauts: /\bÖsterreichische/
// never matches at the start of a line, and /Weiß\b/ never matches before a
// space. All patterns below therefore use explicit Unicode-aware boundaries.
const NB = '(?<![\\p{L}\\p{N}_])';
const NA = '(?![\\p{L}\\p{N}_])';

// Character classes shared by the person/organisation patterns.
const UPPER = '\\p{Lu}\\p{Lt}';
const NAME_BODY = "\\p{L}\\p{M}'’\\-";
const CJK_NAME_TOKEN = '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}]{2,16}';
const NAME_TOKEN = `(?:[${UPPER}][${NAME_BODY}]{1,30}|${CJK_NAME_TOKEN})`;
const CAPS_TOKEN = `(?:[${UPPER}][${UPPER}\\p{M}'’\\-]{1,30}|${CJK_NAME_TOKEN})`;

const ORG_SUFFIX =
  '(?:GmbH(?:\\s*&\\s*Co\\.?\\s*KG)?|AG|SE(?:\\s*&\\s*Co\\.?\\s*KGaA)?|KGaA|KG|OHG|GbR|e\\.?V\\.?|B\\.?V\\.?' +
  '|Ltd\\.?|Limited|Inc\\.?|LLC|SAS|SARL|S\\.?A\\.?|PLC' +
  '|UG(?:\\s*\\(haftungsbeschränkt\\))?)';

const COMPANY_RE = new RegExp(
  `${NB}([${UPPER}][A-Za-z0-9ÄÖÜäöüß&.'’+\\-/]*` +
    `(?:[ \\t]+[${UPPER}0-9][A-Za-z0-9ÄÖÜäöüß&.'’+\\-/]*){0,7}` +
    `[ \\t]+${ORG_SUFFIX})${NA}`,
  'gu'
);

// Strips the legal form so that "Nordlicht Digital GmbH" and a later bare
// "Nordlicht Digital" resolve to the same pseudonym.
const ORG_SUFFIX_TAIL_RE = new RegExp(`[ \\t]+${ORG_SUFFIX}\\s*$`, 'iu');

const URL_RE = new RegExp(
  `${NB}(?:https?://|www\\.)[^\\s<>()]+` +
    `|${NB}[a-z0-9][a-z0-9.\\-]{2,}\\.(?:de|com|net|org|eu|io|ai|ch|at|nl|fr|uk)${NA}`,
  'giu'
);

const EMAIL_RE = new RegExp(
  `${NB}[\\p{L}\\p{N}._%+\\-]+@(?:[\\p{L}\\p{N}](?:[\\p{L}\\p{N}\\-]{0,61}[\\p{L}\\p{N}])?\\.)+` +
    `(?:[\\p{L}]{2,63}|xn--[a-z0-9-]{2,59})${NA}`,
  'giu'
);

// Every detector below is deliberately line-local: `\s` also matches a newline,
// and a pattern that may cross one stops being a detector and becomes a way to
// swallow the following paragraph. A postal address written with `\s+` matched
// "20457 Hamburg\n\nAngebot AN" as one address and left "-2026-0815" glued to
// the placeholder.
const SEP_CHARS = ' \\t'; // for use inside a character class
const SEP = `[${SEP_CHARS}]`; // for standalone use

// Shape only. Whether a shape is treated as a phone number is decided in
// structured.js so that the residual gate and the redactor cannot disagree.
const PHONE_RE = new RegExp(
  `${NB}(?:\\+\\d{1,3}[${SEP_CHARS}./\\-]?(?:\\(0\\)[${SEP_CHARS}./\\-]?)?)?` +
    `(?:\\(?\\d{2,5}\\)?[${SEP_CHARS}./\\-]?)` +
    `\\d{3,8}(?:[${SEP_CHARS}./\\-]\\d{1,6}){0,2}${NA}`,
  'gu'
);
const PHONE_LABEL_RE = /(?:tel|telefon|phone|mobil|handy|fax|kontakt|durchwahl)\s*\.?\s*:?\s*$/i;

const IBAN_RE = new RegExp(`${NB}[A-Z]{2}\\d{2}(?:[ ]?[A-Z0-9]){11,30}${NA}`, 'giu');

// A bare BIC is indistinguishable from an ordinary German word in upper case:
// /\b[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?\b/ matches SOFTWARE, PROJEKTE,
// UNTERNEHMEN and VERTRAULICH. BIC detection is therefore label-gated, with a
// bare shape accepted only on a line that also carries an IBAN.
const BIC_SHAPE = '[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?';
const BIC_RE = new RegExp(`${NB}${BIC_SHAPE}${NA}`, 'gu');
const BIC_LABEL_RE = /(?:bic|swift(?:[\s\-]?code)?|bank\s?identifier\s?code)\s*\.?\s*:?\s*$/i;

const IP_RE = new RegExp(
  `${NB}(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)${NA}`,
  'gu'
);

const IPV6_PART = '[A-F0-9]{1,4}';
const IPV6_RE = new RegExp(
  `${NB}(?:(?:${IPV6_PART}:){7}${IPV6_PART}|(?:${IPV6_PART}:){1,7}:|` +
    `(?:${IPV6_PART}:){1,6}:${IPV6_PART}|(?:${IPV6_PART}:){1,5}(?::${IPV6_PART}){1,2}|` +
    `(?:${IPV6_PART}:){1,4}(?::${IPV6_PART}){1,3}|(?:${IPV6_PART}:){1,3}(?::${IPV6_PART}){1,4}|` +
    `(?:${IPV6_PART}:){1,2}(?::${IPV6_PART}){1,5}|${IPV6_PART}:(?:(?::${IPV6_PART}){1,6})|` +
    `:(?:(?::${IPV6_PART}){1,7}|:))${NA}`,
  'giu'
);

const POSTAL_ADDRESS_RE = new RegExp(
  `${NB}\\d{5}${SEP}+[${UPPER}][${NAME_BODY}]+(?:${SEP}+[${UPPER}][${NAME_BODY}]+){0,3}${NA}`,
  'giu'
);

// Street and house number are a direct address component even when postal
// code and city are stored on a separate line.
const STREET_ADDRESS_RE = new RegExp(
  `${NB}(?:(?:[${UPPER}][${NAME_BODY}.\\-]{1,80}(?:straße|strasse|str\\.|weg|allee|gasse|platz|ring|damm|ufer|chaussee|stieg))` +
    `|(?:[${UPPER}][${NAME_BODY}.]{0,50}(?:${SEP}+[${UPPER}][${NAME_BODY}.]{0,50}){0,3}` +
    `${SEP}+(?:straße|strasse|str\\.|weg|allee|gasse|platz|ring|damm|ufer|chaussee|stieg))` +
    `|(?:(?:Am|Im|An${SEP}+der|Auf${SEP}+der|In${SEP}+der|Zum|Zur|Unter${SEP}+den|Unter${SEP}+der)` +
    `${SEP}+[${UPPER}][${NAME_BODY}.]+(?:${SEP}+[${UPPER}][${NAME_BODY}.]+){0,2}))${SEP}+\\d{1,5}[a-zA-Z]?` +
    `(?:${SEP}*[–—-]${SEP}*\\d{1,5}[a-zA-Z]?)?${NA}`,
  'giu'
);

const DATE_OF_BIRTH_RE = new RegExp(`${NB}\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}${NA}`, 'gu');
const DATE_OF_BIRTH_LABEL_RE = /(?:geburtsdatum|geburtstag|date of birth|dob)\s*:?\s*$/i;
const VEHICLE_PLATE_RE = new RegExp(`${NB}[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}[ ]?\\d{1,4}[EH]?${NA}`, 'giu');
const VEHICLE_PLATE_LABEL_RE = /(?:kennzeichen|kfz-?kennzeichen|nummernschild)\s*:?\s*$/i;

const DE_SV_RE = new RegExp(
  `${NB}\\d{2}${SEP}?\\d{6}${SEP}?[A-Z]${SEP}?\\d{2}${SEP}?\\d${NA}`,
  'gu'
);

// A bare 11-digit run is any invoice, order or article number, so the German
// tax id is label-gated as well. Bare runs are covered by LABELED_ID_RE.
const DE_TAX_SHAPE = '\\d{11}';
const DE_TAX_RE = new RegExp(`${NB}${DE_TAX_SHAPE}${NA}`, 'gu');
const DE_TAX_LABEL_RE =
  /(?:steuer(?:-?\s?id|nummer|liche\s+identifikationsnummer)|id-?nr|idnr|ust-?id(?:nr)?)\s*\.?\s*:?\s*$/i;

const CREDIT_RE = new RegExp(`${NB}(?:\\d[ \\-]?){12,18}\\d${NA}`, 'gu');

// Reference numbers only ever appear behind a label, which makes them safe to
// match with high precision and impossible to confuse with quantities.
const ID_LABELS =
  '(?:Mitarbeiter|Personal|Kunden|Auftrags|Vertrags|Rechnungs|Bestell|Versicherungs|Sozialversicherungs|Ausweis|Personalausweis|Reisepass|Führerschein|Matrikel|Patienten|Fall|Akten|Beleg|Lieferanten|Debitoren|Kreditoren)' +
  '(?:nummer|nr\\.?|-nr\\.?|-nummer|zeichen)' +
  '|Aktenzeichen|Az\\.|Personalnr\\.|SV-?Nr\\.|Steuernummer|Steuer-?ID';
const LABELED_ID_RE = new RegExp(
  `(${ID_LABELS})([ \\t]*[:=][ \\t]*|[ \\t]+)((?:[A-Z0-9][A-Z0-9./\\-]*)(?:[ ][A-Z0-9][A-Z0-9./\\-]*){0,3})`,
  'giu'
);

// Honorifics and job/section vocabulary must never end up inside a person
// pseudonym. "Herr Müller" used to be registered as the full name, so the same
// human received PERSON_001 as "Herr Müller", PERSON_002 as "Frau Müller" and
// PERSON_003 as a bare "Müller".
const HONORIFICS = new Set([
  'HERR', 'HERRN', 'FRAU', 'DR', 'DR.', 'PROF', 'PROF.', 'DIPL', 'DIPL.',
  'ING', 'ING.', 'MAG', 'MAG.', 'MR', 'MRS', 'MS', 'SEHR', 'GEEHRTE',
  'GEEHRTER', 'LIEBE', 'LIEBER', 'HALLO'
]);

// Words that disqualify a title-case bigram from being read as a person name.
const ROLE_WORDS = new Set([
  // legal forms
  'GMBH', 'AG', 'SE', 'KG', 'OHG', 'GBR', 'UG', 'LTD', 'LIMITED', 'INC', 'LLC',
  'SAS', 'SARL', 'PLC', 'CO', 'KGAA', 'EG', 'EV',
  // roles and functions
  'PRODUCT', 'OWNER', 'SCRUM', 'MASTER', 'BUSINESS', 'ANALYST', 'COACH',
  'AGILE', 'SOFTWARE', 'ENTWICKLER', 'ENTWICKLERIN', 'ENGINEER', 'CONSULTANT',
  'BERATER', 'BERATERIN', 'MANAGER', 'MANAGERIN', 'OFFICER', 'ARCHITECT',
  'ARCHITEKT', 'ARCHITEKTIN', 'LEAD', 'HEAD', 'DIRECTOR', 'TEAMLEITER',
  'PROJEKTLEITER', 'PROJEKTLEITERIN', 'TESTER', 'DESIGNER', 'ADMINISTRATOR',
  'SPECIALIST', 'EXPERTE', 'EXPERTIN', 'TRAINER', 'AUDITOR', 'SCIENTIST',
  'DEVELOPER', 'SENIOR', 'JUNIOR', 'PRINCIPAL', 'STAFF', 'INTERIM',
  'TEST', 'TESTMANAGER', 'TESTANALYST', 'TESTING', 'QUALITY', 'ASSURANCE',
  'QA', 'DEVOPS', 'FULLSTACK', 'BACKEND', 'FRONTEND', 'REQUIREMENTS',
  'AUTOMATION', 'ARCHITECTURE', 'INTEGRATION', 'INTEROPERABILITY',
  // document sections
  'QUALIFIKATIONEN', 'PROJEKTERFAHRUNG', 'BERUFSERFAHRUNG', 'SKILLSET',
  'ZERTIFIZIERUNGEN', 'SPRACHKENNTNISSE', 'BRANCHENKENNTNISSE', 'TECHNOLOGIEN',
  'METHODEN', 'AUFGABEN', 'VERANTWORTLICHKEITEN', 'AUSBILDUNG', 'WERDEGANG',
  'PROJEKT', 'PROJEKTE', 'ROLLE', 'ROLLEN', 'FUNKTION', 'ZEITRAUM', 'BRANCHE',
  'STANDORT', 'UNTERNEHMEN', 'KUNDE', 'KUNDEN', 'KONTAKT', 'ANLAGE', 'INHALT',
  'ZUSAMMENFASSUNG', 'BESCHREIBUNG', 'ERGEBNIS', 'ERGEBNISSE', 'ZIELE',
  'SEITE', 'STAND', 'VERSION', 'DATUM', 'TESTFALL', 'VERTRAULICH',
  // industries and languages frequently appear as comma-separated profile data
  'LOGISTIK', 'GESUNDHEITSWESEN', 'VERSICHERUNG', 'KRANKENKASSEN',
  'DEUTSCH', 'ENGLISCH',
  // agile / requirements vocabulary that reads like a name
  'USER', 'STORIES', 'STORY', 'BACKLOG', 'REFINEMENT', 'REVIEW', 'RETRO',
  'SPRINT', 'EPIC', 'EPICS', 'RELEASE', 'ROADMAP', 'WORKSHOP', 'WORKSHOPS',
  'STAKEHOLDER', 'STAKEHOLDERMANAGEMENT', 'DEFINITION', 'DONE', 'READY',
  'ACCEPTANCE', 'AKZEPTANZKRITERIEN', 'ANFORDERUNGSMANAGEMENT'
]);

// Technology and product names that look exactly like "Firstname Lastname".
// Without this list applicant and personnel profiles lose the very content the
// profiles are supposed to preserve.
const TECH_TERMS = new Set([
  'SPRING BOOT', 'VISUAL STUDIO', 'VISUAL BASIC', 'AZURE DEVOPS',
  'MICROSOFT AZURE', 'AMAZON WEB SERVICES', 'GOOGLE CLOUD', 'RED HAT',
  'SQL SERVER', 'ORACLE DATABASE', 'POWER BI', 'POWER APPS', 'POWER AUTOMATE',
  'MICROSOFT TEAMS', 'MICROSOFT OFFICE', 'OPEN SOURCE', 'MACHINE LEARNING',
  'DEEP LEARNING', 'DATA SCIENCE', 'DATA WAREHOUSE', 'BUSINESS INTELLIGENCE',
  'CONTINUOUS INTEGRATION', 'CONTINUOUS DELIVERY', 'DESIGN THINKING',
  'CLEAN CODE', 'DOMAIN DRIVEN DESIGN', 'TEST DRIVEN DEVELOPMENT',
  'PAIR PROGRAMMING', 'CODE REVIEW', 'DEUTSCHE BAHN', 'ARTIFICIAL INTELLIGENCE',
  'NODE JS', 'REACT NATIVE', 'ENTITY FRAMEWORK', 'CRYSTAL REPORTS',
  'SOFTWARE ARCHITECTURE', 'REQUIREMENTS ENGINEERING', 'BUSINESS ANALYSIS',
  'TEST MANAGEMENT', 'TEST AUTOMATION', 'EXPLORATORY TESTING',
  'REGRESSION TESTING', 'ACCEPTANCE TESTING', 'PERFORMANCE TESTING',
  'SECURITY TESTING', 'RISK BASED TESTING', 'QUALITY ASSURANCE',
  'PRODUCT DISCOVERY', 'PRODUCT VISION', 'PRODUCT GOAL', 'PRODUCT BACKLOG',
  'SPRINT PLANNING', 'SPRINT REVIEW', 'SPRINT RETROSPECTIVE',
  'VALUE PROPOSITION', 'STAKEHOLDER MANAGEMENT', 'REQUIREMENTS ELICITATION',
  'PROCESS MODELING', 'USER JOURNEY', 'USE CASE', 'DATA MODELING',
  'HEALTH LEVEL SEVEN', 'HL7 FHIR', 'FHIR RESOURCES', 'IHE PROFILES',
  'ELECTRONIC HEALTH RECORD', 'ELEKTRONISCHE PATIENTENAKTE',
  'DIGITALE GESUNDHEITSANWENDUNGEN', 'MEDIZINISCHE INFORMATIONSOBJEKTE',
  'SNOMED CT', 'LOINC CODES', 'ICD 10', 'DICOM WEB',
  'TELEMATIK INFRASTRUKTUR', 'PATIENT IDENTITY MANAGEMENT'
]);

// Brand names that are informative rather than identifying. Compared against
// both the full match and the legal-form-stripped alias, because COMPANY_RE
// only ever captures strings that end in a legal form.
const ORG_ALLOW = new Set([
  'SCRUM.ORG', 'MICROSOFT', 'SAP', 'ATLASSIAN', 'JIRA', 'CONFLUENCE', 'MIRO',
  'SAFE', 'IHK', 'TÜV', 'ISO', 'PMI', 'AWS', 'AMAZON WEB SERVICES', 'GOOGLE',
  'ORACLE', 'IBM', 'SALESFORCE', 'SERVICENOW', 'GITHUB', 'GITLAB', 'DOCKER',
  'KUBERNETES', 'LINUX', 'WINDOWS'
]);

// Invisible characters that break tokenisation without being visible to a
// reader. The soft hyphen is the practically relevant one: Word inserts it for
// justified text, so "Mül<U+00AD>ler" is an ordinary German document, and every
// name pattern would silently miss it.
const INVISIBLE_RE = /[­​‌‍⁠﻿]/gu;

// Text entering the engine is normalised once. Without NFC a decomposed umlaut
// ("Mu" + U+0308) does not match the name character classes at all, which is
// how documents exported from macOS would have passed a surname through
// untouched. Normalisation is idempotent, so applying it defensively at several
// boundaries is free.
function normalizeText(s) {
  return String(s || '')
    .normalize('NFC')
    .replace(INVISIBLE_RE, '');
}

function normalizeSpaces(s) {
  return normalizeText(s).replace(/\s+/g, ' ').trim();
}

function key(s) {
  return normalizeSpaces(s).toLocaleLowerCase('de-DE');
}

function hashShort(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 10);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Replacement strings are inserted verbatim: a literal "$&" in a pseudonym must
// not be reinterpreted as a substitution pattern.
function escapeReplacement(s) {
  return String(s).replace(/\$/g, '$$$$');
}

function replaceAllInsensitive(text, needle, repl) {
  if (!needle) return text;
  const re = new RegExp(`${NB}${escapeRegExp(needle)}${NA}`, 'giu');
  return String(text).replace(re, escapeReplacement(repl));
}

function lines(text) {
  return String(text || '').split(/\r?\n/);
}

function orgAlias(value) {
  return normalizeSpaces(String(value || '').replace(ORG_SUFFIX_TAIL_RE, ''));
}

function isAllowedOrg(value) {
  const full = normalizeSpaces(value).toLocaleUpperCase('de-DE');
  const alias = orgAlias(value).toLocaleUpperCase('de-DE');
  return ORG_ALLOW.has(full) || (alias.length > 0 && ORG_ALLOW.has(alias));
}

function titleCase(s) {
  return normalizeSpaces(s).replace(
    new RegExp(`([${UPPER}])([${UPPER}'’\\-]+)`, 'gu'),
    (_m, a, b) => a + b.toLocaleLowerCase('de-DE')
  );
}

function isStopToken(token) {
  const up = String(token).toLocaleUpperCase('de-DE');
  return ROLE_WORDS.has(up) || HONORIFICS.has(up);
}

function looksName(s) {
  const v = normalizeSpaces(s);
  if (!v || v.length > 80) return false;
  if (TECH_TERMS.has(v.toLocaleUpperCase('de-DE'))) return false;
  const toks = v.split(/\s+/);
  if (toks.length < 2 || toks.length > 4) return false;
  if (toks.some(isStopToken)) return false;
  const token = new RegExp(`^(?:${NAME_TOKEN}|${CAPS_TOKEN})$`, 'u');
  return toks.every((t) => token.test(t));
}

// A single token can be a surname, but only where the context says so
// (honorific, "Name:" label, or a surname already known from a full name).
function looksSurname(s) {
  const v = normalizeSpaces(s);
  if (!v || /\s/.test(v)) return false;
  if (isStopToken(v)) return false;
  return new RegExp(`^(?:${NAME_TOKEN}|${CAPS_TOKEN})$`, 'u').test(v) && v.length >= 2;
}

function luhnValid(digits) {
  const d = String(digits).replace(/\D/g, '');
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

// Shared by every label-gated detector: does `label` appear immediately before
// the match, on the same line?
function hasLabelBefore(text, index, labelRe, window = 40) {
  const start = Math.max(0, index - window);
  let before = String(text).slice(start, index);
  const nl = before.lastIndexOf('\n');
  if (nl >= 0) before = before.slice(nl + 1);
  return labelRe.test(before.replace(/[|\s]+$/, (m) => m.replace(/\|/g, ' ')));
}

function sameLineHasIban(text, index) {
  const s = String(text);
  const from = s.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
  let to = s.indexOf('\n', index);
  if (to < 0) to = s.length;
  const line = s.slice(from, to);
  IBAN_RE.lastIndex = 0;
  return IBAN_RE.test(line);
}

module.exports = {
  NB,
  NA,
  UPPER,
  NAME_BODY,
  NAME_TOKEN,
  CAPS_TOKEN,
  ORG_SUFFIX,
  ORG_SUFFIX_TAIL_RE,
  COMPANY_RE,
  URL_RE,
  EMAIL_RE,
  PHONE_RE,
  PHONE_LABEL_RE,
  IBAN_RE,
  BIC_RE,
  BIC_LABEL_RE,
  IP_RE,
  IPV6_RE,
  POSTAL_ADDRESS_RE,
  STREET_ADDRESS_RE,
  DATE_OF_BIRTH_RE,
  DATE_OF_BIRTH_LABEL_RE,
  VEHICLE_PLATE_RE,
  VEHICLE_PLATE_LABEL_RE,
  DE_TAX_RE,
  DE_TAX_LABEL_RE,
  DE_SV_RE,
  CREDIT_RE,
  LABELED_ID_RE,
  HONORIFICS,
  ROLE_WORDS,
  TECH_TERMS,
  ORG_ALLOW,
  normalizeText,
  INVISIBLE_RE,
  normalizeSpaces,
  key,
  hashShort,
  escapeRegExp,
  escapeReplacement,
  replaceAllInsensitive,
  lines,
  orgAlias,
  isAllowedOrg,
  titleCase,
  isStopToken,
  looksName,
  looksSurname,
  luhnValid,
  hasLabelBefore,
  sameLineHasIban
};
