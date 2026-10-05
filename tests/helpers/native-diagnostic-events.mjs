import fs from 'node:fs';
import path from 'node:path';
import boundFileIo from '../../plugins/data-secure/server/core/bound-file-io.js';

// Native sessions create exclusive segments; restart must not require appending
// to an existing file. This acceptance reader merges only the exact log family.
export function nativeDiagnosticEvents(directory) {
  let names;
  try { names = fs.readdirSync(directory).filter(name =>
    /^desktop-interactions(?:\.\d+\.[a-f0-9]{32})?\.jsonl$/u.test(name)).sort(); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  if (names.length > 64) throw new Error('NATIVE_DIAGNOSTIC_SEGMENT_LIMIT');
  return names.flatMap(name => boundFileIo.readBoundFile(path.join(directory, name),
    { maximum: 2 * 1024 * 1024 }).toString('utf8').split(/\r?\n/u).flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    }));
}
