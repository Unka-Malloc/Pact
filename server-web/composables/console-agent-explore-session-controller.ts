import { computed, type ComputedRef, type Ref } from "vue";
import { bridge } from "../lib/bridge";
import type { AgentExploreRunResponse } from "../lib/types";
import type { AgentExploreSession, HistorySessionPanelItem } from "../types/app";
import { asRecord } from "./console-model-utils";
import { formatCompactDate } from "./console-format-utils";
import {
  agentExploreFormFromPersistenceCore,
  agentExploreFormFromSession,
  agentExploreHistoryPanelItemsCore,
  agentExplorePersistencePayloadCore,
  agentExploreRunStatus,
  agentExploreSessionsFromWorkspaceDetailsCore,
  agentExploreSessionFromResultCore,
  clearInvalidAgentExploreModelReferencesCore,
  closeAgentExploreTabStateCore,
  createAgentExploreDraftSession,
  isAgentExploreDraftSession,
  normalizeAgentExploreHistoryListCore,
  normalizeAgentExploreRun,
  readAgentExplorePersistence,
  removeAgentExploreSessionStateCore,
  sanitizeAgentExploreSessionModelReference as sanitizeAgentExploreSessionModelReferenceCore,
  syncActiveAgentExploreDraftFromFormCore,
  upsertAgentExploreHistoryCore,
  writeAgentExplorePersistence,
  type AgentExploreFormDefaults,
  type AgentExploreFormState,
} from "./console-agent-explore-utils";

type AgentExploreContextProfile = {
  value: string;
};

type ConsoleAgentExploreSessionControllerOptions = {
  agentExploreActiveTabId: Ref<string>;
  agentExploreClosedTabIds: Ref<Set<string>>;
  agentExploreDraftTabs: Ref<AgentExploreSession[]>;
  agentExploreForm: Ref<AgentExploreFormState>;
  agentExploreHiddenRunIds: Ref<Set<string>>;
  agentExploreHistory: Ref<AgentExploreSession[]>;
  agentExploreHydrated: Ref<boolean>;
  agentExploreResult: Ref<AgentExploreRunResponse | null>;
  agentExploreTraceOpen: Ref<boolean>;
  busyKey: ComputedRef<string>;
  clearAllBusy: () => void;
  error: Ref<string>;
  hasAgentModelOption: (value?: string) => boolean;
  selectedAgentExploreContextProfile: ComputedRef<AgentExploreContextProfile>;
  selectedAgentExploreThinkingMode: ComputedRef<string>;
  setBusy: (key: string) => void;
  validAgentModelAlias: (value?: string) => string;
  agentExploreDefaults: () => AgentExploreFormDefaults;
  normalizeThinkingMode: (value?: string) => string;
};

