import {
  asArray,
  clampNumber,
  compactObject,
  hashText,
  truncateText
} from "./core-utils.mjs";
import {
  exponentialRecencyScore,
  firstNonEmptyText,
  firstTimestamp,
  tokenOverlapRatio
} from "./retrieval-scoring.mjs";

export function localQueryHitsFromInput(input = {}) {
  const sources = [
    input.localQuery,
    input.localQueryResult,
    input.localQueryResults,
    input.localMirror,
    input.localMirrorHits,
    input.localHits,
    input.sourceHits
  ];
  const hits = [];
  for (const source of sources) {
    if (Array.isArray(source)) {
      hits.push(...source);
      continue;
    }
    if (source && typeof source === "object") {
      if (Array.isArray(source.items)) {
        hits.push(...source.items);
      } else if (Array.isArray(source.results)) {
        hits.push(...source.results);
      } else if (Array.isArray(source.hits)) {
        hits.push(...source.hits);
      }
    }
  }
  return hits
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .slice(0, 500);
}

export function localMirrorSourceLocator(hit = {}) {
  const chatRef = compactObject({
    ...(hit.chatRef && typeof hit.chatRef === "object" && !Array.isArray(hit.chatRef) ? hit.chatRef : {}),
    providerId: hit.chatRef?.providerId || hit.providerId || "",
    externalId: hit.chatRef?.externalId || hit.externalId || "",
    syncBatchId: hit.chatRef?.syncBatchId || hit.syncBatchId || ""
  });
  const fileRef = compactObject({
    ...(hit.fileRef && typeof hit.fileRef === "object" && !Array.isArray(hit.fileRef) ? hit.fileRef : {}),
    providerId: hit.fileRef?.providerId || hit.providerId || "",
    externalId: hit.fileRef?.externalId || hit.externalId || "",
    syncBatchId: hit.fileRef?.syncBatchId || hit.syncBatchId || "",
    originalFileName: hit.fileRef?.originalFileName || hit.originalFileName || ""
  });
  return compactObject({
    sourceType: firstNonEmptyText(hit.sourceType, hit.kind, hit.type, "local"),
    providerId: firstNonEmptyText(hit.providerId, chatRef.providerId, fileRef.providerId),
    externalId: firstNonEmptyText(hit.externalId, hit.id, chatRef.externalId, fileRef.externalId),
    syncBatchId: firstNonEmptyText(hit.syncBatchId, hit.batchId, chatRef.syncBatchId, fileRef.syncBatchId),
    sourcePath: firstNonEmptyText(hit.sourcePath, hit.path, fileRef.path),
    contentHash: firstNonEmptyText(hit.contentHash, hit.sha256, fileRef.contentHash),
    capturedAt: firstNonEmptyText(hit.capturedAt, hit.timestamp, hit.updatedAt, hit.createdAt),
    originalFileName: firstNonEmptyText(hit.originalFileName, fileRef.originalFileName),
    chatRef,
    fileRef
  });
}

export function sourceLocatorDedupeKey(source = {}) {
  const chatRef = source.chatRef && typeof source.chatRef === "object" ? source.chatRef : {};
  const fileRef = source.fileRef && typeof source.fileRef === "object" ? source.fileRef : {};
  const providerId = firstNonEmptyText(source.providerId, chatRef.providerId, fileRef.providerId);
  const externalId = firstNonEmptyText(source.externalId, chatRef.externalId, fileRef.externalId);
  if (providerId && externalId) {
    return `provider:${providerId}:${externalId}`.toLowerCase();
  }
  const chatKey = [
    providerId,
    chatRef.workspaceId,
    chatRef.conversationId,
    chatRef.messageId,
    chatRef.threadTs || chatRef.replyThreadTs
  ].filter(Boolean).join(":");
  if (chatKey) {
    return `chat:${chatKey}`.toLowerCase();
  }
  const fileKey = firstNonEmptyText(fileRef.storageRelativePath, fileRef.path, source.sourcePath);
  if (fileKey) {
    return `file:${providerId}:${fileKey}`.toLowerCase();
  }
  const contentHash = firstNonEmptyText(source.contentHash, fileRef.contentHash);
  if (contentHash) {
    return `hash:${providerId}:${contentHash}`.toLowerCase();
  }
  return "";
}

