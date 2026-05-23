#!/usr/bin/env bash
# 强制重启开发环境：先清理旧服务，再通过 start-all.sh --dev 启动

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"

PORT=7228
DATA_DIR=""
EXTRA_ARGS=()

if [[ "${1-}" =~ ^[0-9]+$ ]]; then
  PORT="$1"
  shift
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-mcp-register)
      EXTRA_ARGS+=("--skip-mcp-register")
      ;;
    --port)
      shift
      if [[ $# -eq 0 ]]; then
        echo "[restart] 缺少 --port 参数值"
        exit 1
      fi
      if [[ ! "$1" =~ ^[0-9]+$ ]]; then
        echo "[restart] --port 参数值必须是数字"
        exit 1
      fi
      PORT="$1"
      ;;
    --data-dir)
      shift
      if [[ $# -eq 0 ]]; then
        echo "[restart] 缺少 --data-dir 参数值"
        exit 1
      fi
      DATA_DIR="$1"
      ;;
    *)
      EXTRA_ARGS+=("$1")
      ;;
  esac
  shift
done

if [[ -n "$DATA_DIR" ]]; then
  DATA_DIR="$(node server/scripts/resolve-server-data-dir.mjs --data-dir "$DATA_DIR")"
else
  DATA_DIR="$(node server/scripts/resolve-server-data-dir.mjs)"
fi

echo "[restart] 停止旧的服务端进程..."
bash scripts/clean-existing-service.sh --port "$PORT" --vite-port 5173 --data-dir "$DATA_DIR"

echo "[restart] 启动开发环境..."
exec bash scripts/start-all.sh --dev --port "$PORT" --data-dir "$DATA_DIR" --skip-clean "${EXTRA_ARGS[@]}"
