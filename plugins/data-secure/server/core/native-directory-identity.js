'use strict';
const { types } = require('node:util');

function plainDataFields(value, fields) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  return keys.every(key => typeof key === 'string') && keys.sort().join(',') === fields.slice().sort().join(',') &&
    Object.values(descriptors).every(item => Object.hasOwn(item, 'value') && item.enumerable === true);
}
function validNode22BigIntIdentity(value) {
  return plainDataFields(value, ['dev', 'ino', 'birthtime_ns']) &&
    ['dev', 'ino', 'birthtime_ns'].every(key => typeof value[key] === 'string' &&
      /^(?:0|[1-9][0-9]{0,38})$/u.test(value[key]) &&
      BigInt(value[key]) <= (1n << (key === 'birthtime_ns' ? 128n : 64n)) - 1n);
}
function validInitialOutputBinding(value) {
  return plainDataFields(value, ['schema', 'root', 'root_identity', 'markdown_identity', 'output_identity']) &&
    value.schema === 'datasecure-initial-output-binding/1' && typeof value.root === 'string' &&
    value.root.length > 0 && value.root.length <= 32767 && !/\p{Cc}/u.test(value.root) &&
    ['root_identity', 'markdown_identity', 'output_identity'].every(key => validNode22BigIntIdentity(value[key]));
}
// Native file identities are opaque exact integers, never JavaScript Numbers.
function validNativeDirectoryIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'created_ns,object,volume') return false;
  return ['volume', 'object', 'created_ns'].every(key => {
    const text = value[key];
    return typeof text === 'string' && /^(?:0|[1-9][0-9]{0,38})$/u.test(text) &&
      BigInt(text) <= (1n << (key === 'volume' ? 64n : 128n)) - 1n;
  });
}
function validNativeExportBinding(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === 'anonymize_identity,data_root_identity,markdown_identity,private_identity,private_name,root,root_identity,schema' &&
    value.schema === 'datasecure-native-export-binding/1' && typeof value.root === 'string' && value.root.length > 0 && value.root.length <= 32767 &&
    /^native-export-[a-f0-9]{32}$/u.test(value.private_name) &&
    ['root_identity', 'data_root_identity', 'private_identity', 'anonymize_identity', 'markdown_identity'].every(key => validNativeDirectoryIdentity(value[key])));
}
module.exports = { validNativeDirectoryIdentity, validNativeExportBinding, validNode22BigIntIdentity,
  validInitialOutputBinding, plainDataFields };
