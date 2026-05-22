import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SERVER_API_OPERATIONS } from "../platform/common/operation-dispatcher/operation-registry.mjs";
import { createKnowledgeDistillationWorkbench } from "../platform/specialized/knowledge/invocation/knowledge-distillation-workbench/index.mjs";

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pact-distillation-workbench-"));

const fakeResult = {
  generatedAt: "2026-05-20T00:00:00.000Z",
  normalizedDocuments: {
    schemaVersion: 1,
    packageType: "pact.normalized-documents",
    batchId: "job-project-1",
    generatedAt: "2026-05-20T00:00:00.000Z",
    documents: [
      {
        documentId: "doc-1",
        sourceId: "source-1",
        title: "README",
        granularity: "source",
        relativePath: "normalized-documents/readme.docx"
      },
      {
        documentId: "doc-2",
        sourceId: "source-2",
        title: "ARCH",
        granularity: "section",
        relativePath: "normalized-documents/arch.docx"
      }
    ],
    sourceMaterials: [{ documentId: "mat-1", title: "README raw", relativePath: "source-materials/readme.md" }],
    assets: [{ assetId: "asset-1", artifactType: "image", title: "Architecture diagram", relativePath: "assets/arch.png", sourceId: "source-2" }],
    summary: { documentCount: 2, sourceMaterialCount: 1, assetCount: 1, byGranularity: { source: 1, section: 1 } },
    warnings: []
  },
  preprocess: {
    blocks: [
      { id: "block-1", sourceId: "source-1", kind: "heading", text: "Project", headingPath: ["Project"], sourceStartLine: 1, sourceEndLine: 1 },
      { id: "block-2", sourceId: "source-2", kind: "paragraph", text: "Knowledge conversion has raw corpus, index, and distillation stages.", headingPath: ["Architecture"], sourceStartLine: 1, sourceEndLine: 3 }
    ],
    chunks: [
      { id: "chunk-1", sourceId: "source-1", blockIds: ["block-1"], content: "Project supports workspace switching.", tokenCount: 5 }
    ]
  },
  sourceFiles: [
    {
      id: "source-1",
      name: "README.md",
      originalRelativePath: "README.md",
      kind: "text",
      text: "# Project\n\nThis project supports workspace switching and knowledge distillation.",
      capturedAt: "2026-05-20T00:00:00.000Z",
      contentHash: "sha256:readme",
      embeddedDocuments: []
    },
    {
      id: "source-2",
      name: "docs/ARCH.md",
      originalRelativePath: "docs/ARCH.md",
      kind: "text",
      text: "# Architecture\n\nKnowledge conversion has raw corpus, index, and distillation stages.",
      capturedAt: "2026-05-19T00:00:00.000Z",
      contentHash: "sha256:arch",
      visualElements: [
        { kind: "image", sequence: 1, title: "Architecture diagram", mediaType: "image/png" },
        { kind: "table", sequence: 2, title: "Layer table", markdown: "| Layer | Role |\\n| --- | --- |\\n| Raw | Convert |" }
      ]
    }
  ],
  retrieval: {
    items: [{ id: "evidence-1", documentId: "doc-1", title: "Project architecture evidence", score: 0.9 }]
  },
  timeline: [{ title: "Initial document" }]
};

const queueEvents = [];
const queueMonitor = {
  registerStarted(input) {
    queueEvents.push({ type: "started", input });
    return Promise.resolve(input);
  },
  registerHeartbeat(input) {
    queueEvents.push({ type: "heartbeat", input });
    return Promise.resolve(input);
  },
  registerClosed(input) {
    queueEvents.push({ type: "closed", input });
    return Promise.resolve(input);
  }
};

const workbench = createKnowledgeDistillationWorkbench({
  userDataPath: tempRoot,
  jobManager: {
    async getJob(jobId) {
      assert.equal(jobId, "job-project-1");
      return { id: jobId, status: "completed", progressPercent: 100 };
    },
    async getJobResult(jobId) {
      assert.equal(jobId, "job-project-1");
      return fakeResult;
    }
  },
  queueMonitor,
  knowledgeDistillationRuntime: {
    async runDistillation(input) {
      assert.equal(input.query, "项目全部文档通用知识蒸馏");
      assert.ok(input.rawDocuments.length >= 1);
      assert.equal(input.modelEnabled, true);
      assert.equal(input.modelAlias, "deepseek-v4-flash");
      return {
        status: "completed",
        candidates: [{ candidateId: "candidate-1" }],
        portableDocuments: [
          {
            document: {
              title: "Project distilled document",
              markdown: "# Project distilled document\n\nWorkspace switching and knowledge distillation are core capabilities.",
              selfContained: true,
              runtimeDependencies: [],
              citations: [{ citationKey: "C1", excerpt: "workspace switching" }],
              evidenceAppendix: [{ citationKey: "C1", excerpt: "workspace switching" }]
            }
          }
        ]
      };
    }
  }
});

