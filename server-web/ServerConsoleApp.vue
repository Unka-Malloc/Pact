<script setup lang="ts">
import { marked } from "marked";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import BrowseSelectButton from "./components/BrowseSelectButton.vue";
import { bridge } from "./lib/bridge";
import type {
  AgentSettings,
  AgentModelConfig,
  BackgroundProcessStatus,
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
  MaintenanceAgentConfig,
  MaintenanceAgentRun,
  MaintenanceSettings,
  MonitorAlertState,
  ModelProbeResponse,
  NormalizedDocumentsManifest,
  ProtocolEvent,
  ServerPathBrowseEntry,
  ServerPathBrowseResponse,
  ServerConsoleState,
  SplitJob,
  SplitJobStatus,
  ToolManagementAuditItem,
  ToolManagementCatalog,
  ToolManagementMetrics,
  ToolManagementProfile,
  ToolManagementTool,
  ToolManagementToolset,
  ToolPlatformGrant,
} from "./lib/types";

type DrawerTab =
  | "discovery"
  | "users"
  | "modules";
type AppView =
  | "dashboard"
  | "feed"
  | "sources"
  | "knowledge"
  | "intelligence"
  | "admin";
type RuleAuthoringMode = "chat" | "manual";
type AdminView =
  | "jobs"
  | "tools"
  | "agentConfig"
  | "maintenanceAgent"
  | "clients"
  | "storage"
  | "modules";
