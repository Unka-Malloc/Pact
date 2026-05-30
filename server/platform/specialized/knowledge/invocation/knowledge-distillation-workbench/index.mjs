import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { Document, Packer } from "docx";
import { zipSync, strToU8 } from "fflate";
import {
  humanHeading,
  humanParagraph,
  renderHumanDocxBodyBlocks
} from "../../document-export/docx-human-renderer.mjs";
import {
  getNormalizedDocumentsDirectory
} from "../../preprocessing/file-processor/FileNormalizer/NormalizedDocuments/store.mjs";

export const KNOWLEDGE_DISTILLATION_WORKBENCH_PROTOCOL_VERSION =
  "pact.knowledge-distillation-workbench.v1";

const EXPORT_CONTENT_TYPES = {
  markdown: "text/markdown; charset=utf-8",
  html: "text/html; charset=utf-8",
  json: "application/json; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  package: "application/zip"
};

const STAGE_DEFINITIONS = [
  {
    stageId: "raw-format-conversion",
    title: "原始语料格式转换",
    actionLabel: "转换为统一 DOCX",
    description:
      "接收项目目录中的所有受支持格式，形成可人工检查的 DOCX 语料，不建档、不切块、不索引。"
  },
  {
    stageId: "normalized-corpus",
    title: "原始语料建档 / 归一化",
    actionLabel: "生成归一化语料包",
    description:
      "保留 normalized DOCX、YAML sidecar、raw object、sourceRange、资产引用和解析风险。"
  },
  {
    stageId: "project-dossier",
    title: "项目级语料串联",
    actionLabel: "生成项目 Dossier",
    description:
      "把同一项目下的多份文档按目录、时间和文件顺序粗串联成一个支持透明溯源的结构化长文档。"
  },
  {
    stageId: "knowledge-index",
    title: "知识索引",
    actionLabel: "建立可召回证据",
    description:
      "把归一化语料映射为 document、section、block、asset、evidence、embedding 和 hierarchy。"
  },
  {
    stageId: "knowledge-distillation",
    title: "知识蒸馏",
    actionLabel: "生成大文档",
    description:
      "直接从第一层原始语料全文生成自包含知识文档，第二层 evidence 只用于校验和引用。"
  }
];

