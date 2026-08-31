'use strict';

const attempts = [
  ['http', () => require('node:http').get('http://127.0.0.1:9/')],
  ['https', () => require('node:https').get('https://127.0.0.1:9/')],
  ['tcp', () => require('node:net').connect(9, '127.0.0.1')],
  ['tls', () => require('node:tls').connect(9, '127.0.0.1')],
  ['dns', () => require('node:dns').lookup('localhost', () => {})],
  ['dns-promises', () => require('node:dns').promises.lookup('localhost')],
  ['dns-resolve', () => require('node:dns').resolveTxt('localhost', () => {})],
  ['dns-resolver', () => new (require('node:dns').Resolver)().resolveTxt('localhost', () => {})],
  // Invalid names keep these regression probes network-free even if a guard
  // regresses: the original API only reaches its argument validation.
  ['dns-promises-resolver', () => new (require('node:dns').promises.Resolver)().resolveTxt(null)],
  ['dns-promises-module-resolver', () => new (require('node:dns/promises').Resolver)().resolveTxt(null)],
  ['udp', () => require('node:dgram').createSocket('udp4')],
  ['http2', () => require('node:http2').connect('http://127.0.0.1:9')],
  ['fetch', () => globalThis.fetch('http://127.0.0.1:9/')],
  ['websocket', () => new globalThis.WebSocket('ws://127.0.0.1:9/')],
  ['listener', () => require('node:net').createServer()],
  ['http-listener', () => require('node:http').createServer()],
  ['https-listener', () => require('node:https').createServer()]
];

const failures = [];
for (const [name, attempt] of attempts) {
  try {
    const value = attempt();
    if (value && typeof value.catch === 'function') value.catch(() => {});
    if (value && typeof value.destroy === 'function') value.destroy();
    failures.push(name);
  } catch (error) {
    if (error?.code !== 'DATASECURE_NETWORK_DENIED' || error?.message !== 'DATASECURE_NETWORK_DENIED') {
      failures.push(`${name}:wrong-error`);
    }
  }
}

process.stdout.write(JSON.stringify({
  active: globalThis.__DATASECURE_NETWORK_DENY_ACTIVE__ === true,
  failures
}));
process.exitCode = failures.length ? 2 : 0;
