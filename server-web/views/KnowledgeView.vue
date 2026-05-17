<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useConsole } from '../composables/useConsole';
import { bridge } from '../lib/bridge';
import {
  AgentModelOptionBar,
  BinaryCheckbox,
  BrowseSelectButton,
  ConfigFoldCard,
  FeatureToggle,
  OptionBar,
  StatusPill,
} from '../components/common';
// @ts-ignore The console intentionally reuses the pure ESM knowledge preprocessing module.
import { chunkMarkdownText, estimateMarkdownTokenCount } from '../../server/platform/specialized/knowledge/preprocessing/chunking/structured-markdown.mjs';
const {
  addChildWordCloud,
  addManualWordCloud,
  autoFillCloudWithAgent,
  fillingWordBagIds,
  addTermActionToCloud,
  addTermInputToCloud,
  addVocabularyEntry,
  busyKey,
  canAdminKnowledge,
  canBrowseServerPaths,
  canMaintainKnowledge,
  canReadKnowledge,
  canWriteJobs,
  canWriteKnowledge,
  clearRemovedTermsFromCloud,
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
  jobStatusLabels,
  jobStatusTone,
  jsonPreview,
  knowledgeConfigGroupDescription,
  knowledgeMaintenanceTaskDescription,
  knowledgeManagementPanel,
  knowledgeManagementPanelOptionBarOptions,
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
  knowledgeTab,
  maintenanceConfirm,
  maintenanceDryRun,
  maintenanceFieldValue,
  maintenanceJson,
  maintenanceResultJson,
  maintenanceTaskOptionBarOptions,
  normalizedManifest,
  onIngestFilesSelected,
  openWordCloudCorpusDirectoryPicker,
  openWordCloudCorpusFilePicker,
  importWordCloudSetFromFile,
  proposeWordCloud,
  refreshExpertRules,
  refreshIngestJob,
  refreshKnowledgeConflicts,
  refreshKnowledgeConsole,
  refreshWordCloud,
  removeTermFromCloud,
  removeWordCloudCorpusPath,
  resolveKnowledgeReview,
  rulesText,
  runKnowledgeMaintenanceTask,
  saveExpertVocabulary,
  saveKnowledgeMaintenance,
  saveRules,
  saveWordCloud,
  selectKnowledgeManagementPanel,
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
  setWordCloudTermInput,
  shortId,
  showAllVocabularyEntries,
  syncLocalSourceLabelFromPath,
  toggleGoldenRuleEnabled,
  toggleWordCloudActionMenu,
  toggleWordCloudCollapsed,
  triggerWordCloudImport,
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
  wordCloudTermInputs,
  wordCloudTerms,
  wordCloudVisibleTerms,
  wordCloudState,
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

const isManagementKnowledgePanel = computed(
  () => knowledgeTab.value === "management" && knowledgeManagementPanel.value === "knowledge",
);
const isManagementRulesPanel = computed(
  () => knowledgeTab.value === "management" && knowledgeManagementPanel.value === "rules",
);
const isKnownKnowledgeTab = computed(
  () =>
    isManagementKnowledgePanel.value ||
    isManagementRulesPanel.value ||
    knowledgeTab.value === "chunking" ||
    knowledgeTab.value === "wordCloud" ||
    knowledgeTab.value === "conflicts" ||
    knowledgeTab.value === "maintenance",
);

type ChunkingMode = "heading" | "semantic" | "fixed";
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
};

type ChunkingAttachment = {
  id: string;
  name: string;
  relativePath: string;
  mediaType: string;
  byteSize: number;
  lastModified: number;
  status: ChunkingAttachmentStatus;
  statusLabel: string;
  message: string;
  text: string;
};