type KnowledgeTab = "overview" | "ingest" | "conflicts" | "logs" | "maintenance";
type KnowledgeLogRow = {
  logId: string;
  kindLabel: string;
  displayId: string;
  target: string;
  status: string;
  statusLabel: string;
  tone: string;
  stage: string;
  occurredAt: string;
  createdAt: string;
  progressPercent: number;
  detail: string;
  error: string;
};
type AgentExploreSession = {
  runId: string;
  workspaceId: string;
  query: string;
  modelAlias: string;
  contextProfileId: string;
  maxIterations: number;
  limit: number;
  status: string;
  answerPreview: string;
  updatedAt: string;
};
type ModelEntryBinding = {
  bindingId: string;
  category: string;
  label: string;
  detail: string;
  source: "draft" | "settings" | "runtime";
};
type AgentConfigurationAlert = {
  alertId: string;
  category: string;
  title: string;
  detail: string;
  status: string;
  tone: "warning" | "danger";
  view: AppView;
  adminView?: AdminView;
  targetId: string;
};
type InfoFeedStageStatus = "idle" | "running" | "completed" | "failed";
type InfoFeedAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  status: InfoFeedStageStatus;
  progress: number;
  text: string;
  error: string;
};
type InfoFeedClarificationOption = {
  optionId: string;
  label: string;
  description: string;
  followUpQuestion: string;
};
type InfoFeedExpertFeedbackAnchor = "summary" | "report";
type InfoFeedClarification = {
  questionId: string;
  prompt: string;
  reason: string;
  anchor: InfoFeedExpertFeedbackAnchor;
  status: "open" | "answered";
  selectedOptionId: string;
  options: InfoFeedClarificationOption[];
};
type InfoFeedExpertFeedback = {
  feedbackId: string;
  questionId: string;
  anchor: InfoFeedExpertFeedbackAnchor;
  prompt: string;
  reason: string;
  selectedOptionId: string;
  selectedLabel: string;
  selectedDescription: string;
  followUpQuestion: string;
  sourceQuery: string;
  createdAt: string;
  syncedAt: string;
  syncStatus: "pending" | "synced" | "failed";
  syncError: string;
};
type InfoFeedTurnSnapshot = {
  turnId: string;
  query: string;
  followUpQuestion: string;
  attachments?: InfoFeedAttachment[];
  completedAt: string;
  summaryAnswer: string;
  summaryError: string;
  summaryFallback: boolean;
  summaryModelAlias: string;
  evidenceRefs: string[];
  expertFeedback: InfoFeedExpertFeedback[];
};
type InfoFeedRetryStage = "keyword" | "agent" | "summary";
type InfoFeedRetryState = {
  stage: InfoFeedRetryStage;
  attempts: number;
  limit: number;
  error: string;
  updatedAt: string;
};
type InfoFeedRunState = {
  runId: string;
  query: string;
  startedAt: string;
  completedAt: string;
  attachments: InfoFeedAttachment[];
  followUp?: {
    parentRunId: string;
    parentQuery: string;
    question: string;
    parentSummary: string;
    parentEvidenceRefs: string[];
  };
  clarification?: InfoFeedClarification;
  expertFeedback: InfoFeedExpertFeedback[];
  turns: InfoFeedTurnSnapshot[];
  keyword: {
    status: InfoFeedStageStatus;
    progress: number;
    stage: string;
    fromCache: boolean;
    response: KnowledgeSearchResponse | null;
    error: string;
  };
  agent: {
    status: InfoFeedStageStatus;
    progress: number;
    runId: string;
    workspaceId: string;
    response: AgentExploreRunResponse | null;
    error: string;
  };
  summary: {
    status: InfoFeedStageStatus;
    progress: number;
    modelAlias: string;
    contextProfileId: string;
    parametersOpen: boolean;
    temperature?: number;
    maxTokens?: number;
    answer: string;
    error: string;
    fallback: boolean;
  };
  pausedForModelSelection?: "agent" | "summary" | "";
  pausedForRetry?: InfoFeedRetryStage | "";
  retry?: InfoFeedRetryState;
};
type PathPickerMode = "directory" | "file";
type PathPickerState = {
  open: boolean;
  title: string;
  mode: PathPickerMode;
  value: string;
  extensions: string[];
  includeHidden: boolean;
  loading: boolean;
  error: string;
  response: ServerPathBrowseResponse | null;
  applyPath: (nextPath: string) => void;
};
type CloudProvider =
  | "google-gemini"
  | "openai-chatgpt"
  | "deepseek"
  | "openrouter"
  | "copilot"
  | "custom-http"
  | "local-model";

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
    description: "SplitAll agent 报文格式的外部智能体网关。",
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
  modelLibraryModels: [],
  agentExploreDefaults: {
    systemPrompt:
      "You are SplitAll Knowledge Explorer. You are stateless; use the supplied ContextPack as your only memory.",
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
      "你是 SplitAll 知识冲突融合智能体。你只能基于输入的原始记录、新录入记录、冲突原因和证据字段进行分析。请判断两份知识是完全重合、部分重合还是明显不同；给出相似度、应采取的审核动作和可复核理由。不得改写原始证据，不得编造未提供的信息。",
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
  agentGateway: {
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

const knowledgeTabs: Array<{ id: KnowledgeTab; label: string }> = [
  { id: "overview", label: "知识召回" },
  { id: "ingest", label: "入库同步" },
  { id: "conflicts", label: "冲突审核" },
  { id: "logs", label: "日志记录" },
  { id: "maintenance", label: "知识库配置" },
];

const consoleState = ref<ServerConsoleState | null>(null);
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
const busyKey = ref("");
const codexOAuthStatus = ref<CodexOAuthStatus | null>(null);
const codexOAuthLogin = ref<CodexOAuthLogin | null>(null);
const selectedModelProvider = ref<CloudProvider>("deepseek");
const modelProbeResults = ref<Record<string, ModelProbeResponse>>({});
const modelLibraryExpandedCards = ref<Record<string, boolean>>({});
const agentModelOptionLabelCache = ref<Record<string, string>>({});
const settingsDraftDirty = ref(false);
let applyingRemoteSettings = false;
let codexOAuthPollTimer: ReturnType<typeof window.setInterval> | null = null;
let agentExplorePollTimer: ReturnType<typeof window.setInterval> | null = null;
let configTargetHighlightTimer: ReturnType<typeof window.setTimeout> | null = null;
let serverEventCursor = 0;
let serverEventSubscriptionStopped = false;
const AGENT_EXPLORE_STORAGE_KEY = "splitall.agentExplore.sessions.v1";
const INFO_FEED_STORAGE_KEY = "splitall.infoFeed.history.v1";
const filter = ref("");
const drawerOpen = ref(false);
const drawerTab = ref<DrawerTab>("discovery");
const currentView = ref<AppView>("dashboard");
const adminView = ref<AdminView>("jobs");
const highlightedConfigTarget = ref("");
const clientSearchQuery = ref("");
const clientStateFilter = ref<ClientMigrationState | "all">("all");
const clientMigrationMessages = ref<Record<string, string>>({});
const editingMountPaths = ref<Record<string, boolean>>({});
const newGrantLabel = ref("默认智能体");
const newGrantScopes = ref<string[]>(["knowledge:read"]);
const newGrantToolsets = ref<string[]>(["splitall.knowledge.read"]);
const issuedToolToken = ref("");
const toolManagementCatalogState = ref<ToolManagementCatalog | null>(null);
const toolManagementMetricsState = ref<ToolManagementMetrics | null>(null);
const toolManagementAuditItems = ref<ToolManagementAuditItem[]>([]);
const policyPreviewToolId = ref("splitall.knowledge.health");
const policyPreviewProfileId = ref("external-knowledge-reader");
const policyPreviewGrantId = ref("");
const policyPreviewResult = ref<Record<string, unknown> | null>(null);
const authState = ref<ConsoleAuthSummary | null>(null);
const loginForm = ref({ username: "", password: "" });
const authUsers = ref<ConsoleUser[]>([]);
const authAudit = ref<ConsoleAuditItem[]>([]);
const authSessions = ref<Array<Record<string, unknown>>>([]);
const maintenanceAgentConfig = ref<MaintenanceAgentConfig | null>(null);
const maintenanceAgentRuns = ref<MaintenanceAgentRun[]>([]);
const selectedMaintenanceAgentRun = ref<MaintenanceAgentRun | null>(null);
const maintenanceAgentMessage = ref("检查服务端健康状态，自动处理安全维护项。");
const maintenanceAgentRunbook = ref("health_smoke");
const maintenanceAgentResultJson = ref("");
const backgroundProcessStatus = ref<BackgroundProcessStatus | null>(null);
const monitorAlertState = ref<MonitorAlertState | null>(null);
const monitorAlertConfigText = ref("");
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
const knowledgeTab = ref<KnowledgeTab>("overview");
const knowledgeConsole = ref<KnowledgeConsoleState | null>(null);
const knowledgeSchema = ref<KnowledgeConfigSchema | null>(null);
const knowledgeSourceState = ref<KnowledgeSourceState | null>(null);
const knowledgeMaintenanceDraft = ref<MaintenanceSettings>({});
const maintenanceJson = ref("{}");
const selectedMaintenanceTask = ref("validate_assets");
const maintenanceConfirm = ref(false);
const maintenanceDryRun = ref(true);
const maintenanceResultJson = ref("");
const knowledgeSearchForm = ref({
  query: "",
});
const agentExploreForm = ref({
  query: "",
  modelAlias: "",
  contextProfileId: "context-128k",
  maxIterations: 4,
  limit: 8,
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
const infoFeedFileInput = ref<HTMLInputElement | null>(null);
let infoFeedRunSequence = 0;
let infoFeedSummaryStreamTimer: ReturnType<typeof window.setTimeout> | null = null;
const infoFeedKeywordCache = new Map<string, { response: KnowledgeSearchResponse; cachedAt: number }>();
const INFO_FEED_FETCH_RETRY_LIMIT = 10;
const INFO_FEED_CONTEXT_CHARS_PER_TOKEN = 3;
const knowledgeLogAdvancedOpen = ref(false);
const knowledgeLogFilters = ref({
  id: "",
  status: "",
  stage: "",
  from: "",
  to: "",
});
const knowledgeReviewStatus = ref("pending");
const knowledgeReviewItems = ref<KnowledgeReviewItem[]>([]);
const selectedKnowledgeReviewId = ref("");
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
  applyPath: () => {},
});

const serverEventTopics = [
  "server.lifecycle",
  "system.interfaces",
  "system.console_state",
  "discovery.config",
  "discovery.clients",
  "runtime.mounts",
  "settings.current",
  "email_rules.current",
  "expert_vocabulary.current",
  "uploads.session",
  "uploads.trace",
  "jobs.job",
  "jobs.deleted",
  "storage.summary",
  "knowledge.changes",
  "knowledge.review_items",
  "knowledge.sources",
  "maintenance.agent.config",
  "maintenance.agent.plan.created",
  "maintenance.agent.approval.required",
  "maintenance.agent.run.started",
  "maintenance.agent.tool.started",
  "maintenance.agent.tool.completed",
  "maintenance.agent.tool.failed",
  "maintenance.agent.run.completed",
  "tool_platform.grants",
  "agent_sync.config",
].join(",");

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
    .filter((item) => {
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

function normalizeModelEntry(entry: Partial<AgentModelConfig>, index = 0): AgentModelConfig {
  const provider = String(entry.provider || "") as CloudProvider;
  const model = modelEntryStringField(entry, ["model", "engine"]) ?? "";
  const label =
    modelEntryStringField(entry, ["label", "agentName"]) ??
    (String(entry.alias || "").trim() || `${providerLabel(provider)}${model ? ` ${model}` : " 智能体"}`.trim());
  const agentName = modelEntryStringField(entry, ["agentName", "label"]) ?? label;
  const engine = modelEntryStringField(entry, ["engine", "model"]) ?? "";
  const legacyInstanceId = String(entry.instanceId || "").trim();
  const explicitUid = String(entry.uid || "").trim();
  const legacyAlias = String(entry.alias || "").trim();
  const uid = explicitUid ||
    (legacyInstanceId.startsWith("agent_") ? legacyInstanceId : "") ||
    (legacyAlias.startsWith("agent_") ? legacyAlias : "") ||
    modelAgentUid(provider, legacyInstanceId || legacyAlias || index + 1);
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
    parametersText:
      String(entry.parametersText || "").trim() ||
      JSON.stringify(asRecord(entry.parameters) || {}, null, 2),
    timeoutMs: Number(entry.timeoutMs || (provider === "deepseek" ? settingsDraft.value.deepSeekTimeoutMs : 120000)),
  };
}

function normalizeModelLibraryModels(settings: AgentSettings): AgentModelConfig[] {
  const models = Array.isArray(settings.modelLibraryModels)
    ? settings.modelLibraryModels
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

function normalizeHttpAdapterSettings(settings: AgentSettings): AgentSettings {
  const adapter = {
    ...emptySettings.agentGateway,
    ...(settings.agentGateway || {}),
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
    modelLibraryModels: normalizeModelLibraryModels(settings),
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
    customModelAlias: alias,
    customModelLabel: label,
    customHttpAdapter: nextAdapter,
    customHttpAdapters,
    agentGateway: nextAdapter,
  };
}

function settingsPayloadForSave() {
  const normalized = normalizeHttpAdapterSettings(settingsDraft.value);
  normalized.modelLibraryModels = visibleModelEntries.value.map((entry, index) => ({
    ...normalizeModelEntry(entry, index),
    parameters: modelEntryParameters(entry),
  }));
  normalized.modelLibraryEntries = [
    ...new Set(normalized.modelLibraryModels.map((entry) => String(entry.provider || "").trim()).filter(Boolean)),
  ] as CloudProvider[];
  const validModuleAssignmentRefs = new Set(agentModelAssignmentOptions.value.map((item) => item.ref));
  normalized.moduleModelAssignments = Object.fromEntries(
    Object.entries(normalized.moduleModelAssignments || {}).filter(([moduleId, assignment]) => {
      if (!moduleNeedsIntelligence(moduleId)) {
        return false;
      }
      return validModuleAssignmentRefs.has(modelRef(assignment.provider, assignment.model));
    }),
  );
  return normalized;
}

function applyAgentExploreDefaultsFromSettings() {
  if (agentExploreHydrated.value || agentExploreForm.value.query || agentExploreForm.value.workspaceId) {
    return;
  }
  agentExploreForm.value = {
    ...agentExploreForm.value,
    maxIterations: agentExploreConfiguredMaxIterations.value,
    limit: agentExploreConfiguredLimit.value,
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

function handleAgentExploreTraceToggle(event: Event) {
  agentExploreTraceOpen.value = Boolean((event.currentTarget as HTMLDetailsElement | null)?.open);
}

watch(
  settingsDraft,
  () => {
    modelProbeResults.value = {};
    if (!applyingRemoteSettings) {
      settingsDraftDirty.value = true;
    }
  },
  { deep: true },
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

function replaceSettingsDraftFromServer(
  settings: AgentSettings,
  options: { markClean?: boolean } = {},
) {
  applyingRemoteSettings = true;
  settingsDraft.value = normalizedSettingsFromServer(settings);
  if (options.markClean !== false) {
    settingsDraftDirty.value = false;
  }
  window.queueMicrotask(() => {
    applyingRemoteSettings = false;
  });
}

function applyConsoleState(
  nextState: ServerConsoleState,
  options: { forceSettings?: boolean } = {},
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
  discoveryDraft.value = {
    ...emptyDiscovery,
    ...nextState.discovery.value,
  };
  mountDraft.value = {
    ...(nextState.runtime.mountModules || {}),
  };
  rulesText.value = JSON.stringify(nextState.emailRules.rules, null, 2);
  expertVocabularyDraft.value = cloneExpertVocabulary(
    nextState.expertVocabulary.vocabulary,
  );
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
    ...existingItems.filter((item) => item.id !== job.id),
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
    discoveryDraft.value = {
      ...emptyDiscovery,
      ...value,
    };
    consoleState.value = {
      ...consoleState.value,
      discovery: {
        ...consoleState.value.discovery,
        value,
        bootstrap: (asRecord(payload.bootstrap) as DiscoveryConfigResponse["bootstrap"] | null) ||
          consoleState.value.discovery.bootstrap,
      },
    };
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
    mountDraft.value = {
      ...(consoleState.value.runtime.mountModules || {}),
    };
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
    rulesText.value = JSON.stringify(rules, null, 2);
    consoleState.value = {
      ...consoleState.value,
      emailRules,
    };
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
    expertVocabularyDraft.value = cloneExpertVocabulary(vocabulary);
    consoleState.value = {
      ...consoleState.value,
      expertVocabulary,
    };
    return true;
  }

  if (event.topic === "tool_platform.grants") {
    const state =
      asRecord(payload.state) ||
      (Array.isArray(payload.grants) ? payload : null);
    if (!state) {
      return false;
    }
    consoleState.value = {
      ...consoleState.value,
      toolPlatform: state as ServerConsoleState["toolPlatform"],
    };
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
      settingsDraft.value.agentGateway?.alias ||
      settingsDraft.value.customHttpAdapter?.alias ||
      settingsDraft.value.customModelLabel ||
      "external-agent",
  ).trim();
}

function customHttpAdapterLabel() {
  return String(
    settingsDraft.value.customModelLabel ||
      settingsDraft.value.agentGateway?.label ||
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

const visibleModelEntries = computed(() => settingsDraft.value.modelLibraryModels || []);

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
      return Boolean(settingsDraft.value.agentGateway?.url || settingsDraft.value.agentGateway?.tokenConfigured || settingsDraft.value.agentGateway?.token);
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
    return hasModel && Boolean((entry.url || settingsDraft.value.agentGateway?.url) && (entry.token || entry.tokenConfigured || settingsDraft.value.agentGateway?.tokenConfigured));
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
  settingsDraft.value.modelLibraryModels = [
    entry,
    ...visibleModelEntries.value,
  ];
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
  settingsDraft.value.modelLibraryModels = entry
    ? visibleModelEntries.value.filter((item) => modelEntryStatusKey(item) !== removeKey)
    : visibleModelEntries.value.filter((item) => item.provider !== provider);
  const remainingExpandedCards = { ...modelLibraryExpandedCards.value };
  delete remainingExpandedCards[removeKey];
  modelLibraryExpandedCards.value = remainingExpandedCards;
  settingsDraft.value.modelLibraryEntries = [
    ...new Set(settingsDraft.value.modelLibraryModels.map((item) => item.provider)),
  ] as CloudProvider[];
  busyKey.value = `model-remove:${removeKey}`;
  error.value = "";
  try {
    const saved = await bridge.saveSettings(settingsPayloadForSave());
    replaceSettingsDraftFromServer(saved);
  } catch (nextError) {
    settingsDraft.value.modelLibraryModels = previousModels;
    settingsDraft.value.modelLibraryEntries = previousEntries;
    error.value =
      nextError instanceof Error ? nextError.message : "移除模型配置失败。";
  } finally {
    busyKey.value = "";
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
  settingsDraft.value.modelLibraryModels = [copy, ...visibleModelEntries.value];
}

async function probeModelEntry(entry: AgentModelConfig) {
  const key = modelEntryStatusKey(entry);
  busyKey.value = `model-probe:${key}`;
  error.value = "";
  const settings = settingsPayloadForSave();
  const cleanParameters = modelEntryParameters(entry);
  try {
    if (entry.provider === "google-gemini") {
      settings.googleModel = String(entry.model ?? "");
    }
    if (entry.provider === "openai-chatgpt") {
      settings.openAiModel = String(entry.model ?? "");
    }
    if (entry.provider === "deepseek") {
      settings.deepSeekBaseUrl = entry.baseUrl || settings.deepSeekBaseUrl;
      settings.deepSeekModel = String(entry.model ?? "");
      settings.deepSeekApiKey = entry.apiKey || settings.deepSeekApiKey;
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
      settings.agentGateway = {
        ...settings.agentGateway,
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
      settings.customHttpAdapter = settings.agentGateway;
      settings.customHttpAdapters = [settings.agentGateway];
    }
    const result = await bridge.probeModel({
      provider: entry.provider,
      settings,
    });
    modelProbeResults.value = {
      ...modelProbeResults.value,
      [key]: result,
    };
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "模型探测失败。";
  } finally {
    busyKey.value = "";
  }
}

const agentModelAssignmentOptions = computed(() =>
  visibleModelEntries.value
    .filter((entry) => modelEntryConfigured(entry))
    .map((entry) => ({
      provider: entry.provider as CloudProvider,
      value: modelEntryStatusKey(entry),
      label: agentExploreModelOptionLabel(entry),
      ref: modelRef(entry.provider, modelEntryStatusKey(entry)),
      enabled: true,
    })),
);

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

function moduleModelRef(moduleId: string) {
  const assignment = settingsDraft.value.moduleModelAssignments?.[moduleId];
  if (!assignment?.provider || !assignment?.model) {
    return "";
  }
  const refValue = modelRef(assignment.provider, assignment.model);
  return agentModelAssignmentOptions.value.some((option) => option.ref === refValue)
    ? refValue
    : "";
}

function setModuleModelRef(moduleId: string, refValue: string) {
  if (!String(refValue || "").trim()) {
    const nextAssignments = { ...(settingsDraft.value.moduleModelAssignments || {}) };
    delete nextAssignments[moduleId];
    settingsDraft.value.moduleModelAssignments = nextAssignments;
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
  if (parsed.provider === "openai-chatgpt") {
    void ensureCodexOAuthReady(true);
  }
}

function hasOpenAiModelUsage() {
  return intelligentModuleDefinitions.some(
    (item) =>
      moduleNeedsIntelligence(item.id) &&
      moduleModelRef(item.id) &&
      modelProviderFromRef(moduleModelRef(item.id)) === "openai-chatgpt",
  );
}

const toolPlatform = computed(() => consoleState.value?.toolPlatform || null);
const toolScopes = computed(() => toolPlatform.value?.scopes || []);
const toolCatalog = computed(() => toolPlatform.value?.tools || []);
const toolGrants = computed(() => toolPlatform.value?.grants || []);
const enabledToolGrantCount = computed(
  () => toolGrants.value.filter((grant) => grant.enabled).length,
);
const toolManagementTools = computed<ToolManagementTool[]>(() => toolManagementCatalogState.value?.tools || []);
const toolManagementToolsets = computed<ToolManagementToolset[]>(
  () => toolManagementCatalogState.value?.toolsets || toolPlatform.value?.toolsets || [],
);
const toolManagementProfiles = computed<ToolManagementProfile[]>(
  () => toolManagementCatalogState.value?.profiles || toolPlatform.value?.profiles || [],
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
const currentUser = computed(() => authState.value?.session.user || null);
const isAuthenticated = computed(
  () => authState.value?.session.authenticated || authState.value?.enabled === false,
);
const currentUserScopes = computed(() => currentUser.value?.scopes || []);
const canAdminAuth = computed(() => hasScope("auth:admin"));
const canReadKnowledge = computed(() => hasScope("knowledge:read"));
const canMaintainKnowledge = computed(() => hasScope("knowledge:maintain"));
const canAdminKnowledge = computed(() => hasScope("knowledge:admin"));
const canWriteJobs = computed(() => hasScope("jobs:write"));
const canBrowseServerPaths = computed(() => hasScope("knowledge:write"));
const canAdminRuntime = computed(() => hasScope("runtime:admin"));
const canReadMaintenanceAgent = computed(() => hasScope("maintenance:read"));
const canRunMaintenanceAgent = computed(() => hasScope("maintenance:run"));
const canApproveMaintenanceAgent = computed(() => hasScope("maintenance:approve"));
const canAdminMaintenanceAgent = computed(() => hasScope("maintenance:admin"));
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
  const loadedPending = knowledgeReviewItems.value.filter((item) => item.status === "pending").length;
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
const agentExploreCallableProviders = new Set<string>([
  "deepseek",
  "openrouter",
  "copilot",
  "custom-http",
  "local-model",
]);

function agentExploreUnsupportedReason(provider: string) {
  if (provider === "google-gemini") {
    return "暂未接入智能检索 function-call 协议";
  }
  if (provider === "openai-chatgpt") {
    return "ChatGPT OAuth 当前仅用于 JSON 增强，不参与智能检索工具链";
  }
  return "暂不支持智能检索";
}

function agentExploreModelOptionLabel(entry: AgentModelConfig) {
  const modelName = String(
    entry.label || entry.agentName || entry.alias || modelEntryStatusKey(entry),
  ).trim();
  const modelId = String(entry.model || entry.engine || modelEntryStatusKey(entry)).trim();
  return modelId && modelId !== modelName ? `${modelName} · ${modelId}` : modelName;
}

function agentExploreModelOptionFromEntry(entry: AgentModelConfig) {
  const provider = String(entry.provider || "");
  const supported = agentExploreCallableProviders.has(provider);
  const configured = supported && modelEntryConfigured(entry);
  return {
    value: modelEntryStatusKey(entry),
    label: agentExploreModelOptionLabel(entry),
    enabled: configured,
    provider,
    source: "model-library",
    disabledReason: supported ? "未配置" : agentExploreUnsupportedReason(provider),
  };
}

function dedupeAgentExploreModelOptions<T extends { value: string }>(options: T[]) {
  const seen = new Set<string>();
  return options.filter((item) => {
    if (!item.value || seen.has(item.value)) {
      return false;
    }
    seen.add(item.value);
    return true;
  });
}

const agentExploreModelOptions = computed(() => {
  const libraryOptions = visibleModelEntries.value
    .map(agentExploreModelOptionFromEntry)
    .filter((option) => option.enabled);
  return dedupeAgentExploreModelOptions(libraryOptions);
});
const agentModelOptionValueSet = computed(
  () => new Set(agentExploreModelOptions.value.map((item) => item.value)),
);
function hasAgentModelOption(value?: string) {
  const normalized = String(value || "").trim();
  return Boolean(normalized && agentModelOptionValueSet.value.has(normalized));
}
function clearInvalidAgentModelSelections() {
  if (infoFeedForm.value.modelAlias && !hasAgentModelOption(infoFeedForm.value.modelAlias)) {
    infoFeedForm.value.modelAlias = "";
  }
  if (agentExploreForm.value.modelAlias && !hasAgentModelOption(agentExploreForm.value.modelAlias)) {
    agentExploreForm.value.modelAlias = "";
  }
  if (ruleAuthoringForm.value.modelAlias && !hasAgentModelOption(ruleAuthoringForm.value.modelAlias)) {
    ruleAuthoringForm.value.modelAlias = "";
  }
  const reviewFusionModelAlias = settingsDraft.value.agentExploreDefaults?.reviewFusionModelAlias || "";
  if (reviewFusionModelAlias && !hasAgentModelOption(reviewFusionModelAlias)) {
    settingsDraft.value.agentExploreDefaults = {
      ...settingsDraft.value.agentExploreDefaults,
      reviewFusionModelAlias: "",
    };
  }
}
function cacheAgentModelOptionLabels(options: Array<{ value: string; label?: string }>) {
  const next = { ...agentModelOptionLabelCache.value };
  for (const option of options) {
    const value = String(option.value || "").trim();
    const label = String(option.label || "").trim();
    if (value && label) {
      next[value] = label;
    }
  }
  agentModelOptionLabelCache.value = next;
}
function cachedAgentModelLabel(value?: string) {
  const normalized = String(value || "").trim();
  return normalized ? agentModelOptionLabelCache.value[normalized] || normalized : "";
}
const infoFeedModelOptions = computed(() => {
  const enabledOptions = agentExploreModelOptions.value.filter((item) => item.enabled);
  return enabledOptions;
});
const selectedAgentExploreModel = computed(() => {
  const selectedValue = String(agentExploreForm.value.modelAlias || "").trim();
  const selected = agentExploreModelOptions.value.find(
    (item) => item.value === selectedValue && item.enabled,
  );
  if (selected) {
    return selected;
  }
  if (selectedValue) {
    const inactive = agentExploreModelOptions.value.find((item) => item.value === selectedValue);
    return inactive || {
      value: selectedValue,
      label: cachedAgentModelLabel(selectedValue),
      enabled: false,
      disabledReason: "配置刷新中或已移除",
    };
  }
  return {
    value: "",
    label: "未选择智能体",
    enabled: false,
    disabledReason: "未分配",
  };
});
const ruleAuthoringModelOptions = computed(() => agentExploreModelOptions.value);
const selectedRuleAuthoringModel = computed(() => {
  const selectedValue = String(ruleAuthoringForm.value.modelAlias || "").trim();
  const selected = ruleAuthoringModelOptions.value.find(
    (item) => item.value === selectedValue && item.enabled,
  );
  if (selected) {
    return selected;
  }
  if (selectedValue) {
    return (
      ruleAuthoringModelOptions.value.find((item) => item.value === selectedValue) || {
        value: selectedValue,
        label: cachedAgentModelLabel(selectedValue),
        enabled: false,
        disabledReason: "配置刷新中或已移除",
      }
    );
  }
  return {
    value: "",
    label: "未选择智能体",
    enabled: false,
    disabledReason: "未分配",
  };
});
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
    settingsDraft.value.agentExploreDefaults?.contextProfileId ||
      agentExploreForm.value.contextProfileId ||
      "context-128k",
  ).trim();
  const selected = agentExploreContextWindowOptions.find(
    (item) => item.value === configured,
  );
  return selected || agentExploreContextWindowOptions[1];
});
const selectedInfoFeedModel = computed(() => {
  const selectedValue = String(infoFeedForm.value.modelAlias || "").trim();
  const selected = infoFeedModelOptions.value.find(
    (item) => item.value === selectedValue && item.enabled,
  );
  if (selected) {
    return selected;
  }
  if (selectedValue) {
    const inactive = infoFeedModelOptions.value.find((item) => item.value === selectedValue);
    return inactive || {
      value: selectedValue,
      label: cachedAgentModelLabel(selectedValue),
      enabled: false,
      disabledReason: "配置刷新中或已移除",
    };
  }
  return {
    value: "",
    label: "未选择智能体",
    enabled: false,
    disabledReason: "未分配",
  };
});
const selectedKnowledgeReviewFusionModel = computed(() => {
  const configured = String(
    settingsDraft.value.agentExploreDefaults?.reviewFusionModelAlias || "",
  ).trim();
  if (!configured) {
    return {
      value: "",
      label: "未选择智能体",
      enabled: false,
      disabledReason: "未分配",
    };
  }
  const selected = agentExploreModelOptions.value.find(
    (item) => item.value === configured && item.enabled,
  );
  return selected || {
    value: configured,
    label: cachedAgentModelLabel(configured),
    enabled: false,
    disabledReason: "配置刷新中或已移除",
  };
});
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
      options: agentExploreModelOptions.value,
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
      options: agentExploreModelOptions.value,
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
  const dangerCount = agentConfigurationAlerts.value.filter((item) => item.tone === "danger").length;
  const warningCount = agentConfigurationAlerts.value.length - dangerCount;
  if (agentConfigurationAlerts.value.length === 0) {
    return "所有需要智能体的功能都已显式绑定可用模型。";
  }
  return [
    dangerCount ? `${dangerCount} 项不可用` : "",
    warningCount ? `${warningCount} 项未配置` : "",
  ].filter(Boolean).join("，");
});
const selectedInfoFeedContextProfile = computed(() => {
  return selectedAgentExploreContextProfile.value;
});
function normalizedAgentExploreThinkingMode(value?: string) {
  const mode = String(value || "default").trim();
  return agentExploreThinkingModeOptions.some((item) => item.value === mode) ? mode : "default";
}
const selectedAgentExploreThinkingMode = computed(() =>
  normalizedAgentExploreThinkingMode(settingsDraft.value.agentExploreDefaults?.thinkingMode),
);
function agentExploreThinkingParameters() {
  const mode = selectedAgentExploreThinkingMode.value;
  if (mode === "enabled") {
    return {
      splitall_thinking_mode: "enabled",
    };
  }
  if (mode === "disabled") {
    return {
      splitall_thinking_mode: "disabled",
    };
  }
  return {};
}
function infoFeedModelDisplayLabel(value?: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "未记录";
  }
  return infoFeedModelOptions.value.find((item) => item.value === normalized)?.label || normalized;
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
  agentExploreModelOptions,
  (options) => {
    cacheAgentModelOptionLabels(options);
    clearInvalidAgentModelSelections();
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
    knowledgeTab.value === "overview" &&
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
  return (run?.expertFeedback || []).filter((item) => item.anchor === anchor);
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
    : (runOrTurn.followUpQuestion ? "用户回复" : "用户问题");
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
  return `${stageLabel}的模型没有可用 URL 或配置不完整。请选择一个可用模型后继续。${stageError ? `（${stageError}）` : ""}`;
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
const knowledgeLogRows = computed<KnowledgeLogRow[]>(() => {
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
    kindLabel: "同步目录",
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
  return [...traceRows, ...jobRows, ...sourceRows].sort(
    (left, right) => parseTime(right.occurredAt) - parseTime(left.occurredAt),
  );
});
const knowledgeLogStatusOptions = computed(() =>
  Array.from(new Set(knowledgeLogRows.value.map((row) => row.statusLabel).filter(Boolean))),
);
const filteredKnowledgeLogRows = computed(() => {
  const filters = knowledgeLogFilters.value;
  const idQuery = filters.id.trim().toLowerCase();
  const stageQuery = filters.stage.trim().toLowerCase();
  const fromTime = parseFilterDate(filters.from, "start");
  const toTime = parseFilterDate(filters.to, "end");
  return knowledgeLogRows.value.filter((row) => {
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
const evidenceReadableHtml = computed(() => renderEvidenceReadableHtml());
const evidenceReadableKind = computed(() => evidenceReadableKindLabel());

function hasScope(scopeId: string) {
  if (!authState.value?.enabled) {
    return true;
  }
  return currentUserScopes.value.includes(scopeId);
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
      url: entry.url || settings.agentGateway?.url || "",
      tokenHeader: entry.tokenHeader || settings.agentGateway?.tokenHeader || "token",
      tokenPrefix: entry.tokenPrefix || settings.agentGateway?.tokenPrefix || "",
      tokenConfigured: Boolean(
        entry.token ||
          entry.tokenConfigured ||
          settings.agentGateway?.token ||
          settings.agentGateway?.tokenConfigured,
      ),
      timeoutMs: Number(entry.timeoutMs || settings.agentGateway?.timeoutMs || 120000),
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
    type: "splitall.agent-model-config.v1",
    source: "server-console-model-library",
    note: "导出的是当前智能体配置；密钥和 Token 字段已脱敏，未包含其它智能体配置。",
    model: redactAgentModelEntryForExport(normalizedEntry),
    providerSettings: redactedProviderSettingsForAgentExport(normalizedEntry, payload),
  };
  downloadTextFile(
    `splitall-agent-${safeDownloadName(normalizedEntry.label || modelEntryStatusKey(normalizedEntry), "model")}-${timestamp}.json`,
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

async function handleInfoFeedAttachmentInput(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const files = Array.from(input?.files || []);
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
  if (input) {
    input.value = "";
  }
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
            role: "user",
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
    .map(compactInfoFeedRunForStorage);
}

function persistInfoFeedHistory() {
  try {
    window.localStorage.setItem(
      INFO_FEED_STORAGE_KEY,
      JSON.stringify({
        history: infoFeedHistory.value.map(compactInfoFeedRunForStorage),
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
    ...infoFeedHistory.value.filter((item) => item.runId !== run.runId),
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

function openInfoFeedHistoryRun(run: InfoFeedRunState) {
  const agentRunInput = asRecord(asRecord(run.agent.response?.run)?.input) || {};
  infoFeedParentRunSnapshot.value = null;
  infoFeedCurrentRun.value = compactInfoFeedRunForStorage(run);
  infoFeedForm.value = {
    ...infoFeedForm.value,
    query: "",
    modelAlias: run.summary.modelAlias || String(agentRunInput.modelAlias || "") || infoFeedForm.value.modelAlias,
    contextProfileId: run.summary.contextProfileId || infoFeedForm.value.contextProfileId,
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
  const highItems = allItems.filter((item) => !isLowRelevanceSourceResult(item));
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
    "5. 不要频繁提问。只有在没有人类选择就无法继续检索、归纳或执行下一步时，才在答案末尾追加 fenced block：```splitall_user_options 换行 JSON 换行 ```。",
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
  const blockPattern = /```(?:splitall_user_options|splitall-options|json)\s*([\s\S]*?)```/gi;
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
    ...(run.expertFeedback || []).filter((item) => item.feedbackId !== feedbackId),
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
        question: buildInfoFeedSummaryQuestion(run),
        systemPrompt:
          "你是 SplitAll 信息流总结智能体。你的任务是融合原文检索、智能规划和附件读取结果，输出可复核、带证据编号的最终回答。证据不足时必须说明不足。只有当缺少用户选择就无法继续执行时，才向用户提问；普通不确定性只写在报告里。",
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
      answer ? "" : "总结模型没有返回可用回答，已展示本地兜底摘要。",
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
      run.summary.error = nextError instanceof Error ? nextError.message : "总结模型未配置。";
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
    `knowledge-logs-${formatMachineDate(new Date().toISOString(), "full").replace(/[: ]/g, "-")}.csv`,
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
    return "目录";
  }
  return `${formatBytes(entry.byteSize)} / ${formatCompactDate(entry.modifiedAt)}`;
}

function openServerPathPicker(options: {
  title: string;
  mode: PathPickerMode;
  value?: string;
  extensions?: string[];
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
    title: "选择本地同步目录",
    mode: "directory",
    value: localSourceForm.value.directoryPath,
    applyPath: (nextPath) => {
      applyLocalSourceDirectoryPath(nextPath);
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
  return `#splitall-evidence-${encodeURIComponent(evidenceId)}`;
}

function evidenceIdFromHref(href: string) {
  const prefix = "#splitall-evidence-";
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
  ].filter((item) => item.value && item.value !== "未记录");
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
    return session;
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "加载认证状态失败。";
    return null;
  }
}

async function submitLoginAuth() {
  busyKey.value = "auth:login";
  error.value = "";
  try {
    await bridge.loginAuth(loginForm.value);
    const session = await refreshAuthState();
    if (!session?.session.authenticated && session?.enabled !== false) {
      error.value = "登录已返回，但会话状态尚未生效，请重试。";
      return;
    }
    await refreshState({ silent: true });
    startServerEventSubscription();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "登录失败。";
  } finally {
    busyKey.value = "";
  }
}

async function logoutConsole() {
  busyKey.value = "auth:logout";
  error.value = "";
  try {
    await bridge.logoutAuth();
    consoleState.value = null;
    await refreshAuthState();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "退出失败。";
  } finally {
    busyKey.value = "";
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
  busyKey.value = `auth:user:${user.userId}`;
  error.value = "";
  try {
    const result = await bridge.updateAuthUser(user.userId, patch);
    authUsers.value = result.users;
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "更新用户失败。";
  } finally {
    busyKey.value = "";
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
  busyKey.value = "auth:oidc";
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
    busyKey.value = "";
  }
}

async function revokeConsoleSession(sessionId: string) {
  busyKey.value = `auth:session:${sessionId}`;
  error.value = "";
  try {
    await bridge.revokeAuthSession(sessionId);
    await refreshAuthAdmin();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "撤销会话失败。";
  } finally {
    busyKey.value = "";
  }
}

async function refreshKnowledgeConsole() {
  if (!hasScope("knowledge:read")) {
    return;
  }
  try {
    const [state, schema, maintenance, sources, reviewItems] = await Promise.all([
      bridge.getKnowledgeConsole(),
      bridge.getKnowledgeConfigSchema(),
      bridge.getKnowledgeMaintenance().catch(() => ({} as MaintenanceSettings)),
      bridge.getKnowledgeSources().catch(() => null),
      bridge.listKnowledgeReviewItems({ status: knowledgeReviewStatus.value, limit: 100 }).catch(() => null),
    ]);
    knowledgeConsole.value = state;
    knowledgeSchema.value = schema;
    knowledgeSourceState.value = sources || state.sources || null;
    knowledgeReviewItems.value = reviewItems?.items || knowledgeReviewItems.value;
    knowledgeMaintenanceDraft.value = maintenance || {};
    maintenanceJson.value = jsonPreview(knowledgeMaintenanceDraft.value);
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "加载知识库管控数据失败。";
  }
}

async function refreshKnowledgeConflicts(options: { silent?: boolean } = {}) {
  if (!hasScope("knowledge:read")) {
    return;
  }
  if (!options.silent) {
    busyKey.value = "knowledge:review-items";
  }
  error.value = "";
  try {
    const result = await bridge.listKnowledgeReviewItems({
      status: knowledgeReviewStatus.value,
      limit: 100,
    });
    knowledgeReviewItems.value = result.items || [];
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "加载知识冲突列表失败。";
  } finally {
    if (!options.silent) {
      busyKey.value = "";
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
  busyKey.value = `knowledge:review:${reviewId}:${resolution}`;
  error.value = "";
  try {
    await bridge.resolveKnowledgeReviewItem(reviewId, { resolution, patch });
    await refreshKnowledgeConflicts({ silent: true });
    await refreshKnowledgeConsole();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "处理知识冲突失败。";
  } finally {
    busyKey.value = "";
  }
}

async function fuseKnowledgeReview(item: KnowledgeReviewItem) {
  const model = selectedKnowledgeReviewFusionModel.value;
  if (!model?.enabled || !model.value) {
    error.value = "知识融合智能体未配置可用模型，请先在智能体配置中选择模型。";
    return;
  }
  const reviewId = String(item.reviewId || "");
  busyKey.value = `knowledge:review:${reviewId}:merge`;
  error.value = "";
  try {
    const response = await bridge.callAgentGateway({
      modelAlias: model.value,
      alias: model.value,
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
    busyKey.value = "";
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
  busyKey.value = "knowledge:search";
  error.value = "";
  knowledgeTab.value = "overview";
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
      retrievalProfileId: String(retrievalProfile.retrievalProfileId || ""),
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
    busyKey.value = "";
  }
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
    maxIterations: Number(input.maxIterations || fallback.maxIterations || agentExploreForm.value.maxIterations || 4),
    limit: Number(input.limit || fallback.limit || agentExploreForm.value.limit || 8),
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
    maxIterations: agentExploreConfiguredMaxIterations.value,
    limit: agentExploreConfiguredLimit.value,
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
            maxIterations: agentExploreForm.value.maxIterations,
            limit: agentExploreForm.value.limit,
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
      ...agentExploreDraftTabs.value.filter((item) => item.runId !== session.runId),
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
    [...agentExploreClosedTabIds.value].filter((item) => item !== runId),
  );
  agentExploreDraftTabs.value = normalizeAgentExploreHistoryList(
    agentExploreDraftTabs.value.filter((item) => item.runId !== runId),
  );
  agentExploreHistory.value = normalizeAgentExploreHistoryList(
    agentExploreHistory.value.filter((item) => item.runId !== runId),
  );
  const activeRunId = String(asRecord(agentExploreResult.value?.run)?.runId || "");
  if (activeRunId === runId || agentExploreActiveTabId.value === runId) {
    stopAgentExplorePolling();
    agentExploreResult.value = null;
    agentExploreForm.value.workspaceId = "";
    agentExploreActiveTabId.value = "";
    if (busyKey.value === "knowledge:agent-explore" || busyKey.value === `knowledge:agent-explore:load:${runId}`) {
      busyKey.value = "";
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
      agentExploreDraftTabs.value.filter((item) => item.runId !== runId),
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
      busyKey.value = "";
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
    maxIterations: session.maxIterations || agentExploreConfiguredMaxIterations.value,
    limit: session.limit || agentExploreConfiguredLimit.value,
    workspaceId: "",
  };
  if (busyKey.value === "knowledge:agent-explore") {
    busyKey.value = "";
  }
  persistAgentExploreState();
}

async function switchAgentExploreTab(session: AgentExploreSession) {
  if (agentExploreClosedTabIds.value.has(session.runId)) {
    agentExploreClosedTabIds.value = new Set(
      [...agentExploreClosedTabIds.value].filter((item) => item !== session.runId),
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
  busyKey.value = `knowledge:agent-explore:load:${session.runId}`;
  error.value = "";
  agentExploreActiveTabId.value = session.runId;
  try {
    agentExploreForm.value = {
      query: session.query,
      modelAlias: hasAgentModelOption(session.modelAlias) ? session.modelAlias : "",
      contextProfileId: session.contextProfileId || agentExploreForm.value.contextProfileId,
      maxIterations: session.maxIterations || agentExploreForm.value.maxIterations,
      limit: session.limit || agentExploreForm.value.limit,
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
      busyKey.value = "";
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
    maxIterations: Number(persistedForm.maxIterations || agentExploreForm.value.maxIterations || 4),
    limit: Number(persistedForm.limit || agentExploreForm.value.limit || 8),
    workspaceId: String(persistedForm.workspaceId || persisted.activeWorkspaceId || agentExploreForm.value.workspaceId || ""),
  };
  agentExploreHydrated.value = true;
  if (!agentExploreTabs.value.length) {
    const draft = createAgentExploreDraftTab({
      query: agentExploreForm.value.query,
      modelAlias: agentExploreForm.value.modelAlias,
      contextProfileId: agentExploreForm.value.contextProfileId,
      maxIterations: agentExploreForm.value.maxIterations,
      limit: agentExploreForm.value.limit,
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
        maxIterations: agentExploreForm.value.maxIterations,
        limit: agentExploreForm.value.limit,
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
          busyKey.value = "";
        }
        if (result.ok === false && result.error) {
          error.value = result.error;
        }
      }
    } catch (nextError) {
      stopAgentExplorePolling();
      if (busyKey.value === "knowledge:agent-explore") {
        busyKey.value = "";
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
  busyKey.value = "knowledge:rule-authoring";
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
      ...ruleAuthoringHistory.value.filter((item) => item.runId !== result.runId),
    ].slice(0, 8);
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "规则生成失败。";
  } finally {
    busyKey.value = "";
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
  busyKey.value = "knowledge:rule-authoring:publish";
  error.value = "";
  try {
    const result = await bridge.publishGoldenRules(confirmation.packageId, {
      version: confirmation.version,
    });
    ruleAuthoringResult.value = {
      ...(ruleAuthoringResult.value || {
        protocolVersion: "splitall.knowledge-rule-authoring.v1",
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
    busyKey.value = "";
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
  const maxIterations = agentExploreConfiguredMaxIterations.value;
  const limit = agentExploreConfiguredLimit.value;
  agentExploreForm.value.maxIterations = maxIterations;
  agentExploreForm.value.limit = limit;
  agentExploreForm.value.contextProfileId = selectedAgentExploreContextProfile.value.value;
  agentExploreTraceOpen.value = true;
  busyKey.value = "knowledge:agent-explore";
  error.value = "";
  currentView.value = "dashboard";
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
      maxIterations,
      limit,
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
          agentExploreDraftTabs.value.filter((item) => item.runId !== draftRunId),
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
    busyKey.value = "";
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "智能检索失败。";
    busyKey.value = "";
  }
}

function resetKnowledgeAgentExplore() {
  stopAgentExplorePolling();
  agentExploreTraceOpen.value = true;
  const draft = createAgentExploreDraftTab({
    modelAlias: agentExploreForm.value.modelAlias,
    contextProfileId: selectedAgentExploreContextProfile.value.value,
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
    maxIterations: draft.maxIterations,
    limit: draft.limit,
    workspaceId: "",
  };
  persistAgentExploreState();
  if (busyKey.value === "knowledge:agent-explore") {
    busyKey.value = "";
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
  busyKey.value = requestBusyKey;
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
      knowledgeTab.value = "overview";
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
      busyKey.value = "";
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
  busyKey.value = "knowledge:maintenance";
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
    busyKey.value = "";
  }
}

async function runKnowledgeMaintenanceTask() {
  busyKey.value = "knowledge:maintenance:run";
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
    busyKey.value = "";
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
  busyKey.value = "knowledge:ingest";
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
    busyKey.value = "";
  }
}

async function refreshIngestJob(options: { silent?: boolean } = {}) {
  if (!ingestJob.value?.id) {
    return;
  }
  if (!options.silent) {
    busyKey.value = `knowledge:ingest:${ingestJob.value.id}`;
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
      busyKey.value = "";
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
  busyKey.value = "knowledge:sources";
  error.value = "";
  try {
    applyKnowledgeSourceState(await bridge.getKnowledgeSources());
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "刷新同步目录失败。";
  } finally {
    busyKey.value = "";
  }
}

async function addKnowledgeSource() {
  const directoryPath = localSourceForm.value.directoryPath.trim();
  if (!directoryPath) {
    error.value = "请填写服务端本地路径。";
    return;
  }
  busyKey.value = "knowledge:sources:add";
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
    error.value = nextError instanceof Error ? nextError.message : "添加同步目录失败。";
  } finally {
    busyKey.value = "";
  }
}

async function updateKnowledgeSource(source: KnowledgeSource, patch: Record<string, unknown>) {
  busyKey.value = `knowledge:source:${source.sourceId}`;
  error.value = "";
  try {
    const result = await bridge.updateKnowledgeSource(source.sourceId, patch);
    applyKnowledgeSourceState(result.state);
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "更新同步目录失败。";
  } finally {
    busyKey.value = "";
  }
}

async function refreshKnowledgeSource(source: KnowledgeSource, force = false) {
  busyKey.value = `knowledge:source:refresh:${source.sourceId}`;
  error.value = "";
  try {
    const result = await bridge.refreshKnowledgeSource(source.sourceId, { force });
    applyKnowledgeSourceState(result.state);
    if (result.job) {
      ingestJob.value = result.job;
    }
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "刷新同步目录失败。";
  } finally {
    busyKey.value = "";
  }
}

async function deleteKnowledgeSource(source: KnowledgeSource) {
  busyKey.value = `knowledge:source:delete:${source.sourceId}`;
  error.value = "";
  try {
    const result = await bridge.deleteKnowledgeSource(source.sourceId);
    applyKnowledgeSourceState(result.state);
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "删除同步目录失败。";
  } finally {
    busyKey.value = "";
  }
}

function switchView(view: AppView) {
  currentView.value = view;
  if (view === "knowledge") {
    void refreshKnowledgeConsole();
  }
  if (view === "admin") {
    void refreshAuthAdmin();
    if (adminView.value === "tools") {
      void refreshToolManagement({ silent: true });
    }
    if (adminView.value === "maintenanceAgent") {
      void refreshMaintenanceAgent();
      void refreshBackgroundProcesses({ silent: true });
      void refreshMonitorAlerts({ silent: true });
    }
  }
}

function openKnowledgeTab(tab: KnowledgeTab) {
  knowledgeTab.value = tab;
  switchView("knowledge");
  if (tab === "conflicts") {
    void refreshKnowledgeConflicts();
  }
}

function openAdmin(tab: AdminView) {
  adminView.value = tab;
  currentView.value = "admin";
  void refreshAuthAdmin();
  if (tab === "tools") {
    void refreshToolManagement();
  }
  if (tab === "maintenanceAgent") {
    void refreshMaintenanceAgent();
    void refreshBackgroundProcesses({ silent: true });
    void refreshMonitorAlerts({ silent: true });
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

function replaceToolPlatformState(state: ServerConsoleState["toolPlatform"]) {
  if (!consoleState.value) {
    return;
  }
  consoleState.value = {
    ...consoleState.value,
    toolPlatform: state,
  };
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

function grantHasScope(grant: ToolPlatformGrant, scopeId: string) {
  return grant.scopes.includes(scopeId);
}

function grantHasToolset(grant: ToolPlatformGrant, toolsetId: string) {
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

  busyKey.value = `client:migration:${clientId}`;
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
    busyKey.value = "";
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

async function refreshState(options: { silent?: boolean; forceSettings?: boolean } = {}) {
  const showBusy = !options.silent;
  if (showBusy) {
    busyKey.value = busyKey.value || "refresh";
  }
  error.value = "";

  try {
    const nextState = await bridge.getServerConsoleState();
    applyConsoleState(nextState, { forceSettings: options.forceSettings });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "加载服务端控制台失败。";
  } finally {
    if (showBusy) {
      busyKey.value = "";
    }
  }
}

async function refreshContextCompiler(options: { silent?: boolean } = {}) {
  const showBusy = !options.silent;
  if (showBusy) {
    busyKey.value = "context:refresh";
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
      busyKey.value = "";
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
    systemMemory: "SplitAll server console preview. Preserve evidence ids and human expert guidance.",
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
  busyKey.value = "context:preview";
  error.value = "";
  try {
    contextPreviewResult.value = await bridge.previewContextPack(contextPreviewPayload());
    await refreshContextCompiler({ silent: true });
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "上下文预览失败。";
  } finally {
    busyKey.value = "";
  }
}

async function runContextReplayEvaluation() {
  busyKey.value = "context:evaluation";
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
    busyKey.value = "";
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

function stopServerEventSubscription() {
  serverEventSubscriptionStopped = true;
}

async function runServerEventSubscription() {
  if (serverEventSubscriptionStopped) {
    return;
  }

  try {
    const response = await bridge.subscribeEvents({
      cursor: serverEventCursor,
      topic: serverEventTopics,
      timeoutMs: 25000,
      includeSnapshot: serverEventCursor === 0,
    });
    const incomingEvents = [
      ...(serverEventCursor === 0 ? response.snapshots || [] : []),
      ...response.events,
    ];
    const hasUpdates = incomingEvents.length > 0;
    const handledUpdates = incomingEvents.filter(applyServerEvent).length;
    serverEventCursor = Math.max(serverEventCursor, response.nextCursor || 0);
    if (hasUpdates && handledUpdates < incomingEvents.length) {
      await refreshState({ silent: true });
    }
  } catch {
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
  }

  if (!serverEventSubscriptionStopped) {
    window.setTimeout(() => {
      void runServerEventSubscription();
    }, 100);
  }
}

function startServerEventSubscription() {
  serverEventSubscriptionStopped = false;
  void runServerEventSubscription();
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
  busyKey.value = "codex-oauth";
  error.value = "";

  try {
    const login = await bridge.startCodexOAuthLogin();
    codexOAuthLogin.value = login;
    codexOAuthStatus.value = login.status;
    if (login.authorizationUrl) {
      window.open(login.authorizationUrl, "splitall-codex-oauth");
    }
    startCodexOAuthPolling();
    return login.status.valid;
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "启动 Codex OAuth 验证失败。";
    return false;
  } finally {
    busyKey.value = "";
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
  busyKey.value = "modules";
  error.value = "";

  try {
    if (
      hasOpenAiModelUsage() &&
      !(await ensureCodexOAuthReady(true))
    ) {
      error.value = "ChatGPT OAuth 还没有验证完成，验证完成后再保存模型设置。";
      busyKey.value = "";
      return;
    }
    await bridge.saveSettings(settingsPayloadForSave());
    settingsDraftDirty.value = false;
    await bridge.saveRuntimeMounts({
      mountModules: mountDraft.value,
    });
    await refreshState({ forceSettings: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存设置失败。";
    busyKey.value = "";
  }
}

async function saveMountModules(busy = "mounts") {
  busyKey.value = busy;
  error.value = "";

  try {
    await bridge.saveRuntimeMounts({
      mountModules: mountDraft.value,
    });
    await refreshState();
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存挂载模块失败。";
  } finally {
    busyKey.value = "";
  }
}

async function reloadModules() {
  busyKey.value = "module-reload";
  error.value = "";

  try {
    await bridge.reloadRuntimeMounts(settingsDraft.value);
    await refreshState();
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "重载智能能力失败。";
    busyKey.value = "";
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
  busyKey.value = "settings";
  error.value = "";

  try {
    await bridge.saveSettings(settingsPayloadForSave());
    settingsDraftDirty.value = false;
    await refreshState({ forceSettings: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存基础设置失败。";
    busyKey.value = "";
  }
}

async function probeModel(provider: CloudProvider) {
  const busy = `model-probe:${provider}`;
  busyKey.value = busy;
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
    busyKey.value = "";
  }
}

async function saveDiscovery() {
  busyKey.value = "discovery";
  error.value = "";

  try {
    await bridge.saveDiscoveryConfig(discoveryDraft.value);
    await refreshState();
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存服务发现配置失败。";
    busyKey.value = "";
  }
}

async function saveRules() {
  busyKey.value = "rules";
  error.value = "";

  try {
    await bridge.saveEmailRules(JSON.parse(rulesText.value) as EmailRuleSet);
    await refreshState();
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存规则库失败。";
    busyKey.value = "";
  }
}

async function saveExpertVocabulary() {
  busyKey.value = "expert-vocabulary";
  error.value = "";

  try {
    await bridge.saveExpertVocabulary(expertVocabularyDraft.value);
    await refreshState();
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "保存专家词汇库失败。";
    busyKey.value = "";
  }
}

async function refreshToolPlatform() {
  await refreshToolManagement();
}

async function refreshToolManagement(options: { silent?: boolean } = {}) {
  const showBusy = !options.silent;
  if (showBusy) {
    busyKey.value = "tool-platform";
  }
  error.value = "";

  try {
    const [legacyState, catalog, audit, metrics] = await Promise.all([
      bridge.getToolPlatform(),
      bridge.getToolManagementCatalog(),
      bridge.getToolManagementAudit(50),
      bridge.getToolManagementMetrics(),
    ]);
    replaceToolPlatformState(legacyState);
    toolManagementCatalogState.value = catalog;
    toolManagementAuditItems.value = audit.items;
    toolManagementMetricsState.value = metrics.metrics;
    if (!policyPreviewToolId.value && catalog.tools.length > 0) {
      policyPreviewToolId.value = catalog.tools[0].id;
    }
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "刷新智能体工具失败。";
  } finally {
    if (showBusy) {
      busyKey.value = "";
    }
  }
}

async function previewToolPolicy() {
  if (!policyPreviewToolId.value) {
    error.value = "请选择需要预览的工具。";
    return;
  }
  busyKey.value = "tool-policy-preview";
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
    busyKey.value = "";
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
    busyKey.value = "maintenance-agent:refresh";
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
      busyKey.value = "";
    }
  }
}

async function refreshBackgroundProcesses(options: { silent?: boolean } = {}) {
  if (!canReadMaintenanceAgent.value) {
    return;
  }
  if (!options.silent) {
    busyKey.value = "background-processes:refresh";
  }
  error.value = "";
  try {
    backgroundProcessStatus.value = await bridge.getBackgroundProcesses();
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "刷新后台进程状态失败。";
  } finally {
    if (!options.silent) {
      busyKey.value = "";
    }
  }
}

async function refreshMonitorAlerts(options: { silent?: boolean } = {}) {
  if (!canReadMaintenanceAgent.value) {
    return;
  }
  if (!options.silent) {
    busyKey.value = "monitor-alerts:refresh";
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
      busyKey.value = "";
    }
  }
}

async function saveMonitorAlertConfig() {
  if (!canAdminMaintenanceAgent.value) {
    error.value = "当前账号没有维护配置权限。";
    return;
  }
  busyKey.value = "monitor-alerts:save";
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
    busyKey.value = "";
  }
}

async function saveMaintenanceAgentConfig() {
  if (!maintenanceAgentConfig.value) {
    return;
  }
  busyKey.value = "maintenance-agent:config";
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
    busyKey.value = "";
  }
}

async function chatMaintenanceAgent() {
  const message = maintenanceAgentMessage.value.trim();
  if (!message) {
    error.value = "请输入维护指令。";
    return;
  }
  busyKey.value = "maintenance-agent:chat";
  error.value = "";
  try {
    const result = await bridge.chatMaintenanceAgent({ message, wait: true });
    maintenanceAgentResultJson.value = jsonPreview(result);
    selectedMaintenanceAgentRun.value = result.run;
    await refreshMaintenanceAgent({ silent: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "智能巡检对话执行失败。";
  } finally {
    busyKey.value = "";
  }
}

async function runMaintenanceAgentRunbook() {
  busyKey.value = "maintenance-agent:run";
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
    busyKey.value = "";
  }
}

async function approveMaintenanceAgentRun(run: MaintenanceAgentRun) {
  busyKey.value = `maintenance-agent:approve:${run.runId}`;
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
    busyKey.value = "";
  }
}

async function cancelMaintenanceAgentRun(run: MaintenanceAgentRun) {
  busyKey.value = `maintenance-agent:cancel:${run.runId}`;
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
    busyKey.value = "";
  }
}

async function createGrant() {
  if (newGrantScopes.value.length === 0 && newGrantToolsets.value.length === 0) {
    error.value = "请至少选择一个工具权限范围或工具集。";
    return;
  }

  busyKey.value = "grant:create";
  error.value = "";
  issuedToolToken.value = "";

  try {
    const result = await bridge.createToolGrant({
      label: newGrantLabel.value,
      scopes: newGrantScopes.value,
      toolsets: newGrantToolsets.value,
    });
    replaceToolPlatformState(result.state);
    issuedToolToken.value = result.token;
    await refreshToolManagement({ silent: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "创建工具授权失败。";
  } finally {
    busyKey.value = "";
  }
}

async function updateGrant(grant: ToolPlatformGrant, patch: Partial<ToolPlatformGrant>) {
  busyKey.value = `grant:${grant.id}`;
  error.value = "";

  try {
    replaceToolPlatformState(
      await bridge.updateToolGrant(grant.id, {
        label: patch.label,
        enabled: patch.enabled,
        scopes: patch.scopes,
        toolsets: patch.toolsets,
      }),
    );
    await refreshToolManagement({ silent: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "更新工具授权失败。";
  } finally {
    busyKey.value = "";
  }
}

async function toggleGrantScope(grant: ToolPlatformGrant, scopeId: string) {
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

async function toggleGrantToolset(grant: ToolPlatformGrant, toolsetId: string) {
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

async function rotateGrant(grant: ToolPlatformGrant) {
  busyKey.value = `grant:${grant.id}`;
  error.value = "";
  issuedToolToken.value = "";

  try {
    const result = await bridge.rotateToolGrantToken(grant.id);
    replaceToolPlatformState(result.state);
    issuedToolToken.value = result.token;
    await refreshToolManagement({ silent: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "轮换工具令牌失败。";
  } finally {
    busyKey.value = "";
  }
}

async function deleteGrant(grant: ToolPlatformGrant) {
  if (!window.confirm(`撤销工具授权“${grant.label}”？`)) {
    return;
  }

  busyKey.value = `grant:${grant.id}`;
  error.value = "";

  try {
    replaceToolPlatformState(await bridge.deleteToolGrant(grant.id));
    await refreshToolManagement({ silent: true });
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "撤销工具授权失败。";
  } finally {
    busyKey.value = "";
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

  busyKey.value = `job:${jobId}`;
  error.value = "";

  try {
    await bridge.deleteJob(jobId);
    await refreshState();
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "删除任务失败。";
    busyKey.value = "";
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

  return filteredClients.value.filter((item) => {
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
      migrationStateLabels[item.migrationState].includes(query)
    );
  });
});

const displayedClients = computed(() => filteredClients.value.slice(0, 6));
const recentJobs = computed(() => filteredJobs.value.slice(0, 8));
const maintenanceAgentSummary = computed(() => consoleState.value?.maintenanceAgent || null);
const maintenanceAgentRunbooks = computed(() =>
  Object.values(
    maintenanceAgentConfig.value?.runbooks ||
      maintenanceAgentSummary.value?.config.runbooks ||
      {},
  ),
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
  () => backgroundProcesses.value.filter((item) => item.alive && !item.stale).length,
);
const monitorAlertSummary = computed(() => monitorAlertState.value?.summary || {
  activeCount: 0,
  criticalCount: 0,
  warningCount: 0,
  historyCount: 0,
});
const activeMonitorAlerts = computed(() => monitorAlertState.value?.activeAlerts || []);
const recentMonitorAlertHistory = computed(() => (monitorAlertState.value?.history || []).slice(0, 8));

const serverIdentity = computed(
  () =>
    consoleState.value?.discovery.value.serverLabel ||
    consoleState.value?.server.hostname ||
    "SplitAll Server",
);

const enabledMountCount = computed(
  () =>
    consoleState.value?.runtime.mounts.filter((mount) => mount.enabled)
      .length || 0,
);

const totalMountCount = computed(
  () => consoleState.value?.runtime.mounts.length || 0,
);

const moduleRows = computed(() => {
  const configured = consoleState.value?.runtime.mountModules || {};
  const runtimeMounts = consoleState.value?.runtime.mounts || [];
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
    consoleState.value?.runtime.currentAnalysisModuleId;
  return (
    consoleState.value?.runtime.analysisModules.find(
      (item) => item.id === moduleId,
    ) || null
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

onMounted(() => {
  void (async () => {
    const session = await refreshAuthState();
    if (!session?.bootstrap.required && (session?.session.authenticated || session?.enabled === false)) {
      await refreshState({ silent: true });
      await refreshKnowledgeConsole();
      await refreshContextCompiler({ silent: true });
      await restoreAgentExploreState();
      restoreInfoFeedHistory();
      void refreshCodexOAuthStatus();
      startServerEventSubscription();
    }
  })();
});

onUnmounted(() => {
  stopCodexOAuthPolling();
  stopAgentExplorePolling();
  stopAgentExploreSplitResize();
  clearInfoFeedSummaryStreamTimer();
  if (configTargetHighlightTimer) {
    window.clearTimeout(configTargetHighlightTimer);
    configTargetHighlightTimer = null;
  }
  stopServerEventSubscription();
});
</script>

<template>
  <div class="dashboard-shell">
    <aside class="side-nav">
      <div class="brand-block">
        <div>
          <h1>SPLITALL</h1>
        </div>
      </div>

      <nav class="side-nav-links">
        <button
          class="side-link"
          :class="{ active: currentView === 'dashboard' }"
          type="button"
          @click="switchView('dashboard')"
        >
          工作台
        </button>
        <button
          class="side-link"
          :class="{ active: currentView === 'feed' }"
          type="button"
          @click="switchView('feed')"
        >
          信息流
        </button>
        <button
          class="side-link"
          :class="{ active: currentView === 'sources' }"
          type="button"
          @click="switchView('sources')"
        >
          数据源
        </button>

        <section class="side-nav-section" aria-label="知识库">
          <p class="side-nav-section-title">知识库</p>
          <button
            v-for="tab in knowledgeTabs"
            :key="tab.id"
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'knowledge' && knowledgeTab === tab.id }"
            type="button"
            @click="openKnowledgeTab(tab.id)"
          >
            {{ knowledgeTabDisplayLabel(tab) }}
          </button>
        </section>

        <section class="side-nav-section" aria-label="智能体">
          <p class="side-nav-section-title">智能体</p>
          <button
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'intelligence' }"
            type="button"
            @click="switchView('intelligence')"
          >
            智能分析
          </button>
          <button
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'tools' }"
            type="button"
            @click="openAdmin('tools')"
          >
            智能体工具
          </button>
          <button
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'maintenanceAgent' }"
            type="button"
            @click="openAdmin('maintenanceAgent')"
          >
            智能巡检
          </button>
          <button
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'agentConfig' }"
            type="button"
            @click="openAdmin('agentConfig')"
          >
            智能体配置
          </button>
        </section>

        <section class="side-nav-section" aria-label="客户端">
          <p class="side-nav-section-title">客户端</p>
          <button
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'clients' }"
            type="button"
            @click="openAdmin('clients')"
          >
            设备管理
          </button>
        </section>

        <section class="side-nav-section" aria-label="系统状态">
          <p class="side-nav-section-title">系统状态</p>
          <button
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'storage' }"
            type="button"
            @click="openAdmin('storage')"
          >
            概览
          </button>
          <button
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'jobs' }"
            type="button"
            @click="openAdmin('jobs')"
          >
            后台任务
          </button>
        </section>

      </nav>

      <div class="side-nav-footer">
        <button class="side-cta" type="button" @click="openDrawer('discovery')">
          系统配置
        </button>
      </div>
    </aside>

    <main class="dashboard-canvas">
      <header class="topbar">
        <div class="topbar-heading">
          <div class="identity-row">
            <span class="url-badge">{{
              consoleState?.server.url || "正在连接服务端…"
            }}</span>
            <span class="identity-chip">{{
              consoleState?.discovery.value.mode || "active"
            }}</span>
          </div>
        </div>

        <div class="topbar-tools">
          <span v-if="currentUser" class="identity-chip">
            {{ currentUser.displayName }} / {{ currentUser.roleLabel }}
          </span>
          <button
            class="tool-button"
            type="button"
            :disabled="busyKey === 'refresh'"
            @click="refreshState()"
          >
            {{ busyKey === "refresh" ? "同步中" : "刷新" }}
          </button>
          <button
            v-if="currentUser"
            class="tool-button tool-button-ghost"
            type="button"
            :disabled="busyKey === 'auth:logout'"
            @click="logoutConsole"
          >
            退出
          </button>
        </div>
      </header>

      <div class="view-content">
        <div v-if="error" class="status-strip danger">
          <strong>错误</strong>
          <span>{{ error }}</span>
        </div>

        <template v-if="!isAuthenticated">
          <section class="auth-gate">
            <article class="surface-card auth-card">
              <div class="section-header">
                <div>
                  <h3>控制台登录</h3>
                  <p>首次启动时服务端会自动创建 owner 并生成初始密码；账号创建和密码修改仅允许通过服务端命令行执行。</p>
                </div>
              </div>

              <form class="form-grid auth-form" @submit.prevent="submitLoginAuth">
                <label>
                  <span>用户名</span>
                  <input v-model="loginForm.username" type="text" autocomplete="username" />
                </label>
                <label>
                  <span>密码</span>
                  <input v-model="loginForm.password" type="password" autocomplete="current-password" />
                </label>
                <button class="primary-action" type="submit" :disabled="busyKey === 'auth:login'">
                  {{ busyKey === "auth:login" ? "登录中" : "登录" }}
                </button>
              </form>
            </article>
          </section>
        </template>

        <template v-if="isAuthenticated && currentView === 'feed'">
          <article class="surface-card agent-explore-card agent-explore-home">
            <div class="section-header">
              <div>
                <h3>智能检索</h3>
              </div>
              <div class="section-actions">
                <button class="tool-button" type="button" @click="resetKnowledgeAgentExplore">
                  新会话
                </button>
              </div>
            </div>
            <div v-if="agentExploreTabs.length" class="agent-explore-tab-strip" role="tablist" aria-label="智能检索会话">
              <div
                v-for="session in agentExploreTabs"
                :key="session.runId"
                class="agent-explore-tab"
                role="tab"
                tabindex="0"
                :aria-selected="session.runId === agentExploreActiveTabId"
                :data-active="session.runId === agentExploreActiveTabId"
                :data-draft="isAgentExploreDraftSession(session)"
                :data-disabled="agentExploreTabBusy(session)"
                @click="agentExploreTabBusy(session) ? undefined : switchAgentExploreTab(session)"
                @keydown.enter.prevent="agentExploreTabBusy(session) ? undefined : switchAgentExploreTab(session)"
                @keydown.space.prevent="agentExploreTabBusy(session) ? undefined : switchAgentExploreTab(session)"
              >
                <div class="agent-explore-tab-main">
                  <strong>{{ agentExploreTabTitle(session) }}</strong>
                  <span>{{ agentExploreTabMeta(session) }}</span>
                </div>
                <button
                  class="agent-explore-tab-close"
                  type="button"
                  title="关闭标签"
                  :aria-label="`关闭标签 ${agentExploreTabTitle(session)}`"
                  :disabled="agentExploreTabBusy(session)"
                  @click.stop="closeAgentExploreTab(session)"
                >
                  ×
                </button>
              </div>
            </div>
            <form class="agent-explore-form" @submit.prevent="runKnowledgeAgentExplore">
              <label class="full-row">
                <span>问题</span>
                <input
                  v-model="agentExploreForm.query"
                  type="search"
                  placeholder="例如：帮我找最近的账单，并说明哪些证据真正相关"
                />
              </label>
              <label
                class="wide-field"
                data-config-target="agent-explore-agent"
                :data-config-highlighted="highlightedConfigTarget === 'agent-explore-agent'"
              >
                <span>模型</span>
                <el-select
                  v-model="agentExploreForm.modelAlias"
                  class="agent-explore-model-select"
                  teleported
                  filterable
                  placeholder="未分配智能体"
                  :persistent="false"
                  popper-class="splitall-select-popper"
                >
                  <el-option
                    v-for="option in agentExploreModelOptions"
                    :key="option.value"
                    :label="`${option.label}${option.enabled ? '' : `（${option.disabledReason || '不可用'}）`}`"
                    :value="option.value"
                    :disabled="!option.enabled"
                  />
                </el-select>
              </label>
              <button
                class="primary-action full-row"
                type="submit"
                :disabled="busyKey === 'knowledge:agent-explore' || !agentExploreForm.query.trim() || !selectedAgentExploreModel.enabled"
              >
                {{ busyKey === "knowledge:agent-explore" ? "检索中" : "开始检索" }}
              </button>
            </form>

            <div
              v-if="agentExploreProgressVisible"
              class="agent-explore-progress"
            >
              <div class="agent-explore-progress-header">
                <span>检索进度</span>
                <strong>{{ agentExploreProgress.label }}</strong>
              </div>
              <div class="agent-explore-progress-track">
                <span :style="{ width: `${agentExploreProgress.percent}%` }"></span>
              </div>
            </div>

            <details v-if="agentExploreHistory.length" class="agent-explore-history">
              <summary>
                <span>历史会话</span>
                <small>{{ agentExploreHistory.length }} 条，滚动查看</small>
              </summary>
              <div class="agent-explore-history-list">
                <div
                  v-for="session in agentExploreHistory"
                  :key="session.runId"
                  class="agent-explore-history-item"
                  :data-active="session.runId === agentExploreActiveTabId"
                >
                  <button
                    class="agent-explore-history-main"
                    type="button"
                    :disabled="busyKey === `knowledge:agent-explore:load:${session.runId}`"
                    @click="switchAgentExploreTab(session)"
                  >
                    <strong>{{ agentExploreSessionLabel(session) }}</strong>
                    <span>{{ session.status || "unknown" }} · {{ shortId(session.runId) }}</span>
                    <small v-if="session.answerPreview">{{ session.answerPreview }}</small>
                  </button>
                  <button
                    class="agent-explore-history-delete"
                    type="button"
                    title="删除历史会话"
                    :aria-label="`删除历史会话 ${agentExploreSessionLabel(session)}`"
                    :disabled="busyKey === `knowledge:agent-explore:load:${session.runId}`"
                    @click.stop="deleteAgentExploreHistorySession(session)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M6 6l1 15h10l1-15" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  </button>
                </div>
              </div>
            </details>

            <div
              v-if="agentExploreResult || busyKey === 'knowledge:agent-explore'"
              class="agent-explore-workspace"
              :class="{ 'is-resizing': agentExploreSplitDragging }"
              :style="agentExploreSplitStyle"
              ref="agentExploreSplitRef"
            >
              <details
                class="agent-explore-trace-card"
                :open="agentExploreTraceOpen"
                @toggle="handleAgentExploreTraceToggle"
              >
                <summary>
                  <span>工具轨迹</span>
                  <small>
                    {{ agentExploreSteps.length }} 轮<span v-if="agentExploreWorkspaceId"> · Workspace {{ shortId(agentExploreWorkspaceId) }}</span>
                  </small>
                </summary>
                <div class="agent-explore-trace-list">
                  <div v-if="busyKey === 'knowledge:agent-explore'" class="empty-note">模型正在选择本地工具。</div>
                  <details
                    v-for="step in agentExploreSteps"
                    :key="`agent-explore-step-${step.iteration}`"
                    class="agent-explore-step"
                    :open="agentExploreStepOpen(step)"
                  >
                    <summary class="agent-explore-step-header">
                      <strong>第 {{ step.iteration }} 轮</strong>
                      <span>{{ agentExploreStepSummary(step) }}</span>
                    </summary>
                    <div
                      v-if="step.events?.length || step.toolCalls?.length || step.toolResults?.length || step.contextBudget"
                      class="agent-explore-step-body"
                    >
                      <div v-if="step.events?.length" class="agent-state-timeline">
                        <div
                          v-for="(eventItem, eventIndex) in step.events"
                          :key="`agent-explore-event-${step.iteration}-${eventIndex}`"
                          class="agent-state-event"
                          :data-state="agentExploreEventStatus(eventItem)"
                        >
                          <span>{{ agentExploreEventLabel(eventItem) }}</span>
                          <small>{{ agentExploreEventTime(eventItem) }}</small>
                        </div>
                      </div>
                      <details
                        v-for="call in step.toolCalls || []"
                        :key="call.id"
                        class="agent-function-call"
                        :data-state="call.status || 'selected'"
                      >
                        <summary>
                          <strong>{{ call.name }}</strong>
                          <span>{{ call.status || "selected" }}</span>
                        </summary>
                        <pre>{{ jsonPreview(call.arguments || {}) }}</pre>
                      </details>
                      <details
                        v-for="(toolResult, toolResultIndex) in step.toolResults || []"
                        :key="agentExploreResultKey(step, toolResult, toolResultIndex)"
                        class="agent-tool-result"
                        :data-state="toolResult.status || 'completed'"
                      >
                        <summary>
                          <strong>{{ toolResult.tool }}</strong>
                          <span>{{ toolResult.status || "completed" }}</span>
                        </summary>
                        <pre v-if="toolResult.result">{{ jsonPreview(toolResult.result || {}) }}</pre>
                        <div v-else class="empty-note">工具调用中，等待返回。</div>
                      </details>
                      <small v-if="step.contextBudget">
                        上下文 {{ step.contextBudget.totalTokens || 0 }} /
                        {{ step.contextBudget.contextWindowTokens || 0 }}
                      </small>
                    </div>
                  </details>
                </div>
              </details>
              <div
                class="agent-explore-split-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="调整工具轨迹和检索结果宽度"
                tabindex="0"
                :aria-valuenow="Math.round(agentExploreSplitLeftPercent)"
                aria-valuemin="28"
                aria-valuemax="68"
                @pointerdown="startAgentExploreSplitResize"
                @keydown="handleAgentExploreSplitKeydown"
              >
                <span></span>
              </div>
              <section class="agent-explore-answer">
                <div class="compact-section-header">
                  <h3>检索结果</h3>
                  <div class="agent-result-actions">
                    <span v-if="agentExploreResult?.degraded">降级</span>
                    <button
                      class="tool-button tool-button-ghost compact-action"
                      type="button"
                      :disabled="!agentExploreDocumentMarkdown"
                      @click="copyAgentExploreDocument"
                    >
                      复制文档
                    </button>
                    <button
                      class="tool-button compact-action"
                      type="button"
                      :disabled="!agentExploreDocumentMarkdown"
                      @click="exportAgentExploreDocument"
                    >
                      导出 Markdown
                    </button>
                  </div>
                </div>
                <div
                  v-if="agentExploreResult?.answer"
                  class="evidence-rendered-content"
                  @click="handleAgentAnswerClick"
                  v-html="agentExploreAnswerHtml"
                ></div>
                <div v-else class="knowledge-preview-empty">
                  <strong>等待结果</strong>
                  <span>模型会调用本地工具检索，再决定是否打开证据。</span>
                </div>
                <details v-if="agentExploreLinkedEvidenceRefs.length" class="advanced-config">
                  <summary>引用证据</summary>
                  <div class="agent-evidence-ref-list">
                    <button
                      v-for="refId in agentExploreLinkedEvidenceRefs"
                      :key="refId"
                      class="evidence-ref-button"
                      type="button"
                      :disabled="busyKey === `knowledge:evidence:${refId}`"
                      @click="openAgentEvidencePreview(refId)"
                    >
                      {{ refId }}
                    </button>
                  </div>
                </details>
                <details v-if="agentExploreResult?.contextPack" class="advanced-config">
                  <summary>上下文包</summary>
                  <pre>{{ jsonPreview(agentExploreResult.contextPack || {}) }}</pre>
                </details>
                <details v-if="agentExploreResult" class="advanced-config">
                  <summary>运行结构</summary>
                  <pre>{{ jsonPreview(agentExploreResult || {}) }}</pre>
                </details>
              </section>
            </div>
          </article>
        </template>

        <template v-if="isAuthenticated && currentView === 'dashboard'">
          <article class="surface-card configuration-alert-card">
            <div class="section-header">
              <div>
                <h3>空配置报警</h3>
                <p>{{ agentConfigurationAlertSummary }}</p>
              </div>
              <span
                class="status-pill"
                :data-tone="agentConfigurationAlerts.length ? 'warning' : 'success'"
              >
                {{ agentConfigurationAlerts.length ? `${agentConfigurationAlerts.length} 项` : "已就绪" }}
              </span>
            </div>
            <div v-if="agentConfigurationAlerts.length" class="configuration-alert-list">
              <button
                v-for="alertItem in agentConfigurationAlerts"
                :key="alertItem.alertId"
                class="configuration-alert-item"
                type="button"
                :data-tone="alertItem.tone"
                @click="openAgentConfigurationAlert(alertItem)"
              >
                <span class="configuration-alert-category">{{ alertItem.category }}</span>
                <strong>{{ alertItem.title }}</strong>
                <span>{{ alertItem.detail }}</span>
                <em>{{ alertItem.status }} · 去配置</em>
              </button>
            </div>
            <div v-else class="configuration-alert-empty">
              <strong>没有空配置</strong>
              <span>当前工作流中需要智能体的入口都已经显式绑定可用模型。</span>
            </div>
          </article>
          <article class="surface-card rule-authoring-card">
            <div class="section-header">
              <div>
                <h3>创建规则</h3>
                <p>同一份规则草稿支持智能对话和人工配置两种创建方式，任一侧修改都会同步到另一侧。</p>
              </div>
              <div class="rule-creation-toggle" role="tablist" aria-label="创建规则方式">
                <button
                  type="button"
                  role="tab"
                  :aria-selected="ruleCreationMode === 'chat'"
                  :data-active="ruleCreationMode === 'chat'"
                  @click="ruleCreationMode = 'chat'"
                >
                  智能对话
                </button>
                <button
                  type="button"
                  role="tab"
                  :aria-selected="ruleCreationMode === 'manual'"
                  :data-active="ruleCreationMode === 'manual'"
                  @click="ruleCreationMode = 'manual'"
                >
                  人工配置
                </button>
              </div>
            </div>
            <form class="rule-authoring-form" :data-mode="ruleCreationMode" @submit.prevent="runRuleAuthoringChat">
              <template v-if="ruleCreationMode === 'chat'">
                <label class="full-row">
                  <span>需求</span>
                  <textarea
                    v-model="ruleAuthoringForm.message"
                    rows="4"
                    placeholder="例如：生成一个黄金规则，完全一样的知识直接跳过"
                  ></textarea>
                </label>
                <label
                  data-config-target="rule-authoring-agent"
                  :data-config-highlighted="highlightedConfigTarget === 'rule-authoring-agent'"
                >
                  <span>模型</span>
                  <el-select
                    v-model="ruleAuthoringForm.modelAlias"
                    teleported
                    filterable
                    placeholder="未分配智能体"
                    :persistent="false"
                    popper-class="splitall-select-popper"
                  >
                    <el-option
                      v-for="option in ruleAuthoringModelOptions"
                      :key="option.value"
                      :label="`${option.label}${option.enabled ? '' : `（${option.disabledReason || '不可用'}）`}`"
                      :value="option.value"
                      :disabled="!option.enabled"
                    />
                  </el-select>
                </label>
              </template>
              <template v-else>
                <label>
                  <span>规则名称</span>
                  <input
                    v-model="ruleAuthoringForm.ruleName"
                    type="text"
                    placeholder="例如：重复知识处理规则"
                  />
                </label>
                <label>
                  <span>适用范围</span>
                  <el-select
                    v-model="ruleAuthoringForm.scope"
                    teleported
                    :persistent="false"
                    popper-class="splitall-select-popper"
                  >
                    <el-option
                      v-for="option in ruleScopeOptions"
                      :key="option.value"
                      :label="option.label"
                      :value="option.value"
                    />
                  </el-select>
                </label>
                <label>
                  <span>匹配方式</span>
                  <el-select
                    v-model="ruleAuthoringForm.matchStrategy"
                    teleported
                    :persistent="false"
                    popper-class="splitall-select-popper"
                  >
                    <el-option
                      v-for="option in ruleMatchStrategyOptions"
                      :key="option.value"
                      :label="option.label"
                      :value="option.value"
                    />
                  </el-select>
                </label>
                <label>
                  <span>执行动作</span>
                  <el-select
                    v-model="ruleAuthoringForm.action"
                    teleported
                    :persistent="false"
                    popper-class="splitall-select-popper"
                  >
                    <el-option
                      v-for="option in ruleActionOptions"
                      :key="option.value"
                      :label="option.label"
                      :value="option.value"
                    />
                  </el-select>
                </label>
                <label>
                  <span>最低置信度</span>
                  <input
                    v-model.number="ruleAuthoringForm.confidence"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                  />
                </label>
                <label class="full-row">
                  <span>补充说明</span>
                  <textarea
                    v-model="ruleAuthoringForm.notes"
                    rows="3"
                    placeholder="写清楚边界条件、例外情况或需要人工审核的场景"
                  ></textarea>
                </label>
              </template>
              <button
                class="primary-action"
                type="submit"
                :disabled="busyKey === 'knowledge:rule-authoring' || !ruleAuthoringCanSubmit"
              >
                {{ busyKey === "knowledge:rule-authoring" ? "生成中" : (ruleCreationMode === "manual" ? "按配置创建规则" : "生成规则草稿") }}
              </button>
            </form>
            <div class="rule-authoring-sync-preview">
              <strong>同步草稿</strong>
              <span>{{ ruleAuthoringManualSummary }}</span>
              <div class="rule-authoring-config-label">机器可读配置</div>
              <pre>{{ jsonPreview(ruleAuthoringDraftPayload) }}</pre>
            </div>
            <div v-if="ruleAuthoringResult" class="rule-authoring-result">
              <div class="rule-authoring-status">
                <strong>{{ ruleAuthoringStatusLabel(ruleAuthoringResult.status) }}</strong>
                <span v-if="ruleAuthoringResult.runId">{{ shortId(ruleAuthoringResult.runId) }}</span>
              </div>
              <div class="rule-authoring-pipeline">
                <span
                  v-for="(step, stepIndex) in ruleAuthoringResult.steps || []"
                  :key="`${String(step.stage || 'stage')}:${stepIndex}`"
                  :data-status="String(step.status || '')"
                >
                  {{ step.stage }} · {{ step.status }}
                </span>
              </div>
              <div v-if="ruleAuthoringResult.confirmation" class="rule-authoring-confirm">
                <span>
                  规则包 {{ ruleAuthoringResult.confirmation.packageId }} v{{ ruleAuthoringResult.confirmation.version }}
                  已保存为草稿。
                </span>
                <button
                  class="tool-button"
                  type="button"
                  :disabled="busyKey === 'knowledge:rule-authoring:publish'"
                  @click="publishRuleAuthoringPackage"
                >
                  {{ busyKey === "knowledge:rule-authoring:publish" ? "发布中" : "确认发布" }}
                </button>
              </div>
              <details class="advanced-config">
                <summary>门禁结果</summary>
                <pre>{{ jsonPreview(ruleAuthoringResult.gate || {}) }}</pre>
              </details>
              <details class="advanced-config">
                <summary>生成的 JSON 规则包</summary>
                <pre>{{ jsonPreview(ruleAuthoringResult.package || {}) }}</pre>
              </details>
            </div>
          </article>
        </template>

        <template v-if="isAuthenticated && currentView === 'feed'">
          <section class="info-feed-shell">
            <div class="info-feed-dialog">
              <div class="info-feed-render">
                <details v-if="infoFeedHistory.length" class="info-feed-history">
                  <summary>
                    <span>历史记录</span>
                    <small>{{ infoFeedHistory.length }} 条</small>
                  </summary>
                  <div class="info-feed-history-list">
                    <article
                      v-for="historyRun in infoFeedHistory"
                      :key="historyRun.runId"
                      class="info-feed-history-item"
                      :data-active="infoFeedCurrentRun?.runId === historyRun.runId"
                    >
                      <button class="info-feed-history-main" type="button" @click="openInfoFeedHistoryRun(historyRun)">
                        <strong>{{ historyRun.query || "未命名问题" }}</strong>
                        <span>
                          {{ formatCompactDate(historyRun.completedAt || historyRun.startedAt) }}
                          · {{ historyRun.summary.status || "unknown" }}
                        </span>
                        <small>{{ truncateInfoFeedText(historyRun.summary.answer || historyRun.agent.response?.answer || "", 140) }}</small>
                      </button>
                      <button
                        class="info-feed-history-delete"
                        type="button"
                        title="删除历史记录"
                        :aria-label="`删除历史记录 ${historyRun.query || historyRun.runId}`"
                        @click.stop="deleteInfoFeedHistory(historyRun.runId)"
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M6 6l1 15h10l1-15" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </button>
                    </article>
                  </div>
                </details>

                <div v-if="!infoFeedCurrentRun" class="info-feed-empty">
                  <strong>信息流</strong>
                  <span>输入问题后，会同时启动原文检索和智能规划，最后由总结智能体合并结果。</span>
                </div>

                <div v-else class="info-feed-flow">
                  <section
                    v-if="infoFeedParentRunForCurrent && infoFeedExpertFeedbackForRun(infoFeedParentRunForCurrent, 'summary').length"
                    class="info-feed-summary-filter info-feed-parent-context-card"
                  >
                    <div class="info-feed-summary-header">
                      <div>
                        <h3>知识归纳</h3>
                        <span>上一轮专家确认</span>
                      </div>
                      <span class="status-pill" data-tone="success">已选择</span>
                    </div>
                    <div class="info-feed-expert-feedback-list">
                      <article
                        v-for="feedbackItem in infoFeedExpertFeedbackForRun(infoFeedParentRunForCurrent, 'summary')"
                        :key="feedbackItem.feedbackId"
                        class="info-feed-expert-feedback"
                        :data-sync="feedbackItem.syncStatus"
                      >
                        <div>
                          <strong>人类专家意见</strong>
                          <span>{{ feedbackItem.selectedLabel }}</span>
                        </div>
                        <p>{{ feedbackItem.prompt }}</p>
                        <small>{{ feedbackItem.followUpQuestion }}</small>
                      </article>
                    </div>
                  </section>

                  <article
                    v-if="infoFeedParentRunForCurrent?.summary.answer"
                    class="info-feed-final-card info-feed-parent-context-card"
                  >
                    <div class="compact-section-header">
                      <h3>输出报告</h3>
                      <div class="agent-result-actions">
                        <span>上一轮</span>
                      </div>
                    </div>
                    <div
                      class="evidence-rendered-content info-feed-summary-content"
                      @click="handleAgentAnswerClick"
                      v-html="infoFeedParentSummaryHtml"
                    ></div>
                    <div
                      v-if="infoFeedExpertFeedbackForRun(infoFeedParentRunForCurrent, 'report').length"
                      class="info-feed-expert-feedback-list"
                    >
                      <article
                        v-for="feedbackItem in infoFeedExpertFeedbackForRun(infoFeedParentRunForCurrent, 'report')"
                        :key="feedbackItem.feedbackId"
                        class="info-feed-expert-feedback"
                        :data-sync="feedbackItem.syncStatus"
                      >
                        <div>
                          <strong>人类专家意见</strong>
                          <span>{{ feedbackItem.selectedLabel }}</span>
                        </div>
                        <p>{{ feedbackItem.prompt }}</p>
                        <small>{{ feedbackItem.followUpQuestion }}</small>
                      </article>
                    </div>
                  </article>

                  <template
                    v-for="(turn, turnIndex) in infoFeedCurrentRun.turns || []"
                    :key="turn.turnId"
                  >
                    <article class="info-feed-final-card info-feed-user-turn-card">
                      <div class="compact-section-header">
                        <div>
                          <h3>{{ infoFeedUserCardTitle(turn) }}</h3>
                          <span>{{ infoFeedTurnTitle(turn, turnIndex) }}</span>
                        </div>
                        <div class="agent-result-actions">
                          <span>{{ formatCompactDate(turn.completedAt) }}</span>
                        </div>
                      </div>
                      <div class="info-feed-user-message">
                        <p>{{ infoFeedTurnQuestion(turn) }}</p>
                        <div
                          v-if="infoFeedTurnAttachments(turn).length"
                          class="info-feed-user-attachment-list"
                        >
                          <span
                            v-for="attachment in infoFeedTurnAttachments(turn)"
                            :key="attachment.id"
                            class="info-feed-user-attachment"
                            :data-tone="infoFeedStatusTone(attachment.status)"
                          >
                            <strong>{{ attachment.name }}</strong>
                            <small>{{ formatFileSize(attachment.size) }} · {{ infoFeedStatusLabel(attachment.status) }}</small>
                          </span>
                        </div>
                      </div>
                    </article>

                    <article class="info-feed-final-card info-feed-turn-card">
                      <div class="compact-section-header">
                        <div>
                          <h3>输出报告</h3>
                          <span>{{ infoFeedTurnTitle(turn, turnIndex) }} · {{ infoFeedTurnQuestion(turn) }}</span>
                        </div>
                        <div class="agent-result-actions">
                          <span v-if="turn.summaryFallback">兜底摘要</span>
                          <span>{{ formatCompactDate(turn.completedAt) }}</span>
                        </div>
                      </div>
                      <div
                        v-if="turn.summaryAnswer"
                        class="evidence-rendered-content info-feed-summary-content"
                        @click="handleAgentAnswerClick"
                        v-html="infoFeedTurnSummaryHtml(turn)"
                      ></div>
                      <p v-if="turn.summaryError" class="module-note danger-note">
                        {{ turn.summaryError }}
                      </p>
                      <div
                        v-if="turn.expertFeedback.length"
                        class="info-feed-expert-feedback-list"
                      >
                        <article
                          v-for="feedbackItem in turn.expertFeedback"
                          :key="feedbackItem.feedbackId"
                          class="info-feed-expert-feedback"
                          :data-sync="feedbackItem.syncStatus"
                        >
                          <div>
                            <strong>人类专家意见</strong>
                            <span>{{ feedbackItem.selectedLabel }}</span>
                          </div>
                          <p>{{ feedbackItem.prompt }}</p>
                          <small>{{ feedbackItem.followUpQuestion }}</small>
                        </article>
                      </div>
                    </article>
                  </template>

                  <article class="info-feed-final-card info-feed-user-turn-card">
                    <div class="compact-section-header">
                      <div>
                        <h3>{{ infoFeedUserCardTitle(infoFeedCurrentRun) }}</h3>
                        <span>{{ infoFeedCurrentRun.followUp ? "本轮追问" : "本轮输入" }}</span>
                      </div>
                      <div class="agent-result-actions">
                        <span>{{ formatCompactDate(infoFeedCurrentRun.startedAt) }}</span>
                      </div>
                    </div>
                    <div class="info-feed-user-message">
                      <p>{{ infoFeedCurrentUserQuestion(infoFeedCurrentRun) }}</p>
                      <div
                        v-if="infoFeedCurrentRun.attachments.length"
                        class="info-feed-user-attachment-list"
                      >
                        <span
                          v-for="attachment in infoFeedCurrentRun.attachments"
                          :key="attachment.id"
                          class="info-feed-user-attachment"
                          :data-tone="infoFeedStatusTone(attachment.status)"
                        >
                          <strong>{{ attachment.name }}</strong>
                          <small>{{ formatFileSize(attachment.size) }} · {{ infoFeedStatusLabel(attachment.status) }}</small>
                        </span>
                      </div>
                    </div>
                  </article>

                  <div
                    class="info-feed-track-grid"
                    :data-has-attachments="infoFeedCurrentRun.attachments.length > 0"
                  >
                    <article
                      v-if="infoFeedCurrentRun.attachments.length > 0"
                      class="info-feed-track-card"
                    >
                      <div class="info-feed-track-header">
                        <div>
                          <h3>附件处理</h3>
                          <span>{{ infoFeedCurrentRun.attachments.length }} 个附件</span>
                        </div>
                        <span class="status-pill" data-tone="info">页面读取</span>
                      </div>
                      <div class="info-feed-track-body">
                        <div
                          v-for="attachment in infoFeedCurrentRun.attachments"
                          :key="attachment.id"
                          class="info-feed-attachment-row"
                          :data-tone="infoFeedStatusTone(attachment.status)"
                        >
                          <strong>{{ attachment.name }}</strong>
                          <span>{{ formatFileSize(attachment.size) }} · {{ infoFeedStatusLabel(attachment.status) }}</span>
                          <small v-if="attachment.error">{{ attachment.error }}</small>
                          <small v-else-if="attachment.text">{{ truncateInfoFeedText(attachment.text, 120) }}</small>
                          <div class="info-feed-progress-track">
                            <span :style="{ width: `${attachment.progress}%` }"></span>
                          </div>
                        </div>
                      </div>
                    </article>

                    <article class="info-feed-track-card" data-track="source-search">
                      <div class="info-feed-track-header">
                        <div>
                          <h3>原文检索</h3>
                          <span v-if="infoFeedCurrentRun.keyword.status === 'completed'">
                            高关联 {{ infoFeedKeywordItems.length }} · 低关联 {{ infoFeedLowRelevanceKeywordItems.length }}{{ infoFeedCurrentRun.keyword.fromCache ? " · 缓存" : "" }}
                          </span>
                          <span v-else>直接扫描服务端原始文件{{ infoFeedCurrentRun.keyword.fromCache ? " · 缓存" : "" }}</span>
                        </div>
                        <span class="status-pill" :data-tone="infoFeedStatusTone(infoFeedCurrentRun.keyword.status)">
                          {{ infoFeedStatusLabel(infoFeedCurrentRun.keyword.status) }}
                        </span>
                      </div>
                      <div
                        class="info-feed-progress-track"
                        :data-indeterminate="infoFeedCurrentRun.keyword.status === 'running'"
                      >
                        <span :style="{ width: `${infoFeedCurrentRun.keyword.progress}%` }"></span>
                      </div>
                      <div class="info-feed-track-body">
                        <div v-if="infoFeedCurrentRun.keyword.status === 'running'" class="empty-note">
                          {{ infoFeedKeywordProgressLabel }}
                        </div>
                        <div v-else-if="infoFeedCurrentRun.keyword.error" class="empty-note">
                          {{ infoFeedCurrentRun.keyword.error }}
                        </div>
                        <div
                          v-else-if="infoFeedCurrentRun.keyword.status === 'completed' && infoFeedKeywordProgressLabel"
                          class="empty-note"
                        >
                          {{ infoFeedKeywordProgressLabel }}
                        </div>
                        <div
                          v-if="infoFeedCurrentRun.keyword.status === 'completed' && infoFeedContextGateNotice.message"
                          class="info-feed-context-gate-card"
                        >
                          <strong>上下文门禁</strong>
                          <span>{{ infoFeedContextGateNotice.message }}</span>
                          <small>
                            高关联 {{ infoFeedContextGateNotice.includedHigh }}/{{ infoFeedContextGateNotice.highCount }}
                            · 低关联 {{ infoFeedContextGateNotice.includedLow }}/{{ infoFeedContextGateNotice.lowCount }}
                            · 剩余约 {{ Number(infoFeedContextGateNotice.remainingTokens || 0).toLocaleString() }} tokens
                          </small>
                        </div>
                        <button
                          v-for="item in infoFeedKeywordItems"
                          :key="item.evidenceId || item.itemId || item.documentId || item.title"
                          class="info-feed-result-row"
                          type="button"
                          :disabled="!item.evidenceId"
                          @click="item.evidenceId ? openAgentEvidencePreview(item.evidenceId) : undefined"
                        >
                          <strong>{{ item.title || "未命名来源" }}</strong>
                          <span>{{ truncateInfoFeedText(item.snippet || "无片段", 180) }}</span>
                          <small>
                            {{ item.evidenceId || item.documentId || "无证据编号" }}
                            <template v-if="item.score !== undefined"> · {{ Number(item.score).toFixed(3) }}</template>
                          </small>
                        </button>
                        <div
                          v-if="infoFeedCurrentRun.keyword.status === 'completed' && infoFeedKeywordItems.length === 0 && infoFeedLowRelevanceKeywordItems.length"
                          class="empty-note"
                        >
                          未找到可读正文同时命中的高关联邮件；已展开低关联原始命中。
                        </div>
                        <details
                          v-if="infoFeedCurrentRun.keyword.status === 'completed' && infoFeedLowRelevanceKeywordItems.length"
                          class="info-feed-low-relevance-panel"
                          :open="infoFeedKeywordItems.length === 0"
                        >
                          <summary>
                            低关联邮件 {{ infoFeedLowRelevanceKeywordItems.length }} 封
                            <small>原始 EML 命中，但主要命中在 URL、HTML 参数、编码块或不可读区域</small>
                          </summary>
                          <button
                            v-for="item in infoFeedLowRelevanceKeywordItems"
                            :key="item.evidenceId || item.itemId || item.documentId || item.title"
                            class="info-feed-result-row"
                            data-tier="low"
                            type="button"
                            :disabled="!item.evidenceId"
                            @click="item.evidenceId ? openAgentEvidencePreview(item.evidenceId) : undefined"
                          >
                            <strong>{{ item.title || "未命名来源" }}</strong>
                            <span>{{ truncateInfoFeedText(item.snippet || "无片段", 180) }}</span>
                            <small>
                              {{ item.evidenceId || item.documentId || "无证据编号" }}
                              <template v-if="item.score !== undefined"> · {{ Number(item.score).toFixed(3) }}</template>
                            </small>
                          </button>
                        </details>
                        <div
                          v-if="infoFeedCurrentRun.keyword.status === 'completed' && infoFeedAllKeywordItems.length === 0"
                          class="empty-note"
                        >
                          没有找到原文检索结果。
                        </div>
                      </div>
                    </article>

                    <article class="info-feed-track-card" data-track="agent-plan">
                      <div class="info-feed-track-header">
                        <div>
                          <h3>智能规划</h3>
                          <span>{{ selectedInfoFeedModel.label }}</span>
                        </div>
                        <span class="status-pill" :data-tone="infoFeedStatusTone(infoFeedCurrentRun.agent.status)">
                          {{ infoFeedStatusLabel(infoFeedCurrentRun.agent.status) }}
                        </span>
                      </div>
                      <div class="info-feed-progress-track">
                        <span :style="{ width: `${infoFeedCurrentRun.agent.progress}%` }"></span>
                      </div>
                      <div class="info-feed-track-body">
                        <div v-if="infoFeedCurrentRun.agent.status === 'running'" class="empty-note">
                          正在规划工具调用和检索证据。
                        </div>
                        <div v-if="infoFeedAgentSteps.length" class="info-feed-step-list">
                          <div
                            v-for="step in infoFeedAgentSteps"
                            :key="`info-feed-step-${step.iteration}`"
                            class="info-feed-step-row"
                          >
                            <strong>第 {{ step.iteration }} 轮</strong>
                            <span>{{ agentExploreStepSummary(step) }}</span>
                          </div>
                        </div>
                        <div v-if="infoFeedCurrentRun.agent.error" class="empty-note">
                          {{ infoFeedCurrentRun.agent.error }}
                        </div>
                        <div v-if="infoFeedAgentAnswer" class="info-feed-agent-answer">
                          {{ truncateInfoFeedText(infoFeedAgentAnswer, 520) }}
                        </div>
                      </div>
                    </article>
                  </div>

                  <section v-if="infoFeedNeedsModelSelection" class="info-feed-model-pause">
                    <div>
                      <h3>需要选择可用模型</h3>
                      <p>{{ infoFeedModelSelectionMessage }}</p>
                    </div>
                    <label
                      data-config-target="info-feed-summary-agent"
                      :data-config-highlighted="highlightedConfigTarget === 'info-feed-summary-agent'"
                    >
                      <span>模型</span>
                      <el-select
                        v-model="infoFeedForm.modelAlias"
                        teleported
                        filterable
                        placeholder="未分配智能体"
                        :persistent="false"
                        popper-class="splitall-select-popper"
                      >
                        <el-option
                          v-for="option in infoFeedModelOptions"
                          :key="option.value"
                          :label="`${option.label}${option.enabled ? '' : `（${option.disabledReason || '不可用'}）`}`"
                          :value="option.value"
                          :disabled="!option.enabled"
                        />
                      </el-select>
                    </label>
                    <button
                      class="primary-action"
                      type="button"
                      :disabled="!selectedInfoFeedModel.enabled"
                      @click="continueInfoFeedAfterModelSelection"
                    >
                      继续
                    </button>
                  </section>

                  <section v-if="infoFeedNeedsRetryContinue" class="info-feed-model-pause info-feed-retry-pause">
                    <div>
                      <h3>{{ infoFeedRetryStageLabel(infoFeedCurrentRun?.pausedForRetry) }}请求中断</h3>
                      <p>{{ infoFeedRetryMessage }}</p>
                    </div>
                    <button
                      class="primary-action"
                      type="button"
                      :disabled="infoFeedCurrentRun?.summary.status === 'running'"
                      @click="continueInfoFeedAfterRetry"
                    >
                      继续
                    </button>
                  </section>

                  <section v-if="infoFeedReadyForSummary" class="info-feed-summary-filter">
                    <div class="info-feed-summary-header">
                      <div>
                        <h3>知识归纳</h3>
                        <span>融合原文检索、智能规划和附件处理结果</span>
                      </div>
                      <span class="status-pill" :data-tone="infoFeedStatusTone(infoFeedCurrentRun.summary.status)">
                        总结{{ infoFeedStatusLabel(infoFeedCurrentRun.summary.status) }}
                      </span>
                    </div>
                    <div class="info-feed-summary-main">
                      <div class="info-feed-summary-meta" aria-label="总结运行参数">
                        <span><strong>总结模型</strong>{{ infoFeedSummaryRuntime.model }}</span>
                        <span><strong>temperature</strong>{{ infoFeedSummaryRuntime.temperature }}</span>
                        <span><strong>max_tokens</strong>{{ infoFeedSummaryRuntime.maxTokens }}</span>
                      </div>
                      <button
                        class="tool-button compact-action"
                        type="button"
                        :disabled="infoFeedCurrentRun.summary.status === 'running'"
                        @click="runInfoFeedSummaryAgent()"
                      >
                        重新总结
                      </button>
                    </div>
                    <div
                      v-if="infoFeedExpertFeedbackFor('summary').length"
                      class="info-feed-expert-feedback-list"
                    >
                      <article
                        v-for="feedbackItem in infoFeedExpertFeedbackFor('summary')"
                        :key="feedbackItem.feedbackId"
                        class="info-feed-expert-feedback"
                        :data-sync="feedbackItem.syncStatus"
                      >
                        <div>
                          <strong>人类专家意见</strong>
                          <span>{{ feedbackItem.selectedLabel }}</span>
                        </div>
                        <p>{{ feedbackItem.prompt }}</p>
                        <small>{{ feedbackItem.followUpQuestion }}</small>
                      </article>
                    </div>
                  </section>

                  <article
                    v-if="infoFeedCurrentRun.summary.answer || infoFeedCurrentRun.summary.status === 'running'"
                    class="info-feed-final-card"
                  >
                    <div class="compact-section-header">
                      <h3>输出报告</h3>
                      <div class="agent-result-actions">
                        <span v-if="infoFeedCurrentRun.summary.fallback">兜底摘要</span>
                        <button
                          class="tool-button tool-button-ghost compact-action"
                          type="button"
                          :disabled="!infoFeedSummaryMarkdown"
                          @click="copyInfoFeedSummary"
                        >
                          <svg class="button-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="9" y="9" width="13" height="13" rx="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          复制
                        </button>
                        <button
                          class="tool-button compact-action"
                          type="button"
                          :disabled="!infoFeedSummaryMarkdown"
                          @click="exportInfoFeedSummary"
                        >
                          导出 Markdown
                        </button>
                      </div>
                    </div>
                    <div v-if="infoFeedCurrentRun.summary.status === 'running'" class="info-feed-summary-running">
                      <span>总结智能体正在融合两路结果。</span>
                      <div class="info-feed-progress-track">
                        <span :style="{ width: `${infoFeedCurrentRun.summary.progress}%` }"></span>
                      </div>
                    </div>
                    <div
                      v-else
                      class="evidence-rendered-content info-feed-summary-content"
                      :data-streaming="infoFeedSummaryIsStreaming"
                      @click="handleAgentAnswerClick"
                      v-html="infoFeedStreamingSummaryHtml"
                    ></div>
                    <p v-if="infoFeedCurrentRun.summary.error" class="module-note danger-note">
                      {{ infoFeedCurrentRun.summary.error }}
                    </p>
                    <div
                      v-if="infoFeedExpertFeedbackFor('report').length"
                      class="info-feed-expert-feedback-list"
                    >
                      <article
                        v-for="feedbackItem in infoFeedExpertFeedbackFor('report')"
                        :key="feedbackItem.feedbackId"
                        class="info-feed-expert-feedback"
                        :data-sync="feedbackItem.syncStatus"
                      >
                        <div>
                          <strong>人类专家意见</strong>
                          <span>{{ feedbackItem.selectedLabel }}</span>
                        </div>
                        <p>{{ feedbackItem.prompt }}</p>
                        <small>{{ feedbackItem.followUpQuestion }}</small>
                      </article>
                    </div>
                  </article>

                  <section
                    v-if="infoFeedClarification?.options.length"
                    class="info-feed-clarification-card info-feed-clarification-inline"
                  >
                    <div class="info-feed-summary-header">
                      <div>
                        <h3>需要确认</h3>
                        <span>{{ infoFeedClarification.reason || "选择一个方向继续。" }}</span>
                      </div>
                      <span class="status-pill" :data-tone="infoFeedClarification.status === 'answered' ? 'success' : 'warning'">
                        {{ infoFeedClarification.status === 'answered' ? '已选择' : '待选择' }}
                      </span>
                    </div>
                    <p>{{ infoFeedClarification.prompt }}</p>
                    <div class="info-feed-clarification-options">
                      <button
                        v-for="option in infoFeedClarification.options"
                        :key="option.optionId"
                        class="info-feed-clarification-option"
                        type="button"
                        :data-selected="infoFeedClarification.selectedOptionId === option.optionId"
                        :disabled="infoFeedCurrentRun?.summary.status === 'running'"
                        @click="chooseInfoFeedClarification(option)"
                      >
                        <strong>{{ option.label }}</strong>
                        <span>{{ option.description || option.followUpQuestion }}</span>
                      </button>
                    </div>
                  </section>
                </div>
              </div>

              <div class="info-feed-dialog-divider" aria-hidden="true"></div>

              <div class="info-feed-input-stack">
                <form class="info-feed-input-dock" @submit.prevent="runInfoFeed">
                  <div v-if="infoFeedAttachments.length" class="info-feed-attachment-chips">
                    <span
                      v-for="attachment in infoFeedAttachments"
                      :key="attachment.id"
                      class="info-feed-attachment-chip"
                      :data-tone="infoFeedStatusTone(attachment.status)"
                    >
                      {{ attachment.name }}
                      <small>{{ infoFeedStatusLabel(attachment.status) }}</small>
                      <button type="button" @click="removeInfoFeedAttachment(attachment.id)">×</button>
                    </span>
                  </div>
                  <textarea
                    v-model="infoFeedForm.query"
                    rows="4"
                    :placeholder="infoFeedInputPlaceholder"
                  ></textarea>
                  <div class="info-feed-input-actions">
                    <input
                      ref="infoFeedFileInput"
                      type="file"
                      multiple
                      class="visually-hidden"
                      @change="handleInfoFeedAttachmentInput"
                    />
                    <button class="tool-button tool-button-ghost info-feed-attachment-button" type="button" @click="infoFeedFileInput?.click()">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 1 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                      附件
                    </button>
                    <label>
                      <span>模型</span>
                      <el-select
                        v-model="infoFeedForm.modelAlias"
                        teleported
                        filterable
                        placeholder="未分配智能体"
                        :persistent="false"
                        popper-class="splitall-select-popper"
                      >
                        <el-option
                          v-for="option in infoFeedModelOptions"
                          :key="option.value"
                          :label="`${option.label}${option.enabled ? '' : `（${option.disabledReason || '不可用'}）`}`"
                          :value="option.value"
                          :disabled="!option.enabled"
                        />
                      </el-select>
                    </label>
                    <button
                      class="primary-action"
                      type="submit"
                      :disabled="!infoFeedForm.query.trim() || !selectedInfoFeedModel.enabled || infoFeedCurrentRun?.summary.status === 'running'"
                    >
                      {{ infoFeedSubmitLabel }}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>
        </template>

        <template v-if="isAuthenticated && currentView === 'sources'">
          <section class="sources-layout">
            <article class="surface-card source-card">
              <div class="source-card-header">
                <div>
                  <h3>本地文件夹</h3>
                  <p>文件夹、PDF、Office、图片等批量输入，进入同一套解析与知识构建流程。</p>
                </div>
                <span class="module-state-pill" :data-enabled="enabledMountCount > 0">
                  <span class="state-dot" />
                  {{ enabledMountCount > 0 ? "可用" : "未就绪" }}
                </span>
              </div>
              <dl class="meta-list">
                <div>
                  <dt>存储状态</dt>
                  <dd>{{ (consoleState?.storage.rawObjectCount || 0) > 0 ? "已有对象" : "等待入库" }}</dd>
                </div>
                <div>
                  <dt>原始对象</dt>
                  <dd>{{ consoleState?.storage.rawObjectCount || 0 }}</dd>
                </div>
              </dl>
              <div class="source-actions">
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  @click="switchView('intelligence')"
                >
                  解析策略
                </button>
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  @click="openDrawer('modules')"
                >
                  高级接入
                </button>
              </div>
            </article>

            <article class="surface-card source-card">
              <div class="source-card-header">
                <div>
                  <h3>外部客户端</h3>
                  <p>桌面客户端通过服务发现接入，服务端只提供任务、解析与工具能力。</p>
                </div>
                <span class="module-state-pill" :data-enabled="(consoleState?.clients.summary.totalCount || 0) > 0">
                  <span class="state-dot" />
                  {{ consoleState?.clients.summary.totalCount || 0 }} 台
                </span>
              </div>
              <dl class="meta-list">
                <div>
                  <dt>活跃服务</dt>
                  <dd>{{ consoleState?.discovery.value.activeServiceUrl || "未配置" }}</dd>
                </div>
                <div>
                  <dt>模式</dt>
                  <dd>{{ consoleState?.discovery.value.mode || "active" }}</dd>
                </div>
              </dl>
              <div class="source-actions">
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  @click="openAdmin('clients')"
                >
                  设备管理
                </button>
              </div>
            </article>
          </section>
        </template>

        <template v-if="isAuthenticated && currentView === 'knowledge'">
          <section class="knowledge-layout">
            <article
              v-if="knowledgeTab === 'overview'"
              class="surface-card knowledge-hero"
              :class="{ 'knowledge-search-card': knowledgeTab === 'overview', expanded: knowledgeSearchExpanded }"
            >
              <div class="section-header">
                <div>
                  <h3>知识召回调试</h3>
                </div>
                <div class="section-tags">
                  <span>{{ knowledgeConsole?.available ? "KnowledgeCore 可用" : "KnowledgeCore 未启用" }}</span>
                  <span>{{ knowledgeStatus }}</span>
                  <span>目录 {{ knowledgeSourceState?.summary.totalCount || 0 }}</span>
                </div>
              </div>
              <form
                v-if="canReadKnowledge && knowledgeTab === 'overview'"
                class="knowledge-page-search"
                @submit.prevent="searchKnowledge"
              >
                <input
                  v-model="knowledgeSearchForm.query"
                  type="search"
                  placeholder="调试底层召回，默认全库搜索：例如 账单"
                />
                <button
                  class="primary-action"
                  type="submit"
                  :disabled="busyKey === 'knowledge:search' || !knowledgeSearchForm.query.trim()"
                >
                  {{ busyKey === "knowledge:search" ? "召回中" : "召回" }}
                </button>
              </form>

              <div v-if="knowledgeSearchExpanded" class="knowledge-search-workspace has-preview">
                <div class="knowledge-search-workspace-grid">
                <div class="knowledge-result-pane">
                  <div class="knowledge-result-list">
                    <button
                      v-for="item in knowledgeSearchResults"
                      :key="String(item.evidenceId || item.itemId || item.documentId || item.title)"
                      class="knowledge-result"
                      :class="{ active: knowledgeResultEvidenceId(item) === selectedEvidenceId }"
                      type="button"
                      :disabled="!knowledgeResultEvidenceId(item)"
                      :title="knowledgeResultTitle(item)"
                      @click="openKnowledgeSearchResult(item)"
                    >
                      <strong>{{ knowledgeResultTitle(item) }}</strong>
                      <span v-if="knowledgeResultSnippet(item)">{{ knowledgeResultSnippet(item) }}</span>
                      <small v-if="knowledgeResultHierarchyPath(item)">
                        {{ knowledgeResultHierarchyPath(item) }}
                      </small>
                      <small>
                        相关度 {{ knowledgeResultScore(item) }}
                        / 图片 {{ knowledgeResultAssetCount(item) }}
                      </small>
                    </button>
                    <div v-if="busyKey === 'knowledge:search'" class="empty-note">正在检索。</div>
                    <div v-else-if="knowledgeSearchEmpty" class="empty-state">
                      <strong>没有找到结果</strong>
                      <span>已完成对“{{ lastKnowledgeSearchQuery }}”的搜索，可以换一个事务、人物或更上层分类词再试。</span>
                    </div>
                  </div>
                </div>

                <aside class="knowledge-evidence-card knowledge-preview-pane">
                  <div class="section-header compact-section-header">
                    <div>
                      <h3>{{ selectedEvidenceDisplayTitle }}</h3>
                    </div>
                  </div>
                  <template v-if="selectedEvidence">
                    <section class="evidence-text">
                      <div class="evidence-text-heading">
                        <h4>原始文件</h4>
                        <span>{{ evidenceReadableKind }}</span>
                      </div>
                      <div class="evidence-rendered-content" v-html="evidenceReadableHtml"></div>
                    </section>
                    <details class="advanced-config evidence-retrieval-details">
                      <summary>检索细节</summary>
                      <dl class="meta-list evidence-summary-list">
                        <div>
                          <dt>相关度</dt>
                          <dd>{{ Number(selectedEvidence.score || selectedEvidence.finalScore || 0).toFixed(3) }}</dd>
                        </div>
                        <div>
                          <dt>图片</dt>
                          <dd>{{ evidenceAssets.length }}</dd>
                        </div>
                        <div>
                          <dt>命中说明</dt>
                          <dd>{{ evidenceReasonText() }}</dd>
                        </div>
                      </dl>
                    </details>
                    <details class="advanced-config evidence-source-details">
                      <summary>来源定位</summary>
                      <dl class="meta-list evidence-summary-list">
                        <div
                          v-for="item in evidenceSourceDetails()"
                          :key="item.label"
                        >
                          <dt>{{ item.label }}</dt>
                          <dd>{{ item.value }}</dd>
                        </div>
                      </dl>
                    </details>
                    <details class="advanced-config">
                      <summary>机器结构</summary>
                      <pre>{{ jsonPreview(selectedEvidence || {}) }}</pre>
                    </details>
                  </template>
                  <div v-else class="knowledge-preview-empty">
                    <strong>未选择来源</strong>
                    <span>{{ busyKey === "knowledge:search" ? "正在整理候选来源。" : "搜索结果详情会显示在这里。" }}</span>
                  </div>
                </aside>
              </div>
              </div>
            </article>

            <article v-if="knowledgeTab === 'logs'" class="surface-card knowledge-log-report">
              <div class="section-header">
                <div>
                  <h3>日志记录</h3>
                  <p>入库任务、目录同步和知识库执行状态集中展示。</p>
                </div>
                <div class="source-actions">
                  <button class="tool-button" type="button" @click="knowledgeLogAdvancedOpen = !knowledgeLogAdvancedOpen">
                    {{ knowledgeLogAdvancedOpen ? "收起筛选" : "高级筛选" }}
                  </button>
                  <button class="tool-button" type="button" @click="exportKnowledgeLogRows">
                    导出 CSV
                  </button>
                </div>
              </div>
              <div v-if="knowledgeLogAdvancedOpen" class="knowledge-log-filters">
                <input v-model="knowledgeLogFilters.id" type="search" placeholder="筛选 ID / 对象" />
                <select v-model="knowledgeLogFilters.status">
                  <option value="">全部状态</option>
                  <option v-for="status in knowledgeLogStatusOptions" :key="status" :value="status">
                    {{ status }}
                  </option>
                </select>
                <input v-model="knowledgeLogFilters.stage" type="search" placeholder="阶段 / 详情关键词" />
                <input v-model="knowledgeLogFilters.from" type="date" />
                <input v-model="knowledgeLogFilters.to" type="date" />
              </div>
              <el-table
                :data="filteredKnowledgeLogRows"
                row-key="logId"
                border
                stripe
                size="small"
                class="knowledge-log-table"
                empty-text="暂无知识库日志"
              >
                <el-table-column prop="kindLabel" label="类型" width="110" resizable />
                <el-table-column label="对象" min-width="260" show-overflow-tooltip resizable>
                  <template #default="{ row }">
                    <div class="knowledge-log-target">
                      <span class="mono-compact" :title="row.logId">{{ row.displayId }}</span>
                      <small>{{ row.target }}</small>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="112" resizable>
                  <template #default="{ row }">
                    <span class="status-pill" :data-tone="row.tone">{{ row.statusLabel }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="stage" label="阶段" min-width="190" show-overflow-tooltip resizable />
                <el-table-column label="进度" width="92" resizable>
                  <template #default="{ row }">
                    {{ Math.round(Number(row.progressPercent || 0)) }}%
                  </template>
                </el-table-column>
                <el-table-column label="时间" width="142" resizable>
                  <template #default="{ row }">
                    <span :title="formatMachineDate(row.occurredAt, 'full')">
                      {{ formatMachineDate(row.occurredAt, 'compact') }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column prop="detail" label="详情" min-width="280" show-overflow-tooltip resizable />
                <el-table-column prop="error" label="错误" min-width="220" show-overflow-tooltip resizable />
              </el-table>
            </article>

            <article v-if="knowledgeTab === 'ingest'" class="surface-card knowledge-source-manager">
              <div class="section-header">
                <div>
                  <h3>持续同步目录</h3>
                  <p>填写服务端可访问的本地目录。目录内容发生变化后会自动整理并更新知识库，也可以手动刷新。</p>
                </div>
                <button
                  class="tool-button"
                  type="button"
                  :disabled="busyKey === 'knowledge:sources'"
                  @click="refreshKnowledgeSources"
                >
                  {{ busyKey === "knowledge:sources" ? "刷新中" : "刷新状态" }}
                </button>
              </div>
              <form class="knowledge-source-form" @submit.prevent="addKnowledgeSource">
                <label class="source-name-field">
                  <span>目录名称</span>
                  <input v-model="localSourceForm.label" type="text" placeholder="例如：公司共享资料" autocomplete="off" />
                </label>
                <label class="source-path-field">
                  <span>本地路径</span>
                  <div class="path-field">
                    <input
                      v-model="localSourceForm.directoryPath"
                      type="text"
                      placeholder="/Users/you/Documents/Knowledge"
                      autocomplete="off"
                      @change="syncLocalSourceLabelFromPath"
                    />
                    <BrowseSelectButton
                      kind="server-directory"
                      button-class="path-action-button"
                      button-text="浏览"
                      size="small"
                      :disabled="!canBrowseServerPaths"
                      plain
                      @browse="openLocalSourceDirectoryPicker"
                    />
                  </div>
                </label>
                <div class="source-sync-row">
                  <label class="inline-check">
                    <input v-model="localSourceForm.autoSync" type="checkbox" />
                    <span>自动监听变化</span>
                  </label>
                  <label class="inline-check">
                    <input v-model="localSourceForm.recursive" type="checkbox" />
                    <span>包含子目录</span>
                  </label>
                  <label class="inline-check">
                    <input v-model="localSourceForm.hydrationEnabled" type="checkbox" />
                    <span>自动下载</span>
                  </label>
                  <button
                    class="primary-action"
                    type="submit"
                    :disabled="!canWriteJobs || busyKey === 'knowledge:sources:add'"
                  >
                    {{ busyKey === "knowledge:sources:add" ? "同步中" : "开始同步" }}
                  </button>
                </div>
              </form>
              <div class="knowledge-source-list">
                <article
                  v-for="source in activeKnowledgeSources"
                  :key="source.sourceId"
                  class="knowledge-source-card"
                >
                  <div class="knowledge-source-card-header">
                    <div>
                      <strong>{{ source.label }}</strong>
                      <span>{{ source.directoryPath }}</span>
                    </div>
                    <span class="status-pill" :data-tone="sourceSyncTone(source)">
                      {{ sourceSyncLabel(source) }}
                    </span>
                  </div>
                  <dl class="meta-list source-meta-list">
                    <div>
                      <dt>文件</dt>
                      <dd>{{ source.lastFileCount || 0 }} 个 / {{ formatBytes(source.lastTotalBytes) }}</dd>
                    </div>
                    <div>
                      <dt>最近扫描</dt>
                      <dd>{{ formatCompactDate(source.lastScanAt) || "未扫描" }}</dd>
                    </div>
                    <div>
                      <dt>监听</dt>
                      <dd>{{ source.watcherStatus }} / {{ source.watcherCount || 0 }}</dd>
                    </div>
	                    <div>
	                      <dt>自动下载</dt>
	                      <dd>
	                        {{ sourceDownloadStatusLabel(source) }}
	                        / {{ source.lastHydratedFileCount || 0 }} 可入库
	                        <template v-if="source.lastHydrationFailedCount"> / {{ source.lastHydrationFailedCount }} 待处理</template>
	                      </dd>
	                    </div>
	                    <div>
	                      <dt>原文索引</dt>
	                      <dd>
	                        {{ sourceIndexStatusLabel(source) }}
	                        / {{ source.lastIndexedFileCount || 0 }} 文件
	                        <template v-if="source.lastIndexFailedCount"> / {{ source.lastIndexFailedCount }} 失败</template>
	                      </dd>
	                    </div>
		                    <div>
		                      <dt>最近任务</dt>
		                      <dd>{{ source.lastJobId || "无" }}</dd>
		                    </div>
		                    <div>
		                      <dt>断点树</dt>
		                      <dd>
		                        同步 {{ shortId(source.lastSyncCheckpointTreeId) }}
		                        / 索引 {{ shortId(source.lastIndexCheckpointTreeId) }}
		                      </dd>
		                    </div>
		                  </dl>
                  <p
                    v-if="source.lastHydrationFailureSamples?.length"
                    class="module-note warning-note"
                  >
	                    待下载：{{ source.lastHydrationFailureSamples.slice(0, 3).map((item) => `${item.relativePath || "文件"}：${item.reason || "未下载"}`).join("；") }}
	                  </p>
	                  <p v-if="source.lastIndexError" class="module-note warning-note">
	                    原文索引：{{ source.lastIndexError }}
	                  </p>
                  <div v-if="source.lastJobId" class="source-progress">
                    <div>
                      <span>{{ splitJobStatusLabel(source.lastJobStatus) }}</span>
                      <small>{{ source.lastJobStage || "等待开始" }}</small>
                    </div>
                    <progress :value="sourceJobProgress(source)" max="100" />
                  </div>
                  <p v-if="source.error" class="module-note danger-note">{{ source.error }}</p>
                  <div class="source-actions">
                    <button
                      class="tool-button"
                      type="button"
                      :disabled="busyKey === `knowledge:source:refresh:${source.sourceId}`"
                      @click="refreshKnowledgeSource(source)"
                    >
                      手动刷新
                    </button>
                    <button
                      class="tool-button tool-button-ghost"
                      type="button"
                      :disabled="busyKey === `knowledge:source:refresh:${source.sourceId}`"
                      @click="refreshKnowledgeSource(source, true)"
                    >
                      重新整理
                    </button>
                    <button
                      class="tool-button tool-button-ghost"
                      type="button"
                      :disabled="busyKey === `knowledge:source:${source.sourceId}`"
                      @click="updateKnowledgeSource(source, { enabled: !source.enabled })"
                    >
                      {{ source.enabled ? "暂停" : "启用" }}
                    </button>
                    <button
                      class="table-action"
                      type="button"
                      :disabled="busyKey === `knowledge:source:delete:${source.sourceId}`"
                      @click="deleteKnowledgeSource(source)"
                    >
                      删除
                    </button>
                  </div>
                </article>
                <div v-if="activeKnowledgeSources.length === 0" class="empty-state">
                  <strong>暂无同步目录</strong>
                  <span>添加一个服务端本地目录后，文件变化会自动触发整理任务。</span>
                </div>
              </div>
            </article>

            <article v-if="knowledgeTab === 'ingest'" class="surface-card ingest-upload-card">
              <div class="section-header">
                <div>
                  <h3>临时上传</h3>
                  <p>适合一次性导入少量文件。会持续更新的文件夹请使用上面的同步目录。</p>
                </div>
              </div>
              <div class="ingest-upload-grid">
                <div class="ingest-choice">
                  <span>选择文件夹</span>
                  <BrowseSelectButton
                    kind="local-directory"
                    button-type="primary"
                    button-text="选择文件夹"
                    plain
                    @select="onIngestFilesSelected"
                  />
                </div>
                <div class="ingest-choice">
                  <span>选择文件</span>
                  <BrowseSelectButton
                    kind="local-files"
                    button-type="primary"
                    button-text="选择文件"
                    plain
                    @select="onIngestFilesSelected"
                  />
                </div>
                <button
                  class="primary-action"
                  type="button"
                  :disabled="!canWriteJobs || busyKey === 'knowledge:ingest'"
                  @click="uploadFilesToKnowledge"
                >
                  {{ busyKey === "knowledge:ingest" ? "上传中" : "开始整理" }}
                </button>
              </div>
              <p class="module-note">{{ ingestProgress || "选择文件后，处理进度会显示在这里。" }}</p>
              <div v-if="ingestJob" class="ingest-queue-card">
                <div>
                  <strong>{{ ingestJob.id }}</strong>
                  <span>{{ ingestJob.stage || "等待开始" }}</span>
                </div>
                <span class="status-pill" :data-tone="jobStatusTone(ingestJob.status)">
                  {{ jobStatusLabels[ingestJob.status] }}
                </span>
                <progress :value="Number(ingestJob.progressPercent || 0)" max="100" />
                <button class="tool-button tool-button-ghost" type="button" @click="refreshIngestJob">
                  刷新任务
                </button>
              </div>
              <div v-if="normalizedManifest" class="job-table compact-job-table normalized-table">
                <div class="job-table-header">
                  <span>生成文档</span>
                  <span>类型</span>
                  <span>大小</span>
                </div>
                <div
                  v-for="doc in [...normalizedManifest.documents, ...normalizedManifest.sourceMaterials]"
                  :key="doc.documentId"
                  class="job-row"
                >
                  <a :href="bridge.normalizedDocumentUrl(normalizedManifest.batchId, doc.documentId)" target="_blank" rel="noreferrer">
                    {{ doc.title }}
                  </a>
                  <span>{{ doc.granularity }}</span>
                  <span>{{ formatBytes(doc.byteSize) }}</span>
                </div>
              </div>
            </article>

            <article v-if="knowledgeTab === 'conflicts'" class="surface-card knowledge-conflict-report">
              <div class="section-header">
                <div>
                  <h3>入库冲突审核</h3>
                  <p>知识录入发现同一路径不同内容、重复来源或结构化版本冲突时，会先进入这里等待人工决策。</p>
                </div>
                <div class="source-actions">
                  <select v-model="knowledgeReviewStatus" class="compact-select">
                    <option value="pending">待决策</option>
                    <option value="resolved">已解决</option>
                    <option value="rejected">已忽略</option>
                    <option value="all">全部</option>
                  </select>
                  <button
                    class="tool-button"
                    type="button"
                    :disabled="busyKey === 'knowledge:review-items'"
                    @click="() => refreshKnowledgeConflicts()"
                  >
                    {{ busyKey === "knowledge:review-items" ? "刷新中" : "刷新列表" }}
                  </button>
	                </div>
	              </div>
	              <section
	                v-if="selectedKnowledgeReviewItem"
	                class="knowledge-review-decision-card"
	              >
	                <header class="knowledge-review-decision-header">
	                  <div>
	                    <h4>{{ knowledgeReviewTitle(selectedKnowledgeReviewItem) }}</h4>
	                    <span>{{ selectedKnowledgeReviewItem.reviewId }}</span>
	                  </div>
	                  <span
	                    class="status-pill"
	                    :data-tone="knowledgeReviewTone(selectedKnowledgeReviewItem)"
	                  >
	                    {{ knowledgeReviewStatusLabel(selectedKnowledgeReviewItem.status) }}
	                  </span>
	                </header>

	                <div class="knowledge-review-compare-grid">
	                  <article class="knowledge-review-compare-panel">
	                    <header>
	                      <strong>原始内容</strong>
	                      <code>{{ shortId(knowledgeReviewRecordPreview(knowledgeReviewPrimaryCurrentDocument(selectedKnowledgeReviewItem)).sourceHash) }}</code>
	                    </header>
	                    <h5>{{ knowledgeReviewRecordPreview(knowledgeReviewPrimaryCurrentDocument(selectedKnowledgeReviewItem)).title }}</h5>
	                    <p>{{ knowledgeReviewRecordPreview(knowledgeReviewPrimaryCurrentDocument(selectedKnowledgeReviewItem)).text }}</p>
	                    <dl>
	                      <div>
	                        <dt>路径</dt>
	                        <dd :title="knowledgeReviewRecordPreview(knowledgeReviewPrimaryCurrentDocument(selectedKnowledgeReviewItem)).sourcePath">
	                          {{ knowledgeReviewRecordPreview(knowledgeReviewPrimaryCurrentDocument(selectedKnowledgeReviewItem)).sourcePath || "无" }}
	                        </dd>
	                      </div>
	                      <div>
	                        <dt>文档</dt>
	                        <dd>{{ knowledgeReviewRecordPreview(knowledgeReviewPrimaryCurrentDocument(selectedKnowledgeReviewItem)).documentId || "无" }}</dd>
	                      </div>
	                    </dl>
	                  </article>
	                  <article class="knowledge-review-compare-panel">
	                    <header>
	                      <strong>新的内容</strong>
	                      <code>{{ shortId(knowledgeReviewRecordPreview(knowledgeReviewIncomingDocument(selectedKnowledgeReviewItem)).sourceHash) }}</code>
	                    </header>
	                    <h5>{{ knowledgeReviewRecordPreview(knowledgeReviewIncomingDocument(selectedKnowledgeReviewItem)).title }}</h5>
	                    <p>{{ knowledgeReviewRecordPreview(knowledgeReviewIncomingDocument(selectedKnowledgeReviewItem)).text }}</p>
	                    <dl>
	                      <div>
	                        <dt>路径</dt>
	                        <dd :title="knowledgeReviewRecordPreview(knowledgeReviewIncomingDocument(selectedKnowledgeReviewItem)).sourcePath">
	                          {{ knowledgeReviewRecordPreview(knowledgeReviewIncomingDocument(selectedKnowledgeReviewItem)).sourcePath || "无" }}
	                        </dd>
	                      </div>
	                      <div>
	                        <dt>文档</dt>
	                        <dd>{{ knowledgeReviewRecordPreview(knowledgeReviewIncomingDocument(selectedKnowledgeReviewItem)).documentId || "无" }}</dd>
	                      </div>
	                    </dl>
	                  </article>
	                </div>

	                <div class="knowledge-review-analysis">
	                  <div>
	                    <span>冲突原因</span>
	                    <strong>{{ knowledgeReviewReasonLabel(selectedKnowledgeReviewItem.reason) }}</strong>
	                    <p>{{ selectedKnowledgeReviewItem.summary || "系统检测到该知识录入需要人工确认。" }}</p>
	                  </div>
	                  <div>
	                    <span>初步分析建议</span>
	                    <strong :data-tone="knowledgeReviewSimilarity(selectedKnowledgeReviewItem).tone">
	                      {{ knowledgeReviewSimilarity(selectedKnowledgeReviewItem).label }}
	                      · 相似度 {{ knowledgeReviewSimilarity(selectedKnowledgeReviewItem).percent }}
	                    </strong>
	                    <p>{{ knowledgeReviewSimilarity(selectedKnowledgeReviewItem).suggestion }}</p>
	                  </div>
	                </div>

	                <footer class="knowledge-review-decision-footer">
	                  <button
	                    class="tool-button tool-button-ghost"
	                    type="button"
	                    :disabled="selectedKnowledgeReviewItem.status !== 'pending' || knowledgeReviewSimilarity(selectedKnowledgeReviewItem).disableKeepBoth || busyKey.startsWith(`knowledge:review:${selectedKnowledgeReviewItem.reviewId}:`)"
	                    @click="resolveKnowledgeReview(selectedKnowledgeReviewItem, 'keep_both')"
	                  >
	                    保留两者
	                  </button>
	                  <button
	                    class="tool-button"
	                    type="button"
	                    :disabled="selectedKnowledgeReviewItem.status !== 'pending' || busyKey.startsWith(`knowledge:review:${selectedKnowledgeReviewItem.reviewId}:`)"
	                    @click="resolveKnowledgeReview(selectedKnowledgeReviewItem, 'replace')"
	                  >
	                    覆盖旧知识
	                  </button>
	                  <button
	                    class="tool-button danger-action"
	                    type="button"
	                    :disabled="selectedKnowledgeReviewItem.status !== 'pending' || busyKey.startsWith(`knowledge:review:${selectedKnowledgeReviewItem.reviewId}:`)"
	                    @click="resolveKnowledgeReview(selectedKnowledgeReviewItem, 'reject')"
	                  >
	                    放弃新知识
	                  </button>
	                  <button
	                    class="tool-button"
	                    type="button"
	                    :disabled="selectedKnowledgeReviewItem.status !== 'pending' || busyKey.startsWith(`knowledge:review:${selectedKnowledgeReviewItem.reviewId}:`) || !selectedKnowledgeReviewFusionModel.enabled"
	                    @click="fuseKnowledgeReview(selectedKnowledgeReviewItem)"
	                  >
	                    知识融合
	                  </button>
	                </footer>
	              </section>
	              <div class="responsive-table-wrap knowledge-conflict-table-wrap">
	                <el-table
	                  :data="knowledgeReviewItems"
	                  row-key="reviewId"
	                  border
	                  stripe
	                  size="small"
	                  class="knowledge-conflict-table"
	                  empty-text="暂无知识冲突"
	                  :row-class-name="knowledgeReviewRowClassName"
	                  @row-click="selectKnowledgeReviewItem"
	                >
	                <el-table-column type="expand">
                  <template #default="{ row }">
                    <div class="knowledge-conflict-expanded">
                      <dl class="meta-list evidence-summary-list">
                        <div>
                          <dt>审核 ID</dt>
                          <dd>{{ row.reviewId }}</dd>
                        </div>
                        <div>
                          <dt>批次</dt>
                          <dd>{{ row.batchId || "无" }}</dd>
                        </div>
                        <div>
                          <dt>决策</dt>
                          <dd>{{ knowledgeReviewResolvedAction(row) || "未决策" }}</dd>
                        </div>
                      </dl>
                      <pre>{{ knowledgeReviewDetailText(row) }}</pre>
                      <details class="advanced-config">
                        <summary>机器结构</summary>
                        <pre>{{ jsonPreview(row) }}</pre>
                      </details>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="类型" width="150" resizable>
                  <template #default="{ row }">
                    <div class="knowledge-conflict-kind">
                      <span class="status-pill" :data-tone="knowledgeReviewTone(row)">
                        {{ knowledgeReviewStatusLabel(row.status) }}
                      </span>
                      <small>{{ knowledgeReviewSourceLabel(row) }} / {{ knowledgeReviewReasonLabel(row.reason) }}</small>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="冲突对象" min-width="260" show-overflow-tooltip resizable>
                  <template #default="{ row }">
                    <div class="knowledge-log-target">
                      <strong>{{ knowledgeReviewTitle(row) }}</strong>
                      <small>{{ row.summary || row.entityId }}</small>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="当前记录" min-width="260" show-overflow-tooltip resizable>
                  <template #default="{ row }">
                    {{ knowledgeReviewDocumentLine(knowledgeReviewCurrentDocuments(row)[0]) }}
                  </template>
                </el-table-column>
                <el-table-column label="新录入记录" min-width="260" show-overflow-tooltip resizable>
                  <template #default="{ row }">
                    {{ knowledgeReviewDocumentLine(knowledgeReviewIncomingDocument(row)) }}
                  </template>
                </el-table-column>
                <el-table-column label="时间" width="142" resizable>
                  <template #default="{ row }">
                    <span :title="formatMachineDate(row.updatedAt, 'full')">
                      {{ formatMachineDate(row.updatedAt, 'compact') }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="250" fixed="right" resizable>
                  <template #default="{ row }">
                    <div v-if="row.status === 'pending'" class="conflict-actions">
                      <template v-if="knowledgeReviewCanResolveWithDocument(row)">
                        <button
                          v-if="row.reason === 'source_path_content_conflict'"
                          class="table-action"
                          type="button"
	                          :disabled="busyKey.startsWith(`knowledge:review:${row.reviewId}:`)"
	                          @click="resolveKnowledgeReview(row, 'replace')"
	                        >
	                          覆盖旧知识
	                        </button>
	                        <button
	                          class="table-action"
	                          type="button"
	                          :disabled="knowledgeReviewSimilarity(row).disableKeepBoth || busyKey.startsWith(`knowledge:review:${row.reviewId}:`)"
	                          @click="resolveKnowledgeReview(row, 'keep_both')"
	                        >
	                          保留两者
	                        </button>
	                        <button
	                          class="table-action"
	                          type="button"
	                          :disabled="busyKey.startsWith(`knowledge:review:${row.reviewId}:`) || !selectedKnowledgeReviewFusionModel.enabled"
	                          @click="fuseKnowledgeReview(row)"
	                        >
	                          融合
	                        </button>
	                      </template>
                      <button
                        v-else
                        class="table-action"
                        type="button"
                        :disabled="busyKey.startsWith(`knowledge:review:${row.reviewId}:`)"
                        @click="resolveKnowledgeReview(row, 'accept')"
                      >
                        接受
                      </button>
                      <button
                        class="table-action danger-action"
                        type="button"
                        :disabled="busyKey.startsWith(`knowledge:review:${row.reviewId}:`)"
                        @click="resolveKnowledgeReview(row, 'reject')"
                      >
	                        放弃
	                      </button>
	                    </div>
	                    <span v-else>{{ knowledgeReviewStatusLabel(row.status) }}</span>
	                  </template>
	                </el-table-column>
	                </el-table>
	              </div>
	            </article>

            <article v-if="knowledgeTab === 'maintenance'" class="surface-card knowledge-maintenance">
              <div class="section-header">
                <div>
                  <h3>知识库配置</h3>
                  <p>调整检索、索引、衰减策略和维护任务。危险操作会要求二次确认。</p>
                </div>
                <button class="tool-button" type="button" @click="refreshKnowledgeConsole">
                  重新加载
                </button>
              </div>
              <div v-for="group in knowledgeSchema?.groups || []" :key="group.id" class="config-group">
                <div class="config-group-header">
                  <h4>{{ group.label }}</h4>
                  <p>{{ knowledgeConfigGroupDescription(group.id) }}</p>
                </div>
                <div class="form-grid compact-form-grid">
                  <label v-for="field in group.fields" :key="field.name">
                    <span>{{ field.label }}</span>
                    <input
                      v-if="field.type === 'number'"
                      :value="maintenanceFieldValue(field.name, field.defaultValue)"
                      type="number"
                      :min="field.min"
                      :max="field.max"
                      :step="field.step || 1"
                      @input="setMaintenanceFieldFromEvent(field.name, $event, 'number')"
                    />
                    <el-select
                      v-else-if="field.type === 'boolean'"
                      :model-value="maintenanceFieldValue(field.name, field.defaultValue) ? 'true' : 'false'"
                      teleported
                      @update:model-value="setMaintenanceFieldValue(field.name, $event === 'true')"
                    >
                      <el-option label="开启" value="true" />
                      <el-option label="关闭" value="false" />
                    </el-select>
                    <input
                      v-else
                      :value="String(maintenanceFieldValue(field.name, field.defaultValue) ?? '')"
                      type="text"
                      @input="setMaintenanceFieldFromEvent(field.name, $event, 'string')"
                    />
                    <small v-if="field.description" class="field-hint">{{ field.description }}</small>
                  </label>
                </div>
              </div>
              <details class="advanced-config">
                <summary>高级 JSON Diff</summary>
                <label class="json-editor">
                  <span>只在需要精确修改服务端配置对象时展开</span>
                  <textarea v-model="maintenanceJson" rows="10" spellcheck="false" />
                </label>
              </details>
              <div class="source-actions">
                <button class="primary-action" type="button" :disabled="!canAdminKnowledge" @click="saveKnowledgeMaintenance">
                  保存配置
                </button>
              </div>
              <div class="maintenance-task-section">
                <div class="config-group-header">
                  <h4>手动维护任务</h4>
                  <p>这不是配置项，而是一次性执行的知识库维护动作；用于校验、修复、清理、重建索引或触发进化学习。</p>
                </div>
                <div class="maintenance-runner">
                  <el-select v-model="selectedMaintenanceTask" teleported>
                    <el-option
                      v-for="task in knowledgeSchema?.maintenanceTasks || []"
                      :key="task.id"
                      :label="`${task.label} / ${task.danger}`"
                      :value="task.id"
                    />
                  </el-select>
                  <label class="inline-check">
                    <input v-model="maintenanceConfirm" type="checkbox" />
                    <span>确认执行</span>
                  </label>
                  <label v-if="currentMaintenanceTaskSupportsDryRun" class="inline-check">
                    <input v-model="maintenanceDryRun" type="checkbox" />
                    <span>仅预览</span>
                  </label>
                  <button class="tool-button" type="button" :disabled="!canMaintainKnowledge" @click="runKnowledgeMaintenanceTask">
                    执行维护任务
                  </button>
                </div>
                <small class="field-hint">{{ knowledgeMaintenanceTaskDescription(selectedMaintenanceTask) }}</small>
                <p class="module-note" v-if="currentMaintenanceTask?.requiresConfirm">
                  当前任务需要 confirm=true，可能重建索引或删除对象。
                </p>
                <pre v-if="maintenanceResultJson">{{ maintenanceResultJson }}</pre>
              </div>
            </article>

            <article v-if="knowledgeTab === 'maintenance'" class="surface-card knowledge-vocabulary">
                <div class="section-header">
                  <div>
                    <h3>专家词汇库</h3>
                    <p>用于知识分类、事务归纳和检索提示。默认只展示前 8 条，可搜索或展开全部。</p>
                  </div>
                  <span>v{{ expertVocabularyDraft.version || 0 }} / {{ expertVocabularyDraft.entries.length }} 条</span>
                </div>
                <div class="vocabulary-controls">
                  <label class="vocabulary-filter">
                    <span>筛选词条</span>
                    <input v-model="vocabularySearch" type="search" autocomplete="off" placeholder="路径、关键词、域名或备注" />
                  </label>
                  <div class="drawer-actions">
                    <button class="tool-button tool-button-ghost" type="button" @click="addVocabularyEntry">
                      新增词条
                    </button>
                    <button class="tool-button" type="button" :disabled="busyKey === 'expert-vocabulary'" @click="saveExpertVocabulary">
                      {{ busyKey === "expert-vocabulary" ? "发布中" : "保存并发布" }}
                    </button>
                  </div>
                </div>
                <div class="vocabulary-table-shell">
                  <table class="vocabulary-table">
                    <thead>
                      <tr>
                        <th>层级路径</th>
                        <th>关键词</th>
                        <th>发件域名</th>
                        <th>状态</th>
                        <th>备注</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="item in displayedVocabularyEntries" :key="item.entry.id || item.index">
                        <td>
                          <input :value="vocabularyEntryPath(item.entry)" autocomplete="off" @input="updateVocabularyPath(item.index, ($event.target as HTMLInputElement).value)" />
                        </td>
                        <td>
                          <textarea :value="item.entry.keywords.join(', ')" @input="updateVocabularyKeywords(item.index, ($event.target as HTMLTextAreaElement).value)" />
                        </td>
                        <td>
                          <textarea :value="item.entry.domains.join(', ')" @input="updateVocabularyDomains(item.index, ($event.target as HTMLTextAreaElement).value)" />
                        </td>
                        <td>
                          <el-select v-model="item.entry.status" teleported @change="updateVocabularyEntry(item.index, { status: item.entry.status })">
                            <el-option label="草稿" value="draft" />
                            <el-option label="启用" value="active" />
                            <el-option label="停用" value="retired" />
                          </el-select>
                        </td>
                        <td>
                          <input v-model="item.entry.notes" autocomplete="off" />
                        </td>
                        <td>
                          <button class="table-action" type="button" @click="deleteVocabularyEntry(item.index)">
                            删除
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div v-if="expertVocabularyDraft.entries.length === 0" class="empty-state">
                    <strong>暂无词条</strong>
                    <span>请先新增一个层级路径。</span>
                  </div>
                </div>
                <div v-if="hiddenVocabularyEntryCount > 0" class="vocabulary-footer">
                  <span>已隐藏 {{ hiddenVocabularyEntryCount }} 条低频维护项。</span>
                  <button class="table-action" type="button" @click="showAllVocabularyEntries = true">
                    展开全部
                  </button>
                </div>
                <div v-else-if="showAllVocabularyEntries && !vocabularySearch" class="vocabulary-footer">
                  <span>已显示全部词条。</span>
                  <button class="table-action" type="button" @click="showAllVocabularyEntries = false">
                    收起
                  </button>
                </div>
            </article>

            <article v-if="knowledgeTab === 'maintenance'" class="surface-card knowledge-rules">
                <div class="section-header">
                  <div>
                    <h3>规则库</h3>
                    <p>规则 JSON 是机器可读维护项，默认收起，避免遮挡常用配置。</p>
                  </div>
                  <span>知识库配置</span>
                </div>
                <details class="advanced-config rules-json-panel">
                  <summary>展开规则 JSON</summary>
                  <textarea v-model="rulesText" class="rules-editor" spellcheck="false" />
                </details>
                <button class="tool-button" type="button" :disabled="busyKey === 'rules'" @click="saveRules">
                  {{ busyKey === "rules" ? "保存中" : "保存规则库" }}
                </button>
            </article>
          </section>
        </template>

        <template v-if="isAuthenticated && currentView === 'intelligence'">
          <section class="modules-layout">
            <article class="surface-card module-control-card">
              <div class="module-card-meta">
                <h3 class="module-card-title">智能设置</h3>
                <div class="section-tags">
                  <span>运行代次 {{ consoleState?.runtime.mountGeneration || 0 }}</span>
                  <span>启用 {{ enabledMountCount }}/{{ totalMountCount }}</span>
                </div>
              </div>

              <form class="module-control-form" @submit.prevent="saveModuleSettings">
                <div class="module-grid">
                  <section class="module-panel">
                    <div class="module-panel-heading">
                      <strong>分析模块</strong>
                      <span>{{
                        analysisExecutionModeLabel(
                          currentAnalysisModule?.executionMode,
                        )
                      }}</span>
                    </div>
                    <label class="module-field">
                      <span>当前分析引擎</span>
                      <el-select v-model="settingsDraft.analysisModuleId" teleported>
                        <el-option
                          v-for="item in consoleState?.runtime.analysisModules || []"
                          :key="item.id"
                          :label="`${item.label} / ${item.id}`"
                          :value="item.id"
                        />
                      </el-select>
                    </label>
                    <p class="module-note">
                      {{ analysisModuleDescription() }}
                    </p>
                  </section>

                  <section class="module-panel">
                    <div class="module-panel-heading">
                      <strong>事务时间策略</strong>
                      <span>邮件分析</span>
                    </div>
                    <div class="form-grid compact-form-grid">
                      <label>
                        <span>历史阈值（天）</span>
                        <input v-model.number="settingsDraft.staleAfterDays" min="1" type="number" />
                      </label>
                      <label>
                        <span>事务时间窗（天）</span>
                        <input v-model.number="settingsDraft.transactionWindowDays" min="1" type="number" />
                      </label>
                    </div>
                    <p class="module-note">
                      这两个参数参与邮件事务接续、历史状态判定和检索投影，不属于模型授权配置。
                    </p>
                  </section>

                  <section class="module-panel module-assignment-panel">
                    <div class="module-panel-heading">
                      <div class="module-panel-title">
                        <strong>模块模型分配</strong>
                      </div>
                      <span
                        class="module-state-pill"
                        :data-enabled="settingsDraft.modelIntelligenceEnabled"
                      >
                        <span class="state-dot" />
                        {{ moduleEnabledLabel(settingsDraft.modelIntelligenceEnabled) }}
                      </span>
                    </div>
                    <p class="module-note">
                      这里不设置全局模型。每个功能必须显式选择智能体；未选择时保持空，不会自动引用任何模型。
                    </p>
                    <div class="module-assignment-list">
                      <div
                        v-for="item in intelligentModuleDefinitions"
                        :key="item.id"
                        class="module-assignment-row"
                        :data-enabled="moduleNeedsIntelligence(item.id)"
                        :data-config-target="`module-agent-${item.id}`"
                        :data-config-highlighted="highlightedConfigTarget === `module-agent-${item.id}`"
                      >
                        <div class="module-assignment-main">
                          <label class="checkbox-field module-intelligence-toggle">
                            <span>
                              <strong>{{ item.label }}</strong>
                              <small>{{ item.description }}</small>
                            </span>
                            <input
                              type="checkbox"
                              :checked="moduleNeedsIntelligence(item.id)"
                              @change="
                                setModuleNeedsIntelligence(
                                  item.id,
                                  ($event.target as HTMLInputElement).checked,
                                )
                              "
                            />
                          </label>
                        </div>
                        <label
                          v-if="moduleNeedsIntelligence(item.id)"
                          class="module-field module-model-field"
                        >
                          <span>使用模型</span>
                          <el-select
                            :model-value="moduleModelRef(item.id)"
                            @change="
                              setModuleModelRef(
                                item.id,
                                $event,
                              )
                            "
                            placeholder="未分配智能体"
                            teleported
                          >
                            <el-option label="未分配智能体" value="" />
                            <el-option
                              v-for="model in agentModelAssignmentOptions"
                              :key="`${item.id}:${model.ref}`"
                              :label="`${model.label}${model.enabled ? '' : '（未配置）'} / ${providerLabel(model.provider)}`"
                              :value="model.ref"
                              :disabled="!model.enabled"
                            />
                          </el-select>
                        </label>
                      </div>
                    </div>
                    <p class="module-note">
                      授权连接和自定义 Adapter 在“智能体配置 / 模型库”中维护。模块只保存智能体 UID；
                      未选择时保持空，不会隐式使用其它模型。
                    </p>
                    <div class="module-panel-footer">
                      <button
                        class="module-switch"
                        :data-enabled="settingsDraft.modelIntelligenceEnabled"
                        :aria-pressed="settingsDraft.modelIntelligenceEnabled"
                        :aria-label="
                          settingsDraft.modelIntelligenceEnabled
                            ? '关闭云智能解析'
                            : '开启云智能解析'
                        "
                        type="button"
                        @click="
                          settingsDraft.modelIntelligenceEnabled =
                            !settingsDraft.modelIntelligenceEnabled
                        "
                      >
                        <span class="module-switch-track">
                          <span class="module-switch-knob" />
                        </span>
                      </button>
                    </div>
                  </section>

                  <section class="module-panel">
                    <div class="module-panel-heading">
                      <div class="module-panel-title">
                        <strong>本地 OCR</strong>
                      </div>
                      <span
                        class="module-state-pill"
                        :data-enabled="settingsDraft.ocrEnabled"
                      >
                        <span class="state-dot" />
                        {{ moduleEnabledLabel(settingsDraft.ocrEnabled) }}
                      </span>
                    </div>
                    <div class="form-grid compact-form-grid">
                      <label>
                        <span>OCR Python 路径</span>
                        <div class="path-field">
                          <input
                            v-model="settingsDraft.ocrPythonPath"
                            autocomplete="off"
                          />
                          <BrowseSelectButton
                            kind="server-file"
                            button-class="path-action-button"
                            button-text="浏览"
                            size="small"
                            :disabled="!canBrowseServerPaths"
                            plain
                            @browse="openSettingsPathPicker('ocrPythonPath', '选择 OCR Python 可执行文件')"
                          />
                        </div>
                      </label>
                      <label>
                        <span>OCR 语言</span>
                        <input
                          v-model="settingsDraft.ocrLanguage"
                          autocomplete="off"
                        />
                      </label>
                    </div>
                    <p class="module-note">
                      图片类输入将优先走 OCR 路由，关闭后跳过图片文本兜底。
                    </p>
                    <div class="module-panel-footer">
                      <button
                        class="module-switch"
                        :data-enabled="settingsDraft.ocrEnabled"
                        :aria-pressed="settingsDraft.ocrEnabled"
                        :aria-label="
                          settingsDraft.ocrEnabled ? '关闭本地 OCR' : '开启本地 OCR'
                        "
                        type="button"
                        @click="settingsDraft.ocrEnabled = !settingsDraft.ocrEnabled"
                      >
                        <span class="module-switch-track">
                          <span class="module-switch-knob" />
                        </span>
                      </button>
                    </div>
                  </section>

                  <section class="module-panel">
                    <div class="module-panel-heading">
                      <strong>本地文档解析</strong>
                      <span>Tika / Java</span>
                    </div>
                    <div class="form-grid compact-form-grid">
                      <label>
                        <span>Tika JAR 路径</span>
                        <div class="path-field">
                          <input
                            v-model="settingsDraft.tikaJarPath"
                            autocomplete="off"
                          />
                          <BrowseSelectButton
                            kind="server-file"
                            button-class="path-action-button"
                            button-text="浏览"
                            size="small"
                            :disabled="!canBrowseServerPaths"
                            plain
                            @browse="openSettingsPathPicker('tikaJarPath', '选择 Tika JAR 文件', ['.jar'])"
                          />
                        </div>
                      </label>
                      <label>
                        <span>Java 路径</span>
                        <div class="path-field">
                          <input
                            v-model="settingsDraft.javaBinPath"
                            autocomplete="off"
                          />
                          <BrowseSelectButton
                            kind="server-file"
                            button-class="path-action-button"
                            button-text="浏览"
                            size="small"
                            :disabled="!canBrowseServerPaths"
                            plain
                            @browse="openSettingsPathPicker('javaBinPath', '选择 Java 可执行文件')"
                          />
                        </div>
                      </label>
                    </div>
                    <p class="module-note">
                      留空时使用内置查找逻辑，适合部署包自带运行时。
                    </p>
                  </section>
                </div>

                <div class="module-actions">
                  <button
                    class="tool-button tool-button-ghost"
                    type="button"
                    :disabled="busyKey === 'module-reload'"
                    @click="reloadModules"
                  >
                    {{ busyKey === "module-reload" ? "重载中" : "重载能力" }}
                  </button>
                  <button
                    class="tool-button"
                    type="submit"
                    :disabled="busyKey === 'modules'"
                  >
                    {{ busyKey === "modules" ? "保存中" : "保存设置" }}
                  </button>
                </div>
              </form>
            </article>

          </section>
        </template>

        <template v-if="isAuthenticated && currentView === 'admin' && adminView === 'agentConfig'">
          <section class="agent-config-layout">
            <article
              class="surface-card"
              data-config-target="agent-model-library"
              :data-config-highlighted="highlightedConfigTarget === 'agent-model-library'"
            >
              <form class="drawer-panel" @submit.prevent="saveSettings">
                <div class="section-header">
                  <div>
                    <h3>模型库</h3>
                    <p>新增需要使用的模型后填写授权，并可直接探测连通性。</p>
                  </div>
                </div>

                <div class="model-library-toolbar">
                  <el-select v-model="selectedModelProvider" teleported>
                    <el-option
                      v-for="provider in addableModelProviders"
                      :key="provider.id"
                      :label="provider.label"
                      :value="provider.id"
                    />
                  </el-select>
                  <button
                    class="tool-button"
                    type="button"
                    @click="addModelProvider"
                  >
                    新增模型
                  </button>
                </div>

                <p v-if="visibleModelEntries.length === 0" class="empty-note">
                  当前模型库为空。
                </p>

                <div v-else class="model-library-list">
                  <section
                    v-for="entry in visibleModelEntries"
                    :key="entry.instanceId"
                    class="model-library-card"
                    :data-expanded="isModelLibraryCardExpanded(entry) ? 'true' : 'false'"
                  >
                    <button
                      class="model-library-card-toggle"
                      type="button"
                      :aria-expanded="isModelLibraryCardExpanded(entry) ? 'true' : 'false'"
                      @click="toggleModelLibraryCard(entry)"
                    >
                      <div class="model-library-card-header">
                        <div>
                          <strong>{{ entry.label || modelEntryStatusKey(entry) }}</strong>
                          <small>{{ modelProviderDefinition(entry.provider)?.label || providerLabel(entry.provider) }} / {{ entry.model || modelEntryStatusKey(entry) }}</small>
                        </div>
                        <div class="model-library-card-statuses">
                          <span :data-tone="modelEntryStatusTone(entry)">{{ modelEntryStatusLabel(entry) }}</span>
                          <span v-if="modelEntryIsBound(entry)" data-tone="bound">已绑定</span>
                        </div>
                      </div>
                      <span class="model-library-chevron" aria-hidden="true">
                        {{ isModelLibraryCardExpanded(entry) ? "收起" : "展开" }}
                      </span>
                    </button>

                    <div class="model-library-summary-row">
                      <div class="model-library-uid">
                        <span>UID</span>
                        <code>{{ modelEntryStatusKey(entry) }}</code>
                      </div>

                      <div class="model-library-card-actions">
                        <button class="tool-button tool-button-ghost compact-action" type="button" :disabled="busyKey === `model-probe:${modelEntryStatusKey(entry)}`" @click.stop="probeModelEntry(entry)">
                          {{ busyKey === `model-probe:${modelEntryStatusKey(entry)}` ? "探测中" : "探测" }}
                        </button>
                        <button class="tool-button tool-button-ghost compact-action" type="button" @click.stop="exportAgentModelEntryConfig(entry)">
                          导出
                        </button>
                        <button class="tool-button tool-button-ghost compact-action" type="button" @click.stop="duplicateModelEntry(entry)">
                          复制
                        </button>
                        <button
                          class="inline-link"
                          type="button"
                          :disabled="busyKey === `model-remove:${modelEntryStatusKey(entry)}` || modelEntryIsBound(entry)"
                          :title="modelEntryIsBound(entry) ? `已绑定到 ${modelEntryBindingSummary(entry)}，请先解除引用。` : ''"
                          @click.stop="removeModelProvider(entry)"
                        >
                          {{
                            busyKey === `model-remove:${modelEntryStatusKey(entry)}`
                              ? "移除中"
                              : modelEntryIsBound(entry)
                                ? "已绑定"
                                : "移除"
                          }}
                        </button>
                      </div>
                    </div>

                    <p v-if="modelProbeResults[modelEntryStatusKey(entry)]" class="model-probe-result" :data-ok="modelProbeResults[modelEntryStatusKey(entry)].ok ? 'true' : 'false'">
                      {{ modelProbeResults[modelEntryStatusKey(entry)].message }}
                      <small>
                        {{ modelProbeResults[modelEntryStatusKey(entry)].latencyMs }}ms
                        <template v-if="modelProbeResults[modelEntryStatusKey(entry)].statusCode">
                          / HTTP {{ modelProbeResults[modelEntryStatusKey(entry)].statusCode }}
                        </template>
                      </small>
                    </p>

                    <div v-if="isModelLibraryCardExpanded(entry)" class="model-library-card-body">
                      <div class="form-grid compact-form-grid">
                        <label>
                          <span>智能体名称</span>
                          <input v-model="entry.label" autocomplete="off" />
                        </label>
                        <label>
                          <span>模型 ID</span>
                          <input v-model="entry.model" autocomplete="off" />
                        </label>
                      </div>

                      <template v-if="entry.provider === 'google-gemini'">
                        <label>
                          <span>Google API Key</span>
                          <input v-model="settingsDraft.googleApiKey" type="password" autocomplete="off" placeholder="留空则保留当前已配置 Key" />
                        </label>
                      </template>

                      <template v-else-if="entry.provider === 'openai-chatgpt'">
                        <p class="form-hint">
                          {{
                            codexOAuthStatus?.valid
                              ? `已连接 ${codexOAuthStatus.email || "ChatGPT"}`
                              : codexOAuthStatus?.reason || "需要连接 Codex OAuth。"
                          }}
                        </p>
                        <button class="tool-button tool-button-ghost compact-action" type="button" :disabled="busyKey === 'codex-oauth'" @click="beginCodexOAuthLogin">
                          {{ busyKey === "codex-oauth" ? "等待中" : "连接 Codex" }}
                        </button>
                      </template>

                      <template v-else-if="entry.provider === 'openrouter'">
                        <label>
                          <span>Base URL</span>
                          <input v-model="settingsDraft.openRouterBaseUrl" autocomplete="off" />
                        </label>
                        <label>
                          <span>API Key</span>
                          <input v-model="settingsDraft.openRouterApiKey" type="password" autocomplete="off" placeholder="留空则保留当前已配置 Key" />
                        </label>
                      </template>

                      <template v-else-if="entry.provider === 'deepseek'">
                        <label>
                          <span>Base URL</span>
                          <input v-model="entry.baseUrl" autocomplete="off" />
                        </label>
                        <label>
                          <span>API Key</span>
                          <input v-model="entry.apiKey" type="password" autocomplete="off" placeholder="留空则保留当前已配置 Key" />
                        </label>
                        <label>
                          <span>Timeout(ms)</span>
                          <input v-model.number="entry.timeoutMs" type="number" min="1000" step="1000" />
                        </label>
                      </template>

                      <template v-else-if="entry.provider === 'copilot'">
                        <label>
                          <span>Endpoint</span>
                          <input v-model="settingsDraft.copilotEndpoint" autocomplete="off" />
                        </label>
                        <label>
                          <span>Access Token</span>
                          <input v-model="settingsDraft.copilotApiKey" type="password" autocomplete="off" placeholder="留空则保留当前已配置 Token" />
                        </label>
                      </template>

                      <template v-else-if="entry.provider === 'local-model'">
                        <label>
                          <span>Endpoint</span>
                          <input v-model="settingsDraft.localModelEndpoint" autocomplete="off" />
                        </label>
                      </template>

                      <template v-else-if="entry.provider === 'custom-http'">
                        <label>
                          <span>URL</span>
                          <input v-model="entry.url" autocomplete="off" />
                        </label>
                        <label>
                          <span>Token</span>
                          <input v-model="entry.token" autocomplete="off" type="password" placeholder="留空保持已保存 Token" />
                        </label>
                        <details class="advanced-config">
                          <summary>高级连接参数</summary>
                          <div class="form-grid compact-form-grid">
                            <label>
                              <span>Token Header</span>
                              <input v-model="entry.tokenHeader" autocomplete="off" />
                            </label>
                            <label>
                              <span>Token Prefix</span>
                              <input v-model="entry.tokenPrefix" autocomplete="off" />
                            </label>
                            <label>
                              <span>Timeout(ms)</span>
                              <input v-model.number="entry.timeoutMs" type="number" min="1000" step="1000" />
                            </label>
                          </div>
                        </details>
                      </template>

                      <details v-if="modelEntryIsBound(entry)" class="advanced-config model-library-bindings">
                        <summary>被引用的功能（{{ modelEntryBindings(entry).length }}）</summary>
                        <div class="model-library-binding-list">
                          <article
                            v-for="binding in modelEntryBindings(entry)"
                            :key="binding.bindingId"
                            class="model-library-binding-item"
                          >
                            <div>
                              <strong>{{ binding.label }}</strong>
                              <span>{{ binding.category }}</span>
                            </div>
                            <p>{{ binding.detail }}</p>
                          </article>
                        </div>
                      </details>

                      <details class="advanced-config">
                        <summary>智能体提示词与调用参数</summary>
                        <label>
                          <span>系统提示词</span>
                          <textarea v-model="entry.systemPrompt" rows="5" autocomplete="off"></textarea>
                        </label>
                        <label>
                          <span>调用参数 JSON</span>
                          <textarea v-model="entry.parametersText" rows="6" spellcheck="false"></textarea>
                        </label>
                      </details>
                    </div>
                  </section>
                </div>

                <div class="source-actions">
                  <button class="tool-button" type="submit" :disabled="busyKey === 'settings'">
                    {{ busyKey === "settings" ? "保存中" : "保存模型库" }}
                  </button>
                </div>
              </form>
            </article>
            <article class="surface-card">
              <div class="drawer-panel">
                <div class="section-header">
                  <div>
                    <h3>上下文编译器</h3>
                    <p>每次调用无状态模型前，本地把记忆、证据、专家意见和工具状态编译成可审计 ContextPack。</p>
                  </div>
                  <div class="section-actions">
                    <button
                      class="tool-button tool-button-ghost compact-action"
                      type="button"
                      :disabled="busyKey === 'context:refresh'"
                      @click="refreshContextCompiler()"
                    >
                      {{ busyKey === "context:refresh" ? "刷新中" : "刷新" }}
                    </button>
                    <button
                      class="tool-button compact-action"
                      type="button"
                      :disabled="!contextBuildRecordRows.length"
                      @click="exportContextBuildRecords"
                    >
                      导出记录
                    </button>
                  </div>
                </div>

                <div class="context-profile-grid">
                  <article
                    v-for="profile in contextProfileRows"
                    :key="profile.profileId"
                    class="context-profile-card"
                  >
                    <div>
                      <strong>{{ profile.label || profile.profileId }}</strong>
                      <span>{{ profile.profileId }} · {{ profile.compressionMode }} · {{ profile.strategy }}</span>
                    </div>
                    <dl>
                      <div>
                        <dt>窗口</dt>
                        <dd>{{ profile.contextWindowTokens.toLocaleString() }}</dd>
                      </div>
                      <div>
                        <dt>知识</dt>
                        <dd>{{ profile.knowledgeBudget.toLocaleString() }}</dd>
                      </div>
                      <div>
                        <dt>历史</dt>
                        <dd>{{ profile.historyBudget.toLocaleString() }}</dd>
                      </div>
                      <div>
                        <dt>专家权重</dt>
                        <dd>{{ Math.round(profile.expertGuidanceRatio * 100) }}%</dd>
                      </div>
                    </dl>
                    <small>
                      保护字段：{{ profile.protectedEvidenceFields.slice(0, 6).join(", ") || "默认" }}
                    </small>
                    <small>
                      模型压缩：{{ profile.modelCompressionEnabled ? (profile.modelCompressionAlias || "已启用") : "关闭" }}
                    </small>
                  </article>
                  <div v-if="!contextProfileRows.length" class="empty-note">
                    尚未加载上下文 profile。
                  </div>
                </div>

                <div class="form-grid compact-form-grid">
                  <label class="full-row">
                    <span>预览任务</span>
                    <textarea v-model="contextPreviewTask" rows="3" spellcheck="false"></textarea>
                  </label>
                  <label>
                    <span>必须保留的 evidenceId</span>
                    <input v-model="contextPreviewRequiredEvidence" placeholder="ev_1, evidence::abc" autocomplete="off" />
                  </label>
                </div>
                <div class="source-actions">
                  <button
                    class="tool-button"
                    type="button"
                    :disabled="busyKey === 'context:preview'"
                    @click="previewContextCompiler"
                  >
                    {{ busyKey === "context:preview" ? "预览中" : "预览 ContextPack" }}
                  </button>
                  <button
                    class="tool-button tool-button-ghost"
                    type="button"
                    :disabled="busyKey === 'context:evaluation'"
                    @click="runContextReplayEvaluation"
                  >
                    {{ busyKey === "context:evaluation" ? "评估中" : "运行 Replay 评估" }}
                  </button>
                </div>

                <details v-if="contextPreviewResult" class="advanced-config" open>
                  <summary>本轮上下文包</summary>
                  <pre>{{ jsonPreview(contextPreviewResult) }}</pre>
                </details>
                <details v-if="contextEvaluationResult" class="advanced-config" open>
                  <summary>Replay 评估结果</summary>
                  <pre>{{ jsonPreview(contextEvaluationResult) }}</pre>
                </details>

		                <details
		                  class="advanced-config"
		                  data-config-target="knowledge-review-fusion-agent"
		                  :data-config-highlighted="highlightedConfigTarget === 'knowledge-review-fusion-agent'"
		                  open
		                >
                  <summary>最近上下文编译记录</summary>
                  <div class="context-build-record-list">
                    <article
                      v-for="record in contextBuildRecordRows"
                      :key="record.recordId"
                      class="context-build-record"
                    >
                      <div>
                        <strong>{{ record.profileId }}</strong>
                        <span>{{ formatCompactDate(record.createdAt) }} · {{ record.compressionMode }} · {{ record.triggerReason }}</span>
                      </div>
                      <small>
                        token {{ record.totalTokens.toLocaleString() }} / source {{ record.sourceTokens.toLocaleString() }}
                        · 保留证据 {{ record.preservedEvidenceIds.length }}
                        · 丢弃 {{ record.droppedKnowledgeCount }}
                        · 专家意见 {{ record.humanExpertGuidanceCount }}
                      </small>
                      <code>{{ record.recordId }}</code>
                    </article>
                    <div v-if="!contextBuildRecordRows.length" class="empty-note">
                      暂无上下文编译记录。
                    </div>
                  </div>
                </details>
              </div>
            </article>
            <article class="surface-card">
              <form class="drawer-panel" @submit.prevent="saveSettings">
                <div class="section-header">
                  <div>
                    <h3>智能检索参数</h3>
                    <p>这里公开智能检索实际传给模型的默认提示词、工具策略和调用参数。</p>
                  </div>
                </div>
                <label>
                  <span>系统提示词</span>
                  <textarea v-model="settingsDraft.agentExploreDefaults.systemPrompt" rows="5" spellcheck="false"></textarea>
                </label>
                <label>
                  <span>工具策略提示词</span>
                  <textarea v-model="settingsDraft.agentExploreDefaults.toolPolicyPrompt" rows="4" spellcheck="false"></textarea>
                </label>
                <label>
                  <span>继续轮次提示词</span>
                  <textarea v-model="settingsDraft.agentExploreDefaults.continuationPrompt" rows="3" spellcheck="false"></textarea>
                </label>
                <label>
                  <span>答案模板</span>
                  <textarea v-model="settingsDraft.agentExploreDefaults.answerTemplate" rows="18" spellcheck="false"></textarea>
                </label>
                <div class="form-grid compact-form-grid">
                  <label>
                    <span>上下文窗口</span>
                    <select v-model="settingsDraft.agentExploreDefaults.contextProfileId">
                      <option
                        v-for="option in agentExploreContextWindowOptions"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }} - {{ option.description }}
                      </option>
                    </select>
                  </label>
                  <label>
                    <span>Thinking</span>
                    <select v-model="settingsDraft.agentExploreDefaults.thinkingMode">
                      <option
                        v-for="option in agentExploreThinkingModeOptions"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </option>
                    </select>
                  </label>
                  <label>
                    <span>temperature</span>
                    <input v-model.number="settingsDraft.agentExploreDefaults.temperature" type="number" min="0" max="2" step="0.1" />
                  </label>
                  <label>
                    <span>max_tokens</span>
                    <input v-model.number="settingsDraft.agentExploreDefaults.maxTokens" type="number" min="128" step="128" />
                  </label>
                  <label>
                    <span>默认循环轮数</span>
                    <input v-model.number="settingsDraft.agentExploreDefaults.maxIterations" type="number" min="1" max="8" />
                  </label>
                  <label>
                    <span>默认每次召回</span>
                    <input v-model.number="settingsDraft.agentExploreDefaults.limit" type="number" min="1" max="20" />
                  </label>
	                  <label>
	                    <span>tool_choice</span>
	                    <input v-model="settingsDraft.agentExploreDefaults.toolChoice" autocomplete="off" />
	                  </label>
	                </div>
	                <details class="advanced-config" open>
	                  <summary>知识融合智能体</summary>
	                  <div class="form-grid compact-form-grid">
	                    <label>
	                      <span>模型</span>
	                      <el-select
	                        v-model="settingsDraft.agentExploreDefaults.reviewFusionModelAlias"
	                        teleported
	                        filterable
	                        placeholder="未分配智能体"
	                        :persistent="false"
	                        popper-class="splitall-select-popper"
	                      >
	                        <el-option label="未分配智能体" value="" />
	                        <el-option
	                          v-for="option in agentExploreModelOptions"
	                          :key="option.value"
	                          :label="`${option.label}${option.enabled ? '' : `（${option.disabledReason || '不可用'}）`}`"
	                          :value="option.value"
	                          :disabled="!option.enabled"
	                        />
	                      </el-select>
	                    </label>
	                    <label>
	                      <span>temperature</span>
	                      <input
	                        v-model.number="settingsDraft.agentExploreDefaults.reviewFusionTemperature"
	                        type="number"
	                        min="0"
	                        max="2"
	                        step="0.1"
	                      />
	                    </label>
	                    <label>
	                      <span>max_tokens</span>
	                      <input
	                        v-model.number="settingsDraft.agentExploreDefaults.reviewFusionMaxTokens"
	                        type="number"
	                        min="128"
	                        step="128"
	                      />
	                    </label>
	                  </div>
	                  <label>
	                    <span>融合提示词</span>
	                    <textarea
	                      v-model="settingsDraft.agentExploreDefaults.reviewFusionSystemPrompt"
	                      rows="4"
	                      spellcheck="false"
	                    ></textarea>
	                  </label>
	                </details>
	                <details class="advanced-config">
	                  <summary>运行时变量</summary>
	                  <pre>{{ jsonPreview({
	                    modelAlias: agentExploreForm.modelAlias,
                    contextProfileId: selectedAgentExploreContextProfile.value,
                    thinkingMode: selectedAgentExploreThinkingMode,
                    tools: ['knowledge_aggregate', 'keyword_search', 'open_evidence', 'http_request', 'local_command'],
                    stateMachine: ['model_calling', 'tool_selected', 'tool_calling', 'tool_result', 'completed', 'failed'],
	                    requestParameters: {
	                      ...agentExploreThinkingParameters(),
	                      temperature: settingsDraft.agentExploreDefaults.temperature,
	                      max_tokens: settingsDraft.agentExploreDefaults.maxTokens,
	                      max_iterations: settingsDraft.agentExploreDefaults.maxIterations,
	                      per_search_limit: settingsDraft.agentExploreDefaults.limit,
	                      tool_choice: settingsDraft.agentExploreDefaults.toolChoice,
	                      stream: false
	                    },
	                    reviewFusionAgent: {
	                      modelAlias: settingsDraft.agentExploreDefaults.reviewFusionModelAlias,
	                      temperature: settingsDraft.agentExploreDefaults.reviewFusionTemperature,
	                      max_tokens: settingsDraft.agentExploreDefaults.reviewFusionMaxTokens,
	                      systemPrompt: settingsDraft.agentExploreDefaults.reviewFusionSystemPrompt
	                    }
	                  }) }}</pre>
	                </details>
                <div class="source-actions">
                  <button class="tool-button" type="submit" :disabled="busyKey === 'settings'">
                    {{ busyKey === "settings" ? "保存中" : "保存智能检索参数" }}
                  </button>
                </div>
              </form>
            </article>
            <article class="surface-card">
              <form class="drawer-panel" @submit.prevent="saveSettings">
                <div class="section-header">
                  <div>
                    <h3>外层工具调用</h3>
                    <p>模型可输出 function call；服务端再按这里的 HTTP / 本地命令策略执行。命令使用 Node.js spawn，shell=false，跨平台。</p>
                  </div>
                </div>
                <div class="form-grid compact-form-grid">
                  <label class="inline-checkbox">
                    <input v-model="settingsDraft.agentToolExecution.http.enabled" type="checkbox" />
                    <span>启用 HTTP 工具</span>
                  </label>
                  <label>
                    <span>HTTP 允许 Host（逗号分隔）</span>
                    <input
                      :value="settingsDraft.agentToolExecution.http.allowedHosts.join(', ')"
                      @input="settingsDraft.agentToolExecution.http.allowedHosts = String(($event.target as HTMLInputElement).value || '').split(',').map((item) => item.trim()).filter(Boolean)"
                    />
                  </label>
                  <label>
                    <span>HTTP Timeout(ms)</span>
                    <input v-model.number="settingsDraft.agentToolExecution.http.timeoutMs" type="number" min="1000" step="1000" />
                  </label>
                  <label>
                    <span>HTTP 最大响应字节</span>
                    <input v-model.number="settingsDraft.agentToolExecution.http.maxResponseBytes" type="number" min="1024" step="1024" />
                  </label>
                </div>
                <div class="form-grid compact-form-grid">
                  <label class="inline-checkbox">
                    <input v-model="settingsDraft.agentToolExecution.local.enabled" type="checkbox" />
                    <span>启用本地命令工具</span>
                  </label>
                  <label class="inline-checkbox">
                    <input v-model="settingsDraft.agentToolExecution.local.allowDirectCommands" type="checkbox" />
                    <span>允许直接命令</span>
                  </label>
                  <label>
                    <span>命令 Timeout(ms)</span>
                    <input v-model.number="settingsDraft.agentToolExecution.local.timeoutMs" type="number" min="1000" step="1000" />
                  </label>
                  <label>
                    <span>命令最大输出字节</span>
                    <input v-model.number="settingsDraft.agentToolExecution.local.maxOutputBytes" type="number" min="1024" step="1024" />
                  </label>
                </div>
                <details class="advanced-config" open>
                  <summary>本地命令模板 JSON</summary>
                  <textarea
                    :value="jsonPreview(settingsDraft.agentToolExecution.local.commands)"
                    rows="10"
                    spellcheck="false"
                    @change="settingsDraft.agentToolExecution.local.commands = JSON.parse(($event.target as HTMLTextAreaElement).value || '[]')"
                  ></textarea>
                </details>
                <details class="advanced-config">
                  <summary>function call schema</summary>
                  <pre>{{ jsonPreview({
                    http_request: {
                      method: 'GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS',
                      url: 'http://127.0.0.1:8787/api/agent-tools/...',
                      headers: {},
                      query: {},
                      body: {},
                      timeoutMs: 30000
                    },
                    local_command: {
                      commandId: 'node-version',
                      args: [],
                      cwd: '',
                      stdin: '',
                      timeoutMs: 30000
                    }
                  }) }}</pre>
                </details>
                <div class="source-actions">
                  <button class="tool-button" type="submit" :disabled="busyKey === 'settings'">
                    {{ busyKey === "settings" ? "保存中" : "保存工具调用配置" }}
                  </button>
                </div>
              </form>
            </article>
          </section>
        </template>

        <template v-if="isAuthenticated && currentView === 'admin' && adminView === 'maintenanceAgent'">
          <section class="maintenance-agent-layout">
            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>智能巡检</h3>
                </div>
                <div class="section-tags">
                  <span>{{ maintenanceAgentConfig?.enabled ? "已启用" : "未启用" }}</span>
                  <span>待审批 {{ pendingMaintenanceApprovalCount }}</span>
                  <span>下次 {{ formatCompactDate(nextMaintenanceAgentRunAt) }}</span>
                </div>
              </div>
              <div class="detail-metrics knowledge-metrics">
                <div>
                  <span>最近运行</span>
                  <strong>{{ latestMaintenanceAgentRun ? maintenanceAgentStatusLabel(latestMaintenanceAgentRun.status) : "无" }}</strong>
                </div>
                <div>
                  <span>风险</span>
                  <strong>{{ latestMaintenanceAgentRun ? maintenanceAgentRiskLabel(latestMaintenanceAgentRun.risk) : "无" }}</strong>
                </div>
                <div>
                  <span>Runbook</span>
                  <strong>{{ maintenanceAgentRunbooks.length }}</strong>
                </div>
                <div>
                  <span>工具</span>
                  <strong>{{ maintenanceAgentSummary?.tools.length || 0 }}</strong>
                </div>
              </div>
              <div class="source-actions">
                <button
                  class="tool-button"
                  type="button"
                  :disabled="busyKey === 'maintenance-agent:refresh'"
                  @click="refreshMaintenanceAgent"
                >
                  {{ busyKey === "maintenance-agent:refresh" ? "刷新中" : "刷新" }}
                </button>
              </div>
            </article>

            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>后台守护进程</h3>
                </div>
                <div class="section-tags">
                  <span>{{ backgroundSupervisorLabel }}</span>
                  <span>运行 {{ backgroundRunningCount }} / {{ backgroundProcesses.length }}</span>
                </div>
              </div>
              <div class="source-actions">
                <button
                  class="tool-button"
                  type="button"
                  :disabled="busyKey === 'background-processes:refresh'"
                  @click="refreshBackgroundProcesses()"
                >
                  {{ busyKey === "background-processes:refresh" ? "刷新中" : "刷新进程" }}
                </button>
              </div>
              <div class="job-table compact-job-table background-process-table">
                <div class="job-table-header">
                  <span>进程</span>
                  <span>状态</span>
                  <span>PID</span>
                  <span>心跳</span>
                </div>
                <div
                  v-for="processItem in backgroundProcesses"
                  :key="processItem.role"
                  class="job-row"
                >
                  <span>
                    <strong>{{ processItem.label }}</strong>
                    <small>{{ processItem.role }} · 重启 {{ processItem.restartCount || 0 }}</small>
                  </span>
                  <span class="status-pill" :data-tone="backgroundProcessTone(processItem.status)">
                    {{ backgroundProcessLabel(processItem.status) }}
                  </span>
                  <span>{{ processItem.pid || "—" }}</span>
                  <span>{{ formatCompactDate(processItem.lastHeartbeatAt || "") }}</span>
                </div>
              </div>
              <p v-if="backgroundProcessStatus?.statePath" class="module-note">
                状态文件：{{ backgroundProcessStatus.statePath }}
              </p>
              <div v-if="backgroundProcesses.length === 0" class="empty-state">
                <strong>暂无后台进程状态</strong>
              </div>
            </article>

            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>监控报警</h3>
                </div>
                <div class="section-tags">
                  <span>{{ monitorAlertState?.status || "未读取" }}</span>
                  <span>活跃 {{ monitorAlertSummary.activeCount }}</span>
                  <span>严重 {{ monitorAlertSummary.criticalCount }}</span>
                </div>
              </div>
              <div class="source-actions">
                <button
                  class="tool-button"
                  type="button"
                  :disabled="busyKey === 'monitor-alerts:refresh'"
                  @click="refreshMonitorAlerts()"
                >
                  {{ busyKey === "monitor-alerts:refresh" ? "刷新中" : "刷新报警" }}
                </button>
                <button
                  class="primary-action"
                  type="button"
                  :disabled="!canAdminMaintenanceAgent || busyKey === 'monitor-alerts:save'"
                  @click="saveMonitorAlertConfig"
                >
                  {{ busyKey === "monitor-alerts:save" ? "保存中" : "保存报警配置" }}
                </button>
              </div>
              <div class="job-table compact-job-table monitor-alert-table">
                <div class="job-table-header">
                  <span>级别</span>
                  <span>报警</span>
                  <span>最近出现</span>
                </div>
                <div
                  v-for="alert in activeMonitorAlerts"
                  :key="alert.alertId"
                  class="job-row"
                >
                  <span class="status-pill" :data-tone="monitorAlertSeverityTone(alert.severity)">
                    {{ monitorAlertSeverityLabel(alert.severity) }}
                  </span>
                  <span>
                    <strong>{{ alert.title }}</strong>
                    <small>{{ alert.message }}</small>
                  </span>
                  <span>{{ formatCompactDate(alert.lastSeenAt || alert.firstSeenAt) }}</span>
                </div>
              </div>
              <div v-if="activeMonitorAlerts.length === 0" class="empty-state">
                <strong>暂无活跃报警</strong>
              </div>
              <details class="advanced-config" open>
                <summary>报警报文配置 JSON</summary>
                <label class="json-editor">
                  <span>配置会保存到后台文件，sh 巡检脚本下一轮自动读取</span>
                  <textarea v-model="monitorAlertConfigText" rows="14" spellcheck="false" />
                </label>
              </details>
              <details class="advanced-config">
                <summary>最近报警历史</summary>
                <div class="job-table compact-job-table monitor-alert-table">
                  <div class="job-table-header">
                    <span>级别</span>
                    <span>报警</span>
                    <span>时间</span>
                  </div>
                  <div
                    v-for="alert in recentMonitorAlertHistory"
                    :key="`${alert.alertId}:${alert.lastSeenAt}:${alert.resolvedAt || ''}`"
                    class="job-row"
                  >
                    <span class="status-pill" :data-tone="monitorAlertSeverityTone(alert.severity)">
                      {{ monitorAlertSeverityLabel(alert.severity) }}
                    </span>
                    <span>
                      <strong>{{ alert.title }}</strong>
                      <small>{{ alert.active ? "活跃" : "已恢复" }} · {{ alert.message }}</small>
                    </span>
                    <span>{{ formatCompactDate(alert.lastSeenAt || alert.resolvedAt || alert.firstSeenAt) }}</span>
                  </div>
                </div>
              </details>
              <p v-if="monitorAlertState?.configPath" class="module-note">
                配置文件：{{ monitorAlertState.configPath }}；sh 配置：{{ monitorAlertState.shellConfigPath || "未生成" }}；状态文件：{{ monitorAlertState.statePath }}
              </p>
            </article>

            <article v-if="maintenanceAgentConfig" class="surface-card">
              <div class="section-header">
                <div>
                  <h3>调度策略</h3>
                </div>
              </div>
              <div class="form-grid compact-form-grid">
                <label>
                  <span>启用</span>
                  <el-select v-model="maintenanceAgentConfig.enabled" teleported>
                    <el-option label="开启" :value="true" />
                    <el-option label="关闭" :value="false" />
                  </el-select>
                </label>
                <label>
                  <span>Planner</span>
                  <el-select v-model="maintenanceAgentConfig.plannerMode" teleported>
                    <el-option label="gateway_fallback" value="gateway_fallback" />
                    <el-option label="fixed_runbook" value="fixed_runbook" />
                    <el-option label="gateway" value="gateway" />
                  </el-select>
                </label>
                <label>
                  <span>自动批准</span>
                  <el-select v-model="maintenanceAgentConfig.autoApproveRisk" teleported>
                    <el-option label="safe_write" value="safe_write" />
                    <el-option label="read_only" value="read_only" />
                  </el-select>
                </label>
                <label>
                  <span>Tick 秒</span>
                  <input v-model.number="maintenanceAgentConfig.scheduler.tickSeconds" type="number" min="1" max="3600" />
                </label>
              </div>
              <div class="job-table compact-job-table maintenance-schedule-table">
                <div class="job-table-header">
                  <span>计划</span>
                  <span>间隔</span>
                  <span>状态</span>
                </div>
                <div
                  v-for="schedule in maintenanceAgentConfig.schedules"
                  :key="schedule.id"
                  class="job-row"
                >
                  <span>
                    <strong>{{ schedule.label }}</strong>
                    <small>{{ schedule.runbook }} / {{ formatCompactDate(schedule.nextRunAt) }}</small>
                  </span>
                  <input v-model.number="schedule.intervalMinutes" type="number" min="1" max="525600" />
                  <button
                    class="table-action"
                    type="button"
                    @click="schedule.enabled = !schedule.enabled"
                  >
                    {{ schedule.enabled ? "停用" : "启用" }}
                  </button>
                </div>
              </div>
              <div class="source-actions maintenance-agent-policy-actions">
                <button
                  class="primary-action"
                  type="button"
                  :disabled="!canAdminMaintenanceAgent || busyKey === 'maintenance-agent:config'"
                  @click="saveMaintenanceAgentConfig"
                >
                  {{ busyKey === "maintenance-agent:config" ? "保存中" : "保存策略" }}
                </button>
              </div>
            </article>

            <article class="surface-card maintenance-agent-grid">
              <section class="module-panel">
                <div class="module-panel-heading">
                  <strong>对话入口</strong>
                  <span>{{ maintenanceAgentConfig?.plannerMode || "fixed_runbook" }}</span>
                </div>
                <label class="json-editor">
                  <span>指令</span>
                  <textarea v-model="maintenanceAgentMessage" rows="4" />
                </label>
                <button
                  class="tool-button"
                  type="button"
                  :disabled="!canRunMaintenanceAgent || busyKey === 'maintenance-agent:chat'"
                  @click="chatMaintenanceAgent"
                >
                  {{ busyKey === "maintenance-agent:chat" ? "执行中" : "发送" }}
                </button>
              </section>

              <section class="module-panel">
                <div class="module-panel-heading">
                  <strong>Runbook</strong>
                  <span>{{ maintenanceAgentRunbooks.length }}</span>
                </div>
                <label class="module-field">
                  <span>选择</span>
                  <el-select v-model="maintenanceAgentRunbook" teleported>
                    <el-option
                      v-for="runbook in maintenanceAgentRunbooks"
                      :key="runbook.id"
                      :label="`${runbook.label} / ${runbook.id}`"
                      :value="runbook.id"
                    />
                  </el-select>
                </label>
                <button
                  class="tool-button"
                  type="button"
                  :disabled="!canRunMaintenanceAgent || busyKey === 'maintenance-agent:run'"
                  @click="runMaintenanceAgentRunbook"
                >
                  {{ busyKey === "maintenance-agent:run" ? "执行中" : "运行" }}
                </button>
              </section>
            </article>

            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>运行记录</h3>
                </div>
              </div>
              <div class="job-table compact-job-table maintenance-run-table">
                <div class="job-table-header">
                  <span>运行</span>
                  <span>状态</span>
                  <span>操作</span>
                </div>
                <div
                  v-for="run in displayedMaintenanceAgentRuns"
                  :key="run.runId"
                  class="job-row"
                >
                  <button
                    class="table-action text-action"
                    type="button"
                    @click="selectedMaintenanceAgentRun = run"
                  >
                    {{ run.intent }} / {{ formatCompactDate(run.updatedAt) }}
                  </button>
                  <span class="status-pill" :data-tone="maintenanceAgentStatusTone(run.status)">
                    {{ maintenanceAgentStatusLabel(run.status) }} / {{ maintenanceAgentRiskLabel(run.risk) }}
                  </span>
                  <span class="table-actions-inline">
                    <button
                      v-if="run.status === 'awaiting_approval'"
                      class="table-action"
                      type="button"
                      :disabled="!canApproveMaintenanceAgent || busyKey === `maintenance-agent:approve:${run.runId}`"
                      @click="approveMaintenanceAgentRun(run)"
                    >
                      批准
                    </button>
                    <button
                      v-if="!['completed', 'completed_with_errors', 'failed', 'cancelled', 'rejected'].includes(run.status)"
                      class="table-action danger-action"
                      type="button"
                      :disabled="!canRunMaintenanceAgent || busyKey === `maintenance-agent:cancel:${run.runId}`"
                      @click="cancelMaintenanceAgentRun(run)"
                    >
                      取消
                    </button>
                  </span>
                </div>
              </div>
              <div v-if="displayedMaintenanceAgentRuns.length === 0" class="empty-state">
                <strong>暂无维护运行</strong>
              </div>
            </article>

            <article v-if="selectedMaintenanceAgentRun" class="surface-card">
              <div class="section-header">
                <div>
                  <h3>{{ selectedMaintenanceAgentRun.summary }}</h3>
                </div>
                <div class="section-tags">
                  <span>{{ selectedMaintenanceAgentRun.planHash.slice(0, 12) }}</span>
                  <span>{{ selectedMaintenanceAgentRun.source }}</span>
                </div>
              </div>
              <div class="maintenance-agent-step-list">
                <section
                  v-for="step in selectedMaintenanceAgentRun.steps"
                  :key="step.stepId"
                  class="module-panel"
                >
                  <div class="module-panel-heading">
                    <strong>{{ step.toolId }}</strong>
                    <span>{{ maintenanceAgentStatusLabel(step.status) }} / {{ maintenanceAgentRiskLabel(step.risk) }}</span>
                  </div>
                  <p class="module-note">{{ step.reason }}</p>
                  <pre v-if="step.output">{{ jsonPreview(step.output) }}</pre>
                  <p v-if="step.error" class="module-note danger-text">{{ step.error }}</p>
                </section>
              </div>
              <section v-if="maintenanceAgentResultJson" class="markdown-preview">
                <h4>最近输出</h4>
                <pre>{{ maintenanceAgentResultJson }}</pre>
              </section>
            </article>
          </section>
        </template>

        <template v-if="isAuthenticated && currentView === 'admin' && adminView === 'tools'">
          <section class="tools-layout">
            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>工具管理平台</h3>
                </div>
                <div class="section-tags">
                  <span>目录指纹 {{ toolManagementCatalogState?.fingerprint?.slice(0, 12) || "未加载" }}</span>
                  <span>工具 {{ activeToolManagementToolCount }}/{{ toolManagementTools.length }}</span>
                  <span>内部 {{ internalToolManagementToolCount }}</span>
                  <span>授权 {{ enabledToolGrantCount }}/{{ toolGrants.length }}</span>
                </div>
              </div>
              <div class="detail-metrics knowledge-metrics">
                <div>
                  <span>调用总量</span>
                  <strong>{{ toolManagementMetricsState?.callsTotal || 0 }}</strong>
                </div>
                <div>
                  <span>拒绝</span>
                  <strong>{{ toolManagementMetricsState?.byStatus?.denied || 0 }}</strong>
                </div>
                <div>
                  <span>限流</span>
                  <strong>{{ toolManagementMetricsState?.rateLimitedTotal || 0 }}</strong>
                </div>
                <div>
                  <span>平均耗时</span>
                  <strong>{{ Math.round(toolManagementMetricsState?.averageDurationMs || 0) }}ms</strong>
                </div>
              </div>
              <div class="source-actions">
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  :disabled="busyKey === 'tool-platform'"
                  @click="refreshToolPlatform"
                >
                  {{ busyKey === "tool-platform" ? "刷新中" : "刷新" }}
                </button>
              </div>

              <div class="job-table compact-job-table">
                <div class="job-table-header">
                  <span>工具</span>
                  <span>工具集</span>
                  <span>风险</span>
                  <span>状态</span>
                </div>
                <div
                  v-for="tool in toolManagementTools.slice(0, 80)"
                  :key="tool.id"
                  class="job-row"
                >
                  <span>
                    <strong>{{ tool.label }}</strong>
                    <small>{{ tool.id }} / {{ tool.source }}</small>
                  </span>
                  <span>{{ tool.toolsets.map(toolsetLabel).join(" / ") }}</span>
                  <span class="status-pill" :data-tone="tool.risk">{{ toolRiskLabel(tool.risk) }}</span>
                  <span>{{ toolStatusLabel(tool.status) }}</span>
                </div>
              </div>
              <div v-if="toolManagementTools.length === 0" class="empty-state">
                <strong>尚未加载工具目录</strong>
              </div>
            </article>

            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>工具集 / 智能体档案</h3>
                </div>
              </div>
              <div class="tool-platform-grid">
                <article
                  v-for="toolset in toolManagementToolsets"
                  :key="toolset.id"
                  class="tool-platform-card"
                >
                  <div class="tool-platform-card-header">
                    <div>
                      <strong>{{ toolset.label }}</strong>
                      <span>{{ toolset.id }}</span>
                    </div>
                    <em>{{ toolRiskLabel(toolset.maxRisk) }}</em>
                  </div>
                  <p>{{ toolset.requiredScopes.map(scopeLabel).join(" / ") }}</p>
                </article>
              </div>
              <div class="job-table compact-job-table">
                <div class="job-table-header">
                  <span>档案</span>
                  <span>工具集</span>
                  <span>风险</span>
                </div>
                <div
                  v-for="profile in toolManagementProfiles"
                  :key="profile.id"
                  class="job-row"
                >
                  <span>
                    <strong>{{ profile.label }}</strong>
                    <small>{{ profile.id }} / {{ profile.agentType }}</small>
                  </span>
                  <span>{{ profile.toolsets.map(toolsetLabel).join(" / ") }}</span>
                  <span>{{ toolRiskLabel(profile.maxRisk) }}</span>
                </div>
              </div>
            </article>

            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>策略预览</h3>
                </div>
              </div>
              <div class="form-grid compact-form-grid">
                <label>
                  <span>工具</span>
                  <select v-model="policyPreviewToolId">
                    <option
                      v-for="tool in toolManagementTools"
                      :key="tool.id"
                      :value="tool.id"
                    >
                      {{ tool.label }} / {{ tool.id }}
                    </option>
                  </select>
                </label>
                <label>
                  <span>智能体档案</span>
                  <select v-model="policyPreviewProfileId">
                    <option value="">不绑定档案</option>
                    <option
                      v-for="profile in toolManagementProfiles"
                      :key="profile.id"
                      :value="profile.id"
                    >
                      {{ profile.label }} / {{ profile.id }}
                    </option>
                  </select>
                </label>
                <label>
                  <span>授权 ID</span>
                  <input v-model="policyPreviewGrantId" autocomplete="off" placeholder="留空时使用当前工具的模拟 grant" />
                </label>
              </div>
              <div class="source-actions">
                <button
                  class="tool-button"
                  type="button"
                  :disabled="busyKey === 'tool-policy-preview'"
                  @click="previewToolPolicy"
                >
                  {{ busyKey === "tool-policy-preview" ? "评估中" : "评估策略" }}
                </button>
              </div>
              <pre v-if="policyPreviewResult">{{ jsonPreview(policyPreviewResult) }}</pre>
            </article>

            <article class="surface-card permission-create-card">
              <div class="section-header">
                <div>
                  <h3>创建工具授权</h3>
                </div>
              </div>

              <form class="permission-form" @submit.prevent="createGrant">
                <label class="module-field">
                  <span>授权名称</span>
                  <input v-model="newGrantLabel" autocomplete="off" />
                </label>

                <div class="scope-grid">
                  <button
                    v-for="scope in toolScopes"
                    :key="scope.id"
                    class="scope-chip"
                    :class="{ active: newGrantScopes.includes(scope.id) }"
                    type="button"
                    @click="toggleNewGrantScope(scope.id)"
                  >
                    <strong>{{ scope.label }}</strong>
                    <span>{{ scope.description }}</span>
                  </button>
                </div>
                <div class="scope-grid">
                  <button
                    v-for="toolset in toolManagementToolsets.filter((item) => item.grantable !== false)"
                    :key="toolset.id"
                    class="scope-chip"
                    :class="{ active: newGrantToolsets.includes(toolset.id) }"
                    type="button"
                    @click="toggleNewGrantToolset(toolset.id)"
                  >
                    <strong>{{ toolset.label }}</strong>
                    <span>{{ toolRiskLabel(toolset.maxRisk) }}</span>
                  </button>
                </div>

                <button class="tool-button" type="submit" :disabled="busyKey === 'grant:create'">
                  {{ busyKey === "grant:create" ? "创建中" : "创建授权" }}
                </button>
              </form>

              <div v-if="issuedToolToken" class="token-panel">
                <div>
                  <strong>新令牌只显示一次</strong>
                  <p>{{ issuedToolToken }}</p>
                </div>
                <button class="tool-button tool-button-ghost" type="button" @click="copyIssuedToolToken">
                  复制
                </button>
              </div>
            </article>

            <article class="surface-card permission-list-card">
              <div class="section-header">
                <div>
                  <h3>工具授权</h3>
                </div>
                <div class="section-tags">
                  <span>启用 {{ enabledToolGrantCount }}</span>
                  <span>总计 {{ toolGrants.length }}</span>
                </div>
              </div>

              <div class="permission-list" v-if="toolGrants.length > 0">
                <article
                  v-for="grant in toolGrants"
                  :key="grant.id"
                  class="permission-card"
                  :data-enabled="grant.enabled"
                >
                  <div class="permission-card-main">
                    <label class="module-field">
                      <span>名称</span>
                      <input v-model="grant.label" autocomplete="off" @change="updateGrant(grant, { label: grant.label })" />
                    </label>
                    <dl class="module-status-list">
                      <div>
                        <dt>令牌</dt>
                        <dd>{{ grant.tokenPrefix || "未生成" }}</dd>
                      </div>
                      <div>
                        <dt>最近使用</dt>
                        <dd>{{ grant.lastUsedAt ? formatCompactDate(grant.lastUsedAt) : "未使用" }}</dd>
                      </div>
                      <div>
                        <dt>工具集</dt>
                        <dd>{{ (grant.toolsets || []).map(toolsetLabel).join(" / ") || "未声明" }}</dd>
                      </div>
                    </dl>
                  </div>

                  <div class="permission-card-controls">
                    <div class="scope-grid compact-scope-grid">
                      <button
                        v-for="scope in toolScopes"
                        :key="scope.id"
                        class="scope-chip"
                        :class="{ active: grantHasScope(grant, scope.id) }"
                        type="button"
                        :disabled="busyKey === `grant:${grant.id}`"
                        @click="toggleGrantScope(grant, scope.id)"
                      >
                        <strong>{{ scope.label }}</strong>
                      </button>
                    </div>
                    <div class="scope-grid compact-scope-grid">
                      <button
                        v-for="toolset in toolManagementToolsets.filter((item) => item.grantable !== false)"
                        :key="toolset.id"
                        class="scope-chip"
                        :class="{ active: grantHasToolset(grant, toolset.id) }"
                        type="button"
                        :disabled="busyKey === `grant:${grant.id}`"
                        @click="toggleGrantToolset(grant, toolset.id)"
                      >
                        <strong>{{ toolset.label }}</strong>
                      </button>
                    </div>
                    <div class="permission-actions">
                      <button
                        class="module-switch"
                        :data-enabled="grant.enabled"
                        :aria-pressed="grant.enabled"
                        :aria-label="grant.enabled ? '停用授权' : '启用授权'"
                        type="button"
                        :disabled="busyKey === `grant:${grant.id}`"
                        @click="updateGrant(grant, { enabled: !grant.enabled })"
                      >
                        <span class="module-switch-track">
                          <span class="module-switch-knob" />
                        </span>
                      </button>
                      <button class="table-action" type="button" :disabled="busyKey === `grant:${grant.id}`" @click="rotateGrant(grant)">
                        轮换
                      </button>
                      <button class="table-action danger-action" type="button" :disabled="busyKey === `grant:${grant.id}`" @click="deleteGrant(grant)">
                        撤销
                      </button>
                    </div>
                  </div>
                </article>
              </div>

              <div v-else class="empty-state">
                <strong>暂无工具授权</strong>
                <span>创建授权后，智能体才能调用受限工具入口。</span>
              </div>
            </article>

            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>审计 / 指标</h3>
                </div>
                <div class="section-tags">
                  <span v-for="row in toolManagementStatusRows" :key="`status:${row.label}`">{{ row.label }} {{ row.value }}</span>
                  <span v-for="row in toolManagementRiskRows" :key="`risk:${row.label}`">{{ toolRiskLabel(row.label) }} {{ row.value }}</span>
                </div>
              </div>
              <div class="job-table compact-job-table">
                <div class="job-table-header">
                  <span>执行</span>
                  <span>工具</span>
                  <span>状态</span>
                  <span>耗时</span>
                </div>
                <div
                  v-for="item in toolManagementAuditItems"
                  :key="item.toolExecutionId"
                  class="job-row"
                >
                  <span>
                    <strong>{{ item.toolExecutionId }}</strong>
                    <small>{{ item.traceId }} / {{ formatCompactDate(item.finishedAt || item.startedAt) }}</small>
                  </span>
                  <span>{{ item.toolId }}</span>
                  <span>{{ item.status }}{{ item.errorCode ? ` / ${item.errorCode}` : "" }}</span>
                  <span>{{ item.durationMs }}ms</span>
                </div>
              </div>
              <div v-if="toolManagementAuditItems.length === 0" class="empty-state">
                <strong>暂无工具调用审计</strong>
              </div>
            </article>
          </section>
        </template>

        <template v-if="isAuthenticated && currentView === 'admin' && adminView === 'modules'">
          <section class="modules-layout">
            <article class="surface-card module-mount-card">
              <div class="module-card-meta module-card-meta-right">
                <h3 class="module-card-title">外置模块</h3>
                <div class="section-tags">
                  <span>运行代次 {{ consoleState?.runtime.mountGeneration || 0 }}</span>
                  <span>启用 {{ enabledMountCount }}/{{ totalMountCount }}</span>
                </div>
              </div>

              <div class="mount-config-list">
                <section
                  v-for="group in moduleGroups"
                  :key="group.id"
                  class="mount-config-group"
                >
                  <div class="mount-group-header">
                    <div>
                      <h4>{{ group.label }}</h4>
                      <p>{{ group.description }}</p>
                    </div>
                  </div>

                  <article
                    v-for="item in group.rows"
                    :key="item.name"
                    class="mount-config-item"
                    :data-enabled="item.externalEnabled"
                  >
                    <div class="mount-config-main">
                      <div class="mount-config-heading">
                        <strong>{{ item.label }}</strong>
                        <span
                          class="module-state-pill"
                          :data-enabled="item.externalEnabled"
                        >
                          <span class="state-dot" />
                          {{ moduleAvailabilityLabel(item) }}
                        </span>
                      </div>
                      <p>{{ item.description }}</p>
                      <dl class="module-status-list">
                        <div>
                          <dt>运行实例</dt>
                          <dd>{{ item.runtimeMount?.id || "未加载" }}</dd>
                        </div>
                        <div>
                          <dt>能力</dt>
                          <dd>{{ moduleCapabilityText(item) }}</dd>
                        </div>
                        <div>
                          <dt>运行状态</dt>
                          <dd>{{ moduleStatusText(item) }}</dd>
                        </div>
                      </dl>
                    </div>

                    <div class="mount-config-controls">
                      <label class="module-field">
                        <span>模块路径</span>
                        <div class="path-field">
                          <input
                            v-model="mountDraft[item.name]"
                            autocomplete="off"
                            :placeholder="currentModulePathPlaceholder(item)"
                          />
                          <BrowseSelectButton
                            kind="server-file"
                            button-class="path-action-button"
                            button-text="浏览"
                            size="small"
                            :disabled="!canBrowseServerPaths"
                            plain
                            @browse="openMountPathPicker(item.name)"
                          />
                        </div>
                      </label>
                      <div class="mount-config-actions">
                        <button
                          class="module-switch"
                          :data-enabled="item.externalEnabled"
                          :aria-pressed="item.externalEnabled"
                          :aria-label="
                            item.externalEnabled
                              ? `关闭${item.label}`
                              : `开启${item.label}`
                          "
                          type="button"
                          :disabled="
                            busyKey === `mount:${item.name}` ||
                            (!item.externalEnabled &&
                              !String(mountDraft[item.name] || '').trim())
                          "
                          @click="
                            item.externalEnabled
                              ? disableMountModule(item.name)
                              : enableMountModule(item.name)
                          "
                        >
                          <span class="module-switch-track">
                            <span class="module-switch-knob" />
                          </span>
                        </button>
                      </div>
                    </div>
                  </article>
                </section>
              </div>
            </article>
          </section>
        </template>

        <template v-if="isAuthenticated && currentView === 'admin' && adminView === 'jobs'">
          <section id="jobs" class="surface-card jobs-card">
            <div class="section-header">
              <div>
                <h3>活跃任务</h3>
              </div>
              <div class="section-tags">
                <span
                  >总计 {{ consoleState?.jobs.summary.totalCount || 0 }}</span
                >
                <span
                  >完成
                  {{ consoleState?.jobs.summary.completedCount || 0 }}</span
                >
                <span
                  >失败 {{ consoleState?.jobs.summary.failedCount || 0 }}</span
                >
              </div>
            </div>

            <div class="table-shell">
              <table class="jobs-table">
                <thead>
                  <tr>
                    <th>任务 ID</th>
                    <th>状态</th>
                    <th>进度</th>
                    <th>耗时</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody v-if="recentJobs.length > 0">
                  <tr v-for="item in recentJobs" :key="item.id">
                    <td>
                      <div class="primary-cell">
                        <strong>{{ item.id }}</strong>
                        <span>{{ item.stage }}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        class="status-pill"
                        :data-tone="jobStatusTone(item.status)"
                      >
                        {{ jobStatusLabels[item.status] }}
                      </span>
                    </td>
                    <td class="progress-cell">
                      <div class="progress-track">
                        <div
                          class="progress-fill"
                          :style="{ width: `${item.progressPercent}%` }"
                        />
                      </div>
                      <span>{{ item.progressPercent }}%</span>
                    </td>
                    <td>
                      <div class="time-cell">
                        <strong>{{ jobElapsed(item) }}</strong>
                        <span>{{ formatCompactDate(item.updatedAt) }}</span>
                      </div>
                    </td>
                    <td>
                      <button
                        class="table-action"
                        type="button"
                        :disabled="busyKey === `job:${item.id}`"
                        @click="deleteJob(item.id)"
                      >
                        {{ busyKey === `job:${item.id}` ? "处理中" : "删除" }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div v-if="recentJobs.length === 0" class="empty-state">
                <strong>暂无任务记录</strong>
                <span>当前筛选条件下没有匹配任务。</span>
              </div>
            </div>
          </section>
        </template>

        <template v-if="isAuthenticated && currentView === 'admin' && adminView === 'clients'">
          <section id="clients-list" class="surface-card clients-card">
              <div class="section-header">
                <div>
                  <h3>设备管理</h3>
              </div>
              <div class="section-tags">
                <span
                  >总计
                  {{ consoleState?.clients.summary.totalCount || 0 }}</span
                >
                <span
                  >在线
                  {{
                    (consoleState?.clients.summary.totalCount || 0) -
                    (consoleState?.clients.summary.offlineCount || 0)
                  }}</span
                >
              </div>
            </div>

            <div class="table-toolbar">
              <div class="toolbar-left">
                <input
                  v-model="clientSearchQuery"
                  class="search-input"
                  placeholder="搜索 标签、ID、主机或系统…"
                />
                <el-select v-model="clientStateFilter" class="filter-select" teleported>
                  <el-option label="所有状态" value="all" />
                  <el-option
                    v-for="(label, key) in migrationStateLabels"
                    :key="key"
                    :label="label"
                    :value="key"
                  />
                </el-select>
              </div>
              <div class="toolbar-actions">
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  @click="importClients"
                >
                  导入
                </button>
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  @click="exportClients"
                >
                  导出
                </button>
              </div>
            </div>

            <div class="table-shell">
              <table class="jobs-table">
                <thead>
                  <tr>
                    <th>客户端信息</th>
                    <th>平台环境</th>
                    <th>版本</th>
                    <th>当前服务</th>
                    <th>最近活跃</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody v-if="filteredClientList.length > 0">
                  <tr
                    v-for="item in filteredClientList"
                    :key="item.clientId"
                  >
                    <td>
                      <div class="primary-cell">
                        <strong>{{ item.clientLabel || item.clientId }}</strong>
                        <span>{{ item.clientId }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="primary-cell">
                        <strong>{{ item.platform }}</strong>
                        <span>{{ item.hostname }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="primary-cell">
                        <strong>{{ item.appVersion || "未上报" }}</strong>
                        <span>配置 {{ item.configVersion || "未上报" }}</span>
                      </div>
                    </td>
                    <td>
                      <span class="url-badge">{{
                        item.currentServiceUrl || "未接入"
                      }}</span>
                    </td>
                    <td>
                      <div class="time-cell">
                        <strong>{{ formatCompactDate(item.lastSeenAt) }}</strong>
                        <span>{{ item.lastSeenServerId || "N/A" }}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        class="status-pill"
                        :data-tone="migrationTone(item.migrationState)"
                      >
                        {{ migrationStateLabels[item.migrationState] }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div
                v-if="filteredClientList.length === 0"
                class="empty-state"
              >
                <strong>暂无匹配客户端</strong>
                <span>请尝试更换搜索条件或检查网络连接。</span>
              </div>
            </div>
          </section>

          <aside id="network" class="surface-card migration-card">
            <div class="section-header">
              <div>
                <h3>迁移控制</h3>
              </div>
              <div class="section-tags">
                <span
                  >已切换
                  {{ consoleState?.clients.summary.alignedCount || 0 }}</span
                >
                <span
                  >迁移中
                  {{ consoleState?.clients.summary.drainingCount || 0 }}</span
                >
              </div>
            </div>

            <div class="migration-form-list" v-if="filteredClientList.length > 0">
              <form
                v-for="item in filteredClientList"
                :key="item.clientId"
                class="module-panel migration-control-form"
                :data-tone="migrationTone(item.migrationState)"
                @submit.prevent="requestClientMigration(item)"
              >
                <div class="migration-item-header">
                  <div>
                    <strong>{{ item.clientLabel || item.clientId }}</strong>
                    <span>{{
                      item.hostname || item.platform || item.clientId
                    }}</span>
                  </div>
                  <em>{{ migrationStateLabels[item.migrationState] }}</em>
                </div>

                <div class="form-grid compact-form-grid">
                  <label>
                    <span>客户端版本</span>
                    <input :value="item.appVersion || '未上报'" readonly />
                  </label>
                  <label>
                    <span>配置版本</span>
                    <input :value="item.configVersion || '未上报'" readonly />
                  </label>
                  <label>
                    <span>当前服务</span>
                    <input :value="item.currentServiceUrl || '未上报'" readonly />
                  </label>
                  <label>
                    <span>目标服务</span>
                    <input :value="item.desiredServiceUrl || consoleState?.discovery.value.activeServiceUrl || '未设置'" readonly />
                  </label>
                  <label>
                    <span>任务服务</span>
                    <input :value="item.currentJobServiceUrl || '无运行任务'" readonly />
                  </label>
                  <label>
                    <span>最近上报</span>
                    <input :value="formatCompactDate(item.lastSeenAt)" readonly />
                  </label>
                </div>

                <p v-if="item.lastError" class="module-note danger-text">
                  {{ item.lastError }}
                </p>
                <p v-if="clientMigrationMessages[item.clientId]" class="module-note">
                  {{ clientMigrationMessages[item.clientId] }}
                </p>

                <div class="module-panel-footer">
                  <button
                    class="tool-button"
                    type="submit"
                    :disabled="!canAdminRuntime || busyKey === `client:migration:${item.clientId}`"
                  >
                    {{ busyKey === `client:migration:${item.clientId}` ? "发布中" : "拉起迁移" }}
                  </button>
                </div>
              </form>
            </div>

            <div v-else class="migration-empty">
              <strong>暂无客户端迁移流量</strong>
              <p>
                引导地址
                {{ consoleState?.discovery.value.bootstrapBaseUrl || "未配置" }}
              </p>
              <p>
                离线判定
                {{ consoleState?.discovery.value.offlineAfterSeconds || 0 }} 秒
              </p>
              <p>
                最近客户端
                {{
                  latestClient
                    ? formatCompactDate(latestClient.lastSeenAt)
                    : "暂无上报"
                }}
              </p>
            </div>
          </aside>
        </template>

        <template v-if="isAuthenticated && currentView === 'admin' && adminView === 'storage'">
          <section id="storage" class="detail-grid">
            <article class="surface-card detail-card system-overview-card">
              <div class="section-header">
                <div>
                  <h3>概览</h3>
                </div>
              </div>

              <section class="metric-grid system-overview-metrics">
                <article class="metric-card" data-tone="primary">
                  <div class="metric-card-header">
                    <span>数据源能力</span>
                    <strong>{{ enabledMountCount }}/{{ totalMountCount }}</strong>
                  </div>
                  <h3>{{ enabledMountCount }}</h3>
                  <div class="metric-progress">
                    <div
                      class="metric-progress-bar"
                      :style="{
                        width: `${totalMountCount ? (enabledMountCount / totalMountCount) * 100 : 0}%`,
                      }"
                    />
                  </div>
                  <p>当前可用的导入、解析与索引能力。</p>
                </article>

                <article class="metric-card" data-tone="accent">
                  <div class="metric-card-header">
                    <span>活跃任务</span>
                    <strong>{{ activeJobCount }}</strong>
                  </div>
                  <h3>{{ consoleState?.jobs.summary.totalCount || 0 }}</h3>
                  <p>
                    运行中
                    {{ consoleState?.jobs.summary.runningCount || 0 }}，排队
                    {{ consoleState?.jobs.summary.queuedCount || 0 }}
                  </p>
                </article>

                <article class="metric-card" data-tone="neutral">
                  <div class="metric-card-header">
                    <span>存储批次</span>
                    <strong>{{ consoleState?.storage.batchCount || 0 }}</strong>
                  </div>
                  <h3>{{ consoleState?.storage.sourceCount || 0 }}</h3>
                  <p>
                    邮件 {{ consoleState?.storage.emailCount || 0 }}，事务
                    {{ consoleState?.storage.transactionCount || 0 }}
                  </p>
                </article>

                <article class="metric-card" data-tone="success">
                  <div class="metric-card-header">
                    <span>待关注</span>
                    <strong>{{
                      consoleState?.clients.summary.totalCount || 0
                    }}</strong>
                  </div>
                  <h3>{{ attentionClientCount }}</h3>
                  <p>任务、设备或服务状态需要处理。</p>
                </article>
              </section>

              <div class="detail-metrics">
                <div>
                  <span>原始对象</span>
                  <strong>{{
                    consoleState?.storage.rawObjectCount || 0
                  }}</strong>
                </div>
                <div>
                  <span>线程</span>
                  <strong>{{ consoleState?.storage.threadCount || 0 }}</strong>
                </div>
                <div>
                  <span>人物</span>
                  <strong>{{ consoleState?.storage.peopleCount || 0 }}</strong>
                </div>
                <div>
                  <span>检索项</span>
                  <strong>{{
                    consoleState?.storage.retrievalCount || 0
                  }}</strong>
                </div>
              </div>

              <dl class="meta-list">
                <div>
                  <dt>批次</dt>
                  <dd>{{ consoleState?.storage.batchCount || 0 }}</dd>
                </div>
                <div>
                  <dt>数据源</dt>
                  <dd>{{ consoleState?.storage.sourceCount || 0 }}</dd>
                </div>
              </dl>
            </article>

            <article class="surface-card detail-card">
              <div class="section-header">
                <div>
                  <h3>运行状态</h3>
                </div>
                <button
                  class="inline-link"
                  type="button"
                  @click="switchView('intelligence')"
                >
                  查看智能设置
                </button>
              </div>

              <dl class="meta-list">
                <div>
                  <dt>运行档位</dt>
                  <dd>{{ consoleState?.runtime.profile || "default" }}</dd>
                </div>
                <div>
                  <dt>挂载代次</dt>
                  <dd>{{ consoleState?.runtime.mountGeneration || 0 }}</dd>
                </div>
                <div>
                  <dt>挂载模块</dt>
                  <dd>{{ enabledMountCount }}/{{ totalMountCount }}</dd>
                </div>
              </dl>
            </article>

            <article class="surface-card detail-card">
              <div class="section-header">
                <div>
                  <h3>引导网络</h3>
                </div>
                <button
                  class="inline-link"
                  type="button"
                  @click="openDrawer('discovery')"
                >
                  修改
                </button>
              </div>

              <dl class="meta-list">
                <div>
                  <dt>服务 ID</dt>
                  <dd>
                    {{ consoleState?.discovery.value.serverId || "未配置" }}
                  </dd>
                </div>
                <div>
                  <dt>对外服务地址</dt>
                  <dd>
                    {{
                      consoleState?.discovery.value.advertisedBaseUrl ||
                      "未配置"
                    }}
                  </dd>
                </div>
                <div>
                  <dt>活跃服务地址</dt>
                  <dd>
                    {{
                      consoleState?.discovery.value.activeServiceUrl || "未配置"
                    }}
                  </dd>
                </div>
                <div>
                  <dt>配置版本</dt>
                  <dd>
                    {{
                      consoleState?.discovery.value.configVersion || "未配置"
                    }}
                  </dd>
                </div>
              </dl>
            </article>
          </section>
        </template>
      </div>
    </main>

    <div v-if="drawerOpen" class="drawer-backdrop" @click="closeDrawer()" />

    <aside class="config-drawer" :class="{ open: drawerOpen }">
      <header class="drawer-header">
        <div>
          <h3>控制台选项</h3>
        </div>
        <button
          class="tool-button tool-button-ghost"
          type="button"
          @click="closeDrawer()"
        >
          关闭
        </button>
      </header>

      <div class="drawer-tabs">
        <button
          class="drawer-tab"
          :class="{ active: drawerTab === 'discovery' }"
          type="button"
          @click="openDrawer('discovery')"
        >
          服务发现
        </button>
        <button
          class="drawer-tab"
          :class="{ active: drawerTab === 'users' }"
          type="button"
          @click="openDrawer('users')"
        >
          用户管理
        </button>
        <button
          class="drawer-tab"
          :class="{ active: drawerTab === 'modules' }"
          type="button"
          @click="openDrawer('modules')"
        >
          模块管理
        </button>
      </div>

      <div class="drawer-content">
        <form
          v-if="drawerTab === 'discovery'"
          class="drawer-panel"
          @submit.prevent="saveDiscovery"
        >
          <div class="panel-header">
            <h4>服务发现</h4>
          </div>

          <div class="form-grid">
            <label>
              <span>服务 ID</span>
              <input v-model="discoveryDraft.serverId" autocomplete="off" />
            </label>
            <label>
              <span>服务标签</span>
              <input v-model="discoveryDraft.serverLabel" autocomplete="off" />
            </label>
            <label>
              <span>引导地址</span>
              <input
                v-model="discoveryDraft.bootstrapBaseUrl"
                autocomplete="off"
              />
            </label>
            <label>
              <span>对外服务地址</span>
              <input
                v-model="discoveryDraft.advertisedBaseUrl"
                autocomplete="off"
              />
            </label>
            <label>
              <span>活跃服务地址</span>
              <input
                v-model="discoveryDraft.activeServiceUrl"
                autocomplete="off"
              />
            </label>
            <label>
              <span>转发目标地址</span>
              <input
                v-model="discoveryDraft.forwardBaseUrl"
                autocomplete="off"
              />
            </label>
            <label>
              <span>运行模式</span>
              <el-select v-model="discoveryDraft.mode" teleported>
                <el-option label="激活 (active)" value="active" />
                <el-option label="转发 (forward)" value="forward" />
              </el-select>
            </label>
            <label>
              <span>配置版本</span>
              <input
                v-model="discoveryDraft.configVersion"
                autocomplete="off"
              />
            </label>
            <label>
              <span>刷新周期（秒）</span>
              <input
                v-model.number="discoveryDraft.refreshIntervalSeconds"
                min="5"
                type="number"
              />
            </label>
            <label>
              <span>签到周期（秒）</span>
              <input
                v-model.number="discoveryDraft.checkInIntervalSeconds"
                min="5"
                type="number"
              />
            </label>
            <label>
              <span>离线判定（秒）</span>
              <input
                v-model.number="discoveryDraft.offlineAfterSeconds"
                min="30"
                type="number"
              />
            </label>
          </div>

          <button
            class="tool-button"
            type="submit"
            :disabled="busyKey === 'discovery'"
          >
            {{ busyKey === "discovery" ? "保存中" : "保存服务发现" }}
          </button>
        </form>

        <section v-else-if="drawerTab === 'users'" class="drawer-panel">
          <div class="panel-header">
            <h4>用户与审计</h4>
            <p>用户创建和密码修改仅允许在服务端命令行执行。</p>
          </div>

          <template v-if="canAdminAuth">
            <div class="drawer-actions">
              <button class="tool-button tool-button-ghost" type="button" @click="refreshAuthAdmin">
                刷新
              </button>
            </div>

            <section class="module-panel">
              <div class="module-panel-heading">
                <strong>控制台用户</strong>
                <span>{{ authUsers.length }} 个账号</span>
              </div>
              <div class="job-table compact-job-table drawer-auth-table">
                <div class="job-table-header">
                  <span>用户</span>
                  <span>角色</span>
                  <span>状态</span>
                </div>
                <div v-for="user in authUsers" :key="user.userId" class="job-row">
                  <span>{{ user.displayName }} / {{ user.username }}</span>
                  <el-select :model-value="user.roleId" teleported @change="updateConsoleUserRole(user, $event)">
                    <el-option
                      v-for="role in authState?.roles || []"
                      :key="role.roleId"
                      :label="role.label"
                      :value="role.roleId"
                    />
                  </el-select>
                  <button
                    class="table-action"
                    type="button"
                    :disabled="busyKey === `auth:user:${user.userId}`"
                    @click="updateConsoleUser(user, { enabled: !user.enabled })"
                  >
                    {{ user.enabled ? "停用" : "启用" }}
                  </button>
                </div>
              </div>
            </section>

            <section class="module-panel">
              <div class="module-panel-heading">
                <strong>OIDC 配置</strong>
                <span>{{ oidcDraft.enabled ? "已启用" : "未启用" }}</span>
              </div>
              <div class="form-grid compact-form-grid">
                <label>
                  <span>启用</span>
                  <el-select v-model="oidcDraft.enabled" teleported>
                    <el-option label="开启" :value="true" />
                    <el-option label="关闭" :value="false" />
                  </el-select>
                </label>
                <label>
                  <span>Issuer</span>
                  <input v-model="oidcDraft.issuer" autocomplete="off" />
                </label>
                <label>
                  <span>Client ID</span>
                  <input v-model="oidcDraft.clientId" autocomplete="off" />
                </label>
                <label>
                  <span>Client Secret</span>
                  <input v-model="oidcDraft.clientSecret" type="password" autocomplete="off" placeholder="只写不读" />
                </label>
                <label>
                  <span>Redirect URI</span>
                  <input v-model="oidcDraft.redirectUri" autocomplete="off" />
                </label>
              </div>
              <label class="json-editor">
                <span>Allowed Domains</span>
                <textarea v-model="oidcAllowedDomainsText" rows="3" />
              </label>
              <label class="json-editor">
                <span>Role Mapping JSON</span>
                <textarea v-model="oidcRoleMappingText" rows="4" spellcheck="false" />
              </label>
              <button
                class="tool-button"
                type="button"
                :disabled="busyKey === 'auth:oidc'"
                @click="saveOidcConfig"
              >
                {{ busyKey === "auth:oidc" ? "保存中" : "保存 OIDC" }}
              </button>
            </section>

            <section class="module-panel">
              <div class="module-panel-heading">
                <strong>会话与审计</strong>
                <span>{{ authSessions.length }} 个会话 / {{ authAudit.length }} 条审计</span>
              </div>
              <div class="job-table compact-job-table drawer-auth-table">
                <div class="job-table-header">
                  <span>会话</span>
                  <span>用户</span>
                  <span>操作</span>
                </div>
                <div v-for="session in authSessions" :key="String(session.sessionId)" class="job-row">
                  <span>{{ session.sessionId }}</span>
                  <span>{{ session.username }} / {{ session.roleId }}</span>
                  <button
                    class="table-action"
                    type="button"
                    :disabled="busyKey === `auth:session:${session.sessionId}`"
                    @click="revokeConsoleSession(String(session.sessionId))"
                  >
                    撤销
                  </button>
                </div>
              </div>
              <div class="job-table compact-job-table audit-table">
                <div class="job-table-header">
                  <span>时间</span>
                  <span>操作</span>
                  <span>结果</span>
                </div>
                <div v-for="item in authAudit" :key="item.auditId" class="job-row">
                  <span>{{ formatCompactDate(item.createdAt) }}</span>
                  <span>{{ item.username || "system" }} / {{ item.operationId || item.action }}</span>
                  <span>{{ item.status }} {{ item.error }}</span>
                </div>
              </div>
            </section>
          </template>

          <div v-else class="empty-state">
            <strong>权限不足</strong>
            <span>需要 auth:admin 权限才能管理用户、OIDC、会话和审计。</span>
          </div>
        </section>

        <section v-else-if="drawerTab === 'modules'" class="drawer-panel">
          <div class="panel-header">
            <h4>模块管理</h4>
            <p>运行代次 {{ consoleState?.runtime.mountGeneration || 0 }}，可用 {{ enabledMountCount }}/{{ totalMountCount }}</p>
          </div>

          <div class="drawer-actions">
            <button
              class="tool-button tool-button-ghost"
              type="button"
              :disabled="busyKey === 'module-reload'"
              @click="reloadModules"
            >
              {{ busyKey === "module-reload" ? "重载中" : "重载模块" }}
            </button>
            <button
              class="tool-button"
              type="button"
              :disabled="busyKey === 'mounts'"
              @click="saveMountModules"
            >
              {{ busyKey === "mounts" ? "保存中" : "保存配置" }}
            </button>
          </div>

          <section
            v-for="group in moduleGroups"
            :key="group.id"
            class="module-panel"
          >
            <div class="module-panel-heading">
              <strong>{{ group.label }}</strong>
              <span>{{ group.description }}</span>
            </div>

            <article
              v-for="item in group.rows"
              :key="item.name"
              class="mount-config-item drawer-mount-item"
              :data-enabled="item.externalEnabled"
            >
              <div class="mount-config-main">
                <div class="mount-config-heading">
                  <strong>{{ item.label }}</strong>
                  <span class="module-state-pill" :data-enabled="item.externalEnabled">
                    <span class="state-dot" />
                    {{ moduleAvailabilityLabel(item) }}
                  </span>
                </div>
                <p>{{ item.description }}</p>
                <dl class="module-status-list">
                  <div>
                    <dt>运行实例</dt>
                    <dd>{{ item.runtimeMount?.id || "未加载" }}</dd>
                  </div>
                  <div>
                    <dt>能力</dt>
                    <dd>{{ moduleCapabilityText(item) }}</dd>
                  </div>
                  <div>
                    <dt>运行状态</dt>
                    <dd>{{ moduleStatusText(item) }}</dd>
                  </div>
                </dl>
              </div>

              <div class="mount-config-controls">
                <label class="module-field">
                  <span>模块路径</span>
                  <div class="path-field">
                    <input
                      v-model="mountDraft[item.name]"
                      autocomplete="off"
                      :disabled="!isMountPathEditing(item.name)"
                      :placeholder="currentModulePathPlaceholder(item)"
                    />
                    <BrowseSelectButton
                      kind="server-file"
                      button-class="path-action-button"
                      button-text="浏览"
                      size="small"
                      :disabled="!canBrowseServerPaths"
                      plain
                      @browse="openMountPathPicker(item.name)"
                    />
                  </div>
                </label>
                <button
                  class="tool-button tool-button-ghost compact-action"
                  type="button"
                  :disabled="busyKey === `mount:${item.name}`"
                  @click="toggleMountPathEdit(item)"
                >
                  {{ isMountPathEditing(item.name) ? "确认" : "修改" }}
                </button>
              </div>
            </article>
          </section>
        </section>
      </div>
    </aside>

    <div
      v-if="agentEvidencePreviewOpen"
      class="agent-evidence-preview-backdrop"
      @click.self="closeAgentEvidencePreview"
    >
      <section class="agent-evidence-preview-dialog" role="dialog" aria-modal="true" aria-label="证据预览">
        <div class="agent-evidence-preview-header">
          <div>
            <h3>{{ selectedEvidenceDisplayTitle }}</h3>
            <span v-if="selectedEvidenceId">{{ selectedEvidenceId }}</span>
          </div>
          <button
            class="tool-button tool-button-ghost compact-action"
            type="button"
            @click="closeAgentEvidencePreview"
          >
            关闭
          </button>
        </div>

        <template v-if="selectedEvidence">
          <section class="evidence-text agent-evidence-preview-body">
            <div class="evidence-text-heading">
              <h4>原始文件</h4>
              <span>{{ evidenceReadableKind }}</span>
            </div>
            <div class="evidence-rendered-content" v-html="evidenceReadableHtml"></div>
          </section>
          <details class="advanced-config evidence-source-details">
            <summary>来源定位</summary>
            <dl class="meta-list evidence-summary-list">
              <div
                v-for="item in evidenceSourceDetails()"
                :key="item.label"
              >
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </div>
            </dl>
          </details>
        </template>
        <div v-else-if="evidenceLoadError" class="knowledge-preview-empty evidence-preview-error">
          <strong>证据无法打开</strong>
          <span>{{ evidenceLoadError }}</span>
          <button
            class="tool-button tool-button-ghost compact-action"
            type="button"
            :disabled="!selectedEvidenceId || busyKey.startsWith('knowledge:evidence:')"
            @click="selectedEvidenceId ? openAgentEvidencePreview(selectedEvidenceId) : undefined"
          >
            重试
          </button>
        </div>
        <div v-else class="knowledge-preview-empty">
          <strong>{{ busyKey.startsWith("knowledge:evidence:") ? "正在加载证据" : "没有证据内容" }}</strong>
          <span>{{ busyKey.startsWith("knowledge:evidence:") ? "正在打开来源。" : "暂未选择来源。" }}</span>
        </div>
      </section>
    </div>

    <div v-if="pathPicker.open" class="path-picker-backdrop" @click.self="closeServerPathPicker">
      <section class="path-picker-dialog" role="dialog" aria-modal="true" :aria-label="pathPicker.title">
        <div class="path-picker-header">
          <div>
            <h3>{{ pathPicker.title }}</h3>
            <p>选择服务端可访问的{{ pathPickerModeLabel(pathPicker.mode) }}路径。</p>
          </div>
          <button class="tool-button tool-button-ghost compact-action" type="button" @click="closeServerPathPicker">
            关闭
          </button>
        </div>

        <div class="path-picker-roots">
          <button
            v-for="root in pathPicker.response?.roots || []"
            :key="root.path"
            class="table-action"
            type="button"
            @click="refreshServerPathBrowser(root.path)"
          >
            {{ root.label }}
          </button>
        </div>

        <div class="path-picker-toolbar">
          <input :value="pathPicker.response?.currentPath || pathPicker.value" readonly />
          <button
            class="tool-button tool-button-ghost compact-action"
            type="button"
            :disabled="!pathPicker.response?.parentPath"
            @click="refreshServerPathBrowser(pathPicker.response?.parentPath)"
          >
            上一级
          </button>
          <button class="tool-button tool-button-ghost compact-action" type="button" @click="refreshServerPathBrowser()">
            刷新
          </button>
          <label class="inline-check">
            <input
              v-model="pathPicker.includeHidden"
              type="checkbox"
              @change="refreshServerPathBrowser()"
            />
            <span>显示隐藏项</span>
          </label>
        </div>

        <p v-if="pathPicker.extensions.length" class="module-note">
          只显示可选文件类型：{{ pathPicker.extensions.join(", ") }}
        </p>
        <p v-if="pathPicker.error" class="module-note danger-note">{{ pathPicker.error }}</p>
        <p v-if="pathPicker.response?.truncated" class="module-note">
          当前目录内容较多，只显示前 600 项。
        </p>

        <div class="path-picker-list">
          <article
            v-for="entry in pathPicker.response?.entries || []"
            :key="entry.path"
            class="path-picker-entry"
            :data-selectable="entry.selectable"
          >
            <div>
              <strong>{{ entry.type === "directory" ? "目录" : "文件" }} · {{ entry.name }}</strong>
              <span>{{ entry.path }}</span>
              <small>{{ pathEntryMeta(entry) }}</small>
            </div>
            <div class="path-picker-entry-actions">
              <button
                v-if="entry.browsable"
                class="tool-button tool-button-ghost compact-action"
                type="button"
                @click="openPathEntry(entry)"
              >
                打开
              </button>
              <button
                v-if="entry.selectable"
                class="tool-button compact-action"
                type="button"
                @click="selectServerPath(entry.path)"
              >
                选择
              </button>
            </div>
          </article>
          <div v-if="!pathPicker.loading && (pathPicker.response?.entries || []).length === 0" class="empty-state">
            <strong>没有可显示的项目</strong>
            <span>可以切换根目录、上一级目录，或显示隐藏项。</span>
          </div>
          <div v-if="pathPicker.loading" class="empty-state">
            <strong>正在读取目录</strong>
            <span>请稍候。</span>
          </div>
        </div>

        <div class="path-picker-footer">
          <button
            v-if="pathPicker.mode === 'directory'"
            class="primary-action"
            type="button"
            :disabled="!pathPicker.response?.currentPath"
            @click="selectServerPath(pathPicker.response?.currentPath || '')"
          >
            选择当前目录
          </button>
          <button class="tool-button tool-button-ghost" type="button" @click="closeServerPathPicker">
            取消
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
