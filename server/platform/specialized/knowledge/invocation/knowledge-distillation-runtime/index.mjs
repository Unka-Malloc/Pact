import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createEmbeddingRuntime } from "../../retrieval/embedding-runtime/index.mjs";
import { DEFAULT_INDUSTRIAL_DISTILLATION_MODEL } from "./industrial-benchmark.mjs";

export const KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION = "pact.knowledge-distillation.v1";
export const PORTABLE_DISTILLATION_DOCUMENT_PROTOCOL_VERSION = "portable.knowledge-distillation.v1";
export const KNOWLEDGE_DISTILLATION_ALGORITHM_VERSION = "pact.knowledge-distillation.algorithm.v2";
export const KNOWLEDGE_DISTILLATION_EXTERNAL_EVALUATION_VERSION = "pact.knowledge-distillation.external-evaluation.v1";
const DEFAULT_TEMPORAL_DECAY_HALF_LIFE_DAYS = 90;
const DEFAULT_TEMPORAL_DECAY_FLOOR = 0.35;
const PORTABLE_DOCUMENT_FORBIDDEN_KEYS = new Set([
  "evidenceRefs",
  "evidenceId",
  "documentId",
  "assetId",
  "sourceId",
  "batchId",
  "syncBatchId",
  "sourceKey"
]);

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

function normalizeDocumentText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
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
  const normalized = String(value || "").toLowerCase();
  const lexicalTokens = normalized.match(/[\p{L}\p{N}_-]+/gu) || [];
  const cjkTokens = [];
  for (const segment of normalized.match(/[\u3400-\u9fff]{2,}/gu) || []) {
    const chars = [...segment];
    for (let index = 0; index < chars.length - 1; index += 1) {
      cjkTokens.push(chars.slice(index, index + 2).join(""));
    }
    for (let index = 0; index < chars.length - 2; index += 1) {
      cjkTokens.push(chars.slice(index, index + 3).join(""));
    }
  }
  return [...new Set([...lexicalTokens, ...cjkTokens])]
    .filter((token) => token.length >= 2 && token.length <= 64)
    .slice(0, 512);
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
  const payload = asObject(item.payload);
  const hierarchy = asObject(item.hierarchy);
  const sourceLocator = normalizeUnifiedSourceLocator(item.sourceLocator || item.source || item.locator || {}, item);
  const evidenceId = normalizeText(item.evidenceId || item.id || "");
  const documentId = normalizeText(item.documentId || item.itemId || hierarchy.documentId || sourceLocator.documentId || "");
  const snippet = normalizeText(item.snippet || item.summary || item.text || "").slice(0, 1400);
  const title = normalizeText(item.title || "");
  const blocks = asArray(payload.blocks).map((block) => {
    const blockType = normalizeText(block.blockType || block.type || "");
    const text = normalizeDocumentText(block.text || block.snippet || "");
    return {
      blockType,
      title: normalizeText(block.title || ""),
      text: blockType === "raw-corpus-document" ? text : text.slice(0, 4000),
      position: Number(block.position || 0),
      metadata: asObject(block.metadata)
    };
  });
  const assets = asArray(item.assets || payload.assets).map((asset) => ({
    assetType: normalizeText(asset.assetType || asset.type || ""),
    mediaType: normalizeText(asset.mediaType || asset.mimeType || ""),
    title: normalizeText(asset.title || ""),
    caption: normalizeText(asset.caption || ""),
    ocrText: normalizeText(asset.ocrText || asset.text || ""),
    altText: normalizeText(asset.altText || asset.title || asset.caption || ""),
    sha256: normalizeText(asset.sha256 || asset.contentHash || ""),
    byteSize: Number(asset.byteSize || 0),
    width: Number(asset.width || 0),
    height: Number(asset.height || 0),
    relativePath: normalizeText(asset.relativePath || ""),
    dataUrl: normalizeText(asset.dataUrl || asset.embeddedDataUrl || ""),
    sourceLocator: asObject(asset.sourceLocator)
  }));
  return {
    rank: Number(item.rank || index + 1),
    evidenceId,
    documentId,
    title,
    snippet,
    score: Number(item.score || item.finalScore || item.relevanceScore || 0),
    hierarchy: item.hierarchy || null,
    blocks,
    assets,
    markdown: normalizeDocumentText(item.markdown || payload.markdown || "").slice(0, 12000),
    sourceLocator,
    sourceKey: sourceFingerprintForLocator(sourceLocator),
    modalities: asArray(item.modalities),
    reasons: asArray(item.reasons).slice(0, 8),
    tokens: tokenize([
      title,
      snippet,
      item.summary,
      item.text,
      blocks.map((block) => block.text || block.title).join(" ")
    ].filter(Boolean).join(" "))
  };
}

function normalizeRawCorpusDocument(raw = {}, index = 0) {
  const title = firstText(raw.title, raw.name, raw.originalFileName, raw.sourcePath, `原始语料 ${index + 1}`);
  const text = normalizeDocumentText(raw.text || raw.extractedText || raw.body || raw.content || raw.markdown || "");
  const contentHash = firstText(raw.contentHash, raw.sha256, raw.rawObject?.sha256, stableHash(title, text));
  const sourceLocator = normalizeUnifiedSourceLocator({
    documentId: raw.documentId || raw.id || raw.sourceRef || "",
    sourcePath: raw.sourcePath || raw.path || raw.rawObject?.originalRelativePath || "",
    sourceId: raw.sourceRef || raw.sourceId || raw.id || "",
    batchId: raw.batchId || "",
    sourceType: raw.sourceType || raw.kind || "",
    providerId: raw.providerId || raw.rawObject?.providerId || "",
    externalId: raw.externalId || raw.rawObject?.externalId || "",
    syncBatchId: raw.syncBatchId || raw.rawObject?.syncBatchId || "",
    contentHash,
    capturedAt: raw.capturedAt || raw.sourceCreatedAt || raw.sourceUpdatedAt || raw.sourceCollectedAt || "",
    originalFileName: raw.originalFileName || raw.rawObject?.originalFileName || title,
    fileRef: compactObject({
      providerId: raw.providerId || raw.rawObject?.providerId || "",
      externalId: raw.externalId || raw.rawObject?.externalId || "",
      originalFileName: raw.originalFileName || raw.rawObject?.originalFileName || title,
      contentHash
    })
  }, raw);
  return compactEvidenceItem({
    rank: index + 1,
    evidenceId: raw.evidenceId || stableId("raw_corpus_evidence", raw.batchId || "", raw.sourceRef || raw.id || index, contentHash),
    documentId: raw.documentId || stableId("raw_corpus_document", raw.batchId || "", raw.sourceRef || raw.id || index, contentHash),
    title,
    snippet: text.slice(0, 1400),
    score: Number(raw.score || 1),
    payload: {
      blocks: [
        {
          blockType: "raw-corpus-document",
          title,
          text,
          position: Number(raw.order || raw.position || index + 1),
          metadata: {
            rawCorpus: true,
            sourceCreatedAt: raw.sourceCreatedAt || "",
            sourceUpdatedAt: raw.sourceUpdatedAt || "",
            sourceCollectedAt: raw.sourceCollectedAt || ""
          }
        }
      ],
      assets: asArray(raw.assets)
    },
    sourceLocator,
    modalities: [
      "raw-corpus",
      text ? "text" : "",
      asArray(raw.assets).length ? "image" : ""
    ].filter(Boolean),
    reasons: [{ kind: "raw-corpus-fulltext", stage: "knowledge-distillation" }],
    text
  }, index);
}

function rawCorpusDocumentsFromInput(input = {}) {
  const explicit = [
    ...asArray(input.rawDocuments),
    ...asArray(input.rawCorpus?.documents),
    ...asArray(input.rawCorpusDocuments),
    ...asArray(input.sources)
  ];
  return explicit
    .map(normalizeRawCorpusDocument)
    .filter((item) => item.title || item.snippet || asArray(item.blocks).some((block) => block.text));
}

function buildRawCorpusBatchPlan(items = [], maxCharacters = 24000) {
  const safeMax = Math.max(4000, Math.min(Number(maxCharacters || 24000), 200000));
  const batches = [];
  let current = {
    batchNumber: 1,
    documentCount: 0,
    characterCount: 0,
    sources: [],
    itemIndexes: []
  };
  for (const [index, item] of asArray(items).entries()) {
    const characterCount = asArray(item.blocks).reduce((sum, block) => sum + String(block.text || "").length, 0);
    if (current.documentCount > 0 && current.characterCount + characterCount > safeMax) {
      batches.push(current);
      current = {
        batchNumber: batches.length + 1,
        documentCount: 0,
        characterCount: 0,
        sources: [],
        itemIndexes: []
      };
    }
    current.documentCount += 1;
    current.characterCount += characterCount;
    current.itemIndexes.push(index);
    current.sources.push(compactObject({
      title: item.title,
      sourceType: item.sourceLocator?.sourceType || "",
      sourcePath: item.sourceLocator?.sourcePath || "",
      capturedAt: item.sourceLocator?.capturedAt || "",
      contentHash: item.sourceLocator?.contentHash || ""
    }));
  }
  if (current.documentCount > 0) {
    batches.push(current);
  }
  return batches;
}

function publicRawCorpusBatch(batch = {}) {
  const { itemIndexes, ...publicBatch } = asObject(batch);
  return publicBatch;
}

function textForDistillationItem(item = {}) {
  return normalizeDocumentText(
    asArray(item.blocks).map((block) => block.text || block.snippet || block.title).filter(Boolean).join("\n\n") ||
      item.markdown ||
      item.snippet ||
      item.summary ||
      item.text
  );
}

function compactDistillationItemForModel(item = {}, maxCharacters = 2400) {
  const text = textForDistillationItem(item);
  const safeMax = Math.max(500, Math.min(Number(maxCharacters || 2400), 20000));
  return compactObject({
    evidenceId: item.evidenceId,
    documentId: item.documentId,
    title: item.title,
    snippet: item.snippet || text.slice(0, 700),
    text: text.slice(0, safeMax),
    textTruncated: text.length > safeMax,
    characterCount: text.length,
    sourceLocator: compactObject({
      sourceType: item.sourceLocator?.sourceType || "",
      sourcePath: item.sourceLocator?.sourcePath || "",
      capturedAt: item.sourceLocator?.capturedAt || "",
      originalFileName: item.sourceLocator?.originalFileName || "",
      contentHash: item.sourceLocator?.contentHash || ""
    }),
    assets: asArray(item.assets).slice(0, 8).map((asset) => compactObject({
      assetType: asset.assetType,
      mediaType: asset.mediaType,
      title: asset.title,
      caption: asset.caption,
      ocrText: normalizeText(asset.ocrText || "").slice(0, 600)
    }))
  });
}

function truncateForModel(value = "", maxCharacters = 400) {
  const normalized = normalizeText(value);
  const safeMax = Math.max(80, Math.min(Number(maxCharacters || 400), 4000));
  return normalized.length > safeMax ? `${normalized.slice(0, safeMax)}...` : normalized;
}

function decisionFallbackReason(decision = {}) {
  return normalizeText(decision?.audit?.fallbackReason || "");
}

function decisionInputOverBudget(decision = {}) {
  return decision?.usedModel !== true && decisionFallbackReason(decision) === "input_over_budget";
}

function compactCitationForModel(citation = {}, maxCharacters = 220) {
  const entry = asObject(citation);
  return compactObject({
    citationKey: entry.citationKey,
    title: truncateForModel(entry.title, 160),
    excerpt: truncateForModel(entry.excerpt || entry.snippet || entry.text, maxCharacters),
    source: compactObject({
      sourceType: entry.source?.sourceType || "",
      provider: entry.source?.provider || entry.source?.providerId || "",
      originalFileName: truncateForModel(entry.source?.originalFileName, 120),
      sourcePath: truncateForModel(entry.source?.sourcePath, 180),
      contentHash: entry.source?.contentHash || ""
    })
  });
}

function compactSourceTraceForModel(sourceTrace = {}, {
  evidenceLimit = 12,
  sourceLimit = 6
} = {}) {
  const trace = asObject(sourceTrace);
  return compactObject({
    evidenceRefs: asArray(trace.evidenceRefs).slice(0, evidenceLimit),
    sourceCount: Number(trace.sourceCount || asArray(trace.sources).length || 0),
    sourceTypes: asArray(trace.sourceTypes).slice(0, 8),
    providerIds: asArray(trace.providerIds).slice(0, 8),
    syncBatchIds: asArray(trace.syncBatchIds).slice(0, 8),
    sources: asArray(trace.sources).slice(0, sourceLimit).map((source) => compactObject({
      sourceType: source.sourceType || "",
      providerId: source.providerId || "",
      externalId: truncateForModel(source.externalId, 120),
      originalFileName: truncateForModel(source.originalFileName, 120),
      sourcePath: truncateForModel(source.sourcePath, 180),
      contentHash: source.contentHash || "",
      documentIds: asArray(source.documentIds).slice(0, 8),
      evidenceRefs: asArray(source.evidenceRefs).slice(0, 8)
    }))
  });
}

