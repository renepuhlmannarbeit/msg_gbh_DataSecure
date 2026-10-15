'use strict';

const { contentOptionsForBatch } = require('../core/content-options');
const { types } = require('node:util');
const intrinsicAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
const NativeAbortController = AbortController;
const intrinsicSignal = Object.getOwnPropertyDescriptor(AbortController.prototype, 'signal').get;
const ownedSignals = new WeakSet();
const invalid = () => Object.assign(new Error('CONTENT_OPTIONS_BINDING_INVALID'), { code: 'CONTENT_OPTIONS_BINDING_INVALID' });
// These dependencies are internal services, not wire data. Never evaluate a
// caller-supplied option getter or retain profile aliases while copying them.
const OVERRIDES = new Set(['contentOptions', 'content_options', 'markdownOutput', 'scanOcr', 'imageOcr']);
function bindContentDependencies(state, dependencies = {}) {
  const contentOptions = contentOptionsForBatch(state);
  const descriptors = Object.getOwnPropertyDescriptors(dependencies);
  for (const key of Reflect.ownKeys(descriptors)) if (OVERRIDES.has(key)) delete descriptors[key];
  const value = Object.defineProperties({}, descriptors);
  if (contentOptions) Object.defineProperty(value, 'contentOptions', { value: contentOptions, enumerable: true });
  return value;
}
// New persisted review consumers must validate before spreading services or
// asking the contact phase whether it was cancelled. Only the intrinsic native
// brand check observes cancellation; an own property cannot hide an abort.
function contentAbortChecker(signal) {
  if (signal === undefined) return () => false;
  return function aborted() {
    try {
      if (!ownedSignals.has(signal) || types.isProxy(signal) || Object.getPrototypeOf(signal) !== AbortSignal.prototype ||
          Reflect.ownKeys(Object.getOwnPropertyDescriptors(signal)).some(key =>
            !Object.hasOwn(Object.getOwnPropertyDescriptor(signal, key), 'value'))) throw invalid();
      return intrinsicAborted.call(signal);
    } catch { throw invalid(); }
  };
}
function createContentAbortController() {
  // No registration API: Node's reflectable internal symbol fields make a
  // descriptor clone indistinguishable by its getter alone. Mint inside this
  // native composition, and never accept a DTO or another module's clone.
  const controller = new NativeAbortController();
  ownedSignals.add(intrinsicSignal.call(controller));
  return controller;
}
function bindContentReviewDependencies(state, dependencies = {}) {
  const contentOptions = contentOptionsForBatch(state);
  if (!contentOptions) {
    const legacy = bindContentDependencies(state, dependencies);
    return { dependencies: legacy, isAborted: () => Boolean(legacy.abortSignal?.aborted) };
  }
  if (!dependencies || typeof dependencies !== 'object' || types.isProxy(dependencies) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(dependencies))) throw invalid();
  const descriptors = Object.getOwnPropertyDescriptors(dependencies);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (OVERRIDES.has(key)) { delete descriptors[key]; continue; }
    if (typeof key !== 'string' || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')) throw invalid();
  }
  const isAborted = contentAbortChecker(descriptors.abortSignal?.value); isAborted();
  const value = Object.defineProperties({}, descriptors);
  Object.defineProperty(value, 'contentOptions', { value: contentOptions, enumerable: true });
  return Object.freeze({ dependencies: value, isAborted });
}
module.exports = Object.freeze({ bindContentDependencies, bindContentReviewDependencies, contentAbortChecker, createContentAbortController });
