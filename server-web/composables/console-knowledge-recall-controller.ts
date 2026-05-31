import { computed, watch, type ComputedRef, type Ref } from "vue";
import { bridge } from "../lib/bridge";
import type {
  KnowledgeConsoleState,
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
  KnowledgeSource,
  MaintenanceSettings,
} from "../lib/types";
import type {
  DebugTab,
  KnowledgeRecallDebugRun,
  OptionBarOption,
} from "../types/app";
import {
  knowledgeResultEvidenceId,
  normalizeSearchResults,
} from "./console-knowledge-search-utils";
import { asRecord } from "./console-model-utils";

type KnowledgeSearchFormState = {
  query: string;
};

type KnowledgeRecallDebugFormState = {
  query: string;
  targetId: string;
  retrievalMode: string;
  keywordOnly: boolean;
  learningEnabled: boolean;
  explain: boolean;
};

type KnowledgeRecallDebugTarget = {
  value: string;
  label: string;
  kind: "internal" | "source" | "external";
  provider?: string;
  spaceId?: string;
  sourceId?: string;
  modeOptions: OptionBarOption[];
};

type ConsoleKnowledgeRecallControllerOptions = {
  activeKnowledgeSources: ComputedRef<KnowledgeSource[]>;
  canReadKnowledge: ComputedRef<boolean>;
  clearAllBusy: () => void;
  clearSelectedEvidence: () => void;
  error: Ref<string>;
  knowledgeConsole: Ref<KnowledgeConsoleState | null>;
  knowledgeMaintenanceDraft: Ref<MaintenanceSettings>;
  knowledgeRecallBackendSpacesResult: Ref<Record<string, unknown> | null>;
  knowledgeRecallDebugForm: Ref<KnowledgeRecallDebugFormState>;
  knowledgeRecallDebugRuns: Ref<KnowledgeRecallDebugRun[]>;
  knowledgeSearchForm: Ref<KnowledgeSearchFormState>;
  knowledgeSearchResponse: Ref<KnowledgeSearchResponse | null>;
  knowledgeSearchResults: Ref<KnowledgeSearchResult[]>;
  lastKnowledgeSearchQuery: Ref<string>;
  loadEvidence: (evidenceId: string) => Promise<void>;
  openDebugTab: (tab: DebugTab) => void;
  setBusy: (key: string) => void;
};

function normalizeModeOptions(value: unknown, fallback: OptionBarOption[] = []): OptionBarOption[] {
  const rawItems = Array.isArray(value) ? value : value ? [value] : [];
  const options = rawItems
    .map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const optionValue = String(record.value || record.id || record.mode || record.name || "").trim();
        if (!optionValue) {
          return null;
        }
        return {
          value: optionValue,
          label: String(record.label || record.title || optionValue),
        } as OptionBarOption;
      }
      const optionValue = String(item || "").trim();
      return optionValue ? ({ value: optionValue, label: optionValue } as OptionBarOption) : null;
    })
    .filter(Boolean) as OptionBarOption[];
  const unique = options.filter(
    (option, index, list) => list.findIndex((candidate) => candidate.value === option.value) === index,
  );
  return unique.length ? unique : fallback;
}

