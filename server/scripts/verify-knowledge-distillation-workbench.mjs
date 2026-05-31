import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { contentDispositionHeader } from "../platform/common/console/http/http-utils.mjs";
import { SERVER_API_OPERATIONS } from "../platform/common/operation-dispatcher/operation-registry.mjs";
import { createModelDecisionRuntime } from "../platform/specialized/agent/agent-gateway/model-decision-runtime/index.mjs";
import { createKnowledgeDistillationRuntime } from "../platform/specialized/knowledge/invocation/knowledge-distillation-runtime/index.mjs";
import { createKnowledgeDistillationWorkbench } from "../platform/specialized/knowledge/invocation/knowledge-distillation-workbench/index.mjs";

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pact-distillation-workbench-"));
const algorithmVersion = "pact.knowledge-distillation.algorithm.v2";
const externalEvaluationVersion = "pact.knowledge-distillation.external-evaluation.v1";

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
      assert.equal(input.strategyVersion, "timeline_then_topic_v2");
      assert.equal(input.semanticSupportRequired, true);
      assert.equal(input.timeDecayHalfLifeDays, 90);
      assert.equal(input.timeDecayFloor, 0.35);
      return {
        status: "completed",
        algorithmVersion,
        sourcePlan: {
          protocolVersion: algorithmVersion,
          strategy: "timeline_then_topic",
          referenceTimestamp: "2026-05-20T00:00:00.000Z",
          halfLifeDays: 90,
          floor: 0.35,
          timeline: {
            knownTimestampCount: 2,
            unknownTimestampCount: 0,
            chronological: true,
            oldestAt: "2026-05-19T00:00:00.000Z",
            newestAt: "2026-05-20T00:00:00.000Z"
          },
          items: [
            {
              sourceOrder: 1,
              title: "ARCH",
              capturedAt: "2026-05-19T00:00:00.000Z",
              importanceScore: 0.8,
              temporalWeight: 0.992,
              decayedImportanceScore: 0.7936
            },
            {
              sourceOrder: 2,
              title: "README",
              capturedAt: "2026-05-20T00:00:00.000Z",
              importanceScore: 0.86,
              temporalWeight: 1,
              decayedImportanceScore: 0.86
            }
          ]
        },
        semanticClusters: [
          {
            clusterId: "cluster-1",
            label: "项目知识蒸馏",
            itemCount: 2,
            decayedImportanceScore: 0.8268,
            timeline: {
              knownTimestampCount: 2,
              chronological: true,
              firstAt: "2026-05-19T00:00:00.000Z",
              lastAt: "2026-05-20T00:00:00.000Z"
            }
          }
        ],
        qualityReportV3: {
          protocolVersion: algorithmVersion,
          passed: true,
          overallScore: 0.92,
          semanticCoverageScore: 0.9,
          timelineOrderScore: 1,
          timeDecayCalibrationScore: 0.82
        },
        externalEvaluation: {
          protocolVersion: externalEvaluationVersion,
          method: "aggregate_data_driven_semantic_claim_coverage_v1",
          passed: true,
          overallScore: 0.91,
          metrics: {
            expectedClaimCount: 2,
            actualClaimCount: 2,
            coveredClaimCount: 2,
            semanticCoverageScore: 1,
            timelineOrderScore: 1,
            timeDecayCalibrationScore: 0.82
          }
        },
        claimLedger: {
          protocolVersion: algorithmVersion,
          clusters: []
        },
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
  "knowledge.distillation.workbench.runs.artifacts",
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
const coreStage = run.stages.find((stage) => stage.stageId === "knowledge-distillation");
assert.equal(coreStage?.metrics?.semanticClusterCount, 1);
assert.equal(coreStage?.metrics?.timelineOrderScore, 1);
assert.ok(Number(coreStage?.metrics?.externalEvaluationScore || 0) > 0.8);
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
const unicodeDisposition = contentDispositionHeader("attachment", "verify-project-distillation-知识蒸馏.md");
assert.doesNotThrow(() => http.validateHeaderValue("Content-Disposition", unicodeDisposition));
assert.match(unicodeDisposition, /filename\*=UTF-8''.*%E7%9F%A5%E8%AF%86/);

const docx = await workbench.exportStage({
  runId: created.runId,
  stageId: "knowledge-distillation",
  format: "docx"
});
assert.equal(docx.contentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
assert.ok(docx.buffer.length > 1000);

const artifacts = await workbench.listRunArtifacts({ runId: created.runId });
assert.equal(artifacts.count, 4);
const artifactsById = new Map(artifacts.items.map((item) => [item.artifactId, item]));
assert.equal(artifactsById.get("knowledge-distillation:markdown")?.byteSize, markdown.buffer.length);
assert.ok(Math.abs(Number(artifactsById.get("knowledge-distillation:docx")?.byteSize || 0) - docx.buffer.length) <= 64);
assert.ok(Number(artifactsById.get("knowledge-distillation:json")?.byteSize || 0) > 0);
assert.ok(Number(artifactsById.get("run:package")?.byteSize || 0) > 0);

const gatewayCalls = [];
const modelDecisionRuntime = createModelDecisionRuntime({
  agentGatewayCall: async ({ question, modelAlias, modelRouting }) => {
    const roleId = /Role:\s*([^\n]+)/.exec(question)?.[1] || "";
    gatewayCalls.push({
      roleId,
      questionLength: question.length,
      modelAlias,
      routeId: modelRouting?.routeId || ""
    });
    if (roleId === "topic_cluster_namer") {
      return { answer: JSON.stringify({ title: "上传文档核心提炼" }) };
    }
    if (roleId === "knowledge_raw_batch_extractor") {
      return {
        answer: JSON.stringify({
          summary: "上传语料批次已经提炼为核心事实。",
          coreFindings: [
            {
              findingId: "finding-1",
              statement: "用户上传文件后，蒸馏链路必须生成可下载的 Markdown 结果文档。",
              importance: "critical",
              confidence: 0.96
            }
          ],
          risks: ["不能把无结果文档的运行标记为完成。"]
        })
      };
    }
    if (roleId === "knowledge_skill_distiller") {
      return {
        answer: JSON.stringify({
          skill: {
            title: "上传文档核心提炼",
            summary: "上传文档蒸馏必须保留来源证据，并在运行结束后返回可下载结果。",
            coreConcepts: [{ term: "结果文档", weight: 1 }],
            decisionHeuristics: ["完成态必须同时满足核心阶段完成和 Markdown 产物存在。"],
            honestBoundaries: ["不生成小模型，只生成知识提炼文档。"]
          }
        })
      };
    }
    if (roleId === "skill_reviewer") {
      return { answer: JSON.stringify({ decision: "approved", notes: ["payload stayed within model budget"] }) };
    }
    return { answer: JSON.stringify({ title: "上传文档核心提炼" }) };
  }
});
const realRuntime = createKnowledgeDistillationRuntime({
  userDataPath: tempRoot,
  runtime: {},
  modelDecisionRuntime
});
const budgetWorkbench = createKnowledgeDistillationWorkbench({
  userDataPath: tempRoot,
  knowledgeDistillationRuntime: realRuntime
});
const longUploadText = Array.from({ length: 100 }, (_, index) =>
  [
    `第 ${index + 1} 段：知识蒸馏调试面板接收上传文件后，必须经过解析、核心提炼、复核和导出阶段。`,
    "核心提炼结果需要包含关键事实、时间线、实体、决策依据、结论边界和不确定项。",
    "任务完成时必须提供 Markdown 结果文档，不能只显示完成状态。"
  ].join("")
).join("\n\n");
const budgetRawDocuments = [
  {
    title: "2026-05-01-upload-distillation-flow.md",
    text: longUploadText,
    sourcePath: "flow/upload-distillation.md",
    capturedAt: "2026-05-01T09:00:00.000Z"
  },
  {
    title: "2026-05-03-export-artifact-contract.md",
    text: [
      "Export artifact contract requires Markdown, HTML, JSON, DOCX, and package formats.",
      "The console workflow must expose a downloadable file after knowledge distillation completes.",
      "Result JSON must preserve algorithm metrics, source plan, semantic clusters, claim ledger, and external evaluation."
    ].join("\n"),
    sourcePath: "contracts/export-artifact.md",
    capturedAt: "2026-05-03T10:00:00.000Z"
  },
  {
    title: "2026-04-20-operational-risk-review.md",
    text: [
      "Risk review focuses on permissions, audit logs, failed parse jobs, missing model responses, and unsupported claims.",
      "A run cannot be marked completed when the distillation result file is absent or external evaluation data is missing.",
      "Operators need explicit failure states for parse, model, reviewer, and export stages."
    ].join("\n"),
    sourcePath: "risk/operational-review.md",
    capturedAt: "2026-04-20T08:00:00.000Z"
  }
];
const budgetCreated = await budgetWorkbench.createRun({
  rawDocuments: budgetRawDocuments,
  title: "Large upload distillation",
  query: "上传文件核心知识提炼",
  modelAlias: "deepseek-v4-flash",
  modelEnabled: true,
  strategyVersion: "timeline_then_topic_v2",
  timeDecayHalfLifeDays: 30,
  timeDecayFloor: 0.4,
  semanticClusterThreshold: 0.9,
  clusterRejectThreshold: 0.55,
  rawCorpusBatchMaxCharacters: 64000,
  tokenBudget: 24000
});
let budgetRun = null;
for (let attempt = 0; attempt < 80; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 50));
  budgetRun = await budgetWorkbench.getRun({ runId: budgetCreated.runId });
  if (budgetRun?.status === "completed" || budgetRun?.status === "failed") {
    break;
  }
}
assert.equal(budgetRun?.status, "completed", budgetRun?.error || "long upload distillation should complete");
for (const roleId of [
  "knowledge_raw_batch_extractor",
  "knowledge_skill_distiller",
  "skill_reviewer"
]) {
  assert.equal(gatewayCalls.some((call) => call.roleId === roleId), true, `${roleId} must call the model gateway`);
}
const budgetCoreStage = budgetRun.stages.find((stage) => stage.stageId === "knowledge-distillation");
assert.equal(budgetCoreStage?.status, "completed");
assert.ok(Number(budgetCoreStage?.output?.markdownLength || 0) > 500);
assert.ok(Number(budgetCoreStage?.metrics?.semanticClusterCount || 0) >= 2);
assert.equal(Number(budgetCoreStage?.metrics?.timelineOrderScore || 0), 1);
assert.ok(Number(budgetCoreStage?.metrics?.timeDecayCalibrationScore || 0) >= 0);
const budgetMarkdown = await budgetWorkbench.exportStage({
  runId: budgetCreated.runId,
  stageId: "knowledge-distillation",
  format: "markdown"
});
assert.equal(budgetMarkdown.contentType.includes("text/markdown"), true);
assert.ok(budgetMarkdown.buffer.toString("utf8").includes("上传文档核心提炼"));
const budgetJsonExport = await budgetWorkbench.exportStage({
  runId: budgetCreated.runId,
  stageId: "knowledge-distillation",
  format: "json"
});
assert.equal(budgetJsonExport.contentType.includes("application/json"), true);
const budgetJson = JSON.parse(budgetJsonExport.buffer.toString("utf8"));
const distillation = budgetJson.distillation;
assert.equal(distillation.algorithmVersion, algorithmVersion);
assert.equal(distillation.sourcePlan.protocolVersion, algorithmVersion);
assert.equal(distillation.sourcePlan.timeline.chronological, true);
assert.ok(distillation.sourcePlan.timeline.knownTimestampCount >= 3);
assert.equal(distillation.sourcePlan.halfLifeDays, 30);
assert.equal(distillation.sourcePlan.floor, 0.4);
assert.ok(distillation.sourcePlan.items.every((item) => Number.isFinite(Number(item.decayedImportanceScore))));
assert.ok(distillation.semanticClusters.length >= 2);
assert.equal(distillation.qualityReportV3.protocolVersion, algorithmVersion);
assert.equal(distillation.externalEvaluation.protocolVersion, externalEvaluationVersion);
assert.equal(distillation.externalEvaluation.method, "aggregate_data_driven_semantic_claim_coverage_v1");
assert.ok(Number(distillation.externalEvaluation.metrics.expectedClaimCount || 0) > 0);
assert.ok(Array.isArray(distillation.claimLedger.clusters));

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

