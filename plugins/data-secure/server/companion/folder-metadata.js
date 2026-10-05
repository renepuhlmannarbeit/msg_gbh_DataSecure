'use strict';

// Recognition, not a converter: narrow bounded metadata structures only. The
// caller opts in for Standalone folder admission after rejecting links. Unknown
// or malformed files (even with these names) remain unsupported and are named.
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
function metadataName(name) { return /^(?:\.DS_Store|desktop\.ini|Thumbs\.db)$/iu.test(name); }

function desktopIni(buffer) {
  if (buffer.length > 8192) return false;
  let text;
  if (buffer[0] === 0xff && buffer[1] === 0xfe) text = buffer.subarray(2).toString('utf16le');
  else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const bytes = Buffer.from(buffer.subarray(2));
    if (bytes.length % 2) return false;
    bytes.swap16(); text = bytes.toString('utf16le'); bytes.fill(0);
  } else text = buffer.toString('utf8').replace(/^\uFEFF/u, '');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\uFFFD]/u.test(text)) return false;
  const sections = {
    '.shellclassinfo': /^(?:iconresource|iconfile|iconindex|infotip|localizedresourcename|confirmfileop|nosharing|uiclsid|clsid|clsid2)$/iu,
    viewstate: /^(?:mode|vid|foldertype)$/iu,
    localizedfilenames: /^[^=\[\]\\/\u0000-\u001f]{1,255}$/u
  };
  let section, values = 0;
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    const heading = line.match(/^\[([^\]]+)\]$/u);
    if (heading) { section = heading[1].toLowerCase(); if (!sections[section]) return false; continue; }
    const pair = line.match(/^([^=]+)=(.*)$/u);
    if (!pair || !section || !sections[section].test(pair[1].trim())) return false;
    values++;
  }
  return values > 0;
}

function dsStore(buffer) {
  if (buffer.length < 36 || buffer.readUInt32BE(0) !== 1 || buffer.toString('ascii', 4, 8) !== 'Bud1') return false;
  const offset = buffer.readUInt32BE(8), size = buffer.readUInt32BE(12);
  if (offset !== buffer.readUInt32BE(16) || offset < 32 || size < 12 || offset + 4 + size > buffer.length) return false;
  const root = buffer.subarray(offset + 4, offset + 4 + size);
  const count = root.readUInt32BE(0);
  if (count < 2 || count > 16384) return false;
  const tableEnd = 8 + Math.ceil(count / 256) * 1024;
  if (tableEnd + 4 > root.length) return false;
  const tocCount = root.readUInt32BE(tableEnd);
  if (tocCount !== 1) return false;
  let cursor = tableEnd + 4;
  if (root[cursor++] !== 4 || cursor + 8 > root.length || root.toString('ascii', cursor, cursor + 4) !== 'DSDB') return false;
  cursor += 4;
  const blockIndex = root.readUInt32BE(cursor); cursor += 4;
  if (blockIndex < 1 || blockIndex >= count) return false;
  const address = root.readUInt32BE(8 + blockIndex * 4);
  const width = address & 31, blockOffset = address - width;
  if (width < 5 || width > 23 || blockOffset + 4 + 2 ** width > buffer.length) return false;
  // A DSDB superblock stores five integers, with a 4 KiB B-tree page size.
  if (buffer.readUInt32BE(blockOffset + 20) !== 4096) return false;
  for (let index = 0; index < 32; index++) {
    if (cursor + 4 > root.length) return false;
    const freeCount = root.readUInt32BE(cursor); cursor += 4;
    if (freeCount > 16384 || cursor + freeCount * 4 > root.length) return false;
    cursor += freeCount * 4;
  }
  return true;
}

function thumbsDb(buffer) {
  const magic = 'd0cf11e0a1b11ae1';
  if (buffer.length < 1536 || buffer.subarray(0, 8).toString('hex') !== magic || buffer.readUInt16LE(28) !== 0xfffe) return false;
  const major = buffer.readUInt16LE(26), shift = buffer.readUInt16LE(30);
  if (!((major === 3 && shift === 9) || (major === 4 && shift === 12)) || buffer.readUInt16LE(32) !== 6) return false;
  const size = 2 ** shift, count = buffer.length / size - 1;
  if (!Number.isInteger(count) || count < 2) return false;
  const fatCount = buffer.readUInt32LE(44);
  // Larger external DIFAT chains are deliberately not recognised here.
  if (fatCount < 1 || fatCount > 109 || buffer.readUInt32LE(72) !== 0) return false;
  const fat = [];
  const fatSectors = new Set();
  for (let index = 0; index < fatCount; index++) {
    const sector = buffer.readUInt32LE(76 + index * 4);
    if (sector >= count || fatSectors.has(sector)) return false;
    fatSectors.add(sector);
    const start = (sector + 1) * size;
    for (let cursor = start; cursor < start + size; cursor += 4) fat.push(buffer.readUInt32LE(cursor));
  }
  let sector = buffer.readUInt32LE(48), entries = 0, roots = 0, catalogs = 0, thumbnails = 0;
  const visited = new Set();
  const names = new Set();
  while (sector !== 0xfffffffe) {
    if (sector >= count || sector >= fat.length || fatSectors.has(sector) || visited.has(sector) || visited.size > 128) return false;
    visited.add(sector);
    const start = (sector + 1) * size;
    for (let cursor = start; cursor < start + size; cursor += 128) {
      const type = buffer[cursor + 66];
      if (!type) continue;
      const length = buffer.readUInt16LE(cursor + 64);
      if (length < 2 || length > 64 || length % 2 || buffer.readUInt16LE(cursor + length - 2) !== 0) return false;
      const name = buffer.toString('utf16le', cursor, cursor + length - 2);
      if (names.has(name)) return false;
      names.add(name); entries++;
      if (type === 5 && name === 'Root Entry' && entries === 1) roots++;
      else if (type === 2 && name === 'Catalog') catalogs++;
      else if (type === 2 && /^[0-9]{1,20}$/u.test(name)) thumbnails++;
      else return false;
    }
    sector = fat[sector];
  }
  return roots === 1 && catalogs === 1 && thumbnails > 0;
}

function metadataReason(name, buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_METADATA_BYTES) return null;
  try {
    if (/^desktop\.ini$/iu.test(name) && desktopIni(buffer)) return 'os_folder_metadata';
    if (name === '.DS_Store' && dsStore(buffer)) return 'os_folder_metadata';
    if (/^Thumbs\.db$/iu.test(name) && thumbsDb(buffer)) return 'os_folder_metadata';
  } catch { /* malformed metadata remains an explicitly unsupported source */ }
  return null;
}
module.exports = { MAX_METADATA_BYTES, metadataName, metadataReason };
