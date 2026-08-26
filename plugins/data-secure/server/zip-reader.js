'use strict';

const fs = require('fs');
const zlib = require('zlib');

class ZipError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ZipError';
    if (code) this.code = code;
  }
}

function encryptedEntryError() {
  return new ZipError('Verschlüsselte ZIP-Einträge werden nicht unterstützt.', 'ZIP_ENCRYPTED_ENTRY');
}

const CFB_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function encryptedOfficeContainerError() {
  return new ZipError('Verschlüsselte Office-Container werden nicht unterstützt.', 'OOXML_ENCRYPTED_CONTAINER');
}

function rejectEncryptedOfficeContainer(buf) {
  // ECMA-376 encrypted Office files are Compound File Binary (CFB/OLE), not
  // ZIP/OPC packages. Recognize the container signature before looking for a
  // ZIP end record, so the caller can stop clearly without parsing metadata.
  if (buf.length >= CFB_SIGNATURE.length && buf.subarray(0, CFB_SIGNATURE.length).equals(CFB_SIGNATURE)) {
    throw encryptedOfficeContainerError();
  }
}

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function findEocd(buf) {
  const sig = 0x06054b50;
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === sig) return i;
  }
  throw new ZipError('ZIP-Endverzeichnis nicht gefunden.');
}

// This is deliberately a directory-only inspection.  Callers that need file
// bytes must still use readZip(), which validates every local header, inflates
// with bounded output and checks CRCs.  The preflight is useful before a
// private batch snapshot: it rejects impossible or oversized OOXML containers
// without decompressing raw document content or writing a work copy.
function inspectZipDirectory(buf, limits={}) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  rejectEncryptedOfficeContainer(buf);
  const maxEntries = limits.maxEntries || 20000;
  const maxUncompressed = limits.maxUncompressed || 300 * 1024 * 1024;
  const eocd = findEocd(buf);
  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (totalEntries > maxEntries) throw new ZipError('ZIP enthält zu viele Einträge.', 'ZIP_LIMIT');
  if (cdOffset + cdSize > buf.length) throw new ZipError('ZIP-Zentralverzeichnis ungültig.');

  const cdEnd = cdOffset + cdSize;
  const names = new Set();
  let p = cdOffset;
  let total = 0;
  let files = 0;
  for (let n=0; n<totalEntries; n++) {
    if (p + 46 > cdEnd || buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError('ZIP-Zentralverzeichnis beschädigt.');
    const flags = buf.readUInt16LE(p + 8);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    if (p + 46 + nameLen + extraLen + commentLen > cdEnd) throw new ZipError('ZIP-Zentralverzeichnis abgeschnitten.');
    if (flags & (1 | 0x40 | 0x2000)) throw encryptedEntryError();
    if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOffset === 0xffffffff) throw new ZipError('ZIP64 wird nicht unterstützt.');
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8').replace(/\\/g,'/');
    p += 46 + nameLen + extraLen + commentLen;
    if (!name || name.endsWith('/')) continue;
    if (name.startsWith('/') || name.includes('../')) throw new ZipError('Unsicherer ZIP-Pfad erkannt.');
    if (names.has(name)) throw new ZipError('ZIP enthält einen mehrdeutigen doppelten Eintrag.');
    if (uncompSize > maxUncompressed - total) throw new ZipError('ZIP-Inhalt ist insgesamt zu groß.', 'ZIP_LIMIT');
    names.add(name);
    total += uncompSize;
    files++;
  }
  if (p !== cdEnd) throw new ZipError('ZIP-Zentralverzeichnis hat eine unerwartete Größe.');
  return { entries: totalEntries, files, uncompressed_bytes: total };
}

// The batch intake reads directory metadata through an already identity-bound
// descriptor. Callers may additionally request entry-by-entry inflate/CRC and
// bounded OPC control extraction before any private snapshot is written.
function readRangeFromFd(fd, length, position, readSync = fs.readSync) {
  if (!Number.isSafeInteger(length) || length < 0 || !Number.isSafeInteger(position) || position < 0) {
    throw new ZipError('ZIP-Bereich ist ungültig.');
  }
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const read = readSync(fd, buffer, offset, length - offset, position + offset);
    if (!Number.isSafeInteger(read) || read <= 0) throw new ZipError('ZIP-Daten sind abgeschnitten.');
    offset += read;
  }
  return buffer;
}

