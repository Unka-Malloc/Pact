export const KNOWLEDGE_MARKDOWN_EXPORT_PACKAGE_TYPE = "pact.knowledge.markdown-export";
export const KNOWLEDGE_MARKDOWN_EXPORT_CONTENT_TYPE = "text/markdown; charset=utf-8";

function scalar(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slug(value, fallback = "knowledge") {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function sortByPosition(items) {
  return [...(items || [])].sort((left, right) => {
    const leftPosition = Number(left?.position ?? Infinity);
    const rightPosition = Number(right?.position ?? Infinity);
    if (Number.isFinite(leftPosition) && Number.isFinite(rightPosition) && leftPosition !== rightPosition) {
      return leftPosition - rightPosition;
    }
    return scalar(left?.sectionId || left?.blockId || left?.assetId).localeCompare(
      scalar(right?.sectionId || right?.blockId || right?.assetId)
    );
  });
}

function escapeMarkdown(text) {
  return String(text || "").replace(/([\\`*_{}[\]()#+\-.!|])/g, "\\$1");
}

function sectionHeadingPrefix(level) {
  const n = Math.max(1, Math.min(6, Number(level || 1)));
  return "#".repeat(n + 2);
}

function suggestedFileName(filters = {}, generatedAt = new Date().toISOString()) {
  const scope = filters.documentId || filters.batchId || filters.sourceId || "all";
  const stamp = generatedAt.replace(/[^0-9a-z]+/gi, "").slice(0, 14);
  return `pact-knowledge-${slug(scope)}-${stamp}.md`;
}

function buildDocumentMarkdown(doc, index) {
  const lines = [];
  const title = scalar(doc.title) || `知识文档 ${index + 1}`;
  lines.push(`# ${title}`, "");

  const meta = [
    doc.documentId && `- **文档 ID**: \`${doc.documentId}\``,
    doc.batchId && `- **批次 ID**: \`${doc.batchId}\``,
    doc.sourceId && `- **来源 ID**: \`${doc.sourceId}\``,
    doc.sourcePath && `- **来源路径**: \`${doc.sourcePath}\``,
    doc.updatedAt && `- **更新时间**: ${doc.updatedAt}`
  ].filter(Boolean);
  if (meta.length) {
    lines.push(...meta, "");
  }

  if (scalar(doc.summary)) {
    lines.push("## 摘要", "", normalizeText(doc.summary), "");
  }

  const sections = sortByPosition(doc.sections);
  const blocks = sortByPosition(doc.blocks);
  const assets = sortByPosition(doc.assets);

  const blocksBySection = new Map();
  for (const block of blocks) {
    const key = scalar(block.sectionId) || "__unsectioned__";
    if (!blocksBySection.has(key)) blocksBySection.set(key, []);
    blocksBySection.get(key).push(block);
  }

  const renderedSectionIds = new Set();
  for (const section of sections) {
    renderedSectionIds.add(scalar(section.sectionId));
    const prefix = sectionHeadingPrefix(section.level);
    lines.push(`${prefix} ${scalar(section.title) || "未命名章节"}`, "");
    const sectionBlocks = blocksBySection.get(scalar(section.sectionId)) || [];
    for (const block of sectionBlocks) {
      const blockTitle = scalar(block.title) || `${block.blockType || "block"} ${block.position || ""}`.trim();
      lines.push(`#### ${blockTitle}`, "");
      const text = normalizeText(block.text || block.snippet || "");
      if (text) {
        lines.push(text, "");
      }
    }
  }

  const unsectioned = [
    ...(blocksBySection.get("__unsectioned__") || []),
    ...blocks.filter((b) => scalar(b.sectionId) && !renderedSectionIds.has(scalar(b.sectionId)))
  ];
  if (unsectioned.length > 0) {
    lines.push("## 未归属章节知识块", "");
    for (const block of unsectioned) {
      const blockTitle = scalar(block.title) || `${block.blockType || "block"} ${block.position || ""}`.trim();
      lines.push(`### ${blockTitle}`, "");
      const text = normalizeText(block.text || block.snippet || "");
      if (text) {
        lines.push(text, "");
      }
    }
  }

  if (assets.length > 0) {
    lines.push("## 资产与多模态证据", "");
    for (const asset of assets) {
      const assetTitle = scalar(asset.title) || scalar(asset.assetId) || "资产";
      lines.push(`### ${assetTitle}`, "");
      const assetText = normalizeText([asset.caption, asset.ocrText, asset.text].filter(Boolean).join("\n\n"));
      if (assetText) {
        lines.push(assetText, "");
      }
    }
  }

  return lines.join("\n");
}

export function buildKnowledgeMarkdownExport({
  documents = [],
  generatedAt = new Date().toISOString(),
  filters = {}
} = {}) {
  const lines = [];
  lines.push("# Pact 知识库导出", "");
  lines.push(`> 导出时间：${generatedAt}  `);
  lines.push(`> 文档数量：${documents.length}  `);
  if (filters.documentId) lines.push(`> 文档 ID：\`${escapeMarkdown(filters.documentId)}\`  `);
  if (filters.batchId) lines.push(`> 批次 ID：\`${escapeMarkdown(filters.batchId)}\`  `);
  if (filters.sourceId) lines.push(`> 来源 ID：\`${escapeMarkdown(filters.sourceId)}\`  `);
  lines.push("");

  if (documents.length === 0) {
    lines.push("*当前筛选条件下没有可导出的知识文档。*", "");
  } else {
    for (const [i, doc] of documents.entries()) {
      lines.push(buildDocumentMarkdown(doc, i));
      lines.push("---", "");
    }
  }

  const markdown = lines.join("\n");
  return {
    buffer: Buffer.from(markdown, "utf-8"),
    contentType: KNOWLEDGE_MARKDOWN_EXPORT_CONTENT_TYPE,
    fileName: suggestedFileName(filters, generatedAt)
  };
}
