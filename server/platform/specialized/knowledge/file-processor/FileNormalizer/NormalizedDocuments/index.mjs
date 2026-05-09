import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
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
import {
  getNormalizedDocumentsDirectory,
  getNormalizedManifestPath
} from "./store.mjs";
import { importFileDescriptorForPath } from "../../import-file-types.mjs";

const MAX_CHILD_DOCUMENTS_PER_SOURCE = 80;
const MAX_BODY_CHARS = 24000;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncateText(value, maxChars = MAX_BODY_CHARS) {
  const text = normalizeText(value);
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}...`;
}

function scalar(value) {
  return String(value ?? "").trim();
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function stableHash(value, length = 10) {
  return createHash("sha1").update(String(value || "")).digest("hex").slice(0, length);
}

function slug(value, fallback = "item") {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || fallback;
}

function sourceExtension(source) {
  return path.extname(
    source?.originalRelativePath ||
      source?.name ||
      source?.path ||
      source?.documentMetadata?.resourceName ||
      ""
  ).toLowerCase();
}

function sourceDescriptor(source) {
  return importFileDescriptorForPath(
    source?.originalRelativePath ||
      source?.name ||
      source?.path ||
      source?.documentMetadata?.resourceName ||
      ""
  );
}

function sourceTitle(source) {
  return scalar(
    source?.documentMetadata?.["dc:title"] ||
      source?.documentMetadata?.title ||
      source?.originalFileName ||
      source?.name ||
      source?.path ||
      source?.id ||
      "未命名来源"
  );
}

function sourceKey(source, index) {
  return `${String(index + 1).padStart(3, "0")}-${slug(sourceTitle(source), `source-${index + 1}`)}-${stableHash(source?.id || sourceTitle(source), 6)}`;
}

function docId(prefix, source, suffix = "") {
  return `${prefix}-${stableHash([source?.id, sourceTitle(source), suffix].join("|"), 12)}`;
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

function bodyParagraphs(text, maxChars = MAX_BODY_CHARS) {
  const normalized = truncateText(text, maxChars);
  if (!normalized) {
    return [paragraph("未提取到正文。")];
  }
  return normalized
    .split(/\n{2,}/)
    .map((block) => paragraph(block.trim(), 140))
    .filter((item) => item);
}

function metadataTable(metadata = {}) {
  const rows = Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && scalar(value) !== "")
    .map(([key, value]) =>
      new TableRow({
        children: [
          new TableCell({ children: [paragraph(key, 80)] }),
          new TableCell({
            children: [paragraph(Array.isArray(value) ? value.join("; ") : String(value), 80)]
          })
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

function warningParagraphs(warnings = []) {
  const items = asArray(warnings).map(scalar).filter(Boolean);
  if (items.length === 0) {
    return [];
  }
  return [
    heading("解析与召回风险", HeadingLevel.HEADING_2),
    ...items.map((item) => paragraph(`- ${item}`, 100))
  ];
}

function evidenceParagraphs(evidence = {}) {
  const entries = Object.entries(evidence)
    .filter(([, value]) => value !== undefined && value !== null && scalar(value) !== "");
  if (entries.length === 0) {
    return [];
  }
  return [
    heading("证据定位", HeadingLevel.HEADING_2),
    metadataTable(Object.fromEntries(entries))
  ];
}

async function buildDocxBuffer({
  title,
  metadata,
  sections,
  evidence,
  warnings
}) {
  const children = [
    heading(title),
    heading("归一化元数据", HeadingLevel.HEADING_2),
    metadataTable(metadata),
    ...evidenceParagraphs(evidence),
    heading("正文", HeadingLevel.HEADING_2)
  ];

  for (const section of asArray(sections)) {
    const sectionTitle = scalar(section.title);
    if (sectionTitle) {
      children.push(heading(sectionTitle, section.level || HeadingLevel.HEADING_3));
    }
    children.push(...bodyParagraphs(section.body || section.text || ""));
  }

  children.push(...warningParagraphs(warnings));

  const document = new Document({
    sections: [{ children }]
  });
  return Packer.toBuffer(document);
}

function normalizeDocSpec(spec) {
  const sections = asArray(spec.sections).filter((section) =>
    normalizeText(section?.body || section?.text)
  );
  return {
    ...spec,
    title: scalar(spec.title) || "未命名知识文档",
    warnings: asArray(spec.warnings).map(scalar).filter(Boolean),
    sections: sections.length > 0 ? sections : [{ title: "正文", body: "未提取到正文。" }]
  };
}

async function writeDocxSpec({
  rootPath,
  sourceFolder,
  source,
  adapterId,
  granularity,
  fileName,
  spec,
  sourceMaterialRelativePath = ""
}) {
  const normalized = normalizeDocSpec(spec);
  const relativePath = path.posix.join("sources", sourceFolder, fileName);
  const absolutePath = path.join(rootPath, ...relativePath.split("/"));
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const buffer = await buildDocxBuffer(normalized);
  await fs.writeFile(absolutePath, buffer);
  const stats = await fs.stat(absolutePath);
  return {
    documentId: docId(adapterId.replace(/[^a-z0-9]+/gi, "-"), source, `${granularity}:${fileName}`),
    artifactType: "docx",
    adapterId,
    sourceId: source.id || "",
    granularity,
    title: normalized.title,
    relativePath,
    sha256: sha256(buffer),
    byteSize: stats.size,
    sourceMaterialRelativePath,
    warnings: normalized.warnings
  };
}

async function copySourceMaterial({ rootPath, sourceFolder, source, adapterId }) {
  const extension = sourceExtension(source);
  const descriptor = sourceDescriptor(source);
  if (!descriptor?.preserveSourceMaterial || !source.originalBuffer) {
    return null;
  }

  const fileName = path.basename(source.originalRelativePath || source.name || `source${extension}`);
  const relativePath = path.posix.join("source-materials", sourceFolder, fileName);
  const absolutePath = path.join(rootPath, ...relativePath.split("/"));
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, source.originalBuffer);
  const stats = await fs.stat(absolutePath);
  return {
    documentId: docId(`${adapterId}-source-material`, source, relativePath),
    artifactType: "source-material",
    adapterId,
    sourceId: source.id || "",
    granularity: "source-material",
    title: `${sourceTitle(source)} 原始材料`,
    relativePath,
    sha256: sha256(source.originalBuffer),
    byteSize: stats.size,
    sourceMaterialRelativePath: relativePath,
    warnings: []
  };
}

function chunksForSource(chunks, sourceId) {
  return asArray(chunks).filter((chunk) => chunk.sourceId === sourceId);
}

function chunkTitle(chunk, fallback) {
  return asArray(chunk?.titlePath).map(scalar).filter(Boolean).join(" / ") ||
    scalar(chunk?.title) ||
    fallback;
}

function chunkSections(chunks, fallbackText) {
  const sourceChunks = asArray(chunks);
  if (sourceChunks.length === 0) {
    return [{ title: "全文", body: fallbackText || "未提取到正文。" }];
  }
  return sourceChunks.map((chunk, index) => ({
    title: chunkTitle(chunk, `片段 ${index + 1}`),
    body: chunk.content || ""
  }));
}

function groupChunksByTopTitle(chunks, fallbackText) {
  const groups = new Map();
  for (const chunk of asArray(chunks)) {
    const key = scalar(asArray(chunk.titlePath)[0] || chunk.title || "正文");
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(chunk);
  }

  if (groups.size === 0) {
    return [{ title: "正文", body: fallbackText || "未提取到正文。" }];
  }

  return [...groups.entries()].map(([title, items]) => ({
    title,
    body: items.map((item) => item.content || "").filter(Boolean).join("\n\n")
  }));
}

function splitPseudoPages(text) {
  const normalized = normalizeText(text);
  const explicitPages = normalized
    .split(/\f|(?:^|\n)\s*(?:-{3,}\s*)?(?:page|slide|幻灯片|第\s*\d+\s*页)\s*[:#：]?\s*\d*\s*(?:-{3,})?\s*(?:\n|$)/i)
    .map(normalizeText)
    .filter(Boolean);
  if (explicitPages.length > 1) {
    return explicitPages;
  }
  const paragraphs = normalized.split(/\n{2,}/).map(normalizeText).filter(Boolean);
  if (paragraphs.length <= 1) {
    return normalized ? [normalized] : [];
  }
  return paragraphs;
}

function windowItems(items, size = 3) {
  const windows = [];
  for (let index = 0; index < items.length; index += size) {
    windows.push({
      start: index + 1,
      end: Math.min(items.length, index + size),
      items: items.slice(index, index + size)
    });
  }
  return windows;
}

function baseMetadata({ source, adapterId, granularity }) {
  return {
    sourceName: source.name || "",
    sourcePath: source.path || "",
    sourceKind: source.kind || "",
    mediaType: source.mediaType || "",
    sourceId: source.id || "",
    rawObjectId: source.rawObject?.objectId || "",
    sha256: source.originalSha256 || source.rawObject?.sha256 || "",
    adapterId,
    granularity,
    sourceCreatedAt: source.sourceCreatedAt || "",
    sourceUpdatedAt: source.sourceUpdatedAt || "",
    sourceCollectedAt: source.sourceCollectedAt || "",
    documentParserId: source.documentParserId || ""
  };
}

async function presentationAdapter({ rootPath, sourceFolder, source, chunks }) {
  const adapterId = "builtin/presentation-adapter";
  const sourceChunks = chunksForSource(chunks, source.id);
  const sourceMaterial = await copySourceMaterial({ rootPath, sourceFolder, source, adapterId });
  const sourceMaterialRelativePath = sourceMaterial?.relativePath || "";
  const docs = [];
  const warnings = [
    "PPT/PPTX 归一化以解析文本和结构启发式生成；未取得幻灯片截图时，视觉版式只能由原始材料覆盖。"
  ];

  docs.push(
    await writeDocxSpec({
      rootPath,
      sourceFolder,
      source,
      adapterId,
      granularity: "deck",
      fileName: "deck.docx",
      sourceMaterialRelativePath,
      spec: {
        title: `${sourceTitle(source)} - 全局演示文稿`,
        metadata: baseMetadata({ source, adapterId, granularity: "deck" }),
        evidence: { sourceMaterial: sourceMaterialRelativePath },
        sections: chunkSections(sourceChunks, source.text),
        warnings
      }
    })
  );

  const sections = groupChunksByTopTitle(sourceChunks, source.text).slice(0, MAX_CHILD_DOCUMENTS_PER_SOURCE);
  for (const [index, section] of sections.entries()) {
    docs.push(
      await writeDocxSpec({
        rootPath,
        sourceFolder,
        source,
        adapterId,
        granularity: "section",
        fileName: `section-${String(index + 1).padStart(3, "0")}.docx`,
        sourceMaterialRelativePath,
        spec: {
          title: `${sourceTitle(source)} - ${section.title}`,
          metadata: baseMetadata({ source, adapterId, granularity: "section" }),
          evidence: { sectionIndex: index + 1, sourceMaterial: sourceMaterialRelativePath },
          sections: [{ title: section.title, body: section.body }],
          warnings
        }
      })
    );
  }

  const slides = (sourceChunks.length > 0 ? sourceChunks.map((chunk) => chunk.content) : splitPseudoPages(source.text))
    .map(normalizeText)
    .filter(Boolean)
    .slice(0, MAX_CHILD_DOCUMENTS_PER_SOURCE);
  for (const [index, slideText] of slides.entries()) {
    docs.push(
      await writeDocxSpec({
        rootPath,
        sourceFolder,
        source,
        adapterId,
        granularity: "slide",
        fileName: `slide-${String(index + 1).padStart(3, "0")}.docx`,
        sourceMaterialRelativePath,
        spec: {
          title: `${sourceTitle(source)} - Slide ${index + 1}`,
          metadata: baseMetadata({ source, adapterId, granularity: "slide" }),
          evidence: { slideIndex: index + 1, sourceMaterial: sourceMaterialRelativePath },
          sections: [{ title: `Slide ${index + 1}`, body: slideText }],
          warnings
        }
      })
    );
  }

  return {
    documents: docs,
    sourceMaterials: sourceMaterial ? [sourceMaterial] : []
  };
}

async function pdfAdapter({ rootPath, sourceFolder, source, chunks }) {
  const adapterId = "builtin/pdf-adapter";
  const sourceChunks = chunksForSource(chunks, source.id);
  const sourceMaterial = await copySourceMaterial({ rootPath, sourceFolder, source, adapterId });
  const sourceMaterialRelativePath = sourceMaterial?.relativePath || "";
  const docs = [];
  const warnings = [
    "PDF 归一化以解析文本和页窗启发式生成；扫描页或图表如果没有 OCR 文本，召回可能依赖原始 PDF 覆盖。"
  ];

  docs.push(
    await writeDocxSpec({
      rootPath,
      sourceFolder,
      source,
      adapterId,
      granularity: "document",
      fileName: "document.docx",
      sourceMaterialRelativePath,
      spec: {
        title: `${sourceTitle(source)} - PDF 全文`,
        metadata: baseMetadata({ source, adapterId, granularity: "document" }),
        evidence: { sourceMaterial: sourceMaterialRelativePath },
        sections: chunkSections(sourceChunks, source.text),
        warnings
      }
    })
  );

  const sections = groupChunksByTopTitle(sourceChunks, source.text).slice(0, MAX_CHILD_DOCUMENTS_PER_SOURCE);
  for (const [index, section] of sections.entries()) {
    docs.push(
      await writeDocxSpec({
        rootPath,
        sourceFolder,
        source,
        adapterId,
        granularity: "section",
        fileName: `section-${String(index + 1).padStart(3, "0")}.docx`,
        sourceMaterialRelativePath,
        spec: {
          title: `${sourceTitle(source)} - ${section.title}`,
          metadata: baseMetadata({ source, adapterId, granularity: "section" }),
          evidence: { sectionIndex: index + 1, sourceMaterial: sourceMaterialRelativePath },
          sections: [{ title: section.title, body: section.body }],
          warnings
        }
      })
    );
  }

  const pages = splitPseudoPages(source.text);
  for (const pageWindow of windowItems(pages.length > 0 ? pages : [source.text || ""], 3)) {
    docs.push(
      await writeDocxSpec({
        rootPath,
        sourceFolder,
        source,
        adapterId,
        granularity: "page-window",
        fileName: `pages-${String(pageWindow.start).padStart(3, "0")}-${String(pageWindow.end).padStart(3, "0")}.docx`,
        sourceMaterialRelativePath,
        spec: {
          title: `${sourceTitle(source)} - Pages ${pageWindow.start}-${pageWindow.end}`,
          metadata: baseMetadata({ source, adapterId, granularity: "page-window" }),
          evidence: {
            pageStart: pageWindow.start,
            pageEnd: pageWindow.end,
            sourceMaterial: sourceMaterialRelativePath
          },
          sections: pageWindow.items.map((item, index) => ({
            title: `Page ${pageWindow.start + index}`,
            body: item
          })),
          warnings
        }
      })
    );
  }

  return {
    documents: docs,
    sourceMaterials: sourceMaterial ? [sourceMaterial] : []
  };
}

async function htmlAdapter({ rootPath, sourceFolder, source, chunks }) {
  const adapterId = "builtin/html-adapter";
  const sourceChunks = chunksForSource(chunks, source.id);
  const sourceMaterial = await copySourceMaterial({ rootPath, sourceFolder, source, adapterId });
  const sourceMaterialRelativePath = sourceMaterial?.relativePath || "";
  const docs = [];
  const warnings = [
    "HTML 归一化只复制主 HTML 文件；外链、脚本运行后内容或远端图片可能不会随 DOCX 一起进入知识库。"
  ];

  docs.push(
    await writeDocxSpec({
      rootPath,
      sourceFolder,
      source,
      adapterId,
      granularity: "page",
      fileName: "page.docx",
      sourceMaterialRelativePath,
      spec: {
        title: `${sourceTitle(source)} - HTML 页面`,
        metadata: baseMetadata({ source, adapterId, granularity: "page" }),
        evidence: { sourceMaterial: sourceMaterialRelativePath },
        sections: chunkSections(sourceChunks, source.text),
        warnings
      }
    })
  );

  const sections = groupChunksByTopTitle(sourceChunks, source.text).slice(0, MAX_CHILD_DOCUMENTS_PER_SOURCE);
  for (const [index, section] of sections.entries()) {
    docs.push(
      await writeDocxSpec({
        rootPath,
        sourceFolder,
        source,
        adapterId,
        granularity: "section",
        fileName: `section-${String(index + 1).padStart(3, "0")}.docx`,
        sourceMaterialRelativePath,
        spec: {
          title: `${sourceTitle(source)} - ${section.title}`,
          metadata: baseMetadata({ source, adapterId, granularity: "section" }),
          evidence: { sectionIndex: index + 1, sourceMaterial: sourceMaterialRelativePath },
          sections: [{ title: section.title, body: section.body }],
          warnings
        }
      })
    );
  }

  const blocks = (sourceChunks.length > 0 ? sourceChunks.map((chunk) => chunk.content) : splitPseudoPages(source.text))
    .map(normalizeText)
    .filter(Boolean)
    .slice(0, MAX_CHILD_DOCUMENTS_PER_SOURCE);
  for (const [index, block] of blocks.entries()) {
    docs.push(
      await writeDocxSpec({
        rootPath,
        sourceFolder,
        source,
        adapterId,
        granularity: "block",
        fileName: `block-${String(index + 1).padStart(3, "0")}.docx`,
        sourceMaterialRelativePath,
        spec: {
          title: `${sourceTitle(source)} - Block ${index + 1}`,
          metadata: baseMetadata({ source, adapterId, granularity: "block" }),
          evidence: { blockIndex: index + 1, sourceMaterial: sourceMaterialRelativePath },
          sections: [{ title: `Block ${index + 1}`, body: block }],
          warnings
        }
      })
    );
  }

  return {
    documents: docs,
    sourceMaterials: sourceMaterial ? [sourceMaterial] : []
  };
}

async function fallbackAdapter({ rootPath, sourceFolder, source, chunks }) {
  const adapterId = "builtin/fallback-adapter";
  const sourceChunks = chunksForSource(chunks, source.id);
  const warning = `未找到 ${sourceExtension(source) || source.kind || "未知格式"} 的专用适配器，已生成 source-level DOCX。`;
  const doc = await writeDocxSpec({
    rootPath,
    sourceFolder,
    source,
    adapterId,
    granularity: "source",
    fileName: "source.docx",
    spec: {
      title: `${sourceTitle(source)} - 归一化来源文档`,
      metadata: baseMetadata({ source, adapterId, granularity: "source" }),
      evidence: { sourcePath: source.path || source.name || "" },
      sections: chunkSections(sourceChunks, source.text),
      warnings: [warning]
    }
  });
  return {
    documents: [doc],
    sourceMaterials: []
  };
}

function participantLabel(participant = {}) {
  return [participant.name, participant.address].map(scalar).filter(Boolean).join(" <") +
    (participant.name && participant.address ? ">" : "");
}

function emailMetadata(email = {}, adapterId, granularity) {
  return {
    subject: email.subject || "",
    sentAt: email.sentAt || "",
    from: participantLabel(email.from),
    to: asArray(email.to).map(participantLabel).filter(Boolean),
    cc: asArray(email.cc).map(participantLabel).filter(Boolean),
    messageId: email.messageIdHeader || email.id || "",
    inReplyTo: email.inReplyTo || "",
    references: asArray(email.references),
    threadId: email.threadId || "",
    transactionId: email.transactionId || "",
    rawObjectId: email.rawObjectId || "",
    sourceName: email.sourceName || "",
    sourcePath: email.sourcePath || "",
    adapterId,
    granularity
  };
}

async function mailMessageDocs({ rootPath, mailFolder, emails }) {
  const adapterId = "builtin/mail-adapter";
  const source = { id: "mail-messages", name: "邮件消息", kind: "email" };
  const docs = [];
  for (const [index, email] of asArray(emails).entries()) {
    docs.push(
      await writeDocxSpec({
        rootPath,
        sourceFolder: mailFolder,
        source: { ...source, id: email.sourceId || email.id || `message-${index + 1}`, name: email.subject || source.name },
        adapterId,
        granularity: "message",
        fileName: `message-${String(index + 1).padStart(3, "0")}-${slug(email.subject, "message")}.docx`,
        spec: {
          title: `${email.subject || "无主题邮件"} - Message`,
          metadata: emailMetadata(email, adapterId, "message"),
          evidence: {
            messageId: email.messageIdHeader || email.id || "",
            sentAt: email.sentAt || "",
            rawObjectId: email.rawObjectId || ""
          },
          sections: [
            { title: "摘要", body: email.excerpt || "" },
            { title: "正文", body: email.body || "" }
          ],
          warnings: []
        }
      })
    );
  }
  return docs;
}

async function mailThreadDocs({ rootPath, mailFolder, threads, emails }) {
  const adapterId = "builtin/mail-adapter";
  const docs = [];
  const messagesById = new Map(asArray(emails).map((email) => [email.id, email]));
  for (const [index, thread] of asArray(threads).entries()) {
    const messages = asArray(thread.messageIds).map((id) => messagesById.get(id)).filter(Boolean);
    docs.push(
      await writeDocxSpec({
        rootPath,
        sourceFolder: mailFolder,
        source: { id: thread.id || `thread-${index + 1}`, name: thread.subject || "邮件线程", kind: "email" },
        adapterId,
        granularity: "thread",
        fileName: `thread-${String(index + 1).padStart(3, "0")}-${slug(thread.subject, "thread")}.docx`,
        spec: {
          title: `${thread.subject || "无主题线程"} - Thread`,
          metadata: {
            threadId: thread.id || "",
            subject: thread.subject || "",
            startedAt: thread.startedAt || "",
            latestActivityAt: thread.latestActivityAt || "",
            status: thread.status || "",
            cadence: thread.cadence || "",
            messageCount: messages.length,
            adapterId,
            granularity: "thread"
          },
          evidence: { messageIds: asArray(thread.messageIds).join("; ") },
          sections: [
            { title: "线程摘要", body: thread.summary || "" },
            ...messages.map((message, messageIndex) => ({
              title: `${messageIndex + 1}. ${message.sentAt || ""} ${message.subject || ""}`,
              body: message.body || message.excerpt || ""
            }))
          ],
          warnings: []
        }
      })
    );
  }
  return docs;
}

async function mailTransactionDocs({ rootPath, mailFolder, transactions, timeline, emails }) {
  const adapterId = "builtin/mail-adapter";
  const docs = [];
  const messagesById = new Map(asArray(emails).map((email) => [email.id, email]));
  for (const [index, transaction] of asArray(transactions).entries()) {
    const messages = asArray(transaction.messageIds).map((id) => messagesById.get(id)).filter(Boolean);
    const events = asArray(timeline).filter(
      (event) => event.transactionId && event.transactionId === transaction.id
    );
    docs.push(
      await writeDocxSpec({
        rootPath,
        sourceFolder: mailFolder,
        source: { id: transaction.id || `transaction-${index + 1}`, name: transaction.title || "邮件事务", kind: "email" },
        adapterId,
        granularity: "transaction",
        fileName: `transaction-${String(index + 1).padStart(3, "0")}-${slug(transaction.title, "transaction")}.docx`,
        spec: {
          title: `${transaction.title || "未命名事务"} - Transaction Timeline`,
          metadata: {
            transactionId: transaction.id || "",
            status: transaction.status || "",
            startedAt: transaction.startedAt || "",
            latestActivityAt: transaction.latestActivityAt || "",
            threadIds: asArray(transaction.threadIds),
            messageIds: asArray(transaction.messageIds),
            participantIds: asArray(transaction.participantIds),
            adapterId,
            granularity: "transaction"
          },
          evidence: {
            transactionId: transaction.id || "",
            timelineEventIds: events.map((event) => event.id || event.timelineEventId || event.title).join("; ")
          },
          sections: [
            { title: "事务摘要", body: transaction.summary || "" },
            { title: "决定 / 结论", body: asArray(transaction.decisions).map((item) => `- ${item}`).join("\n") },
            { title: "待办", body: asArray(transaction.pendingItems).map((item) => `- ${item}`).join("\n") },
            {
              title: "时间线",
              body: events
                .map((event) => `${event.timestamp || ""} ${event.title || ""}\n${event.summary || ""}`)
                .join("\n\n")
            },
            ...messages.map((message, messageIndex) => ({
              title: `${messageIndex + 1}. ${message.sentAt || ""} ${message.subject || ""}`,
              body: message.body || message.excerpt || ""
            }))
          ],
          warnings: []
        }
      })
    );
  }
  return docs;
}

async function mailAdapter({ rootPath, analysis }) {
  const mailFolder = "mail";
  return {
    documents: [
      ...(await mailMessageDocs({ rootPath, mailFolder, emails: analysis.emails })),
      ...(await mailThreadDocs({
        rootPath,
        mailFolder,
        threads: analysis.threads,
        emails: analysis.emails
      })),
      ...(await mailTransactionDocs({
        rootPath,
        mailFolder,
        transactions: analysis.transactions,
        timeline: analysis.timeline,
        emails: analysis.emails
      }))
    ],
    sourceMaterials: []
  };
}

function pickAdapter(source) {
  const descriptor = sourceDescriptor(source);
  if (descriptor?.normalizedAdapter === "presentation") {
    return presentationAdapter;
  }
  if (source.kind === "pdf" || descriptor?.normalizedAdapter === "pdf") {
    return pdfAdapter;
  }
  if (descriptor?.normalizedAdapter === "html") {
    return htmlAdapter;
  }
  if (source.kind === "email") {
    return null;
  }
  return fallbackAdapter;
}

function summarizeManifest(documents, sourceMaterials) {
  const byGranularity = {};
  for (const entry of documents) {
    byGranularity[entry.granularity] = (byGranularity[entry.granularity] || 0) + 1;
  }
  return {
    documentCount: documents.length,
    sourceMaterialCount: sourceMaterials.length,
    byGranularity
  };
}

export async function generateNormalizedDocuments({
  userDataPath,
  jobId,
  generatedAt,
  sources,
  chunks,
  analysis
}) {
  const rootPath = getNormalizedDocumentsDirectory(userDataPath, jobId);
  await fs.rm(rootPath, { recursive: true, force: true });
  await fs.mkdir(rootPath, { recursive: true });

  const documents = [];
  const sourceMaterials = [];
  const warnings = [];

  const mailResult = await mailAdapter({ rootPath, analysis });
  documents.push(...mailResult.documents);
  sourceMaterials.push(...mailResult.sourceMaterials);

  for (const [index, source] of asArray(sources).entries()) {
    const adapter = pickAdapter(source);
    if (!adapter) {
      continue;
    }
    const folder = sourceKey(source, index);
    try {
      const result = await adapter({
        rootPath,
        sourceFolder: folder,
        source,
        chunks
      });
      documents.push(...asArray(result.documents));
      sourceMaterials.push(...asArray(result.sourceMaterials));
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      warnings.push(`${sourceTitle(source)} 归一化失败：${message}`);
    }
  }

  const manifest = {
    schemaVersion: 1,
    packageType: "splitall.normalized-documents",
    batchId: jobId,
    generatedAt,
    rootRelativePath: "normalized-documents",
    documents,
    sourceMaterials,
    summary: summarizeManifest(documents, sourceMaterials),
    warnings
  };

  await fs.writeFile(
    getNormalizedManifestPath(userDataPath, jobId),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  return manifest;
}
