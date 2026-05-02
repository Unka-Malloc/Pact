import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHttpServer } from "../http-server.mjs";
import {
  TOOL_PLATFORM_SCOPES,
  TOOL_PLATFORM_TOOLS
} from "../tool-platform.mjs";
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

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

async function createGrant(baseUrl, scopes) {
  const grant = await fetchJson(`${baseUrl}/api/tool-platform/grants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: `verify-${scopes.join("-")}`,
      scopes
    })
  });
  assert.equal(grant.status, 201);
  assert.ok(grant.payload.token);
  return grant.payload.token;
}

const expectedKnowledgeToolIds = [
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
  const scopeIds = new Set(TOOL_PLATFORM_SCOPES.map((scope) => scope.id));
  assert.equal(scopeIds.has("knowledge:read"), true);
  assert.equal(scopeIds.has("knowledge:write"), true);
  assert.equal(scopeIds.has("knowledge:maintain"), true);
  assert.equal(scopeIds.has("knowledge:admin"), true);

  const toolIds = new Set(TOOL_PLATFORM_TOOLS.map((tool) => tool.id));
  for (const toolId of expectedKnowledgeToolIds) {
    assert.equal(toolIds.has(toolId), true, `${toolId} should be advertised`);
  }

  const platform = await fetchJson(`${server.url}/api/tool-platform`);
  assert.equal(platform.status, 200);
  const platformToolIds = new Set(platform.payload.tools.map((tool) => tool.id));
  for (const toolId of expectedKnowledgeToolIds) {
    assert.equal(platformToolIds.has(toolId), true, `${toolId} should be visible in /api/tool-platform`);
  }

  const noTokenHealth = await fetchJson(`${server.url}/api/agent-tools/knowledge/health`);
  assert.equal(noTokenHealth.status, 401);

  const readToken = await createGrant(server.url, ["knowledge:read"]);
  const health = await fetchJson(`${server.url}/api/agent-tools/knowledge/health`, {
    headers: authHeaders(readToken)
  });
  assert.equal(health.status, 200);
  assert.equal(health.payload.grant.scopes.includes("knowledge:read"), true);
  assert.equal(health.payload.result.ok, true);

  const search = await fetchJson(`${server.url}/api/agent-tools/knowledge/search`, {
    method: "POST",
    headers: authHeaders(readToken),
    body: JSON.stringify({
      query: "agent knowledge tool verification",
      limit: 3,
      explain: true
    })
  });
  assert.equal(search.status, 200);
  assert.equal(search.payload.result.protocolVersion, "splitall.knowledge.v1");
  assert.equal(Array.isArray(search.payload.result.items), true);

  const learningHealth = await fetchJson(`${server.url}/api/agent-tools/knowledge/learning/health`, {
    headers: authHeaders(readToken)
  });
  assert.equal(learningHealth.status, 200);
  assert.equal(learningHealth.payload.result.ok, true);

  const modelRoles = await fetchJson(`${server.url}/api/agent-tools/knowledge/model-roles`, {
    headers: authHeaders(readToken)
  });
  assert.equal(modelRoles.status, 200);
  assert.ok(modelRoles.payload.result.roles.some((role) => role.roleId === "failure_attributor"));
  assert.ok(modelRoles.payload.result.roles.some((role) => role.roleId === "gold_rule_applier"));
  assert.ok(modelRoles.payload.result.roles.some((role) => role.roleId === "skill_reviewer"));

  const modelDecision = await fetchJson(`${server.url}/api/agent-tools/knowledge/model-roles/decide`, {
    method: "POST",
    headers: authHeaders(readToken),
    body: JSON.stringify({
      roleId: "failure_attributor",
      input: {
        feedback: [
          {
            query: "agent knowledge tool verification",
            action: "searchMiss"
          }
        ]
      }
    })
  });
  assert.equal(modelDecision.status, 200);
  assert.equal(modelDecision.payload.result.usedModel, false);
  assert.equal(modelDecision.payload.result.roleId, "failure_attributor");

  const evolutionDescription = await fetchJson(`${server.url}/api/agent-tools/knowledge/evolution`, {
    headers: authHeaders(readToken)
  });
  assert.equal(evolutionDescription.status, 200);
  assert.equal(evolutionDescription.payload.result.policy.canaryBeforeActive, true);

  const skillDescription = await fetchJson(`${server.url}/api/agent-tools/knowledge/agent-skill`, {
    headers: authHeaders(readToken)
  });
  assert.equal(skillDescription.status, 200);
  assert.equal(skillDescription.payload.result.toolPolicy.coarseToFineRequired, true);

  const skillPlan = await fetchJson(`${server.url}/api/agent-tools/knowledge/agent-skill/plan`, {
    method: "POST",
    headers: authHeaders(readToken),
    body: JSON.stringify({
      query: "agent knowledge tool verification"
    })
  });
  assert.equal(skillPlan.status, 200);
  assert.equal(skillPlan.payload.result.plan.coarseIndexFirst, true);

  const skillFramework = await fetchJson(`${server.url}/api/agent-tools/knowledge/skill-framework`, {
    headers: authHeaders(readToken)
  });
  assert.equal(skillFramework.status, 200);
  assert.equal(skillFramework.payload.result.protocolVersion, "splitall.knowledge-skill.v1");
  assert.equal(skillFramework.payload.result.framework.qualityGates.requireCitations, true);

  const goldenRules = await fetchJson(`${server.url}/api/agent-tools/knowledge/golden-rules`, {
    headers: authHeaders(readToken)
  });
  assert.equal(goldenRules.status, 200);
  assert.equal(goldenRules.payload.result.protocolVersion, "splitall.golden-rule.v1");
  assert.ok(goldenRules.payload.result.items.some((item) => item.packageId === "default-golden-rules"));

  const skillList = await fetchJson(
    `${server.url}/api/agent-tools/knowledge/skills?status=published&query=verification`,
    {
      headers: authHeaders(readToken)
    }
  );
  assert.equal(skillList.status, 200);
  assert.equal(skillList.payload.result.protocolVersion, "splitall.knowledge-skill.v1");
  assert.equal(Array.isArray(skillList.payload.result.items), true);

  const emptyGate = await fetchJson(`${server.url}/api/agent-tools/knowledge/evidence-gate/evaluate`, {
    method: "POST",
    headers: authHeaders(readToken),
    body: JSON.stringify({
      query: "agent knowledge tool verification",
      thresholds: {
        minEvidence: 1,
        requireHierarchy: false
      }
    })
  });
  assert.equal(emptyGate.status, 200);
  assert.equal(emptyGate.payload.result.ok, false);

  const contextProfiles = await fetchJson(`${server.url}/api/agent-tools/context/profiles`, {
    headers: authHeaders(readToken)
  });
  assert.equal(contextProfiles.status, 200);
  assert.equal(contextProfiles.payload.result.protocolVersion, "splitall.context.v1");

  const publicContextPreview = await fetchJson(`${server.url}/api/context/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contextProfileId: "context-32k",
      taskBrief: "verify context preview",
      retrievedEvidence: [
        {
          evidenceId: "ctx-ev-1",
          title: "Context evidence",
          snippet: "2026-04-20 amount 123.45 should be preserved.",
          sourceLocator: "verify/context"
        }
      ]
    })
  });
  assert.equal(publicContextPreview.status, 200);
  assert.equal(publicContextPreview.payload.protocolVersion, "splitall.context.v1");
  assert.ok(publicContextPreview.payload.contextPack.contextBuildRecordId);

  const publicBuildRecords = await fetchJson(`${server.url}/api/context/build-records?limit=5`);
  assert.equal(publicBuildRecords.status, 200);
  assert.ok(publicBuildRecords.payload.records.some(
    (record) => record.recordId === publicContextPreview.payload.contextPack.contextBuildRecordId
  ));

  const publicContextEvaluation = await fetchJson(`${server.url}/api/context/evaluation/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profiles: ["context-32k"],
      cases: [
        {
          caseId: "ctx-eval-1",
          taskBrief: "verify context evaluation",
          requiredEvidenceIds: ["ctx-ev-1"],
          retrievedEvidence: [
            {
              evidenceId: "ctx-ev-1",
              title: "Context evidence",
              snippet: "2026-04-20 amount 123.45 should be preserved.",
              sourceLocator: "verify/context"
            }
          ]
        }
      ]
    })
  });
  assert.equal(publicContextEvaluation.status, 201);
  assert.equal(publicContextEvaluation.payload.protocolVersion, "splitall.context.v1");
  assert.equal(publicContextEvaluation.payload.results[0].requiredEvidenceRecall, 1);

  const workspaceList = await fetchJson(`${server.url}/api/agent-tools/agent-workspaces`, {
    headers: authHeaders(readToken)
  });
  assert.equal(workspaceList.status, 200);
  assert.equal(Array.isArray(workspaceList.payload.result.workspaces), true);

  const readDeniedFeedback = await fetchJson(`${server.url}/api/agent-tools/knowledge/feedback`, {
    method: "POST",
    headers: authHeaders(readToken),
    body: JSON.stringify({
      action: "no_result",
      query: "should be denied with read-only grant"
    })
  });
  assert.equal(readDeniedFeedback.status, 403);

  const readDeniedSkillGenerate = await fetchJson(`${server.url}/api/agent-tools/knowledge/skills/generate`, {
    method: "POST",
    headers: authHeaders(readToken),
    body: JSON.stringify({
      query: "should be denied with read-only grant"
    })
  });
  assert.equal(readDeniedSkillGenerate.status, 403);

  const readDeniedSkillPropose = await fetchJson(`${server.url}/api/agent-tools/knowledge/skills/propose`, {
    method: "POST",
    headers: authHeaders(readToken),
    body: JSON.stringify({
      proposal: {
        title: "read-only denied",
        summary: "denied",
        decisionHeuristics: ["denied"],
        honestBoundaries: ["denied"],
        evidenceRefs: ["evidence::missing"]
      }
    })
  });
  assert.equal(readDeniedSkillPropose.status, 403);

  const readDeniedDistillation = await fetchJson(`${server.url}/api/agent-tools/knowledge/distillation/runs`, {
    method: "POST",
    headers: authHeaders(readToken),
    body: JSON.stringify({
      query: "should be denied with read-only grant"
    })
  });
  assert.equal(readDeniedDistillation.status, 403);

  const writeToken = await createGrant(server.url, ["knowledge:write"]);
  const feedback = await fetchJson(`${server.url}/api/agent-tools/knowledge/feedback`, {
    method: "POST",
    headers: authHeaders(writeToken),
    body: JSON.stringify({
      feedbackId: "verify-agent-tool-feedback",
      clientId: "verify-agent",
      query: "agent knowledge tool verification",
      action: "no_result",
      createdAt: "2026-04-29T00:00:00.000Z"
    })
  });
  assert.equal(feedback.status, 200);
  assert.equal(feedback.payload.result.feedback.feedbackId, "verify-agent-tool-feedback");

  const summarization = await fetchJson(`${server.url}/api/agent-tools/knowledge/summarization/runs`, {
    method: "POST",
    headers: authHeaders(writeToken),
    body: JSON.stringify({
      query: "agent tool summarization verification",
      limit: 2
    })
  });
  assert.equal(summarization.status, 201);
  assert.equal(summarization.payload.result.run.status, "completed");
  const workspaceId = summarization.payload.result.workspace.workspaceId;
  const runId = summarization.payload.result.run.runId;

  const skillRun = await fetchJson(`${server.url}/api/agent-tools/knowledge/agent-skill/run`, {
    method: "POST",
    headers: authHeaders(readToken),
    body: JSON.stringify({
      query: "agent tool summarization verification",
      limit: 3,
      thresholds: {
        minEvidence: 0,
        requireHierarchy: false
      }
    })
  });
  assert.equal(skillRun.status, 200);
  assert.equal(skillRun.payload.result.protocolVersion, "splitall.knowledge-agent-skill.v1");

  const workspaceDetail = await fetchJson(
    `${server.url}/api/agent-tools/agent-workspaces/${encodeURIComponent(workspaceId)}`,
    {
      headers: authHeaders(readToken)
    }
  );
  assert.equal(workspaceDetail.status, 200);
  assert.equal(workspaceDetail.payload.result.workspace.workspaceId, workspaceId);

  const lock = await fetchJson(
    `${server.url}/api/agent-tools/agent-workspaces/${encodeURIComponent(workspaceId)}/locks`,
    {
      method: "POST",
      headers: authHeaders(writeToken),
      body: JSON.stringify({
        targetType: "artifact",
        targetId: "verify-artifact",
        ownerAgentId: "verify-agent"
      })
    }
  );
  assert.equal(lock.status, 200);
  assert.equal(lock.payload.result.ok, true);

  const locks = await fetchJson(
    `${server.url}/api/agent-tools/agent-workspaces/${encodeURIComponent(workspaceId)}/locks`,
    {
      headers: authHeaders(readToken)
    }
  );
  assert.equal(locks.status, 200);
  assert.ok(locks.payload.result.locks.length >= 1);

  const releaseLock = await fetchJson(
    `${server.url}/api/agent-tools/agent-workspaces/${encodeURIComponent(workspaceId)}/locks`,
    {
      method: "POST",
      headers: authHeaders(writeToken),
      body: JSON.stringify({
        action: "release",
        targetType: "artifact",
        targetId: "verify-artifact",
        ownerAgentId: "verify-agent"
      })
    }
  );
  assert.equal(releaseLock.status, 200);
  assert.equal(releaseLock.payload.result.released, true);

  const maintainDenied = await fetchJson(`${server.url}/api/agent-tools/knowledge/learning/jobs`, {
    method: "POST",
    headers: authHeaders(readToken),
    body: JSON.stringify({ runId: "verify-agent-tool-denied" })
  });
  assert.equal(maintainDenied.status, 403);

  const readDeniedRuleAuthoring = await fetchJson(`${server.url}/api/agent-tools/knowledge/rule-authoring/chat`, {
    method: "POST",
    headers: authHeaders(readToken),
    body: JSON.stringify({
      message: "生成一个黄金规则：完全一样的知识直接跳过"
    })
  });
  assert.equal(readDeniedRuleAuthoring.status, 403);

  const maintainToken = await createGrant(server.url, ["knowledge:maintain"]);
  const authoredRule = await fetchJson(`${server.url}/api/agent-tools/knowledge/rule-authoring/chat`, {
    method: "POST",
    headers: authHeaders(maintainToken),
    body: JSON.stringify({
      message: "生成一个黄金规则：完全一样的知识直接跳过",
      modelEnabled: false
    })
  });
  assert.equal(authoredRule.status, 200);
  assert.equal(authoredRule.payload.result.status, "pending_human_confirmation");
  assert.equal(authoredRule.payload.result.gate.ok, true);

  const savedGoldenRules = await fetchJson(`${server.url}/api/agent-tools/knowledge/golden-rules`, {
    method: "POST",
    headers: authHeaders(maintainToken),
    body: JSON.stringify({
      packageId: "verify-agent-golden-rules",
      source: "agent-tool-verification",
      rules: [
        {
          ruleId: "verify_no_evidence_auto_reject",
          label: "Verify no evidence auto reject",
          priority: 100,
          targetTypes: ["knowledgeSkill"],
          when: { evidenceCountLessThan: 1 },
          action: "auto_reject",
          reason: "Verification package must reject candidates without evidence."
        }
      ]
    })
  });
  assert.equal(savedGoldenRules.status, 200);
  assert.equal(savedGoldenRules.payload.result.package.packageId, "verify-agent-golden-rules");

  const publishedGoldenRules = await fetchJson(
    `${server.url}/api/agent-tools/knowledge/golden-rules/verify-agent-golden-rules/publish`,
    {
      method: "POST",
      headers: authHeaders(maintainToken),
      body: JSON.stringify({
        version: savedGoldenRules.payload.result.package.version
      })
    }
  );
  assert.equal(publishedGoldenRules.status, 200);
  assert.equal(publishedGoldenRules.payload.result.package.status, "active");

  const rolledBackGoldenRules = await fetchJson(
    `${server.url}/api/agent-tools/knowledge/golden-rules/verify-agent-golden-rules/rollback`,
    {
      method: "POST",
      headers: authHeaders(maintainToken),
      body: JSON.stringify({
        version: savedGoldenRules.payload.result.package.version
      })
    }
  );
  assert.equal(rolledBackGoldenRules.status, 200);
  assert.equal(rolledBackGoldenRules.payload.result.manifest.activeVersion, savedGoldenRules.payload.result.package.version);

  const hierarchyAudit = await fetchJson(`${server.url}/api/agent-tools/knowledge/hierarchy/audit`, {
    method: "POST",
    headers: authHeaders(maintainToken),
    body: JSON.stringify({
      splitThreshold: 1
    })
  });
  assert.equal(hierarchyAudit.status, 200);
  assert.equal(hierarchyAudit.payload.result.audit.policy.suggestionReviewRequired, true);

  const savedSkillFramework = await fetchJson(`${server.url}/api/agent-tools/knowledge/skill-framework`, {
    method: "POST",
    headers: authHeaders(maintainToken),
    body: JSON.stringify({
      ...skillFramework.payload.result.framework,
      version: Number(skillFramework.payload.result.framework.version || 1) + 1,
      qualityGates: {
        ...skillFramework.payload.result.framework.qualityGates,
        minEvidence: 1,
        requireHierarchy: false,
        minQualityScore: 0
      }
    })
  });
  assert.equal(savedSkillFramework.status, 200);
  assert.equal(savedSkillFramework.payload.result.framework.qualityGates.requireHierarchy, false);

  const generatedSkill = await fetchJson(`${server.url}/api/agent-tools/knowledge/skills/generate`, {
    method: "POST",
    headers: authHeaders(maintainToken),
    body: JSON.stringify({
      query: "agent tool summarization verification",
      limit: 2,
      status: "draft"
    })
  });
  assert.equal(generatedSkill.status, 201);
  assert.equal(generatedSkill.payload.result.protocolVersion, "splitall.knowledge-skill.v1");
  assert.ok(generatedSkill.payload.result.skill.skillId);

  const generatedSkillId = generatedSkill.payload.result.skill.skillId;
  const savedGoldCase = await fetchJson(`${server.url}/api/agent-tools/knowledge/gold-cases`, {
    method: "POST",
    headers: authHeaders(maintainToken),
    body: JSON.stringify({
      query: "agent tool summarization verification",
      expectedSkillId: generatedSkillId,
      requiredEvidenceIds: generatedSkill.payload.result.skill.evidenceRefs || [],
      answerRubric: "验证智能体工具链可以把审核结论沉淀为黄金样本。",
      tags: ["agent-tool-verify"]
    })
  });
  assert.equal(savedGoldCase.status, 200);
  assert.equal(savedGoldCase.payload.result.goldCase.expectedSkillId, generatedSkillId);

  const goldCases = await fetchJson(`${server.url}/api/agent-tools/knowledge/gold-cases?tag=agent-tool-verify`, {
    headers: authHeaders(readToken)
  });
  assert.equal(goldCases.status, 200);
  assert.ok(goldCases.payload.result.items.some((item) => item.expectedSkillId === generatedSkillId));

  const distillationRun = await fetchJson(`${server.url}/api/agent-tools/knowledge/distillation/runs`, {
    method: "POST",
    headers: authHeaders(maintainToken),
    body: JSON.stringify({
      query: "agent tool summarization verification",
      limit: 5,
      semanticSupportRequired: false
    })
  });
  assert.equal(distillationRun.status, 201);
  assert.equal(distillationRun.payload.result.protocolVersion, "splitall.knowledge-distillation.v1");
  assert.equal(distillationRun.payload.result.status, "completed");

  const distillationRunGet = await fetchJson(
    `${server.url}/api/agent-tools/knowledge/distillation/runs/${encodeURIComponent(distillationRun.payload.result.runId)}`,
    {
      headers: authHeaders(readToken)
    }
  );
  assert.equal(distillationRunGet.status, 200);
  assert.equal(distillationRunGet.payload.result.runId, distillationRun.payload.result.runId);

  const skillEvaluation = await fetchJson(`${server.url}/api/agent-tools/knowledge/skills/evaluation/runs`, {
    method: "POST",
    headers: authHeaders(maintainToken),
    body: JSON.stringify({
      status: generatedSkill.payload.result.skill.status,
      cases: [
        {
          query: "agent tool summarization verification",
          expectedSkillId: generatedSkillId,
          requiredEvidenceIds: []
        }
      ],
      thresholds: {
        minSkillHitRate: 0,
        minEvidenceRecall: 0
      }
    })
  });
  assert.equal(skillEvaluation.status, 201);
  assert.equal(skillEvaluation.payload.result.status, "completed");

  const skillDeployment = await fetchJson(`${server.url}/api/agent-tools/knowledge/skills/deployments`, {
    method: "POST",
    headers: authHeaders(maintainToken),
    body: JSON.stringify({
      skillIds: [generatedSkillId],
      status: "canary",
      evaluationRunId: skillEvaluation.payload.result.runId,
      trafficPercent: 5
    })
  });
  assert.equal(skillDeployment.status, 201);
  assert.equal(skillDeployment.payload.result.ok, true);

  const skillDeploymentRollback = await fetchJson(
    `${server.url}/api/agent-tools/knowledge/skills/deployments/${encodeURIComponent(skillDeployment.payload.result.deployment.deploymentId)}/rollback`,
    {
      method: "POST",
      headers: authHeaders(maintainToken),
      body: JSON.stringify({
        reason: "agent tool verification rollback"
      })
    }
  );
  assert.equal(skillDeploymentRollback.status, 200);
  assert.equal(skillDeploymentRollback.payload.result.ok, true);

  const trainingSetExport = await fetchJson(`${server.url}/api/agent-tools/knowledge/training-sets/export`, {
    method: "POST",
    headers: authHeaders(maintainToken),
    body: JSON.stringify({})
  });
  assert.equal(trainingSetExport.status, 200);
  assert.equal(trainingSetExport.payload.result.ok, true);
  assert.ok(trainingSetExport.payload.result.recordCount >= 4);

  const generatedSkillGet = await fetchJson(
    `${server.url}/api/agent-tools/knowledge/skills/${encodeURIComponent(generatedSkillId)}`,
    {
      headers: authHeaders(readToken)
    }
  );
  assert.equal(generatedSkillGet.status, 200);
  assert.equal(generatedSkillGet.payload.result.skillId, generatedSkillId);

  const archivedSkill = await fetchJson(
    `${server.url}/api/agent-tools/knowledge/skills/${encodeURIComponent(generatedSkillId)}/resolve`,
    {
      method: "POST",
      headers: authHeaders(maintainToken),
      body: JSON.stringify({
        action: "archive"
      })
    }
  );
  assert.equal(archivedSkill.status, 200);
  assert.equal(archivedSkill.payload.result.skill.status, "archived");

  const proposedSkill = await fetchJson(`${server.url}/api/agent-tools/knowledge/skills/propose`, {
    method: "POST",
    headers: authHeaders(writeToken),
    body: JSON.stringify({
      sourceType: "agent_exploration",
      agentId: "verify-agent-tool",
      proposal: {
        title: "Agent tool proposed Skill",
        sourceQuery: "agent tool verification",
        summary: "验证智能体可以创建待审核 Skill。",
        decisionHeuristics: ["先确认 evidenceId 可打开，再进入审核。"],
        honestBoundaries: ["这个 Skill 不改写 canonical knowledge。"],
        evidenceRefs: Array.isArray(generatedSkill.payload.result.skill.evidenceRefs)
          ? generatedSkill.payload.result.skill.evidenceRefs.slice(0, 1)
          : [],
        reuseReason: "验证智能体自建 Skill 框架。"
      }
    })
  });
  assert.equal(proposedSkill.status, 201);
  assert.equal(proposedSkill.payload.result.skill.status, "pending_review");
  assert.equal(proposedSkill.payload.result.skill.scope.createdByAgent, true);

  const approvedSummary = await fetchJson(
    `${server.url}/api/agent-tools/knowledge/summarization/runs/${encodeURIComponent(runId)}/approve`,
    {
      method: "POST",
      headers: authHeaders(maintainToken),
      body: JSON.stringify({
        action: "approve"
      })
    }
  );
  assert.equal(approvedSummary.status, 200);
  assert.equal(approvedSummary.payload.result.run.status, "approved");

  const evaluationRun = await fetchJson(`${server.url}/api/agent-tools/knowledge/evaluation/runs`, {
    method: "POST",
    headers: authHeaders(maintainToken),
    body: JSON.stringify({
      runId: "verify-agent-tool-eval",
      query: "agent tool summarization verification",
      thresholds: {
        minRecallAtK: 0,
        minMrrAtK: 0,
        minNdcgAtK: 0,
        minGatePassRate: 0
      }
    })
  });
  assert.equal(evaluationRun.status, 201);
  assert.equal(evaluationRun.payload.result.status, "completed");

  const evaluationRuns = await fetchJson(`${server.url}/api/agent-tools/knowledge/evaluation/runs`, {
    headers: authHeaders(readToken)
  });
  assert.equal(evaluationRuns.status, 200);
  assert.ok(evaluationRuns.payload.result.runs.some((item) => item.runId === "verify-agent-tool-eval"));

  const learningJob = await fetchJson(`${server.url}/api/agent-tools/knowledge/learning/jobs`, {
    method: "POST",
    headers: authHeaders(maintainToken),
    body: JSON.stringify({ runId: "verify-agent-tool-learning" })
  });
  assert.equal(learningJob.status, 200);
  assert.equal(learningJob.payload.result.runId, "verify-agent-tool-learning");

  const reindexWithoutConfirm = await fetchJson(`${server.url}/api/agent-tools/knowledge/reindex`, {
    method: "POST",
    headers: authHeaders(maintainToken),
    body: JSON.stringify({})
  });
  assert.equal(reindexWithoutConfirm.status, 400);
} finally {
  await server.close();
  await fs.rm(userDataPath, { recursive: true, force: true });
}
