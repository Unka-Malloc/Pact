import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  viewToPath,
  adminSectionToSlug,
  slugToAdminView,
  knowledgeRouteTabToViewTab,
} from "../router/routes";
// Note: common components are NOT imported here — that would create a circular
// dependency (components → useConsole → components). Each view imports the
// component files it needs directly.
import { bridge, type McpAuthorizationRequest } from "../lib/bridge";
import { createKnowledgeUploadSession } from "../lib/knowledge-upload-session";
import {
  base64ToBytes,
  decodeBytes,
  decodeMimeWords,
  decodeMimeBody,
  decodeQuotedPrintableToBytes,
  emailHeaderValue,
  escapeRegexText,
  escapeHtmlText,
  extractEmailRenderablePart,
  evidenceIdFromHref,
  evidenceRefHref,
  extractEvidenceRefsFromText,
  linkifyEvidenceRefsInMarkdown,
  markdownToSafeHtml,
  normalizeCharset,
  parseEmailHeaders,
  parseHeaderParams,
  plainTextToHtml,
  safeLinkHref,
  safeMediaSrc,
  sanitizeHtmlContent,
  splitMimeParts,
  uniqueEvidenceRefs,
} from "../lib/rendering";
import {
  adminViewTitleMap,
  debugTabs,
  emptyDiscovery,
  emptyExpertVocabulary,
  emptySettings,
  intelligentModuleDefinitions,
  jobStatusLabels,
  knowledgeTabs,
  migrationStateLabels,
  modelLibraryProviderDefinitions,
  moduleGroupDefinitions,
  moduleNameDescriptions,
  moduleNameLabels,
  viewTitleMap,
} from "./console-defaults";
import {
  CLEAR_LOCAL_STATE_PARAM,
  clearBrowserCacheStorage,
  clearBrowserLocalStateFromUrl as clearBrowserLocalStateFromUrlCore,
  clearIndexedDbDatabases,
  unregisterServiceWorkers,
} from "./console-browser-state-utils";
import {
  copyTextToClipboard,
  csvCell,
  downloadTextFile,
  formatBytes,
  formatCompactDate,
  formatDate,
  formatDuration,
  formatMachineDate,
  jobStatusTone,
  parseFilterDate,
  parseTime,
  safeDownloadName,
} from "./console-format-utils";
import {
  sourceDownloadStatusLabel,
  sourceIndexStatusLabel,
  sourceJobProgress,
  sourceSyncLabel,
  sourceSyncTone,
  traceProgressPercent,
  uploadTraceDetailText,
  uploadTraceTone,
} from "./console-knowledge-source-utils";
import {
  jaccardSimilarity,
  knowledgeReviewCanResolveWithDocument,
  knowledgeReviewCurrentDocuments,
  knowledgeReviewDetailText,
  knowledgeReviewDocumentLine,
  knowledgeReviewFusionPrompt,
  knowledgeReviewIncomingDocument,
  knowledgeReviewPrimaryCurrentDocument,
  knowledgeReviewReasonLabel,
  knowledgeReviewRecordPreview,
  knowledgeReviewResolvedAction,
  knowledgeReviewSimilarity,
  knowledgeReviewSourceLabel,
  knowledgeReviewStatusLabel,
  knowledgeReviewTitle,
  knowledgeReviewTone,
  tokenizeKnowledgeReviewText,
} from "./console-knowledge-review-utils";
import {
  candidateTextFromRecord,
  compactReadableText,
  emailSubjectFromText,
  evidenceDisplayTitle,
  htmlMetaHeader,
  htmlToReadableText,
  knowledgeFusionSummary,
  knowledgeResultAssetCount,
  knowledgeResultEvidenceId,
  knowledgeResultHierarchyPath,
  knowledgeResultScore,
  knowledgeResultSnippet,
  knowledgeResultTitle,
  normalizeSearchResults,
  readableSnippetFromText,
} from "./console-knowledge-search-utils";
import {
  assetIdsEmbeddedInHtml,
  decodeURIComponentSafe,
  evidenceAssetHintValues,
  isHiddenEmailElement,
  isImageAsset,
  normalizeAssetReference,
  normalizeCidToken,
  normalizeRenderedText,
  renderedHtmlHasBlocks,
} from "./console-evidence-utils";
import {
  AGENT_EXPLORE_STORAGE_KEY,
  agentExploreEventLabel,
  agentExploreEventStatus,
  agentExploreHistorySortValue,
  agentExplorePhaseLabel,
  agentExploreResultKey,
  agentExploreRunStatus,
  agentExploreStepSummary,
  agentExploreTabMeta,
  agentExploreTabTitle,
  isAgentExploreDraftSession,
  normalizeAgentExploreRun,
  readAgentExplorePersistence,
  shortId,
  writeAgentExplorePersistence,
  type AgentExploreFormState,
} from "./console-agent-explore-utils";
import { createConsoleAuthController } from "./console-auth-controller";
import { createConsoleAgentExploreSessionController } from "./console-agent-explore-session-controller";
import { createConsoleKnowledgeSourceController } from "./console-knowledge-source-controller";
import { createConsolePathPickerController } from "./console-path-picker-controller";
import { createConsoleRuntimeMountController } from "./console-runtime-mount-controller";
import { createConsoleDashboardAlertController } from "./console-dashboard-alert-controller";
import { createConsoleInfoFeedController } from "./console-info-feed-controller";
import { createConsoleKnowledgeEvidenceController } from "./console-knowledge-evidence-controller";
import { createConsoleKnowledgeRecallController } from "./console-knowledge-recall-controller";
import { createConsoleModelLibraryController } from "./console-model-library-controller";
import { createConsoleToolManagementController } from "./console-tool-management-controller";
import { createConsoleWordCloudController } from "./console-word-cloud-controller";