const chunkingModeOptions: Array<{ value: ChunkingMode; label: string }> = [
  { value: "heading", label: "标题优先" },
  { value: "semantic", label: "语义段落" },
  { value: "fixed", label: "固定窗口" },
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

const chunkingDocumentSample = [
  "# 客户续费与风险判断",
  "",
  "## 背景",
  "华东区企业客户在第四季度集中进入续费窗口。合同、邮件、会议纪要和工单需要合并入库，供销售、法务和交付智能体共同检索。",
  "",
  "## 关键证据",
  "- 合同附件显示当前版本将在 2026-06-30 到期。",
  "- 客户邮件提到预算审批需要补充安全合规说明。",
  "- 交付日志记录了两个未关闭的稳定性问题。",
  "",
  "## 切分原则",
  "切分应优先保留标题层级、证据编号、表格上下文和相邻段落关系。过短切片会降低召回质量，过长切片会挤占上下文窗口。",
  "",
  "## 表格片段",
  "| 项目 | 状态 | 负责人 |",
  "| --- | --- | --- |",
  "| 合同续费 | 待审批 | 销售负责人 |",
  "| 安全说明 | 待补充 | 法务团队 |",
  "| 稳定性问题 | 处理中 | 交付团队 |",
  "",
  "## 入库结果",
  "每个切片需要生成稳定 chunkId、sourceRange、anchorPath 和 evidencePreview。后续检索、总结和智能体引用都应指向这些稳定边界。",
].join("\n");

const chunkingDocument = ref(chunkingDocumentSample);
const chunkingMode = ref<ChunkingMode>("heading");
const chunkingChunkSize = ref(180);
const chunkingOverlap = ref(32);
const chunkingHeadingDepth = ref("H2");
const chunkingKeepTables = ref(true);
const chunkingKeepEvidence = ref(true);
const selectedChunkId = ref("chunk-1");
const chunkingAttachments = ref<ChunkingAttachment[]>([]);
const chunkingDropActive = ref(false);
const chunkingDocumentSource = ref<"sample" | "attachments" | "manual">("sample");

function resetChunkingDocument() {
  chunkingDocument.value = chunkingDocumentSample;
  selectedChunkId.value = "chunk-1";
  chunkingDocumentSource.value = "sample";
}

function chunkingAttachmentKey(file: File) {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  return `${relativePath}:${file.size}:${file.lastModified}`;
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
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  const base = {
    id: `${chunkingAttachmentKey(file)}:${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    relativePath,
    mediaType: file.type || "application/octet-stream",
    byteSize: file.size,
    lastModified: file.lastModified,
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

async function addChunkingAttachmentFiles(files: File[]) {
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

function hasDraggedFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function onChunkingDragEnter(event: DragEvent) {
  if (!hasDraggedFiles(event)) {
    return;
  }
  chunkingDropActive.value = true;
}

function onChunkingDragOver(event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
  if (hasDraggedFiles(event)) {
    chunkingDropActive.value = true;
  }
}

function onChunkingDragLeave(event: DragEvent) {
  const current = event.currentTarget as HTMLElement | null;
  const related = event.relatedTarget as Node | null;
  if (current && related && current.contains(related)) {
    return;
  }
  chunkingDropActive.value = false;
}

function onChunkingDrop(event: DragEvent) {
  chunkingDropActive.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  void addChunkingAttachmentFiles(files);
}

function estimateChunkTokens(text: string) {
  return estimateMarkdownTokenCount(text);
}

function normalizeChunkLines(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitLongUnit(text: string, maxTokens: number) {
  const sentences = text
    .split(/(?<=[。！？.!?])\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const units = sentences.length > 1 ? sentences : text.match(/.{1,180}/gs) || [text];
  const output: string[] = [];
  let current = "";
  for (const unit of units) {
    const next = current ? `${current}\n${unit}` : unit;
    if (estimateChunkTokens(next) > maxTokens && current) {
      output.push(current);
      current = unit;
    } else {
      current = next;
    }
  }
  if (current) {
    output.push(current);
  }
  return output;
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

function structuredMarkdownPreviews(maxTokens: number, overlapTokens: number): ChunkPreview[] {
  const result = chunkMarkdownText({
    text: chunkingDocument.value,
    source: {
      id: "knowledge-console-preview",
      name: chunkingAttachments.value.length === 1
        ? chunkingAttachments.value[0]?.relativePath || "document.md"
        : "document.md",
    },
    options: {
      sectionLevel: chunkingHeadingLevel(),
      maxTokens,
      maxChars: Math.max(480, maxTokens * 4),
      overlapTokens,
    },
  });

  return result.chunks.map((chunk: any, offset: number) => {
    const tableLines = String(chunk.content || "").split("\n").filter((line) => line.trim().startsWith("|")).length;
    const hasEvidence = /证据|chunkId|sourceRange|附件|邮件|日志/.test(chunk.content || "");
    const tokens = Number(chunk.tokenCount || estimateChunkTokens(chunk.content || ""));
    const quality: ChunkQuality =
      tokens > maxTokens * 1.18 || (!chunkingKeepTables.value && tableLines > 0)
        ? "risk"
        : tokens < maxTokens * 0.25
          ? "warn"
          : "good";
    const headingPath = Array.isArray(chunk.headingPath) ? chunk.headingPath.filter(Boolean) : [];
    return {
      id: chunk.id || `chunk-${offset + 1}`,
      index: offset + 1,
      title: chunk.title || headingTitle(chunk.content || "", `切片 ${offset + 1}`),
      text: chunk.content || "",
      sourceName: chunk.sourceName || "document.md",
      tokens,
      chars: Number(chunk.charCount || String(chunk.content || "").length),
      overlap: Number(chunk.overlapTokenCount || 0),
      quality,
      boundary:
        quality === "good"
          ? "章节边界"
          : quality === "warn"
            ? "偏短"
            : "需复核",
      anchors: [
        ...(headingPath.length ? headingPath : [chunkingHeadingDepth.value]),
        chunk.sectionId ? `section:${String(chunk.sectionId).split("::").pop()}` : "section",
        tableLines ? `table:${tableLines}` : "text",
        chunkingKeepEvidence.value && hasEvidence ? "evidence" : "context",
      ],
      sourceStartLine: Number(chunk.sourceStartLine || chunk.sourceRange?.startLine || 1),
      sourceEndLine: Number(chunk.sourceEndLine || chunk.sourceRange?.endLine || 1),
    };
  });
}

const chunkingUnits = computed(() => {
  const text = chunkingDocument.value.trim();
  if (!text) {
    return [];
  }
  if (chunkingMode.value === "fixed") {
    return splitLongUnit(text, Math.max(80, chunkingChunkSize.value));
  }
  if (chunkingMode.value === "semantic") {
    return normalizeChunkLines(text);
  }

  const sections: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (/^#{1,3}\s+/.test(line) && current.trim()) {
      sections.push(current.trim());
      current = line;
      continue;
    }
    current = current ? `${current}\n${line}` : line;
  }
  if (current.trim()) {
    sections.push(current.trim());
  }
  return sections.flatMap((unit) =>
    estimateChunkTokens(unit) > chunkingChunkSize.value * 1.25
      ? splitLongUnit(unit, chunkingChunkSize.value)
      : [unit],
  );
});

const chunkingPreviews = computed<ChunkPreview[]>(() => {
  const maxTokens = Math.max(80, Number(chunkingChunkSize.value) || 180);
  const overlapTokens = Math.max(0, Number(chunkingOverlap.value) || 0);

  if (chunkingMode.value === "heading") {
    return structuredMarkdownPreviews(maxTokens, overlapTokens);
  }

  const chunks: ChunkPreview[] = [];
  let currentParts: string[] = [];
  let currentTokens = 0;
  let nextSourceLine = 1;

  function pushChunk() {
    if (!currentParts.length) {
      return;
    }
    const index = chunks.length + 1;
    const text = currentParts.join("\n\n").trim();
    const tokens = estimateChunkTokens(text);
    const sourceStartLine = nextSourceLine;
    const sourceEndLine = sourceStartLine + Math.max(1, text.split("\n").length) - 1;
    const tableLines = text.split("\n").filter((line) => line.trim().startsWith("|")).length;
    const hasEvidence = /证据|chunkId|sourceRange|附件|邮件|日志/.test(text);
    const quality: ChunkQuality =
      tokens > maxTokens * 1.18 || (!chunkingKeepTables.value && tableLines > 0)
        ? "risk"
        : tokens < maxTokens * 0.38
          ? "warn"
          : "good";
    chunks.push({
      id: `chunk-${index}`,
      index,
      title: headingTitle(text, `切片 ${index}`),
      text,
      sourceName: "document.md",
      tokens,
      chars: text.length,
      overlap: index === 1 ? 0 : Math.min(overlapTokens, tokens),
      quality,
      boundary:
        quality === "good"
          ? "边界稳定"
          : quality === "warn"
            ? "偏短"
            : "需复核",
      anchors: [
        chunkingMode.value === "heading" ? chunkingHeadingDepth.value : "P",
        tableLines ? `table:${tableLines}` : "text",
        chunkingKeepEvidence.value && hasEvidence ? "evidence" : "context",
      ],
      sourceStartLine,
      sourceEndLine,
    });
    nextSourceLine = sourceEndLine + 1;
    const tail = text.slice(Math.max(0, text.length - Math.max(80, overlapTokens * 2)));
    currentParts = overlapTokens > 0 ? [tail] : [];
    currentTokens = overlapTokens > 0 ? estimateChunkTokens(tail) : 0;
  }

  for (const unit of chunkingUnits.value) {
    const unitTokens = estimateChunkTokens(unit);
    if (currentParts.length && currentTokens + unitTokens > maxTokens) {
      pushChunk();
    }
    currentParts.push(unit);
    currentTokens += unitTokens;
  }
  pushChunk();
  return chunks;
});

const selectedChunk = computed(() =>
  chunkingPreviews.value.find((chunk) => chunk.id === selectedChunkId.value) ||
  chunkingPreviews.value[0] ||
  null,
);

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

function chunkQualityTone(quality: ChunkQuality) {
  return quality === "good" ? "success" : quality === "warn" ? "warning" : "danger";
}

function chunkSourceRange(chunk: ChunkPreview) {
  return `${chunk.sourceName || "document.md"}#L${chunk.sourceStartLine}-L${chunk.sourceEndLine}`;
}
</script>

<template>
          <section class="knowledge-layout">
            <div
              v-if="knowledgeTab === 'management'"
              class="knowledge-management-tabs"
              role="tablist"
              aria-label="知识管理面板"
            >
              <button
                v-for="option in knowledgeManagementPanelOptionBarOptions"
                :key="String(option.value)"
                class="knowledge-management-tab"
                :class="{ active: knowledgeManagementPanel === option.value }"
                type="button"
                role="tab"
                :aria-selected="knowledgeManagementPanel === option.value"
                @click="selectKnowledgeManagementPanel(option.value)"
              >
                {{ option.label }}
              </button>
            </div>

            <article v-if="knowledgeTab === 'chunking'" class="surface-card document-chunking-console">
              <div class="section-header document-chunking-header">
                <div>
                  <h3>文档切分</h3>
                  <p>面向 KnowledgeCore 入库前的切片预览。</p>
                </div>
                <div class="section-tags">
                  <span>{{ chunkingModeLabel }}</span>
                  <span>{{ chunkingPreviews.length }} 个切片</span>
                  <span>{{ chunkingAttachments.length }} 个附件</span>
                  <span>{{ chunkingAverageTokens }} avg tokens</span>
                </div>
              </div>

              <div class="document-chunking-grid">
                <section class="document-chunking-editor" aria-label="切分配置">
                  <div class="compact-section-header">
                    <div>
                      <h4>输入与策略</h4>
                      <span>{{ chunkingDocument.length }} chars</span>
                    </div>
                    <button class="tool-button tool-button-ghost" type="button" @click="resetChunkingDocument">
                      载入示例
                    </button>
                  </div>

                  <div
                    class="document-chunking-dropzone"
                    :class="{ active: chunkingDropActive }"
                    role="group"
                    aria-label="拖拽或选择文档附件"
                    @dragenter.prevent="onChunkingDragEnter"
                    @dragover.prevent="onChunkingDragOver"
                    @dragleave="onChunkingDragLeave"
                    @drop.prevent="onChunkingDrop"
                  >
                    <div class="document-chunking-dropcopy">
                      <strong>拖拽文档作为附件</strong>
                      <span>文本类文件会直接参与切分；PDF / DOCX / PPTX / XLSX 会先进入待解析队列。</span>
                    </div>
                    <BrowseSelectButton
                      kind="local-files"
                      button-class="tool-button tool-button-ghost"
                      button-text="选择附件"
                      :accept="chunkingAttachmentAccept"
                      multiple
                      @select="addChunkingAttachmentFiles"
                    />
                  </div>

                  <div v-if="chunkingAttachments.length" class="document-chunking-attachments">
                    <div class="compact-section-header">
                      <div>
                        <h4>附件</h4>
                        <span>{{ chunkingAttachmentSummary }}</span>
                      </div>
                      <button class="tool-button tool-button-ghost" type="button" @click="clearChunkingAttachments">
                        清空
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
                          移除
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
                  <div class="detail-metrics document-chunking-metrics">
                    <div>
                      <span>切片数</span>
                      <strong>{{ chunkingPreviews.length }}</strong>
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
                  </div>

                  <div class="document-chunking-pipeline" aria-label="切分流水线">
                    <div>
                      <strong>Parse</strong>
                      <span>标题 / 段落 / 表格</span>
                    </div>
                    <div>
                      <strong>Split</strong>
                      <span>{{ chunkingModeLabel }}</span>
                    </div>
                    <div>
                      <strong>Anchor</strong>
                      <span>sourceRange / evidence</span>
                    </div>
                  </div>

                  <section class="document-chunk-block-section" aria-label="原文分块视图">
                    <div class="compact-section-header">
                      <div>
                        <h4>原文分块</h4>
                        <span>{{ chunkingPreviews.length }} chunks from source</span>
                      </div>
                    </div>
                    <div class="document-chunk-blocks" role="list" aria-label="原文分块列表">
                      <button
                        v-for="chunk in chunkingPreviews"
                        :key="`source-${chunk.id}`"
                        class="document-chunk-block"
                        :class="{ active: selectedChunk?.id === chunk.id }"
                        type="button"
                        role="listitem"
                        @click="selectedChunkId = chunk.id"
                      >
                        <span v-if="chunk.index > 1" class="document-chunk-split-line">
                          <span>切分边界</span>
                        </span>
                        <span class="document-chunk-block-header">
                          <span class="document-chunk-block-title">
                            <strong>Chunk {{ chunk.index }}</strong>
                            <small>{{ chunkSourceRange(chunk) }} · {{ chunk.tokens }} tokens · overlap {{ chunk.overlap }}</small>
                          </span>
                          <StatusPill :tone="chunkQualityTone(chunk.quality)" :label="chunk.boundary" />
                        </span>
                        <pre>{{ chunk.text }}</pre>
                      </button>
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
                      <span>{{ selectedChunk?.id || "chunk-empty" }}</span>
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
                  </dl>

                  <pre class="document-chunking-text">{{ selectedChunk?.text || "暂无内容" }}</pre>
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
                            :class="{ 'has-confirm': titleFocusedWordBagId === row.cloud.wordBagId && selectedWordCloudModel.enabled && !fillingWordBagIds.has(row.cloud.wordBagId) }"
                            :value="row.cloud.label"
                            type="text"
                            autocomplete="off"
                            placeholder="未命名词袋"
                            @click.stop
                            @focus="titleFocusedWordBagId = row.cloud.wordBagId"
                            @blur="titleFocusedWordBagId = null"
                            @input="updateWordCloudField(row.cloud.wordBagId, 'label', ($event.target as HTMLInputElement).value)"
                          />
                          <!-- Spinner when filling -->
                          <span v-if="fillingWordBagIds.has(row.cloud.wordBagId)" class="word-cloud-title-filling" title="智能体正在填充词云…">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="word-cloud-title-spin">
                              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                            </svg>
                          </span>
                          <!-- Confirm button when focused and model available -->
                          <button
                            v-else-if="titleFocusedWordBagId === row.cloud.wordBagId && selectedWordCloudModel.enabled"
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
                          <div class="word-cloud-header-add-wrap">
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
                              <button type="button" @click="addTermActionToCloud(row.cloud.wordBagId)">新增词语</button>
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
                        <div class="word-cloud-inline-add">
                          <div class="word-cloud-inline-field">再加一个词</div>
                          <input
                            placeholder="直接输入词"
                            :value="wordCloudTermInputs[row.cloud.wordBagId] || ''"
                            type="text"
                            autocomplete="off"
                            @input="setWordCloudTermInput(row.cloud.wordBagId, ($event.target as HTMLInputElement).value)"
                            @keydown.enter.prevent="addTermInputToCloud(row.cloud.wordBagId)"
                          />
                          <button class="tool-button compact-action" type="button" @click.stop="addTermInputToCloud(row.cloud.wordBagId)">
                            加入词袋
                          </button>
                          <button
                            v-if="row.cloud.removedTerms?.length"
                            class="tool-button tool-button-ghost compact-action"
                            type="button"
                            @click.stop="clearRemovedTermsFromCloud(row.cloud.wordBagId)"
                          >
                            清理已移除
                          </button>
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

            <article
              id="knowledge-file-import"
              v-if="isManagementKnowledgePanel"
              class="surface-card ingest-upload-card"
            >
              <div class="section-header">
                <div>
                  <h3>临时上传</h3>
                  <p>适合一次性导入少量文件。会持续更新的文件夹请使用系统配置中的“目录管理”。</p>
                </div>
                <div class="source-actions">
                  <a
                    v-if="canReadKnowledge"
                    class="tool-button"
                    :href="bridge.knowledgeDocxExportUrl()"
                    target="_blank"
                    rel="noreferrer"
                  >
                    导出 DOCX
                  </a>
                  <button v-else class="tool-button" type="button" disabled>
                    导出 DOCX
                  </button>
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
                <StatusPill :tone="jobStatusTone(ingestJob.status)" :label="jobStatusLabels[ingestJob.status]" />
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
              v-if="isManagementRulesPanel"
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
              v-if="isManagementRulesPanel"
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
              v-if="isManagementRulesPanel"
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
