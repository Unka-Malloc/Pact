<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useConsole, type KnowledgeTab } from '../composables/useConsole';
import { bridge } from '../lib/bridge';
import { createKnowledgeUploadedFilesPayload } from '../lib/knowledge-upload-session';
import type { KnowledgeSource } from '../lib/types';
import AgentModelOptionBar from '../components/AgentModelOptionBar.vue';
import BinaryCheckbox from '../components/BinaryCheckbox.vue';
import BridgeDownloadButton from '../components/BridgeDownloadButton.vue';
import BrowseSelectButton from '../components/BrowseSelectButton.vue';
import ConfigFoldCard from '../components/ConfigFoldCard.vue';
import FeatureToggle from '../components/FeatureToggle.vue';
import KnowledgeDistillationWorkbench from '../components/KnowledgeDistillationWorkbench.vue';
import OptionBar from '../components/OptionBar.vue';
import SegmentedToggle from '../components/SegmentedToggle.vue';
import StatusPill from '../components/StatusPill.vue';
const {
  activeKnowledgeSources,
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
  currentView,
  deleteVocabularyEntry,
  displayedVocabularyEntries,
  emailDepartmentRules,
  emailReportSeriesRules,
  emailSynonymRules,
  enabledStringOptionBarOptions,
  error,
  expertRuleEnabled,
  expertVocabularyDraft,
  filter,
  formatBytes,
  formatCompactDate,
  formatMachineDate,
  formatWordCloudThreshold,
  goldenRuleItems,
  goldenRulePackageTitle,
  goldenRulePackages,
  hasFeature,
  hiddenVocabularyEntryCount,
  canSubmitKnowledgeIngest,
  ingestFiles,
  ingestJob,
  ingestProgress,
  infoFeedModelOptions,
  isAuthenticated,
  jobStatusLabels,
  jobStatusTone,
  jsonPreview,
  knowledgeConfigGroupDescription,
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
  knowledgeIngestExternalProvider,
  knowledgeIngestExternalRefs,
  knowledgeIngestTargetSummary,
  knowledgeIngestTargets,
  knowledgeIngestTargetValidationMessage,
  knowledgeIngestTeamRefs,
  knowledgeIngestUserRefs,
  knowledgeConsole,
  knowledgeSchema,
  knowledgeTab,
  maintenanceFieldValue,
  maintenanceJson,
  normalizedManifest,
  onIngestFilesSelected,
  openWordCloudCorpusDirectoryPicker,
  openWordCloudCorpusFilePicker,
  proposeWordCloud,
  refreshExpertRules,
  refreshIngestJob,
  refreshKnowledgeConflicts,
  refreshKnowledgeConsole,
  refreshKnowledgeSource,
  refreshWordCloud,
  removeTermFromCloud,
  removeWordCloudCorpusPath,
  resolveKnowledgeReview,
  rulesText,
  saveExpertVocabulary,
  saveKnowledgeMaintenance,
  saveRules,
  saveWordCloud,
  selectKnowledgeManagementPanel,
  selectKnowledgeReviewItem,
  selectWordCloud,
  selectedKnowledgeReviewFusionModel,
  selectedKnowledgeReviewItem,
  selectedWordCloud,
  selectedWordCloudModel,
  setEmailRuleEntryEnabled,
  setMaintenanceFieldFromEvent,
  setMaintenanceFieldValue,
  setVocabularyEntryEnabled,
  setWordCloudTermInput,
  showAllVocabularyEntries,
  sourceDownloadStatusLabel,
  sourceIndexStatusLabel,
  sourceSyncLabel,
  sourceSyncTone,
  syncLocalSourceLabelFromPath,
  toggleGoldenRuleEnabled,
  toggleWordCloudActionMenu,
  toggleWordCloudCollapsed,
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
  highlightedConfigTarget,
  publishRuleAuthoringPackage,
  ruleActionOptionBarOptions,
  ruleAuthoringCanSubmit,
  ruleAuthoringDraftPayload,
  ruleAuthoringForm,
  ruleAuthoringManualSummary,
  ruleAuthoringModelOptions,
  ruleAuthoringResult,
  ruleAuthoringStatusLabel,
  ruleCreationMode,
  ruleMatchStrategyOptionBarOptions,
  ruleScopeOptionBarOptions,
  fuseKnowledgeReview,
  runRuleAuthoringChat,
  shortId,
} = useConsole();