export const consoleKnowledgeGovernanceContract = Object.freeze({
  knowledgeBase: "knowledgeBase",
  runtimeMountActions: ["saveRuntimeMounts", "reloadRuntimeMounts", "enableMountModule", "disableMountModule"],
  uploadFlow: "async function uploadFilesToKnowledge() -> createKnowledgeUploadSession(filesToUpload -> bridge.createJob({",
});

import {
  asRecord,
  modelAgentUid,
  modelEntryParameters,
  modelEntryStringField,
  moduleAgentProfileJson,
  normalizeAgentLocalCommandsForDraft,
  normalizeAgentModuleAccess,
  normalizeAgentPermissionGroupDraft,
  normalizeAgentPermissionGroupsDraft,
  normalizeModelLibraryEntries,
  normalizeModuleAgentProfile,
  normalizeModuleAgentProfilesForDraft,
  redactAgentModelEntryForExport,
  redactedProviderSettingsForAgentExport,
} from "./console-model-utils";
import {
  analysisExecutionModeLabel,
  analysisModuleDescriptionForModule,
  backgroundProcessLabel,
  backgroundProcessTone,
  clientRuntimeCoolingLabel,
  clientRuntimeCoolingTone,
  clientRuntimeHeatStyle,
  clientRuntimeReasonLabel,
  clientRuntimeSurfaceText,
  clientRuntimeTaskText,
  maintenanceAgentRiskLabel,
  maintenanceAgentStatusLabel,
  maintenanceAgentStatusTone,
  migrationProgress,
  migrationTone,
  monitorAlertSeverityLabel,
  monitorAlertSeverityTone,
  processRelationText,
  processTypeLabel,
  queueLifecycleLabel,
  queueLifecycleTone,
  queueMonitorDetail,
  queueSourceLabel,
} from "./console-status-utils";
import type {
  AgentSettings,
  AgentModelConfig,
  AgentModuleAccess,
  AgentSelectorOption,
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
  ExpertVocabulary,
  ExpertVocabularyEntry,
  KnowledgeConfigSchema,
  KnowledgeConsoleState,
  KnowledgeIngestTarget,
  KnowledgeIngestTargetKind,
  KnowledgeReviewItem,
  KnowledgeRuleAuthoringResponse,
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
  KnowledgeSource,
  KnowledgeSourceState,
  KnowledgeWordCloudSet,
  MaintenanceAgentConfig,
  MaintenanceAgentRun,
  MaintenanceSettings,
  MonitorAlertState,
  ModelProbeResponse,
  ModuleAgentProfile,
  NormalizedDocumentsManifest,
  ProtocolEvent,
  QueueMonitorItem,
  ServerConsoleState,
  SplitJob,
  SplitJobStatus,
  UnifiedRegistrationRecord,
} from "../lib/types";
import type {
  DrawerTab, AppView, AdminView, DebugTab, RuleAuthoringMode,
  KnowledgeTab, KnowledgeManagementPanel, OptionBarValue, OptionBarOption,
  KnowledgeLogRow, AgentExploreSession, KnowledgeRecallDebugRun,
  HistorySessionPanelItem, ModelEntryBinding, AgentConfigurationAlert,
  DashboardAlert, WorkQueueRow, PathPickerMode,
  RefreshStateOptions, CloudProvider,
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

const consoleState = ref<ServerConsoleState | null>(null);
const serverAvailable = ref(false);
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
    if (tab.id === "knowledgeDistillation") {
      return hasFeature("knowledge-distillation");
    }
    return true;
  })
);
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
const filter = ref("");
const drawerOpen = ref(false);
const drawerTab = ref<DrawerTab>("discovery");
const sideNavOpen = ref(false);
const currentView = ref<AppView>("dashboard");
const adminView = ref<AdminView>("jobs");
const highlightedConfigTarget = ref("");
const clientSearchQuery = ref("");
const clientStateFilter = ref<ClientMigrationState | "all">("all");
const editingMountPaths = ref<Record<string, boolean>>({});
const authState = ref<ConsoleAuthSummary | null>(null);
const authBootstrapping = ref(true);
const loginForm = ref({ username: "", password: "" });
const authUsers = ref<ConsoleUser[]>([]);
const authAudit = ref<ConsoleAuditItem[]>([]);
const authSessions = ref<Array<Record<string, unknown>>>([]);
const mcpAuthorizationRequests = ref<McpAuthorizationRequest[]>([]);
const mcpAuthorizationStatus = ref<"all" | "pending" | "approved" | "rejected">("pending");
const mcpAuthorizationStatusOptionBarOptions = [
  { value: "pending", label: "待审批" },
  { value: "approved", label: "已批准" },
  { value: "rejected", label: "已拒绝" },
  { value: "all", label: "所有" }
];
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
const knowledgeMaintenanceDraft = ref<MaintenanceSettings>({});
const maintenanceJson = ref("{}");
const knowledgeSearchForm = ref({
  query: "",
});
const knowledgeRecallDebugForm = ref({
  query: "",
  targetId: "internal:global",
  retrievalMode: "hybrid",
  keywordOnly: false,
  learningEnabled: true,
  explain: true,
});
const knowledgeRecallBackendSpacesResult = ref<Record<string, unknown> | null>(null);
const knowledgeRecallDebugRuns = ref<KnowledgeRecallDebugRun[]>([]);
const agentExploreForm = ref<AgentExploreFormState>({
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
  kind: 120,
  target: 220,
  status: 112,
  stage: 150,
  progress: 80,
  time: 122,
  detail: 220,
  error: 180,
};
const knowledgeLogColumnWidths = ref<Record<KnowledgeLogColumnKey, number>>({
  kind: 120,
  target: 220,
  status: 112,
  stage: 150,
  progress: 80,
  time: 122,
  detail: 220,
  error: 180,
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
const {
  agentEvidencePreviewOpen,
  assetUrlForReference,
  closeAgentEvidencePreview,
  emailToSafeHtml,
  embedEvidenceAssets,
  evidenceAssets,
  evidenceLoadError,
  evidenceLoadSequence,
  evidenceMainText,
  evidencePrimaryText,
  evidenceReadableHtml,
  evidenceReadableKind,
  evidenceReadableKindLabel,
  evidenceReasonText,
  evidenceSourceDetails,
  evidenceSourceHint,
  handleAgentAnswerClick,
  hydrateSearchResultPreview,
  imageEvidenceAssets,
  loadEvidence,
  openAgentEvidencePreview,
  openKnowledgeSearchResult,
  renderEmailFrame,
  renderEmailImage,
  renderEmailNode,
  renderEvidenceImageGallery,
  renderEvidenceReadableHtml,
  renderReadableHtmlDocument,
  rewriteInlineAssetRefs,
  safeEmailImageSrc,
  sanitizeEmailCssUrls,
  sanitizeEmailFrameDocument,
  selectedEvidence,
  selectedEvidenceBlocks,
  selectedEvidenceDisplayTitle,
  selectedEvidenceDocument,
  selectedEvidenceId,
  selectedEvidencePayload,
  selectedEvidenceSection,
} = createConsoleKnowledgeEvidenceController({
  busyKey,
  clearAllBusy,
  currentAgentExploreQuery,
  error,
  infoFeedQuery: () => infoFeedCurrentRun.value?.query || "",
  knowledgeSearchResults,
  agentExploreContextBuildRecordId: () =>
    String(asRecord(agentExploreResult.value?.contextPack)?.contextBuildRecordId || ""),
  openDebugTab,
  recordFeedback: recordConsoleKnowledgeFeedback,
  setBusy,
});
const ingestFiles = ref<File[]>([]);
const ingestProgress = ref("");
const ingestJob = ref<SplitJob | null>(null);
const knowledgeIngestTargets = ref<Record<KnowledgeIngestTargetKind, boolean>>({
  global: true,
  external: false,
  team: false,
  user: false,
});
const knowledgeIngestExternalProvider = ref("dify");
const knowledgeIngestExternalRefs = ref("");
const knowledgeIngestExternalTargetLabels = ref<Record<string, string>>({});
const knowledgeIngestTeamRefs = ref("");
const knowledgeIngestUserRefs = ref("");
const uploadTraceEvents = ref<ProtocolEvent[]>([]);
const normalizedManifest = ref<NormalizedDocumentsManifest | null>(null);
const {
  activeKnowledgeSources,
  addKnowledgeSource,
  applyJobToKnowledgeSources,
  applyKnowledgeSourceState,
  applyLocalSourceDirectoryPath,
  deleteKnowledgeSource,
  directoryNameFromPath,
  localSourceForm,
  refreshKnowledgeSource,
  refreshKnowledgeSources,
  syncLocalSourceLabelFromPath,
  updateKnowledgeSource,
} = createConsoleKnowledgeSourceController({
  clearAllBusy,
  error,
  ingestJob,
  knowledgeConsole,
  knowledgeSourceState,
  setBusy,
});
const {
  closeServerPathPicker,
  confirmServerPathPicker,
  openPathEntry,
  openServerPathPicker,
  pathEntryMeta,
  pathPicker,
  pathPickerModeLabel,
  refreshServerPathBrowser,
  selectServerPath,
} = createConsolePathPickerController({
  formatBytes,
  formatCompactDate,
});
const {
  analysisModuleDescription,
  currentAnalysisModule,
  currentModulePathPlaceholder,
  enabledMountCount,
  isMountPathEditing,
  moduleAvailabilityLabel,
  moduleCapabilityText,
  moduleEnabledLabel,
  moduleGroups,
  moduleRows,
  moduleStatusText,
  openMountPathPicker,
  toggleMountPathEdit,
  totalMountCount,
} = createConsoleRuntimeMountController({
  consoleState,
  editingMountPaths,
  mountDraft,
  openServerPathPicker,
  saveMountModules,
  settingsDraft,
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
      functionCallSchema:
        settings.agentToolExecution?.functionCallSchema ||
        emptySettings.agentToolExecution.functionCallSchema,
      http: {
        ...emptySettings.agentToolExecution.http,
        ...(settings.agentToolExecution?.http || {}),
      },
      local: {
        ...emptySettings.agentToolExecution.local,
        ...(settings.agentToolExecution?.local || {}),
        commands: normalizeAgentLocalCommandsForDraft(settings),
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
function agentExploreDefaults() {
  return {
    temperature: agentExploreConfiguredTemperature.value,
    maxTokens: agentExploreConfiguredMaxTokens.value,
    maxIterations: agentExploreConfiguredMaxIterations.value,
    limit: agentExploreConfiguredLimit.value,
    toolChoice: agentExploreConfiguredToolChoice.value,
  };
}
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

async function clearBrowserLocalStateFromUrl() {
  return clearBrowserLocalStateFromUrlCore({
    clearMemoryCaches: clearInfoFeedKeywordCache,
  });
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
  if (currentView.value === "dashboard") {
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
    return applyWordCloudEvent(wordBagSet);
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

const {
  addModelEntryBinding,
  addModelProvider,
  addModuleAgentProfileFromDraft,
  addableModelProviders,
  agentExploreModelOptionLabel,
  agentModelAssignmentOptions,
  collectModelEntryBindings,
  customHttpAdapterAlias,
  customHttpAdapterLabel,
  duplicateModelEntry,
  ensureModuleAgentGroup,
  ensureModuleAgentProfile,
  hasOpenAiModelUsage,
  isModelLibraryCardExpanded,
  modelEntryBindingSummary,
  modelEntryBindings,
  modelEntryBindingsByKey,
  modelEntryAllowsModule,
  modelEntryConfigured,
  modelEntryIsBound,
  modelEntryMatchesAssignment,
  modelEntryMatchesUid,
  modelEntryModuleAccess,
  modelEntryProbeResult,
  modelEntryProbeStatusLabel,
  modelEntryProbeStatusTone,
  modelEntryStatusKey,
  modelEntryStatusLabel,
  modelEntryStatusTone,
  modelEntryUidSet,
  modelProbeFailureResult,
  modelProbeSettingsForEntry,
  modelProviderDefinition,
  modelProviderFromRef,
  modelRef,
  moduleAgentProfileRows,
  moduleModelAssignmentOptions,
  moduleModelAssignmentStats,
  moduleModelRef,
  moduleNeedsIntelligence,
  parseModelRef,
  probeModelEntry,
  probeModelLibraryBeforeSave,
  providerConfigured,
  providerLabel,
  providerStatusLabel,
  providerStatusTone,
  removeModelProvider,
  removeModuleAgentProfile,
  runModelEntryProbe,
  setModelEntryModuleAccessMode,
  setModuleAgentProfileEnabled,
  setModuleModelRef,
  setModuleNeedsIntelligence,
  toggleModelEntryModuleAccess,
  toggleModelLibraryCard,
  visibleModelEntries,
  visibleModelProviders,
} = createConsoleModelLibraryController({
  agentExploreModelAlias: () => agentExploreForm.value.modelAlias,
  codexOAuthStatus,
  clearAllBusy,
  currentAgentModelOptionLabel,
  ensureCodexOAuthReady,
  error,
  infoFeedModelAlias: () => infoFeedForm.value.modelAlias,
  infoFeedRunningSummary: () => ({
    modelAlias: infoFeedCurrentRun.value?.summary.modelAlias,
    runId: infoFeedCurrentRun.value?.runId,
    status: infoFeedCurrentRun.value?.summary.status,
  }),
  modelLibraryExpandedCards,
  modelProbeResults,
  moduleAgentCandidateDrafts,
  normalizeModelEntry,
  replaceSettingsDraftFromServer,
  ruleAuthoringModelAlias: () => ruleAuthoringForm.value.modelAlias,
  selectedModelProvider,
  setBusy,
  settingsDraft,
  settingsPayloadForSave,
});

const {
  activeToolManagementToolCount,
  addAgentPermissionGroup,
  agentPermissionGroupOptionBarOptions,
  agentPermissionGroups,
  copyIssuedToolToken,
  createGrant,
  defaultAgentPermissionGroups,
  deleteGrant,
  enabledToolGrantCount,
  ensureAgentPermissionGroupsDraft,
  grantHasScope,
  grantHasToolset,
  grantToolRuleState,
  internalToolManagementToolCount,
  issuedToolToken,
  newGrantLabel,
  newGrantScopes,
  newGrantToolsets,
  permissionGroupHasScope,
  permissionGroupHasToolset,
  permissionGroupLabel,
  policyPreviewGrant,
  policyPreviewGrantId,
  policyPreviewProfileId,
  policyPreviewProfileOptionBarOptions,
  policyPreviewResult,
  policyPreviewToolId,
  policyPreviewToolOptionBarOptions,
  previewToolDefinition,
  previewToolPolicy,
  profileLabel,
  refreshToolManagement,
  removeAgentPermissionGroup,
  rotateGrant,
  scopeLabel,
  selectToolForManagement,
  selectedToolManagementTool,
  selectedToolManagementToolId,
  setGrantToolRule,
  setModelEntryPermissionGroup,
  toggleGrantScope,
  toggleGrantToolset,
  toggleNewGrantScope,
  toggleNewGrantToolset,
  togglePermissionGroupScope,
  togglePermissionGroupToolset,
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
  updateGrant,
} = createConsoleToolManagementController({
  clearAllBusy,
  error,
  setBusy,
  settingsDraft,
  visibleModelEntries,
});

const knowledgeManagementPanelOptionBarOptions = computed<OptionBarOption[]>(() => [
  { value: "knowledge", label: "知识" },
  { value: "rules", label: "规则" },
]);

function selectKnowledgeManagementPanel(panel: OptionBarValue) {
  if (panel === "knowledge" || panel === "rules") {
    knowledgeManagementPanel.value = panel;
  }
}
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
const {
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
} = createConsoleKnowledgeRecallController({
  activeKnowledgeSources,
  canReadKnowledge,
  clearAllBusy,
  clearSelectedEvidence: () => {
    selectedEvidence.value = null;
    selectedEvidenceId.value = "";
  },
  error,
  knowledgeConsole,
  knowledgeMaintenanceDraft,
  knowledgeRecallBackendSpacesResult,
  knowledgeRecallDebugForm,
  knowledgeRecallDebugRuns,
  knowledgeSearchForm,
  knowledgeSearchResponse,
  knowledgeSearchResults,
  lastKnowledgeSearchQuery,
  loadEvidence,
  openDebugTab,
  setBusy,
});
const {
  logoutConsole,
  refreshAuthAdmin,
  refreshAuthState,
  revokeConsoleSession,
  saveOidcConfig,
  submitLoginAuth,
  updateConsoleUser,
  updateConsoleUserRole,
  updateConsoleUserRoleFromEvent,
} = createConsoleAuthController({
  authAudit,
  authBootstrapping,
  authSessions,
  authState,
  authUsers,
  canAdminAuth,
  clearAllBusy,
  consoleState,
  error,
  loginForm,
  oidcAllowedDomainsText,
  oidcDraft,
  oidcRoleMappingText,
  refreshState,
  resetServerEventCursor: () => {
    serverEventCursor = 0;
  },
  setBusy,
  startServerEventSubscription,
  stopServerEventSubscription,
});
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
const pendingKnowledgeReviewCount = computed(() => {
  const loadedPending = knowledgeReviewItems.value.filter((item: any) => item.status === "pending").length;
  const healthCounts = asRecord(knowledgeConsole.value?.health?.counts) || {};
  return loadedPending || Number(healthCounts.pendingReviewItems || 0);
});

function knowledgeTabDisplayLabel(tab: { id: KnowledgeTab; label: string }) {
  return tab.label;
}

function knowledgeConfigGroupDescription(groupId: string) {
  switch (groupId) {
    case "retrieval":
      return "";
    case "learning":
      return "已接入反馈学习闭环，控制检索 profile 的候选生成、评估、灰度和自动发布边界。";
    case "maintenance":
      return "";
    case "embeddingModel":
      return "";
    default:
      return "服务端暴露的知识库配置组。";
  }
}

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

const agentExploreAgentOptions = computed(() => agentOptionsForModule("agentTools"));
const ruleAuthoringModelOptions = computed(() => agentSelectorOptions.value);

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
const {
  addChildWordCloud,
  addManualWordCloud,
  addTermActionToCloud,
  addTermInputToCloud,
  addTermToCloud,
  addWordCloudCorpusPaths,
  applySavedWordCloudSet,
  applyWordCloudEvent,
  autoFillCloudWithAgent,
  clearRemovedTermsFromCloud,
  clearWordCloudCorpusPaths,
  cloneWordCloudSet,
  collapsedWordBagIds,
  createDefaultWordCloudSet,
  fillingWordBagIds,
  findWordCloudInTree,
  flattenWordCloudCards,
  formatWordCloudThreshold,
  mutateWordCloudDraft,
  normalizeWordCloudCloudForUi,
  normalizeWordCloudCorpusPathForUi,
  normalizeWordCloudCorpusPathsForUi,
  normalizeWordCloudSetForUi,
  normalizeWordCloudTermForUi,
  persistWordCloudCorpusPaths,
  pinWordCloud,
  pinnedWordBagIds,
  preferredWordCloudCorpusPaths,
  proposeWordCloud,
  refreshWordCloud,
  refreshWordCloudCorpusTerms,
  removeSelectedWordCloud,
  removeTermFromCloud,
  removeWordCloudCorpusPath,
  resolveWordCloudCorpusPathsForQuery,
  saveWordCloud,
  selectWordCloud,
  selectedWordBagId,
  selectedWordCloud,
  selectedWordCloudModel,
  setWordCloudDraftCorpusPaths,
  setWordCloudDraftFromState,
  setWordCloudTermInput,
  toggleWordCloudActionMenu,
  toggleWordCloudCollapsed,
  updateSelectedWordCloudField,
  updateWordCloudField,
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
} = createConsoleWordCloudController({
  agentSelectorOptions,
  busyKey,
  canReadKnowledge,
  canWriteKnowledge,
  clearAllBusy,
  error,
  setBusy,
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
    agentExploreForm.value.contextProfileId ||
      settingsDraft.value.agentExploreDefaults?.contextProfileId ||
      "context-128k",
  ).trim();
  const selected = agentExploreContextWindowOptions.find(
    (item) => item.value === configured,
  );
  return selected || agentExploreContextWindowOptions[1];
});
const {
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
} = createConsoleInfoFeedController({
  agentExploreConfiguredLimit,
  agentExploreConfiguredMaxIterations,
  agentExploreContextWindowOptions,
  agentExploreForm,
  agentExploreThinkingModeOptions,
  agentSelectorOptions,
  canReadKnowledge,
  contextProfileRows,
  error,
  recordFeedback: recordConsoleKnowledgeFeedback,
  settingsDraft,
});
const selectedKnowledgeReviewFusionModel = computed(() => {
  return selectedAgentFromOptions(
    agentSelectorOptions.value,
    settingsDraft.value.agentExploreDefaults?.reviewFusionModelAlias,
  );
});
watchAgentSelectionReference(
  "info-feed-summary",
  "信息流智能体",
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
const {
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
} = createConsoleAgentExploreSessionController({
  agentExploreActiveTabId,
  agentExploreClosedTabIds,
  agentExploreDraftTabs,
  agentExploreForm,
  agentExploreHiddenRunIds,
  agentExploreHistory,
  agentExploreHydrated,
  agentExploreResult,
  agentExploreTraceOpen,
  agentExploreDefaults,
  busyKey,
  clearAllBusy,
  error,
  hasAgentModelOption,
  normalizeThinkingMode: normalizedAgentExploreThinkingMode,
  selectedAgentExploreContextProfile,
  selectedAgentExploreThinkingMode,
  setBusy,
  validAgentModelAlias,
});
watch(
  agentSelectorOptions,
  (options) => {
    cacheAgentModelOptionLabels(options);
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

function hasScope(scopeId: string) {
  return isAuthenticated.value && currentUserScopes.value.includes(scopeId);
}

function jsonPreview(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function agentExploreStepOpen(step: unknown) {
  const value = asRecord(step) || {};
  const status = agentExploreRunStatus(agentExploreResult.value);
  return (
    status === "running" &&
    Number(value.iteration || 0) === agentExploreActiveIteration.value
  );
}

function agentExploreEventTime(event: unknown) {
  const value = asRecord(event) || {};
  return formatCompactDate(String(value.createdAt || ""));
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
    note: "导出的是当前智能体仓库配置；密钥和 Token 字段已脱敏，未包含其它智能体仓库配置。",
    model: redactAgentModelEntryForExport(normalizedEntry),
    providerSettings: redactedProviderSettingsForAgentExport(normalizedEntry, payload, {
      codexOAuthConfigured: Boolean(codexOAuthStatus.value?.valid),
    }),
  };
  downloadTextFile(
    `pact-agent-${safeDownloadName(normalizedEntry.label || modelEntryStatusKey(normalizedEntry), "model")}-${timestamp}.json`,
    `${JSON.stringify(exportPayload, null, 2)}\n`,
    "application/json;charset=utf-8",
  );
  error.value = "";
}

function selectKnowledgeReviewItem(row: KnowledgeReviewItem) {
  selectedKnowledgeReviewId.value = String(row.reviewId || "");
}

function knowledgeReviewRowClassName({ row }: { row: KnowledgeReviewItem }) {
  return row.reviewId === selectedKnowledgeReviewId.value ? "is-selected-review-row" : "";
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

function splitJobStatusLabel(status?: string) {
  return jobStatusLabels[status as SplitJobStatus] || status || "待处理";
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

async function refreshMcpAuthorizationRequests() {
  const busy = "mcp-authorization-requests:refresh";
  setBusy(busy);
  try {
    const result = await bridge.listMcpAuthorizationRequests(mcpAuthorizationStatus.value);
    mcpAuthorizationRequests.value = Array.isArray(result.requests) ? result.requests : [];
  } catch (nextError) {
    mcpAuthorizationRequests.value = [];
    error.value =
      nextError instanceof Error ? nextError.message : "加载 MCP 授权请求失败。";
  } finally {
    clearBusy(busy);
  }
}

async function resolveMcpAuthorizationRequest(
  requestId: string,
  resolution: "approved" | "rejected",
) {
  const busy = `mcp-authorization-requests:resolve:${requestId}`;
  const request = mcpAuthorizationRequests.value.find((item) => item.requestId === requestId);
  setBusy(busy);
  try {
    await bridge.resolveMcpAuthorizationRequest(requestId, {
      resolution,
      clientName: request?.clientName,
      scopes: request?.requestedScopes || [],
      toolsets: [],
      toolAllow: request?.requestedTools || [],
    });
    await refreshMcpAuthorizationRequests();
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "处理 MCP 授权请求失败。";
  } finally {
    clearBusy(busy);
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
    if (debugTab.value === "knowledgeRecall") {
      void refreshKnowledgeRecallBackendSpaces();
    }
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
    error.value = "知识融合智能体未配置可用模型，请先在智能体仓库中选择模型。";
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

function onIngestFilesSelected(files: File[]) {
  ingestFiles.value = files;
  ingestProgress.value = ingestFiles.value.length
    ? `已选择 ${ingestFiles.value.length} 个文件`
    : "";
}

function splitKnowledgeIngestRefs(value: string) {
  return String(value || "")
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function knowledgeIngestProviderLabel(provider: string) {
  const normalized = provider.toLowerCase();
  if (normalized === "ragflow") {
    return "RAG Flow";
  }
  if (normalized === "dify") {
    return "Dify";
  }
  return provider || "外部知识库";
}

function parseKnowledgeIngestExternalRef(ref: string) {
  const separatorIndex = ref.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === ref.length - 1) {
    return {
      provider: knowledgeIngestExternalProvider.value || "dify",
      ref,
    };
  }
  return {
    provider: ref.slice(0, separatorIndex),
    ref: ref.slice(separatorIndex + 1),
  };
}

const selectedKnowledgeIngestTargets = computed<KnowledgeIngestTarget[]>(() => {
  const targets: KnowledgeIngestTarget[] = [];
  if (knowledgeIngestTargets.value.global) {
    targets.push({
      kind: "global",
      label: "Pact Native 知识库",
    });
  }
  if (knowledgeIngestTargets.value.external) {
    const refsByProvider = new Map<string, string[]>();
    const labelsByProvider = new Map<string, string[]>();
    for (const item of splitKnowledgeIngestRefs(knowledgeIngestExternalRefs.value)) {
      const parsed = parseKnowledgeIngestExternalRef(item);
      if (!parsed.ref) {
        continue;
      }
      const refs = refsByProvider.get(parsed.provider) || [];
      refs.push(parsed.ref);
      refsByProvider.set(parsed.provider, refs);
      const label = knowledgeIngestExternalTargetLabels.value[`${parsed.provider}:${parsed.ref}`];
      if (label) {
        const labels = labelsByProvider.get(parsed.provider) || [];
        labels.push(label);
        labelsByProvider.set(parsed.provider, labels);
      }
    }
    for (const [provider, refs] of refsByProvider) {
      const labels = labelsByProvider.get(provider) || [];
      targets.push({
        kind: "external",
        label: `${knowledgeIngestProviderLabel(provider)}：${labels.length ? labels.join("、") : refs.join("、")}`,
        provider,
        refs,
      });
    }
  }
  if (knowledgeIngestTargets.value.team) {
    targets.push({
      kind: "team",
      label: "团队空间",
      refs: splitKnowledgeIngestRefs(knowledgeIngestTeamRefs.value),
    });
  }
  if (knowledgeIngestTargets.value.user) {
    targets.push({
      kind: "user",
      label: "用户私有空间",
      refs: splitKnowledgeIngestRefs(knowledgeIngestUserRefs.value),
    });
  }
  return targets;
});

const knowledgeIngestTargetValidationMessage = computed(() => {
  if (selectedKnowledgeIngestTargets.value.length === 0) {
    return "请至少选择一个知识入库目标。";
  }
  if (knowledgeIngestTargets.value.external && splitKnowledgeIngestRefs(knowledgeIngestExternalRefs.value).length === 0) {
    return "请选择外部知识库时，需要填写至少一个库或空间 ID。";
  }
  if (knowledgeIngestTargets.value.team && splitKnowledgeIngestRefs(knowledgeIngestTeamRefs.value).length === 0) {
    return "请选择团队空间时，需要填写至少一个团队。";
  }
  if (knowledgeIngestTargets.value.user && splitKnowledgeIngestRefs(knowledgeIngestUserRefs.value).length === 0) {
    return "请选择用户私有空间时，需要填写至少一个用户。";
  }
  return "";
});

const canSubmitKnowledgeIngest = computed(() => knowledgeIngestTargetValidationMessage.value === "");

const knowledgeIngestTargetSummary = computed(() => {
  if (!selectedKnowledgeIngestTargets.value.length) {
    return "请选择入库目标";
  }
  return `将入库到：${selectedKnowledgeIngestTargets.value.map((target) => target.label).join("、")}`;
});

async function uploadFilesToKnowledge() {
  if (ingestFiles.value.length === 0) {
    error.value = "请先选择需要入库的文件。";
    return;
  }
  if (!canSubmitKnowledgeIngest.value) {
    error.value = knowledgeIngestTargetValidationMessage.value;
    return;
  }
  setBusy("knowledge:ingest");
  error.value = "";
  ingestProgress.value = "准备上传会话…";
  ingestJob.value = null;
  normalizedManifest.value = null;
  try {
    const filesToUpload = [...ingestFiles.value];
    const { session } = await createKnowledgeUploadSession(filesToUpload, {
      onProgress: (progress) => {
        ingestProgress.value = progress.message;
      },
    });
    ingestProgress.value = "创建入库任务…";
    const job = await bridge.createJob({
      inputText: "",
      filePaths: [],
      uploadedFiles: [],
      uploadSessionId: session.sessionId,
      settings: {
        ...settingsDraft.value,
        knowledgeIngestTargets: selectedKnowledgeIngestTargets.value,
      },
    });
    ingestJob.value = job;
    ingestProgress.value = `已进入处理队列，${knowledgeIngestTargetSummary.value}。`;
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

function isKnownDebugRouteTab(value: string): value is DebugTab {
  return debugTabs.some((tab) => tab.id === value);
}

function syncNavigationStateFromRoute(route: {
  meta?: Record<string, unknown>;
  params?: Record<string, unknown>;
  path: string;
}) {
  const viewId = String(route.meta?.viewId ?? "");
  if (viewId) {
    currentView.value = viewId as AppView;
  }

  if (viewId === "admin") {
    const metaAdminView = String(route.meta?.adminView ?? "");
    const slug = String(route.params?.section ?? "") || route.path.split("/").at(-1) || "";
    const nextAdminView = (metaAdminView || slugToAdminView(slug)) as AdminView;
    if (nextAdminView) {
      adminView.value = nextAdminView;
    }
  }

  if (viewId === "knowledge") {
    const tab = String(route.params?.tab ?? "");
    const viewTab = knowledgeRouteTabToViewTab(tab);
    if (viewTab) {
      knowledgeTab.value = viewTab;
    }
  }

  if (viewId === "debug") {
    const tab = String(route.params?.tab ?? "");
    if (isKnownDebugRouteTab(tab)) {
      debugTab.value = tab;
    }
  }
}

function closeSideNavOverlay() {
  sideNavOpen.value = false;
}

function switchView(view: AppView) {
  if (view === "knowledge" && !hasFeature("knowledge-core")) {
    currentView.value = "dashboard";
    _appRouter?.push("/");
    closeSideNavOverlay();
    return;
  }
  if (view === "debug" && visibleDebugTabs.value.length === 0) {
    currentView.value = "dashboard";
    _appRouter?.push("/");
    closeSideNavOverlay();
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
  closeSideNavOverlay();
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
    if (["tools", "toolList", "toolStats", "agentPermissions"].includes(adminView.value)) {
      void refreshToolManagement({ silent: true });
    }
    if (adminView.value === "agentPermissions") {
      ensureAgentPermissionGroupsDraft();
    }
    if (adminView.value === "maintenanceAgent") {
      void refreshMaintenanceAgent();
    }
    if (adminView.value === "contextManagement") {
      void refreshContextCompiler({ silent: true });
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
  closeSideNavOverlay();
  void refreshKnowledgeConsole();
  if (tab === "knowledgeRecall") {
    void refreshKnowledgeRecallBackendSpaces();
  }
}

function openKnowledgeTab(tab: KnowledgeTab) {
  if (!visibleKnowledgeTabs.value.some((item) => item.id === tab)) {
    return;
  }
  knowledgeTab.value = tab;
  currentView.value = "knowledge";
  _appRouter?.push(`/knowledge/${tab}`);
  closeSideNavOverlay();
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
  closeSideNavOverlay();
  void refreshAuthAdmin();
  if (["tools", "toolList", "toolStats", "agentPermissions"].includes(tab)) {
    void refreshToolManagement().then(() => {
      if (tab === "agentPermissions") {
        ensureAgentPermissionGroupsDraft();
      }
    });
  }
  if (tab === "contextManagement") {
    void refreshContextCompiler({ silent: true });
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
    case "tools":
    case "toolList":
    case "toolStats":
      return hasFeature("agent-gateway") || hasFeature("agent-management");
    case "agentPermissions":
      return hasFeature("agent-management") || hasFeature("agent-gateway");
    case "agentConfig":
      return hasFeature("agent-gateway");
    case "contextManagement":
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

function importClients() {
  alert("导入客户端功能正在开发中…");
}

function exportClients() {
  alert("导出客户端列表成功。");
}

type ClientConnectionRow = NonNullable<ServerConsoleState["clients"]["items"][number]>;

function clientConnectionMethodLabel(client: ClientConnectionRow) {
  if (client.connectionKind === "mcp-plugin") {
    return "MCP 服务";
  }
  return String(client.connectionMethod || "pact-client 封装");
}

function clientConnectionDetail(client: ClientConnectionRow) {
  if (client.connectionDetail) {
    return String(client.connectionDetail);
  }
  if (client.connectionKind === "mcp-plugin") {
    return client.sourceGrantId ? `授权 ${client.sourceGrantId}` : "Tool Management 授权";
  }
  return "Discovery Check-in";
}

function clientStatusLabel(client: ClientConnectionRow) {
  if (client.connectionKind === "mcp-plugin") {
    return String(client.connectionStatusLabel || "已配对");
  }
  return migrationStateLabels[client.migrationState as ClientMigrationState] || "未知";
}

function clientStatusTone(client: ClientConnectionRow) {
  if (client.connectionKind !== "mcp-plugin") {
    return migrationTone(client.migrationState as ClientMigrationState);
  }

  if (client.connectionState === "disabled" || client.connectionState === "revoked" || client.connectionState === "offline") {
    return "offline";
  }
  if (client.connectionState === "pending") {
    return "attention";
  }
  return "aligned";
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
    serverAvailable.value = true;
  } catch (nextError) {
    serverAvailable.value = false;
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

function nextCursorFromProtocolEvents(events: ProtocolEvent[]) {
  return events.reduce((cursor, event) => Math.max(cursor, event.offset + 1), 0);
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
    const snapshotEvents = requestCursor === 0 ? response.snapshots || [] : [];
    const snapshotCursor = nextCursorFromProtocolEvents(snapshotEvents);
    const liveEvents =
      snapshotCursor > 0
        ? response.events.filter((event) => event.offset >= snapshotCursor)
        : response.events;
    const incomingEvents = [...snapshotEvents, ...liveEvents];
    const hasUpdates = incomingEvents.length > 0;
    const handledUpdates = incomingEvents.filter(applyServerEvent).length;
    serverEventCursor = Math.max(
      serverEventCursor,
      response.nextCursor || 0,
      snapshotCursor,
      nextCursorFromProtocolEvents(liveEvents),
    );
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
      nextError instanceof Error ? nextError.message : "保存权限组失败。";
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

async function runMaintenanceAgentKnowledgeMaintenance() {
  maintenanceAgentRunbook.value = "knowledge_maintenance_review";
  await runMaintenanceAgentRunbook();
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
      clientConnectionMethodLabel(item).toLowerCase().includes(query) ||
      clientConnectionDetail(item).toLowerCase().includes(query) ||
      clientStatusLabel(item).toLowerCase().includes(query) ||
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
const monitorAlertSummary = computed(() => monitorAlertState.value?.summary || {
  activeCount: 0,
  visibleCount: 0,
  recoveredCount: 0,
  criticalCount: 0,
  warningCount: 0,
  historyCount: 0,
});
const activeMonitorAlerts = computed(() => monitorAlertState.value?.activeAlerts || []);
const {
  agentConfigurationAlertSummary,
  agentConfigurationAlerts,
  dashboardAlertInbox,
  dashboardAlertInboxId,
  dashboardAlertSummary,
  dashboardAlerts,
  dismissDashboardAlert,
  dismissedDashboardAlertIds,
  liveDashboardAlerts,
  openDashboardAlert,
  refreshDashboardAlertsSnapshot,
  syncDashboardAlertInbox,
} = createConsoleDashboardAlertController({
  acknowledgeMonitorAlert,
  activeMonitorAlerts,
  agentExploreAgentOptions,
  agentExploreForm,
  agentModelAssignmentOptions,
  agentSelectorOptions,
  backgroundProcesses,
  error,
  infoFeedForm,
  infoFeedModelOptions,
  moduleModelRef,
  moduleNeedsIntelligence,
  openAdmin,
  openAgentConfigurationAlert,
  refreshMonitorAlerts,
  ruleAuthoringForm,
  ruleAuthoringModelOptions,
  settingsDraft,
  visibleModelEntries,
});
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
      kindLabel: "任务队列",
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
    kindLabel: "调用记录",
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
      kindLabel: isAuthOperation ? "认证日志" : "操作日志",
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
syncNavigationStateFromRoute(_router.currentRoute.value);

// Sync URL → state: when the user navigates via back/forward or direct URL,
// update the module-level navigation refs to match the route.
watch(
  () => _route.fullPath,
  () => {
    syncNavigationStateFromRoute(_route);
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
    clientRuntimeCoolingLabel, 
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
    clientConnectionDetail,
    clientConnectionMethodLabel,
    clientStatusLabel,
    clientStatusTone,
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
    canSubmitKnowledgeIngest,
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
    knowledgeIngestExternalProvider,
    knowledgeIngestExternalRefs,
    knowledgeIngestExternalTargetLabels,
    knowledgeIngestTargetSummary,
    knowledgeIngestTargets,
    knowledgeIngestTargetValidationMessage,
    knowledgeIngestTeamRefs,
    knowledgeIngestUserRefs,
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
    knowledgeManagementPanel,
    knowledgeManagementPanelOptionBarOptions,
    knowledgeModules,
    knowledgeRecallDebugForm,
    knowledgeRecallDebugGridStyle,
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
    maintenanceFieldValue, 
    maintenanceJson, 
    mcpAuthorizationRequests,
    mcpAuthorizationStatus,
    mcpAuthorizationStatusOptionBarOptions,
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
    parseEmailHeaders, 
    parseEmailRulesDraft, 
    parseFilterDate, 
    parseHeaderParams, 
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
    refreshMcpAuthorizationRequests,
    refreshMonitorAlerts, 
    refreshServerPathBrowser, 
    refreshState, 
    refreshSystemStatusLogs, 
    refreshToolManagement, 
    refreshWordCloud, 
    refreshWordCloudCorpusTerms, 
    reloadModules, 
    resolveMcpAuthorizationRequest,
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
    resetInfoFeedRunForContinuation, 
    resetKnowledgeAgentExplore, 
    resolveKnowledgeReview, 
    resolveWordCloudCorpusPathsForQuery, 
    restoreAgentExploreState, 
    restoreInfoFeedHistory, 
    knowledgeRecallDebugModeOptionBarOptions,
    knowledgeRecallDebugTargetOptions,
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
    runKnowledgeRecallDebugBatch, 
    runMaintenanceAgentKnowledgeMaintenance,
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
    selectedModelProvider, 
    selectedRuleAuthoringModel, 
    selectedToolManagementTool, 
    selectedToolManagementToolId, 
    selectedWordCloud, 
    selectedWordBagId, 
    selectedWordCloudModel, 
    serverAvailable,
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
