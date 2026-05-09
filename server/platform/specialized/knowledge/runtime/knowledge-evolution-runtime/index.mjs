import fs from "node:fs/promises";
import path from "node:path";

export const KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION = "splitall.knowledge-evolution.v1";

function nowIso() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stableRunId(prefix = "knowledge_evolution") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function actionKey(value = "") {
  return String(value || "").trim().replace(/-/g, "_");
}

function positiveFeedback(item = {}) {
  return [
    "open",
    "copy",
    "export",
    "thumb_up",
    "thumbUp",
    "human_expert_clarification",
    "human_expert_correction",
    "expert_choice",
    "expert_feedback"
  ].includes(actionKey(item.action)) || item.context?.gold === true || item.context?.humanExpert === true;
}

function buildCasesFromFeedback(feedback = [], { limit = 50, maxEvidencePerCase = 3 } = {}) {
  const byQuery = new Map();
  for (const item of asArray(feedback)) {
    const query = normalizeText(item.query || item.context?.query || "");
    const evidenceIds = [
      String(item.evidenceId || item.context?.evidenceId || "").trim(),
      ...asArray(item.context?.evidenceRefs).map((ref) => String(ref || "").trim())
    ].filter(Boolean);
    if (!query || evidenceIds.length === 0 || !positiveFeedback(item)) {
      continue;
    }
    const current = byQuery.get(query) || {
      caseId: `feedback-${byQuery.size + 1}`,
      query,
      requiredEvidenceIds: [],
      tags: item.context?.gold || item.context?.humanExpert
        ? ["feedback", "human-expert", "golden"]
        : ["feedback", "user-behavior"],
      metadata: {
        source: "feedback",
        feedbackIds: []
      }
    };
    for (const evidenceId of evidenceIds) {
      if (!current.requiredEvidenceIds.includes(evidenceId)) {
        current.requiredEvidenceIds.push(evidenceId);
      }
    }
    current.metadata.feedbackIds.push(item.feedbackId);
    byQuery.set(query, current);
  }
  return [...byQuery.values()]
    .map((item) => ({
      ...item,
      requiredEvidenceIds: item.requiredEvidenceIds.slice(0, Math.max(1, maxEvidencePerCase))
    }))
    .slice(0, Math.max(1, limit));
}

function metricDelta(candidate = {}, baseline = {}) {
  const keys = ["recallAtK", "mrrAtK", "ndcgAtK", "gatePassRate", "unsupportedClaimRate", "conflictRate"];
  const delta = {};
  for (const key of keys) {
    delta[key] = Number((Number(candidate[key] || 0) - Number(baseline[key] || 0)).toFixed(6));
  }
  return delta;
}

function passesRegressionGate({ baseline = {}, candidate = {}, thresholds = {} } = {}) {
  const tolerance = Number(thresholds.tolerance ?? 0);
  const minRecallDelta = Number(thresholds.minRecallDelta ?? 0);
  const minMrrDelta = Number(thresholds.minMrrDelta ?? 0);
  const minNdcgDelta = Number(thresholds.minNdcgDelta ?? 0);
  const deltas = metricDelta(candidate, baseline);
  const failed = [];
  if (deltas.recallAtK + tolerance < minRecallDelta) failed.push("recall_regression");
  if (deltas.mrrAtK + tolerance < minMrrDelta) failed.push("mrr_regression");
  if (deltas.ndcgAtK + tolerance < minNdcgDelta) failed.push("ndcg_regression");
  if (deltas.gatePassRate + tolerance < Number(thresholds.minGatePassDelta ?? 0)) {
    failed.push("gate_pass_regression");
  }
  if (deltas.unsupportedClaimRate > Number(thresholds.maxUnsupportedClaimDelta ?? 0)) {
    failed.push("unsupported_claim_increase");
  }
  if (deltas.conflictRate > Number(thresholds.maxConflictDelta ?? 0)) {
    failed.push("conflict_increase");
  }
  return {
    passed: failed.length === 0,
    failed,
    deltas,
    thresholds: {
      tolerance,
      minRecallDelta,
      minMrrDelta,
      minNdcgDelta,
      minGatePassDelta: Number(thresholds.minGatePassDelta ?? 0),
      maxUnsupportedClaimDelta: Number(thresholds.maxUnsupportedClaimDelta ?? 0),
      maxConflictDelta: Number(thresholds.maxConflictDelta ?? 0)
    }
  };
}