function verifiedEntryDataFromFd(fd, entry, limits, readSync) {
  const maxEntry = limits.maxEntryUncompressed || limits.maxUncompressed || 300 * 1024 * 1024;
  const maxRatio = limits.maxCompressionRatio || 1000;
  if (![0, 8].includes(entry.method)) {
    throw new ZipError('ZIP-Kompressionsmethode wird nicht unterstützt.', 'ZIP_UNSUPPORTED_METHOD');
  }
  if (entry.uncompSize > maxEntry ||
      (entry.compSize > 0 && entry.uncompSize / entry.compSize > maxRatio)) {
    throw new ZipError('ZIP-Eintrag überschreitet das sichere Prüfbudget.', 'ZIP_LIMIT');
  }
  const compressed = readRangeFromFd(fd, entry.compSize, entry.dataStart, readSync);
  let data;
  try {
    if (entry.method === 0) data = Buffer.from(compressed);
    else data = zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.uncompSize + 1) });
  } catch {
    throw new ZipError('ZIP-Dekompression ist beschädigt oder überschreitet das Limit.', 'ZIP_CORRUPT');
  } finally {
    compressed.fill(0);
  }
  if (data.length !== entry.uncompSize || crc32(data) !== entry.expectedCrc) {
    data.fill(0);
    throw new ZipError('ZIP-Prüfsumme oder Größe stimmt nicht.', 'ZIP_CRC_MISMATCH');
  }
  return data;
}

