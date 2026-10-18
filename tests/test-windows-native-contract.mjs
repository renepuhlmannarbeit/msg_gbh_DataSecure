import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { inspectPe, verifyWindowsCrtPolicy, verifyWindowsNativeContract } from '../scripts/lib/windows-native-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'native/runtime/standalone-windows-runtime.json')));
const entries = bytes => new Map([['DataSecure Standalone.exe', bytes]]);
function pe({ imports = ['KERNEL32.dll'], delayed = [], machine = 0x8664 } = {}) {
  const bytes = Buffer.alloc(0x2200), optional = 0x98;
  bytes.writeUInt16LE(0x5a4d); bytes.writeUInt32LE(0x80, 60); bytes.writeUInt32LE(0x4550, 0x80);
  bytes.writeUInt16LE(machine, 0x84); bytes.writeUInt16LE(1, 0x86); bytes.writeUInt16LE(240, 0x94);
  bytes.writeUInt16LE(0x20b, optional); bytes.writeUInt32LE(0x200, optional + 60);
  bytes.writeUInt32LE(16, optional + 108);
  bytes.writeUInt32LE(0x2000, 0x188 + 8); bytes.writeUInt32LE(0x1000, 0x188 + 12);
  bytes.writeUInt32LE(0x2000, 0x188 + 16); bytes.writeUInt32LE(0x200, 0x188 + 20);
  function directory(index, names, descriptorOffset, stride, namesOffset) {
    if (!names.length) return;
    bytes.writeUInt32LE(descriptorOffset + 0xe00, optional + 112 + index * 8);
    bytes.writeUInt32LE((names.length + 1) * stride, optional + 116 + index * 8);
    let stringOffset = namesOffset;
    names.forEach((name, index) => {
      const at = descriptorOffset + index * stride;
      if (stride === 32) bytes.writeUInt32LE(1, at);
      bytes.writeUInt32LE(stringOffset + 0xe00, at + (stride === 32 ? 4 : 12));
      bytes.write(`${name}\0`, stringOffset, 'ascii'); stringOffset += name.length + 1;
    });
  }
  directory(1, imports, 0x200, 20, 0x400);
  directory(13, delayed, 0x800, 32, 0xc00);
  return bytes;
}

test('PE imports and delay-imports are read from binary structures, not filename strings', () => {
  const bytes = pe({ imports: ['KERNEL32.dll', 'USER32.dll'], delayed: ['SHELL32.dll'] });
  bytes.write('vcruntime140.dll', 0x1800);
  assert.deepEqual(inspectPe(bytes), { architecture: 'x64', imports: ['kernel32.dll', 'user32.dll'], delay_imports: ['shell32.dll'] });
  assert.equal(verifyWindowsNativeContract(entries(bytes), policy).length, 1);
});

test('only delay-import node.exe is syntactically valid; other executable imports and redirects fail', () => {
  assert.deepEqual(inspectPe(pe({ delayed: ['NODE.EXE'] })).delay_imports, ['node.exe']);
  assert.throws(() => inspectPe(pe({ imports: ['node.exe'] })), /IMPORT_NAME_INVALID/u);
  for (const library of ['other.exe', 'datasecure-node.exe', '../node.exe', 'node.exe.dll/../node.exe',
    'C:\\node.exe', 'node.exe ', 'node.exe.', '.node.exe']) {
    assert.throws(() => inspectPe(pe({ delayed: [library] })), /IMPORT_NAME_INVALID/u);
  }
  const nonAscii = pe({ delayed: ['node.exe'] }); nonAscii[0xc00] = 0xee;
  assert.throws(() => inspectPe(nonAscii), /IMPORT_NAME_INVALID/u);
});

