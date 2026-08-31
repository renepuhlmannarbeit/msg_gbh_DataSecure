import assert from 'node:assert/strict';
import { validateClaudeLocal } from '../scripts/validate-claude-local.mjs';

const calls = [];
const success = validateClaudeLocal({ cli: 'test-cli', run: (cli, args, options) => {
  calls.push(args);
  assert.equal(cli, 'test-cli');
  assert.equal(options.shell, false);
  assert.equal(options.windowsHide, true);
  assert.equal(options.timeout, 30000);
  return { status: 0, stdout: 'validated' };
} });
assert.equal(success.status, 'PASS');
assert.equal(success.scope, 'structure-only-not-model-or-cowork-acceptance');
assert.deepEqual(calls, [['--version'], ['plugin', 'validate', 'plugins/data-secure'], ['plugin', 'validate', '.']]);
for (const [failure, expected] of [
  [{ error: { code: 'ENOENT' }, status: null }, 'BLOCKED'],
  [{ error: { code: 'ETIMEDOUT' }, status: null }, 'FAIL'],
  [{ status: 1 }, 'FAIL'], [{ status: 0, signal: 'SIGTERM' }, 'FAIL']
]) {
  let count = 0;
  const result = validateClaudeLocal({ run: () => { count++; return failure; } });
  assert.equal(result.status, expected);
  assert.equal(count, 1, 'stop immediately; no retry, install or model call');
}
let count = 0;
const failedMarketplace = validateClaudeLocal({ run: () => ({ status: ++count === 3 ? 1 : 0 }) });
assert.equal(failedMarketplace.status, 'FAIL');
assert.equal(failedMarketplace.evidence.length, 2);
assert.deepEqual(failedMarketplace.failed_command, ['plugin', 'validate', '.']);
console.log('Claude local validation contract: PASS (6 scenarios; no real CLI/model calls)');
