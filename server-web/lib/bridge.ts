import type {
  AgentSettings,
  AgentGatewayCallRequest,
  AgentGatewayCallResponse,
  AgentGatewayConfig,
  AgentExploreRunResponse,
  AgentRegistryResponse,
  AgentSyncConfig,
  AgentSyncPublishRequest,
  BackgroundProcessStatus,
  ClientRuntimeStatus,
  ClientMigrationCommandResponse,
  ConsoleAuditItem,
  ConsoleAuthSummary,
  ConsoleOidcConfig,
  ConsoleUser,
  CodexOAuthLogin,
  CodexOAuthStatus,
  DiscoveryConfig,
  DiscoveryConfigResponse,
  DiscoveryClientsResponse,
  EmailRuleSetResponse,
  EventSubscriptionResponse,
  ExpertVocabularyHistoryResponse,
  ExpertVocabularyResponse,
  EvidencePack,
  KnowledgeConfigSchema,
  KnowledgeConsoleState,
  KnowledgeReviewItem,
  KnowledgeReviewItemsResponse,
  KnowledgeRuleAuthoringResponse,
  KnowledgeSourceMutationResponse,
  KnowledgeSourceState,
  KnowledgeSearchResponse,
  MaintenanceAgentConfig,
  MaintenanceAgentRun,
  MaintenanceAgentSummary,
  MaintenanceSettings,
  MonitorAlertConfig,
  MonitorAlertState,
  ModelProbeResponse,
  RenderMarkdownResponse,
  ServerPathBrowseResponse,
  RuntimeMountReloadResponse,
  RuntimeMountConfig,
  RuntimeMountsResponse,
  RuntimeInfoResponse,
  ServerConsoleState,
  SplitJob,
  SplitJobListResponse,
  SplitPayload,
  SplitResult,
  ToolManagementAuditResponse,
  ToolManagementCatalog,
  ToolManagementGrantIssue,
  ToolManagementGrantsResponse,
  ToolManagementMetricsResponse,
  UploadSessionResponse
} from "./types";

