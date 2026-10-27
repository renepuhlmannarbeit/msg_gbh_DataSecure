'use strict';

const path = require('node:path');
const defaultServerRoot = path.resolve(__dirname, '..');
const childProcess = require('node:child_process');
const { resolveSeaParserRole } = require('../sea-parser-role');

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

// Definitions come from product modules, never from an IPC request. Snapshot
// their data once so the returned launcher retains only fixed entrypoints.
function fixedRoles(definitions) {
  try {
    if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(definitions);
    const roles = Object.create(null);
    for (const name of Reflect.ownKeys(descriptors)) {
      const owner = descriptors[name];
      if (typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/u.test(name) ||
          !Object.hasOwn(owner, 'value') || !owner.enumerable) invalid();
      const value = owner.value;
      if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
      const fields = Object.getOwnPropertyDescriptors(value);
      const keys = Reflect.ownKeys(fields);
      if (keys.length !== 3 || keys.some(key => !['entry', 'flag', 'transport'].includes(key) ||
          !Object.hasOwn(fields[key], 'value') || !fields[key].enumerable)) invalid();
      const entry = fields.entry.value, flag = fields.flag.value, transport = fields.transport.value;
      if (typeof entry !== 'string' || !/^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.js$/u.test(entry) ||
          typeof flag !== 'string' || !/^--datasecure-[a-z0-9-]+$/u.test(flag) ||
          !['json-ipc', 'fd3'].includes(transport)) invalid();
      roles[name] = Object.freeze({ entry, flag, transport });
    }
    if (!Object.keys(roles).length) invalid();
    return Object.freeze(roles);
  } catch { invalid(); }
}

function createBackgroundRoleLauncher(definitions, resolveRuntimeRoot = () => null) {
  if (typeof resolveRuntimeRoot !== 'function') invalid();
  const roles = fixedRoles(definitions);
  return function launchBackgroundRole(role, options = {}) {
    if (typeof role !== 'string' || !Object.hasOwn(roles, role) ||
        !options || typeof options !== 'object') invalid();
    const definition = roles[role];
    if (process.platform === 'darwin' && process.env.DATASECURE_NATIVE_EXPORT_CHANNEL === '1') {
      const { assertNativeOwnershipRuntime } = require('./ownership-control');
      assertNativeOwnershipRuntime();
      // Native detached workers retain the existing App bundle; do not activate
      // the generic durable cache or let callers select a different executable.
      for (const key of SEA_FORBIDDEN_OVERRIDES) if (options[key] !== undefined) invalid();
      if (process.env.DATASECURE_DURABLE_RUNTIME_ROOT) invalid();
      const environment = seaEnvironment(options.env);
      for (const key of ['DATASECURE_NATIVE_EXPORT_CHANNEL', 'DATASECURE_PRODUCT_CHANNEL', 'DATASECURE_MACOS_STATIC_CORE_SHA256', 'DATASECURE_MACOS_STATIC_CORE_ARTIFACT_SHA256',
        'EU_PRIVACY_DATA_ROOT', 'EU_PRIVACY_ROOT']) {
        if (typeof process.env[key] !== 'string' || !process.env[key] ||
            environment[key] !== process.env[key]) invalid();
      }
      if (environment.DATASECURE_DURABLE_RUNTIME_ROOT) invalid();
      const spawnOptions = definition.transport === 'fd3' ? {
        stdio: ['pipe', 'pipe', 'ignore', 'pipe'], windowsHide: true, shell: false, env: environment
      } : {
        detached: true, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        execArgv: [`--require=${path.join(defaultServerRoot, 'network-deny.cjs')}`],
        execPath: process.execPath, env: environment, serialization: 'json'
      };
      assertNativeOwnershipRuntime();
      return definition.transport === 'fd3'
        ? childProcess.spawn(process.execPath, [`--require=${path.join(defaultServerRoot, 'network-deny.cjs')}`,
          path.join(defaultServerRoot, ...definition.entry.split('/'))], spawnOptions)
        : childProcess.fork(path.join(defaultServerRoot, ...definition.entry.split('/')), [], spawnOptions);
    }
    let sea;
    try { sea = require('node:sea').isSea(); } catch { invalid(); }
    if (sea !== true && sea !== false) invalid();

    if (sea === false) {
      const durable = resolveRuntimeRoot();
      const serverRoot = durable ? path.join(durable.root, 'server') : defaultServerRoot;
      const executable = durable?.executable || options.execPath || process.execPath;
      if (definition.transport === 'fd3') {
        const spawn = options.spawn || childProcess.spawn;
        const server = options.server || path.join(serverRoot, ...definition.entry.split('/'));
        const networkDeny = options.networkDeny || path.join(serverRoot, 'network-deny.cjs');
        return spawn(executable, [`--require=${networkDeny}`, server], {
          stdio: ['pipe', 'pipe', 'ignore', 'pipe'],
          windowsHide: true,
          shell: false,
          env: options.env
        });
      }
      const forkProcess = options.forkProcess || childProcess.fork;
      return forkProcess(path.join(serverRoot, ...definition.entry.split('/')), [], {
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
      const args = [definition.flag];
      const spawnOptions = definition.transport === 'fd3' ? {
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
  };
}

module.exports = { createBackgroundRoleLauncher };
