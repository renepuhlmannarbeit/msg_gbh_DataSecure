'use strict';

// This process receives document bytes through an inherited descriptor. The native
// Windows launcher and the portable parent both map the source to stdin. The
// worker also accepts fd 3 for the authenticated private-companion test harness.
// It runs under Node's permission model: parser code is readable, while file
// writes and Node network/child/worker/addon/inspector APIs stay denied. This is a
// permission-model seat belt, not a complete operating-system sandbox.
const fs = require('fs');
const { parseDocumentBuffer } = require('./document-parser');

function send(value) {
  process.stdout.write(JSON.stringify(value));
}

try {
  if (!process.permission || process.permission.has('fs.write') !== false ||
    process.permission.has('child') !== false || process.permission.has('worker') !== false) {
    throw new Error('permission_boundary_missing');
  }
  const ext = String(process.argv[2] || '').toLowerCase();
  const sourceFd = Number(process.argv[3]);
  if (sourceFd !== 0 && sourceFd !== 3) throw new Error('source_descriptor_invalid');
  const input = fs.readFileSync(sourceFd);
  send({ schema: 'data-secure-parser-result/1', ok: true, result: parseDocumentBuffer(input, ext) });
} catch {
  send({ schema: 'data-secure-parser-result/1', ok: false, error: 'parse_failed' });
  process.exitCode = 2;
}