function inspectZipDirectoryFromFd(fd, archiveSize, limits = {}, readSync = fs.readSync) {
  if (!Number.isSafeInteger(archiveSize) || archiveSize < 1) {
    throw new ZipError('ZIP-Dateigröße ist ungültig.');
  }
  const header = readRangeFromFd(fd, Math.min(8, archiveSize), 0, readSync);
  rejectEncryptedOfficeContainer(header);
  if (header.length < 2 || header[0] !== 0x50 || header[1] !== 0x4b) return null;

  const tailLength = Math.min(archiveSize, 22 + 0xffff);
  const tailStart = archiveSize - tailLength;
  const tail = readRangeFromFd(fd, tailLength, tailStart, readSync);
  const eocd = findEocd(tail);
  const commentLength = tail.readUInt16LE(eocd + 20);
  if (limits.requireExactEnd === true && eocd + 22 + commentLength !== tail.length) {
    throw new ZipError('ZIP besitzt Daten außerhalb seines Endverzeichnisses.', 'ZIP_POLYGLOT');
  }
  const totalEntries = tail.readUInt16LE(eocd + 10);
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  const cdEnd = cdOffset + cdSize;
  const maxEntries = limits.maxEntries || 20000;
  const maxDirectoryBytes = limits.maxDirectoryBytes || 64 * 1024 * 1024;
  if (!Number.isSafeInteger(cdEnd) || cdOffset < 0 || cdEnd > archiveSize || cdSize > maxDirectoryBytes) {
    throw new ZipError('ZIP-Zentralverzeichnis ungültig.');
  }
  if (limits.requireExactEnd === true && cdEnd !== tailStart + eocd) {
    throw new ZipError('ZIP besitzt Daten zwischen Zentralverzeichnis und Endmarke.', 'ZIP_POLYGLOT');
  }
  if (totalEntries > maxEntries) throw new ZipError('ZIP enthält zu viele Einträge.', 'ZIP_LIMIT');
  const centralDirectory = readRangeFromFd(fd, cdSize, cdOffset, readSync);
  // Rebase the directory to zero while retaining the original archive limits.
  const names = new Set();
  let p = 0;
  let total = 0;
  let files = 0;
  let hasContentTypes = false;
  let hasRootRelationships = false;
  const officeKinds = new Set();
  let activeContent = false;
  const descriptors = [];
  const occupiedRanges = [];
  const controlParts = Object.create(null);
  let controlBytes = 0;
  const maxUncompressed = limits.maxUncompressed || 300 * 1024 * 1024;
  for (let n = 0; n < totalEntries; n++) {
    if (p + 46 > centralDirectory.length || centralDirectory.readUInt32LE(p) !== 0x02014b50) throw new ZipError('ZIP-Zentralverzeichnis beschädigt.');
    const flags = centralDirectory.readUInt16LE(p + 8);
    const method = centralDirectory.readUInt16LE(p + 10);
    const expectedCrc = centralDirectory.readUInt32LE(p + 16);
    const compSize = centralDirectory.readUInt32LE(p + 20);
    const uncompSize = centralDirectory.readUInt32LE(p + 24);
    const nameLen = centralDirectory.readUInt16LE(p + 28);
    const extraLen = centralDirectory.readUInt16LE(p + 30);
    const commentLen = centralDirectory.readUInt16LE(p + 32);
    const localOffset = centralDirectory.readUInt32LE(p + 42);
    if (p + 46 + nameLen + extraLen + commentLen > centralDirectory.length) throw new ZipError('ZIP-Zentralverzeichnis abgeschnitten.');
    if (flags & (1 | 0x40 | 0x2000)) throw encryptedEntryError();
    if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOffset === 0xffffffff) throw new ZipError('ZIP64 wird nicht unterstützt.');
    const name = centralDirectory.subarray(p + 46, p + 46 + nameLen).toString('utf8').replace(/\\/g, '/');
    p += 46 + nameLen + extraLen + commentLen;
    if (localOffset + 30 > cdOffset) throw new ZipError('ZIP-Lokaleintrag beschädigt.');
    const localHeader = readRangeFromFd(fd, 30, localOffset, readSync);
    if (localHeader.readUInt32LE(0) !== 0x04034b50) throw new ZipError('ZIP-Lokaleintrag beschädigt.');
    const localFlags = localHeader.readUInt16LE(6);
    const localMethod = localHeader.readUInt16LE(8);
    const localCrc = localHeader.readUInt32LE(14);
    const localCompSize = localHeader.readUInt32LE(18);
    const localUncompSize = localHeader.readUInt32LE(22);
    const localNameLen = localHeader.readUInt16LE(26);
    const localExtraLen = localHeader.readUInt16LE(28);
    if (localFlags & (1 | 0x40 | 0x2000)) throw encryptedEntryError();
    const localNameStart = localOffset + 30;
    const dataStart = localNameStart + localNameLen + localExtraLen;
    const dataEnd = dataStart + compSize;
    if (!Number.isSafeInteger(dataEnd) || dataStart < localNameStart || dataEnd > cdOffset) {
      throw new ZipError('ZIP-Lokaleintrag liegt außerhalb des Datenbereichs.');
    }
    const localName = readRangeFromFd(fd, localNameLen, localNameStart, readSync)
      .toString('utf8').replace(/\\/g, '/');
    if (localFlags !== flags || localMethod !== method || localName !== name) {
      throw new ZipError('ZIP-Header sind inkonsistent.');
    }
    if (!(flags & 8) && (localCrc !== expectedCrc || localCompSize !== compSize || localUncompSize !== uncompSize)) {
      throw new ZipError('ZIP-Größenangaben sind inkonsistent.', 'ZIP_CORRUPT');
    }
    let entryEnd = dataEnd;
    if (flags & 8) {
      if ((localCrc !== 0 && localCrc !== expectedCrc) ||
        (localCompSize !== 0 && localCompSize !== compSize) ||
        (localUncompSize !== 0 && localUncompSize !== uncompSize)) {
        throw new ZipError('ZIP-Datenbeschreibung ist inkonsistent.', 'ZIP_CORRUPT');
      }
      const available = cdOffset - dataEnd;
      if (available < 12) throw new ZipError('ZIP-Datenbeschreibung fehlt.', 'ZIP_CORRUPT');
      const descriptor = readRangeFromFd(fd, Math.min(16, available), dataEnd, readSync);
      const signed = descriptor.readUInt32LE(0) === 0x08074b50;
      const valueOffset = signed ? 4 : 0;
      if (descriptor.length < valueOffset + 12 || descriptor.readUInt32LE(valueOffset) !== expectedCrc ||
        descriptor.readUInt32LE(valueOffset + 4) !== compSize ||
        descriptor.readUInt32LE(valueOffset + 8) !== uncompSize) {
        throw new ZipError('ZIP-Datenbeschreibung ist inkonsistent.', 'ZIP_CORRUPT');
      }
      entryEnd += valueOffset + 12;
    }
    for (const range of occupiedRanges) {
      if (localOffset < range.end && entryEnd > range.start) {
        throw new ZipError('ZIP-Einträge überlappen sich.', 'ZIP_CORRUPT');
      }
    }
    occupiedRanges.push({ start: localOffset, end: entryEnd });
    if (!name || name.endsWith('/')) continue;
    if (name.startsWith('/') || name.includes('../')) throw new ZipError('Unsicherer ZIP-Pfad erkannt.');
    if (names.has(name)) throw new ZipError('ZIP enthält einen mehrdeutigen doppelten Eintrag.');
    if (uncompSize > maxUncompressed - total) throw new ZipError('ZIP-Inhalt ist insgesamt zu groß.', 'ZIP_LIMIT');
    names.add(name);
    if (name === '[Content_Types].xml') hasContentTypes = true;
    if (name === '_rels/.rels') hasRootRelationships = true;
    if (name === 'word/document.xml') officeKinds.add('docx');
    if (name === 'xl/workbook.xml') officeKinds.add('xlsx');
    if (name === 'ppt/presentation.xml') officeKinds.add('pptx');
    if (/(?:^|\/)(?:vbaProject|oleObject)[^/]*\.bin$/iu.test(name) ||
        /^(?:activeX|customUI|word\/embeddings|xl\/embeddings|ppt\/embeddings)\//iu.test(name)) {
      activeContent = true;
    }
    total += uncompSize;
    files++;
    descriptors.push({ name, method, expectedCrc, compSize, uncompSize, dataStart });
  }
  if (p !== centralDirectory.length) throw new ZipError('ZIP-Zentralverzeichnis hat eine unerwartete Größe.');
  occupiedRanges.sort((left, right) => left.start - right.start);
  if (limits.requireExactEnd === true && (occupiedRanges[0]?.start !== 0 ||
    occupiedRanges.some((range, index) => index > 0 && occupiedRanges[index - 1].end !== range.start) ||
    occupiedRanges.at(-1)?.end !== cdOffset)) {
    throw new ZipError('ZIP besitzt ungebundene Datenbereiche.', 'ZIP_POLYGLOT');
  }
  if (limits.verifyPayloads === true) {
    const maxControlPartBytes = limits.maxControlPartBytes || 2 * 1024 * 1024;
    const maxControlBytes = limits.maxControlBytes || 8 * 1024 * 1024;
    for (const entry of descriptors) {
      const data = verifiedEntryDataFromFd(fd, entry, limits, readSync);
      const isControl = entry.name === '[Content_Types].xml' || entry.name.endsWith('.rels');
      if (isControl) {
        if (data.length > maxControlPartBytes || data.length > maxControlBytes - controlBytes) {
          data.fill(0);
          throw new ZipError('OPC-Steuerteile überschreiten das sichere Prüfbudget.', 'ZIP_LIMIT');
        }
        controlBytes += data.length;
        controlParts[entry.name] = data.toString('utf8');
      }
      data.fill(0);
    }
  }
  const result = { entries: totalEntries, files, uncompressed_bytes: total };
  if (limits.includeStructure === true) {
    result.structure = Object.freeze({
      content_types: hasContentTypes,
      root_relationships: hasRootRelationships,
      ooxml_type: officeKinds.size === 1 ? [...officeKinds][0] : null,
      active_content: activeContent
    });
  }
  if (limits.includeControls === true) {
    result.control_parts = Object.freeze(controlParts);
    result.entry_names = Object.freeze([...names]);
  }
  return result;
}