export function normalizeLocalMirrorHit({ hit = {}, query = "", settings = {}, referenceMs = Date.now(), index = 0 } = {}) {
  const source = localMirrorSourceLocator(hit);
  const title = firstNonEmptyText(hit.title, hit.subject, hit.name, hit.externalId, hit.id, "本地镜像命中");
  const snippet = truncateText(firstNonEmptyText(hit.snippet, hit.summary, hit.text, hit.body), 700);
  const rawScore = clampNumber(Number(hit.score ?? hit.finalScore ?? hit.relevanceScore ?? 0.5), 0, 1, 0.5);
  const lexicalScore = tokenOverlapRatio(query, [
    title,
    snippet,
    hit.providerId,
    hit.sourceType,
    hit.externalId
  ].filter(Boolean).join("\n"));
  const timestamp = firstTimestamp(hit.timestamp, hit.capturedAt, hit.updatedAt, hit.createdAt);
  const recencyScore = timestamp.timestamp > 0
    ? exponentialRecencyScore(timestamp.timestamp, referenceMs, settings.retrieval || {})
    : 0.5;
  const sourceQuality = source.providerId && source.externalId ? 1 : source.providerId ? 0.7 : 0.4;
  const localScore = clampNumber(
    rawScore * 0.58 + lexicalScore * 0.32 + recencyScore * 0.08 + sourceQuality * 0.02,
    0,
    1,
    rawScore
  );
  const localMirrorWeight = clampNumber(settings.retrieval?.localMirrorWeight, 0, 1, 0.72);
  const finalScore = Number((localScore * localMirrorWeight).toFixed(6));
  const sourceType = source.sourceType || "local";
  const itemId = `local-mirror::${hashText([
    source.providerId,
    sourceType,
    source.externalId,
    source.syncBatchId,
    source.sourcePath,
    title,
    index
  ].join("\u001f"), 24)}`;
  return {
    item: {
      itemId,
      itemType: sourceType,
      documentId: "",
      title,
      snippet,
      score: finalScore,
      finalScore,
      modalities: sourceType === "chat" ? ["chat"] : sourceType === "mail" ? ["mail"] : ["local"],
      source,
      reasons: [
        {
          kind: "local-mirror-query",
          score: finalScore,
          rawScore,
          lexicalScore: Number(lexicalScore.toFixed(6)),
          recencyScore: Number(recencyScore.toFixed(6)),
          sourceQuality,
          weight: localMirrorWeight,
          remoteCalls: false
        }
      ],
      localMirror: {
        matched: true,
        openable: false,
        sourceType,
        providerId: source.providerId || "",
        externalId: source.externalId || "",
        syncBatchId: source.syncBatchId || "",
        timestamp: timestamp.value,
        status: "local_mirror_not_yet_ingested"
      },
      participants: Array.isArray(hit.participants) ? hit.participants : undefined,
      chatRef: source.chatRef,
      fileRef: source.fileRef
    },
    dedupeKey: sourceLocatorDedupeKey(source),
    finalScore
  };
}

export function fusedServerSearchKey(item = {}) {
  const source = item.source && typeof item.source === "object" && !Array.isArray(item.source)
    ? item.source
    : {};
  return sourceLocatorDedupeKey(source) ||
    (item.evidenceId ? `evidence:${String(item.evidenceId).toLowerCase()}` : "") ||
    (item.documentId ? `document:${String(item.documentId).toLowerCase()}` : "") ||
    (item.itemId ? `item:${String(item.itemId).toLowerCase()}` : "");
}

