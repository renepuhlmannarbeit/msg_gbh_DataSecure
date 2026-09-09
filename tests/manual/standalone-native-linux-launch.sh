#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "STANDALONE NATIVE LINUX LAUNCH SKIP (non-Linux host)"
  exit 0
fi

appdir=""
target=""
version=""
while (($#)); do
  case "$1" in
    --appdir) appdir="${2:-}"; shift 2 ;;
    --target) target="${2:-}"; shift 2 ;;
    --version) version="${2:-}"; shift 2 ;;
    *) echo "STANDALONE_NATIVE_ARGUMENT_INVALID" >&2; exit 64 ;;
  esac
done
[[ "$target" == "linux-x64-glibc" ]] || { echo "STANDALONE_NATIVE_TARGET_INVALID" >&2; exit 64; }
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+-rc[0-9]+$ ]] || { echo "STANDALONE_NATIVE_VERSION_INVALID" >&2; exit 64; }
[[ -d "$appdir" && ! -L "$appdir" && "$(basename "$appdir")" == "AppDir" ]] || {
  echo "STANDALONE_NATIVE_APPDIR_INVALID" >&2
  exit 66
}
appdir="$(cd "$appdir" && pwd -P)"

tmp_parent="$(cd "${RUNNER_TEMP:-${TMPDIR:-/tmp}}" && pwd -P)"
session_id="$(tr -d '-' </proc/sys/kernel/random/uuid)"
[[ "$session_id" =~ ^[a-f0-9]{32}$ ]] || exit 70
test_root="$tmp_parent/.tmp-standalone-native-$session_id"
[[ ! -e "$test_root" ]] || exit 73
mkdir -m 700 "$test_root"
test_root="$(cd "$test_root" && pwd -P)"
[[ "$(dirname "$test_root")" == "$tmp_parent" && "$(basename "$test_root")" =~ ^\.tmp-standalone-native-[a-f0-9]{32}$ ]] || exit 73

app_pid=""
xvfb_pid=""
dbus_pid=""
window_manager_pid=""
cleanup() {
  if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then
    kill -TERM "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
  if [[ -n "$window_manager_pid" ]] && kill -0 "$window_manager_pid" 2>/dev/null; then
    kill -TERM "$window_manager_pid" 2>/dev/null || true
  fi
  if [[ -n "$xvfb_pid" ]] && kill -0 "$xvfb_pid" 2>/dev/null; then kill -TERM "$xvfb_pid" 2>/dev/null || true; fi
  if [[ -n "$dbus_pid" ]] && kill -0 "$dbus_pid" 2>/dev/null; then kill -TERM "$dbus_pid" 2>/dev/null || true; fi
  [[ -d "$test_root" && ! -L "$test_root" ]] || return 1
  [[ "$(dirname "$test_root")" == "$tmp_parent" ]] || return 1
  [[ "$(basename "$test_root")" =~ ^\.tmp-standalone-native-[a-f0-9]{32}$ ]] || return 1
  rm -rf -- "$test_root"
}
trap cleanup EXIT

product="$test_root/candidate/DataSecure-Standalone-$version-$target"
mkdir -p "$product" "$test_root/profile/Local" "$test_root/profile/Roaming" \
  "$test_root/profile/Xdg" "$test_root/profile/Runtime" "$test_root/profile/Documents" \
  "$test_root/temp/SecureDataMsg-Standalone" "$test_root/webview/main"
