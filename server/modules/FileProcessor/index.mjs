import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import {
  detectExtensionBySignature,
  importFileDescriptorForExtension,
  importFileDescriptorForMediaType,
  importFileDescriptorForPath,
  importPlainTextFallbackExtension,
  importReadableTextDetection,
  inferZipContainerExtension,
  isImportArchiveDescriptor,
  isImportExtensionSupported,
  isImportFilePathSupported,
  isImportImageDescriptor,
  isImportTextDescriptor,
  mediaTypeForImportExtension,
  mediaTypeForImportPath,
  shouldIncludeUnknownReadableText,
  sniffTextExtension
} from "./import-file-types.mjs";
import { persistRawMailObject } from "../../storage/raw-object-store.mjs";
import {
  cleanupImportArtifacts,
  collectProtectedRawObjectPaths,
  createImportEntryId,
  hydrateImportCheckpointSources,
  loadImportCheckpointEntry,
  rawObjectPathsFromSources,
  saveImportCheckpointEntry,
  validateImportCheckpointEntry
} from "../../application/import-resume-store.mjs";

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function createThrottledImportProgressReporter(onProgress) {
  let lastReportedAt = 0;
  let lastKey = "";

  return ({
    stage,
    current = 0,
    total = 0,
    progressStart = 26,
    progressEnd = 54,
    force = false
  } = {}) => {
    if (typeof onProgress !== "function") {
      return;
    }

    const safeTotal = Math.max(0, Number(total) || 0);
    const safeCurrent = Math.max(0, Math.min(safeTotal || Number(current) || 0, Number(current) || 0));
    const now = Date.now();
    const progressSpan = Math.max(0, progressEnd - progressStart);
    const ratio = safeTotal > 0 ? safeCurrent / safeTotal : 0;
    const progressPercent = Math.max(
      progressStart,
      Math.min(progressEnd, Math.round(progressStart + progressSpan * ratio))
    );
    const stageText = safeTotal > 0 ? `${stage} ${safeCurrent}/${safeTotal}` : stage;
    const key = `${stageText}:${progressPercent}`;

    if (!force && safeCurrent < safeTotal && now - lastReportedAt < 1000) {
      return;
    }

    if (key === lastKey) {
      return;
    }

    lastReportedAt = now;
    lastKey = key;
    onProgress({
      progressPercent,
      stage: stageText
    });
  };
}

function resolveImageMediaType(extension, mediaTypeHint) {
  if (mediaTypeHint?.startsWith("image/")) {
    return mediaTypeHint;
  }

  const descriptor = importFileDescriptorForExtension(extension);
  return isImportImageDescriptor(descriptor) ? descriptor.mediaType || "" : "";
}

function looksLikeText(buffer) {
  if (!buffer || buffer.length === 0) {
    return true;
  }
  const detection = importReadableTextDetection();
  const sample = buffer.subarray(0, Math.min(buffer.length, detection.sampleBytes));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }
    if (byte < 9 || (byte > 13 && byte < 32)) {
      suspicious += 1;
    }
  }
  return suspicious / sample.length < detection.maxControlRatio;
}

function inferZipDocumentExtension(buffer, fallbackExtension = "") {
  try {
    const entries = Object.keys(unzipSync(new Uint8Array(buffer)));
    return inferZipContainerExtension(entries.join("\n")) || fallbackExtension;
  } catch {
    const haystack = buffer.toString("latin1");
    return inferZipContainerExtension(haystack) || fallbackExtension;
  }
}

function inferUploadedExtension(buffer) {
  const signatureExtension = detectExtensionBySignature(buffer);
  if (isImportArchiveDescriptor(importFileDescriptorForExtension(signatureExtension))) {
    return inferZipDocumentExtension(buffer, signatureExtension);
  }
  if (signatureExtension) {
    return signatureExtension;
  }
  if (looksLikeText(buffer)) {
    const text = buffer.subarray(0, Math.min(buffer.length, 8192)).toString("utf8");
    return sniffTextExtension(text) || importPlainTextFallbackExtension();
  }
  return "";
}

function chooseUploadedExtension({ detectedExtension, declaredExtension }) {
  if (!declaredExtension || !isImportExtensionSupported(declaredExtension)) {
    return detectedExtension;
  }

  if (!detectedExtension) {
    return declaredExtension;
  }

  if (detectedExtension === importPlainTextFallbackExtension()) {
    const declaredDescriptor = importFileDescriptorForExtension(declaredExtension);
    if (declaredDescriptor && !isImportImageDescriptor(declaredDescriptor)) {
      return declaredExtension;
    }
  }

  return detectedExtension;
}

function mediaTypeForExtension(extension) {
  return mediaTypeForImportExtension(extension);
}

function buildImagePayload(buffer, mediaType) {
  return {
    imageBuffer: buffer,
    imageDataUrl: `data:${mediaType};base64,${buffer.toString("base64")}`
  };
}

