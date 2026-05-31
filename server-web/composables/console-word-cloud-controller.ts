import { computed, ref, type Ref } from "vue";
import { bridge } from "../lib/bridge";
import type {
  AgentSelectorOption,
  KnowledgeWordCloud,
  KnowledgeWordCloudCorpusPath,
  KnowledgeWordCloudSet,
  KnowledgeWordCloudState,
  KnowledgeWordCloudTerm,
} from "../lib/types";
import type { WordCloudCorpusAuditAction } from "../types/app";
import {
  DEFAULT_WORD_CLOUD_ABSORB_THRESHOLD,
  autoAbsorbWordCloudTerms as autoAbsorbWordCloudTermsCore,
  cloneWordCloudSet,
  createDefaultWordCloudSet as createDefaultWordCloudSetCore,
  findWordCloudInTree,
  flattenWordCloudCards as flattenWordCloudCardsCore,
  formatWordCloudThreshold,
  isWordCloudTailCard,
  normalizeWordCloudCloudForUi,
  normalizeWordCloudCorpusPathForUi,
  normalizeWordCloudCorpusPathsForUi,
  normalizeWordCloudSetForUi,
  normalizeWordCloudTermForUi,
  normalizeWordCloudThreshold,
  preferredWordCloudCorpusPaths as preferredWordCloudCorpusPathsCore,
  wordCloudTermIdentity,
  type WordCloudCardRow,
} from "./console-word-cloud-utils";

type ReadonlyRef<T> = {
  readonly value: T;
};

export type ConsoleWordCloudAgentOption = AgentSelectorOption & {
  enabled: boolean;
  disabledReason: string;
};

export type ConsoleWordCloudControllerOptions = {
  agentSelectorOptions: ReadonlyRef<ConsoleWordCloudAgentOption[]>;
  busyKey: ReadonlyRef<string>;
  canReadKnowledge: ReadonlyRef<boolean>;
  canWriteKnowledge: ReadonlyRef<boolean>;
  clearAllBusy: () => void;
  error: Ref<string>;
  setBusy: (key: string) => void;
};

export type ConsoleWordCloudMessage = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  at: string;
};

function inactiveWordCloudAgentOption(value?: string): ConsoleWordCloudAgentOption {
  const selectedValue = String(value || "").trim();
  return {
    value: selectedValue,
    agentUid: selectedValue,
    label: selectedValue ? "已移除的智能体" : "未选择智能体",
    provider: "",
    model: "",
    moduleIds: [],
    capabilities: [],
    status: "unconfigured",
    enabled: false,
    selectable: false,
    disabledReason: selectedValue ? "已从智能体列表删除" : "未分配",
    reason: selectedValue ? "已从智能体列表删除" : "未分配",
  };
}

function selectedWordCloudAgentFromOptions(
  options: ConsoleWordCloudAgentOption[],
  value?: string,
): ConsoleWordCloudAgentOption {
  const selectedValue = String(value || "").trim();
  if (!selectedValue) {
    return inactiveWordCloudAgentOption("");
  }
  return options.find((item) => item.value === selectedValue) || inactiveWordCloudAgentOption(selectedValue);
}

function collectWordCloudTerms(wordBags: KnowledgeWordCloud[] = [], target: KnowledgeWordCloudTerm[] = []) {
  for (const wordBag of wordBags) {
    target.push(...(wordBag.terms || []));
    collectWordCloudTerms(wordBag.children || [], target);
  }
  return target;
}

