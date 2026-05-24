#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SERVER_API_OPERATIONS } from "../platform/common/operation-dispatcher/operation-registry.mjs";
import { createToolCatalog } from "../platform/specialized/capabilities/tools/tool-management-core/catalog.mjs";
import {
  buildClientRuntimeBootstrapPlan,
  CLIENT_RUNTIME_BOOTSTRAP_PROTOCOL_VERSION,
  INLINE_TEXT_MAX_BYTES,
  SCP_SMALL_FILE_MAX_BYTES
} from "../services/client/client-runtime-core/client-runtime-bootstrap.mjs";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const rawText = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    payload: rawText.trim() ? JSON.parse(rawText) : {}
  };
}

function moduleIds(plan) {
  return new Set(plan.modules.map((module) => module.moduleId));
}

function verifyNativeTransportPriority() {
  const plan = buildClientRuntimeBootstrapPlan({
    clientUid: "linux-agent",
    client: {
      os: "linux",
      arch: "x64",
      availableCommands: ["rsync", "ssh", "scp", "sftp"]
    },
    serverCapabilities: {
      ssh: true,
      rsync: true,
      scp: true,
      sftp: true
    },
    modules: ["mcp-local-bridge"],
    transfer: {
      directory: true,
      incremental: true,
      totalBytes: 512 * 1024 * 1024,
      fileCount: 200
    }
  });

  assert.equal(plan.protocolVersion, CLIENT_RUNTIME_BOOTSTRAP_PROTOCOL_VERSION);
  assert.equal(plan.transportPlan.selected, "rsync-over-ssh");
  assert.deepEqual(plan.transportPlan.fallbackOrder.slice(0, 2), ["rsync-over-ssh", "sftp"]);
  assert.ok(plan.transportPlan.fallbackOrder.includes("pact-http-upload-session"));
  const modules = moduleIds(plan);
  assert.ok(modules.has("runtime-framework"));
  assert.ok(modules.has("pact-client-cli"));
  assert.ok(modules.has("clientd"));
  assert.ok(modules.has("upload-queue"));
  assert.ok(modules.has("mcp-local-bridge"));
  assert.ok(modules.has("transport-rsync"));
  assert.ok(modules.has("checkpoint-http-upload"));
}

function verifyScpSmallFileFallback() {
  const plan = buildClientRuntimeBootstrapPlan({
    clientUid: "linux-small",
    client: {
      os: "linux",
      arch: "x64",
      commands: { ssh: true, scp: true, sftp: true }
    },
    serverCapabilities: {
      ssh: true,
      scp: true,
      sftp: true
    },
    modules: ["upload"],
    transfer: {
      totalBytes: SCP_SMALL_FILE_MAX_BYTES - 1,
      fileCount: 1
    }
  });

  assert.equal(plan.transportPlan.selected, "scp");
  assert.ok(plan.transportPlan.fallbackOrder.includes("pact-http-upload-session"));
  const modules = moduleIds(plan);
  assert.ok(modules.has("transport-scp"));
  assert.ok(modules.has("upload-queue"));
}

function verifyPortableFallbacks() {
  const largePlan = buildClientRuntimeBootstrapPlan({
    clientUid: "minimal-container",
    client: {
      os: "linux",
      arch: "x64",
      availableCommands: []
    },
    modules: ["upload.queue"],
    transfer: {
      totalBytes: 64 * 1024 * 1024,
      fileCount: 1
    }
  });
  assert.equal(largePlan.transportPlan.selected, "pact-http-upload-session");
  assert.equal(largePlan.transportPlan.fallbackOrder.includes("mcp-inline-content"), false);
  assert.ok(moduleIds(largePlan).has("checkpoint-http-upload"));

  const tinyPlan = buildClientRuntimeBootstrapPlan({
    clientUid: "tiny-text",
    client: {
      os: "linux",
      arch: "x64",
      availableCommands: []
    },
    modules: ["mcp-local-bridge"],
    transfer: {
      totalBytes: INLINE_TEXT_MAX_BYTES - 1,
      fileCount: 1
    }
  });
  assert.equal(tinyPlan.transportPlan.selected, "pact-http-upload-session");
  assert.ok(tinyPlan.transportPlan.fallbackOrder.includes("mcp-inline-content"));
  assert.ok(moduleIds(tinyPlan).has("transport-mcp-inline"));
}

function verifyOperationRegistry() {
  const operations = new Map(SERVER_API_OPERATIONS.map((operation) => [operation.id, operation]));
  const operation = operations.get("client_runtime.bootstrap.plan");
  assert.ok(operation, "client_runtime.bootstrap.plan operation must be registered");
  assert.equal(operation.http.path, "/api/client-runtime/bootstrap/plan");
  assert.equal(operation.http.method, "POST");
  assert.equal(operation.readOnly, true);
  assert.ok(operation.requiredScopes.includes("knowledge:read"));
}

function verifyToolCatalogExposure() {
  const catalog = createToolCatalog({ operations: SERVER_API_OPERATIONS });
  const tool = catalog.tools.find((item) => item.id === "pact.clientRuntime.bootstrapPlan");
  assert.ok(tool, "pact.clientRuntime.bootstrapPlan tool must be exposed");
  assert.ok(tool.requiredScopes.includes("knowledge:read"));
  assert.ok(tool.toolsets.includes("pact.knowledge.read"));
}

async function verifyHttpEndpoint() {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-client-runtime-bootstrap-"));
  const server = await startHttpServer({
    userDataPath,
    runtimeOptions: { profile: "minimal" }
  });
  await installAuthenticatedFetch(server);
  try {
    const response = await fetchJson(`${server.url}/api/client-runtime/bootstrap/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientUid: "http-linux-agent",
        client: {
          os: "linux",
          arch: "x64",
          availableCommands: ["rsync", "ssh"]
        },
        serverCapabilities: {
          ssh: true,
          rsync: true
        },
        modules: ["mcp-local-bridge"],
        transfer: {
          directory: true,
          incremental: true,
          totalBytes: 32 * 1024 * 1024,
          fileCount: 12
        }
      })
    });
    assert.equal(response.status, 200);
    assert.equal(response.payload.transportPlan.selected, "rsync-over-ssh");
    assert.ok(response.payload.modules.some((module) => module.moduleId === "mcp-local-bridge"));
  } finally {
    await server.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
}

verifyNativeTransportPriority();
verifyScpSmallFileFallback();
verifyPortableFallbacks();
verifyOperationRegistry();
verifyToolCatalogExposure();
await verifyHttpEndpoint();

console.log("[client-runtime-bootstrap] ok");
