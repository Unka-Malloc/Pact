import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";
import { verifyMcpHandshakeSignature } from "../platform/common/mcp/identity.mjs";

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    payload: text.trim() ? JSON.parse(text) : {}
  };
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  return {
    status: response.status,
    ok: response.ok,
    text: await response.text()
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

function apiKeyHeaders(token) {
  return {
    "Content-Type": "application/json",
    "X-Pact-Api-Key": token
  };
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-mcp-http-"));
const server = await startHttpServer({
  userDataPath,
  distPath: "",
  port: 0,
  runtimeOptions: {
    profile: "minimal"
  }
});
await installAuthenticatedFetch(server);

try {
  const discovery = await fetchJson(`${server.url}/api/mcp/discovery`);
  assert.equal(discovery.status, 200);
  assert.equal(discovery.payload.mcpServers.pact.httpUrl, `${server.url}/mcp`);
  assert.equal(discovery.payload.stableToolName, "pact.call");
  assert.equal(discovery.payload.interfaceVersion, "pact.mcp.v1");
  assert.equal(discovery.payload.serverVersion, "0.0.1");
  assert.equal(discovery.payload.identity.algorithm, "Ed25519");
  assert.ok(discovery.payload.identity.keyId);
  assert.equal(discovery.payload.handshake.url, `${server.url}/api/mcp/handshake`);
  assert.equal(discovery.payload.installer.packageName, "pact-mcp-connector");
  assert.match(discovery.payload.installer.githubOneLineCommand, /pact-mcp-install\.sh/);
  assert.equal(discovery.payload.installer.oneCommandInstall, discovery.payload.installer.githubOneLineCommand);
  assert.match(discovery.payload.installer.installCommand, /npx pact-mcp-connector@latest register/);
  assert.match(discovery.payload.installer.interactiveInstallCommand, /pact-mcp-connector@latest install/);
  assert.match(discovery.payload.installer.clientInstallCommand, /--target <client>/);
  assert.doesNotMatch(discovery.payload.installer.clientInstallCommand, /token-stdin/);
  assert.equal(discovery.payload.installer.tokenInput, "auto-local-grant-or-stdin-or-env");
  assert.equal(discovery.payload.installer.localGrantEndpoint, `${server.url}/api/mcp/local-grant`);
  assert.match(discovery.payload.installer.scanCommand, /pact-mcp-connector@latest scan --json/);
  assert.equal(discovery.payload.localDiscovery.files.length, 1);
  assert.match(discovery.payload.localDiscovery.entrypoint.command, /discover-local/);
  assert.equal(discovery.payload.installer.portable.requiresInstalledNode, false);
  assert.equal(discovery.payload.installer.portable.preferredArchive, "zip");
  assert.equal(discovery.payload.installer.portable.bootstrapScript, "pact-mcp-install.sh");
  assert.equal(discovery.payload.installer.portable.supportsMultiSelect, true);
  assert.match(discovery.payload.installer.portable.releaseAssetPattern, /\.zip$/);
  assert.equal(discovery.payload.mcpServers.pact.headers["X-Pact-Api-Key"], "${PACT_MCP_TOKEN}");

  const nonce = randomBytes(32).toString("base64url");
  const handshake = await fetchJson(`${server.url}/api/mcp/handshake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nonce,
      client: { name: "verify-mcp-http", version: "1" }
    })
  });
  assert.equal(handshake.status, 200);
  assert.equal(handshake.payload.ok, true);
  assert.equal(handshake.payload.payload.nonce, nonce);
  assert.equal(handshake.payload.payload.server.name, "Pact");
  assert.equal(handshake.payload.payload.server.serverVersion, "0.0.1");
  assert.equal(handshake.payload.payload.identity.keyId, discovery.payload.identity.keyId);
  assert.equal(handshake.payload.payload.endpoints.mcpUrl, `${server.url}/mcp`);
  assert.equal(handshake.payload.signature.algorithm, "Ed25519");
  assert.equal(
    verifyMcpHandshakeSignature({
      publicKeyJwk: handshake.payload.payload.identity.publicKeyJwk,
      payload: handshake.payload.payload,
      signature: handshake.payload.signature.value
    }),
    true
  );

  const abortController = new AbortController();
  let getMcpStatus = 500;
  let getMcpText = "";
  try {
    const res = await fetch(`${server.url}/mcp`, {
      headers: { Accept: "text/event-stream" },
      signal: abortController.signal
    });
    getMcpStatus = res.status;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (value) getMcpText += decoder.decode(value);
      if (getMcpText.includes("list_changed") || done) {
        abortController.abort();
        break;
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') throw e;
  }
  
  assert.equal(getMcpStatus, 200);
  assert.match(getMcpText, /notifications\/tools\/list_changed/);

  const initialize = await fetchJson(`${server.url}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mcpRequest("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "verify-mcp-http", version: "1" }
    }))
  });
  assert.equal(initialize.status, 200);
  assert.equal(initialize.payload.result.serverInfo.name, "Pact");
  assert.equal(initialize.payload.result.capabilities.tools.listChanged, true);
  assert.equal(initialize.payload.result._meta.stableToolName, "pact.call");

  const unauthenticatedList = await fetchJson(`${server.url}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mcpRequest("tools/list", {}, 2))
  });
  assert.equal(unauthenticatedList.status, 401);
  assert.equal(unauthenticatedList.payload.error.data.code, "missing_token");

  const mcpDeniedRequests = await fetchJson(`${server.url}/api/authorization/denied-requests?limit=20`);
  assert.equal(mcpDeniedRequests.status, 200);
  assert.ok(
    mcpDeniedRequests.payload.items.some((item) =>
      item.operationId === "mcp.request" && item.reasonCode === "missing_token"
    ),
    "MCP token denials must be recorded in the unified authorization store"
  );

  const localGrant = await fetchJson(`${server.url}/api/mcp/local-grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targets: ["codex"],
      label: "verify-mcp-local-grant",
      connectorVersion: "verify"
    })
  });
  assert.equal(localGrant.status, 201);
  assert.equal(localGrant.payload.ok, true);
  assert.ok(localGrant.payload.token);
  assert.ok(localGrant.payload.grant.tokenPrefix);
  assert.deepEqual(localGrant.payload.targets, ["codex"]);
  assert.equal(localGrant.payload.maxRisk, "safe_write");
  assert.equal(localGrant.payload.targetMatch.matched, true);
  assert.equal(localGrant.payload.toolsets.includes("pact.storage.write"), true);
  assert.equal(localGrant.payload.toolsets.includes("pact.agent.workspace"), true);

  const unknownTargetGrant = await fetchJson(`${server.url}/api/mcp/local-grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targets: ["unknown-agent"],
      label: "verify-mcp-local-grant-unknown-target"
    })
  });
  assert.equal(unknownTargetGrant.status, 201);
  assert.equal(unknownTargetGrant.payload.ok, true);
  assert.equal(unknownTargetGrant.payload.maxRisk, "read_only");
  assert.equal(unknownTargetGrant.payload.targetMatch.matched, false);
  assert.equal(unknownTargetGrant.payload.toolsets.includes("pact.storage.write"), false);

  const explicitScopeGrant = await fetchJson(`${server.url}/api/mcp/local-grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pact-safety-confirm": "true" },
    body: JSON.stringify({
      targets: ["codex"],
      label: "verify-mcp-local-grant-explicit-scope",
      scopes: ["storage:write"]
    })
  });
  assert.equal(explicitScopeGrant.status, 201);
  assert.equal(explicitScopeGrant.payload.ok, true);
  assert.equal(explicitScopeGrant.payload.scopes.includes("storage:write"), true);
  assert.equal(explicitScopeGrant.payload.toolsets.includes("pact.storage.write"), true);

  const unconfirmedWriteGrant = await fetchJson(`${server.url}/api/mcp/local-grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pact-safety-confirm": "false" },
    body: JSON.stringify({
      targets: ["codex"],
      label: "verify-mcp-local-grant-unconfirmed-write-scope",
      scope: "storage:write"
    })
  });
  assert.equal(unconfirmedWriteGrant.status, 403);
  assert.equal(unconfirmedWriteGrant.payload.error.code, "confirmation_required");

  const explicitToolsetGrant = await fetchJson(`${server.url}/api/mcp/local-grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pact-safety-confirm": "true" },
    body: JSON.stringify({
      targets: ["codex"],
      label: "verify-mcp-local-grant-explicit-toolset",
      toolsets: ["pact.storage.write"]
    })
  });
  assert.equal(explicitToolsetGrant.status, 201);
  assert.equal(explicitToolsetGrant.payload.ok, true);
  assert.equal(explicitToolsetGrant.payload.toolsets.includes("pact.storage.write"), true);

  const expectedTools = ["pact.discovery", "pact.knowledge", "pact.sharedspace", "pact.codespace", "pact.skillHub"];

  const localGrantList = await fetchJson(`${server.url}/mcp`, {
    method: "POST",
    headers: apiKeyHeaders(localGrant.payload.token),
    body: JSON.stringify(mcpRequest("tools/list", {}, 30))
  });
  assert.equal(localGrantList.status, 200);
  assert.equal(localGrantList.payload.result.tools.length, 5);
  for (const name of expectedTools) {
    assert.ok(localGrantList.payload.result.tools.some(t => t.name === name));
  }

  const grant = await fetchJson(`${server.url}/api/tool-management/v1/grants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "verify-mcp-http",
      scopes: ["storage:read"]
    })
  });
  assert.equal(grant.status, 201);
  assert.ok(grant.payload.token);

  const list = await fetchJson(`${server.url}/mcp`, {
    method: "POST",
    headers: apiKeyHeaders(grant.payload.token),
    body: JSON.stringify(mcpRequest("tools/list", {}, 3))
  });
  assert.equal(list.status, 200);
  assert.equal(list.payload.result.tools.length, 5);
  for (const name of expectedTools) {
    assert.ok(list.payload.result.tools.some(t => t.name === name));
  }
  assert.equal(list.payload.result._meta.stableToolName, "pact.call");

  const health = await fetchJson(`${server.url}/mcp`, {
    method: "POST",
    headers: apiKeyHeaders(grant.payload.token),
    body: JSON.stringify(mcpRequest("tools/call", {
      name: "pact.call",
      arguments: {
        apiVersion: "pact.mcp.v1",
        operation: "system.health",
        input: {}
      }
    }, 4))
  });
  assert.equal(health.status, 200);
  assert.equal(health.payload.result.content[0].type, "text");
  assert.equal(health.payload.result.structuredContent.operation, "system.health");
  assert.equal(health.payload.result.structuredContent.payload.ok, true);

  const capabilities = await fetchJson(`${server.url}/mcp`, {
    method: "POST",
    headers: apiKeyHeaders(grant.payload.token),
    body: JSON.stringify(mcpRequest("tools/call", {
      name: "pact.call",
      arguments: {
        apiVersion: "pact.mcp.v1",
        operation: "pact.capabilities.list"
      }
    }, 5))
  });
  assert.equal(capabilities.status, 200);
  assert.ok(capabilities.payload.result.structuredContent.operations.some((tool) => tool.name === "system.health"));

  const unsupportedDirectCall = await fetchJson(`${server.url}/mcp`, {
    method: "POST",
    headers: apiKeyHeaders(grant.payload.token),
    body: JSON.stringify(mcpRequest("tools/call", {
      name: "system.health",
      arguments: {}
    }, 6))
  });
  assert.equal(unsupportedDirectCall.status, 200);
  assert.equal(unsupportedDirectCall.payload.error.data.stableToolName, "pact.call");
  assert.ok(unsupportedDirectCall.payload.error.data.categorizedOutlets.includes("pact.discovery"));

  console.log("mcp-http verification passed");
} finally {
  await server.close();
  await fs.rm(userDataPath, { recursive: true, force: true });
}
