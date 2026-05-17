import { parseJson } from "./core-utils.mjs";

export function hydrateDocument(row) {
  if (!row) return null;
  return {
    documentId: row.document_id,
    collectionId: row.collection_id,
    batchId: row.batch_id,
    sourceId: row.source_id,
    documentType: row.document_type,
    itemType: row.document_type,
    title: row.title,
    summary: row.summary,
    sourcePath: row.source_path,
    sourceHash: row.source_hash,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function hydrateSection(row) {
  if (!row) return null;
  return {
    sectionId: row.section_id,
    documentId: row.document_id,
    title: row.title,
    level: Number(row.level || 1),
    position: Number(row.position || 0),
    metadata: parseJson(row.metadata_json, {})
  };
}

export function hydrateBlock(row) {
  if (!row) return null;
  return {
    blockId: row.block_id,
    documentId: row.document_id,
    sectionId: row.section_id,
    blockType: row.block_type,
    title: row.title,
    text: row.text,
    snippet: row.snippet,
    position: Number(row.position || 0),
    sourceLocator: parseJson(row.source_locator_json, {}),
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function hydrateAsset(row) {
  if (!row) return null;
  return {
    assetId: row.asset_id,
    documentId: row.document_id,
    sectionId: row.section_id,
    blockId: row.block_id,
    assetType: row.asset_type,
    mediaType: row.media_type,
    title: row.title,
    text: row.text,
    ocrText: row.ocr_text,
    caption: row.caption,
    relativePath: row.relative_path,
    sha256: row.sha256,
    byteSize: Number(row.byte_size || 0),
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    sourceLocator: parseJson(row.source_locator_json, {}),
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function hydrateFeedback(row) {
  if (!row) return null;
  return {
    feedbackId: row.feedback_id,
    clientId: row.client_id,
    query: row.query,
    action: row.action,
    itemId: row.item_id,
    evidenceId: row.evidence_id,
    resultRank: Number(row.result_rank || 0),
    context: parseJson(row.context_json, {}),
    createdAt: row.created_at
  };
}

export function hydrateRetrievalProfile(row) {
  if (!row) return null;
  return {
    profileKey: row.profile_key,
    profileId: row.profile_id,
    version: Number(row.version || 1),
    active: Boolean(row.active),
    weights: parseJson(row.weights_json, {}),
    topK: Number(row.top_k || 20),
    fusionMode: row.fusion_mode,
    reranker: parseJson(row.reranker_json, {}),
    thresholds: parseJson(row.thresholds_json, {}),
    metrics: parseJson(row.metrics_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function hydrateSuggestion(row) {
  if (!row) return null;
  return {
    suggestionId: row.suggestion_id,
    type: row.suggestion_type,
    confidence: Number(row.confidence || 0),
    proposedPatch: parseJson(row.proposed_patch_json, {}),
    evidenceRefs: parseJson(row.evidence_refs_json, []),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at || "",
    resolution: parseJson(row.resolution_json, {})
  };
}

export function hydrateReviewItem(row) {
  if (!row) return null;
  return {
    reviewId: row.review_id,
    source: row.source || "knowledge-core",
    status: row.status,
    reason: row.reason,
    severity: row.severity || "medium",
    operationId: row.operation_id || "",
    batchId: row.batch_id || "",
    entityId: row.entity_id || "",
    entityType: row.entity_type || "",
    title: row.title || "",
    summary: row.summary || "",
    currentRecord: parseJson(row.current_record_json, {}),
    incomingRecord: parseJson(row.incoming_record_json, {}),
    evidenceRefs: parseJson(row.evidence_refs_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at || "",
    resolution: parseJson(row.resolution_json, {})
  };
}

export function hydrateLearningRun(row) {
  if (!row) return null;
  return {
    runId: row.run_id,
    status: row.status,
    input: parseJson(row.input_json, {}),
    metricsBefore: parseJson(row.metrics_before_json, {}),
    metricsAfter: parseJson(row.metrics_after_json, {}),
    candidateProfile: parseJson(row.candidate_profile_json, {}),
    generatedSuggestions: parseJson(row.generated_suggestions_json, []),
    output: parseJson(row.output_json, {}),
    startedAt: row.started_at,
    finishedAt: row.finished_at || ""
  };
}

export function hydrateProfileDeployment(row) {
  if (!row) return null;
  return {
    deploymentId: row.deployment_id,
    profileKey: row.profile_key,
    profileId: row.profile_id,
    version: Number(row.version || 1),
    status: row.status,
    trafficPercent: Number(row.traffic_percent || 0),
    baselineProfileKey: row.baseline_profile_key || "",
    metrics: parseJson(row.metrics_json, {}),
    gate: parseJson(row.gate_json, {}),
    reason: row.reason || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at || ""
  };
}
