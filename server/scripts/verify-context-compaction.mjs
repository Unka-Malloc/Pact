import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import {
  CONTEXT_COMPACTION_PROTOCOL_VERSION,
  buildMessageGraph,
  chooseCompactionCutPoint,
  computeCompactionBudget,
  createContextCompactionRuntime
} from "../platform/specialized/agent/agent-context/context-compaction-runtime/index.mjs";
import { createContextRuntime } from "../platform/specialized/agent/agent-context/context-runtime/index.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const rawText = await response.text();
  return {
    status: response.status,
    payload: rawText.trim() ? JSON.parse(rawText) : {}
  };
}

function runCli(serverUrl, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        new URL("./splitall.mjs", import.meta.url).pathname,
        ...args,
        "--server-url",
        serverUrl
      ],
      {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `splitall CLI exited with ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch (error) {
        reject(new Error(`CLI JSON parse failed: ${error.message}\n${stdout}\n${stderr}`));
      }
    });
  });
}

function longText(label, repeat = 120) {
  return Array.from({ length: repeat }, (_, index) =>
    `${label} ${index}: 必须保留 evidence:ev-critical，风险 risk-blocked，日期 2026-05-02，金额 $1,200。`
  ).join("\n");
}

function sampleMessages() {
  return [
    {
      id: "m1",
      role: "user",
      apiRoundId: "round-1",
      content: `${longText("任务背景", 80)}\ntoken=redaction-test-value-12345\n路径 /Users/unka/private/secret.json 必须脱敏。`
    },
    {
      id: "m2",
      role: "assistant",
      apiRoundId: "round-1",
      content: "Decision: use ContextCompactionRuntime and never split tool pairs."
    },
    {
      id: "m3",
      role: "user",
      apiRoundId: "round-2",
      content: "TODO: add session memory, boundary resume, audit redaction, and knowledge reference vocab:v7."
    },
    {
      id: "m4",
      role: "assistant",
      apiRoundId: "round-2",
      content: longText("旧工具结果前置摘要", 35),
      blocks: [{ type: "tool_result", tool_use_id: "old-tool", content: longText("旧工具结果", 80) }],
      toolUseId: "old-tool",
      type: "tool_result"
    },
    {
      id: "m5",
      role: "assistant",
      apiRoundId: "round-tool",
      content: "Calling maintenance tool.",
      blocks: [{ type: "tool_use", id: "tool-1", name: "knowledge.health", input: { scope: "mail" } }]
    },
    {
      id: "m6",
      role: "tool",
      apiRoundId: "round-tool",
      toolUseId: "tool-1",
      content: `${longText("tool result body", 120)}\nartifactRef=artifact-large-1`,
      attachments: [
        {
          name: "large-result.json",
          path: "/Users/unka/private/large-result.json",
          text: longText("attachment", 120)
        }
      ]
    },
    {
      id: "m7",
      role: "assistant",
      apiRoundId: "round-3",
      content: "Recent failure must stay visible: error current import failed."
    },
    {
      id: "m8",
      role: "user",
      apiRoundId: "round-4",
      content: "最新用户意图：继续实现完整上下文压缩。"
    }
  ];
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-context-compaction-"));

try {
  const profile = {
    profileId: "compaction-small",
    contextWindowTokens: 4096,
    outputReserveTokens: 256,
    compression: {
      enabled: true,
      mode: "hybrid",
      targetRatio: 0.2,
      summaryMaxTokens: 700
    },
    modelCompression: {
      enabled: true,
      alias: "mock",
      maxOutputTokens: 400
    },
    compactionPolicy: {
      summaryReserveTokens: 512,
      reservedBufferTokens: 512,
      warningBufferTokens: 900,
      recentMessageProtectionCount: 3,
      recentTurnProtectionCount: 2,
      deterministicTargetRatio: 0.24,
      ptlRetryLimit: 3,
      modelMaxInputTokens: 50000,
      modelMaxOutputTokens: 420,
      maxToolResultTokens: 160,
      maxAttachmentTokens: 120,
      reinjectionBudgetTokens: 360
    }
  };
  const messages = sampleMessages();
  const graph = buildMessageGraph(messages);
  assert.equal(graph.toolGroups.some((group) => group.id === "tool-1"), true);
  const budget = computeCompactionBudget(profile);
  assert.equal(budget.effectiveWindowTokens, 3328);
  assert.equal(budget.autoCompactThresholdTokens, 2816);
  const cutPoint = chooseCompactionCutPoint(messages, { profile });
  assert.equal(cutPoint.proposedCutIndex, 5);
  assert.equal(cutPoint.cutIndex, 4);
  assert.equal(cutPoint.adjustments.some((item) => item.reason === "tool_chain_protection"), true);

  const directRuntime = createContextCompactionRuntime({ userDataPath });
  const deterministic = await directRuntime.run({
    profile: {
      ...profile,
      modelCompression: { enabled: false },
      compactionPolicy: {
        ...profile.compactionPolicy,
        strategy: "deterministic"
      }
    },
    sessionId: "deterministic",
    messages,
    taskBrief: "实现完整上下文压缩",
    runtimeState: {
      activePlan: ["M0", "M1", "M2"],
      enabledTools: ["context.compaction.run"],
      currentFiles: ["/Users/unka/DevSpace/Unka-Malloc/splitall/server/platform/specialized/agent/agent-context/context-compaction-runtime/index.mjs"],
      knowledgeReference: "expert-vocabulary@v7",
      userConstraints: ["Do not copy Claude Code source"]
    }
  });
  assert.equal(deterministic.protocolVersion, CONTEXT_COMPACTION_PROTOCOL_VERSION);
  assert.equal(deterministic.strategy, "deterministic");
  assert.equal(deterministic.compacted, true);
  assert.equal(deterministic.boundary.type, "compact_boundary");
  assert.ok(deterministic.tokenReport.savingsRatio > 0);
  assert.equal(/redaction-test-value-12345/.test(deterministic.summary), false);
  assert.equal(/\/Users\/unka\/private/.test(deterministic.summary), false);
  assert.ok(deterministic.reinjection.items.some((item) => item.key === "taskBrief"));
  assert.ok(deterministic.microCompaction.changedCount > 0);
  assert.ok(deterministic.attachmentsToReinject.length > 0);

  const resumed = directRuntime.resumeTranscript({
    messages: [
      { id: "old-1", role: "user", content: "old" },
      { id: "old-2", role: "assistant", content: "old" },
      deterministic.boundaryMessage,
      ...deterministic.messagesToKeep
    ]
  });
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.skippedMessageCount, 2);
  assert.equal(resumed.messages[0].type, "compact_boundary");

  const modelRuntime = createContextRuntime({
    userDataPath: path.join(userDataPath, "model-runtime"),
    modelCompressor: async ({ messages: attemptMessages }) => {
      if (attemptMessages.some((message) => message.apiRoundId === "round-1")) {
        throw new Error("prompt_too_large");
      }
      return {
        summary: JSON.stringify({
          summary: "Model summary keeps evidence:ev-critical, TODOs, risk-blocked, vocab:v7, and tool-1.",
          constraints: ["never split tool pairs"],
          decisions: ["use ContextCompactionRuntime"],
          risks: ["risk-blocked"],
          todos: ["add boundary resume"],
          evidenceRefs: ["evidence:ev-critical"],
          fileRefs: ["server/platform/specialized/agent/agent-context/context-compaction-runtime/index.mjs"],
          knowledgeRefs: ["vocab:v7"]
        })
      };
    }
  });
  await modelRuntime.saveProfiles({ profiles: [profile] });
  const modelRun = await modelRuntime.runCompaction({
    contextProfileId: "compaction-small",
    sessionId: "model-session",
    messages,
    taskBrief: "模型辅助上下文压缩",
    useSessionMemory: false
  });
  assert.equal(modelRun.strategy, "model_assisted");
  assert.equal(modelRun.modelEvents[0].attempts.length >= 2, true);
  assert.match(modelRun.summary, /ev-critical/);

  const memoryRun = await modelRuntime.runCompaction({
    contextProfileId: "compaction-small",
    sessionId: "model-session",
    messages,
    taskBrief: "模型辅助上下文压缩"
  });
  assert.equal(memoryRun.strategy, "session_memory");
  const memory = await modelRuntime.listSessionMemory({ sessionId: "model-session" });
  assert.ok(memory.records.length >= 1);
  const cleared = await modelRuntime.clearSessionMemory({ sessionId: "model-session", reason: "verify" });
  assert.equal(cleared.ok, true);
  const afterClear = await modelRuntime.runCompaction({
    contextProfileId: "compaction-small",
    sessionId: "model-session",
    messages,
    taskBrief: "模型辅助上下文压缩",
    useSessionMemory: true
  });
  assert.notEqual(afterClear.strategy, "session_memory");

  let failingCalls = 0;
  const fallbackRuntime = createContextRuntime({
    userDataPath: path.join(userDataPath, "fallback-runtime"),
    modelCompressor: async () => {
      failingCalls += 1;
      throw new Error("bad model schema");
    }
  });
  await fallbackRuntime.saveProfiles({
    profiles: [
      {
        ...profile,
        profileId: "fallback-small",
        compactionPolicy: {
          ...profile.compactionPolicy,
          strategy: "model_assisted",
          maxConsecutiveFailures: 3
        }
      }
    ]
  });
  for (let index = 0; index < 3; index += 1) {
    const run = await fallbackRuntime.runCompaction({
      contextProfileId: "fallback-small",
      sessionId: `fallback-${index}`,
      messages,
      useSessionMemory: false
    });
    assert.equal(run.strategy, "deterministic");
    assert.equal(run.degraded, true);
  }
  const callsBeforeCircuit = failingCalls;
  const circuit = await fallbackRuntime.runCompaction({
    contextProfileId: "fallback-small",
    sessionId: "fallback-circuit",
    messages,
    useSessionMemory: false
  });
  assert.equal(circuit.strategy, "deterministic");
  assert.equal(circuit.circuitBreaker.open, true);
  assert.equal(failingCalls, callsBeforeCircuit);

  const assembled = await modelRuntime.assemble({
    contextProfileId: "compaction-small",
    sessionId: "assemble-session",
    taskBrief: "验证 ContextRuntime assemble 集成",
    history: longText("assemble history", 120),
    recentTurns: messages.slice(4),
    toolState: {
      previousToolResults: [
        { tool: "knowledge.health", ok: true, count: 3 }
      ]
    },
    record: false
  });
  assert.equal(assembled.compaction.protocolVersion, CONTEXT_COMPACTION_PROTOCOL_VERSION);
  assert.ok(assembled.budgetReport.compaction);

  const serverDataPath = path.join(userDataPath, "server");
  const server = await startHttpServer({
    userDataPath: serverDataPath,
    runtimeOptions: { profile: "minimal" }
  });
  try {
    await installAuthenticatedFetch(server);
    const preview = await requestJson(`${server.url}/api/context/compaction/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contextProfileId: "balanced",
        sessionId: "http-preview",
        messages,
        force: true
      })
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.payload.preview, true);

    const httpRun = await requestJson(`${server.url}/api/context/compaction/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contextProfileId: "balanced",
        sessionId: "http-run",
        messages,
        force: true
      })
    });
    assert.equal(httpRun.status, 200);
    assert.equal(httpRun.payload.compacted, true);

    const rpcRun = await requestJson(`${server.url}/api/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "context-run",
        method: "context.compaction.run",
        params: {
          contextProfileId: "balanced",
          sessionId: "rpc-run",
          messages,
          force: true
        }
      })
    });
    assert.equal(rpcRun.status, 200);
    assert.equal(rpcRun.payload.result.compacted, true);

    const cliRecords = await runCli(server.url, ["context", "compaction", "records", "--limit", "10"]);
    assert.equal(Array.isArray(cliRecords.records), true);

    const clearMemory = await requestJson(`${server.url}/api/context/session-memory/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "http-run",
        reason: "verify-clear"
      })
    });
    assert.equal(clearMemory.status, 200);
    assert.equal(clearMemory.payload.ok, true);

    const audit = await requestJson(`${server.url}/api/auth/audit?limit=200`);
    assert.equal(audit.status, 200);
    assert.ok(audit.payload.items.some((item) => item.operationId === "context.compaction.run"));
    assert.ok(audit.payload.items.some((item) => item.operationId === "context.session_memory.clear"));
    const auditText = JSON.stringify(audit.payload.items);
    assert.equal(/redaction-test-value-12345/.test(auditText), false);
    assert.equal(/\/Users\/unka\/private/.test(auditText), false);
  } finally {
    await server.close();
  }
} finally {
  await fs.rm(userDataPath, {
    recursive: true,
    force: true
  });
}

console.log("Context compaction verification passed.");
