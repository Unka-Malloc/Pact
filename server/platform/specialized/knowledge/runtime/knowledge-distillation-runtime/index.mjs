import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION = "splitall.knowledge-distillation.v1";

function nowIso() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(asObject(value)).filter(([, entry]) => {
      if (entry === undefined || entry === null || entry === "") {
        return false;
      }
      if (Array.isArray(entry) && entry.length === 0) {
        return false;
      }
      if (entry && typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 0) {
        return false;
      }
      return true;
    })
  );
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function stableHash(...parts) {
  return crypto
    .createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("\n"))
    .digest("hex");
}

function stableId(prefix, ...parts) {
  return `${prefix}_${stableHash(prefix, ...parts).slice(0, 24)}`;
}

function normalizeUnifiedSourceLocator(locator = {}, item = {}) {
  const rawLocator = asObject(locator);
  const rawItem = asObject(item);
  const payload = asObject(rawItem.payload);
  const document = asObject(payload.document || rawItem.document);
  const documentMetadata = asObject(document.metadata);
  const metadata = asObject(rawItem.metadata || rawLocator.metadata);
  const unifiedSource = asObject(
    rawLocator.unifiedSource ||
      metadata.unifiedSource ||
      documentMetadata.unifiedSource ||
      rawItem.unifiedSource
  );
  const chatRef = compactObject({
    ...asObject(unifiedSource.chatRef),
    ...asObject(rawLocator.chatRef)
  });
  const fileRef = compactObject({
    ...asObject(unifiedSource.fileRef),
    ...asObject(rawLocator.fileRef)
  });
  return compactObject({
    documentId: firstText(rawLocator.documentId, rawItem.documentId, rawItem.itemId, document.documentId),
    sectionId: firstText(rawLocator.sectionId, rawItem.sectionId),
    blockId: firstText(rawLocator.blockId, rawItem.blockId),
    assetId: firstText(rawLocator.assetId, rawItem.assetId),
    sourcePath: firstText(
      rawLocator.sourcePath,
      rawLocator.path,
      unifiedSource.sourcePath,
      rawItem.sourcePath,
      document.sourcePath
    ),
    sourceId: firstText(rawLocator.sourceId, unifiedSource.sourceId, rawItem.sourceId, document.sourceId),
    batchId: firstText(rawLocator.batchId, unifiedSource.batchId, rawItem.batchId, rawItem.syncBatchId, document.batchId),
    sourceType: firstText(
      rawLocator.sourceType,
      unifiedSource.sourceType,
      rawItem.sourceType,
      rawItem.kind,
      document.documentType
    ),
    providerId: firstText(rawLocator.providerId, unifiedSource.providerId, chatRef.providerId, fileRef.providerId),
    externalId: firstText(rawLocator.externalId, unifiedSource.externalId, chatRef.externalId, fileRef.externalId),
    syncBatchId: firstText(rawLocator.syncBatchId, unifiedSource.syncBatchId, chatRef.syncBatchId, fileRef.syncBatchId),
    contentHash: firstText(rawLocator.contentHash, unifiedSource.contentHash, rawLocator.sha256, document.sourceHash),
    capturedAt: firstText(rawLocator.capturedAt, unifiedSource.capturedAt, document.updatedAt, rawItem.capturedAt),
    originalFileName: firstText(rawLocator.originalFileName, unifiedSource.originalFileName, fileRef.originalFileName),
    chatRef,
    fileRef
  });
}