function buildOriginalPayload({
  buffer,
  extension,
  originalRelativePath = "",
  ingestOrigin = "filesystem",
  sourceContainerPath = "",
  checkpointMaterialPath = ""
}) {
  return {
    originalBuffer: buffer,
    originalExtension: extension,
    originalSha256: createHash("sha256").update(buffer).digest("hex"),
    originalByteSize: buffer.length,
    originalRelativePath,
    ingestOrigin,
    sourceContainerPath,
    checkpointMaterialPath
  };
}

function normalizeTimestamp(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "";
  }

  return value.toISOString();
}

function buildSourceTimeMetadata({ stats, collectedAt }) {
  const fallback = collectedAt || new Date().toISOString();
  const createdAt =
    normalizeTimestamp(stats?.birthtime) || normalizeTimestamp(stats?.ctime) || fallback;
  const updatedAt =
    normalizeTimestamp(stats?.mtime) || normalizeTimestamp(stats?.ctime) || createdAt;

  return {
    sourceCreatedAt: createdAt,
    sourceUpdatedAt: updatedAt,
    sourceCollectedAt: fallback
  };
}

function buildRouteExtractionWarning(name, fileType, route, error) {
  const message = error instanceof Error ? error.message : "未知错误";
  const routeLabel = route?.mountName || route?.action || "解析模块";

  if (fileType === "image" && routeLabel === "ocr") {
    return `${name} OCR 未完成：${message} 已保留原始图片。`;
  }

  if (fileType === "image") {
    return `${name} 图片解析未完成：${message} 已保留原始图片。`;
  }

  return `${name} 通过 ${routeLabel} 解析未完成：${message}`;
}

function getMountedHandler(runtime, mountName = "") {
  return runtime?.mounts?.[mountName] || null;
}

function resolveDocumentRoute({ runtime, sourceKind, extension = "", mediaTypeHint = "" }) {
  if (runtime && typeof runtime.resolveDocumentRoute === "function") {
    return runtime.resolveDocumentRoute({
      sourceKind,
      extension,
      mediaTypeHint
    });
  }

  if (sourceKind === "image") {
    return {
      mountName: "ocr",
      action: "extractText"
    };
  }

  return {
    mountName: "documentParser",
    action: "extractDocument",
    matchedBy: "default"
  };
}

function normalizeDocumentParseResult(result, parserId = "") {
  if (typeof result === "string") {
    return {
      parserId,
      text: normalizeText(result),
      metadata: {},
      embeddedDocuments: [],
      mediaType: ""
    };
  }

  const metadata =
    result?.metadata && typeof result.metadata === "object" && !Array.isArray(result.metadata)
      ? result.metadata
      : {};
  const embeddedDocuments = Array.isArray(result?.embeddedDocuments)
    ? result.embeddedDocuments.map((entry, index) => ({
        id: String(entry?.id || `embedded-${index + 1}`),
        text: normalizeText(entry?.text || ""),
        metadata:
          entry?.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
            ? entry.metadata
            : {}
      }))
    : [];

  return {
    parserId: String(result?.parserId || parserId || ""),
    text: normalizeText(result?.text || result?.content || ""),
    metadata,
    embeddedDocuments,
    mediaType: String(result?.mediaType || metadata["Content-Type"] || "")
  };
}

function documentParserSupports({ extension, mediaTypeHint, runtime, sourceKind = "document" }) {
  const route = resolveDocumentRoute({
    runtime,
    sourceKind,
    extension,
    mediaTypeHint
  });
  const mountedHandler = getMountedHandler(runtime, route.mountName);
  if (!mountedHandler?.enabled || typeof mountedHandler.supports !== "function") {
    return (
      mountedHandler?.enabled &&
      route.matchedBy !== "default" &&
      (typeof mountedHandler.extractText === "function" ||
        typeof mountedHandler.extractDocument === "function")
    );
  }

  return mountedHandler.supports({ extension, mediaTypeHint, sourceKind });
}

function hasConfiguredRoute({
  runtime,
  extension = "",
  mediaTypeHint = "",
  sourceKind = "document",
  allowKindRoute = false
}) {
  const route = resolveDocumentRoute({
    runtime,
    sourceKind,
    extension,
    mediaTypeHint
  });

  return (
    route.matchedBy === "extension" ||
    route.matchedBy === "mediaType" ||
    (allowKindRoute && route.matchedBy === "kind")
  );
}

