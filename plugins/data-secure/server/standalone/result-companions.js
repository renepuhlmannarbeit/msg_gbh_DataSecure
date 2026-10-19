'use strict';

// Fixed, confidential Results payload roles. No caller-supplied sidecar path is
// ever a native write capability. Legacy exports do not consume this contract.
const crypto = require('node:crypto');
const { csvField } = require('../gateway/mapping');
const DIRECTORY = 'Vertraulich';
const FILENAME_MAPPING_PATH = `${DIRECTORY}/Dateizuordnung.csv`;
const IDENTITIES_PATH = `${DIRECTORY}/Personen-Pseudonym-Zuordnung.txt`;
const MAX_MAPPING_BYTES = 4 * 1024 * 1024;
const MAX_IDENTITY_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
const PATHS = Object.freeze({ filename_mapping: FILENAME_MAPPING_PATH, identities: IDENTITIES_PATH });
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const closed = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === fields.split(',').sort().join(',');
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const failure = () => Object.assign(Error('RESULT_COMPANIONS_INVALID'), { code: 'RESULT_COMPANIONS_INVALID' });
function validConfidentialDescriptor(value) {
  return closed(value, 'filename_mapping,identities') && Object.entries(value).every(([role, file]) =>
    closed(file, 'bytes,sha256') && Number.isSafeInteger(file.bytes) && file.bytes > 0 &&
    file.bytes <= (role === 'filename_mapping' ? MAX_MAPPING_BYTES : MAX_IDENTITY_BYTES) &&
    Array.isArray(file.sha256) && file.sha256.length === 32 &&
    file.sha256.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255));
}
function validResultCompanionFiles(files) {
  const safeName = name => typeof name === 'string' && name.isWellFormed() && name.length <= 1024 &&
    // Match the initial writer's existing relative-path contract; do not
    // impose Windows flat native-correction naming rules on macOS folders.
    name.endsWith('.md') && !/[\u0000-\u001f\u007f\\]/u.test(name) && !/^[A-Za-z]:/u.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..') &&
    name.split('/')[0].normalize('NFC').toLowerCase() !== DIRECTORY.toLowerCase();
  return Array.isArray(files) && files.length > 0 && files.length <= 200 &&
    files.every(file => closed(file, 'name,sha256') && safeName(file.name) && validHash(file.sha256)) &&
    new Set(files.map(file => file.name.normalize('NFC').toLowerCase())).size === files.length;
}
function buildFilenameMapping(sources, files) {
  if (!validResultCompanionFiles(files) || !Array.isArray(sources) || sources.length !== files.length ||
      sources.some(name => typeof name !== 'string' || !name || name.length > 1024 || !name.isWellFormed() ||
        /[\u0000-\u001f\u007f]/u.test(name))) throw failure();
  const lines = [['Originaldatei', 'Anonymisiertes Ergebnis'],
    // Preserve actual path spellings in human-readable cells. NFC folding is
    // only a collision comparison, never a rewrite of a published filename.
    ...sources.map((source, index) => [source, files[index].name])];
  const bytes = Buffer.from('\uFEFF' + lines.map(row => row.map(csvField).join(';')).join('\r\n') + '\r\n');
  if (bytes.length > MAX_MAPPING_BYTES) throw failure();
  return bytes;
}
function confidentialDescriptor(filenameMapping, identities) {
  if (!Buffer.isBuffer(filenameMapping) || !Buffer.isBuffer(identities)) throw failure();
  const descriptor = Object.fromEntries([['filename_mapping', filenameMapping], ['identities', identities]]
    .map(([role, bytes]) => [role, { bytes: bytes.length, sha256: [...Buffer.from(hash(bytes), 'hex')] }]));
  if (!validConfidentialDescriptor(descriptor)) throw failure();
  return descriptor;
}
module.exports = { DIRECTORY, FILENAME_MAPPING_PATH, IDENTITIES_PATH, PATHS, MAX_MAPPING_BYTES,
  MAX_IDENTITY_BYTES, MAX_TOTAL_BYTES, validConfidentialDescriptor, validResultCompanionFiles,
  buildFilenameMapping, confidentialDescriptor };
