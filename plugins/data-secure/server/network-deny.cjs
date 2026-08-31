'use strict';

// Loaded before every raw-content worker. This is a deterministic runtime guard
// for Node releases whose permission model does not yet expose network controls.
// It complements process/OS isolation; it is not presented as a hostile-code
// sandbox because code running in-process could deliberately undo monkey patches.
function blocked() {
  const error = new Error('DATASECURE_NETWORK_DENIED');
  error.code = 'DATASECURE_NETWORK_DENIED';
  throw error;
}

function replace(object, names) {
  for (const name of names) {
    if (!object || !(name in object)) continue;
    try { Object.defineProperty(object, name, { value: blocked, writable: false, configurable: false }); }
    catch { try { object[name] = blocked; } catch { /* absence is caught by the probe */ } }
  }
}

const http = require('node:http');
const https = require('node:https');
replace(http, ['request', 'get', 'createServer']);
replace(https, ['request', 'get', 'createServer']);
replace(http.Agent?.prototype, ['createConnection']);
replace(https.Agent?.prototype, ['createConnection']);

const net = require('node:net');
replace(net, ['connect', 'createConnection', 'createServer']);
replace(net.Socket?.prototype, ['connect']);
replace(net.Server?.prototype, ['listen']);

const tls = require('node:tls');
replace(tls, ['connect', 'createServer']);
replace(tls.TLSSocket?.prototype, ['connect']);

const dns = require('node:dns');
const dnsMethods = ['lookup', 'lookupService', 'resolve', 'resolve4', 'resolve6', 'resolveAny',
  'resolveCaa', 'resolveCname', 'resolveMx', 'resolveNaptr', 'resolveNs', 'resolvePtr',
  'resolveSoa', 'resolveSrv', 'resolveTxt', 'reverse', 'setServers'];
replace(dns, dnsMethods);
replace(dns.promises, dnsMethods);
replace(dns.Resolver?.prototype, dnsMethods);
replace(dns.promises?.Resolver?.prototype, dnsMethods);

const dgram = require('node:dgram');
replace(dgram, ['createSocket']);
replace(dgram.Socket?.prototype, ['bind', 'connect', 'send']);

const http2 = require('node:http2');
replace(http2, ['connect', 'createServer', 'createSecureServer']);

for (const name of ['fetch', 'WebSocket', 'EventSource']) {
  try { Object.defineProperty(globalThis, name, { value: blocked, writable: false, configurable: false }); }
  catch { try { globalThis[name] = blocked; } catch { /* absence is caught by the probe */ } }
}

Object.defineProperty(globalThis, '__DATASECURE_NETWORK_DENY_ACTIVE__', {
  value: true, writable: false, configurable: false
});