const route = useRoute();
const activeKnowledgeTab = computed<KnowledgeTab>(() => {
  const tab = String(route.params.tab ?? "");
  return tab === "management" || tab === "wordCloud" || tab === "conflicts" || tab === "maintenance"
    ? tab
    : knowledgeTab.value;
});

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
  () => activeKnowledgeTab.value === "management" && knowledgeManagementPanel.value === "knowledge",
);
const isManagementRulesPanel = computed(
  () => activeKnowledgeTab.value === "management" && knowledgeManagementPanel.value === "rules",
);
const isKnownKnowledgeTab = computed(
  () =>
    isManagementKnowledgePanel.value ||
    isManagementRulesPanel.value ||
    activeKnowledgeTab.value === "wordCloud" ||
    activeKnowledgeTab.value === "conflicts" ||
    activeKnowledgeTab.value === "maintenance",
);
const dynamicParsingPreviewConfig = {
  pipelineId: "dynamic-parameter-v1",
  ingestPipelineId: "unified-knowledge-ingest-v1",
  contextBudget: { knowledgeTokens: 12000 },
  payloadBudget: { maxResponseBytes: 1048576 },
  granularity: {
    secondaryParse: { enabled: false },
  },
  dynamicParsing: {
    preserveStructureArtifacts: true,
  },
  structureArtifacts: true,
  granularityFragments: true,
  parentArtifactId: "",
};
const dynamicParsingPolicySignature = JSON.stringify(dynamicParsingPreviewConfig);
const documentPreviewResult = ref<Record<string, unknown> | null>(null);
const knowledgeBackendSpacesResult = ref<Record<string, unknown> | null>(null);
const knowledgeLibraryBusy = ref("");
const knowledgeLibraryError = ref("");
const knowledgeLibraryActionValues = ref<Record<string, string>>({});
const knowledgeBackendProviderOptions = [
  { value: "dify", label: "Dify" },
  { value: "ragflow", label: "RAGFlow" },
];
const knowledgeBackendProviderForms = ref<Record<string, {
  mode: string;
  secretRef: string;
  endpointRef: string;
}>>({
  dify: {
    mode: "contract",
    secretRef: "secret://pact/knowledge/dify-api-key",
    endpointRef: "config://pact/knowledge/dify-endpoint",
  },
  ragflow: {
    mode: "contract",
    secretRef: "secret://pact/knowledge/ragflow-api-key",
    endpointRef: "config://pact/knowledge/ragflow-endpoint",
  },
});

type KnowledgeLibraryDetail = {
  label: string;
  value: string;
};

type KnowledgeLibraryCard = {
  id: string;
  title: string;
  description: string;
  statusLabel: string;
  statusTone: string;
  boundaryLabel: string;
  boundaryTone: string;
  providerLabel: string;
  meta: string[];
  details: KnowledgeLibraryDetail[];
  source?: KnowledgeSource;
  externalSpace?: Record<string, unknown>;
};

type KnowledgeBackendProviderCard = {
  provider: string;
  title: string;
  description: string;
  statusLabel: string;
  statusTone: string;
  meta: string[];
  details: KnowledgeLibraryDetail[];
};

const expandedKnowledgeLibraryCards = ref<Record<string, boolean>>({ "library:global": true });
const expandedKnowledgeBackendCards = ref<Record<string, boolean>>({ builtin: true });

const knowledgeBackendSpaces = computed<Array<Record<string, unknown>>>(() => {
  const items = knowledgeBackendSpacesResult.value?.spaces;
  return Array.isArray(items) ? items as Array<Record<string, unknown>> : [];
});

function isKnowledgeLibraryCardExpanded(id: string) {
  return Boolean(expandedKnowledgeLibraryCards.value[id]);
}

function toggleKnowledgeLibraryCard(id: string) {
  expandedKnowledgeLibraryCards.value = {
    ...expandedKnowledgeLibraryCards.value,
    [id]: !expandedKnowledgeLibraryCards.value[id],
  };
}

function isKnowledgeBackendCardExpanded(id: string) {
  return Boolean(expandedKnowledgeBackendCards.value[id]);
}

function toggleKnowledgeBackendCard(id: string) {
  expandedKnowledgeBackendCards.value = {
    ...expandedKnowledgeBackendCards.value,
    [id]: !expandedKnowledgeBackendCards.value[id],
  };
}

function textField(record: Record<string, unknown>, key: string, fallback = "") {
  const value = record[key];
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  return String(value);
}

function compactNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("zh-CN") : "0";
}

function compactDate(value: unknown) {
  return value ? formatCompactDate(String(value)) : "-";
}

function externalProviderLabel(provider: unknown) {
  const id = String(provider || "").toLowerCase();
  return knowledgeBackendProviderOptions.find((option) => option.value === id)?.label || String(provider || "外部");
}

