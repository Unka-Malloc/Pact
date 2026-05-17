import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { generateNormalizedDocuments } from "../platform/specialized/knowledge/preprocessing/file-processor/FileNormalizer/NormalizedDocuments/index.mjs";
import { createKnowledgeCoreMount } from "../platform/specialized/knowledge/storage/knowledge-core/index.mjs";

function docxXml(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const documentXml = files["word/document.xml"];
  assert.ok(documentXml, "DOCX must contain word/document.xml");
  return strFromU8(documentXml);
}

function assertDocxIncludes(buffer, needle, message) {
  const xml = docxXml(buffer);
  assert.equal(xml.includes(needle), true, message || `DOCX must include ${needle}`);
}

async function assertNormalizedDocumentChunkEvidence() {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-normalized-docx-"));
  const jobId = "normalized-docx-export";
  const manifest = await generateNormalizedDocuments({
    userDataPath,
    jobId,
    generatedAt: "2026-05-17T00:00:00.000Z",
    sources: [
      {
        id: "source-md",
        name: "renewal.md",
        path: "fixtures/renewal.md",
        kind: "document",
        mediaType: "text/markdown",
        text: "# 客户续费\n\n## 背景\n背景证据正文。",
        documentParserId: "verify"
      }
    ],
    chunks: [
      {
        id: "chunk-background",
        sourceId: "source-md",
        sectionId: "section-background",
        titlePath: ["客户续费", "背景"],
        content: "背景证据正文。",
        sourceRange: { startLine: 3, endLine: 4 },
        sourceStartLine: 3,
        sourceEndLine: 4,
        metadata: {
          strategy: "markdown-section-v1",
          preservesSectionBoundary: true
        }
      }
    ],
    analysis: {
      emails: [],
      threads: [],
      transactions: [],
      timeline: []
    }
  });

  assert.equal(manifest.packageType, "splitall.normalized-documents");
  assert.equal(manifest.packageRole, "external-knowledge-corpus");
  assert.equal(manifest.architecture.corpusExport.format, "docx");
  assert.equal(manifest.architecture.agentContext.interface.includes("knowledge.search"), true);
  assert.ok(manifest.documents.length > 0);

  const firstDocx = manifest.documents.find((document) => document.artifactType === "docx");
  assert.ok(firstDocx, "normalized package must contain DOCX documents");
  const buffer = await fs.readFile(path.join(userDataPath, "jobs", jobId, "normalized-documents", firstDocx.relativePath));
  assertDocxIncludes(buffer, "chunk-background", "normalized DOCX must carry chunk id");
  assertDocxIncludes(buffer, "section-background", "normalized DOCX must carry section id");
  assertDocxIncludes(buffer, "startLine", "normalized DOCX must carry source range");
}

function buildKnowledgeDocument() {
  return {
    documentId: "docx-export-doc",
    collectionId: "docx-export-fixture",
    collectionTitle: "DOCX Export Fixture",
    collectionType: "test",
    batchId: "batch-docx",
    sourceId: "source-docx",
    documentType: "document",
    title: "客户续费资料",
    summary: "用于验证知识库 DOCX 导出的摘要。",
    sourcePath: "fixtures/customer-renewal.md",
    sourceHash: "sha256:fixture",
    metadata: {
      importRole: "canonical-knowledge"
    },
    sections: [
      {
        sectionId: "section-background",
        documentId: "docx-export-doc",
        title: "背景",
        level: 1,
        position: 1,
        metadata: {
          sourceRange: { startLine: 1, endLine: 5 }
        }
      }
    ],
    blocks: [
      {
        blockId: "block-background",
        documentId: "docx-export-doc",
        sectionId: "section-background",
        blockType: "text",
        title: "背景证据",
        text: "背景证据正文，包含续费窗口、法务跟进和预算审批事实。",
        snippet: "背景证据正文",
        position: 1,
        sourceLocator: {
          sourcePath: "fixtures/customer-renewal.md",
          sourceRange: { startLine: 2, endLine: 4 }
        },
        metadata: {
          chunkId: "chunk-background"
        }
      }
    ],
    assets: [
      {
        assetId: "asset-renewal-table",
        documentId: "docx-export-doc",
        sectionId: "section-background",
        blockId: "block-background",
        assetType: "table",
        mediaType: "text/plain",
        title: "续费表格",
        text: "客户 | 金额 | 状态",
        caption: "续费金额和状态表。",
        position: 1,
        metadata: {
          sourceRange: { startLine: 6, endLine: 8 }
        }
      }
    ]
  };
}

async function assertKnowledgeCoreDocxExport() {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-knowledge-docx-"));
  const knowledgeCore = await createKnowledgeCoreMount({ userDataPath });
  try {
    knowledgeCore.upsertDocuments({
      documents: [buildKnowledgeDocument()]
    });

    const capabilities = await knowledgeCore.capabilities();
    assert.equal(capabilities.outputFormats.includes("docx"), true);
    assert.equal(capabilities.knowledgePartitions.corpusExport.format, "docx");
    assert.equal(capabilities.knowledgePartitions.agentContext.interface.includes("knowledge.search"), true);

    const result = await knowledgeCore.exportDocx({ batchId: "batch-docx", limit: 50 });
    assert.equal(result.contentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.equal(result.fileName.endsWith(".docx"), true);
    assert.equal(result.manifest.packageRole, "external-knowledge-corpus");
    assert.equal(result.manifest.documentCount, 1);
    assert.ok(result.buffer.length > 0);
    assertDocxIncludes(result.buffer, "SplitAll Knowledge Export");
    assertDocxIncludes(result.buffer, "客户续费资料");
    assertDocxIncludes(result.buffer, "背景证据正文");
    assertDocxIncludes(result.buffer, "external-knowledge-corpus");
    assertDocxIncludes(result.buffer, "chunk-background");
  } finally {
    await knowledgeCore.close();
  }
}

async function main() {
  await assertNormalizedDocumentChunkEvidence();
  await assertKnowledgeCoreDocxExport();
  console.log("knowledge docx export verification passed");
}

await main();
