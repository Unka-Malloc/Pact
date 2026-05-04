import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CONTEXT_RUNTIME_PROTOCOL_VERSION,
  createContextRuntime,
  estimateTokens
} from "../modules/ContextRuntime/index.mjs";

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-context-runtime-"));
const runtime = createContextRuntime({ userDataPath });

try {
  const defaults = await runtime.listProfiles();
  assert.equal(defaults.protocolVersion, CONTEXT_RUNTIME_PROTOCOL_VERSION);
  assert.equal(defaults.profiles.some((profile) => profile.profileId === "balanced"), true);

  const saved = await runtime.saveProfiles({
    profiles: [
      {
        profileId: "verify-small",
        label: "Verify Small Context",
        modelAlias: "qwen-v3-32b",
        contextWindowTokens: 4096,
        outputReserveTokens: 256,
        toolReserveTokens: 0,
        fixedMemoryBudget: 256,
        knowledgeBudget: 2200,
        historyBudget: 1800,
        recentTurnBudget: 600,
        compression: {
          enabled: true,
          mode: "deterministic",
          threshold: 0.1,
          targetRatio: 0.1,
          protectLastNTurns: 2,
          summaryMaxTokens: 900,
          strategy: "deterministic-extractive"
        },
        rankingWeights: {
          queryRelevance: 0.35,
          humanExpertBoost: 0.25
        },
        protectedEvidenceFields: ["evidenceId", "sourceLocator", "snippet", "when", "amount"]
      }
    ]
  });
  assert.equal(saved.profiles.some((profile) => profile.profileId === "verify-small"), true);

  const evidence = Array.from({ length: 80 }, (_, index) => ({
    evidenceId: `ev-${index}`,
    title: `合同证据 ${index}`,
    claim: `第 ${index} 条证据涉及合同、金额、日期、负责人和风险。`,
    snippet: "这是一个较长的证据片段，用来验证上下文预算裁剪和引用保留。".repeat(20),
    sourceLocator: `document-${index}`,
    confidence: index === 2 ? 0.99 : 0.4,
    humanExpert: index === 2,
    updatedAt: `2026-04-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`
  }));
  const pack = await runtime.assemble({
    contextProfileId: "verify-small",
    inputSource: "verify-context-runtime",
    roleId: "Reviewer",
    taskBrief: "总结合同金额和日期风险",
    systemMemory: "本地记忆规则：必须保护证据编号和来源定位。",
    retrievedEvidence: evidence,
    expertGuidance: [
      {
        feedbackId: "gold-1",
        label: "优先检查合同金额",
        instruction: "先保留有人类确认的金额和日期证据。",
        evidenceRefs: ["ev-2"],
        context: { gold: true, humanExpert: true }
      }
    ],
    history: "历史消息包含很多无关信息。\n".repeat(500),
    recentTurns: Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      content: `recent turn ${index} ` + "内容 ".repeat(80)
    })),
    workspaceState: {
      submissions: [
        {
          status: "accepted",
          type: "evidenceCard",
          confidence: 0.9,
          payload: {
            claim: "accepted claim"
          },
          evidenceRefs: ["ev-1"]
        }
      ]
    }
  });
  assert.equal(pack.profileId, "verify-small");
  assert.equal(pack.budgetReport.compressed, true);
  assert.ok(pack.budgetReport.droppedKnowledgeCount > 0);
  assert.ok(pack.citations.length > 0);
  assert.ok(pack.retrievedKnowledge.length < evidence.length);
  assert.ok(pack.contextBuildRecordId);
  assert.ok(pack.memoryBlocks.length > 0);
  assert.equal(pack.expertGuidance.length, 1);
  assert.ok(pack.criticalEvidenceIndex.length > 0);
  assert.ok(pack.evidencePack.some((item) => item.evidenceId === "ev-2"), "human-confirmed evidence should survive compression");
  assert.ok(pack.tailChecklist.evidenceIds.includes("ev-2"));
  assert.equal(pack.budgetReport.compressionMode, "deterministic");

  const records = await runtime.listBuildRecords({ limit: 5 });
  assert.equal(records.protocolVersion, CONTEXT_RUNTIME_PROTOCOL_VERSION);
  assert.ok(records.records.some((record) => record.recordId === pack.contextBuildRecordId));

  const preview = await runtime.preview({
    contextProfileId: "verify-small",
    taskBrief: "预览上下文",
    retrievedEvidence: evidence.slice(0, 3)
  });
  assert.equal(preview.protocolVersion, CONTEXT_RUNTIME_PROTOCOL_VERSION);
  assert.ok(preview.contextPack.budgetReport);

  const evaluation = await runtime.runEvaluation({
    profiles: ["verify-small"],
    cases: [
      {
        caseId: "contract-risk",
        taskBrief: "总结合同金额和日期风险",
        retrievedEvidence: evidence,
        requiredEvidenceIds: ["ev-2"]
      }
    ]
  });
  assert.equal(evaluation.protocolVersion, CONTEXT_RUNTIME_PROTOCOL_VERSION);
  assert.equal(evaluation.results[0].requiredEvidenceRecall, 1);

  const compacted = await runtime.compact({
    contextProfileId: "verify-small",
    text: [
      "普通背景信息。",
      "关键证据：合同需要预算审批。",
      "风险：发票抬头未确认。",
      "负责人：财务团队。"
    ].join("\n").repeat(120),
    targetTokens: 300
  });
  assert.equal(compacted.protocolVersion, CONTEXT_RUNTIME_PROTOCOL_VERSION);
  assert.ok(compacted.summaryTokens <= compacted.sourceTokens);
  assert.ok(estimateTokens(compacted.summary) <= 900);

  const modelRuntime = createContextRuntime({
    userDataPath: path.join(userDataPath, "model-assisted"),
    modelCompressor: async ({ text, citations }) => ({
      summary: `模型压缩摘要，保留引用 ${citations.join(", ")}。\n${String(text).slice(0, 240)}`
    })
  });
  await modelRuntime.saveProfiles({
    profiles: [
      {
        profileId: "verify-model-assisted",
        contextWindowTokens: 4096,
        outputReserveTokens: 256,
        toolReserveTokens: 0,
        knowledgeBudget: 1200,
        historyBudget: 1200,
        compression: {
          enabled: true,
          mode: "hybrid",
          threshold: 0.1,
          targetRatio: 0.2,
          summaryMaxTokens: 900,
          strategy: "hybrid-extractive-abstractive"
        },
        modelCompression: {
          enabled: true,
          alias: "mock-compressor",
          maxOutputTokens: 400
        }
      }
    ]
  });
  const modelPack = await modelRuntime.assemble({
    contextProfileId: "verify-model-assisted",
    taskBrief: "验证模型辅助压缩",
    history: "evidence::ev-2 这是一段很长的历史。".repeat(300),
    retrievedEvidence: evidence.slice(0, 5)
  });
  assert.equal(modelPack.budgetReport.modelCompression.used, true);
  assert.equal(modelPack.budgetReport.modelCompression.degraded, false);
  assert.match(modelPack.compressedHistory, /ev-2/);
} finally {
  await fs.rm(userDataPath, {
    recursive: true,
    force: true
  });
}

console.log("Context runtime verification passed.");