function compactRawCorpusBatchForModel(batch = {}, sourceLimit = 8) {
  const item = asObject(batch);
  return compactObject({
    batchNumber: item.batchNumber,
    documentCount: item.documentCount,
    characterCount: item.characterCount,
    modelCharacterCount: item.modelCharacterCount,
    truncatedForModel: item.truncatedForModel,
    sources: asArray(item.sources).slice(0, sourceLimit).map((source) => compactObject({
      title: truncateForModel(source.title, 120),
      sourceType: source.sourceType || "",
      sourcePath: truncateForModel(source.sourcePath, 180),
      capturedAt: source.capturedAt || "",
      contentHash: source.contentHash || ""
    }))
  });
}

function compactRawCorpusBatchExtractForModel(extract = {}, {
  findingLimit = 6,
  riskLimit = 4
} = {}) {
  const item = asObject(extract);
  return compactObject({
    batchNumber: item.batchNumber,
    summary: truncateForModel(item.summary, 600),
    coreFindings: asArray(item.coreFindings).slice(0, findingLimit).map((finding) => compactObject({
      findingId: finding.findingId || finding.id || "",
      statement: truncateForModel(finding.statement || finding.text || finding.summary, 420),
      importance: finding.importance || "",
      confidence: Number(finding.confidence || 0),
      citations: asArray(finding.citations).slice(0, 6)
    })),
    coverage: compactObject({
      documentCount: item.coverage?.documentCount,
      characterCount: item.coverage?.characterCount,
      modelCharacterCount: item.coverage?.modelCharacterCount,
      truncatedForModel: item.coverage?.truncatedForModel,
      documentTitles: asArray(item.coverage?.documentTitles).slice(0, 10).map((title) => truncateForModel(title, 120))
    }),
    risks: asArray(item.risks).slice(0, riskLimit).map((risk) => truncateForModel(risk, 240)),
    model: compactObject({
      usedModel: item.model?.usedModel === true,
      degraded: item.model?.degraded === true,
      roleId: item.model?.roleId || ""
    })
  });
}

function compactRawCorpusBatchExtractsForModel(extracts = [], options = {}) {
  return asArray(extracts).slice(0, Number(options.batchLimit || 16)).map((extract) =>
    compactRawCorpusBatchExtractForModel(extract, options)
  );
}

function compactRuleCandidateForModel(rule = {}) {
  const item = asObject(rule);
  return compactObject({
    title: truncateForModel(item.title, 180),
    condition: truncateForModel(item.condition, 260),
    action: truncateForModel(item.action, 220),
    evidenceRefs: asArray(item.evidenceRefs).slice(0, 10),
    citations: asArray(item.citations).slice(0, 4).map((citation) => compactCitationForModel(citation, 180)),
    sourceTrace: compactSourceTraceForModel(item.sourceTrace, { evidenceLimit: 10, sourceLimit: 3 })
  });
}

function compactEntityRelationForModel(relation = {}) {
  const item = asObject(relation);
  return compactObject({
    sourceTerm: truncateForModel(item.sourceTerm, 120),
    targetTerm: truncateForModel(item.targetTerm, 120),
    relationType: item.relationType || "",
    confidence: Number(item.confidence || 0),
    evidenceRefs: asArray(item.evidenceRefs).slice(0, 10),
    citations: asArray(item.citations).slice(0, 4).map((citation) => compactCitationForModel(citation, 180)),
    sourceTrace: compactSourceTraceForModel(item.sourceTrace, { evidenceLimit: 10, sourceLimit: 3 })
  });
}

function compactRawCorpusProvenanceForModel(provenance = {}) {
  const item = asObject(provenance);
  return compactObject({
    primaryInput: item.primaryInput || "",
    source: item.source || "",
    clusterEvidenceRefs: asArray(item.clusterEvidenceRefs).slice(0, 12),
    validationEvidenceRefs: asArray(item.validationEvidenceRefs).slice(0, 12),
    batchExtraction: item.batchExtraction
      ? {
          processedBatchCount: item.batchExtraction.processedBatchCount,
          batchCount: item.batchExtraction.batchCount,
          documentCount: item.batchExtraction.documentCount,
          findingCount: item.batchExtraction.findingCount,
          truncatedForModel: item.batchExtraction.truncatedForModel,
          usedModelCount: item.batchExtraction.usedModelCount
        }
      : null
  });
}

function compactQualityReportForModel(report = {}) {
  const item = asObject(report);
  return compactObject({
    passed: item.passed === true,
    evidenceCoverage: item.evidenceCoverage || {},
    unifiedEvidence: item.unifiedEvidence || {},
    semanticSupport: item.semanticSupport || {},
    hierarchy: item.hierarchy || {},
    duplicate: item.duplicate || {},
    goldenRule: item.goldenRule || {},
    recommendations: asArray(item.recommendations).slice(0, 8).map((entry) => truncateForModel(entry, 260))
  });
}

function compactEvidenceGateForModel(gate = {}) {
  const item = asObject(gate);
  return compactObject({
    ok: item.ok === true,
    decision: item.decision || "",
    evidenceCount: item.evidenceCount,
    sourceCount: item.sourceCount,
    distinctDocumentCount: item.distinctDocumentCount,
    semanticSupport: item.semanticSupport
      ? {
          verdict: item.semanticSupport.verdict,
          supportedClaimCount: item.semanticSupport.supportedClaimCount,
          unsupportedClaimCount: item.semanticSupport.unsupportedClaimCount
        }
      : null,
    recommendations: asArray(item.recommendations).slice(0, 6).map((entry) => truncateForModel(entry, 220))
  });
}

function compactGoldenRuleForModel(decision = {}) {
  const item = asObject(decision);
  return compactObject({
    decision: item.decision || "",
    selectedRule: item.selectedRule
      ? {
          ruleId: item.selectedRule.ruleId,
          title: truncateForModel(item.selectedRule.title, 180)
        }
      : null,
    recommendations: asArray(item.recommendations).slice(0, 6).map((entry) => truncateForModel(entry, 220)),
    reasons: asArray(item.reasons).slice(0, 6).map((entry) => truncateForModel(entry, 220))
  });
}

function rawCorpusBatchPayload(batch = {}, items = [], maxCharacters = 16000) {
  const safeMax = Math.max(4000, Math.min(Number(maxCharacters || 16000), 50000));
  const indexes = asArray(batch.itemIndexes);
  const selectedItems = indexes.length
    ? indexes.map((index) => items[index]).filter(Boolean)
    : [];
  const perDocumentMax = Math.max(1000, Math.min(8000, Math.floor(safeMax / Math.max(1, selectedItems.length))));
  let remaining = safeMax;
  const documents = [];
  for (const item of selectedItems) {
    const compact = compactDistillationItemForModel(item, perDocumentMax);
    const text = String(compact.text || "").slice(0, Math.max(0, remaining));
    remaining -= text.length;
    documents.push({
      ...compact,
      text,
      textTruncated: compact.textTruncated || text.length < String(compact.text || "").length
    });
    if (remaining <= 0) {
      break;
    }
  }
  return {
    batchNumber: batch.batchNumber,
    documentCount: batch.documentCount,
    characterCount: batch.characterCount,
    itemIndexes: indexes,
    modelCharacterCount: documents.reduce((sum, document) => sum + String(document.text || "").length, 0),
    sources: asArray(batch.sources),
    documents,
    truncatedForModel: documents.length < selectedItems.length || documents.some((document) => document.textTruncated)
  };
}

function normalizeBatchFinding(value = {}, index = 0) {
  const finding = asObject(value);
  const statement = normalizeText(
    finding.statement ||
      finding.text ||
      finding.summary ||
      finding.fact ||
      finding.claim ||
      value
  );
  return compactObject({
    findingId: normalizeText(finding.findingId || finding.id) || `finding_${index + 1}`,
    statement,
    importance: normalizeText(finding.importance || finding.priority || ""),
    confidence: Number(finding.confidence || 0),
    citations: asArray(finding.citations || finding.sources).map((entry) => normalizeText(entry)).filter(Boolean).slice(0, 8)
  });
}

function normalizeRawCorpusBatchExtract({ decision, batchPayload, fallbackSummary = "" } = {}) {
  const output = asObject(decision?.decision || decision);
  const findings = asArray(
    output.coreFindings ||
      output.findings ||
      output.facts ||
      output.claims ||
      output.keyPoints
  )
    .map(normalizeBatchFinding)
    .filter((finding) => finding.statement);
  const documentTitles = asArray(batchPayload.documents)
    .map((document) => normalizeText(document.title))
    .filter(Boolean);
  const summary = normalizeText(
    output.summary ||
      output.batchSummary ||
      fallbackSummary ||
      `批次 ${batchPayload.batchNumber} 覆盖 ${batchPayload.documentCount} 份原始材料。`
  );
  return compactObject({
    batchNumber: batchPayload.batchNumber,
    sourceIndexes: asArray(batchPayload.itemIndexes).map(Number),
    summary,
    coreFindings: findings.slice(0, 12),
    coverage: {
      documentCount: batchPayload.documentCount,
      characterCount: batchPayload.characterCount,
      modelCharacterCount: batchPayload.modelCharacterCount,
      truncatedForModel: batchPayload.truncatedForModel,
      documentTitles: documentTitles.slice(0, 20)
    },
    risks: asArray(output.risks || output.gaps || output.openQuestions)
      .map((entry) => normalizeText(entry.text || entry.summary || entry))
      .filter(Boolean)
      .slice(0, 8),
    model: {
      usedModel: decision?.usedModel === true,
      degraded: decision?.degraded === true,
      roleId: decision?.roleId || "knowledge_raw_batch_extractor",
      audit: decision?.audit || null
    }
  });
}

function summarizeRawBatchExtracts(batchExtracts = []) {
  const extracts = asArray(batchExtracts);
  const processedBatchCount = extracts.length;
  const documentCount = extracts.reduce((sum, item) => sum + Number(item.coverage?.documentCount || 0), 0);
  const characterCount = extracts.reduce((sum, item) => sum + Number(item.coverage?.characterCount || 0), 0);
  const findingCount = extracts.reduce((sum, item) => sum + asArray(item.coreFindings).length, 0);
  return {
    processedBatchCount,
    documentCount,
    characterCount,
    findingCount,
    truncatedForModel: extracts.some((item) => item.coverage?.truncatedForModel === true),
    usedModelCount: extracts.filter((item) => item.model?.usedModel === true).length
  };
}

async function mapConcurrent(items, mapper, concurrency = 3) {
  const limit = Math.max(1, concurrency);
  const results = [];
  const executing = new Set();
  for (const item of items) {
    const p = Promise.resolve().then(() => mapper(item));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

function clamp01(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, number));
}

