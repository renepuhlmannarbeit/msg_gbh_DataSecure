import assert from 'node:assert/strict';
import { checkClaudeCodePilot, pilotContract } from '../scripts/check-claude-code-pilot.mjs';
const commands = [];
const runner = (version = pilotContract.minimum_cli, help = pilotContract.required_flags.join(' ')) => (cli, args, options) => {
  commands.push(args);
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.equal(options.timeout, 30000);
  assert.ok(args[0] === '--version' || args[0] === '--help' || (args[0] === 'plugin' && args[1] === 'validate'));
  return { status: 0, stdout: args[0] === '--version' ? `${version} (Claude Code)` : args[0] === '--help' ? help : 'Valid' };
};
for (const [platform, arch] of [['win32', 'x64'], ['darwin', 'x64'], ['darwin', 'arm64']]) {
  const result = checkClaudeCodePilot({ platform, arch, run: runner() });
  assert.equal(result.status, 'PASS');
  assert.equal(result.host_acceptance, 'NOT_RUN');
  assert.equal(result.model_calls, 0);
}
assert.equal(checkClaudeCodePilot({ platform: 'linux', arch: 'x64', run() { throw Error('must not run'); } }).status, 'BLOCKED');
assert.equal(checkClaudeCodePilot({ platform: 'win32', arch: 'x64', run: runner('2.1.267') }).status, 'BLOCKED');
assert.equal(checkClaudeCodePilot({ platform: 'win32', arch: 'x64', run: runner('2.2.0') }).status, 'PASS');
assert.equal(checkClaudeCodePilot({ platform: 'win32', arch: 'x64', run: runner('unverified') }).status, 'BLOCKED');
assert.equal(checkClaudeCodePilot({ platform: 'win32', arch: 'x64', run: runner('2.1.273', '') }).status, 'BLOCKED');
for (const response of [{ error: {code:'ENOENT'} }, { status: 0, signal: 'SIGTERM' }, { status: 1 }]) {
  const result = checkClaudeCodePilot({ platform: 'win32', arch: 'x64', run: () => response });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.checks.length, 1);
}
assert.equal(pilotContract.product, 'cowork-plugin');
assert.equal(pilotContract.status, 'qualification-only-not-host-release');
assert.deepEqual(pilotContract.surfaces, ['claude-code-cli', 'claude-desktop-code-local']);
assert.deepEqual(pilotContract.billing_policy, {
  mode: 'existing-subscription-included-usage-only',
  api_billing_allowed: false,
  extra_usage_allowed: false,
  on_unknown_billing_or_limit: 'stop-without-model-call'
});
for (const field of ['host_surface', 'desktop_version_if_applicable', 'billing_route', 'included_usage_only_verified']) {
  assert.ok(pilotContract.evidence_fields.includes(field));
}
assert.equal(new Set(pilotContract.cases.map(item => item.id)).size, 14);
assert.ok(pilotContract.cases.every(item => ['native','model'].includes(item.kind)));
console.log('Claude Code pilot: PASS (read-only preflight contract; native/model cases remain NOT_RUN)');
