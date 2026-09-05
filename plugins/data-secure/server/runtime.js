'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');
const { verifyPosixSupervisor } = require('./posix-supervisor');
const { RESOURCE_LIMITS, assertSourceSize } = require('./resource-limits');
const { inspectZipDirectory, inspectZipDirectoryFromFd, ZipError } = require('./zip-reader');
const {
  rasterizeToPng,
  ocrPngDetailed,
  visualBridgeStatus
} = require('./windows-visual');
const { verifyNativeLauncherArtifact } = require('./native-launcher');
const { resolveSeaParserRole } = require('./sea-parser-role');
const {
  portableOcrStatus,
  ocrPngDetailedPortable
} = require('./portable-ocr');

class SafeError extends Error {}
let nativeHostProbeCache;
const SEA_EXECUTION_OVERRIDES = ['execPath', 'platform', 'arch', 'nodeVersion', 'launcherPath', 'launcherBytes',
  'launcherExpectedSha256', 'existsSync', 'spawn', 'spawnSync', 'posixSupervisorPath', 'posixSupervisorBase', 'hostProbeStatus'];

function safeError(message, code) {
  const error = new SafeError(message);
  if (code) error.code = code;
  return error;
}

function pdfCoverageError() {
  return safeError(
    'PDF-Dateien bleiben sicher gestoppt, bis der vollständige lokale PDF-Prüfpfad freigegeben ist. ' +
      'Verwenden Sie, falls verfügbar, die ursprüngliche DOCX-, XLSX-, PPTX- oder TXT-Datei; ' +
      'laden Sie das PDF nicht direkt in Claude hoch.',
    'PDF_COVERAGE_UNVERIFIED'
  );
}

function descriptorStartsAsPdf(fd, io = fs) {
  // The PDF header may start at any position in the first 1024 bytes. Read the
  // four trailing bytes as well so a marker starting at offset 1023 is complete.
  const header = Buffer.alloc(1028);
  const length = io.readSync(fd, header, 0, header.length, 0);
  const index = header.subarray(0, length).indexOf(Buffer.from('%PDF-', 'ascii'));
  return index >= 0 && index <= 1023;
}

function bufferStartsAsPdf(buffer) {
  const index = buffer.subarray(0, Math.min(buffer.length, 1028)).indexOf(Buffer.from('%PDF-', 'ascii'));
  return index >= 0 && index <= 1023;
}

function verifyNativeLauncher(launcher, options = {}) {
  try {
    return verifyNativeLauncherArtifact(launcher, options);
  } catch (error) {
    if (error.reason === 'missing') {
      throw safeError('Die native Windows-Parserbegrenzung ist nicht verfügbar.', 'PARSER_ISOLATION_FAILED');
    }
    if (error.reason === 'not_pe' || error.reason === 'not_amd64_pe') {
      throw safeError('Die native Windows-Parserbegrenzung besitzt nicht das erwartete x64-Format.', 'PARSER_ISOLATION_FAILED');
    }
    throw safeError(
      'Die native Windows-Parserbegrenzung ist beschädigt oder unvollständig.', 'PARSER_ISOLATION_FAILED'
    );
  }
}

function isClaudeTemporaryLocalData(candidate, platform = process.platform) {
  if (platform !== 'win32' || !candidate || !path.isAbsolute(candidate)) return false;
  const normalized = path.resolve(candidate).replaceAll('/', '\\').toLowerCase();
  return normalized.includes('\\appdata\\local\\temp\\claude\\') ||
    normalized.includes('\\appdata\\roaming\\claude\\local-agent-mode-sessions\\');
}