test('the Node host delay-import exception belongs only to the exact ownership guard package path', () => {
  const guard = 'server/native/windows-x64/ownership-guard.node';
  const candidate = entries(pe()); candidate.set(guard, pe({ delayed: ['node.exe'] }));
  const report = verifyWindowsNativeContract(candidate, policy);
  assert.equal(report.length, 2);
  assert.deepEqual(report.find(file => file.path === guard).delay_imports, ['node.exe']);
  for (const name of ['DataSecure Standalone.exe', 'ownership-guard.node', 'server/native/windows-x64/other.node',
    'server/native/windows-x64/sub/ownership-guard.node', 'server/native/macos-x64/ownership-guard.node',
    'server/native/windows-x64/Ownership-guard.node', 'server/native/windows-x64/./ownership-guard.node',
    'server/native/windows-x64/../windows-x64/ownership-guard.node', 'server\\native\\windows-x64\\ownership-guard.node']) {
    const wrong = entries(pe()); wrong.set(name, pe({ delayed: ['node.exe'] }));
    assert.throws(() => verifyWindowsNativeContract(wrong, policy), /UNDECLARED_IMPORT/u, name);
  }
  const normal = entries(pe()); normal.set(guard, pe({ imports: ['node.exe'] }));
  assert.throws(() => verifyWindowsNativeContract(normal, policy), /IMPORT_NAME_INVALID/u);
  assert.throws(() => verifyWindowsCrtPolicy({ ...policy, system_dlls: [...policy.system_dlls, 'node.exe'] }), /CRT_POLICY_INVALID/u);
});

test('the ownership guard host exception cannot waive DLL declarations or the static CRT policy', () => {
  const guard = 'server/native/windows-x64/ownership-guard.node';
  for (const field of ['imports', 'delayed']) {
    const candidate = entries(pe());
    candidate.set(guard, pe({ delayed: ['node.exe'], [field]: field === 'delayed'
      ? ['node.exe', 'vcruntime140.dll'] : ['kernel32.dll', 'vcruntime140.dll'] }));
    assert.throws(() => verifyWindowsNativeContract(candidate, policy), /DYNAMIC_CRT_FORBIDDEN/u);
    candidate.set(guard, pe({ delayed: ['node.exe'], [field]: field === 'delayed'
      ? ['node.exe', 'undeclared.dll'] : ['kernel32.dll', 'undeclared.dll'] }));
    assert.throws(() => verifyWindowsNativeContract(candidate, policy), /UNDECLARED_IMPORT/u);
  }
});

test('policy refuses absent, dynamic, incomplete, wrong-target or self-whitelisted vendor CRT strategies', () => {
  for (const value of [null, {}, { ...policy, target: 'macos-arm64' }, { ...policy, desktop_crt: 'dynamic' },
    { ...policy, requires_visual_cpp_redistributable: true }, { ...policy, security_servicing: 'unknown' },
    { ...policy, system_dlls: [...policy.system_dlls, 'vcruntime140.dll'] },
    { ...policy, system_dlls: [...policy.system_dlls, policy.system_dlls[0]] }]) {
    assert.throws(() => verifyWindowsCrtPolicy(value), /WINDOWS_NATIVE_CRT_POLICY_INVALID/u);
  }
  assert.equal(verifyWindowsCrtPolicy(policy).desktop_crt, 'static');
});

test('actual normal or delayed vendor-CRT imports fail even if an adjacent DLL is bundled', () => {
  for (const library of ['VCRUNTIME140.dll', 'vcruntime140_1.dll', 'msvcp140.dll', 'msvcp140_atomic_wait.dll',
    'msvcr120.dll', 'concrt140.dll', 'vcomp140.dll', 'ucrtbased.dll', 'vcruntime140d.dll', 'msvcp140d.dll']) {
    for (const field of ['imports', 'delayed']) {
      const candidate = entries(pe({ [field]: [library] }));
      candidate.set(library, pe());
      assert.throws(() => verifyWindowsNativeContract(candidate, policy), /WINDOWS_NATIVE_DYNAMIC_CRT_FORBIDDEN/u);
    }
  }
});

