#!/usr/bin/env bash
set -euo pipefail

# A separate production-path gate: no DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT,
# synthetic HOME or synthetic TMPDIR. Run only on an ephemeral macOS CI runner;
# it must not inspect or modify a person's existing DataSecure installation.
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "STANDALONE_REGULAR_MACOS_SKIP" >&2
  exit 77
fi
if [[ "${1:-}" != "--app" || $# != 2 || ! -d "$2" || -L "$2" ]]; then
  echo "STANDALONE_REGULAR_MACOS_ARGUMENT_INVALID" >&2
  exit 64
fi
if [[ "${GITHUB_ACTIONS:-}" != "true" || -n "${DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT:-}" ]]; then
  echo "STANDALONE_REGULAR_MACOS_CI_ONLY" >&2
  exit 64
fi
if [[ "$(id -u)" == "0" ]]; then
  echo "STANDALONE_REGULAR_MACOS_ROOT_NOT_ALLOWED" >&2
  exit 64
fi
echo "STANDALONE_REGULAR_MACOS_ENV os=$(/usr/bin/sw_vers -productVersion) arch=$(uname -m) user=nonroot profile=regular"

source_app="$(cd "$2" && pwd -P)"
[[ "$(basename "$source_app")" == "DataSecure Standalone.app" ]] || exit 64
diagnostic_dir="${TMPDIR:-/tmp}/SecureDataMsg-Standalone"
[[ ! -e "$diagnostic_dir" && ! -L "$diagnostic_dir" ]] || {
  echo "STANDALONE_REGULAR_MACOS_DIAGNOSTIC_COLLISION" >&2
  exit 73
}
test_root="$(mktemp -d "${TMPDIR:-/tmp}/datasecure-regular-start.XXXXXXXX")"
[[ -d "$test_root" && ! -L "$test_root" ]] || exit 73
mkdir -m 700 "$test_root/Applications"
candidate="$test_root/Applications/DataSecure Standalone.app"
ditto "$source_app" "$candidate"
codesign --verify --deep --strict "$candidate"
executable="$candidate/Contents/MacOS/datasecure-standalone"
[[ -x "$executable" && ! -L "$executable" ]] || exit 66

app_pid=""
normal_quit() {
  if [[ "$app_pid" =~ ^[0-9]+$ ]] && kill -0 "$app_pid" 2>/dev/null; then
    /usr/bin/swift "$(dirname "${BASH_SOURCE[0]}")/../helpers/macos-launch-services.swift" \
      --terminate "$candidate" "$app_pid" || true
  fi
}
trap normal_quit EXIT
app_pid="$(/usr/bin/swift "$(dirname "${BASH_SOURCE[0]}")/../helpers/macos-launch-services.swift" --regular "$candidate")"
[[ "$app_pid" =~ ^[0-9]+$ ]] || exit 66
desktop_log="$diagnostic_dir/desktop-interactions.jsonl"
sidecar_log="$diagnostic_dir/sidecar-interactions.jsonl"
ready=false
deadline=$((SECONDS + 60))
while ((SECONDS < deadline)); do
  kill -0 "$app_pid" 2>/dev/null || break
  if [[ -f "$desktop_log" && -f "$sidecar_log" ]] \
    && grep -q '"event":"sidecar_bootstrap_ready"' "$desktop_log" \
    && grep -q '"event":"sidecar_imports_ready"' "$sidecar_log" \
    && grep -q '"event":"runtime_integrity_checked"' "$sidecar_log" \
    && grep -q '"event":"service_initialized"' "$sidecar_log" \
    && node "$(dirname "${BASH_SOURCE[0]}")/../helpers/native-review-readiness.js" \
      "$desktop_log" --main --workspace; then
    ready=true
    break
  fi
  sleep 0.2
done
if [[ "$ready" != true ]]; then
  # The diagnostic schema deliberately excludes paths and document content.
  # Print only a closed set of fields if this new OS gate fails.
  for log in "$desktop_log" "$sidecar_log"; do
    if [[ -f "$log" ]]; then
      node -e 'const fs=require("node:fs"); for(const line of fs.readFileSync(process.argv[1],"utf8").trim().split(/\r?\n/u).slice(-30)){try{const e=JSON.parse(line); console.log(JSON.stringify({component:e.component,event:e.event,outcome:e.outcome,error_code:e.error_code}));}catch{}}' "$log"
    fi
  done
  [[ -f "$desktop_log" ]] || echo "STANDALONE_REGULAR_MACOS_DESKTOP_LOG_MISSING" >&2
  [[ -f "$sidecar_log" ]] || echo "STANDALONE_REGULAR_MACOS_SIDECAR_LOG_MISSING" >&2
  echo "STANDALONE_REGULAR_MACOS_START_FAILED" >&2
  exit 1
fi
normal_quit
for _ in {1..100}; do
  kill -0 "$app_pid" 2>/dev/null || break
  sleep 0.2
done
if kill -0 "$app_pid" 2>/dev/null; then
  echo "STANDALONE_REGULAR_MACOS_EXIT_TIMEOUT" >&2
  exit 1
fi
app_pid=""
echo "STANDALONE REGULAR MACOS START PASS (LaunchServices, production profile and IPC; quarantine not covered)"