export function createConsoleAgentExploreSessionController(options: ConsoleAgentExploreSessionControllerOptions) {
  let agentExplorePollTimer: number | null = null;

  function agentExploreSessionFromResult(
    result: AgentExploreRunResponse | null,
    fallback: Partial<AgentExploreSession> = {},
  ): AgentExploreSession | null {
    return agentExploreSessionFromResultCore(result, {
      fallback,
      currentForm: options.agentExploreForm.value,
      normalizeThinkingMode: options.normalizeThinkingMode,
    });
  }

  function sanitizeAgentExploreSessionModelReference(session: AgentExploreSession): AgentExploreSession {
    return sanitizeAgentExploreSessionModelReferenceCore(session, options.validAgentModelAlias);
  }

  function clearInvalidAgentExploreModelReferences() {
    const result = clearInvalidAgentExploreModelReferencesCore({
      draftTabs: options.agentExploreDraftTabs.value,
      history: options.agentExploreHistory.value,
      result: options.agentExploreResult.value,
      hasAgentModelOption: options.hasAgentModelOption,
      sanitizeSession: sanitizeAgentExploreSessionModelReference,
    });
    options.agentExploreDraftTabs.value = result.draftTabs;
    options.agentExploreHistory.value = result.history;
    if (result.changed) {
      persistAgentExploreState();
    }
  }

  function normalizeAgentExploreHistoryList(sessions: AgentExploreSession[]) {
    return normalizeAgentExploreHistoryListCore(sessions, {
      hiddenRunIds: options.agentExploreHiddenRunIds.value,
      validAgentModelAlias: options.validAgentModelAlias,
    });
  }

  const agentExploreTabs = computed(() =>
    normalizeAgentExploreHistoryList([
      ...options.agentExploreDraftTabs.value,
      ...options.agentExploreHistory.value,
    ]).filter((session) => !options.agentExploreClosedTabIds.value.has(session.runId)),
  );

  function createAgentExploreDraftTab(seed: Partial<AgentExploreSession> = {}): AgentExploreSession {
    return createAgentExploreDraftSession({
      form: options.agentExploreForm.value,
      contextProfileId: options.selectedAgentExploreContextProfile.value.value,
      thinkingMode: options.selectedAgentExploreThinkingMode.value,
      defaults: options.agentExploreDefaults(),
      seed,
    });
  }

  function syncActiveAgentExploreDraftFromForm() {
    options.agentExploreDraftTabs.value = syncActiveAgentExploreDraftFromFormCore({
      activeTabId: options.agentExploreActiveTabId.value,
      draftTabs: options.agentExploreDraftTabs.value,
      form: options.agentExploreForm.value,
      contextProfileId: options.selectedAgentExploreContextProfile.value.value,
      thinkingMode: options.selectedAgentExploreThinkingMode.value,
      normalizeHistory: normalizeAgentExploreHistoryList,
    });
  }

  function upsertAgentExploreHistory(session: AgentExploreSession | null) {
    const nextState = upsertAgentExploreHistoryCore({
      session,
      hiddenRunIds: options.agentExploreHiddenRunIds.value,
      draftTabs: options.agentExploreDraftTabs.value,
      history: options.agentExploreHistory.value,
      normalizeHistory: normalizeAgentExploreHistoryList,
    });
    options.agentExploreDraftTabs.value = nextState.draftTabs;
    options.agentExploreHistory.value = nextState.history;
  }

  function deleteAgentExploreHistorySession(session: AgentExploreSession) {
    const nextState = removeAgentExploreSessionStateCore({
      session,
      hiddenRunIds: options.agentExploreHiddenRunIds.value,
      closedTabIds: options.agentExploreClosedTabIds.value,
      draftTabs: options.agentExploreDraftTabs.value,
      history: options.agentExploreHistory.value,
      normalizeHistory: normalizeAgentExploreHistoryList,
    });
    const runId = nextState.runId;
    if (!runId) {
      return;
    }
    options.agentExploreHiddenRunIds.value = nextState.hiddenRunIds;
    options.agentExploreClosedTabIds.value = nextState.closedTabIds;
    options.agentExploreDraftTabs.value = nextState.draftTabs;
    options.agentExploreHistory.value = nextState.history;
    const activeRunId = String(asRecord(options.agentExploreResult.value?.run)?.runId || "");
    if (activeRunId === runId || options.agentExploreActiveTabId.value === runId) {
      stopAgentExplorePolling();
      options.agentExploreResult.value = null;
      options.agentExploreForm.value.workspaceId = "";
      options.agentExploreActiveTabId.value = "";
      if (options.busyKey.value === "knowledge:agent-explore" || options.busyKey.value === `knowledge:agent-explore:load:${runId}`) {
        options.clearAllBusy();
      }
      const nextTab = agentExploreTabs.value[0];
      if (nextTab) {
        void switchAgentExploreTab(nextTab);
      }
    }
    persistAgentExploreState();
  }

  function agentExploreTabBusy(session: AgentExploreSession) {
    return options.busyKey.value === `knowledge:agent-explore:load:${session.runId}`;
  }

  function agentExploreSessionLabel(session: AgentExploreSession) {
    const time = formatCompactDate(session.updatedAt);
    return `${time ? `${time} · ` : ""}${session.query || "未命名探索"}`;
  }

  const agentExploreHistoryPanelItems = computed<HistorySessionPanelItem[]>(() =>
    agentExploreHistoryPanelItemsCore(options.agentExploreHistory.value, {
      activeTabId: options.agentExploreActiveTabId.value,
      isBusy: agentExploreTabBusy,
      sessionLabel: agentExploreSessionLabel,
    }),
  );

  function selectAgentExploreHistoryItem(runId: string) {
    const session = options.agentExploreHistory.value.find((item) => item.runId === runId);
    if (session) {
      void switchAgentExploreTab(session);
    }
  }

  function deleteAgentExploreHistoryItem(runId: string) {
    const session = options.agentExploreHistory.value.find((item) => item.runId === runId);
    if (session) {
      deleteAgentExploreHistorySession(session);
    }
  }

  function closeAgentExploreTab(session: AgentExploreSession) {
    const nextState = closeAgentExploreTabStateCore({
      session,
      closedTabIds: options.agentExploreClosedTabIds.value,
      draftTabs: options.agentExploreDraftTabs.value,
      normalizeHistory: normalizeAgentExploreHistoryList,
    });
    const runId = nextState.runId;
    if (!runId) {
      return;
    }
    const wasActive =
      options.agentExploreActiveTabId.value === runId ||
      String(asRecord(options.agentExploreResult.value?.run)?.runId || "") === runId;
    options.agentExploreClosedTabIds.value = nextState.closedTabIds;
    options.agentExploreDraftTabs.value = nextState.draftTabs;

    if (wasActive) {
      stopAgentExplorePolling();
      options.agentExploreResult.value = null;
      options.agentExploreForm.value.workspaceId = "";
      options.agentExploreActiveTabId.value = "";
      if (options.busyKey.value === "knowledge:agent-explore" || options.busyKey.value === `knowledge:agent-explore:load:${runId}`) {
        options.clearAllBusy();
      }
      const nextTab = agentExploreTabs.value[0];
      if (nextTab) {
        void switchAgentExploreTab(nextTab);
      } else {
        const draft = createAgentExploreDraftTab({
          modelAlias: options.agentExploreForm.value.modelAlias,
          contextProfileId: options.agentExploreForm.value.contextProfileId,
        });
        options.agentExploreDraftTabs.value = [draft];
        applyAgentExploreDraftTab(draft);
      }
    }
    persistAgentExploreState();
  }

  async function loadAgentExploreHistoryFromServer() {
    try {
      const list = await bridge.listAgentWorkspaces({
        limit: 30,
        includeSummary: false,
      });
      const workspaceIds = (list.workspaces || [])
        .filter((workspace) => {
          const metadata = asRecord(workspace.metadata) || {};
          return String(metadata.createdBy || "") === "knowledge.agent-explore";
        })
        .map((workspace) => String(workspace.workspaceId || ""))
        .filter(Boolean)
        .slice(0, 12);
      const details = await Promise.all(
        workspaceIds.map((workspaceId) =>
          bridge.getAgentWorkspace(workspaceId).catch(() => null),
        ),
      );
      const sessions = agentExploreSessionsFromWorkspaceDetailsCore(details, {
        currentForm: options.agentExploreForm.value,
        normalizeThinkingMode: options.normalizeThinkingMode,
      });
      const visibleSessions = normalizeAgentExploreHistoryList(sessions);
      if (visibleSessions.length) {
        options.agentExploreHistory.value = visibleSessions;
      }
      return visibleSessions;
    } catch {
      return [];
    }
  }

  function persistAgentExploreState() {
    if (!options.agentExploreHydrated.value) {
      return;
    }
    syncActiveAgentExploreDraftFromForm();
    const activeSession = agentExploreSessionFromResult(options.agentExploreResult.value);
    upsertAgentExploreHistory(activeSession);
    writeAgentExplorePersistence(
      agentExplorePersistencePayloadCore({
        activeTabId: options.agentExploreActiveTabId.value,
        activeSession,
        form: options.agentExploreForm.value,
        draftTabs: options.agentExploreDraftTabs.value,
        history: options.agentExploreHistory.value,
        hiddenRunIds: options.agentExploreHiddenRunIds.value,
        closedTabIds: options.agentExploreClosedTabIds.value,
      }),
    );
  }

  function applyAgentExploreDraftTab(session: AgentExploreSession) {
    stopAgentExplorePolling();
    options.agentExploreTraceOpen.value = true;
    options.agentExploreActiveTabId.value = session.runId;
    options.agentExploreResult.value = null;
    options.agentExploreForm.value = agentExploreFormFromSession(session, {
      currentForm: options.agentExploreForm.value,
      defaults: options.agentExploreDefaults(),
      hasAgentModelOption: options.hasAgentModelOption,
      normalizeThinkingMode: options.normalizeThinkingMode,
      preferCurrentLimits: false,
      workspaceId: "",
    });
    if (options.busyKey.value === "knowledge:agent-explore") {
      options.clearAllBusy();
    }
    persistAgentExploreState();
  }

  async function switchAgentExploreTab(session: AgentExploreSession) {
    if (options.agentExploreClosedTabIds.value.has(session.runId)) {
      options.agentExploreClosedTabIds.value = new Set(
        [...options.agentExploreClosedTabIds.value].filter((item) => item !== session.runId),
      );
    }
    if (isAgentExploreDraftSession(session)) {
      applyAgentExploreDraftTab(session);
      return;
    }
    options.agentExploreActiveTabId.value = session.runId;
    await loadAgentExploreSession(session);
  }

  async function loadAgentExploreSession(session: AgentExploreSession) {
    stopAgentExplorePolling();
    options.agentExploreTraceOpen.value = true;
    options.setBusy(`knowledge:agent-explore:load:${session.runId}`);
    options.error.value = "";
    options.agentExploreActiveTabId.value = session.runId;
    try {
      options.agentExploreForm.value = agentExploreFormFromSession(session, {
        currentForm: options.agentExploreForm.value,
        defaults: options.agentExploreDefaults(),
        hasAgentModelOption: options.hasAgentModelOption,
        normalizeThinkingMode: options.normalizeThinkingMode,
      });
      const result = normalizeAgentExploreRun(
        await bridge.getKnowledgeAgentExploreRun(session.runId, {
          workspaceId: session.workspaceId,
        }),
      );
      options.agentExploreResult.value = result;
      upsertAgentExploreHistory(agentExploreSessionFromResult(result, session));
      if (["queued", "running"].includes(agentExploreRunStatus(result))) {
        startAgentExplorePolling(session.runId, session.workspaceId);
      }
      persistAgentExploreState();
    } catch (nextError) {
      options.error.value = nextError instanceof Error ? nextError.message : "恢复智能检索会话失败。";
    } finally {
      if (options.busyKey.value === `knowledge:agent-explore:load:${session.runId}`) {
        options.clearAllBusy();
      }
    }
  }

  async function restoreAgentExploreState() {
    const persisted = readAgentExplorePersistence();
    const history = Array.isArray(persisted.history)
      ? (persisted.history as AgentExploreSession[]).filter((item) => item?.runId && item?.workspaceId)
      : [];
    const draftTabs = Array.isArray(persisted.draftTabs)
      ? (persisted.draftTabs as AgentExploreSession[]).filter((item) => isAgentExploreDraftSession(item))
      : [];
    options.agentExploreHiddenRunIds.value = new Set(
      Array.isArray(persisted.hiddenRunIds)
        ? persisted.hiddenRunIds.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
    );
    options.agentExploreClosedTabIds.value = new Set(
      Array.isArray(persisted.closedTabIds)
        ? persisted.closedTabIds.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
    );
    options.agentExploreDraftTabs.value = normalizeAgentExploreHistoryList(draftTabs);
    options.agentExploreHistory.value = normalizeAgentExploreHistoryList(history);
    if (!options.agentExploreHistory.value.length) {
      await loadAgentExploreHistoryFromServer();
    }
    options.agentExploreForm.value = agentExploreFormFromPersistenceCore(persisted, {
      currentForm: options.agentExploreForm.value,
      defaults: options.agentExploreDefaults(),
      hasAgentModelOption: options.hasAgentModelOption,
      normalizeThinkingMode: options.normalizeThinkingMode,
    });
    options.agentExploreHydrated.value = true;
    if (!agentExploreTabs.value.length) {
      const draft = createAgentExploreDraftTab({
        query: options.agentExploreForm.value.query,
        modelAlias: options.agentExploreForm.value.modelAlias,
        contextProfileId: options.agentExploreForm.value.contextProfileId,
        thinkingMode: options.agentExploreForm.value.thinkingMode,
        temperature: options.agentExploreForm.value.temperature,
        maxTokens: options.agentExploreForm.value.maxTokens,
        maxIterations: options.agentExploreForm.value.maxIterations,
        limit: options.agentExploreForm.value.limit,
        toolChoice: options.agentExploreForm.value.toolChoice,
      });
      options.agentExploreDraftTabs.value = [draft];
      options.agentExploreActiveTabId.value = draft.runId;
      persistAgentExploreState();
      return;
    }
    const latestServerSession = options.agentExploreHistory.value[0];
    const persistedActiveTabId = String(persisted.activeTabId || persisted.activeRunId || latestServerSession?.runId || "").trim();
    const activeTabId = options.agentExploreClosedTabIds.value.has(persistedActiveTabId)
      ? ""
      : persistedActiveTabId;
    const activeDraft = activeTabId
      ? options.agentExploreDraftTabs.value.find((item) => item.runId === activeTabId)
      : null;
    if (activeDraft && !options.agentExploreHiddenRunIds.value.has(activeDraft.runId)) {
      applyAgentExploreDraftTab(activeDraft);
      return;
    }
    const activeRunId = activeTabId;
    const activeHistorySession = activeRunId
      ? options.agentExploreHistory.value.find((item) => item.runId === activeRunId)
      : null;
    const activeWorkspaceId = String(
      persisted.activeWorkspaceId ||
        activeHistorySession?.workspaceId ||
        options.agentExploreForm.value.workspaceId ||
        latestServerSession?.workspaceId ||
        "",
    ).trim();
    if (activeRunId && activeWorkspaceId && !options.agentExploreHiddenRunIds.value.has(activeRunId)) {
      const session =
        activeHistorySession || {
          runId: activeRunId,
          workspaceId: activeWorkspaceId,
          query: options.agentExploreForm.value.query,
          modelAlias: options.agentExploreForm.value.modelAlias,
          contextProfileId: options.agentExploreForm.value.contextProfileId,
          thinkingMode: options.agentExploreForm.value.thinkingMode,
          temperature: options.agentExploreForm.value.temperature,
          maxTokens: options.agentExploreForm.value.maxTokens,
          maxIterations: options.agentExploreForm.value.maxIterations,
          limit: options.agentExploreForm.value.limit,
          toolChoice: options.agentExploreForm.value.toolChoice,
          status: "",
          answerPreview: "",
          updatedAt: new Date().toISOString(),
        };
      await loadAgentExploreSession(session);
      return;
    }
    if (agentExploreTabs.value[0]) {
      await switchAgentExploreTab(agentExploreTabs.value[0]);
      return;
    }
    persistAgentExploreState();
  }

  function stopAgentExplorePolling() {
    if (agentExplorePollTimer) {
      window.clearInterval(agentExplorePollTimer);
      agentExplorePollTimer = null;
    }
  }

  function startAgentExplorePolling(runId: string, workspaceId: string) {
    stopAgentExplorePolling();
    const poll = async () => {
      try {
        const result = normalizeAgentExploreRun(
          await bridge.getKnowledgeAgentExploreRun(runId, {
            workspaceId,
          }),
        );
        options.agentExploreResult.value = result;
        persistAgentExploreState();
        const status = agentExploreRunStatus(result);
        if (!["queued", "running"].includes(status)) {
          stopAgentExplorePolling();
          if (options.busyKey.value === "knowledge:agent-explore") {
            options.clearAllBusy();
          }
          if (result.ok === false && result.error) {
            options.error.value = result.error;
          }
        }
      } catch (nextError) {
        stopAgentExplorePolling();
        if (options.busyKey.value === "knowledge:agent-explore") {
          options.clearAllBusy();
        }
        options.error.value = nextError instanceof Error ? nextError.message : "智能检索状态刷新失败。";
      }
    };
    void poll();
    agentExplorePollTimer = window.setInterval(() => {
      void poll();
    }, 750);
  }

  return {
    agentExploreHistoryPanelItems,
    agentExplorePollTimer,
    agentExploreSessionFromResult,
    agentExploreSessionLabel,
    agentExploreTabBusy,
    agentExploreTabs,
    applyAgentExploreDraftTab,
    clearInvalidAgentExploreModelReferences,
    closeAgentExploreTab,
    createAgentExploreDraftTab,
    deleteAgentExploreHistoryItem,
    deleteAgentExploreHistorySession,
    loadAgentExploreHistoryFromServer,
    loadAgentExploreSession,
    normalizeAgentExploreHistoryList,
    persistAgentExploreState,
    restoreAgentExploreState,
    sanitizeAgentExploreSessionModelReference,
    selectAgentExploreHistoryItem,
    startAgentExplorePolling,
    stopAgentExplorePolling,
    switchAgentExploreTab,
    syncActiveAgentExploreDraftFromForm,
    upsertAgentExploreHistory,
  };
}
