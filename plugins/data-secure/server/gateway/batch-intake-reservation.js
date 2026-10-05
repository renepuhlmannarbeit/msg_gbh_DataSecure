'use strict';
const { readHeldBytes } = require('../core/bound-file-io');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SafeError } = require('../runtime');
const { batchRoot } = require('./batch-private-store');
const { processAlive: probeProcessAlive } = require('./process-liveness');

const RESERVATION_SCHEMA = 'datasecure-intake-reservation/1';
const DELEGATE_SCHEMA = 'datasecure-intake-reservation-delegate/1';
const RESERVATION_ID_RE = /^[a-f0-9]{64}$/;
const MAX_RECORD_BYTES = 4096;

function createBatchIntakeReservation(deps = {}) {
  const io = deps.fs || fs;
  const processApi = deps.process || process;
  const now = deps.now || (() => new Date());
  const randomId = deps.randomId || (() => crypto.randomBytes(32).toString('hex'));

  function reservationPath() { return path.join(batchRoot(), 'intake-reservation.json'); }
  function delegatePath() { return path.join(batchRoot(), 'intake-reservation-delegate.json'); }
  function processAlive(pid) {
    return probeProcessAlive(pid, (candidate, signal) => processApi.kill(candidate, signal));
  }
  function validTimestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
  function validReservation(value) {
    return Boolean(value && value.schema === RESERVATION_SCHEMA && RESERVATION_ID_RE.test(value.reservation_id) &&
      Number.isSafeInteger(value.pid) && value.pid > 0 && validTimestamp(value.created_at));
  }
  function validDelegate(value) {
    return Boolean(value && value.schema === DELEGATE_SCHEMA && RESERVATION_ID_RE.test(value.reservation_id) &&
      Number.isSafeInteger(value.pid) && value.pid > 0 && validTimestamp(value.created_at));
  }
  function readRecord(target, validator) {
    let descriptor;
    try {
      descriptor = io.openSync(target, io.constants.O_RDONLY | (io.constants.O_NOFOLLOW || 0) | (io.constants.O_NONBLOCK || 0));
      const opened = io.fstatSync(descriptor);
      const named = io.lstatSync(target);
      if (!opened.isFile() || !named.isFile() || named.isSymbolicLink() ||
          opened.dev !== named.dev || opened.ino !== named.ino || opened.size < 1 || opened.size > MAX_RECORD_BYTES) {
        return { state: 'invalid' };
      }
      const value = JSON.parse(readHeldBytes(descriptor, opened.size, io).toString('utf8'));
      if (!validator(value)) return { state: 'invalid' };
      return { state: 'valid', value, identity: { dev: opened.dev, ino: opened.ino, size: opened.size } };
    } catch (error) {
      if (error?.code === 'ENOENT') return { state: 'missing' };
      return { state: 'invalid' };
    } finally {
      if (descriptor !== undefined) {
        try { io.closeSync(descriptor); } catch { /* unreadable remains fail-closed */ }
      }
    }
  }
  function readReservation() { return readRecord(reservationPath(), validReservation); }
  function readDelegate() { return readRecord(delegatePath(), validDelegate); }
  function sameRecord(left, right) {
    return Boolean(left?.state === 'valid' && right?.state === 'valid' &&
      JSON.stringify(left.value) === JSON.stringify(right.value) &&
      left.identity.dev === right.identity.dev && left.identity.ino === right.identity.ino &&
      left.identity.size === right.identity.size);
  }
  function unlinkIfUnchanged(target, expected, validator) {
    const current = readRecord(target, validator);
    if (!sameRecord(current, expected)) return false;
    try { io.unlinkSync(target); return true; } catch { return false; }
  }
  function matchingDelegate(reservation) {
    const delegate = readDelegate();
    if (delegate.state === 'missing') return null;
    if (delegate.state !== 'valid' || delegate.value.reservation_id !== reservation.value.reservation_id) return false;
    return delegate;
  }
  function staleReservation(reservation) {
    if (processAlive(reservation.value.pid)) return false;
    const delegate = matchingDelegate(reservation);
    if (delegate === false) return false;
    return !delegate || !processAlive(delegate.value.pid);
  }
  function removeStale(reservation) {
    const delegate = matchingDelegate(reservation);
    if (delegate === false) return false;
    if (delegate && !unlinkIfUnchanged(delegatePath(), delegate, validDelegate)) return false;
    return unlinkIfUnchanged(reservationPath(), reservation, validReservation);
  }
  function writeReservation(target, value) {
    io.writeFileSync(target, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  }
  function reserveIntake() {
    const id = randomId();
    if (!RESERVATION_ID_RE.test(id)) throw new SafeError('Die lokale Stapelreservierung konnte nicht sicher erzeugt werden.');
    const target = reservationPath();
    const value = { schema: RESERVATION_SCHEMA, reservation_id: id, pid: processApi.pid, created_at: now().toISOString() };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        writeReservation(target, value);
        return Object.freeze({ reservation_id: id });
      } catch (error) {
        if (error?.code !== 'EEXIST') throw new SafeError('Die lokale Stapelreservierung konnte nicht sicher erzeugt werden.');
      }
      const existing = readReservation();
      if (existing.state !== 'valid' || !staleReservation(existing) || !removeStale(existing)) {
        throw new SafeError('Eine lokale DataSecure-Dateiauswahl oder Stapelübernahme ist bereits aktiv.');
      }
    }
    throw new SafeError('Eine lokale DataSecure-Dateiauswahl oder Stapelübernahme ist bereits aktiv.');
  }
  function delegateIntake(reservationId, pid) {
    const id = String(reservationId || '');
    if (!RESERVATION_ID_RE.test(id) || !Number.isSafeInteger(pid) || pid <= 0 || !processAlive(pid)) {
      throw new SafeError('Die lokale Stapelreservierung konnte nicht sicher an den Worker übergeben werden.');
    }
    const reservation = readReservation();
    if (reservation.state !== 'valid' || reservation.value.reservation_id !== id || reservation.value.pid !== processApi.pid) {
      throw new SafeError('Die lokale Stapelreservierung ist nicht mehr gültig.');
    }
    const value = { schema: DELEGATE_SCHEMA, reservation_id: id, pid, created_at: now().toISOString() };
    try { writeReservation(delegatePath(), value); }
    catch { throw new SafeError('Die lokale Stapelreservierung konnte nicht sicher an den Worker übergeben werden.'); }
    return true;
  }
  function releaseIntake(reservationId) {
    const id = String(reservationId || '');
    if (!RESERVATION_ID_RE.test(id)) return false;
    const reservation = readReservation();
    if (reservation.state !== 'valid' || reservation.value.reservation_id !== id) return false;
    const delegate = matchingDelegate(reservation);
    if (delegate === false) return false;
    const authorized = reservation.value.pid === processApi.pid ||
      Boolean(delegate && delegate.value.pid === processApi.pid);
    if (!authorized) return false;
    if (delegate && !unlinkIfUnchanged(delegatePath(), delegate, validDelegate)) return false;
    return unlinkIfUnchanged(reservationPath(), reservation, validReservation);
  }
  function intakeReservationActive() {
    const reservation = readReservation();
    if (reservation.state === 'missing') return false;
    if (reservation.state !== 'valid') return true;
    if (!staleReservation(reservation)) return true;
    return !removeStale(reservation);
  }

  return { reservationPath, delegatePath, reserveIntake, delegateIntake, releaseIntake,
    intakeReservationActive, validReservation, validDelegate };
}

const reservation = createBatchIntakeReservation();
module.exports = { ...reservation, createBatchIntakeReservation, RESERVATION_ID_RE };
