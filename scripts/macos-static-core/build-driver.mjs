// Versioned producer, not artifact approval. Non-Darwin may inspect source only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readProducerFileBounded, readProducerFileRecord, revalidateProducerFileRecord, rewriteProducerFileRecord,
  syncProducerFileRecord, syncProducerDirectory, writeProducerFresh, producerFileObservation, producerIoFailure, runProducerBuildStep, producerProcessFailure,
  runProducerTool, producerToolFailure } from './producer-io-lifecycle.mjs';
import { PINS, REPOSITORY_INPUTS, PATCHED, BUILD_SOURCE_PINS, CONVERTER_PINS, sha256, fail, verifyBytes, cleanPosix, appleToolInvocation,
  parseArguments, assertAmbient, assertNativeHost, commandPlan, checkCompileDatabase,
  checkConfiguredVariables, assertRoleSeparation } from './build-contract.mjs';
import { MAX_CORE_BYTES, ENTITLEMENTS_XML, canonicalBytes, finalSealPlan, assertSealDetails,
  assertFinalMachO, finalInputHashes, buildFinalRecords } from './final-core-contract.mjs';
const basicEnv = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C' });
const fileLimit = 128 * 1024 * 1024;
export const readFileBounded = readProducerFileBounded;
export function assertProducerRepository(repository, moduleUrl = import.meta.url, io = fs) {
  // Bind source paths, shared-reader observations and consumer output to this
  // exact checkout. The optional IO argument is a source-model seam only.
  const ownRoot = path.resolve(fileURLToPath(new URL('../../', moduleUrl)));
  const selected = path.resolve(repository);
  if (selected !== ownRoot || io.realpathSync.native(selected) !== io.realpathSync.native(ownRoot))
    fail('PRODUCER_REPOSITORY_MISMATCH');
  return selected;
}
export function verifySourceInputs(archive, repository) {
  const inputs = Object.create(null);
  for (const [name, pin] of Object.entries(PINS)) {
    const file = Object.hasOwn(REPOSITORY_INPUTS, name) ? path.join(repository, REPOSITORY_INPUTS[name]) : archive;
    inputs[name] = verifyBytes(name, readFileBounded(file), pin);
  }
  return inputs;
}
async function execRead(executable, args, signal, env = basicEnv, cwd = '/') {
  const result = await runProducerTool({ executable, args, cwd }, env,
    { signal, label: 'read', timeoutMs: 20000, maximum: 8 * 1024 * 1024 });
  return result.stdout.toString('utf8').trim();
}
function syncParent(file) { syncProducerDirectory(path.dirname(file)); }
function writeFresh(file, bytes, mode = 0o600) {
  writeProducerFresh(file, bytes, mode);
  syncParent(file);
}
function writeEvidence(job, name, value) { writeFresh(path.join(job, name), JSON.stringify(value, null, 2) + '\n'); }
function mkdirFresh(directory) { fs.mkdirSync(directory, { mode: 0o700 }); syncParent(directory); }
// Intentionally conservative prototype policy: no ACLs (even benign deny
// entries), redirects or group/other-writable ancestors; never repair them.
async function checkPrivateParent(parent, signal) {
  cleanPosix(parent, 'output-parent');
  const uid = BigInt(process.getuid());
  const components = parent.split('/').filter(Boolean);
  let current = '';
  for (let index = 0; index < components.length; index++) {
    current += '/' + components[index];
    const info = fs.lstatSync(current, { bigint: true });
    if (!info.isDirectory() || info.isSymbolicLink() || (info.uid !== 0n && info.uid !== uid) || (info.mode & 0o022n)) fail('OUTPUT_ANCESTOR_UNSAFE');
    const listing = await execRead('/bin/ls', ['-lde', current], signal);
    if (listing.split('\n').length !== 1 || /^\S*\+/u.test(listing)) fail('OUTPUT_ACL_UNSUPPORTED');
    if (index === components.length - 1 && (info.uid !== uid || (info.mode & 0o077n))) fail('OUTPUT_PARENT_NOT_PRIVATE');
  }
  if (fs.realpathSync.native(parent) !== parent) fail('OUTPUT_PARENT_REDIRECTED');
}
function ensureAbsent(file) { try { fs.lstatSync(file); fail('OUTPUT_ALREADY_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
const rosettaProbe = `import ctypes, errno, json, platform, sys
lib = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
fn = lib.sysctlbyname
fn.argtypes = [ctypes.c_char_p, ctypes.c_void_p, ctypes.POINTER(ctypes.c_size_t), ctypes.c_void_p, ctypes.c_size_t]
fn.restype = ctypes.c_int
value = ctypes.c_int(0)
size = ctypes.c_size_t(ctypes.sizeof(value))
result = fn(b'sysctl.proc_translated', ctypes.byref(value), ctypes.byref(size), None, 0)
missing = False
if result == -1:
    if ctypes.get_errno() != errno.ENOENT: raise RuntimeError('TRANSLATION_QUERY_FAILED')
    missing = True
    value.value = 0
if size.value != ctypes.sizeof(value) or value.value not in (0, 1): raise RuntimeError('TRANSLATION_QUERY_INVALID')
print(json.dumps({'translated': value.value, 'translation_key_absent': missing, 'machine': platform.machine(), 'python': platform.python_version()}))`;
// Detect observed tool drift. This is not atomic exec-by-handle: an immutable
// native tool namespace/SDK remains a separate required engineering gate.
const pythonProofs = new WeakMap();
export function capturePythonIdentity(options) {
  const record = readProducerFileRecord(options.python, 512 * 1024 * 1024);
  verifyBytes('explicit python tool', record.bytes, options['python-sha256']);
  const identity = Object.freeze({ path: options.python, sha256: options['python-sha256'] });
  pythonProofs.set(identity, { record, path: options.python, sha256: options['python-sha256'] });
  return identity;
}
export function revalidatePythonIdentity(options, identity) {
  const expected = identity && pythonProofs.get(identity);
  if (!expected || options.python !== expected.path || options['python-sha256'] !== expected.sha256)
    fail('PYTHON_IDENTITY_INVALID');
  const current = revalidateProducerFileRecord(expected.record);
  verifyBytes('explicit python tool', current.bytes, expected.sha256);
  return expected.sha256;
}
async function inspectTools(options, signal) {
  const developer = cleanPosix(await execRead('/usr/bin/xcode-select', ['-p'], signal), 'developer');
  const selected = { ...basicEnv, DEVELOPER_DIR: developer };
  const version = await execRead('/usr/bin/xcodebuild', ['-version'], signal, selected);
  const xcodeMajor = Number(/^Xcode (\d+)\./u.exec(version)?.[1]);
  const sdk = cleanPosix(await execRead('/usr/bin/xcrun', ['--sdk', 'macosx', '--show-sdk-path'], signal, selected), 'sdk');
  const tools = { developer, sdk, xcode: version, sdkVersion: await execRead('/usr/bin/xcrun', ['--sdk', 'macosx', '--show-sdk-version'], signal, selected) };
  const toolIdentities = Object.create(null);
  for (const [key, name] of [['clang', 'clang'], ['clangxx', 'clang++'], ['ar', 'ar'], ['nm', 'nm'], ['lipo', 'lipo'], ['otool', 'otool']]) {
    const invocation = await execRead('/usr/bin/xcrun', ['--sdk', 'macosx', '--find', name], signal, selected);
    const identity = appleToolInvocation(key, invocation, fs.realpathSync.native(invocation), developer);
    const digest = sha256(readFileBounded(identity.realpath, 512 * 1024 * 1024));
    if (fs.realpathSync.native(identity.invocation) !== identity.realpath) fail('APPLE_TOOL_IDENTITY_CHANGED');
    tools[key] = identity.invocation;
    toolIdentities[key] = { ...identity, sha256: digest };
  }
  tools.clangVersion = await execRead(tools.clang, ['--version'], signal, selected);
  const pythonIdentity = capturePythonIdentity(options);
  revalidatePythonIdentity(options, pythonIdentity);
  const arch = options.arch === 'arm64' ? 'arm64' : 'x86_64';
  const pythonFacts = JSON.parse(await execRead('/usr/bin/arch', ['-arch', arch, options.python, '-I', '-S', '-c', rosettaProbe], signal, selected));
  revalidatePythonIdentity(options, pythonIdentity);
  const machine = await execRead('/usr/bin/arch', ['-arch', arch, '/usr/bin/uname', '-m'], signal, selected);
  const facts = { platform: process.platform, nodeVersion: process.version, nodeArch: process.arch,
    machine, pythonMachine: pythonFacts.machine, translated: pythonFacts.translated,
    xcodeMajor, clangVersion: tools.clangVersion, pythonVersion: pythonFacts.python };
  assertNativeHost(facts, options.arch);
  const toolHashes = Object.create(null);
  for (const file of new Set(['/usr/bin/arch', '/usr/bin/make', '/usr/bin/tar', '/usr/bin/xcrun', '/usr/bin/xcodebuild', '/usr/bin/codesign', '/usr/bin/plutil', options.python])) {
    const real = fs.realpathSync.native(file);
    toolHashes[real] = file === options.python ? revalidatePythonIdentity(options, pythonIdentity) :
      sha256(readFileBounded(real, 512 * 1024 * 1024));
  }
  for (const identity of Object.values(toolIdentities)) {
    const real = fs.realpathSync.native(identity.invocation);
    if (real !== identity.realpath) fail('APPLE_TOOL_IDENTITY_CHANGED');
    const digest = sha256(readFileBounded(real, 512 * 1024 * 1024));
    if (digest !== identity.sha256) fail('APPLE_TOOL_IDENTITY_CHANGED');
    toolHashes[real] = digest;
  }
  revalidatePythonIdentity(options, pythonIdentity);
  return { tools, facts, pythonFacts, pythonIdentity, toolHashes, toolIdentities };
}
async function tarMembers(archive, prefix, signal) {
  const members = (await execRead('/usr/bin/tar', ['-tf', archive], signal)).split('\n');
  if (members.length < 2 || members.length > 100000 || members.some(name => !name.startsWith(prefix + '/') || /[\\:\r]|(^|\/)\.\.($|\/)/u.test(name)) || new Set(members).size !== members.length)
    fail('ARCHIVE_MEMBERS_UNSAFE_OR_DUPLICATED');
  return members;
}
async function prepareSource(job, inputs, signal) {
  // Import exactly the already hash-verified pure transform bytes, not a
  // neighboring path that could change between verification and execution.
  const ops = await import('data:text/javascript;base64,' + inputs['macos-core-source.mjs'].toString('base64'));
  const archive = job + '/inputs/node-v22.23.2.tar.xz';
  writeFresh(archive, inputs['node-v22.23.2.tar.xz']);
  const members = await tarMembers(archive, 'node-v22.23.2', signal);
  const listing = (await execRead('/usr/bin/tar', ['-tvf', archive], signal)).split('\n');
  if (listing.length !== members.length || listing.some(line => !/^[-d]/u.test(line))) fail('SOURCE_ARCHIVE_NONREGULAR_MEMBER');
  await runProducerTool({ executable: '/usr/bin/tar', args: ['-xf', archive, '-C', job + '/source'], cwd: job },
    basicEnv, { signal, label: 'source_extract', timeoutMs: 60000, maximum: 1024 * 1024 });
  const root = job + '/source/node-v22.23.2';
  const sourceRecords = Object.fromEntries(Object.keys(ops.SOURCE_SHA256).map(name =>
    [name, readProducerFileRecord(root + '/' + name)]));
  const sources = Object.fromEntries(Object.entries(sourceRecords).map(([name, record]) => [name, record.bytes]));
  for (const [name, pin] of Object.entries(BUILD_SOURCE_PINS)) verifyBytes(name, readFileBounded(root + '/' + name), pin);
  const changes = ops.plan(sources, inputs['inputs/ownership-guard.c'], {
    cc: inputs['inputs/ownership-guard-link.cc'].toString('utf8'), h: inputs['inputs/ownership-guard-link.h'].toString('utf8') });
  if (changes.size !== 5 || JSON.stringify([...changes.keys()]) !== JSON.stringify(Object.keys(PATCHED))) fail('PATCH_SET_CHANGED');
  for (const [name, value] of changes) verifyBytes(name, Buffer.from(value), PATCHED[name]);
  mkdirFresh(root + '/src/datasecure');
  for (const [name, value] of changes) {
    if (name.startsWith('src/datasecure/')) writeFresh(root + '/' + name, value);
    else {
      // Two verified upstream files in this invocation's fresh private tree.
      rewriteProducerFileRecord(sourceRecords[name], value);
      syncParent(root + '/' + name);
    }
  }
  return { root, members: members.length };
}
async function prepareConverter(job, options, bytes, signal) {
  const archive = job + `/inputs/node-v22.23.2-darwin-${options.arch}.tar.gz`;
  writeFresh(archive, bytes);
  const prefix = `node-v22.23.2-darwin-${options.arch}`;
  const members = await tarMembers(archive, prefix, signal);
  const root = job + '/official-converter/' + prefix;
  mkdirFresh(root); mkdirFresh(root + '/bin');
  // Official npm/npx symlinks are not extracted at all. Only two exact regular
  // archive members are materialized, never a patched source or built core.
  for (const name of ['bin/node', 'LICENSE']) {
    const member = prefix + '/' + name;
    if (!members.includes(member) || !/^-/u.test(await execRead('/usr/bin/tar', ['-tvf', archive, member], signal))) fail('CONVERTER_MEMBER_NOT_REGULAR');
    const result = await runProducerTool({ executable: '/usr/bin/tar', args: ['-xOf', archive, member], cwd: job },
      basicEnv, { signal, label: 'converter_extract', timeoutMs: 20000, maximum: fileLimit });
    const data = result.stdout;
    writeFresh(root + '/' + name, data, name === 'bin/node' ? 0o700 : 0o600);
  }
  return root + '/bin/node';
}
async function runBuildStep(step, env, job, label, signal) {
  const lifecycle = await runProducerBuildStep(step, env, job, label, signal);
  writeEvidence(job, label.toUpperCase() + '-PROCESS.json', lifecycle);
  return lifecycle;
}
function binaryRecord(file, maximum = MAX_CORE_BYTES) {
  return producerFileObservation(readProducerFileRecord(file, maximum));
}
async function candidateEvidence(core, converter, options, tools, env, signal) {
  const arch = await execRead(tools.lipo, ['-archs', core], signal, env);
  if (arch !== (options.arch === 'arm64' ? 'arm64' : 'x86_64')) fail('CORE_MACHO_ARCH_MISMATCH');
  const symbols = await execRead(tools.nm, ['-gU', core], signal, env);
  if (symbols.split('\n').filter(line => /\b_datasecure_ownership_guard_napi_init$/u.test(line)).length !== 1) fail('STATIC_INITIALIZER_SYMBOL_NOT_UNIQUE');
  const dependencies = await execRead(tools.otool, ['-L', core], signal, env);
  for (const line of dependencies.split('\n').slice(1)) {
    const dependency = /^\s+(\S+) \(/u.exec(line)?.[1];
    if (!dependency || (!dependency.startsWith('/usr/lib/') && !dependency.startsWith('/System/Library/Frameworks/'))) fail('NON_SYSTEM_CORE_DEPENDENCY');
  }
  const probe = `const methods=['createRoot','tryAcquire','assertHeld','release','closeRoot'];let binding=null;try{binding=process._linkedBinding('datasecure_ownership_guard')}catch{};console.log(JSON.stringify({version:process.version,arch:process.arch,abi:binding?.abi??null,methods:methods.every(key=>typeof binding?.[key]==='function')}))`;
  const coreProbe = JSON.parse(await execRead(core, ['-e', probe], signal, env));
  const converterProbe = JSON.parse(await execRead(converter, ['-e', probe], signal, env));
  if (coreProbe.version !== 'v22.23.2' || coreProbe.arch !== options.arch || coreProbe.abi !== 1 || coreProbe.methods !== true ||
      converterProbe.version !== 'v22.23.2' || converterProbe.arch !== options.arch || converterProbe.abi !== null || converterProbe.methods !== false) fail('CORE_CONVERTER_CAPABILITY_ROLE_INVALID');
  return { arch, symbols, dependencies, coreProbe, converterProbe };
}
export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  // Hard real-host gate BEFORE inputs, tools, directories or build subprocesses.
  // No CLI/env/test seam can pretend this process is Darwin.
  if (options.mode === 'build' && process.platform !== 'darwin') fail('NATIVE_DARWIN_HOST_REQUIRED');
  if (options.mode === 'build') {
    // Refuse a different process architecture before arch/Python could even
    // request a translated slice (or trigger Rosetta installation behavior).
    if (process.version !== 'v22.23.2' || process.arch !== options.arch) fail('DRIVER_NODE_VERSION_OR_ARCH_MISMATCH');
    assertAmbient(process.env, process.execArgv);
  }
  assertProducerRepository(options.repository);
  const inputs = verifySourceInputs(options['source-archive'], options.repository);
  if (options.mode === 'check-source') return { outcome: 'PINNED_SOURCE_INPUTS_MATCH', pins: PINS,
    source_only: true, build_started: false, product_trusted_attestation: false };
  if (options.mode === 'plan') return { outcome: 'PLAN_ONLY_NO_TOOLS_STARTED', host: process.platform,
    plan: commandPlan(options, { clang: 'RESOLVED_ON_NATIVE_DARWIN', clangxx: 'RESOLVED_ON_NATIVE_DARWIN',
      ar: 'RESOLVED_ON_NATIVE_DARWIN', nm: 'RESOLVED_ON_NATIVE_DARWIN', developer: 'RESOLVED_ON_NATIVE_DARWIN', sdk: 'RESOLVED_ON_NATIVE_DARWIN' }),
    build_started: false, native_preflight_pending: true };
  const abort = new AbortController();
  const cancel = () => abort.abort();
  let created = false, previousUmask, plan;
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    const pin = CONVERTER_PINS[options.arch];
    const converterBytes = verifyBytes('official converter archive', readFileBounded(options['converter-archive']), pin);
    const inspection = await inspectTools(options, abort.signal);
    await checkPrivateParent(options['output-parent'], abort.signal);
    if (os.totalmem() < 8 * 1024 ** 3) fail('EIGHT_GIB_MEMORY_PROFILE_REQUIRED');
    const space = fs.statfsSync(options['output-parent'], { bigint: true });
    if (space.bavail * space.bsize < 12n * 1024n ** 3n) fail('TWELVE_GIB_FREE_SPACE_REQUIRED');
    plan = commandPlan(options, inspection.tools);
    ensureAbsent(plan.job);
    if (abort.signal.aborted) fail('BUILD_ABORTED');
    previousUmask = process.umask(0o077);
    mkdirFresh(plan.job); created = true;
    await checkPrivateParent(plan.job, abort.signal);
    for (const part of ['inputs', 'source', 'tmp', 'gyp-config', 'official-converter']) mkdirFresh(plan.job + '/' + part);
    writeEvidence(plan.job, 'BUILD-INTENT.json', { schema: 'mac-cert-02-build-intent/1', plan, pins: PINS,
      converter_archive_sha256: pin, python_sha256: options['python-sha256'], inspection,
      driver_sha256: sha256(readFileBounded(fileURLToPath(import.meta.url))),
      contract_sha256: sha256(readFileBounded(new URL('./build-contract.mjs', import.meta.url))),
      final_contract_sha256: sha256(readFileBounded(new URL('./final-core-contract.mjs', import.meta.url))),
      process_contract_sha256: sha256(readFileBounded(new URL('../lib/macos-core-process-lifecycle.mjs', import.meta.url))),
      producer_helper_sha256: sha256(readFileBounded(new URL('./producer-io-lifecycle.mjs', import.meta.url))),
      bound_file_io_sha256: sha256(readFileBounded(path.join(options.repository, 'plugins/data-secure/server/core/bound-file-io.js'))),
      product_trusted_attestation: false, status: 'STARTED_NOT_TRUSTED' });
    const prepared = await prepareSource(plan.job, inputs, abort.signal);
    const converter = await prepareConverter(plan.job, options, converterBytes, abort.signal);
    const converterBefore = binaryRecord(converter);
    // The producer itself must be invoked with the matching official Node,
    // not a patched Core that could smuggle capabilities into the converter.
    if (sha256(readFileBounded(fs.realpathSync.native(process.execPath))) !== converterBefore.sha256) fail('DRIVER_NOT_OFFICIAL_MATCHING_NODE');
    writeEvidence(plan.job, 'PREPARED-SOURCE.json', { archive_members: prepared.members, patched: PATCHED, build_sources: BUILD_SOURCE_PINS, converter: converterBefore });
    revalidatePythonIdentity(options, inspection.pythonIdentity);
    const configureProcess = await runBuildStep(plan.configure, plan.environment, plan.job, 'configure', abort.signal);
    revalidatePythonIdentity(options, inspection.pythonIdentity);
    const configBytes = readFileBounded(prepared.root + '/config.gypi');
    const config = JSON.parse(configBytes.toString('utf8').replace(/^#[^\n]*\n/u, ''));
    checkConfiguredVariables(config.variables, options.arch);
    const database = readFileBounded(prepared.root + '/out/Release/compile_commands.json');
    const checked = checkCompileDatabase(JSON.parse(database), prepared.root);
    writeEvidence(plan.job, 'COMPILE-CONTRACT.json', { checked, config_sha256: sha256(configBytes), compile_database_sha256: sha256(database),
      note: 'Generated compile-db intent; actual compiler/link commands remain in make.log, not independently attested.' });
    revalidatePythonIdentity(options, inspection.pythonIdentity);
    const makeProcess = await runBuildStep(plan.make, plan.environment, plan.job, 'make', abort.signal);
    revalidatePythonIdentity(options, inspection.pythonIdentity);
    if (abort.signal.aborted) fail('BUILD_ABORTED');
    for (const [name, pin] of Object.entries(PATCHED)) verifyBytes(name, readFileBounded(prepared.root + '/' + name), pin);
    // The only Core mutation after compilation is this local final seal. Cargo
    // is deliberately NOT invoked by this producer; it must see these bytes.
    writeFresh(plan.output, readFileBounded(prepared.root + '/out/Release/node', MAX_CORE_BYTES), 0o700);
    const unsigned = binaryRecord(plan.output);
    const sealing = finalSealPlan(plan.output, plan.job);
    writeFresh(sealing.entitlements, ENTITLEMENTS_XML);
    const runSealTool = async (step, input) => {
      const result = await runProducerTool({ ...step, cwd: plan.job }, basicEnv,
        { signal: abort.signal, label: 'seal', input, timeoutMs: 20000, maximum: 1024 * 1024 });
      return result.stdout;
    };
    await runSealTool(sealing.sign);
    await runSealTool(sealing.verify);
    // codesign -dv writes details to stderr, not stdout. Capture both explicitly
    // and never treat an exit-zero signing command as proof of runtime flags.
    const detailResult = await runProducerTool({ executable: '/usr/bin/codesign', args: sealing.details.args, cwd: plan.job },
      basicEnv, { signal: abort.signal, label: 'seal_details', timeoutMs: 20000, maximum: 1024 * 1024 });
    const entitlementBytes = await runSealTool(sealing.entitlementsRead);
    const entitlements = JSON.parse((await runSealTool(sealing.plist, entitlementBytes)).toString('utf8'));
    assertSealDetails(detailResult.stderr.toString('utf8'), entitlements);
    const sealedRecord = readProducerFileRecord(plan.output, MAX_CORE_BYTES);
    assertFinalMachO(sealedRecord.bytes, options.arch);
    syncProducerFileRecord(sealedRecord);
    syncParent(plan.output);
    const core = binaryRecord(plan.output), converterAfter = binaryRecord(converter);
    if (converterAfter.sha256 !== converterBefore.sha256 || converterAfter.dev !== converterBefore.dev || converterAfter.ino !== converterBefore.ino) fail('OFFICIAL_CONVERTER_CHANGED');
    assertRoleSeparation(core, converterAfter);
    const checks = await candidateEvidence(plan.output, converter, options, inspection.tools, plan.environment, abort.signal);
    // Execution/probing may not alter the final bytes. No re-sealing or
    // re-attestation is permitted to hide later mutation.
    if (binaryRecord(plan.output).sha256 !== core.sha256 ||
        binaryRecord(converter).sha256 !== converterBefore.sha256) fail('FINAL_CORE_CHANGED_AFTER_SEAL');
    const finalInputs = finalInputHashes(verifySourceInputs(options['source-archive'], options.repository));
    const finalPrepared = Object.fromEntries(Object.entries(PATCHED).map(([name, pin]) =>
      [name, sha256(verifyBytes(name, readFileBounded(prepared.root + '/' + name), pin))]));
    const licenseBytes = readFileBounded(prepared.root + '/LICENSE', 2 * 1024 * 1024);
    writeFresh(plan.job + '/LICENSE.node.txt', licenseBytes);
    const pythonSha256 = revalidatePythonIdentity(options, inspection.pythonIdentity);
    const records = buildFinalRecords({
      arch: options.arch, jobs: options.jobs, inputs: finalInputs, prepared: finalPrepared,
      processLifecycle: { configure: configureProcess, make: makeProcess },
      toolchain: {
        xcode: inspection.tools.xcode.split('\n')[0], sdk: inspection.tools.sdkVersion,
        python: inspection.pythonFacts.python, clang: inspection.tools.clangVersion.split('\n')[0],
        python_sha256: pythonSha256, clang_sha256: inspection.toolIdentities.clang.sha256,
      },
      logs: { configure_sha256: sha256(readFileBounded(plan.job + '/configure.log')),
        make_sha256: sha256(readFileBounded(plan.job + '/make.log', 512 * 1024 * 1024)),
        compile_commands_sha256: sha256(database) },
      unsigned, core,
      converter: { ...converterAfter, archive_sha256: pin,
        license_sha256: sha256(readFileBounded(path.dirname(path.dirname(converter)) + '/LICENSE', 2 * 1024 * 1024)) },
      license: { bytes: licenseBytes.length, sha256: sha256(licenseBytes) },
    });
    writeFresh(plan.provenance, canonicalBytes(records.provenance));
    const evidence = { schema: 'mac-cert-02-candidate-build/1', status: 'SEALED_FINAL_BYTES_NOT_APPROVED', artifact_sha256: records.artifact_sha256,
      plan, pins: PINS, patched: PATCHED, converter_archive_sha256: pin, core, converter: converterAfter, checks,
      configure_log_sha256: sha256(readFileBounded(plan.job + '/configure.log')),
      make_log_sha256: sha256(readFileBounded(plan.job + '/make.log', 512 * 1024 * 1024)),
      product_trusted_attestation: false, mac_runtime_certified: false,
      // Child exit+close is not proof that every compiler descendant ended.
      process_lifecycle: records.provenance.process_lifecycle,
      group_end_confirmed: records.provenance.process_lifecycle.configure.group_end_confirmed &&
        records.provenance.process_lifecycle.make.group_end_confirmed,
      remaining: ['independent GYP/link-command review', 'CLI --require/fork/IPC/nested Workers',
        'real multi-process guard/crash/close/namespace tests', 'native process-tree abort supervision proof',
        'unsigned ZIP/DMG native launch', 'product Rust/loader/package trust integration'] };
    writeEvidence(plan.job, 'BUILD-CANDIDATE.json', evidence);
    // Last create-only commit marker. The four consumer files are complete;
    // approval remains empty unless an independent source review later pins it.
    await checkPrivateParent(plan.job, abort.signal);
    revalidatePythonIdentity(options, inspection.pythonIdentity);
    if (binaryRecord(plan.output).sha256 !== records.artifact.core.sha256)
      fail('FINAL_CORE_CHANGED_BEFORE_COMMIT');
    if (abort.signal.aborted) fail('BUILD_ABORTED');
    writeFresh(plan.final_manifest, canonicalBytes(records.artifact));
    return evidence;
  } catch (error) {
    const lifecycle = producerProcessFailure(error);
    const ioFailure = producerIoFailure(error);
    const toolFailure = producerToolFailure(error);
    // A diagnostic write is secondary and may itself fail (disk full/close).
    // Preserve the exact primary and leave every incomplete output untouched.
    if (created) {
      try { writeEvidence(plan.job, 'BUILD-FAILED.json', { schema: 'mac-cert-02-failure/1', code: error.code || 'BUILD_FAILED',
        ...(lifecycle ? { process: lifecycle } : {}), ...(ioFailure ? { io: ioFailure } : {}),
        ...(toolFailure ? { tool: toolFailure } : {}),
        outputs_preserved: true, product_trusted_attestation: false }); } catch { /* primary retained; evidence may be absent */ }
    }
    throw error;
  } finally {
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    if (previousUmask !== undefined) process.umask(previousUmask);
  }
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { console.log(JSON.stringify(await main())); }
  catch (error) { console.error(error.code || 'MAC_STATIC_CORE_BUILD_FAILED'); process.exitCode = 1; }
}
