import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { startHttpServer } from "../http-server.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";

const execFileAsync = promisify(execFile);

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const rawText = await response.text();
  const payload = rawText.trim() ? JSON.parse(rawText) : {};
  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}

function bearerHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-tool-management-"));
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
  const catalog = await fetchJson(`${server.url}/api/tool-management/v1/catalog`);
  assert.equal(catalog.status, 200);
  assert.equal(catalog.payload.schemaVersion, 1);
  assert.ok(catalog.payload.fingerprint);
  const toolIds = new Set(catalog.payload.tools.map((tool) => tool.id));
  assert.equal(toolIds.has("splitall.knowledge.health"), true);
  assert.equal(toolIds.has("splitall.knowledge.search"), true);
  assert.equal(toolIds.has("agent-exploration.keyword_search"), true);
  assert.equal(toolIds.has("maintenance-agent.storage.doctor"), true);

  const toolsets = await fetchJson(`${server.url}/api/tool-management/v1/toolsets`);
  assert.equal(toolsets.status, 200);
  assert.ok(toolsets.payload.toolsets.some((toolset) => toolset.id === "splitall.knowledge.read"));

  const grantResult = await fetchJson(`${server.url}/api/tool-management/v1/grants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "verify-tool-management",
      scopes: ["knowledge:read"]
    })
  });
  assert.equal(grantResult.status, 201);
  assert.ok(grantResult.payload.token);
  assert.equal(grantResult.payload.grant.hasToken, true);
  assert.equal(grantResult.payload.grant.scopes.includes("knowledge:read"), true);

  const narrowGrant = await fetchJson(`${server.url}/api/tool-management/v1/grants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "verify-document-parse-only",
      toolsets: ["splitall.document.parse"]
    })
  });
  assert.equal(narrowGrant.status, 201);

  const noToken = await fetchJson(`${server.url}/api/tool-management/v1/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      toolId: "splitall.knowledge.health",
      input: {}
    })
  });
  assert.equal(noToken.status, 401);
  assert.equal(noToken.payload.error.code, "missing_token");

  const toolsetDenied = await fetchJson(`${server.url}/api/tool-management/v1/execute`, {
    method: "POST",
    headers: bearerHeaders(narrowGrant.payload.token),
    body: JSON.stringify({
      toolId: "splitall.knowledge.health",
      input: {}
    })
  });
  assert.equal(toolsetDenied.status, 403);
  assert.equal(toolsetDenied.payload.error.code, "missing_toolsets");

  const rateLimitedGrant = await fetchJson(`${server.url}/api/tool-management/v1/grants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "verify-rate-limit",
      scopes: ["knowledge:read"],
      rateLimit: { perMinute: 1 }
    })
  });
  assert.equal(rateLimitedGrant.status, 201);
  const rateFirst = await fetchJson(`${server.url}/api/tool-management/v1/execute`, {
    method: "POST",
    headers: bearerHeaders(rateLimitedGrant.payload.token),
    body: JSON.stringify({
      toolId: "splitall.knowledge.health",
      input: {}
    })
  });
  assert.equal(rateFirst.status, 200);
  const rateSecond = await fetchJson(`${server.url}/api/tool-management/v1/execute`, {
    method: "POST",
    headers: bearerHeaders(rateLimitedGrant.payload.token),
    body: JSON.stringify({
      toolId: "splitall.knowledge.health",
      input: {}
    })
  });
  assert.equal(rateSecond.status, 429);
  assert.equal(rateSecond.payload.error.code, "rate_limited");

  const originGrant = await fetchJson(`${server.url}/api/tool-management/v1/grants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "verify-origin-boundary",
      scopes: ["knowledge:read"],
      allowedOrigins: ["https://allowed.example"]
    })
  });
  assert.equal(originGrant.status, 201);
  const originDenied = await fetchJson(`${server.url}/api/tool-management/v1/execute`, {
    method: "POST",
    headers: bearerHeaders(originGrant.payload.token),
    body: JSON.stringify({
      toolId: "splitall.knowledge.health",
      input: {}
    })
  });
  assert.equal(originDenied.status, 403);
  assert.equal(originDenied.payload.error.code, "origin_not_allowed");
  const originAllowed = await fetchJson(`${server.url}/api/tool-management/v1/execute`, {
    method: "POST",
    headers: {
      ...bearerHeaders(originGrant.payload.token),
      Origin: "https://allowed.example"
    },
    body: JSON.stringify({
      toolId: "splitall.knowledge.health",
      input: {}
    })
  });
  assert.equal(originAllowed.status, 200);

  const executed = await fetchJson(`${server.url}/api/tool-management/v1/execute`, {
    method: "POST",
    headers: bearerHeaders(grantResult.payload.token),
    body: JSON.stringify({
      toolId: "splitall.knowledge.health",
      input: {}
    })
  });
  assert.equal(executed.status, 200);
  assert.ok(executed.payload.toolExecutionId);
  assert.ok(executed.payload.traceId);
  assert.equal(executed.payload.status, "ok");
  assert.equal(executed.payload.result.ok, true);

  const audit = await fetchJson(`${server.url}/api/tool-management/v1/audit?limit=20`);
  assert.equal(audit.status, 200);
  assert.ok(audit.payload.items.some((item) => item.toolExecutionId === executed.payload.toolExecutionId));

  const metrics = await fetchJson(`${server.url}/api/tool-management/v1/metrics/summary`);
  assert.equal(metrics.status, 200);
  assert.ok(metrics.payload.metrics.callsTotal >= 2);
  assert.ok(metrics.payload.metrics.byStatus.ok >= 1);
  assert.ok(metrics.payload.metrics.byStatus.denied >= 1);

  const compat = await fetchJson(`${server.url}/api/agent-tools/knowledge/health`, {
    headers: bearerHeaders(grantResult.payload.token)
  });
  assert.equal(compat.status, 200);
  assert.equal(compat.payload.result.ok, true);
  assert.ok(compat.payload.grant.id);

  const cliCatalog = await execFileAsync(
    process.execPath,
    [path.resolve("server/scripts/splitall.mjs"), "tools", "catalog", "--server-url", server.url],
    { env: process.env }
  );
  const cliCatalogPayload = JSON.parse(cliCatalog.stdout);
  assert.equal(cliCatalogPayload.schemaVersion, 1);
  assert.ok(cliCatalogPayload.tools.some((tool) => tool.id === "splitall.knowledge.health"));

  const cliMetrics = await execFileAsync(
    process.execPath,
    [path.resolve("server/scripts/splitall.mjs"), "tools", "metrics", "--server-url", server.url, "--limit", "20"],
    { env: process.env }
  );
  const cliMetricsPayload = JSON.parse(cliMetrics.stdout);
  assert.equal(cliMetricsPayload.schemaVersion, 1);
  assert.ok(cliMetricsPayload.metrics.callsTotal >= 1);

  const rotated = await fetchJson(`${server.url}/api/tool-management/v1/grants/${grantResult.payload.grant.id}/rotate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(rotated.status, 200);
  assert.ok(rotated.payload.token);
  const oldTokenDenied = await fetchJson(`${server.url}/api/tool-management/v1/execute`, {
    method: "POST",
    headers: bearerHeaders(grantResult.payload.token),
    body: JSON.stringify({
      toolId: "splitall.knowledge.health",
      input: {}
    })
  });
  assert.equal(oldTokenDenied.status, 401);
  assert.equal(oldTokenDenied.payload.error.code, "invalid_token");
  const newTokenAllowed = await fetchJson(`${server.url}/api/tool-management/v1/execute`, {
    method: "POST",
    headers: bearerHeaders(rotated.payload.token),
    body: JSON.stringify({
      toolId: "splitall.knowledge.health",
      input: {}
    })
  });
  assert.equal(newTokenAllowed.status, 200);

  const revoked = await fetchJson(`${server.url}/api/tool-management/v1/grants/${grantResult.payload.grant.id}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "verify complete" })
  });
  assert.equal(revoked.status, 200);
  const revokedDenied = await fetchJson(`${server.url}/api/tool-management/v1/execute`, {
    method: "POST",
    headers: bearerHeaders(rotated.payload.token),
    body: JSON.stringify({
      toolId: "splitall.knowledge.health",
      input: {}
    })
  });
  assert.equal(revokedDenied.status, 401);
  assert.equal(revokedDenied.payload.error.code, "invalid_token");
} finally {
  await server.close();
  await fs.rm(userDataPath, { recursive: true, force: true });
}
