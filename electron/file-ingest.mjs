import fs from "node:fs/promises";
import path from "node:path";
import mammothImport from "mammoth";
import pdfImport from "pdf-parse";
import { extractTextWithPaddleOcr } from "./ocr.mjs";
import {
  extractTextWithTika,
  isTikaBackedDocument,
  TIKA_IMPORT_EXTENSIONS
} from "./tika.mjs";

const mammoth = mammothImport.default || mammothImport;
const pdf = pdfImport.default || pdfImport;

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".htm",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".ini",
  ".log"
]);

const IMAGE_EXTENSIONS = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".bmp", "image/bmp"],
  [".tif", "image/tiff"],
  [".tiff", "image/tiff"]
]);

const STRUCTURED_EXTENSIONS = new Set(
  TIKA_IMPORT_EXTENSIONS.map((extension) => `.${extension}`)
);
const SUPPORTED_FILE_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ...IMAGE_EXTENSIONS.keys(),
  ...STRUCTURED_EXTENSIONS
]);

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function looksLikeText(buffer) {
  const sample = buffer.subarray(0, 2048);
  let suspicious = 0;

  for (const byte of sample) {
    if (byte === 0) {
      return false;
    }

    if (byte < 7 || (byte > 14 && byte < 32)) {
      suspicious += 1;
    }
  }

  return suspicious / Math.max(sample.length, 1) < 0.12;
}

function resolveImageMediaType(extension, mediaTypeHint) {
  if (mediaTypeHint?.startsWith("image/")) {
    return mediaTypeHint;
  }

  return IMAGE_EXTENSIONS.get(extension) || "";
}

async function readPdfBuffer(buffer) {
  const parsed = await pdf(buffer);
  return normalizeText(parsed.text || "");
}

async function readDocxBuffer(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return normalizeText(value || "");
}

function buildImagePayload(buffer, mediaType) {
  return {
    imageBuffer: buffer,
    imageDataUrl: `data:${mediaType};base64,${buffer.toString("base64")}`
  };
}

function buildOcrWarning(name, fileType, error) {
  const message = error instanceof Error ? error.message : "未知错误";

  if (fileType === "image") {
    return `${name} OCR 未完成：${message} 已保留原始图片。`;
  }

  return `${name} OCR 未完成：${message}`;
}

