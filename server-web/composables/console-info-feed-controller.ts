import { computed, ref, type Ref } from "vue";
import { bridge } from "../lib/bridge";
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
import {
  agentExploreRunStatus,
  normalizeAgentExploreRun,
} from "./console-agent-explore-utils";
import { createConsoleInfoFeedHistoryController } from "./console-info-feed-history-controller";
import { createConsoleInfoFeedOutputController } from "./console-info-feed-output-controller";
import { asRecord } from "./console-model-utils";
import type {
  InfoFeedAttachment,
  InfoFeedClarification,
  InfoFeedClarificationOption,
  InfoFeedExpertFeedback,
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

  async function runInfoFeedKeywordTrack(sequence: number, runId: string, query: string) {
    const run = infoFeedCurrentRun.value;
    if (!run || run.runId !== runId) {
      return;
    }
    run.keyword.status = "running";
    run.keyword.progress = 0;
    run.keyword.stage = "提交原文检索请求";
    const cacheKey = infoFeedSearchCacheKey(query);
    const cached = infoFeedKeywordCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < 5 * 60 * 1000) {
      run.keyword.response = cached.response;
      run.keyword.fromCache = true;
      run.keyword.status = "completed";
      run.keyword.progress = 100;
      run.keyword.stage = "已使用缓存结果";
      return;
    }
    try {
      run.keyword.progress = 0;
      run.keyword.stage = "服务端正在扫描原始文件，完成后返回真实扫描数";
      const response = await withInfoFeedFetchRetry(run, "keyword", () =>
        bridge.searchKnowledge({
          query,
          limit: 12,
          retrievalMode: "raw-source-keyword",
          keywordOnly: true,
          rawSourceSearch: true,
          sourceSearch: true,
          returnAll: true,
          learningEnabled: false,
          explain: true,
        }),
      );
      if (sequence !== infoFeedRunSequence.value || infoFeedCurrentRun.value?.runId !== runId) {
        return;
      }
      run.keyword.response = response;
      run.keyword.fromCache = false;
      run.keyword.status = "completed";
      run.keyword.progress = 100;
      const explain = asRecord(response.explain) || {};
      run.keyword.stage = [
        explain.candidateFileCount ? `候选 ${Number(explain.candidateFileCount)}` : "",
        explain.scannedFiles ? `扫描 ${Number(explain.scannedFiles)}` : "",
        explain.matchedUniqueFiles ? `命中 ${Number(explain.matchedUniqueFiles)}` : "",
        explain.elapsedMs ? `${Number(explain.elapsedMs)}ms` : "",
      ].filter(Boolean).join(" · ") || "检索完成";
      infoFeedKeywordCache.set(cacheKey, {
        response,
        cachedAt: Date.now(),
      });
    } catch (nextError) {
      run.keyword.status = "failed";
      run.keyword.progress = 100;
      if (isInfoFeedRetryExhaustedError(nextError)) {
        run.pausedForRetry = "keyword";
      }
      run.keyword.error = nextError instanceof Error ? nextError.message : "原文检索失败。";
      run.keyword.stage = run.keyword.error;
    }
  }

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

  async function runInfoFeedAgentTrack(sequence: number, runId: string, query: string) {
    const run = infoFeedCurrentRun.value;
    if (!run || run.runId !== runId) {
      return;
    }
    run.pausedForModelSelection = "";
    run.agent.status = "running";
    run.agent.progress = 8;
    run.agent.error = "";
    const maxIterations = options.agentExploreConfiguredMaxIterations.value;
    try {
      let result = normalizeAgentExploreRun(await withInfoFeedFetchRetry(run, "agent", () =>
        bridge.runKnowledgeAgentExplore({
          query,
          modelAlias: selectedInfoFeedModel.value.value,
          contextProfileId: selectedInfoFeedContextProfile.value.value,
          thinkingMode: selectedThinkingMode.value,
          maxIterations,
          limit: options.agentExploreConfiguredLimit.value,
          recentTurns: infoFeedAgentRecentTurns(run),
          expertGuidance: infoFeedAgentExpertGuidance(run),
          async: true,
          realtime: true,
        }),
      ));
      if (sequence !== infoFeedRunSequence.value || infoFeedCurrentRun.value?.runId !== runId) {
        return;
      }
      run.agent.response = result;
      run.agent.runId = String(asRecord(result.run)?.runId || "");
      run.agent.workspaceId = String(result.workspace?.workspaceId || "");
      run.agent.progress = infoFeedAgentProgressFromResult(result, maxIterations);
      for (let pollIndex = 0; pollIndex < 240; pollIndex += 1) {
        const status = agentExploreRunStatus(result);
        if (!["queued", "running"].includes(status)) {
          break;
        }
        if (!run.agent.runId || !run.agent.workspaceId) {
          break;
        }
        await delayMs(800);
        result = normalizeAgentExploreRun(await withInfoFeedFetchRetry(run, "agent", () =>
          bridge.getKnowledgeAgentExploreRun(run.agent.runId, {
            workspaceId: run.agent.workspaceId,
          }),
        ));
        if (sequence !== infoFeedRunSequence.value || infoFeedCurrentRun.value?.runId !== runId) {
          return;
        }
        run.agent.response = result;
        run.agent.progress = infoFeedAgentProgressFromResult(result, maxIterations);
      }
      const finalStatus = agentExploreRunStatus(run.agent.response);
      run.agent.status = finalStatus === "failed" || run.agent.response?.ok === false ? "failed" : "completed";
      run.agent.progress = 100;
      if (run.agent.status === "failed") {
        run.agent.error = run.agent.response?.error || "智能检索失败。";
        if (isModelConfigurationError(run.agent.error)) {
          run.pausedForModelSelection = "agent";
        }
      }
    } catch (nextError) {
      run.agent.status = "failed";
      run.agent.progress = 100;
      if (isInfoFeedRetryExhaustedError(nextError)) {
        run.pausedForRetry = "agent";
      }
      run.agent.error = nextError instanceof Error ? nextError.message : "智能检索失败。";
      if (isModelConfigurationError(nextError)) {
        run.pausedForModelSelection = "agent";
      }
    }
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

  async function syncInfoFeedExpertFeedback(run: InfoFeedRunState, feedbackItem: InfoFeedExpertFeedback) {
    try {
      await bridge.recordKnowledgeFeedback({
        feedbackId: feedbackItem.feedbackId,
        clientId: "server-console-info-feed",
        query: feedbackItem.sourceQuery || run.query,
        action: "human_expert_clarification",
        itemId: run.runId,
        evidenceId: infoFeedRunEvidenceRefs(run)[0] || "",
        resultRank: 0,
        createdAt: feedbackItem.createdAt,
        context: {
          type: "info_feed_expert_feedback",
          gold: true,
          humanExpert: true,
          source: "clarification_option",
          runId: run.runId,
          questionId: feedbackItem.questionId,
          anchor: feedbackItem.anchor,
          prompt: feedbackItem.prompt,
          reason: feedbackItem.reason,
          selectedOption: {
            optionId: feedbackItem.selectedOptionId,
            label: feedbackItem.selectedLabel,
            description: feedbackItem.selectedDescription,
            followUpQuestion: feedbackItem.followUpQuestion,
          },
          evidenceRefs: infoFeedRunEvidenceRefs(run),
          modelAlias: run.summary.modelAlias,
          summaryStatus: run.summary.status,
          keywordCount: ((run.keyword.response?.items || run.keyword.response?.results || []) as KnowledgeSearchResult[]).length,
          agentRunId: run.agent.runId,
        },
      });
      feedbackItem.syncStatus = "synced";
      feedbackItem.syncedAt = new Date().toISOString();
      feedbackItem.syncError = "";
    } catch (nextError) {
      feedbackItem.syncStatus = "failed";
      feedbackItem.syncError = nextError instanceof Error ? nextError.message : "专家意见同步失败。";
    } finally {
      upsertInfoFeedHistory(run);
    }
  }

  async function runInfoFeedSummaryAgent(sequence = infoFeedRunSequence.value) {
    const run = infoFeedCurrentRun.value;
    if (!run || !infoFeedReadyForSummary.value) {
      return;
    }
    run.pausedForModelSelection = "";
    run.summary.status = "running";
    run.summary.progress = 15;
    run.summary.modelAlias = selectedInfoFeedModel.value.value;
    run.summary.contextProfileId = selectedInfoFeedContextProfile.value.value;
    const summaryTemperature = Number(infoFeedForm.value.temperature || 0.2);
    const summaryMaxTokens = Number(infoFeedForm.value.maxTokens || 1800);
    run.summary.temperature = summaryTemperature;
    run.summary.maxTokens = summaryMaxTokens;
    run.summary.answer = "";
    run.summary.error = "";
    run.summary.fallback = false;
    try {
      const response = await withInfoFeedFetchRetry(run, "summary", () =>
        bridge.callAgentGateway({
          modelAlias: selectedInfoFeedModel.value.value,
          alias: selectedInfoFeedModel.value.value,
          moduleId: "agentTools",
          taskId: run.runId,
          sessionId: run.agent?.workspaceId || run.runId,
          question: buildInfoFeedSummaryQuestion(run),
          systemPrompt:
            "你是 Pact 信息流智能体。你的任务是融合原文检索、智能规划和附件读取结果，输出可复核、带证据编号的最终回答。证据不足时必须说明不足。只有当缺少用户选择就无法继续执行时，才向用户提问；普通不确定性只写在报告里。",
          parameters: {
            ...agentExploreThinkingParameters(),
            temperature: summaryTemperature,
            max_tokens: summaryMaxTokens,
          },
        }),
      );
      if (sequence !== infoFeedRunSequence.value || infoFeedCurrentRun.value?.runId !== run.runId) {
        return;
      }
      const answer = String(response.answer || response.text || "").trim();
      applyInfoFeedSummaryAnswer(
        run,
        answer || fallbackInfoFeedSummary(run),
        !answer,
        answer ? "" : "总结智能体没有返回可用回答，已展示本地兜底摘要。",
      );
      run.summary.status = answer ? "completed" : "failed";
      run.summary.progress = 100;
    } catch (nextError) {
      if (sequence !== infoFeedRunSequence.value || infoFeedCurrentRun.value?.runId !== run.runId) {
        return;
      }
      if (isModelConfigurationError(nextError)) {
        run.summary.answer = "";
        run.summary.fallback = false;
        run.summary.status = "failed";
        run.summary.progress = 0;
        run.summary.error = nextError instanceof Error ? nextError.message : "总结智能体未配置。";
        run.pausedForModelSelection = "summary";
        return;
      }
      if (isInfoFeedRetryExhaustedError(nextError)) {
        run.summary.answer = "";
        run.summary.fallback = false;
        run.summary.status = "failed";
        run.summary.progress = 100;
        run.summary.error = nextError.message;
        run.pausedForRetry = "summary";
        return;
      }
      applyInfoFeedSummaryAnswer(
        run,
        fallbackInfoFeedSummary(run),
        true,
        nextError instanceof Error ? nextError.message : "总结智能体调用失败。",
      );
      run.summary.status = "failed";
      run.summary.progress = 100;
    } finally {
      if (infoFeedCurrentRun.value?.runId === run.runId) {
        run.completedAt = new Date().toISOString();
        if (run.summary.answer || run.summary.status === "failed") {
          upsertInfoFeedHistory(run);
        }
      }
    }
  }

  async function executeInfoFeedRunIteration(sequence: number, run: InfoFeedRunState) {
    const sourceSearchQuery = buildInfoFeedSourceSearchQuery(run);
    const agentQuery = buildInfoFeedAgentQuery(run);
    await Promise.allSettled([
      runInfoFeedKeywordTrack(sequence, run.runId, sourceSearchQuery),
      runInfoFeedAgentTrack(sequence, run.runId, agentQuery),
    ]);
    if (sequence !== infoFeedRunSequence.value || infoFeedCurrentRun.value?.runId !== run.runId) {
      return;
    }
    if (run.pausedForModelSelection || run.pausedForRetry) {
      upsertInfoFeedHistory(run);
      return;
    }
    await runInfoFeedSummaryAgent(sequence);
  }

  async function continueInfoFeedCurrentRun(question: string) {
    const run = infoFeedCurrentRun.value;
    if (!run) {
      return;
    }
    if (!options.canReadKnowledge.value) {
      options.error.value = "当前账号没有知识库读取权限。";
      return;
    }
    if (!selectedInfoFeedModel.value.enabled) {
      options.error.value = "请选择模型库中已配置且支持智能体调用的模型。";
      return;
    }
    options.error.value = "";
    infoFeedParentRunSnapshot.value = null;
    resetInfoFeedRunForContinuation(run, question);
    upsertInfoFeedHistory(run);
    const sequence = infoFeedRunSequence.value + 1;
    infoFeedRunSequence.value = sequence;
    await executeInfoFeedRunIteration(sequence, run);
  }

  async function runInfoFeed() {
    const query = infoFeedForm.value.query.trim();
    if (!query) {
      options.error.value = "请输入信息流问题。";
      return;
    }
    if (!options.canReadKnowledge.value) {
      options.error.value = "当前账号没有知识库读取权限。";
      return;
    }
    if (!selectedInfoFeedModel.value.enabled) {
      options.error.value = "请选择模型库中已配置且支持智能体调用的模型。";
      return;
    }
    if (infoFeedCanFollowUp.value && infoFeedCurrentRun.value) {
      infoFeedForm.value.query = "";
      await continueInfoFeedCurrentRun(query);
      return;
    }
    options.error.value = "";
    infoFeedParentRunSnapshot.value = null;
    const sequence = infoFeedRunSequence.value + 1;
    infoFeedRunSequence.value = sequence;
    const run = createInfoFeedRun(query);
    infoFeedCurrentRun.value = run;
    infoFeedForm.value.query = "";
    await executeInfoFeedRunIteration(sequence, run);
  }

  async function chooseInfoFeedClarification(option: InfoFeedClarificationOption) {
    const run = infoFeedCurrentRun.value;
    if (!run?.clarification || run.summary.status === "running") {
      return;
    }
    const clarification = run.clarification;
    const archived = archiveInfoFeedExpertFeedback(run, clarification, option);
    run.clarification = {
      ...clarification,
      status: "answered",
      selectedOptionId: option.optionId,
    };
    upsertInfoFeedHistory(run);
    await syncInfoFeedExpertFeedback(run, archived);
    await continueInfoFeedCurrentRun(option.followUpQuestion);
  }

  async function continueInfoFeedAfterModelSelection() {
    const run = infoFeedCurrentRun.value;
    if (!run?.pausedForModelSelection) {
      return;
    }
    if (!selectedInfoFeedModel.value.enabled) {
      options.error.value = "请选择一个已配置且可用的模型。";
      return;
    }
    options.error.value = "";
    const pausedStage = run.pausedForModelSelection;
    const sequence = infoFeedRunSequence.value + 1;
    infoFeedRunSequence.value = sequence;
    run.pausedForModelSelection = "";
    run.summary.modelAlias = selectedInfoFeedModel.value.value;
    run.summary.contextProfileId = selectedInfoFeedContextProfile.value.value;
    if (pausedStage === "agent") {
      run.agent = {
        status: "idle",
        progress: 0,
        runId: "",
        workspaceId: "",
        response: null,
        error: "",
      };
      await runInfoFeedAgentTrack(sequence, run.runId, buildInfoFeedAgentQuery(run));
      if (sequence !== infoFeedRunSequence.value || infoFeedCurrentRun.value?.runId !== run.runId || run.pausedForModelSelection) {
        upsertInfoFeedHistory(run);
        return;
      }
    }
    if (infoFeedReadyForSummary.value) {
      await runInfoFeedSummaryAgent(sequence);
    }
  }

  async function continueInfoFeedAfterRetry() {
    const run = infoFeedCurrentRun.value;
    if (!run?.pausedForRetry) {
      return;
    }
    const pausedStage = run.pausedForRetry;
    const sequence = infoFeedRunSequence.value + 1;
    infoFeedRunSequence.value = sequence;
    clearInfoFeedRetryState(run, pausedStage);
    options.error.value = "";

    if (pausedStage === "keyword") {
      run.keyword = {
        status: "idle",
        progress: 0,
        stage: "",
        fromCache: false,
        response: null,
        error: "",
      };
      await runInfoFeedKeywordTrack(sequence, run.runId, buildInfoFeedSourceSearchQuery(run));
      if (sequence !== infoFeedRunSequence.value || infoFeedCurrentRun.value?.runId !== run.runId || run.pausedForRetry) {
        upsertInfoFeedHistory(run);
        return;
      }
    }

    if (pausedStage === "agent") {
      run.agent = {
        status: "idle",
        progress: 0,
        runId: "",
        workspaceId: "",
        response: null,
        error: "",
      };
      await runInfoFeedAgentTrack(sequence, run.runId, buildInfoFeedAgentQuery(run));
      if (sequence !== infoFeedRunSequence.value || infoFeedCurrentRun.value?.runId !== run.runId || run.pausedForRetry) {
        upsertInfoFeedHistory(run);
        return;
      }
    }

    if (pausedStage === "summary") {
      run.summary.answer = "";
      run.summary.error = "";
      run.summary.fallback = false;
    }

    if (infoFeedReadyForSummary.value && !run.pausedForModelSelection && !run.pausedForRetry) {
      await runInfoFeedSummaryAgent(sequence);
    }
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
