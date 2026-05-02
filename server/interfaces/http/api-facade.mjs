import os from "node:os";
import { listAvailableAnalysisModules } from "../../application/analysis-engine-registry.mjs";
import { getSettingsPath, loadSettings } from "../../config.mjs";
import { buildBootstrapPayload, getDiscoveryConfigPath } from "../../discovery-config.mjs";
import { getEmailRulesPath, loadEmailRules } from "../../email-rules.mjs";
import { getExpertVocabularyPath, loadExpertVocabulary } from "../../expert-vocabulary.mjs";
import {
  getKnowledgeGuidanceSummary,
  getKnowledgeTaxonomyPath,
  loadKnowledgeTaxonomy
} from "../../knowledge-taxonomy.mjs";
import {
  getMountConfigPath,
  getMountConfigPaths,
  loadMountConfig
} from "../../runtime/mount-config.mjs";
import { getToolPlatformPath, loadToolPlatform } from "../../tool-platform.mjs";

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
  maintenanceAgent = null
}) {
  const [
    settings,
    rules,
    expertVocabulary,
    knowledgeTaxonomy,
    knowledgeGuidance,
    jobs,
    clients,
    mountConfig,
    toolPlatform
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
    loadMountConfig(userDataPath),
    loadToolPlatform(userDataPath)
  ]);
  const analysisModules = await listAvailableAnalysisModules(runtime, settings);

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
      analysisModules,
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
    toolPlatform: {
      path: getToolPlatformPath(userDataPath),
      ...toolPlatform
    },
    auth: consoleAuth ? consoleAuth.getSummary() : null,
    maintenanceAgent: maintenanceAgent
      ? await maintenanceAgent.getConsoleSummary()
      : null,
    knowledgeConsole: await buildKnowledgeConsoleSummary(runtime, jobManager),
    storage: metadataStore.getStorageSummary(),
    jobs,
    clients
  };
}

export async function buildRuntimeInfo({
  userDataPath,
  distPath,
  runtime,
  discoveryState,
  metadataStore,
  serverUrl,
  consoleAuth = null
}) {
  const settings = await loadSettings(userDataPath, { redactSecrets: true });
  const mountConfig = await loadMountConfig(userDataPath);
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
      analysisModules: await listAvailableAnalysisModules(runtime, settings),
      currentAnalysisModuleId: settings.analysisModuleId
    },
    auth: consoleAuth ? consoleAuth.getSummary() : null,
    storage: metadataStore.getStorageSummary(),
    discovery: buildBootstrapPayload(discoveryState)
  };
}
