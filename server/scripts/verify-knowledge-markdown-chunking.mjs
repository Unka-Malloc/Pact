import assert from "node:assert/strict";
import {
  chunkMarkdownText,
  MARKDOWN_CHUNKING_STRATEGY,
  parseStructuredMarkdown
} from "../platform/specialized/knowledge/preprocessing/chunking/structured-markdown.mjs";
import { createKnowledgePipeline } from "../platform/specialized/knowledge/preprocessing/chunking/pipeline.mjs";

function findChunk(chunks, title, contains = "") {
  const chunk = chunks.find((item) => item.sectionTitle === title && (!contains || item.content.includes(contains)));
  assert.ok(chunk, `expected chunk for section ${title}`);
  return chunk;
}

function assertNoCrossSectionMerge() {
  const markdown = [
    "# 客户续费手册",
    "",
    "## 背景",
    "背景证据只属于背景章节。该段描述客户进入续费窗口，需要销售和法务共同跟进。",
    "",
    "## 风险",
    "风险证据只属于风险章节。该段描述预算审批延期和稳定性问题，需要升级处理。",
    "",
    "## 方案",
    "方案证据只属于方案章节。该段描述补充安全材料、修复缺陷并安排复盘。",
  ].join("\n");

  const result = chunkMarkdownText({
    text: markdown,
    source: { id: "renewal", name: "renewal.md" },
    options: { sectionLevel: 2, maxTokens: 600, maxChars: 3000, overlapTokens: 40 },
  });

  const background = findChunk(result.chunks, "背景", "背景证据");
  const risk = findChunk(result.chunks, "风险", "风险证据");
  const plan = findChunk(result.chunks, "方案", "方案证据");

  assert.equal(background.metadata.strategy, MARKDOWN_CHUNKING_STRATEGY);
  assert.equal(background.metadata.preservesSectionBoundary, true);
  assert.equal(background.content.includes("风险证据"), false);
  assert.equal(risk.content.includes("背景证据"), false);
  assert.equal(risk.content.includes("方案证据"), false);
  assert.equal(plan.content.includes("风险证据"), false);
  assert.ok(background.sourceStartLine > 0);
  assert.ok(background.sourceEndLine >= background.sourceStartLine);
  assert.ok(background.sectionId.includes("section"));
  assert.deepEqual(background.headingPath, ["客户续费手册", "背景"]);
}

function assertSectionScopedOverlap() {
  const repeatedA = Array.from({ length: 28 }, (_, index) =>
    `背景段落 ${index + 1}：这里持续描述同一章节内的背景材料、合同状态、邮件证据和交付日志。`
  ).join("\n\n");
  const markdown = [
    "# 知识库导入",
    "",
    "## 背景",
    repeatedA,
    "",
    "## 风险",
    "风险章节的第一句不能携带背景章节尾部重叠内容。",
  ].join("\n");

  const result = chunkMarkdownText({
    text: markdown,
    source: { id: "overlap", name: "overlap.md" },
    options: { sectionLevel: 2, maxTokens: 120, maxChars: 560, overlapTokens: 32 },
  });

  const backgroundChunks = result.chunks.filter((chunk) => chunk.sectionTitle === "背景");
  const riskChunk = findChunk(result.chunks, "风险", "风险章节的第一句");

  assert.ok(backgroundChunks.length >= 2, "background section should split into multiple chunks");
  assert.ok(backgroundChunks.slice(1).some((chunk) => chunk.overlapTokenCount > 0));
  assert.equal(riskChunk.overlapTokenCount, 0);
  assert.equal(riskChunk.content.includes("背景段落"), false);
}

function assertStructuredBlocksArePreserved() {
  const markdown = [
    "# 导入规范",
    "",
    "## 表格",
    "| 字段 | 说明 |",
    "| --- | --- |",
    "| sourceRange | 原文行号范围 |",
    "| sectionId | 稳定章节标识 |",
    "",
    "## 代码",
    "```ts",
    "export function anchor(sectionId: string) {",
    "  return `section:${sectionId}`;",
    "}",
    "```",
  ].join("\n");

  const parsed = parseStructuredMarkdown({
    id: "structured",
    name: "structured.md",
    text: markdown,
  }, {
    sectionLevel: 2,
  });
  const tableBlock = parsed.blocks.find((block) => block.kind === "table");
  const codeBlock = parsed.blocks.find((block) => block.kind === "code");

  assert.ok(tableBlock, "markdown table should stay a table block");
  assert.ok(codeBlock, "fenced code should stay a code block");
  assert.equal(tableBlock.text.includes("| sourceRange | 原文行号范围 |"), true);
  assert.equal(codeBlock.text.includes("export function anchor"), true);
  assert.equal(codeBlock.metadata.fenced, true);
  assert.ok(tableBlock.sourceStartLine < tableBlock.sourceEndLine);
  assert.ok(codeBlock.sourceStartLine < codeBlock.sourceEndLine);
}

async function assertPipelineUsesStructuredMarkdown() {
  const markdown = [
    "# Agent 知识库",
    "",
    "## 上下文",
    "上下文章节需要保留标题路径和 sourceRange，供智能体引用。",
    "",
    "## 工具链",
    "工具链章节需要独立检索，不能和上下文章节混在同一个 chunk 中。",
  ].join("\n");

  const pipeline = createKnowledgePipeline();
  const result = await pipeline.run([{
    id: "agent-kb",
    name: "agent-kb.md",
    kind: "document",
    mediaType: "text/markdown",
    text: markdown,
  }]);

  const contextChunk = result.chunks.find((chunk) => chunk.sectionTitle === "上下文");
  const toolchainChunk = result.chunks.find((chunk) => chunk.sectionTitle === "工具链");

  assert.ok(contextChunk, "pipeline should emit context section chunk");
  assert.ok(toolchainChunk, "pipeline should emit toolchain section chunk");
  assert.equal(contextChunk.metadata.strategy, MARKDOWN_CHUNKING_STRATEGY);
  assert.equal(contextChunk.metadata.preservesSectionBoundary, true);
  assert.equal(contextChunk.content.includes("工具链章节"), false);
  assert.ok(contextChunk.sectionId);
  assert.ok(contextChunk.headingPath.includes("上下文"));
  assert.ok(contextChunk.sourceRange.startLine > 0);
  assert.ok(contextChunk.sourceRange.endLine >= contextChunk.sourceRange.startLine);
  assert.ok(result.blocks.some((block) => block.sectionId && block.headingPath.includes("上下文")));
}

async function main() {
  assertNoCrossSectionMerge();
  assertSectionScopedOverlap();
  assertStructuredBlocksArePreserved();
  await assertPipelineUsesStructuredMarkdown();
  console.log("knowledge markdown chunking verification passed");
}

await main();