async function tryExtractWithOcr({
  buffer,
  filePath,
  name,
  fileType,
  settings,
  userDataPath
}) {
  if (settings.ocrEnabled === false) {
    return {
      text: "",
      warnings: [],
      attempted: false
    };
  }

  try {
    const result = await extractTextWithPaddleOcr({
      buffer,
      filePath,
      fileName: name || filePath,
      fileType,
      settings,
      userDataPath
    });

    return {
      text: normalizeText(result.text || ""),
      warnings: [],
      attempted: true
    };
  } catch (error) {
    return {
      text: "",
      warnings: [buildOcrWarning(name || filePath || "未命名文件", fileType, error)],
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
  userDataPath
}) {
  const extension = path.extname(name || filePath).toLowerCase();

  try {
    return await extractTextWithTika({
      buffer,
      filePath,
      fileName: name || filePath,
      settings,
      userDataPath
    });
  } catch (error) {
    if (error?.code === "TIKA_UNAVAILABLE") {
      if (extension === ".pdf" || mediaTypeHint === "application/pdf") {
        return readPdfBuffer(buffer);
      }

      if (
        extension === ".docx" ||
        mediaTypeHint ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        return readDocxBuffer(buffer);
      }
    }

    throw error;
  }
}

function readTextBuffer(buffer) {
  if (!looksLikeText(buffer)) {
    throw new Error("该文件不是可解析的文本文件");
  }

  return normalizeText(buffer.toString("utf8"));
}

async function parseImageInput({
  id,
  name,
  filePath,
  buffer,
  mediaType,
  settings,
  userDataPath
}) {
  const ocrResult = await tryExtractWithOcr({
    buffer,
    filePath,
    name,
    fileType: "image",
    settings,
    userDataPath
  });

  return {
    id,
    name,
    path: filePath,
    kind: "image",
    text: ocrResult.text,
    mediaType,
    warnings: ocrResult.warnings,
    ocrAttempted: ocrResult.attempted,
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
  settings,
  userDataPath
}) {
  const kind =
    extension === ".pdf" ? "pdf" : extension === ".docx" ? "docx" : "document";
  const warnings = [];
  let ocrAttempted = false;
  let text = await readStructuredBuffer({
    buffer,
    filePath,
    name,
    mediaTypeHint,
    settings,
    userDataPath
  });

  if (!text && kind === "pdf") {
    const ocrResult = await tryExtractWithOcr({
      buffer,
      filePath,
      name,
      fileType: "pdf",
      settings,
      userDataPath
    });

    text = ocrResult.text;
    warnings.push(...ocrResult.warnings);
    ocrAttempted = ocrResult.attempted;
  }

  return {
    id,
    name,
    path: filePath,
    kind,
    text,
    warnings,
    ocrAttempted
  };
}

async function parseBufferInput({
  id,
  name,
  filePath = "",
  buffer,
  mediaTypeHint = "",
  settings,
  userDataPath
}) {
  const extension = path.extname(name || filePath).toLowerCase();
  const mediaType = resolveImageMediaType(extension, mediaTypeHint);

  if (mediaType) {
    return parseImageInput({
      id,
      name,
      filePath,
      buffer,
      mediaType,
      settings,
      userDataPath
    });
  }

  if (TEXT_EXTENSIONS.has(extension) || mediaTypeHint?.startsWith("text/")) {
    return {
      id,
      name,
      path: filePath,
      kind: "text",
      text: readTextBuffer(buffer),
      warnings: []
    };
  }

  if (isTikaBackedDocument({ extension, mediaTypeHint })) {
    return parseStructuredInput({
      id,
      name,
      filePath,
      buffer,
      extension,
      mediaTypeHint,
      settings,
      userDataPath
    });
  }

  if (!looksLikeText(buffer)) {
    throw new Error("暂不支持这种文件类型");
  }

  return {
    id,
    name,
    path: filePath,
    kind: "text",
    text: normalizeText(buffer.toString("utf8")),
    warnings: []
  };
}

async function parseFilePath(filePath, options = {}) {
  const buffer = await fs.readFile(filePath);
  const name = path.basename(filePath);

  return parseBufferInput({
    id: filePath,
    name,
    filePath,
    buffer,
    ...options
  });
}

async function parseUploadedFile(uploadedFile, index, options) {
  const buffer = Buffer.from(uploadedFile.dataBase64, "base64");
  const relativePath = uploadedFile.relativePath || "";
  const name = relativePath || uploadedFile.name || `upload-${index + 1}`;

  return parseBufferInput({
    id: relativePath || `upload-${index + 1}`,
    name,
    filePath: relativePath,
    buffer,
    mediaTypeHint: uploadedFile.mediaType || "",
    ...options
  });
}

function isSupportedImportPath(filePath) {
  return SUPPORTED_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function buildEmptyContentWarning(parsed) {
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

async function collectSupportedFilesFromDirectory(directoryPath, collector, visitedDirectories) {
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
      await collectSupportedFilesFromDirectory(entryPath, collector, visitedDirectories);
      continue;
    }

    if (!directoryEntry.isFile()) {
      continue;
    }

    if (isSupportedImportPath(entryPath)) {
      collector.push(entryPath);
    }
  }
}

async function expandInputFilePaths(filePaths) {
  const expandedFilePaths = [];
  const warnings = [];
  const visitedDirectories = new Set();

  for (const inputPath of filePaths) {
    try {
      const stats = await fs.stat(inputPath);

      if (stats.isDirectory()) {
        const filesBefore = expandedFilePaths.length;
        await collectSupportedFilesFromDirectory(
          inputPath,
          expandedFilePaths,
          visitedDirectories
        );

        if (expandedFilePaths.length === filesBefore) {
          warnings.push(`${path.basename(inputPath)} 中没有可解析的文件，已跳过。`);
        }

        continue;
      }

      expandedFilePaths.push(inputPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      warnings.push(`${path.basename(inputPath)} 读取失败：${message}`);
    }
  }

  return {
    filePaths: expandedFilePaths,
    warnings
  };
}

export async function readInputSources({
  inputText,
  filePaths = [],
  uploadedFiles = [],
  settings,
  userDataPath
}) {
  const sources = [];
  const warnings = [];
  const expanded = await expandInputFilePaths(filePaths);
  warnings.push(...expanded.warnings);

  if (inputText && inputText.trim()) {
    sources.push({
      id: "pasted-text",
      name: "粘贴文本",
      path: "",
      kind: "text",
      text: normalizeText(inputText)
    });
  }

  for (const filePath of expanded.filePaths) {
    try {
      const parsed = await parseFilePath(filePath, {
        settings,
        userDataPath
      });
      warnings.push(...(parsed.warnings || []));

      if (parsed.kind === "image" || parsed.text) {
        sources.push(parsed);
      } else {
        warnings.push(buildEmptyContentWarning(parsed));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      warnings.push(`${path.basename(filePath)} 读取失败：${message}`);
    }
  }

  for (const [index, uploadedFile] of uploadedFiles.entries()) {
    try {
      const parsed = await parseUploadedFile(uploadedFile, index, {
        settings,
        userDataPath
      });
      warnings.push(...(parsed.warnings || []));

      if (parsed.kind === "image" || parsed.text) {
        sources.push(parsed);
      } else {
        warnings.push(buildEmptyContentWarning(parsed));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      warnings.push(`${uploadedFile.name || `upload-${index + 1}`} 读取失败：${message}`);
    }
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
