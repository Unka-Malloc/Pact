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
      toolsets: ["pact.agent.workspace", "pact.storage.read", "pact.storage.write"]
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