function stableWindowsLocalData(environment = process.env, home = os.homedir(), io = fs) {
  const configured = String(environment.LOCALAPPDATA || '').trim();
  if (!isClaudeTemporaryLocalData(configured, 'win32')) return configured;

  // Cowork can project a local MCP into a per-call environment and redirect
  // LOCALAPPDATA into that disposable projection. Product state and detached
  // workers must not inherit that lifetime. Use the user's established Windows
  // Local AppData only for this narrowly recognised Claude temporary path.
  const profile = String(environment.USERPROFILE || home || '').trim();
  if (!profile || !path.isAbsolute(profile)) return configured;
  const candidate = path.resolve(profile, 'AppData', 'Local');
  try {
    const stat = io.lstatSync(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return configured;
    const real = io.realpathSync.native ? io.realpathSync.native(candidate) : io.realpathSync(candidate);
    if (path.resolve(real).toLowerCase() !== candidate.toLowerCase()) return configured;
    return candidate;
  } catch { return configured; }
}

function dataRoot() {
  const isolatedProductRoot = String(process.env.EU_PRIVACY_DATA_ROOT || '').trim();
  if (isolatedProductRoot) {
    if (!path.isAbsolute(isolatedProductRoot)) throw new Error('DATA_ROOT_UNSAFE');
    return path.resolve(isolatedProductRoot);
  }
  const base = process.platform === 'win32'
    ? stableWindowsLocalData()
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  // Keep the user-visible local root short and recognisable. The old RC30 root
  // is deliberately not migrated automatically: it may contain originals.
  return path.join(base, 'SecureDataMsg');
}

// Text processing has no end-user-installed dependency. On Windows its bundled
// native boundary must also be present and match the packaged checksum.
function nativeParserStatus(options = {}) {
  let seaRole;
  try {
    seaRole = resolveSeaParserRole();
    if (seaRole && SEA_EXECUTION_OVERRIDES.some(key => options[key] !== undefined)) throw new Error('override');
  }
  catch { return { available: false, mode: 'unavailable', reason: 'sea_parser_role_invalid',
    resource_boundary: 'unavailable', hard_process_limits: false }; }
  // Do not read execution options again after validation: getters/proxies could
  // change values between accesses. The real SEA path uses only fixed defaults.
  if (seaRole) options = {};
  const platform = options.platform || process.platform;
  if (platform === 'darwin' || platform === 'linux') {
    const supervisor = verifyPosixSupervisor({
      platform, arch: options.arch || process.arch, executable: options.posixSupervisorPath,
      base: options.posixSupervisorBase, spawnSync: options.spawnSync
    });
    if (supervisor.available) {
      return { available: true, mode: 'posix_native_supervisor', reason: 'ok',
        resource_boundary: 'posix_native_supervisor', hard_process_limits: true,
        executable: supervisor.executable };
    }
    // A packaged-but-invalid supervisor is never permitted to fall back to the
    // weaker Node-only boundary. During the transition, absence still retains
    // the existing non-release portable path until target packages exist.
    if (seaRole || options.posixSupervisorPath || options.posixSupervisorBase) {
      return { available: false, mode: 'unavailable', reason: supervisor.reason,
        resource_boundary: 'unavailable', hard_process_limits: false };
    }
    const version = String(options.nodeVersion || process.versions.node || '0.0.0').split('.').map(Number);
    const permissionStable = version[0] > 22 || (version[0] === 22 && version[1] >= 13);
    return permissionStable
      ? {
        available: true,
        mode: 'node_permission_process',
        reason: 'ok',
        resource_boundary: 'node_heap_and_parent_timeout',
        hard_process_limits: false
      }
      : {
        available: false,
        mode: 'unavailable',
        reason: 'node_permission_model_too_old',
        resource_boundary: 'unavailable',
        hard_process_limits: false
      };
  }
  if (platform !== 'win32') return {
    available: false, mode: 'unavailable', reason: 'unsupported_platform',
    resource_boundary: 'unavailable', hard_process_limits: false
  };
  const arch = options.arch || process.arch;
  if (arch !== 'x64') return {
    available: false, mode: 'unavailable', reason: 'unsupported_architecture',
    resource_boundary: 'unavailable', hard_process_limits: false
  };
  const launcher = options.launcherPath || path.join(__dirname, 'native', 'windows-x64', 'datasecure-sandbox.exe');
  try {
    verifyNativeLauncher(launcher, options);
    let probeStatus = options.hostProbeStatus;
    if (!Number.isInteger(probeStatus)) {
      if (!options.launcherPath && nativeHostProbeCache !== undefined) {
        probeStatus = nativeHostProbeCache;
      } else {
        const probe = (options.spawnSync || childProcess.spawnSync)(launcher, ['--probe-host'], {
          stdio: 'ignore', windowsHide: true, shell: false, env: {}, timeout: 5000
        });
        probeStatus = Number.isInteger(probe.status) ? probe.status : 121;
        if (!options.launcherPath && !options.spawnSync) nativeHostProbeCache = probeStatus;
      }
    }
    if (probeStatus === 126) {
      return { available: false, mode: 'unavailable', reason: 'unsupported_host_architecture', resource_boundary: 'unavailable', hard_process_limits: false };
    }
    if (probeStatus !== 0) {
      return { available: false, mode: 'unavailable', reason: 'host_probe_failed', resource_boundary: 'unavailable', hard_process_limits: false };
    }
    return { available: true, mode: 'windows_job_object', reason: 'ok', resource_boundary: 'windows_job_object', hard_process_limits: true };
  } catch (error) {
    return { available: false, mode: 'unavailable', reason: error.code || 'integrity_failed', resource_boundary: 'unavailable', hard_process_limits: false };
  }
}

function runtimeReady() {
  return nativeParserStatus().available;
}

function readStatus() {
  const visual = visualBridgeStatus();
  const portableOcr = portableOcrStatus();
  const parser = nativeParserStatus();
  if (!parser.available) {
    return {
      phase: 'blocked_parser_isolation',
      message: 'Die lokale Parserbegrenzung ist nicht einsatzbereit; Textverarbeitung bleibt gesperrt.',
      text_engine: 'unavailable',
      parser_boundary: parser.mode,
      parser_boundary_reason: parser.reason,
      parser_resource_boundary: parser.resource_boundary,
      parser_hard_process_limits: parser.hard_process_limits,
      visual_bridge: visual.available ? 'available' : 'unavailable',
      visual_bridge_reason: visual.reason,
      visual_boundary: visual.mode,
      portable_ocr: portableOcr.available ? 'available' : 'unavailable',
      portable_ocr_reason: portableOcr.reason
    };
  }
  return {
    phase: visual.available ? 'ready' : 'ready_text_only',
    message: visual.available
      ? 'Bundled offline privacy engine ready.'
      : `Textverarbeitung bereit. Visuelle Prüfung nicht verfügbar (${visual.reason}); Grafiken werden lokal zurückgehalten.`,
    text_engine: 'ready',
    parser_boundary: parser.mode,
    parser_boundary_reason: parser.reason,
    parser_resource_boundary: parser.resource_boundary,
    parser_hard_process_limits: parser.hard_process_limits,
    visual_bridge: visual.available ? 'available' : 'unavailable',
    visual_bridge_reason: visual.reason,
    visual_boundary: visual.mode,
    portable_ocr: portableOcr.available ? 'available' : 'unavailable',
    portable_ocr_reason: portableOcr.reason
  };
}

function portableOcrOptions(options = {}) {
  const portable = { ...(options.portableOcr || {}) };
  if (portable.timeoutMs === undefined && options.timeoutMs !== undefined) portable.timeoutMs = options.timeoutMs;
  if (portable.signal === undefined && options.signal !== undefined) portable.signal = options.signal;
  return portable;
}

async function ocrPng(buffer, language, options = {}) {
  const portableOptions = portableOcrOptions(options);
  const portable = portableOcrStatus(portableOptions);
  if (portable.available) {
    return ocrPngDetailedPortable(buffer, language, portableOptions);
  }
  return ocrPngDetailed(buffer, language, options);
}

const PARSER_TIMEOUT_MS = 50_000;
const PARSER_JOB_WALL_MS = 45_000;
const PARSER_JOB_MEMORY_MIB = 768;
const PARSER_JOB_CPU_MS = 40_000;
const MAX_PARSER_RESPONSE_BYTES = 48 * 1024 * 1024;
const MAX_ATTACHMENT_BASE64_CHARS = 12 * 1024 * 1024;
const { validateContentGraph } = require('./content-graph');

function validateParserResult(value, expectedExt) {
  const forbiddenControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
  if (!value || typeof value !== 'object' || typeof value.markdown !== 'string' ||
    value.markdown.length > 8_000_000 || !Array.isArray(value.attachments) ||
    value.attachments.length > 150 || !Array.isArray(value.warnings) || value.warnings.length > 200 ||
    forbiddenControls.test(value.markdown)) {
    throw safeError('Der isolierte Dokumentparser lieferte kein gültiges Ergebnis.', 'PARSE_FAILED');
  }
  let decodedAttachmentBytes = 0;
  for (const attachment of value.attachments) {
    if (!attachment || typeof attachment !== 'object' || typeof attachment.data !== 'string' ||
      attachment.data.length > MAX_ATTACHMENT_BASE64_CHARS ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.data) ||
      Object.keys(attachment).sort().join(',') !== 'data,extension,mimeType,name,source_part,type') {
      throw safeError('Ein isoliert extrahiertes Asset ist ungültig oder zu groß.', 'PARSE_FAILED');
    }
    const decodedBytes = Buffer.byteLength(attachment.data, 'base64');
    if (decodedBytes > 8 * 1024 * 1024) throw safeError('Ein isoliert extrahiertes Asset ist zu groß.', 'PARSE_FAILED');
    decodedAttachmentBytes += decodedBytes;
  }
  if (decodedAttachmentBytes > 24 * 1024 * 1024) throw safeError('Die isoliert extrahierten Assets sind insgesamt zu groß.', 'PARSE_FAILED');
  if (!value.warnings.every((item) => typeof item === 'string' && item.length <= 1000 && !forbiddenControls.test(item))) {
    throw safeError('Der isolierte Dokumentparser lieferte ungültige Warnungen.', 'PARSE_FAILED');
  }
  try {
    validateContentGraph(value.content_graph, value.markdown, value.attachments, expectedExt);
  } catch {
    throw safeError('Der isolierte Dokumentparser lieferte keinen gültigen Content-Graph.', 'PARSE_FAILED');
  }
  return value;
}

