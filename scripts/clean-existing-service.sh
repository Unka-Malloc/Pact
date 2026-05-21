#!/usr/bin/env bash
# Clean stale SplitAll service processes before starting a new local service.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="$PROJECT_ROOT/.splitall-server-data"
PORTS=()
LAUNCH_LABELS=()
LAUNCH_PLISTS=()
QUIET=false

usage() {
  cat <<'EOF'
Usage:
  bash scripts/clean-existing-service.sh [options]

Options:
  --port <n>            Kill listeners on a server port. Can be repeated.
  --vite-port <n>       Alias for --port, intended for local Vite dev server.
  --data-dir <path>     Data dir used by SplitAll service processes.
  --project-root <path> Project root used for command-line matching.
  --launch-label <name> Best-effort launchctl bootout for a user service label.
  --launch-plist <path> Best-effort launchctl bootout for a LaunchAgent plist.
  --quiet               Reduce informational output.
  --help                Show help.
EOF
}

log() {
  if [[ "$QUIET" != true ]]; then
    echo "$@"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port|--vite-port)
      PORTS+=("$2")
      shift 2
      ;;
    --data-dir)
      DATA_DIR="$2"
      shift 2
      ;;
    --project-root)
      PROJECT_ROOT="$2"
      shift 2
      ;;
    --launch-label)
      LAUNCH_LABELS+=("$2")
      shift 2
      ;;
    --launch-plist)
      LAUNCH_PLISTS+=("$2")
      shift 2
      ;;
    --quiet)
      QUIET=true
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

mkdir -p "$DATA_DIR"
if command -v realpath >/dev/null 2>&1; then
  PROJECT_ROOT="$(realpath "$PROJECT_ROOT")"
  DATA_DIR="$(realpath "$DATA_DIR")"
else
  PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd -P)"
  DATA_DIR="$(cd "$DATA_DIR" && pwd -P)"
fi

pid_command() {
  ps -p "$1" -o command= 2>/dev/null || true
}

pid_cwd() {
  lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true
}

command_has_splitall_entrypoint() {
  local command_line="$1"

  case "$command_line" in
    *"$PROJECT_ROOT/server/scripts/start-server.mjs"*|\
    *"$PROJECT_ROOT/server/scripts/start-console.mjs"*|\
    *"$PROJECT_ROOT/server/scripts/background-supervisor.mjs"*|\
    *"$PROJECT_ROOT/server/scripts/system-inspection-daemon.mjs"*)
      return 0
      ;;
    *"server/scripts/start-server.mjs"*|\
    *"server/scripts/start-console.mjs"*|\
    *"server/scripts/background-supervisor.mjs"*|\
    *"server/scripts/system-inspection-daemon.mjs"*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

command_has_data_dir() {
  local command_line="$1"

  case "$command_line" in
    *"--data-dir $DATA_DIR"*|*"--data-dir=$DATA_DIR"*|*"SPLITALL_SERVER_DATA_DIR=$DATA_DIR"*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

pid_is_splitall_owned() {
  local pid="$1"
  local command_line
  local cwd

  command_line="$(pid_command "$pid")"
  cwd="$(pid_cwd "$pid")"

  if [[ -z "$command_line" ]]; then
    return 1
  fi

  if command_has_splitall_entrypoint "$command_line"; then
    if [[ "$cwd" == "$PROJECT_ROOT" ]] || command_has_data_dir "$command_line"; then
      return 0
    fi
  fi

  case "$command_line" in
    *"/node_modules/.bin/vite"*|*" node_modules/vite/"*|*" vite "*|*" vite")
      if [[ "$cwd" == "$PROJECT_ROOT" ]]; then
        return 0
      fi
      ;;
  esac

  return 1
}

describe_process() {
  local pid="$1"
  local command_line
  local cwd

  command_line="$(pid_command "$pid")"
  cwd="$(pid_cwd "$pid")"
  log "[clean]   PID ${pid}"
  log "[clean]     cwd: ${cwd:-unknown}"
  log "[clean]     cmd: ${command_line:-unknown}"
}

