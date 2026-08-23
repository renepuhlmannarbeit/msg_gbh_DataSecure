'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');
const {
  rasterizeToPng,
  ocrPngDetailed,
  visualBridgeStatus
} = require('./windows-visual');
const { verifyNativeLauncherArtifact } = require('./native-launcher');
const {
  portableOcrStatus,
  ocrPngDetailedPortable
} = require('./portable-ocr');

class SafeError extends Error {}
let nativeHostProbeCache;

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

function dataRoot() {
  const base = process.env.LOCALAPPDATA || (process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support')
    : process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'));
  return path.join(base, 'ClaudeEUPrivacyDocumentGatewayV32');
}

// Text processing has no end-user-installed dependency. On Windows its bundled
// native boundary must also be present and match the packaged checksum.
function nativeParserStatus(options = {}) {
  const platform = options.platform || process.platform;
  if (platform === 'darwin' || platform === 'linux') {
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

async function ocrPng(buffer, language, options = {}) {
  const portable = portableOcrStatus(options.portableOcr || {});
  if (portable.available) {
    return ocrPngDetailedPortable(buffer, language, options.portableOcr || {});
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

function validateParserResult(value) {
  if (!value || typeof value !== 'object' || typeof value.markdown !== 'string' ||
    value.markdown.length > 8_000_000 || !Array.isArray(value.attachments) ||
    value.attachments.length > 150 || !Array.isArray(value.warnings) || value.warnings.length > 200) {
    throw new SafeError('Der isolierte Dokumentparser lieferte kein gültiges Ergebnis.');
  }
  let decodedAttachmentBytes = 0;
  for (const attachment of value.attachments) {
    if (!attachment || typeof attachment !== 'object' || typeof attachment.data !== 'string' ||
      attachment.data.length > MAX_ATTACHMENT_BASE64_CHARS ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.data) ||
      Object.keys(attachment).sort().join(',') !== 'data,extension,mimeType,name,source_part,type') {
      throw new SafeError('Ein isoliert extrahiertes Asset ist ungültig oder zu groß.');
    }
    const decodedBytes = Buffer.byteLength(attachment.data, 'base64');
    if (decodedBytes > 8 * 1024 * 1024) throw new SafeError('Ein isoliert extrahiertes Asset ist zu groß.');
    decodedAttachmentBytes += decodedBytes;
  }
  if (decodedAttachmentBytes > 24 * 1024 * 1024) throw new SafeError('Die isoliert extrahierten Assets sind insgesamt zu groß.');
  if (!value.warnings.every((item) => typeof item === 'string' && item.length <= 1000)) {
    throw new SafeError('Der isolierte Dokumentparser lieferte ungültige Warnungen.');
  }
  try {
    validateContentGraph(value.content_graph, value.markdown, value.attachments);
  } catch {
    throw new SafeError('Der isolierte Dokumentparser lieferte keinen gültigen Content-Graph.');
  }
  return value;
}

async function convertDocument(source, options = {}) {
  if (options.signal?.aborted) {
    throw safeError('Der isolierte Dokumentparser wurde auf Anforderung beendet.', 'REQUEST_CANCELLED');
  }
  const ext = path.extname(source).toLowerCase();
  // The parser contains additional extraction code for adversarial/unit tests,
  // but the product release boundary is intentionally narrower until coverage
  // for further formats has been demonstrated.
  const supported = new Set(['.docx', '.txt', '.md', '.markdown', '.csv']);
  if (ext === '.pdf') throw pdfCoverageError();
  if (!supported.has(ext)) throw safeError(
    'Dieses Format ist im beaufsichtigten Pilotbetrieb nicht freigegeben.',
    'FORMAT_COVERAGE_UNVERIFIED'
  );
  // pdf-lite remains available only for adversarial parser tests. Its extraction
  // is not a coverage proof: fonts, the page tree and every visual object cannot
  // yet be accounted for. Never let that best-effort result enter the release
  // pipeline. The current release keeps PDF fail-closed until the native PDFium contract in
  // docs/PDF_ENGINE_DECISION.md has passed all release gates.
  const worker = path.join(__dirname, 'parser-worker.js');
  const networkDeny = path.join(__dirname, 'network-deny.cjs');
  const spawn = options.spawn || childProcess.spawn;
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const nodeExecutable = options.execPath || process.execPath;
  const nodeFlags = [
    '--permission', `--allow-fs-read=${__dirname}`, `--require=${networkDeny}`, '--disable-proto=throw',
    '--max-old-space-size=384', worker, ext
  ];
  let command = nodeExecutable;
  let args = [...nodeFlags, '0'];
  let stdio;
  if (platform === 'win32') {
    if (arch !== 'x64') {
      throw safeError('Die native Windows-Parserbegrenzung ist für diese Prozessorarchitektur nicht verfügbar.', 'PARSER_ISOLATION_FAILED');
    }
    const launcher = options.launcherPath || path.join(__dirname, 'native', 'windows-x64', 'datasecure-sandbox.exe');
    command = verifyNativeLauncher(launcher, options);
    args = [
      '--memory-mib', String(PARSER_JOB_MEMORY_MIB),
      '--cpu-ms', String(PARSER_JOB_CPU_MS),
      '--wall-ms', String(PARSER_JOB_WALL_MS), '--', nodeExecutable,
      ...nodeFlags, '0'
    ];
  } else if (platform === 'darwin' || platform === 'linux') {
    const portable = nativeParserStatus({ platform, nodeVersion: options.nodeVersion });
    if (!portable.available) {
      throw safeError('Die portable Node-Parserbegrenzung benötigt Node.js 22.13 oder neuer.', 'PARSER_ISOLATION_FAILED');
    }
  } else {
    throw safeError('Für dieses Betriebssystem ist keine lokale Parserbegrenzung freigegeben.', 'PARSER_ISOLATION_FAILED');
  }
  const fd = fs.openSync(source, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    // A renamed PDF must not enter a text/CSV parser. Sniff the same descriptor
    // that is inherited by the worker, so no path re-open can swap the checked
    // bytes before parsing. PDF headers may legally follow leading junk within
    // the first 1024 bytes.
    if (descriptorStartsAsPdf(fd)) throw pdfCoverageError();
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
  stdio = [fd, 'pipe', 'ignore'];
  let child;
  try {
    child = spawn(command, args, {
      stdio,
      windowsHide: true,
      shell: false,
      env: {}
    });
  } catch {
    fs.closeSync(fd);
    throw safeError('Der isolierte Dokumentparser konnte nicht gestartet werden.', 'PARSER_ISOLATION_FAILED');
  }
  fs.closeSync(fd);
  return new Promise((resolve, reject) => {
    let settled = false;
    let terminationError = null;
    let terminationTimer = null;
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
      terminate(new SafeError('Der isolierte Dokumentparser hat das Zeitlimit überschritten.'));
    }, options.timeoutMs ?? PARSER_TIMEOUT_MS);
    const abortHandler = () => terminate(
      safeError('Der isolierte Dokumentparser wurde auf Anforderung beendet.', 'REQUEST_CANCELLED')
    );
    if (options.signal) options.signal.addEventListener('abort', abortHandler, { once: true });
    if (options.signal?.aborted) abortHandler();
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
      if (code !== 0 || response?.schema !== 'data-secure-parser-result/1' || !response?.ok ||
        responseKeys !== 'ok,result,schema') {
        finish(new SafeError(`Die ${ext.slice(1).toUpperCase()}-Datei konnte nicht sicher lokal gelesen werden.`));
        return;
      }
      try { finish(null, validateParserResult(response.result)); }
      catch (error) { finish(error); }
    });
  });
}

module.exports = {
  SafeError,
  dataRoot,
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
  portableOcrStatus
};
