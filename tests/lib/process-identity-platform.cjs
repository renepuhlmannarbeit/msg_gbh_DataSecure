'use strict';

// Test-only source composition: execute the actual current observer/lease
// closures with a fixed lexical platform and an explicit birth probe. No
// liveness/comparison algorithm is copied and no native process is probed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const SOURCES = new Set(['batch-active-lock.js', 'batch-executor-lease.js']);
function loadIdentityPlatform(name, platform, identity) {
  if (!SOURCES.has(name) || !['darwin', 'win32', 'linux'].includes(platform) ||
      identity !== undefined && typeof identity !== 'function') throw new TypeError('IDENTITY_TEST_COMPOSITION_INVALID');
  const file = path.resolve(__dirname, '../../plugins/data-secure/server/gateway', name);
  const local = createRequire(file), loaded = { exports: {} };
  const processView = Object.freeze({ platform, pid: process.pid, env: process.env });
  const body = fs.readFileSync(file, 'utf8');
  vm.runInThisContext(`(function(require,module,exports,__filename,__dirname,process){${body}\n})`, { filename: file })(
    request => request === './process-identity' && identity
      ? { ...local(request), processInstanceIdentity: identity } : local(request),
    loaded, loaded.exports, file, path.dirname(file), processView);
  return loaded.exports;
}
module.exports = { loadIdentityPlatform };
