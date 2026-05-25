#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";

async function fetchJsonResponse(url, options = {}) {
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

async function subscribeMcpOperationReplies(baseUrl, token) {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "GET",
    headers: apiKeyHeaders(token),
    signal: controller.signal
  });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const replies = [];
  const waiters = [];

  function resolveWaiters() {
    for (const waiter of [...waiters]) {
      const match = replies.find(waiter.predicate);
      if (!match) {
        continue;
      }
      clearTimeout(waiter.timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(match);
    }
  }

  function pushEvent(rawEvent) {
    const dataLines = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim());
    if (!dataLines.length) {
      return;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(dataLines.join("\n"));
    } catch {
      return;
    }
    if (parsed.method === "notifications/pact/operation_reply") {
      replies.push(parsed);
      resolveWaiters();
    }
  }

  const pump = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() || "";
        for (const event of events) {
          pushEvent(event);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        throw error;
      }
    }
  })();

  return {
    waitFor(predicate, timeoutMs = 5000) {
      const existing = replies.find(predicate);
      if (existing) {
        return Promise.resolve(existing);
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          timer: setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) {
              waiters.splice(index, 1);
            }
            reject(new Error("Timed out waiting for MCP operation_reply."));
          }, timeoutMs)
        };
        waiters.push(waiter);
      });
    },
    async close() {
      controller.abort();
      try {
        await pump;
      } catch {
        // Expected when the SSE fetch is aborted.
      }
    }
  };
}

