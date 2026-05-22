#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  listCapacityBenchmarkTargets,
  PERFORMANCE_CAPACITY_PROTOCOL_VERSION,
  runPerformanceCapacityBenchmark
} from "../platform/specialized/knowledge/performance/capacity-benchmark/index.mjs";
import { SERVER_API_OPERATIONS } from "../platform/common/operation-dispatcher/operation-registry.mjs";
import { createToolCatalog } from "../platform/specialized/capabilities/tools/tool-management-core/catalog.mjs";

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-performance-capacity-"));

try {
  const targets = listCapacityBenchmarkTargets();
  assert.equal(targets.ok, true);
  assert.equal(targets.protocolVersion, PERFORMANCE_CAPACITY_PROTOCOL_VERSION);
  assert.ok(targets.profiles.some((profile) => profile.profileId === "smoke"));
  assert.ok(targets.profiles.some((profile) => profile.profileId === "production"));

  const benchmark = await runPerformanceCapacityBenchmark({
    userDataPath,
    profileId: "smoke",
    targets: {
      documentCount: 6,
      pagesPerDocument: 2,
      imageAssetCount: 2,
      concurrentUploads: 2,
      queryCount: 4,
      externalSyncItemCount: 2,
      maxIngestMs: 5000,
      maxSearchP95Ms: 1000,
      minSearchQps: 1,
      minDistillationDocsPerSec: 1,
      maxExternalSyncMs: 3000,
      maxEstimatedCostUsd: 0.01
    }
  });
  assert.equal(benchmark.protocolVersion, PERFORMANCE_CAPACITY_PROTOCOL_VERSION);
  assert.equal(benchmark.status, "pass");
  assert.equal(benchmark.metrics.ingest.documentCount, 6);
  assert.equal(benchmark.metrics.ingest.concurrentUploadTarget, 2);
  assert.equal(benchmark.metrics.search.queryCount, 4);
  assert.ok(benchmark.metrics.search.p95Ms >= 0);
  assert.ok(benchmark.metrics.search.qps > 0);
  assert.equal(benchmark.metrics.search.missingQueryRecovered, true);
  assert.equal(benchmark.metrics.externalSync.itemCount, 2);
  assert.equal(benchmark.metrics.externalSync.rateLimitInjected, true);
  assert.ok(benchmark.metrics.distillation.throughputDocsPerSec > 0);
  assert.ok(benchmark.thresholds.checks.every((check) => check.status === "pass"));

  const operations = SERVER_API_OPERATIONS;
  for (const operationId of [
    "performance.capacity.targets",
    "performance.capacity.benchmark"
  ]) {
    assert.ok(operations.some((operation) => operation.id === operationId), `missing operation ${operationId}`);
  }

  const toolCatalog = createToolCatalog({ operations });
  for (const toolId of [
    "pact.performance.capacity.targets",
    "pact.performance.capacity.benchmark"
  ]) {
    assert.ok(toolCatalog.tools.some((tool) => tool.id === toolId), `missing tool ${toolId}`);
  }

  console.log("[performance-capacity] ok");
} finally {
  if (process.env.PACT_KEEP_TEST_DATA !== "1") {
    await fs.rm(userDataPath, { recursive: true, force: true });
  } else {
    console.log(`kept test data: ${userDataPath}`);
  }
}
