'use strict';

// Engineering-only parser role. esbuild embeds all first-party parser modules;
// Node builtins are the only external imports. No paths or Node flags are input.
const TARGET = '__DATASECURE_TARGET__';
const NODE_VERSION = '__DATASECURE_NODE_VERSION__';
const sea = require('node:sea');
try {
  if (!sea.isSea() || process.versions.node !== NODE_VERSION || !process.permission ||
      ['fs.read', 'fs.write', 'child', 'worker', 'addon', 'inspector', 'wasi'].some(
        scope => process.permission.has(scope) !== false)) throw new Error('boundary_missing');
  require('../../plugins/data-secure/server/network-deny.cjs');
  if (globalThis.__DATASECURE_NETWORK_DENY_ACTIVE__ !== true) throw new Error('guard_missing');
  if (process.argv.length === 3 && process.argv[2] === '--datasecure-parser-boundary-probe') {
    const { probe } = require('./parser-probe.cjs');
    const failures = probe();
    process.stdout.write(JSON.stringify({ schema: 'datasecure-sea-parser-probe/v1',
      role: 'parser', target: TARGET, node_version: NODE_VERSION, sea: true, failures }));
    process.exitCode = failures.length ? 2 : 0;
  } else {
    if (process.argv.length !== 4 || process.argv[3] !== '0' ||
        !['.txt', '.md', '.markdown', '.csv', '.docx'].includes(process.argv[2])) {
      throw new Error('arguments_invalid');
    }
    require('../../plugins/data-secure/server/parser-worker.js');
  }
} catch {
  process.stdout.write(JSON.stringify({ schema: 'data-secure-parser-result/1', ok: false, error: 'parse_failed' }));
  process.exitCode = 2;
}
