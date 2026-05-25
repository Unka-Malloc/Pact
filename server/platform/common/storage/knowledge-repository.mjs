import { randomUUID } from "node:crypto";
import {
  clampLimit,
  normalizeWhitespace,
  truncateText,
  uniqueNormalizedStrings
} from "../data-structure/text-normalization.mjs";

const KNOWLEDGE_ITEM_TYPES = new Set([
  "transaction",
  "thread",
  "message",
  "person",
  "timeline"
]);

const STRUCTURED_PATCH_FIELDS = new Set([
  "title",
  "summary",
  "status",
  "tags",
  "categories",
  "entity",
  "relations",
  "notes",
  "evidenceRefs",
  "classification"
]);

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function stringifyJson(value, fallback = {}) {
  return JSON.stringify(value ?? fallback);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function stableKnowledgeId(itemType, entityId) {
  const type = String(itemType || "").trim();
  const id = String(entityId || "").trim();
  if (!type || !id) {
    return "";
  }
  return id.startsWith(`${type}::`) ? id : `${type}::${id}`;
}

function normalizeItemType(value) {
  const normalized = String(value || "").trim();
  return KNOWLEDGE_ITEM_TYPES.has(normalized) ? normalized : "";
}

function stripRetrievalPrefix(item = {}) {
  const entityType = normalizeItemType(item.entityType);
  const prefix = `retrieval::${entityType}::`;
  const rawId = String(item.id || "");
  return rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entry]) => entry !== undefined && entry !== null)
  );
}

function hydrateItem(row) {
  if (!row) {
    return null;
  }

  return {
    itemId: row.item_id,
    entityId: row.entity_id,
    itemType: row.item_type,
    batchId: row.batch_id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    revision: Number(row.revision || 0),
    serverUpdatedAt: row.server_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags: parseJson(row.tags_json, []),
    categories: parseJson(row.categories_json, []),
    entity: parseJson(row.entity_json, {}),
    metadata: parseJson(row.metadata_json, {})
  };
}

function hydrateChunk(row) {
  if (!row) {
    return null;
  }

  return {
    chunkId: row.chunk_id,
    itemId: row.item_id,
    batchId: row.batch_id,
    text: row.text,
    snippet: row.snippet,
    source: row.source,
    timestamp: row.timestamp,
    metadata: parseJson(row.metadata_json, {}),
    serverUpdatedAt: row.server_updated_at
  };
}

function hydrateEvidence(row) {
  if (!row) {
    return null;
  }

  return {
    evidenceId: row.evidence_id,
    itemId: row.item_id,
    batchId: row.batch_id,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    jobId: row.job_id,
    documentId: row.document_id,
    chunkId: row.chunk_id,
    snippet: row.snippet,
    locator: parseJson(row.locator_json, {}),
    serverUpdatedAt: row.server_updated_at
  };
}

function hydrateGraphNode(row) {
  if (!row) {
    return null;
  }

  return {
    nodeId: row.node_id,
    itemId: row.item_id || "",
    batchId: row.batch_id,
    nodeType: row.node_type,
    label: row.label,
    summary: row.summary,
    weight: Number(row.weight || 0),
    metadata: parseJson(row.metadata_json, {}),
    serverUpdatedAt: row.server_updated_at
  };
}

function hydrateGraphEdge(row) {
  if (!row) {
    return null;
  }

  return {
    edgeId: row.edge_id,
    batchId: row.batch_id,
    sourceId: row.source_id,
    targetId: row.target_id,
    relationType: row.relation_type,
    label: row.label,
    weight: Number(row.weight || 0),
    evidenceIds: parseJson(row.evidence_ids_json, []),
    metadata: parseJson(row.metadata_json, {}),
    serverUpdatedAt: row.server_updated_at
  };
}

