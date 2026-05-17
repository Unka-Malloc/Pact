import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";

export const KNOWLEDGE_DOCX_EXPORT_PACKAGE_TYPE = "splitall.knowledge.docx-export";
export const KNOWLEDGE_DOCX_EXPORT_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const MAX_PARAGRAPH_CHARS = 6000;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

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

function stableJson(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "object") {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function slug(value, fallback = "knowledge") {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function paragraph(text, spacingAfter = 120) {
  return new Paragraph({
    spacing: { after: spacingAfter },
    children: [new TextRun(String(text || ""))]
  });
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: 180, after: 120 },
    children: [new TextRun(String(text || "未命名章节"))]
  });
}

function paragraphChunks(text) {
  const value = String(text || "");
  if (value.length <= MAX_PARAGRAPH_CHARS) {
    return [value];
  }
  const chunks = [];
  for (let index = 0; index < value.length; index += MAX_PARAGRAPH_CHARS) {
    chunks.push(value.slice(index, index + MAX_PARAGRAPH_CHARS));
  }
  return chunks;
}

function bodyParagraphs(text, emptyText = "未记录正文。") {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [paragraph(emptyText)];
  }
  return normalized
    .split(/\n{2,}/)
    .flatMap((block) => paragraphChunks(block.trim()).map((item) => paragraph(item, 140)))
    .filter(Boolean);
}

function metadataValue(value) {
  if (Array.isArray(value)) {
    return value.map(metadataValue).filter(Boolean).join("; ");
  }
  if (value && typeof value === "object") {
    return stableJson(value);
  }
  return scalar(value);
}

function metadataTable(metadata = {}) {
  const rows = Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && metadataValue(value) !== "")
    .map(([key, value]) =>
      new TableRow({
        children: [
          new TableCell({ children: [paragraph(key, 80)] }),
          new TableCell({ children: [paragraph(metadataValue(value), 80)] })
        ]
      })
    );

  if (rows.length === 0) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({ children: [paragraph("metadata", 80)] }),
          new TableCell({ children: [paragraph("未记录", 80)] })
        ]
      })
    );
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows
  });
}

function sourceLocatorFor(entity = {}) {
  const metadata = entity.metadata || {};
  const locator = entity.sourceLocator || {};
  return (
    entity.sourceRange ||
    locator.sourceRange ||
    metadata.sourceRange ||
    metadata.sourceLocator ||
    locator ||
    {}
  );
}

function documentMetadata(document = {}) {
  return {
    documentId: document.documentId,
    collectionId: document.collectionId,
    batchId: document.batchId,
    sourceId: document.sourceId,
    documentType: document.documentType || document.itemType,
    sourcePath: document.sourcePath,
    sourceHash: document.sourceHash,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    metadata: document.metadata
  };
}

function sectionMetadata(section = {}) {
  return {
    sectionId: section.sectionId,
    level: section.level,
    position: section.position,
    sourceRange: sourceLocatorFor(section),
    metadata: section.metadata
  };
}

function blockMetadata(block = {}) {
  return {
    blockId: block.blockId,
    blockType: block.blockType,
    position: block.position,
    sourceLocator: sourceLocatorFor(block),
    metadata: block.metadata
  };
}

function assetMetadata(asset = {}) {
  return {
    assetId: asset.assetId,
    assetType: asset.assetType,
    mediaType: asset.mediaType,
    title: asset.title,
    relativePath: asset.relativePath,
    sha256: asset.sha256,
    byteSize: asset.byteSize,
    sourceLocator: sourceLocatorFor(asset),
    metadata: asset.metadata
  };
}

function sortByPosition(items = []) {
  return [...asArray(items)].sort((left, right) => {
    const leftPosition = Number(left?.position || 0);
    const rightPosition = Number(right?.position || 0);
    if (leftPosition !== rightPosition) {
      return leftPosition - rightPosition;
    }
    return scalar(left?.sectionId || left?.blockId || left?.assetId).localeCompare(
      scalar(right?.sectionId || right?.blockId || right?.assetId)
    );
  });
}

