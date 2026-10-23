'use strict';

// Passive PDF.js 6.2.108 API projection, never a form executor or PDF repair.
// Page widgets and /Fields-derived records have separate identities. The API
// may internally repair missing Parents; membership here is NOT proof of the
// original raw Parent/Kids graph or of agreement with visible appearances.
const { types } = require('node:util');
const { MAX_MARKDOWN_CHARS } = require('./markdown-contract');
const { cleanExtractedSymbolText } = require('./markdown-visuals');
const { isPersonFieldLabel, CONTENT_PERSON_FIELD_POLICY } = require('../core/person-field-policy');
const { PHONE_LABEL_RE, DATE_OF_BIRTH_LABEL_RE, DE_TAX_LABEL_RE,
  ID_LABEL_HEADER_RE, CREDENTIAL_LABEL_HEADER_RE, effectiveTableFieldLabel } = require('../privacy/base');
const MAX_OBJECTS = 10000, MAX_STRING = 65536, MAX_VALUES = 256, MAX_DEPTH = 64;
const WIDGET_TYPES = new Set(['Tx', 'Ch', 'Btn']);
const FIELD_TYPES = new Set(['text', 'combobox', 'listbox', 'checkbox', 'radiobutton']);
const REF = /^[A-Za-z0-9_:-]{1,128}$/u;
const unsafe = () => { throw Object.assign(new Error('PDF_OBJECT_COVERAGE_UNVERIFIED'), { code: 'PDF_OBJECT_COVERAGE_UNVERIFIED' }); };
function record(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) unsafe();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !descriptors[key].enumerable ||
      !Object.hasOwn(descriptors[key], 'value'))) unsafe();
  return value;
}
function array(value, maximum = MAX_OBJECTS) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) unsafe();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1 ||
      Array.from({ length: value.length }, (_, index) => descriptors[index]).some(item => !item?.enumerable || !Object.hasOwn(item, 'value'))) unsafe();
  return value;
}
function string(value) {
  if (typeof value !== 'string') unsafe();
  // Check Unicode independently of the optional object's size disposition;
  // an oversized malformed string is never silently made recoverable.
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index); if (!(next >= 0xdc00 && next <= 0xdfff)) unsafe();
    } else if (unit >= 0xdc00 && unit <= 0xdfff) unsafe();
  }
  return value;
}
function reference(value) { if (typeof value !== 'string' || !REF.test(value)) unsafe(); return value; }
function rectangle(value) {
  if (value === undefined || value === null) return null;
  array(value, 4);
  if (value.length !== 4 || value.some(item => typeof item !== 'number' || !Number.isFinite(item) || Math.abs(item) > 1e9)) unsafe();
  return value.slice();
}
function actions(value) {
  if (value === undefined || value === null) return false;
  return Object.keys(record(value)).length > 0;
}
function values(value) {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? array(value, MAX_VALUES) : [value]).map(string);
}
function cell(value) {
  // This is source text in a real GFM cell. Never let source HTML, a pipe or a
  // line break manufacture a header/row. CR remains distinct from LF, and the
  // normal source-privacy literal-cell decoder sees exactly these characters.
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/\\/gu, '\\\\').replace(/\|/gu, '\\|').replace(/\r/gu, '&#13;').replace(/\n/gu, '<br>').replace(/\t/gu, '&#9;')
    .replace(/([`*\[\]_~])/gu, '\\$1');
}
const wholeLabel = regex => new RegExp(`^(?:${regex.source})$`, regex.flags.replace(/[gy]/gu, ''));
const phoneLabel = wholeLabel(PHONE_LABEL_RE), birthLabel = wholeLabel(DATE_OF_BIRTH_LABEL_RE), taxLabel = wholeLabel(DE_TAX_LABEL_RE);
const organizationLabel = /^(?:Firma|Unternehmen|Organisation|Organization|Company(?:\s+Name)?|Employer|Arbeitgeber):?$/iu;
function qualifiedFieldRole(label) {
  // ISO 32000-1:2008 12.7.3.2: a full field name consists of the real partial
  // names separated by U+002E; partial names may not contain U+002E. PDF.js
  // returns precisely that qualified API name. Inspect it BEFORE GFM escaping:
  // neither a Markdown escape nor a fullwidth/HTML dot is a PDF separator.
  // No name/value heuristic and no search for a sensitive word inside a part.
  if (!label.includes('.')) return null;
  const parts = label.split('.');
  // The same closed, idempotent ordinal-label semantics used by the actual
  // field/whole-value readers. Do not let Name (1) (2) lose its real role at
  // this producer boundary while the independent residual still knows it.
  const leaf = effectiveTableFieldLabel(parts[parts.length - 1].trim(), CONTENT_PERSON_FIELD_POLICY);
  let role = null;
  if (organizationLabel.test(leaf)) role = 'Unternehmen';
  else if (/^(?:Kunde|Kundin):?$/iu.test(leaf)) role = 'Geschützter Tabellenwert';
  else if (isPersonFieldLabel(leaf, CONTENT_PERSON_FIELD_POLICY)) role = 'Name';
  else if (phoneLabel.test(leaf)) role = 'Telefon';
  else if (birthLabel.test(leaf)) role = 'Geburtsdatum';
  else if (taxLabel.test(leaf)) role = 'Steuer-ID';
  else if (ID_LABEL_HEADER_RE.test(leaf) || CREDENTIAL_LABEL_HEADER_RE.test(leaf)) role = 'Geschützter Tabellenwert';
  if (!role) return null;
  // A broken/overdeep qualifier is not person identity authority. An actual
  // closed sensitive terminal label still requires whole-value protection.
  return parts.length > MAX_DEPTH || parts.some(part => !part.trim() || /[\u0000-\u001f\u007f]/u.test(part))
    ? 'Geschützter Tabellenwert' : role;
}
function sourceTable(label, value) {
  const role = qualifiedFieldRole(label);
  if (role) {
    // Preserve the full source field name and value each once, in distinct
    // real cells. A fixed header carries only its closed proven field role;
    // both redaction and the independent whole-value residual reader see it.
    return `| PDF-Feldname |\n| --- |\n| ${cell(label)} |\n\n| ${role} |\n| --- |\n| ${cell(value)} |`;
  }
  return `| Inhalt |\n| --- |\n| ${cell(label ? `${label}: ${value}` : value)} |`;
}
function createPassivePdfContent({ fieldObjects } = {}) {
  const canonical = new Map(), entries = [], parentOf = new Map(), seenWidgets = new Map();
  const globalReasons = new Set(), usedCanonical = new Set();
  let count = 0, chars = 0, ordinal = 0, edges = 0, renderedChars = 0;
  function block(parts, text) {
    if (renderedChars + text.length + 2 > MAX_MARKDOWN_CHARS) { globalReasons.add('TEXT_LIMIT_PARTIAL'); return false; }
    renderedChars += text.length + 2; parts.push(text); return true;
  }
  function consume(parts) {
    if (parts.some(value => value.length > MAX_STRING) || chars + parts.reduce((sum, value) => sum + value.length, 0) > MAX_MARKDOWN_CHARS) {
      globalReasons.add('TEXT_LIMIT_PARTIAL'); return false;
    }
    chars += parts.reduce((sum, value) => sum + value.length, 0); return true;
  }
  function object() {
    if (++count > MAX_OBJECTS) { globalReasons.add('CONVERSION_RESOURCE_LIMIT_PARTIAL'); return false; }
    return true;
  }
  if (fieldObjects !== null && fieldObjects !== undefined) {
    record(fieldObjects);
    const names = Object.keys(fieldObjects);
    if (names.length > MAX_OBJECTS) unsafe();
    for (const name of names) {
      string(name);
      for (const input of array(fieldObjects[name])) {
        record(input); if (!object()) break;
        const id = reference(input.id), type = input.type;
        if (typeof type !== 'string' || !Number.isInteger(input.page) || input.page < -1 || input.page >= 10000 ||
            input.password !== undefined && typeof input.password !== 'boolean') unsafe();
        const label = input.name === undefined ? name : string(input.name);
        if (input.name !== undefined && label !== name) globalReasons.add('SOURCE_COVERAGE_UNVERIFIED');
        const secret = input.password === true || type === 'signature' || type === 'button' || actions(input.actions);
        const items = secret ? [] : values(input.value);
        const rect = rectangle(input.rect), rawKids = input.kidIds === undefined ? [] : array(input.kidIds);
        let kids = [];
        if (edges + rawKids.length > MAX_OBJECTS * 2) globalReasons.add('CONVERSION_RESOURCE_LIMIT_PARTIAL');
        else { edges += rawKids.length; kids = rawKids.map(reference); }
        const item = { id, type, name: label, values: items, rect, page: input.page, kids, secret, conflict: false };
        if (canonical.has(id)) { canonical.get(id).conflict = true; item.conflict = true; globalReasons.add('SOURCE_COVERAGE_UNVERIFIED'); }
        else canonical.set(id, item);
        if (!consume([label, ...items])) { item.values = []; item.omitted = true; }
        entries.push(item);
      }
    }
    // Only actual API kidIds establish this edge; same names or strings do
    // not. A missing, repeated or cyclic edge cannot establish ownership.
    for (const entry of entries) for (const kid of entry.kids) {
      if (!canonical.has(kid) || parentOf.has(kid)) { entry.conflict = true; globalReasons.add('SOURCE_COVERAGE_UNVERIFIED'); }
      else parentOf.set(kid, entry.id);
    }
    for (const entry of entries) {
      let id = entry.id, depth = 0; const visited = new Set();
      while (parentOf.has(id)) {
        if (++depth > MAX_DEPTH || visited.has(id)) { entry.conflict = true; globalReasons.add('SOURCE_COVERAGE_UNVERIFIED'); break; }
        visited.add(id); id = parentOf.get(id);
      }
    }
  }
  function relation(id, field, pageNumber) {
    const reasons = new Set();
    let text = `PDF-Objekt ${id}; Seite ${pageNumber}`;
    if (field) {
      usedCanonical.add(id);
      text += '; im API-Feldbaum enthalten';
      if (field.conflict || field.page >= 0 && field.page !== pageNumber - 1) reasons.add('SOURCE_COVERAGE_UNVERIFIED');
      if (parentOf.has(id)) text += `; API-Elternobjekt ${parentOf.get(id)}`;
    } else { text += '; keine eindeutige Zuordnung zum API-Feldbaum'; reasons.add('SOURCE_COVERAGE_UNVERIFIED'); }
    return { text, reasons };
  }
  function output(parts, label, items, title) {
    let meaningful = false;
    for (const value of items) if (value.length && block(parts, `### ${title}\n\n${sourceTable(label, value)}`)) meaningful ||= Boolean(value.trim());
    return meaningful;
  }
  function readPage({ annotations, pageNumber } = {}) {
    if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber > 10000) unsafe();
    array(annotations);
    const parts = [], reasons = new Set(globalReasons); let meaningful = false, omittedObjects = false;
    for (const input of annotations) {
      record(input); if (!object()) { reasons.add('CONVERSION_RESOURCE_LIMIT_PARTIAL'); break; }
      const id = reference(input.id), subtype = input.subtype;
      if (subtype === undefined || subtype === null) { reasons.add('SOURCE_COVERAGE_UNVERIFIED'); omittedObjects = true; continue; }
      if (typeof subtype !== 'string') unsafe();
      for (const key of ['password', 'pushButton', 'radioButton', 'checkBox', 'hasAppearance'])
        if (input[key] !== undefined && typeof input[key] !== 'boolean') unsafe();
      if (input.fieldFlags !== undefined && (!Number.isInteger(input.fieldFlags) || input.fieldFlags < 0)) unsafe();
      if (subtype !== 'Widget' && subtype !== 'Text' && subtype !== 'FreeText') {
        // Link/action/attachment/signature/media payloads are never copied.
        reasons.add('SOURCE_COVERAGE_UNVERIFIED'); omittedObjects = true; continue;
      }
      const rect = rectangle(input.rect);
      if (seenWidgets.has(id)) {
        // The same object appearing on two pages is a real repeated use, not
        // permission to drop it or associate it with the first page instead.
        reasons.add('SOURCE_COVERAGE_UNVERIFIED');
      }
      seenWidgets.set(id, pageNumber);
      const position = rect ? `; Rechteck [${rect.join(', ')}]` : '; Rechteck unbekannt';
      const field = subtype === 'Widget' ? canonical.get(id) : null;
      if (subtype === 'Widget') {
        if (input.fieldType === 'Sig' || input.password === true || (Number.isInteger(input.fieldFlags) && (input.fieldFlags & 8192)) ||
            input.pushButton === true || field?.secret || actions(input.actions)) {
          if (field) usedCanonical.add(id);
          reasons.add('SOURCE_COVERAGE_UNVERIFIED'); omittedObjects = true; continue;
        }
        if (!WIDGET_TYPES.has(input.fieldType)) { reasons.add('SOURCE_COVERAGE_UNVERIFIED'); omittedObjects = true; continue; }
        const label = input.fieldName === undefined ? '' : string(input.fieldName), items = values(input.fieldValue);
        let appearance = input.textContent === undefined ? [] : array(input.textContent, MAX_VALUES).map(string);
        if (!consume([label, ...items, ...appearance])) { reasons.add('TEXT_LIMIT_PARTIAL'); continue; }
        const related = relation(id, field, pageNumber); for (const reason of related.reasons) reasons.add(reason);
        let conflict = field?.conflict || Boolean(field && (field.page >= 0 && field.page !== pageNumber - 1 ||
          field.rect && rect && JSON.stringify(field.rect) !== JSON.stringify(rect)));
        const compare = input.fieldType === 'Ch' ? items.slice(0, 1) : items;
        if (field && (field.name !== label || JSON.stringify(field.values) !== JSON.stringify(compare))) conflict = true;
        if (!block(parts, `## PDF-Formularfeld ${++ordinal}\n\n${related.text}${position}.`)) continue;
        if (conflict) {
          block(parts, '> Hinweis: API-Feldbaum und Seitenwidget stimmen nicht eindeutig überein. Die Quellstände werden getrennt wiedergegeben.');
          reasons.add('SOURCE_COVERAGE_UNVERIFIED');
          if (field && !field.secret) meaningful = output(parts, field.name, field.values, 'Wert im API-Feldbaum') || meaningful;
        }
        meaningful = output(parts, label, items, 'Feldstand des Seitenwidgets') || meaningful;
        if (input.fieldType === 'Ch' && input.options !== undefined) {
          // Preserve only labels belonging to actual selected export values.
          // Never emit all options or guess a selection from the first item.
          for (const option of array(input.options, MAX_OBJECTS)) {
            if (!object()) { reasons.add('CONVERSION_RESOURCE_LIMIT_PARTIAL'); break; }
            record(option); const exported = string(option.exportValue), displayed = string(option.displayValue);
            if (items.includes(exported) && exported !== displayed && consume([displayed])) {
              meaningful = output(parts, label, [displayed], 'Beschriftung des gewählten Werts') || meaningful;
            }
          }
        }
        if (input.fieldType === 'Btn') {
          const option = input.radioButton ? input.buttonValue : input.checkBox ? input.exportValue : undefined;
          if (option !== undefined && option !== null) {
            string(option);
            if (consume([option])) output(parts, label, [option], 'Beschriftung dieser Schaltoption');
          }
        }
        if (appearance.length) {
          const raw = appearance.join('\n'), cleaned = cleanExtractedSymbolText(raw);
          if (cleaned.omitted) reasons.add('VISUAL_CONTENT_NOT_EXTRACTED');
          // Equality is scoped to this exact widget/AP representation only.
          // Equal text elsewhere or in a second widget remains a real use.
          if (cleaned.text && cleaned.text !== items.join('\n')) {
            block(parts, '> Hinweis: Gespeicherter Feldstand und ausgelesener Darstellungstext unterscheiden sich. Die Darstellung kann veraltet oder unvollständig sein.');
            meaningful = output(parts, label, [cleaned.text], 'Text der gespeicherten Darstellung') || meaningful;
            reasons.add('SOURCE_COVERAGE_UNVERIFIED');
          }
        } else if (input.hasAppearance) {
          block(parts, '> Hinweis: Die gespeicherte Darstellung enthält keinen unabhängig ausgelesenen Text. Ihr Inhalt ist nicht als übereinstimmend bestätigt.');
          reasons.add('VISUAL_CONTENT_NOT_EXTRACTED');
        }
      } else {
        // RichText/HTML, links and appearance execution are not text authority.
        const contents = input.contentsObj === undefined ? '' : string(record(input.contentsObj).str);
        const author = input.titleObj === undefined ? '' : string(record(input.titleObj).str);
        const appearance = input.textContent === undefined ? [] : array(input.textContent, MAX_VALUES).map(string);
        if (!consume([contents, author, ...appearance])) { reasons.add('TEXT_LIMIT_PARTIAL'); continue; }
        if (!block(parts, `## PDF-${subtype === 'Text' ? 'Kommentar' : 'Freitext'} ${++ordinal}\n\nPDF-Objekt ${id}; Seite ${pageNumber}${position}.`)) continue;
        if (author) meaningful = output(parts, 'Autor', [author], 'Kommentarautor') || meaningful;
        meaningful = output(parts, '', contents ? [contents] : [], 'Gespeicherter Text') || meaningful;
        const actual = cleanExtractedSymbolText(appearance.join('\n'));
        if (actual.omitted) reasons.add('VISUAL_CONTENT_NOT_EXTRACTED');
        if (actual.text && actual.text !== contents) {
          block(parts, '> Hinweis: Kommentarinhalt und ausgelesener Darstellungstext unterscheiden sich; beide Quellangaben bleiben getrennt.');
          meaningful = output(parts, '', [actual.text], 'Text der gespeicherten Darstellung') || meaningful; reasons.add('SOURCE_COVERAGE_UNVERIFIED');
        }
      }
    }
    if (omittedObjects) block(parts, '> PDF-Hinweis: Geschützte, aktive oder nicht unterstützte PDF-Objekte wurden nicht übernommen. Aktionen, Links und Anhänge wurden nicht als Dokumenttext ausgeführt oder nachgeladen.');
    for (const reason of globalReasons) reasons.add(reason);
    return Object.freeze({ markdown: parts.join('\n\n'), meaningful,
      reason_codes: Object.freeze([...reasons].sort()) });
  }
  function finalize() {
    const parts = [], reasons = new Set(globalReasons); let meaningful = false;
    for (const entry of entries) {
      if (usedCanonical.has(entry.id) || !FIELD_TYPES.has(entry.type) || entry.secret || !entry.values.some(value => value.trim())) continue;
      if (!block(parts, `## PDF-Feld ohne bestätigten Seitenwidgetbezug ${++ordinal}\n\nPDF-Objekt ${entry.id}; API-Seitenindex ${entry.page}.`)) continue;
      block(parts, '> Hinweis: Dieser gespeicherte API-Feldstand ist keinem gelesenen Seitenwidget eindeutig zugeordnet. Die ursprüngliche Parent/Kids-Beziehung ist damit nicht bestätigt.');
      meaningful = output(parts, entry.name, entry.values, 'Wert im API-Feldbaum') || meaningful;
      reasons.add('SOURCE_COVERAGE_UNVERIFIED');
    }
    for (const reason of globalReasons) reasons.add(reason);
    return Object.freeze({ markdown: parts.join('\n\n'), meaningful, reason_codes: Object.freeze([...reasons].sort()) });
  }
  return Object.freeze({ readPage, finalize });
}
module.exports = Object.freeze({ createPassivePdfContent, MAX_OBJECTS, MAX_STRING, MAX_VALUES, MAX_DEPTH });
