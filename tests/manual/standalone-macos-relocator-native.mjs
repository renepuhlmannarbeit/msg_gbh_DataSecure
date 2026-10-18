// Real macOS filesystem/helper evidence only. Synthetic Mach-O-shaped payloads
// are copied but never executed. This is not Finder/Gatekeeper or M2 App UAT.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import { fileURLToPath } from 'node:url';
import layout from '../../plugins/data-secure/server/standalone/macos-bundle-layout.js';
import { checkedRelocator, buildMacRelocator, relocatorPath } from '../../scripts/lib/macos-build-relocator.mjs';
import { planMacNativeRelocation, nativeRelocationArguments, relocateMacNative } from '../../scripts/lib/macos-bundle-native.mjs';
import { removePackageSmokeScope } from '../helpers/standalone-package-scope.mjs';

if (process.platform !== 'darwin') throw new Error('MACOS_RELOCATOR_NATIVE_PROBE_NOT_RUN_FOREIGN_HOST');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = `macos-${process.arch}`, hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
checkedRelocator(false);
const testHelper = fs.existsSync(relocatorPath(true)) ? checkedRelocator(true) : buildMacRelocator({ testHook: true });
function write(file, bytes) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
function syntheticMachO(type) {
  const bytes = Buffer.alloc(88);
  bytes.writeUInt32LE(0xfeedfacf); bytes.writeUInt32LE(process.arch === 'arm64' ? 0x0100000c : 0x01000007, 4);
  bytes.writeUInt32LE(type, 12); bytes.writeUInt32LE(2, 16); bytes.writeUInt32LE(40, 20);
  bytes.writeUInt32LE(0x32, 32); bytes.writeUInt32LE(24, 36); bytes.writeUInt32LE(1, 40); bytes.writeUInt32LE(0x0d0500, 44);
  bytes.writeUInt32LE(0x1d, 56); bytes.writeUInt32LE(16, 60); bytes.writeUInt32LE(72, 64); bytes.writeUInt32LE(16, 68);
  return bytes;
}
function fixture() {
  const scope = fs.mkdtempSync(path.join(root, '.tmp-standalone-package-macos-relocator-'));
  const app = path.join(scope, 'DataSecure Standalone.app'), contents = path.join(app, 'Contents');
  const server = path.join(contents, 'Resources/server'), roles = layout.nativeRoles(target);
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  const files = [];
  for (const [role, record] of Object.entries(roles)) {
    const bytes = syntheticMachO(role === 'canvas' ? 6 : 2);
    write(path.join(server, record.source), bytes);
    if (record.inventory) files.push({ path: record.inventory, bytes: bytes.length, sha256: hash(bytes), executable: role === 'conversion_node' });
    else write(path.join(server, record.checksum), `${hash(bytes)}\n`);
  }
  write(path.join(server, 'standalone/conversion-runtime/RUNTIME.json'), JSON.stringify({
    schema: 'datasecure-conversion-runtime/1', target, node_file: 'node', files
  }));
  const outside = path.join(scope, 'outside'); fs.mkdirSync(outside);
  write(path.join(outside, 'node'), Buffer.from('unrelated source victim'));
  fs.chmodSync(path.join(outside, 'node'), 0o600);
  for (const name of ['ownership-guard.node', 'datasecure-ownership-guard.node']) {
    write(path.join(outside, name), Buffer.from(`unrelated guard victim: ${name}`));
    fs.chmodSync(path.join(outside, name), 0o600);
  }
  return { scope, app, contents, server, roles, outside };
}
function outsideSnapshot(value) {
  return fs.readdirSync(value.outside).sort().map(name => ({ name,
    hash: hash(fs.readFileSync(path.join(value.outside, name))), mode: fs.statSync(path.join(value.outside, name)).mode & 0o777 }));
}
function remove(value, link = null) {
  if (link && fs.lstatSync(link).isSymbolicLink()) {
    assert.equal(fs.readlinkSync(link), value.outside);
    fs.unlinkSync(link); // Exactly the deliberately created test symlink.
  }
  removePackageSmokeScope(root, value.scope);
}
async function race(role) {
  const value = fixture(), expected = outsideSnapshot(value), plan = planMacNativeRelocation(value.app, target);
  let link = null, child = null, closed = false, timer;
  try {
    child = childProcess.spawn(testHelper, nativeRelocationArguments(plan), {
      env: {}, shell: false, stdio: ['pipe', 'pipe', 'pipe']
    });
    let output = '';
    const completed = new Promise(resolve => {
      child.once('error', () => { closed = true; resolve(-1); });
      child.once('close', code => { closed = true; resolve(code); });
    });
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('MACOS_RELOCATOR_NATIVE_HOOK_TIMEOUT')), 10000);
      child.stdout.on('data', bytes => { output += bytes.toString('utf8'); if (output === 'READY\n') resolve(); });
      child.once('error', reject);
      child.once('close', () => reject(new Error('MACOS_RELOCATOR_NATIVE_HOOK_EARLY_EXIT')));
    });
    clearTimeout(timer);
    // Reproduce the reviewer's race AFTER all helper directory descriptors and
    // sources are held and its last pre-copy pathname check has completed.
    const parents = {
      destination_parent: path.join(value.contents, 'MacOS'),
      source_parent: path.join(value.server, 'standalone/conversion-runtime'),
      canvas_destination_parent: path.join(value.contents, 'Frameworks'),
      sandbox_source_parent: path.join(value.server, `native/${target}`)
    };
    link = parents[role]; assert.ok(link, 'only a fixed fixture parent may be replaced');
    fs.renameSync(link, `${link}-retired`);
    fs.symlinkSync(value.outside, link, 'dir');
    child.stdin.end('g');
    const code = await Promise.race([completed, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('MACOS_RELOCATOR_NATIVE_CLOSE_TIMEOUT')), 10000);
    })]);
    clearTimeout(timer);
    assert.notEqual(code, 0, 'changed parent identity must invalidate the build');
    assert.deepEqual(outsideSnapshot(value), expected, 'no outside copy, chmod or unlink is allowed');
    process.stdout.write(`MACOS RELOCATOR NATIVE PASS (${role})\n`);
  } finally {
    clearTimeout(timer);
    if (child && !closed) {
      child.kill('SIGTERM');
      await new Promise(resolve => { const limit = setTimeout(resolve, 2000); child.once('close', () => { clearTimeout(limit); resolve(); }); });
      if (!closed) throw new Error('MACOS_RELOCATOR_NATIVE_PROCESS_EXIT_UNCONFIRMED');
    }
    remove(value, link);
  }
}

