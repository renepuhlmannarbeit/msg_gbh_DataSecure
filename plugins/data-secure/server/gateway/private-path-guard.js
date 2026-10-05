'use strict';

const path = require('node:path');

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function sameIdentity(left, right) {
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
}

function createPathGuard(privateRoot, io) {
  if (typeof privateRoot !== 'string' || !path.isAbsolute(privateRoot)) {
    throw failure('PRIVATE_ARTIFACT_ROOT_REQUIRED', 'Eine absolute private Artefaktwurzel ist erforderlich.');
  }
  const root = path.resolve(privateRoot);
  let rootIdentity;
  try {
    const volumeRoot = path.parse(root).root;
    let cursor = volumeRoot;
    const rootRelative = path.relative(volumeRoot, root);
    for (const component of rootRelative ? rootRelative.split(path.sep) : []) {
      cursor = path.join(cursor, component);
      if (io.lstatSync(cursor, { bigint: true }).isSymbolicLink()) throw new Error('linked root ancestor');
    }
    const nativeRealpath = io.realpathSync.native || io.realpathSync;
    const realRoot = nativeRealpath(root);
    if (path.relative(root, realRoot) !== '' || path.relative(realRoot, root) !== '') throw new Error('redirected root');
    const named = io.lstatSync(root, { bigint: true });
    const resolved = io.statSync(root, { bigint: true });
    if (!named.isDirectory() || named.isSymbolicLink() || !resolved.isDirectory() || !sameIdentity(named, resolved)) {
      throw new Error('unsafe root');
    }
    rootIdentity = { dev: resolved.dev, ino: resolved.ino };
  } catch {
    throw failure('PRIVATE_ARTIFACT_ROOT_INVALID', 'Die private Artefaktwurzel ist nicht sicher.');
  }

  return function validate(target) {
    if (typeof target !== 'string' || !path.isAbsolute(target)) {
      throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Der Artefaktpfad muss absolut sein.');
    }
    const resolvedTarget = path.resolve(target);
    const relative = path.relative(root, resolvedTarget);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Der Artefaktpfad liegt außerhalb der privaten Wurzel.');
    }
    try {
      const currentRoot = io.lstatSync(root, { bigint: true });
      if (!currentRoot.isDirectory() || currentRoot.isSymbolicLink() || !sameIdentity(currentRoot, rootIdentity)) {
        throw new Error('root changed');
      }
      let cursor = root;
      const parentRelative = path.relative(root, path.dirname(resolvedTarget));
      for (const component of parentRelative ? parentRelative.split(path.sep) : []) {
        if (!component || component === '.' || component === '..') throw new Error('bad component');
        cursor = path.join(cursor, component);
        const named = io.lstatSync(cursor, { bigint: true });
        const resolved = io.statSync(cursor, { bigint: true });
        if (!named.isDirectory() || named.isSymbolicLink() || !resolved.isDirectory() || !sameIdentity(named, resolved)) {
          throw new Error('unsafe ancestor');
        }
      }
    } catch (error) {
      if (error && typeof error.code === 'string' && error.code.startsWith('PRIVATE_ARTIFACT_')) throw error;
      throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Das Artefaktverzeichnis ist nicht sicher.');
    }
    return resolvedTarget;
  };
}

function ensureSafeTarget(target, io, validatePath, requireAbsent = false) {
  target = validatePath(target);
  try {
    const existing = io.lstatSync(target, { bigint: true });
    if (requireAbsent) {
      throw failure('PRIVATE_ARTIFACT_ALREADY_EXISTS', 'Ein privates Artefakt darf in diesem Schnitt nicht ersetzt werden.');
    }
    if (!existing.isFile() || existing.isSymbolicLink()) {
      throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Das Artefaktziel ist nicht sicher.');
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') return target;
    if (error && typeof error.code === 'string' && error.code.startsWith('PRIVATE_ARTIFACT_')) throw error;
    throw failure('PRIVATE_ARTIFACT_PATH_INVALID', 'Das Artefaktziel ist nicht sicher.');
  }
  return target;
}

module.exports = { createPathGuard, ensureSafeTarget, sameIdentity };