export function createConsoleWordCloudController(options: ConsoleWordCloudControllerOptions) {
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
  const wordCloudMessages = ref<ConsoleWordCloudMessage[]>([]);

  const wordCloudModelOptions = computed(() => options.agentSelectorOptions.value);
  const selectedWordCloudModel = computed(() =>
    selectedWordCloudAgentFromOptions(wordCloudModelOptions.value, wordCloudModelAlias.value),
  );
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

  function flattenWordCloudCards(
    wordBags: KnowledgeWordCloud[] = [],
    depth = 0,
    parent: KnowledgeWordCloud | null = null,
  ): WordCloudCardRow[] {
    return flattenWordCloudCardsCore(wordBags, { collapsedWordBagIds: collapsedWordBagIds.value }, depth, parent);
  }

  function autoAbsorbWordCloudTerms(draft: KnowledgeWordCloudSet) {
    return autoAbsorbWordCloudTermsCore(draft, { termWithFrequency: wordCloudTermWithFrequency });
  }

  function createDefaultWordCloudSet(terms: KnowledgeWordCloudTerm[] = []): KnowledgeWordCloudSet {
    return createDefaultWordCloudSetCore(terms, {
      corpusPaths: wordCloudCorpusPaths.value,
      modelAlias: wordCloudModelAlias.value,
    });
  }

  const wordCloudTerms = computed(() =>
    wordCloudState.value?.terms?.length
      ? wordCloudState.value.terms
      : wordCloudDraft.value?.termsSnapshot || [],
  );

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

  function wordCloudTermWithFrequency(term: KnowledgeWordCloudTerm): KnowledgeWordCloudTerm {
    const key = wordCloudTermIdentity(term);
    return {
      ...term,
      frequency: Math.max(Number(term.frequency || 0), wordCloudTermFrequencyMap.value.get(key) || 0),
    };
  }

  function autoCollapseNewWordBags(wordBags: KnowledgeWordCloud[], isFirstLoad: boolean, previousIds: Set<string>) {
    const idsToCollapse = (wordBags || [])
      .filter((wordBag) => isFirstLoad || !previousIds.has(wordBag.wordBagId))
      .map((wordBag) => wordBag.wordBagId);
    if (idsToCollapse.length > 0) {
      collapsedWordBagIds.value = new Set([...collapsedWordBagIds.value, ...idsToCollapse]);
    }
  }

  function mutateWordCloudDraft(mutator: (draft: KnowledgeWordCloudSet) => void) {
    const draft = wordCloudDraft.value || createDefaultWordCloudSet(wordCloudTerms.value);
    mutator(draft);
    autoAbsorbWordCloudTerms(draft);
    draft.updatedAt = new Date().toISOString();
    wordCloudDraft.value = normalizeWordCloudSetForUi({ ...draft });
  }

  function preferredWordCloudCorpusPaths(
    remotePaths: Array<Partial<KnowledgeWordCloudCorpusPath> | string> = [],
    fallbackPaths: Array<Partial<KnowledgeWordCloudCorpusPath> | string> = wordCloudCorpusPaths.value,
  ) {
    return preferredWordCloudCorpusPathsCore(remotePaths, fallbackPaths);
  }

  function resolveWordCloudCorpusPathsForQuery(optionsForQuery: {
    corpusPaths?: Array<Partial<KnowledgeWordCloudCorpusPath> | string> | null;
  } = {}) {
    if (optionsForQuery.corpusPaths !== undefined) {
      return normalizeWordCloudCorpusPathsForUi(optionsForQuery.corpusPaths || []);
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
    const isFirstLoad = wordCloudDraft.value === null;
    const prevWordBagIds = new Set((wordCloudDraft.value?.wordBags || []).map((wordBag) => wordBag.wordBagId));
    wordCloudDraft.value = next;
    selectedWordBagId.value = findWordCloudInTree(next.wordBags, selectedWordBagId.value)
      ? selectedWordBagId.value
      : "";
    if (next.modelAlias) {
      wordCloudModelAlias.value = next.modelAlias;
    }
    wordCloudCorpusPaths.value = nextCorpusPaths;
    autoCollapseNewWordBags(next.wordBags || [], isFirstLoad, prevWordBagIds);
  }

  const wordCloudCanvasClouds = computed(() => wordCloudDraft.value?.wordBags || []);
  const wordCloudCardRows = computed(() => {
    const clouds = wordCloudCanvasClouds.value;
    const pinned = clouds.filter((wordBag) => pinnedWordBagIds.value.has(wordBag.wordBagId) && !isWordCloudTailCard(wordBag));
    const normal = clouds.filter((wordBag) => !pinnedWordBagIds.value.has(wordBag.wordBagId) && !isWordCloudTailCard(wordBag));
    const tail = clouds.filter((wordBag) => isWordCloudTailCard(wordBag));
    return flattenWordCloudCards([...pinned, ...normal, ...tail]);
  });
  const selectedWordCloud = computed(() =>
    findWordCloudInTree(wordCloudCanvasClouds.value, selectedWordBagId.value)?.cloud || null,
  );

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
    if (!cloud) {
      return;
    }
    const label = (cloud.label || "").trim();
    if (!label) {
      options.error.value = "请先填写词云名称后再调用智能体填充。";
      return;
    }
    if (!selectedWordCloudModel.value.enabled) {
      options.error.value = selectedWordCloudModel.value.disabledReason || "请选择一个可用智能体。";
      return;
    }
    const corpusPaths = resolveWordCloudCorpusPathsForQuery();
    if (corpusPaths.length === 0) {
      options.error.value = "请先添加语料范围后再启动填充任务。";
      return;
    }
    fillingWordBagIds.value = new Set([...fillingWordBagIds.value, wordBagId]);
    options.error.value = "";
    try {
      const result = await bridge.proposeKnowledgeWordClouds({
        modelAlias: selectedWordCloudModel.value.value,
        prompt: label,
        minFrequency: 1,
        corpusPaths,
      });
      fillTargetWordBagId.value = wordBagId;
      fillSourceWordBagSetId.value = result.wordBagSet.wordBagSetId;
    } catch (err) {
      fillingWordBagIds.value = new Set([...fillingWordBagIds.value].filter((id) => id !== wordBagId));
      options.error.value = err instanceof Error ? err.message : "智能体填充词云失败。";
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
          .filter((item) => item.wordBagId !== cloud.wordBagId)
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

  function updateWordCloudField(
    wordBagId: string,
    field: "label" | "summary" | "relation" | "absorbThreshold",
    value: string,
  ) {
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
      ...(cloud.terms || []).map((term) => ({ ...term, removed: false })),
      ...(cloud.removedTerms || []).map((term) => ({ ...term, removed: true })),
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
        ancestor.terms = (ancestor.terms || []).filter((item) => wordCloudTermIdentity(item) !== identity);
        ancestor.removedTerms = (ancestor.removedTerms || []).filter((item) => wordCloudTermIdentity(item) !== identity);
      }
      match.cloud.removedTerms = (match.cloud.removedTerms || []).filter((item) => wordCloudTermIdentity(item) !== identity);
      if (!(match.cloud.terms || []).some((item) => wordCloudTermIdentity(item) === identity)) {
        match.cloud.terms = [...(match.cloud.terms || []), normalized];
      }
      draft.unassignedTerms = (draft.unassignedTerms || []).filter((item) => wordCloudTermIdentity(item) !== identity);
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
    optionsForSave: { fallbackCorpusPaths?: KnowledgeWordCloudCorpusPath[] } = {},
  ) {
    const normalized = normalizeWordCloudSetForUi(cloneWordCloudSet(wordBagSet));
    normalized.corpusPaths = preferredWordCloudCorpusPaths(
      normalized.corpusPaths || [],
      optionsForSave.fallbackCorpusPaths || wordCloudCorpusPaths.value,
    );
    if (wordCloudState.value) {
      wordCloudState.value = {
        ...wordCloudState.value,
        wordBagSet: normalized,
        wordBagSets: [
          normalized,
          ...(wordCloudState.value.wordBagSets || []).filter((item) => item.wordBagSetId !== normalized.wordBagSetId),
        ],
      };
    }
    const isFirstLoad = wordCloudDraft.value === null;
    const prevWordBagIds = new Set((wordCloudDraft.value?.wordBags || []).map((wordBag) => wordBag.wordBagId));
    wordCloudDraft.value = normalized;
    wordCloudCorpusPaths.value = normalizeWordCloudCorpusPathsForUi(normalized.corpusPaths || []);
    selectedWordBagId.value = findWordCloudInTree(normalized.wordBags, selectedWordBagId.value)
      ? selectedWordBagId.value
      : "";
    autoCollapseNewWordBags(normalized.wordBags || [], isFirstLoad, prevWordBagIds);
  }

  function wordCloudCorpusPathLabel(item: KnowledgeWordCloudCorpusPath) {
    return item.type === "file" ? "文件" : "目录";
  }

  const wordCloudCorpusPathSummary = computed(() =>
    wordCloudCorpusPaths.value.length
      ? `已绑定 ${wordCloudCorpusPaths.value.length} 个目录/文件`
      : "",
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
    optionsForPersist: {
      auditAction?: WordCloudCorpusAuditAction;
      auditPaths?: KnowledgeWordCloudCorpusPath[];
    } = {},
  ) {
    if (!options.canWriteKnowledge.value) {
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
        auditAction: optionsForPersist.auditAction || "save",
        auditPaths: normalizeWordCloudCorpusPathsForUi(optionsForPersist.auditPaths || selectedCorpusPaths),
        limit: 100000,
        minFrequency: 1,
      });
      applySavedWordCloudSet(result.wordBagSet, {
        fallbackCorpusPaths: selectedCorpusPaths,
      });
    } catch (nextError) {
      options.error.value = nextError instanceof Error ? nextError.message : "保存词云语料范围失败。";
    }
  }

  async function refreshWordCloudCorpusTerms(optionsForRefresh: {
    silent?: boolean;
    forceRebuild?: boolean;
    corpusPaths?: Array<Partial<KnowledgeWordCloudCorpusPath> | string> | null;
  } = {}) {
    if (!options.canReadKnowledge.value) {
      return [];
    }
    const targetCorpusPaths = resolveWordCloudCorpusPathsForQuery({ corpusPaths: optionsForRefresh.corpusPaths });
    if (!optionsForRefresh.silent) {
      options.setBusy("knowledge:word-clouds:scope");
    }
    options.error.value = "";
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
        optionsForRefresh.forceRebuild &&
        targetCorpusPaths.length > 0 &&
        (state.terms || []).length === 0
      ) {
        wordCloudMessages.value = [{
          id: `word-cloud-scope-rebuild-${Date.now()}`,
          role: "system" as const,
          text: "已检测到语料范围内无本地词频，正在重建词频索引。",
          at: new Date().toISOString(),
        }, ...wordCloudMessages.value].slice(0, 20);
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
      options.error.value = nextError instanceof Error ? nextError.message : "刷新词云语料范围失败。";
      wordCloudMessages.value = [{
        id: `word-cloud-scope-error-${Date.now()}`,
        role: "system" as const,
        text: options.error.value,
        at: new Date().toISOString(),
      }, ...wordCloudMessages.value].slice(0, 20);
      if (state && state.terms) {
        return state.terms || [];
      }
    } finally {
      if (!optionsForRefresh.silent && options.busyKey.value === "knowledge:word-clouds:scope") {
        options.clearAllBusy();
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
    if (options.canReadKnowledge.value) {
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
    if (options.canReadKnowledge.value) {
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
    if (options.canReadKnowledge.value) {
      void refreshWordCloudCorpusTerms({ corpusPaths: [] });
    }
  }

  async function refreshWordCloud(optionsForRefresh: { silent?: boolean } = {}) {
    if (!options.canReadKnowledge.value) {
      return;
    }
    if (!optionsForRefresh.silent) {
      options.setBusy("knowledge:word-clouds");
    }
    options.error.value = "";
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
      options.error.value = nextError instanceof Error ? nextError.message : "加载词云失败。";
    } finally {
      if (!optionsForRefresh.silent && options.busyKey.value === "knowledge:word-clouds") {
        options.clearAllBusy();
      }
    }
  }

  async function saveWordCloud() {
    if (!options.canWriteKnowledge.value) {
      options.error.value = "需要 knowledge:write 权限才能保存词云。";
      return;
    }
    const draft = wordCloudDraft.value || createDefaultWordCloudSet(wordCloudTerms.value);
    autoAbsorbWordCloudTerms(draft);
    options.setBusy("knowledge:word-clouds:save");
    options.error.value = "";
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
      options.error.value = nextError instanceof Error ? nextError.message : "保存词云失败。";
    } finally {
      if (options.busyKey.value === "knowledge:word-clouds:save") {
        options.clearAllBusy();
      }
    }
  }

  async function proposeWordCloud() {
    if (!options.canWriteKnowledge.value) {
      options.error.value = "需要 knowledge:write 权限才能调用智能体生成词云。";
      return;
    }
    if (!selectedWordCloudModel.value.enabled) {
      options.error.value = selectedWordCloudModel.value.disabledReason || "请选择一个可用智能体。";
      return;
    }
    options.setBusy("knowledge:word-clouds:propose");
    options.error.value = "";
    const prompt = wordCloudPrompt.value.trim();
    if (!prompt) {
      options.error.value = "请输入词云分组意图。";
      options.clearAllBusy();
      return;
    }
    const corpusPaths = resolveWordCloudCorpusPathsForQuery();
    if (corpusPaths.length === 0) {
      options.error.value = "请先添加语料范围后再启动分类任务。";
      wordCloudMessages.value = [{
        id: `word-cloud-error-${Date.now()}`,
        role: "system" as const,
        text: options.error.value,
        at: new Date().toISOString(),
      }, ...wordCloudMessages.value].slice(0, 20);
      options.clearAllBusy();
      return;
    }
    wordCloudMessages.value = [{
      id: `word-cloud-user-${Date.now()}`,
      role: "user" as const,
      text: prompt,
      at: new Date().toISOString(),
    }, ...wordCloudMessages.value].slice(0, 20);
    try {
      const preparedTerms = await refreshWordCloudCorpusTerms({
        silent: true,
        forceRebuild: true,
        corpusPaths,
      });
      if ((preparedTerms || []).length === 0) {
        options.error.value = corpusPaths.length > 0
          ? "已扫描语料范围但未发现可用词频，建议确认目录下有已入库文档并重新启动该任务。"
          : "请先添加语料范围后再启动分类任务。";
        wordCloudMessages.value = [{
          id: `word-cloud-error-${Date.now()}`,
          role: "system" as const,
          text: options.error.value,
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
      options.error.value = nextError instanceof Error ? nextError.message : "智能体生成词云失败。";
      wordCloudMessages.value = [{
        id: `word-cloud-error-${Date.now()}`,
        role: "system" as const,
        text: options.error.value,
        at: new Date().toISOString(),
      }, ...wordCloudMessages.value].slice(0, 20);
    } finally {
      if (options.busyKey.value === "knowledge:word-clouds:propose") {
        options.clearAllBusy();
      }
    }
  }

  function applyWordCloudEvent(wordBagSet: KnowledgeWordCloudSet) {
    if (fillSourceWordBagSetId.value && wordBagSet.wordBagSetId === fillSourceWordBagSetId.value) {
      const targetId = fillTargetWordBagId.value;
      if (targetId) {
        for (const term of collectWordCloudTerms(wordBagSet.wordBags || [])) {
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

  return {
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
  };
}