type Bridge = {
  getAuthSession: () => Promise<ConsoleAuthSummary>;
  loginAuth: (payload: { username: string; password: string }) => Promise<ConsoleAuthSummary & { ok: boolean }>;
  logoutAuth: () => Promise<{ ok: boolean }>;
  listAuthUsers: () => Promise<{ users: ConsoleUser[]; roles: ConsoleAuthSummary["roles"] }>;
  updateAuthUser: (
    userId: string,
    payload: { displayName?: string; password?: string; roleId?: string; enabled?: boolean },
  ) => Promise<{ user: ConsoleUser; users: ConsoleUser[] }>;
  getAuthOidc: () => Promise<{ oidc: ConsoleOidcConfig }>;
  saveAuthOidc: (payload: Partial<ConsoleOidcConfig> & { clientSecret?: string }) => Promise<{ oidc: ConsoleOidcConfig }>;
  listAuthAudit: (limit?: number) => Promise<{ items: ConsoleAuditItem[] }>;
  listAuthSessions: () => Promise<{ sessions: Array<Record<string, unknown>> }>;
  revokeAuthSession: (sessionId: string) => Promise<{ ok: boolean }>;
  getSettings: () => Promise<AgentSettings>;
  saveSettings: (settings: AgentSettings) => Promise<AgentSettings>;
  probeModel: (payload: {
    provider: string;
    modelAlias?: string;
    settings?: AgentSettings;
  }) => Promise<ModelProbeResponse>;
  getAgentGatewayConfig: () => Promise<{ config: AgentGatewayConfig }>;
  saveAgentGatewayConfig: (config: Partial<AgentGatewayConfig>) => Promise<{ config: AgentGatewayConfig }>;
  callAgentGateway: (payload: AgentGatewayCallRequest) => Promise<AgentGatewayCallResponse>;
  listAgents: () => Promise<AgentRegistryResponse>;
  runKnowledgeAgentExplore: (payload: Record<string, unknown>) => Promise<AgentExploreRunResponse>;
  getKnowledgeAgentExploreRun: (runId: string, params?: { workspaceId?: string }) => Promise<AgentExploreRunResponse>;
  listAgentWorkspaces: (params?: { limit?: number; includeSummary?: boolean }) => Promise<{ workspaces: Array<Record<string, unknown>>; count: number }>;
  getAgentWorkspace: (workspaceId: string, params?: { includePrivate?: boolean }) => Promise<Record<string, unknown>>;
  getAgentSyncConfig: () => Promise<{ config: AgentSyncConfig }>;
  saveAgentSyncConfig: (config: Partial<AgentSyncConfig>) => Promise<{ config: AgentSyncConfig }>;
  publishAgentSync: (payload: AgentSyncPublishRequest) => Promise<Record<string, unknown>>;
  subscribeAgentSync: (params?: {
    cursor?: number;
    topic?: string;
    timeoutMs?: number;
    includeSnapshot?: boolean;
  }) => Promise<EventSubscriptionResponse>;
  getCodexOAuthStatus: () => Promise<CodexOAuthStatus>;
  startCodexOAuthLogin: () => Promise<CodexOAuthLogin>;
  getRuntimeInfo: () => Promise<RuntimeInfoResponse>;
  browseServerPath: (payload: {
    path?: string;
    mode?: "directory" | "file";
    extensions?: string[];
    includeHidden?: boolean;
  }) => Promise<ServerPathBrowseResponse>;
  saveRuntimeMounts: (payload: Partial<RuntimeMountConfig>) => Promise<RuntimeMountsResponse>;
  reloadRuntimeMounts: (settings?: AgentSettings) => Promise<RuntimeMountReloadResponse>;
  getServerConsoleState: () => Promise<ServerConsoleState>;
  getMaintenanceAgentConfig: () => Promise<{ path: string; config: MaintenanceAgentConfig }>;
  saveMaintenanceAgentConfig: (config: Partial<MaintenanceAgentConfig>) => Promise<{ config: MaintenanceAgentConfig }>;
  chatMaintenanceAgent: (payload: {
    message: string;
    modelAlias?: string;
    agentName?: string;
    wait?: boolean;
  }) => Promise<{ plan: MaintenanceAgentRun["plan"]; run: MaintenanceAgentRun }>;
  startMaintenanceAgentRun: (payload: {
    runbook?: string;
    wait?: boolean;
  }) => Promise<MaintenanceAgentRun>;
  listMaintenanceAgentRuns: (limit?: number) => Promise<{
    items: MaintenanceAgentRun[];
    activeRunId: string;
    queuedRunIds: string[];
  }>;
  getMaintenanceAgentRun: (runId: string) => Promise<{ run: MaintenanceAgentRun }>;
  approveMaintenanceAgentRun: (
    runId: string,
    payload: { planHash: string; wait?: boolean },
  ) => Promise<{ run: MaintenanceAgentRun }>;
  cancelMaintenanceAgentRun: (
    runId: string,
    payload?: { reason?: string },
  ) => Promise<{ run: MaintenanceAgentRun }>;
  getMaintenanceAgentSummaryFromState?: () => Promise<MaintenanceAgentSummary | null>;
  getBackgroundProcesses: () => Promise<BackgroundProcessStatus>;
  getClientRuntimeStatus: () => Promise<ClientRuntimeStatus>;
  getMonitorAlerts: () => Promise<MonitorAlertState>;
  saveMonitorAlertConfig: (config: MonitorAlertConfig) => Promise<MonitorAlertState>;
  acknowledgeMonitorAlert: (alertId: string) => Promise<MonitorAlertState>;
  subscribeEvents: (params?: {
    cursor?: number;
    topic?: string;
    timeoutMs?: number;
    includeSnapshot?: boolean;
  }, options?: BridgeRequestOptions) => Promise<EventSubscriptionResponse>;
  getToolManagementCatalog: () => Promise<ToolManagementCatalog>;
  getToolManagementAudit: (limit?: number) => Promise<ToolManagementAuditResponse>;
  getToolManagementMetrics: () => Promise<ToolManagementMetricsResponse>;
  previewToolPolicy: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getToolManagementGrants: () => Promise<ToolManagementGrantsResponse>;
  createToolGrant: (payload: { label: string; scopes?: string[]; toolsets?: string[] }) => Promise<ToolManagementGrantIssue>;
  updateToolGrant: (
    grantId: string,
    payload: {
      label?: string;
      enabled?: boolean;
      scopes?: string[];
      toolsets?: string[];
      toolAllow?: string[];
      toolDeny?: string[];
    },
  ) => Promise<{ grant: ToolManagementGrantIssue["grant"] }>;
  deleteToolGrant: (grantId: string) => Promise<{ grant: ToolManagementGrantIssue["grant"] }>;
  rotateToolGrantToken: (grantId: string) => Promise<ToolManagementGrantIssue>;
  getDiscoveryConfig: () => Promise<DiscoveryConfigResponse>;
  saveDiscoveryConfig: (config: DiscoveryConfig) => Promise<DiscoveryConfigResponse>;
  getEmailRules: () => Promise<EmailRuleSetResponse>;
  saveEmailRules: (payload: EmailRuleSetResponse["rules"]) => Promise<EmailRuleSetResponse>;
  getGoldenRules: () => Promise<Record<string, unknown>>;
  saveGoldenRules: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getExpertVocabulary: () => Promise<ExpertVocabularyResponse>;
  saveExpertVocabulary: (
    payload: ExpertVocabularyResponse["vocabulary"],
  ) => Promise<ExpertVocabularyResponse>;
  getExpertVocabularyVersions: () => Promise<ExpertVocabularyHistoryResponse>;
  pickFiles: () => Promise<string[]>;
  pickFolders: () => Promise<string[]>;
  createJob: (payload: SplitPayload) => Promise<SplitJob>;
  listJobs: (limit?: number) => Promise<SplitJobListResponse>;
  deleteJob: (jobId: string) => Promise<{ ok: boolean; deletedJob: SplitJob }>;
  getJob: (jobId: string) => Promise<SplitJob | null>;
  getJobResult: (jobId: string) => Promise<SplitResult>;
  getDiscoveryClients: () => Promise<DiscoveryClientsResponse>;
  requestClientMigration: (
    clientId: string,
    payload?: { reason?: string },
  ) => Promise<ClientMigrationCommandResponse>;
  getKnowledgeConsole: () => Promise<KnowledgeConsoleState>;
  getKnowledgeConfigSchema: () => Promise<KnowledgeConfigSchema>;
  getKnowledgeSources: () => Promise<KnowledgeSourceState>;
  listKnowledgeReviewItems: (params?: { status?: string; limit?: number }) => Promise<KnowledgeReviewItemsResponse>;
  resolveKnowledgeReviewItem: (
    reviewId: string,
    payload: { resolution: string; patch?: Record<string, unknown> },
  ) => Promise<KnowledgeReviewItem>;
  chatKnowledgeRuleAuthoring: (payload: Record<string, unknown>) => Promise<KnowledgeRuleAuthoringResponse>;
  publishGoldenRules: (
    packageId: string,
    payload: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  createKnowledgeSource: (payload: Record<string, unknown>) => Promise<KnowledgeSourceMutationResponse>;
  updateKnowledgeSource: (
    sourceId: string,
    payload: Record<string, unknown>,
  ) => Promise<KnowledgeSourceMutationResponse>;
  deleteKnowledgeSource: (sourceId: string) => Promise<KnowledgeSourceMutationResponse>;
  refreshKnowledgeSource: (
    sourceId: string,
    payload?: Record<string, unknown>,
  ) => Promise<KnowledgeSourceMutationResponse>;
  refreshAllKnowledgeSources: (payload?: Record<string, unknown>) => Promise<KnowledgeSourceMutationResponse>;
  getKnowledgeMaintenance: () => Promise<MaintenanceSettings>;
  saveKnowledgeMaintenance: (settings: MaintenanceSettings) => Promise<MaintenanceSettings>;
  runKnowledgeMaintenance: (payload: {
    taskType: string;
    confirm?: boolean;
    [key: string]: unknown;
  }) => Promise<Record<string, unknown>>;
  reindexKnowledge: (payload?: { confirm?: boolean; [key: string]: unknown }) => Promise<Record<string, unknown>>;
  searchKnowledge: (payload: Record<string, unknown>) => Promise<KnowledgeSearchResponse>;
  recordKnowledgeFeedback: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getContextProfiles: () => Promise<Record<string, unknown>>;
  previewContextPack: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  listContextBuildRecords: (limit?: number) => Promise<Record<string, unknown>>;
  runContextEvaluation: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  getKnowledgeEvidence: (evidenceId: string) => Promise<EvidencePack>;
  renderKnowledgeMarkdown: (payload: {
    evidenceId: string;
    format?: "markdown" | string;
  }) => Promise<RenderMarkdownResponse>;
  knowledgeAssetUrl: (assetId: string) => string;
  createUploadSession: (payload: Record<string, unknown>) => Promise<UploadSessionResponse>;
  uploadSessionChunk: (
    sessionId: string,
    fileIndex: number,
    offset: number,
    chunk: Blob | ArrayBuffer,
  ) => Promise<UploadSessionResponse>;
  getUploadSession: (sessionId: string) => Promise<UploadSessionResponse>;
  getNormalizedDocuments: (jobId: string) => Promise<SplitResult["normalizedDocuments"]>;
  normalizedDocumentUrl: (jobId: string, documentId: string) => string;
};

let csrfToken = "";

function updateCsrfToken(value: unknown) {
  const direct = typeof value === "string" ? value : "";
  const fromPayload =
    !direct && value && typeof value === "object"
      ? String(
          (value as { csrfToken?: string; session?: { csrfToken?: string } }).csrfToken ||
            (value as { session?: { csrfToken?: string } }).session?.csrfToken ||
            "",
        )
      : "";
  const nextToken = direct || fromPayload;
  if (nextToken) {
    csrfToken = nextToken;
  }
}

async function extractErrorMessage(response: Response) {
  const rawText = await response.text();

  try {
    const parsed = JSON.parse(rawText);
    return parsed.error || parsed.message || rawText;
  } catch {
    return rawText;
  }
}

async function parseJsonResponse<T>(response: Response, url: string): Promise<T> {
  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const trimmed = rawText.trim();

  if (!trimmed) {
    throw new Error(`接口没有返回 JSON：${url}`);
  }

  if (!contentType.includes("application/json") && trimmed.startsWith("<")) {
    throw new Error(
      `接口返回了 HTML 而不是 JSON：${url}。请检查登录状态、接口路径或服务端是否回退到了前端页面。`,
    );
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error(`接口返回的 JSON 无法解析：${url}。响应片段：${trimmed.slice(0, 160)}`);
  }
}

type SafetyRequestOptions = {
  safetyConfirm?: boolean;
};

type BridgeRequestOptions = SafetyRequestOptions & {
  signal?: AbortSignal;
};

function safetyHeaders(options: SafetyRequestOptions = {}): Record<string, string> {
  return options.safetyConfirm ? { "x-splitall-safety-confirm": "true" } : {};
}

async function postJson<T>(url: string, payload?: unknown, options: BridgeRequestOptions = {}): Promise<T> {
  const headers: HeadersInit | undefined = payload
    ? {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(csrfToken ? { "x-splitall-csrf": csrfToken } : {}),
        ...safetyHeaders(options)
      }
    : { Accept: "application/json" };
  const response = await fetch(url, {
    method: payload ? "POST" : "GET",
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
    credentials: "same-origin",
    signal: options.signal,
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message || `Request failed: ${response.status}`);
  }

  const data = await parseJsonResponse<T>(response, url);
  updateCsrfToken(data);
  return data;
}

async function deleteJson<T>(url: string, options: BridgeRequestOptions = {}): Promise<T> {
  const headers: HeadersInit = {
    Accept: "application/json",
    ...(csrfToken ? { "x-splitall-csrf": csrfToken } : {}),
    ...safetyHeaders(options)
  };
  const response = await fetch(url, {
    method: "DELETE",
    headers,
    credentials: "same-origin",
    signal: options.signal,
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message || `Request failed: ${response.status}`);
  }

  const data = await parseJsonResponse<T>(response, url);
  updateCsrfToken(data);
  return data;
}

async function putBinaryJson<T>(url: string, payload: Blob | ArrayBuffer): Promise<T> {
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      ...(csrfToken ? { "x-splitall-csrf": csrfToken } : {}),
    },
    body: payload,
    credentials: "same-origin"
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new Error(message || `Request failed: ${response.status}`);
  }

  const data = await parseJsonResponse<T>(response, url);
  updateCsrfToken(data);
  return data;
}

