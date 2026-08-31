'use strict';

// This source is injected into an official Node binary. The build replaces the
// three fixed markers below. Product modules remain ordinary files beside the
// launcher, so their existing parser/worker isolation and package parity stay
// inspectable instead of being hidden in an opaque application bundle.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const sea = require('node:sea');

const TARGET = '__DATASECURE_TARGET__';
const NODE_VERSION = '__DATASECURE_NODE_VERSION__';
const PARSER_ROLE = JSON.parse('__DATASECURE_PARSER_ROLE_JSON__');
const BACKGROUND_ROLES = Object.freeze({
  '--datasecure-batch-worker': 'gateway/batch-worker.js',
  '--datasecure-review-worker': 'gateway/review-worker.js',
  '--datasecure-companion': 'companion/stdio-server.js'
});
const backgroundRole = process.argv.length === 3 && Object.hasOwn(BACKGROUND_ROLES, process.argv[2])
  ? BACKGROUND_ROLES[process.argv[2]] : null;
const parserProbe = process.argv.length === 3 && process.argv[2] === '--datasecure-parser-integration-probe';
const backgroundProbe = process.argv.length === 3 && process.argv[2] === '--datasecure-background-integration-probe';
const batchAcceptanceProbe = process.argv.length === 3 && process.argv[2] === '--datasecure-batch-acceptance-probe';

if (process.argv.length === 3 && process.argv[2] === '--datasecure-runtime-probe') {
  process.stdout.write(`${JSON.stringify({
    schema: 'datasecure-sea-runtime-probe/v1',
    target: TARGET,
    node_version: NODE_VERSION,
    sea: sea.isSea()
  })}\n`);
} else if (process.argv.length !== 2 && !parserProbe && !backgroundProbe && !batchAcceptanceProbe && !backgroundRole) {
  // No arbitrary Node flags, scripts, role names or additional arguments.
  process.stderr.write('DATASECURE_RUNTIME_ARGUMENTS_INVALID\n');
  process.exitCode = 2;
} else {
 try {
  if ((backgroundRole || backgroundProbe || batchAcceptanceProbe) && (TARGET !== 'windows-x64' || !sea.isSea())) {
    throw new Error('SEA_BACKGROUND_TARGET_PENDING');
  }
  if ((batchAcceptanceProbe || (backgroundRole && backgroundRole !== 'companion/stdio-server.js')) &&
      (typeof process.send !== 'function' || !process.channel || process.connected !== true)) {
    throw new Error('SEA_BACKGROUND_IPC_REQUIRED');
  }
  const runtimeDir = path.dirname(process.execPath);
  // Windows resolves the extensionless plugin command to bin/datasecure-mcp.exe.
  // POSIX uses bin/datasecure-mcp as a fixed dispatcher to a target launcher.
  const serverRoot = TARGET === 'windows-x64'
    ? path.resolve(runtimeDir, '..', 'server') : path.resolve(runtimeDir, '..', '..');
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
  if (PARSER_ROLE !== null) {
    for (const file of PARSER_ROLE.server_files) Object.freeze(file);
    Object.freeze(PARSER_ROLE.server_files);
    Object.freeze(PARSER_ROLE);
    Object.defineProperty(globalThis, '__DATASECURE_PARSER_ROLE__', { value: PARSER_ROLE });
  }
  if (backgroundRole) {
    const localRequire = createRequire(entry);
    if (!localRequire('./sea-parser-role.js').resolveSeaParserRole()) throw new Error('SEA_BACKGROUND_ROLE_INVALID');
    // Fixed modules only; source-bound parser metadata is NOT an attestation
    // of the complete background-module closure. Final assembly is still gated.
    let selected = serverRoot;
    const parts = backgroundRole.split('/');
    for (let index = 0; index < parts.length; index++) {
      selected = path.join(selected, parts[index]);
      const part = fs.lstatSync(selected);
      if (part.isSymbolicLink() || (index === parts.length - 1
        ? !part.isFile() || part.nlink !== 1 : !part.isDirectory())) throw new Error('SEA_BACKGROUND_ENTRY_INVALID');
    }
    localRequire('./network-deny.cjs');
    const marker = Object.getOwnPropertyDescriptor(globalThis, '__DATASECURE_NETWORK_DENY_ACTIVE__');
    if (!marker || marker.value !== true || marker.writable || marker.configurable) throw new Error('SEA_BACKGROUND_GUARD_INVALID');
    localRequire(selected);
  } else if (batchAcceptanceProbe) {
    // Explicit isolated-account engineering acceptance, never a normal MCP
    // path. The private frame and fresh two-root scope are checked by the probe
    // before any batch/keyring import. The acknowledgement is not attestation.
    Promise.resolve().then(() => {
      if (!createRequire(entry)('./sea-parser-role.js').resolveSeaParserRole()) throw new Error('SEA_BATCH_CONTEXT_INVALID');
      return createRequire(entry)('./sea-batch-probe.js').runSeaBatchProbe();
    }).then(result => process.stdout.write(JSON.stringify(result) + '\n'))
      .catch(error => {
        const code = /^SEA_BATCH_[A-Z_]{1,80}$/.test(error?.message || '') ? error.message : 'SEA_BATCH_PROBE_FAILED';
        process.stdout.write(JSON.stringify({ schema: 'datasecure-sea-batch-probe/v1', ok: false,
          error: code, cleanup_safe: error?.cleanupSafe === true, privacy_release_verified: false }) + '\n');
        process.exitCode = 2;
      });
  } else if (backgroundProbe) {
    Promise.resolve().then(() => {
      if (!createRequire(entry)('./sea-parser-role.js').resolveSeaParserRole()) throw new Error('SEA_BACKGROUND_ROLE_INVALID');
      return createRequire(entry)('./sea-background-probe.js').runBackgroundProbe();
    }).then(result => process.stdout.write(JSON.stringify(result) + '\n'))
      .catch(error => {
        const stage = Number.isInteger(error?.stage) && error.stage >= 0 && error.stage <= 8 ? error.stage : 'START';
        const detail = ['SEA_BACKGROUND_PROBE_CHILD_DEADLINE', 'SEA_BACKGROUND_PROBE_CHILD_CLEANUP_FAILED',
          'SEA_BACKGROUND_PROBE_EXIT_ZERO', 'SEA_BACKGROUND_PROBE_EXIT_ONE', 'SEA_BACKGROUND_PROBE_EXIT_TWO',
          'SEA_BACKGROUND_PROBE_FRAME_INVALID'].includes(error?.message) ? error.message : 'SEA_BACKGROUND_PROBE_FAILED';
        process.stdout.write(JSON.stringify({ schema: 'datasecure-sea-background-probe/v1', ok: false,
          error: `${detail}_${stage}` }) + '\n');
        process.exitCode = 2;
      });
  } else if (parserProbe) {
    // This fixed, synthetic engineering module is not a public MCP tool.
    Promise.resolve().then(() => {
      createRequire(entry)('./sea-parser-role.js').resolveSeaParserRole();
      return createRequire(entry)('./sea-parent-parser-probe.js').runParentParserProbe();
    })
      .then(result => process.stdout.write(JSON.stringify(result) + '\n'))
      .catch(() => {
        process.stdout.write(JSON.stringify({ schema: 'datasecure-sea-parent-parser-probe/v1', ok: false,
          error: 'SEA_PARSER_INTEGRATION_FAILED' }) + '\n');
        process.exitCode = 2;
      });
  } else createRequire(entry)(entry);
 } catch {
   process.stderr.write('DATASECURE_RUNTIME_START_FAILED\n');
   process.exitCode = 2;
 }
}
