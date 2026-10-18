'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError, dataRoot } = require('../runtime');
const { batchRoot } = require('./batch-private-store');
const { processAlive: probeProcessAlive } = require('./process-liveness');
const { ownerRecordIo } = require('./batch-active-lock');

const LEGACY_SCHEMA = 'datasecure-intake-reservation/1';
const RESERVATION_SCHEMA = 'datasecure-intake-reservation/2';
const NATIVE_RESERVATION_SCHEMA = 'datasecure-intake-reservation/3';
const DELEGATE_SCHEMA = 'datasecure-intake-reservation-delegate/1';
const RESERVATION_ID_RE = /^[a-f0-9]{64}$/;
const NONCE_RE = /^[a-f0-9]{32}$/;

function createBatchIntakeReservation(deps = {}) {
  const io = deps.fs || fs, processApi = deps.process || process;
  const now = deps.now || (() => new Date());
  const randomId = deps.randomId || (() => crypto.randomBytes(32).toString('hex'));
  const acquisitions = new Map();
  const releaseIntents = new Map();
  const controlled = action => {
    try { return (deps.withOwnershipControl || require('../core/ownership-control').withOwnershipControl)(dataRoot(), action); }
    catch (error) {
      // Only exact guard contention may preserve automatic cleanup intent.
      // Resolver/storage errors can be uncoded and can precede the record read;
      // restoring their namespace must not silently heal a hard failure.
      // Keep acquisitions: a later NEW explicit release still needs its proof.
      if (error?.code !== 'OWNERSHIP_GUARD_BUSY') releaseIntents.clear();
      throw error;
    }
  };
  const native = () => process.env.DATASECURE_NATIVE_EXPORT_CHANNEL === '1';
  function reservationPath() { return path.join(batchRoot(), 'intake-reservation.json'); }
  function delegatePath() { return path.join(batchRoot(), 'intake-reservation-delegate.json'); }
  function processAlive(pid) { return probeProcessAlive(pid, (candidate, signal) => processApi.kill(candidate, signal)); }
  const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const owner = value => value && Number.isSafeInteger(value.pid) && value.pid > 0 && timestamp(value.created_at);
  function validReservation(value) {
    const keys = ['schema', 'reservation_id', 'record_id', 'pid', 'created_at', 'prepared_nonce'];
    if (value?.delegate !== undefined) keys.push('delegate');
    const unified = value && Object.keys(value).sort().join(',') === keys.sort().join(',') &&
      typeof value.reservation_id === 'string' && typeof value.record_id === 'string' &&
      typeof value.prepared_nonce === 'string' && NONCE_RE.test(value.prepared_nonce) &&
      (value.delegate === undefined || Object.keys(value.delegate).sort().join(',') === 'created_at,pid');
    return Boolean(owner(value) && RESERVATION_ID_RE.test(value.reservation_id) &&
      (value.schema === LEGACY_SCHEMA || unified && [RESERVATION_SCHEMA, NATIVE_RESERVATION_SCHEMA].includes(value.schema) && NONCE_RE.test(value.record_id) &&
        (value.delegate === undefined || owner(value.delegate))) &&
      (value.prepared_nonce === undefined || NONCE_RE.test(value.prepared_nonce)));
  }
  function validDelegate(value) { return Boolean(owner(value) && value.schema === DELEGATE_SCHEMA && RESERVATION_ID_RE.test(value.reservation_id)); }
  const read = (target, validator) => ownerRecordIo.readOwnerRecord(target, validator, io);
  function readReservation() {
    const reservation = read(reservationPath(), validReservation);
    // Only called inside controlled(). A worker may have removed the record
    // before its parent's exit handler runs. Forget capabilities that no longer
    // name the current file epoch; a later restoration must not revive them.
    if (reservation.state === 'missing' || reservation.state === 'valid') {
      for (const [id, acquired] of acquisitions) {
        if (!same(reservation, acquired)) { acquisitions.delete(id); releaseIntents.delete(id); }
      }
    } else {
      // An unreadable/invalid record is not evidence that acquisition ended,
      // but it cannot keep an automatic release authorized after a hard error.
      releaseIntents.clear();
    }
    return reservation;
  }
  function same(left, right) {
    return Boolean(left?.state === 'valid' && right?.state === 'valid' &&
      JSON.stringify(left.value) === JSON.stringify(right.value) && left.identity.dev === right.identity.dev &&
      left.identity.ino === right.identity.ino && left.identity.size === right.identity.size &&
      left.identity.birth === right.identity.birth);
  }
  function remove(target, expected, validator, guard) {
    if (!same(read(target, validator), expected)) return false;
    try { guard.assertHeld(); io.unlinkSync(target); return true; }
    catch (error) { if (String(error?.code).startsWith('OWNERSHIP_GUARD_')) throw error; return false; }
  }
  function delegateFor(reservation) {
    const old = read(delegatePath(), validDelegate);
    if (reservation.value.schema !== LEGACY_SCHEMA) {
      // A stray old two-file protocol is not silently discarded or combined.
      if (old.state !== 'missing') return false;
      return reservation.value.delegate ? { value: reservation.value.delegate } : null;
    }
    if (old.state === 'missing') return null;
    return old.state === 'valid' && old.value.reservation_id === reservation.value.reservation_id ? old : false;
  }
  function stale(reservation) {
    if (!compatible(reservation) || processAlive(reservation.value.pid)) return false;
    const delegate = delegateFor(reservation);
    return delegate !== false && (!delegate || !processAlive(delegate.value.pid));
  }
  function removeReservation(reservation, guard) {
    const delegate = delegateFor(reservation);
    if (delegate === false) return false;
    if (reservation.value.schema === LEGACY_SCHEMA && delegate &&
        !remove(delegatePath(), delegate, validDelegate, guard)) return false;
    return remove(reservationPath(), reservation, validReservation, guard);
  }
  function rememberPublication(id, action) {
    const remember = record => { acquisitions.set(id, record); releaseIntents.delete(id); return record; };
    try { return remember(action()); }
    catch (error) {
      const committed = ownerRecordIo.publishedOwnerRecord(error);
      if (committed) remember(committed);
      throw error;
    }
  }
  function compatible(reservation) {
    return native() ? reservation.value.schema === NATIVE_RESERVATION_SCHEMA :
      [LEGACY_SCHEMA, RESERVATION_SCHEMA].includes(reservation.value.schema);
  }
  function removeReleasedReservation(reservation, guard) {
    const id = reservation.value.reservation_id;
    try {
      const removed = removeReservation(reservation, guard);
      // A failed removal is not ordinary guard contention. Do not turn its
      // uncertain/hard IO outcome into a later automatic success.
      releaseIntents.delete(id);
      if (removed) acquisitions.delete(id);
      return removed;
    } catch (error) {
      if (error?.code !== 'OWNERSHIP_GUARD_BUSY') releaseIntents.delete(id);
      throw error;
    }
  }
  function releaseIntendedReservation(reservation, guard) {
    const id = reservation.value.reservation_id, intended = releaseIntents.get(id);
    if (!intended || intended !== acquisitions.get(id) || !same(reservation, intended) ||
        reservation.value.pid !== processApi.pid) return false;
    const delegate = delegateFor(reservation);
    if (!compatible(reservation) || delegate === false) { releaseIntents.delete(id); return false; }
    // ESRCH is the only liveness result that permits parent-side reclamation.
    // A live picker without an explicit release intent never reaches this path.
    if (delegate && processAlive(delegate.value.pid)) return false;
    return removeReleasedReservation(reservation, guard);
  }
  function reserveIntake() { return controlled(guard => {
    const id = randomId();
    if (!RESERVATION_ID_RE.test(id)) throw new SafeError('Die lokale Stapelreservierung konnte nicht sicher erzeugt werden.');
    const existing = readReservation();
    if (existing.state !== 'missing' && (existing.state !== 'valid' ||
        !(releaseIntendedReservation(existing, guard) || stale(existing) && removeReservation(existing, guard))) ||
        read(delegatePath(), validDelegate).state !== 'missing') {
      throw new SafeError('Eine lokale DataSecure-Dateiauswahl oder Stapelübernahme ist bereits aktiv.');
    }
    const value = { schema: native() ? NATIVE_RESERVATION_SCHEMA : RESERVATION_SCHEMA,
      reservation_id: id, record_id: crypto.randomBytes(16).toString('hex'),
      pid: processApi.pid, created_at: now().toISOString() };
    try { rememberPublication(id, () => ownerRecordIo.publishOwnerRecord(reservationPath(), value, guard, io)); }
    catch (error) {
      if (String(error?.code).startsWith('OWNERSHIP_GUARD_')) throw error;
      throw new SafeError('Die lokale Stapelreservierung konnte nicht sicher erzeugt werden.');
    }
    return Object.freeze({ reservation_id: id });
  }); }
  function delegateIntake(reservationId, pid) { return controlled(guard => {
    const id = typeof reservationId === 'string' ? reservationId : '';
    const reservation = readReservation();
    if (!RESERVATION_ID_RE.test(id) || !Number.isSafeInteger(pid) || pid <= 0 || !processAlive(pid) ||
        !same(reservation, acquisitions.get(id)) || reservation.value.pid !== processApi.pid ||
        reservation.value.delegate !== undefined || delegateFor(reservation) !== null) {
      throw new SafeError('Die lokale Stapelreservierung konnte nicht sicher an den Worker übergeben werden.');
    }
    // One fully written record atomically replaces the parent record. The
    // delegate is authoritative before the parent's ACK; a lost ACK cannot
    // authorize parent cleanup of a still-live worker.
    const value = { ...reservation.value, delegate: { pid, created_at: now().toISOString() } };
    rememberPublication(id, () => ownerRecordIo.publishOwnerRecord(reservationPath(), value, guard, io, reservation));
    return true;
  }); }
  function releaseIntake(reservationId) {
    const id = typeof reservationId === 'string' ? reservationId : '';
    const acquired = acquisitions.get(id);
    // Remember the exact parent's abandonment BEFORE trying the nonblocking
    // OS guard. Exit callbacks cannot wait for contention, and must not need a
    // timer or PID-only authority to finish this same cleanup on a later call.
    if (RESERVATION_ID_RE.test(id) && acquired?.value.pid === processApi.pid && compatible(acquired))
      releaseIntents.set(id, acquired);
    try { return controlled(guard => {
      if (!RESERVATION_ID_RE.test(id)) return false;
      const reservation = readReservation();
      if (reservation.state !== 'valid' || reservation.value.reservation_id !== id || !compatible(reservation)) return false;
      const delegate = delegateFor(reservation);
      if (delegate === false) { releaseIntents.delete(id); return false; }
      // Parent authority comes only from this factory's acquisition. Worker
      // authority is the unguessable private-IPC reservation capability AND the
      // exact delegated PID, never merely a matching parent PID on disk.
      const delegated = delegate && delegate.value.pid === processApi.pid;
      if (!delegated && (!same(reservation, acquisitions.get(id)) || reservation.value.pid !== processApi.pid ||
          delegate && processAlive(delegate.value.pid))) return false;
      return removeReleasedReservation(reservation, guard);
    }); } catch (error) {
      if (error?.code !== 'OWNERSHIP_GUARD_BUSY') releaseIntents.delete(id);
      throw error;
    }
  }
  function intakeReservationActive() { return controlled(guard => {
    const reservation = readReservation();
    if (reservation.state === 'missing') return read(delegatePath(), validDelegate).state !== 'missing';
    if (reservation.state !== 'valid') return true;
    if (releaseIntendedReservation(reservation, guard)) return false;
    if (!stale(reservation)) return true;
    return !removeReservation(reservation, guard);
  }); }
  return { reservationPath, delegatePath, reserveIntake, delegateIntake, releaseIntake,
    intakeReservationActive, validReservation, validDelegate };
}
const reservation = createBatchIntakeReservation();
module.exports = { ...reservation, createBatchIntakeReservation, RESERVATION_ID_RE };
