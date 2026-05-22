import { marked } from "marked";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { viewToPath, adminSectionToSlug, slugToAdminView } from "../router/index";
// Note: common components are NOT imported here — that would create a circular
// dependency (components → useConsole → components). Each view imports the
// components it needs directly from ./components/common.
import { bridge } from "../lib/bridge";
import type {
  AgentSettings,
  AgentModelConfig,
  AgentModuleAccess,
  AgentSelectorOption,
  BackgroundProcessStatus,
  ClientRuntimeHeatRow,
  ClientMigrationState,
  CodexOAuthLogin,
  CodexOAuthStatus,
  ConsoleAuditItem,
  ConsoleAuthSummary,
  ConsoleOidcConfig,
  ConsoleUser,
  DiscoveryConfig,
  DiscoveryConfigResponse,
  EmailRuleSet,
  AgentExploreRunResponse,
  EvidencePack,
  ExpertVocabulary,
  ExpertVocabularyEntry,
  KnowledgeAssetRef,
  KnowledgeConfigSchema,
  KnowledgeConsoleState,
  KnowledgeReviewItem,
  KnowledgeRuleAuthoringResponse,
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
  KnowledgeSource,
  KnowledgeSourceState,
  KnowledgeWordCloud,
  KnowledgeWordCloudCorpusPath,
  KnowledgeWordCloudSet,
  KnowledgeWordCloudState,
  KnowledgeWordCloudTerm,
  MaintenanceAgentConfig,
  MaintenanceAgentRun,
  MaintenanceSettings,
  MonitorAlertState,
  ModelProbeResponse,
  ModuleAgentProfile,
  NormalizedDocumentsManifest,
  ProtocolEvent,
  QueueMonitorItem,
  ServerPathBrowseEntry,
  ServerPathBrowseResponse,
  ServerConsoleState,
  SplitJob,
  SplitJobStatus,
  UnifiedRegistrationRecord,
  ToolManagementAuditItem,
  ToolManagementCatalog,
  ToolManagementMetrics,
  ToolManagementProfile,
  ToolManagementTool,
  ToolManagementToolset,
  ToolManagementGrant,
  AgentPermissionGroup,
} from "../lib/types";
import type {
  DrawerTab, AppView, AdminView, DebugTab, RuleAuthoringMode,
  KnowledgeTab, KnowledgeManagementPanel, OptionBarValue, OptionBarOption,
  KnowledgeLogRow, AgentExploreSession, KnowledgeRecallDebugRun,
  HistorySessionPanelItem, ModelEntryBinding, AgentConfigurationAlert,
  DashboardAlert, WorkQueueRow, InfoFeedStageStatus, InfoFeedAttachment,
  InfoFeedClarificationOption, InfoFeedExpertFeedbackAnchor, InfoFeedClarification,
  InfoFeedExpertFeedback, InfoFeedTurnSnapshot, InfoFeedRetryStage,
  InfoFeedRetryState, InfoFeedRunState, PathPickerMode, PathPickerState,
  WordCloudCorpusAuditAction, RefreshStateOptions, CloudProvider,
} from "../types/app";
export type {
  DrawerTab, AppView, AdminView, DebugTab, RuleAuthoringMode,
  KnowledgeTab, KnowledgeManagementPanel, OptionBarValue, OptionBarOption,
  KnowledgeLogRow, AgentExploreSession, KnowledgeRecallDebugRun,
  HistorySessionPanelItem, ModelEntryBinding, AgentConfigurationAlert,
  DashboardAlert, WorkQueueRow, InfoFeedStageStatus, InfoFeedAttachment,
  InfoFeedClarificationOption, InfoFeedExpertFeedbackAnchor, InfoFeedClarification,
  InfoFeedExpertFeedback, InfoFeedTurnSnapshot, InfoFeedRetryStage,
  InfoFeedRetryState, InfoFeedRunState, PathPickerMode, PathPickerState,
  WordCloudCorpusAuditAction, RefreshStateOptions, CloudProvider,
} from "../types/app";

// Navigation state shared across all useConsole() instances (module-level singleton)
const debugTab = ref<DebugTab>("knowledgeRecall");
const knowledgeTab = ref<KnowledgeTab>("management");
const knowledgeManagementPanel = ref<KnowledgeManagementPanel>("knowledge");


// ─────────────────────────────────────────────────────────────────────────────
// Module-level singleton state and logic.
// All refs, computeds, functions, and watches here are shared across every
// component that calls useConsole().  Only onMounted / onUnmounted stay inside
// the exported function so Vue can bind them to the component lifecycle.
// ─────────────────────────────────────────────────────────────────────────────

const modelLibraryProviderDefinitions: Array<{
  id: CloudProvider;
  label: string;
  description: string;
}> = [
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "OpenAI-compatible Chat Completions，API Key 由服务端代理使用。",
  },
  {
    id: "google-gemini",
    label: "Google Gemini",
    description: "Google Generative Language API Key 与 Gemini 模型。",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "OpenRouter API Key、Base URL 与模型 ID。",
  },
  {
    id: "openai-chatgpt",
    label: "ChatGPT OAuth",
    description: "使用 Codex ChatGPT OAuth，不在页面维护 API Key。",
  },
  {
    id: "copilot",
    label: "Copilot / 企业代理",
    description: "企业代理或兼容 Chat Completions 的内部模型服务。",
  },
  {
    id: "custom-http",
    label: "自定义 HTTP Adapter",
    description: "Pact agent 报文格式的外部智能体网关。",
  },
  {
    id: "local-model",
    label: "本地模型服务",
    description: "本机或局域网内的模型服务 Endpoint。",
  },
];

const intelligentModuleDefinitions = [
  {
    id: "knowledgeTaxonomy",
    label: "事务归类",
    description: "邮件和文档进入图谱前的领域、关键词和意图抽象。",
  },
  {
    id: "graphInsight",
    label: "知识图谱增强",
    description: "节点聚合、关系解释和高频实体抽象。",
  },
  {
    id: "timelineDistillation",
    label: "时间线提炼",
    description: "围绕具体事务提炼阶段、事件和关键节点。",
  },
  {
    id: "agentTools",
    label: "智能体工具调用",
    description: "智能体使用服务端工具前的意图理解和结果整理。",
  },
  {
    id: "localOcr",
    label: "本地 OCR",
    description: "默认不需要大模型，只有开启多模态解释时才分配模型。",
  },
];

const emptySettings: AgentSettings = {
  tikaJarPath: "",
  javaBinPath: "",
  modelIntelligenceEnabled: false,
  googleApiKey: "",
  googleApiKeyConfigured: false,
  googleModel: "gemini-flash-lite-latest",
  openAiModel: "gpt-5.4-mini",
  defaultModelProvider: "",
  defaultModel: "",
  modelLibraryEntries: [],
  modelLibraryAgents: [],
  agentPermissionGroups: [],
  agentExploreDefaults: {
    systemPrompt:
      "You are Pact Knowledge Explorer. You are stateless; use the supplied ContextPack as your only memory.",
    toolPolicyPrompt:
      "Always search from coarse to fine. For counts, totals, rankings, frequency, or 'which has the most' questions, first call knowledge_aggregate. For normal evidence recall, first call keyword_search with broad but meaningful keywords, then open_evidence only for promising evidenceId values.",
    continuationPrompt:
      "Continue from the tool results. Call another tool only if more local evidence is needed; otherwise give the final answer with evidenceId citations.",
    answerTemplate: [
      "默认使用以下 Markdown 报告格式输出，除非用户明确要求其他格式。必须保留分割线。",
      "如果用户问题不是风险分析，把“风险”自然替换成“发现 / 事项 / 结论”，但保留同样结构。",
      "",
      "根据对【分析范围】的分析，发现以下【数量】项【风险/发现】：",
      "",
      "---",
      "",
      "1. 【风险图标】 【标题】",
      "",
      "【一段可读说明：写清事实、时间、影响和风险。关键日期、金额、IP、账号、服务名称用加粗突出。不要编造证据中没有的信息。】",
      "",
      "📎 证据来源：evidence::xxxx, evidence::yyyy",
      "",
      "---",
      "",
      "2. 【风险图标】 【标题】",
      "",
      "【说明】",
      "",
      "📎 证据来源：evidence::zzzz",
      "",
      "---",
      "",
      "建议行动：",
      "",
      "- 【行动 1】",
      "- 【行动 2】",
      "- 【行动 3】",
      "",
      "要求：证据 ID 必须保持原样；不要写不存在的 evidenceId；证据不足时添加“不确定项”小节。",
    ].join("\n"),
    contextProfileId: "context-128k",
    thinkingMode: "default",
    temperature: 0.2,
    maxTokens: 1800,
    maxIterations: 4,
    limit: 8,
    toolChoice: "auto",
    reviewFusionModelAlias: "",
    reviewFusionSystemPrompt:
      "你是 Pact 知识冲突融合智能体。你只能基于输入的原始记录、新录入记录、冲突原因和证据字段进行分析。请判断两份知识是完全重合、部分重合还是明显不同；给出相似度、应采取的审核动作和可复核理由。不得改写原始证据，不得编造未提供的信息。",
    reviewFusionTemperature: 0.1,
    reviewFusionMaxTokens: 1200,
  },
  agentToolExecution: {
    http: {
      enabled: true,
      allowedHosts: ["127.0.0.1", "localhost"],
      timeoutMs: 30000,
      maxResponseBytes: 65536,
    },
    local: {
      enabled: true,
      allowDirectCommands: false,
      timeoutMs: 30000,
      maxOutputBytes: 65536,
      commands: [
        {
          commandId: "node-version",
          label: "Node.js version",
          command: "node",
          args: ["--version"],
          cwd: "",
          description: "跨平台 Node 运行时探测命令。",
        },
      ],
    },
  },
  moduleModelAssignments: {},
  moduleAgentProfiles: {},
  moduleIntelligence: {
    knowledgeTaxonomy: true,
    graphInsight: true,
    timelineDistillation: true,
    agentTools: true,
    localOcr: false,
  },
  openRouterApiKey: "",
  openRouterApiKeyConfigured: false,
  openRouterBaseUrl: "https://openrouter.ai/api/v1",
  openRouterModel: "openai/gpt-4.1-mini",
  deepSeekApiKey: "",
  deepSeekApiKeyConfigured: false,
  deepSeekBaseUrl: "https://api.deepseek.com",
  deepSeekModel: "deepseek-v4-pro",
  deepSeekTimeoutMs: 120000,
  copilotEndpoint: "",
  copilotApiKey: "",
  copilotApiKeyConfigured: false,
  copilotModel: "copilot-default",
  localModelEndpoint: "",
  localModelName: "local-default",
  customModelAlias: "external-agent",
  customModelLabel: "自定义 HTTP 模型",
  customModelApiKey: "",
  customModelApiKeyConfigured: false,
  customHttpAdapter: {
    alias: "external-agent",
    url: "",
    token: "",
    tokenConfigured: false,
    tokenHeader: "token",
    tokenPrefix: "",
    agentName: "",
    pluginList: [],
    engine: "",
    parameters: {},
    timeoutMs: 120000,
  },
  customHttpAdapters: [],
  analysisModuleId: "builtin:heuristic-hybrid-v1",
  ocrEnabled: true,
  ocrPythonPath: "",
  ocrLanguage: "ch",
  retrievalHalfLifeDays: 45,
  staleAfterDays: 180,
  transactionWindowDays: 30,
};


const emptyDiscovery: DiscoveryConfig = {
  serverId: "",
  serverLabel: "",
  bootstrapBaseUrl: "",
  advertisedBaseUrl: "",
  activeServiceUrl: "",
  forwardBaseUrl: "",
  mode: "active",
  configVersion: "",
  refreshIntervalSeconds: 30,
  checkInIntervalSeconds: 30,
  offlineAfterSeconds: 180,
};

const emptyExpertVocabulary: ExpertVocabulary = {
  schemaVersion: 1,
  version: 0,
  updatedAt: "",
  publishedAt: "",
  source: "",
  checksum: "",
  entries: [],
};

const jobStatusLabels: Record<SplitJobStatus, string> = {
  queued: "排队中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
};

const migrationStateLabels: Record<ClientMigrationState, string> = {
  aligned: "已切换",
  outdated: "待切换",
  draining: "迁移中",
  "bootstrap-only": "仅引导",
  offline: "离线",
  unknown: "未知",
};

const moduleNameLabels: Record<string, string> = {
  analysis: "分析引擎",
  ocr: "OCR 识别",
  multimodalParser: "多模态解析",
  documentParser: "文档解析",
  pdfProcessor: "PDF 处理",
  knowledgeBase: "知识库",
  vectorStore: "向量存储",
  graphStore: "图谱存储",
};

const moduleNameDescriptions: Record<string, string> = {
  analysis: "事务、人物、时间线和检索网络的核心分析管线。",
  ocr: "图片、扫描件和不可复制文本的兜底识别模块。",
  multimodalParser: "图片、表格、版式等多模态文档理解入口。",
  documentParser: "Office、邮件和纯文本文件的结构化提取入口。",
  pdfProcessor: "PDF 专用处理流程，可以先转入 Tika，再按需要触发后续处理。",
  knowledgeBase: "批次提交后的知识沉淀与外部知识库同步。",
  vectorStore: "检索向量写入、召回和相似度计算适配器。",
  graphStore: "关系图谱写入、节点边同步和外部图数据库适配器。",
};

const moduleGroupDefinitions = [
  {
    id: "analysis",
    label: "分析引擎",
    description: "面向事务、人物、时间线与关联网络的分析模块。",
    names: ["analysis"],
  },
  {
    id: "image",
    label: "图片处理",
    description: "扫描件、图片和多模态文档的识别与理解模块。",
    names: ["ocr", "multimodalParser"],
  },
  {
    id: "document",
    label: "文档处理",
    description: "PDF、Office、邮件和文本文件的结构化解析模块。",
    names: ["documentParser", "pdfProcessor"],
  },
  {
    id: "knowledge",
    label: "知识管理",
    description: "批次完成后的知识沉淀、同步和检索前置模块。",
    names: ["knowledgeBase"],
  },
  {
    id: "storage",
    label: "存储管理",
    description: "向量库与图数据库等外部存储适配模块。",
    names: ["vectorStore", "graphStore"],
  },
];

const debugTabs: Array<{ id: DebugTab; label: string }> = [
  { id: "knowledgeRecall", label: "知识库召回" },
  { id: "agentRetrieval", label: "智能体检索" },
];

const knowledgeTabs: Array<{ id: KnowledgeTab; label: string }> = [
  { id: "management", label: "知识管理" },
  { id: "wordCloud", label: "词云" },
  { id: "conflicts", label: "冲突审核" },
  { id: "maintenance", label: "知识库配置" },
];

const consoleState = ref<ServerConsoleState | null>(null);
const activeConsoleFeatureIds = computed(() =>
  consoleState.value?.features?.activeFeatureIds || []
);
function hasFeature(featureId: string) {
  if (!authState.value?.session.authenticated || !consoleState.value?.features) {
    return false;
  }
  return activeConsoleFeatureIds.value.includes(featureId);
}
function hasAnyFeature(featureIds: string[]) {
  return featureIds.some((featureId) => hasFeature(featureId));
}
const visibleKnowledgeTabs = computed(() =>
  hasFeature("knowledge-core") ? knowledgeTabs : []
);
const visibleDebugTabs = computed(() =>
  debugTabs.filter((tab) => {
    if (tab.id === "knowledgeRecall") {
      return hasFeature("knowledge-core");
    }
    if (tab.id === "agentRetrieval") {
      return hasFeature("agent-exploration");
    }
    return true;
  })
);
const adminViewTitleMap: Partial<Record<AdminView, string>> = {
  jobs: "工作队列",
  logs: "日志记录",
  tools: "智能体工具",
  agentManagement: "智能体管理",
  agentPermissions: "智能体权限",
  agentConfig: "智能体配置",
  maintenanceAgent: "智能巡检",
  opsMonitor: "运维监控",
  clients: "设备管理",
  storage: "系统概览",
  modules: "接入模块",
};
const viewTitleMap: Record<AppView, string> = {
  dashboard: "工作台",
  feed: "信息流",
  sources: "数据源",
  knowledge: "知识库",
  intelligence: "智能分析",
  workspaces: "协作空间",
  debug: "调试面板",
  admin: "管理",
};
const viewTitle = computed(() => {
  if (currentView.value === "admin") {
    return adminViewTitleMap[adminView.value] || "管理";
  }
  return viewTitleMap[currentView.value] || "";
});
const settingsDraft = ref<AgentSettings>({ ...emptySettings });
const discoveryDraft = ref<DiscoveryConfig>({ ...emptyDiscovery });
const mountDraft = ref<Record<string, string>>({});
const rulesText = ref("");
const vocabularySearch = ref("");
const showAllVocabularyEntries = ref(false);
const expertVocabularyDraft = ref<ExpertVocabulary>({
  ...emptyExpertVocabulary,
  entries: [],
});
const error = ref("");
// busyKey tracks ALL currently in-flight operations as a Set so concurrent
// requests do not clobber each other's loading indicators.
const _busyKeys = ref<Set<string>>(new Set<string>());
/** Reactive proxy: true when the given key is in the busy set */
function isBusy(key: string): boolean { return _busyKeys.value.has(key); }
function isBusyPrefix(prefix: string): boolean {
  return [..._busyKeys.value].some((k) => k.startsWith(prefix));
}
function setBusy(key: string): void { _busyKeys.value = new Set([..._busyKeys.value, key]); }
function clearBusy(key: string): void {
  const next = new Set(_busyKeys.value);
  next.delete(key);
  _busyKeys.value = next;
}
/** Backwards-compat string ref: last active key (or "" when idle). */
const busyKey = computed(() => [..._busyKeys.value].at(-1) ?? "");
function clearAllBusy(): void { _busyKeys.value = new Set<string>(); }
const codexOAuthStatus = ref<CodexOAuthStatus | null>(null);
const codexOAuthLogin = ref<CodexOAuthLogin | null>(null);
const selectedModelProvider = ref<CloudProvider>("deepseek");
const modelProbeResults = ref<Record<string, ModelProbeResponse>>({});
const modelLibrarySaveProbeNotices = ref<Record<string, string>>({});
const modelLibraryExpandedCards = ref<Record<string, boolean>>({});
const moduleAgentCandidateDrafts = ref<Record<string, string>>({});
const agentModelOptionLabelCache = ref<Record<string, string>>({});
const settingsDraftDirty = ref(false);
const discoveryDraftDirty = ref(false);
const mountDraftDirty = ref(false);
const rulesDraftDirty = ref(false);
const expertVocabularyDraftDirty = ref(false);
// Module-level router instance (set the first time useConsole() is called)
let _appRouter: ReturnType<typeof useRouter> | null = null;
let consoleLifecycleRefCount = 0;
let consoleLifecycleInitInProgress: Promise<void> | null = null;
let consoleLifecycleInitialized = false;
let applyingRemoteSettings = false;
let applyingRemoteConsoleDrafts = false;
let codexOAuthPollTimer: number | null = null;
let agentExplorePollTimer: number | null = null;
let configTargetHighlightTimer: number | null = null;
let serverEventCursor = 0;
let serverEventSubscriptionStopped = false;
let serverEventSubscriptionGeneration = 0;
let serverEventAbortController: AbortController | null = null;
let serverEventTimer: number | null = null;
let serverEventTimerResolve: (() => void) | null = null;
const REFRESH_STATE_DELAY_MS = 3000;
let lastRefreshStateStartedAt = 0;
let pendingRefreshStateTimer: number | null = null;
let pendingRefreshStateOptions: RefreshStateOptions | null = null;
let pendingRefreshStatePromise: Promise<void> | null = null;
let pendingRefreshStateResolve: (() => void) | null = null;
const AGENT_EXPLORE_STORAGE_KEY = "pact.agentExplore.sessions.v1";
const INFO_FEED_STORAGE_KEY = "pact.infoFeed.history.v1";
const filter = ref("");
const drawerOpen = ref(false);
const drawerTab = ref<DrawerTab>("discovery");
const sideNavOpen = ref(false);
const currentView = ref<AppView>("dashboard");
const adminView = ref<AdminView>("jobs");
const highlightedConfigTarget = ref("");
const clientSearchQuery = ref("");
const clientStateFilter = ref<ClientMigrationState | "all">("all");
const clientMigrationMessages = ref<Record<string, string>>({});
const editingMountPaths = ref<Record<string, boolean>>({});
const newGrantLabel = ref("默认智能体");
const newGrantScopes = ref<string[]>(["knowledge:read"]);
const newGrantToolsets = ref<string[]>(["pact.knowledge.read"]);
const issuedToolToken = ref("");
const toolManagementCatalogState = ref<ToolManagementCatalog | null>(null);
const toolManagementGrantsState = ref<ToolManagementGrant[]>([]);
const toolManagementMetricsState = ref<ToolManagementMetrics | null>(null);
const toolManagementAuditItems = ref<ToolManagementAuditItem[]>([]);
const selectedToolManagementToolId = ref("pact.knowledge.health");
const policyPreviewToolId = ref("pact.knowledge.health");
const policyPreviewProfileId = ref("external-knowledge-reader");
const policyPreviewGrantId = ref("");
const policyPreviewResult = ref<Record<string, unknown> | null>(null);
const authState = ref<ConsoleAuthSummary | null>(null);
const authBootstrapping = ref(true);
const loginForm = ref({ username: "", password: "" });
const authUsers = ref<ConsoleUser[]>([]);
const authAudit = ref<ConsoleAuditItem[]>([]);
const authSessions = ref<Array<Record<string, unknown>>>([]);
const maintenanceAgentConfig = ref<MaintenanceAgentConfig | null>(null);
const maintenanceAgentRuns = ref<MaintenanceAgentRun[]>([]);
const selectedMaintenanceAgentRun = ref<MaintenanceAgentRun | null>(null);
const maintenanceAgentMessage = ref("检查服务端健康状态，自动处理安全维护项。");
const maintenanceAgentModelAlias = ref("");
const maintenanceAgentRunbook = ref("health_smoke");
const maintenanceAgentResultJson = ref("");
const backgroundProcessStatus = ref<BackgroundProcessStatus | null>(null);
const monitorAlertState = ref<MonitorAlertState | null>(null);
const monitorAlertConfigText = ref("");
const dashboardAlertInbox = ref<Record<string, DashboardAlert>>({});
const dismissedDashboardAlertIds = ref<Set<string>>(new Set());
const oidcDraft = ref<ConsoleOidcConfig & { clientSecret?: string }>({
  enabled: false,
  issuer: "",
  clientId: "",
  clientSecretConfigured: false,
  redirectUri: "",
  allowedDomains: [],
  roleMapping: {},
  updatedAt: "",
  clientSecret: "",
});
const oidcAllowedDomainsText = ref("");
const oidcRoleMappingText = ref("{}");
const knowledgeConsole = ref<KnowledgeConsoleState | null>(null);
const knowledgeSchema = ref<KnowledgeConfigSchema | null>(null);
const knowledgeSourceState = ref<KnowledgeSourceState | null>(null);
const wordCloudState = ref<KnowledgeWordCloudState | null>(null);
const wordCloudDraft = ref<KnowledgeWordCloudSet | null>(null);
const wordCloudPrompt = ref("");
const wordCloudModelAlias = ref("");
const wordCloudCorpusPaths = ref<KnowledgeWordCloudCorpusPath[]>([]);
const selectedWordBagId = ref("");
const wordBagActionMenuId = ref("");
const collapsedWordBagIds = ref<Set<string>>(new Set());
const pinnedWordBagIds = ref<Set<string>>(new Set());
const wordCloudTermInputs = ref<Record<string, string>>({});
const fillingWordBagIds = ref<Set<string>>(new Set());
const fillTargetWordBagId = ref<string | null>(null);
const fillSourceWordBagSetId = ref<string | null>(null);
const wordCloudMessages = ref<Array<{
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  at: string;
}>>([]);
const knowledgeMaintenanceDraft = ref<MaintenanceSettings>({});
const maintenanceJson = ref("{}");
const selectedMaintenanceTask = ref("validate_assets");
const maintenanceConfirm = ref(false);
const maintenanceDryRun = ref(true);
const maintenanceResultJson = ref("");
const knowledgeSearchForm = ref({
  query: "",
});
const knowledgeRecallDebugForm = ref({
  query: "",
  topKValues: "10 20 30",
  retrievalMode: "hybrid",
  keywordOnly: false,
  learningEnabled: true,
  explain: true,
});
const knowledgeRecallDebugRuns = ref<KnowledgeRecallDebugRun[]>([]);
const agentExploreForm = ref({
  query: "",
  modelAlias: "",
  contextProfileId: "context-128k",
  thinkingMode: "default",
  temperature: 0.2,
  maxTokens: 1800,
  maxIterations: 4,
  limit: 8,
  toolChoice: "auto",
  workspaceId: "",
});
const agentExploreResult = ref<AgentExploreRunResponse | null>(null);
const agentExploreHistory = ref<AgentExploreSession[]>([]);
const agentExploreDraftTabs = ref<AgentExploreSession[]>([]);
const agentExploreActiveTabId = ref("");
const agentExploreHydrated = ref(false);
const agentExploreSplitRef = ref<HTMLElement | null>(null);
const agentExploreSplitDragging = ref(false);
const agentExploreSplitLeftPercent = ref(42);
const agentExploreTraceOpen = ref(true);
const agentExploreHiddenRunIds = ref<Set<string>>(new Set());
const agentExploreClosedTabIds = ref<Set<string>>(new Set());
const ruleAuthoringForm = ref({
  message: "",
  modelAlias: "",
  ruleName: "",
  scope: "knowledge",
  matchStrategy: "semantic_duplicate",
  action: "skip_duplicate",
  confidence: 0.85,
  notes: "",
});
const ruleCreationMode = ref<RuleAuthoringMode>("chat");
const ruleAuthoringResult = ref<KnowledgeRuleAuthoringResponse | null>(null);
const ruleAuthoringHistory = ref<KnowledgeRuleAuthoringResponse[]>([]);
const goldenRulesState = ref<Record<string, unknown> | null>(null);
const contextProfilesResponse = ref<Record<string, unknown> | null>(null);
const contextBuildRecordsResponse = ref<Record<string, unknown> | null>(null);
const contextPreviewTask = ref("总结最近一个月邮件中的账单风险，必须保留证据编号。");
const contextPreviewRequiredEvidence = ref("");
const contextPreviewResult = ref<Record<string, unknown> | null>(null);
const contextEvaluationResult = ref<Record<string, unknown> | null>(null);
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
let infoFeedRunSequence = 0;
let infoFeedSummaryStreamTimer: number | null = null;
const infoFeedKeywordCache = new Map<string, { response: KnowledgeSearchResponse; cachedAt: number }>();
const INFO_FEED_FETCH_RETRY_LIMIT = 10;
const INFO_FEED_CONTEXT_CHARS_PER_TOKEN = 3;
const CLEAR_LOCAL_STATE_PARAM = "clearLocalState";
const knowledgeLogAdvancedOpen = ref(false);
const knowledgeLogFilters = ref({
  id: "",
  status: "",
  stage: "",
  from: "",
  to: "",
});
const AGENT_SELECTION_REFERENCE_LOG_LIMIT = 80;
type AgentSelectionReferenceState = "empty" | "available" | "removed";
type AgentSelectionReferenceSnapshot = {
  alias: string;
  state: AgentSelectionReferenceState;
};
const agentSelectionReferenceLogs = ref<KnowledgeLogRow[]>([]);
const agentSelectionReferenceStates = ref<Record<string, AgentSelectionReferenceSnapshot>>({});
type KnowledgeLogColumnKey =
  | "kind"
  | "target"
  | "status"
  | "stage"
  | "progress"
  | "time"
  | "detail"
  | "error";
const knowledgeLogTableShellRef = ref<HTMLElement | null>(null);
const knowledgeLogTableScrollLeft = ref(0);
const knowledgeLogColumnOrder: KnowledgeLogColumnKey[] = [
  "kind",
  "target",
  "status",
  "stage",
  "progress",
  "time",
  "detail",
  "error",
];
const knowledgeLogColumnLabels: Record<KnowledgeLogColumnKey, string> = {
  kind: "类型",
  target: "对象",
  status: "状态",
  stage: "阶段",
  progress: "进度",
  time: "时间",
  detail: "详情",
  error: "错误",
};
const knowledgeLogColumnMinWidths: Record<KnowledgeLogColumnKey, number> = {
  kind: 82,
  target: 220,
  status: 96,
  stage: 150,
  progress: 78,
  time: 122,
  detail: 220,
  error: 180,
};
const knowledgeLogColumnWidths = ref<Record<KnowledgeLogColumnKey, number>>({
  kind: 110,
  target: 320,
  status: 120,
  stage: 220,
  progress: 92,
  time: 142,
  detail: 380,
  error: 320,
});
const knowledgeLogResizing = ref<{
  key: KnowledgeLogColumnKey;
  startX: number;
  startWidth: number;
} | null>(null);
const knowledgeReviewStatus = ref("pending");
const knowledgeReviewItems = ref<KnowledgeReviewItem[]>([]);
const selectedKnowledgeReviewId = ref("");
let knowledgeReviewRequestGeneration = 0;
let knowledgeReviewBusyGeneration = 0;
const selectedKnowledgeReviewItem = computed(() => {
  const selected = knowledgeReviewItems.value.find(
    (item) => item.reviewId === selectedKnowledgeReviewId.value,
  );
  return selected || knowledgeReviewItems.value[0] || null;
});
const knowledgeSearchResults = ref<KnowledgeSearchResult[]>([]);
const knowledgeSearchResponse = ref<KnowledgeSearchResponse | null>(null);
const lastKnowledgeSearchQuery = ref("");
const selectedEvidence = ref<EvidencePack | null>(null);
const selectedEvidenceId = ref("");
const evidenceLoadError = ref("");
const agentEvidencePreviewOpen = ref(false);
const selectedEvidenceDisplayTitle = computed(() =>
  selectedEvidence.value ? evidenceDisplayTitle(selectedEvidence.value) : selectedEvidenceId.value || "来源详情",
);
let evidenceLoadSequence = 0;
const ingestFiles = ref<File[]>([]);
const ingestProgress = ref("");
const ingestJob = ref<SplitJob | null>(null);
const uploadTraceEvents = ref<ProtocolEvent[]>([]);
const normalizedManifest = ref<NormalizedDocumentsManifest | null>(null);
const localSourceForm = ref({
  label: "",
  directoryPath: "",
  autoSync: true,
  recursive: true,
  hydrationEnabled: true,
});
const pathPicker = ref<PathPickerState>({
  open: false,
  title: "选择路径",
  mode: "directory",
  value: "",
  extensions: [],
  includeHidden: false,
  loading: false,
  error: "",
  response: null,
  closeOnSelect: true,
  applyPath: () => {},
});

const baseServerEventTopics = [
  "server.lifecycle",
  "system.interfaces",
  "system.console_state",
  "discovery.config",
  "discovery.clients",
  "runtime.mounts",
  "settings.current",
  "email_rules.current",
  "expert_vocabulary.current",
  "knowledge.golden_rules",
  "uploads.session",
  "uploads.trace",
  "jobs.job",
  "jobs.deleted",
  "storage.summary",
  "knowledge.changes",
  "knowledge.review_items",
  "knowledge.sources",
  "knowledge.word_clouds",
  "maintenance.agent.config",
  "maintenance.agent.plan.created",
  "maintenance.agent.approval.required",
  "maintenance.agent.run.started",
  "maintenance.agent.tool.started",
  "maintenance.agent.tool.completed",
  "maintenance.agent.tool.failed",
  "maintenance.agent.run.completed",
  "agent_sync.config",
];

function currentServerEventTopics() {
  const topics = baseServerEventTopics.filter((topic) => {
    if (topic.startsWith("knowledge.") || topic === "email_rules.current" || topic === "expert_vocabulary.current") {
      return hasFeature("knowledge-core");
    }
    if (topic.startsWith("maintenance.agent.")) {
      return hasFeature("maintenance-agent-runbooks");
    }
    if (topic === "agent_sync.config") {
      return hasFeature("agent-gateway");
    }
    return true;
  });
  return topics.join(",");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeModelLibraryEntries(value: unknown): CloudProvider[] {
  const allowed = new Set(modelLibraryProviderDefinitions.map((item) => item.id));
  const entries = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return entries
    .map((item) => String(item || "").trim() as CloudProvider)
    .filter((item: any) => {
      if (!allowed.has(item) || seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
}

function modelAgentUid(...parts: unknown[]) {
  const source = parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join("\n") || String(Date.now());
  let hash = 2166136261;
  let hash2 = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    hash ^= code;
    hash = Math.imul(hash, 16777619);
    hash2 ^= code + index + 1;
    hash2 = Math.imul(hash2, 16777619);
  }
  const partA = (hash >>> 0).toString(16).padStart(8, "0");
  const partB = (hash2 >>> 0).toString(16).padStart(8, "0");
  return `agent_${partA}${partB}`;
}

function modelEntryStringField(entry: Partial<AgentModelConfig>, keys: string[]) {
  const record = asRecord(entry) || {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return String(record[key] ?? "").trim();
    }
  }
  return undefined;
}

function normalizeAgentModuleAccess(value?: Partial<AgentModuleAccess>): AgentModuleAccess {
  const record = asRecord(value) || {};
  const mode = String(record.mode || "").trim() === "selected" ? "selected" : "all";
  const moduleIds = Array.isArray(record.moduleIds)
    ? record.moduleIds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return {
    mode,
    moduleIds: [...new Set(moduleIds)],
  };
}

function normalizeAgentPermissionGroupDraft(
  value: Partial<AgentPermissionGroup>,
  index = 0,
): AgentPermissionGroup {
  const record = asRecord(value) || {};
  const id =
    String(record.id || "").trim() ||
    `agent-permission-${Date.now()}-${index + 1}`;
  const normalizeList = (input: unknown) =>
    [...new Set(Array.isArray(input) ? input.map((item) => String(item || "").trim()).filter(Boolean) : [])];
  return {
    id,
    label: String(record.label || id).trim(),
    description: String(record.description || "").trim(),
    enabled: record.enabled !== false,
    scopeIds: normalizeList(record.scopeIds),
    toolsetIds: normalizeList(record.toolsetIds),
    toolAllow: normalizeList(record.toolAllow),
    toolDeny: normalizeList(record.toolDeny),
  };
}

function normalizeAgentPermissionGroupsDraft(value: unknown): AgentPermissionGroup[] {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : [])
    .map((item, index) => normalizeAgentPermissionGroupDraft(item as Partial<AgentPermissionGroup>, index))
    .filter((item: any) => {
      if (!item.id || seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
}

function normalizeModelEntry(entry: Partial<AgentModelConfig>, index = 0): AgentModelConfig {
  const provider = String(entry.provider || "") as CloudProvider;
  const model = modelEntryStringField(entry, ["model", "engine"]) ?? "";
  const label =
    modelEntryStringField(entry, ["label", "agentName"]) ??
    (String(entry.alias || "").trim() || `${providerLabel(provider)}${model ? ` ${model}` : " 智能体"}`.trim());
  const agentName = modelEntryStringField(entry, ["agentName", "label"]) ?? label;
  const engine = modelEntryStringField(entry, ["engine", "model"]) ?? "";
  const existingInstanceId = String(entry.instanceId || "").trim();
  const explicitUid = String(entry.uid || "").trim();
  const existingAlias = String(entry.alias || "").trim();
  const uid = explicitUid ||
    (existingInstanceId.startsWith("agent_") ? existingInstanceId : "") ||
    (existingAlias.startsWith("agent_") ? existingAlias : "") ||
    modelAgentUid(provider, existingInstanceId || existingAlias || index + 1);
  return {
    uid,
    instanceId: uid,
    provider,
    alias: uid,
    label,
    baseUrl: String(entry.baseUrl || (provider === "deepseek" ? settingsDraft.value.deepSeekBaseUrl : "") || "").trim(),
    url: String(entry.url || "").trim(),
    model,
    apiKey: String(entry.apiKey || "").trim(),
    apiKeyConfigured: entry.apiKeyConfigured === true,
    token: String(entry.token || "").trim(),
    tokenConfigured: entry.tokenConfigured === true,
    tokenHeader: String(entry.tokenHeader || "token").trim(),
    tokenPrefix: String(entry.tokenPrefix || "").trim(),
    agentName,
    engine,
    pluginList: Array.isArray(entry.pluginList) ? entry.pluginList : [],
    systemPrompt: String(entry.systemPrompt || "").trim(),
    parameters: asRecord(entry.parameters) || {},
    moduleAccess: normalizeAgentModuleAccess(entry.moduleAccess),
    permissionGroupId: String(entry.permissionGroupId || "").trim(),
    parametersText:
      String(entry.parametersText || "").trim() ||
      JSON.stringify(asRecord(entry.parameters) || {}, null, 2),
    timeoutMs: Number(entry.timeoutMs || (provider === "deepseek" ? settingsDraft.value.deepSeekTimeoutMs : 120000)),
  };
}

function normalizeModelLibraryAgents(settings: AgentSettings): AgentModelConfig[] {
  const models = Array.isArray(settings.modelLibraryAgents)
    ? settings.modelLibraryAgents
    : [];
  return models.map((item, index) => normalizeModelEntry(item, index));
}

function modelEntryParameters(entry: AgentModelConfig) {
  try {
    return JSON.parse(String(entry.parametersText || "{}"));
  } catch {
    return asRecord(entry.parameters) || {};
  }
}

function moduleAgentProfileJson(value?: string, fallback?: Record<string, unknown>) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return asRecord(parsed) || {};
  } catch {
    return fallback || {};
  }
}

function normalizeModuleAgentProfile(profile?: Partial<ModuleAgentProfile>): ModuleAgentProfile {
  const incoming = profile || {};
  const parameters = moduleAgentProfileJson(incoming.parametersText, asRecord(incoming.parameters) || {});
  const dependencyContext = moduleAgentProfileJson(
    incoming.dependencyContextText,
    asRecord(incoming.dependencyContext) || {},
  );
  return {
    enabled: incoming.enabled !== false,
    role: String(incoming.role || "primary").trim() || "primary",
    contextProfileId: String(incoming.contextProfileId || "").trim(),
    systemPrompt: String(incoming.systemPrompt || "").trim(),
    parameters,
    parametersText: String(incoming.parametersText || "").trim() || JSON.stringify(parameters, null, 2),
    dependencyContext,
    dependencyContextText:
      String(incoming.dependencyContextText || "").trim() ||
      JSON.stringify(dependencyContext, null, 2),
  };
}

function normalizeModuleAgentProfilesForDraft(settings: AgentSettings) {
  const incoming = asRecord(settings.moduleAgentProfiles) || {};
  const next: AgentSettings["moduleAgentProfiles"] = {};
  for (const moduleDefinition of moduleGroupDefinitions) {
    const group = asRecord(incoming[moduleDefinition.id]) || {};
    const agents = asRecord(group.agents) || {};
    const nextAgents: Record<string, ModuleAgentProfile> = {};
    for (const [agentId, profile] of Object.entries(agents)) {
      const normalizedAgentId = String(agentId || "").trim();
      if (!normalizedAgentId) {
        continue;
      }
      nextAgents[normalizedAgentId] = normalizeModuleAgentProfile(profile as Partial<ModuleAgentProfile>);
    }
    const assignment = settings.moduleModelAssignments?.[moduleDefinition.id];
    const primaryAgent = String(group.primaryAgent || assignment?.model || "").trim();
    if (primaryAgent && !nextAgents[primaryAgent]) {
      nextAgents[primaryAgent] = normalizeModuleAgentProfile({ role: "primary" });
    }
    if (primaryAgent || Object.keys(nextAgents).length > 0) {
      next[moduleDefinition.id] = {
        primaryAgent,
        agents: nextAgents,
      };
    }
  }
  return next;
}

function moduleAgentProfilesPayload() {
  const next: AgentSettings["moduleAgentProfiles"] = {};
  for (const [moduleId, group] of Object.entries(settingsDraft.value.moduleAgentProfiles || {})) {
    const agents: Record<string, ModuleAgentProfile> = {};
    for (const [agentId, profile] of Object.entries(group.agents || {})) {
      const normalizedAgentId = String(agentId || "").trim();
      if (!normalizedAgentId) {
        continue;
      }
      const normalizedProfile = normalizeModuleAgentProfile(profile);
      agents[normalizedAgentId] = {
        enabled: normalizedProfile.enabled,
        role: normalizedProfile.role,
        contextProfileId: normalizedProfile.contextProfileId,
        systemPrompt: normalizedProfile.systemPrompt,
        parameters: normalizedProfile.parameters,
        dependencyContext: normalizedProfile.dependencyContext,
      };
    }
    if (Object.keys(agents).length > 0 || group.primaryAgent) {
      next[moduleId] = {
        primaryAgent: String(group.primaryAgent || "").trim(),
        agents,
      };
    }
  }
  return next;
}

function normalizeHttpAdapterSettings(settings: AgentSettings): AgentSettings {
  const adapter = {
    ...emptySettings.customHttpAdapter,
    ...(settings.customHttpAdapter || {}),
  };
  const alias = String(
    settings.customModelAlias ||
      adapter.alias ||
      settings.customModelLabel ||
      "external-agent",
  ).trim();
  const label = String(
    settings.customModelLabel || adapter.label || "自定义 HTTP 模型",
  ).trim();
  const nextAdapter = {
    ...adapter,
    alias,
    label,
  };
  const customHttpAdapters = [
    nextAdapter,
    ...(settings.customHttpAdapters || []).filter(
      (item) => item.alias && item.alias !== alias,
    ),
  ];
  return {
    ...settings,
    modelLibraryEntries: normalizeModelLibraryEntries(settings.modelLibraryEntries),
    modelLibraryAgents: normalizeModelLibraryAgents(settings),
    agentPermissionGroups: normalizeAgentPermissionGroupsDraft(settings.agentPermissionGroups),
    agentExploreDefaults: {
      ...emptySettings.agentExploreDefaults,
      ...(settings.agentExploreDefaults || {}),
    },
    agentToolExecution: {
      http: {
        ...emptySettings.agentToolExecution.http,
        ...(settings.agentToolExecution?.http || {}),
      },
      local: {
        ...emptySettings.agentToolExecution.local,
        ...(settings.agentToolExecution?.local || {}),
        commands: Array.isArray(settings.agentToolExecution?.local?.commands)
          ? settings.agentToolExecution.local.commands
          : emptySettings.agentToolExecution.local.commands,
      },
    },
    moduleAgentProfiles: normalizeModuleAgentProfilesForDraft(settings),
    customModelAlias: alias,
    customModelLabel: label,
    customHttpAdapter: nextAdapter,
    customHttpAdapters,
  };
}

function settingsPayloadForSave() {
  const normalized = normalizeHttpAdapterSettings(settingsDraft.value);
  normalized.modelLibraryAgents = visibleModelEntries.value.map((entry, index) => ({
    ...normalizeModelEntry(entry, index),
    parameters: modelEntryParameters(entry),
  }));
  normalized.modelLibraryEntries = [
    ...new Set(normalized.modelLibraryAgents.map((entry) => String(entry.provider || "").trim()).filter(Boolean)),
  ] as CloudProvider[];
  normalized.moduleModelAssignments = Object.fromEntries(
    Object.entries(normalized.moduleModelAssignments || {}).filter(([moduleId, assignment]) => {
      if (!moduleNeedsIntelligence(moduleId)) {
        return false;
      }
      return moduleModelAssignmentOptions(moduleId).some(
        (option) => option.ref === modelRef(assignment.provider, assignment.model),
      );
    }),
  );
  normalized.moduleAgentProfiles = moduleAgentProfilesPayload();
  return normalized;
}

function applyAgentExploreDefaultsFromSettings() {
  if (agentExploreHydrated.value || agentExploreForm.value.query || agentExploreForm.value.workspaceId) {
    return;
  }
  agentExploreForm.value = {
    ...agentExploreForm.value,
    contextProfileId: String(settingsDraft.value.agentExploreDefaults?.contextProfileId || agentExploreForm.value.contextProfileId || "context-128k"),
    thinkingMode: normalizedAgentExploreThinkingMode(settingsDraft.value.agentExploreDefaults?.thinkingMode),
    temperature: agentExploreConfiguredTemperature.value,
    maxTokens: agentExploreConfiguredMaxTokens.value,
    maxIterations: agentExploreConfiguredMaxIterations.value,
    limit: agentExploreConfiguredLimit.value,
    toolChoice: agentExploreConfiguredToolChoice.value,
  };
}

function boundedAgentExploreNumber(value: unknown, fallback: number, min: number, max: number) {
  const next = Number(value);
  return Math.max(min, Math.min(Number.isFinite(next) ? next : fallback, max));
}

const agentExploreConfiguredMaxIterations = computed(() =>
  boundedAgentExploreNumber(
    settingsDraft.value.agentExploreDefaults?.maxIterations,
    emptySettings.agentExploreDefaults.maxIterations,
    1,
    8,
  ),
);
const agentExploreConfiguredLimit = computed(() =>
  boundedAgentExploreNumber(
    settingsDraft.value.agentExploreDefaults?.limit,
    emptySettings.agentExploreDefaults.limit,
    1,
    20,
  ),
);
const agentExploreConfiguredTemperature = computed(() =>
  boundedAgentExploreNumber(
    settingsDraft.value.agentExploreDefaults?.temperature,
    emptySettings.agentExploreDefaults.temperature,
    0,
    2,
  ),
);
const agentExploreConfiguredMaxTokens = computed(() =>
  boundedAgentExploreNumber(
    settingsDraft.value.agentExploreDefaults?.maxTokens,
    emptySettings.agentExploreDefaults.maxTokens,
    128,
    32000,
  ),
);
const agentExploreConfiguredToolChoice = computed(() =>
  String(settingsDraft.value.agentExploreDefaults?.toolChoice || emptySettings.agentExploreDefaults.toolChoice || "auto").trim() || "auto",
);
const agentExploreTabs = computed(() =>
  normalizeAgentExploreHistoryList([
    ...agentExploreDraftTabs.value,
    ...agentExploreHistory.value,
  ]).filter((session) => !agentExploreClosedTabIds.value.has(session.runId)),
);
const agentExploreSplitStyle = computed<Record<string, string>>(() => ({
  "--agent-explore-left": `${agentExploreSplitLeftPercent.value}%`,
}));

function clampAgentExploreSplitPercent(value: number) {
  return Math.max(28, Math.min(Number.isFinite(value) ? value : 42, 68));
}

function updateAgentExploreSplitFromClientX(clientX: number) {
  const element = agentExploreSplitRef.value;
  if (!element) {
    return;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0) {
    return;
  }
  agentExploreSplitLeftPercent.value = clampAgentExploreSplitPercent(
    ((clientX - rect.left) / rect.width) * 100,
  );
}

function stopAgentExploreSplitResize() {
  if (typeof document !== "undefined") {
    document.removeEventListener("pointermove", handleAgentExploreSplitPointerMove);
    document.removeEventListener("pointerup", stopAgentExploreSplitResize);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
  agentExploreSplitDragging.value = false;
}

function handleAgentExploreSplitPointerMove(event: PointerEvent) {
  updateAgentExploreSplitFromClientX(event.clientX);
}

function startAgentExploreSplitResize(event: PointerEvent) {
  event.preventDefault();
  agentExploreSplitDragging.value = true;
  updateAgentExploreSplitFromClientX(event.clientX);
  document.addEventListener("pointermove", handleAgentExploreSplitPointerMove);
  document.addEventListener("pointerup", stopAgentExploreSplitResize);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function handleAgentExploreSplitKeydown(event: KeyboardEvent) {
  const step = event.shiftKey ? 5 : 2;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    agentExploreSplitLeftPercent.value = clampAgentExploreSplitPercent(
      agentExploreSplitLeftPercent.value - step,
    );
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    agentExploreSplitLeftPercent.value = clampAgentExploreSplitPercent(
      agentExploreSplitLeftPercent.value + step,
    );
  } else if (event.key === "Home") {
    event.preventDefault();
    agentExploreSplitLeftPercent.value = 28;
  } else if (event.key === "End") {
    event.preventDefault();
    agentExploreSplitLeftPercent.value = 68;
  }
}

function syncKnowledgeLogTableScrollLeft(fallback?: unknown) {
  const record = asRecord(fallback);
  const directValue = Number(record?.scrollLeft);
  if (Number.isFinite(directValue)) {
    knowledgeLogTableScrollLeft.value = Math.max(0, directValue);
    return;
  }
  const scrollWrap = knowledgeLogTableShellRef.value?.querySelector<HTMLElement>(".el-scrollbar__wrap");
  knowledgeLogTableScrollLeft.value = Math.max(0, Number(scrollWrap?.scrollLeft || 0));
}

function handleKnowledgeLogTableScroll(payload: unknown) {
  syncKnowledgeLogTableScrollLeft(payload);
}

function stopKnowledgeLogColumnResize() {
  if (typeof document !== "undefined") {
    document.removeEventListener("pointermove", handleKnowledgeLogColumnPointerMove);
    document.removeEventListener("pointerup", stopKnowledgeLogColumnResize);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
  knowledgeLogResizing.value = null;
}

function handleKnowledgeLogColumnPointerMove(event: PointerEvent) {
  const resizing = knowledgeLogResizing.value;
  if (!resizing) {
    return;
  }
  const minWidth = knowledgeLogColumnMinWidths[resizing.key];
  const nextWidth = Math.max(minWidth, resizing.startWidth + event.clientX - resizing.startX);
  knowledgeLogColumnWidths.value = {
    ...knowledgeLogColumnWidths.value,
    [resizing.key]: Math.round(nextWidth),
  };
}

function startKnowledgeLogColumnResize(event: PointerEvent, key: KnowledgeLogColumnKey) {
  event.preventDefault();
  event.stopPropagation();
  syncKnowledgeLogTableScrollLeft();
  knowledgeLogResizing.value = {
    key,
    startX: event.clientX,
    startWidth: knowledgeLogColumnWidths.value[key],
  };
  document.addEventListener("pointermove", handleKnowledgeLogColumnPointerMove);
  document.addEventListener("pointerup", stopKnowledgeLogColumnResize);
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function handleKnowledgeLogColumnDividerKeydown(event: KeyboardEvent, key: KnowledgeLogColumnKey) {
  const step = event.shiftKey ? 24 : 8;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return;
  }
  event.preventDefault();
  const direction = event.key === "ArrowLeft" ? -1 : 1;
  knowledgeLogColumnWidths.value = {
    ...knowledgeLogColumnWidths.value,
    [key]: Math.max(
      knowledgeLogColumnMinWidths[key],
      knowledgeLogColumnWidths.value[key] + direction * step,
    ),
  };
}

function handleAgentExploreTraceToggle(event: Event) {
  agentExploreTraceOpen.value = Boolean((event.currentTarget as HTMLDetailsElement | null)?.open);
}

async function clearIndexedDbDatabases() {
  if (!("indexedDB" in window) || typeof window.indexedDB.databases !== "function") {
    return [];
  }
  const databases = await window.indexedDB.databases();
  const names = databases
    .map((database) => String(database.name || "").trim())
    .filter(Boolean);
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          const request = window.indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        }),
    ),
  );
  return names;
}

async function clearBrowserCacheStorage() {
  if (!("caches" in window)) {
    return [];
  }
  const names = await window.caches.keys();
  await Promise.all(names.map((name) => window.caches.delete(name)));
  return names;
}

async function unregisterServiceWorkers() {
  if (!("serviceWorker" in navigator)) {
    return 0;
  }
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  return registrations.length;
}

async function clearBrowserLocalStateFromUrl() {
  if (typeof window === "undefined") {
    return false;
  }
  const url = new URL(window.location.href);
  if (url.searchParams.get(CLEAR_LOCAL_STATE_PARAM) !== "1") {
    return false;
  }
  const report: Record<string, unknown> = {
    localStorageKeys: Object.keys(window.localStorage || {}),
    sessionStorageKeys: Object.keys(window.sessionStorage || {}),
    clearedAt: new Date().toISOString(),
  };
  try {
    report.indexedDbNames = await clearIndexedDbDatabases();
  } catch (nextError) {
    report.indexedDbError = nextError instanceof Error ? nextError.message : String(nextError);
  }
  try {
    report.cacheNames = await clearBrowserCacheStorage();
  } catch (nextError) {
    report.cacheStorageError = nextError instanceof Error ? nextError.message : String(nextError);
  }
  try {
    report.serviceWorkers = await unregisterServiceWorkers();
  } catch (nextError) {
    report.serviceWorkerError = nextError instanceof Error ? nextError.message : String(nextError);
  }
  window.localStorage.clear();
  window.sessionStorage.clear();
  infoFeedKeywordCache.clear();
  url.searchParams.delete(CLEAR_LOCAL_STATE_PARAM);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  (window as Window & { __pactLocalStateClearReport?: Record<string, unknown> }).__pactLocalStateClearReport = report;
  return true;
}

watch(
  settingsDraft,
  () => {
    if (!applyingRemoteSettings) {
      settingsDraftDirty.value = true;
    }
  },
  { deep: true, flush: "sync" },
);

watch(
  discoveryDraft,
  () => {
    if (!applyingRemoteConsoleDrafts) {
      discoveryDraftDirty.value = true;
    }
  },
  { deep: true, flush: "sync" },
);

watch(
  mountDraft,
  () => {
    if (!applyingRemoteConsoleDrafts) {
      mountDraftDirty.value = true;
    }
  },
  { deep: true, flush: "sync" },
);

watch(
  rulesText,
  () => {
    if (!applyingRemoteConsoleDrafts) {
      rulesDraftDirty.value = true;
    }
  },
  { flush: "sync" },
);

watch(
  expertVocabularyDraft,
  () => {
    if (!applyingRemoteConsoleDrafts) {
      expertVocabularyDraftDirty.value = true;
    }
  },
  { deep: true, flush: "sync" },
);

watch(
  agentExploreForm,
  () => {
    persistAgentExploreState();
  },
  { deep: true },
);

watch(
  agentExploreResult,
  () => {
    persistAgentExploreState();
  },
  { deep: true },
);

watch(knowledgeReviewStatus, () => {
  if (currentView.value === "knowledge" && knowledgeTab.value === "conflicts") {
    void refreshKnowledgeConflicts();
  }
});

watch(knowledgeManagementPanel, (panel) => {
  if (currentView.value !== "knowledge" || knowledgeTab.value !== "management") {
    return;
  }
  if (panel === "rules") {
    void refreshExpertRules();
  } else {
    void refreshKnowledgeConsole();
  }
});

watch(
  knowledgeReviewItems,
  (items) => {
    if (!items.length) {
      selectedKnowledgeReviewId.value = "";
      return;
    }
    if (!items.some((item) => item.reviewId === selectedKnowledgeReviewId.value)) {
      selectedKnowledgeReviewId.value = String(items[0]?.reviewId || "");
    }
  },
  { deep: true },
);

function normalizedSettingsFromServer(settings: AgentSettings) {
  return normalizeHttpAdapterSettings({
    ...emptySettings,
    ...settings,
  });
}

function remoteDraftEquals(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function settingsDraftEquals(left: AgentSettings, right: AgentSettings) {
  return remoteDraftEquals(left, right);
}

function replaceSettingsDraftFromServer(
  settings: AgentSettings,
  options: { markClean?: boolean } = {},
) {
  const normalized = normalizedSettingsFromServer(settings);
  if (settingsDraftEquals(settingsDraft.value, normalized)) {
    if (options.markClean !== false) {
      settingsDraftDirty.value = false;
    }
    return;
  }
  applyingRemoteSettings = true;
  settingsDraft.value = normalized;
  if (options.markClean !== false) {
    settingsDraftDirty.value = false;
  }
  window.queueMicrotask(() => {
    applyingRemoteSettings = false;
  });
}

function applyRemoteConsoleDraftUpdate(update: () => void) {
  applyingRemoteConsoleDrafts = true;
  try {
    update();
  } finally {
    applyingRemoteConsoleDrafts = false;
  }
}

function replaceDiscoveryDraftFromServer(
  value: Partial<DiscoveryConfig> | null | undefined,
  options: { markClean?: boolean } = {},
) {
  const nextDraft = {
    ...emptyDiscovery,
    ...(value || {}),
  };
  if (remoteDraftEquals(discoveryDraft.value, nextDraft)) {
    if (options.markClean !== false) {
      discoveryDraftDirty.value = false;
    }
    return;
  }
  applyRemoteConsoleDraftUpdate(() => {
    discoveryDraft.value = nextDraft;
    if (options.markClean !== false) {
      discoveryDraftDirty.value = false;
    }
  });
}

function replaceMountDraftFromServer(
  value: Record<string, string> | null | undefined,
  options: { markClean?: boolean } = {},
) {
  const nextDraft = {
    ...(value || {}),
  };
  if (remoteDraftEquals(mountDraft.value, nextDraft)) {
    if (options.markClean !== false) {
      mountDraftDirty.value = false;
    }
    return;
  }
  applyRemoteConsoleDraftUpdate(() => {
    mountDraft.value = nextDraft;
    if (options.markClean !== false) {
      mountDraftDirty.value = false;
    }
  });
}

function replaceRulesDraftFromServer(
  rules: EmailRuleSet,
  options: { markClean?: boolean } = {},
) {
  const nextText = JSON.stringify(rules, null, 2);
  if (rulesText.value === nextText) {
    if (options.markClean !== false) {
      rulesDraftDirty.value = false;
    }
    return;
  }
  applyRemoteConsoleDraftUpdate(() => {
    rulesText.value = nextText;
    if (options.markClean !== false) {
      rulesDraftDirty.value = false;
    }
  });
}

function replaceExpertVocabularyDraftFromServer(
  vocabulary: ExpertVocabulary | null | undefined,
  options: { markClean?: boolean } = {},
) {
  const nextDraft = cloneExpertVocabulary(
    vocabulary || emptyExpertVocabulary,
  );
  if (remoteDraftEquals(expertVocabularyDraft.value, nextDraft)) {
    if (options.markClean !== false) {
      expertVocabularyDraftDirty.value = false;
    }
    return;
  }
  applyRemoteConsoleDraftUpdate(() => {
    expertVocabularyDraft.value = nextDraft;
    if (options.markClean !== false) {
      expertVocabularyDraftDirty.value = false;
    }
  });
}

function applyConsoleState(
  nextState: ServerConsoleState,
  options: { forceSettings?: boolean; forceDrafts?: boolean } = {},
) {
  const nextSettings = normalizedSettingsFromServer(nextState.settings.value);
  consoleState.value = {
    ...nextState,
    settings: {
      ...nextState.settings,
      value: nextSettings,
    },
  };
  if (options.forceSettings || !settingsDraftDirty.value) {
    replaceSettingsDraftFromServer(nextSettings);
  }
  applyAgentExploreDefaultsFromSettings();
  if (options.forceDrafts || !discoveryDraftDirty.value) {
    replaceDiscoveryDraftFromServer(nextState.discovery.value);
  }
  if (options.forceDrafts || !mountDraftDirty.value) {
    replaceMountDraftFromServer(nextState.runtime.mountModules || {});
  }
  if (options.forceDrafts || !rulesDraftDirty.value) {
    replaceRulesDraftFromServer(nextState.emailRules.rules);
  }
  if (options.forceDrafts || !expertVocabularyDraftDirty.value) {
    replaceExpertVocabularyDraftFromServer(
      nextState.expertVocabulary.vocabulary,
    );
  }
  maintenanceAgentConfig.value = nextState.maintenanceAgent?.config
    ? JSON.parse(JSON.stringify(nextState.maintenanceAgent.config))
    : null;
  maintenanceAgentRuns.value = nextState.maintenanceAgent?.runs || [];
  selectedMaintenanceAgentRun.value =
    maintenanceAgentRuns.value.find(
      (run) => run.runId === selectedMaintenanceAgentRun.value?.runId,
    ) ||
    selectedMaintenanceAgentRun.value ||
    maintenanceAgentRuns.value[0] ||
    null;
}

function recalculateJobSummary(items: SplitJob[]) {
  return {
    totalCount: items.length,
    queuedCount: items.filter((job) => job.status === "queued").length,
    runningCount: items.filter((job) => job.status === "running").length,
    completedCount: items.filter((job) => job.status === "completed").length,
    failedCount: items.filter((job) => job.status === "failed").length,
  };
}

function upsertJobFromEvent(job: SplitJob) {
  if (!consoleState.value || !job?.id) {
    return false;
  }
  const existingItems = consoleState.value.jobs.items || [];
  const nextItems = [
    job,
    ...existingItems.filter((item: any) => item.id !== job.id),
  ].sort((left, right) =>
    String(right.createdAt || "").localeCompare(String(left.createdAt || "")),
  );
  consoleState.value = {
    ...consoleState.value,
    jobs: {
      summary: recalculateJobSummary(nextItems),
      items: nextItems,
    },
  };
  if (ingestJob.value?.id === job.id) {
    ingestJob.value = job;
    if (job.status === "completed") {
      void refreshIngestJob({ silent: true });
    }
  }
  applyJobToKnowledgeSources(job);
  return true;
}

function applyJobToKnowledgeSources(job: SplitJob) {
  if (!knowledgeSourceState.value || !job?.id) {
    return;
  }
  knowledgeSourceState.value = {
    ...knowledgeSourceState.value,
    sources: knowledgeSourceState.value.sources.map((source) =>
      source.lastJobId === job.id
        ? {
            ...source,
            lastJobStatus: job.status,
            lastJobStage: job.stage,
            lastJobProgressPercent: Number(job.progressPercent || 0),
            lastJobUpdatedAt: job.updatedAt,
          }
        : source,
    ),
  };
}

function removeJobFromEvent(jobId: string) {
  if (!consoleState.value || !jobId) {
    return false;
  }
  const nextItems = (consoleState.value.jobs.items || []).filter(
    (item) => item.id !== jobId,
  );
  consoleState.value = {
    ...consoleState.value,
    jobs: {
      summary: recalculateJobSummary(nextItems),
      items: nextItems,
    },
  };
  return true;
}

function applyServerEvent(event: ProtocolEvent) {
  const payload = asRecord(event.payload);
  if (!payload) {
    return false;
  }

  if (event.topic === "system.console_state") {
    const state = asRecord(payload.state) as ServerConsoleState | null;
    if (!state) {
      return false;
    }
    applyConsoleState(state);
    return true;
  }

  if (event.topic === "uploads.trace") {
    const existingIds = new Set(uploadTraceEvents.value.map((item) => item.id));
    uploadTraceEvents.value = existingIds.has(event.id)
      ? uploadTraceEvents.value
      : [event, ...uploadTraceEvents.value].slice(0, 500);
    return true;
  }

  if (!consoleState.value) {
    return false;
  }

  if (event.topic === "jobs.job") {
    const job = asRecord(payload.job) as SplitJob | null;
    if (!job) {
      return false;
    }
    const handled = upsertJobFromEvent(job);
    if (["completed", "failed"].includes(String(job.status || ""))) {
      void refreshKnowledgeConflicts({ silent: true });
    }
    return handled;
  }

  if (event.topic === "jobs.deleted") {
    const job =
      (asRecord(payload.job) as SplitJob | null) ||
      (asRecord(payload.deletedJob) as SplitJob | null);
    return removeJobFromEvent(job?.id || String(payload.batchId || ""));
  }

  if (event.topic === "knowledge.sources") {
    const state = asRecord(payload.state) as KnowledgeSourceState | null;
    if (!state) {
      return false;
    }
    knowledgeSourceState.value = state;
    if (knowledgeConsole.value) {
      knowledgeConsole.value = {
        ...knowledgeConsole.value,
        sources: state,
      };
    }
    return true;
  }

  if (event.topic === "knowledge.word_clouds") {
    const wordBagSet = asRecord(payload.wordBagSet) as KnowledgeWordCloudSet | null;
    if (!wordBagSet) {
      return false;
    }
    // If this SSE event is the result of an auto-fill operation, merge terms
    // into the target word bag instead of replacing the whole word bag set.
    if (fillSourceWordBagSetId.value && wordBagSet.wordBagSetId === fillSourceWordBagSetId.value) {
      const targetId = fillTargetWordBagId.value;
      if (targetId) {
        const allTerms = (wordBagSet.wordBags || []).flatMap((c) => [
          ...(c.terms || []),
          ...(c.children || []).flatMap((ch) => ch.terms || []),
        ]);
        for (const term of allTerms) {
          addTermToCloud(targetId, term);
        }
        const isDone = wordBagSet.status === "ready" || wordBagSet.status === "completed" || wordBagSet.status === "error";
        if (isDone) {
          fillTargetWordBagId.value = null;
          fillSourceWordBagSetId.value = null;
          fillingWordBagIds.value = new Set([...fillingWordBagIds.value].filter((id) => id !== targetId));
        }
      }
      return true;
    }
    applySavedWordCloudSet(wordBagSet);
    return true;
  }

  if (event.topic === "knowledge.review_items" || event.topic === "knowledge.changes") {
    void refreshKnowledgeConflicts({ silent: true });
    return true;
  }

  if (event.topic === "settings.current") {
    const nextSettings = normalizedSettingsFromServer(payload as AgentSettings);
    consoleState.value = {
      ...consoleState.value,
      settings: {
        ...consoleState.value.settings,
        value: nextSettings,
      },
    };
    if (!settingsDraftDirty.value) {
      replaceSettingsDraftFromServer(nextSettings);
    }
    return true;
  }

  if (event.topic === "discovery.config") {
    const value = asRecord(payload.value) as DiscoveryConfig | null;
    if (!value) {
      return false;
    }
    consoleState.value = {
      ...consoleState.value,
      discovery: {
        ...consoleState.value.discovery,
        value,
        bootstrap: (asRecord(payload.bootstrap) as DiscoveryConfigResponse["bootstrap"] | null) ||
          consoleState.value.discovery.bootstrap,
      },
    };
    if (!discoveryDraftDirty.value) {
      replaceDiscoveryDraftFromServer(value);
    }
    return true;
  }

  if (event.topic === "runtime.mounts") {
    const runtime = asRecord(payload.runtime) as Partial<ServerConsoleState["runtime"]> | null;
    if (!runtime) {
      return false;
    }
    consoleState.value = {
      ...consoleState.value,
      runtime: {
        ...consoleState.value.runtime,
        ...runtime,
      },
    };
    if (!mountDraftDirty.value) {
      replaceMountDraftFromServer(consoleState.value.runtime.mountModules || {});
    }
    return true;
  }

  if (event.topic === "email_rules.current") {
    const rules = asRecord(payload.rules) as EmailRuleSet | null;
    if (!rules) {
      return false;
    }
    const emailRules = {
      path: String(payload.path || consoleState.value.emailRules.path || ""),
      rules,
    };
    consoleState.value = {
      ...consoleState.value,
      emailRules,
    };
    if (!rulesDraftDirty.value) {
      replaceRulesDraftFromServer(rules);
    }
    return true;
  }

  if (event.topic === "expert_vocabulary.current") {
    const vocabulary = asRecord(payload.vocabulary) as ExpertVocabulary | null;
    if (!vocabulary) {
      return false;
    }
    const expertVocabulary = {
      path: String(payload.path || consoleState.value.expertVocabulary.path || ""),
      vocabulary,
    };
    consoleState.value = {
      ...consoleState.value,
      expertVocabulary,
    };
    if (!expertVocabularyDraftDirty.value) {
      replaceExpertVocabularyDraftFromServer(vocabulary);
    }
    return true;
  }

  if (event.topic === "knowledge.golden_rules") {
    void refreshExpertRules({ silent: true });
    return true;
  }

  if (event.topic === "maintenance.agent.config") {
    const config = asRecord(payload.config) as MaintenanceAgentConfig | null;
    if (!config) {
      return false;
    }
    maintenanceAgentConfig.value = JSON.parse(JSON.stringify(config));
    consoleState.value = {
      ...consoleState.value,
      maintenanceAgent: {
        ...(consoleState.value.maintenanceAgent || {
          tools: [],
          latestRun: null,
          runs: [],
          activeRunId: "",
          queuedRunIds: [],
          pendingApprovalCount: 0,
          nextRunAt: "",
          auditPath: "",
          runsPath: "",
        }),
        config,
      },
    };
    return true;
  }

  if (event.topic.startsWith("maintenance.agent.")) {
    void refreshMaintenanceAgent({ silent: true });
    return true;
  }

  if (event.topic === "storage.summary") {
    consoleState.value = {
      ...consoleState.value,
      storage: payload as ServerConsoleState["storage"],
    };
    return true;
  }

  return false;
}

function providerLabel(provider: CloudProvider | string) {
  switch (provider) {
    case "openai-chatgpt":
      return "ChatGPT";
    case "google-gemini":
      return "Gemini";
    case "openrouter":
      return "OpenRouter";
    case "deepseek":
      return "DeepSeek";
    case "copilot":
      return "Copilot";
    case "custom-http":
      return "HTTP Adapter";
    case "local-model":
      return "本地模型";
    default:
      return provider || "未知";
  }
}

function modelRef(provider: string, model: string) {
  return `${provider}:${model || ""}`;
}

function parseModelRef(refValue: string) {
  const [provider, ...modelParts] = String(refValue || "").split(":");
  return {
    provider: (provider || "") as CloudProvider,
    model: modelParts.join(":") || "",
  };
}

function customHttpAdapterAlias() {
  return String(
    settingsDraft.value.customModelAlias ||
      settingsDraft.value.customHttpAdapter?.alias ||
      settingsDraft.value.customModelLabel ||
      "external-agent",
  ).trim();
}

function customHttpAdapterLabel() {
  return String(
    settingsDraft.value.customModelLabel ||
      settingsDraft.value.customHttpAdapter?.label ||
      "自定义 HTTP 模型",
  ).trim();
}

function modelProviderDefinition(provider: CloudProvider | string) {
  return modelLibraryProviderDefinitions.find((item) => item.id === provider);
}

const visibleModelProviders = computed(() =>
  normalizeModelLibraryEntries(settingsDraft.value.modelLibraryEntries),
);

const visibleModelEntries = computed(() => settingsDraft.value.modelLibraryAgents || []);

const addableModelProviders = computed(() => modelLibraryProviderDefinitions);

function providerConfigured(provider: CloudProvider) {
  switch (provider) {
    case "google-gemini":
      return settingsDraft.value.googleApiKeyConfigured || Boolean(settingsDraft.value.googleApiKey);
    case "openai-chatgpt":
      return Boolean(codexOAuthStatus.value?.valid);
    case "deepseek":
      return settingsDraft.value.deepSeekApiKeyConfigured || Boolean(settingsDraft.value.deepSeekApiKey);
    case "openrouter":
      return settingsDraft.value.openRouterApiKeyConfigured || Boolean(settingsDraft.value.openRouterApiKey);
    case "copilot":
      return Boolean(settingsDraft.value.copilotEndpoint || settingsDraft.value.copilotApiKeyConfigured || settingsDraft.value.copilotApiKey);
    case "custom-http":
      return Boolean(settingsDraft.value.customHttpAdapter?.url || settingsDraft.value.customHttpAdapter?.tokenConfigured || settingsDraft.value.customHttpAdapter?.token);
    case "local-model":
      return Boolean(settingsDraft.value.localModelEndpoint);
    default:
      return false;
  }
}

function modelEntryConfigured(entry: AgentModelConfig) {
  const hasModel = Boolean(String(entry.model ?? entry.engine ?? "").trim());
  if (entry.provider === "deepseek") {
    return hasModel && Boolean(entry.apiKey || entry.apiKeyConfigured || settingsDraft.value.deepSeekApiKey || settingsDraft.value.deepSeekApiKeyConfigured);
  }
  if (entry.provider === "custom-http") {
    return hasModel && Boolean((entry.url || settingsDraft.value.customHttpAdapter?.url) && (entry.token || entry.tokenConfigured || settingsDraft.value.customHttpAdapter?.tokenConfigured));
  }
  return hasModel && providerConfigured(entry.provider as CloudProvider);
}

function modelEntryStatusKey(entry: AgentModelConfig) {
  return entry.uid || entry.instanceId || entry.alias;
}

function modelEntryUidSet(entry: AgentModelConfig) {
  return new Set(
    [
      entry.uid,
      entry.instanceId,
      entry.alias,
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  );
}

function modelEntryMatchesUid(entry: AgentModelConfig, value?: string) {
  const normalized = String(value || "").trim();
  return Boolean(normalized && modelEntryUidSet(entry).has(normalized));
}

function modelEntryMatchesAssignment(
  entry: AgentModelConfig,
  provider?: string,
  modelUid?: string,
) {
  const normalizedProvider = String(provider || "").trim();
  const normalizedModelUid = String(modelUid || "").trim();
  if (!normalizedProvider || !normalizedModelUid || normalizedProvider !== entry.provider) {
    return false;
  }
  return modelEntryUidSet(entry).has(normalizedModelUid);
}

function addModelEntryBinding(
  bindings: ModelEntryBinding[],
  binding: ModelEntryBinding,
) {
  if (bindings.some((item) => item.bindingId === binding.bindingId)) {
    return;
  }
  bindings.push(binding);
}

function collectModelEntryBindings(entry: AgentModelConfig): ModelEntryBinding[] {
  const bindings: ModelEntryBinding[] = [];
  if (modelEntryMatchesUid(entry, infoFeedForm.value.modelAlias)) {
    addModelEntryBinding(bindings, {
      bindingId: "info-feed:form",
      category: "信息流",
      label: "信息流总结",
      detail: "当前信息流页面选用的总结智能体。",
      source: "draft",
    });
  }
  if (
    modelEntryMatchesUid(entry, infoFeedCurrentRun.value?.summary.modelAlias) &&
    infoFeedCurrentRun.value?.summary.status === "running"
  ) {
    addModelEntryBinding(bindings, {
      bindingId: `info-feed:running:${infoFeedCurrentRun.value.runId}`,
      category: "信息流",
      label: "正在运行的信息流",
      detail: `运行 ${infoFeedCurrentRun.value.runId} 正在使用该智能体。`,
      source: "runtime",
    });
  }
  if (modelEntryMatchesUid(entry, agentExploreForm.value.modelAlias)) {
    addModelEntryBinding(bindings, {
      bindingId: "agent-explore:form",
      category: "信息流",
      label: "智能检索",
      detail: "信息流中的智能检索面板显式选用了该智能体。",
      source: "draft",
    });
  }
  if (modelEntryMatchesUid(entry, ruleAuthoringForm.value.modelAlias)) {
    addModelEntryBinding(bindings, {
      bindingId: "rule-authoring:form",
      category: "知识库",
      label: "规则生成",
      detail: "知识库规则库的智能生成入口正在引用该智能体。",
      source: "draft",
    });
  }
  if (
    modelEntryMatchesUid(
      entry,
      settingsDraft.value.agentExploreDefaults?.reviewFusionModelAlias,
    )
  ) {
    addModelEntryBinding(bindings, {
      bindingId: "knowledge-review:fusion",
      category: "知识库",
      label: "知识融合智能体",
      detail: "冲突审核中的知识融合流程显式绑定该智能体。",
      source: "settings",
    });
  }
  for (const moduleDefinition of intelligentModuleDefinitions) {
    if (!moduleNeedsIntelligence(moduleDefinition.id)) {
      continue;
    }
    const assignment = settingsDraft.value.moduleModelAssignments?.[moduleDefinition.id];
    if (modelEntryMatchesAssignment(entry, assignment?.provider, assignment?.model)) {
      addModelEntryBinding(bindings, {
        bindingId: `module:${moduleDefinition.id}`,
        category: "模块模型分配",
        label: moduleDefinition.label,
        detail: moduleDefinition.description,
        source: "settings",
      });
    }
    const profileGroup = settingsDraft.value.moduleAgentProfiles?.[moduleDefinition.id];
    if (profileGroup?.agents?.[modelEntryStatusKey(entry)]) {
      addModelEntryBinding(bindings, {
        bindingId: `module-profile:${moduleDefinition.id}:${modelEntryStatusKey(entry)}`,
        category: "模块专属参数",
        label: `${moduleDefinition.label} 专属配置`,
        detail: "该智能体保存了模块/功能专属调用参数或依赖上下文。",
        source: "settings",
      });
    }
  }
  return bindings;
}

const modelEntryBindingsByKey = computed<Record<string, ModelEntryBinding[]>>(() => {
  const next: Record<string, ModelEntryBinding[]> = {};
  for (const entry of visibleModelEntries.value) {
    next[modelEntryStatusKey(entry)] = collectModelEntryBindings(entry);
  }
  return next;
});

function modelEntryBindings(entry: AgentModelConfig): ModelEntryBinding[] {
  return modelEntryBindingsByKey.value[modelEntryStatusKey(entry)] || [];
}

function modelEntryIsBound(entry: AgentModelConfig) {
  return modelEntryBindings(entry).length > 0;
}

function modelEntryBindingSummary(entry: AgentModelConfig) {
  const bindings = modelEntryBindings(entry);
  if (bindings.length === 0) {
    return "";
  }
  return bindings.map((item) => item.label).join("、");
}

function isModelLibraryCardExpanded(entry: AgentModelConfig) {
  return modelLibraryExpandedCards.value[modelEntryStatusKey(entry)] === true;
}

function toggleModelLibraryCard(entry: AgentModelConfig) {
  const key = modelEntryStatusKey(entry);
  modelLibraryExpandedCards.value = {
    ...modelLibraryExpandedCards.value,
    [key]: !modelLibraryExpandedCards.value[key],
  };
}

function modelEntryStatusLabel(entry: AgentModelConfig) {
  const probe = modelProbeResults.value[modelEntryStatusKey(entry)];
  if (probe) {
    return probe.ok ? "探测通过" : "探测失败";
  }
  return modelEntryConfigured(entry) ? "已配置" : "未配置";
}

function modelEntryStatusTone(entry: AgentModelConfig) {
  const probe = modelProbeResults.value[modelEntryStatusKey(entry)];
  if (probe) {
    return probe.ok ? "success" : "danger";
  }
  return modelEntryConfigured(entry) ? "neutral" : "muted";
}

function modelEntryProbeResult(entry: AgentModelConfig) {
  return modelProbeResults.value[modelEntryStatusKey(entry)] || null;
}

function modelEntryProbeStatusLabel(entry: AgentModelConfig) {
  const probe = modelEntryProbeResult(entry);
  if (!probe) {
    return "";
  }
  return probe.ok ? "探测通过" : "探测失败";
}

function modelEntryProbeStatusTone(entry: AgentModelConfig) {
  const probe = modelEntryProbeResult(entry);
  if (!probe) {
    return "neutral";
  }
  return probe.ok ? "success" : "danger";
}

function providerStatusLabel(provider: CloudProvider) {
  const probe = modelProbeResults.value[provider];
  if (probe) {
    return probe.ok ? "探测通过" : "探测失败";
  }
  return providerConfigured(provider) ? "已配置" : "未配置";
}

function providerStatusTone(provider: CloudProvider) {
  const probe = modelProbeResults.value[provider];
  if (probe) {
    return probe.ok ? "success" : "danger";
  }
  return providerConfigured(provider) ? "neutral" : "muted";
}

function addModelProvider() {
  const provider = selectedModelProvider.value;
  if (!provider) {
    return;
  }
  const entry = normalizeModelEntry({
    provider,
    model: "",
    label: `${providerLabel(provider)} 智能体`,
    baseUrl: provider === "deepseek" ? settingsDraft.value.deepSeekBaseUrl : "",
    timeoutMs: provider === "deepseek" ? settingsDraft.value.deepSeekTimeoutMs : 120000,
  }, Date.now());
  const key = modelEntryStatusKey(entry);
  settingsDraft.value.modelLibraryAgents = [
    entry,
    ...visibleModelEntries.value,
  ];
  modelLibraryExpandedCards.value = {
    ...modelLibraryExpandedCards.value,
    [key]: true,
  };
}

async function removeModelProvider(provider: CloudProvider | AgentModelConfig) {
  const entry = typeof provider === "string" ? null : provider;
  const removeKey = entry ? modelEntryStatusKey(entry) : String(provider);
  if (entry && modelEntryIsBound(entry)) {
    error.value = `智能体已绑定到 ${modelEntryBindingSummary(entry)}，请先解除引用后再删除。`;
    return;
  }
  const previousModels = [...visibleModelEntries.value];
  const previousEntries = [...visibleModelProviders.value];
  settingsDraft.value.modelLibraryAgents = entry
    ? visibleModelEntries.value.filter((item: any) => modelEntryStatusKey(item) !== removeKey)
    : visibleModelEntries.value.filter((item: any) => item.provider !== provider);
  const remainingExpandedCards = { ...modelLibraryExpandedCards.value };
  delete remainingExpandedCards[removeKey];
  modelLibraryExpandedCards.value = remainingExpandedCards;
  settingsDraft.value.modelLibraryEntries = [
    ...new Set(settingsDraft.value.modelLibraryAgents.map((item) => item.provider)),
  ] as CloudProvider[];
  setBusy(`model-remove:${removeKey}`);
  error.value = "";
  try {
    const saved = await bridge.saveSettings(settingsPayloadForSave());
    replaceSettingsDraftFromServer(saved);
  } catch (nextError) {
    settingsDraft.value.modelLibraryAgents = previousModels;
    settingsDraft.value.modelLibraryEntries = previousEntries;
    error.value =
      nextError instanceof Error ? nextError.message : "移除模型配置失败。";
  } finally {
    clearAllBusy();
  }
}

function duplicateModelEntry(entry: AgentModelConfig) {
  const copy = normalizeModelEntry({
    ...entry,
    uid: "",
    instanceId: "",
    alias: "",
    label: `${entry.label || entry.alias} 副本`,
    apiKey: "",
    token: "",
  }, Date.now());
  const key = modelEntryStatusKey(copy);
  settingsDraft.value.modelLibraryAgents = [copy, ...visibleModelEntries.value];
  modelLibraryExpandedCards.value = {
    ...modelLibraryExpandedCards.value,
    [key]: true,
  };
}

function modelProbeFailureResult(entry: AgentModelConfig, message: string): ModelProbeResponse {
  return {
    ok: false,
    configured: modelEntryConfigured(entry),
    provider: entry.provider,
    model: String(entry.model || entry.engine || ""),
    statusCode: 0,
    latencyMs: 0,
    checkedAt: new Date().toISOString(),
    message,
  };
}

function modelProbeSettingsForEntry(entry: AgentModelConfig) {
  const settings = settingsPayloadForSave();
  const cleanParameters = modelEntryParameters(entry);
  if (entry.provider === "google-gemini") {
    settings.googleModel = String(entry.model ?? "");
  }
  if (entry.provider === "openai-chatgpt") {
    settings.openAiModel = String(entry.model ?? "");
  }
  if (entry.provider === "deepseek") {
    settings.deepSeekBaseUrl = entry.baseUrl || settings.deepSeekBaseUrl;
    settings.deepSeekModel = String(entry.model ?? "");
    settings.deepSeekApiKey = entry.apiKey || "";
    settings.deepSeekApiKeyConfigured = Boolean(entry.apiKey || entry.apiKeyConfigured);
    settings.deepSeekTimeoutMs = Number(entry.timeoutMs || settings.deepSeekTimeoutMs);
  }
  if (entry.provider === "openrouter") {
    settings.openRouterModel = String(entry.model ?? "");
  }
  if (entry.provider === "copilot") {
    settings.copilotModel = String(entry.model ?? "");
  }
  if (entry.provider === "local-model") {
    settings.localModelName = String(entry.model ?? "");
  }
  if (entry.provider === "custom-http") {
    settings.customModelAlias = modelEntryStatusKey(entry);
    settings.customModelLabel = entry.label || modelEntryStatusKey(entry);
    const adapter = {
      ...settings.customHttpAdapter,
      alias: modelEntryStatusKey(entry),
      label: entry.label || modelEntryStatusKey(entry),
      url: entry.url || "",
      token: entry.token || "",
      tokenConfigured: entry.tokenConfigured,
      tokenHeader: entry.tokenHeader || "token",
      tokenPrefix: entry.tokenPrefix || "",
      agentName: entry.label || "",
      engine: entry.engine || entry.model || "",
      pluginList: entry.pluginList || [],
      parameters: cleanParameters,
      timeoutMs: Number(entry.timeoutMs || 120000),
    };
    settings.customHttpAdapter = adapter;
    settings.customHttpAdapters = [adapter];
  }
  return settings;
}

async function runModelEntryProbe(entry: AgentModelConfig): Promise<ModelProbeResponse> {
  if (!modelEntryConfigured(entry)) {
    return modelProbeFailureResult(entry, "模型配置不完整，未执行远程探测。");
  }
  return bridge.probeModel({
    provider: entry.provider,
    modelAlias: modelEntryStatusKey(entry),
    settings: modelProbeSettingsForEntry(entry),
  });
}

async function probeModelEntry(entry: AgentModelConfig) {
  const key = modelEntryStatusKey(entry);
  setBusy(`model-probe:${key}`);
  error.value = "";
  try {
    const result = await runModelEntryProbe(entry);
    modelProbeResults.value = {
      ...modelProbeResults.value,
      [key]: result,
    };
  } catch (nextError) {
    const message = nextError instanceof Error ? nextError.message : "模型探测失败。";
    modelProbeResults.value = {
      ...modelProbeResults.value,
      [key]: modelProbeFailureResult(entry, message),
    };
    error.value = message;
  } finally {
    clearAllBusy();
  }
}

async function probeModelLibraryBeforeSave() {
  const failures: Array<{ entry: AgentModelConfig; result: ModelProbeResponse }> = [];
  const nextResults: Record<string, ModelProbeResponse> = {};
  const nextNotices = { ...modelLibrarySaveProbeNotices.value };
  for (const entry of visibleModelEntries.value) {
    const key = modelEntryStatusKey(entry);
    try {
      const result = await runModelEntryProbe(entry);
      nextResults[key] = result;
      if (result.ok) {
        nextNotices[key] = "最近一次保存前连通性检测已通过，智能体已返回可用回答。";
      } else {
        delete nextNotices[key];
        failures.push({ entry, result });
      }
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "模型探测失败。";
      const result = modelProbeFailureResult(entry, message);
      nextResults[key] = result;
      delete nextNotices[key];
      failures.push({ entry, result });
    }
  }
  modelProbeResults.value = {
    ...modelProbeResults.value,
    ...nextResults,
  };
  modelLibrarySaveProbeNotices.value = nextNotices;
  return failures;
}

const agentModelAssignmentOptions = computed(() =>
  visibleModelEntries.value
    .map((entry) => ({
      provider: entry.provider as CloudProvider,
      value: modelEntryStatusKey(entry),
      label: agentExploreModelOptionLabel(entry),
      ref: modelRef(entry.provider, modelEntryStatusKey(entry)),
      enabled: modelEntryConfigured(entry),
    })),
);

function modelEntryModuleAccess(entry: AgentModelConfig): AgentModuleAccess {
  return normalizeAgentModuleAccess(entry.moduleAccess);
}

function modelEntryAllowsModule(entry: AgentModelConfig, moduleId: string) {
  const access = modelEntryModuleAccess(entry);
  return access.mode !== "selected" || access.moduleIds.includes(moduleId);
}

function setModelEntryModuleAccessMode(entry: AgentModelConfig, mode: string) {
  entry.moduleAccess = {
    ...modelEntryModuleAccess(entry),
    mode: mode === "selected" ? "selected" : "all",
  };
}

function toggleModelEntryModuleAccess(entry: AgentModelConfig, moduleId: string, checked: boolean) {
  const access = modelEntryModuleAccess(entry);
  const next = new Set(access.moduleIds);
  if (checked) {
    next.add(moduleId);
  } else {
    next.delete(moduleId);
  }
  entry.moduleAccess = {
    mode: "selected",
    moduleIds: [...next],
  };
}

function moduleModelAssignmentOptions(moduleId: string) {
  return agentModelAssignmentOptions.value.filter((option) => {
    const entry = visibleModelEntries.value.find((model) => modelEntryStatusKey(model) === option.value);
    return Boolean(entry && modelEntryAllowsModule(entry, moduleId));
  });
}

function modelProviderFromRef(refValue: string) {
  return parseModelRef(refValue).provider;
}

function moduleNeedsIntelligence(moduleId: string) {
  return settingsDraft.value.moduleIntelligence?.[moduleId] !== false;
}

function setModuleNeedsIntelligence(moduleId: string, enabled: boolean) {
  settingsDraft.value.moduleIntelligence = {
    ...(settingsDraft.value.moduleIntelligence || {}),
    [moduleId]: enabled,
  };
}

function ensureModuleAgentGroup(moduleId: string) {
  const groups = { ...(settingsDraft.value.moduleAgentProfiles || {}) };
  const group = groups[moduleId] || { primaryAgent: "", agents: {} };
  groups[moduleId] = {
    primaryAgent: String(group.primaryAgent || "").trim(),
    agents: { ...(group.agents || {}) },
  };
  settingsDraft.value.moduleAgentProfiles = groups;
  return groups[moduleId];
}

function ensureModuleAgentProfile(moduleId: string, agentId: string, defaults: Partial<ModuleAgentProfile> = {}) {
  const normalizedAgentId = String(agentId || "").trim();
  if (!normalizedAgentId) {
    return null;
  }
  const group = ensureModuleAgentGroup(moduleId);
  group.agents[normalizedAgentId] = normalizeModuleAgentProfile({
    ...(group.agents[normalizedAgentId] || {}),
    ...defaults,
    role: defaults.role || (group.primaryAgent === normalizedAgentId ? "primary" : "assistant"),
  });
  return group.agents[normalizedAgentId];
}

function removeModuleAgentProfile(moduleId: string, agentId: string) {
  const group = ensureModuleAgentGroup(moduleId);
  delete group.agents[agentId];
  if (group.primaryAgent === agentId) {
    group.primaryAgent = "";
    const nextAssignments = { ...(settingsDraft.value.moduleModelAssignments || {}) };
    delete nextAssignments[moduleId];
    settingsDraft.value.moduleModelAssignments = nextAssignments;
  }
}

function moduleAgentProfileRows(moduleId: string) {
  const group = settingsDraft.value.moduleAgentProfiles?.[moduleId];
  const agents = group?.agents || {};
  return Object.entries(agents).map(([agentId, profile]) => {
    const entry = visibleModelEntries.value.find((model) => modelEntryStatusKey(model) === agentId);
    return {
      agentId,
      label: entry ? agentExploreModelOptionLabel(entry) : currentAgentModelOptionLabel(agentId) || agentId,
      isPrimary: group?.primaryAgent === agentId,
      profile,
    };
  });
}

function moduleModelRef(moduleId: string) {
  const assignment = settingsDraft.value.moduleModelAssignments?.[moduleId];
  if (!assignment?.provider || !assignment?.model) {
    return "";
  }
  const refValue = modelRef(assignment.provider, assignment.model);
  return moduleModelAssignmentOptions(moduleId).some((option) => option.ref === refValue)
    ? refValue
    : "";
}

function setModuleModelRef(moduleId: string, refValue: string) {
  if (!String(refValue || "").trim()) {
    const nextAssignments = { ...(settingsDraft.value.moduleModelAssignments || {}) };
    delete nextAssignments[moduleId];
    settingsDraft.value.moduleModelAssignments = nextAssignments;
    const group = ensureModuleAgentGroup(moduleId);
    group.primaryAgent = "";
    return;
  }
  const parsed = parseModelRef(refValue);
  settingsDraft.value.moduleModelAssignments = {
    ...(settingsDraft.value.moduleModelAssignments || {}),
    [moduleId]: {
      provider: parsed.provider,
      model: parsed.model,
    },
  };
  const group = ensureModuleAgentGroup(moduleId);
  group.primaryAgent = parsed.model;
  ensureModuleAgentProfile(moduleId, parsed.model, { role: "primary" });
  if (parsed.provider === "openai-chatgpt") {
    void ensureCodexOAuthReady(true);
  }
}

function setModuleAgentProfileEnabled(moduleId: string, agentId: string, enabled: boolean) {
  const profile = ensureModuleAgentProfile(moduleId, agentId);
  if (profile) {
    profile.enabled = enabled;
  }
}

function addModuleAgentProfileFromDraft(moduleId: string) {
  const refValue = String(moduleAgentCandidateDrafts.value[moduleId] || "").trim();
  if (!refValue) {
    return;
  }
  const parsed = parseModelRef(refValue);
  ensureModuleAgentProfile(moduleId, parsed.model, { role: "assistant" });
  moduleAgentCandidateDrafts.value = {
    ...moduleAgentCandidateDrafts.value,
    [moduleId]: "",
  };
}

const moduleModelAssignmentStats = computed(() => {
  const enabled = intelligentModuleDefinitions.filter((item: any) => moduleNeedsIntelligence(item.id)).length;
  const assigned = intelligentModuleDefinitions.filter((item: any) => moduleNeedsIntelligence(item.id) && moduleModelRef(item.id)).length;
  return {
    assigned,
    enabled,
    total: intelligentModuleDefinitions.length,
  };
});

function hasOpenAiModelUsage() {
  return intelligentModuleDefinitions.some(
    (item) =>
      moduleNeedsIntelligence(item.id) &&
      moduleModelRef(item.id) &&
      modelProviderFromRef(moduleModelRef(item.id)) === "openai-chatgpt",
  );
}

const toolScopes = computed(() => toolManagementCatalogState.value?.scopes || []);
const toolCatalog = computed(() => toolManagementCatalogState.value?.tools || []);
const toolGrants = computed(() => toolManagementGrantsState.value);
const enabledToolGrantCount = computed(
  () => toolGrants.value.filter((grant) => grant.enabled).length,
);
const toolManagementTools = computed<ToolManagementTool[]>(() => toolManagementCatalogState.value?.tools || []);
const toolManagementToolsets = computed<ToolManagementToolset[]>(
  () => toolManagementCatalogState.value?.toolsets || [],
);
const toolManagementProfiles = computed<ToolManagementProfile[]>(
  () => toolManagementCatalogState.value?.profiles || [],
);
const activeToolManagementToolCount = computed(
  () => toolManagementTools.value.filter((tool) => tool.status === "active").length,
);
const internalToolManagementToolCount = computed(
  () => toolManagementTools.value.filter((tool) => tool.status === "internal").length,
);
const toolManagementStatusRows = computed(() =>
  Object.entries(toolManagementMetricsState.value?.byStatus || {}).map(([label, value]) => ({
    label,
    value,
  })),
);
const toolManagementRiskRows = computed(() =>
  Object.entries(toolManagementMetricsState.value?.byRisk || {}).map(([label, value]) => ({
    label,
    value,
  })),
);

const knowledgeManagementPanelOptionBarOptions = computed<OptionBarOption[]>(() => [
  { value: "knowledge", label: "知识" },
  { value: "rules", label: "规则" },
]);

function selectKnowledgeManagementPanel(panel: OptionBarValue) {
  if (panel === "knowledge" || panel === "rules") {
    knowledgeManagementPanel.value = panel;
  }
}

const defaultAgentPermissionGroups = computed<AgentPermissionGroup[]>(() => {
  const readScopes = toolScopes.value
    .filter((scope) => /read|knowledge/i.test(scope.id))
    .map((scope) => scope.id);
  const writeScopes = toolScopes.value
    .filter((scope) => /write|execute|tool|maintenance|admin/i.test(scope.id))
    .map((scope) => scope.id);
  const readToolsets = toolManagementToolsets.value
    .filter((toolset) => toolset.maxRisk === "read_only" && toolset.grantable !== false)
    .map((toolset) => toolset.id);
  const safeToolsets = toolManagementToolsets.value
    .filter((toolset) => ["read_only", "safe_write"].includes(toolset.maxRisk) && toolset.grantable !== false)
    .map((toolset) => toolset.id);
  const allToolsets = toolManagementToolsets.value
    .filter((toolset) => toolset.grantable !== false)
    .map((toolset) => toolset.id);
  return [
    {
      id: "agent-permission-knowledge-reader",
      label: "知识读取组",
      description: "只允许读取知识、执行只读召回和健康检查。",
      enabled: true,
      scopeIds: readScopes,
      toolsetIds: readToolsets,
      toolAllow: [],
      toolDeny: [],
    },
    {
      id: "agent-permission-operator",
      label: "运维操作组",
      description: "允许只读和安全写入工具，适合巡检、索引校验和轻量维护。",
      enabled: true,
      scopeIds: [...new Set([...readScopes, ...writeScopes])],
      toolsetIds: safeToolsets,
      toolAllow: [],
      toolDeny: [],
    },
    {
      id: "agent-permission-admin-review",
      label: "管理员审批组",
      description: "保留全部工具集入口，高风险工具仍受审批和策略预览约束。",
      enabled: true,
      scopeIds: toolScopes.value.map((scope) => scope.id),
      toolsetIds: allToolsets,
      toolAllow: [],
      toolDeny: [],
    },
  ];
});

const agentPermissionGroups = computed<AgentPermissionGroup[]>(() =>
  normalizeAgentPermissionGroupsDraft(settingsDraft.value.agentPermissionGroups),
);

const agentPermissionGroupOptionBarOptions = computed<OptionBarOption[]>(() => [
  { value: "", label: "未分配" },
  ...agentPermissionGroups.value
    .filter((group) => group.enabled)
    .map((group) => ({
      value: group.id,
      label: group.label || group.id,
    })),
]);

const selectedToolManagementTool = computed(() => {
  const selectedId = selectedToolManagementToolId.value || policyPreviewToolId.value;
  return toolManagementTools.value.find((tool) => tool.id === selectedId) || toolManagementTools.value[0] || null;
});
const currentUser = computed(() => authState.value?.session.user || null);
const isAuthenticated = computed(
  () => authState.value?.session.authenticated === true,
);
const currentUserScopes = computed(() => currentUser.value?.scopes || []);
const canAdminAuth = computed(() => hasScope("auth:admin"));
const canReadKnowledge = computed(() => hasScope("knowledge:read"));
const canWriteKnowledge = computed(() => hasScope("knowledge:write"));
const canMaintainKnowledge = computed(() => hasScope("knowledge:maintain"));
const canAdminKnowledge = computed(() => hasScope("knowledge:admin"));
const canWriteJobs = computed(() => hasScope("jobs:write"));
const canBrowseServerPaths = computed(() => hasScope("knowledge:write"));
const canAdminRuntime = computed(() => hasScope("runtime:admin"));
const canReadMaintenanceAgent = computed(() => hasScope("maintenance:read"));
const canRunMaintenanceAgent = computed(() => hasScope("maintenance:run"));
const canApproveMaintenanceAgent = computed(() => hasScope("maintenance:approve"));
const canAdminMaintenanceAgent = computed(() => hasScope("maintenance:admin"));
const errorNeedsKnowledgeImportAction = computed(() =>
  /语料词频表为空|完成文档入库|重建语料词频/.test(error.value),
);
const knowledgeStatus = computed(() => {
  const health = knowledgeConsole.value?.health || consoleState.value?.knowledgeConsole?.health;
  return String(health?.status || (health?.ok === false ? "degraded" : "ok"));
});
const knowledgeModules = computed(() => {
  const health = knowledgeConsole.value?.health || consoleState.value?.knowledgeConsole?.health;
  const capabilities =
    knowledgeConsole.value?.capabilities || consoleState.value?.knowledgeConsole?.capabilities;
  return {
    ...((capabilities?.modules || {}) as Record<string, Record<string, unknown>>),
    ...((capabilities?.protocolModules || {}) as Record<string, Record<string, unknown>>),
    ...((health?.modules || {}) as Record<string, Record<string, unknown>>),
    ...((health?.protocolModules || {}) as Record<string, Record<string, unknown>>),
  };
});
const currentMaintenanceTask = computed(() =>
  knowledgeSchema.value?.maintenanceTasks.find((item) => item.id === selectedMaintenanceTask.value) ||
  null,
);
const currentMaintenanceTaskSupportsDryRun = computed(() => currentMaintenanceTask.value?.supportsDryRun === true);
const pendingKnowledgeReviewCount = computed(() => {
  const loadedPending = knowledgeReviewItems.value.filter((item: any) => item.status === "pending").length;
  const healthCounts = asRecord(knowledgeConsole.value?.health?.counts) || {};
  return loadedPending || Number(healthCounts.pendingReviewItems || 0);
});

function knowledgeTabDisplayLabel(tab: { id: KnowledgeTab; label: string }) {
  if (tab.id === "conflicts" && pendingKnowledgeReviewCount.value > 0) {
    return `${tab.label} ${pendingKnowledgeReviewCount.value}`;
  }
  return tab.label;
}

watch(selectedMaintenanceTask, () => {
  maintenanceDryRun.value = currentMaintenanceTaskSupportsDryRun.value;
});

function knowledgeConfigGroupDescription(groupId: string) {
  switch (groupId) {
    case "retrieval":
      return "已接入搜索排序链路，控制关键词、向量、图片、图谱、反馈和分层索引的融合权重。";
    case "learning":
      return "已接入反馈学习闭环，控制检索 profile 的候选生成、评估、灰度和自动发布边界。";
    case "maintenance":
      return "已接入维护健康检查和重建流程，控制重建批大小、索引过期判断和图片证据质量门槛。";
    case "embeddingModel":
      return "已接入 embedding runtime，用于选择文本、图片和版本化重算索引的 provider。";
    default:
      return "服务端暴露的知识库配置组。";
  }
}

function knowledgeMaintenanceTaskDescription(taskId: string) {
  switch (taskId) {
    case "validate_assets":
      return "检查知识库资产文件、索引覆盖和基础质量，不修改知识内容。";
    case "repair_missing_thumbnails":
      return "尝试补齐缺失缩略图，适合图片预览异常后的轻量修复。";
    case "delete_orphan_objects":
      return "删除不再被索引引用的孤立对象，属于清理存储的高风险操作。";
    case "garbage_cleanup":
      return "清理同步日志、重复导入审核噪声、旧维护记录、旧蒸馏报告，并可选清理失败任务目录；默认仅预览，真正删除必须确认。";
    case "compare_retrieval_profiles":
      return "用固定查询对比不同检索 profile 的召回结果，用于调参前评估。";
    case "learning_run":
      return "根据近期反馈执行一次进化学习，生成候选检索 profile 或审核建议。";
    case "validate_quality":
      return "检查重复文档、缺少块、图片无 OCR/说明、证据缺少机器元数据等质量问题。";
    case "reembed_by_model_version":
      return "更新 embedding 版本并重算索引，通常在更换 Embedding provider 后使用。";
    case "reindex":
      return "重建全文、向量和分层索引，适合导入异常、模型切换或召回明显退化后的修复。";
    default:
      return "执行服务端注册的知识库维护动作。";
  }
}

const selectedEvidencePayload = computed(() =>
  asRecord(selectedEvidence.value?.payload) || null,
);
const selectedEvidenceDocument = computed(() =>
  (asRecord(selectedEvidence.value?.document) ||
    asRecord(selectedEvidencePayload.value?.document) ||
    null) as Record<string, unknown> | null,
);
const selectedEvidenceSection = computed(() =>
  (asRecord(selectedEvidence.value?.section) ||
    asRecord(selectedEvidencePayload.value?.section) ||
    null) as Record<string, unknown> | null,
);
const selectedEvidenceBlocks = computed(() => {
  const direct = Array.isArray(selectedEvidence.value?.blocks)
    ? selectedEvidence.value?.blocks
    : Array.isArray(selectedEvidencePayload.value?.blocks)
      ? selectedEvidencePayload.value?.blocks
      : [];
  return (direct || []).map((item) => asRecord(item)).filter(Boolean) as Record<string, unknown>[];
});
const evidenceAssets = computed(() => {
  const direct = selectedEvidence.value?.assets || [];
  const payloadAssets = Array.isArray(selectedEvidencePayload.value?.assets)
    ? selectedEvidencePayload.value?.assets
    : [];
  return [...direct, ...payloadAssets].filter(Boolean) as KnowledgeAssetRef[];
});
const activeKnowledgeSources = computed(() => knowledgeSourceState.value?.sources || []);
const agentExploreContextWindowOptions = [
  {
    value: "context-32k",
    label: "32K",
    description: "轻量模型和快速探索",
  },
  {
    value: "context-128k",
    label: "128K",
    description: "复杂检索和多轮证据",
  },
  {
    value: "context-1m",
    label: "1M",
    description: "超长文档和大批量证据",
  },
];
const contextProfileRows = computed(() =>
  ((asRecord(contextProfilesResponse.value)?.profiles || []) as Array<Record<string, unknown>>).map((profile) => ({
    profileId: String(profile.profileId || profile.id || ""),
    label: String(profile.label || profile.profileId || ""),
    contextWindowTokens: Number(profile.contextWindowTokens || 0),
    compressionMode: String(asRecord(profile.compression)?.mode || "deterministic"),
    strategy: String(asRecord(profile.compression)?.strategy || ""),
    knowledgeBudget: Number(profile.knowledgeBudget || 0),
    historyBudget: Number(profile.historyBudget || 0),
    recentTurnBudget: Number(profile.recentTurnBudget || 0),
    expertGuidanceRatio: Number(asRecord(profile.budgetPolicy)?.expertGuidanceRatio || 0),
    protectedEvidenceFields: ((profile.protectedEvidenceFields || []) as unknown[]).map((item) => String(item)),
    modelCompressionAlias: String(asRecord(profile.modelCompression)?.alias || ""),
    modelCompressionEnabled: asRecord(profile.modelCompression)?.enabled === true,
  })),
);
const contextBuildRecordRows = computed(() =>
  ((asRecord(contextBuildRecordsResponse.value)?.records || []) as Array<Record<string, unknown>>).map((record) => ({
    recordId: String(record.recordId || ""),
    createdAt: String(record.createdAt || ""),
    profileId: String(record.profileId || ""),
    totalTokens: Number(record.totalTokens || 0),
    sourceTokens: Number(record.sourceTokens || 0),
    triggerReason: String(record.triggerReason || ""),
    compressionMode: String(record.compressionMode || ""),
    preservedEvidenceIds: ((record.preservedEvidenceIds || []) as unknown[]).map((item) => String(item)),
    droppedKnowledgeCount: Number(record.droppedKnowledgeCount || 0),
    humanExpertGuidanceCount: Number(record.humanExpertGuidanceCount || 0),
  })),
);
const agentExploreThinkingModeOptions = [
  {
    value: "default",
    label: "模型默认",
    description: "不额外传 thinking 参数，使用模型或供应商默认行为。",
  },
  {
    value: "enabled",
    label: "开启 Thinking",
    description: "向 DeepSeek / OpenAI-compatible 请求传入 thinking enabled；Qwen-compatible 同步 enable_thinking=true。",
  },
  {
    value: "disabled",
    label: "关闭 Thinking",
    description: "向 DeepSeek / OpenAI-compatible 请求传入 thinking disabled；Qwen-compatible 同步 enable_thinking=false。",
  },
];
function agentExploreModelOptionLabel(entry: AgentModelConfig) {
  const modelName = String(
    entry.label || entry.agentName || entry.alias || modelEntryStatusKey(entry),
  ).trim();
  const modelId = String(entry.model || entry.engine || modelEntryStatusKey(entry)).trim();
  return modelId && modelId !== modelName ? `${modelName} · ${modelId}` : modelName;
}

type AgentSelectorUiOption = AgentSelectorOption & {
  enabled: boolean;
  disabledReason: string;
};

function normalizeAgentSelectorOption(option: AgentSelectorOption): AgentSelectorUiOption {
  return {
    ...option,
    value: option.agentUid || option.value,
    enabled: option.selectable,
    disabledReason: option.reason || "",
  };
}

const agentSelectorOptions = computed<AgentSelectorUiOption[]>(() =>
  (consoleState.value?.agentSelector?.options || []).map(normalizeAgentSelectorOption),
);

function agentOptionsForModule(moduleId: string) {
  return agentSelectorOptions.value.filter((option) =>
    option.moduleIds.includes("*") || option.moduleIds.includes(moduleId),
  );
}

const infoFeedModelOptions = computed(() => agentSelectorOptions.value);
const agentExploreAgentOptions = computed(() => agentOptionsForModule("agentTools"));
const ruleAuthoringModelOptions = computed(() => agentSelectorOptions.value);
const wordCloudModelOptions = computed(() => agentSelectorOptions.value);

const agentModelOptionValueSet = computed(
  () => new Set(agentSelectorOptions.value.map((item) => item.value)),
);
function hasAgentModelOption(value?: string) {
  const normalized = String(value || "").trim();
  return Boolean(normalized && agentModelOptionValueSet.value.has(normalized));
}
function validAgentModelAlias(value?: string) {
  const normalized = String(value || "").trim();
  return hasAgentModelOption(normalized) ? normalized : "";
}
function currentAgentModelOptionLabel(value?: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  return agentSelectorOptions.value.find((item) => item.value === normalized)?.label || "";
}
function inactiveAgentModelOption(value?: string): AgentSelectorUiOption {
  return {
    value: String(value || "").trim(),
    agentUid: String(value || "").trim(),
    label: "已移除的智能体",
    provider: "",
    model: "",
    moduleIds: [],
    capabilities: [],
    status: "unconfigured" as const,
    enabled: false,
    selectable: false,
    disabledReason: "已从智能体列表删除",
    reason: "已从智能体列表删除",
  };
}
function cacheAgentModelOptionLabels(options: Array<{ value: string; label?: string }>) {
  const next: Record<string, string> = {};
  for (const option of options) {
    const value = String(option.value || "").trim();
    const label = String(option.label || "").trim();
    if (value && label) {
      next[value] = label;
    }
  }
  agentModelOptionLabelCache.value = next;
}

function selectedAgentFromOptions(options: AgentSelectorUiOption[], value?: string): AgentSelectorUiOption {
  const selectedValue = String(value || "").trim();
  if (!selectedValue) {
    return {
      value: "",
      agentUid: "",
      label: "未选择智能体",
      provider: "",
      model: "",
      moduleIds: [],
      capabilities: [],
      status: "unconfigured" as const,
      enabled: false,
      selectable: false,
      disabledReason: "未分配",
      reason: "未分配",
    };
  }
  return options.find((item) => item.value === selectedValue) || inactiveAgentModelOption(selectedValue);
}

function normalizeAgentSelectionAlias(value?: string) {
  return String(value || "").trim();
}
function emitAgentSelectionReferenceLog(params: {
  context: string;
  contextLabel: string;
  alias: string;
  stage: "lost" | "restored";
  reason: string;
}) {
  const now = new Date().toISOString();
  const statusLabel = params.stage === "lost" ? "引用丢失" : "引用恢复";
  const tone: KnowledgeLogRow["tone"] = params.stage === "lost" ? "warning" : "success";
  const logId = `${params.context}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const row: KnowledgeLogRow = {
    logId,
    kindLabel: "智能体引用",
    displayId: "ref",
    target: `${params.contextLabel}（${params.alias}）`,
    status: params.stage === "lost" ? "missing" : "available",
    statusLabel,
    tone,
    stage: params.reason,
    occurredAt: now,
    createdAt: now,
    progressPercent: 100,
    detail: params.reason,
    error: params.stage === "lost" ? params.reason : "",
  };
  console.warn("[agent-selection-ref]", params.context, params.stage, params.alias, params.reason);
  agentSelectionReferenceLogs.value = [row, ...agentSelectionReferenceLogs.value].slice(
    0,
    AGENT_SELECTION_REFERENCE_LOG_LIMIT,
  );
}
function trackAgentSelectionReference(
  context: string,
  contextLabel: string,
  alias: string,
  selectedOption: AgentSelectorUiOption,
) {
  const normalizedAlias = normalizeAgentSelectionAlias(alias);
  const nextState: AgentSelectionReferenceState = normalizedAlias
    ? selectedOption.selectable
      ? "available"
      : "removed"
    : "empty";
  const previous = agentSelectionReferenceStates.value[context] || { alias: "", state: "empty" };
  if (previous.alias === normalizedAlias && previous.state === nextState) {
    return;
  }
  if (normalizedAlias && previous.state === "available" && nextState === "removed") {
    emitAgentSelectionReferenceLog({
      context,
      contextLabel,
      alias: normalizedAlias,
      stage: "lost",
      reason: `${normalizedAlias} 不在当前列表，显示为“已移除的智能体”。`,
    });
  } else if (normalizedAlias && previous.state === "removed" && nextState === "available") {
    emitAgentSelectionReferenceLog({
      context,
      contextLabel,
      alias: normalizedAlias,
      stage: "restored",
      reason: `${normalizedAlias} 已重新出现在列表，空引用已恢复。`,
    });
  } else if (normalizedAlias && previous.state === "empty" && nextState === "removed") {
    emitAgentSelectionReferenceLog({
      context,
      contextLabel,
      alias: normalizedAlias,
      stage: "lost",
      reason: `${normalizedAlias} 初始加载时未匹配到可用列表，页面显示“已移除的智能体”。`,
    });
  }
  agentSelectionReferenceStates.value = {
    ...agentSelectionReferenceStates.value,
    [context]: { alias: normalizedAlias, state: nextState },
  };
}
function watchAgentSelectionReference(
  context: string,
  contextLabel: string,
  getAlias: () => string,
  getSelection: () => AgentSelectorUiOption,
) {
  watch(
    () => [
      normalizeAgentSelectionAlias(getAlias()),
      getSelection().enabled,
      getSelection().selectable,
      getSelection().label,
    ],
    () => {
      const alias = normalizeAgentSelectionAlias(getAlias());
      trackAgentSelectionReference(context, contextLabel, alias, getSelection());
    },
    { immediate: true },
  );
}

const selectedAgentExploreModel = computed(() => {
  return selectedAgentFromOptions(agentExploreAgentOptions.value, agentExploreForm.value.modelAlias);
});
const selectedRuleAuthoringModel = computed(() => {
  return selectedAgentFromOptions(ruleAuthoringModelOptions.value, ruleAuthoringForm.value.modelAlias);
});
const selectedWordCloudModel = computed(() => {
  return selectedAgentFromOptions(wordCloudModelOptions.value, wordCloudModelAlias.value);
});
const wordCloudPalette = [
  { accent: "#2563eb", fill: "rgba(37, 99, 235, 0.09)" },
  { accent: "#059669", fill: "rgba(5, 150, 105, 0.1)" },
  { accent: "#b45309", fill: "rgba(180, 83, 9, 0.1)" },
  { accent: "#7c3aed", fill: "rgba(124, 58, 237, 0.09)" },
  { accent: "#dc2626", fill: "rgba(220, 38, 38, 0.08)" },
  { accent: "#0891b2", fill: "rgba(8, 145, 178, 0.1)" },
  { accent: "#4d7c0f", fill: "rgba(77, 124, 15, 0.1)" },
  { accent: "#be185d", fill: "rgba(190, 24, 93, 0.08)" },
];

function cloneWordCloudSet(value: KnowledgeWordCloudSet): KnowledgeWordCloudSet {
  return JSON.parse(JSON.stringify(value)) as KnowledgeWordCloudSet;
}

function normalizeWordCloudTermForUi(value: Partial<KnowledgeWordCloudTerm> | string): KnowledgeWordCloudTerm {
  const record = typeof value === "string" ? { term: value } : value || {};
  return {
    term: String(record.term || "").trim(),
    frequency: Math.max(0, Number(record.frequency || 0)),
    weight: record.weight === undefined ? undefined : Number(record.weight),
  };
}

function wordCloudTermIdentity(value: Partial<KnowledgeWordCloudTerm> | string) {
  return normalizeWordCloudTermForUi(value).term.toLowerCase();
}

function normalizeWordCloudCorpusPathForUi(value: Partial<KnowledgeWordCloudCorpusPath> | string): KnowledgeWordCloudCorpusPath | null {
  const record = typeof value === "string" ? { path: value } : value || {};
  const selectedPath = String(record.path || "").trim();
  if (!selectedPath) {
    return null;
  }
  const type = String(record.type || "").trim();
  return {
    path: selectedPath,
    type: type === "file" || type === "directory" ? type : "",
  };
}

function normalizeWordCloudCorpusPathsForUi(values: Array<Partial<KnowledgeWordCloudCorpusPath> | string> = []) {
  const seen = new Set<string>();
  const paths: KnowledgeWordCloudCorpusPath[] = [];
  for (const value of values || []) {
    const normalized = normalizeWordCloudCorpusPathForUi(value);
    if (!normalized) {
      continue;
    }
    const key = `${normalized.type || ""}:${normalized.path}`.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    paths.push(normalized);
  }
  return paths;
}

type WordCloudTreeMatch = {
  cloud: KnowledgeWordCloud;
  parent: KnowledgeWordCloud | null;
  path: KnowledgeWordCloud[];
};

type WordCloudCardRow = {
  cloud: KnowledgeWordCloud;
  depth: number;
  parent: KnowledgeWordCloud | null;
};

type WordCloudAbsorptionCandidate = {
  cloud: KnowledgeWordCloud;
  depth: number;
  threshold: number;
  labelText: string;
  summaryText: string;
  termTexts: string[];
};

const DEFAULT_WORD_CLOUD_ABSORB_THRESHOLD = 0.78;

function normalizeWordCloudThreshold(value: unknown, fallback = DEFAULT_WORD_CLOUD_ABSORB_THRESHOLD) {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, next));
}

function formatWordCloudThreshold(value: unknown) {
  return normalizeWordCloudThreshold(value).toFixed(2);
}

function normalizeWordCloudText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function wordCloudCharacterSet(value: string) {
  return new Set(Array.from(normalizeWordCloudText(value)).filter(Boolean));
}

function wordCloudCharacterOverlapScore(leftText: string, rightText: string) {
  const leftSet = wordCloudCharacterSet(leftText);
  const rightSet = wordCloudCharacterSet(rightText);
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const character of leftSet) {
    if (rightSet.has(character)) {
      shared += 1;
    }
  }
  return shared / Math.max(leftSet.size, rightSet.size);
}

function collectWordCloudAbsorptionCandidates(
  wordBags: KnowledgeWordCloud[] = [],
  depth = 0,
  target: WordCloudAbsorptionCandidate[] = [],
) {
  for (const cloud of wordBags) {
    target.push({
      cloud,
      depth,
      threshold: normalizeWordCloudThreshold(cloud.absorbThreshold),
      labelText: normalizeWordCloudText(cloud.label),
      summaryText: normalizeWordCloudText(cloud.summary || ""),
      termTexts: (cloud.terms || []).map((term: any) => normalizeWordCloudText(term.term)).filter(Boolean),
    });
    collectWordCloudAbsorptionCandidates(cloud.children || [], depth + 1, target);
  }
  return target;
}

function wordCloudAffinityScore(candidate: WordCloudAbsorptionCandidate, term: KnowledgeWordCloudTerm) {
  const termText = normalizeWordCloudText(term.term);
  if (!termText) {
    return 0;
  }
  let score = 0;
  const sources = [candidate.labelText, candidate.summaryText, ...candidate.termTexts];
  for (const sourceText of sources) {
    if (!sourceText) {
      continue;
    }
    if (sourceText === termText) {
      return 1;
    }
    if (sourceText.includes(termText) || termText.includes(sourceText)) {
      score = Math.max(score, 0.95);
    }
    score = Math.max(score, wordCloudCharacterOverlapScore(sourceText, termText) * 0.82);
  }
  if (candidate.cloud.relation === "contains") {
    score += 0.03;
  } else if (candidate.cloud.relation === "overlap") {
    score += 0.02;
  }
  return Math.min(1, score);
}

function autoAbsorbWordCloudTerms(draft: KnowledgeWordCloudSet) {
  const unassignedTerms = Array.isArray(draft.unassignedTerms) ? [...draft.unassignedTerms] : [];
  if (unassignedTerms.length === 0) {
    return 0;
  }
  const candidates = collectWordCloudAbsorptionCandidates(draft.wordBags || []);
  if (candidates.length === 0) {
    return 0;
  }
  const absorbedTermIds = new Set<string>();
  const absorbedByCloud = new Map<string, KnowledgeWordCloudTerm[]>();
  for (const term of unassignedTerms) {
    const identity = wordCloudTermIdentity(term);
    if (!identity) {
      continue;
    }
    let bestCandidate: WordCloudAbsorptionCandidate | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      const score = wordCloudAffinityScore(candidate, term);
      if (score < candidate.threshold) {
        continue;
      }
      if (!bestCandidate || score > bestScore || (score === bestScore && candidate.depth > bestCandidate.depth)) {
        bestCandidate = candidate;
        bestScore = score;
      }
    }
    if (!bestCandidate) {
      continue;
    }
    absorbedTermIds.add(identity);
    const nextTerms = absorbedByCloud.get(bestCandidate.cloud.wordBagId) || [];
    nextTerms.push(wordCloudTermWithFrequency(term));
    absorbedByCloud.set(bestCandidate.cloud.wordBagId, nextTerms);
  }
  if (absorbedTermIds.size === 0) {
    return 0;
  }
  const absorbIntoClouds = (wordBags: KnowledgeWordCloud[]) => {
    for (const cloud of wordBags) {
      const nextTerms = absorbedByCloud.get(cloud.wordBagId);
      if (nextTerms?.length) {
        const existingIds = new Set((cloud.terms || []).map((item) => wordCloudTermIdentity(item)));
        cloud.terms = [
          ...(cloud.terms || []),
          ...nextTerms.filter((item: any) => !existingIds.has(wordCloudTermIdentity(item))),
        ];
      }
      absorbIntoClouds(cloud.children || []);
    }
  };
  absorbIntoClouds(draft.wordBags || []);
  draft.unassignedTerms = unassignedTerms.filter((term) => !absorbedTermIds.has(wordCloudTermIdentity(term)));
  return absorbedTermIds.size;
}

function normalizeWordCloudCloudForUi(cloud: KnowledgeWordCloud, parentWordBagId = ""): KnowledgeWordCloud {
  const wordBagId = String(cloud.wordBagId || `word-bag-${Date.now().toString(36)}`).trim();
  return {
    ...cloud,
    wordBagId,
    label: String(cloud.label || "词云").trim() || "词云",
    parentWordBagId,
    terms: (cloud.terms || []).map((term: any) => normalizeWordCloudTermForUi(term)).filter((term) => term.term),
    removedTerms: (cloud.removedTerms || [])
      .map((term: any) => ({ ...normalizeWordCloudTermForUi(term), removed: true }))
      .filter((term) => term.term),
    children: (cloud.children || []).map((child) => normalizeWordCloudCloudForUi(child, wordBagId)),
  };
}

function normalizeWordCloudSetForUi(value: KnowledgeWordCloudSet): KnowledgeWordCloudSet {
  return {
    ...value,
    termsSnapshot: (value.termsSnapshot || []).map((term: any) => normalizeWordCloudTermForUi(term)).filter((term) => term.term),
    unassignedTerms: (value.unassignedTerms || []).map((term: any) => normalizeWordCloudTermForUi(term)).filter((term) => term.term),
    corpusPaths: normalizeWordCloudCorpusPathsForUi(value.corpusPaths || []),
    wordBags: (value.wordBags || []).map((cloud) => normalizeWordCloudCloudForUi(cloud)),
  };
}

function findWordCloudInTree(
  wordBags: KnowledgeWordCloud[] = [],
  wordBagId = "",
  parent: KnowledgeWordCloud | null = null,
  path: KnowledgeWordCloud[] = [],
): WordCloudTreeMatch | null {
  for (const cloud of wordBags) {
    const nextPath = [...path, cloud];
    if (cloud.wordBagId === wordBagId) {
      return { cloud, parent, path: nextPath };
    }
    const child = findWordCloudInTree(cloud.children || [], wordBagId, cloud, nextPath);
    if (child) {
      return child;
    }
  }
  return null;
}

function flattenWordCloudCards(
  wordBags: KnowledgeWordCloud[] = [],
  depth = 0,
  parent: KnowledgeWordCloud | null = null,
): WordCloudCardRow[] {
  const rows: WordCloudCardRow[] = [];
  for (const cloud of wordBags) {
    rows.push({ cloud, depth, parent });
    if (!collapsedWordBagIds.value.has(cloud.wordBagId)) {
      rows.push(...flattenWordCloudCards(cloud.children || [], depth + 1, cloud));
    }
  }
  return rows;
}

function mutateWordCloudDraft(mutator: (draft: KnowledgeWordCloudSet) => void) {
  const draft = wordCloudDraft.value || createDefaultWordCloudSet(wordCloudTerms.value);
  mutator(draft);
  autoAbsorbWordCloudTerms(draft);
  draft.updatedAt = new Date().toISOString();
  wordCloudDraft.value = normalizeWordCloudSetForUi({ ...draft });
}

function createDefaultWordCloudSet(terms: KnowledgeWordCloudTerm[] = []): KnowledgeWordCloudSet {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    wordBagSetId: `word-cloud-${Date.now().toString(36)}`,
    title: "语料词云",
    status: "draft",
    wordBagCount: 0,
    termsSnapshot: terms,
    wordBags: [],
    unassignedTerms: terms,
    corpusPaths: normalizeWordCloudCorpusPathsForUi(wordCloudCorpusPaths.value),
    modelAlias: wordCloudModelAlias.value,
    agentResponse: {},
    createdAt: now,
    updatedAt: now,
  };
}

function preferredWordCloudCorpusPaths(
  remotePaths: Array<Partial<KnowledgeWordCloudCorpusPath> | string> = [],
  fallbackPaths: Array<Partial<KnowledgeWordCloudCorpusPath> | string> = wordCloudCorpusPaths.value,
) {
  const normalizedRemotePaths = normalizeWordCloudCorpusPathsForUi(remotePaths);
  if (normalizedRemotePaths.length > 0) {
    return normalizedRemotePaths;
  }
  return normalizeWordCloudCorpusPathsForUi(fallbackPaths);
}

function resolveWordCloudCorpusPathsForQuery(options: {
  corpusPaths?: Array<Partial<KnowledgeWordCloudCorpusPath> | string> | null;
} = {}) {
  if (options.corpusPaths !== undefined) {
    return normalizeWordCloudCorpusPathsForUi(options.corpusPaths || []);
  }
  const draftPaths = normalizeWordCloudCorpusPathsForUi(wordCloudDraft.value?.corpusPaths || []);
  if (draftPaths.length > 0) {
    return draftPaths;
  }
  const statePaths = normalizeWordCloudCorpusPathsForUi(
    (wordCloudState.value?.wordBagSet?.corpusPaths || wordCloudState.value?.corpusPaths || []),
  );
  if (statePaths.length > 0) {
    return statePaths;
  }
  return normalizeWordCloudCorpusPathsForUi(wordCloudCorpusPaths.value);
}

function setWordCloudDraftFromState(state: KnowledgeWordCloudState | null) {
  const next = state?.wordBagSet
    ? normalizeWordCloudSetForUi(cloneWordCloudSet(state.wordBagSet))
    : createDefaultWordCloudSet(state?.terms || []);
  const nextCorpusPaths = preferredWordCloudCorpusPaths(
    next.corpusPaths?.length ? next.corpusPaths : state?.corpusPaths || [],
  );
  next.corpusPaths = nextCorpusPaths;
  autoAbsorbWordCloudTerms(next);
  // On first load collapse all; on subsequent updates only collapse newly added clouds
  const isFirstLoad = wordCloudDraft.value === null;
  const prevWordBagIds = new Set((wordCloudDraft.value?.wordBags || []).map((c) => c.wordBagId));
  wordCloudDraft.value = next;
  selectedWordBagId.value = findWordCloudInTree(next.wordBags, selectedWordBagId.value)
    ? selectedWordBagId.value
    : "";
  if (next.modelAlias) {
    wordCloudModelAlias.value = next.modelAlias;
  }
  wordCloudCorpusPaths.value = nextCorpusPaths;
  const idsToCollapse = (next.wordBags || [])
    .filter((c) => isFirstLoad || !prevWordBagIds.has(c.wordBagId))
    .map((c) => c.wordBagId);
  if (idsToCollapse.length > 0) {
    collapsedWordBagIds.value = new Set([...collapsedWordBagIds.value, ...idsToCollapse]);
  }
}

const wordCloudTerms = computed(() => {
  return wordCloudState.value?.terms?.length
    ? wordCloudState.value.terms
    : wordCloudDraft.value?.termsSnapshot || [];
});
const wordCloudTermFrequencyMap = computed(() => {
  const next = new Map<string, number>();
  for (const item of wordCloudTerms.value) {
    const term = wordCloudTermIdentity(item);
    if (term) {
      next.set(term, Math.max(next.get(term) || 0, Number(item.frequency || 0)));
    }
  }
  return next;
});
const wordCloudCanvasClouds = computed(() => wordCloudDraft.value?.wordBags || []);
const WORD_CLOUD_TAIL_LABELS = new Set(["default", "其它", "others"]);
function isWordCloudTailCard(cloud: KnowledgeWordCloud): boolean {
  return WORD_CLOUD_TAIL_LABELS.has(String(cloud.label || "").trim().toLowerCase());
}
const wordCloudCardRows = computed(() => {
  const clouds = wordCloudCanvasClouds.value;
  const pinned = clouds.filter((c) => pinnedWordBagIds.value.has(c.wordBagId) && !isWordCloudTailCard(c));
  const normal = clouds.filter((c) => !pinnedWordBagIds.value.has(c.wordBagId) && !isWordCloudTailCard(c));
  const tail = clouds.filter((c) => isWordCloudTailCard(c));
  return flattenWordCloudCards([...pinned, ...normal, ...tail]);
});
const selectedWordCloud = computed(() => {
  return findWordCloudInTree(wordCloudCanvasClouds.value, selectedWordBagId.value)?.cloud || null;
});

function wordCloudTermWithFrequency(term: KnowledgeWordCloudTerm): KnowledgeWordCloudTerm {
  const key = wordCloudTermIdentity(term);
  return {
    ...term,
    frequency: Math.max(Number(term.frequency || 0), wordCloudTermFrequencyMap.value.get(key) || 0),
  };
}

function selectWordCloud(cloud: KnowledgeWordCloud) {
  selectedWordBagId.value = cloud.wordBagId;
}

function addManualWordCloud() {
  mutateWordCloudDraft((draft) => {
    const index = draft.wordBags.length + 1;
    const cloud: KnowledgeWordCloud = {
      wordBagId: `word-bag-${Date.now().toString(36)}`,
      label: `词云 ${index}`,
      summary: "",
      relation: "overlap",
      absorbThreshold: DEFAULT_WORD_CLOUD_ABSORB_THRESHOLD,
      terms: [],
      removedTerms: [],
      children: [],
    };
    draft.wordBags = [cloud, ...draft.wordBags];
    draft.wordBagCount = draft.wordBags.length;
    selectedWordBagId.value = cloud.wordBagId;
    collapsedWordBagIds.value = new Set([...collapsedWordBagIds.value].filter((id) => id !== cloud.wordBagId));
  });
}

async function autoFillCloudWithAgent(wordBagId: string) {
  const match = findWordCloudInTree(wordCloudDraft.value?.wordBags || [], wordBagId);
  const cloud = match?.cloud;
  if (!cloud) return;
  const label = (cloud.label || "").trim();
  if (!label) {
    error.value = "请先填写词云名称后再调用智能体填充。";
    return;
  }
  if (!selectedWordCloudModel.value.enabled) {
    error.value = selectedWordCloudModel.value.disabledReason || "请选择一个可用智能体。";
    return;
  }
  const corpusPaths = resolveWordCloudCorpusPathsForQuery();
  if (corpusPaths.length === 0) {
    error.value = "请先添加语料范围后再启动填充任务。";
    return;
  }
  fillingWordBagIds.value = new Set([...fillingWordBagIds.value, wordBagId]);
  error.value = "";
  try {
    const result = await bridge.proposeKnowledgeWordClouds({
      modelAlias: selectedWordCloudModel.value.value,
      prompt: label,
      minFrequency: 1,
      corpusPaths,
    });
    // Register this wordBagSet as a fill operation so the SSE handler
    // knows to merge terms into our cloud instead of replacing the draft.
    fillTargetWordBagId.value = wordBagId;
    fillSourceWordBagSetId.value = result.wordBagSet.wordBagSetId;
  } catch (err) {
    fillingWordBagIds.value = new Set([...fillingWordBagIds.value].filter((id) => id !== wordBagId));
    error.value = err instanceof Error ? err.message : "智能体填充词云失败。";
  }
}

function removeSelectedWordCloud() {
  const cloud = selectedWordCloud.value;
  if (!cloud) {
    return;
  }
  mutateWordCloudDraft((draft) => {
    const removeFrom = (items: KnowledgeWordCloud[]): KnowledgeWordCloud[] =>
      items
        .filter((item: any) => item.wordBagId !== cloud.wordBagId)
        .map((item) => ({ ...item, children: removeFrom(item.children || []) }));
    draft.wordBags = removeFrom(draft.wordBags || []);
    draft.wordBagCount = draft.wordBags.length;
    selectedWordBagId.value = "";
  });
}

function updateSelectedWordCloudField(field: "label" | "summary" | "relation", value: string) {
  const cloud = selectedWordCloud.value;
  if (!cloud) {
    return;
  }
  updateWordCloudField(cloud.wordBagId, field, value);
}

function updateWordCloudField(wordBagId: string, field: "label" | "summary" | "relation" | "absorbThreshold", value: string) {
  mutateWordCloudDraft((draft) => {
    const match = findWordCloudInTree(draft.wordBags || [], wordBagId);
    if (!match) {
      return;
    }
    if (field === "absorbThreshold") {
      match.cloud.absorbThreshold = normalizeWordCloudThreshold(value);
      return;
    }
    match.cloud[field] = value;
  });
}

function wordCloudVisibleTerms(cloud: KnowledgeWordCloud) {
  return [
    ...(cloud.terms || []).map((term: any) => ({ ...term, removed: false })),
    ...(cloud.removedTerms || []).map((term: any) => ({ ...term, removed: true })),
  ];
}

function wordCloudCardStyle(row: WordCloudCardRow, index: number) {
  const palette = wordCloudPalette[index % wordCloudPalette.length];
  return {
    "--word-cloud-accent": palette.accent,
    "--word-cloud-fill": palette.fill,
    marginLeft: `${Math.min(row.depth * 22, 132)}px`,
  };
}

function toggleWordCloudCollapsed(wordBagId: string) {
  const next = new Set(collapsedWordBagIds.value);
  if (next.has(wordBagId)) {
    next.delete(wordBagId);
  } else {
    next.add(wordBagId);
  }
  collapsedWordBagIds.value = next;
}

function pinWordCloud(wordBagId: string) {
  const next = new Set(pinnedWordBagIds.value);
  if (next.has(wordBagId)) {
    next.delete(wordBagId);
  } else {
    next.add(wordBagId);
  }
  pinnedWordBagIds.value = next;
}

function toggleWordCloudActionMenu(wordBagId: string) {
  wordBagActionMenuId.value = wordBagActionMenuId.value === wordBagId ? "" : wordBagId;
}

function addTermToCloud(wordBagId: string, term: KnowledgeWordCloudTerm | string) {
  const normalized = wordCloudTermWithFrequency(normalizeWordCloudTermForUi(term));
  if (!normalized.term) {
    return;
  }
  const corpusTerm = wordCloudTerms.value.find((item) => wordCloudTermIdentity(item) === wordCloudTermIdentity(normalized));
  if (corpusTerm) {
    normalized.term = corpusTerm.term;
    normalized.frequency = Math.max(normalized.frequency, Number(corpusTerm.frequency || 0));
  }
  const identity = wordCloudTermIdentity(normalized);
  mutateWordCloudDraft((draft) => {
    const match = findWordCloudInTree(draft.wordBags || [], wordBagId);
    if (!match) {
      return;
    }
    for (const ancestor of match.path.slice(0, -1)) {
      ancestor.terms = (ancestor.terms || []).filter((item: any) => wordCloudTermIdentity(item) !== identity);
      ancestor.removedTerms = (ancestor.removedTerms || []).filter((item: any) => wordCloudTermIdentity(item) !== identity);
    }
    match.cloud.removedTerms = (match.cloud.removedTerms || []).filter((item: any) => wordCloudTermIdentity(item) !== identity);
    if (!(match.cloud.terms || []).some((item) => wordCloudTermIdentity(item) === identity)) {
      match.cloud.terms = [...(match.cloud.terms || []), normalized];
    }
    draft.unassignedTerms = (draft.unassignedTerms || []).filter((item: any) => wordCloudTermIdentity(item) !== identity);
  });
}

function addTermInputToCloud(wordBagId: string) {
  const value = String(wordCloudTermInputs.value[wordBagId] || "").trim();
  if (!value) {
    return;
  }
  addTermToCloud(wordBagId, value);
  wordCloudTermInputs.value = {
    ...wordCloudTermInputs.value,
    [wordBagId]: "",
  };
}

function setWordCloudTermInput(wordBagId: string, value: string) {
  wordCloudTermInputs.value = {
    ...wordCloudTermInputs.value,
    [wordBagId]: value,
  };
}

function removeTermFromCloud(wordBagId: string, term: KnowledgeWordCloudTerm) {
  const identity = wordCloudTermIdentity(term);
  mutateWordCloudDraft((draft) => {
    const match = findWordCloudInTree(draft.wordBags || [], wordBagId);
    if (!match) {
      return;
    }
    const removed = wordCloudTermWithFrequency(term);
    match.cloud.terms = (match.cloud.terms || []).filter((candidate) => wordCloudTermIdentity(candidate) !== identity);
    if (!(match.cloud.removedTerms || []).some((candidate) => wordCloudTermIdentity(candidate) === identity)) {
      match.cloud.removedTerms = [...(match.cloud.removedTerms || []), { ...removed, removed: true }];
    }
  });
}

function clearRemovedTermsFromCloud(wordBagId: string) {
  mutateWordCloudDraft((draft) => {
    const match = findWordCloudInTree(draft.wordBags || [], wordBagId);
    if (match) {
      match.cloud.removedTerms = [];
    }
  });
}

function addChildWordCloud(parentWordBagId: string) {
  mutateWordCloudDraft((draft) => {
    const match = findWordCloudInTree(draft.wordBags || [], parentWordBagId);
    if (!match) {
      return;
    }
    const child: KnowledgeWordCloud = {
      wordBagId: `word-bag-${Date.now().toString(36)}`,
      parentWordBagId,
      label: "新分组",
      summary: "",
      relation: "contains",
      absorbThreshold: normalizeWordCloudThreshold(match.cloud.absorbThreshold),
      terms: [],
      removedTerms: [],
      children: [],
    };
    match.cloud.children = [...(match.cloud.children || []), child];
    selectedWordBagId.value = child.wordBagId;
    const next = new Set(collapsedWordBagIds.value);
    next.delete(parentWordBagId);
    collapsedWordBagIds.value = next;
    wordBagActionMenuId.value = "";
  });
}

function addTermActionToCloud(wordBagId: string) {
  selectedWordBagId.value = wordBagId;
  wordCloudTermInputs.value = {
    ...wordCloudTermInputs.value,
    [wordBagId]: wordCloudTermInputs.value[wordBagId] || "",
  };
  wordBagActionMenuId.value = "";
}

function applySavedWordCloudSet(
  wordBagSet: KnowledgeWordCloudSet,
  options: { fallbackCorpusPaths?: KnowledgeWordCloudCorpusPath[] } = {},
) {
  const normalized = normalizeWordCloudSetForUi(cloneWordCloudSet(wordBagSet));
  normalized.corpusPaths = preferredWordCloudCorpusPaths(
    normalized.corpusPaths || [],
    options.fallbackCorpusPaths || wordCloudCorpusPaths.value,
  );
  if (wordCloudState.value) {
    wordCloudState.value = {
      ...wordCloudState.value,
      wordBagSet: normalized,
      wordBagSets: [
        normalized,
        ...(wordCloudState.value.wordBagSets || []).filter((item: any) => item.wordBagSetId !== normalized.wordBagSetId),
      ],
    };
  }
  // Collapse all cards on first load; subsequent saves only collapse newly added clouds
  const isFirstLoad = wordCloudDraft.value === null;
  const prevWordBagIds = new Set((wordCloudDraft.value?.wordBags || []).map((c) => c.wordBagId));
  wordCloudDraft.value = normalized;
  wordCloudCorpusPaths.value = normalizeWordCloudCorpusPathsForUi(normalized.corpusPaths || []);
  selectedWordBagId.value = findWordCloudInTree(normalized.wordBags, selectedWordBagId.value)
    ? selectedWordBagId.value
    : "";
  const idsToCollapse = (normalized.wordBags || [])
    .filter((c) => isFirstLoad || !prevWordBagIds.has(c.wordBagId))
    .map((c) => c.wordBagId);
  if (idsToCollapse.length > 0) {
    collapsedWordBagIds.value = new Set([...collapsedWordBagIds.value, ...idsToCollapse]);
  }
}

function wordCloudCorpusPathLabel(item: KnowledgeWordCloudCorpusPath) {
  return item.type === "file" ? "文件" : "目录";
}

const wordCloudCorpusPathSummary = computed(() =>
  wordCloudCorpusPaths.value.length
    ? `已绑定 ${wordCloudCorpusPaths.value.length} 个目录/文件`
    : "未绑定路径时使用全库语料",
);

function setWordCloudDraftCorpusPaths() {
  if (!wordCloudDraft.value) {
    wordCloudDraft.value = createDefaultWordCloudSet(wordCloudTerms.value);
  }
  wordCloudDraft.value = {
    ...wordCloudDraft.value,
    corpusPaths: normalizeWordCloudCorpusPathsForUi(wordCloudCorpusPaths.value),
    updatedAt: new Date().toISOString(),
  };
}

async function persistWordCloudCorpusPaths(
  corpusPaths: KnowledgeWordCloudCorpusPath[] = wordCloudCorpusPaths.value,
  options: {
    auditAction?: WordCloudCorpusAuditAction;
    auditPaths?: KnowledgeWordCloudCorpusPath[];
  } = {},
) {
  if (!canWriteKnowledge.value) {
    return;
  }
  const draft = wordCloudDraft.value || createDefaultWordCloudSet(wordCloudTerms.value);
  const selectedCorpusPaths = normalizeWordCloudCorpusPathsForUi(corpusPaths);
  try {
    const result = await bridge.saveKnowledgeWordClouds({
      wordBagSet: {
        ...draft,
        wordBagCount: draft.wordBags.length,
        termsSnapshot: draft.termsSnapshot?.length ? draft.termsSnapshot : wordCloudTerms.value,
        corpusPaths: selectedCorpusPaths,
        modelAlias: wordCloudModelAlias.value,
      },
      auditAction: options.auditAction || "save",
      auditPaths: normalizeWordCloudCorpusPathsForUi(options.auditPaths || selectedCorpusPaths),
      limit: 100000,
      minFrequency: 1,
    });
    applySavedWordCloudSet(result.wordBagSet, {
      fallbackCorpusPaths: selectedCorpusPaths,
    });
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "保存词云语料范围失败。";
  }
}

async function refreshWordCloudCorpusTerms(options: {
  silent?: boolean;
  forceRebuild?: boolean;
  corpusPaths?: Array<Partial<KnowledgeWordCloudCorpusPath> | string> | null;
} = {}) {
  if (!canReadKnowledge.value) {
    return [];
  }
  const targetCorpusPaths = resolveWordCloudCorpusPathsForQuery({ corpusPaths: options.corpusPaths });
  if (!options.silent) {
    setBusy("knowledge:word-clouds:scope");
  }
  error.value = "";
  let state = null as KnowledgeWordCloudState | null;
  try {
    state = await bridge.getKnowledgeWordClouds({
      limit: 100000,
      minFrequency: 1,
      corpusPaths: targetCorpusPaths,
    });
    const savedCorpusPaths = normalizeWordCloudCorpusPathsForUi(state.wordBagSet?.corpusPaths || []);
    if (targetCorpusPaths.length === 0 && savedCorpusPaths.length > 0) {
      state = await bridge.getKnowledgeWordClouds({
        limit: 100000,
        minFrequency: 1,
        corpusPaths: savedCorpusPaths,
      });
    }
    if (
      options.forceRebuild &&
      targetCorpusPaths.length > 0 &&
      (state.terms || []).length === 0
    ) {
      const rebuildProgressMessage = {
        id: `word-cloud-scope-rebuild-${Date.now()}`,
        role: "system" as const,
        text: "已检测到语料范围内无本地词频，正在重建词频索引。",
        at: new Date().toISOString(),
      };
      wordCloudMessages.value = [rebuildProgressMessage, ...wordCloudMessages.value].slice(0, 20);
      await bridge.rebuildSourceVocabulary();
      state = await bridge.getKnowledgeWordClouds({
        limit: 100000,
        minFrequency: 1,
        corpusPaths: targetCorpusPaths,
      });
      const suffixText = state.terms?.length
        ? `已重建并读取 ${state.terms.length} 个语料词。`
        : "语料范围重建后仍无可用词频。请确认目录下存在已入库文档。";
      wordCloudMessages.value = [{
        id: `word-cloud-scope-rebuild-${Date.now()}`,
        role: "system" as const,
        text: suffixText,
        at: new Date().toISOString(),
      }, ...wordCloudMessages.value].slice(0, 20);
    }
    wordCloudState.value = {
      ...(wordCloudState.value || state),
      terms: state.terms || [],
      corpusPaths: state.corpusPaths || targetCorpusPaths,
    };
    if (!wordCloudDraft.value) {
      wordCloudDraft.value = createDefaultWordCloudSet(state.terms || []);
    }
    wordCloudDraft.value = normalizeWordCloudSetForUi({
      ...wordCloudDraft.value,
      termsSnapshot: state.terms || [],
      unassignedTerms: state.terms || [],
      corpusPaths: targetCorpusPaths,
    });
    autoAbsorbWordCloudTerms(wordCloudDraft.value);
    if (targetCorpusPaths.length > 0) {
      wordCloudCorpusPaths.value = targetCorpusPaths;
    }
    wordCloudMessages.value = [{
      id: `word-cloud-scope-${Date.now()}`,
      role: "system" as const,
      text: `已按绑定路径读取 ${state.terms?.length || 0} 个语料词。`,
      at: new Date().toISOString(),
    }, ...wordCloudMessages.value].slice(0, 20);
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "刷新词云语料范围失败。";
    wordCloudMessages.value = [{
      id: `word-cloud-scope-error-${Date.now()}`,
      role: "system" as const,
      text: error.value,
      at: new Date().toISOString(),
    }, ...wordCloudMessages.value].slice(0, 20);
    if (state && state.terms) {
      return state.terms || [];
    }
  } finally {
    if (!options.silent && busyKey.value === "knowledge:word-clouds:scope") {
      clearAllBusy();
    }
  }
  return state?.terms || [];
}

function addWordCloudCorpusPaths(nextItems: Array<{ path: string; type: "directory" | "file" }>) {
  const normalizedItems = nextItems
    .map((item) => normalizeWordCloudCorpusPathForUi(item))
    .filter((item): item is KnowledgeWordCloudCorpusPath => Boolean(item));
  const existingKeys = new Set(
    wordCloudCorpusPaths.value.map((item) => `${item.type || ""}:${item.path}`.toLowerCase()),
  );
  const addedItems = normalizedItems.filter(
    (item) => !existingKeys.has(`${item.type || ""}:${item.path}`.toLowerCase()),
  );
  if (addedItems.length === 0) {
    return;
  }
  wordCloudCorpusPaths.value = normalizeWordCloudCorpusPathsForUi([
    ...wordCloudCorpusPaths.value,
    ...addedItems,
  ]);
  const selectedCorpusPaths = normalizeWordCloudCorpusPathsForUi(wordCloudCorpusPaths.value);
  setWordCloudDraftCorpusPaths();
  wordCloudMessages.value = [{
    id: `word-cloud-corpus-${Date.now()}`,
    role: "system" as const,
    text: `已绑定 ${addedItems.length} 个语料范围，正在刷新词频。`,
    at: new Date().toISOString(),
  }, ...wordCloudMessages.value].slice(0, 20);
  void persistWordCloudCorpusPaths(selectedCorpusPaths, {
    auditAction: "add",
    auditPaths: addedItems,
  });
  if (canReadKnowledge.value) {
    void refreshWordCloudCorpusTerms({ corpusPaths: selectedCorpusPaths });
  }
}

function removeWordCloudCorpusPath(index: number) {
  const removedPath = wordCloudCorpusPaths.value[index];
  wordCloudCorpusPaths.value = wordCloudCorpusPaths.value.filter((_, itemIndex) => itemIndex !== index);
  setWordCloudDraftCorpusPaths();
  void persistWordCloudCorpusPaths(wordCloudCorpusPaths.value, {
    auditAction: "remove",
    auditPaths: removedPath ? [removedPath] : [],
  });
  if (canReadKnowledge.value) {
    void refreshWordCloudCorpusTerms({ corpusPaths: wordCloudCorpusPaths.value });
  }
}

function clearWordCloudCorpusPaths() {
  const removedPaths = wordCloudCorpusPaths.value;
  wordCloudCorpusPaths.value = [];
  setWordCloudDraftCorpusPaths();
  void persistWordCloudCorpusPaths(wordCloudCorpusPaths.value, {
    auditAction: "clear",
    auditPaths: removedPaths,
  });
  if (canReadKnowledge.value) {
    void refreshWordCloudCorpusTerms({ corpusPaths: [] });
  }
}

const ruleScopeOptions = [
  { value: "knowledge", label: "知识库", description: "对入库文档、证据和知识对象生效。" },
  { value: "mail", label: "邮件", description: "对 EML/MSG、线程和事务接续生效。" },
  { value: "source", label: "数据源", description: "对原始文件、目录和采集来源生效。" },
  { value: "all", label: "全局", description: "跨来源执行，需要更谨慎审核。" },
];
const ruleMatchStrategyOptions = [
  { value: "semantic_duplicate", label: "语义重复", description: "标题、正文和实体近似相同时命中。" },
  { value: "exact_source", label: "来源一致", description: "文件 hash、路径、邮件 ID 等强证据一致时命中。" },
  { value: "same_entity_time", label: "同实体时间窗", description: "同客户、合同、账号、订单等在相近时间内命中。" },
  { value: "manual_condition", label: "人工条件", description: "使用补充说明中的明确条件。" },
];
const ruleActionOptions = [
  { value: "skip_duplicate", label: "跳过重复", description: "命中后不重复写入知识库。" },
  { value: "merge", label: "融合", description: "保留证据并生成融合建议。" },
  { value: "replace", label: "覆盖", description: "以新记录替换旧记录，需要审慎使用。" },
  { value: "manual_review", label: "人工审核", description: "只产生审核任务，不自动处理。" },
];
let syncingRuleAuthoringDraft = false;

function optionLabel(options: Array<{ value: string; label: string }>, value: string) {
  return options.find((item) => item.value === value)?.label || value;
}

function inferRuleDraftFromMessage(message: string) {
  const text = String(message || "").toLowerCase();
  const patch: Partial<typeof ruleAuthoringForm.value> = {};
  if (/邮件|eml|msg|thread|事务|账单|订单/.test(text)) {
    patch.scope = "mail";
  } else if (/目录|数据源|文件夹|路径|source/.test(text)) {
    patch.scope = "source";
  } else if (/全局|所有|全部/.test(text)) {
    patch.scope = "all";
  } else if (/知识|文档|证据|入库|docx/.test(text)) {
    patch.scope = "knowledge";
  }
  if (/完全一样|重复|相同|duplicate|相似|近似/.test(text)) {
    patch.matchStrategy = "semantic_duplicate";
    if (!/融合|合并|覆盖|替换|人工|审核/.test(text)) {
      patch.action = "skip_duplicate";
    }
  }
  if (/hash|哈希|路径|文件名|message-id|message id|来源一致/.test(text)) {
    patch.matchStrategy = "exact_source";
  }
  if (/客户|供应商|合同|订单|账号|账户|金额|时间窗|连续|月度/.test(text)) {
    patch.matchStrategy = "same_entity_time";
  }
  if (/人工条件|自定义条件|条件是/.test(text)) {
    patch.matchStrategy = "manual_condition";
  }
  if (/融合|合并|merge/.test(text)) {
    patch.action = "merge";
  } else if (/覆盖|替换|replace/.test(text)) {
    patch.action = "replace";
  } else if (/人工|审核|确认|review/.test(text)) {
    patch.action = "manual_review";
  } else if (/跳过|忽略|不写入|不重复/.test(text)) {
    patch.action = "skip_duplicate";
  }
  const percentMatch = text.match(/(\d{1,3})\s*%/);
  const decimalMatch = text.match(/\b(0\.\d+|1(?:\.0+)?)\b/);
  if (percentMatch) {
    patch.confidence = Math.max(0, Math.min(Number(percentMatch[1]) / 100, 1));
  } else if (decimalMatch) {
    patch.confidence = Math.max(0, Math.min(Number(decimalMatch[1]), 1));
  }
  if (!String(ruleAuthoringForm.value.ruleName || "").trim()) {
    if (/重复|相同|duplicate/.test(text)) {
      patch.ruleName = "重复知识处理规则";
    } else if (/账单/.test(text)) {
      patch.ruleName = "账单事务接续规则";
    } else if (/邮件|eml|msg/.test(text)) {
      patch.ruleName = "邮件知识治理规则";
    } else if (message.trim()) {
      patch.ruleName = message.trim().replace(/\s+/g, " ").slice(0, 28);
    }
  }
  return patch;
}

function buildRuleAuthoringManualMessage() {
  const draft = ruleAuthoringForm.value;
  return [
    `创建规则：${String(draft.ruleName || "").trim() || "未命名规则"}`,
    `适用范围：${optionLabel(ruleScopeOptions, draft.scope)}`,
    `匹配方式：${optionLabel(ruleMatchStrategyOptions, draft.matchStrategy)}`,
    `执行动作：${optionLabel(ruleActionOptions, draft.action)}`,
    `最低置信度：${Number(draft.confidence || 0).toFixed(2)}`,
    String(draft.notes || "").trim() ? `补充说明：${String(draft.notes || "").trim()}` : "",
  ].filter(Boolean).join("\n");
}

const ruleAuthoringEffectiveMessage = computed(() =>
  ruleCreationMode.value === "manual"
    ? buildRuleAuthoringManualMessage()
    : String(ruleAuthoringForm.value.message || "").trim(),
);
const ruleAuthoringCanSubmit = computed(() =>
  Boolean(
    ruleAuthoringEffectiveMessage.value.trim() &&
      canMaintainKnowledge.value &&
      (ruleCreationMode.value !== "chat" || selectedRuleAuthoringModel.value.enabled),
  ),
);
const ruleAuthoringDraftPayload = computed(() => ({
  mode: ruleCreationMode.value,
  ruleName: String(ruleAuthoringForm.value.ruleName || "").trim(),
  scope: ruleAuthoringForm.value.scope,
  matchStrategy: ruleAuthoringForm.value.matchStrategy,
  action: ruleAuthoringForm.value.action,
  confidence: Number(ruleAuthoringForm.value.confidence || 0),
  notes: String(ruleAuthoringForm.value.notes || "").trim(),
}));
const ruleAuthoringManualSummary = computed(() =>
  [
    optionLabel(ruleScopeOptions, ruleAuthoringForm.value.scope),
    optionLabel(ruleMatchStrategyOptions, ruleAuthoringForm.value.matchStrategy),
    optionLabel(ruleActionOptions, ruleAuthoringForm.value.action),
    `置信度 ${Number(ruleAuthoringForm.value.confidence || 0).toFixed(2)}`,
  ].join(" / "),
);

watch(
  () => ruleAuthoringForm.value.message,
  (message) => {
    if (syncingRuleAuthoringDraft || ruleCreationMode.value !== "chat") {
      return;
    }
    syncingRuleAuthoringDraft = true;
    Object.assign(ruleAuthoringForm.value, inferRuleDraftFromMessage(message));
    syncingRuleAuthoringDraft = false;
  },
);

watch(
  () => [
    ruleAuthoringForm.value.ruleName,
    ruleAuthoringForm.value.scope,
    ruleAuthoringForm.value.matchStrategy,
    ruleAuthoringForm.value.action,
    ruleAuthoringForm.value.confidence,
    ruleAuthoringForm.value.notes,
  ],
  () => {
    if (syncingRuleAuthoringDraft || ruleCreationMode.value !== "manual") {
      return;
    }
    const nextMessage = buildRuleAuthoringManualMessage();
    if (ruleAuthoringForm.value.message === nextMessage) {
      return;
    }
    syncingRuleAuthoringDraft = true;
    ruleAuthoringForm.value.message = nextMessage;
    syncingRuleAuthoringDraft = false;
  },
);

watch(ruleCreationMode, (mode) => {
  if (mode === "manual") {
    const nextMessage = buildRuleAuthoringManualMessage();
    if (!String(ruleAuthoringForm.value.message || "").trim() || ruleAuthoringForm.value.message.startsWith("创建规则：")) {
      syncingRuleAuthoringDraft = true;
      ruleAuthoringForm.value.message = nextMessage;
      syncingRuleAuthoringDraft = false;
    }
    return;
  }
  Object.assign(ruleAuthoringForm.value, inferRuleDraftFromMessage(ruleAuthoringForm.value.message));
});
const selectedAgentExploreContextProfile = computed(() => {
  const configured = String(
    agentExploreForm.value.contextProfileId ||
      settingsDraft.value.agentExploreDefaults?.contextProfileId ||
      "context-128k",
  ).trim();
  const selected = agentExploreContextWindowOptions.find(
    (item) => item.value === configured,
  );
  return selected || agentExploreContextWindowOptions[1];
});
const selectedInfoFeedModel = computed(() => {
  return selectedAgentFromOptions(infoFeedModelOptions.value, infoFeedForm.value.modelAlias);
});
const selectedKnowledgeReviewFusionModel = computed(() => {
  return selectedAgentFromOptions(
    agentSelectorOptions.value,
    settingsDraft.value.agentExploreDefaults?.reviewFusionModelAlias,
  );
});
watchAgentSelectionReference(
  "info-feed-summary",
  "信息流总结智能体",
  () => infoFeedForm.value.modelAlias,
  () => selectedInfoFeedModel.value,
);
watchAgentSelectionReference(
  "agent-explore",
  "智能检索",
  () => agentExploreForm.value.modelAlias,
  () => selectedAgentExploreModel.value,
);
watchAgentSelectionReference(
  "rule-authoring",
  "规则编排",
  () => ruleAuthoringForm.value.modelAlias,
  () => selectedRuleAuthoringModel.value,
);
watchAgentSelectionReference(
  "knowledge-review-fusion",
  "知识融合智能体",
  () => settingsDraft.value.agentExploreDefaults?.reviewFusionModelAlias || "",
  () => selectedKnowledgeReviewFusionModel.value,
);
watchAgentSelectionReference(
  "word-cloud",
  "词云生成",
  () => wordCloudModelAlias.value,
  () => selectedWordCloudModel.value,
);
function agentSelectionAlert(
  params: Omit<AgentConfigurationAlert, "status" | "tone"> & { value: string; options: Array<{ value: string; enabled: boolean; disabledReason?: string }> },
): AgentConfigurationAlert | null {
  const value = String(params.value || "").trim();
  if (!value) {
    return {
      alertId: params.alertId,
      category: params.category,
      title: params.title,
      detail: params.detail,
      status: "未配置智能体",
      tone: "warning",
      view: params.view,
      adminView: params.adminView,
      targetId: params.targetId,
    };
  }
  const option = params.options.find((item) => item.value === value);
  if (!option?.enabled) {
    return {
      alertId: params.alertId,
      category: params.category,
      title: params.title,
      detail: option?.disabledReason
        ? `${params.detail} 当前选择不可用：${option.disabledReason}。`
        : `${params.detail} 当前选择已不在模型库或尚未完成授权。`,
      status: "智能体不可用",
      tone: "danger",
      view: params.view,
      adminView: params.adminView,
      targetId: params.targetId,
    };
  }
  return null;
}

const agentConfigurationAlerts = computed<AgentConfigurationAlert[]>(() => {
  const alerts: AgentConfigurationAlert[] = [];
  if (visibleModelEntries.value.length === 0) {
    alerts.push({
      alertId: "model-library-empty",
      category: "模型库",
      title: "模型库为空",
      detail: "需要先新增至少一个智能体模型，后续功能和模块才能显式绑定。",
      status: "无可用智能体",
      tone: "danger",
      view: "admin",
      adminView: "agentConfig",
      targetId: "agent-model-library",
    });
  }
  for (const item of [
    agentSelectionAlert({
      alertId: "info-feed-summary-agent",
      category: "信息流",
      title: "信息流总结智能体",
      detail: "信息流最终报告需要一个可用智能体来融合原文检索、智能规划和附件结果。",
      value: infoFeedForm.value.modelAlias,
      options: infoFeedModelOptions.value,
      view: "feed",
      targetId: "info-feed-summary-agent",
    }),
    agentSelectionAlert({
      alertId: "agent-explore-agent",
      category: "信息流",
      title: "智能检索执行智能体",
      detail: "智能检索需要一个可用智能体来规划工具调用和打开证据。",
      value: agentExploreForm.value.modelAlias,
      options: agentExploreAgentOptions.value,
      view: "feed",
      targetId: "agent-explore-agent",
    }),
    agentSelectionAlert({
      alertId: "rule-authoring-agent",
      category: "工作台",
      title: "创建规则智能体",
      detail: "创建规则的智能对话模式需要一个可用智能体辅助生成规则草稿。",
      value: ruleAuthoringForm.value.modelAlias,
      options: ruleAuthoringModelOptions.value,
      view: "dashboard",
      targetId: "rule-authoring-agent",
    }),
    agentSelectionAlert({
      alertId: "knowledge-review-fusion-agent",
      category: "知识库",
      title: "知识融合智能体",
      detail: "冲突审核中的融合分析需要显式绑定一个可用智能体。",
      value: settingsDraft.value.agentExploreDefaults?.reviewFusionModelAlias || "",
      options: agentSelectorOptions.value,
      view: "admin",
      adminView: "agentConfig",
      targetId: "knowledge-review-fusion-agent",
    }),
  ]) {
    if (item) {
      alerts.push(item);
    }
  }
  for (const moduleDefinition of intelligentModuleDefinitions) {
    if (!moduleNeedsIntelligence(moduleDefinition.id)) {
      continue;
    }
    const refValue = moduleModelRef(moduleDefinition.id);
    const option = agentModelAssignmentOptions.value.find((item) => item.ref === refValue);
    if (!refValue) {
      alerts.push({
        alertId: `module:${moduleDefinition.id}`,
        category: "模块模型分配",
        title: moduleDefinition.label,
        detail: moduleDefinition.description,
        status: "未配置智能体",
        tone: "warning",
        view: "intelligence",
        targetId: `module-agent-${moduleDefinition.id}`,
      });
      continue;
    }
    if (!option?.enabled) {
      alerts.push({
        alertId: `module:${moduleDefinition.id}`,
        category: "模块模型分配",
        title: moduleDefinition.label,
        detail: `${moduleDefinition.description} 当前绑定的智能体不可用或未完成授权。`,
        status: "智能体不可用",
        tone: "danger",
        view: "intelligence",
        targetId: `module-agent-${moduleDefinition.id}`,
      });
    }
  }
  return alerts;
});
const agentConfigurationAlertSummary = computed(() => {
  const dangerCount = agentConfigurationAlerts.value.filter((item: any) => item.tone === "danger").length;
  const warningCount = agentConfigurationAlerts.value.length - dangerCount;
  if (agentConfigurationAlerts.value.length === 0) {
    return "所有需要智能体的功能都已显式绑定可用智能体。";
  }
  return [
    dangerCount ? `${dangerCount} 项不可用` : "",
    warningCount ? `${warningCount} 项未配置` : "",
  ].filter(Boolean).join("，");
});
const dashboardMonitorAlerts = computed<DashboardAlert[]>(() =>
  activeMonitorAlerts.value.map((alert) => {
    const recovered = alert.ackRequired || alert.active === false || alert.status === "recovered";
    const isQueueInterruption = alert.ruleId === "queueInterrupted";
    return {
      alertId: alert.alertId,
      category: isQueueInterruption ? "中断报警" : "后台报警",
      title: alert.title,
      detail: alert.queueId ? `${alert.message} 队列 ID：${alert.queueId}` : alert.message,
      status: recovered ? "已恢复，待确认" : monitorAlertSeverityLabel(alert.severity),
      tone: recovered ? "success" : alert.severity === "critical" ? "danger" : "warning",
      actionLabel: recovered ? "确认关闭" : "查看报警",
      source: "monitor",
      monitorAlert: alert,
    };
  }),
);
const liveDashboardAlerts = computed<DashboardAlert[]>(() => [
  ...dashboardMonitorAlerts.value,
  ...agentConfigurationAlerts.value.map((alert) => ({
    alertId: alert.alertId,
    category: "空配置报警",
    title: alert.title,
    detail: alert.detail,
    status: alert.status,
    tone: alert.tone,
    actionLabel: "去配置",
    source: "configuration" as const,
    configAlert: alert,
  })),
]);
function dashboardAlertInboxId(alertItem: DashboardAlert) {
  return `${alertItem.source}:${alertItem.alertId}`;
}

function syncDashboardAlertInbox(liveAlerts: DashboardAlert[]) {
  const now = new Date().toISOString();
  const liveById = new Map<string, DashboardAlert>(
    liveAlerts.map((alertItem) => [dashboardAlertInboxId(alertItem), alertItem]),
  );
  const nextDismissedIds = new Set<string>();
  for (const alertId of dismissedDashboardAlertIds.value) {
    if (liveById.has(alertId)) {
      nextDismissedIds.add(alertId);
    }
  }
  const nextInbox: Record<string, DashboardAlert> = {};
  for (const [alertId, previousAlert] of Object.entries(dashboardAlertInbox.value)) {
    if (nextDismissedIds.has(alertId)) {
      continue;
    }
    if (!liveById.has(alertId)) {
      nextInbox[alertId] = previousAlert.live === false
        ? previousAlert
        : {
            ...previousAlert,
            status: "已恢复，待确认",
            tone: "success",
            actionLabel: "确认关闭",
            live: false,
            resolvedAt: now,
          };
    }
  }
  for (const [alertId, liveAlert] of liveById.entries()) {
    if (nextDismissedIds.has(alertId)) {
      continue;
    }
    const previousAlert = dashboardAlertInbox.value[alertId];
    nextInbox[alertId] = {
      ...previousAlert,
      ...liveAlert,
      firstSeenAt: previousAlert?.firstSeenAt || now,
      lastSeenAt: now,
      live: true,
      resolvedAt: "",
    };
  }
  dismissedDashboardAlertIds.value = nextDismissedIds;
  dashboardAlertInbox.value = nextInbox;
}

const dashboardAlerts = computed<DashboardAlert[]>(() => {
  const severityRank: Record<DashboardAlert["tone"], number> = {
    danger: 0,
    warning: 1,
    success: 2,
  };
  return Object.values(dashboardAlertInbox.value)
    .filter((alertItem) => !dismissedDashboardAlertIds.value.has(dashboardAlertInboxId(alertItem)))
    .sort((left, right) => {
      const severityDiff = severityRank[left.tone] - severityRank[right.tone];
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return String(left.firstSeenAt || "").localeCompare(String(right.firstSeenAt || ""));
    });
});
const dashboardAlertSummary = computed(() => {
  const dangerCount = dashboardAlerts.value.filter((item: any) => item.tone === "danger").length;
  const warningCount = dashboardAlerts.value.filter((item: any) => item.tone === "warning").length;
  const recoveredCount = dashboardAlerts.value.filter((item: any) => item.tone === "success").length;
  if (dashboardAlerts.value.length === 0) {
    return "当前没有需要处理的报警。";
  }
  return [
    dangerCount ? `${dangerCount} 项严重` : "",
    warningCount ? `${warningCount} 项警告` : "",
    recoveredCount ? `${recoveredCount} 项已恢复待确认` : "",
  ].filter(Boolean).join("，");
});
const selectedInfoFeedContextProfile = computed(() => {
  const configured = String(
    infoFeedForm.value.contextProfileId ||
      settingsDraft.value.agentExploreDefaults?.contextProfileId ||
      "context-32k",
  ).trim();
  const selected = agentExploreContextWindowOptions.find(
    (item) => item.value === configured,
  );
  return selected || agentExploreContextWindowOptions[0];
});
function normalizedAgentExploreThinkingMode(value?: string) {
  const mode = String(value || "default").trim();
  return agentExploreThinkingModeOptions.some((item) => item.value === mode) ? mode : "default";
}
const selectedAgentExploreThinkingMode = computed(() =>
  normalizedAgentExploreThinkingMode(
    agentExploreForm.value.thinkingMode ||
      settingsDraft.value.agentExploreDefaults?.thinkingMode,
  ),
);
function agentExploreThinkingParameters() {
  const mode = selectedAgentExploreThinkingMode.value;
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
function infoFeedModelDisplayLabel(value?: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "未记录";
  }
  return infoFeedModelOptions.value.find((item) => item.value === normalized)?.label || "已移除的智能体";
}
const infoFeedSummaryRuntime = computed(() => {
  const summary = infoFeedCurrentRun.value?.summary;
  return {
    model: infoFeedModelDisplayLabel(summary?.modelAlias || selectedInfoFeedModel.value.value),
    temperature: Number(summary?.temperature ?? infoFeedForm.value.temperature ?? 0.2),
    maxTokens: Number(summary?.maxTokens ?? infoFeedForm.value.maxTokens ?? 1800),
  };
});

watch(
  agentSelectorOptions,
  (options) => {
    cacheAgentModelOptionLabels(options);
  },
  { immediate: true },
);

watch(
  () => [
    infoFeedCurrentRun.value?.runId || "",
    infoFeedCurrentRun.value?.summary.status || "",
    infoFeedCurrentRun.value?.summary.answer || "",
  ],
  ([runId, status, answer]) => {
    const nextAnswer = String(answer || "");
    clearInfoFeedSummaryStreamTimer();
    if (!runId || !nextAnswer || status === "running") {
      infoFeedSummaryStreamText.value = "";
      return;
    }
    streamInfoFeedSummary(nextAnswer, String(runId));
  },
  { immediate: true },
);

const knowledgeSearchExpanded = computed(
  () =>
    debugTab.value === "knowledgeRecall" &&
    (busyKey.value === "knowledge:search" ||
      Boolean(lastKnowledgeSearchQuery.value) ||
      knowledgeSearchResults.value.length > 0 ||
      Boolean(selectedEvidence.value)),
);
const knowledgeSearchEmpty = computed(
  () =>
    Boolean(lastKnowledgeSearchQuery.value) &&
    busyKey.value !== "knowledge:search" &&
    knowledgeSearchResults.value.length === 0,
);
const agentExploreSteps = computed(() => agentExploreResult.value?.steps || []);
const agentExploreWorkspaceId = computed(
  () => String(agentExploreResult.value?.workspace?.workspaceId || agentExploreForm.value.workspaceId || ""),
);
const agentExploreRunInput = computed(() => asRecord(agentExploreResult.value?.run?.input) || {});
const agentExploreRunCoverage = computed(() => asRecord(agentExploreResult.value?.run?.coverage) || {});
const agentExploreMaxIterations = computed(() =>
  Math.max(
    1,
    Math.min(
      Number(agentExploreRunInput.value.maxIterations || agentExploreForm.value.maxIterations || 1),
      8,
    ),
  ),
);
const agentExploreActiveIteration = computed(() => {
  const explicit = Number(agentExploreRunCoverage.value.activeIteration || 0);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.min(explicit, agentExploreMaxIterations.value);
  }
  const lastStep = agentExploreSteps.value[agentExploreSteps.value.length - 1];
  const iteration = Number(lastStep?.iteration || 0);
  return Number.isFinite(iteration) && iteration > 0
    ? Math.min(iteration, agentExploreMaxIterations.value)
    : 0;
});
const agentExploreProgress = computed(() => {
  const status = agentExploreRunStatus(agentExploreResult.value);
  const maxIterations = agentExploreMaxIterations.value;
  if (!agentExploreResult.value) {
    return {
      percent: busyKey.value === "knowledge:agent-explore" ? 4 : 0,
      label: busyKey.value === "knowledge:agent-explore" ? "准备检索" : "未开始",
    };
  }
  if (status === "completed") {
    return {
      percent: 100,
      label: `已完成 ${maxIterations} 轮上限`,
    };
  }
  const phase = String(
    agentExploreRunCoverage.value.activePhase ||
      agentExploreSteps.value[agentExploreSteps.value.length - 1]?.phase ||
      status ||
      "running",
  );
  const phaseWeight =
    phase === "model_calling"
      ? 0.15
      : phase === "tool_selected" || phase === "answer_ready"
        ? 0.38
        : phase === "tool_calling"
          ? 0.68
          : phase === "tool_result" || phase === "completed"
            ? 0.92
            : 0.08;
  const activeIteration = Math.max(1, agentExploreActiveIteration.value || 1);
  const percent = Math.max(
    4,
    Math.min(99, Math.round(((activeIteration - 1 + phaseWeight) / maxIterations) * 100)),
  );
  return {
    percent: status === "failed" ? Math.min(percent, 100) : percent,
    label: `第 ${activeIteration} / ${maxIterations} 轮 · ${agentExplorePhaseLabel(phase)}`,
  };
});
const agentExploreProgressVisible = computed(() => {
  if (agentExploreProgress.value.percent >= 100) {
    return false;
  }
  if (busyKey.value === "knowledge:agent-explore") {
    return true;
  }
  return ["queued", "running"].includes(agentExploreRunStatus(agentExploreResult.value));
});
const agentExploreEvidenceRefs = computed(() => agentExploreResult.value?.evidenceRefs || []);
const agentExploreLinkedEvidenceRefs = computed(() =>
  uniqueEvidenceRefs([
    ...agentExploreEvidenceRefs.value,
    ...extractEvidenceRefsFromText(agentExploreResult.value?.answer || ""),
  ]),
);
const agentExploreAnswerHtml = computed(() =>
  markdownToSafeHtml(
    linkifyEvidenceRefsInMarkdown(
      agentExploreResult.value?.answer || "",
      agentExploreLinkedEvidenceRefs.value,
    ),
  ),
);
const agentExploreDocumentMarkdown = computed(() => {
  const result = agentExploreResult.value;
  const answer = String(result?.answer || "").trim();
  if (!answer) {
    return "";
  }
  const run = asRecord(result?.run) || {};
  const input = asRecord(run.input) || {};
  const runId = String(run.runId || "");
  const workspaceId = String(asRecord(result?.workspace)?.workspaceId || "");
  const query = String(input.query || agentExploreForm.value.query || "");
  const modelAlias = String(input.modelAlias || agentExploreForm.value.modelAlias || "");
  const contextProfileId = String(input.contextProfileId || agentExploreForm.value.contextProfileId || "");
  const updatedAt = String(run.completedAt || run.updatedAt || new Date().toISOString());
  const refs = agentExploreEvidenceRefs.value;
  const metaLines = [
    `- 问题：${query || "未记录"}`,
    `- 模型：${modelAlias || "未记录"}`,
    `- 上下文：${contextProfileId || "未记录"}`,
    `- 状态：${agentExploreRunStatus(result) || "unknown"}`,
    runId ? `- Run：${runId}` : "",
    workspaceId ? `- Workspace：${workspaceId}` : "",
    `- 生成时间：${formatMachineDate(updatedAt, "full")}`,
  ].filter(Boolean);
  const citationLines = refs.length
    ? refs.map((refId, index) => `${index + 1}. \`${refId}\``)
    : ["无"];
  return [
    "# 智能检索结果",
    "",
    ...metaLines,
    "",
    "## 结论",
    "",
    answer,
    "",
    "## 引用证据",
    "",
    ...citationLines,
    "",
  ].join("\n");
});
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
const infoFeedSummaryEvidenceRefs = computed(() =>
  uniqueEvidenceRefs([
    ...infoFeedKeywordItems.value.map((item) => String(item.evidenceId || "")).filter(Boolean),
    ...extractEvidenceRefsFromText(infoFeedAgentAnswer.value),
    ...extractEvidenceRefsFromText(infoFeedCurrentRun.value?.summary.answer || ""),
  ]),
);
const infoFeedVisibleSummaryText = computed(() => {
  const answer = String(infoFeedCurrentRun.value?.summary.answer || "");
  if (!answer) {
    return "";
  }
  return infoFeedSummaryStreamText.value || answer;
});
const infoFeedStreamingSummaryHtml = computed(() =>
  markdownToSafeHtml(
    linkifyEvidenceRefsInMarkdown(
      infoFeedVisibleSummaryText.value,
      infoFeedSummaryEvidenceRefs.value,
    ),
  ),
);
const infoFeedSummaryIsStreaming = computed(() => {
  const answer = String(infoFeedCurrentRun.value?.summary.answer || "");
  return Boolean(answer && infoFeedSummaryStreamText.value.length < answer.length);
});
const infoFeedSummaryMarkdown = computed(() => {
  const run = infoFeedCurrentRun.value;
  const answer = String(run?.summary.answer || "").trim();
  if (!run || !answer) {
    return "";
  }
  const citationLines = infoFeedSummaryEvidenceRefs.value.length
    ? infoFeedSummaryEvidenceRefs.value.map((refId, index) => `${index + 1}. \`${refId}\``)
    : ["无"];
  const turnLines = (run.turns || []).flatMap((turn, index) => [
    `## ${infoFeedTurnTitle(turn, index)}`,
    "",
    `- 问题：${infoFeedTurnQuestion(turn)}`,
    ...(infoFeedTurnAttachments(turn).length
      ? [
          `- 附件：${infoFeedTurnAttachments(turn)
            .map((attachment) => `${attachment.name}（${formatFileSize(attachment.size)}，${infoFeedStatusLabel(attachment.status)}）`)
            .join("；")}`,
        ]
      : []),
    `- 生成时间：${formatMachineDate(turn.completedAt || run.startedAt, "full")}`,
    turn.summaryFallback ? "- 状态：模型总结失败，使用本地兜底摘要" : "- 状态：模型总结完成",
    "",
    turn.summaryAnswer || "无输出。",
    "",
    ...(turn.expertFeedback || []).length
      ? [
          "### 人类专家意见",
          "",
          ...(turn.expertFeedback || []).map((item) =>
            `- ${item.selectedLabel}：${item.followUpQuestion}`,
          ),
          "",
        ]
      : [],
  ]);
  return [
    "# 信息流总结",
    "",
    `- 问题：${run.query}`,
    `- 模型：${run.summary.modelAlias || "未记录"}`,
    `- 上下文：${run.summary.contextProfileId || "未记录"}`,
    `- 生成时间：${formatMachineDate(run.completedAt || new Date().toISOString(), "full")}`,
    run.summary.fallback ? "- 状态：模型总结失败，使用本地兜底摘要" : "- 状态：模型总结完成",
    "",
    ...turnLines,
    "## 结论",
    "",
    ...(run.followUp ? [`当前追问：${run.followUp.question}`, ""] : []),
    ...(run.attachments.length
      ? [
          `当前附件：${run.attachments
            .map((attachment) => `${attachment.name}（${formatFileSize(attachment.size)}，${infoFeedStatusLabel(attachment.status)}）`)
            .join("；")}`,
          "",
        ]
      : []),
    answer,
    "",
    "## 引用证据",
    "",
    ...citationLines,
    "",
  ].join("\n");
});
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
function infoFeedExpertFeedbackFor(anchor: InfoFeedExpertFeedbackAnchor) {
  return infoFeedExpertFeedbackForRun(infoFeedCurrentRun.value, anchor);
}
function infoFeedExpertFeedbackForRun(run: InfoFeedRunState | null | undefined, anchor: InfoFeedExpertFeedbackAnchor) {
  return (run?.expertFeedback || []).filter((item: any) => item.anchor === anchor);
}
const infoFeedParentRunForCurrent = computed(() => {
  const current = infoFeedCurrentRun.value;
  const parent = infoFeedParentRunSnapshot.value;
  return current?.followUp?.parentRunId && parent?.runId === current.followUp.parentRunId ? parent : null;
});
const infoFeedParentSummaryEvidenceRefs = computed(() => {
  const parent = infoFeedParentRunForCurrent.value;
  return parent ? infoFeedRunEvidenceRefs(parent) : [];
});
const infoFeedParentSummaryHtml = computed(() => {
  const parent = infoFeedParentRunForCurrent.value;
  return markdownToSafeHtml(
    linkifyEvidenceRefsInMarkdown(
      parent?.summary.answer || "",
      infoFeedParentSummaryEvidenceRefs.value,
    ),
  );
});
function infoFeedTurnSummaryHtml(turn: InfoFeedTurnSnapshot) {
  return markdownToSafeHtml(
    linkifyEvidenceRefsInMarkdown(
      turn.summaryAnswer || "",
      turn.evidenceRefs || [],
    ),
  );
}
function infoFeedTurnTitle(turn: InfoFeedTurnSnapshot, index: number) {
  return turn.followUpQuestion ? `第 ${index + 1} 轮追问` : `第 ${index + 1} 轮`;
}
function infoFeedTurnQuestion(turn: InfoFeedTurnSnapshot) {
  return turn.followUpQuestion || turn.query || "未记录问题";
}
function infoFeedTurnAttachments(turn: InfoFeedTurnSnapshot) {
  return (turn.attachments || []).filter(Boolean);
}
function infoFeedCurrentUserQuestion(run: InfoFeedRunState) {
  return run.followUp?.question || run.query || "未记录问题";
}
function infoFeedUserCardTitle(runOrTurn: InfoFeedRunState | InfoFeedTurnSnapshot) {
  return "followUp" in runOrTurn
    ? (runOrTurn.followUp ? "用户回复" : "用户问题")
    : ((runOrTurn as InfoFeedTurnSnapshot).followUpQuestion ? "用户回复" : "用户问题");
}
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
function infoFeedRetryStageLabel(stage?: InfoFeedRetryStage | "") {
  if (stage === "keyword") {
    return "原文检索";
  }
  if (stage === "agent") {
    return "智能规划";
  }
  if (stage === "summary") {
    return "知识归纳";
  }
  return "请求";
}
const infoFeedRetryMessage = computed(() => {
  const run = infoFeedCurrentRun.value;
  if (!run?.pausedForRetry) {
    return "";
  }
  const retry = run.retry;
  const attempts = retry?.attempts || INFO_FEED_FETCH_RETRY_LIMIT;
  const limit = retry?.limit || INFO_FEED_FETCH_RETRY_LIMIT;
  const detail = retry?.error || "网络请求失败。";
  return `${infoFeedRetryStageLabel(run.pausedForRetry)}请求失败，已自动重试 ${attempts}/${limit} 次。检查服务恢复后可以点击继续从当前阶段重试。${detail ? `（${detail}）` : ""}`;
});
const knowledgeRecentJobs = computed(() => knowledgeConsole.value?.recentJobs || []);
const baseServerLogRows = computed<KnowledgeLogRow[]>(() => {
  const traceRows = uploadTraceEvents.value.map((event) => {
    const payload = asRecord(event.payload) || {};
    const http = asRecord(payload.http) || {};
    const level = String(payload.level || "info");
    const functionName = String(payload.functionName || "");
    const stage = String(payload.stage || event.type || "");
    const message = String(payload.message || "");
    const layer = String(payload.layer || "");
    return {
      logId: `upload-trace:${event.id}`,
      kindLabel: layer === "store" ? "上传函数" : "上传报文",
      displayId: `#${event.offset}`,
      target: [http.method, http.path].filter(Boolean).join(" ") || functionName || String(payload.sessionId || ""),
      status: level,
      statusLabel: stage || level,
      tone: uploadTraceTone(level),
      stage: functionName || message,
      occurredAt: event.publishedAt || "",
      createdAt: event.publishedAt || "",
      progressPercent: traceProgressPercent(payload),
      detail: uploadTraceDetailText(payload),
      error: String(payload.error || ""),
    };
  });
  const jobRows = knowledgeRecentJobs.value.map((job) => {
    const summary = job.resultSummary
      ? [
          `邮件 ${job.resultSummary.emails || 0}`,
          `事务 ${job.resultSummary.transactions || 0}`,
          `人物 ${job.resultSummary.people || 0}`,
          `警告 ${job.resultSummary.warnings || 0}`,
        ].join(" / ")
      : "";
    return {
      logId: `job:${job.id}`,
      kindLabel: "入库任务",
      displayId: shortId(job.id),
      target: job.id,
      status: job.status,
      statusLabel: jobStatusLabels[job.status] || job.status,
      tone: jobStatusTone(job.status),
      stage: job.stage || "",
      occurredAt: job.updatedAt || job.finishedAt || job.startedAt || job.createdAt || "",
      createdAt: job.createdAt || "",
      progressPercent: Number(job.progressPercent || 0),
      detail: summary || job.error || "",
      error: job.error || "",
    };
  });
  const sourceRows = activeKnowledgeSources.value.map((source) => ({
    logId: `source:${source.sourceId}`,
    kindLabel: "目录管理",
    displayId: shortId(source.sourceId),
    target: source.label || source.directoryPath || source.sourceId,
    status: source.status || source.lastJobStatus || "",
    statusLabel: sourceSyncLabel(source),
    tone: sourceSyncTone(source),
    stage: source.lastJobStage || source.pendingReason || source.watcherStatus || "",
    occurredAt:
      source.lastJobUpdatedAt ||
      source.lastSyncedAt ||
      source.lastScanAt ||
      source.lastEventAt ||
      source.updatedAt ||
      source.createdAt ||
      "",
    createdAt: source.createdAt || "",
    progressPercent: sourceJobProgress(source),
    detail: [
      source.directoryPath,
      `${source.lastFileCount || 0} 个文件`,
      formatBytes(source.lastTotalBytes || 0),
      source.lastJobId ? `任务 ${shortId(source.lastJobId)}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    error: source.error || "",
  }));
  return [...traceRows, ...jobRows, ...sourceRows, ...agentSelectionReferenceLogs.value].sort(
    (left, right) => parseTime(right.occurredAt) - parseTime(left.occurredAt),
  );
});
function dedupeLogRows(rows: KnowledgeLogRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.logId)) {
      return false;
    }
    seen.add(row.logId);
    return true;
  });
}
let collectSystemStatusLogRows: () => KnowledgeLogRow[] = () => [];
const serverLogRows = computed<KnowledgeLogRow[]>(() =>
  dedupeLogRows([...collectSystemStatusLogRows(), ...baseServerLogRows.value]).sort(
    (left, right) => parseTime(right.occurredAt) - parseTime(left.occurredAt),
  ),
);
const knowledgeLogStatusOptions = computed(() =>
  Array.from(new Set(serverLogRows.value.map((row) => row.statusLabel).filter(Boolean))),
);
const filteredKnowledgeLogRows = computed(() => {
  const filters = knowledgeLogFilters.value;
  const idQuery = filters.id.trim().toLowerCase();
  const stageQuery = filters.stage.trim().toLowerCase();
  const fromTime = parseFilterDate(filters.from, "start");
  const toTime = parseFilterDate(filters.to, "end");
  return serverLogRows.value.filter((row) => {
    const id = `${row.logId} ${row.target} ${row.displayId}`.toLowerCase();
    const stage = `${row.stage} ${row.detail} ${row.error}`.toLowerCase();
    const updatedAt = parseTime(row.occurredAt || row.createdAt);
    if (idQuery && !id.includes(idQuery)) {
      return false;
    }
    if (filters.status && row.statusLabel !== filters.status && row.status !== filters.status) {
      return false;
    }
    if (stageQuery && !stage.includes(stageQuery)) {
      return false;
    }
    if (fromTime && (!updatedAt || updatedAt < fromTime)) {
      return false;
    }
    if (toTime && (!updatedAt || updatedAt > toTime)) {
      return false;
    }
    return true;
  });
});
const knowledgeLogColumnDividers = computed(() => {
  let left = 0;
  return knowledgeLogColumnOrder.slice(0, -1).map((key) => {
    left += knowledgeLogColumnWidths.value[key];
    return {
      key,
      label: knowledgeLogColumnLabels[key],
      left: left - knowledgeLogTableScrollLeft.value,
      active: knowledgeLogResizing.value?.key === key,
    };
  });
});
const evidenceReadableHtml = computed(() => renderEvidenceReadableHtml());
const evidenceReadableKind = computed(() => evidenceReadableKindLabel());

function hasScope(scopeId: string) {
  return isAuthenticated.value && currentUserScopes.value.includes(scopeId);
}

function jsonPreview(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function agentExplorePhaseLabel(phase: unknown) {
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

function agentExploreStepOpen(step: unknown) {
  const value = asRecord(step) || {};
  const status = agentExploreRunStatus(agentExploreResult.value);
  return (
    status === "running" &&
    Number(value.iteration || 0) === agentExploreActiveIteration.value
  );
}

function agentExploreStepSummary(step: unknown) {
  const value = asRecord(step) || {};
  const toolCount = Array.isArray(value.toolCalls) ? value.toolCalls.length : 0;
  const resultCount = Array.isArray(value.toolResults) ? value.toolResults.length : 0;
  const phase = agentExplorePhaseLabel(value.phase || value.status);
  if (!toolCount && !resultCount) {
    return phase;
  }
  return `${phase} · 工具 ${toolCount} · 返回 ${resultCount}`;
}

function agentExploreResultKey(step: unknown, toolResult: unknown, index: number) {
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

function agentExploreSessionLabel(session: AgentExploreSession) {
  const time = formatCompactDate(session.updatedAt);
  return `${time ? `${time} · ` : ""}${session.query || "未命名探索"}`;
}

function isAgentExploreDraftSession(session: AgentExploreSession | null | undefined) {
  return String(session?.runId || "").startsWith("draft:");
}

function agentExploreTabTitle(session: AgentExploreSession) {
  if (isAgentExploreDraftSession(session) && !session.query.trim()) {
    return "新会话";
  }
  return session.query || "未命名探索";
}

function agentExploreTabMeta(session: AgentExploreSession) {
  if (isAgentExploreDraftSession(session)) {
    return "草稿";
  }
  return `${session.status || "unknown"} · ${shortId(session.runId)}`;
}

function agentExploreEventLabel(event: unknown) {
  const value = asRecord(event) || {};
  return String(value.label || value.type || "状态更新");
}

function agentExploreEventStatus(event: unknown) {
  const value = asRecord(event) || {};
  return String(value.status || "running");
}

function agentExploreEventTime(event: unknown) {
  const value = asRecord(event) || {};
  return formatCompactDate(String(value.createdAt || ""));
}

function shortId(value: unknown) {
  const text = String(value || "").trim();
  if (text.length <= 16) {
    return text || "--";
  }
  return `${text.slice(0, 8)}…${text.slice(-4)}`;
}

function parseFilterDate(value: string, boundary: "start" | "end") {
  if (!value) {
    return 0;
  }
  const suffix = boundary === "start" ? "T00:00:00" : "T23:59:59";
  const time = new Date(`${value}${suffix}`).getTime();
  return Number.isFinite(time) ? time : 0;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatMachineDate(value: string, mode: "compact" | "full") {
  if (!value) {
    return "未记录";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  const hour = padDatePart(date.getHours());
  const minute = padDatePart(date.getMinutes());
  if (mode === "compact") {
    return `${month}-${day} ${hour}:${minute}`;
  }
  return [
    date.getFullYear(),
    month,
    day,
  ].join("-") + ` ${hour}:${minute}:${padDatePart(date.getSeconds())}`;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadTextFile(fileName: string, content: string, contentType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function safeDownloadName(value: string, fallback = "export") {
  const normalized = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return normalized || fallback;
}

async function copyTextToClipboard(content: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }
  const textArea = document.createElement("textarea");
  textArea.value = content;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

function currentAgentExploreQuery() {
  return String(agentExploreRunInput.value.query || agentExploreForm.value.query || "").trim();
}

function recordConsoleKnowledgeFeedback(action: string, context: Record<string, unknown> = {}) {
  const query = String(context.query || currentAgentExploreQuery() || infoFeedCurrentRun.value?.query || knowledgeSearchForm.value.query || "").trim();
  void bridge.recordKnowledgeFeedback({
    clientId: "server-console-ui",
    query,
    action,
    itemId: String(context.itemId || agentExploreResult.value?.run?.runId || infoFeedCurrentRun.value?.runId || ""),
    evidenceId: String(context.evidenceId || ""),
    resultRank: Number(context.resultRank || 0),
    createdAt: new Date().toISOString(),
    context: {
      source: "server_console",
      ...context,
    },
  }).catch(() => {
    // Feedback must not block user actions.
  });
}

async function copyAgentExploreDocument() {
  const content = agentExploreDocumentMarkdown.value.trim();
  if (!content) {
    error.value = "暂无可复制的智能检索结果。";
    return;
  }
  try {
    await copyTextToClipboard(content);
    recordConsoleKnowledgeFeedback("copy", {
      surface: "agent_explore",
      query: currentAgentExploreQuery(),
      evidenceRefs: agentExploreEvidenceRefs.value,
      contextBuildRecordId: String(asRecord(agentExploreResult.value?.contextPack)?.contextBuildRecordId || ""),
    });
    error.value = "";
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "复制智能检索结果失败。";
  }
}

function exportAgentExploreDocument() {
  const content = agentExploreDocumentMarkdown.value.trim();
  if (!content) {
    error.value = "暂无可导出的智能检索结果。";
    return;
  }
  const query = String(agentExploreRunInput.value.query || agentExploreForm.value.query || "智能检索");
  const timestamp = formatMachineDate(new Date().toISOString(), "full").replace(/[: ]/g, "-");
  downloadTextFile(
    `${safeDownloadName(query, "agent-search")}-${timestamp}.md`,
    `${content}\n`,
    "text/markdown;charset=utf-8",
  );
  recordConsoleKnowledgeFeedback("export", {
    surface: "agent_explore",
    query,
    evidenceRefs: agentExploreEvidenceRefs.value,
    contextBuildRecordId: String(asRecord(agentExploreResult.value?.contextPack)?.contextBuildRecordId || ""),
  });
  error.value = "";
}

function redactAgentModelEntryForExport(entry: AgentModelConfig) {
  return {
    ...entry,
    apiKey: "",
    apiKeyConfigured: Boolean(entry.apiKey || entry.apiKeyConfigured),
    token: "",
    tokenConfigured: Boolean(entry.token || entry.tokenConfigured),
  };
}

function redactedProviderSettingsForAgentExport(entry: AgentModelConfig, settings: AgentSettings) {
  const provider = String(entry.provider || "");
  if (provider === "google-gemini") {
    return {
      provider,
      googleModel: entry.model || settings.googleModel,
      googleApiKeyConfigured: Boolean(settings.googleApiKey || settings.googleApiKeyConfigured),
    };
  }
  if (provider === "openai-chatgpt") {
    return {
      provider,
      openAiModel: entry.model || settings.openAiModel,
      codexOAuthConfigured: Boolean(codexOAuthStatus.value?.valid),
    };
  }
  if (provider === "deepseek") {
    return {
      provider,
      deepSeekBaseUrl: entry.baseUrl || settings.deepSeekBaseUrl,
      deepSeekModel: entry.model || settings.deepSeekModel,
      deepSeekApiKeyConfigured: Boolean(
        entry.apiKey ||
          entry.apiKeyConfigured ||
          settings.deepSeekApiKey ||
          settings.deepSeekApiKeyConfigured,
      ),
      deepSeekTimeoutMs: Number(entry.timeoutMs || settings.deepSeekTimeoutMs || 120000),
    };
  }
  if (provider === "openrouter") {
    return {
      provider,
      openRouterBaseUrl: settings.openRouterBaseUrl,
      openRouterModel: entry.model || settings.openRouterModel,
      openRouterApiKeyConfigured: Boolean(settings.openRouterApiKey || settings.openRouterApiKeyConfigured),
    };
  }
  if (provider === "copilot") {
    return {
      provider,
      copilotEndpoint: settings.copilotEndpoint,
      copilotModel: entry.model || settings.copilotModel,
      copilotApiKeyConfigured: Boolean(settings.copilotApiKey || settings.copilotApiKeyConfigured),
    };
  }
  if (provider === "local-model") {
    return {
      provider,
      localModelEndpoint: settings.localModelEndpoint,
      localModelName: entry.model || settings.localModelName,
    };
  }
  if (provider === "custom-http") {
    return {
      provider,
      url: entry.url || settings.customHttpAdapter?.url || "",
      tokenHeader: entry.tokenHeader || settings.customHttpAdapter?.tokenHeader || "token",
      tokenPrefix: entry.tokenPrefix || settings.customHttpAdapter?.tokenPrefix || "",
      tokenConfigured: Boolean(
        entry.token ||
          entry.tokenConfigured ||
          settings.customHttpAdapter?.token ||
          settings.customHttpAdapter?.tokenConfigured,
      ),
      timeoutMs: Number(entry.timeoutMs || settings.customHttpAdapter?.timeoutMs || 120000),
    };
  }
  return { provider };
}

function exportAgentModelEntryConfig(entry: AgentModelConfig) {
  const payload = settingsPayloadForSave();
  const entryIndex = visibleModelEntries.value.findIndex(
    (item) => modelEntryStatusKey(item) === modelEntryStatusKey(entry),
  );
  const normalizedEntry = {
    ...normalizeModelEntry(entry, entryIndex >= 0 ? entryIndex : 0),
    parameters: modelEntryParameters(entry),
  };
  const timestamp = formatMachineDate(new Date().toISOString(), "full").replace(/[: ]/g, "-");
  const exportPayload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    type: "pact.agent-model-config.v1",
    source: "server-console-model-library",
    note: "导出的是当前智能体配置；密钥和 Token 字段已脱敏，未包含其它智能体配置。",
    model: redactAgentModelEntryForExport(normalizedEntry),
    providerSettings: redactedProviderSettingsForAgentExport(normalizedEntry, payload),
  };
  downloadTextFile(
    `pact-agent-${safeDownloadName(normalizedEntry.label || modelEntryStatusKey(normalizedEntry), "model")}-${timestamp}.json`,
    `${JSON.stringify(exportPayload, null, 2)}\n`,
    "application/json;charset=utf-8",
  );
  error.value = "";
}

function isModelConfigurationError(value: unknown) {
  const message = String(value instanceof Error ? value.message : value || "");
  return /URL\s*未配置|url\s*未配置|模型.*未配置|智能体.*未配置|not configured|missing.*url/i.test(message);
}

class InfoFeedRetryExhaustedError extends Error {
  stage: InfoFeedRetryStage;
  attempts: number;
  causeError: unknown;

  constructor(stage: InfoFeedRetryStage, attempts: number, causeError: unknown) {
    const message = causeError instanceof Error ? causeError.message : String(causeError || "请求失败。");
    super(`${infoFeedRetryStageLabel(stage)}请求失败，已自动重试 ${attempts}/${INFO_FEED_FETCH_RETRY_LIMIT} 次：${message}`);
    this.name = "InfoFeedRetryExhaustedError";
    this.stage = stage;
    this.attempts = attempts;
    this.causeError = causeError;
  }
}

function isInfoFeedRetryExhaustedError(value: unknown): value is InfoFeedRetryExhaustedError {
  return value instanceof InfoFeedRetryExhaustedError;
}

function isTransientFetchError(value: unknown) {
  const message = String(value instanceof Error ? value.message : value || "");
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|connection.*(lost|refused|reset)|err_network/i.test(message);
}

function setInfoFeedRetryState(run: InfoFeedRunState, stage: InfoFeedRetryStage, attempts: number, value: unknown) {
  run.retry = {
    stage,
    attempts,
    limit: INFO_FEED_FETCH_RETRY_LIMIT,
    error: value instanceof Error ? value.message : String(value || "请求失败。"),
    updatedAt: new Date().toISOString(),
  };
}

function clearInfoFeedRetryState(run: InfoFeedRunState, stage?: InfoFeedRetryStage) {
  if (run.pausedForRetry && (!stage || run.pausedForRetry === stage)) {
    run.pausedForRetry = "";
  }
  if (run.retry && (!stage || run.retry.stage === stage)) {
    run.retry = undefined;
  }
}

async function withInfoFeedFetchRetry<T>(
  run: InfoFeedRunState,
  stage: InfoFeedRetryStage,
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown = null;
  clearInfoFeedRetryState(run, stage);
  for (let attempt = 1; attempt <= INFO_FEED_FETCH_RETRY_LIMIT; attempt += 1) {
    try {
      const result = await operation();
      clearInfoFeedRetryState(run, stage);
      return result;
    } catch (nextError) {
      lastError = nextError;
      if (!isTransientFetchError(nextError)) {
        throw nextError;
      }
      setInfoFeedRetryState(run, stage, attempt, nextError);
      if (attempt >= INFO_FEED_FETCH_RETRY_LIMIT) {
        run.pausedForRetry = stage;
        throw new InfoFeedRetryExhaustedError(stage, attempt, nextError);
      }
      await delayMs(Math.min(2200, 280 + attempt * 220));
    }
  }
  run.pausedForRetry = stage;
  throw new InfoFeedRetryExhaustedError(stage, INFO_FEED_FETCH_RETRY_LIMIT, lastError);
}

function delayMs(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function makeInfoFeedId(prefix = "info-feed") {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function truncateInfoFeedText(value: unknown, maxLength = 600) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function formatFileSize(size: number) {
  const value = Number(size || 0);
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function infoFeedStatusLabel(status: InfoFeedStageStatus) {
  if (status === "running") return "运行中";
  if (status === "completed") return "完成";
  if (status === "failed") return "失败";
  return "待开始";
}

function infoFeedStatusTone(status: InfoFeedStageStatus) {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "running") return "info";
  return "muted";
}

function isReadableInfoFeedAttachment(file: File) {
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

async function readInfoFeedAttachment(file: File): Promise<InfoFeedAttachment> {
  const attachment: InfoFeedAttachment = {
    id: makeInfoFeedId("attachment"),
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    status: "running",
    progress: 10,
    text: "",
    error: "",
  };
  if (file.size > 2 * 1024 * 1024) {
    return {
      ...attachment,
      status: "failed",
      progress: 100,
      error: "附件超过 2MB，信息流输入暂不直接读取。",
    };
  }
  if (!isReadableInfoFeedAttachment(file)) {
    return {
      ...attachment,
      status: "failed",
      progress: 100,
      error: "当前格式无法在页面侧直接读取。",
    };
  }
  try {
    const text = await file.text();
    if (!text.trim() || text.includes("\u0000")) {
      return {
        ...attachment,
        status: "failed",
        progress: 100,
        error: "文件内容为空或疑似二进制内容。",
      };
    }
    return {
      ...attachment,
      status: "completed",
      progress: 100,
      text: text.slice(0, 20000),
    };
  } catch (nextError) {
    return {
      ...attachment,
      status: "failed",
      progress: 100,
      error: nextError instanceof Error ? nextError.message : "读取失败。",
    };
  }
}

async function handleInfoFeedAttachmentFiles(selectedFiles: File[]) {
  const files = Array.from(selectedFiles || []);
  if (!files.length) {
    return;
  }
  const pending = files.map((file) => ({
    id: makeInfoFeedId("attachment"),
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    status: "running" as InfoFeedStageStatus,
    progress: 5,
    text: "",
    error: "",
  }));
  infoFeedAttachments.value = [...infoFeedAttachments.value, ...pending];
  await Promise.all(files.map(async (file, index) => {
    const result = await readInfoFeedAttachment(file);
    const pendingId = pending[index].id;
    infoFeedAttachments.value = infoFeedAttachments.value.map((attachment) =>
      attachment.id === pendingId
        ? {
            ...result,
            id: pendingId,
          }
        : attachment,
    );
  }));
}

function removeInfoFeedAttachment(attachmentId: string) {
  infoFeedAttachments.value = infoFeedAttachments.value.filter((attachment) => attachment.id !== attachmentId);
}

function compactInfoFeedAttachment(attachment: InfoFeedAttachment): InfoFeedAttachment {
  return {
    ...attachment,
    text: String(attachment.text || "").slice(0, 4000),
    error: String(attachment.error || "").slice(0, 1000),
  };
}

function snapshotInfoFeedAttachments(attachments: InfoFeedAttachment[] = infoFeedAttachments.value) {
  return attachments.map(compactInfoFeedAttachment);
}

function createInfoFeedFollowUpContext(previousRun: InfoFeedRunState | null, question: string): InfoFeedRunState["followUp"] | undefined {
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

function createInfoFeedRun(query: string, followUp?: InfoFeedRunState["followUp"]): InfoFeedRunState {
  return {
    runId: makeInfoFeedId("run"),
    query,
    startedAt: new Date().toISOString(),
    completedAt: "",
    attachments: snapshotInfoFeedAttachments(),
    ...(followUp ? { followUp } : {}),
    expertFeedback: [],
    turns: [],
    keyword: {
      status: "idle",
      progress: 0,
      stage: "",
      fromCache: false,
      response: null,
      error: "",
    },
    agent: {
      status: "idle",
      progress: 0,
      runId: "",
      workspaceId: "",
      response: null,
      error: "",
    },
    summary: {
      status: "idle",
      progress: 0,
      modelAlias: selectedInfoFeedModel.value.value,
      contextProfileId: selectedInfoFeedContextProfile.value.value,
      parametersOpen: false,
      temperature: Number(infoFeedForm.value.temperature || 0.2),
      maxTokens: Number(infoFeedForm.value.maxTokens || 1800),
      answer: "",
      error: "",
      fallback: false,
    },
    pausedForModelSelection: "",
    pausedForRetry: "",
    retry: undefined,
  };
}

function initialInfoFeedKeywordState(): InfoFeedRunState["keyword"] {
  return {
    status: "idle",
    progress: 0,
    stage: "",
    fromCache: false,
    response: null,
    error: "",
  };
}

function initialInfoFeedAgentState(): InfoFeedRunState["agent"] {
  return {
    status: "idle",
    progress: 0,
    runId: "",
    workspaceId: "",
    response: null,
    error: "",
  };
}

function initialInfoFeedSummaryState(): InfoFeedRunState["summary"] {
  return {
    status: "idle",
    progress: 0,
    modelAlias: selectedInfoFeedModel.value.value,
    contextProfileId: selectedInfoFeedContextProfile.value.value,
    parametersOpen: false,
    temperature: Number(infoFeedForm.value.temperature || 0.2),
    maxTokens: Number(infoFeedForm.value.maxTokens || 1800),
    answer: "",
    error: "",
    fallback: false,
  };
}

function snapshotInfoFeedTurn(run: InfoFeedRunState): InfoFeedTurnSnapshot | null {
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
    summaryModelAlias: run.summary.modelAlias || selectedInfoFeedModel.value.value,
    evidenceRefs: infoFeedRunEvidenceRefs(run),
    expertFeedback: [...expertFeedback],
  };
}

function appendInfoFeedTurnSnapshot(run: InfoFeedRunState) {
  const snapshot = snapshotInfoFeedTurn(run);
  if (!snapshot) {
    return null;
  }
  run.turns = [...(run.turns || []), snapshot].slice(-8);
  return snapshot;
}

function resetInfoFeedRunForContinuation(run: InfoFeedRunState, question: string) {
  const followUp = createInfoFeedFollowUpContext(run, question);
  appendInfoFeedTurnSnapshot(run);
  run.followUp = followUp;
  run.completedAt = "";
  run.attachments = snapshotInfoFeedAttachments();
  run.clarification = undefined;
  run.expertFeedback = [];
  run.keyword = initialInfoFeedKeywordState();
  run.agent = initialInfoFeedAgentState();
  run.summary = initialInfoFeedSummaryState();
  run.pausedForModelSelection = "";
  run.pausedForRetry = "";
  run.retry = undefined;
}

function compactInfoFeedRunForStorage(run: InfoFeedRunState): InfoFeedRunState {
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
      expertFeedback: (turn.expertFeedback || []).slice(-8).map((item) => ({
        ...item,
        prompt: String(item.prompt || "").slice(0, 600),
        reason: String(item.reason || "").slice(0, 600),
        selectedDescription: String(item.selectedDescription || "").slice(0, 600),
        followUpQuestion: String(item.followUpQuestion || "").slice(0, 1200),
        sourceQuery: String(item.sourceQuery || "").slice(0, 1200),
      })),
    })),
    expertFeedback: (run.expertFeedback || []).slice(-16).map((item) => ({
      ...item,
      prompt: String(item.prompt || "").slice(0, 600),
      reason: String(item.reason || "").slice(0, 600),
      selectedDescription: String(item.selectedDescription || "").slice(0, 600),
      followUpQuestion: String(item.followUpQuestion || "").slice(0, 1200),
      sourceQuery: String(item.sourceQuery || "").slice(0, 1200),
    })),
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
      temperature: Number(run.summary.temperature ?? infoFeedForm.value.temperature ?? 0.2),
      maxTokens: Number(run.summary.maxTokens ?? infoFeedForm.value.maxTokens ?? 1800),
      answer: String(run.summary.answer || "").slice(0, 20000),
    },
  };
}

function sanitizeInfoFeedRunModelReferences(run: InfoFeedRunState): InfoFeedRunState {
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

function infoFeedRestorableModelAlias(run: InfoFeedRunState) {
  const agentRunInput = asRecord(asRecord(run.agent?.response?.run)?.input) || {};
  return (
    validAgentModelAlias(run.summary?.modelAlias) ||
    validAgentModelAlias(String(agentRunInput.modelAlias || ""))
  );
}

function clearInvalidInfoFeedModelReferences() {
  let historyChanged = false;
  const nextHistory = infoFeedHistory.value.map((run) => {
    const sanitized = sanitizeInfoFeedRunModelReferences(run);
    if (
      sanitized.summary.modelAlias !== run.summary?.modelAlias ||
      sanitized.turns.some((turn, index) => turn.summaryModelAlias !== run.turns?.[index]?.summaryModelAlias)
    ) {
      historyChanged = true;
    }
    return sanitized;
  });
  if (historyChanged) {
    infoFeedHistory.value = nextHistory;
    persistInfoFeedHistory();
  }
  if (infoFeedCurrentRun.value?.summary?.modelAlias && !hasAgentModelOption(infoFeedCurrentRun.value.summary.modelAlias)) {
    infoFeedCurrentRun.value = sanitizeInfoFeedRunModelReferences(infoFeedCurrentRun.value);
  }
}

function buildInfoFeedSourceSearchQuery(run: InfoFeedRunState) {
  if (!run.followUp) {
    return run.query;
  }
  return [
    run.followUp.parentQuery,
    run.followUp.question,
  ].filter(Boolean).join("\n");
}

function buildInfoFeedAgentQuery(run: InfoFeedRunState) {
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

function infoFeedAgentRecentTurns(run: InfoFeedRunState) {
  return [
    ...(run.turns || []).map((turn) => ({
      role: "assistant",
      query: infoFeedTurnQuestion(turn),
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

function infoFeedAgentExpertGuidance(run: InfoFeedRunState) {
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

function normalizeInfoFeedHistory(runs: InfoFeedRunState[]) {
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
    .map((run) => sanitizeInfoFeedRunModelReferences(compactInfoFeedRunForStorage(run)));
}

function persistInfoFeedHistory() {
  try {
    window.localStorage.setItem(
      INFO_FEED_STORAGE_KEY,
      JSON.stringify({
        history: infoFeedHistory.value.map((run) =>
          sanitizeInfoFeedRunModelReferences(compactInfoFeedRunForStorage(run)),
        ),
      }),
    );
  } catch {
    // History is a UI cache; storage failures should not block the active run.
  }
}

function restoreInfoFeedHistory() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(INFO_FEED_STORAGE_KEY) || "{}");
    const history = Array.isArray(parsed?.history) ? parsed.history : [];
    infoFeedHistory.value = normalizeInfoFeedHistory(history as InfoFeedRunState[]);
    if (history.length > 0) {
      persistInfoFeedHistory();
    }
  } catch {
    infoFeedHistory.value = [];
  }
}

function upsertInfoFeedHistory(run: InfoFeedRunState | null) {
  if (!run) {
    return;
  }
  infoFeedHistory.value = normalizeInfoFeedHistory([
    compactInfoFeedRunForStorage(run),
    ...infoFeedHistory.value.filter((item: any) => item.runId !== run.runId),
  ]);
  persistInfoFeedHistory();
}

function deleteInfoFeedHistory(runId: string) {
  infoFeedHistory.value = infoFeedHistory.value.filter((run) => run.runId !== runId);
  if (infoFeedCurrentRun.value?.runId === runId) {
    infoFeedCurrentRun.value = null;
  }
  persistInfoFeedHistory();
}

const infoFeedHistoryPanelItems = computed<HistorySessionPanelItem[]>(() =>
  infoFeedHistory.value.map((run) => ({
    id: run.runId,
    title: run.query || "未命名问题",
    meta: `${formatCompactDate(run.completedAt || run.startedAt)} · ${run.summary.status || "unknown"}`,
    preview: truncateInfoFeedText(run.summary.answer || run.agent.response?.answer || "", 140),
    active: infoFeedCurrentRun.value?.runId === run.runId,
    deleteLabel: `删除历史记录 ${run.query || run.runId}`,
  })),
);

function selectInfoFeedHistoryItem(runId: string) {
  const run = infoFeedHistory.value.find((item) => item.runId === runId);
  if (run) {
    openInfoFeedHistoryRun(run);
  }
}

function deleteInfoFeedHistoryItem(runId: string) {
  deleteInfoFeedHistory(runId);
}

function openInfoFeedHistoryRun(run: InfoFeedRunState) {
  infoFeedParentRunSnapshot.value = null;
  const sanitizedRun = sanitizeInfoFeedRunModelReferences(compactInfoFeedRunForStorage(run));
  infoFeedCurrentRun.value = sanitizedRun;
  infoFeedForm.value = {
    ...infoFeedForm.value,
    query: "",
    modelAlias: infoFeedRestorableModelAlias(sanitizedRun),
    contextProfileId: sanitizedRun.summary.contextProfileId || infoFeedForm.value.contextProfileId,
  };
}

function clearInfoFeedSummaryStreamTimer() {
  if (infoFeedSummaryStreamTimer !== null) {
    window.clearTimeout(infoFeedSummaryStreamTimer);
    infoFeedSummaryStreamTimer = null;
  }
}

function streamInfoFeedSummary(answer: string, runId: string) {
  clearInfoFeedSummaryStreamTimer();
  const characters = Array.from(answer);
  let index = 0;
  infoFeedSummaryStreamText.value = "";
  const tick = () => {
    const current = infoFeedCurrentRun.value;
    if (!current || current.runId !== runId || current.summary.answer !== answer) {
      clearInfoFeedSummaryStreamTimer();
      return;
    }
    infoFeedSummaryStreamText.value += characters[index] || "";
    index += 1;
    if (index < characters.length) {
      infoFeedSummaryStreamTimer = window.setTimeout(tick, 6);
    } else {
      infoFeedSummaryStreamTimer = null;
    }
  };
  tick();
}

function infoFeedSearchCacheKey(query: string) {
  return String(query || "").trim().toLowerCase();
}

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
    if (sequence !== infoFeedRunSequence || infoFeedCurrentRun.value?.runId !== runId) {
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
  const status = agentExploreRunStatus(result);
  if (status === "completed") {
    return 100;
  }
  if (status === "failed") {
    return 100;
  }
  const steps = result?.steps || [];
  const active = Math.max(1, Math.min(Number(steps[steps.length - 1]?.iteration || 1), maxIterations));
  const phase = String(steps[steps.length - 1]?.phase || status || "running");
  const phaseWeight =
    phase === "model_calling"
      ? 0.18
      : phase === "tool_selected"
        ? 0.38
        : phase === "tool_calling"
          ? 0.64
          : phase === "tool_result" || phase === "answer_ready"
            ? 0.84
            : 0.12;
  return Math.max(6, Math.min(98, Math.round(((active - 1 + phaseWeight) / maxIterations) * 100)));
}

function isLowRelevanceSourceResult(item: KnowledgeSearchResult) {
  return String(item.relevanceTier || "").toLowerCase() === "low" ||
    item.lowRelevance === true ||
    item.contextEligible === false;
}

function infoFeedSourceResultLine(item: KnowledgeSearchResult, index: number) {
  const tier = isLowRelevanceSourceResult(item) ? "低关联" : "高关联";
  return [
    `${index + 1}. ${item.title || "未命名来源"}（${tier}）`,
    item.evidenceId ? `证据：${item.evidenceId}` : "",
    item.score !== undefined ? `分数：${Number(item.score).toFixed(3)}` : "",
    item.snippet ? `片段：${truncateInfoFeedText(item.snippet, 260)}` : "",
  ].filter(Boolean).join("\n");
}

function estimateInfoFeedContextTokens(chars: number) {
  return Math.ceil(Math.max(0, Number(chars || 0)) / INFO_FEED_CONTEXT_CHARS_PER_TOKEN);
}

function infoFeedSourceContextBudgetChars(run: InfoFeedRunState | null | undefined) {
  const profileId = String(
    run?.summary.contextProfileId ||
      selectedInfoFeedContextProfile.value.value ||
      infoFeedForm.value.contextProfileId ||
      "context-128k",
  );
  const profile = contextProfileRows.value.find((item) => item.profileId === profileId);
  const tokenBudget = Number(
    profile?.knowledgeBudget ||
      (profile?.contextWindowTokens ? Math.floor(profile.contextWindowTokens * 0.28) : 0) ||
      (profileId.includes("1m") ? 320000 : profileId.includes("32k") ? 8000 : 36000),
  );
  return Math.max(4000, tokenBudget * INFO_FEED_CONTEXT_CHARS_PER_TOKEN);
}

function buildInfoFeedSourceContext(run: InfoFeedRunState | null | undefined) {
  const response = run?.keyword.response;
  const allItems = ((response?.items || response?.results || []) as KnowledgeSearchResult[]);
  const highItems = allItems.filter((item: any) => !isLowRelevanceSourceResult(item));
  const lowItems = allItems.filter(isLowRelevanceSourceResult);
  const budget = infoFeedSourceContextBudgetChars(run);
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
  const budgetTokens = estimateInfoFeedContextTokens(budget);
  const usedTokens = estimateInfoFeedContextTokens(usedChars);
  const highUsedTokens = estimateInfoFeedContextTokens(highUsedChars);
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

async function runInfoFeedAgentTrack(sequence: number, runId: string, query: string) {
  const run = infoFeedCurrentRun.value;
  if (!run || run.runId !== runId) {
    return;
  }
  run.pausedForModelSelection = "";
  run.agent.status = "running";
  run.agent.progress = 8;
  run.agent.error = "";
  const maxIterations = agentExploreConfiguredMaxIterations.value;
  try {
    let result = normalizeAgentExploreRun(await withInfoFeedFetchRetry(run, "agent", () =>
      bridge.runKnowledgeAgentExplore({
        query,
        modelAlias: selectedInfoFeedModel.value.value,
        contextProfileId: selectedInfoFeedContextProfile.value.value,
        thinkingMode: selectedAgentExploreThinkingMode.value,
        maxIterations,
        limit: agentExploreConfiguredLimit.value,
        recentTurns: infoFeedAgentRecentTurns(run),
        expertGuidance: infoFeedAgentExpertGuidance(run),
        async: true,
        realtime: true,
      }),
    ));
    if (sequence !== infoFeedRunSequence || infoFeedCurrentRun.value?.runId !== runId) {
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
      if (sequence !== infoFeedRunSequence || infoFeedCurrentRun.value?.runId !== runId) {
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
  const sourceContext = buildInfoFeedSourceContext(run);
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

function buildInfoFeedSummaryQuestion(run: InfoFeedRunState) {
  return [
    run.followUp ? `用户追问：${run.followUp.question}` : `用户问题：${run.query}`,
    "",
    infoFeedSourceSummary(run),
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

function fallbackInfoFeedSummary(run: InfoFeedRunState) {
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

function normalizeInfoFeedClarificationOption(value: unknown, index: number): InfoFeedClarificationOption | null {
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

function extractInfoFeedClarification(answer: string): { answer: string; clarification?: InfoFeedClarification } {
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
            .map((item, index) => normalizeInfoFeedClarificationOption(item, index))
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

function buildFallbackInfoFeedClarification(run: InfoFeedRunState): InfoFeedClarification | undefined {
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

function applyInfoFeedSummaryAnswer(run: InfoFeedRunState, answer: string, fallback: boolean, error = "") {
  const extracted = extractInfoFeedClarification(answer);
  run.summary.answer = extracted.answer || answer;
  run.summary.fallback = fallback;
  run.summary.error = error;
  run.clarification = extracted.clarification || buildFallbackInfoFeedClarification(run);
}

function infoFeedRunEvidenceRefs(run: InfoFeedRunState) {
  return uniqueEvidenceRefs([
    ...(((run.keyword.response?.items || run.keyword.response?.results || []) as KnowledgeSearchResult[])
      .map((item) => String(item.evidenceId || ""))
      .filter(Boolean)),
    ...extractEvidenceRefsFromText(run.agent.response?.answer || ""),
    ...extractEvidenceRefsFromText(run.summary.answer || ""),
  ]);
}

function archiveInfoFeedExpertFeedback(
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
    ...(run.expertFeedback || []).filter((item: any) => item.feedbackId !== feedbackId),
    archived,
  ];
  return archived;
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

async function runInfoFeedSummaryAgent(sequence = infoFeedRunSequence) {
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
          "你是 Pact 信息流总结智能体。你的任务是融合原文检索、智能规划和附件读取结果，输出可复核、带证据编号的最终回答。证据不足时必须说明不足。只有当缺少用户选择就无法继续执行时，才向用户提问；普通不确定性只写在报告里。",
        parameters: {
          ...agentExploreThinkingParameters(),
          temperature: summaryTemperature,
          max_tokens: summaryMaxTokens,
        },
      }),
    );
    if (sequence !== infoFeedRunSequence || infoFeedCurrentRun.value?.runId !== run.runId) {
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
    if (sequence !== infoFeedRunSequence || infoFeedCurrentRun.value?.runId !== run.runId) {
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
  if (sequence !== infoFeedRunSequence || infoFeedCurrentRun.value?.runId !== run.runId) {
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
  if (!canReadKnowledge.value) {
    error.value = "当前账号没有知识库读取权限。";
    return;
  }
  if (!selectedInfoFeedModel.value.enabled) {
    error.value = "请选择模型库中已配置且支持智能体调用的模型。";
    return;
  }
  error.value = "";
  infoFeedParentRunSnapshot.value = null;
  resetInfoFeedRunForContinuation(run, question);
  upsertInfoFeedHistory(run);
  const sequence = infoFeedRunSequence + 1;
  infoFeedRunSequence = sequence;
  await executeInfoFeedRunIteration(sequence, run);
}

async function runInfoFeed() {
  const query = infoFeedForm.value.query.trim();
  if (!query) {
    error.value = "请输入信息流问题。";
    return;
  }
  if (!canReadKnowledge.value) {
    error.value = "当前账号没有知识库读取权限。";
    return;
  }
  if (!selectedInfoFeedModel.value.enabled) {
    error.value = "请选择模型库中已配置且支持智能体调用的模型。";
    return;
  }
  if (infoFeedCanFollowUp.value && infoFeedCurrentRun.value) {
    infoFeedForm.value.query = "";
    await continueInfoFeedCurrentRun(query);
    return;
  }
  error.value = "";
  infoFeedParentRunSnapshot.value = null;
  const sequence = infoFeedRunSequence + 1;
  infoFeedRunSequence = sequence;
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
    error.value = "请选择一个已配置且可用的模型。";
    return;
  }
  error.value = "";
  const pausedStage = run.pausedForModelSelection;
  const sequence = infoFeedRunSequence + 1;
  infoFeedRunSequence = sequence;
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
    if (sequence !== infoFeedRunSequence || infoFeedCurrentRun.value?.runId !== run.runId || run.pausedForModelSelection) {
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
  const sequence = infoFeedRunSequence + 1;
  infoFeedRunSequence = sequence;
  clearInfoFeedRetryState(run, pausedStage);
  error.value = "";

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
    if (sequence !== infoFeedRunSequence || infoFeedCurrentRun.value?.runId !== run.runId || run.pausedForRetry) {
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
    if (sequence !== infoFeedRunSequence || infoFeedCurrentRun.value?.runId !== run.runId || run.pausedForRetry) {
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

async function copyInfoFeedSummary() {
  const content = infoFeedSummaryMarkdown.value.trim();
  if (!content) {
    error.value = "暂无可复制的信息流总结。";
    return;
  }
  try {
    await copyTextToClipboard(content);
    recordConsoleKnowledgeFeedback("copy", {
      surface: "info_feed",
      query: infoFeedCurrentRun.value?.query || "",
      itemId: infoFeedCurrentRun.value?.runId || "",
      evidenceRefs: infoFeedSummaryEvidenceRefs.value,
    });
    error.value = "";
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "复制信息流总结失败。";
  }
}

function exportInfoFeedSummary() {
  const content = infoFeedSummaryMarkdown.value.trim();
  if (!content) {
    error.value = "暂无可导出的信息流总结。";
    return;
  }
  const query = String(infoFeedCurrentRun.value?.query || infoFeedForm.value.query || "信息流");
  const timestamp = formatMachineDate(new Date().toISOString(), "full").replace(/[: ]/g, "-");
  downloadTextFile(
    `${safeDownloadName(query, "info-feed")}-${timestamp}.md`,
    `${content}\n`,
    "text/markdown;charset=utf-8",
  );
  recordConsoleKnowledgeFeedback("export", {
    surface: "info_feed",
    query,
    itemId: infoFeedCurrentRun.value?.runId || "",
    evidenceRefs: infoFeedSummaryEvidenceRefs.value,
  });
  error.value = "";
}

function knowledgeReviewReasonLabel(reason: unknown) {
  const value = String(reason || "");
  if (value === "source_path_content_conflict") {
    return "同路径内容冲突";
  }
  if (value === "duplicate_source_document") {
    return "重复来源";
  }
  if (value === "revision_conflict") {
    return "版本冲突";
  }
  if (value === "missing_entity") {
    return "对象缺失";
  }
  return value || "待审核";
}

function knowledgeReviewStatusLabel(status: unknown) {
  const value = String(status || "");
  if (value === "pending") return "待决策";
  if (value === "resolved") return "已解决";
  if (value === "rejected") return "已忽略";
  return value || "未知";
}

function knowledgeReviewTone(item: KnowledgeReviewItem) {
  if (item.status === "resolved") return "success";
  if (item.status === "rejected") return "muted";
  if (item.severity === "high" || item.reason === "source_path_content_conflict") return "danger";
  return "warning";
}

function knowledgeReviewTitle(item: KnowledgeReviewItem) {
  const incoming = knowledgeReviewIncomingDocument(item);
  const current = knowledgeReviewCurrentDocuments(item)[0];
  return (
    item.title ||
    String(incoming?.title || current?.title || item.entityId || item.reviewId || "知识冲突")
  );
}

function knowledgeReviewCurrentDocuments(item: KnowledgeReviewItem) {
  const currentRecord = asRecord(item.currentRecord) || {};
  const documents = Array.isArray(currentRecord.documents)
    ? currentRecord.documents
    : currentRecord.document
      ? [currentRecord.document]
      : item.serverRecord
        ? [item.serverRecord]
        : [];
  return documents.map((entry) => asRecord(entry)).filter(Boolean) as Record<string, unknown>[];
}

function knowledgeReviewIncomingDocument(item: KnowledgeReviewItem) {
  const incomingRecord = asRecord(item.incomingRecord) || {};
  return asRecord(incomingRecord.document) || asRecord(item.fieldPatch) || null;
}

function knowledgeReviewDocumentLine(record: Record<string, unknown> | null | undefined) {
  if (!record) {
    return "无";
  }
  const title = String(record.title || record.documentId || record.itemId || "未命名");
  const path = String(record.sourcePath || "");
  const hash = String(record.sourceHash || "");
  return [title, path, hash ? `hash:${shortId(hash)}` : ""].filter(Boolean).join(" / ");
}

function knowledgeReviewPrimaryCurrentDocument(item: KnowledgeReviewItem) {
  return knowledgeReviewCurrentDocuments(item)[0] || null;
}

function knowledgeReviewRecordPreview(record: Record<string, unknown> | null | undefined) {
  if (!record) {
    return {
      title: "无记录",
      sourcePath: "",
      sourceHash: "",
      batchId: "",
      documentId: "",
      text: "暂无可比较内容。",
    };
  }
  const title = String(record.title || record.documentId || record.itemId || "未命名");
  const sourcePath = String(record.sourcePath || "");
  const sourceHash = String(record.sourceHash || "");
  const batchId = String(record.batchId || "");
  const documentId = String(record.documentId || record.itemId || "");
  const text = truncateInfoFeedText(
    [
      record.summary,
      record.textPreview,
      record.bodyPreview,
      record.contentPreview,
      record.excerpt,
      record.text,
      record.content,
    ]
      .map((value) => String(value || "").trim())
      .find(Boolean) || knowledgeReviewDocumentLine(record),
    1200,
  );
  return {
    title,
    sourcePath,
    sourceHash,
    batchId,
    documentId,
    text,
  };
}

function tokenizeKnowledgeReviewText(value: string) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = new Set<string>();
  for (const token of normalized.split(" ").filter(Boolean)) {
    tokens.add(token);
    if (token.length > 3) {
      for (let index = 0; index < token.length - 1; index += 1) {
        tokens.add(token.slice(index, index + 2));
      }
    }
  }
  return tokens;
}

function jaccardSimilarity(left: Set<string>, right: Set<string>) {
  if (!left.size && !right.size) {
    return 0;
  }
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  return intersection / Math.max(1, left.size + right.size - intersection);
}

function knowledgeReviewSimilarity(item: KnowledgeReviewItem) {
  const current = knowledgeReviewRecordPreview(knowledgeReviewPrimaryCurrentDocument(item));
  const incoming = knowledgeReviewRecordPreview(knowledgeReviewIncomingDocument(item));
  const sameHash = Boolean(
    current.sourceHash &&
      incoming.sourceHash &&
      current.sourceHash.toLowerCase() === incoming.sourceHash.toLowerCase(),
  );
  const samePath = Boolean(
    current.sourcePath &&
      incoming.sourcePath &&
      current.sourcePath.toLowerCase() === incoming.sourcePath.toLowerCase(),
  );
  const left = tokenizeKnowledgeReviewText(
    [current.title, current.sourcePath, current.sourceHash, current.text].join("\n"),
  );
  const right = tokenizeKnowledgeReviewText(
    [incoming.title, incoming.sourcePath, incoming.sourceHash, incoming.text].join("\n"),
  );
  const score = sameHash ? 1 : Math.max(jaccardSimilarity(left, right), samePath ? 0.62 : 0);
  const roundedScore = Math.round(score * 100);
  if (score >= 0.98) {
    return {
      score,
      percent: `${roundedScore}%`,
      label: "完全重合",
      tone: "danger",
      disableKeepBoth: true,
      suggestion: "两份记录可判定为同一内容，建议放弃新知识或覆盖旧知识；不建议保留两者。",
    };
  }
  if (score >= 0.5) {
    return {
      score,
      percent: `${roundedScore}%`,
      label: "部分重合",
      tone: "warning",
      disableKeepBoth: false,
      suggestion: "两份记录存在重叠但仍有差异，建议优先执行知识融合，或人工核对后再覆盖。",
    };
  }
  return {
    score,
    percent: `${roundedScore}%`,
    label: "差异明显",
    tone: "success",
    disableKeepBoth: false,
    suggestion: "两份记录差异较大，建议保留两者；如果属于同一业务对象，再使用知识融合生成合并建议。",
  };
}

function selectKnowledgeReviewItem(row: KnowledgeReviewItem) {
  selectedKnowledgeReviewId.value = String(row.reviewId || "");
}

function knowledgeReviewRowClassName({ row }: { row: KnowledgeReviewItem }) {
  return row.reviewId === selectedKnowledgeReviewId.value ? "is-selected-review-row" : "";
}

function knowledgeReviewFusionPrompt(item: KnowledgeReviewItem) {
  const current = knowledgeReviewRecordPreview(knowledgeReviewPrimaryCurrentDocument(item));
  const incoming = knowledgeReviewRecordPreview(knowledgeReviewIncomingDocument(item));
  return [
    "请对以下知识入库冲突做融合分析，并输出 Markdown。",
    "",
    "必须包含：",
    "1. 重合判定：完全重合 / 部分重合 / 差异明显。",
    "2. 相似度估计和依据。",
    "3. 建议审核动作：保留两者 / 覆盖旧知识 / 放弃新知识 / 知识融合。",
    "4. 如果建议融合，列出应保留的字段、应保留的证据、需要人工确认的差异。",
    "",
    `冲突原因：${knowledgeReviewReasonLabel(item.reason)}`,
    `当前记录：${JSON.stringify(current, null, 2)}`,
    `新录入记录：${JSON.stringify(incoming, null, 2)}`,
    `审核项：${JSON.stringify(
      {
        reviewId: item.reviewId,
        entityId: item.entityId,
        entityType: item.entityType,
        summary: item.summary,
        evidenceRefs: item.evidenceRefs,
      },
      null,
      2,
    )}`,
  ].join("\n");
}

function knowledgeReviewDetailText(item: KnowledgeReviewItem) {
  const current = knowledgeReviewCurrentDocuments(item)
    .map(knowledgeReviewDocumentLine)
    .join("\n");
  const incoming = knowledgeReviewDocumentLine(knowledgeReviewIncomingDocument(item));
  return [`当前：${current || "无"}`, `新录入：${incoming}`].join("\n");
}

function knowledgeReviewSourceLabel(item: KnowledgeReviewItem) {
  if (item.source === "knowledge-core") {
    return "入库";
  }
  if (item.source === "metadata-store") {
    return "结构化变更";
  }
  return item.source || "知识库";
}

function knowledgeReviewCanResolveWithDocument(item: KnowledgeReviewItem) {
  const incomingRecord = asRecord(item.incomingRecord) || {};
  return Boolean(asRecord(incomingRecord.documentSnapshot));
}

function knowledgeReviewResolvedAction(item: KnowledgeReviewItem) {
  const resolution = asRecord(item.resolution) || {};
  return String(resolution.resolution || resolution.action || "");
}

function exportKnowledgeLogRows() {
  const rows = filteredKnowledgeLogRows.value;
  const csv = [
    ["type", "id", "target", "status", "stage", "createdAt", "updatedAt", "progressPercent", "detail", "error"].map(csvCell).join(","),
    ...rows.map((row) =>
      [
        row.kindLabel,
        row.logId,
        row.target,
        row.statusLabel,
        row.stage,
        formatMachineDate(row.createdAt, "full"),
        formatMachineDate(row.occurredAt, "full"),
        row.progressPercent,
        row.detail,
        row.error,
      ].map(csvCell).join(","),
    ),
  ].join("\n");
  downloadTextFile(
    `system-logs-${formatMachineDate(new Date().toISOString(), "full").replace(/[: ]/g, "-")}.csv`,
    csv,
    "text/csv;charset=utf-8",
  );
}

function readNestedValue(source: Record<string, unknown>, dottedName: string) {
  return dottedName.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, source);
}

function writeNestedValue(source: Record<string, unknown>, dottedName: string, value: unknown) {
  const parts = dottedName.split(".");
  const next = { ...source };
  let cursor: Record<string, unknown> = next;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] = value;
      return;
    }
    const existing = cursor[part];
    const child =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    cursor[part] = child;
    cursor = child;
  });
  return next;
}

function maintenanceFieldValue(fieldName: string, fallback: unknown) {
  const value = readNestedValue(knowledgeMaintenanceDraft.value, fieldName);
  return value === undefined ? fallback : value;
}

function setMaintenanceFieldValue(fieldName: string, value: unknown) {
  knowledgeMaintenanceDraft.value = writeNestedValue(
    knowledgeMaintenanceDraft.value,
    fieldName,
    value,
  );
  maintenanceJson.value = jsonPreview(knowledgeMaintenanceDraft.value);
}

function setMaintenanceFieldFromEvent(
  fieldName: string,
  event: Event,
  valueType: "number" | "boolean" | "string",
) {
  const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
  if (valueType === "number") {
    setMaintenanceFieldValue(fieldName, Number(value));
    return;
  }
  if (valueType === "boolean") {
    setMaintenanceFieldValue(fieldName, value === "true");
    return;
  }
  setMaintenanceFieldValue(fieldName, value);
}

function currentKnowledgeRetrievalSettings() {
  const retrieval = asRecord(knowledgeMaintenanceDraft.value.retrieval) || {};
  return { ...retrieval };
}

function currentKnowledgeLearningEnabled() {
  const learning = asRecord(knowledgeMaintenanceDraft.value.learning) || {};
  const retrieval = currentKnowledgeRetrievalSettings();
  return learning.enabled !== false && retrieval.learningEnabled !== false;
}

function currentKnowledgeSearchLimit() {
  const retrieval = currentKnowledgeRetrievalSettings();
  const topK = Number(retrieval.topK || 20);
  return Math.max(1, Math.min(Number.isFinite(topK) ? topK : 20, 100));
}

function normalizeSearchResults(payload: unknown): KnowledgeSearchResult[] {
  const record = asRecord(payload);
  if (!record) {
    return [];
  }
  const items = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.results)
      ? record.results
      : Array.isArray(record.evidencePacks)
        ? record.evidencePacks
        : [];
  return items.map((item) => item as KnowledgeSearchResult);
}

function compactReadableText(value: string, maxLength = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function htmlMetaHeader(rawHtml: string, headerName: string) {
  if (!/<meta[\s>]/i.test(rawHtml)) {
    return "";
  }
  try {
    const doc = new DOMParser().parseFromString(String(rawHtml || ""), "text/html");
    const wanted = `message:raw-header:${headerName}`.toLowerCase();
    for (const meta of Array.from(doc.querySelectorAll("meta"))) {
      if (String(meta.getAttribute("name") || "").toLowerCase() === wanted) {
        return decodeMimeWords(String(meta.getAttribute("content") || "").trim());
      }
    }
  } catch {
    return "";
  }
  return "";
}

function htmlToReadableText(rawHtml: string) {
  try {
    const doc = new DOMParser().parseFromString(
      String(rawHtml || "").replace(/<head[\s\S]*?<\/head>/i, ""),
      "text/html",
    );
    for (const element of Array.from(doc.querySelectorAll("script, style, noscript, template"))) {
      element.remove();
    }
    return compactReadableText(doc.body?.textContent || doc.documentElement.textContent || "");
  } catch {
    return compactReadableText(String(rawHtml || "").replace(/<[^>]+>/g, " "));
  }
}

function candidateTextFromRecord(record: Record<string, unknown> | KnowledgeSearchResult | EvidencePack | null | undefined) {
  if (!record) {
    return "";
  }
  const payload = asRecord(record.payload);
  const blocks = Array.isArray(record.blocks)
    ? record.blocks
    : Array.isArray(payload?.blocks)
      ? payload?.blocks
      : [];
  const blockText = blocks
    .map((block) => asRecord(block))
    .filter(Boolean)
    .map((block) => String(block?.text || block?.snippet || "").trim())
    .filter(Boolean)
    .join("\n\n");
  return String(
    blockText ||
    record.text ||
    record.summary ||
    record.snippet ||
    "",
  ).trim();
}

function emailSubjectFromText(text: string) {
  return (
    htmlMetaHeader(text, "Subject") ||
    emailHeaderValue(parseEmailHeaders(text).headers, "Subject") ||
    ""
  );
}

function readableSnippetFromText(text: string) {
  const value = String(text || "").trim();
  if (!value) {
    return "";
  }
  if (/<\/?[a-z][\s\S]*>/i.test(value)) {
    return htmlToReadableText(value);
  }
  return compactReadableText(value);
}

function evidenceDisplayTitle(record: Record<string, unknown> | KnowledgeSearchResult | EvidencePack) {
  const text = candidateTextFromRecord(record);
  const subject = emailSubjectFromText(text);
  return subject || String(record.title || record.documentId || record.itemId || record.evidenceId || "来源详情");
}

function knowledgeResultTitle(item: KnowledgeSearchResult) {
  return evidenceDisplayTitle(item);
}

function knowledgeResultSnippet(item: KnowledgeSearchResult) {
  const text = candidateTextFromRecord(item);
  return readableSnippetFromText(text);
}

function hydrateSearchResultPreview(evidence: EvidencePack) {
  const evidenceId = String(evidence.evidenceId || selectedEvidenceId.value || "");
  if (!evidenceId) {
    return;
  }
  const title = evidenceDisplayTitle(evidence);
  const snippet = readableSnippetFromText(candidateTextFromRecord(evidence));
  knowledgeSearchResults.value = knowledgeSearchResults.value.map((item) => {
    if (knowledgeResultEvidenceId(item) !== evidenceId) {
      return item;
    }
    return {
      ...item,
      title: title || item.title,
      snippet: snippet || item.snippet,
    };
  });
}

function knowledgeResultEvidenceId(item: KnowledgeSearchResult) {
  return String(item.evidenceId || item.itemId || "");
}

function knowledgeResultAssetCount(item: KnowledgeSearchResult) {
  if (Array.isArray(item.assets)) {
    return item.assets.length;
  }
  if (Array.isArray(item.relatedAssetIds)) {
    return item.relatedAssetIds.length;
  }
  if (Array.isArray(item.assetIds)) {
    return item.assetIds.length;
  }
  return 0;
}

function knowledgeResultScore(item: KnowledgeSearchResult) {
  return Number(item.score || item.finalScore || item.relevanceScore || 0).toFixed(3);
}

function knowledgeResultHierarchyPath(item: KnowledgeSearchResult) {
  const hierarchy = item.hierarchy || null;
  if (!hierarchy) {
    return "";
  }
  if (hierarchy.path) {
    return hierarchy.path;
  }
  return [hierarchy.documentId ? `document:${hierarchy.documentId}` : "", hierarchy.sectionId ? `section:${hierarchy.sectionId}` : ""]
    .filter(Boolean)
    .join(" > ");
}

function knowledgeFusionSummary(response: KnowledgeSearchResponse | null | undefined) {
  const fusion = asRecord(response?.fusion);
  if (!fusion) {
    return "";
  }
  const mode = String(fusion.mode || "server-index-only");
  const localHitCount = Number(fusion.localHitCount || 0);
  const localMergedCount = Number(fusion.localMergedCount || 0);
  const localAppendedCount = Number(fusion.localAppendedCount || 0);
  if (!localHitCount) {
    return `${mode} · 无本地 mirror 命中`;
  }
  return `${mode} · 本地 mirror ${localHitCount} 条，合并 ${localMergedCount} 条，补充 ${localAppendedCount} 条`;
}

function formatBytes(value: unknown) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function sourceSyncLabel(source: KnowledgeSource) {
  if (source.error) {
    return "异常";
  }
  if (Number(source.lastHydrationFailedCount || 0) > 0) {
    return "待下载";
  }
  if (["queued", "running"].includes(String(source.lastJobStatus || ""))) {
    return "处理中";
  }
  if (source.status === "pending") {
    return "等待同步";
  }
  if (source.indexStatus === "indexing") {
    return "建索引中";
  }
  if (!source.enabled) {
    return "已停用";
  }
  if (source.watcherStatus === "watching") {
    return "自动监听";
  }
  if (source.watcherStatus === "partial") {
    return "部分监听";
  }
  return "待同步";
}

function sourceSyncTone(source: KnowledgeSource) {
  if (source.error || source.watcherStatus === "error" || source.lastJobStatus === "failed") {
    return "danger";
  }
  if (Number(source.lastHydrationFailedCount || 0) > 0) {
    return "warning";
  }
  if (["queued", "running"].includes(String(source.lastJobStatus || "")) || source.status === "pending") {
    return "warning";
  }
  if (source.indexStatus === "indexing") {
    return "warning";
  }
  if (source.indexStatus === "failed") {
    return "danger";
  }
  if (source.enabled && ["watching", "partial"].includes(String(source.watcherStatus || ""))) {
    return "success";
  }
  return "neutral";
}

function sourceDownloadStatusLabel(source: KnowledgeSource) {
  if (source.hydrationEnabled === false) {
    return "已关闭";
  }
  switch (source.lastHydrationStatus) {
    case "readable":
      return "可读取";
    case "hydrated":
      return "已下载";
    case "partial":
      return "部分完成";
    default:
      return "未执行";
  }
}

function sourceIndexStatusLabel(source: KnowledgeSource) {
  switch (source.indexStatus) {
    case "indexing":
      return "建索引中";
    case "indexed":
      return "已建索引";
    case "failed":
      return "索引失败";
    default:
      return "未建索引";
  }
}

function sourceJobProgress(source: KnowledgeSource) {
  if (!source.lastJobId) {
    return 0;
  }
  if (source.lastJobStatus === "completed") {
    return 100;
  }
  return Math.max(0, Math.min(100, Number(source.lastJobProgressPercent || 0)));
}

function uploadTraceTone(level: string) {
  if (level === "error") {
    return "danger";
  }
  if (level === "warning") {
    return "warning";
  }
  return "neutral";
}

function traceProgressPercent(payload: Record<string, unknown>) {
  const session = asRecord(payload.session);
  const files = Array.isArray(session?.files) ? session.files : [];
  const totals = files.reduce(
    (acc, file) => {
      const record = asRecord(file) || {};
      acc.received += Number(record.receivedBytes || 0);
      acc.total += Number(record.byteSize || 0);
      return acc;
    },
    { received: 0, total: 0 },
  );
  if (totals.total > 0) {
    return Math.max(0, Math.min(100, (totals.received / totals.total) * 100));
  }
  if (payload.stage === "response_sent" || payload.stage === "accepted") {
    return 100;
  }
  return 0;
}

function uploadTraceDetailText(payload: Record<string, unknown>) {
  const detail = {
    message: payload.message || "",
    requestId: payload.requestId || "",
    sessionId: payload.sessionId || asRecord(payload.session)?.sessionId || "",
    checkpointId: payload.checkpointId || asRecord(payload.session)?.checkpointId || "",
    code: payload.code || "",
    expectedOffset: payload.expectedOffset ?? "",
    offset: payload.offset ?? "",
    chunkBytes: payload.chunkBytes ?? "",
    request: payload.request || undefined,
    session: payload.session || undefined,
    redaction: payload.redaction || undefined,
  };
  return JSON.stringify(detail, null, 2);
}

function splitJobStatusLabel(status?: string) {
  return jobStatusLabels[status as SplitJobStatus] || status || "待处理";
}

function pathPickerModeLabel(mode: PathPickerMode) {
  return mode === "file" ? "文件" : "目录";
}

function pathEntryMeta(entry: ServerPathBrowseEntry) {
  if (entry.type === "directory") {
    return "";
  }
  return `${formatBytes(entry.byteSize)} / ${formatCompactDate(entry.modifiedAt)}`;
}

function openServerPathPicker(options: {
  title: string;
  mode: PathPickerMode;
  value?: string;
  extensions?: string[];
  closeOnSelect?: boolean;
  applyPath: (nextPath: string) => void;
}) {
  pathPicker.value = {
    open: true,
    title: options.title,
    mode: options.mode,
    value: options.value || "",
    extensions: options.extensions || [],
    includeHidden: false,
    loading: false,
    error: "",
    response: null,
    closeOnSelect: options.closeOnSelect !== false,
    applyPath: options.applyPath,
  };
  void refreshServerPathBrowser(options.value || "");
}

async function refreshServerPathBrowser(nextPath?: string) {
  const current = pathPicker.value;
  current.loading = true;
  current.error = "";
  try {
    const response = await bridge.browseServerPath({
      path: nextPath ?? current.response?.currentPath ?? current.value,
      mode: current.mode,
      extensions: current.extensions,
      includeHidden: current.includeHidden,
    });
    pathPicker.value = {
      ...current,
      loading: false,
      response,
      error: response.error || "",
    };
  } catch (nextError) {
    pathPicker.value = {
      ...current,
      loading: false,
      error: nextError instanceof Error ? nextError.message : "打开路径浏览器失败。",
    };
  }
}

function closeServerPathPicker() {
  pathPicker.value = {
    ...pathPicker.value,
    open: false,
  };
}

function selectServerPath(nextPath: string) {
  if (!nextPath) {
    return;
  }
  pathPicker.value.applyPath(nextPath);
  if (pathPicker.value.closeOnSelect) {
    closeServerPathPicker();
  }
}

function confirmServerPathPicker() {
  const currentPath = String(pathPicker.value.response?.currentPath || pathPicker.value.value || "").trim();
  if (pathPicker.value.mode === "directory" && currentPath) {
    pathPicker.value.applyPath(currentPath);
  }
  closeServerPathPicker();
}

function directoryNameFromPath(directoryPath: string) {
  const normalized = String(directoryPath || "")
    .trim()
    .replace(/[\\/]+$/g, "");
  if (!normalized) {
    return "";
  }
  return normalized.split(/[\\/]/).filter(Boolean).pop() || normalized;
}

function applyLocalSourceDirectoryPath(nextPath: string) {
  const currentPath = localSourceForm.value.directoryPath;
  const currentDefaultName = directoryNameFromPath(currentPath);
  const currentLabel = localSourceForm.value.label.trim();
  const shouldUseDirectoryName = !currentLabel || currentLabel === currentDefaultName;
  localSourceForm.value.directoryPath = nextPath;
  if (shouldUseDirectoryName) {
    localSourceForm.value.label = directoryNameFromPath(nextPath);
  }
}

function syncLocalSourceLabelFromPath() {
  if (!localSourceForm.value.label.trim()) {
    localSourceForm.value.label = directoryNameFromPath(localSourceForm.value.directoryPath);
  }
}

function openPathEntry(entry: ServerPathBrowseEntry) {
  if (!entry.browsable) {
    return;
  }
  void refreshServerPathBrowser(entry.path);
}

function openLocalSourceDirectoryPicker() {
  openServerPathPicker({
    title: "选择本地目录",
    mode: "directory",
    value: localSourceForm.value.directoryPath,
    applyPath: (nextPath) => {
      applyLocalSourceDirectoryPath(nextPath);
    },
  });
}

function openWordCloudCorpusDirectoryPicker() {
  openServerPathPicker({
    title: "选择词云语料目录",
    mode: "directory",
    closeOnSelect: false,
    applyPath: (nextPath) => {
      addWordCloudCorpusPaths([{ path: nextPath, type: "directory" }]);
    },
  });
}

function openWordCloudCorpusFilePicker() {
  openServerPathPicker({
    title: "选择词云语料文件",
    mode: "file",
    closeOnSelect: false,
    applyPath: (nextPath) => {
      addWordCloudCorpusPaths([{ path: nextPath, type: "file" }]);
    },
  });
}

function openSettingsPathPicker(
  field: "ocrPythonPath" | "tikaJarPath" | "javaBinPath",
  title: string,
  extensions: string[] = [],
) {
  openServerPathPicker({
    title,
    mode: "file",
    value: String(settingsDraft.value[field] || ""),
    extensions,
    applyPath: (nextPath) => {
      settingsDraft.value = {
        ...settingsDraft.value,
        [field]: nextPath,
      };
    },
  });
}

function openMountPathPicker(name: string) {
  editingMountPaths.value = {
    ...editingMountPaths.value,
    [name]: true,
  };
  openServerPathPicker({
    title: `选择${moduleNameLabels[name] || name}模块文件`,
    mode: "file",
    value: String(mountDraft.value[name] || ""),
    extensions: [".mjs", ".js", ".cjs"],
    applyPath: (nextPath) => {
      mountDraft.value = {
        ...mountDraft.value,
        [name]: nextPath,
      };
    },
  });
}

function evidencePrimaryText() {
  const blockText = selectedEvidenceBlocks.value
    .map((block) => String(block.text || block.snippet || "").trim())
    .filter(Boolean)
    .join("\n\n");
  return String(
    blockText ||
    selectedEvidence.value?.text ||
    selectedEvidence.value?.snippet ||
    "",
  ).trim();
}

function evidenceMainText() {
  return evidencePrimaryText() || "当前证据没有可展示的正文。";
}

function escapeHtmlText(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeLinkHref(value: string) {
  const href = value.trim();
  if (!href) {
    return "";
  }
  if (/^(https?:|mailto:|#|\/(?!\/))/i.test(href)) {
    return href;
  }
  return "";
}

function safeMediaSrc(value: string) {
  const src = value.trim();
  if (!src) {
    return "";
  }
  if (/^(https?:|\/(?!\/)|data:image\/|blob:)/i.test(src)) {
    return src;
  }
  return "";
}

function safeEmailImageSrc(value: string) {
  const raw = String(value || "").trim();
  const assetUrl = assetUrlForReference(raw);
  const src = (assetUrl || raw).trim();
  if (!src) {
    return "";
  }
  if (/^(\/api\/knowledge\/assets\/|data:image\/|blob:)/i.test(src)) {
    return src;
  }
  try {
    const url = new URL(src, window.location.origin);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const isTrackingHost =
      host.includes("click.") ||
      host.includes("track.") ||
      host.includes("tracking.") ||
      host.includes("doubleclick.") ||
      host.includes("analytics.");
    const isTrackingPath = /\/(ci0|track|pixel|open|beacon)\b/i.test(path);
    if (url.protocol === "https:" && !url.search && !isTrackingHost && !isTrackingPath) {
      return url.href;
    }
  } catch {
    return "";
  }
  return "";
}

function sanitizeEmailCssUrls(value: string) {
  return String(value || "").replace(/url\(([^)]+)\)/gi, (match, rawValue) => {
    const raw = String(rawValue || "").trim().replace(/^["']|["']$/g, "");
    const safe = safeEmailImageSrc(raw);
    return safe ? `url("${safe.replace(/"/g, "%22")}")` : "none";
  });
}

function sanitizeEmailFrameDocument(rawHtml: string) {
  const source = rewriteInlineAssetRefs(String(rawHtml || ""));
  const doc = new DOMParser().parseFromString(
    /<html[\s>]|<body[\s>]|<!doctype/i.test(source)
      ? source
      : `<!doctype html><html><body>${source}</body></html>`,
    "text/html",
  );
  for (const element of Array.from(doc.querySelectorAll("script, iframe, object, embed, form, input, button, textarea, select"))) {
    element.remove();
  }
  for (const element of Array.from(doc.querySelectorAll("style"))) {
    element.textContent = sanitizeEmailCssUrls(element.textContent || "");
  }
  for (const element of Array.from(doc.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value || "";
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "style") {
        element.setAttribute(attribute.name, sanitizeEmailCssUrls(value));
        continue;
      }
      if (name === "href") {
        const href = safeLinkHref(value);
        href ? element.setAttribute(attribute.name, href) : element.removeAttribute(attribute.name);
        if (href) {
          element.setAttribute("target", "_blank");
          element.setAttribute("rel", "noreferrer noopener");
        }
        continue;
      }
      if (name === "src" || name === "background") {
        const safe = safeEmailImageSrc(value);
        safe ? element.setAttribute(attribute.name, safe) : element.removeAttribute(attribute.name);
        continue;
      }
      if (name === "srcset") {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.tagName.toLowerCase() === "img") {
      element.setAttribute("loading", "lazy");
      element.setAttribute("referrerpolicy", "no-referrer");
      if (!element.getAttribute("alt")) {
        element.setAttribute("alt", "");
      }
    }
  }
  const headStyles = Array.from(doc.head?.querySelectorAll("style") || [])
    .map((style) => style.outerHTML)
    .join("\n");
  const body = doc.body || doc.documentElement;
  const bodyAttributes = body instanceof HTMLElement
    ? Array.from(body.attributes)
        .filter((attribute) => ["style", "class", "bgcolor", "text", "link", "vlink", "alink"].includes(attribute.name.toLowerCase()))
        .map((attribute) => `${attribute.name}="${escapeHtmlText(attribute.value)}"`)
        .join(" ")
    : "";
  const csp = [
    "default-src 'none'",
    `img-src 'self' ${window.location.origin} data: blob: https:`,
    "style-src 'unsafe-inline'",
    "font-src data: https:",
    "media-src data: blob: https:",
    "frame-src 'none'",
    "script-src 'none'",
    "connect-src 'none'",
  ].join("; ");
  return `<!doctype html>
<html>
<head>
<base href="${escapeHtmlText(window.location.origin)}/">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeHtmlText(csp)}">
<style>
html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
body { overflow-wrap: anywhere; }
img { max-width: 100%; height: auto; }
table { max-width: 100%; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
${headStyles}
</head>
<body ${bodyAttributes}>${body.innerHTML}</body>
</html>`;
}

function renderEmailFrame(rawHtml: string) {
  const srcdoc = sanitizeEmailFrameDocument(rawHtml);
  return `<div class="rendered-email-frame-shell"><iframe class="rendered-email-frame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" srcdoc="${escapeHtmlText(srcdoc)}"></iframe></div>`;
}

function sanitizeHtmlContent(rawHtml: string) {
  const template = document.createElement("template");
  template.innerHTML = rawHtml;
  const blockedTags = new Set([
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "link",
    "meta",
    "form",
    "input",
    "button",
    "svg",
  ]);
  const allowedAttrs = new Set(["href", "src", "alt", "title", "colspan", "rowspan"]);
  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase();
    if (blockedTags.has(tag)) {
      element.remove();
      continue;
    }
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "style" || !allowedAttrs.has(name)) {
        element.removeAttribute(attr.name);
        continue;
      }
      if (name === "href") {
        const href = safeLinkHref(attr.value);
        if (!href) {
          element.removeAttribute(attr.name);
        } else {
          element.setAttribute("href", href);
          element.setAttribute("target", "_blank");
          element.setAttribute("rel", "noreferrer noopener");
        }
      }
      if (name === "src") {
        const src = safeMediaSrc(attr.value);
        if (!src) {
          element.removeAttribute(attr.name);
        } else {
          element.setAttribute("src", src);
          element.setAttribute("loading", "lazy");
        }
      }
    }
  }
  return template.innerHTML;
}

function markdownToSafeHtml(markdown: string) {
  const rendered = marked.parse(String(markdown || ""), {
    async: false,
    breaks: false,
    gfm: true,
  });
  return sanitizeHtmlContent(String(rendered));
}

function escapeRegexText(value: string) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueEvidenceRefs(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => String(value || "").trim())
    .filter((value) => {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
}

function extractEvidenceRefsFromText(value: string) {
  const text = String(value || "");
  return uniqueEvidenceRefs(
    Array.from(text.matchAll(/\b(?:source-evidence::[A-Za-z0-9:_-]+|evidence::[A-Za-z0-9:_-]+|ev_[A-Za-z0-9_-]+)\b/g))
      .map((match) => match[0]),
  );
}

function evidenceRefHref(evidenceId: string) {
  return `#pact-evidence-${encodeURIComponent(evidenceId)}`;
}

function evidenceIdFromHref(href: string) {
  const prefix = "#pact-evidence-";
  if (!String(href || "").startsWith(prefix)) {
    return "";
  }
  try {
    return decodeURIComponent(String(href).slice(prefix.length));
  } catch {
    return String(href).slice(prefix.length);
  }
}

function linkifyEvidenceRefsInMarkdown(markdown: string, refs: string[]) {
  let next = String(markdown || "");
  for (const refId of [...refs].sort((left, right) => right.length - left.length)) {
    const escaped = escapeRegexText(refId);
    const href = evidenceRefHref(refId);
    next = next.replace(new RegExp(`\\[(${escaped})\\](?!\\()`, "g"), `[${refId}](${href})`);
    next = next.replace(
      new RegExp(`(^|[\\s(（,，;；:：])(${escaped})(?=$|[\\s)）,.，。;；:：])`, "g"),
      (_match, prefix) => `${prefix}[${refId}](${href})`,
    );
  }
  return next;
}

function plainTextToHtml(text: string) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtmlText(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

function normalizeCharset(value: string) {
  const charset = String(value || "utf-8").trim().toLowerCase().replace(/^["']|["']$/g, "");
  if (!charset || charset === "utf8") {
    return "utf-8";
  }
  if (charset === "us-ascii") {
    return "windows-1252";
  }
  return charset;
}

function decodeBytes(bytes: number[], charset = "utf-8") {
  try {
    return new TextDecoder(normalizeCharset(charset)).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  }
}

function base64ToBytes(value: string) {
  const clean = String(value || "").replace(/\s+/g, "");
  if (!clean) {
    return [];
  }
  try {
    return Array.from(atob(clean), (char) => char.charCodeAt(0));
  } catch {
    return [];
  }
}

function decodeQuotedPrintableToBytes(value: string, headerMode = false) {
  const text = String(value || "")
    .replace(/=\r?\n/g, "")
    .replace(/\r\n/g, "\n");
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (headerMode && char === "_") {
      bytes.push(0x20);
      continue;
    }
    if (char === "=" && /^[0-9a-f]{2}$/i.test(text.slice(index + 1, index + 3))) {
      bytes.push(parseInt(text.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    const code = char.charCodeAt(0);
    if (code <= 0xff) {
      bytes.push(code);
    } else {
      bytes.push(...Array.from(new TextEncoder().encode(char)));
    }
  }
  return bytes;
}

function decodeMimeWords(value: string) {
  return String(value || "").replace(
    /=\?([^?]+)\?([bq])\?([^?]*)\?=/gi,
    (_match, charset, encoding, content) => {
      const bytes =
        String(encoding).toLowerCase() === "b"
          ? base64ToBytes(String(content))
          : decodeQuotedPrintableToBytes(String(content), true);
      return decodeBytes(bytes, String(charset));
    },
  );
}

function parseHeaderParams(value: string) {
  const parts = String(value || "").split(";").map((part) => part.trim());
  const type = (parts.shift() || "").toLowerCase();
  const params: Record<string, string> = {};
  for (const part of parts) {
    const index = part.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = part.slice(0, index).trim().toLowerCase();
    const raw = part.slice(index + 1).trim();
    params[key] = raw.replace(/^["']|["']$/g, "");
  }
  return { type, params };
}

function evidenceAssetHintValues(asset: KnowledgeAssetRef) {
  const record = asRecord(asset as unknown) || {};
  const metadata = asRecord(record.metadata) || {};
  const locator = asRecord(asset.sourceLocator) || {};
  return [
    asset.assetId,
    asset.title,
    asset.caption,
    asset.thumbnailAssetId,
    metadata.contentId,
    metadata.contentID,
    metadata["content-id"],
    metadata["Content-ID"],
    metadata.cid,
    metadata.CID,
    metadata.filename,
    metadata.fileName,
    metadata.name,
    metadata.path,
    metadata.originalRelativePath,
    locator.sourceId,
    locator.sourcePath,
    locator.originalRelativePath,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeCidToken(value: string) {
  const decoded = decodeURIComponentSafe(String(value || "").trim()).trim();
  return decoded
    .replace(/^cid:/i, "")
    .replace(/^["']|["']$/g, "")
    .replace(/^<|>$/g, "")
    .replace(/[?#].*$/g, "")
    .trim()
    .toLowerCase();
}

function normalizeAssetReference(value: string) {
  const normalized = normalizeCidToken(value)
    .replace(/^file:\/\//i, "")
    .replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return {
    full: normalized,
    basename: parts[parts.length - 1] || normalized,
  };
}

function isImageAsset(asset: KnowledgeAssetRef) {
  const mediaType = String(asset.mediaType || "").toLowerCase();
  if (mediaType.startsWith("image/")) {
    return true;
  }
  return evidenceAssetHintValues(asset).some((hint) =>
    /\.(png|jpe?g|webp|gif|bmp|tiff?|svg)$/i.test(hint),
  );
}

function imageEvidenceAssets() {
  return evidenceAssets.value.filter((asset) => isImageAsset(asset));
}

function assetUrlForReference(reference: string) {
  const { full, basename } = normalizeAssetReference(reference);
  if (!full) {
    return "";
  }
  const images = imageEvidenceAssets();
  const exact = images.find((asset) =>
    evidenceAssetHintValues(asset).some((hint) => {
      const candidate = normalizeAssetReference(hint);
      return candidate.full === full || candidate.basename === full || candidate.basename === basename;
    }),
  );
  if (exact?.assetId) {
    return bridge.knowledgeAssetUrl(String(exact.assetId));
  }
  const loose = images.find((asset) =>
    evidenceAssetHintValues(asset).some((hint) => {
      const candidate = normalizeAssetReference(hint);
      return (
        candidate.full &&
        (candidate.full.includes(full) ||
          full.includes(candidate.full) ||
          candidate.basename.includes(basename) ||
          basename.includes(candidate.basename))
      );
    }),
  );
  if (loose?.assetId) {
    return bridge.knowledgeAssetUrl(String(loose.assetId));
  }
  return images.length === 1 && images[0]?.assetId
    ? bridge.knowledgeAssetUrl(String(images[0].assetId))
    : "";
}

function rewriteInlineAssetRefs(html: string) {
  return String(html || "").replace(
    /\b(src|background)\s*=\s*(["'])([^"']+)\2/gi,
    (match, attr, quote, reference) => {
      const raw = String(reference || "");
      if (/^(https?:|data:image\/|blob:|\/api\/knowledge\/assets\/)/i.test(raw.trim())) {
        return match;
      }
      const url = assetUrlForReference(raw);
      return url ? `${attr}=${quote}${url}${quote}` : match;
    },
  );
}

function normalizeRenderedText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function renderedHtmlHasBlocks(value: string) {
  return /<(p|div|section|article|ul|ol|li|table|blockquote|h[1-6]|pre|figure)\b/i.test(value);
}

function isHiddenEmailElement(element: Element) {
  const style = String(element.getAttribute("style") || "").toLowerCase();
  return (
    element.hasAttribute("hidden") ||
    element.getAttribute("aria-hidden") === "true" ||
    /display\s*:\s*none/.test(style) ||
    /visibility\s*:\s*hidden/.test(style) ||
    /opacity\s*:\s*0/.test(style) ||
    /font-size\s*:\s*0/.test(style) ||
    /max-height\s*:\s*0/.test(style)
  );
}

function renderEmailImage(element: Element) {
  const src = safeEmailImageSrc(element.getAttribute("src") || "");
  const alt = normalizeRenderedText(element.getAttribute("alt") || element.getAttribute("title") || "");
  if (!src) {
    return alt ? `<span class="email-image-alt">${escapeHtmlText(alt)}</span>` : "";
  }
  return `<figure class="email-inline-image"><img src="${escapeHtmlText(src)}" alt="${escapeHtmlText(alt || "email image")}" loading="lazy" referrerpolicy="no-referrer" /><figcaption>${escapeHtmlText(alt)}</figcaption></figure>`;
}

function renderEmailNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtmlText(normalizeRenderedText(node.textContent || ""));
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (
    isHiddenEmailElement(element) ||
    ["script", "style", "meta", "link", "head", "title", "noscript", "template", "svg", "iframe", "object", "embed"].includes(tag)
  ) {
    return "";
  }
  if (tag === "br") {
    return "<br />";
  }
  if (tag === "img") {
    return renderEmailImage(element);
  }
  const children = Array.from(element.childNodes)
    .map((child) => renderEmailNode(child))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+(<\/?(?:br|p|div|ul|ol|li|h4|blockquote|pre|figure)\b)/g, "$1")
    .replace(/(<\/(?:br|p|div|ul|ol|li|h4|blockquote|pre|figure)>)\s+/g, "$1")
    .trim();
  if (!children) {
    return "";
  }
  if (tag === "a") {
    const href = safeLinkHref(element.getAttribute("href") || "");
    return href
      ? `<a href="${escapeHtmlText(href)}" target="_blank" rel="noreferrer noopener">${children}</a>`
      : children;
  }
  if (tag === "li") {
    return `<li>${children}</li>`;
  }
  if (tag === "ul" || tag === "ol") {
    return `<${tag}>${children}</${tag}>`;
  }
  if (/^h[1-6]$/.test(tag)) {
    return `<h4>${children}</h4>`;
  }
  if (tag === "pre" || tag === "code") {
    return `<pre>${escapeHtmlText(element.textContent || "")}</pre>`;
  }
  if (tag === "blockquote") {
    return `<blockquote>${children}</blockquote>`;
  }
  if (tag === "figure") {
    return `<figure>${children}</figure>`;
  }
  if (["table", "tbody", "thead", "tfoot", "tr"].includes(tag)) {
    return `<div class="email-reader-group">${children}</div>`;
  }
  if (["td", "th", "div", "p", "section", "article", "main", "center"].includes(tag)) {
    return renderedHtmlHasBlocks(children)
      ? `<div class="email-reader-group">${children}</div>`
      : `<p>${children}</p>`;
  }
  return children;
}

function renderReadableHtmlDocument(rawHtml: string, options: { headers?: Array<[string, string]>; title?: string } = {}) {
  const source = rewriteInlineAssetRefs(String(rawHtml || ""));
  const doc = new DOMParser().parseFromString(
    /<html[\s>]|<body[\s>]|<!doctype/i.test(source)
      ? source
      : `<!doctype html><html><body>${source}</body></html>`,
    "text/html",
  );
  const headers = options.headers || [];
  const importantHeaders = ["Subject", "From", "To", "Cc", "Date"];
  const headerHtml = `<dl class="rendered-email-headers">${importantHeaders
    .map((name) => {
      const value = emailHeaderValue(headers, name) || htmlMetaHeader(source, name);
      return value ? `<div><dt>${escapeHtmlText(name)}</dt><dd>${escapeHtmlText(value)}</dd></div>` : "";
    })
    .join("")}</dl>`;
  const body = doc.body || doc.documentElement;
  const content = Array.from(body.childNodes)
    .map((child) => renderEmailNode(child))
    .filter(Boolean)
    .join("")
    .trim();
  const fallback = plainTextToHtml(body.textContent || source);
  return `<article class="rendered-email rendered-email-reader">${headerHtml}<div class="email-reader-body">${content || fallback}</div></article>`;
}

function parseEmailHeaders(rawText: string) {
  const normalized = rawText.replace(/\r\n/g, "\n");
  const match = normalized.match(/^([\s\S]*?)\n\s*\n([\s\S]*)$/);
  if (!match || !/^(from|to|subject|date|cc):/im.test(match[1])) {
    return { headers: [] as Array<[string, string]>, body: rawText };
  }
  const unfolded = match[1].replace(/\n[ \t]+/g, " ");
  const headers = unfolded
    .split("\n")
    .map((line) => {
      const index = line.indexOf(":");
      return index > 0 ? [line.slice(0, index), decodeMimeWords(line.slice(index + 1).trim())] as [string, string] : null;
    })
    .filter(Boolean) as Array<[string, string]>;
  return { headers, body: match[2] };
}

function emailHeaderValue(headers: Array<[string, string]>, name: string) {
  return headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || "";
}

function decodeMimeBody(body: string, headers: Array<[string, string]>) {
  const transferEncoding = emailHeaderValue(headers, "Content-Transfer-Encoding").toLowerCase();
  const contentType = parseHeaderParams(emailHeaderValue(headers, "Content-Type"));
  const charset = contentType.params.charset || "utf-8";
  if (transferEncoding === "quoted-printable") {
    return decodeBytes(decodeQuotedPrintableToBytes(body), charset);
  }
  if (transferEncoding === "base64") {
    return decodeBytes(base64ToBytes(body), charset);
  }
  return body;
}

function splitMimeParts(body: string, boundary: string) {
  if (!boundary) {
    return [];
  }
  const normalized = body.replace(/\r\n/g, "\n");
  const marker = `--${boundary}`;
  return normalized
    .split(marker)
    .slice(1)
    .map((part) => part.replace(/^\n/, "").replace(/\n--\s*$/, "").trimEnd())
    .filter((part) => part && part !== "--");
}

function extractEmailRenderablePart(rawText: string): { headers: Array<[string, string]>; body: string; contentType: string } {
  const parsed = parseEmailHeaders(rawText);
  const contentType = parseHeaderParams(emailHeaderValue(parsed.headers, "Content-Type"));
  if (contentType.type.startsWith("multipart/") && contentType.params.boundary) {
    const parts = splitMimeParts(parsed.body, contentType.params.boundary)
      .map((part) => extractEmailRenderablePart(part));
    return (
      parts.find((part) => part.contentType === "text/html") ||
      parts.find((part) => part.contentType === "text/plain") ||
      parts[0] ||
      { headers: parsed.headers, body: "", contentType: "text/plain" }
    );
  }
  return {
    headers: parsed.headers,
    body: decodeMimeBody(parsed.body, parsed.headers),
    contentType: contentType.type || "text/plain",
  };
}

function emailToSafeHtml(rawText: string) {
  const renderable = extractEmailRenderablePart(rawText);
  return (
    renderable.contentType === "text/html" || /<\/?[a-z][\s\S]*>/i.test(renderable.body)
      ? renderEmailFrame(renderable.body)
      : renderEmailFrame(`<pre>${escapeHtmlText(renderable.body)}</pre>`)
  );
}

function evidenceSourceHint() {
  const locator =
    asRecord(selectedEvidence.value?.sourceLocator) ||
    asRecord(selectedEvidence.value?.locator) ||
    null;
  const documentRecord = selectedEvidenceDocument.value || {};
  return [
    documentRecord.documentType,
    documentRecord.mediaType,
    documentRecord.sourcePath,
    documentRecord.title,
    locator?.sourcePath,
    selectedEvidence.value?.title,
  ].map((item) => String(item || "").toLowerCase()).join(" ");
}

function evidenceReadableKindLabel() {
  const text = evidencePrimaryText();
  const hint = evidenceSourceHint();
  if (/\.(eml|msg)\b|message\/rfc822|^from:|^subject:/i.test(`${hint}\n${text.slice(0, 500)}`)) {
    return "EML";
  }
  if (/\.html?\b|text\/html|^\s*(<!doctype\s+html|<html|<body)\b/i.test(`${hint}\n${text.slice(0, 500)}`)) {
    return "HTML";
  }
  if (/\.md\b|\.markdown\b|text\/markdown/i.test(hint)) {
    return "Markdown";
  }
  if (!text && imageEvidenceAssets().length > 0) {
    return "图片";
  }
  return "文本";
}

function decodeURIComponentSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function assetIdsEmbeddedInHtml(html: string) {
  const ids = new Set<string>();
  for (const match of String(html || "").matchAll(/\/api\/knowledge\/assets\/([^"')\s<]+)/g)) {
    ids.add(decodeURIComponentSafe(match[1] || ""));
  }
  return ids;
}

function renderEvidenceImageGallery(excludedAssetIds = new Set<string>()) {
  const images = imageEvidenceAssets().filter((asset) => !excludedAssetIds.has(String(asset.assetId || "")));
  if (images.length === 0) {
    return "";
  }
  return `<div class="rendered-image-grid">${images
    .map((asset) => {
      const src = asset.assetId ? bridge.knowledgeAssetUrl(String(asset.assetId)) : "";
      return src
        ? `<figure><img src="${escapeHtmlText(src)}" alt="${escapeHtmlText(asset.title || asset.assetId || "image")}" loading="lazy" /><figcaption>${escapeHtmlText(asset.title || asset.caption || asset.assetId || "")}</figcaption></figure>`
        : "";
    })
    .join("")}</div>`;
}

function embedEvidenceAssets(html: string) {
  const gallery = renderEvidenceImageGallery(assetIdsEmbeddedInHtml(html));
  if (!gallery) {
    return html;
  }
  return `${html}<section class="rendered-inline-assets">${gallery}</section>`;
}

function renderEvidenceReadableHtml() {
  const text = evidencePrimaryText();
  const kind = evidenceReadableKindLabel();
  if (!text && kind === "图片") {
    return renderEvidenceImageGallery() || plainTextToHtml("当前证据没有可展示的正文。");
  }
  if (kind === "EML") {
    return emailToSafeHtml(text);
  }
  if (kind === "HTML") {
    return renderEmailFrame(text);
  }
  if (kind === "Markdown") {
    return embedEvidenceAssets(markdownToSafeHtml(text));
  }
  return embedEvidenceAssets(plainTextToHtml(text || "当前证据没有可展示的正文。"));
}

function evidenceSourceDetails() {
  const locator =
    asRecord(selectedEvidence.value?.sourceLocator) ||
    asRecord(selectedEvidence.value?.locator) ||
    null;
  const document = selectedEvidenceDocument.value || {};
  const section = selectedEvidenceSection.value || {};
  return [
    { label: "文档", value: String(document.title || document.documentId || "未记录") },
    { label: "章节", value: String(section.title || section.sectionId || "未记录") },
    { label: "来源", value: String(locator?.sourcePath || "未记录") },
    { label: "批次", value: String(locator?.batchId || selectedEvidence.value?.batchId || "未记录") },
  ].filter((item: any) => item.value && item.value !== "未记录");
}

function evidenceReasonText() {
  const reasons = selectedEvidence.value?.reasons || [];
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return "暂无命中说明。";
  }
  return reasons
    .map((reason) => (typeof reason === "string" ? reason : JSON.stringify(reason)))
    .join("；");
}

async function refreshAuthState() {
  try {
    const session = await bridge.getAuthSession();
    authState.value = session;
    if (!session.session.authenticated) {
      consoleState.value = null;
      stopServerEventSubscription();
    }
    return session;
  } catch (nextError) {
    authState.value = null;
    consoleState.value = null;
    stopServerEventSubscription();
    error.value = nextError instanceof Error ? nextError.message : "加载认证状态失败。";
    return null;
  } finally {
    authBootstrapping.value = false;
  }
}

async function submitLoginAuth() {
  setBusy("auth:login");
  error.value = "";
  try {
    await bridge.loginAuth(loginForm.value);
    const session = await refreshAuthState();
    if (!session?.session.authenticated) {
      error.value = "登录已返回，但会话状态尚未生效，请重试。";
      return;
    }
    await refreshState({ silent: true });
    startServerEventSubscription();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "登录失败。";
  } finally {
    clearAllBusy();
  }
}

async function logoutConsole() {
  setBusy("auth:logout");
  error.value = "";
  stopServerEventSubscription();
  serverEventCursor = 0;
  try {
    await bridge.logoutAuth();
    consoleState.value = null;
    await refreshAuthState();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "退出失败。";
  } finally {
    clearAllBusy();
  }
}

async function refreshAuthAdmin() {
  if (!canAdminAuth.value) {
    return;
  }
  try {
    const [users, audit, sessions, oidc] = await Promise.all([
      bridge.listAuthUsers(),
      bridge.listAuthAudit(80),
      bridge.listAuthSessions(),
      bridge.getAuthOidc(),
    ]);
    authUsers.value = users.users;
    authAudit.value = audit.items;
    authSessions.value = sessions.sessions;
    oidcDraft.value = {
      ...oidc.oidc,
      clientSecret: "",
    };
    oidcAllowedDomainsText.value = (oidc.oidc.allowedDomains || []).join("\n");
    oidcRoleMappingText.value = JSON.stringify(oidc.oidc.roleMapping || {}, null, 2);
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "加载认证管理数据失败。";
  }
}

async function updateConsoleUser(user: ConsoleUser, patch: Partial<ConsoleUser> & { password?: string }) {
  setBusy(`auth:user:${user.userId}`);
  error.value = "";
  try {
    const result = await bridge.updateAuthUser(user.userId, patch);
    authUsers.value = result.users;
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "更新用户失败。";
  } finally {
    clearAllBusy();
  }
}

function updateConsoleUserRoleFromEvent(user: ConsoleUser, event: Event) {
  const roleId = (event.target as HTMLSelectElement).value;
  void updateConsoleUser(user, { roleId });
}

function updateConsoleUserRole(user: ConsoleUser, roleId: string) {
  void updateConsoleUser(user, { roleId });
}

async function saveOidcConfig() {
  setBusy("auth:oidc");
  error.value = "";
  try {
    const result = await bridge.saveAuthOidc({
      ...oidcDraft.value,
      allowedDomains: oidcAllowedDomainsText.value
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      roleMapping: JSON.parse(oidcRoleMappingText.value || "{}") as Record<string, string>,
    });
    oidcDraft.value = {
      ...result.oidc,
      clientSecret: "",
    };
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "保存 OIDC 失败。";
  } finally {
    clearAllBusy();
  }
}

async function revokeConsoleSession(sessionId: string) {
  setBusy(`auth:session:${sessionId}`);
  error.value = "";
  try {
    await bridge.revokeAuthSession(sessionId);
    await refreshAuthAdmin();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "撤销会话失败。";
  } finally {
    clearAllBusy();
  }
}

async function refreshKnowledgeConsole() {
  if (!hasScope("knowledge:read")) {
    return;
  }
  const requestedReviewStatus = knowledgeReviewStatus.value;
  const reviewRequestGeneration = ++knowledgeReviewRequestGeneration;
  try {
    const [state, schema, maintenance, sources, reviewItems] = await Promise.all([
      bridge.getKnowledgeConsole(),
      bridge.getKnowledgeConfigSchema(),
      bridge.getKnowledgeMaintenance().catch(() => ({} as MaintenanceSettings)),
      bridge.getKnowledgeSources().catch(() => null),
      bridge.listKnowledgeReviewItems({ status: requestedReviewStatus, limit: 100 }).catch(() => null),
    ]);
    knowledgeConsole.value = state;
    knowledgeSchema.value = schema;
    knowledgeSourceState.value = sources || state.sources || null;
    if (
      reviewItems &&
      reviewRequestGeneration === knowledgeReviewRequestGeneration &&
      requestedReviewStatus === knowledgeReviewStatus.value
    ) {
      knowledgeReviewItems.value = reviewItems.items || [];
    }
    knowledgeMaintenanceDraft.value = maintenance || {};
    maintenanceJson.value = jsonPreview(knowledgeMaintenanceDraft.value);
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "加载知识库管控数据失败。";
  }
}

async function refreshWordCloud(options: { silent?: boolean } = {}) {
  if (!canReadKnowledge.value) {
    return;
  }
  if (!options.silent) {
    setBusy("knowledge:word-clouds");
  }
  error.value = "";
  const targetCorpusPaths = resolveWordCloudCorpusPathsForQuery();
  try {
    const state = await bridge.getKnowledgeWordClouds({
      limit: 100000,
      minFrequency: 1,
      corpusPaths: targetCorpusPaths,
    });
    wordCloudState.value = state;
    setWordCloudDraftFromState(state);
    if (wordCloudMessages.value.length === 0) {
      wordCloudMessages.value = [{
        id: `word-cloud-system-${Date.now()}`,
        role: "system" as const,
        text: `已读取 ${state.terms?.length || 0} 个语料词。`,
        at: new Date().toISOString(),
      }];
    }
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "加载词云失败。";
  } finally {
    if (!options.silent && busyKey.value === "knowledge:word-clouds") {
      clearAllBusy();
    }
  }
}

async function saveWordCloud() {
  if (!canWriteKnowledge.value) {
    error.value = "需要 knowledge:write 权限才能保存词云。";
    return;
  }
  const draft = wordCloudDraft.value || createDefaultWordCloudSet(wordCloudTerms.value);
  autoAbsorbWordCloudTerms(draft);
  setBusy("knowledge:word-clouds:save");
  error.value = "";
  try {
    const result = await bridge.saveKnowledgeWordClouds({
      wordBagSet: {
        ...draft,
        wordBagCount: draft.wordBags.length,
        termsSnapshot: wordCloudTerms.value,
        corpusPaths: wordCloudCorpusPaths.value,
        modelAlias: wordCloudModelAlias.value,
      },
      limit: 100000,
      minFrequency: 1,
    });
    applySavedWordCloudSet(result.wordBagSet);
    wordCloudMessages.value = [{
      id: `word-cloud-save-${Date.now()}`,
      role: "system" as const,
      text: "词云已保存到本地。",
      at: new Date().toISOString(),
    }, ...wordCloudMessages.value].slice(0, 20);
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "保存词云失败。";
  } finally {
    if (busyKey.value === "knowledge:word-clouds:save") {
      clearAllBusy();
    }
  }
}

async function proposeWordCloud() {
  if (!canWriteKnowledge.value) {
    error.value = "需要 knowledge:write 权限才能调用智能体生成词云。";
    return;
  }
  if (!selectedWordCloudModel.value.enabled) {
    error.value = selectedWordCloudModel.value.disabledReason || "请选择一个可用智能体。";
    return;
  }
  setBusy("knowledge:word-clouds:propose");
  error.value = "";
  const prompt = wordCloudPrompt.value.trim();
  if (!prompt) {
    error.value = "请输入词云分组意图。";
    clearAllBusy();
    return;
  }
  const corpusPaths = resolveWordCloudCorpusPathsForQuery();
  if (corpusPaths.length === 0) {
    error.value = "请先添加语料范围后再启动分类任务。";
    wordCloudMessages.value = [{
      id: `word-cloud-error-${Date.now()}`,
      role: "system" as const,
      text: error.value,
      at: new Date().toISOString(),
    }, ...wordCloudMessages.value].slice(0, 20);
    return;
  }
  if (prompt) {
    wordCloudMessages.value = [{
      id: `word-cloud-user-${Date.now()}`,
      role: "user" as const,
      text: prompt,
      at: new Date().toISOString(),
    }, ...wordCloudMessages.value].slice(0, 20);
  }
  try {
    const preparedTerms = await refreshWordCloudCorpusTerms({
      silent: true,
      forceRebuild: true,
      corpusPaths,
    });
    if ((preparedTerms || []).length === 0) {
      if (corpusPaths.length > 0) {
        error.value = "已扫描语料范围但未发现可用词频，建议确认目录下有已入库文档并重新启动该任务。";
      } else {
        error.value = "请先添加语料范围后再启动分类任务。";
      }
      wordCloudMessages.value = [{
        id: `word-cloud-error-${Date.now()}`,
        role: "system" as const,
        text: error.value,
        at: new Date().toISOString(),
      }, ...wordCloudMessages.value].slice(0, 20);
      return;
    }
    const result = await bridge.proposeKnowledgeWordClouds({
      modelAlias: selectedWordCloudModel.value.value,
      prompt,
      minFrequency: 1,
      corpusPaths,
    });
    wordCloudPrompt.value = "";
    applySavedWordCloudSet(result.wordBagSet);
    wordCloudMessages.value = [{
      id: `word-cloud-agent-${Date.now()}`,
      role: "agent" as const,
      text: result.run?.runId ? "词云分类后台任务已启动。" : `已生成 ${result.wordBagSet?.wordBags?.length || 0} 朵词云。`,
      at: new Date().toISOString(),
    }, ...wordCloudMessages.value].slice(0, 20);
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "智能体生成词云失败。";
    wordCloudMessages.value = [{
      id: `word-cloud-error-${Date.now()}`,
      role: "system" as const,
      text: error.value,
      at: new Date().toISOString(),
    }, ...wordCloudMessages.value].slice(0, 20);
  } finally {
    if (busyKey.value === "knowledge:word-clouds:propose") {
      clearAllBusy();
    }
  }
}

async function refreshKnowledgeConflicts(options: { silent?: boolean } = {}) {
  if (!hasScope("knowledge:read")) {
    knowledgeReviewRequestGeneration += 1;
    return;
  }
  const requestedStatus = knowledgeReviewStatus.value;
  const requestGeneration = ++knowledgeReviewRequestGeneration;
  const busyGeneration = options.silent ? 0 : ++knowledgeReviewBusyGeneration;
  if (!options.silent) {
    setBusy("knowledge:review-items");
  }
  error.value = "";
  try {
    const result = await bridge.listKnowledgeReviewItems({
      status: requestedStatus,
      limit: 100,
    });
    if (
      requestGeneration !== knowledgeReviewRequestGeneration ||
      requestedStatus !== knowledgeReviewStatus.value
    ) {
      return;
    }
    knowledgeReviewItems.value = result.items || [];
  } catch (nextError) {
    if (
      requestGeneration !== knowledgeReviewRequestGeneration ||
      requestedStatus !== knowledgeReviewStatus.value
    ) {
      return;
    }
    error.value = nextError instanceof Error ? nextError.message : "加载知识冲突列表失败。";
  } finally {
    if (!options.silent && busyGeneration === knowledgeReviewBusyGeneration) {
      clearAllBusy();
    }
  }
}

async function resolveKnowledgeReview(
  item: KnowledgeReviewItem,
  resolution: string,
  patch: Record<string, unknown> = {},
) {
  if (!canMaintainKnowledge.value && !canAdminKnowledge.value) {
    error.value = "需要 knowledge:maintain 权限才能处理冲突。";
    return;
  }
  const reviewId = String(item.reviewId || "");
  if (!reviewId) {
    return;
  }
  setBusy(`knowledge:review:${reviewId}:${resolution}`);
  error.value = "";
  try {
    await bridge.resolveKnowledgeReviewItem(reviewId, { resolution, patch });
    await refreshKnowledgeConflicts({ silent: true });
    await refreshKnowledgeConsole();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "处理知识冲突失败。";
  } finally {
    clearAllBusy();
  }
}

async function fuseKnowledgeReview(item: KnowledgeReviewItem) {
  const model = selectedKnowledgeReviewFusionModel.value;
  if (!model?.enabled || !model.value) {
    error.value = "知识融合智能体未配置可用模型，请先在智能体配置中选择模型。";
    return;
  }
  const reviewId = String(item.reviewId || "");
  setBusy(`knowledge:review:${reviewId}:merge`);
  error.value = "";
  try {
    const response = await bridge.callAgentGateway({
      modelAlias: model.value,
      alias: model.value,
      moduleId: "agentTools",
      taskId: reviewId,
      sessionId: reviewId,
      question: knowledgeReviewFusionPrompt(item),
      systemPrompt: settingsDraft.value.agentExploreDefaults.reviewFusionSystemPrompt,
      parameters: {
        ...agentExploreThinkingParameters(),
        temperature: Number(settingsDraft.value.agentExploreDefaults.reviewFusionTemperature || 0.1),
        max_tokens: Number(settingsDraft.value.agentExploreDefaults.reviewFusionMaxTokens || 1200),
      },
    });
    const answer = String(response.answer || response.text || "").trim();
    await resolveKnowledgeReview(item, "merge", {
      fusionAgent: {
        modelAlias: model.value,
        generatedAt: new Date().toISOString(),
        answer,
      },
    });
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "知识融合智能体调用失败。";
  } finally {
    clearAllBusy();
  }
}

async function searchKnowledge() {
  const query = knowledgeSearchForm.value.query.trim();
  if (!query) {
    error.value = "请输入知识召回调试问题。";
    return;
  }
  if (!canReadKnowledge.value) {
    error.value = "当前账号没有知识库读取权限。";
    return;
  }
  setBusy("knowledge:search");
  error.value = "";
  openDebugTab("knowledgeRecall");
  selectedEvidence.value = null;
  selectedEvidenceId.value = "";
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
      explain: true,
      learningEnabled: currentKnowledgeLearningEnabled(),
    });
    knowledgeSearchResponse.value = result;
    knowledgeSearchResults.value = normalizeSearchResults(result);
    lastKnowledgeSearchQuery.value = query;
    const firstEvidenceId = knowledgeSearchResults.value
      .map((item) => knowledgeResultEvidenceId(item))
      .find(Boolean);
    if (firstEvidenceId) {
      await loadEvidence(firstEvidenceId);
    }
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "知识召回失败。";
  } finally {
    clearAllBusy();
  }
}

function parseKnowledgeRecallTopKValues(value: unknown) {
  const values = String(value || "")
    .split(/[,\s，、]+/)
    .map((item) => Number(item))
    .filter((item: any) => Number.isFinite(item) && item > 0)
    .map((item) => Math.max(1, Math.min(Math.floor(item), 100)));
  return [...new Set(values)].slice(0, 6);
}

function buildKnowledgeRecallSearchPayload(query: string, topK: number) {
  const retrievalProfile = {
    ...currentKnowledgeRetrievalSettings(),
    topK,
  };
  return {
    query,
    limit: topK,
    retrievalMode: knowledgeRecallDebugForm.value.retrievalMode || "hybrid",
    keywordOnly: knowledgeRecallDebugForm.value.keywordOnly,
    retrievalProfile,
    profile: { retrieval: retrievalProfile },
    retrievalProfileId: String((retrievalProfile as any).retrievalProfileId || ""),
    clientId: "server-console-debug-knowledge-recall",
    explain: knowledgeRecallDebugForm.value.explain,
    learningEnabled: knowledgeRecallDebugForm.value.learningEnabled,
  };
}

const knowledgeRecallDebugGridStyle = computed<Record<string, string>>(() => ({
  "--debug-compare-columns": String(Math.max(1, knowledgeRecallDebugRuns.value.length || 1)),
}));

const knowledgeRecallDebugParameterSummary = computed(() => {
  const topKValues = parseKnowledgeRecallTopKValues(knowledgeRecallDebugForm.value.topKValues);
  return [
    `TopK ${topKValues.length ? topKValues.join(" / ") : "未设置"}`,
    `模式 ${knowledgeRecallDebugForm.value.retrievalMode}`,
    knowledgeRecallDebugForm.value.keywordOnly ? "仅关键词" : "混合候选",
    knowledgeRecallDebugForm.value.learningEnabled ? "学习启用" : "学习关闭",
  ].join(" · ");
});

async function runKnowledgeRecallDebugBatch() {
  const query = knowledgeRecallDebugForm.value.query.trim();
  if (!query) {
    error.value = "请输入知识库召回调试问题。";
    return;
  }
  if (!canReadKnowledge.value) {
    error.value = "当前账号没有知识库读取权限。";
    return;
  }
  const topKValues = parseKnowledgeRecallTopKValues(knowledgeRecallDebugForm.value.topKValues);
  if (!topKValues.length) {
    error.value = "请至少填写一个有效 TopK，例如 10 20 30。";
    return;
  }
  setBusy("debug:knowledge-recall");
  error.value = "";
  knowledgeRecallDebugRuns.value = topKValues.map((topK) => ({
    runId: `knowledge-recall-${topK}-${Date.now()}`,
    label: `TopK ${topK}`,
    topK,
    status: "queued",
    elapsedMs: 0,
    startedAt: "",
    response: null,
    items: [],
    error: "",
  }));
  await Promise.all(
    knowledgeRecallDebugRuns.value.map(async (run) => {
      const started = performance.now();
      run.status = "running";
      run.startedAt = new Date().toISOString();
      try {
        const response = await bridge.searchKnowledge(buildKnowledgeRecallSearchPayload(query, run.topK));
        run.response = response;
        run.items = normalizeSearchResults(response);
        run.status = "completed";
      } catch (nextError) {
        run.error = nextError instanceof Error ? nextError.message : "知识库召回失败。";
        run.status = "failed";
      } finally {
        run.elapsedMs = Math.max(0, Math.round(performance.now() - started));
      }
    }),
  );
  lastKnowledgeSearchQuery.value = query;
  clearAllBusy();
}

function agentExploreRunStatus(result: AgentExploreRunResponse | null) {
  return String(asRecord(result?.run)?.status || "");
}

function normalizeAgentExploreRun(result: AgentExploreRunResponse): AgentExploreRunResponse {
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

function agentExploreSessionFromResult(
  result: AgentExploreRunResponse | null,
  fallback: Partial<AgentExploreSession> = {},
): AgentExploreSession | null {
  const run = asRecord(result?.run) || {};
  const input = asRecord(run.input) || {};
  const workspace = asRecord(result?.workspace) || {};
  const runId = String(run.runId || fallback.runId || "").trim();
  const workspaceId = String(
    workspace.workspaceId ||
      run.workspaceId ||
      fallback.workspaceId ||
      agentExploreForm.value.workspaceId ||
      "",
  ).trim();
  if (!runId || !workspaceId) {
    return null;
  }
  const query = String(input.query || fallback.query || agentExploreForm.value.query || "").trim();
  return {
    runId,
    workspaceId,
    query,
    modelAlias: String(input.modelAlias || fallback.modelAlias || agentExploreForm.value.modelAlias || ""),
    contextProfileId: String(
      input.contextProfileId ||
        fallback.contextProfileId ||
        agentExploreForm.value.contextProfileId ||
        "context-128k",
    ),
    thinkingMode: normalizedAgentExploreThinkingMode(
      String(input.thinkingMode || fallback.thinkingMode || agentExploreForm.value.thinkingMode || "default"),
    ),
    temperature: Number(input.temperature ?? fallback.temperature ?? agentExploreForm.value.temperature ?? 0.2),
    maxTokens: Number(input.maxTokens || fallback.maxTokens || agentExploreForm.value.maxTokens || 1800),
    maxIterations: Number(input.maxIterations || fallback.maxIterations || agentExploreForm.value.maxIterations || 4),
    limit: Number(input.limit || fallback.limit || agentExploreForm.value.limit || 8),
    toolChoice: String(input.toolChoice || fallback.toolChoice || agentExploreForm.value.toolChoice || "auto"),
    status: agentExploreRunStatus(result),
    answerPreview: String(result?.answer || fallback.answerPreview || "").slice(0, 180),
    updatedAt: String(run.updatedAt || run.completedAt || fallback.updatedAt || new Date().toISOString()),
  };
}

function readAgentExplorePersistence() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AGENT_EXPLORE_STORAGE_KEY) || "{}");
    return asRecord(parsed) || {};
  } catch {
    return {};
  }
}

function writeAgentExplorePersistence(payload: Record<string, unknown>) {
  try {
    window.localStorage.setItem(AGENT_EXPLORE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Local persistence is a UI convenience; storage errors should not block exploration.
  }
}

function agentExploreHistorySortValue(session: AgentExploreSession) {
  const value = Date.parse(String(session.updatedAt || ""));
  return Number.isFinite(value) ? value : 0;
}

function sanitizeAgentExploreSessionModelReference(session: AgentExploreSession): AgentExploreSession {
  return {
    ...session,
    modelAlias: validAgentModelAlias(session.modelAlias),
  };
}

function clearInvalidAgentExploreModelReferences() {
  let changed = false;
  const sanitizeList = (sessions: AgentExploreSession[]) =>
    sessions.map((session) => {
      const sanitized = sanitizeAgentExploreSessionModelReference(session);
      if (sanitized.modelAlias !== session.modelAlias) {
        changed = true;
      }
      return sanitized;
    });
  agentExploreDraftTabs.value = sanitizeList(agentExploreDraftTabs.value);
  agentExploreHistory.value = sanitizeList(agentExploreHistory.value);
  const activeSession = asRecord(agentExploreResult.value?.run);
  const activeInput = asRecord(activeSession?.input);
  if (activeInput?.modelAlias && !hasAgentModelOption(String(activeInput.modelAlias))) {
    activeInput.modelAlias = "";
  }
  if (changed) {
    persistAgentExploreState();
  }
}

function normalizeAgentExploreHistoryList(sessions: AgentExploreSession[]) {
  const seen = new Set<string>();
  return sessions
    .filter((session) => {
      const runId = String(session.runId || "").trim();
      if (!runId || seen.has(runId) || agentExploreHiddenRunIds.value.has(runId)) {
        return false;
      }
      seen.add(runId);
      return true;
    })
    .map(sanitizeAgentExploreSessionModelReference)
    .sort((left, right) => agentExploreHistorySortValue(right) - agentExploreHistorySortValue(left))
    .slice(0, 20);
}

function createAgentExploreDraftTab(seed: Partial<AgentExploreSession> = {}): AgentExploreSession {
  const timestamp = new Date().toISOString();
  return {
    runId: `draft:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    workspaceId: "",
    query: "",
    modelAlias: agentExploreForm.value.modelAlias || "",
    contextProfileId: selectedAgentExploreContextProfile.value.value,
    thinkingMode: selectedAgentExploreThinkingMode.value,
    temperature: Number(agentExploreForm.value.temperature || agentExploreConfiguredTemperature.value),
    maxTokens: Number(agentExploreForm.value.maxTokens || agentExploreConfiguredMaxTokens.value),
    maxIterations: agentExploreConfiguredMaxIterations.value,
    limit: agentExploreConfiguredLimit.value,
    toolChoice: agentExploreForm.value.toolChoice || agentExploreConfiguredToolChoice.value,
    status: "draft",
    answerPreview: "",
    updatedAt: timestamp,
    ...seed,
  };
}

function syncActiveAgentExploreDraftFromForm() {
  const tabId = agentExploreActiveTabId.value;
  if (!tabId.startsWith("draft:")) {
    return;
  }
  const existing = agentExploreDraftTabs.value.find((item) => item.runId === tabId);
  if (!existing) {
    return;
  }
  agentExploreDraftTabs.value = normalizeAgentExploreHistoryList(
    agentExploreDraftTabs.value.map((item) =>
      item.runId === tabId
        ? {
            ...item,
            query: agentExploreForm.value.query,
            modelAlias: agentExploreForm.value.modelAlias,
            contextProfileId: selectedAgentExploreContextProfile.value.value,
            thinkingMode: selectedAgentExploreThinkingMode.value,
            temperature: agentExploreForm.value.temperature,
            maxTokens: agentExploreForm.value.maxTokens,
            maxIterations: agentExploreForm.value.maxIterations,
            limit: agentExploreForm.value.limit,
            toolChoice: agentExploreForm.value.toolChoice,
            updatedAt: item.updatedAt,
          }
        : item,
    ),
  );
}

function upsertAgentExploreHistory(session: AgentExploreSession | null) {
  if (!session || agentExploreHiddenRunIds.value.has(session.runId)) {
    return;
  }
  if (isAgentExploreDraftSession(session)) {
    agentExploreDraftTabs.value = normalizeAgentExploreHistoryList([
      session,
      ...agentExploreDraftTabs.value.filter((item: any) => item.runId !== session.runId),
    ]);
    return;
  }
  const existingIndex = agentExploreHistory.value.findIndex((item) => item.runId === session.runId);
  const nextHistory =
    existingIndex >= 0
      ? agentExploreHistory.value.map((item, index) => (index === existingIndex ? session : item))
      : [session, ...agentExploreHistory.value];
  agentExploreHistory.value = normalizeAgentExploreHistoryList(nextHistory);
}

function deleteAgentExploreHistorySession(session: AgentExploreSession) {
  const runId = String(session.runId || "").trim();
  if (!runId) {
    return;
  }
  agentExploreHiddenRunIds.value = new Set([...agentExploreHiddenRunIds.value, runId]);
  agentExploreClosedTabIds.value = new Set(
    [...agentExploreClosedTabIds.value].filter((item: any) => item !== runId),
  );
  agentExploreDraftTabs.value = normalizeAgentExploreHistoryList(
    agentExploreDraftTabs.value.filter((item: any) => item.runId !== runId),
  );
  agentExploreHistory.value = normalizeAgentExploreHistoryList(
    agentExploreHistory.value.filter((item: any) => item.runId !== runId),
  );
  const activeRunId = String(asRecord(agentExploreResult.value?.run)?.runId || "");
  if (activeRunId === runId || agentExploreActiveTabId.value === runId) {
    stopAgentExplorePolling();
    agentExploreResult.value = null;
    agentExploreForm.value.workspaceId = "";
    agentExploreActiveTabId.value = "";
    if (busyKey.value === "knowledge:agent-explore" || busyKey.value === `knowledge:agent-explore:load:${runId}`) {
      clearAllBusy();
    }
    const nextTab = agentExploreTabs.value[0];
    if (nextTab) {
      void switchAgentExploreTab(nextTab);
    }
  }
  persistAgentExploreState();
}

function agentExploreTabBusy(session: AgentExploreSession) {
  return busyKey.value === `knowledge:agent-explore:load:${session.runId}`;
}

const agentExploreHistoryPanelItems = computed<HistorySessionPanelItem[]>(() =>
  agentExploreHistory.value.map((session) => ({
    id: session.runId,
    title: agentExploreSessionLabel(session),
    meta: `${session.status || "unknown"} · ${shortId(session.runId)}`,
    preview: session.answerPreview || "",
    active: session.runId === agentExploreActiveTabId.value,
    disabled: agentExploreTabBusy(session),
    deleteLabel: `删除历史会话 ${agentExploreSessionLabel(session)}`,
  })),
);

function selectAgentExploreHistoryItem(runId: string) {
  const session = agentExploreHistory.value.find((item) => item.runId === runId);
  if (session) {
    void switchAgentExploreTab(session);
  }
}

function deleteAgentExploreHistoryItem(runId: string) {
  const session = agentExploreHistory.value.find((item) => item.runId === runId);
  if (session) {
    deleteAgentExploreHistorySession(session);
  }
}

function closeAgentExploreTab(session: AgentExploreSession) {
  const runId = String(session.runId || "").trim();
  if (!runId) {
    return;
  }
  const wasActive =
    agentExploreActiveTabId.value === runId ||
    String(asRecord(agentExploreResult.value?.run)?.runId || "") === runId;
  if (isAgentExploreDraftSession(session)) {
    agentExploreDraftTabs.value = normalizeAgentExploreHistoryList(
      agentExploreDraftTabs.value.filter((item: any) => item.runId !== runId),
    );
  } else {
    agentExploreClosedTabIds.value = new Set([...agentExploreClosedTabIds.value, runId]);
  }

  if (wasActive) {
    stopAgentExplorePolling();
    agentExploreResult.value = null;
    agentExploreForm.value.workspaceId = "";
    agentExploreActiveTabId.value = "";
    if (busyKey.value === "knowledge:agent-explore" || busyKey.value === `knowledge:agent-explore:load:${runId}`) {
      clearAllBusy();
    }
    const nextTab = agentExploreTabs.value[0];
    if (nextTab) {
      void switchAgentExploreTab(nextTab);
    } else {
      const draft = createAgentExploreDraftTab({
        modelAlias: agentExploreForm.value.modelAlias,
        contextProfileId: agentExploreForm.value.contextProfileId,
      });
      agentExploreDraftTabs.value = [draft];
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
    const sessions = details
      .flatMap((detail) => {
        if (!detail) {
          return [];
        }
        const workspace = asRecord(detail.workspace) || {};
        const runs = Array.isArray(detail.runs) ? detail.runs : [];
        return runs
          .filter((run) => String(asRecord(run)?.runType || "") === "knowledge_agent_exploration")
          .map((run) =>
            agentExploreSessionFromResult({
              protocolVersion: "",
              ok: String(asRecord(run)?.status || "") !== "failed",
              workspace,
              run: asRecord(run) || {},
              answer: String(asRecord(asRecord(run)?.coverage)?.answer || ""),
            }),
          )
          .filter(Boolean) as AgentExploreSession[];
      })
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
      .slice(0, 20);
    const visibleSessions = normalizeAgentExploreHistoryList(sessions);
    if (visibleSessions.length) {
      agentExploreHistory.value = visibleSessions;
    }
    return visibleSessions;
  } catch {
    return [];
  }
}

function persistAgentExploreState() {
  if (!agentExploreHydrated.value) {
    return;
  }
  syncActiveAgentExploreDraftFromForm();
  const activeSession = agentExploreSessionFromResult(agentExploreResult.value);
  upsertAgentExploreHistory(activeSession);
  const activeTabId =
    agentExploreActiveTabId.value ||
    activeSession?.runId ||
    (agentExploreForm.value.workspaceId ? "" : agentExploreDraftTabs.value[0]?.runId || "");
  writeAgentExplorePersistence({
    activeRunId: activeSession?.runId || "",
    activeTabId,
    activeWorkspaceId: activeSession?.workspaceId || agentExploreForm.value.workspaceId || "",
    form: { ...agentExploreForm.value },
    draftTabs: agentExploreDraftTabs.value,
    history: agentExploreHistory.value,
    hiddenRunIds: Array.from(agentExploreHiddenRunIds.value),
    closedTabIds: Array.from(agentExploreClosedTabIds.value),
  });
}

function applyAgentExploreDraftTab(session: AgentExploreSession) {
  stopAgentExplorePolling();
  agentExploreTraceOpen.value = true;
  agentExploreActiveTabId.value = session.runId;
  agentExploreResult.value = null;
  agentExploreForm.value = {
    query: session.query,
    modelAlias: hasAgentModelOption(session.modelAlias) ? session.modelAlias : "",
    contextProfileId: session.contextProfileId || agentExploreForm.value.contextProfileId,
    thinkingMode: normalizedAgentExploreThinkingMode(session.thinkingMode || agentExploreForm.value.thinkingMode),
    temperature: Number(session.temperature || agentExploreForm.value.temperature || agentExploreConfiguredTemperature.value),
    maxTokens: Number(session.maxTokens || agentExploreForm.value.maxTokens || agentExploreConfiguredMaxTokens.value),
    maxIterations: session.maxIterations || agentExploreConfiguredMaxIterations.value,
    limit: session.limit || agentExploreConfiguredLimit.value,
    toolChoice: session.toolChoice || agentExploreForm.value.toolChoice || agentExploreConfiguredToolChoice.value,
    workspaceId: "",
  };
  if (busyKey.value === "knowledge:agent-explore") {
    clearAllBusy();
  }
  persistAgentExploreState();
}

async function switchAgentExploreTab(session: AgentExploreSession) {
  if (agentExploreClosedTabIds.value.has(session.runId)) {
    agentExploreClosedTabIds.value = new Set(
      [...agentExploreClosedTabIds.value].filter((item: any) => item !== session.runId),
    );
  }
  if (isAgentExploreDraftSession(session)) {
    applyAgentExploreDraftTab(session);
    return;
  }
  agentExploreActiveTabId.value = session.runId;
  await loadAgentExploreSession(session);
}

async function loadAgentExploreSession(session: AgentExploreSession) {
  stopAgentExplorePolling();
  agentExploreTraceOpen.value = true;
  setBusy(`knowledge:agent-explore:load:${session.runId}`);
  error.value = "";
  agentExploreActiveTabId.value = session.runId;
  try {
    agentExploreForm.value = {
      query: session.query,
      modelAlias: hasAgentModelOption(session.modelAlias) ? session.modelAlias : "",
      contextProfileId: session.contextProfileId || agentExploreForm.value.contextProfileId,
      thinkingMode: normalizedAgentExploreThinkingMode(session.thinkingMode || agentExploreForm.value.thinkingMode),
      temperature: Number(session.temperature || agentExploreForm.value.temperature || agentExploreConfiguredTemperature.value),
      maxTokens: Number(session.maxTokens || agentExploreForm.value.maxTokens || agentExploreConfiguredMaxTokens.value),
      maxIterations: session.maxIterations || agentExploreForm.value.maxIterations,
      limit: session.limit || agentExploreForm.value.limit,
      toolChoice: session.toolChoice || agentExploreForm.value.toolChoice || agentExploreConfiguredToolChoice.value,
      workspaceId: session.workspaceId,
    };
    const result = normalizeAgentExploreRun(
      await bridge.getKnowledgeAgentExploreRun(session.runId, {
        workspaceId: session.workspaceId,
      }),
    );
    agentExploreResult.value = result;
    upsertAgentExploreHistory(agentExploreSessionFromResult(result, session));
    if (["queued", "running"].includes(agentExploreRunStatus(result))) {
      startAgentExplorePolling(session.runId, session.workspaceId);
    }
    persistAgentExploreState();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "恢复智能检索会话失败。";
  } finally {
    if (busyKey.value === `knowledge:agent-explore:load:${session.runId}`) {
      clearAllBusy();
    }
  }
}

async function restoreAgentExploreState() {
  const persisted = readAgentExplorePersistence();
  const history = Array.isArray(persisted.history)
    ? (persisted.history as AgentExploreSession[]).filter((item: any) => item?.runId && item?.workspaceId)
    : [];
  const draftTabs = Array.isArray(persisted.draftTabs)
    ? (persisted.draftTabs as AgentExploreSession[]).filter((item: any) => isAgentExploreDraftSession(item))
    : [];
  agentExploreHiddenRunIds.value = new Set(
    Array.isArray(persisted.hiddenRunIds)
      ? persisted.hiddenRunIds.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
  );
  agentExploreClosedTabIds.value = new Set(
    Array.isArray(persisted.closedTabIds)
      ? persisted.closedTabIds.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
  );
  agentExploreDraftTabs.value = normalizeAgentExploreHistoryList(draftTabs);
  agentExploreHistory.value = normalizeAgentExploreHistoryList(history);
  if (!agentExploreHistory.value.length) {
    await loadAgentExploreHistoryFromServer();
  }
  const persistedForm = asRecord(persisted.form) || {};
  const persistedModelAlias = String(persistedForm.modelAlias || agentExploreForm.value.modelAlias || "");
  agentExploreForm.value = {
    query: String(persistedForm.query || agentExploreForm.value.query || ""),
    modelAlias: hasAgentModelOption(persistedModelAlias) ? persistedModelAlias : "",
    contextProfileId: String(persistedForm.contextProfileId || agentExploreForm.value.contextProfileId || "context-128k"),
    thinkingMode: normalizedAgentExploreThinkingMode(String(persistedForm.thinkingMode || agentExploreForm.value.thinkingMode || "default")),
    temperature: Number(persistedForm.temperature || agentExploreForm.value.temperature || agentExploreConfiguredTemperature.value),
    maxTokens: Number(persistedForm.maxTokens || agentExploreForm.value.maxTokens || agentExploreConfiguredMaxTokens.value),
    maxIterations: Number(persistedForm.maxIterations || agentExploreForm.value.maxIterations || 4),
    limit: Number(persistedForm.limit || agentExploreForm.value.limit || 8),
    toolChoice: String(persistedForm.toolChoice || agentExploreForm.value.toolChoice || agentExploreConfiguredToolChoice.value),
    workspaceId: String(persistedForm.workspaceId || persisted.activeWorkspaceId || agentExploreForm.value.workspaceId || ""),
  };
  agentExploreHydrated.value = true;
  if (!agentExploreTabs.value.length) {
    const draft = createAgentExploreDraftTab({
      query: agentExploreForm.value.query,
      modelAlias: agentExploreForm.value.modelAlias,
      contextProfileId: agentExploreForm.value.contextProfileId,
      thinkingMode: agentExploreForm.value.thinkingMode,
      temperature: agentExploreForm.value.temperature,
      maxTokens: agentExploreForm.value.maxTokens,
      maxIterations: agentExploreForm.value.maxIterations,
      limit: agentExploreForm.value.limit,
      toolChoice: agentExploreForm.value.toolChoice,
    });
    agentExploreDraftTabs.value = [draft];
    agentExploreActiveTabId.value = draft.runId;
    persistAgentExploreState();
    return;
  }
  const latestServerSession = agentExploreHistory.value[0];
  const persistedActiveTabId = String(persisted.activeTabId || persisted.activeRunId || latestServerSession?.runId || "").trim();
  const activeTabId = agentExploreClosedTabIds.value.has(persistedActiveTabId)
    ? ""
    : persistedActiveTabId;
  const activeDraft = activeTabId
    ? agentExploreDraftTabs.value.find((item) => item.runId === activeTabId)
    : null;
  if (activeDraft && !agentExploreHiddenRunIds.value.has(activeDraft.runId)) {
    applyAgentExploreDraftTab(activeDraft);
    return;
  }
  const activeRunId = activeTabId;
  const activeHistorySession = activeRunId
    ? agentExploreHistory.value.find((item) => item.runId === activeRunId)
    : null;
  const activeWorkspaceId = String(
    persisted.activeWorkspaceId ||
      activeHistorySession?.workspaceId ||
      agentExploreForm.value.workspaceId ||
      latestServerSession?.workspaceId ||
      "",
  ).trim();
  if (activeRunId && activeWorkspaceId && !agentExploreHiddenRunIds.value.has(activeRunId)) {
    const session =
      activeHistorySession || {
        runId: activeRunId,
        workspaceId: activeWorkspaceId,
        query: agentExploreForm.value.query,
        modelAlias: agentExploreForm.value.modelAlias,
        contextProfileId: agentExploreForm.value.contextProfileId,
        thinkingMode: agentExploreForm.value.thinkingMode,
        temperature: agentExploreForm.value.temperature,
        maxTokens: agentExploreForm.value.maxTokens,
        maxIterations: agentExploreForm.value.maxIterations,
        limit: agentExploreForm.value.limit,
        toolChoice: agentExploreForm.value.toolChoice,
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
      agentExploreResult.value = result;
      persistAgentExploreState();
      const status = agentExploreRunStatus(result);
      if (!["queued", "running"].includes(status)) {
        stopAgentExplorePolling();
        if (busyKey.value === "knowledge:agent-explore") {
          clearAllBusy();
        }
        if (result.ok === false && result.error) {
          error.value = result.error;
        }
      }
    } catch (nextError) {
      stopAgentExplorePolling();
      if (busyKey.value === "knowledge:agent-explore") {
        clearAllBusy();
      }
      error.value = nextError instanceof Error ? nextError.message : "智能检索状态刷新失败。";
    }
  };
  void poll();
  agentExplorePollTimer = window.setInterval(() => {
    void poll();
  }, 750);
}

function ruleAuthoringStatusLabel(status: unknown) {
  const value = String(status || "");
  if (value === "pending_human_confirmation") return "待人类确认";
  if (value === "no_rule_needed") return "未触发规则";
  if (value === "gate_failed") return "门禁未通过";
  if (value === "template_unavailable") return "模板不可用";
  if (value === "invalid_input") return "输入无效";
  if (value === "runtime_unavailable") return "运行时不可用";
  if (value === "published") return "已发布";
  return value || "未知";
}

async function runRuleAuthoringChat() {
  const message = ruleAuthoringEffectiveMessage.value.trim();
  if (!message) {
    error.value = "请输入规则生成需求。";
    return;
  }
  if (!canMaintainKnowledge.value) {
    error.value = "当前账号没有知识库维护权限。";
    return;
  }
  if (ruleCreationMode.value === "chat" && !selectedRuleAuthoringModel.value.enabled) {
    error.value = "请选择可用的创建规则智能体。";
    return;
  }
  setBusy("knowledge:rule-authoring");
  error.value = "";
  try {
    const result = await bridge.chatKnowledgeRuleAuthoring({
      message,
      draft: ruleAuthoringDraftPayload.value,
      modelAlias: ruleCreationMode.value === "chat" ? selectedRuleAuthoringModel.value.value : "",
      modelEnabled: ruleCreationMode.value === "chat",
    });
    ruleAuthoringResult.value = result;
    ruleAuthoringHistory.value = [
      result,
      ...ruleAuthoringHistory.value.filter((item: any) => item.runId !== result.runId),
    ].slice(0, 8);
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "规则生成失败。";
  } finally {
    clearAllBusy();
  }
}

async function publishRuleAuthoringPackage() {
  const confirmation = ruleAuthoringResult.value?.confirmation;
  if (!confirmation?.packageId) {
    error.value = "没有可确认发布的规则包。";
    return;
  }
  if (!canMaintainKnowledge.value) {
    error.value = "当前账号没有知识库维护权限。";
    return;
  }
  setBusy("knowledge:rule-authoring:publish");
  error.value = "";
  try {
    const result = await bridge.publishGoldenRules(confirmation.packageId, {
      version: confirmation.version,
    });
    ruleAuthoringResult.value = {
      ...(ruleAuthoringResult.value || {
        protocolVersion: "pact.knowledge-rule-authoring.v1",
        ok: true,
        status: "published",
      }),
      status: "published",
      package: asRecord(result.package) || ruleAuthoringResult.value?.package,
      manifest: asRecord(result.manifest) || ruleAuthoringResult.value?.manifest,
    };
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "规则发布失败。";
  } finally {
    clearAllBusy();
  }
}

async function runKnowledgeAgentExplore() {
  const query = agentExploreForm.value.query.trim();
  if (!query) {
    error.value = "请输入智能检索问题。";
    return;
  }
  if (!canReadKnowledge.value) {
    error.value = "当前账号没有知识库读取权限。";
    return;
  }
  if (!selectedAgentExploreModel.value.enabled) {
    error.value = "请选择模型库中已配置且支持智能检索工具调用的模型。";
    return;
  }
  const maxIterations = boundedAgentExploreNumber(
    agentExploreForm.value.maxIterations,
    agentExploreConfiguredMaxIterations.value,
    1,
    8,
  );
  const limit = boundedAgentExploreNumber(
    agentExploreForm.value.limit,
    agentExploreConfiguredLimit.value,
    1,
    20,
  );
  const temperature = boundedAgentExploreNumber(
    agentExploreForm.value.temperature,
    agentExploreConfiguredTemperature.value,
    0,
    2,
  );
  const maxTokens = boundedAgentExploreNumber(
    agentExploreForm.value.maxTokens,
    agentExploreConfiguredMaxTokens.value,
    128,
    32000,
  );
  const toolChoice = String(agentExploreForm.value.toolChoice || agentExploreConfiguredToolChoice.value || "auto").trim() || "auto";
  agentExploreForm.value.maxIterations = maxIterations;
  agentExploreForm.value.limit = limit;
  agentExploreForm.value.temperature = temperature;
  agentExploreForm.value.maxTokens = maxTokens;
  agentExploreForm.value.toolChoice = toolChoice;
  agentExploreForm.value.contextProfileId = selectedAgentExploreContextProfile.value.value;
  agentExploreForm.value.thinkingMode = selectedAgentExploreThinkingMode.value;
  agentExploreTraceOpen.value = true;
  setBusy("knowledge:agent-explore");
  error.value = "";
  currentView.value = "debug";
  debugTab.value = "agentRetrieval";
  agentExploreResult.value = null;
  const draftRunId = agentExploreActiveTabId.value.startsWith("draft:")
    ? agentExploreActiveTabId.value
    : "";
  stopAgentExplorePolling();
  try {
    const result = normalizeAgentExploreRun(await bridge.runKnowledgeAgentExplore({
      query,
      modelAlias: selectedAgentExploreModel.value.value,
      contextProfileId: selectedAgentExploreContextProfile.value.value,
      thinkingMode: selectedAgentExploreThinkingMode.value,
      temperature,
      maxTokens,
      maxIterations,
      limit,
      toolChoice,
      workspaceId: agentExploreForm.value.workspaceId || undefined,
      async: true,
      realtime: true,
    }));
    agentExploreResult.value = result;
    const runId = String(asRecord(result.run)?.runId || "");
    const workspaceId = String(result.workspace?.workspaceId || "");
    if (workspaceId) {
      agentExploreForm.value.workspaceId = workspaceId;
    }
    if (runId) {
      agentExploreActiveTabId.value = runId;
      if (draftRunId) {
        agentExploreDraftTabs.value = normalizeAgentExploreHistoryList(
          agentExploreDraftTabs.value.filter((item: any) => item.runId !== draftRunId),
        );
      }
    }
    persistAgentExploreState();
    if (runId && workspaceId && ["queued", "running"].includes(agentExploreRunStatus(result))) {
      startAgentExplorePolling(runId, workspaceId);
      return;
    }
    if (result.ok === false && result.error) {
      error.value = result.error;
    }
    clearAllBusy();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "智能检索失败。";
    clearAllBusy();
  }
}

function resetKnowledgeAgentExplore() {
  stopAgentExplorePolling();
  agentExploreTraceOpen.value = true;
  const draft = createAgentExploreDraftTab({
    modelAlias: agentExploreForm.value.modelAlias,
    contextProfileId: selectedAgentExploreContextProfile.value.value,
    thinkingMode: selectedAgentExploreThinkingMode.value,
    temperature: agentExploreForm.value.temperature,
    maxTokens: agentExploreForm.value.maxTokens,
    maxIterations: agentExploreForm.value.maxIterations,
    limit: agentExploreForm.value.limit,
    toolChoice: agentExploreForm.value.toolChoice,
  });
  agentExploreDraftTabs.value = normalizeAgentExploreHistoryList([
    draft,
    ...agentExploreDraftTabs.value,
  ]);
  agentExploreActiveTabId.value = draft.runId;
  agentExploreResult.value = null;
  agentExploreForm.value = {
    query: "",
    modelAlias: draft.modelAlias,
    contextProfileId: draft.contextProfileId,
    thinkingMode: draft.thinkingMode,
    temperature: draft.temperature,
    maxTokens: draft.maxTokens,
    maxIterations: draft.maxIterations,
    limit: draft.limit,
    toolChoice: draft.toolChoice,
    workspaceId: "",
  };
  persistAgentExploreState();
  if (busyKey.value === "knowledge:agent-explore") {
    clearAllBusy();
  }
}

async function openKnowledgeSearchResult(item: KnowledgeSearchResult) {
  const evidenceId = knowledgeResultEvidenceId(item);
  if (!evidenceId) {
    error.value = "这个检索结果没有可打开的 evidenceId。";
    return;
  }
  await loadEvidence(evidenceId);
}

type LoadEvidenceOptions = {
  revealKnowledgeSearch?: boolean;
};

async function loadEvidence(evidenceId: string, options: LoadEvidenceOptions = {}) {
  const normalized = String(evidenceId || "").trim();
  if (!normalized) {
    return;
  }
  const sequence = evidenceLoadSequence + 1;
  evidenceLoadSequence = sequence;
  const requestBusyKey = `knowledge:evidence:${normalized}`;
  setBusy(requestBusyKey);
  selectedEvidenceId.value = normalized;
  selectedEvidence.value = null;
  evidenceLoadError.value = "";
  error.value = "";
  try {
    const evidence = await bridge.getKnowledgeEvidence(normalized);
    if (sequence !== evidenceLoadSequence) {
      return;
    }
    if (!evidence || typeof evidence !== "object") {
      throw new Error("服务端没有返回可展示的证据内容。");
    }
    selectedEvidence.value = evidence;
    selectedEvidenceId.value = String(evidence.evidenceId || normalized);
    hydrateSearchResultPreview(evidence);
    if (options.revealKnowledgeSearch !== false) {
      openDebugTab("knowledgeRecall");
    }
  } catch (nextError) {
    if (sequence !== evidenceLoadSequence) {
      return;
    }
    const message = nextError instanceof Error ? nextError.message : "加载证据包失败。";
    evidenceLoadError.value = message;
    error.value = message;
  } finally {
    if (sequence === evidenceLoadSequence && busyKey.value === requestBusyKey) {
      clearAllBusy();
    }
  }
}

async function openAgentEvidencePreview(evidenceId: string) {
  const normalized = String(evidenceId || "").trim();
  if (!normalized) {
    return;
  }
  agentEvidencePreviewOpen.value = true;
  selectedEvidenceId.value = normalized;
  selectedEvidence.value = null;
  evidenceLoadError.value = "";
  await loadEvidence(normalized, { revealKnowledgeSearch: false });
  recordConsoleKnowledgeFeedback("open", {
    surface: "evidence_preview",
    evidenceId: normalized,
    query: currentAgentExploreQuery() || infoFeedCurrentRun.value?.query || "",
    contextBuildRecordId: String(asRecord(agentExploreResult.value?.contextPack)?.contextBuildRecordId || ""),
  });
}

function closeAgentEvidencePreview() {
  agentEvidencePreviewOpen.value = false;
}

function handleAgentAnswerClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest?.("a") as HTMLAnchorElement | null;
  const href = anchor?.getAttribute("href") || "";
  const evidenceId = evidenceIdFromHref(href);
  if (!evidenceId) {
    return;
  }
  event.preventDefault();
  void openAgentEvidencePreview(evidenceId);
}

async function saveKnowledgeMaintenance() {
  setBusy("knowledge:maintenance");
  error.value = "";
  try {
    const parsed = JSON.parse(maintenanceJson.value || "{}") as MaintenanceSettings;
    knowledgeMaintenanceDraft.value = parsed;
    const result = await bridge.saveKnowledgeMaintenance(parsed);
    knowledgeMaintenanceDraft.value = result;
    maintenanceJson.value = jsonPreview(result);
    await refreshKnowledgeConsole();
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存知识库维护参数失败。";
  } finally {
    clearAllBusy();
  }
}

async function runKnowledgeMaintenanceTask() {
  setBusy("knowledge:maintenance:run");
  error.value = "";
  try {
    const result =
      selectedMaintenanceTask.value === "reindex"
        ? await bridge.reindexKnowledge({ confirm: maintenanceConfirm.value })
        : await bridge.runKnowledgeMaintenance({
            taskType: selectedMaintenanceTask.value,
            confirm: maintenanceConfirm.value,
            ...(currentMaintenanceTaskSupportsDryRun.value ? { dryRun: maintenanceDryRun.value } : {}),
          });
    maintenanceResultJson.value = jsonPreview(result);
    maintenanceConfirm.value = false;
    await refreshKnowledgeConsole();
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "执行知识库维护任务失败。";
  } finally {
    clearAllBusy();
  }
}

function onIngestFilesSelected(files: File[]) {
  ingestFiles.value = files;
  ingestProgress.value = ingestFiles.value.length
    ? `已选择 ${ingestFiles.value.length} 个文件`
    : "";
}

async function sha256File(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Text(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function uploadFilesToKnowledge() {
  if (ingestFiles.value.length === 0) {
    error.value = "请先选择需要入库的文件。";
    return;
  }
  setBusy("knowledge:ingest");
  error.value = "";
  ingestProgress.value = "准备上传会话…";
  ingestJob.value = null;
  normalizedManifest.value = null;
  try {
    const fileDigests = await Promise.all(
      ingestFiles.value.map(async (file) => ({
        name: file.name,
        relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
        mediaType: file.type || "application/octet-stream",
        byteSize: file.size,
        sha256: await sha256File(file),
      })),
    );
    const totalBytes = ingestFiles.value.reduce((sum, file) => sum + file.size, 0);
    const manifestDigest = await sha256Text(
      JSON.stringify(fileDigests.map((file) => [file.relativePath, file.sha256, file.byteSize])),
    );
    const inputDigest = await sha256Text("");
    const checkpointId = `knowledge-console:${manifestDigest}`;
    const session = await bridge.createUploadSession({
      manifest: {
        manifestDigest,
        inputDigest,
        fileCount: ingestFiles.value.length,
        totalBytes,
        fileRecords: fileDigests.map((file) => ({
          label: file.name,
          relativePath: file.relativePath,
          sha256: file.sha256,
          byteSize: file.byteSize,
        })),
      },
      files: fileDigests,
      checkpoint: {
        checkpointId,
        parentCheckpointId: "",
        mode: "server-console",
        source: "knowledge-console",
        inputDigest,
        manifestDigest,
      },
    });
    const chunkSize = 1024 * 1024;
    let uploadedBytes = (session.files || []).reduce(
      (sum, file) => sum + Math.min(Number(file.receivedBytes || 0), Number(file.byteSize || 0)),
      0,
    );
    for (let fileIndex = 0; fileIndex < ingestFiles.value.length; fileIndex += 1) {
      const file = ingestFiles.value[fileIndex];
      const sessionFile = (session.files || []).find((item) => Number(item.index ?? item.fileIndex) === fileIndex);
      let offset = Math.min(Number(sessionFile?.receivedBytes || 0), file.size);
      while (offset < file.size) {
        const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
        await bridge.uploadSessionChunk(session.sessionId, fileIndex, offset, chunk);
        offset += chunk.size;
        uploadedBytes += chunk.size;
        ingestProgress.value = `上传中 ${Math.round((uploadedBytes / totalBytes) * 100)}%`;
      }
    }
    ingestProgress.value = "创建入库任务…";
    const job = await bridge.createJob({
      inputText: "",
      filePaths: [],
      uploadedFiles: [],
      uploadSessionId: session.sessionId,
      settings: settingsDraft.value,
    });
    ingestJob.value = job;
    ingestProgress.value = "已进入处理队列，进度会在下方实时更新。";
    await refreshState({ silent: true });
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "上传入库失败。";
  } finally {
    clearAllBusy();
  }
}

async function refreshIngestJob(options: { silent?: boolean } = {}) {
  if (!ingestJob.value?.id) {
    return;
  }
  if (!options.silent) {
    setBusy(`knowledge:ingest:${ingestJob.value.id}`);
  }
  error.value = "";
  try {
    const job = await bridge.getJob(ingestJob.value.id);
    ingestJob.value = job;
    if (job?.status === "completed") {
      normalizedManifest.value = (await bridge.getNormalizedDocuments(job.id)) || null;
      ingestProgress.value = "处理完成，生成的知识文档可以下载查看。";
      await refreshKnowledgeConsole();
    }
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "刷新入库任务失败。";
  } finally {
    if (!options.silent) {
      clearAllBusy();
    }
  }
}

function applyKnowledgeSourceState(state: KnowledgeSourceState | null | undefined) {
  if (!state) {
    return;
  }
  knowledgeSourceState.value = state;
  if (knowledgeConsole.value) {
    knowledgeConsole.value = {
      ...knowledgeConsole.value,
      sources: state,
    };
  }
}

async function refreshKnowledgeSources() {
  setBusy("knowledge:sources");
  error.value = "";
  try {
    applyKnowledgeSourceState(await bridge.getKnowledgeSources());
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "刷新目录失败。";
  } finally {
    clearAllBusy();
  }
}

async function addKnowledgeSource() {
  const directoryPath = localSourceForm.value.directoryPath.trim();
  if (!directoryPath) {
    error.value = "请填写服务端本地路径。";
    return;
  }
  setBusy("knowledge:sources:add");
  error.value = "";
  try {
    const result = await bridge.createKnowledgeSource({
      label: localSourceForm.value.label.trim() || directoryNameFromPath(directoryPath),
      directoryPath,
      autoSync: localSourceForm.value.autoSync,
      recursive: localSourceForm.value.recursive,
      hydrationEnabled: localSourceForm.value.hydrationEnabled,
      enabled: true,
      runNow: true,
    });
    applyKnowledgeSourceState(result.state);
    if (result.job) {
      ingestJob.value = result.job;
    }
    localSourceForm.value = {
      label: "",
      directoryPath: "",
      autoSync: true,
      recursive: true,
      hydrationEnabled: true,
    };
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "添加目录失败。";
  } finally {
    clearAllBusy();
  }
}

async function updateKnowledgeSource(source: KnowledgeSource, patch: Record<string, unknown>) {
  setBusy(`knowledge:source:${source.sourceId}`);
  error.value = "";
  try {
    const result = await bridge.updateKnowledgeSource(source.sourceId, patch);
    applyKnowledgeSourceState(result.state);
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "更新目录失败。";
  } finally {
    clearAllBusy();
  }
}

async function refreshKnowledgeSource(source: KnowledgeSource, force = false) {
  setBusy(`knowledge:source:refresh:${source.sourceId}`);
  error.value = "";
  try {
    const result = await bridge.refreshKnowledgeSource(source.sourceId, { force });
    applyKnowledgeSourceState(result.state);
    if (result.job) {
      ingestJob.value = result.job;
    }
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "刷新目录失败。";
  } finally {
    clearAllBusy();
  }
}

async function deleteKnowledgeSource(source: KnowledgeSource) {
  setBusy(`knowledge:source:delete:${source.sourceId}`);
  error.value = "";
  try {
    const result = await bridge.deleteKnowledgeSource(source.sourceId);
    applyKnowledgeSourceState(result.state);
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "删除目录失败。";
  } finally {
    clearAllBusy();
  }
}

function ensureKnowledgeTabState() {
  if (!knowledgeTab.value) {
    knowledgeTab.value = "management";
    knowledgeManagementPanel.value = "knowledge";
    return;
  }
  if (knowledgeTab.value === "management") {
    if (knowledgeManagementPanel.value !== "knowledge" && knowledgeManagementPanel.value !== "rules") {
      knowledgeManagementPanel.value = "knowledge";
    }
    return;
  }
  if (!visibleKnowledgeTabs.value.some((item) => item.id === knowledgeTab.value)) {
    knowledgeTab.value = "management";
    knowledgeManagementPanel.value = "knowledge";
  }
}

function switchView(view: AppView) {
  if (view === "knowledge" && !hasFeature("knowledge-core")) {
    currentView.value = "dashboard";
    _appRouter?.push("/");
    return;
  }
  if (view === "intelligence" && !hasFeature("agent-exploration")) {
    currentView.value = "dashboard";
    _appRouter?.push("/");
    return;
  }
  if (view === "debug" && visibleDebugTabs.value.length === 0) {
    currentView.value = "dashboard";
    _appRouter?.push("/");
    return;
  }
  if (view === "debug" && !visibleDebugTabs.value.some((item) => item.id === debugTab.value)) {
    debugTab.value = visibleDebugTabs.value[0]?.id || "knowledgeRecall";
  }
  if (view === "knowledge") {
    ensureKnowledgeTabState();
  }
  currentView.value = view;
  _appRouter?.push(
    viewToPath(view, {
      tab: view === "knowledge" ? knowledgeTab.value : view === "debug" ? debugTab.value : undefined,
      adminSection: view === "admin" ? adminView.value : undefined,
    })
  );
  if (view === "dashboard") {
    void refreshDashboardAlertsSnapshot({ silent: true });
  }
  if (view === "knowledge") {
    void refreshKnowledgeConsole();
    if (knowledgeTab.value === "wordCloud") {
      void refreshWordCloud({ silent: true });
    }
    if (knowledgeTab.value === "management" && knowledgeManagementPanel.value === "rules") {
      void refreshExpertRules();
    }
  }
  if (view === "debug") {
    void refreshKnowledgeConsole();
  }
  if (view === "admin") {
    void refreshAuthAdmin();
    if (adminView.value === "tools" || adminView.value === "agentPermissions") {
      void refreshToolManagement({ silent: true });
    }
    if (adminView.value === "agentPermissions") {
      ensureAgentPermissionGroupsDraft();
    }
    if (adminView.value === "maintenanceAgent") {
      void refreshMaintenanceAgent();
    }
    if (adminView.value === "jobs") {
      void refreshState({ silent: true });
      void refreshMaintenanceAgent({ silent: true });
      void refreshBackgroundProcesses({ silent: true });
      void refreshMonitorAlerts({ silent: true });
    }
    if (adminView.value === "opsMonitor") {
      void refreshBackgroundProcesses({ silent: true });
      void refreshClientRuntimeStatus({ silent: true });
      void refreshMonitorAlerts({ silent: true });
    }
    if (adminView.value === "logs") {
      refreshSystemStatusLogs();
    }
  }
}

function openDebugTab(tab: DebugTab) {
  if (!visibleDebugTabs.value.some((item) => item.id === tab)) {
    return;
  }
  debugTab.value = tab;
  currentView.value = "debug";
  _appRouter?.push(`/debug/${tab}`);
  void refreshKnowledgeConsole();
}

function openKnowledgeTab(tab: KnowledgeTab) {
  if (!visibleKnowledgeTabs.value.some((item) => item.id === tab)) {
    return;
  }
  knowledgeTab.value = tab;
  currentView.value = "knowledge";
  _appRouter?.push(`/knowledge/${tab}`);
  if (tab === "conflicts") {
    void refreshKnowledgeConflicts();
  }
  if (tab === "wordCloud") {
    void refreshWordCloud();
  }
  if (tab === "management" && knowledgeManagementPanel.value === "rules") {
    void refreshExpertRules();
  }
}

function refreshSystemStatusLogs() {
  void refreshState({ silent: true });
  if (hasFeature("knowledge-core")) {
    void refreshKnowledgeConsole();
  }
  if (hasFeature("maintenance-agent-runbooks")) {
    void refreshMaintenanceAgent({ silent: true });
  }
  if (hasFeature("agent-gateway") || hasFeature("agent-management")) {
    void refreshToolManagement({ silent: true });
  }
  void refreshBackgroundProcesses({ silent: true });
  void refreshMonitorAlerts({ silent: true });
  void refreshAuthAdmin();
}

async function jumpToKnowledgeFileImport() {
  error.value = "";
  knowledgeTab.value = "management";
  knowledgeManagementPanel.value = "knowledge";
  switchView("knowledge");
  await nextTick();
  document
    .getElementById("knowledge-file-import")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openAdmin(tab: AdminView) {
  if (!isAdminViewEnabled(tab)) {
    tab = "jobs";
  }
  adminView.value = tab;
  currentView.value = "admin";
  _appRouter?.push(`/admin/${adminSectionToSlug(tab)}`);
  void refreshAuthAdmin();
  if (tab === "tools" || tab === "agentPermissions") {
    void refreshToolManagement().then(() => {
      if (tab === "agentPermissions") {
        ensureAgentPermissionGroupsDraft();
      }
    });
  }
  if (tab === "agentManagement") {
    void refreshState({ silent: true });
  }
  if (tab === "maintenanceAgent") {
    void refreshMaintenanceAgent();
  }
  if (tab === "jobs") {
    void refreshState({ silent: true });
    void refreshMaintenanceAgent({ silent: true });
    void refreshMonitorAlerts({ silent: true });
  }
  if (tab === "opsMonitor") {
    void refreshBackgroundProcesses({ silent: true });
    void refreshClientRuntimeStatus({ silent: true });
    void refreshMonitorAlerts({ silent: true });
  }
  if (tab === "logs") {
    refreshSystemStatusLogs();
  }
}

function isAdminViewEnabled(tab: AdminView) {
  switch (tab) {
    case "agentManagement":
      return hasFeature("agent-management");
    case "tools":
      return hasFeature("agent-gateway") || hasFeature("agent-management");
    case "agentPermissions":
      return hasFeature("agent-management");
    case "agentConfig":
      return hasFeature("agent-gateway");
    case "maintenanceAgent":
      return hasFeature("maintenance-agent-runbooks");
    case "modules":
      return hasFeature("analysis-runtime");
    default:
      return true;
  }
}

function configTargetElement(targetId: string) {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-config-target]"))
    .find((element) => element.dataset.configTarget === targetId) || null;
}

async function scrollToConfigTarget(targetId: string) {
  highlightedConfigTarget.value = targetId;
  await nextTick();
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
  const target = configTargetElement(targetId);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    const focusTarget = target.matches("button,input,textarea,[tabindex]")
      ? target
      : target.querySelector<HTMLElement>("button,input,textarea,[tabindex]");
    focusTarget?.focus?.({ preventScroll: true });
  }
  if (configTargetHighlightTimer) {
    window.clearTimeout(configTargetHighlightTimer);
  }
  configTargetHighlightTimer = window.setTimeout(() => {
    if (highlightedConfigTarget.value === targetId) {
      highlightedConfigTarget.value = "";
    }
  }, 2400);
}

async function openAgentConfigurationAlert(alertItem: AgentConfigurationAlert) {
  if (alertItem.view === "admin") {
    openAdmin(alertItem.adminView || "agentConfig");
  } else {
    switchView(alertItem.view);
  }
  await scrollToConfigTarget(alertItem.targetId);
}

async function acknowledgeMonitorAlert(alertId: string) {
  if (!canAdminMaintenanceAgent.value) {
    error.value = "当前账号没有维护配置权限。";
    return;
  }
  setBusy(`monitor-alert:ack:${alertId}`);
  error.value = "";
  try {
    const state = await bridge.acknowledgeMonitorAlert(alertId);
    monitorAlertState.value = state;
    monitorAlertConfigText.value = jsonPreview(state.config);
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "确认报警失败。";
  } finally {
    clearAllBusy();
  }
}

async function openDashboardAlert(alertItem: DashboardAlert) {
  if (alertItem.source === "configuration" && alertItem.configAlert) {
    await openAgentConfigurationAlert(alertItem.configAlert);
    return;
  }
  openAdmin("opsMonitor");
  await refreshMonitorAlerts({ silent: true });
}

async function dismissDashboardAlert(alertItem: DashboardAlert) {
  const inboxId = dashboardAlertInboxId(alertItem);
  const monitorAlert = alertItem.monitorAlert;
  if (
    alertItem.source === "monitor" &&
    monitorAlert &&
    (monitorAlert.ackRequired || monitorAlert.active === false || monitorAlert.status === "recovered")
  ) {
    await acknowledgeMonitorAlert(alertItem.alertId);
    if (error.value) {
      return;
    }
  }
  dismissedDashboardAlertIds.value = new Set([
    ...dismissedDashboardAlertIds.value,
    inboxId,
  ]);
  const nextInbox = { ...dashboardAlertInbox.value };
  delete nextInbox[inboxId];
  dashboardAlertInbox.value = nextInbox;
}

function scopeLabel(scopeId: string) {
  return (
    toolScopes.value.find((scope) => scope.id === scopeId)?.label || scopeId
  );
}

function toolRiskLabel(risk: string) {
  return maintenanceAgentRiskLabel(risk);
}

function toolStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "可执行",
    internal: "内部运行时",
    disabled: "停用",
    deprecated: "兼容中",
  };
  return labels[status] || status || "未知";
}

function toolsetLabel(toolsetId: string) {
  return toolManagementToolsets.value.find((toolset) => toolset.id === toolsetId)?.label || toolsetId;
}

function profileLabel(profileId: string) {
  return toolManagementProfiles.value.find((profile) => profile.id === profileId)?.label || profileId;
}

function previewToolDefinition() {
  return toolManagementTools.value.find((tool) => tool.id === policyPreviewToolId.value) || null;
}

function ensureAgentPermissionGroupsDraft() {
  if (settingsDraft.value.agentPermissionGroups?.length) {
    settingsDraft.value.agentPermissionGroups = agentPermissionGroups.value;
    return;
  }
  settingsDraft.value.agentPermissionGroups = defaultAgentPermissionGroups.value.map((group, index) =>
    normalizeAgentPermissionGroupDraft(group, index),
  );
}

function addAgentPermissionGroup() {
  ensureAgentPermissionGroupsDraft();
  const group = normalizeAgentPermissionGroupDraft(
    {
      id: `agent-permission-custom-${Date.now()}`,
      label: "自定义权限组",
      description: "按权限层级和工具明细定义智能体可调用范围。",
      enabled: true,
      scopeIds: [],
      toolsetIds: [],
      toolAllow: [],
      toolDeny: [],
    },
    settingsDraft.value.agentPermissionGroups.length,
  );
  settingsDraft.value.agentPermissionGroups = [group, ...settingsDraft.value.agentPermissionGroups];
}

function removeAgentPermissionGroup(group: AgentPermissionGroup) {
  if (!window.confirm(`删除权限组“${group.label || group.id}”？`)) {
    return;
  }
  settingsDraft.value.agentPermissionGroups = agentPermissionGroups.value.filter((item: any) => item.id !== group.id);
  for (const entry of visibleModelEntries.value) {
    if (entry.permissionGroupId === group.id) {
      entry.permissionGroupId = "";
    }
  }
}

function permissionGroupLabel(groupId?: string) {
  const normalized = String(groupId || "").trim();
  if (!normalized) {
    return "未分配";
  }
  return agentPermissionGroups.value.find((group) => group.id === normalized)?.label || normalized;
}

function setModelEntryPermissionGroup(entry: AgentModelConfig, groupId: string) {
  entry.permissionGroupId = String(groupId || "").trim();
}

function permissionGroupHasScope(group: AgentPermissionGroup, scopeId: string) {
  return group.scopeIds.includes(scopeId);
}

function permissionGroupHasToolset(group: AgentPermissionGroup, toolsetId: string) {
  return group.toolsetIds.includes(toolsetId);
}

function togglePermissionGroupScope(group: AgentPermissionGroup, scopeId: string) {
  const next = new Set(group.scopeIds || []);
  if (next.has(scopeId)) {
    next.delete(scopeId);
  } else {
    next.add(scopeId);
  }
  group.scopeIds = [...next];
}

function togglePermissionGroupToolset(group: AgentPermissionGroup, toolsetId: string) {
  const next = new Set(group.toolsetIds || []);
  if (next.has(toolsetId)) {
    next.delete(toolsetId);
  } else {
    next.add(toolsetId);
  }
  group.toolsetIds = [...next];
}

function selectToolForManagement(toolId: string) {
  selectedToolManagementToolId.value = toolId;
  policyPreviewToolId.value = toolId;
}

function grantToolRuleState(grant: ToolManagementGrant, toolId: string) {
  if ((grant.toolDeny || []).includes(toolId)) {
    return "deny";
  }
  if ((grant.toolAllow || []).includes(toolId)) {
    return "allow";
  }
  return "inherit";
}

async function setGrantToolRule(grant: ToolManagementGrant, toolId: string, rule: "inherit" | "allow" | "deny") {
  const allow = new Set(grant.toolAllow || []);
  const deny = new Set(grant.toolDeny || []);
  allow.delete(toolId);
  deny.delete(toolId);
  if (rule === "allow") {
    allow.add(toolId);
  }
  if (rule === "deny") {
    deny.add(toolId);
  }
  await updateGrant(grant, {
    toolAllow: [...allow],
    toolDeny: [...deny],
  });
}

function policyPreviewGrant() {
  const tool = previewToolDefinition();
  return {
    id: "console-preview-grant",
    label: "Console preview grant",
    enabled: true,
    scopes: tool?.requiredScopes || [],
    toolsets: tool?.toolsets || [],
    toolAllow: [],
    toolDeny: [],
    metadata: {},
  };
}

function toggleNewGrantScope(scopeId: string) {
  const current = new Set(newGrantScopes.value);
  if (current.has(scopeId)) {
    current.delete(scopeId);
  } else {
    current.add(scopeId);
  }
  newGrantScopes.value = [...current];
}

function toggleNewGrantToolset(toolsetId: string) {
  const current = new Set(newGrantToolsets.value);
  if (current.has(toolsetId)) {
    current.delete(toolsetId);
  } else {
    current.add(toolsetId);
  }
  newGrantToolsets.value = [...current];
}

function grantHasScope(grant: ToolManagementGrant, scopeId: string) {
  return grant.scopes.includes(scopeId);
}

function grantHasToolset(grant: ToolManagementGrant, toolsetId: string) {
  return (grant.toolsets || []).includes(toolsetId);
}

function importClients() {
  alert("导入客户端功能正在开发中…");
}

function exportClients() {
  alert("导出设备管理列表成功。");
}

async function requestClientMigration(client: NonNullable<ServerConsoleState["clients"]["items"][number]>) {
  const clientId = String(client.clientId || "").trim();
  if (!clientId) {
    error.value = "缺少客户端 ID，无法发布迁移指令。";
    return;
  }

  setBusy(`client:migration:${clientId}`);
  error.value = "";
  try {
    const result = await bridge.requestClientMigration(clientId, {
      reason: "console",
    });
    clientMigrationMessages.value = {
      ...clientMigrationMessages.value,
      [clientId]: `已发布迁移指令：${result.command.configVersion || "无版本号"} / ${formatCompactDate(result.command.requestedAt)}`,
    };
    await refreshState({ silent: true });
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "发布客户端迁移指令失败。";
  } finally {
    clearAllBusy();
  }
}

function parseTime(value?: string) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatDate(value: string) {
  if (!value) {
    return "未记录";
  }

  try {
    return new Date(value).toLocaleString("zh-CN", {
      hour12: false,
    });
  } catch {
    return value;
  }
}

function formatCompactDate(value: string) {
  if (!value) {
    return "未记录";
  }

  try {
    return new Date(value).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return value;
  }
}

function formatDuration(start?: string, end?: string) {
  const startedAt = parseTime(start);
  const endedAt = parseTime(end) || Date.now();

  if (!startedAt || endedAt <= startedAt) {
    return "--";
  }

  let totalSeconds = Math.floor((endedAt - startedAt) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  totalSeconds -= days * 86400;
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds -= hours * 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function jobStatusTone(status: SplitJobStatus) {
  return status;
}

function queueLifecycleTone(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (["interrupted", "failed", "missing"].includes(normalized)) {
    return "danger";
  }
  if (["recovered", "closed", "completed", "completed_with_errors"].includes(normalized)) {
    return "success";
  }
  if (["running", "open"].includes(normalized)) {
    return "running";
  }
  if (["queued", "awaiting_approval", "standby"].includes(normalized)) {
    return "queued";
  }
  return "neutral";
}

function queueLifecycleLabel(status: string) {
  const labels: Record<string, string> = {
    open: "运行中",
    queued: "排队中",
    running: "运行中",
    awaiting_approval: "待审批",
    interrupted: "已中断",
    recovered: "已恢复",
    closed: "已关闭",
    completed: "已完成",
    completed_with_errors: "有错误",
    failed: "失败",
    cancelled: "已取消",
    rejected: "已拒绝",
  };
  return labels[String(status || "").toLowerCase()] || status || "未知";
}

function queueSourceLabel(source: string) {
  const labels: Record<string, string> = {
    "function-self-check": "功能自检",
    watchdog: "守护进程巡检",
    "watchdog-reconcile": "守护进程补录",
    "queue-monitor": "队列监控",
  };
  return labels[String(source || "")] || source || "队列监控";
}

function queueMonitorDetail(item: QueueMonitorItem) {
  return [
    item.interruptedReason ? `中断原因 ${item.interruptedReason}` : "",
    item.recoveryStatus ? `恢复状态 ${item.recoveryStatus}` : "",
    item.metadata?.stage ? `阶段 ${String(item.metadata.stage)}` : "",
    item.checkpointTreeId ? `checkpoint ${item.checkpointTreeId}` : "",
  ].filter(Boolean).join(" · ") || item.kind || "队列";
}

function maintenanceAgentStatusTone(status: string) {
  if (status === "awaiting_approval" || status === "queued") {
    return "queued";
  }
  if (status === "running") {
    return "running";
  }
  if (status === "completed") {
    return "completed";
  }
  if (status === "completed_with_errors") {
    return "queued";
  }
  return "failed";
}

function maintenanceAgentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    awaiting_approval: "待审批",
    queued: "排队",
    running: "运行中",
    completed: "已完成",
    completed_with_errors: "有错误",
    failed: "失败",
    cancelled: "已取消",
    rejected: "已拒绝",
  };
  return labels[status] || status || "未知";
}

function backgroundProcessTone(status: string) {
  if (status === "running") {
    return "running";
  }
  if (status === "standby") {
    return "queued";
  }
  if (status === "starting") {
    return "queued";
  }
  if (status === "degraded" || status === "stale") {
    return "warning";
  }
  return "failed";
}

function backgroundProcessLabel(status: string) {
  const labels: Record<string, string> = {
    running: "运行中",
    standby: "待接管",
    starting: "启动中",
    degraded: "降级",
    stale: "心跳超时",
    stopped: "已停止",
    exited: "已退出",
    failed: "失败",
    missing: "缺失",
  };
  return labels[status] || status || "未知";
}

function processTypeLabel(processType?: string) {
  return processType === "daemon" ? "守护进程" : "服务进程";
}

function processRelationText(processItem: BackgroundProcessStatus["processes"][number]) {
  const services = processItem.services?.length
    ? `服务：${processItem.services.join(" / ")}`
    : "";
  const monitors = processItem.monitors?.length
    ? `监控：${processItem.monitors.join(" / ")}`
    : "";
  const alerts = processItem.alerts?.length
    ? `报警：${processItem.alerts.join(" / ")}`
    : "";
  return [services, monitors, alerts].filter(Boolean).join("；") || processItem.description || "无关联说明";
}

function clientRuntimeCoolingTone(state: string) {
  if (state === "hot") {
    return "running";
  }
  if (state === "cooled") {
    return "warning";
  }
  return "info";
}

function clientRuntimeCoolingLabel(state: string) {
  const labels: Record<string, string> = {
    hot: "热连接",
    warm: "正常",
    cooled: "已冷却",
  };
  return labels[state] || state || "未知";
}

function clientRuntimeReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    "new-client": "新客户端",
    normal: "正常分配",
    "frequent-client": "高频使用",
    "outside-warm-client-limit": "超出保温上限",
    "least-recently-used-and-low-frequency": "最旧且低频",
  };
  return labels[reason] || reason || "无冷却原因";
}

function clientRuntimeTaskText(row: ClientRuntimeHeatRow) {
  return row.taskTypes?.length
    ? row.taskTypes.map((item) => `${item.taskType}×${item.count}`).join(" / ")
    : "无任务记录";
}

function clientRuntimeSurfaceText(row: ClientRuntimeHeatRow) {
  return row.surfaces?.length
    ? row.surfaces.map((item) => `${item.surface}×${item.count}`).join(" / ")
    : "无调用面记录";
}

function clientRuntimeHeatStyle(row: ClientRuntimeHeatRow) {
  const heat = Math.max(4, Math.min(100, Number(row.heatPercent || 0)));
  return { "--heat": `${heat}%` };
}

function monitorAlertSeverityTone(severity: string) {
  if (severity === "critical") {
    return "failed";
  }
  if (severity === "warning") {
    return "warning";
  }
  return "running";
}

function monitorAlertSeverityLabel(severity: string) {
  const labels: Record<string, string> = {
    critical: "严重",
    warning: "警告",
    info: "提示",
  };
  return labels[severity] || severity || "未知";
}

function maintenanceAgentRiskLabel(risk: string) {
  const labels: Record<string, string> = {
    read_only: "只读",
    safe_write: "安全写入",
    repair_write: "修复写入",
    destructive: "破坏性",
  };
  return labels[risk] || risk || "未知";
}

function migrationTone(state: ClientMigrationState) {
  if (state === "aligned") {
    return "aligned";
  }

  if (state === "draining") {
    return "draining";
  }

  if (state === "offline") {
    return "offline";
  }

  return "attention";
}

function migrationProgress(state: ClientMigrationState) {
  switch (state) {
    case "aligned":
      return 100;
    case "draining":
      return 68;
    case "outdated":
      return 28;
    case "bootstrap-only":
      return 12;
    case "offline":
      return 0;
    default:
      return 8;
  }
}

function openDrawer(tab: DrawerTab) {
  if (tab === "modules" && !hasFeature("analysis-runtime")) {
    tab = "discovery";
  }
  if (tab === "syncDirectories" && !hasFeature("knowledge-core")) {
    tab = "discovery";
  }
  drawerTab.value = tab;
  drawerOpen.value = true;
  if (tab === "users") {
    void refreshAuthAdmin();
  }
}

function closeDrawer() {
  drawerOpen.value = false;
}

function cloneExpertVocabulary(vocabulary: ExpertVocabulary): ExpertVocabulary {
  return {
    ...emptyExpertVocabulary,
    ...JSON.parse(JSON.stringify(vocabulary || emptyExpertVocabulary)),
  };
}

function splitVocabularyList(value: string) {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function vocabularyEntryPath(entry: ExpertVocabularyEntry) {
  return (entry.pathSegments || []).join("/");
}

const displayedVocabularyEntries = computed(() => {
  const query = vocabularySearch.value.trim().toLowerCase();
  const entries = (expertVocabularyDraft.value.entries || []).map((entry, index) => ({
    entry,
    index,
  }));
  const filtered = query
    ? entries.filter(({ entry }) => {
        const haystack = [
          vocabularyEntryPath(entry),
          entry.label,
          ...(entry.keywords || []),
          ...(entry.domains || []),
          entry.status,
          entry.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : entries;

  return showAllVocabularyEntries.value || query
    ? filtered
    : filtered.slice(0, 8);
});

const hiddenVocabularyEntryCount = computed(() =>
  vocabularySearch.value.trim()
    ? 0
    : Math.max(0, (expertVocabularyDraft.value.entries || []).length - displayedVocabularyEntries.value.length),
);

function updateVocabularyEntry(index: number, patch: Partial<ExpertVocabularyEntry>) {
  expertVocabularyDraft.value.entries = expertVocabularyDraft.value.entries.map(
    (entry, entryIndex) =>
      entryIndex === index
        ? {
            ...entry,
            ...patch,
          }
        : entry,
  );
}

function updateVocabularyPath(index: number, value: string) {
  updateVocabularyEntry(index, {
    pathSegments: value
      .split("/")
      .map((item) => item.trim())
      .filter(Boolean),
  });
}

function updateVocabularyKeywords(index: number, value: string) {
  updateVocabularyEntry(index, {
    keywords: splitVocabularyList(value),
  });
}

function updateVocabularyDomains(index: number, value: string) {
  updateVocabularyEntry(index, {
    domains: splitVocabularyList(value),
  });
}

function addVocabularyEntry() {
  const now = Date.now();
  showAllVocabularyEntries.value = true;
  expertVocabularyDraft.value.entries = [
    ...expertVocabularyDraft.value.entries,
    {
      id: `draft-${now}`,
      pathSegments: ["未分类"],
      label: "新词条",
      keywords: [],
      domains: [],
      status: "draft",
      notes: "",
    },
  ];
}

function deleteVocabularyEntry(index: number) {
  expertVocabularyDraft.value.entries =
    expertVocabularyDraft.value.entries.filter((_, entryIndex) => entryIndex !== index);
}

function parseEmailRulesDraft(): EmailRuleSet {
  try {
    return JSON.parse(rulesText.value || "{}") as EmailRuleSet;
  } catch {
    return {
      schemaVersion: 1,
      updatedAt: "",
      reportSeries: [],
      synonymDictionary: [],
      departmentDictionary: [],
      keywordStopwords: [],
      transactionMergeRules: {
        highSimilarity: 0.32,
        mediumSimilarity: 0.18,
        mediumParticipantOverlap: 0.34,
        highParticipantOverlap: 0.6,
      },
    };
  }
}

const emailRulesDraft = computed(() => parseEmailRulesDraft());
const emailReportSeriesRules = computed(() =>
  (emailRulesDraft.value.reportSeries || []).map((rule, index) => ({ rule, index })),
);
const emailSynonymRules = computed(() =>
  (emailRulesDraft.value.synonymDictionary || []).map((rule, index) => ({ rule, index })),
);
const emailDepartmentRules = computed(() =>
  (emailRulesDraft.value.departmentDictionary || []).map((rule, index) => ({ rule, index })),
);

function expertRuleEnabled(value: unknown) {
  return (asRecord(value)?.enabled as boolean | undefined) !== false;
}

function setEmailRuleEntryEnabled(
  collection: "reportSeries" | "synonymDictionary" | "departmentDictionary",
  index: number,
  enabled: boolean,
) {
  const rules = parseEmailRulesDraft() as EmailRuleSet & Record<string, unknown>;
  const list = Array.isArray(rules[collection]) ? [...(rules[collection] as unknown[])] : [];
  const current = asRecord(list[index]) || {};
  list[index] = {
    ...current,
    enabled,
  };
  (rules as unknown as Record<string, unknown[]>)[collection] = list;
  rulesText.value = JSON.stringify(rules, null, 2);
}

function setVocabularyEntryEnabled(index: number, enabled: boolean) {
  updateVocabularyEntry(index, {
    status: enabled ? "active" : "retired",
  });
}

const goldenRulePackages = computed(() => {
  const state = asRecord(goldenRulesState.value) || {};
  const packages = Array.isArray(state.packages) ? state.packages : [];
  return packages
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
});

function goldenRulePackageTitle(pkg: Record<string, unknown>) {
  return `${String(pkg.packageId || "golden-rules")} v${String(pkg.version || "0")}`;
}

function goldenRuleItems(pkg: Record<string, unknown>) {
  return (Array.isArray(pkg.rules) ? pkg.rules : [])
    .map((rule, index) => ({
      rule: asRecord(rule) || {},
      index,
    }));
}

async function refreshExpertRules(options: { silent?: boolean; forceDrafts?: boolean } = {}) {
  const showBusy = !options.silent;
  const forceDrafts = options.forceDrafts === true;
  if (showBusy) {
    setBusy("expert-rules:refresh");
  }
  error.value = "";

  try {
    const [emailRulesResult, vocabularyResult, goldenRulesResult] = await Promise.all([
      bridge.getEmailRules(),
      bridge.getExpertVocabulary(),
      bridge.getGoldenRules(),
    ]);
    if (forceDrafts || !rulesDraftDirty.value) {
      replaceRulesDraftFromServer(emailRulesResult.rules);
    }
    if (forceDrafts || !expertVocabularyDraftDirty.value) {
      replaceExpertVocabularyDraftFromServer(vocabularyResult.vocabulary);
    }
    goldenRulesState.value = goldenRulesResult;
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "加载专家规则失败。";
  } finally {
    if (showBusy) {
      clearAllBusy();
    }
  }
}

async function toggleGoldenRuleEnabled(pkg: Record<string, unknown>, ruleIndex: number, enabled: boolean) {
  const packageId = String(pkg.packageId || "");
  if (!packageId) {
    return;
  }
  setBusy(`golden-rule:${packageId}:${ruleIndex}`);
  error.value = "";

  try {
    const nextRules = goldenRuleItems(pkg).map(({ rule, index }) =>
      index === ruleIndex
        ? {
            ...rule,
            enabled,
          }
        : rule,
    );
    const saved = await bridge.saveGoldenRules({
      ...pkg,
      version: undefined,
      status: "draft",
      rules: nextRules,
    });
    const savedPackage = asRecord(saved.package) || {};
    await bridge.publishGoldenRules(packageId, {
      version: Number(savedPackage.version || 0),
    });
    await refreshExpertRules({ silent: true });
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "更新黄金规则失败。";
  } finally {
    clearAllBusy();
  }
}

function normalizeRefreshStateOptions(options: RefreshStateOptions = {}): RefreshStateOptions {
  return {
    silent: options.silent === true,
    forceSettings: options.forceSettings === true,
    forceDrafts: options.forceDrafts === true,
  };
}

function mergeRefreshStateOptions(
  current: RefreshStateOptions | null,
  incoming: RefreshStateOptions = {},
): RefreshStateOptions {
  if (!current) {
    return normalizeRefreshStateOptions(incoming);
  }
  const left = normalizeRefreshStateOptions(current || {});
  const right = normalizeRefreshStateOptions(incoming);
  return {
    silent: left.silent && right.silent,
    forceSettings: Boolean(left.forceSettings || right.forceSettings),
    forceDrafts: Boolean(left.forceDrafts || right.forceDrafts),
  };
}

function clearPendingRefreshStateTimer() {
  if (pendingRefreshStateTimer) {
    window.clearTimeout(pendingRefreshStateTimer);
    pendingRefreshStateTimer = null;
  }
}

function scheduleDelayedRefreshState(options: RefreshStateOptions, delayMs: number) {
  pendingRefreshStateOptions = mergeRefreshStateOptions(pendingRefreshStateOptions, options);
  if (!pendingRefreshStatePromise) {
    pendingRefreshStatePromise = new Promise<void>((resolve) => {
      pendingRefreshStateResolve = resolve;
    });
  }
  if (pendingRefreshStateTimer) {
    return pendingRefreshStatePromise;
  }
  pendingRefreshStateTimer = window.setTimeout(() => {
    const nextOptions = pendingRefreshStateOptions || {};
    const resolve = pendingRefreshStateResolve;
    clearPendingRefreshStateTimer();
    pendingRefreshStateOptions = null;
    pendingRefreshStatePromise = null;
    pendingRefreshStateResolve = null;
    void performRefreshState(nextOptions).finally(() => {
      resolve?.();
    });
  }, Math.max(0, delayMs));
  return pendingRefreshStatePromise;
}

async function performRefreshState(options: RefreshStateOptions = {}) {
  lastRefreshStateStartedAt = Date.now();
  const showBusy = !options.silent;
  const forceDrafts = options.forceDrafts === true;
  if (showBusy) {
    setBusy(busyKey.value || "refresh");
  }
  error.value = "";

  try {
    const nextState = await bridge.getServerConsoleState();
    applyConsoleState(nextState, {
      forceSettings: options.forceSettings,
      forceDrafts,
    });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "加载服务端控制台失败。";
  } finally {
    if (showBusy) {
      clearAllBusy();
    }
  }
}

async function refreshState(options: RefreshStateOptions = {}) {
  const normalized = normalizeRefreshStateOptions(options);
  if (normalized.forceSettings || normalized.forceDrafts) {
    return performRefreshState(normalized);
  }
  const elapsedMs = Date.now() - lastRefreshStateStartedAt;
  if (lastRefreshStateStartedAt > 0 && elapsedMs < REFRESH_STATE_DELAY_MS) {
    return scheduleDelayedRefreshState(
      normalized,
      REFRESH_STATE_DELAY_MS - elapsedMs,
    );
  }
  return performRefreshState(normalized);
}

async function refreshContextCompiler(options: { silent?: boolean } = {}) {
  const showBusy = !options.silent;
  if (showBusy) {
    setBusy("context:refresh");
  }
  try {
    const [profiles, records] = await Promise.all([
      bridge.getContextProfiles(),
      bridge.listContextBuildRecords(20),
    ]);
    contextProfilesResponse.value = profiles;
    contextBuildRecordsResponse.value = records;
  } catch (nextError) {
    if (!options.silent) {
      error.value = nextError instanceof Error ? nextError.message : "加载上下文编译器状态失败。";
    }
  } finally {
    if (showBusy) {
      clearAllBusy();
    }
  }
}

function contextPreviewPayload() {
  const requiredEvidenceIds = contextPreviewRequiredEvidence.value
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    contextProfileId: selectedAgentExploreContextProfile.value.value,
    inputSource: "server-console-context-preview",
    taskBrief: contextPreviewTask.value,
    systemMemory: "Pact server console preview. Preserve evidence ids and human expert guidance.",
    expertGuidance: [
      {
        feedbackId: "preview-human-guidance",
        label: "人类专家意见",
        instruction: "证据编号、来源定位、金额、日期和冲突信息必须保留。",
        evidenceRefs: requiredEvidenceIds,
        context: {
          gold: true,
          humanExpert: true,
        },
      },
    ],
    retrievedEvidence: requiredEvidenceIds.length
      ? requiredEvidenceIds.map((evidenceId, index) => ({
          evidenceId,
          title: `预览证据 ${index + 1}`,
          snippet: `用于验证上下文编译器证据保护的片段：${evidenceId}，日期 2026-04-${String(index + 1).padStart(2, "0")}，金额 123.45。`,
          sourceLocator: `preview/${evidenceId}`,
          confidence: 0.9,
          humanExpert: true,
        }))
      : [
          {
            evidenceId: "preview-evidence-1",
            title: "预览账单证据",
            snippet: "2026-04-20 账单金额 123.45，需要保留 evidenceId、日期和金额。",
            sourceLocator: "preview/mail/账单.eml",
            confidence: 0.9,
            humanExpert: true,
          },
        ],
    history: "上一轮用户要求先确认账单主体，再输出风险结论。".repeat(20),
    recentTurns: infoFeedCurrentRun.value?.turns || [],
    toolState: {
      iteration: 1,
      previousToolResults: [
        {
          tool: "keyword_search",
          ok: true,
          count: 3,
          evidenceId: requiredEvidenceIds[0] || "preview-evidence-1",
        },
      ],
    },
  };
}

async function previewContextCompiler() {
  setBusy("context:preview");
  error.value = "";
  try {
    contextPreviewResult.value = await bridge.previewContextPack(contextPreviewPayload());
    await refreshContextCompiler({ silent: true });
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "上下文预览失败。";
  } finally {
    clearAllBusy();
  }
}

async function runContextReplayEvaluation() {
  setBusy("context:evaluation");
  error.value = "";
  try {
    const payload = contextPreviewPayload();
    const requiredEvidenceIds = contextPreviewRequiredEvidence.value
      .split(/[,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    contextEvaluationResult.value = await bridge.runContextEvaluation({
      profiles: [selectedAgentExploreContextProfile.value.value],
      cases: [
        {
          caseId: `console-preview-${Date.now()}`,
          ...payload,
          requiredEvidenceIds: requiredEvidenceIds.length ? requiredEvidenceIds : ["preview-evidence-1"],
        },
      ],
    });
    await refreshContextCompiler({ silent: true });
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "上下文 replay 评估失败。";
  } finally {
    clearAllBusy();
  }
}

function exportContextBuildRecords() {
  const payload = contextBuildRecordsResponse.value || { records: [] };
  downloadTextFile(
    `context-build-records-${formatMachineDate(new Date().toISOString(), "full").replace(/[: ]/g, "-")}.json`,
    `${JSON.stringify(payload, null, 2)}\n`,
    "application/json;charset=utf-8",
  );
}

function clearServerEventTimer() {
  if (serverEventTimer) {
    window.clearTimeout(serverEventTimer);
    serverEventTimer = null;
  }
  if (serverEventTimerResolve) {
    serverEventTimerResolve();
    serverEventTimerResolve = null;
  }
}

function waitForServerEventRetry(ms: number) {
  return new Promise<void>((resolve) => {
    serverEventTimerResolve = resolve;
    serverEventTimer = window.setTimeout(() => {
      serverEventTimer = null;
      serverEventTimerResolve = null;
      resolve();
    }, ms);
  });
}

function isAbortError(nextError: unknown) {
  return (
    (nextError instanceof DOMException && nextError.name === "AbortError") ||
    (nextError instanceof Error && nextError.name === "AbortError")
  );
}

function stopServerEventSubscription() {
  serverEventSubscriptionStopped = true;
  serverEventSubscriptionGeneration += 1;
  clearServerEventTimer();
  if (serverEventAbortController) {
    serverEventAbortController.abort();
    serverEventAbortController = null;
  }
}

async function runServerEventSubscription(generation = serverEventSubscriptionGeneration) {
  if (
    serverEventSubscriptionStopped ||
    generation !== serverEventSubscriptionGeneration
  ) {
    return;
  }

  const controller = new AbortController();
  serverEventAbortController = controller;
  const requestCursor = serverEventCursor;
  try {
    const response = await bridge.subscribeEvents({
      cursor: requestCursor,
      topic: currentServerEventTopics(),
      timeoutMs: requestCursor === 0 ? 0 : 25000,
      includeSnapshot: requestCursor === 0,
    }, { signal: controller.signal });
    if (
      serverEventSubscriptionStopped ||
      generation !== serverEventSubscriptionGeneration ||
      controller.signal.aborted
    ) {
      return;
    }
    const incomingEvents = [
      ...(requestCursor === 0 ? response.snapshots || [] : []),
      ...response.events,
    ];
    const hasUpdates = incomingEvents.length > 0;
    const handledUpdates = incomingEvents.filter(applyServerEvent).length;
    serverEventCursor = Math.max(serverEventCursor, response.nextCursor || 0);
    if (hasUpdates && handledUpdates < incomingEvents.length) {
      await refreshState({ silent: true });
    }
  } catch (nextError) {
    if (
      isAbortError(nextError) ||
      serverEventSubscriptionStopped ||
      generation !== serverEventSubscriptionGeneration
    ) {
      return;
    }
    await waitForServerEventRetry(3000);
  } finally {
    if (serverEventAbortController === controller) {
      serverEventAbortController = null;
    }
  }

  if (
    !serverEventSubscriptionStopped &&
    generation === serverEventSubscriptionGeneration
  ) {
    serverEventTimer = window.setTimeout(() => {
      serverEventTimer = null;
      void runServerEventSubscription(generation);
    }, 100);
  }
}

function startServerEventSubscription() {
  stopServerEventSubscription();
  serverEventCursor = 0;
  serverEventSubscriptionStopped = false;
  serverEventSubscriptionGeneration += 1;
  void runServerEventSubscription(serverEventSubscriptionGeneration);
}

async function refreshCodexOAuthStatus() {
  const status = await bridge.getCodexOAuthStatus();
  codexOAuthStatus.value = status;
  if (status.valid) {
    stopCodexOAuthPolling();
    codexOAuthLogin.value = null;
  }
  return status;
}

function stopCodexOAuthPolling() {
  if (codexOAuthPollTimer) {
    window.clearInterval(codexOAuthPollTimer);
    codexOAuthPollTimer = null;
  }
}

function startCodexOAuthPolling() {
  stopCodexOAuthPolling();
  codexOAuthPollTimer = window.setInterval(() => {
    void refreshCodexOAuthStatus();
  }, 2000);
}

async function beginCodexOAuthLogin() {
  setBusy("codex-oauth");
  error.value = "";

  try {
    const login = await bridge.startCodexOAuthLogin();
    codexOAuthLogin.value = login;
    codexOAuthStatus.value = login.status;
    if (login.authorizationUrl) {
      window.open(login.authorizationUrl, "pact-codex-oauth");
    }
    startCodexOAuthPolling();
    return login.status.valid;
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "启动 Codex OAuth 验证失败。";
    return false;
  } finally {
    clearAllBusy();
  }
}

async function ensureCodexOAuthReady(startLogin = false) {
  const status = await refreshCodexOAuthStatus();
  if (status.valid) {
    return true;
  }
  if (startLogin) {
    return beginCodexOAuthLogin();
  }
  return false;
}

async function handleCloudProviderChange() {
  if (hasOpenAiModelUsage()) {
    await ensureCodexOAuthReady(true);
  }
}

async function saveModuleSettings() {
  setBusy("modules");
  error.value = "";

  try {
    if (
      hasOpenAiModelUsage() &&
      !(await ensureCodexOAuthReady(true))
    ) {
      error.value = "ChatGPT OAuth 还没有验证完成，验证完成后再保存模型设置。";
      clearAllBusy();
      return;
    }
    await bridge.saveSettings(settingsPayloadForSave());
    settingsDraftDirty.value = false;
    await bridge.saveRuntimeMounts({
      mountModules: mountDraft.value,
    });
    mountDraftDirty.value = false;
    await refreshState({ forceSettings: true, forceDrafts: false });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存设置失败。";
    clearAllBusy();
  }
}

async function saveMountModules(busy = "mounts") {
  setBusy(busy);
  error.value = "";

  try {
    await bridge.saveRuntimeMounts({
      mountModules: mountDraft.value,
    });
    mountDraftDirty.value = false;
    await refreshState({ forceDrafts: false });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存挂载模块失败。";
  } finally {
    clearAllBusy();
  }
}

async function reloadModules() {
  setBusy("module-reload");
  error.value = "";

  try {
    await bridge.reloadRuntimeMounts(settingsDraft.value);
    await refreshState({ forceDrafts: false });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "重载智能能力失败。";
    clearAllBusy();
  }
}

async function enableMountModule(name: string) {
  if (!String(mountDraft.value[name] || "").trim()) {
    error.value = `请先填写 ${moduleNameLabels[name] || name} 的模块路径。`;
    return;
  }

  await saveMountModules(`mount:${name}`);
}

async function disableMountModule(name: string) {
  mountDraft.value = {
    ...mountDraft.value,
    [name]: "",
  };
  await saveMountModules(`mount:${name}`);
}

async function saveSettings() {
  setBusy("settings");
  error.value = "";

  try {
    await bridge.saveSettings(settingsPayloadForSave());
    settingsDraftDirty.value = false;
    await refreshState({ forceSettings: true, forceDrafts: false });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存基础设置失败。";
    clearAllBusy();
  }
}

async function saveModelLibrarySettings() {
  setBusy("model-library-save");
  error.value = "";

  try {
    const failures = await probeModelLibraryBeforeSave();
    if (failures.length) {
      const details = failures
        .slice(0, 6)
        .map(({ entry, result }) => `- ${entry.label || modelEntryStatusKey(entry)}：${result.message || "探测失败"}`)
        .join("\n");
      const suffix = failures.length > 6 ? `\n- 另有 ${failures.length - 6} 个智能体未通过探测。` : "";
      const confirmed = window.confirm(
        `保存前探测发现 ${failures.length} 个智能体不可用：\n${details}${suffix}\n\n是否仍然保存这些配置？`,
      );
      if (!confirmed) {
        return;
      }
    }
    await bridge.saveSettings(settingsPayloadForSave());
    settingsDraftDirty.value = false;
    await refreshState({ forceSettings: true, forceDrafts: false });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存模型库配置失败。";
  } finally {
    clearAllBusy();
  }
}

async function saveAgentPermissionSettings() {
  setBusy("agent-permissions-save");
  error.value = "";
  try {
    settingsDraft.value.agentPermissionGroups = agentPermissionGroups.value;
    const saved = await bridge.saveSettings(settingsPayloadForSave());
    replaceSettingsDraftFromServer(saved);
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存智能体权限组失败。";
  } finally {
    clearAllBusy();
  }
}

async function probeModel(provider: CloudProvider) {
  const busy = `model-probe:${provider}`;
  setBusy(busy);
  error.value = "";

  try {
    const result = await bridge.probeModel({
      provider,
      settings: settingsPayloadForSave(),
    });
    modelProbeResults.value = {
      ...modelProbeResults.value,
      [provider]: result,
    };
  } catch (nextError) {
    const message =
      nextError instanceof Error ? nextError.message : "模型探测失败。";
    modelProbeResults.value = {
      ...modelProbeResults.value,
      [provider]: {
        ok: false,
        configured: false,
        provider,
        model: "",
        statusCode: 0,
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        message,
      },
    };
    error.value = message;
  } finally {
    clearAllBusy();
  }
}

async function saveDiscovery() {
  setBusy("discovery");
  error.value = "";

  try {
    await bridge.saveDiscoveryConfig(discoveryDraft.value);
    discoveryDraftDirty.value = false;
    await refreshState({ forceDrafts: false });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存服务发现配置失败。";
    clearAllBusy();
  }
}

async function saveRules() {
  setBusy("rules");
  error.value = "";

  try {
    await bridge.saveEmailRules(JSON.parse(rulesText.value) as EmailRuleSet);
    rulesDraftDirty.value = false;
    await refreshState({ forceDrafts: false });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存规则库失败。";
    clearAllBusy();
  }
}

async function saveExpertVocabulary() {
  setBusy("expert-vocabulary");
  error.value = "";

  try {
    await bridge.saveExpertVocabulary(expertVocabularyDraft.value);
    expertVocabularyDraftDirty.value = false;
    await refreshState({ forceDrafts: false });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存专家词汇库失败。";
    clearAllBusy();
  }
}

async function refreshToolManagement(options: { silent?: boolean } = {}) {
  const showBusy = !options.silent;
  if (showBusy) {
    setBusy("tool-management");
  }
  error.value = "";

  try {
    const [grants, catalog, audit, metrics] = await Promise.all([
      bridge.getToolManagementGrants(),
      bridge.getToolManagementCatalog(),
      bridge.getToolManagementAudit(50),
      bridge.getToolManagementMetrics(),
    ]);
    toolManagementGrantsState.value = grants.grants;
    toolManagementCatalogState.value = catalog;
    toolManagementAuditItems.value = audit.items;
    toolManagementMetricsState.value = metrics.metrics;
    if (!policyPreviewToolId.value && catalog.tools.length > 0) {
      policyPreviewToolId.value = catalog.tools[0].id;
    }
    if (!selectedToolManagementToolId.value && catalog.tools.length > 0) {
      selectedToolManagementToolId.value = catalog.tools[0].id;
    }
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "刷新智能体工具失败。";
  } finally {
    if (showBusy) {
      clearAllBusy();
    }
  }
}

async function previewToolPolicy() {
  if (!policyPreviewToolId.value) {
    error.value = "请选择需要预览的工具。";
    return;
  }
  setBusy("tool-policy-preview");
  error.value = "";
  try {
    const payload: Record<string, unknown> = {
      toolId: policyPreviewToolId.value,
      input: {},
      dryRun: false,
    };
    if (policyPreviewGrantId.value.trim()) {
      payload.grantId = policyPreviewGrantId.value.trim();
    } else {
      payload.grant = policyPreviewGrant();
    }
    if (policyPreviewProfileId.value.trim()) {
      payload.profileId = policyPreviewProfileId.value.trim();
    }
    policyPreviewResult.value = await bridge.previewToolPolicy(payload);
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "工具策略预览失败。";
  } finally {
    clearAllBusy();
  }
}

function patchMaintenanceAgentState(patch: Partial<NonNullable<ServerConsoleState["maintenanceAgent"]>>) {
  if (!consoleState.value) {
    return;
  }
  const previous = consoleState.value.maintenanceAgent || {
    config: maintenanceAgentConfig.value as MaintenanceAgentConfig,
    tools: [],
    latestRun: null,
    runs: [],
    activeRunId: "",
    queuedRunIds: [],
    pendingApprovalCount: 0,
    nextRunAt: "",
    auditPath: "",
    runsPath: "",
  };
  if (!previous.config && !patch.config) {
    return;
  }
  consoleState.value = {
    ...consoleState.value,
    maintenanceAgent: {
      ...previous,
      ...patch,
    },
  };
}

async function refreshMaintenanceAgent(options: { silent?: boolean } = {}) {
  if (!canReadMaintenanceAgent.value) {
    return;
  }
  if (!options.silent) {
    setBusy("maintenance-agent:refresh");
  }
  error.value = "";
  try {
    const [configResult, runsResult] = await Promise.all([
      bridge.getMaintenanceAgentConfig(),
      bridge.listMaintenanceAgentRuns(30),
    ]);
    maintenanceAgentConfig.value = JSON.parse(JSON.stringify(configResult.config));
    maintenanceAgentRuns.value = runsResult.items;
    selectedMaintenanceAgentRun.value =
      maintenanceAgentRuns.value.find(
        (run) => run.runId === selectedMaintenanceAgentRun.value?.runId,
      ) ||
      maintenanceAgentRuns.value[0] ||
      null;
    patchMaintenanceAgentState({
      config: configResult.config,
      runs: runsResult.items,
      latestRun: runsResult.items[0] || null,
      activeRunId: runsResult.activeRunId,
      queuedRunIds: runsResult.queuedRunIds,
      pendingApprovalCount: runsResult.items.filter((run) => run.status === "awaiting_approval").length,
      nextRunAt:
        (configResult.config.schedules || [])
          .filter((schedule) => schedule.enabled && schedule.nextRunAt)
          .map((schedule) => schedule.nextRunAt)
          .sort()[0] || "",
    });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "刷新智能巡检失败。";
  } finally {
    if (!options.silent) {
      clearAllBusy();
    }
  }
}

async function refreshBackgroundProcesses(options: { silent?: boolean } = {}) {
  if (!canReadMaintenanceAgent.value) {
    return;
  }
  if (!options.silent) {
    setBusy("background-processes:refresh");
  }
  error.value = "";
  try {
    backgroundProcessStatus.value = await bridge.getBackgroundProcesses();
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "刷新后台进程状态失败。";
  } finally {
    if (!options.silent) {
      clearAllBusy();
    }
  }
}

async function refreshClientRuntimeStatus(options: { silent?: boolean } = {}) {
  if (!options.silent) {
    setBusy("client-runtime:refresh");
  }
  error.value = "";
  try {
    const status = await bridge.getClientRuntimeStatus();
    if (consoleState.value) {
      consoleState.value = {
        ...consoleState.value,
        clientRuntime: status,
      };
    }
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "刷新客户端运行时热度失败。";
  } finally {
    if (!options.silent) {
      clearAllBusy();
    }
  }
}

async function refreshMonitorAlerts(options: { silent?: boolean } = {}) {
  if (!canReadMaintenanceAgent.value) {
    return;
  }
  if (!options.silent) {
    setBusy("monitor-alerts:refresh");
  }
  error.value = "";
  try {
    const state = await bridge.getMonitorAlerts();
    monitorAlertState.value = state;
    monitorAlertConfigText.value = jsonPreview(state.config);
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "刷新监控报警失败。";
  } finally {
    if (!options.silent) {
      clearAllBusy();
    }
  }
}

async function refreshDashboardAlertsSnapshot(options: { silent?: boolean } = {}) {
  await refreshMonitorAlerts({ silent: options.silent !== false });
  syncDashboardAlertInbox(liveDashboardAlerts.value);
}

async function saveMonitorAlertConfig() {
  if (!canAdminMaintenanceAgent.value) {
    error.value = "当前账号没有维护配置权限。";
    return;
  }
  setBusy("monitor-alerts:save");
  error.value = "";
  try {
    const parsed = JSON.parse(monitorAlertConfigText.value || "{}");
    const state = await bridge.saveMonitorAlertConfig(parsed);
    monitorAlertState.value = state;
    monitorAlertConfigText.value = jsonPreview(state.config);
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存监控报警配置失败。";
  } finally {
    clearAllBusy();
  }
}

async function saveMaintenanceAgentConfig() {
  if (!maintenanceAgentConfig.value) {
    return;
  }
  setBusy("maintenance-agent:config");
  error.value = "";
  try {
    const result = await bridge.saveMaintenanceAgentConfig(maintenanceAgentConfig.value);
    maintenanceAgentConfig.value = JSON.parse(JSON.stringify(result.config));
    patchMaintenanceAgentState({ config: result.config });
    await refreshMaintenanceAgent({ silent: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存智能巡检配置失败。";
  } finally {
    clearAllBusy();
  }
}

async function chatMaintenanceAgent() {
  const message = maintenanceAgentMessage.value.trim();
  if (!message) {
    error.value = "请输入维护指令。";
    return;
  }
  setBusy("maintenance-agent:chat");
  error.value = "";
  try {
    const selectedAgent = visibleModelEntries.value.find(
      (entry) => modelEntryStatusKey(entry) === maintenanceAgentModelAlias.value,
    );
    const result = await bridge.chatMaintenanceAgent({
      message,
      modelAlias: maintenanceAgentModelAlias.value || undefined,
      agentName: selectedAgent?.agentName || selectedAgent?.label || undefined,
      wait: true,
    });
    maintenanceAgentResultJson.value = jsonPreview(result);
    selectedMaintenanceAgentRun.value = result.run;
    await refreshMaintenanceAgent({ silent: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "智能巡检对话执行失败。";
  } finally {
    clearAllBusy();
  }
}

async function runMaintenanceAgentRunbook() {
  setBusy("maintenance-agent:run");
  error.value = "";
  try {
    const run = await bridge.startMaintenanceAgentRun({
      runbook: maintenanceAgentRunbook.value,
      wait: true,
    });
    maintenanceAgentResultJson.value = jsonPreview(run);
    selectedMaintenanceAgentRun.value = run;
    await refreshMaintenanceAgent({ silent: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "维护 runbook 执行失败。";
  } finally {
    clearAllBusy();
  }
}

async function approveMaintenanceAgentRun(run: MaintenanceAgentRun) {
  setBusy(`maintenance-agent:approve:${run.runId}`);
  error.value = "";
  try {
    const result = await bridge.approveMaintenanceAgentRun(run.runId, {
      planHash: run.planHash,
      wait: true,
    });
    maintenanceAgentResultJson.value = jsonPreview(result.run);
    selectedMaintenanceAgentRun.value = result.run;
    await refreshMaintenanceAgent({ silent: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "维护计划审批失败。";
  } finally {
    clearAllBusy();
  }
}

async function cancelMaintenanceAgentRun(run: MaintenanceAgentRun) {
  setBusy(`maintenance-agent:cancel:${run.runId}`);
  error.value = "";
  try {
    const result = await bridge.cancelMaintenanceAgentRun(run.runId, {
      reason: "console",
    });
    maintenanceAgentResultJson.value = jsonPreview(result.run);
    selectedMaintenanceAgentRun.value = result.run;
    await refreshMaintenanceAgent({ silent: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "维护运行取消失败。";
  } finally {
    clearAllBusy();
  }
}

async function createGrant() {
  if (newGrantScopes.value.length === 0 && newGrantToolsets.value.length === 0) {
    error.value = "请至少选择一个工具权限范围或工具集。";
    return;
  }

  setBusy("grant:create");
  error.value = "";
  issuedToolToken.value = "";

  try {
    const result = await bridge.createToolGrant({
      label: newGrantLabel.value,
      scopes: newGrantScopes.value,
      toolsets: newGrantToolsets.value,
    });
    issuedToolToken.value = result.token;
    await refreshToolManagement({ silent: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "创建工具授权失败。";
  } finally {
    clearAllBusy();
  }
}

async function updateGrant(grant: ToolManagementGrant, patch: Partial<ToolManagementGrant>) {
  setBusy(`grant:${grant.id}`);
  error.value = "";

  try {
    await bridge.updateToolGrant(grant.id, {
      label: patch.label,
      enabled: patch.enabled,
      scopes: patch.scopes,
      toolsets: patch.toolsets,
      toolAllow: patch.toolAllow,
      toolDeny: patch.toolDeny,
    });
    await refreshToolManagement({ silent: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "更新工具授权失败。";
  } finally {
    clearAllBusy();
  }
}

async function toggleGrantScope(grant: ToolManagementGrant, scopeId: string) {
  const nextScopes = new Set(grant.scopes);
  if (nextScopes.has(scopeId)) {
    nextScopes.delete(scopeId);
  } else {
    nextScopes.add(scopeId);
  }
  await updateGrant(grant, {
    scopes: [...nextScopes],
  });
}

async function toggleGrantToolset(grant: ToolManagementGrant, toolsetId: string) {
  const nextToolsets = new Set(grant.toolsets || []);
  if (nextToolsets.has(toolsetId)) {
    nextToolsets.delete(toolsetId);
  } else {
    nextToolsets.add(toolsetId);
  }
  await updateGrant(grant, {
    toolsets: [...nextToolsets],
  });
}

async function rotateGrant(grant: ToolManagementGrant) {
  setBusy(`grant:${grant.id}`);
  error.value = "";
  issuedToolToken.value = "";

  try {
    const result = await bridge.rotateToolGrantToken(grant.id);
    issuedToolToken.value = result.token;
    await refreshToolManagement({ silent: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "轮换工具令牌失败。";
  } finally {
    clearAllBusy();
  }
}

async function deleteGrant(grant: ToolManagementGrant) {
  if (!window.confirm(`撤销工具授权“${grant.label}”？`)) {
    return;
  }

  setBusy(`grant:${grant.id}`);
  error.value = "";

  try {
    await bridge.deleteToolGrant(grant.id);
    await refreshToolManagement({ silent: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "撤销工具授权失败。";
  } finally {
    clearAllBusy();
  }
}

async function copyIssuedToolToken() {
  if (!issuedToolToken.value) {
    return;
  }
  await navigator.clipboard.writeText(issuedToolToken.value);
}

async function deleteJob(jobId: string) {
  if (!window.confirm(`删除任务“${jobId}”？`)) {
    return;
  }

  setBusy(`job:${jobId}`);
  error.value = "";

  try {
    await bridge.deleteJob(jobId);
    await refreshState();
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "删除任务失败。";
    clearAllBusy();
  }
}

const filteredJobs = computed(() =>
  [...(consoleState.value?.jobs.items || [])].sort(
    (left, right) => parseTime(right.updatedAt) - parseTime(left.updatedAt),
  ),
);

const filteredClients = computed(() =>
  [...(consoleState.value?.clients.items || [])].sort(
    (left, right) => parseTime(right.lastSeenAt) - parseTime(left.lastSeenAt),
  ),
);

const filteredClientList = computed(() => {
  const query = clientSearchQuery.value.trim().toLowerCase();
  const stateFilter = clientStateFilter.value;

  return filteredClients.value.filter((item: any) => {
    // State filter
    if (stateFilter !== "all" && item.migrationState !== stateFilter) {
      return false;
    }

    // Search query
    if (!query) return true;
    return (
      (item.clientLabel || "").toLowerCase().includes(query) ||
      (item.clientId || "").toLowerCase().includes(query) ||
      (item.hostname || "").toLowerCase().includes(query) ||
      (item.platform || "").toLowerCase().includes(query) ||
      (item.currentServiceUrl || "").toLowerCase().includes(query) ||
      (migrationStateLabels[item.migrationState as ClientMigrationState] || "").includes(query)
    );
  });
});

const displayedClients = computed(() => filteredClients.value.slice(0, 6));
const recentJobs = computed(() => filteredJobs.value);
const maintenanceAgentSummary = computed(() => consoleState.value?.maintenanceAgent || null);
const maintenanceAgentRunbooks = computed(() =>
  Object.values(
    maintenanceAgentConfig.value?.runbooks ||
      maintenanceAgentSummary.value?.config.runbooks ||
      {},
  ),
);
const retrievalModeOptionBarOptions: OptionBarOption[] = [
  { value: "hybrid", label: "hybrid" },
  { value: "lexical", label: "lexical" },
  { value: "vector", label: "vector" },
];
const enabledBooleanOptionBarOptions: OptionBarOption[] = [
  { value: true, label: "开启" },
  { value: false, label: "关闭" },
];
const enabledStringOptionBarOptions: OptionBarOption[] = [
  { value: "true", label: "开启" },
  { value: "false", label: "关闭" },
];
const knowledgeReviewStatusOptionBarOptions: OptionBarOption[] = [
  { value: "pending", label: "待决策" },
  { value: "resolved", label: "已解决" },
  { value: "rejected", label: "已忽略" },
  { value: "all", label: "全部" },
];
const vocabularyStatusOptionBarOptions: OptionBarOption[] = [
  { value: "draft", label: "草稿" },
  { value: "active", label: "启用" },
  { value: "retired", label: "停用" },
];
const plannerModeOptionBarOptions: OptionBarOption[] = [
  { value: "gateway_fallback", label: "gateway_fallback" },
  { value: "fixed_runbook", label: "fixed_runbook" },
  { value: "gateway", label: "gateway" },
];
const autoApproveRiskOptionBarOptions: OptionBarOption[] = [
  { value: "safe_write", label: "safe_write" },
  { value: "read_only", label: "read_only" },
];
const discoveryModeOptionBarOptions: OptionBarOption[] = [
  { value: "active", label: "激活 (active)" },
  { value: "forward", label: "转发 (forward)" },
];
const contextWindowOptionBarOptions = computed<OptionBarOption[]>(() =>
  agentExploreContextWindowOptions.map((option) => ({
    value: option.value,
    label: `${option.label} - ${option.description}`,
  })),
);
const thinkingModeOptionBarOptions = computed<OptionBarOption[]>(() =>
  agentExploreThinkingModeOptions.map((option) => ({
    value: option.value,
    label: option.label,
  })),
);
const moduleAccessModeOptionBarOptions: OptionBarOption[] = [
  { value: "all", label: "默认公开给所有功能" },
  { value: "selected", label: "仅公开给选定功能" },
];
const ruleScopeOptionBarOptions = computed<OptionBarOption[]>(() =>
  ruleScopeOptions.map((option) => ({ value: option.value, label: option.label })),
);
const ruleMatchStrategyOptionBarOptions = computed<OptionBarOption[]>(() =>
  ruleMatchStrategyOptions.map((option) => ({ value: option.value, label: option.label })),
);
const ruleActionOptionBarOptions = computed<OptionBarOption[]>(() =>
  ruleActionOptions.map((option) => ({ value: option.value, label: option.label })),
);
const knowledgeLogStatusOptionBarOptions = computed<OptionBarOption[]>(() => [
  { value: "", label: "全部状态" },
  ...knowledgeLogStatusOptions.value.map((status) => ({ value: status, label: status })),
]);
const maintenanceTaskOptionBarOptions = computed<OptionBarOption[]>(() =>
  (knowledgeSchema.value?.maintenanceTasks || []).map((task) => ({
    value: task.id,
    label: `${task.label} / ${task.danger}`,
  })),
);
const analysisModuleOptionBarOptions = computed<OptionBarOption[]>(() =>
  (consoleState.value?.runtime?.analysisModules || []).map((item) => ({
    value: item.id,
    label: `${item.label} / ${item.id}`,
  })),
);
const addableModelProviderOptionBarOptions = computed<OptionBarOption[]>(() =>
  addableModelProviders.value.map((provider) => ({
    value: provider.id,
    label: provider.label,
  })),
);
function moduleModelAssignmentSelectOptions(moduleId: string) {
  return moduleModelAssignmentOptions(moduleId).map((model) => ({
    value: model.ref,
    label: `${model.label} / ${providerLabel(model.provider)}`,
    enabled: model.enabled,
    disabledReason: "未配置",
  }));
}
const maintenanceAgentRunbookOptionBarOptions = computed<OptionBarOption[]>(() =>
  maintenanceAgentRunbooks.value.map((runbook) => ({
    value: runbook.id,
    label: `${runbook.label} / ${runbook.id}`,
  })),
);
const policyPreviewToolOptionBarOptions = computed<OptionBarOption[]>(() =>
  toolManagementTools.value.map((tool) => ({
    value: tool.id,
    label: `${tool.label} / ${tool.id}`,
  })),
);
const policyPreviewProfileOptionBarOptions = computed<OptionBarOption[]>(() => [
  { value: "", label: "不绑定档案" },
  ...toolManagementProfiles.value.map((profile) => ({
    value: profile.id,
    label: `${profile.label} / ${profile.id}`,
  })),
]);
const clientStateFilterOptionBarOptions = computed<OptionBarOption[]>(() => [
  { value: "all", label: "所有状态" },
  ...Object.entries(migrationStateLabels).map(([value, label]) => ({ value, label })),
]);
const authRoleOptionBarOptions = computed<OptionBarOption[]>(() =>
  (authState.value?.roles || []).map((role) => ({
    value: role.roleId,
    label: role.label,
  })),
);
const maintenanceAgentSchedules = computed(
  () =>
    maintenanceAgentConfig.value?.schedules ||
    maintenanceAgentSummary.value?.config.schedules ||
    [],
);
const displayedMaintenanceAgentRuns = computed(() =>
  (maintenanceAgentRuns.value.length > 0
    ? maintenanceAgentRuns.value
    : maintenanceAgentSummary.value?.runs || []
  ).slice(0, 12),
);
const latestMaintenanceAgentRun = computed(
  () => displayedMaintenanceAgentRuns.value[0] || maintenanceAgentSummary.value?.latestRun || null,
);
const pendingMaintenanceApprovalCount = computed(
  () =>
    displayedMaintenanceAgentRuns.value.filter((run) => run.status === "awaiting_approval").length ||
    maintenanceAgentSummary.value?.pendingApprovalCount ||
    0,
);
const nextMaintenanceAgentRunAt = computed(() => {
  const scheduled =
    maintenanceAgentSchedules.value
      .filter((schedule) => schedule.enabled && schedule.nextRunAt)
      .map((schedule) => schedule.nextRunAt)
      .sort()[0] || "";
  return scheduled || maintenanceAgentSummary.value?.nextRunAt || "";
});
const backgroundProcesses = computed(() => backgroundProcessStatus.value?.processes || []);
const backgroundSupervisorLabel = computed(() => {
  const status = backgroundProcessStatus.value;
  if (!status) {
    return "未读取";
  }
  if (!status.supervisor.alive) {
    return "守护进程离线";
  }
  return status.ok ? "正常" : "降级";
});
const backgroundRunningCount = computed(
  () => backgroundProcesses.value.filter((item: any) => item.alive && !item.stale).length,
);
const clientRuntimeStatus = computed(() => consoleState.value?.clientRuntime || null);
const clientRuntimeHeatRows = computed(() => clientRuntimeStatus.value?.heatmap?.clients || []);
const clientRuntimeSummary = computed(() => clientRuntimeStatus.value?.summary || {
  totalClients: 0,
  hotClients: 0,
  warmClients: 0,
  cooledClients: 0,
  totalCalls: 0,
  workspaceCount: 0,
  contextCount: 0,
});
const clientRuntimeCoolingPolicyText = computed(() => {
  const policy = clientRuntimeStatus.value?.coolingPolicy || {};
  const strategy = String(policy.strategy || "lru-lfu-v1");
  const coldAfterMinutes = Math.round(Number(policy.coldAfterMs || 0) / 60000);
  const maxWarmClients = Number(policy.maxWarmClients || 0);
  return `${strategy} · 冷却阈值 ${coldAfterMinutes || "默认"} 分钟 · 保温客户端 ${maxWarmClients || "不限"}`;
});
const monitorAlertSummary = computed(() => monitorAlertState.value?.summary || {
  activeCount: 0,
  visibleCount: 0,
  recoveredCount: 0,
  criticalCount: 0,
  warningCount: 0,
  historyCount: 0,
});
const activeMonitorAlerts = computed(() => monitorAlertState.value?.activeAlerts || []);
const recentMonitorAlertHistory = computed(() => (monitorAlertState.value?.history || []).slice(0, 8));
const queueMonitorState = computed(() => monitorAlertState.value?.queueMonitor || null);
const queueMonitorItems = computed<QueueMonitorItem[]>(() => {
  const rawItems = queueMonitorState.value?.items;
  if (Array.isArray(rawItems)) {
    return rawItems;
  }
  if (rawItems && typeof rawItems === "object") {
    return Object.values(rawItems as Record<string, QueueMonitorItem>);
  }
  return [];
});
const allMaintenanceAgentRuns = computed(() =>
  maintenanceAgentRuns.value.length > 0
    ? maintenanceAgentRuns.value
    : maintenanceAgentSummary.value?.runs || [],
);
const workQueueRows = computed<WorkQueueRow[]>(() => {
  const rows: WorkQueueRow[] = [];
  const monitoredJobOwners = new Set<string>();
  const monitoredQueueIds = new Set<string>();

  for (const item of queueMonitorItems.value) {
    const registration = item.unifiedRegistration;
    const attributes = registration?.attributes || {};
    const relations = registration?.relations || {};
    monitoredJobOwners.add(item.ownerId);
    monitoredQueueIds.add(item.queueId);
    rows.push({
      rowId: registration?.registrationId || `queue-monitor:${item.queueId}`,
      queueId: String(attributes.queueId || item.queueId),
      kind: String(attributes.kind || item.kind || "queue"),
      label: registration?.label || item.label || item.queueId,
      ownerId: String(relations.ownerId || item.ownerId || ""),
      source: "queue-monitor",
      sourceLabel: queueSourceLabel(registration?.source || item.source || item.sources?.[0] || "queue-monitor"),
      lifecycleStatus: registration?.status || item.lifecycleStatus || item.status || "unknown",
      status: String(attributes.status || item.status || item.lifecycleStatus || "unknown"),
      phase: String(attributes.phase || item.phase || item.status || ""),
      tone: registration?.tone || queueLifecycleTone(item.lifecycleStatus || item.status),
      startedAt: item.startedAt || "",
      updatedAt: item.closedAt || item.recoveredAt || registration?.registeredAt || item.lastHeartbeatAt || item.lastCheckpointAt || "",
      lastHeartbeatAt: String(attributes.lastHeartbeatAt || item.lastHeartbeatAt || ""),
      checkpointTreeId: String(relations.checkpointTreeId || item.checkpointTreeId || ""),
      detail: queueMonitorDetail(item),
      registration,
    });
  }

  for (const job of consoleState.value?.jobs.items || []) {
    const registration = job.unifiedRegistration;
    const relations = registration?.relations || {};
    const attributes = registration?.attributes || {};
    const queueId = job.queueId || "";
    if ((queueId && monitoredQueueIds.has(queueId)) || monitoredJobOwners.has(job.id)) {
      continue;
    }
    rows.push({
      rowId: `split-job:${job.id}`,
      queueId: queueId || `job:${job.id}`,
      kind: "import_parse_job",
      label: registration?.label || `导入解析任务 ${job.id}`,
      ownerId: job.id,
      source: "split-job",
      sourceLabel: registration?.source === "jobs" ? "服务端任务" : registration?.source || "服务端任务",
      lifecycleStatus: registration?.status || job.status,
      status: job.status,
      phase: String(attributes.stage || job.stage || job.status),
      tone: registration?.tone || queueLifecycleTone(job.status),
      startedAt: job.startedAt || job.createdAt || "",
      updatedAt: job.finishedAt || registration?.registeredAt || job.updatedAt || "",
      lastHeartbeatAt: job.updatedAt || "",
      checkpointTreeId: String(relations.checkpointTreeId || job.checkpointTreeId || ""),
      detail: `进度 ${job.progressPercent}% · ${job.stage || "无阶段信息"}`,
      registration,
    });
  }

  for (const run of allMaintenanceAgentRuns.value) {
    const registration = run.unifiedRegistration;
    const relations = registration?.relations || {};
    const attributes = registration?.attributes || {};
    rows.push({
      rowId: registration?.registrationId || `maintenance-agent:${run.runId}`,
      queueId: String(relations.queueId || `maintenance:${run.runId}`),
      kind: String(attributes.taskType || "maintenance_agent_run"),
      label: registration?.label || run.summary || run.intent || `智能巡检任务 ${run.runId}`,
      ownerId: run.runId,
      source: "maintenance-agent",
      sourceLabel: registration?.source === "maintenance-agent" ? "智能巡检" : registration?.source || "智能巡检",
      lifecycleStatus: registration?.status || run.status,
      status: run.status,
      phase: String(attributes.stage || run.status),
      tone: registration?.tone || queueLifecycleTone(run.status),
      startedAt: run.startedAt || run.createdAt || "",
      updatedAt: run.completedAt || registration?.registeredAt || run.updatedAt || "",
      lastHeartbeatAt: run.updatedAt || "",
      checkpointTreeId: "",
      detail: `${maintenanceAgentRiskLabel(run.risk)} · ${run.plan?.summary || run.intent || "智能巡检"}`,
      registration,
    });
  }

  const activeRank = (row: WorkQueueRow) =>
    ["interrupted", "failed"].includes(row.status) || row.lifecycleStatus === "interrupted"
      ? 0
      : ["running", "queued", "awaiting_approval", "open"].includes(row.status) || row.lifecycleStatus === "open"
        ? 1
        : row.lifecycleStatus === "recovered"
          ? 2
          : 3;
  return rows.sort((left, right) => {
    const rankDelta = activeRank(left) - activeRank(right);
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return Date.parse(right.updatedAt || right.startedAt || "") - Date.parse(left.updatedAt || left.startedAt || "");
  });
});
const workQueueSummary = computed(() => ({
  total: workQueueRows.value.length,
  active: workQueueRows.value.filter((row) =>
    ["queued", "running", "awaiting_approval"].includes(row.status) || row.lifecycleStatus === "open",
  ).length,
  interrupted: workQueueRows.value.filter((row) => row.lifecycleStatus === "interrupted" || row.status === "interrupted").length,
  recovered: workQueueRows.value.filter((row) => row.lifecycleStatus === "recovered" || row.status === "recovered").length,
}));

function compactLogDetail(parts: Array<string | number | boolean | null | undefined>) {
  return parts
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function genericStatusTone(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (["failed", "error", "denied", "unauthorized", "critical", "interrupted", "blocked"].some((item) => normalized.includes(item))) {
    return "danger";
  }
  if (["warning", "warn", "pending", "queued", "stale", "awaiting"].some((item) => normalized.includes(item))) {
    return "warning";
  }
  if (["success", "ok", "completed", "allowed", "available", "active", "running", "recovered"].some((item) => normalized.includes(item))) {
    return "success";
  }
  return "info";
}

function stateProgressPercent(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (["completed", "success", "ok", "closed", "available", "recovered"].some((item) => normalized.includes(item))) {
    return 100;
  }
  if (["running", "active", "allowed"].some((item) => normalized.includes(item))) {
    return 80;
  }
  if (["queued", "pending", "awaiting"].some((item) => normalized.includes(item))) {
    return 20;
  }
  if (["failed", "error", "interrupted", "critical", "denied"].some((item) => normalized.includes(item))) {
    return 0;
  }
  return 50;
}

collectSystemStatusLogRows = () => {
  const queueRows = workQueueRows.value.map((row): KnowledgeLogRow => {
    const status = row.lifecycleStatus || row.status;
    return {
      logId: `queue:${row.rowId}`,
      kindLabel: "工作队列",
      displayId: shortId(row.queueId || row.rowId),
      target: row.label || row.queueId,
      status,
      statusLabel: queueLifecycleLabel(status),
      tone: row.tone || queueLifecycleTone(status),
      stage: compactLogDetail([row.sourceLabel, row.phase, row.status]),
      occurredAt: row.updatedAt || row.lastHeartbeatAt || row.startedAt || "",
      createdAt: row.startedAt || "",
      progressPercent: stateProgressPercent(status),
      detail: compactLogDetail([
        `队列 ${row.queueId}`,
        row.ownerId ? `owner ${row.ownerId}` : "",
        row.checkpointTreeId ? `checkpoint ${row.checkpointTreeId}` : "",
        row.registration?.registrationId ? `registration ${row.registration.registrationId}` : "",
        row.lastHeartbeatAt ? `heartbeat ${row.lastHeartbeatAt}` : "",
        row.detail,
      ]),
      error: ["failed", "interrupted"].includes(String(row.status || row.lifecycleStatus)) ? row.detail : "",
    };
  });

  const taskRows = recentJobs.value.map((job): KnowledgeLogRow => ({
    logId: `job:${job.id}`,
    kindLabel: "服务端任务",
    displayId: shortId(job.id),
    target: compactLogDetail([job.id, job.queueId ? `队列 ${job.queueId}` : ""]),
    status: job.status,
    statusLabel: jobStatusLabels[job.status] || job.status,
    tone: jobStatusTone(job.status),
    stage: job.stage || job.status,
    occurredAt: job.updatedAt || job.finishedAt || job.startedAt || job.createdAt || "",
    createdAt: job.createdAt || job.startedAt || "",
    progressPercent: Number(job.progressPercent || 0),
    detail: compactLogDetail([
      job.queueId ? `队列 ${job.queueId}` : "",
      job.checkpointTreeId ? `checkpoint ${job.checkpointTreeId}` : "",
      job.resultSummary ? jsonPreview(job.resultSummary) : "",
    ]),
    error: job.error || "",
  }));

  const processRows = backgroundProcesses.value.map((processItem): KnowledgeLogRow => ({
    logId: `process:${processItem.role}`,
    kindLabel: processItem.processType === "daemon" ? "守护进程" : "服务进程",
    displayId: processItem.role,
    target: processItem.label || processItem.role,
    status: processItem.status,
    statusLabel: backgroundProcessLabel(processItem.status),
    tone: backgroundProcessTone(processItem.status),
    stage: processItem.responsibility || processItem.description || processItem.mode || "",
    occurredAt: processItem.lastHeartbeatAt || processItem.startedAt || backgroundProcessStatus.value?.updatedAt || "",
    createdAt: processItem.startedAt || "",
    progressPercent: processItem.alive && !processItem.stale ? 100 : processItem.alive ? 50 : 0,
    detail: compactLogDetail([
      processItem.pid ? `PID ${processItem.pid}` : "",
      processItem.restartCount ? `重启 ${processItem.restartCount}` : "",
      processItem.services?.length ? `服务 ${processItem.services.join("/")}` : "",
      processItem.features?.length ? `功能 ${processItem.features.join("/")}` : "",
      processItem.monitors?.length ? `监控 ${processItem.monitors.join("/")}` : "",
      processItem.alerts?.length ? `报警 ${processItem.alerts.join("/")}` : "",
    ]),
    error: processItem.error || String(asRecord(processItem.lastExit)?.error || ""),
  }));

  const alertRows = [...activeMonitorAlerts.value, ...recentMonitorAlertHistory.value].map((alert): KnowledgeLogRow => {
    const status = alert.ackRequired ? "recovered" : alert.status || alert.severity;
    return {
      logId: `alert:${alert.alertId}:${alert.lastSeenAt || alert.resolvedAt || alert.firstSeenAt || ""}`,
      kindLabel: alert.ruleId === "queueInterrupted" ? "中断报警" : "监控报警",
      displayId: shortId(alert.alertId),
      target: alert.title,
      status,
      statusLabel: alert.ackRequired || alert.active === false ? "已恢复" : monitorAlertSeverityLabel(alert.severity),
      tone: alert.ackRequired || alert.active === false ? "success" : monitorAlertSeverityTone(alert.severity),
      stage: compactLogDetail([alert.ruleId, alert.source, alert.role, alert.queueId ? `队列 ${alert.queueId}` : ""]),
      occurredAt: alert.recoveredAt || alert.resolvedAt || alert.lastSeenAt || alert.firstSeenAt || "",
      createdAt: alert.firstSeenAt || "",
      progressPercent: alert.ackRequired || alert.active === false ? 100 : 0,
      detail: compactLogDetail([
        alert.message,
        alert.interruptedAt ? `中断 ${alert.interruptedAt}` : "",
        alert.recoveredAt ? `恢复 ${alert.recoveredAt}` : "",
        alert.acknowledgedAt ? `确认 ${alert.acknowledgedAt}` : "",
        alert.evidence ? jsonPreview(alert.evidence) : "",
      ]),
      error: alert.severity === "critical" && alert.active ? alert.message : "",
    };
  });

  const configAlertRows = agentConfigurationAlerts.value.map((alert): KnowledgeLogRow => ({
    logId: `config-alert:${alert.alertId}`,
    kindLabel: "配置报警",
    displayId: shortId(alert.alertId),
    target: `${alert.category} / ${alert.title}`,
    status: alert.status,
    statusLabel: alert.status,
    tone: alert.tone,
    stage: alert.targetId || "",
    occurredAt: "",
    createdAt: "",
    progressPercent: alert.tone === "danger" ? 0 : 20,
    detail: alert.detail,
    error: alert.tone === "danger" ? alert.detail : "",
  }));

  const toolAuditRows = toolManagementAuditItems.value.map((item): KnowledgeLogRow => ({
    logId: `tool-audit:${item.toolExecutionId}`,
    kindLabel: "工具审计",
    displayId: shortId(item.toolExecutionId),
    target: item.toolId || item.operationId || item.toolExecutionId,
    status: item.status,
    statusLabel: compactLogDetail([item.status, item.decision]),
    tone: genericStatusTone(`${item.status} ${item.decision} ${item.errorCode}`),
    stage: compactLogDetail([item.operationId, toolRiskLabel(item.risk), item.profileId, item.agentId]),
    occurredAt: item.finishedAt || item.startedAt || "",
    createdAt: item.startedAt || "",
    progressPercent: stateProgressPercent(item.status),
    detail: compactLogDetail([
      item.traceId ? `trace ${item.traceId}` : "",
      item.grantId ? `grant ${item.grantId}` : "",
      item.durationMs ? `${item.durationMs}ms` : "",
      item.resultSummary ? jsonPreview(item.resultSummary) : "",
    ]),
    error: item.errorCode || "",
  }));

  const authAuditRows = authAudit.value.map((item): KnowledgeLogRow => {
    const actor = asRecord(item.actor) || {};
    const target = asRecord(item.target) || null;
    const redactedInput = asRecord(item.redactedInput) || null;
    const redactedOutputSummary = asRecord(item.redactedOutputSummary) || null;
    const operationId = item.operationId || item.action || "operation";
    const isAuthOperation = operationId.startsWith("auth.");
    return {
      logId: `operation-audit:${item.auditId}`,
      kindLabel: isAuthOperation ? "认证审计" : "操作审计",
      displayId: shortId(item.auditId),
      target: compactLogDetail([
        String(item.username || actor.username || actor.userId || item.userId || "anonymous"),
        operationId,
      ]),
      status: item.status,
      statusLabel: item.status,
      tone: genericStatusTone(item.status || item.error),
      stage: compactLogDetail([
        item.method || item.transport,
        item.path,
        item.action || item.risk,
        item.durationMs ? `${item.durationMs}ms` : "",
      ]),
      occurredAt: item.createdAt,
      createdAt: item.createdAt,
      progressPercent: stateProgressPercent(item.status),
      detail: target
        ? jsonPreview(target)
        : redactedInput
          ? jsonPreview(redactedInput)
          : redactedOutputSummary
            ? jsonPreview(redactedOutputSummary)
            : "",
      error: item.error || "",
    };
  });

  return [
    ...queueRows,
    ...taskRows,
    ...processRows,
    ...alertRows,
    ...configAlertRows,
    ...toolAuditRows,
    ...authAuditRows,
  ];
};

watch(
  [currentView, adminView, filteredKnowledgeLogRows],
  () => {
    if (currentView.value === "admin" && adminView.value === "logs") {
      void nextTick(() => syncKnowledgeLogTableScrollLeft());
    }
  },
  { flush: "post" },
);

const serverIdentity = computed(
  () =>
    consoleState.value?.discovery?.value?.serverLabel ||
    consoleState.value?.server.hostname ||
    "Pact Server",
);

const enabledMountCount = computed(
  () => (consoleState.value?.runtime?.mounts || []).filter((mount) => mount.enabled).length || 0,
);

const totalMountCount = computed(
  () => (consoleState.value?.runtime?.mounts || []).length || 0,
);

const moduleRows = computed(() => {
  const configured = consoleState.value?.runtime?.mountModules || {};
  const runtimeMounts = consoleState.value?.runtime?.mounts || [];
  const names = Array.from(
    new Set([
      ...Object.keys(moduleNameLabels),
      ...Object.keys(configured),
      ...runtimeMounts.map((mount) => mount.name),
    ]),
  );

  return names.map((name) => {
    const runtimeMount = runtimeMounts.find((mount) => mount.name === name);
    const modulePath = mountDraft.value[name] ?? configured[name] ?? "";
    const configuredPath = String(modulePath || "").trim();
    const runtimeAvailable = Boolean(runtimeMount) && runtimeMount?.enabled !== false;

    return {
      name,
      label: moduleNameLabels[name] || name,
      description:
        moduleNameDescriptions[name] || "自定义外置能力模块，可通过路径接入。",
      modulePath,
      configuredPath,
      runtimeMount,
      externalEnabled: runtimeAvailable || configuredPath.length > 0,
      pathHint: configuredPath || (runtimeAvailable
        ? `当前使用内置模块：${runtimeMount?.id || name}`
        : "填写外置模块 .mjs 路径"),
    };
  });
});

const moduleGroups = computed(() => {
  const rows = moduleRows.value;
  const groupedNames = new Set(
    moduleGroupDefinitions.flatMap((group) => group.names),
  );
  const configuredGroups = moduleGroupDefinitions
    .map((group) => ({
      ...group,
      rows: group.names
        .map((name) => rows.find((row) => row.name === name))
        .filter((row): row is (typeof rows)[number] => Boolean(row)),
    }))
    .filter((group) => group.rows.length > 0);
  const customRows = rows.filter((row) => !groupedNames.has(row.name));

  if (customRows.length === 0) {
    return configuredGroups;
  }

  return [
    ...configuredGroups,
    {
      id: "custom",
      label: "自定义模块",
      description: "运行时发现的自定义外置能力模块。",
      names: customRows.map((row) => row.name),
      rows: customRows,
    },
  ];
});

const currentAnalysisModule = computed(() => {
  const moduleId =
    settingsDraft.value.analysisModuleId ||
    consoleState.value?.runtime?.currentAnalysisModuleId;
  return (
    (consoleState.value?.runtime?.analysisModules || []).find((item) => item.id === moduleId) || null
  );
});

function moduleCapabilityText(item: (typeof moduleRows.value)[number]) {
  const mount = item.runtimeMount;

  if (!mount) {
    return "未加载运行实例";
  }

  const capabilities = [
    mount.supportsStructuredDocument ? "结构化文档" : "",
    mount.supportsTextExtraction ? "文本提取" : "",
    mount.supportsBatchHook ? "批次回调" : "",
  ].filter(Boolean);

  return capabilities.length > 0 ? capabilities.join(" / ") : "基础运行";
}

function analysisExecutionModeLabel(value?: string) {
  const normalized = String(value || "").toLowerCase();

  if (normalized === "hybrid") {
    return "混合分析";
  }

  if (normalized === "external") {
    return "外置模块";
  }

  if (normalized === "builtin") {
    return "内置模块";
  }

  return value || "内置模块";
}

function analysisModuleDescription() {
  if (!currentAnalysisModule.value) {
    return "未发现可用分析模块，将使用内置启发式分析。";
  }

  if (currentAnalysisModule.value.id === "builtin:heuristic-hybrid-v1") {
    return "内置启发式分析管线，用于事务、人物、时间线和关联网络生成。";
  }

  return currentAnalysisModule.value.description || "外置分析模块。";
}

function moduleStatusText(item: (typeof moduleRows.value)[number]) {
  if (!item.runtimeMount) {
    return item.configuredPath ? "等待重载" : "未加载运行实例";
  }

  if (item.runtimeMount?.enabled === false) {
    const reason = String(item.runtimeMount.reason || "").trim();
    return !reason || reason === "disabled" ? "已禁用" : reason;
  }

  return "可用";
}

function moduleEnabledLabel(enabled: boolean) {
  return enabled ? "已开启" : "已关闭";
}

function moduleAvailabilityLabel(item: (typeof moduleRows.value)[number]) {
  return item.runtimeMount?.enabled === false || !item.externalEnabled ? "不可用" : "可用";
}

function isMountPathEditing(name: string) {
  return editingMountPaths.value[name] === true;
}

function currentModulePathPlaceholder(item: (typeof moduleRows.value)[number]) {
  return item.pathHint || "填写外置模块 .mjs 路径";
}

async function toggleMountPathEdit(item: (typeof moduleRows.value)[number]) {
  if (!isMountPathEditing(item.name)) {
    editingMountPaths.value = {
      ...editingMountPaths.value,
      [item.name]: true,
    };
    return;
  }

  await saveMountModules(`mount:${item.name}`);
  editingMountPaths.value = {
    ...editingMountPaths.value,
    [item.name]: false,
  };
}

const attentionClientCount = computed(() => {
  const summary = consoleState.value?.clients.summary;

  if (!summary) {
    return 0;
  }

  return (
    summary.outdatedCount +
    summary.drainingCount +
    summary.bootstrapOnlyCount +
    summary.offlineCount +
    summary.unknownCount
  );
});

const activeJobCount = computed(() => {
  const summary = consoleState.value?.jobs.summary;
  return (summary?.queuedCount || 0) + (summary?.runningCount || 0);
});

const latestJob = computed(() => filteredJobs.value[0] || null);
const latestClient = computed(() => filteredClients.value[0] || null);

function jobElapsed(item: SplitJob) {
  return formatDuration(
    item.startedAt || item.createdAt,
    item.finishedAt || item.updatedAt,
  );
}

async function bootstrapConsoleRuntime() {
  await clearBrowserLocalStateFromUrl();
  authBootstrapping.value = true;
  const session = await refreshAuthState();
  if (!session?.bootstrap.required && session?.session.authenticated) {
    await refreshState({ silent: true });
    await refreshMonitorAlerts({ silent: true });
    await refreshKnowledgeConsole();
    await refreshContextCompiler({ silent: true });
    await restoreAgentExploreState();
    restoreInfoFeedHistory();
    void refreshCodexOAuthStatus();
    startServerEventSubscription();
    syncDashboardAlertInbox(liveDashboardAlerts.value);
  }
}

function ensureConsoleRuntimeInitialized() {
  if (consoleLifecycleInitialized) {
    return;
  }
  if (consoleLifecycleInitInProgress) {
    return;
  }
  consoleLifecycleInitInProgress = (async () => {
    try {
      await bootstrapConsoleRuntime();
      consoleLifecycleInitialized = true;
    } catch (nextError) {
      consoleLifecycleInitialized = false;
      throw nextError;
    } finally {
      consoleLifecycleInitInProgress = null;
    }
  })();
}

function cleanupConsoleRuntime() {
  stopCodexOAuthPolling();
  stopAgentExplorePolling();
  stopAgentExploreSplitResize();
  stopKnowledgeLogColumnResize();
  clearInfoFeedSummaryStreamTimer();
  clearPendingRefreshStateTimer();
  pendingRefreshStateOptions = null;
  pendingRefreshStateResolve?.();
  pendingRefreshStatePromise = null;
  pendingRefreshStateResolve = null;
  if (configTargetHighlightTimer) {
    window.clearTimeout(configTargetHighlightTimer);
    configTargetHighlightTimer = null;
  }
  stopServerEventSubscription();
  consoleLifecycleInitialized = false;
  consoleLifecycleInitInProgress = null;
}


export function useConsole() {
// ─── Router integration ──────────────────────────────────────────────────────
// Set the module-level router reference on first call so navigation functions
// (switchView, openAdmin, etc.) can push routes from module-level scope.
const _router = useRouter();
const _route = useRoute();
if (!_appRouter) {
  _appRouter = _router;
}

// Sync URL → state: when the user navigates via back/forward or direct URL,
// update the module-level navigation refs to match the route.
watch(
  _route,
  (r) => {
    const viewId = String(r.meta?.viewId ?? "");
    if (viewId && viewId !== currentView.value) {
      currentView.value = viewId as AppView;
    }
    if (viewId === "admin") {
      const slug = (String(r.params.section ?? "") || r.path.split("/").at(-1)) ?? "";
      const av = slugToAdminView(slug) as AdminView;
      if (av && av !== adminView.value) {
        adminView.value = av;
      }
    }
    if (viewId === "knowledge" && r.params.tab) {
      const tab = String(r.params.tab) as KnowledgeTab;
      if (visibleKnowledgeTabs.value.some((t) => t.id === tab) && tab !== knowledgeTab.value) {
        knowledgeTab.value = tab;
      }
    }
    if (viewId === "debug" && r.params.tab) {
      const tab = String(r.params.tab) as DebugTab;
      if (visibleDebugTabs.value.some((t) => t.id === tab) && tab !== debugTab.value) {
        debugTab.value = tab;
      }
    }
  },
  { immediate: true },
);

onMounted(() => {
  consoleLifecycleRefCount += 1;
  ensureConsoleRuntimeInitialized();
});

onUnmounted(() => {
  if (consoleLifecycleRefCount > 0) {
    consoleLifecycleRefCount -= 1;
  }
  if (consoleLifecycleRefCount > 0) {
    return;
  }
  cleanupConsoleRuntime();
});
  return {
    AGENT_EXPLORE_STORAGE_KEY, 
    AGENT_SELECTION_REFERENCE_LOG_LIMIT, 
    CLEAR_LOCAL_STATE_PARAM, 
    INFO_FEED_CONTEXT_CHARS_PER_TOKEN, 
    INFO_FEED_FETCH_RETRY_LIMIT, 
    INFO_FEED_STORAGE_KEY, 
    REFRESH_STATE_DELAY_MS, 
    acknowledgeMonitorAlert, 
    activeConsoleFeatureIds, 
    activeKnowledgeSources, 
    activeMonitorAlerts, 
    activeToolManagementToolCount, 
    addAgentPermissionGroup, 
    addChildWordCloud, 
    addKnowledgeSource, 
    addManualWordCloud,
    autoFillCloudWithAgent,
    fillingWordBagIds,
    addModelEntryBinding, 
    addModelProvider, 
    addModuleAgentProfileFromDraft, 
    addTermActionToCloud, 
    addTermInputToCloud, 
    addTermToCloud, 
    addVocabularyEntry, 
    addWordCloudCorpusPaths, 
    addableModelProviderOptionBarOptions, 
    addableModelProviders, 
    adminView, 
    adminViewTitleMap, 
    agentConfigurationAlertSummary, 
    agentConfigurationAlerts, 
    agentEvidencePreviewOpen, 
    agentExploreActiveIteration, 
    agentExploreActiveTabId, 
    agentExploreAgentOptions, 
    agentExploreAnswerHtml, 
    agentExploreClosedTabIds, 
    agentExploreConfiguredLimit, 
    agentExploreConfiguredMaxIterations, 
    agentExploreConfiguredMaxTokens, 
    agentExploreConfiguredTemperature, 
    agentExploreConfiguredToolChoice, 
    agentExploreContextWindowOptions, 
    agentExploreDocumentMarkdown, 
    agentExploreDraftTabs, 
    agentExploreEventLabel, 
    agentExploreEventStatus, 
    agentExploreEventTime, 
    agentExploreEvidenceRefs, 
    agentExploreForm, 
    agentExploreHiddenRunIds, 
    agentExploreHistory, 
    agentExploreHistoryPanelItems, 
    agentExploreHistorySortValue, 
    agentExploreHydrated, 
    agentExploreLinkedEvidenceRefs, 
    agentExploreMaxIterations, 
    agentExploreModelOptionLabel, 
    agentExplorePhaseLabel, 
    agentExplorePollTimer, 
    agentExploreProgress, 
    agentExploreProgressVisible, 
    agentExploreResult, 
    agentExploreResultKey, 
    agentExploreRunCoverage, 
    agentExploreRunInput, 
    agentExploreRunStatus, 
    agentExploreSessionFromResult, 
    agentExploreSessionLabel, 
    agentExploreSplitDragging, 
    agentExploreSplitLeftPercent, 
    agentExploreSplitRef, 
    agentExploreSplitStyle, 
    agentExploreStepOpen, 
    agentExploreStepSummary, 
    agentExploreSteps, 
    agentExploreTabBusy, 
    agentExploreTabMeta, 
    agentExploreTabTitle, 
    agentExploreTabs, 
    agentExploreThinkingModeOptions, 
    agentExploreThinkingParameters, 
    agentExploreTraceOpen, 
    agentExploreWorkspaceId, 
    agentModelAssignmentOptions, 
    agentModelOptionLabelCache, 
    agentModelOptionValueSet, 
    agentOptionsForModule, 
    agentPermissionGroupOptionBarOptions, 
    agentPermissionGroups, 
    agentSelectionAlert, 
    agentSelectionReferenceLogs, 
    agentSelectionReferenceStates, 
    agentSelectorOptions, 
    allMaintenanceAgentRuns, 
    activeJobCount, 
    attentionClientCount, 
    analysisModuleOptionBarOptions, 
    analysisExecutionModeLabel, 
    analysisModuleDescription, 
    currentAnalysisModule, 
    appendInfoFeedTurnSnapshot, 
    applyAgentExploreDefaultsFromSettings, 
    applyAgentExploreDraftTab, 
    applyConsoleState, 
    applyInfoFeedSummaryAnswer, 
    applyJobToKnowledgeSources, 
    applyKnowledgeSourceState, 
    applyLocalSourceDirectoryPath, 
    applyRemoteConsoleDraftUpdate, 
    applySavedWordCloudSet, 
    applyServerEvent, 
    applyingRemoteConsoleDrafts, 
    applyingRemoteSettings, 
    approveMaintenanceAgentRun, 
    archiveInfoFeedExpertFeedback, 
    asRecord, 
    assetIdsEmbeddedInHtml, 
    assetUrlForReference, 
    authAudit, 
    authBootstrapping, 
    authRoleOptionBarOptions, 
    authSessions, 
    authState, 
    authUsers, 
    autoApproveRiskOptionBarOptions, 
    backgroundProcessLabel, 
    backgroundProcessStatus, 
    backgroundProcessTone, 
    backgroundProcesses, 
    backgroundRunningCount, 
    backgroundSupervisorLabel, 
    baseServerEventTopics, 
    baseServerLogRows, 
    beginCodexOAuthLogin, 
    boundedAgentExploreNumber, 
    buildFallbackInfoFeedClarification, 
    buildInfoFeedAgentQuery, 
    buildInfoFeedSourceContext, 
    buildInfoFeedSourceSearchQuery, 
    buildInfoFeedSummaryQuestion, 
    buildKnowledgeRecallSearchPayload, 
    buildRuleAuthoringManualMessage, 
    busyKey, 
    cacheAgentModelOptionLabels, 
    canAdminAuth, 
    canAdminKnowledge, 
    canAdminMaintenanceAgent, 
    canAdminRuntime, 
    canApproveMaintenanceAgent, 
    canBrowseServerPaths, 
    canMaintainKnowledge, 
    canReadKnowledge, 
    canReadMaintenanceAgent, 
    canRunMaintenanceAgent, 
    canWriteJobs, 
    canWriteKnowledge, 
    cancelMaintenanceAgentRun, 
    candidateTextFromRecord, 
    chatMaintenanceAgent, 
    chooseInfoFeedClarification, 
    clampAgentExploreSplitPercent, 
    clearBrowserCacheStorage, 
    clearBrowserLocalStateFromUrl, 
    clearIndexedDbDatabases, 
    clearInfoFeedRetryState, 
    clearInfoFeedSummaryStreamTimer, 
    clearInvalidAgentExploreModelReferences, 
    clearInvalidInfoFeedModelReferences, 
    clearPendingRefreshStateTimer, 
    clearRemovedTermsFromCloud, 
    clearServerEventTimer, 
    clearWordCloudCorpusPaths, 
    clientMigrationMessages, 
    clientRuntimeCoolingLabel, 
    clientRuntimeCoolingPolicyText, 
    clientRuntimeCoolingTone, 
    clientRuntimeHeatRows, 
    clientRuntimeHeatStyle, 
    clientRuntimeReasonLabel, 
    clientRuntimeStatus, 
    clientRuntimeSummary, 
    clientRuntimeSurfaceText, 
    clientRuntimeTaskText, 
    clientSearchQuery, 
    clientStateFilter, 
    clientStateFilterOptionBarOptions, 
    cloneExpertVocabulary, 
    cloneWordCloudSet, 
    closeAgentEvidencePreview, 
    closeAgentExploreTab, 
    closeDrawer, 
    closeServerPathPicker, 
    codexOAuthLogin, 
    codexOAuthPollTimer, 
    codexOAuthStatus, 
    collapsedWordBagIds, 
    pinnedWordBagIds, 
    collectModelEntryBindings, 
    collectSystemStatusLogRows, 
    compactInfoFeedAttachment, 
    compactInfoFeedRunForStorage, 
    compactReadableText, 
    configTargetElement, 
    configTargetHighlightTimer, 
    confirmServerPathPicker, 
    consoleState, 
    contextBuildRecordRows, 
    contextBuildRecordsResponse, 
    contextEvaluationResult, 
    contextPreviewPayload, 
    contextPreviewRequiredEvidence, 
    contextPreviewResult, 
    contextPreviewTask, 
    contextProfileRows, 
    contextProfilesResponse, 
    contextWindowOptionBarOptions, 
    continueInfoFeedAfterModelSelection, 
    continueInfoFeedAfterRetry, 
    continueInfoFeedCurrentRun, 
    copyAgentExploreDocument, 
    copyInfoFeedSummary, 
    copyIssuedToolToken, 
    copyTextToClipboard, 
    createAgentExploreDraftTab, 
    createDefaultWordCloudSet, 
    createGrant, 
    createInfoFeedFollowUpContext, 
    createInfoFeedRun, 
    csvCell, 
    currentAgentExploreQuery, 
    currentAgentModelOptionLabel, 
    currentKnowledgeLearningEnabled, 
    currentKnowledgeRetrievalSettings, 
    currentKnowledgeSearchLimit, 
    currentMaintenanceTask, 
    currentMaintenanceTaskSupportsDryRun, 
    currentServerEventTopics, 
    currentUser, 
    currentUserScopes, 
    currentView, 
    customHttpAdapterAlias, 
    customHttpAdapterLabel, 
    dashboardAlertInbox, 
    dashboardAlertInboxId, 
    dashboardAlertSummary, 
    dashboardAlerts, 
    dashboardMonitorAlerts, 
    debugTab, 
    debugTabs, 
    decodeBytes, 
    decodeMimeBody, 
    decodeMimeWords, 
    decodeQuotedPrintableToBytes, 
    decodeURIComponentSafe, 
    dedupeLogRows, 
    defaultAgentPermissionGroups, 
    delayMs, 
    deleteAgentExploreHistoryItem, 
    deleteAgentExploreHistorySession, 
    deleteGrant, 
    deleteInfoFeedHistory, 
    deleteInfoFeedHistoryItem, 
    deleteJob, 
    deleteKnowledgeSource, 
    deleteVocabularyEntry, 
    directoryNameFromPath, 
    disableMountModule, 
    discoveryDraft, 
    discoveryDraftDirty, 
    discoveryModeOptionBarOptions, 
    dismissDashboardAlert, 
    dismissedDashboardAlertIds, 
    displayedClients, 
    displayedMaintenanceAgentRuns, 
    displayedVocabularyEntries, 
    downloadTextFile, 
    drawerOpen, 
    drawerTab, 
    duplicateModelEntry, 
    editingMountPaths, 
    emailDepartmentRules, 
    emailHeaderValue, 
    emailReportSeriesRules, 
    emailRulesDraft, 
    emailSubjectFromText, 
    emailSynonymRules, 
    emailToSafeHtml, 
    embedEvidenceAssets, 
    emitAgentSelectionReferenceLog, 
    emptyDiscovery, 
    emptyExpertVocabulary, 
    emptySettings, 
    enableMountModule, 
    enabledBooleanOptionBarOptions, 
    enabledStringOptionBarOptions, 
    enabledToolGrantCount, 
    ensureAgentPermissionGroupsDraft, 
    ensureCodexOAuthReady, 
    ensureModuleAgentGroup, 
    ensureModuleAgentProfile, 
    error, 
    errorNeedsKnowledgeImportAction, 
    escapeHtmlText, 
    escapeRegexText, 
    estimateInfoFeedContextTokens, 
    evidenceAssetHintValues, 
    evidenceAssets, 
    evidenceDisplayTitle, 
    evidenceIdFromHref, 
    evidenceLoadError, 
    evidenceLoadSequence, 
    evidenceMainText, 
    evidencePrimaryText, 
    evidenceReadableHtml, 
    evidenceReadableKind, 
    evidenceReadableKindLabel, 
    evidenceReasonText, 
    evidenceRefHref, 
    evidenceSourceDetails, 
    evidenceSourceHint, 
    executeInfoFeedRunIteration, 
    expertRuleEnabled, 
    expertVocabularyDraft, 
    expertVocabularyDraftDirty, 
    exportAgentExploreDocument, 
    exportAgentModelEntryConfig, 
    exportClients, 
    exportContextBuildRecords, 
    exportInfoFeedSummary, 
    exportKnowledgeLogRows, 
    extractEmailRenderablePart, 
    extractEvidenceRefsFromText, 
    extractInfoFeedClarification, 
    fallbackInfoFeedSummary, 
    filter, 
    filteredClientList, 
    filteredClients, 
    filteredJobs, 
    filteredKnowledgeLogRows, 
    findWordCloudInTree, 
    flattenWordCloudCards, 
    formatBytes, 
    formatWordCloudThreshold, 
    formatCompactDate, 
    formatDate, 
    formatDuration, 
    formatFileSize, 
    formatMachineDate, 
    fuseKnowledgeReview, 
    goldenRuleItems, 
    goldenRulePackageTitle, 
    goldenRulePackages, 
    goldenRulesState, 
    grantHasScope, 
    grantHasToolset, 
    grantToolRuleState, 
    handleAgentAnswerClick, 
    handleAgentExploreSplitKeydown, 
    handleAgentExploreSplitPointerMove, 
    handleAgentExploreTraceToggle, 
    handleCloudProviderChange, 
    handleInfoFeedAttachmentFiles, 
    handleKnowledgeLogColumnDividerKeydown, 
    handleKnowledgeLogColumnPointerMove, 
    handleKnowledgeLogTableScroll, 
    hasAgentModelOption, 
    hasAnyFeature, 
    hasFeature, 
    hasOpenAiModelUsage, 
    hasScope, 
    hiddenVocabularyEntryCount, 
    highlightedConfigTarget, 
    htmlMetaHeader, 
    htmlToReadableText, 
    hydrateSearchResultPreview, 
    imageEvidenceAssets, 
    importClients, 
    inactiveAgentModelOption, 
    inferRuleDraftFromMessage, 
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
    ingestFiles, 
    ingestJob, 
    ingestProgress, 
    initialInfoFeedAgentState, 
    initialInfoFeedKeywordState, 
    initialInfoFeedSummaryState, 
    intelligentModuleDefinitions, 
    internalToolManagementToolCount, 
    isAbortError, 
    isAdminViewEnabled, 
    isAgentExploreDraftSession, 
    isAuthenticated, 
    isHiddenEmailElement, 
    isImageAsset, 
    isInfoFeedRetryExhaustedError, 
    isLowRelevanceSourceResult, 
    isModelConfigurationError, 
    isModelLibraryCardExpanded, 
    isReadableInfoFeedAttachment, 
    isTransientFetchError, 
    issuedToolToken, 
    jaccardSimilarity, 
    jobStatusLabels, 
    jobStatusTone, 
    jsonPreview, 
    jumpToKnowledgeFileImport, 
    knowledgeConfigGroupDescription, 
    knowledgeConsole, 
    knowledgeFusionSummary, 
    knowledgeLogAdvancedOpen, 
    knowledgeLogColumnDividers, 
    knowledgeLogColumnLabels, 
    knowledgeLogColumnMinWidths, 
    knowledgeLogColumnOrder,
    knowledgeLogColumnWidths,
    knowledgeLogFilters,
    knowledgeLogResizing,
    knowledgeLogStatusOptionBarOptions,
    knowledgeLogStatusOptions,
    knowledgeLogTableScrollLeft,
    knowledgeLogTableShellRef,
    knowledgeMaintenanceDraft,
    knowledgeMaintenanceTaskDescription,
    knowledgeManagementPanel,
    knowledgeManagementPanelOptionBarOptions,
    knowledgeModules,
    knowledgeRecallDebugForm,
    knowledgeRecallDebugGridStyle,
    knowledgeRecallDebugParameterSummary,
    knowledgeRecallDebugRuns,
    knowledgeRecentJobs,
    knowledgeResultAssetCount,
    knowledgeResultEvidenceId, 
    knowledgeResultHierarchyPath, 
    knowledgeResultScore, 
    knowledgeResultSnippet, 
    knowledgeResultTitle, 
    knowledgeReviewBusyGeneration, 
    knowledgeReviewCanResolveWithDocument, 
    knowledgeReviewCurrentDocuments, 
    knowledgeReviewDetailText, 
    knowledgeReviewDocumentLine, 
    knowledgeReviewFusionPrompt, 
    knowledgeReviewIncomingDocument, 
    knowledgeReviewItems, 
    knowledgeReviewPrimaryCurrentDocument, 
    knowledgeReviewReasonLabel, 
    knowledgeReviewRecordPreview, 
    knowledgeReviewRequestGeneration, 
    knowledgeReviewResolvedAction, 
    knowledgeReviewRowClassName, 
    knowledgeReviewSimilarity, 
    knowledgeReviewSourceLabel, 
    knowledgeReviewStatus, 
    knowledgeReviewStatusLabel, 
    knowledgeReviewStatusOptionBarOptions, 
    knowledgeReviewTitle, 
    knowledgeReviewTone, 
    knowledgeSchema, 
    knowledgeSearchEmpty, 
    knowledgeSearchExpanded, 
    knowledgeSearchForm, 
    knowledgeSearchResponse, 
    knowledgeSearchResults, 
    knowledgeSourceState, 
    knowledgeStatus, 
    knowledgeTab, 
    knowledgeTabDisplayLabel, 
    knowledgeTabs, 
    lastKnowledgeSearchQuery, 
    lastRefreshStateStartedAt, 
    latestMaintenanceAgentRun, 
    linkifyEvidenceRefsInMarkdown, 
    liveDashboardAlerts, 
    loadAgentExploreHistoryFromServer, 
    loadAgentExploreSession, 
    loadEvidence, 
    localSourceForm, 
    loginForm, 
    logoutConsole, 
    maintenanceAgentConfig, 
    maintenanceAgentMessage, 
    maintenanceAgentModelAlias, 
    maintenanceAgentResultJson, 
    maintenanceAgentRiskLabel, 
    maintenanceAgentRunbook, 
    maintenanceAgentRunbookOptionBarOptions, 
    maintenanceAgentRunbooks, 
    maintenanceAgentRuns, 
    maintenanceAgentSchedules, 
    maintenanceAgentStatusLabel, 
    maintenanceAgentStatusTone, 
    maintenanceAgentSummary, 
    maintenanceConfirm, 
    maintenanceDryRun, 
    maintenanceFieldValue, 
    maintenanceJson, 
    maintenanceResultJson, 
    maintenanceTaskOptionBarOptions, 
    makeInfoFeedId, 
    markdownToSafeHtml, 
    mergeRefreshStateOptions, 
    migrationProgress, 
    migrationStateLabels, 
    migrationTone, 
    modelAgentUid, 
    modelEntryAllowsModule, 
    modelEntryBindingSummary, 
    modelEntryBindings, 
    modelEntryBindingsByKey, 
    modelEntryConfigured, 
    modelEntryIsBound, 
    modelEntryMatchesAssignment, 
    modelEntryMatchesUid, 
    modelEntryModuleAccess, 
    modelEntryParameters, 
    modelEntryProbeResult, 
    modelEntryProbeStatusLabel, 
    modelEntryProbeStatusTone, 
    modelEntryStatusKey, 
    modelEntryStatusLabel, 
    modelEntryStatusTone, 
    modelEntryStringField, 
    modelEntryUidSet, 
    modelLibraryExpandedCards, 
    modelLibraryProviderDefinitions, 
    modelLibrarySaveProbeNotices, 
    modelProbeFailureResult, 
    modelProbeResults, 
    modelProbeSettingsForEntry, 
    modelProviderDefinition, 
    modelProviderFromRef, 
    modelRef, 
    moduleAccessModeOptionBarOptions, 
    moduleAgentCandidateDrafts, 
    moduleAgentProfileJson, 
    moduleAgentProfileRows, 
    moduleAgentProfilesPayload, 
    moduleAvailabilityLabel, 
    moduleCapabilityText, 
    moduleGroups,
    moduleStatusText, 
    currentModulePathPlaceholder, 
    enabledMountCount, 
    moduleGroupDefinitions, 
    moduleModelAssignmentOptions, 
    moduleModelAssignmentSelectOptions, 
    moduleModelAssignmentStats, 
    moduleModelRef, 
    moduleNameDescriptions, 
    moduleNameLabels, 
    moduleNeedsIntelligence, 
    isMountPathEditing, 
    toggleMountPathEdit, 
    totalMountCount, 
    monitorAlertConfigText, 
    monitorAlertSeverityLabel, 
    monitorAlertSeverityTone, 
    monitorAlertState, 
    monitorAlertSummary, 
    mountDraft, 
    mountDraftDirty, 
    mutateWordCloudDraft, 
    newGrantLabel, 
    newGrantScopes, 
    newGrantToolsets, 
    nextMaintenanceAgentRunAt, 
    normalizeAgentExploreHistoryList, 
    normalizeAgentExploreRun, 
    normalizeAgentModuleAccess, 
    normalizeAgentPermissionGroupDraft, 
    normalizeAgentPermissionGroupsDraft, 
    normalizeAgentSelectionAlias, 
    normalizeAgentSelectorOption, 
    normalizeAssetReference, 
    normalizeCharset, 
    normalizeCidToken, 
    normalizeHttpAdapterSettings, 
    normalizeInfoFeedClarificationOption, 
    normalizeInfoFeedHistory, 
    normalizeModelEntry, 
    normalizeModelLibraryAgents, 
    normalizeModelLibraryEntries, 
    normalizeModuleAgentProfile, 
    normalizeModuleAgentProfilesForDraft, 
    normalizeRefreshStateOptions, 
    normalizeRenderedText, 
    normalizeSearchResults, 
    normalizeWordCloudCloudForUi, 
    normalizeWordCloudCorpusPathForUi, 
    normalizeWordCloudCorpusPathsForUi, 
    normalizeWordCloudSetForUi, 
    normalizeWordCloudTermForUi, 
    normalizedAgentExploreThinkingMode, 
    normalizedManifest, 
    normalizedSettingsFromServer, 
    oidcAllowedDomainsText, 
    oidcDraft, 
    oidcRoleMappingText, 
    onIngestFilesSelected, 
    openAdmin, 
    openAgentConfigurationAlert, 
    openAgentEvidencePreview, 
    openDashboardAlert, 
    openDebugTab, 
    openDrawer, 
    openInfoFeedHistoryRun, 
    openKnowledgeSearchResult, 
    openKnowledgeTab, 
    openLocalSourceDirectoryPicker, 
    openMountPathPicker, 
    openPathEntry, 
    openServerPathPicker, 
    openSettingsPathPicker, 
    openWordCloudCorpusDirectoryPicker, 
    openWordCloudCorpusFilePicker, 
    optionLabel, 
    padDatePart, 
    parseEmailHeaders, 
    parseEmailRulesDraft, 
    parseFilterDate, 
    parseHeaderParams, 
    parseKnowledgeRecallTopKValues, 
    parseModelRef, 
    parseTime, 
    patchMaintenanceAgentState, 
    pathEntryMeta, 
    pathPicker, 
    pathPickerModeLabel, 
    pendingKnowledgeReviewCount, 
    pendingMaintenanceApprovalCount, 
    pendingRefreshStateOptions, 
    pendingRefreshStatePromise, 
    pendingRefreshStateResolve, 
    pendingRefreshStateTimer, 
    performRefreshState, 
    permissionGroupHasScope, 
    permissionGroupHasToolset, 
    permissionGroupLabel, 
    persistAgentExploreState, 
    persistInfoFeedHistory, 
    persistWordCloudCorpusPaths, 
    plainTextToHtml, 
    plannerModeOptionBarOptions, 
    policyPreviewGrant, 
    policyPreviewGrantId, 
    policyPreviewProfileId, 
    policyPreviewProfileOptionBarOptions, 
    policyPreviewResult, 
    policyPreviewToolId, 
    policyPreviewToolOptionBarOptions, 
    preferredWordCloudCorpusPaths, 
    previewContextCompiler, 
    previewToolDefinition, 
    previewToolPolicy, 
    probeModel, 
    probeModelEntry, 
    probeModelLibraryBeforeSave, 
    processRelationText, 
    processTypeLabel, 
    profileLabel, 
    proposeWordCloud, 
    providerConfigured, 
    providerLabel, 
    providerStatusLabel, 
    providerStatusTone, 
    publishRuleAuthoringPackage, 
    jobElapsed,
    queueLifecycleLabel, 
    queueLifecycleTone, 
    queueMonitorDetail, 
    queueMonitorItems, 
    queueMonitorState, 
    workQueueRows,
    workQueueSummary, 
    queueSourceLabel, 
    readAgentExplorePersistence, 
    readInfoFeedAttachment, 
    readNestedValue, 
    readableSnippetFromText, 
    recalculateJobSummary, 
    recentJobs, 
    recentMonitorAlertHistory, 
    recordConsoleKnowledgeFeedback, 
    redactAgentModelEntryForExport, 
    redactedProviderSettingsForAgentExport, 
    refreshAuthAdmin, 
    refreshAuthState, 
    refreshBackgroundProcesses, 
    refreshClientRuntimeStatus, 
    refreshCodexOAuthStatus, 
    refreshContextCompiler, 
    refreshDashboardAlertsSnapshot, 
    refreshExpertRules, 
    refreshIngestJob, 
    refreshKnowledgeConflicts, 
    refreshKnowledgeConsole, 
    refreshKnowledgeSource, 
    refreshKnowledgeSources, 
    refreshMaintenanceAgent, 
    refreshMonitorAlerts, 
    refreshServerPathBrowser, 
    refreshState, 
    refreshSystemStatusLogs, 
    refreshToolManagement, 
    refreshWordCloud, 
    refreshWordCloudCorpusTerms, 
    reloadModules, 
    remoteDraftEquals, 
    removeAgentPermissionGroup, 
    removeInfoFeedAttachment, 
    removeJobFromEvent, 
    removeModelProvider, 
    removeModuleAgentProfile, 
    removeSelectedWordCloud, 
    removeTermFromCloud, 
    removeWordCloudCorpusPath, 
    renderEmailFrame, 
    renderEmailImage, 
    renderEmailNode, 
    renderEvidenceImageGallery, 
    renderEvidenceReadableHtml, 
    renderReadableHtmlDocument, 
    renderedHtmlHasBlocks, 
    replaceDiscoveryDraftFromServer, 
    replaceExpertVocabularyDraftFromServer, 
    replaceMountDraftFromServer, 
    replaceRulesDraftFromServer, 
    replaceSettingsDraftFromServer, 
    requestClientMigration, 
    resetInfoFeedRunForContinuation, 
    resetKnowledgeAgentExplore, 
    resolveKnowledgeReview, 
    resolveWordCloudCorpusPathsForQuery, 
    restoreAgentExploreState, 
    restoreInfoFeedHistory, 
    retrievalModeOptionBarOptions, 
    revokeConsoleSession, 
    rewriteInlineAssetRefs, 
    rotateGrant, 
    ruleActionOptionBarOptions, 
    ruleActionOptions, 
    ruleAuthoringCanSubmit, 
    ruleAuthoringDraftPayload, 
    ruleAuthoringEffectiveMessage, 
    ruleAuthoringForm, 
    ruleAuthoringHistory, 
    ruleAuthoringManualSummary, 
    ruleAuthoringModelOptions, 
    ruleAuthoringResult, 
    ruleAuthoringStatusLabel, 
    ruleCreationMode, 
    ruleMatchStrategyOptionBarOptions, 
    ruleMatchStrategyOptions, 
    ruleScopeOptionBarOptions, 
    ruleScopeOptions, 
    rulesDraftDirty, 
    rulesText, 
    runContextReplayEvaluation, 
    runInfoFeed, 
    runInfoFeedAgentTrack, 
    runInfoFeedKeywordTrack, 
    runInfoFeedSummaryAgent, 
    runKnowledgeAgentExplore, 
    runKnowledgeMaintenanceTask, 
    runKnowledgeRecallDebugBatch, 
    runMaintenanceAgentRunbook, 
    runModelEntryProbe, 
    runRuleAuthoringChat, 
    runServerEventSubscription, 
    safeDownloadName, 
    safeEmailImageSrc, 
    safeLinkHref, 
    safeMediaSrc, 
    sanitizeAgentExploreSessionModelReference, 
    sanitizeEmailCssUrls, 
    sanitizeEmailFrameDocument, 
    sanitizeHtmlContent, 
    sanitizeInfoFeedRunModelReferences, 
    saveAgentPermissionSettings, 
    saveDiscovery, 
    saveExpertVocabulary, 
    saveKnowledgeMaintenance, 
    saveMaintenanceAgentConfig, 
    saveModelLibrarySettings, 
    saveModuleSettings, 
    saveMonitorAlertConfig, 
    saveMountModules, 
    saveOidcConfig, 
    saveRules, 
    saveSettings, 
    saveWordCloud,
    scheduleDelayedRefreshState,
    scopeLabel,
    scrollToConfigTarget,
    searchKnowledge,
    selectAgentExploreHistoryItem,
    selectInfoFeedHistoryItem,
    selectKnowledgeManagementPanel,
    selectKnowledgeReviewItem,
    selectServerPath,
    selectToolForManagement,
    selectWordCloud,
    selectedAgentExploreContextProfile,
    selectedAgentExploreModel, 
    selectedAgentExploreThinkingMode, 
    selectedAgentFromOptions, 
    selectedEvidence, 
    selectedEvidenceBlocks, 
    selectedEvidenceDisplayTitle, 
    selectedEvidenceDocument, 
    selectedEvidenceId, 
    selectedEvidencePayload, 
    selectedEvidenceSection, 
    selectedInfoFeedContextProfile, 
    selectedInfoFeedModel, 
    selectedKnowledgeReviewFusionModel, 
    selectedKnowledgeReviewId, 
    selectedKnowledgeReviewItem, 
    selectedMaintenanceAgentRun, 
    selectedMaintenanceTask, 
    selectedModelProvider, 
    selectedRuleAuthoringModel, 
    selectedToolManagementTool, 
    selectedToolManagementToolId, 
    selectedWordCloud, 
    selectedWordBagId, 
    selectedWordCloudModel, 
    serverEventAbortController, 
    serverEventCursor, 
    serverEventSubscriptionGeneration, 
    serverEventSubscriptionStopped, 
    serverEventTimer, 
    serverEventTimerResolve, 
    serverLogRows, 
    setEmailRuleEntryEnabled, 
    setGrantToolRule, 
    setInfoFeedRetryState, 
    setMaintenanceFieldFromEvent, 
    setMaintenanceFieldValue, 
    setModelEntryModuleAccessMode, 
    setModelEntryPermissionGroup, 
    setModuleAgentProfileEnabled, 
    setModuleModelRef, 
    setModuleNeedsIntelligence, 
    setVocabularyEntryEnabled, 
    setWordCloudDraftCorpusPaths, 
    setWordCloudDraftFromState, 
    setWordCloudTermInput, 
    settingsDraft, 
    settingsDraftDirty, 
    settingsDraftEquals, 
    settingsPayloadForSave, 
    shortId, 
    showAllVocabularyEntries, 
    sideNavOpen, 
    snapshotInfoFeedAttachments, 
    snapshotInfoFeedTurn, 
    sourceDownloadStatusLabel, 
    sourceIndexStatusLabel, 
    sourceJobProgress, 
    sourceSyncLabel, 
    sourceSyncTone, 
    splitJobStatusLabel, 
    splitMimeParts, 
    splitVocabularyList, 
    startAgentExplorePolling, 
    startAgentExploreSplitResize, 
    startCodexOAuthPolling, 
    startKnowledgeLogColumnResize, 
    startServerEventSubscription, 
    stopAgentExplorePolling, 
    stopAgentExploreSplitResize, 
    stopCodexOAuthPolling, 
    stopKnowledgeLogColumnResize, 
    stopServerEventSubscription, 
    streamInfoFeedSummary, 
    submitLoginAuth, 
    switchAgentExploreTab, 
    switchView, 
    syncActiveAgentExploreDraftFromForm, 
    syncDashboardAlertInbox, 
    syncInfoFeedExpertFeedback, 
    syncKnowledgeLogTableScrollLeft, 
    syncLocalSourceLabelFromPath, 
    syncingRuleAuthoringDraft, 
    thinkingModeOptionBarOptions, 
    toggleGoldenRuleEnabled, 
    toggleGrantScope, 
    toggleGrantToolset, 
    toggleModelEntryModuleAccess, 
    toggleModelLibraryCard, 
    toggleNewGrantScope, 
    toggleNewGrantToolset, 
    togglePermissionGroupScope, 
    togglePermissionGroupToolset, 
    toggleWordCloudActionMenu, 
    toggleWordCloudCollapsed, 
    pinWordCloud, 
    tokenizeKnowledgeReviewText, 
    toolCatalog, 
    toolGrants, 
    toolManagementAuditItems, 
    toolManagementCatalogState, 
    toolManagementGrantsState, 
    toolManagementMetricsState, 
    toolManagementProfiles, 
    toolManagementRiskRows, 
    toolManagementStatusRows, 
    toolManagementTools, 
    toolManagementToolsets, 
    toolRiskLabel, 
    toolScopes, 
    toolStatusLabel, 
    toolsetLabel, 
    traceProgressPercent, 
    trackAgentSelectionReference, 
    truncateInfoFeedText, 
    uniqueEvidenceRefs, 
    unregisterServiceWorkers, 
    updateAgentExploreSplitFromClientX, 
    updateConsoleUser, 
    updateConsoleUserRole, 
    updateConsoleUserRoleFromEvent, 
    updateGrant, 
    updateKnowledgeSource, 
    updateSelectedWordCloudField, 
    updateVocabularyDomains, 
    updateVocabularyEntry, 
    updateVocabularyKeywords, 
    updateVocabularyPath, 
    updateWordCloudField, 
    uploadFilesToKnowledge, 
    uploadTraceDetailText, 
    uploadTraceEvents, 
    uploadTraceTone, 
    upsertAgentExploreHistory, 
    upsertInfoFeedHistory, 
    upsertJobFromEvent, 
    validAgentModelAlias, 
    viewTitle, 
    viewTitleMap, 
    visibleDebugTabs, 
    visibleKnowledgeTabs, 
    visibleModelEntries, 
    visibleModelProviders, 
    vocabularyEntryPath, 
    vocabularySearch, 
    vocabularyStatusOptionBarOptions, 
    waitForServerEventRetry, 
    watchAgentSelectionReference, 
    withInfoFeedFetchRetry, 
    wordBagActionMenuId, 
    wordCloudCanvasClouds, 
    wordCloudCardRows, 
    wordCloudCardStyle, 
    wordCloudCorpusPathLabel, 
    wordCloudCorpusPathSummary, 
    wordCloudCorpusPaths, 
    wordCloudDraft, 
    wordCloudMessages, 
    wordCloudModelAlias, 
    wordCloudModelOptions, 
    wordCloudPalette, 
    wordCloudPrompt, 
    wordCloudState, 
    wordCloudTermFrequencyMap, 
    wordCloudTermIdentity, 
    wordCloudTermInputs, 
    wordCloudTermWithFrequency, 
    wordCloudTerms, 
    wordCloudVisibleTerms, 
    writeAgentExplorePersistence, 
    writeNestedValue, 
  };
}
