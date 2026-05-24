import os from "node:os";
import { listAvailableAnalysisModules } from "../../../../platform/specialized/knowledge/preprocessing/analysis-engine-registry.mjs";
import { getAgentConfigRegistry } from "../../../specialized/agent/agent-configs/config-registry.mjs";
import { getSettingsPath, loadSettings } from "../../platform-core/settings.mjs";
import { buildBootstrapPayload, getDiscoveryConfigPath } from "../../platform-core/discovery/config.mjs";
import { getEmailRulesPath, loadEmailRules } from "../../../specialized/knowledge/preprocessing/domain/rules/email-rules.mjs";
import { getExpertVocabularyPath, loadExpertVocabulary } from "../../../specialized/knowledge/preprocessing/domain/rules/expert-vocabulary.mjs";
import {
  getKnowledgeGuidanceSummary,
  getKnowledgeTaxonomyPath,
  loadKnowledgeTaxonomy
} from "../../../specialized/knowledge/preprocessing/domain/knowledge-taxonomy/index.mjs";
import {
  getMountConfigPath,
  getMountConfigPaths,
  loadMountConfig
} from "../../module-manager/mount-config.mjs";

function summarizeMount(name, mount) {
  return {
    name,
    id: mount?.id || "",
    kind: mount?.kind || name,
    enabled: mount?.enabled !== false,
    reason: mount?.reason || "",
    supportsStructuredDocument: typeof mount?.extractDocument === "function",
    supportsTextExtraction: typeof mount?.extractText === "function",
    supportsBatchHook: typeof mount?.onBatchCompleted === "function"
  };
}

