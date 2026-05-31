import { computed, ref, watch, type Ref } from "vue";
import { bridge } from "../lib/bridge";
import type {
  EmailRuleSet,
  ExpertVocabulary,
  ExpertVocabularyEntry,
} from "../lib/types";
import { emptyExpertVocabulary } from "./console-defaults";
import { asRecord } from "./console-model-utils";

type ConsoleExpertRulesControllerOptions = {
  applyRemoteConsoleDraftUpdate: (update: () => void) => void;
  clearAllBusy: () => void;
  error: Ref<string>;
  isApplyingRemoteConsoleDrafts: () => boolean;
  refreshState: (options?: { forceDrafts?: boolean }) => Promise<void>;
  setBusy: (key: string) => void;
};

function remoteDraftEquals(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function parseFallbackEmailRules(): EmailRuleSet {
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

export function createConsoleExpertRulesController(
  options: ConsoleExpertRulesControllerOptions,
) {
  const rulesText = ref("");
  const vocabularySearch = ref("");
  const showAllVocabularyEntries = ref(false);
  const expertVocabularyDraft = ref<ExpertVocabulary>({
    ...emptyExpertVocabulary,
    entries: [],
  });
  const rulesDraftDirty = ref(false);
  const expertVocabularyDraftDirty = ref(false);
  const goldenRulesState = ref<Record<string, unknown> | null>(null);

  watch(
    rulesText,
    () => {
      if (!options.isApplyingRemoteConsoleDrafts()) {
        rulesDraftDirty.value = true;
      }
    },
    { flush: "sync" },
  );

  watch(
    expertVocabularyDraft,
    () => {
      if (!options.isApplyingRemoteConsoleDrafts()) {
        expertVocabularyDraftDirty.value = true;
      }
    },
    { deep: true, flush: "sync" },
  );

  function replaceRulesDraftFromServer(
    rules: EmailRuleSet,
    optionsForReplace: { markClean?: boolean } = {},
  ) {
    const nextText = JSON.stringify(rules, null, 2);
    if (rulesText.value === nextText) {
      if (optionsForReplace.markClean !== false) {
        rulesDraftDirty.value = false;
      }
      return;
    }
    options.applyRemoteConsoleDraftUpdate(() => {
      rulesText.value = nextText;
      if (optionsForReplace.markClean !== false) {
        rulesDraftDirty.value = false;
      }
    });
  }

  function replaceExpertVocabularyDraftFromServer(
    vocabulary: ExpertVocabulary | null | undefined,
    optionsForReplace: { markClean?: boolean } = {},
  ) {
    const nextDraft = cloneExpertVocabulary(
      vocabulary || emptyExpertVocabulary,
    );
    if (remoteDraftEquals(expertVocabularyDraft.value, nextDraft)) {
      if (optionsForReplace.markClean !== false) {
        expertVocabularyDraftDirty.value = false;
      }
      return;
    }
    options.applyRemoteConsoleDraftUpdate(() => {
      expertVocabularyDraft.value = nextDraft;
      if (optionsForReplace.markClean !== false) {
        expertVocabularyDraftDirty.value = false;
      }
    });
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
      return parseFallbackEmailRules();
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

  async function refreshExpertRules(optionsForRefresh: { silent?: boolean; forceDrafts?: boolean } = {}) {
    const showBusy = !optionsForRefresh.silent;
    const forceDrafts = optionsForRefresh.forceDrafts === true;
    if (showBusy) {
      options.setBusy("expert-rules:refresh");
    }
    options.error.value = "";

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
      options.error.value = nextError instanceof Error ? nextError.message : "加载专家规则失败。";
    } finally {
      if (showBusy) {
        options.clearAllBusy();
      }
    }
  }

  async function toggleGoldenRuleEnabled(pkg: Record<string, unknown>, ruleIndex: number, enabled: boolean) {
    const packageId = String(pkg.packageId || "");
    if (!packageId) {
      return;
    }
    options.setBusy(`golden-rule:${packageId}:${ruleIndex}`);
    options.error.value = "";

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
      options.error.value = nextError instanceof Error ? nextError.message : "更新黄金规则失败。";
    } finally {
      options.clearAllBusy();
    }
  }

  async function saveRules() {
    options.setBusy("rules");
    options.error.value = "";

    try {
      await bridge.saveEmailRules(JSON.parse(rulesText.value) as EmailRuleSet);
      rulesDraftDirty.value = false;
      await options.refreshState({ forceDrafts: false });
    } catch (nextError) {
      options.error.value = nextError instanceof Error ? nextError.message : "保存规则库失败。";
      options.clearAllBusy();
    }
  }

  async function saveExpertVocabulary() {
    options.setBusy("expert-vocabulary");
    options.error.value = "";

    try {
      await bridge.saveExpertVocabulary(expertVocabularyDraft.value);
      expertVocabularyDraftDirty.value = false;
      await options.refreshState({ forceDrafts: false });
    } catch (nextError) {
      options.error.value = nextError instanceof Error ? nextError.message : "保存专家词汇库失败。";
      options.clearAllBusy();
    }
  }

  return {
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
  };
}
