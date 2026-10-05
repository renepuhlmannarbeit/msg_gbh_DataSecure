import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pilotDir = path.dirname(fileURLToPath(import.meta.url));
const lock = JSON.parse(fs.readFileSync(path.join(pilotDir, 'models.lock.json'), 'utf8'));
const modelDir = path.join(pilotDir, 'models');
const rawBase = new URL(lock.raw_base);

if (rawBase.protocol !== 'https:' || rawBase.hostname !== 'raw.githubusercontent.com' ||
    rawBase.pathname !== '/tesseract-ocr/tessdata_fast' || rawBase.username || rawBase.password ||
    rawBase.port || rawBase.search || rawBase.hash || !/^[a-f0-9]{40}$/u.test(String(lock.commit)) ||
    Object.keys(lock.models || {}).sort().join(',') !== 'deu,eng') {
  throw new Error('MODEL_SOURCE_NOT_ALLOWLISTED');
}
for (const [language, item] of [...Object.entries(lock.models), ['license', lock.license]]) {
  if (item?.file !== (language === 'license' ? 'LICENSE' : `${language}.traineddata`) ||
      !Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > 16 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/u.test(String(item.sha256))) throw new Error('MODEL_LOCK_INVALID');
}

if (fs.existsSync(modelDir)) throw new Error('MODEL_DIRECTORY_ALREADY_EXISTS');
fs.mkdirSync(modelDir, { mode: 0o700 });

for (const [language, model] of Object.entries(lock.models)) {
  const url = `${lock.raw_base}/${lock.commit}/${model.file}`;
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`MODEL_DOWNLOAD_${language.toUpperCase()}_HTTP_${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== model.bytes) throw new Error(`MODEL_SIZE_${language.toUpperCase()}_MISMATCH`);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (digest !== model.sha256) throw new Error(`MODEL_HASH_${language.toUpperCase()}_MISMATCH`);
  fs.writeFileSync(path.join(modelDir, model.file), bytes, { mode: 0o600, flag: 'wx' });
}

const licenseUrl = `${lock.raw_base}/${lock.commit}/${lock.license.file}`;
const licenseResponse = await fetch(licenseUrl, {
  redirect: 'error',
  signal: AbortSignal.timeout(30000)
});
if (!licenseResponse.ok) throw new Error(`MODEL_LICENSE_HTTP_${licenseResponse.status}`);
const licenseBytes = Buffer.from(await licenseResponse.arrayBuffer());
if (licenseBytes.length !== lock.license.bytes) throw new Error('MODEL_LICENSE_SIZE_MISMATCH');
const licenseDigest = crypto.createHash('sha256').update(licenseBytes).digest('hex');
if (licenseDigest !== lock.license.sha256) throw new Error('MODEL_LICENSE_HASH_MISMATCH');
fs.writeFileSync(path.join(modelDir, lock.license.file), licenseBytes, {
  mode: 0o600,
  flag: 'wx'
});

process.stdout.write(`${JSON.stringify({
  schema_version: 1,
  model_commit: lock.commit,
  languages: Object.keys(lock.models),
  model_license: lock.license.spdx,
  verified: true
})}\n`);
