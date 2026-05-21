<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useConsole } from '../composables/useConsole';
import KnowledgeDistillationWorkbench from '../components/KnowledgeDistillationWorkbench.vue';
import KnowledgeImportCard from '../components/KnowledgeImportCard.vue';
import { bridge } from '../lib/bridge';
import {
  createKnowledgeUploadedFilesPayload,
  knowledgeUploadFileKey,
  knowledgeUploadFileRelativePath,
} from '../lib/knowledge-upload-session';
import type { DocumentParseChunk, DocumentParsingConfig, SplitJob, SplitResult } from '../lib/types';
import {
  AgentModelOptionBar,
  BinaryCheckbox,
  BrowseSelectButton,
  ConfigFoldCard,
  FeatureToggle,
  HistorySessionPanel,
  InfoFeedResultRow,
  OptionBar,
  StatusPill,
} from '../components/common';
const {
  addChildWordCloud,
  addManualWordCloud,
  autoFillCloudWithAgent,
  fillingWordBagIds,
  addVocabularyEntry,
  busyKey,
  canAdminKnowledge,
  canBrowseServerPaths,
  canMaintainKnowledge,
  canReadKnowledge,
  canWriteJobs,
  canWriteKnowledge,
  clearWordCloudCorpusPaths,
  collapsedWordBagIds,
  currentMaintenanceTask,
  currentMaintenanceTaskSupportsDryRun,
  currentView,
  deleteVocabularyEntry,
  displayedVocabularyEntries,
  emailDepartmentRules,
  emailReportSeriesRules,
  emailSynonymRules,
  enabledStringOptionBarOptions,
  error,
  exportWordCloudSet,
  expertRuleEnabled,
  expertVocabularyDraft,
  filter,
  formatBytes,
  formatCompactDate,
  formatMachineDate,
  formatWordCloudThreshold,
  fuseKnowledgeReview,
  goldenRuleItems,
  goldenRulePackageTitle,
  goldenRulePackages,
  hasFeature,
  hiddenVocabularyEntryCount,
  ingestJob,
  ingestProgress,
  isAuthenticated,
  isWordCloudPresetCard,
  jobStatusLabels,
  jobStatusTone,
  jsonPreview,
  knowledgeConsole,
  knowledgeConfigGroupDescription,
  knowledgeFusionSummary,
  knowledgeMaintenanceTaskDescription,
  knowledgeRecallDebugForm,
  knowledgeRecallDebugGridStyle,
  knowledgeRecallDebugParameterSummary,
  knowledgeRecallDebugRuns,
  knowledgeReviewCanResolveWithDocument,
  knowledgeReviewCurrentDocuments,
  knowledgeReviewDetailText,
  knowledgeReviewDocumentLine,
  knowledgeReviewIncomingDocument,
  knowledgeReviewItems,
  knowledgeReviewPrimaryCurrentDocument,
  knowledgeReviewReasonLabel,
  knowledgeReviewRecordPreview,
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
  knowledgeSourceState,
  knowledgeStatus,
  knowledgeTab,
  maintenanceConfirm,
  maintenanceDryRun,
  maintenanceFieldValue,
  maintenanceJson,
  maintenanceResultJson,
  maintenanceTaskOptionBarOptions,
  normalizedManifest,
  onIngestFilesSelected,
  openAgentEvidencePreview,
  openWordCloudCorpusDirectoryPicker,
  openWordCloudCorpusFilePicker,
  importWordCloudSetFromFile,
  proposeWordCloud,
  refreshExpertRules,
  refreshIngestJob,
  refreshKnowledgeConflicts,
  refreshKnowledgeConsole,
  refreshState,
  refreshWordCloud,
  removeTermFromCloud,
  removeWordCloudCorpusPath,
  resolveKnowledgeReview,
  retrievalModeOptionBarOptions,
  rulesText,
  runKnowledgeRecallDebugBatch,
  runKnowledgeMaintenanceTask,
  saveExpertVocabulary,
  saveKnowledgeMaintenance,
  saveRules,
  saveWordCloud,
  selectKnowledgeReviewItem,
  selectWordCloud,
  selectedKnowledgeReviewFusionModel,
  selectedKnowledgeReviewItem,
  selectedMaintenanceTask,
  selectedWordCloud,
  selectedWordCloudModel,
  setEmailRuleEntryEnabled,
  setMaintenanceFieldFromEvent,
  setMaintenanceFieldValue,
  setVocabularyEntryEnabled,
  settingsDraft,
  shortId,
  showAllVocabularyEntries,
  syncLocalSourceLabelFromPath,
  toggleGoldenRuleEnabled,
  toggleWordCloudActionMenu,
  toggleWordCloudCollapsed,
  triggerWordCloudImport,
  agentModelOptions,
  pinWordCloud,
  pinnedWordBagIds,
  updateVocabularyDomains,
  updateVocabularyKeywords,
  updateVocabularyPath,
  updateWordCloudField,
  uploadFilesToKnowledge,
  vocabularyEntryPath,
  vocabularySearch,
  wordBagActionMenuId,
  wordCloudCardRows,
  wordCloudCardStyle,
  wordCloudCorpusPathLabel,
  wordCloudCorpusPathSummary,
  wordCloudCorpusPaths,
  wordCloudDraft,
  wordCloudMessages,
  wordCloudModelAlias,
  wordCloudModelOptions,
  wordCloudPrompt,
  wordCloudTerms,
  wordCloudVisibleTerms,
  wordCloudState,
  escapeHtmlText,
  markdownToSafeHtml,
  sanitizeHtmlContent,
} = useConsole();

const expandedSummaryIds = ref<Set<string>>(new Set());
function toggleSummaryExpanded(wordBagId: string) {
  const next = new Set(expandedSummaryIds.value);
  if (next.has(wordBagId)) { next.delete(wordBagId); } else { next.add(wordBagId); }
  expandedSummaryIds.value = next;
}

const expandedAdvancedIds = ref<Set<string>>(new Set());
function toggleAdvancedExpanded(wordBagId: string) {
  const next = new Set(expandedAdvancedIds.value);
  if (next.has(wordBagId)) { next.delete(wordBagId); } else { next.add(wordBagId); }
  expandedAdvancedIds.value = next;
}

const titleFocusedWordBagId = ref<string | null>(null);

function jumpToCloud(wordBagId: string) {
  if (collapsedWordBagIds.value.has(wordBagId)) {
    toggleWordCloudCollapsed(wordBagId);
  }
  nextTick(() => {
    const el = document.querySelector(`[data-word-bag-id="${wordBagId}"]`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  });
}

const isDocumentParsingTab = computed(() => knowledgeTab.value === "parsing");
const isKnowledgeRetrievalTab = computed(() => knowledgeTab.value === "retrieval");
const isGoldenRulesTab = computed(() => knowledgeTab.value === "rules");
const isKnownKnowledgeTab = computed(
  () =>
    isDocumentParsingTab.value ||
    isKnowledgeRetrievalTab.value ||
    isGoldenRulesTab.value ||
    knowledgeTab.value === "distillation" ||
    knowledgeTab.value === "chunking" ||
    knowledgeTab.value === "wordCloud" ||
    knowledgeTab.value === "review" ||
    knowledgeTab.value === "maintenance",
);

const knowledgeImportModeLabels: Record<string, string> = {
  wordCloud: "基础词汇库",
  chunking: "文档切分",
  parsing: "文档归一化",
  retrieval: "索引与检索",
  distillation: "知识蒸馏",
  review: "人工审核",
  rules: "专家规则",
  maintenance: "配置维护",
};

const knowledgeImportModeLabel = computed(() => knowledgeImportModeLabels[knowledgeTab.value] || "知识库");
const knowledgeImportModeDescription = computed(
  () => `各子模块共享同一批解析结果，当前链路：${knowledgeImportModeLabel.value}。`,
);

type ChunkingMode = "dynamic" | "heading" | "semantic" | "fixed";
type ChunkingPreviewDisplayMode = "preview" | "source";
type ChunkRenderKind = "html" | "markdown" | "text";
type ChunkQuality = "good" | "warn" | "risk";
type ChunkingAttachmentStatus = "ready" | "pending" | "error";

type ChunkPreview = {
  id: string;
  index: number;
  title: string;
  text: string;
  sourceName: string;
  tokens: number;
  chars: number;
  overlap: number;
  quality: ChunkQuality;
  boundary: string;
  anchors: string[];
  sourceStartLine: number;
  sourceEndLine: number;
  parentArtifactId: string;
  granularity: string;
  fragmentRange: string;
  materialization: string;
};

type ChunkingAttachment = {
  id: string;
  name: string;
  relativePath: string;
  mediaType: string;
  byteSize: number;
  lastModified: number;
  file?: File;
  status: ChunkingAttachmentStatus;
  statusLabel: string;
  message: string;
  text: string;
};

const chunkingModeOptions: Array<{ value: ChunkingMode; label: string }> = [
  { value: "dynamic", label: "动态参数" },
  { value: "heading", label: "标题优先" },
  { value: "semantic", label: "语义段落" },
  { value: "fixed", label: "固定窗口" },
];

const chunkingPreviewDisplayModeOptions: Array<{ value: ChunkingPreviewDisplayMode; label: string }> = [
  { value: "preview", label: "预览" },
  { value: "source", label: "原文" },
];

const chunkingAttachmentAccept = [
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".tsv",
  ".log",
  ".xml",
  ".html",
  ".htm",
  ".yaml",
  ".yml",
  ".eml",
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  "text/*",
  "application/json",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

const chunkingReadableExtensions = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "log",
  "xml",
  "html",
  "htm",
  "yaml",
  "yml",
  "eml",
]);

const chunkingDocument = ref("");
const chunkingMode = ref<ChunkingMode>("dynamic");
const chunkingChunkSize = ref(180);
const chunkingOverlap = ref(32);
const chunkingHeadingDepth = ref("H2");
const chunkingKeepTables = ref(true);
const chunkingKeepEvidence = ref(true);
const chunkingPreviewDisplayMode = ref<ChunkingPreviewDisplayMode>("preview");
const selectedChunkId = ref("chunk-1");
const chunkingAttachments = ref<ChunkingAttachment[]>([]);
const chunkingDocumentSource = ref<"attachments" | "manual">("manual");

function chunkingAttachmentKey(file: File) {
  return knowledgeUploadFileKey(file);
}

function chunkingAttachmentExtension(name: string) {
  const match = name.toLowerCase().match(/\.([^.]+)$/);
  return match?.[1] || "";
}

