// Explicit native CLI regression. No desktop, existing process adoption or cleanup.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
assert.equal(process.argv.length,2);assert.equal(process.platform,'win32');assert.equal(process.arch,'x64');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const source=path.join(root,'native/windows/datasecure-sandbox.cpp'),bytes=fs.readFileSync(source);
const fixture=fs.readFileSync(path.join(root,'tests/lib/native-launcher-wait.cpp'));
const directory=path.join(root,'dist',`native-launcher-wait-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`);
fs.mkdirSync(directory);
fs.writeFileSync(path.join(directory,'candidate-source.cpp'),bytes,{flag:'wx'});
fs.writeFileSync(path.join(directory,'wait-harness.cpp'),fixture,{flag:'wx'});
const install=execFileSync('C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe',
  ['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],
  {encoding:'utf8',windowsHide:true}).trim();assert.ok(install);
const quote=value=>'"'+String(value).replaceAll('"','""')+'"';
const executable=path.join(directory,'wait-harness.exe');
const command=['call',quote(path.join(install,'VC/Auxiliary/Build/vcvarsall.bat')),'x64','10.0.26100.0','>nul','&&',
  'cl.exe','/Bv','2>&1','|','findstr','/C:"19.50.35725"','>nul','&&','set','VCToolsVersion','&&','set','WindowsSDKVersion','&&',
  'cl.exe','/nologo','/Bv','/std:c++17','/O2','/MT','/W4','/WX','/sdl','/guard:cf','/DUNICODE','/D_UNICODE','/Brepro',
  '/Fe:'+quote(executable),'/Fo:'+quote(path.join(directory,'wait-harness.obj')),quote(path.join(directory,'wait-harness.cpp')),
  '/link','/SUBSYSTEM:CONSOLE','/guard:cf','/CETCOMPAT','/DYNAMICBASE','/NXCOMPAT','/HIGHENTROPYVA'].join(' ');
const build=spawnSync(process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe',['/d','/c',command],
  {cwd:root,encoding:'utf8',windowsHide:true,shell:false,windowsVerbatimArguments:true,maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(directory,'BUILD.json'),JSON.stringify(build,null,2)+'\n',{flag:'wx'});
assert.equal(build.status,0);assert.ok((build.stdout+build.stderr).includes('19.50.35725'));
assert.ok(build.stdout.includes('WindowsSDKVersion=10.0.26100.0\\'));
const run=spawnSync(executable,[],{cwd:directory,encoding:'utf8',windowsHide:true,shell:false,input:'',timeout:30000,maxBuffer:1024*1024});
fs.writeFileSync(path.join(directory,'RUN.json'),JSON.stringify(run,null,2)+'\n',{flag:'wx'});
assert.equal(run.status,0);const actual=JSON.parse(run.stdout);assert.equal(actual.rows.length,4);
assert.deepEqual(actual.rows.map(row=>row.scenario),[0,1,2,3]);assert.deepEqual(actual.rows.map(row=>row.outcome),[125,124,124,125]);
for(const row of actual.rows){assert.equal(row.wait_calls,2);assert.equal(row.termination_requested,true);
  assert.equal(row.held_process_ended,true);assert.equal(row.actual_termination_succeeded,true);
  assert.equal(row.actual_second_wait,0);assert.ok(Number.isSafeInteger(row.pid)&&row.pid>0);}
assert.ok(bytes.equals(fs.readFileSync(source)));assert.ok(fixture.equals(fs.readFileSync(path.join(root,'tests/lib/native-launcher-wait.cpp'))));
const report={...actual,created_at:new Date().toISOString(),source_sha256:sha(bytes),fixture_sha256:sha(fixture),
  driver_sha256:sha(fs.readFileSync(import.meta.filename)),executable_sha256:sha(fs.readFileSync(executable)),
  build_log_sha256:sha(fs.readFileSync(path.join(directory,'BUILD.json'))),inputs_unchanged:true,
  compiler:'19.50.35725',sdk:'10.0.26100.0',scope:'OWN_SYNTHETIC_CHILDREN_AND_API_RETURN_INJECTION',
  gui:'NOT_RUN',native_mac:'NOT_RUN',deletion:'NOT_ATTEMPTED'};
fs.writeFileSync(path.join(directory,'PROOF.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({directory,...report}));
