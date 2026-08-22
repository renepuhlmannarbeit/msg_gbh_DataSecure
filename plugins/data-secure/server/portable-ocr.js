'use strict';

const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const { decodePng } = require('./images/png');

const OCR_TIMEOUT_MS = 50_000;
const OCR_MEMORY_MIB = 768;
const OCR_CPU_MS = 40_000;
const OCR_WALL_MS = 45_000;
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
let cachedStatus;

class PortableOcrError extends Error {
  constructor(code = 'OCR_BACKEND_UNAVAILABLE') {
    super('Die portable lokale OCR-Laufzeit ist nicht verfügbar.');
    this.name = 'PortableOcrError';
    this.code = code;
  }
}

function runtimeTarget(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return 'windows-x64';
  if (platform === 'darwin' && arch === 'x64') return 'macos-x64';
  if (platform === 'darwin' && arch === 'arm64') return 'macos-arm64';
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  return null;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function safeBundleFile(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\')) throw new Error('path');
  const parts = relative.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error('path');
  const file = path.join(root, ...parts);
  const info = fs.lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('type');
  return { file, info };
}

function inventoryFiles(root, current = root, output = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error('link');
    if (entry.isDirectory()) inventoryFiles(root, absolute, output);
    else if (entry.isFile()) output.push(path.relative(root, absolute).split(path.sep).join('/'));
    else throw new Error('type');
  }
  return output;
}

function inspectPortableOcr(options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const target = runtimeTarget(platform, arch);
  if (!target) return { available: false, mode: 'unavailable', reason: 'unsupported_platform' };
  let root = options.runtimeRoot || path.join(__dirname, 'ocr-runtime');
  if (!options.runtimeRoot && !fs.existsSync(path.join(root, 'bundle-manifest.json'))) {
    root = path.join(root, target);
  }
  try {
    const rootInfo = fs.lstatSync(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('root');
    const manifestFile = path.join(root, 'bundle-manifest.json');
    const manifestInfo = fs.lstatSync(manifestFile);
    if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.size > 1024 * 1024) {
      throw new Error('manifest');
    }
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const legacy = manifest.schema === 'data-secure-ocr-runtime-bundle/v1' && manifest.target === target;
    const universal = manifest.schema === 'data-secure-ocr-runtime-bundle/v2' &&
      manifest.target === 'universal' && Array.isArray(manifest.targets);
    const targetEntry = universal && manifest.targets.find((item) => item?.target === target);
    if ((!legacy && !targetEntry) || manifest.contract !== 'data-secure-ocr-result/v1' ||
      JSON.stringify(manifest.models) !== JSON.stringify(['deu', 'eng']) ||
      !Array.isArray(manifest.files) || manifest.files.length < 6) throw new Error('manifest');
    if (manifest.release_enabled !== true) {
      return { available: false, mode: 'bundled_disabled', reason: 'coverage_unverified', target };
    }
    const seen = new Set();
    for (const item of manifest.files) {
      if (!item || Object.keys(item).sort().join(',') !== 'bytes,path,sha256' ||
        !Number.isSafeInteger(item.bytes) || item.bytes < 0 ||
        !/^[a-f0-9]{64}$/u.test(String(item.sha256)) || seen.has(item.path)) throw new Error('inventory');
      seen.add(item.path);
      const { file, info } = safeBundleFile(root, item.path);
      if (info.size !== item.bytes || sha256(file) !== item.sha256) throw new Error('integrity');
    }
    const actual = inventoryFiles(root).filter((item) => item !== 'bundle-manifest.json').sort();
    if (actual.length !== seen.size || actual.some((item) => !seen.has(item))) throw new Error('inventory');
    const launcherName = target === 'windows-x64' ? 'datasecure-ocr-sandbox.exe' : 'datasecure-ocr-sandbox';
    const launcherRelative = legacy ? launcherName : targetEntry.launcher;
    if (launcherRelative !== (legacy ? launcherName : `targets/${target}/${launcherName}`)) {
      throw new Error('launcher');
    }
    for (const required of [launcherRelative, 'runtime-worker.mjs', 'network-deny.cjs',
      'models/deu.traineddata', 'models/eng.traineddata', 'THIRD_PARTY_NOTICES.md']) {
      if (!seen.has(required)) throw new Error('incomplete');
    }
    return {
      available: true, mode: 'bundled_portable_ocr', reason: 'ok', target, root,
      launcher: path.join(root, ...launcherRelative.split('/')), worker: path.join(root, 'runtime-worker.mjs'),
      networkDeny: path.join(root, 'network-deny.cjs')
    };
  } catch {
    return { available: false, mode: 'unavailable', reason: 'bundle_integrity_failed', target };
  }
}

