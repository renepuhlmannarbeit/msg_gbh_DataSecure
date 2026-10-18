// Build-host measurement only. Apple's immutable /usr/bin dispatch shims can
// have many hardlinks. This grants no write proof and changes no product I/O.
import fs from 'node:fs';
import path from 'node:path';
import bound from '../../plugins/data-secure/server/core/bound-file-io.js';
const aliases = Object.freeze({
  arch: ['/usr/bin/arch', '/usr/bin/machine'], make: ['/usr/bin/make', '/usr/bin/gnumake'],
  tar: ['/usr/bin/tar', '/usr/bin/bsdtar'], xcrun: ['/usr/bin/xcrun'],
  xcodebuild: ['/usr/bin/xcodebuild'], codesign: ['/usr/bin/codesign'], plutil: ['/usr/bin/plutil']
});
const fail = code => { throw Object.assign(Error(code), { code }); };
const maximum = 512 * 1024 * 1024;
export function readAppleSystemTool(role, file, model = {}) {
  const io = model.io || fs, api = model.bound || bound, platform = model.platform || process.platform;
  if (platform !== 'darwin' || !Object.hasOwn(aliases, role) || !aliases[role].includes(file))
    fail('APPLE_SYSTEM_TOOL_ROLE_INVALID');
  const protectedStat = info => {
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0n || (info.mode & 0o022n) ||
        !Number.isSafeInteger(Number(info.nlink)) || info.nlink < 1n || info.nlink > 1024n ||
        info.size < 1n || info.size > BigInt(maximum)) fail('APPLE_SYSTEM_TOOL_UNSAFE');
  };
  const namespace = () => {
    protectedStat(io.lstatSync(file, { bigint: true }));
    for (let current = path.posix.dirname(file); ; current = path.posix.dirname(current)) {
      const info = io.lstatSync(current, { bigint: true });
      if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== 0n || (info.mode & 0o022n))
        fail('APPLE_SYSTEM_TOOL_UNSAFE');
      if (path.posix.dirname(current) === current) break;
    }
  };
  // POSIX checks are supplementary: like the compiler, these tools still
  // require an immutable, trusted runner system namespace (including ACLs).
  const directory = api.bindDirectory(path.posix.dirname(file), { io, platform });
  namespace(); api.assertDirectory(directory);
  const before = io.lstatSync(file, { bigint: true }); protectedStat(before);
  const identity = api.fileIdentity(before, true);
  let fd, bytes, primary, failed = false;
  try {
    fd = io.openSync(file, io.constants.O_RDONLY | io.constants.O_NOFOLLOW | io.constants.O_NONBLOCK);
    const opened = io.fstatSync(fd, { bigint: true }); protectedStat(opened);
    if (!api.sameFile(opened, identity)) fail('APPLE_SYSTEM_TOOL_CHANGED');
    namespace(); api.assertDirectory(directory);
    bytes = api.readHeldBytes(fd, Number(before.size), io, maximum);
    for (const after of [io.fstatSync(fd, { bigint: true }), io.lstatSync(file, { bigint: true })]) {
      protectedStat(after);
      if (!api.sameFile(after, identity)) fail('APPLE_SYSTEM_TOOL_CHANGED');
    }
    namespace(); api.assertDirectory(directory);
  } catch (error) { primary = error; failed = true; }
  finally {
    if (fd !== undefined) {
      const closing = fd; fd = undefined;
      try { io.closeSync(closing); }
      catch { if (!failed) { failed = true; primary = Object.assign(Error('APPLE_SYSTEM_TOOL_CLOSE_FAILED'), { code: 'APPLE_SYSTEM_TOOL_CLOSE_FAILED' }); } }
    }
  }
  if (failed) throw primary;
  namespace(); api.assertDirectory(directory);
  return bytes;
}
