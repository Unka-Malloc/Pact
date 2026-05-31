import type { AgentExploreRunResponse } from "../lib/types";
import type { AgentExploreSession, HistorySessionPanelItem } from "../types/app";
import { asRecord } from "./console-model-utils";

export const AGENT_EXPLORE_STORAGE_KEY = "pact.agentExplore.sessions.v1";

export interface AgentExploreFormState {
  query: string;
  modelAlias: string;
  contextProfileId: string;
  thinkingMode: string;
  temperature: number;
  maxTokens: number;
  maxIterations: number;
  limit: number;
  toolChoice: string;
  workspaceId: string;
}

export interface AgentExploreFormDefaults {
  temperature: number;
  maxTokens: number;
  maxIterations: number;
  limit: number;
  toolChoice: string;
}

export function shortId(value: unknown) {
  const text = String(value || "").trim();
  if (text.length <= 16) {
    return text || "--";
  }
  return `${text.slice(0, 8)}…${text.slice(-4)}`;
}

export function isAgentExploreDraftSession(
  session: AgentExploreSession | null | undefined,
) {
  return String(session?.runId || "").startsWith("draft:");
}

export function agentExploreRunStatus(result: AgentExploreRunResponse | null) {
  return String(asRecord(result?.run)?.status || "");
}

export function agentExplorePhaseLabel(phase: unknown) {
  const value = String(phase || "");
  if (value === "model_calling") {
    return "模型决策";
  }
  if (value === "tool_selected") {
    return "已选择工具";
  }
  if (value === "tool_calling") {
    return "调用工具";
  }
  if (value === "tool_result") {
    return "工具返回";
  }
  if (value === "answer_ready") {
    return "生成答案";
  }
  if (value === "completed") {
    return "已完成";
  }
  if (value === "failed") {
    return "失败";
  }
  return value || "运行中";
}

export function agentExploreStepSummary(step: unknown) {
  const value = asRecord(step) || {};
  const toolCount = Array.isArray(value.toolCalls) ? value.toolCalls.length : 0;
  const resultCount = Array.isArray(value.toolResults) ? value.toolResults.length : 0;
  const phase = agentExplorePhaseLabel(value.phase || value.status);
  if (!toolCount && !resultCount) {
    return phase;
  }
  return `${phase} · 工具 ${toolCount} · 返回 ${resultCount}`;
}

export function agentExploreResultKey(step: unknown, toolResult: unknown, index: number) {
  const stepValue = asRecord(step) || {};
  const resultValue = asRecord(toolResult) || {};
  return [
    stepValue.iteration || "step",
    resultValue.tool || "tool",
    resultValue.startedAt || "",
    resultValue.completedAt || "",
    index,
  ].join(":");
}

export function agentExploreTabTitle(session: AgentExploreSession) {
  if (isAgentExploreDraftSession(session) && !session.query.trim()) {
    return "新会话";
  }
  return session.query || "未命名探索";
}

export function agentExploreTabMeta(session: AgentExploreSession) {
  if (isAgentExploreDraftSession(session)) {
    return "草稿";
  }
  return `${session.status || "unknown"} · ${shortId(session.runId)}`;
}

export function agentExploreEventLabel(event: unknown) {
  const value = asRecord(event) || {};
  return String(value.label || value.type || "状态更新");
}

export function agentExploreEventStatus(event: unknown) {
  const value = asRecord(event) || {};
  return String(value.status || "running");
}

export function normalizeAgentExploreRun(
  result: AgentExploreRunResponse,
): AgentExploreRunResponse {
  const run = asRecord(result.run);
  const coverage = asRecord(run?.coverage) || {};
  return {
    ...result,
    steps: result.steps || (Array.isArray(run?.steps) ? run.steps as AgentExploreRunResponse["steps"] : []),
    answer: result.answer || String(coverage.answer || ""),
    evidenceRefs: result.evidenceRefs || (Array.isArray(coverage.evidenceRefs) ? coverage.evidenceRefs as string[] : []),
    toolResults:
      result.toolResults ||
      (Array.isArray(coverage.toolResults)
        ? coverage.toolResults as AgentExploreRunResponse["toolResults"]
        : []),
    contextPack:
      result.contextPack ||
      (asRecord(coverage.contextPack) as AgentExploreRunResponse["contextPack"] | null) ||
      undefined,
    degraded: result.degraded ?? Boolean(run?.degraded),
    error: result.error || String(run?.error || ""),
  };
}