function metadataPolicyLabel(value: unknown) {
  return String(value || knowledgeBackendSpacesResult.value?.metadataPolicy || "safeMetadataOnly");
}

const knowledgeLibraryCards = computed<KnowledgeLibraryCard[]>(() => {
  const healthCounts = knowledgeConsole.value?.health?.counts || {};
  const recentJobs = knowledgeConsole.value?.recentJobs || [];
  const globalAvailable = Boolean(knowledgeConsole.value?.available);
  const cards: KnowledgeLibraryCard[] = [
    {
      id: "library:global",
      title: "全局知识空间",
      description: "Pact 内置知识库，承载统一入库、索引、证据和全平台审批后的知识。",
      statusLabel: globalAvailable ? "可用" : "不可用",
      statusTone: globalAvailable ? "success" : "danger",
      boundaryLabel: "内部",
      boundaryTone: "info",
      providerLabel: "Pact",
      meta: [
        `${compactNumber(healthCounts.documents)} 个文档`,
        `${compactNumber(healthCounts.evidence)} 条证据`,
        `${activeKnowledgeSources.value.length} 个受管目录`,
      ],
      details: [
        { label: "协议", value: knowledgeConsole.value?.health?.protocol || knowledgeConsole.value?.capabilities?.protocol || "-" },
        { label: "最近任务", value: `${recentJobs.length} 个` },
        { label: "受管目录", value: `${activeKnowledgeSources.value.length} 个` },
        { label: "可用能力", value: `${knowledgeConsole.value?.capabilities?.methods?.length || 0} 项` },
      ],
    },
  ];

  for (const source of activeKnowledgeSources.value) {
    cards.push({
      id: `source:${source.sourceId}`,
      title: source.label || source.directoryPath || "受管知识目录",
      description: source.directoryPath || "本地受管目录",
      statusLabel: sourceSyncLabel(source),
      statusTone: sourceSyncTone(source),
      boundaryLabel: "内部",
      boundaryTone: "info",
      providerLabel: source.autoSync ? "自动同步" : "手动同步",
      meta: [
        `${compactNumber(source.lastFileCount)} 个文件`,
        formatBytes(source.lastTotalBytes),
        source.watcherStatus === "watching" ? "监听中" : `监听 ${source.watcherStatus || "未知"}`,
      ],
      details: [
        { label: "目录路径", value: source.directoryPath || "-" },
        { label: "下载状态", value: sourceDownloadStatusLabel(source) },
        { label: "索引状态", value: sourceIndexStatusLabel(source) },
        { label: "上次同步", value: compactDate(source.lastSyncedAt || source.lastScanAt) },
        { label: "最近任务", value: source.lastJobId ? `${source.lastJobStatus || "-"} · ${source.lastJobStage || source.lastJobId}` : "-" },
        { label: "错误", value: source.error || source.lastIndexError || "-" },
      ],
      source,
    });
  }

  for (const space of knowledgeBackendSpaces.value) {
    const providerLabel = externalProviderLabel(space.provider);
    const contractVerified = Boolean(space.contractVerified || knowledgeBackendSpacesResult.value?.contractVerified);
    cards.push({
      id: `external:${textField(space, "spaceId", providerLabel)}`,
      title: textField(space, "label", `${providerLabel} 知识空间`),
      description: textField(space, "description", `由 ${providerLabel} 暴露的派生知识空间。`),
      statusLabel: contractVerified ? "已验证" : "元数据可见",
      statusTone: contractVerified ? "success" : "info",
      boundaryLabel: "外部",
      boundaryTone: "warning",
      providerLabel,
      meta: [
        textField(space, "accessMode", "read"),
        textField(space, "dataClass", "knowledge"),
        metadataPolicyLabel(space.metadataPolicy),
      ],
      details: [
        { label: "Space ID", value: textField(space, "spaceId", "-") },
        { label: "Provider", value: providerLabel },
        { label: "派生空间", value: textField(space, "derivedKnowledgeSpace", "-") },
        { label: "上游引用", value: textField(space, "upstreamRef", "-") },
        { label: "元数据策略", value: metadataPolicyLabel(space.metadataPolicy) },
        { label: "敏感级别", value: textField(space, "sensitivity", "-") },
      ],
      externalSpace: space,
    });
  }
  return cards;
});

