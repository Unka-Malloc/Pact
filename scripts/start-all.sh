#!/usr/bin/env bash
# 一键启动脚本
# - 默认：启动服务端 + 内置控制台静态页面（运行前会先做 npm 安装检查）
# - --dev：启动服务端 API + Vite 开发服务器（适合前端联调）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"

PORT=7228
VITE_PORT=5173
DATA_DIR=""
PROFILE="default"
OPEN_BROWSER=true
MODE="console"
REGISTER_MCP=true
SKIP_CLEAN=false

usage() {
  cat <<'EOF'
用法:
  bash scripts/start-all.sh [选项]

选项:
  --port <n>        服务端端口（默认: 7228）
  --data-dir <path> 数据目录（默认: ServerConfig.getDataDir()）
  --profile <name>  运行档位（默认: default）
  --dev             使用 Vite 开发模式启动前端（默认启动内置控制台）
  --skip-mcp-register  跳过 MCP Hub 注册（默认会自动执行）
  --no-open         不自动打开浏览器
  --skip-clean      跳过启动前清理（内部脚本调用使用）
  --help            显示帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      PORT="$2"
      shift 2
      ;;
    --data-dir)
      DATA_DIR="$2"
      shift 2
      ;;
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --dev)
      MODE="dev"
      shift
      ;;
    --no-open)
      OPEN_BROWSER=false
      shift
      ;;
    --skip-clean)
      SKIP_CLEAN=true
      shift
      ;;
    --skip-mcp-register)
      REGISTER_MCP=false
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -n "$DATA_DIR" ]]; then
  DATA_DIR="$(node server/scripts/resolve-server-data-dir.mjs --data-dir "$DATA_DIR")"
else
  DATA_DIR="$(node server/scripts/resolve-server-data-dir.mjs)"
fi
mkdir -p "$DATA_DIR"

if [[ "$SKIP_CLEAN" != true ]]; then
  CLEAN_ARGS=(
    --port "$PORT"
    --data-dir "$DATA_DIR"
    --launch-label "dev.pact.server.${PORT}"
    --launch-label "dev.pact.background-supervisor"
    --launch-label "dev.pact.system-inspection"
    --launch-plist "$HOME/Library/LaunchAgents/dev.pact.server.${PORT}.plist"
    --launch-plist "$HOME/Library/LaunchAgents/dev.pact.background-supervisor.plist"
    --launch-plist "$HOME/Library/LaunchAgents/dev.pact.system-inspection.plist"
  )
  if [[ "$MODE" == "dev" ]]; then
    CLEAN_ARGS+=(--vite-port "$VITE_PORT")
  fi
  bash scripts/clean-existing-service.sh "${CLEAN_ARGS[@]}"
fi

if [[ ! -d "node_modules" ]]; then
  echo "[bootstrap] node_modules 不存在，先执行 npm ci"
  npm ci
fi

SERVER_PID=""
VITE_PID=""
CLEANUP_STARTED=false

