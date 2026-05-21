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
  "agentstudio.knowledge.console",
  "agentstudio.knowledge.configSchema",
  "agentstudio.knowledge.capabilities",
  "agentstudio.knowledge.health",
  "agentstudio.knowledge.maintenance.get",
  "agentstudio.knowledge.maintenance.set",
  "agentstudio.knowledge.reindex",
  "agentstudio.knowledge.maintenance.run",
  "agentstudio.knowledge.sync",
  "agentstudio.knowledge.changes",
  "agentstudio.knowledge.reviewItems",
  "agentstudio.knowledge.reviewResolve",
  "agentstudio.knowledge.feedback",
  "agentstudio.knowledge.suggestions",
  "agentstudio.knowledge.suggestionResolve",
  "agentstudio.knowledge.learning.jobs",
  "agentstudio.knowledge.learning.health",
  "agentstudio.knowledge.evidenceGate.evaluate",
  "agentstudio.knowledge.agentSkill",
  "agentstudio.knowledge.agentSkill.plan",
  "agentstudio.knowledge.agentSkill.run",
  "agentstudio.knowledge.skills.list",
  "agentstudio.knowledge.skills.get",
  "agentstudio.knowledge.skills.generate",
  "agentstudio.knowledge.skills.propose",
  "agentstudio.knowledge.skills.resolve",
  "agentstudio.knowledge.skillFramework",
  "agentstudio.knowledge.skillFramework.set",
  "agentstudio.knowledge.goldenRules.list",
  "agentstudio.knowledge.goldenRules.set",
  "agentstudio.knowledge.goldenRules.publish",
  "agentstudio.knowledge.goldenRules.rollback",
  "agentstudio.knowledge.ruleAuthoring.chat",
  "agentstudio.knowledge.ruleAuthoring.run",
  "agentstudio.knowledge.goldCases.list",
  "agentstudio.knowledge.goldCases.set",
  "agentstudio.knowledge.distillation.runs.create",
  "agentstudio.knowledge.distillation.runs.get",
  "agentstudio.knowledge.skills.evaluation.runs.create",
  "agentstudio.knowledge.skills.deployments.create",
  "agentstudio.knowledge.skills.deployments.rollback",
  "agentstudio.knowledge.trainingSets.export",
  "agentstudio.knowledge.evaluation.runs.create",
  "agentstudio.knowledge.evaluation.runs.list",
  "agentstudio.knowledge.evaluation.runs.get",
  "agentstudio.knowledge.modelRoles",
  "agentstudio.knowledge.modelDecision",
  "agentstudio.knowledge.evolution",
  "agentstudio.knowledge.evolution.runs.create",
  "agentstudio.knowledge.evolution.runs.list",
  "agentstudio.knowledge.evolution.runs.get",
  "agentstudio.knowledge.hierarchy.audit",
  "agentstudio.knowledge.evolution.deployments.list",
  "agentstudio.knowledge.evolution.deployments.promote",
  "agentstudio.knowledge.evolution.deployments.rollback",
  "agentstudio.context.profiles",
  "agentstudio.context.profiles.set",
  "agentstudio.clientRuntime.profiles",
  "agentstudio.clientRuntime.profiles.set",
  "agentstudio.clientRuntime.resolve",
  "agentstudio.clientRuntime.status",
  "agentstudio.agentWorkspace.list",
  "agentstudio.agentWorkspace.get",
  "agentstudio.agentWorkspace.context",
  "agentstudio.agentWorkspace.contextBundle.export",
  "agentstudio.agentWorkspace.contextBundle.restore",
  "agentstudio.agentWorkspace.chain",
  "agentstudio.agentWorkspace.parent.set",
  "agentstudio.agentWorkspace.profile.hotswap",
  "agentstudio.agentWorkspace.sources.set",
  "agentstudio.agentWorkspace.share",
  "agentstudio.agentWorkspace.unshare",
  "agentstudio.agentWorkspace.submissionResolve",
  "agentstudio.agentWorkspace.issueResolve",
  "agentstudio.agentWorkspace.locks",
  "agentstudio.agentWorkspace.lock",
  "agentstudio.knowledge.summarization.runs.create",
  "agentstudio.knowledge.summarization.runs.get",
  "agentstudio.knowledge.summarization.runs.approve",
  "agentstudio.knowledge.search",
  "agentstudio.knowledge.documentStructure",
  "agentstudio.knowledge.item",
  "agentstudio.knowledge.evidence",
  "agentstudio.knowledge.asset",
  "agentstudio.knowledge.renderMarkdown",
  "agentstudio.knowledge.graph"
];

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "agentstudio-agent-knowledge-tools-"));
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
      toolId: "agentstudio.knowledge.health",
      input: {}
    })
  });
  assert.equal(noTokenHealth.status, 401);

  const health = await executeTool(
    server.url,
    readGrant.payload.token,
    "agentstudio.knowledge.health",
    {}
  );
  assert.equal(health.status, 200);
  assert.equal(health.payload.status, "ok");
  assert.equal(health.payload.grant.scopes.includes("knowledge:read"), true);
  assert.equal(health.payload.result.ok, true);

  const search = await executeTool(
    server.url,
    readGrant.payload.token,
    "agentstudio.knowledge.search",
    {
      query: "agent knowledge tool verification",
      limit: 3,
      explain: true
    }
  );
  assert.equal(search.status, 200);
  assert.equal(search.payload.result.protocolVersion, "agentstudio.knowledge.v1");
  assert.equal(Array.isArray(search.payload.result.items), true);

  const adminGrant = await fetchJson(`${server.url}/api/tool-management/v1/grants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "verify-agent-workspace-context-tools-admin",
      scopes: ["knowledge:read", "knowledge:write", "knowledge:maintain", "knowledge:admin"]
    })
  });
  assert.equal(adminGrant.status, 201);
  assert.ok(adminGrant.payload.token);

  const workspace = await fetchJson(`${server.url}/api/agent-workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Tool Workspace Source",
      objective: "Verify context bundle tool export"
    })
  });
  assert.equal(workspace.status, 201);
  const targetWorkspace = await fetchJson(`${server.url}/api/agent-workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Tool Workspace Target",
      objective: "Verify context bundle tool restore"
    })
  });
  assert.equal(targetWorkspace.status, 201);

  const workspaceId = workspace.payload.workspace.workspaceId;
  const targetWorkspaceId = targetWorkspace.payload.workspace.workspaceId;
  const profile = await fetchJson(`${server.url}/api/agent-workspaces/${encodeURIComponent(workspaceId)}/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contextProfileId: "tool-context-profile",
      modelAlias: "tool-model-alias",
      toolGrantId: "tool-workspace-grant",
      knowledgeScope: {
        includeSourceIds: ["tool-source-a"]
      }
    })
  });
  assert.equal(profile.status, 200);

  const workspaceContext = await executeTool(
    server.url,
    adminGrant.payload.token,
    "agentstudio.agentWorkspace.context",
    { workspaceId }
  );
  assert.equal(workspaceContext.status, 200);
  assert.equal(workspaceContext.payload.result.contextProfileId, "tool-context-profile");
  assert.equal(workspaceContext.payload.result.modelAlias, "tool-model-alias");
  assert.equal(workspaceContext.payload.result.toolGrantId, "tool-workspace-grant");
  assert.deepEqual(workspaceContext.payload.result.knowledgeSourceIds, ["tool-source-a"]);

  const contextBundle = await executeTool(
    server.url,
    adminGrant.payload.token,
    "agentstudio.agentWorkspace.contextBundle.export",
    {
      workspaceId,
      format: "compressed"
    }
  );
  assert.equal(contextBundle.status, 200);
  assert.equal(contextBundle.payload.result.bundleVersion, "agentstudio.workspace-context-bundle.v1");
  assert.equal(contextBundle.payload.result.compressed.encoding, "gzip+base64");
  assert.ok(contextBundle.payload.result.bundleHash);

  const restoreDenied = await executeTool(
    server.url,
    readGrant.payload.token,
    "agentstudio.agentWorkspace.contextBundle.restore",
    {
      workspaceId: targetWorkspaceId,
      compressed: contextBundle.payload.result.compressed,
      bundleHash: contextBundle.payload.result.bundleHash
    }
  );
  assert.equal(restoreDenied.status, 403);
  assert.equal(restoreDenied.payload.error.code, "missing_scopes");

  const restored = await executeTool(
    server.url,
    adminGrant.payload.token,
    "agentstudio.agentWorkspace.contextBundle.restore",
    {
      workspaceId: targetWorkspaceId,
      compressed: contextBundle.payload.result.compressed,
      bundleHash: contextBundle.payload.result.bundleHash
    }
  );
  assert.equal(restored.status, 200);
  assert.equal(restored.payload.result.ok, true);
  assert.equal(restored.payload.result.restoredContext.contextProfileId, "tool-context-profile");
  assert.equal(restored.payload.result.restoredContext.modelAlias, "tool-model-alias");
  assert.equal(restored.payload.result.restoredContext.toolGrantId, "tool-workspace-grant");
  assert.deepEqual(restored.payload.result.restoredContext.knowledgeSourceIds, ["tool-source-a"]);

  const writeDenied = await executeTool(
    server.url,
    readGrant.payload.token,
    "agentstudio.knowledge.feedback",
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
