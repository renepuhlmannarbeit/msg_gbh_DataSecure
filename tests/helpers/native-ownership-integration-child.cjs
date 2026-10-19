'use strict';
// Explicit test-only dependency injection. No environment-selected artifact is
// accepted by any production loader; the parent supplies a build manifest.
const fs = require('node:fs');
const path = require('node:path');
let api, kind, cap, target, fault, armed = true, metadataTarget, metadataPending = false;
let configResume, configSnapshot;
const publicationStats = { links: 0, renames: 0, faults: 0 };
const files = new Map();
const io = { ...fs, constants: fs.constants,
  openSync(name, flags, mode) { const fd = fs.openSync(name, flags, mode); files.set(fd, String(name)); return fd; },
  closeSync(fd) { files.delete(fd); return fs.closeSync(fd); },
  writeSync(fd, bytes, offset, length, position) {
    if (armed && fault === 'partial-write' && files.get(fd)?.includes('.prepared-')) {
      fs.writeSync(fd, bytes, offset, Math.min(7, length), position); process.exit(71);
    }
    return fs.writeSync(fd, bytes, offset, length, position);
  },
  linkSync(from, to) {
    fs.linkSync(from, to); publicationStats.links++;
    if (armed && ['metadata-once-link', 'metadata-persistent-link'].includes(fault)) { metadataTarget = to; metadataPending = true; }
    if (armed && fault === 'published-before-ack') process.exit(72);
  },
  renameSync(from, to) {
    fs.renameSync(from, to); publicationStats.renames++;
    if (armed && fault === 'metadata-once-rename') { metadataTarget = to; metadataPending = true; }
    if (armed && fault === 'delegate-before-ack') process.exit(73);
  },
  lstatSync(name, options) {
    if (metadataPending && name === metadataTarget) {
      if (fault !== 'metadata-persistent-link') metadataPending = false;
      publicationStats.faults++;
      throw Object.assign(Error('SIMULATED_POST_PUBLICATION_EIO'), { code: 'EIO' });
    }
    return fs.lstatSync(name, options);
  },
  unlinkSync(name) {
    const final = kind === 'active' ? api.activeLockPath() : kind === 'intake' ? api.reservationPath() : api.claimPath(target);
    if (fault === 'pause-final-unlink' && name === final) {
      process.send({ event: 'guarded-unlink' });
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
      fault = undefined;
    }
    return fs.unlinkSync(name);
  }
};
const token = 'e'.repeat(64);
process.on('message', message => {
  try {
    let value;
    if (message.command === 'initialize') {
      kind = message.kind; fault = message.fault;
      process.env.EU_PRIVACY_DATA_ROOT = message.root;
      process.env.EU_PRIVACY_ROOT = path.join(message.root, 'workspace');
      process.env.DATASECURE_NATIVE_EXPORT_CHANNEL = '1';
      delete process.env.DATASECURE_OWNERSHIP_GUARD_SHA256;
      if (message.artifact) require('../../plugins/data-secure/server/core/ownership-control').configureOwnershipControl(message.artifact);
      if (kind === 'active') api = require('../../plugins/data-secure/server/gateway/batch-active-lock').createBatchActiveLock({ fs: io });
      if (kind === 'intake') api = require('../../plugins/data-secure/server/gateway/batch-intake-reservation').createBatchIntakeReservation({ fs: io });
      if (kind === 'export') {
        const module = require('../../plugins/data-secure/server/gateway/result-export'); api = module._test; target = module.recordPath(token);
      }
      if (kind === 'config') {
        api = require('../../plugins/data-secure/server/gateway/result-folder-config');
        const rename = fs.renameSync;
        fs.renameSync = function(from, to) {
          if (fault === 'pause-config-rename' && to === api.configPath()) {
            process.send({ event: 'guarded-config-rename' });
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);
            fault = undefined;
          }
          return rename.call(fs, from, to);
        };
      }
      value = { node: process.version, pid: process.pid };
    } else if (message.command === 'config-save') { api.saveConfiguredResultRoot(message.path); value = true;
    } else if (message.command === 'config-upgrade') {
      api.prepareConfiguredNativeExportBinding(snapshot => {
        configSnapshot = snapshot;
        process.send({ event: 'config-native-await' });
        return new Promise(resolve => { configResume = resolve; });
      }).then(value => process.send({ id: message.id, ok: true, value }),
        error => process.send({ id: message.id, ok: false, code: error.code || null, message: error.message }));
      return;
    } else if (message.command === 'config-resume') {
      fault = message.pauseRename ? 'pause-config-rename' : undefined;
      const id = { volume: '1', object: '2', created_ns: '3' };
      configResume({ schema: 'datasecure-native-export-binding/1', root: configSnapshot.root,
        root_identity: id, data_root_identity: id, private_name: `native-export-${'a'.repeat(32)}`,
        private_identity: id, anonymize_identity: id, markdown_identity: id });
      configResume = null; value = true;
    } else if (message.command === 'acquire') {
      if (kind === 'active') { value = api.acquireActiveLock(token); cap = token; }
      if (kind === 'intake') { cap = api.reserveIntake(); value = cap; }
      if (kind === 'export') { cap = api.acquireExportClaim(target, { fs: io }); value = Boolean(cap); }
    } else if (message.command === 'release' || message.command === 'release-pause') {
      if (message.command === 'release-pause') fault = 'pause-final-unlink';
      if (kind === 'active') value = api.releaseActiveLock(token);
      if (kind === 'intake') value = api.releaseIntake(message.idValue || cap?.reservation_id);
      if (kind === 'export') value = api.releaseExportClaim(target, cap, { fs: io });
    } else if (message.command === 'foreign-release') {
      if (kind === 'active') value = require('../../plugins/data-secure/server/gateway/batch-active-lock').createBatchActiveLock().releaseActiveLock(token);
      if (kind === 'intake') value = require('../../plugins/data-secure/server/gateway/batch-intake-reservation').createBatchIntakeReservation().releaseIntake(cap.reservation_id);
      if (kind === 'export') value = api.releaseExportClaim(target, JSON.parse(JSON.stringify(cap)));
    } else if (message.command === 'delegate') value = api.delegateIntake(cap.reservation_id, message.pid);
    else if (message.command === 'publication-stats') value = { ...publicationStats };
    else if (message.command === 'disarm') { armed = false; value = true; }
    else throw Error('UNKNOWN_TEST_COMMAND');
    process.send({ id: message.id, ok: true, value });
  } catch (error) { process.send({ id: message.id, ok: false, code: error.code || null, message: error.message }); }
});
