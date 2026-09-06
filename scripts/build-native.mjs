import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyNativeArtifact } from './lib/native-artifact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedCompiler = '19.50.35725';
const expectedWindowsSdk = '10.0.26100.0';

const mode = process.argv[2];
if (!['--update', '--verify-reproducible', '--analyze'].includes(mode)) {
  throw new Error('use --update, --verify-reproducible or --analyze explicitly');
}
if (process.platform !== 'win32') throw new Error('native Windows launcher builds require Windows x64');
if (process.arch !== 'x64') {
  throw new Error(`native launcher build is not yet available for ${process.arch}`);
}

const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
if (!fs.existsSync(vswhere)) throw new Error('Visual Studio Build Tools discovery is unavailable');
const found = childProcess.spawnSync(vswhere, [
  '-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
  '-property', 'installationPath'
], { encoding: 'utf8', windowsHide: true, shell: false });
const installation = String(found.stdout || '').trim();
if (found.status !== 0 || !installation) throw new Error('Visual C++ x64 build tools are unavailable');

const vcvars = path.join(installation, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat');
const source = path.join(root, 'native', 'windows', 'datasecure-sandbox.cpp');
const trackedDir = path.join(root, 'plugins', 'data-secure', 'server', 'native', 'windows-x64');
const trackedOutput = path.join(trackedDir, 'datasecure-sandbox.exe');
const trackedChecksum = path.join(trackedDir, 'datasecure-sandbox.sha256');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-native-'));
const temporaryIdentity = fs.lstatSync(temporary);
function cleanupNativeBuild() {
  if (path.dirname(temporary) !== path.resolve(os.tmpdir()) || !/^datasecure-native-[A-Za-z0-9]+$/u.test(path.basename(temporary))) {
    throw new Error('NATIVE_BUILD_CLEANUP_UNSAFE');
  }
  const entries = [];
  function inspect(target) {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error('NATIVE_BUILD_CLEANUP_UNSAFE');
    if (target === temporary && (stat.dev !== temporaryIdentity.dev || stat.ino !== temporaryIdentity.ino)) throw new Error('NATIVE_BUILD_CLEANUP_UNSAFE');
    entries.push({ target, stat });
    if (stat.isDirectory()) for (const name of fs.readdirSync(target)) inspect(path.join(target, name));
  }
  inspect(temporary);
  for (const entry of entries.reverse()) {
    const current = fs.lstatSync(entry.target);
    if (current.isSymbolicLink() || current.dev !== entry.stat.dev || current.ino !== entry.stat.ino ||
        current.isDirectory() !== entry.stat.isDirectory()) throw new Error('NATIVE_BUILD_CLEANUP_UNSAFE');
    if (current.isDirectory()) fs.rmdirSync(entry.target); else fs.unlinkSync(entry.target);
  }
}
const output = path.join(temporary, 'datasecure-sandbox.exe');
const object = path.join(temporary, 'datasecure-sandbox.obj');
if (!fs.existsSync(vcvars) || !fs.existsSync(source)) throw new Error('native launcher build inputs are incomplete');
fs.mkdirSync(trackedDir, { recursive: true });

const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const compilerGuard = mode === '--analyze'
  ? []
  : ['cl.exe', '/Bv', '2>&1', '|', 'findstr', `/C:${quote(expectedCompiler)}`, '>nul', '&&'];
const command = [
  'call', quote(vcvars), 'x64', expectedWindowsSdk, '>nul', '&&',
  ...compilerGuard,
  'cl.exe', '/nologo', '/std:c++17', '/O2', '/MT', '/W4', '/WX', '/sdl', '/guard:cf',
  '/DUNICODE', '/D_UNICODE', '/Brepro', `/Fe:${quote(output)}`, `/Fo:${quote(object)}`,
  quote(source), '/link', '/SUBSYSTEM:CONSOLE', '/guard:cf', '/CETCOMPAT',
  '/DYNAMICBASE', '/NXCOMPAT', '/HIGHENTROPYVA'
].join(' ');
try {
  const built = childProcess.spawnSync(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
    ['/d', '/c', command], {
      cwd: root, encoding: 'utf8', windowsHide: true, shell: false,
      windowsVerbatimArguments: true,
      maxBuffer: 4 * 1024 * 1024
    });
  if (built.status !== 0 || !fs.existsSync(output)) throw new Error(
    `native launcher build failed\n${String(built.stdout || '')}${String(built.stderr || '')}`
  );
  const bytes = fs.readFileSync(output);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (mode === '--update') {
    fs.copyFileSync(output, trackedOutput);
    fs.writeFileSync(trackedChecksum, `${hash}\n`, 'utf8');
    verifyNativeArtifact(trackedOutput, trackedChecksum);
    console.log(`Updated ${trackedOutput}\nsha256=${hash}\ntoolchain=MSVC ${expectedCompiler} / Windows SDK ${expectedWindowsSdk}`);
  } else if (mode === '--verify-reproducible') {
    const tracked = verifyNativeArtifact(trackedOutput, trackedChecksum);
    if (!bytes.equals(tracked.bytes)) {
      throw new Error(`native launcher source/binary drift: built=${hash} tracked=${tracked.sha256}`);
    }
    console.log(`Native source/binary reproducibility verified: sha256=${hash}\ntoolchain=MSVC ${expectedCompiler} / Windows SDK ${expectedWindowsSdk}`);
  } else {
    console.log(`Native analysis build completed: sha256=${hash}\ntoolchain=runner MSVC / Windows SDK ${expectedWindowsSdk}`);
  }
} finally {
  cleanupNativeBuild();
}
