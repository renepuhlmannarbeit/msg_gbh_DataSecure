'use strict';

// Test-only preload, appended AFTER the unchanged product network-deny preload
// in the real native launch. It never consumes parser input or replaces output.
const fs = require('node:fs');
const path = require('node:path');
const targets = JSON.parse(fs.readFileSync(path.join(__dirname, 'offline-canary-targets.json'), 'utf8'));
const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__DATASECURE_NETWORK_DENY_ACTIVE__');
const failures = [], denied = [];
const attempts = [
  ['dns-lookup', () => require('node:dns').lookup('127.0.0.1', () => {})],
  ['dns-lookup-promises', () => require('node:dns').promises.lookup('127.0.0.1')],
  // A regressed guard can contact only the owned loopback DNS sink, not the
  // host's configured resolver. The real Resolver API supplies the request.
  ['dns-resolver', () => {
    const resolver = new (require('node:dns').Resolver)();
    resolver.setServers([`127.0.0.1:${targets.dns}`]);
    resolver.resolve4('synthetic.invalid', () => {});
  }],
  ['dns-resolver-promises', () => {
    const resolver = new (require('node:dns/promises').Resolver)();
    resolver.setServers([`127.0.0.1:${targets.dns}`]);
    return resolver.resolve4('synthetic.invalid');
  }],
  ['tcp', () => require('node:net').connect(targets.tcp, '127.0.0.1')],
  ['tls', () => require('node:tls').connect(targets.tcp, '127.0.0.1')],
  ['http', () => require('node:http').get(`http://127.0.0.1:${targets.http}/synthetic`)],
  ['https', () => require('node:https').get(`https://127.0.0.1:${targets.tcp}/synthetic`)],
  ['proxy', () => {
    const request = require('node:http').request({ host: '127.0.0.1', port: targets.proxy,
      method: 'GET', path: 'http://synthetic.invalid/never-forward' });
    request.end();
    return request;
  }],
  ['udp', () => {
    const socket = require('node:dgram').createSocket('udp4');
    socket.send(Buffer.from('synthetic'), targets.dns, '127.0.0.1', () => socket.close());
    return socket;
  }],
  ['fetch', () => globalThis.fetch(`http://127.0.0.1:${targets.http}/synthetic`)]
];
for (const [name, attempt] of attempts) {
  try {
    const value = attempt();
    if (value?.on) value.on('error', () => {});
    if (value?.catch) value.catch(() => {});
    if (value?.destroy) value.destroy();
    failures.push(`${name}:allowed`);
  } catch (error) {
    if (error?.code === 'DATASECURE_NETWORK_DENIED' && error?.message === 'DATASECURE_NETWORK_DENIED') denied.push(name);
    else failures.push(`${name}:wrong-error`);
  }
}
process.stderr.write(`PACKAGED_NETWORK_CANARY:${JSON.stringify({
  active: descriptor?.value === true && descriptor.writable === false && descriptor.configurable === false,
  proxy_controls_absent: !['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'NODE_USE_ENV_PROXY']
    .some(key => Object.hasOwn(process.env, key)),
  denied, failures
})}\n`);
