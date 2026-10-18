// Explicit local native build, not a suite/CI/package runner. All output stays
// in a freshly created directory below dist; no product binary is installed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = '22.23.2';
const HEADERS_SHA = 'daaf13ec5d45a38bbcfcff06d0723f72a6813b89ab27bb5af2ac8e1f6259dde0';
const LIB_SHA = 'ac15f1e9d7c8279353723a77f6319967f1a41c06026521094a8234c2e6fbe052';
const source = path.join(root, 'native', 'ownership-guard', 'ownership-guard.c');
const args = process.argv.slice(2);
if (args.length !== 3 || args[0] !== '--output' || args[2] !== '--fetch-official-inputs')
  throw Error('Use --output <new-directory-under-dist> --fetch-official-inputs');
if (!['win32', 'darwin'].includes(process.platform) || !['x64', 'arm64'].includes(process.arch) ||
    process.platform === 'win32' && process.arch !== 'x64') throw Error('Unsupported build target');
const output = path.resolve(args[1]), dist = path.join(root, 'dist');
const relative = path.relative(dist, output);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Unsafe build output');
for (let p = path.dirname(output); ;) {
  if (fs.existsSync(p) && (!fs.lstatSync(p).isDirectory() || fs.lstatSync(p).isSymbolicLink())) throw Error('Unsafe build parent');
  // Use the same platform path comparison as containment above: on Windows,
  // DIST and dist identify the same parent. Never walk past a filesystem root.
  if (path.relative(dist, p) === '') break;
  const parent = path.dirname(p);
  if (parent === p) throw Error('Unsafe build parent');
  p = parent;
}
if (fs.existsSync(output)) throw Error('Build output must not already exist');
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function download(name, destination, expected) {
  const bytes = await new Promise((resolve, reject) => {
    const request = https.get(`https://nodejs.org/dist/v${NODE}/${name}`, response => {
      if (response.statusCode !== 200) { response.resume(); reject(Error('Official download failed')); return; }
      const chunks = []; let total = 0;
      response.on('data', chunk => { total += chunk.length; if (total > 20 * 1024 * 1024) response.destroy(Error('Input limit')); else chunks.push(chunk); });
      response.on('error', reject); response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.setTimeout(30_000, () => request.destroy(Error('Official download timeout'))); request.on('error', reject);
  });
  if (hash(bytes) !== expected) throw Error('Official build input checksum mismatch');
  fs.writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 });
}
const headers = path.join(output, 'node-headers.tar.gz');
await download(`node-v${NODE}-headers.tar.gz`, headers, HEADERS_SHA);
function run(command, argv, options = {}) {
  const result = cp.spawnSync(command, argv, { cwd: output, encoding: 'utf8', windowsHide: true, shell: false,
    timeout: 120_000, maxBuffer: 4 * 1024 * 1024, ...options });
  if (result.status !== 0 || result.error) throw Error(`Native build step failed: ${command}\n${result.stdout || ''}${result.stderr || ''}`);
  return String(result.stdout || '') + String(result.stderr || '');
}
run(process.platform === 'win32' ? 'tar.exe' : '/usr/bin/tar', ['-xzf', headers, '-C', output]);
const include = path.join(output, `node-v${NODE}`, 'include', 'node');
const artifact = path.join(output, 'ownership-guard.node');
let compiler, dependencies;
if (process.platform === 'win32') {
  const library = path.join(output, 'node.lib'); await download('win-x64/node.lib', library, LIB_SHA);
  const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
  const installation = run(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath']).trim();
  if (!installation || installation.includes('\n')) throw Error('Compiler discovery failed');
  const vcvars = path.join(installation, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat');
  // Every shell argument below is controlled build metadata. Refuse metachars
  // even inside quotes; never interpolate an environment-derived build command.
  const quote = value => { if (/["\r\n%!?&|<>^]/u.test(value)) throw Error('Unsafe build argument'); return `"${value}"`; };
  const command = `call ${quote(vcvars)} x64 10.0.26100.0 >nul && cl.exe /nologo /Bv /TC /std:c11 /LD /O2 /MT /W4 /WX /sdl /guard:cf /Brepro /D_WIN32_WINNT=0x0601 /I${quote(include)} /Fo:${quote(path.join(output, 'ownership-guard.obj'))} /Fe:${quote(artifact)} ${quote(source)} /link ${quote(library)} Advapi32.lib delayimp.lib /DELAYLOAD:node.exe /Brepro /guard:cf /CETCOMPAT /DYNAMICBASE /NXCOMPAT /HIGHENTROPYVA /INCREMENTAL:NO`;
  const log = run('C:\\Windows\\System32\\cmd.exe', ['/d', '/c', command], { windowsVerbatimArguments: true });
  fs.writeFileSync(path.join(output, 'build.log'), log, { flag: 'wx' });
  const imports = run('C:\\Windows\\System32\\cmd.exe', ['/d', '/c',
    `call ${quote(vcvars)} x64 10.0.26100.0 >nul && dumpbin.exe /DEPENDENTS ${quote(artifact)}`], { windowsVerbatimArguments: true });
  dependencies = [...imports.matchAll(/^\s+([a-zA-Z0-9_.-]+\.(?:dll|exe))\s*$/gmu)].map(match => match[1].toLowerCase());
  if (!dependencies.includes('node.exe') || dependencies.some(name => !['node.exe', 'kernel32.dll', 'advapi32.dll'].includes(name)))
    throw Error(`Unexpected native dependency: ${dependencies.join(',')}`);
  fs.writeFileSync(path.join(output, 'dependencies.log'), imports, { flag: 'wx' });
  compiler = 'MSVC x64 /MT; SDK 10.0.26100.0; /Bv evidence in build.log';
} else {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  run('/usr/bin/clang', ['-std=c11', '-O2', '-fvisibility=hidden', '-Wall', '-Wextra', '-Werror', '-Wno-deprecated-declarations',
    '-mmacosx-version-min=13.5', '-arch', arch, '-DNAPI_VERSION=8', '-I', include, '-bundle', '-undefined', 'dynamic_lookup', source, '-o', artifact]);
  compiler = run('/usr/bin/clang', ['--version']).split('\n')[0];
  const imports = run('/usr/bin/otool', ['-L', artifact]);
  dependencies = imports.split('\n').slice(1).map(line => line.trim().split(' ')[0]).filter(Boolean);
  if (dependencies.length !== 1 || dependencies[0] !== '/usr/lib/libSystem.B.dylib') throw Error('Unexpected native macOS dependency');
  fs.writeFileSync(path.join(output, 'dependencies.log'), imports, { flag: 'wx' });
  // Replace any linker-generated signature, then verify before hashing the
  // final bytes. Ad-hoc signing needs neither a signing identity nor a timestamp.
  run('/usr/bin/codesign', ['--force', '--sign', '-', '--timestamp=none', artifact]);
  run('/usr/bin/codesign', ['--verify', '--strict', artifact]);
}
const manifest = {
  schema: 'datasecure-native-ownership-guard-build/1', node_headers_version: NODE,
  headers_sha256: HEADERS_SHA, ...(process.platform === 'win32' ? { node_lib_sha256: LIB_SHA } : {}),
  source_sha256: hash(fs.readFileSync(source)), compiler, dependencies,
  verified_artifact: { schema: 'datasecure-native-ownership-guard/1', abi: 1, napi: 8,
    target: process.platform === 'win32' ? 'windows-x64' : `macos-${process.arch}`, path: artifact, sha256: hash(fs.readFileSync(artifact)) }
};
fs.writeFileSync(path.join(output, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(manifest));
