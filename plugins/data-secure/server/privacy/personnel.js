'use strict';

const { normalizeSpaces, key, hashShort, isStopToken, titleCase, looksName, IBAN_RE } = require('./base');
const { collectOrganizations, markdownTableColumnValues, markdownTableCells } = require('./entities');
const { credentialContextSpans } = require('./credentials');

const EMPLOYER_LABEL = '(?:Unternehmen|Arbeitgeber|Firma|Aktueller\\s+Arbeitgeber|Entsendendes\\s+Unternehmen|Company|Entreprise|Employeur|Société|Empresa|Empleador|Compañía|Bedrijf|Werkgever)';
const CUSTOMER_LABEL = '(?:Kunde|Kundenunternehmen|Projektkunde|Auftraggeber|Client|Cliente|Klant)';
const LOCATION_LABEL =
  '(?:Standort(?:\\s+des\\s+Projekts)?|Projektstandort|Einsatzort|Dienstort|Wohnort|Wohnsitz|Adresse|Anschrift|Ort)';

// Markdown prefixes must survive de-identification. The previous line rules ran
// as multiline regexes over the whole document, so "### HanseCargo AG – Projekt
// Orion" lost its heading marker and "Standort des Projekts:" was not matched
// at all because the label regex was anchored to a bare "Standort:".
const PREFIX_RE = /^(\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)?)([\s\S]*)$/u;
const ORG_SHAPE_RE = /^[A-Z0-9ÄÖÜ][A-Za-z0-9ÄÖÜäöüß .&'’+\-/]{2,50}$/u;
const DOMAIN_SHAPE_RE = /^[a-z0-9][a-z0-9.\-]+\.(?:de|com|net|org|eu)$/i;
const PROFESSIONAL_ROLE_RE = /^(?:(?:Senior\s+|Lead\s+)?(?:Product\s+Owner|Scrum\s+Master|Softwareentwickler(?:in)?|Entwickler(?:in)?|Testmanager(?:in)?|Tester(?:in)?|Business\s+Analyst(?:in)?|QA\s+Engineer|IT-?Projektleiter(?:in)?|IT-?Projektleitung|FHIR-Entwickler(?:in)?))$/iu;

const TABLE_EMPLOYER_RE = new RegExp(`^(\\|\\s*${EMPLOYER_LABEL}\\s*:?\\s*\\|\\s*)([^|\\n]+)(\\|)`, 'iu');
const TABLE_CUSTOMER_RE = new RegExp(`^(\\|\\s*${CUSTOMER_LABEL}\\s*:?\\s*\\|\\s*)([^|\\n]+)(\\|)`, 'iu');
const TABLE_LOCATION_RE = new RegExp(`^(\\|\\s*${LOCATION_LABEL}\\s*:?\\s*\\|\\s*)([^|\\n]+)(\\|)`, 'iu');
const LINE_EMPLOYER_RE = new RegExp(`^(\\s*${EMPLOYER_LABEL}\\s*:\\s*)(.+)$`, 'iu');
const LINE_CUSTOMER_RE = new RegExp(`^(\\s*${CUSTOMER_LABEL}\\s*:\\s*)(.+)$`, 'iu');
const LINE_LOCATION_RE = new RegExp(`^(\\s*${LOCATION_LABEL}\\s*:\\s*)(.+)$`, 'iu');
const DASH_SPLIT_RE = /^(.{2,120}?)[ \t]+[–—-][ \t]+(.{3,180})$/u;

const EMPLOYER_PLACEHOLDER = '[ARBEITGEBER_001]';
const LOCATION_PLACEHOLDER = '[LOCATION_REDACTED]';

function hasStopToken(value) {
  return normalizeSpaces(value).split(/\s+/).some(isStopToken);
}

function containsIban(value) {
  IBAN_RE.lastIndex = 0;
  return IBAN_RE.test(String(value || ''));
}

function rememberLocation(reg, value) {
  const clean = normalizeSpaces(value);
  if (!clean) return;
  reg.locations.push(clean);
  const withoutParens = clean.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (withoutParens && withoutParens !== clean) reg.locations.push(withoutParens);
  // "Hamburg, Speicherstraße 12" also has to remove the bare city later on.
  for (const part of clean.split(',')) {
    const p = part.trim();
    if (p.length >= 3) reg.locations.push(p);
  }
}

function registerEmployer(reg, findings, value) {
  const clean = normalizeSpaces(value);
  if (!clean) return null;
  findings.push({ type: 'EMPLOYER', value_hash: hashShort(clean) });
  for (const org of collectOrganizations(clean)) reg.map.set(`ORG:${key(org)}`, EMPLOYER_PLACEHOLDER);
  reg.map.set(`ORG:${key(clean)}`, EMPLOYER_PLACEHOLDER);
  return EMPLOYER_PLACEHOLDER;
}

function registerCustomer(reg, findings, value) {
  const clean = normalizeSpaces(value);
  if (!clean) return null;
  const placeholder = reg.assign('CUSTOMER', clean);
  findings.push({ type: 'CUSTOMER', value_hash: hashShort(clean) });
  for (const org of collectOrganizations(clean)) reg.map.set(`ORG:${key(org)}`, placeholder);
  reg.map.set(`ORG:${key(clean)}`, placeholder);
  return placeholder;
}

function looksLikeOrgSide(value, personKeys) {
  const clean = normalizeSpaces(value);
  if (!clean) return false;
  if (PROFESSIONAL_ROLE_RE.test(clean)) return false;
  if (clean.includes(':')) return false;
  if (personKeys.has(key(clean))) return false;
  if (collectOrganizations(clean).length > 0) return true;
  if (looksName(titleCase(clean)) && personKeys.has(key(titleCase(clean)))) return false;
  if (hasStopToken(clean)) return false;
  return ORG_SHAPE_RE.test(clean) || DOMAIN_SHAPE_RE.test(clean);
}

function anonymizePersonnel(text, reg, findings, personKeys = new Set()) {
  const out = [];
  const ranges = credentialContextSpans(text);
  // CSV sources are rendered as multi-column Markdown tables. Register the
  // labelled values up front so the normal literal pass can redact the cells
  // without mistaking adjacent certificate cells for the same context.
  for (const value of markdownTableColumnValues(text, new RegExp(`^${EMPLOYER_LABEL}:?$`, 'iu'))) {
    registerEmployer(reg, findings, value);
  }
  for (const value of markdownTableColumnValues(text, new RegExp(`^${CUSTOMER_LABEL}:?$`, 'iu'))) {
    registerCustomer(reg, findings, value);
  }
  for (const value of markdownTableColumnValues(text, new RegExp(`^${LOCATION_LABEL}:?$`, 'iu'))) {
    rememberLocation(reg, value);
    findings.push({ type: 'LOCATION', value_hash: hashShort(value) });
  }
  let lineOffset = 0;
  let projectSection = false;
  let professionalSection = false;

  const allLines = String(text).split('\n');
  for (let lineIndex = 0; lineIndex < allLines.length; lineIndex++) {
    const rawLine = allLines[lineIndex];
    const lineEnd = lineOffset + rawLine.length;
    const credentialLine = ranges.some((r) => lineOffset < r.end && r.start < lineEnd);
    lineOffset = lineEnd + 1;
    let line = rawLine;
    const cells = markdownTableCells(rawLine);
    const nextCells = markdownTableCells(allLines[lineIndex + 1] || '');
    if (cells && nextCells && cells.length === nextCells.length &&
        nextCells.every((cell) => /^:?-{3,}:?$/u.test(cell))) {
      // A column header is not the key/value field "Arbeitgeber | value".
      // Keeping it also preserves the separate credential column ranges.
      out.push(line);
      continue;
    }

    const tableEmployer = line.match(TABLE_EMPLOYER_RE);
    if (tableEmployer) {
      const ph = registerEmployer(reg, findings, tableEmployer[2]);
      if (ph) {
        out.push(line.replace(TABLE_EMPLOYER_RE, `$1${ph} $3`));
        continue;
      }
    }

    const tableCustomer = line.match(TABLE_CUSTOMER_RE);
    if (tableCustomer) {
      const ph = registerCustomer(reg, findings, tableCustomer[2]);
      if (ph) {
        out.push(line.replace(TABLE_CUSTOMER_RE, `$1${ph} $3`));
        continue;
      }
    }

    const tableLocation = line.match(TABLE_LOCATION_RE);
    if (tableLocation) {
      rememberLocation(reg, tableLocation[2]);
      findings.push({ type: 'LOCATION', value_hash: hashShort(tableLocation[2]) });
      out.push(line.replace(TABLE_LOCATION_RE, `$1${LOCATION_PLACEHOLDER} $3`));
      continue;
    }

    const lineEmployer = line.match(LINE_EMPLOYER_RE);
    if (lineEmployer) {
      const ph = registerEmployer(reg, findings, lineEmployer[2]);
      if (ph) {
        out.push(lineEmployer[1] + ph);
        continue;
      }
    }

    const lineCustomer = line.match(LINE_CUSTOMER_RE);
    if (lineCustomer) {
      const ph = registerCustomer(reg, findings, lineCustomer[2]);
      if (ph) {
        out.push(lineCustomer[1] + ph);
        continue;
      }
    }

    const lineLocation = line.match(LINE_LOCATION_RE);
    if (lineLocation) {
      rememberLocation(reg, lineLocation[2]);
      findings.push({ type: 'LOCATION', value_hash: hashShort(lineLocation[2]) });
      out.push(lineLocation[1] + LOCATION_PLACEHOLDER);
      continue;
    }

    const [, prefix, content] = line.match(PREFIX_RE);
    const sectionTitle = content.trim().replace(/:$/u, '');
    if (/^(?:Projekterfahrung|Berufserfahrung|Projekte|Projects?|Experience|Employment)$/iu.test(sectionTitle)) {
      projectSection = true;
      professionalSection = false;
    } else if (/^(?:Kenntnisse|Skillset|Skills?|Kompetenzen|Technologien|Technologies|Standards?|Methoden|Zertifizierungen|Zertifikate|Ausbildung)$/iu.test(sectionTitle)) {
      projectSection = false;
      professionalSection = true;
    } else if (/^\s*#{1,6}\s/u.test(rawLine)) {
      projectSection = false;
      professionalSection = false;
    }

    // "<Customer> – <Project>" project headings.
    const dash = credentialLine || professionalSection ? null : content.match(DASH_SPLIT_RE);
    if (dash) {
      const left = normalizeSpaces(dash[1]);
      const right = normalizeSpaces(dash[2]);
      // Only the left side is gated: a project name legitimately starts with
      // "Projekt", so a stop-token check on the right would skip the rule.
      if (looksLikeOrgSide(left, personKeys) && right.length >= 3) {
        const customer = reg.assign('CUSTOMER', left);
        const project = reg.assign('PROJECT', right);
        reg.map.set(`ORG:${key(left)}`, customer);
        findings.push(
          { type: 'CUSTOMER', value_hash: hashShort(left) },
          { type: 'PROJECT', value_hash: hashShort(right) }
        );
        out.push(`${prefix}${customer} – ${project}`);
        continue;
      }
    }

    // A bare organisation line inside a project block is the customer.
    if (!credentialLine && !prefix.trim() && content.trim() && content.length <= 100) {
      const s = normalizeSpaces(content);
      if (!s.startsWith('[') && !s.includes('|') && !containsIban(s) && looksLikeOrgSide(s, personKeys)) {
        const legalOrganizations = collectOrganizations(s);
        const isCapsOrLegal =
          // A role sentence can contain a legal-form company ("Testmanager
          // für Beispiel GmbH") but must not itself become the customer.
          // Only an exact standalone organisation is eligible for this rule.
          legalOrganizations.some((organization) => key(organization) === key(s)) ||
          DOMAIN_SHAPE_RE.test(s) ||
          (projectSection && /^[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9 .&+\-]{2,40}$/u.test(s));
        if (isCapsOrLegal) {
          const customer = reg.assign('CUSTOMER', s);
          reg.map.set(`ORG:${key(s)}`, customer);
          findings.push({ type: 'CUSTOMER', value_hash: hashShort(s) });
          out.push(prefix + customer);
          continue;
        }
      }
    }

    out.push(line);
  }

  // Business periods are substantive content. Only dates explicitly labelled
  // as birth dates are removed by the structured-identifier pass.
  return out.join('\n');
}

module.exports = { anonymizePersonnel, looksLikeOrgSide, hasStopToken };
