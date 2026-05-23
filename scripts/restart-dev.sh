#!/usr/bin/env bash
# 强制重启开发环境：先清理旧服务，再通过 start-all.sh --dev 启动

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"

PORT="${1:-7228}"
EXTRA_ARGS=()

if [[ "$1" =~ ^[0-9]+$ ]]; then
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
    *)
      EXTRA_ARGS+=("$1")
      ;;
  esac
  shift
done

echo "[restart] 停止旧的服务端进程..."
bash scripts/clean-existing-service.sh --port "$PORT" --vite-port 5173

echo "[restart] 启动开发环境..."
exec bash scripts/start-all.sh --dev --port "$PORT" --skip-clean "${EXTRA_ARGS[@]}"