async function convertDocument(source, options = {}) {
  if (options.signal?.aborted) {
    throw safeError('Der isolierte Dokumentparser wurde auf Anforderung beendet.', 'REQUEST_CANCELLED');
  }
  const inputBuffer = Buffer.isBuffer(options.inputBuffer) ? options.inputBuffer : null;
  const sourceName = inputBuffer ? String(options.sourceName || '') : String(source || '');
  const ext = path.extname(sourceName).toLowerCase();
  // The parser contains additional extraction code for adversarial/unit tests,
  // but the product release boundary is intentionally narrower until coverage
  // for further formats has been demonstrated.
  const supported = new Set(['.docx', '.txt', '.md', '.markdown', '.csv']);
  if (ext === '.pdf') throw pdfCoverageError();
  if (!supported.has(ext)) throw safeError(
    'Dieses Format ist im beaufsichtigten Pilotbetrieb nicht freigegeben.',
    'FORMAT_COVERAGE_UNVERIFIED'
  );
  let seaRole;
  try {
    seaRole = resolveSeaParserRole();
    if (seaRole && SEA_EXECUTION_OVERRIDES.some(key => options[key] !== undefined)) {
      throw new Error('SEA_EXECUTION_OVERRIDE_DENIED');
    }
  } catch {
    throw safeError('Die gebundene lokale Parserrolle ist nicht einsatzbereit.', 'PARSER_ISOLATION_FAILED');
  }
  // pdf-lite remains available only for adversarial parser tests. Its extraction
  // is not a coverage proof: fonts, the page tree and every visual object cannot
  // yet be accounted for. Never let that best-effort result enter the release
  // pipeline. The current release keeps PDF fail-closed until the native PDFium contract in
  // docs/canonical/BACKLOG.md and docs/FORMAT_COVERAGE_MATRIX.md have passed all release gates.
  const worker = path.join(__dirname, 'parser-worker.js');
  const networkDeny = path.join(__dirname, 'network-deny.cjs');
  const launchOptions = seaRole ? {} : options;
  const spawn = launchOptions.spawn || childProcess.spawn;
  const platform = launchOptions.platform || process.platform;
  const arch = launchOptions.arch || process.arch;
  const nodeExecutable = seaRole?.executable || launchOptions.execPath || process.execPath;
  const nodeFlags = [
    '--permission', `--allow-fs-read=${__dirname}`, `--require=${networkDeny}`, '--disable-proto=throw',
    '--max-old-space-size=384', worker, ext
  ];
  const workerArgs = seaRole ? [ext, '0'] : [...nodeFlags, '0'];
  let command = nodeExecutable;
  let args = workerArgs;
  let stdio;
  if (platform === 'win32') {
    if (arch !== 'x64') {
      throw safeError('Die native Windows-Parserbegrenzung ist für diese Prozessorarchitektur nicht verfügbar.', 'PARSER_ISOLATION_FAILED');
    }
    const launcher = launchOptions.launcherPath || path.join(__dirname, 'native', 'windows-x64', 'datasecure-sandbox.exe');
    command = verifyNativeLauncher(launcher, launchOptions);
    args = [
      '--memory-mib', String(PARSER_JOB_MEMORY_MIB),
      '--cpu-ms', String(PARSER_JOB_CPU_MS),
      '--wall-ms', String(PARSER_JOB_WALL_MS), '--', nodeExecutable,
      ...workerArgs
    ];
  } else if (platform === 'darwin' || platform === 'linux') {
    const portable = nativeParserStatus(seaRole ? {} : { platform, arch, nodeVersion: options.nodeVersion,
      posixSupervisorPath: options.posixSupervisorPath, posixSupervisorBase: options.posixSupervisorBase,
      spawnSync: options.spawnSync });
    if (!portable.available || (seaRole && portable.mode !== 'posix_native_supervisor')) {
      throw safeError('Die portable Node-Parserbegrenzung benötigt Node.js 22.13 oder neuer.', 'PARSER_ISOLATION_FAILED');
    }
    if (portable.mode === 'posix_native_supervisor') {
      command = portable.executable;
      args = ['--memory-mib', String(PARSER_JOB_MEMORY_MIB), '--cpu-ms', String(PARSER_JOB_CPU_MS),
        '--wall-ms', String(PARSER_JOB_WALL_MS), '--', nodeExecutable, ...workerArgs];
    }
  } else {
    throw safeError('Für dieses Betriebssystem ist keine lokale Parserbegrenzung freigegeben.', 'PARSER_ISOLATION_FAILED');
  }
  let fd;
  if (inputBuffer) {
    try {
      assertSourceSize(ext, inputBuffer.length);
    } catch (error) {
      if (error.code === 'INPUT_FORMAT_LIMIT' || error.code === 'INPUT_FILE_LIMIT') {
        throw safeError(
          'Die Datei überschreitet die sichere Einzeldateigrenze für ihr Format.',
          'INPUT_TOO_LARGE'
        );
      }
      throw error;
    }
    if (bufferStartsAsPdf(inputBuffer)) throw pdfCoverageError();
    if (ext === '.docx') {
      try {
        inspectZipDirectory(inputBuffer, {
          maxEntries: 20000,
          maxUncompressed: RESOURCE_LIMITS.MAX_OOXML_EXPANDED_BYTES
        });
      } catch (error) {
        if (error instanceof ZipError) {
          throw safeError(
            'Die DOCX-Datei konnte nicht als sicherer lokaler Office-Container geprüft werden.',
            error.code === 'OOXML_ENCRYPTED_CONTAINER' || error.code === 'ZIP_ENCRYPTED_ENTRY'
              ? error.code
              : 'DOCX_CONTAINER_INVALID'
          );
        }
        throw error;
      }
    }
    stdio = ['pipe', 'pipe', 'ignore'];
  } else {
    fd = fs.openSync(source, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try {
      const opened = fs.fstatSync(fd);
      try {
        assertSourceSize(ext, opened.size);
      } catch (error) {
        if (error.code === 'INPUT_FORMAT_LIMIT' || error.code === 'INPUT_FILE_LIMIT') {
          throw safeError(
            'Die Datei überschreitet die sichere Einzeldateigrenze für ihr Format.',
            'INPUT_TOO_LARGE'
          );
        }
        throw error;
      }
      // A renamed PDF must not enter a text/CSV parser. Sniff the same descriptor
      // that is inherited by the worker, so no path re-open can swap the checked
      // bytes before parsing. PDF headers may legally follow leading junk within
      // the first 1024 bytes.
      if (descriptorStartsAsPdf(fd)) throw pdfCoverageError();
      if (ext === '.docx') {
        try {
          inspectZipDirectoryFromFd(fd, opened.size, {
            maxEntries: 20000,
            maxUncompressed: RESOURCE_LIMITS.MAX_OOXML_EXPANDED_BYTES
          });
        } catch (error) {
          if (error instanceof ZipError) {
            throw safeError(
              'Die DOCX-Datei konnte nicht als sicherer lokaler Office-Container geprüft werden.',
              error.code === 'OOXML_ENCRYPTED_CONTAINER' || error.code === 'ZIP_ENCRYPTED_ENTRY'
                ? error.code
                : 'DOCX_CONTAINER_INVALID'
            );
          }
          throw error;
        }
      }
    } catch (error) {
      fs.closeSync(fd);
      throw error;
    }
    stdio = [fd, 'pipe', 'ignore'];
  }
  let child;
  try {
    // Recheck after source inspection, immediately before the path-based spawn.
    // This narrows but cannot eliminate OS-level verify/exec races.
    if (seaRole && resolveSeaParserRole()?.executable !== nodeExecutable) throw new Error('role_changed');
    child = spawn(command, args, {
      stdio,
      windowsHide: true,
      shell: false,
      env: {}
    });
  } catch {
    if (fd !== undefined) fs.closeSync(fd);
    throw safeError('Der isolierte Dokumentparser konnte nicht gestartet werden.', 'PARSER_ISOLATION_FAILED');
  }
  if (fd !== undefined) fs.closeSync(fd);
  if (inputBuffer) {
    if (!child.stdin || typeof child.stdin.end !== 'function') {
      try { child.kill(); } catch { /* startup will fail closed */ }
      throw safeError('Der isolierte Dokumentparser konnte keine authentifizierten Eingabebytes übernehmen.', 'PARSER_ISOLATION_FAILED');
    }
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let terminationError = null;
    let terminationTimer = null;
    let inputFlushed = !inputBuffer;
    let inputFailed = false;
    let size = 0;
    const chunks = [];
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(terminationTimer);
      if (options.signal) options.signal.removeEventListener('abort', abortHandler);
      if (error) reject(error); else resolve(value);
    };
    const terminate = (error) => {
      if (settled || terminationError) return;
      terminationError = error;
      try {
        if (child.kill() === false) throw new Error('termination_not_started');
      } catch {
        finish(safeError('Die Beendigung des isolierten Dokumentparsers konnte nicht bestätigt werden.', 'PARSER_ISOLATION_FAILED'));
        return;
      }
      terminationTimer = setTimeout(() => {
        finish(safeError('Die Beendigung des isolierten Dokumentparsers konnte nicht bestätigt werden.', 'PARSER_ISOLATION_FAILED'));
      }, options.terminationGraceMs ?? 10_000);
    };
    const timer = setTimeout(() => {
      terminate(safeError('Der isolierte Dokumentparser hat das Zeitlimit überschritten.', 'PARSER_TIMEOUT'));
    }, options.timeoutMs ?? PARSER_TIMEOUT_MS);
    const abortHandler = () => terminate(
      safeError('Der isolierte Dokumentparser wurde auf Anforderung beendet.', 'REQUEST_CANCELLED')
    );
    if (options.signal) options.signal.addEventListener('abort', abortHandler, { once: true });
    if (options.signal?.aborted) abortHandler();
    if (inputBuffer) {
      child.stdin.once('error', () => {
        inputFailed = true;
        terminate(safeError(
          'Der isolierte Dokumentparser hat die authentifizierten Eingabebytes nicht vollständig übernommen.',
          'PARSER_INPUT_INCOMPLETE'
        ));
      });
      child.stdin.end(inputBuffer, () => { inputFlushed = true; });
    }
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_PARSER_RESPONSE_BYTES) {
        terminate(new SafeError('Der isolierte Dokumentparser lieferte zu viele Daten.'));
        return;
      }
      chunks.push(chunk);
    });
    child.once('error', () => {
      if (!terminationError) finish(safeError('Der isolierte Dokumentparser konnte nicht gestartet werden.', 'PARSER_ISOLATION_FAILED'));
    });
    child.once('close', (code) => {
      if (settled) return;
      if (terminationError) {
        finish(terminationError);
        return;
      }
      if (inputFailed || !inputFlushed) {
        finish(safeError(
          'Der isolierte Dokumentparser hat die authentifizierten Eingabebytes nicht vollständig übernommen.',
          'PARSER_INPUT_INCOMPLETE'
        ));
        return;
      }
      if (code === 125) {
        finish(safeError('Der isolierte Dokumentparser hat eine Ressourcenbegrenzung erreicht.', 'PARSER_RESOURCE_LIMIT'));
        return;
      }
      // Windows and the future POSIX supervisor reserve 120..126 for boundary
      // failures. Do not reinterpret a POSIX sandbox failure as a parser error.
      if (Number.isInteger(code) && code >= 120 && code <= 126) {
        finish(safeError('Die lokale Parserbegrenzung konnte nicht sicher angewendet werden.', 'PARSER_ISOLATION_FAILED'));
        return;
      }
      let response;
      try { response = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* handled below */ }
      const responseKeys = response && typeof response === 'object' ? Object.keys(response).sort().join(',') : '';
      // A complete negative worker response is a confirmed rejection, not a
      // crashed process to retry forever. Unknown exits/protocol failures keep
      // their existing interruption semantics; no partial result is accepted.
      if (code === 2 && response?.schema === 'data-secure-parser-result/1' && response.ok === false &&
          response.error === 'parse_failed' && responseKeys === 'error,ok,schema') {
        finish(safeError(`Die ${ext.slice(1).toUpperCase()}-Datei konnte nicht sicher lokal gelesen werden.`, 'PARSE_FAILED'));
        return;
      }
      if (code !== 0 || response?.schema !== 'data-secure-parser-result/1' || !response?.ok ||
        responseKeys !== 'ok,result,schema') {
        finish(new SafeError(`Die ${ext.slice(1).toUpperCase()}-Datei konnte nicht sicher lokal gelesen werden.`));
        return;
      }
      try { finish(null, validateParserResult(response.result, ext)); }
      catch (error) { finish(error); }
    });
  });
}

module.exports = {
  SafeError,
  dataRoot,
  isClaudeTemporaryLocalData,
  stableWindowsLocalData,
  runtimeReady,
  readStatus,
  visualBridgeStatus,
  nativeParserStatus,
  PARSER_TIMEOUT_MS,
  PARSER_JOB_WALL_MS,
  PARSER_JOB_MEMORY_MIB,
  PARSER_JOB_CPU_MS,
  MAX_PARSER_RESPONSE_BYTES,
  validateParserResult,
  verifyNativeLauncher,
  convertDocument,
  rasterizeToPng,
  ocrPngDetailed: ocrPng,
  portableOcrOptions,
  portableOcrStatus
};
