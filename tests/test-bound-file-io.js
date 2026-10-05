'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createSuite } = require('./helpers');
const { readBoundFile, readBoundFileRecord } = require('../plugins/data-secure/server/core/bound-file-io');
const { createBestEffortDiagnosticLog } = require('../plugins/data-secure/server/core/safe-diagnostic-log');
const { test, done, assert } = createSuite('Held file and best-effort diagnostic boundaries');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-bound-io-'));
const links = [];
function fixture() {
  const directory = fs.mkdtempSync(path.join(root, 'case-'));
  const file = path.join(directory, 'input'), foreign = path.join(directory, 'foreign');
  fs.writeFileSync(file, 'safe'); fs.writeFileSync(foreign, 'foreign contents');
  return { directory, file, foreign };
}
const changed = fn => assert.throws(fn, error => /^BOUND_FILE_/u.test(error.code) && !error.message.includes(root));
function trackedIo(overrides = {}) {
  const handles = new Set();
  const io = { ...fs,
    openSync(...args) { const fd = fs.openSync(...args); handles.add(fd); return fd; },
    closeSync(fd) { handles.delete(fd); return fs.closeSync(fd); }, ...overrides };
  return { io, handles };
}
test('exact bounds, short reads and explicitly permitted empty files', () => {
  const { file } = fixture();
  const { io, handles } = trackedIo({ readSync(fd, bytes, offset, length, position) {
    return fs.readSync(fd, bytes, offset, Math.min(length, 1), position);
  } });
  assert.equal(readBoundFile(file, { io, maximum: 4 }).toString(), 'safe');
  changed(() => readBoundFile(file, { maximum: 3 }));
  fs.writeFileSync(file, '');
  assert.equal(readBoundFile(file, { maximum: 0 }).length, 0);
  changed(() => readBoundFile(file, { maximum: 4, minimum: 1 }));
  assert.equal(handles.size, 0);
});
test('lstat/open ABA substitution is rejected before any foreign byte is read', () => {
  const { file, foreign } = fixture(); let reads = 0;
  const { io, handles } = trackedIo();
  io.openSync = (target, flags) => { const fd = fs.openSync(target === file ? foreign : target, flags); handles.add(fd); return fd; };
  io.readSync = (...args) => { reads++; return fs.readSync(...args); };
  changed(() => readBoundFile(file, { io, maximum: 4 }));
  assert.equal(reads, 0); assert.equal(handles.size, 0);
  assert.equal(fs.readFileSync(foreign, 'utf8'), 'foreign contents');
});
test('replacement after open, parent exchange and growth never return unchecked bytes', () => {
  for (const stage of ['file', 'parent', 'growth']) {
    const { file, directory } = fixture();
    const { io, handles } = trackedIo();
    if (stage === 'parent') {
      let opened = false;
      io.openSync = (...args) => { const fd = fs.openSync(...args); handles.add(fd); opened = true; return fd; };
      io.lstatSync = (target, ...args) => {
        const stat = fs.lstatSync(target, ...args);
        if (opened && target === directory) stat.ino += 1n;
        return stat;
      };
    }
    else io.readSync = (...args) => {
      if (stage === 'file') { fs.renameSync(file, `${file}-old`); fs.writeFileSync(file, 'evil'); }
      else fs.appendFileSync(file, 'unbounded growth');
      return fs.readSync(...args);
    };
    changed(() => readBoundFile(file, { io, maximum: 4 }));
    assert.equal(handles.size, 0, stage);
  }
});
test('data ctime compatibility is retained; program checks can explicitly bind ctime', () => {
  const { file } = fixture(); let calls = 0;
  const { io, handles } = trackedIo({ fstatSync(...args) {
    const stat = fs.fstatSync(...args);
    if (++calls > 1) stat.ctimeNs += 1n;
    return stat;
  } });
  assert.equal(readBoundFile(file, { io }).toString(), 'safe'); calls = 0;
  changed(() => readBoundFile(file, { io, checkCtime: true }));
  assert.equal(handles.size, 0);
});
test('hardlinks require the explicit two-link publication recovery contract', () => {
  const { file, directory } = fixture();
  fs.linkSync(file, path.join(directory, 'owned-publication-link'));
  changed(() => readBoundFile(file));
  assert.equal(readBoundFile(file, { maxLinks: 2 }).toString(), 'safe');
});
test('open/fstat/read/postcheck/close failures and zero reads close exactly once without native paths', () => {
  for (const method of ['openSync', 'fstatSync', 'readSync', 'closeSync', 'zeroRead', 'postcheck']) {
    const { file } = fixture(); let closes = 0, lstats = 0;
    const { io, handles } = trackedIo();
    const close = io.closeSync;
    io.closeSync = fd => { closes++; close(fd); if (method === 'closeSync') throw new Error(`${root} sensitive close`); };
    if (['openSync', 'fstatSync', 'readSync'].includes(method)) io[method] = () => { throw new Error(`${root} sensitive native failure`); };
    if (method === 'zeroRead') io.readSync = () => 0;
    if (method === 'postcheck') io.lstatSync = (target, ...rest) => {
      if (target === file && ++lstats > 1) throw new Error(`${root} sensitive postcheck`);
      return fs.lstatSync(target, ...rest);
    };
    changed(() => readBoundFile(file, { io }));
    assert.equal(handles.size, 0, method);
    assert.equal(closes, method === 'openSync' ? 0 : 1, method);
  }
});
test('descriptor zero is valid and is closed once', () => {
  const { file } = fixture(); let held, closes = 0;
  const io = { ...fs, openSync(...args) { held = fs.openSync(...args); return 0; },
    fstatSync(fd, ...args) { assert.equal(fd, 0); return fs.fstatSync(held, ...args); },
    readSync(fd, ...args) { assert.equal(fd, 0); return fs.readSync(held, ...args); },
    closeSync(fd) { assert.equal(fd, 0); closes++; fs.closeSync(held); } };
  assert.equal(readBoundFileRecord(file, { io }).bytes.toString(), 'safe'); assert.equal(closes, 1);
});
test('POSIX regular-file-to-FIFO substitution never blocks before fstat', () => {
  if (process.platform === 'win32') {
    process.stdout.write('  note POSIX FIFO native probe NOT_RUN on Windows; required on macOS/Linux\n'); return;
  }
  const { file } = fixture(); const { io, handles } = trackedIo();
  io.openSync = (target, flags, ...args) => {
    assert.ok(flags & fs.constants.O_NONBLOCK);
    fs.unlinkSync(target);
    assert.equal(spawnSync('mkfifo', [target], { timeout: 5000 }).status, 0);
    const fd = fs.openSync(target, flags, ...args); handles.add(fd); return fd;
  };
  changed(() => readBoundFile(file, { io })); assert.equal(handles.size, 0);
});
test('actual Markdown, status and SEA readers refuse a raced FIFO within a bounded child deadline', () => {
  if (process.platform === 'win32') {
    process.stdout.write('  note product FIFO probes NOT_RUN on Windows; required on POSIX\n'); return;
  }
  const code = `
    const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
    const { spawnSync } = require('node:child_process');
    const [mode, directory] = process.argv.slice(1);
    let target, read, readSea;
    if (mode === 'markdown') {
      process.env.EU_PRIVACY_DATA_ROOT = path.join(directory, 'data');
      const store = require('./plugins/data-secure/server/standalone/markdown-store');
      const id = 'dm_' + 'a'.repeat(32), folder = path.join(store.artifactRoot(), id);
      fs.mkdirSync(folder); target = path.join(folder, 'manifest.json');
      read = () => assert.throws(() => store.readMarkdownArtifact(id));
    } else if (mode === 'status') {
      target = path.join(directory, 'artifact.json');
      const app = require('./plugins/data-secure/server/status-app/server').createStatusApp({
        directory, env: { EU_PRIVACY_STATUS_APP_PILOT: '1' }
      });
      read = () => assert.equal(app.initialize({ extensions: { 'io.modelcontextprotocol/ui': {
        mimeTypes: ['text/html;profile=mcp-app']
      } } }), false);
    } else {
      target = path.join(directory, 'sea-evidence');
      read = () => assert.throws(() => readSea(target));
    }
    fs.writeFileSync(target, '{}');
    let swapped = false;
    const original = fs.openSync;
    fs.openSync = function(candidate, flags, ...args) {
      if (candidate === target && !swapped) {
        swapped = true;
        fs.unlinkSync(target);
        assert.equal(spawnSync('mkfifo', [target], { timeout: 2000 }).status, 0);
      }
      return original.call(fs, candidate, flags, ...args);
    };
    (async () => {
      if (mode === 'sea') readSea = (await import('./scripts/lib/sea-source-evidence.mjs')).readSeaFile;
      await read(); assert.equal(swapped, true);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  for (const mode of ['markdown', 'status', 'sea']) {
    const { directory } = fixture();
    const result = spawnSync(process.execPath, ['-e', code, mode, directory], {
      cwd: path.resolve(__dirname, '..'), timeout: 8000, encoding: 'utf8', windowsHide: true
    });
    assert.ifError(result.error); assert.equal(result.status, 0, `${mode}: ${result.stderr}`);
  }
});
test('diagnostic rotation is exclusive and never replaces or removes old archives', () => {
  const { directory } = fixture(); const archive = path.join(directory, 'sidecar-interactions.previous.jsonl');
  fs.writeFileSync(archive, 'archive sentinel');
  const log = createBestEffortDiagnosticLog({ directory, name: 'sidecar-interactions.jsonl', maximum: 6, maxSegments: 2 });
  assert.equal(log.append('one\n'), true); assert.equal(log.append('two\n'), true); assert.equal(log.append('end\n'), false);
  assert.equal(fs.readFileSync(path.join(directory, 'sidecar-interactions.jsonl'), 'utf8'), 'one\n');
  assert.equal(fs.readFileSync(archive, 'utf8'), 'archive sentinel');
  const segment = fs.readdirSync(directory).find(name => /^sidecar-interactions\.[a-f0-9]{32}\.jsonl$/u.test(name));
  assert.equal(fs.readFileSync(path.join(directory, segment), 'utf8'), 'two\n');
});
test('diagnostics reject a pre-existing hardlink and an open-time foreign substitution without writing', () => {
  for (const scenario of ['hardlink', 'swap']) {
    const { directory, foreign } = fixture(); const target = path.join(directory, 'sidecar-interactions.jsonl');
    if (scenario === 'hardlink') fs.linkSync(foreign, target); else fs.writeFileSync(target, '');
    const { io, handles } = trackedIo(); let writes = 0;
    if (scenario === 'swap') io.openSync = (_, flags) => { const fd = fs.openSync(foreign, flags); handles.add(fd); return fd; };
    io.writeSync = (...args) => { writes++; return fs.writeSync(...args); };
    assert.equal(createBestEffortDiagnosticLog({ directory, name: 'sidecar-interactions.jsonl', io }).append('event\n'), false);
    assert.equal(fs.readFileSync(foreign, 'utf8'), 'foreign contents');
    assert.equal(writes, 0); assert.equal(handles.size, 0);
  }
});
test('a collided rotation segment is never adopted on a second attempt', () => {
  const { directory } = fixture(), nonce = 'ab'.repeat(16);
  fs.writeFileSync(path.join(directory, 'sidecar-interactions.jsonl'), 'full');
  const collision = path.join(directory, `sidecar-interactions.${nonce}.jsonl`);
  fs.writeFileSync(collision, 'foreign');
  const { io, handles } = trackedIo();
  const log = createBestEffortDiagnosticLog({ directory, name: 'sidecar-interactions.jsonl', maximum: 8,
    io, randomBytes: () => Buffer.from(nonce, 'hex') });
  assert.equal(log.append('next\n'), false); assert.equal(log.append('next\n'), false);
  assert.equal(fs.readFileSync(collision, 'utf8'), 'foreign'); assert.equal(handles.size, 0);
});
test('diagnostic short writes complete, while write/postcheck/close failures disable further appends', () => {
  for (const scenario of ['short', 'zero', 'partial', 'fstat', 'postcheck', 'close']) {
    const { directory } = fixture(); let writes = 0, opened = false;
    const { io, handles } = trackedIo();
    const open = io.openSync, close = io.closeSync;
    io.openSync = (...args) => { const fd = open(...args); opened = true; return fd; };
    io.writeSync = (fd, bytes, offset, length) => {
      writes++;
      if (scenario === 'zero') return 0;
      if (scenario === 'partial' && writes > 1) throw Object.assign(new Error('sensitive ENOSPC'), { code: 'ENOSPC' });
      return fs.writeSync(fd, bytes, offset, scenario === 'short' || scenario === 'partial' ? Math.min(3, length) : length);
    };
    if (scenario === 'fstat') io.fstatSync = () => { throw new Error('sensitive fstat'); };
    if (scenario === 'postcheck') io.lstatSync = (target, ...args) => {
      if (opened && writes && path.basename(target).endsWith('.jsonl')) throw new Error('sensitive postcheck');
      return fs.lstatSync(target, ...args);
    };
    if (scenario === 'close') io.closeSync = fd => { close(fd); throw new Error('sensitive close'); };
    const log = createBestEffortDiagnosticLog({ directory, name: 'sidecar-interactions.jsonl', io });
    const record = '{"event":"one"}\n';
    assert.equal(log.append(record), scenario === 'short', scenario);
    const before = fs.readFileSync(path.join(directory, 'sidecar-interactions.jsonl'));
    assert.equal(log.append(record), scenario === 'short', scenario);
    if (scenario === 'short') assert.equal(fs.readFileSync(path.join(directory, 'sidecar-interactions.jsonl'), 'utf8'), record + record);
    else assert.deepEqual(fs.readFileSync(path.join(directory, 'sidecar-interactions.jsonl')), before);
    assert.equal(handles.size, 0, scenario);
  }
});
test('diagnostics reject parent/file substitutions after open before the first write', () => {
  for (const scenario of ['file', 'parent']) {
    const { directory } = fixture(); let opened = false, writes = 0;
    const { io, handles } = trackedIo(); const open = io.openSync;
    io.openSync = (...args) => { const fd = open(...args); opened = true; return fd; };
    io.lstatSync = (target, ...args) => {
      const stat = fs.lstatSync(target, ...args);
      if (opened && (scenario === 'parent' ? target === directory : target.endsWith('.jsonl'))) stat.ino += 1n;
      return stat;
    };
    io.writeSync = (...args) => { writes++; return fs.writeSync(...args); };
    const log = createBestEffortDiagnosticLog({ directory, name: 'sidecar-interactions.jsonl', io });
    assert.equal(log.append('event\n'), false); assert.equal(log.append('event\n'), false);
    assert.equal(writes, 0); assert.equal(handles.size, 0);
  }
});
test('directory junctions/symlinks, including higher ancestors with missing descendants, block diagnostics', () => {
  const { directory, file } = fixture(); const alias = `${directory}-alias`;
  fs.symlinkSync(directory, alias, process.platform === 'win32' ? 'junction' : 'dir'); links.push(alias);
  changed(() => readBoundFile(path.join(alias, path.basename(file))));
  assert.equal(createBestEffortDiagnosticLog({ directory: alias, name: 'sidecar-interactions.jsonl' }).append('event\n'), false);
  assert.equal(fs.existsSync(path.join(directory, 'sidecar-interactions.jsonl')), false);
  assert.equal(createBestEffortDiagnosticLog({ directory: path.join(alias, 'missing', 'nested'), name: 'sidecar-interactions.jsonl' }).append('event\n'), false);
  assert.equal(fs.existsSync(path.join(directory, 'missing')), false);
});
done().finally(() => {
  for (const link of links) { assert.ok(fs.lstatSync(link).isSymbolicLink()); fs.unlinkSync(link); }
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('datasecure-bound-io-'));
  fs.rmSync(root, { recursive: true });
});