async function executeRouteExtraction({
  runtime,
  route,
  buffer,
  filePath,
  fileName,
  mediaTypeHint,
  settings,
  userDataPath,
  sourceKind
}) {
  const mountedHandler = getMountedHandler(runtime, route.mountName);

  if (!mountedHandler?.enabled) {
    throw new Error(`当前运行配置未挂载 ${route.mountName || "文档"} 解析组件。`);
  }

  const baseInput = {
    buffer,
    filePath,
    fileName,
    extension: path.extname(fileName || filePath).toLowerCase(),
    mediaTypeHint,
    settings,
    userDataPath,
    fileType: sourceKind,
    sourceKind
  };

  if (route.action === "extractDocument") {
    if (typeof mountedHandler.extractDocument === "function") {
      return normalizeDocumentParseResult(
        await mountedHandler.extractDocument(baseInput),
        mountedHandler.id
      );
    }

    if (typeof mountedHandler.extractText === "function") {
      return normalizeDocumentParseResult(
        await mountedHandler.extractText(baseInput),
        mountedHandler.id
      );
    }
  }

  if (route.action === "extractText") {
    if (typeof mountedHandler.extractText === "function") {
      return normalizeDocumentParseResult(
        await mountedHandler.extractText(baseInput),
        mountedHandler.id
      );
    }

    if (typeof mountedHandler.extractDocument === "function") {
      return normalizeDocumentParseResult(
        await mountedHandler.extractDocument(baseInput),
        mountedHandler.id
      );
    }
  }

  throw new Error(`挂载 ${route.mountName} 不支持 ${route.action}。`);
}

async function tryExtractWithOcr({
  buffer,
  filePath,
  name,
  fileType,
  settings,
  userDataPath,
  runtime
}) {
  const extension = path.extname(name || filePath).toLowerCase();
  const mediaTypeHint = fileType === "image" ? resolveImageMediaType(extension, "") : "";
  const route = resolveDocumentRoute({
    runtime,
    sourceKind: fileType === "image" ? "image" : fileType,
    extension,
    mediaTypeHint
  });
  const mountedHandler = getMountedHandler(runtime, route.mountName);
  if (
    (route.mountName === "ocr" && settings.ocrEnabled === false) ||
    !mountedHandler?.enabled ||
    (typeof mountedHandler.extractText !== "function" &&
      typeof mountedHandler.extractDocument !== "function")
  ) {
    return {
      text: "",
      warnings: [],
      attempted: false
    };
  }

  try {
    const result = await executeRouteExtraction({
      runtime,
      route,
      buffer,
      filePath,
      fileName: name || filePath,
      mediaTypeHint,
      settings,
      userDataPath,
      sourceKind: fileType === "image" ? "image" : fileType
    });

    return {
      text: normalizeText(result.text || ""),
      parserId: result.parserId || mountedHandler.id || "",
      metadata: result.metadata || {},
      embeddedDocuments: result.embeddedDocuments || [],
      warnings: [],
      attempted: true
    };
  } catch (error) {
    return {
      text: "",
      parserId: "",
      metadata: {},
      embeddedDocuments: [],
      warnings: [buildRouteExtractionWarning(name || filePath || "未命名文件", fileType, route, error)],
      attempted: true
    };
  }
}

async function readStructuredBuffer({
  buffer,
  filePath,
  name,
  mediaTypeHint,
  settings,
  userDataPath,
  runtime
}) {
  const extension = path.extname(name || filePath).toLowerCase();
  const descriptor = importFileDescriptorForPath(name || filePath) ||
    importFileDescriptorForExtension(extension) ||
    importFileDescriptorForMediaType(mediaTypeHint);
  const sourceKind = descriptor?.kind || (mediaTypeHint?.startsWith("text/") ? "text" : "document");
  const route = resolveDocumentRoute({
    runtime,
    sourceKind,
    extension,
    mediaTypeHint
  });

  return executeRouteExtraction({
    runtime,
    route,
    buffer,
    filePath,
    fileName: name || filePath,
    mediaTypeHint,
    settings,
    userDataPath,
    sourceKind
  });
}

function isZipArchive(extension, mediaTypeHint) {
  const descriptor = importFileDescriptorForExtension(extension);
  if (isImportArchiveDescriptor(descriptor)) {
    return true;
  }
  return isImportArchiveDescriptor(importFileDescriptorForMediaType(mediaTypeHint));
}

function normalizeArchiveEntryPath(value) {
  const normalized = String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();

  if (!normalized || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    return "";
  }

  return normalized;
}

