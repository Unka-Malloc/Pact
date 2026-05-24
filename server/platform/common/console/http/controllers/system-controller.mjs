import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getSettingsPath,
  loadSettings,
  normalizeSettings,
  saveSettings
} from "../../../platform-core/settings.mjs";
import {
  buildBootstrapPayload,
  getDiscoveryConfigPath,
  saveDiscoveryConfig
} from "../../../platform-core/discovery/config.mjs";
import { getEmailRulesPath, loadEmailRules, saveEmailRules } from "../../../../specialized/knowledge/preprocessing/domain/rules/email-rules.mjs";
import {
  getExpertVocabularyPath,
  getExpertVocabularySummary,
  listExpertVocabularyVersions,
  loadExpertVocabulary,
  saveExpertVocabulary
} from "../../../../specialized/knowledge/preprocessing/domain/rules/expert-vocabulary.mjs";
import {
  getKnowledgeGuidanceSummary,
  getKnowledgeTaxonomyPath,
  listKnowledgeTaxonomyVersions,
  loadKnowledgeTaxonomy,
  saveKnowledgeTaxonomy
} from "../../../../specialized/knowledge/preprocessing/domain/knowledge-taxonomy/index.mjs";
import { preprocessWordCloudVocabulary } from "../../../../specialized/knowledge/preprocessing/word-cloud/preprocess.mjs";
import {
  createDocumentParsingRuntime,
  toPublicDocumentParsingResult
} from "../../../../specialized/knowledge/preprocessing/document-parsing-runtime.mjs";
import {
  deleteUploadSession,
  resolveUploadSessionFiles
} from "../../../../../protocols/checkpoint/upload-session-store.mjs";
import { getCodexOAuthStatus, startCodexDeviceLogin } from "../../../security/auth/codex-oauth-service.mjs";
import { getAgentConfigRegistry } from "../../../../specialized/agent/agent-configs/config-registry.mjs";
import { enhanceAffairTaxonomy } from "../../../../specialized/knowledge/preprocessing/domain/knowledge-taxonomy/service.mjs";
import { getBackgroundProcessStatus } from "../../../devops/process-status/background-process-status.mjs";
import {
  getSourceFileEvidence,
  isSourceEvidenceId,
  searchSourceFiles
} from "../../../../../platform/specialized/knowledge/retrieval/source-file-search-service.mjs";
import { createKnowledgeDistillationWorkbench } from "../../../../specialized/knowledge/invocation/knowledge-distillation-workbench/index.mjs";
import {
  getMountConfigPath,
  getMountConfigPaths,
  loadMountConfig,
  mergeMountRouting,
  saveMountConfig
} from "../../../module-manager/mount-config.mjs";
import {
  buildClientConnectionList,
  buildConsoleState,
  buildKnowledgeConsoleSummary,
  buildRuntimeInfo
} from "../api-facade.mjs";
import {
  contentDispositionFileName,
  parseBooleanFlag,
  parseEntityTypes,
  sendJson
} from "../http-utils.mjs";
import { hashClientString, serverToken } from "../../../security/client-strings.mjs";
import { reconcileStorage, runStorageDoctor } from "../../../storage/ops-tools.mjs";
import {
  createStorageBackup,
  listStorageBackups,
  restoreStorageBackup
} from "../../../storage/backup-restore.mjs";
import { logRuntimeEvent } from "../../../observability/runtime-logger.mjs";
import { buildProductionHealthReport } from "../../../production-readiness/report-reader.mjs";
import {
  buildExecutiveReport,
  createExecutiveReportStore
} from "../../../production-readiness/executive-report.mjs";
import { buildArchitectureLiveMap } from "../../../production-readiness/architecture-live-map.mjs";
import { createSampleBusinessPackStore } from "../../../production-readiness/sample-business-pack.mjs";
import {
  listModuleTemplates,
  planModuleScaffold,
  runModuleContractTest,
  scaffoldModule,
  validateCapabilityPackageScaffoldManifest
} from "../../../module-manager/module-ecosystem/index.mjs";
import { createWorkspaceGovernanceRegistry } from "../../../../specialized/agent/workspace-governance/index.mjs";
import { createCapabilityPackageRegistry } from "../../../../specialized/capabilities/package-lifecycle/index.mjs";
import { createAssetLineageRegistry } from "../../../../specialized/knowledge/assets/asset-lineage/index.mjs";
import {
  GERRIT_ACTIONS,
  executeGerritCommonOperation,
  uploadGerritGitChange
} from "../../../../specialized/capabilities/code-review/gerrit/index.mjs";
import { executeRepoOperation } from "../../../../specialized/capabilities/code-repository/repo-operations/index.mjs";
import { createDataConnectorGovernance } from "../../../../specialized/knowledge/connectors/data-connector-governance/index.mjs";
import { buildClientRuntimeBootstrapPlan } from "../../../../../services/client/client-runtime-core/client-runtime-bootstrap.mjs";
import {
  listCapacityBenchmarkTargets,
  runPerformanceCapacityBenchmark
} from "../../../../specialized/knowledge/performance/capacity-benchmark/index.mjs";

function parseJsonBody(requestBody) {
  return requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
}

function parseWordCloudRequestPayload(requestBody, url) {
  const payload = requestBody?.length
    ? parseJsonBody(requestBody)
    : Object.fromEntries(url.searchParams.entries());
  const queryCorpusPaths = [
    ...url.searchParams.getAll("corpusPath"),
    ...url.searchParams.getAll("corpusPaths")
  ].filter(Boolean);
  if (queryCorpusPaths.length > 0 && !payload.corpusPaths) {
    payload.corpusPaths = queryCorpusPaths.map((item) => {
      const [type, ...pathParts] = String(item).split(":");
      const selectedPath = pathParts.join(":");
      return selectedPath && ["file", "directory"].includes(type)
        ? { type, path: selectedPath }
        : { path: item };
    });
  }
  return payload;
}

function sendWordCloudMutationError(response, error) {
  const statusCode = Number(error?.statusCode || 500);
  sendJson(response, statusCode >= 400 && statusCode < 600 ? statusCode : 500, {
    ok: false,
    code: error?.code || "word_cloud_error",
    error: error?.message || "词袋操作失败。"
  });
}

function clampRequestInteger(value, fallback, min = 1, max = 1000000000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function isIntentPromptLike(input) {
  const normalized = String(input || "").trim();
  return normalized.length > 0;
}

function normalizeAuditCorpusPaths(values = []) {
  const paths = [];
  const source = Array.isArray(values) ? values : [values];
  const seen = new Set();
  for (const value of source) {
    const record = typeof value === "string" ? { path: value } : value || {};
    const selectedPath = String(record.path || "").trim();
    if (!selectedPath) {
      continue;
    }
    const type = String(record.type || "").trim();
    const normalized = {
      type: type === "file" || type === "directory" ? type : "",
      path: selectedPath,
      basename: path.basename(selectedPath)
    };
    const key = `${normalized.type}:${normalized.path}`.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    paths.push(normalized);
  }
  return paths;
}

function normalizeModelLibraryAgentAuditAgent(entry = {}) {
  const provider = String(entry.provider || "").trim();
  const model = String(entry.model || entry.engine || "").trim();
  const alias = String(entry.alias || entry.uid || entry.instanceId || "").trim();
  const agentName = String(entry.agentName || entry.label || alias || "").trim();
  return {
    uid: alias,
    provider,
    model,
    agentName,
    baseUrl: String(entry.baseUrl || entry.url || "").trim(),
    timeoutMs: Number(entry.timeoutMs || 0),
    apiKeyConfigured: Boolean(entry.apiKey || entry.token || entry.apiKeyConfigured || entry.tokenConfigured)
  };
}

function normalizeModelLibraryAuditList(models = []) {
  const normalized = [];
  for (const model of Array.isArray(models) ? models : []) {
    const item = normalizeModelLibraryAgentAuditAgent(model);
    if (!item.provider && !item.model && !item.uid) {
      continue;
    }
    normalized.push(item);
  }
  normalized.sort((left, right) => {
    const providerSort = String(left.provider || "").localeCompare(String(right.provider || ""));
    if (providerSort !== 0) {
      return providerSort;
    }
    const modelSort = String(left.model || "").localeCompare(String(right.model || ""));
    if (modelSort !== 0) {
      return modelSort;
    }
    return String(left.uid || "").localeCompare(String(right.uid || ""));
  });
  return {
    total: normalized.length,
    providers: [...new Set(normalized.map((item) => String(item.provider || "").trim()).filter(Boolean))],
    items: normalized
  };
}

function modelLibraryAgentAuditKey(entry = {}) {
  const uid = String(entry.uid || "").trim();
  const provider = String(entry.provider || "").trim();
  const model = String(entry.model || entry.engine || "").trim();
  const alias = String(entry.alias || entry.agentName || entry.label || "").trim();
  if (uid) {
    return uid;
  }
  return `${provider}::${model}::${alias}`;
}

function diffModelLibraryAgents(before = [], after = []) {
  const beforeMap = new Map(
    (Array.isArray(before) ? before : [])
      .map((agent) => [modelLibraryAgentAuditKey(agent), normalizeModelLibraryAgentAuditAgent(agent)])
      .filter(([key]) => String(key).trim().length > 0)
  );
  const afterMap = new Map(
    (Array.isArray(after) ? after : [])
      .map((agent) => [modelLibraryAgentAuditKey(agent), normalizeModelLibraryAgentAuditAgent(agent)])
      .filter(([key]) => String(key).trim().length > 0)
  );
  const added = [];
  const removed = [];
  const changed = [];
  for (const [key, next] of afterMap.entries()) {
    const previous = beforeMap.get(key) || null;
    if (!previous) {
      added.push(next);
      continue;
    }
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      changed.push({ before: previous, after: next, key });
    }
  }
  for (const [key, item] of beforeMap.entries()) {
    if (!afterMap.has(key)) {
      removed.push(item);
    }
  }
  return {
    beforeCount: beforeMap.size,
    afterCount: afterMap.size,
    added,
    removed,
    changed
  };
}

function extractJsonObjectFromText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    // Some model adapters wrap JSON in prose or fenced blocks.
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Fall through to brace extraction.
    }
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function normalizePromptHint(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "目标分类";
  }
  const stopWords = new Set([
    "词云",
    "词汇",
    "分组",
    "分类",
    "创建",
    "生成",
    "提取",
    "列表",
    "聚类"
  ]);
  const candidates = normalized
    .replace(/[\u0000-\u001f]/g, " ")
    .split(/[\s,/，。.!?！?、;；]/g)
    .map((item) => String(item || "").trim())
    .filter((item) => item && !stopWords.has(item));
  return candidates[0] || "目标分类";
}

function buildWordCloudAgentPrompt({ terms, prompt }) {
  const supervisorPrompt = String(prompt || "").trim();
  const wordBagHint = normalizePromptHint(supervisorPrompt);
  const lines = [
    "你是 Pact 词云分组智能体。你只能根据输入的语料词频进行分组，不要编造新词。",
    "任务：根据用户意图自动判断需要多少个分类卡片，把词语归集到可嵌套的词云树。",
    "一个词可以属于多个顶层卡片；同一卡片内部如果词语被放进子分组，就不要再留在父卡片 terms 中。",
    "无法归类的高置信词先放进 label 为 Default 的顶层卡片。",
    "明显乱码、噪声、低置信词放到 otherTerms（后续会进入其它卡片）。",
    "不要使用算法解释，只输出 JSON。每张卡片需要 label、summary、terms，可选 children。",
    "每个 term 来源于输入词频，禁止新增新词。",
    "relation 可用 separate、overlap、contains，表示与其它卡片的大致关系。"
  ];
  if (supervisorPrompt) {
    lines.push(`人工监督要求：${supervisorPrompt}`);
  }
  lines.push(
    "输出格式：",
    `{"title":"语料词云","wordBags":[{"wordBagId":"word-bag-1","label":"${wordBagHint}","summary":"...","relation":"overlap","terms":[{"term":"...","weight":1}],"children":[{"wordBagId":"word-bag-1-1","label":"...","terms":[{"term":"..."}]}]}],"otherTerms":[{"term":"...","weight":0.1}],"defaultTerms":[{"term":"...","weight":0.1}]}`,
    "说明：otherTerms 表示 low-weight/噪声词；defaultTerms 表示正常无法归类词。",
    "语料词频：",
    JSON.stringify(terms)
  );
  return lines.join("\n");
}

function wordCloudTermIdentity(value = {}) {
  const term = typeof value === "string" ? value : value?.term;
  return String(term || "").trim().toLowerCase();
}

function buildWordCloudTermFrequencyMap(terms = []) {
  const map = new Map();
  for (const item of Array.isArray(terms) ? terms : []) {
    const identity = wordCloudTermIdentity(item);
    if (!identity) {
      continue;
    }
    const frequency = Number(item?.frequency || 0);
    map.set(identity, Number.isFinite(frequency) ? Math.max(0, Math.floor(frequency)) : 0);
  }
  return map;
}

function normalizeWordCloudTermForAgent(value = {}, sourceFrequencyByTerm = new Map()) {
  const identity = wordCloudTermIdentity(value);
  if (!identity) {
    return null;
  }
  const frequencyFromSource = sourceFrequencyByTerm.get(identity) || sourceFrequencyByTerm.get(identity.toLowerCase()) || 0;
  const frequency = Number(value?.frequency ?? value?.count ?? frequencyFromSource);
  const weight = Number(value?.weight || 0);
  return {
    term: identity,
    frequency: Number.isFinite(frequency) ? Math.max(0, Math.floor(frequency)) : Number(frequencyFromSource || 0),
    weight: Number.isFinite(weight) ? Math.max(0, weight) : 0
  };
}

function normalizeWordCloudWordBagsFromAgent(rawWordBags = [], sourceFrequencyByTerm = new Map()) {
  if (!Array.isArray(rawWordBags)) {
    return [];
  }

  const usedWordBagIds = new Set();
  const assignWordBagId = (rawCloud = {}, index = 0) => {
    let rawWordBagId = String(rawCloud?.wordBagId || rawCloud?.id || `word-bag-${index + 1}`).trim();
    if (!rawWordBagId) {
      rawWordBagId = `word-bag-${index + 1}`;
    }
    let wordBagId = rawWordBagId;
    let suffix = 1;
    while (usedWordBagIds.has(wordBagId)) {
      suffix += 1;
      wordBagId = `${rawWordBagId}-${suffix}`;
    }
    usedWordBagIds.add(wordBagId);
    return wordBagId;
  };

  return rawWordBags.map((rawCloud, index) => {
    const source = rawCloud && typeof rawCloud === "object" ? rawCloud : {};
    const usedTerms = new Set();
    const terms = [];
    const relation = String(source.relation || "separate").trim() || "separate";
    for (const item of Array.isArray(source.terms) ? source.terms : []) {
      const normalized = normalizeWordCloudTermForAgent(item, sourceFrequencyByTerm);
      if (!normalized) {
        continue;
      }
      const identity = wordCloudTermIdentity(normalized);
      if (!identity || usedTerms.has(identity)) {
        continue;
      }
      usedTerms.add(identity);
      terms.push(normalized);
    }

    const children = normalizeWordCloudWordBagsFromAgent(source.children || source.subgroups || source.groups || [], sourceFrequencyByTerm);

    return {
      wordBagId: assignWordBagId(source, index),
      label: String(source.label || "").trim() || "词云",
      summary: typeof source.summary === "string" ? source.summary.trim() : "",
      relation,
      terms,
      children: Array.isArray(children) ? children : [],
      parentWordBagId: String(source.parentWordBagId || "").trim() || undefined
    };
  });
}

function normalizeWordCloudTermArray(rawTerms = [], sourceFrequencyByTerm = new Map(), reserved = new Set()) {
  const used = new Set(Array.isArray(reserved) ? reserved : []);
  const terms = [];
  for (const item of Array.isArray(rawTerms) ? rawTerms : []) {
    const normalized = normalizeWordCloudTermForAgent(item, sourceFrequencyByTerm);
    if (!normalized) {
      continue;
    }
    const identity = wordCloudTermIdentity(normalized);
    if (!identity || used.has(identity)) {
      continue;
    }
    used.add(identity);
    terms.push(normalized);
  }
  return terms;
}

function ensureCloudCardByLabel(wordBags = [], label = "", terms = []) {
  const list = Array.isArray(wordBags) ? [...wordBags] : [];
  const normalizedLabel = String(label || "").trim();
  const labelKey = normalizedLabel.toLowerCase();
  if (!normalizedLabel) {
    return list;
  }

  const fallback = {
    wordBagId: labelKey === "默认" || labelKey === "default" ? "default" : labelKey === "其它" || labelKey === "其他" ? "other" : labelKey,
    label: normalizedLabel,
    summary: `${normalizedLabel}卡片。`,
    relation: "separate",
    terms: [],
    children: []
  };
  if (labelKey === "default" || labelKey === "默认") {
    fallback.summary = "所有尚未进入明确分组的词汇。";
  }
  if (labelKey === "其它" || labelKey === "其他") {
    fallback.summary = "低权重、低置信或噪声词汇。";
  }

  const existingIndex = list.findIndex((cloud) => String(cloud?.label || "").trim().toLowerCase() === labelKey);
  if (existingIndex >= 0) {
    const existing = list[existingIndex] || {};
    const normalizedExistingTerms = normalizeWordCloudTermArray(existing?.terms || [], new Map(), []);
    const dedupTerms = normalizeWordCloudTermArray(terms, new Map(), new Set(normalizedExistingTerms.map((item) => item.term)));
    list[existingIndex] = {
      ...existing,
      wordBagId: String(existing.wordBagId || fallback.wordBagId).trim() || fallback.wordBagId,
      label: normalizedLabel,
      relation: String(existing.relation || fallback.relation).trim() || fallback.relation,
      terms: [...normalizedExistingTerms, ...dedupTerms]
    };
    return list;
  }

  fallback.terms = normalizeWordCloudTermArray(terms, new Map(), new Set());
  list.push(fallback);
  return list;
}

function buildWordCloudFromAgentResponse({
  parsed = {},
  fullTerms = [],
  fallbackRaw = {}
}) {
  const sourceTermList = Array.isArray(fullTerms) ? fullTerms : [];
  const sourceFrequencyByTerm = buildWordCloudTermFrequencyMap(sourceTermList);
  const sourceTerms = sourceTermList
    .map((term) => normalizeWordCloudTermForAgent(term, sourceFrequencyByTerm))
    .filter((term) => term && term.term);

  const knownIdentities = new Set(
    sourceTerms
      .map((term) => wordCloudTermIdentity(term))
      .filter(Boolean)
  );

  const parsedWordBags = normalizeWordCloudWordBagsFromAgent(parsed.wordBags || [], sourceFrequencyByTerm);
  const assignedIdentities = collectWordCloudAssignedTermIds(parsedWordBags);

  const parsedDefaultTerms = normalizeWordCloudTermArray(parsed.defaultTerms || [], sourceFrequencyByTerm, new Set());
  const parsedOtherTerms = normalizeWordCloudTermArray(parsed.otherTerms || [], sourceFrequencyByTerm, new Set());
  const fallbackKnownLowTerms = normalizeWordCloudTermArray(
    Array.isArray(fallbackRaw?.lowQualityTerms) ? fallbackRaw.lowQualityTerms : [],
    sourceFrequencyByTerm,
    new Set()
  );
  const lowQualitySet = new Set(
    sourceTerms
      .filter((item) => String(item?.quality || "normal").toLowerCase() === "low")
      .map((item) => wordCloudTermIdentity(item))
      .filter(Boolean)
  );

  const mergedOtherSeed = normalizeWordCloudTermArray(
    [...parsedOtherTerms, ...fallbackKnownLowTerms],
    sourceFrequencyByTerm,
    new Set()
  );
  const otherSet = new Set(mergedOtherSeed.map((term) => wordCloudTermIdentity(term)));
  const defaultSet = new Set(parsedDefaultTerms.map((term) => wordCloudTermIdentity(term)));

  if (otherSet.size > 0) {
    for (const identity of otherSet) {
      defaultSet.delete(identity);
    }
    for (const identity of otherSet) {
      assignedIdentities.delete(identity);
    }
  }

  const fallbackTerms = sourceTerms
    .filter((term) => {
      const identity = wordCloudTermIdentity(term);
      return identity && !assignedIdentities.has(identity) && !otherSet.has(identity) && !lowQualitySet.has(identity);
    })
    .filter((term) => {
      if (defaultSet.has(wordCloudTermIdentity(term))) {
        return false;
      }
      return true;
    });

  const mergedDefaultTerms = normalizeWordCloudTermArray(
    [...parsedDefaultTerms, ...fallbackTerms],
    sourceFrequencyByTerm,
    new Set(Array.isArray(fallbackRaw.excludedTerms) ? fallbackRaw.excludedTerms : [])
  );
  const mergedOtherTerms = normalizeWordCloudTermArray(
    [...mergedOtherSeed, ...sourceTerms.filter((term) => lowQualitySet.has(wordCloudTermIdentity(term)))],
    sourceFrequencyByTerm,
    new Set()
  );
  const finalWordBags = ensureCloudCardByLabel(
    ensureCloudCardByLabel(parsedWordBags, "默认", mergedDefaultTerms),
    "其它",
    mergedOtherTerms
  );
  const finalAssigned = collectWordCloudAssignedTermIds(finalWordBags);
  const unassignedTerms = normalizeWordCloudTermArray(sourceTerms, sourceFrequencyByTerm, finalAssigned);

  return {
    title: String(parsed?.title || "").trim() || "语料词云",
    wordBags: finalWordBags,
    modelParsed: {
      parsedKnownCount: assignedIdentities.size,
      modelWordBagCount: parsedWordBags.length,
      modelDefaultCount: mergedDefaultTerms.length,
      modelOtherCount: mergedOtherTerms.length,
      defaultCount: mergedDefaultTerms.length,
      otherCount: mergedOtherTerms.length
    },
    unassignedTerms,
    knownIdentities,
    sourceTermCount: sourceTerms.length,
    sourceFrequencyByTerm
  };
}

function buildWordCloudFallbackResult(fullTerms = [], preprocess = null) {
  const sourceTermList = Array.isArray(fullTerms) ? fullTerms : [];
  const sourceFrequencyByTerm = buildWordCloudTermFrequencyMap(sourceTermList);
  const sourceTerms = sourceTermList
    .map((term) => normalizeWordCloudTermForAgent(term, sourceFrequencyByTerm))
    .filter((term) => term && term.term);
  const lowQualityTermSet = new Set(
    sourceTerms
      .filter((term) => String(term?.quality || "normal").toLowerCase() === "low")
      .map((term) => wordCloudTermIdentity(term))
      .filter(Boolean)
  );
  const fallbackKnownLowTerms = normalizeWordCloudTermArray(
    Array.isArray(preprocess?.lowQualityTerms) ? preprocess.lowQualityTerms : [],
    sourceFrequencyByTerm,
    lowQualityTermSet
  );
  const otherTerms = normalizeWordCloudTermArray(
    sourceTerms.filter((term) => lowQualityTermSet.has(wordCloudTermIdentity(term))),
    sourceFrequencyByTerm,
    new Set()
  );
  const mergedOtherTerms = normalizeWordCloudTermArray(
    [...otherTerms, ...fallbackKnownLowTerms],
    sourceFrequencyByTerm,
    new Set()
  );
  const defaultTerms = normalizeWordCloudTermArray(
    sourceTerms.filter((term) => !lowQualityTermSet.has(wordCloudTermIdentity(term))),
    sourceFrequencyByTerm,
    new Set(mergedOtherTerms.map((item) => wordCloudTermIdentity(item)))
  );

  const fallback = normalizeWordCloudWordBagsFromAgent([], sourceFrequencyByTerm);
  const finalWordBags = ensureCloudCardByLabel(
    ensureCloudCardByLabel(fallback, "默认", defaultTerms),
    "其它",
    mergedOtherTerms
  );
  const finalAssigned = collectWordCloudAssignedTermIds(finalWordBags);
  const fallbackUnassignedTerms = normalizeWordCloudTermArray(sourceTerms, sourceFrequencyByTerm, finalAssigned);

  return {
    title: "语料词云",
    wordBags: finalWordBags,
    modelParsed: {
      parsedKnownCount: 0,
      modelWordBagCount: 0,
      modelDefaultCount: defaultTerms.length,
      modelOtherCount: mergedOtherTerms.length,
      defaultCount: defaultTerms.length,
      otherCount: mergedOtherTerms.length,
      fallbackMode: true
    },
    unassignedTerms: fallbackUnassignedTerms,
    knownIdentities: new Set(defaultTerms.map((item) => wordCloudTermIdentity(item)).concat(mergedOtherTerms.map((item) => wordCloudTermIdentity(item))).filter(Boolean)),
    sourceTermCount: sourceTerms.length,
    sourceFrequencyByTerm
  };
}

function collectWordCloudAssignedTermIds(wordBags = [], target = new Set()) {
  for (const cloud of Array.isArray(wordBags) ? wordBags : []) {
    for (const term of Array.isArray(cloud?.terms) ? cloud.terms : []) {
      const identity = wordCloudTermIdentity(term);
      if (identity) {
        target.add(identity);
      }
    }
    collectWordCloudAssignedTermIds(cloud?.children || cloud?.subgroups || cloud?.groups || [], target);
  }
  return target;
}

function wordCloudQueueInput(run = {}, patch = {}) {
  return {
    kind: "knowledge_word_cloud",
    ownerId: run.runId,
    queueId: run.queueId,
    label: "词云分类后台任务",
    source: "knowledge-word-cloud",
    phase: patch.phase || run.status || "queued",
    status: patch.status || run.status || "queued",
    checkpointId: run.checkpointId || "",
    metadata: {
      featureId: "knowledge-word-cloud",
      modelAlias: run.modelAlias || "",
      termCount: run.termCount || 0,
      promptHash: run.promptHash || "",
      ...(patch.metadata || {})
    }
  };
}

async function queueMonitorStarted(queueMonitor, input) {
  if (typeof queueMonitor?.registerStarted === "function") {
    return queueMonitor.registerStarted(input);
  }
  return null;
}