function parseTemporalTimestamp(value = "") {
  const normalized = normalizeText(value);
  if (!normalized) {
    return 0;
  }
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function temporalCandidatesForItem(item = {}) {
  const locator = asObject(item.sourceLocator);
  const metadata = asObject(item.metadata || item.documentMetadata || item.sourceMetadata);
  return [
    locator.capturedAt,
    locator.sourceUpdatedAt,
    locator.sourceCreatedAt,
    locator.sourceCollectedAt,
    locator.createdAt,
    locator.updatedAt,
    item.capturedAt,
    item.sourceUpdatedAt,
    item.sourceCreatedAt,
    item.sourceCollectedAt,
    item.createdAt,
    item.updatedAt,
    metadata.capturedAt,
    metadata.sourceUpdatedAt,
    metadata.sourceCreatedAt,
    metadata.createdAt,
    metadata.updatedAt
  ].map(normalizeText).filter(Boolean);
}

function temporalMetadataForItem(item = {}, index = 0, referenceTimestamp = 0, options = {}) {
  const candidates = temporalCandidatesForItem(item);
  const timestamp = candidates.map(parseTemporalTimestamp).find((value) => value > 0) || 0;
  const halfLifeDays = Math.max(
    1,
    Number(options.halfLifeDays || DEFAULT_TEMPORAL_DECAY_HALF_LIFE_DAYS)
  );
  const floor = clamp01(options.floor ?? DEFAULT_TEMPORAL_DECAY_FLOOR, DEFAULT_TEMPORAL_DECAY_FLOOR);
  const effectiveReference = referenceTimestamp > 0 ? referenceTimestamp : timestamp;
  const ageDays = timestamp > 0 && effectiveReference > 0
    ? Math.max(0, (effectiveReference - timestamp) / 86400000)
    : null;
  const rawWeight = ageDays === null ? floor : Math.pow(0.5, ageDays / halfLifeDays);
  const temporalWeight = Number((floor + (1 - floor) * rawWeight).toFixed(6));
  return {
    timestamp,
    iso: timestamp ? new Date(timestamp).toISOString() : "",
    detected: timestamp > 0,
    candidates,
    sourceOrder: index + 1,
    ageDays: ageDays === null ? null : Number(ageDays.toFixed(4)),
    halfLifeDays,
    floor,
    temporalWeight
  };
}

function estimateImportanceScore(item = {}, text = "", query = "") {
  const haystack = normalizeText([
    item.title,
    item.snippet,
    text,
    asArray(item.reasons).join(" ")
  ].filter(Boolean).join(" "));
  const tokens = tokenize(haystack);
  const queryTokens = tokenize(query);
  const queryOverlap = queryTokens.length ? jaccard(tokens, queryTokens) : 0;
  const lengthScore = Math.min(1, Math.log10(Math.max(10, haystack.length)) / 5);
  const evidenceDensity = Math.min(1, asArray(item.blocks).length / 8 + asArray(item.assets).length / 12);
  const decisionLanguage = /(must|should|required|decision|risk|impact|blocker|critical|accepted|rejected|必须|应当|需要|决策|结论|风险|影响|阻断|关键|验收|失败|通过)/i.test(haystack)
    ? 0.22
    : 0;
  const titleBoost = /(design|protocol|decision|scenario|requirement|audit|plan|设计|协议|决策|场景|需求|审计|计划)/i.test(item.title || "")
    ? 0.12
    : 0;
  return Number(clamp01(0.22 + lengthScore * 0.24 + queryOverlap * 0.24 + evidenceDensity * 0.18 + decisionLanguage + titleBoost).toFixed(6));
}

function cosineSimilarity(left = [], right = []) {
  const length = Math.min(asArray(left).length, asArray(right).length);
  if (!length) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const a = Number(left[index] || 0);
    const b = Number(right[index] || 0);
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denominator > 0 ? dot / denominator : 0;
}

function mergeCentroid(current = [], next = [], currentCount = 1) {
  const length = Math.max(asArray(current).length, asArray(next).length);
  if (!length) {
    return [];
  }
  const merged = [];
  for (let index = 0; index < length; index += 1) {
    const left = Number(current[index] || 0);
    const right = Number(next[index] || 0);
    merged.push((left * currentCount + right) / (currentCount + 1));
  }
  const norm = Math.sqrt(merged.reduce((sum, value) => sum + value * value, 0)) || 1;
  return merged.map((value) => Number((value / norm).toFixed(6)));
}

function temporalAffinity(left = {}, right = {}) {
  const leftTimestamp = Number(left.timestamp || 0);
  const rightTimestamp = Number(right.timestamp || 0);
  if (!leftTimestamp || !rightTimestamp) {
    return 0.5;
  }
  const distanceDays = Math.abs(leftTimestamp - rightTimestamp) / 86400000;
  return Number(Math.exp(-distanceDays / 180).toFixed(6));
}

function pathAffinity(left = {}, right = {}) {
  const leftPath = normalizeText(left.sourceLocator?.sourcePath || left.title || "");
  const rightPath = normalizeText(right.sourceLocator?.sourcePath || right.title || "");
  if (!leftPath || !rightPath) {
    return 0;
  }
  const leftParts = leftPath.split(/[\\/]+/).filter(Boolean);
  const rightParts = rightPath.split(/[\\/]+/).filter(Boolean);
  let shared = 0;
  const length = Math.min(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      break;
    }
    shared += 1;
  }
  return shared ? Math.min(1, shared / Math.max(leftParts.length, rightParts.length)) : 0;
}

function embeddingForDistillationItem(embeddingRuntime, item = {}) {
  const text = textForDistillationItem(item);
  try {
    const embedded = embeddingRuntime?.embedJointEvidence
      ? embeddingRuntime.embedJointEvidence({ ...item, text, content: text })
      : embeddingRuntime?.embedText?.({ ...item, text, content: text });
    return {
      vector: asArray(embedded?.vector).map(Number),
      providerId: embedded?.providerId || embedded?.provider || "",
      dimension: Number(embedded?.dimension || asArray(embedded?.vector).length || 0),
      offlineFallback: embedded?.offlineFallback === true
    };
  } catch {
    return {
      vector: [],
      providerId: "",
      dimension: 0,
      offlineFallback: false
    };
  }
}

function buildSourcePlan(items = [], {
  query = "",
  embeddingRuntime = null,
  mergeStrategy = "timeline_then_topic",
  halfLifeDays = DEFAULT_TEMPORAL_DECAY_HALF_LIFE_DAYS,
  floor = DEFAULT_TEMPORAL_DECAY_FLOOR
} = {}) {
  const inputItems = asArray(items);
  const timestamps = inputItems
    .flatMap((item) => temporalCandidatesForItem(item).map(parseTemporalTimestamp))
    .filter((value) => value > 0);
  const referenceTimestamp = timestamps.length ? Math.max(...timestamps) : Date.now();
  const enriched = inputItems.map((item, index) => {
    const text = textForDistillationItem(item);
    const temporal = temporalMetadataForItem(item, index, referenceTimestamp, { halfLifeDays, floor });
    const importanceScore = estimateImportanceScore(item, text, query);
    const decayedImportanceScore = Number((importanceScore * temporal.temporalWeight).toFixed(6));
    const embedding = embeddingForDistillationItem(embeddingRuntime, item);
    return {
      ...item,
      __distillation: {
        originalIndex: index,
        textLength: text.length,
        temporal,
        importanceScore,
        decayedImportanceScore,
        embeddingVector: embedding.vector,
        embeddingProviderId: embedding.providerId,
        embeddingDimension: embedding.dimension,
        embeddingOfflineFallback: embedding.offlineFallback
      }
    };
  });
  const orderedItems = enriched.slice().sort((left, right) => {
    const leftTemporal = left.__distillation?.temporal || {};
    const rightTemporal = right.__distillation?.temporal || {};
    if (mergeStrategy === "source_order") {
      return Number(leftTemporal.sourceOrder || 0) - Number(rightTemporal.sourceOrder || 0);
    }
    const leftTimestamp = Number(leftTemporal.timestamp || 0) || Number.MAX_SAFE_INTEGER;
    const rightTimestamp = Number(rightTemporal.timestamp || 0) || Number.MAX_SAFE_INTEGER;
    return (
      leftTimestamp - rightTimestamp ||
      String(left.sourceLocator?.sourcePath || left.title || "").localeCompare(String(right.sourceLocator?.sourcePath || right.title || "")) ||
      Number(leftTemporal.sourceOrder || 0) - Number(rightTemporal.sourceOrder || 0)
    );
  });
  const knownTimeline = orderedItems
    .map((item) => item.__distillation?.temporal)
    .filter((temporal) => temporal?.detected);
  const chronological = knownTimeline.every((temporal, index) =>
    index === 0 || Number(knownTimeline[index - 1].timestamp || 0) <= Number(temporal.timestamp || 0)
  );
  return {
    protocolVersion: KNOWLEDGE_DISTILLATION_ALGORITHM_VERSION,
    strategy: mergeStrategy,
    referenceTimestamp: new Date(referenceTimestamp).toISOString(),
    halfLifeDays,
    floor,
    items: orderedItems,
    publicItems: orderedItems.map((item, index) => {
      const meta = item.__distillation || {};
      const temporal = meta.temporal || {};
      return compactObject({
        sourceOrder: index + 1,
        originalIndex: meta.originalIndex,
        title: item.title,
        evidenceId: item.evidenceId,
        documentId: item.documentId,
        sourcePath: item.sourceLocator?.sourcePath || "",
        capturedAt: temporal.iso,
        timestampDetected: temporal.detected === true,
        ageDays: temporal.ageDays,
        importanceScore: meta.importanceScore,
        temporalWeight: temporal.temporalWeight,
        decayedImportanceScore: meta.decayedImportanceScore,
        embeddingProviderId: meta.embeddingProviderId,
        embeddingDimension: meta.embeddingDimension,
        textLength: meta.textLength
      });
    }),
    timeline: {
      knownTimestampCount: knownTimeline.length,
      unknownTimestampCount: orderedItems.length - knownTimeline.length,
      chronological,
      oldestAt: knownTimeline[0]?.iso || "",
      newestAt: knownTimeline.at(-1)?.iso || ""
    }
  };
}

function distillationItemSimilarity(item = {}, cluster = {}) {
  const vector = item.__distillation?.embeddingVector || [];
  const centroid = cluster.centroid || [];
  const semantic = cosineSimilarity(vector, centroid);
  const lexical = jaccard(item.tokens, cluster.tokens);
  const sameDocument = item.documentId && cluster.documentIds.includes(item.documentId) ? 0.12 : 0;
  const sourcePath = Math.max(...asArray(cluster.items).map((entry) => pathAffinity(item, entry)), 0);
  const temporal = Math.max(...asArray(cluster.items).map((entry) =>
    temporalAffinity(item.__distillation?.temporal, entry.__distillation?.temporal)
  ), 0.5);
  const combined = semantic > 0
    ? semantic * 0.62 + lexical * 0.2 + temporal * 0.1 + sourcePath * 0.08 + sameDocument
    : lexical * 0.55 + temporal * 0.2 + sourcePath * 0.13 + sameDocument;
  return {
    semantic: Number(semantic.toFixed(6)),
    lexical: Number(lexical.toFixed(6)),
    temporal: Number(temporal.toFixed(6)),
    sourcePath: Number(sourcePath.toFixed(6)),
    combined: Number(Math.min(1, combined).toFixed(6))
  };
}

function timelineForItems(items = []) {
  const ordered = asArray(items).slice().sort((left, right) => {
    const leftTimestamp = Number(left.__distillation?.temporal?.timestamp || 0) || Number.MAX_SAFE_INTEGER;
    const rightTimestamp = Number(right.__distillation?.temporal?.timestamp || 0) || Number.MAX_SAFE_INTEGER;
    return (
      leftTimestamp - rightTimestamp ||
      Number(left.__distillation?.temporal?.sourceOrder || 0) - Number(right.__distillation?.temporal?.sourceOrder || 0)
    );
  });
  const entries = ordered.map((item, index) => {
    const temporal = item.__distillation?.temporal || {};
    return compactObject({
      order: index + 1,
      title: item.title,
      evidenceId: item.evidenceId,
      sourcePath: item.sourceLocator?.sourcePath || "",
      capturedAt: temporal.iso,
      timestampDetected: temporal.detected === true,
      importanceScore: item.__distillation?.importanceScore,
      temporalWeight: temporal.temporalWeight,
      decayedImportanceScore: item.__distillation?.decayedImportanceScore
    });
  });
  const known = entries.filter((entry) => entry.timestampDetected);
  return {
    knownTimestampCount: known.length,
    unknownTimestampCount: entries.length - known.length,
    chronological: known.every((entry, index) =>
      index === 0 || String(known[index - 1].capturedAt || "") <= String(entry.capturedAt || "")
    ),
    firstAt: known[0]?.capturedAt || "",
    lastAt: known.at(-1)?.capturedAt || "",
    entries
  };
}

