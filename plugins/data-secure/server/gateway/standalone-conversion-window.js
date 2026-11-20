'use strict';

const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { contentOptionsForBatch, serializeContentOptions } = require('../core/content-options');
const { isMarkdownBatch } = require('../core/processing-mode');
const { reviewPolicyForBatch } = require('../core/standalone-review-policy');
const { MAX_INPUT_BYTES } = require('../core/conversion-worker-contract');
const { MAX_RESPONSE_BYTES } = require('../standalone/conversion-checkpoints');
const { measure } = require('./standalone-publication-timings');
const { isOwnershipControlFailure } = require('./prepublication-error');

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const LANES = 2;
const FUTURE_ITEMS = 3;
const PRIVATE_RESPONSE_BUDGET = 224 * MIB;
const UNCONFIRMED = 'CONVERSION_TERMINATION_UNCONFIRMED';
const resourceFailures = new Set(['CONVERSION_TIMEOUT', 'CONVERSION_RESOURCE_LIMIT']);
const resourcePartials = new Set(['CONVERSION_TIMEOUT_PARTIAL', 'CONVERSION_RESOURCE_LIMIT_PARTIAL']);
const leaseKeys = ['token', 'schema', 'expires_at', 'standalone_control_generation', 'local_executor_pid',
  'local_executor_birth_id', 'local_executor_started_at', 'local_executor_lease_id'];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ownershipChanged = () => Object.assign(new Error('STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED'),
  { code: 'STANDALONE_OWNERSHIP_CONTROL_UNCONFIRMED' });

function eligibleForWindow(state, environment, system, platform, arch) {
  return environment.DATASECURE_NATIVE_EXPORT_CHANNEL === '1' &&
    environment.DATASECURE_PRODUCT_CHANNEL === 'standalone' && state.product_channel === 'standalone' &&
    ((platform === 'win32' && arch === 'x64') || (platform === 'darwin' && ['arm64', 'x64'].includes(arch))) &&
    state.schema === 'datasecure-batch/8' && state.zero_day_work !== true &&
    typeof state.local_executor_lease_id === 'string' && state.ocr_contact_review !== true &&
    (isMarkdownBatch(state) || reviewPolicyForBatch(state) === 'automatic-conservative') &&
    system.availableParallelism() >= 3 && system.totalmem() >= 6 * GIB && system.freemem() >= 3 * GIB;
}

function itemKey(item) {
  return JSON.stringify([item.id, item.work_name, item.name, item.size, item.sha256]);
}

function exactOptions(extension, options, expected) {
  const fields = extension === '.pdf' || extension === '.pptx';
  return options?.signal === undefined && options?.timeoutMs === undefined &&
    options?.markdownOutput === undefined && options?.omitDocxHeaderFooter === undefined &&
    options?.passiveObjects === (fields ? true : undefined) && options?.contentOptions &&
    serializeContentOptions(options.contentOptions) === expected;
}

function resourceLimited(result) {
  return result.ok ? result.value?.coverage?.reason_codes?.some(code => resourcePartials.has(code)) :
    resourceFailures.has(result.error?.code);
}

