#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const rawText = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    payload: rawText.trim() ? JSON.parse(rawText) : {}
  };
}

function apiKeyHeaders(token) {
  return {
    "Content-Type": "application/json",
    "X-Pact-Api-Key": token
  };
}

function mcpRequest(method, params = {}, id = 1) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params
  };
}

let mcpId = 100;

async function callMcp(baseUrl, token, operation, input = {}) {
  mcpId += 1;
  const response = await callMcpRaw(baseUrl, token, operation, input, mcpId);
  assert.equal(response.status, 200);
  assert.equal(response.payload.error, undefined, JSON.stringify(response.payload.error || {}, null, 2));
  return response.payload.result.structuredContent.payload;
}

async function callMcpRaw(baseUrl, token, operation, input = {}, id = 1) {
  return fetchJson(`${baseUrl}/mcp`, {
    method: "POST",
    headers: apiKeyHeaders(token),
    body: JSON.stringify(mcpRequest("tools/call", {
      name: "pact.sharedspace",
      arguments: {
        apiVersion: "pact.mcp.v1",
        operation,
        input,
        clientVersion: "verify-workspace-local-dir-sync"
      }
    }, id))
  });
}

function valuesForKey(value, keyName) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => valuesForKey(item, keyName));
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => [
    ...(key === keyName ? [child] : []),
    ...valuesForKey(child, keyName)
  ]);
}

function assertAuditTrail(payload, operationId, { label, minCount, readOnly, sourcePath, targetPath, expectInputScope = !readOnly }) {
  assert.ok(Array.isArray(payload.items), `${label} should return audit items`);
  assert.ok(payload.count >= minCount, `${label} should include at least ${minCount} ${operationId} items`);
  const matchingItems = payload.items.filter((item) => item.operationId === operationId);
  assert.ok(matchingItems.length >= minCount, `${label} should include ${operationId} entries`);
  const item = matchingItems[0];
  assert.equal(item.transport, "tool-management", `${label} should be recorded through MCP tool-management`);
  assert.equal(item.status, "ok", `${label} should record successful operations`);
  assert.equal(item.readOnly, readOnly, `${label} should preserve read-only metadata`);
  assert.ok(item.inputHash, `${label} should store a stable input hash`);
  assert.ok(item.createdAt, `${label} should store creation time`);
  assert.ok(item.actor?.userId, `${label} should store the MCP grant actor`);
  const redactedInputText = JSON.stringify(item.redactedInput || {});
  if (expectInputScope) {
    assert.ok(
      valuesForKey(item.redactedInput, "targetPath").includes(targetPath),
      `${label} should preserve workspace target scope: ${redactedInputText}`
    );
    assert.ok(
      valuesForKey(item.redactedInput, "workspaceId").length > 0 || valuesForKey(item.redactedInput, "workspaceRef").length > 0,
      `${label} should preserve workspace identity`
    );
  } else {
    assert.deepEqual(item.redactedInput || {}, {}, `${label} should not persist read-only input`);
  }
  if (sourcePath) {
    const inputText = redactedInputText;
    assert.equal(inputText.includes(sourcePath), false, `${label} should not leak the local source path`);
    assert.equal(valuesForKey(item.redactedInput, "sourcePath").includes(sourcePath), false, `${label} should redact the local source path`);
  }
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-local-dir-sync-server-"));
const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), "pact-local-dir-source-"));
let server = null;

