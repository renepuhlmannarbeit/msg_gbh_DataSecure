import childProcess from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'native', 'sea', 'launcher-contract.json'), 'utf8'));

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing ${name}`);
  return process.argv[index + 1];
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    windowsHide: true,
    env: options.env || process.env,
    timeout: options.timeout || 120000,
    stdio: options.stdio || 'pipe'
  });
  if (result.error || result.status !== 0) {
    throw new Error(`SEA_BUILD_COMMAND_FAILED:${path.basename(command)}:${result.status ?? 'spawn'}`);
  }
  return result.stdout;
}

const targetId = argument('--target');
const nodeBinary = path.resolve(argument('--node'));
const target = contract.targets.find((item) => item.id === targetId);
if (!target) throw new Error('unknown target');
if (target.os !== process.platform || target.arch !== process.arch) {
  throw new Error(`target ${target.id} requires ${target.os}/${target.arch}`);
}
if (!fs.statSync(nodeBinary).isFile()) throw new Error('Node target is not a regular file');

const reported = run(nodeBinary, ['-p', 'JSON.stringify({version:process.versions.node,platform:process.platform,arch:process.arch})']);
const nodeStatus = JSON.parse(reported.trim());
if (nodeStatus.version !== contract.node_version || nodeStatus.platform !== target.os || nodeStatus.arch !== target.arch) {
  throw new Error('Node target does not match the launcher contract');
}

const template = fs.readFileSync(path.join(root, 'native', 'sea', 'bootstrap.cjs'), 'utf8');
for (const marker of ['__DATASECURE_TARGET__', '__DATASECURE_NODE_VERSION__']) {
  if (template.split(marker).length !== 2) throw new Error(`invalid bootstrap marker ${marker}`);
}
const bootstrap = template
  .replace('__DATASECURE_TARGET__', target.id)
  .replace('__DATASECURE_NODE_VERSION__', contract.node_version);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'datasecure-sea-'));
try {
  const main = path.join(temporary, 'bootstrap.cjs');
  const blob = path.join(temporary, 'sea-prep.blob');
  const config = path.join(temporary, 'sea-config.json');
  fs.writeFileSync(main, bootstrap, { encoding: 'utf8', mode: 0o600 });
  // Keep paths inside the SEA config relative. Node serializes the configured
  // main path into the preparation blob; an absolute random temp path would
  // make two otherwise identical launchers hash differently.
  fs.writeFileSync(config, JSON.stringify({
    main: path.basename(main),
    output: path.basename(blob),
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    execArgv: ['--no-warnings', '--max-old-space-size=512'],
    execArgvExtension: 'none'
  }), { encoding: 'utf8', mode: 0o600 });
  run(nodeBinary, ['--experimental-sea-config', path.basename(config)], { cwd: temporary });

  const outputArgument = process.argv.includes('--output') ? path.resolve(argument('--output')) :
    path.join(root, 'dist', 'sea-launcher', target.id, target.launcher);
  fs.mkdirSync(path.dirname(outputArgument), { recursive: true });
  fs.copyFileSync(nodeBinary, outputArgument);

  if (target.os === 'darwin') run('/usr/bin/codesign', ['--remove-signature', outputArgument]);
  const postject = path.join(root, 'node_modules', 'postject', 'dist', 'cli.js');
  const injectArgs = [postject, outputArgument, 'NODE_SEA_BLOB', blob,
    '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'];
  if (target.os === 'darwin') injectArgs.push('--macho-segment-name', 'NODE_SEA');
  run(process.execPath, injectArgs);
  if (target.os === 'darwin') run('/usr/bin/codesign', ['--sign', '-', outputArgument]);
  if (target.os !== 'win32') fs.chmodSync(outputArgument, 0o755);

  const probe = JSON.parse(run(outputArgument, ['--datasecure-runtime-probe']).trim());
  if (probe.schema !== 'datasecure-sea-runtime-probe/v1' || probe.target !== target.id ||
      probe.node_version !== contract.node_version || probe.sea !== true) {
    throw new Error('SEA runtime probe mismatch');
  }
  const bytes = fs.readFileSync(outputArgument);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const evidence = {
    schema: 'datasecure-sea-build-evidence/v1',
    release_enabled: false,
    target: target.id,
    node_version: contract.node_version,
    postject_version: contract.postject_version,
    bytes: bytes.length,
    sha256,
    runtime_probe: probe
  };
  fs.writeFileSync(`${outputArgument}.sha256`, `${sha256}  ${path.basename(outputArgument)}\n`, 'utf8');
  fs.writeFileSync(`${outputArgument}.evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
