'use strict';

// One instance belongs to the productive batch composition. Neither a DTO,
// an on-disk matching PID nor another factory's ticket is processing authority.
const crypto = require('node:crypto');
const path = require('node:path');
const { contentOptionsForBatch } = require('../core/content-options');
const { assertAnonymizationBatch } = require('../core/processing-mode');
const { validateBatchPseudonymState, ownedRegistrySnapshot, refuseOwnedRegistryPersist, synchronizeOwnedRegistryCommit } = require('../batch-pseudonym-context');
const registryCommit = require('./prepared-registry-commit');
const { VERSION } = require('../version');
const invalid = () => Object.assign(Error('CONTENT_OPTIONS_BINDING_INVALID'), { code: 'CONTENT_OPTIONS_BINDING_INVALID' });
const ID = /^[a-f0-9]{32}$/u, TOKEN = /^[a-f0-9]{64}$/u;
const PROFILES = new Set(['auto', 'general', 'contract', 'customer', 'applicant', 'personnel_profile']);
const PUBLICATION_PHASES = new Set(['processing_started', 'batch_review_publish_started', 'package_verified']);
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const nativeContexts = new WeakMap();
function assertContentOperationContext(context, kind) {
  const check = nativeContexts.get(context);
  if (!check || kind !== undefined && context.kind !== kind) throw invalid();
  check(); return context;
}