is_alive() {
  local pid="${1:-}"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

process_tree_pids() {
  local root="${1:-}"
  local child

  if [[ -z "$root" ]]; then
    return 0
  fi

  echo "$root"

  if command -v pgrep >/dev/null 2>&1; then
    while IFS= read -r child; do
      if [[ -n "$child" ]]; then
        process_tree_pids "$child"
      fi
    done < <(pgrep -P "$root" 2>/dev/null || true)
  fi
}

signal_process_tree() {
  local signal="$1"
  local root="${2:-}"
  local pids=()
  local pid
  local i

  if ! is_alive "$root"; then
    return 0
  fi

  while IFS= read -r pid; do
    if [[ -n "$pid" ]]; then
      pids+=("$pid")
    fi
  done < <(process_tree_pids "$root")

  for ((i=${#pids[@]}-1; i>=0; i--)); do
    kill "-$signal" "${pids[$i]}" 2>/dev/null || true
  done
}

wait_for_exit() {
  local pid
  local i

  for i in {1..25}; do
    local any_alive=false
    for pid in "$@"; do
      if is_alive "$pid"; then
        any_alive=true
        break
      fi
    done
    if [[ "$any_alive" == false ]]; then
      return 0
    fi
    sleep 0.2
  done

  return 1
}

cleanup() {
  if [[ "$CLEANUP_STARTED" == true ]]; then
    return 0
  fi
  CLEANUP_STARTED=true
  trap - EXIT INT TERM

  echo ""
  echo "[exit] 正在关闭进程..."

  signal_process_tree TERM "$VITE_PID"
  signal_process_tree TERM "$SERVER_PID"

  if ! wait_for_exit "$VITE_PID" "$SERVER_PID"; then
    echo "[exit] 进程未及时退出，强制终止残留进程..."
    signal_process_tree KILL "$VITE_PID"
    signal_process_tree KILL "$SERVER_PID"
  fi

  wait "$VITE_PID" "$SERVER_PID" 2>/dev/null || true
}

handle_int() {
  cleanup
  exit 130
}

handle_term() {
  cleanup
  exit 143
}

trap cleanup EXIT
trap handle_int INT
trap handle_term TERM

wait_for_server() {
  local endpoint
  local i

  for i in $(seq 1 40); do
    for endpoint in "/api/auth/session" "/api/discovery/config" "/api/discovery"; do
      if curl -sSf "http://127.0.0.1:${PORT}${endpoint}" >/dev/null 2>&1; then
        return 0
      fi
    done

    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      return 1
    fi

    sleep 1
  done

  return 1
}

if [[ "$MODE" == "console" ]]; then
  echo "[server] 启动控制台（默认模式）：server:console"
  ARGS=(--port "$PORT" --profile "$PROFILE" --data-dir "$DATA_DIR" --active-service-url "http://127.0.0.1:${PORT}" --advertised-base-url "http://127.0.0.1:${PORT}")
  npm run server:console -- "${ARGS[@]}" &
  SERVER_PID=$!
else
  echo "[server] 启动开发模式：server:start + Vite"
  ARGS=(--port "$PORT" --profile "$PROFILE" --data-dir "$DATA_DIR" --active-service-url "http://127.0.0.1:${PORT}" --advertised-base-url "http://127.0.0.1:${PORT}")
  npm run server:start -- "${ARGS[@]}" &
  SERVER_PID=$!

  if wait_for_server; then
    echo "[server] 后端已就绪，启动 Vite..."
    VITE_API_ORIGIN="http://127.0.0.1:${PORT}" \
      VITE_API_PORT="${PORT}" \
      npm run dev:web &
    VITE_PID=$!
  else
    echo "[error] 后端启动失败，请检查日志后重试。"
    exit 1
  fi
fi

if wait_for_server; then
  echo "[ok] 后端已就绪：http://127.0.0.1:${PORT}"
else
  echo "[error] 后端未在预期时间内就绪，请检查端口 ${PORT} 或日志。"
  exit 1
fi

if [[ "$REGISTER_MCP" == true ]]; then
  echo "[mcp] 注册本地 MCP Hub：server:mcp:register"
  if npm run server:mcp:register -- --url "http://127.0.0.1:${PORT}"; then
    echo "[ok] MCP Hub 注册完成。"
  else
    echo "[warn] MCP Hub 注册失败，不影响服务端启动。"
  fi
fi

if [[ "$OPEN_BROWSER" == true ]]; then
  if command -v open >/dev/null 2>&1; then
    if [[ "$MODE" == "dev" ]]; then
      open "http://127.0.0.1:5173"
    else
      open "http://127.0.0.1:${PORT}"
    fi
  fi
fi

if [[ "$MODE" == "console" ]]; then
  echo "[info] 一键启动已就绪：控制台地址 http://127.0.0.1:${PORT}"
else
  echo "[info] 一键启动已就绪：后端 http://127.0.0.1:${PORT}；前端开发地址 http://127.0.0.1:5173"
fi
echo "[info] 按 Ctrl+C 停止全部进程"

wait "$SERVER_PID"
