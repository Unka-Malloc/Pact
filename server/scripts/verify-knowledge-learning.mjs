import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";
import { createLanceDbVectorStore } from "../platform/specialized/knowledge/retrieval/vector-store/LanceDB/index.mjs";

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

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-knowledge-learning-"));
const server = await startHttpServer({
  userDataPath,
  runtimeOptions: {
    profile: "minimal"
  }
});
await installAuthenticatedFetch(server);

try {
  const lanceDbAdapter = createLanceDbVectorStore({
    userDataPath,
    settings: {}
  });
  const lanceUpsert = await lanceDbAdapter.onBatchCompleted({
    batchId: "verify-lancedb-batch",
    jobId: "verify-lancedb-job",
    result: {
      generatedAt: "2026-04-29T00:00:00.000Z",
      knowledge: {
        chunks: [
          {
            chunkId: "chunk-1",
            itemId: "transaction::alpha",
            text: "LanceDB adapter idempotent upsert probe",
            snippet: "LanceDB adapter idempotent upsert probe",
            metadata: {
              transactionId: "alpha"
            }
          }
        ]
      }
    }
  });
  assert.equal(lanceUpsert.recordCount, 1);
  const lanceSecondUpsert = await lanceDbAdapter.onBatchCompleted({
    batchId: "verify-lancedb-batch",
    jobId: "verify-lancedb-job",
    result: {
      knowledge: {
        chunks: [
          {
            chunkId: "chunk-1",
            itemId: "transaction::alpha",
            text: "LanceDB adapter idempotent upsert probe",
            snippet: "LanceDB adapter idempotent upsert probe"
          }
        ]
      }
    }
  });
  assert.equal(lanceSecondUpsert.upserted, 1);
  const lanceSearch = lanceDbAdapter.search({
    query: "idempotent upsert",
    limit: 5
  });
  assert.equal(lanceSearch.results.length, 1);
  assert.equal(lanceDbAdapter.health().ok, true);

  const learningHealth = await fetchJson(`${server.url}/api/knowledge/learning/health`);
  assert.equal(learningHealth.ok, true);
  assert.equal(learningHealth.activeProfile.profileId, "balanced");
  assert.equal(learningHealth.boundaries.autoAppliesCanonicalFacts, false);
  assert.equal(learningHealth.learningRuntime.noImplicitDownloads, true);

  const createdJob = await fetchJson(`${server.url}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputText: [
        "# Adaptive Knowledge Probe",
        "",
        "Alpha contract renewal requires a finance approval, invoice title confirmation, and contract seal ordering.",
        "The expected learning query is adaptive contract renewal."
      ].join("\n"),
      settings: {
        knowledgeCoreEnabled: true
      }
    })
  });
  await waitForJob(server.url, createdJob.id);

  const search = await fetchJson(`${server.url}/api/knowledge/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: "adaptive contract renewal",
      learningEnabled: true,
      explain: true,
      limit: 5
    })
  });
  assert.equal(search.learningEnabled, true);
  assert.equal(search.retrievalProfileId, "balanced");
  assert.ok(search.explain.candidateCount >= 1);
  assert.ok(search.items.length >= 1);

  const selected = search.items[0];
  const feedback = await fetchJson(`${server.url}/api/knowledge/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      feedbackId: "verify-positive",
      clientId: "verify-client",
      query: "adaptive contract renewal",
      action: "open",
      itemId: selected.itemId,
      evidenceId: selected.evidenceId,
      resultRank: 1,
      context: {
        reasons: selected.reasons,
        retrievalProfileId: search.retrievalProfileId
      },
      createdAt: "2026-04-29T00:00:00.000Z"
    })
  });
  assert.equal(feedback.feedback.action, "open");

  const miss = await fetchJson(`${server.url}/api/knowledge/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      feedbackId: "verify-search-miss",
      clientId: "verify-client",
      query: "missing invoice title owner",
      action: "searchMiss",
      resultRank: 0,
      context: {
        evidenceRefs: []
      },
      createdAt: "2026-04-29T00:01:00.000Z"
    })
  });
  assert.equal(miss.feedback.action, "searchMiss");

  const learningRun = await fetchJson(`${server.url}/api/knowledge/learning/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      feedbackWindowHours: 24 * 365,
      autoApply: true
    })
  });
  assert.equal(learningRun.status, "completed");
  assert.equal(learningRun.feedbackCount, 2);
  assert.ok(learningRun.autoAppliedProfileVersion >= 2);
  assert.ok(learningRun.generatedSuggestionCount >= 1);

  const suggestions = await fetchJson(`${server.url}/api/knowledge/suggestions?status=pending`);
  assert.ok(suggestions.items.some((item) => item.type === "rankingRule"));
  const suggestion = suggestions.items.find((item) => item.type === "rankingRule");
  const resolved = await fetchJson(
    `${server.url}/api/knowledge/suggestions/${encodeURIComponent(suggestion.suggestionId)}/resolve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        resolution: "reject"
      })
    }
  );
  assert.equal(resolved.status, "rejected");

  const healthAfterRun = await fetchJson(`${server.url}/api/knowledge/learning/health`);
  assert.equal(healthAfterRun.ok, true);
  assert.ok(healthAfterRun.activeProfile.version >= 2);
  assert.equal(healthAfterRun.boundaries.requiresReviewForEntityRelationsTaxonomy, true);
} finally {
  await server.close();
  await fs.rm(userDataPath, {
    recursive: true,
    force: true
  });
}

console.log("Knowledge learning verification passed.");