chmod 700 "$test_root/profile/Runtime"
cp -a "$appdir" "$product/AppDir"
candidate="$product/AppDir"
executable="$candidate/usr/bin/datasecure-standalone"
launcher="$candidate/AppRun"
desktop_log="$test_root/temp/SecureDataMsg-Standalone/desktop-interactions.jsonl"
sidecar_log="$test_root/temp/SecureDataMsg-Standalone/sidecar-interactions.jsonl"
[[ -x "$executable" && ! -L "$executable" ]] || { echo "STANDALONE_NATIVE_EXECUTABLE_MISSING" >&2; exit 66; }
[[ -x "$launcher" ]] || { echo "STANDALONE_NATIVE_APPRUN_MISSING" >&2; exit 66; }
launcher_target="$(realpath -e "$launcher")"
[[ "$launcher_target" == "$candidate"/* && -f "$launcher_target" ]] || {
  echo "STANDALONE_NATIVE_APPRUN_TARGET_INVALID" >&2
  exit 66
}

display_number=$((100 + 0x${session_id:0:4} % 500))
export DISPLAY=":$display_number"
Xvfb "$DISPLAY" -screen 0 1280x800x24 -nolisten tcp >"$test_root/xvfb.log" 2>&1 &
xvfb_pid=$!
for _ in {1..100}; do [[ -S "/tmp/.X11-unix/X$display_number" ]] && break; sleep 0.1; done
[[ -S "/tmp/.X11-unix/X$display_number" ]] || { echo "STANDALONE_NATIVE_XVFB_FAILED" >&2; exit 1; }
eval "$(dbus-launch --sh-syntax)"
dbus_pid="${DBUS_SESSION_BUS_PID:-}"
openbox --sm-disable >"$test_root/openbox.log" 2>&1 &
window_manager_pid=$!
for _ in {1..100}; do
  kill -0 "$window_manager_pid" 2>/dev/null || break
  xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q 'window id' && break
  sleep 0.1
done
xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q 'window id' || {
  sed 's/^/openbox: /' "$test_root/openbox.log" >&2 || true
  echo "STANDALONE_NATIVE_WINDOW_MANAGER_FAILED" >&2
  exit 1
}

env \
  DATASECURE_STANDALONE_NATIVE_SMOKE_ROOT="$test_root" \
  DATASECURE_STANDALONE_DOCUMENTS_DIR="$test_root/profile/Documents" \
  HOME="$test_root/profile" USERPROFILE="$test_root/profile" \
  LOCALAPPDATA="$test_root/profile/Local" APPDATA="$test_root/profile/Roaming" \
  XDG_DATA_HOME="$test_root/profile/Xdg" XDG_RUNTIME_DIR="$test_root/profile/Runtime" \
  TEMP="$test_root/temp" TMP="$test_root/temp" TMPDIR="$test_root/temp" \
  GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1 LIBGL_ALWAYS_SOFTWARE=1 \
  DISPLAY="$DISPLAY" DBUS_SESSION_BUS_ADDRESS="$DBUS_SESSION_BUS_ADDRESS" \
  "$launcher" >"$test_root/app.stdout" 2>"$test_root/app.stderr" &
app_pid=$!

deadline=$((SECONDS + 60))
ready=false
while ((SECONDS < deadline)); do
  kill -0 "$app_pid" 2>/dev/null || { wait "$app_pid" || status=$?; echo "STANDALONE_NATIVE_APP_EXITED_${status:-0}" >&2; exit 1; }
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
[[ "$ready" == true ]] || { echo "STANDALONE_NATIVE_LINUX_IPC_TIMEOUT" >&2; exit 1; }
[[ -d "$test_root/profile/Xdg/SecureDataMsg-Standalone/workspace" ]] || {
  echo "STANDALONE_NATIVE_ISOLATED_WORKSPACE_MISSING" >&2
  exit 1
}
sidecar_pid="$(pgrep -P "$app_pid" -f 'datasecure-core' | head -n 1 || true)"
[[ "$sidecar_pid" =~ ^[0-9]+$ ]] || { echo "STANDALONE_NATIVE_SIDECAR_MISSING" >&2; exit 1; }

window_id="$(xdotool search --onlyvisible --name '^DataSecure Standalone$' | head -n 1)"
[[ "$window_id" =~ ^[0-9]+$ ]] || { echo "STANDALONE_NATIVE_WINDOW_MISSING" >&2; exit 1; }
xdotool windowactivate --sync "$window_id"
xdotool key alt+F4
for _ in {1..150}; do kill -0 "$app_pid" 2>/dev/null || break; sleep 0.2; done
if kill -0 "$app_pid" 2>/dev/null; then echo "STANDALONE_NATIVE_LINUX_GRACEFUL_EXIT_TIMEOUT" >&2; exit 1; fi
wait "$app_pid" || status=$?
[[ "${status:-0}" == 0 ]] || { echo "STANDALONE_NATIVE_LINUX_EXIT_${status}" >&2; exit 1; }
if kill -0 "$sidecar_pid" 2>/dev/null; then echo "STANDALONE_NATIVE_LINUX_ORPHANED_SIDECAR" >&2; exit 1; fi
app_pid=""
echo "STANDALONE NATIVE LINUX APPIMAGE LAUNCH PASS ($target)"