try {
  await fs.mkdir(path.join(sourceDir, "nested"), { recursive: true });
  await fs.writeFile(path.join(sourceDir, "one.txt"), "local one\n", "utf8");
  await fs.writeFile(path.join(sourceDir, "nested", "two.txt"), "local two\n", "utf8");

  server = await startHttpServer({
    userDataPath,
    distPath: "",
    port: 0,
    runtimeOptions: { profile: "minimal" }
  });
  await installAuthenticatedFetch(server);

  const grant = await fetchJson(`${server.url}/api/mcp/local-grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pact-safety-confirm": "true" },
    body: JSON.stringify({
      targets: ["codex"],
      label: "verify-local-dir-sync",
      connectorVersion: "verify",
      grantMode: "maintain",
      toolsets: ["pact.agent.workspace", "pact.agent.workspace.maintain", "pact.storage.read", "pact.storage.write"]
    })
  });
  assert.equal(grant.status, 201, JSON.stringify(grant.payload, null, 2));
  assert.ok(grant.payload.token);

  const created = await callMcp(server.url, grant.payload.token, "pact.workspace.create", {
    title: "Local directory sync verification",
    objective: "Verify Pact-hosted sharedspace can sync from a local filesystem directory."
  });
  const workspaceId = created.workspace.workspaceRef || created.workspace.workspaceId;
  assert.ok(workspaceId);

  const firstPlan = await callMcp(server.url, grant.payload.token, "pact.sharedspace.sync.plan", {
    workspaceId,
    sourcePath: sourceDir,
    targetPath: "mirror",
    deleteExtraneous: true
  });
  assert.equal(firstPlan.ok, true);
  assert.equal(firstPlan.dryRun, true);
  assert.equal(firstPlan.summary.create, 2);
  assert.equal(firstPlan.summary.changed, 2);
  assert.ok(firstPlan.actions.every((action) => !action.absolutePath));

  const firstApply = await callMcp(server.url, grant.payload.token, "pact.sharedspace.sync.apply", {
    workspaceId,
    sourcePath: sourceDir,
    targetPath: "mirror",
    deleteExtraneous: true
  });
  assert.equal(firstApply.ok, true);
  assert.equal(firstApply.dryRun, false);
  assert.equal(firstApply.summary.applied, 2);
  assert.ok(firstApply.stateCommit?.commitId, "sync apply should return a state commit");
  assert.ok(firstApply.stateCommit?.eventHash, "sync apply should return an event hash");
  assert.ok(firstApply.stateCommit?.afterRoot, "sync apply should return an afterRoot");
  assert.ok(firstApply.checkpoint?.treeId, "sync apply should create a workspace_files checkpoint");

  const firstDownload = await callMcp(server.url, grant.payload.token, "pact.workspace.file.download", {
    workspaceId,
    path: "mirror/nested/two.txt"
  });
  assert.equal(firstDownload.ok, true);
  assert.equal(firstDownload.content, "local two\n");
  assert.equal(firstDownload.cacheReceipt?.cacheFamily, "merkle-radix-compatible");
  assert.equal(firstDownload.cacheReceipt?.hit, true);
  assert.ok(firstDownload.cacheReceipt?.proofHash);

  await fs.writeFile(path.join(sourceDir, "one.txt"), "local one changed\n", "utf8");
  await fs.rm(path.join(sourceDir, "nested", "two.txt"));
  await fs.writeFile(path.join(sourceDir, "three.txt"), "local three\n", "utf8");

  const secondPlan = await callMcp(server.url, grant.payload.token, "pact.sharedspace.sync.plan", {
    workspaceId,
    sourcePath: sourceDir,
    targetPath: "mirror",
    deleteExtraneous: true
  });
  assert.equal(secondPlan.ok, true);
  assert.equal(secondPlan.summary.write, 1);
  assert.equal(secondPlan.summary.create, 1);
  assert.equal(secondPlan.summary.delete, 1);
  assert.ok(secondPlan.actions.some((action) => action.action === "delete" && action.targetPath === "mirror/nested/two.txt"));

  const secondApply = await callMcp(server.url, grant.payload.token, "pact.sharedspace.sync.apply", {
    workspaceId,
    sourcePath: sourceDir,
    targetPath: "mirror",
    deleteExtraneous: true
  });
  assert.equal(secondApply.ok, true);
  assert.equal(secondApply.summary.applied, 3);
  assert.ok(secondApply.stateCommit?.commitId);
  assert.notEqual(secondApply.stateCommit.afterRoot, firstApply.stateCommit.afterRoot);

  const changedDownload = await callMcp(server.url, grant.payload.token, "pact.workspace.file.download", {
    workspaceId,
    path: "mirror/one.txt"
  });
  assert.equal(changedDownload.content, "local one changed\n");
  const deletedStat = await callMcp(server.url, grant.payload.token, "pact.workspace.file.stat", {
    workspaceId,
    path: "mirror/nested/two.txt"
  });
  assert.equal(deletedStat.exists, false);
  assert.equal(deletedStat.cacheReceipt?.hit, false);
  assert.ok(deletedStat.cacheReceipt?.proofHash);

  const planAudit = await callMcp(server.url, grant.payload.token, "pact.workspace.audit.query", {
    operationId: "sharedspace.sync.plan",
    limit: 20
  });
  assertAuditTrail(planAudit, "sharedspace.sync.plan", {
    label: "sync plan audit query",
    minCount: 2,
    readOnly: true,
    sourcePath: sourceDir,
    targetPath: "mirror",
    expectInputScope: false
  });

  const applyAudit = await callMcp(server.url, grant.payload.token, "pact.workspace.audit.query", {
    operationId: "sharedspace.sync.apply",
    limit: 20
  });
  assertAuditTrail(applyAudit, "sharedspace.sync.apply", {
    label: "sync apply audit query",
    minCount: 2,
    readOnly: false,
    sourcePath: sourceDir,
    targetPath: "mirror"
  });

  const applyHistory = await callMcp(server.url, grant.payload.token, "pact.workspace.operation.history", {
    operationId: "sharedspace.sync.apply",
    limit: 20
  });
  assertAuditTrail(applyHistory, "sharedspace.sync.apply", {
    label: "sync apply operation history",
    minCount: 2,
    readOnly: false,
    sourcePath: sourceDir,
    targetPath: "mirror"
  });

  const revertScope = await callMcp(server.url, grant.payload.token, "pact.workspace.operation.revert.scope", {
    operationId: "sharedspace.sync.apply",
    limit: 20,
    confirm: true
  });
  assert.equal(revertScope.canApply, true, "sync apply history should be eligible for manual revert planning");
  assert.ok(revertScope.reversibleCount >= 2, "sync apply history should expose reversible audit entries");
  assert.ok(revertScope.scope.every((item) => item.operationId === "sharedspace.sync.apply"));
  assert.ok(revertScope.scope.every((item) => item.inputHash));
  assert.ok(revertScope.actions.every((action) => action.action === "manual_revert_required"));

  if (process.platform !== "win32") {
    await fs.symlink(path.join(sourceDir, "one.txt"), path.join(sourceDir, "linked.txt"));
    const symlinkPlan = await callMcpRaw(server.url, grant.payload.token, "pact.sharedspace.sync.plan", {
      workspaceId,
      sourcePath: sourceDir,
      targetPath: "mirror"
    }, 999);
    assert.equal(symlinkPlan.status, 200);
    assert.equal(symlinkPlan.payload.error?.data?.status, 400);
  }

  console.log("workspace local-dir sync verification passed");
} finally {
  if (server?.close) {
    await server.close();
  }
  await fs.rm(userDataPath, { recursive: true, force: true }).catch(() => {});
  await fs.rm(sourceDir, { recursive: true, force: true }).catch(() => {});
}
