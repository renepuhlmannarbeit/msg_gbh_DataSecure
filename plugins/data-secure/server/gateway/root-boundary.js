'use strict';

// Dependency leaf for both configuration directions and runtime root creation.
// Do not import common/privacy-config/result-folder-config here: the same gate
// must run before either configuration writer or the private root creator.
const fs = require('fs');
const path = require('path');
const { dataRoot } = require('../runtime');
const { readReservations, publishReservations, SCHEMA } = require('./root-reservations');
const verifiedSettingsParents = new Map();

function unsafe() {
  const error = new Error('PRIVACY_STORAGE_UNSAFE');
  error.code = 'PRIVACY_STORAGE_UNSAFE';
  return error;
}

function canonicalPath(target) {
  if (typeof target !== 'string' || !target.trim() || !path.isAbsolute(target)) throw unsafe();
  let probe = path.resolve(target);
  const suffix = [];
  for (;;) {
    try {
      const stat = fs.lstatSync(probe);
      if (!stat.isDirectory() && !stat.isSymbolicLink()) throw unsafe();
      const resolved = path.join(fs.realpathSync.native(probe), ...suffix);
      // macOS commonly uses case-insensitive APFS. Conservatively fold there
      // too; a case-sensitive volume may reject a rare legitimate sibling,
      // but must never permit a not-yet-created alias of a private directory.
      return ['win32', 'darwin'].includes(process.platform) ? resolved.toLowerCase() : resolved;
    } catch (error) {
      if (error.code !== 'ENOENT') throw unsafe();
      const parent = path.dirname(probe);
      if (parent === probe) throw unsafe();
      suffix.unshift(path.basename(probe));
      probe = parent;
    }
  }
}

function canonicalPathsOverlap(a, b) {
  const contains = (base, candidate) => {
    const relative = path.relative(base, candidate);
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
  };
  return contains(a, b) || contains(b, a);
}
function pathsOverlap(left, right) { return canonicalPathsOverlap(canonicalPath(left), canonicalPath(right)); }

function assertSettingsParent(directory) {
  const requested = path.join(directory, 'settings');
  let probe = requested, stat;
  for (;;) {
    try { stat = fs.lstatSync(probe); break; }
    catch (error) {
      if (error.code !== 'ENOENT' || path.dirname(probe) === probe) throw unsafe();
      probe = path.dirname(probe);
    }
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw unsafe();
  const real = fs.realpathSync.native(probe);
  const cached = verifiedSettingsParents.get(requested);
  // Cache only the verified parent identity, never configuration contents or
  // overlap decisions. realpath is rechecked so an ancestor redirection cannot
  // retain trust. This avoids repeated full ancestor walks for every document.
  if (cached && cached.probe === probe && cached.real === real && cached.dev === stat.dev && cached.ino === stat.ino) return;
  for (let ancestor = path.dirname(probe); ; ancestor = path.dirname(ancestor)) {
    const parent = fs.lstatSync(ancestor);
    if (!parent.isDirectory() || parent.isSymbolicLink()) throw unsafe();
    if (path.dirname(ancestor) === ancestor) break;
  }
  if (verifiedSettingsParents.size >= 64) verifiedSettingsParents.clear();
  verifiedSettingsParents.set(requested, { probe, real, dev: stat.dev, ino: stat.ino });
}

// Missing settings are normal on first start; unreadable or redirected settings
// cannot silently remove a known separation requirement. No directories are
// created here. Legacy result records still shield their recorded destination,
// even when that directory was removed or its identity has since changed.
function readRootRecord(directory, name) {
  const file = path.join(directory, 'settings', name);
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 4096) throw unsafe();
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    const supported = name === 'privacy-root.json' ? value?.version === 1 :
      ['datasecure-result-root/1', 'datasecure-result-root/2'].includes(value?.schema);
    if (!supported || typeof value.root !== 'string' || !path.isAbsolute(value.root)) throw unsafe();
    return path.resolve(value.root);
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw unsafe();
  }
}

function rootConfiguration(options = {}) {
  const internal = path.resolve(options.dataRoot || dataRoot());
  let parentVerified = false;
  const readRoot = name => {
    if (!parentVerified) {
      try { assertSettingsParent(internal); parentVerified = true; }
      catch { throw unsafe(); }
    }
    return readRootRecord(internal, name);
  };
  const privacyOverride = String(process.env.EU_PRIVACY_ROOT || '').trim();
  const resultOverride = String(process.env.EU_PRIVACY_RESULT_ROOT || '').trim();
  const selectedPrivacy = options.privacyRoot !== undefined ? options.privacyRoot :
    options.resetPrivacy === true ? path.join(internal, 'workspace') :
      privacyOverride || readRoot('privacy-root.json') || path.join(internal, 'workspace');
  const selectedResult = options.resultRoot !== undefined ? options.resultRoot :
    options.resetResult === true ? '' : readRoot('result-root.json');
  const privateRoots = [...new Set([internal, selectedPrivacy, privacyOverride].filter(Boolean))];
  const publicRoots = [...new Set([selectedResult, resultOverride].filter(Boolean))];
  if (!parentVerified) {
    try { assertSettingsParent(internal); }
    catch { throw unsafe(); }
  }
  return { internal, privateRoots, publicRoots };
}

function checkConfiguration(configuration) {
  const historical = readReservations(configuration.internal);
  const canonicalCache = new Map();
  const canonical = root => {
    const key = ['win32', 'darwin'].includes(process.platform) ? path.resolve(root).toLowerCase() : path.resolve(root);
    if (!canonicalCache.has(key)) canonicalCache.set(key, canonicalPath(root));
    return canonicalCache.get(key);
  };
  const privateRoots = [...new Set([...configuration.privateRoots, ...historical.filter(item => item.kind === 'private').map(item => item.root)])];
  const publicRoots = [...new Set([...configuration.publicRoots, ...historical.filter(item => item.kind === 'public').map(item => item.root)])];
  // Validate the private paths even without a result destination, before a
  // writer could follow a bad/non-directory path. Canonicalization resolves
  // existing prefixes and does not create a missing future directory.
  const privatePaths = [...new Set(privateRoots.map(canonical))];
  for (const visible of publicRoots) {
    const visiblePath = canonical(visible);
    for (const privatePath of privatePaths) if (canonicalPathsOverlap(privatePath, visiblePath)) throw unsafe();
  }
  return [...privatePaths.map(root => ({ schema: SCHEMA, kind: 'private', root })),
    ...publicRoots.map(canonical).map(root => ({ schema: SCHEMA, kind: 'public', root }))];
}

function assertRootSeparation(options = {}) { checkConfiguration(rootConfiguration(options)); return true; }

// Only configuration/root-creation boundaries persist reservations, not reads,
// diagnostics or startup refusal. Include both sides of a transition so reset
// or changing a selection cannot silently reclassify previously used storage.
function reserveRootSeparation(options = {}) {
  const current = rootConfiguration();
  const next = rootConfiguration(options);
  const combined = { internal: next.internal,
    privateRoots: [...new Set([...current.privateRoots, ...next.privateRoots])],
    publicRoots: [...new Set([...current.publicRoots, ...next.publicRoots])] };
  const records = checkConfiguration(combined);
  publishReservations(next.internal, records);
  // A competing role reservation can only stop the transition, never authorize
  // colliding roots. No configuration is changed before this second check.
  assertRootSeparation(options);
  return true;
}

module.exports = { canonicalPath, pathsOverlap, assertRootSeparation, reserveRootSeparation };
