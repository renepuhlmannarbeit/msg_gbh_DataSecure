'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { ensureDurableRuntime, resolveDurableRuntimeRoot } = require(
  '../plugins/data-secure/server/durable-runtime-cache');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-durable-runtime-test-'));
const plugin = path.join(temporary, 'plugin');
const data = path.join(temporary, 'data');
const old = process.env.DATASECURE_DURABLE_RUNTIME_ROOT;

function write(relative, content, mode = 0o600) {
  const file = path.join(plugin, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode });
}

(async () => {
  try {
    write('server/network-deny.cjs', "'use strict';\n");
    write('server/gateway/batch-worker.js', [
      "'use strict';",
      "process.on('message', message => {",
      "  if (message?.type === 'probe') process.send?.({ type: 'durable-runtime-ok' });",
      "});"
    ].join('\n'));
    write('server/ocr-runtime/forbidden.bin', 'not copied');
    write('RUNTIME-EVIDENCE.json', '{}\n');
    const runtime = path.join(plugin, 'runtime-source.exe');
    fs.copyFileSync(process.execPath, runtime);
    const result = ensureDurableRuntime({
      pluginRoot: plugin, executable: runtime, dataRoot: data,
      runtimeInfo: { runtime_mode: 'self_contained_node', runtime_target: 'windows-x64' },
      platform: 'win32'
    });
    assert.strictEqual(result.active, true);
    assert.ok(fs.existsSync(path.join(result.root, 'server', 'gateway', 'batch-worker.js')));
    assert.ok(!fs.existsSync(path.join(result.root, 'server', 'ocr-runtime')));
    assert.ok(resolveDurableRuntimeRoot(process.env, { dataRoot: data }));

    // This is the RC95 regression: Cowork removes the source projection after
    // handoff. The cached interpreter and worker must still start and answer.
    fs.rmSync(plugin, { recursive: true });
    const worker = fork(path.join(result.root, 'server', 'gateway', 'batch-worker.js'), [], {
      execPath: path.join(result.root, 'runtime', 'datasecure-node.exe'),
      execArgv: [`--require=${path.join(result.root, 'server', 'network-deny.cjs')}`],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'json', windowsHide: true
    });
    const reply = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('durable worker timeout')), 10000);
      worker.once('message', message => { clearTimeout(timer); resolve(message); });
      worker.once('error', reject);
      worker.send({ type: 'probe' });
    });
    assert.deepStrictEqual(reply, { type: 'durable-runtime-ok' });
    worker.kill();
    console.log('DURABLE RUNTIME CACHE PASS');
  } finally {
    if (old === undefined) delete process.env.DATASECURE_DURABLE_RUNTIME_ROOT;
    else process.env.DATASECURE_DURABLE_RUNTIME_ROOT = old;
    try { fs.rmSync(temporary, { recursive: true }); } catch {}
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