async function parseArchiveInput({
  id,
  name,
  filePath,
  buffer,
  sourceTimes,
  settings,
  userDataPath,
  runtime,
  batchId,
  depth = 0
}) {
  if (depth > 1) {
    throw new Error("压缩包嵌套层级过深，已停止继续展开。");
  }

  let archiveEntries;

  try {
    archiveEntries = unzipSync(new Uint8Array(buffer));
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    throw new Error(`${name || filePath || "压缩包"} 解压失败：${message}`);
  }

  const parsedEntries = [];

  for (const [rawEntryPath, entryBuffer] of Object.entries(archiveEntries)) {
    const entryPath = normalizeArchiveEntryPath(rawEntryPath);
    if (!entryPath || entryPath.endsWith("/")) {
      continue;
    }

    const extension = path.posix.extname(entryPath).toLowerCase();
    if (
      !isImportFilePathSupported(entryPath) &&
      !hasConfiguredRoute({
        runtime,
        extension,
        sourceKind: "document"
      })
    ) {
      continue;
    }

    const nestedSources = await parseBufferInput({
      id: `${id}::${entryPath}`,
      name: entryPath,
      filePath: `${filePath || name}#${entryPath}`,
      buffer: Buffer.from(entryBuffer),
      mediaTypeHint: "",
      sourceTimes,
      settings,
      userDataPath,
      runtime,
      batchId,
      originalRelativePath: entryPath,
      ingestOrigin: "archive",
      sourceContainerPath: filePath || name || "",
      depth: depth + 1
    });

    parsedEntries.push(...nestedSources);
  }

  if (parsedEntries.length === 0) {
    throw new Error(`${name || filePath || "压缩包"} 中没有可解析的文件。`);
  }

  return parsedEntries;
}

async function parseImageInput({
  id,
  name,
  filePath,
  buffer,
  mediaType,
  sourceTimes,
  settings,
  userDataPath,
  runtime,
  checkpointMaterialPath = ""
}) {
  const ocrResult = await tryExtractWithOcr({
    buffer,
    filePath,
    name,
    fileType: "image",
    settings,
    userDataPath,
    runtime
  });

  return {
    id,
    name,
    path: filePath,
    kind: "image",
    ...sourceTimes,
    text: ocrResult.text,
    mediaType,
    documentParserId: ocrResult.parserId || "",
    documentMetadata: ocrResult.metadata || {},
    embeddedDocuments: ocrResult.embeddedDocuments || [],
    warnings: ocrResult.warnings,
    ocrAttempted: ocrResult.attempted,
    ...buildOriginalPayload({
      buffer,
      extension: path.extname(name || filePath).toLowerCase(),
      checkpointMaterialPath
    }),
    ...buildImagePayload(buffer, mediaType)
  };
}

async function parseStructuredInput({
  id,
  name,
  filePath,
  buffer,
  extension,
  mediaTypeHint,
  sourceTimes,
  settings,
  userDataPath,
  runtime,
  batchId,
  originalRelativePath = "",
  ingestOrigin = "filesystem",
  sourceContainerPath = "",
  checkpointMaterialPath = ""
}) {
  const descriptor = importFileDescriptorForPath(name || filePath) ||
    importFileDescriptorForExtension(extension) ||
    importFileDescriptorForMediaType(mediaTypeHint);
  const descriptorKind = descriptor?.kind || (mediaTypeHint?.startsWith("text/") ? "text" : "document");
  const isEmailDocument = descriptorKind === "email";
  const isTextDocument = descriptorKind === "text";
  const kind = isEmailDocument
    ? "email"
    : isTextDocument
      ? "text"
      : descriptorKind;
  const warnings = [];
  let ocrAttempted = false;
  let document = await readStructuredBuffer({
    buffer,
    filePath,
    name,
    mediaTypeHint,
    settings,
    userDataPath,
    runtime
  });
  let text = document.text;

  if (!text && kind === "pdf") {
    const ocrResult = await tryExtractWithOcr({
      buffer,
      filePath,
      name,
      fileType: "pdf",
      settings,
      userDataPath,
      runtime
    });

    text = ocrResult.text;
    warnings.push(...ocrResult.warnings);
    ocrAttempted = ocrResult.attempted;
    document = {
      ...document,
      text
    };
  }

  let rawObject = null;
  if (isEmailDocument && batchId) {
    rawObject = await persistRawMailObject({
      userDataPath,
      batchId,
      buffer,
      originalRelativePath: originalRelativePath || name || path.basename(filePath || ""),
      originalSourcePath: filePath || "",
      sourceContainerPath,
      mediaType:
        mediaTypeHint ||
        descriptor?.mediaType ||
        mediaTypeForImportExtension(extension),
      ingestOrigin,
      sourceCreatedAt: sourceTimes.sourceCreatedAt,
      sourceUpdatedAt: sourceTimes.sourceUpdatedAt,
      sourceCollectedAt: sourceTimes.sourceCollectedAt
    });
  }

  return {
    id,
    name,
    path: filePath,
    kind,
    ...sourceTimes,
    text,
    mediaType: document.mediaType || mediaTypeHint || "",
    documentParserId: document.parserId || "",
    documentMetadata: document.metadata || {},
    embeddedDocuments: document.embeddedDocuments || [],
    warnings,
    ocrAttempted,
    ...buildOriginalPayload({
      buffer,
      extension,
      originalRelativePath,
      ingestOrigin,
      sourceContainerPath,
      checkpointMaterialPath
    }),
    rawObject
  };
}

