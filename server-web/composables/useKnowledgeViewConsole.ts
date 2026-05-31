import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useConsole, type KnowledgeTab } from './useConsole';
import { knowledgeRouteTabToViewTab } from '../router/routes';
import { usePageRefreshHandler } from './usePageRefresh';
import { bridge } from '../lib/bridge';

export function useKnowledgeViewConsole() {
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
    return knowledgeRouteTabToViewTab(String(route.params.tab ?? "")) ?? knowledgeTab.value;
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

  return {
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
    activeKnowledgeTab,
    expandedSummaryIds,
    toggleSummaryExpanded,
    expandedAdvancedIds,
    toggleAdvancedExpanded,
    titleFocusedWordBagId,
    jumpToCloud,
    isManagementKnowledgePanel,
    isManagementRulesPanel,
    isKnownKnowledgeTab,
    dynamicParsingPolicySignature,
    documentPreviewResult,
    knowledgeBackendSpacesResult,
    knowledgeLibraryBusy,
    knowledgeLibraryError,
    knowledgeBackendProviderOptions,
    knowledgeBackendModeOptions,
    knowledgeBackendProviderForms,
    expandedKnowledgeLibraryCards,
    expandedKnowledgeBackendCards,
    knowledgeBackendSpaces,
    realKnowledgeBackendSpaces,
    isKnowledgeLibraryCardExpanded,
    toggleKnowledgeLibraryCard,
    isKnowledgeBackendCardExpanded,
    toggleKnowledgeBackendCard,
    textField,
    externalProviderLabel,
    knowledgeLibraryDisplayTitle,
    knowledgeBackendSpaceDisplayName,
    knowledgeIngestExternalValue,
    parseKnowledgeIngestExternalValue,
    parseKnowledgeIngestExternalRef,
    knowledgeIngestTargetOptions,
    knowledgeIngestTargetValues,
    knowledgeIngestTargetDisplaySummary,
    setKnowledgeIngestTargetValues,
    metadataPolicyLabel,
    knowledgeLibraryCards,
    knowledgeBackendProviderCards,
    refreshKnowledgeLibrarySpaces,
    connectKnowledgeBackendProvider,
  };
}
