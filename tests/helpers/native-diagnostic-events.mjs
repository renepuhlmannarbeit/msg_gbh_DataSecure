import fs from 'node:fs';
import path from 'node:path';
import boundFileIo from '../../plugins/data-secure/server/core/bound-file-io.js';

const nativeLogName = /^desktop-interactions(?:\.\d+\.[a-f0-9]{32}(?:\.([2-8]))?)?\.jsonl$/u;
const ordinal = name => Number(nativeLogName.exec(name)[1] || 1);

// Native sessions create exclusive segments; restart must not require appending
// to an existing file. This acceptance reader merges only the exact log family.
export function nativeDiagnosticEvents(directory) {
  let names;
  try { names = fs.readdirSync(directory).filter(name =>
    nativeLogName.test(name)).sort((left, right) => ordinal(left) - ordinal(right) ||
      (left < right ? -1 : left > right ? 1 : 0)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  if (names.length > 64) throw new Error('NATIVE_DIAGNOSTIC_SEGMENT_LIMIT');
  // Segment1 (plain or collision fallback) precedes2..8. The actual campaign
  // filters by session before readiness; no cross-session clock order is implied.
  return names.flatMap(name => boundFileIo.readBoundFile(path.join(directory, name),
    { maximum: 2 * 1024 * 1024 }).toString('utf8').split(/\r?\n/u).flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    }));
}
