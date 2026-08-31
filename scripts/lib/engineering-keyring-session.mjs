// Engineering components only. Never imported by the plugin, loaded from ENV,
// or used to attest product/OS isolation. No native backend is loaded implicitly.
import { randomBytes as secureRandomBytes, createHash, timingSafeEqual } from 'node:crypto';

export const ENGINEERING_SERVICE = 'de.msg.datasecure.engineering.private-artifacts.v1';
const EXPECTED_SERVICE = 'de.msg.datasecure.private-artifacts.v1';
const EXPECTED_ACCOUNT = 'installation-key-v1';

function fail(code) { throw new Error(code); }
function validKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(value)) return false;
  const bytes = Buffer.from(value, 'base64url');
  try { return bytes.length === 32 && bytes.toString('base64url') === value; }
  finally { bytes.fill(0); }
}

export function createEngineeringKeyringSession(options) {
  if (!options || typeof options !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(options))) fail('ENGINEERING_KEYRING_OPTIONS_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(options);
  if (Reflect.ownKeys(descriptors).some(key => !['Entry', 'randomBytes'].includes(key) ||
      !Object.hasOwn(descriptors[key], 'value')) || typeof descriptors.Entry?.value !== 'function' ||
      (descriptors.randomBytes && typeof descriptors.randomBytes.value !== 'function')) {
    fail('ENGINEERING_KEYRING_OPTIONS_INVALID');
  }
  const BackendEntry = descriptors.Entry.value;
  const randomBytes = descriptors.randomBytes?.value || secureRandomBytes;
  let nonce;
  try { nonce = randomBytes(32); } catch { fail('ENGINEERING_KEYRING_RANDOM_INVALID'); }
  if (nonce instanceof Promise) nonce.catch(() => {});
  if (!Buffer.isBuffer(nonce) || nonce.length !== 32 || nonce.every(byte => byte === 0)) {
    fail('ENGINEERING_KEYRING_RANDOM_INVALID');
  }
  // The account is generated here, never accepted from a caller, file or ENV.
  const account = `run-${nonce.toString('hex')}`;
  let get, set, expectedKeyDigest, opened = false, written = false, closed = false, failureCode;
  function assertActive() {
    if (closed) fail('ENGINEERING_KEYRING_SESSION_CLOSED');
    if (failureCode) fail(failureCode);
  }
  function stop(code) { failureCode ||= code; fail(failureCode); }
  function readBackend() {
    let value;
    try { value = get(); } catch { stop('ENGINEERING_KEYRING_BACKEND_UNAVAILABLE'); }
    if (value instanceof Promise) value.catch(() => {});
    if (value !== null && !validKey(value)) stop('ENGINEERING_KEYRING_SECRET_INVALID');
    if (value !== null && expectedKeyDigest) {
      const actual = createHash('sha256').update(value, 'ascii').digest();
      try {
        if (!timingSafeEqual(expectedKeyDigest, actual)) stop('ENGINEERING_KEYRING_WRITE_UNCERTAIN');
      } finally { actual.fill(0); }
    }
    return value;
  }
  function openBackend() {
    if (opened) return;
    try {
      const entry = new BackendEntry(ENGINEERING_SERVICE, account);
      if (typeof entry?.getPassword !== 'function' || typeof entry?.setPassword !== 'function') {
        stop('ENGINEERING_KEYRING_BACKEND_INVALID');
      }
      get = entry.getPassword.bind(entry);
      set = entry.setPassword.bind(entry);
    } catch { stop('ENGINEERING_KEYRING_BACKEND_UNAVAILABLE'); }
    // Never adopt or replace a pre-existing value, including malformed values.
    if (readBackend() !== null) stop('ENGINEERING_KEYRING_NAMESPACE_OCCUPIED');
    opened = true;
  }

  class EngineeringEntry {
    constructor(service, requestedAccount) {
      assertActive();
      if (arguments.length !== 2 || service !== EXPECTED_SERVICE || requestedAccount !== EXPECTED_ACCOUNT) {
        fail('ENGINEERING_KEYRING_ENTRY_INVALID');
      }
      openBackend();
      Object.freeze(this);
    }
    getPassword() {
      assertActive();
      if (!opened) fail('ENGINEERING_KEYRING_ENTRY_INVALID');
      const value = readBackend();
      if (!written && value !== null) stop('ENGINEERING_KEYRING_NAMESPACE_OCCUPIED');
      return value;
    }
    setPassword(value) {
      assertActive();
      if (!opened) fail('ENGINEERING_KEYRING_ENTRY_INVALID');
      if (!validKey(value)) fail('ENGINEERING_KEYRING_SECRET_INVALID');
      if (written) fail('ENGINEERING_KEYRING_REWRITE_FORBIDDEN');
      if (readBackend() !== null) stop('ENGINEERING_KEYRING_NAMESPACE_OCCUPIED');
      // No automatic retry after an uncertain native write.
      written = true;
      expectedKeyDigest = createHash('sha256').update(value, 'ascii').digest();
      let result;
      try { result = set(value); } catch { stop('ENGINEERING_KEYRING_BACKEND_UNAVAILABLE'); }
      if (result !== undefined) {
        // Entry is synchronous (not AsyncEntry). Drain a rejected native Promise
        // defensively, but never await/retry it or interpret it as a commit.
        if (result instanceof Promise) result.catch(() => {});
        stop('ENGINEERING_KEYRING_WRITE_UNCERTAIN');
      }
      if (readBackend() === null) stop('ENGINEERING_KEYRING_WRITE_UNCERTAIN');
    }
  }
  Object.freeze(EngineeringEntry.prototype);
  Object.freeze(EngineeringEntry);
  return Object.freeze({
    Entry: EngineeringEntry,
    // End use only; never delete credentials or files. No session ID export or
    // reconstruction API: cross-process resume needs its own reviewed contract.
    close() { closed = true; get = undefined; set = undefined; expectedKeyDigest?.fill(0); }
  });
}
