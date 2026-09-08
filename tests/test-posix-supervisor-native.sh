#!/usr/bin/env bash
set -euo pipefail

supervisor="${1:?path to the compiled POSIX supervisor is required}"
node_path="$(command -v node)"

"$supervisor" --sandbox-contract >/dev/null
"$supervisor" --memory-mib 384 --cpu-ms 5000 --wall-ms 10000 -- \
  "$node_path" -e 'process.stdout.write("native-supervisor-ok\n")'

# Reproduce a stricter hard limit inherited from the host. The supervisor asks
# for 64 descriptors, but it must retain 32 instead of trying to raise the hard
# limit and aborting before exec.
(
  ulimit -S -n 32
  ulimit -H -n 32
  "$supervisor" --memory-mib 384 --cpu-ms 5000 --wall-ms 10000 -- \
    "$node_path" -e 'process.stdout.write("inherited-limit-ok\n")'
)

