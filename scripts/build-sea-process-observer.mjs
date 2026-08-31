// Explicit local engineering build. No runtime artifact, install or cloud job.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readSeaFile, seaHash, assertSeaDirectory } from './lib/sea-source-evidence.mjs';

const root = path.resolve(import.meta.dirname, '..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('OBSERVER_WINDOWS_X64_REQUIRED');
if (process.argv.length !== 4 || process.argv[2] !== '--output-directory') throw new Error('OBSERVER_BUILD_ARGUMENTS_INVALID');
const output = path.resolve(process.argv[3]);
const dist = path.join(root, 'dist');
// A new directory directly under dist; never overwrite an installed product.
if (path.dirname(output) !== dist || !/^sea-observer-[a-zA-Z0-9-]+$/.test(path.basename(output))) {
  throw new Error('OBSERVER_OUTPUT_INVALID');
}
assertSeaDirectory(dist);
if (fs.existsSync(output)) throw new Error('OBSERVER_OUTPUT_EXISTS');
const sourceFile = path.join(root, 'native/sea/process-observer.cpp');
const source = readSeaFile(sourceFile, 65536);
const builderFile = path.join(root, 'scripts/build-sea-process-observer.mjs');
const builderSource = readSeaFile(builderFile, 65536);
const vswhere = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
  'Microsoft Visual Studio/Installer/vswhere.exe');
function run(file, args, extra = {}) {
  const result = spawnSync(file, args, { encoding: 'utf8', windowsHide: true, shell: false,
    timeout: 120000, maxBuffer: 2 * 1024 * 1024, ...extra });
  if (result.error || result.status !== 0) throw new Error('OBSERVER_BUILD_FAILED');
  return result.stdout;
}
const installation = run(vswhere, ['-latest', '-products', '*', '-requires',
  'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath']).trim();
if (!path.isAbsolute(installation)) throw new Error('OBSERVER_COMPILER_INVALID');
const vcvars = path.join(installation, 'VC/Auxiliary/Build/vcvarsall.bat');
readSeaFile(vcvars);
// Reject shell metacharacters even inside quoted user/build paths.
for (const value of [root, output, vcvars]) {
  if (/["%&|<>^!\r\n]/.test(value)) throw new Error('OBSERVER_BUILD_PATH_INVALID');
}
fs.mkdirSync(output); assertSeaDirectory(output);
fs.writeFileSync(path.join(output, 'process-observer.cpp'), source, { flag: 'wx' });
const command = `call "${vcvars}" x64 10.0.26100.0 >nul && cl.exe /Bv 2>&1 | findstr /C:"19.50.35725" >nul && ` +
  'cl.exe /nologo /std:c++17 /O2 /MT /W4 /WX /sdl /guard:cf /DUNICODE /D_UNICODE /Brepro ' +
  '/Fe:process-observer.exe /Fo:process-observer.obj process-observer.cpp /link /SUBSYSTEM:CONSOLE ' +
  '/guard:cf /CETCOMPAT /DYNAMICBASE /NXCOMPAT /HIGHENTROPYVA';
run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/cmd.exe'), ['/d', '/c', command],
  { cwd: output, windowsVerbatimArguments: true });
const binary = readSeaFile(path.join(output, 'process-observer.exe'));
if (seaHash(readSeaFile(sourceFile)) !== seaHash(source)) throw new Error('OBSERVER_SOURCE_CHANGED');
if (seaHash(readSeaFile(builderFile)) !== seaHash(builderSource)) throw new Error('OBSERVER_BUILDER_CHANGED');
const evidence = { schema: 'datasecure-sea-process-observer-build/v1', release_enabled: false,
  target: 'windows-x64', source_sha256: seaHash(source),
  builder_sha256: seaHash(builderSource),
  compiler: '19.50.35725', sdk: '10.0.26100.0', bytes: binary.length, sha256: seaHash(binary) };
fs.writeFileSync(path.join(output, 'observer-build.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(evidence));
// Retain the exclusively created build tree, including failed build diagnostics.