const knowledgeBackendProviderCards = computed<KnowledgeBackendProviderCard[]>(() =>
  knowledgeBackendProviderOptions.map((provider) => {
    const spaces = knowledgeBackendSpaces.value.filter(
      (space) => String(space.provider || "").toLowerCase() === provider.value,
    );
    const form = knowledgeBackendProviderForms.value[provider.value];
    const contractVerified = spaces.some((space) => space.contractVerified) || form?.mode === "contract";
    return {
      provider: provider.value,
      title: `${provider.label} 后端知识库`,
      description: `${provider.label} 可作为 Pact 的外部后端知识库，按派生空间暴露给召回和入库链路。`,
      statusLabel: spaces.length ? `${spaces.length} 个空间` : "待连接",
      statusTone: spaces.length ? "success" : "warning",
      meta: [
        contractVerified ? "contract verified" : "live",
        "secretRef only",
        "可选后端",
      ],
      details: [
        { label: "Provider", value: provider.label },
        { label: "模式", value: form?.mode || "contract" },
        { label: "Secret Ref", value: form?.secretRef || "-" },
        { label: "Endpoint Ref", value: form?.endpointRef || "-" },
        { label: "派生空间", value: `${spaces.length} 个` },
        { label: "检索模式", value: spaces[0]?.retrievalModes ? JSON.stringify(spaces[0].retrievalModes) : "-" },
      ],
    };
  }),
);

async function refreshKnowledgeLibrarySpaces() {
  knowledgeLibraryBusy.value = "spaces";
  knowledgeLibraryError.value = "";
  try {
    knowledgeBackendSpacesResult.value = await bridge.listKnowledgeSpaces();
  } catch (caught) {
    knowledgeLibraryError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    knowledgeLibraryBusy.value = "";
  }
}

async function refreshKnowledgeLibraryBoard() {
  knowledgeLibraryBusy.value = "board";
  knowledgeLibraryError.value = "";
  try {
    await Promise.all([
      refreshKnowledgeConsole(),
      bridge.listKnowledgeSpaces().then((result) => {
        knowledgeBackendSpacesResult.value = result;
      }),
    ]);
  } catch (caught) {
    knowledgeLibraryError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    knowledgeLibraryBusy.value = "";
  }
}

async function connectKnowledgeBackendProvider(provider: string) {
  const form = knowledgeBackendProviderForms.value[provider];
  if (!form) {
    return;
  }
  if (!canMaintainKnowledge.value) {
    knowledgeLibraryError.value = "当前账号没有知识库维护权限。";
    return;
  }
  knowledgeLibraryBusy.value = `backend:${provider}`;
  knowledgeLibraryError.value = "";
  try {
    const result = await bridge.connectKnowledgeBackend({
      provider,
      mode: form.mode,
      secretRef: form.secretRef,
      endpointRef: form.endpointRef,
    });
    const publicProvider = result.provider && typeof result.provider === "object"
      ? result.provider as Record<string, unknown>
      : null;
    if (publicProvider) {
      knowledgeBackendProviderForms.value = {
        ...knowledgeBackendProviderForms.value,
        [provider]: {
          mode: String(publicProvider.mode || form.mode || "contract"),
          secretRef: String(publicProvider.secretRef || form.secretRef || ""),
          endpointRef: String(publicProvider.endpointRef || form.endpointRef || ""),
        },
      };
    }
    await refreshKnowledgeLibrarySpaces();
  } catch (caught) {
    knowledgeLibraryError.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    if (knowledgeLibraryBusy.value === `backend:${provider}`) {
      knowledgeLibraryBusy.value = "";
    }
  }
}

