import os from "node:os";
import { getSettingsPath, loadSettings } from "../../platform-core/settings.mjs";
import { buildBootstrapPayload, getDiscoveryConfigPath } from "../../platform-core/discovery/config.mjs";

function createFallbackAgentConfigRegistry() {
  return {
    async refresh() {
      return {
        rootPath: "",
        modelListPath: "",
        agentListPath: "",
        modelManifest: {},
        agentManifest: {}
      };
    },
    getModelLibraryEntries() {
      return [];
    },
    getModelLibraryAgents() {
      return [];
    }
  };
}

function normalizeConsoleDomainServices(services = {}) {
  return {
    getAgentConfigRegistry:
      typeof services.getAgentConfigRegistry === "function"
        ? services.getAgentConfigRegistry
        : createFallbackAgentConfigRegistry,
    listAvailableAnalysisModules:
      typeof services.listAvailableAnalysisModules === "function"
        ? services.listAvailableAnalysisModules
        : async () => [],
    getEmailRulesPath:
      typeof services.getEmailRulesPath === "function" ? services.getEmailRulesPath : () => "",
    loadEmailRules:
      typeof services.loadEmailRules === "function" ? services.loadEmailRules : async () => ({}),
    getExpertVocabularyPath:
      typeof services.getExpertVocabularyPath === "function" ? services.getExpertVocabularyPath : () => "",
    loadExpertVocabulary:
      typeof services.loadExpertVocabulary === "function" ? services.loadExpertVocabulary : async () => ({}),
    getKnowledgeGuidanceSummary:
      typeof services.getKnowledgeGuidanceSummary === "function"
        ? services.getKnowledgeGuidanceSummary
        : async () => ({}),
    getKnowledgeTaxonomyPath:
      typeof services.getKnowledgeTaxonomyPath === "function" ? services.getKnowledgeTaxonomyPath : () => "",
    loadKnowledgeTaxonomy:
      typeof services.loadKnowledgeTaxonomy === "function" ? services.loadKnowledgeTaxonomy : async () => ({}),
    buildToolManagementClientConnectionRows:
      typeof services.buildToolManagementClientConnectionRows === "function"
        ? services.buildToolManagementClientConnectionRows
        : () => [],
    buildKnowledgeConsoleSummary:
      typeof services.buildKnowledgeConsoleSummary === "function"
        ? services.buildKnowledgeConsoleSummary
        : async () => null,
    buildRuntimeConsoleSummary:
      typeof services.buildRuntimeConsoleSummary === "function"
        ? services.buildRuntimeConsoleSummary
        : async () => null
  };
}

function featureEnabled(features, featureId) {
  const active = Array.isArray(features?.activeFeatureIds) ? features.activeFeatureIds : [];
  return active.length === 0 || active.includes(featureId);
}

const AGENT_SELECTOR_SUPPORTED_PROVIDERS = new Set([
  "deepseek",
  "openrouter",
  "copilot",
  "custom-http",
  "local-model"
]);

function stringValue(value) {
  return String(value || "").trim();
}

function agentSelectorUid(entry = {}) {
  return stringValue(entry.uid || entry.instanceId || entry.alias);
}

function agentSelectorLabel(entry = {}, agentUid = "") {
  const name = stringValue(entry.label || entry.agentName || entry.alias || agentUid);
  const model = stringValue(entry.model || entry.engine);
  return model && model !== name ? `${name} · ${model}` : name;
}

function agentSelectorModuleIds(entry = {}) {
  const access = entry?.moduleAccess && typeof entry.moduleAccess === "object"
    ? entry.moduleAccess
    : {};
  if (access.mode !== "selected") {
    return ["*"];
  }
  return Array.isArray(access.moduleIds)
    ? access.moduleIds.map((item) => stringValue(item)).filter(Boolean)
    : [];
}

