import fs from 'node:fs';
import path from 'node:path';
import boundFileIo from '../../plugins/data-secure/server/core/bound-file-io.js';

const { bindDirectory, assertDirectory, fileIdentity, sameFile, objectIdentity, sameObject } = boundFileIo;
const unsafe = () => Object.assign(new Error('BUILD_ARTIFACT_UNSAFE'), { code: 'BUILD_ARTIFACT_UNSAFE' });

// Never open a checked pathname with O_TRUNC. Verify the held original object
// before truncating/writing that descriptor, or create a new leaf exclusively.
// No rename/delete cleanup is allowed to adopt a replacement object.
export function writeBoundArtifact(target, data, options = {}) {
  const io = options.io || fs;
  const bytes = Buffer.from(data);
  if (bytes.length > 2 * 1024 * 1024) throw unsafe();
  const absolute = path.resolve(target);
  let fd;
  try {
    const parent = bindDirectory(path.dirname(absolute), { io });
    assertDirectory(parent);
    let before;
    try { before = io.lstatSync(absolute, { bigint: true }); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (before && (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n)) throw unsafe();
    fd = io.openSync(absolute, io.constants.O_WRONLY | (io.constants.O_NOFOLLOW || 0) |
      (io.constants.O_NONBLOCK || 0) | (before ? 0 : io.constants.O_CREAT | io.constants.O_EXCL), 0o644);
    const opened = io.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n || (before && !sameFile(opened, fileIdentity(before, true)))) throw unsafe();
    const identity = objectIdentity(opened);
    const verify = () => {
      assertDirectory(parent);
      const held = io.fstatSync(fd, { bigint: true });
      const named = io.lstatSync(absolute, { bigint: true });
      if (!held.isFile() || !named.isFile() || named.isSymbolicLink() || held.nlink !== 1n || named.nlink !== 1n ||
          !sameObject(held, identity) || !sameObject(named, identity)) throw unsafe();
      return held;
    };
    verify();
    io.ftruncateSync(fd, 0);
    let offset = 0;
    while (offset < bytes.length) {
      const count = io.writeSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!Number.isSafeInteger(count) || count < 1 || count > bytes.length - offset) throw unsafe();
      offset += count;
    }
    io.fsyncSync(fd);
    if (verify().size !== BigInt(bytes.length)) throw unsafe();
  } catch { throw unsafe(); }
  finally {
    if (fd !== undefined) {
      const closing = fd;
      fd = undefined;
      try { io.closeSync(closing); } catch { throw unsafe(); }
    }
  }
}
