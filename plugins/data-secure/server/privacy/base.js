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
  '(?:gGmbH|gUG(?:\\s*\\(haftungsbeschränkt\\))?|GmbH(?:\\s*&\\s*Co\\.?\\s*KG)?|AG|SE(?:\\s*&\\s*Co\\.?\\s*KGaA)?|KGaA|KG|OHG|GbR|e\\.?V\\.?|B\\.?V\\.?' +
  '|eG|e\\.?K\\.?|PartG(?:\\s+mbB)?|VVaG|AöR|KdöR|Anstalt\\s+des\\s+öffentlichen\\s+Rechts|Stiftung' +
  '|Ltd\\.?|Limited|Inc\\.?|LLC|SAS|SARL|S\\.?A\\.?|S\\.?L\\.?|N\\.?V\\.?|S\\.?r\\.?l\\.?|PLC' +
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

// Office-to-Markdown conversion may escape punctuation that is significant in
// Markdown (for example lina\\.beispiel@example\\.de). Match those optional
// source backslashes as part of the identifier so neither a local-part fragment
// nor an escaped domain survives redaction. This stays a source-coordinate
// detector: the released text is never globally unescaped or re-rendered.
const EMAIL_RE = new RegExp(
  `${NB}(?:[\\p{L}\\p{N}]|\\\\?[._%+\\-])+@` +
    `(?:[\\p{L}\\p{N}](?:(?:[\\p{L}\\p{N}]|\\\\?-){0,61}[\\p{L}\\p{N}])?\\\\?\\.)+` +
    `(?:[\\p{L}]{2,63}|xn\\\\?-\\\\?-[a-z0-9-]{2,59})${NA}`,
  'giu'
);

// Only discover the scheme here. structured.js scans its payload by scheme:
// address URIs include complete Unicode/percent-encoded addresses, whereas a
// telephone number cannot absorb adjacent prose just because it follows a dot.
const CONTACT_URI_RE = new RegExp(
  `${NB}(mailto|tel|sms|callto|sip|xmpp):`,
  'giu'
);

// Every detector below is deliberately line-local: `\s` also matches a newline,
// and a pattern that may cross one stops being a detector and becomes a way to
// swallow the following paragraph. A postal address written with `\s+` matched
// "20457 Hamburg\n\nAngebot AN" as one address and left "-2026-0815" glued to
// the placeholder.
// Unicode no-break spaces are ordinary visual separators in documents copied
// from Office/PDF exports. Keep them in the detector grammar instead of
// changing document-wide typography merely to make identifiers detectable.
const SEP_CHARS = ' \\t\\u00A0\\u202F\\u2007'; // for use inside a character class
const SEP = `[${SEP_CHARS}]`; // for standalone use
const DASH_CHARS = '\\-\\u2010\\u2011\\u2012\\u2013\\u2212';
const PHONE_SEPARATOR = `(?:[${SEP_CHARS}]+|[${SEP_CHARS}]*[./${DASH_CHARS}][${SEP_CHARS}]*)`;

// Shape only. Whether a shape is treated as a phone number is decided in
// structured.js so that the residual gate and the redactor cannot disagree.
const PHONE_RE = new RegExp(
  `${NB}(?:(?:\\+|00)\\d{1,3}(?:${PHONE_SEPARATOR})?(?:\\(0\\)(?:${PHONE_SEPARATOR})?)?)?` +
    `(?:\\(?\\d{2,5}\\)?)` +
    `(?:(?:${PHONE_SEPARATOR})?\\d{3,8}(?:${PHONE_SEPARATOR}\\d{1,6}){0,2}` +
    // The subscriber block is also commonly grouped into short 2-digit pairs
    // (e.g. "030 12 34 56 78"). That shape needs its own branch requiring a
    // real separator before the first group: making the plain 3-8 digit
    // block's minimum 2 instead let it match any bare digit run (an area code
    // plus a short unseparated remainder, e.g. "1000" in "kontakt.1000@..."),
    // turning every 4+ digit number after a "kontakt"-labelled line into a
    // false-positive phone match.
    `|${PHONE_SEPARATOR}\\d{2,4}(?:${PHONE_SEPARATOR}\\d{2,4}){2,4})${NA}`,
  'gu'
);
// The keyword may carry a "-nummer"/"number" suffix ("Telefonnummer",
// "Telefoonnummer") and a bracketed qualifier ("Telefon (privat)"); review rc91
// (F3) showed both shapes disabled the gate entirely.
const LABEL_QUALIFIER = '(?:\\s*\\([^)\\n]{1,40}\\))?';
const PHONE_LABEL_RE = new RegExp(
  '(?:tel|telefon|téléphone|telephone|phone|teléfono|telefono|telefoon|mobil|mobile|handy|fax|kontakt|durchwahl|rufnummer' +
  '|erreichbar(?:\\s+unter)?|zu\\s+erreichen(?:\\s+unter)?|unter\\s+der\\s+(?:ruf)?nummer|anzurufen\\s+unter)' +
  `(?:[\\s-]?(?:nummer|nr\\.?|number|numéro|número|numero))?${LABEL_QUALIFIER}\\s*\\.?\\s*:?\\s*$`,
  'iu'
);
// France commonly groups local subscriber numbers into four two-digit pairs
// after a one-digit area code. Keep that shape separate from PHONE_RE so a
// broadened generic matcher cannot mistake short technical number runs for PII.
const FRENCH_PHONE_RE = new RegExp(
  `${NB}(?:(?:\\+33|0)[${SEP_CHARS}./${DASH_CHARS}]?[1-9](?:[${SEP_CHARS}./${DASH_CHARS}]?\\d{2}){4})${NA}`,
  'gu'
);

