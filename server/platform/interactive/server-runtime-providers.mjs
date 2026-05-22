import { loadSettings } from "../common/platform-core/settings.mjs";
import { createToolManagementStore } from "../specialized/capabilities/tools/tool-management-core/store.mjs";

async function createProvider(enabled, specifier, exportName, args = []) {
  if (!enabled) {
    return null;
  }
  const loaded = await import(specifier);
  const factory = loaded[exportName];
  if (typeof factory !== "function") {
    throw new Error(`Runtime provider ${specifier} does not export ${exportName}.`);
  }
  return factory(...args);
}

export async function createServerRuntimeProviders({
  userDataPath,
  runtime,
  jobManager,
  metadataStore,
  protocolEventBus,
  getDiscoveryState,
  getListenUrl,
  contextRuntime,
  getControllers,
  operationAuditStore,
  operationConcurrencyScope,
  queueMonitor,
  runtimeLogger,
  clientRuntimeAllocator,
  isFeatureActive,
  isAnyFeatureActive,
  callAgentGatewayIfAvailable
}) {
  const maintenanceAgent = await createProvider(
    isFeatureActive("maintenance-agent-runbooks"),
    "../../services/agent/maintenance-agent/index.mjs",
    "createMaintenanceAgentService",
    [{
      userDataPath,
      runtime,
      jobManager,
      metadataStore,
      protocolEventBus,
      getDiscoveryState,
      getListenUrl,
      contextRuntime,
      getControllers,
      operationAuditStore,
      operationConcurrencyScope,
      toolManagementStore: createToolManagementStore({ userDataPath }),
      queueMonitor,
      schedulerEnabled: process.env.PACT_MAINTENANCE_WORKER_EXTERNAL !== "1",
      logger: runtimeLogger
    }]
  );
  const knowledgeSourceService = await createProvider(
    isFeatureActive("knowledge-core"),
    "../specialized/knowledge/storage/knowledge-source-service.mjs",
    "createKnowledgeSourceService",
    [{
      userDataPath,
      jobManager,
      protocolEventBus,
      watchingEnabled: process.env.PACT_SOURCE_WATCHER_EXTERNAL !== "1"
    }]
  );
  const agentWorkspace = await createProvider(
    isAnyFeatureActive("agent-exploration", "knowledge-distillation"),
    "../specialized/agent/agent-workspace/index.mjs",
    "createAgentWorkspace",
    [{ userDataPath }]
  );
  const modelDecisionRuntime = await createProvider(
    isAnyFeatureActive("knowledge-distillation", "knowledge-evolution", "knowledge-outline-reasoning", "agent-exploration"),
    "../specialized/agent/agent-gateway/model-decision-runtime/index.mjs",
    "createModelDecisionRuntime",
    [{
      agentGatewayCall: async (input = {}) => callAgentGatewayIfAvailable(input, {
        settings: await loadSettings(userDataPath),
        contextRuntime,
        contextCompactionSource: "model-decision-runtime"
      })
    }]
  );
  const evidenceSufficiencyGate = await createProvider(
    isFeatureActive("knowledge-distillation"),
    "../specialized/knowledge/retrieval/evidence-sufficiency-gate/index.mjs",
    "createEvidenceSufficiencyGate"
  );
  const knowledgeAgentSkill = await createProvider(
    isFeatureActive("knowledge-distillation"),
    "../specialized/knowledge/invocation/knowledge-agent-skill-runtime/index.mjs",
    "createKnowledgeAgentSkillRuntime",
    [{
      runtime,
      evidenceGate: evidenceSufficiencyGate,
      modelDecisionRuntime
    }]
  );
  const goldenRuleRuntime = await createProvider(
    isFeatureActive("knowledge-distillation"),
    "../specialized/knowledge/invocation/golden-rule-runtime/index.mjs",
    "createGoldenRuleRuntime",
    [{
      userDataPath,
      knowledgeCore: runtime?.mounts?.knowledgeBase
    }]
  );
  const knowledgeRuleAuthoringRuntime = await createProvider(
    isFeatureActive("knowledge-distillation"),
    "../specialized/knowledge/invocation/knowledge-rule-authoring-runtime/index.mjs",
    "createKnowledgeRuleAuthoringRuntime",
    [{
      userDataPath,
      goldenRuleRuntime,
      modelDecisionRuntime
    }]
  );
  const knowledgeSkillRuntime = await createProvider(
    isFeatureActive("knowledge-distillation"),
    "../specialized/knowledge/invocation/knowledge-skill-runtime/index.mjs",
    "createKnowledgeSkillRuntime",
    [{
      userDataPath,
      runtime,
      modelDecisionRuntime,
      goldenRuleRuntime
    }]
  );
  const agentEvaluationRuntime = await createProvider(
    isFeatureActive("knowledge-distillation"),
    "../specialized/capabilities/tools/agent-evaluation-runtime/index.mjs",
    "createAgentEvaluationRuntime",
    [{
      userDataPath,
      knowledgeAgentSkill
    }]
  );
  const knowledgeDistillationRuntime = await createProvider(
    isFeatureActive("knowledge-distillation"),
    "../specialized/knowledge/invocation/knowledge-distillation-runtime/index.mjs",
    "createKnowledgeDistillationRuntime",
    [{
      userDataPath,
      runtime,
      metadataStore,
      knowledgeSkillRuntime,
      goldenRuleRuntime,
      evidenceGate: evidenceSufficiencyGate,
      modelDecisionRuntime
    }]
  );
  const knowledgeEvolutionRuntime = await createProvider(
    isFeatureActive("knowledge-evolution"),
    "../specialized/knowledge/invocation/knowledge-evolution-runtime/index.mjs",
    "createKnowledgeEvolutionRuntime",
    [{
      userDataPath,
      knowledgeCore: runtime?.mounts?.knowledgeBase,
      agentEvaluationRuntime,
      modelDecisionRuntime,
      knowledgeSkillRuntime,
      goldenRuleRuntime,
      knowledgeDistillationRuntime
    }]
  );
  const summarizationRuntime = await createProvider(
    isFeatureActive("knowledge-distillation"),
    "../specialized/knowledge/invocation/knowledge-summarization-runtime/index.mjs",
    "createSummarizationRuntime",
    [{
      userDataPath,
      runtime,
      agentWorkspace,
      contextRuntime,
      protocolEventBus,
      clientRuntimeAllocator
    }]
  );
  const agentExplorationRuntime = await createProvider(
    isFeatureActive("agent-exploration"),
    "../specialized/capabilities/tools/agent-exploration-runtime/index.mjs",
    "createAgentExplorationRuntime",
    [{
      userDataPath,
      runtime,
      agentWorkspace,
      contextRuntime,
      agentGatewayCall: async (input = {}) => callAgentGatewayIfAvailable(input, {
        settings: await loadSettings(userDataPath),
        contextRuntime,
        contextCompactionSource: "agent-exploration-runtime"
      }),
      knowledgeSkillRuntime,
      knowledgeRuleAuthoringRuntime,
      clientRuntimeAllocator
    }]
  );

  return Object.freeze({
    maintenanceAgent,
    knowledgeSourceService,
    agentWorkspace,
    modelDecisionRuntime,
    evidenceSufficiencyGate,
    knowledgeAgentSkill,
    goldenRuleRuntime,
    knowledgeRuleAuthoringRuntime,
    knowledgeSkillRuntime,
    agentEvaluationRuntime,
    knowledgeDistillationRuntime,
    knowledgeEvolutionRuntime,
    summarizationRuntime,
    agentExplorationRuntime
  });
}
