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

  const getMcp = await fetchText(`${server.url}/mcp`, {
    headers: { Accept: "text/event-stream" }
  });
  assert.equal(getMcp.status, 200);
  assert.match(getMcp.text, /notifications\/tools\/list_changed/);

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
  assert.equal(localGrant.payload.toolsets.includes("pact.knowledge.read"), true);

  const localGrantList = await fetchJson(`${server.url}/mcp`, {
    method: "POST",
    headers: apiKeyHeaders(localGrant.payload.token),
    body: JSON.stringify(mcpRequest("tools/list", {}, 30))
  });
  assert.equal(localGrantList.status, 200);
  assert.equal(localGrantList.payload.result.tools[0].name, "pact.call");

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
  assert.equal(list.payload.result.tools.length, 1);
  assert.equal(list.payload.result.tools[0].name, "pact.call");
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
        operation: "pact.capabilities.list"
      }
    }, 5))
  });
  assert.equal(capabilities.status, 200);
  assert.ok(capabilities.payload.result.structuredContent.operations.some((tool) => tool.name === "system.health"));

  const legacyDirectCall = await fetchJson(`${server.url}/mcp`, {
    method: "POST",
    headers: apiKeyHeaders(grant.payload.token),
    body: JSON.stringify(mcpRequest("tools/call", {
      name: "system.health",
      arguments: {}
    }, 6))
  });
  assert.equal(legacyDirectCall.status, 200);
  assert.equal(legacyDirectCall.payload.error.data.stableToolName, "pact.call");

  console.log("mcp-http verification passed");
} finally {
  await server.close();
  await fs.rm(userDataPath, { recursive: true, force: true });
}