export function createConsoleKnowledgeRecallController(
  options: ConsoleKnowledgeRecallControllerOptions,
) {
  function currentKnowledgeRetrievalSettings() {
    const retrieval = asRecord(options.knowledgeMaintenanceDraft.value.retrieval) || {};
    return { ...retrieval };
  }

  function currentKnowledgeLearningEnabled() {
    const learning = asRecord(options.knowledgeMaintenanceDraft.value.learning) || {};
    const retrieval = currentKnowledgeRetrievalSettings();
    return learning.enabled !== false && retrieval.learningEnabled !== false;
  }

  function currentKnowledgeCoreModeOptions() {
    const capabilities = asRecord(options.knowledgeConsole.value?.capabilities) || {};
    const healthCapabilities = asRecord(options.knowledgeConsole.value?.health?.capabilities) || {};
    const retrievalPolicy = asRecord(capabilities.retrievalPolicy) || asRecord(healthCapabilities.retrievalPolicy) || {};
    return normalizeModeOptions(
      capabilities.retrievalModes || healthCapabilities.retrievalModes || retrievalPolicy.modes,
      [
        { value: "hybrid", label: "Hybrid" },
        { value: "keyword", label: "Keyword" },
      ],
    );
  }

  function externalKnowledgeSpaceModeOptions(space: Record<string, unknown>) {
    return normalizeModeOptions(
      space.retrievalModes || space.searchModes,
      [{ value: "backendContract", label: "Backend Contract" }],
    );
  }

  const knowledgeRecallBackendSpaces = computed<Array<Record<string, unknown>>>(() => {
    const spaces = options.knowledgeRecallBackendSpacesResult.value?.spaces;
    return Array.isArray(spaces) ? spaces as Array<Record<string, unknown>> : [];
  });

  const knowledgeRecallDebugTargets = computed<KnowledgeRecallDebugTarget[]>(() => {
    const coreModes = currentKnowledgeCoreModeOptions();
    const targets: KnowledgeRecallDebugTarget[] = [{
      value: "internal:global",
      label: "全局知识空间",
      kind: "internal",
      modeOptions: coreModes,
    }];
    for (const source of options.activeKnowledgeSources.value) {
      targets.push({
        value: `source:${source.sourceId}`,
        label: source.label || source.directoryPath || "受管知识目录",
        kind: "source",
        sourceId: source.sourceId,
        modeOptions: coreModes,
      });
    }
    for (const space of knowledgeRecallBackendSpaces.value) {
      const provider = String(space.provider || "").trim();
      const spaceId = String(space.spaceId || "").trim();
      if (!spaceId) {
        continue;
      }
      targets.push({
        value: `external:${spaceId}`,
        label: `${String(space.label || provider || "外部知识库")} · ${provider || "external"}`,
        kind: "external",
        provider,
        spaceId,
        modeOptions: externalKnowledgeSpaceModeOptions(space),
      });
    }
    return targets;
  });

  const knowledgeRecallDebugTargetOptions = computed<OptionBarOption[]>(() =>
    knowledgeRecallDebugTargets.value.map((target) => ({
      value: target.value,
      label: target.label,
    })),
  );

  const selectedKnowledgeRecallDebugTarget = computed<KnowledgeRecallDebugTarget>(() =>
    knowledgeRecallDebugTargets.value.find((target) => target.value === options.knowledgeRecallDebugForm.value.targetId) ||
      knowledgeRecallDebugTargets.value[0],
  );

  const knowledgeRecallDebugModeOptionBarOptions = computed<OptionBarOption[]>(() =>
    selectedKnowledgeRecallDebugTarget.value?.modeOptions?.length
      ? selectedKnowledgeRecallDebugTarget.value.modeOptions
      : currentKnowledgeCoreModeOptions(),
  );

  function ensureKnowledgeRecallDebugSelection() {
    const targets = knowledgeRecallDebugTargets.value;
    if (!targets.length) {
      return;
    }
    if (!targets.some((target) => target.value === options.knowledgeRecallDebugForm.value.targetId)) {
      options.knowledgeRecallDebugForm.value.targetId = targets[0].value;
    }
    const modes = knowledgeRecallDebugModeOptionBarOptions.value;
    if (modes.length && !modes.some((option) => option.value === options.knowledgeRecallDebugForm.value.retrievalMode)) {
      options.knowledgeRecallDebugForm.value.retrievalMode = String(modes[0].value);
    }
  }

  watch(knowledgeRecallDebugTargets, ensureKnowledgeRecallDebugSelection, { immediate: true });
  watch(() => options.knowledgeRecallDebugForm.value.targetId, ensureKnowledgeRecallDebugSelection);
  watch(knowledgeRecallDebugModeOptionBarOptions, ensureKnowledgeRecallDebugSelection);

  async function refreshKnowledgeRecallBackendSpaces() {
    try {
      options.knowledgeRecallBackendSpacesResult.value = await bridge.listKnowledgeSpaces();
    } catch {
      options.knowledgeRecallBackendSpacesResult.value = null;
    } finally {
      ensureKnowledgeRecallDebugSelection();
    }
  }

  function currentKnowledgeSearchLimit() {
    const retrieval = currentKnowledgeRetrievalSettings();
    const topK = Number(retrieval.topK || 20);
    return Math.max(1, Math.min(Number.isFinite(topK) ? topK : 20, 100));
  }

  async function searchKnowledge() {
    const query = options.knowledgeSearchForm.value.query.trim();
    if (!query) {
      options.error.value = "请输入知识召回调试问题。";
      return;
    }
    if (!options.canReadKnowledge.value) {
      options.error.value = "当前账号没有知识库读取权限。";
      return;
    }
    options.setBusy("knowledge:search");
    options.error.value = "";
    options.openDebugTab("knowledgeRecall");
    options.clearSelectedEvidence();
    try {
      const retrievalProfile = currentKnowledgeRetrievalSettings();
      const result = await bridge.searchKnowledge({
        query,
        limit: currentKnowledgeSearchLimit(),
        retrievalMode: "hybrid",
        keywordOnly: false,
        retrievalProfile,
        profile: { retrieval: retrievalProfile },
        retrievalProfileId: String((retrievalProfile as any).retrievalProfileId || ""),
        clientId: "server-console-knowledge-recall",
        requestSurface: "console",
        responseProfile: "console",
        explain: true,
        learningEnabled: currentKnowledgeLearningEnabled(),
      });
      options.knowledgeSearchResponse.value = result;
      options.knowledgeSearchResults.value = normalizeSearchResults(result);
      options.lastKnowledgeSearchQuery.value = query;
      const firstEvidenceId = options.knowledgeSearchResults.value
        .map((item) => knowledgeResultEvidenceId(item))
        .find(Boolean);
      if (firstEvidenceId) {
        await options.loadEvidence(firstEvidenceId);
      }
    } catch (nextError) {
      options.error.value = nextError instanceof Error ? nextError.message : "知识召回失败。";
    } finally {
      options.clearAllBusy();
    }
  }

  function currentKnowledgeRecallTopK() {
    const settings = currentKnowledgeRetrievalSettings();
    const topK = Number(settings.topK || 20);
    return Math.max(1, Math.min(Number.isFinite(topK) ? Math.floor(topK) : 20, 100));
  }

  function buildKnowledgeRecallSearchPayload(query: string) {
    const topK = currentKnowledgeRecallTopK();
    const target = selectedKnowledgeRecallDebugTarget.value;
    const retrievalMode = String(
      knowledgeRecallDebugModeOptionBarOptions.value.some((option) => option.value === options.knowledgeRecallDebugForm.value.retrievalMode)
        ? options.knowledgeRecallDebugForm.value.retrievalMode
        : knowledgeRecallDebugModeOptionBarOptions.value[0]?.value || "hybrid",
    );
    const retrievalProfile = {
      ...currentKnowledgeRetrievalSettings(),
      topK,
    };
    const payload: Record<string, unknown> = {
      query,
      limit: topK,
      retrievalMode,
      keywordOnly: options.knowledgeRecallDebugForm.value.keywordOnly,
      retrievalProfile,
      profile: { retrieval: retrievalProfile },
      retrievalProfileId: String((retrievalProfile as any).retrievalProfileId || ""),
      clientId: "server-console-debug-knowledge-recall",
      explain: options.knowledgeRecallDebugForm.value.explain,
      learningEnabled: options.knowledgeRecallDebugForm.value.learningEnabled,
    };
    if (target?.kind === "external") {
      payload.knowledgeBackend = true;
      payload.externalKnowledgeBase = true;
      payload.provider = target.provider || "";
      payload.spaceId = target.spaceId || "";
      payload.backendRef = target.spaceId || "";
    } else if (target?.kind === "source" && target.sourceId) {
      payload.sourceIds = [target.sourceId];
      payload.scopeSourceIds = [target.sourceId];
    }
    return payload;
  }

  const knowledgeRecallDebugGridStyle = computed<Record<string, string>>(() => ({
    "--debug-compare-columns": String(Math.max(1, options.knowledgeRecallDebugRuns.value.length || 1)),
  }));

  async function runKnowledgeRecallDebugBatch() {
    const query = options.knowledgeRecallDebugForm.value.query.trim();
    if (!query) {
      options.error.value = "请输入知识召回调试问题。";
      return;
    }
    if (!options.canReadKnowledge.value) {
      options.error.value = "当前账号没有知识库读取权限。";
      return;
    }
    const topK = currentKnowledgeRecallTopK();
    options.setBusy("debug:knowledge-recall");
    options.error.value = "";
    options.knowledgeRecallDebugRuns.value = [{
      runId: `knowledge-recall-${Date.now()}`,
      label: "召回结果",
      topK,
      status: "queued",
      elapsedMs: 0,
      startedAt: "",
      response: null,
      items: [],
      error: "",
    }];
    await Promise.all(
      options.knowledgeRecallDebugRuns.value.map(async (run) => {
        const started = performance.now();
        run.status = "running";
        run.startedAt = new Date().toISOString();
        try {
          const response = await bridge.searchKnowledge(buildKnowledgeRecallSearchPayload(query));
          run.response = response;
          run.items = normalizeSearchResults(response);
          run.status = "completed";
        } catch (nextError) {
          run.error = nextError instanceof Error ? nextError.message : "知识召回失败。";
          run.status = "failed";
        } finally {
          run.elapsedMs = Math.max(0, Math.round(performance.now() - started));
        }
      }),
    );
    options.lastKnowledgeSearchQuery.value = query;
    options.clearAllBusy();
  }

  return {
    buildKnowledgeRecallSearchPayload,
    currentKnowledgeLearningEnabled,
    currentKnowledgeRetrievalSettings,
    currentKnowledgeSearchLimit,
    knowledgeRecallDebugGridStyle,
    knowledgeRecallDebugModeOptionBarOptions,
    knowledgeRecallDebugTargetOptions,
    refreshKnowledgeRecallBackendSpaces,
    runKnowledgeRecallDebugBatch,
    searchKnowledge,
  };
}