function sourceFingerprintForLocator(locator = {}) {
  const source = asObject(locator);
  const chatRef = asObject(source.chatRef);
  const fileRef = asObject(source.fileRef);
  const chatIdentity = [
    chatRef.workspaceId,
    chatRef.conversationId,
    chatRef.messageId,
    chatRef.threadTs || chatRef.replyThreadTs,
    chatRef.externalId
  ].filter(Boolean);
  if (source.sourceType === "chat" || chatIdentity.length > 0) {
    return `chat:${[
      source.providerId || chatRef.providerId,
      ...chatIdentity,
      source.externalId,
      source.syncBatchId || chatRef.syncBatchId
    ].filter(Boolean).join(":")}`;
  }
  const fileIdentity = [
    fileRef.externalId,
    fileRef.storageRelativePath,
    source.originalFileName || fileRef.originalFileName,
    source.contentHash || fileRef.contentHash
  ].filter(Boolean);
  if (source.sourceType === "file" || Object.keys(fileRef).length > 0 || fileIdentity.length > 0) {
    return `file:${[
      source.providerId || fileRef.providerId,
      source.sourceType === "file" ? source.externalId : "",
      ...fileIdentity,
      source.syncBatchId || fileRef.syncBatchId
    ].filter(Boolean).join(":")}`;
  }
  return [
    source.sourceType,
    source.providerId,
    source.externalId,
    source.syncBatchId,
    source.contentHash,
    source.sourcePath,
    source.documentId,
    source.sectionId,
    source.blockId,
    source.assetId
  ].filter(Boolean).join(":") || "unknown-source";
}

function tokenize(value) {
  return [
    ...new Set(
      String(value || "")
        .toLowerCase()
        .match(/[\p{L}\p{N}_-]+/gu) || []
    )
  ].filter((token) => token.length >= 2 && token.length <= 64);
}

function jaccard(left = [], right = []) {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) {
    return 0;
  }
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) {
      intersection += 1;
    }
  }
  return intersection / (a.size + b.size - intersection);
}

function citationForItem(item = {}) {
  return compactObject({
    evidenceId: normalizeText(item.evidenceId || item.id || ""),
    documentId: normalizeText(item.documentId || item.itemId || ""),
    title: normalizeText(item.title || ""),
    snippet: normalizeText(item.snippet || item.summary || item.text || "").slice(0, 420),
    source: normalizeUnifiedSourceLocator(item.sourceLocator || item.source || item.locator || {}, item)
  });
}

function sourceTraceForItems(items = []) {
  const evidenceRefs = [...new Set(asArray(items).map((item) => normalizeText(item.evidenceId)).filter(Boolean))];
  const bySource = new Map();
  for (const item of asArray(items)) {
    const locator = normalizeUnifiedSourceLocator(item.sourceLocator || item.source || item.locator || {}, item);
    const key = sourceFingerprintForLocator(locator);
    const previous = bySource.get(key) || {
      sourceKey: key,
      sourceType: locator.sourceType || "",
      providerId: locator.providerId || "",
      externalId: locator.externalId || "",
      syncBatchId: locator.syncBatchId || "",
      contentHash: locator.contentHash || "",
      capturedAt: locator.capturedAt || "",
      originalFileName: locator.originalFileName || "",
      sourcePath: locator.sourcePath || "",
      documentIds: [],
      evidenceRefs: [],
      chatRef: locator.chatRef || undefined,
      fileRef: locator.fileRef || undefined
    };
    if (locator.documentId && !previous.documentIds.includes(locator.documentId)) {
      previous.documentIds.push(locator.documentId);
    }
    if (item.evidenceId && !previous.evidenceRefs.includes(item.evidenceId)) {
      previous.evidenceRefs.push(item.evidenceId);
    }
    bySource.set(key, compactObject(previous));
  }
  const sources = [...bySource.values()].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
  return {
    evidenceRefs,
    citations: asArray(items).map(citationForItem).filter((item) => item.evidenceId),
    sourceCount: sources.length,
    sourceTypes: [...new Set(sources.map((item) => item.sourceType).filter(Boolean))].sort(),
    providerIds: [...new Set(sources.map((item) => item.providerId).filter(Boolean))].sort(),
    syncBatchIds: [...new Set(sources.map((item) => item.syncBatchId).filter(Boolean))].sort(),
    sources
  };
}

