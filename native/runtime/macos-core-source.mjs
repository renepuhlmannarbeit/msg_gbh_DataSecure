// Deterministic source transforms, not a compiler or product trust loader.
import { createHash } from 'node:crypto';
export const VERSION = '22.23.2';
export const ARCHIVE_SHA256 = 'bbe768df8d5815d7fa76124052985332452e0a4742d39f32027550d1aab8f6fb';
export const GUARD_SHA256 = 'fc67b47255db619ccb95658d544a92190ac325760cecd9d6206db5189c206d1d';
export const SOURCE_SHA256 = Object.freeze({
  'src/api/environment.cc': '203fbbc587ff81566a9011374b2812ba84d313d218cb49d7fbf00e9f901e156f',
  'src/node.h': 'bc47b118a731e9663b145e4823ebc7f31237140d6ea95417519d894d7a0498cb',
  'src/node_api.h': '2d4560831e525b47b060ec8a0864ab73993df9e20215ce9f0fe7b24cd31af32a',
  'src/node_api.cc': '75a708e1667e8219663bd1ba63659f90c43618bcd3d24a298efbce607fc77333',
  'src/node_worker.cc': '7961ab27981d1a231d72f4213ce3f6d7a7bff68ef085d9ece1522761332c18c1',
  'node.gyp': 'b7f1544d40de42a76c8c6c88a8615db560db43d05dbfeb3bcfca72e9f35d9aac',
  'common.gypi': '276374a2a16ea6a31fda5e702383061e9ad622d5179d3b3edd2d5c393623e27b',
  'lib/internal/bootstrap/realm.js': 'bd8fcaf6ba0938f776833aa764ded021df9c1dd5ae41094e08147f7cb4fb2ad2',
  'lib/internal/process/pre_execution.js': '2ce1ff6536d196e772e2c83a0ba5b8f5c23c89d183181cd993ad0a7a990413df',
});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw Object.assign(Error(code), { code }); };
export function validateArchive(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 128 * 1024 * 1024 || sha256(bytes) !== ARCHIVE_SHA256)
    fail('NODE_ARCHIVE_SHA256_MISMATCH');
}
export function unique(text, anchor, label) {
  const first = text.indexOf(anchor);
  if (first < 0 || text.indexOf(anchor, first + 1) >= 0) fail(`ANCHOR_NOT_UNIQUE:${label}`);
  return first;
}
const environmentBody = `MaybeLocal<Value> LoadEnvironment(Environment* env,
                                  StartExecutionCallback cb,
                                  EmbedderPreloadCallback preload) {
  env->InitializeLibuv();
  env->InitializeDiagnostics();
  if (preload) {
    env->set_embedder_preload(std::move(preload));
  }
  env->InitializeCompileCache();

  return StartExecution(env, cb);
}`;
const environmentHook = `#if defined(DATASECURE_OWNERSHIP_STATIC)
  RegisterDataSecureOwnershipGuard(env);
#endif

  return StartExecution(env, cb);`;
const libConditions = `      'conditions': [
        [ 'openssl_default_cipher_list!=""', {`;
const macDependency = `      'conditions': [
        [ 'OS=="mac"', {
          'defines': [ 'DATASECURE_OWNERSHIP_STATIC=1' ],
          'dependencies': [ 'datasecure_ownership_guard' ],
        }],
        [ 'openssl_default_cipher_list!=""', {`;
const targetBoundary = `    }, # node_lib_target_name
    { # fuzz_env`;
const privateTarget = `    }, # node_lib_target_name
    {
      'target_name': 'datasecure_ownership_guard',
      'type': 'none',
      'conditions': [
        [ 'OS=="mac"', {
          'type': 'static_library',
          'include_dirs': [ 'src', 'deps/v8/include', 'deps/uv/include' ],
          'defines': [ 'DATASECURE_OWNERSHIP_STATIC=1', 'NAPI_VERSION=8' ],
          'cflags_c': [ '-std=c11' ],
          'xcode_settings': { 'GCC_C_LANGUAGE_STANDARD': 'c11' },
          'sources': [
            'src/datasecure/ownership-guard.c',
            'src/datasecure/ownership-guard-link.cc',
            'src/datasecure/ownership-guard-link.h',
          ],
        }],
      ],
    }, # datasecure_ownership_guard
    { # fuzz_env`;
