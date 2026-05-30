<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useConsole, type KnowledgeTab } from '../composables/useConsole';
import { usePageRefreshHandler } from '../composables/usePageRefresh';
import { bridge } from '../lib/bridge';
import { createKnowledgeUploadedFilesPayload } from '../lib/knowledge-upload-session';
import AgentModelOptionBar from '../components/AgentModelOptionBar.vue';
import BridgeDownloadButton from '../components/BridgeDownloadButton.vue';
import BrowseSelectButton from '../components/BrowseSelectButton.vue';
import ConfigFoldCard from '../components/ConfigFoldCard.vue';
import FeatureToggle from '../components/FeatureToggle.vue';
import KnowledgeDistillationWorkbench from '../components/KnowledgeDistillationWorkbench.vue';
import OptionBar from '../components/OptionBar.vue';
import SegmentedToggle from '../components/SegmentedToggle.vue';
import StatusPill from '../components/StatusPill.vue';
import SplitToggleCard from '../components/SplitToggleCard.vue';
import UploadFileListCard from '../components/UploadFileListCard.vue';
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
  currentView,
  deleteVocabularyEntry,
  displayedVocabularyEntries,
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
  knowledgeIngestExternalTargetLabels,
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
  return tab === "management" || tab === "wordCloud" || tab === "maintenance"
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
const knowledgeBackendProviderOptions = [
  { value: "dify", label: "Dify" },
  { value: "ragflow", label: "RAG Flow" },
];
const knowledgeBackendModeOptions = [
  { value: "contract", label: "contract" },
  { value: "live", label: "live" },
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
  displayTitle: string;
  description: string;
  statusLabel: string;
  statusTone: string;
  boundaryLabel: string;
  boundaryTone: string;
  providerLabel: string;
  meta: string[];
  details: KnowledgeLibraryDetail[];
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

const expandedKnowledgeLibraryCards = ref<Record<string, boolean>>({});
const expandedKnowledgeBackendCards = ref<Record<string, boolean>>({ builtin: true });

const knowledgeBackendSpaces = computed<Array<Record<string, unknown>>>(() => {
  const items = knowledgeBackendSpacesResult.value?.spaces;
  return Array.isArray(items) ? items as Array<Record<string, unknown>> : [];
});

function isContractFixtureKnowledgeSpace(space: Record<string, unknown>) {
  const label = textField(space, "label").toLowerCase();
  const description = textField(space, "description").toLowerCase();
  return (
    description.includes("contract metadata fixture") ||
    label === "dify contract handbook".toLowerCase() ||
    label === "ragflow contract handbook".toLowerCase()
  );
}

const realKnowledgeBackendSpaces = computed<Array<Record<string, unknown>>>(() =>
  knowledgeBackendSpaces.value.filter((space) => !isContractFixtureKnowledgeSpace(space)),
);

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

function externalProviderLabel(provider: unknown) {
  const id = String(provider || "").toLowerCase();
  return knowledgeBackendProviderOptions.find((option) => option.value === id)?.label || String(provider || "外部");
}

function knowledgeLibraryDisplayTitle(provider: unknown, fallback: string) {
  const id = String(provider || "").toLowerCase();
  if (id === "pact" || id === "native" || id === "internal") return "Pact Native";
  if (id === "dify") return "Dify";
  if (id === "ragflow") return "RAG Flow";
  return fallback;
}

type KnowledgeIngestTargetOption = {
  value: string;
  label: string;
  provider?: string;
  spaceId?: string;
};

const KNOWLEDGE_INGEST_EXTERNAL_PREFIX = "external:";

function knowledgeBackendSpaceDisplayName(space: Record<string, unknown>, providerLabel: string) {
  return (
    textField(space, "displayName") ||
    textField(space, "name") ||
    textField(space, "label") ||
    textField(space, "title") ||
    textField(space, "derivedKnowledgeSpace") ||
    textField(space, "spaceId") ||
    providerLabel
  );
}

function knowledgeIngestExternalValue(provider: string, spaceId: string) {
  return `${KNOWLEDGE_INGEST_EXTERNAL_PREFIX}${provider}:${spaceId}`;
}

function parseKnowledgeIngestExternalValue(value: string) {
  if (!value.startsWith(KNOWLEDGE_INGEST_EXTERNAL_PREFIX)) {
    return null;
  }
  const externalRef = value.slice(KNOWLEDGE_INGEST_EXTERNAL_PREFIX.length);
  const separatorIndex = externalRef.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === externalRef.length - 1) {
    return null;
  }
  return {
    provider: externalRef.slice(0, separatorIndex),
    spaceId: externalRef.slice(separatorIndex + 1),
  };
}

