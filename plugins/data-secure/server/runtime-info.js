'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sea = require('node:sea');

const KNOWN_TARGETS = new Set(['windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64']);

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
      const standaloneName = ({
        'windows-x64': 'datasecure-core-x86_64-pc-windows-msvc.exe',
        'macos-x64': 'datasecure-core-x86_64-apple-darwin',
        'macos-arm64': 'datasecure-core-aarch64-apple-darwin'
      })[candidate];
      const expected = standalone
        ? path.resolve(__dirname, '..', standaloneName)
        : candidate === 'windows-x64'
          ? path.resolve(__dirname, '..', 'runtime', 'datasecure-node.exe')
          : path.resolve(__dirname, '..', 'runtime', 'targets', candidate, 'node');
      // Detached Standalone workers run from the private durable cache under
      // the normalized launcher name. They remain hash-bound by the copied
      // evidence and must not silently fall back to host-node semantics.
      const durableExpected = standalone
        ? path.resolve(__dirname, '..', 'runtime', process.platform === 'win32' ? 'datasecure-node.exe' : 'datasecure-node')
        : null;
      try {
        for (const executable of [expected, durableExpected].filter(Boolean)) {
          const stat = fs.lstatSync(executable);
          if (stat.isFile() && !stat.isSymbolicLink() && fs.realpathSync(executable) === fs.realpathSync(process.execPath)) {
            target = candidate;
            break;
          }
        }
      } catch { /* source checkout or externally managed Node */ }
    }
  }
  const selfContained = seaRuntime || target !== null;
  return {
    runtime_mode: selfContained ? 'self_contained_node' : 'host_node',
    runtime_target: target,
    runtime_dependency_install: !selfContained,
    host_node_required: !selfContained
  };
}

module.exports = { runtimeInfo };