function readZip(buf, limits={}) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  rejectEncryptedOfficeContainer(buf);
  const maxEntries = limits.maxEntries || 20000;
  const maxUncompressed = limits.maxUncompressed || 300 * 1024 * 1024;
  const eocd = findEocd(buf);
  const totalEntries = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (totalEntries > maxEntries) throw new ZipError('ZIP enthält zu viele Einträge.');
  if (cdOffset + cdSize > buf.length) throw new ZipError('ZIP-Zentralverzeichnis ungültig.');

  const cdEnd = cdOffset + cdSize;
  const out = new Map();
  let p = cdOffset;
  let total = 0;
  for (let n=0; n<totalEntries; n++) {
    if (p + 46 > cdEnd || buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError('ZIP-Zentralverzeichnis beschädigt.');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const expectedCrc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    if (p + 46 + nameLen + extraLen + commentLen > cdEnd) throw new ZipError('ZIP-Zentralverzeichnis abgeschnitten.');
    if (flags & 1) throw encryptedEntryError();
    if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOffset === 0xffffffff) throw new ZipError('ZIP64 wird nicht unterstützt.');
    const nameBuf = buf.subarray(p + 46, p + 46 + nameLen);
    const name = nameBuf.toString((flags & 0x800) ? 'utf8' : 'utf8').replace(/\\/g,'/');
    p += 46 + nameLen + extraLen + commentLen;
    if (!name || name.endsWith('/')) continue;
    if (name.startsWith('/') || name.includes('../')) throw new ZipError('Unsicherer ZIP-Pfad erkannt.');
    if (out.has(name)) throw new ZipError('ZIP enthält einen mehrdeutigen doppelten Eintrag.');
    if (uncompSize > maxUncompressed - total) throw new ZipError('ZIP-Inhalt ist insgesamt zu groß.');

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) throw new ZipError('ZIP-Lokaleintrag beschädigt.');
    const localFlags = buf.readUInt16LE(localOffset + 6);
    const localMethod = buf.readUInt16LE(localOffset + 8);
    const localCrc = buf.readUInt32LE(localOffset + 14);
    const localCompSize = buf.readUInt32LE(localOffset + 18);
    const localUncompSize = buf.readUInt32LE(localOffset + 22);
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buf.length) throw new ZipError('ZIP-Daten abgeschnitten.');
    const localName = buf.subarray(localOffset + 30, localOffset + 30 + localNameLen).toString('utf8').replace(/\\/g,'/');
    if (localFlags !== flags || localMethod !== method || localName !== name) throw new ZipError('ZIP-Header sind inkonsistent.');
    if (!(flags & 8) && (localCrc !== expectedCrc || localCompSize !== compSize || localUncompSize !== uncompSize)) throw new ZipError('ZIP-Größenangaben sind inkonsistent.');
    const compressed = buf.subarray(dataStart, dataEnd);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) {
      try {
        data = zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(1, Math.min(uncompSize + 1, maxUncompressed - total + 1)) });
      } catch {
        throw new ZipError('ZIP-Dekompression überschreitet das erlaubte Limit oder ist beschädigt.');
      }
    }
    else throw new ZipError(`ZIP-Kompressionsmethode ${method} wird nicht unterstützt.`);
    if (data.length !== uncompSize) throw new ZipError('ZIP-Größe stimmt nicht mit Verzeichnis überein.');
    total += data.length;
    if (total > maxUncompressed) throw new ZipError('ZIP-Inhalt ist insgesamt zu groß.');
    if (crc32(data) !== expectedCrc) throw new ZipError('ZIP-Prüfsumme stimmt nicht.');
    out.set(name, data);
  }
  if (p !== cdEnd) throw new ZipError('ZIP-Zentralverzeichnis hat eine unerwartete Größe.');
  return out;
}

module.exports = { ZipError, inspectZipDirectory, inspectZipDirectoryFromFd, readZip };
