import os from "node:os";
import { listAvailableAnalysisModules } from "../../../../platform/specialized/knowledge/runtime/analysis-engine-registry.mjs";
import { getSettingsPath, loadSettings } from "../../platform-core/settings.mjs";
import { buildBootstrapPayload, getDiscoveryConfigPath } from "../../platform-core/discovery/config.mjs";
import { getEmailRulesPath, loadEmailRules } from "../../../specialized/knowledge/domain/rules/email-rules.mjs";
import { getExpertVocabularyPath, loadExpertVocabulary } from "../../../specialized/knowledge/domain/rules/expert-vocabulary.mjs";
import {
  getKnowledgeGuidanceSummary,
  getKnowledgeTaxonomyPath,
  loadKnowledgeTaxonomy
} from "../../../specialized/knowledge/domain/knowledge-taxonomy/index.mjs";
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
  features = null
}) {
  const [
    settings,
    rules,
    expertVocabulary,
    knowledgeTaxonomy,
    knowledgeGuidance,
    jobs,
    clients,
    mountConfig
  ] = await Promise.all([
    loadSettings(userDataPath, { redactSecrets: true }),
    loadEmailRules(userDataPath),
    loadExpertVocabulary(userDataPath),
    loadKnowledgeTaxonomy(userDataPath),
    getKnowledgeGuidanceSummary(userDataPath),
    jobManager.listJobs({ limit: 50 }),
    Promise.resolve(
      metadataStore.listClientRegistrations({
        offlineAfterSeconds: discoveryState.offlineAfterSeconds
      })
    ),
    loadMountConfig(userDataPath)
  ]);
  const analysisModules = await listAvailableAnalysisModules(runtime, settings);
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
      currentAnalysisModuleId: settings.analysisModuleId
    },
    settings: {
      path: getSettingsPath(userDataPath),
      value: settings
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
