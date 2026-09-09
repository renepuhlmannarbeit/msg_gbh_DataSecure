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
