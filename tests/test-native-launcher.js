'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createSuite } = require('./helpers');
const { convertDocument } = require('../plugins/data-secure/server/runtime');

const { test, testAsync, done, assert } = createSuite('Native Windows parser boundary');
const launcher = path.join(__dirname, '..', 'plugins', 'data-secure', 'bin', 'windows-x64', 'datasecure-sandbox.exe');

function runNode(script, options = {}) {
  return childProcess.spawnSync(launcher, [
    '--memory-mib', String(options.memoryMiB || 128),
    '--cpu-ms', String(options.cpuMs || 5000),
    '--wall-ms', String(options.wallMs || 5000), '--', process.execPath, '-e', script
  ], {
    input: '', encoding: 'utf8', windowsHide: true, shell: false,
    timeout: options.timeout || 10_000, maxBuffer: 64 * 1024
  });
}

async function main() {
await testAsync('real parser receives source bytes through inherited stdin and returns no path', async () => {
  if (process.platform !== 'win32') return;
  assert.strictEqual(fs.existsSync(launcher), true);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'data-secure-native-parser-'));
  const source = path.join(root, 'private-marker.txt');
  fs.writeFileSync(source, 'Berufliche Rolle: Product Owner', 'utf8');
  try {
    const parsed = await convertDocument(source);
    assert.strictEqual(parsed.markdown, 'Berufliche Rolle: Product Owner');
    assert.doesNotMatch(JSON.stringify(parsed), /private-marker|data-secure-native-parser/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ACTIVE_PROCESS=1 blocks child creation below Node permissions', () => {
  if (process.platform !== 'win32') return;
  const result = runNode([
    "try {",
    "  require('child_process').spawn(process.execPath, ['-e', 'setTimeout(()=>{},1000)']);",
    "  process.stdout.write('CHILD_STARTED'); process.exit(9);",
    "} catch { process.stdout.write('CHILD_BLOCKED'); }"
  ].join(''));
  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.stdout, 'CHILD_BLOCKED');
});

test('job memory limit terminates an allocating worker', () => {
  if (process.platform !== 'win32') return;
  const result = runNode("const a=[];setInterval(()=>a.push(Buffer.alloc(8*1024*1024,1)),5)", {
    memoryMiB: 64, timeout: 10_000
  });
  assert.strictEqual(result.status, 125);
  assert.strictEqual(result.signal, null);
});

test('job CPU limit terminates a busy worker', () => {
  if (process.platform !== 'win32') return;
  const result = runNode('for(;;){}', { cpuMs: 100, timeout: 10_000 });
  assert.strictEqual(result.status, 125);
  assert.strictEqual(result.signal, null);
});

test('job wallclock limit terminates an idle worker', () => {
  if (process.platform !== 'win32') return;
  const result = runNode('setInterval(()=>{},1000)', { wallMs: 200, timeout: 5000 });
  assert.strictEqual(result.status, 125);
  assert.strictEqual(result.signal, null);
});

await testAsync('closing the launcher job handle removes the worker', async () => {
  if (process.platform !== 'win32') return;
  const child = childProcess.spawn(launcher, [
    '--memory-mib', '128', '--cpu-ms', '30000', '--wall-ms', '30000', '--', process.execPath, '-e',
    "process.stdout.write(String(process.pid)+'\\n');setInterval(()=>{},1000)"
  ], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, shell: false });
  const workerPid = await new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('worker pid unavailable')), 5000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      text += chunk;
      if (!text.includes('\n')) return;
      clearTimeout(timer);
      resolve(Number(text.trim()));
    });
    child.once('error', reject);
  });
  assert.ok(Number.isSafeInteger(workerPid) && workerPid > 0);
  child.kill();
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { process.kill(workerPid, 0); }
    catch { return; }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail('worker remained alive after launcher exit');
});

done();
}

main();