function finalizeDistillationCluster(cluster = {}) {
  const terms = representativeTerms(cluster.items, 8);
  const timeline = timelineForItems(cluster.items);
  const decayedImportanceScore = Number(
    (asArray(cluster.items).reduce((sum, item) => sum + Number(item.__distillation?.decayedImportanceScore || 0), 0) /
      Math.max(1, asArray(cluster.items).length)).toFixed(6)
  );
  return {
    ...cluster,
    label: terms.slice(0, 4).map((item) => item.term).join(" ") || cluster.items[0]?.title || cluster.clusterId,
    terms,
    timeline,
    decayedImportanceScore,
    evidenceRefs: [...new Set(cluster.items.map((item) => item.evidenceId).filter(Boolean))],
    sourceTrace: sourceTraceForItems(cluster.items)
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

  // Cross-document co-reference / entity alignment
  const sortedTerms = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const canonicalMap = new Map();

  for (let i = 0; i < sortedTerms.length; i++) {
    const [termA] = sortedTerms[i];
    if (canonicalMap.has(termA)) continue;

    let canonical = termA;
    for (let j = i + 1; j < sortedTerms.length; j++) {
      const [termB] = sortedTerms[j];
      if (canonicalMap.has(termB)) continue;

      // Singular/plural matching (trailing s)
      const isPluralMatch = termA === termB + "s" || termB === termA + "s";

      // Suffix/prefix/substring matching for compounds
      const isSubstringMatch = (termA.length > 4 && termB.length > 4) &&
        (termA.includes(termB) || termB.includes(termA));

      if (isPluralMatch || isSubstringMatch) {
        canonical = termA.length >= termB.length ? termA : termB;
        canonicalMap.set(termB, canonical);
        canonicalMap.set(termA, canonical);
      }
    }
    if (!canonicalMap.has(termA)) {
      canonicalMap.set(termA, termA);
    }
  }

  const consolidatedCounts = new Map();
  for (const [term, count] of counts.entries()) {
    const canonical = canonicalMap.get(term) || term;
    consolidatedCounts.set(canonical, (consolidatedCounts.get(canonical) || 0) + count);
  }

  return [...consolidatedCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

function clusterEvidenceItems(items = [], options = {}) {
  const threshold = Number(options.threshold ?? 0.58);
  const rejectThreshold = Number(options.rejectThreshold ?? 0.42);
  const maxClusters = Math.max(1, Math.min(Number(options.maxClusters || 8), 50));
  const mergeStrategy = normalizeText(options.mergeStrategy || "timeline_then_topic");
  const clusters = [];
  for (const item of items) {
    let bestCluster = null;
    let bestScore = { combined: 0 };
    for (const cluster of clusters) {
      const score = distillationItemSimilarity(item, cluster);
      if (score.combined > bestScore.combined) {
        bestScore = score;
        bestCluster = cluster;
      }
    }
    if (bestCluster && bestScore.combined >= threshold) {
      bestCluster.items.push(item);
      bestCluster.tokens = [...new Set([...bestCluster.tokens, ...(item.tokens || [])])].slice(0, 256);
      bestCluster.centroid = mergeCentroid(bestCluster.centroid, item.__distillation?.embeddingVector || [], bestCluster.items.length - 1);
      if (item.documentId && !bestCluster.documentIds.includes(item.documentId)) {
        bestCluster.documentIds.push(item.documentId);
      }
      bestCluster.score = Number(Math.max(bestCluster.score, bestScore.combined).toFixed(6));
      bestCluster.similarity = bestScore;
      continue;
    }
    if (clusters.length >= maxClusters) {
      const target = bestCluster && bestScore.combined >= rejectThreshold
        ? bestCluster
        : clusters.slice().sort((left, right) => left.items.length - right.items.length)[0];
      target.items.push(item);
      target.tokens = [...new Set([...target.tokens, ...(item.tokens || [])])].slice(0, 256);
      target.centroid = mergeCentroid(target.centroid, item.__distillation?.embeddingVector || [], target.items.length - 1);
      target.score = Number(Math.max(target.score, bestScore.combined || 0).toFixed(6));
      continue;
    }
    clusters.push({
      clusterId: stableId("skill_cluster", item.evidenceId || item.title, clusters.length),
      score: 1,
      tokens: asArray(item.tokens).slice(0, 128),
      centroid: asArray(item.__distillation?.embeddingVector),
      documentIds: item.documentId ? [item.documentId] : [],
      items: [item]
    });
  }
  return clusters
    .map(finalizeDistillationCluster)
    .sort((left, right) => {
      if (mergeStrategy === "topic_then_timeline") {
        return (
          right.decayedImportanceScore - left.decayedImportanceScore ||
          (Date.parse(left.timeline.firstAt || "") || Number.MAX_SAFE_INTEGER) - (Date.parse(right.timeline.firstAt || "") || Number.MAX_SAFE_INTEGER)
        );
      }
      if (mergeStrategy === "source_order") {
        return (
          Number(left.items[0]?.__distillation?.originalIndex || 0) -
          Number(right.items[0]?.__distillation?.originalIndex || 0)
        );
      }
      return (
        (Date.parse(left.timeline.firstAt || "") || Number.MAX_SAFE_INTEGER) - (Date.parse(right.timeline.firstAt || "") || Number.MAX_SAFE_INTEGER) ||
        right.decayedImportanceScore - left.decayedImportanceScore ||
        right.items.length - left.items.length
      );
    })
}

function clusterRawCorpusItems(items = [], query = "", options = {}) {
  const corpusItems = asArray(items);
  if (options.singleDocumentBundle === true) {
    const terms = representativeTerms(corpusItems, 12);
    return [
      finalizeDistillationCluster({
        clusterId: stableId("raw_corpus_cluster", query, corpusItems.map((item) => item.evidenceId || item.title).join("\n")),
        score: 1,
        tokens: [...new Set(corpusItems.flatMap((item) => asArray(item.tokens)))].slice(0, 256),
        centroid: [],
        documentIds: [...new Set(corpusItems.map((item) => item.documentId).filter(Boolean))],
        items: corpusItems,
        label: normalizeText(query || terms.slice(0, 4).map((item) => item.term).join(" ") || "原始语料蒸馏"),
        terms
      })
    ];
  }
  return clusterEvidenceItems(corpusItems, {
    threshold: options.threshold ?? 0.54,
    rejectThreshold: options.rejectThreshold ?? 0.38,
    maxClusters: options.maxClusters || Math.min(12, Math.max(2, Math.ceil(Math.sqrt(Math.max(1, corpusItems.length))))),
    mergeStrategy: options.mergeStrategy || "timeline_then_topic"
  });
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

function sourceOrderForItem(item = {}, index = 0) {
  const blockPositions = asArray(item.blocks)
    .map((block) => Number(block.position || 0))
    .filter((position) => Number.isFinite(position) && position > 0);
  const range = asObject(item.hierarchy?.sourceRange || item.sourceLocator?.sourceRange);
  const sourceRangeStart = Number(range.blockStart || range.startLine || range.page || 0);
  const position = blockPositions.length
    ? Math.min(...blockPositions)
    : Number.isFinite(sourceRangeStart) && sourceRangeStart > 0
      ? sourceRangeStart
      : Number(item.rank || index + 1);
  return {
    capturedAt: normalizeText(item.__distillation?.temporal?.iso || item.sourceLocator?.capturedAt || ""),
    document: normalizeText(item.sourceLocator?.sourcePath || item.title || item.sourceKey || ""),
    position: Number.isFinite(position) ? position : index + 1,
    rank: Number(item.rank || index + 1)
  };
}

function portableCitationForItem(item = {}, index = 0) {
  const citation = citationForItem(item);
  const source = asObject(citation.source);
  const hierarchy = asObject(item.hierarchy);
  const hierarchyPath = asArray(hierarchy.path || hierarchy.headingPath)
    .map((entry) => normalizeText(entry))
    .filter(Boolean)
    .join(" > ");
  return compactObject({
    citationKey: `C${index + 1}`,
    title: normalizeText(citation.title || item.title || ""),
    excerpt: normalizeText(citation.snippet || item.snippet || item.summary || item.text || "").slice(0, 900),
    source: compactObject({
      sourceType: source.sourceType || "",
      provider: source.providerId || "",
      originalFileName: source.originalFileName || "",
      sourcePath: source.sourcePath || "",
      capturedAt: source.capturedAt || "",
      contentHash: source.contentHash || ""
    }),
    positionHint: compactObject({
      titlePath: hierarchyPath,
      sectionTitle: normalizeText(hierarchy.title || hierarchy.sectionTitle || item.sectionTitle || "")
    })
  });
}

function dedupePortableSources(citations = []) {
  const byKey = new Map();
  for (const citation of asArray(citations)) {
    const source = asObject(citation.source);
    const key = JSON.stringify(source);
    if (!key || key === "{}") {
      continue;
    }
    if (!byKey.has(key)) {
      byKey.set(key, {
        sourceLabel: `S${byKey.size + 1}`,
        ...source
      });
    }
  }
  return [...byKey.values()];
}

function escapeMarkdown(text = "") {
  return String(text || "").replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

function markdownForPortableBlock(block = {}) {
  const type = normalizeText(block.type);
  if (type === "heading") {
    const level = Math.max(1, Math.min(Number(block.level || 2), 6));
    return `${"#".repeat(level)} ${block.text || "未命名段落"}`;
  }
  if (type === "image") {
    const altText = block.altText || block.title || "image";
    const lines = [];
    if (block.dataUrl) {
      lines.push(`![${escapeMarkdown(altText)}](${block.dataUrl})`);
    } else {
      lines.push(`**图片：${block.title || altText}**`);
      lines.push("");
      lines.push("图片二进制未嵌入；本块保留标题、说明、OCR 和哈希，导出器有原始资产时应在同一位置嵌入图片。");
    }
    if (block.caption) {
      lines.push("");
      lines.push(block.caption);
    }
    if (block.ocrText) {
      lines.push("");
      lines.push(`OCR：${block.ocrText}`);
    }
    return lines.join("\n");
  }
  if (type === "quote") {
    return normalizeText(block.text)
      .split(/\n+/)
      .map((line) => `> ${line}`)
      .join("\n");
  }
  if (type === "list") {
    return asArray(block.items).map((item) => `- ${item}`).join("\n");
  }
  return block.text || "";
}

function renderPortableMarkdown(blocks = []) {
  return asArray(blocks)
    .slice()
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
    .map(markdownForPortableBlock)
    .filter((entry) => normalizeText(entry))
    .join("\n\n");
}

function portableAssetBlock(asset = {}, citationKey = "", order = 1) {
  return compactObject({
    order,
    type: "image",
    title: normalizeText(asset.title || asset.caption || "图片"),
    altText: normalizeText(asset.altText || asset.title || asset.caption || "图片"),
    caption: normalizeText(asset.caption || ""),
    ocrText: normalizeText(asset.ocrText || ""),
    mediaType: normalizeText(asset.mediaType || ""),
    dataUrl: normalizeText(asset.dataUrl || ""),
    embedded: Boolean(asset.dataUrl),
    contentHash: normalizeText(asset.sha256 || ""),
    byteSize: Number(asset.byteSize || 0),
    width: Number(asset.width || 0),
    height: Number(asset.height || 0),
    citations: citationKey ? [citationKey] : []
  });
}

function buildOrderedDocumentBlocks({
  title,
  summaryText,
  orderedItems,
  citations,
  portableRules,
  portableRelations,
  rawCorpusBatchExtracts,
  timeline
} = {}) {
  const blocks = [];
  const push = (block) => {
    blocks.push(compactObject({
      order: blocks.length + 1,
      ...block
    }));
  };
  push({ type: "heading", level: 1, text: title });
  if (summaryText) {
    push({
      type: "paragraph",
      text: summaryText,
      citations: asArray(citations).map((citation) => citation.citationKey)
    });
  }
  const timelineEntries = asArray(timeline?.entries).filter((entry) => entry.timestampDetected);
  if (timelineEntries.length) {
    push({ type: "heading", level: 2, text: "时间线" });
    push({
      type: "list",
      items: timelineEntries.slice(0, 40).map((entry) =>
        [
          entry.capturedAt,
          entry.title || entry.sourcePath || entry.evidenceId,
          `重要度 ${Number(entry.importanceScore || 0).toFixed(2)}`,
          `时间衰减后 ${Number(entry.decayedImportanceScore || 0).toFixed(2)}`
        ].filter(Boolean).join(" - ")
      )
    });
  }
  const batchExtractLines = asArray(rawCorpusBatchExtracts)
    .map((extract) => {
      const findings = asArray(extract.coreFindings)
        .map((finding) => normalizeText(finding.statement))
        .filter(Boolean)
        .slice(0, 4);
      const summary = normalizeText(extract.summary);
      return [
        `批次 ${extract.batchNumber || "?"}`,
        summary,
        findings.length ? `核心点：${findings.join("；")}` : ""
      ].filter(Boolean).join(" - ");
    })
    .filter(Boolean);
  if (batchExtractLines.length) {
    push({ type: "heading", level: 2, text: "分批核心提炼" });
    push({
      type: "list",
      items: batchExtractLines
    });
  }
  for (const [index, item] of asArray(orderedItems).entries()) {
    const citationKey = citations[index]?.citationKey || "";
    const hierarchy = asObject(item.hierarchy);
    const titlePath = asArray(hierarchy.path || hierarchy.headingPath)
      .map((entry) => normalizeText(entry))
      .filter(Boolean);
    const blockText = normalizeDocumentText(
      asArray(item.blocks).map((block) => block.text || block.title).filter(Boolean).join("\n\n") ||
        item.snippet ||
        item.markdown
    );
    if (item.title) {
      push({
        type: "heading",
        level: 2,
        text: item.title,
        citations: citationKey ? [citationKey] : []
      });
    }
    if (blockText) {
      push({
        type: "paragraph",
        text: blockText,
        citations: citationKey ? [citationKey] : [],
        positionHint: compactObject({
          titlePath,
          sectionTitle: normalizeText(hierarchy.title || hierarchy.sectionTitle || item.sectionTitle || "")
        })
      });
    }
    for (const asset of asArray(item.assets)) {
      push(portableAssetBlock(asset, citationKey));
    }
  }
  if (asArray(portableRules).length) {
    push({ type: "heading", level: 2, text: "规则候选" });
    push({
      type: "list",
      items: asArray(portableRules).map((rule) =>
        [rule.title, rule.condition ? `条件：${rule.condition}` : "", rule.action ? `动作：${rule.action}` : ""]
          .filter(Boolean)
          .join("；")
      )
    });
  }
  if (asArray(portableRelations).length) {
    push({ type: "heading", level: 2, text: "实体关系候选" });
    push({
      type: "list",
      items: asArray(portableRelations).map((relation) =>
        `${relation.sourceTerm} ${relation.relationType} ${relation.targetTerm}（confidence=${relation.confidence}）`
      )
    });
  }
  if (asArray(citations).length) {
    push({ type: "heading", level: 2, text: "引用与证据摘录" });
    for (const citation of citations) {
      push({
        type: "quote",
        text: `[${citation.citationKey}] ${[citation.title, citation.excerpt].filter(Boolean).join("：")}`,
        citations: [citation.citationKey]
      });
    }
  }
  return blocks;
}

function portableTimelineForDocument(timeline = {}) {
  const source = asObject(timeline);
  return compactObject({
    knownTimestampCount: Number(source.knownTimestampCount || 0),
    unknownTimestampCount: Number(source.unknownTimestampCount || 0),
    chronological: source.chronological === true,
    firstAt: normalizeText(source.firstAt || ""),
    lastAt: normalizeText(source.lastAt || ""),
    entries: asArray(source.entries).map((entry, index) => compactObject({
      order: Number(entry.order || index + 1),
      title: normalizeText(entry.title || ""),
      sourcePath: normalizeText(entry.sourcePath || ""),
      capturedAt: normalizeText(entry.capturedAt || ""),
      timestampDetected: entry.timestampDetected === true,
      importanceScore: Number(entry.importanceScore || 0),
      temporalWeight: Number(entry.temporalWeight || 0),
      decayedImportanceScore: Number(entry.decayedImportanceScore || 0)
    }))
  });
}

function findPortableDocumentFrameworkDependencies(value, pathParts = []) {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      findings.push(...findPortableDocumentFrameworkDependencies(entry, [...pathParts, String(index)]));
    });
    return findings;
  }
  if (!value || typeof value !== "object") {
    return findings;
  }
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = [...pathParts, key];
    if (PORTABLE_DOCUMENT_FORBIDDEN_KEYS.has(key)) {
      findings.push(nextPath.join("."));
    }
    findings.push(...findPortableDocumentFrameworkDependencies(entry, nextPath));
  }
  return findings;
}

function buildPortableDistillationDocument({
  query,
  title,
  cluster,
  summaryText,
  ruleCandidates,
  entityRelationCandidates,
  rawCorpusBatchExtracts
} = {}) {
  const safeTitle = normalizeText(title || cluster?.label || query || "Distilled Knowledge");
  const orderedItems = asArray(cluster?.items)
    .slice()
    .sort((left, right) => {
      const leftOrder = sourceOrderForItem(left);
      const rightOrder = sourceOrderForItem(right);
      return (
        leftOrder.capturedAt.localeCompare(rightOrder.capturedAt) ||
        leftOrder.document.localeCompare(rightOrder.document) ||
        leftOrder.position - rightOrder.position ||
        leftOrder.rank - rightOrder.rank
      );
    });
  const citations = orderedItems
    .map(portableCitationForItem)
    .filter((citation) => citation.excerpt || citation.title);
  const citationKeys = citations.map((citation) => citation.citationKey);
  const portableTimeline = portableTimelineForDocument(cluster?.timeline || {});
  const portableRules = asArray(ruleCandidates).map((rule, index) => ({
    ruleKey: `R${index + 1}`,
    title: normalizeText(rule.title || ""),
    condition: normalizeText(rule.condition || ""),
    action: normalizeText(rule.action || ""),
    citations: citationKeys
  }));
  const portableRelations = asArray(entityRelationCandidates).map((relation, index) => ({
    relationKey: `ER${index + 1}`,
    sourceTerm: normalizeText(relation.sourceTerm || ""),
    targetTerm: normalizeText(relation.targetTerm || ""),
    relationType: normalizeText(relation.relationType || ""),
    confidence: Number(relation.confidence || 0),
    citations: citationKeys
  }));
  const contentBlocks = buildOrderedDocumentBlocks({
    title: safeTitle,
    summaryText,
    orderedItems,
    citations,
      portableRules,
      portableRelations,
      rawCorpusBatchExtracts,
      timeline: portableTimeline
    });
  const markdown = renderPortableMarkdown(contentBlocks);
  return {
    protocolVersion: PORTABLE_DISTILLATION_DOCUMENT_PROTOCOL_VERSION,
    artifactType: "portable-distilled-knowledge-document",
    selfContained: true,
    runtimeDependencies: [],
    outputFormats: ["markdown", "docx"],
    title: safeTitle,
    sourceQuery: normalizeText(query || ""),
    contentBlocks,
    markdown,
    summary: {
      text: normalizeText(summaryText || ""),
      citations: citationKeys
    },
    timeline: portableTimeline,
    temporalImportance: {
      clusterDecayedImportanceScore: Number(cluster?.decayedImportanceScore || 0),
      knownTimestampCount: Number(cluster?.timeline?.knownTimestampCount || 0),
      unknownTimestampCount: Number(cluster?.timeline?.unknownTimestampCount || 0),
      chronological: cluster?.timeline?.chronological === true
    },
    ruleCandidates: portableRules,
    entityRelationCandidates: portableRelations,
    citations,
    evidenceAppendix: citations.map((citation) => ({
      citationKey: citation.citationKey,
      title: citation.title,
      excerpt: citation.excerpt,
      source: citation.source,
      positionHint: citation.positionHint
    })),
    sourceBibliography: dedupePortableSources(citations),
    portability: {
      independentUse: true,
      requiresRuntime: false,
      requiresEvidenceLookup: false,
      note: "This document is ordered and readable outside the source system. Citations and evidence excerpts are embedded in the artifact."
    },
    integrity: {
      citationCount: citations.length,
      contentBlockCount: contentBlocks.length,
      rawCorpusBatchExtractCount: asArray(rawCorpusBatchExtracts).length,
      evidenceDigest: stableHash(...citations.map((citation) => `${citation.title}\n${citation.excerpt}`))
    }
  };
}

function validatePortableDocument(document = {}) {
  const doc = asObject(document);
  const citations = asArray(doc.citations);
  const appendix = asArray(doc.evidenceAppendix);
  const contentBlocks = asArray(doc.contentBlocks);
  const forbiddenPaths = findPortableDocumentFrameworkDependencies(doc);
  const sequentialOrders = contentBlocks.every((block, index) => Number(block.order || 0) === index + 1);
  const checks = [
    {
      id: "portable_document_self_contained",
      passed: doc.selfContained === true && asArray(doc.runtimeDependencies).length === 0,
      actual: {
        selfContained: doc.selfContained === true,
        runtimeDependencyCount: asArray(doc.runtimeDependencies).length
      },
      expected: "selfContained=true and runtimeDependencies=[]"
    },
    {
      id: "portable_document_has_readable_evidence",
      passed:
        citations.length > 0 &&
        appendix.length > 0 &&
        citations.every((citation) => normalizeText(citation.excerpt || "").length > 0),
      actual: { citationCount: citations.length, appendixCount: appendix.length },
      expected: "readable citations and evidence appendix"
    },
    {
      id: "portable_document_has_ordered_blocks",
      passed: contentBlocks.length > 0 && sequentialOrders && normalizeText(doc.markdown || "").length > 0,
      actual: {
        contentBlockCount: contentBlocks.length,
        sequentialOrders,
        markdownLength: normalizeText(doc.markdown || "").length
      },
      expected: "ordered contentBlocks and markdown rendering"
    },
    {
      id: "portable_document_has_no_framework_lookup_keys",
      passed: forbiddenPaths.length === 0,
      actual: forbiddenPaths,
      expected: "no evidenceRefs/evidenceId/documentId/assetId/sourceId/batchId/syncBatchId/sourceKey"
    }
  ];
  return {
    passed: checks.every((check) => check.passed),
    checks
  };
}

function buildDistilledOutputs({ query, cluster, title = "", rawCorpusBatchExtracts = [] } = {}) {
  const safeTitle = normalizeText(title || cluster?.label || query || "Knowledge");
  const items = asArray(cluster?.items);
  const evidenceRefs = [...new Set(asArray(cluster?.evidenceRefs).filter(Boolean))];
  const citations = citationsForItems(items, 12);
  const sourceTrace = cluster?.sourceTrace || sourceTraceForItems(items);
  const terms = asArray(cluster?.terms).map((item) => normalizeText(item.term)).filter(Boolean);
  const leadSources = sourceTrace.providerIds.length
    ? sourceTrace.providerIds.join("、")
    : sourceTrace.sourceTypes.join("、") || "已入库来源";
  const batchExtractSummary = summarizeRawBatchExtracts(rawCorpusBatchExtracts);
  const summaryText = [
    `“${safeTitle}”由 ${evidenceRefs.length} 条原始语料/证据支撑。`,
    batchExtractSummary.processedBatchCount
      ? `已完成 ${batchExtractSummary.processedBatchCount} 个原始语料批次的核心提炼，覆盖 ${batchExtractSummary.documentCount} 份材料。`
      : "",
    leadSources ? `来源覆盖：${leadSources}。` : "",
    evidenceRefs.slice(0, 4).map((id) => `[${id}]`).join(" ")
  ].filter(Boolean).join(" ");
  const ruleId = stableId("distilled_rule", query, cluster?.clusterId, evidenceRefs.join(","));
  const relationId = stableId("distilled_relation", query, cluster?.clusterId, terms.join(","));
  const ruleCandidates = [
    {
      ruleId,
      title: `使用“${safeTitle}”时保留原文顺序和来源链路`,
      condition: terms.length
        ? `问题命中这些主题词之一：${terms.slice(0, 6).join("、")}`
        : `问题命中“${safeTitle}”相关原始语料或 evidence`,
      action: "read_raw_corpus_first_then_validate_with_evidence_before_answer",
      evidenceRefs,
      citations,
      sourceTrace
    }
  ];
  const entityRelationCandidates = [
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
  ];
  return {
    summary: {
      text: summaryText,
      evidenceRefs,
      citations,
      sourceTrace,
      batchExtraction: batchExtractSummary
    },
    ruleCandidates,
    entityRelationCandidates,
    portableDocument: buildPortableDistillationDocument({
      query,
      title: safeTitle,
      cluster,
      summaryText,
      ruleCandidates,
      entityRelationCandidates,
      rawCorpusBatchExtracts
    })
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
  const portableDocument = validatePortableDocument(outputs.portableDocument);
  return {
    passed: checks.every((check) => check.passed) && portableDocument.passed,
    checks,
    portableDocument
  };
}

function contentBlocksFromMarkdown(markdown = "", fallbackTitle = "知识蒸馏文档") {
  const lines = normalizeDocumentText(markdown).split("\n");
  const blocks = [];
  const push = (block) => {
    blocks.push(compactObject({
      order: blocks.length + 1,
      ...block
    }));
  };
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }
    const bullet = /^[-*+]\s+(.+)$/.exec(line);
    if (bullet) {
      const previous = blocks.at(-1);
      if (previous?.type === "list") {
        previous.items = [...asArray(previous.items), bullet[1]];
      } else {
        push({ type: "list", items: [bullet[1]] });
      }
      continue;
    }
    push({ type: "paragraph", text: line });
  }
  if (!blocks.length) {
    push({ type: "heading", level: 1, text: fallbackTitle });
  }
  return blocks;
}

