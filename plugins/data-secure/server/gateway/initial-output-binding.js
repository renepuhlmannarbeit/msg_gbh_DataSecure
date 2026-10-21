'use strict';
// Private receipt for native Windows' two fixed initial-publication containers.
// This is directory authority only: completed public working files remain editable.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataRoot } = require('../runtime');
const { readBoundFileRecord } = require('../core/bound-file-io');
const { validInitialOutputBinding, plainDataFields } = require('../core/native-directory-identity');
const SCHEMA = 'datasecure-initial-output-receipt/1';
const fail = () => Object.assign(Error('RESULT_ROOT_UNSAFE'), { code: 'RESULT_ROOT_UNSAFE' });
const required = () => process.platform === 'win32' && process.env.DATASECURE_NATIVE_EXPORT_CHANNEL === '1';
const exactIdentity = stat => ({ dev: String(stat.dev), ino: String(stat.ino), birthtime_ns: String(stat.birthtimeNs) });
function sameIdentity(left, right) {
  return ['dev', 'ino', 'birthtime_ns'].every(key => left[key] === right[key]);
}
function receiptPath(root) {
  const key = process.platform === 'win32' ? path.resolve(root).toLowerCase() : path.resolve(root);
  return path.join(dataRoot(), 'settings', `initial-output-${crypto.createHash('sha256').update(key).digest('hex')}.json`);
}
function assertBinding(binding) {
  if (!validInitialOutputBinding(binding) || !path.isAbsolute(binding.root) || path.resolve(binding.root) !== binding.root) throw fail();
  const comparable = value => process.platform === 'win32' ? value.toLowerCase() : value;
  for (const [name, expected] of [['', binding.root_identity], ['DataSecure-Markdown', binding.markdown_identity],
    ['DataSecure-Output', binding.output_identity], ['', binding.root_identity]]) {
    const target = name ? path.join(binding.root, name) : binding.root;
    const named = fs.lstatSync(target, { bigint: true }), opened = fs.statSync(target, { bigint: true });
    if (!named.isDirectory() || named.isSymbolicLink() || !opened.isDirectory() ||
        !sameIdentity(exactIdentity(named), expected) || !sameIdentity(exactIdentity(opened), expected) ||
        comparable(fs.realpathSync.native(target)) !== comparable(target)) throw fail();
  }
  return binding;
}
function readReceipt(root, options = {}) {
  const target = receiptPath(root);
  // A non-native caller may not have a private settings directory yet. Only
  // an actually absent leaf/ancestor permits its unchanged legacy path; a
  // leaf observed and then lost during the bound read remains a hard failure.
  try { fs.lstatSync(target); }
  catch (error) { if (error?.code === 'ENOENT' && options.required !== true && !required()) return null; throw fail(); }
  let record;
  try { record = readBoundFileRecord(target, { maximum: 128 * 1024, minimum: 1 }); }
  catch { throw fail(); }
  let value;
  try { value = JSON.parse(record.bytes); } catch { throw fail(); }
  if (!plainDataFields(value, ['schema', 'setting_sha256', 'binding']) || value.schema !== SCHEMA ||
      !/^[a-f0-9]{64}$/u.test(value.setting_sha256) || value.binding?.root !== root) throw fail();
  assertBinding(value.binding);
  return { ...record, binding: value.binding, setting_sha256: value.setting_sha256 };
}
function readInitialOutputBinding(root, options = {}) { return readReceipt(root, options)?.binding || null; }
module.exports = { SCHEMA, required, exactIdentity, sameIdentity, receiptPath, assertBinding, readReceipt, readInitialOutputBinding };
