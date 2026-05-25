#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const checks = [
  {
    id: "merkle-state-substrate",
    script: "verify-merkle-state-substrate.mjs",
    proves: "LSM-style ingest, CAS, Merkle DAG/index, partitioned hash chain, and StateCommit substrate"
  },
  {
    id: "workspace-file-ops",
    script: "verify-workspace-file-ops.mjs",
    proves: "HTTP workspace write/delete/move/list behavior over real workspace files"
  },
  {
    id: "workspace-local-dir-sync",
    script: "verify-workspace-local-dir-sync.mjs",
    proves: "MCP local directory sync plan/apply into Pact-hosted sharedspace, including symlink rejection"
  },
  {
    id: "agent-workspace-file-upload",
    script: "verify-agent-workspace-file-upload.mjs",
    proves: "MCP sharedspace upload/download/list/stat/patch with LSM ingest receipts, Merkle cache receipts, and checkpoint restore"
  },
  {
    id: "workspace-checkpoints",
    script: "verify-workspace-checkpoint-protocol.mjs",
    proves: "workspace checkpoint preview/restore and append-only file rollback"
  },
  {
    id: "mcp-codex-install",
    script: "verify-mcp-codex-install.mjs",
    proves: "real Codex CLI connector install in an isolated CODEX_HOME and MCP sharedspace file flow"
  }
];

console.log("\n=== Pact v0.0.1 Local Directory E2E Verification ===\n");

for (const check of checks) {
  console.log(`[${check.id}] ${check.proves}`);
  const result = spawnSync(process.execPath, [path.join(repoRoot, "server", "scripts", check.script)], {
    cwd: repoRoot,
    env: { ...process.env },
    stdio: "inherit"
  });
  if (result.status !== 0) {
    console.error(`\nFAIL: ${check.id} exited with ${result.status ?? "unknown"}.`);
    process.exit(result.status || 1);
  }
  console.log(`[${check.id}] ok\n`);
}

console.log("v0.0.1 local directory E2E verification passed");