function agentSelectorStatus(settings = {}, entry = {}) {
  const provider = stringValue(entry.provider);
  const model = stringValue(entry.model || entry.engine);
  const hasModel = Boolean(model);
  if (!AGENT_SELECTOR_SUPPORTED_PROVIDERS.has(provider)) {
    return {
      status: "unsupported",
      selectable: false,
      reason: "该智能体来源尚未接入服务端调用链路。"
    };
  }
  if (provider === "custom-http") {
    const hasUrl = Boolean(stringValue(entry.url || entry.baseUrl || settings.customHttpAdapter?.url));
    const hasToken = Boolean(entry.tokenConfigured || entry.apiKeyConfigured || stringValue(entry.token || entry.apiKey));
    if (!hasUrl || !hasToken) {
      return {
        status: "unconfigured",
        selectable: false,
        reason: "缺少调用地址或凭据。"
      };
    }
    return { status: "available", selectable: true, reason: "" };
  }
  if (provider === "local-model") {
    const hasUrl = Boolean(stringValue(entry.url || entry.baseUrl || settings.localModelEndpoint));
    if (!hasModel || !hasUrl) {
      return {
        status: "unconfigured",
        selectable: false,
        reason: "缺少本地模型名称或调用地址。"
      };
    }
    return { status: "available", selectable: true, reason: "" };
  }
  const providerCredentialConfigured =
    provider === "deepseek"
      ? Boolean(settings.deepSeekApiKeyConfigured || stringValue(settings.deepSeekApiKey) || entry.apiKeyConfigured || stringValue(entry.apiKey))
      : provider === "openrouter"
        ? Boolean(settings.openRouterApiKeyConfigured || stringValue(settings.openRouterApiKey) || entry.apiKeyConfigured || stringValue(entry.apiKey))
        : provider === "copilot"
          ? Boolean(settings.copilotApiKeyConfigured || stringValue(settings.copilotApiKey) || entry.apiKeyConfigured || stringValue(entry.apiKey))
          : Boolean(entry.apiKeyConfigured || stringValue(entry.apiKey || entry.token));
  if (!hasModel || !providerCredentialConfigured) {
    return {
      status: "unconfigured",
      selectable: false,
      reason: "缺少模型或凭据。"
    };
  }
  return { status: "available", selectable: true, reason: "" };
}

function buildAgentSelector(settings = {}) {
  const options = [];
  const seen = new Set();
  for (const entry of Array.isArray(settings.modelLibraryAgents) ? settings.modelLibraryAgents : []) {
    const agentUid = agentSelectorUid(entry);
    if (!agentUid || seen.has(agentUid)) {
      continue;
    }
    seen.add(agentUid);
    const state = agentSelectorStatus(settings, entry);
    options.push({
      agentUid,
      value: agentUid,
      label: agentSelectorLabel(entry, agentUid),
      provider: stringValue(entry.provider),
      model: stringValue(entry.model || entry.engine),
      permissionGroupId: stringValue(entry.permissionGroupId),
      moduleIds: agentSelectorModuleIds(entry),
      capabilities: state.selectable
        ? ["agent.invoke", "knowledge.agent.answer"]
        : [],
      status: state.status,
      selectable: state.selectable,
      reason: state.reason
    });
  }
  return {
    schemaVersion: 1,
    source: "agent-configs",
    updatedAt: new Date().toISOString(),
    options
  };
}

const PACT_CLIENT_CONNECTION = {
  kind: "pact-client",
  method: "pact-client 封装",
  state: "active",
  statusLabel: ""
};

