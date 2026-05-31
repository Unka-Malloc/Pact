import { bridge } from "../lib/bridge";
import type {
  AgentExploreRunResponse,
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
} from "../lib/types";
import type {
  InfoFeedClarification,
  InfoFeedClarificationOption,
  InfoFeedExpertFeedback,
  InfoFeedRunState,
} from "../types/app";
import {
  clearInfoFeedRetryState,
  delayMs,
  infoFeedSearchCacheKey,
  isInfoFeedRetryExhaustedError,
  isModelConfigurationError,
  withInfoFeedFetchRetry,
} from "./console-info-feed-run-utils";
import {
  agentExploreRunStatus,
  normalizeAgentExploreRun,
} from "./console-agent-explore-utils";
import { asRecord } from "./console-model-utils";
import type { Ref } from "vue";

type ReadonlyRef<T> = {
  readonly value: T;
};

type InfoFeedFormState = {
  query: string;
  modelAlias: string;
  contextProfileId: string;
  temperature: number;
  maxTokens: number;
};

type InfoFeedExecutionModelOption = {
  value: string;
  enabled: boolean;
};

type InfoFeedExecutionContextProfile = {
  value: string;
};

type InfoFeedKeywordCache = Map<string, { response: KnowledgeSearchResponse; cachedAt: number }>;

export type ConsoleInfoFeedExecutionControllerOptions = {
  agentExploreConfiguredLimit: ReadonlyRef<number>;
  agentExploreConfiguredMaxIterations: ReadonlyRef<number>;
  agentExploreThinkingParameters: () => Record<string, unknown>;
  applyInfoFeedSummaryAnswer: (
    run: InfoFeedRunState,
    answer: string,
    fallback: boolean,
    error?: string,
  ) => void;
  archiveInfoFeedExpertFeedback: (
    run: InfoFeedRunState,
    clarification: InfoFeedClarification,
    option: InfoFeedClarificationOption,
  ) => InfoFeedExpertFeedback;
  buildInfoFeedAgentQuery: (run: InfoFeedRunState) => string;
  buildInfoFeedSourceSearchQuery: (run: InfoFeedRunState) => string;
  buildInfoFeedSummaryQuestion: (run: InfoFeedRunState) => string;
  canReadKnowledge: ReadonlyRef<boolean>;
  createInfoFeedRun: (query: string) => InfoFeedRunState;
  error: Ref<string>;
  fallbackInfoFeedSummary: (run: InfoFeedRunState) => string;
  infoFeedAgentExpertGuidance: (run: InfoFeedRunState) => unknown;
  infoFeedAgentProgressFromResult: (result: AgentExploreRunResponse | null, maxIterations: number) => number;
  infoFeedAgentRecentTurns: (run: InfoFeedRunState) => unknown;
  infoFeedCanFollowUp: ReadonlyRef<boolean>;
  infoFeedCurrentRun: Ref<InfoFeedRunState | null>;
  infoFeedForm: Ref<InfoFeedFormState>;
  infoFeedKeywordCache: InfoFeedKeywordCache;
  infoFeedParentRunSnapshot: Ref<InfoFeedRunState | null>;
  infoFeedReadyForSummary: ReadonlyRef<boolean>;
  infoFeedRunEvidenceRefs: (run: InfoFeedRunState) => string[];
  infoFeedRunSequence: Ref<number>;
  resetInfoFeedRunForContinuation: (run: InfoFeedRunState, question: string) => void;
  selectedInfoFeedContextProfile: ReadonlyRef<InfoFeedExecutionContextProfile>;
  selectedInfoFeedModel: ReadonlyRef<InfoFeedExecutionModelOption>;
  selectedThinkingMode: ReadonlyRef<string>;
  upsertInfoFeedHistory: (run: InfoFeedRunState | null) => void;
};

