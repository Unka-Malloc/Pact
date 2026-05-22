export const PREPROCESS_RESULT_SCHEMA_VERSION = 1;
export const PREPROCESS_RESULT_TYPE = "pact.knowledge.preprocess-result";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function scalar(value) {
  return String(value ?? "").trim();
}

function shallowObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function lineNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function stringArray(value) {
  return asArray(value).map(scalar).filter(Boolean);
}

function sanitizeSourceRange(value = {}) {
  const range = shallowObject(value);
  return {
    startLine: lineNumber(range.startLine),
    endLine: lineNumber(range.endLine)
  };
}

function sanitizeSource(source = {}) {
  const rawObject = shallowObject(source.rawObject);
  return {
    id: scalar(source.id),
    name: scalar(source.name),
    path: scalar(source.path),
    kind: scalar(source.kind),
    sourceCreatedAt: scalar(source.sourceCreatedAt),
    sourceUpdatedAt: scalar(source.sourceUpdatedAt),
    sourceCollectedAt: scalar(source.sourceCollectedAt),
    mediaType: scalar(source.mediaType || rawObject.mediaType),
    textLength: scalar(source.text).length,
    rawObjectId: scalar(rawObject.objectId),
    clientUid: scalar(rawObject.clientUid),
    sourceType: scalar(rawObject.sourceType),
    providerId: scalar(source.providerId || rawObject.providerId),
    externalId: scalar(source.externalId || rawObject.externalId),
    syncBatchId: scalar(source.syncBatchId || rawObject.syncBatchId),
    contentHash: scalar(source.contentHash || rawObject.contentHash || source.originalSha256),
    capturedAt: scalar(source.capturedAt || rawObject.capturedAt),
    originalFileName: scalar(rawObject.originalFileName),
    originalRelativePath: scalar(rawObject.originalRelativePath || source.originalRelativePath),
    storageRelativePath: scalar(rawObject.storageRelativePath),
    documentParserId: scalar(source.documentParserId),
    documentMetadata: shallowObject(source.documentMetadata),
    sourceMetadata: shallowObject(source.sourceMetadata || rawObject.sourceMetadata)
  };
}

function sanitizeBlock(block = {}, position = 0) {
  return {
    id: scalar(block.id),
    sourceId: scalar(block.sourceId),
    sourceName: scalar(block.sourceName),
    kind: scalar(block.kind),
    level: Number.isFinite(Number(block.level)) ? Number(block.level) : 0,
    text: scalar(block.text),
    sourceStartLine: lineNumber(block.sourceStartLine),
    sourceEndLine: lineNumber(block.sourceEndLine),
    titlePath: stringArray(block.titlePath),
    headingPath: stringArray(block.headingPath),
    sectionId: scalar(block.sectionId),
    sectionTitle: scalar(block.sectionTitle),
    sectionLevel: Number.isFinite(Number(block.sectionLevel)) ? Number(block.sectionLevel) : 0,
    position: Number(position) + 1,
    metadata: shallowObject(block.metadata)
  };
}

function sanitizeChunk(chunk = {}, position = 0) {
  return {
    id: scalar(chunk.id),
    sourceId: scalar(chunk.sourceId),
    sourceName: scalar(chunk.sourceName),
    sourceCreatedAt: scalar(chunk.sourceCreatedAt),
    sourceUpdatedAt: scalar(chunk.sourceUpdatedAt),
    sourceCollectedAt: scalar(chunk.sourceCollectedAt),
    title: scalar(chunk.title),
    titlePath: stringArray(chunk.titlePath),
    headingPath: stringArray(chunk.headingPath),
    blockIds: stringArray(chunk.blockIds),
    sectionId: scalar(chunk.sectionId),
    sectionTitle: scalar(chunk.sectionTitle),
    sectionLevel: Number.isFinite(Number(chunk.sectionLevel)) ? Number(chunk.sectionLevel) : 0,
    chunkType: scalar(chunk.chunkType),
    content: scalar(chunk.content),
    tokenCount: Number.isFinite(Number(chunk.tokenCount)) ? Number(chunk.tokenCount) : 0,
    charCount: Number.isFinite(Number(chunk.charCount)) ? Number(chunk.charCount) : scalar(chunk.content).length,
    overlapTokenCount: Number.isFinite(Number(chunk.overlapTokenCount)) ? Number(chunk.overlapTokenCount) : 0,
    sourceRange: sanitizeSourceRange(chunk.sourceRange),
    sourceStartLine: lineNumber(chunk.sourceStartLine),
    sourceEndLine: lineNumber(chunk.sourceEndLine),
    position: Number(position) + 1,
    metadata: shallowObject(chunk.metadata)
  };
}

function sanitizeArtifact(artifact = {}, position = 0) {
  return {
    id: scalar(artifact.id || artifact.documentId || artifact.relativePath || `artifact-${position + 1}`),
    kind: scalar(artifact.kind || artifact.type || "artifact"),
    relativePath: scalar(artifact.relativePath),
    title: scalar(artifact.title),
    metadata: shallowObject(artifact.metadata)
  };
}

