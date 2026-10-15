'use strict';

// Shared worker persistence primitive, activated only by Standalone opt-in;
// no Cowork command, UI or transport is exported. Legacy text snapshots remain
// text-only; only a replayable actual-edit trace grants reversible entity review.
// No retention worker or Cowork adapter visits this directory.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataRoot } = require('../runtime');
const { ensurePrivateDirectory, roots } = require('../gateway/common');
const { createPrivateWorkStore } = require('../gateway/private-work-store');
const { createBatchActiveLock } = require('../gateway/batch-active-lock');
const { withDocumentControl } = require('./standalone-document-control');
const { readBoundFile, bindDirectory, assertDirectory } = require('../core/bound-file-io');
const { readConfiguredResultRoot, inspectRoot, readConfiguredNativeExportBinding } = require('../gateway/result-folder-config');
const { validNativeExportBinding } = require('../core/native-directory-identity');
const { syncParentDirectory } = require('../gateway/batch-journal-io');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { validateDocumentResult, isDocumentResultReasonCode, GRADES } = require('../core/document-result-grade');
const entityReview = require('./standalone-entity-review');
const { safeMarkdownOutputNames, validMarkdownInventory } = require('../core/markdown-output-names');
const { contentOptionsForBatch, validateContentOptions } = require('../core/content-options');
const { contentOptionsDigest } = require('./content-options-binding');
const { validatePrivateDocumentMetadata } = require('../core/private-document-metadata');
const { exactKeys, SOURCE_TYPES } = require('../standalone/markdown-contract');
const { validateMarkdownArtifactForOptions } = require('../standalone/markdown-artifact');
const { validateExpectation } = require('../standalone/anonymized-artifact');
const { processingModeForBatch } = require('../core/processing-mode');
const { createConfidentialOverview, renderConfidentialOverview, MAX_BYTES: MAX_OVERVIEW_BYTES } = require('../standalone/confidential-overview');
// Preserve the existing character budget even for four-byte UTF-8 text;
// a byte-only 8 MiB cap would reject otherwise valid multilingual documents.
const MAX_TEXT = RESOURCE_LIMITS.MAX_TEXT_CHARS * 4;
const CHUNK = 32768;
const MARKDOWN = 'markdown-only', ANONYMIZE = 'markdown-and-anonymize';
const purpose = snapshot => snapshot.processing_mode || ANONYMIZE;
const exportNamespace = mode => mode === MARKDOWN ? 'DataSecure-Markdown-Korrektur' : 'DataSecure-KI-Export';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const valid = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`, 'u').test(value);
const fail = code => Object.assign(new Error(code), { code });
const closed = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === keys.split(',').sort().join(',');
function validSelection(selection) {
  return Array.isArray(selection) && selection.length > 0 && selection.length <= 200 &&
    selection.every(row => row && Object.keys(row).sort().join(',') === 'document_id,output_sha256,revision' &&
      valid(row.document_id, 32) && valid(row.output_sha256, 64) && Number.isSafeInteger(row.revision) && row.revision >= 0) &&
    new Set(selection.map(row => row.document_id)).size === selection.length;
}
function textChunk(text, index) {
  const boundary = offset => offset > 0 && /[\uD800-\uDBFF]/u.test(text[offset - 1] || '') &&
    /[\uDC00-\uDFFF]/u.test(text[offset] || '') ? offset - 1 : offset;
  return text.slice(boundary(index * CHUNK), boundary((index + 1) * CHUNK));
}
function shortText(text) { const cut = /[\uDC00-\uDFFF]/u.test(text[1024] || '') ? 1023 : 1024; return text.slice(0, cut); }
function label(value) { return typeof value === 'string' && value.length > 0 && value.length <= 1024 &&
  !path.win32.isAbsolute(value) && !path.posix.isAbsolute(value) && !/[:\\\u0000-\u001f\u007f]/u.test(value) &&
  value.split('/').every(part => part && part !== '.' && part !== '..'); }

function createDocumentReviewStore(options = {}) {
  const base = () => ensurePrivateDirectory(options.dataRoot || dataRoot(), 'document-reviews');
  const store = () => createPrivateWorkStore({ privateRoot: base(), maxBytes: 8 * MAX_TEXT });
  const controlGate = () => createBatchActiveLock({ lockPath: () => path.join(base(), 'control.lock'),
    ...(options.controlOwnerPid ? { process: { pid: options.controlOwnerPid, kill: process.kill.bind(process) } } : {}),
    ...(options.controlOwnerGeneration ? { ownerGeneration: options.controlOwnerGeneration } : {}) });
  if (options.retiredControlGenerations?.length && !controlGate().retireDelegatedOwner(options.retiredControlGenerations))
    throw fail('STANDALONE_CONNECTION_RECOVERY_BLOCKED');
  function directory(batchId, documentId, create = false) {
    if (!valid(batchId, 64) || !valid(documentId, 32)) throw fail('DOCUMENT_REVIEW_INVALID');
    const run = ensurePrivateDirectory(base(), batchId);
    if (create) return ensurePrivateDirectory(run, documentId);
    // A missing-body read must not manufacture an empty document directory:
    // that would become false publication evidence on the next history read.
    const target = path.join(run, documentId);
    bindDirectory(target);
    return target;
  }
  function locked(batchId, action) {
    if (!valid(batchId, 64)) throw fail('DOCUMENT_REVIEW_INVALID');
    return withDocumentControl(controlGate(), batchId, action);
  }
  function read(file) { return JSON.parse(store().readFile(file).toString('utf8')); }
  function put(file, value) {
    const bytes = Buffer.from(JSON.stringify(value));
    try { store().writeFile(file, bytes); }
    catch (error) { if (error.code !== 'PRIVATE_ARTIFACT_ALREADY_EXISTS') throw error;
      if (!store().readFile(file).equals(bytes)) throw fail('DOCUMENT_REVIEW_CONFLICT'); }
    if (!store().readFile(file).equals(bytes)) throw fail('DOCUMENT_REVIEW_INVALID');
  }
  function runManifest(batchId, optional = true) {
    const file = path.join(ensurePrivateDirectory(base(), batchId), 'manifest.json');
    if (!fs.existsSync(file)) { if (optional) return null; throw fail('DOCUMENT_ENTITY_RUN_UNAVAILABLE'); }
    const value = read(file);
    const v2 = value?.schema === 'datasecure-document-run/2', v3 = value?.schema === 'datasecure-document-run/3';
    const rejected = v2 || v3 ? value.preflight_rejections : [];
    if (v3) validateContentOptions(value.content_options);
    if (!closed(value, `schema,batch_id,product_channel,processing_mode,documents${v2 || v3 ? ',preflight_rejections' : ''}${v3 ? ',content_options' : ''}`) ||
        !['datasecure-document-run/1', 'datasecure-document-run/2', 'datasecure-document-run/3'].includes(value.schema) || value.batch_id !== batchId || value.product_channel !== 'standalone' ||
        ![MARKDOWN, ANONYMIZE].includes(value.processing_mode) || !Array.isArray(value.documents) ||
        (!value.documents.length && !v2 && !v3) || value.documents.length > 200 ||
        value.documents.some(row => !closed(row, 'document_id,source_sha256,name') || !valid(row.document_id, 32) || !valid(row.source_sha256, 64) || !label(row.name)) ||
        !Array.isArray(rejected) || rejected.length > 200 || v2 && !rejected.length ||
        rejected.some(row => !closed(row, 'document_id,name,reason_code') || !valid(row.document_id, 32) || !label(row.name) || !preflightReason(row.reason_code)) ||
        value.documents.length + rejected.length < 1 || value.documents.length + rejected.length > 200 ||
        new Set([...value.documents, ...rejected].map(row => row.document_id)).size !== value.documents.length + rejected.length)
      throw fail('DOCUMENT_REVIEW_INVALID');
    return value;
  }
  function preflightReason(code) {
    // These are actual intake-format rejection codes, not arbitrary terminal
    // processing failures with a missing hash. Keep the trust boundary narrow.
    return ['SOURCE_FORMAT_UNSUPPORTED', 'SOURCE_TYPE_MISMATCH', 'SOURCE_ENCRYPTED_UNSUPPORTED',
      'SOURCE_POLYGLOT_UNSUPPORTED', 'SOURCE_CONTAINER_CORRUPT', 'SOURCE_CONTAINER_LIMIT',
      'SOURCE_ACTIVE_CONTENT_UNSUPPORTED', 'SOURCE_TEXT_INVALID',
      'SOURCE_COMPOUND_BINARY_UNSUPPORTED', 'SOURCE_FORMAT_NOT_RELEASED'].includes(code);
  }
  function preflightRejection(item) {
    const boundary = item?.status === 'preflight_mapping_pending' && item.checkpoint === 'source_preflight_rejected' && item.local_mapping_exported === false ||
      item?.status === 'stopped' && item.checkpoint === 'source_preflight_stopped' && item.local_mapping_exported === true;
    if (!boundary || !valid(item.id, 32) || !label(item.source_label || item.name) || !preflightReason(item.error_code) ||
        ['work_name', 'sha256', 'package_id'].some(key => Object.hasOwn(item, key))) throw fail('DOCUMENT_REVIEW_INVALID');
    try { validateDocumentResult(item.document_result); } catch { throw fail('DOCUMENT_REVIEW_INVALID'); }
    if (item.document_result.grade !== GRADES.NOT_PROCESSED || item.document_result.reason_code !== item.error_code)
      throw fail('DOCUMENT_REVIEW_INVALID');
    return { document_id: item.id, name: item.source_label || item.name, reason_code: item.error_code };
  }
  function captureManifest(state) {
    // Only an actual v2 worker state supplies immutable run membership. Never
    // infer authority from the newest twenty history rows or directory names.
    const contentOptions = contentOptionsForBatch(state);
    if (contentOptions) processingModeForBatch(state);
    if (state.standalone_document_review !== true) return;
    if (state.product_channel !== 'standalone' || ![MARKDOWN, ANONYMIZE].includes(state.processing_mode || ANONYMIZE))
      throw fail('DOCUMENT_REVIEW_INVALID');
    if (!Array.isArray(state.items) || !state.items.length || state.items.length > 200) throw fail('DOCUMENT_REVIEW_INVALID');
    const rejected = [], documents = [];
    for (const item of state.items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw fail('DOCUMENT_REVIEW_INVALID');
      if (item.status === 'preflight_mapping_pending' || ['source_preflight_rejected', 'source_preflight_stopped'].includes(item.checkpoint))
        rejected.push(preflightRejection(item));
      else documents.push({ document_id: item.id, source_sha256: item.sha256, name: item.source_label || item.name });
    }
    const manifest = { schema: `datasecure-document-run/${contentOptions ? 3 : rejected.length ? 2 : 1}`, batch_id: state.token, product_channel: 'standalone',
      processing_mode: state.processing_mode || ANONYMIZE,
      documents: documents.sort((a, b) => a.document_id.localeCompare(b.document_id)),
      ...(rejected.length || contentOptions ? { preflight_rejections: rejected.sort((a, b) => a.document_id.localeCompare(b.document_id)) } : {}),
      ...(contentOptions ? { content_options: contentOptions } : {}) };
    if (new Set([...documents, ...rejected].map(row => row.document_id)).size !== state.items.length ||
        manifest.documents.some(row => !valid(row.document_id, 32) || !valid(row.source_sha256, 64) || !label(row.name)))
      throw fail('DOCUMENT_REVIEW_INVALID');
    put(path.join(ensurePrivateDirectory(base(), state.token), 'manifest.json'), manifest);
  }
  function assertContentBinding(state, { allowMissing = false } = {}) {
    const contentOptions = contentOptionsForBatch(state);
    if (!valid(state.token, 64)) throw fail('CONTENT_OPTIONS_BINDING_INVALID');
    // Do not create private directories during a legacy journal check. The
    // durable anchor is checked independently of the caller's review flag.
    const file = path.join(options.dataRoot || dataRoot(), 'document-reviews', state.token, 'manifest.json');
    if (!fs.existsSync(file)) {
      if (contentOptions && !allowMissing) throw fail('CONTENT_OPTIONS_BINDING_MISSING');
      return;
    }
    const manifest = runManifest(state.token, false);
    const newAnchor = manifest.schema === 'datasecure-document-run/3';
    if (Boolean(contentOptions) !== newAnchor || newAnchor &&
        (contentOptionsDigest(contentOptions) !== contentOptionsDigest(manifest.content_options) ||
         processingModeForBatch(state) !== manifest.processing_mode || state.product_channel !== manifest.product_channel))
      throw fail('CONTENT_OPTIONS_BINDING_INVALID');
  }
  function captureRun(state) {
    if (state?.standalone_document_review !== true) throw fail('DOCUMENT_REVIEW_INVALID');
    return locked(state.token, () => { captureManifest(state); captureTerminalFailures(state); return { ok: true }; });
  }
  function assertDocumentBinding(state, item) {
    assertContentBinding(state);
    const manifest = runManifest(state.token, false);
    const member = manifest?.documents.find(row => row.document_id === item?.id);
    const current = state.items?.find(row => row.id === item?.id);
    if (!member || !current || state.standalone_document_review !== true ||
        member.source_sha256 !== item.sha256 || member.name !== (item.source_label || item.name) ||
        current.sha256 !== item.sha256 || (current.source_label || current.name) !== member.name)
      throw fail('CONTENT_OPTIONS_BINDING_INVALID');
    return Object.freeze({ document_id: member.document_id, source_sha256: member.source_sha256, name: member.name });
  }
  function hasPublicationEvidence(state, item) {
    assertDocumentBinding(state, item);
    const run = path.join(options.dataRoot || dataRoot(), 'document-reviews', state.token), parent = bindDirectory(run);
    const present = (file, bound) => {
      try { fs.lstatSync(file); return true; }
      catch (error) { if (error?.code !== 'ENOENT') throw fail('DOCUMENT_REVIEW_INVALID'); assertDirectory(bound); return false; }
    };
    if (present(path.join(run, `published-${item.id}.json`), parent)) return true;
    const dir = path.join(run, item.id);
    if (!present(dir, parent)) return false;
    const body = bindDirectory(dir), found = present(path.join(dir, 'published.json'), body);
    assertDirectory(parent);
    return found;
  }
  function captureTerminalFailures(state) {
    const manifest = runManifest(state.token, false), run = ensurePrivateDirectory(base(), state.token);
    for (const item of state.items) {
      // Pending/retryable/mapping debt is not proof of a failed conversion.
      // A preflight rejection is already recorded by the immutable manifest.
      if (item.status !== 'stopped' || manifest.preflight_rejections?.some(row => row.document_id === item.id)) continue;
      const member = manifest.documents.find(row => row.document_id === item.id);
      try { validateDocumentResult(item.document_result); } catch { throw fail('DOCUMENT_REVIEW_INVALID'); }
      if (!member || member.source_sha256 !== item.sha256 || member.name !== (item.source_label || item.name) ||
          item.package_id !== undefined || item.document_result.grade !== GRADES.NOT_PROCESSED ||
          item.document_result.reason_code !== item.error_code) throw fail('DOCUMENT_REVIEW_INVALID');
      if (fs.existsSync(path.join(run, `published-${item.id}.json`)) ||
          fs.existsSync(path.join(run, item.id, 'published.json'))) throw fail('DOCUMENT_REVIEW_CONFLICT');
      put(path.join(run, `failure-${item.id}.json`), { schema: 'datasecure-document-failure/1', batch_id: state.token,
        processing_mode: manifest.processing_mode, ...member, reason_code: item.error_code });
    }
  }
  function notProcessedLocked(batchId, manifest = runManifest(batchId)) {
    const run = ensurePrivateDirectory(base(), batchId), rows = [...(manifest?.preflight_rejections || [])];
    const files = fs.readdirSync(run).filter(name => /^failure-[a-f0-9]{32}\.json$/u.test(name));
    if (files.length > 200 || files.length && !manifest) throw fail('DOCUMENT_REVIEW_INVALID');
    for (const file of files.sort()) {
      const value = read(path.join(run, file)), member = manifest.documents.find(row => row.document_id === value?.document_id);
      if (!closed(value, 'schema,batch_id,processing_mode,document_id,source_sha256,name,reason_code') ||
          value.schema !== 'datasecure-document-failure/1' || value.batch_id !== batchId ||
          value.processing_mode !== manifest.processing_mode || !member ||
          file !== `failure-${value.document_id}.json` || value.source_sha256 !== member.source_sha256 ||
          value.name !== member.name || !isDocumentResultReasonCode(value.reason_code) ||
          rows.some(row => row.document_id === value.document_id)) throw fail('DOCUMENT_REVIEW_INVALID');
      rows.push({ document_id: value.document_id, name: value.name, reason_code: value.reason_code });
    }
    return rows.sort((a, b) => a.document_id.localeCompare(b.document_id));
  }
  function notProcessed(batchId) {
    return locked(batchId, () => notProcessedLocked(batchId));
  }
  function journal(batchId) {
    const run = ensurePrivateDirectory(base(), batchId);
    const files = fs.readdirSync(run).filter(name => /^decision-[0-9]{6}\.json$/u.test(name)).sort();
    const proofs = fs.readdirSync(run).filter(name => /^commit-[0-9]{6}\.json$/u.test(name)).sort();
    const formatFile = path.join(run, 'journal-format.json');
    if (!fs.existsSync(formatFile)) {
      // Earlier engineering journals have no independent commit evidence.
      // Never silently migrate their possibly truncated approvals.
      if (files.length || proofs.length) throw fail('DOCUMENT_REVIEW_POLICY_CHANGED');
      return [];
    }
    const format = read(formatFile);
    if (!closed(format, 'schema,batch_id') || format.schema !== 'datasecure-run-decision-commit/2' || format.batch_id !== batchId)
      throw fail('DOCUMENT_REVIEW_INVALID');
    if (proofs.length > 10000) throw fail('DOCUMENT_REVIEW_LIMIT');
    if (files.length > proofs.length) throw fail('DOCUMENT_REVIEW_INVALID');
    let parent = hash(`datasecure-run-decisions/1:${batchId}`);
    const operations = new Set(), manifest = runManifest(batchId);
    const records = proofs.map((proofFile, index) => {
      const proof = read(path.join(run, proofFile)), file = `decision-${String(index + 1).padStart(6, '0')}.json`;
      if (!closed(proof, 'schema,batch_id,sequence,event_sha256,record') || proof.schema !== 'datasecure-run-commit-proof/1' ||
          proof.batch_id !== batchId || proof.sequence !== index + 1 || proofFile !== `commit-${String(index + 1).padStart(6, '0')}.json` ||
          proof.event_sha256 !== proof.record?.event_sha256) throw fail('DOCUMENT_REVIEW_INVALID');
      const record = proof.record;
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw fail('DOCUMENT_REVIEW_INVALID');
      const { event_sha256: digest, ...body } = record;
      if (!closed(record, `schema,batch_id,sequence,parent_sha256,origin_document_id,operation_id,request_sha256,scope,targets,event_sha256${body.scope === 'run' ? ',rules' : ''}`) ||
          file !== `decision-${String(index + 1).padStart(6, '0')}.json` || body.schema !== 'datasecure-run-decision/1' ||
          body.batch_id !== batchId || body.sequence !== index + 1 || body.parent_sha256 !== parent || hash(JSON.stringify(body)) !== digest ||
          !valid(body.origin_document_id, 32) || !valid(body.operation_id, 32) || !valid(body.request_sha256, 64) ||
          !['document', 'run'].includes(body.scope) || !Array.isArray(body.targets) || !body.targets.length || body.targets.length > 200 ||
          body.targets.some(row => !closed(row, 'document_id,event') || !valid(row.document_id, 32) || !row.event ||
            typeof row.event !== 'object' || Array.isArray(row.event)) ||
          new Set(body.targets.map(row => row.document_id)).size !== body.targets.length ||
          !body.targets.some(row => row.document_id === body.origin_document_id)) throw fail('DOCUMENT_REVIEW_INVALID');
      if (operations.has(body.operation_id) || body.scope === 'document' && body.targets.length !== 1 ||
          body.scope === 'run' && (!manifest || manifest.processing_mode !== ANONYMIZE) ||
          manifest && body.targets.some(row => !manifest.documents.some(member => member.document_id === row.document_id)))
        throw fail('DOCUMENT_REVIEW_INVALID');
      for (const { event } of body.targets) {
        if (!closed(event, `schema,revision,parent_sha256,output_sha256,approved,action,ranges,operation_id,request_sha256${event.action === 'entities' ? ',entity_decisions' : ''}`) ||
            event.schema !== 'datasecure-document-revision/1' || !Number.isSafeInteger(event.revision) || event.revision < 1 || event.revision > 1000 ||
            !valid(event.parent_sha256, 64) || !valid(event.output_sha256, 64) || !Array.isArray(event.ranges) || event.ranges.length > 500 ||
            !['approve', 'revoke', 'restore_base', 'redact', 'correct', 'entities'].includes(event.action) ||
            event.approved !== (event.action === 'approve') || event.operation_id !== body.operation_id || event.request_sha256 !== body.request_sha256 ||
            body.scope === 'run' && (event.action !== 'entities' || event.ranges.length)) throw fail('DOCUMENT_REVIEW_INVALID');
      }
      if (body.scope === 'run' && (!Array.isArray(body.rules) || !body.rules.length || body.rules.length > 500 || body.rules.some(row =>
            !closed(row, 'decision,key') || !valid(row.key, 64) ||
            !['default', 'keep', 'person', 'organization'].includes(row.decision)) ||
          new Set(body.rules.map(row => row.key)).size !== body.rules.length)) throw fail('DOCUMENT_ENTITY_INVALID');
      if (body.scope === 'document' && body.rules !== undefined) throw fail('DOCUMENT_ENTITY_INVALID');
      operations.add(body.operation_id); parent = digest; return record;
    });
    if (files.some(file => !records.some(record => file === `decision-${String(record.sequence).padStart(6, '0')}.json`)))
      throw fail('DOCUMENT_REVIEW_INVALID');
    for (const record of records) {
      const file = `decision-${String(record.sequence).padStart(6, '0')}.json`, target = path.join(run, file);
      if (!files.includes(file) && fs.existsSync(target)) throw fail('DOCUMENT_REVIEW_INVALID');
      // The exclusive, flushed proof is the commit point. A lost projection
      // mirror is reconstructed only from that fully validated exact record,
      // never from an older approval or a guessed last sequence number.
      if (files.includes(file)) {
        if (JSON.stringify(read(target)) !== JSON.stringify(record)) throw fail('DOCUMENT_REVIEW_INVALID');
      } else put(target, record);
    }
    return records;
  }
  function ruleKey(row, key) {
    const family = ['PERSON', 'PERSON_ALIAS'].includes(row.kind) ? 'PERSON' :
      ['ORGANIZATION', 'EMPLOYER', 'CUSTOMER', 'COMPANY'].includes(row.kind) ? 'ORG' : null;
    const identity = entityReview.normalize(row.identity || row.original);
    // A surname, ambiguous registry alias or contact value is not a proven
    // cross-document identity. No fuzzy spelling correction or marker matching.
    if (!family || /UNKLAR/u.test(row.identity_key || row.replacement) ||
        family === 'PERSON' && !/\p{L}+\s+\p{L}/u.test(identity)) return null;
    return crypto.createHmac('sha256', key).update(`run-entity/1\0${family}\0${identity}`).digest('hex');
  }
  function ruleDecisions(value, rules, key) {
    if (!value.entities) return { choices: [], identities: new Map() };
    const choices = [], identities = new Map(), byKey = new Map(rules.map(row => [row.key, row.decision]));
    for (const [id, rows] of groupedEntities(value.entities)) {
      const identity = groupRuleKey(rows, key);
      if (!byKey.has(identity)) continue;
      if (rows.some(row => row.disabled)) throw fail('DOCUMENT_ENTITY_RUN_CONFLICT');
      choices.push({ entity_id: id, decision: byKey.get(identity) }); identities.set(id, `run:${identity}`);
    }
    return { choices, identities };
  }
  function groupedEntities(entities) {
    const groups = new Map();
    for (const row of entities) {
      if (!groups.has(row.entity_id)) groups.set(row.entity_id, []);
      groups.get(row.entity_id).push(row);
    }
    return groups;
  }
  function groupRuleKey(rows, key) {
    // A full name supplies the cross-document key. Short/sluggified aliases
    // may follow it only through the same actual unambiguous registry binding
    // captured in this document, never through spelling or marker resemblance.
    const values = rows.map(row => ruleKey(row, key));
    const keys = new Set(values.filter(value => value !== null));
    if (keys.size !== 1) return null;
    const anchored = rows.filter((row, index) => values[index] !== null);
    const bindings = new Set(anchored.map(row => row.identity_key));
    if (values.some(value => value === null) && (bindings.size !== 1 ||
        !/^registry:PERSON:\[PERSON_(?!UNKLAR)[A-Z0-9_]{3,100}\]$/u.test([...bindings][0] || '') ||
        rows.some(row => !['PERSON', 'PERSON_ALIAS'].includes(row.kind) || !bindings.has(row.identity_key)))) return null;
    return [...keys][0];
  }
  function captureSnapshot(state, item, value) {
    const contentOptions = contentOptionsForBatch(state);
    if (contentOptions) processingModeForBatch(state);
    const keys = ['package_id', 'original_text', 'markdown'];
    if (Object.hasOwn(value || {}, 'transform_trace')) keys.push('transform_trace');
    if (Object.hasOwn(value || {}, 'verification_context')) keys.push('verification_context');
    if (contentOptions) keys.push('content_options', 'source_type');
    if (contentOptions && processingModeForBatch(state) === ANONYMIZE) keys.push('publication_binding');
    if (contentOptions && Object.hasOwn(value || {}, 'private_document_metadata')) keys.push('private_document_metadata');
    if (!exactKeys(value, keys)) throw fail('DOCUMENT_REVIEW_INVALID');
    let privateMetadata;
    if (contentOptions) {
      if (contentOptionsDigest(value.content_options) !== contentOptionsDigest(contentOptions)) throw fail('CONTENT_OPTIONS_BINDING_INVALID');
      const extension = path.posix.extname(item.source_label || item.name).toLowerCase();
      const sourceType = extension === '.jpg' ? 'jpeg' : extension === '.markdown' ? 'md' : extension.slice(1);
      if (!SOURCE_TYPES.includes(value.source_type) || value.source_type !== sourceType) throw fail('DOCUMENT_REVIEW_INVALID');
      if (Object.hasOwn(value, 'private_document_metadata')) {
        if (sourceType !== 'pdf') throw fail('DOCUMENT_REVIEW_INVALID');
        privateMetadata = validatePrivateDocumentMetadata(value.private_document_metadata);
      }
    }
    const mode = state.processing_mode || ANONYMIZE;
    let publicationBinding;
    if (contentOptions && mode === ANONYMIZE) {
      try { publicationBinding = validateExpectation(value.publication_binding); }
      catch { throw fail('DOCUMENT_REVIEW_INVALID'); }
      if (publicationBinding.package_id !== value.package_id || publicationBinding.source_type !== value.source_type ||
          publicationBinding.profile !== value.verification_context?.profile || publicationBinding.document_sha256 !== hash(value.markdown) ||
          contentOptionsDigest(publicationBinding.content_options) !== contentOptionsDigest(contentOptions)) throw fail('DOCUMENT_REVIEW_INVALID');
    }
    if (mode === MARKDOWN && (Object.hasOwn(value, 'transform_trace') || Object.hasOwn(value, 'verification_context'))) throw fail('DOCUMENT_REVIEW_INVALID');
    if (state.product_channel !== 'standalone' || ![MARKDOWN, ANONYMIZE].includes(mode) ||
        value.package_id !== `${mode === MARKDOWN ? 'dm' : 'ds'}_${item.id}` || !valid(item.sha256, 64) || !label(item.source_label || item.name) ||
        typeof value.original_text !== 'string' || typeof value.markdown !== 'string' ||
        value.original_text.length > RESOURCE_LIMITS.MAX_TEXT_CHARS || value.markdown.length > RESOURCE_LIMITS.MAX_TEXT_CHARS ||
        !value.original_text.isWellFormed() || !value.markdown.isWellFormed() ||
        Buffer.byteLength(value.original_text) > MAX_TEXT || Buffer.byteLength(value.markdown) > MAX_TEXT) throw fail('DOCUMENT_REVIEW_LIMIT');
    const snapshot = { schema: `datasecure-document-review/${contentOptions ? 2 : 1}`, batch_id: state.token, document_id: item.id,
        processing_mode: mode,
        ...(contentOptions ? { content_options: contentOptions, source_type: value.source_type,
          ...(privateMetadata ? { private_document_metadata: privateMetadata } : {}) } : {}),
        ...(publicationBinding ? { publication_binding: publicationBinding, verification_context: value.verification_context } : {}),
        name: item.source_label || item.name, package_id: value.package_id, source_sha256: item.sha256,
        original_text: value.original_text, markdown: value.markdown, output_sha256: hash(value.markdown),
        ...(mode === ANONYMIZE && value.transform_trace ? {
          transform_trace: value.transform_trace, verification_context: value.verification_context
        } : {}) };
    if (snapshot.transform_trace?.complete === true &&
        require('../privacy/transform-plan').replayTransformTrace(snapshot.transform_trace) !== snapshot.markdown)
      throw fail('DOCUMENT_REVIEW_INVALID');
    return snapshot;
  }
  function putCapture(state, item, snapshot) {
    captureManifest(state);
    put(path.join(ensurePrivateDirectory(base(), state.token), 'journal-format.json'), {
      schema: 'datasecure-run-decision-commit/2', batch_id: state.token });
    const manifest = runManifest(state.token), member = manifest?.documents.find(row => row.document_id === item.id);
    if (manifest && (!member || member.source_sha256 !== item.sha256 || manifest.processing_mode !== purpose(snapshot) ||
        member.name !== (item.source_label || item.name))) throw fail('DOCUMENT_REVIEW_INVALID');
    put(path.join(directory(state.token, item.id, true), 'base.json'), snapshot);
    return snapshot.output_sha256;
  }
  function capture(state, item, value) {
    const snapshot = captureSnapshot(state, item, value);
    return locked(state.token, () => putCapture(state, item, snapshot));
  }
  function preparedContext(state, item, context) {
    require('./content-operation-authority').assertContentOperationContext(context, 'publication');
    assertDocumentBinding(state, item);
    if (context.batch_id !== state.token || context.document_id !== item.id || context.source_sha256 !== item.sha256 ||
        context.source_label !== (item.source_label || item.name) ||
        contentOptionsDigest(context.content_options) !== contentOptionsDigest(contentOptionsForBatch(state))) throw fail('DOCUMENT_REVIEW_CONFLICT');
  }
  function preparedInputs(snapshot) {
    return candidateVerificationInputs({ snapshot, markdown: snapshot.markdown, ...initialProjection(snapshot) });
  }
  function preparedOwnerPath(state, item) {
    return path.join(ensurePrivateDirectory(base(), state.token), `prepared-${item.id}.json`);
  }
  function preparedOwner(state, item) {
    const file = preparedOwnerPath(state, item);
    try { fs.lstatSync(file); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
    try {
      const owner = read(file);
      if (!exactKeys(owner, ['schema', 'batch_id', 'document_id', 'source_sha256', 'content_options_sha256',
        'basis_sha256', 'manifest_sha256', 'prepared_sha256']) || owner.schema !== 'datasecure-prepared-publication-owner/1' ||
        owner.batch_id !== state.token || owner.document_id !== item.id || owner.source_sha256 !== item.sha256 ||
        owner.content_options_sha256 !== contentOptionsDigest(contentOptionsForBatch(state)) ||
        !valid(owner.basis_sha256, 64) || !valid(owner.manifest_sha256, 64) || !valid(owner.prepared_sha256, 64))
        throw fail('DOCUMENT_REVIEW_CONFLICT');
      return owner;
    } catch { throw fail('DOCUMENT_REVIEW_CONFLICT'); }
  }
  function ownerForRecord(state, item, record) {
    if (!record || !valid(record.basis_sha256, 64) || !valid(record.publication_binding?.manifest_sha256, 64))
      throw fail('DOCUMENT_REVIEW_CONFLICT');
    return { schema: 'datasecure-prepared-publication-owner/1', batch_id: state.token, document_id: item.id,
      source_sha256: item.sha256, content_options_sha256: contentOptionsDigest(contentOptionsForBatch(state)),
      basis_sha256: record.basis_sha256, manifest_sha256: record.publication_binding.manifest_sha256,
      prepared_sha256: hash(JSON.stringify(record)) };
  }
  function preparedPresence(target, ownerPresent) {
    const present = name => {
      try { fs.lstatSync(path.join(target, name)); return true; }
      catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
    };
    const prepared = present('prepared-publication.json'), basis = present('base.json');
    if (prepared !== basis || prepared !== ownerPresent) throw fail('DOCUMENT_REVIEW_CONFLICT');
    return prepared;
  }
  function capturePrepared(state, item, value, prepared, context) {
    // Reflect no foreign graph before the process-local ticket/epoch check.
    preparedContext(state, item, context);
    const boundary = require('./prepared-publication'); boundary.guardPreparedGraph(value);
    const snapshot = captureSnapshot(state, item, value);
    const record = boundary.makePreparedRecord(snapshot, prepared, context, preparedInputs);
    return locked(state.token, () => {
      preparedContext(state, item, context);
      const owner = preparedOwner(state, item), expectedOwner = ownerForRecord(state, item, record);
      if (owner && JSON.stringify(owner) !== JSON.stringify(expectedOwner)) throw fail('DOCUMENT_REVIEW_CONFLICT');
      let target;
      try { target = directory(state.token, item.id); }
      catch (error) { if (error?.code !== 'ENOENT') throw error; if (owner) throw fail('DOCUMENT_REVIEW_CONFLICT'); }
      // A partial previous preparation is not permission to re-extract or
      // overwrite it. Exact duplicates are create-only and byte-compared.
      if (target) preparedPresence(target, Boolean(owner));
      // This independent owner survives loss of either file or the entire
      // document folder. Publish it first; partial preparation never starts
      // a new OCR/privacy operation under the same document identity.
      put(preparedOwnerPath(state, item), expectedOwner);
      context.revalidate();
      target = directory(state.token, item.id, true);
      put(path.join(target, 'prepared-publication.json'), record);
      context.revalidate();
      return putCapture(state, item, snapshot);
    });
  }
  function preparedReplay(state, item, context) {
    preparedContext(state, item, context);
    return locked(state.token, () => {
      preparedContext(state, item, context);
      const owner = preparedOwner(state, item);
      let target;
      try { target = directory(state.token, item.id); }
      catch (error) { if (error?.code === 'ENOENT' && !owner) return null;
        if (error?.code === 'ENOENT') throw fail('DOCUMENT_REVIEW_CONFLICT'); throw error; }
      if (!preparedPresence(target, Boolean(owner))) return null;
      const snapshot = baseSnapshot(state.token, item.id);
      let record;
      try { record = read(path.join(target, 'prepared-publication.json')); } catch { throw fail('DOCUMENT_REVIEW_CONFLICT'); }
      if (JSON.stringify(owner) !== JSON.stringify(ownerForRecord(state, item, record))) throw fail('DOCUMENT_REVIEW_CONFLICT');
      const replay = require('./prepared-publication').replayPreparedRecord(snapshot, record, context, preparedInputs);
      preparedContext(state, item, context); return replay;
    });
  }
  function baseSnapshot(batchId, documentId) {
    let value;
    try { value = read(path.join(directory(batchId, documentId), 'base.json')); }
    catch { throw fail('DOCUMENT_REVIEW_MISSING'); }
    const contentBound = value.schema === 'datasecure-document-review/2';
    if (contentBound) validateContentOptions(value.content_options);
    if (!['datasecure-document-review/1', 'datasecure-document-review/2'].includes(value.schema) ||
        !contentBound && Object.hasOwn(value, 'content_options') || value.batch_id !== batchId || value.document_id !== documentId ||
        ![MARKDOWN, ANONYMIZE].includes(purpose(value)) ||
        value.package_id !== `${purpose(value) === MARKDOWN ? 'dm' : 'ds'}_${documentId}` || !label(value.name) || !valid(value.source_sha256, 64) ||
        typeof value.original_text !== 'string' || typeof value.markdown !== 'string' ||
        value.original_text.length > RESOURCE_LIMITS.MAX_TEXT_CHARS || value.markdown.length > RESOURCE_LIMITS.MAX_TEXT_CHARS ||
        !value.original_text.isWellFormed() || !value.markdown.isWellFormed() ||
        Buffer.byteLength(value.original_text) > MAX_TEXT || Buffer.byteLength(value.markdown) > MAX_TEXT ||
        hash(value.markdown) !== value.output_sha256) throw fail('DOCUMENT_REVIEW_INVALID');
    const manifest = runManifest(batchId), member = manifest?.documents.find(row => row.document_id === documentId);
    if (contentBound !== (manifest?.schema === 'datasecure-document-run/3') || contentBound &&
        contentOptionsDigest(value.content_options) !== contentOptionsDigest(manifest.content_options))
      throw fail('CONTENT_OPTIONS_BINDING_INVALID');
    if (manifest && (!member || member.source_sha256 !== value.source_sha256 || member.name !== value.name ||
        manifest.processing_mode !== purpose(value))) throw fail('DOCUMENT_REVIEW_INVALID');
    const keys = ['schema', 'batch_id', 'document_id', 'name', 'package_id', 'source_sha256', 'original_text', 'markdown', 'output_sha256'];
    if (Object.hasOwn(value, 'processing_mode')) keys.push('processing_mode');
    if (Object.hasOwn(value, 'transform_trace')) keys.push('transform_trace');
    if (Object.hasOwn(value, 'verification_context')) keys.push('verification_context');
    if (contentBound) keys.push('content_options', 'source_type');
    if (contentBound && purpose(value) === ANONYMIZE) keys.push('publication_binding');
    if (contentBound && Object.hasOwn(value, 'private_document_metadata')) keys.push('private_document_metadata');
    if (!exactKeys(value, keys) || purpose(value) === MARKDOWN &&
        (Object.hasOwn(value, 'transform_trace') || Object.hasOwn(value, 'verification_context'))) throw fail('DOCUMENT_REVIEW_INVALID');
    if (contentBound) {
      const extension = path.posix.extname(value.name).toLowerCase();
      const sourceType = extension === '.jpg' ? 'jpeg' : extension === '.markdown' ? 'md' : extension.slice(1);
      if (!SOURCE_TYPES.includes(value.source_type) || sourceType !== value.source_type) throw fail('DOCUMENT_REVIEW_INVALID');
      if (Object.hasOwn(value, 'private_document_metadata')) {
        if (sourceType !== 'pdf') throw fail('DOCUMENT_REVIEW_INVALID');
        validatePrivateDocumentMetadata(value.private_document_metadata);
      }
      if (purpose(value) === ANONYMIZE) {
        let binding;
        try { binding = validateExpectation(value.publication_binding); } catch { throw fail('DOCUMENT_REVIEW_INVALID'); }
        if (binding.package_id !== value.package_id || binding.source_type !== value.source_type ||
            binding.profile !== value.verification_context?.profile || binding.document_sha256 !== value.output_sha256 ||
            contentOptionsDigest(binding.content_options) !== contentOptionsDigest(value.content_options)) throw fail('DOCUMENT_REVIEW_INVALID');
      }
    }
    return value;
  }
  // A pre-publication snapshot alone grants nothing. Verify the actual package
  // and exact byte hash before durably recording publication (also on recovery).
  function recordMembership(snapshot) {
    if (!runManifest(snapshot.batch_id)) return;
    // Independent of the document directory and expiring processing journal.
    // Losing one body must not silently shrink the historical result set.
    put(path.join(ensurePrivateDirectory(base(), snapshot.batch_id), `published-${snapshot.document_id}.json`), {
      schema: 'datasecure-document-membership/1', batch_id: snapshot.batch_id,
      document_id: snapshot.document_id, package_id: snapshot.package_id,
      processing_mode: purpose(snapshot), source_sha256: snapshot.source_sha256,
      output_sha256: snapshot.output_sha256, name: snapshot.name
    });
  }
  function publishedMembership(batchId, manifest) {
    const run = ensurePrivateDirectory(base(), batchId), members = [];
    for (const name of fs.readdirSync(run).filter(name => /^published-[a-f0-9]{32}\.json$/u.test(name))) {
      const value = read(path.join(run, name)), member = manifest?.documents.find(row => row.document_id === value.document_id);
      if (!closed(value, 'schema,batch_id,document_id,package_id,processing_mode,source_sha256,output_sha256,name') ||
          value.schema !== 'datasecure-document-membership/1' || value.batch_id !== batchId ||
          name !== `published-${value.document_id}.json` || !valid(value.document_id, 32) ||
          !member || member.name !== value.name || member.source_sha256 !== value.source_sha256 ||
          manifest.processing_mode !== value.processing_mode || !valid(value.output_sha256, 64) ||
          value.package_id !== `${value.processing_mode === MARKDOWN ? 'dm' : 'ds'}_${value.document_id}`)
        throw fail('DOCUMENT_REVIEW_INVALID');
      members.push(value);
    }
    if (members.length > 200) throw fail('DOCUMENT_REVIEW_LIMIT');
    return members;
  }
  function reconcile(batchId, documentId) {
    const snapshot = baseSnapshot(batchId, documentId);
    const dir = directory(batchId, documentId), publication = path.join(dir, 'published.json');
    const boundAnonymization = snapshot.schema === 'datasecure-document-review/2' && purpose(snapshot) === ANONYMIZE;
    if (fs.existsSync(publication)) {
      const record = read(publication);
      if (!closed(record, `schema,output_sha256,package_id${boundAnonymization ? ',publication_binding' : ''}`) ||
          record.schema !== `datasecure-document-publication/${boundAnonymization ? 2 : 1}` || record.output_sha256 !== snapshot.output_sha256 ||
          record.package_id !== snapshot.package_id) throw fail('DOCUMENT_REVIEW_INVALID');
      if (boundAnonymization) {
        let binding;
        try { binding = validateExpectation(record.publication_binding); } catch { throw fail('DOCUMENT_REVIEW_INVALID'); }
        if (JSON.stringify(binding) !== JSON.stringify(validateExpectation(snapshot.publication_binding))) throw fail('DOCUMENT_REVIEW_INVALID');
        // A cached publication receipt never skips the expected /4 read.
      } else {
        recordMembership(snapshot);
        return snapshot;
      }
    }
    if (boundAnonymization) {
      let artifact;
      try { artifact = require('../standalone/anonymized-store').readAnonymizedArtifact(snapshot.package_id, snapshot.publication_binding); }
      catch { throw fail('DOCUMENT_REVIEW_INVALID'); }
      if (artifact.markdown !== snapshot.markdown || artifact.manifest.document_sha256 !== snapshot.output_sha256) throw fail('DOCUMENT_REVIEW_INVALID');
      if (!fs.existsSync(publication)) put(publication, { schema: 'datasecure-document-publication/2', package_id: snapshot.package_id,
        output_sha256: snapshot.output_sha256, publication_binding: validateExpectation(snapshot.publication_binding) });
      recordMembership(snapshot);
      return snapshot;
    }
    if (purpose(snapshot) === MARKDOWN) {
      const artifact = options.readMarkdownArtifact ? options.readMarkdownArtifact(snapshot.package_id, snapshot.content_options) :
        require('../standalone/markdown-store').readMarkdownArtifact(snapshot.package_id, snapshot.content_options);
      validateMarkdownArtifactForOptions(artifact.manifest, artifact.markdown, snapshot.content_options);
      if (artifact.manifest?.processing_mode !== MARKDOWN || artifact.manifest.anonymized !== false ||
          artifact.manifest.artifact_id !== snapshot.package_id || artifact.markdown !== snapshot.markdown ||
          artifact.manifest.document_sha256 !== snapshot.output_sha256) throw fail('DOCUMENT_REVIEW_INVALID');
      put(publication, { schema: 'datasecure-document-publication/1', package_id: snapshot.package_id,
        output_sha256: snapshot.output_sha256 });
      recordMembership(snapshot);
      return snapshot;
    }
    const output = options.outputRoot ? options.outputRoot() : roots().output;
    const packageDir = path.join(output, snapshot.package_id), bound = bindDirectory(packageDir);
    const manifest = JSON.parse(readBoundFile(path.join(packageDir, 'manifest.json'), { directory: bound, maximum: 1024 * 1024 }));
    const bytes = readBoundFile(path.join(packageDir, `${snapshot.package_id}.md`), { directory: bound, maximum: MAX_TEXT });
    if (manifest.schema !== 'eu-privacy-package/3' || manifest.package_id !== snapshot.package_id ||
        manifest.document !== `${snapshot.package_id}.md` || manifest.verification?.text_residual_pii !== 'passed' ||
        manifest.document_sha256 !== snapshot.output_sha256 || hash(bytes) !== snapshot.output_sha256) throw fail('DOCUMENT_REVIEW_INVALID');
    put(publication, { schema: 'datasecure-document-publication/1', package_id: snapshot.package_id,
      output_sha256: snapshot.output_sha256 });
    recordMembership(snapshot);
    return snapshot;
  }
  function recordPublication(batchId, documentId) { return locked(batchId, () => { reconcile(batchId, documentId); }); }
  function publicationExpectation(batchId, documentId) {
    return locked(batchId, () => {
      // baseSnapshot has matched options, source membership and purpose to the
      // independent immutable run anchor. This is a pre-publication expected
      // context, not proof that a package already exists.
      const snapshot = baseSnapshot(batchId, documentId);
      if (snapshot.schema !== 'datasecure-document-review/2' || purpose(snapshot) !== ANONYMIZE)
        throw fail('DOCUMENT_REVIEW_INVALID');
      return validateExpectation(snapshot.publication_binding);
    });
  }
  function current(batchId, documentId, events = journal(batchId)) {
    if (valid(documentId, 32) && fs.existsSync(path.join(ensurePrivateDirectory(base(), batchId), `failure-${documentId}.json`))) {
      notProcessedLocked(batchId); // Validate retained evidence before refusing a conflicting body.
      throw fail('DOCUMENT_REVIEW_CONFLICT');
    }
    const snapshot = reconcile(batchId, documentId), dir = directory(batchId, documentId);
    const files = fs.readdirSync(dir).filter(name => /^revision-[0-9]{6}\.json$/u.test(name)).sort();
    if (files.length > 1000) throw fail('DOCUMENT_REVIEW_LIMIT');
    let value = { revision: 0, markdown: snapshot.markdown, output_sha256: snapshot.output_sha256, approved: false,
      ...initialProjection(snapshot) };
    for (let index = 0; index < files.length; index++) {
      const event = read(path.join(dir, files[index]));
      if (files[index] !== `revision-${String(index + 1).padStart(6, '0')}.json` ||
          event.revision !== index + 1 || event.parent_sha256 !== value.output_sha256 ||
          event.schema !== 'datasecure-document-revision/1' || !Array.isArray(event.ranges) ||
          typeof event.approved !== 'boolean' || !valid(event.operation_id, 32) || !valid(event.request_sha256, 64)) throw fail('DOCUMENT_REVIEW_INVALID');
      // Re-derive every edit, not only its claimed hash. A forged revision
      // cannot insert raw source text and then obtain a human approval.
      const projection = deriveProjection(batchId, value, snapshot, event), markdown = projection.markdown;
      if (markdown.length > RESOURCE_LIMITS.MAX_TEXT_CHARS || Buffer.byteLength(markdown) > MAX_TEXT) throw fail('DOCUMENT_REVIEW_LIMIT');
      if (hash(markdown) !== event.output_sha256 || event.approved !== (event.action === 'approve')) throw fail('DOCUMENT_REVIEW_INVALID');
      value = { ...event, ...projection };
    }
    for (const record of events) {
      const target = record.targets.find(row => row.document_id === documentId);
      let event = target?.event;
      if (record.scope === 'run') {
        const manifest = runManifest(batchId, false);
        if (manifest.processing_mode !== ANONYMIZE || !manifest.documents.some(row => row.document_id === documentId))
          throw fail('DOCUMENT_ENTITY_RUN_UNAVAILABLE');
        const match = ruleDecisions(value, record.rules, entityKey(batchId));
        if (!target && !match.choices.length) continue;
        if (target && JSON.stringify(event.entity_decisions) !== JSON.stringify(match.choices)) throw fail('DOCUMENT_REVIEW_INVALID');
        if (!target) event = { action: 'entities', ranges: [], entity_decisions: match.choices, revision: value.revision + 1,
          operation_id: record.operation_id, request_sha256: record.request_sha256, approved: false, parent_sha256: value.output_sha256 };
        event = { ...event, identities: match.identities };
      }
      if (!event) continue;
      if (event.schema !== undefined && event.schema !== 'datasecure-document-revision/1' ||
          event.revision !== value.revision + 1 || event.parent_sha256 !== value.output_sha256 ||
          event.operation_id !== record.operation_id || event.request_sha256 !== record.request_sha256 || !Array.isArray(event.ranges) ||
          event.approved !== (event.action === 'approve')) throw fail('DOCUMENT_REVIEW_INVALID');
      const projection = deriveProjection(batchId, value, snapshot, event), digest = hash(projection.markdown);
      if (target && digest !== event.output_sha256) throw fail('DOCUMENT_REVIEW_INVALID');
      if (event.revision > 1000 || projection.markdown.length > RESOURCE_LIMITS.MAX_TEXT_CHARS || Buffer.byteLength(projection.markdown) > MAX_TEXT)
        throw fail('DOCUMENT_REVIEW_LIMIT');
      value = { ...event, ...projection, output_sha256: digest };
    }
    return { ...value, snapshot };
  }
  function initialProjection(snapshot) {
    let entities = null;
    if (purpose(snapshot) === ANONYMIZE && snapshot.transform_trace?.complete === true) {
      if (require('../privacy/transform-plan').replayTransformTrace(snapshot.transform_trace) !== snapshot.markdown)
        throw fail('DOCUMENT_REVIEW_INVALID');
      try { entities = entityReview.initialEntities(snapshot); } catch { /* valid but non-reversible transformation */ }
    }
    const weakRanges = snapshot.verification_context?.reviewed_ranges || [];
    if (!Array.isArray(weakRanges) || weakRanges.some(row => !Number.isSafeInteger(row?.start) || !Number.isSafeInteger(row?.end) ||
        row.start < 0 || row.end <= row.start || row.end > snapshot.markdown.length)) throw fail('DOCUMENT_REVIEW_INVALID');
    return { entities, weakRanges };
  }
  function entityKey(batchId, create = false) {
    const file = path.join(ensurePrivateDirectory(base(), batchId), 'entity-key.json');
    if (create && !fs.existsSync(file)) put(file, { schema: 'datasecure-document-entity-key/1', key: crypto.randomBytes(32).toString('hex') });
    const record = read(file);
    if (record.schema !== 'datasecure-document-entity-key/1' || !valid(record.key, 64)) throw fail('DOCUMENT_ENTITY_INVALID');
    return Buffer.from(record.key, 'hex');
  }
  function deriveProjection(batchId, value, snapshot, event) {
    if (event.action === 'entities') {
      if (purpose(snapshot) !== ANONYMIZE || event.ranges.length !== 0) throw fail('DOCUMENT_ENTITY_INVALID');
      const result = entityReview.applyEntityDecisions(value.markdown, value.entities, event.entity_decisions, entityKey(batchId), event.identities);
      return { markdown: result.markdown, entities: result.entities,
        weakRanges: entityReview.relocate(value.weakRanges, result.edits) };
    }
    if (event.entity_decisions !== undefined) throw fail('DOCUMENT_ENTITY_INVALID');
    const markdown = derive(value.markdown, snapshot.markdown, event.action, event.ranges, purpose(snapshot));
    if (event.action === 'restore_base') return { markdown, ...initialProjection(snapshot) };
    if (event.action === 'redact') {
      const edits = event.ranges.map(row => ({ ...row, replacement: '[MANUAL_REDACTION]' }));
      return { markdown, entities: value.entities && entityReview.relocate(value.entities, edits, true),
        weakRanges: entityReview.relocate(value.weakRanges, edits) };
    }
    return { markdown, entities: value.entities, weakRanges: value.weakRanges };
  }
  function candidateVerificationInputs(value) {
    if (purpose(value.snapshot) !== ANONYMIZE || !value.snapshot.transform_trace) return;
    const context = value.snapshot.verification_context;
    // baseSnapshot has already checked these immutable options against the
    // independent run manifest. Never take field semantics from a UI request.
    const { personFieldPolicyForContentOptions } = require('../core/person-field-policy');
    const contentBound = value.snapshot.schema === 'datasecure-document-review/2';
    const fieldOptions = contentBound ? { productChannel: 'standalone', contentOptions: value.snapshot.content_options } : {};
    const personFieldPolicy = personFieldPolicyForContentOptions(fieldOptions.contentOptions);
    if (contentBound ? context?.person_field_policy !== personFieldPolicy : Object.hasOwn(context || {}, 'person_field_policy'))
      throw fail('DOCUMENT_REVIEW_POLICY_CHANGED');
    const policy = require('../privacy/policy');
    if (!context || context.ruleset !== policy.PRIVACY_RULESET_VERSION || context.credential_policy !== policy.CREDENTIAL_CONTEXT_POLICY_VERSION ||
        !['general', 'personnel_profile', 'applicant', 'customer', 'contract'].includes(context.profile) || !Array.isArray(context.dictionary))
      throw fail('DOCUMENT_REVIEW_POLICY_CHANGED');
    const { canonicalizeRenderedText } = require('../privacy/base');
    const frame = context.publication_frame || { prefix: '', suffix: '' };
    if (typeof frame.prefix !== 'string' || typeof frame.suffix !== 'string' ||
        !value.snapshot.markdown.startsWith(frame.prefix) || !value.snapshot.markdown.endsWith(frame.suffix) ||
        !value.markdown.startsWith(frame.prefix) || !value.markdown.endsWith(frame.suffix)) throw fail('DOCUMENT_REVIEW_INVALID');
    const body = value.markdown.slice(frame.prefix.length, value.markdown.length - frame.suffix.length);
    const canonicalPrefix = canonicalizeRenderedText(frame.prefix, personFieldPolicy), canonical = canonicalizeRenderedText(value.markdown, personFieldPolicy);
    if (canonicalizeRenderedText(body, personFieldPolicy) !== body || canonical !== canonicalPrefix + body + canonicalizeRenderedText(frame.suffix, personFieldPolicy))
      throw fail('DOCUMENT_REVIEW_INVALID');
    const toCanonical = ranges => ranges.map(range => {
      if (range.start < frame.prefix.length || range.end > value.markdown.length - frame.suffix.length) throw fail('DOCUMENT_REVIEW_INVALID');
      return { start: range.start - frame.prefix.length + canonicalPrefix.length,
        end: range.end - frame.prefix.length + canonicalPrefix.length };
    });
    const token = require('../privacy/residual-person-review').bindStandaloneDocumentKeeps(canonical, toCanonical(value.weakRanges),
      toCanonical((value.entities || []).filter(row => !row.disabled && row.decision === 'keep').map(({ start, end }) => ({ start, end }))));
    return { profile: context.profile, dictionary: context.dictionary, fieldOptions,
      strongPersonAnchor: context.strong_person_anchor === true, originalSourceText: value.snapshot.transform_trace.canonical_input,
      reviewedPersonCandidates: token };
  }
  function verifyCandidate(value) {
    const fields = candidateVerificationInputs(value);
    if (!fields) return;
    const residual = require('../pii-engine').scanResidual(value.markdown, fields.profile, fields.dictionary, {
      ...fields.fieldOptions, strongPersonAnchor: fields.strongPersonAnchor, originalSourceText: fields.originalSourceText,
      reviewedPersonCandidates: fields.reviewedPersonCandidates });
    if (residual.length) throw fail('DOCUMENT_REVIEW_RESIDUAL_PII');
  }
  function derive(text, original, action, ranges, mode = ANONYMIZE) {
    if (['approve', 'revoke'].includes(action) && ranges.length === 0) return text;
    if (action === 'restore_base' && ranges.length === 0) return original;
    if (action === 'correct') {
      if (mode !== MARKDOWN || ranges.length !== 1) throw fail('DOCUMENT_REVIEW_INVALID');
      const range = ranges[0];
      if (!range || Object.keys(range).sort().join(',') !== 'end,replacement,start' ||
          !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 ||
          range.end < range.start || range.end > text.length || typeof range.replacement !== 'string' ||
          range.replacement.length > CHUNK || !range.replacement.isWellFormed() || range.replacement.includes('\u0000') ||
          /[\uD800-\uDBFF]/u.test(text[range.start - 1] || '') || /[\uDC00-\uDFFF]/u.test(text[range.end] || ''))
        throw fail('DOCUMENT_REVIEW_INVALID');
      return text.slice(0, range.start) + range.replacement + text.slice(range.end);
    }
    if (action !== 'redact' || !Array.isArray(ranges) || ranges.length < 1 || ranges.length > 500) throw fail('DOCUMENT_REVIEW_INVALID');
    let cursor = 0, result = '';
    for (const range of ranges) {
      if (!range || Object.keys(range).sort().join(',') !== 'end,start' || !Number.isSafeInteger(range.start) ||
          !Number.isSafeInteger(range.end) || range.start < cursor || range.end <= range.start || range.end > text.length ||
          /[\uD800-\uDBFF]/u.test(text[range.start - 1] || '') || /[\uDC00-\uDFFF]/u.test(text[range.end] || '')) throw fail('DOCUMENT_REVIEW_INVALID');
      result += text.slice(cursor, range.start) + '[MANUAL_REDACTION]'; cursor = range.end;
    }
    return result + text.slice(cursor);
  }
  function metadata(value) { return { document_id: value.snapshot.document_id, name: value.snapshot.name,
    processing_mode: purpose(value.snapshot),
    revision: value.revision, output_sha256: value.output_sha256, approved: value.approved,
    ...(purpose(value.snapshot) === MARKDOWN ? { text_modified: value.output_sha256 !== value.snapshot.output_sha256 } : {}),
    entity_review_available: Array.isArray(value.entities), entity_count: value.entities ? new Set(value.entities.map(row => row.entity_id)).size : 0,
    source_normalized: Boolean(value.snapshot.transform_trace?.complete),
    run_entity_review_available: purpose(value.snapshot) === ANONYMIZE && Boolean(runManifest(value.snapshot.batch_id)),
    chunks: Math.max(1, Math.ceil(Math.max(value.snapshot.original_text.length, value.markdown.length) / CHUNK)) }; }
  function listLocked(batchId) {
      const run = ensurePrivateDirectory(base(), batchId), documents = [], unavailable = [], events = journal(batchId);
      const manifest = runManifest(batchId), membership = publishedMembership(batchId, manifest);
      const failures = notProcessedLocked(batchId, manifest);
      const expected = options.expectedDocuments ? options.expectedDocuments(batchId) :
        require('../gateway/batch').readStandaloneHistoryStates().find(row => row.token === batchId)?.items || [];
      const published = expected.filter(row => ['released', 'delivery_pending', 'mapping_pending'].includes(row.status));
      const provenIds = new Set([...published.map(row => row.id), ...membership.map(row => row.document_id)]);
      if (failures.some(row => provenIds.has(row.document_id))) throw fail('DOCUMENT_REVIEW_CONFLICT');
      // capture() precedes actual package publication. A failed publish may
      // leave a valid private draft, or just a directory from failed capture.
      // Neither is evidence of a released result. Keep it untouched but out of
      // the reviewable result list; the retained terminal failure names it.
      const ids = [...new Set([...fs.readdirSync(run).filter(id => valid(id, 32) && !failures.some(row => row.document_id === id)), ...published.map(row => row.id),
        ...membership.map(row => row.document_id)])].sort();
      if (ids.length > 200) throw fail('DOCUMENT_REVIEW_LIMIT');
      for (const id of ids) {
        try { documents.push(metadata(current(batchId, id, events))); }
        catch { let name = published.find(row => row.id === id)?.source_label || published.find(row => row.id === id)?.name ||
            membership.find(row => row.document_id === id)?.name;
          try { name = baseSnapshot(batchId, id).name; } catch {}
          if (!label(name)) name = undefined;
          unavailable.push({ document_id: id, ...(name ? { name } : {}), reason_code: 'DOCUMENT_REVIEW_MISSING' }); }
      }
      // Older engineering runs can lack publication evidence. Their entire
      // input manifest is NOT proof that each source produced a result.
      const unclassified = (manifest?.documents || []).filter(row => !ids.includes(row.document_id) && !failures.some(failed => failed.document_id === row.document_id) &&
        !expected.some(item => item.id === row.document_id)).map(row => ({ document_id: row.document_id, name: row.name }));
      const exports = exportRecords(run, documents);
      return { ok: true, local_ui_only: true, external_disclosure: false, documents, unavailable,
        processing_mode: manifest?.processing_mode || documents[0]?.processing_mode || null,
        unclassified_documents: unclassified,
        not_processed_documents: failures,
        // Only the next complete selection crosses IPC; sixteen full selections
        // plus long document names could exhaust the bounded response frame.
        pending_exports: exports.pending.slice(0, 1), pending_export_count: exports.pending.length,
        pending_incomplete_export_count: exports.pending.filter(row => row.status === 'incomplete').length,
        pending_export_confirmation_count: exports.pending.filter(row => row.status === 'completed').length,
        export_receipts: exports.receipts, recorded_export_count: exports.recordedCount,
        recorded_current_export_count: exports.currentExportedCount };
  }
  function list(batchId) { return locked(batchId, () => listLocked(batchId)); }
  function historySummary(batchId) {
    return locked(batchId, () => {
      const manifest = runManifest(batchId);
      const envelope = { ok: true, local_ui_only: true, external_disclosure: false };
      // Legacy runs have no durable v2 membership or human approval contract.
      // Unknown is not zero: do not advertise an inferred approval status.
      if (!manifest) return { ...envelope, available: false };
      // Explicit on-demand read only, not part of the periodic 20-run history
      // projection. Replaying the authoritative revisions may read large text.
      const value = listLocked(batchId);
      if (value.documents.some(row => row.processing_mode !== manifest.processing_mode)) throw fail('DOCUMENT_REVIEW_INVALID');
      const latest = value.export_receipts[0];
      return { ...envelope, available: true, processing_mode: manifest.processing_mode,
        reviewable_count: value.documents.length, approved_count: value.documents.filter(row => row.approved).length,
        unavailable_count: value.unavailable.length, unclassified_source_count: value.unclassified_documents.length,
        ...(value.not_processed_documents.length ? { not_processed_count: value.not_processed_documents.length } : {}),
        recorded_export_count: value.recorded_export_count,
        current_exported_count: value.recorded_current_export_count,
        pending_export_count: value.pending_export_count,
        pending_incomplete_count: value.pending_incomplete_export_count,
        pending_confirmation_count: value.pending_export_confirmation_count,
        last_recorded_export: latest ? { processing_mode: latest.processing_mode, document_count: latest.exported_count,
          recorded_at: latest.recorded_at } : null };
    });
  }
  function chunk(batchId, documentId, revision, index) {
    return locked(batchId, () => {
      const value = current(batchId, documentId), meta = metadata(value);
      if (revision !== value.revision) throw fail('DOCUMENT_REVIEW_STALE');
      if (!Number.isSafeInteger(index) || index < 0 || index >= meta.chunks) throw fail('DOCUMENT_REVIEW_INVALID');
      return { ok: true, local_ui_only: true, external_disclosure: false, ...meta, chunk_index: index,
        original_text: textChunk(value.snapshot.transform_trace?.complete ? value.snapshot.transform_trace.canonical_input : value.snapshot.original_text, index),
        markdown: textChunk(value.markdown, index) };
    });
  }
  function entities(batchId, documentId, revision, page) {
    return locked(batchId, () => {
      const value = current(batchId, documentId);
      if (revision !== value.revision) throw fail('DOCUMENT_REVIEW_STALE');
      if (!value.entities) throw fail('DOCUMENT_ENTITY_UNAVAILABLE');
      const groups = [...groupedEntities(value.entities)], manifest = runManifest(batchId), key = manifest && entityKey(batchId, true);
      if (!Number.isSafeInteger(page) || page < 0 || page >= Math.max(1, Math.ceil(groups.length / 20))) throw fail('DOCUMENT_ENTITY_INVALID');
      const rows = groups.slice(page * 20, (page + 1) * 20).map(([id, occurrences]) => {
        const first = occurrences[0];
        return { entity_id: id, kind: first.current_kind, decision: first.decision, count: occurrences.length,
          original: shortText(first.original), original_truncated: first.original.length > 1024,
          replacement: shortText(value.markdown.slice(first.start, first.end)),
          disabled: occurrences.some(row => row.disabled),
          run_eligible: Boolean(manifest) && Boolean(groupRuleKey(occurrences, key)),
          output_start: first.start, output_end: first.end,
          source_start: first.source_start, source_end: first.source_end };
      });
      return { ok: true, local_ui_only: true, external_disclosure: false, ...metadata(value), page,
        pages: Math.max(1, Math.ceil(groups.length / 20)), entities: rows };
    });
  }
  function decide(batchId, documentId, request) {
    return locked(batchId, () => {
      const scope = request?.scope || 'document';
      const fields = request?.action === 'entities' ? `action,entity_decisions,operation_id,output_sha256,ranges,revision${Object.hasOwn(request, 'scope') ? ',scope' : ''}` : 'action,operation_id,output_sha256,ranges,revision';
      if (!request || Object.keys(request).sort().join(',') !== fields || !['document', 'run'].includes(scope) ||
          Object.hasOwn(request, 'scope') && !['document', 'run'].includes(request.scope) ||
          !valid(request.operation_id, 32) || !valid(request.output_sha256, 64) || !Number.isSafeInteger(request.revision) ||
          !Array.isArray(request.ranges)) throw fail('DOCUMENT_REVIEW_INVALID');
      const events = journal(batchId), value = current(batchId, documentId, events), requestHash = hash(JSON.stringify(request));
      const previous = events.find(row => row.operation_id === request.operation_id);
      if (previous && (previous.origin_document_id !== documentId || previous.request_sha256 !== requestHash)) throw fail('DOCUMENT_REVIEW_CONFLICT');
      if (value.operation_id === request.operation_id) {
        if (value.request_sha256 !== requestHash) throw fail('DOCUMENT_REVIEW_CONFLICT');
        return { ok: true, ...metadata(value), ...(previous ? { affected_count: previous.targets.length, scope: previous.scope } : {}),
          local_ui_only: true, external_disclosure: false };
      }
      if (previous) throw fail('DOCUMENT_REVIEW_STALE');
      // Preserve replay/idempotent ACK of old immutable raw revisions, but do
      // not create new anonymization actions in the conversion-only purpose.
      if (request.action === 'redact' && purpose(value.snapshot) === MARKDOWN) throw fail('DOCUMENT_REVIEW_INVALID');
      if (request.revision !== value.revision || request.output_sha256 !== value.output_sha256) throw fail('DOCUMENT_REVIEW_STALE');
      if (value.revision >= 1000) throw fail('DOCUMENT_REVIEW_LIMIT');
      for (const file of fs.readdirSync(directory(batchId, documentId)).filter(name => /^revision-[0-9]{6}\.json$/u.test(name))) {
        const event = read(path.join(directory(batchId, documentId), file));
        if (event.operation_id === request.operation_id) throw fail('DOCUMENT_REVIEW_STALE');
      }
      if (request.action === 'entities') entityKey(batchId, true);
      let rules, values = [{ document_id: documentId, value, request }];
      if (scope === 'run') {
        if (request.action !== 'entities' || purpose(value.snapshot) !== ANONYMIZE || !value.entities) throw fail('DOCUMENT_ENTITY_RUN_UNAVAILABLE');
        const manifest = runManifest(batchId, false), key = entityKey(batchId);
        if (manifest.processing_mode !== ANONYMIZE || !manifest.documents.some(row => row.document_id === documentId)) throw fail('DOCUMENT_ENTITY_RUN_UNAVAILABLE');
        // Validate the closed choice IDs before constructing a durable rule.
        entityReview.applyEntityDecisions(value.markdown, value.entities, request.entity_decisions, key);
        rules = request.entity_decisions.map(choice => {
          const rows = value.entities.filter(row => row.entity_id === choice.entity_id), rule = groupRuleKey(rows, key);
          if (!rule) throw fail('DOCUMENT_ENTITY_RUN_UNAVAILABLE');
          return { key: rule, decision: choice.decision };
        }).sort((a, b) => a.key.localeCompare(b.key));
        if (new Set(rules.map(row => row.key)).size !== rules.length) throw fail('DOCUMENT_ENTITY_RUN_CONFLICT');
        values = []; const blocked = [];
        for (const member of manifest.documents) {
          // A later worker capture receives the rule during deterministic
          // replay. An existing but unreadable snapshot aborts the whole action.
          if (!fs.existsSync(path.join(base(), batchId, member.document_id, 'base.json'))) continue;
          try {
            const candidate = member.document_id === documentId ? value : current(batchId, member.document_id, events);
            if (!candidate.entities) throw fail('DOCUMENT_ENTITY_RUN_UNAVAILABLE');
            const matched = ruleDecisions(candidate, rules, key);
            if (matched.choices.length) values.push({ document_id: member.document_id, value: candidate,
              request: { ...request, entity_decisions: matched.choices, identities: matched.identities } });
          } catch (error) { blocked.push({ name: member.name, reason_code: ['DOCUMENT_ENTITY_RUN_UNAVAILABLE', 'DOCUMENT_ENTITY_RUN_CONFLICT'].includes(error.code)
            ? error.code : 'DOCUMENT_REVIEW_INVALID' }); }
        }
        if (blocked.length) return { ok: false, reason_code: 'DOCUMENT_ENTITY_RUN_CONFLICT', blocked_files: blocked,
          local_ui_only: true, external_disclosure: false };
        if (!values.some(row => row.document_id === documentId)) throw fail('DOCUMENT_ENTITY_RUN_UNAVAILABLE');
      }
      const targets = values.map(({ document_id: id, value: previousValue, request: action }) => {
        const projection = deriveProjection(batchId, previousValue, previousValue.snapshot, action), markdown = projection.markdown;
        if (previousValue.revision >= 1000 || markdown.length > RESOURCE_LIMITS.MAX_TEXT_CHARS || Buffer.byteLength(markdown) > MAX_TEXT)
          throw fail('DOCUMENT_REVIEW_LIMIT');
        if (action.action === 'approve') verifyCandidate({ ...previousValue, ...projection });
        return { document_id: id, event: { schema: 'datasecure-document-revision/1', revision: previousValue.revision + 1,
          parent_sha256: previousValue.output_sha256, output_sha256: hash(markdown), approved: action.action === 'approve',
          action: action.action, ranges: action.ranges, operation_id: request.operation_id, request_sha256: requestHash,
          ...(action.action === 'entities' ? { entity_decisions: action.entity_decisions } : {}) } };
      });
      if (events.length >= 10000) throw fail('DOCUMENT_REVIEW_LIMIT');
      const record = { schema: 'datasecure-run-decision/1', batch_id: batchId, sequence: events.length + 1,
        parent_sha256: events.at(-1)?.event_sha256 || hash(`datasecure-run-decisions/1:${batchId}`),
        origin_document_id: documentId, operation_id: request.operation_id, request_sha256: requestHash, scope,
        ...(rules ? { rules } : {}), targets };
      record.event_sha256 = hash(JSON.stringify(record));
      const run = ensurePrivateDirectory(base(), batchId);
      put(path.join(run, 'journal-format.json'), { schema: 'datasecure-run-decision-commit/2', batch_id: batchId });
      // Independent immutable commit evidence prevents a missing journal tail
      // from reviving an old approval. Losing both copies is not protected
      // against an adversary with this user's filesystem authority.
      put(path.join(run, `commit-${String(record.sequence).padStart(6, '0')}.json`), {
        schema: 'datasecure-run-commit-proof/1', batch_id: batchId, sequence: record.sequence,
        event_sha256: record.event_sha256, record });
      put(path.join(run, `decision-${String(record.sequence).padStart(6, '0')}.json`), record);
      return { ok: true, ...metadata(current(batchId, documentId)), affected_count: targets.length, scope,
        local_ui_only: true, external_disclosure: false };
    });
  }
  function saveIdentityOverview(batchId, selection) {
    const builder = createConfidentialOverview(batchId);
    for (const row of selection) {
      const value = current(batchId, row.document_id);
      if (purpose(value.snapshot) !== ANONYMIZE) throw fail('DOCUMENT_ENTITY_UNAVAILABLE');
      if (value.revision !== row.revision || value.output_sha256 !== row.output_sha256) throw fail('DOCUMENT_REVIEW_STALE');
      builder.add({ document_id: row.document_id, name: value.snapshot.name, revision: value.revision,
        output_sha256: value.output_sha256, markdown: value.markdown, entities: value.entities || null });
    }
    const overview = builder.finish(), run = ensurePrivateDirectory(base(), batchId);
    const name = `DataSecure-Identitaeten-${overview.binding_sha256}.txt`;
    const textFile = path.join(run, name), bytes = Buffer.from(overview.text);
    try {
      try { store().writeFile(textFile, bytes); }
      catch (error) { if (error.code !== 'PRIVATE_ARTIFACT_ALREADY_EXISTS') throw error;
        if (!store().readFile(textFile).equals(bytes)) throw fail('DOCUMENT_REVIEW_CONFLICT'); }
      put(path.join(run, `identity-${overview.binding_sha256}.json`), {
        schema: 'datasecure-confidential-snapshot/1', batch_id: batchId,
        binding_sha256: overview.binding_sha256, text_sha256: hash(bytes), overview: overview.value });
    } catch (error) { if (error.code === 'DOCUMENT_REVIEW_CONFLICT') throw error;
      throw fail('STANDALONE_IDENTITY_PUBLICATION_FAILED'); }
    return overview.binding_sha256;
  }
  function readIdentityOverview(batchId, binding, selection) {
    if (!valid(binding, 64)) throw fail('DOCUMENT_REVIEW_INVALID');
    const run = ensurePrivateDirectory(base(), batchId);
    const bounded = createPrivateWorkStore({ privateRoot: base(), maxBytes: MAX_OVERVIEW_BYTES });
    const file = path.join(run, `DataSecure-Identitaeten-${binding}.txt`);
    let record, bytes;
    try { record = JSON.parse(bounded.readFile(path.join(run, `identity-${binding}.json`)).toString('utf8')); bytes = bounded.readFile(file); }
    catch { throw fail('STANDALONE_IDENTITY_MAPPING_MISSING'); }
    if (!closed(record, 'schema,batch_id,binding_sha256,text_sha256,overview') ||
        record.schema !== 'datasecure-confidential-snapshot/1' || record.batch_id !== batchId || record.binding_sha256 !== binding ||
        !valid(record.text_sha256, 64) || hash(JSON.stringify(record.overview)) !== binding ||
        record.overview?.schema !== 'datasecure-confidential-overview/1' || record.overview.batch_id !== batchId ||
        record.overview.confidential !== true || record.overview.ai_upload_allowed !== false || !Array.isArray(record.overview.documents))
      throw fail('STANDALONE_IDENTITY_MAPPING_INVALID');
    const actual = record.overview.documents.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 }));
    // Object key order is not part of a selection's identity. In particular,
    // the native serde_json boundary orders keys differently from this JS
    // projection. Keep closed validation, but compare canonical value tuples.
    const canonical = rows => rows.map(({ document_id, revision, output_sha256 }) => [document_id, revision, output_sha256])
      .sort((a, b) => a[0].localeCompare(b[0], 'en'));
    if (!validSelection(actual) || selection && (!validSelection(selection) ||
        JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(selection))))
      throw fail('STANDALONE_IDENTITY_MAPPING_INVALID');
    if (hash(bytes) !== record.text_sha256) throw fail('STANDALONE_IDENTITY_MAPPING_INVALID');
    // The export binds the semantic overview, not the separately stored TXT
    // digest. Re-render that bound value so changing TXT plus its digest can
    // never substitute a different human-readable identity assignment.
    try { if (!bytes.equals(Buffer.from(renderConfidentialOverview(record.overview)))) throw fail(); }
    catch { throw fail('STANDALONE_IDENTITY_MAPPING_INVALID'); }
    return file;
  }
  function resolveIdentityOverview(batchId, operationId) {
    return locked(batchId, () => {
      const run = ensurePrivateDirectory(base(), batchId); let binding, selection;
      if (operationId !== undefined) {
        if (!valid(operationId, 32)) throw fail('AI_EXPORT_INVALID');
        const op = readOperation(run, operationId);
        if (!op.identity_binding_sha256 || !fs.existsSync(path.join(run, `export-${operationId}-complete.json`)))
          throw fail('STANDALONE_IDENTITY_MAPPING_MISSING');
        const complete = read(path.join(run, `export-${operationId}-complete.json`));
        if (!validExportRecord(complete, op, 'datasecure-ai-export-complete/2')) throw fail('AI_EXPORT_INVALID');
        binding = op.identity_binding_sha256; selection = op.selection;
      } else {
        const value = listLocked(batchId);
        selection = value.documents.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 }));
        if (!validSelection(selection)) throw fail('DOCUMENT_REVIEW_MISSING');
        binding = saveIdentityOverview(batchId, selection);
      }
      return { ok: true, local_path: readIdentityOverview(batchId, binding, selection), target_kind: 'file', external_disclosure: false };
    });
  }
  function operationContentDigest(batchId) {
    const manifest = runManifest(batchId);
    return manifest?.schema === 'datasecure-document-run/3' ? contentOptionsDigest(manifest.content_options) : undefined;
  }
  function operationDigest(batchId, operationId, mode, selection, identityBinding, native, files, contentDigest) {
    return hash(JSON.stringify({ schema: contentDigest ? 'datasecure-document-export/7' : files ? 'datasecure-document-export/6' : native ? 'datasecure-document-export/5' : identityBinding === undefined ? 'datasecure-document-export/3' : 'datasecure-document-export/4', batch_id: batchId,
      operation_id: operationId, processing_mode: mode,
      selection: selection.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 })),
      ...(identityBinding !== undefined ? { identity_binding_sha256: identityBinding } : {}), ...(native ? { native_export: native } : {}), ...(files ? { files } : {}),
      ...(contentDigest ? { content_options_sha256: contentDigest } : {}) }));
  }
  function readOperation(run, operationId) {
    const op = read(path.join(run, `export-${operationId}.json`)), batchId = path.basename(run);
    if (!validSelection(op.selection)) throw fail('AI_EXPORT_INVALID');
    const contentDigest = operationContentDigest(batchId), contentBound = op.schema === 'datasecure-document-export/7';
    if (Boolean(contentDigest) !== contentBound || !contentBound && Object.hasOwn(op, 'content_options_sha256')) throw fail('AI_EXPORT_INVALID');
    if (contentBound) {
      if (!exactKeys(op, ['schema', 'batch_id', 'operation_id', 'request_sha256', 'identity_binding_sha256', 'processing_mode',
        'root', 'root_identity', 'files', 'selection', 'content_options_sha256', ...(Object.hasOwn(op, 'native_export') ? ['native_export'] : [])]) ||
        op.batch_id !== batchId || op.operation_id !== operationId || ![MARKDOWN, ANONYMIZE].includes(op.processing_mode) ||
        op.content_options_sha256 !== contentDigest || (op.processing_mode === MARKDOWN ? op.identity_binding_sha256 !== null : !valid(op.identity_binding_sha256, 64)) ||
        !Array.isArray(op.files) || op.files.length !== op.selection.length || !validMarkdownInventory(op.files.map(row => row?.name)) ||
        op.files.some((row, index) => !exactKeys(row, ['name', 'sha256']) || row.sha256 !== op.selection[index].output_sha256 ||
          op.processing_mode === ANONYMIZE && row.name !== `Dokument_${String(index + 1).padStart(2, '0')}.md`) ||
        operationDigest(batchId, operationId, op.processing_mode, op.selection, op.identity_binding_sha256, op.native_export, op.files, contentDigest) !== op.request_sha256)
        throw fail('AI_EXPORT_INVALID');
    } else if (op.schema === 'datasecure-ai-export/2') {
      // Legacy operations had an implicit anonymization purpose. Never adopt
      // an unbound raw-Markdown operation as an AI export.
      if (op.processing_mode !== undefined && op.processing_mode !== ANONYMIZE ||
          hash(JSON.stringify(op.selection)) !== op.request_sha256) throw fail('AI_EXPORT_INVALID');
    } else if (op.schema === 'datasecure-document-export/6') {
      if (op.batch_id !== batchId || op.operation_id !== operationId || op.processing_mode !== MARKDOWN || op.identity_binding_sha256 !== null ||
          !Array.isArray(op.files) || op.files.length !== op.selection.length || !validMarkdownInventory(op.files.map(row => row?.name)) ||
          op.files.some((row, index) => !closed(row, 'name,sha256') || row.sha256 !== op.selection[index].output_sha256) ||
          operationDigest(batchId, operationId, MARKDOWN, op.selection, null, op.native_export, op.files) !== op.request_sha256) throw fail('AI_EXPORT_INVALID');
    } else if (!['datasecure-document-export/3', 'datasecure-document-export/4', 'datasecure-document-export/5'].includes(op.schema) || op.batch_id !== batchId ||
        op.operation_id !== operationId || ![MARKDOWN, ANONYMIZE].includes(op.processing_mode) ||
        ['datasecure-document-export/4', 'datasecure-document-export/5'].includes(op.schema) && (op.processing_mode === ANONYMIZE ? !valid(op.identity_binding_sha256, 64) : op.identity_binding_sha256 !== null) ||
        operationDigest(batchId, operationId, op.processing_mode, op.selection,
          ['datasecure-document-export/4', 'datasecure-document-export/5'].includes(op.schema) ? op.identity_binding_sha256 : undefined,
          op.schema === 'datasecure-document-export/5' ? op.native_export : undefined) !== op.request_sha256) throw fail('AI_EXPORT_INVALID');
    // Missing human reference data must not erase a completed copy/ACK.
    // New or resumed copying validates it separately before target I/O.
    if (!['datasecure-document-export/4', 'datasecure-document-export/5', 'datasecure-document-export/6', 'datasecure-document-export/7'].includes(op.schema) && Object.hasOwn(op, 'identity_binding_sha256')) throw fail('AI_EXPORT_INVALID');
    const files = ['datasecure-document-export/6', 'datasecure-document-export/7'].includes(op.schema) ? op.files : op.selection.map((row, index) => ({ name: `Dokument_${String(index + 1).padStart(2, '0')}.md`, sha256: row.output_sha256 }));
    if (JSON.stringify(op.files) !== JSON.stringify(files)) throw fail('AI_EXPORT_INVALID');
    if (isNativeOperation(op)) {
      const native = op.native_export;
      if (!closed(native, 'binding,files') || !validNativeExportBinding(native.binding) || native.binding.root !== op.root ||
          !Array.isArray(native.files) || native.files.length !== files.length || native.files.some((file, index) =>
            !closed(file, 'name,bytes,sha256') || file.name !== files[index].name || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_TEXT ||
            !Array.isArray(file.sha256) || file.sha256.length !== 32 || file.sha256.some(b => !Number.isInteger(b) || b < 0 || b > 255) ||
            Buffer.from(file.sha256).toString('hex') !== files[index].sha256) || native.files.reduce((total, file) => total + file.bytes, 0) > 500 * 1024 * 1024)
        throw fail('AI_EXPORT_INVALID');
    } else if (Object.hasOwn(op, 'native_export')) throw fail('AI_EXPORT_INVALID');
    return op;
  }
  const isNativeOperation = op => op.schema === 'datasecure-document-export/5' ||
    ['datasecure-document-export/6', 'datasecure-document-export/7'].includes(op.schema) && Object.hasOwn(op, 'native_export');
  function selectedFilePlan(batchId, selection, { rawPreview = false } = {}) {
    const sources = []; let mode, total = 0;
    // Validate the committed decision chain once for the whole selection.
    // Re-reading it in current() for every document makes a large approved
    // run quadratic and can outlive the desktop IPC deadline before preview.
    const events = journal(batchId);
    // Retain metadata only. Preview must not materialize 200 document bodies,
    // traces and original texts before reaching the aggregate export budget.
    for (const row of selection) {
      const value = current(batchId, row.document_id, events);
      if (mode && purpose(value.snapshot) !== mode) throw fail('AI_EXPORT_INVALID');
      mode = purpose(value.snapshot);
      if (value.revision !== row.revision || value.output_sha256 !== row.output_sha256) throw fail('DOCUMENT_REVIEW_STALE');
      // Only read-only Raw previews may precede copy confirmation. Actual
      // export/publication callers retain their approval requirement.
      if (!value.approved && !(rawPreview && mode === MARKDOWN)) throw fail('DOCUMENT_REVIEW_UNAPPROVED');
      total += Buffer.byteLength(value.markdown);
      if (total > 500 * 1024 * 1024) throw fail('DOCUMENT_REVIEW_LIMIT');
      sources.push({ source_label: value.snapshot.name });
    }
    const names = mode === MARKDOWN ? safeMarkdownOutputNames(sources) :
      selection.map((_row, index) => `Dokument_${String(index + 1).padStart(2, '0')}.md`);
    return { mode, files: names.map((name, index) => ({ name, sha256: selection[index].output_sha256 })) };
  }
  function previewExport(batchId, operationId, selection) {
    return locked(batchId, () => {
      if (!valid(operationId, 32) || !validSelection(selection)) throw fail('AI_EXPORT_INVALID');
      const run = ensurePrivateDirectory(base(), batchId), filename = path.join(run, `export-${operationId}.json`);
      let plan;
      if (fs.existsSync(filename)) {
        const op = readOperation(run, operationId);
        if (JSON.stringify(op.selection) !== JSON.stringify(selection) || abandoned(run, operationId, op)) throw fail('AI_EXPORT_CONFLICT');
        plan = { mode: op.processing_mode || ANONYMIZE, files: op.files };
      } else plan = selectedFilePlan(batchId, selection, { rawPreview: true });
      return { ok: true, processing_mode: plan.mode, files: plan.files, local_ui_only: true, external_disclosure: false };
    });
  }
  const exportBinding = op => ({ batch_id: op.batch_id, operation_id: op.operation_id,
    processing_mode: op.processing_mode || ANONYMIZE, request_sha256: op.request_sha256 });
  function validExportRecord(record, op, schema) {
    return record?.schema === schema && record.request_sha256 === op.request_sha256 &&
      (op.schema === 'datasecure-ai-export/2' ||
        ['batch_id', 'operation_id', 'processing_mode'].every(key => record[key] === op[key]));
  }
  function abandoned(run, operationId, op) {
    const file = path.join(run, `export-${operationId}-abandoned.json`);
    if (!fs.existsSync(file)) return false;
    const record = read(file);
    if (!validExportRecord(record, op, 'datasecure-document-export-abandoned/1') || record.reason !== 'user_abandoned' ||
        !Number.isFinite(Date.parse(record.abandoned_at)) || fs.existsSync(path.join(run, `export-${operationId}-complete.json`)))
      throw fail('AI_EXPORT_INVALID');
    return true;
  }
  function abandonExport(batchId, operationId, digest) {
    if (options.nativeExport) return abandonNativeExport(batchId, operationId, digest);
    return locked(batchId, () => {
      if (!valid(operationId, 32) || !valid(digest, 64)) throw fail('AI_EXPORT_INVALID');
      const run = ensurePrivateDirectory(base(), batchId);
      if (!fs.existsSync(path.join(run, `export-${operationId}.json`))) throw fail('AI_EXPORT_INVALID');
      const op = readOperation(run, operationId);
      if (isNativeOperation(op)) throw fail('AI_EXPORT_CONFIGURATION_REQUIRED');
      if (op.request_sha256 !== digest) throw fail('AI_EXPORT_CONFLICT');
      if (!abandoned(run, operationId, op)) {
        if (fs.existsSync(path.join(run, `export-${operationId}-complete.json`))) throw fail('AI_EXPORT_ALREADY_COMPLETE');
        put(path.join(run, `export-${operationId}-abandoned.json`), { schema: 'datasecure-document-export-abandoned/1',
          ...exportBinding(op), reason: 'user_abandoned', abandoned_at: new Date().toISOString() });
      }
      return { ok: true, abandoned: true, operation_id: operationId, local_ui_only: true, external_disclosure: false };
    });
  }
  function exportRecords(run, documents = []) {
    const operations = [], receipts = [], exportedCurrent = new Set();
    const currentDocuments = new Map(documents.map(row => [row.document_id, row]));
    for (const file of fs.readdirSync(run).filter(name => /^export-[a-f0-9]{32}\.json$/u.test(name)).sort()) {
      const operationId = file.slice(7, -5), op = readOperation(run, operationId);
      if (abandoned(run, operationId, op)) continue;
      const complete = path.join(run, `export-${operationId}-complete.json`);
      if (fs.existsSync(complete)) {
        const record = read(complete);
        if (!validExportRecord(record, op, 'datasecure-ai-export-complete/2') ||
            !Number.isSafeInteger(record.attempt) || record.attempt < 1 || record.attempt > 16 ||
            record.completed_at !== undefined && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(record.completed_at)) throw fail('AI_EXPORT_INVALID');
        receipts.push({ operation_id: operationId, exported_count: op.selection.length,
          processing_mode: op.processing_mode || ANONYMIZE,
          identity_overview_available: Boolean(op.identity_binding_sha256),
          folder_name: `Export-${operationId}${record.attempt === 1 ? '' : `-${record.attempt}`}`,
          recorded_at: record.completed_at || null });
        // Historical receipt count says nothing about today's revisions or
        // coverage. Count each exactly bound current document at most once,
        // including copies whose separate receipt ACK is still outstanding.
        for (const row of op.selection) {
          const current = currentDocuments.get(row.document_id);
          if (current && current.processing_mode === (op.processing_mode || ANONYMIZE) &&
              current.revision === row.revision && current.output_sha256 === row.output_sha256)
            exportedCurrent.add(row.document_id);
        }
      }
      const receipt = path.join(run, `export-${operationId}-acknowledged.json`);
      if (fs.existsSync(receipt)) {
        const ack = read(receipt);
        if (!fs.existsSync(complete) || !validExportRecord(ack, op, 'datasecure-ai-export-ack/1')) throw fail('AI_EXPORT_INVALID');
        continue;
      }
      operations.push({ operation_id: operationId, selection: op.selection, digest: op.request_sha256,
        processing_mode: op.processing_mode || ANONYMIZE, status: fs.existsSync(complete) ? 'completed' : 'incomplete' });
      if (operations.length > 16) throw fail('DOCUMENT_REVIEW_LIMIT');
    }
    receipts.sort((a, b) => (b.recorded_at || '').localeCompare(a.recorded_at || '') || a.operation_id.localeCompare(b.operation_id));
    return { pending: operations, receipts: receipts.slice(0, 20), recordedCount: receipts.length,
      currentExportedCount: exportedCurrent.size };
  }
  function nativeOperation(op) { return { ...exportBinding(op), binding: op.native_export.binding, files: op.native_export.files }; }
  async function nativeCall(op, command, body) {
    if (!options.nativeExport || !isNativeOperation(op)) throw fail('AI_EXPORT_CONFIGURATION_REQUIRED');
    const status = await options.nativeExport(nativeOperation(op), command, body);
    if (!(command === 'write_body' ? ['receiving', 'staged'] : ['unprepared', 'prepared', 'completed', 'acknowledged', 'abandoned']).includes(status)) throw fail('AI_EXPORT_INVALID');
    return status;
  }
  function nativeCompletion(run, op, status) {
    const file = path.join(run, `export-${op.operation_id}-complete.json`);
    if (!['completed', 'acknowledged'].includes(status)) {
      if (fs.existsSync(file)) throw fail('AI_EXPORT_CONFLICT');
      return false;
    }
    if (fs.existsSync(file)) {
      const record = read(file);
      if (!validExportRecord(record, op, 'datasecure-ai-export-complete/2') || record.attempt !== 1) throw fail('AI_EXPORT_INVALID');
    } else put(file, { schema: 'datasecure-ai-export-complete/2', ...exportBinding(op), attempt: 1, completed_at: new Date().toISOString() });
    if (status === 'acknowledged') put(path.join(run, `export-${op.operation_id}-acknowledged.json`),
      { schema: 'datasecure-ai-export-ack/1', ...exportBinding(op) });
    return true;
  }
  function nativeResponse(op) { return { ok: true, operation_id: op.operation_id, folder_name: `Export-${op.operation_id}`, exported_count: op.files.length,
    ...(op.processing_mode === MARKDOWN ? { processing_mode: MARKDOWN, anonymized: false } : {}), local_ui_only: true, external_disclosure: false }; }
  function exportNativeApproved(batchId, operationId, selection, acknowledge) {
    return locked(batchId, async () => {
      if (!valid(operationId, 32) || !validSelection(selection)) throw fail('AI_EXPORT_INVALID');
      const run = ensurePrivateDirectory(base(), batchId), file = path.join(run, `export-${operationId}.json`);
      let op, nativeStatus;
      if (fs.existsSync(file)) {
        op = readOperation(run, operationId);
        if (!isNativeOperation(op)) throw fail('AI_EXPORT_CONFIGURATION_REQUIRED');
        if (JSON.stringify(op.selection) !== JSON.stringify(selection)) throw fail('AI_EXPORT_CONFLICT');
        if (abandoned(run, operationId, op)) throw fail('AI_EXPORT_ABANDONED');
        // Reconcile before checking current revisions: a completed earlier
        // copy remains a historical fact after a later edit or revocation.
        const status = nativeStatus = await nativeCall(op, 'reconcile');
        if (status === 'abandoned') throw fail('AI_EXPORT_ABANDONED');
        if (nativeCompletion(run, op, status)) {
          if (acknowledge) nativeCompletion(run, op, await nativeCall(op, 'acknowledge'));
          return nativeResponse(op);
        }
      }
      if (acknowledge) throw fail('AI_EXPORT_INCOMPLETE');
      const plan = op ? { mode: op.processing_mode, files: op.files } : selectedFilePlan(batchId, selection);
      const events = journal(batchId);
      let mode, total = 0; const nativeFiles = [];
      for (const [index, row] of selection.entries()) {
        const value = current(batchId, row.document_id, events);
        if (mode && mode !== purpose(value.snapshot)) throw fail('AI_EXPORT_INVALID');
        mode = purpose(value.snapshot);
        if (value.revision !== row.revision || value.output_sha256 !== row.output_sha256) throw fail('DOCUMENT_REVIEW_STALE');
        if (!value.approved) throw fail('DOCUMENT_REVIEW_UNAPPROVED');
        verifyCandidate(value);
        const bytes = Buffer.byteLength(value.markdown); total += bytes;
        if (bytes > MAX_TEXT || total > 500 * 1024 * 1024) throw fail('DOCUMENT_REVIEW_LIMIT');
        nativeFiles.push({ name: plan.files[index].name, bytes, sha256: [...Buffer.from(row.output_sha256, 'hex')] });
      }
      if (!op) {
        if (exportRecords(run).pending.length >= 16) throw fail('DOCUMENT_REVIEW_LIMIT');
        const binding = options.nativeBinding ? options.nativeBinding() : readConfiguredNativeExportBinding();
        if (!validNativeExportBinding(binding)) throw fail('AI_EXPORT_CONFIGURATION_REQUIRED');
        const inspected = inspectRoot(binding.root);
        const identityBinding = mode === ANONYMIZE ? saveIdentityOverview(batchId, selection) : null;
        const native = { binding, files: nativeFiles };
        const contentDigest = operationContentDigest(batchId);
        op = { schema: contentDigest ? 'datasecure-document-export/7' : mode === MARKDOWN ? 'datasecure-document-export/6' : 'datasecure-document-export/5', batch_id: batchId, operation_id: operationId,
          ...(contentDigest ? { content_options_sha256: contentDigest } : {}),
          request_sha256: operationDigest(batchId, operationId, mode, selection, identityBinding, native, mode === MARKDOWN || contentDigest ? plan.files : undefined, contentDigest),
          processing_mode: mode, identity_binding_sha256: identityBinding, root: inspected.root,
          root_identity: bindDirectory(inspected.root).chain[0].identity, selection,
          files: nativeFiles.map(({ name, sha256 }) => ({ name, sha256: Buffer.from(sha256).toString('hex') })), native_export: native };
        put(file, op); // exact native parents remain frozen across configuration changes
      }
      if (op.processing_mode !== mode || JSON.stringify(op.native_export.files) !== JSON.stringify(nativeFiles)) throw fail('AI_EXPORT_CONFLICT');
      if (op.identity_binding_sha256) readIdentityOverview(batchId, op.identity_binding_sha256, selection);
      // Stream through the owning pipe. No Node path-based write into a fresh
      // binding can precede native identity and private-ACL verification.
      for (const [index, row] of (nativeStatus === 'prepared' ? [] : selection).entries()) {
        const value = current(batchId, row.document_id, events), bytes = Buffer.from(value.markdown);
        if (!value.approved || value.revision !== row.revision || hash(bytes) !== row.output_sha256) throw fail('DOCUMENT_REVIEW_STALE');
        const chunkSize = 65536;
        for (let offset = 0; offset < bytes.length || offset === 0; offset += chunkSize) {
          const end = Math.min(offset + chunkSize, bytes.length), final = end === bytes.length;
          const status = await nativeCall(op, 'write_body', { index, offset, hex: bytes.subarray(offset, end).toString('hex'), final_chunk: final });
          if (status !== (final ? 'staged' : 'receiving')) throw fail('AI_EXPORT_INVALID');
        }
      }
      if (!nativeCompletion(run, op, await nativeCall(op, 'publish'))) throw fail('AI_EXPORT_INCOMPLETE');
      return nativeResponse(op);
    });
  }
  function abandonNativeExport(batchId, operationId, digest) {
    return locked(batchId, async () => {
      if (!valid(operationId, 32) || !valid(digest, 64)) throw fail('AI_EXPORT_INVALID');
      const run = ensurePrivateDirectory(base(), batchId), op = readOperation(run, operationId);
      if (op.request_sha256 !== digest) throw fail('AI_EXPORT_CONFLICT');
      if (await nativeCall(op, 'abandon') !== 'abandoned') throw fail('AI_EXPORT_UNCERTAIN');
      if (fs.existsSync(path.join(run, `export-${operationId}-complete.json`))) throw fail('AI_EXPORT_CONFLICT');
      const abandonedFile = path.join(run, `export-${operationId}-abandoned.json`);
      if (!fs.existsSync(abandonedFile)) put(abandonedFile, { schema: 'datasecure-document-export-abandoned/1',
        ...exportBinding(op), reason: 'user_abandoned', abandoned_at: new Date().toISOString() });
      return { ok: true, abandoned: true, operation_id: operationId, local_ui_only: true, external_disclosure: false };
    });
  }
  function resolveNativeExport(batchId, operationId) {
    return locked(batchId, async () => {
      if (!valid(operationId, 32)) throw fail('AI_EXPORT_INVALID');
      const run = ensurePrivateDirectory(base(), batchId), op = readOperation(run, operationId);
      if (abandoned(run, operationId, op)) throw fail('AI_EXPORT_ABANDONED');
      const status = await nativeCall(op, 'reconcile');
      if (status === 'abandoned') throw fail('AI_EXPORT_ABANDONED');
      if (!nativeCompletion(run, op, status)) throw fail('AI_EXPORT_INCOMPLETE');
      return { ok: true, local_path: path.join(op.root, exportNamespace(op.processing_mode), `Export-${operationId}`),
        target_kind: 'directory', external_disclosure: false };
    });
  }
  function exportApproved(batchId, operationId, selection, acknowledge = false) {
    if (options.nativeExport) return exportNativeApproved(batchId, operationId, selection, acknowledge);
    return locked(batchId, () => {
      if (!valid(operationId, 32) || !validSelection(selection) || typeof acknowledge !== 'boolean') throw fail('AI_EXPORT_INVALID');
      const run = ensurePrivateDirectory(base(), batchId), opFile = path.join(run, `export-${operationId}.json`);
      const completeFile = path.join(run, `export-${operationId}-complete.json`);
      let requestHash;
      let files;
      let op;
      if (fs.existsSync(opFile)) {
        op = readOperation(run, operationId); requestHash = op.request_sha256;
        if (isNativeOperation(op)) throw fail('AI_EXPORT_CONFIGURATION_REQUIRED');
        if (JSON.stringify(op.selection) !== JSON.stringify(selection)) throw fail('AI_EXPORT_CONFLICT');
        files = op.files;
        if (abandoned(run, operationId, op)) throw fail('AI_EXPORT_ABANDONED');
      }
      const folder = attempt => `Export-${operationId}${attempt === 1 ? '' : `-${attempt}`}`;
      function boundDestination(attempt, ownership) {
        const target = path.join(op.root, exportNamespace(op.processing_mode || ANONYMIZE), folder(attempt));
        createPrivateWorkStore({ privateRoot: op.root, expectedRootIdentity: op.root_identity }).ensureReady();
        if (!validExportRecord(ownership, op, 'datasecure-ai-export-owner/1') || ownership.attempt !== attempt) throw fail('AI_EXPORT_INVALID');
        // Bind to the persisted identity itself, not an identity re-read from
        // a potentially replaced directory between inspection and store open.
        const destination = createPrivateWorkStore({ privateRoot: target, expectedRootIdentity: ownership.identity, maxBytes: MAX_TEXT });
        destination.ensureReady(); return { target, destination };
      }
      function verifyComplete(target, destination) {
        for (const file of files) if (hash(destination.readFile(path.join(target, file.name))) !== file.sha256) throw fail('AI_EXPORT_CONFLICT');
        if (JSON.stringify(fs.readdirSync(target).sort()) !== JSON.stringify(files.map(row => row.name).sort())) throw fail('AI_EXPORT_CONFLICT');
        destination.ensureReady();
      }
      const response = attempt => ({ ok: true, operation_id: operationId, folder_name: folder(attempt), exported_count: files.length,
        ...(op.processing_mode === MARKDOWN ? { processing_mode: MARKDOWN, anonymized: false } : {}),
        local_ui_only: true, external_disclosure: false });
      if (fs.existsSync(completeFile)) {
        const completed = read(completeFile);
        if (!op || !validExportRecord(completed, op, 'datasecure-ai-export-complete/2') ||
            !Number.isSafeInteger(completed.attempt) || completed.attempt < 1 || completed.attempt > 16) throw fail('AI_EXPORT_INVALID');
        const ownership = read(path.join(run, `export-${operationId}-${completed.attempt}-owner.json`));
        const { target, destination } = boundDestination(completed.attempt, ownership);
        verifyComplete(target, destination);
        if (acknowledge) {
          const ackFile = path.join(run, `export-${operationId}-acknowledged.json`);
          if (fs.existsSync(ackFile)) {
            if (!validExportRecord(read(ackFile), op, 'datasecure-ai-export-ack/1')) throw fail('AI_EXPORT_INVALID');
          } else put(ackFile, { schema: 'datasecure-ai-export-ack/1', ...exportBinding(op) });
        }
        // A lost acknowledgement is reconciled even after a later revocation.
        // This reports the existing completed copy; it never creates another.
        return response(completed.attempt);
      }
      if (acknowledge) throw fail('AI_EXPORT_INCOMPLETE');
      // Re-read approval while holding the same control lock as edits/revokes.
      const events = journal(batchId);
      let totalBytes = 0, mode;
      for (const row of selection) {
        const value = current(batchId, row.document_id, events);
        if (mode && mode !== purpose(value.snapshot)) throw fail('AI_EXPORT_INVALID');
        mode = purpose(value.snapshot);
        if (value.revision !== row.revision || value.output_sha256 !== row.output_sha256) throw fail('DOCUMENT_REVIEW_STALE');
        if (!value.approved) throw fail('DOCUMENT_REVIEW_UNAPPROVED');
        verifyCandidate(value);
        totalBytes += Buffer.byteLength(value.markdown);
        if (totalBytes > 500 * 1024 * 1024) throw fail('DOCUMENT_REVIEW_LIMIT');
      }
      if (!op) {
        files = selectedFilePlan(batchId, selection).files;
        if (exportRecords(run).pending.length >= 16) throw fail('DOCUMENT_REVIEW_LIMIT');
        const root = inspectRoot(options.resultRoot ? options.resultRoot() : readConfiguredResultRoot());
        const identityBinding = mode === ANONYMIZE ? saveIdentityOverview(batchId, selection) : null;
        const contentDigest = operationContentDigest(batchId);
        requestHash = operationDigest(batchId, operationId, mode, selection, identityBinding, undefined, mode === MARKDOWN || contentDigest ? files : undefined, contentDigest);
        op = { schema: contentDigest ? 'datasecure-document-export/7' : mode === MARKDOWN ? 'datasecure-document-export/6' : 'datasecure-document-export/4', batch_id: batchId, operation_id: operationId, request_sha256: requestHash,
          ...(contentDigest ? { content_options_sha256: contentDigest } : {}),
          identity_binding_sha256: identityBinding,
          processing_mode: mode,
          root: root.root, root_identity: bindDirectory(root.root).chain[0].identity, files, selection };
        // The operation is durable before creating any user-visible directory.
        put(opFile, op);
      }
      if (op.identity_binding_sha256) readIdentityOverview(batchId, op.identity_binding_sha256, op.selection);
      createPrivateWorkStore({ privateRoot: op.root, expectedRootIdentity: op.root_identity }).ensureReady();
      if ((op.processing_mode || ANONYMIZE) !== mode) throw fail('AI_EXPORT_CONFLICT');
      const exportsRoot = ensurePrivateDirectory(op.root, exportNamespace(mode));
      let target, destination, attempt;
      for (attempt = 1; attempt <= 16; attempt++) {
        const ownerFile = path.join(run, `export-${operationId}-${attempt}-owner.json`);
        const planFile = path.join(run, `export-${operationId}-${attempt}-plan.json`);
        if (fs.existsSync(ownerFile)) {
          ({ target, destination } = boundDestination(attempt, read(ownerFile))); break;
        }
        target = path.join(exportsRoot, folder(attempt));
        put(planFile, { schema: 'datasecure-ai-export-attempt/1', attempt, ...exportBinding(op) });
        try { fs.mkdirSync(target, { mode: 0o700 }); }
        catch (error) {
          // An unbound directory is never adopted. A crash between mkdir and
          // owner persistence leaves an empty attempt untouched, and retry
          // safely uses the next name (no deletion or silent overwrite).
          if (error.code === 'EEXIST') continue;
          throw fail('AI_EXPORT_INCOMPLETE');
        }
        const ownership = { schema: 'datasecure-ai-export-owner/1', attempt, ...exportBinding(op),
          identity: bindDirectory(target).chain[0].identity };
        put(ownerFile, ownership);
        ({ target, destination } = boundDestination(attempt, ownership)); break;
      }
      if (!destination) throw fail('AI_EXPORT_CONFLICT');
      // Keep only one private document body in scope. Holding 200 originals
      // and candidates before checking the aggregate budget can exhaust memory.
      // The same control lock still excludes edits/revocations during both passes.
      for (let index = 0; index < selection.length; index++) {
        const row = selection[index], value = current(batchId, row.document_id, events);
        if (value.revision !== row.revision || value.output_sha256 !== row.output_sha256 || !value.approved)
          throw fail('DOCUMENT_REVIEW_STALE');
        const file = path.join(target, files[index].name), bytes = Buffer.from(value.markdown);
        try { destination.writeFile(file, bytes); }
        catch (error) { if (error.code !== 'PRIVATE_ARTIFACT_ALREADY_EXISTS') throw fail('AI_EXPORT_INCOMPLETE'); }
        if (hash(destination.readFile(file)) !== files[index].sha256) throw fail('AI_EXPORT_CONFLICT');
      }
      verifyComplete(target, destination); syncParentDirectory(path.join(target, files[0].name)); destination.ensureReady();
      put(completeFile, { schema: 'datasecure-ai-export-complete/2', ...exportBinding(op), attempt,
        completed_at: new Date().toISOString() });
      return response(attempt);
    });
  }
  function resolveExport(batchId, operationId) {
    if (options.nativeExport) return resolveNativeExport(batchId, operationId);
    return locked(batchId, () => {
      if (!valid(operationId, 32)) throw fail('AI_EXPORT_INVALID');
      const run = ensurePrivateDirectory(base(), batchId);
      if (!fs.existsSync(path.join(run, `export-${operationId}.json`))) throw fail('AI_EXPORT_INVALID');
      const op = readOperation(run, operationId);
      if (isNativeOperation(op)) throw fail('AI_EXPORT_CONFIGURATION_REQUIRED');
      if (abandoned(run, operationId, op)) throw fail('AI_EXPORT_ABANDONED');
      const completeFile = path.join(run, `export-${operationId}-complete.json`);
      if (!fs.existsSync(completeFile)) throw fail('AI_EXPORT_INCOMPLETE');
      const complete = read(completeFile);
      if (!validExportRecord(complete, op, 'datasecure-ai-export-complete/2') ||
          !Number.isSafeInteger(complete.attempt) || complete.attempt < 1 || complete.attempt > 16) throw fail('AI_EXPORT_INVALID');
      const owner = read(path.join(run, `export-${operationId}-${complete.attempt}-owner.json`));
      if (!validExportRecord(owner, op, 'datasecure-ai-export-owner/1') || owner.attempt !== complete.attempt) throw fail('AI_EXPORT_INVALID');
      const target = path.join(op.root, exportNamespace(op.processing_mode || ANONYMIZE),
        `Export-${operationId}${complete.attempt === 1 ? '' : `-${complete.attempt}`}`);
      try {
        createPrivateWorkStore({ privateRoot: op.root, expectedRootIdentity: op.root_identity }).ensureReady();
        const destination = createPrivateWorkStore({ privateRoot: target, expectedRootIdentity: owner.identity, maxBytes: MAX_TEXT });
        destination.ensureReady();
        if (JSON.stringify(fs.readdirSync(target).sort()) !== JSON.stringify(op.files.map(row => row.name).sort())) throw fail('AI_EXPORT_CONFLICT');
        for (const file of op.files) if (hash(destination.readFile(path.join(target, file.name))) !== file.sha256) throw fail('AI_EXPORT_CONFLICT');
        destination.ensureReady();
      } catch { throw fail('AI_EXPORT_CONFLICT'); }
      // Only the private sidecar/native channel receives this path. Resolving
      // never creates, retries, acknowledges or changes an export operation.
      return { ok: true, local_path: target, target_kind: 'directory', external_disclosure: false };
    });
  }
  return Object.freeze({ captureRun, capture, capturePrepared, preparedReplay, assertContentBinding, assertDocumentBinding, hasPublicationEvidence, notProcessed, recordPublication, publicationExpectation, list, historySummary, chunk, entities, decide, previewExport, exportApproved, abandonExport, resolveExport, resolveIdentityOverview });
}
module.exports = { createDocumentReviewStore, MAX_TEXT, CHUNK };
