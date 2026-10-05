import fs from 'node:fs';
import path from 'node:path';
import boundFileIo from '../../plugins/data-secure/server/core/bound-file-io.js';

const ENTRYPOINTS = Object.freeze([
  'standalone/desktop-sidecar.js',
  'standalone/conversion-worker.js',
  'standalone/conversion-worker-child.js',
  'gateway/batch-worker.js',
  'gateway/review-worker.js',
  'gateway/result-export-replay-worker.js',
  'companion/stdio-server.js',
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
const FORBIDDEN = /(^|\/)(?:ocr-runtime|status-app)(?:\/|$)|(^|\/)mcp-server\.js$|(^|\/)index\.js$|(^|\/)converters\/markitdown(?:\/|$)/iu;

function regular(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('STANDALONE_PROJECTION_SOURCE_UNSAFE');
  return stat;
}

function resolveRelative(source, request, serverRoot) {
  const base = path.resolve(path.dirname(source), request);
  const candidates = [base, `${base}.js`, `${base}.cjs`, `${base}.json`, path.join(base, 'index.js')];
  const resolved = candidates.find((candidate) => {
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
  const platformAssets = PLATFORM_ASSETS[productTarget] || [];
  const pending = [...ENTRYPOINTS, ...platformAssets].map((relative) => ({
    relative,
    resolved: path.join(root, ...relative.split('/'))
  }));
  const files = new Map();
  while (pending.length) {
    const current = pending.pop();
    if (files.has(current.relative)) continue;
    regular(current.resolved);
    if (FORBIDDEN.test(current.relative)) throw new Error(`STANDALONE_PROJECTION_ENTRY_FORBIDDEN:${current.relative}`);
    const bytes = boundFileIo.readBoundFile(current.resolved, { maximum: 128 * 1024 * 1024, checkCtime: true });
    files.set(current.relative, { relative: current.relative, source: current.resolved, bytes });
    if (!/\.(?:c?js)$/iu.test(current.relative)) continue;
    const source = bytes.toString('utf8');
    const literal = /\brequire\(\s*(['"])([^'"\r\n]+)\1\s*\)/gu;
    let match;
    while ((match = literal.exec(source))) {
      if (!match[2].startsWith('.')) continue;
      pending.push(resolveRelative(current.resolved, match[2], root));
    }
  }
  return [...files.values()].sort((left, right) => left.relative.localeCompare(right.relative));
}

export function writeStandaloneRuntime(serverRoot, destination, productTarget) {
  const output = path.resolve(destination);
  fs.mkdirSync(output, { recursive: true });
  const files = collectStandaloneRuntime(serverRoot, productTarget);
  for (const file of files) {
    const target = path.join(output, ...file.relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const executable = /^native\/(?:macos-(?:x64|arm64)|linux-x64)\/datasecure-sandbox$/u.test(file.relative);
    fs.writeFileSync(target, file.bytes, { flag: 'wx', mode: executable ? 0o700 : 0o600 });
  }
  return files.map(({ relative, bytes }) => ({ relative: `server/${relative}`, bytes: bytes.length }));
}

export const standaloneProjectionContract = Object.freeze({
  entrypoints: ENTRYPOINTS,
  platformAssets: PLATFORM_ASSETS,
  forbidden: FORBIDDEN
});
