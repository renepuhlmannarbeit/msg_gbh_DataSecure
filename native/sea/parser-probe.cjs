'use strict';

// Fixed engineering probes in the same executable/profile as the real parser.
// No script, source path, host, port or permission is accepted from the caller.
function probe() {
  const failures = [];
  function denied(name, code, attempt) {
    try {
      const value = attempt();
      if (value?.catch) value.catch(() => {});
      if (value?.destroy) value.destroy();
      if (value?.terminate) value.terminate();
      failures.push(name);
    } catch (error) { if (!(Array.isArray(code) ? code : [code]).includes(error.code)) failures.push(name + ':wrong-error'); }
  }
  const fs = require('node:fs');
  // Node implicitly permits its own entry executable. Probe an unrelated path,
  // not that documented entrypoint exception.
  denied('read', 'ERR_ACCESS_DENIED', () => fs.readFileSync('.datasecure-parser-outside-read'));
  denied('write', 'ERR_ACCESS_DENIED', () => fs.writeFileSync('.datasecure-parser-denied-write', 'synthetic', { flag: 'wx' }));
  denied('child', 'ERR_ACCESS_DENIED', () => require('node:child_process').spawnSync(process.execPath, []));
  denied('worker', 'ERR_ACCESS_DENIED', () => new (require('node:worker_threads').Worker)('', { eval: true }));
  denied('inspector', 'ERR_ACCESS_DENIED', () => require('node:inspector').open(0, '127.0.0.1'));
  denied('addon', ['ERR_ACCESS_DENIED', 'ERR_DLOPEN_DISABLED'], () => process.dlopen({ exports: {} }, 'nonexistent-synthetic.node'));
  denied('wasi', 'ERR_ACCESS_DENIED', () => new (require('node:wasi').WASI)({ version: 'preview1' }));
  const attempts = [
    ['http', () => require('node:http').get('http://127.0.0.1:9/')],
    ['https', () => require('node:https').get('https://127.0.0.1:9/')],
    ['tcp', () => require('node:net').connect(9, '127.0.0.1')],
    ['tls', () => require('node:tls').connect(9, '127.0.0.1')],
    ['dns', () => require('node:dns').lookup('localhost', () => {})],
    ['dns-promises', () => require('node:dns').promises.lookup('localhost')],
    ['dns-resolver', () => new (require('node:dns').Resolver)().resolveTxt('localhost', () => {})],
    ['dns-promises-resolver', () => new (require('node:dns/promises').Resolver)().resolveTxt(null)],
    ['udp', () => require('node:dgram').createSocket('udp4')],
    ['http2', () => require('node:http2').connect('http://127.0.0.1:9')],
    ['fetch', () => globalThis.fetch('http://127.0.0.1:9/')],
    ['websocket', () => new globalThis.WebSocket('ws://127.0.0.1:9/')],
    ['listener', () => require('node:net').createServer()],
    ['http-listener', () => require('node:http').createServer()],
    ['https-listener', () => require('node:https').createServer()]
  ];
  for (const [name, attempt] of attempts) denied(name, 'DATASECURE_NETWORK_DENIED', attempt);
  return failures;
}
module.exports = { probe };
