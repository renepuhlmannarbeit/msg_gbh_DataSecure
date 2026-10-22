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
const { withDocumentControl, withSynchronousDocumentControl } = require('./standalone-document-control');
const { readBoundFile, readBoundFileRecord, bindDirectory, assertDirectory } = require('../core/bound-file-io');
const { createPublicResultMetadataInspector } = require('../core/public-result-metadata');
const { readConfiguredResultRoot, inspectRoot, readConfiguredNativeExportBinding } = require('../gateway/result-folder-config');
const { validNativeExportBinding } = require('../core/native-directory-identity');
const { syncParentDirectory } = require('../gateway/batch-journal-io');
const { RESOURCE_LIMITS } = require('../resource-limits');
const { validateDocumentResult, isDocumentResultReasonCode, GRADES } = require('../core/document-result-grade');
const entityReview = require('./standalone-entity-review');
const { safeMarkdownOutputNames, validMarkdownInventory } = require('../core/markdown-output-names');
const { contentOptionsForBatch, validateContentOptions } = require('../core/content-options');
const { validateReviewPolicy, reviewPolicyForBatch } = require('../core/standalone-review-policy');
const { contentOptionsDigest } = require('./content-options-binding');
const { validatePrivateDocumentMetadata } = require('../core/private-document-metadata');
const { exactKeys, SOURCE_TYPES } = require('../standalone/markdown-contract');
const { validateMarkdownArtifactForOptions } = require('../standalone/markdown-artifact');
const { validateExpectation } = require('../standalone/anonymized-artifact');
const { processingModeForBatch } = require('../core/processing-mode');
const { createConfidentialOverview, renderConfidentialOverview, MAX_BYTES: MAX_OVERVIEW_BYTES } = require('../standalone/confidential-overview');
const { renderConfidentialWorkbook } = require('../standalone/confidential-workbook');
const { DIRECTORY: COMPANION_DIRECTORY, MAX_IDENTITY_BYTES,
  MAX_TOTAL_BYTES: MAX_RESULT_BYTES, validConfidentialDescriptor, validResultCompanionFiles,
  buildFilenameMapping, confidentialDescriptor, confidentialVersion, confidentialFiles, confidentialBytes } = require('../standalone/result-companions');
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
    selection.every(row => closed(row, 'document_id,output_sha256,revision') &&
      valid(row.document_id, 32) && valid(row.output_sha256, 64) && Number.isSafeInteger(row.revision) && row.revision >= 0) &&
    new Set(selection.map(row => row.document_id)).size === selection.length;
}
function batchDecisionDigest(batchId, action, operationId, selection) {
  // Stable field order makes a retry independent of JSON object key order.
  // Selection order remains part of the exact operation acknowledgement.
  return hash(JSON.stringify({ schema: 'datasecure-document-selection-decision/1', batch_id: batchId,
    action, operation_id: operationId, selection: selection.map(({ document_id, revision, output_sha256 }) =>
      ({ document_id, revision, output_sha256 })) }));
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
  // Synchronous, call-local observation only. Never retained across an await or
  // exported as a capability; the mutation rechecks its held observations.
  let recoveryReadContext = null;
  // One synchronous, control-locked list/decision operation may share its
  // immutable run manifest and already bound private-store setup. No document,
  // revision, approval or hash result is cached, and no context survives a call.
  function readOperationContext(batchId) {
    try {
      const privatePath = base(), runPath = ensurePrivateDirectory(privatePath, batchId);
      const privateDirectory = bindDirectory(privatePath), runDirectory = bindDirectory(runPath);
      const workStore = createPrivateWorkStore({ privateRoot: privatePath, maxBytes: 8 * MAX_TEXT,
        expectedRootIdentity: privateDirectory.chain[0].identity });
      assertDirectory(privateDirectory); assertDirectory(runDirectory);
      return { batchId, privateDirectory, runDirectory, workStore, manifest: undefined, manifestRecord: null };
    } catch { throw fail('DOCUMENT_REVIEW_INVALID'); }
  }
  function assertReadOperation(context) {
    try {
      assertDirectory(context.privateDirectory); assertDirectory(context.runDirectory);
      if (context.manifest !== undefined) {
        const file = path.join(context.runDirectory.path, 'manifest.json');
        if (context.manifestRecord) {
          const record = readBoundFileRecord(file, { directory: context.runDirectory, maximum: 8 * MAX_TEXT, checkCtime: true });
          const previous = context.manifestRecord;
          if (Object.keys(previous.identity).some(key => record.identity[key] !== previous.identity[key]) ||
              !record.bytes.equals(previous.bytes)) throw fail('DOCUMENT_REVIEW_CONFLICT');
        } else {
          try { fs.lstatSync(file); }
          catch (error) { if (error?.code === 'ENOENT') { assertDirectory(context.runDirectory); return; } throw error; }
          throw fail('DOCUMENT_REVIEW_CONFLICT');
        }
      }
      assertDirectory(context.privateDirectory); assertDirectory(context.runDirectory);
    } catch { throw fail('DOCUMENT_REVIEW_CONFLICT'); }
  }
  const controlGate = () => {
    // A gate belongs to one operation. Bind its original private directory once,
    // then freshly recheck that object on every lock access rather than running
    // recursive directory creation/validation again or adopting a replacement.
    let privateDirectory, lockFile;
    return createBatchActiveLock({ lockPath: () => {
      // The first creating access remains inside ownership admission, including
      // the Busy path. Constructing a gate alone must never create a directory.
      if (!privateDirectory) {
        privateDirectory = bindDirectory(base());
        lockFile = path.join(privateDirectory.path, 'control.lock');
      }
      assertDirectory(privateDirectory); return lockFile;
    },
      ...(options.controlOwnerPid ? { process: { pid: options.controlOwnerPid, kill: process.kill.bind(process) } } : {}),
      ...(options.controlOwnerGeneration ? { ownerGeneration: options.controlOwnerGeneration } : {}) });
  };
  if (options.retiredControlGenerations?.length && !controlGate().retireDelegatedOwner(options.retiredControlGenerations))
    throw fail('STANDALONE_CONNECTION_RECOVERY_BLOCKED');
  function directory(batchId, documentId, create = false, context = null) {
    if (!valid(batchId, 64) || !valid(documentId, 32)) throw fail('DOCUMENT_REVIEW_INVALID');
    if (context && context.batchId !== batchId) throw fail('DOCUMENT_REVIEW_INVALID');
    const run = context ? context.runDirectory.path : ensurePrivateDirectory(base(), batchId);
    if (create) return ensurePrivateDirectory(run, documentId);
    // A missing-body read must not manufacture an empty document directory:
    // that would become false publication evidence on the next history read.
    const target = path.join(run, documentId);
    bindDirectory(target);
    return target;
  }
  function locked(batchId, action) {
    if (!valid(batchId, 64)) throw fail('DOCUMENT_REVIEW_INVALID');
    return withSynchronousDocumentControl(controlGate(), batchId, action);
  }
  function lockedAdmitted(batchId, action) {
    if (!valid(batchId, 64)) throw fail('DOCUMENT_REVIEW_INVALID');
    const gate = controlGate();
    if (typeof gate.withSynchronousActiveLockAdmitted !== 'function')
      throw Object.assign(new Error('OWNERSHIP_GUARD_UNAVAILABLE'), { code: 'OWNERSHIP_GUARD_UNAVAILABLE' });
    return gate.withSynchronousActiveLockAdmitted(batchId, action);
  }
  function lockedAsync(batchId, action) {
    if (!valid(batchId, 64)) throw fail('DOCUMENT_REVIEW_INVALID');
    return withDocumentControl(controlGate(), batchId, action);
  }
  function read(file, context = null) {
    const recovery = recoveryReadContext;
    if (!context && recovery && (file === recovery.runDirectory.path ||
        file.startsWith(recovery.runDirectory.path + path.sep))) context = recovery;
    if (context) {
      const relative = path.relative(context.runDirectory.path, file);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        throw fail('DOCUMENT_REVIEW_INVALID');
    }
    const bytes = (context ? context.workStore : store()).readFile(file);
    if (recovery && context === recovery) observeRecoveryFile(recovery, file, bytes);
    return JSON.parse(bytes.toString('utf8'));
  }
  function put(file, value, context = null) {
    if (recoveryReadContext) throw fail('DOCUMENT_REVIEW_CONFLICT');
    const bytes = Buffer.from(JSON.stringify(value));
    if (context) {
      const relative = path.relative(context.runDirectory.path, file);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        throw fail('DOCUMENT_REVIEW_INVALID');
    }
    const workStore = context ? context.workStore : store();
    // Most startup captures already exist. Do not create/fsync a temporary
    // file merely to rediscover EEXIST for immutable, identical metadata.
    // Failed reads retain the original exclusive write + bound readback path.
    let previous;
    try { previous = workStore.readFile(file); } catch { /* original write path remains authoritative */ }
    if (previous) {
      if (!previous.equals(bytes)) throw fail('DOCUMENT_REVIEW_CONFLICT');
      return;
    }
    try { workStore.writeFile(file, bytes); }
    catch (error) { if (error.code !== 'PRIVATE_ARTIFACT_ALREADY_EXISTS') throw error;
      if (!workStore.readFile(file).equals(bytes)) throw fail('DOCUMENT_REVIEW_CONFLICT'); }
    if (!workStore.readFile(file).equals(bytes)) throw fail('DOCUMENT_REVIEW_INVALID');
  }
  function runManifest(batchId, optional = true, context = null) {
    if (context && context.batchId !== batchId) throw fail('DOCUMENT_REVIEW_INVALID');
    if (context?.manifest !== undefined) {
      if (!context.manifest && !optional) throw fail('DOCUMENT_ENTITY_RUN_UNAVAILABLE');
      return context.manifest;
    }
    const file = path.join(context ? context.runDirectory.path : ensurePrivateDirectory(base(), batchId), 'manifest.json');
    let value;
    if (context) {
      try {
        context.manifestRecord = readBoundFileRecord(file, { directory: context.runDirectory, maximum: 8 * MAX_TEXT, checkCtime: true });
        value = JSON.parse(context.manifestRecord.bytes.toString('utf8'));
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        assertDirectory(context.runDirectory); context.manifest = null;
        if (optional) return null;
        throw fail('DOCUMENT_ENTITY_RUN_UNAVAILABLE');
      }
    } else {
      if (!fs.existsSync(file)) { if (optional) return null; throw fail('DOCUMENT_ENTITY_RUN_UNAVAILABLE'); }
      value = read(file);
    }
    const v2 = value?.schema === 'datasecure-document-run/2', v3 = value?.schema === 'datasecure-document-run/3', v4 = value?.schema === 'datasecure-document-run/4';
    const rejected = v2 || v3 || v4 ? value.preflight_rejections : [];
    if (v3 || v4) validateContentOptions(value.content_options);
    if (v4) validateReviewPolicy(value.review_policy, { productChannel: value.product_channel, processingMode: value.processing_mode,
      documentReview: true, contentOptions: value.content_options });
    if (!closed(value, `schema,batch_id,product_channel,processing_mode,documents${v2 || v3 || v4 ? ',preflight_rejections' : ''}${v3 || v4 ? ',content_options' : ''}${v4 ? ',review_policy' : ''}`) ||
        !['datasecure-document-run/1', 'datasecure-document-run/2', 'datasecure-document-run/3', 'datasecure-document-run/4'].includes(value.schema) || value.batch_id !== batchId || value.product_channel !== 'standalone' ||
        ![MARKDOWN, ANONYMIZE].includes(value.processing_mode) || !Array.isArray(value.documents) ||
        (!value.documents.length && !v2 && !v3 && !v4) || value.documents.length > 200 ||
        value.documents.some(row => !closed(row, 'document_id,source_sha256,name') || !valid(row.document_id, 32) || !valid(row.source_sha256, 64) || !label(row.name)) ||
        !Array.isArray(rejected) || rejected.length > 200 || v2 && !rejected.length ||
        rejected.some(row => !closed(row, 'document_id,name,reason_code') || !valid(row.document_id, 32) || !label(row.name) || !preflightReason(row.reason_code)) ||
        value.documents.length + rejected.length < 1 || value.documents.length + rejected.length > 200 ||
        new Set([...value.documents, ...rejected].map(row => row.document_id)).size !== value.documents.length + rejected.length)
      throw fail('DOCUMENT_REVIEW_INVALID');
    if (context) context.manifest = value;
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
  function captureManifest(state, context = null) {
    // Only an actual v2 worker state supplies immutable run membership. Never
    // infer authority from the newest twenty history rows or directory names.
    const contentOptions = contentOptionsForBatch(state);
    const reviewPolicy = reviewPolicyForBatch(state);
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
    const manifest = { schema: `datasecure-document-run/${reviewPolicy ? 4 : contentOptions ? 3 : rejected.length ? 2 : 1}`, batch_id: state.token, product_channel: 'standalone',
      processing_mode: state.processing_mode || ANONYMIZE,
      documents: documents.sort((a, b) => a.document_id.localeCompare(b.document_id)),
      ...(rejected.length || contentOptions ? { preflight_rejections: rejected.sort((a, b) => a.document_id.localeCompare(b.document_id)) } : {}),
      ...(contentOptions ? { content_options: contentOptions } : {}), ...(reviewPolicy ? { review_policy: reviewPolicy } : {}) };
    if (new Set([...documents, ...rejected].map(row => row.document_id)).size !== state.items.length ||
        manifest.documents.some(row => !valid(row.document_id, 32) || !valid(row.source_sha256, 64) || !label(row.name)))
      throw fail('DOCUMENT_REVIEW_INVALID');
    if (context) {
      const existing = runManifest(state.token, true, context);
      if (existing) {
        if (!context.manifestRecord.bytes.equals(Buffer.from(JSON.stringify(manifest)))) throw fail('DOCUMENT_REVIEW_CONFLICT');
        return;
      }
    }
    put(path.join(context ? context.runDirectory.path : ensurePrivateDirectory(base(), state.token), 'manifest.json'), manifest, context);
    if (context) { context.manifest = undefined; context.manifestRecord = null; }
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
    const newAnchor = ['datasecure-document-run/3', 'datasecure-document-run/4'].includes(manifest.schema);
    if (Boolean(contentOptions) !== newAnchor || newAnchor &&
        (contentOptionsDigest(contentOptions) !== contentOptionsDigest(manifest.content_options) ||
         processingModeForBatch(state) !== manifest.processing_mode || state.product_channel !== manifest.product_channel ||
         reviewPolicyForBatch(state) !== manifest.review_policy))
      throw fail('CONTENT_OPTIONS_BINDING_INVALID');
  }
  function captureRun(state) {
    if (state?.standalone_document_review !== true) throw fail('DOCUMENT_REVIEW_INVALID');
    return locked(state.token, () => {
      const context = readOperationContext(state.token);
      captureManifest(state, context); captureTerminalFailures(state, context); assertReadOperation(context);
      return { ok: true };
    });
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
  function captureTerminalFailures(state, context = null) {
    const manifest = runManifest(state.token, false, context), run = context ? context.runDirectory.path : ensurePrivateDirectory(base(), state.token);
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
        processing_mode: manifest.processing_mode, ...member, reason_code: item.error_code }, context);
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
  function journal(batchId, context = null) {
    if (context && context.batchId !== batchId) throw fail('DOCUMENT_REVIEW_INVALID');
    const run = context ? context.runDirectory.path : ensurePrivateDirectory(base(), batchId);
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
    const operations = new Set(), manifest = runManifest(batchId, true, context);
    const records = proofs.map((proofFile, index) => {
      const proof = read(path.join(run, proofFile)), file = `decision-${String(index + 1).padStart(6, '0')}.json`;
      if (!closed(proof, 'schema,batch_id,sequence,event_sha256,record') || proof.schema !== 'datasecure-run-commit-proof/1' ||
          proof.batch_id !== batchId || proof.sequence !== index + 1 || proofFile !== `commit-${String(index + 1).padStart(6, '0')}.json` ||
          proof.event_sha256 !== proof.record?.event_sha256) throw fail('DOCUMENT_REVIEW_INVALID');
      const record = proof.record;
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw fail('DOCUMENT_REVIEW_INVALID');
      const { event_sha256: digest, ...body } = record;
      if (!closed(record, `schema,batch_id,sequence,parent_sha256,origin_document_id,operation_id,request_sha256,scope,targets,event_sha256${body.scope === 'run' ? ',rules' : ''}`) ||
          file !== `decision-${String(index + 1).padStart(6, '0')}.json` ||
          body.schema !== (body.scope === 'selection' ? 'datasecure-run-decision/2' : 'datasecure-run-decision/1') ||
          body.batch_id !== batchId || body.sequence !== index + 1 || body.parent_sha256 !== parent || hash(JSON.stringify(body)) !== digest ||
          !valid(body.origin_document_id, 32) || !valid(body.operation_id, 32) || !valid(body.request_sha256, 64) ||
          !['document', 'run', 'selection'].includes(body.scope) || !Array.isArray(body.targets) || !body.targets.length || body.targets.length > 200 ||
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
            body.scope === 'run' && (event.action !== 'entities' || event.ranges.length) ||
            body.scope === 'selection' && (!['approve', 'revoke'].includes(event.action) || event.ranges.length ||
              event.output_sha256 !== event.parent_sha256 || event.action !== body.targets[0].event.action))
          throw fail('DOCUMENT_REVIEW_INVALID');
      }
      if (body.scope === 'run' && (!Array.isArray(body.rules) || !body.rules.length || body.rules.length > 500 || body.rules.some(row =>
            !closed(row, 'decision,key') || !valid(row.key, 64) ||
            !['default', 'keep', 'person', 'organization'].includes(row.decision)) ||
          new Set(body.rules.map(row => row.key)).size !== body.rules.length)) throw fail('DOCUMENT_ENTITY_INVALID');
      if (body.scope !== 'run' && body.rules !== undefined) throw fail('DOCUMENT_ENTITY_INVALID');
      if (body.scope === 'selection' && (body.origin_document_id !== body.targets[0].document_id ||
          body.request_sha256 !== batchDecisionDigest(batchId, body.targets[0].event.action, body.operation_id,
            body.targets.map(({ document_id, event }) => ({ document_id, revision: event.revision - 1,
              output_sha256: event.parent_sha256 }))))) throw fail('DOCUMENT_REVIEW_INVALID');
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
      } else if (!recoveryReadContext) {
        if (context) assertReadOperation(context);
        put(target, record);
      }
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
        ...(reviewPolicyForBatch(state) ? { review_policy: reviewPolicyForBatch(state) } : {}),
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
        context.review_policy !== reviewPolicyForBatch(state) ||
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
  function baseSnapshot(batchId, documentId, context = null) {
    let value;
    try { value = read(path.join(directory(batchId, documentId, false, context), 'base.json'), context); }
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
    const manifest = runManifest(batchId, true, context), member = manifest?.documents.find(row => row.document_id === documentId);
    if (contentBound !== ['datasecure-document-run/3', 'datasecure-document-run/4'].includes(manifest?.schema) || contentBound &&
        (contentOptionsDigest(value.content_options) !== contentOptionsDigest(manifest.content_options) || value.review_policy !== manifest.review_policy))
      throw fail('CONTENT_OPTIONS_BINDING_INVALID');
    if (Object.hasOwn(value, 'review_policy') && (!contentBound || manifest?.schema !== 'datasecure-document-run/4' ||
        value.review_policy !== 'automatic-conservative')) throw fail('DOCUMENT_REVIEW_INVALID');
    if (manifest && (!member || member.source_sha256 !== value.source_sha256 || member.name !== value.name ||
        manifest.processing_mode !== purpose(value))) throw fail('DOCUMENT_REVIEW_INVALID');
    const keys = ['schema', 'batch_id', 'document_id', 'name', 'package_id', 'source_sha256', 'original_text', 'markdown', 'output_sha256'];
    if (Object.hasOwn(value, 'processing_mode')) keys.push('processing_mode');
    if (Object.hasOwn(value, 'transform_trace')) keys.push('transform_trace');
    if (Object.hasOwn(value, 'verification_context')) keys.push('verification_context');
    if (Object.hasOwn(value, 'review_policy')) keys.push('review_policy');
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
  function recordMembership(snapshot, context = null) {
    if (!runManifest(snapshot.batch_id, true, context)) return;
    // Independent of the document directory and expiring processing journal.
    // Losing one body must not silently shrink the historical result set.
    const file = path.join(context ? context.runDirectory.path : ensurePrivateDirectory(base(), snapshot.batch_id), `published-${snapshot.document_id}.json`);
    const membership = {
      schema: 'datasecure-document-membership/1', batch_id: snapshot.batch_id,
      document_id: snapshot.document_id, package_id: snapshot.package_id,
      processing_mode: purpose(snapshot), source_sha256: snapshot.source_sha256,
      output_sha256: snapshot.output_sha256, name: snapshot.name
    };
    // A membership receipt is immutable. Revalidation must still read its
    // exact bytes through the private path guard, but need not attempt an
    // exclusive write and then read that identical receipt twice in put().
    // A disappearance/replacement after existsSync fails closed in readFile;
    // creation still uses exclusive publication and post-write validation.
    if (fs.existsSync(file)) {
      if (!(context ? context.workStore : store()).readFile(file).equals(Buffer.from(JSON.stringify(membership)))) throw fail('DOCUMENT_REVIEW_CONFLICT');
    } else {
      if (context) assertDirectory(context.runDirectory);
      put(file, membership);
    }
  }
  function publishedMembership(batchId, manifest, context = null) {
    const run = context ? context.runDirectory.path : ensurePrivateDirectory(base(), batchId), members = [];
    for (const name of fs.readdirSync(run).filter(name => /^published-[a-f0-9]{32}\.json$/u.test(name))) {
      const value = read(path.join(run, name), context), member = manifest?.documents.find(row => row.document_id === value.document_id);
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
  function reconcile(batchId, documentId, context = null) {
    const snapshot = baseSnapshot(batchId, documentId, context);
    const dir = directory(batchId, documentId, false, context), publication = path.join(dir, 'published.json');
    const boundAnonymization = snapshot.schema === 'datasecure-document-review/2' && purpose(snapshot) === ANONYMIZE;
    if (fs.existsSync(publication)) {
      const record = read(publication, context);
      if (!closed(record, `schema,output_sha256,package_id${boundAnonymization ? ',publication_binding' : ''}`) ||
          record.schema !== `datasecure-document-publication/${boundAnonymization ? 2 : 1}` || record.output_sha256 !== snapshot.output_sha256 ||
          record.package_id !== snapshot.package_id) throw fail('DOCUMENT_REVIEW_INVALID');
      if (boundAnonymization) {
        let binding;
        try { binding = validateExpectation(record.publication_binding); } catch { throw fail('DOCUMENT_REVIEW_INVALID'); }
        if (JSON.stringify(binding) !== JSON.stringify(validateExpectation(snapshot.publication_binding))) throw fail('DOCUMENT_REVIEW_INVALID');
        // A cached publication receipt never skips the expected /4 read.
      } else {
        recordMembership(snapshot, context);
        return snapshot;
      }
    }
    if (boundAnonymization) {
      let artifact;
      try { artifact = require('../standalone/anonymized-store').readAnonymizedArtifact(snapshot.package_id, snapshot.publication_binding); }
      catch { throw fail('DOCUMENT_REVIEW_INVALID'); }
      if (artifact.markdown !== snapshot.markdown || artifact.manifest.document_sha256 !== snapshot.output_sha256) throw fail('DOCUMENT_REVIEW_INVALID');
      if (!fs.existsSync(publication)) {
        if (context) assertDirectory(context.runDirectory);
        put(publication, { schema: 'datasecure-document-publication/2', package_id: snapshot.package_id,
          output_sha256: snapshot.output_sha256, publication_binding: validateExpectation(snapshot.publication_binding) });
      }
      recordMembership(snapshot, context);
      return snapshot;
    }
    if (purpose(snapshot) === MARKDOWN) {
      const artifact = options.readMarkdownArtifact ? options.readMarkdownArtifact(snapshot.package_id, snapshot.content_options) :
        require('../standalone/markdown-store').readMarkdownArtifact(snapshot.package_id, snapshot.content_options);
      validateMarkdownArtifactForOptions(artifact.manifest, artifact.markdown, snapshot.content_options);
      if (artifact.manifest?.processing_mode !== MARKDOWN || artifact.manifest.anonymized !== false ||
          artifact.manifest.artifact_id !== snapshot.package_id || artifact.markdown !== snapshot.markdown ||
          artifact.manifest.document_sha256 !== snapshot.output_sha256) throw fail('DOCUMENT_REVIEW_INVALID');
      if (context) assertDirectory(context.runDirectory);
      put(publication, { schema: 'datasecure-document-publication/1', package_id: snapshot.package_id,
        output_sha256: snapshot.output_sha256 });
      recordMembership(snapshot, context);
      return snapshot;
    }
    const output = options.outputRoot ? options.outputRoot() : roots().output;
    const packageDir = path.join(output, snapshot.package_id), bound = bindDirectory(packageDir);
    const manifest = JSON.parse(readBoundFile(path.join(packageDir, 'manifest.json'), { directory: bound, maximum: 1024 * 1024 }));
    const bytes = readBoundFile(path.join(packageDir, `${snapshot.package_id}.md`), { directory: bound, maximum: MAX_TEXT });
    if (manifest.schema !== 'eu-privacy-package/3' || manifest.package_id !== snapshot.package_id ||
        manifest.document !== `${snapshot.package_id}.md` || manifest.verification?.text_residual_pii !== 'passed' ||
        manifest.document_sha256 !== snapshot.output_sha256 || hash(bytes) !== snapshot.output_sha256) throw fail('DOCUMENT_REVIEW_INVALID');
    if (context) assertDirectory(context.runDirectory);
    put(publication, { schema: 'datasecure-document-publication/1', package_id: snapshot.package_id,
      output_sha256: snapshot.output_sha256 });
    recordMembership(snapshot, context);
    return snapshot;
  }
  function recordPublication(batchId, documentId) { return locked(batchId, () => { reconcile(batchId, documentId); }); }
  function publicationExpectationLocked(batchId, documentId) {
      // baseSnapshot has matched options, source membership and purpose to the
      // independent immutable run anchor. This is a pre-publication expected
      // context, not proof that a package already exists.
      const snapshot = baseSnapshot(batchId, documentId);
      if (snapshot.schema !== 'datasecure-document-review/2' || purpose(snapshot) !== ANONYMIZE)
        throw fail('DOCUMENT_REVIEW_INVALID');
      return validateExpectation(snapshot.publication_binding);
  }
  function publicationExpectation(batchId, documentId) {
    return locked(batchId, () => publicationExpectationLocked(batchId, documentId));
  }
  function publicationExpectationAsync(batchId, documentId) {
    return lockedAdmitted(batchId, () => publicationExpectationLocked(batchId, documentId));
  }
  function recordPublicationAsync(batchId, documentId) {
    return lockedAdmitted(batchId, () => { reconcile(batchId, documentId); });
  }
  function current(batchId, documentId, events = journal(batchId), context = null) {
    if (valid(documentId, 32) && fs.existsSync(path.join(context ? context.runDirectory.path : ensurePrivateDirectory(base(), batchId), `failure-${documentId}.json`))) {
      notProcessedLocked(batchId); // Validate retained evidence before refusing a conflicting body.
      throw fail('DOCUMENT_REVIEW_CONFLICT');
    }
    const snapshot = reconcile(batchId, documentId, context), dir = directory(batchId, documentId, false, context);
    const files = fs.readdirSync(dir).filter(name => /^revision-[0-9]{6}\.json$/u.test(name)).sort();
    if (files.length > 1000) throw fail('DOCUMENT_REVIEW_LIMIT');
    let value = { revision: 0, markdown: snapshot.markdown, output_sha256: snapshot.output_sha256, approved: false,
      ...initialProjection(snapshot) };
    for (let index = 0; index < files.length; index++) {
      const event = read(path.join(dir, files[index]), context);
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
        const manifest = runManifest(batchId, false, context);
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
    // The immutable Fastweg policy grants only the verified published basis.
    // Any edit or revocation advances the revision and cannot be auto-approved
    // by reopening, polling, recovery, or restarting the application.
    if (value.revision === 0 && snapshot.review_policy === 'automatic-conservative') {
      if (snapshot.transform_trace?.complete !== true) throw fail('DOCUMENT_REVIEW_INVALID');
      verifyCandidate({ ...value, snapshot }); value.approved = true;
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
    if (purpose(value.snapshot) !== ANONYMIZE) return;
    const context = value.snapshot.verification_context;
    // baseSnapshot has already checked these immutable options against the
    // independent run manifest. Never take field semantics from a UI request.
    const { personFieldPolicyForContentOptions } = require('../core/person-field-policy');
    const contentBound = value.snapshot.schema === 'datasecure-document-review/2';
    const fieldOptions = contentBound ? { productChannel: 'standalone', contentOptions: value.snapshot.content_options } : {};
    const personFieldPolicy = personFieldPolicyForContentOptions(fieldOptions.contentOptions);
    const { canonicalizeRenderedText, assertPrivacyTextCharacters } = require('../privacy/base');
    const canonicalText = text => {
      try { return canonicalizeRenderedText(text, personFieldPolicy); }
      catch (error) {
        if (error?.code === 'RESIDUAL_PII') throw fail('DOCUMENT_REVIEW_RESIDUAL_PII');
        throw error;
      }
    };
    // Legacy snapshots without a trace are not an exemption from the current
    // character-integrity boundary. The export writes these ORIGINAL bytes,
    // not a view which may have removed HTML comments/attributes. Never repair
    // their bytes or approvals, or grant a removed region an exemption.
    try { assertPrivacyTextCharacters(value.markdown); }
    catch (error) {
      if (error?.code === 'RESIDUAL_PII') throw fail('DOCUMENT_REVIEW_RESIDUAL_PII');
      throw error;
    }
    const canonical = canonicalText(value.markdown);
    if (!value.snapshot.transform_trace) return;
    if (contentBound ? context?.person_field_policy !== personFieldPolicy : Object.hasOwn(context || {}, 'person_field_policy'))
      throw fail('DOCUMENT_REVIEW_POLICY_CHANGED');
    const policy = require('../privacy/policy');
    if (!context || context.ruleset !== policy.PRIVACY_RULESET_VERSION || context.credential_policy !== policy.CREDENTIAL_CONTEXT_POLICY_VERSION ||
        !['general', 'personnel_profile', 'applicant', 'customer', 'contract'].includes(context.profile) || !Array.isArray(context.dictionary))
      throw fail('DOCUMENT_REVIEW_POLICY_CHANGED');
    const frame = context.publication_frame || { prefix: '', suffix: '' };
    if (typeof frame.prefix !== 'string' || typeof frame.suffix !== 'string' ||
        !value.snapshot.markdown.startsWith(frame.prefix) || !value.snapshot.markdown.endsWith(frame.suffix) ||
        !value.markdown.startsWith(frame.prefix) || !value.markdown.endsWith(frame.suffix)) throw fail('DOCUMENT_REVIEW_INVALID');
    const body = value.markdown.slice(frame.prefix.length, value.markdown.length - frame.suffix.length);
    const canonicalPrefix = canonicalText(frame.prefix);
    if (canonicalText(body) !== body || canonical !== canonicalPrefix + body + canonicalText(frame.suffix))
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
    let residual;
    try { residual = require('../pii-engine').scanResidual(value.markdown, fields.profile, fields.dictionary, {
      ...fields.fieldOptions, strongPersonAnchor: fields.strongPersonAnchor, originalSourceText: fields.originalSourceText,
      reviewedPersonCandidates: fields.reviewedPersonCandidates }); }
    catch (error) {
      if (error?.code === 'RESIDUAL_PII') throw fail('DOCUMENT_REVIEW_RESIDUAL_PII');
      throw error;
    }
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
  function reviewOriginal(value) {
    return value.snapshot.transform_trace?.complete ? value.snapshot.transform_trace.canonical_input : value.snapshot.original_text;
  }
  function metadata(value, context = null) { return { document_id: value.snapshot.document_id, name: value.snapshot.name,
    processing_mode: purpose(value.snapshot),
    revision: value.revision, output_sha256: value.output_sha256, approved: value.approved,
    ...(value.snapshot.review_policy ? { review_policy: value.snapshot.review_policy,
      approval_basis: value.approved ? value.revision === 0 ? 'automatic' : 'manual' : null } : {}),
    ...(purpose(value.snapshot) === MARKDOWN ? { text_modified: value.output_sha256 !== value.snapshot.output_sha256 } : {}),
    entity_review_available: Array.isArray(value.entities), entity_count: value.entities ? new Set(value.entities.map(row => row.entity_id)).size : 0,
    source_normalized: Boolean(value.snapshot.transform_trace?.complete),
    run_entity_review_available: purpose(value.snapshot) === ANONYMIZE && Boolean(runManifest(value.snapshot.batch_id, true, context)),
    chunks: Math.max(1, Math.ceil(Math.max(reviewOriginal(value).length, value.markdown.length) / CHUNK)) }; }
  function listLocked(batchId, suppliedContext = null) {
      const context = suppliedContext || readOperationContext(batchId);
      // The committed decision chain and subsequent document projection must
      // use the same held manifest, not two independently adopted versions.
      const manifest = runManifest(batchId, true, context);
      const run = context.runDirectory.path, documents = [], unavailable = [], events = journal(batchId, context);
      const membership = publishedMembership(batchId, manifest, context);
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
        try { documents.push(metadata(current(batchId, id, events, context), context)); }
        catch (error) { let name = published.find(row => row.id === id)?.source_label || published.find(row => row.id === id)?.name ||
            membership.find(row => row.document_id === id)?.name;
          try { name = baseSnapshot(batchId, id, context).name; } catch {}
          if (!label(name)) name = undefined;
          const reason = ['DOCUMENT_REVIEW_POLICY_CHANGED', 'DOCUMENT_REVIEW_RESIDUAL_PII',
            'CONTENT_OPTIONS_BINDING_INVALID', 'CONTENT_OPTIONS_BINDING_MISSING'].includes(error.code)
            ? error.code : 'DOCUMENT_REVIEW_MISSING';
          unavailable.push({ document_id: id, ...(name ? { name } : {}), reason_code: reason }); }
      }
      // Older engineering runs can lack publication evidence. Their entire
      // input manifest is NOT proof that each source produced a result.
      const unclassified = (manifest?.documents || []).filter(row => !ids.includes(row.document_id) && !failures.some(failed => failed.document_id === row.document_id) &&
        !expected.some(item => item.id === row.document_id)).map(row => ({ document_id: row.document_id, name: row.name }));
      const exports = exportRecords(run, documents);
      assertReadOperation(context);
      return { ok: true, local_ui_only: true, external_disclosure: false, documents, unavailable,
        processing_mode: manifest?.processing_mode || documents[0]?.processing_mode || null,
        ...(manifest?.review_policy ? { review_policy: manifest.review_policy } : {}),
        unclassified_documents: unclassified,
        not_processed_documents: failures,
        // Only the next complete selection crosses IPC; sixteen full selections
        // plus long document names could exhaust the bounded response frame.
        pending_exports: exports.pending.slice(0, 1), pending_export_count: exports.pending.length,
        pending_incomplete_export_count: exports.pending.filter(row => row.status === 'incomplete').length,
        pending_export_confirmation_count: exports.pending.filter(row => row.status === 'completed').length,
        export_receipts: exports.receipts, recorded_export_count: exports.recordedCount,
        recorded_current_export_count: exports.currentExportedCount,
        ...resultPublicationProjection(batchId, documents, { context, events,
          completeInventory: unavailable.length === 0 && unclassified.length === 0 }) };
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
        ...(manifest.review_policy ? { review_policy: manifest.review_policy,
          automatically_approved_count: value.documents.filter(row => row.approved && row.approval_basis === 'automatic').length } : {}),
        reviewable_count: value.documents.length, approved_count: value.documents.filter(row => row.approved).length,
        unavailable_count: value.unavailable.length, unclassified_source_count: value.unclassified_documents.length,
        ...(value.not_processed_documents.length ? { not_processed_count: value.not_processed_documents.length } : {}),
        recorded_export_count: value.recorded_export_count,
        current_exported_count: value.recorded_current_export_count,
        pending_export_count: value.pending_export_count,
        pending_incomplete_count: value.pending_incomplete_export_count,
        pending_confirmation_count: value.pending_export_confirmation_count,
        last_recorded_export: latest ? { processing_mode: latest.processing_mode, document_count: latest.exported_count,
          recorded_at: latest.recorded_at } : null,
        ...(value.result_publication ? { result_publication: value.result_publication } : {}) };
    });
  }
  function chunk(batchId, documentId, revision, index) {
    return locked(batchId, () => {
      const value = current(batchId, documentId), meta = metadata(value);
      if (revision !== value.revision) throw fail('DOCUMENT_REVIEW_STALE');
      if (!Number.isSafeInteger(index) || index < 0 || index >= meta.chunks) throw fail('DOCUMENT_REVIEW_INVALID');
      return { ok: true, local_ui_only: true, external_disclosure: false, ...meta, chunk_index: index,
        original_text: textChunk(reviewOriginal(value), index),
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
      const fields = (request?.action === 'entities' ? `action,entity_decisions,operation_id,output_sha256,ranges,revision${Object.hasOwn(request, 'scope') ? ',scope' : ''}` : 'action,operation_id,output_sha256,ranges,revision') +
        (request && Object.hasOwn(request, 'repair_binding') ? ',repair_binding' : '');
      if (!request || Object.keys(request).sort().join(',') !== fields.split(',').sort().join(',') || !['document', 'run'].includes(scope) ||
          Object.hasOwn(request, 'repair_binding') && (!valid(request.repair_binding, 64) || !['entities', 'redact', 'restore_base'].includes(request.action)) ||
          Object.hasOwn(request, 'scope') && !['document', 'run'].includes(request.scope) ||
          !valid(request.operation_id, 32) || !valid(request.output_sha256, 64) || !Number.isSafeInteger(request.revision) ||
          !Array.isArray(request.ranges)) throw fail('DOCUMENT_REVIEW_INVALID');
      // Single-document and run-wide entity decisions need the same held run
      // evidence as selection decisions. Bind before journal validation so a
      // changed manifest cannot be adopted between replay and durable commit.
      const context = readOperationContext(batchId);
      runManifest(batchId, true, context);
      const events = journal(batchId, context), value = current(batchId, documentId, events, context), requestHash = hash(JSON.stringify(request));
      const previous = events.find(row => row.operation_id === request.operation_id);
      if (previous && (previous.origin_document_id !== documentId || previous.request_sha256 !== requestHash)) throw fail('DOCUMENT_REVIEW_CONFLICT');
      if (value.operation_id === request.operation_id) {
        if (value.request_sha256 !== requestHash) throw fail('DOCUMENT_REVIEW_CONFLICT');
        const result = { ok: true, ...metadata(value, context), ...(previous ? { affected_count: previous.targets.length, scope: previous.scope } : {}),
          local_ui_only: true, external_disclosure: false };
        assertReadOperation(context);
        return result;
      }
      if (previous) throw fail('DOCUMENT_REVIEW_STALE');
      const repair = assertDecisionPublication(batchId, request, context);
      // Preserve replay/idempotent ACK of old immutable raw revisions, but do
      // not create new anonymization actions in the conversion-only purpose.
      if (request.action === 'redact' && purpose(value.snapshot) === MARKDOWN) throw fail('DOCUMENT_REVIEW_INVALID');
      if (request.revision !== value.revision || request.output_sha256 !== value.output_sha256) throw fail('DOCUMENT_REVIEW_STALE');
      if (value.revision >= 1000) throw fail('DOCUMENT_REVIEW_LIMIT');
      for (const file of fs.readdirSync(directory(batchId, documentId, false, context)).filter(name => /^revision-[0-9]{6}\.json$/u.test(name))) {
        const event = read(path.join(directory(batchId, documentId, false, context), file), context);
        if (event.operation_id === request.operation_id) throw fail('DOCUMENT_REVIEW_STALE');
      }
      if (request.action === 'entities') entityKey(batchId, true);
      let rules, values = [{ document_id: documentId, value, request }];
      if (scope === 'run') {
        if (request.action !== 'entities' || purpose(value.snapshot) !== ANONYMIZE || !value.entities) throw fail('DOCUMENT_ENTITY_RUN_UNAVAILABLE');
        const manifest = runManifest(batchId, false, context), key = entityKey(batchId);
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
          if (!fs.existsSync(path.join(context.runDirectory.path, member.document_id, 'base.json'))) continue;
          try {
            const candidate = member.document_id === documentId ? value : current(batchId, member.document_id, events, context);
            if (!candidate.entities) throw fail('DOCUMENT_ENTITY_RUN_UNAVAILABLE');
            const matched = ruleDecisions(candidate, rules, key);
            if (matched.choices.length) values.push({ document_id: member.document_id, value: candidate,
              request: { ...request, entity_decisions: matched.choices, identities: matched.identities } });
          } catch (error) {
            // An unreadable/changed snapshot or failed ownership/I/O boundary
            // is not a safely inspected candidate. Keep its hard failure.
            if (!['DOCUMENT_ENTITY_RUN_UNAVAILABLE', 'DOCUMENT_ENTITY_RUN_CONFLICT'].includes(error?.code)) throw error;
            blocked.push({ name: member.name, reason_code: error.code });
          }
        }
        if (blocked.length) {
          assertReadOperation(context);
          return { ok: false, reason_code: 'DOCUMENT_ENTITY_RUN_CONFLICT', blocked_files: blocked,
            local_ui_only: true, external_disclosure: false };
        }
        if (!values.some(row => row.document_id === documentId)) throw fail('DOCUMENT_ENTITY_RUN_UNAVAILABLE');
      }
      const candidateBlocks = [];
      const targets = values.map(({ document_id: id, value: previousValue, request: action }) => {
        const projection = deriveProjection(batchId, previousValue, previousValue.snapshot, action), markdown = projection.markdown;
        if (previousValue.revision >= 1000 || markdown.length > RESOURCE_LIMITS.MAX_TEXT_CHARS || Buffer.byteLength(markdown) > MAX_TEXT)
          throw fail('DOCUMENT_REVIEW_LIMIT');
        if (action.action === 'entities') {
          try { verifyCandidate({ ...previousValue, ...projection }); }
          catch (error) {
            // Apply exactly the publication gate before ANY target receives
            // a durable decision. Only an actually checked privacy/policy
            // refusal is a structured conflict; other errors stay hard.
            if (!['DOCUMENT_REVIEW_RESIDUAL_PII', 'DOCUMENT_REVIEW_POLICY_CHANGED'].includes(error?.code)) throw error;
            candidateBlocks.push({ name: previousValue.snapshot.name, reason_code: error.code });
          }
        } else if (action.action === 'approve') verifyCandidate({ ...previousValue, ...projection });
        return { document_id: id, event: { schema: 'datasecure-document-revision/1', revision: previousValue.revision + 1,
          parent_sha256: previousValue.output_sha256, output_sha256: hash(markdown), approved: action.action === 'approve',
          action: action.action, ranges: action.ranges, operation_id: request.operation_id, request_sha256: requestHash,
          ...(action.action === 'entities' ? { entity_decisions: action.entity_decisions } : {}) } };
      });
      if (candidateBlocks.length) {
        assertReadOperation(context);
        return { ok: false, reason_code: 'DOCUMENT_ENTITY_RUN_CONFLICT', blocked_files: candidateBlocks,
          local_ui_only: true, external_disclosure: false };
      }
      if (events.length >= 10000) throw fail('DOCUMENT_REVIEW_LIMIT');
      assertReadOperation(context);
      if (repair) repair.assertFresh();
      const record = { schema: 'datasecure-run-decision/1', batch_id: batchId, sequence: events.length + 1,
        parent_sha256: events.at(-1)?.event_sha256 || hash(`datasecure-run-decisions/1:${batchId}`),
        origin_document_id: documentId, operation_id: request.operation_id, request_sha256: requestHash, scope,
        ...(rules ? { rules } : {}), targets };
      record.event_sha256 = hash(JSON.stringify(record));
      const run = context.runDirectory.path;
      put(path.join(run, 'journal-format.json'), { schema: 'datasecure-run-decision-commit/2', batch_id: batchId });
      // Independent immutable commit evidence prevents a missing journal tail
      // from reviving an old approval. Losing both copies is not protected
      // against an adversary with this user's filesystem authority.
      put(path.join(run, `commit-${String(record.sequence).padStart(6, '0')}.json`), {
        schema: 'datasecure-run-commit-proof/1', batch_id: batchId, sequence: record.sequence,
        event_sha256: record.event_sha256, record });
      put(path.join(run, `decision-${String(record.sequence).padStart(6, '0')}.json`), record);
      const result = { ok: true, ...metadata(current(batchId, documentId, journal(batchId, context), context), context), affected_count: targets.length, scope,
        local_ui_only: true, external_disclosure: false };
      assertReadOperation(context);
      return result;
    });
  }
  function decideBatch(batchId, request) {
    return locked(batchId, () => {
      if (!closed(request, 'action,operation_id,selection') || !['approve', 'revoke'].includes(request.action) ||
          !valid(request.operation_id, 32) || !validSelection(request.selection)) throw fail('DOCUMENT_REVIEW_INVALID');
      const context = readOperationContext(batchId);
      runManifest(batchId, true, context);
      const events = journal(batchId, context), requestHash = batchDecisionDigest(batchId, request.action, request.operation_id, request.selection);
      const previous = events.find(row => row.operation_id === request.operation_id);
      if (previous && (previous.scope !== 'selection' || previous.request_sha256 !== requestHash))
        throw fail('DOCUMENT_REVIEW_CONFLICT');
      if (!previous) assertDecisionPublication(batchId, request, context);
      if (!previous && events.length >= 10000) throw fail('DOCUMENT_REVIEW_LIMIT');
      const targets = [], documents = []; let mode;
      // Read, reconcile and purpose-check every candidate under the same lock.
      // Only metadata and events survive each iteration, not 200 private bodies.
      // Nothing is committed if even the final selected document is stale,
      // unreadable or fails the existing anonymization approval verification.
      for (const row of request.selection) {
        const value = current(batchId, row.document_id, events, context);
        if (mode && mode !== purpose(value.snapshot)) throw fail('DOCUMENT_REVIEW_INVALID');
        mode = purpose(value.snapshot);
        if (previous) {
          if (value.operation_id !== request.operation_id || value.request_sha256 !== requestHash)
            throw fail('DOCUMENT_REVIEW_STALE');
          documents.push(metadata(value, context));
          continue;
        }
        if (value.revision !== row.revision || value.output_sha256 !== row.output_sha256)
          throw fail('DOCUMENT_REVIEW_STALE');
        if (value.revision >= 1000) throw fail('DOCUMENT_REVIEW_LIMIT');
        for (const file of fs.readdirSync(directory(batchId, row.document_id, false, context)).filter(name => /^revision-[0-9]{6}\.json$/u.test(name))) {
          if (read(path.join(directory(batchId, row.document_id, false, context), file), context).operation_id === request.operation_id)
            throw fail('DOCUMENT_REVIEW_STALE');
        }
        if (request.action === 'approve') verifyCandidate(value);
        const event = { schema: 'datasecure-document-revision/1', revision: value.revision + 1,
          parent_sha256: value.output_sha256, output_sha256: value.output_sha256, approved: request.action === 'approve',
          action: request.action, ranges: [], operation_id: request.operation_id, request_sha256: requestHash };
        targets.push({ document_id: row.document_id, event });
        documents.push(metadata({ ...value, ...event }, context));
      }
      // The manifest and every original parent identity must still match the
      // held beginning of this pass before a selection can gain authority.
      assertReadOperation(context);
      if (!previous) {
        const record = { schema: 'datasecure-run-decision/2', batch_id: batchId, sequence: events.length + 1,
          parent_sha256: events.at(-1)?.event_sha256 || hash(`datasecure-run-decisions/1:${batchId}`),
          origin_document_id: request.selection[0].document_id, operation_id: request.operation_id,
          request_sha256: requestHash, scope: 'selection', targets };
        record.event_sha256 = hash(JSON.stringify(record));
        const run = ensurePrivateDirectory(base(), batchId);
        put(path.join(run, 'journal-format.json'), { schema: 'datasecure-run-decision-commit/2', batch_id: batchId });
        // One exclusive, flushed proof commits the entire selection. The mirror
        // can be recovered by journal() if acknowledgement or projection fails.
        put(path.join(run, `commit-${String(record.sequence).padStart(6, '0')}.json`), {
          schema: 'datasecure-run-commit-proof/1', batch_id: batchId, sequence: record.sequence,
          event_sha256: record.event_sha256, record });
        put(path.join(run, `decision-${String(record.sequence).padStart(6, '0')}.json`), record);
      }
      assertReadOperation(context);
      return { ok: true, operation_id: request.operation_id, affected_count: documents.length, documents,
        local_ui_only: true, external_disclosure: false };
    });
  }
  function saveIdentityOverview(batchId, selection, events) {
    const builder = createConfidentialOverview(batchId);
    for (const row of selection) {
      const value = current(batchId, row.document_id, events);
      if (purpose(value.snapshot) !== ANONYMIZE) throw fail('DOCUMENT_ENTITY_UNAVAILABLE');
      if (value.revision !== row.revision || value.output_sha256 !== row.output_sha256) throw fail('DOCUMENT_REVIEW_STALE');
      builder.add({ document_id: row.document_id, name: value.snapshot.name, revision: value.revision,
        output_sha256: value.output_sha256, markdown: value.markdown, entities: value.entities || null });
    }
    return writeIdentityOverview(batchId, builder.finish());
  }
  function writeIdentityOverview(batchId, overview) {
    const run = ensurePrivateDirectory(base(), batchId);
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
  function companionInputs(selection, files) {
    if (!validSelection(selection) || !validResultCompanionFiles(files) || files.length !== selection.length ||
        files.some((file, index) => file.sha256 !== selection[index].output_sha256)) throw fail('RESULT_COMPANIONS_INVALID');
    return { selection: selection.map(({ document_id, revision, output_sha256 }) => ({ document_id, revision, output_sha256 })),
      files: files.map(({ name, sha256 }) => ({ name, sha256 })) };
  }
  function companionPrivateStore(batchId) {
    // Read paths never manufacture a missing batch, plan, TXT or CSV. The
    // synchronous document-control caller owns the whole validation pass.
    const privatePath = path.join(options.dataRoot || dataRoot(), 'document-reviews');
    const privateDirectory = bindDirectory(privatePath), run = bindDirectory(path.join(privatePath, batchId));
    const bounded = createPrivateWorkStore({ privateRoot: privatePath, maxBytes: MAX_IDENTITY_BYTES,
      expectedRootIdentity: privateDirectory.chain[0].identity });
    const context = { batchId, privateDirectory, runDirectory: run, workStore: bounded, manifest: undefined, manifestRecord: null };
    const check = () => assertReadOperation(context);
    check(); return { run: run.path, bounded, check, context };
  }
  function prepareResultCompanionsLocked(batchId, selection, files) {
    const input = companionInputs(selection, files), manifest = runManifest(batchId, false), events = journal(batchId);
    if (manifest.processing_mode !== ANONYMIZE) throw fail('RESULT_COMPANIONS_INVALID');
    const overview = createConfidentialOverview(batchId), sources = []; let markdownBytes = 0;
    for (const [index, row] of input.selection.entries()) {
      const member = manifest.documents.find(document => document.document_id === row.document_id);
      const value = current(batchId, row.document_id, events);
      if (!member || member.name !== value.snapshot.name || purpose(value.snapshot) !== ANONYMIZE ||
          value.revision !== row.revision || value.output_sha256 !== row.output_sha256) throw fail('DOCUMENT_REVIEW_STALE');
      verifyCandidate(value); sources.push(member.name); markdownBytes += Buffer.byteLength(value.markdown);
      if (markdownBytes > MAX_RESULT_BYTES) throw fail('DOCUMENT_REVIEW_LIMIT');
      overview.add({ document_id: row.document_id, name: input.files[index].name, revision: row.revision,
        output_sha256: row.output_sha256, markdown: value.markdown, entities: value.entities || null });
    }
    const semantic = overview.finish(), filename_mapping = buildFilenameMapping(sources, input.files), identities = Buffer.from(semantic.text);
    const workbook = renderConfidentialWorkbook(semantic.value);
    const confidential = confidentialDescriptor(filename_mapping, identities, workbook);
    if (markdownBytes + confidentialBytes(confidential) > MAX_RESULT_BYTES) throw fail('DOCUMENT_REVIEW_LIMIT');
    const plan = { schema: 'datasecure-result-companions/2', batch_id: batchId, processing_mode: ANONYMIZE,
      selection: input.selection, files: input.files, identity_binding_sha256: semantic.binding_sha256, confidential };
    const binding_sha256 = hash(JSON.stringify(plan));
    // All private bodies are immutable, independently verified before their
    // closed plan is published. A partial prepare cannot authorize publication.
    writeIdentityOverview(batchId, semantic);
    const privateStore = companionPrivateStore(batchId);
    for (const [role, bytes] of Object.entries({ filename_mapping, identities, workbook })) {
      const extension = role === 'filename_mapping' ? 'csv' : role === 'workbook' ? 'xlsx' : 'txt';
      const file = path.join(privateStore.run, `companions-${binding_sha256}-${role}.${extension}`);
      try { privateStore.bounded.writeFile(file, bytes); }
      catch (error) { if (error.code !== 'PRIVATE_ARTIFACT_ALREADY_EXISTS') throw error;
        if (!privateStore.bounded.readFile(file).equals(bytes)) throw fail('RESULT_COMPANIONS_INVALID'); }
      if (!privateStore.bounded.readFile(file).equals(bytes)) throw fail('RESULT_COMPANIONS_INVALID');
      privateStore.check();
    }
    put(path.join(privateStore.run, `companions-${binding_sha256}.json`), plan); privateStore.check();
    readResultCompanionsLocked(batchId, binding_sha256, input.selection, input.files);
    return { binding_sha256, confidential };
  }
  function readResultCompanionsLocked(batchId, binding, selection, files) {
    const input = companionInputs(selection, files);
    if (!valid(binding, 64)) throw fail('RESULT_COMPANIONS_INVALID');
    const privateStore = companionPrivateStore(batchId), get = name => {
      const file = path.join(privateStore.run, name), bytes = privateStore.bounded.readFile(file);
      if (recoveryReadContext) observeRecoveryFile(recoveryReadContext, file, bytes);
      return bytes;
    };
    let plan, semantic, filename_mapping, identities, workbook;
    try {
      plan = JSON.parse(get(`companions-${binding}.json`).toString('utf8'));
      if (!closed(plan, 'schema,batch_id,processing_mode,selection,files,identity_binding_sha256,confidential') ||
          !['datasecure-result-companions/1', 'datasecure-result-companions/2'].includes(plan.schema) || plan.batch_id !== batchId || plan.processing_mode !== ANONYMIZE ||
          hash(JSON.stringify(plan)) !== binding || !valid(plan.identity_binding_sha256, 64) ||
          !validConfidentialDescriptor(plan.confidential, plan.schema === 'datasecure-result-companions/2' ? 3 : 2) ||
          JSON.stringify(plan.selection) !== JSON.stringify(input.selection) || JSON.stringify(plan.files) !== JSON.stringify(input.files)) throw fail();
      const manifest = runManifest(batchId, false, privateStore.context), sources = input.selection.map(row => {
        const member = manifest.documents.find(document => document.document_id === row.document_id);
        if (!member || manifest.processing_mode !== ANONYMIZE) throw fail(); return member.name;
      });
      semantic = JSON.parse(get(`identity-${plan.identity_binding_sha256}.json`).toString('utf8'));
      if (!closed(semantic, 'schema,batch_id,binding_sha256,text_sha256,overview') ||
          semantic.schema !== 'datasecure-confidential-snapshot/1' || semantic.batch_id !== batchId ||
          semantic.binding_sha256 !== plan.identity_binding_sha256 || !valid(semantic.text_sha256, 64) ||
          hash(JSON.stringify(semantic.overview)) !== plan.identity_binding_sha256) throw fail();
      const rendered = Buffer.from(renderConfidentialOverview(semantic.overview));
      const expectedDocuments = input.selection.map((row, index) => ({ ...row, name: input.files[index].name }))
        .sort((a, b) => a.document_id.localeCompare(b.document_id, 'en'));
      const actualDocuments = semantic.overview.documents.map(({ document_id, revision, output_sha256, name }) =>
        ({ document_id, revision, output_sha256, name }));
      if (semantic.overview.batch_id !== batchId || JSON.stringify(actualDocuments) !== JSON.stringify(expectedDocuments) ||
          hash(rendered) !== semantic.text_sha256 ||
          !get(`DataSecure-Identitaeten-${plan.identity_binding_sha256}.txt`).equals(rendered)) throw fail();
      filename_mapping = get(`companions-${binding}-filename_mapping.csv`);
      identities = get(`companions-${binding}-identities.txt`);
      if (plan.schema === 'datasecure-result-companions/2') {
        // Prepare rendered the workbook once from this exact semantic snapshot.
        // Its independently bound immutable plan fixes length and SHA-256.
        // Reading/reconciling never recompresses, creates or repairs the XLSX.
        workbook = get(`companions-${binding}-workbook.xlsx`);
      }
      if (!filename_mapping.equals(buildFilenameMapping(sources, input.files)) || !identities.equals(rendered) ||
          JSON.stringify(confidentialDescriptor(filename_mapping, identities, workbook)) !== JSON.stringify(plan.confidential)) throw fail();
      privateStore.check();
      return { binding_sha256: binding, confidential: plan.confidential, filename_mapping, identities, ...(workbook ? { workbook } : {}) };
    } catch { throw fail('RESULT_COMPANIONS_INVALID'); }
  }
  function prepareResultCompanions(batchId, selection, files) {
    return locked(batchId, () => prepareResultCompanionsLocked(batchId, selection, files));
  }
  function readResultCompanions(batchId, binding, selection, files) {
    return locked(batchId, () => readResultCompanionsLocked(batchId, binding, selection, files));
  }
  function prepareResultCompanionsAsync(batchId, selection, files) {
    return lockedAdmitted(batchId, () => prepareResultCompanionsLocked(batchId, selection, files));
  }
  function readResultCompanionsAsync(batchId, binding, selection, files) {
    return lockedAdmitted(batchId, () => readResultCompanionsLocked(batchId, binding, selection, files));
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
    return ['datasecure-document-run/3', 'datasecure-document-run/4'].includes(manifest?.schema) ? contentOptionsDigest(manifest.content_options) : undefined;
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
  function selectedFilePlan(batchId, selection, { readOnlyPreview = false, events = journal(batchId), prepare = false, existingFiles } = {}) {
    const sources = [], sizes = []; let mode, total = 0, identity;
    // Validate the committed decision chain once for the whole selection.
    // Re-reading it in current() for every document makes a large approved
    // run quadratic and can outlive the desktop IPC deadline before preview.
    // Retain metadata only. Preview must not materialize 200 document bodies,
    // traces and original texts before reaching the aggregate export budget.
    for (const row of selection) {
      const value = current(batchId, row.document_id, events);
      if (mode && purpose(value.snapshot) !== mode) throw fail('AI_EXPORT_INVALID');
      mode = purpose(value.snapshot);
      if (value.revision !== row.revision || value.output_sha256 !== row.output_sha256) throw fail('DOCUMENT_REVIEW_STALE');
      // A preview may precede the user's combined confirmation, but grants
      // no approval or copy authority. Anonymized candidates must pass the
      // same residual check before showing their plan. Every mutating caller
      // still requires an exact approved revision below and at publication.
      if (!value.approved) {
        if (!readOnlyPreview) throw fail('DOCUMENT_REVIEW_UNAPPROVED');
        if (mode === ANONYMIZE) verifyCandidate(value);
      }
      // current() has just run this exact residual gate before granting an
      // automatic revision-0 approval. Guided/edited approvals still require
      // their explicit current-candidate check here. No proof crosses actions.
      if (prepare && !(value.revision === 0 && value.snapshot.review_policy === 'automatic-conservative')) verifyCandidate(value);
      const bytes = Buffer.byteLength(value.markdown); total += bytes;
      if (bytes > MAX_TEXT || total > 500 * 1024 * 1024) throw fail('DOCUMENT_REVIEW_LIMIT');
      sources.push({ source_label: value.snapshot.name });
      sizes.push(bytes);
      // Consume this one verified body immediately for the bounded human
      // reference. Do not reread/replay every source in separate plan, residual
      // and identity passes; retain no original/candidate bodies for copying.
      if (prepare && !existingFiles && mode === ANONYMIZE) {
        identity ||= createConfidentialOverview(batchId);
        identity.add({ document_id: row.document_id, name: value.snapshot.name, revision: value.revision,
          output_sha256: value.output_sha256, markdown: value.markdown, entities: value.entities || null });
      }
    }
    const names = existingFiles ? null : mode === MARKDOWN ? safeMarkdownOutputNames(sources) :
      selection.map((_row, index) => `Dokument_${String(index + 1).padStart(2, '0')}.md`);
    return { mode, files: existingFiles || names.map((name, index) => ({ name, sha256: selection[index].output_sha256 })),
      ...(prepare ? { sizes, identityOverview: identity?.finish() } : {}) };
  }
  function previewExport(batchId, operationId, selection) {
    return locked(batchId, () => {
      if (!valid(operationId, 32) || !validSelection(selection)) throw fail('AI_EXPORT_INVALID');
      const run = ensurePrivateDirectory(base(), batchId), filename = path.join(run, `export-${operationId}.json`);
      let plan, resultFolder = null;
      if (fs.existsSync(filename)) {
        const op = readOperation(run, operationId);
        if (JSON.stringify(op.selection) !== JSON.stringify(selection) || abandoned(run, operationId, op)) throw fail('AI_EXPORT_CONFLICT');
        plan = { mode: op.processing_mode || ANONYMIZE, files: op.files };
        resultFolder = op.root;
      } else {
        plan = selectedFilePlan(batchId, selection, { readOnlyPreview: true });
        // Display only, not a native capability or a substitute for admission.
        // Missing preferences must not prohibit a read-only document preview.
        try { resultFolder = options.resultRoot ? options.resultRoot() : readConfiguredResultRoot(); } catch {}
      }
      if (typeof resultFolder !== 'string' || !path.isAbsolute(resultFolder) || resultFolder.length > 32768 || /\p{Cc}/u.test(resultFolder)) resultFolder = null;
      return { ok: true, processing_mode: plan.mode, files: plan.files, result_folder: resultFolder, local_ui_only: true, external_disclosure: false };
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
  function resultFileCheck(action) {
    try { return action(); }
    catch (error) {
      if (String(error?.code || '').startsWith('OWNERSHIP_GUARD_')) throw error;
      if (error?.code === 'RESULT_EXPORT_PENDING') throw fail('RESULT_PUBLICATION_PENDING');
      throw fail('RESULT_PUBLICATION_CONFLICT');
    }
  }
  const integerIdentity = value => typeof value === 'string' && value !== '-0' && /^-?(?:0|[1-9][0-9]*)$/u.test(value);
  function validObjectIdentity(value) {
    return closed(value, 'dev,ino,birth') && ['dev', 'ino', 'birth'].every(key => integerIdentity(value[key])) &&
      !value.dev.startsWith('-') && !value.ino.startsWith('-');
  }
  function validFileIdentity(value, bytes = null) {
    return closed(value, 'dev,ino,birth,size,nlink,mtime,ctime') &&
      validObjectIdentity({ dev: value.dev, ino: value.ino, birth: value.birth }) &&
      ['size', 'nlink', 'mtime', 'ctime'].every(key => integerIdentity(value[key])) &&
      !value.size.startsWith('-') && value.nlink === '1' && (bytes === null || value.size === String(bytes));
  }
  function validDirectoryProof(value, expected) {
    if (!closed(value, 'path,real,chain,platform') || value.path !== expected || !path.isAbsolute(expected) ||
        typeof value.real !== 'string' || !path.isAbsolute(value.real) || value.platform !== process.platform ||
        !Array.isArray(value.chain) || !value.chain.length || value.chain.length > 1024) return false;
    let probe = expected; const seen = new Set();
    for (const row of value.chain) {
      if (!closed(row, 'path,identity,alias') || row.path !== probe || seen.has(probe) || !validObjectIdentity(row.identity) ||
          typeof row.alias !== 'boolean' || row.alias && (process.platform !== 'darwin' || !['/var', '/tmp', '/etc'].includes(probe))) return false;
      seen.add(probe);
      probe = path.dirname(probe);
    }
    return value.chain.at(-1).path === probe && path.dirname(probe) === probe;
  }
  function validateInitialProof(value, batchId) {
    const version = /^datasecure-initial-results\/([123])$/u.exec(value.schema || '')?.[1];
    const companions = version && version !== '1';
    if (!version || !closed(value, `schema,batch_id,processing_mode,result_layout,root,directory,files,binding_sha256${companions ? ',confidential_binding_sha256,confidential,confidential_directory,confidential_files' : ''}`) ||
        value.batch_id !== batchId || !valid(value.binding_sha256, 64) || ![MARKDOWN, ANONYMIZE].includes(value.processing_mode) ||
        value.result_layout !== `datasecure-visible-markdown/${version}` || typeof value.root !== 'string' || !path.isAbsolute(value.root) ||
        !validDirectoryProof(value.directory, value.directory?.path || '') ||
        path.dirname(path.dirname(value.directory.path)) !== value.root ||
        path.basename(path.dirname(value.directory.path)) !== (value.processing_mode === MARKDOWN ? 'DataSecure-Markdown' : 'DataSecure-Output') ||
        !Array.isArray(value.files) || !value.files.length || value.files.length > 200 ||
        !(companions ? validResultCompanionFiles(value.files.map(file => ({ name: file?.name, sha256: file?.sha256 })))
          : value.files.every(file => typeof file?.name === 'string' && file.name.isWellFormed() && file.name.length <= 1024 &&
              file.name.endsWith('.md') && !/[\u0000-\u001f\u007f\\]/u.test(file.name) && !/^[A-Za-z]:/u.test(file.name) &&
              file.name.split('/').every(part => part && part !== '.' && part !== '..') && valid(file.sha256, 64)) &&
            new Set(value.files.map(file => file.name.normalize('NFC').toLowerCase())).size === value.files.length) ||
        value.files.some(file => !closed(file, 'document_id,name,sha256,identity') || !valid(file.document_id, 32) || !validFileIdentity(file.identity)) ||
        new Set(value.files.map(file => file.document_id)).size !== value.files.length) throw fail('RESULT_PUBLICATION_CONFLICT');
    if (companions && (value.processing_mode !== ANONYMIZE || !valid(value.confidential_binding_sha256, 64) ||
        !validConfidentialDescriptor(value.confidential, Number(version)) ||
        !validDirectoryProof(value.confidential_directory, path.join(value.directory.path, COMPANION_DIRECTORY)) ||
        !Array.isArray(value.confidential_files) || value.confidential_files.length !== confidentialFiles(value.confidential).length ||
        value.confidential_files.some((file, index) => {
          const role = confidentialFiles(value.confidential)[index];
          return !closed(file, 'name,sha256,identity') || file.name !== role.name ||
            file.sha256 !== Buffer.from(value.confidential[role.key].sha256).toString('hex') ||
            !validFileIdentity(file.identity, value.confidential[role.key].bytes);
        }))) throw fail('RESULT_PUBLICATION_CONFLICT');
    return value;
  }
  const initialResults = (batchId, verify = true) => resultFileCheck(() => {
    const value = options.initialResultPublication ? options.initialResultPublication(batchId, verify)
      : require('./result-export').initialResultPublication(batchId, verify);
    return value && !verify ? validateInitialProof(value, batchId) : value;
  });
  // After durable completion the public contents belong to the user. Only the
  // originally receipted directory/ancestor objects remain opener authority;
  // no leaf lookup, inventory, hash, restoration or adoption occurs here.
  function inspectCompletedDirectory(directory, expected) {
    if (!validDirectoryProof(directory, expected)) throw fail('RESULT_PUBLICATION_CONFLICT');
    try {
      const actual = bindDirectory(expected);
      const proof = { path: actual.path, real: actual.real, chain: actual.chain, platform: actual.platform };
      if (JSON.stringify(proof) !== JSON.stringify(directory)) throw Error('changed directory');
      fs.accessSync(expected, fs.constants.R_OK);
      assertDirectory({ ...directory, io: fs });
      return directory;
    } catch { throw fail('RESULT_DIRECTORY_UNAVAILABLE'); }
  }
  const resultVector = documents => documents.map(({ document_id, revision, output_sha256 }) =>
    ({ document_id, revision, output_sha256 })).sort((a, b) => a.document_id.localeCompare(b.document_id));
  const resultGenerationVersion = op => op.schema === 'datasecure-results-generation/3' ? 3 :
    op.schema === 'datasecure-results-generation/2' ? 2 : 1;
  function resultGenerationDigest(op) {
    const { request_sha256, ...bound } = op; return hash(JSON.stringify(bound));
  }
  function resultOperationId(batchId, mode, initialHash, selection, companions = null) {
    return hash(JSON.stringify({ schema: `datasecure-results-vector/${companions ? confidentialVersion(companions.confidential) : 1}`, batch_id: batchId,
      processing_mode: mode, initial_binding_sha256: initialHash, selection: resultVector(selection),
      ...(companions ? { companion_binding_sha256: companions.binding_sha256, confidential: companions.confidential } : {}) })).slice(0, 32);
  }
  function resultGenerations(batchId, initial) {
    const run = path.join(base(), batchId), records = [];
    const names = fs.readdirSync(run).filter(name => /^results-generation-[a-f0-9]{32}\.json$/u.test(name));
    if (names.length > 1000) throw fail('DOCUMENT_REVIEW_LIMIT');
    for (const name of names) {
      const op = read(path.join(run, name));
      const version = resultGenerationVersion(op), companions = version > 1;
      if (!closed(op, `schema,batch_id,operation_id,publication_role,processing_mode,request_sha256,selection,initial_binding_sha256,root,binding,files,sequence,parent_generation_id${companions ? ',companion_binding_sha256,confidential' : ''}`) ||
          !['datasecure-results-generation/1', 'datasecure-results-generation/2', 'datasecure-results-generation/3'].includes(op.schema) || op.batch_id !== batchId || op.publication_role !== 'results' ||
          !valid(op.operation_id, 32) || name !== `results-generation-${op.operation_id}.json` ||
          !initial || op.initial_binding_sha256 !== initial.binding_sha256 || op.root !== initial.root || op.processing_mode !== initial.processing_mode ||
          !valid(op.request_sha256, 64) || op.request_sha256 !== resultGenerationDigest(op) ||
          !validSelection(op.selection) || !valid(op.initial_binding_sha256, 64) || ![MARKDOWN, ANONYMIZE].includes(op.processing_mode) ||
          companions && (op.processing_mode !== ANONYMIZE || !valid(op.companion_binding_sha256, 64) || !validConfidentialDescriptor(op.confidential, version)) ||
          op.operation_id !== resultOperationId(batchId, op.processing_mode, op.initial_binding_sha256, op.selection,
            companions ? { binding_sha256: op.companion_binding_sha256, confidential: op.confidential } : null) ||
          !Number.isSafeInteger(op.sequence) || op.sequence < 1 || op.sequence > 1000 ||
          op.parent_generation_id !== null && !valid(op.parent_generation_id, 32) ||
          !validNativeExportBinding(op.binding) || op.binding.root !== op.root ||
          !Array.isArray(op.files) || op.files.length !== op.selection.length || !validMarkdownInventory(op.files.map(file => file?.name)) ||
          op.files.some((file, index) => !closed(file, 'name,bytes,sha256') || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_TEXT ||
            !Array.isArray(file.sha256) || file.sha256.length !== 32 || file.sha256.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255) ||
            Buffer.from(file.sha256).toString('hex') !== op.selection[index].output_sha256) ||
          op.files.reduce((total, file) => total + file.bytes, 0) +
            (companions ? confidentialBytes(op.confidential) : 0) > MAX_RESULT_BYTES)
        throw fail('RESULT_PUBLICATION_CONFLICT');
      if (companions) readResultCompanionsLocked(batchId, op.companion_binding_sha256, op.selection,
        op.files.map(file => ({ name: file.name, sha256: Buffer.from(file.sha256).toString('hex') })));
      const receiptPath = path.join(run, `results-generation-${op.operation_id}-complete.json`);
      let complete = false;
      if (fs.existsSync(receiptPath)) {
        const receipt = read(receiptPath);
        if (!closed(receipt, `schema,batch_id,generation_id,request_sha256,acknowledged,directory,files${companions ? ',confidential_directory' : ''}`) ||
            receipt.schema !== `datasecure-results-generation-complete/${version}` ||
            receipt.batch_id !== batchId || receipt.generation_id !== op.operation_id || receipt.request_sha256 !== op.request_sha256 || receipt.acknowledged !== true ||
            !validDirectoryProof(receipt.directory, generationTarget(op)) ||
            companions && !validDirectoryProof(receipt.confidential_directory, path.join(generationTarget(op), COMPANION_DIRECTORY)) ||
            !Array.isArray(receipt.files) || receipt.files.length !== op.files.length + (companions ? confidentialFiles(op.confidential).length : 0) ||
            receipt.files.some((file, index) => {
              const expected = index < op.files.length ? op.files[index] : (() => {
                const role = confidentialFiles(op.confidential)[index - op.files.length];
                return { name: role.name, ...op.confidential[role.key] };
              })();
              return !closed(file, 'name,sha256,identity') || file.name !== expected.name ||
                file.sha256 !== Buffer.from(expected.sha256).toString('hex') || !validFileIdentity(file.identity, expected.bytes);
            }))
          throw fail('RESULT_PUBLICATION_CONFLICT');
        complete = true;
        records.push({ op, complete, receipt }); continue;
      }
      records.push({ op, complete });
    }
    records.sort((a, b) => a.op.sequence - b.op.sequence);
    for (let index = 0; index < records.length; index++) if (records[index].op.sequence !== index + 1 ||
        records[index].op.parent_generation_id !== (index ? records[index - 1].op.operation_id : null) ||
        index < records.length - 1 && !records[index].complete) throw fail('RESULT_PUBLICATION_CONFLICT');
    return records;
  }
  function observeRecoveryDirectory(context, directory) {
    const previous = context.directories.get(directory);
    const names = fs.readdirSync(directory).sort();
    if (previous) {
      assertDirectory(previous.binding);
      if (JSON.stringify(names) !== JSON.stringify(previous.names)) throw fail('DOCUMENT_REVIEW_CONFLICT');
    } else context.directories.set(directory, { binding: bindDirectory(directory), names });
  }
  function observeRecoveryFile(context, file, expected = null) {
    const directory = path.dirname(file);
    if (directory === context.runDirectory.path || directory.startsWith(context.runDirectory.path + path.sep))
      observeRecoveryDirectory(context, directory);
    const record = readBoundFileRecord(file, { directory: bindDirectory(directory), maximum: 8 * MAX_TEXT, checkCtime: true });
    if (expected && !record.bytes.equals(expected)) throw fail('DOCUMENT_REVIEW_CONFLICT');
    const digest = hash(record.bytes), previous = context.records.get(file);
    if (previous && (JSON.stringify(previous.identity) !== JSON.stringify(record.identity) ||
        previous.size !== record.bytes.length || previous.sha256 !== digest)) throw fail('DOCUMENT_REVIEW_CONFLICT');
    // Retain only bounded metadata, never a second copy of every private body.
    if (!previous) context.records.set(file, { identity: record.identity, directory: record.directory,
      size: record.bytes.length, sha256: digest });
  }
  function repairAssessment(batchId, documents, initial, records, inspection) {
    if (!inspection?.completeInventory || initial.processing_mode !== ANONYMIZE ||
        records.some(record => !record.complete)) return null;
    const selection = resultVector(documents);
    if (!validSelection(selection) || selection.length !== initial.files.length ||
        selection.some(row => !initial.files.some(file => file.document_id === row.document_id)))
      throw fail('RESULT_PUBLICATION_CONFLICT');
    const context = { ...inspection.context, records: new Map(), directories: new Map() };
    const previousContext = recoveryReadContext;
    let events, residual = false;
    const directoryChecks = [{ directory: initial.directory, target: initial.directory.path },
      ...records.map(record => ({ directory: record.receipt.directory, target: generationTarget(record.op) }))];
    const assertFresh = () => {
      assertReadOperation(context);
      if (JSON.stringify(initialResults(batchId, false)) !== JSON.stringify(initial)) throw fail('RESULT_PUBLICATION_CONFLICT');
      for (const check of directoryChecks) inspectCompletedDirectory(check.directory, check.target);
      for (const [directory, record] of context.directories) {
        assertDirectory(record.binding);
        if (JSON.stringify(fs.readdirSync(directory).sort()) !== JSON.stringify(record.names)) throw fail('DOCUMENT_REVIEW_CONFLICT');
      }
      for (const [file, record] of context.records) {
        const actual = readBoundFileRecord(file, { directory: record.directory, maximum: 8 * MAX_TEXT, checkCtime: true });
        if (JSON.stringify(actual.identity) !== JSON.stringify(record.identity) || actual.bytes.length !== record.size || hash(actual.bytes) !== record.sha256)
          throw fail('DOCUMENT_REVIEW_CONFLICT');
      }
    };
    try {
      recoveryReadContext = context;
      observeRecoveryDirectory(context, context.runDirectory.path);
      events = journal(batchId, context); // missing mirrors remain RAM-only here
      const members = publishedMembership(batchId, runManifest(batchId, true, context), context);
      if (JSON.stringify(members.map(row => row.document_id).sort()) !==
          JSON.stringify(selection.map(row => row.document_id).sort())) throw fail('RESULT_PUBLICATION_CONFLICT');
      // Every indexed native publication must have its closed private ACK.
      // Retained native *-intent filenames alone are not an open operation.
      const checkedRecords = resultGenerations(batchId, initial);
      if (JSON.stringify(checkedRecords) !== JSON.stringify(records) || checkedRecords.some(record => !record.complete) ||
          exportRecords(context.runDirectory.path, documents).pending.length) return null;
      for (const row of selection) {
        const value = current(batchId, row.document_id, events, context);
        if (value.revision !== row.revision || value.output_sha256 !== row.output_sha256) throw fail('DOCUMENT_REVIEW_STALE');
        try { verifyCandidate(value); }
        catch (error) {
          if (error?.code !== 'DOCUMENT_REVIEW_RESIDUAL_PII') throw error;
          residual = true;
        }
      }
      if (residual) {
        // These fixed private originals are held across the decision, not just
        // structurally re-read/adopted by two independent exporter calls.
        const privateRoot = options.dataRoot || dataRoot();
        observeRecoveryFile(context, path.join(privateRoot, 'result-publication-bindings', `${batchId}.json`));
        observeRecoveryFile(context, path.join(privateRoot, 'result-export-state', `re_${hash(batchId).slice(0, 32)}.json`));
      }
      assertFresh();
    } finally { recoveryReadContext = previousContext; }
    if (!residual) return null;
    const binding = hash(JSON.stringify({ schema: 'datasecure-private-result-repair/1', batch_id: batchId,
      selection, journal_sequence: events.length, journal_tail: events.at(-1)?.event_sha256 || hash(`datasecure-run-decisions/1:${batchId}`),
      initial_binding_sha256: initial.binding_sha256, last_ack_generation: records.at(-1)?.op.operation_id || null }));
    return { binding, assertFresh };
  }
  function assertDecisionPublication(batchId, request, context) {
    // Historical/no-initial decisions retain their existing local path. Never
    // load an unrelated run's full bodies merely to rediscover no capability.
    if (!initialResults(batchId, false)) {
      if (Object.hasOwn(request, 'repair_binding')) throw fail('DOCUMENT_REVIEW_STALE');
      return null;
    }
    const listing = listLocked(batchId, context), publication = listing.result_publication;
    // Once an initial contract was observed, disappearance is a conflict, not
    // a newly discovered historical/no-initial authorization path.
    if (!publication) throw fail('RESULT_PUBLICATION_CONFLICT');
    if (publication?.state === 'repair_required') {
      if (!['entities', 'redact', 'restore_base'].includes(request.action) ||
          request.repair_binding !== publication.repair_binding || !context.repairAssessment)
        throw fail('DOCUMENT_REVIEW_STALE');
      return context.repairAssessment;
    }
    if (Object.hasOwn(request, 'repair_binding')) throw fail('DOCUMENT_REVIEW_STALE');
    if (publication?.state === 'pending') throw fail('RESULT_PUBLICATION_PENDING');
    if (publication?.state === 'conflict') throw fail('RESULT_PUBLICATION_CONFLICT');
    if (publication?.state === 'unavailable') throw fail('RESULT_DIRECTORY_UNAVAILABLE');
    return null;
  }
  function resultPublicationProjection(batchId, documents, inspection = null) {
    const vector = resultVector(documents), current_revision = Math.max(0, ...vector.map(row => row.revision));
    let initial;
    try {
      initial = initialResults(batchId, false);
      if (!initial) return {};
      const records = resultGenerations(batchId, initial), latest = records.at(-1);
      if (latest?.complete) inspectCompletedDirectory(latest.receipt.directory, generationTarget(latest.op));
      else if (!latest) inspectCompletedDirectory(initial.directory, initial.directory.path);
      const state = latest ? latest.complete && JSON.stringify(latest.op.selection) === JSON.stringify(vector) ? 'current' : 'pending'
        : current_revision === 0 ? 'initial' : 'pending';
      if (inspection) {
        inspection.context.repairAssessment = null;
        if (state === 'pending') {
          const repair = repairAssessment(batchId, documents, initial, records, inspection);
          if (repair) {
            inspection.context.repairAssessment = repair;
            return { result_publication: { state: 'repair_required', generation_id: latest?.op.operation_id || null,
              count: vector.length, current_revision, repair_binding: repair.binding } };
          }
        }
      }
      return { result_publication: { state, generation_id: latest?.op.operation_id || null, count: vector.length, current_revision } };
    } catch (error) { return { result_publication: { state: error?.code === 'RESULT_PUBLICATION_PENDING' ? 'pending'
      : error?.code === 'RESULT_DIRECTORY_UNAVAILABLE' ? 'unavailable' : 'conflict',
      generation_id: null, count: vector.length, current_revision } }; }
  }
  function resultOperation(op) { return { ...exportBinding(op), publication_role: 'results', binding: op.binding, files: op.files,
    ...(resultGenerationVersion(op) > 1 ? { confidential: op.confidential } : {}) }; }
  async function callResultNative(op, command, body) {
    if (!options.nativeExport) throw fail('AI_EXPORT_CONFIGURATION_REQUIRED');
    const status = await options.nativeExport(resultOperation(op), command, body);
    if (!(command === 'write_body' ? ['receiving', 'staged'] : ['unprepared', 'prepared', 'completed', 'acknowledged', 'abandoned']).includes(status))
      throw fail('AI_EXPORT_INVALID');
    return status;
  }
  function generationTarget(op) { return path.join(op.root, exportNamespace(op.processing_mode), `Ergebnisse-${op.operation_id}`); }
  function inspectResultGeneration(op, receipt = null) {
    return resultFileCheck(() => inspectResultGenerationFiles(op, receipt));
  }
  function inspectResultGenerationFiles(op, receipt) {
    const target = generationTarget(op), named = bindDirectory(target);
    const savedDirectory = { path: named.path, real: named.real, chain: named.chain, platform: named.platform };
    if (receipt && JSON.stringify(savedDirectory) !== JSON.stringify(receipt.directory)) throw fail('RESULT_PUBLICATION_CONFLICT');
    const directory = receipt ? { ...receipt.directory, io: fs } : named;
    if (directory.path !== target) throw fail('RESULT_PUBLICATION_CONFLICT');
    assertDirectory(directory);
    const companions = resultGenerationVersion(op) > 1;
    let confidentialDirectory, savedConfidentialDirectory;
    if (companions) {
      confidentialDirectory = bindDirectory(path.join(target, COMPANION_DIRECTORY));
      savedConfidentialDirectory = { path: confidentialDirectory.path, real: confidentialDirectory.real,
        chain: confidentialDirectory.chain, platform: confidentialDirectory.platform };
      if (receipt && JSON.stringify(savedConfidentialDirectory) !== JSON.stringify(receipt.confidential_directory))
        throw fail('RESULT_PUBLICATION_CONFLICT');
      if (receipt) confidentialDirectory = { ...receipt.confidential_directory, io: fs };
    }
    const expected = [...op.files.map(file => ({ ...file, maximum: MAX_TEXT })), ...(companions ?
      confidentialFiles(op.confidential).map(({ key, name, maximum }) => ({ name, ...op.confidential[key], maximum })) : [])];
    const checkParents = () => { assertDirectory(directory); if (confidentialDirectory) assertDirectory(confidentialDirectory); };
    const files = expected.map((file, index) => {
      const record = readBoundFileRecord(path.join(target, file.name), { maximum: file.maximum, checkCtime: true,
        validateParents: checkParents });
      const sha256 = hash(record.bytes);
      if (sha256 !== Buffer.from(file.sha256).toString('hex') || record.bytes.length !== file.bytes || receipt &&
          (!receipt.files[index] || receipt.files[index].name !== file.name || receipt.files[index].sha256 !== sha256 ||
          JSON.stringify(receipt.files[index].identity) !== JSON.stringify(record.identity))) throw fail('RESULT_PUBLICATION_CONFLICT');
      return { name: file.name, sha256, identity: record.identity };
    });
    const actual = [], inspectMetadata = createPublicResultMetadataInspector();
    function inventory(folder, prefix = '') {
      const binding = bindDirectory(folder); assertDirectory(directory);
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (inspectMetadata(binding, entry.name)) continue;
        if (entry.isSymbolicLink() || !entry.isDirectory() && !entry.isFile() || actual.length > 1000) throw fail('RESULT_PUBLICATION_CONFLICT');
        const name = prefix + entry.name;
        if (entry.isDirectory()) {
          if (!expected.some(file => file.name.startsWith(name + '/'))) throw fail('RESULT_PUBLICATION_CONFLICT');
          inventory(path.join(folder, entry.name), name + '/');
        } else actual.push(name);
      }
      assertDirectory(binding); assertDirectory(directory);
    }
    inventory(target);
    if (JSON.stringify(actual.sort()) !== JSON.stringify(expected.map(file => file.name).sort()) || receipt && receipt.files.length !== files.length)
      throw fail('RESULT_PUBLICATION_CONFLICT');
    checkParents();
    return { directory: { path: directory.path, real: directory.real, chain: directory.chain, platform: directory.platform }, files,
      ...(companions ? { confidential_directory: savedConfidentialDirectory } : {}) };
  }
  async function recordResultCompletion(batchId, op) {
    const target = path.join(base(), batchId, `results-generation-${op.operation_id}-complete.json`);
    if (fs.existsSync(target)) { const receipt = read(target); inspectResultGeneration(op, receipt); return; }
    // Never adopt an equal-byte replacement between the native commit and this
    // private receipt. Capture strong directory/leaf identities, have the native
    // transaction inspect its original committed identity, then recheck exactly
    // the captured objects before recording them. Reconcile is the SAME op.
    const candidate = inspectResultGeneration(op);
    if (!['completed', 'acknowledged'].includes(await callResultNative(op, 'reconcile'))) throw fail('RESULT_PUBLICATION_CONFLICT');
    inspectResultGeneration(op, candidate);
    put(target, {
      schema: `datasecure-results-generation-complete/${resultGenerationVersion(op)}`, batch_id: batchId,
      generation_id: op.operation_id, request_sha256: op.request_sha256, acknowledged: true, ...candidate });
  }
  function publishResults(batchId) {
    return lockedAsync(batchId, async () => {
      const listing = listLocked(batchId);
      if (listing.unavailable.length || listing.unclassified_documents.length || !listing.documents.length) throw fail('RESULT_PUBLICATION_CONFLICT');
      const initial = initialResults(batchId, false);
      if (!initial) throw fail('RESULT_PUBLICATION_LEGACY');
      const selection = resultVector(listing.documents), mode = listing.processing_mode;
      if (mode !== initial.processing_mode || selection.length !== initial.files.length ||
          selection.some(row => !initial.files.some(file => file.document_id === row.document_id))) throw fail('RESULT_PUBLICATION_CONFLICT');
      const events = journal(batchId), sources = [], sizes = [];
      for (const row of selection) {
        const value = current(batchId, row.document_id, events);
        if (value.revision !== row.revision || value.output_sha256 !== row.output_sha256) throw fail('DOCUMENT_REVIEW_STALE');
        verifyCandidate(value); sources.push({ source_label: value.snapshot.name }); sizes.push(Buffer.byteLength(value.markdown));
      }
      if (sizes.some(size => size > MAX_TEXT) || sizes.reduce((a, b) => a + b, 0) > 500 * 1024 * 1024) throw fail('DOCUMENT_REVIEW_LIMIT');
      const records = resultGenerations(batchId, initial), previous = records.at(-1);
      const names = mode === MARKDOWN ? safeMarkdownOutputNames(sources) : selection.map((_row, index) => `Dokument_${String(index + 1).padStart(2, '0')}.md`);
      const companionFiles = names.map((name, index) => ({ name, sha256: selection[index].output_sha256 }));
      const samePrevious = previous && JSON.stringify(previous.op.selection) === JSON.stringify(selection);
      // A no-op on an already confirmed historical generation is not an
      // upgrade request. Never manufacture a new format merely by reading or
      // reconciling it, and never change an interrupted /1 or /2 operation ID.
      if (samePrevious && previous.complete) {
        inspectCompletedDirectory(previous.receipt.directory, generationTarget(previous.op));
        return { ok: true, batch_id: batchId, local_ui_only: true, external_disclosure: false,
          result_publication: { state: 'current', generation_id: previous.op.operation_id, count: selection.length,
            current_revision: Math.max(...selection.map(row => row.revision)) } };
      }
      const resume = samePrevious && !previous.complete;
      const companions = mode === ANONYMIZE ? resume
        ? resultGenerationVersion(previous.op) > 1
          ? readResultCompanionsLocked(batchId, previous.op.companion_binding_sha256, selection, companionFiles) : null
        : prepareResultCompanionsLocked(batchId, selection, companionFiles) : null;
      if (sizes.reduce((a, b) => a + b, 0) + (companions ? confidentialBytes(companions.confidential) : 0) > MAX_RESULT_BYTES)
        throw fail('DOCUMENT_REVIEW_LIMIT');
      const operationId = resultOperationId(batchId, mode, initial.binding_sha256, selection, companions);
      let op = previous?.op.operation_id === operationId ? previous.op : null, status;
      // An unfinished intent still has a confirmed predecessor. Retrying it
      // must not recreate a result after that predecessor was manually deleted.
      const predecessor = previous?.complete ? previous : records.at(-2);
      const assertPredecessor = () => {
        if (predecessor) inspectCompletedDirectory(predecessor.receipt.directory, generationTarget(predecessor.op));
        else inspectCompletedDirectory(initial.directory, initial.directory.path);
      };
      assertPredecessor();
      if (previous) {
        if (previous.complete) inspectCompletedDirectory(previous.receipt.directory, generationTarget(previous.op));
        if (!previous.complete && !op) throw fail('RESULT_PUBLICATION_CONFLICT');
        if (op) status = await callResultNative(op, 'reconcile');
        if (['completed', 'acknowledged'].includes(status)) {
          if (await callResultNative(previous.op, 'acknowledge') !== 'acknowledged') throw fail('AI_EXPORT_INCOMPLETE');
          await recordResultCompletion(batchId, previous.op);
          if (op) return { ok: true, batch_id: batchId, local_ui_only: true, external_disclosure: false,
            result_publication: { state: 'current', generation_id: op.operation_id, count: selection.length,
              current_revision: Math.max(...selection.map(row => row.revision)) } };
        }
      }
      if (!op) {
        let binding = options.nativeBinding ? options.nativeBinding() : readConfiguredNativeExportBinding();
        if (!binding && options.prepareNativeBinding) {
          // Preparing a new root must never redirect a historical run to the
          // currently configured location. The initial publication fixed it.
          const configured = options.resultRoot ? options.resultRoot() : readConfiguredResultRoot();
          if (configured !== initial.root) throw fail('RESULT_PUBLICATION_CONFLICT');
          binding = await options.prepareNativeBinding(batchId, operationId);
        }
        if (!validNativeExportBinding(binding) || binding.root !== initial.root) throw fail('RESULT_PUBLICATION_CONFLICT');
        op = { schema: `datasecure-results-generation/${companions ? confidentialVersion(companions.confidential) : 1}`, batch_id: batchId, operation_id: operationId,
          publication_role: 'results', processing_mode: mode, selection, initial_binding_sha256: initial.binding_sha256,
          root: binding.root, binding, files: names.map((name, index) => ({ name, bytes: sizes[index],
            sha256: [...Buffer.from(selection[index].output_sha256, 'hex')] })), sequence: records.length + 1,
          parent_generation_id: previous?.op.operation_id || null,
          ...(companions ? { companion_binding_sha256: companions.binding_sha256, confidential: companions.confidential } : {}) };
        op.request_sha256 = resultGenerationDigest(op);
        put(path.join(base(), batchId, `results-generation-${op.operation_id}.json`), op);
      }
      if (status !== 'prepared') for (const [index, row] of selection.entries()) {
        const value = current(batchId, row.document_id, events), bytes = Buffer.from(value.markdown);
        if (value.revision !== row.revision || hash(bytes) !== row.output_sha256) throw fail('DOCUMENT_REVIEW_STALE');
        verifyCandidate(value);
        for (let offset = 0; offset < bytes.length || offset === 0; offset += 65536) {
          const end = Math.min(offset + 65536, bytes.length), final = end === bytes.length;
          const response = await callResultNative(op, 'write_body', { index, offset, hex: bytes.subarray(offset, end).toString('hex'), final_chunk: final });
          if (response !== (final ? 'staged' : 'receiving')) throw fail('AI_EXPORT_INVALID');
        }
      }
      if (status !== 'prepared' && resultGenerationVersion(op) > 1) {
        const bodies = readResultCompanionsLocked(batchId, op.companion_binding_sha256, selection,
          op.files.map(file => ({ name: file.name, sha256: Buffer.from(file.sha256).toString('hex') })));
        for (const [extraIndex, { key: role }] of confidentialFiles(op.confidential).entries()) {
          const bytes = bodies[role], index = op.files.length + extraIndex;
          for (let offset = 0; offset < bytes.length; offset += 65536) {
            const end = Math.min(offset + 65536, bytes.length), final = end === bytes.length;
            const response = await callResultNative(op, 'write_body', { index, offset, hex: bytes.subarray(offset, end).toString('hex'), final_chunk: final });
            if (response !== (final ? 'staged' : 'receiving')) throw fail('AI_EXPORT_INVALID');
          }
        }
      }
      assertPredecessor();
      if (!['completed', 'acknowledged'].includes(await callResultNative(op, 'publish'))) throw fail('AI_EXPORT_INCOMPLETE');
      if (await callResultNative(op, 'acknowledge') !== 'acknowledged') throw fail('AI_EXPORT_INCOMPLETE');
      await recordResultCompletion(batchId, op);
      return { ok: true, batch_id: batchId, local_ui_only: true, external_disclosure: false,
        result_publication: { state: 'current', generation_id: op.operation_id, count: selection.length,
          current_revision: Math.max(...selection.map(row => row.revision)) } };
    });
  }
  function resolveResultsGeneration(batchId) {
    return lockedAsync(batchId, async () => {
      const initial = initialResults(batchId, false);
      if (!initial) return null; // historical runs keep their original opener
      const records = resultGenerations(batchId, initial), complete = records.at(-1);
      const listing = listLocked(batchId), vector = resultVector(listing.documents);
      if (listing.unavailable.length || listing.unclassified_documents.length) throw fail('RESULT_PUBLICATION_CONFLICT');
      if (!complete) {
        inspectCompletedDirectory(initial.directory, initial.directory.path);
        if (vector.some(row => row.revision > 0)) throw fail('RESULT_PUBLICATION_PENDING');
        return { ok: true, local_path: initial.directory.path, target_kind: 'directory', external_disclosure: false };
      }
      if (!complete.complete) throw fail('RESULT_PUBLICATION_PENDING');
      inspectCompletedDirectory(complete.receipt.directory, generationTarget(complete.op));
      if (JSON.stringify(complete.op.selection) !== JSON.stringify(vector)) throw fail('RESULT_PUBLICATION_PENDING');
      const status = await callResultNative(complete.op, 'reconcile');
      if (!['completed', 'acknowledged'].includes(status)) throw fail('RESULT_PUBLICATION_CONFLICT');
      inspectCompletedDirectory(complete.receipt.directory, generationTarget(complete.op));
      return { ok: true, local_path: path.join(complete.op.root, exportNamespace(complete.op.processing_mode),
        `Ergebnisse-${complete.op.operation_id}`), target_kind: 'directory', external_disclosure: false };
    });
  }
  function exportNativeApproved(batchId, operationId, selection, acknowledge) {
    return lockedAsync(batchId, async () => {
      if (!valid(operationId, 32) || !validSelection(selection)) throw fail('AI_EXPORT_INVALID');
      const run = ensurePrivateDirectory(base(), batchId), file = path.join(run, `export-${operationId}.json`);
      let op, nativeStatus;
      if (fs.existsSync(file)) {
        op = readOperation(run, operationId);
        if (!isNativeOperation(op)) throw fail('AI_EXPORT_CONFIGURATION_REQUIRED');
        if (JSON.stringify(op.selection) !== JSON.stringify(selection)) throw fail('AI_EXPORT_CONFLICT');
        if (abandoned(run, operationId, op)) throw fail('AI_EXPORT_ABANDONED');
        // Native ACK performs its own fresh reconciliation. Do not precede it
        // with a second full target read in this same request. Both commands
        // precede current-revision checks: a completed copy remains historical
        // fact after a later edit/revocation; neither can start a new copy.
        const status = nativeStatus = await nativeCall(op, acknowledge ? 'acknowledge' : 'reconcile');
        if (status === 'abandoned') throw fail('AI_EXPORT_ABANDONED');
        if (acknowledge && status !== 'acknowledged') throw fail('AI_EXPORT_INCOMPLETE');
        if (nativeCompletion(run, op, status)) {
          return nativeResponse(op);
        }
      }
      if (acknowledge) throw fail('AI_EXPORT_INCOMPLETE');
      const events = journal(batchId);
      const plan = selectedFilePlan(batchId, selection, { events, prepare: true, existingFiles: op?.files });
      const mode = plan.mode, nativeFiles = plan.files.map((file, index) => ({ name: file.name, bytes: plan.sizes[index],
        sha256: [...Buffer.from(selection[index].output_sha256, 'hex')] }));
      if (!op) {
        if (exportRecords(run).pending.length >= 16) throw fail('DOCUMENT_REVIEW_LIMIT');
        let binding = options.nativeBinding ? options.nativeBinding() : readConfiguredNativeExportBinding();
        if (!binding && typeof options.prepareNativeBinding === 'function')
          binding = await options.prepareNativeBinding(batchId, operationId);
        if (!validNativeExportBinding(binding)) throw fail('AI_EXPORT_CONFIGURATION_REQUIRED');
        const inspected = inspectRoot(binding.root);
        const identityBinding = mode === ANONYMIZE ? writeIdentityOverview(batchId, plan.identityOverview) : null;
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
    return lockedAsync(batchId, async () => {
      if (!valid(operationId, 32) || !valid(digest, 64)) throw fail('AI_EXPORT_INVALID');
      const run = ensurePrivateDirectory(base(), batchId), op = readOperation(run, operationId);
      if (op.request_sha256 !== digest) throw fail('AI_EXPORT_CONFLICT');
      // Do not create a native abandonment marker before checking the sidecar's
      // own durable completion. A damaged parent binding must not relabel an
      // already recorded copy as an unstarted operation.
      if (fs.existsSync(path.join(run, `export-${operationId}-complete.json`))) throw fail('AI_EXPORT_ALREADY_COMPLETE');
      if (await nativeCall(op, 'abandon') !== 'abandoned') throw fail('AI_EXPORT_UNCERTAIN');
      if (fs.existsSync(path.join(run, `export-${operationId}-complete.json`))) throw fail('AI_EXPORT_CONFLICT');
      const abandonedFile = path.join(run, `export-${operationId}-abandoned.json`);
      if (!fs.existsSync(abandonedFile)) put(abandonedFile, { schema: 'datasecure-document-export-abandoned/1',
        ...exportBinding(op), reason: 'user_abandoned', abandoned_at: new Date().toISOString() });
      return { ok: true, abandoned: true, operation_id: operationId, local_ui_only: true, external_disclosure: false };
    });
  }
  function resolveNativeExport(batchId, operationId) {
    return lockedAsync(batchId, async () => {
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
      const plan = selectedFilePlan(batchId, selection, { events, prepare: true, existingFiles: files });
      const mode = plan.mode;
      if (!op) {
        files = plan.files;
        if (exportRecords(run).pending.length >= 16) throw fail('DOCUMENT_REVIEW_LIMIT');
        const root = inspectRoot(options.resultRoot ? options.resultRoot() : readConfiguredResultRoot());
        const identityBinding = mode === ANONYMIZE ? writeIdentityOverview(batchId, plan.identityOverview) : null;
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
  return Object.freeze({ captureRun, capture, capturePrepared, preparedReplay, assertContentBinding, assertDocumentBinding, hasPublicationEvidence, notProcessed, recordPublication, publicationExpectation, recordPublicationAsync, publicationExpectationAsync, list, historySummary, chunk, entities, decide, decideBatch, prepareResultCompanions, readResultCompanions, prepareResultCompanionsAsync, readResultCompanionsAsync, publishResults, resolveResultsGeneration, previewExport, exportApproved, abandonExport, resolveExport, resolveIdentityOverview });
}
module.exports = { createDocumentReviewStore, MAX_TEXT, CHUNK };
