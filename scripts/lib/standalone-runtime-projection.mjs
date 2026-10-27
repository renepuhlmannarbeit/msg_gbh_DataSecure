import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import boundFileIo from '../../plugins/data-secure/server/core/bound-file-io.js';

const require = createRequire(import.meta.url);

const ENTRYPOINTS = Object.freeze([
  'standalone/desktop-sidecar.js',
  'standalone/conversion-worker.js',
  'standalone/conversion-worker-child.js',
  'gateway/batch-worker.js',
  'gateway/review-worker.js',
  'gateway/result-export-replay-worker.js',
  'parser-worker.js',
  'network-deny.cjs'
]);
const PLATFORM_ASSETS = Object.freeze({
  'windows-x64': Object.freeze([
    'native/windows-x64/datasecure-sandbox.exe',
    'native/windows-x64/datasecure-sandbox.sha256'
  ]),
  'macos-x64': Object.freeze(['native/macos-x64/datasecure-sandbox', 'native/macos-x64/datasecure-sandbox.sha256']),
  'macos-arm64': Object.freeze(['native/macos-arm64/datasecure-sandbox', 'native/macos-arm64/datasecure-sandbox.sha256']),
  'linux-x64-glibc': Object.freeze(['native/linux-x64/datasecure-sandbox', 'native/linux-x64/datasecure-sandbox.sha256'])
});
// Keep the shared gateway import names stable for existing journals and worker
// entrypoints, while sourcing these three adapters only from the app tree.
const ADAPTER_SOURCES = Object.freeze({
  'gateway/local-review-adapter.js': 'gateway/local-review-adapter.js',
  'gateway/product-read-capability.js': 'gateway/product-read-capability.js',
  'gateway/product-terminal-notice.js': 'gateway/product-terminal-notice.js'
});
const FORBIDDEN = /(^|\/)(?:ocr-runtime|status-app)(?:\/|$)|(^|\/)mcp-server\.js$|(^|\/)index\.js$|(^|\/)converters\/markitdown(?:\/|$)|^companion\/|^gateway\/(?:worker-terminal-presentation|package-store)\.js$/iu;

function regular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('STANDALONE_PROJECTION_SOURCE_UNSAFE');
  return stat;
}

function resolveRelative(source, request, serverRoot) {
  const base = path.resolve(path.dirname(source), request);
  const candidates = [base, `${base}.js`, `${base}.cjs`, `${base}.json`, path.join(base, 'index.js')];
  const resolved = candidates.find((candidate) => {
    const relative = path.relative(serverRoot, candidate).split(path.sep).join('/');
    if (Object.hasOwn(ADAPTER_SOURCES, relative)) return true;
    try { return regular(candidate).isFile(); } catch { return false; }
  });
  if (!resolved) throw new Error(`STANDALONE_PROJECTION_DEPENDENCY_MISSING:${request}`);
  const relative = path.relative(serverRoot, resolved).split(path.sep).join('/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative) || FORBIDDEN.test(relative)) {
    throw new Error(`STANDALONE_PROJECTION_DEPENDENCY_FORBIDDEN:${relative}`);
  }
  return { resolved, relative };
}

export function collectStandaloneRuntime(serverRoot, productTarget) {
  const root = path.resolve(serverRoot);
  const adapterRoot = path.resolve(root, '../../../apps/datasecure-standalone/runtime-adapters');
  const platformAssets = PLATFORM_ASSETS[productTarget] || [];
  const pending = [...ENTRYPOINTS, ...platformAssets].map((relative) => ({
    relative,
    resolved: path.join(root, ...relative.split('/'))
  }));
  const files = new Map();
  while (pending.length) {
    const current = pending.pop();
    if (files.has(current.relative)) continue;
    if (FORBIDDEN.test(current.relative)) throw new Error(`STANDALONE_PROJECTION_ENTRY_FORBIDDEN:${current.relative}`);
    const sourceFile = ADAPTER_SOURCES[current.relative]
      ? path.join(adapterRoot, ...ADAPTER_SOURCES[current.relative].split('/')) : current.resolved;
    regular(sourceFile);
    const bytes = boundFileIo.readBoundFile(sourceFile, { maximum: 128 * 1024 * 1024, checkCtime: true });
    files.set(current.relative, { relative: current.relative, source: sourceFile, bytes });
    if (!/\.(?:c?js)$/iu.test(current.relative)) continue;
    const source = bytes.toString('utf8');
    const literal = /\brequire\(\s*(['"])([^'"\r\n]+)\1\s*\)/gu;
    let match;
    while ((match = literal.exec(source))) {
      if (!match[2].startsWith('.')) continue;
      pending.push(resolveRelative(current.resolved, match[2], root));
    }
  }
  if (files.has('core-policy-fingerprint.js')) {
    const policy = require(path.join(root, 'core-policy-fingerprint.js'));
    const fingerprint = policy.calculateStandalonePolicyFingerprint({ root });
    if (fingerprint !== policy.STANDALONE_POLICY_FINGERPRINT) throw new Error('STANDALONE_POLICY_SOURCE_CHANGED');
    const policyHashes = {};
    for (const relative of policy.STANDALONE_POLICY_FILES) {
      const bytes = files.get(relative)?.bytes;
      if (!bytes) throw new Error(`STANDALONE_POLICY_SOURCE_MISSING:${relative}`);
      policyHashes[relative] = crypto.createHash('sha256').update(bytes).digest('hex');
    }
    const relative = 'standalone-core-policy-fingerprint.json';
    files.set(relative, { relative, source: null, bytes: Buffer.from(`${JSON.stringify({
      schema: 'datasecure-standalone-core-policy/2', fingerprint, files: policyHashes
    })}\n`) });
  }
  return [...files.values()].sort((left, right) => left.relative.localeCompare(right.relative));
}

export function writeStandaloneRuntime(serverRoot, destination, productTarget) {
  const output = path.resolve(destination);
  fs.mkdirSync(output, { recursive: true });
  const macosBundle = productTarget.startsWith('macos-');
  if (macosBundle) fs.chmodSync(output, 0o755);
  const files = collectStandaloneRuntime(serverRoot, productTarget);
  for (const file of files) {
    const target = path.join(output, ...file.relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (macosBundle) {
      for (let directory = path.dirname(target); directory !== output; directory = path.dirname(directory)) {
        fs.chmodSync(directory, 0o755);
      }
    }
    const executable = /^native\/(?:macos-(?:x64|arm64)|linux-x64)\/datasecure-sandbox$/u.test(file.relative);
    const mode = macosBundle ? (executable ? 0o755 : 0o644) : (executable ? 0o700 : 0o600);
    fs.writeFileSync(target, file.bytes, { flag: 'wx', mode });
    if (macosBundle) fs.chmodSync(target, mode);
  }
  return files.map(({ relative, bytes }) => ({ relative: `server/${relative}`, bytes: bytes.length }));
}

export const standaloneProjectionContract = Object.freeze({
  entrypoints: ENTRYPOINTS,
  platformAssets: PLATFORM_ASSETS,
  adapterSources: ADAPTER_SOURCES,
  forbidden: FORBIDDEN
});