function portableDocumentFromModelCandidate(candidate = {}, fallbackDocument = {}) {
  const input = asObject(candidate);
  const markdown = normalizeDocumentText(input.markdown || input.content || input.text || "");
  if (!markdown) {
    return null;
  }
  const title = normalizeText(input.title || fallbackDocument.title || "知识蒸馏文档");
  const contentBlocks = contentBlocksFromMarkdown(markdown, title);
  const document = {
    ...fallbackDocument,
    protocolVersion: PORTABLE_DISTILLATION_DOCUMENT_PROTOCOL_VERSION,
    artifactType: "portable-distilled-knowledge-document",
    selfContained: true,
    runtimeDependencies: [],
    outputFormats: ["markdown", "docx"],
    title,
    markdown,
    contentBlocks,
    summary: {
      ...asObject(fallbackDocument.summary),
      text: normalizeText(input.summary || fallbackDocument.summary?.text || ""),
      citations: asArray(fallbackDocument.summary?.citations)
    },
    citations: asArray(fallbackDocument.citations),
    evidenceAppendix: asArray(fallbackDocument.evidenceAppendix),
    sourceBibliography: asArray(fallbackDocument.sourceBibliography),
    integrity: {
      ...asObject(fallbackDocument.integrity),
      modelAuthoredMarkdown: true,
      contentBlockCount: contentBlocks.length,
      evidenceDigest: stableHash(markdown, ...asArray(fallbackDocument.citations).map((citation) => `${citation.title}\n${citation.excerpt}`))
    }
  };
  return validatePortableDocument(document).passed ? document : null;
}