const normal = fixture();
try {
  const before = new Map(Object.entries(normal.roles).map(([role, record]) => [role, fs.readFileSync(path.join(normal.server, record.source))]));
  relocateMacNative(normal.app, target);
  for (const [role, record] of Object.entries(normal.roles)) {
    const destination = path.join(normal.contents, record.destination);
    assert.deepEqual(fs.readFileSync(destination), before.get(role));
    assert.equal(fs.statSync(destination).mode & 0o777, role === 'canvas' ? 0o644 : 0o755);
    assert.equal(fs.existsSync(path.join(normal.server, record.source)), false);
  }
  process.stdout.write('MACOS RELOCATOR NATIVE PASS (production fixed-role relocation)\n');
} finally { remove(normal); }
for (const role of ['conversion_node', 'sandbox', 'canvas']) {
  const fifo = fixture();
  let replacedSource = null;
  try {
    const plan = planMacNativeRelocation(fifo.app, target);
    const source = path.join(fifo.server, fifo.roles[role].source);
    replacedSource = source;
    fs.renameSync(source, `${source}.original`);
    const made = childProcess.spawnSync('/usr/bin/mkfifo', [source], {
      env: {}, shell: false, stdio: 'pipe', timeout: 2000, maxBuffer: 4096
    });
    assert.ifError(made.error); assert.equal(made.status, 0);
    const rejected = childProcess.spawnSync(checkedRelocator(false), nativeRelocationArguments(plan), {
      env: {}, shell: false, stdio: ['ignore', 'pipe', 'pipe'], timeout: 2000, maxBuffer: 4096
    });
    assert.ifError(rejected.error, 'a replaced FIFO must fail immediately, not wait for the outer timeout');
    assert.equal(rejected.status, 65);
    assert.equal(rejected.stderr.toString('utf8'), 'MACOS_RELOCATOR_FAILED\n');
    for (const record of Object.values(fifo.roles)) assert.equal(fs.existsSync(path.join(fifo.contents, record.destination)), false);
    process.stdout.write(`MACOS RELOCATOR NATIVE PASS (FIFO ${role} substitution fails without blocking)\n`);
  } finally {
    if (replacedSource) {
      if (fs.existsSync(replacedSource)) {
        assert.ok(fs.lstatSync(replacedSource).isFIFO());
        fs.unlinkSync(replacedSource); // Exactly the created fixture FIFO, no recursive traversal.
      }
      fs.renameSync(`${replacedSource}.original`, replacedSource);
    }
    remove(fifo);
  }
}
for (const [name, mutate] of [
  ['missing canvas argument', args => args.slice(0, -2)],
  ['unknown canvas flag', args => [...args.slice(0, -2), '--expect-canvas-invalid', args.at(-1)]],
  ['legacy fourth ownership role', args => [...args, '--expect-ownership-guard', args.at(-1)]],
  ['canvas digest mismatch', args => [...args.slice(0, -1), `${args.at(-1).split(':')[0]}:${'0'.repeat(64)}`]],
  ['oversized native role', args => [...args.slice(0, -1), `${128 * 1024 * 1024 + 1}:${args.at(-1).split(':')[1]}`]]
]) {
  const value = fixture();
  try {
    const plan = planMacNativeRelocation(value.app, target);
    const rejected = childProcess.spawnSync(checkedRelocator(false), mutate(nativeRelocationArguments(plan)), {
      env: {}, shell: false, stdio: ['ignore', 'pipe', 'pipe'], timeout: 2000, maxBuffer: 4096
    });
    assert.ifError(rejected.error); assert.equal(rejected.status, 65);
    assert.equal(rejected.stderr.toString('utf8'), 'MACOS_RELOCATOR_FAILED\n');
    for (const item of plan.prepared) {
      assert.deepEqual(fs.readFileSync(item.source), item.sourceRead.bytes);
      assert.equal(fs.existsSync(item.destination), false);
    }
    process.stdout.write(`MACOS RELOCATOR NATIVE PASS (${name} fails before mutation)\n`);
  } finally { remove(value); }
}
await race('destination_parent');
await race('source_parent');
await race('canvas_destination_parent');
await race('sandbox_source_parent');
process.stdout.write('Mac relocation filesystem evidence only; Finder, Gatekeeper and real M2 App UAT remain NOT_RUN.\n');