export function createConsoleInfoFeedExecutionController(
  options: ConsoleInfoFeedExecutionControllerOptions,
) {
  async function runInfoFeedKeywordTrack(sequence: number, runId: string, query: string) {
    const run = options.infoFeedCurrentRun.value;
    if (!run || run.runId !== runId) {
      return;
    }
    run.keyword.status = "running";
    run.keyword.progress = 0;
    run.keyword.stage = "提交原文检索请求";
    const cacheKey = infoFeedSearchCacheKey(query);
    const cached = options.infoFeedKeywordCache.get(cacheKey);
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
      if (
        sequence !== options.infoFeedRunSequence.value ||
        options.infoFeedCurrentRun.value?.runId !== runId
      ) {
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
      options.infoFeedKeywordCache.set(cacheKey, {
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

  async function runInfoFeedAgentTrack(sequence: number, runId: string, query: string) {
    const run = options.infoFeedCurrentRun.value;
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
          modelAlias: options.selectedInfoFeedModel.value.value,
          contextProfileId: options.selectedInfoFeedContextProfile.value.value,
          thinkingMode: options.selectedThinkingMode.value,
          maxIterations,
          limit: options.agentExploreConfiguredLimit.value,
          recentTurns: options.infoFeedAgentRecentTurns(run),
          expertGuidance: options.infoFeedAgentExpertGuidance(run),
          async: true,
          realtime: true,
        }),
      ));
      if (
        sequence !== options.infoFeedRunSequence.value ||
        options.infoFeedCurrentRun.value?.runId !== runId
      ) {
        return;
      }
      run.agent.response = result;
      run.agent.runId = String(asRecord(result.run)?.runId || "");
      run.agent.workspaceId = String(result.workspace?.workspaceId || "");
      run.agent.progress = options.infoFeedAgentProgressFromResult(result, maxIterations);
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
        if (
          sequence !== options.infoFeedRunSequence.value ||
          options.infoFeedCurrentRun.value?.runId !== runId
        ) {
          return;
        }
        run.agent.response = result;
        run.agent.progress = options.infoFeedAgentProgressFromResult(result, maxIterations);
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

  async function syncInfoFeedExpertFeedback(run: InfoFeedRunState, feedbackItem: InfoFeedExpertFeedback) {
    try {
      await bridge.recordKnowledgeFeedback({
        feedbackId: feedbackItem.feedbackId,
        clientId: "server-console-info-feed",
        query: feedbackItem.sourceQuery || run.query,
        action: "human_expert_clarification",
        itemId: run.runId,
        evidenceId: options.infoFeedRunEvidenceRefs(run)[0] || "",
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
          evidenceRefs: options.infoFeedRunEvidenceRefs(run),
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
      options.upsertInfoFeedHistory(run);
    }
  }

  async function runInfoFeedSummaryAgent(sequence = options.infoFeedRunSequence.value) {
    const run = options.infoFeedCurrentRun.value;
    if (!run || !options.infoFeedReadyForSummary.value) {
      return;
    }
    run.pausedForModelSelection = "";
    run.summary.status = "running";
    run.summary.progress = 15;
    run.summary.modelAlias = options.selectedInfoFeedModel.value.value;
    run.summary.contextProfileId = options.selectedInfoFeedContextProfile.value.value;
    const summaryTemperature = Number(options.infoFeedForm.value.temperature || 0.2);
    const summaryMaxTokens = Number(options.infoFeedForm.value.maxTokens || 1800);
    run.summary.temperature = summaryTemperature;
    run.summary.maxTokens = summaryMaxTokens;
    run.summary.answer = "";
    run.summary.error = "";
    run.summary.fallback = false;
    try {
      const response = await withInfoFeedFetchRetry(run, "summary", () =>
        bridge.callAgentGateway({
          modelAlias: options.selectedInfoFeedModel.value.value,
          alias: options.selectedInfoFeedModel.value.value,
          moduleId: "agentTools",
          taskId: run.runId,
          sessionId: run.agent?.workspaceId || run.runId,
          question: options.buildInfoFeedSummaryQuestion(run),
          systemPrompt:
            "你是 Pact 信息流智能体。你的任务是融合原文检索、智能规划和附件读取结果，输出可复核、带证据编号的最终回答。证据不足时必须说明不足。只有当缺少用户选择就无法继续执行时，才向用户提问；普通不确定性只写在报告里。",
          parameters: {
            ...options.agentExploreThinkingParameters(),
            temperature: summaryTemperature,
            max_tokens: summaryMaxTokens,
          },
        }),
      );
      if (
        sequence !== options.infoFeedRunSequence.value ||
        options.infoFeedCurrentRun.value?.runId !== run.runId
      ) {
        return;
      }
      const answer = String(response.answer || response.text || "").trim();
      options.applyInfoFeedSummaryAnswer(
        run,
        answer || options.fallbackInfoFeedSummary(run),
        !answer,
        answer ? "" : "总结智能体没有返回可用回答，已展示本地兜底摘要。",
      );
      run.summary.status = answer ? "completed" : "failed";
      run.summary.progress = 100;
    } catch (nextError) {
      if (
        sequence !== options.infoFeedRunSequence.value ||
        options.infoFeedCurrentRun.value?.runId !== run.runId
      ) {
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
      options.applyInfoFeedSummaryAnswer(
        run,
        options.fallbackInfoFeedSummary(run),
        true,
        nextError instanceof Error ? nextError.message : "总结智能体调用失败。",
      );
      run.summary.status = "failed";
      run.summary.progress = 100;
    } finally {
      if (options.infoFeedCurrentRun.value?.runId === run.runId) {
        run.completedAt = new Date().toISOString();
        if (run.summary.answer || run.summary.status === "failed") {
          options.upsertInfoFeedHistory(run);
        }
      }
    }
  }

  async function executeInfoFeedRunIteration(sequence: number, run: InfoFeedRunState) {
    const sourceSearchQuery = options.buildInfoFeedSourceSearchQuery(run);
    const agentQuery = options.buildInfoFeedAgentQuery(run);
    await Promise.allSettled([
      runInfoFeedKeywordTrack(sequence, run.runId, sourceSearchQuery),
      runInfoFeedAgentTrack(sequence, run.runId, agentQuery),
    ]);
    if (
      sequence !== options.infoFeedRunSequence.value ||
      options.infoFeedCurrentRun.value?.runId !== run.runId
    ) {
      return;
    }
    if (run.pausedForModelSelection || run.pausedForRetry) {
      options.upsertInfoFeedHistory(run);
      return;
    }
    await runInfoFeedSummaryAgent(sequence);
  }

  async function continueInfoFeedCurrentRun(question: string) {
    const run = options.infoFeedCurrentRun.value;
    if (!run) {
      return;
    }
    if (!options.canReadKnowledge.value) {
      options.error.value = "当前账号没有知识库读取权限。";
      return;
    }
    if (!options.selectedInfoFeedModel.value.enabled) {
      options.error.value = "请选择模型库中已配置且支持智能体调用的模型。";
      return;
    }
    options.error.value = "";
    options.infoFeedParentRunSnapshot.value = null;
    options.resetInfoFeedRunForContinuation(run, question);
    options.upsertInfoFeedHistory(run);
    const sequence = options.infoFeedRunSequence.value + 1;
    options.infoFeedRunSequence.value = sequence;
    await executeInfoFeedRunIteration(sequence, run);
  }

  async function runInfoFeed() {
    const query = options.infoFeedForm.value.query.trim();
    if (!query) {
      options.error.value = "请输入信息流问题。";
      return;
    }
    if (!options.canReadKnowledge.value) {
      options.error.value = "当前账号没有知识库读取权限。";
      return;
    }
    if (!options.selectedInfoFeedModel.value.enabled) {
      options.error.value = "请选择模型库中已配置且支持智能体调用的模型。";
      return;
    }
    if (options.infoFeedCanFollowUp.value && options.infoFeedCurrentRun.value) {
      options.infoFeedForm.value.query = "";
      await continueInfoFeedCurrentRun(query);
      return;
    }
    options.error.value = "";
    options.infoFeedParentRunSnapshot.value = null;
    const sequence = options.infoFeedRunSequence.value + 1;
    options.infoFeedRunSequence.value = sequence;
    const run = options.createInfoFeedRun(query);
    options.infoFeedCurrentRun.value = run;
    options.infoFeedForm.value.query = "";
    await executeInfoFeedRunIteration(sequence, run);
  }

  async function chooseInfoFeedClarification(option: InfoFeedClarificationOption) {
    const run = options.infoFeedCurrentRun.value;
    if (!run?.clarification || run.summary.status === "running") {
      return;
    }
    const clarification = run.clarification;
    const archived = options.archiveInfoFeedExpertFeedback(run, clarification, option);
    run.clarification = {
      ...clarification,
      status: "answered",
      selectedOptionId: option.optionId,
    };
    options.upsertInfoFeedHistory(run);
    await syncInfoFeedExpertFeedback(run, archived);
    await continueInfoFeedCurrentRun(option.followUpQuestion);
  }

  async function continueInfoFeedAfterModelSelection() {
    const run = options.infoFeedCurrentRun.value;
    if (!run?.pausedForModelSelection) {
      return;
    }
    if (!options.selectedInfoFeedModel.value.enabled) {
      options.error.value = "请选择一个已配置且可用的模型。";
      return;
    }
    options.error.value = "";
    const pausedStage = run.pausedForModelSelection;
    const sequence = options.infoFeedRunSequence.value + 1;
    options.infoFeedRunSequence.value = sequence;
    run.pausedForModelSelection = "";
    run.summary.modelAlias = options.selectedInfoFeedModel.value.value;
    run.summary.contextProfileId = options.selectedInfoFeedContextProfile.value.value;
    if (pausedStage === "agent") {
      run.agent = {
        status: "idle",
        progress: 0,
        runId: "",
        workspaceId: "",
        response: null,
        error: "",
      };
      await runInfoFeedAgentTrack(sequence, run.runId, options.buildInfoFeedAgentQuery(run));
      if (
        sequence !== options.infoFeedRunSequence.value ||
        options.infoFeedCurrentRun.value?.runId !== run.runId ||
        run.pausedForModelSelection
      ) {
        options.upsertInfoFeedHistory(run);
        return;
      }
    }
    if (options.infoFeedReadyForSummary.value) {
      await runInfoFeedSummaryAgent(sequence);
    }
  }

  async function continueInfoFeedAfterRetry() {
    const run = options.infoFeedCurrentRun.value;
    if (!run?.pausedForRetry) {
      return;
    }
    const pausedStage = run.pausedForRetry;
    const sequence = options.infoFeedRunSequence.value + 1;
    options.infoFeedRunSequence.value = sequence;
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
      await runInfoFeedKeywordTrack(sequence, run.runId, options.buildInfoFeedSourceSearchQuery(run));
      if (
        sequence !== options.infoFeedRunSequence.value ||
        options.infoFeedCurrentRun.value?.runId !== run.runId ||
        run.pausedForRetry
      ) {
        options.upsertInfoFeedHistory(run);
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
      await runInfoFeedAgentTrack(sequence, run.runId, options.buildInfoFeedAgentQuery(run));
      if (
        sequence !== options.infoFeedRunSequence.value ||
        options.infoFeedCurrentRun.value?.runId !== run.runId ||
        run.pausedForRetry
      ) {
        options.upsertInfoFeedHistory(run);
        return;
      }
    }

    if (pausedStage === "summary") {
      run.summary.answer = "";
      run.summary.error = "";
      run.summary.fallback = false;
    }

    if (
      options.infoFeedReadyForSummary.value &&
      !run.pausedForModelSelection &&
      !run.pausedForRetry
    ) {
      await runInfoFeedSummaryAgent(sequence);
    }
  }

  return {
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
  };
}