async function queueMonitorHeartbeat(queueMonitor, input) {
  if (typeof queueMonitor?.registerHeartbeat === "function") {
    return queueMonitor.registerHeartbeat(input);
  }
  return null;
}

async function queueMonitorClosed(queueMonitor, input) {
  if (typeof queueMonitor?.registerClosed === "function") {
    return queueMonitor.registerClosed(input);
  }
  return null;
}

async function runWordCloudClassificationTask({
  userDataPath,
  metadataStore,
  protocolEventBus,
  contextRuntime,
  clientRuntimeAllocator,
  queueMonitor,
  run,
  terms,
  prompt,
  modelAlias,
  preprocess
}) {
  const preprocessing = preprocess && typeof preprocess === "object" ? preprocess : null;
  const sourceTerms = Array.isArray(terms) ? terms : [];
  const modelTerms = Array.isArray(preprocessing?.agentTerms) && preprocessing.agentTerms.length > 0
    ? preprocessing.agentTerms
    : sourceTerms;
  try {
    await queueMonitorHeartbeat(queueMonitor, wordCloudQueueInput(run, {
      phase: "model_call",
      status: "running"
    }));
    const { callAgentGateway } = await loadAgentGatewayModule();
    const runtimeSettings = await loadSettings(userDataPath);
    const agentConfigRegistry = getAgentConfigRegistry();
    await agentConfigRegistry.refresh({ settingsFallback: runtimeSettings });
    const gatewayResult = await callAgentGateway({
      settings: {
        ...runtimeSettings,
        modelLibraryAgents: agentConfigRegistry.getModelLibraryAgents(),
        modelLibraryEntries: agentConfigRegistry.getModelLibraryEntries()
      },
      userDataPath,
      contextRuntime,
      clientRuntimeAllocator,
      contextCompactionSource: "knowledge-word-cloud",
      input: {
        modelAlias,
        moduleId: "knowledge",
        featureId: "knowledge-word-cloud",
        taskId: "knowledge.word_clouds.propose",
        question: buildWordCloudAgentPrompt({
          terms: modelTerms,
          prompt
        }),
        parameters: {
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 3200
        }
      }
    });
    await queueMonitorHeartbeat(queueMonitor, wordCloudQueueInput(run, {
      phase: "persist_result",
      status: "running"
    }));
    const parsed = extractJsonObjectFromText(gatewayResult.answer || gatewayResult.text || "");
    if (!parsed || typeof parsed !== "object") {
      throw new Error("智能体没有返回可解析的词云 JSON。");
    }
    const parsedResult = buildWordCloudFromAgentResponse({
      parsed,
      fullTerms: sourceTerms,
      fallbackRaw: preprocessing
    });
    const saved = await metadataStore.saveKnowledgeWordCloudSet({
      limit: sourceTerms.length || 1,
      wordBagSet: {
        wordBagSetId: run.wordBagSetId,
        title: parsedResult.title || "语料词云",
        status: "completed",
        wordBagCount: parsedResult.wordBags.length,
        termsSnapshot: sourceTerms,
        wordBags: parsedResult.wordBags,
        unassignedTerms: parsedResult.unassignedTerms || [],
        modelAlias,
        agentResponse: {
          run: {
          ...run,
          status: "completed",
          completedAt: new Date().toISOString()
          },
          preprocess: preprocessing,
          parsedModel: {
            fallbackMode: false,
            sourceTermsCount: sourceTerms.length,
            modelTermsCount: modelTerms.length
          },
          parsed,
          upstream: gatewayResult.upstream || null,
          answer: gatewayResult.answer || gatewayResult.text || ""
        }
      }
    });
    await queueMonitorClosed(queueMonitor, wordCloudQueueInput(
      { ...run, status: "completed" },
      {
        phase: "closed",
        status: "completed",
        metadata: { wordBagSetId: saved.wordBagSet?.wordBagSetId || run.wordBagSetId }
      }
    ));
    await publishProtocolEvent(
      protocolEventBus,
      "knowledge.word_clouds",
      saved,
      { type: "knowledge.word_clouds.proposed" }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error || "词云分类任务失败。");
    const fallback = sourceTerms.length > 0
      ? buildWordCloudFallbackResult(sourceTerms, preprocessing)
      : null;
    if (fallback) {
      const fallbackSaved = await metadataStore.saveKnowledgeWordCloudSet({
        limit: sourceTerms.length || 1,
        wordBagSet: {
          wordBagSetId: run.wordBagSetId,
          title: fallback.title || "语料词云",
          status: "completed",
          wordBagCount: fallback.wordBags.length,
          termsSnapshot: sourceTerms,
          wordBags: fallback.wordBags,
          unassignedTerms: fallback.unassignedTerms || sourceTerms,
          modelAlias,
          agentResponse: {
            run: {
            ...run,
            status: "completed",
            completedAt: new Date().toISOString()
            },
            preprocess: preprocessing,
            parsed: {
              fallback: true,
              wordBags: fallback.wordBags,
              modelParsed: fallback.modelParsed,
              errorMessage
            },
            fallback: true,
            fallbackReason: errorMessage,
            parsedModel: {
              fallbackMode: true,
              sourceTermsCount: sourceTerms.length,
              modelTermsCount: modelTerms.length,
              parsedKnownCount: fallback.modelParsed?.parsedKnownCount || 0
            }
          }
        }
      });
      await queueMonitorClosed(queueMonitor, wordCloudQueueInput(
        { ...run, status: "completed" },
        {
          phase: "closed",
          status: "completed",
          metadata: {
            wordBagSetId: fallbackSaved.wordBagSet?.wordBagSetId || run.wordBagSetId,
            degraded: true,
            fallbackReason: errorMessage
          }
        }
      ));
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.word_clouds",
        fallbackSaved,
        { type: "knowledge.word_clouds.proposed" }
      );
      return;
    }
    const failed = await metadataStore.saveKnowledgeWordCloudSet({
      limit: sourceTerms.length || 1,
      wordBagSet: {
        wordBagSetId: run.wordBagSetId,
        title: "语料词云",
        status: "failed",
        wordBagCount: 0,
        termsSnapshot: sourceTerms,
        wordBags: [],
        unassignedTerms: sourceTerms,
        modelAlias,
        agentResponse: {
          run: {
          ...run,
          status: "failed",
          failedAt: new Date().toISOString()
          },
          preprocess: preprocessing,
          fallback: false,
          parsedModel: {
            fallbackMode: false,
            sourceTermsCount: sourceTerms.length,
            modelTermsCount: modelTerms.length
          },
          error: errorMessage
        }
      }
    });
    await queueMonitorClosed(queueMonitor, wordCloudQueueInput(
      { ...run, status: "failed" },
      {
        phase: "closed",
        status: "failed",
        metadata: { error: errorMessage }
      }
    ));
    await publishProtocolEvent(
      protocolEventBus,
      "knowledge.word_clouds",
      failed,
      { type: "knowledge.word_clouds.failed" }
    );
  }
}

async function resumeWordCloudClassificationTasks({
  userDataPath,
  metadataStore,
  protocolEventBus,
  contextRuntime,
  clientRuntimeAllocator,
  queueMonitor
}) {
  const state = await metadataStore.getKnowledgeWordCloudState({
    limit: 100000,
    setLimit: 100
  });
  const pendingSets = (state.wordBagSets || []).filter((wordBagSet) =>
    ["queued", "running"].includes(String(wordBagSet?.status || ""))
  );
  for (const wordBagSet of pendingSets) {
    const run = wordBagSet.agentResponse?.run;
    const prompt = String(run?.prompt || "").trim();
    const modelAlias = String(run?.modelAlias || wordBagSet.modelAlias || "").trim();
    if (!run?.runId || !prompt || !modelAlias) {
      continue;
    }
    const preprocess = wordBagSet.agentResponse?.preprocess && typeof wordBagSet.agentResponse.preprocess === "object"
      ? wordBagSet.agentResponse.preprocess
      : null;
    const terms = wordBagSet.termsSnapshot?.length
      ? wordBagSet.termsSnapshot
      : metadataStore.listSourceCorpusRawTerms({ limit: 100000, minFrequency: 1 });
    await queueMonitorHeartbeat(queueMonitor, wordCloudQueueInput(
      { ...run, status: "running", termCount: terms.length },
      {
        phase: "resume",
        status: "running",
        metadata: { resumed: true }
      }
    ));
    setImmediate(() => {
      void runWordCloudClassificationTask({
        userDataPath,
        metadataStore,
        protocolEventBus,
        contextRuntime,
        clientRuntimeAllocator,
        queueMonitor,
        run: { ...run, status: "running", termCount: terms.length },
        terms,
        prompt,
        modelAlias,
        preprocess
      });
    });
  }
}

async function loadAgentGatewayModule() {
  return import("../../../../specialized/agent/agent-gateway/index.mjs");
}

async function loadModelProbeModule() {
  return import("../../../../specialized/agent/agent-gateway/model-probe/index.mjs");
}

function defaultAgentSyncPolicy() {
  return {
    async loadAgentSyncConfig() {
      return { topics: [] };
    },
    async saveAgentSyncConfig() {
      return { topics: [] };
    },
    normalizeAgentSyncTopic(value) {
      return String(value || "").trim();
    },
    filterRequestedSubscriptionTopics(_config, requestedTopics = []) {
      const requested = requestedTopics.map((topic) => String(topic || "").trim()).filter(Boolean);
      return {
        denyAll: false,
        requested,
        topics: requested
      };
    },
    filterAgentSyncSubscriptionResult(_config, result = {}) {
      return result;
    },
    async publishAgentSyncEvent() {
      return {
        ok: false,
        status: 404,
        error: "agent_sync feature is not active in this feature edition."
      };
    }
  };
}

const PATH_BROWSER_MAX_ENTRIES = 600;
const PATH_BROWSER_IGNORED_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "__pycache__"
]);

function normalizePathBrowserMode(value) {
  return value === "file" ? "file" : "directory";
}

function normalizePathBrowserExtensions(value) {
  const items = Array.isArray(value) ? value : [];
  return items
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .map((item) => (item.startsWith(".") ? item : `.${item}`));
}

function createPathBrowserRoots() {
  const roots = new Map();
  const addRoot = (label, value) => {
    const nextPath = String(value || "").trim();
    if (!nextPath) {
      return;
    }
    roots.set(path.resolve(nextPath), label);
  };

  addRoot("当前项目", process.cwd());
  addRoot("当前用户", os.homedir());
  const rootPath = path.parse(process.cwd()).root;
  addRoot(rootPath === "/" ? "根目录" : rootPath, rootPath);

  const cloudStoragePath = path.join(os.homedir(), "Library", "CloudStorage");
  try {
    for (const entry of fsSync.readdirSync(cloudStoragePath, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const label = /^OneDrive/i.test(entry.name)
          ? `OneDrive · ${entry.name.replace(/^OneDrive[- ]?/i, "") || "本机"}`
          : `云盘 · ${entry.name}`;
        addRoot(label, path.join(cloudStoragePath, entry.name));
      }
    }
  } catch {
    // CloudStorage is platform/user dependent; absence should not affect path browsing.
  }
  try {
    for (const entry of fsSync.readdirSync(os.homedir(), { withFileTypes: true })) {
      if (entry.isDirectory() && /^OneDrive/i.test(entry.name)) {
        addRoot(`OneDrive · ${entry.name.replace(/^OneDrive[- ]?/i, "") || "本机"}`, path.join(os.homedir(), entry.name));
      }
    }
  } catch {
    // Ignore unreadable home entries.
  }

  if (process.platform === "darwin") {
    try {
      for (const entry of fsSync.readdirSync("/Volumes", { withFileTypes: true })) {
        if (entry.isDirectory()) {
          addRoot(`磁盘 · ${entry.name}`, path.join("/Volumes", entry.name));
        }
      }
    } catch {
      // Mounted volumes are platform/user dependent.
    }
  }

  return [...roots.entries()].map(([rootPathValue, label]) => ({
    label,
    path: rootPathValue
  }));
}

async function resolvePathBrowserDirectory(inputPath) {
  const requestedPath = String(inputPath || "").trim();
  const absolutePath = path.resolve(requestedPath || process.cwd());
  try {
    const stats = await fs.stat(absolutePath);
    if (stats.isDirectory()) {
      return absolutePath;
    }
    return path.dirname(absolutePath);
  } catch {
    return path.dirname(absolutePath);
  }
}

async function statPathBrowserEntry({ absolutePath, name, mode, extensions }) {
  const stats = await fs.stat(absolutePath);
  const type = stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other";
  const extension = path.extname(name).toLowerCase();
  const fileAllowed = extensions.length === 0 || extensions.includes(extension);
  return {
    name,
    path: absolutePath,
    type,
    byteSize: stats.isFile() ? stats.size : 0,
    modifiedAt: stats.mtime.toISOString(),
    hidden: name.startsWith("."),
    selectable:
      (mode === "directory" && type === "directory") ||
      (mode === "file" && type === "file" && fileAllowed),
    browsable: type === "directory"
  };
}

async function browseServerPath({
  requestedPath,
  mode,
  extensions,
  includeHidden,
  userDataPath,
  distPath
}) {
  const currentPath = await resolvePathBrowserDirectory(requestedPath);
  const roots = createPathBrowserRoots({ userDataPath, distPath });
  const parentPath = path.dirname(currentPath);
  let entries = [];
  let error = "";

  try {
    const directoryEntries = await fs.readdir(currentPath, { withFileTypes: true });
    const names = directoryEntries
      .map((entry) => entry.name)
      .filter((name) => includeHidden || !name.startsWith("."))
      .filter((name) => !PATH_BROWSER_IGNORED_NAMES.has(name))
      .sort((left, right) => left.localeCompare(right, "zh-CN"));

    const listed = [];
    for (const name of names) {
      const absolutePath = path.join(currentPath, name);
      try {
        listed.push(await statPathBrowserEntry({ absolutePath, name, mode, extensions }));
      } catch {
        // Ignore unreadable entries; the browser is for choosing paths, not diagnostics.
      }
      if (listed.length >= PATH_BROWSER_MAX_ENTRIES) {
        break;
      }
    }

    entries = listed.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "directory" ? -1 : 1;
      }
      return left.name.localeCompare(right.name, "zh-CN");
    });
  } catch (browseError) {
    error = browseError instanceof Error ? browseError.message : "无法读取目录。";
  }

  return {
    currentPath,
    parentPath: parentPath === currentPath ? "" : parentPath,
    mode,
    extensions,
    roots,
    entries,
    truncated: entries.length >= PATH_BROWSER_MAX_ENTRIES,
    error
  };
}

function modelForProbeProvider(settings = {}, provider = "") {
  switch (provider) {
    case "google-gemini":
      return settings.googleModel;
    case "openai-chatgpt":
      return settings.openAiModel;
    case "deepseek":
      return settings.deepSeekModel;
    case "openrouter":
      return settings.openRouterModel;
    case "copilot":
      return settings.copilotModel;
    case "local-model":
      return settings.localModelName;
    case "custom-http":
      return settings.customModelAlias || settings.customHttpAdapter?.alias;
    default:
      return "";
  }
}

function findModelLibraryAgentForProbe(settings = {}, modelAlias = "", provider = "") {
  const normalizedAlias = String(modelAlias || "").trim();
  const normalizedProvider = String(provider || "").trim();
  const models = Array.isArray(settings.modelLibraryAgents) ? settings.modelLibraryAgents : [];
  if (normalizedAlias) {
    const byAlias = models.find((model) =>
      [model?.uid, model?.instanceId, model?.alias]
        .map((value) => String(value || "").trim())
        .includes(normalizedAlias)
    );
    if (byAlias) {
      return byAlias;
    }
  }
  const targetModel = String(modelForProbeProvider(settings, normalizedProvider) || "").trim();
  return models.find((model) => {
    if (normalizedProvider && String(model?.provider || "").trim() !== normalizedProvider) {
      return false;
    }
    if (!targetModel) {
      return true;
    }
    return [model?.model, model?.engine].map((value) => String(value || "").trim()).includes(targetModel);
  });
}

function preserveModelLibrarySecretsForProbe(incomingModels, currentSettings = {}) {
  if (!Array.isArray(incomingModels)) {
    return incomingModels;
  }
  const currentModels = Array.isArray(currentSettings.modelLibraryAgents)
    ? currentSettings.modelLibraryAgents
    : [];
  const currentByKey = new Map();
  for (const model of currentModels) {
    for (const key of [model?.uid, model?.instanceId, model?.alias].filter(Boolean)) {
      currentByKey.set(String(key).trim(), model);
    }
  }
  return incomingModels.map((model) => {
    const key = String(model?.uid || model?.instanceId || model?.alias || "").trim();
    const current = currentByKey.get(key);
    if (!current) {
      return model;
    }
    const next = { ...model };
    if (!String(next.apiKey || "").trim() && current.apiKey) {
      next.apiKey = current.apiKey;
    }
    if (!String(next.token || "").trim() && current.token) {
      next.token = current.token;
    }
    return next;
  });
}

function applySelectedModelSecretForProbe(settings = {}, provider = "", modelAlias = "") {
  if (!modelAlias) {
    return settings;
  }
  const selected = findModelLibraryAgentForProbe(settings, modelAlias, provider);
  if (!selected) {
    return settings;
  }
  if (provider === "deepseek") {
    settings.deepSeekApiKey = String(selected.apiKey || "").trim();
    settings.deepSeekApiKeyConfigured = Boolean(selected.apiKey);
    settings.deepSeekBaseUrl = String(selected.baseUrl || settings.deepSeekBaseUrl || "").trim();
    settings.deepSeekModel = String(selected.model || selected.engine || settings.deepSeekModel || "").trim();
  }
  if (provider === "custom-http") {
    const token = String(selected.token || selected.apiKey || "").trim();
    const selectedAdapter = {
      ...(settings.customHttpAdapter || {}),
      ...selected,
      alias: String(selected.uid || selected.instanceId || selected.alias || modelAlias).trim(),
      token,
      tokenConfigured: Boolean(token),
      url: String(selected.url || settings.customHttpAdapter?.url || "").trim(),
      engine: String(selected.engine || selected.model || "").trim()
    };
    settings.customHttpAdapter = selectedAdapter;
    settings.customHttpAdapters = [selectedAdapter];
  }
  return settings;
}

function mergeSettingsForModelProbe(currentSettings = {}, incomingSettings = {}, provider = "", options = {}) {
  const current = normalizeSettings(currentSettings);
  const incoming = incomingSettings && typeof incomingSettings === "object" ? incomingSettings : {};
  const nextSettings = {
    ...current,
    ...incoming
  };

  for (const key of [
    "googleApiKey",
    "openRouterApiKey",
    "deepSeekApiKey",
    "copilotApiKey",
    "customModelApiKey"
  ]) {
    if (!String(incoming?.[key] || "").trim() && current[key]) {
      nextSettings[key] = current[key];
    }
  }

  if (
    !String(incoming?.customHttpAdapter?.token || "").trim() &&
    current.customHttpAdapter?.token
  ) {
    nextSettings.customHttpAdapter = {
      ...(nextSettings.customHttpAdapter || {}),
      token: current.customHttpAdapter.token
    };
  }
  if (Array.isArray(incoming?.modelLibraryAgents)) {
    nextSettings.modelLibraryAgents = preserveModelLibrarySecretsForProbe(
      incoming.modelLibraryAgents,
      current
    );
  }

  if (nextSettings.customHttpAdapter) {
    const mergedAdapter = {
      ...(nextSettings.customHttpAdapter || {}),
      ...(incoming.customHttpAdapter || {})
    };
    nextSettings.customHttpAdapter = mergedAdapter;
  }

  return normalizeSettings(
    applySelectedModelSecretForProbe(
      nextSettings,
      String(provider || "").trim(),
      String(options.modelAlias || "").trim()
    )
  );
}

