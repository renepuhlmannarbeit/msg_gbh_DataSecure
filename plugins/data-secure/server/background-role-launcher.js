'use strict';

const path = require('node:path');
const childProcess = require('node:child_process');
const { resolveSeaParserRole } = require('./sea-parser-role');
const { resolveDurableRuntimeRoot } = require('./durable-runtime-cache');

const ROLE_FLAGS = Object.freeze({
  batch: '--datasecure-batch-worker',
  review: '--datasecure-review-worker',
  companion: '--datasecure-companion'
});
const SEA_FORBIDDEN_OVERRIDES = Object.freeze([
  'execPath', 'server', 'networkDeny', 'spawn', 'forkProcess', 'platform', 'arch',
  'execArgv', 'stdio', 'cwd', 'shell', 'detached', 'serialization'
]);
const SEA_FORBIDDEN_ENV = new Set([
  'NODE_OPTIONS', 'NODE_PATH', 'NODE_CHANNEL_FD',
  'NODE_CHANNEL_SERIALIZATION_MODE', 'ELECTRON_RUN_AS_NODE'
]);

function invalid() {
  const error = new Error('SEA_BACKGROUND_ROLE_INVALID');
  error.code = 'SEA_BACKGROUND_ROLE_INVALID';
  throw error;
}

// The caller owns the environment allowlist. This second boundary removes
// Node startup controls, including inherited IPC descriptors. spawn creates
// the new JSON IPC channel itself; no parent channel value is forwarded.
function seaEnvironment(source) {
  const environment = Object.create(null);
  for (const key of Object.keys(source || {})) {
    if (!SEA_FORBIDDEN_ENV.has(key.toUpperCase())) environment[key] = source[key];
  }
  return environment;
}

function launchBackgroundRole(role, options = {}) {
  if (typeof role !== 'string' || !Object.hasOwn(ROLE_FLAGS, role) ||
      !options || typeof options !== 'object') invalid();
  let sea;
  try { sea = require('node:sea').isSea(); } catch { invalid(); }
  if (sea !== true && sea !== false) invalid();

  if (sea === false) {
    const durable = resolveDurableRuntimeRoot();
    const serverRoot = durable ? path.join(durable.root, 'server') : __dirname;
    const executable = durable?.executable || options.execPath || process.execPath;
    if (role === 'companion') {
      const spawn = options.spawn || childProcess.spawn;
      const server = options.server || path.join(serverRoot, 'companion', 'stdio-server.js');
      const networkDeny = options.networkDeny || path.join(serverRoot, 'network-deny.cjs');
      return spawn(executable, [`--require=${networkDeny}`, server], {
        stdio: ['pipe', 'pipe', 'ignore', 'pipe'],
        windowsHide: true,
        shell: false,
        env: options.env
      });
    }
    const forkProcess = options.forkProcess || childProcess.fork;
    return forkProcess(path.join(serverRoot, 'gateway', `${role}-worker.js`), [], {
      detached: true,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [`--require=${path.join(serverRoot, 'network-deny.cjs')}`],
      execPath: executable,
      env: options.env,
      serialization: 'json'
    });
  }

  try {
    // Only Windows/x64 has the reviewed background-role dispatch contract.
    // This validates the bound parser role, not the entire background closure.
    if (process.platform !== 'win32' || process.arch !== 'x64' ||
        !resolveSeaParserRole()) invalid();
    for (const key of SEA_FORBIDDEN_OVERRIDES) {
      // Read exactly once, reject any defined value, and NEVER use these
      // options below (including a getter whose later value would change).
      const override = options[key];
      if (override !== undefined) invalid();
    }
    const environment = seaEnvironment(options.env);
    const command = process.execPath;
    const args = [ROLE_FLAGS[role]];
    const spawnOptions = role === 'companion' ? {
      stdio: ['pipe', 'pipe', 'ignore', 'pipe'],
      windowsHide: true,
      shell: false,
      env: environment
    } : {
      detached: true,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      serialization: 'json',
      shell: false,
      env: environment
    };
    // Recheck after all caller-owned getters and directly before spawning.
    if (!resolveSeaParserRole()) invalid();
    return childProcess.spawn(command, args, spawnOptions);
  } catch {
    // Never surface package locations, inherited values or native errors.
    invalid();
  }
}

module.exports = { launchBackgroundRole };