function mergeModelBackedSkill(fallback = {}, modelSkill = {}) {
  const skill = asObject(modelSkill);
  if (!Object.keys(skill).length) {
    return fallback;
  }
  const merged = { ...fallback };
  const textFields = new Set(["title", "summary"]);
  const objectFields = new Set(["applicability"]);
  const arrayFields = new Set([
    "coreConcepts",
    "decisionHeuristics",
    "antiPatterns",
    "honestBoundaries",
    "verificationQuestions"
  ]);
  for (const key of [...textFields, ...objectFields, ...arrayFields]) {
    const value = skill[key];
    if (textFields.has(key)) {
      const normalized = normalizeText(value);
      if (normalized && normalized !== "[object Object]") {
        merged[key] = normalized;
      }
    } else if (objectFields.has(key) && value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0) {
      merged[key] = value;
    } else if (arrayFields.has(key) && Array.isArray(value) && value.length > 0) {
      merged[key] = value;
    }
  }
  const fallbackOutputs = asObject(fallback.distilledOutputs);
  const modelOutputs = asObject(skill.distilledOutputs || skill.outputs);
  const modelPortableDocument = portableDocumentFromModelCandidate(
    modelOutputs.portableDocument || skill.portableDocument || skill.document || {},
    fallbackOutputs.portableDocument || {}
  );
  const distilledOutputs = Object.keys(modelOutputs).length || modelPortableDocument
    ? {
        ...fallbackOutputs,
        summary: modelOutputs.summary
          ? {
              ...asObject(fallbackOutputs.summary),
              ...asObject(modelOutputs.summary),
              evidenceRefs: asArray(fallbackOutputs.summary?.evidenceRefs),
              citations: asArray(fallbackOutputs.summary?.citations),
              sourceTrace: fallbackOutputs.summary?.sourceTrace
            }
          : fallbackOutputs.summary,
        ruleCandidates: asArray(modelOutputs.ruleCandidates).length
          ? asArray(modelOutputs.ruleCandidates)
          : fallbackOutputs.ruleCandidates,
        entityRelationCandidates: asArray(modelOutputs.entityRelationCandidates).length
          ? asArray(modelOutputs.entityRelationCandidates)
          : fallbackOutputs.entityRelationCandidates,
        portableDocument: modelPortableDocument || fallbackOutputs.portableDocument
      }
    : fallbackOutputs;
  return {
    ...merged,
    evidenceRefs: fallback.evidenceRefs,
    rawCorpusProvenance: fallback.rawCorpusProvenance,
    sourceTrace: fallback.sourceTrace,
    distilledOutputs
  };
}

function compactSkillForModel(skill = {}) {
  const raw = asObject(skill);
  const distilledOutputs = asObject(raw.distilledOutputs);
  const portableDocument = asObject(distilledOutputs.portableDocument);
  return compactObject({
    title: raw.title,
    sourceQuery: raw.sourceQuery,
    summary: truncateForModel(raw.summary, 700),
    applicability: raw.applicability,
    coreConcepts: asArray(raw.coreConcepts).slice(0, 20),
    decisionHeuristics: asArray(raw.decisionHeuristics).slice(0, 12),
    antiPatterns: asArray(raw.antiPatterns).slice(0, 12),
    honestBoundaries: asArray(raw.honestBoundaries).slice(0, 12),
    verificationQuestions: asArray(raw.verificationQuestions).slice(0, 12),
    evidenceRefs: asArray(raw.evidenceRefs).slice(0, 24),
    sourceTrace: compactSourceTraceForModel(raw.sourceTrace, { evidenceLimit: 24, sourceLimit: 6 }),
    rawCorpusProvenance: compactRawCorpusProvenanceForModel(raw.rawCorpusProvenance),
    distilledOutputs: compactObject({
      summary: compactObject({
        text: truncateForModel(distilledOutputs.summary?.text || distilledOutputs.summary, 700),
        evidenceRefs: asArray(distilledOutputs.summary?.evidenceRefs).slice(0, 16),
        citations: asArray(distilledOutputs.summary?.citations).slice(0, 6).map((citation) => compactCitationForModel(citation, 180)),
        sourceTrace: compactSourceTraceForModel(distilledOutputs.summary?.sourceTrace, { evidenceLimit: 16, sourceLimit: 4 })
      }),
      ruleCandidates: asArray(distilledOutputs.ruleCandidates).slice(0, 5).map(compactRuleCandidateForModel),
      entityRelationCandidates: asArray(distilledOutputs.entityRelationCandidates).slice(0, 5).map(compactEntityRelationForModel),
      portableDocument: compactObject({
        protocolVersion: portableDocument.protocolVersion,
        title: portableDocument.title,
        summary: truncateForModel(portableDocument.summary, 700),
        integrity: portableDocument.integrity,
        citations: asArray(portableDocument.citations).slice(0, 8).map((citation) => compactCitationForModel(citation, 160)),
        sourceBibliography: asArray(portableDocument.sourceBibliography).slice(0, 8).map((source) => compactObject({
          sourceLabel: source.sourceLabel,
          sourceType: source.sourceType,
          originalFileName: truncateForModel(source.originalFileName, 120),
          sourcePath: truncateForModel(source.sourcePath, 180),
          contentHash: source.contentHash
        }))
      })
    }),
    evidenceDigest: asArray(raw.evidenceDigest).slice(0, 8).map((item) => compactObject({
      evidenceId: item.evidenceId,
      title: truncateForModel(item.title, 160),
      snippet: truncateForModel(item.snippet, 260),
      score: item.score
    }))
  });
}

