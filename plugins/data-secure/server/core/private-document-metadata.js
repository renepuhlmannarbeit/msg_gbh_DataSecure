'use strict';

const SCHEMA = 'datasecure-private-document-metadata/1';
const PDF_KEYS = Object.freeze(['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate', 'Trapped', 'Custom']);
const MAX_VALUE_CHARS = 4096;
const MAX_TOTAL_BYTES = 64 * 1024;
function invalid() { throw Object.assign(new Error('PRIVATE_DOCUMENT_METADATA_INVALID'), { code: 'PRIVATE_DOCUMENT_METADATA_INVALID' }); }
function exact(value, fields) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  return keys.length === fields.length && keys.every(key => typeof key === 'string' && fields.includes(key) &&
    descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value'));
}
function utf8Size(text) {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid();
      bytes += 4;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) invalid();
    else bytes += unit < 0x80 ? 1 : unit < 0x800 ? 2 : 3;
  }
  return bytes;
}
// Private source-bearing data: never spread into a Markdown artifact, export,
// diagnosis or model response. Only an explicitly private document consumer may
// retain this closed record. Plain strings render locally as text, not HTML.
function validatePrivateDocumentMetadata(value) {
  if (!exact(value, ['schema', 'source_type', 'entries']) || value.schema !== SCHEMA || value.source_type !== 'pdf' ||
      !Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > PDF_KEYS.length) invalid();
  const entryDescriptors = Object.getOwnPropertyDescriptors(value.entries);
  if (Object.getPrototypeOf(value.entries) !== Array.prototype || Reflect.ownKeys(entryDescriptors).length !== value.entries.length + 1 ||
      Array.from({ length: value.entries.length }, (_, index) => String(index)).some(key =>
        !entryDescriptors[key]?.enumerable || !Object.hasOwn(entryDescriptors[key], 'value'))) invalid();
  let bytes = 0;
  const seen = new Set(), entries = [];
  for (let index = 0; index < value.entries.length; index++) {
    const entry = entryDescriptors[String(index)].value;
    if (!exact(entry, ['key', 'value']) || !PDF_KEYS.includes(entry.key) || seen.has(entry.key) ||
        typeof entry.value !== 'string' || !entry.value.length || entry.value.length > MAX_VALUE_CHARS) invalid();
    bytes += utf8Size(entry.key) + utf8Size(entry.value);
    if (bytes > MAX_TOTAL_BYTES) invalid();
    seen.add(entry.key);
    entries.push(Object.freeze({ key: entry.key, value: entry.value }));
  }
  return Object.freeze({ schema: SCHEMA, source_type: 'pdf', entries: Object.freeze(entries) });
}
module.exports = Object.freeze({ SCHEMA, PDF_KEYS, MAX_VALUE_CHARS, MAX_TOTAL_BYTES, validatePrivateDocumentMetadata });