async function parseBufferInput({
  id,
  name,
  filePath = "",
  buffer,
  mediaTypeHint = "",
  sourceTimes,
  settings,
  userDataPath,
  runtime,
  batchId = "",
  originalRelativePath = "",
  ingestOrigin = "filesystem",
  sourceContainerPath = "",
  checkpointMaterialPath = "",
  depth = 0
}) {
  const sourcePath = name || filePath;
  const descriptor = importFileDescriptorForPath(sourcePath) ||
    importFileDescriptorForMediaType(mediaTypeHint);
  const extension = descriptor?.extension || path.extname(sourcePath).toLowerCase();
  const mediaType = resolveImageMediaType(extension, mediaTypeHint);

  if (isZipArchive(extension, mediaTypeHint)) {
    return parseArchiveInput({
      id,
      name,
      filePath,
      buffer,
      sourceTimes,
      settings,
      userDataPath,
      runtime,
      batchId,
      depth
    });
  }

  if (mediaType) {
    return [await parseImageInput({
      id,
      name,
      filePath,
      buffer,
      mediaType,
      sourceTimes,
      settings,
      userDataPath,
      runtime,
      checkpointMaterialPath
    })];
  }

  if (
    isImportTextDescriptor(descriptor) ||
    mediaTypeHint?.startsWith("text/") ||
    (shouldIncludeUnknownReadableText() && looksLikeText(buffer))
  ) {
    return [await parseStructuredInput({
      id,
      name,
      filePath,
      buffer,
      extension,
      mediaTypeHint:
        mediaTypeHint ||
        descriptor?.mediaType ||
        mediaTypeForImportPath(sourcePath) ||
        mediaTypeForImportExtension(importPlainTextFallbackExtension()),
      sourceTimes,
      settings,
      userDataPath,
      runtime,
      batchId,
      originalRelativePath,
      ingestOrigin,
      sourceContainerPath,
      checkpointMaterialPath
    })];
  }

  if (
    descriptor ||
    hasConfiguredRoute({ runtime, extension, mediaTypeHint, sourceKind: "document" }) ||
    documentParserSupports({ extension, mediaTypeHint, runtime })
  ) {
    return [await parseStructuredInput({
      id,
      name,
      filePath,
      buffer,
      extension,
      mediaTypeHint,
      sourceTimes,
      settings,
      userDataPath,
      runtime,
      batchId,
      originalRelativePath,
      ingestOrigin,
      sourceContainerPath,
      checkpointMaterialPath
    })];
  }

  throw new Error("暂不支持这种文件类型，或当前文件未交由 Java 文档解析链处理。");
}

async function parseFilePath(fileEntry, options = {}) {
  const stats = fileEntry.stats || await fs.stat(fileEntry.absolutePath);
  const buffer = await fs.readFile(fileEntry.absolutePath);
  const name = path.basename(fileEntry.absolutePath);

  return parseBufferInput({
    id: fileEntry.absolutePath,
    name,
    filePath: fileEntry.absolutePath,
    buffer,
    originalRelativePath: fileEntry.relativePath || name,
    ingestOrigin: "filesystem",
    checkpointMaterialPath: fileEntry.absolutePath,
    sourceTimes: buildSourceTimeMetadata({
      stats,
      collectedAt: options.collectedAt
    }),
    ...options
  });
}

async function parseUploadedFile(uploadedFile, index, options) {
  const buffer = uploadedFile.stagedPath
    ? await fs.readFile(uploadedFile.stagedPath)
    : Buffer.from(uploadedFile.dataBase64 || "", "base64");
  const serverTokenName = path.basename(
    String(uploadedFile.relativePath || uploadedFile.name || `upload-${index + 1}`)
  );
  const detectedExtension = inferUploadedExtension(buffer);
  const declaredExtension = path.extname(serverTokenName).toLowerCase();
  const extension = chooseUploadedExtension({ detectedExtension, declaredExtension });
  const name = extension
    ? `${serverTokenName.replace(/\.[a-z0-9]+$/i, "")}${extension}`
    : serverTokenName;
  return parseBufferInput({
    id: serverTokenName || `upload-${index + 1}`,
    name,
    filePath: name,
    buffer,
    mediaTypeHint: mediaTypeForExtension(extension),
    originalRelativePath: name,
    ingestOrigin: "upload",
    checkpointMaterialPath: uploadedFile.stagedPath || "",
    sourceTimes: buildSourceTimeMetadata({
      collectedAt: options.collectedAt
    }),
    ...options
  });
}

export function isSupportedImportPath(filePath) {
  return isImportFilePathSupported(filePath);
}