const requiredOperationIds = [
  "knowledge.distillation.workbench.runs.list",
  "knowledge.distillation.workbench.runs.create",
  "knowledge.distillation.workbench.runs.get",
  "knowledge.distillation.workbench.runs.resume",
  "knowledge.distillation.workbench.runs.cancel",
  "knowledge.distillation.workbench.runs.archive",
  "knowledge.distillation.workbench.runs.delete",
  "knowledge.distillation.workbench.stage.rerun",
  "knowledge.distillation.workbench.stage.export",
  "knowledge.distillation.workbench.runs.package",
  "knowledge.distillation.workbench.runs.compare"
];
const operationIds = new Set(SERVER_API_OPERATIONS.map((operation) => operation.id));
for (const id of requiredOperationIds) {
  assert.equal(operationIds.has(id), true, `operation registry must include ${id}`);
}

await assert.rejects(
  () => workbench.createRun({
    jobId: "job-project-1",
    title: "Invalid distillation",
    query: "项目全部文档通用知识蒸馏",
    modelEnabled: false
  }),
  /必须启用模型闭环/
);

const created = await workbench.createRun({
  jobId: "job-project-1",
  batchId: "job-project-1",
  title: "Verify project distillation",
  query: "项目全部文档通用知识蒸馏"
});
assert.equal(created.status, "queued");

let run = null;
for (let attempt = 0; attempt < 60; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  run = await workbench.getRun({ runId: created.runId });
  if (run?.status === "completed" || run?.status === "failed") {
    break;
  }
}

assert.equal(run?.status, "completed", run?.error || "workbench run should complete");
assert.equal(run.stages.length, 5);
assert.equal(run.stages.every((stage) => stage.status === "completed"), true);
assert.ok(run.storage.rootRelativePath.includes("knowledge-distillation-workbench"));
assert.equal(run.taskManagement.queue, "queue-monitor");
assert.equal(queueEvents.some((event) => event.type === "started"), true);
assert.equal(queueEvents.some((event) => event.type === "closed" && event.input.status === "completed"), true);

const markdown = await workbench.exportStage({
  runId: created.runId,
  stageId: "knowledge-distillation",
  format: "markdown"
});
assert.equal(markdown.contentType.includes("text/markdown"), true);
assert.ok(markdown.buffer.toString("utf8").includes("Project distilled document"));

const docx = await workbench.exportStage({
  runId: created.runId,
  stageId: "knowledge-distillation",
  format: "docx"
});
assert.equal(docx.contentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
assert.ok(docx.buffer.length > 1000);

const stagePackage = await workbench.exportStage({
  runId: created.runId,
  stageId: "raw-format-conversion",
  format: "package"
});
assert.equal(stagePackage.contentType, "application/zip");
assert.ok(stagePackage.buffer.length > 100);

const runPackage = await workbench.exportRunPackage({ runId: created.runId });
assert.equal(runPackage.contentType, "application/zip");
assert.ok(runPackage.buffer.length > 100);

let rerun = await workbench.rerunStage({
  runId: created.runId,
  stageId: "project-dossier"
});
assert.equal(rerun.status, "queued");
for (let attempt = 0; attempt < 60; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  rerun = await workbench.getRun({ runId: created.runId });
  if (rerun?.status === "completed" || rerun?.status === "failed") {
    break;
  }
}
assert.equal(rerun.status, "completed");
assert.equal(
  rerun.stages.find((stage) => stage.stageId === "project-dossier").versions.length,
  1
);

const second = await workbench.createRun({
  jobId: "job-project-1",
  batchId: "job-project-1",
  title: "Verify project distillation v2",
  query: "项目全部文档通用知识蒸馏"
});
let secondRun = null;
for (let attempt = 0; attempt < 60; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  secondRun = await workbench.getRun({ runId: second.runId });
  if (secondRun?.status === "completed" || secondRun?.status === "failed") {
    break;
  }
}
assert.equal(secondRun.status, "completed");
const comparison = await workbench.compareRuns({
  leftRunId: created.runId,
  rightRunId: second.runId
});
assert.equal(comparison.stages.length, 5);

const archived = await workbench.archiveRun({ runId: second.runId });
assert.ok(archived.archivedAt);

const cancelTarget = await workbench.createRun({
  rawDocuments: [{ title: "cancel target", text: "cancel me" }],
  title: "Cancel target",
  query: "项目全部文档通用知识蒸馏"
});
const canceled = await workbench.cancelRun({ runId: cancelTarget.runId, reason: "verify cancel" });
assert.equal(canceled.status, "canceled");

const deleted = await workbench.deleteRun({ runId: second.runId });
assert.equal(deleted.ok, true);

const listing = await workbench.listRuns();
assert.equal(listing.items.some((item) => item.runId === created.runId), true);

console.log("knowledge distillation workbench verification passed");
