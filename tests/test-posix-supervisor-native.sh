#!/usr/bin/env bash
set -euo pipefail

supervisor="${1:?path to the compiled POSIX supervisor is required}"
node_path="$(command -v node)"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
server_root="$repo_root/plugins/data-secure/server"

"$supervisor" --sandbox-contract >/dev/null
"$supervisor" --memory-mib 384 --cpu-ms 5000 --wall-ms 10000 -- \
  "$node_path" -e 'process.stdout.write("native-supervisor-ok\n")'

# Node/V8 reserves memory differently from a traditional native process. In
# particular, RLIMIT_AS or RLIMIT_DATA can let the parser emit a valid response
# and then make Node fail while instantiating its internal WebAssembly HTTP parser. Run
# the real TXT parser with the production preload and flags so that such a
# false failure is caught on each native POSIX target.
printf 'Kontakt: erika@example.org\nTechnologie: Java\n' | \
  "$supervisor" --memory-mib 768 --cpu-ms 40000 --wall-ms 45000 -- \
    "$node_path" --permission "--allow-fs-read=$server_root" \
    "--require=$server_root/network-deny.cjs" --disable-proto=throw \
    --max-old-space-size=384 "$server_root/parser-worker.js" .txt 0 | \
  "$node_path" -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { input += chunk; });
    process.stdin.on("end", () => {
      const value = JSON.parse(input);
      if (value?.schema !== "data-secure-parser-result/1" || value.ok !== true ||
          value.result?.markdown !== "Kontakt: erika@example.org\nTechnologie: Java\n") process.exit(1);
    });
  '

# Reproduce a stricter hard limit inherited from the host. The supervisor asks
# for 64 descriptors, but it must retain 32 instead of trying to raise the hard
# limit and aborting before exec.
(
  ulimit -S -n 32
  ulimit -H -n 32
  "$supervisor" --memory-mib 384 --cpu-ms 5000 --wall-ms 10000 -- \
    "$node_path" -e 'process.stdout.write("inherited-limit-ok\n")'
)

# Real native cancellation across the fork/group boundary. This test runs only
# on the native POSIX target; a Windows source-pattern check is not its evidence.
"$node_path" - "$supervisor" "$node_path" <<'NODE'
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const [supervisor, node] = process.argv.slice(2);
(async () => {
  for (let attempt = 0; attempt < 23; attempt++) {
    const startedProbe = attempt >= 20;
    const child = spawn(supervisor, ['--memory-mib', '384', '--cpu-ms', '5000', '--wall-ms', '10000',
      '--', node, '-e', 'process.stdout.write(String(process.pid)+"\\n");setInterval(()=>{},1000)'],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let parserPid = null, output = '';
    const watchdog = setTimeout(() => child.kill('SIGTERM'), 12000);
    child.stderr.resume();
    child.stdout.on('data', bytes => {
      output += bytes;
      if (/^[1-9][0-9]*\n/u.test(output) && !parserPid) {
        parserPid = Number(output.trim());
        if (startedProbe) child.kill('SIGTERM');
      }
    });
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
      if (!startedProbe) setTimeout(() => child.kill('SIGTERM'), attempt % 5);
    }).finally(() => clearTimeout(watchdog));
    if (parserPid) {
      assert.throws(() => process.kill(parserPid, 0), { code: 'ESRCH' },
        'supervisor must reconcile, kill and reap its own parser before closing');
    }
    if (startedProbe) {
      assert.ok(parserPid, 'late cancellation must exercise a real started parser');
      assert.equal(result.code, 125);
    } else assert.ok(result.code === 125 || result.signal === 'SIGTERM');
  }
  process.stdout.write('native-cancellation-reconciled-and-reaped: 23 cases PASS\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
NODE

# The exact post-exit/process-group race needs Linux pidfds, subreaper ownership
# and an actual libc waitid boundary. WSL can run this same real Linux probe;
# macOS is not simulated or reported as passing it.
if [[ "$(uname -s)" == "Linux" ]]; then
  python3 "$repo_root/tests/helpers/posix-supervisor-cancellation.py" "$supervisor" --negative-controls
else
  printf '%s\n' 'controlled Linux waitid/PID-reuse boundary: NOT_RUN on this native macOS host'
fi
