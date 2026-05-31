import { computed, ref, type Ref } from "vue";
import type {
  AgentExploreRunResponse,
  AgentSelectorOption,
  AgentSettings,
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
} from "../lib/types";
import {
  applyInfoFeedSummaryAnswerCore,
  archiveInfoFeedExpertFeedbackCore,
  buildFallbackInfoFeedClarificationCore,
  buildInfoFeedAgentQueryCore,
  buildInfoFeedSourceContextCore,
  buildInfoFeedSourceSearchQueryCore,
  buildInfoFeedSourceSummaryCore,
  buildInfoFeedSummaryQuestionCore,
  compactInfoFeedAttachment,
  createInfoFeedFollowUpContext,
  createInitialInfoFeedAgentState,
  createInitialInfoFeedKeywordState,
  createInitialInfoFeedSummaryState,
  estimateInfoFeedContextTokens as estimateInfoFeedContextTokensCore,
  extractInfoFeedClarificationCore,
  fallbackInfoFeedSummaryCore,
  formatFileSize,
  INFO_FEED_CONTEXT_CHARS_PER_TOKEN,
  infoFeedAgentExpertGuidanceCore,
  infoFeedAgentRecentTurnsCore,
  infoFeedRunEvidenceRefsCore,
  infoFeedSourceContextBudgetChars as infoFeedSourceContextBudgetCharsCore,
  infoFeedSourceResultLine as infoFeedSourceResultLineCore,
  infoFeedStatusLabel,
  infoFeedStatusTone,
  isLowRelevanceSourceResult as isLowRelevanceSourceResultCore,
  isReadableInfoFeedAttachment,
  makeInfoFeedId,
  normalizeInfoFeedClarificationOptionCore,
  truncateInfoFeedText,
  type InfoFeedSummaryDefaults,
} from "./console-info-feed-utils";
import {
  clearInfoFeedRetryState,
  delayMs,
  INFO_FEED_FETCH_RETRY_LIMIT,
  infoFeedAgentProgressFromResultCore,
  infoFeedRetryMessageForRun,
  infoFeedRetryStageLabel,
  infoFeedSearchCacheKey,
  isInfoFeedRetryExhaustedError,
  isModelConfigurationError,
  isTransientFetchError,
  setInfoFeedRetryState,
  withInfoFeedFetchRetry,
} from "./console-info-feed-run-utils";
import { createConsoleInfoFeedExecutionController } from "./console-info-feed-execution-controller";
import { createConsoleInfoFeedHistoryController } from "./console-info-feed-history-controller";
import { createConsoleInfoFeedOutputController } from "./console-info-feed-output-controller";
import { asRecord } from "./console-model-utils";
import type {
  InfoFeedAttachment,
  InfoFeedClarification,
  InfoFeedClarificationOption,
  InfoFeedRunState,
} from "../types/app";

type ReadonlyRef<T> = {
  readonly value: T;
};

type InfoFeedAgentOption = AgentSelectorOption & {
  enabled: boolean;
  disabledReason: string;
};

type ContextWindowOption = {
  value: string;
  label: string;
  description?: string;
};

type ContextProfileBudgetRow = {
  profileId: string;
  contextWindowTokens: number;
  knowledgeBudget: number;
};

type AgentExploreFormLike = {
  thinkingMode: string;
};

export type ConsoleInfoFeedControllerOptions = {
  agentExploreConfiguredLimit: ReadonlyRef<number>;
  agentExploreConfiguredMaxIterations: ReadonlyRef<number>;
  agentExploreContextWindowOptions: ContextWindowOption[];
  agentExploreForm: Ref<AgentExploreFormLike>;
  agentExploreThinkingModeOptions: Array<{ value: string }>;
  agentSelectorOptions: ReadonlyRef<InfoFeedAgentOption[]>;
  canReadKnowledge: ReadonlyRef<boolean>;
  contextProfileRows: ReadonlyRef<ContextProfileBudgetRow[]>;
  error: Ref<string>;
  recordFeedback: (action: string, context?: Record<string, unknown>) => void;
  settingsDraft: Ref<AgentSettings>;
};