async function handleKnowledgeLibraryAction(library: KnowledgeLibraryCard, event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  knowledgeLibraryActionValues.value = {
    ...knowledgeLibraryActionValues.value,
    [library.id]: "",
  };
  if (!value) {
    return;
  }
  if (value === "open-ingest") {
    document
      .getElementById("knowledge-file-import")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  try {
    if (value === "refresh-source" && library.source) {
      await refreshKnowledgeSource(library.source);
    } else if (value === "force-refresh-source" && library.source) {
      await refreshKnowledgeSource(library.source, true);
    } else if (value === "refresh-spaces") {
      await refreshKnowledgeLibrarySpaces();
    } else if (value === "refresh-board") {
      await refreshKnowledgeLibraryBoard();
    }
  } catch (caught) {
    knowledgeLibraryError.value = caught instanceof Error ? caught.message : String(caught);
  }
}

async function handleKnowledgeLibraryBoardAction(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  knowledgeLibraryActionValues.value = {
    ...knowledgeLibraryActionValues.value,
    board: "",
  };
  if (!value) {
    return;
  }
  try {
    if (value === "refresh-spaces") {
      await refreshKnowledgeLibrarySpaces();
    } else if (value === "refresh-board") {
      await refreshKnowledgeLibraryBoard();
    }
  } catch (caught) {
    knowledgeLibraryError.value = caught instanceof Error ? caught.message : String(caught);
  }
}

onMounted(() => {
  void refreshKnowledgeLibrarySpaces();
});

async function previewKnowledgeDocumentParsing() {
  if (ingestFiles.value.length === 0) {
    return;
  }
  const uploadedFiles = await createKnowledgeUploadedFilesPayload(ingestFiles.value);
  documentPreviewResult.value = await bridge.parseDocument({
    pipelineId: dynamicParsingPreviewConfig.pipelineId,
    expectedOutputs: ["preprocessResult", "chunks", "structureArtifacts", "granularityFragments"],
    uploadedFiles,
    dryRun: true,
    contextBudget: dynamicParsingPreviewConfig.contextBudget,
    payloadBudget: dynamicParsingPreviewConfig.payloadBudget,
    granularity: dynamicParsingPreviewConfig.granularity,
    dynamicParsing: dynamicParsingPreviewConfig.dynamicParsing,
  });
}

</script>

<template>
          <section class="knowledge-layout" :data-dynamic-parsing-policy="dynamicParsingPolicySignature">
            <SegmentedToggle
              v-if="activeKnowledgeTab === 'management'"
              v-model="knowledgeManagementPanel"
              :options="knowledgeManagementPanelOptionBarOptions"
              aria-label="知识管理面板"
              size="large"
            />

            <template v-if="activeKnowledgeTab === 'wordCloud'">
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
              v-if="isManagementKnowledgePanel"
              class="surface-card knowledge-library-board"
            >
              <div class="section-header">
                <div>
                  <h3>知识库</h3>
                  <p>当前账号可见的内部与外部知识库。内部或外部是知识库状态，不作为配置选项。</p>
                </div>
                <label class="knowledge-library-board-action">
                  <span>列表操作</span>
                  <select
                    :disabled="knowledgeLibraryBusy === 'board' || knowledgeLibraryBusy === 'spaces'"
                    :value="knowledgeLibraryActionValues.board || ''"
                    @change="handleKnowledgeLibraryBoardAction"
                  >
                    <option value="">选择操作</option>
                    <option value="refresh-board">刷新全部</option>
                    <option value="refresh-spaces">刷新外部空间</option>
                  </select>
                </label>
              </div>
              <p v-if="knowledgeLibraryError" class="module-note warning-note">{{ knowledgeLibraryError }}</p>
              <div class="knowledge-library-list">
                <section
                  v-for="library in knowledgeLibraryCards"
                  :key="library.id"
                  class="knowledge-library-card"
                  :data-open="isKnowledgeLibraryCardExpanded(library.id)"
                >
                  <div class="knowledge-card-header">
                    <div class="knowledge-card-toggle-content">
                      <span class="knowledge-library-card-main">
                        <strong>{{ library.title }}</strong>
                        <small>{{ library.description }}</small>
                        <span class="knowledge-library-card-meta">
                          <span>{{ library.providerLabel }}</span>
                          <span v-for="item in library.meta" :key="item">{{ item }}</span>
                        </span>
                      </span>
                      <span class="knowledge-library-card-status">
                        <StatusPill :tone="library.boundaryTone" :label="library.boundaryLabel" />
                        <StatusPill :tone="library.statusTone" :label="library.statusLabel" />
                      </span>
                    </div>
                    <button
                      class="knowledge-card-icon-button"
                      type="button"
                      :aria-label="isKnowledgeLibraryCardExpanded(library.id) ? '收起知识库详情' : '展开知识库详情'"
                      :title="isKnowledgeLibraryCardExpanded(library.id) ? '收起' : '展开'"
                      :aria-expanded="isKnowledgeLibraryCardExpanded(library.id)"
                      @click="toggleKnowledgeLibraryCard(library.id)"
                    >
                      <svg
                        v-if="isKnowledgeLibraryCardExpanded(library.id)"
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                      <svg
                        v-else
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>
                  </div>
                  <div v-if="isKnowledgeLibraryCardExpanded(library.id)" class="knowledge-library-card-body">
                    <div class="knowledge-library-detail-grid">
                      <div
                        v-for="detail in library.details"
                        :key="`${library.id}:${detail.label}`"
                      >
                        <span>{{ detail.label }}</span>
                        <strong>{{ detail.value }}</strong>
                      </div>
                    </div>
                    <label class="knowledge-library-action-field">
                      <span>操作</span>
                      <select
                        :disabled="knowledgeLibraryBusy !== ''"
                        :value="knowledgeLibraryActionValues[library.id] || ''"
                        @change="handleKnowledgeLibraryAction(library, $event)"
                      >
                        <option value="">选择操作</option>
                        <option v-if="library.id === 'library:global'" value="open-ingest">知识入库</option>
                        <option v-if="library.source" value="refresh-source">刷新同步</option>
                        <option v-if="library.source" value="force-refresh-source">强制刷新</option>
                        <option v-if="library.externalSpace" value="refresh-spaces">刷新外部空间</option>
                      </select>
                    </label>
                  </div>
                </section>
              </div>
            </article>

            <article
              id="knowledge-file-import"
              v-if="isManagementKnowledgePanel"
              class="surface-card ingest-upload-card"
            >
              <div class="section-header">
                <div>
                  <h3>知识入库</h3>
                  <p>上传知识并选择入库目标，可同时进入全局知识空间、外部知识库、团队空间或用户私有空间。</p>
                </div>
              </div>
              <div class="knowledge-ingest-target-panel">
                <div class="knowledge-ingest-target-header">
                  <strong>入库目标</strong>
                  <span>{{ knowledgeIngestTargetSummary }}</span>
                </div>
                <div class="knowledge-ingest-target-grid">
                  <div class="knowledge-ingest-target-option" :data-active="knowledgeIngestTargets.global">
                    <div class="knowledge-ingest-check">
                      <BinaryCheckbox v-model="knowledgeIngestTargets.global" label="全局知识空间" />
                    </div>
                    <small>平台级共享知识，面向具备权限的团队、用户和智能体使用。</small>
                  </div>
                  <div class="knowledge-ingest-target-option" :data-active="knowledgeIngestTargets.external">
                    <div class="knowledge-ingest-check">
                      <BinaryCheckbox v-model="knowledgeIngestTargets.external" label="外部知识库" />
                    </div>
                    <small>同步到 Dify、RAGFlow 等外部知识库空间。</small>
                  </div>
                  <div class="knowledge-ingest-target-option" :data-active="knowledgeIngestTargets.team">
                    <div class="knowledge-ingest-check">
                      <BinaryCheckbox v-model="knowledgeIngestTargets.team" label="团队空间" />
                    </div>
                    <small>指定一个或多个团队可见，团队权限继续作为上限。</small>
                  </div>
                  <div class="knowledge-ingest-target-option" :data-active="knowledgeIngestTargets.user">
                    <div class="knowledge-ingest-check">
                      <BinaryCheckbox v-model="knowledgeIngestTargets.user" label="用户私有空间" />
                    </div>
                    <small>仅给指定用户独立使用，可多选用户。</small>
                  </div>
                </div>
                <div
                  v-if="knowledgeIngestTargets.external || knowledgeIngestTargets.team || knowledgeIngestTargets.user"
                  class="knowledge-ingest-target-detail-grid"
                >
                  <label v-if="knowledgeIngestTargets.external">
                    <span>外部库类型</span>
                    <select v-model="knowledgeIngestExternalProvider">
                      <option
                        v-for="provider in knowledgeBackendProviderOptions"
                        :key="provider.value"
                        :value="provider.value"
                      >
                        {{ provider.label }}
                      </option>
                    </select>
                  </label>
                  <label v-if="knowledgeIngestTargets.external" class="wide-field">
                    <span>库 / 空间 ID</span>
                    <input
                      v-model="knowledgeIngestExternalRefs"
                      autocomplete="off"
                      placeholder="dataset-a, knowledge-base-b"
                    />
                  </label>
                  <label v-if="knowledgeIngestTargets.team" class="wide-field">
                    <span>团队空间</span>
                    <input
                      v-model="knowledgeIngestTeamRefs"
                      autocomplete="off"
                      placeholder="平台团队, 安全团队"
                    />
                  </label>
                  <label v-if="knowledgeIngestTargets.user" class="wide-field">
                    <span>用户</span>
                    <input
                      v-model="knowledgeIngestUserRefs"
                      autocomplete="off"
                      placeholder="owner, alice@example.com"
                    />
                  </label>
                </div>
                <p v-if="knowledgeIngestTargetValidationMessage" class="module-note warning-note">
                  {{ knowledgeIngestTargetValidationMessage }}
                </p>
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
                  :disabled="!canWriteJobs || busyKey === 'knowledge:ingest' || ingestFiles.length === 0 || !canSubmitKnowledgeIngest"
                  @click="uploadFilesToKnowledge"
                >
                  {{ busyKey === "knowledge:ingest" ? "入库中" : "开始入库" }}
                </button>
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  :disabled="!canWriteJobs || ingestFiles.length === 0"
                  @click="previewKnowledgeDocumentParsing"
                >
                  预览解析
                </button>
              </div>
              <p class="module-note">{{ ingestProgress || "选择文件并配置入库目标后，处理进度会显示在这里。" }}</p>
              <pre v-if="documentPreviewResult" class="module-json-preview">{{ jsonPreview(documentPreviewResult) }}</pre>
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
                  <BridgeDownloadButton
                    :href="bridge.normalizedDocumentUrl(normalizedManifest.batchId, doc.documentId)"
                    :label="doc.title"
                    button-class="bridge-download-link"
                  />
                  <span>{{ doc.granularity }}</span>
                  <span>{{ formatBytes(doc.byteSize) }}</span>
                </div>
              </div>
            </article>

            <KnowledgeDistillationWorkbench
              v-if="isManagementKnowledgePanel && hasFeature('knowledge-distillation')"
              :can-read-knowledge="canReadKnowledge"
              :can-maintain-knowledge="canMaintainKnowledge"
              :ingest-job="ingestJob"
              :normalized-manifest="normalizedManifest"
              :format-compact-date="formatCompactDate"
              :model-options="infoFeedModelOptions"
            />

            <article v-if="activeKnowledgeTab === 'conflicts'" class="surface-card knowledge-conflict-report">
              <div class="section-header">
                <div>
                  <h3>入库冲突审核</h3>
                  <p>知识录入发现同一路径不同内容、重复来源或结构化版本冲突时，会先进入这里等待人工决策。</p>
                </div>
                <div class="source-actions">
                  <SegmentedToggle
                    v-model="knowledgeReviewStatus"
                    class="compact-select"
                    :options="knowledgeReviewStatusOptionBarOptions"
                    size="small"
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

            <article v-if="activeKnowledgeTab === 'maintenance'" class="surface-card knowledge-maintenance">
              <div class="section-header">
                <div>
                  <h3>后端知识库配置</h3>
                  <p>内建 KnowledgeCore 和外部知识库都作为可选后端提供，按卡片顺序配置。</p>
                </div>
                <button class="tool-button" type="button" @click="refreshKnowledgeConsole">
                  重新加载
                </button>
              </div>
              <p v-if="knowledgeLibraryError" class="module-note warning-note">{{ knowledgeLibraryError }}</p>

              <div class="knowledge-backend-config-list">
                <section
                  class="knowledge-backend-config-card"
                  :data-open="isKnowledgeBackendCardExpanded('builtin')"
                >
                  <div class="knowledge-card-header">
                    <div class="knowledge-card-toggle-content">
                      <span class="knowledge-library-card-main">
                        <strong>内建知识库 / Pact KnowledgeCore</strong>
                        <small>这是平台内建知识库，承载统一入库、索引、证据读取、权限和审计链路。</small>
                        <span class="knowledge-library-card-meta">
                          <span>Pact</span>
                          <span>internal</span>
                          <span>{{ knowledgeConsole?.available ? "available" : "unavailable" }}</span>
                        </span>
                      </span>
                      <span class="knowledge-library-card-status">
                        <StatusPill tone="info" label="内建" />
                        <StatusPill :tone="knowledgeConsole?.available ? 'success' : 'danger'" :label="knowledgeConsole?.available ? '可用' : '不可用'" />
                      </span>
                    </div>
                    <button
                      class="knowledge-card-icon-button"
                      type="button"
                      :aria-label="isKnowledgeBackendCardExpanded('builtin') ? '收起后端知识库配置' : '展开后端知识库配置'"
                      :title="isKnowledgeBackendCardExpanded('builtin') ? '收起' : '展开'"
                      :aria-expanded="isKnowledgeBackendCardExpanded('builtin')"
                      @click="toggleKnowledgeBackendCard('builtin')"
                    >
                      <svg
                        v-if="isKnowledgeBackendCardExpanded('builtin')"
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                      <svg
                        v-else
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>
                  </div>
                  <div v-if="isKnowledgeBackendCardExpanded('builtin')" class="knowledge-backend-config-card-body">
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
                        保存内建知识库配置
                      </button>
                    </div>
                  </div>
                </section>

                <section
                  v-for="backend in knowledgeBackendProviderCards"
                  :key="backend.provider"
                  class="knowledge-backend-config-card"
                  :data-open="isKnowledgeBackendCardExpanded(backend.provider)"
                >
                  <div class="knowledge-card-header">
                    <div class="knowledge-card-toggle-content">
                      <span class="knowledge-library-card-main">
                        <strong>{{ backend.title }}</strong>
                        <small>{{ backend.description }}</small>
                        <span class="knowledge-library-card-meta">
                          <span v-for="item in backend.meta" :key="`${backend.provider}:${item}`">{{ item }}</span>
                        </span>
                      </span>
                      <span class="knowledge-library-card-status">
                        <StatusPill tone="warning" label="外部" />
                        <StatusPill :tone="backend.statusTone" :label="backend.statusLabel" />
                      </span>
                    </div>
                    <button
                      class="knowledge-card-icon-button"
                      type="button"
                      :aria-label="isKnowledgeBackendCardExpanded(backend.provider) ? '收起后端知识库配置' : '展开后端知识库配置'"
                      :title="isKnowledgeBackendCardExpanded(backend.provider) ? '收起' : '展开'"
                      :aria-expanded="isKnowledgeBackendCardExpanded(backend.provider)"
                      @click="toggleKnowledgeBackendCard(backend.provider)"
                    >
                      <svg
                        v-if="isKnowledgeBackendCardExpanded(backend.provider)"
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                      <svg
                        v-else
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>
                  </div>
                  <div v-if="isKnowledgeBackendCardExpanded(backend.provider)" class="knowledge-backend-config-card-body">
                    <div class="knowledge-library-detail-grid">
                      <div
                        v-for="detail in backend.details"
                        :key="`${backend.provider}:${detail.label}`"
                      >
                        <span>{{ detail.label }}</span>
                        <strong>{{ detail.value }}</strong>
                      </div>
                    </div>
                    <div class="form-grid compact-form-grid knowledge-backend-provider-form">
                      <label>
                        <span>连接模式</span>
                        <select v-model="knowledgeBackendProviderForms[backend.provider].mode">
                          <option value="contract">contract</option>
                          <option value="live">live</option>
                        </select>
                      </label>
                      <label>
                        <span>Secret Ref</span>
                        <input
                          v-model="knowledgeBackendProviderForms[backend.provider].secretRef"
                          autocomplete="off"
                          placeholder="secret://pact/knowledge/provider-api-key"
                        />
                        <small class="field-hint">只允许 secret:// 引用，不在管控台保存明文密钥。</small>
                      </label>
                      <label>
                        <span>Endpoint Ref</span>
                        <input
                          v-model="knowledgeBackendProviderForms[backend.provider].endpointRef"
                          autocomplete="off"
                          placeholder="config://pact/knowledge/provider-endpoint"
                        />
                      </label>
                    </div>
                    <div class="source-actions">
                      <button
                        class="primary-action"
                        type="button"
                        :disabled="!canMaintainKnowledge || knowledgeLibraryBusy !== ''"
                        @click="connectKnowledgeBackendProvider(backend.provider)"
                      >
                        {{ knowledgeLibraryBusy === `backend:${backend.provider}` ? "连接中" : "保存并连接" }}
                      </button>
                      <button
                        class="tool-button tool-button-ghost"
                        type="button"
                        :disabled="knowledgeLibraryBusy !== ''"
                        @click="refreshKnowledgeLibrarySpaces"
                      >
                        刷新派生空间
                      </button>
                    </div>
                  </div>
                </section>
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

            <article v-if="isManagementRulesPanel" class="surface-card rule-authoring-card">
              <div class="section-header">
                <div>
                  <h3>创建规则</h3>
                  <p>同一份规则草稿支持智能对话和人工配置两种创建方式，任一侧修改都会同步到另一侧。</p>
                </div>
                <SegmentedToggle
                  v-model="ruleCreationMode"
                  :options="[{ value: 'chat', label: '智能对话' }, { value: 'manual', label: '人工配置' }]"
                  aria-label="创建规则方式"
                />
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
                  <AgentModelOptionBar
                    data-config-target="rule-authoring-agent"
                    :data-config-highlighted="highlightedConfigTarget === 'rule-authoring-agent'"
                    v-model="ruleAuthoringForm.modelAlias"
                    label="智能体"
                    placeholder="未分配智能体"
                    :options="ruleAuthoringModelOptions"
                  />
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
                  <OptionBar
                    v-model="ruleAuthoringForm.scope"
                    label="适用范围"
                    :options="ruleScopeOptionBarOptions"
                  />
                  <OptionBar
                    v-model="ruleAuthoringForm.matchStrategy"
                    label="匹配方式"
                    :options="ruleMatchStrategyOptionBarOptions"
                  />
                  <OptionBar
                    v-model="ruleAuthoringForm.action"
                    label="执行动作"
                    :options="ruleActionOptionBarOptions"
                  />
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
                <ConfigFoldCard title="门禁结果">
                  <pre>{{ jsonPreview(ruleAuthoringResult.gate || {}) }}</pre>
                </ConfigFoldCard>
                <ConfigFoldCard title="生成的 JSON 规则包">
                  <pre>{{ jsonPreview(ruleAuthoringResult.package || {}) }}</pre>
                </ConfigFoldCard>
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
