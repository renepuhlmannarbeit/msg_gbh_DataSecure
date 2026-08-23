import crypto from 'node:crypto';
import { Entry } from '@napi-rs/keyring';

const service = 'de.msg.datasecure.keyring-pilot.v1';
const account = `probe-${crypto.randomBytes(16).toString('hex')}`;
const secret = crypto.randomBytes(32).toString('base64url');
let entry;
try {
  entry = new Entry(service, account);
  entry.setPassword(secret);
  const restored = entry.getPassword();
  if (restored !== secret) throw new Error('KEYRING_ROUND_TRIP_FAILED');
  entry.deletePassword();
  const deleted = entry.getPassword();
  if (deleted !== null) throw new Error('KEYRING_DELETE_FAILED');
  process.stdout.write(`${JSON.stringify({
    schema: 'datasecure-keyring-pilot/v1',
    ok: true,
    operations: ['set', 'get', 'delete'],
    secret_bytes: 32,
    raw_secret_emitted: false
  })}\n`);
} catch {
  try { entry?.deletePassword(); } catch { /* best-effort removal only */ }
  process.stdout.write(`${JSON.stringify({
    schema: 'datasecure-keyring-pilot/v1',
    ok: false,
    code: 'KEYRING_UNAVAILABLE',
    raw_secret_emitted: false
  })}\n`);
  process.exitCode = 1;
}