function makeCandidateSkill({ query, cluster, title = "", rawCorpusBatchExtracts = [] } = {}) {
  const safeTitle = normalizeText(title || cluster.label || query || "Knowledge Skill");
  const sourceTrace = cluster.sourceTrace || sourceTraceForItems(cluster.items);
  const distilledOutputs = buildDistilledOutputs({ query, cluster, title: safeTitle, rawCorpusBatchExtracts });
  const coreConcepts = cluster.terms.slice(0, 10).map((item) => ({
    term: item.term,
    weight: item.count,
    evidenceRefs: cluster.evidenceRefs.slice(0, 5)
  }));
  return {
    title: `${safeTitle} Skill`,
    sourceQuery: query,
    summary: `从 ${cluster.evidenceRefs.length} 条原始语料/证据、${sourceTrace.sourceCount} 个来源中蒸馏出的可复用知识操作单元。`,
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

function extractReadableClaimsFromMarkdown(markdown = "", limit = 80) {
  const lines = normalizeDocumentText(markdown)
    .split(/\n+/)
    .map((line) => line.replace(/^#{1,6}\s+/, "").replace(/^[-*+]\s+/, "").replace(/^>\s?/, "").trim())
    .filter((line) => line.length >= 12 && !/^!\[/.test(line));
  const claims = [];
  for (const line of lines) {
    for (const part of line.split(/[。；;.!?！？]\s*/)) {
      const claim = normalizeText(part);
      if (claim.length >= 12) {
        claims.push(claim.slice(0, 400));
      }
      if (claims.length >= limit) {
        return [...new Set(claims)];
      }
    }
  }
  return [...new Set(claims)].slice(0, limit);
}

function expectedClaimsFromBatchExtracts(rawCorpusBatchExtracts = [], cluster = {}) {
  const clusterEvidence = new Set(asArray(cluster.evidenceRefs));
  const claims = [];
  for (const extract of asArray(rawCorpusBatchExtracts)) {
    const sourceIndexes = new Set(asArray(extract.sourceIndexes || extract.itemIndexes).map(Number));
    const relevantToCluster = !clusterEvidence.size || asArray(cluster.items).some((item) =>
      sourceIndexes.has(Number(item.__distillation?.originalIndex))
    );
    if (!relevantToCluster) {
      continue;
    }
    const summary = normalizeText(extract.summary);
    if (summary) {
      claims.push({
        kind: "batch_summary",
        batchNumber: extract.batchNumber,
        statement: summary
      });
    }
    for (const finding of asArray(extract.coreFindings)) {
      const statement = normalizeText(finding.statement || finding.text || finding.summary);
      if (statement) {
        claims.push({
          kind: "batch_finding",
          batchNumber: extract.batchNumber,
          findingId: normalizeText(finding.findingId || ""),
          statement,
          importance: normalizeText(finding.importance || "")
        });
      }
    }
  }
  if (!claims.length) {
    for (const item of asArray(cluster.items)) {
      const statement = normalizeText(item.snippet || textForDistillationItem(item).slice(0, 400));
      if (statement) {
        claims.push({
          kind: "source_excerpt",
          sourceOrder: item.__distillation?.temporal?.sourceOrder,
          statement
        });
      }
    }
  }
  return claims.slice(0, 80);
}

function semanticSimilarityForTexts(embeddingRuntime, left = "", right = "") {
  try {
    const leftVector = embeddingRuntime?.embedText?.(left)?.vector || [];
    const rightVector = embeddingRuntime?.embedText?.(right)?.vector || [];
    return cosineSimilarity(leftVector, rightVector);
  } catch {
    return 0;
  }
}

function bestClaimCoverage({ embeddingRuntime, expectedClaims = [], actualClaims = [] } = {}) {
  return asArray(expectedClaims).map((expected, index) => {
    let bestSemantic = 0;
    let bestLexical = 0;
    let bestActual = "";
    for (const actual of asArray(actualClaims)) {
      const semantic = semanticSimilarityForTexts(embeddingRuntime, expected.statement, actual);
      const lexical = jaccard(tokenize(expected.statement), tokenize(actual));
      const combined = Math.max(semantic, lexical);
      if (combined > Math.max(bestSemantic, bestLexical)) {
        bestSemantic = semantic;
        bestLexical = lexical;
        bestActual = actual;
      }
    }
    const covered = bestSemantic >= 0.55 || bestLexical >= 0.18;
    return {
      claimId: stableId("distillation_claim", expected.kind || "claim", expected.statement, index),
      ...expected,
      bestMatchedOutput: truncateForModel(bestActual, 260),
      semanticScore: Number(bestSemantic.toFixed(6)),
      lexicalScore: Number(bestLexical.toFixed(6)),
      covered
    };
  });
}

function evaluateDistillationExternally({
  embeddingRuntime,
  distilledOutputs = {},
  rawCorpusBatchExtracts = [],
  cluster = {},
  qualityV2 = {}
} = {}) {
  const portableDocument = asObject(distilledOutputs.portableDocument);
  const markdown = portableDocument.markdown || distilledOutputs.summary?.text || "";
  const expectedClaims = expectedClaimsFromBatchExtracts(rawCorpusBatchExtracts, cluster);
  const actualClaims = extractReadableClaimsFromMarkdown(markdown);
  const claimCoverage = bestClaimCoverage({ embeddingRuntime, expectedClaims, actualClaims });
  const coveredCount = claimCoverage.filter((claim) => claim.covered).length;
  const semanticCoverageScore = expectedClaims.length ? coveredCount / expectedClaims.length : 0;
  const avgSemantic = claimCoverage.length
    ? claimCoverage.reduce((sum, claim) => sum + Number(claim.semanticScore || 0), 0) / claimCoverage.length
    : 0;
  const citationCount = asArray(portableDocument.citations).length;
  const sourceCount = Number(cluster.sourceTrace?.sourceCount || 0);
  const sourceCoverageScore = sourceCount > 0
    ? Math.min(1, asArray(cluster.items).length / Math.max(1, sourceCount))
    : 0;
  const citationDensity = actualClaims.length ? Math.min(1, citationCount / actualClaims.length) : 0;
  const timelineOrderScore = cluster.timeline?.chronological === true ? 1 : 0;
  const unsupportedClaimCount = Number(qualityV2.semanticSupport?.unsupportedClaimCount || 0);
  const unsupportedClaimRate = actualClaims.length ? Math.min(1, unsupportedClaimCount / actualClaims.length) : 0;
  const temporalScores = asArray(cluster.items).map((item) => Number(item.__distillation?.decayedImportanceScore || 0));
  const timeDecayCalibrationScore = temporalScores.length
    ? Math.min(1, temporalScores.reduce((sum, value) => sum + value, 0) / temporalScores.length)
    : 0;
  const overallScore = Number((
    semanticCoverageScore * 0.34 +
    Math.min(1, avgSemantic) * 0.18 +
    citationDensity * 0.14 +
    timelineOrderScore * 0.14 +
    sourceCoverageScore * 0.1 +
    timeDecayCalibrationScore * 0.1 -
    unsupportedClaimRate * 0.2
  ).toFixed(6));
  return {
    protocolVersion: KNOWLEDGE_DISTILLATION_EXTERNAL_EVALUATION_VERSION,
    method: "data_driven_semantic_claim_coverage_v1",
    evaluatorType: "external_to_distiller_prompt",
    passed: overallScore >= 0.55 && timelineOrderScore >= 1 && unsupportedClaimRate <= 0.15,
    overallScore,
    metrics: {
      expectedClaimCount: expectedClaims.length,
      actualClaimCount: actualClaims.length,
      coveredClaimCount: coveredCount,
      semanticCoverageScore: Number(semanticCoverageScore.toFixed(6)),
      averageSemanticSimilarity: Number(avgSemantic.toFixed(6)),
      sourceCoverageScore: Number(sourceCoverageScore.toFixed(6)),
      citationDensity: Number(citationDensity.toFixed(6)),
      timelineOrderScore,
      unsupportedClaimRate: Number(unsupportedClaimRate.toFixed(6)),
      timeDecayCalibrationScore: Number(timeDecayCalibrationScore.toFixed(6))
    },
    claimCoverage: claimCoverage.slice(0, 40)
  };
}

function buildClaimLedger({ externalEvaluation = {}, distilledOutputs = {}, cluster = {} } = {}) {
  const actualClaims = extractReadableClaimsFromMarkdown(asObject(distilledOutputs.portableDocument).markdown || "");
  return {
    protocolVersion: KNOWLEDGE_DISTILLATION_ALGORITHM_VERSION,
    clusterId: cluster.clusterId || "",
    expectedClaims: asArray(externalEvaluation.claimCoverage).map((claim) => compactObject({
      claimId: claim.claimId,
      kind: claim.kind,
      statement: claim.statement,
      covered: claim.covered === true,
      semanticScore: claim.semanticScore,
      lexicalScore: claim.lexicalScore,
      bestMatchedOutput: claim.bestMatchedOutput
    })),
    generatedClaims: actualClaims.map((statement, index) => ({
      claimId: stableId("generated_distillation_claim", cluster.clusterId || "", statement, index),
      statement
    })),
    summary: {
      expectedClaimCount: Number(externalEvaluation.metrics?.expectedClaimCount || 0),
      generatedClaimCount: actualClaims.length,
      coveredClaimCount: Number(externalEvaluation.metrics?.coveredClaimCount || 0),
      unsupportedClaimRate: Number(externalEvaluation.metrics?.unsupportedClaimRate || 0)
    }
  };
}

function qualityReportV3({ qualityV2 = {}, externalEvaluation = {}, cluster = {}, sourcePlan = {} } = {}) {
  const timeline = cluster.timeline || {};
  const sourcePlanTimeline = sourcePlan.timeline || {};
  const metrics = asObject(externalEvaluation.metrics);
  const duplicateScore = Number(qualityV2.duplicate?.score || 0);
  const passed =
    qualityV2.passed === true &&
    externalEvaluation.passed === true &&
    timeline.chronological === true &&
    duplicateScore < 0.92;
  return {
    protocolVersion: KNOWLEDGE_DISTILLATION_ALGORITHM_VERSION,
    passed,
    overallScore: Number(externalEvaluation.overallScore || 0),
    sourceCoverage: {
      sourcePlanItemCount: asArray(sourcePlan.publicItems).length,
      clusterSourceCount: Number(cluster.sourceTrace?.sourceCount || 0),
      score: Number(metrics.sourceCoverageScore || 0)
    },
    semanticCoverage: {
      expectedClaimCount: Number(metrics.expectedClaimCount || 0),
      coveredClaimCount: Number(metrics.coveredClaimCount || 0),
      score: Number(metrics.semanticCoverageScore || 0),
      averageSimilarity: Number(metrics.averageSemanticSimilarity || 0)
    },
    citations: {
      density: Number(metrics.citationDensity || 0),
      unsupportedClaimRate: Number(metrics.unsupportedClaimRate || 0)
    },
    timeline: {
      clusterChronological: timeline.chronological === true,
      sourcePlanChronological: sourcePlanTimeline.chronological === true,
      knownTimestampCount: Number(timeline.knownTimestampCount || 0),
      unknownTimestampCount: Number(timeline.unknownTimestampCount || 0),
      score: Number(metrics.timelineOrderScore || 0)
    },
    temporalImportanceDecay: {
      halfLifeDays: Number(sourcePlan.halfLifeDays || DEFAULT_TEMPORAL_DECAY_HALF_LIFE_DAYS),
      floor: Number(sourcePlan.floor || DEFAULT_TEMPORAL_DECAY_FLOOR),
      calibrationScore: Number(metrics.timeDecayCalibrationScore || 0),
      clusterDecayedImportanceScore: Number(cluster.decayedImportanceScore || 0)
    },
    duplicate: {
      score: duplicateScore,
      passed: duplicateScore < 0.92
    },
    previousGate: {
      passed: qualityV2.passed === true,
      semanticUnsupportedClaims: Number(qualityV2.semanticSupport?.unsupportedClaimCount || 0)
    },
    recommendations: passed
      ? []
      : [
          timeline.chronological === true ? "" : "修正输出时间线顺序，确保按检测到的时间先后组织。",
          externalEvaluation.passed === true ? "" : "提高源语料核心 claim 覆盖率和引用密度。",
          duplicateScore < 0.92 ? "" : "蒸馏结果与已有知识过于相似，需要合并或降重。"
        ].filter(Boolean)
  };
}

function averageNumbers(values = []) {
  const numbers = asArray(values).map(Number).filter(Number.isFinite);
  return numbers.length
    ? Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(6))
    : 0;
}

function aggregateExternalEvaluation(candidates = []) {
  const evaluations = asArray(candidates).map((candidate) => candidate.externalEvaluation).filter(Boolean);
  const metrics = evaluations.map((evaluation) => asObject(evaluation.metrics));
  return {
    protocolVersion: KNOWLEDGE_DISTILLATION_EXTERNAL_EVALUATION_VERSION,
    method: "aggregate_data_driven_semantic_claim_coverage_v1",
    passed: evaluations.length > 0 && evaluations.every((evaluation) => evaluation.passed === true),
    overallScore: averageNumbers(evaluations.map((evaluation) => evaluation.overallScore)),
    metrics: {
      expectedClaimCount: metrics.reduce((sum, item) => sum + Number(item.expectedClaimCount || 0), 0),
      actualClaimCount: metrics.reduce((sum, item) => sum + Number(item.actualClaimCount || 0), 0),
      coveredClaimCount: metrics.reduce((sum, item) => sum + Number(item.coveredClaimCount || 0), 0),
      semanticCoverageScore: averageNumbers(metrics.map((item) => item.semanticCoverageScore)),
      averageSemanticSimilarity: averageNumbers(metrics.map((item) => item.averageSemanticSimilarity)),
      sourceCoverageScore: averageNumbers(metrics.map((item) => item.sourceCoverageScore)),
      citationDensity: averageNumbers(metrics.map((item) => item.citationDensity)),
      timelineOrderScore: averageNumbers(metrics.map((item) => item.timelineOrderScore)),
      unsupportedClaimRate: averageNumbers(metrics.map((item) => item.unsupportedClaimRate)),
      timeDecayCalibrationScore: averageNumbers(metrics.map((item) => item.timeDecayCalibrationScore))
    }
  };
}

function aggregateQualityReportV3(candidates = [], sourcePlan = {}) {
  const reports = asArray(candidates).map((candidate) => candidate.qualityReportV3).filter(Boolean);
  const aggregateExternal = aggregateExternalEvaluation(candidates);
  return {
    protocolVersion: KNOWLEDGE_DISTILLATION_ALGORITHM_VERSION,
    passed: reports.length > 0 && reports.every((report) => report.passed === true),
    overallScore: averageNumbers(reports.map((report) => report.overallScore)),
    clusterCount: reports.length,
    sourcePlan: {
      itemCount: asArray(sourcePlan.publicItems).length,
      knownTimestampCount: Number(sourcePlan.timeline?.knownTimestampCount || 0),
      unknownTimestampCount: Number(sourcePlan.timeline?.unknownTimestampCount || 0),
      chronological: sourcePlan.timeline?.chronological === true
    },
    externalEvaluation: aggregateExternal,
    semanticCoverageScore: Number(aggregateExternal.metrics.semanticCoverageScore || 0),
    timelineOrderScore: Number(aggregateExternal.metrics.timelineOrderScore || 0),
    timeDecayCalibrationScore: Number(aggregateExternal.metrics.timeDecayCalibrationScore || 0),
    recommendations: reports.flatMap((report) => asArray(report.recommendations)).slice(0, 12)
  };
}

export function createKnowledgeDistillationRuntime({
  userDataPath,
  runtime,
  metadataStore = null,
  knowledgeSkillRuntime,
  goldenRuleRuntime,
  evidenceGate,
  modelDecisionRuntime = null,
  defaultModelAlias = null,
  modelRoutingMap = null
} = {}) {
  const rootPath = path.join(userDataPath, "knowledge-distillation");
  const runsPath = path.join(rootPath, "runs.json");
  const resolvedDefaultModel = defaultModelAlias || DEFAULT_INDUSTRIAL_DISTILLATION_MODEL;
  const embeddingRuntime = createEmbeddingRuntime({
    settings: runtime?.settings || {}
  });

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

  async function loadRawCorpusItems(input = {}, query = "", limit = 30) {
    const explicitItems = rawCorpusDocumentsFromInput(input);
    if (explicitItems.length) {
      return {
        source: "request",
        items: explicitItems
      };
    }
    if (!metadataStore || typeof metadataStore.listRawCorpusDocuments !== "function") {
      return {
        source: "unavailable",
        items: []
      };
    }
    const rawDocuments = metadataStore.listRawCorpusDocuments({
      batchId: input.batchId || input.rawCorpus?.batchId || "",
      query: input.rawCorpusQuery || query,
      limit: input.rawCorpusLimit || input.limit || limit
    });
    return {
      source: "metadata.source_files",
      items: asArray(rawDocuments)
        .map(normalizeRawCorpusDocument)
        .filter((item) => item.evidenceId || item.title || item.snippet)
    };
  }

  async function runDistillation(input = {}) {
    const knowledgeCore = getKnowledgeCore(runtime);
    const query = normalizeText(input.query || input.q || input.topic || "");
    const runId = normalizeText(input.runId || "") || stableId("knowledge_distillation_run", query, Date.now());
    const startedAt = nowIso();
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
    const modelAliasRaw = normalizeText(input.modelAlias || input.model || input.modelId || resolvedDefaultModel);
    const modelAlias = modelRoutingMap?.[modelAliasRaw] || modelAliasRaw;
    const modelRequiredFailure = (roleId, decision = null, fallbackReason = "") =>
      persistRun({
        protocolVersion: KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
        ok: false,
        runId,
        status: "model_unavailable",
        error: `知识蒸馏必须调用模型闭环，${roleId} 未获得模型输出${fallbackReason ? `：${fallbackReason}` : "。"}`,
        startedAt,
        finishedAt: nowIso(),
        model: {
          required: true,
          roleId,
          modelAlias,
          decisionAudit: decision?.audit || null
        }
      });
    if (input.modelEnabled !== true) {
      return persistRun({
        protocolVersion: KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
        ok: false,
        runId,
        status: "invalid_input",
        error: "知识蒸馏必须启用模型闭环，不能以 modelEnabled=false 运行。",
        startedAt,
        finishedAt: nowIso()
      });
    }
    if (!modelDecisionRuntime || typeof modelDecisionRuntime.decide !== "function") {
      return modelRequiredFailure("model_decision_runtime", null, "模型决策运行时不可用。");
    }
    const allowDeterministicModelFallback = input.allowDeterministicModelFallback === true;
    const rawCorpusLoad = await loadRawCorpusItems(input, query, limit);
    let searchResult = {
      query,
      items: [],
      results: [],
      explain: null,
      hierarchy: null
    };
    let evidenceItems = [];
    if (knowledgeCore && typeof knowledgeCore.search === "function") {
      searchResult = await knowledgeCore.search({
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
      evidenceItems = await hydrateEvidenceItemsFromPacks(
        knowledgeCore,
        compactedEvidenceItems,
        input.maxOpenedEvidence || limit
      );
    }
    const primaryItems = rawCorpusLoad.items.length ? rawCorpusLoad.items : evidenceItems;
    if (primaryItems.length === 0) {
      return persistRun({
        protocolVersion: KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
        ok: false,
        runId,
        status: "unavailable",
        error: "Raw corpus is unavailable and KnowledgeCore search returned no evidence.",
        startedAt,
        finishedAt: nowIso()
      });
    }
    const sourcePlan = buildSourcePlan(primaryItems, {
      query,
      embeddingRuntime,
      mergeStrategy: input.mergeStrategy || "timeline_then_topic",
      halfLifeDays: input.timeDecayHalfLifeDays || input.temporalDecayHalfLifeDays || DEFAULT_TEMPORAL_DECAY_HALF_LIFE_DAYS,
      floor: input.timeDecayFloor || input.temporalDecayFloor || DEFAULT_TEMPORAL_DECAY_FLOOR
    });
    const plannedItems = sourcePlan.items;
    const rawCorpusBatchPlan = buildRawCorpusBatchPlan(plannedItems, input.rawCorpusBatchMaxCharacters);
    const rawCorpusBatches = rawCorpusBatchPlan.map(publicRawCorpusBatch);
    const batchModelCallLimit = Math.max(
      1,
      Math.min(Number(input.maxRawCorpusBatchModelCalls || rawCorpusBatchPlan.length || 1), 100)
    );
    const rawCorpusBatchExtracts = [];
    const extractsResult = await mapConcurrent(
      rawCorpusBatchPlan.slice(0, batchModelCallLimit),
      async (batch) => {
        let batchPayload = rawCorpusBatchPayload(
          batch,
          plannedItems,
          input.rawCorpusBatchModelMaxCharacters || input.batchModelMaxCharacters || 16000
        );
        const rawBatchDecisionInput = () => ({
          roleId: "knowledge_raw_batch_extractor",
          modelEnabled: true,
          modelAlias: input.batchExtractorModelAlias || input.rawCorpusBatchModelAlias || modelAlias,
          input: {
            query,
            runId,
            batch: batchPayload,
            totalBatchCount: rawCorpusBatchPlan.length,
            extractionPolicy: {
              output: "core_findings",
              preserveSourceOrder: true,
              noCanonicalMutation: true,
              useAsDistillationBackgroundOnly: true
            },
            modelEnabled: true
          }
        });
        let batchDecision = await modelDecisionRuntime.decide(rawBatchDecisionInput());
        if (decisionInputOverBudget(batchDecision)) {
          batchPayload = rawCorpusBatchPayload(
            batch,
            plannedItems,
            input.rawCorpusBatchRetryModelMaxCharacters || 8000
          );
          batchDecision = await modelDecisionRuntime.decide(rawBatchDecisionInput());
        }
        if (batchDecision?.usedModel !== true && !allowDeterministicModelFallback) {
          return {
            ok: false,
            batchDecision,
            batchNumber: batch.batchNumber
          };
        }
        return {
          ok: true,
          extract: normalizeRawCorpusBatchExtract({
            decision: batchDecision,
            batchPayload
          })
        };
      },
      input.batchExtractorConcurrency || 3
    );

    for (const res of extractsResult) {
      if (!res.ok) {
        return modelRequiredFailure(
          "knowledge_raw_batch_extractor",
          res.batchDecision,
          res.batchDecision?.audit?.fallbackReason || `第 ${res.batchNumber} 个原始语料批次未获得模型输出。`
        );
      }
      rawCorpusBatchExtracts.push(res.extract);
    }
    const rawCorpusBatchExtraction = {
      ...summarizeRawBatchExtracts(rawCorpusBatchExtracts),
      batchCount: rawCorpusBatchPlan.length,
      skippedBatchCount: Math.max(0, rawCorpusBatchPlan.length - rawCorpusBatchExtracts.length),
      complete: rawCorpusBatchExtracts.length === rawCorpusBatchPlan.length
    };
    const validationEvidenceRefs = [...new Set(evidenceItems.map((item) => item.evidenceId).filter(Boolean))];
    const clusters = rawCorpusLoad.items.length
      ? clusterRawCorpusItems(plannedItems, query, {
          singleDocumentBundle: input.mergeStrategy === "single_document_bundle",
          threshold: input.semanticClusterThreshold || input.clusterThreshold,
          rejectThreshold: input.clusterRejectThreshold,
          maxClusters: input.maxClusters || 8,
          mergeStrategy: input.mergeStrategy || "timeline_then_topic"
        })
      : clusterEvidenceItems(plannedItems, {
          threshold: input.semanticClusterThreshold || input.clusterThreshold,
          rejectThreshold: input.clusterRejectThreshold,
          maxClusters: input.maxClusters || 8,
          mergeStrategy: input.mergeStrategy || "timeline_then_topic"
        });
    const candidates = [];
    for (const [index, cluster] of clusters.entries()) {
      const clusterName = await maybeNameCluster({
        query,
        cluster,
        modelEnabled: true,
        modelAlias: input.topicClusterModelAlias || modelAlias
      });
      if (clusterName.modelDecision?.usedModel !== true && !allowDeterministicModelFallback) {
        return modelRequiredFailure(
          "topic_cluster_namer",
          clusterName.modelDecision,
          clusterName.modelDecision?.audit?.fallbackReason || "主题命名未获得模型输出。"
        );
      }
      const baseProposal = makeCandidateSkill({
        query,
        cluster,
        title: clusterName.title,
        rawCorpusBatchExtracts
      });
      const skillEvidenceRefs = validationEvidenceRefs.length ? validationEvidenceRefs : cluster.evidenceRefs;
      const distillerModelInput = (mode = "default") => {
        const minimal = mode === "minimal";
        return {
          query,
          fallbackSkill: compactSkillForModel(baseProposal),
          evidenceItems: cluster.items
            .slice(0, minimal ? 2 : Number(input.modelEvidenceMaxItems || 8))
            .map((item) =>
              compactDistillationItemForModel(item, minimal ? 450 : input.modelEvidenceMaxCharacters || 900)
            ),
          rawCorpusBatches: rawCorpusBatches
            .slice(0, minimal ? 4 : Number(input.modelRawBatchMaxItems || 12))
            .map((batch) => compactRawCorpusBatchForModel(batch, minimal ? 3 : 8)),
          rawCorpusBatchExtracts: compactRawCorpusBatchExtractsForModel(rawCorpusBatchExtracts, {
            batchLimit: minimal ? 4 : input.modelRawBatchExtractMaxItems || 12,
            findingLimit: minimal ? 3 : input.modelRawBatchFindingMaxItems || 5,
            riskLimit: minimal ? 2 : 4
          }),
          batchExtraction: rawCorpusBatchExtraction,
          modelEnabled: true
        };
      };
      const distillerDecisionInput = (mode = "default") => ({
        roleId: "knowledge_skill_distiller",
        modelEnabled: true,
        modelAlias: input.skillDistillerModelAlias || modelAlias,
        input: distillerModelInput(mode)
      });
      let modelDistiller = await modelDecisionRuntime.decide(distillerDecisionInput());
      if (decisionInputOverBudget(modelDistiller)) {
        modelDistiller = await modelDecisionRuntime.decide(distillerDecisionInput("minimal"));
      }
      if (modelDistiller?.usedModel !== true && !allowDeterministicModelFallback) {
        return modelRequiredFailure(
          "knowledge_skill_distiller",
          modelDistiller,
          modelDistiller?.audit?.fallbackReason || "核心蒸馏未获得模型输出。"
        );
      }
      const modelSkill = asObject(modelDistiller.decision?.skill || modelDistiller.decision?.proposal || {});
      const proposal = mergeModelBackedSkill(baseProposal, modelSkill);
      const proposalForSkill = {
        ...proposal,
        evidenceRefs: skillEvidenceRefs,
        rawCorpusProvenance: {
          primaryInput: rawCorpusLoad.items.length ? "raw-corpus-fulltext" : "knowledge-evidence-fallback",
          source: rawCorpusLoad.source,
          clusterEvidenceRefs: cluster.evidenceRefs,
          validationEvidenceRefs,
          batchExtraction: rawCorpusBatchExtraction
        }
      };
      const proposed = knowledgeSkillRuntime
        ? await knowledgeSkillRuntime.proposeSkill({
            sourceType: "knowledge_distillation",
            agentId: input.agentId || "",
            runId,
            status: "pending_review",
            proposal: {
              ...proposalForSkill,
              clusterProvenance: {
                clusterId: cluster.clusterId,
                rank: index + 1,
                terms: cluster.terms,
                documentIds: cluster.documentIds
              }
            },
            evidenceRefs: skillEvidenceRefs,
            hierarchy: searchResult.hierarchy || null,
            confidence: Math.min(1, Math.max(0.1, skillEvidenceRefs.length / Math.max(1, limit)))
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
              evidenceRefs: skillEvidenceRefs,
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
      const externalEvaluation = evaluateDistillationExternally({
        embeddingRuntime,
        distilledOutputs: proposal.distilledOutputs,
        rawCorpusBatchExtracts,
        cluster,
        qualityV2
      });
      const claimLedger = buildClaimLedger({
        externalEvaluation,
        distilledOutputs: proposal.distilledOutputs,
        cluster
      });
      const qualityV3 = qualityReportV3({
        qualityV2,
        externalEvaluation,
        cluster,
        sourcePlan
      });
      const reviewerModelInput = (mode = "default") => {
        const minimal = mode === "minimal";
        return {
          proposal: compactSkillForModel(proposal),
          rawCorpusBatchExtracts: compactRawCorpusBatchExtractsForModel(rawCorpusBatchExtracts, {
            batchLimit: minimal ? 4 : input.modelRawBatchExtractMaxItems || 10,
            findingLimit: minimal ? 3 : input.modelRawBatchFindingMaxItems || 5,
            riskLimit: minimal ? 2 : 4
          }),
          batchExtraction: rawCorpusBatchExtraction,
          qualityReportV2: compactQualityReportForModel(qualityV2),
          qualityReportV3: {
            passed: qualityV3.passed,
            overallScore: qualityV3.overallScore,
            semanticCoverage: qualityV3.semanticCoverage,
            timeline: qualityV3.timeline,
            temporalImportanceDecay: qualityV3.temporalImportanceDecay
          },
          externalEvaluation: {
            method: externalEvaluation.method,
            passed: externalEvaluation.passed,
            overallScore: externalEvaluation.overallScore,
            metrics: externalEvaluation.metrics
          },
          goldenRule: compactGoldenRuleForModel(goldenRule),
          evidenceGate: compactEvidenceGateForModel(gate),
          modelEnabled: true
        };
      };
      const reviewerDecisionInput = (mode = "default") => ({
        roleId: "skill_reviewer",
        modelEnabled: true,
        modelAlias: input.skillReviewerModelAlias || modelAlias,
        input: reviewerModelInput(mode)
      });
      let reviewer = await modelDecisionRuntime.decide(reviewerDecisionInput());
      if (decisionInputOverBudget(reviewer)) {
        reviewer = await modelDecisionRuntime.decide(reviewerDecisionInput("minimal"));
      }
      if (reviewer?.usedModel !== true && !allowDeterministicModelFallback) {
        return modelRequiredFailure(
          "skill_reviewer",
          reviewer,
          reviewer?.audit?.fallbackReason || "蒸馏复核未获得模型输出。"
        );
      }
      const candidateStatus =
        goldenRule?.decision === "auto_reject"
          ? "auto_rejected"
          : goldenRule?.decision === "canary_allowed" && qualityV3.passed
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
          sourceTrace: cluster.sourceTrace,
          timeline: cluster.timeline,
          decayedImportanceScore: cluster.decayedImportanceScore
        },
        skill: proposed?.skill || null,
        proposal: proposalForSkill,
        unifiedEvidence: {
          evidenceRefs: cluster.evidenceRefs,
          citations: citationsForItems(cluster.items, 20),
          sourceTrace: cluster.sourceTrace
        },
        validationEvidence: {
          evidenceRefs: validationEvidenceRefs,
          citations: citationsForItems(evidenceItems, 20),
          sourceTrace: sourceTraceForItems(evidenceItems)
        },
        portableDocument: proposal.distilledOutputs.portableDocument,
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
        qualityReportV3: qualityV3,
        externalEvaluation,
        claimLedger,
        evidenceGate: gate,
        goldenRule,
        modelDecisions: {
          topicClusterNamer: clusterName.modelDecision,
          rawBatchExtracts: rawCorpusBatchExtracts.map((extract) => extract.model).filter(Boolean),
          skillReviewer: reviewer,
          skillDistiller: modelDistiller
        }
      });
    }
    return persistRun({
      protocolVersion: KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
      algorithmVersion: KNOWLEDGE_DISTILLATION_ALGORITHM_VERSION,
      ok: true,
      runId,
      status: "completed",
      query,
      inputWindow: {
        limit,
        clusterCount: clusters.length,
        evidenceCount: primaryItems.length,
        modelEnabled: input.modelEnabled === true,
        modelAlias,
        strategyVersion: input.strategyVersion || input.mergeStrategy || "timeline_then_topic_v2"
      },
      sourcePlan: {
        protocolVersion: sourcePlan.protocolVersion,
        strategy: sourcePlan.strategy,
        referenceTimestamp: sourcePlan.referenceTimestamp,
        halfLifeDays: sourcePlan.halfLifeDays,
        floor: sourcePlan.floor,
        timeline: sourcePlan.timeline,
        items: sourcePlan.publicItems
      },
      rawCorpus: {
        primary: rawCorpusLoad.items.length > 0,
        source: rawCorpusLoad.items.length ? rawCorpusLoad.source : "knowledge-evidence-fallback",
        documentCount: rawCorpusLoad.items.length,
        totalCharacters: rawCorpusLoad.items.reduce(
          (sum, item) => sum + asArray(item.blocks).reduce((inner, block) => inner + String(block.text || "").length, 0),
          0
        ),
        batches: rawCorpusBatches,
        batchExtraction: rawCorpusBatchExtraction,
        batchExtracts: rawCorpusBatchExtracts
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
        sourceTrace: cluster.sourceTrace,
        timeline: cluster.timeline,
        decayedImportanceScore: cluster.decayedImportanceScore
      })),
      semanticClusters: clusters.map((cluster) => ({
        clusterId: cluster.clusterId,
        label: cluster.label,
        score: cluster.score,
        itemCount: cluster.items.length,
        terms: cluster.terms,
        timeline: cluster.timeline,
        decayedImportanceScore: cluster.decayedImportanceScore,
        sourceTrace: cluster.sourceTrace
      })),
      qualityReportV3: aggregateQualityReportV3(candidates, sourcePlan),
      externalEvaluation: aggregateExternalEvaluation(candidates),
      claimLedger: {
        protocolVersion: KNOWLEDGE_DISTILLATION_ALGORITHM_VERSION,
        clusters: candidates.map((candidate) => candidate.claimLedger).filter(Boolean)
      },
      candidates,
      portableDocuments: candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        title: candidate.portableDocument?.title || candidate.proposal?.title || "",
        document: candidate.portableDocument
      })),
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
        goldenRuleRequired: true,
        industrialBaselineModelAlias: resolvedDefaultModel
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