kill_port_listeners() {
  local port="$1"
  local pids
  local remaining
  local i
  local pid
  local own_pids=()
  local external_pids=()

  pids="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    log "[clean] port ${port} is free"
    return 0
  fi

  for pid in $pids; do
    if pid_is_splitall_owned "$pid"; then
      own_pids+=("$pid")
    else
      external_pids+=("$pid")
    fi
  done

  if [[ "${#external_pids[@]}" -gt 0 ]]; then
    log "[clean] port ${port} is occupied by non-SplitAll process(es); refusing to stop them"
    for pid in "${external_pids[@]}"; do
      describe_process "$pid"
    done
    return 1
  fi

  if [[ "${#own_pids[@]}" -eq 0 ]]; then
    log "[clean] port ${port} has no SplitAll-owned listeners"
    return 0
  fi

  log "[clean] stopping SplitAll-owned listeners on port ${port}: ${own_pids[*]}"
  for pid in "${own_pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done

  for i in $(seq 1 20); do
    remaining="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -z "$remaining" ]]; then
      log "[clean] port ${port} released"
      return 0
    fi
    sleep 0.5
  done

  remaining="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$remaining" ]]; then
    own_pids=()
    external_pids=()

    for pid in $remaining; do
      if pid_is_splitall_owned "$pid"; then
        own_pids+=("$pid")
      else
        external_pids+=("$pid")
      fi
    done

    if [[ "${#external_pids[@]}" -gt 0 ]]; then
      log "[clean] port ${port} is still occupied by non-SplitAll process(es); refusing to stop them"
      for pid in "${external_pids[@]}"; do
        describe_process "$pid"
      done
      return 1
    fi

    if [[ "${#own_pids[@]}" -gt 0 ]]; then
      log "[clean] force stopping SplitAll-owned listeners on port ${port}: ${own_pids[*]}"
      for pid in "${own_pids[@]}"; do
        kill -9 "$pid" 2>/dev/null || true
      done
    fi
  fi
}

bootout_launch_label() {
  local label="$1"
  local target

  if ! command -v launchctl >/dev/null 2>&1; then
    return 0
  fi

  target="gui/$(id -u)/${label}"
  log "[clean] stopping launch service ${target}"
  launchctl bootout "$target" >/dev/null 2>&1 || true
}

bootout_launch_plist() {
  local plist_path="$1"
  local target

  if ! command -v launchctl >/dev/null 2>&1; then
    return 0
  fi

  target="gui/$(id -u)"
  log "[clean] stopping launch plist ${plist_path}"
  launchctl bootout "$target" "$plist_path" >/dev/null 2>&1 || true
}

find_stale_splitall_pids() {
  ps -Ao pid=,command= |
    awk -v root="$PROJECT_ROOT" -v data_dir="$DATA_DIR" -v self="$$" '
      {
        pid = $1;
        cmd = $0;
        sub(/^[[:space:]]*[0-9]+[[:space:]]+/, "", cmd);

        if (pid == self) {
          next;
        }

        if (!(index(cmd, root "/server/scripts/start-server.mjs") > 0 ||
          index(cmd, "server/scripts/start-server.mjs") > 0 ||
          index(cmd, root "/server/scripts/start-console.mjs") > 0 ||
          index(cmd, "server/scripts/start-console.mjs") > 0 ||
          index(cmd, root "/server/scripts/background-supervisor.mjs") > 0 ||
          index(cmd, "server/scripts/background-supervisor.mjs") > 0 ||
          index(cmd, root "/server/scripts/system-inspection-daemon.mjs") > 0 ||
          index(cmd, "server/scripts/system-inspection-daemon.mjs") > 0)) {
          next;
        }

        if (!(index(cmd, "--data-dir " data_dir) > 0 ||
          index(cmd, "--data-dir=" data_dir) > 0 ||
          index(cmd, "SPLITALL_SERVER_DATA_DIR=" data_dir) > 0)) {
          next;
        }

        {
          print pid;
        }
      }' |
    sort -u
}

kill_stale_splitall_processes() {
  local pids
  local remaining=()
  local pid
  local i

  pids="$(find_stale_splitall_pids)"
  if [[ -z "$pids" ]]; then
    log "[clean] no stale SplitAll service processes for ${DATA_DIR}"
    return 0
  fi

  log "[clean] stopping stale SplitAll service processes: $(echo "$pids" | tr '\n' ' ')"
  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done

  for i in $(seq 1 20); do
    remaining=()
    for pid in $pids; do
      if kill -0 "$pid" 2>/dev/null; then
        remaining+=("$pid")
      fi
    done

    if [[ "${#remaining[@]}" -eq 0 ]]; then
      log "[clean] stale SplitAll service processes stopped"
      return 0
    fi
    sleep 0.5
  done

  log "[clean] force stopping stale SplitAll service processes: ${remaining[*]}"
  for pid in "${remaining[@]}"; do
    kill -9 "$pid" 2>/dev/null || true
  done
}

if [[ "${#LAUNCH_LABELS[@]}" -gt 0 ]]; then
  for label in "${LAUNCH_LABELS[@]}"; do
    bootout_launch_label "$label"
  done
fi

if [[ "${#LAUNCH_PLISTS[@]}" -gt 0 ]]; then
  for plist_path in "${LAUNCH_PLISTS[@]}"; do
    bootout_launch_plist "$plist_path"
  done
fi

kill_stale_splitall_processes

if [[ "${#PORTS[@]}" -gt 0 ]]; then
  for port in "${PORTS[@]}"; do
    kill_port_listeners "$port"
  done
fi

log "[clean] existing SplitAll service cleanup complete"
