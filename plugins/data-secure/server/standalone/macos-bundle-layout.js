'use strict';

// A macOS-only packaging adapter. Logical conversion inventory names remain
// portable; native files have fixed, flat Apple bundle locations. No path is
// taken from the renderer, a manifest, PATH or an environment override.
const path = require('node:path');

const LAYOUT = 'datasecure-macos-native-layout/2';
const STATIC_OWNERSHIP_BUILTIN = Object.freeze({ name: 'datasecure_ownership_guard',
  abi: 1, napi: 8, node: '22.23.2' });

function nativeRoles(target) {
  if (!['macos-x64', 'macos-arm64'].includes(target)) throw new Error('MACOS_NATIVE_TARGET_INVALID');
  const arch = target.slice(6);
  return Object.freeze({
    conversion_node: Object.freeze({ source: 'standalone/conversion-runtime/node',
      destination: 'MacOS/datasecure-conversion-node', inventory: 'node' }),
    sandbox: Object.freeze({ source: `native/${target}/datasecure-sandbox`,
      destination: 'MacOS/datasecure-sandbox', checksum: `native/${target}/datasecure-sandbox.sha256` }),
    canvas: Object.freeze({ source: `standalone/conversion-runtime/node_modules/@napi-rs/canvas-darwin-${arch}/skia.darwin-${arch}.node`,
      destination: `Frameworks/skia.darwin-${arch}.node`,
      inventory: `node_modules/@napi-rs/canvas-darwin-${arch}/skia.darwin-${arch}.node` })
  });
}

function bundleContext(serverDirectory, platform = process.platform, arch = process.arch) {
  if (platform !== 'darwin' || !['x64', 'arm64'].includes(arch)) return null;
  const server = path.resolve(serverDirectory);
  const resources = path.dirname(server), contents = path.dirname(resources), app = path.dirname(contents);
  if (path.basename(server) !== 'server' || path.basename(resources) !== 'Resources' ||
      path.basename(contents) !== 'Contents' || !path.basename(app).endsWith('.app')) return null;
  const target = `macos-${arch}`, roles = nativeRoles(target);
  return Object.freeze({ server, contents, app, target, roles,
    core: path.join(contents, 'MacOS', 'datasecure-core'), ownershipBuiltin: STATIC_OWNERSHIP_BUILTIN });
}

function roleFile(context, role) {
  const record = context?.roles?.[role];
  if (!record) throw new Error('MACOS_NATIVE_ROLE_INVALID');
  return path.join(context.contents, ...record.destination.split('/'));
}

module.exports = { LAYOUT, nativeRoles, bundleContext, roleFile, STATIC_OWNERSHIP_BUILTIN };
