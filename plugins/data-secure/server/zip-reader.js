'use strict';

const zlib = require('zlib');

class ZipError extends Error {}

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

  const out = new Map();
  let p = cdOffset;
  let total = 0;
  for (let n=0; n<totalEntries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError('ZIP-Zentralverzeichnis beschädigt.');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const nameBuf = buf.subarray(p + 46, p + 46 + nameLen);
    const name = nameBuf.toString((flags & 0x800) ? 'utf8' : 'utf8').replace(/\\/g,'/');
    p += 46 + nameLen + extraLen + commentLen;
    if (!name || name.endsWith('/')) continue;
    if (name.startsWith('/') || name.includes('../')) throw new ZipError('Unsicherer ZIP-Pfad erkannt.');
    if (uncompSize > maxUncompressed) throw new ZipError('ZIP-Eintrag ist zu groß.');
    total += uncompSize;
    if (total > maxUncompressed) throw new ZipError('ZIP-Inhalt ist insgesamt zu groß.');

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) throw new ZipError('ZIP-Lokaleintrag beschädigt.');
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buf.length) throw new ZipError('ZIP-Daten abgeschnitten.');
    const compressed = buf.subarray(dataStart, dataEnd);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = zlib.inflateRawSync(compressed, { maxOutputLength: Math.max(1, uncompSize || maxUncompressed) });
    else throw new ZipError(`ZIP-Kompressionsmethode ${method} wird nicht unterstützt.`);
    if (uncompSize && data.length !== uncompSize) throw new ZipError('ZIP-Größe stimmt nicht mit Verzeichnis überein.');
    out.set(name, data);
  }
  return out;
}

module.exports = { ZipError, readZip };
