import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import boundFileIo from '../../plugins/data-secure/server/core/bound-file-io.js';
import layout from '../../plugins/data-secure/server/standalone/macos-bundle-layout.js';
import { inspectMachO } from './macos-native-contract.mjs';
import { checkedRelocator } from './macos-build-relocator.mjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fail = () => { throw new Error('STANDALONE_MACOS_NATIVE_LAYOUT_INVALID'); };

function read(file, maximum = 128 * 1024 * 1024, directory = undefined) {
  return boundFileIo.readBoundFileRecord(file, { maximum, checkCtime: true, ...(directory ? { directory } : {}) });
}

function sameFile(left, right) {
  return ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => left[key] === right[key]);
}

function replaceChecked(file, expected, bytes, parent = boundFileIo.bindDirectory(path.dirname(file))) {
  boundFileIo.assertDirectory(parent);
  const descriptor = fs.openSync(file, fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0));
  try {
    if (!sameFile(fs.fstatSync(descriptor, { bigint: true }), expected) ||
        !sameFile(fs.lstatSync(file, { bigint: true }), expected)) fail();
    boundFileIo.assertDirectory(parent);
    fs.ftruncateSync(descriptor, 0);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
}

export function macNativeContext(app, target) {
  const resolved = path.resolve(app);
  if (path.basename(resolved) !== 'DataSecure Standalone.app') fail();
  for (const directory of [resolved, path.join(resolved, 'Contents'),
    path.join(resolved, 'Contents/MacOS'), path.join(resolved, 'Contents/Resources'),
    path.join(resolved, 'Contents/Resources/server')]) boundFileIo.bindDirectory(directory);
  const context = layout.bundleContext(path.join(resolved, 'Contents/Resources/server'), 'darwin', target.slice(6));
  if (!context || context.target !== target) fail();
  return context;
}

// Read-only planning may run on any build host. Actual relocation below is
// exclusively delegated to the macOS descriptor-relative build helper.
export function planMacNativeRelocation(app, target) {
  const context = macNativeContext(app, target);
  const manifestFile = path.join(context.server, 'standalone/conversion-runtime/RUNTIME.json');
  const manifestParent = boundFileIo.bindDirectory(path.dirname(manifestFile));
  const manifestRead = read(manifestFile, 2 * 1024 * 1024, manifestParent), manifest = JSON.parse(manifestRead.bytes);
  if (manifest.schema !== 'datasecure-conversion-runtime/1' || manifest.target !== target ||
      manifest.native_layout !== undefined || !Array.isArray(manifest.files)) fail();
  const prepared = Object.entries(context.roles).map(([role, record]) => {
    const source = path.join(context.server, ...record.source.split('/'));
    const sourceParent = boundFileIo.bindDirectory(path.dirname(source));
    const destination = layout.roleFile(context, role), sourceRead = read(source,
      128 * 1024 * 1024, sourceParent);
    const native = inspectMachO(sourceRead.bytes);
    if (!native || native.architecture !== target.slice(6) ||
        native.fileType !== (role === 'canvas' ? 6 : 2) ||
        !native.signed || fs.existsSync(destination)) fail();
    if (record.inventory) {
      const entries = manifest.files.filter(entry => entry.path === record.inventory);
      if (entries.length !== 1 || entries[0].bytes !== sourceRead.bytes.length ||
          entries[0].sha256 !== hash(sourceRead.bytes)) fail();
    } else if (read(path.join(context.server, ...record.checksum.split('/')), 128).bytes.toString('utf8').trim() !== hash(sourceRead.bytes)) fail();
    return { role, source, destination, sourceRead, sourceParent };
  });
  const appParent = boundFileIo.bindDirectory(context.app), appIdentity = fs.lstatSync(context.app, { bigint: true });
  return { context, manifestFile, manifestRead, manifestParent, prepared, appParent, appIdentity };
}