function compactEvidenceItem(item = {}, index = 0) {
  const hierarchy = asObject(item.hierarchy);
  const sourceLocator = normalizeUnifiedSourceLocator(item.sourceLocator || item.source || item.locator || {}, item);
  const evidenceId = normalizeText(item.evidenceId || item.id || "");
  const documentId = normalizeText(item.documentId || item.itemId || hierarchy.documentId || sourceLocator.documentId || "");
  const snippet = normalizeText(item.snippet || item.summary || item.text || "").slice(0, 1400);
  const title = normalizeText(item.title || "");
  return {
    rank: Number(item.rank || index + 1),
    evidenceId,
    documentId,
    title,
    snippet,
    score: Number(item.score || item.finalScore || item.relevanceScore || 0),
    hierarchy: item.hierarchy || null,
    sourceLocator,
    sourceKey: sourceFingerprintForLocator(sourceLocator),
    modalities: asArray(item.modalities),
    reasons: asArray(item.reasons).slice(0, 8),
    tokens: tokenize([title, snippet, item.summary, item.text].filter(Boolean).join(" "))
  };
}

function representativeTerms(items = [], limit = 6) {
  const counts = new Map();
  for (const item of items) {
    for (const token of item.tokens || []) {
      if (/^\d+$/.test(token)) {
        continue;
      }
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

function clusterEvidenceItems(items = [], options = {}) {
  const threshold = Number(options.threshold ?? 0.18);
  const maxClusters = Math.max(1, Math.min(Number(options.maxClusters || 8), 50));
  const clusters = [];
  for (const item of items) {
    let bestCluster = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      const sameDocument = item.documentId && cluster.documentIds.includes(item.documentId);
      const score = sameDocument ? Math.max(0.35, jaccard(item.tokens, cluster.tokens)) : jaccard(item.tokens, cluster.tokens);
      if (score > bestScore) {
        bestScore = score;
        bestCluster = cluster;
      }
    }
    if (bestCluster && bestScore >= threshold) {
      bestCluster.items.push(item);
      bestCluster.tokens = [...new Set([...bestCluster.tokens, ...(item.tokens || [])])].slice(0, 256);
      if (item.documentId && !bestCluster.documentIds.includes(item.documentId)) {
        bestCluster.documentIds.push(item.documentId);
      }
      bestCluster.score = Number(Math.max(bestCluster.score, bestScore).toFixed(6));
      continue;
    }
    if (clusters.length >= maxClusters) {
      clusters.sort((left, right) => left.items.length - right.items.length)[0].items.push(item);
      continue;
    }
    clusters.push({
      clusterId: stableId("skill_cluster", item.evidenceId || item.title, clusters.length),
      score: 1,
      tokens: asArray(item.tokens).slice(0, 128),
      documentIds: item.documentId ? [item.documentId] : [],
      items: [item]
    });
  }
  return clusters
    .map((cluster) => {
      const terms = representativeTerms(cluster.items, 8);
      return {
        ...cluster,
        label: terms.slice(0, 4).map((item) => item.term).join(" ") || cluster.items[0]?.title || cluster.clusterId,
        terms,
        evidenceRefs: [...new Set(cluster.items.map((item) => item.evidenceId).filter(Boolean))],
        sourceTrace: sourceTraceForItems(cluster.items)
      };
    })
    .sort((left, right) => right.items.length - left.items.length || right.score - left.score);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

function getKnowledgeCore(runtime) {
  const mount = runtime?.mounts?.knowledgeBase;
  if (!mount || mount.enabled === false) {
    return null;
  }
  return mount;
}

function citationsForItems(items = [], limit = 12) {
  return asArray(items).map(citationForItem).filter((item) => item.evidenceId).slice(0, limit);
}

function buildDistilledOutputs({ query, cluster, title = "" } = {}) {
  const safeTitle = normalizeText(title || cluster?.label || query || "Knowledge");
  const items = asArray(cluster?.items);
  const evidenceRefs = [...new Set(asArray(cluster?.evidenceRefs).filter(Boolean))];
  const citations = citationsForItems(items, 12);
  const sourceTrace = cluster?.sourceTrace || sourceTraceForItems(items);
  const terms = asArray(cluster?.terms).map((item) => normalizeText(item.term)).filter(Boolean);
  const leadSources = sourceTrace.providerIds.length
    ? sourceTrace.providerIds.join("、")
    : sourceTrace.sourceTypes.join("、") || "已入库来源";
  const summaryText = [
    `“${safeTitle}”由 ${evidenceRefs.length} 条统一 evidence 支撑。`,
    leadSources ? `来源覆盖：${leadSources}。` : "",
    evidenceRefs.slice(0, 4).map((id) => `[${id}]`).join(" ")
  ].filter(Boolean).join(" ");
  const ruleId = stableId("distilled_rule", query, cluster?.clusterId, evidenceRefs.join(","));
  const relationId = stableId("distilled_relation", query, cluster?.clusterId, terms.join(","));
  return {
    summary: {
      text: summaryText,
      evidenceRefs,
      citations,
      sourceTrace
    },
    ruleCandidates: [
      {
        ruleId,
        title: `检索“${safeTitle}”时保留来源链路`,
        condition: terms.length
          ? `问题命中这些主题词之一：${terms.slice(0, 6).join("、")}`
          : `问题命中“${safeTitle}”相关 evidence`,
        action: "retrieve_and_validate_unified_evidence_before_answer",
        evidenceRefs,
        citations,
        sourceTrace
      }
    ],
    entityRelationCandidates: [
      {
        relationId,
        sourceTerm: terms[0] || safeTitle,
        targetTerm: terms[1] || query || safeTitle,
        relationType: "co_occurs_in_unified_evidence",
        confidence: Number(Math.min(1, Math.max(0.1, evidenceRefs.length / 10)).toFixed(4)),
        evidenceRefs,
        citations,
        sourceTrace
      }
    ]
  };
}

function validateDistilledOutputs(outputs = {}) {
  const summary = asObject(outputs.summary);
  const rules = asArray(outputs.ruleCandidates);
  const relations = asArray(outputs.entityRelationCandidates);
  const hasTrace = (value) => {
    const trace = asObject(value.sourceTrace);
    return Number(trace.sourceCount || 0) > 0 && asArray(trace.evidenceRefs).length > 0;
  };
  const hasCitations = (value) => asArray(value.evidenceRefs).length > 0 && asArray(value.citations).length > 0;
  const checks = [
    {
      id: "summary_has_evidence_refs",
      passed: hasCitations(summary),
      actual: asArray(summary.evidenceRefs).length,
      expected: 1
    },
    {
      id: "summary_has_source_trace",
      passed: hasTrace(summary),
      actual: Number(summary.sourceTrace?.sourceCount || 0),
      expected: 1
    },
    {
      id: "rule_candidates_have_citations",
      passed: rules.length > 0 && rules.every((item) => hasCitations(item) && hasTrace(item)),
      actual: rules.length,
      expected: "each rule has evidenceRefs, citations, sourceTrace"
    },
    {
      id: "entity_relations_have_citations",
      passed: relations.length > 0 && relations.every((item) => hasCitations(item) && hasTrace(item)),
      actual: relations.length,
      expected: "each entity relation has evidenceRefs, citations, sourceTrace"
    }
  ];
  return {
    passed: checks.every((check) => check.passed),
    checks
  };
}

function makeCandidateSkill({ query, cluster, title = "" } = {}) {
  const safeTitle = normalizeText(title || cluster.label || query || "Knowledge Skill");
  const sourceTrace = cluster.sourceTrace || sourceTraceForItems(cluster.items);
  const distilledOutputs = buildDistilledOutputs({ query, cluster, title: safeTitle });
  const coreConcepts = cluster.terms.slice(0, 10).map((item) => ({
    term: item.term,
    weight: item.count,
    evidenceRefs: cluster.evidenceRefs.slice(0, 5)
  }));
  return {
    title: `${safeTitle} Skill`,
    sourceQuery: query,
    summary: `从 ${cluster.evidenceRefs.length} 条统一 evidence、${sourceTrace.sourceCount} 个来源中蒸馏出的可复用知识操作单元。`,
    applicability: {
      useWhen: [`用户问题命中“${safeTitle}”相关主题，且需要复用已有证据判断流程。`],
      avoidWhen: ["问题涉及 canonical fact/entity/relation/taxonomy 改写，或证据不足。"]
    },
    coreConcepts,
    decisionHeuristics: [
      "先确认粗层主题与证据来源，再下钻到 evidenceId。",
      "回答或发布前必须经过黄金规则和证据充分性门禁。",
      "发现冲突证据时进入审核，不自动合并。"
    ],
    antiPatterns: [
      "只凭单个低相关片段发布 Skill。",
      "把不同粗层主题混成同一个可复用结论。"
    ],
    honestBoundaries: [
      "Skill 是可复用操作经验，不是 canonical fact 源。",
      "证据覆盖范围仅限本候选绑定的 evidenceRefs。"
    ],
    verificationQuestions: [
      "哪些 evidenceId 直接支持本 Skill？",
      "本 Skill 适用和不适用的边界是什么？",
      "是否存在需要人工审核的冲突或权威知识变更？"
    ],
    evidenceRefs: cluster.evidenceRefs,
    sourceTrace,
    distilledOutputs,
    evidenceDigest: cluster.items.slice(0, 12).map((item) => ({
      evidenceId: item.evidenceId,
      title: item.title,
      snippet: item.snippet,
      score: item.score,
      source: item.sourceLocator,
      citation: citationForItem(item)
    }))
  };
}

function qualityReportV2({ proposalResult, evidenceGate, goldenRuleDecision, cluster, distilledOutputs } = {}) {
  const base = proposalResult?.qualityReport || {};
  const semantic = evidenceGate?.semanticSupport || {};
  const duplicateScore = 0;
  const outputCoverage = validateDistilledOutputs(distilledOutputs);
  const sourceTrace = cluster?.sourceTrace || sourceTraceForItems(cluster?.items || []);
  const passed =
    base.passed === true &&
    evidenceGate?.ok === true &&
    outputCoverage.passed === true &&
    ["canary_allowed", "auto_accept_low_risk"].includes(goldenRuleDecision?.decision);
  return {
    protocolVersion: KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
    passed,
    structural: {
      passed: base.passed === true,
      checks: asArray(base.checks)
    },
    evidenceCoverage: {
      evidenceCount: cluster?.evidenceRefs?.length || 0,
      distinctDocumentCount: base.distinctDocumentCount || 0,
      gateDecision: evidenceGate?.decision || ""
    },
    unifiedEvidence: {
      sourceCount: sourceTrace.sourceCount,
      sourceTypes: sourceTrace.sourceTypes,
      providerIds: sourceTrace.providerIds,
      syncBatchIds: sourceTrace.syncBatchIds
    },
    distilledOutputs: outputCoverage,
    semanticSupport: {
      verdict: semantic.verdict || "",
      supportedClaimCount: semantic.supportedClaimCount || 0,
      unsupportedClaimCount: semantic.unsupportedClaimCount || 0
    },
    hierarchy: {
      passed: !asArray(base.checks).some((check) => check.id === "hierarchy_context" && check.passed === false)
    },
    duplicate: {
      score: duplicateScore,
      passed: duplicateScore < 0.92
    },
    goldenRule: {
      decision: goldenRuleDecision?.decision || "needs_human_review",
      selectedRuleId: goldenRuleDecision?.selectedRule?.ruleId || ""
    },
    recommendations: [
      ...asArray(base.recommendations),
      ...asArray(evidenceGate?.recommendations),
      ...asArray(goldenRuleDecision?.recommendations)
    ]
  };
}

export function createKnowledgeDistillationRuntime({
  userDataPath,
  runtime,
  knowledgeSkillRuntime,
  goldenRuleRuntime,
  evidenceGate,
  modelDecisionRuntime = null
} = {}) {
  const rootPath = path.join(userDataPath, "knowledge-distillation");
  const runsPath = path.join(rootPath, "runs.json");

  async function readRuns() {
    return readJson(runsPath, {
      protocolVersion: KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
      runs: []
    });
  }

  async function writeRuns(runs = []) {
    await writeJson(runsPath, {
      protocolVersion: KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
      runs: asArray(runs).slice(-200)
    });
  }

  async function persistRun(run) {
    const store = await readRuns();
    await writeRuns([...asArray(store.runs).filter((item) => item.runId !== run.runId), run]);
    return run;
  }

  async function maybeNameCluster({ query, cluster, modelEnabled, modelAlias } = {}) {
    if (!modelDecisionRuntime || typeof modelDecisionRuntime.decide !== "function") {
      return { title: cluster.label, modelDecision: null };
    }
    const decision = await modelDecisionRuntime.decide({
      roleId: "topic_cluster_namer",
      modelEnabled: modelEnabled === true,
      modelAlias: modelAlias || "",
      input: {
        query,
        cluster: {
          label: cluster.label,
          terms: cluster.terms,
          evidence: cluster.items.slice(0, 5).map((item) => ({
            evidenceId: item.evidenceId,
            title: item.title,
            snippet: item.snippet
          }))
        },
        modelEnabled: modelEnabled === true
      }
    });
    return {
      title: normalizeText(decision?.decision?.title || decision?.decision?.label || cluster.label),
      modelDecision: decision
    };
  }

  async function hydrateEvidenceItemsFromPacks(knowledgeCore, items = [], maxOpen = 30) {
    if (!knowledgeCore || typeof knowledgeCore.getEvidence !== "function") {
      return items;
    }
    const hydrated = [...items];
    for (const [index, item] of items.slice(0, Math.max(0, Number(maxOpen || 0))).entries()) {
      if (!item.evidenceId) {
        continue;
      }
      try {
        const opened = await knowledgeCore.getEvidence({ evidenceId: item.evidenceId });
        if (!opened) {
          continue;
        }
        const mergedLocator = normalizeUnifiedSourceLocator(
          {
            ...asObject(item.sourceLocator),
            ...asObject(opened.locator)
          },
          {
            ...opened,
            ...item,
            payload: opened.payload || item.payload
          }
        );
        hydrated[index] = {
          ...item,
          title: item.title || normalizeText(opened.title || ""),
          snippet: item.snippet || normalizeText(opened.snippet || "").slice(0, 1400),
          score: item.score || Number(opened.score || 0),
          documentId: item.documentId || normalizeText(opened.documentId || mergedLocator.documentId || ""),
          sourceLocator: mergedLocator,
          sourceKey: sourceFingerprintForLocator(mergedLocator)
        };
      } catch {
        // Distillation should continue from search evidence when an evidence pack cannot be opened.
      }
    }
    return hydrated;
  }

  async function runDistillation(input = {}) {
    const knowledgeCore = getKnowledgeCore(runtime);
    const query = normalizeText(input.query || input.q || input.topic || "");
    const runId = normalizeText(input.runId || "") || stableId("knowledge_distillation_run", query, Date.now());
    const startedAt = nowIso();
    if (!knowledgeCore || typeof knowledgeCore.search !== "function") {
      return persistRun({
        protocolVersion: KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
        ok: false,
        runId,
        status: "unavailable",
        error: "KnowledgeCore search unavailable.",
        startedAt,
        finishedAt: nowIso()
      });
    }
    if (!query) {
      return persistRun({
        protocolVersion: KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
        ok: false,
        runId,
        status: "invalid_input",
        error: "query is required.",
        startedAt,
        finishedAt: nowIso()
      });
    }
    const limit = Math.max(1, Math.min(Number(input.limit || 30), 200));
    const searchResult = await knowledgeCore.search({
      query,
      limit,
      batchId: input.batchId || "",
      retrievalProfileId: input.retrievalProfileId || input.profileId || "",
      profileKey: input.profileKey || input.retrievalProfileKey || "",
      learningEnabled: input.learningEnabled !== false,
      explain: true,
      modalityPolicy: "multimodal"
    });
    const compactedEvidenceItems = asArray(searchResult.items || searchResult.results)
      .map(compactEvidenceItem)
      .filter((item) => item.evidenceId || item.title || item.snippet);
    const evidenceItems = await hydrateEvidenceItemsFromPacks(
      knowledgeCore,
      compactedEvidenceItems,
      input.maxOpenedEvidence || limit
    );
    const clusters = clusterEvidenceItems(evidenceItems, {
      threshold: input.clusterThreshold,
      maxClusters: input.maxClusters || 8
    });
    const candidates = [];
    for (const [index, cluster] of clusters.entries()) {
      const clusterName = await maybeNameCluster({
        query,
        cluster,
        modelEnabled: input.modelEnabled === true,
        modelAlias: input.topicClusterModelAlias || input.modelAlias || ""
      });
      const proposal = makeCandidateSkill({
        query,
        cluster,
        title: clusterName.title
      });
      const proposed = knowledgeSkillRuntime
        ? await knowledgeSkillRuntime.proposeSkill({
            sourceType: "knowledge_distillation",
            agentId: input.agentId || "",
            runId,
            status: "pending_review",
            proposal: {
              ...proposal,
              clusterProvenance: {
                clusterId: cluster.clusterId,
                rank: index + 1,
                terms: cluster.terms,
                documentIds: cluster.documentIds
              }
            },
            evidenceRefs: cluster.evidenceRefs,
            hierarchy: searchResult.hierarchy || null,
            confidence: Math.min(1, Math.max(0.1, cluster.evidenceRefs.length / Math.max(1, limit)))
          })
        : null;
      const answer = [
        proposal.summary,
        ...cluster.evidenceRefs.slice(0, 3).map((id) => `[${id}]`)
      ].join(" ");
      const gate = evidenceGate?.evaluate?.({
        searchResult: {
          ...searchResult,
          items: cluster.items,
          hierarchy: searchResult.hierarchy || { selected: { documents: cluster.documentIds.map((documentId) => ({ documentId })) } }
        },
        evidenceItems: cluster.items,
        answer,
        citations: cluster.evidenceRefs,
        thresholds: {
          minEvidence: input.minEvidence ?? 1,
          minSources: input.minSources ?? 1,
          requireHierarchy: input.requireHierarchy ?? false,
          requireCitationsForAnswer: true,
          semanticSupportRequired: input.semanticSupportRequired === true,
          ...asObject(input.gateThresholds)
        }
      }) || null;
      const goldenRule = goldenRuleRuntime
        ? await goldenRuleRuntime.applyRules({
            targetType: "knowledgeSkill",
            candidate: {
              skill: proposed?.skill || proposal,
              evidenceRefs: cluster.evidenceRefs,
              qualityReport: proposed?.qualityReport || {},
              evidenceGate: gate,
              cluster
            }
          })
        : null;
      const qualityV2 = qualityReportV2({
        proposalResult: proposed,
        evidenceGate: gate,
        goldenRuleDecision: goldenRule,
        cluster,
        distilledOutputs: proposal.distilledOutputs
      });
      let reviewer = null;
      if (modelDecisionRuntime && typeof modelDecisionRuntime.decide === "function") {
        reviewer = await modelDecisionRuntime.decide({
          roleId: "skill_reviewer",
          modelEnabled: input.modelEnabled === true,
          modelAlias: input.skillReviewerModelAlias || input.modelAlias || "",
          input: {
            proposal,
            qualityReportV2: qualityV2,
            goldenRule,
            evidenceGate: gate,
            modelEnabled: input.modelEnabled === true
          }
        });
      }
      const candidateStatus =
        goldenRule?.decision === "auto_reject"
          ? "auto_rejected"
          : goldenRule?.decision === "canary_allowed"
            ? "canary_allowed"
            : "needs_human_review";
      candidates.push({
        protocolVersion: KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
        candidateId: stableId("skill_candidate", runId, cluster.clusterId),
        status: candidateStatus,
        cluster: {
          clusterId: cluster.clusterId,
          label: cluster.label,
          terms: cluster.terms,
          documentIds: cluster.documentIds,
          evidenceRefs: cluster.evidenceRefs,
          itemCount: cluster.items.length,
          sourceTrace: cluster.sourceTrace
        },
        skill: proposed?.skill || null,
        proposal,
        unifiedEvidence: {
          evidenceRefs: cluster.evidenceRefs,
          citations: citationsForItems(cluster.items, 20),
          sourceTrace: cluster.sourceTrace
        },
        distilledOutputs: proposal.distilledOutputs,
        evidencePack: cluster.items.map((item) => ({
          evidenceId: item.evidenceId,
          documentId: item.documentId,
          title: item.title,
          snippet: item.snippet,
          score: item.score,
          sourceLocator: item.sourceLocator,
          sourceKey: item.sourceKey,
          citation: citationForItem(item)
        })),
        qualityReportV2: qualityV2,
        evidenceGate: gate,
        goldenRule,
        modelDecisions: {
          topicClusterNamer: clusterName.modelDecision,
          skillReviewer: reviewer,
          skillDistiller: proposed?.modelDecision || null
        }
      });
    }
    return persistRun({
      protocolVersion: KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
      ok: true,
      runId,
      status: "completed",
      query,
      inputWindow: {
        limit,
        clusterCount: clusters.length,
        evidenceCount: evidenceItems.length,
        modelEnabled: input.modelEnabled === true
      },
      searchResult: {
        query: searchResult.query,
        explain: searchResult.explain || null,
        hierarchy: searchResult.hierarchy || null
      },
      clusters: clusters.map((cluster) => ({
        clusterId: cluster.clusterId,
        label: cluster.label,
        evidenceRefs: cluster.evidenceRefs,
        terms: cluster.terms,
        documentIds: cluster.documentIds,
        itemCount: cluster.items.length,
        sourceTrace: cluster.sourceTrace
      })),
      candidates,
      startedAt,
      finishedAt: nowIso()
    });
  }

  async function getRun(input = {}) {
    const runId = normalizeText(input.runId || input.id || "");
    const store = await readRuns();
    return asArray(store.runs).find((run) => run.runId === runId) || null;
  }

  async function listRuns(input = {}) {
    const limit = Math.max(1, Math.min(Number(input.limit || 50), 200));
    const store = await readRuns();
    return {
      protocolVersion: KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
      runs: asArray(store.runs)
        .slice()
        .sort((left, right) => String(right.startedAt || "").localeCompare(String(left.startedAt || "")))
        .slice(0, limit)
        .map((run) => ({
          ...run,
          candidates: asArray(run.candidates).map((candidate) => ({
            candidateId: candidate.candidateId,
            status: candidate.status,
            cluster: candidate.cluster,
            skillId: candidate.skill?.skillId || "",
            title: candidate.skill?.title || candidate.proposal?.title || "",
            goldenRule: candidate.goldenRule
              ? {
                  decision: candidate.goldenRule.decision,
                  selectedRule: candidate.goldenRule.selectedRule
                }
              : null
          }))
        }))
    };
  }

  function describe() {
    return {
      protocolVersion: KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
      stages: [
        "evidence_discovery",
        "coarse_clustering",
        "skill_candidate_generation",
        "golden_rule_gate",
        "evidence_gate",
        "agent_review",
        "human_review_or_canary"
      ],
      policies: {
        canonicalWritesAllowed: false,
        modelOutputIsCandidateOnly: true,
        goldenRuleRequired: true
      }
    };
  }

  return {
    protocolVersion: KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
    describe,
    runDistillation,
    getRun,
    listRuns
  };
}

export default createKnowledgeDistillationRuntime;