export function fuseLocalMirrorWithKnowledgeItems({
  items = [],
  localHits = [],
  query = "",
  settings = {},
  limit = 20,
  explain = false,
  referenceMs = Date.now()
} = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 20), 100));
  const localCandidates = asArray(localHits)
    .map((hit, index) => normalizeLocalMirrorHit({ hit, query, settings, referenceMs, index }))
    .filter((candidate) => candidate.item.title || candidate.item.snippet);
  if (localCandidates.length === 0) {
    return {
      items: asArray(items).slice(0, safeLimit),
      fusion: null
    };
  }
  const serverItems = asArray(items);
  const maxServerScore = Math.max(0, ...serverItems.map((item) => Number(item.finalScore || item.score || item.relevanceScore || 0)));
  const entries = [];
  const byKey = new Map();
  for (const [index, item] of serverItems.entries()) {
    const rawScore = Number(item.finalScore || item.score || item.relevanceScore || 0);
    const normalizedScore = maxServerScore > 0 ? clampNumber(rawScore / maxServerScore, 0, 1, 0) : rawScore;
    const lexicalScore = tokenOverlapRatio(query, [item.title, item.snippet].filter(Boolean).join("\n"));
    const finalScore = clampNumber(normalizedScore * 0.86 + lexicalScore * 0.14, 0, 1, normalizedScore);
    const entry = {
      key: fusedServerSearchKey(item) || `server:${index}`,
      origin: "knowledge-core",
      rankBias: 0.000001 * Math.max(0, serverItems.length - index),
      finalScore,
      item: {
        ...item,
        finalScore: Number(finalScore.toFixed(6)),
        fusion: {
          origin: "knowledge-core",
          score: Number(finalScore.toFixed(6)),
          normalizedScore: Number(normalizedScore.toFixed(6)),
          lexicalScore: Number(lexicalScore.toFixed(6))
        }
      }
    };
    entries.push(entry);
    if (entry.key) {
      byKey.set(entry.key, entry);
    }
  }
  let mergedLocalCount = 0;
  let appendedLocalCount = 0;
  for (const candidate of localCandidates) {
    const key = candidate.dedupeKey || fusedServerSearchKey(candidate.item);
    const existing = key ? byKey.get(key) : null;
    if (existing) {
      mergedLocalCount += 1;
      existing.finalScore = Math.max(existing.finalScore, candidate.finalScore + 0.04);
      existing.item = {
        ...existing.item,
        finalScore: Number(existing.finalScore.toFixed(6)),
        localMirror: {
          ...(existing.item.localMirror || {}),
          ...candidate.item.localMirror,
          status: "local_mirror_duplicate_of_indexed_evidence"
        },
        reasons: [
          ...asArray(existing.item.reasons),
          ...asArray(candidate.item.reasons)
        ],
        fusion: {
          ...(existing.item.fusion || {}),
          localMirrorMerged: true,
          localMirrorScore: candidate.finalScore,
          score: Number(existing.finalScore.toFixed(6))
        }
      };
      continue;
    }
    appendedLocalCount += 1;
    const entry = {
      key: key || candidate.item.itemId,
      origin: "local-mirror",
      rankBias: -0.000001 * appendedLocalCount,
      finalScore: candidate.finalScore,
      item: {
        ...candidate.item,
        fusion: {
          origin: "local-mirror",
          score: candidate.finalScore,
          remoteCalls: false
        }
      }
    };
    entries.push(entry);
    if (entry.key) {
      byKey.set(entry.key, entry);
    }
  }
  const fusedItems = entries
    .sort((left, right) => (right.finalScore + right.rankBias) - (left.finalScore + left.rankBias))
    .slice(0, safeLimit)
    .map((entry, index) => ({
      ...entry.item,
      rank: index + 1
    }));
  return {
    items: fusedItems,
    fusion: {
      mode: "server-index-plus-local-mirror",
      localQueryRemoteCalls: false,
      serverItemCount: serverItems.length,
      localHitCount: localCandidates.length,
      localMergedCount: mergedLocalCount,
      localAppendedCount: appendedLocalCount,
      returnedLocalOnlyCount: fusedItems.filter((item) => item.localMirror?.status === "local_mirror_not_yet_ingested").length,
      weights: {
        serverIndex: 1,
        localMirror: clampNumber(settings.retrieval?.localMirrorWeight, 0, 1, 0.72)
      },
      ...(explain
        ? {
            localCandidates: localCandidates.slice(0, 12).map((candidate) => ({
              itemId: candidate.item.itemId,
              title: candidate.item.title,
              providerId: candidate.item.localMirror.providerId,
              sourceType: candidate.item.localMirror.sourceType,
              score: candidate.finalScore,
              dedupeKey: candidate.dedupeKey
            }))
          }
        : {})
    }
  };
}
