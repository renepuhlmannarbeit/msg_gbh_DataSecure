'use strict';

// This checks the MCP-role's closed argument boundary. Node-style worker args
// must be rejected, never re-enter index.js or execute an arbitrary script.
// Keep the engineering release gate closed until a separately reviewed worker
// dispatch AND permission-boundary proof replace this negative characterization.
// All execution below stays in memory; no SEA/server/worker process is started.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { createSuite } = require('./helpers');
const { convertDocument } = require('../plugins/data-secure/server/runtime');

const { test, testAsync, done, assert } = createSuite('SEA worker boundary: unreleased NO-GO');
const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const bootstrap = read('native/sea/bootstrap.cjs');
const worker = read('plugins/data-secure/server/parser-worker.js');
const contract = JSON.parse(read('native/sea/launcher-contract.json'));

function runBootstrap(target, args) {
  // Explicit path implementations make both package layouts testable on any OS.
  const targetPath = target.os === 'win32' ? path.win32 : path.posix;
  const pluginRoot = target.os === 'win32' ? 'C:\\sea-boundary-fixture' : '/sea-boundary-fixture';
  const serverRoot = targetPath.join(pluginRoot, 'server');
  const entry = targetPath.join(serverRoot, 'index.js');
  const executable = target.os === 'win32'
    ? targetPath.join(pluginRoot, 'bin', target.launcher)
    : targetPath.join(serverRoot, 'runtime', target.id, target.launcher);
  const loaded = [];
  let output = '';
  const fakeProcess = {
    execPath: executable,
    argv: [executable, executable, ...args],
    env: {},
    stdout: { write(text) { output += text; } },
    stderr: { write(text) { output += text; } }
  };
  const modules = {
    'node:fs': {
      lstatSync(file) {
        if (file !== entry) throw new Error('FIXTURE_FILE_NOT_FOUND');
        return { isFile: () => true, isSymbolicLink: () => false };
      },
      realpathSync(file) {
        assert.ok(file === entry || file === serverRoot);
        return file;
      }
    },
    'node:path': targetPath,
    'node:sea': { isSea: () => true },
    'node:module': {
      createRequire(from) {
        assert.strictEqual(from, entry);
        return (file) => loaded.push(file); // NEVER execute index.js.
      }
    }
  };
  vm.runInNewContext(bootstrap.replace('__DATASECURE_TARGET__', target.id)
    .replace('__DATASECURE_NODE_VERSION__', contract.node_version)
    .replace('__DATASECURE_PARSER_ROLE_JSON__', 'null'), {
    process: fakeProcess,
    require(name) {
      assert.ok(Object.hasOwn(modules, name), `Unexpected bootstrap import: ${name}`);
      return modules[name];
    }
  }, { timeout: 1000 });
  return { loaded, output, entry, process: fakeProcess };
}