function portableOcrStatus(options = {}) {
  if (options.runtimeRoot || options.platform || options.arch || options.noCache) {
    return inspectPortableOcr(options);
  }
  if (!cachedStatus) cachedStatus = inspectPortableOcr();
  return { ...cachedStatus };
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function validateResult(value, width, height) {
  if (!exactKeys(value, ['schema', 'status', 'languages', 'image', 'text', 'confidence', 'words', 'quality']) ||
    value.schema !== 'data-secure-ocr-result/v1' || !['recognized', 'empty'].includes(value.status) ||
    JSON.stringify(value.languages) !== JSON.stringify(['deu', 'eng']) ||
    !exactKeys(value.image, ['width', 'height']) || value.image.width !== width || value.image.height !== height ||
    typeof value.text !== 'string' || value.text.length > 5_000_000 || value.text.includes('\0') ||
    !Number.isSafeInteger(value.confidence) || value.confidence < 0 || value.confidence > 100 ||
    !Array.isArray(value.words) || value.words.length > 100_000 ||
    (value.status === 'recognized') !== (value.words.length > 0) ||
    !exactKeys(value.quality, ['requires_visual_review', 'reasons']) ||
    value.quality.requires_visual_review !== true || !Array.isArray(value.quality.reasons) ||
    !value.quality.reasons.includes('NON_TEXTUAL_MEANING_UNVERIFIED') ||
    new Set(value.quality.reasons).size !== value.quality.reasons.length ||
    value.quality.reasons.some((reason) => !['NON_TEXTUAL_MEANING_UNVERIFIED', 'OCR_EMPTY',
      'OCR_LOW_CONFIDENCE_PRESENT'].includes(reason))) throw new PortableOcrError('OCR_RESULT_INVALID');
  let previousLine = -1;
  for (let index = 0; index < value.words.length; index++) {
    const word = value.words[index];
    if (!exactKeys(word, ['index', 'line_index', 'text', 'confidence', 'bbox']) || word.index !== index ||
      !Number.isSafeInteger(word.line_index) || word.line_index < previousLine ||
      typeof word.text !== 'string' || !word.text || word.text.length > 1_000 || word.text.includes('\0') ||
      !Number.isSafeInteger(word.confidence) || word.confidence < 0 || word.confidence > 100 ||
      !exactKeys(word.bbox, ['x0', 'y0', 'x1', 'y1']) ||
      !['x0', 'y0', 'x1', 'y1'].every((key) => Number.isSafeInteger(word.bbox[key])) ||
      word.bbox.x0 < 0 || word.bbox.y0 < 0 || word.bbox.x1 <= word.bbox.x0 ||
      word.bbox.y1 <= word.bbox.y0 || word.bbox.x1 > width || word.bbox.y1 > height) {
      throw new PortableOcrError('OCR_RESULT_INVALID');
    }
    previousLine = word.line_index;
  }
  const expectedReasons = ['NON_TEXTUAL_MEANING_UNVERIFIED'];
  if (value.words.length === 0) expectedReasons.push('OCR_EMPTY');
  if (value.words.some((word) => word.confidence < 70)) expectedReasons.push('OCR_LOW_CONFIDENCE_PRESENT');
  if (JSON.stringify(value.quality.reasons) !== JSON.stringify(expectedReasons) ||
    (value.words.length === 0 && value.text.trim())) throw new PortableOcrError('OCR_RESULT_INVALID');
  return value;
}

async function ocrPngDetailedPortable(buffer, language = 'de-DE', options = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_INPUT_BYTES) {
    throw new PortableOcrError('OCR_INPUT_LIMIT');
  }
  const status = portableOcrStatus(options);
  if (!status.available) throw new PortableOcrError('OCR_BACKEND_UNAVAILABLE');
  const { width, height } = decodePng(buffer);
  const spawn = options.spawn || childProcess.spawn;
  const args = [
    '--memory-mib', String(OCR_MEMORY_MIB), '--cpu-ms', String(OCR_CPU_MS),
    '--wall-ms', String(OCR_WALL_MS), '--', options.execPath || process.execPath,
    '--no-warnings', '--permission', `--allow-fs-read=${status.root}`, '--allow-worker',
    '--disable-proto=throw', '--max-old-space-size=512', status.worker
  ];
  let child;
  try {
    child = spawn(status.launcher, args, {
      stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, shell: false,
      env: {
        DATASECURE_OCR_IMAGE_WIDTH: String(width),
        DATASECURE_OCR_IMAGE_HEIGHT: String(height),
        NODE_OPTIONS: `--require=${status.networkDeny}`
      }
    });
  } catch {
    throw new PortableOcrError('OCR_BACKEND_UNAVAILABLE');
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let terminationError = null;
    let terminationTimer = null;
    let bytes = 0;
    const chunks = [];
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(terminationTimer);
      if (error) reject(error); else resolve(result);
    };
    const terminate = (error) => {
      if (settled || terminationError) return;
      terminationError = error;
      try {
        if (child.kill() === false) throw new Error('termination_not_started');
      } catch {
        finish(new PortableOcrError('OCR_BACKEND_UNAVAILABLE'));
        return;
      }
      terminationTimer = setTimeout(() => finish(new PortableOcrError('OCR_BACKEND_UNAVAILABLE')),
        options.terminationGraceMs || 10_000);
    };
    const timer = setTimeout(() => terminate(new PortableOcrError('OCR_TIMEOUT')),
      Math.min(options.timeoutMs || OCR_TIMEOUT_MS, OCR_TIMEOUT_MS));
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) {
        terminate(new PortableOcrError('OCR_OUTPUT_LIMIT'));
      } else chunks.push(chunk);
    });
    child.once('error', () => finish(new PortableOcrError('OCR_BACKEND_UNAVAILABLE')));
    child.once('close', (code) => {
      if (settled) return;
      if (terminationError) return finish(terminationError);
      if (code !== 0) return finish(new PortableOcrError(
        code === 125 ? 'OCR_RESOURCE_LIMIT' : 'OCR_BACKEND_UNAVAILABLE'));
      let parsed;
      try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return finish(new PortableOcrError('OCR_RESULT_INVALID')); }
      try { finish(null, validateResult(parsed, width, height)); }
      catch (error) { finish(error); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(buffer);
  });
}

module.exports = {
  OCR_TIMEOUT_MS, OCR_MEMORY_MIB, OCR_CPU_MS, OCR_WALL_MS,
  MAX_INPUT_BYTES, MAX_OUTPUT_BYTES, PortableOcrError,
  runtimeTarget, portableOcrStatus, validateResult, ocrPngDetailedPortable
};
