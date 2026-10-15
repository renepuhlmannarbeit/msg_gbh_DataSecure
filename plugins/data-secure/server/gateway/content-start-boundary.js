'use strict';

// Native trust boundary around the pure content decoder. Inspect native Proxy
// identity before reflection; never evaluate caller accessors at start.
const { types } = require('node:util');
const { assertStandaloneContentStart } = require('../core/content-options');
const invalid = () => { throw Object.assign(new Error('CONTENT_OPTIONS_INVALID'), { code: 'CONTENT_OPTIONS_INVALID' }); };
function assertContentStartOwner(owner) {
  if (!owner || typeof owner !== 'object' || types.isProxy(owner) || Array.isArray(owner)) invalid();
  let current = owner;
  while (current !== null) {
    if (types.isProxy(current)) invalid();
    current = Object.getPrototypeOf(current);
  }
  const descriptors = Object.getOwnPropertyDescriptors(owner);
  for (const key of Reflect.ownKeys(descriptors)) if (!Object.hasOwn(descriptors[key], 'value')) invalid();
  for (const field of ['contentOptions', 'content_options']) {
    const value = descriptors[field]?.value;
    if (value && typeof value === 'object') {
      current = value;
      while (current !== null) {
        if (types.isProxy(current)) invalid();
        current = Object.getPrototypeOf(current);
      }
    }
  }
  return owner;
}
function contentStartOptions(owner, field, productChannel) {
  assertContentStartOwner(owner);
  return assertStandaloneContentStart(owner, field, productChannel);
}
function contentStartEnvironment(owner, fallback) {
  assertContentStartOwner(owner);
  const descriptor = Object.getOwnPropertyDescriptor(owner, 'env');
  if (!descriptor && 'env' in owner) invalid();
  const environment = descriptor?.value || fallback;
  assertContentStartOwner(environment);
  const descriptors = Object.getOwnPropertyDescriptors(environment), copy = Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') invalid();
    if (descriptors[key].enumerable) copy[key] = descriptors[key].value;
  }
  return Object.freeze(copy);
}
function contentStartChannel(owner, fallback) {
  return contentStartEnvironment(owner, fallback).DATASECURE_PRODUCT_CHANNEL || 'plugin';
}
module.exports = Object.freeze({ assertContentStartOwner, contentStartOptions, contentStartChannel, contentStartEnvironment });
