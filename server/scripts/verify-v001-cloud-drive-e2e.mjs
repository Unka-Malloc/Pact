#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  SERVER_API_OPERATIONS,
  buildApiPathForCliOperation,
  findCliOperation
} from "../platform/common/operation-dispatcher/operation-registry.mjs";
import { PROTOCOL_OPERATION_IDS } from "../platform/common/operation-dispatcher/protocol-operation-definitions.mjs";
import { createToolCatalog } from "../platform/specialized/capabilities/tools/tool-management-core/catalog.mjs";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { authHeaders, installAuthenticatedFetch } from "./test-auth-helper.mjs";

const REQUIRED_OPERATIONS = [
  "sharedspace.drive.connect",
  "sharedspace.drive.status",
  "sharedspace.drive.item.list",
  "sharedspace.drive.file.download",
  "sharedspace.drive.file.upload",
  "sharedspace.drive.sync.plan",
  "sharedspace.drive.sync.apply",
  "sharedspace.drive.permission.list"
];

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const rawText = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    payload: rawText.trim() ? JSON.parse(rawText) : {}
  };
}

function mcpHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
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

let mcpRequestId = 0;

async function callMcpStructured({ serverUrl, token, operation, input = {}, toolName = "pact.sharedspace" }) {
  mcpRequestId += 1;
  const response = await fetchJson(`${serverUrl}/mcp`, {
    method: "POST",
    headers: mcpHeaders(token),
    body: JSON.stringify(mcpRequest("tools/call", {
      name: toolName,
      arguments: {
        apiVersion: "pact.mcp.v1",
        operation,
        input,
        clientVersion: "verify-v001-cloud-drive-e2e"
      }
    }, mcpRequestId))
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload, null, 2));
  assert.equal(response.payload.error, undefined, JSON.stringify(response.payload.error || {}, null, 2));
  return response.payload.result.structuredContent;
}

async function callMcp({ serverUrl, token, operation, input = {}, toolName = "pact.sharedspace" }) {
  const structuredContent = await callMcpStructured({ serverUrl, token, operation, input, toolName });
  return structuredContent.payload || structuredContent;
}

function assertPublicPayloadDoesNotLeak(payload, forbiddenText, label) {
  assert.equal(
    JSON.stringify(payload).includes(forbiddenText),
    false,
    `${label} must not expose private local path or secret values`
  );
}

const operationsById = new Map(SERVER_API_OPERATIONS.map((operation) => [operation.id, operation]));
const toolsByOperationId = new Map(
  createToolCatalog({ operations: SERVER_API_OPERATIONS }).tools
    .filter((tool) => tool.operationId)
    .map((tool) => [tool.operationId, tool])
);