function hydrateReviewItem(row) {
  if (!row) {
    return null;
  }

  return {
    reviewId: row.review_id,
    operationId: row.operation_id,
    entityId: row.entity_id,
    entityType: row.entity_type,
    status: row.status,
    reason: row.reason,
    baseRevision: Number(row.base_revision || 0),
    currentRevision: Number(row.current_revision || 0),
    clientId: row.client_id,
    fieldPatch: parseJson(row.field_patch_json, {}),
    serverRecord: parseJson(row.server_record_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at || "",
    resolution: parseJson(row.resolution_json, {})
  };
}

function buildKnowledgeItems(result = {}) {
  const items = [];

  for (const transaction of toArray(result.transactions)) {
    items.push({
      itemId: stableKnowledgeId("transaction", transaction.id),
      entityId: transaction.id,
      itemType: "transaction",
      title: transaction.title || "未命名事务",
      summary: transaction.summary || "",
      status: transaction.status || "",
      tags: uniqueNormalizedStrings(transaction.keywords || []),
      categories: uniqueNormalizedStrings(transaction.categories || []),
      entity: compactObject({
        startedAt: transaction.startedAt || "",
        latestActivityAt: transaction.latestActivityAt || "",
        cadence: transaction.cadence || "",
        participantIds: transaction.participantIds || [],
        threadIds: transaction.threadIds || [],
        messageIds: transaction.messageIds || [],
        timelineEventIds: transaction.timelineEventIds || [],
        decisions: transaction.decisions || [],
        pendingItems: transaction.pendingItems || [],
        sourceDepartments: transaction.sourceDepartments || [],
        lineageId: transaction.lineageId || "",
        lifecycle: transaction.lifecycle || {}
      }),
      metadata: compactObject({
        source: "transaction-analysis",
        timeWeight: transaction.timeWeight || 0,
        freshness: transaction.freshness || "",
        formalUseAllowed: Boolean(transaction.formalUseAllowed)
      })
    });
  }

  for (const thread of toArray(result.threads)) {
    items.push({
      itemId: stableKnowledgeId("thread", thread.id),
      entityId: thread.id,
      itemType: "thread",
      title: thread.subject || "未命名线程",
      summary: thread.summary || "",
      status: thread.status || "",
      tags: uniqueNormalizedStrings(thread.keywords || []),
      categories: uniqueNormalizedStrings(thread.categories || []),
      entity: compactObject({
        startedAt: thread.startedAt || "",
        latestActivityAt: thread.latestActivityAt || "",
        cadence: thread.cadence || "",
        participantIds: thread.participantIds || [],
        senderIds: thread.senderIds || [],
        messageIds: thread.messageIds || [],
        transactionId: thread.transactionId || "",
        pendingSignals: thread.pendingSignals || []
      }),
      metadata: compactObject({
        source: "thread-analysis",
        timeWeight: thread.timeWeight || 0,
        freshness: thread.freshness || "",
        formalUseAllowed: Boolean(thread.formalUseAllowed)
      })
    });
  }

  for (const message of toArray(result.emails)) {
    items.push({
      itemId: stableKnowledgeId("message", message.id),
      entityId: message.id,
      itemType: "message",
      title: message.subject || "未命名邮件",
      summary: message.excerpt || "",
      status: message.status || "",
      tags: uniqueNormalizedStrings(message.keywords || []),
      categories: [],
      entity: compactObject({
        sentAt: message.sentAt || "",
        sourceId: message.sourceId || "",
        rawObjectId: message.rawObjectId || "",
        threadId: message.threadId || "",
        transactionId: message.transactionId || "",
        participantIds: message.participantIds || [],
        chunkIds: message.chunkIds || [],
        messageIdHeader: message.messageIdHeader || "",
        inReplyTo: message.inReplyTo || "",
        references: message.references || []
      }),
      metadata: compactObject({
        source: message.sourceName || "email-message",
        timeWeight: message.timeWeight || 0,
        freshness: message.freshness || "",
        formalUseAllowed: Boolean(message.formalUseAllowed)
      })
    });
  }

  for (const person of toArray(result.people)) {
    items.push({
      itemId: stableKnowledgeId("person", person.id),
      entityId: person.id,
      itemType: "person",
      title: person.name || person.primaryEmail || "未命名参与人",
      summary: person.summary || "",
      status: person.role || "",
      tags: uniqueNormalizedStrings(person.topTopics || []),
      categories: uniqueNormalizedStrings(person.departments || []),
      entity: compactObject({
        primaryEmail: person.primaryEmail || "",
        aliases: person.aliases || [],
        organization: person.organization || "",
        primaryDepartment: person.primaryDepartment || "",
        departments: person.departments || [],
        relation: person.relation || "",
        role: person.role || "",
        sentCount: person.sentCount || 0,
        receivedCount: person.receivedCount || 0,
        transactionCount: person.transactionCount || 0,
        firstSeenAt: person.firstSeenAt || "",
        lastSeenAt: person.lastSeenAt || "",
        topCounterparties: person.topCounterparties || []
      }),
      metadata: compactObject({
        source: "people-analysis",
        timeWeight: person.timeWeight || 0,
        freshness: person.freshness || "",
        formalUseAllowed: Boolean(person.formalUseAllowed)
      })
    });
  }

  for (const event of toArray(result.timeline)) {
    items.push({
      itemId: stableKnowledgeId("timeline", event.id),
      entityId: event.id,
      itemType: "timeline",
      title: event.title || "未命名事件",
      summary: event.summary || "",
      status: event.type || "",
      tags: [],
      categories: [event.timelinePhase || "current"].filter(Boolean),
      entity: compactObject({
        timestamp: event.timestamp || "",
        type: event.type || "",
        source: event.source || "",
        messageId: event.messageId || "",
        threadId: event.threadId || "",
        transactionId: event.transactionId || "",
        participantIds: event.participantIds || [],
        lineageId: event.lineageId || "",
        originBatchId: event.originBatchId || "",
        originTransactionId: event.originTransactionId || ""
      }),
      metadata: compactObject({
        source: "timeline-analysis",
        timeWeight: event.timeWeight || 0,
        freshness: event.freshness || ""
      })
    });
  }

  const seen = new Set();
  return items.filter((item) => {
    if (!item.itemId || seen.has(item.itemId)) {
      return false;
    }
    seen.add(item.itemId);
    return true;
  });
}

function buildRetrievalChunksAndEvidence({ batchId, result = {} }) {
  const chunks = [];
  const evidence = [];

  for (const item of toArray(result.retrieval?.items)) {
    const itemType = normalizeItemType(item.entityType);
    const entityId = stripRetrievalPrefix(item);
    const itemId = stableKnowledgeId(itemType, entityId);
    if (!itemType || !entityId || !itemId) {
      continue;
    }

    const chunkId = `${batchId}::chunk::${item.id}`;
    chunks.push({
      chunkId,
      itemId,
      text: item.text || "",
      snippet: item.snippet || truncateText(item.text || ""),
      source: item.source || "",
      timestamp: item.timestamp || "",
      metadata: compactObject({
        retrievalId: item.id,
        entityType: itemType,
        keywords: item.keywords || [],
        participantIds: item.participantIds || [],
        transactionId: item.transactionId || "",
        threadId: item.threadId || "",
        timeWeight: item.timeWeight || 0,
        freshness: item.freshness || "",
        formalUseAllowed: Boolean(item.formalUseAllowed),
        reviewDueAt: item.reviewDueAt || ""
      })
    });

    evidence.push({
      evidenceId: `${batchId}::evidence::${item.id}`,
      itemId,
      sourceKind: itemType,
      sourceId: entityId,
      jobId: result.jobId || batchId,
      documentId: item.threadId || item.transactionId || entityId,
      chunkId,
      snippet: item.snippet || "",
      locator: compactObject({
        batchId,
        retrievalId: item.id,
        entityType: itemType,
        entityId,
        timestamp: item.timestamp || "",
        source: item.source || "",
        transactionId: item.transactionId || "",
        threadId: item.threadId || "",
        rawObjectId: item.rawObjectId || ""
      })
    });
  }

  return { chunks, evidence };
}

function normalizeNetworkNodeId(node = {}) {
  const itemType = normalizeItemType(node.kind);
  return itemType ? stableKnowledgeId(itemType, node.id) : String(node.id || "");
}

function normalizeNetworkEdgeId(edge = {}) {
  const sourceId = String(edge.sourceId || "");
  const targetId = String(edge.targetId || "");
  const sourceType = sourceId.startsWith("person::") ? "person" : "transaction";
  const targetType = targetId.startsWith("person::") ? "person" : "transaction";
  return `${edge.id || "edge"}::${stableKnowledgeId(sourceType, sourceId)}::${stableKnowledgeId(targetType, targetId)}`;
}

function buildGraphRecords(result = {}) {
  const nodes = [];
  const edges = [];

  for (const node of toArray(result.network?.nodes)) {
    const itemType = normalizeItemType(node.kind);
    const nodeId = normalizeNetworkNodeId(node);
    nodes.push({
      nodeId,
      itemId: itemType ? stableKnowledgeId(itemType, node.id) : "",
      nodeType: itemType || String(node.kind || ""),
      label: node.label || node.id || "",
      summary: node.summary || "",
      weight: Number(node.timeWeight || 0),
      metadata: compactObject({
        source: "analysis-network",
        originalId: node.id || ""
      })
    });
  }

  const knownNodeIds = new Set(nodes.map((node) => node.nodeId));

  function ensureNode(nodeId, nodeType, label = "") {
    if (!nodeId || knownNodeIds.has(nodeId)) {
      return;
    }
    knownNodeIds.add(nodeId);
    nodes.push({
      nodeId,
      itemId: KNOWLEDGE_ITEM_TYPES.has(nodeType) ? nodeId : "",
      nodeType,
      label: label || nodeId,
      summary: "",
      weight: 0,
      metadata: { source: "derived-link" }
    });
  }

  for (const edge of toArray(result.network?.edges)) {
    const rawSourceId = String(edge.sourceId || "");
    const rawTargetId = String(edge.targetId || "");
    const sourceType = rawSourceId.startsWith("person::") ? "person" : "transaction";
    const targetType = rawTargetId.startsWith("person::") ? "person" : "transaction";
    const sourceId = stableKnowledgeId(sourceType, rawSourceId);
    const targetId = stableKnowledgeId(targetType, rawTargetId);
    ensureNode(sourceId, sourceType, rawSourceId);
    ensureNode(targetId, targetType, rawTargetId);
    edges.push({
      edgeId: normalizeNetworkEdgeId(edge),
      sourceId,
      targetId,
      relationType: edge.relation || "relates-to",
      label: edge.relation || "relates-to",
      weight: Number(edge.weight || 0),
      evidenceIds: toArray(edge.evidenceIds).map((id) => stableKnowledgeId("message", id)),
      metadata: compactObject({
        source: "analysis-network",
        originalId: edge.id || ""
      })
    });
  }

  for (const transaction of toArray(result.transactions)) {
    const transactionNodeId = stableKnowledgeId("transaction", transaction.id);
    ensureNode(transactionNodeId, "transaction", transaction.title || transaction.id);
    for (const threadId of toArray(transaction.threadIds)) {
      const threadNodeId = stableKnowledgeId("thread", threadId);
      ensureNode(threadNodeId, "thread", threadId);
      edges.push({
        edgeId: `edge::contains-thread::${transactionNodeId}::${threadNodeId}`,
        sourceId: transactionNodeId,
        targetId: threadNodeId,
        relationType: "contains-thread",
        label: "contains-thread",
        weight: 1,
        evidenceIds: [],
        metadata: { source: "transaction-thread-link" }
      });
    }
  }

  for (const thread of toArray(result.threads)) {
    const threadNodeId = stableKnowledgeId("thread", thread.id);
    ensureNode(threadNodeId, "thread", thread.subject || thread.id);
    for (const messageId of toArray(thread.messageIds)) {
      const messageNodeId = stableKnowledgeId("message", messageId);
      ensureNode(messageNodeId, "message", messageId);
      edges.push({
        edgeId: `edge::contains-message::${threadNodeId}::${messageNodeId}`,
        sourceId: threadNodeId,
        targetId: messageNodeId,
        relationType: "contains-message",
        label: "contains-message",
        weight: 1,
        evidenceIds: [messageNodeId],
        metadata: { source: "thread-message-link" }
      });
    }
  }

  const seenEdges = new Set();
  return {
    nodes,
    edges: edges.filter((edge) => {
      if (!edge.edgeId || seenEdges.has(edge.edgeId)) {
        return false;
      }
      seenEdges.add(edge.edgeId);
      return true;
    })
  };
}

function sanitizeFieldPatch(fieldPatch = {}) {
  const sanitized = {};
  for (const [key, value] of Object.entries(fieldPatch || {})) {
    if (STRUCTURED_PATCH_FIELDS.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function createKnowledgeRepository({ db }) {
  const deleteBatchItemsStmt = db.prepare("DELETE FROM knowledge_items WHERE batch_id = ?");
  const deleteBatchChunksStmt = db.prepare("DELETE FROM knowledge_chunks WHERE batch_id = ?");
  const deleteBatchEvidenceStmt = db.prepare("DELETE FROM knowledge_evidence WHERE batch_id = ?");
  const deleteBatchNodesStmt = db.prepare("DELETE FROM knowledge_graph_nodes WHERE batch_id = ?");
  const deleteBatchEdgesStmt = db.prepare("DELETE FROM knowledge_graph_edges WHERE batch_id = ?");
  const selectItemStmt = db.prepare("SELECT * FROM knowledge_items WHERE item_id = ?");
  const selectItemByEntityStmt = db.prepare(`
    SELECT * FROM knowledge_items
    WHERE item_type = ? AND entity_id = ?
    ORDER BY server_updated_at DESC
    LIMIT 1
  `);
  const insertItemStmt = db.prepare(`
    INSERT INTO knowledge_items (
      item_id, batch_id, entity_id, item_type, title, summary, status, revision,
      server_updated_at, created_at, updated_at, tags_json, categories_json, entity_json,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET
      batch_id = excluded.batch_id,
      entity_id = excluded.entity_id,
      item_type = excluded.item_type,
      title = excluded.title,
      summary = excluded.summary,
      status = excluded.status,
      revision = knowledge_items.revision + 1,
      server_updated_at = excluded.server_updated_at,
      updated_at = excluded.updated_at,
      tags_json = excluded.tags_json,
      categories_json = excluded.categories_json,
      entity_json = excluded.entity_json,
      metadata_json = excluded.metadata_json
  `);
  const updateItemPatchStmt = db.prepare(`
    UPDATE knowledge_items
    SET
      title = ?,
      summary = ?,
      status = ?,
      tags_json = ?,
      categories_json = ?,
      entity_json = ?,
      metadata_json = ?,
      revision = revision + 1,
      server_updated_at = ?,
      updated_at = ?
    WHERE item_id = ?
  `);
  const insertChunkStmt = db.prepare(`
    INSERT INTO knowledge_chunks (
      chunk_id, item_id, batch_id, text, snippet, source, timestamp, metadata_json,
      server_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chunk_id) DO UPDATE SET
      item_id = excluded.item_id,
      batch_id = excluded.batch_id,
      text = excluded.text,
      snippet = excluded.snippet,
      source = excluded.source,
      timestamp = excluded.timestamp,
      metadata_json = excluded.metadata_json,
      server_updated_at = excluded.server_updated_at
  `);
  const insertEvidenceStmt = db.prepare(`
    INSERT INTO knowledge_evidence (
      evidence_id, item_id, batch_id, source_kind, source_id, job_id, document_id,
      chunk_id, snippet, locator_json, server_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(evidence_id) DO UPDATE SET
      item_id = excluded.item_id,
      batch_id = excluded.batch_id,
      source_kind = excluded.source_kind,
      source_id = excluded.source_id,
      job_id = excluded.job_id,
      document_id = excluded.document_id,
      chunk_id = excluded.chunk_id,
      snippet = excluded.snippet,
      locator_json = excluded.locator_json,
      server_updated_at = excluded.server_updated_at
  `);
  const insertGraphNodeStmt = db.prepare(`
    INSERT INTO knowledge_graph_nodes (
      node_id, item_id, batch_id, node_type, label, summary, weight, metadata_json,
      server_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(node_id) DO UPDATE SET
      item_id = excluded.item_id,
      batch_id = excluded.batch_id,
      node_type = excluded.node_type,
      label = excluded.label,
      summary = excluded.summary,
      weight = excluded.weight,
      metadata_json = excluded.metadata_json,
      server_updated_at = excluded.server_updated_at
  `);
  const insertGraphEdgeStmt = db.prepare(`
    INSERT INTO knowledge_graph_edges (
      edge_id, batch_id, source_id, target_id, relation_type, label, weight,
      evidence_ids_json, metadata_json, server_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(edge_id) DO UPDATE SET
      batch_id = excluded.batch_id,
      source_id = excluded.source_id,
      target_id = excluded.target_id,
      relation_type = excluded.relation_type,
      label = excluded.label,
      weight = excluded.weight,
      evidence_ids_json = excluded.evidence_ids_json,
      metadata_json = excluded.metadata_json,
      server_updated_at = excluded.server_updated_at
  `);
  const insertChangeStmt = db.prepare(`
    INSERT INTO knowledge_change_log (
      kind, action, entity_id, item_id, batch_id, revision, server_updated_at, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectChangesStmt = db.prepare(`
    SELECT * FROM knowledge_change_log
    WHERE cursor > ?
    ORDER BY cursor ASC
    LIMIT ?
  `);
  const selectMaxCursorStmt = db.prepare("SELECT COALESCE(MAX(cursor), 0) AS cursor FROM knowledge_change_log");
  const selectItemChunksStmt = db.prepare(`
    SELECT * FROM knowledge_chunks
    WHERE item_id = ?
    ORDER BY timestamp DESC, chunk_id ASC
    LIMIT ?
  `);
  const selectItemEvidenceStmt = db.prepare(`
    SELECT * FROM knowledge_evidence
    WHERE item_id = ?
    ORDER BY server_updated_at DESC, evidence_id ASC
    LIMIT ?
  `);
  const selectGraphNodeStmt = db.prepare("SELECT * FROM knowledge_graph_nodes WHERE node_id = ?");
  const selectEdgesByNodeStmt = db.prepare(`
    SELECT * FROM knowledge_graph_edges
    WHERE source_id = ? OR target_id = ?
    ORDER BY weight DESC, edge_id ASC
    LIMIT ?
  `);
  const insertClientChangeStmt = db.prepare(`
    INSERT INTO knowledge_client_changes (
      operation_id, entity_id, entity_type, base_revision, field_patch_json, client_id,
      status, created_at, applied_at, response_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(operation_id) DO UPDATE SET
      entity_id = excluded.entity_id,
      entity_type = excluded.entity_type,
      base_revision = excluded.base_revision,
      field_patch_json = excluded.field_patch_json,
      client_id = excluded.client_id,
      status = excluded.status,
      applied_at = excluded.applied_at,
      response_json = excluded.response_json
  `);
  const selectClientChangeStmt = db.prepare(
    "SELECT * FROM knowledge_client_changes WHERE operation_id = ?"
  );
  const insertReviewItemStmt = db.prepare(`
    INSERT INTO knowledge_review_items (
      review_id, operation_id, entity_id, entity_type, status, reason, base_revision,
      current_revision, client_id, field_patch_json, server_record_json, created_at,
      updated_at, resolved_at, resolution_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(review_id) DO UPDATE SET
      status = excluded.status,
      reason = excluded.reason,
      current_revision = excluded.current_revision,
      field_patch_json = excluded.field_patch_json,
      server_record_json = excluded.server_record_json,
      updated_at = excluded.updated_at,
      resolved_at = excluded.resolved_at,
      resolution_json = excluded.resolution_json
  `);
  const selectReviewItemStmt = db.prepare("SELECT * FROM knowledge_review_items WHERE review_id = ?");
  const listReviewItemsStmt = db.prepare(`
    SELECT * FROM knowledge_review_items
    WHERE (? = '' OR status = ?)
    ORDER BY updated_at DESC
    LIMIT ?
  `);
  const selectSummaryStmt = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM knowledge_items) AS item_count,
      (SELECT COUNT(*) FROM knowledge_chunks) AS chunk_count,
      (SELECT COUNT(*) FROM knowledge_evidence) AS evidence_count,
      (SELECT COUNT(*) FROM knowledge_graph_nodes) AS graph_node_count,
      (SELECT COUNT(*) FROM knowledge_graph_edges) AS graph_edge_count,
      (SELECT COUNT(*) FROM knowledge_review_items WHERE status = 'pending') AS pending_review_count
  `);

  function appendChange({ kind, action = "upsert", entityId = "", itemId = "", batchId = "", revision = 0, payload = {}, at = nowIso() }) {
    insertChangeStmt.run(
      kind,
      action,
      entityId,
      itemId,
      batchId,
      Number(revision || 0),
      at,
      stringifyJson(payload)
    );
  }

  function resolveItem(input = {}) {
    const itemId = String(input.itemId || "").trim();
    if (itemId) {
      return hydrateItem(selectItemStmt.get(itemId));
    }

    const entityType = normalizeItemType(input.entityType || input.itemType);
    const entityId = String(input.entityId || "").trim();
    if (entityType && entityId) {
      const prefixedId = stableKnowledgeId(entityType, entityId);
      return hydrateItem(selectItemStmt.get(prefixedId)) || hydrateItem(selectItemByEntityStmt.get(entityType, entityId));
    }

    return null;
  }

  function applyStructuredPatch(item, fieldPatch, timestamp) {
    const sanitizedPatch = sanitizeFieldPatch(fieldPatch);
    const next = {
      ...item,
      title:
        typeof sanitizedPatch.title === "string"
          ? normalizeWhitespace(sanitizedPatch.title) || item.title
          : item.title,
      summary:
        typeof sanitizedPatch.summary === "string"
          ? normalizeWhitespace(sanitizedPatch.summary)
          : item.summary,
      status:
        typeof sanitizedPatch.status === "string"
          ? normalizeWhitespace(sanitizedPatch.status)
          : item.status,
      tags: Array.isArray(sanitizedPatch.tags)
        ? uniqueNormalizedStrings(sanitizedPatch.tags)
        : item.tags,
      categories: Array.isArray(sanitizedPatch.categories)
        ? uniqueNormalizedStrings(sanitizedPatch.categories)
        : item.categories,
      entity:
        sanitizedPatch.entity && typeof sanitizedPatch.entity === "object"
          ? {
              ...(item.entity || {}),
              ...sanitizedPatch.entity
            }
          : item.entity,
      metadata: {
        ...(item.metadata || {}),
        clientStructuredPatch:
          Object.keys(sanitizedPatch).length > 0
            ? {
                relations: sanitizedPatch.relations || undefined,
                notes: sanitizedPatch.notes || undefined,
                evidenceRefs: sanitizedPatch.evidenceRefs || undefined,
                classification: sanitizedPatch.classification || undefined,
                patchedAt: timestamp
              }
            : item.metadata?.clientStructuredPatch
      }
    };

    updateItemPatchStmt.run(
      next.title,
      next.summary,
      next.status,
      stringifyJson(next.tags, []),
      stringifyJson(next.categories, []),
      stringifyJson(next.entity),
      stringifyJson(next.metadata),
      timestamp,
      timestamp,
      item.itemId
    );

    return hydrateItem(selectItemStmt.get(item.itemId));
  }

  function recordReviewItem({
    operationId,
    item,
    entityId,
    entityType,
    baseRevision,
    clientId,
    fieldPatch,
    reason,
    timestamp
  }) {
    const reviewId = `review::${operationId || randomUUID()}`;
    const serverRecord = item || null;
    insertReviewItemStmt.run(
      reviewId,
      operationId || "",
      entityId || "",
      entityType || "",
      "pending",
      reason,
      Number(baseRevision || 0),
      Number(item?.revision || 0),
      clientId || "",
      stringifyJson(fieldPatch),
      stringifyJson(serverRecord),
      timestamp,
      timestamp,
      "",
      "{}"
    );
    const reviewItem = hydrateReviewItem(selectReviewItemStmt.get(reviewId));
    appendChange({
      kind: "reviewItem",
      entityId: reviewItem.entityId,
      itemId: reviewItem.entityId,
      batchId: item?.batchId || "",
      revision: reviewItem.currentRevision,
      payload: reviewItem,
      at: timestamp
    });
    return reviewItem;
  }

  function submitSingleChange(change = {}) {
    const timestamp = nowIso();
    const operationId = String(change.operationId || "").trim() || randomUUID();
    const entityType = normalizeItemType(change.entityType || change.itemType);
    const rawEntityId = String(change.entityId || change.itemId || "").trim();
    const entityId = rawEntityId.startsWith(`${entityType}::`)
      ? rawEntityId.slice(entityType.length + 2)
      : rawEntityId;
    const baseRevision = Number(change.baseRevision || 0);
    const clientId = String(change.clientId || "").trim();
    const fieldPatch = sanitizeFieldPatch(change.fieldPatch || change.patch || {});
    const item = resolveItem({
      itemId: rawEntityId.includes("::") ? rawEntityId : "",
      entityType,
      entityId
    });

    if (selectClientChangeStmt.get(operationId)) {
      return {
        operationId,
        status: "duplicate"
      };
    }

    if (!item) {
      const reviewItem = recordReviewItem({
        operationId,
        item: null,
        entityId: rawEntityId || entityId,
        entityType,
        baseRevision,
        clientId,
        fieldPatch,
        reason: "missing_entity",
        timestamp
      });
      insertClientChangeStmt.run(
        operationId,
        rawEntityId || entityId,
        entityType,
        baseRevision,
        stringifyJson(fieldPatch),
        clientId,
        "conflict",
        change.createdAt || timestamp,
        "",
        stringifyJson({ reviewItem })
      );
      return {
        operationId,
        status: "conflict",
        reviewItem
      };
    }

    if (item.revision !== baseRevision) {
      const reviewItem = recordReviewItem({
        operationId,
        item,
        entityId: item.itemId,
        entityType: item.itemType,
        baseRevision,
        clientId,
        fieldPatch,
        reason: "revision_conflict",
        timestamp
      });
      insertClientChangeStmt.run(
        operationId,
        item.itemId,
        item.itemType,
        baseRevision,
        stringifyJson(fieldPatch),
        clientId,
        "conflict",
        change.createdAt || timestamp,
        "",
        stringifyJson({ reviewItem })
      );
      return {
        operationId,
        status: "conflict",
        reviewItem
      };
    }

    const updated = applyStructuredPatch(item, fieldPatch, timestamp);
    insertClientChangeStmt.run(
      operationId,
      updated.itemId,
      updated.itemType,
      baseRevision,
      stringifyJson(fieldPatch),
      clientId,
      "applied",
      change.createdAt || timestamp,
      timestamp,
      stringifyJson({ item: updated })
    );
    appendChange({
      kind: "item",
      entityId: updated.entityId,
      itemId: updated.itemId,
      batchId: updated.batchId,
      revision: updated.revision,
      payload: updated,
      at: timestamp
    });
    return {
      operationId,
      status: "applied",
      item: updated
    };
  }

  function persistCanonicalKnowledge({ batchId, knowledge, now = nowIso() }) {
    deleteBatchItemsStmt.run(batchId);
    deleteBatchChunksStmt.run(batchId);
    deleteBatchEvidenceStmt.run(batchId);
    deleteBatchNodesStmt.run(batchId);
    deleteBatchEdgesStmt.run(batchId);

    for (const item of knowledge.items || []) {
      insertItemStmt.run(
        item.itemId,
        batchId,
        item.entityId,
        item.itemType,
        item.title,
        item.summary,
        item.status,
        1,
        now,
        now,
        now,
        stringifyJson(item.tags, []),
        stringifyJson(item.categories, []),
        stringifyJson(item.entity),
        stringifyJson(item.metadata)
      );
      const persisted = hydrateItem(selectItemStmt.get(item.itemId));
      appendChange({
        kind: "item",
        entityId: persisted.entityId,
        itemId: persisted.itemId,
        batchId,
        revision: persisted.revision,
        payload: persisted,
        at: now
      });
    }

    for (const chunk of knowledge.chunks || []) {
      insertChunkStmt.run(
        chunk.chunkId,
        chunk.itemId,
        batchId,
        chunk.text,
        chunk.snippet,
        chunk.source,
        chunk.timestamp,
        stringifyJson(chunk.metadata),
        now
      );
      appendChange({
        kind: "chunk",
        entityId: chunk.chunkId,
        itemId: chunk.itemId,
        batchId,
        payload: {
          ...chunk,
          batchId,
          serverUpdatedAt: now
        },
        at: now
      });
    }

    for (const item of knowledge.evidence || []) {
      insertEvidenceStmt.run(
        item.evidenceId,
        item.itemId,
        batchId,
        item.sourceKind,
        item.sourceId,
        item.jobId,
        item.documentId,
        item.chunkId,
        item.snippet,
        stringifyJson(item.locator),
        now
      );
      appendChange({
        kind: "evidence",
        entityId: item.evidenceId,
        itemId: item.itemId,
        batchId,
        payload: {
          ...item,
          batchId,
          serverUpdatedAt: now
        },
        at: now
      });
    }

    for (const node of knowledge.graph?.nodes || []) {
      insertGraphNodeStmt.run(
        node.nodeId,
        node.itemId || "",
        batchId,
        node.nodeType,
        node.label,
        node.summary || "",
        Number(node.weight || 0),
        stringifyJson(node.metadata),
        now
      );
      appendChange({
        kind: "graphNode",
        entityId: node.nodeId,
        itemId: node.itemId || "",
        batchId,
        payload: {
          ...node,
          batchId,
          serverUpdatedAt: now
        },
        at: now
      });
    }

    for (const edge of knowledge.graph?.edges || []) {
      insertGraphEdgeStmt.run(
        edge.edgeId,
        batchId,
        edge.sourceId,
        edge.targetId,
        edge.relationType,
        edge.label,
        Number(edge.weight || 0),
        stringifyJson(edge.evidenceIds, []),
        stringifyJson(edge.metadata),
        now
      );
      appendChange({
        kind: "graphEdge",
        entityId: edge.edgeId,
        batchId,
        payload: {
          ...edge,
          batchId,
          serverUpdatedAt: now
        },
        at: now
      });
    }
  }

  return {
    buildCanonicalKnowledge({ batchId, result }) {
      const items = buildKnowledgeItems(result);
      const { chunks, evidence } = buildRetrievalChunksAndEvidence({ batchId, result });
      const graph = buildGraphRecords(result);
      return {
        version: 1,
        batchId,
        generatedAt: result.generatedAt || nowIso(),
        items,
        chunks,
        evidence,
        graph,
        collections: [
          {
            collectionId: `collection::batch::${batchId}`,
            title: result.overview?.summary || `Batch ${batchId}`,
            itemIds: items.map((item) => item.itemId)
          }
        ]
      };
    },
    persistCanonicalKnowledge,
    deleteBatch(batchId) {
      db.exec("BEGIN");
      try {
        deleteBatchItemsStmt.run(batchId);
        deleteBatchChunksStmt.run(batchId);
        deleteBatchEvidenceStmt.run(batchId);
        deleteBatchNodesStmt.run(batchId);
        deleteBatchEdgesStmt.run(batchId);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    getStorageSummary() {
      const row = selectSummaryStmt.get() || {};
      return {
        itemCount: row.item_count || 0,
        chunkCount: row.chunk_count || 0,
        evidenceCount: row.evidence_count || 0,
        graphNodeCount: row.graph_node_count || 0,
        graphEdgeCount: row.graph_edge_count || 0,
        pendingReviewCount: row.pending_review_count || 0
      };
    },
    sync({ since = 0, limit = 500 } = {}) {
      const safeLimit = clampLimit(limit, 500, 2000);
      const rows = selectChangesStmt.all(Number(since || 0), safeLimit);
      const maxCursor = Number(selectMaxCursorStmt.get()?.cursor || 0);
      const lastCursor = rows.length > 0 ? rows[rows.length - 1].cursor : Number(since || 0);
      return {
        cursor: String(Math.max(lastCursor, Number(since || 0))),
        latestCursor: String(maxCursor),
        hasMore: rows.length >= safeLimit && lastCursor < maxCursor,
        cachePolicy: {
          scope: "summary",
          storesFullEvidence: false,
          storesNormalizedDocuments: false,
          storesOriginalAttachments: false,
          recommendedMaxSnippetDays: 180
        },
        changes: rows.map((row) => ({
          cursor: String(row.cursor),
          kind: row.kind,
          action: row.action,
          entityId: row.entity_id,
          itemId: row.item_id || "",
          batchId: row.batch_id || "",
          revision: Number(row.revision || 0),
          serverUpdatedAt: row.server_updated_at,
          record: parseJson(row.payload_json, {})
        }))
      };
    },
    submitChanges({ changes = [] } = {}) {
      const accepted = [];
      const conflicts = [];
      const duplicates = [];
      const rejected = [];

      db.exec("BEGIN");
      try {
        for (const change of toArray(changes)) {
          const result = submitSingleChange(change);
          if (result.status === "applied") {
            accepted.push(result);
          } else if (result.status === "conflict") {
            conflicts.push(result);
          } else if (result.status === "duplicate") {
            duplicates.push(result);
          } else {
            rejected.push(result);
          }
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      return {
        ok: rejected.length === 0,
        accepted,
        conflicts,
        duplicates,
        rejected
      };
    },
    listReviewItems({ status = "pending", limit = 100 } = {}) {
      const normalizedStatus = String(status || "").trim();
      return {
        status: normalizedStatus || "",
        items: listReviewItemsStmt
          .all(normalizedStatus, normalizedStatus, clampLimit(limit, 100, 500))
          .map(hydrateReviewItem)
      };
    },
    resolveReviewItem({ reviewId, resolution = "reject", patch = {} } = {}) {
      const timestamp = nowIso();
      const current = hydrateReviewItem(selectReviewItemStmt.get(reviewId));
      if (!current) {
        return null;
      }

      let resolvedItem = null;
      const normalizedResolution = String(resolution || "").trim() || "reject";
      if (normalizedResolution === "accept" || normalizedResolution === "merge") {
        const item = resolveItem({
          itemId: current.entityId,
          entityType: current.entityType,
          entityId: current.entityId
        });
        if (item) {
          resolvedItem = applyStructuredPatch(
            item,
            normalizedResolution === "merge" ? patch || current.fieldPatch : current.fieldPatch,
            timestamp
          );
          appendChange({
            kind: "item",
            entityId: resolvedItem.entityId,
            itemId: resolvedItem.itemId,
            batchId: resolvedItem.batchId,
            revision: resolvedItem.revision,
            payload: resolvedItem,
            at: timestamp
          });
        }
      }

      const nextStatus =
        normalizedResolution === "accept" || normalizedResolution === "merge"
          ? "resolved"
          : "rejected";
      insertReviewItemStmt.run(
        current.reviewId,
        current.operationId,
        current.entityId,
        current.entityType,
        nextStatus,
        current.reason,
        current.baseRevision,
        resolvedItem?.revision || current.currentRevision,
        current.clientId,
        stringifyJson(current.fieldPatch),
        stringifyJson(resolvedItem || current.serverRecord),
        current.createdAt,
        timestamp,
        timestamp,
        stringifyJson({
          resolution: normalizedResolution,
          patch: patch || {},
          resolvedItemId: resolvedItem?.itemId || ""
        })
      );
      const reviewItem = hydrateReviewItem(selectReviewItemStmt.get(current.reviewId));
      appendChange({
        kind: "reviewItem",
        action: nextStatus,
        entityId: reviewItem.entityId,
        itemId: reviewItem.entityId,
        batchId: resolvedItem?.batchId || "",
        revision: reviewItem.currentRevision,
        payload: reviewItem,
        at: timestamp
      });
      return reviewItem;
    },
    search({ query = "", limit = 20, itemTypes = [], batchId = "" } = {}) {
      const safeLimit = clampLimit(limit, 20, 200);
      const normalizedQuery = normalizeWhitespace(query);
      const normalizedTypes = uniqueNormalizedStrings(itemTypes).filter((item) =>
        KNOWLEDGE_ITEM_TYPES.has(item)
      );
      const filters = [];
      const params = [];

      if (normalizedQuery) {
        const like = `%${normalizedQuery}%`;
        filters.push(
          "(title LIKE ? OR summary LIKE ? OR tags_json LIKE ? OR categories_json LIKE ? OR entity_json LIKE ?)"
        );
        params.push(like, like, like, like, like);
      }

      if (batchId) {
        filters.push("batch_id = ?");
        params.push(batchId);
      }

      if (normalizedTypes.length > 0) {
        filters.push(`item_type IN (${normalizedTypes.map(() => "?").join(", ")})`);
        params.push(...normalizedTypes);
      }

      const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const rows = db
        .prepare(`
          SELECT *
          FROM knowledge_items
          ${where}
          ORDER BY server_updated_at DESC, revision DESC
          LIMIT ?
        `)
        .all(...params, safeLimit)
        .map(hydrateItem);

      return {
        query: normalizedQuery,
        limit: safeLimit,
        itemTypes: normalizedTypes,
        items: rows.map((item) => ({
          ...item,
          snippet: truncateText(item.summary || item.title || "", 180),
          evidence: selectItemEvidenceStmt.all(item.itemId, 3).map(hydrateEvidence),
          graphHints: selectEdgesByNodeStmt.all(item.itemId, item.itemId, 6).map(hydrateGraphEdge)
        }))
      };
    },
    getItem({ itemId, entityType, entityId } = {}) {
      const item = resolveItem({ itemId, entityType, entityId });
      if (!item) {
        return null;
      }
      return {
        ...item,
        chunks: selectItemChunksStmt.all(item.itemId, 25).map(hydrateChunk),
        evidence: selectItemEvidenceStmt.all(item.itemId, 25).map(hydrateEvidence),
        graphHints: selectEdgesByNodeStmt.all(item.itemId, item.itemId, 25).map(hydrateGraphEdge)
      };
    },
    getGraph({ seed = "", depth = 1, limit = 120 } = {}) {
      const safeDepth = Math.max(0, Math.min(Number(depth || 1), 3));
      const safeLimit = clampLimit(limit, 120, 500);
      const startNodeId = String(seed || "").trim();
      const nodes = new Map();
      const edges = new Map();
      const queue = [{ nodeId: startNodeId, depth: 0 }];
      const visited = new Set();

      while (queue.length > 0 && nodes.size < safeLimit) {
        const current = queue.shift();
        if (!current?.nodeId || visited.has(current.nodeId)) {
          continue;
        }
        visited.add(current.nodeId);

        const node = hydrateGraphNode(selectGraphNodeStmt.get(current.nodeId));
        if (node) {
          nodes.set(node.nodeId, node);
        }

        if (current.depth >= safeDepth) {
          continue;
        }

        for (const edge of selectEdgesByNodeStmt.all(current.nodeId, current.nodeId, safeLimit)) {
          const hydrated = hydrateGraphEdge(edge);
          edges.set(hydrated.edgeId, hydrated);
          const nextNodeId = hydrated.sourceId === current.nodeId ? hydrated.targetId : hydrated.sourceId;
          if (!visited.has(nextNodeId)) {
            queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
          }
        }
      }

      return {
        seed: startNodeId,
        depth: safeDepth,
        nodes: [...nodes.values()],
        edges: [...edges.values()]
      };
    }
  };
}
