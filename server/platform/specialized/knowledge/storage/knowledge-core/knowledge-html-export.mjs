export const KNOWLEDGE_HTML_EXPORT_PACKAGE_TYPE = "agentstudio.knowledge.html-export";
export const KNOWLEDGE_HTML_EXPORT_CONTENT_TYPE = "text/html; charset=utf-8";

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

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtmlParagraphs(text) {
  const normalized = normalizeText(text);
  if (!normalized) return "";
  return normalized
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para.trim())}</p>`)
    .join("\n");
}

function sectionHeadingTag(level) {
  const n = Math.max(1, Math.min(6, Number(level || 1)));
  return `h${n + 2}`;
}

function suggestedFileName(filters = {}, generatedAt = new Date().toISOString()) {
  const scope = filters.documentId || filters.batchId || filters.sourceId || "all";
  const stamp = generatedAt.replace(/[^0-9a-z]+/gi, "").slice(0, 14);
  return `agentstudio-knowledge-${slug(scope)}-${stamp}.html`;
}

function buildDocumentHtml(doc, index) {
  const chunks = [];
  const title = escapeHtml(scalar(doc.title) || `知识文档 ${index + 1}`);
  chunks.push(`<section class="kc-document">`);
  chunks.push(`<h2>${title}</h2>`);

  const meta = [
    doc.documentId && `<li><strong>文档 ID</strong>: <code>${escapeHtml(doc.documentId)}</code></li>`,
    doc.batchId && `<li><strong>批次 ID</strong>: <code>${escapeHtml(doc.batchId)}</code></li>`,
    doc.sourceId && `<li><strong>来源 ID</strong>: <code>${escapeHtml(doc.sourceId)}</code></li>`,
    doc.sourcePath && `<li><strong>来源路径</strong>: <code>${escapeHtml(doc.sourcePath)}</code></li>`,
    doc.updatedAt && `<li><strong>更新时间</strong>: ${escapeHtml(doc.updatedAt)}</li>`
  ].filter(Boolean);
  if (meta.length) {
    chunks.push(`<ul class="kc-meta">${meta.join("")}</ul>`);
  }

  if (scalar(doc.summary)) {
    chunks.push(`<h3>摘要</h3>${textToHtmlParagraphs(doc.summary)}`);
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
    const tag = sectionHeadingTag(section.level);
    const sectionTitle = escapeHtml(scalar(section.title) || "未命名章节");
    chunks.push(`<${tag}>${sectionTitle}</${tag}>`);
    const sectionBlocks = blocksBySection.get(scalar(section.sectionId)) || [];
    for (const block of sectionBlocks) {
      const blockTitle = escapeHtml(scalar(block.title) || `${block.blockType || "block"} ${block.position || ""}`.trim());
      chunks.push(`<h5>${blockTitle}</h5>`);
      const text = normalizeText(block.text || block.snippet || "");
      if (text) chunks.push(textToHtmlParagraphs(text));
    }
  }

  const unsectioned = [
    ...(blocksBySection.get("__unsectioned__") || []),
    ...blocks.filter((b) => scalar(b.sectionId) && !renderedSectionIds.has(scalar(b.sectionId)))
  ];
  if (unsectioned.length > 0) {
    chunks.push("<h3>未归属章节知识块</h3>");
    for (const block of unsectioned) {
      const blockTitle = escapeHtml(scalar(block.title) || `${block.blockType || "block"} ${block.position || ""}`.trim());
      chunks.push(`<h4>${blockTitle}</h4>`);
      const text = normalizeText(block.text || block.snippet || "");
      if (text) chunks.push(textToHtmlParagraphs(text));
    }
  }

  if (assets.length > 0) {
    chunks.push("<h3>资产与多模态证据</h3>");
    for (const asset of assets) {
      const assetTitle = escapeHtml(scalar(asset.title) || scalar(asset.assetId) || "资产");
      chunks.push(`<h4>${assetTitle}</h4>`);
      const assetText = normalizeText([asset.caption, asset.ocrText, asset.text].filter(Boolean).join("\n\n"));
      if (assetText) chunks.push(textToHtmlParagraphs(assetText));
    }
  }

  chunks.push("</section>");
  return chunks.join("\n");
}

export function buildKnowledgeHtmlExport({
  documents = [],
  generatedAt = new Date().toISOString(),
  filters = {}
} = {}) {
  const docSections = documents.length === 0
    ? "<p><em>当前筛选条件下没有可导出的知识文档。</em></p>"
    : documents.map((doc, i) => buildDocumentHtml(doc, i)).join("\n<hr>\n");

  const filterMeta = [
    filters.documentId && `<li><strong>文档 ID</strong>: <code>${escapeHtml(filters.documentId)}</code></li>`,
    filters.batchId && `<li><strong>批次 ID</strong>: <code>${escapeHtml(filters.batchId)}</code></li>`,
    filters.sourceId && `<li><strong>来源 ID</strong>: <code>${escapeHtml(filters.sourceId)}</code></li>`
  ].filter(Boolean).join("");

  const html = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AgentStudio 知识库导出</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 2rem 1rem; color: #1a1a1a; }
    h1 { border-bottom: 2px solid #3b82f6; padding-bottom: 0.5rem; }
    h2 { border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem; margin-top: 2rem; }
    code { background: #f3f4f6; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
    .kc-meta { color: #6b7280; font-size: 0.9em; }
    .kc-document { margin-bottom: 2rem; }
    p { margin: 0.5em 0; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 2rem 0; }
    .kc-header { color: #6b7280; font-size: 0.875rem; margin-bottom: 2rem; }
  </style>
</head>
<body>
  <h1>AgentStudio 知识库导出</h1>
  <div class="kc-header">
    <ul>
      <li><strong>导出时间</strong>: ${escapeHtml(generatedAt)}</li>
      <li><strong>文档数量</strong>: ${documents.length}</li>
      ${filterMeta}
    </ul>
  </div>
  ${docSections}
</body>
</html>`;

  return {
    buffer: Buffer.from(html, "utf-8"),
    contentType: KNOWLEDGE_HTML_EXPORT_CONTENT_TYPE,
    fileName: suggestedFileName(filters, generatedAt)
  };
}