const IBAN_RE = new RegExp(`${NB}[A-Z]{2}\\d{2}(?:${SEP}?[A-Z0-9]){11,30}${NA}`, 'giu');

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

// Numeric and spelled-out dates ("1. Januar 1980", "January 1, 1980"); the
// detector stays label-gated, so month names cannot fire on ordinary prose.
const MONTH_NAME = '(?:Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember' +
  '|January|February|March|May|June|July|October|December|Jan|Feb|Mär|Apr|Jun|Jul|Aug|Sep|Sept|Okt|Oct|Nov|Dez|Dec' +
  '|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre' +
  '|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre' +
  '|januari|februari|maart|mei|augustus|oktober)';
const DATE_OF_BIRTH_RE = new RegExp(
  `${NB}(?:\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{4}[./-]\\d{1,2}[./-]\\d{1,2}|\\d{1,2}\\.?(?:er)?\\s+(?:de\\s+)?${MONTH_NAME}\\.?\\s+(?:de\\s+)?\\d{4}|${MONTH_NAME}\\.?\\s+\\d{1,2},?\\s+\\d{4})${NA}`,
  'giu'
);
// Review rc91 (F4): only German/English literals were known; French, Spanish,
// Dutch and Italian headers left birth dates in clear.
const DATE_OF_BIRTH_LABEL_RE = new RegExp(
  '(?:geburtsdatum|geburtstag|geboren(?:\\s+am)?|geb\\.|date\\s+of\\s+birth|birth\\s*date|birthday|dob' +
  '|date\\s+de\\s+naissance|née?\\s+le|fecha\\s+de\\s+nacimiento|nacid[oa]\\s+el|geboortedatum|geboren\\s+op|data\\s+di\\s+nascita)' +
  `${LABEL_QUALIFIER}\\s*:?\\s*$`,
  'iu'
);
const VEHICLE_PLATE_RE = new RegExp(`${NB}[A-ZÄÖÜ]{1,3}-[A-Z]{1,2}[ ]?\\d{1,4}[EH]?${NA}`, 'giu');
const VEHICLE_PLATE_LABEL_RE = /(?:kennzeichen|kfz-?kennzeichen|nummernschild)\s*:?\s*$/i;

const DE_SV_RE = new RegExp(
  `${NB}\\d{2}${SEP}?\\d{6}${SEP}?[A-Z]${SEP}?\\d{2}${SEP}?\\d${NA}`,
  'gu'
);

// A bare 11-digit run is any invoice, order or article number, so the German
// tax id is label-gated as well. Bare runs are covered by LABELED_ID_RE.
// Official letters commonly print the id grouped as "26 954 371 827"
// (2-3-3-3); an unseparated \d{11} alone missed that grouped shape.
const DE_TAX_SHAPE = `\\d{2}${SEP}?\\d{3}${SEP}?\\d{3}${SEP}?\\d{3}`;
const DE_TAX_RE = new RegExp(`${NB}${DE_TAX_SHAPE}${NA}`, 'gu');
const DE_TAX_LABEL_RE =
  /(?:steuer(?:-?\s?id|nummer|liche\s+identifikationsnummer)|id-?nr|idnr|ust-?id(?:nr)?)\s*\.?\s*:?\s*$/i;

