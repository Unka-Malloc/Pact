import {
  loadSettings,
  saveSettings
} from "../../../platform-core/settings.mjs";
import { logRuntimeEvent } from "../../../observability/runtime-logger.mjs";
import { createAuthorizationEngine } from "../../../security/authorization/authorization-engine.mjs";
import { createAuthorizationStore } from "../../../security/authorization/authorization-store.mjs";

export function createSystemControllerContexts({
  userDataPath,
  runtime,
  jobManager,
  metadataStore,
  protocolEventBus = null,
  consoleAuth = null,
  operationAuditStore = null,
  agentWorkspace = null,
  contextRuntime = null,
  evidenceSufficiencyGate = null,
  knowledgeAgentSkill = null,
  goldenRuleRuntime = null,
  knowledgeRuleAuthoringRuntime = null,
  knowledgeSkillRuntime = null,
  knowledgeDistillationRuntime = null,
  agentEvaluationRuntime = null,
  modelDecisionRuntime = null,
  knowledgeEvolutionRuntime = null,
  summarizationRuntime = null,
  agentExplorationRuntime = null,
  clientRuntimeAllocator = null,
  queueMonitor = null,
  getFeatureEntries = () => null,
  consoleDomainServices = null
} = {}) {
  const loadAgentGatewayModule =
    typeof consoleDomainServices?.loadAgentGatewayModule === "function"
      ? consoleDomainServices.loadAgentGatewayModule
      : async () => {
          throw new Error("Agent gateway runtime provider is not configured.");
        };
  const loadModelProbeModule =
    typeof consoleDomainServices?.loadModelProbeModule === "function"
      ? consoleDomainServices.loadModelProbeModule
      : async () => {
          throw new Error("Model probe runtime provider is not configured.");
        };
  const requireDomainService = (name) => {
    const service = consoleDomainServices?.[name];
    if (typeof service !== "function") {
      throw new Error(`${name} provider is not configured.`);
    }
    return service;
  };
  const requireDomainProvider = (name, validate) => {
    const provider = consoleDomainServices?.[name];
    if (!validate(provider)) {
      throw new Error(`${name} provider is not configured.`);
    }
    return provider;
  };
  const getAgentConfigRegistry =
    typeof consoleDomainServices?.getAgentConfigRegistry === "function"
      ? consoleDomainServices.getAgentConfigRegistry
      : () => {
          throw new Error("Agent config registry provider is not configured.");
        };
  const getEmailRulesPath = requireDomainService("getEmailRulesPath");
  const loadEmailRules = requireDomainService("loadEmailRules");
  const saveEmailRules = requireDomainService("saveEmailRules");
  const getExpertVocabularyPath = requireDomainService("getExpertVocabularyPath");
  const getExpertVocabularySummary = requireDomainService("getExpertVocabularySummary");
  const listExpertVocabularyVersions = requireDomainService("listExpertVocabularyVersions");
  const loadExpertVocabulary = requireDomainService("loadExpertVocabulary");
  const saveExpertVocabulary = requireDomainService("saveExpertVocabulary");
  const getKnowledgeGuidanceSummary = requireDomainService("getKnowledgeGuidanceSummary");
  const getKnowledgeTaxonomyPath = requireDomainService("getKnowledgeTaxonomyPath");
  const listKnowledgeTaxonomyVersions = requireDomainService("listKnowledgeTaxonomyVersions");
  const loadKnowledgeTaxonomy = requireDomainService("loadKnowledgeTaxonomy");
  const saveKnowledgeTaxonomy = requireDomainService("saveKnowledgeTaxonomy");
  const preprocessWordCloudVocabulary = requireDomainService("preprocessWordCloudVocabulary");
  const createDocumentParsingRuntime = requireDomainService("createDocumentParsingRuntime");
  const toPublicDocumentParsingResult = requireDomainService("toPublicDocumentParsingResult");
  const enhanceAffairTaxonomy = requireDomainService("enhanceAffairTaxonomy");
  const createKnowledgeDistillationWorkbench = requireDomainService("createKnowledgeDistillationWorkbench");
  const executeConsoleDomainOperation = requireDomainService("executeConsoleDomainOperation");
  const resumeKnowledgeWordCloudClassificationTasks = requireDomainService("resumeKnowledgeWordCloudClassificationTasks");
  const uploadSessionStore = requireDomainProvider(
    "uploadSessionStore",
    (provider) =>
      provider &&
      typeof provider.resolveUploadSessionFiles === "function" &&
      typeof provider.deleteUploadSession === "function"
  );
  const agentConfigRegistry = getAgentConfigRegistry();
  const authorizationStore = consoleAuth?.authorizationStore || createAuthorizationStore({ userDataPath });
  const authorizationEngine = consoleAuth?.authorizationEngine || createAuthorizationEngine({ store: authorizationStore });

  function appendConsoleOperationLog(entry = {}) {
    if (operationAuditStore) {
      try {
        operationAuditStore.append({
          transport: "http",
          risk: entry.risk || "",
          readOnly: entry.readOnly === true,
          status: entry.status || "ok",
          actor: entry.authSession || entry.actor || {},
          operationId: entry.operationId || "console.operation",
          input: entry.input || {},
          output: entry.output,
          error: entry.error || ""
        });
      } catch {
        // Runtime logging below is best-effort and must not break the console path.
      }
    }
    logRuntimeEvent(entry.level || (entry.status === "failed" ? "warn" : "info"), entry.event || entry.operationId || "console.operation", {
      operationId: entry.operationId || "console.operation",
      status: entry.status || "ok",
      actor: entry.authSession?.user || entry.actor || {},
      input: entry.input || {},
      output: entry.output || {},
      error: entry.error || ""
    });
  }

  function knowledgeDomainContext(authSession = null) {
    return {
      runtime,
      metadataStore,
      protocolEventBus,
      saveSettings,
      authSession
    };
  }

  function knowledgeWorkflowContext(authSession = null) {
    return {
      protocolEventBus,
      metadataStore,
      runtime,
      loadSettings,
      resolveUploadSessionFiles: uploadSessionStore.resolveUploadSessionFiles,
      deleteUploadSession: uploadSessionStore.deleteUploadSession,
      getEmailRulesPath,
      loadEmailRules,
      saveEmailRules,
      getExpertVocabularyPath,
      getExpertVocabularySummary,
      loadExpertVocabulary,
      saveExpertVocabulary,
      listExpertVocabularyVersions,
      getKnowledgeTaxonomyPath,
      loadKnowledgeTaxonomy,
      saveKnowledgeTaxonomy,
      listKnowledgeTaxonomyVersions,
      getKnowledgeGuidanceSummary,
      createDocumentParsingRuntime,
      toPublicDocumentParsingResult,
      enhanceAffairTaxonomy,
      preprocessWordCloudVocabulary,
      evidenceSufficiencyGate,
      knowledgeAgentSkill,
      goldenRuleRuntime,
      knowledgeRuleAuthoringRuntime,
      knowledgeSkillRuntime,
      agentEvaluationRuntime,
      modelDecisionRuntime,
      knowledgeEvolutionRuntime,
      knowledgeDistillationRuntime,
      createKnowledgeDistillationWorkbench,
      jobManager,
      queueMonitor,
      contextRuntime,
      clientRuntimeAllocator,
      loadAgentGatewayModule,
      getAgentConfigRegistry,
      appendConsoleOperationLog,
      summarizationRuntime,
      agentExplorationRuntime,
      authSession
    };
  }

  function settingsAgentGatewayContext(authSession = null, extra = {}) {
    return {
      runtime,
      protocolEventBus,
      contextRuntime,
      agentWorkspace,
      clientRuntimeAllocator,
      loadAgentGatewayModule,
      loadModelProbeModule,
      agentConfigRegistry,
      appendConsoleOperationLog,
      authSession,
      ...extra
    };
  }

  function authorizationFacadeContext(authSession = null, extra = {}) {
    return {
      authorizationEngine,
      authorizationStore,
      authSession,
      ...extra
    };
  }

  function accessControlContext(authSession = null, extra = {}) {
    return {
      authSession,
      authorizationStore,
      ...extra
    };
  }

  function isFeatureActive(featureId) {
    const features = getFeatureEntries ? getFeatureEntries() : null;
    const active = Array.isArray(features?.activeFeatureIds) ? features.activeFeatureIds : [];
    return active.length === 0 || active.includes(featureId);
  }

  function resumeKnowledgeWordCloudTasks() {
    return resumeKnowledgeWordCloudClassificationTasks({
      userDataPath,
      metadataStore,
      protocolEventBus,
      contextRuntime,
      clientRuntimeAllocator,
      queueMonitor,
      loadSettings,
      loadAgentGatewayModule,
      getAgentConfigRegistry
    });
  }

  return Object.freeze({
    executeConsoleDomainOperation,
    knowledgeDomainContext,
    knowledgeWorkflowContext,
    settingsAgentGatewayContext,
    authorizationFacadeContext,
    accessControlContext,
    appendConsoleOperationLog,
    isFeatureActive,
    resumeKnowledgeWordCloudTasks
  });
}
