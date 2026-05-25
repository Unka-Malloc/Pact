import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  checkpointTreeId,
  loadCheckpointTree,
  startCheckpointTree,
  upsertCheckpointNode
} from "../platform/common/data-structure/checkpoint-tree-store.mjs";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { authHeaders, installAuthenticatedFetch } from "./test-auth-helper.mjs";

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    payload: text.trim() ? JSON.parse(text) : {}
  };
}

async function rpc(server, auth, method, params = {}, id = method) {
  const response = await fetchJson(`${server.url}/api/rpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params
    })
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload, null, 2));
  assert.equal(response.payload.error, undefined, JSON.stringify(response.payload.error || {}, null, 2));
  return response.payload.result;
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-workspace-checkpoint-protocol-"));
const treeId = checkpointTreeId("workspace-protocol", "verify");

await startCheckpointTree({
  userDataPath,
  treeId,
  kind: "workspace_protocol_verify",
  ownerId: "workspace-verify",
  rootNodeId: "root",
  rootLabel: "Workspace checkpoint protocol verification",
  resumePolicy: {
    mode: "protocol-restore-marker",
    idempotencyKey: "treeId+nodeId"
  }
});
await upsertCheckpointNode({
  userDataPath,
  treeId,
  nodeId: "extract",
  parentId: "root",
  label: "Extract",
  status: "completed",
  cursor: { offset: 1 },
  totals: { files: 1 }
});
await upsertCheckpointNode({
  userDataPath,
  treeId,
  nodeId: "transform",
  parentId: "root",
  label: "Transform",
  status: "running",
  cursor: { offset: 2 },
  totals: { files: 2 }
});

const server = await startHttpServer({
  userDataPath,
  distPath: "",
  port: 0,
  runtimeOptions: {
    profile: "minimal"
  }
});

try {
  const auth = await installAuthenticatedFetch(server);
  const createdWorkspace = await rpc(server, auth, "agent_workspaces.create", {
    title: "Workspace checkpoint restore verification",
    objective: "Verify checkpoint restore can delegate file rollback to shared-space provider"
  });
  const workspaceId = createdWorkspace.workspace.workspaceId;
  await rpc(server, auth, "agent_workspaces.file.upload", {
    workspaceId,
    path: "docs/state.txt",
    content: "OpenClaw line"
  });

  const diff = await rpc(server, auth, "workspace.checkpoint.diff", {
    treeId,
    fromNodeId: "extract",
    toNodeId: "transform"
  });
  assert.equal(diff.ok, true);
  assert.equal(diff.changed, true);
  assert.ok(diff.changes.some((item) => item.field === "cursor"));

  const scope = await rpc(server, auth, "workspace.checkpoint.scope.query", {
    treeId,
    nodeId: "root"
  });
  assert.equal(scope.ok, true);
  assert.equal(scope.affectedNodeCount, 3);
  assert.equal(scope.byStatus.completed, 1);
  assert.equal(scope.byStatus.running, 2);

  const preview = await rpc(server, auth, "workspace.checkpoint.restore.preview", {
    treeId,
    nodeId: "extract",
    reason: "verify restore preview"
  });
  assert.equal(preview.ok, true);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.applied, false);
  assert.equal(preview.canApply, true);

  const restored = await rpc(server, auth, "workspace.checkpoint.restore", {
    treeId,
    nodeId: "extract",
    reason: "verify restore"
  });
  assert.equal(restored.ok, true);
  assert.equal(restored.applied, true);
  assert.ok(restored.restoreId);
  assert.ok(restored.markerNodeId);

  const tree = await loadCheckpointTree({ userDataPath, treeId });
  assert.equal(tree?.metadata?.lastRestore?.restoreId, restored.restoreId);
  assert.ok(tree?.events?.some((event) => event.type === "checkpoint.restored"));
  assert.ok(tree?.nodes?.[restored.markerNodeId]);

  await upsertCheckpointNode({
    userDataPath,
    treeId,
    nodeId: "file-snapshot",
    parentId: "root",
    label: "Workspace file snapshot",
    status: "completed",
    metadata: {
      workspaceFileSnapshot: {
        workspaceId,
        basePath: "docs",
        deleteExtraneous: true,
        files: [
          {
            path: "state.txt",
            content: "OpenClaw line",
            encoding: "utf8"
          }
        ]
      }
    }
  });
  await rpc(server, auth, "agent_workspaces.file.write", {
    workspaceId,
    path: "docs/state.txt",
    content: "OpenClaw line\nHermes line"
  });
  await rpc(server, auth, "agent_workspaces.file.upload", {
    workspaceId,
    path: "docs/extra.txt",
    content: "remove me"
  });

  const filePreview = await rpc(server, auth, "workspace.checkpoint.restore.preview", {
    treeId,
    nodeId: "file-snapshot",
    workspaceId,
    reason: "verify file restore preview"
  });
  assert.equal(filePreview.ok, true);
  assert.equal(filePreview.workspaceFileRestore.ok, true);
  assert.equal(filePreview.workspaceFileRestore.dryRun, true);
  assert.ok(filePreview.workspaceFileRestore.actions.some((item) => item.action === "write" && item.path === "docs/state.txt"));
  assert.ok(filePreview.workspaceFileRestore.actions.some((item) => item.action === "delete" && item.path === "docs/extra.txt"));

  const fileRestore = await rpc(server, auth, "workspace.checkpoint.restore", {
    treeId,
    nodeId: "file-snapshot",
    workspaceId,
    reason: "verify file restore"
  });
  assert.equal(fileRestore.ok, true);
  assert.equal(fileRestore.applied, true);
  assert.equal(fileRestore.workspaceFileRestore.ok, true);
  assert.equal(fileRestore.workspaceFileRestore.dryRun, false);
  assert.ok(fileRestore.workspaceFileRestore.appliedActions.some((item) => item.action === "write" && item.path === "docs/state.txt"));
  assert.ok(fileRestore.workspaceFileRestore.appliedActions.some((item) => item.action === "delete" && item.path === "docs/extra.txt"));

  const restoredFile = await rpc(server, auth, "agent_workspaces.file.download", {
    workspaceId,
    path: "docs/state.txt"
  });
  assert.equal(restoredFile.content, "OpenClaw line");
  const removedFile = await rpc(server, auth, "agent_workspaces.file.stat", {
    workspaceId,
    path: "docs/extra.txt"
  });
  assert.equal(removedFile.exists, false);

  const revertScope = await rpc(server, auth, "workspace.operation.revert.scope", {
    operationId: "workspace.checkpoint.restore",
    limit: 20
  });
  assert.equal(revertScope.ok, true);
  assert.equal(revertScope.canApply, true);
  assert.ok(revertScope.scope.some((item) => item.operationId === "workspace.checkpoint.restore"));

  console.log("workspace checkpoint protocol verification passed");
} finally {
  await server.close();
  await fs.rm(userDataPath, { recursive: true, force: true });
}