const CREDIT_RE = new RegExp(`${NB}(?:\\d[ \\-]?){12,18}\\d${NA}`, 'gu');

// Reference numbers only ever appear behind a label, which makes them safe to
// match with high precision and impossible to confuse with quantities.
const ID_LABELS =
  '(?:Mitarbeiter|Personal|Kunden|Auftrags|Vertrags|Rechnungs|Bestell|Versicherungs|Sozialversicherungs|Ausweis|Personalausweis|Reisepass|Führerschein|Matrikel|Patienten|Fall|Akten|Beleg|Lieferanten|Debitoren|Kreditoren)' +
  '(?:nummer|nr\\.?|-nr\\.?|-nummer|zeichen)' +
  '|Aktenzeichen|Az\\.|Personalnr\\.|SV-?Nr\\.|Steuernummer|Steuer-?ID' +
  '|(?:contract|reference|order|invoice|employee|customer|case|patient)[ \\t]*(?:number|no\\.?|id)';
const LABELED_ID_RE = new RegExp(
  `(${ID_LABELS})([ \\t]*[:=][ \\t]*|[ \\t]+)((?:[A-Z0-9][A-Z0-9./\\-]*)(?:[ ][A-Z0-9][A-Z0-9./\\-]*){0,3})`,
  'giu'
);
// The same labels as table headers: "| Personalnummer |" above a column of
// bare identifiers carries the label for every cell below it.
const ID_LABEL_HEADER_RE = new RegExp(`^(?:${ID_LABELS})\\s*:?\\s*$`, 'iu');
// A bare identifier cell: at least one digit, no spaces, id-like characters.
const TABLE_ID_CELL_RE = new RegExp(`${NB}(?=[A-Z0-9./\\-]*\\d)[A-Z0-9][A-Z0-9./\\-]{2,}${NA}`, 'giu');

// Secrets are recognized only behind an explicit field/column label. Guessing
// from entropy or token shape would redact ordinary technical prose and still
// miss human-readable passphrases. Keep the value line-local and retain the
// label so the released document remains understandable.
const CREDENTIAL_LABELS =
  '(?:Pass[ \\t]*wort|Kenn[ \\t]*wort|Pass[ \\t]*word|Pass[ \\t]*phrase|Secret|Token|API(?:[ \\t-]+)?Key' +
  '|Zugangs[ \\t]*daten|Zugangs[ \\t]*code|PIN|Benutzer[ \\t]*name|Nutzer[ \\t]*name|User[ \\t]*name' +
  '|Login(?:[ \\t]*name)?|Anmelde[ \\t]*name|Konto[ \\t]*kennung)';
const CREDENTIAL_FIELD_RE = new RegExp(
  `^([ \\t]*(?:>[ \\t]*)?(?:[-*+][ \\t]+)?${CREDENTIAL_LABELS}[ \\t]*(?::|=|：|＝)[ \\t]*)([^\\r\\n]*?\\S)(?=[ \\t]*\\r?$)`,
  'gimu'
);
const CREDENTIAL_LABEL_HEADER_RE = new RegExp(`^${CREDENTIAL_LABELS}[ \\t]*[:：]?$`, 'iu');

