export const MARKDOWN_CHUNKING_STRATEGY = "markdown-section-v1";

export const DEFAULT_MARKDOWN_CHUNK_OPTIONS = Object.freeze({
  sectionLevel: 2,
  maxTokens: 800,
  maxChars: 3600,
  overlapTokens: 0,
});

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^\s*(```+|~~~+)/;

function scalar(value) {
  return String(value ?? "");
}

function cleanText(value) {
  return scalar(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function cleanHeadingText(value) {
  return scalar(value)
    .replace(/\s+#+\s*$/, "")
    .replace(/\[[^\]]*\]\(([^)]*)\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim();
}

function stableIdPart(value) {
  return scalar(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function estimateMarkdownTokenCount(text) {
  let ascii = 0;
  let nonAscii = 0;

  for (const char of scalar(text)) {
    if (char.charCodeAt(0) <= 127) {
      ascii += 1;
    } else {
      nonAscii += 1;
    }
  }

  return Math.max(1, Math.ceil(ascii / 4 + nonAscii * 0.75));
}

export function detectMarkdownHeading(line) {
  const match = scalar(line).trimEnd().match(HEADING_RE);
  if (!match) {
    return null;
  }
  return {
    level: Math.min(match[1].length, 6),
    text: cleanHeadingText(match[2]),
  };
}

function blockId(sourceId, blockIndex) {
  return `${sourceId || "source"}::block-${blockIndex}`;
}

function sectionId(sourceId, sectionIndex, titlePath) {
  const slug = stableIdPart(titlePath[titlePath.length - 1] || "root") || "root";
  return `${sourceId || "source"}::section-${sectionIndex}-${slug}`;
}

function isListStart(line) {
  return /^(\s{0,3}[-*+]\s+|\s{0,3}\d+[.)]\s+|\s{0,3}[一二三四五六七八九十百千万零]+[、.]\s+)/.test(line);
}

function isTableLine(line) {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes("|")) {
    return false;
  }
  return trimmed.split("|").length >= 3;
}

function classifyLine(line) {
  if (isTableLine(line)) {
    return "table";
  }
  if (isListStart(line)) {
    return "list";
  }
  return "paragraph";
}

function deriveChunkType(blocks) {
  const contentBlocks = blocks.filter((block) => block.kind !== "heading");
  if (contentBlocks.length === 0) {
    return "section";
  }
  if (contentBlocks.every((block) => block.kind === "code")) {
    return "code";
  }
  if (contentBlocks.every((block) => block.kind === "table")) {
    return "table";
  }
  if (contentBlocks.every((block) => block.kind === "list")) {
    return "list";
  }
  return "section";
}

function normalizeOptions(options = {}) {
  const sectionLevel = Math.max(1, Math.min(6, Number(options.sectionLevel || DEFAULT_MARKDOWN_CHUNK_OPTIONS.sectionLevel)));
  const maxTokens = Math.max(80, Number(options.maxTokens || DEFAULT_MARKDOWN_CHUNK_OPTIONS.maxTokens));
  const maxChars = Math.max(320, Number(options.maxChars || DEFAULT_MARKDOWN_CHUNK_OPTIONS.maxChars));
  const overlapTokens = Math.max(0, Number(options.overlapTokens ?? DEFAULT_MARKDOWN_CHUNK_OPTIONS.overlapTokens));
  return {
    sectionLevel,
    maxTokens,
    maxChars,
    overlapTokens,
  };
}

function createSection(source, sectionIndex, titlePath, level, startLine) {
  const sourceId = scalar(source.id || "source");
  const path = titlePath.filter(Boolean);
  return {
    id: sectionId(sourceId, sectionIndex, path),
    sourceId,
    sourceName: scalar(source.name || source.path || sourceId),
    index: sectionIndex,
    title: path[path.length - 1] || "文档前言",
    titlePath: path,
    headingPath: path,
    level: Math.max(0, Number(level) || 0),
    sourceStartLine: Math.max(1, Number(startLine) || 1),
    sourceEndLine: Math.max(1, Number(startLine) || 1),
    blocks: [],
  };
}

export function parseStructuredMarkdown(source = {}, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  const text = cleanText(source.text);
  const lines = text.split("\n");
  const sections = [];
  const blocks = [];
  const sourceId = scalar(source.id || "source");
  const sourceName = scalar(source.name || source.path || sourceId);
  const headingStack = [];

  let sectionIndex = 1;
  let blockIndex = 1;
  let currentSection = createSection(source, sectionIndex, [], 0, 1);
  let pendingLines = [];
  let pendingKind = "";
  let pendingStartLine = 1;
  let fenceMarker = "";

  function currentHeadingPath() {
    return headingStack.filter(Boolean);
  }

  function pushCurrentSection(force = false) {
    if (!currentSection.blocks.length && !force) {
      return;
    }
    const lastBlock = currentSection.blocks[currentSection.blocks.length - 1];
    if (lastBlock) {
      currentSection.sourceEndLine = lastBlock.sourceEndLine;
    }
    sections.push({
      ...currentSection,
      tokenCount: estimateMarkdownTokenCount(currentSection.blocks.map((block) => block.text).join("\n\n")),
    });
  }

  function startSection(titlePath, level, startLine) {
    pushCurrentSection(false);
    sectionIndex += currentSection.blocks.length ? 1 : 0;
    currentSection = createSection(source, sectionIndex, titlePath, level, startLine);
  }

  function pushBlock(kind, rawLines, startLine, endLine, metadata = {}) {
    const blockText = rawLines.join("\n").trim();
    if (!blockText) {
      return;
    }
    const headingPath = currentHeadingPath();
    const block = {
      id: blockId(sourceId, blockIndex),
      sourceId,
      sourceName,
      kind,
      text: blockText,
      level: Number(metadata.level || 0),
      sourceStartLine: startLine,
      sourceEndLine: endLine,
      titlePath: headingPath,
      headingPath,
      sectionId: currentSection.id,
      sectionTitle: currentSection.title,
      sectionLevel: currentSection.level,
      metadata: {
        ...metadata,
        strategy: MARKDOWN_CHUNKING_STRATEGY,
        sectionId: currentSection.id,
        sectionTitle: currentSection.title,
        sectionLevel: currentSection.level,
        sectionRange: {
          startLine: currentSection.sourceStartLine,
          endLine: Math.max(currentSection.sourceEndLine, endLine),
        },
        sourceRange: {
          startLine,
          endLine,
        },
        headingPath,
      },
    };
    blockIndex += 1;
    currentSection.blocks.push(block);
    currentSection.sourceEndLine = endLine;
    blocks.push(block);
  }

  function flushPending() {
    if (!pendingLines.length || !pendingKind) {
      pendingLines = [];
      pendingKind = "";
      return;
    }
    pushBlock(pendingKind, pendingLines, pendingStartLine, pendingStartLine + pendingLines.length - 1);
    pendingLines = [];
    pendingKind = "";
  }

  function addLine(kind, line, lineNumber) {
    if (!pendingKind) {
      pendingKind = kind;
      pendingStartLine = lineNumber;
      pendingLines = [line];
      return;
    }
    if (pendingKind !== kind) {
      flushPending();
      pendingKind = kind;
      pendingStartLine = lineNumber;
      pendingLines = [line];
      return;
    }
    pendingLines.push(line);
  }

  lines.forEach((line, offset) => {
    const lineNumber = offset + 1;
    const trimmed = line.trimEnd();

    if (fenceMarker) {
      pendingLines.push(trimmed);
      if (trimmed.trim().startsWith(fenceMarker)) {
        pushBlock("code", pendingLines, pendingStartLine, lineNumber, { fenced: true });
        pendingLines = [];
        pendingKind = "";
        fenceMarker = "";
      }
      return;
    }

    const fence = trimmed.match(FENCE_RE);
    if (fence) {
      flushPending();
      fenceMarker = fence[1][0] === "`" ? "```" : "~~~";
      pendingKind = "code";
      pendingStartLine = lineNumber;
      pendingLines = [trimmed];
      return;
    }

    const heading = detectMarkdownHeading(trimmed);
    if (heading) {
      flushPending();
      headingStack[heading.level - 1] = heading.text;
      headingStack.length = heading.level;
      const path = currentHeadingPath();
      if (heading.level <= normalizedOptions.sectionLevel) {
        startSection(path, heading.level, lineNumber);
      }
      pushBlock("heading", [trimmed], lineNumber, lineNumber, {
        level: heading.level,
        title: heading.text,
        headingPath: path,
      });
      return;
    }

    if (!trimmed.trim()) {
      flushPending();
      return;
    }

    const nextKind = classifyLine(trimmed);
    addLine(nextKind, trimmed, lineNumber);
  });

  if (fenceMarker && pendingLines.length) {
    pushBlock("code", pendingLines, pendingStartLine, pendingStartLine + pendingLines.length - 1, {
      fenced: true,
      unclosed: true,
    });
    pendingLines = [];
    pendingKind = "";
    fenceMarker = "";
  }
  flushPending();
  pushCurrentSection(false);

  return {
    strategy: MARKDOWN_CHUNKING_STRATEGY,
    sourceId,
    sourceName,
    blocks,
    sections,
  };
}

function splitPlainTextBlock(block, options) {
  const maxTokens = Math.max(1, Number(options.maxTokens));
  const hardMaxChars = Math.max(160, Number(options.maxChars));
  const parts = scalar(block.text)
    .split(/(?<=[。！？.!?；;])\s+|\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const units = parts.length > 1 ? parts : scalar(block.text).match(/[\s\S]{1,360}/g) || [scalar(block.text)];
  const output = [];
  let current = "";

  for (const unit of units) {
    const proposal = current ? `${current}\n${unit}` : unit;
    if ((estimateMarkdownTokenCount(proposal) > maxTokens || proposal.length > hardMaxChars) && current) {
      output.push(current);
      current = unit;
      continue;
    }
    if (estimateMarkdownTokenCount(proposal) > maxTokens || proposal.length > hardMaxChars) {
      output.push(unit);
      current = "";
      continue;
    }
    current = proposal;
  }
  if (current) {
    output.push(current);
  }

  return output.map((part, index) => ({
    ...block,
    id: `${block.id}::part-${index + 1}`,
    text: part,
    kind: block.kind,
    metadata: {
      ...block.metadata,
      splitPart: index + 1,
      splitReason: "oversized-block",
    },
  }));
}

function splitLinePreservingBlock(block, options) {
  const lines = scalar(block.text).split("\n");
  const output = [];
  let current = [];

  function flush() {
    if (!current.length) {
      return;
    }
    output.push(current.join("\n"));
    current = [];
  }

  for (const line of lines) {
    const proposal = [...current, line].join("\n");
    if (current.length && (estimateMarkdownTokenCount(proposal) > options.maxTokens || proposal.length > options.maxChars)) {
      flush();
    }
    current.push(line);
  }
  flush();

  return output.map((part, index) => ({
    ...block,
    id: `${block.id}::part-${index + 1}`,
    text: part,
    metadata: {
      ...block.metadata,
      splitPart: index + 1,
      splitReason: "oversized-structured-block",
    },
  }));
}

function splitOversizedBlock(block, options) {
  if (block.kind === "code" || block.kind === "table" || block.kind === "list") {
    return splitLinePreservingBlock(block, options);
  }
  return splitPlainTextBlock(block, options);
}

function sourceRangeForBlocks(blocks) {
  return {
    startLine: Math.min(...blocks.map((block) => Number(block.sourceStartLine || 1))),
    endLine: Math.max(...blocks.map((block) => Number(block.sourceEndLine || 1))),
  };
}

function buildChunk(source, section, chunkIndex, blocks, options = {}) {
  const content = blocks.map((block) => block.text).join("\n\n").trim();
  const range = sourceRangeForBlocks(blocks);
  const overlapTokenCount = Math.max(0, Number(options.overlapTokenCount || 0));
  const blockKinds = [...new Set(blocks.map((block) => block.kind))];
  return {
    id: `${section.id}::chunk-${chunkIndex}`,
    sourceId: section.sourceId,
    sourceName: section.sourceName,
    sourceCreatedAt: scalar(source.sourceCreatedAt),
    sourceUpdatedAt: scalar(source.sourceUpdatedAt),
    sourceCollectedAt: scalar(source.sourceCollectedAt),
    title: section.title,
    titlePath: section.titlePath,
    headingPath: section.headingPath,
    sectionId: section.id,
    sectionTitle: section.title,
    sectionLevel: section.level,
    blockIds: blocks.map((block) => block.id),
    chunkType: deriveChunkType(blocks),
    content,
    tokenCount: estimateMarkdownTokenCount(content),
    charCount: content.length,
    overlapTokenCount,
    sourceRange: range,
    sourceStartLine: range.startLine,
    sourceEndLine: range.endLine,
    metadata: {
      strategy: MARKDOWN_CHUNKING_STRATEGY,
      preservesSectionBoundary: true,
      overlapScope: "section",
      sectionId: section.id,
      sectionTitle: section.title,
      sectionLevel: section.level,
      sectionRange: {
        startLine: section.sourceStartLine,
        endLine: section.sourceEndLine,
      },
      headingPath: section.headingPath,
      sourceRange: range,
      blockKinds,
      splitReason: options.splitReason || "",
    },
  };
}

function blockFits(blocks, options) {
  const text = blocks.map((block) => block.text).join("\n\n");
  return estimateMarkdownTokenCount(text) <= options.maxTokens && text.length <= options.maxChars;
}

function overlapBlocksFrom(blocks, overlapTokens) {
  if (!overlapTokens || overlapTokens <= 0) {
    return [];
  }
  const output = [];
  let total = 0;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block.kind === "heading") {
      continue;
    }
    const tokens = estimateMarkdownTokenCount(block.text);
    if (output.length && total + tokens > overlapTokens) {
      break;
    }
    output.unshift({
      ...block,
      metadata: {
        ...block.metadata,
        overlapFromPrevious: true,
      },
    });
    total += tokens;
    if (total >= overlapTokens) {
      break;
    }
  }
  return output;
}

export function chunkStructuredMarkdown(source = {}, options = {}) {
  const normalizedOptions = normalizeOptions(options);
  const parsed = parseStructuredMarkdown(source, normalizedOptions);
  return chunkStructuredMarkdownSections(source, parsed.sections, normalizedOptions);
}

export function chunkStructuredMarkdownSections(source = {}, sections = [], options = {}) {
  const normalizedOptions = normalizeOptions(options);
  const chunks = [];

  for (const section of sections) {
    if (!section.blocks.some((block) => block.kind !== "heading")) {
      continue;
    }
    let currentBlocks = [];
    let chunkIndexInSection = 1;

    function flushCurrent(splitReason = "") {
      if (!currentBlocks.length) {
        return;
      }
      const overlapTokenCount = chunkIndexInSection === 1 ? 0 : estimateMarkdownTokenCount(
        currentBlocks
          .filter((block) => block.metadata?.overlapFromPrevious)
          .map((block) => block.text)
          .join("\n\n"),
      );
      chunks.push(buildChunk(source, section, chunkIndexInSection, currentBlocks, {
        splitReason,
        overlapTokenCount,
      }));
      chunkIndexInSection += 1;
      currentBlocks = overlapBlocksFrom(currentBlocks, normalizedOptions.overlapTokens);
    }

    for (const block of section.blocks) {
      const blockTokens = estimateMarkdownTokenCount(block.text);
      if (blockTokens > normalizedOptions.maxTokens || block.text.length > normalizedOptions.maxChars) {
        flushCurrent("before-oversized-block");
        for (const part of splitOversizedBlock(block, normalizedOptions)) {
          if (currentBlocks.length && !blockFits([...currentBlocks, part], normalizedOptions)) {
            flushCurrent("oversized-block-part");
          }
          currentBlocks.push(part);
          if (!blockFits(currentBlocks, normalizedOptions)) {
            flushCurrent("oversized-block-part");
          }
        }
        continue;
      }

      if (currentBlocks.length && !blockFits([...currentBlocks, block], normalizedOptions)) {
        flushCurrent("max-size");
      }
      currentBlocks.push(block);
    }

    flushCurrent("");
  }

  return chunks;
}

export function chunkMarkdownText({
  text = "",
  source = {},
  options = {},
} = {}) {
  const normalizedSource = {
    id: source.id || "markdown-preview",
    name: source.name || "document.md",
    path: source.path || source.name || "document.md",
    text,
    mediaType: source.mediaType || "text/markdown",
    sourceCreatedAt: source.sourceCreatedAt || "",
    sourceUpdatedAt: source.sourceUpdatedAt || "",
    sourceCollectedAt: source.sourceCollectedAt || "",
  };
  const normalizedOptions = normalizeOptions(options);
  const parsed = parseStructuredMarkdown(normalizedSource, normalizedOptions);
  const chunks = chunkStructuredMarkdownSections(normalizedSource, parsed.sections, normalizedOptions);
  return {
    strategy: MARKDOWN_CHUNKING_STRATEGY,
    source: normalizedSource,
    blocks: parsed.blocks,
    sections: parsed.sections,
    chunks,
  };
}