const runsRoot = path.join(tempRoot, "knowledge-distillation-workbench", "runs");
const createdRunPath = (await Promise.all(
  (await fs.readdir(runsRoot)).map(async (entry) => {
    const runPath = path.join(runsRoot, entry, "run.json");
    const stored = JSON.parse(await fs.readFile(runPath, "utf8"));
    return stored.runId === created.runId ? runPath : "";
  })
)).find(Boolean);
assert.ok(createdRunPath, "created run must be persisted");
const storedRun = JSON.parse(await fs.readFile(createdRunPath, "utf8"));
const storedCoreStage = storedRun.stages.find((stage) => stage.stageId === "knowledge-distillation");
storedCoreStage.output.markdown = [
  "# Legacy export",
  "",
  "<html xmlns=\"http://www.w3.org/1999/xhtml\"><head>",
  "<meta name=\"X-TIKA:Parsed-By\" content=\"org.apache.tika.parser.DefaultParser\" />",
  "</head><body><p># Legacy Markdown",
  "",
  "&gt; quoted text",
  "",
  "- list item</p></body></html>"
].join("\n");
await fs.writeFile(createdRunPath, JSON.stringify(storedRun, null, 2));
const sanitizedLegacyMarkdown = await workbench.exportStage({
  runId: created.runId,
  stageId: "knowledge-distillation",
  format: "markdown"
});
const sanitizedLegacyText = sanitizedLegacyMarkdown.buffer.toString("utf8");
assert.doesNotMatch(sanitizedLegacyText, /X-TIKA|<html|<meta/i);
assert.match(sanitizedLegacyText, /# Legacy Markdown/);
assert.match(sanitizedLegacyText, /> quoted text/);

console.log("knowledge distillation workbench verification passed");
