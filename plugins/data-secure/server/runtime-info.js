'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sea = require('node:sea');

const KNOWN_TARGETS = new Set(['windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64']);

function standaloneExecutable(candidate, serverDirectory = __dirname) {
  if (candidate === 'windows-x64') {
    return path.resolve(serverDirectory, '..', 'datasecure-core-x86_64-pc-windows-msvc.exe');
  }
  if (candidate === 'macos-x64' || candidate === 'macos-arm64') {
    // Tauri removes the target suffix and places externalBin under MacOS,
    // while the product JS resources reside under Contents/Resources/server.
    return path.resolve(serverDirectory, '..', '..', 'MacOS', 'datasecure-core');
  }
  return null;
}

function runtimeInfo() {
  const seaRuntime = sea.isSea() === true;
  let target = null;
  if (seaRuntime) {
    const candidate = process.env.DATASECURE_RUNTIME_TARGET || '';
    target = KNOWN_TARGETS.has(candidate) ? candidate : null;
  } else {
    const candidate = ({ 'win32/x64': 'windows-x64', 'darwin/x64': 'macos-x64',
      'darwin/arm64': 'macos-arm64' })[`${process.platform}/${process.arch}`];
    if (candidate) {
      const standalone = process.env.DATASECURE_PRODUCT_CHANNEL === 'standalone';
      const expected = standalone
        ? standaloneExecutable(candidate)
        : candidate === 'windows-x64'
          ? path.resolve(__dirname, '..', 'runtime', 'datasecure-node.exe')
          : path.resolve(__dirname, '..', 'runtime', 'targets', candidate, 'node');
      // Detached Standalone workers run from the private durable cache under
      // the normalized launcher name. They remain hash-bound by the copied
      // evidence and must not silently fall back to host-node semantics.
      const durableExpected = standalone && process.platform !== 'darwin'
        ? path.resolve(__dirname, '..', 'runtime', process.platform === 'win32' ? 'datasecure-node.exe' : 'datasecure-node')
        : null;
      for (const executable of [expected, durableExpected].filter(Boolean)) {
        try {
          const stat = fs.lstatSync(executable);
          if (stat.isFile() && !stat.isSymbolicLink() && fs.realpathSync(executable) === fs.realpathSync(process.execPath)) {
            target = candidate;
            break;
          }
        } catch { /* Try the durable runtime after an absent bundle candidate. */ }
      }
    }
  }
  const selfContained = seaRuntime || target !== null;
  return {
    runtime_mode: selfContained ? 'self_contained_node' : 'host_node',
    runtime_target: target,
    runtime_dependency_install: !selfContained,
    host_node_required: !selfContained,
    ...(selfContained && process.platform === 'darwin' && process.env.DATASECURE_PRODUCT_CHANNEL === 'standalone'
      ? { runtime_role: 'mutating-core', runtime_origin: 'datasecure-static-ownership-core/1' } : {})
  };
}

module.exports = { runtimeInfo, standaloneExecutable };