function sectionHeadingLevel(level) {
  const numericLevel = Number(level || 1);
  if (numericLevel <= 1) return HeadingLevel.HEADING_2;
  if (numericLevel === 2) return HeadingLevel.HEADING_3;
  return HeadingLevel.HEADING_4;
}

function compactDocumentForAppendix(document = {}) {
  return {
    documentId: document.documentId,
    title: document.title,
    collectionId: document.collectionId,
    batchId: document.batchId,
    sourceId: document.sourceId,
    sourcePath: document.sourcePath,
    sections: sortByPosition(document.sections).map((section) => ({
      sectionId: section.sectionId,
      title: section.title,
      position: section.position
    })),
    blocks: sortByPosition(document.blocks).map((block) => ({
      blockId: block.blockId,
      sectionId: block.sectionId,
      title: block.title,
      blockType: block.blockType,
      sourceLocator: sourceLocatorFor(block)
    })),
    assets: sortByPosition(document.assets).map((asset) => ({
      assetId: asset.assetId,
      sectionId: asset.sectionId,
      blockId: asset.blockId,
      title: asset.title,
      mediaType: asset.mediaType,
      relativePath: asset.relativePath
    }))
  };
}

function buildExportChildren({ documents, generatedAt, filters, includeMachineReadable }) {
  const children = [
    heading("SplitAll Knowledge Export"),
    heading("导出定位", HeadingLevel.HEADING_2),
    metadataTable({
      packageType: KNOWLEDGE_DOCX_EXPORT_PACKAGE_TYPE,
      packageRole: "external-knowledge-corpus",
      generatedAt,
      documentCount: documents.length,
      filterDocumentId: filters.documentId,
      filterBatchId: filters.batchId,
      filterSourceId: filters.sourceId,
      limit: filters.limit,
      agentContextBoundary: "agent-context is served by knowledge.search and evidence packs; this DOCX is for external KB ingestion."
    }),
    heading("架构原则", HeadingLevel.HEADING_2),
    paragraph("第一层：所有输入材料先归一化为可导出的标准 DOCX 知识文档，作为外部知识库可复用语料。"),
    paragraph("第二层：已收纳知识通过 KnowledgeCore 检索、证据包和上下文编排直接供给智能体。"),
    paragraph("DOCX 导出保留文档、章节、块、资产与证据定位元数据，便于外部知识库重新切分和追溯。")
  ];

  if (documents.length === 0) {
    children.push(heading("知识文档", HeadingLevel.HEADING_2), paragraph("当前筛选条件下没有可导出的知识文档。"));
  }

  for (const [documentIndex, knowledgeDocument] of documents.entries()) {
    const documentTitle = scalar(knowledgeDocument.title) || `知识文档 ${documentIndex + 1}`;
    const sections = sortByPosition(knowledgeDocument.sections);
    const blocks = sortByPosition(knowledgeDocument.blocks);
    const assets = sortByPosition(knowledgeDocument.assets);
    const blocksBySection = new Map();
    for (const block of blocks) {
      const key = scalar(block.sectionId) || "__unsectioned__";
      if (!blocksBySection.has(key)) {
        blocksBySection.set(key, []);
      }
      blocksBySection.get(key).push(block);
    }

    children.push(heading(documentTitle, HeadingLevel.HEADING_1));
    children.push(metadataTable(documentMetadata(knowledgeDocument)));
    if (scalar(knowledgeDocument.summary)) {
      children.push(heading("摘要", HeadingLevel.HEADING_2), ...bodyParagraphs(knowledgeDocument.summary));
    }

    const renderedSectionIds = new Set();
    for (const section of sections) {
      renderedSectionIds.add(scalar(section.sectionId));
      children.push(heading(scalar(section.title) || "未命名章节", sectionHeadingLevel(section.level)));
      children.push(metadataTable(sectionMetadata(section)));
      const sectionBlocks = blocksBySection.get(scalar(section.sectionId)) || [];
      if (sectionBlocks.length === 0) {
        children.push(paragraph("该章节未记录独立知识块。"));
      }
      for (const block of sectionBlocks) {
        children.push(heading(scalar(block.title) || `${block.blockType || "block"} ${block.position || ""}`.trim(), HeadingLevel.HEADING_4));
        children.push(metadataTable(blockMetadata(block)));
        children.push(...bodyParagraphs(block.text || block.snippet || ""));
      }
    }

    const unsectionedBlocks = [
      ...(blocksBySection.get("__unsectioned__") || []),
      ...blocks.filter((block) => scalar(block.sectionId) && !renderedSectionIds.has(scalar(block.sectionId)))
    ];
    if (unsectionedBlocks.length > 0) {
      children.push(heading("未归属章节知识块", HeadingLevel.HEADING_2));
      for (const block of unsectionedBlocks) {
        children.push(heading(scalar(block.title) || `${block.blockType || "block"} ${block.position || ""}`.trim(), HeadingLevel.HEADING_3));
        children.push(metadataTable(blockMetadata(block)));
        children.push(...bodyParagraphs(block.text || block.snippet || ""));
      }
    }

    if (assets.length > 0) {
      children.push(heading("资产与多模态证据", HeadingLevel.HEADING_2));
      for (const asset of assets) {
        children.push(heading(scalar(asset.title) || scalar(asset.assetId) || "资产", HeadingLevel.HEADING_3));
        children.push(metadataTable(assetMetadata(asset)));
        const assetText = normalizeText([asset.caption, asset.ocrText, asset.text].filter(Boolean).join("\n\n"));
        if (assetText) {
          children.push(...bodyParagraphs(assetText));
        }
      }
    }
  }

  if (includeMachineReadable !== false) {
    children.push(heading("机器可读附录", HeadingLevel.HEADING_1));
    children.push(...bodyParagraphs(stableJson({
      packageType: KNOWLEDGE_DOCX_EXPORT_PACKAGE_TYPE,
      generatedAt,
      filters,
      documents: documents.map(compactDocumentForAppendix)
    })));
  }

  return children;
}

