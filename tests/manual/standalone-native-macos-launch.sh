#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "STANDALONE NATIVE MACOS LAUNCH SKIP (non-macOS host)"
  exit 0
fi

app_bundle=""
target=""
version=""
while (($#)); do
  case "$1" in
    --app) app_bundle="${2:-}"; shift 2 ;;
    --target) target="${2:-}"; shift 2 ;;
    --version) version="${2:-}"; shift 2 ;;
    *) echo "STANDALONE_NATIVE_ARGUMENT_INVALID" >&2; exit 64 ;;
  esac
done

case "$target" in macos-x64|macos-arm64) ;; *) echo "STANDALONE_NATIVE_TARGET_INVALID" >&2; exit 64 ;; esac
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+-rc[0-9]+$ ]] || {
  echo "STANDALONE_NATIVE_VERSION_INVALID" >&2
  exit 64
}
[[ -d "$app_bundle" && ! -L "$app_bundle" ]] || {
  echo "STANDALONE_NATIVE_APP_MISSING" >&2
  exit 66
}
app_bundle="$(cd "$app_bundle" && pwd -P)"
[[ "$(basename "$app_bundle")" == "DataSecure Standalone.app" ]] || {
  echo "STANDALONE_NATIVE_APP_INVALID" >&2
  exit 66
}

tmp_parent="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
session_id="$(uuidgen | tr -d '-' | tr '[:upper:]' '[:lower:]')"
[[ "$session_id" =~ ^[a-f0-9]{32}$ ]] || {
  echo "STANDALONE_NATIVE_SESSION_INVALID" >&2
  exit 70
}
test_root="$tmp_parent/.tmp-standalone-native-$session_id"
[[ ! -e "$test_root" ]] || {
  echo "STANDALONE_NATIVE_ROOT_EXISTS" >&2
  exit 73
}
mkdir -m 700 "$test_root"
test_root="$(cd "$test_root" && pwd -P)"
case "$test_root" in "$tmp_parent"/.tmp-standalone-native-[a-f0-9][a-f0-9]*) ;; *) exit 73 ;; esac

app_pid=""
child_pids=""
cleanup() {
  if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then
    kill -TERM "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
  [[ -d "$test_root" && ! -L "$test_root" ]] || return 1
  [[ "$(dirname "$test_root")" == "$tmp_parent" ]] || return 1
  [[ "$(basename "$test_root")" =~ ^\.tmp-standalone-native-[a-f0-9]{32}$ ]] || return 1
  rm -rf -- "$test_root"
}
trap cleanup EXIT

product="$test_root/candidate/DataSecure-Standalone-$version-$target"
mkdir -p "$product" \
  "$test_root/profile/Local" "$test_root/profile/Roaming" \
  "$test_root/profile/Xdg" "$test_root/profile/Documents" \
  "$test_root/temp/SecureDataMsg-Standalone" "$test_root/webview/main"
ditto "$app_bundle" "$product/DataSecure Standalone.app"

candidate="$product/DataSecure Standalone.app"
executable="$candidate/Contents/MacOS/datasecure-standalone"
desktop_log="$test_root/temp/SecureDataMsg-Standalone/desktop-interactions.jsonl"
sidecar_log="$test_root/temp/SecureDataMsg-Standalone/sidecar-interactions.jsonl"
[[ -x "$executable" && ! -L "$executable" ]] || {
  echo "STANDALONE_NATIVE_EXECUTABLE_MISSING" >&2
  exit 66
}
codesign --verify --deep --strict --verbose=2 "$candidate"

env \
  DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT="$test_root" \
  DATASECURE_STANDALONE_DOCUMENTS_DIR="$test_root/profile/Documents" \
  HOME="$test_root/profile" \
  USERPROFILE="$test_root/profile" \
  LOCALAPPDATA="$test_root/profile/Local" \
  APPDATA="$test_root/profile/Roaming" \
  XDG_DATA_HOME="$test_root/profile/Xdg" \
  TEMP="$test_root/temp" TMP="$test_root/temp" TMPDIR="$test_root/temp" \
  WEBVIEW2_USER_DATA_FOLDER="$test_root/webview/main" \
  "$executable" >"$test_root/app.stdout" 2>"$test_root/app.stderr" &
app_pid=$!

deadline=$((SECONDS + 45))
ready=false
while ((SECONDS < deadline)); do
  kill -0 "$app_pid" 2>/dev/null || {
    wait "$app_pid" || status=$?
    echo "STANDALONE_NATIVE_APP_EXITED_${status:-0}" >&2
    exit 1
  }
  if [[ -f "$desktop_log" && -f "$sidecar_log" ]] \
    && grep -q '"event":"page_loaded"' "$desktop_log" \
    && grep -q '"event":"frontend_ready"' "$desktop_log" \
    && grep -q '"action":"get_public_state"' "$desktop_log" \
    && grep -q '"action":"get_ui_context"' "$desktop_log" \
    && grep -q '"event":"sidecar_started"' "$sidecar_log" \
    && grep -q '"event":"service_initialized"' "$sidecar_log"; then
    ready=true
    break
  fi
  sleep 0.2
done
[[ "$ready" == true ]] || {
  echo "STANDALONE_NATIVE_MACOS_IPC_TIMEOUT" >&2
  exit 1
}
[[ -d "$test_root/profile/Library/Application Support/SecureDataMsg-Standalone/workspace" ]] || {
  echo "STANDALONE_NATIVE_ISOLATED_WORKSPACE_MISSING" >&2
  exit 1
}
child_pids="$(pgrep -P "$app_pid" 2>/dev/null || true)"

osascript -e 'tell application id "de.msg.datasecure.standalone" to quit'
for _ in {1..150}; do
  kill -0 "$app_pid" 2>/dev/null || break
  sleep 0.2
done
if kill -0 "$app_pid" 2>/dev/null; then
  echo "STANDALONE_NATIVE_MACOS_GRACEFUL_EXIT_TIMEOUT" >&2
  exit 1
fi
wait "$app_pid" || status=$?
[[ "${status:-0}" == 0 ]] || {
  echo "STANDALONE_NATIVE_MACOS_EXIT_${status}" >&2
  exit 1
}
for child in $child_pids; do
  kill -0 "$child" 2>/dev/null && {
    echo "STANDALONE_NATIVE_MACOS_ORPHANED_SIDECAR" >&2
    exit 1
  }
done
app_pid=""
echo "STANDALONE NATIVE MACOS APP BUNDLE LAUNCH PASS ($target)"