function redactModulePaths(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  const clone = JSON.parse(JSON.stringify(value));
  function walk(item) {
    if (!item || typeof item !== "object") {
      return;
    }
    delete item.rootPath;
    delete item.databasePath;
    delete item.extensionPath;
    for (const child of Object.values(item)) {
      if (child && typeof child === "object") {
        walk(child);
      }
    }
  }
  walk(clone);
  return clone;
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

export async function buildKnowledgeConsoleSummary(runtime, jobManager) {
  const knowledgeBase = runtime?.mounts?.knowledgeBase;
  const [health, capabilities, maintenance, jobs] = await Promise.all([
    typeof knowledgeBase?.health === "function" ? Promise.resolve(knowledgeBase.health()) : Promise.resolve(null),
    typeof knowledgeBase?.capabilities === "function"
      ? Promise.resolve(knowledgeBase.capabilities())
      : Promise.resolve(null),
    typeof knowledgeBase?.getMaintenance === "function"
      ? Promise.resolve(knowledgeBase.getMaintenance())
      : Promise.resolve(null),
    jobManager.listJobs({ limit: 8 })
  ]);
  return {
    available: Boolean(knowledgeBase && knowledgeBase.enabled !== false),
    health: redactModulePaths(health),
    capabilities: redactModulePaths(capabilities),
    maintenance,
    recentJobs: jobs.items || []
  };
}

const PACT_CLIENT_CONNECTION = {
  kind: "pact-client",
  method: "pact-client 封装",
  state: "active",
  statusLabel: ""
};

const MCP_PLUGIN_CONNECTION = {
  kind: "mcp-plugin",
  method: "MCP 插件连接"
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compactText(value) {
  return String(value || "").trim();
}

function slugText(value, fallback = "target") {
  const normalized = compactText(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function isMcpPluginGrant(grant) {
  const metadata = asObject(grant?.metadata);
  return (
    compactText(grant?.type) === "mcp-client" ||
    compactText(metadata.issuedBy) === "pact-mcp-local-pairing"
  );
}

function mcpGrantTargets(grant) {
  const metadata = asObject(grant?.metadata);
  const targets = asArray(metadata.targets).map(compactText).filter(Boolean);
  if (targets.length > 0) {
    return targets;
  }
  const label = compactText(grant?.label).replace(/\s*\(MCP Client\)\s*$/i, "");
  return [label || compactText(grant?.id) || "MCP 插件"];
}

function mcpGrantConnectionState(grant) {
  if (compactText(grant?.revokedAt)) {
    return { state: "revoked", label: "已撤销", migrationState: "offline" };
  }
  if (grant?.enabled === false) {
    return { state: "disabled", label: "停用", migrationState: "offline" };
  }
  if (compactText(grant?.lastUsedAt)) {
    return { state: "connected", label: "已连接", migrationState: "unknown" };
  }
  return { state: "paired", label: "已配对", migrationState: "unknown" };
}

function mcpGrantRows(toolManagementPlatform) {
  const listGrants = toolManagementPlatform?.store?.listGrants;
  if (typeof listGrants !== "function") {
    return [];
  }

  try {
    return listGrants.call(toolManagementPlatform.store)
      .filter(isMcpPluginGrant)
      .flatMap((grant) => {
        const connection = mcpGrantConnectionState(grant);
        const metadata = asObject(grant.metadata);
        const targets = mcpGrantTargets(grant);
        return targets.map((target, index) => {
          const targetKey = targets.length > 1 ? `${slugText(target)}-${index + 1}` : slugText(target);
          const lastSeenAt = compactText(grant.lastUsedAt || grant.updatedAt || grant.createdAt);
          return {
            clientId: `mcp:${grant.id}:${targetKey}`,
            clientLabel: target || grant.label || grant.id,
            appVersion: compactText(metadata.connectorVersion),
            platform: "MCP 插件",
            hostname: target || "",
            bootstrapUrl: "",
            currentServiceUrl: "",
            desiredServiceUrl: "",
            currentJobServiceUrl: "",
            configVersion: "",
            migrationState: connection.migrationState,
            connectionKind: MCP_PLUGIN_CONNECTION.kind,
            connectionMethod: MCP_PLUGIN_CONNECTION.method,
            connectionState: connection.state,
            connectionStatusLabel: connection.label,
            connectionDetail: "Tool Management 授权",
            supportsMigration: false,
            sourceGrantId: grant.id,
            busy: false,
            lastJobId: "",
            lastError: "",
            firstSeenAt: compactText(grant.createdAt),
            lastSeenAt,
            lastSeenServerId: compactText(metadata.serverId)
          };
        });
      });
  } catch {
    return [];
  }
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

export function buildClientConnectionList(clientRegistrations, toolManagementPlatform = null) {
  const pactClientRows = asArray(clientRegistrations?.items).map(normalizePactClientRow);
  const mcpRows = mcpGrantRows(toolManagementPlatform);
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
  toolManagementPlatform = null
}) {
  const [
    settings,
    rawSettings,
    rules,
    expertVocabulary,
    knowledgeTaxonomy,
    knowledgeGuidance,
    jobs,
    clients,
    mountConfig
  ] = await Promise.all([
    loadSettings(userDataPath, { redactSecrets: true }),
    loadSettings(userDataPath),
    loadEmailRules(userDataPath),
    loadExpertVocabulary(userDataPath),
    loadKnowledgeTaxonomy(userDataPath),
    getKnowledgeGuidanceSummary(userDataPath),
    jobManager.listJobs({ limit: 50 }),
    Promise.resolve(
      buildClientConnectionList(
        metadataStore.listClientRegistrations({
          offlineAfterSeconds: discoveryState.offlineAfterSeconds
        }),
        toolManagementPlatform
      )
    ),
    loadMountConfig(userDataPath)
  ]);
  const agentConfigRegistry = getAgentConfigRegistry();
  const agentConfigState = await agentConfigRegistry.refresh({ settingsFallback: rawSettings });
  const projectedSettings = {
    ...settings,
    modelLibraryEntries: agentConfigRegistry.getModelLibraryEntries(),
    modelLibraryAgentIds: agentConfigRegistry.getModelLibraryAgents().map((agent) => agent.uid).filter(Boolean),
    modelLibraryAgents: agentConfigRegistry.getModelLibraryAgents({ redactSecrets: true })
  };
  const analysisModules = await listAvailableAnalysisModules(runtime, projectedSettings);
  const analysisRuntimeEnabled = featureEnabled(features, "analysis-runtime");
  const knowledgeCoreEnabled = featureEnabled(features, "knowledge-core");

  return {
    server: {
      url: serverUrl,
      userDataPath,
      distPath: distPath || "",
      hostname: os.hostname()
    },
    runtime: {
      profile: runtime.runtimeOptions.profile,
      cwd: runtime.runtimeOptions.cwd,
      mountModules: runtime.runtimeOptions.mountModules,
      mountRouting: runtime.runtimeOptions.mountRouting,
      mountGeneration: runtime.mountGeneration || 0,
      mountConfigPath: getMountConfigPath(userDataPath),
      mountConfigPaths: getMountConfigPaths(userDataPath),
      mountConfig,
      mounts: Object.entries(runtime.mounts || {}).map(([name, mount]) => summarizeMount(name, mount)),
      analysisModules: analysisRuntimeEnabled ? analysisModules : [],
      currentAnalysisModuleId: projectedSettings.analysisModuleId
    },
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
      path: getEmailRulesPath(userDataPath),
      rules
    },
    expertVocabulary: {
      path: getExpertVocabularyPath(userDataPath),
      vocabulary: expertVocabulary
    },
    knowledgeTaxonomy: {
      path: getKnowledgeTaxonomyPath(userDataPath),
      taxonomy: knowledgeTaxonomy,
      guidance: knowledgeGuidance
    },
    auth: consoleAuth ? consoleAuth.getSummary() : null,
    maintenanceAgent: maintenanceAgent
      ? await maintenanceAgent.getConsoleSummary()
      : null,
    knowledgeConsole: knowledgeCoreEnabled ? await buildKnowledgeConsoleSummary(runtime, jobManager) : null,
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
  features = null
}) {
  const settings = await loadSettings(userDataPath, { redactSecrets: true });
  const mountConfig = await loadMountConfig(userDataPath);
  const analysisRuntimeEnabled = featureEnabled(features, "analysis-runtime");
  return {
    server: {
      url: serverUrl,
      userDataPath,
      distPath: distPath || "",
      hostname: os.hostname()
    },
    runtime: {
      profile: runtime.runtimeOptions.profile,
      cwd: runtime.runtimeOptions.cwd,
      mountModules: runtime.runtimeOptions.mountModules,
      mountRouting: runtime.runtimeOptions.mountRouting,
      mountGeneration: runtime.mountGeneration || 0,
      mountConfigPath: getMountConfigPath(userDataPath),
      mountConfigPaths: getMountConfigPaths(userDataPath),
      mountConfig,
      mounts: Object.entries(runtime.mounts || {}).map(([name, mount]) =>
        summarizeMount(name, mount)
      ),
      analysisModules: analysisRuntimeEnabled ? await listAvailableAnalysisModules(runtime, settings) : [],
      currentAnalysisModuleId: settings.analysisModuleId
    },
    auth: consoleAuth ? consoleAuth.getSummary() : null,
    storage: metadataStore.getStorageSummary(),
    discovery: buildBootstrapPayload(discoveryState),
    features
  };
}
