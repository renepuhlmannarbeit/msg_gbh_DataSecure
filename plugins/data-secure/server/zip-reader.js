'use strict';

const zlib = require('zlib');

class ZipError extends Error {}

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

function readZip(buf, limits={}) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
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
    if (flags & 1) throw new ZipError('Verschlüsselte ZIP-Einträge werden nicht unterstützt.');
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

module.exports = { ZipError, readZip };
