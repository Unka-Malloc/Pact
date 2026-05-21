#!/usr/bin/env bash
# 一键启动脚本
# - 默认：启动服务端 + 内置控制台静态页面（运行前会先做 npm 安装检查）
# - --dev：启动服务端 API + Vite 开发服务器（适合前端联调）

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"

PORT=8787
VITE_PORT=5173
DATA_DIR="$PROJECT_ROOT/.agentstudio-server-data"
PROFILE="default"
OPEN_BROWSER=true
MODE="console"
SKIP_CLEAN=false

usage() {
  cat <<'EOF'
用法:
  bash scripts/start-all.sh [选项]

选项:
  --port <n>        服务端端口（默认: 8787）
  --data-dir <path> 数据目录（默认: .agentstudio-server-data）
  --profile <name>  运行档位（默认: default）
  --dev             使用 Vite 开发模式启动前端（默认启动内置控制台）
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

mkdir -p "$DATA_DIR"
if command -v realpath >/dev/null 2>&1; then
  DATA_DIR="$(realpath "$DATA_DIR")"
else
  DATA_DIR="$(cd "$DATA_DIR" && pwd -P)"
fi

if [[ "$SKIP_CLEAN" != true ]]; then
  CLEAN_ARGS=(
    --port "$PORT"
    --data-dir "$DATA_DIR"
    --launch-label "dev.agentstudio.server.${PORT}"
    --launch-label "dev.agentstudio.background-supervisor"
    --launch-label "dev.agentstudio.system-inspection"
    --launch-plist "$HOME/Library/LaunchAgents/dev.agentstudio.server.${PORT}.plist"
    --launch-plist "$HOME/Library/LaunchAgents/dev.agentstudio.background-supervisor.plist"
    --launch-plist "$HOME/Library/LaunchAgents/dev.agentstudio.system-inspection.plist"
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

cleanup() {
  echo ""
  echo "[exit] 正在关闭进程..."

  if [[ -n "$VITE_PID" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
    kill "$VITE_PID"
  fi
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID"
  fi

  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

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
  npm run server:console -- --port "$PORT" --data-dir "$DATA_DIR" --profile "$PROFILE" &
  SERVER_PID=$!
else
  echo "[server] 启动开发模式：server:start + Vite"
  npm run server:start -- --port "$PORT" --data-dir "$DATA_DIR" --profile "$PROFILE" &
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
