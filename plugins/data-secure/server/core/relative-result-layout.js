'use strict';
// Names of a new automatic correction come only from the validated private
// initial proof. This helper grants neither filesystem access nor legacy migration.
const LAYOUT = 'initial-relative/1';
const NAME_RULE = 'initial-names-reserved-confidential/1';
const MAX_FILES = 200, MAX_INITIAL_PATH_CHARS = 1024, MAX_PATH_CHARS = MAX_INITIAL_PATH_CHARS + 32, MAX_COMPONENTS = 512;
const MAX_DIRECTORIES = 6400;
const key = name => name.normalize('NFC').toLowerCase();
const device = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu;
const forbidden = /[\p{Cc}<>:"/\\|?*\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;
function validSegment(name) {
  return typeof name === 'string' && name.isWellFormed() && name.length > 0 && name !== '.' && name !== '..' &&
    Buffer.byteLength(name) <= 255 && !forbidden.test(name) && !/[. ]$/u.test(name) && !device.test(name) && key(name) !== '.ds_store';
}
function inspectRelativeNames(names, confidential = false) {
  if (!Array.isArray(names) || names.length < 1 || names.length > MAX_FILES || typeof confidential !== 'boolean') return null;
  const files = new Set(), directories = new Map();
  for (const name of names) {
    if (typeof name !== 'string' || !name.isWellFormed() || name.length > MAX_PATH_CHARS || !name.endsWith('.md')) return null;
    const parts = name.split('/');
    if (parts.length > MAX_COMPONENTS || !parts.every(validSegment) || parts.at(-1).length <= 3 ||
        confidential && key(parts[0]) === 'vertraulich') return null;
    const fileKey = key(name);
    if (files.has(fileKey)) return null;
    files.add(fileKey);
    for (let length = 1; length < parts.length; length++) {
      const directory = parts.slice(0, length).join('/'), comparison = key(directory);
      if (directories.has(comparison) && directories.get(comparison) !== directory) return null;
      directories.set(comparison, directory);
      if (directories.size > MAX_DIRECTORIES) return null;
    }
  }
  if ([...directories.keys()].some(name => files.has(name))) return null;
  const ordered = [...directories.values()].sort((a, b) => a.split('/').length - b.split('/').length ||
    Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return Object.freeze({ names: Object.freeze([...names]), directories: Object.freeze(ordered) });
}
const fail = code => { throw Object.assign(new Error(code), { code }); };
function boundInitialNames(initialFiles, selection) {
  if (!Array.isArray(initialFiles) || !Array.isArray(selection) || initialFiles.length !== selection.length ||
      initialFiles.length < 1 || initialFiles.length > MAX_FILES) fail('RESULT_PUBLICATION_CONFLICT');
  const names = new Map(), selected = new Set();
  for (const row of initialFiles) {
    if (!row || typeof row.document_id !== 'string' || !/^[a-f0-9]{32}$/u.test(row.document_id) || names.has(row.document_id) ||
        typeof row.name !== 'string' || !row.name.isWellFormed() || row.name.length > MAX_INITIAL_PATH_CHARS)
      fail('RESULT_PUBLICATION_CONFLICT');
    names.set(row.document_id, row.name);
  }
  const result = [];
  for (const row of selection) {
    if (!row || !names.has(row.document_id) || selected.has(row.document_id)) fail('RESULT_PUBLICATION_CONFLICT');
    selected.add(row.document_id); result.push(names.get(row.document_id));
  }
  return result;
}
function initialNamesForSelection(initialFiles, selection, confidential = false) {
  const names = boundInitialNames(initialFiles, selection);
  if (!inspectRelativeNames(names, confidential)) fail('DOCUMENT_EXPORT_NAME_INVALID');
  return Object.freeze(names);
}
function reserveConfidentialDirectory(names) {
  // Shared with the initial writer: only a colliding source root moves, to
  // the first deterministic unused root. No leaf or other segment changes.
  const rootNames = new Set(names.map(name => name.split('/')[0].normalize('NFC').toLowerCase()));
  let replacement = 'Vertraulich (Quelle)', index = 1;
  while (rootNames.has(replacement.normalize('NFC').toLowerCase())) replacement = `Vertraulich (Quelle ${++index})`;
  return names.map(name => {
    const segments = name.split('/');
    if (segments.length > 1 && segments[0].normalize('NFC').toLowerCase() === 'vertraulich') segments[0] = replacement;
    return segments.join('/');
  });
}
function initialResultNamePlan(initial, selection, confidential) {
  const original = boundInitialNames(initial.files, selection);
  // Only companion-free legacy initial results can still occupy this root.
  // New /2-/3 initial layouts already reserve it. Bind every real deviation
  // explicitly; this is never permission to recompute names from preferences.
  const rebase = confidential && initial.schema === 'datasecure-initial-results/1' && initial.processing_mode === 'markdown-and-anonymize';
  const allNames = rebase ? reserveConfidentialDirectory(initial.files.map(file => file.name)) : initial.files.map(file => file.name);
  const namesById = new Map(initial.files.map((file, index) => [file.document_id, allNames[index]]));
  const names = selection.map(row => namesById.get(row.document_id));
  const graph = inspectRelativeNames(names, confidential);
  if (!graph) fail('DOCUMENT_EXPORT_NAME_INVALID');
  const rebases = selection.flatMap((row, index) => names[index] === original[index] ? [] :
    [Object.freeze({ document_id: row.document_id, initial_name: original[index], result_name: names[index] })]);
  return Object.freeze({ names: Object.freeze(names), rebases: Object.freeze(rebases), directories: graph.directories });
}
module.exports = Object.freeze({ LAYOUT, NAME_RULE, MAX_FILES, MAX_INITIAL_PATH_CHARS, MAX_PATH_CHARS, MAX_COMPONENTS, MAX_DIRECTORIES,
  validSegment, inspectRelativeNames, initialNamesForSelection, initialResultNamePlan, reserveConfidentialDirectory });