// Honorifics and job/section vocabulary must never end up inside a person
// pseudonym. "Herr Müller" used to be registered as the full name, so the same
// human received PERSON_001 as "Herr Müller", PERSON_002 as "Frau Müller" and
// PERSON_003 as a bare "Müller".
const HONORIFICS = new Set([
  'HERR', 'HERRN', 'FRAU', 'DR', 'DR.', 'PROF', 'PROF.', 'DIPL', 'DIPL.',
  'ING', 'ING.', 'MAG', 'MAG.', 'DR.-ING', 'DR.-ING.', 'MR', 'MR.', 'MRS', 'MRS.', 'MS', 'MS.', 'MX', 'MX.', 'SEHR', 'GEEHRTE',
  'GEEHRTER', 'LIEBE', 'LIEBER', 'HALLO',
  // Degree qualifiers behind a title ("Dr. med.", "Dr. h. c.", "Dr. rer. nat.")
  // are part of the honorific, never of the name (review rc91).
  'MED', 'MED.', 'DENT', 'DENT.', 'VET', 'VET.', 'JUR', 'JUR.', 'PHIL', 'PHIL.',
  'THEOL', 'THEOL.', 'OEC', 'OEC.', 'HABIL', 'HABIL.', 'H.', 'C.', 'RER', 'RER.',
  'NAT', 'NAT.', 'POL', 'POL.', 'SOC', 'SOC.', 'PD', 'PRIV.-DOZ', 'PRIV.-DOZ.'
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
  'SAP COMMERCE',
  'MICROSOFT AZURE', 'AMAZON WEB SERVICES', 'GOOGLE CLOUD', 'RED HAT',
  'SQL SERVER', 'ORACLE DATABASE', 'POWER BI', 'POWER APPS', 'POWER AUTOMATE',
  'MICROSOFT TEAMS', 'MICROSOFT OFFICE', 'OPEN SOURCE', 'MACHINE LEARNING',
  'DEEP LEARNING', 'DATA SCIENCE', 'DATA WAREHOUSE', 'BUSINESS INTELLIGENCE',
  'CONTINUOUS INTEGRATION', 'CONTINUOUS DELIVERY', 'DESIGN THINKING',
  'CLEAN CODE', 'DOMAIN DRIVEN DESIGN', 'TEST DRIVEN DEVELOPMENT',
  'PAIR PROGRAMMING', 'CODE REVIEW', 'DEUTSCHE BAHN', 'ARTIFICIAL INTELLIGENCE',
  'NODE JS', 'REACT NATIVE', 'ENTITY FRAMEWORK', 'CRYSTAL REPORTS',
  'SOFTWARE ARCHITECTURE', 'REQUIREMENTS ENGINEERING', 'BUSINESS ANALYSIS',
  'DIGITAL TRANSFORMATION', 'DIGITALE TRANSFORMATION', 'CLOUD MIGRATION',
  'AZURE FUNCTIONS', 'MEDICAL INFORMATICS', 'HEALTH INFORMATICS',
  'CLINICAL INFORMATICS', 'DIGITAL HEALTH', 'DATA GOVERNANCE',
  'GRAPH API', 'MICROSOFT GRAPH API', 'PROJECT SERVER', 'ROBOT FRAMEWORK',
  'IMAGING PROTOCOL', 'IMAGE RECONSTRUCTION', 'TREATMENT PROTOCOL',
  'SCANNER CALIBRATION', 'SPECTROSCOPY REPORT',
  'CLINICAL RESEARCH', 'PRIVACY POLICY', 'COMPANY LOGO',
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
const INVISIBLE_JOINER_RE = /[­​‌‍⁠﻿]/gu;
const BIDI_BOUNDARY_RE = /[\u202A-\u202E\u2066-\u2069]/gu;
// Backwards-compatible complete detector for modules/tests that inspect the
// privacy character class without applying its context-sensitive rewrite.
const INVISIBLE_RE = /[­​‌‍⁠﻿\u202A-\u202E\u2066-\u2069]/gu;

// Text entering the engine is normalised once. Without NFC a decomposed umlaut
// ("Mu" + U+0308) does not match the name character classes at all, which is
// how documents exported from macOS would have passed a surname through
// untouched. Normalisation is idempotent, so applying it defensively at several
// boundaries is free.
function normalizeText(s) {
  return String(s || '')
    .normalize('NFC')
    // Formatting joiners embedded by Office/browser exports belong to the
    // surrounding token (for example Mu<soft-hyphen>eller). Bidi controls are
    // different: treating them as an empty string could join two attacker-
    // controlled name tokens into one synthetic word. Preserve that boundary.
    .replace(INVISIBLE_JOINER_RE, '')
    .replace(BIDI_BOUNDARY_RE, ' ')
    // Office, PDF and browser exports use the complete Unicode Space
    // Separator family. Privacy matching must see the same token boundary for
    // all of them; retaining the visual width is less important than avoiding
    // an invisible split that the residual gate cannot classify.
    .replace(/\p{Zs}/gu, ' ');
}

// Detection-only compatibility view, never document/output normalization.
// Every replacement is one BMP code unit, so existing UTF-16 source, OCR and
// review offsets stay exact. Deliberately exclude structural Markdown signs,
// ligatures, units, superscripts and cross-script lookalikes: generic NFKC
// would change professional content and can expand a single source character.
const IDENTIFIER_COMPAT_RE = /[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF20\uFF0E\uFF0B\uFF0D\uFF0F\uFF1A\uFF05\uFF1F\uFF06\uFF1D\uFF08\uFF09\uFF3F\uFF5E\u2024]/gu;
function identifierDetectionText(s) {
  return String(s || '').replace(IDENTIFIER_COMPAT_RE, (character) =>
    character === '\u2024' ? '.' : String.fromCharCode(character.charCodeAt(0) - 0xFEE0));
}

// The privacy engine receives Markdown, including parser-generated Markdown.
// Detecting only source syntax is unsafe because a renderer can reveal a
// different string (HTML entities, emphasis, links or inline HTML). This
// bounded canonicalisation preserves visible wording while removing syntax
// that can split identifiers. It never executes HTML and never fetches links.
function canonicalizeRenderedText(s) {
  let value = normalizeText(s);
  // Remove only actual, common HTML tags from the source representation.
  // Entity-escaped comparisons and programming generics are visible text and
  // must not turn into markup after entity decoding.
  const htmlBoundaryTag = /<\/?(?:address|article|aside|blockquote|br|caption|col|colgroup|dd|details|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|table|tbody|td|tfoot|th|thead|tr|ul)(?:\s[^<>\n]{0,2000})?\s*\/?>/giu;
  const htmlInlineTag = /<\/?(?:a|abbr|b|cite|code|del|dfn|em|i|img|ins|kbd|mark|picture|q|s|samp|small|source|span|strong|sub|sup|time|u|var)(?:\s[^<>\n]{0,2000})?\s*\/?>/giu;
  value=value.replace(/<!--[\s\S]*?-->/gu,'').replace(htmlBoundaryTag,' ').replace(htmlInlineTag,'');
  const named = {
    nbsp:' ',tab:' ',newline:'\n',ensp:' ',emsp:' ',thinsp:' ',hairsp:' ',mediumspace:' ',verythinspace:' ',
    amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",period:'.',commat:'@',colon:':',semi:';',comma:',',sol:'/',bsol:'\\',
    auml:'ä',ouml:'ö',uuml:'ü',auml_upper:'Ä',ouml_upper:'Ö',uuml_upper:'Ü',szlig:'ß',
    eacute:'é',egrave:'è',ecirc:'ê',ccedil:'ç',ntilde:'ñ',aacute:'á',iacute:'í',oacute:'ó',uacute:'ú'
  };
  const decodeLayer = (input) => input
    .replace(/&#(?:x([0-9a-f]{1,6})|([0-9]{1,7}));/giu, (match, hex, dec) => {
      const code = Number.parseInt(hex || dec, hex ? 16 : 10);
      if(!Number.isSafeInteger(code)||code<0||code>0x10ffff||(code>=0xd800&&code<=0xdfff))return '\uFFFD';
      if((code<0x20&&!['9','10','13'].includes(String(code)))||(code>=0x7f&&code<=0x9f))return '\uFFFD';
      return String.fromCodePoint(code);
    })
    .replace(/&([A-Za-z][A-Za-z0-9]{1,31});/gu, (match, rawName) => {
      const exact = rawName === 'Auml' ? 'auml_upper' : rawName === 'Ouml' ? 'ouml_upper' : rawName === 'Uuml' ? 'uuml_upper' : rawName.toLocaleLowerCase('en-US');
      return Object.prototype.hasOwnProperty.call(named, exact) ? named[exact] : match;
    });
  for(let depth=0;depth<16;depth++){
    const decoded=decodeLayer(value);
    if(decoded===value)break;
    value=decoded;
  }
  // More than sixteen nested layers are not meaningful document content. Do
  // not leave a value that changes classification on a later anonymisation.
  value=value.replace(/&(?=(?:#(?:x[0-9a-f]{1,6}|[0-9]{1,7})|[A-Za-z][A-Za-z0-9]{1,31});)/giu,'\uFFFD');
  // Preserve rendered wording, but remove metadata and inactive markup before
  // privacy detection. No target is fetched or executed.
  // Keep Markdown link syntax inert and intact. Labels, titles and targets are
  // scanned by the entity/structured rules; flattening the link here would
  // silently change document content and break the promised Markdown result.
  value=value.replace(/\*\*\*([^*\n]+)\*\*\*/gu,'$1');
  value=value.replace(/\*\*([^*\n]+)\*\*/gu,'$1');
  value=value.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/gu,'$1');
  value=value.replace(/___([^_\n]+)___/gu,'$1');
  value=value.replace(/__([^_\n]+)__/gu,'$1');
  value=value.replace(/(?<![\p{L}\p{N}\]])_([^_\n]+)_(?![\p{L}\p{N}\[])/gu,'$1');
  value=value.replace(/~~([^~\n]+)~~/gu,'$1');
  value=value.replace(/`+([^`\n]+)`+/gu,'$1');
  return normalizeText(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu,'\uFFFD');
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

// Nobility and origin particles sit between name tokens ("Anna von der
// Heide", "Jean-Luc de la Croix"); they are neither the first nor the last
// token and never count as name tokens themselves.
const NAME_PARTICLE = '(?:von|vom|van|de|der|den|del|della|di|da|du|la|le|zu|zur|zum|y|e|of)';
const NAME_PARTICLES = new Set(['von', 'vom', 'van', 'de', 'der', 'den', 'del', 'della', 'di', 'da', 'du', 'la', 'le', 'zu', 'zur', 'zum', 'y', 'e', 'of']);

function looksName(s) {
  const v = normalizeSpaces(s);
  if (!v || v.length > 80) return false;
  if (TECH_TERMS.has(v.toLocaleUpperCase('de-DE'))) return false;
  const all = v.split(/\s+/);
  if (all.length > 7) return false;
  const toks = all.filter((t, i) => !(i > 0 && i < all.length - 1 && NAME_PARTICLES.has(t)));
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
// the match, on the same line, or in the header cell of the Markdown table
// column the match sits in? CSV and DOCX tables put the label in the header
// row and the value two or more lines below; same-line adjacency alone let
// tax ids, dates of birth, phone numbers and plates through in that shape.
function hasLabelBefore(text, index, labelRe, window = 40) {
  const start = Math.max(0, index - window);
  let before = String(text).slice(start, index);
  const nl = before.lastIndexOf('\n');
  if (nl >= 0) before = before.slice(nl + 1);
  if (labelRe.test(normalizeSensitiveLabel(before.replace(/[|\s]+$/, (m) => m.replace(/\|/g, ' '))))) return true;
  const header = tableHeaderAt(text, index);
  if (header !== null && labelRe.test(header)) return true;
  // Form layouts put the label alone on the line above the value
  // ("Geburtsdatum\n01.01.1980", definition lists ": 26954371827"). When the
  // value starts its own line, the nearest short non-empty line above counts.
  if (/^[\s|:>*+\-–•]*$/u.test(before)) {
    const label = previousLabelLine(text, index);
    if (label !== null && labelRe.test(normalizeSensitiveLabel(label))) return true;
  }
  return false;
}

// Office line breaks inside narrow header cells often split a closed PII label
// into two visible words. Normalize only this bounded vocabulary; document-wide
// whitespace folding would alter prose and create unrelated false positives.
function normalizeSensitiveLabel(value) {
  return String(value || '')
    .replace(/\bsteuer(?:[ \t]+|[ \t]*-[ \t]*)id\b/giu, 'Steuer-ID')
    .replace(/\bgeburts(?:[ \t]+|[ \t]*-[ \t]*)datum\b/giu, 'Geburtsdatum')
    .replace(/\b(tel|telefon|téléphone|telephone|phone|teléfono|telefono|telefoon|mobil|mobile|handy|fax)(?:[ \t]+|[ \t]*-[ \t]*)(privat|dienstlich|geschäftlich|geschaeftlich|business|private)\b/giu, '$1 ($2)')
    .replace(/\b(personal|mitarbeiter|kunden|auftrags|vertrags|rechnungs|bestell|versicherungs|sozialversicherungs|patienten|fall|akten|lieferanten|debitoren|kreditoren)(?:[ \t]+|[ \t]*-[ \t]*)(nummer|nr\.?|zeichen)\b/giu, '$1$2');
}

function previousLabelLine(text, index) {
  const src = String(text);
  let lineStart = src.lastIndexOf('\n', Math.max(0, index - 1));
  for (let hops = 0; hops < 3 && lineStart > 0; hops++) {
    const previousStart = src.lastIndexOf('\n', lineStart - 1) + 1;
    const line = src.slice(previousStart, lineStart).replace(/[|\s:>*+\-–•]+$/u, '').replace(/^[\s|>*+\-–•]+/u, '').trim();
    if (line) return line.length <= 80 ? line : null;
    lineStart = previousStart - 1;
  }
  return null;
}

function splitTableRow(line) {
  const source = String(line || '').trim();
  if (!source.includes('|')) return null;
  const leading = source.startsWith('|') ? 1 : 0;
  const body = source.slice(leading).replace(/\|$/u, '');
  const cells = [];
  let value = '';
  let escaped = false;
  for (const char of body) {
    if (escaped) {
      value += char;
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '|') {
      cells.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  if (escaped) value += '\\';
  cells.push(value.trim());
  return cells.length >= 2 ? cells : null;
}

// One pass per text: for every data row of a Markdown table, remember the
// header cells so a detector can ask which label owns the column of a match.
// The cache holds the last text only; the engine scans one document at a time.
let tableIndexText = null;
let tableIndex = null;

function isSensitiveTableHeader(value) {
  const header = normalizeSensitiveLabel(value);
  return DATE_OF_BIRTH_LABEL_RE.test(header) || PHONE_LABEL_RE.test(header) ||
    DE_TAX_LABEL_RE.test(header) || ID_LABEL_HEADER_RE.test(header) ||
    CREDENTIAL_LABEL_HEADER_RE.test(header);
}

function combineHeaderRows(rows) {
  return rows[0].map((_, column) =>
    normalizeSensitiveLabel(rows.map((row) => row[column]).join(' '))
  );
}

// A known PII label may be split by Word across at most three visible header
// rows. Longer or structurally inconsistent shapes are not guessed: the final
// residual gate receives an explicit structural finding and stops the file.
const SENSITIVE_HEADER_FRAGMENT_RE = /\b(?:steuer|geburts|telefon|telephone|phone|téléphone|teléfono|telefono|telefoon|mobil|mobile|handy|fax|personal|mitarbeiter|sozialversicherungs|patienten|kunden|auftrags|vertrags|rechnungs|bestell|versicherungs|fall|akten|lieferanten|debitoren|kreditoren|passwort|kennwort|password|passphrase|secret|token|zugangsdaten|zugangscode|pin|benutzername|nutzername|username|loginname|anmeldename|kontokennung)\b/iu;

const CREDENTIAL_FRAGMENT_PAIRS = [
  ['pass', 'wort'], ['kenn', 'wort'], ['pass', 'word'], ['pass', 'phrase'],
  ['api', 'key'], ['zugangs', 'daten'], ['zugangs', 'code'],
  ['benutzer', 'name'], ['nutzer', 'name'], ['user', 'name'], ['login', 'name'],
  ['anmelde', 'name'], ['konto', 'kennung']
];

function hasCredentialHeaderFragmentSequence(rows) {
  const width = Math.max(0, ...rows.map((row) => row.length));
  for (let column = 0; column < width; column++) {
    const parts = rows.map((row) => normalizeSensitiveLabel(row[column] || '').toLowerCase())
      .filter(Boolean);
    if (CREDENTIAL_FRAGMENT_PAIRS.some(([first, last]) =>
      parts.includes(first) && parts.includes(last))) return true;
  }
  return false;
}

function buildTableIndex(text) {
  const src = String(text || '');
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  const rows = src.split('\n');
  const headersByLine = new Map();
  const ambiguousSensitiveLines = new Set();
  for (let index = 1; index + 1 < rows.length; index++) {
    const separator = splitTableRow(rows[index]);
    if (!separator || !separator.every((cell) => /^:?-{3,}:?$/u.test(cell))) continue;
    const immediate = splitTableRow(rows[index - 1]);
    if (!immediate) continue;
    if (immediate.length !== separator.length) {
      const precedingRows = [];
      for (let distance = 1; index >= distance; distance++) {
        const preceding = splitTableRow(rows[index - distance]);
        if (!preceding) break;
        if (preceding.every((cell) => /^:?-{3,}:?$/u.test(cell))) break;
        precedingRows.unshift(preceding);
      }
      if (precedingRows.flat().some((header) =>
        isSensitiveTableHeader(header) || SENSITIVE_HEADER_FRAGMENT_RE.test(normalizeSensitiveLabel(header)))) {
        let unsafeRow = index + 1;
        while (unsafeRow < rows.length && splitTableRow(rows[unsafeRow])) {
          ambiguousSensitiveLines.add(unsafeRow++);
        }
        index = unsafeRow - 1;
      }
      continue;
    }
    let headers = immediate.map(normalizeSensitiveLabel);
    const headerBlock = [];
    let headerCursor = index - 1;
    while (headerCursor >= 0) {
      const preceding = splitTableRow(rows[headerCursor]);
      if (!preceding) break;
      if (preceding.every((cell) => /^:?-{3,}:?$/u.test(cell))) break;
      headerBlock.unshift(preceding);
      headerCursor--;
    }
    const mismatchedHeaderWidth = headerBlock.some((row) => row.length !== immediate.length);
    const candidates = [];
    for (let candidate = headerBlock.length - 1; candidate >= 0 && candidates.length < 3; candidate--) {
      if (headerBlock[candidate].length !== immediate.length) break;
      candidates.unshift(headerBlock[candidate]);
    }
    // Resolve every column independently. Different Word table columns may
    // need different reconstruction depths (for example API/Key beside
    // Benutzer/name); selecting one global depth would silently miss one.
    headers = headers.map((header, column) => {
      if (isSensitiveTableHeader(header)) return header;
      for (let count = 2; count <= candidates.length; count++) {
        const combined = normalizeSensitiveLabel(
          candidates.slice(-count).map((row) => row[column]).join(' ')
        );
        if (isSensitiveTableHeader(combined)) return combined;
      }
      return header;
    });
    const cleaned = headers.map((header) => normalizeSensitiveLabel(header.replace(/\s+\(\d+\)$/u, '')));
    const hasSensitiveHeader = cleaned.some(isSensitiveTableHeader);
    const headerHasSensitiveFragment = hasCredentialHeaderFragmentSequence(headerBlock) || headerBlock
      .flat()
      .some((header) => SENSITIVE_HEADER_FRAGMENT_RE.test(normalizeSensitiveLabel(header)));
    const unresolvedSensitiveHeader = !hasSensitiveHeader && headerHasSensitiveFragment;
    const overlongSensitiveHeader = (headerBlock.length > 3 && headerHasSensitiveFragment) ||
      (mismatchedHeaderWidth && headerHasSensitiveFragment);
    let row = index + 1;
    while (row < rows.length) {
      const cells = splitTableRow(rows[row]);
      if (!cells) break;
      if (unresolvedSensitiveHeader || overlongSensitiveHeader ||
          (hasSensitiveHeader && cells.length !== immediate.length)) {
        ambiguousSensitiveLines.add(row);
      } else if (cells.length === immediate.length) {
        headersByLine.set(row, cleaned);
      }
      row++;
    }
    index = row - 1;
  }
  return { starts, rows, headersByLine, ambiguousSensitiveLines };
}

function tableAnalysis(text) {
  const src = String(text || '');
  if (tableIndexText !== src) {
    tableIndex = buildTableIndex(src);
    tableIndexText = src;
  }
  return tableIndex;
}

function hasAmbiguousSensitiveTable(text) {
  return tableAnalysis(text).ambiguousSensitiveLines.size > 0;
}

function tableHeaderAt(text, index) {
  const src = String(text || '');
  const resolved = tableHeadersAt(src, index);
  if (!resolved) return null;
  const { line, lineStart, headers } = resolved;
  const offsetInLine = index - lineStart;
  const trimmedStart = line.length - line.trimStart().length;
  let column = 0;
  let escaped = false;
  let seenLeading = false;
  for (let i = trimmedStart; i < offsetInLine && i < line.length; i++) {
    const char = line[i];
    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '|') {
      if (!seenLeading && i === trimmedStart) seenLeading = true;
      else column++;
    }
  }
  return column < headers.length ? headers[column] : null;
}

function tableHeadersAt(text, index) {
  const src = String(text || '');
  tableAnalysis(src);
  const { starts, rows, headersByLine } = tableIndex;
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  const headers = headersByLine.get(lo);
  if (!headers) return null;
  return { headers, line: rows[lo], lineStart: starts[lo] };
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
  CONTACT_URI_RE,
  PHONE_RE,
  PHONE_LABEL_RE,
  FRENCH_PHONE_RE,
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
  identifierDetectionText,
  canonicalizeRenderedText,
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
  tableHeaderAt,
  hasAmbiguousSensitiveTable,
  normalizeSensitiveLabel,
  NAME_PARTICLE,
  NAME_PARTICLES,
  ID_LABEL_HEADER_RE,
  TABLE_ID_CELL_RE,
  CREDENTIAL_FIELD_RE,
  CREDENTIAL_LABEL_HEADER_RE,
  tableHeadersAt,
  sameLineHasIban
};