export function nativeRelocationArguments(plan) {
  // bindDirectory has already rejected user-created redirects. Its canonical
  // name only resolves macOS's OS-owned /tmp, /var and /etc aliases for openat.
  return ['--app', plan.appParent.real, '--target', plan.context.target,
    '--app-id', `${plan.appIdentity.dev}:${plan.appIdentity.ino}`,
    ...plan.prepared.flatMap(item => [`--expect-${({ conversion_node: 'node', sandbox: 'sandbox', canvas: 'canvas' })[item.role]}`,
      `${item.sourceRead.bytes.length}:${hash(item.sourceRead.bytes)}`])];
}

export function relocateMacNative(app, target) {
  if (process.platform !== 'darwin') throw new Error('MACOS_RELOCATOR_NATIVE_HOST_REQUIRED');
  const helper = checkedRelocator(false), plan = planMacNativeRelocation(app, target);
  boundFileIo.assertDirectory(plan.appParent);
  const result = childProcess.spawnSync(helper, nativeRelocationArguments(plan), {
    env: {}, shell: false, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 4096
  });
  if (result.error || result.status !== 0 || result.stdout.length || result.stderr.length)
    throw new Error('STANDALONE_MACOS_NATIVE_RELOCATION_FAILED');
  const { context, manifestFile, manifestRead, manifestParent, prepared } = plan;
  boundFileIo.assertDirectory(plan.appParent);
  for (const item of prepared) {
    boundFileIo.assertDirectory(item.sourceParent);
    if (!read(item.destination, 128 * 1024 * 1024)
      .bytes.equals(item.sourceRead.bytes) || fs.existsSync(item.source)) fail();
  }
  const manifest = JSON.parse(manifestRead.bytes);
  manifest.native_layout = layout.LAYOUT;
  replaceChecked(manifestFile, manifestRead.stat, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), manifestParent);
  return { target, roles: prepared.map(({ role }) => role) };
}

// Current engineering signing preserves the verified converter/addon/guard/sandbox
// signatures and bytes. Record that once before the outer seal; do not turn a
// modified native file into a trusted one by merely recomputing its checksum.
// A later Developer-ID signing policy needs an explicit new source contract.
export function finalizeMacNativeInventory(app, target) {
  const context = macNativeContext(app, target);
  const manifestFile = path.join(context.server, 'standalone/conversion-runtime/RUNTIME.json');
  const manifestParent = boundFileIo.bindDirectory(path.dirname(manifestFile));
  const manifestRead = read(manifestFile, 2 * 1024 * 1024, manifestParent), manifest = JSON.parse(manifestRead.bytes);
  if (manifest.schema !== 'datasecure-conversion-runtime/1' || manifest.node_file !== 'node' ||
      manifest.target !== target || manifest.native_layout !== layout.LAYOUT || !Array.isArray(manifest.files) ||
      manifest.native_inventory_finalized !== undefined || manifest.files.some(entry =>
        !entry || typeof entry.path !== 'string' || !/^[A-Za-z0-9_@.+/-]+$/u.test(entry.path) ||
        entry.path.split('/').some(part => !part || part === '.' || part === '..') ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/u.test(entry.sha256 || '') ||
        entry.source_sha256 !== undefined)) fail();
  for (const [role, record] of Object.entries(context.roles)) {
    const actual = read(layout.roleFile(context, role),
      128 * 1024 * 1024).bytes;
    if (fs.existsSync(path.join(context.server, ...record.source.split('/')))) fail();
    if (record.inventory) {
      const entries = manifest.files.filter(entry => entry.path === record.inventory);
      if (entries.length !== 1 || entries[0].bytes !== actual.length || entries[0].sha256 !== hash(actual)) fail();
      entries[0].source_sha256 = entries[0].sha256;
    } else {
      const checksumFile = path.join(context.server, ...record.checksum.split('/'));
      if (read(checksumFile, 128).bytes.toString('utf8').trim() !== hash(actual)) fail();
    }
  }
  manifest.native_inventory_finalized = true;
  replaceChecked(manifestFile, manifestRead.stat, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), manifestParent);
}
