// Deflate ZIP writer built on node:zlib. The build used to shell out to the
// `zip` CLI, which does not exist on Windows - the only platform this product
// targets - so `npm run build` failed for every developer and only worked on
// the Linux CI runner.
//
// Entries are written with a fixed timestamp so that two builds of the same
// source produce the same archive and the same SHA-256.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const FIXED_DOS_TIME = 0x6000; // 12:00:00
const FIXED_DOS_DATE = 0x5c21; // 2026-01-01

let crcTable;

function table() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(buf) {
  let c = 0xffffffff;
  const t = table();
  for (const b of buf) c = t[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Collects every file below `dir` as a POSIX-separated archive path.
export function collectFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFiles(full, base));
    } else if (entry.isFile()) {
      out.push({ archivePath: path.relative(base, full).split(path.sep).join('/'), fullPath: full });
    }
  }
  return out;
}

export function writeZip(outFile, files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const raw = fs.readFileSync(file.fullPath);
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    const useDeflate = deflated.length < raw.length;
    const data = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const name = Buffer.from(file.archivePath, 'utf8');
    const crc = crc32(raw);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x800, 6); // UTF-8 names
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(FIXED_DOS_TIME, 10);
    lh.writeUInt16LE(FIXED_DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, data);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(FIXED_DOS_TIME, 12);
    ch.writeUInt16LE(FIXED_DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);

    offset += 30 + name.length + data.length;
  }

  const central = Buffer.concat(centrals);
  const local = Buffer.concat(locals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.concat([local, central, end]));
  return { entries: files.length, bytes: fs.statSync(outFile).size };
}