function canReadChunkingAttachment(file: File) {
  if (file.type.startsWith("text/")) {
    return true;
  }
  const mediaType = file.type.toLowerCase();
  if (mediaType === "application/json" || mediaType.includes("xml")) {
    return true;
  }
  return chunkingReadableExtensions.has(chunkingAttachmentExtension(file.name));
}

function chunkingAttachmentTone(status: ChunkingAttachmentStatus) {
  if (status === "ready") {
    return "success";
  }
  if (status === "pending") {
    return "warning";
  }
  return "danger";
}

function buildChunkingAttachmentDocument(attachments: ChunkingAttachment[]) {
  return attachments
    .map((attachment) => {
      const meta = [
        `- 文件名：${attachment.relativePath}`,
        `- 文件大小：${formatBytes(attachment.byteSize)}`,
        `- 解析状态：${attachment.message}`,
      ].join("\n");
      const body = attachment.text.trim()
        ? attachment.text.trim()
        : "[该附件已加入输入队列，等待后端 document-parser 提取正文后参与切分。]";
      return `# 附件：${attachment.name}\n\n${meta}\n\n${body}`;
    })
    .join("\n\n---\n\n");
}

function syncChunkingDocumentFromAttachments() {
  if (chunkingAttachments.value.length === 0) {
    if (chunkingDocumentSource.value === "attachments") {
      chunkingDocument.value = "";
    }
    return;
  }
  chunkingDocument.value = buildChunkingAttachmentDocument(chunkingAttachments.value);
  selectedChunkId.value = "chunk-1";
  chunkingDocumentSource.value = "attachments";
}

async function readChunkingAttachment(file: File): Promise<ChunkingAttachment> {
  const relativePath = knowledgeUploadFileRelativePath(file);
  const base = {
    id: `${chunkingAttachmentKey(file)}:${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    relativePath,
    mediaType: file.type || "application/octet-stream",
    byteSize: file.size,
    lastModified: file.lastModified,
    file,
  };
  if (!canReadChunkingAttachment(file)) {
    return {
      ...base,
      status: "pending",
      statusLabel: "待解析",
      message: "已作为附件加入，等待后端解析",
      text: "",
    };
  }
  try {
    const text = await file.text();
    return {
      ...base,
      status: "ready",
      statusLabel: "可切分",
      message: "已读取正文",
      text,
    };
  } catch {
    return {
      ...base,
      status: "error",
      statusLabel: "读取失败",
      message: "浏览器无法读取该附件正文",
      text: "",
    };
  }
}

async function addChunkingAttachmentFiles(files: File[], options: { startIngest?: boolean } = {}) {
  if (!files.length) {
    return;
  }
  const existingKeys = new Set(chunkingAttachments.value.map((attachment) =>
    `${attachment.relativePath}:${attachment.byteSize}:${attachment.lastModified}`,
  ));
  const nextFiles = files.filter((file) => !existingKeys.has(chunkingAttachmentKey(file)));
  if (!nextFiles.length) {
    return;
  }
  const nextAttachments = await Promise.all(nextFiles.map(readChunkingAttachment));
  chunkingAttachments.value = [...chunkingAttachments.value, ...nextAttachments];
  syncChunkingDocumentFromAttachments();
  if (options.startIngest !== false) {
    onIngestFilesSelected(nextFiles, {
      documentParsing: chunkingDocumentParsingConfig(),
    });
  }
}

function removeChunkingAttachment(id: string) {
  chunkingAttachments.value = chunkingAttachments.value.filter((attachment) => attachment.id !== id);
  syncChunkingDocumentFromAttachments();
}

function clearChunkingAttachments() {
  chunkingAttachments.value = [];
  syncChunkingDocumentFromAttachments();
}

function onChunkingDocumentInput() {
  chunkingDocumentSource.value = "manual";
}

function headingTitle(text: string, fallback: string) {
  const heading = text.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim();
  if (heading) {
    return heading;
  }
  const first = text.split(/\n/).find((line) => line.trim()) || fallback;
  return first.replace(/^[-*]\s+/, "").slice(0, 28);
}

function chunkingHeadingLevel() {
  return Number(chunkingHeadingDepth.value.replace("H", "")) || 2;
}

function chunkingPipelineId() {
  if (chunkingMode.value === "dynamic") {
    return "dynamic-parameter-v1";
  }
  if (chunkingMode.value === "semantic") {
    return "semantic-paragraph-v1";
  }
  if (chunkingMode.value === "fixed") {
    return "fixed-window-v1";
  }
  return "knowledge-rule-v1";
}

function chunkingDocumentParsingConfig(): DocumentParsingConfig {
  const maxTokens = Math.max(80, Number(chunkingChunkSize.value) || 180);
  const maxChars = Math.max(480, maxTokens * 4);
  const useDynamicParsing = chunkingMode.value === "dynamic";
  return {
    pipelineId: chunkingPipelineId(),
    expectedOutput: "chunks",
    expectedOutputs: ["chunks", "preprocessResult"],
    chunking: {
      maxTokens,
      maxChars,
      overlapTokens: Math.max(0, Number(chunkingOverlap.value) || 0),
      sectionLevel: chunkingHeadingLevel(),
    },
    ...(useDynamicParsing
      ? {
          contextBudget: {
            knowledgeTokens: maxTokens,
            budgetScope: "knowledge-console-document-chunking",
          },
          payloadBudget: {
            maxResponseBytes: 256 * 1024,
            maxEvidenceBytes: Math.max(32768, maxTokens * 64),
          },
          granularity: {
            preferOriginalStructure: chunkingKeepTables.value,
            allowPartialEvidence: true,
            targetTokens: maxTokens,
            targetChars: maxChars,
            tableGranularity: chunkingKeepTables.value ? "row-window" : "cell-window",
            secondaryParse: {
              enabled: false,
              algorithm: "auto",
              targetTokens: maxTokens,
              targetChars: maxChars,
            },
          },
          dynamicParsing: {
            enabled: true,
            preserveStructureArtifacts: true,
            tableGranularity: chunkingKeepTables.value ? "row-window" : "cell-window",
          },
        }
      : {}),
  };
}

function knowledgeImportDocumentParsingConfig(): DocumentParsingConfig {
  const config = chunkingDocumentParsingConfig();
  if (knowledgeTab.value === "chunking") {
    return config;
  }
  return {
    ...config,
    pipelineId: "unified-knowledge-ingest-v1",
    expectedOutput: "preprocessResult",
    expectedOutputs: ["preprocessResult", "chunks"],
  };
}

async function handleKnowledgeImportFiles(files: File[]) {
  if (!files.length) {
    return;
  }
  await addChunkingAttachmentFiles(files, { startIngest: false });
  onIngestFilesSelected(files, {
    documentParsing: knowledgeImportDocumentParsingConfig(),
  });
}

function uploadKnowledgeImportFiles() {
  return uploadFilesToKnowledge({
    documentParsing: knowledgeImportDocumentParsingConfig(),
  });
}

function chunkingSourceName() {
  return chunkingAttachments.value.length === 1
    ? chunkingAttachments.value[0]?.relativePath || "document.md"
    : "document.md";
}

function sourceRangeStart(chunk: DocumentParseChunk) {
  const metadataRange = (chunk.metadata?.sourceRange || {}) as Record<string, unknown>;
  return Number(chunk.sourceStartLine || chunk.sourceRange?.startLine || metadataRange.startLine || 1);
}

function sourceRangeEnd(chunk: DocumentParseChunk, text: string, startLine: number) {
  const metadataRange = (chunk.metadata?.sourceRange || {}) as Record<string, unknown>;
  return Number(
    chunk.sourceEndLine ||
      chunk.sourceRange?.endLine ||
      metadataRange.endLine ||
      startLine + Math.max(1, text.split("\n").length) - 1,
  );
}

function chunkMetadataString(chunk: DocumentParseChunk, key: string) {
  return String((chunk.metadata?.[key] as string | undefined) || "").trim();
}

function chunkFragmentRange(chunk: DocumentParseChunk) {
  const range = (chunk.metadata?.fragmentRange || {}) as Record<string, unknown>;
  const entries = Object.entries(range)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
    .map(([key, value]) => `${key}:${String(value)}`);
  return entries.join(" · ");
}

function chunkMaterialization(chunk: DocumentParseChunk) {
  const materialization = (chunk.metadata?.materialization || {}) as Record<string, unknown>;
  return String(materialization.mode || chunkMetadataString(chunk, "granularity") || chunk.chunkType || "chunk");
}

function chunkPreviewFromBackend(chunk: DocumentParseChunk, offset: number): ChunkPreview {
  const text = String(chunk.content || chunk.text || "");
  const tokens = Number(chunk.tokenCount || 0);
  const maxTokens = Math.max(80, Number(chunkingChunkSize.value) || 180);
  const tableLines = text.split("\n").filter((line) => line.trim().startsWith("|")).length;
  const hasEvidence = /证据|chunkId|sourceRange|附件|邮件|日志/.test(text);
  const quality: ChunkQuality =
    tokens > maxTokens * 1.18 || (!chunkingKeepTables.value && tableLines > 0)
      ? "risk"
      : tokens < maxTokens * 0.25
        ? "warn"
        : "good";
  const headingPath = (Array.isArray(chunk.headingPath) && chunk.headingPath.length
    ? chunk.headingPath
    : Array.isArray(chunk.titlePath)
      ? chunk.titlePath
      : []
  ).map((item) => String(item || "")).filter(Boolean);
  const sourceStartLine = sourceRangeStart(chunk);
  const sourceEndLine = sourceRangeEnd(chunk, text, sourceStartLine);
  const granularity = chunkMetadataString(chunk, "granularity");
  const parentArtifactId = chunkMetadataString(chunk, "parentArtifactId");
  const fragmentRange = chunkFragmentRange(chunk);
  const materialization = chunkMaterialization(chunk);
  return {
    id: chunk.id || `chunk-${offset + 1}`,
    index: offset + 1,
    title: chunk.title || headingTitle(text, `切片 ${offset + 1}`),
    text,
    sourceName: chunk.sourceName || chunkingSourceName(),
    tokens,
    chars: Number(chunk.charCount || text.length),
    overlap: Number(chunk.overlapTokenCount || 0),
    quality,
    boundary:
      quality === "good"
        ? "后端边界"
        : quality === "warn"
          ? "偏短"
          : "需复核",
    anchors: [
      ...(headingPath.length ? headingPath : [chunkingModeLabel.value]),
      granularity || materialization,
      chunk.sectionId ? `section:${String(chunk.sectionId).split("::").pop()}` : String(chunk.chunkType || "section"),
      tableLines ? `table:${tableLines}` : "text",
      chunkingKeepEvidence.value && hasEvidence ? "evidence" : "context",
    ],
    sourceStartLine,
    sourceEndLine,
    parentArtifactId,
    granularity,
    fragmentRange,
    materialization,
  };
}

const chunkingPreviews = ref<ChunkPreview[]>([]);
const chunkingPreviewBusy = ref(false);
const chunkingPreviewError = ref("");
const chunkingPreviewStatus = ref("");
const chunkingPreviewGeneratedAt = ref("");
const chunkingStructureArtifactCount = ref(0);
const chunkingGranularityFragmentCount = ref(0);
const chunkingPayloadTruncated = ref(false);
let chunkingPreviewRequestId = 0;
let chunkingPreviewTimer: ReturnType<typeof setTimeout> | null = null;

function chunkingPreviewAttachmentFiles() {
  if (chunkingDocumentSource.value !== "attachments") {
    return [];
  }
  return chunkingAttachments.value
    .map((attachment) => attachment.file)
    .filter((file): file is File => Boolean(file));
}

async function buildChunkingPreviewUploadedFiles(files: File[]) {
  return createKnowledgeUploadedFilesPayload(files, {
    onProgress: (progress) => {
      chunkingPreviewStatus.value =
        progress.stage === "upload" ? `准备预览输入 ${progress.percent}%` : progress.message;
    },
  });
}

async function refreshChunkingBackendPreview() {
  const requestId = chunkingPreviewRequestId + 1;
  chunkingPreviewRequestId = requestId;
  const text = chunkingDocument.value.trim();
  const attachmentFiles = chunkingPreviewAttachmentFiles();
  if (!text && attachmentFiles.length === 0) {
    chunkingPreviews.value = [];
    chunkingStructureArtifactCount.value = 0;
    chunkingGranularityFragmentCount.value = 0;
    chunkingPayloadTruncated.value = false;
    chunkingPreviewError.value = "";
    chunkingPreviewStatus.value = "";
    chunkingPreviewGeneratedAt.value = "";
    chunkingPreviewBusy.value = false;
    return;
  }
  if (!isAuthenticated.value || knowledgeTab.value !== "chunking") {
    chunkingPreviewBusy.value = false;
    chunkingPreviewStatus.value = "";
    return;
  }
  chunkingPreviewBusy.value = true;
  chunkingPreviewError.value = "";
  chunkingPreviewStatus.value = attachmentFiles.length
    ? "准备后端文件解析 dry-run..."
    : "后端文档解析入口正在生成切片...";
  try {
    const config = chunkingDocumentParsingConfig();
    const uploadedFiles = attachmentFiles.length
      ? await buildChunkingPreviewUploadedFiles(attachmentFiles)
      : [];
    if (requestId !== chunkingPreviewRequestId) {
      return;
    }
    chunkingPreviewStatus.value = "后端文档解析入口正在生成切片...";
    const result = await bridge.parseDocument({
      ...config,
      inputText: uploadedFiles.length ? "" : text,
      filePaths: [],
      uploadedFiles,
      settings: settingsDraft.value,
      dryRun: true,
    });
    if (requestId !== chunkingPreviewRequestId) {
      return;
    }
    chunkingPreviewGeneratedAt.value = result.generatedAt || "";
    chunkingStructureArtifactCount.value = Number(
      result.summary?.structureArtifacts || result.structureArtifacts?.length || 0,
    );
    chunkingGranularityFragmentCount.value = Number(
      result.summary?.granularityFragments || result.granularityFragments?.length || 0,
    );
    chunkingPayloadTruncated.value = Boolean(result.payload?.truncated);
    chunkingPreviewStatus.value = "";
    chunkingPreviews.value = result.chunks.map(chunkPreviewFromBackend);
    if (!chunkingPreviews.value.some((chunk) => chunk.id === selectedChunkId.value)) {
      selectedChunkId.value = chunkingPreviews.value[0]?.id || "";
    }
  } catch (nextError) {
    if (requestId !== chunkingPreviewRequestId) {
      return;
    }
    chunkingPreviews.value = [];
    chunkingStructureArtifactCount.value = 0;
    chunkingGranularityFragmentCount.value = 0;
    chunkingPayloadTruncated.value = false;
    chunkingPreviewStatus.value = "";
    chunkingPreviewError.value = nextError instanceof Error ? nextError.message : "后端文档解析失败。";
  } finally {
    if (requestId === chunkingPreviewRequestId) {
      chunkingPreviewBusy.value = false;
    }
  }
}

function scheduleChunkingBackendPreview() {
  if (chunkingPreviewTimer) {
    clearTimeout(chunkingPreviewTimer);
  }
  chunkingPreviewTimer = setTimeout(() => {
    void refreshChunkingBackendPreview();
  }, 250);
}

const selectedChunk = computed(() =>
  chunkingPreviews.value.find((chunk) => chunk.id === selectedChunkId.value) ||
  chunkingPreviews.value[0] ||
  null,
);

const chunkingPreviewDisplayModeLabel = computed(() =>
  chunkingPreviewDisplayMode.value === "preview" ? "预览模式" : "原文模式",
);

function chunkRenderHint(chunk: ChunkPreview | null) {
  if (!chunk) {
    return "";
  }
  return [
    chunk.sourceName,
    chunk.title,
    chunk.granularity,
    chunk.materialization,
    chunk.anchors.join(" "),
  ].map((item) => String(item || "").toLowerCase()).join("\n");
}

function chunkRenderKind(chunk: ChunkPreview | null): ChunkRenderKind {
  if (!chunk) {
    return "text";
  }
  const text = String(chunk.text || "");
  const hint = chunkRenderHint(chunk);
  if (
    /\.html?\b|text\/html/.test(hint) ||
    /^\s*(<!doctype\s+html|<html|<body)\b/i.test(text) ||
    /<\/(?:p|div|section|article|ul|ol|li|table|thead|tbody|tr|td|th|h[1-6]|pre|blockquote)>/i.test(text)
  ) {
    return "html";
  }
  if (
    /\.md\b|\.markdown\b|text\/markdown/.test(hint) ||
    /(^|\n)\s*(#{1,6}\s+|[-*]\s+|\d+\.\s+|>\s+|```|\|.+\|)/.test(text)
  ) {
    return "markdown";
  }
  return "text";
}

