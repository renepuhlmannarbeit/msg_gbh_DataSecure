'use strict';

const crypto = require('crypto');

// JavaScript's \b is defined over [A-Za-z0-9_] only. In German documents that
// silently breaks every pattern anchored around umlauts: /\bÖsterreichische/
// never matches at the start of a line, and /Weiß\b/ never matches before a
// space. All patterns below therefore use explicit Unicode-aware boundaries.
const NB = '(?<![\\p{L}\\p{N}_])';
const NA = '(?![\\p{L}\\p{N}_])';

// Character classes shared by the person/organisation patterns.
const UPPER = 'A-ZÄÖÜÀ-Ý';
const NAME_BODY = "A-Za-zÀ-ÖØ-öø-ÿÄÖÜäöüß'’\\-";
const NAME_TOKEN = `[${UPPER}][${NAME_BODY}]{1,30}`;
const CAPS_TOKEN = `[${UPPER}][${UPPER}'’\\-]{1,30}`;

const ORG_SUFFIX =
  '(?:GmbH(?:\\s*&\\s*Co\\.?\\s*KG)?|AG|SE|KG|OHG|GbR|e\\.?V\\.?|B\\.?V\\.?' +
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
  `${NB}[A-Z0-9._%+\\-]+@[A-Z0-9.\\-]+\\.[A-Z]{2,}${NA}`,
  'giu'
);

// Shape only. Whether a shape is treated as a phone number is decided by
// phoneHasContext() so that the residual gate and the redactor cannot disagree.
const PHONE_RE = new RegExp(
  `${NB}(?:\\+\\d{1,3}[\\s./\\-]?)?(?:\\(?\\d{2,5}\\)?[\\s./\\-]?)` +
    `\\d{3,5}[\\s./\\-]\\d{2,6}(?:[\\s./\\-]\\d{1,6})?${NA}`,
  'gu'
);
const PHONE_LABEL_RE = /(?:tel|telefon|phone|mobil|handy|fax|kontakt|durchwahl)\s*\.?\s*:?\s*$/i;

const IBAN_RE = new RegExp(`${NB}[A-Z]{2}\\d{2}(?:[ ]?[A-Z0-9]){11,30}${NA}`, 'gu');

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

const POSTAL_ADDRESS_RE = new RegExp(
  `${NB}\\d{5}\\s+[${UPPER}][${NAME_BODY}]+(?:\\s+[${UPPER}][${NAME_BODY}]+){0,3}${NA}`,
  'gu'
);

const DE_SV_RE = new RegExp(`${NB}\\d{2}\\s?\\d{6}\\s?[A-Z]\\s?\\d{2}\\s?\\d${NA}`, 'gu');

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
  // document sections
  'QUALIFIKATIONEN', 'PROJEKTERFAHRUNG', 'BERUFSERFAHRUNG', 'SKILLSET',
  'ZERTIFIZIERUNGEN', 'SPRACHKENNTNISSE', 'BRANCHENKENNTNISSE', 'TECHNOLOGIEN',
  'METHODEN', 'AUFGABEN', 'VERANTWORTLICHKEITEN', 'AUSBILDUNG', 'WERDEGANG',
  'PROJEKT', 'PROJEKTE', 'ROLLE', 'ROLLEN', 'FUNKTION', 'ZEITRAUM', 'BRANCHE',
  'STANDORT', 'UNTERNEHMEN', 'KUNDE', 'KUNDEN', 'KONTAKT', 'ANLAGE', 'INHALT',
  'ZUSAMMENFASSUNG', 'BESCHREIBUNG', 'ERGEBNIS', 'ERGEBNISSE', 'ZIELE',
  'SEITE', 'STAND', 'VERSION', 'DATUM', 'TESTFALL', 'VERTRAULICH',
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
  'NODE JS', 'REACT NATIVE', 'ENTITY FRAMEWORK', 'CRYSTAL REPORTS'
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

function normalizeSpaces(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
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
  POSTAL_ADDRESS_RE,
  DE_TAX_RE,
  DE_TAX_LABEL_RE,
  DE_SV_RE,
  CREDIT_RE,
  LABELED_ID_RE,
  HONORIFICS,
  ROLE_WORDS,
  TECH_TERMS,
  ORG_ALLOW,
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
