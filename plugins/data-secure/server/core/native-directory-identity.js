'use strict';
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
module.exports = { validNativeDirectoryIdentity, validNativeExportBinding };
