import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const rawText = await response.text();
  const payload = rawText.trim() ? JSON.parse(rawText) : {};
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${rawText}`);
  }
  return payload;
}

async function waitForJob(baseUrl, jobId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const job = await fetchJson(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}`);
    if (job.status === "completed") {
      return job;
    }
    if (job.status === "failed") {
      throw new Error(job.error || "Job failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Job did not complete in time.");
}

async function createKnowledgeJob(baseUrl, title, body) {
  const job = await fetchJson(`${baseUrl}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputText: [`# ${title}`, "", body].join("\n"),
      settings: {
        knowledgeCoreEnabled: true
      }
    })
  });
  await waitForJob(baseUrl, job.id);
  return job;
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-multi-agent-summarization-"));
const server = await startHttpServer({
  userDataPath,
  runtimeOptions: {
    profile: "minimal"
  }
});
await installAuthenticatedFetch(server);

try {
  await createKnowledgeJob(
    server.url,
    "合同续签与发票抬头",
    "合同续签需要确认发票抬头、盖章顺序、预算审批和供应商最终报价。财务团队需要在 2026-05-10 前确认。"
  );
  await createKnowledgeJob(
    server.url,
    "采购付款与风险",
    "采购付款涉及 120000 元预算，供应商报价需要二次核对，若发票抬头错误会影响付款审批。"
  );

  const profiles = await fetchJson(`${server.url}/api/context/profiles`);
  assert.equal(profiles.protocolVersion, "splitall.context.v1");
  assert.equal(profiles.profiles.some((profile) => profile.profileId === "balanced"), true);

  const created = await fetchJson(`${server.url}/api/knowledge/summarization/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "合同 供应商 发票抬头 预算审批",
      limit: 12,
      contextProfileId: "small-context",
      includePrivate: true
    })
  });
  assert.equal(created.protocolVersion, "splitall.summarization.v1");
  assert.equal(created.coordinatorProtocolVersion, "splitall.multi-agent.v1");
  assert.equal(created.graphRuntime, "langgraph-js");
  assert.equal(created.run.status, "completed");
  assert.ok(created.workspace.workspaceId);
  assert.ok(created.workspaceSummary.submissionCount >= 1);
  assert.ok(created.coverage.totalEvidence >= 1);
  assert.ok(created.coverage.coveredEvidence >= 1);
  assert.ok(created.artifacts.some((artifact) => artifact.level === "ExecutiveSummary"));

  const executive = created.artifacts.find((artifact) => artifact.level === "ExecutiveSummary");
  assert.match(executive.content, /\[[^\]]+\]/);
  assert.equal(executive.coverageReport.totalEvidence, created.coverage.totalEvidence);

  const fetched = await fetchJson(
    `${server.url}/api/knowledge/summarization/runs/${encodeURIComponent(created.run.runId)}?includePrivate=1`
  );
  assert.equal(fetched.run.runId, created.run.runId);
  assert.ok(fetched.workspaceSummary.artifactCount >= 1);

  const workspace = await fetchJson(
    `${server.url}/api/agent-workspaces/${encodeURIComponent(created.workspace.workspaceId)}?includePrivate=1`
  );
  assert.equal(workspace.workspace.workspaceId, created.workspace.workspaceId);
  assert.ok(workspace.privateStates.length >= 1);
  assert.ok(workspace.issues.every((issue) => issue.runId === created.run.runId));

  const approved = await fetchJson(
    `${server.url}/api/knowledge/summarization/runs/${encodeURIComponent(created.run.runId)}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve"
      })
    }
  );
  assert.equal(approved.run.status, "approved");
  assert.equal(approved.artifacts.every((artifact) => artifact.status === "approved"), true);
} finally {
  await server.close();
  await fs.rm(userDataPath, {
    recursive: true,
    force: true
  });
}

console.log("Multi-agent summarization verification passed.");