async function callWorkspaceMcp(baseUrl, token, operation, input = {}, id = 1) {
  const response = await fetchJsonResponse(`${baseUrl}/mcp`, {
    method: "POST",
    headers: apiKeyHeaders(token),
    body: JSON.stringify(mcpRequest("tools/call", {
      name: "pact.sharedspace",
      arguments: {
        apiVersion: "pact.mcp.v1",
        operation,
        input
      }
    }, id))
  });
  assert.equal(response.status, 200);
  assert.equal(response.payload.error, undefined, JSON.stringify(response.payload.error || {}, null, 2));
  return response.payload.result.structuredContent.payload;
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-agent-workspace-files-"));
const localDownloadPath = path.join(userDataPath, "downloaded-a.txt");
const server = await startHttpServer({
  userDataPath,
  distPath: "",
  port: 0,
  runtimeOptions: { profile: "minimal" }
});
await installAuthenticatedFetch(server);

let operationReplies = null;

try {
  const localGrant = await fetchJsonResponse(`${server.url}/api/mcp/local-grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pact-safety-confirm": "true" },
    body: JSON.stringify({
      targets: ["codex"],
      label: "verify-mcp-workspace-files",
      toolsets: ["pact.agent.workspace", "pact.storage.read", "pact.storage.write"]
    })
  });
  assert.equal(localGrant.status, 201);
  assert.equal(localGrant.payload.ok, true);
  assert.ok(localGrant.payload.token);
  assert.equal(localGrant.payload.scopes.includes("knowledge:write"), true);
  assert.equal(localGrant.payload.scopes.includes("storage:write"), true);
  assert.equal(localGrant.payload.toolsets.includes("pact.agent.workspace"), true);
  assert.equal(localGrant.payload.toolsets.includes("pact.storage.write"), true);

  const tools = await fetchJsonResponse(`${server.url}/mcp`, {
    method: "POST",
    headers: apiKeyHeaders(localGrant.payload.token),
    body: JSON.stringify(mcpRequest("tools/list", {}, 2))
  });
  assert.equal(tools.status, 200);
  assert.ok(tools.payload.result.tools.some((tool) => tool.name === "pact.sharedspace"));

  operationReplies = await subscribeMcpOperationReplies(server.url, localGrant.payload.token);

  const created = await callWorkspaceMcp(
    server.url,
    localGrant.payload.token,
    "pact.workspace.create",
    {
      title: "MCP Workspace File Flow",
      objective: "Verify workspace folder, file upload, stat, and download through MCP."
    },
    3
  );
  const workspace = created.workspace;
  const workspaceId = workspace.workspaceId || workspace.workspaceRef;
  assert.ok(workspaceId);
  assert.equal(workspace.metadata.defaultAdminUserId, localGrant.payload.grant.id);
  assert.equal(workspace.metadata.adminUserIds.includes(localGrant.payload.grant.id), true);

  const folderPath = "files/mcp-demo";
  const folder = await callWorkspaceMcp(
    server.url,
    localGrant.payload.token,
    "pact.workspace.folder.create",
    {
      workspaceId,
      folderPath
    },
    4
  );
  assert.equal(folder.ok, true);
  assert.equal(folder.folder.relativePath, folderPath);
  assert.equal(folder.folder.type, "directory");

  const beforeUpload = await callWorkspaceMcp(
    server.url,
    localGrant.payload.token,
    "pact.workspace.files.list",
    {
      workspaceId,
      path: "files",
      recursive: true
    },
    5
  );
  assert.equal(beforeUpload.ok, true);
  assert.ok(beforeUpload.paths.includes(folderPath));

  const sampleContent = "hello from Pact MCP workspace file flow\n";
  const upload = await callWorkspaceMcp(
    server.url,
    localGrant.payload.token,
    "pact.workspace.file.upload",
    {
      workspaceId,
      folderPath,
      fileName: "a.txt",
      content: sampleContent,
      status: "draft",
      createdBy: "verify-mcp-workspace-files"
    },
    6
  );
  assert.equal(upload.ok, true);
  assert.equal(upload.file.relativePath, `${folderPath}/a.txt`);
  assert.equal(upload.file.type, "file");
  assert.equal(upload.artifact.title, "a.txt");
  assert.equal(upload.artifact.content, sampleContent);
  const uploadReply = await operationReplies.waitFor((event) =>
    event.params?.operation === "pact.workspace.file.upload" &&
    event.params?.status === "completed"
  );
  assert.equal(uploadReply.params.target.targetKind, "sharedspace");
  assert.ok(uploadReply.params.target.targetRef || uploadReply.params.target.workspaceId);

  const afterUpload = await callWorkspaceMcp(
    server.url,
    localGrant.payload.token,
    "pact.workspace.files.list",
    {
      workspaceId,
      path: "files",
      recursive: true
    },
    7
  );
  assert.ok(afterUpload.paths.includes(`${folderPath}/a.txt`));

  const stat = await callWorkspaceMcp(
    server.url,
    localGrant.payload.token,
    "pact.workspace.file.stat",
    {
      workspaceId,
      path: `${folderPath}/a.txt`
    },
    8
  );
  assert.equal(stat.exists, true);
  assert.equal(stat.file.relativePath, `${folderPath}/a.txt`);
  assert.equal(stat.file.sizeBytes, Buffer.byteLength(sampleContent));
  assert.match(stat.file.contentSha256, /^[a-f0-9]{64}$/);

  const missingStat = await callWorkspaceMcp(
    server.url,
    localGrant.payload.token,
    "pact.workspace.file.stat",
    {
      workspaceId,
      path: `${folderPath}/missing.txt`
    },
    9
  );
  assert.equal(missingStat.ok, true);
  assert.equal(missingStat.exists, false);
  assert.equal(missingStat.file.relativePath, `${folderPath}/missing.txt`);

  const download = await callWorkspaceMcp(
    server.url,
    localGrant.payload.token,
    "pact.workspace.file.download",
    {
      workspaceId,
      path: `${folderPath}/a.txt`
    },
    10
  );
  assert.equal(download.ok, true);
  assert.equal(download.file.relativePath, `${folderPath}/a.txt`);
  assert.equal(download.content, sampleContent);
  await fs.writeFile(localDownloadPath, Buffer.from(download.contentBase64, "base64"));
  assert.equal(await fs.readFile(localDownloadPath, "utf8"), sampleContent);

  const readOnlyGrant = await fetchJsonResponse(`${server.url}/api/mcp/local-grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targets: ["codex"],
      label: "verify-mcp-workspace-files-readonly",
      scopes: ["knowledge:read", "storage:read"]
    })
  });
  assert.equal(readOnlyGrant.status, 201);

  const deniedUpload = await fetchJsonResponse(`${server.url}/mcp`, {
    method: "POST",
    headers: apiKeyHeaders(readOnlyGrant.payload.token),
    body: JSON.stringify(mcpRequest("tools/call", {
      name: "pact.sharedspace",
      arguments: {
        apiVersion: "pact.mcp.v1",
        operation: "pact.workspace.file.upload",
        input: {
          workspaceId,
          folderPath,
          fileName: "denied.txt",
          content: "denied"
        }
      }
    }, 11))
  });
  assert.equal(deniedUpload.status, 403);
  assert.equal(deniedUpload.payload.error.data.code, "missing_scopes");

  console.log("agent-workspace-file-upload verification passed");
} finally {
  if (operationReplies) {
    await operationReplies.close();
  }
  await server.close();
  await fs.rm(userDataPath, { recursive: true, force: true });
}
