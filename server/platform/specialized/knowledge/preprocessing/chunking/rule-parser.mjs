import path from "node:path";
import { parseStructuredMarkdown } from "./structured-markdown.mjs";

const CODE_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp"
]);

const DATA_EXTENSIONS = new Set([".json", ".yaml", ".yml", ".xml"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".mkdn", ".mdx"]);
const TABLE_EXTENSIONS = new Set([".csv", ".tsv"]);

function normalizeLine(value) {
  return value.replace(/\r/g, "").trimEnd();
}

function splitParagraphs(text) {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function sanitizeHeading(line) {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\d+(?:\.\d+){0,5}\s+/, "")
    .replace(/^[一二三四五六七八九十百千万零]+[、.]\s+/, "")
    .trim();
}

function detectHeading(line) {
  const trimmed = line.trim();

  if (/^#{1,6}\s+\S+/.test(trimmed)) {
    return {
      level: Math.min(trimmed.match(/^#+/)[0].length, 6),
      text: sanitizeHeading(trimmed)
    };
  }

  if (/^第[一二三四五六七八九十百千万零0-9]+[章节部分篇条]\s*\S*/.test(trimmed)) {
    return {
      level: 1,
      text: trimmed
    };
  }

  if (/^\d+(?:\.\d+){0,5}\s+\S+/.test(trimmed)) {
    const numericDepth = trimmed.match(/^\d+(?:\.\d+){0,5}/)?.[0].split(".").length || 1;
    return {
      level: Math.min(numericDepth, 6),
      text: sanitizeHeading(trimmed)
    };
  }

  if (/^[一二三四五六七八九十百千万零]+[、.]\s+\S+/.test(trimmed)) {
    return {
      level: 2,
      text: sanitizeHeading(trimmed)
    };
  }

  if (
    trimmed.length > 0 &&
    trimmed.length <= 32 &&
    !/[。！？.!?；;:：,，]$/.test(trimmed) &&
    !trimmed.includes("  ")
  ) {
    return {
      level: 3,
      text: trimmed
    };
  }

  return null;
}

function isListLine(line) {
  return /^(\s*[-*+]\s+|\s*\d+[.)]\s+|\s*[一二三四五六七八九十]+[、.]\s+)/.test(
    line
  );
}

function isTableLine(line, formatHint) {
  if (formatHint === "table") {
    return true;
  }

  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  return (
    (trimmed.includes("|") && trimmed.split("|").length >= 3) ||
    trimmed.split("\t").length >= 3
  );
}

function createBlock(source, index, kind, text, extra = {}) {
  return {
    id: `${source.id}::block-${index}`,
    sourceId: source.id,
    sourceName: source.name,
    kind,
    text: text.trim(),
    ...extra
  };
}

function detectFormat(source) {
  const extension = path.extname(source.name || "").toLowerCase();
  const mediaType = String(source.mediaType || source.rawObject?.mediaType || "").toLowerCase();

  if (
    MARKDOWN_EXTENSIONS.has(extension) ||
    mediaType === "text/markdown" ||
    mediaType === "text/x-markdown"
  ) {
    return "markdown";
  }

  if (CODE_EXTENSIONS.has(extension)) {
    return "code";
  }

  if (TABLE_EXTENSIONS.has(extension)) {
    return "table";
  }

  if (DATA_EXTENSIONS.has(extension)) {
    return "data";
  }

  return "text";
}

function parseCodeSource(source) {
  const lines = source.text.split("\n").map(normalizeLine);
  const blocks = [];
  let buffer = [];
  let blockIndex = 1;

  function flushBuffer() {
    const text = buffer.join("\n").trim();
    if (!text) {
      buffer = [];
      return;
    }

    blocks.push(createBlock(source, blockIndex, "code", text));
    blockIndex += 1;
    buffer = [];
  }

  for (const line of lines) {
    if (!line.trim()) {
      flushBuffer();
      continue;
    }

    if (
      buffer.length > 0 &&
      /^(export\s+)?(async\s+)?(function|class)\s+\w+|^(const|let|var)\s+\w+\s*=\s*(async\s*)?\(|^def\s+\w+\s*\(|^interface\s+\w+/.test(
        line.trim()
      )
    ) {
      flushBuffer();
    }

    buffer.push(line);
  }

  flushBuffer();
  return blocks;
}

function parseStructuredTextSource(source, formatHint) {
  const lines = source.text.split("\n").map(normalizeLine);
  const blocks = [];
  let buffer = [];
  let bufferKind = null;
  let blockIndex = 1;

  function flushBuffer() {
    const text = buffer.join(bufferKind === "list" ? "\n" : "\n").trim();
    if (!text || !bufferKind) {
      buffer = [];
      bufferKind = null;
      return;
    }

    blocks.push(createBlock(source, blockIndex, bufferKind, text));
    blockIndex += 1;
    buffer = [];
    bufferKind = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushBuffer();
      continue;
    }

    const heading = detectHeading(trimmed);
    if (heading && formatHint === "text") {
      flushBuffer();
      blocks.push(
        createBlock(source, blockIndex, "heading", heading.text, {
          level: heading.level
        })
      );
      blockIndex += 1;
      continue;
    }

    const nextKind = isTableLine(trimmed, formatHint)
      ? "table"
      : isListLine(trimmed)
        ? "list"
        : "paragraph";

    if (bufferKind && bufferKind !== nextKind) {
      flushBuffer();
    }

    bufferKind = nextKind;
    buffer.push(trimmed);
  }

  flushBuffer();
  return blocks;
}

function parseDataSource(source) {
  return splitParagraphs(source.text).map((part, index) =>
    createBlock(source, index + 1, "code", part)
  );
}

export function createRuleBasedParserAdapter() {
  return {
    name: "rule-based-parser",
    async parse(source) {
      if (source.kind === "image" || !source.text?.trim()) {
        return [];
      }

      const format = detectFormat(source);

      if (format === "markdown") {
        return parseStructuredMarkdown(source).blocks;
      }

      if (format === "code") {
        return parseCodeSource(source);
      }

      if (format === "data") {
        return parseDataSource(source);
      }

      return parseStructuredTextSource(source, format);
    }
  };
}
