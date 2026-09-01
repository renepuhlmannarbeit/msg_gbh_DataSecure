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
      const expected = candidate === 'windows-x64'
        ? path.resolve(__dirname, '..', 'runtime', 'datasecure-node.exe')
        : path.resolve(__dirname, '..', 'runtime', 'targets', candidate, 'node');
      try {
        const stat = fs.lstatSync(expected);
        if (stat.isFile() && !stat.isSymbolicLink() && fs.realpathSync(expected) === fs.realpathSync(process.execPath)) {
          target = candidate;
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