function firstRetrievalProfileSuggestion(suggestions = []) {
  return asArray(suggestions).find((item) => item.type === "retrievalProfile");
}

export function createKnowledgeEvolutionRuntime({
  userDataPath,
  knowledgeCore,
  agentEvaluationRuntime,
  modelDecisionRuntime,
  knowledgeSkillRuntime = null,
  goldenRuleRuntime = null,
  knowledgeDistillationRuntime = null
} = {}) {
  const rootPath = path.join(userDataPath, "knowledge-evolution");
  const runsPath = path.join(rootPath, "evolution-runs.json");

  async function readStore() {
    try {
      return JSON.parse(await fs.readFile(runsPath, "utf8"));
    } catch {
      return {
        protocolVersion: KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION,
        runs: []
      };
    }
  }

  async function writeStore(store) {
    await fs.mkdir(rootPath, { recursive: true });
    await fs.writeFile(
      runsPath,
      JSON.stringify(
        {
          protocolVersion: KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION,
          runs: asArray(store.runs).slice(-200)
        },
        null,
        2
      ),
      "utf8"
    );
  }

  async function persistRun(run) {
    const store = await readStore();
    await writeStore({
      runs: [...asArray(store.runs).filter((item) => item.runId !== run.runId), run]
    });
    return run;
  }

  function describe() {
    return {
      protocolVersion: KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION,
      stages: [
        "collect_feedback",
        "attribute_failures",
        "propose_candidate_profile",
        "generate_knowledge_system_candidates",
        "golden_rule_gate",
        "offline_replay_evaluation",
        "canary_publish",
        "rollback"
      ],
      targets: [
        "retrievalProfile",
        "knowledgeSkillSet",
        "goldenRulePackage",
        "taxonomyPackage",
        "expertVocabularyPackage",
        "contextProfile"
      ],
      policy: {
        requiresEvaluationBeforeActivation: true,
        canaryBeforeActive: true,
        canonicalKnowledgeMutationAllowed: false,
        hierarchyChangesBecomeSuggestions: true,
        noDatasetSpecificFineTuning: true
      },
      modelRoles: modelDecisionRuntime?.describe?.().roles || []
    };
  }

  async function runEvolution(input = {}) {
    if (!knowledgeCore || !agentEvaluationRuntime) {
      return {
        protocolVersion: KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION,
        ok: false,
        status: "unavailable",
        error: "knowledgeCore or agentEvaluationRuntime unavailable"
      };
    }
    const startedAt = nowIso();
    const runId = String(input.runId || "").trim() || stableRunId();
    const target = normalizeText(input.target || input.evolutionTarget || "retrievalProfile") || "retrievalProfile";
    const feedback = typeof knowledgeCore.feedbackSince === "function"
      ? knowledgeCore.feedbackSince({
          windowHours: input.feedbackWindowHours || 168,
          limit: input.feedbackLimit || 2000
        })
      : [];
    const failureAttribution = modelDecisionRuntime && typeof modelDecisionRuntime.decide === "function"
      ? await modelDecisionRuntime.decide({
          roleId: "failure_attributor",
          modelEnabled: input.modelEnabled === true,
          modelAlias: input.failureAttributorModelAlias || input.modelAlias || "",
          input: {
            feedback,
            modelEnabled: input.modelEnabled === true
          }
        })
      : null;
    if (target === "knowledgeSkillSet") {
      const distillationRun = knowledgeDistillationRuntime && typeof knowledgeDistillationRuntime.runDistillation === "function"
        ? await knowledgeDistillationRuntime.runDistillation({
            ...(asObject(input.distillation) || {}),
            runId: input.distillationRunId || `${runId}-distillation`,
            query: input.query || input.seedQuery || asArray(feedback).find((item) => item.query)?.query || "",
            modelEnabled: input.modelEnabled === true,
            modelAlias: input.modelAlias || ""
          })
        : null;
      const goldCases = goldenRuleRuntime && typeof goldenRuleRuntime.listGoldCases === "function"
        ? await goldenRuleRuntime.listGoldCases({ limit: input.caseLimit || 100 })
        : { items: [] };
      const evaluationRun = knowledgeSkillRuntime && typeof knowledgeSkillRuntime.runSkillEvaluation === "function"
        ? await knowledgeSkillRuntime.runSkillEvaluation({
            runId: input.skillEvaluationRunId || `${runId}-skill-evaluation`,
            cases: asArray(input.cases).length ? input.cases : goldCases.items,
            thresholds: input.skillThresholds || input.thresholds || {}
          })
        : null;
      const candidateSkillIds = [
        ...new Set(
          asArray(distillationRun?.candidates)
            .map((candidate) => candidate.skill?.skillId)
            .filter(Boolean)
        )
      ];
      const deployment = evaluationRun?.passed && knowledgeSkillRuntime && typeof knowledgeSkillRuntime.createSkillDeployment === "function" && input.publish !== false
        ? await knowledgeSkillRuntime.createSkillDeployment({
            deploymentId: input.deploymentId || `${runId}-skillset-canary`,
            skillIds: candidateSkillIds,
            status: input.publishMode || "canary",
            trafficPercent: input.canaryTrafficPercent || 10,
            evaluationRunId: evaluationRun.runId,
            metrics: evaluationRun.metrics,
            force: input.force === true
          })
        : null;
      return persistRun({
        protocolVersion: KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION,
        runId,
        target,
        ok: evaluationRun?.passed === true,
        status: evaluationRun?.passed
          ? deployment
            ? "skillset_canary_published"
            : "skillset_evaluation_passed"
          : "skillset_evaluation_failed",
        feedbackCount: feedback.length,
        caseCount: asArray(goldCases.items).length,
        stages: {
          feedbackCollected: true,
          failuresAttributed: Boolean(failureAttribution),
          candidateGenerated: Boolean(distillationRun),
          goldenRuleGateApplied: true,
          offlineEvaluated: Boolean(evaluationRun),
          canaryPublished: Boolean(deployment)
        },
        distillationRun,
        evaluationRun,
        deployment,
        modelDecisions: {
          failureAttribution
        },
        recommendations: evaluationRun?.passed
          ? ["Monitor SkillSet canary feedback, then promote or rollback the deployment."]
          : ["Do not publish the candidate SkillSet; inspect failed gold cases and distillation candidates."],
        startedAt,
        finishedAt: nowIso()
      });
    }

    const activeProfile =
      knowledgeCore.getRetrievalProfile?.({}) ||
      knowledgeCore.listRetrievalProfiles?.({ limit: 1 })?.[0] ||
      null;
    const profileProposal = modelDecisionRuntime && typeof modelDecisionRuntime.decide === "function"
      ? await modelDecisionRuntime.decide({
          roleId: "profile_proposer",
          modelEnabled: input.modelEnabled === true,
          modelAlias: input.profileProposerModelAlias || input.modelAlias || "",
          input: {
            activeProfile,
            failureAttribution: failureAttribution?.decision || {},
            modelEnabled: input.modelEnabled === true
          }
        })
      : null;
    const learningRun = await knowledgeCore.runLearningJob({
      ...asObject(input.learningJob),
      runId: input.learningRunId || `${runId}-learning`,
      feedbackWindowHours: input.feedbackWindowHours || 168,
      feedbackLimit: input.feedbackLimit || 2000,
      autoApply: false
    });
    const candidateProfile =
      learningRun.candidateProfile ||
      firstRetrievalProfileSuggestion(learningRun.generatedSuggestions)?.proposedPatch ||
      null;
    const cases = asArray(input.cases).length
      ? asArray(input.cases)
      : buildCasesFromFeedback(feedback, {
          limit: input.caseLimit || 50,
          maxEvidencePerCase: input.maxEvidencePerCase || 3
        });
    const caseSource = asArray(input.cases).length ? "provided" : cases.length ? "feedback" : "none";
    const run = {
      protocolVersion: KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION,
      runId,
      target,
      status: "running",
      feedbackCount: feedback.length,
      caseSource,
      caseCount: cases.length,
      stages: {
        feedbackCollected: true,
        failuresAttributed: Boolean(failureAttribution),
        candidateProfileProposed: Boolean(candidateProfile),
        offlineEvaluated: false,
        canaryPublished: false
      },
      activeProfile,
      candidateProfile,
      learningRun,
      modelDecisions: {
        failureAttribution,
        profileProposal
      },
      startedAt,
      finishedAt: ""
    };

    if (!candidateProfile) {
      return persistRun({
        ...run,
        ok: false,
        status: "no_candidate_profile",
        recommendations: ["Collect more feedback or provide a candidate profile explicitly."],
        finishedAt: nowIso()
      });
    }

    if (!cases.length) {
      return persistRun({
        ...run,
        ok: false,
        status: "needs_evaluation_cases",
        recommendations: [
          "Do not publish retrieval profile changes without feedback-derived or human-provided evaluation cases.",
          "Use real user searches with opened evidence, or provide a maintained gold set."
        ],
        finishedAt: nowIso()
      });
    }

    const evaluationThresholds = {
      minRecallAtK: input.thresholds?.minRecallAtK ?? 0,
      minMrrAtK: input.thresholds?.minMrrAtK ?? 0,
      minNdcgAtK: input.thresholds?.minNdcgAtK ?? 0,
      minGatePassRate: input.thresholds?.minGatePassRate ?? 0
    };
    const baselineEvaluation = await agentEvaluationRuntime.runEvaluation({
      runId: `${runId}-baseline`,
      k: input.k || input.limit || 10,
      cases,
      profileKey: activeProfile?.profileKey || "",
      learningEnabled: true,
      thresholds: evaluationThresholds,
      gateThresholds: input.gateThresholds || {}
    });
    const candidateEvaluation = await agentEvaluationRuntime.runEvaluation({
      runId: `${runId}-candidate`,
      k: input.k || input.limit || 10,
      cases,
      profileKey: candidateProfile.profileKey || "",
      retrievalProfileId: candidateProfile.profileId || "",
      learningEnabled: true,
      thresholds: evaluationThresholds,
      gateThresholds: input.gateThresholds || {}
    });
    const regressionGate = passesRegressionGate({
      baseline: baselineEvaluation.metrics,
      candidate: candidateEvaluation.metrics,
      thresholds: input.regressionThresholds || {}
    });
    const minCaseCount = Math.max(1, Number(input.minCaseCount || 1));
    const evaluationPassed =
      caseSource !== "none" &&
      cases.length >= minCaseCount &&
      candidateEvaluation.passed &&
      regressionGate.passed;
    let deployment = null;
    if (evaluationPassed && input.publish !== false) {
      deployment = knowledgeCore.createRetrievalProfileDeployment({
        deploymentId: input.deploymentId || `${runId}-canary`,
        profileKey: candidateProfile.profileKey,
        profile: candidateProfile,
        status: input.publishMode === "active" ? "active" : "canary",
        trafficPercent:
          input.publishMode === "active"
            ? 100
            : Math.max(1, Math.min(Number(input.canaryTrafficPercent || 10), 100)),
        baselineProfileKey: activeProfile?.profileKey || "",
        metrics: {
          baseline: baselineEvaluation.metrics,
          candidate: candidateEvaluation.metrics,
          delta: regressionGate.deltas
        },
        gate: regressionGate,
        reason: "offline_evaluation_passed"
      });
      if (input.publishMode === "active") {
        knowledgeCore.promoteRetrievalProfileDeployment({
          deploymentId: deployment.deploymentId,
          reason: "explicit_active_publish_after_evaluation"
        });
      }
    }
    const hierarchyAudit = input.auditHierarchy === false
      ? null
      : await auditHierarchy({
          persistSuggestions: input.persistHierarchySuggestions === true,
          limit: input.hierarchyAuditLimit || 50
        });

    return persistRun({
      ...run,
      ok: evaluationPassed,
      status: evaluationPassed ? (deployment ? "canary_published" : "evaluation_passed") : "evaluation_failed",
      stages: {
        ...run.stages,
        offlineEvaluated: true,
        canaryPublished: Boolean(deployment)
      },
      baselineEvaluation,
      candidateEvaluation,
      regressionGate,
      deployment,
      hierarchyAudit,
      recommendations: evaluationPassed
        ? [
            "Monitor canary feedback, then promote or rollback the deployment.",
            "Canonical facts, relations, and taxonomy still require suggestions/review."
          ]
        : [
            "Do not publish the candidate profile.",
            "Inspect failed evaluation cases and failure attribution before generating another candidate."
          ],
      finishedAt: nowIso()
    });
  }

  async function auditHierarchy(input = {}) {
    const audit = knowledgeCore?.auditHierarchyIndex
      ? knowledgeCore.auditHierarchyIndex(input)
      : {
          ok: false,
          findings: [],
          suggestions: [],
          error: "knowledgeCore.auditHierarchyIndex unavailable"
        };
    const reviewer = modelDecisionRuntime && typeof modelDecisionRuntime.decide === "function"
      ? await modelDecisionRuntime.decide({
          roleId: "hierarchy_quality_reviewer",
          modelEnabled: input.modelEnabled === true,
          modelAlias: input.modelAlias || input.hierarchyReviewerModelAlias || "",
          input: {
            audit,
            modelEnabled: input.modelEnabled === true
          }
        })
      : null;
    return {
      protocolVersion: KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION,
      audit,
      modelDecision: reviewer
    };
  }

  async function rollback(input = {}) {
    if (!knowledgeCore?.rollbackRetrievalProfileDeployment) {
      return {
        protocolVersion: KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION,
        ok: false,
        status: "unavailable"
      };
    }
    const result = knowledgeCore.rollbackRetrievalProfileDeployment({
      deploymentId: input.deploymentId,
      reason: input.reason || "evolution_runtime_rollback"
    });
    return {
      protocolVersion: KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION,
      ok: Boolean(result),
      status: result ? "rolled_back" : "not_found",
      result
    };
  }

  async function promote(input = {}) {
    if (!knowledgeCore?.promoteRetrievalProfileDeployment) {
      return {
        protocolVersion: KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION,
        ok: false,
        status: "unavailable"
      };
    }
    const result = knowledgeCore.promoteRetrievalProfileDeployment({
      deploymentId: input.deploymentId,
      reason: input.reason || "evolution_runtime_promote"
    });
    return {
      protocolVersion: KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION,
      ok: Boolean(result),
      status: result ? "promoted" : "not_found",
      result
    };
  }

  async function listRuns(input = {}) {
    const store = await readStore();
    return {
      protocolVersion: KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION,
      runs: asArray(store.runs)
        .slice()
        .sort((left, right) => String(right.startedAt || "").localeCompare(String(left.startedAt || "")))
        .slice(0, Math.max(1, Math.min(Number(input.limit || 50), 200)))
        .map((run) => ({
          ...run,
          baselineEvaluation: run.baselineEvaluation ? { ...run.baselineEvaluation, caseResults: undefined } : undefined,
          candidateEvaluation: run.candidateEvaluation ? { ...run.candidateEvaluation, caseResults: undefined } : undefined
        }))
    };
  }

  async function getRun(runId) {
    const store = await readStore();
    return asArray(store.runs).find((run) => run.runId === runId) || null;
  }

  function listDeployments(input = {}) {
    return knowledgeCore?.listRetrievalProfileDeployments
      ? knowledgeCore.listRetrievalProfileDeployments(input)
      : {
          protocolVersion: KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION,
          deployments: []
        };
  }

  return {
    protocolVersion: KNOWLEDGE_EVOLUTION_PROTOCOL_VERSION,
    describe,
    runEvolution,
    listRuns,
    getRun,
    auditHierarchy,
    listDeployments,
    promote,
    rollback
  };
}

export default createKnowledgeEvolutionRuntime;