test('native closure includes addon and helper EXEs and refuses undeclared dependencies', () => {
  const candidate = entries(pe());
  candidate.set('server/conversion/skia.node', pe({ imports: ['random-vendor.dll'] }));
  assert.throws(() => verifyWindowsNativeContract(candidate, policy), /WINDOWS_NATIVE_UNDECLARED_IMPORT/u);
  candidate.set('server/conversion/skia.node', pe({ imports: ['api-ms-win-crt-runtime-l1-1-0.dll'] }));
  candidate.set('server/helper.exe', pe({ imports: ['vcruntime140_1.dll'] }));
  assert.throws(() => verifyWindowsNativeContract(candidate, policy), /WINDOWS_NATIVE_DYNAMIC_CRT_FORBIDDEN/u);
  candidate.set('server/helper.exe', pe());
  const report = verifyWindowsNativeContract(candidate, policy);
  assert.equal(report.length, 3);
  assert.ok(report.every(file => /^[a-f0-9]{64}$/u.test(file.sha256) && file.bytes > 0));
  assert.throws(() => verifyWindowsNativeContract(new Map([['helper.exe', pe()]]), policy), /DESKTOP_MISSING/u);
});

test('malformed, wrong architecture and redirected import names cannot bypass dependency gate', () => {
  assert.equal(inspectPe(Buffer.from('not a native binary')), null);
  assert.throws(() => inspectPe(Buffer.from('MZ')), /WINDOWS_NATIVE_BOUNDS_INVALID/u);
  assert.throws(() => inspectPe(pe({ machine: 0xaa64 })), /ARCHITECTURE_INVALID/u);
  assert.throws(() => inspectPe(pe({ imports: ['../vcruntime140.dll'] })), /IMPORT_NAME_INVALID/u);
  assert.throws(() => verifyWindowsNativeContract(entries(Buffer.from('not PE')), policy), /BINARY_INVALID/u);
  const unsupportedDelay = pe({ delayed: ['kernel32.dll'] }); unsupportedDelay.writeUInt32LE(0, 0x800);
  assert.throws(() => inspectPe(unsupportedDelay), /DELAY_ATTRIBUTES_INVALID/u);
  const noTerminator = pe(); noTerminator.writeUInt32LE(20, 0x98 + 116 + 8);
  assert.throws(() => inspectPe(noTerminator), /IMPORT_TERMINATOR_MISSING/u);
  const unbacked = pe(); unbacked.writeUInt32LE(0x100, 0x188 + 16);
  assert.throws(() => inspectPe(unbacked), /RVA_UNBACKED/u);
  const truncated = pe().subarray(0, 0x2100);
  assert.throws(() => inspectPe(truncated), /BOUNDS_INVALID/u);
});

test('real host Node PE is inspectable on supported Windows x64 without starting another process',
  { skip: process.platform !== 'win32' || process.arch !== 'x64' }, () => {
    const native = inspectPe(fs.readFileSync(process.execPath));
    assert.equal(native.architecture, 'x64');
    assert.ok(native.imports.includes('kernel32.dll'));
  });

test('Windows build and ZIP gates enforce the same policy without changing macOS flags', () => {
  const crate = path.join(root, 'apps/datasecure-standalone/tauri-contract');
  const config = fs.readFileSync(path.join(crate, '.cargo/config.toml'), 'utf8');
  assert.match(config, /^\[target\.x86_64-pc-windows-msvc\]/mu);
  assert.match(config, /target-feature=\+crt-static/u);
  assert.doesNotMatch(config, /aarch64-apple-darwin|x86_64-apple-darwin|\[build\]/u);
  const guard = fs.readFileSync(path.join(crate, 'build.rs'), 'utf8');
  assert.match(guard, /CARGO_CFG_TARGET_OS"\)\.as_deref\(\) == Ok\("windows"\)/u);
  assert.match(guard, /CARGO_CFG_TARGET_FEATURE/u);
  assert.match(guard, /WINDOWS_NATIVE_STATIC_CRT_REQUIRED/u);
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/release-evidence.yml'), 'utf8');
  assert.match(workflow, /npm run build:standalone:windows/u);
  assert.doesNotMatch(workflow, /cargo build --manifest-path apps\/datasecure-standalone\/tauri-contract/u);
  const npmBuild = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).scripts['build:standalone:windows'];
  assert.match(npmBuild, /cd apps\/datasecure-standalone\/tauri-contract && cargo build --release --locked/u);
  for (const file of ['scripts/build-standalone-package.mjs', 'scripts/verify-standalone-package.mjs']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /verifyWindowsNativeContract/u);
    assert.match(source, /verifyWindowsCrtPolicy/u);
    assert.match(source, /WINDOWS-NATIVE-EVIDENCE\.json/u);
  }
});
