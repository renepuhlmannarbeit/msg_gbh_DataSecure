// Read-only developer preflight. Never starts a model, installs a plugin,
// changes account settings, or upgrades the CLI. This is NOT host acceptance.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
export const pilotContract = JSON.parse(fs.readFileSync(path.join(root,
  'docs/acceptance/CLAUDE_CODE_PILOT/contract.json'), 'utf8'));
function supportedVersion(actual, minimum) {
  const a = actual.split('.').map(Number), b = minimum.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index];
  }
  return true;
}
export function checkClaudeCodePilot({ cli = 'claude', run = spawnSync,
  platform = process.platform, arch = process.arch } = {}) {
  const target = platform === 'win32' ? `windows-${arch}` : platform === 'darwin' ? `macos-${arch}` : `${platform}-${arch}`;
  const result = { schema: 'datasecure-claude-code-preflight/1', status: 'BLOCKED',
    scope: 'local-structure-only-not-model-native-ui-or-release', target,
    cli_version: null, checks: [], issues: [], host_acceptance: 'NOT_RUN', model_calls: 0 };
  if (!pilotContract.platforms.includes(target)) {
    result.issues.push('HOST_TARGET_NOT_QUALIFIED'); return result;
  }
  const invoke = (args) => {
    const response = run(cli, args, { cwd: root, encoding: 'utf8', shell: false,
      windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
    const ok = !response.error && !response.signal && response.status === 0;
    result.checks.push({ command: args, status: ok ? 'PASS' : 'FAIL' });
    return ok ? String(response.stdout || '') : null;
  };
  const versionOutput = invoke(['--version']);
  const version = /^(\d+\.\d+\.\d+)(?:\s|$)/u.exec(versionOutput?.trim() || '')?.[1];
  if (!version) { result.issues.push('CLAUDE_CLI_VERSION_UNVERIFIED'); return result; }
  result.cli_version = version;
  if (!supportedVersion(version, pilotContract.minimum_cli)) result.issues.push('CLAUDE_CLI_BELOW_PILOT_MINIMUM');
  const help = invoke(['--help']);
  if (!help || pilotContract.required_flags.some(flag => !help.includes(flag))) result.issues.push('CLAUDE_PILOT_FLAGS_MISSING');
  for (const targetPath of ['plugins/data-secure', '.claude-plugin/marketplace.json']) {
    if (invoke(['plugin', 'validate', targetPath, '--strict']) === null) result.issues.push('PLUGIN_STRUCTURE_INVALID');
  }
  if (!result.issues.length) result.status = 'PASS';
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--cli' || !path.isAbsolute(args[1]))) {
    console.error('Usage: node scripts/check-claude-code-pilot.mjs [--cli ABSOLUTE_EXECUTABLE]');
    process.exitCode = 2;
  } else {
    const result = checkClaudeCodePilot({ cli: args[1] || 'claude' });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'PASS' ? 0 : 2;
  }
}
