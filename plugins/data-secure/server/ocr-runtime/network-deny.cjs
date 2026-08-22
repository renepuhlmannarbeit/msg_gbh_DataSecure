'use strict';

const blocked = () => {
  throw new Error('DATASHIELD_NETWORK_DENIED');
};

for (const name of ['node:http', 'node:https']) {
  const module = require(name);
  module.request = blocked;
  module.get = blocked;
}
const net = require('node:net');
net.connect = blocked;
net.createConnection = blocked;
const tls = require('node:tls');
tls.connect = blocked;
const dns = require('node:dns');
for (const method of ['lookup', 'resolve', 'resolve4', 'resolve6']) dns[method] = blocked;
globalThis.fetch = blocked;