function chunkRenderKindLabel(chunk: ChunkPreview | null) {
  const kind = chunkRenderKind(chunk);
  if (kind === "html") {
    return "HTML";
  }
  if (kind === "markdown") {
    return "Markdown";
  }
  return "Text";
}

function chunkPlainTextToHtml(text: string) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtmlText(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

function chunkHtmlToSafeHtml(text: string) {
  const source = String(text || "");
  if (!source.trim()) {
    return chunkPlainTextToHtml("暂无内容");
  }
  if (typeof DOMParser === "undefined") {
    return sanitizeHtmlContent(source);
  }
  const document = new DOMParser().parseFromString(
    /^\s*(<!doctype\s+html|<html|<body)\b/i.test(source)
      ? source
      : `<!doctype html><html><body>${source}</body></html>`,
    "text/html",
  );
  return sanitizeHtmlContent(document.body?.innerHTML || source);
}

function chunkRenderedHtml(chunk: ChunkPreview | null) {
  if (!chunk) {
    return chunkPlainTextToHtml("暂无内容");
  }
  if (chunkRenderKind(chunk) === "html") {
    return chunkHtmlToSafeHtml(chunk.text);
  }
  if (chunkRenderKind(chunk) === "markdown") {
    return markdownToSafeHtml(chunk.text);
  }
  return chunkPlainTextToHtml(chunk.text || "暂无内容");
}

const chunkingAverageTokens = computed(() => {
  if (!chunkingPreviews.value.length) {
    return 0;
  }
  return Math.round(
    chunkingPreviews.value.reduce((sum, chunk) => sum + chunk.tokens, 0) /
      chunkingPreviews.value.length,
  );
});

const chunkingRiskCount = computed(() =>
  chunkingPreviews.value.filter((chunk) => chunk.quality === "risk").length,
);

const chunkingModeLabel = computed(
  () => chunkingModeOptions.find((option) => option.value === chunkingMode.value)?.label || "标题优先",
);

const chunkingAttachmentSummary = computed(() => {
  if (chunkingAttachments.value.length === 0) {
    return "未添加附件";
  }
  const ready = chunkingAttachments.value.filter((attachment) => attachment.status === "ready").length;
  const pending = chunkingAttachments.value.filter((attachment) => attachment.status === "pending").length;
  return `${chunkingAttachments.value.length} 个附件 · ${ready} 可切分 · ${pending} 待解析`;
});

const chunkingHistoryBusyId = ref("");
const chunkingHistoryRefreshing = ref(false);

function chunkingJobReceipt(job: SplitJob) {
  return ((job as SplitJob & { checkpointReceipt?: Record<string, unknown> }).checkpointReceipt || {}) as Record<string, unknown>;
}

function chunkingJobFiles(job: SplitJob) {
  const receipt = chunkingJobReceipt(job);
  const files = Array.isArray(receipt.files)
    ? receipt.files
    : Array.isArray(receipt.fileSamples)
      ? receipt.fileSamples
      : [];
  return files
    .map((file) => {
      const record = file as Record<string, unknown>;
      return String(record.originalFileName || record.relativePath || record.name || "").trim();
    })
    .filter(Boolean);
}

function isChunkingHistoryJob(job: SplitJob) {
  const receipt = chunkingJobReceipt(job);
  return Boolean(
    job.checkpointId ||
      (job as SplitJob & { uploadSessionId?: string }).uploadSessionId ||
      (job as SplitJob & { archiveBatchId?: string }).archiveBatchId ||
      receipt.checkpointId ||
      receipt.fileCount,
  );
}

const chunkingHistorySnapshot = ref<SplitJob[]>([]);
const chunkingHistoryLoaded = ref(false);
const removedChunkingHistoryJobIds = ref<Set<string>>(new Set());

function markChunkingHistoryRemoved(jobId: string) {
  if (!jobId) {
    return;
  }
  const next = new Set(removedChunkingHistoryJobIds.value);
  next.add(jobId);
  removedChunkingHistoryJobIds.value = next;
}

function unmarkChunkingHistoryRemoved(jobId: string) {
  if (!jobId || !removedChunkingHistoryJobIds.value.has(jobId)) {
    return;
  }
  const next = new Set(removedChunkingHistoryJobIds.value);
  next.delete(jobId);
  removedChunkingHistoryJobIds.value = next;
}

const chunkingHistoryJobs = computed(() =>
  chunkingHistorySnapshot.value
    .filter((job) => !removedChunkingHistoryJobIds.value.has(job.id))
    .filter(isChunkingHistoryJob)
    .sort((left, right) => Math.max(parseTimeFromJob(right), 0) - Math.max(parseTimeFromJob(left), 0))
    .slice(0, 80),
);

function parseTimeFromJob(job: SplitJob) {
  return Date.parse(job.updatedAt || job.createdAt || "") || 0;
}

function chunkingJobTitle(job: SplitJob) {
  const files = chunkingJobFiles(job);
  if (files.length === 1) {
    return files[0];
  }
  if (files.length > 1) {
    return `${files[0]} 等 ${files.length} 个文件`;
  }
  return job.stage || `任务 ${shortId(job.id)}`;
}

function chunkingVersionNumber(job: SplitJob) {
  const version = Number(job.versionNumber || 1);
  return Number.isFinite(version) && version > 0 ? Math.trunc(version) : 1;
}

function chunkingJobMeta(job: SplitJob) {
  const status = jobStatusLabels[job.status] || job.status || "unknown";
  const progress = Number(job.progressPercent || 0);
  return `${formatCompactDate(job.updatedAt || job.createdAt)} · v${chunkingVersionNumber(job)} · ${status} · ${progress}%`;
}

function chunkingJobPreview(job: SplitJob) {
  const files = chunkingJobFiles(job);
  const fileText = files.length ? ` · ${files.slice(0, 3).join("、")}${files.length > 3 ? "…" : ""}` : "";
  const parentText = job.reparseFromJobId || job.parentJobId ? ` · 来源 v${Math.max(1, chunkingVersionNumber(job) - 1)}` : "";
  return `${job.stage || "等待恢复"}${parentText}${job.error ? ` · ${job.error}` : ""}${fileText}`;
}

function isChunkingReparseDisabled(job: SplitJob) {
  return job.status === "queued" || job.status === "running";
}

const chunkingHistoryPanelItems = computed(() =>
  chunkingHistoryLoaded.value
    ? chunkingHistoryJobs.value.map((job) => ({
        id: job.id,
        title: chunkingJobTitle(job),
        meta: chunkingJobMeta(job),
        preview: chunkingJobPreview(job),
        active: ingestJob.value?.id === job.id,
        disabled: chunkingHistoryBusyId.value === job.id,
        actionLabel: "重新解析",
        actionAriaLabel: `重新解析 ${chunkingJobTitle(job)}`,
        actionDisabled: isChunkingReparseDisabled(job),
        deleteText: "移除历史",
        deleteLabel: `移除解析历史 ${chunkingJobTitle(job)}`,
      }))
    : [],
);

const selectedChunkingHistoryJobId = computed(() => {
  const jobId = ingestJob.value?.id || "";
  if (!jobId) {
    return "";
  }
  return chunkingHistoryJobs.value.some((job) => job.id === jobId) ? jobId : "";
});

async function refreshChunkingHistory(options: { clearBefore?: boolean } = {}) {
  if (!isAuthenticated.value || chunkingHistoryRefreshing.value) {
    return;
  }
  if (options.clearBefore) {
    chunkingHistoryLoaded.value = false;
    chunkingHistorySnapshot.value = [];
  }
  chunkingHistoryRefreshing.value = true;
  try {
    const response = await bridge.listJobs(100);
    chunkingHistorySnapshot.value = Array.isArray(response.items) ? response.items : [];
    chunkingHistoryLoaded.value = true;
  } finally {
    chunkingHistoryRefreshing.value = false;
  }
}

function attachmentFromJobFile(job: SplitJob, file: Record<string, unknown>, index: number): ChunkingAttachment {
  const name = String(file.originalFileName || file.relativePath || file.name || `file-${index + 1}`);
  return {
    id: `${job.id}:file:${index}`,
    name,
    relativePath: name,
    mediaType: String(file.mediaType || file.clientMediaType || "application/octet-stream"),
    byteSize: Number(file.byteSize || 0),
    lastModified: Date.parse(job.updatedAt || job.createdAt || "") || Date.now(),
    status: "pending",
    statusLabel: "已入库",
    message: "历史任务已保留，正文需打开完成结果后恢复",
    text: "",
  };
}

function restoreChunkingAttachmentsFromJob(job: SplitJob) {
  const receipt = chunkingJobReceipt(job);
  const files = Array.isArray(receipt.files)
    ? receipt.files
    : Array.isArray(receipt.fileSamples)
      ? receipt.fileSamples
      : [];
  chunkingAttachments.value = files.map((file, index) =>
    attachmentFromJobFile(job, file as Record<string, unknown>, index),
  );
  syncChunkingDocumentFromAttachments();
}

function restoreChunkingFromResult(job: SplitJob, result: SplitResult | null) {
  const sourceFiles = Array.isArray(result?.sourceFiles) ? result.sourceFiles : [];
  if (!sourceFiles.length) {
    restoreChunkingAttachmentsFromJob(job);
    return;
  }
  chunkingAttachments.value = sourceFiles.map((source, index) => {
    const record = source as Record<string, unknown>;
    const name = String(record.originalFileName || record.name || record.path || `source-${index + 1}`);
    const text = String(record.text || "");
    return {
      id: `${job.id}:source:${String(record.id || index)}`,
      name,
      relativePath: String(record.originalRelativePath || record.name || record.path || name),
      mediaType: String(record.mediaType || "application/octet-stream"),
      byteSize: Number(record.rawObjectByteSize || record.originalByteSize || record.byteSize || 0),
      lastModified: Date.parse(String(record.sourceUpdatedAt || record.sourceCreatedAt || job.updatedAt || "")) || Date.now(),
      status: text ? "ready" : "pending",
      statusLabel: text ? "已恢复" : "已入库",
      message: text ? "已从历史解析结果恢复正文" : "历史任务保留了文件记录，未保存可预览正文",
      text,
    };
  });
  syncChunkingDocumentFromAttachments();
}

async function selectChunkingHistoryItem(jobId: string) {
  if (!jobId) {
    return;
  }
  chunkingHistoryBusyId.value = jobId;
  error.value = "";
  try {
    const job = await bridge.getJob(jobId);
    if (!job) {
      throw new Error("历史任务不存在。");
    }
    ingestJob.value = job;
    normalizedManifest.value = null;
    ingestProgress.value =
      job.status === "completed"
        ? "已从历史记录恢复任务。"
        : `已从历史记录恢复任务：${job.stage || job.status}`;
    if (job.status === "completed") {
      const manifest = await bridge.getNormalizedDocuments(job.id).catch(() => null);
      normalizedManifest.value = manifest || null;
      const result = await bridge.getJobResult(job.id).catch(() => null);
      if (!normalizedManifest.value && result?.normalizedDocuments) {
        normalizedManifest.value = result.normalizedDocuments;
      }
      restoreChunkingFromResult(job, result);
      return;
    }
    restoreChunkingAttachmentsFromJob(job);
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "恢复切分历史失败。";
  } finally {
    chunkingHistoryBusyId.value = "";
  }
}

async function reparseChunkingHistoryItem(jobId: string) {
  if (!jobId) {
    return;
  }
  chunkingHistoryBusyId.value = jobId;
  error.value = "";
  try {
    const job = await bridge.reparseJob(jobId, {
      documentParsing: chunkingDocumentParsingConfig(),
      settings: settingsDraft.value,
    });
    ingestJob.value = job;
    normalizedManifest.value = null;
    ingestProgress.value = `已创建重新解析版本 v${chunkingVersionNumber(job)}，旧版本仍保留在切分历史中。`;
    await refreshState({ silent: true });
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "重新解析历史文档失败。";
  } finally {
    chunkingHistoryBusyId.value = "";
  }
}

async function deleteChunkingHistoryItem(jobId: string) {
  if (!jobId || chunkingHistoryBusyId.value) {
    return;
  }
  const job = chunkingHistoryJobs.value.find((item) => item.id === jobId);
  const title = job ? chunkingJobTitle(job) : shortId(jobId);
  if (!window.confirm(`移除解析历史“${title}”？这会从历史列表删除该任务记录，不会删除你的本地原始文件。`)) {
    return;
  }

  chunkingHistoryBusyId.value = jobId;
  error.value = "";
  markChunkingHistoryRemoved(jobId);
  chunkingHistorySnapshot.value = chunkingHistorySnapshot.value.filter((item) => item.id !== jobId);
  try {
    await bridge.deleteJob(jobId);
    if (ingestJob.value?.id === jobId) {
      ingestJob.value = null;
      normalizedManifest.value = null;
      ingestProgress.value = "";
      chunkingAttachments.value = [];
      syncChunkingDocumentFromAttachments();
      chunkingPreviews.value = [];
      chunkingStructureArtifactCount.value = 0;
      chunkingGranularityFragmentCount.value = 0;
      chunkingPayloadTruncated.value = false;
      chunkingPreviewError.value = "";
      chunkingPreviewStatus.value = "";
      chunkingPreviewGeneratedAt.value = "";
      selectedChunkId.value = "";
    }
    await Promise.all([
      refreshChunkingHistory(),
      refreshState({ silent: true }),
    ]);
  } catch (nextError) {
    unmarkChunkingHistoryRemoved(jobId);
    await refreshChunkingHistory().catch(() => null);
    error.value = nextError instanceof Error ? nextError.message : "移除解析历史失败。";
  } finally {
    chunkingHistoryBusyId.value = "";
  }
}

watch(
  [knowledgeTab, isAuthenticated],
	  ([tab, authenticated]) => {
	    if (tab === "chunking" && authenticated) {
	      void refreshChunkingHistory({ clearBefore: true });
	    }
	  },
  { immediate: true },
);

watch(
  [
    knowledgeTab,
    isAuthenticated,
    chunkingDocument,
    chunkingMode,
    chunkingChunkSize,
    chunkingOverlap,
    chunkingHeadingDepth,
    chunkingKeepTables,
    chunkingKeepEvidence,
  ],
  () => {
    scheduleChunkingBackendPreview();
  },
  { immediate: true },
);

function chunkQualityTone(quality: ChunkQuality) {
  return quality === "good" ? "success" : quality === "warn" ? "warning" : "danger";
}

function chunkSourceRange(chunk: ChunkPreview) {
  return `${chunk.sourceName || "document.md"}#L${chunk.sourceStartLine}-L${chunk.sourceEndLine}`;
}
</script>

<template>
          <section class="knowledge-layout">
            <KnowledgeImportCard
              v-if="isKnownKnowledgeTab"
              :mode-label="knowledgeImportModeLabel"
              :mode-description="knowledgeImportModeDescription"
              :can-read-knowledge="canReadKnowledge"
              :can-write-jobs="canWriteJobs"
              :busy-key="busyKey"
              :ingest-progress="ingestProgress"
              :ingest-job="ingestJob"
              :normalized-manifest="normalizedManifest"
              :job-status-labels="jobStatusLabels"
              :job-status-tone="jobStatusTone"
              :format-bytes="formatBytes"
              :accept="chunkingAttachmentAccept"
              @select="handleKnowledgeImportFiles"
              @upload="uploadKnowledgeImportFiles"
              @refresh="refreshIngestJob"
            />

            <KnowledgeDistillationWorkbench
              v-if="knowledgeTab === 'distillation'"
              :can-read-knowledge="canReadKnowledge"
              :can-maintain-knowledge="canMaintainKnowledge"
              :ingest-job="ingestJob"
              :normalized-manifest="normalizedManifest"
              :format-compact-date="formatCompactDate"
              :model-options="agentModelOptions"
            />

            <article v-if="knowledgeTab === 'chunking'" class="surface-card document-chunking-console">
              <div class="section-header document-chunking-header">
	                <div>
	                  <h3>文档切分</h3>
	                  <p>面向统一文档解析入口的后端切片 dry-run。</p>
	                </div>
	                <div class="section-tags">
	                  <span>{{ chunkingModeLabel }}</span>
	                  <span>{{ chunkingPreviews.length }} 个切片</span>
	                  <span>{{ chunkingAttachments.length }} 个附件</span>
	                  <span>{{ chunkingPreviewBusy ? (chunkingPreviewStatus || "后端解析中") : `${chunkingAverageTokens} avg tokens` }}</span>
	                  <span v-if="chunkingPreviewGeneratedAt">{{ formatCompactDate(chunkingPreviewGeneratedAt) }}</span>
	                </div>
              </div>

              <div class="document-chunking-grid">
                <section class="document-chunking-editor" aria-label="切分配置">
                  <div class="compact-section-header">
	                    <div>
	                      <h4>输入与后端链路</h4>
	                      <span>{{ chunkingDocument.length }} chars</span>
	                    </div>
                    <div class="document-chunking-header-actions">
	                      <button
	                        class="tool-button tool-button-ghost"
	                        type="button"
	                        :disabled="chunkingHistoryRefreshing"
	                        @click="refreshChunkingHistory"
                      >
                        {{ chunkingHistoryRefreshing ? "刷新中" : "刷新历史" }}
                      </button>
	                      <button
	                        class="tool-button danger-action"
	                        type="button"
	                        :disabled="!selectedChunkingHistoryJobId || Boolean(chunkingHistoryBusyId)"
	                        @click="deleteChunkingHistoryItem(selectedChunkingHistoryJobId)"
	                      >
	                        移除当前历史
	                      </button>
	                    </div>
	                  </div>

		                  <HistorySessionPanel
		                    class="document-chunking-history"
		                    title="解析历史"
		                    :subtitle="chunkingHistoryRefreshing ? '同步中' : `${chunkingHistoryPanelItems.length} 条`"
                    :items="chunkingHistoryPanelItems"
                    max-height="260px"
                    open
                    @select="selectChunkingHistoryItem"
                    @action="reparseChunkingHistoryItem"
                    @delete="deleteChunkingHistoryItem"
                  />

                  <div v-if="chunkingAttachments.length" class="document-chunking-attachments">
                    <div class="compact-section-header">
                      <div>
                        <h4>附件</h4>
                        <span>{{ chunkingAttachmentSummary }}</span>
                      </div>
	                      <button class="tool-button tool-button-ghost" type="button" @click="clearChunkingAttachments">
	                        清空附件
	                      </button>
                    </div>
                    <div class="document-chunking-attachment-list" role="list" aria-label="文档附件列表">
                      <div
                        v-for="attachment in chunkingAttachments"
                        :key="attachment.id"
                        class="document-chunking-attachment-row"
                        role="listitem"
                      >
                        <span class="document-chunking-attachment-icon" aria-hidden="true">
                          {{ chunkingAttachmentExtension(attachment.name).slice(0, 3).toUpperCase() || "DOC" }}
                        </span>
                        <span class="document-chunking-attachment-main">
                          <strong>{{ attachment.relativePath }}</strong>
                          <small>{{ formatBytes(attachment.byteSize) }} · {{ attachment.message }}</small>
                        </span>
                        <StatusPill
                          :tone="chunkingAttachmentTone(attachment.status)"
                          :label="attachment.statusLabel"
                        />
                        <button
	                          class="tool-button tool-button-ghost document-chunking-attachment-remove"
	                          type="button"
	                          @click="removeChunkingAttachment(attachment.id)"
	                        >
	                          移出附件
	                        </button>
                      </div>
                    </div>
                  </div>

                  <textarea
                    v-model="chunkingDocument"
                    class="document-chunking-input"
                    spellcheck="false"
                    aria-label="待切分文档"
                    @input="onChunkingDocumentInput"
                  />

                  <div class="document-chunking-controls">
                    <label>
                      <span>切分策略</span>
                      <select v-model="chunkingMode">
                        <option
                          v-for="option in chunkingModeOptions"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </option>
                      </select>
                    </label>
                    <label>
                      <span>目标 token</span>
                      <input v-model.number="chunkingChunkSize" min="80" max="640" step="20" type="number" />
                    </label>
                    <label>
                      <span>重叠 token</span>
                      <input v-model.number="chunkingOverlap" min="0" max="180" step="8" type="number" />
                    </label>
                    <label>
                      <span>标题层级</span>
                      <select v-model="chunkingHeadingDepth">
                        <option value="H1">H1</option>
                        <option value="H2">H2</option>
                        <option value="H3">H3</option>
                      </select>
                    </label>
                  </div>

                  <div class="document-chunking-switches">
                    <label>
                      <span>保留表格边界</span>
                      <FeatureToggle
                        :model-value="chunkingKeepTables"
                        aria-label="保留表格边界"
                        @update:model-value="chunkingKeepTables = $event"
                      />
                    </label>
                    <label>
                      <span>保留证据锚点</span>
                      <FeatureToggle
                        :model-value="chunkingKeepEvidence"
                        aria-label="保留证据锚点"
                        @update:model-value="chunkingKeepEvidence = $event"
                      />
                    </label>
                  </div>
                </section>

	                <section class="document-chunking-preview" aria-label="切片预览">
	                  <p v-if="chunkingPreviewBusy" class="module-note">{{ chunkingPreviewStatus || "后端文档解析入口正在生成切片…" }}</p>
	                  <p v-else-if="chunkingPreviewError" class="module-note">{{ chunkingPreviewError }}</p>
	                  <div class="detail-metrics document-chunking-metrics">
                    <div>
                      <span>切片数</span>
                      <strong>{{ chunkingPreviews.length }}</strong>
                    </div>
                    <div>
                      <span>结构物</span>
                      <strong>{{ chunkingStructureArtifactCount }}</strong>
                    </div>
                    <div>
                      <span>粒度片段</span>
                      <strong>{{ chunkingGranularityFragmentCount }}</strong>
                    </div>
                    <div>
                      <span>平均 token</span>
                      <strong>{{ chunkingAverageTokens }}</strong>
                    </div>
                    <div>
                      <span>重叠</span>
                      <strong>{{ chunkingOverlap }}</strong>
                    </div>
                    <div>
                      <span>需复核</span>
                      <strong>{{ chunkingRiskCount }}</strong>
                    </div>
                    <div>
                      <span>Payload</span>
                      <strong>{{ chunkingPayloadTruncated ? "截断" : "完整" }}</strong>
                    </div>
                  </div>

	                  <div class="document-chunking-pipeline" aria-label="切分流水线">
	                    <div>
	                      <strong>Parse</strong>
	                      <span>统一文档解析入口</span>
	                    </div>
	                    <div>
	                      <strong>Split</strong>
	                      <span>{{ chunkingModeLabel }} · 后端链路</span>
	                    </div>
	                    <div>
	                      <strong>Anchor</strong>
                      <span>sourceRange / parentArtifactId</span>
                    </div>
                  </div>

                  <section class="document-chunk-block-section" aria-label="分块视图">
                    <div class="compact-section-header">
                      <div>
                        <h4>分块视图</h4>
                        <span>{{ chunkingPreviews.length }} chunks · {{ chunkingPreviewDisplayModeLabel }}</span>
                      </div>
                      <div class="document-chunking-mode-toggle" role="group" aria-label="切片显示模式">
                        <button
                          v-for="option in chunkingPreviewDisplayModeOptions"
                          :key="option.value"
                          type="button"
                          :class="{ active: chunkingPreviewDisplayMode === option.value }"
                          :aria-pressed="chunkingPreviewDisplayMode === option.value"
                          @click="chunkingPreviewDisplayMode = option.value"
                        >
                          {{ option.label }}
                        </button>
                      </div>
                    </div>
                    <div class="document-chunk-blocks" role="list" aria-label="分块列表">
                      <article
                        v-for="chunk in chunkingPreviews"
                        :key="`source-${chunk.id}`"
                        class="document-chunk-block"
                        :class="{ active: selectedChunk?.id === chunk.id }"
                        role="listitem"
                      >
                        <span v-if="chunk.index > 1" class="document-chunk-split-line">
                          <span>切分边界</span>
                        </span>
                        <button
                          class="document-chunk-block-select"
                          type="button"
                          @click="selectedChunkId = chunk.id"
                        >
                          <span class="document-chunk-block-title">
                            <strong>Chunk {{ chunk.index }}</strong>
                            <small>
                              {{ chunkSourceRange(chunk) }} · {{ chunk.tokens }} tokens ·
                              {{ chunkingPreviewDisplayMode === "preview" ? chunkRenderKindLabel(chunk) : "Source" }}
                            </small>
                          </span>
                          <StatusPill :tone="chunkQualityTone(chunk.quality)" :label="chunk.boundary" />
                        </button>
                        <div
                          v-if="chunkingPreviewDisplayMode === 'preview'"
                          class="document-chunk-block-rendered evidence-rendered-content"
                          :data-render-kind="chunkRenderKind(chunk)"
                          v-html="chunkRenderedHtml(chunk)"
                        ></div>
                        <pre v-else>{{ chunk.text }}</pre>
                      </article>
                    </div>
                  </section>

                  <div class="document-chunking-list" role="list" aria-label="切片列表">
                    <button
                      v-for="chunk in chunkingPreviews"
                      :key="chunk.id"
                      class="document-chunk-card"
                      :class="{ active: selectedChunk?.id === chunk.id }"
                      type="button"
                      role="listitem"
                      @click="selectedChunkId = chunk.id"
                    >
                      <span class="document-chunk-index">{{ chunk.index }}</span>
                      <span class="document-chunk-main">
                        <strong>{{ chunk.title }}</strong>
                        <small>{{ chunk.tokens }} tokens · {{ chunk.chars }} chars · overlap {{ chunk.overlap }}</small>
                      </span>
                      <StatusPill :tone="chunkQualityTone(chunk.quality)" :label="chunk.boundary" />
                    </button>
                  </div>
                </section>

                <aside class="document-chunking-inspector" aria-label="切片详情">
                  <div class="compact-section-header">
                    <div>
                      <h4>{{ selectedChunk?.title || "无切片" }}</h4>
                      <span>
                        {{ selectedChunk?.id || "chunk-empty" }} ·
                        {{ chunkingPreviewDisplayModeLabel }} ·
                        {{ chunkRenderKindLabel(selectedChunk) }}
                      </span>
                    </div>
                    <StatusPill
                      v-if="selectedChunk"
                      :tone="chunkQualityTone(selectedChunk.quality)"
                      :label="selectedChunk.boundary"
                    />
                  </div>

                  <dl v-if="selectedChunk" class="module-status-list document-chunking-detail">
                    <div>
                      <dt>Token</dt>
                      <dd>{{ selectedChunk.tokens }}</dd>
                    </div>
                    <div>
                      <dt>Source Range</dt>
                      <dd>{{ chunkSourceRange(selectedChunk) }}</dd>
                    </div>
                    <div>
                      <dt>Anchor Path</dt>
                      <dd>{{ selectedChunk.anchors.join(" / ") }}</dd>
                    </div>
                    <div>
                      <dt>Parent Artifact</dt>
                      <dd>{{ selectedChunk.parentArtifactId || "n/a" }}</dd>
                    </div>
                    <div>
                      <dt>Granularity</dt>
                      <dd>{{ selectedChunk.granularity || selectedChunk.materialization }}</dd>
                    </div>
                    <div>
                      <dt>Fragment Range</dt>
                      <dd>{{ selectedChunk.fragmentRange || "n/a" }}</dd>
                    </div>
                  </dl>

                  <div
                    v-if="selectedChunk && chunkingPreviewDisplayMode === 'preview'"
                    class="document-chunking-rendered evidence-rendered-content"
                    :data-render-kind="chunkRenderKind(selectedChunk)"
                    v-html="chunkRenderedHtml(selectedChunk)"
                  ></div>
                  <pre v-else class="document-chunking-text">{{ selectedChunk?.text || "暂无内容" }}</pre>
                </aside>
              </div>
            </article>

            <template v-if="knowledgeTab === 'wordCloud'">
              <article class="surface-card word-cloud-stage">
                <div class="section-header">
                  <div>
                    <h3>词云</h3>
                    <p>{{ wordCloudDraft?.title || "语料词云" }} · {{ wordCloudTerms.length }} 个语料词 · {{ wordCloudCardRows.length }} 张卡片</p>
                  </div>
                  <div class="source-actions">
                    <button
                      class="tool-button tool-button-ghost"
                      type="button"
                      :disabled="busyKey === 'knowledge:word-clouds'"
                      @click="refreshWordCloud"
                    >
                      {{ busyKey === "knowledge:word-clouds" ? "刷新中" : "刷新" }}
                    </button>
                    <button
                      class="tool-button tool-button-ghost"
                      type="button"
                      :disabled="!canReadKnowledge || busyKey === 'knowledge:word-clouds:export'"
                      @click="exportWordCloudSet"
                    >
                      {{ busyKey === "knowledge:word-clouds:export" ? "导出中" : "导出" }}
                    </button>
                    <input
                      id="word-cloud-import-file"
                      type="file"
                      accept="application/json,.json"
                      style="display: none"
                      @change="importWordCloudSetFromFile"
                    />
                    <button
                      class="tool-button tool-button-ghost"
                      type="button"
                      :disabled="!canWriteKnowledge || busyKey === 'knowledge:word-clouds:import'"
                      @click="triggerWordCloudImport"
                    >
                      {{ busyKey === "knowledge:word-clouds:import" ? "导入中" : "导入" }}
                    </button>
                    <BrowseSelectButton
                      kind="server-directory"
                      button-class="tool-button tool-button-ghost"
                      button-text="浏览目录"
                      :disabled="!canBrowseServerPaths || busyKey === 'knowledge:word-clouds:scope'"
                      @browse="openWordCloudCorpusDirectoryPicker"
                    />
                    <BrowseSelectButton
                      kind="server-file"
                      button-class="tool-button tool-button-ghost"
                      button-text="浏览文件"
                      :disabled="!canBrowseServerPaths || busyKey === 'knowledge:word-clouds:scope'"
                      @browse="openWordCloudCorpusFilePicker"
                    />
                    <button class="tool-button" type="button" @click="addManualWordCloud">
                      新增词云
                    </button>
                    <button
                      class="primary-action"
                      type="button"
                      :disabled="!canWriteKnowledge || busyKey === 'knowledge:word-clouds:save'"
                      @click="saveWordCloud"
                    >
                      {{ busyKey === "knowledge:word-clouds:save" ? "保存中" : "保存" }}
                    </button>
                  </div>
                </div>

                <p class="word-cloud-stage-note">
                  每朵词云就是一个词袋：词袋名、吸附阈值、说明、词条列表和新增词条都会直接保存，并原样交给智能体判断。
                </p>

                <div class="word-cloud-corpus-scope">
                  <div>
                    <strong>语料范围</strong>
                    <span>{{ wordCloudCorpusPathSummary }}</span>
                  </div>
                  <div v-if="wordCloudCorpusPaths.length" class="word-cloud-corpus-path-list">
                    <span
                      v-for="(item, index) in wordCloudCorpusPaths"
                      :key="`${item.type}:${item.path}`"
                      class="word-cloud-corpus-path"
                    >
                      <em>{{ wordCloudCorpusPathLabel(item) }}</em>
                      <span>{{ item.path }}</span>
                      <button type="button" aria-label="移除语料路径" @click="removeWordCloudCorpusPath(index)">×</button>
                    </span>
                    <button class="inline-link" type="button" @click="clearWordCloudCorpusPaths">
                      清空
                    </button>
                  </div>
                </div>

                <div class="word-cloud-architecture">
                  <div class="word-cloud-card-list" role="list" aria-label="词云分类卡片">
                    <article
                      v-for="(row, index) in wordCloudCardRows"
                      :key="row.cloud.wordBagId"
                      class="word-cloud-class-card"
                      :class="{ active: selectedWordCloud?.wordBagId === row.cloud.wordBagId }"
                      :style="wordCloudCardStyle(row, index)"
                      :data-word-bag-id="row.cloud.wordBagId"
                      role="listitem"
                      @click="selectWordCloud(row.cloud); toggleWordCloudCollapsed(row.cloud.wordBagId)"
                    >
                      <header class="word-cloud-card-header">
                        <div class="word-cloud-title-wrap">
                          <input
                            class="word-cloud-card-title-input"
                            :class="{
                              'has-confirm': titleFocusedWordBagId === row.cloud.wordBagId && selectedWordCloudModel.enabled && !fillingWordBagIds.has(row.cloud.wordBagId) && !isWordCloudPresetCard(row.cloud),
                              locked: isWordCloudPresetCard(row.cloud),
                            }"
                            :value="row.cloud.label"
                            type="text"
                            autocomplete="off"
                            placeholder="未命名词袋"
                            :readonly="isWordCloudPresetCard(row.cloud)"
                            :aria-readonly="isWordCloudPresetCard(row.cloud)"
                            :title="isWordCloudPresetCard(row.cloud) ? '预设词袋标题不可更改' : '可编辑词袋标题'"
                            @click.stop
                            @focus="!isWordCloudPresetCard(row.cloud) && (titleFocusedWordBagId = row.cloud.wordBagId)"
                            @blur="titleFocusedWordBagId = null"
                            @input="!isWordCloudPresetCard(row.cloud) && updateWordCloudField(row.cloud.wordBagId, 'label', ($event.target as HTMLInputElement).value)"
                          />
                          <!-- Spinner when filling -->
                          <span v-if="fillingWordBagIds.has(row.cloud.wordBagId)" class="word-cloud-title-filling" title="智能体正在填充词云…">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="word-cloud-title-spin">
                              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                            </svg>
                          </span>
                          <!-- Confirm button when focused and model available -->
                          <button
                            v-else-if="titleFocusedWordBagId === row.cloud.wordBagId && selectedWordCloudModel.enabled && !isWordCloudPresetCard(row.cloud)"
                            class="word-cloud-title-confirm-btn"
                            type="button"
                            title="调用智能体填充相关词汇"
                            aria-label="填充词汇"
                            @mousedown.prevent
                            @click.stop="autoFillCloudWithAgent(row.cloud.wordBagId)"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                              <path d="M12 2a10 10 0 0 1 7.38 16.8"/>
                              <polyline points="16 12 12 8 8 12"/>
                              <line x1="12" y1="8" x2="12" y2="16"/>
                            </svg>
                          </button>
                        </div>
                        <div class="word-cloud-card-corner-actions" @click.stop>
                          <!-- pin button -->
                          <button
                            class="word-cloud-corner-btn"
                            type="button"
                            :class="{ active: pinnedWordBagIds.has(row.cloud.wordBagId) }"
                            :title="pinnedWordBagIds.has(row.cloud.wordBagId) ? '取消置顶' : '置顶此词云'"
                            :aria-label="pinnedWordBagIds.has(row.cloud.wordBagId) ? '取消置顶' : '置顶'"
                            @click="pinWordCloud(row.cloud.wordBagId)"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                              <line x1="12" y1="17" x2="12" y2="22"/>
                              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
                            </svg>
                          </button>
                          <!-- add button + popover -->
                          <div v-if="!isWordCloudPresetCard(row.cloud)" class="word-cloud-header-add-wrap">
                            <button
                              class="word-cloud-corner-btn word-cloud-corner-add-btn"
                              type="button"
                              title="新增"
                              aria-label="新增"
                              @click.stop="toggleWordCloudActionMenu(row.cloud.wordBagId)"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <line x1="12" y1="5" x2="12" y2="19"/>
                                <line x1="5" y1="12" x2="19" y2="12"/>
                              </svg>
                            </button>
                            <div
                              v-if="wordBagActionMenuId === row.cloud.wordBagId"
                              class="word-cloud-action-popover"
                              @click.stop
                            >
                              <button type="button" @click="addChildWordCloud(row.cloud.wordBagId)">新增分组</button>
                            </div>
                          </div>
                          <!-- collapse/expand button -->
                          <button
                            class="word-cloud-corner-btn"
                            type="button"
                            :aria-label="collapsedWordBagIds.has(row.cloud.wordBagId) ? '展开词云' : '收起词云'"
                            :title="collapsedWordBagIds.has(row.cloud.wordBagId) ? '展开' : '收起'"
                            @click="toggleWordCloudCollapsed(row.cloud.wordBagId)"
                          >
                            <svg v-if="collapsedWordBagIds.has(row.cloud.wordBagId)" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                              <polyline points="6 9 12 15 18 9"/>
                            </svg>
                            <svg v-else xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                              <polyline points="18 15 12 9 6 15"/>
                            </svg>
                          </button>
                        </div>
                      </header>
                      <div class="word-cloud-card-tag-bar" @click.stop>
                        <span class="word-cloud-meta-badge">{{ row.cloud.terms.length }} 词汇</span>
                        <template v-if="row.cloud.children?.length">
                          <span class="word-cloud-meta-sep">·</span>
                          <span class="word-cloud-meta-badge">{{ row.cloud.children.length }} 分组</span>
                          <button
                            v-for="child in row.cloud.children"
                            :key="child.wordBagId"
                            class="word-cloud-child-tag"
                            type="button"
                            @click.stop="jumpToCloud(child.wordBagId)"
                          >{{ child.label || '未命名' }}</button>
                        </template>
                      </div>
                      <div class="word-cloud-card-body" v-show="!collapsedWordBagIds.has(row.cloud.wordBagId)" @click.stop>
                        <div class="word-cloud-summary-toggle" @click.stop="toggleAdvancedExpanded(row.cloud.wordBagId)">
                          <span>高级参数</span>
                          <svg
                            class="word-cloud-summary-chevron"
                            :class="{ expanded: expandedAdvancedIds.has(row.cloud.wordBagId) }"
                            xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" stroke-width="2.5"
                            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                          >
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </div>
                        <div class="word-cloud-summary-body" v-show="expandedAdvancedIds.has(row.cloud.wordBagId)">
                          <label class="word-cloud-field word-cloud-threshold-field">
                            <span>吸附阈值</span>
                            <input
                              :value="formatWordCloudThreshold(row.cloud.absorbThreshold)"
                              type="number"
                              min="0"
                              max="1"
                              step="0.01"
                              inputmode="decimal"
                              @input="updateWordCloudField(row.cloud.wordBagId, 'absorbThreshold', ($event.target as HTMLInputElement).value)"
                            />
                            <small>越高越保守，越低越容易自动吸词。</small>
                          </label>
                        </div>
                        <div class="word-cloud-summary-toggle" @click.stop="toggleSummaryExpanded(row.cloud.wordBagId)">
                          <span>分组说明</span>
                          <svg
                            class="word-cloud-summary-chevron"
                            :class="{ expanded: expandedSummaryIds.has(row.cloud.wordBagId) }"
                            xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" stroke-width="2.5"
                            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
                          >
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </div>
                        <div class="word-cloud-summary-body" v-show="expandedSummaryIds.has(row.cloud.wordBagId)">
                          <textarea
                            class="word-cloud-card-summary"
                            :value="row.cloud.summary || ''"
                            rows="3"
                            placeholder="用一句话描述这个分组的用途，让智能体更准确地使用它。"
                            @click.stop
                            @input="updateWordCloudField(row.cloud.wordBagId, 'summary', ($event.target as HTMLTextAreaElement).value)"
                          />
                        </div>
                        <div class="word-cloud-term-list">
                          <div
                            v-for="term in wordCloudVisibleTerms(row.cloud)"
                            :key="`${row.cloud.wordBagId}:${term.removed ? 'removed' : 'active'}:${term.term}`"
                            class="word-cloud-term-row"
                            :class="{ removed: term.removed }"
                          >
                            <div class="word-cloud-term-label">
                              <span>{{ term.term }}</span>
                              <small>{{ term.frequency || 0 }}</small>
                            </div>
                            <button
                              v-if="!term.removed"
                              class="word-cloud-term-remove"
                              type="button"
                              title="移除"
                              @click.stop="removeTermFromCloud(row.cloud.wordBagId, term)"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                    <div v-if="wordCloudState === null && wordCloudCardRows.length === 0" class="word-cloud-loading">
                      <svg class="word-cloud-loading-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      <span>正在加载词袋…</span>
                    </div>
                    <div v-else-if="wordCloudCardRows.length === 0" class="empty-state word-cloud-empty">
                      <strong>暂无词袋</strong>
                      <span>先新增一朵词云，或者输入分组意图后启动智能体分类任务。</span>
                    </div>
                  </div>
                </div>
              </article>

              <section class="word-cloud-lower-grid">
                <form class="info-feed-input-dock word-cloud-dialog" @submit.prevent="proposeWordCloud">
                  <div class="section-header compact-section-header">
                    <div>
                      <h3>智能体分组</h3>
                      <p>{{ selectedWordCloudModel.label }}</p>
                    </div>
                    <StatusPill
                      :tone="selectedWordCloudModel.enabled ? 'success' : 'warning'"
                      :label="selectedWordCloudModel.enabled ? '可调用' : '未就绪'"
                    />
                  </div>
                  <textarea
                    v-model="wordCloudPrompt"
                    placeholder="例如：把这些词按业务、技术、实体、动作尽量拆成多类，直接按原词分类，不要解释。"
                    spellcheck="false"
                  />
                  <p class="word-cloud-agent-hint">
                    点击“启动分类任务”会直接调用智能体接口，用当前语料词和你写的意图生成多类词云。
                  </p>
                  <div class="word-cloud-dialog-controls">
                    <AgentModelOptionBar
                      v-model="wordCloudModelAlias"
                      class="word-cloud-agent-select"
                      placeholder="未选择智能体"
                      :options="wordCloudModelOptions"
                    />
                    <button
                      class="primary-action"
                      type="submit"
                      :disabled="!canWriteKnowledge || !selectedWordCloudModel.enabled || busyKey === 'knowledge:word-clouds:propose'"
                    >
                      {{ busyKey === "knowledge:word-clouds:propose" ? "启动中" : "启动分类任务" }}
                    </button>
                  </div>
                  <div class="word-cloud-message-list">
                    <article
                      v-for="message in wordCloudMessages"
                      :key="message.id"
                      class="word-cloud-message"
                      :data-role="message.role"
                    >
                      <strong>{{ message.role === "agent" ? "智能体" : message.role === "user" ? "人工监督" : "系统" }}</strong>
                      <span>{{ formatMachineDate(message.at, "compact") }}</span>
                      <p>{{ message.text }}</p>
                    </article>
                  </div>
                </form>
              </section>
            </template>

            <article v-if="isKnowledgeRetrievalTab" class="surface-card debug-panel-card knowledge-recall-debug-card">
              <div class="section-header">
                <div>
                  <h3>知识检索</h3>
                  <p>面向文档索引和文档搜索的召回工作台；用于对比 TopK、融合策略、学习开关和证据可读性。</p>
                </div>
                <div class="section-tags">
                  <span>{{ knowledgeConsole?.available ? "KnowledgeCore 可用" : "KnowledgeCore 未启用" }}</span>
                  <span>{{ knowledgeStatus }}</span>
                  <span>目录 {{ knowledgeSourceState?.summary.totalCount || 0 }}</span>
                </div>
              </div>

              <form class="debug-parameter-panel" @submit.prevent="runKnowledgeRecallDebugBatch">
                <label class="full-row">
                  <span>检索问题</span>
                  <input
                    v-model="knowledgeRecallDebugForm.query"
                    type="search"
                    placeholder="例如：HSBC 账单"
                  />
                </label>
                <label>
                  <span>TopK 对比</span>
                  <input
                    v-model="knowledgeRecallDebugForm.topKValues"
                    type="text"
                    placeholder="10 20 30"
                  />
                </label>
                <OptionBar
                  v-model="knowledgeRecallDebugForm.retrievalMode"
                  label="召回模式"
                  :options="retrievalModeOptionBarOptions"
                />
                <BinaryCheckbox
                  v-model="knowledgeRecallDebugForm.keywordOnly"
                  label="仅关键词"
                />
                <BinaryCheckbox
                  v-model="knowledgeRecallDebugForm.learningEnabled"
                  label="启用学习"
                />
                <BinaryCheckbox
                  v-model="knowledgeRecallDebugForm.explain"
                  label="返回解释"
                />
                <button
                  class="primary-action"
                  type="submit"
                  :disabled="busyKey === 'debug:knowledge-recall' || !knowledgeRecallDebugForm.query.trim()"
                >
                  {{ busyKey === "debug:knowledge-recall" ? "批量召回中" : "批量对比召回" }}
                </button>
              </form>

              <div class="debug-parameter-summary">
                <strong>参数说明</strong>
                <span>{{ knowledgeRecallDebugParameterSummary }}</span>
              </div>

              <div
                v-if="knowledgeRecallDebugRuns.length"
                class="debug-compare-grid"
                :style="knowledgeRecallDebugGridStyle"
              >
                <section
                  v-for="run in knowledgeRecallDebugRuns"
                  :key="run.runId"
                  class="debug-compare-column"
                  :data-status="run.status"
                >
                  <header class="debug-compare-header">
                    <div>
                      <h4>{{ run.label }}</h4>
                      <span>{{ run.status }} · {{ run.elapsedMs }} ms · {{ run.items.length }} 条</span>
                      <small v-if="knowledgeFusionSummary(run.response)">{{ knowledgeFusionSummary(run.response) }}</small>
                    </div>
                  </header>
                  <div class="info-feed-results-list debug-result-list">
                    <InfoFeedResultRow
                      v-for="item in run.items"
                      :key="String(item.evidenceId || item.itemId || item.documentId || item.title)"
                      :item="item"
                      tier="debug"
                      @open="openAgentEvidencePreview"
                    />
                    <div v-if="run.status === 'running'" class="empty-note">正在召回。</div>
                    <div v-else-if="run.status === 'failed'" class="empty-note">{{ run.error }}</div>
                    <div v-else-if="run.status === 'completed' && run.items.length === 0" class="empty-note">没有召回结果。</div>
                  </div>
                  <ConfigFoldCard v-if="run.response" title="原始响应">
                    <pre>{{ jsonPreview(run.response || {}) }}</pre>
                  </ConfigFoldCard>
                </section>
              </div>
            </article>

            <article v-if="knowledgeTab === 'review'" class="surface-card knowledge-conflict-report">
              <div class="section-header">
                <div>
                  <h3>人工审核</h3>
                  <p>知识录入发现同一路径不同内容、重复来源或结构化版本冲突时，会先进入这里等待人工决策。</p>
                </div>
                <div class="source-actions">
                  <OptionBar
                    v-model="knowledgeReviewStatus"
                    class="compact-select"
                    :options="knowledgeReviewStatusOptionBarOptions"
                  />
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
		                  <StatusPill
		                    :tone="knowledgeReviewTone(selectedKnowledgeReviewItem)"
		                    :label="knowledgeReviewStatusLabel(selectedKnowledgeReviewItem.status)"
		                  />
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
                      <ConfigFoldCard title="机器结构">
                        <pre>{{ jsonPreview(row) }}</pre>
                      </ConfigFoldCard>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="类型" width="150" resizable>
                  <template #default="{ row }">
                    <div class="knowledge-conflict-kind">
                      <StatusPill :tone="knowledgeReviewTone(row)" :label="knowledgeReviewStatusLabel(row.status)" />
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
                  <p>调整检索、索引和衰减策略。危险配置会要求二次确认。</p>
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
                    <OptionBar
                      v-else-if="field.type === 'boolean'"
                      :model-value="maintenanceFieldValue(field.name, field.defaultValue) ? 'true' : 'false'"
                      :options="enabledStringOptionBarOptions"
                      @update:model-value="setMaintenanceFieldValue(field.name, $event === 'true')"
                    />
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
              <ConfigFoldCard title="高级 JSON Diff">
                <label class="json-editor">
                  <span>只在需要精确修改服务端配置对象时展开</span>
                  <textarea v-model="maintenanceJson" rows="10" spellcheck="false" />
                </label>
              </ConfigFoldCard>
              <div class="knowledge-config-save-bar">
                <button class="primary-action knowledge-config-save-button" type="button" :disabled="!canAdminKnowledge" @click="saveKnowledgeMaintenance">
                  保存配置
                </button>
              </div>
            </article>

            <article v-if="knowledgeTab === 'maintenance'" class="surface-card knowledge-maintenance-tasks">
              <div class="section-header">
                <div>
                  <h3>手动维护任务</h3>
                  <p>一次性执行知识库维护动作；用于校验、修复、清理、重建索引或触发进化学习。</p>
                </div>
              </div>
              <div class="maintenance-task-section">
                <div class="maintenance-runner">
                  <OptionBar
                    v-model="selectedMaintenanceTask"
                    :options="maintenanceTaskOptionBarOptions"
                  />
                  <BinaryCheckbox
                    v-model="maintenanceConfirm"
                    label="确认执行"
                  />
                  <BinaryCheckbox
                    v-if="currentMaintenanceTaskSupportsDryRun"
                    v-model="maintenanceDryRun"
                    label="仅预览"
                  />
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

            <article
              v-if="isGoldenRulesTab"
              class="surface-card expert-rules-page"
            >
              <div class="section-header">
                <div>
                  <h3>黄金规则</h3>
                  <p>智能体蒸馏、候选发布和审核分流都必须先经过这些规则。关闭规则后，运行时会直接跳过该规则。</p>
                </div>
                <div class="source-actions">
                  <button
                    class="tool-button"
                    type="button"
                    :disabled="busyKey === 'expert-rules:refresh'"
                    @click="refreshExpertRules({ forceDrafts: true })"
                  >
                    {{ busyKey === "expert-rules:refresh" ? "加载中" : "重新加载" }}
                  </button>
                </div>
              </div>
              <div class="expert-rule-group-list">
                <section
                  v-for="pkg in goldenRulePackages"
                  :key="String(pkg.packageId || pkg.version)"
                  class="module-panel expert-rule-package"
                >
                  <div class="module-panel-heading">
                    <div>
                      <strong>{{ goldenRulePackageTitle(pkg) }}</strong>
                      <span>{{ String(pkg.status || "unknown") }} · {{ goldenRuleItems(pkg).length }} 条</span>
                    </div>
                    <StatusPill
                      :tone="String(pkg.status || '') === 'active' ? 'success' : 'warning'"
                      :label="String(pkg.status || 'draft')"
                    />
                  </div>
                  <div class="expert-rule-card-list">
                    <article
                      v-for="item in goldenRuleItems(pkg)"
                      :key="String(item.rule.ruleId || item.index)"
                      class="expert-rule-card"
                      :data-enabled="expertRuleEnabled(item.rule)"
                    >
                      <div>
                        <strong>{{ String(item.rule.label || item.rule.ruleId || `规则 ${item.index + 1}`) }}</strong>
                        <span>{{ String(item.rule.action || "needs_human_review") }} · priority {{ Number(item.rule.priority || 0) }}</span>
                        <p>{{ String(item.rule.reason || item.rule.description || "无说明") }}</p>
                        <small>{{ (Array.isArray(item.rule.targetTypes) ? item.rule.targetTypes : ["*"]).join(" / ") }}</small>
                      </div>
                      <FeatureToggle
                        :model-value="expertRuleEnabled(item.rule)"
                        :aria-label="expertRuleEnabled(item.rule) ? '停用规则' : '启用规则'"
                        :disabled="!canAdminKnowledge || busyKey === `golden-rule:${String(pkg.packageId || '')}:${item.index}`"
                        @update:model-value="toggleGoldenRuleEnabled(pkg, item.index, $event)"
                      />
                    </article>
                  </div>
                  <ConfigFoldCard title="规则包 JSON">
                    <pre>{{ jsonPreview(pkg) }}</pre>
                  </ConfigFoldCard>
                </section>
                <div v-if="goldenRulePackages.length === 0" class="empty-state">
                  <strong>暂无黄金规则包</strong>
                  <span>点击重新加载，或通过工作台创建规则草稿。</span>
                </div>
              </div>
            </article>

            <article
              v-if="isGoldenRulesTab"
              class="surface-card knowledge-vocabulary expert-rules-page"
            >
                <div class="section-header">
                  <div>
                    <h3>专家词汇规则</h3>
                    <p>用于知识分类、事务归纳和检索提示。Toggle 控制词条是否作为 active 专家规则参与运行。</p>
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
                          <FeatureToggle
                            :model-value="item.entry.status === 'active'"
                            :aria-label="item.entry.status === 'active' ? '停用词条' : '启用词条'"
                            @update:model-value="setVocabularyEntryEnabled(item.index, $event)"
                          />
                          <small class="field-hint">{{ item.entry.status }}</small>
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

            <article
              v-if="isGoldenRulesTab"
              class="surface-card knowledge-rules expert-rules-page"
            >
                <div class="section-header">
                  <div>
                    <h3>邮件专家规则</h3>
                    <p>报告序列、同义词和部门规则会进入邮件分析、分类引导和检索归纳。Toggle 会写入 email-rules.json 的 enabled 字段。</p>
                  </div>
                  <span>{{ emailReportSeriesRules.length + emailSynonymRules.length + emailDepartmentRules.length }} 条</span>
                </div>
                <div class="expert-rule-grid">
                  <section class="module-panel">
                    <div class="module-panel-heading">
                      <strong>报告序列</strong>
                      <span>{{ emailReportSeriesRules.length }}</span>
                    </div>
                    <div class="expert-rule-card-list">
                      <article
                        v-for="item in emailReportSeriesRules"
                        :key="item.rule.id || item.index"
                        class="expert-rule-card"
                        :data-enabled="expertRuleEnabled(item.rule)"
                      >
                        <div>
                          <strong>{{ item.rule.label }}</strong>
                          <span>{{ item.rule.cadence }} · {{ item.rule.id }}</span>
                          <p>{{ item.rule.keywords.join(" / ") }}</p>
                        </div>
                        <FeatureToggle
                          :model-value="expertRuleEnabled(item.rule)"
                          :aria-label="expertRuleEnabled(item.rule) ? '停用报告序列规则' : '启用报告序列规则'"
                          @update:model-value="setEmailRuleEntryEnabled('reportSeries', item.index, $event)"
                        />
                      </article>
                    </div>
                  </section>
                  <section class="module-panel">
                    <div class="module-panel-heading">
                      <strong>同义词</strong>
                      <span>{{ emailSynonymRules.length }}</span>
                    </div>
                    <div class="expert-rule-card-list">
                      <article
                        v-for="item in emailSynonymRules"
                        :key="item.rule.canonical || item.index"
                        class="expert-rule-card"
                        :data-enabled="expertRuleEnabled(item.rule)"
                      >
                        <div>
                          <strong>{{ item.rule.canonical }}</strong>
                          <span>{{ item.rule.terms.length }} 个词</span>
                          <p>{{ item.rule.terms.join(" / ") }}</p>
                        </div>
                        <FeatureToggle
                          :model-value="expertRuleEnabled(item.rule)"
                          :aria-label="expertRuleEnabled(item.rule) ? '停用同义词规则' : '启用同义词规则'"
                          @update:model-value="setEmailRuleEntryEnabled('synonymDictionary', item.index, $event)"
                        />
                      </article>
                    </div>
                  </section>
                  <section class="module-panel">
                    <div class="module-panel-heading">
                      <strong>部门归属</strong>
                      <span>{{ emailDepartmentRules.length }}</span>
                    </div>
                    <div class="expert-rule-card-list">
                      <article
                        v-for="item in emailDepartmentRules"
                        :key="item.rule.department || item.index"
                        class="expert-rule-card"
                        :data-enabled="expertRuleEnabled(item.rule)"
                      >
                        <div>
                          <strong>{{ item.rule.department }}</strong>
                          <span>{{ item.rule.keywords.length }} 名称词 / {{ item.rule.emailKeywords.length }} 邮箱词</span>
                          <p>{{ [...item.rule.keywords, ...item.rule.emailKeywords].join(" / ") || "无关键词" }}</p>
                        </div>
                        <FeatureToggle
                          :model-value="expertRuleEnabled(item.rule)"
                          :aria-label="expertRuleEnabled(item.rule) ? '停用部门规则' : '启用部门规则'"
                          @update:model-value="setEmailRuleEntryEnabled('departmentDictionary', item.index, $event)"
                        />
                      </article>
                    </div>
                  </section>
                </div>
                <ConfigFoldCard class="rules-json-panel" title="展开规则 JSON">
                  <textarea v-model="rulesText" class="rules-editor" spellcheck="false" />
                </ConfigFoldCard>
                <button class="tool-button" type="button" :disabled="busyKey === 'rules'" @click="saveRules">
                  {{ busyKey === "rules" ? "保存中" : "保存规则库" }}
                </button>
            </article>
            <article
              v-if="!isKnownKnowledgeTab"
              class="surface-card knowledge-empty-state"
            >
              <div class="section-header">
                <div>
                  <h3>知识库页面已空</h3>
                  <p>当前知识标签异常，已切回默认标签。</p>
                </div>
              </div>
              <p class="module-note">请重新选择左侧“知识库”下的任一标签。</p>
            </article>
          </section>
</template>