// Only the real executor creates this window. The child uses the existing
// native per-document sandbox, runtime verifier, limits, and private pipes.
// No journal, registry, review or output operation runs in a future slot.
function createStandaloneConversionWindow({ initial, readState, assertOwnedEpoch, claim,
  readPrivate, convert = require('../standalone/conversion-worker').convertBuffer,
  environment = process.env, system = os, platform = process.platform, arch = process.arch }) {
  if (!eligibleForWindow(initial, environment, system, platform, arch)) return undefined;
  const contentOptions = contentOptionsForBatch(initial);
  if (!contentOptions) return undefined;
  const optionsKey = serializeContentOptions(contentOptions);
  const reviewPolicy = reviewPolicyForBatch(initial);
  const slots = new Map(), running = new Set();
  let active, closed = false, disabled = false, fatal;
  const sameRun = state => state.product_channel === 'standalone' && state.invalidated !== true &&
    leaseKeys.every(key => state[key] === initial[key]) &&
    state.processing_mode === initial.processing_mode && reviewPolicyForBatch(state) === reviewPolicy &&
    state.ocr_contact_review === initial.ocr_contact_review &&
    serializeContentOptions(contentOptionsForBatch(state)) === optionsKey;

  function assertHealthy() {
    if (fatal) throw fatal;
  }

  function currentState(scope) {
    assertOwnedEpoch(scope.epoch);
    try {
      const state = readState(scope.state.token);
      const current = state.items.find(item => item.id === scope.item.id);
      if (!sameRun(state) || current?.status !== 'processing' || itemKey(current) !== itemKey(scope.item))
        throw ownershipChanged();
      return state;
    } catch (error) {
      // Failed ownership observation cannot decide the current document or
      // authorize another write of its last observed journal.
      throw isOwnershipControlFailure(error) ? error : ownershipChanged();
    }
  }

  function start(bytes, extension, options) {
    const slot = { overlapped: running.size > 0 };
    for (const previous of running) previous.overlapped = true;
    running.add(slot);
    let operation;
    try { operation = convert(bytes, extension, options); }
    catch (failure) { operation = Promise.reject(failure); }
    slot.result = Promise.resolve(operation).then(value => ({ ok: true, value }),
      error => {
        if (error?.code === UNCONFIRMED) fatal ||= error;
        return { ok: false, error };
      }).then(result => {
      running.delete(slot);
      if (result.ok && !resourceLimited(result)) pump();
      return result;
    });
    return slot;
  }

  function pump() {
    const scope = active;
    if (!scope?.started || closed || disabled || fatal) return;
    for (const candidate of scope.future) {
      if (slots.has(candidate.id)) continue;
      if (running.size >= LANES || (slots.size + 2) * MAX_RESPONSE_BYTES > PRIVATE_RESPONSE_BUDGET ||
          system.freemem() < 2 * GIB) return;
      try {
        let skippedForExpiry = false;
        const admitted = claim(scope.state, () => {
          const state = currentState(scope);
          if (!(Date.now() <= Date.parse(state.expires_at))) { skippedForExpiry = true; return; }
          const target = state.items.find(item => item.id === candidate.id);
          if (target?.status !== 'pending' || itemKey(target) !== itemKey(candidate)) throw ownershipChanged();
          const entry = readPrivate(state, target);
          const bytes = entry.private_bytes;
          try {
            const extension = path.extname(entry.name).toLowerCase();
            const slot = measure('converter_lookahead_start', () => start(bytes, extension, { contentOptions,
              ...(['.pdf', '.pptx'].includes(extension) ? { passiveObjects: true } : {}) }));
            slot.key = itemKey(target);
            slots.set(target.id, slot);
          } finally {
            // The built-in converter has already taken its private transport
            // copy before returning its promise.
            bytes.fill(0);
          }
        });
        if (!admitted || skippedForExpiry) return;
      } catch (error) {
        // A read or control refusal for a future file cannot decide its
        // journal state. Let the ordinary, ordered processing revalidate it.
        disabled = true;
        if (error?.code === 'OWNERSHIP_GUARD_CLOSE_UNCONFIRMED' || error?.code === 'STANDALONE_PAUSE_CONTROL_INVALID')
          fatal ||= isOwnershipControlFailure(error) ? error : ownershipChanged();
        return;
      }
    }
  }

  function enter(state, item, epoch) {
    assertHealthy();
    if (closed || !epoch || !sameRun(state)) throw ownershipChanged();
    const index = state.items.indexOf(item);
    const future = state.items.slice(index + 1, index + 1 + FUTURE_ITEMS)
      .filter(value => value.status === 'pending' && value.private_artifact_plain === true &&
        value.size > 0 && value.size <= MAX_INPUT_BYTES);
    for (const key of slots.keys()) if (key !== item.id && !future.some(value => value.id === key)) slots.delete(key);
    const scope = { state, item, epoch, future, started: false };
    active = scope;
    return {
      check() {
        assertHealthy();
        currentState(scope);
      },
      async convert(bytes, extension, options) {
        assertHealthy();
        currentState(scope);
        const prior = slots.get(item.id);
        slots.delete(item.id);
        const reusable = prior?.key === itemKey(item) && Date.now() <= Date.parse(state.expires_at) &&
          bytes.length === item.size && sha256(bytes) === item.sha256 &&
          extension === path.extname(item.name).toLowerCase() && exactOptions(extension, options, optionsKey);
        if (!reusable) {
          // A missed/stale slot cannot exceed the native fan-out limit. Let
          // already admitted workers settle without sending an uncertain kill.
          while (running.size >= LANES || (running.size > 0 && system.freemem() < 2 * GIB)) {
            await Promise.race(Array.from(running, slot => slot.result));
            assertHealthy();
            currentState(scope);
          }
        }
        const slot = reusable ? measure('converter_lookahead_hit', () => prior) : start(bytes, extension, options);
        scope.started = true;
        pump();
        let result = await slot.result;
        currentState(scope);
        assertHealthy();
        if (slot.overlapped && resourceLimited(result)) {
          // A simultaneous source can affect the wall/resource budget. One
          // ordinary native read on its own retains the serial plan's chance
          // to finish without accepting concurrency-induced partial output.
          scope.started = false;
          await Promise.all(Array.from(running, pending => pending.result));
          currentState(scope);
          assertHealthy();
          result = await start(bytes, extension, options).result;
          currentState(scope);
          assertHealthy();
        }
        if (!result.ok) throw result.error;
        return result.value;
      },
      leave() {
        if (active === scope) active = undefined;
        slots.delete(item.id); // Includes prepared replay without conversion.
      }
    };
  }

  return Object.freeze({ enter, assertHealthy, async close() {
    closed = true;
    active = undefined;
    slots.clear();
    const settled = await Promise.allSettled(Array.from(running, slot => slot.result));
    assertHealthy();
    if (settled.some(result => result.status === 'rejected')) throw ownershipChanged();
  } });
}

module.exports = { createStandaloneConversionWindow };
