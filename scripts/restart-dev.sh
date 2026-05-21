#!/usr/bin/env bash
# 强制重启开发环境：先清理旧服务，再通过 start-all.sh --dev 启动

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_ROOT"

PORT="${1:-8787}"

echo "[restart] 停止旧的服务端进程..."
bash scripts/clean-existing-service.sh --port "$PORT" --vite-port 5173 --data-dir "$PROJECT_ROOT/.splitall-server-data"

echo "[restart] 启动开发环境..."
exec bash scripts/start-all.sh --dev --port "$PORT" --skip-clean