function sanitizeStructureArtifact(artifact = {}, position = 0) {
  const id = scalar(artifact.artifactId || artifact.id || `structure-artifact-${position + 1}`);
  return {
    ...shallowObject(artifact),
    artifactId: id,
    id,
    policyId: scalar(artifact.policyId),
    sourceId: scalar(artifact.sourceId),
    sourceName: scalar(artifact.sourceName),
    blockId: scalar(artifact.blockId),
    artifactType: scalar(artifact.artifactType || artifact.kind || "paragraph"),
    text: scalar(artifact.text),
    tokenCount: Number.isFinite(Number(artifact.tokenCount)) ? Number(artifact.tokenCount) : 0,
    charCount: Number.isFinite(Number(artifact.charCount)) ? Number(artifact.charCount) : scalar(artifact.text).length,
    byteLength: Number.isFinite(Number(artifact.byteLength)) ? Number(artifact.byteLength) : 0,
    order: Number.isFinite(Number(artifact.order)) ? Number(artifact.order) : position + 1,
    headingPath: stringArray(artifact.headingPath),
    titlePath: stringArray(artifact.titlePath),
    sourceRange: sanitizeSourceRange(artifact.sourceRange),
    pageRange: shallowObject(artifact.pageRange),
    tableHeaders: stringArray(artifact.tableHeaders),
    rowRange: shallowObject(artifact.rowRange),
    columnRange: shallowObject(artifact.columnRange),
    textDigest: scalar(artifact.textDigest),
    assetRefs: stringArray(artifact.assetRefs),
    parentArtifactId: scalar(artifact.parentArtifactId),
    childrenArtifactIds: stringArray(artifact.childrenArtifactIds),
    metadata: shallowObject(artifact.metadata)
  };
}

function sanitizeGranularityFragment(fragment = {}, position = 0) {
  const id = scalar(fragment.fragmentId || fragment.id || `granularity-fragment-${position + 1}`);
  return {
    ...shallowObject(fragment),
    fragmentId: id,
    id,
    policyId: scalar(fragment.policyId),
    parentArtifactId: scalar(fragment.parentArtifactId),
    sourceId: scalar(fragment.sourceId),
    sourceName: scalar(fragment.sourceName),
    blockId: scalar(fragment.blockId),
    artifactType: scalar(fragment.artifactType || "paragraph"),
    granularity: scalar(fragment.granularity || "token-window"),
    fragmentRange: shallowObject(fragment.fragmentRange),
    text: scalar(fragment.text),
    tokenCount: Number.isFinite(Number(fragment.tokenCount)) ? Number(fragment.tokenCount) : 0,
    charCount: Number.isFinite(Number(fragment.charCount)) ? Number(fragment.charCount) : scalar(fragment.text).length,
    byteLength: Number.isFinite(Number(fragment.byteLength)) ? Number(fragment.byteLength) : 0,
    order: Number.isFinite(Number(fragment.order)) ? Number(fragment.order) : position + 1,
    headingPath: stringArray(fragment.headingPath),
    titlePath: stringArray(fragment.titlePath),
    sourceRange: sanitizeSourceRange(fragment.sourceRange),
    completeOriginalAvailable: fragment.completeOriginalAvailable !== false,
    fragmentationTrace: shallowObject(fragment.fragmentationTrace),
    metadata: shallowObject(fragment.metadata)
  };
}

export function createPreprocessResult({
  generatedAt = new Date().toISOString(),
  sources = [],
  blocks = [],
  chunks = [],
  structureArtifacts = [],
  granularityFragments = [],
  artifacts = [],
  warnings = []
} = {}) {
  const normalizedSources = asArray(sources).map(sanitizeSource).filter((source) => source.id);
  const normalizedBlocks = asArray(blocks).map(sanitizeBlock).filter((block) => block.id);
  const normalizedChunks = asArray(chunks).map(sanitizeChunk).filter((chunk) => chunk.id);
  const normalizedStructureArtifacts = asArray(structureArtifacts)
    .map(sanitizeStructureArtifact)
    .filter((artifact) => artifact.artifactId);
  const normalizedGranularityFragments = asArray(granularityFragments)
    .map(sanitizeGranularityFragment)
    .filter((fragment) => fragment.fragmentId);
  const normalizedArtifacts = asArray(artifacts).map(sanitizeArtifact).filter((artifact) => artifact.id);
  const normalizedWarnings = asArray(warnings).map(scalar).filter(Boolean);

  return {
    schemaVersion: PREPROCESS_RESULT_SCHEMA_VERSION,
    resultType: PREPROCESS_RESULT_TYPE,
    generatedAt: scalar(generatedAt) || new Date().toISOString(),
    sources: normalizedSources,
    sourceTrace: Object.fromEntries(normalizedSources.map((source) => [source.id, source])),
    blocks: normalizedBlocks,
    chunks: normalizedChunks,
    structureArtifacts: normalizedStructureArtifacts,
    granularityFragments: normalizedGranularityFragments,
    artifacts: normalizedArtifacts,
    warnings: normalizedWarnings,
    counts: {
      sources: normalizedSources.length,
      blocks: normalizedBlocks.length,
      chunks: normalizedChunks.length,
      structureArtifacts: normalizedStructureArtifacts.length,
      granularityFragments: normalizedGranularityFragments.length,
      artifacts: normalizedArtifacts.length,
      warnings: normalizedWarnings.length
    }
  };
}

export function summarizePreprocessResult(result = {}) {
  const counts = shallowObject(result.counts);
  return {
    schemaVersion: Number(result.schemaVersion || PREPROCESS_RESULT_SCHEMA_VERSION),
    resultType: scalar(result.resultType || PREPROCESS_RESULT_TYPE),
    generatedAt: scalar(result.generatedAt),
    counts: {
      sources: Number(counts.sources || asArray(result.sources).length || 0),
      blocks: Number(counts.blocks || asArray(result.blocks).length || 0),
      chunks: Number(counts.chunks || asArray(result.chunks).length || 0),
      structureArtifacts: Number(counts.structureArtifacts || asArray(result.structureArtifacts).length || 0),
      granularityFragments: Number(counts.granularityFragments || asArray(result.granularityFragments).length || 0),
      artifacts: Number(counts.artifacts || asArray(result.artifacts).length || 0),
      warnings: Number(counts.warnings || asArray(result.warnings).length || 0)
    },
    warnings: asArray(result.warnings).map(scalar).filter(Boolean)
  };
}
