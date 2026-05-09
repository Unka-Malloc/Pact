import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";

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

async function executeTool(baseUrl, token, toolId, input = {}) {
  return fetchJson(`${baseUrl}/api/tool-management/v1/execute`, {
    method: "POST",
    headers: bearerHeaders(token),
    body: JSON.stringify({ toolId, input })
  });
}

const expectedToolIds = [
  "splitall.knowledge.console",
  "splitall.knowledge.configSchema",
  "splitall.knowledge.capabilities",
  "splitall.knowledge.health",
  "splitall.knowledge.maintenance.get",
  "splitall.knowledge.maintenance.set",
  "splitall.knowledge.reindex",
  "splitall.knowledge.maintenance.run",
  "splitall.knowledge.sync",
  "splitall.knowledge.changes",
  "splitall.knowledge.reviewItems",
  "splitall.knowledge.reviewResolve",
  "splitall.knowledge.feedback",
  "splitall.knowledge.suggestions",
  "splitall.knowledge.suggestionResolve",
  "splitall.knowledge.learning.jobs",
  "splitall.knowledge.learning.health",
  "splitall.knowledge.evidenceGate.evaluate",
  "splitall.knowledge.agentSkill",
  "splitall.knowledge.agentSkill.plan",
  "splitall.knowledge.agentSkill.run",
  "splitall.knowledge.skills.list",
  "splitall.knowledge.skills.get",
  "splitall.knowledge.skills.generate",
  "splitall.knowledge.skills.propose",
  "splitall.knowledge.skills.resolve",
  "splitall.knowledge.skillFramework",
  "splitall.knowledge.skillFramework.set",
  "splitall.knowledge.goldenRules.list",
  "splitall.knowledge.goldenRules.set",
  "splitall.knowledge.goldenRules.publish",
  "splitall.knowledge.goldenRules.rollback",
  "splitall.knowledge.ruleAuthoring.chat",
  "splitall.knowledge.ruleAuthoring.run",
  "splitall.knowledge.goldCases.list",
  "splitall.knowledge.goldCases.set",
  "splitall.knowledge.distillation.runs.create",
  "splitall.knowledge.distillation.runs.get",
  "splitall.knowledge.skills.evaluation.runs.create",
  "splitall.knowledge.skills.deployments.create",
  "splitall.knowledge.skills.deployments.rollback",
  "splitall.knowledge.trainingSets.export",
  "splitall.knowledge.evaluation.runs.create",
  "splitall.knowledge.evaluation.runs.list",
  "splitall.knowledge.evaluation.runs.get",
  "splitall.knowledge.modelRoles",
  "splitall.knowledge.modelDecision",
  "splitall.knowledge.evolution",
  "splitall.knowledge.evolution.runs.create",
  "splitall.knowledge.evolution.runs.list",
  "splitall.knowledge.evolution.runs.get",
  "splitall.knowledge.hierarchy.audit",
  "splitall.knowledge.evolution.deployments.list",
  "splitall.knowledge.evolution.deployments.promote",
  "splitall.knowledge.evolution.deployments.rollback",
  "splitall.context.profiles",
  "splitall.context.profiles.set",
  "splitall.clientRuntime.profiles",
  "splitall.clientRuntime.profiles.set",
  "splitall.clientRuntime.resolve",
  "splitall.clientRuntime.status",
  "splitall.agentWorkspace.list",
  "splitall.agentWorkspace.get",
  "splitall.agentWorkspace.submissionResolve",
  "splitall.agentWorkspace.issueResolve",
  "splitall.agentWorkspace.locks",
  "splitall.agentWorkspace.lock",
  "splitall.knowledge.summarization.runs.create",
  "splitall.knowledge.summarization.runs.get",
  "splitall.knowledge.summarization.runs.approve",
  "splitall.knowledge.search",
  "splitall.knowledge.documentStructure",
  "splitall.knowledge.item",
  "splitall.knowledge.evidence",
  "splitall.knowledge.asset",
  "splitall.knowledge.renderMarkdown",
  "splitall.knowledge.graph"
];

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-agent-knowledge-tools-"));
const server = await startHttpServer({
  userDataPath,
  runtimeOptions: {
    profile: "minimal"
  }
});
await installAuthenticatedFetch(server);

try {
  const catalog = await fetchJson(`${server.url}/api/tool-management/v1/catalog`);
  assert.equal(catalog.status, 200);
  assert.equal(catalog.payload.schemaVersion, 1);

  const tools = catalog.payload.tools || [];
  const toolIds = new Set(tools.map((tool) => tool.id));
  for (const toolId of expectedToolIds) {
    assert.equal(toolIds.has(toolId), true, `${toolId} should be advertised`);
  }
  const legacyOperationPrefix = `${"agent"}_${"tools"}.`;
  assert.equal(
    tools.some((tool) => String(tool.operationId || "").startsWith(legacyOperationPrefix)),
    false
  );

  const readGrant = await fetchJson(`${server.url}/api/tool-management/v1/grants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "verify-agent-knowledge-tools-read",
      scopes: ["knowledge:read"]
    })
  });
  assert.equal(readGrant.status, 201);
  assert.ok(readGrant.payload.token);

  const noTokenHealth = await fetchJson(`${server.url}/api/tool-management/v1/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      toolId: "splitall.knowledge.health",
      input: {}
    })
  });
  assert.equal(noTokenHealth.status, 401);

  const health = await executeTool(
    server.url,
    readGrant.payload.token,
    "splitall.knowledge.health",
    {}
  );
  assert.equal(health.status, 200);
  assert.equal(health.payload.status, "ok");
  assert.equal(health.payload.grant.scopes.includes("knowledge:read"), true);
  assert.equal(health.payload.result.ok, true);

  const search = await executeTool(
    server.url,
    readGrant.payload.token,
    "splitall.knowledge.search",
    {
      query: "agent knowledge tool verification",
      limit: 3,
      explain: true
    }
  );
  assert.equal(search.status, 200);
  assert.equal(search.payload.result.protocolVersion, "splitall.knowledge.v1");
  assert.equal(Array.isArray(search.payload.result.items), true);

  const writeDenied = await executeTool(
    server.url,
    readGrant.payload.token,
    "splitall.knowledge.feedback",
    {
      query: "agent knowledge tool verification",
      action: "searchMiss"
    }
  );
  assert.equal(writeDenied.status, 403);
  assert.equal(writeDenied.payload.error.code, "missing_scopes");

  const metrics = await fetchJson(`${server.url}/api/tool-management/v1/metrics/summary`);
  assert.equal(metrics.status, 200);
  assert.ok(metrics.payload.metrics.callsTotal >= 3);

  console.log("Agent knowledge tools verification passed.");
} finally {
  await server.close();
  await fs.rm(userDataPath, { recursive: true, force: true });
}
