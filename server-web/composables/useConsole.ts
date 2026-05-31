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
import { bridge } from "../lib/bridge";
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
import { createConsoleAgentExploreLayoutController } from "./console-agent-explore-layout-controller";
import { createConsoleAgentExploreSessionController } from "./console-agent-explore-session-controller";
import { createConsoleExpertRulesController } from "./console-expert-rules-controller";
import { createConsoleKnowledgeSourceController } from "./console-knowledge-source-controller";
import { createConsolePathPickerController } from "./console-path-picker-controller";
import { createConsoleRuntimeMountController } from "./console-runtime-mount-controller";
import { createConsoleDashboardAlertController } from "./console-dashboard-alert-controller";
import { createConsoleInfoFeedController } from "./console-info-feed-controller";
import { createConsoleKnowledgeEvidenceController } from "./console-knowledge-evidence-controller";
import { createConsoleKnowledgeIngestController } from "./console-knowledge-ingest-controller";
import { createConsoleKnowledgeRecallController } from "./console-knowledge-recall-controller";
import { createConsoleKnowledgeReviewController } from "./console-knowledge-review-controller";
import { createConsoleMaintenanceAgentController } from "./console-maintenance-agent-controller";
import { createConsoleMcpAuthorizationController } from "./console-mcp-authorization-controller";
import { createConsoleModelLibraryController } from "./console-model-library-controller";
import { createConsoleOpsMonitorController } from "./console-ops-monitor-controller";
import { createConsoleRuleAuthoringController } from "./console-rule-authoring-controller";
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
  KnowledgeConfigSchema,
  KnowledgeConsoleState,
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
  KnowledgeSource,
  KnowledgeSourceState,
  KnowledgeWordCloudSet,
  MaintenanceSettings,
  ModelProbeResponse,
  ModuleAgentProfile,
  ProtocolEvent,
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
  DashboardAlert, PathPickerMode,
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
const agentExploreHiddenRunIds = ref<Set<string>>(new Set());
const agentExploreClosedTabIds = ref<Set<string>>(new Set());
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
const uploadTraceEvents = ref<ProtocolEvent[]>([]);
const {
  applyIngestJobFromEvent,
  canSubmitKnowledgeIngest,
  ingestFiles,
  ingestJob,
  ingestProgress,
  knowledgeIngestExternalProvider,
  knowledgeIngestExternalRefs,
  knowledgeIngestExternalTargetLabels,
  knowledgeIngestTargets,
  knowledgeIngestTargetSummary,
  knowledgeIngestTargetValidationMessage,
  knowledgeIngestTeamRefs,
  knowledgeIngestUserRefs,
  normalizedManifest,
  onIngestFilesSelected,
  refreshIngestJob,
  uploadFilesToKnowledge,
} = createConsoleKnowledgeIngestController({
  clearAllBusy,
  error,
  refreshKnowledgeConsole,
  refreshState,
  setBusy,
  settingsDraft,
});
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
const {
  agentExploreSplitDragging,
  agentExploreSplitLeftPercent,
  agentExploreSplitRef,
  agentExploreSplitStyle,
  agentExploreTraceOpen,
  clampAgentExploreSplitPercent,
  handleAgentExploreSplitKeydown,
  handleAgentExploreSplitPointerMove,
  handleAgentExploreTraceToggle,
  startAgentExploreSplitResize,
  stopAgentExploreSplitResize,
  updateAgentExploreSplitFromClientX,
} = createConsoleAgentExploreLayoutController();

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