function parseKnowledgeIngestExternalRef(ref: string) {
  const separatorIndex = ref.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === ref.length - 1) {
    const provider = knowledgeIngestExternalProvider.value || "dify";
    return ref ? knowledgeIngestExternalValue(provider, ref) : "";
  }
  return knowledgeIngestExternalValue(ref.slice(0, separatorIndex), ref.slice(separatorIndex + 1));
}

const knowledgeIngestTargetOptions = computed<KnowledgeIngestTargetOption[]>(() => {
  const options: KnowledgeIngestTargetOption[] = [
    {
      value: "global",
      label: "Pact Native 知识库",
    },
  ];
  const seen = new Set(options.map((option) => option.value));
  for (const space of realKnowledgeBackendSpaces.value) {
    const provider = String(space.provider || "").trim().toLowerCase();
    const spaceId = textField(space, "spaceId");
    if (!provider || !spaceId) {
      continue;
    }
    const value = knowledgeIngestExternalValue(provider, spaceId);
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    const providerLabel = knowledgeLibraryDisplayTitle(space.provider, externalProviderLabel(space.provider));
    options.push({
      value,
      label: knowledgeBackendSpaceDisplayName(space, providerLabel),
      provider,
      spaceId,
    });
  }
  return options;
});

const knowledgeIngestTargetValues = computed<string[]>({
  get: () => {
    const values: string[] = [];
    if (knowledgeIngestTargets.value.global) {
      values.push("global");
    }
    if (knowledgeIngestTargets.value.external) {
      const externalValues = String(knowledgeIngestExternalRefs.value || "")
        .split(/[,，\n]/)
        .map((item) => parseKnowledgeIngestExternalRef(item.trim()))
        .filter((value): value is string => Boolean(value));
      values.push(...externalValues);
    }
    const validValues = new Set(knowledgeIngestTargetOptions.value.map((option) => option.value));
    return values.filter((value) => validValues.has(value));
  },
  set: (values) => {
    const selectedValues = values.map(String);
    const externalTargets = selectedValues
      .map((value) => parseKnowledgeIngestExternalValue(value))
      .filter((target): target is { provider: string; spaceId: string } => Boolean(target));
    const externalRefs = externalTargets.map((target) => `${target.provider}:${target.spaceId}`);
    const optionLabels = new Map(knowledgeIngestTargetOptions.value.map((option) => [option.value, option.label]));
    knowledgeIngestTargets.value = {
      global: selectedValues.includes("global"),
      external: externalRefs.length > 0,
      team: false,
      user: false,
    };
    knowledgeIngestExternalProvider.value = externalTargets[0]?.provider || knowledgeIngestExternalProvider.value;
    knowledgeIngestExternalRefs.value = externalRefs.join(", ");
    knowledgeIngestExternalTargetLabels.value = Object.fromEntries(
      externalTargets.map((target) => {
        const value = knowledgeIngestExternalValue(target.provider, target.spaceId);
        return [`${target.provider}:${target.spaceId}`, optionLabels.get(value) || target.spaceId];
      }),
    );
    knowledgeIngestTeamRefs.value = "";
    knowledgeIngestUserRefs.value = "";
  },
});

const knowledgeIngestTargetDisplaySummary = computed(() => {
  const selectedValues = new Set(knowledgeIngestTargetValues.value);
  const labels = knowledgeIngestTargetOptions.value
    .filter((option) => selectedValues.has(option.value))
    .map((option) => option.label);
  return labels.length ? `将入库到：${labels.join("、")}` : "请选择入库目标";
});

function setKnowledgeIngestTargetValues(values: string | number | boolean | Array<string | number | boolean>) {
  knowledgeIngestTargetValues.value = Array.isArray(values) ? values.map(String) : [String(values)];
}

function metadataPolicyLabel(value: unknown) {
  return String(value || knowledgeBackendSpacesResult.value?.metadataPolicy || "safeMetadataOnly");
}