function suggestedFileName(filters = {}, generatedAt = new Date().toISOString()) {
  const scope = filters.documentId || filters.batchId || filters.sourceId || "all";
  const stamp = generatedAt.replace(/[^0-9a-z]+/gi, "").slice(0, 14);
  return `splitall-knowledge-${slug(scope)}-${stamp}.docx`;
}

export async function buildKnowledgeDocxExport({
  documents = [],
  generatedAt = new Date().toISOString(),
  filters = {},
  includeMachineReadable = true
} = {}) {
  const normalizedDocuments = asArray(documents);
  const document = new Document({
    sections: [
      {
        children: buildExportChildren({
          documents: normalizedDocuments,
          generatedAt,
          filters,
          includeMachineReadable
        })
      }
    ]
  });
  const buffer = await Packer.toBuffer(document);
  return {
    buffer,
    contentType: KNOWLEDGE_DOCX_EXPORT_CONTENT_TYPE,
    fileName: suggestedFileName(filters, generatedAt),
    manifest: {
      packageType: KNOWLEDGE_DOCX_EXPORT_PACKAGE_TYPE,
      packageRole: "external-knowledge-corpus",
      generatedAt,
      filters,
      documentCount: normalizedDocuments.length,
      sectionCount: normalizedDocuments.reduce((sum, item) => sum + asArray(item.sections).length, 0),
      blockCount: normalizedDocuments.reduce((sum, item) => sum + asArray(item.blocks).length, 0),
      assetCount: normalizedDocuments.reduce((sum, item) => sum + asArray(item.assets).length, 0),
      agentContextBoundary: "agent-context is served by knowledge.search and evidence packs; this DOCX is for external KB ingestion."
    }
  };
}