const browserBridge: Bridge = {
  getAuthSession: () => postJson<ConsoleAuthSummary>("/api/auth/session"),
  loginAuth: (payload) => postJson<ConsoleAuthSummary & { ok: boolean }>("/api/auth/login", payload),
  logoutAuth: () => postJson<{ ok: boolean }>("/api/auth/logout", {}),
  listAuthUsers: () => postJson<{ users: ConsoleUser[]; roles: ConsoleAuthSummary["roles"] }>("/api/auth/users"),
  updateAuthUser: (userId, payload) =>
    postJson<{ user: ConsoleUser; users: ConsoleUser[] }>(
      `/api/auth/users/${encodeURIComponent(userId)}`,
      payload,
      { safetyConfirm: true },
    ),
  getAuthOidc: () => postJson<{ oidc: ConsoleOidcConfig }>("/api/auth/oidc"),
  saveAuthOidc: (payload) =>
    postJson<{ oidc: ConsoleOidcConfig }>("/api/auth/oidc", payload, { safetyConfirm: true }),
  listAuthAudit: (limit = 100) =>
    postJson<{ items: ConsoleAuditItem[] }>(`/api/auth/audit?limit=${encodeURIComponent(String(limit))}`),
  listAuthSessions: () => postJson<{ sessions: Array<Record<string, unknown>> }>("/api/auth/sessions"),
  revokeAuthSession: (sessionId) =>
    postJson<{ ok: boolean }>(`/api/auth/sessions/${encodeURIComponent(sessionId)}/revoke`, {}),
  getSettings: () => postJson<AgentSettings>("/api/settings"),
  saveSettings: (settings) => postJson<AgentSettings>("/api/settings", settings, { safetyConfirm: true }),
  probeModel: (payload) =>
    postJson<ModelProbeResponse>("/api/settings/model-probe", payload),
  getAgentGatewayConfig: () => postJson<{ config: AgentGatewayConfig }>("/api/agent-gateway/config"),
  saveAgentGatewayConfig: (config) =>
    postJson<{ config: AgentGatewayConfig }>("/api/agent-gateway/config", { config }, { safetyConfirm: true }),
  callAgentGateway: (payload) =>
    postJson<AgentGatewayCallResponse>("/api/agent-gateway/call", payload),
  listAgents: () => postJson<AgentRegistryResponse>("/api/agents"),
  runKnowledgeAgentExplore: (payload) =>
    postJson<AgentExploreRunResponse>("/api/knowledge/agent-explore/runs", payload),
  getKnowledgeAgentExploreRun: (runId, params = {}) => {
    const query = new URLSearchParams();
    if (params.workspaceId) {
      query.set("workspaceId", params.workspaceId);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return postJson<AgentExploreRunResponse>(
      `/api/knowledge/agent-explore/runs/${encodeURIComponent(runId)}${suffix}`,
    );
  },
  listAgentWorkspaces: (params = {}) => {
    const query = new URLSearchParams();
    if (params.limit !== undefined) {
      query.set("limit", String(params.limit));
    }
    if (params.includeSummary !== undefined) {
      query.set("includeSummary", String(params.includeSummary));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return postJson<{ workspaces: Array<Record<string, unknown>>; count: number }>(
      `/api/agent-workspaces${suffix}`,
    );
  },
  getAgentWorkspace: (workspaceId, params = {}) => {
    const query = new URLSearchParams();
    if (params.includePrivate !== undefined) {
      query.set("includePrivate", String(params.includePrivate));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return postJson<Record<string, unknown>>(
      `/api/agent-workspaces/${encodeURIComponent(workspaceId)}${suffix}`,
    );
  },
  getAgentSyncConfig: () => postJson<{ config: AgentSyncConfig }>("/api/agent-sync/config"),
  saveAgentSyncConfig: (config) =>
    postJson<{ config: AgentSyncConfig }>("/api/agent-sync/config", { config }, { safetyConfirm: true }),
  publishAgentSync: (payload) =>
    postJson<Record<string, unknown>>("/api/agent-sync/publish", payload),
  subscribeAgentSync: (params = {}) => {
    const query = new URLSearchParams();
    if (params.cursor !== undefined) {
      query.set("cursor", String(params.cursor));
    }
    if (params.topic) {
      query.set("topic", params.topic);
    }
    if (params.timeoutMs !== undefined) {
      query.set("timeoutMs", String(params.timeoutMs));
    }
    if (params.includeSnapshot !== undefined) {
      query.set("includeSnapshot", params.includeSnapshot ? "1" : "0");
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return postJson<EventSubscriptionResponse>(`/api/agent-sync/events${suffix}`);
  },
  getCodexOAuthStatus: () => postJson<CodexOAuthStatus>("/api/oauth/codex/status"),
  startCodexOAuthLogin: () => postJson<CodexOAuthLogin>("/api/oauth/codex/login", {}),
  getRuntimeInfo: () => postJson<RuntimeInfoResponse>("/api/runtime/info"),
  browseServerPath: (payload) =>
    postJson<ServerPathBrowseResponse>("/api/runtime/path-browse", payload),
  saveRuntimeMounts: (payload) =>
    postJson<RuntimeMountsResponse>("/api/runtime/mounts", {
      value: payload
    }, { safetyConfirm: true }),
  reloadRuntimeMounts: (settings) =>
    postJson<RuntimeMountReloadResponse>(
      "/api/runtime/mounts/reload",
      settings ? { settings } : {},
      { safetyConfirm: true },
    ),
  getServerConsoleState: () => postJson<ServerConsoleState>("/api/console/state"),
  getMaintenanceAgentConfig: () =>
    postJson<{ path: string; config: MaintenanceAgentConfig }>("/api/maintenance-agent/config"),
  saveMaintenanceAgentConfig: (config) =>
    postJson<{ config: MaintenanceAgentConfig }>("/api/maintenance-agent/config", { config }, { safetyConfirm: true }),
  chatMaintenanceAgent: (payload) =>
    postJson<{ plan: MaintenanceAgentRun["plan"]; run: MaintenanceAgentRun }>(
      "/api/maintenance-agent/chat",
      payload,
    ),
  startMaintenanceAgentRun: (payload) =>
    postJson<MaintenanceAgentRun>("/api/maintenance-agent/runs", payload),
  listMaintenanceAgentRuns: (limit = 50) =>
    postJson<{ items: MaintenanceAgentRun[]; activeRunId: string; queuedRunIds: string[] }>(
      `/api/maintenance-agent/runs?limit=${encodeURIComponent(String(limit))}`,
    ),
  getMaintenanceAgentRun: (runId) =>
    postJson<{ run: MaintenanceAgentRun }>(
      `/api/maintenance-agent/runs/${encodeURIComponent(runId)}`,
    ),
  approveMaintenanceAgentRun: (runId, payload) =>
    postJson<{ run: MaintenanceAgentRun }>(
      `/api/maintenance-agent/runs/${encodeURIComponent(runId)}/approve`,
      payload,
    ),
  cancelMaintenanceAgentRun: (runId, payload = {}) =>
    postJson<{ run: MaintenanceAgentRun }>(
      `/api/maintenance-agent/runs/${encodeURIComponent(runId)}/cancel`,
      payload,
    ),
  getBackgroundProcesses: () =>
    postJson<BackgroundProcessStatus>("/api/system/background-processes"),
  getClientRuntimeStatus: () => getJson<ClientRuntimeStatus>("/api/client-runtime/status"),
  getMonitorAlerts: () =>
    postJson<MonitorAlertState>("/api/system/monitor-alerts"),
  saveMonitorAlertConfig: (config) =>
    postJson<MonitorAlertState>(
      "/api/system/monitor-alerts/config",
      { config },
      { safetyConfirm: true },
    ),
  acknowledgeMonitorAlert: (alertId) =>
    postJson<MonitorAlertState>(
      `/api/system/monitor-alerts/${encodeURIComponent(alertId)}/ack`,
      {},
      { safetyConfirm: true },
    ),
  subscribeEvents: (params = {}, options = {}) => {
    const query = new URLSearchParams();
    if (params.cursor !== undefined) {
      query.set("cursor", String(params.cursor));
    }
    if (params.topic) {
      query.set("topic", params.topic);
    }
    if (params.timeoutMs !== undefined) {
      query.set("timeoutMs", String(params.timeoutMs));
    }
    if (params.includeSnapshot !== undefined) {
      query.set("includeSnapshot", params.includeSnapshot ? "1" : "0");
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return postJson<EventSubscriptionResponse>(`/api/events${suffix}`, undefined, options);
  },
  getToolManagementCatalog: () => postJson<ToolManagementCatalog>("/api/tool-management/v1/catalog"),
  getToolManagementAudit: (limit = 50) =>
    postJson<ToolManagementAuditResponse>(
      `/api/tool-management/v1/audit?limit=${encodeURIComponent(String(limit))}`,
    ),
  getToolManagementMetrics: () =>
    postJson<ToolManagementMetricsResponse>("/api/tool-management/v1/metrics/summary"),
  previewToolPolicy: (payload) =>
    postJson<Record<string, unknown>>("/api/tool-management/v1/policy/preview", payload),
  getToolManagementGrants: () => postJson<ToolManagementGrantsResponse>("/api/tool-management/v1/grants"),
  createToolGrant: async (payload) => {
    return postJson<ToolManagementGrantIssue>(
      "/api/tool-management/v1/grants",
      payload,
      { safetyConfirm: true },
    );
  },
  updateToolGrant: async (grantId, payload) => {
    return postJson(
      `/api/tool-management/v1/grants/${encodeURIComponent(grantId)}`,
      payload,
      { safetyConfirm: true },
    );
  },
  deleteToolGrant: async (grantId) => {
    return postJson(
      `/api/tool-management/v1/grants/${encodeURIComponent(grantId)}/revoke`,
      { reason: "revoked_from_console" },
      { safetyConfirm: true },
    );
  },
  rotateToolGrantToken: async (grantId) => {
    return postJson<ToolManagementGrantIssue>(
      `/api/tool-management/v1/grants/${encodeURIComponent(grantId)}/rotate`,
      {},
      { safetyConfirm: true },
    );
  },
  getDiscoveryConfig: () => postJson<DiscoveryConfigResponse>("/api/discovery/config"),
  saveDiscoveryConfig: (config) =>
    postJson<DiscoveryConfigResponse>("/api/discovery/config", {
      value: config
    }, { safetyConfirm: true }),
  getEmailRules: () => postJson<EmailRuleSetResponse>("/api/email-rules"),
  saveEmailRules: (rules) =>
    postJson<EmailRuleSetResponse>("/api/email-rules", {
      rules
    }, { safetyConfirm: true }),
  getGoldenRules: () =>
    postJson<Record<string, unknown>>("/api/knowledge/golden-rules?includeRules=true"),
  saveGoldenRules: (payload) =>
    postJson<Record<string, unknown>>("/api/knowledge/golden-rules", payload, {
      safetyConfirm: true
    }),
  getExpertVocabulary: () =>
    postJson<ExpertVocabularyResponse>("/api/expert-vocabulary"),
  saveExpertVocabulary: (vocabulary) =>
    postJson<ExpertVocabularyResponse>("/api/expert-vocabulary", {
      vocabulary
    }, { safetyConfirm: true }),
  getExpertVocabularyVersions: () =>
    postJson<ExpertVocabularyHistoryResponse>("/api/expert-vocabulary/versions"),
  pickFiles: async () => [],
  pickFolders: async () => [],
  createJob: (payload) => postJson<SplitJob>("/api/jobs", payload),
  listJobs: (limit = 50) =>
    postJson<SplitJobListResponse>(`/api/jobs?limit=${encodeURIComponent(String(limit))}`),
  deleteJob: (jobId) =>
    deleteJson<{ ok: boolean; deletedJob: SplitJob }>(`/api/jobs/${encodeURIComponent(jobId)}`, { safetyConfirm: true }),
  getJob: (jobId) => postJson<SplitJob>(`/api/jobs/${encodeURIComponent(jobId)}`),
  getJobResult: (jobId) =>
    postJson<SplitResult>(`/api/jobs/${encodeURIComponent(jobId)}/result`),
  getDiscoveryClients: () => postJson<DiscoveryClientsResponse>("/api/discovery/clients"),
  requestClientMigration: (clientId, payload = {}) =>
    postJson<ClientMigrationCommandResponse>(
      `/api/discovery/clients/${encodeURIComponent(clientId)}/migration`,
      payload,
      { safetyConfirm: true },
    ),
  getKnowledgeConsole: () => postJson<KnowledgeConsoleState>("/api/knowledge/console"),
  getKnowledgeConfigSchema: () => postJson<KnowledgeConfigSchema>("/api/knowledge/config-schema"),
  getKnowledgeSources: () => postJson<KnowledgeSourceState>("/api/knowledge/sources"),
  listKnowledgeReviewItems: (params = {}) =>
    postJson<KnowledgeReviewItemsResponse>(
      `/api/knowledge/review-items?status=${encodeURIComponent(params.status || "pending")}&limit=${encodeURIComponent(String(params.limit || 100))}`,
    ),
  resolveKnowledgeReviewItem: (reviewId, payload) =>
    postJson<KnowledgeReviewItem>(
      `/api/knowledge/review-items/${encodeURIComponent(reviewId)}/resolve`,
      payload,
      { safetyConfirm: true },
    ),
  chatKnowledgeRuleAuthoring: (payload) =>
    postJson<KnowledgeRuleAuthoringResponse>("/api/knowledge/rule-authoring/chat", payload, {
      safetyConfirm: true,
    }),
  publishGoldenRules: (packageId, payload) =>
    postJson<Record<string, unknown>>(
      `/api/knowledge/golden-rules/${encodeURIComponent(packageId)}/publish`,
      payload,
      { safetyConfirm: true },
    ),
  createKnowledgeSource: (payload) =>
    postJson<KnowledgeSourceMutationResponse>("/api/knowledge/sources", payload, { safetyConfirm: true }),
  updateKnowledgeSource: (sourceId, payload) =>
    postJson<KnowledgeSourceMutationResponse>(
      `/api/knowledge/sources/${encodeURIComponent(sourceId)}`,
      payload,
      { safetyConfirm: true },
    ),
  deleteKnowledgeSource: (sourceId) =>
    deleteJson<KnowledgeSourceMutationResponse>(
      `/api/knowledge/sources/${encodeURIComponent(sourceId)}`,
      { safetyConfirm: true },
    ),
  refreshKnowledgeSource: (sourceId, payload = {}) =>
    postJson<KnowledgeSourceMutationResponse>(
      `/api/knowledge/sources/${encodeURIComponent(sourceId)}/refresh`,
      payload,
    ),
  refreshAllKnowledgeSources: (payload = {}) =>
    postJson<KnowledgeSourceMutationResponse>("/api/knowledge/sources-refresh", payload),
  getKnowledgeMaintenance: () => postJson<MaintenanceSettings>("/api/knowledge/maintenance"),
  saveKnowledgeMaintenance: (settings) =>
    postJson<MaintenanceSettings>("/api/knowledge/maintenance", {
      value: settings
    }, { safetyConfirm: true }),
  runKnowledgeMaintenance: (payload) =>
    postJson<Record<string, unknown>>("/api/knowledge/maintenance/run", payload),
  reindexKnowledge: (payload = { confirm: true }) =>
    postJson<Record<string, unknown>>("/api/knowledge/reindex", payload, { safetyConfirm: true }),
  searchKnowledge: (payload) => postJson<KnowledgeSearchResponse>("/api/knowledge/search", payload),
  recordKnowledgeFeedback: (payload) => postJson<Record<string, unknown>>("/api/knowledge/feedback", payload),
  getContextProfiles: () => getJson<Record<string, unknown>>("/api/context/profiles"),
  previewContextPack: (payload) => postJson<Record<string, unknown>>("/api/context/preview", payload),
  listContextBuildRecords: (limit = 50) =>
    getJson<Record<string, unknown>>(`/api/context/build-records?limit=${encodeURIComponent(String(limit))}`),
  runContextEvaluation: (payload) => postJson<Record<string, unknown>>("/api/context/evaluation/runs", payload),
  getKnowledgeEvidence: (evidenceId) =>
    postJson<EvidencePack>(`/api/knowledge/evidence/${encodeURIComponent(evidenceId)}`),
  renderKnowledgeMarkdown: (payload) =>
    postJson<RenderMarkdownResponse>("/api/knowledge/render/markdown", payload),
  knowledgeAssetUrl: (assetId) => `/api/knowledge/assets/${encodeURIComponent(assetId)}`,
  createUploadSession: (payload) => postJson<UploadSessionResponse>("/api/upload-sessions", payload),
  uploadSessionChunk: (sessionId, fileIndex, offset, chunk) =>
    putBinaryJson<UploadSessionResponse>(
      `/api/upload-sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(
        String(fileIndex),
      )}?offset=${encodeURIComponent(String(offset))}`,
      chunk,
    ),
  getUploadSession: (sessionId) =>
    postJson<UploadSessionResponse>(`/api/upload-sessions/${encodeURIComponent(sessionId)}`),
  getNormalizedDocuments: (jobId) =>
    postJson<SplitResult["normalizedDocuments"]>(
      `/api/jobs/${encodeURIComponent(jobId)}/normalized-documents`,
    ),
  normalizedDocumentUrl: (jobId, documentId) =>
    `/api/jobs/${encodeURIComponent(jobId)}/normalized-documents/${encodeURIComponent(documentId)}`
};

export const bridge = browserBridge;
