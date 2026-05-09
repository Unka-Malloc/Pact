import { runEmailAnalysis } from "../domain/rules/email-analysis.mjs";

const BUILTIN_MODULES = [
  {
    id: "builtin:heuristic-hybrid-v1",
    label: "Heuristic Hybrid v1",
    description:
      "Built-in heuristic transaction, people, timeline, and association analysis pipeline.",
    executionMode: "hybrid"
  }
];

function normalizeModuleDescriptor(descriptor = {}) {
  return {
    id: String(descriptor.id || "").trim(),
    label: String(descriptor.label || descriptor.id || "").trim(),
    description: String(descriptor.description || "").trim(),
    executionMode: String(descriptor.executionMode || descriptor.mode || "custom").trim() || "custom"
  };
}

async function refreshExternalMount(externalMount, settings) {
  if (externalMount && typeof externalMount.reload === "function") {
    await externalMount.reload({ settings });
  }
}

async function listExternalModules(runtime, settings) {
  const mount = runtime?.mounts?.analysis;
  if (!mount || mount.enabled === false) {
    return [];
  }

  await refreshExternalMount(mount, settings);

  const listed =
    typeof mount.listModules === "function"
      ? await mount.listModules({ settings })
      : typeof mount.listAlgorithms === "function"
        ? await mount.listAlgorithms({ settings })
        : Array.isArray(mount.modules)
          ? mount.modules
          : Array.isArray(mount.algorithms)
            ? mount.algorithms
            : mount.module
              ? [mount.module]
              : mount.algorithm
                ? [mount.algorithm]
                : [];

  return listed
    .map(normalizeModuleDescriptor)
    .filter((item) => item.id);
}

export async function listAvailableAnalysisModules(runtime, settings = {}) {
  return [...BUILTIN_MODULES, ...(await listExternalModules(runtime, settings))];
}

export async function runConfiguredAnalysisModule({
  runtime,
  sources,
  chunks,
  settings,
  generatedAt,
  rules
}) {
  const configuredModuleId =
    String(
      settings?.analysisModuleId || settings?.analysisAlgorithmId || BUILTIN_MODULES[0].id
    ).trim() || BUILTIN_MODULES[0].id;
  const externalMount = runtime?.mounts?.analysis;
  const externalModules = await listExternalModules(runtime, settings);
  const builtin = BUILTIN_MODULES.find((module) => module.id === configuredModuleId);

  if (builtin || !externalMount || externalMount.enabled === false) {
    const resolvedBuiltin = builtin || BUILTIN_MODULES[0];
    return {
      analysis: runEmailAnalysis({
        sources,
        chunks,
        settings,
        generatedAt,
        rules
      }),
      runtimeInfo: {
        moduleId: resolvedBuiltin.id,
        moduleLabel: resolvedBuiltin.label,
        moduleSource: "builtin",
        executionMode: resolvedBuiltin.executionMode
      }
    };
  }

  const supportedIds = new Set(externalModules.map((module) => module.id));
  const fallbackModuleId =
    externalModules[0]?.id ||
    String(
      externalMount.defaultModuleId ||
        externalMount.defaultAlgorithmId ||
        externalMount.id ||
        ""
    ).trim();
  const selectedModuleId = supportedIds.has(configuredModuleId)
    ? configuredModuleId
    : fallbackModuleId;

  if (!selectedModuleId) {
    throw new Error(`分析模块不可用：${configuredModuleId}`);
  }

  let analysis;
  if (typeof externalMount.runModule === "function") {
    analysis = await externalMount.runModule({
      moduleId: selectedModuleId,
      sources,
      chunks,
      settings,
      generatedAt,
      rules
    });
  } else if (typeof externalMount.runAnalysis === "function") {
    analysis = await externalMount.runAnalysis({
      algorithmId: selectedModuleId,
      moduleId: selectedModuleId,
      sources,
      chunks,
      settings,
      generatedAt,
      rules
    });
  } else {
    throw new Error(`分析模块不可执行：${configuredModuleId}`);
  }

  if (!analysis || typeof analysis !== "object") {
    throw new Error(`分析模块返回结果无效：${selectedModuleId}`);
  }

  const descriptor =
    externalModules.find((module) => module.id === selectedModuleId) ||
    normalizeModuleDescriptor({
      id: selectedModuleId,
      label: selectedModuleId
    });

  return {
    analysis,
    runtimeInfo: {
      moduleId: selectedModuleId,
      moduleLabel: descriptor.label,
      moduleSource: externalMount.id || "external",
      executionMode: descriptor.executionMode
    }
  };
}
