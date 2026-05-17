import {
  chunkStructuredMarkdownSections,
  estimateMarkdownTokenCount,
  MARKDOWN_CHUNKING_STRATEGY
} from "./structured-markdown.mjs";

function estimateTokenCount(text) {
  return estimateMarkdownTokenCount(text);
}

function splitTextForLimit(text, maxChars) {
  const segments = text
    .split(/(?<=[。！？.!?；;])\s+|\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    const chunks = [];
    for (let offset = 0; offset < text.length; offset += maxChars) {
      chunks.push(text.slice(offset, offset + maxChars));
    }
    return chunks;
  }

  const output = [];
  let current = "";

  for (const segment of segments) {
    const proposal = current ? `${current}\n${segment}` : segment;
    if (proposal.length > maxChars && current) {
      output.push(current);
      current = segment;
      continue;
    }

    if (proposal.length > maxChars) {
      output.push(...splitTextForLimit(segment, maxChars));
      current = "";
      continue;
    }

    current = proposal;
  }

  if (current) {
    output.push(current);
  }

  return output;
}

function normalizeTitle(text) {
  const firstLine = text.split("\n").find((line) => line.trim()) || "";
  return firstLine.trim().slice(0, 48) || "未命名知识块";
}

function deriveChunkType(blocks) {
  if (blocks.every((block) => block.kind === "code")) {
    return "code";
  }

  if (blocks.every((block) => block.kind === "table")) {
    return "table";
  }

  if (blocks.every((block) => block.kind === "list")) {
    return "list";
  }

  return "section";
}

function buildChunk(source, index, titlePath, blocks) {
  const content = blocks.map((block) => block.text).join("\n\n").trim();
  const normalizedTitlePath = titlePath.filter(Boolean);

  return {
    id: `${source.id}::chunk-${index}`,
    sourceId: source.id,
    sourceName: source.name,
    sourceCreatedAt: source.sourceCreatedAt || "",
    sourceUpdatedAt: source.sourceUpdatedAt || "",
    sourceCollectedAt: source.sourceCollectedAt || "",
    titlePath: normalizedTitlePath,
    blockIds: blocks.map((block) => block.id),
    chunkType: deriveChunkType(blocks),
    content,
    tokenCount: estimateTokenCount(content),
    title:
      normalizedTitlePath[normalizedTitlePath.length - 1] ||
      normalizeTitle(content)
  };
}

function splitOversizedBlock(source, block, titlePath, maxChars, chunkIndexStart) {
  const segments = splitTextForLimit(block.text, maxChars);
  return segments.map((segment, offset) =>
    buildChunk(source, chunkIndexStart + offset, titlePath, [
      {
        ...block,
        id: `${block.id}::part-${offset + 1}`,
        text: segment
      }
    ])
  );
}

function isMarkdownBlock(block = {}) {
  return (
    block.metadata?.strategy === MARKDOWN_CHUNKING_STRATEGY ||
    Boolean(block.sectionId || block.metadata?.sectionId)
  );
}

function sectionsFromMarkdownBlocks(source, blocks) {
  const sections = [];
  const sectionMap = new Map();

  for (const block of blocks) {
    const sectionId = block.sectionId || block.metadata?.sectionId;
    if (!sectionId) {
      continue;
    }

    if (!sectionMap.has(sectionId)) {
      const headingPath = Array.isArray(block.headingPath)
        ? block.headingPath
        : Array.isArray(block.metadata?.headingPath)
          ? block.metadata.headingPath
          : Array.isArray(block.titlePath)
            ? block.titlePath
            : [];
      const sourceRange = block.metadata?.sectionRange || block.metadata?.sourceRange || {};
      const section = {
        id: sectionId,
        sourceId: source.id,
        sourceName: source.name,
        index: sections.length + 1,
        title: block.sectionTitle || block.metadata?.sectionTitle || headingPath[headingPath.length - 1] || "文档前言",
        titlePath: headingPath.filter(Boolean),
        headingPath: headingPath.filter(Boolean),
        level: Number(block.sectionLevel || block.metadata?.sectionLevel || 0),
        sourceStartLine: Number(sourceRange.startLine || block.sourceStartLine || 1),
        sourceEndLine: Number(sourceRange.endLine || block.sourceEndLine || 1),
        blocks: [],
      };
      sectionMap.set(sectionId, section);
      sections.push(section);
    }

    const section = sectionMap.get(sectionId);
    section.blocks.push(block);
    section.sourceStartLine = Math.min(section.sourceStartLine, Number(block.sourceStartLine || section.sourceStartLine));
    section.sourceEndLine = Math.max(section.sourceEndLine, Number(block.sourceEndLine || section.sourceEndLine));
  }

  return sections;
}

export function createRuleBasedChunkerAdapter(options = {}) {
  const chunkOptions = {
    maxChars: 1200,
    maxTokens: 800,
    ...options
  };

  return {
    name: "rule-based-chunker",
    async chunk(source, blocks) {
      if (blocks.some(isMarkdownBlock)) {
        return chunkStructuredMarkdownSections(source, sectionsFromMarkdownBlocks(source, blocks), chunkOptions);
      }

      const chunks = [];
      let currentBlocks = [];
      let currentLength = 0;
      let titlePath = [];
      let chunkIndex = 1;

      function flushCurrent() {
        if (currentBlocks.length === 0) {
          return;
        }

        chunks.push(buildChunk(source, chunkIndex, titlePath, currentBlocks));
        chunkIndex += 1;
        currentBlocks = [];
        currentLength = 0;
      }

      for (const block of blocks) {
        if (block.kind === "heading") {
          flushCurrent();

          const nextLevel = Math.max(1, Math.min(block.level || 1, 6));
          titlePath = [...titlePath.slice(0, nextLevel - 1), block.text];
          continue;
        }

        const nextBlockLength = block.text.length;
        const nextBlockTokens = estimateTokenCount(block.text);

        if (
          nextBlockLength > chunkOptions.maxChars ||
          nextBlockTokens > chunkOptions.maxTokens
        ) {
          flushCurrent();
          const oversizedChunks = splitOversizedBlock(
            source,
            block,
            titlePath,
            chunkOptions.maxChars,
            chunkIndex
          );
          chunks.push(...oversizedChunks);
          chunkIndex += oversizedChunks.length;
          continue;
        }

        if (
          currentBlocks.length > 0 &&
          (currentLength + nextBlockLength > chunkOptions.maxChars ||
            estimateTokenCount(
              currentBlocks.map((item) => item.text).join("\n\n") + "\n\n" + block.text
            ) > chunkOptions.maxTokens)
        ) {
          flushCurrent();
        }

        currentBlocks.push(block);
        currentLength += nextBlockLength;
      }

      flushCurrent();
      return chunks;
    }
  };
}