const {
  addVocabularyEntry,
  cloneExpertVocabulary,
  deleteVocabularyEntry,
  displayedVocabularyEntries,
  emailDepartmentRules,
  emailReportSeriesRules,
  emailRulesDraft,
  emailSynonymRules,
  expertRuleEnabled,
  expertVocabularyDraft,
  expertVocabularyDraftDirty,
  goldenRuleItems,
  goldenRulePackageTitle,
  goldenRulePackages,
  goldenRulesState,
  hiddenVocabularyEntryCount,
  parseEmailRulesDraft,
  refreshExpertRules,
  replaceExpertVocabularyDraftFromServer,
  replaceRulesDraftFromServer,
  rulesDraftDirty,
  rulesText,
  saveExpertVocabulary,
  saveRules,
  setEmailRuleEntryEnabled,
  setVocabularyEntryEnabled,
  showAllVocabularyEntries,
  splitVocabularyList,
  toggleGoldenRuleEnabled,
  updateVocabularyDomains,
  updateVocabularyEntry,
  updateVocabularyKeywords,
  updateVocabularyPath,
  vocabularyEntryPath,
  vocabularySearch,
} = createConsoleExpertRulesController({
  applyRemoteConsoleDraftUpdate,
  clearAllBusy,
  error,
  isApplyingRemoteConsoleDrafts: () => applyingRemoteConsoleDrafts,
  refreshState,
  setBusy,
});

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
  applyMaintenanceAgentStateFromConsoleState(nextState);
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
  applyIngestJobFromEvent(job);
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
    if (!applyMaintenanceAgentConfigFromEvent(payload.config)) {
      return false;
    }
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
const {
  mcpAuthorizationRequests,
  mcpAuthorizationStatus,
  mcpAuthorizationStatusOptionBarOptions,
  refreshMcpAuthorizationRequests,
  resolveMcpAuthorizationRequest,
} = createConsoleMcpAuthorizationController({
  clearBusy,
  error,
  setBusy,
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
  allMaintenanceAgentRuns,
  applyMaintenanceAgentConfigFromEvent,
  applyMaintenanceAgentStateFromConsoleState,
  approveMaintenanceAgentRun,
  cancelMaintenanceAgentRun,
  chatMaintenanceAgent,
  displayedMaintenanceAgentRuns,
  latestMaintenanceAgentRun,
  maintenanceAgentConfig,
  maintenanceAgentMessage,
  maintenanceAgentModelAlias,
  maintenanceAgentResultJson,
  maintenanceAgentRunbook,
  maintenanceAgentRunbookOptionBarOptions,
  maintenanceAgentRunbooks,
  maintenanceAgentRuns,
  maintenanceAgentSchedules,
  maintenanceAgentSummary,
  nextMaintenanceAgentRunAt,
  patchMaintenanceAgentState,
  pendingMaintenanceApprovalCount,
  refreshMaintenanceAgent,
  runMaintenanceAgentKnowledgeMaintenance,
  runMaintenanceAgentRunbook,
  saveMaintenanceAgentConfig,
  selectedMaintenanceAgentRun,
} = createConsoleMaintenanceAgentController({
  canReadMaintenanceAgent,
  clearAllBusy,
  consoleState,
  error,
  jsonPreview,
  modelEntryStatusKey,
  setBusy,
  visibleModelEntries,
});
const {
  acknowledgeMonitorAlert,
  activeMonitorAlerts,
  backgroundProcesses,
  backgroundProcessStatus,
  backgroundRunningCount,
  backgroundSupervisorLabel,
  clientRuntimeHeatRows,
  clientRuntimeStatus,
  clientRuntimeSummary,
  monitorAlertConfigText,
  monitorAlertState,
  monitorAlertSummary,
  queueMonitorItems,
  queueMonitorState,
  recentMonitorAlertHistory,
  refreshBackgroundProcesses,
  refreshClientRuntimeStatus,
  refreshMonitorAlerts,
  saveMonitorAlertConfig,
  workQueueRows,
  workQueueSummary,
} = createConsoleOpsMonitorController({
  allMaintenanceAgentRuns,
  canAdminMaintenanceAgent,
  canReadMaintenanceAgent,
  clearAllBusy,
  consoleState,
  error,
  jsonPreview,
  setBusy,
});
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
const {
  publishRuleAuthoringPackage,
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
  runRuleAuthoringChat,
  selectedRuleAuthoringModel,
} = createConsoleRuleAuthoringController({
  agentSelectorOptions,
  canMaintainKnowledge,
  clearAllBusy,
  error,
  setBusy,
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
const {
  fuseKnowledgeReview,
  knowledgeReviewBusyGeneration,
  knowledgeReviewItems,
  knowledgeReviewRequestGeneration,
  knowledgeReviewRowClassName,
  knowledgeReviewStatus,
  pendingKnowledgeReviewCount,
  refreshKnowledgeConflicts,
  resolveKnowledgeReview,
  selectKnowledgeReviewItem,
  selectedKnowledgeReviewFusionModel,
  selectedKnowledgeReviewId,
  selectedKnowledgeReviewItem,
} = createConsoleKnowledgeReviewController({
  agentExploreThinkingParameters,
  agentSelectorOptions,
  canAdminKnowledge,
  canMaintainKnowledge,
  canReadKnowledge,
  clearAllBusy,
  currentView,
  error,
  knowledgeConsole,
  refreshKnowledgeConsole,
  setBusy,
  settingsDraft,
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
function agentExploreThinkingParameters(): Record<string, unknown> {
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
  resetKnowledgeAgentExplore,
  restoreAgentExploreState,
  runKnowledgeAgentExplore,
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
  canReadKnowledge,
  clearAllBusy,
  currentView,
  debugTab,
  error,
  hasAgentModelOption,
  normalizeThinkingMode: normalizedAgentExploreThinkingMode,
  selectedAgentExploreContextProfile,
  selectedAgentExploreModel,
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

async function refreshKnowledgeConsole(options: { skipReviewItems?: boolean } = {}) {
  if (!hasScope("knowledge:read")) {
    return;
  }
  try {
    const [state, schema, maintenance, sources] = await Promise.all([
      bridge.getKnowledgeConsole(),
      bridge.getKnowledgeConfigSchema(),
      bridge.getKnowledgeMaintenance().catch(() => ({} as MaintenanceSettings)),
      bridge.getKnowledgeSources().catch(() => null),
    ]);
    knowledgeConsole.value = state;
    knowledgeSchema.value = schema;
    knowledgeSourceState.value = sources || state.sources || null;
    if (debugTab.value === "knowledgeRecall") {
      void refreshKnowledgeRecallBackendSpaces();
    }
    if (!options.skipReviewItems) {
      await refreshKnowledgeConflicts({ silent: true, suppressError: true });
    }
    knowledgeMaintenanceDraft.value = maintenance || {};
    maintenanceJson.value = jsonPreview(knowledgeMaintenanceDraft.value);
  } catch (nextError) {
    error.value =
      nextError instanceof Error ? nextError.message : "加载知识库管控数据失败。";
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
