import net from 'node:net';
import http from 'node:http';
import dgram from 'node:dgram';
import { Resolver } from 'node:dns/promises';
import { once } from 'node:events';
import assert from 'node:assert/strict';

// Sinks never forward traffic. Even a broken product guard can reach only
// these explicitly addressed, ephemeral loopback endpoints.
export async function loopbackCanaries() {
  const counts = { tcp: 0, http: 0, dns: 0, proxy: 0 };
  const sockets = new Set();
  const tcp = net.createServer(socket => { counts.tcp++; socket.end(); });
  const web = key => http.createServer((request, response) => { counts[key]++; response.end('synthetic'); });
  const httpSink = web('http'), proxy = web('proxy');
  proxy.on('connect', (request, socket) => { counts.proxy++; socket.end(); });
  const dns = dgram.createSocket('udp4');
  dns.on('message', (query, remote) => {
    counts.dns++;
    if (query.length < 17 || query.readUInt16BE(4) !== 1) return;
    let end = 12;
    while (end < query.length && query[end] !== 0) end += query[end] + 1;
    end += 5;
    if (end > query.length) return;
    const header = Buffer.from(query.subarray(0, 12));
    header.writeUInt16BE(0x8180, 2); header.writeUInt16BE(1, 6);
    header.writeUInt16BE(0, 8); header.writeUInt16BE(0, 10);
    const answer = Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 0, 0, 4, 127, 0, 0, 1]);
    dns.send(Buffer.concat([header, query.subarray(12, end), answer]), remote.port, remote.address);
  });
  const servers = [tcp, httpSink, proxy];
  const targets = {};
  async function close() {
    for (const socket of sockets) socket.destroy();
    await Promise.all(servers.map(server => new Promise(resolve => {
      server.closeAllConnections?.();
      if (server.listening) server.close(resolve); else resolve();
    })));
    try { dns.address(); await new Promise(resolve => dns.close(resolve)); }
    catch (error) { if (error.code !== 'ERR_SOCKET_DGRAM_NOT_RUNNING') throw error; }
  }
  try {
    for (const [key, server] of [['tcp', tcp], ['http', httpSink], ['proxy', proxy]]) {
      server.on('connection', socket => {
        sockets.add(socket); socket.on('close', () => sockets.delete(socket));
      });
      const listening = once(server, 'listening');
      server.listen(0, '127.0.0.1');
      await listening;
      targets[key] = server.address().port;
    }
    const listening = once(dns, 'listening');
    dns.bind(0, '127.0.0.1'); await listening;
    targets.dns = dns.address().port;
    return {
      targets, close, snapshot: () => ({ ...counts }),
      async positiveControl() {
        await new Promise((resolve, reject) => {
          const socket = net.connect(targets.tcp, '127.0.0.1');
          socket.once('error', reject); socket.once('connect', () => socket.end()); socket.once('close', resolve);
        });
        for (const key of ['http', 'proxy']) await new Promise((resolve, reject) => {
          const request = http.get({ host: '127.0.0.1', port: targets[key], agent: false,
            path: key === 'proxy' ? 'http://synthetic.invalid/never-forward' : '/synthetic' }, response => {
            response.resume(); response.once('end', resolve); response.once('error', reject);
          });
          request.once('error', reject); request.setTimeout(5000, () => request.destroy(new Error('CANARY_HTTP_TIMEOUT')));
        });
        const resolver = new Resolver({ timeout: 1000, tries: 1 });
        resolver.setServers([`127.0.0.1:${targets.dns}`]);
        assert.deepStrictEqual(await resolver.resolve4('synthetic.invalid'), ['127.0.0.1']);
        assert.deepStrictEqual(counts, { tcp: 1, http: 1, dns: 1, proxy: 1 });
      }
    };
  } catch (error) { await close(); throw error; }
}
