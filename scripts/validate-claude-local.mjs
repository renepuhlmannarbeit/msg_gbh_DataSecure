// Developer-only structure validation. Never installs a CLI or starts a model/session.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function validateClaudeLocal({ cli = 'claude', run = spawnSync } = {}) {
  const evidence = [];
  for (const args of [['--version'], ['plugin', 'validate', 'plugins/data-secure'], ['plugin', 'validate', '.']]) {
    const result = run(cli, args, {
      cwd: repo, encoding: 'utf8', shell: false, windowsHide: true,
      timeout: 30000, maxBuffer: 1024 * 1024
    });
    if (result.error || result.signal || result.status !== 0) {
      const unavailable = result.error?.code === 'ENOENT';
      return { status: unavailable ? 'BLOCKED' : 'FAIL',
        reason: unavailable ? 'CLAUDE_CLI_NOT_FOUND' : 'CLAUDE_VALIDATION_FAILED',
        failed_command: args, evidence };
    }
    evidence.push({ command: args, output: String(result.stdout || '').trim() });
  }
  return { status: 'PASS', scope: 'structure-only-not-model-or-cowork-acceptance', evidence };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--cli' || !path.isAbsolute(args[1]))) {
    console.error('Usage: node scripts/validate-claude-local.mjs [--cli ABSOLUTE_EXECUTABLE]');
    process.exitCode = 2;
  } else {
    const result = validateClaudeLocal({ cli: args[1] || 'claude' });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'PASS' ? 0 : result.status === 'BLOCKED' ? 2 : 1;
  }
}
