'use strict';

const sea = require('node:sea');

const KNOWN_TARGETS = new Set(['windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64']);

function runtimeInfo() {
  const selfContained = sea.isSea() === true;
  const candidate = process.env.DATASECURE_RUNTIME_TARGET || '';
  const target = selfContained && KNOWN_TARGETS.has(candidate) ? candidate : null;
  return {
    runtime_mode: selfContained ? 'self_contained_node' : 'host_node',
    runtime_target: target,
    runtime_dependency_install: !selfContained,
    host_node_required: !selfContained
  };
}

module.exports = { runtimeInfo };
