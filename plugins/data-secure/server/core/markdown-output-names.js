'use strict';
const path = require('node:path');

// Source spelling stays intact; only the extension and collision suffix change.
// A comparison key is never written back into the human-readable filename.
const nameKey = name => name.normalize('NFC').toLowerCase();
function flatMarkdownOutputNames(items) {
  const used = new Set();
  return items.map(item => {
    const leaf = String(item.source_label || '').split('/').at(-1);
    const extension = path.posix.extname(leaf);
    const stem = leaf.slice(0, extension ? -extension.length : undefined) || 'Dokument';
    let occurrence = 1, name = `${stem}.md`;
    while (used.has(nameKey(name))) name = `${stem} (${++occurrence}).md`;
    used.add(nameKey(name)); return name;
  });
}
function validMarkdownLeaf(name) {
  return typeof name === 'string' && name.isWellFormed() && name.length > 3 && Buffer.byteLength(name) <= 255 &&
    name.endsWith('.md') && !/[\p{Cc}<>:"/\\|?*\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(name) &&
    !/[. ]$/u.test(name) && !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(name);
}
function validMarkdownInventory(names) {
  return Array.isArray(names) && names.length > 0 && names.length <= 200 && names.every(validMarkdownLeaf) &&
    new Set(names.map(nameKey)).size === names.length;
}
function safeMarkdownOutputNames(items) {
  const names = flatMarkdownOutputNames(items);
  const index = names.findIndex(name => !validMarkdownLeaf(name));
  if (index >= 0) throw Object.assign(new Error('DOCUMENT_EXPORT_NAME_INVALID'), {
    code: 'DOCUMENT_EXPORT_NAME_INVALID', failed_files: [{ name: items[index].source_label, reason_code: 'DOCUMENT_EXPORT_NAME_INVALID' }] });
  if (!validMarkdownInventory(names)) throw Object.assign(new Error('DOCUMENT_EXPORT_NAME_INVALID'), { code: 'DOCUMENT_EXPORT_NAME_INVALID' });
  return names;
}
module.exports = { flatMarkdownOutputNames, safeMarkdownOutputNames, validMarkdownLeaf, validMarkdownInventory };