export const INFO_FEED_STORAGE_KEY = "pact.infoFeed.history.v1";

function inactiveInfoFeedAgentOption(value?: string): InfoFeedAgentOption {
  const selectedValue = String(value || "").trim();
  return {
    value: selectedValue,
    agentUid: selectedValue,
    label: selectedValue ? "已移除的智能体" : "未选择智能体",
    provider: "",
    model: "",
    moduleIds: [],
    capabilities: [],
    status: "unconfigured",
    enabled: false,
    selectable: false,
    disabledReason: selectedValue ? "已从智能体列表删除" : "未分配",
    reason: selectedValue ? "已从智能体列表删除" : "未分配",
  };
}

function selectedInfoFeedAgentFromOptions(options: InfoFeedAgentOption[], value?: string): InfoFeedAgentOption {
  const selectedValue = String(value || "").trim();
  if (!selectedValue) {
    return inactiveInfoFeedAgentOption("");
  }
  return options.find((item) => item.value === selectedValue) || inactiveInfoFeedAgentOption(selectedValue);
}

export function createConsoleInfoFeedController(options: ConsoleInfoFeedControllerOptions) {
  const infoFeedForm = ref({
    query: "",
    modelAlias: "",
    contextProfileId: "context-32k",
    temperature: 0.2,
    maxTokens: 1800,
  });
  const infoFeedCurrentRun = ref<InfoFeedRunState | null>(null);
  const infoFeedParentRunSnapshot = ref<InfoFeedRunState | null>(null);
  const infoFeedHistory = ref<InfoFeedRunState[]>([]);
  const infoFeedAttachments = ref<InfoFeedAttachment[]>([]);
  const infoFeedSummaryStreamText = ref("");
  const infoFeedRunSequence = ref(0);
  const infoFeedSummaryStreamTimer = ref<number | null>(null);
  const infoFeedKeywordCache = new Map<string, { response: KnowledgeSearchResponse; cachedAt: number }>();

  const infoFeedModelOptions = computed(() => options.agentSelectorOptions.value);
  const selectedInfoFeedModel = computed(() =>
    selectedInfoFeedAgentFromOptions(infoFeedModelOptions.value, infoFeedForm.value.modelAlias),
  );
  const selectedInfoFeedContextProfile = computed(() => {
    const configured = String(
      infoFeedForm.value.contextProfileId ||
        options.settingsDraft.value.agentExploreDefaults?.contextProfileId ||
        "context-32k",
    ).trim();
    const selected = options.agentExploreContextWindowOptions.find(
      (item) => item.value === configured,
    );
    return selected || options.agentExploreContextWindowOptions[0];
  });

  function normalizedThinkingMode(value?: string) {
    const mode = String(value || "default").trim();
    return options.agentExploreThinkingModeOptions.some((item) => item.value === mode) ? mode : "default";
  }

  const selectedThinkingMode = computed(() =>
    normalizedThinkingMode(
      options.agentExploreForm.value.thinkingMode ||
        options.settingsDraft.value.agentExploreDefaults?.thinkingMode,
    ),
  );

  function agentExploreThinkingParameters() {
    const mode = selectedThinkingMode.value;
    if (mode === "enabled") {
      return {
        pact_thinking_mode: "enabled",
      };
    }
    if (mode === "disabled") {
      return {
        pact_thinking_mode: "disabled",
      };
    }
    return {};
  }

  function hasAgentModelOption(value?: string) {
    const normalized = String(value || "").trim();
    return Boolean(normalized && infoFeedModelOptions.value.some((item) => item.value === normalized));
  }

  function validAgentModelAlias(value?: string) {
    const normalized = String(value || "").trim();
    return hasAgentModelOption(normalized) ? normalized : "";
  }

  function infoFeedSummaryDefaults(): InfoFeedSummaryDefaults {
    return {
      modelAlias: selectedInfoFeedModel.value.value,
      contextProfileId: selectedInfoFeedContextProfile.value.value,
      temperature: Number(infoFeedForm.value.temperature || 0.2),
      maxTokens: Number(infoFeedForm.value.maxTokens || 1800),
    };
  }

  const {
    appendInfoFeedTurnSnapshot,
    clearInvalidInfoFeedModelReferences,
    compactInfoFeedRunForStorage,
    createInfoFeedRun,
    deleteInfoFeedHistory,
    deleteInfoFeedHistoryItem,
    handleInfoFeedAttachmentFiles,
    infoFeedHistoryPanelItems,
    infoFeedRestorableModelAlias,
    initialInfoFeedAgentState,
    initialInfoFeedKeywordState,
    initialInfoFeedSummaryState,
    normalizeInfoFeedHistory,
    openInfoFeedHistoryRun,
    persistInfoFeedHistory,
    readInfoFeedAttachment,
    removeInfoFeedAttachment,
    resetInfoFeedRunForContinuation,
    restoreInfoFeedHistory,
    sanitizeInfoFeedRunModelReferences,
    selectInfoFeedHistoryItem,
    snapshotInfoFeedAttachments,
    snapshotInfoFeedTurn,
    upsertInfoFeedHistory,
  } = createConsoleInfoFeedHistoryController({
    evidenceRefs: infoFeedRunEvidenceRefs,
    hasAgentModelOption,
    infoFeedAttachments,
    infoFeedCurrentRun,
    infoFeedForm,
    infoFeedHistory,
    infoFeedParentRunSnapshot,
    storageKey: INFO_FEED_STORAGE_KEY,
    summaryDefaults: infoFeedSummaryDefaults,
    validAgentModelAlias,
  });

  function infoFeedModelDisplayLabel(value?: string) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return "未记录";
    }
    return infoFeedModelOptions.value.find((item) => item.value === normalized)?.label || "已移除的智能体";
  }

  const infoFeedKeywordItems = computed(() => {
    const response = infoFeedCurrentRun.value?.keyword.response;
    return ((response?.items || response?.results || []) as KnowledgeSearchResult[]).filter(
      (item) => !isLowRelevanceSourceResult(item),
    );
  });
  const infoFeedLowRelevanceKeywordItems = computed(() => {
    const response = infoFeedCurrentRun.value?.keyword.response;
    return ((response?.items || response?.results || []) as KnowledgeSearchResult[]).filter(isLowRelevanceSourceResult);
  });
  const infoFeedAllKeywordItems = computed(() => {
    const response = infoFeedCurrentRun.value?.keyword.response;
    return ((response?.items || response?.results || []) as KnowledgeSearchResult[]);
  });
  const infoFeedContextGateNotice = computed(() => buildInfoFeedSourceContext(infoFeedCurrentRun.value).report);
  const infoFeedKeywordScanExplain = computed(() => {
    const explain = asRecord(infoFeedCurrentRun.value?.keyword.response?.explain) || {};
    return {
      scannedFiles: Number(explain.scannedFiles || 0),
      candidateFileCount: Number(explain.candidateFileCount || 0),
      matchedUniqueFiles: Number(explain.matchedUniqueFiles || 0),
      returned: Number(explain.returned || 0),
      highRelevanceCount: Number(explain.highRelevanceCount || 0),
      lowRelevanceCount: Number(explain.lowRelevanceCount || 0),
      elapsedMs: Number(explain.elapsedMs || 0),
      candidateElapsedMs: Number(explain.candidateElapsedMs || 0),
      inspectElapsedMs: Number(explain.inspectElapsedMs || 0),
      candidateSearch: String(explain.candidateSearch || ""),
    };
  });
  const infoFeedKeywordProgressLabel = computed(() => {
    const run = infoFeedCurrentRun.value;
    if (!run) {
      return "";
    }
    if (run.keyword.status === "running") {
      return run.keyword.stage || "服务端检索中，等待扫描结果返回";
    }
    if (run.keyword.status === "completed") {
      const scan = infoFeedKeywordScanExplain.value;
      if (scan.scannedFiles || scan.candidateFileCount || scan.elapsedMs) {
        return [
          scan.candidateFileCount ? `候选 ${scan.candidateFileCount}` : "",
          scan.scannedFiles ? `扫描 ${scan.scannedFiles}` : "",
          scan.matchedUniqueFiles ? `命中 ${scan.matchedUniqueFiles}` : "",
          scan.elapsedMs ? `${scan.elapsedMs}ms` : "",
        ].filter(Boolean).join(" · ");
      }
      return run.keyword.fromCache ? "已使用缓存结果" : "检索完成";
    }
    return run.keyword.error || "";
  });
  const infoFeedAgentSteps = computed(() => infoFeedCurrentRun.value?.agent.response?.steps || []);
  const infoFeedAgentAnswer = computed(() => String(infoFeedCurrentRun.value?.agent.response?.answer || "").trim());
  const infoFeedCanFollowUp = computed(() => {
    const run = infoFeedCurrentRun.value;
    return Boolean(run?.summary.answer?.trim() && run.summary.status !== "running");
  });
  const infoFeedInputPlaceholder = computed(() =>
    infoFeedCanFollowUp.value
      ? "继续追问当前信息流结果。"
      : "输入问题，信息流会并行对比原文检索和智能规划。",
  );
  const infoFeedSubmitLabel = computed(() => (infoFeedCanFollowUp.value ? "追问" : "开始信息流"));
  const infoFeedClarification = computed(() => {
    const clarification = infoFeedCurrentRun.value?.clarification;
    return clarification?.status === "open" ? clarification : null;
  });
  const infoFeedParentRunForCurrent = computed(() => {
    const current = infoFeedCurrentRun.value;
    const parent = infoFeedParentRunSnapshot.value;
    return current?.followUp?.parentRunId && parent?.runId === current.followUp.parentRunId ? parent : null;
  });
  const {
    clearInfoFeedSummaryStreamTimer,
    copyInfoFeedSummary,
    exportInfoFeedSummary,
    infoFeedCurrentUserQuestion,
    infoFeedExpertFeedbackFor,
    infoFeedExpertFeedbackForRun,
    infoFeedParentSummaryEvidenceRefs,
    infoFeedParentSummaryHtml,
    infoFeedStreamingSummaryHtml,
    infoFeedSummaryEvidenceRefs,
    infoFeedSummaryIsStreaming,
    infoFeedSummaryMarkdown,
    infoFeedSummaryRuntime,
    infoFeedTurnAttachments,
    infoFeedTurnQuestion,
    infoFeedTurnSummaryHtml,
    infoFeedTurnTitle,
    infoFeedUserCardTitle,
    infoFeedVisibleSummaryText,
    streamInfoFeedSummary,
  } = createConsoleInfoFeedOutputController({
    error: options.error,
    infoFeedAgentAnswer,
    infoFeedCurrentRun,
    infoFeedForm,
    infoFeedKeywordItems,
    infoFeedParentRunForCurrent,
    infoFeedRunEvidenceRefs,
    infoFeedSummaryStreamText,
    infoFeedSummaryStreamTimer,
    modelDisplayLabel: infoFeedModelDisplayLabel,
    recordFeedback: options.recordFeedback,
    selectedInfoFeedModel,
  });
  const infoFeedReadyForSummary = computed(() => {
    const run = infoFeedCurrentRun.value;
    if (!run) {
      return false;
    }
    if (run.pausedForModelSelection) {
      return false;
    }
    if (run.pausedForRetry) {
      return false;
    }
    return ["completed", "failed"].includes(run.keyword.status) &&
      ["completed", "failed"].includes(run.agent.status);
  });
  const infoFeedNeedsModelSelection = computed(() => Boolean(infoFeedCurrentRun.value?.pausedForModelSelection));
  const infoFeedModelSelectionMessage = computed(() => {
    const run = infoFeedCurrentRun.value;
    if (!run?.pausedForModelSelection) {
      return "";
    }
    const stageLabel = run.pausedForModelSelection === "summary" ? "总结智能体" : "智能规划";
    const stageError = run.pausedForModelSelection === "summary" ? run.summary.error : run.agent.error;
    return `${stageLabel}的智能体没有可用 URL 或配置不完整。请选择一个可用智能体后继续。${stageError ? `（${stageError}）` : ""}`;
  });
  const infoFeedNeedsRetryContinue = computed(() => Boolean(infoFeedCurrentRun.value?.pausedForRetry));
  const infoFeedRetryMessage = computed(() => infoFeedRetryMessageForRun(infoFeedCurrentRun.value));

  const {
    chooseInfoFeedClarification,
    continueInfoFeedAfterModelSelection,
    continueInfoFeedAfterRetry,
    continueInfoFeedCurrentRun,
    executeInfoFeedRunIteration,
    runInfoFeed,
    runInfoFeedAgentTrack,
    runInfoFeedKeywordTrack,
    runInfoFeedSummaryAgent,
    syncInfoFeedExpertFeedback,
  } = createConsoleInfoFeedExecutionController({
    agentExploreConfiguredLimit: options.agentExploreConfiguredLimit,
    agentExploreConfiguredMaxIterations: options.agentExploreConfiguredMaxIterations,
    agentExploreThinkingParameters,
    applyInfoFeedSummaryAnswer,
    archiveInfoFeedExpertFeedback,
    buildInfoFeedAgentQuery,
    buildInfoFeedSourceSearchQuery,
    buildInfoFeedSummaryQuestion,
    canReadKnowledge: options.canReadKnowledge,
    createInfoFeedRun,
    error: options.error,
    fallbackInfoFeedSummary,
    infoFeedAgentExpertGuidance,
    infoFeedAgentProgressFromResult,
    infoFeedAgentRecentTurns,
    infoFeedCanFollowUp,
    infoFeedCurrentRun,
    infoFeedForm,
    infoFeedKeywordCache,
    infoFeedParentRunSnapshot,
    infoFeedReadyForSummary,
    infoFeedRunEvidenceRefs,
    infoFeedRunSequence,
    resetInfoFeedRunForContinuation,
    selectedInfoFeedContextProfile,
    selectedInfoFeedModel,
    selectedThinkingMode,
    upsertInfoFeedHistory,
  });

  function infoFeedAgentProgressFromResult(result: AgentExploreRunResponse | null, maxIterations: number) {
    return infoFeedAgentProgressFromResultCore(result, maxIterations);
  }

  function isLowRelevanceSourceResult(item: KnowledgeSearchResult) {
    return isLowRelevanceSourceResultCore(item);
  }

  function infoFeedSourceResultLine(item: KnowledgeSearchResult, index: number) {
    return infoFeedSourceResultLineCore(item, index);
  }

  function estimateInfoFeedContextTokens(chars: number) {
    return estimateInfoFeedContextTokensCore(chars);
  }

  function infoFeedFallbackContextProfileId() {
    return String(
      selectedInfoFeedContextProfile.value.value ||
        infoFeedForm.value.contextProfileId ||
        "context-128k",
    );
  }

  function infoFeedSourceContextBudgetChars(run: InfoFeedRunState | null | undefined) {
    return infoFeedSourceContextBudgetCharsCore(run, {
      profiles: options.contextProfileRows.value,
      fallbackProfileId: infoFeedFallbackContextProfileId(),
    });
  }

  function buildInfoFeedSourceContext(run: InfoFeedRunState | null | undefined) {
    return buildInfoFeedSourceContextCore(run, {
      profiles: options.contextProfileRows.value,
      fallbackProfileId: infoFeedFallbackContextProfileId(),
    });
  }

  function buildInfoFeedSourceSearchQuery(run: InfoFeedRunState) {
    return buildInfoFeedSourceSearchQueryCore(run);
  }

  function buildInfoFeedAgentQuery(run: InfoFeedRunState) {
    return buildInfoFeedAgentQueryCore(run);
  }

  function infoFeedAgentRecentTurns(run: InfoFeedRunState) {
    return infoFeedAgentRecentTurnsCore(run);
  }

  function infoFeedAgentExpertGuidance(run: InfoFeedRunState) {
    return infoFeedAgentExpertGuidanceCore(run);
  }

  function infoFeedSourceSummary(run: InfoFeedRunState) {
    return buildInfoFeedSourceSummaryCore(run, buildInfoFeedSourceContext(run));
  }

  function buildInfoFeedSummaryQuestion(run: InfoFeedRunState) {
    return buildInfoFeedSummaryQuestionCore(run, infoFeedSourceSummary(run));
  }

  function fallbackInfoFeedSummary(run: InfoFeedRunState) {
    return fallbackInfoFeedSummaryCore(run);
  }

  function normalizeInfoFeedClarificationOption(value: unknown, index: number): InfoFeedClarificationOption | null {
    return normalizeInfoFeedClarificationOptionCore(value, index);
  }

  function extractInfoFeedClarification(answer: string): { answer: string; clarification?: InfoFeedClarification } {
    return extractInfoFeedClarificationCore(answer);
  }

  function buildFallbackInfoFeedClarification(run: InfoFeedRunState): InfoFeedClarification | undefined {
    return buildFallbackInfoFeedClarificationCore(run);
  }

  function applyInfoFeedSummaryAnswer(run: InfoFeedRunState, answer: string, fallback: boolean, error = "") {
    applyInfoFeedSummaryAnswerCore(run, answer, fallback, error);
  }

  function infoFeedRunEvidenceRefs(run: InfoFeedRunState) {
    return infoFeedRunEvidenceRefsCore(run);
  }

  function archiveInfoFeedExpertFeedback(
    run: InfoFeedRunState,
    clarification: InfoFeedClarification,
    option: InfoFeedClarificationOption,
  ) {
    return archiveInfoFeedExpertFeedbackCore(run, clarification, option);
  }

  function clearInfoFeedKeywordCache() {
    infoFeedKeywordCache.clear();
  }

  return {
    INFO_FEED_CONTEXT_CHARS_PER_TOKEN,
    INFO_FEED_FETCH_RETRY_LIMIT,
    INFO_FEED_STORAGE_KEY,
    appendInfoFeedTurnSnapshot,
    applyInfoFeedSummaryAnswer,
    archiveInfoFeedExpertFeedback,
    buildFallbackInfoFeedClarification,
    buildInfoFeedAgentQuery,
    buildInfoFeedSourceContext,
    buildInfoFeedSourceSearchQuery,
    buildInfoFeedSummaryQuestion,
    chooseInfoFeedClarification,
    clearInfoFeedKeywordCache,
    clearInfoFeedRetryState,
    clearInfoFeedSummaryStreamTimer,
    clearInvalidInfoFeedModelReferences,
    compactInfoFeedAttachment,
    compactInfoFeedRunForStorage,
    continueInfoFeedAfterModelSelection,
    continueInfoFeedAfterRetry,
    continueInfoFeedCurrentRun,
    copyInfoFeedSummary,
    createInfoFeedFollowUpContext,
    createInfoFeedRun,
    createInitialInfoFeedAgentState,
    createInitialInfoFeedKeywordState,
    createInitialInfoFeedSummaryState,
    deleteInfoFeedHistory,
    deleteInfoFeedHistoryItem,
    delayMs,
    estimateInfoFeedContextTokens,
    executeInfoFeedRunIteration,
    exportInfoFeedSummary,
    extractInfoFeedClarification,
    fallbackInfoFeedSummary,
    formatFileSize,
    handleInfoFeedAttachmentFiles,
    infoFeedAgentAnswer,
    infoFeedAgentExpertGuidance,
    infoFeedAgentProgressFromResult,
    infoFeedAgentRecentTurns,
    infoFeedAgentSteps,
    infoFeedAllKeywordItems,
    infoFeedAttachments,
    infoFeedCanFollowUp,
    infoFeedClarification,
    infoFeedContextGateNotice,
    infoFeedCurrentRun,
    infoFeedCurrentUserQuestion,
    infoFeedExpertFeedbackFor,
    infoFeedExpertFeedbackForRun,
    infoFeedForm,
    infoFeedHistory,
    infoFeedHistoryPanelItems,
    infoFeedInputPlaceholder,
    infoFeedKeywordCache,
    infoFeedKeywordItems,
    infoFeedKeywordProgressLabel,
    infoFeedKeywordScanExplain,
    infoFeedLowRelevanceKeywordItems,
    infoFeedModelDisplayLabel,
    infoFeedModelOptions,
    infoFeedModelSelectionMessage,
    infoFeedNeedsModelSelection,
    infoFeedNeedsRetryContinue,
    infoFeedParentRunForCurrent,
    infoFeedParentRunSnapshot,
    infoFeedParentSummaryEvidenceRefs,
    infoFeedParentSummaryHtml,
    infoFeedReadyForSummary,
    infoFeedRestorableModelAlias,
    infoFeedRetryMessage,
    infoFeedRetryStageLabel,
    infoFeedRunEvidenceRefs,
    infoFeedRunSequence,
    infoFeedSearchCacheKey,
    infoFeedSourceContextBudgetChars,
    infoFeedSourceResultLine,
    infoFeedSourceSummary,
    infoFeedStatusLabel,
    infoFeedStatusTone,
    infoFeedStreamingSummaryHtml,
    infoFeedSubmitLabel,
    infoFeedSummaryEvidenceRefs,
    infoFeedSummaryIsStreaming,
    infoFeedSummaryMarkdown,
    infoFeedSummaryRuntime,
    infoFeedSummaryStreamText,
    infoFeedSummaryStreamTimer,
    infoFeedTurnAttachments,
    infoFeedTurnQuestion,
    infoFeedTurnSummaryHtml,
    infoFeedTurnTitle,
    infoFeedUserCardTitle,
    infoFeedVisibleSummaryText,
    initialInfoFeedAgentState,
    initialInfoFeedKeywordState,
    initialInfoFeedSummaryState,
    isInfoFeedRetryExhaustedError,
    isLowRelevanceSourceResult,
    isModelConfigurationError,
    isReadableInfoFeedAttachment,
    isTransientFetchError,
    makeInfoFeedId,
    normalizeInfoFeedClarificationOption,
    normalizeInfoFeedHistory,
    openInfoFeedHistoryRun,
    persistInfoFeedHistory,
    readInfoFeedAttachment,
    removeInfoFeedAttachment,
    resetInfoFeedRunForContinuation,
    restoreInfoFeedHistory,
    runInfoFeed,
    runInfoFeedAgentTrack,
    runInfoFeedKeywordTrack,
    runInfoFeedSummaryAgent,
    sanitizeInfoFeedRunModelReferences,
    selectedInfoFeedContextProfile,
    selectedInfoFeedModel,
    selectInfoFeedHistoryItem,
    setInfoFeedRetryState,
    snapshotInfoFeedAttachments,
    snapshotInfoFeedTurn,
    streamInfoFeedSummary,
    syncInfoFeedExpertFeedback,
    truncateInfoFeedText,
    upsertInfoFeedHistory,
    withInfoFeedFetchRetry,
  };
}
