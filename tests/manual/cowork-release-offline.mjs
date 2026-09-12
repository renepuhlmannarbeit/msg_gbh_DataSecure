// Offline integration of the actual builder -> native verifier -> UAT -> SPDX
// pipeline. Uses the locally attested Windows runtime; no downloads, Actions,
// production data or changes to the caller's git history.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {collectProductFiles} from '../../scripts/lib/product-files.mjs';
import {collectFiles} from '../../scripts/lib/zip.mjs';
import {digest} from '../../scripts/lib/cowork-candidate.mjs';

const root = path.resolve(import.meta.dirname, '../..');
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('WINDOWS_X64_REQUIRED');
const parent = path.join(root, 'dist');
const runtime = path.join(parent, 'windows-x64');
assert.ok(fs.statSync(path.join(runtime,'runtime-evidence.json')).isFile(), 'attested runtime required');
const workspace = fs.mkdtempSync(path.join(parent, '.tmp-cowork-release-integration-'));
function copy(relative) {
  const source = path.join(root,relative), destination = path.join(workspace,relative);
  assert.ok(fs.lstatSync(source).isFile(), relative);
  fs.mkdirSync(path.dirname(destination), {recursive:true});
  fs.copyFileSync(source,destination);
}
function run(command,args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)));
  const arguments_ = command === 'git' ? ['-c',`core.hooksPath=${path.join(workspace,'no-hooks')}`,...args] : args;
  return execFileSync(command,arguments_,{cwd:workspace,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:240000});
}
function node(...args) {return run(process.execPath,args);}
function removeOwnedTree(directory) {
  assert.equal(path.dirname(workspace),parent);
  assert.ok(directory === workspace || directory.startsWith(workspace+path.sep));
  assert.ok(fs.lstatSync(directory).isDirectory() && !fs.lstatSync(directory).isSymbolicLink());
  for (const item of fs.readdirSync(directory)) {
    const file=path.join(directory,item), stat=fs.lstatSync(file);
    assert.ok(!stat.isSymbolicLink(), 'test cleanup must not traverse links');
    if(stat.isDirectory()) removeOwnedTree(file);
    else {assert.ok(stat.isFile());fs.unlinkSync(file);}
  }
  fs.rmdirSync(directory);
}
try {
  for (const base of ['scripts','support','docs/acceptance/UAT_TEST_KIT/tools','evals','tests/lib']) {
    for(const file of collectFiles(path.join(root,base))) copy(`${base}/${file.archivePath}`);
  }
  for(const file of collectProductFiles(path.join(root,'plugins/data-secure'))) copy(`plugins/data-secure/${file.archivePath}`);
  for(const relative of ['package.json','BUILD_INFO.json','native/runtime/runtime-contract.json',
    'native/runtime/datasecure-node','native/windows/datasecure-sandbox.cpp','tests/helpers.js',
    'tests/test-contract-skill-acceptance.js','tests/test-contract-skill-matrix.js','benchmarks/contract-corpus.js']) copy(relative);
  fs.writeFileSync(path.join(workspace,'.gitignore'),'dist/\n');
  run('git',['init','-q']);run('git',['add','.']);
  run('git',['-c','user.name=DataSecure Test','-c','user.email=test@example.invalid',
    '-c','commit.gpgsign=false','commit','-qm','Isolated current-source release test']);
  const commit=run('git',['rev-parse','HEAD']).trim();
  const version=JSON.parse(fs.readFileSync(path.join(workspace,'package.json'))).version;
  const normal=`dist/DataSecure-Privacy-Preflight-windows-x64-v${version}.zip`;
  const debug=`dist/DataSecure-Privacy-Preflight-windows-x64-debug-v${version}.zip`;
  const uat=`dist/DataSecure-Cowork-UAT-Evidence-v${version}.zip`;
  for(const args of [[],['--support']]) {
    console.log(`Building ${args.length?'debug':'normal'} from isolated clean commit`);
    node('--input-type=module','-e',
      "import {buildRuntimePlugin} from './scripts/build-runtime-plugin.mjs'; " +
      "buildRuntimePlugin({runtimesRoot:process.argv[1],targetId:'windows-x64',supportMode:process.argv[2]==='debug'});",
      parent,args.length?'debug':'normal');
  }
  console.log('Actual native verification of both ZIPs and UAT creation');
  node('scripts/build-cowork-uat-evidence.mjs','--candidate-commit',commit,'--normal-zip',normal,'--debug-zip',debug);
  console.log('Final SPDX and checksum inventory');
  node('scripts/generate-sbom.mjs','--archive',normal,'--archive',debug,'--cowork-uat',uat);
  const sums=fs.readFileSync(path.join(workspace,'dist/SHA256SUMS'),'utf8').trim().split('\n');
  assert.equal(sums.length,4,'normal, debug, UAT and SPDX all inventoried');
  for(const entry of sums) {
    const [sha,name]=entry.split('  ');
    assert.equal(digest(fs.readFileSync(path.join(workspace,'dist',name))),sha);
  }
  assert.equal(run('git',['status','--porcelain']).trim(),'');
  console.log('PASS: actual normal/debug native smokes, exact UAT binding and four-file inventory; not release or human UAT evidence.');
} catch(error) {
  if(error.stdout) process.stderr.write(String(error.stdout));
  if(error.stderr) process.stderr.write(String(error.stderr));
  throw error;
} finally {removeOwnedTree(workspace);}
