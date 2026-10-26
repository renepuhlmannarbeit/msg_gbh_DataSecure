'use strict';

// Standalone-only human reference. Never infer identities from marker-looking
// source text. The caller supplies projections replayed under its control lock.
// Bodies are consumed one at a time; only bounded mapping rows survive add().
const crypto = require('node:crypto');
const { RESOURCE_LIMITS } = require('../resource-limits');
const MAX_BYTES = 16 * 1024 * 1024, MAX_OCCURRENCES = 100000;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = (code = 'DOCUMENT_REVIEW_INVALID') => Object.assign(Error(code), { code });
const closed = (value, fields) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(), expected = fields.split(',').sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
const validId = (value, size) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${size}}$`, 'u').test(value);
const normalize = text => text.normalize('NFC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-DE');
const entityFields = new Set(['occurrence_id', 'entity_id', 'kind', 'current_kind', 'original', 'replacement',
  'identity', 'identity_key', 'review_identity_key', 'source_start', 'source_end', 'output_start', 'output_end',
  'start', 'end', 'decision', 'disabled']);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 65536 && value.isWellFormed();
const quoted = value => JSON.stringify(value).replace(/[\p{Cf}\u2028\u2029]/gu,
  character => character.split('').map(unit => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''));
const uncertain = value => /UNKLAR|UNKNOWN|REDACT|REMOVED|ENTFERNT/u.test(value || '');
const family = kind => ['PERSON', 'PERSON_ALIAS'].includes(kind) ? 'PERSON' :
  ['ORG', 'ORGANIZATION', 'COMPANY', 'EMPLOYER', 'CUSTOMER'].includes(kind) ? 'ORGANIZATION' : kind === 'PROJECT' ? 'PROJECT' : null;
// Hyphens are considered only inside an already proven registry binding.
// They never establish identity across unrelated rows, files or source markers.
const fullPerson = value => normalize(value).replace(/[-‐‑]/gu, ' ').replace(/\s+/gu, ' ');
function renderConfidentialOverview(value) {
  if (!closed(value, 'schema,batch_id,confidential,ai_upload_allowed,documents') ||
      value.schema !== 'datasecure-confidential-overview/1' || !validId(value.batch_id, 64) ||
      value.confidential !== true || value.ai_upload_allowed !== false || !Array.isArray(value.documents) ||
      !value.documents.length || value.documents.length > 200 ||
      new Set(value.documents.map(document => document?.document_id)).size !== value.documents.length) throw fail();
  const lines = ['VERTRAULICH – NICHT AN KI WEITERGEBEN', 'Lokale Zuordnung tatsächlicher Ersetzungen. Keine automatische Löschung.',
    'Gilt ausschließlich für die unten genannten Dokumentrevisionen und Hashes.',
    'Ein Marker kann nur innerhalb seiner Datei eindeutig sein. Keine dokumentübergreifende Gleichheit daraus ableiten.',
    'Beibehaltene, zusätzlich maskierte, generische oder mehrdeutige Werte sind keine eindeutige Identitätszuordnung.',
    `Lauf: ${value.batch_id}`, `Standbindung: ${hash(JSON.stringify(value))}`, ''];
  let occurrenceCount = 0;
  for (const document of value.documents) {
    if (!closed(document, 'document_id,name,revision,output_sha256,trace_available,entries,excluded') ||
        !validId(document.document_id, 32) || !text(document.name) || document.name.length > 1024 ||
        /[\u0000-\u001f\u007f]/u.test(document.name) || !Number.isSafeInteger(document.revision) ||
        document.revision < 0 || document.revision > 1000 || !validId(document.output_sha256, 64) ||
        typeof document.trace_available !== 'boolean' || !Array.isArray(document.entries) || document.entries.length > 10000 ||
        !closed(document.excluded, 'kept,masked,not_identity,ambiguous') ||
        Object.values(document.excluded).some(count => !Number.isSafeInteger(count) || count < 0)) throw fail();
    occurrenceCount += Object.values(document.excluded).reduce((sum, count) => sum + count, 0);
    if (!Number.isSafeInteger(occurrenceCount) || occurrenceCount > MAX_OCCURRENCES) throw fail('DOCUMENT_REVIEW_LIMIT');
    lines.push(`Datei: ${quoted(document.name)}`, `Dokument: ${document.document_id} · Revision: ${document.revision} · SHA-256: ${document.output_sha256}`);
    if (!document.trace_available) lines.push('Keine rückverfolgbare Entitätenspur verfügbar; keine Identitäten erfunden.');
    for (const entry of document.entries) {
      if (!closed(entry, 'replacement,kind,originals,occurrences') ||
          !/^\[(?:PERSON|UNTERNEHMEN|PROJEKT|ORGANISATION|ORG)_[A-Z0-9_]{3,100}\]$/u.test(entry.replacement || '') ||
          !['PERSON', 'ORGANIZATION', 'PROJECT'].includes(entry.kind) || !Array.isArray(entry.originals) ||
          !entry.originals.length || entry.originals.length > 10000 || entry.originals.some(original => !text(original)) ||
          !Number.isSafeInteger(entry.occurrences) || entry.occurrences < 1) throw fail();
      occurrenceCount += entry.occurrences;
      if (!Number.isSafeInteger(occurrenceCount) || occurrenceCount > MAX_OCCURRENCES) throw fail('DOCUMENT_REVIEW_LIMIT');
      lines.push(`${entry.replacement} · ${entry.kind} · ${entry.occurrences} Vorkommen → ${entry.originals.map(quoted).join(' / ')}`);
    }
    lines.push(`Nicht als eindeutige Zuordnung enthalten: ${JSON.stringify(document.excluded)}`, '');
  }
  const rendered = lines.join('\n');
  if (Buffer.byteLength(rendered) + Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES) throw fail('DOCUMENT_REVIEW_LIMIT');
  return rendered;
}
function createConfidentialOverview(batchId) {
  if (!validId(batchId, 64)) throw fail();
  const documents = [], ids = new Set(); let byteBudget = 0, occurrenceCount = 0;
  function add(document) {
    if (!closed(document, 'document_id,name,revision,output_sha256,markdown,entities') ||
        !validId(document.document_id, 32) || ids.has(document.document_id) || documents.length >= 200 ||
        !text(document.name) || document.name.length > 1024 || /[\u0000-\u001f\u007f]/u.test(document.name) ||
        !Number.isSafeInteger(document.revision) || document.revision < 0 || document.revision > 1000 ||
        !validId(document.output_sha256, 64) || typeof document.markdown !== 'string' ||
        !document.markdown.isWellFormed() || document.markdown.length > RESOURCE_LIMITS.MAX_TEXT_CHARS ||
        hash(document.markdown) !== document.output_sha256 ||
        document.entities !== null && !Array.isArray(document.entities)) throw fail();
    const excluded = { kept: 0, masked: 0, not_identity: 0, ambiguous: 0 }, groups = new Map();
    const rows = document.entities || [], occurrences = new Set(), anchors = new Map();
    occurrenceCount += rows.length;
    if (occurrenceCount > MAX_OCCURRENCES) throw fail('DOCUMENT_REVIEW_LIMIT');
    for (const row of rows) {
      if (!row || Object.keys(row).some(key => !entityFields.has(key)) ||
          !/^occ_[0-9]{6}$/u.test(row.occurrence_id || '') || occurrences.has(row.occurrence_id) ||
          !/^entity_[0-9]{6}$/u.test(row.entity_id || '') || !text(row.original) || !text(row.kind) || !text(row.current_kind) ||
          !['default', 'person', 'organization', 'keep'].includes(row.decision) || typeof row.disabled !== 'boolean' ||
          !Number.isSafeInteger(row.start) || !Number.isSafeInteger(row.end) || row.start < 0 || row.end <= row.start ||
          // Disabled ranges refer to their pre-mask position and are not read.
          !row.disabled && (row.end > document.markdown.length ||
            /[\uD800-\uDBFF]/u.test(document.markdown[row.start - 1] || '') || /[\uDC00-\uDFFF]/u.test(document.markdown[row.end] || '')) ||
          ['identity', 'identity_key', 'review_identity_key'].some(key => row[key] !== undefined && !text(row[key]))) throw fail();
      occurrences.add(row.occurrence_id);
      if (!row.disabled && row.kind === 'PERSON' && row.identity_key && !uncertain(row.identity_key)) {
        if (!anchors.has(row.identity_key)) anchors.set(row.identity_key, new Set());
        const candidate = fullPerson(row.identity || row.original);
        if (candidate.split(' ').length > 1) anchors.get(row.identity_key).add(candidate);
      }
    }
    for (const row of rows) {
      if (row.disabled) { excluded.masked++; continue; }
      if (row.decision === 'keep') { excluded.kept++; continue; }
      const kind = family(row.current_kind);
      if (!kind) {
        excluded.not_identity++; continue;
      }
      const replacement = document.markdown.slice(row.start, row.end).trim();
      if (!/^\[(?:PERSON|UNTERNEHMEN|PROJEKT|ORGANISATION|ORG)_[A-Z0-9_]{3,100}\]$/u.test(replacement) ||
          uncertain(replacement) || uncertain(row.identity_key)) { excluded.ambiguous++; continue; }
      let identity = normalize(row.identity || row.original);
      if (row.identity_key || row.kind === 'PERSON_ALIAS') {
        const full = anchors.get(row.identity_key);
        if (!full || full.size !== 1) { excluded.ambiguous++; continue; }
        identity = [...full][0];
      }
      if (!groups.has(replacement)) groups.set(replacement, { kind, identities: new Set(), originals: new Set(), occurrences: 0 });
      const group = groups.get(replacement);
      group.identities.add(identity); group.originals.add(row.original); group.occurrences++;
      if (group.kind !== kind) group.identities.add('incompatible-kind');
    }
    const entries = [];
    for (const [replacement, group] of groups) {
      if (group.identities.size !== 1) { excluded.ambiguous += group.occurrences; continue; }
      if (entries.length >= 10000 || group.originals.size > 10000) throw fail('DOCUMENT_REVIEW_LIMIT');
      entries.push({ replacement, kind: group.kind,
        originals: [...group.originals].sort(), occurrences: group.occurrences });
    }
    entries.sort((a, b) => a.replacement.localeCompare(b.replacement, 'en'));
    const value = { document_id: document.document_id, name: document.name, revision: document.revision,
      output_sha256: document.output_sha256, trace_available: document.entities !== null, entries, excluded };
    byteBudget += Buffer.byteLength(JSON.stringify(value));
    if (byteBudget > MAX_BYTES / 3) throw fail('DOCUMENT_REVIEW_LIMIT');
    ids.add(document.document_id); documents.push(value);
  }
  function finish() {
    if (!documents.length) throw fail('DOCUMENT_REVIEW_MISSING');
    const value = { schema: 'datasecure-confidential-overview/1', batch_id: batchId,
      confidential: true, ai_upload_allowed: false,
      documents: [...documents].sort((a, b) => a.document_id.localeCompare(b.document_id, 'en')) };
    const binding = hash(JSON.stringify(value));
    return { value, binding_sha256: binding, text: renderConfidentialOverview(value) };
  }
  return Object.freeze({ add, finish });
}
module.exports = { createConfidentialOverview, renderConfidentialOverview, MAX_BYTES };
