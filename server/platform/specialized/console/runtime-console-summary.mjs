import {
  getMountConfigPath,
  getMountConfigPaths,
  loadMountConfig
} from "../../common/module-manager/mount-config.mjs";

function featureEnabled(features, featureId) {
  const active = Array.isArray(features?.activeFeatureIds) ? features.activeFeatureIds : [];
  return active.length === 0 || active.includes(featureId);
}

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

export async function buildRuntimeConsoleSummary({
  userDataPath,
  runtime,
  settings = {},
  features = null,
  listAvailableAnalysisModules = async () => []
}) {
  const mountConfig = await loadMountConfig(userDataPath);
  const analysisRuntimeEnabled = featureEnabled(features, "analysis-runtime");
  return {
    profile: runtime.runtimeOptions.profile,
    cwd: runtime.runtimeOptions.cwd,
    mountModules: runtime.runtimeOptions.mountModules,
    mountRouting: runtime.runtimeOptions.mountRouting,
    mountGeneration: runtime.mountGeneration || 0,
    mountConfigPath: getMountConfigPath(userDataPath),
    mountConfigPaths: getMountConfigPaths(userDataPath),
    mountConfig,
    mounts: Object.entries(runtime.mounts || {}).map(([name, mount]) => summarizeMount(name, mount)),
    analysisModules: analysisRuntimeEnabled
      ? Array.isArray(settings.analysisModules)
        ? settings.analysisModules
        : await listAvailableAnalysisModules(runtime, settings)
      : [],
    currentAnalysisModuleId: settings.analysisModuleId
  };
}