export async function isSupportedImportFilePath(filePath) {
  if (isSupportedImportPath(filePath)) {
    return true;
  }
  if (!shouldIncludeUnknownReadableText()) {
    return false;
  }
  try {
    const handle = await fs.open(filePath, "r");
    try {
      const detection = importReadableTextDetection();
      const buffer = Buffer.alloc(detection.sampleBytes);
      const { bytesRead } = await handle.read(buffer, 0, detection.sampleBytes, 0);
      return looksLikeText(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

function buildEmptyContentWarning(parsed) {
  if (parsed.kind === "email") {
    return `${parsed.name} 没有提取到邮件正文，可能是加密邮件、损坏邮件，或当前环境缺少 Tika。`;
  }

  if (parsed.kind === "docx") {
    return `${parsed.name} 没有提取到正文，可能是图片版 Word，或正文位于文本框、批注、页眉页脚、嵌入对象中。`;
  }

  if (parsed.kind === "document") {
    return `${parsed.name} 没有提取到正文，Tika 未返回有效文本。可能是扫描件、纯图片文档，或该格式需要补充依赖。`;
  }

  if (parsed.kind === "pdf") {
    if (parsed.ocrAttempted) {
      return `${parsed.name} 已尝试 PaddleOCR，但仍未提取到正文。可能是无文字扫描件，或识别质量不足。`;
    }

    return `${parsed.name} 没有提取到正文，可能是扫描版 PDF 或图片型 PDF。可配置 PaddleOCR 作为兜底。`;
  }

  return `${parsed.name} 没有提取到可用内容，已跳过。`;
}

async function collectSupportedFilesFromDirectory(
  directoryPath,
  collector,
  visitedDirectories,
  rootDirectoryPath = directoryPath,
  runtime = null
) {
  const resolvedPath = path.resolve(directoryPath);

  if (visitedDirectories.has(resolvedPath)) {
    return;
  }

  visitedDirectories.add(resolvedPath);

  const directoryEntries = await fs.readdir(resolvedPath, {
    withFileTypes: true
  });

  for (const directoryEntry of directoryEntries) {
    const entryPath = path.join(resolvedPath, directoryEntry.name);

    if (directoryEntry.isDirectory()) {
      await collectSupportedFilesFromDirectory(
        entryPath,
        collector,
        visitedDirectories,
        rootDirectoryPath,
        runtime
      );
      continue;
    }

    if (!directoryEntry.isFile()) {
      continue;
    }

    if (
      await isSupportedImportFilePath(entryPath) ||
      hasConfiguredRoute({
        runtime,
        extension: path.extname(entryPath).toLowerCase(),
        sourceKind: "document"
      })
    ) {
      collector.push({
        absolutePath: entryPath,
        relativePath: path.relative(rootDirectoryPath, entryPath).split(path.sep).join("/")
      });
    }
  }
}

async function expandInputFilePaths(filePaths, runtime = null) {
  const expandedFileEntries = [];
  const warnings = [];
  const visitedDirectories = new Set();

  for (const inputPath of filePaths) {
    try {
      const stats = await fs.stat(inputPath);

      if (stats.isDirectory()) {
        const filesBefore = expandedFileEntries.length;
        await collectSupportedFilesFromDirectory(
          inputPath,
          expandedFileEntries,
          visitedDirectories,
          inputPath,
          runtime
        );

        if (expandedFileEntries.length === filesBefore) {
          warnings.push(`${path.basename(inputPath)} 中没有可解析的文件，已跳过。`);
        }

        continue;
      }

      expandedFileEntries.push({
        absolutePath: inputPath,
        relativePath: path.basename(inputPath)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      warnings.push(`${path.basename(inputPath)} 读取失败：${message}`);
    }
  }

  return {
    fileEntries: expandedFileEntries,
    warnings
  };
}

function resolveKnowledgeSourceManifestPath(userDataPath, fileManifestPath = "") {
  const rawPath = String(fileManifestPath || "").trim();
  if (!rawPath) {
    return "";
  }
  const resolved = path.resolve(rawPath);
  const allowedRoot = path.resolve(userDataPath, "knowledge-sources", "hydrated");
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error("知识源文件清单路径不在允许的自动下载缓存目录中。");
  }
  return resolved;
}

async function loadInputFileManifest({ userDataPath, fileManifestPath }) {
  const resolved = resolveKnowledgeSourceManifestPath(userDataPath, fileManifestPath);
  if (!resolved) {
    return null;
  }
  const raw = await fs.readFile(resolved, "utf8");
  const parsed = JSON.parse(raw);
  const files = Array.isArray(parsed.files) ? parsed.files : [];
  const fileEntries = [];
  const warnings = [];
  for (const file of files) {
    const rawAbsolutePath = String(file.absolutePath || "").trim();
    if (!rawAbsolutePath) {
      warnings.push("知识源文件清单包含空路径，已跳过。");
      continue;
    }
    const absolutePath = path.resolve(rawAbsolutePath);
    const relativePath = String(file.relativePath || path.basename(absolutePath)).replace(/\\/g, "/");
    if (!relativePath || relativePath.includes("../") || path.isAbsolute(relativePath)) {
      warnings.push("知识源文件清单包含不安全路径，已跳过。");
      continue;
    }
    fileEntries.push({
      absolutePath,
      relativePath,
      originalAbsolutePath: file.originalAbsolutePath || ""
    });
  }
  return {
    fileEntries,
    warnings,
    manifest: parsed
  };
}

function normalizeSignatureTime(value) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : 0;
}

async function createFilesystemImportWorkItem(fileEntry) {
  const stats = await fs.stat(fileEntry.absolutePath);
  const absolutePath = path.resolve(fileEntry.absolutePath);
  const signature = {
    kind: "filesystem",
    absolutePath,
    relativePath: fileEntry.relativePath || path.basename(absolutePath),
    byteSize: Number(stats.size || 0),
    mtimeMs: normalizeSignatureTime(stats.mtimeMs),
    ctimeMs: normalizeSignatureTime(stats.ctimeMs)
  };
  return {
    entryId: createImportEntryId({
      kind: "filesystem",
      absolutePath,
      relativePath: signature.relativePath
    }),
    inputKind: "filesystem",
    signature,
    fileEntry: {
      ...fileEntry,
      absolutePath,
      stats
    }
  };
}

function createUploadedImportWorkItem(uploadedFile, index) {
  const name = String(uploadedFile?.relativePath || uploadedFile?.name || `upload-${index + 1}`);
  const signature = {
    kind: "upload",
    index,
    name,
    byteSize: Number(uploadedFile?.byteSize || 0),
    sha256: String(uploadedFile?.sha256 || "").toLowerCase(),
    stagedPath: uploadedFile?.stagedPath ? path.resolve(uploadedFile.stagedPath) : ""
  };
  return {
    entryId: createImportEntryId({
      kind: "upload",
      index,
      name,
      byteSize: signature.byteSize,
      sha256: signature.sha256
    }),
    inputKind: "upload",
    signature,
    uploadedFile
  };
}

async function restoreSourcesFromImportCheckpoint({
  userDataPath,
  batchId,
  workItem
}) {
  if (!batchId) {
    return null;
  }
  const entry = await loadImportCheckpointEntry({
    userDataPath,
    batchId,
    entryId: workItem.entryId
  });
  const usable = await validateImportCheckpointEntry({
    userDataPath,
    entry,
    expectedSignature: workItem.signature
  });
  if (!usable) {
    return null;
  }
  return {
    sources: await hydrateImportCheckpointSources({
      userDataPath,
      sources: entry.sources || []
    }),
    warnings: Array.isArray(entry.warnings) ? entry.warnings : []
  };
}

function appendUsableParsedEntries({ parsedEntries, sources, warnings }) {
  const acceptedSources = [];
  const entryWarnings = [];

  for (const parsed of parsedEntries || []) {
    entryWarnings.push(...(parsed.warnings || []));

    if (parsed.kind === "image" || parsed.text) {
      acceptedSources.push(parsed);
    } else {
      entryWarnings.push(buildEmptyContentWarning(parsed));
    }
  }

  warnings.push(...entryWarnings);
  sources.push(...acceptedSources);
  return {
    acceptedSources,
    entryWarnings
  };
}

async function appendCheckpointedInputSources({
  userDataPath,
  batchId,
  workItem,
  sources,
  warnings,
  runtime,
  generatedAt,
  parse
}) {
  async function publishIncrementalSearchIndex(parsedSources) {
    const knowledgeBase = runtime?.mounts?.knowledgeBase;
    if (!batchId || !knowledgeBase || typeof knowledgeBase.ingestSources !== "function") {
      return;
    }
    try {
      await knowledgeBase.ingestSources({
        batchId,
        sources: parsedSources,
        generatedAt
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      warnings.push(`${workItem.inputKind || "input"} 增量检索索引写入失败：${message}`);
    }
  }

  const restored = await restoreSourcesFromImportCheckpoint({
    userDataPath,
    batchId,
    workItem
  });
  if (restored) {
    warnings.push(...restored.warnings);
    sources.push(...restored.sources);
    await publishIncrementalSearchIndex(restored.sources);
    return rawObjectPathsFromSources(restored.sources);
  }

  const parsedEntries = await parse();
  const { acceptedSources, entryWarnings } = appendUsableParsedEntries({
    parsedEntries,
    sources,
    warnings
  });

  if (batchId && acceptedSources.length > 0) {
    await saveImportCheckpointEntry({
      userDataPath,
      batchId,
      entryId: workItem.entryId,
      inputKind: workItem.inputKind,
      signature: workItem.signature,
      sources: acceptedSources,
      warnings: entryWarnings
    });
    await publishIncrementalSearchIndex(acceptedSources);
  }

  return rawObjectPathsFromSources(acceptedSources);
}

export async function readInputSources({
  inputText,
  filePaths = [],
  fileManifestPath = "",
  uploadedFiles = [],
  settings,
  userDataPath,
  generatedAt,
  batchId = "",
  runtime = null,
  reportProgress = null
}) {
  const sources = [];
  const warnings = [];
  const reportImportProgress = createThrottledImportProgressReporter(reportProgress);
  reportImportProgress({
    stage: "展开输入目录",
    progressStart: 26,
    progressEnd: 28,
    force: true
  });
  const manifestInput = await loadInputFileManifest({ userDataPath, fileManifestPath });
  const expanded = manifestInput || await expandInputFilePaths(filePaths, runtime);
  warnings.push(...expanded.warnings);
  const fileWorkItems = [];
  const uploadWorkItems = uploadedFiles.map((uploadedFile, index) =>
    createUploadedImportWorkItem(uploadedFile, index)
  );

  for (const [index, fileEntry] of expanded.fileEntries.entries()) {
    try {
      fileWorkItems.push(await createFilesystemImportWorkItem(fileEntry));
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      warnings.push(`${path.basename(fileEntry.absolutePath)} 读取失败：${message}`);
    }
    reportImportProgress({
      stage: "建立文件索引",
      current: index + 1,
      total: expanded.fileEntries.length,
      progressStart: 28,
      progressEnd: 32
    });
  }

  const protectedRawObjectPaths = batchId
    ? await collectProtectedRawObjectPaths({
        userDataPath,
        batchId,
        expectedEntries: [...fileWorkItems, ...uploadWorkItems].map((workItem) => ({
          entryId: workItem.entryId,
          signature: workItem.signature
        }))
      })
    : new Set();
  if (batchId) {
    await cleanupImportArtifacts({
      userDataPath,
      batchId,
      protectedRawObjectPaths,
      cleanupTemp: true
    });
  }

  const totalWorkItems = fileWorkItems.length + uploadWorkItems.length;
  reportImportProgress({
    stage: "读取输入文件",
    current: 0,
    total: totalWorkItems,
    progressStart: 32,
    progressEnd: 54,
    force: true
  });

  if (inputText && inputText.trim()) {
    sources.push({
      id: "pasted-text",
      name: "粘贴文本",
      path: "",
      kind: "text",
      ...buildSourceTimeMetadata({
        collectedAt: generatedAt
      }),
      text: normalizeText(inputText)
    });
  }

  let processedWorkItems = 0;
  for (const workItem of fileWorkItems) {
    try {
      const rawObjectPaths = await appendCheckpointedInputSources({
        userDataPath,
        batchId,
        workItem,
        sources,
        warnings,
        runtime,
        generatedAt,
        parse: () =>
          parseFilePath(workItem.fileEntry, {
            collectedAt: generatedAt,
            settings,
            userDataPath,
            batchId,
            runtime
          })
      });
      for (const rawObjectPath of rawObjectPaths) {
        protectedRawObjectPaths.add(rawObjectPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      warnings.push(`${path.basename(workItem.fileEntry.absolutePath)} 读取失败：${message}`);
    }
    processedWorkItems += 1;
    reportImportProgress({
      stage: "读取输入文件",
      current: processedWorkItems,
      total: totalWorkItems,
      progressStart: 32,
      progressEnd: 54
    });
  }

  for (const workItem of uploadWorkItems) {
    try {
      const rawObjectPaths = await appendCheckpointedInputSources({
        userDataPath,
        batchId,
        workItem,
        sources,
        warnings,
        runtime,
        generatedAt,
        parse: () =>
          parseUploadedFile(workItem.uploadedFile, workItem.signature.index, {
            collectedAt: generatedAt,
            settings,
            userDataPath,
            batchId,
            runtime
          })
      });
      for (const rawObjectPath of rawObjectPaths) {
        protectedRawObjectPaths.add(rawObjectPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      const fallbackName = `upload-${workItem.signature.index + 1}`;
      warnings.push(`${workItem.uploadedFile.name || fallbackName} 读取失败：${message}`);
    }
    processedWorkItems += 1;
    reportImportProgress({
      stage: "读取输入文件",
      current: processedWorkItems,
      total: totalWorkItems,
      progressStart: 32,
      progressEnd: 54
    });
  }

  if (batchId) {
    await cleanupImportArtifacts({
      userDataPath,
      batchId,
      protectedRawObjectPaths,
      cleanupTemp: false
    });
  }

  if (sources.length === 0) {
    if (warnings.length > 0) {
      throw new Error(`没有可处理的内容。${warnings.join("；")}`);
    }

    throw new Error("没有可处理的内容。请粘贴文本或选择可解析的文件。");
  }

  const usableText = sources.some((source) => source.text);
  const usableImage = sources.some((source) => source.kind === "image");

  if (!usableText && !usableImage) {
    throw new Error("输入中没有可供智能体处理的文本或图片。");
  }

  return {
    sources,
    warnings
  };
}
