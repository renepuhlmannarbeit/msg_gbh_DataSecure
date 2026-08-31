'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createSuite } = require('./helpers');
const { testAsync, done, assert } = createSuite('SEA parent runtime dispatch (simulated OS contracts)');
const file = path.join(__dirname, '../plugins/data-secure/server/runtime.js');
const realRequire = createRequire(file);
function fixture(platform, arch = 'x64') {
  const state = { role: { executable: '/fixed/parser', target: 'synthetic' }, native: true, reads: 0, spawns: [] };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports,
    __dirname: path.dirname(file), Buffer, setTimeout, clearTimeout,
    process: { platform, arch, versions: { node: '22.23.2' }, execPath: '/parent/SEA', env: {} },
    require(name) {
      if (name === './sea-parser-role') return { resolveSeaParserRole() { if (state.failure) throw new Error('secret'); return state.role; } };
      if (name === 'child_process') return {
        spawn(command, args, options) { state.spawns.push({ command, args: Array.from(args), options }); throw new Error('captured'); },
        spawnSync() { return { status: 0 }; }
      };
      if (name === 'fs') return { ...fs, openSync() { state.reads++; throw new Error('must not read'); } };
      if (name === './native-launcher') return { verifyNativeLauncherArtifact: () => '/fixed/native-supervisor' };
      if (name === './posix-supervisor') return { verifyPosixSupervisor: () => state.native
        ? { available: true, executable: '/fixed/native-supervisor' } : { available: false, reason: 'missing' } };
      return realRequire(name);
    }
  }, { timeout: 1000 });
  return { api: module.exports, state };
}
async function main() {
  for (const [platform, arch] of [['win32', 'x64'], ['darwin', 'x64'], ['darwin', 'arm64'], ['linux', 'x64']]) {
    await testAsync(`${platform}/${arch}: only fixed parser plus extension/stdin through native supervisor`, async () => {
      const { api, state } = fixture(platform, arch);
      await assert.rejects(api.convertDocument('', { inputBuffer: Buffer.from('synthetic'), sourceName: 'a.txt' }),
        error => error.code === 'PARSER_ISOLATION_FAILED');
      assert.equal(state.spawns.length, 1);
      const call = state.spawns[0];
      assert.equal(call.command, '/fixed/native-supervisor');
      assert.deepEqual(call.args.slice(-3), ['/fixed/parser', '.txt', '0']);
      assert.equal(call.args.includes('--permission'), false);
      assert.equal(call.options.shell, false); assert.equal(Object.keys(call.options.env).length, 0);
    });
  }
  await testAsync('missing role stops before source reads and never falls back to parent or host Node', async () => {
    const { api, state } = fixture('win32'); state.failure = true;
    await assert.rejects(api.convertDocument('/synthetic/source.txt'), error => error.code === 'PARSER_ISOLATION_FAILED');
    assert.equal(state.reads, 0); assert.equal(state.spawns.length, 0); assert.equal(api.nativeParserStatus().available, false);
  });
  await testAsync('SEA execution overrides are refused even when supplied through former Node test seams', async () => {
    for (const key of ['execPath', 'platform', 'arch', 'nodeVersion', 'launcherPath', 'launcherBytes', 'launcherExpectedSha256',
      'existsSync', 'spawn', 'spawnSync', 'posixSupervisorPath', 'posixSupervisorBase', 'hostProbeStatus']) {
      const { api, state } = fixture('win32');
      await assert.rejects(api.convertDocument('/synthetic/source.txt', { [key]: 'forbidden' }), error => error.code === 'PARSER_ISOLATION_FAILED');
      assert.equal(state.reads, 0); assert.equal(state.spawns.length, 0); assert.equal(api.nativeParserStatus({ [key]: 'forbidden' }).available, false);
    }
  });
  await testAsync('all SEA POSIX targets require native boundaries in both status and conversion', async () => {
    for (const [platform, arch] of [['darwin', 'x64'], ['darwin', 'arm64'], ['linux', 'x64']]) {
      const { api, state } = fixture(platform, arch); state.native = false;
      assert.equal(api.nativeParserStatus().available, false);
      await assert.rejects(api.convertDocument('/synthetic/source.txt'), error => error.code === 'PARSER_ISOLATION_FAILED');
      assert.equal(state.reads, 0); assert.equal(state.spawns.length, 0);
    }
  });
  await testAsync('changing execution getters cannot bypass the SEA fixed launch after validation', async () => {
    for (const key of ['execPath', 'platform', 'arch', 'launcherPath', 'launcherBytes', 'launcherExpectedSha256',
      'existsSync', 'spawn', 'spawnSync', 'posixSupervisorPath', 'posixSupervisorBase', 'hostProbeStatus']) {
      const { api, state } = fixture('win32');
      let reads = 0;
      const options = { inputBuffer: Buffer.from('synthetic'), sourceName: 'a.txt' };
      Object.defineProperty(options, key, { get() { return ++reads === 1 ? undefined : () => { throw new Error('injected'); }; } });
      await assert.rejects(api.convertDocument('', options), error => error.code === 'PARSER_ISOLATION_FAILED');
      assert.equal(reads, 1); assert.equal(state.spawns.length, 1);
      assert.equal(state.spawns[0].command, '/fixed/native-supervisor');
      assert.deepEqual(state.spawns[0].args.slice(-3), ['/fixed/parser', '.txt', '0']);
      reads = 0; assert.equal(api.nativeParserStatus(options).available, true); assert.equal(reads, 1);
    }
  });
  done();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
