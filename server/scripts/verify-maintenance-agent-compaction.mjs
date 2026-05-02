import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveSettings } from "../config.mjs";
import { startHttpServer } from "../http-server.mjs";
import { createContextRuntime } from "../modules/ContextRuntime/index.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const rawText = await response.text();
  return {
    status: response.status,
    payload: rawText.trim() ? JSON.parse(rawText) : {}
  };
}

function startPlannerServer() {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    requests.push(body);
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      answer: JSON.stringify({
        intent: "health_smoke",
        summary: "使用压缩后的维护上下文执行健康巡检。",
        risk: "read_only",
        requiresApproval: false,
        approvalReason: "",
        steps: [
          {
            toolId: "system.health",
            input: {},
            risk: "read_only",
            reason: "验证维护智能体真实 chat 路径经过上下文压缩。"
          }
        ]
      })
    }));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}/agent`,
        requests,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-maintenance-compaction-"));
try {
  const runtime = createContextRuntime({ userDataPath });
  await runtime.saveProfiles({
    profiles: [
      {
        profileId: "maintenance-compaction",
        contextWindowTokens: 4096,
        outputReserveTokens: 256,
        compression: {
          mode: "deterministic",
          summaryMaxTokens: 600
        },
        compactionPolicy: {
          strategy: "deterministic",
          summaryReserveTokens: 512,
          reservedBufferTokens: 512,
          recentMessageProtectionCount: 2,
          reinjectionBudgetTokens: 320
        }
      }
    ]
  });

  const messages = [
    {
      id: "maint-1",
      role: "user",
      apiRoundId: "maint-round-1",
      content: "管理员要求：检查服务端健康、失败任务、知识库健康；repair_write 必须审批。".repeat(220)
    },
    {
      id: "maint-2",
      role: "assistant",
      apiRoundId: "maint-round-1",
      content: "Decision: use health_smoke first, then knowledge_maintenance_review if risk is safe."
    },
    {
      id: "maint-3",
      role: "tool",
      apiRoundId: "maint-round-2",
      toolUseId: "maintenance-tool-health",
      content: "system.health output ok; jobs.list found failed job job-123; knowledge.health warns stale index.".repeat(160)
    },
    {
      id: "maint-4",
      role: "user",
      apiRoundId: "maint-round-3",
      content: "最新请求：继续巡检，但不要执行 destructive 操作。"
    }
  ];
  const result = await runtime.runCompaction({
    contextProfileId: "maintenance-compaction",
    sessionId: "maintenance-agent-session",
    messages,
    taskBrief: "服务端维护智能体巡检",
    runtimeState: {
      maintenanceRun: {
        runId: "maintenance_run_verify",
        status: "running",
        risk: "safe_write"
      },
      activePlan: [
        "system.health",
        "runtime.info",
        "jobs.list",
        "knowledge.health"
      ],
      enabledTools: [
        "system.health",
        "runtime.info",
        "storage.summary",
        "jobs.list",
        "knowledge.health",
        "knowledge.maintenance.run"
      ],
      operationCatalog: [
        {
          id: "knowledge.reindex",
          risk: "repair_write",
          requiresApproval: true
        }
      ],
      recentError: "knowledge.health stale index warning",
      userConstraints: ["destructive operations are forbidden"]
    }
  });
  assert.equal(result.compacted, true);
  assert.match(result.summary, /repair_write|审批|destructive|health_smoke|knowledge/i);
  assert.ok(result.reinjection.items.some((item) => item.key === "maintenanceRun"));
  assert.ok(result.reinjection.items.some((item) => item.key === "enabledTools"));
  assert.ok(result.reinjection.items.some((item) => item.key === "operationCatalog"));
  assert.equal(result.boundary.strategy, "deterministic");

  const records = await runtime.listCompactionRecords({ limit: 10 });
  assert.ok(records.records.some((record) => record.boundaryId === result.boundary.boundaryId));

  const plannerServer = await startPlannerServer();
  const serverDataPath = path.join(userDataPath, "server");
  await saveSettings(serverDataPath, {
    defaultModelProvider: "custom-http",
    customModelAlias: "maintenance-planner",
    customModelLabel: "Maintenance Planner",
    modelLibraryEntries: ["custom-http"],
    customHttpAdapter: {
      provider: "custom-http",
      alias: "maintenance-planner",
      url: plannerServer.url,
      token: "maintenance-planner-token",
      agentName: "maintenance-planner",
      timeoutMs: 30000
    },
    agentGateway: {
      provider: "custom-http",
      alias: "maintenance-planner",
      url: plannerServer.url,
      token: "maintenance-planner-token",
      agentName: "maintenance-planner",
      timeoutMs: 30000
    }
  });
  const server = await startHttpServer({
    userDataPath: serverDataPath,
    runtimeOptions: { profile: "minimal" }
  });
  try {
    await installAuthenticatedFetch(server);
    const settingsUpdate = await requestJson(`${server.url}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultModelProvider: "custom-http",
        customModelAlias: "maintenance-planner",
        customModelLabel: "Maintenance Planner",
        modelLibraryEntries: ["custom-http"],
        customHttpAdapter: {
          provider: "custom-http",
          alias: "maintenance-planner",
          url: plannerServer.url,
          token: "maintenance-planner-token",
          agentName: "maintenance-planner",
          timeoutMs: 30000
        },
        agentGateway: {
          provider: "custom-http",
          alias: "maintenance-planner",
          url: plannerServer.url,
          token: "maintenance-planner-token",
          agentName: "maintenance-planner",
          timeoutMs: 30000
        }
      })
    });
    assert.equal(settingsUpdate.status, 200);
    const configUpdate = await requestJson(`${server.url}/api/maintenance-agent/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
        plannerMode: "gateway",
        autoApproveRisk: "safe_write",
        schedules: []
      })
    });
    assert.equal(configUpdate.status, 200);
    const chat = await requestJson(`${server.url}/api/maintenance-agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "请根据此前上下文继续巡检。",
        sessionId: "maintenance-chat-compaction",
        contextCompaction: { force: true },
        history: "管理员硬约束：不得执行 destructive 操作；repair_write 必须审批；证据 maint-evidence-42。".repeat(260),
        recentTurns: [
          {
            role: "assistant",
            content: "上一轮发现 maint-risk-stale-index，需要继续 read_only 巡检。"
          }
        ]
      })
    });
    assert.equal(chat.status, 200, JSON.stringify(chat.payload));
    assert.equal(chat.payload.run.status, "completed");
    assert.ok(plannerServer.requests.length >= 1);
    const prompt = String(plannerServer.requests.at(-1).question || "");
    assert.match(prompt, /维护智能体对话上下文压缩摘要/);
    assert.match(prompt, /maint-evidence-42|maint-risk-stale-index/);
    const compactRecords = await requestJson(`${server.url}/api/context/compaction/records?limit=20`);
    assert.equal(compactRecords.status, 200);
    assert.ok(compactRecords.payload.records.some((record) => record.source === "maintenance-agent-planner"));
  } finally {
    await server.close();
    await plannerServer.close();
  }
} finally {
  await fs.rm(userDataPath, { recursive: true, force: true });
}

console.log("Maintenance agent compaction verification passed.");