export function sanitizeAgentExploreSessionModelReference(
  session: AgentExploreSession,
  validAgentModelAlias: (value: string) => string,
): AgentExploreSession {
  return {
    ...session,
    modelAlias: validAgentModelAlias(session.modelAlias),
  };
}

export function agentExploreHistorySortValue(session: AgentExploreSession) {
  const value = Date.parse(String(session.updatedAt || ""));
  return Number.isFinite(value) ? value : 0;
}

export function normalizeAgentExploreHistoryListCore(
  sessions: AgentExploreSession[],
  options: {
    hiddenRunIds: Set<string>;
    validAgentModelAlias: (value: string) => string;
  },
) {
  const seen = new Set<string>();
  return sessions
    .filter((session) => {
      const runId = String(session.runId || "").trim();
      if (!runId || seen.has(runId) || options.hiddenRunIds.has(runId)) {
        return false;
      }
      seen.add(runId);
      return true;
    })
    .map((session) =>
      sanitizeAgentExploreSessionModelReference(session, options.validAgentModelAlias),
    )
    .sort((left, right) => agentExploreHistorySortValue(right) - agentExploreHistorySortValue(left))
    .slice(0, 20);
}

export function agentExploreSessionFromResultCore(
  result: AgentExploreRunResponse | null,
  options: {
    fallback?: Partial<AgentExploreSession>;
    currentForm: AgentExploreFormState;
    normalizeThinkingMode: (value?: string) => string;
  },
): AgentExploreSession | null {
  const fallback = options.fallback || {};
  const run = asRecord(result?.run) || {};
  const input = asRecord(run.input) || {};
  const workspace = asRecord(result?.workspace) || {};
  const runId = String(run.runId || fallback.runId || "").trim();
  const workspaceId = String(
    workspace.workspaceId ||
      run.workspaceId ||
      fallback.workspaceId ||
      options.currentForm.workspaceId ||
      "",
  ).trim();
  if (!runId || !workspaceId) {
    return null;
  }
  const query = String(input.query || fallback.query || options.currentForm.query || "").trim();
  return {
    runId,
    workspaceId,
    query,
    modelAlias: String(input.modelAlias || fallback.modelAlias || options.currentForm.modelAlias || ""),
    contextProfileId: String(
      input.contextProfileId ||
        fallback.contextProfileId ||
        options.currentForm.contextProfileId ||
        "context-128k",
    ),
    thinkingMode: options.normalizeThinkingMode(
      String(input.thinkingMode || fallback.thinkingMode || options.currentForm.thinkingMode || "default"),
    ),
    temperature: Number(input.temperature ?? fallback.temperature ?? options.currentForm.temperature ?? 0.2),
    maxTokens: Number(input.maxTokens || fallback.maxTokens || options.currentForm.maxTokens || 1800),
    maxIterations: Number(input.maxIterations || fallback.maxIterations || options.currentForm.maxIterations || 4),
    limit: Number(input.limit || fallback.limit || options.currentForm.limit || 8),
    toolChoice: String(input.toolChoice || fallback.toolChoice || options.currentForm.toolChoice || "auto"),
    status: agentExploreRunStatus(result),
    answerPreview: String(result?.answer || fallback.answerPreview || "").slice(0, 180),
    updatedAt: String(run.updatedAt || run.completedAt || fallback.updatedAt || new Date().toISOString()),
  };
}

