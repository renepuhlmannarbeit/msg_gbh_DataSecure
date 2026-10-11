'use strict';
// Owned private pipe only; not a renderer action or a Cowork tool. Native v2
// writes approved bodies and publication records through pinned capabilities.
const crypto = require('node:crypto');
const { validNativeDirectoryIdentity, validNativeExportBinding } = require('../core/native-directory-identity');
const REQUEST_SCHEMA = 'datasecure-native-export-request/1';
const RESPONSE_SCHEMA = 'datasecure-native-export-response/1';
const PUBLICATION_REQUEST = 'datasecure-native-export-request/2';
const PUBLICATION_RESPONSE = 'datasecure-native-export-response/2';
const nativeErrors = new Set(['AI_EXPORT_CONFLICT', 'AI_EXPORT_VOLUME_MISMATCH', 'AI_EXPORT_UNCERTAIN',
  'AI_EXPORT_ALREADY_COMPLETE', 'AI_EXPORT_INCOMPLETE', 'AI_EXPORT_ABANDONED', 'STANDALONE_CLOSING']);
const fail = code => Object.assign(new Error(code), { code });
class NativeExportChannel {
  constructor({ write, timeoutMs = 25000 }) { this.write = write; this.timeoutMs = timeoutMs; this.pending = null; }
  configureExportRoot(outer) {
    if (outer?.action !== 'configure_results' || outer.native_export_binding !== true ||
        !Array.isArray(outer.source_paths) || outer.source_paths.length !== 1) return Promise.reject(fail('STANDALONE_IPC_FAILED'));
    return this.publication(outer).send('configure_export_root', { root: outer.source_paths[0] });
  }
  publication(outer) {
    const nativeId = crypto.randomBytes(16).toString('hex'); let sequence = 0;
    return { send: (action, fields) => {
      if (this.pending || !/^[a-f0-9]{16,64}$/u.test(outer?.request_id) || ++sequence > 9000) return Promise.reject(fail('STANDALONE_IPC_FAILED'));
      const request = { schema: PUBLICATION_REQUEST, request_id: outer.request_id, native_id: nativeId, sequence, action, ...fields };
      // No timer is allowed to release the document lock while the native
      // publisher still owns write capability. Only its settled reply or the
      // owning desktop's EOF may settle this Promise. Rust bounds admission.
      return new Promise((resolve, reject) => {
        this.pending = { request, resolve, reject, timer: null };
        try { this.write(request); } catch { this.abort('STANDALONE_IPC_FAILED'); }
      });
    } };
  }
  bindResultRoot(outer) {
    if (this.pending || outer?.action !== 'configure_results' || outer.native_export_binding !== true || !/^[a-f0-9]{16,64}$/u.test(outer.request_id) ||
        !Array.isArray(outer.source_paths) || outer.source_paths.length !== 1 || typeof outer.source_paths[0] !== 'string')
      return Promise.reject(fail('STANDALONE_IPC_FAILED'));
    const request = { schema: REQUEST_SCHEMA, request_id: outer.request_id, native_id: crypto.randomBytes(16).toString('hex'),
      sequence: 1, action: 'bind_result_root', root: outer.source_paths[0] };
    return new Promise((resolve, reject) => {
      const pending = { request, resolve, reject, timer: null };
      this.pending = pending;
      pending.timer = setTimeout(() => this.abort('STANDALONE_IPC_TIMEOUT'), this.timeoutMs);
      try { this.write(request); } catch { this.abort('STANDALONE_IPC_FAILED'); }
    });
  }
  accept(message) {
    const pending = this.pending;
    if (pending?.request.schema === PUBLICATION_REQUEST) {
      const configure = pending.request.action === 'configure_export_root';
      const fields = (message?.ok === true ? `${configure ? 'binding' : 'status'},native_id,ok,request_id,schema,sequence` : 'error_code,native_id,ok,request_id,schema,sequence').split(',').sort().join(',');
      if (!message || Object.keys(message).sort().join(',') !== fields || message.schema !== PUBLICATION_RESPONSE ||
          message.request_id !== pending.request.request_id || message.native_id !== pending.request.native_id || message.sequence !== pending.request.sequence ||
          ![true, false].includes(message.ok) || message.ok && (configure ? !validNativeExportBinding(message.binding) || message.binding.root !== pending.request.root :
            !(pending.request.command === 'write_body' ? ['receiving', 'staged'] : ['unprepared', 'prepared', 'completed', 'acknowledged', 'abandoned']).includes(message.status)) ||
          !message.ok && !nativeErrors.has(message.error_code)) {
        this.abort('STANDALONE_IPC_FAILED'); throw fail('STANDALONE_IPC_FAILED');
      }
      this.pending = null;
      if (message.ok) pending.resolve(configure ? message.binding : message.status); else pending.reject(fail(message.error_code));
      return message;
    }
    const fields = message?.ok === true ? 'identity,native_id,ok,request_id,schema,sequence' : 'error_code,native_id,ok,request_id,schema,sequence';
    if (!pending || !message || Object.keys(message).sort().join(',') !== fields || message.schema !== RESPONSE_SCHEMA ||
        message.request_id !== pending.request.request_id || message.native_id !== pending.request.native_id || message.sequence !== 1 ||
        (message.ok !== true && message.ok !== false) || message.ok === true && !validNativeDirectoryIdentity(message.identity) ||
        message.ok === false && message.error_code !== 'STANDALONE_RESULT_ROOT_UNSAFE') {
      this.abort('STANDALONE_IPC_FAILED'); throw fail('STANDALONE_IPC_FAILED');
    }
    clearTimeout(pending.timer); this.pending = null;
    if (message.ok) pending.resolve(message.identity); else pending.reject(fail(message.error_code));
    return message;
  }
  abort(code = 'STANDALONE_CLOSING') {
    if (!this.pending) return;
    const pending = this.pending; this.pending = null; clearTimeout(pending.timer); pending.reject(fail(code));
  }
}
module.exports = { NativeExportChannel, REQUEST_SCHEMA, RESPONSE_SCHEMA, PUBLICATION_REQUEST, PUBLICATION_RESPONSE };
