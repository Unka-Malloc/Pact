import type { KnowledgeSearchResult } from "../lib/types";
import {
  extractEvidenceRefsFromText,
  uniqueEvidenceRefs,
} from "../lib/rendering";
import type {
  InfoFeedAttachment,
  InfoFeedClarification,
  InfoFeedClarificationOption,
  InfoFeedExpertFeedback,
  InfoFeedRunState,
  InfoFeedStageStatus,
  InfoFeedTurnSnapshot,
} from "../types/app";
import { asRecord, modelAgentUid } from "./console-model-utils";

export interface InfoFeedSummaryDefaults {
  modelAlias: string;
  contextProfileId: string;
  temperature: number;
  maxTokens: number;
}

export interface InfoFeedContextProfileBudgetRow {
  profileId: string;
  contextWindowTokens: number;
  knowledgeBudget: number;
}

export const INFO_FEED_CONTEXT_CHARS_PER_TOKEN = 3;

export function makeInfoFeedId(prefix = "info-feed") {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function truncateInfoFeedText(value: unknown, maxLength = 600) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function formatFileSize(size: number) {
  const value = Number(size || 0);
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function infoFeedStatusLabel(status: InfoFeedStageStatus) {
  if (status === "running") return "运行中";
  if (status === "completed") return "完成";
  if (status === "failed") return "失败";
  return "待开始";
}

export function infoFeedStatusTone(status: InfoFeedStageStatus) {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "running") return "info";
  return "muted";
}

export function isReadableInfoFeedAttachment(file: File) {
  const name = file.name.toLowerCase();
  const textExtensions = [
    ".txt", ".md", ".markdown", ".json", ".jsonl", ".csv", ".tsv", ".xml", ".html", ".htm", ".eml",
    ".log", ".yaml", ".yml", ".toml", ".ini", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".vue",
    ".py", ".java", ".go", ".rs", ".c", ".cc", ".cpp", ".h", ".hpp", ".cs", ".php", ".rb", ".swift",
    ".kt", ".kts", ".sh", ".bash", ".zsh", ".fish", ".sql", ".css", ".scss", ".less",
  ];
  return file.type.startsWith("text/") ||
    file.type === "message/rfc822" ||
    textExtensions.some((extension) => name.endsWith(extension));
}

export function compactInfoFeedAttachment(attachment: InfoFeedAttachment): InfoFeedAttachment {
  return {
    ...attachment,
    text: String(attachment.text || "").slice(0, 4000),
    error: String(attachment.error || "").slice(0, 1000),
  };
}

export function snapshotInfoFeedAttachments(attachments: InfoFeedAttachment[]) {
  return attachments.map(compactInfoFeedAttachment);
}

export function createInfoFeedFollowUpContext(
  previousRun: InfoFeedRunState | null,
  question: string,
): InfoFeedRunState["followUp"] | undefined {
  if (!previousRun?.summary.answer?.trim()) {
    return undefined;
  }
  return {
    parentRunId: previousRun.runId,
    parentQuery: previousRun.query,
    question,
    parentSummary: truncateInfoFeedText(previousRun.summary.answer, 2600),
    parentEvidenceRefs: uniqueEvidenceRefs([
      ...(((previousRun.keyword.response?.items || previousRun.keyword.response?.results || []) as KnowledgeSearchResult[])
        .map((item) => String(item.evidenceId || ""))
        .filter(Boolean)),
      ...extractEvidenceRefsFromText(previousRun.agent.response?.answer || ""),
      ...extractEvidenceRefsFromText(previousRun.summary.answer || ""),
    ]).slice(0, 16),
  };
}

export function createInitialInfoFeedKeywordState(): InfoFeedRunState["keyword"] {
  return {
    status: "idle",
    progress: 0,
    stage: "",
    fromCache: false,
    response: null,
    error: "",
  };
}

export function createInitialInfoFeedAgentState(): InfoFeedRunState["agent"] {
  return {
    status: "idle",
    progress: 0,
    runId: "",
    workspaceId: "",
    response: null,
    error: "",
  };
}

export function createInitialInfoFeedSummaryState(
  defaults: InfoFeedSummaryDefaults,
): InfoFeedRunState["summary"] {
  return {
    status: "idle",
    progress: 0,
    modelAlias: defaults.modelAlias,
    contextProfileId: defaults.contextProfileId,
    parametersOpen: false,
    temperature: defaults.temperature,
    maxTokens: defaults.maxTokens,
    answer: "",
    error: "",
    fallback: false,
  };
}

export function createInfoFeedRunState(
  query: string,
  options: {
    attachments: InfoFeedAttachment[];
    summaryDefaults: InfoFeedSummaryDefaults;
    followUp?: InfoFeedRunState["followUp"];
  },
): InfoFeedRunState {
  return {
    runId: makeInfoFeedId("run"),
    query,
    startedAt: new Date().toISOString(),
    completedAt: "",
    attachments: snapshotInfoFeedAttachments(options.attachments),
    ...(options.followUp ? { followUp: options.followUp } : {}),
    expertFeedback: [],
    turns: [],
    keyword: createInitialInfoFeedKeywordState(),
    agent: createInitialInfoFeedAgentState(),
    summary: createInitialInfoFeedSummaryState(options.summaryDefaults),
    pausedForModelSelection: "",
    pausedForRetry: "",
    retry: undefined,
  };
}

export function snapshotInfoFeedTurnCore(
  run: InfoFeedRunState,
  options: {
    summaryModelAlias: string;
    evidenceRefs: (run: InfoFeedRunState) => string[];
  },
): InfoFeedTurnSnapshot | null {
  const summaryAnswer = String(run.summary.answer || "").trim();
  const expertFeedback = run.expertFeedback || [];
  if (!summaryAnswer && expertFeedback.length === 0) {
    return null;
  }
  return {
    turnId: makeInfoFeedId("turn"),
    query: run.query,
    followUpQuestion: run.followUp?.question || "",
    attachments: snapshotInfoFeedAttachments(run.attachments),
    completedAt: run.completedAt || new Date().toISOString(),
    summaryAnswer,
    summaryError: run.summary.error || "",
    summaryFallback: Boolean(run.summary.fallback),
    summaryModelAlias: run.summary.modelAlias || options.summaryModelAlias,
    evidenceRefs: options.evidenceRefs(run),
    expertFeedback: [...expertFeedback],
  };
}

export function appendInfoFeedTurnSnapshotCore(
  run: InfoFeedRunState,
  options: {
    summaryModelAlias: string;
    evidenceRefs: (run: InfoFeedRunState) => string[];
  },
) {
  const snapshot = snapshotInfoFeedTurnCore(run, options);
  if (!snapshot) {
    return null;
  }
  run.turns = [...(run.turns || []), snapshot].slice(-8);
  return snapshot;
}

export function resetInfoFeedRunForContinuationCore(
  run: InfoFeedRunState,
  question: string,
  options: {
    attachments: InfoFeedAttachment[];
    summaryDefaults: InfoFeedSummaryDefaults;
    evidenceRefs: (run: InfoFeedRunState) => string[];
  },
) {
  const followUp = createInfoFeedFollowUpContext(run, question);
  appendInfoFeedTurnSnapshotCore(run, {
    summaryModelAlias: options.summaryDefaults.modelAlias,
    evidenceRefs: options.evidenceRefs,
  });
  run.followUp = followUp;
  run.completedAt = "";
  run.attachments = snapshotInfoFeedAttachments(options.attachments);
  run.clarification = undefined;
  run.expertFeedback = [];
  run.keyword = createInitialInfoFeedKeywordState();
  run.agent = createInitialInfoFeedAgentState();
  run.summary = createInitialInfoFeedSummaryState(options.summaryDefaults);
  run.pausedForModelSelection = "";
  run.pausedForRetry = "";
  run.retry = undefined;
}

function compactInfoFeedExpertFeedbackList(
  items: InfoFeedRunState["expertFeedback"],
  limit: number,
) {
  return (items || []).slice(-limit).map((item) => ({
    ...item,
    prompt: String(item.prompt || "").slice(0, 600),
    reason: String(item.reason || "").slice(0, 600),
    selectedDescription: String(item.selectedDescription || "").slice(0, 600),
    followUpQuestion: String(item.followUpQuestion || "").slice(0, 1200),
    sourceQuery: String(item.sourceQuery || "").slice(0, 1200),
  }));
}

export function compactInfoFeedRunForStorage(
  run: InfoFeedRunState,
  summaryDefaults: Pick<InfoFeedSummaryDefaults, "temperature" | "maxTokens">,
): InfoFeedRunState {
  const keywordItems = ((run.keyword.response?.items || run.keyword.response?.results || []) as KnowledgeSearchResult[])
    .slice(0, 12);
  const keywordResponse = run.keyword.response
    ? {
        ...run.keyword.response,
        items: keywordItems,
        results: keywordItems,
      }
    : null;
  const agentResponse = run.agent.response
    ? {
        ...run.agent.response,
        steps: (run.agent.response.steps || []).slice(-8),
        toolResults: (run.agent.response.toolResults || []).slice(-12),
        answer: String(run.agent.response.answer || "").slice(0, 12000),
      }
    : null;
  return {
    ...run,
    followUp: run.followUp
      ? {
          ...run.followUp,
          parentSummary: String(run.followUp.parentSummary || "").slice(0, 4000),
          parentEvidenceRefs: (run.followUp.parentEvidenceRefs || []).slice(0, 24),
        }
      : undefined,
    attachments: run.attachments.map((attachment) => ({
      ...compactInfoFeedAttachment(attachment),
    })),
    turns: (run.turns || []).slice(-8).map((turn) => ({
      ...turn,
      query: String(turn.query || "").slice(0, 1200),
      followUpQuestion: String(turn.followUpQuestion || "").slice(0, 1200),
      attachments: snapshotInfoFeedAttachments(turn.attachments || []).slice(0, 12),
      summaryAnswer: String(turn.summaryAnswer || "").slice(0, 16000),
      summaryError: String(turn.summaryError || "").slice(0, 1000),
      evidenceRefs: (turn.evidenceRefs || []).slice(0, 32),
      expertFeedback: compactInfoFeedExpertFeedbackList(turn.expertFeedback || [], 8),
    })),
    expertFeedback: compactInfoFeedExpertFeedbackList(run.expertFeedback || [], 16),
    clarification: run.clarification
      ? {
          ...run.clarification,
          anchor: run.clarification.anchor || "report",
          options: (run.clarification.options || []).slice(0, 4),
        }
      : undefined,
    keyword: {
      ...run.keyword,
      response: keywordResponse,
    },
    agent: {
      ...run.agent,
      response: agentResponse,
    },
    summary: {
      ...run.summary,
      temperature: Number(run.summary.temperature ?? summaryDefaults.temperature ?? 0.2),
      maxTokens: Number(run.summary.maxTokens ?? summaryDefaults.maxTokens ?? 1800),
      answer: String(run.summary.answer || "").slice(0, 20000),
    },
  };
}

export function sanitizeInfoFeedRunModelReferences(
  run: InfoFeedRunState,
  validAgentModelAlias: (value?: string) => string,
): InfoFeedRunState {
  const summaryModelAlias = validAgentModelAlias(run.summary?.modelAlias);
  return {
    ...run,
    turns: (run.turns || []).map((turn) => ({
      ...turn,
      summaryModelAlias: validAgentModelAlias(turn.summaryModelAlias),
    })),
    summary: {
      ...run.summary,
      modelAlias: summaryModelAlias,
    },
  };
}

export function normalizeInfoFeedHistoryCore(
  runs: InfoFeedRunState[],
  options: {
    validAgentModelAlias: (value?: string) => string;
    summaryDefaults: Pick<InfoFeedSummaryDefaults, "temperature" | "maxTokens">;
  },
) {
  const seen = new Set<string>();
  return runs
    .filter((run) => {
      const runId = String(run?.runId || "").trim();
      if (!runId || seen.has(runId)) {
        return false;
      }
      seen.add(runId);
      return true;
    })
    .sort((left, right) => {
      const leftTime = Date.parse(String(left.completedAt || left.startedAt || ""));
      const rightTime = Date.parse(String(right.completedAt || right.startedAt || ""));
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    })
    .slice(0, 20)
    .map((run) =>
      sanitizeInfoFeedRunModelReferences(
        compactInfoFeedRunForStorage(run, options.summaryDefaults),
        options.validAgentModelAlias,
      ),
    );
}

export function infoFeedTurnQuestionCore(turn: InfoFeedTurnSnapshot) {
  return turn.followUpQuestion || turn.query || "未记录问题";
}

export function buildInfoFeedSourceSearchQueryCore(run: InfoFeedRunState) {
  if (!run.followUp) {
    return run.query;
  }
  return [
    run.followUp.parentQuery,
    run.followUp.question,
  ].filter(Boolean).join("\n");
}

export function buildInfoFeedAgentQueryCore(run: InfoFeedRunState) {
  if (!run.followUp) {
    return run.query;
  }
  return [
    "这是一次基于上一轮信息流结果的追问。",
    "",
    `上一轮问题：${run.followUp.parentQuery}`,
    "",
    "上一轮总结：",
    run.followUp.parentSummary,
    "",
    run.followUp.parentEvidenceRefs.length
      ? `上一轮证据编号：${run.followUp.parentEvidenceRefs.join("、")}`
      : "上一轮证据编号：无",
    "",
    `用户追问：${run.followUp.question}`,
    "",
    "请优先利用上一轮上下文；需要新证据时继续调用工具检索。回答必须保留可复核证据编号。",
  ].join("\n");
}

export function infoFeedAgentRecentTurnsCore(run: InfoFeedRunState) {
  return [
    ...(run.turns || []).map((turn) => ({
      role: "assistant",
      query: infoFeedTurnQuestionCore(turn),
      summary: truncateInfoFeedText(turn.summaryAnswer, 1800),
      evidenceRefs: turn.evidenceRefs || [],
      completedAt: turn.completedAt,
    })),
    ...(run.followUp
      ? [
          {
            role: "user" as const,
            query: run.followUp.question,
            parentQuery: run.followUp.parentQuery,
          },
        ]
      : []),
  ].slice(-12);
}

export function infoFeedAgentExpertGuidanceCore(run: InfoFeedRunState) {
  return [
    ...(run.turns || []).flatMap((turn) => turn.expertFeedback || []),
    ...(run.expertFeedback || []),
  ].map((item) => ({
    feedbackId: item.feedbackId,
    query: item.sourceQuery,
    label: item.selectedLabel,
    instruction: item.followUpQuestion,
    reason: item.reason || item.prompt,
    evidenceRefs: [],
    createdAt: item.createdAt,
    context: {
      gold: true,
      humanExpert: true,
      selectedOption: {
        label: item.selectedLabel,
        followUpQuestion: item.followUpQuestion,
      },
    },
  }));
}

export function isLowRelevanceSourceResult(item: KnowledgeSearchResult) {
  return String(item.relevanceTier || "").toLowerCase() === "low" ||
    item.lowRelevance === true ||
    item.contextEligible === false;
}

export function infoFeedSourceResultLine(item: KnowledgeSearchResult, index: number) {
  const tier = isLowRelevanceSourceResult(item) ? "低关联" : "高关联";
  return [
    `${index + 1}. ${item.title || "未命名来源"}（${tier}）`,
    item.evidenceId ? `证据：${item.evidenceId}` : "",
    item.score !== undefined ? `分数：${Number(item.score).toFixed(3)}` : "",
    item.snippet ? `片段：${truncateInfoFeedText(item.snippet, 260)}` : "",
  ].filter(Boolean).join("\n");
}

export function estimateInfoFeedContextTokens(
  chars: number,
  charsPerToken = INFO_FEED_CONTEXT_CHARS_PER_TOKEN,
) {
  return Math.ceil(Math.max(0, Number(chars || 0)) / charsPerToken);
}

export function infoFeedSourceContextBudgetChars(
  run: InfoFeedRunState | null | undefined,
  options: {
    profiles: InfoFeedContextProfileBudgetRow[];
    fallbackProfileId: string;
    charsPerToken?: number;
  },
) {
  const charsPerToken = options.charsPerToken || INFO_FEED_CONTEXT_CHARS_PER_TOKEN;
  const profileId = String(
    run?.summary.contextProfileId ||
      options.fallbackProfileId ||
      "context-128k",
  );
  const profile = options.profiles.find((item) => item.profileId === profileId);
  const tokenBudget = Number(
    profile?.knowledgeBudget ||
      (profile?.contextWindowTokens ? Math.floor(profile.contextWindowTokens * 0.28) : 0) ||
      (profileId.includes("1m") ? 320000 : profileId.includes("32k") ? 8000 : 36000),
  );
  return Math.max(4000, tokenBudget * charsPerToken);
}

export function buildInfoFeedSourceContextCore(
  run: InfoFeedRunState | null | undefined,
  options: {
    profiles: InfoFeedContextProfileBudgetRow[];
    fallbackProfileId: string;
    charsPerToken?: number;
  },
) {
  const charsPerToken = options.charsPerToken || INFO_FEED_CONTEXT_CHARS_PER_TOKEN;
  const response = run?.keyword.response;
  const allItems = ((response?.items || response?.results || []) as KnowledgeSearchResult[]);
  const highItems = allItems.filter((item) => !isLowRelevanceSourceResult(item));
  const lowItems = allItems.filter(isLowRelevanceSourceResult);
  const budget = infoFeedSourceContextBudgetChars(run, {
    ...options,
    charsPerToken,
  });
  const hasLowItems = lowItems.length > 0;
  const lowReserve = hasLowItems
    ? Math.min(Math.max(2400, Math.floor(budget * 0.12)), Math.floor(budget * 0.22))
    : 0;
  const highBudget = Math.max(1200, budget - lowReserve);
  const lines: string[] = [];
  let usedChars = 0;
  let highUsedChars = 0;
  let includedHigh = 0;
  for (const item of highItems) {
    const line = infoFeedSourceResultLine(item, includedHigh);
    if (lines.length > 0 && usedChars + line.length + 2 > highBudget) {
      break;
    }
    lines.push(line);
    usedChars += line.length + 2;
    highUsedChars += line.length + 2;
    includedHigh += 1;
  }
  const highOmitted = Math.max(0, highItems.length - includedHigh);
  let includedLow = 0;
  const lowLines: string[] = [];
  const lowHeader = "【低关联原始命中】";
  let lowUsedChars = 0;
  const lowBudget = Math.max(0, budget - usedChars - (hasLowItems ? lowHeader.length + 4 : 0));
  for (const item of lowItems) {
    const line = infoFeedSourceResultLine(item, includedLow);
    if (includedLow > 0 && lowUsedChars + line.length + 2 > lowBudget) {
      break;
    }
    if (includedLow === 0 && line.length + 2 > lowBudget) {
      break;
    }
    lowLines.push(line);
    lowUsedChars += line.length + 2;
    includedLow += 1;
  }
  if (lowLines.length > 0) {
    lines.push("【低关联原始命中】");
    lines.push(lowLines.join("\n\n"));
    usedChars += lowHeader.length + lowUsedChars + 4;
  }
  const lowOmitted = Math.max(0, lowItems.length - includedLow);
  const gateLines = [];
  const budgetTokens = estimateInfoFeedContextTokens(budget, charsPerToken);
  const usedTokens = estimateInfoFeedContextTokens(usedChars, charsPerToken);
  const highUsedTokens = estimateInfoFeedContextTokens(highUsedChars, charsPerToken);
  const lowUsedTokens = Math.max(0, usedTokens - highUsedTokens);
  if (highOmitted > 0) {
    gateLines.push(`高关联邮件进入 ${includedHigh}/${highItems.length} 封，省略 ${highOmitted} 封。`);
  } else if (highItems.length > 0) {
    gateLines.push(`高关联邮件已全部进入上下文（${includedHigh}/${highItems.length}）。`);
  }
  if (lowOmitted > 0) {
    gateLines.push(`低关联邮件进入 ${includedLow}/${lowItems.length} 封，省略 ${lowOmitted} 封。`);
  } else if (lowItems.length > 0) {
    gateLines.push(`低关联邮件已全部进入上下文（${includedLow}/${lowItems.length}）。`);
  }
  gateLines.push(`原文检索上下文预算约 ${budgetTokens.toLocaleString()} tokens，已使用约 ${usedTokens.toLocaleString()} tokens。`);
  return {
    text: lines.join("\n\n"),
    report: {
      budgetChars: budget,
      usedChars,
      remainingChars: Math.max(0, budget - usedChars),
      budgetTokens,
      usedTokens,
      remainingTokens: Math.max(0, budgetTokens - usedTokens),
      highBudgetChars: highBudget,
      lowReserveChars: lowReserve,
      highUsedTokens,
      lowUsedTokens,
      totalCount: allItems.length,
      highCount: highItems.length,
      lowCount: lowItems.length,
      includedHigh,
      includedLow,
      omittedHigh: highOmitted,
      omittedLow: lowOmitted,
      message: gateLines.join(" "),
    },
  };
}

export function buildInfoFeedSourceSummaryCore(
  run: InfoFeedRunState,
  sourceContext: {
    text: string;
    report: { message?: string };
  },
) {
  const sourceContextText = [
    sourceContext.report.message ? `上下文门禁：${sourceContext.report.message}` : "",
    sourceContext.text,
  ].filter(Boolean).join("\n\n");
  const attachmentLines = run.attachments.map((attachment, index) => [
    `${index + 1}. ${attachment.name}（${infoFeedStatusLabel(attachment.status)}，${formatFileSize(attachment.size)}）`,
    attachment.text ? `摘录：${truncateInfoFeedText(attachment.text, 420)}` : "",
    attachment.error ? `错误：${attachment.error}` : "",
  ].filter(Boolean).join("\n"));
  const followUpLines = run.followUp
    ? [
        "【上一轮信息流上下文】",
        `上一轮问题：${run.followUp.parentQuery}`,
        `当前追问：${run.followUp.question}`,
        run.followUp.parentEvidenceRefs.length
          ? `上一轮证据编号：${run.followUp.parentEvidenceRefs.join("、")}`
          : "上一轮证据编号：无",
        "",
        "上一轮总结：",
        run.followUp.parentSummary,
        "",
      ]
    : [];
  return [
    ...followUpLines,
    "【附件处理】",
    attachmentLines.length ? attachmentLines.join("\n\n") : "无附件。",
    "",
    "【原文检索结果】",
    sourceContextText || run.keyword.error || "未找到原文检索结果。",
    "",
    "【智能规划 + 知识库检索结果】",
    run.agent.response?.answer
      ? truncateInfoFeedText(run.agent.response.answer, 4200)
      : (run.agent.error || "智能规划未返回最终回答。"),
  ].join("\n");
}

export function infoFeedRunEvidenceRefsCore(run: InfoFeedRunState) {
  return uniqueEvidenceRefs([
    ...(((run.keyword.response?.items || run.keyword.response?.results || []) as KnowledgeSearchResult[])
      .map((item) => String(item.evidenceId || ""))
      .filter(Boolean)),
    ...extractEvidenceRefsFromText(run.agent.response?.answer || ""),
    ...extractEvidenceRefsFromText(run.summary.answer || ""),
  ]);
}

export function archiveInfoFeedExpertFeedbackCore(
  run: InfoFeedRunState,
  clarification: InfoFeedClarification,
  option: InfoFeedClarificationOption,
) {
  const createdAt = new Date().toISOString();
  const feedbackId = `feedback::info-feed::${modelAgentUid(
    run.runId,
    clarification.questionId,
    option.optionId,
    option.followUpQuestion,
  ).replace(/^agent_/, "")}`;
  const archived: InfoFeedExpertFeedback = {
    feedbackId,
    questionId: clarification.questionId,
    anchor: clarification.anchor || "report",
    prompt: clarification.prompt,
    reason: clarification.reason,
    selectedOptionId: option.optionId,
    selectedLabel: option.label,
    selectedDescription: option.description,
    followUpQuestion: option.followUpQuestion,
    sourceQuery: run.followUp?.question || run.query,
    createdAt,
    syncedAt: "",
    syncStatus: "pending",
    syncError: "",
  };
  run.expertFeedback = [
    ...(run.expertFeedback || []).filter((item) => item.feedbackId !== feedbackId),
    archived,
  ];
  return archived;
}

export function buildInfoFeedSummaryQuestionCore(
  run: InfoFeedRunState,
  sourceSummary: string,
) {
  return [
    run.followUp ? `用户追问：${run.followUp.question}` : `用户问题：${run.query}`,
    "",
    sourceSummary,
    "",
    "请把以上两路检索和附件处理结果合并成一份面向用户的最终回答。",
    "要求：",
    "1. 先给出直接结论，再列出关键证据和不确定性。",
    "2. 保留 evidence:: 或 ev_ 证据编号，便于页面点击查看。",
    "3. 如果原文检索和智能规划互相冲突，要明确说明冲突。",
    "4. 不要编造附件、证据、日期、金额或来源。",
    "5. 不要频繁提问。只有在没有人类选择就无法继续检索、归纳或执行下一步时，才在答案末尾追加 fenced block：```pact_user_options 换行 JSON 换行 ```。",
    "   JSON 示例：{\"prompt\":\"你希望优先确认哪类内容？\",\"reason\":\"当前证据覆盖不足。\",\"options\":[{\"label\":\"继续补证据\",\"description\":\"扩大检索范围。\",\"followUpQuestion\":\"请继续补充直接证据。\"}]}",
  ].join("\n");
}

export function fallbackInfoFeedSummaryCore(run: InfoFeedRunState) {
  const keywordItems = ((run.keyword.response?.items || run.keyword.response?.results || []) as KnowledgeSearchResult[]).slice(0, 5);
  const lines = [
    run.followUp
      ? `根据本次信息流追问，问题「${run.followUp.question}」已有以下可用结果：`
      : `根据本次信息流检索，问题「${run.query}」已有以下可用结果：`,
    run.followUp ? `上一轮问题：${run.followUp.parentQuery}` : "",
    "",
    "---",
    "",
    "1. 原文检索",
    keywordItems.length
      ? keywordItems.map((item, index) =>
          `${index + 1}. ${item.title || "未命名来源"}${item.evidenceId ? `（${item.evidenceId}）` : ""}\n${truncateInfoFeedText(item.snippet || "", 220)}`,
        ).join("\n\n")
      : (run.keyword.error || "没有找到可展示的原文检索结果。"),
    "",
    "---",
    "",
    "2. 智能规划",
    run.agent.response?.answer
      ? truncateInfoFeedText(run.agent.response.answer, 1800)
      : (run.agent.error || "智能规划没有返回可用回答。"),
  ];
  return lines.join("\n");
}

export function normalizeInfoFeedClarificationOptionCore(
  value: unknown,
  index: number,
): InfoFeedClarificationOption | null {
  const record = asRecord(value) || {};
  const label = String(record.label || record.title || "").trim();
  const followUpQuestion = String(record.followUpQuestion || record.query || record.value || label || "").trim();
  if (!label || !followUpQuestion) {
    return null;
  }
  return {
    optionId: String(record.optionId || record.id || `option-${index + 1}`),
    label: label.slice(0, 64),
    description: String(record.description || record.reason || "").trim().slice(0, 180),
    followUpQuestion: followUpQuestion.slice(0, 800),
  };
}

export function extractInfoFeedClarificationCore(
  answer: string,
): { answer: string; clarification?: InfoFeedClarification } {
  const source = String(answer || "");
  let cleaned = source;
  let clarification: InfoFeedClarification | undefined;
  const blockPattern = /```(?:pact_user_options|pact-options|json)\s*([\s\S]*?)```/gi;
  for (const match of source.matchAll(blockPattern)) {
    try {
      const parsed = JSON.parse(match[1].trim().replace(/^json\s*/i, ""));
      const record = asRecord(parsed) || {};
      const options = Array.isArray(record.options)
        ? record.options
            .map((item, index) => normalizeInfoFeedClarificationOptionCore(item, index))
            .filter((item): item is InfoFeedClarificationOption => Boolean(item))
            .slice(0, 4)
        : [];
      if (options.length > 0) {
        clarification = {
          questionId: String(record.questionId || makeInfoFeedId("question")),
          prompt: String(record.prompt || record.question || "需要你确认下一步方向。").trim().slice(0, 220),
          reason: String(record.reason || "").trim().slice(0, 240),
          anchor: record.anchor === "summary" ? "summary" : "report",
          status: "open",
          selectedOptionId: "",
          options,
        };
        cleaned = cleaned.replace(match[0], "").trim();
        break;
      }
    } catch {
      // Ignore regular JSON/code blocks that are not clarification options.
    }
  }
  return {
    answer: cleaned.trim() || source.trim(),
    clarification,
  };
}

export function buildFallbackInfoFeedClarificationCore(
  run: InfoFeedRunState,
): InfoFeedClarification | undefined {
  const needsChoice = run.summary.fallback || Boolean(run.summary.error);
  if (!needsChoice) {
    return undefined;
  }
  return {
    questionId: makeInfoFeedId("question"),
    prompt: "这次结果存在不确定内容，你希望下一步怎么处理？",
    reason: run.summary.error || "当前证据不足或结论范围不够明确。",
    anchor: run.summary.answer ? "report" : "summary",
    status: "open",
    selectedOptionId: "",
    options: [
      {
        optionId: "more-evidence",
        label: "继续补证据",
        description: "扩大原文检索和智能规划范围，优先找直接证据。",
        followUpQuestion: "请继续补充直接证据，扩大检索范围，并标明哪些结论仍然无法确认。",
      },
      {
        optionId: "strict-only",
        label: "只保留已证实",
        description: "删除推测内容，只输出现有证据能支持的结论。",
        followUpQuestion: "请基于现有证据重新整理，只保留已经被证据直接支持的结论。",
      },
      {
        optionId: "change-angle",
        label: "换角度查",
        description: "从主体、时间、金额、来源等角度重新规划检索。",
        followUpQuestion: "请从主体、时间、金额、来源几个角度重新规划检索，并说明每个角度的命中情况。",
      },
    ],
  };
}

export function applyInfoFeedSummaryAnswerCore(
  run: InfoFeedRunState,
  answer: string,
  fallback: boolean,
  error = "",
) {
  const extracted = extractInfoFeedClarificationCore(answer);
  run.summary.answer = extracted.answer || answer;
  run.summary.fallback = fallback;
  run.summary.error = error;
  run.clarification = extracted.clarification || buildFallbackInfoFeedClarificationCore(run);
}