export function createAgentExploreDraftSession(
  options: {
    form: AgentExploreFormState;
    contextProfileId: string;
    thinkingMode: string;
    defaults: AgentExploreFormDefaults;
    seed?: Partial<AgentExploreSession>;
  },
): AgentExploreSession {
  const timestamp = new Date().toISOString();
  return {
    runId: `draft:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    workspaceId: "",
    query: "",
    modelAlias: options.form.modelAlias || "",
    contextProfileId: options.contextProfileId,
    thinkingMode: options.thinkingMode,
    temperature: Number(options.form.temperature || options.defaults.temperature),
    maxTokens: Number(options.form.maxTokens || options.defaults.maxTokens),
    maxIterations: options.defaults.maxIterations,
    limit: options.defaults.limit,
    toolChoice: options.form.toolChoice || options.defaults.toolChoice,
    status: "draft",
    answerPreview: "",
    updatedAt: timestamp,
    ...(options.seed || {}),
  };
}

export function agentExploreFormFromSession(
  session: AgentExploreSession,
  options: {
    currentForm: AgentExploreFormState;
    defaults: AgentExploreFormDefaults;
    hasAgentModelOption: (value?: string) => boolean;
    normalizeThinkingMode: (value?: string) => string;
    preferCurrentLimits?: boolean;
    workspaceId?: string;
  },
): AgentExploreFormState {
  const preferCurrentLimits = options.preferCurrentLimits !== false;
  return {
    query: session.query,
    modelAlias: options.hasAgentModelOption(session.modelAlias) ? session.modelAlias : "",
    contextProfileId: session.contextProfileId || options.currentForm.contextProfileId,
    thinkingMode: options.normalizeThinkingMode(session.thinkingMode || options.currentForm.thinkingMode),
    temperature: Number(session.temperature || options.currentForm.temperature || options.defaults.temperature),
    maxTokens: Number(session.maxTokens || options.currentForm.maxTokens || options.defaults.maxTokens),
    maxIterations:
      session.maxIterations ||
      (preferCurrentLimits ? options.currentForm.maxIterations : 0) ||
      options.defaults.maxIterations,
    limit:
      session.limit ||
      (preferCurrentLimits ? options.currentForm.limit : 0) ||
      options.defaults.limit,
    toolChoice: session.toolChoice || options.currentForm.toolChoice || options.defaults.toolChoice,
    workspaceId: options.workspaceId ?? session.workspaceId,
  };
}

export function readAgentExplorePersistence(
  storageKey = AGENT_EXPLORE_STORAGE_KEY,
  storage: Storage | undefined = globalThis.localStorage,
) {
  try {
    const parsed = JSON.parse(storage?.getItem(storageKey) || "{}");
    return asRecord(parsed) || {};
  } catch {
    return {};
  }
}

export function writeAgentExplorePersistence(
  payload: Record<string, unknown>,
  storageKey = AGENT_EXPLORE_STORAGE_KEY,
  storage: Storage | undefined = globalThis.localStorage,
) {
  try {
    storage?.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Local persistence is a UI convenience; storage errors should not block exploration.
  }
}

export function clearInvalidAgentExploreModelReferencesCore(
  options: {
    draftTabs: AgentExploreSession[];
    history: AgentExploreSession[];
    result: AgentExploreRunResponse | null;
    hasAgentModelOption: (value?: string) => boolean;
    sanitizeSession: (session: AgentExploreSession) => AgentExploreSession;
  },
) {
  let changed = false;
  const sanitizeList = (sessions: AgentExploreSession[]) =>
    sessions.map((session) => {
      const sanitized = options.sanitizeSession(session);
      if (sanitized.modelAlias !== session.modelAlias) {
        changed = true;
      }
      return sanitized;
    });
  const activeSession = asRecord(options.result?.run);
  const activeInput = asRecord(activeSession?.input);
  if (activeInput?.modelAlias && !options.hasAgentModelOption(String(activeInput.modelAlias))) {
    activeInput.modelAlias = "";
  }
  return {
    draftTabs: sanitizeList(options.draftTabs),
    history: sanitizeList(options.history),
    changed,
  };
}

export function syncActiveAgentExploreDraftFromFormCore(
  options: {
    activeTabId: string;
    draftTabs: AgentExploreSession[];
    form: AgentExploreFormState;
    contextProfileId: string;
    thinkingMode: string;
    normalizeHistory: (sessions: AgentExploreSession[]) => AgentExploreSession[];
  },
) {
  const tabId = options.activeTabId;
  if (!tabId.startsWith("draft:")) {
    return options.draftTabs;
  }
  const existing = options.draftTabs.find((item) => item.runId === tabId);
  if (!existing) {
    return options.draftTabs;
  }
  return options.normalizeHistory(
    options.draftTabs.map((item) =>
      item.runId === tabId
        ? {
            ...item,
            query: options.form.query,
            modelAlias: options.form.modelAlias,
            contextProfileId: options.contextProfileId,
            thinkingMode: options.thinkingMode,
            temperature: options.form.temperature,
            maxTokens: options.form.maxTokens,
            maxIterations: options.form.maxIterations,
            limit: options.form.limit,
            toolChoice: options.form.toolChoice,
            updatedAt: item.updatedAt,
          }
        : item,
    ),
  );
}

export function upsertAgentExploreHistoryCore(
  options: {
    session: AgentExploreSession | null;
    hiddenRunIds: Set<string>;
    draftTabs: AgentExploreSession[];
    history: AgentExploreSession[];
    normalizeHistory: (sessions: AgentExploreSession[]) => AgentExploreSession[];
  },
) {
  const session = options.session;
  if (!session || options.hiddenRunIds.has(session.runId)) {
    return {
      draftTabs: options.draftTabs,
      history: options.history,
      changed: false,
    };
  }
  if (isAgentExploreDraftSession(session)) {
    return {
      draftTabs: options.normalizeHistory([
        session,
        ...options.draftTabs.filter((item) => item.runId !== session.runId),
      ]),
      history: options.history,
      changed: true,
    };
  }
  const existingIndex = options.history.findIndex((item) => item.runId === session.runId);
  const nextHistory =
    existingIndex >= 0
      ? options.history.map((item, index) => (index === existingIndex ? session : item))
      : [session, ...options.history];
  return {
    draftTabs: options.draftTabs,
    history: options.normalizeHistory(nextHistory),
    changed: true,
  };
}

export function removeAgentExploreSessionStateCore(
  options: {
    session: AgentExploreSession;
    hiddenRunIds: Set<string>;
    closedTabIds: Set<string>;
    draftTabs: AgentExploreSession[];
    history: AgentExploreSession[];
    normalizeHistory: (sessions: AgentExploreSession[]) => AgentExploreSession[];
  },
) {
  const runId = String(options.session.runId || "").trim();
  return {
    runId,
    hiddenRunIds: runId
      ? new Set([...options.hiddenRunIds, runId])
      : options.hiddenRunIds,
    closedTabIds: new Set(
      [...options.closedTabIds].filter((item) => item !== runId),
    ),
    draftTabs: options.normalizeHistory(
      options.draftTabs.filter((item) => item.runId !== runId),
    ),
    history: options.normalizeHistory(
      options.history.filter((item) => item.runId !== runId),
    ),
  };
}

export function closeAgentExploreTabStateCore(
  options: {
    session: AgentExploreSession;
    closedTabIds: Set<string>;
    draftTabs: AgentExploreSession[];
    normalizeHistory: (sessions: AgentExploreSession[]) => AgentExploreSession[];
  },
) {
  const runId = String(options.session.runId || "").trim();
  if (!runId) {
    return {
      runId,
      closedTabIds: options.closedTabIds,
      draftTabs: options.draftTabs,
    };
  }
  return {
    runId,
    closedTabIds: isAgentExploreDraftSession(options.session)
      ? options.closedTabIds
      : new Set([...options.closedTabIds, runId]),
    draftTabs: isAgentExploreDraftSession(options.session)
      ? options.normalizeHistory(
          options.draftTabs.filter((item) => item.runId !== runId),
        )
      : options.draftTabs,
  };
}

export function agentExploreHistoryPanelItemsCore(
  sessions: AgentExploreSession[],
  options: {
    activeTabId: string;
    isBusy: (session: AgentExploreSession) => boolean;
    sessionLabel: (session: AgentExploreSession) => string;
  },
): HistorySessionPanelItem[] {
  return sessions.map((session) => {
    const label = options.sessionLabel(session);
    return {
      id: session.runId,
      title: label,
      meta: `${session.status || "unknown"} · ${shortId(session.runId)}`,
      preview: session.answerPreview || "",
      active: session.runId === options.activeTabId,
      disabled: options.isBusy(session),
      deleteLabel: `删除历史会话 ${label}`,
    };
  });
}

export function agentExploreSessionsFromWorkspaceDetailsCore(
  details: unknown[],
  options: {
    currentForm: AgentExploreFormState;
    normalizeThinkingMode: (value?: string) => string;
  },
) {
  return details
    .flatMap((detail) => {
      const detailValue = asRecord(detail);
      if (!detailValue) {
        return [];
      }
      const workspace = asRecord(detailValue.workspace) || {};
      const runs = Array.isArray(detailValue.runs) ? detailValue.runs : [];
      return runs
        .filter((run) => String(asRecord(run)?.runType || "") === "knowledge_agent_exploration")
        .map((run) =>
          agentExploreSessionFromResultCore({
            protocolVersion: "",
            ok: String(asRecord(run)?.status || "") !== "failed",
            workspace,
            run: asRecord(run) || {},
            answer: String(asRecord(asRecord(run)?.coverage)?.answer || ""),
          }, options),
        )
        .filter(Boolean) as AgentExploreSession[];
    })
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
    .slice(0, 20);
}

export function agentExplorePersistencePayloadCore(
  options: {
    activeTabId: string;
    activeSession: AgentExploreSession | null;
    form: AgentExploreFormState;
    draftTabs: AgentExploreSession[];
    history: AgentExploreSession[];
    hiddenRunIds: Set<string>;
    closedTabIds: Set<string>;
  },
) {
  const activeTabId =
    options.activeTabId ||
    options.activeSession?.runId ||
    (options.form.workspaceId ? "" : options.draftTabs[0]?.runId || "");
  return {
    activeRunId: options.activeSession?.runId || "",
    activeTabId,
    activeWorkspaceId: options.activeSession?.workspaceId || options.form.workspaceId || "",
    form: { ...options.form },
    draftTabs: options.draftTabs,
    history: options.history,
    hiddenRunIds: Array.from(options.hiddenRunIds),
    closedTabIds: Array.from(options.closedTabIds),
  };
}

export function agentExploreFormFromPersistenceCore(
  persisted: Record<string, unknown>,
  options: {
    currentForm: AgentExploreFormState;
    defaults: AgentExploreFormDefaults;
    hasAgentModelOption: (value?: string) => boolean;
    normalizeThinkingMode: (value?: string) => string;
  },
): AgentExploreFormState {
  const persistedForm = asRecord(persisted.form) || {};
  const persistedModelAlias = String(persistedForm.modelAlias || options.currentForm.modelAlias || "");
  return {
    query: String(persistedForm.query || options.currentForm.query || ""),
    modelAlias: options.hasAgentModelOption(persistedModelAlias) ? persistedModelAlias : "",
    contextProfileId: String(persistedForm.contextProfileId || options.currentForm.contextProfileId || "context-128k"),
    thinkingMode: options.normalizeThinkingMode(
      String(persistedForm.thinkingMode || options.currentForm.thinkingMode || "default"),
    ),
    temperature: Number(persistedForm.temperature || options.currentForm.temperature || options.defaults.temperature),
    maxTokens: Number(persistedForm.maxTokens || options.currentForm.maxTokens || options.defaults.maxTokens),
    maxIterations: Number(persistedForm.maxIterations || options.currentForm.maxIterations || options.defaults.maxIterations),
    limit: Number(persistedForm.limit || options.currentForm.limit || options.defaults.limit),
    toolChoice: String(persistedForm.toolChoice || options.currentForm.toolChoice || options.defaults.toolChoice),
    workspaceId: String(persistedForm.workspaceId || persisted.activeWorkspaceId || options.currentForm.workspaceId || ""),
  };
}