const MCP_PLUGIN_CONNECTION = {
  kind: "mcp-plugin"
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactText(value) {
  return String(value || "").trim();
}

function normalizePactClientRow(item) {
  const migrationState = compactText(item.migrationState) || "unknown";
  return {
    ...item,
    connectionKind: compactText(item.connectionKind) || PACT_CLIENT_CONNECTION.kind,
    connectionMethod: compactText(item.connectionMethod) || PACT_CLIENT_CONNECTION.method,
    connectionState: compactText(item.connectionState) || (migrationState === "offline" ? "offline" : PACT_CLIENT_CONNECTION.state),
    connectionStatusLabel: compactText(item.connectionStatusLabel) || PACT_CLIENT_CONNECTION.statusLabel,
    supportsMigration: item.supportsMigration !== false
  };
}

function buildClientConnectionSummary(items) {
  return {
    totalCount: items.length,
    alignedCount: items.filter((item) => item.migrationState === "aligned").length,
    outdatedCount: items.filter((item) => item.migrationState === "outdated").length,
    drainingCount: items.filter((item) => item.migrationState === "draining").length,
    bootstrapOnlyCount: items.filter((item) => item.migrationState === "bootstrap-only").length,
    offlineCount: items.filter((item) => item.migrationState === "offline").length,
    unknownCount: items.filter((item) => item.migrationState === "unknown").length,
    pactClientCount: items.filter((item) => item.connectionKind === PACT_CLIENT_CONNECTION.kind).length,
    mcpPluginCount: items.filter((item) => item.connectionKind === MCP_PLUGIN_CONNECTION.kind).length,
    migratableCount: items.filter((item) => item.supportsMigration !== false).length
  };
}

export function buildClientConnectionList(clientRegistrations, additionalConnectionRows = []) {
  const pactClientRows = asArray(clientRegistrations?.items).map(normalizePactClientRow);
  const mcpRows = asArray(additionalConnectionRows);
  const items = [...pactClientRows, ...mcpRows].sort((left, right) =>
    compactText(right.lastSeenAt).localeCompare(compactText(left.lastSeenAt))
  );
  return {
    summary: buildClientConnectionSummary(items),
    items
  };
}

export async function buildConsoleState({
  userDataPath,
  distPath,
  runtime,
  discoveryState,
  jobManager,
  metadataStore,
  serverUrl,
  consoleAuth = null,
  maintenanceAgent = null,
  clientRuntimeAllocator = null,
  features = null,
  toolManagementPlatform = null,
  consoleDomainServices = null
}) {
  const domainServices = normalizeConsoleDomainServices(consoleDomainServices);
  const [
    settings,
    rawSettings,
    rules,
    expertVocabulary,
    knowledgeTaxonomy,
    knowledgeGuidance,
    jobs,
    clients
  ] = await Promise.all([
    loadSettings(userDataPath, { redactSecrets: true }),
    loadSettings(userDataPath),
    domainServices.loadEmailRules(userDataPath),
    domainServices.loadExpertVocabulary(userDataPath),
    domainServices.loadKnowledgeTaxonomy(userDataPath),
    domainServices.getKnowledgeGuidanceSummary(userDataPath),
    jobManager.listJobs({ limit: 50 }),
    Promise.resolve(metadataStore.listClientRegistrations({
      offlineAfterSeconds: discoveryState.offlineAfterSeconds
    })).then(async (clientRegistrations) =>
      buildClientConnectionList(
        clientRegistrations,
        await domainServices.buildToolManagementClientConnectionRows(toolManagementPlatform, {
          offlineAfterSeconds: discoveryState.offlineAfterSeconds
        })
      )
    )
  ]);
  const agentConfigRegistry = domainServices.getAgentConfigRegistry();
  const agentConfigState = await agentConfigRegistry.refresh({ settingsFallback: rawSettings });
  const projectedSettings = {
    ...settings,
    modelLibraryEntries: agentConfigRegistry.getModelLibraryEntries(),
    modelLibraryAgentIds: agentConfigRegistry.getModelLibraryAgents().map((agent) => agent.uid).filter(Boolean),
    modelLibraryAgents: agentConfigRegistry.getModelLibraryAgents({ redactSecrets: true })
  };
  const knowledgeCoreEnabled = featureEnabled(features, "knowledge-core");
  const runtimeSummary = await domainServices.buildRuntimeConsoleSummary({
    userDataPath,
    runtime,
    settings: projectedSettings,
    features,
    listAvailableAnalysisModules: domainServices.listAvailableAnalysisModules
  });

  return {
    server: {
      url: serverUrl,
      userDataPath,
      distPath: distPath || "",
      hostname: os.hostname()
    },
    runtime: runtimeSummary,
    settings: {
      path: getSettingsPath(userDataPath),
      value: projectedSettings
    },
    agentSelector: buildAgentSelector(projectedSettings),
    agentConfigs: {
      rootPath: agentConfigState.rootPath,
      modelListPath: agentConfigState.modelListPath,
      agentListPath: agentConfigState.agentListPath,
      modelManifest: agentConfigState.modelManifest,
      agentManifest: agentConfigState.agentManifest
    },
    discovery: {
      path: getDiscoveryConfigPath(userDataPath),
      value: discoveryState,
      bootstrap: buildBootstrapPayload(discoveryState)
    },
    emailRules: {
      path: domainServices.getEmailRulesPath(userDataPath),
      rules
    },
    expertVocabulary: {
      path: domainServices.getExpertVocabularyPath(userDataPath),
      vocabulary: expertVocabulary
    },
    knowledgeTaxonomy: {
      path: domainServices.getKnowledgeTaxonomyPath(userDataPath),
      taxonomy: knowledgeTaxonomy,
      guidance: knowledgeGuidance
    },
    auth: consoleAuth ? consoleAuth.getSummary() : null,
    maintenanceAgent: maintenanceAgent
      ? await maintenanceAgent.getConsoleSummary()
      : null,
    knowledgeConsole: knowledgeCoreEnabled
      ? await domainServices.buildKnowledgeConsoleSummary(runtime, jobManager)
      : null,
    storage: metadataStore.getStorageSummary(),
    jobs,
    clients,
    clientRuntime: clientRuntimeAllocator && typeof clientRuntimeAllocator.getStatus === "function"
      ? await clientRuntimeAllocator.getStatus()
      : null,
    features
  };
}

export async function buildRuntimeInfo({
  userDataPath,
  distPath,
  runtime,
  discoveryState,
  metadataStore,
  serverUrl,
  consoleAuth = null,
  features = null,
  consoleDomainServices = null
}) {
  const domainServices = normalizeConsoleDomainServices(consoleDomainServices);
  const settings = await loadSettings(userDataPath, { redactSecrets: true });
  const runtimeSummary = await domainServices.buildRuntimeConsoleSummary({
    userDataPath,
    runtime,
    settings,
    features,
    listAvailableAnalysisModules: domainServices.listAvailableAnalysisModules
  });
  return {
    server: {
      url: serverUrl,
      userDataPath,
      distPath: distPath || "",
      hostname: os.hostname()
    },
    runtime: runtimeSummary,
    auth: consoleAuth ? consoleAuth.getSummary() : null,
    storage: metadataStore.getStorageSummary(),
    discovery: buildBootstrapPayload(discoveryState),
    features
  };
}