function createContentOperationAuthority(services) {
  const tickets = new WeakMap();
  function storedIdentity(token, itemId, kind) {
    if (typeof token !== 'string' || !TOKEN.test(token) || typeof itemId !== 'string' || !ID.test(itemId) ||
        !['capture', 'publication'].includes(kind) || services.active.has(token) !== true) throw invalid();
    const state = services.readStateForMaintenance(token), contentOptions = contentOptionsForBatch(state);
    assertAnonymizationBatch(state);
    const candidates = state.items.filter(item => item.id === itemId), item = candidates[0];
    if (!contentOptions || state.schema !== 'datasecure-batch/7' || state.product_channel !== 'standalone' ||
        state.standalone_document_review !== true || state.invalidated === true || candidates.length !== 1 ||
        !PROFILES.has(state.profile) || typeof state.created_at !== 'string' ||
        new Date(state.created_at).toISOString() !== state.created_at || !Number.isFinite(Date.parse(state.expires_at)) ||
        Date.now() > Date.parse(state.expires_at) ||
        (kind === 'capture' ? item.status !== 'deferred_review' :
          item.status !== 'processing' || !PUBLICATION_PHASES.has(item.checkpoint))) throw invalid();
    const member = services.documentReview.assertDocumentBinding(state, item);
    const seed = validateBatchPseudonymState(state); seed.fill(0);
    const extension = path.extname(item.name).slice(1).toLowerCase();
    const sourceType = extension === 'jpg' ? 'jpeg' : extension === 'markdown' ? 'md' : extension;
    if (!['txt', 'md', 'csv', 'docx', 'xlsx', 'pptx', 'pdf', 'png', 'jpeg', 'bmp'].includes(sourceType) ||
        !Number.isSafeInteger(item.size) || item.size < 1 || typeof item.sha256 !== 'string' || !TOKEN.test(item.sha256)) throw invalid();
    const identity = Object.freeze({ batch_id: token, document_id: itemId, kind, content_options: contentOptions,
      profile: state.profile, source_type: sourceType, source_name: item.name, source_label: member.name,
      source_sha256: item.sha256, source_bytes: item.size, work_name: item.work_name,
      created_at: state.created_at, expires_at: state.expires_at, package_id: `ds_${itemId}`, output_naming_mode: state.output_naming_mode,
      pseudonym_seed: state.pseudonym_seed, pseudonym_contract_version: state.pseudonym_contract_version,
      core_policy_fingerprint: state.core_policy_fingerprint });
    return { state, item, identity };
  }
  const sameIdentity = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  function revalidate(record) {
    services.assertOwnedEpoch(record.epoch);
    const current = storedIdentity(record.identity.batch_id, record.identity.document_id, record.identity.kind);
    if (!sameIdentity(current.identity, record.identity) || record.bytes &&
        (record.bytes.length !== record.identity.source_bytes || digest(record.bytes) !== record.identity.source_sha256)) throw invalid();
    services.assertOwnedEpoch(record.epoch);
    return current;
  }
  function issue(token, itemId, kind) {
    let bytes;
    try {
      const epoch = services.captureOwnedEpoch(token);
      const current = storedIdentity(token, itemId, kind), record = { epoch, identity: current.identity };
      services.assertOwnedEpoch(epoch);
      const entry = services.exactPendingEntry(current.state, current.item);
      bytes = entry.private_bytes;
      if (!Buffer.isBuffer(bytes) || bytes.length !== current.identity.source_bytes ||
          entry.name !== current.identity.source_name || entry.expected_sha256 !== current.identity.source_sha256 ||
          entry.private_artifact_plain !== true || digest(bytes) !== current.identity.source_sha256) throw invalid();
      revalidate(record);
      // Own an independent snapshot. No ticket property or caller hook exposes
      // this Buffer, and later caller state/queue mutations cannot change it.
      record.bytes = Buffer.from(bytes); bytes.fill(0); bytes = undefined;
      const ticket = Object.freeze({}); tickets.set(ticket, record); return ticket;
    } catch { if (Buffer.isBuffer(bytes)) bytes.fill(0); throw invalid(); }
  }
  function consume(ticket) {
    const record = tickets.get(ticket);
    if (!record) throw invalid();
    tickets.delete(ticket); // consumed once, including a failed revalidation
    try { revalidate(record); }
    catch { record.bytes.fill(0); throw invalid(); }
    let disposed = false, sourceTaken = false;
    const check = () => {
      if (disposed) throw invalid();
      try { return revalidate(record); } catch { disposed = true; record.bytes.fill(0); throw invalid(); }
    };
    // A UUID-shaped stable operation ID belongs to the saved run, never to a
    // new retry clock. Exact publication replay will still require its prepared
    // manifest/audit record; deterministic metadata is not a substitute.
    const id = crypto.createHash('sha256').update(`datasecure-private-publication/1\0${VERSION}\0${record.identity.batch_id}\0${record.identity.document_id}\0${record.identity.source_sha256}`).digest();
    id[6] = (id[6] & 15) | 0x50; id[8] = (id[8] & 63) | 0x80;
    const hex = id.subarray(0, 16).toString('hex'), operationId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const { pseudonym_seed: _seed, ...publicContext } = record.identity;
    const context = Object.freeze({ ...publicContext, operation_id: operationId,
      revalidate() { check(); return true; },
      assertPseudonymRegistry(registry) { ownedRegistrySnapshot(registry, check().state); return true; },
      preparedReplay() {
        const current = check(); if (record.identity.kind !== 'publication') throw invalid();
        return services.documentReview.preparedReplay(current.state, current.item, context);
      },
      capturePrepared(value, prepared) {
        const current = check(); if (record.identity.kind !== 'publication') throw invalid();
        return services.documentReview.capturePrepared(current.state, current.item, value, prepared, context);
      },
      publicationRecord() {
        const current = check(); if (record.identity.kind !== 'publication') throw invalid();
        return require('./standalone-anonymized-batch').privatePublicationRecord(context.package_id, current.state, current.item);
      },
      commitPreparedRegistry(registry, manifestSha) {
        if (typeof manifestSha !== 'string' || !TOKEN.test(manifestSha)) throw invalid();
        const current = check();
        if (record.identity.kind !== 'publication') throw invalid();
        let seed, refusePersist = false;
        try {
          seed = registryCommit.decoded(current.state.pseudonym_seed);
          const owned = ownedRegistrySnapshot(registry, current.state);
          const prior = record.registryCommit;
          if (prior && prior.manifestSha !== manifestSha) throw invalid();
          refusePersist = true;
          const initial = registryCommit.checkedState(owned.initial, seed);
          const persisted = registryCommit.checkedState(current.state.pseudonym_registry_state, seed, { allowEmptyInitial: true });
          const snapshot = registryCommit.checkedState(owned.current, seed);
          if (JSON.stringify(persisted) !== JSON.stringify(prior?.state || initial) || prior &&
              JSON.stringify(prior.state) !== JSON.stringify(snapshot)) throw invalid();
          const witness = registryCommit.mintRegistryCommit(record.identity, manifestSha, seed, snapshot);
          // Write the fresh journal, not a caller's stale state. This is the
          // explicit durable boundary before prepared/base creation.
          current.state.pseudonym_registry_state = snapshot;
          services.writeState(current.state);
          const readback = check();
          if (JSON.stringify(registryCommit.checkedState(readback.state.pseudonym_registry_state, seed)) !== JSON.stringify(snapshot)) throw invalid();
          synchronizeOwnedRegistryCommit(registry, readback.state, snapshot);
          record.registryCommit = { state: snapshot, manifestSha };
          return witness;
        } catch { if (refusePersist) refuseOwnedRegistryPersist(registry); throw invalid(); }
        finally { seed?.fill(0); }
      },
      assertPreparedRegistryCommit(commit, manifestSha) {
        if (typeof manifestSha !== 'string' || !TOKEN.test(manifestSha)) throw invalid();
        const current = check(); let seed;
        try {
          if (record.identity.kind !== 'publication') throw invalid();
          seed = registryCommit.decoded(current.state.pseudonym_seed);
          return registryCommit.assertRegistryCommit(record.identity, manifestSha, seed, commit, current.state.pseudonym_registry_state);
        } finally { seed?.fill(0); }
      },
      assertOwnedEpoch() {
        if (disposed || services.active.has(record.identity.batch_id) !== true) throw invalid();
        // Post-rename callbacks may legitimately advance the durable item
        // phase. This checks ownership only, not pre-publication readiness.
        services.assertOwnedEpoch(record.epoch); return true;
      },
      takeSourceBytes() {
        check(); if (sourceTaken) throw invalid(); sourceTaken = true;
        return record.bytes;
      },
      dispose() { disposed = true; record.bytes.fill(0); }
    });
    nativeContexts.set(context, check); return context;
  }
  return Object.freeze({ issue, consume });
}
module.exports = Object.freeze({ createContentOperationAuthority, assertContentOperationContext });