function nowIso() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value = "") {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function stableHash(...parts) {
  const hash = crypto.createHash("sha256");
  for (const part of parts) {
    hash.update(String(part ?? ""));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function stableId(prefix, ...parts) {
  return `${prefix}-${stableHash(...parts).slice(0, 16)}`;
}

function safeSlug(value = "knowledge-distillation") {
  return String(value || "knowledge-distillation")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "knowledge-distillation";
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readDirectoryFiles(rootPath, prefix = "") {
  if (!rootPath || !(await pathExists(rootPath))) {
    return [];
  }
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(rootPath, entry.name);
    const relativePath = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await readDirectoryFiles(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push({
        relativePath,
        absolutePath,
        buffer: await fs.readFile(absolutePath)
      });
    }
  }
  return files;
}

function jsonBuffer(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function zipBuffer(files = {}) {
  const archive = {};
  for (const [name, value] of Object.entries(files)) {
    if (!name || value === undefined || value === null) continue;
    archive[name] = Buffer.isBuffer(value) || value instanceof Uint8Array
      ? value
      : strToU8(String(value));
  }
  return Buffer.from(zipSync(archive, { level: 6 }));
}

function normalizeFormat(value = "markdown") {
  return ["markdown", "docx", "html", "json", "package"].includes(value) ? value : "markdown";
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(number, max));
}

function stageTemplate(definition) {
  return {
    stageId: definition.stageId,
    title: definition.title,
    actionLabel: definition.actionLabel,
    description: definition.description,
    status: "pending",
    progressPercent: 0,
    startedAt: "",
    finishedAt: "",
    exportFormats: ["markdown", "docx", "html", "json", "package"],
    checkpoint: {
      durable: true,
      resumable: true,
      continuationToken: ""
    },
    preview: "",
    output: null,
    metrics: {},
    versions: [],
    activity: {
      idempotencyKey: "",
      completedActivities: [],
      failedActivities: []
    },
    warnings: [],
    error: ""
  };
}

function defaultStages() {
  return STAGE_DEFINITIONS.map(stageTemplate);
}

function stageStatusTone(status = "") {
  if (status === "completed") return "success";
  if (status === "running") return "warning";
  if (status === "failed") return "danger";
  if (status === "waiting") return "muted";
  return "muted";
}

function stagePublic(stage = {}) {
  return {
    ...stage,
    tone: stageStatusTone(stage.status),
    versions: asArray(stage.versions).map((version) => ({
      versionId: version.versionId,
      archivedAt: version.archivedAt,
      status: version.status,
      markdownLength: text(version.output?.markdown).length,
      jsonAvailable: Boolean(version.output?.json)
    })),
    output: stage.output
      ? {
          title: stage.output.title || stage.title || "",
          markdownLength: text(stage.output.markdown).length,
          htmlLength: text(stage.output.html).length,
          jsonAvailable: Boolean(stage.output.json)
        }
      : null
  };
}

function publicRun(run = {}) {
  return {
    ...run,
    stages: asArray(run.stages).map(stagePublic)
  };
}

function summarizeManifest(manifest = {}) {
  const docs = asArray(manifest.documents);
  const sourceMaterials = asArray(manifest.sourceMaterials);
  return {
    batchId: manifest.batchId || "",
    generatedAt: manifest.generatedAt || "",
    documentCount: docs.length,
    sourceMaterialCount: sourceMaterials.length,
    byGranularity: asObject(manifest.summary?.byGranularity),
    warnings: asArray(manifest.warnings)
  };
}

function normalizeSourceFile(source = {}, index = 0) {
  const rawObject = asObject(source.rawObject);
  const title = text(
    source.originalRelativePath ||
      source.originalFileName ||
      rawObject.originalRelativePath ||
      rawObject.originalFileName ||
      source.name ||
      source.path ||
      `source-${index + 1}`
  );
  const body = text(source.text || source.extractedText || source.content || "");
  const visualElements = asArray(source.visualElements).map((entry, entryIndex) => ({
    ...asObject(entry),
    kind: text(entry.kind || entry.type || ""),
    title: text(entry.title || entry.caption || ""),
    text: text(entry.text || entry.markdown || entry.ocrText || ""),
    markdown: text(entry.markdown || ""),
    mediaType: text(entry.mediaType || entry.mimeType || ""),
    page: Number(entry.page || 0),
    index: Number(entry.index || entryIndex + 1),
    sequence: Number(entry.sequence || entryIndex + 1),
    relativePath: text(entry.relativePath || entry.path || ""),
    imageDataUrl: text(entry.imageDataUrl || entry.dataUrl || entry.embeddedDataUrl || "")
  }));
  const embeddedDocuments = asArray(source.embeddedDocuments).map((entry, entryIndex) => ({
    ...asObject(entry),
    id: text(entry.id || `embedded-${entryIndex + 1}`),
    title: text(entry.title || entry.name || `embedded-${entryIndex + 1}`),
    mediaType: text(entry.mediaType || ""),
    text: text(entry.text || entry.content || entry.html || ""),
    byteSize: Number(entry.byteSize || 0)
  }));
  return {
    index: index + 1,
    id: text(source.id || source.sourceId || stableId("source", title, index)),
    title,
    text: body,
    kind: text(source.kind || source.sourceType || ""),
    mediaType: text(source.mediaType || rawObject.mediaType || ""),
    path: text(source.originalRelativePath || rawObject.originalRelativePath || source.path || source.name || ""),
    originalFileName: text(source.originalFileName || rawObject.originalFileName || source.name || title),
    storageRelativePath: text(source.storageRelativePath || rawObject.storageRelativePath || ""),
    rawObjectId: text(source.rawObjectId || rawObject.objectId || ""),
    rawObjectSha256: text(source.rawObjectSha256 || rawObject.sha256 || rawObject.contentHash || ""),
    clientUid: text(source.clientUid || rawObject.clientUid || ""),
    providerId: text(source.providerId || rawObject.providerId || ""),
    externalId: text(source.externalId || rawObject.externalId || ""),
    syncBatchId: text(source.syncBatchId || rawObject.syncBatchId || ""),
    documentParserId: text(source.documentParserId || ""),
    documentMetadata: asObject(source.documentMetadata),
    sourceMetadata: asObject(source.sourceMetadata || rawObject.sourceMetadata),
    capturedAt: text(
      source.capturedAt ||
        rawObject.capturedAt ||
        source.sourceUpdatedAt ||
        rawObject.sourceUpdatedAt ||
        source.sourceCreatedAt ||
        rawObject.sourceCreatedAt ||
        source.sourceCollectedAt ||
        rawObject.sourceCollectedAt ||
        ""
    ),
    sourceCreatedAt: text(source.sourceCreatedAt || rawObject.sourceCreatedAt || ""),
    sourceUpdatedAt: text(source.sourceUpdatedAt || rawObject.sourceUpdatedAt || ""),
    sourceCollectedAt: text(source.sourceCollectedAt || rawObject.sourceCollectedAt || ""),
    contentHash: text(source.contentHash || source.rawObjectSha256 || rawObject.sha256 || stableHash(title, body)),
    byteSize: Number(source.rawObjectByteSize || rawObject.byteSize || 0),
    embeddedDocuments,
    visualElements,
    assets: visualElements
      .filter((entry) => entry.kind === "image" || entry.imageDataUrl || entry.relativePath)
      .map((entry) => ({
        assetType: entry.kind || "image",
        title: entry.title,
        mediaType: entry.mediaType,
        relativePath: entry.relativePath,
        dataUrl: entry.imageDataUrl,
        page: entry.page,
        sequence: entry.sequence
      })),
    tableCount: visualElements.filter((entry) => entry.kind === "table").length,
    imageCount: visualElements.filter((entry) => entry.kind === "image" || entry.imageDataUrl).length,
    attachmentCount: embeddedDocuments.length
  };
}

function sortSourcesForDossier(sources = []) {
  return [...sources].sort((left, right) => {
    const leftTime = left.capturedAt || "";
    const rightTime = right.capturedAt || "";
    if (leftTime && rightTime && leftTime !== rightTime) {
      return rightTime.localeCompare(leftTime);
    }
    return String(left.path || left.title).localeCompare(String(right.path || right.title));
  });
}

function markdownTable(rows = []) {
  if (!rows.length) return "";
  const header = rows[0];
  const body = rows.slice(1);
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.map((cell) => String(cell || "").replace(/\n/g, " ")).join(" | ")} |`)
  ].join("\n");
}

function htmlEscape(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToHtml(markdown = "") {
  const lines = String(markdown || "").split("\n");
  const html = [];
  let inList = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      const level = Math.min(6, heading[1].length);
      html.push(`<h${level}>${htmlEscape(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = /^[-*+]\s+(.+)$/.exec(line);
    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${htmlEscape(bullet[1])}</li>`);
      continue;
    }
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    html.push(`<p>${htmlEscape(line)}</p>`);
  }
  if (inList) {
    html.push("</ul>");
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Pact Knowledge Distillation</title></head><body>${html.join("\n")}</body></html>`;
}

function sourceDirectoryTree(sources = []) {
  const root = { name: "/", kind: "directory", children: new Map(), fileCount: 0 };
  for (const source of sources) {
    const parts = String(source.path || source.title || "").split(/[\\/]+/).filter(Boolean);
    if (!parts.length) {
      parts.push(source.title || `source-${source.index || 0}`);
    }
    let cursor = root;
    cursor.fileCount += 1;
    for (const [index, part] of parts.entries()) {
      const isFile = index === parts.length - 1;
      if (!cursor.children.has(part)) {
        cursor.children.set(part, {
          name: part,
          kind: isFile ? "file" : "directory",
          children: new Map(),
          fileCount: 0,
          sourceId: isFile ? source.id : ""
        });
      }
      cursor = cursor.children.get(part);
      cursor.fileCount += 1;
    }
  }
  function serialize(node, depth = 0) {
    const children = [...node.children.values()]
      .sort((left, right) => `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`))
      .map((child) => serialize(child, depth + 1));
    return {
      name: node.name,
      kind: node.kind,
      fileCount: node.fileCount,
      sourceId: node.sourceId || "",
      depth,
      children
    };
  }
  return serialize(root);
}

function renderTreeMarkdown(node, maxLines = 200) {
  const lines = [];
  function visit(current, prefix = "") {
    if (lines.length >= maxLines) return;
    for (const child of asArray(current.children)) {
      if (lines.length >= maxLines) return;
      lines.push(`${prefix}- ${child.kind === "directory" ? "目录" : "文件"}：${child.name}`);
      if (child.kind === "directory") {
        visit(child, `${prefix}  `);
      }
    }
  }
  visit(node);
  return lines.length ? lines.join("\n") : "- 无目录结构";
}

function assetsFromSourcesAndManifest({ sources = [], manifest = {} } = {}) {
  const fromManifest = asArray(manifest.assets).map((asset, index) => ({
    assetId: text(asset.assetId || asset.id || `manifest-asset-${index + 1}`),
    assetType: text(asset.artifactType || asset.assetType || asset.kind || "asset"),
    title: text(asset.title || asset.relativePath || `asset-${index + 1}`),
    relativePath: text(asset.relativePath || ""),
    mediaType: text(asset.mediaType || ""),
    sourceId: text(asset.sourceId || ""),
    page: Number(asset.page || 0),
    sequence: Number(asset.sequence || index + 1),
    sha256: text(asset.sha256 || ""),
    byteSize: Number(asset.byteSize || 0)
  }));
  const fromSources = [];
  for (const source of sources) {
    for (const [index, element] of asArray(source.visualElements).entries()) {
      fromSources.push({
        assetId: stableId("visual_asset", source.id, element.kind, element.sequence || index),
        assetType: text(element.kind || "visual"),
        title: text(element.title || `${source.title} visual ${index + 1}`),
        relativePath: text(element.relativePath || ""),
        mediaType: text(element.mediaType || ""),
        sourceId: source.id,
        sourcePath: source.path,
        page: Number(element.page || 0),
        sequence: Number(element.sequence || index + 1),
        text: text(element.markdown || element.text || ""),
        embedded: Boolean(element.imageDataUrl)
      });
    }
    for (const [index, embedded] of asArray(source.embeddedDocuments).entries()) {
      fromSources.push({
        assetId: stableId("embedded_asset", source.id, embedded.id || index),
        assetType: "attachment",
        title: embedded.title || `${source.title} attachment ${index + 1}`,
        relativePath: "",
        mediaType: embedded.mediaType || "",
        sourceId: source.id,
        sourcePath: source.path,
        sequence: index + 1,
        text: text(embedded.text).slice(0, 1200),
        embedded: false
      });
    }
  }
  const byKey = new Map();
  for (const item of [...fromManifest, ...fromSources]) {
    const key = item.assetId || `${item.sourceId}:${item.relativePath}:${item.title}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()].sort((left, right) => {
    const bySource = String(left.sourceId || left.sourcePath || "").localeCompare(String(right.sourceId || right.sourcePath || ""));
    if (bySource !== 0) return bySource;
    return Number(left.sequence || 0) - Number(right.sequence || 0);
  });
}

function normalizedDocumentMappings({ manifest = {}, sources = [], result = {} } = {}) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const documents = asArray(manifest.documents).map((doc, index) => {
    const source = sourceById.get(doc.sourceId) || {};
    return {
      documentId: text(doc.documentId || doc.id || `normalized-document-${index + 1}`),
      title: text(doc.title || doc.relativePath || ""),
      sourceId: text(doc.sourceId || source.id || ""),
      sourcePath: text(source.path || ""),
      granularity: text(doc.granularity || ""),
      relativePath: text(doc.relativePath || ""),
      sourceMaterialRelativePath: text(doc.sourceMaterialRelativePath || ""),
      sha256: text(doc.sha256 || ""),
      byteSize: Number(doc.byteSize || 0)
    };
  });
  const blocks = asArray(result?.preprocess?.blocks).map((block, index) => ({
    blockId: text(block.id || `block-${index + 1}`),
    sourceId: text(block.sourceId || ""),
    sourceName: text(block.sourceName || ""),
    kind: text(block.kind || ""),
    headingPath: asArray(block.headingPath || block.titlePath).map(text).filter(Boolean),
    sectionId: text(block.sectionId || ""),
    sourceRange: {
      startLine: Number(block.sourceStartLine || block.sourceRange?.startLine || 0),
      endLine: Number(block.sourceEndLine || block.sourceRange?.endLine || 0)
    },
    textLength: text(block.text).length
  }));
  const sections = new Map();
  for (const block of blocks) {
    const key = block.sectionId || `${block.sourceId}:${block.headingPath.join("/") || "正文"}`;
    if (!sections.has(key)) {
      sections.set(key, {
        sectionId: key,
        sourceId: block.sourceId,
        title: block.headingPath.at(-1) || "正文",
        headingPath: block.headingPath,
        blockIds: []
      });
    }
    sections.get(key).blockIds.push(block.blockId);
  }
  const chunks = asArray(result?.preprocess?.chunks).map((chunk, index) => ({
    chunkId: text(chunk.id || `chunk-${index + 1}`),
    sourceId: text(chunk.sourceId || ""),
    title: text(chunk.title || chunk.sectionTitle || ""),
    blockIds: asArray(chunk.blockIds).map(text).filter(Boolean),
    tokenCount: Number(chunk.tokenCount || 0),
    charCount: Number(chunk.charCount || text(chunk.content).length),
    sourceRange: asObject(chunk.sourceRange),
    embeddingReady: text(chunk.content).length > 0
  }));
  const retrieval = asArray(result?.retrieval?.items).map((item, index) => ({
    evidenceId: text(item.evidenceId || item.id || `retrieval-${index + 1}`),
    documentId: text(item.documentId || item.itemId || ""),
    title: text(item.title || item.subject || ""),
    score: Number(item.score || item.finalScore || 0),
    sourceLocator: asObject(item.sourceLocator || item.source || item.locator)
  }));
  return {
    documents,
    sections: [...sections.values()],
    blocks,
    assets: assetsFromSourcesAndManifest({ sources, manifest }),
    evidence: retrieval,
    embeddings: chunks.map((chunk) => ({
      embeddingId: stableId("embedding", chunk.chunkId),
      chunkId: chunk.chunkId,
      sourceId: chunk.sourceId,
      tokenCount: chunk.tokenCount,
      status: chunk.embeddingReady ? "ready_for_vector_store" : "empty_content"
    })),
    hierarchy: {
      documentCount: documents.length,
      sectionCount: sections.size,
      blockCount: blocks.length,
      chunkCount: chunks.length,
      evidenceCount: retrieval.length
    }
  };
}

function timelineOrderReport(sources = []) {
  const ordered = sortSourcesForDossier(sources);
  const timestamps = ordered.map((source) => source.capturedAt).filter(Boolean);
  const newestToOldest = timestamps.every((value, index) => index === 0 || timestamps[index - 1] >= value);
  return {
    policy: "newest-to-oldest-then-path",
    timestampedSourceCount: timestamps.length,
    newestToOldest,
    first: timestamps[0] || "",
    last: timestamps.at(-1) || ""
  };
}

function qualityReport({ sources = [], manifest = {}, distillation = null, markdown = "" } = {}) {
  const docs = asArray(manifest.documents);
  const qualityV3 = asObject(distillation?.qualityReportV3);
  const externalEvaluation = asObject(distillation?.externalEvaluation);
  const sourceTextCount = sources.filter((source) => source.text).length;
  const citationCount = asArray(distillation?.portableDocuments)
    .map((item) => item.document || item.portableDocument || item)
    .reduce((sum, doc) => sum + asArray(doc?.citations).length, 0);
  const evidenceAppendixCount = asArray(distillation?.portableDocuments)
    .map((item) => item.document || item.portableDocument || item)
    .reduce((sum, doc) => sum + asArray(doc?.evidenceAppendix).length, 0);
  const frameworkDependencyViolations = asArray(distillation?.portableDocuments)
    .flatMap((item) => asArray((item.document || item.portableDocument || item)?.runtimeDependencies))
    .filter(Boolean);
  const timeline = timelineOrderReport(sources);
  const checks = [
    {
      id: "raw_corpus_coverage",
      passed: sources.length === 0 || sourceTextCount / Math.max(1, sources.length) >= 0.5,
      actual: { sourceTextCount, sourceCount: sources.length },
      expected: "at least half of source files have readable text"
    },
    {
      id: "normalized_docx_package_present",
      passed: docs.length > 0,
      actual: docs.length,
      expected: "normalized document package contains DOCX files"
    },
    {
      id: "self_contained_distillation",
      passed: frameworkDependencyViolations.length === 0,
      actual: frameworkDependencyViolations,
      expected: "portable distillation document has no framework runtime dependency"
    },
    {
      id: "citations_or_raw_trace_available",
      passed: citationCount > 0 || evidenceAppendixCount > 0 || sources.length > 0,
      actual: { citationCount, evidenceAppendixCount, sourceCount: sources.length },
      expected: "citations/evidence appendix or raw source trace is available"
    },
    {
      id: "timeline_order_available",
      passed: timeline.newestToOldest || timeline.timestampedSourceCount <= 1,
      actual: timeline,
      expected: "dossier order is newest-to-oldest when timestamps exist"
    },
    {
      id: "distillation_quality_v3_available",
      passed: qualityV3.protocolVersion === "pact.knowledge-distillation.algorithm.v2",
      actual: qualityV3.protocolVersion || "",
      expected: "qualityReportV3 is emitted by the distillation runtime"
    },
    {
      id: "external_data_evaluation_available",
      passed: externalEvaluation.protocolVersion === "pact.knowledge-distillation.external-evaluation.v1",
      actual: externalEvaluation.protocolVersion || "",
      expected: "data-driven external evaluation is emitted"
    },
    {
      id: "semantic_clusters_available",
      passed: asArray(distillation?.semanticClusters).length > 0,
      actual: asArray(distillation?.semanticClusters).length,
      expected: "semantic clusters are available"
    }
  ];
  return {
    passed: checks.every((check) => check.passed),
    coverage: {
      sourceCount: sources.length,
      sourceTextCount,
      normalizedDocumentCount: docs.length,
      assetCount: assetsFromSourcesAndManifest({ sources, manifest }).length,
      markdownCharacters: text(markdown).length
    },
    citations: {
      citationCount,
      evidenceAppendixCount,
      unsupportedConclusionCount: citationCount > 0 ? 0 : Math.max(0, text(markdown).split(/\n#{1,3}\s+/).length - 2)
    },
    timeline,
    algorithm: {
      version: qualityV3.protocolVersion || "",
      qualityPassed: qualityV3.passed === true,
      overallScore: Number(qualityV3.overallScore || 0),
      semanticCoverageScore: Number(qualityV3.semanticCoverageScore || 0),
      timelineOrderScore: Number(qualityV3.timelineOrderScore || 0),
      timeDecayCalibrationScore: Number(qualityV3.timeDecayCalibrationScore || 0),
      externalEvaluationScore: Number(externalEvaluation.overallScore || 0),
      semanticClusterCount: asArray(distillation?.semanticClusters).length
    },
    checks
  };
}

function stageOutput(title, markdown, json = {}, warnings = []) {
  const normalizedMarkdown = text(markdown);
  return {
    title,
    markdown: normalizedMarkdown,
    html: markdownToHtml(normalizedMarkdown),
    json,
    warnings
  };
}

function preview(markdown = "", max = 1200) {
  const normalized = text(markdown);
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function buildRawConversionStage({ run, manifest, sources }) {
  const summary = summarizeManifest(manifest);
  const assets = assetsFromSourcesAndManifest({ sources, manifest });
  const docs = asArray(manifest.documents);
  const sourceMaterials = asArray(manifest.sourceMaterials);
  const rows = [
    ["指标", "值"],
    ["源文件", sources.length],
    ["DOCX 文档", summary.documentCount],
    ["保留原始材料", summary.sourceMaterialCount],
    ["图片资产", assets.filter((asset) => asset.assetType === "image").length],
    ["表格文档", docs.filter((doc) => String(doc.granularity || "").includes("table")).length],
    ["附件/嵌入文档", sources.reduce((sum, source) => sum + asArray(source.embeddedDocuments).length, 0)],
    ["Batch", summary.batchId || run.jobId || "n/a"]
  ];
  const markdown = [
    "# 原始语料格式转换",
    "",
    "本阶段逐文件把已完成解析的输入整理为可人工检查的 DOCX 转换包，同时保留原始材料、图片、表格和机器可读 sidecar。",
    "",
    markdownTable(rows),
    "",
    "## DOCX 转换清单",
    ...docs.slice(0, 100).map((doc) =>
      `- ${doc.title || doc.documentId} · ${doc.granularity || "document"} · ${doc.relativePath || ""}`
    ),
    docs.length > 100 ? `- ...其余 ${docs.length - 100} 个 DOCX 文档` : "",
    "",
    "## 原始材料清单",
    ...sourceMaterials.slice(0, 80).map((item) =>
      `- ${item.title || item.documentId} · ${item.sourceMaterialRelativePath || item.relativePath || ""}`
    ),
    sourceMaterials.length > 80 ? `- ...其余 ${sourceMaterials.length - 80} 个原始材料` : "",
    "",
    "## 输入范围",
    ...sources.slice(0, 80).map((source) =>
      `- ${source.path || source.title} (${source.mediaType || source.kind || "file"}) · 图片 ${source.imageCount} · 表格 ${source.tableCount} · 附件 ${source.attachmentCount}`
    ),
    sources.length > 80 ? `- ...其余 ${sources.length - 80} 个文件` : ""
  ].filter(Boolean).join("\n");
  return stageOutput("原始语料格式转换", markdown, {
    conversionPackage: {
      outputFormat: "docx",
      packageType: manifest.packageType || "pact.normalized-documents",
      rootRelativePath: manifest.rootRelativePath || "normalized-documents",
      humanReadable: asObject(manifest.humanReadable),
      machineReadable: asObject(manifest.machineReadable)
    },
    summary,
    documents: docs,
    sourceMaterials,
    assets,
    sources
  }, asArray(manifest.warnings));
}

function buildNormalizedCorpusStage({ manifest, sources }) {
  const summary = summarizeManifest(manifest);
  const docs = asArray(manifest.documents);
  const assets = assetsFromSourcesAndManifest({ sources, manifest });
  const markdown = [
    "# 原始语料建档 / 归一化",
    "",
    "本阶段生成 normalized DOCX、YAML sidecar、sourceRange、raw object 和资产引用，供外部知识库或后续索引使用。",
    "",
    markdownTable([
      ["指标", "值"],
      ["归一化文档", docs.length],
      ["原始源文件", sources.length],
      ["资产", assets.length],
      ["生成时间", summary.generatedAt || "n/a"]
    ]),
    "",
    "## 归一化文档",
    ...docs.slice(0, 80).map((doc) =>
      `- ${doc.title || doc.documentId} · ${doc.granularity || "document"} · ${doc.relativePath || ""}`
    ),
    docs.length > 80 ? `- ...其余 ${docs.length - 80} 个文档` : ""
  ].filter(Boolean).join("\n");
  return stageOutput("原始语料建档 / 归一化", markdown, {
    summary,
    documents: docs,
    sourceMaterials: asArray(manifest.sourceMaterials),
    assets,
    sidecar: asObject(manifest.machineReadable),
    sourceTrace: sources.map((source) => ({
      sourceId: source.id,
      title: source.title,
      path: source.path,
      rawObjectId: source.rawObjectId,
      storageRelativePath: source.storageRelativePath,
      documentParserId: source.documentParserId,
      contentHash: source.contentHash
    }))
  }, asArray(manifest.warnings));
}

function buildProjectDossierStage({ run, manifest, sources }) {
  const ordered = sortSourcesForDossier(sources);
  const tree = sourceDirectoryTree(sources);
  const assets = assetsFromSourcesAndManifest({ sources, manifest });
  const markdown = [
    `# ${run.title || "项目语料 Dossier"}`,
    "",
    "本阶段把同一项目的材料先粗串联成一个大文档。顺序优先使用时间戳从新到旧；缺少时间戳时按路径排序，并保留目录、图片、表格和附件线索。",
    "",
    markdownTable([
      ["指标", "值"],
      ["源文件", ordered.length],
      ["含文本文件", ordered.filter((source) => source.text).length],
      ["图片资产", assets.filter((asset) => asset.assetType === "image").length],
      ["表格/附件", assets.filter((asset) => asset.assetType === "table" || asset.assetType === "attachment").length],
      ["字符数", ordered.reduce((sum, source) => sum + source.text.length, 0)]
    ]),
    "",
    "## 目录结构",
    renderTreeMarkdown(tree),
    "",
    "## 资产与附件",
    ...assets.slice(0, 120).map((asset, index) =>
      `- ${index + 1}. ${asset.assetType || "asset"} · ${asset.title || asset.relativePath || asset.assetId} · ${asset.sourcePath || asset.sourceId || ""}`
    ),
    assets.length > 120 ? `- ...其余 ${assets.length - 120} 个资产` : "",
    "",
    ...ordered.map((source, index) => [
      `## ${index + 1}. ${source.title}`,
      "",
      `- 路径：${source.path || "n/a"}`,
      `- 时间：${source.capturedAt || "n/a"}`,
      `- Hash：${source.contentHash || "n/a"}`,
      `- 结构：图片 ${source.imageCount} · 表格 ${source.tableCount} · 附件 ${source.attachmentCount}`,
      "",
      ...asArray(source.visualElements)
        .filter((item) => item.kind === "table" && (item.markdown || item.text))
        .slice(0, 12)
        .map((item) => [`### 表格 ${item.sequence || item.index || ""}`.trim(), "", item.markdown || item.text, ""].join("\n")),
      ...asArray(source.visualElements)
        .filter((item) => item.kind === "image")
        .slice(0, 12)
        .map((item) => `> 图片 ${item.sequence || item.index || ""}：${item.title || item.relativePath || "未命名图片"}${item.text ? ` · ${item.text.slice(0, 200)}` : ""}`),
      ...asArray(source.embeddedDocuments)
        .slice(0, 12)
        .map((item) => `> 附件 ${item.id || ""}：${item.title || item.mediaType || "未命名附件"}${item.text ? ` · ${item.text.slice(0, 200)}` : ""}`),
      "",
      source.text || "_未提取到可读正文。_"
    ].join("\n"))
  ].join("\n");
  return stageOutput("项目级语料串联", markdown, {
    order: "newest-to-oldest-then-path",
    directoryTree: tree,
    assets,
    sources: ordered.map((source) => ({
      sourceId: source.id,
      title: source.title,
      path: source.path,
      capturedAt: source.capturedAt,
      contentHash: source.contentHash,
      textLength: source.text.length,
      imageCount: source.imageCount,
      tableCount: source.tableCount,
      attachmentCount: source.attachmentCount
    }))
  });
}

function buildKnowledgeIndexStage({ result, manifest, sources }) {
  const retrievalItems = asArray(result?.retrieval?.items);
  const timeline = asArray(result?.timeline);
  const docs = asArray(manifest.documents);
  const mappings = normalizedDocumentMappings({ manifest, sources, result });
  const markdown = [
    "# 知识索引",
    "",
    "本阶段把归一化语料映射为可召回证据。这个导出用于检查 document / section / block / asset / evidence / embedding 的映射，不替代知识蒸馏成果。",
    "",
    markdownTable([
      ["指标", "值"],
      ["源文件", sources.length],
      ["归一化文档", docs.length],
      ["Section", mappings.sections.length],
      ["Block", mappings.blocks.length],
      ["Asset", mappings.assets.length],
      ["Embedding 输入", mappings.embeddings.length],
      ["检索候选", retrievalItems.length],
      ["时间线事件", timeline.length]
    ]),
    "",
    "## 映射详情",
    ...[
      ["document", mappings.documents.length],
      ["section", mappings.sections.length],
      ["block", mappings.blocks.length],
      ["asset", mappings.assets.length],
      ["evidence", mappings.evidence.length],
      ["embedding", mappings.embeddings.length]
    ].map(([name, count]) => `- ${name}: ${count}`),
    "",
    "## 检索候选预览",
    ...retrievalItems.slice(0, 80).map((item, index) =>
      `- ${index + 1}. ${item.title || item.subject || item.id || "未命名证据"}`
    ),
    retrievalItems.length > 80 ? `- ...其余 ${retrievalItems.length - 80} 条` : ""
  ].filter(Boolean).join("\n");
  return stageOutput("知识索引", markdown, {
    retrievalItemCount: retrievalItems.length,
    timelineCount: timeline.length,
    normalizedDocumentCount: docs.length,
    externalKnowledgeBaseSync: {
      status: result?.externalKnowledgeBaseSync?.status || "not_configured",
      adapters: asArray(result?.externalKnowledgeBaseSync?.adapters)
    },
    mappings
  });
}

function rawDocumentsFromSources(sources = [], run = {}) {
  return sources
    .map((source, index) => ({
      title: source.title || `source-${index + 1}`,
      text: source.text,
      capturedAt: source.capturedAt,
      sourceType: source.kind || "file",
      sourcePath: source.path,
      contentHash: source.contentHash,
      batchId: run.batchId || run.jobId || "",
      providerId: source.providerId,
      externalId: source.externalId,
      sourceCreatedAt: source.sourceCreatedAt,
      sourceUpdatedAt: source.sourceUpdatedAt,
      sourceCollectedAt: source.sourceCollectedAt,
      originalFileName: source.originalFileName,
      rawObject: {
        objectId: source.rawObjectId,
        sha256: source.rawObjectSha256,
        storageRelativePath: source.storageRelativePath,
        mediaType: source.mediaType
      },
      assets: source.assets
    }))
    .filter((source) => source.title || source.text);
}

function combinedDistillationMarkdown(distillation = {}, fallbackTitle = "知识蒸馏成果") {
  const portableDocuments = asArray(distillation.portableDocuments);
  const documents = portableDocuments
    .map((item) => item.document || item.portableDocument || item)
    .filter((item) => item && typeof item === "object");
  const parts = [
    `# ${fallbackTitle}`,
    "",
    "本文件是知识蒸馏阶段的自包含输出。"
  ];
  for (const [index, document] of documents.entries()) {
    const markdown = text(document.markdown);
    if (markdown) {
      parts.push("", `## 蒸馏文档 ${index + 1}: ${document.title || fallbackTitle}`, "", markdown);
    }
  }
  if (parts.length <= 3) {
    parts.push("", "_当前蒸馏运行未生成可读 Markdown。_");
  }
  return parts.join("\n");
}

async function buildDocxBuffer(title, markdown) {
  const doc = new Document({
    sections: [
      {
        children: [
          humanHeading(title || "知识蒸馏工作台导出"),
          humanParagraph("Pact 知识蒸馏工作台阶段导出。"),
          ...renderHumanDocxBodyBlocks(markdown)
        ]
      }
    ]
  });
  return Packer.toBuffer(doc);
}

function queueInputForRun(run = {}, patch = {}) {
  return {
    kind: "knowledge_distillation_workbench",
    ownerId: run.runId,
    queueId: run.queueId || stableId("queue_item", "knowledge_distillation_workbench", run.runId),
    label: run.title || "知识蒸馏工作台",
    source: "knowledge-distillation-workbench",
    phase: patch.phase || run.status || "queued",
    status: patch.status || run.status || "queued",
    checkpointId: run.runId,
    metadata: {
      featureId: "knowledge-distillation-workbench",
      jobId: run.jobId || "",
      batchId: run.batchId || "",
      priority: run.priority || "normal",
      stageId: patch.stageId || "",
      progressPercent: Number(patch.progressPercent ?? run.progressPercent ?? 0),
      ...(patch.metadata || {})
    }
  };
}

async function queueStarted(queueMonitor, run, patch = {}) {
  if (typeof queueMonitor?.registerStarted === "function") {
    await queueMonitor.registerStarted(queueInputForRun(run, patch)).catch(() => null);
  }
}

async function queueHeartbeat(queueMonitor, run, patch = {}) {
  if (typeof queueMonitor?.registerHeartbeat === "function") {
    await queueMonitor.registerHeartbeat(queueInputForRun(run, patch)).catch(() => null);
  }
}

async function queueClosed(queueMonitor, run, patch = {}) {
  if (typeof queueMonitor?.registerClosed === "function") {
    await queueMonitor.registerClosed(queueInputForRun(run, patch)).catch(() => null);
  }
}

export function createKnowledgeDistillationWorkbench({
  userDataPath,
  jobManager = null,
  knowledgeDistillationRuntime = null,
  queueMonitor = null
} = {}) {
  const rootPath = path.join(userDataPath, "knowledge-distillation-workbench");
  const runsPath = path.join(rootPath, "runs");
  const running = new Set();

  function runPath(runId) {
    return path.join(runsPath, safeSlug(runId), "run.json");
  }

  function runDir(runId) {
    return path.dirname(runPath(runId));
  }

  async function loadRun(runId) {
    return readJson(runPath(runId), null);
  }

  async function saveRun(run) {
    const next = {
      ...run,
      updatedAt: nowIso()
    };
    await writeJsonAtomic(runPath(next.runId), next);
    return next;
  }

  async function assertRunCanContinue(runId) {
    const current = await loadRun(runId);
    if (!current) {
      const error = new Error("知识蒸馏工作台任务已删除。");
      error.code = "RUN_DELETED";
      throw error;
    }
    if (["canceled", "archived", "deleted"].includes(String(current.status || ""))) {
      const error = new Error(`知识蒸馏工作台任务已${current.status}。`);
      error.code = "RUN_STOPPED";
      throw error;
    }
    return current;
  }

  function updateStage(run, stageId, patch = {}) {
    const stages = asArray(run.stages).map((stage) =>
      stage.stageId === stageId
        ? {
            ...stage,
            ...patch,
            checkpoint: {
              ...asObject(stage.checkpoint),
              ...asObject(patch.checkpoint),
              durable: true,
              resumable: true
            }
          }
        : stage
    );
    return { ...run, stages };
  }

  function resetStagesFrom(run, stageId) {
    let shouldReset = false;
    const stages = asArray(run.stages).map((stage) => {
      if (stage.stageId === stageId) {
        shouldReset = true;
      }
      if (!shouldReset) {
        return stage;
      }
      const versions = stage.output
        ? [
            ...asArray(stage.versions),
            {
              versionId: stableId("stage_version", run.runId, stage.stageId, stage.finishedAt || nowIso()),
              stageId: stage.stageId,
              archivedAt: nowIso(),
              status: stage.status,
              metrics: stage.metrics,
              warnings: stage.warnings,
              output: stage.output
            }
          ]
        : asArray(stage.versions);
      return {
        ...stageTemplate(STAGE_DEFINITIONS.find((item) => item.stageId === stage.stageId) || stage),
        stageId: stage.stageId,
        title: stage.title,
        actionLabel: stage.actionLabel,
        description: stage.description,
        versions,
        status: "pending"
      };
    });
    return { ...run, stages };
  }

  async function loadBundle(run) {
    if (!run.jobId || !jobManager) {
      return {
        job: null,
        result: null,
        manifest: {},
        sources: asArray(run.rawDocuments).map(normalizeSourceFile),
        normalizedRootPath: ""
      };
    }
    const job = await jobManager.getJob(run.jobId);
    if (!job) {
      throw new Error("解析任务不存在，无法继续知识蒸馏工作台。");
    }
    if (job.status !== "completed") {
      const error = new Error("解析任务尚未完成，工作台等待原始语料阶段完成。");
      error.code = "JOB_NOT_COMPLETED";
      error.job = job;
      throw error;
    }
    const result = await jobManager.getJobResult(run.jobId);
    const manifest = result?.normalizedDocuments || {};
    const sources = asArray(result?.sourceFiles).map(normalizeSourceFile);
    return {
      job,
      result,
      manifest,
      sources,
      normalizedRootPath: getNormalizedDocumentsDirectory(userDataPath, run.jobId)
    };
  }

  async function completeStage(run, stageId, output, metrics = {}) {
    const completedAt = nowIso();
    const next = updateStage(run, stageId, {
      status: "completed",
      progressPercent: 100,
      finishedAt: completedAt,
      preview: preview(output.markdown),
      output,
      metrics: {
        ...metrics,
        outputMarkdownCharacters: text(output.markdown).length,
        outputJsonAvailable: Boolean(output.json)
      },
      activity: {
        idempotencyKey: stableId("activity", run.runId, stageId, output.title || "", text(output.markdown).length),
        completedActivities: [
          ...asArray(asArray(run.stages).find((stage) => stage.stageId === stageId)?.activity?.completedActivities),
          {
            activityId: stableId("activity", run.runId, stageId, completedAt),
            stageId,
            completedAt,
            writeVerification: {
              persistedIn: "run.json",
              atomicWrite: true,
              outputHash: stableHash(output.title || "", output.markdown || "", JSON.stringify(output.json || {}))
            }
          }
        ],
        failedActivities: []
      },
      warnings: asArray(output.warnings),
      error: ""
    });
    return saveRun(next);
  }

  async function runPipeline(runId) {
    if (running.has(runId)) return;
    running.add(runId);
    let run = await loadRun(runId);
    if (!run) {
      running.delete(runId);
      return;
    }
    try {
      run = await saveRun({
        ...run,
        status: "running",
        error: "",
        startedAt: run.startedAt || nowIso()
      });
      await queueStarted(queueMonitor, run, {
        phase: "running",
        status: "running",
        progressPercent: run.progressPercent || 0
      });

      let bundle;
      try {
        bundle = await loadBundle(run);
      } catch (error) {
        if (error?.code === "JOB_NOT_COMPLETED") {
          run = updateStage(run, "raw-format-conversion", {
            status: "waiting",
            progressPercent: Number(error.job?.progressPercent || 0),
            preview: "等待解析任务完成后继续。",
            error: ""
          });
          await saveRun({
            ...run,
            status: "waiting",
            error: "",
            progressPercent: 0,
            waitingFor: {
              kind: "job",
              jobId: run.jobId,
              status: error.job?.status || "",
              progressPercent: Number(error.job?.progressPercent || 0)
            }
          });
          await queueHeartbeat(queueMonitor, run, {
            phase: "waiting_for_parse_job",
            status: "waiting",
            stageId: "raw-format-conversion",
            progressPercent: Number(error.job?.progressPercent || 0)
          });
          return;
        }
        throw error;
      }

      for (const [stageIndex, definition] of STAGE_DEFINITIONS.entries()) {
        run = await assertRunCanContinue(runId);
        const existing = asArray(run.stages).find((stage) => stage.stageId === definition.stageId);
        if (existing?.status === "completed") {
          continue;
        }
        const baseProgress = Math.round((stageIndex / STAGE_DEFINITIONS.length) * 100);
        run = await saveRun(updateStage(run, definition.stageId, {
          status: "running",
          progressPercent: 20,
          startedAt: existing?.startedAt || nowIso(),
          error: "",
          activity: {
            ...asObject(existing?.activity),
            idempotencyKey: stableId("activity", run.runId, definition.stageId, run.updatedAt || ""),
            failedActivities: []
          }
        }));
        await queueHeartbeat(queueMonitor, run, {
          phase: definition.stageId,
          status: "running",
          stageId: definition.stageId,
          progressPercent: baseProgress
        });

        if (definition.stageId === "raw-format-conversion") {
          run = await completeStage(run, definition.stageId, buildRawConversionStage({ run, ...bundle }), {
            sourceCount: bundle.sources.length,
            normalizedDocumentCount: asArray(bundle.manifest.documents).length,
            sourceMaterialCount: asArray(bundle.manifest.sourceMaterials).length,
            assetCount: assetsFromSourcesAndManifest(bundle).length
          });
        } else if (definition.stageId === "normalized-corpus") {
          run = await completeStage(run, definition.stageId, buildNormalizedCorpusStage(bundle), {
            sourceCount: bundle.sources.length,
            normalizedDocumentCount: asArray(bundle.manifest.documents).length,
            assetCount: assetsFromSourcesAndManifest(bundle).length,
            sidecarAvailable: Boolean(bundle.manifest.machineReadable)
          });
        } else if (definition.stageId === "project-dossier") {
          run = await completeStage(run, definition.stageId, buildProjectDossierStage({ run, ...bundle }), {
            sourceCount: bundle.sources.length,
            textCharacterCount: bundle.sources.reduce((sum, source) => sum + source.text.length, 0),
            imageCount: bundle.sources.reduce((sum, source) => sum + Number(source.imageCount || 0), 0),
            tableCount: bundle.sources.reduce((sum, source) => sum + Number(source.tableCount || 0), 0),
            attachmentCount: bundle.sources.reduce((sum, source) => sum + Number(source.attachmentCount || 0), 0)
          });
        } else if (definition.stageId === "knowledge-index") {
          const mappings = normalizedDocumentMappings(bundle);
          run = await completeStage(run, definition.stageId, buildKnowledgeIndexStage(bundle), {
            retrievalItemCount: asArray(bundle.result?.retrieval?.items).length,
            timelineCount: asArray(bundle.result?.timeline).length,
            documentMappingCount: mappings.documents.length,
            sectionMappingCount: mappings.sections.length,
            blockMappingCount: mappings.blocks.length,
            assetMappingCount: mappings.assets.length,
            embeddingInputCount: mappings.embeddings.length,
            externalKnowledgeBaseSyncStatus: bundle.result?.externalKnowledgeBaseSync?.status || "not_configured"
          });
      } else if (definition.stageId === "knowledge-distillation") {
        const rawDocuments = rawDocumentsFromSources(bundle.sources, run);
        let distillation = null;
        if (knowledgeDistillationRuntime && typeof knowledgeDistillationRuntime.runDistillation === "function") {
          distillation = await knowledgeDistillationRuntime.runDistillation({
            runId: `${run.runId}-core`,
            query: run.query || run.prompt || "项目全部文档通用知识蒸馏",
            limit: Math.min(200, Math.max(30, rawDocuments.length || 30)),
            rawDocuments,
            rawCorpusBatchMaxCharacters: Number(run.rawCorpusBatchMaxCharacters || 64000),
            tokenBudget: Number(run.tokenBudget || 0),
            maxRounds: Number(run.maxRounds || 3),
            prompt: run.prompt || "",
            mergeStrategy: run.mergeStrategy || "timeline_then_topic",
            strategyVersion: run.strategyVersion || "timeline_then_topic_v2",
            semanticSupportRequired: run.semanticSupportRequired !== false,
            semanticClusterThreshold: run.semanticClusterThreshold,
            clusterRejectThreshold: run.clusterRejectThreshold,
            timeDecayHalfLifeDays: Number(run.timeDecayHalfLifeDays || 90),
            timeDecayFloor: Number(run.timeDecayFloor || 0.35),
            modelAlias: run.modelAlias || "",
            modelEnabled: run.modelEnabled === true
          });
        }
        if (!distillation || distillation.status !== "completed") {
          throw new Error(distillation?.error || "知识蒸馏模型闭环未完成。");
        }
        const markdown = combinedDistillationMarkdown(distillation, run.title || "项目知识蒸馏成果");
        const quality = qualityReport({ sources: bundle.sources, manifest: bundle.manifest, distillation, markdown });
        run = await completeStage(
          run,
          definition.stageId,
          stageOutput("知识蒸馏", markdown, {
            distillation,
            quality,
            model: {
              enabled: run.modelEnabled === true,
              modelAlias: run.modelAlias || "",
              prompt: run.prompt || "",
              tokenBudget: Number(run.tokenBudget || 0),
              rawCorpusBatchMaxCharacters: Number(run.rawCorpusBatchMaxCharacters || 64000),
              mergeStrategy: run.mergeStrategy || "timeline_then_topic",
              maxRounds: Number(run.maxRounds || 3),
              strategyVersion: run.strategyVersion || "timeline_then_topic_v2",
              semanticClusterThreshold: run.semanticClusterThreshold,
              clusterRejectThreshold: run.clusterRejectThreshold,
              timeDecayHalfLifeDays: Number(run.timeDecayHalfLifeDays || 90),
              timeDecayFloor: Number(run.timeDecayFloor || 0.35)
            }
          }),
          {
            rawDocumentCount: rawDocuments.length,
            candidateCount: asArray(distillation?.candidates).length,
            portableDocumentCount: asArray(distillation?.portableDocuments).length,
            semanticClusterCount: asArray(distillation?.semanticClusters).length,
            modelEnabled: run.modelEnabled === true,
            qualityPassed: quality.passed,
            qualityScore: Number(quality.algorithm.overallScore || 0),
            externalEvaluationScore: Number(quality.algorithm.externalEvaluationScore || 0),
            semanticCoverageScore: Number(quality.algorithm.semanticCoverageScore || 0),
            timelineOrderScore: Number(quality.algorithm.timelineOrderScore || 0),
            timeDecayCalibrationScore: Number(quality.algorithm.timeDecayCalibrationScore || 0),
            citationCount: quality.citations.citationCount,
            unsupportedConclusionCount: quality.citations.unsupportedConclusionCount
          }
        );
      }
        const completedProgress = Math.round(((stageIndex + 1) / STAGE_DEFINITIONS.length) * 100);
        run = await saveRun({
          ...run,
          progressPercent: completedProgress
        });
        await queueHeartbeat(queueMonitor, run, {
          phase: definition.stageId,
          status: "running",
          stageId: definition.stageId,
          progressPercent: completedProgress
        });
      }

      run = await saveRun({
        ...run,
        status: "completed",
        progressPercent: 100,
        finishedAt: nowIso(),
        waitingFor: null
      });
      await queueClosed(queueMonitor, run, {
        phase: "completed",
        status: "completed",
        progressPercent: 100
      });
    } catch (error) {
      const failedRun = await loadRun(runId);
      if (failedRun) {
        if (error?.code === "RUN_STOPPED" || error?.code === "RUN_DELETED") {
          await queueClosed(queueMonitor, failedRun, {
            phase: String(failedRun.status || "stopped"),
            status: String(failedRun.status || "canceled")
          });
          return;
        }
        const runningStage = asArray(failedRun.stages).find((stage) => stage.status === "running");
        let next = failedRun;
        if (runningStage) {
          next = updateStage(failedRun, runningStage.stageId, {
            status: "failed",
            error: error instanceof Error ? error.message : "知识蒸馏工作台任务失败。",
            finishedAt: nowIso()
          });
        }
        await saveRun({
          ...next,
          status: "failed",
          error: error instanceof Error ? error.message : "知识蒸馏工作台任务失败。",
          finishedAt: nowIso()
        });
        await queueClosed(queueMonitor, next, {
          phase: runningStage?.stageId || "failed",
          status: "failed",
          metadata: {
            error: error instanceof Error ? error.message : String(error || "")
          }
        });
      }
    } finally {
      running.delete(runId);
    }
  }

  function schedule(runId) {
    setImmediate(() => {
      runPipeline(runId).catch(() => undefined);
    });
  }

  async function createRun(input = {}) {
    if (input.modelEnabled === false) {
      throw new Error("知识蒸馏必须启用模型闭环，不能创建不调用模型的蒸馏任务。");
    }
    const createdAt = nowIso();
    const runId = text(input.runId) || stableId(
      "knowledge_distillation_workbench",
      input.jobId || "",
      input.query || "",
      createdAt
    );
    const run = {
      protocolVersion: KNOWLEDGE_DISTILLATION_WORKBENCH_PROTOCOL_VERSION,
      runId,
      title: text(input.title || "项目知识蒸馏工作台"),
      query: text(input.query || "项目全部文档通用知识蒸馏"),
      status: "queued",
      progressPercent: 0,
      createdAt,
      updatedAt: createdAt,
      startedAt: "",
      finishedAt: "",
      jobId: text(input.jobId || ""),
      batchId: text(input.batchId || input.jobId || ""),
      queueId: stableId("queue_item", "knowledge_distillation_workbench", runId),
      priority: text(input.priority || "normal"),
      modelAlias: text(input.modelAlias || input.model || "deepseek-v4-flash"),
      modelEnabled: true,
      prompt: text(input.prompt || input.systemPrompt || ""),
      tokenBudget: clampNumber(input.tokenBudget || input.contextBudget, 24000, 1024, 1000000),
      payloadBudget: clampNumber(input.payloadBudget, 120000, 4096, 2000000),
      rawCorpusBatchMaxCharacters: clampNumber(input.rawCorpusBatchMaxCharacters, 64000, 4096, 1000000),
      mergeStrategy: text(input.mergeStrategy || "timeline_then_topic"),
      maxRounds: clampNumber(input.maxRounds, 3, 1, 20),
      strategyVersion: text(input.strategyVersion || "timeline_then_topic_v2"),
      semanticSupportRequired: input.semanticSupportRequired !== false,
      semanticClusterThreshold: input.semanticClusterThreshold == null
        ? undefined
        : clampNumber(input.semanticClusterThreshold, 0.58, 0, 1),
      clusterRejectThreshold: input.clusterRejectThreshold == null
        ? undefined
        : clampNumber(input.clusterRejectThreshold, 0.42, 0, 1),
      timeDecayHalfLifeDays: clampNumber(input.timeDecayHalfLifeDays || input.temporalDecayHalfLifeDays, 90, 1, 3650),
      timeDecayFloor: clampNumber(input.timeDecayFloor || input.temporalDecayFloor, 0.35, 0, 1),
      rawDocuments: asArray(input.rawDocuments),
      storage: {
        durable: true,
        rootRelativePath: path.join("knowledge-distillation-workbench", "runs", safeSlug(runId)),
        checkpointFile: "run.json",
        workflowModel: "durable-stage-workflow",
        atomicWrite: true
      },
      taskManagement: {
        queue: "queue-monitor",
        worker: "knowledge-distillation-workbench",
        cancellable: true,
        retryable: true,
        stageRerunnable: true,
        priority: text(input.priority || "normal")
      },
      stages: defaultStages(),
      waitingFor: null,
      archivedAt: "",
      error: ""
    };
    await saveRun(run);
    await queueStarted(queueMonitor, run, {
      phase: "queued",
      status: "queued",
      progressPercent: 0
    });
    schedule(runId);
    return publicRun(await loadRun(runId));
  }

  async function resumeRun({ runId }) {
    const run = await loadRun(runId);
    if (!run) return null;
    if (run.archivedAt) {
      return publicRun(run);
    }
    const next = await saveRun({
      ...run,
      status: "queued",
      progressPercent: Math.min(Number(run.progressPercent || 0), 99),
      error: "",
      waitingFor: null,
      stages: asArray(run.stages).map((stage) =>
        stage.status === "running" || stage.status === "failed" || stage.status === "waiting"
          ? { ...stage, status: "pending", progressPercent: 0, error: "", finishedAt: "" }
          : stage
      )
    });
    await queueStarted(queueMonitor, next, {
      phase: "resume",
      status: "queued",
      progressPercent: next.progressPercent
    });
    schedule(runId);
    return publicRun(next);
  }

  async function cancelRun({ runId, reason = "" }) {
    const run = await loadRun(runId);
    if (!run) return null;
    const canceledAt = nowIso();
    const next = await saveRun({
      ...run,
      status: "canceled",
      finishedAt: run.finishedAt || canceledAt,
      canceledAt,
      cancelReason: text(reason || "用户取消知识蒸馏工作台任务。"),
      waitingFor: null,
      stages: asArray(run.stages).map((stage) =>
        stage.status === "running" || stage.status === "queued" || stage.status === "waiting"
          ? { ...stage, status: "canceled", finishedAt: canceledAt, error: "" }
          : stage
      )
    });
    await queueClosed(queueMonitor, next, {
      phase: "canceled",
      status: "canceled",
      metadata: { reason: next.cancelReason }
    });
    return publicRun(next);
  }

  async function archiveRun({ runId }) {
    const run = await loadRun(runId);
    if (!run) return null;
    const next = await saveRun({
      ...run,
      status: run.status === "running" || run.status === "queued" ? "archived" : run.status,
      archivedAt: nowIso()
    });
    await queueClosed(queueMonitor, next, {
      phase: "archived",
      status: "archived"
    });
    return publicRun(next);
  }

  async function deleteRun({ runId }) {
    const run = await loadRun(runId);
    if (!run) return null;
    await fs.rm(runDir(runId), { recursive: true, force: true });
    await queueClosed(queueMonitor, {
      ...run,
      status: "deleted"
    }, {
      phase: "deleted",
      status: "deleted"
    });
    return {
      ok: true,
      deletedRun: publicRun({
        ...run,
        status: "deleted",
        deletedAt: nowIso()
      })
    };
  }

  async function rerunStage({ runId, stageId }) {
    const run = await loadRun(runId);
    if (!run) return null;
    const known = STAGE_DEFINITIONS.some((definition) => definition.stageId === stageId);
    if (!known) {
      const error = new Error("未知知识蒸馏工作台阶段。");
      error.code = "UNKNOWN_STAGE";
      throw error;
    }
    const next = await saveRun({
      ...resetStagesFrom(run, stageId),
      status: "queued",
      progressPercent: Math.round(
        (asArray(run.stages).findIndex((stage) => stage.stageId === stageId) / STAGE_DEFINITIONS.length) * 100
      ),
      error: "",
      waitingFor: null,
      rerun: {
        stageId,
        requestedAt: nowIso()
      }
    });
    await queueStarted(queueMonitor, next, {
      phase: `rerun:${stageId}`,
      status: "queued",
      stageId,
      progressPercent: next.progressPercent
    });
    schedule(runId);
    return publicRun(next);
  }

  async function getRun({ runId }) {
    const run = await loadRun(runId);
    return run ? publicRun(run) : null;
  }

  async function listRuns({ limit = 50, includeArchived = false } = {}) {
    await ensureDir(runsPath);
    const entries = await fs.readdir(runsPath, { withFileTypes: true }).catch(() => []);
    const runs = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const run = await readJson(path.join(runsPath, entry.name, "run.json"), null);
      if (run && (includeArchived || !run.archivedAt)) runs.push(publicRun(run));
    }
    runs.sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
    return {
      protocolVersion: KNOWLEDGE_DISTILLATION_WORKBENCH_PROTOCOL_VERSION,
      items: runs.slice(0, Math.max(1, Math.min(Number(limit || 50), 200))),
      count: runs.length
    };
  }

  async function exportStage({ runId, stageId, format = "markdown" }) {
    const run = await loadRun(runId);
    if (!run) return null;
    const stage = asArray(run.stages).find((item) => item.stageId === stageId);
    if (!stage || !stage.output) return null;
    const normalizedFormat = normalizeFormat(format);
    const title = stage.output.title || stage.title || "knowledge-distillation";
    const baseName = `${safeSlug(run.title || run.runId)}-${safeSlug(stageId)}`;
    if (normalizedFormat === "package") {
      const files = {
        "manifest.json": jsonBuffer({
          protocolVersion: KNOWLEDGE_DISTILLATION_WORKBENCH_PROTOCOL_VERSION,
          runId: run.runId,
          stageId,
          title,
          exportedAt: nowIso(),
          formats: ["markdown", "html", "json", "docx"],
          metrics: stage.metrics || {},
          warnings: stage.warnings || []
        }),
        "stage.md": stage.output.markdown || "",
        "stage.html": stage.output.html || markdownToHtml(stage.output.markdown || ""),
        "stage.json": jsonBuffer(stage.output.json || {})
      };
      if (stageId === "raw-format-conversion" || stageId === "normalized-corpus") {
        const rootPath = run.jobId ? getNormalizedDocumentsDirectory(userDataPath, run.jobId) : "";
        for (const file of await readDirectoryFiles(rootPath, "normalized-documents")) {
          files[file.relativePath] = file.buffer;
        }
      }
      return {
        contentType: EXPORT_CONTENT_TYPES.package,
        fileName: `${baseName}.zip`,
        buffer: zipBuffer(files)
      };
    }
    if (normalizedFormat === "json") {
      return {
        contentType: EXPORT_CONTENT_TYPES.json,
        fileName: `${baseName}.json`,
        buffer: Buffer.from(JSON.stringify(stage.output.json || {}, null, 2), "utf8")
      };
    }
    if (normalizedFormat === "html") {
      return {
        contentType: EXPORT_CONTENT_TYPES.html,
        fileName: `${baseName}.html`,
        buffer: Buffer.from(stage.output.html || markdownToHtml(stage.output.markdown || ""), "utf8")
      };
    }
    if (normalizedFormat === "docx") {
      return {
        contentType: EXPORT_CONTENT_TYPES.docx,
        fileName: `${baseName}.docx`,
        buffer: await buildDocxBuffer(title, stage.output.markdown || "")
      };
    }
    return {
      contentType: EXPORT_CONTENT_TYPES.markdown,
      fileName: `${baseName}.md`,
      buffer: Buffer.from(stage.output.markdown || "", "utf8")
    };
  }

  async function exportRunPackage({ runId }) {
    const run = await loadRun(runId);
    if (!run) return null;
    const files = {
      "run.json": jsonBuffer(run),
      "manifest.json": jsonBuffer({
        protocolVersion: KNOWLEDGE_DISTILLATION_WORKBENCH_PROTOCOL_VERSION,
        runId: run.runId,
        title: run.title,
        status: run.status,
        exportedAt: nowIso(),
        stageCount: asArray(run.stages).length,
        storage: run.storage || {},
        taskManagement: run.taskManagement || {}
      })
    };
    for (const stage of asArray(run.stages)) {
      const prefix = path.posix.join("stages", safeSlug(stage.stageId || "stage"));
      files[path.posix.join(prefix, "stage.json")] = jsonBuffer(stage.output?.json || {});
      files[path.posix.join(prefix, "stage.md")] = stage.output?.markdown || "";
      files[path.posix.join(prefix, "stage.html")] = stage.output?.html || markdownToHtml(stage.output?.markdown || "");
      files[path.posix.join(prefix, "metrics.json")] = jsonBuffer(stage.metrics || {});
      if (asArray(stage.versions).length) {
        files[path.posix.join(prefix, "versions.json")] = jsonBuffer(stage.versions);
      }
    }
    const rootPath = run.jobId ? getNormalizedDocumentsDirectory(userDataPath, run.jobId) : "";
    for (const file of await readDirectoryFiles(rootPath, "normalized-documents")) {
      files[file.relativePath] = file.buffer;
    }
    return {
      contentType: EXPORT_CONTENT_TYPES.package,
      fileName: `${safeSlug(run.title || run.runId)}-workspace-package.zip`,
      buffer: zipBuffer(files)
    };
  }

  async function compareRuns({ leftRunId, rightRunId }) {
    const left = await loadRun(leftRunId);
    const right = await loadRun(rightRunId);
    if (!left || !right) return null;
    const stageComparisons = STAGE_DEFINITIONS.map((definition) => {
      const leftStage = asArray(left.stages).find((stage) => stage.stageId === definition.stageId) || {};
      const rightStage = asArray(right.stages).find((stage) => stage.stageId === definition.stageId) || {};
      const leftMetrics = asObject(leftStage.metrics);
      const rightMetrics = asObject(rightStage.metrics);
      const metricKeys = [...new Set([...Object.keys(leftMetrics), ...Object.keys(rightMetrics)])].sort();
      return {
        stageId: definition.stageId,
        title: definition.title,
        leftStatus: leftStage.status || "",
        rightStatus: rightStage.status || "",
        outputMarkdownDelta:
          text(rightStage.output?.markdown).length - text(leftStage.output?.markdown).length,
        metricDelta: Object.fromEntries(metricKeys.map((key) => [
          key,
          {
            left: leftMetrics[key],
            right: rightMetrics[key]
          }
        ])),
        warningDelta: asArray(rightStage.warnings).length - asArray(leftStage.warnings).length
      };
    });
    return {
      protocolVersion: KNOWLEDGE_DISTILLATION_WORKBENCH_PROTOCOL_VERSION,
      comparedAt: nowIso(),
      left: publicRun(left),
      right: publicRun(right),
      summary: {
        leftRunId,
        rightRunId,
        leftStatus: left.status,
        rightStatus: right.status,
        completedStageDelta:
          asArray(right.stages).filter((stage) => stage.status === "completed").length -
          asArray(left.stages).filter((stage) => stage.status === "completed").length
      },
      stages: stageComparisons
    };
  }

  async function recoverRunningRuns() {
    await ensureDir(runsPath);
    const listing = await listRuns({ limit: 200 });
    for (const run of listing.items) {
      if (["queued", "running", "waiting"].includes(run.status)) {
        schedule(run.runId);
      }
    }
  }

  if (fsSync.existsSync(runsPath)) {
    recoverRunningRuns().catch(() => undefined);
  }

  return {
    protocolVersion: KNOWLEDGE_DISTILLATION_WORKBENCH_PROTOCOL_VERSION,
    stageDefinitions: STAGE_DEFINITIONS,
    createRun,
    resumeRun,
    cancelRun,
    archiveRun,
    deleteRun,
    rerunStage,
    getRun,
    listRuns,
    exportStage,
    exportRunPackage,
    compareRuns
  };
}

export default createKnowledgeDistillationWorkbench;
