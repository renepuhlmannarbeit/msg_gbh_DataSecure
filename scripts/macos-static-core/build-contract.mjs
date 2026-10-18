// Versioned Mac static-core producer contracts; measurements never approve artifacts.
import { createHash } from 'node:crypto';
import path from 'node:path';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const fail = code => { throw Object.assign(Error(code), { code }); };
export const PINS = Object.freeze({
  'node-v22.23.2.tar.xz': 'bbe768df8d5815d7fa76124052985332452e0a4742d39f32027550d1aab8f6fb',
  'macos-core-source.mjs': '931d45d99bc11b96b5dd3bf7cf78ebdd942a59080a436be3a8372b42b45fb4a4',
  'inputs/ownership-guard.c': 'c1a46654683e14c38d01adc7fd783047af0532eccf8356ca187b783fcd5438f1',
  'inputs/ownership-guard-link.cc': 'd08ad564c1978b8af425b0b6159860ef99817fcd7e0cf2bb5bf020f57b673c5e',
  'inputs/ownership-guard-link.h': 'a6e63701421b23f70a1440ad63f3a13337597f48efeb0b048acfe4c75701a2e7',
});
export const REPOSITORY_INPUTS = Object.freeze({
  'macos-core-source.mjs': 'native/runtime/macos-core-source.mjs',
  'inputs/ownership-guard.c': 'native/ownership-guard/ownership-guard.c',
  'inputs/ownership-guard-link.cc': 'native/ownership-guard/macos-static-link.cc',
  'inputs/ownership-guard-link.h': 'native/ownership-guard/macos-static-link.h',
});
export const PATCHED = Object.freeze({
  'src/api/environment.cc': '61efdad541b3b0730a08da31e0eeb64e94f8c2249b234d03fd2efd17e7bb9d96',
  'node.gyp': 'f7ef9762e798fc9ef3da2dd901b30d01cceb0e004a6bc34573fcffa7fd2cef33',
  'src/datasecure/ownership-guard.c': 'c4061e7fa7a02660e48a8e36a22c1b5220c5a2242771c8579470155ee7dfd8d8',
  'src/datasecure/ownership-guard-link.cc': PINS['inputs/ownership-guard-link.cc'],
  'src/datasecure/ownership-guard-link.h': PINS['inputs/ownership-guard-link.h'],
});
export const BUILD_SOURCE_PINS = Object.freeze({
  'BUILDING.md': '947d7b5e88529d7d7fed6c7872f12c7f38d2acf4b98427c1fbe7f968b2e989b0',
  'configure': 'd06bfb3f2be55c2a148df748d96c4ad65561697832cf14c6e431596d5c9a9281',
  'configure.py': '9ae98ce309ca866955c4860cc2e0f664d15ac326e9401523973ee4ee1c012984',
  'Makefile': '755a6837f6b92c9968d4ad63facd866dc25049328212ca1b63848827a69830a2',
  'tools/gyp_node.py': '54c1c5be752c39a2fd5ec237e76a2abc93ee63a9a674042f695b4e2f683d357b',
  'tools/gyp/pylib/gyp/__init__.py': 'a7333a360f53319d1992bc3d71a010ef5a02effb23b93ecfd8be75edf5716065',
  'tools/gyp/pylib/gyp/generator/compile_commands_json.py': '4b4be68b5e9c8d2392ad81ff7ec3d16204876cf6e553c83e003a37b307c19a5f',
  'deps/icu-small/README-FULL-ICU.txt': 'fb447b137c8a206a11455194dd34bc8d759b6a25d14fd1d16b7cfde341b72407',
});
// Independently fixed official release archive pins, also present in the
// already-local rc158 SHASUMS256 snapshot. Never read a caller manifest as pin.
export const CONVERTER_PINS = Object.freeze({
  arm64: '61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6',
  x64: '58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026',
});
export function verifyBytes(name, bytes, expected) {
  if (!Buffer.isBuffer(bytes) || !/^[a-f0-9]{64}$/u.test(expected || '') || sha256(bytes) !== expected)
    fail(`INPUT_SHA256_MISMATCH:${name}`);
  return bytes;
}
export function cleanPosix(value, label) {
  if (typeof value !== 'string' || !/^\/[A-Za-z0-9_./-]+$/u.test(value) ||
      value === '/' || path.posix.normalize(value) !== value || value.split('/').some(part => part === '..' || part === '.'))
    fail(`UNSAFE_POSIX_PATH:${label}`);
  return value;
}
export function appleToolInvocation(role, invocation, realpath, developer) {
  const expected = { clang: 'clang', clangxx: 'clang++', ar: 'ar', nm: 'nm', lipo: 'lipo', otool: 'otool' }[role];
  if (!expected || typeof invocation !== 'string' || path.posix.basename(invocation) !== expected)
    fail('APPLE_TOOL_INVOCATION_ROLE_MISMATCH');
  cleanPosix(developer, 'developer');
  const cleanToolPath = (value, label) => {
    // '+' is permitted ONLY in the exact clang++ basename for the CXX role,
    // never generally in paths, directory components, or command arguments.
    if (role === 'clangxx' && typeof value === 'string' && path.posix.basename(value) === 'clang++') {
      const parent = cleanPosix(path.posix.dirname(value), label);
      if (value !== parent + '/clang++') fail(`UNSAFE_POSIX_PATH:${label}`);
      return value;
    }
    return cleanPosix(value, label);
  };
  cleanToolPath(invocation, 'tool-invocation:' + role);
  cleanToolPath(realpath, 'tool-realpath:' + role);
  for (const value of [invocation, realpath]) {
    if (!value.startsWith(developer + '/') && !value.startsWith('/usr/bin/')) fail('TOOL_OUTSIDE_SELECTED_APPLE_TOOLCHAIN');
  }
  // Preserve argv[0]'s C++ driver spelling. A symlink's target path is identity
  // evidence only, not the executable invocation supplied to CXX/CXX_host.
  return Object.freeze({ role, invocation, realpath });
}
export function parseArguments(argv) {
  const [mode, ...args] = argv;
  if (!['check-source', 'plan', 'build'].includes(mode)) fail('MODE_INVALID');
  const allowed = new Set(['role', 'arch', 'source-archive', 'repository', 'output-parent', 'job-name', 'jobs', 'python', 'python-sha256', 'converter-archive']);
  const options = Object.create(null);
  for (const arg of args) {
    const match = /^--([a-z][a-z0-9-]*)=(.+)$/u.exec(arg);
    if (!match || !allowed.has(match[1]) || Object.hasOwn(options, match[1])) fail('ARGUMENT_UNKNOWN_DUPLICATE_OR_MALFORMED');
    options[match[1]] = match[2];
  }
  if (options.role !== 'mutating-core') fail('ROLE_MUST_BE_MUTATING_CORE');
  if (!['arm64', 'x64'].includes(options.arch)) fail('ARCH_INVALID');
  if (!options['source-archive'] || !path.isAbsolute(options['source-archive'])) fail('SOURCE_ARCHIVE_MUST_BE_ABSOLUTE');
  if (path.basename(options['source-archive']) !== 'node-v22.23.2.tar.xz') fail('SOURCE_ARCHIVE_NAME_INVALID');
  if (!options.repository || !path.isAbsolute(options.repository)) fail('REPOSITORY_MUST_BE_ABSOLUTE');
  if (mode === 'check-source') {
    if (Object.keys(options).some(key => !['role', 'arch', 'source-archive', 'repository'].includes(key))) fail('CHECK_SOURCE_ARGUMENT_INVALID');
  } else {
    for (const key of ['source-archive', 'repository', 'output-parent', 'python', 'converter-archive']) cleanPosix(options[key], key);
    if (options['job-name'] !== 'macos-' + options.arch) fail('JOB_NAME_MUST_MATCH_CONSUMER_TARGET');
    if (options['output-parent'] !== options.repository + '/dist/macos-static-core') fail('CONSUMER_OUTPUT_LOCATION_INVALID');
    if (!/^[1-4]$/u.test(options.jobs || '')) fail('JOBS_MUST_BE_1_TO_4');
    if (!/^[a-f0-9]{64}$/u.test(options['python-sha256'] || '')) fail('PYTHON_PIN_REQUIRED');
    const expected = `node-v22.23.2-darwin-${options.arch}.tar.gz`;
    if (path.posix.basename(options['converter-archive']) !== expected) fail('OFFICIAL_CONVERTER_ARCHIVE_ROLE_MISMATCH');
    const job = path.posix.join(options['output-parent'], options['job-name']);
    for (const key of ['source-archive', 'repository', 'python', 'converter-archive']) {
      if (options[key] === job || options[key].startsWith(job + '/')) fail('INPUT_OUTPUT_ROLE_OVERLAP');
    }
  }
  return Object.freeze({ mode, ...options });
}
const hostileEnvironment = /(?:FLAGS$|^NODE_|^DYLD_|^LD_|^GYP_|^PYTHON|^V8_|^MAKE|^MFLAGS$|^CC$|^CXX$|^CPP$|^AR$|^LD$|^NM$|^CROSS_|^npm_|^NPM_)/u;
export function assertAmbient(environment, execArgv) {
  if (!Array.isArray(execArgv) || execArgv.length) fail('DRIVER_NODE_EXECARGV_FORBIDDEN');
  if (Object.keys(environment).some(key => hostileEnvironment.test(key) || ['SDKROOT', 'DEVELOPER_DIR', 'MACOSX_DEPLOYMENT_TARGET'].includes(key)))
    fail('AMBIENT_BUILD_OVERRIDE_FORBIDDEN');
}
export function assertNativeHost(facts, arch) {
  if (facts.platform !== 'darwin') fail('NATIVE_DARWIN_HOST_REQUIRED');
  if (facts.nodeVersion !== 'v22.23.2' || facts.nodeArch !== arch) fail('DRIVER_NODE_VERSION_OR_ARCH_MISMATCH');
  const machine = arch === 'arm64' ? 'arm64' : 'x86_64';
  if (facts.machine !== machine || facts.pythonMachine !== machine || facts.translated !== 0) fail('CROSS_OR_TRANSLATED_BUILD_FORBIDDEN');
  if (!Number.isInteger(facts.xcodeMajor) || facts.xcodeMajor < 16) fail('XCODE16_PROFILE_REQUIRED');
  if (!/^Apple clang version /u.test(facts.clangVersion || '')) fail('APPLE_CLANG_REQUIRED');
  // Narrow native provisioning profile, not all versions Configure accepts.
  if (!/^3\.(?:13|14)\./u.test(facts.pythonVersion || '')) fail('PYTHON_VERSION_UNSUPPORTED');
}
export function assertBuildCapacity(memoryBytes, jobs) {
  // Upstream's 8GB recommendation is for four simultaneous compilers, not a
  // runtime ABI/security requirement. Standard hosted ARM Macs have 7GB.
  // Permit those only with a single compiler; never turn an undersized host
  // into implicit parallelism or change swap/system policy to force a build.
  const gib = 1024 ** 3;
  if (!Number.isSafeInteger(memoryBytes) || memoryBytes < 6 * gib ||
      !/^[1-4]$/u.test(String(jobs)) || memoryBytes < 8 * gib && String(jobs) !== '1')
    fail('MEMORY_AND_PARALLELISM_PROFILE_UNSUPPORTED');
  return Object.freeze({ memory_bytes: memoryBytes, jobs: Number(jobs),
    profile: memoryBytes < 8 * gib ? 'serial_low_memory' : 'standard' });
}
export function childEnvironment(job, tools) {
  // Deliberate allowlist, not a spread of process.env. HOME/USERPROFILE are
  // absent; GYP_CONFIG_DIR is an explicitly new empty private directory.
  return Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC',
    TMPDIR: job + '/tmp', GYP_CONFIG_DIR: job + '/gyp-config',
    PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1',
    CC: tools.clang, CXX: tools.clangxx, CC_host: tools.clang, CXX_host: tools.clangxx,
    AR: tools.ar, NM: tools.nm, DEVELOPER_DIR: tools.developer, SDKROOT: tools.sdk,
    MACOSX_DEPLOYMENT_TARGET: '11.0' });
}
export function commandPlan(options, tools) {
  const job = path.posix.join(options['output-parent'], options['job-name']);
  const source = job + '/source/node-v22.23.2';
  return Object.freeze({ schema: 'datasecure-mac-static-core-build-plan/1', role: 'mutating-core',
    target: `darwin-${options.arch}`, source, job,
    configure: { executable: options.python, args: ['-E', '-s', './configure', `--dest-cpu=${options.arch}`,
      '--dest-os=mac', '--no-cross-compiling', '--use_clang', '--with-intl=full-icu', '--download=none', '-C',
      `--config-dir=${job}/gyp-config`], cwd: source },
    make: { executable: '/usr/bin/make', args: [`-j${options.jobs}`, 'V=1', `PYTHON=${options.python}`, 'node'], cwd: source },
    output: job + '/datasecure-core',
    final_manifest: job + '/FINAL-CORE.json', provenance: job + '/BUILD-PROVENANCE.json',
    final_sealing: { before_cargo: true, identity: '-', hardened_runtime: true,
      entitlements: { 'com.apple.security.cs.allow-jit': true }, later_core_mutation: false },
    converter: job + `/official-converter/node-v22.23.2-darwin-${options.arch}/bin/node`,
    environment: childEnvironment(job, tools),
    product_trusted_attestation: false, mac_runtime_certified: false });
}
// Parse the literal shell quoting emitted by the pinned compile-db generator;
// never execute this text. Shell expansions/operators are rejected, not run.
export function compilerWords(command) {
  if (typeof command !== 'string' || /[$`\r\n;&|<>]/u.test(command)) fail('COMPILE_DB_COMMAND_UNSAFE');
  const words = []; let word = '', quote = '', active = false;
  for (let index = 0; index < command.length; index++) {
    const character = command[index];
    if (character === '\\' && quote !== "'") { if (++index === command.length) fail('COMPILE_DB_QUOTING_INVALID'); word += command[index]; active = true; }
    else if (quote) { if (character === quote) quote = ''; else word += character; active = true; }
    else if (character === "'" || character === '"') { quote = character; active = true; }
    else if (/\s/u.test(character)) { if (active) { words.push(word); word = ''; active = false; } }
    else { word += character; active = true; }
  }
  if (quote) fail('COMPILE_DB_QUOTING_INVALID');
  if (active) words.push(word);
  return words;
}
export function checkCompileDatabase(database, source) {
  if (!Array.isArray(database) || database.length > 100000) fail('COMPILE_DB_INVALID');
  const wanted = ['src/datasecure/ownership-guard.c', 'src/datasecure/ownership-guard-link.cc', 'src/api/environment.cc'];
  const checked = [];
  for (const name of wanted) {
    const matches = database.filter(record => record?.file === source + '/' + name);
    if (matches.length !== 1) fail('COMPILE_DB_TARGET_MISSING_OR_DUPLICATED');
    const words = compilerWords(matches[0].command);
    if (!words.includes('-DDATASECURE_OWNERSHIP_STATIC=1')) fail('STATIC_HOOK_DEFINE_MISSING');
    if (name.includes('/datasecure/')) {
      if (!words.includes('-DNAPI_VERSION=8') || words.some(word => /^-D(?:NAPI_EXPERIMENTAL|BUILDING_NODE_EXTENSION|NODE_SHARED_MODE)(?:=|$)/u.test(word))) fail('GUARD_COMPILE_ABI_INVALID');
      if (name.endsWith('.c') && !words.includes('-std=c11')) fail('GUARD_C11_REQUIRED');
    }
    checked.push({ file: name, words });
  }
  return checked;
}
export function checkConfiguredVariables(variables, arch) {
  if (!variables || variables.node_shared !== 'false' || variables.target_arch !== arch || variables.host_arch !== arch ||
      variables.node_target_type !== 'executable' || variables.want_separate_host_toolset !== 0 || variables.icu_small !== 'false')
    fail('CONFIGURED_CORE_LAYOUT_INVALID');
}
export function assertRoleSeparation(core, converter) {
  if (core.path === converter.path || core.sha256 === converter.sha256 ||
      (core.dev === converter.dev && core.ino === converter.ino)) fail('CORE_CONVERTER_ROLE_COLLISION');
}
