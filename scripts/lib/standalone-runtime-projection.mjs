import fs from 'node:fs';
import path from 'node:path';

const ENTRYPOINTS = Object.freeze([
  'standalone/desktop-sidecar.js',
  'gateway/batch-worker.js',
  'gateway/review-worker.js',
  'gateway/result-export-replay-worker.js',
  'companion/stdio-server.js',
  'parser-worker.js',
  'network-deny.cjs'
]);
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

export function collectStandaloneRuntime(serverRoot) {
  const root = path.resolve(serverRoot);
  const pending = ENTRYPOINTS.map((relative) => ({
    relative,
    resolved: path.join(root, ...relative.split('/'))
  }));
  const files = new Map();
  while (pending.length) {
    const current = pending.pop();
    if (files.has(current.relative)) continue;
    regular(current.resolved);
    if (FORBIDDEN.test(current.relative)) throw new Error(`STANDALONE_PROJECTION_ENTRY_FORBIDDEN:${current.relative}`);
    const bytes = fs.readFileSync(current.resolved);
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

export function writeStandaloneRuntime(serverRoot, destination) {
  const output = path.resolve(destination);
  fs.mkdirSync(output, { recursive: true });
  const files = collectStandaloneRuntime(serverRoot);
  for (const file of files) {
    const target = path.join(output, ...file.relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.bytes, { flag: 'wx', mode: 0o600 });
  }
  return files.map(({ relative, bytes }) => ({ relative: `server/${relative}`, bytes: bytes.length }));
}

export const standaloneProjectionContract = Object.freeze({ entrypoints: ENTRYPOINTS, forbidden: FORBIDDEN });
