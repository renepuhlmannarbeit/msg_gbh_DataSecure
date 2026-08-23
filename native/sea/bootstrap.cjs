'use strict';

// This source is injected into an official Node binary. The build replaces the
// two fixed markers below. Product modules remain ordinary files beside the
// launcher, so their existing parser/worker isolation and package parity stay
// inspectable instead of being hidden in an opaque application bundle.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const sea = require('node:sea');

const TARGET = '__DATASECURE_TARGET__';
const NODE_VERSION = '__DATASECURE_NODE_VERSION__';

if (process.argv.length === 3 && process.argv[2] === '--datasecure-runtime-probe') {
  process.stdout.write(`${JSON.stringify({
    schema: 'datasecure-sea-runtime-probe/v1',
    target: TARGET,
    node_version: NODE_VERSION,
    sea: sea.isSea()
  })}\n`);
} else {
  const runtimeDir = path.dirname(process.execPath);
  // Windows resolves the extensionless plugin command to bin/datasecure-mcp.exe.
  // POSIX uses bin/datasecure-mcp as a fixed dispatcher to a target launcher.
  const serverCandidates = [
    path.resolve(runtimeDir, '..', 'server'),
    path.resolve(runtimeDir, '..', '..')
  ];
  const serverRoot = serverCandidates.find((candidate) => {
    try {
      const candidateStat = fs.lstatSync(path.join(candidate, 'index.js'));
      return candidateStat.isFile() && !candidateStat.isSymbolicLink();
    } catch {
      return false;
    }
  });
  if (!serverRoot) throw new Error('DATASECURE_RUNTIME_ENTRY_MISSING');
  const entry = path.resolve(serverRoot, 'index.js');
  const stat = fs.lstatSync(entry);
  const realRoot = fs.realpathSync(serverRoot);
  const realEntry = fs.realpathSync(entry);
  const relative = path.relative(realRoot, realEntry);
  if (!stat.isFile() || stat.isSymbolicLink() || !relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('DATASECURE_RUNTIME_ENTRY_INVALID');
  }
  process.env.DATASECURE_SELF_CONTAINED_RUNTIME = '1';
  process.env.DATASECURE_RUNTIME_TARGET = TARGET;
  createRequire(entry)(entry);
}