async function main() {
  let actualWorkerArgs;
  await testAsync('capture the real convertDocument worker arguments without starting a child', async () => {
    const launcherBytes = Buffer.alloc(512);
    launcherBytes.writeUInt16LE(0x5a4d, 0);
    launcherBytes.writeUInt32LE(0x80, 0x3c);
    launcherBytes.write('PE\0\0', 0x80, 'ascii');
    launcherBytes.writeUInt16LE(0x8664, 0x84);
    const executable = path.join(root, 'synthetic-sea-runtime.exe');
    let captured;
    await assert.rejects(convertDocument('opaque-private-artifact', {
      platform: 'win32', arch: 'x64', execPath: executable,
      // Reuse the existing parser-isolation test seam, not a fake worker result.
      launcherPath: process.execPath, launcherBytes,
      launcherExpectedSha256: crypto.createHash('sha256').update(launcherBytes).digest('hex'),
      inputBuffer: Buffer.from('synthetic document bytes'), sourceName: 'source.txt',
      spawn(command, args, options) {
        captured = { command, args, options };
        throw new Error('TEST_CAPTURE_ONLY_NO_CHILD');
      }
    }), (error) => error.code === 'PARSER_ISOLATION_FAILED');
    assert.ok(captured, 'The real runtime must reach its injected spawn boundary');
    assert.strictEqual(captured.options.shell, false);
    assert.deepStrictEqual(captured.options.env, {});
    const separator = captured.args.indexOf('--');
    assert.ok(separator >= 0);
    assert.strictEqual(captured.args[separator + 1], executable);
    actualWorkerArgs = captured.args.slice(separator + 2);
    const serverRoot = path.join(root, 'plugins', 'data-secure', 'server');
    assert.deepStrictEqual(actualWorkerArgs, [
      '--permission', `--allow-fs-read=${serverRoot}`,
      `--require=${path.join(serverRoot, 'network-deny.cjs')}`,
      '--disable-proto=throw', '--max-old-space-size=384',
      path.join(serverRoot, 'parser-worker.js'), '.txt', '0'
    ]);
  });

  test('MCP SEA rejects Node-style worker arguments before loading index.js on every target', () => {
    assert.ok(actualWorkerArgs, 'Worker arguments were not captured');
    for (const target of contract.targets) {
      const result = runBootstrap(target, actualWorkerArgs);
      assert.deepStrictEqual(result.loaded, []);
      assert.strictEqual(result.output, 'DATASECURE_RUNTIME_ARGUMENTS_INVALID\n');
      assert.strictEqual(result.process.exitCode, 2);
      assert.strictEqual(result.process.permission, undefined);
      assert.strictEqual(result.process.env.DATASECURE_SELF_CONTAINED_RUNTIME, undefined);
    }
  });

  test('runtime probe is only a launcher probe, never proof that the parser worker ran', () => {
    for (const target of contract.targets) {
      const result = runBootstrap(target, ['--datasecure-runtime-probe']);
      assert.deepStrictEqual(result.loaded, []);
      const probe = JSON.parse(result.output);
      assert.strictEqual(probe.schema, 'datasecure-sea-runtime-probe/v1');
      assert.strictEqual(probe.target, target.id);
      assert.strictEqual(probe.sea, true);
      assert.strictEqual(result.process.permission, undefined);
    }
  });

  await testAsync('actual SEA configuration neither imports CLI permissions nor enables a worker boundary', async () => {
    const builder = read('scripts/build-sea-launcher.mjs');
    assert.match(builder, /fs\.writeFileSync\(config, JSON\.stringify\(prepared.config\)/);
    const { launcherSeaConfig } = await import('../scripts/lib/sea-launcher-provenance.mjs');
    const config = launcherSeaConfig();
    assert.strictEqual(config.execArgvExtension, 'none');
    assert.deepStrictEqual(Array.from(config.execArgv), ['--no-warnings', '--max-old-space-size=512']);
    // This inspects build configuration, not a simulated Node permission engine.
  });

  test('the real worker rejects absent or permissive boundaries before reading/parsing input', () => {
    for (const permission of [undefined, { has: () => true },
      { has: (name) => name === 'child' }, { has: (name) => name === 'worker' }]) {
      let reads = 0;
      let parses = 0;
      let output = '';
      const fakeProcess = {
        argv: ['runtime', 'parser-worker.js', '.txt', '0'], permission,
        stdout: { write(text) { output += text; } }
      };
      vm.runInNewContext(worker, {
        process: fakeProcess,
        require(name) {
          if (name === 'fs') return { readFileSync() { reads++; throw new Error('UNEXPECTED_READ'); } };
          assert.strictEqual(name, './document-parser');
          return { parseDocumentBuffer() { parses++; throw new Error('UNEXPECTED_PARSE'); } };
        }
      }, { timeout: 1000 });
      assert.strictEqual(reads, 0);
      assert.strictEqual(parses, 0);
      assert.strictEqual(fakeProcess.exitCode, 2);
      assert.deepStrictEqual(JSON.parse(output), {
        schema: 'data-secure-parser-result/1', ok: false, error: 'parse_failed'
      });
    }
  });

  test('unproved SEA stays outside the productive entry and the assembly release gate rejects promotion', () => {
    assert.strictEqual(contract.release_enabled, false);
    assert.strictEqual(contract.dispatch_status, 'unreleased-fixed-single-plugin-dispatcher');
    const mcp = JSON.parse(read('plugins/data-secure/.mcp.json')).mcpServers['data-secure-local'];
    assert.strictEqual(mcp.command, 'node');
    assert.deepStrictEqual(mcp.args, ['${CLAUDE_PLUGIN_ROOT}/server/index.js']);
    const assembler = read('scripts/build-sea-plugin.mjs');
    const guard = assembler.match(/if \(contract\?\.release_enabled !== false\) throw new Error\('SEA_RELEASE_SWITCH_MUST_REMAIN_FALSE'\);/u);
    assert.ok(guard, 'An intentional non-release assembly guard must remain executable');
    for (const release_enabled of [true, undefined, null, 0, 'false']) {
      assert.throws(() => vm.runInNewContext(guard[0], { contract: { release_enabled } },
        { timeout: 1000 }), /SEA_RELEASE_SWITCH_MUST_REMAIN_FALSE/);
    }
    vm.runInNewContext(guard[0], { contract: { release_enabled: false } }, { timeout: 1000 });
  });

  done();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