const knowledgeLibraryCards = computed<KnowledgeLibraryCard[]>(() => {
  const cards: KnowledgeLibraryCard[] = [];
  for (const space of realKnowledgeBackendSpaces.value) {
    const providerLabel = externalProviderLabel(space.provider);
    const contractVerified = Boolean(space.contractVerified || knowledgeBackendSpacesResult.value?.contractVerified);
    const title = knowledgeBackendSpaceDisplayName(
      space,
      knowledgeLibraryDisplayTitle(space.provider, providerLabel),
    );
    cards.push({
      id: `external:${textField(space, "spaceId", providerLabel)}`,
      title,
      displayTitle: title,
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
    const spaces = realKnowledgeBackendSpaces.value.filter(
      (space) => String(space.provider || "").toLowerCase() === provider.value,
    );
    const form = knowledgeBackendProviderForms.value[provider.value];
    return {
      provider: provider.value,
      title: provider.label,
      description: `${provider.label} 后端配置`,
      statusLabel: spaces.length ? `${spaces.length} 个知识库` : "未连接",
      statusTone: spaces.length ? "success" : "warning",
      meta: [
        form?.mode || "contract",
        "secretRef",
      ],
      details: [
        { label: "Provider", value: provider.label },
        { label: "模式", value: form?.mode || "contract" },
        { label: "Secret Ref", value: form?.secretRef || "-" },
        { label: "Endpoint Ref", value: form?.endpointRef || "-" },
        { label: "知识库", value: `${spaces.length} 个` },
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

onMounted(() => {
  void refreshKnowledgeLibrarySpaces();
});

usePageRefreshHandler(
  (detail) => detail.viewId === "knowledge" && detail.knowledgeTab === "management",
  async () => {
    await Promise.all([
      refreshKnowledgeLibrarySpaces(),
      ingestJob.value ? refreshIngestJob({ silent: true }) : Promise.resolve(),
      isManagementRulesPanel.value ? refreshExpertRules({ forceDrafts: true }) : Promise.resolve(),
    ]);
  },
);

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

                <div class="word-cloud-corpus-scope">
                  <div>
                    <strong>语料范围</strong>
                    <span v-if="wordCloudCorpusPathSummary">{{ wordCloudCorpusPathSummary }}</span>
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

                <div
                  class="word-cloud-architecture"
                  :class="{ 'is-empty': wordCloudState !== null && wordCloudCardRows.length === 0 }"
                >
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
                    </div>
                  </div>
                </div>
              </article>

              <section class="word-cloud-lower-grid">
                <form class="info-feed-input-dock word-cloud-dialog" @submit.prevent="proposeWordCloud">
                  <div class="section-header compact-section-header">
                    <div>
                      <h3>智能体分组</h3>
                    </div>
                    <StatusPill
                      :tone="selectedWordCloudModel.enabled ? 'success' : 'warning'"
                      :label="selectedWordCloudModel.enabled ? '可调用' : '未就绪'"
                    />
                  </div>
                  <textarea
                    v-model="wordCloudPrompt"
                    spellcheck="false"
                  />
                  <div class="word-cloud-dialog-controls">
                    <AgentModelOptionBar
                      v-model="wordCloudModelAlias"
                      class="word-cloud-agent-select"
                      placeholder=""
                      :options="wordCloudModelOptions"
                    />
                    <button
                      class="primary-action word-cloud-agent-submit"
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
                </div>
              </div>
              <p v-if="knowledgeLibraryError" class="module-note warning-note">{{ knowledgeLibraryError }}</p>
              <div v-if="knowledgeLibraryCards.length" class="knowledge-library-list">
                <SplitToggleCard
                  v-for="library in knowledgeLibraryCards"
                  :key="library.id"
                  class="knowledge-library-card"
                  :expanded="isKnowledgeLibraryCardExpanded(library.id)"
                  :expanded-label="`收起 ${library.title}`"
                  :collapsed-label="`展开 ${library.title}`"
                  @toggle="toggleKnowledgeLibraryCard(library.id)"
                >
                  <template #summary>
                    <div class="knowledge-card-toggle-content">
                      <span class="knowledge-library-card-main">
                        <strong>{{ library.displayTitle }}</strong>
                        <span class="knowledge-library-card-kind">{{ library.providerLabel }}</span>
                      </span>
                      <span class="knowledge-library-card-status">
                        <StatusPill :tone="library.boundaryTone" :label="library.boundaryLabel" />
                        <StatusPill :tone="library.statusTone" :label="library.statusLabel" />
                      </span>
                    </div>
                  </template>
                  <div class="knowledge-library-detail-grid">
                    <div
                      v-for="detail in library.details"
                      :key="`${library.id}:${detail.label}`"
                    >
                      <span>{{ detail.label }}</span>
                      <strong>{{ detail.value }}</strong>
                    </div>
                  </div>
                </SplitToggleCard>
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
                </div>
              </div>
              <div class="knowledge-ingest-target-select-panel">
                <OptionBar
                  label="入库目标"
                  placeholder="请选择入库目标"
                  :model-value="knowledgeIngestTargetValues"
                  :options="knowledgeIngestTargetOptions"
                  multiple
                  collapse-tags
                  clearable
                  @update:model-value="setKnowledgeIngestTargetValues"
                />
                <span>{{ knowledgeIngestTargetDisplaySummary }}</span>
              </div>
              <p v-if="knowledgeIngestTargetValidationMessage" class="module-note warning-note">
                {{ knowledgeIngestTargetValidationMessage }}
              </p>
              <div class="knowledge-ingest-section-spacer" aria-hidden="true"></div>
              <UploadFileListCard
                :files="ingestFiles"
                :can-submit="canSubmitKnowledgeIngest"
                :can-write-jobs="canWriteJobs"
                :busy-key="busyKey"
                :ingest-job="ingestJob"
                :ingest-progress="ingestProgress"
                :job-status-labels="jobStatusLabels"
                :job-status-tone="jobStatusTone"
                :format-bytes="formatBytes"
                @select="onIngestFilesSelected"
                @upload="uploadFilesToKnowledge"
                @preview="previewKnowledgeDocumentParsing"
              />
              <section v-if="documentPreviewResult" class="knowledge-document-preview-panel">
                <header class="knowledge-document-preview-header">
                  <strong>解析预览</strong>
                  <span>JSON</span>
                </header>
                <pre class="module-json-preview">{{ jsonPreview(documentPreviewResult) }}</pre>
              </section>
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

            <section v-if="activeKnowledgeTab === 'maintenance'" class="knowledge-maintenance">
              <p v-if="knowledgeLibraryError" class="module-note warning-note">{{ knowledgeLibraryError }}</p>

              <div class="knowledge-backend-config-list">
                <SplitToggleCard
                  class="knowledge-backend-config-card"
                  :expanded="isKnowledgeBackendCardExpanded('builtin')"
                  expanded-label="收起内建知识库配置"
                  collapsed-label="展开内建知识库配置"
                  @toggle="toggleKnowledgeBackendCard('builtin')"
                >
                  <template #summary>
                    <div class="knowledge-card-toggle-content">
                      <span class="knowledge-library-card-main">
                        <strong>Pact Native</strong>
                        <small>KnowledgeCore</small>
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
                  </template>
                  <div v-for="group in knowledgeSchema?.groups || []" :key="group.id" class="config-group">
                    <div class="config-group-header">
                      <h4>{{ group.label }}</h4>
                      <p v-if="knowledgeConfigGroupDescription(group.id)">{{ knowledgeConfigGroupDescription(group.id) }}</p>
                    </div>
                    <div class="form-grid compact-form-grid">
                      <label v-for="field in group.fields" :key="field.name">
                        <span
                          class="field-label-with-tooltip"
                          :class="{ 'has-tooltip': field.description }"
                          :title="field.description || undefined"
                        >
                          {{ field.label }}
                        </span>
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
                </SplitToggleCard>

                <SplitToggleCard
                  v-for="backend in knowledgeBackendProviderCards"
                  :key="backend.provider"
                  class="knowledge-backend-config-card"
                  :expanded="isKnowledgeBackendCardExpanded(backend.provider)"
                  :expanded-label="`收起 ${backend.title}`"
                  :collapsed-label="`展开 ${backend.title}`"
                  @toggle="toggleKnowledgeBackendCard(backend.provider)"
                >
                  <template #summary>
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
                  </template>
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
                    <OptionBar
                      label="连接模式"
                      :model-value="knowledgeBackendProviderForms[backend.provider].mode"
                      :options="knowledgeBackendModeOptions"
                      @update:model-value="knowledgeBackendProviderForms[backend.provider].mode = String($event)"
                    />
                    <label>
                      <span>Secret Ref</span>
                      <input
                        v-model="knowledgeBackendProviderForms[backend.provider].secretRef"
                        autocomplete="off"
                        placeholder="secret://pact/knowledge/provider-api-key"
                      />
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
                      {{ knowledgeLibraryBusy === `backend:${backend.provider}` ? "连接中" : "保存配置" }}
                    </button>
                  </div>
                </SplitToggleCard>
              </div>
            </section>

            <article
              v-if="isManagementRulesPanel"
              class="surface-card expert-rules-page"
            >
              <div class="section-header">
                <div>
                  <h3>黄金规则</h3>
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
                  <span>使用右上角刷新，或通过工作台创建规则草稿。</span>
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
                  </div>
                  <span>{{ emailReportSeriesRules.length + emailSynonymRules.length }} 条</span>
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