function sendJsonWithHeaders(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function getKnowledgeCore(runtime) {
  const mount = runtime?.mounts?.knowledgeBase;
  if (!mount || mount.enabled === false) {
    return null;
  }
  return mount;
}

function parseKnowledgeSearchInput({ requestBody, url }) {
  const payload = parseJsonBody(requestBody);
  const parsed = requestBody.length > 0
    ? payload
    : {
        query: url.searchParams.get("query") || url.searchParams.get("q") || "",
        limit: Number(url.searchParams.get("limit") || 20),
        batchId: url.searchParams.get("batchId") || url.searchParams.get("batch-id") || "",
        retrievalProfileId:
          url.searchParams.get("retrievalProfileId") ||
          url.searchParams.get("profile-id") ||
          url.searchParams.get("profile") ||
          "",
        profileKey:
          url.searchParams.get("profileKey") ||
          url.searchParams.get("profile-key") ||
          url.searchParams.get("retrievalProfileKey") ||
          "",
        clientId:
          url.searchParams.get("clientId") ||
          url.searchParams.get("client-id") ||
          "",
        clientUid:
          url.searchParams.get("clientUid") ||
          url.searchParams.get("client-uid") ||
          "",
        workspaceId:
          url.searchParams.get("workspaceId") ||
          url.searchParams.get("workspace-id") ||
          "",
        learningEnabled: parseBooleanFlag(url.searchParams.get("learningEnabled") || url.searchParams.get("learning-enabled") || url.searchParams.get("learning") || "true"),
        hierarchyReasoning: parseBooleanFlag(url.searchParams.get("hierarchyReasoning") || url.searchParams.get("hierarchy-reasoning") || "false"),
        modelEnabled: parseBooleanFlag(url.searchParams.get("modelEnabled") || url.searchParams.get("model-enabled") || url.searchParams.get("useModel") || "false"),
        explain: parseBooleanFlag(url.searchParams.get("explain") || "false"),
        format: url.searchParams.get("format") || ""
      };
  return enforceMultimodalKnowledgeSearch(parsed);
}

function enforceMultimodalKnowledgeSearch(payload = {}) {
  const {
    modality: _modality,
    modalities: _modalities,
    mediaType: _mediaType,
    mediaTypes: _mediaTypes,
    filters,
    ...rest
  } = payload || {};
  const nextFilters = { ...(filters && typeof filters === "object" && !Array.isArray(filters) ? filters : {}) };
  delete nextFilters.modality;
  delete nextFilters.modalities;
  delete nextFilters.mediaType;
  delete nextFilters.mediaTypes;
  return {
    ...rest,
    ...(Object.keys(nextFilters).length ? { filters: nextFilters } : {}),
    modalityPolicy: "multimodal"
  };
}

function arrayOfStrings(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function workspaceAccessOptions(authSession = null) {
  const user = authSession?.user || {};
  return {
    actorUserId: String(user.userId || ""),
    canAccessAll: true,
    sharingMode: "team-shared"
  };
}

function applyWorkspaceRuntimeContext(payload = {}, agentWorkspace = null, options = {}) {
  const agentSessionId = String(
    payload.agentSessionId ||
      payload.agent_session_id ||
      payload.sessionThreadId ||
      payload.session_thread_id ||
      payload.workspaceSessionId ||
      payload.workspace_session_id ||
      ""
  ).trim();
  const workspaceId = String(
    payload.workspaceId ||
      payload.workspace_id ||
      payload.sessionWorkspaceId ||
      ""
  ).trim();
  if (agentSessionId && agentWorkspace && typeof agentWorkspace.getSessionContext === "function") {
    const sessionContext = agentWorkspace.getSessionContext(agentSessionId, options);
    if (!sessionContext) {
      return {
        input: payload,
        workspaceContext: null,
        workspaceError: {
          status: 404,
          error: "会话线程不存在或不可访问。"
        }
      };
    }
    const next = {
      ...payload,
      agentSessionId,
      workspaceId: sessionContext.workspaceId,
      workspaceContext: sessionContext,
      agentSessionContext: sessionContext
    };
    if (!next.contextProfileId && sessionContext.contextProfileId) {
      next.contextProfileId = sessionContext.contextProfileId;
    }
    if (!next.modelAlias && !next.alias && !next.model && sessionContext.modelAlias) {
      next.modelAlias = sessionContext.modelAlias;
      next.alias = sessionContext.modelAlias;
    }
    if (!next.toolGrantId && !next.grantId && sessionContext.toolGrantId) {
      next.toolGrantId = sessionContext.toolGrantId;
    }
    const explicitSourceIds = [
      ...arrayOfStrings(next.scopeSourceIds),
      ...arrayOfStrings(next.sourceIds)
    ];
    if (explicitSourceIds.length === 0 && sessionContext.knowledgeSourceIds?.length) {
      next.scopeSourceIds = sessionContext.knowledgeSourceIds;
    }
    return {
      input: next,
      workspaceContext: sessionContext
    };
  }
  if (!workspaceId || !agentWorkspace || typeof agentWorkspace.getWorkspaceContext !== "function") {
    return {
      input: payload,
      workspaceContext: null,
      workspaceError: workspaceId
        ? {
            status: 503,
            error: "工作空间上下文不可用。"
          }
        : null
    };
  }

  const workspaceContext = agentWorkspace.getWorkspaceContext(workspaceId, options);
  if (!workspaceContext) {
    return {
      input: payload,
      workspaceContext: null,
      workspaceError: {
        status: 404,
        error: "工作空间不存在或不可访问。"
      }
    };
  }

  const next = {
    ...payload,
    workspaceId,
    workspaceContext
  };
  if (!next.contextProfileId && workspaceContext.contextProfileId) {
    next.contextProfileId = workspaceContext.contextProfileId;
  }
  if (!next.modelAlias && !next.alias && !next.model && workspaceContext.modelAlias) {
    next.modelAlias = workspaceContext.modelAlias;
    next.alias = workspaceContext.modelAlias;
  }
  if (!next.toolGrantId && !next.grantId && workspaceContext.toolGrantId) {
    next.toolGrantId = workspaceContext.toolGrantId;
  }

  const explicitSourceIds = [
    ...arrayOfStrings(next.scopeSourceIds),
    ...arrayOfStrings(next.sourceIds)
  ];
  if (explicitSourceIds.length === 0 && workspaceContext.knowledgeSourceIds?.length) {
    next.scopeSourceIds = workspaceContext.knowledgeSourceIds;
  }

  return {
    input: next,
    workspaceContext
  };
}

function parseTopicQuery(url) {
  const values = [
    ...url.searchParams.getAll("topic"),
    ...url.searchParams.getAll("topics")
  ];
  return values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

async function publishProtocolEvent(protocolEventBus, topic, payload, options = {}) {
  if (!protocolEventBus || typeof protocolEventBus.publish !== "function") {
    return null;
  }
  return protocolEventBus.publish(topic, payload, options);
}

function hasClientSuppliedString(value, keys) {
  if (!value || typeof value !== "object") {
    return false;
  }
  return keys.some((key) => typeof value[key] === "string" && value[key].trim());
}

function clientVersionString(value) {
  const text = String(value || "").trim().slice(0, 80);
  return /^[A-Za-z0-9._:@+ -]*$/.test(text) ? text : hashClientString(text, "client.version");
}

function stripClientDiscoveryStrings(value = {}) {
  return {
    mode: value.mode === "forward" ? "forward" : "active",
    refreshIntervalSeconds: value.refreshIntervalSeconds,
    checkInIntervalSeconds: value.checkInIntervalSeconds,
    offlineAfterSeconds: value.offlineAfterSeconds
  };
}

async function requireToolManagementScope({ platform, request, response, scopes }) {
  if (!platform?.store?.authorizeRequest) {
    sendJson(response, 503, {
      error: "Tool Management API is unavailable."
    });
    return null;
  }
  const authorization = platform.store.authorizeRequest({
    request,
    requiredScopes: scopes
  });
  if (!authorization.ok) {
    sendJson(response, authorization.status || 403, {
      error: authorization.error || "工具权限不足。"
    });
    return null;
  }
  return authorization;
}

export function createSystemController({
  userDataPath,
  distPath,
  runtime,
  jobManager,
  metadataStore,
  serverLabel,
  getDiscoveryState,
  setDiscoveryState,
  getListenUrl,
  getInterfaceCatalog = () => [],
  protocolEventBus = null,
  consoleAuth = null,
  operationAuditStore = null,
  maintenanceAgent = null,
  knowledgeSourceService = null,
  agentWorkspace = null,
  contextRuntime = null,
  evidenceSufficiencyGate = null,
  knowledgeAgentSkill = null,
  goldenRuleRuntime = null,
  knowledgeRuleAuthoringRuntime = null,
  knowledgeSkillRuntime = null,
  knowledgeDistillationRuntime = null,
  agentEvaluationRuntime = null,
  modelDecisionRuntime = null,
  knowledgeEvolutionRuntime = null,
  summarizationRuntime = null,
  agentExplorationRuntime = null,
  clientRuntimeAllocator = null,
  checkpointTreeApi = null,
  queueMonitor = null,
  monitorAlertApi = null,
  getFeatureEntries = () => null,
  getToolManagementPlatform = () => null
}) {
  const agentConfigRegistry = getAgentConfigRegistry();
  const documentParsingRuntime = createDocumentParsingRuntime();
  const knowledgeDistillationWorkbench = createKnowledgeDistillationWorkbench({
    userDataPath,
    jobManager,
    knowledgeDistillationRuntime,
    queueMonitor
  });

  function appendConsoleOperationLog(entry = {}) {
    if (operationAuditStore) {
      try {
        operationAuditStore.append({
          transport: "http",
          risk: entry.risk || "",
          readOnly: entry.readOnly === true,
          status: entry.status || "ok",
          actor: entry.authSession || entry.actor || {},
          operationId: entry.operationId || "console.operation",
          input: entry.input || {},
          output: entry.output,
          error: entry.error || ""
        });
      } catch {
        // Runtime logging below is best-effort and must not break the console path.
      }
    }
    logRuntimeEvent(entry.level || (entry.status === "failed" ? "warn" : "info"), entry.event || entry.operationId || "console.operation", {
      operationId: entry.operationId || "console.operation",
      status: entry.status || "ok",
      actor: entry.authSession?.user || entry.actor || {},
      input: entry.input || {},
      output: entry.output || {},
      error: entry.error || ""
    });
  }

  async function loadAgentRuntimeSettings(options = {}) {
    const settings = await loadSettings(userDataPath, options);
    const fallbackSettings = options.redactSecrets
      ? await loadSettings(userDataPath)
      : settings;
    await agentConfigRegistry.refresh({ settingsFallback: fallbackSettings });
    return {
      ...settings,
      modelLibraryEntries: agentConfigRegistry.getModelLibraryEntries(),
      modelLibraryAgentIds: agentConfigRegistry.getModelLibraryAgents().map((agent) => agent.uid).filter(Boolean),
      modelLibraryAgents: agentConfigRegistry.getModelLibraryAgents({
        redactSecrets: options.redactSecrets === true
      })
    };
  }

  function requireMaintenanceAgent(response) {
    if (!maintenanceAgent) {
      sendJson(response, 503, {
        error: "维护智能体模块不可用。"
      });
      return false;
    }
    return true;
  }

  function isFeatureActive(featureId) {
    const features = getFeatureEntries ? getFeatureEntries() : null;
    const active = Array.isArray(features?.activeFeatureIds) ? features.activeFeatureIds : [];
    return active.length === 0 || active.includes(featureId);
  }

  async function loadAgentSyncPolicy() {
    if (!isFeatureActive("agent-gateway")) {
      return defaultAgentSyncPolicy();
    }
    return import("../../../../../protocols/agent-sync/policy.mjs");
  }

  function normalizeAgentStringList(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean);
    }
    if (typeof value === "string") {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
    return [];
  }

  function normalizeAgentParameters(value) {
    if (!value) {
      return {};
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeAgentModelPayload(payload = {}) {
    const source = payload?.agent || payload?.value || payload?.config || payload || {};
    const patch = {};
    const assignString = (target, keys) => {
      for (const key of keys) {
        if (Object.hasOwn(source, key)) {
          const value = source[key];
          patch[target] = String(value ?? "").trim();
          return;
        }
      }
    };

    assignString("uid", ["uid", "agentId"]);
    assignString("provider", ["provider", "modelProvider"]);
    assignString("label", ["name", "label", "agentName"]);
    assignString("model", ["model", "modelId", "engine"]);
    assignString("baseUrl", ["baseUrl", "base_url"]);
    assignString("url", ["url", "endpoint"]);
    assignString("apiKey", ["apiKey", "api_key", "key"]);
    assignString("token", ["token"]);
    assignString("tokenHeader", ["tokenHeader", "token_header"]);
    assignString("tokenPrefix", ["tokenPrefix", "token_prefix"]);
    assignString("systemPrompt", ["systemPrompt", "prompt"]);

    if (Object.hasOwn(patch, "label") && !Object.hasOwn(patch, "agentName")) {
      patch.agentName = patch.label;
    }
    if (Object.hasOwn(patch, "model") && !Object.hasOwn(patch, "engine")) {
      patch.engine = patch.model;
    }
    if (source.parameters !== undefined || source.parametersText !== undefined) {
      patch.parameters = normalizeAgentParameters(source.parameters ?? source.parametersText);
    }
    if (source.pluginList !== undefined || source.plugins !== undefined) {
      patch.pluginList = normalizeAgentStringList(source.pluginList ?? source.plugins);
    }
    if (source.timeoutMs !== undefined && source.timeoutMs !== null && source.timeoutMs !== "") {
      const timeoutMs = Number(source.timeoutMs);
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        patch.timeoutMs = timeoutMs;
      }
    }
    return patch;
  }

  function sanitizeAgentPatchForLog(patch = {}) {
    const safe = {};
    const entries = Object.entries(patch || {});
    for (const [key, value] of entries) {
      if (["apiKey", "token", "apiKeyConfigured", "tokenConfigured"].includes(key)) {
        continue;
      }
      safe[key] = value;
    }
    return safe;
  }

  function createAgentUid(entry = {}) {
    const digest = crypto
      .createHash("sha256")
      .update(
        [
          entry.provider || "deepseek",
          entry.label || entry.agentName || "",
          entry.model || entry.engine || "",
          entry.baseUrl || entry.url || "",
          crypto.randomUUID()
        ].join("\n")
      )
      .digest("hex")
      .slice(0, 16);
    return `agent_${digest}`;
  }

  function agentModelIdentity(entry = {}) {
    return [entry.uid, entry.instanceId, entry.alias, entry.id]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  function findAgentModelIndex(models = [], agentId = "") {
    const id = String(agentId || "").trim();
    if (!id) {
      return -1;
    }
    const directIndex = models.findIndex((entry) => agentModelIdentity(entry).includes(id));
    if (directIndex >= 0) {
      return directIndex;
    }
    const nameMatches = models
      .map((entry, index) => ({
        index,
        name: String(entry.label || entry.agentName || "").trim()
      }))
      .filter((entry) => entry.name && entry.name === id);
    return nameMatches.length === 1 ? nameMatches[0].index : -1;
  }

  function agentModelProviders(models = []) {
    return [
      ...new Set(
        models
          .map((entry) => String(entry.provider || "").trim())
          .filter(Boolean)
      )
    ];
  }

  async function saveAgentModelLibrary(current, models) {
    const { publicAgentGatewayRegistry } = await loadAgentGatewayModule();
    await agentConfigRegistry.replaceFromModelLibraryAgents(models);
    const savedBase = await saveSettings(userDataPath, {
      ...current,
      modelLibraryAgents: models,
      modelLibraryEntries: agentModelProviders(models),
      modelLibraryAgentIds: models.map((model) => model.uid || model.instanceId || model.alias).filter(Boolean)
    });
    await agentConfigRegistry.refresh({ settingsFallback: savedBase });
    const saved = {
      ...savedBase,
      modelLibraryAgents: agentConfigRegistry.getModelLibraryAgents(),
      modelLibraryEntries: agentConfigRegistry.getModelLibraryEntries()
    };
    const redactedSettings = await loadAgentRuntimeSettings({ redactSecrets: true });
    await publishProtocolEvent(
      protocolEventBus,
      "settings.current",
      redactedSettings,
      { type: "settings.updated" }
    );
    return {
      saved,
      registry: publicAgentGatewayRegistry(saved)
    };
  }

  const controller = {
    async handleBootstrap({ response }) {
      sendJson(response, 200, {
        ...buildBootstrapPayload(getDiscoveryState()),
        expertVocabulary: await getExpertVocabularySummary(userDataPath),
        knowledgeGuidance: await getKnowledgeGuidanceSummary(userDataPath),
        resolvedAt: new Date().toISOString()
      });
    },
    async handleAuthSession({ request, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      sendJson(response, 200, consoleAuth.getSummary(request));
    },
    async handleAuthLogin({ request, requestBody, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      const payload = parseJsonBody(requestBody);
      const username = String(payload.username || "").trim().toLowerCase();
      const loginInputSummary = {
        usernameHash: username ? hashClientString(username, "console.auth.username") : "",
        usernameLength: username.length,
        host: String(request?.headers?.host || ""),
        origin: String(request?.headers?.origin || ""),
        remoteAddressHash: request?.socket?.remoteAddress
          ? hashClientString(request.socket.remoteAddress, "console.auth.remote")
          : "",
        userAgentHash: request?.headers?.["user-agent"]
          ? hashClientString(request.headers["user-agent"], "console.auth.user_agent")
          : ""
      };
      try {
        const login = await consoleAuth.login(payload, request);
        consoleAuth.audit({
          user: login.session?.user,
          operationId: "auth.login",
          action: "login",
          method: "POST",
          path: "/api/auth/login",
          status: "ok"
        });
        appendConsoleOperationLog({
          operationId: "auth.login.session",
          event: "console.auth.login.succeeded",
          authSession: login.session,
          status: "ok",
          input: loginInputSummary,
          output: {
            userId: login.session?.user?.userId || "",
            username: login.session?.user?.username || "",
            roleId: login.session?.user?.roleId || "",
            expiresAt: login.session?.expiresAt || ""
          }
        });
        sendJsonWithHeaders(
          response,
          200,
          {
            ok: true,
            session: login.session,
            csrfToken: login.csrfToken,
            roles: consoleAuth.roleList()
          },
          { "Set-Cookie": login.cookies }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "登录失败。";
        consoleAuth.audit({
          operationId: "auth.login",
          action: "login",
          method: "POST",
          path: "/api/auth/login",
          status: "failed",
          target: loginInputSummary,
          error: message
        });
        appendConsoleOperationLog({
          operationId: "auth.login.session",
          event: "console.auth.login.failed",
          status: "failed",
          input: loginInputSummary,
          error: message
        });
        sendJson(response, 401, {
          error: message
        });
      }
    },
    async handleAuthLogout({ request, authSession, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      const result = consoleAuth.logout(request);
      consoleAuth.audit({
        user: authSession?.user,
        operationId: "auth.logout",
        action: "logout",
        method: "POST",
        path: "/api/auth/logout",
        status: "ok"
      });
      appendConsoleOperationLog({
        operationId: "auth.logout.session",
        event: "console.auth.logout.succeeded",
        authSession,
        status: "ok",
        input: {
          userId: authSession?.user?.userId || "",
          username: authSession?.user?.username || "",
          roleId: authSession?.user?.roleId || ""
        }
      });
      sendJsonWithHeaders(response, 200, { ok: true }, { "Set-Cookie": result.cookies });
    },
    async handleAuthUsers({ requestBody, authSession, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      if (requestBody.length === 0) {
        sendJson(response, 200, { users: consoleAuth.listUsers(), roles: consoleAuth.roleList() });
        return;
      }
      sendJson(response, 405, {
        error: "用户创建和初始密码设置仅允许在服务端命令行执行。"
      });
    },
    async handleAuthUpdateUser({ userId, requestBody, authSession, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      try {
        const payload = parseJsonBody(requestBody);
        if (payload.password || payload.newPassword) {
          sendJson(response, 405, {
            error: "密码修改仅允许在服务端命令行执行。"
          });
          return;
        }
        const user = await consoleAuth.updateUser(userId, payload);
        if (!user) {
          sendJson(response, 404, { error: "用户不存在。" });
          return;
        }
        consoleAuth.audit({
          user: authSession?.user,
          operationId: "auth.users.update",
          action: "update-user",
          method: "POST",
          path: `/api/auth/users/${userId}`,
          status: "ok",
          target: { userId: user.userId, roleId: user.roleId, enabled: user.enabled }
        });
        sendJson(response, 200, { user, users: consoleAuth.listUsers() });
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "更新用户失败。"
        });
      }
    },
    async handleAuthRole({ roleId, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      const role = consoleAuth.roleList().find((item) => item.roleId === roleId);
      if (!role) {
        sendJson(response, 404, { error: "角色不存在。" });
        return;
      }
      sendJson(response, 200, { role });
    },
    async handleAuthOidc({ requestBody, authSession, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      if (requestBody.length === 0) {
        sendJson(response, 200, { oidc: consoleAuth.getOidcConfig() });
        return;
      }
      const oidc = consoleAuth.setOidcConfig(parseJsonBody(requestBody));
      consoleAuth.audit({
        user: authSession?.user,
        operationId: "auth.oidc",
        action: "set-oidc",
        method: "POST",
        path: "/api/auth/oidc",
        status: "ok",
        target: { enabled: oidc.enabled, issuer: oidc.issuer, clientId: oidc.clientId }
      });
      sendJson(response, 200, { oidc });
    },
    async handleAuthAudit({ url, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      if (operationAuditStore) {
        sendJson(response, 200, {
          items: operationAuditStore.list({
            limit: Number(url.searchParams.get("limit") || 100),
            operationId: url.searchParams.get("operationId") || "",
            userId: url.searchParams.get("userId") || "",
            status: url.searchParams.get("status") || ""
          })
        });
        return;
      }
      sendJson(response, 200, {
        items: consoleAuth.listAudit({
          limit: Number(url.searchParams.get("limit") || 100),
          userId: url.searchParams.get("userId") || "",
          status: url.searchParams.get("status") || ""
        })
      });
    },
    async handleAuthSessions({ response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      sendJson(response, 200, { sessions: consoleAuth.listSessions() });
    },
    async handleAuthRevokeSession({ sessionId, authSession, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      const result = consoleAuth.revokeSession(sessionId);
      consoleAuth.audit({
        user: authSession?.user,
        operationId: "auth.sessions.revoke",
        action: "revoke-session",
        method: "POST",
        path: `/api/auth/sessions/${sessionId}/revoke`,
        status: result.ok ? "ok" : "not_found",
        target: { sessionId }
      });
      sendJson(response, result.ok ? 200 : 404, result.ok ? result : { error: "会话不存在。" });
    },
    async handleListInterfaces({ response }) {
      const features = getFeatureEntries ? getFeatureEntries() : null;
      sendJson(response, 200, {
        transport: {
          http: "direct",
          rpc: "POST /api/rpc",
          events: "GET /api/events"
        },
        interfaces: getInterfaceCatalog(),
        features
      });
    },
    async handleSubscribeEvents({ request, url, response }) {
      if (!protocolEventBus || typeof protocolEventBus.subscribe !== "function") {
        sendJson(response, 503, {
          error: "事件总线不可用。"
        });
        return;
      }

      const {
        filterAgentSyncSubscriptionResult,
        filterRequestedSubscriptionTopics,
        loadAgentSyncConfig
      } = await loadAgentSyncPolicy();
      const agentSyncConfig = await loadAgentSyncConfig(userDataPath);
      const requestedTopics = parseTopicQuery(url);
      const topicFilter = filterRequestedSubscriptionTopics(agentSyncConfig, requestedTopics);
      if (topicFilter.denyAll) {
        const cursor = Number(url.searchParams.get("cursor") || 0);
        sendJson(response, 200, {
          cursor,
          nextCursor: cursor,
          topics: topicFilter.topics,
          requestedTopics: topicFilter.requested,
          events: [],
          snapshots: parseBooleanFlag(
            url.searchParams.get("includeSnapshot") || url.searchParams.get("snapshot") || ""
          )
            ? []
            : undefined
        });
        return;
      }

      const abortController = new AbortController();
      response.once?.("close", () => abortController.abort());
      const result = await protocolEventBus.subscribe({
        cursor: Number(url.searchParams.get("cursor") || 0),
        topics: topicFilter.topics,
        timeoutMs: Number(url.searchParams.get("timeoutMs") || url.searchParams.get("timeout") || 0),
        limit: Number(url.searchParams.get("limit") || 100),
        includeSnapshot: parseBooleanFlag(
          url.searchParams.get("includeSnapshot") || url.searchParams.get("snapshot") || ""
        ),
        signal: request?.aborted ? AbortSignal.abort() : abortController.signal
      });
      if (response.destroyed) {
        return;
      }
      sendJson(response, 200, {
        ...filterAgentSyncSubscriptionResult(agentSyncConfig, result),
        requestedTopics: topicFilter.requested
      });
    },
    async handleAgentSyncConfig({ requestBody, response }) {
      if (requestBody.length === 0) {
        const { loadAgentSyncConfig } = await loadAgentSyncPolicy();
        sendJson(response, 200, {
          config: await loadAgentSyncConfig(userDataPath)
        });
        return;
      }
      const { saveAgentSyncConfig } = await loadAgentSyncPolicy();
      const payload = parseJsonBody(requestBody);
      const saved = await saveAgentSyncConfig(userDataPath, payload.value || payload.config || payload);
      await publishProtocolEvent(
        protocolEventBus,
        "agent_sync.config",
        saved,
        { type: "agent_sync.config.updated" }
      );
      sendJson(response, 200, {
        config: saved
      });
    },
    async handleAgentSyncPublish({ request, requestBody, response }) {
      const authorization = await requireToolManagementScope({
        platform: getToolManagementPlatform(),
        request,
        response,
        scopes: ["agent_sync:publish"]
      });
      if (!authorization) {
        return;
      }
      const { publishAgentSyncEvent } = await loadAgentSyncPolicy();
      const result = await publishAgentSyncEvent({
        userDataPath,
        protocolEventBus,
        input: parseJsonBody(requestBody),
        grant: authorization.grant
      });
      if (!result.ok) {
        sendJson(response, result.status || 400, {
          error: result.error || "发布智能体同步事件失败。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleAgentSyncSubscribe({ request, url, response }) {
      if (!protocolEventBus || typeof protocolEventBus.subscribe !== "function") {
        sendJson(response, 503, {
          error: "事件总线不可用。"
        });
        return;
      }
      const {
        filterAgentSyncSubscriptionResult,
        filterRequestedSubscriptionTopics,
        loadAgentSyncConfig,
        normalizeAgentSyncTopic
      } = await loadAgentSyncPolicy();
      const config = await loadAgentSyncConfig(userDataPath);
      const requested = parseTopicQuery(url).map((topic) => normalizeAgentSyncTopic(topic));
      const topicFilter = filterRequestedSubscriptionTopics(config, requested);
      const cursor = Number(url.searchParams.get("cursor") || 0);
      const includeSnapshot = parseBooleanFlag(
        url.searchParams.get("includeSnapshot") || url.searchParams.get("snapshot") || ""
      );
      if (topicFilter.denyAll) {
        sendJson(response, 200, {
          cursor,
          nextCursor: cursor,
          topics: [],
          requestedTopics: topicFilter.requested,
          events: [],
          snapshots: includeSnapshot ? [] : undefined
        });
        return;
      }
      const abortController = new AbortController();
      response.once?.("close", () => abortController.abort());
      const result = await protocolEventBus.subscribe({
        cursor,
        topics: topicFilter.topics.length > 0
          ? topicFilter.topics
          : config.topics.filter((topic) => topic.enabled).map((topic) => topic.topic),
        timeoutMs: Number(url.searchParams.get("timeoutMs") || url.searchParams.get("timeout") || 0),
        limit: Number(url.searchParams.get("limit") || 100),
        includeSnapshot,
        signal: request?.aborted ? AbortSignal.abort() : undefined
      });
      if (response.destroyed) {
        return;
      }
      sendJson(response, 200, {
        ...filterAgentSyncSubscriptionResult(config, result),
        requestedTopics: topicFilter.requested
      });
    },
    async handleDiscoveryCheckIn({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const discoveryState = getDiscoveryState();
      const clientId = serverToken(
        "client",
        payload.clientId || payload.hostname || payload.currentServiceUrl || "anonymous"
      );
      const record = metadataStore.recordClientCheckIn({
        clientId,
        clientLabel: hashClientString(payload.clientLabel || payload.hostname || clientId, "client.label"),
        appVersion: clientVersionString(payload.appVersion || ""),
        platform: hashClientString(payload.platform || "", "client.platform"),
        hostname: hashClientString(payload.hostname || "", "client.hostname"),
        bootstrapUrl: "",
        currentServiceUrl: hashClientString(payload.currentServiceUrl || "", "service.url"),
        desiredServiceUrl:
          hashClientString(discoveryState.activeServiceUrl || "", "service.url"),
        currentJobServiceUrl: payload.currentJobServiceUrl
          ? hashClientString(payload.currentJobServiceUrl || "", "service.url")
          : "",
        configVersion: clientVersionString(payload.configVersion || ""),
        busy: Boolean(payload.busy),
        lastJobId: hashClientString(payload.lastJobId || "", "client.last_job_id"),
        lastError: hashClientString(payload.lastError || "", "client.last_error"),
        serverId: discoveryState.serverId,
        offlineAfterSeconds: discoveryState.offlineAfterSeconds
      });
      await publishProtocolEvent(
        protocolEventBus,
        "discovery.clients",
        {
          client: record,
          serverId: discoveryState.serverId
        },
        { type: "discovery.client.checked_in" }
      );
      sendJson(response, 200, {
        ok: true,
        client: record,
        bootstrap: {
          ...buildBootstrapPayload(discoveryState),
          expertVocabulary: await getExpertVocabularySummary(userDataPath),
          knowledgeGuidance: await getKnowledgeGuidanceSummary(userDataPath)
        }
      });
    },
    async handleListDiscoveryClients({ response }) {
      sendJson(
        response,
        200,
        buildClientConnectionList(
          metadataStore.listClientRegistrations({
            offlineAfterSeconds: getDiscoveryState().offlineAfterSeconds
          }),
          getToolManagementPlatform()
        )
      );
    },
    async handleRequestClientMigration({ clientId, requestBody, response, authSession }) {
      const payload = parseJsonBody(requestBody);
      const targetClientId = String(clientId || payload.clientId || "").trim();
      if (!targetClientId) {
        sendJson(response, 400, {
          error: "缺少客户端 ID。"
        });
        return;
      }

      const discoveryState = getDiscoveryState();
      const clients = metadataStore.listClientRegistrations({
        offlineAfterSeconds: discoveryState.offlineAfterSeconds
      });
      const client = clients.items.find((item) => item.clientId === targetClientId);
      if (!client) {
        sendJson(response, 404, {
          error: "未找到目标客户端。"
        });
        return;
      }

      const command = {
        schemaVersion: 1,
        command: "migrate_to_active_service",
        clientId: targetClientId,
        desiredServiceUrl: discoveryState.activeServiceUrl || "",
        configVersion: discoveryState.configVersion || "",
        serverId: discoveryState.serverId || "",
        requestedAt: new Date().toISOString(),
        reason: String(payload.reason || "console").trim() || "console",
        requestedBy: authSession?.user?.username || "console"
      };
      const event = await publishProtocolEvent(
        protocolEventBus,
        `discovery.client.migration.${targetClientId}`,
        {
          client,
          command
        },
        {
          type: "discovery.client.migration.requested",
          publisher: "console",
          retain: true
        }
      );
      await publishProtocolEvent(
        protocolEventBus,
        "discovery.client.migration",
        {
          clientId: targetClientId,
          command
        },
        {
          type: "discovery.client.migration.requested",
          publisher: "console",
          retain: true
        }
      );
      sendJson(response, 200, {
        ok: true,
        client,
        command,
        event
      });
    },
    async handleGetDiscoveryConfig({ response }) {
      const discoveryState = getDiscoveryState();
      sendJson(response, 200, {
        path: getDiscoveryConfigPath(userDataPath),
        value: discoveryState,
        bootstrap: buildBootstrapPayload(discoveryState)
      });
    },
    async handleSetDiscoveryConfig({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const value = payload?.value || payload;
      if (
        hasClientSuppliedString(value, [
          "bootstrapBaseUrl",
          "advertisedBaseUrl",
          "activeServiceUrl",
          "forwardBaseUrl",
          "serverId",
          "serverLabel",
          "configVersion"
        ])
      ) {
        sendJson(response, 400, {
          error: "discovery 配置不接受客户端传入的 URL、服务标识或标签字符串。"
        });
        return;
      }
      const discoveryState = await saveDiscoveryConfig(userDataPath, stripClientDiscoveryStrings(value), {
        listenUrl: getListenUrl(),
        serverLabel
      });
      setDiscoveryState(discoveryState);
      await publishProtocolEvent(
        protocolEventBus,
        "discovery.config",
        {
          value: discoveryState,
          bootstrap: buildBootstrapPayload(discoveryState)
        },
        { type: "discovery.config.updated" }
      );
      sendJson(response, 200, {
        path: getDiscoveryConfigPath(userDataPath),
        value: discoveryState,
        bootstrap: buildBootstrapPayload(discoveryState)
      });
    },
    async handleGetRuntimeInfo({ response }) {
      sendJson(
        response,
        200,
        await buildRuntimeInfo({
          userDataPath,
          distPath,
          runtime,
          discoveryState: getDiscoveryState(),
          metadataStore,
          serverUrl: getListenUrl(),
          consoleAuth,
          features: getFeatureEntries ? getFeatureEntries() : null
        })
      );
    },
    async handleBrowseServerPath({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const mode = normalizePathBrowserMode(payload.mode);
      sendJson(
        response,
        200,
        await browseServerPath({
          requestedPath: payload.path || payload.currentPath || "",
          mode,
          extensions: normalizePathBrowserExtensions(payload.extensions),
          includeHidden: Boolean(payload.includeHidden),
          userDataPath,
          distPath
        })
      );
    },
    async handleGetMounts({ response }) {
      const settings = await loadSettings(userDataPath, { redactSecrets: true });
      const savedConfig = await loadMountConfig(userDataPath);
      sendJson(response, 200, {
        path: getMountConfigPath(userDataPath),
        paths: getMountConfigPaths(userDataPath),
        value: savedConfig,
        runtime: {
          mountGeneration: runtime.mountGeneration || 0,
          mountModules: runtime.runtimeOptions.mountModules,
          mountRouting: runtime.runtimeOptions.mountRouting,
          mounts: Object.entries(runtime.mounts || {}).map(([name, mount]) => ({
            name,
            id: mount?.id || "",
            kind: mount?.kind || name,
            enabled: mount?.enabled !== false,
            reason: mount?.reason || ""
          }))
        },
        analysisModules: await buildRuntimeInfo({
          userDataPath,
          distPath,
          runtime,
          discoveryState: getDiscoveryState(),
          metadataStore,
          serverUrl: getListenUrl(),
          consoleAuth,
          features: getFeatureEntries ? getFeatureEntries() : null
        }).then((info) => info.runtime.analysisModules),
        currentAnalysisModuleId: settings.analysisModuleId
      });
    },
    async handleSetMounts({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const value = payload?.value || payload;
      const currentSavedConfig = await loadMountConfig(userDataPath);
      const incomingMountModules =
        value?.mountModules && typeof value.mountModules === "object" && !Array.isArray(value.mountModules)
          ? value.mountModules
          : {};
      const nextMountModules = {
        ...(runtime.runtimeOptions.mountModules || {}),
        ...incomingMountModules
      };
      const nextMountRouting = {
        ...mergeMountRouting(runtime.runtimeOptions.mountRouting || {}, (value && value.mountRouting) || {})
      };
      const candidateConfig = {
        mountModules: nextMountModules,
        mountRouting: nextMountRouting
      };
      const settings = await loadSettings(userDataPath);
      try {
        await runtime.applyMountConfig(candidateConfig, { settings });
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "挂载配置不可用。",
          value: currentSavedConfig,
          runtime: {
            mountGeneration: runtime.mountGeneration || 0,
            mountModules: runtime.runtimeOptions.mountModules,
            mountRouting: runtime.runtimeOptions.mountRouting
          }
        });
        return;
      }
      let savedConfig;
      try {
        savedConfig = await saveMountConfig(userDataPath, candidateConfig);
      } catch (error) {
        await runtime.applyMountConfig(currentSavedConfig, { settings }).catch(() => {});
        sendJson(response, 500, {
          ok: false,
          error: error instanceof Error ? error.message : "挂载配置持久化失败，运行态已回滚。",
          value: currentSavedConfig,
          runtime: {
            mountGeneration: runtime.mountGeneration || 0,
            mountModules: runtime.runtimeOptions.mountModules,
            mountRouting: runtime.runtimeOptions.mountRouting
          }
        });
        return;
      }
      const result = {
        path: getMountConfigPath(userDataPath),
        paths: getMountConfigPaths(userDataPath),
        value: savedConfig,
        runtime: {
          mountGeneration: runtime.mountGeneration || 0,
          mountModules: runtime.runtimeOptions.mountModules,
          mountRouting: runtime.runtimeOptions.mountRouting
        }
      };
      await publishProtocolEvent(
        protocolEventBus,
        "runtime.mounts",
        result,
        { type: "runtime.mounts.updated" }
      );
      sendJson(response, 200, {
        ...result
      });
    },
    async handleReloadMounts({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const settings = payload?.settings
        ? await saveSettings(userDataPath, payload.settings, { redactSecrets: false })
        : await loadSettings(userDataPath);
      const savedConfig = await loadMountConfig(userDataPath);
      try {
        await runtime.applyMountConfig(savedConfig, { settings });
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "挂载配置不可用。",
          value: savedConfig,
          mountGeneration: runtime.mountGeneration || 0,
          mountModules: runtime.runtimeOptions.mountModules,
          mountRouting: runtime.runtimeOptions.mountRouting,
          runtime: {
            mountGeneration: runtime.mountGeneration || 0,
            mountModules: runtime.runtimeOptions.mountModules,
            mountRouting: runtime.runtimeOptions.mountRouting
          }
        });
        return;
      }
      const result = {
        ok: true,
        path: getMountConfigPath(userDataPath),
        paths: getMountConfigPaths(userDataPath),
        value: savedConfig,
        mountGeneration: runtime.mountGeneration || 0,
        mountModules: runtime.runtimeOptions.mountModules,
        mountRouting: runtime.runtimeOptions.mountRouting,
        runtime: {
          mountGeneration: runtime.mountGeneration || 0,
          mountModules: runtime.runtimeOptions.mountModules,
          mountRouting: runtime.runtimeOptions.mountRouting
        }
      };
      await publishProtocolEvent(
        protocolEventBus,
        "runtime.mounts",
        result,
        { type: "runtime.mounts.reloaded" }
      );
      sendJson(response, 200, result);
    },
    async handleGetConsoleState({ response }) {
      sendJson(
        response,
        200,
        await buildConsoleState({
          userDataPath,
          distPath,
          runtime,
          discoveryState: getDiscoveryState(),
          jobManager,
          metadataStore,
          serverUrl: getListenUrl(),
          consoleAuth,
          maintenanceAgent,
          clientRuntimeAllocator,
          features: getFeatureEntries ? getFeatureEntries() : null,
          toolManagementPlatform: getToolManagementPlatform()
        })
      );
    },
    async handleMaintenanceAgentConfig({ requestBody, authSession, response }) {
      if (!requireMaintenanceAgent(response)) {
        return;
      }
      try {
        if (requestBody.length === 0) {
          sendJson(response, 200, await maintenanceAgent.getConfig());
          return;
        }
        const payload = parseJsonBody(requestBody);
        sendJson(
          response,
          200,
          await maintenanceAgent.setConfig(payload?.config || payload?.value || payload, {
            authSession
          })
        );
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "维护智能体配置保存失败。"
        });
      }
    },
    async handleMaintenanceAgentChat({ requestBody, authSession, response }) {
      if (!requireMaintenanceAgent(response)) {
        return;
      }
      try {
        sendJson(
          response,
          200,
          await maintenanceAgent.chat(parseJsonBody(requestBody), { authSession })
        );
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "维护智能体对话失败。"
        });
      }
    },
    async handleMaintenanceAgentRuns({ requestBody, url, authSession, response }) {
      if (!requireMaintenanceAgent(response)) {
        return;
      }
      try {
        if (requestBody.length === 0) {
          sendJson(
            response,
            200,
            await maintenanceAgent.listRuns({
              limit: Number(url.searchParams.get("limit") || 50)
            })
          );
          return;
        }
        sendJson(
          response,
          200,
          await maintenanceAgent.startRun(parseJsonBody(requestBody), { authSession })
        );
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "维护智能体运行创建失败。"
        });
      }
    },
    async handleMaintenanceAgentRun({ runId, response }) {
      if (!requireMaintenanceAgent(response)) {
        return;
      }
      const run = await maintenanceAgent.getRun(runId);
      if (!run) {
        sendJson(response, 404, {
          error: "维护运行不存在。"
        });
        return;
      }
      sendJson(response, 200, { run });
    },
    async handleMaintenanceAgentApprove({ runId, requestBody, authSession, response }) {
      if (!requireMaintenanceAgent(response)) {
        return;
      }
      try {
        const run = await maintenanceAgent.approveRun(runId, parseJsonBody(requestBody), {
          authSession
        });
        if (!run) {
          sendJson(response, 404, {
            error: "维护运行不存在。"
          });
          return;
        }
        sendJson(response, 200, { run });
      } catch (error) {
        sendJson(response, 409, {
          error: error instanceof Error ? error.message : "维护运行审批失败。"
        });
      }
    },
    async handleMaintenanceAgentCancel({ runId, requestBody, authSession, response }) {
      if (!requireMaintenanceAgent(response)) {
        return;
      }
      try {
        const run = await maintenanceAgent.cancelRun(runId, parseJsonBody(requestBody), {
          authSession
        });
        if (!run) {
          sendJson(response, 404, {
            error: "维护运行不存在。"
          });
          return;
        }
        sendJson(response, 200, { run });
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "维护运行取消失败。"
        });
      }
    },
    async handleGetSettings({ response }) {
      const settings = await loadAgentRuntimeSettings({ redactSecrets: true });
      sendJson(response, 200, settings);
    },
    async handleSetSettings({ requestBody, authSession, response }) {
      const settings = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const shouldAuditModelLibrary =
        Object.hasOwn(settings, "modelLibraryAgents") ||
        Object.hasOwn(settings, "modelLibraryEntries");
      const explicitModelLibraryEntries = Object.hasOwn(settings, "modelLibraryEntries")
        ? new Set(
            (Array.isArray(settings.modelLibraryEntries) ? settings.modelLibraryEntries : [])
              .map((entry) => String(entry || "").trim())
              .filter(Boolean)
          )
        : null;
      const incomingModelLibraryAgents =
        Array.isArray(settings.modelLibraryAgents) && explicitModelLibraryEntries
          ? settings.modelLibraryAgents.filter((agent) =>
              explicitModelLibraryEntries.has(String(agent?.provider || "").trim())
            )
          : settings.modelLibraryAgents;
      const beforeSettings = shouldAuditModelLibrary ? await loadAgentRuntimeSettings({ redactSecrets: true }) : null;
      const beforeModelLibrarySummary = shouldAuditModelLibrary
        ? normalizeModelLibraryAuditList(
          (beforeSettings?.modelLibraryAgents || []).concat()
        )
        : null;
      if (Array.isArray(incomingModelLibraryAgents)) {
        await agentConfigRegistry.replaceFromModelLibraryAgents(incomingModelLibraryAgents);
      }
      const modelLibraryAgents = Array.isArray(incomingModelLibraryAgents)
        ? incomingModelLibraryAgents
        : agentConfigRegistry.getModelLibraryAgents();
      const settingsToSave = { ...settings };
      if (shouldAuditModelLibrary) {
        settingsToSave.modelLibraryAgents = modelLibraryAgents;
        settingsToSave.modelLibraryEntries = agentConfigRegistry.getModelLibraryEntries();
        settingsToSave.modelLibraryAgentIds = agentConfigRegistry.getModelLibraryAgents().map((agent) => agent.uid).filter(Boolean);
      }
      const saved = await saveSettings(userDataPath, settingsToSave, {
        redactSecrets: false
      });
      await agentConfigRegistry.refresh({ settingsFallback: saved });
      const runtimeSettings = shouldAuditModelLibrary
        ? {
            ...saved,
            modelLibraryAgents: agentConfigRegistry.getModelLibraryAgents(),
            modelLibraryEntries: agentConfigRegistry.getModelLibraryEntries()
          }
        : saved;
      await runtime.refreshMounts({ settings: runtimeSettings });
      const redactedSettings = await loadAgentRuntimeSettings({ redactSecrets: true });
      await publishProtocolEvent(
        protocolEventBus,
        "settings.current",
        redactedSettings,
        { type: "settings.updated" }
      );
      if (shouldAuditModelLibrary) {
        const afterModelLibrarySummary = normalizeModelLibraryAuditList(modelLibraryAgents);
        const modelLibraryDiff = diffModelLibraryAgents(
          (beforeModelLibrarySummary?.items || []),
          afterModelLibrarySummary.items || []
        );
        appendConsoleOperationLog({
          operationId: "settings.model_library.save",
          event: "console.settings.model_library.saved",
          authSession,
          status: "ok",
          input: {
            actor: {
              userId: authSession?.user?.userId || "",
              username: authSession?.user?.username || ""
            },
            path: "/api/settings",
            method: "POST",
            settingsModelLibrary: {
              before: beforeModelLibrarySummary || normalizeModelLibraryAuditList([]),
              after: afterModelLibrarySummary,
              diff: modelLibraryDiff
            }
          },
          output: {
            operation: "settings.set",
            modelLibrarySaved: true,
            savedCount: afterModelLibrarySummary.total,
            addedCount: modelLibraryDiff.added.length,
            removedCount: modelLibraryDiff.removed.length,
            changedCount: modelLibraryDiff.changed.length
          },
          actor: authSession
        });
      }
      sendJson(response, 200, redactedSettings);
    },
    async handleProbeModel({ requestBody, authSession, response }) {
      const payload = parseJsonBody(requestBody);
      const provider = String(payload.provider || payload.modelProvider || "").trim();
      const modelAlias = String(
        payload.modelAlias || payload.agentAlias || payload.agentId || payload.uid || ""
      ).trim();
      const startedAt = Date.now();
      let result;
      let status = "ok";
      let message = "";
      try {
        const current = await loadAgentRuntimeSettings();
        const candidateSettings = mergeSettingsForModelProbe(
          current,
          payload.settings || payload.value || {},
          provider,
          { modelAlias }
        );
        result = await (await loadModelProbeModule()).probeModelConnection({
          provider,
          settings: candidateSettings,
          modelAlias,
          userDataPath
        });
      } catch (error) {
        status = "failed";
        message = error instanceof Error ? error.message : "模型探测失败。";
        result = {
          ok: false,
          configured: false,
          provider,
          model: modelAlias,
          statusCode: 0,
          latencyMs: 0,
          checkedAt: new Date().toISOString(),
          message
        };
      }
      appendConsoleOperationLog({
        operationId: "settings.model_library.probe",
        event: "console.settings.model_library.probe",
        authSession,
        status,
        input: {
          actor: {
            userId: authSession?.user?.userId || "",
            username: authSession?.user?.username || ""
          },
          method: "POST",
          path: "/api/settings/model-probe",
          provider,
          modelAlias,
          modelLibraryModelCount: normalizeModelLibraryAuditList((
            payload.settings?.modelLibraryAgents || []
          )).total
        },
        output: {
          provider,
          modelAlias,
          ok: Boolean(result?.ok),
          configured: Boolean(result?.configured),
          latencyMs: Number(result?.latencyMs || 0),
          statusCode: Number(result?.statusCode || 0),
          message: result?.message || message || "",
          checkedAt: result?.checkedAt || new Date().toISOString()
        },
        durationMs: Date.now() - startedAt,
        actor: authSession
      });
      sendJson(response, 200, result);
    },
    async handleAgentGatewayConfig({ requestBody, response }) {
      const { publicAgentGatewayConfig } = await loadAgentGatewayModule();
      const method = requestBody.length > 0 ? "POST" : "GET";
      if (method === "GET") {
        const settings = await loadAgentRuntimeSettings();
        sendJson(response, 200, {
          config: publicAgentGatewayConfig(settings)
        });
        return;
      }

      const payload = parseJsonBody(requestBody);
      const current = await loadAgentRuntimeSettings();
      const adapterPatch = payload.value || payload.config || payload;
      const nextAdapter = {
        ...(current.customHttpAdapter || {}),
        ...adapterPatch
      };
      const saved = await saveSettings(userDataPath, {
        ...current,
        modelLibraryEntries: [
          ...new Set([...(current.modelLibraryEntries || []), "custom-http"])
        ],
        customModelAlias:
          adapterPatch.alias || adapterPatch.modelAlias || current.customModelAlias,
        customHttpAdapter: nextAdapter
      });
      const redactedSettings = await loadAgentRuntimeSettings({ redactSecrets: true });
      await publishProtocolEvent(
        protocolEventBus,
        "settings.current",
        redactedSettings,
        { type: "settings.updated" }
      );
      sendJson(response, 200, {
        config: publicAgentGatewayConfig({
          ...saved,
          modelLibraryAgents: agentConfigRegistry.getModelLibraryAgents(),
          modelLibraryEntries: agentConfigRegistry.getModelLibraryEntries()
        })
      });
    },
    async handleAgentGatewayCall({ requestBody, response, authSession }) {
      const { callAgentGateway } = await loadAgentGatewayModule();
      const input = parseJsonBody(requestBody);
      const workspaceApplied = applyWorkspaceRuntimeContext(
        input,
        agentWorkspace,
        workspaceAccessOptions(authSession)
      );
      if (workspaceApplied.workspaceError) {
        sendJson(response, workspaceApplied.workspaceError.status, {
          error: workspaceApplied.workspaceError.error
        });
        return;
      }
      const settings = await loadAgentRuntimeSettings();
      const result = await callAgentGateway({
        settings,
        input: workspaceApplied.input,
        userDataPath,
        contextRuntime,
        contextCompactionSource: "api.agent_gateway.call",
        clientRuntimeAllocator
      });
      sendJson(
        response,
        200,
        workspaceApplied.workspaceContext
          ? {
              ...result,
              workspaceContext: workspaceApplied.workspaceContext
            }
          : result
      );
    },
    async handleAgentRegistry({ response }) {
      const { publicAgentGatewayRegistry } = await loadAgentGatewayModule();
      const settings = await loadAgentRuntimeSettings();
      sendJson(response, 200, publicAgentGatewayRegistry(settings));
    },
    async handleModelRoutingHealth({ url, response }) {
      const { inspectAgentModelRouting } = await loadAgentGatewayModule();
      sendJson(response, 200, await inspectAgentModelRouting({
        userDataPath,
        limit: Number(url.searchParams.get("limit") || 50)
      }));
    },
    async handleCapabilityPackagePlan({ requestBody, response }) {
      const registry = createCapabilityPackageRegistry({ userDataPath });
      const payload = parseJsonBody(requestBody);
      sendJson(response, 200, await registry.plan(payload.manifest || payload));
    },
    async handleCapabilityPackages({ requestBody, response, authSession }) {
      const registry = createCapabilityPackageRegistry({ userDataPath });
      if (requestBody.length === 0) {
        sendJson(response, 200, await registry.describe());
        return;
      }
      try {
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await registry.submit(payload.manifest || payload, {
          submittedBy: authSession?.user?.username || authSession?.userId || "console"
        }));
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "能力包提交失败。",
          details: error?.details || []
        });
      }
    },
    async handleCapabilityPackageLifecycle({ packageId, requestBody, response, authSession }) {
      const registry = createCapabilityPackageRegistry({ userDataPath });
      try {
        const payload = parseJsonBody(requestBody);
        const action = String(payload.action || "").trim();
        if (action === "rollback") {
          sendJson(response, 200, await registry.rollback({
            kind: payload.kind,
            name: payload.name,
            actor: authSession?.user?.username || authSession?.userId || payload.actor || "console",
            reason: payload.reason || ""
          }));
          return;
        }
        sendJson(response, 200, await registry.lifecycle(packageId, {
          ...payload,
          actor: authSession?.user?.username || authSession?.userId || payload.actor || "console"
        }));
      } catch (error) {
        sendJson(response, 409, {
          error: error instanceof Error ? error.message : "能力包生命周期操作失败。"
        });
      }
    },
    async handleCreateAgent({ requestBody, authSession, response }) {
      const startedAt = Date.now();
      const patch = normalizeAgentModelPayload(parseJsonBody(requestBody));
      const provider = patch.provider || "deepseek";
      const model = patch.model || patch.engine || "";
      const current = await loadAgentRuntimeSettings();
      const fallbackLabel = `${provider} ${model}`.trim();
      const entry = {
        provider,
        ...patch,
        uid: patch.uid || createAgentUid({ ...patch, provider, model }),
        label: Object.hasOwn(patch, "label") ? patch.label : fallbackLabel,
        agentName: Object.hasOwn(patch, "agentName")
          ? patch.agentName
          : (Object.hasOwn(patch, "label") ? patch.label : fallbackLabel),
        model,
        engine: Object.hasOwn(patch, "engine") ? patch.engine : model
      };
      const models = [entry, ...(current.modelLibraryAgents || [])];
      try {
        const { registry } = await saveAgentModelLibrary(current, models);
        const agent = registry.agents.find((item) => item.alias === entry.uid) || null;
        appendConsoleOperationLog({
          operationId: "settings.model_library.create",
          event: "console.settings.model_library.created",
          authSession,
          status: "ok",
          risk: "content_write",
          input: {
            actor: {
              userId: authSession?.user?.userId || "",
              username: authSession?.user?.username || ""
            },
            method: "POST",
            path: "/api/agents",
            agent: {
              uid: entry.uid,
              provider: entry.provider,
              model: entry.model,
              baseUrl: entry.baseUrl || entry.url || "",
              label: entry.label || entry.agentName || ""
            }
          },
          output: {
            ok: true,
            action: "created",
            agentId: entry.uid,
            registryVersion: registry.version || null,
            savedCount: registry.agents?.length || 0
          },
          durationMs: Date.now() - startedAt,
          actor: authSession
        });
        sendJson(response, 200, {
          ok: true,
          action: "created",
          agentId: entry.uid,
          agent,
          registry
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "创建智能体模型配置失败。";
        appendConsoleOperationLog({
          operationId: "settings.model_library.create",
          event: "console.settings.model_library.create_failed",
          authSession,
          status: "failed",
          risk: "content_write",
          input: {
            actor: {
              userId: authSession?.user?.userId || "",
              username: authSession?.user?.username || ""
            },
            method: "POST",
            path: "/api/agents",
            agent: {
              provider,
              model,
              label: entry.label || entry.agentName || ""
            }
          },
          error: message,
          durationMs: Date.now() - startedAt,
          actor: authSession
        });
        sendJson(response, 500, { error: message });
      }
    },
    async handleUpdateAgent({ agentId, requestBody, authSession, response }) {
      const startedAt = Date.now();
      const patch = normalizeAgentModelPayload(parseJsonBody(requestBody));
      const current = await loadAgentRuntimeSettings();
      const models = [...(current.modelLibraryAgents || [])];
      const index = findAgentModelIndex(models, agentId);
      if (index < 0) {
        const message = "智能体模型配置不存在。";
        appendConsoleOperationLog({
          operationId: "settings.model_library.update",
          event: "console.settings.model_library.update_failed",
          authSession,
          status: "failed",
          risk: "content_write",
          input: {
            actor: {
              userId: authSession?.user?.userId || "",
              username: authSession?.user?.username || ""
            },
            method: "POST",
            path: `/api/agents/${String(agentId || "")}`,
            agentId: String(agentId || "")
          },
          error: message,
          output: { notFound: true },
          durationMs: Date.now() - startedAt,
          actor: authSession
        });
        sendJson(response, 404, { error: message });
        return;
      }
      const previous = models[index];
      const next = {
        ...previous,
        ...patch,
        uid: previous.uid || previous.instanceId || previous.alias || String(agentId || ""),
        instanceId: previous.instanceId || previous.uid || previous.alias || String(agentId || ""),
        alias: previous.alias || previous.uid || previous.instanceId || String(agentId || "")
      };
      if (Object.hasOwn(patch, "label") && !Object.hasOwn(patch, "agentName")) {
        next.agentName = patch.label;
      }
      if (Object.hasOwn(patch, "model") && !Object.hasOwn(patch, "engine")) {
        next.engine = patch.model;
      }
      models[index] = next;
      try {
        const { registry } = await saveAgentModelLibrary(current, models);
        const agent = registry.agents.find((item) => item.alias === next.uid) || null;
        appendConsoleOperationLog({
          operationId: "settings.model_library.update",
          event: "console.settings.model_library.updated",
          authSession,
          status: "ok",
          risk: "content_write",
          input: {
            actor: {
              userId: authSession?.user?.userId || "",
              username: authSession?.user?.username || ""
            },
            method: "POST",
            path: `/api/agents/${String(agentId || "")}`,
            previous: normalizeModelLibraryAgentAuditAgent(previous),
            patch: sanitizeAgentPatchForLog(patch),
            next: {
              uid: next.uid,
              provider: next.provider,
              model: next.model || next.engine,
              modelAlias: next.agentName || next.label || "",
              baseUrl: next.baseUrl || next.url || ""
            }
          },
          output: {
            ok: true,
            action: "updated",
            agentId: next.uid,
            registryVersion: registry.version || null,
            savedCount: registry.agents?.length || 0
          },
          durationMs: Date.now() - startedAt,
          actor: authSession
        });
        sendJson(response, 200, {
          ok: true,
          action: "updated",
          agentId: next.uid,
          agent,
          registry
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "更新智能体模型配置失败。";
        appendConsoleOperationLog({
          operationId: "settings.model_library.update",
          event: "console.settings.model_library.update_failed",
          authSession,
          status: "failed",
          risk: "content_write",
          input: {
            actor: {
              userId: authSession?.user?.userId || "",
              username: authSession?.user?.username || ""
            },
            method: "POST",
            path: `/api/agents/${String(agentId || "")}`,
            patch: sanitizeAgentPatchForLog(patch),
            agentId: next.uid
          },
          output: {
            ok: false,
            action: "updated",
            agentId: next.uid
          },
          error: message,
          durationMs: Date.now() - startedAt,
          actor: authSession
        });
        sendJson(response, 500, { error: message });
      }
    },
    async handleDeleteAgent({ agentId, authSession, response }) {
      const startedAt = Date.now();
      const current = await loadAgentRuntimeSettings();
      const models = [...(current.modelLibraryAgents || [])];
      const index = findAgentModelIndex(models, agentId);
      const normalizedAgentId = String(agentId || "").trim();
      if (index < 0) {
        const message = "智能体模型配置不存在。";
        appendConsoleOperationLog({
          operationId: "settings.model_library.delete",
          event: "console.settings.model_library.delete_failed",
          authSession,
          status: "failed",
          risk: "content_write",
          input: {
            actor: {
              userId: authSession?.user?.userId || "",
              username: authSession?.user?.username || ""
            },
            method: "DELETE",
            path: `/api/agents/${normalizedAgentId}`,
            agentId: normalizedAgentId
          },
          error: message,
          output: { notFound: true },
          durationMs: Date.now() - startedAt,
          actor: authSession
        });
        sendJson(response, 404, { error: message });
        return;
      }
      const [removed] = models.splice(index, 1);
      try {
        const { registry } = await saveAgentModelLibrary(current, models);
        appendConsoleOperationLog({
          operationId: "settings.model_library.delete",
          event: "console.settings.model_library.deleted",
          authSession,
          status: "ok",
          risk: "content_write",
          input: {
            actor: {
              userId: authSession?.user?.userId || "",
              username: authSession?.user?.username || ""
            },
            method: "DELETE",
            path: `/api/agents/${normalizedAgentId}`,
            agent: normalizeModelLibraryAgentAuditAgent(removed)
          },
          output: {
            ok: true,
            action: "deleted",
            agentId: removed.uid || removed.instanceId || removed.alias || normalizedAgentId,
            registryVersion: registry.version || null,
            savedCount: registry.agents?.length || 0
          },
          durationMs: Date.now() - startedAt,
          actor: authSession
        });
        sendJson(response, 200, {
          ok: true,
          action: "deleted",
          agentId: removed.uid || removed.instanceId || removed.alias || String(agentId || ""),
          registry
        });
      } catch (error) {
        const removedAgentId = removed.uid || removed.instanceId || removed.alias || normalizedAgentId;
        const message = error instanceof Error ? error.message : "删除智能体模型配置失败。";
        appendConsoleOperationLog({
          operationId: "settings.model_library.delete",
          event: "console.settings.model_library.delete_failed",
          authSession,
          status: "failed",
          risk: "content_write",
          input: {
            actor: {
              userId: authSession?.user?.userId || "",
              username: authSession?.user?.username || ""
            },
            method: "DELETE",
            path: `/api/agents/${normalizedAgentId}`,
            agentId: removedAgentId
          },
          output: {
            ok: false,
            action: "deleted",
            agentId: removedAgentId
          },
          error: message,
          durationMs: Date.now() - startedAt,
          actor: authSession
        });
        sendJson(response, 500, { error: message });
      }
    },
    async handleGetCodexOAuthStatus({ response }) {
      sendJson(response, 200, await getCodexOAuthStatus());
    },
    async handleStartCodexOAuthLogin({ response }) {
      sendJson(response, 200, await startCodexDeviceLogin());
    },
    async handleCodexOAuthReturn({ response }) {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });
      response.end(`<!doctype html>
<html lang="zh-CN" translate="no" class="notranslate">
  <head><meta charset="utf-8"><meta name="google" content="notranslate"><title>Codex OAuth 验证</title></head>
  <body translate="no" class="notranslate">
    <p>Codex OAuth 验证已返回。可以关闭此页，Pact 控制台会自动刷新状态。</p>
    <script>setTimeout(() => window.close(), 800);</script>
  </body>
</html>`);
    },
    async handleGetRules({ response }) {
      const rules = await loadEmailRules(userDataPath);
      sendJson(response, 200, {
        path: getEmailRulesPath(userDataPath),
        rules
      });
    },
    async handleSetRules({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const saved = await saveEmailRules(userDataPath, payload?.rules || payload);
      await publishProtocolEvent(
        protocolEventBus,
        "email_rules.current",
        {
          path: getEmailRulesPath(userDataPath),
          rules: saved
        },
        { type: "email_rules.updated" }
      );
      sendJson(response, 200, {
        path: getEmailRulesPath(userDataPath),
        rules: saved
      });
    },
    async handleGetExpertVocabulary({ response }) {
      const vocabulary = await loadExpertVocabulary(userDataPath);
      sendJson(response, 200, {
        path: getExpertVocabularyPath(userDataPath),
        vocabulary
      });
    },
    async handleSetExpertVocabulary({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const saved = await saveExpertVocabulary(userDataPath, payload?.vocabulary || payload);
      await publishProtocolEvent(
        protocolEventBus,
        "expert_vocabulary.current",
        {
          path: getExpertVocabularyPath(userDataPath),
          vocabulary: saved
        },
        { type: "expert_vocabulary.updated" }
      );
      sendJson(response, 200, {
        path: getExpertVocabularyPath(userDataPath),
        vocabulary: saved
      });
    },
    async handleListExpertVocabularyVersions({ response }) {
      sendJson(response, 200, await listExpertVocabularyVersions(userDataPath));
    },
    async handleGetKnowledgeTaxonomy({ response }) {
      const taxonomy = await loadKnowledgeTaxonomy(userDataPath);
      sendJson(response, 200, {
        path: getKnowledgeTaxonomyPath(userDataPath),
        taxonomy,
        guidance: await getKnowledgeGuidanceSummary(userDataPath)
      });
    },
    async handleSetKnowledgeTaxonomy({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const saved = await saveKnowledgeTaxonomy(userDataPath, payload?.taxonomy || payload);
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge_taxonomy.current",
        {
          path: getKnowledgeTaxonomyPath(userDataPath),
          taxonomy: saved
        },
        { type: "knowledge_taxonomy.updated" }
      );
      sendJson(response, 200, {
        path: getKnowledgeTaxonomyPath(userDataPath),
        taxonomy: saved,
        guidance: await getKnowledgeGuidanceSummary(userDataPath)
      });
    },
    async handleListKnowledgeTaxonomyVersions({ response }) {
      sendJson(response, 200, await listKnowledgeTaxonomyVersions(userDataPath));
    },
    async handleGetStorageSummary({ response }) {
      sendJson(response, 200, metadataStore.getStorageSummary());
    },
    async handleRebuildSourceVocabulary({ response }) {
      const result = metadataStore.rebuildSourceVocabulary({
        rules: await loadEmailRules(userDataPath)
      });
      await publishProtocolEvent(
        protocolEventBus,
        "storage.summary",
        metadataStore.getStorageSummary(),
        { type: "storage.summary.snapshot" }
      );
      sendJson(response, 200, result);
    },
    async handleGetSignificantSourceTerms({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      sendJson(response, 200, metadataStore.getSignificantSourceTerms(payload));
    },
    async handleKnowledgeDocumentParse({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const settings = payload.settings || await loadSettings(userDataPath);
      const uploadSessionId = String(payload.uploadSessionId || "").trim();
      const cleanupUploadSession = Boolean(uploadSessionId && payload.dryRun === true && payload.cleanupUploadSession === true);
      try {
        const uploadedFiles = uploadSessionId
          ? await resolveUploadSessionFiles(userDataPath, uploadSessionId)
          : Array.isArray(payload.uploadedFiles)
            ? payload.uploadedFiles
            : [];
        const documentParsing = payload.documentParsing && typeof payload.documentParsing === "object"
          ? payload.documentParsing
          : {};
        const result = await documentParsingRuntime.parseDocuments({
          ...payload,
          sources: uploadSessionId ? [] : payload.sources,
          uploadedFiles,
          settings,
          userDataPath,
          runtime,
          expectedOutput:
            payload.expectedOutput ||
            payload.expectedOutputs ||
            documentParsing.expectedOutput ||
            documentParsing.expectedOutputs ||
            "chunks",
          dryRun: true
        });
        sendJson(response, 200, toPublicDocumentParsingResult(result));
      } finally {
        if (cleanupUploadSession) {
          await deleteUploadSession(userDataPath, uploadSessionId).catch(() => null);
        }
      }
    },
    async handleKnowledgeWordClouds({ requestBody, url, response }) {
      const payload = parseWordCloudRequestPayload(requestBody, url);
      sendJson(response, 200, await metadataStore.getKnowledgeWordCloudState({
        ...payload,
        rules: await loadEmailRules(userDataPath)
      }));
    },
    async handleGetKnowledgeWordBagTerms({ requestBody, url, response }) {
      const payload = parseWordCloudRequestPayload(requestBody, url);
      let result;
      try {
        result = await metadataStore.getKnowledgeWordBagTerms(payload);
      } catch (error) {
        sendWordCloudMutationError(response, error);
        return;
      }
      sendJson(response, 200, result);
    },
    async handleSaveKnowledgeWordClouds({ requestBody, authSession, response }) {
      const payload = parseJsonBody(requestBody);
      const result = await metadataStore.saveKnowledgeWordCloudSet({
        ...payload,
        rules: await loadEmailRules(userDataPath)
      });
      const rawAuditAction = String(payload.auditAction || "").trim();
      const auditAction = ["add", "remove", "clear", "save"].includes(rawAuditAction)
        ? rawAuditAction
        : rawAuditAction
          ? "save"
          : "";
      const auditPaths = normalizeAuditCorpusPaths(payload.auditPaths || []);
      if (auditAction) {
        const corpusPaths = normalizeAuditCorpusPaths(result.wordBagSet?.corpusPaths || []);
        appendConsoleOperationLog({
          operationId: `knowledge.word_clouds.corpus_paths.${auditAction}`,
          event: "knowledge.word_clouds.corpus_paths.changed",
          authSession,
          status: "ok",
          risk: "content_write",
          input: {
            action: auditAction,
            wordBagSetId: result.wordBagSet?.wordBagSetId || payload.wordBagSet?.wordBagSetId || "",
            title: result.wordBagSet?.title || payload.wordBagSet?.title || "",
            changedPathCount: auditPaths.length,
            changedPaths: auditPaths,
            corpusPathCount: corpusPaths.length,
            corpusPathTypes: [...new Set(corpusPaths.map((item) => item.type || "unknown"))]
          },
          output: {
            ok: true,
            wordBagSetId: result.wordBagSet?.wordBagSetId || "",
            corpusPathCount: corpusPaths.length
          }
        });
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.word_clouds",
        result,
        { type: "knowledge.word_clouds.updated" }
      );
      sendJson(response, 200, result);
    },
    async handleExportKnowledgeWordClouds({ requestBody, url, response }) {
      const payload = parseWordCloudRequestPayload(requestBody, url);
      let result;
      try {
        result = await metadataStore.exportKnowledgeWordCloudSet(payload);
      } catch (error) {
        sendWordCloudMutationError(response, error);
        return;
      }
      sendJson(response, 200, result);
    },
    async handleImportKnowledgeWordClouds({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      let result;
      try {
        result = await metadataStore.importKnowledgeWordCloudSet(payload);
      } catch (error) {
        sendWordCloudMutationError(response, error);
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.word_clouds",
        result,
        { type: "knowledge.word_clouds.imported" }
      );
      sendJson(response, 201, result);
    },
    async handleAddKnowledgeWordBag({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      let result;
      try {
        result = await metadataStore.addKnowledgeWordBag(payload);
      } catch (error) {
        sendWordCloudMutationError(response, error);
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.word_clouds",
        result,
        { type: "knowledge.word_clouds.word_bag.added" }
      );
      sendJson(response, 201, result);
    },
    async handleUpdateKnowledgeWordBag({ wordBagId, requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      let result;
      try {
        result = await metadataStore.updateKnowledgeWordBag({
          ...payload,
          wordBagId: payload.wordBagId || wordBagId
        });
      } catch (error) {
        sendWordCloudMutationError(response, error);
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.word_clouds",
        result,
        { type: "knowledge.word_clouds.word_bag.updated" }
      );
      sendJson(response, 200, result);
    },
    async handleDeleteKnowledgeWordBag({ wordBagId, requestBody, url, response }) {
      const payload = parseWordCloudRequestPayload(requestBody, url);
      let result;
      try {
        result = await metadataStore.deleteKnowledgeWordBag({
          ...payload,
          wordBagId: payload.wordBagId || wordBagId
        });
      } catch (error) {
        sendWordCloudMutationError(response, error);
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.word_clouds",
        result,
        { type: "knowledge.word_clouds.word_bag.deleted" }
      );
      sendJson(response, 200, result);
    },
    async handleProposeKnowledgeWordClouds({ requestBody, authSession, response }) {
      const payload = parseJsonBody(requestBody);
      const modelAlias = String(payload.modelAlias || "").trim();
      if (!modelAlias) {
        sendJson(response, 400, {
          ok: false,
          error: "请选择用于生成词云的智能体。"
        });
        return;
      }
      const prompt = String(payload.prompt || payload.message || "").trim();
      if (!prompt) {
        sendJson(response, 400, {
          ok: false,
          error: "请输入词云分组意图。"
        });
        return;
      }
      const corpusPaths = payload.corpusPaths || payload.corpusPath || [];
      const rules = await loadEmailRules(userDataPath);
      const minFrequency = clampRequestInteger(payload.minFrequency, 1, 1, 1000000000);
      const candidateLimit = clampRequestInteger(payload.limit, 300, 20, 120000);
      const modelTermLimit = clampRequestInteger(payload.modelTermLimit, 1800, 20, 120000);
      let terms = metadataStore.listSourceCorpusRawTerms({
        limit: 100000,
        minFrequency,
        corpusPaths,
        rules
      });
      let rebuiltVocabulary = false;
      if (terms.length === 0 && Array.isArray(corpusPaths) && corpusPaths.length > 0) {
        const rebuildResult = metadataStore.rebuildSourceVocabulary({ rules });
        rebuiltVocabulary = true;
        terms = metadataStore.listSourceCorpusRawTerms({
          limit: 100000,
          minFrequency,
          corpusPaths,
          rules
        });
        appendConsoleOperationLog({
          operationId: "knowledge.word_clouds.propose_scope_rebuild",
          event: "knowledge.word_clouds.scope_rebuild",
          authSession,
          status: "ok",
          risk: "repair_write",
          input: {
            modelAlias,
            promptLength: prompt.length,
            corpusPathCount: Array.isArray(corpusPaths) ? corpusPaths.length : 1,
            scopeProvided: true,
            corpusPaths,
            rebuiltTermCount: rebuildResult?.sourceCorpusRawTermCount || 0
          },
          output: {
            ok: true,
            rebuiltCorpus: true,
            rebuiltCount: Number(rebuildResult?.sourceCorpusRawTermCount || 0)
          }
        });
      }
      if (terms.length === 0) {
        sendJson(response, 409, {
          ok: false,
          error: rebuiltVocabulary
            ? "语料词频表已刷新，但这些语料范围还无话解析到可用文档。"
            : "语料词频表为空，请先完成文档入库并重建语料词频。"
        });
        return;
      }
      const preprocessed = preprocessWordCloudVocabulary({
        prompt,
        rawTerms: terms,
        termStats: metadataStore.listSourceVocabularyTermStats({
          terms: terms.map((term) => term.term)
        }),
        limit: candidateLimit,
        modelTermLimit,
        minFrequency
      });
      const preprocessPayload = {
        ok: preprocessed.ok !== false,
        intentTerms: preprocessed.intentTerms || [],
        targetTerms: (preprocessed.targetTerms || []).map((term) => ({
          term: String(term.term || "").trim(),
          frequency: Number(term.frequency || 0),
          intentScore: Number(term.intentScore || 0),
          weight: Number(term.weight || 0)
        })),
        lowQualityTerms: (preprocessed.lowQualityTerms || []).map((term) => ({
          term: String(term.term || "").trim(),
          frequency: Number(term.frequency || 0),
          intentScore: Number(term.intentScore || 0),
          weight: Number(term.weight || 0)
        })),
        summary: preprocessed.summary || {},
        modelTermCount: Array.isArray(preprocessed.agentTerms)
          ? preprocessed.agentTerms.length
          : 0,
        allTermCount: Array.isArray(preprocessed.allTerms) ? preprocessed.allTerms.length : 0
      };
      const now = new Date().toISOString();
      const runId = serverToken("knowledge_word_cloud_run", modelAlias, prompt, now);
      const queueId = serverToken("queue_item", "knowledge_word_cloud", runId);
      const wordBagSetId = serverToken("knowledge_word_cloud_set", runId);
      const candidateTerms = preprocessed.allTerms || [];
      const modelInputTerms = preprocessed.agentTerms || candidateTerms;
      const run = {
        runId,
        queueId,
        wordBagSetId,
        status: "queued",
        modelAlias,
        prompt,
        termCount: candidateTerms.length,
        sourceTermCount: terms.length,
        modelTermCount: modelInputTerms.length,
        preprocess: preprocessPayload,
        promptHash: prompt ? hashClientString(prompt, "knowledge.word_cloud.prompt") : "",
        startedAt: now
      };
      const queued = await metadataStore.saveKnowledgeWordCloudSet({
        limit: candidateTerms.length || 1,
        wordBagSet: {
          wordBagSetId,
          title: payload.title || "语料词云",
          status: "queued",
          wordBagCount: 0,
          termsSnapshot: candidateTerms,
          wordBags: [],
          unassignedTerms: candidateTerms,
          corpusPaths: payload.corpusPaths || payload.corpusPath || [],
          modelAlias,
          agentResponse: {
            run,
            preprocess: preprocessed
          }
        }
      });
      await queueMonitorStarted(queueMonitor, wordCloudQueueInput(run, {
        phase: "queued",
        status: "queued"
      }));
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.word_clouds",
        queued,
        { type: "knowledge.word_clouds.queued" }
      );
      setImmediate(() => {
        void runWordCloudClassificationTask({
          userDataPath,
          metadataStore,
          protocolEventBus,
          contextRuntime,
          clientRuntimeAllocator,
          queueMonitor,
          run: { ...run, status: "running" },
          terms: modelInputTerms,
          prompt,
          modelAlias,
          preprocess: preprocessed
        });
      });
      sendJson(response, 202, {
        ok: true,
        terms: candidateTerms,
        preprocess: preprocessPayload,
        run,
        wordBagSet: queued.wordBagSet
      });
    },
    async handleStorageDoctor({ response }) {
      sendJson(response, 200, await runStorageDoctor({ userDataPath }));
    },
    async handleStorageReconcile({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      sendJson(response, 200, await reconcileStorage({
        userDataPath,
        apply: payload.apply !== false,
        pruneOrphanObjects: payload.pruneOrphanObjects === true
      }));
    },
    async handleStorageBackups({ response }) {
      sendJson(response, 200, await listStorageBackups({ userDataPath }));
    },
    async handleStorageBackupCreate({ requestBody, response }) {
      try {
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await createStorageBackup({
          userDataPath,
          label: payload.label || ""
        }));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Storage backup creation failed."
        });
      }
    },
    async handleStorageBackupRestorePreview({ requestBody, response }) {
      try {
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await restoreStorageBackup({
          userDataPath,
          backupId: payload.backupId,
          dryRun: true,
          includePaths: payload.includePaths || []
        }));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Storage restore preview failed."
        });
      }
    },
    async handleStorageBackupRestore({ requestBody, response }) {
      try {
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await restoreStorageBackup({
          userDataPath,
          backupId: payload.backupId,
          dryRun: false,
          apply: payload.confirm === true || payload.apply === true,
          includePaths: payload.includePaths || []
        }));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Storage restore failed."
        });
      }
    },
    async handleFailedJobsReview({ limit, response }) {
      const jobs = await jobManager.listJobs({
        limit: Number(limit || 50)
      });
      const failed = (jobs.items || []).filter((job) => job.status === "failed");
      sendJson(response, 200, {
        ok: true,
        summary: jobs.summary,
        failedCount: failed.length,
        failedJobs: failed.map((job) => ({
          id: job.id,
          stage: job.stage || "",
          error: job.error || "",
          createdAt: job.createdAt || "",
          updatedAt: job.updatedAt || ""
        })),
        suggestions:
          failed.length > 0
            ? [
                "查看失败任务的输入来源与解析器路由。",
                "确认外部挂载、Tika、OCR 与模型配置是否可用。",
                "需要重跑时由管理员在任务面板或 CLI 明确触发。"
              ]
            : ["最近任务未发现失败项。"]
      });
    },
    async handleGetBackgroundProcesses({ response }) {
      sendJson(response, 200, await getBackgroundProcessStatus(userDataPath));
    },
    async handleListCheckpointTrees({ url, response }) {
      if (!checkpointTreeApi) {
        sendJson(response, 503, { error: "工作队列 checkpoint 接口未注册。" });
        return;
      }
      const trees = await checkpointTreeApi.listCheckpointTrees({
        userDataPath,
        ownerId: url.searchParams.get("ownerId") || url.searchParams.get("owner-id") || "",
        kind: url.searchParams.get("kind") || "",
        limit: Number(url.searchParams.get("limit") || 100)
      });
      sendJson(response, 200, {
        schemaVersion: 1,
        count: trees.length,
        items: trees.map(checkpointTreeApi.checkpointTreeSummary)
      });
    },
    async handleGetCheckpointTree({ treeId, response }) {
      if (!checkpointTreeApi) {
        sendJson(response, 503, { error: "工作队列 checkpoint 接口未注册。" });
        return;
      }
      const tree = await checkpointTreeApi.loadCheckpointTree({
        userDataPath,
        treeId
      });
      if (!tree) {
        sendJson(response, 404, {
          error: "checkpoint tree 不存在。"
        });
        return;
      }
      sendJson(response, 200, tree);
    },
    async handleMonitorAlerts({ requestBody, response }) {
      if (!monitorAlertApi) {
        sendJson(response, 503, { error: "监控报警接口未注册。" });
        return;
      }
      if (requestBody.length === 0) {
        sendJson(response, 200, await monitorAlertApi.getState());
        return;
      }
      const payload = parseJsonBody(requestBody);
      const config = await monitorAlertApi.saveConfig(payload.config || payload);
      const state = await monitorAlertApi.getState();
      sendJson(response, 200, {
        ...state,
        config
      });
    },
    async handleAcknowledgeMonitorAlert({ alertId, response }) {
      if (!monitorAlertApi) {
        sendJson(response, 503, { error: "监控报警接口未注册。" });
        return;
      }
      const state = await monitorAlertApi.acknowledge(alertId);
      sendJson(response, 200, state);
    },
    async handleEnhanceAffairTaxonomy({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const settings = await loadSettings(userDataPath);
      const result = await enhanceAffairTaxonomy({
        documents: Array.isArray(payload?.documents) ? payload.documents : [],
        settings,
        userDataPath
      });
      sendJson(response, 200, result);
    },
    async handleKnowledgeConsole({ response }) {
      const summary = await buildKnowledgeConsoleSummary(runtime, jobManager);
      sendJson(response, 200, {
        ...summary,
        sources: knowledgeSourceService ? await knowledgeSourceService.listSources() : undefined
      });
    },
    async handleKnowledgeSources({ response }) {
      if (!knowledgeSourceService) {
        sendJson(response, 503, { error: "知识库目录同步服务不可用。" });
        return;
      }
      sendJson(response, 200, await knowledgeSourceService.listSources());
    },
    async handleCreateKnowledgeSource({ requestBody, response }) {
      if (!knowledgeSourceService) {
        sendJson(response, 503, { error: "知识库目录同步服务不可用。" });
        return;
      }
      sendJson(response, 200, await knowledgeSourceService.createSource(parseJsonBody(requestBody)));
    },
    async handleUpdateKnowledgeSource({ sourceId, requestBody, response }) {
      if (!knowledgeSourceService) {
        sendJson(response, 503, { error: "知识库目录同步服务不可用。" });
        return;
      }
      const result = await knowledgeSourceService.updateSource(sourceId, parseJsonBody(requestBody));
      if (!result) {
        sendJson(response, 404, { error: "知识库目录不存在。" });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleDeleteKnowledgeSource({ sourceId, response }) {
      if (!knowledgeSourceService) {
        sendJson(response, 503, { error: "知识库目录同步服务不可用。" });
        return;
      }
      const result = await knowledgeSourceService.deleteSource(sourceId);
      if (!result) {
        sendJson(response, 404, { error: "知识库目录不存在。" });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleRefreshKnowledgeSource({ sourceId, requestBody, response }) {
      if (!knowledgeSourceService) {
        sendJson(response, 503, { error: "知识库目录同步服务不可用。" });
        return;
      }
      sendJson(response, 200, await knowledgeSourceService.refreshSource(sourceId, parseJsonBody(requestBody)));
    },
    async handleRefreshAllKnowledgeSources({ requestBody, response }) {
      if (!knowledgeSourceService) {
        sendJson(response, 503, { error: "知识库目录同步服务不可用。" });
        return;
      }
      sendJson(response, 200, await knowledgeSourceService.refreshAll(parseJsonBody(requestBody)));
    },
    async handleKnowledgeConfigSchema({ response }) {
      sendJson(response, 200, {
        schemaVersion: 1,
        groups: [
          {
            id: "retrieval",
            label: "检索融合",
            fields: [
              { name: "retrieval.topK", type: "number", min: 1, max: 100, defaultValue: 20, label: "Top K" },
              { name: "retrieval.bm25Weight", type: "number", min: 0, max: 1, step: 0.05, defaultValue: 0.55, label: "BM25 权重" },
              { name: "retrieval.vectorWeight", type: "number", min: 0, max: 1, step: 0.05, defaultValue: 0.3, label: "向量权重" },
              { name: "retrieval.imageWeight", type: "number", min: 0, max: 1, step: 0.05, defaultValue: 0.15, label: "图片权重" },
              { name: "retrieval.graphWeight", type: "number", min: 0, max: 1, step: 0.05, defaultValue: 0.05, label: "图谱提示权重" },
              { name: "retrieval.feedbackBoost", type: "number", min: 0, max: 1, step: 0.05, defaultValue: 0.08, label: "反馈提升权重" },
              { name: "retrieval.recencyWeight", type: "number", min: 0, max: 1, step: 0.01, defaultValue: 0.08, label: "时间新鲜度权重", description: "按指数半衰期为更近的资料提供轻量排序加成，0 表示关闭。" },
              { name: "retrieval.recencyHalfLifeDays", type: "number", min: 1, max: 3650, defaultValue: 45, label: "时间新鲜度半衰期（天）", description: "指数衰减参数：资料年龄达到该天数时，新鲜度分约降为 50%。" },
              { name: "retrieval.recencyFloor", type: "number", min: 0, max: 1, step: 0.01, defaultValue: 0.05, label: "新鲜度最低保留", description: "避免旧资料被时间因子完全压制，只影响排序，不删除或屏蔽知识。" },
              { name: "retrieval.parentExpansionDepth", type: "number", min: 0, max: 5, defaultValue: 1, label: "父级扩展深度" },
              { name: "retrieval.hierarchicalIndexEnabled", type: "boolean", defaultValue: true, label: "启用分层索引" },
              { name: "retrieval.hierarchyWeight", type: "number", min: 0, max: 1, step: 0.05, defaultValue: 0.18, label: "分层路径权重" },
              { name: "retrieval.hierarchyBranchTopK", type: "number", min: 3, max: 50, defaultValue: 12, label: "粗层候选分支数" },
              { name: "retrieval.hierarchyBackoffLimit", type: "number", min: 1, max: 80, defaultValue: 16, label: "分层回退片段数" },
              { name: "retrieval.hierarchyMinBranchCandidates", type: "number", min: 1, max: 20, defaultValue: 3, label: "分支最少细候选数" }
            ]
          },
          {
            id: "learning",
            label: "进化学习",
            fields: [
              { name: "learning.enabled", type: "boolean", defaultValue: true, label: "启用学习闭环" },
              { name: "learning.autoApplyRetrievalProfiles", type: "boolean", defaultValue: true, label: "自动发布检索 profile" },
              { name: "learning.feedbackWindowHours", type: "number", min: 1, max: 8760, defaultValue: 168, label: "反馈窗口小时数" },
              { name: "learning.minFeedbackForAutoTune", type: "number", min: 1, max: 10000, defaultValue: 1, label: "自动调参最少反馈数" },
              { name: "learning.requireEvaluationBeforeProfileActivation", type: "boolean", defaultValue: true, label: "激活前必须离线评估" },
              { name: "learning.canaryEnabled", type: "boolean", defaultValue: true, label: "启用检索策略灰度" },
              { name: "learning.canaryTrafficPercent", type: "number", min: 1, max: 100, defaultValue: 10, label: "默认灰度流量百分比" }
            ]
          },
          {
            id: "maintenance",
            label: "维护策略",
            fields: [
              { name: "maintenance.reindexBatchSize", type: "number", min: 1, max: 5000, defaultValue: 500, label: "重建批大小" },
              { name: "maintenance.staleIndexHours", type: "number", min: 1, max: 8760, defaultValue: 72, label: "过期索引小时数" },
              { name: "maintenance.requireOcrOrCaption", type: "boolean", defaultValue: true, label: "图片必须带 OCR 或说明" }
            ]
          },
          {
            id: "embeddingModel",
            label: "Embedding",
            fields: [
              { name: "embeddingModel.version", type: "string", defaultValue: "", label: "模型版本" },
              { name: "embeddingModel.text", type: "string", defaultValue: "builtin:hashing-multilingual-v1", label: "文本 provider" },
              { name: "embeddingModel.image", type: "string", defaultValue: "builtin:asset-ocr-caption-v1", label: "图片 provider" }
            ]
          }
        ],
        maintenanceTasks: [
          { id: "validate_assets", label: "校验资产", danger: "low", requiresConfirm: false },
          { id: "repair_missing_thumbnails", label: "修复缩略图", danger: "low", requiresConfirm: false },
          { id: "delete_orphan_objects", label: "删除孤立对象", danger: "high", requiresConfirm: true },
          { id: "garbage_cleanup", label: "垃圾清理", danger: "high", requiresConfirm: true, supportsDryRun: true },
          { id: "compare_retrieval_profiles", label: "比较检索参数", danger: "low", requiresConfirm: false },
          { id: "learning_run", label: "执行学习调参", danger: "low", requiresConfirm: false },
          { id: "validate_quality", label: "质量断言", danger: "low", requiresConfirm: false },
          { id: "reembed_by_model_version", label: "按模型重算 embedding", danger: "medium", requiresConfirm: true },
          { id: "reindex", label: "重建索引", danger: "medium", requiresConfirm: true }
        ]
      });
    },
    async handleKnowledgeCapabilities({ response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.capabilities === "function") {
        sendJson(response, 200, await knowledgeCore.capabilities());
        return;
      }
      sendJson(response, 503, {
        error: "知识库协议模块不可用。"
      });
    },
    async handleKnowledgeDocxExport({ url, response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.exportDocx === "function") {
        const rawIncludeMachineReadable =
          url.searchParams.get("includeMachineReadable") ||
          url.searchParams.get("include-machine-readable");
        const result = await knowledgeCore.exportDocx({
          documentId: url.searchParams.get("documentId") || url.searchParams.get("document-id") || "",
          batchId: url.searchParams.get("batchId") || url.searchParams.get("batch-id") || "",
          sourceId: url.searchParams.get("sourceId") || url.searchParams.get("source-id") || "",
          limit: Number(url.searchParams.get("limit") || 500),
          includeMachineReadable: rawIncludeMachineReadable === null
            ? false
            : parseBooleanFlag(rawIncludeMachineReadable)
        });
        response.writeHead(200, {
          "Content-Type": result.contentType,
          "Content-Disposition": `attachment; filename="${contentDispositionFileName(result.fileName)}"`,
          "Cache-Control": "no-store",
          "X-Pact-Knowledge-Export": "docx"
        });
        response.end(result.buffer);
        return;
      }
      sendJson(response, 503, {
        error: "知识库 DOCX 导出模块不可用。"
      });
    },
    async handleKnowledgeMarkdownExport({ url, response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.exportMarkdown === "function") {
        const result = await knowledgeCore.exportMarkdown({
          documentId: url.searchParams.get("documentId") || url.searchParams.get("document-id") || "",
          batchId: url.searchParams.get("batchId") || url.searchParams.get("batch-id") || "",
          sourceId: url.searchParams.get("sourceId") || url.searchParams.get("source-id") || "",
          limit: Number(url.searchParams.get("limit") || 500)
        });
        response.writeHead(200, {
          "Content-Type": result.contentType,
          "Content-Disposition": `attachment; filename="${contentDispositionFileName(result.fileName)}"`,
          "Cache-Control": "no-store",
          "X-Pact-Knowledge-Export": "markdown"
        });
        response.end(result.buffer);
        return;
      }
      sendJson(response, 503, {
        error: "知识库 Markdown 导出模块不可用。"
      });
    },
    async handleKnowledgeHtmlExport({ url, response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.exportHtml === "function") {
        const result = await knowledgeCore.exportHtml({
          documentId: url.searchParams.get("documentId") || url.searchParams.get("document-id") || "",
          batchId: url.searchParams.get("batchId") || url.searchParams.get("batch-id") || "",
          sourceId: url.searchParams.get("sourceId") || url.searchParams.get("source-id") || "",
          limit: Number(url.searchParams.get("limit") || 500)
        });
        response.writeHead(200, {
          "Content-Type": result.contentType,
          "Content-Disposition": `attachment; filename="${contentDispositionFileName(result.fileName)}"`,
          "Cache-Control": "no-store",
          "X-Pact-Knowledge-Export": "html"
        });
        response.end(result.buffer);
        return;
      }
      sendJson(response, 503, {
        error: "知识库 HTML 导出模块不可用。"
      });
    },
    async handleKnowledgeHealth({ response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.health === "function") {
        sendJson(response, 200, await knowledgeCore.health());
        return;
      }
      sendJson(response, 503, {
        ok: false,
        error: "知识库协议模块不可用。"
      });
    },
    async handleKnowledgeMaintenanceGet({ response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.getMaintenance === "function") {
        sendJson(response, 200, await knowledgeCore.getMaintenance());
        return;
      }
      sendJson(response, 503, {
        error: "知识库维护模块不可用。"
      });
    },
    async handleKnowledgeMaintenanceSet({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.setMaintenance === "function") {
        const result = await knowledgeCore.setMaintenance(payload?.value || payload);
        const recencyHalfLifeDays = Number(result?.retrieval?.recencyHalfLifeDays);
        if (Number.isFinite(recencyHalfLifeDays) && recencyHalfLifeDays > 0) {
          await saveSettings(userDataPath, { retrievalHalfLifeDays: recencyHalfLifeDays });
        }
        sendJson(response, 200, result);
        return;
      }
      sendJson(response, 503, {
        error: "知识库维护模块不可用。"
      });
    },
    async handleKnowledgeReindex({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      if (payload?.confirm !== true) {
        sendJson(response, 400, {
          error: "重建知识库索引需要 confirm=true。"
        });
        return;
      }
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.reindex === "function") {
        sendJson(response, 200, await knowledgeCore.reindex(payload));
        return;
      }
      sendJson(response, 503, {
        error: "知识库重建模块不可用。"
      });
    },
    async handleKnowledgeMaintenanceRun({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const taskType = String(payload.taskType || payload.task || "")
        .trim()
        .replace(/-/g, "_");
      if (
        [
          "delete_orphan_objects",
          "garbage_cleanup",
          "cleanup_garbage",
          "gc",
          "compact_storage",
          "reembed_by_model_version",
          "reindex",
          "rebuild_index"
        ].includes(taskType) &&
        payload.dryRun !== true &&
        payload.dry_run !== true &&
        payload.confirm !== true
      ) {
        sendJson(response, 400, {
          error: `维护任务 ${taskType} 需要 confirm=true。`
        });
        return;
      }
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.runMaintenance === "function") {
        sendJson(response, 200, await knowledgeCore.runMaintenance(payload));
        return;
      }
      sendJson(response, 503, {
        error: "知识库维护任务模块不可用。"
      });
    },
    async handleKnowledgeSync({ url, response }) {
      const scope = String(url.searchParams.get("scope") || "").trim().toLowerCase();
      if (scope === "mirror") {
        const knowledgeCore = getKnowledgeCore(runtime);
        if (knowledgeCore && typeof knowledgeCore.syncMirror === "function") {
          sendJson(
            response,
            200,
            await knowledgeCore.syncMirror({
              since: Number(url.searchParams.get("since") || 0),
              limit: Number(url.searchParams.get("limit") || 500)
            })
          );
          return;
        }
      }
      sendJson(
        response,
        200,
        metadataStore.syncKnowledge({
          since: Number(url.searchParams.get("since") || 0),
          limit: Number(url.searchParams.get("limit") || 500),
          scope
        })
      );
    },
    async handleKnowledgeChanges({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const result = metadataStore.submitKnowledgeChanges({
        changes: Array.isArray(payload?.changes)
          ? payload.changes
          : Array.isArray(payload?.outbox)
            ? payload.outbox
            : []
      });
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.changes",
        result,
        { type: "knowledge.changes.submitted" }
      );
      sendJson(response, 200, result);
    },
    async handleKnowledgeReviewItems({ url, response }) {
      const requestedStatus = url.searchParams.get("status") || "pending";
      const status = requestedStatus === "all" ? "" : requestedStatus;
      const limit = Number(url.searchParams.get("limit") || 100);
      const metadataItems = metadataStore.listKnowledgeReviewItems({
        status,
        limit
      });
      const knowledgeCore = getKnowledgeCore(runtime);
      const coreItems =
        knowledgeCore && typeof knowledgeCore.listReviewItems === "function"
          ? await knowledgeCore.listReviewItems({ status, limit })
          : { items: [] };
      const items = [
        ...(metadataItems.items || []).map((item) => ({
          ...item,
          source: item.source || "metadata-store"
        })),
        ...(coreItems.items || []).map((item) => ({
          ...item,
          source: item.source || "knowledge-core"
        }))
      ]
        .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
        .slice(0, Math.max(1, Math.min(limit, 500)));
      sendJson(response, 200, {
        status: requestedStatus,
        items,
        count: items.length,
        sources: {
          metadataStore: (metadataItems.items || []).length,
          knowledgeCore: (coreItems.items || []).length
        }
      });
    },
    async handleResolveKnowledgeReviewItem({ reviewId, requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      let result = metadataStore.resolveKnowledgeReviewItem({
        reviewId,
        resolution: payload?.resolution || payload?.action || "reject",
        patch: payload?.patch || payload?.fieldPatch || {}
      });
      if (!result) {
        const knowledgeCore = getKnowledgeCore(runtime);
        if (knowledgeCore && typeof knowledgeCore.resolveReviewItem === "function") {
          result = await knowledgeCore.resolveReviewItem({
            reviewId,
            resolution: payload?.resolution || payload?.action || "reject",
            patch: payload?.patch || payload?.fieldPatch || {}
          });
        }
      }
      if (!result) {
        sendJson(response, 404, {
          error: "审核项不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.review_items",
        result,
        { type: "knowledge.review_item.resolved" }
      );
      sendJson(response, 200, result);
    },
    async handleKnowledgeFeedback({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.recordFeedback === "function") {
        const result = await knowledgeCore.recordFeedback(payload || {});
        await publishProtocolEvent(
          protocolEventBus,
          "knowledge.feedback",
          result,
          { type: "knowledge.feedback.recorded" }
        );
        sendJson(response, 200, result);
        return;
      }
      sendJson(response, 503, {
        error: "知识库学习反馈模块不可用。"
      });
    },
    async handleKnowledgeSuggestions({ url, response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.listSuggestions === "function") {
        sendJson(
          response,
          200,
          await knowledgeCore.listSuggestions({
            status: url.searchParams.get("status") || "pending",
            limit: Number(url.searchParams.get("limit") || 100)
          })
        );
        return;
      }
      sendJson(response, 503, {
        error: "知识库建议模块不可用。"
      });
    },
    async handleGoldenRules({ url, response }) {
      if (!goldenRuleRuntime) {
        sendJson(response, 503, {
          error: "黄金规则运行时不可用。"
        });
        return;
      }
      const result = await goldenRuleRuntime.listRulePackages();
      if (url?.searchParams?.get("includeRules") === "true") {
        const packages = [];
        for (const item of Array.isArray(result.items) ? result.items : []) {
          const pkg = await goldenRuleRuntime.getRulePackage({
            packageId: item.packageId,
            version: item.activeVersion
          });
          if (pkg) {
            packages.push(pkg);
          }
        }
        sendJson(response, 200, {
          ...result,
          packages
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleSaveGoldenRules({ requestBody, response }) {
      if (!goldenRuleRuntime) {
        sendJson(response, 503, {
          error: "黄金规则运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await goldenRuleRuntime.saveRulePackage(parseJsonBody(requestBody)));
    },
    async handlePublishGoldenRules({ packageId, requestBody, response }) {
      if (!goldenRuleRuntime) {
        sendJson(response, 503, {
          error: "黄金规则运行时不可用。"
        });
        return;
      }
      const result = await goldenRuleRuntime.publishRulePackage({
        ...parseJsonBody(requestBody),
        packageId
      });
      if (!result) {
        sendJson(response, 404, {
          error: "黄金规则包不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.golden_rules",
        result,
        { type: "knowledge.golden_rules.published" }
      );
      sendJson(response, 200, result);
    },
    async handleRollbackGoldenRules({ packageId, requestBody, response }) {
      if (!goldenRuleRuntime) {
        sendJson(response, 503, {
          error: "黄金规则运行时不可用。"
        });
        return;
      }
      const result = await goldenRuleRuntime.rollbackRulePackage({
        ...parseJsonBody(requestBody),
        packageId
      });
      if (!result) {
        sendJson(response, 404, {
          error: "黄金规则包不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.golden_rules",
        result,
        { type: "knowledge.golden_rules.rollback" }
      );
      sendJson(response, 200, result);
    },
    async handleKnowledgeRuleAuthoringChat({ requestBody, response }) {
      if (!knowledgeRuleAuthoringRuntime) {
        sendJson(response, 503, {
          error: "规则生成智能体运行时不可用。"
        });
        return;
      }
      const result = await knowledgeRuleAuthoringRuntime.chat(parseJsonBody(requestBody));
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.rule_authoring",
        result,
        { type: "knowledge.rule_authoring.completed" }
      );
      sendJson(response, 200, result);
    },
    async handleKnowledgeRuleAuthoringRunGet({ runId, response }) {
      if (!knowledgeRuleAuthoringRuntime) {
        sendJson(response, 503, {
          error: "规则生成智能体运行时不可用。"
        });
        return;
      }
      const result = await knowledgeRuleAuthoringRuntime.getRun({ runId });
      if (!result) {
        sendJson(response, 404, {
          error: "规则生成运行不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleGoldCases({ url, response }) {
      if (!goldenRuleRuntime) {
        sendJson(response, 503, {
          error: "黄金样本运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await goldenRuleRuntime.listGoldCases({
        limit: Number(url.searchParams.get("limit") || 100),
        tag: url.searchParams.get("tag") || ""
      }));
    },
    async handleSaveGoldCase({ requestBody, response }) {
      if (!goldenRuleRuntime) {
        sendJson(response, 503, {
          error: "黄金样本运行时不可用。"
        });
        return;
      }
      const result = await goldenRuleRuntime.saveGoldCase(parseJsonBody(requestBody));
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.gold_cases",
        result,
        { type: "knowledge.gold_case.saved" }
      );
      sendJson(response, 200, result);
    },
    async handleKnowledgeDistillationRuns({ requestBody, response }) {
      if (!knowledgeDistillationRuntime) {
        sendJson(response, 503, {
          error: "知识蒸馏运行时不可用。"
        });
        return;
      }
      const result = await knowledgeDistillationRuntime.runDistillation(parseJsonBody(requestBody));
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.distillation",
        result,
        { type: "knowledge.distillation.completed" }
      );
      sendJson(response, 201, result);
    },
    async handleKnowledgeDistillationRunGet({ runId, response }) {
      if (!knowledgeDistillationRuntime) {
        sendJson(response, 503, {
          error: "知识蒸馏运行时不可用。"
        });
        return;
      }
      const result = await knowledgeDistillationRuntime.getRun({ runId });
      if (!result) {
        sendJson(response, 404, {
          error: "知识蒸馏任务不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleKnowledgeDistillationWorkbenchRunsList({ url, response }) {
      const result = await knowledgeDistillationWorkbench.listRuns({
        limit: Number(url.searchParams.get("limit") || 50),
        includeArchived: url.searchParams.get("includeArchived") === "1" ||
          url.searchParams.get("includeArchived") === "true"
      });
      sendJson(response, 200, result);
    },
    async handleKnowledgeDistillationWorkbenchRunsCreate({ requestBody, response }) {
      const result = await knowledgeDistillationWorkbench.createRun(parseJsonBody(requestBody));
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.distillation.workbench",
        result,
        { type: "knowledge.distillation.workbench.created" }
      );
      sendJson(response, 202, result);
    },
    async handleKnowledgeDistillationWorkbenchRunGet({ runId, response }) {
      const result = await knowledgeDistillationWorkbench.getRun({ runId });
      if (!result) {
        sendJson(response, 404, {
          error: "知识蒸馏工作台任务不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleKnowledgeDistillationWorkbenchRunResume({ runId, response }) {
      const result = await knowledgeDistillationWorkbench.resumeRun({ runId });
      if (!result) {
        sendJson(response, 404, {
          error: "知识蒸馏工作台任务不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.distillation.workbench",
        result,
        { type: "knowledge.distillation.workbench.resumed" }
      );
      sendJson(response, 202, result);
    },
    async handleKnowledgeDistillationWorkbenchRunCancel({ runId, requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const result = await knowledgeDistillationWorkbench.cancelRun({
        runId,
        reason: payload.reason || payload.message || ""
      });
      if (!result) {
        sendJson(response, 404, {
          error: "知识蒸馏工作台任务不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.distillation.workbench",
        result,
        { type: "knowledge.distillation.workbench.canceled" }
      );
      sendJson(response, 202, result);
    },
    async handleKnowledgeDistillationWorkbenchRunArchive({ runId, response }) {
      const result = await knowledgeDistillationWorkbench.archiveRun({ runId });
      if (!result) {
        sendJson(response, 404, {
          error: "知识蒸馏工作台任务不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.distillation.workbench",
        result,
        { type: "knowledge.distillation.workbench.archived" }
      );
      sendJson(response, 202, result);
    },
    async handleKnowledgeDistillationWorkbenchRunDelete({ runId, response }) {
      const result = await knowledgeDistillationWorkbench.deleteRun({ runId });
      if (!result) {
        sendJson(response, 404, {
          error: "知识蒸馏工作台任务不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.distillation.workbench",
        result,
        { type: "knowledge.distillation.workbench.deleted" }
      );
      sendJson(response, 200, result);
    },
    async handleKnowledgeDistillationWorkbenchStageRerun({ runId, stageId, response }) {
      try {
        const result = await knowledgeDistillationWorkbench.rerunStage({ runId, stageId });
        if (!result) {
          sendJson(response, 404, {
            error: "知识蒸馏工作台任务不存在。"
          });
          return;
        }
        await publishProtocolEvent(
          protocolEventBus,
          "knowledge.distillation.workbench",
          result,
          { type: "knowledge.distillation.workbench.stage.rerun" }
        );
        sendJson(response, 202, result);
      } catch (error) {
        sendJson(response, error?.code === "UNKNOWN_STAGE" ? 400 : 500, {
          error: error instanceof Error ? error.message : "重跑知识蒸馏阶段失败。"
        });
      }
    },
    async handleKnowledgeDistillationWorkbenchStageExport({ url, runId, stageId, response }) {
      const result = await knowledgeDistillationWorkbench.exportStage({
        runId,
        stageId,
        format: url.searchParams.get("format") || "markdown"
      });
      if (!result) {
        sendJson(response, 404, {
          error: "知识蒸馏工作台阶段导出不存在。"
        });
        return;
      }
      response.writeHead(200, {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${contentDispositionFileName(result.fileName)}"`,
        "Cache-Control": "no-store",
        "X-Pact-Knowledge-Export": "distillation-workbench"
      });
      response.end(result.buffer);
    },
    async handleKnowledgeDistillationWorkbenchRunPackageExport({ runId, response }) {
      const result = await knowledgeDistillationWorkbench.exportRunPackage({ runId });
      if (!result) {
        sendJson(response, 404, {
          error: "知识蒸馏工作台整包导出不存在。"
        });
        return;
      }
      response.writeHead(200, {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${contentDispositionFileName(result.fileName)}"`,
        "Cache-Control": "no-store",
        "X-Pact-Knowledge-Export": "distillation-workbench-package"
      });
      response.end(result.buffer);
    },
    async handleKnowledgeDistillationWorkbenchRunCompare({ url, runId, response }) {
      const rightRunId = url.searchParams.get("rightRunId") || url.searchParams.get("right") || "";
      const result = await knowledgeDistillationWorkbench.compareRuns({
        leftRunId: runId,
        rightRunId
      });
      if (!result) {
        sendJson(response, 404, {
          error: "知识蒸馏工作台比较对象不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleResolveKnowledgeSuggestion({ suggestionId, requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.resolveSuggestion === "function") {
        const result = await knowledgeCore.resolveSuggestion({
          suggestionId,
          resolution: payload?.resolution || payload?.action || "reject",
          patch: payload?.patch || payload?.fieldPatch || {}
        });
        if (!result) {
          sendJson(response, 404, {
            error: "知识库建议不存在。"
          });
          return;
        }
        await publishProtocolEvent(
          protocolEventBus,
          "knowledge.suggestions",
          result,
          { type: "knowledge.suggestion.resolved" }
        );
        sendJson(response, 200, result);
        return;
      }
      sendJson(response, 503, {
        error: "知识库建议模块不可用。"
      });
    },
    async handleKnowledgeLearningJob({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.runLearningJob === "function") {
        const result = await knowledgeCore.runLearningJob(payload || {});
        await publishProtocolEvent(
          protocolEventBus,
          "knowledge.learning",
          result,
          { type: "knowledge.learning.completed" }
        );
        sendJson(response, 200, result);
        return;
      }
      sendJson(response, 503, {
        error: "知识库学习任务模块不可用。"
      });
    },
    async handleKnowledgeLearningHealth({ response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.learningHealth === "function") {
        sendJson(response, 200, await knowledgeCore.learningHealth());
        return;
      }
      sendJson(response, 503, {
        ok: false,
        error: "知识库学习运行时不可用。"
      });
    },
    async handleEvidenceGateEvaluate({ requestBody, response }) {
      if (!evidenceSufficiencyGate) {
        sendJson(response, 503, {
          error: "证据充分性门禁不可用。"
        });
        return;
      }
      sendJson(response, 200, evidenceSufficiencyGate.evaluate(parseJsonBody(requestBody)));
    },
    async handleKnowledgeAgentSkill({ response }) {
      if (!knowledgeAgentSkill) {
        sendJson(response, 503, {
          error: "知识库智能体技能不可用。"
        });
        return;
      }
      sendJson(response, 200, knowledgeAgentSkill.describe());
    },
    async handleKnowledgeAgentSkillPlan({ requestBody, response }) {
      if (!knowledgeAgentSkill) {
        sendJson(response, 503, {
          error: "知识库智能体技能不可用。"
        });
        return;
      }
      sendJson(response, 200, knowledgeAgentSkill.plan(parseJsonBody(requestBody)));
    },
    async handleKnowledgeAgentSkillRun({ requestBody, response }) {
      if (!knowledgeAgentSkill) {
        sendJson(response, 503, {
          error: "知识库智能体技能不可用。"
        });
        return;
      }
      sendJson(response, 200, await knowledgeAgentSkill.run(parseJsonBody(requestBody)));
    },
    async handleKnowledgeSkills({ url, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, knowledgeSkillRuntime.listSkills({
        status: url.searchParams.get("status") || "",
        query: url.searchParams.get("query") || url.searchParams.get("q") || "",
        limit: Number(url.searchParams.get("limit") || 50)
      }));
    },
    async handleKnowledgeSkillGet({ skillId, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      const skill = knowledgeSkillRuntime.getSkill(skillId);
      if (!skill) {
        sendJson(response, 404, {
          error: "知识 Skill 不存在。"
        });
        return;
      }
      sendJson(response, 200, skill);
    },
    async handleKnowledgeSkillGenerate({ requestBody, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      sendJson(response, 201, await knowledgeSkillRuntime.generateSkill(parseJsonBody(requestBody)));
    },
    async handleKnowledgeSkillPropose({ requestBody, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      sendJson(response, 201, await knowledgeSkillRuntime.proposeSkill(parseJsonBody(requestBody)));
    },
    async handleKnowledgeSkillResolve({ requestBody, skillId, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      const result = knowledgeSkillRuntime.resolveSkill({
        ...parseJsonBody(requestBody),
        skillId
      });
      if (!result) {
        sendJson(response, 404, {
          error: "知识 Skill 不存在。"
        });
        return;
      }
      if (result.ok !== false && goldenRuleRuntime && ["publish", "accept", "published", "reject", "rejected"].includes(String(result.action || "").trim())) {
        try {
          await goldenRuleRuntime.saveGoldCaseFromSkillResolution({
            skill: result.skill,
            action: result.action
          });
        } catch {
          // Gold-case creation must not block the human review action.
        }
      }
      sendJson(response, result.ok === false ? 409 : 200, result);
    },
    async handleKnowledgeSkillFramework({ response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, {
        protocolVersion: knowledgeSkillRuntime.protocolVersion,
        framework: await knowledgeSkillRuntime.loadFramework()
      });
    },
    async handleSaveKnowledgeSkillFramework({ requestBody, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await knowledgeSkillRuntime.saveFramework(parseJsonBody(requestBody)));
    },
    async handleKnowledgeSkillEvaluationRuns({ requestBody, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      sendJson(response, 201, await knowledgeSkillRuntime.runSkillEvaluation(parseJsonBody(requestBody)));
    },
    async handleKnowledgeSkillDeployments({ requestBody, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      const result = await knowledgeSkillRuntime.createSkillDeployment(parseJsonBody(requestBody));
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.skill_deployments",
        result,
        { type: "knowledge.skill_deployment.created" }
      );
      sendJson(response, result.ok === false ? 409 : 201, result);
    },
    async handleKnowledgeSkillDeploymentRollback({ deploymentId, requestBody, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      const result = await knowledgeSkillRuntime.rollbackSkillDeployment({
        ...parseJsonBody(requestBody),
        deploymentId
      });
      if (!result) {
        sendJson(response, 404, {
          error: "SkillSet 部署不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.skill_deployments",
        result,
        { type: "knowledge.skill_deployment.rollback" }
      );
      sendJson(response, 200, result);
    },
    async handleKnowledgeTrainingSetExport({ requestBody, response }) {
      if (!goldenRuleRuntime) {
        sendJson(response, 503, {
          error: "训练集导出运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await goldenRuleRuntime.exportTrainingSet(parseJsonBody(requestBody)));
    },
    async handleAgentEvaluationRuns({ requestBody, response }) {
      if (!agentEvaluationRuntime) {
        sendJson(response, 503, {
          error: "智能体评估运行时不可用。"
        });
        return;
      }
      sendJson(response, 201, await agentEvaluationRuntime.runEvaluation(parseJsonBody(requestBody)));
    },
    async handleAgentEvaluationRunList({ url, response }) {
      if (!agentEvaluationRuntime) {
        sendJson(response, 503, {
          error: "智能体评估运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await agentEvaluationRuntime.listRuns({
        limit: Number(url.searchParams.get("limit") || 50)
      }));
    },
    async handleAgentEvaluationRun({ runId, response }) {
      if (!agentEvaluationRuntime) {
        sendJson(response, 503, {
          error: "智能体评估运行时不可用。"
        });
        return;
      }
      const result = await agentEvaluationRuntime.getRun(runId);
      if (!result) {
        sendJson(response, 404, {
          error: "智能体评估任务不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleModelDecisionRoles({ response }) {
      if (!modelDecisionRuntime) {
        sendJson(response, 503, {
          error: "模型决策运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, modelDecisionRuntime.describe());
    },
    async handleModelDecisionDecide({ requestBody, response }) {
      if (!modelDecisionRuntime) {
        sendJson(response, 503, {
          error: "模型决策运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await modelDecisionRuntime.decide(parseJsonBody(requestBody)));
    },
    async handleKnowledgeEvolutionDescribe({ response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, knowledgeEvolutionRuntime.describe());
    },
    async handleKnowledgeEvolutionRun({ requestBody, response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      sendJson(response, 201, await knowledgeEvolutionRuntime.runEvolution(parseJsonBody(requestBody)));
    },
    async handleKnowledgeEvolutionRuns({ url, response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await knowledgeEvolutionRuntime.listRuns({
        limit: Number(url.searchParams.get("limit") || 50)
      }));
    },
    async handleKnowledgeEvolutionRunGet({ runId, response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      const result = await knowledgeEvolutionRuntime.getRun(runId);
      if (!result) {
        sendJson(response, 404, {
          error: "知识进化任务不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleKnowledgeHierarchyAudit({ requestBody, response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await knowledgeEvolutionRuntime.auditHierarchy(parseJsonBody(requestBody)));
    },
    async handleKnowledgeEvolutionDeployments({ url, response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, knowledgeEvolutionRuntime.listDeployments({
        status: url.searchParams.get("status") || "",
        limit: Number(url.searchParams.get("limit") || 50)
      }));
    },
    async handleKnowledgeEvolutionDeploymentPromote({ deploymentId, requestBody, response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await knowledgeEvolutionRuntime.promote({
        deploymentId,
        ...parseJsonBody(requestBody)
      }));
    },
    async handleKnowledgeEvolutionDeploymentRollback({ deploymentId, requestBody, response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await knowledgeEvolutionRuntime.rollback({
        deploymentId,
        ...parseJsonBody(requestBody)
      }));
    },
    async handleContextProfiles({ requestBody, response }) {
      if (!contextRuntime) {
        sendJson(response, 503, {
          error: "上下文运行时不可用。"
        });
        return;
      }
      if (requestBody.length > 0) {
        sendJson(response, 200, await contextRuntime.saveProfiles(parseJsonBody(requestBody)));
        return;
      }
      sendJson(response, 200, await contextRuntime.listProfiles());
    },
    async handleClientRuntimeProfiles({ requestBody, response }) {
      if (!clientRuntimeAllocator) {
        sendJson(response, 503, {
          error: "客户端运行时分配器不可用。"
        });
        return;
      }
      if (requestBody.length > 0) {
        sendJson(response, 200, await clientRuntimeAllocator.saveProfiles(parseJsonBody(requestBody)));
        return;
      }
      sendJson(response, 200, await clientRuntimeAllocator.listProfiles());
    },
    async handleClientRuntimeResolve({ requestBody, response }) {
      if (!clientRuntimeAllocator || typeof clientRuntimeAllocator.resolve !== "function") {
        sendJson(response, 503, {
          error: "客户端运行时分配器不可用。"
        });
        return;
      }
      sendJson(response, 200, await clientRuntimeAllocator.resolve(parseJsonBody(requestBody)));
    },
    async handleClientRuntimeBootstrapPlan({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      sendJson(response, 200, buildClientRuntimeBootstrapPlan(payload));
    },
    async handleClientRuntimeStatus({ response }) {
      if (!clientRuntimeAllocator || typeof clientRuntimeAllocator.getStatus !== "function") {
        sendJson(response, 503, {
          error: "客户端运行时分配器不可用。"
        });
        return;
      }
      sendJson(response, 200, await clientRuntimeAllocator.getStatus());
    },
    async handleContextPreview({ requestBody, response, authSession }) {
      if (!contextRuntime || typeof contextRuntime.preview !== "function") {
        sendJson(response, 503, {
          error: "上下文预览运行时不可用。"
        });
        return;
      }
      const workspaceApplied = applyWorkspaceRuntimeContext(
        parseJsonBody(requestBody),
        agentWorkspace,
        workspaceAccessOptions(authSession)
      );
      if (workspaceApplied.workspaceError) {
        sendJson(response, workspaceApplied.workspaceError.status, {
          error: workspaceApplied.workspaceError.error
        });
        return;
      }
      sendJson(response, 200, await contextRuntime.preview(workspaceApplied.input));
    },
    async handleContextCompactionPreview({ requestBody, response }) {
      if (!contextRuntime || typeof contextRuntime.previewCompaction !== "function") {
        sendJson(response, 503, {
          error: "上下文压缩预览运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await contextRuntime.previewCompaction(parseJsonBody(requestBody)));
    },
    async handleContextCompactionRun({ requestBody, response }) {
      if (!contextRuntime || typeof contextRuntime.runCompaction !== "function") {
        sendJson(response, 503, {
          error: "上下文压缩运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await contextRuntime.runCompaction(parseJsonBody(requestBody)));
    },
    async handleContextCompactionRecords({ url, response }) {
      if (!contextRuntime || typeof contextRuntime.listCompactionRecords !== "function") {
        sendJson(response, 503, {
          error: "上下文压缩记录不可用。"
        });
        return;
      }
      sendJson(response, 200, await contextRuntime.listCompactionRecords({
        limit: Number(url.searchParams.get("limit") || 50)
      }));
    },
    async handleContextSessionMemory({ url, response }) {
      if (!contextRuntime || typeof contextRuntime.listSessionMemory !== "function") {
        sendJson(response, 503, {
          error: "上下文会话记忆不可用。"
        });
        return;
      }
      sendJson(response, 200, await contextRuntime.listSessionMemory({
        limit: Number(url.searchParams.get("limit") || 50),
        sessionId: url.searchParams.get("sessionId") || url.searchParams.get("session-id") || "",
        profileId: url.searchParams.get("profileId") || url.searchParams.get("profile-id") || ""
      }));
    },
    async handleContextSessionMemoryClear({ requestBody, response }) {
      if (!contextRuntime || typeof contextRuntime.clearSessionMemory !== "function") {
        sendJson(response, 503, {
          error: "上下文会话记忆不可用。"
        });
        return;
      }
      sendJson(response, 200, await contextRuntime.clearSessionMemory(parseJsonBody(requestBody)));
    },
    async handleContextBuildRecords({ url, response }) {
      if (!contextRuntime || typeof contextRuntime.listBuildRecords !== "function") {
        sendJson(response, 503, {
          error: "上下文编译记录不可用。"
        });
        return;
      }
      sendJson(response, 200, await contextRuntime.listBuildRecords({
        limit: Number(url.searchParams.get("limit") || 50)
      }));
    },
    async handleContextEvaluationRuns({ requestBody, response }) {
      if (!contextRuntime || typeof contextRuntime.runEvaluation !== "function") {
        sendJson(response, 503, {
          error: "上下文 replay 评估不可用。"
        });
        return;
      }
      sendJson(response, 201, await contextRuntime.runEvaluation(parseJsonBody(requestBody)));
    },
    async handleAgentWorkspaces({ url, response, authSession }) {
      if (!agentWorkspace) {
        sendJson(response, 503, {
          error: "智能体工作空间不可用。"
        });
        return;
      }
      sendJson(
        response,
        200,
        agentWorkspace.listWorkspaces({
          status: url.searchParams.get("status") || "",
          limit: Number(url.searchParams.get("limit") || 50),
          includeSummary: parseBooleanFlag(url.searchParams.get("includeSummary") || "true"),
          ...workspaceAccessOptions(authSession)
        })
      );
    },
    async handleAgentWorkspace({ workspaceId, url, response, authSession }) {
      if (!agentWorkspace) {
        sendJson(response, 503, {
          error: "智能体工作空间不可用。"
        });
        return;
      }
      const result = agentWorkspace.getWorkspace({
        workspaceId,
        includePrivate: parseBooleanFlag(url.searchParams.get("includePrivate") || url.searchParams.get("private") || ""),
        ...workspaceAccessOptions(authSession)
      });
      if (!result) {
        sendJson(response, 404, {
          error: "智能体工作空间不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleAgentSessions({ url, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.listSessions !== "function") {
        sendJson(response, 503, {
          error: "会话线程不可用。"
        });
        return;
      }
      sendJson(
        response,
        200,
        agentWorkspace.listSessions({
          status: url.searchParams.get("status") || "",
          workspaceId: url.searchParams.get("workspaceId") || url.searchParams.get("workspace-id") || "",
          limit: Number(url.searchParams.get("limit") || 100),
          includeLastEvent: parseBooleanFlag(url.searchParams.get("includeLastEvent") || url.searchParams.get("include-last-event") || "true"),
          ...workspaceAccessOptions(authSession)
        })
      );
    },
    async handleAgentSession({ sessionId, url, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.getSession !== "function") {
        sendJson(response, 503, {
          error: "会话线程不可用。"
        });
        return;
      }
      const result = agentWorkspace.getSession({
        sessionId,
        includeEvents: parseBooleanFlag(url.searchParams.get("includeEvents") || url.searchParams.get("include-events") || "true"),
        eventLimit: Number(url.searchParams.get("eventLimit") || url.searchParams.get("event-limit") || 200),
        ...workspaceAccessOptions(authSession)
      });
      if (!result) {
        sendJson(response, 404, {
          error: "会话线程不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleGetAgentSessionContext({ sessionId, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.getSessionContext !== "function") {
        return sendJson(response, 503, { error: "会话线程上下文不可用。" });
      }
      const result = agentWorkspace.getSessionContext(sessionId, workspaceAccessOptions(authSession));
      if (!result) {
        return sendJson(response, 404, { error: "会话线程不存在。" });
      }
      sendJson(response, 200, result);
    },
    async handleAppendAgentSessionEvent({ sessionId, requestBody, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.appendSessionEvent !== "function") {
        return sendJson(response, 503, { error: "会话线程不可用。" });
      }
      const result = agentWorkspace.appendSessionEvent({
        sessionId,
        ...parseJsonBody(requestBody),
        ...workspaceAccessOptions(authSession)
      });
      if (!result) {
        return sendJson(response, 404, { error: "会话线程不存在。" });
      }
      sendJson(response, 201, result);
    },
    async handleForkAgentSession({ sessionId, requestBody, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.forkSession !== "function") {
        return sendJson(response, 503, { error: "会话线程不可用。" });
      }
      const result = agentWorkspace.forkSession({
        sessionId,
        ...parseJsonBody(requestBody),
        ...workspaceAccessOptions(authSession)
      });
      if (!result?.ok) {
        return sendJson(response, result?.error === "会话不存在" ? 404 : 400, result || { ok: false, error: "会话分叉失败。" });
      }
      sendJson(response, 201, result);
    },
    async handleCompareAgentSessions({ sessionId, requestBody, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.compareSessions !== "function") {
        return sendJson(response, 503, { error: "会话线程不可用。" });
      }
      const payload = parseJsonBody(requestBody);
      const result = agentWorkspace.compareSessions({
        ...payload,
        leftSessionId: sessionId || payload.leftSessionId || payload.sessionId,
        ...workspaceAccessOptions(authSession)
      });
      if (!result?.ok) {
        return sendJson(response, result?.error === "会话不存在" ? 404 : 400, result || { ok: false, error: "会话比较失败。" });
      }
      sendJson(response, 200, result);
    },
    async handleAgentSessionMergeProposal({ sessionId, requestBody, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.createSessionMergeProposal !== "function") {
        return sendJson(response, 503, { error: "会话线程不可用。" });
      }
      const payload = parseJsonBody(requestBody);
      const result = agentWorkspace.createSessionMergeProposal({
        ...payload,
        targetSessionId: sessionId || payload.targetSessionId || payload.sessionId,
        ...workspaceAccessOptions(authSession)
      });
      if (!result?.ok) {
        return sendJson(response, result?.error === "会话不存在" ? 404 : 400, result || { ok: false, error: "会话合并提案失败。" });
      }
      sendJson(response, 201, result);
    },
    async handleArchiveAgentSession({ sessionId, requestBody, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.archiveSession !== "function") {
        return sendJson(response, 503, { error: "会话线程不可用。" });
      }
      const result = agentWorkspace.archiveSession({
        sessionId,
        ...parseJsonBody(requestBody),
        ...workspaceAccessOptions(authSession)
      });
      if (!result?.ok) {
        return sendJson(response, result?.error === "会话不存在" ? 404 : 400, result || { ok: false, error: "会话归档失败。" });
      }
      sendJson(response, 200, result);
    },
    async handleResolveAgentWorkspaceSubmission({ workspaceId, submissionId, requestBody, response, authSession }) {
      if (!agentWorkspace) {
        sendJson(response, 503, {
          error: "智能体工作空间不可用。"
        });
        return;
      }
      const result = agentWorkspace.resolveSubmission({
        workspaceId,
        submissionId,
        ...parseJsonBody(requestBody),
        ...workspaceAccessOptions(authSession)
      });
      if (!result) {
        sendJson(response, 404, {
          error: "共享提交不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleResolveAgentWorkspaceIssue({ workspaceId, issueId, requestBody, response, authSession }) {
      if (!agentWorkspace) {
        sendJson(response, 503, {
          error: "智能体工作空间不可用。"
        });
        return;
      }
      const result = agentWorkspace.updateIssue({
        workspaceId,
        issueId,
        ...parseJsonBody(requestBody),
        ...workspaceAccessOptions(authSession)
      });
      if (!result) {
        sendJson(response, 404, {
          error: "共享空间 issue 不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleCreateAgentWorkspace({ requestBody, response, authSession }) {
      if (!agentWorkspace) return sendJson(response, 503, { error: "智能体工作空间不可用。" });
      const body = parseJsonBody(requestBody);
      const access = workspaceAccessOptions(authSession);
      if (!body.title) return sendJson(response, 400, { error: "title 不能为空" });
      const result = agentWorkspace.createWorkspace({
        title: String(body.title || "").trim(),
        objective: String(body.objective || "").trim(),
        status: "active",
        ownerUserId: access.actorUserId || body.ownerUserId || "",
        metadata: body.metadata || {},
      });
      // If parentWorkspaceId is provided, set it right away
      if (body.parentWorkspaceId && result.workspace?.workspaceId) {
        const parentResult = agentWorkspace.setWorkspaceParent(
          result.workspace.workspaceId,
          body.parentWorkspaceId,
          access
        );
        if (!parentResult.ok) {
          return sendJson(response, 400, { error: parentResult.error });
        }
        result.workspace = parentResult.workspace;
      }
      sendJson(response, 201, result);
    },
    async handleDeleteAgentWorkspace({ workspaceId, url, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.deleteWorkspace !== "function") {
        sendJson(response, 503, {
          error: "智能体工作空间删除不可用。"
        });
        return;
      }
      const deleteFolder = parseBooleanFlag(url.searchParams.get("deleteFolder") || url.searchParams.get("delete-folder") || "");
      const result = agentWorkspace.deleteWorkspace(workspaceId, {
        deleteFolder,
        ...workspaceAccessOptions(authSession)
      });
      if (!result?.ok) {
        sendJson(response, 404, {
          error: result?.error || "工作空间不存在或无权限。"
        });
        return;
      }
      sendJson(response, 200, result);
    },

    async handleAgentWorkspaceLocks({ workspaceId, url, response, authSession }) {
      if (!agentWorkspace) {
        sendJson(response, 503, {
          error: "智能体工作空间不可用。"
        });
        return;
      }
      sendJson(response, 200, {
        protocolVersion: agentWorkspace.protocolVersion,
        locks: agentWorkspace.listLocks({
          workspaceId,
          limit: Number(url.searchParams.get("limit") || 100),
          includeExpired: parseBooleanFlag(url.searchParams.get("includeExpired") || ""),
          ...workspaceAccessOptions(authSession)
        })
      });
    },
    async handleAgentWorkspaceLock({ workspaceId, requestBody, response, authSession }) {
      if (!agentWorkspace) {
        sendJson(response, 503, {
          error: "智能体工作空间不可用。"
        });
        return;
      }
      const payload = parseJsonBody(requestBody);
      const action = String(payload.action || payload.operation || "acquire").trim();
      const result = action === "release"
        ? agentWorkspace.releaseLock({ workspaceId, ...payload, ...workspaceAccessOptions(authSession) })
        : agentWorkspace.acquireLock({ workspaceId, ...payload, ...workspaceAccessOptions(authSession) });
      if (result?.ok === false) {
        sendJson(response, result.error === "lock_held" ? 409 : 400, result);
        return;
      }
      sendJson(response, 200, result);
    },

    // ── Workspace inheritance APIs ──────────────────────────────────────────

    async handleGetWorkspaceContext({ workspaceId, response, authSession }) {
      if (!agentWorkspace) return sendJson(response, 503, { error: "智能体工作空间不可用。" });
      const result = agentWorkspace.getWorkspaceContext(workspaceId, workspaceAccessOptions(authSession));
      if (!result) return sendJson(response, 404, { error: "工作空间不存在。" });
      sendJson(response, 200, result);
    },

    async handleExportWorkspaceContextBundle({ workspaceId, url, response, authSession }) {
      if (!agentWorkspace) return sendJson(response, 503, { error: "智能体工作空间不可用。" });
      if (typeof agentWorkspace.exportWorkspaceContextBundle !== "function") {
        return sendJson(response, 503, { error: "工作空间上下文打包不可用。" });
      }
      const format = String(url.searchParams.get("format") || "").trim().toLowerCase();
      const compressedOnly =
        format === "compressed" ||
        parseBooleanFlag(url.searchParams.get("compressedOnly") || url.searchParams.get("compressed-only") || "");
      const result = agentWorkspace.exportWorkspaceContextBundle(workspaceId, {
        ...workspaceAccessOptions(authSession),
        compress: !["0", "false", "none"].includes(String(url.searchParams.get("compress") || "true").toLowerCase()),
        includeBundle: !compressedOnly,
        includePrivate: parseBooleanFlag(url.searchParams.get("includePrivate") || url.searchParams.get("include-private") || ""),
        maxItems: Number(url.searchParams.get("maxItems") || url.searchParams.get("max-items") || 12),
        contentPreviewChars: Number(
          url.searchParams.get("contentPreviewChars") ||
            url.searchParams.get("content-preview-chars") ||
            600
        )
      });
      if (!result) return sendJson(response, 404, { error: "工作空间不存在。" });
      sendJson(response, 200, result);
    },

    async handleRestoreWorkspaceContextBundle({ workspaceId, requestBody, response, authSession }) {
      if (!agentWorkspace) return sendJson(response, 503, { error: "智能体工作空间不可用。" });
      if (typeof agentWorkspace.restoreWorkspaceContextBundle !== "function") {
        return sendJson(response, 503, { error: "工作空间上下文恢复不可用。" });
      }
      const result = agentWorkspace.restoreWorkspaceContextBundle(
        workspaceId,
        parseJsonBody(requestBody),
        workspaceAccessOptions(authSession)
      );
      sendJson(response, result.ok ? 200 : 400, result);
    },

    async handleGetWorkspaceChain({ workspaceId, response, authSession }) {
      if (!agentWorkspace) return sendJson(response, 503, { error: "智能体工作空间不可用。" });
      try {
        if (!agentWorkspace.getWorkspace({ workspaceId, includeRuns: false, ...workspaceAccessOptions(authSession) })) {
          return sendJson(response, 404, { error: "工作空间不存在。" });
        }
        const chain = agentWorkspace.resolveWorkspaceChain(workspaceId);
        if (!chain.length) return sendJson(response, 404, { error: "工作空间不存在。" });
        const sourceIds = agentWorkspace.resolveWorkspaceSourceIds(workspaceId);
        const profile = agentWorkspace.resolveWorkspaceProfile(workspaceId);
        sendJson(response, 200, { chain, resolvedSourceIds: sourceIds, resolvedProfile: profile });
      } catch (err) {
        sendJson(response, 400, { error: err.message });
      }
    },

    async handleSetWorkspaceParent({ workspaceId, requestBody, response, authSession }) {
      if (!agentWorkspace) return sendJson(response, 503, { error: "智能体工作空间不可用。" });
      const { parentWorkspaceId = null } = parseJsonBody(requestBody);
      const result = agentWorkspace.setWorkspaceParent(
        workspaceId,
        parentWorkspaceId || null,
        workspaceAccessOptions(authSession)
      );
      sendJson(response, result.ok ? 200 : 400, result);
    },

    async handleHotSwapWorkspaceProfile({ workspaceId, requestBody, response, authSession }) {
      if (!agentWorkspace) return sendJson(response, 503, { error: "智能体工作空间不可用。" });
      const profilePatch = parseJsonBody(requestBody);
      const result = agentWorkspace.hotSwapProfile(workspaceId, profilePatch, workspaceAccessOptions(authSession));
      sendJson(response, result.ok ? 200 : 400, result);
    },

    async handleSetWorkspaceOwnedSources({ workspaceId, requestBody, response, authSession }) {
      if (!agentWorkspace) return sendJson(response, 503, { error: "智能体工作空间不可用。" });
      const { sourceIds = [] } = parseJsonBody(requestBody);
      const result = agentWorkspace.setOwnedSourceIds(workspaceId, sourceIds, workspaceAccessOptions(authSession));
      sendJson(response, result.ok ? 200 : 400, result);
    },

    async handleShareWorkspace({ workspaceId, targetWorkspaceId, requestBody, response, authSession }) {
      if (!agentWorkspace) return sendJson(response, 503, { error: "智能体工作空间不可用。" });
      const body = parseJsonBody(requestBody);
      // workspaceId = the one granting access; targetWorkspaceId = the one receiving
      const target = targetWorkspaceId || body.targetWorkspaceId;
      if (!target) return sendJson(response, 400, { error: "缺少 targetWorkspaceId" });
      const result = agentWorkspace.shareWorkspace(workspaceId, target, workspaceAccessOptions(authSession));
      sendJson(response, result.ok ? 200 : 400, result);
    },

    async handleUnshareWorkspace({ workspaceId, targetWorkspaceId, requestBody, response, authSession }) {
      if (!agentWorkspace) return sendJson(response, 503, { error: "智能体工作空间不可用。" });
      const body = parseJsonBody(requestBody);
      const target = targetWorkspaceId || body.targetWorkspaceId;
      if (!target) return sendJson(response, 400, { error: "缺少 targetWorkspaceId" });
      const result = agentWorkspace.unshareWorkspace(workspaceId, target, workspaceAccessOptions(authSession));
      sendJson(response, result.ok ? 200 : 400, result);
    },
    async handleCreateWorkspaceFolder({ workspaceId, requestBody, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.createWorkspaceFolder !== "function") {
        sendJson(response, 503, {
          error: "工作空间文件夹接口不可用。"
        });
        return;
      }
      const result = agentWorkspace.createWorkspaceFolder({
        workspaceId,
        ...parseJsonBody(requestBody),
        ...workspaceAccessOptions(authSession)
      });
      sendJson(response, result.ok ? 201 : result.status || 400, result);
    },
    async handleListWorkspaceFiles({ workspaceId, url, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.listWorkspaceFiles !== "function") {
        sendJson(response, 503, {
          error: "工作空间文件列表接口不可用。"
        });
        return;
      }
      const result = agentWorkspace.listWorkspaceFiles({
        workspaceId,
        path: url.searchParams.get("path") || "",
        folderPath: url.searchParams.get("folderPath") || url.searchParams.get("folder-path") || "",
        recursive: !["0", "false", "no"].includes(String(url.searchParams.get("recursive") || "true").toLowerCase()),
        includeDirectories: !["0", "false", "no"].includes(String(url.searchParams.get("includeDirectories") || url.searchParams.get("include-directories") || "true").toLowerCase()),
        includeFiles: !["0", "false", "no"].includes(String(url.searchParams.get("includeFiles") || url.searchParams.get("include-files") || "true").toLowerCase()),
        limit: Number(url.searchParams.get("limit") || 500),
        ...workspaceAccessOptions(authSession)
      });
      sendJson(response, result.ok ? 200 : result.status || 400, result);
    },
    async handleGetWorkspaceFile({ workspaceId, url, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.workspaceFileMetadata !== "function") {
        sendJson(response, 503, {
          error: "工作空间文件查询接口不可用。"
        });
        return;
      }
      const result = agentWorkspace.workspaceFileMetadata({
        workspaceId,
        path: url.searchParams.get("path") || url.searchParams.get("filePath") || url.searchParams.get("file-path") || "",
        includeHash: !["0", "false", "no"].includes(String(url.searchParams.get("includeHash") || url.searchParams.get("include-hash") || "true").toLowerCase()),
        ...workspaceAccessOptions(authSession)
      });
      sendJson(response, result.ok ? 200 : result.status || 400, result);
    },
    async handleDownloadWorkspaceFile({ workspaceId, url, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.downloadWorkspaceFile !== "function") {
        sendJson(response, 503, {
          error: "工作空间文件下载接口不可用。"
        });
        return;
      }
      const result = agentWorkspace.downloadWorkspaceFile({
        workspaceId,
        path: url.searchParams.get("path") || url.searchParams.get("filePath") || url.searchParams.get("file-path") || "",
        includeText: !["0", "false", "no"].includes(String(url.searchParams.get("includeText") || url.searchParams.get("include-text") || "true").toLowerCase()),
        encoding: url.searchParams.get("encoding") || "utf8",
        ...workspaceAccessOptions(authSession)
      });
      sendJson(response, result.ok ? 200 : result.status || 400, result);
    },
    async handleUploadWorkspaceFile({ workspaceId, requestBody, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.uploadWorkspaceFile !== "function") {
        sendJson(response, 503, {
          error: "工作空间存储接口不可用。"
        });
        return;
      }
      const payload = parseJsonBody(requestBody);
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        sendJson(response, 400, { error: "请求体必须是 JSON 对象。" });
        return;
      }
      const result = agentWorkspace.uploadWorkspaceFile({
        workspaceId,
        ...payload,
        createdBy: authSession?.user?.username || authSession?.user?.userId || payload.createdBy || "",
        ...workspaceAccessOptions(authSession)
      });
      sendJson(response, result.ok ? 201 : result.status || 400, result);
    },

    async handleWriteWorkspaceFile({ workspaceId, requestBody, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.writeWorkspaceFile !== "function") {
        sendJson(response, 503, { error: "工作空间存储接口不可用。" });
        return;
      }
      const payload = parseJsonBody(requestBody);
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        sendJson(response, 400, { error: "请求体必须是 JSON 对象。" });
        return;
      }
      const result = agentWorkspace.writeWorkspaceFile({
        workspaceId,
        ...payload,
        createdBy: authSession?.user?.username || authSession?.user?.userId || payload.createdBy || "",
        ...workspaceAccessOptions(authSession)
      });
      sendJson(response, result.ok ? 200 : result.status || 400, result);
    },

    async handleDeleteWorkspaceFile({ workspaceId, url, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.deleteWorkspaceFile !== "function") {
        sendJson(response, 503, { error: "工作空间存储接口不可用。" });
        return;
      }
      const pathValue = String(url.searchParams.get("path") || url.searchParams.get("filePath") || "");
      const recursive = url.searchParams.has("recursive");
      const result = agentWorkspace.deleteWorkspaceFile({
        workspaceId,
        path: pathValue,
        recursive,
        ...workspaceAccessOptions(authSession)
      });
      sendJson(response, result.ok ? 200 : result.status || 400, result);
    },

    async handleMoveWorkspaceFile({ workspaceId, requestBody, response, authSession }) {
      if (!agentWorkspace || typeof agentWorkspace.moveWorkspaceFile !== "function") {
        sendJson(response, 503, { error: "工作空间存储接口不可用。" });
        return;
      }
      const payload = parseJsonBody(requestBody);
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        sendJson(response, 400, { error: "请求体必须是 JSON 对象。" });
        return;
      }
      const result = agentWorkspace.moveWorkspaceFile({
        workspaceId,
        ...payload,
        createdBy: authSession?.user?.username || authSession?.user?.userId || payload.createdBy || "",
        ...workspaceAccessOptions(authSession)
      });
      sendJson(response, result.ok ? 200 : result.status || 400, result);
    },

    async handleKnowledgeSummarizationRun({ requestBody, response }) {
      if (!summarizationRuntime) {
        sendJson(response, 503, {
          error: "多智能体总结运行时不可用。"
        });
        return;
      }
      const result = await summarizationRuntime.startRun(parseJsonBody(requestBody));
      sendJson(response, result.run?.status === "failed" ? 500 : 201, result);
    },
    async handleGetKnowledgeSummarizationRun({ runId, url, response }) {
      if (!summarizationRuntime) {
        sendJson(response, 503, {
          error: "多智能体总结运行时不可用。"
        });
        return;
      }
      const result = summarizationRuntime.getRun(runId, {
        includePrivate: parseBooleanFlag(url.searchParams.get("includePrivate") || url.searchParams.get("private") || "")
      });
      if (!result) {
        sendJson(response, 404, {
          error: "总结任务不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleApproveKnowledgeSummarizationRun({ runId, requestBody, response }) {
      if (!summarizationRuntime) {
        sendJson(response, 503, {
          error: "多智能体总结运行时不可用。"
        });
        return;
      }
      const result = await summarizationRuntime.approveRun({
        runId,
        ...parseJsonBody(requestBody)
      });
      if (!result) {
        sendJson(response, 404, {
          error: "总结任务不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleKnowledgeAgentExploreRun({ requestBody, response }) {
      if (!agentExplorationRuntime) {
        sendJson(response, 503, {
          error: "智能探索运行时不可用。"
        });
        return;
      }
      const result = await agentExplorationRuntime.run(parseJsonBody(requestBody));
      sendJson(response, result.ok === false ? 500 : 201, result);
    },
    async handleGetKnowledgeAgentExploreRun({ runId, url, response }) {
      if (!agentExplorationRuntime) {
        sendJson(response, 503, {
          error: "智能探索运行时不可用。"
        });
        return;
      }
      const result = agentExplorationRuntime.getRun({
        runId,
        workspaceId: url.searchParams.get("workspaceId") || "",
        includePrivate: parseBooleanFlag(url.searchParams.get("includePrivate") || "")
      });
      if (!result) {
        sendJson(response, 404, {
          error: "智能探索任务不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleKnowledgeSearch({ requestBody, url, response, authSession }) {
      let payload = parseKnowledgeSearchInput({ requestBody, url });
      if (payload?.rawSourceSearch === true || payload?.sourceSearch === true) {
        const result = await searchSourceFiles({
          userDataPath,
          query: payload?.query || payload?.q || "",
          limit: payload?.limit || 20,
          returnAll: payload?.returnAll === true || payload?.all === true
        });
        sendJson(response, 200, result);
        return;
      }
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.search === "function") {
        const allocationResult = typeof clientRuntimeAllocator?.apply === "function"
          ? await clientRuntimeAllocator.apply(payload, {
              taskType: "knowledge.search",
              surface: "api.knowledge.search"
            })
          : null;
        payload = allocationResult?.input || payload;
        const workspaceApplied = applyWorkspaceRuntimeContext(
          payload,
          agentWorkspace,
          workspaceAccessOptions(authSession)
        );
        if (workspaceApplied.workspaceError) {
          sendJson(response, workspaceApplied.workspaceError.status, {
            error: workspaceApplied.workspaceError.error
          });
          return;
        }
        payload = workspaceApplied.input;
        const query = payload?.query || payload?.q || "";
        const hierarchyReasoning =
          payload?.hierarchyReasoning === true ||
          payload?.retrievalProfile?.hierarchyReasoningEnabled === true ||
          payload?.retrieval?.hierarchyReasoningEnabled === true ||
          payload?.profile?.retrieval?.hierarchyReasoningEnabled === true;
        const hierarchyReasoningDecision =
          hierarchyReasoning && typeof knowledgeCore.prepareHierarchyReasoning === "function"
            ? await knowledgeCore.prepareHierarchyReasoning({
                query,
                batchId: payload?.batchId || "",
                sourceIds: payload?.scopeSourceIds || payload?.sourceIds || [],
                limit: payload?.limit || 20,
                modelEnabled: payload?.modelEnabled === true,
                modelDecisionRuntime
              })
            : null;
        const result = await knowledgeCore.search({
          query,
          limit: payload?.limit || 20,
          itemTypes: payload?.itemTypes || payload?.types || [],
          batchId: payload?.batchId || "",
          retrievalMode: payload?.retrievalMode || payload?.mode || "",
          keywordOnly: payload?.keywordOnly === true,
          retrievalProfileId: payload?.retrievalProfileId || payload?.profileId || "",
          profileKey: payload?.profileKey || payload?.retrievalProfileKey || "",
          retrievalProfile:
            payload?.retrievalProfile ||
            payload?.retrieval ||
            payload?.profile?.retrieval ||
            {},
          profile: payload?.profile || null,
          hierarchyReasoning,
          modelEnabled: payload?.modelEnabled === true,
          hierarchyReasoningDecision,
          localQuery: payload?.localQuery || payload?.localQueryResult || payload?.localQueryResults || null,
          localHits: payload?.localHits || payload?.localMirrorHits || payload?.sourceHits || [],
          clientId: payload?.clientId || payload?.client_id || "",
          scopeSourceIds: payload?.scopeSourceIds || payload?.sourceIds || [],
          learningEnabled: payload?.learningEnabled !== false,
          explain: Boolean(payload?.explain),
          modalityPolicy: "multimodal"
        });
        if (allocationResult?.allocation) {
          result.clientRuntimeAllocation = allocationResult.allocation;
        }
        if (workspaceApplied.workspaceContext) {
          result.workspaceContext = workspaceApplied.workspaceContext;
        }
        if (
          String(payload?.format || "").toLowerCase() === "markdown" &&
          typeof knowledgeCore.renderMarkdown === "function" &&
          result.items?.[0]?.evidenceId
        ) {
          const rendered = await knowledgeCore.renderMarkdown({
            evidenceId: result.items[0].evidenceId,
            format: "markdown"
          });
          sendJson(response, 200, {
            ...result,
            rendered
          });
          return;
        }
        sendJson(response, 200, result);
        return;
      }
      const fallbackResult = metadataStore.searchKnowledge({
          query: payload?.query || payload?.q || "",
          limit: payload?.limit || 20,
          itemTypes: payload?.itemTypes || payload?.types || [],
          batchId: payload?.batchId || ""
        });
      sendJson(response, 200, {
        ...fallbackResult,
        modalityPolicy: {
          mode: "multimodal",
          text: true,
          image: true,
          filtersAllowed: false
        }
      });
    },
    async handleKnowledgeDocumentStructure({ documentId, url, response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (!knowledgeCore || typeof knowledgeCore.getDocumentStructure !== "function") {
        sendJson(response, 503, {
          error: "知识库结构读取不可用。"
        });
        return;
      }
      const result = knowledgeCore.getDocumentStructure({
        documentId,
        maxNodes:
          Number(url.searchParams.get("maxNodes") || url.searchParams.get("max-nodes") || 120)
      });
      if (!result) {
        sendJson(response, 404, {
          error: "知识文档不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleGetKnowledgeItem({ itemId, response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.getItem === "function") {
        const item = await knowledgeCore.getItem({ itemId });
        if (item) {
          sendJson(response, 200, item);
          return;
        }
      }
      const result = metadataStore.getKnowledgeItem({
        itemId
      });
      if (!result) {
        sendJson(response, 404, {
          error: "知识对象不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleGetKnowledgeEvidence({ evidenceId, response }) {
      if (isSourceEvidenceId(evidenceId)) {
        const result = await getSourceFileEvidence({ userDataPath, evidenceId });
        if (result) {
          sendJson(response, 200, result);
          return;
        }
      }
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.getEvidence === "function") {
        const result = await knowledgeCore.getEvidence({ evidenceId });
        if (result) {
          sendJson(response, 200, result);
          return;
        }
      }
      sendJson(response, 404, {
        error: "知识证据不存在。"
      });
    },
    async handleGetKnowledgeAsset({ assetId, response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.getAssetContent === "function") {
        const result = await knowledgeCore.getAssetContent({ assetId });
        if (result) {
          response.writeHead(200, {
            "Content-Type": result.contentType || "application/octet-stream",
            "Content-Disposition": `inline; filename="${contentDispositionFileName(result.fileName)}"`,
            "Cache-Control": "no-store"
          });
          response.end(result.buffer);
          return;
        }
      }
      sendJson(response, 404, {
        error: "知识库资产不存在。"
      });
    },
    async handleRenderKnowledgeMarkdown({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.renderMarkdown === "function") {
        const result = await knowledgeCore.renderMarkdown(payload);
        if (result) {
          sendJson(response, 200, result);
          return;
        }
      }
      sendJson(response, 404, {
        error: "知识证据不存在，无法渲染 Markdown。"
      });
    },
    async handleKnowledgeGraph({ url, response }) {
      sendJson(
        response,
        200,
        metadataStore.getKnowledgeGraph({
          seed: url.searchParams.get("seed") || "",
          depth: Number(url.searchParams.get("depth") || 1),
          limit: Number(url.searchParams.get("limit") || 120)
        })
      );
    },
    async handleCreateMcpAuthorizationRequest({ request, requestBody, response }) {
      const platform = getToolManagementPlatform();
      if (!platform?.store?.createMcpAuthorizationRequest) {
        sendJson(response, 503, { error: "MCP Authorization API is unavailable." });
        return;
      }
      const payload = parseJsonBody(requestBody);
      const result = platform.store.createMcpAuthorizationRequest({
        request,
        clientName: String(payload.clientName || payload.name || "").trim(),
        requestedScopes: Array.isArray(payload.requestedScopes) ? payload.requestedScopes : [],
        requestedTools: Array.isArray(payload.requestedTools) ? payload.requestedTools : [],
        reason: String(payload.reason || "").trim()
      });
      sendJson(response, 200, result);
    },
    async handleListMcpAuthorizationRequests({ url, response }) {
      const platform = getToolManagementPlatform();
      if (!platform?.store?.listMcpAuthorizationRequests) {
        sendJson(response, 503, { error: "MCP Authorization API is unavailable." });
        return;
      }
      const status = url?.searchParams?.get("status") || "pending";
      sendJson(response, 200, {
        requests: platform.store.listMcpAuthorizationRequests({ status })
      });
    },
    async handleResolveMcpAuthorizationRequest({ requestId, requestBody, response }) {
      const platform = getToolManagementPlatform();
      if (!platform?.store?.resolveMcpAuthorizationRequest) {
        sendJson(response, 503, { error: "MCP Authorization API is unavailable." });
        return;
      }
      const payload = parseJsonBody(requestBody);
      const resolution = String(payload.resolution || "").trim(); // 'approved' or 'rejected'

      let grantId = "";
      if (resolution === "approved") {
        const clientName = String(payload.clientName || "MCP Client");
        const grantResult = platform.store.createGrant({
          label: `${clientName} (MCP Client)`,
          type: "mcp-client",
          scopes: Array.isArray(payload.scopes) ? payload.scopes : [],
          toolsets: Array.isArray(payload.toolsets) ? payload.toolsets : [],
          toolAllow: Array.isArray(payload.toolAllow) ? payload.toolAllow : [],
          enabled: true,
          reason: `Approved MCP authorization request ${requestId}`
        });
        grantId = grantResult.grant.id;
      }

      const success = platform.store.resolveMcpAuthorizationRequest({
        requestId,
        resolution,
        grantId
      });

      if (!success) {
        sendJson(response, 404, { error: "Request not found or already resolved." });
        return;
      }
      sendJson(response, 200, { ok: true, grantId });
    },
    async handleToolManagementPassthrough({ operation, request, requestBody, url, response }) {
      const platform = getToolManagementPlatform();
      if (!platform?.router?.handleToolManagementHttpRequest) {
        sendJson(response, 503, {
          error: "Tool Management API is unavailable."
        });
        return;
      }
      const handled = await platform.router.handleToolManagementHttpRequest({
        request,
        response,
        requestBody,
        url,
        method: operation?.http?.method || request?.method || "GET",
        dispatched: true
      });
      if (!handled) {
        sendJson(response, 404, {
          error: "Tool Management API route not found."
        });
      }
    },
    async handleProductionHealth({ response }) {
      sendJson(response, 200, await buildProductionHealthReport());
    },
    async handleExecutiveReport({ response }) {
      const store = createExecutiveReportStore({ userDataPath });
      sendJson(response, 200, await store.list());
    },
    async handleExecutiveReportGenerate({ requestBody, response }) {
      try {
        const store = createExecutiveReportStore({ userDataPath });
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await store.generate(payload));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Executive report generation failed."
        });
      }
    },
    async handleExecutiveReportPreview({ requestBody, response }) {
      try {
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await buildExecutiveReport(payload));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Executive report preview failed."
        });
      }
    },
    async handleArchitectureLiveMap({ response }) {
      sendJson(response, 200, await buildArchitectureLiveMap());
    },
    async handleSampleBusinessPacks({ response }) {
      const store = createSampleBusinessPackStore({ userDataPath });
      sendJson(response, 200, store.list());
    },
    async handleSampleBusinessPack({ packId, response }) {
      const store = createSampleBusinessPackStore({ userDataPath });
      const pack = store.get(packId);
      if (!pack) {
        sendJson(response, 404, {
          ok: false,
          error: "Sample business pack not found."
        });
        return;
      }
      sendJson(response, 200, pack);
    },
    async handleSampleBusinessPackMaterialize({ requestBody, response }) {
      try {
        const store = createSampleBusinessPackStore({ userDataPath });
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await store.materialize(payload));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Sample business pack materialization failed."
        });
      }
    },
    async handleModuleTemplates({ response }) {
      sendJson(response, 200, listModuleTemplates());
    },
    async handleModuleScaffoldPlan({ requestBody, response }) {
      try {
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await planModuleScaffold(payload, { userDataPath }));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Module scaffold plan failed.",
          details: error?.details || []
        });
      }
    },
    async handleModuleScaffold({ requestBody, response }) {
      try {
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await scaffoldModule(payload, { userDataPath }));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Module scaffold failed.",
          details: error?.details || []
        });
      }
    },
    async handleModuleContractTest({ requestBody, response }) {
      try {
        const payload = parseJsonBody(requestBody);
        const result = payload.manifest
          ? validateCapabilityPackageScaffoldManifest(payload)
          : await runModuleContractTest(payload, { userDataPath });
        sendJson(response, result.ok === false ? 422 : 200, result);
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Module contract test failed."
        });
      }
    },
    async handleWorkspaceGovernance({ response }) {
      const governance = createWorkspaceGovernanceRegistry({ userDataPath });
      sendJson(response, 200, await governance.describe());
    },
    async handleWorkspaceGovernancePolicy({ requestBody, response }) {
      try {
        const governance = createWorkspaceGovernanceRegistry({ userDataPath });
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await governance.upsertPolicy(payload.policy || payload));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Workspace governance policy update failed."
        });
      }
    },
    async handleWorkspaceGovernanceEvaluate({ requestBody, response }) {
      try {
        const governance = createWorkspaceGovernanceRegistry({ userDataPath });
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await governance.evaluate(payload));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Workspace governance evaluation failed."
        });
      }
    },
    async handleWorkspaceGovernanceShareGrant({ requestBody, response }) {
      try {
        const governance = createWorkspaceGovernanceRegistry({ userDataPath });
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await governance.createShareGrant(payload));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Workspace governance share grant failed."
        });
      }
    },
    async handleGerritRead({ requestBody, response }) {
      try {
        const payload = parseJsonBody(requestBody);
        const result = await executeGerritCommonOperation({ mode: "read", input: payload });
        const { result: data, ...rest } = result;
        sendJson(response, result.ok ? 200 : result.status || 400, {
          ...rest,
          data,
          allowedActions: GERRIT_ACTIONS.read
        });
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Gerrit read operation failed.",
          allowedActions: GERRIT_ACTIONS.read
        });
      }
    },
    async handleGerritWrite({ requestBody, response }) {
      try {
        const payload = parseJsonBody(requestBody);
        const result = await executeGerritCommonOperation({ mode: "write", input: payload });
        const { result: data, ...rest } = result;
        sendJson(response, result.ok ? 200 : result.status || 400, {
          ...rest,
          data,
          allowedActions: GERRIT_ACTIONS.write
        });
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Gerrit write operation failed.",
          allowedActions: GERRIT_ACTIONS.write
        });
      }
    },
    async handleGerritMaintain({ requestBody, response }) {
      try {
        const payload = parseJsonBody(requestBody);
        const result = await executeGerritCommonOperation({ mode: "maintain", input: payload });
        const { result: data, ...rest } = result;
        sendJson(response, result.ok ? 200 : result.status || 400, {
          ...rest,
          data,
          allowedActions: GERRIT_ACTIONS.maintain
        });
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Gerrit maintain operation failed.",
          allowedActions: GERRIT_ACTIONS.maintain
        });
      }
    },
    async handleGerritGitUpload({ requestBody, response }) {
      try {
        const payload = parseJsonBody(requestBody);
        const result = await uploadGerritGitChange(payload);
        sendJson(response, result.ok ? 200 : result.status || 400, result);
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Gerrit git upload failed."
        });
      }
    },
    async handleRepoOperation({ operation, requestBody, response, authSession }) {
      try {
        const payload = parseJsonBody(requestBody);
        const result = await executeRepoOperation({
          operationId: operation?.id,
          input: payload,
          authSession
        });
        sendJson(response, result.ok ? 200 : result.status || 400, result);
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          operationId: operation?.id || "",
          error: {
            code: "repo_operation_failed",
            message: error instanceof Error ? error.message : "Repo operation failed."
          }
        });
      }
    },
    async handleAssetLineage({ response }) {
      const lineage = createAssetLineageRegistry({ userDataPath });
      sendJson(response, 200, await lineage.describe());
    },
    async handleAssetLineageRecord({ requestBody, response }) {
      try {
        const lineage = createAssetLineageRegistry({ userDataPath });
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await lineage.record(payload.record || payload));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Asset lineage record failed."
        });
      }
    },
    async handleAssetLineageTrace({ requestBody, response }) {
      try {
        const lineage = createAssetLineageRegistry({ userDataPath });
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await lineage.trace(payload));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Asset lineage trace failed."
        });
      }
    },
    async handleAssetLineageReparsePlan({ requestBody, response }) {
      try {
        const lineage = createAssetLineageRegistry({ userDataPath });
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await lineage.planReparse(payload));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Asset lineage reparse plan failed."
        });
      }
    },
    async handleDataConnectorGovernance({ response }) {
      const governance = createDataConnectorGovernance({ userDataPath });
      sendJson(response, 200, await governance.describe());
    },
    async handleDataConnectorGovernancePlan({ requestBody, response }) {
      const governance = createDataConnectorGovernance({ userDataPath });
      const payload = parseJsonBody(requestBody);
      sendJson(response, 200, await governance.plan(payload.manifest || payload));
    },
    async handleDataConnectorGovernanceConformance({ requestBody, response }) {
      const governance = createDataConnectorGovernance({ userDataPath });
      try {
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await governance.runConformance(payload.manifest || payload));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Data connector conformance failed.",
          details: error?.details || []
        });
      }
    },
    async handlePerformanceCapacityTargets({ response }) {
      sendJson(response, 200, listCapacityBenchmarkTargets());
    },
    async handlePerformanceCapacityBenchmark({ requestBody, response }) {
      try {
        const payload = parseJsonBody(requestBody);
        sendJson(response, 200, await runPerformanceCapacityBenchmark({
          userDataPath,
          profileId: payload.profileId || payload.profile || "smoke",
          targets: payload.targets || {},
          failureInjection: payload.failureInjection || {}
        }));
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Performance capacity benchmark failed."
        });
      }
    },
    async handleSearch({ url, response }) {
      const rules = await loadEmailRules(userDataPath);
      const searchResult = metadataStore.search({
        query: url.searchParams.get("q") || "",
        limit: url.searchParams.get("limit") || 20,
        batchId: url.searchParams.get("batchId") || "",
        entityTypes: parseEntityTypes(url.searchParams),
        formalOnly: parseBooleanFlag(url.searchParams.get("formalOnly") || ""),
        rules
      });
      sendJson(response, 200, searchResult);
    },
    async handleHealthz({ response }) {
      const discoveryState = getDiscoveryState();
      sendJson(response, 200, {
        ok: true,
        serverId: discoveryState.serverId,
        mode: discoveryState.mode,
        activeServiceUrl: discoveryState.activeServiceUrl
      });
    }
  };
  setImmediate(() => {
    void resumeWordCloudClassificationTasks({
      userDataPath,
      metadataStore,
      protocolEventBus,
      contextRuntime,
      clientRuntimeAllocator,
      queueMonitor
    });
  });
  return controller;
}