const dynamicRegistration = 'NAPI_MODULE(ownership_guard, initialize)';
const staticRegistration = `#if defined(DATASECURE_OWNERSHIP_STATIC)
#if !defined(__APPLE__) || defined(_WIN32)
#error The static ownership initializer is macOS-only
#endif
#if NAPI_VERSION != 8 || defined(NAPI_EXPERIMENTAL)
#error The static ownership initializer requires stable Node-API 8
#endif
napi_value datasecure_ownership_guard_napi_init(napi_env env, napi_value exports) {
  return initialize(env, exports);
}
#else
NAPI_MODULE(ownership_guard, initialize)
#endif`;
export function plan(sources, guard, templates) {
  // All facts are checked against the extracted raw sources, not line numbers.
  const environment = sources['src/api/environment.cc'].toString('utf8');
  const gyp = sources['node.gyp'].toString('utf8');
  const guardText = guard.toString('utf8');
  if (environment.includes('RegisterDataSecureOwnershipGuard') || gyp.includes("'target_name': 'datasecure_ownership_guard'"))
    fail('SOURCE_ALREADY_PATCHED');
  unique(environment, environmentBody, 'full LoadEnvironment body');
  unique(environment, '#include "node.h"\n#include "node_builtins.h"', 'environment include');
  unique(gyp, libConditions, 'libnode conditions');
  unique(gyp, targetBoundary, 'libnode target boundary');
  unique(guardText, dynamicRegistration, 'current guard registration');
  for (const [name, digest] of Object.entries(SOURCE_SHA256)) {
    if (!Buffer.isBuffer(sources[name]) || sha256(sources[name]) !== digest) fail(`SOURCE_SHA256_MISMATCH:${name}`);
  }
  if (sha256(guard) !== GUARD_SHA256) fail('GUARD_SHA256_MISMATCH');
  const header = sources['src/node.h'].toString('utf8');
  unique(header, `NODE_EXTERN void AddLinkedBinding(
    Environment* env,
    const char* name,
    napi_addon_register_func fn,
    int32_t module_api_version = NODE_API_DEFAULT_MODULE_API_VERSION);`, 'N-API AddLinkedBinding overload');
  unique(sources['src/node_api.cc'].toString('utf8'), 'node_napi_env__::New(context, module_filename, module_api_version);', 'per-module napi_env');
  unique(sources['src/node_worker.cc'].toString('utf8'), `LoadEnvironment(env_.get(),
                            StartExecutionCallback{},
                            std::move(embedder_preload_))`, 'normal Worker LoadEnvironment');
  unique(sources['lib/internal/bootstrap/realm.js'].toString('utf8'), 'process._linkedBinding = function _linkedBinding(module)', 'linked binding JS entrance');
  unique(sources['lib/internal/process/pre_execution.js'].toString('utf8'), '    loadPreloadModules();', 'normal --require preloads');
  // Keep NAPI_EXPERIMENTAL from libnode away from the C/adapter target. Its own
  // small static-library target has only stable N-API 8 and C11, and no addons.
  const changes = new Map([
    ['src/api/environment.cc', environment
      .replace('#include "node.h"\n#include "node_builtins.h"', '#include "node.h"\n#if defined(DATASECURE_OWNERSHIP_STATIC)\n#include "datasecure/ownership-guard-link.h"\n#endif\n#include "node_builtins.h"')
      .replace(environmentBody, environmentBody.replace('  return StartExecution(env, cb);', environmentHook))],
    ['node.gyp', gyp.replace(libConditions, macDependency).replace(targetBoundary, privateTarget)],
    ['src/datasecure/ownership-guard.c', guardText.replace(dynamicRegistration, staticRegistration)],
    ['src/datasecure/ownership-guard-link.cc', templates.cc],
    ['src/datasecure/ownership-guard-link.h', templates.h],
  ]);
  if (!changes.get('src/api/environment.cc').includes('  return StartExecution(env, cb);')) fail('NORMAL_CLI_START_REMOVED');
  return changes;
}

export function expectedPreparedPins(guard, templates) {
  if (sha256(guard) !== GUARD_SHA256) fail('GUARD_SHA256_MISMATCH');
  const text = guard.toString('utf8');
  unique(text, dynamicRegistration, 'current guard registration');
  return {
    'src/api/environment.cc': '61efdad541b3b0730a08da31e0eeb64e94f8c2249b234d03fd2efd17e7bb9d96',
    'node.gyp': 'f7ef9762e798fc9ef3da2dd901b30d01cceb0e004a6bc34573fcffa7fd2cef33',
    'src/datasecure/ownership-guard.c': sha256(text.replace(dynamicRegistration, staticRegistration)),
    'src/datasecure/ownership-guard-link.cc': sha256(templates.cc),
    'src/datasecure/ownership-guard-link.h': sha256(templates.h),
  };
}
