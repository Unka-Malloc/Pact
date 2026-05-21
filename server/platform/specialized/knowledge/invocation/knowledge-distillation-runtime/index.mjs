import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_INDUSTRIAL_DISTILLATION_MODEL } from "./industrial-benchmark.mjs";

export const KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION = "agentstudio.knowledge-distillation.v1";
export const PORTABLE_DISTILLATION_DOCUMENT_PROTOCOL_VERSION = "portable.knowledge-distillation.v1";
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

function buildRawCorpusBatches(items = [], maxCharacters = 24000) {
  const safeMax = Math.max(4000, Math.min(Number(maxCharacters || 24000), 200000));
  const batches = [];
  let current = {
    batchNumber: 1,
    documentCount: 0,
    characterCount: 0,
    sources: []
  };
  for (const item of asArray(items)) {
    const characterCount = asArray(item.blocks).reduce((sum, block) => sum + String(block.text || "").length, 0);
    if (current.documentCount > 0 && current.characterCount + characterCount > safeMax) {
      batches.push(current);
      current = {
        batchNumber: batches.length + 1,
        documentCount: 0,
        characterCount: 0,
        sources: []
      };
    }
    current.documentCount += 1;
    current.characterCount += characterCount;
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

function clusterRawCorpusItems(items = [], query = "") {
  const corpusItems = asArray(items);
  const terms = representativeTerms(corpusItems, 12);
  return [
    {
      clusterId: stableId("raw_corpus_cluster", query, corpusItems.map((item) => item.evidenceId || item.title).join("\n")),
      score: 1,
      tokens: [...new Set(corpusItems.flatMap((item) => asArray(item.tokens)))].slice(0, 256),
      documentIds: [...new Set(corpusItems.map((item) => item.documentId).filter(Boolean))],
      items: corpusItems,
      label: normalizeText(query || terms.slice(0, 4).map((item) => item.term).join(" ") || "原始语料蒸馏"),
      terms,
      evidenceRefs: [...new Set(corpusItems.map((item) => item.evidenceId).filter(Boolean))],
      sourceTrace: sourceTraceForItems(corpusItems)
    }
  ];
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
    capturedAt: normalizeText(item.sourceLocator?.capturedAt || ""),
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

function buildOrderedDocumentBlocks({ title, summaryText, orderedItems, citations, portableRules, portableRelations } = {}) {
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

function buildPortableDistillationDocument({ query, title, cluster, summaryText, ruleCandidates, entityRelationCandidates } = {}) {
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
    portableRelations
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
    `“${safeTitle}”由 ${evidenceRefs.length} 条原始语料/证据支撑。`,
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
      sourceTrace
    },
    ruleCandidates,
    entityRelationCandidates,
    portableDocument: buildPortableDistillationDocument({
      query,
      title: safeTitle,
      cluster,
      summaryText,
      ruleCandidates,
      entityRelationCandidates
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
  return {
    ...merged,
    evidenceRefs: fallback.evidenceRefs,
    rawCorpusProvenance: fallback.rawCorpusProvenance,
    sourceTrace: fallback.sourceTrace,
    distilledOutputs: fallback.distilledOutputs
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

export function createKnowledgeDistillationRuntime({
  userDataPath,
  runtime,
  metadataStore = null,
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
    const modelAlias = normalizeText(input.modelAlias || input.model || input.modelId || DEFAULT_INDUSTRIAL_DISTILLATION_MODEL);
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
    const rawCorpusBatches = buildRawCorpusBatches(primaryItems, input.rawCorpusBatchMaxCharacters);
    const validationEvidenceRefs = [...new Set(evidenceItems.map((item) => item.evidenceId).filter(Boolean))];
    const clusters = rawCorpusLoad.items.length && input.rawCorpusSemanticClusters !== true
      ? clusterRawCorpusItems(primaryItems, query)
      : clusterEvidenceItems(primaryItems, {
          threshold: input.clusterThreshold,
          maxClusters: input.maxClusters || 8
        });
    const candidates = [];
    for (const [index, cluster] of clusters.entries()) {
      const clusterName = await maybeNameCluster({
        query,
        cluster,
        modelEnabled: true,
        modelAlias: input.topicClusterModelAlias || modelAlias
      });
      if (clusterName.modelDecision?.usedModel !== true) {
        return modelRequiredFailure(
          "topic_cluster_namer",
          clusterName.modelDecision,
          clusterName.modelDecision?.audit?.fallbackReason || "主题命名未获得模型输出。"
        );
      }
      const baseProposal = makeCandidateSkill({
        query,
        cluster,
        title: clusterName.title
      });
      const skillEvidenceRefs = validationEvidenceRefs.length ? validationEvidenceRefs : cluster.evidenceRefs;
      const modelDistiller = await modelDecisionRuntime.decide({
        roleId: "knowledge_skill_distiller",
        modelEnabled: true,
        modelAlias: input.skillDistillerModelAlias || modelAlias,
        input: {
          query,
          fallbackSkill: baseProposal,
          evidenceItems: cluster.items,
          rawCorpusBatches: rawCorpusBatches.slice(0, 2),
          modelEnabled: true
        }
      });
      if (modelDistiller?.usedModel !== true) {
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
          validationEvidenceRefs
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
      let reviewer = null;
      reviewer = await modelDecisionRuntime.decide({
        roleId: "skill_reviewer",
        modelEnabled: true,
        modelAlias: input.skillReviewerModelAlias || modelAlias,
        input: {
          proposal,
          qualityReportV2: qualityV2,
          goldenRule,
          evidenceGate: gate,
          modelEnabled: true
        }
      });
      if (reviewer?.usedModel !== true) {
        return modelRequiredFailure(
          "skill_reviewer",
          reviewer,
          reviewer?.audit?.fallbackReason || "蒸馏复核未获得模型输出。"
        );
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
        evidenceGate: gate,
        goldenRule,
        modelDecisions: {
          topicClusterNamer: clusterName.modelDecision,
          skillReviewer: reviewer,
          skillDistiller: modelDistiller
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
        evidenceCount: primaryItems.length,
        modelEnabled: input.modelEnabled === true,
        modelAlias
      },
      rawCorpus: {
        primary: rawCorpusLoad.items.length > 0,
        source: rawCorpusLoad.items.length ? rawCorpusLoad.source : "knowledge-evidence-fallback",
        documentCount: rawCorpusLoad.items.length,
        totalCharacters: rawCorpusLoad.items.reduce(
          (sum, item) => sum + asArray(item.blocks).reduce((inner, block) => inner + String(block.text || "").length, 0),
          0
        ),
        batches: rawCorpusBatches
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
        industrialBaselineModelAlias: DEFAULT_INDUSTRIAL_DISTILLATION_MODEL
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