for (const operationId of REQUIRED_OPERATIONS) {
  assert.equal(PROTOCOL_OPERATION_IDS.includes(operationId), true, `${operationId} must be a protocol operation`);
  const operation = operationsById.get(operationId);
  assert.ok(operation, `${operationId} must be registered`);
  assert.ok(operation.http?.path, `${operationId} must expose HTTP API`);
  assert.equal(operation.rpc?.method, operationId, `${operationId} must expose RPC method`);
  assert.ok(operation.cli?.command?.length, `${operationId} must expose CLI command`);
  const cliEntry = findCliOperation(operation.cli.command);
  assert.equal(cliEntry?.operation?.id, operationId, `${operationId} CLI command must resolve`);
  const cliPath = buildApiPathForCliOperation(operation, {
    workspaceId: "workspace_verify",
    driveRef: "drive_verify",
    path: "folder/file.txt"
  });
  assert.ok(cliPath.startsWith("/api/sharedspace/drive/"), `${operationId} CLI path must target cloud drive API`);
  const tool = toolsByOperationId.get(operationId);
  assert.ok(tool, `${operationId} must be exposed through Tool Management`);
  assert.ok(tool.id.startsWith("pact.sharedspace.drive."), `${operationId} must map to pact.sharedspace.drive namespace`);
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-v001-cloud-drive-"));
const icloudRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pact-icloud-drive-"));
let server = null;

try {
  await fs.mkdir(path.join(icloudRoot, ".pact-data", "owner"), { recursive: true });
  await fs.mkdir(path.join(icloudRoot, ".pact-data", "public"), { recursive: true });
  await fs.mkdir(path.join(icloudRoot, "TeamDocs"), { recursive: true });
  await fs.writeFile(path.join(icloudRoot, ".pact-data", "owner", "note.txt"), "icloud default writable space\n", "utf8");
  await fs.writeFile(path.join(icloudRoot, ".pact-data", "public", "readme.txt"), "icloud public readonly space\n", "utf8");
  await fs.writeFile(path.join(icloudRoot, "TeamDocs", "team.txt"), "icloud exposed readonly directory\n", "utf8");

  server = await startHttpServer({
    userDataPath,
    distPath: "",
    port: 0,
    runtimeOptions: {
      profile: "minimal"
    }
  });
  const auth = await installAuthenticatedFetch(server, { safetyConfirm: true });

  const workspace = await fetchJson(`${server.url}/api/agent-workspaces`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      title: "Cloud Drive verification",
      objective: "Verify CloudDrivePort mediated sharedspace projections."
    })
  });
  assert.equal(workspace.status, 201, JSON.stringify(workspace.payload, null, 2));
  const workspaceId = workspace.payload.workspace.workspaceId;

  const inlineSecret = await fetchJson(`${server.url}/api/sharedspace/drive/connect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      workspaceId,
      provider: "onedrive",
      secretRef: "secret://pact/drive/onedrive-oauth",
      accessToken: "must-not-be-stored"
    })
  });
  assert.equal(inlineSecret.status, 400, JSON.stringify(inlineSecret.payload, null, 2));

  const icloudConnect = await fetchJson(`${server.url}/api/sharedspace/drive/connect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      workspaceId,
      provider: "icloud",
      rootPath: icloudRoot,
      managedFolder: true,
      managedFolderRoot: ".pact-data",
      publicFolder: "public",
      allowedClients: ["owner", "codex"],
      defaultClient: "owner",
      directoryMappings: [
        {
          name: "Team Docs",
          alias: "team",
          drivePath: "TeamDocs",
          accessPolicy: { mode: "all" }
        }
      ]
    })
  });
  assert.equal(icloudConnect.status, 200, JSON.stringify(icloudConnect.payload, null, 2));
  assert.equal(icloudConnect.payload.localAdapterVerified, true);
  assert.equal(icloudConnect.payload.contractVerified, false);
  assert.ok(icloudConnect.payload.drive.driveRef);
  assert.equal(icloudConnect.payload.drive.managedFolder.spaces.default.writable, true);
  assert.equal(icloudConnect.payload.drive.managedFolder.spaces.public.writable, false);
  assert.equal(icloudConnect.payload.drive.directoryMappings.some((mapping) => mapping.alias === "default" && mapping.writable === true), true);
  assert.equal(icloudConnect.payload.drive.directoryMappings.some((mapping) => mapping.alias === "public" && mapping.writable === false), true);
  assert.equal(icloudConnect.payload.drive.directoryMappings.some((mapping) => mapping.alias === "team" && mapping.writable === false), true);
  assertPublicPayloadDoesNotLeak(icloudConnect.payload, icloudRoot, "iCloud connect payload");
  const icloudDriveRef = icloudConnect.payload.drive.driveRef;
  await fs.access(path.join(icloudRoot, ".pact-data", "codex"));

  const configPath = path.join(userDataPath, "agent-workspaces", "cloud-drive-connections.json");
  const configText = await fs.readFile(configPath, "utf8");
  assert.equal(configText.includes("must-not-be-stored"), false, "runtime drive config must not store inline secrets");
  assert.equal(configText.includes(icloudRoot), true, "private iCloud root may only be stored in runtime data dir config");

  const rpcStatus = await fetchJson(`${server.url}/api/rpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify(mcpRequest("sharedspace.drive.status", {
      workspaceId,
      driveRef: icloudDriveRef
    }, "rpc-drive-status"))
  });
  assert.equal(rpcStatus.status, 200, JSON.stringify(rpcStatus.payload, null, 2));
  assert.equal(rpcStatus.payload.result.count, 1);
  assertPublicPayloadDoesNotLeak(rpcStatus.payload, icloudRoot, "RPC status payload");

  const list = await fetchJson(`${server.url}/api/sharedspace/drive/items?${new URLSearchParams({
    workspaceId,
    driveRef: icloudDriveRef,
    clientId: "owner",
    path: "default",
    recursive: "true",
    includeHash: "true"
  })}`, {
    headers: authHeaders(auth)
  });
  assert.equal(list.status, 200, JSON.stringify(list.payload, null, 2));
  assert.equal(list.payload.localAdapterVerified, true);
  assert.ok(list.payload.paths.includes(".pact-data/owner/note.txt"));
  assert.equal(list.payload.mapping.spaceKind, "agentDefault");
  assert.equal(list.payload.mapping.writable, true);
  assert.ok(list.payload.accessReceipt?.receiptId, "drive list must emit access receipt");
  assertPublicPayloadDoesNotLeak(list.payload, icloudRoot, "iCloud list payload");

  const download = await fetchJson(`${server.url}/api/sharedspace/drive/files/download?${new URLSearchParams({
    workspaceId,
    driveRef: icloudDriveRef,
    clientId: "owner",
    path: "default/note.txt",
    includeText: "true"
  })}`, {
    headers: authHeaders(auth)
  });
  assert.equal(download.status, 200, JSON.stringify(download.payload, null, 2));
  assert.equal(download.payload.content, "icloud default writable space\n");
  assert.ok(download.payload.transferReceipt?.transferReceiptId, "drive download must emit transfer receipt");
  assert.equal(download.payload.transferReceipt.state, "staged");

  const publicDownload = await fetchJson(`${server.url}/api/sharedspace/drive/files/download?${new URLSearchParams({
    workspaceId,
    driveRef: icloudDriveRef,
    clientId: "owner",
    path: "public/readme.txt",
    includeText: "true"
  })}`, {
    headers: authHeaders(auth)
  });
  assert.equal(publicDownload.status, 200, JSON.stringify(publicDownload.payload, null, 2));
  assert.equal(publicDownload.payload.content, "icloud public readonly space\n");
  assert.equal(publicDownload.payload.mapping.spaceKind, "public");
  assert.equal(publicDownload.payload.mapping.writable, false);

  const exposedDownload = await fetchJson(`${server.url}/api/sharedspace/drive/files/download?${new URLSearchParams({
    workspaceId,
    driveRef: icloudDriveRef,
    clientId: "owner",
    path: "team/team.txt",
    includeText: "true"
  })}`, {
    headers: authHeaders(auth)
  });
  assert.equal(exposedDownload.status, 200, JSON.stringify(exposedDownload.payload, null, 2));
  assert.equal(exposedDownload.payload.content, "icloud exposed readonly directory\n");
  assert.equal(exposedDownload.payload.mapping.spaceKind, "advancedExposure");
  assert.equal(exposedDownload.payload.mapping.writable, false);

  const upload = await fetchJson(`${server.url}/api/sharedspace/drive/files/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      workspaceId,
      driveRef: icloudDriveRef,
      clientId: "owner",
      path: "default/uploaded.txt",
      content: "uploaded through Pact\n"
    })
  });
  assert.equal(upload.status, 201, JSON.stringify(upload.payload, null, 2));
  assert.equal(await fs.readFile(path.join(icloudRoot, ".pact-data", "owner", "uploaded.txt"), "utf8"), "uploaded through Pact\n");
  assert.equal(upload.payload.mapping.spaceKind, "agentDefault");
  assert.equal(upload.payload.mapping.writable, true);
  assert.ok(upload.payload.policyDecision?.decisionId, "drive upload must return policy decision");
  assert.ok(upload.payload.checkpoint?.checkpointId, "drive upload must return checkpoint");
  assert.ok(upload.payload.transferReceipt?.transferReceiptId, "drive upload must return transfer receipt");
  assert.equal(upload.payload.transferReceipt.state, "projected");

  const publicUpload = await fetchJson(`${server.url}/api/sharedspace/drive/files/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      workspaceId,
      driveRef: icloudDriveRef,
      clientId: "owner",
      path: "public/blocked.txt",
      content: "must not write public\n"
    })
  });
  assert.equal(publicUpload.status, 400, JSON.stringify(publicUpload.payload, null, 2));

  const exposedUpload = await fetchJson(`${server.url}/api/sharedspace/drive/files/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      workspaceId,
      driveRef: icloudDriveRef,
      clientId: "owner",
      path: "team/blocked.txt",
      content: "must not write exposed directory\n"
    })
  });
  assert.equal(exposedUpload.status, 400, JSON.stringify(exposedUpload.payload, null, 2));

  const syncPlan = await fetchJson(`${server.url}/api/sharedspace/drive/sync/plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      workspaceId,
      driveRef: icloudDriveRef,
      clientId: "owner",
      targetPath: "cloud-drive"
    })
  });
  assert.equal(syncPlan.status, 200, JSON.stringify(syncPlan.payload, null, 2));
  assert.equal(syncPlan.payload.dryRun, true);
  assert.ok(syncPlan.payload.actions.length >= 2, "iCloud local adapter sync plan should include local files");

  const syncApply = await fetchJson(`${server.url}/api/sharedspace/drive/sync/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, { method: "POST" })
    },
    body: JSON.stringify({
      workspaceId,
      driveRef: icloudDriveRef,
      clientId: "owner",
      targetPath: "cloud-drive",
      confirm: true
    })
  });
  assert.equal(syncApply.status, 200, JSON.stringify(syncApply.payload, null, 2));
  assert.equal(syncApply.payload.dryRun, false);
  assert.equal(syncApply.payload.syncReceipt.state, "projected");
  assert.equal(syncApply.payload.remoteSyncInvoked, false);
  assert.ok(syncApply.payload.checkpoint?.checkpointId, "drive sync apply must return checkpoint");

  const providerRefs = {};
  for (const provider of ["onedrive", "google-drive", "dropbox"]) {
    const connected = await fetchJson(`${server.url}/api/sharedspace/drive/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(auth, { method: "POST" })
      },
      body: JSON.stringify({
        workspaceId,
        provider,
        secretRef: `secret://pact/drive/${provider}-oauth`,
        mode: "contract",
        managedFolder: true,
        managedFolderRoot: ".pact-data",
        publicFolder: "public",
        allowedClients: ["owner", "codex"],
        defaultClient: "owner",
        directoryMappings: [
          {
            name: "Team Docs",
            alias: "team",
            drivePath: "TeamDocs",
            accessPolicy: { mode: "all" }
          }
        ]
      })
    });
    assert.equal(connected.status, 200, JSON.stringify(connected.payload, null, 2));
    assert.equal(connected.payload.contractVerified, true, `${provider} must be contractVerified without real OAuth credentials`);
    assert.equal(connected.payload.drive.secretRef, `secret://pact/drive/${provider}-oauth`);
    assert.equal(connected.payload.drive.managedFolder.spaces.default.writable, true);
    assert.equal(connected.payload.drive.managedFolder.spaces.public.writable, false);
    assert.equal(connected.payload.drive.directoryMappings.some((mapping) => mapping.alias === "team" && mapping.writable === false), true);
    assert.equal(JSON.stringify(connected.payload).includes("accessToken"), false);
    providerRefs[provider] = connected.payload.drive.driveRef;
  }

  const dropboxPermissions = await fetchJson(`${server.url}/api/sharedspace/drive/permissions?${new URLSearchParams({
    workspaceId,
    driveRef: providerRefs.dropbox
  })}`, {
    headers: authHeaders(auth)
  });
  assert.equal(dropboxPermissions.status, 200, JSON.stringify(dropboxPermissions.payload, null, 2));
  assert.equal(dropboxPermissions.payload.contractVerified, true);
  assert.equal(JSON.stringify(dropboxPermissions.payload).includes("accessToken"), false);
  assert.equal(JSON.stringify(dropboxPermissions.payload).includes("refreshToken"), false);

  const grant = await fetchJson(`${server.url}/api/mcp/local-grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-pact-safety-confirm": "true"
    },
    body: JSON.stringify({
      targets: ["codex"],
      label: "verify-cloud-drive",
      connectorVersion: "verify",
      grantMode: "maintain",
      toolsets: [
        "pact.drive.read",
        "pact.drive.write",
        "pact.drive.sync",
        "pact.drive.share",
        "pact.agent.workspace.read"
      ]
    })
  });
  assert.equal(grant.status, 201, JSON.stringify(grant.payload, null, 2));

  const capabilities = await callMcp({
    serverUrl: server.url,
    token: grant.payload.token,
    toolName: "pact.discovery",
    operation: "pact.capabilities.list",
    input: {}
  });
  const operationNames = new Set((capabilities.operations || []).map((tool) => tool.name));
  for (const operationName of REQUIRED_OPERATIONS.map((operationId) => toolsByOperationId.get(operationId).id)) {
    assert.equal(operationNames.has(operationName), true, `${operationName} must be visible in MCP capabilities`);
  }

  const mcpListStructured = await callMcpStructured({
    serverUrl: server.url,
    token: grant.payload.token,
    operation: "pact.sharedspace.drive.item.list",
    input: {
      workspaceId,
      driveRef: providerRefs["google-drive"],
      clientId: "codex",
      recursive: true
    }
  });
  const mcpList = mcpListStructured.payload;
  assert.equal(mcpList.ok, true);
  assert.equal(mcpList.contractVerified, true);
  assert.equal(mcpList.items.every((item) => item.metadataOnly === true), true);
  assert.equal(mcpList.paths.some((itemPath) => itemPath.startsWith(".pact-data/codex/")), true);
  assert.equal(mcpList.paths.some((itemPath) => itemPath.startsWith(".pact-data/public/")), true);
  assert.equal(mcpListStructured.exchange.action, "drive-items-listed");
  assert.equal(mcpListStructured.exchange.driveRef, providerRefs["google-drive"]);
  assert.equal(mcpListStructured.exchange.provider, "google-drive");
  assert.equal(mcpListStructured.exchange.contractVerified, true);
  assert.ok(mcpListStructured.exchange.paths.some((itemPath) => itemPath.startsWith(".pact-data/codex/")));

  const mcpUploadStructured = await callMcpStructured({
    serverUrl: server.url,
    token: grant.payload.token,
    operation: "pact.sharedspace.drive.file.upload",
    input: {
      workspaceId,
      driveRef: providerRefs["google-drive"],
      clientId: "codex",
      path: ".pact-data/codex/mcp-upload.txt",
      content: "mcp cloud drive upload"
    }
  });
  const mcpUpload = mcpUploadStructured.payload;
  assert.equal(mcpUpload.ok, true);
  assert.equal(mcpUpload.contractVerified, true);
  assert.equal(mcpUpload.remoteWriteInvoked, false);
  assert.equal(mcpUploadStructured.exchange.action, "drive-file-uploaded");
  assert.equal(mcpUploadStructured.exchange.driveRef, providerRefs["google-drive"]);
  assert.equal(mcpUploadStructured.exchange.path, ".pact-data/codex/mcp-upload.txt");
  assert.equal(mcpUploadStructured.exchange.transferReceiptId, mcpUpload.transferReceipt.transferReceiptId);
  assert.equal(mcpUploadStructured.exchange.checkpointId, mcpUpload.checkpoint.checkpointId);

  const mcpSyncStructured = await callMcpStructured({
    serverUrl: server.url,
    token: grant.payload.token,
    operation: "pact.sharedspace.drive.sync.apply",
    input: {
      workspaceId,
      driveRef: providerRefs.onedrive,
      clientId: "codex",
      targetPath: "cloud-drive",
      confirm: true
    }
  });
  const mcpSync = mcpSyncStructured.payload;
  assert.equal(mcpSync.ok, true);
  assert.equal(mcpSync.contractVerified, true);
  assert.equal(mcpSync.syncReceipt.state, "contractVerified");
  assert.equal(mcpSync.remoteSyncInvoked, false);
  assert.equal(mcpSyncStructured.exchange.action, "drive-sync-applied");
  assert.equal(mcpSyncStructured.exchange.driveRef, providerRefs.onedrive);
  assert.equal(mcpSyncStructured.exchange.syncReceiptId, mcpSync.syncReceipt.syncReceiptId);
  assert.equal(mcpSyncStructured.exchange.checkpointId, mcpSync.checkpoint.checkpointId);

  const audit = await callMcp({
    serverUrl: server.url,
    token: grant.payload.token,
    operation: "pact.workspace.audit.query",
    input: {
      operationId: "sharedspace.drive.file.upload",
      limit: 20
    }
  });
  assert.ok(audit.items.some((item) => item.operationId === "sharedspace.drive.file.upload"), "drive upload must be queryable from operation audit");
} finally {
  if (server?.close) {
    await server.close();
  }
  await fs.rm(userDataPath, { recursive: true, force: true }).catch(() => {});
  await fs.rm(icloudRoot, { recursive: true, force: true }).catch(() => {});
}

console.log("v0.0.1 cloud drive E2E verification passed");
