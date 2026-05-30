#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  downloadRuntimeDependency,
  listRuntimeDependencies,
  RUNTIME_DEPENDENCIES_PROTOCOL_VERSION
} from "../platform/specialized/capabilities/runtime-dependencies/index.mjs";

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-runtime-dependencies-"));

const list = await listRuntimeDependencies({ userDataPath });
assert.equal(list.ok, true);
assert.equal(list.protocolVersion, RUNTIME_DEPENDENCIES_PROTOCOL_VERSION);
assert.equal(list.startupDownloads, false);
assert.equal(list.triggerMode, "user-requested");
assert.ok(list.sourceConfigPath, "list should expose the local source config path");
await fs.access(list.sourceConfigPath);
const sourceConfig = JSON.parse(await fs.readFile(list.sourceConfigPath, "utf8"));
for (const id of ["dify", "rag-flow", "docker", "jre", "tika", "python", "caddy", "nginx", "gerrit"]) {
  assert.ok(sourceConfig.sources?.[id], `missing local source config: ${id}`);
}

const ids = new Set((list.dependencies || []).map((item) => item.id));
for (const id of ["dify", "rag-flow", "cloud-drives", "docker", "programming-runtimes", "caddy", "nginx", "gerrit"]) {
  assert.equal(ids.has(id), true, `missing runtime dependency row: ${id}`);
}

const allowedStatuses = new Set(["present", "installed", "failed"]);

function assertRuntimeStatuses(value, label = "result") {
  if (!value || typeof value !== "object") return;
  if (typeof value.status === "string") {
    assert.equal(allowedStatuses.has(value.status), true, `${label} returned unsupported status ${value.status}`);
  }
  for (const key of ["dependencies", "children", "results", "images"]) {
    if (Array.isArray(value[key])) {
      value[key].forEach((item, index) => assertRuntimeStatuses(item, `${label}.${key}[${index}]`));
    }
  }
}

assertRuntimeStatuses(list, "list");

const gerritPlan = await downloadRuntimeDependency({ userDataPath, targetId: "gerrit", dryRun: true });
assert.equal(gerritPlan.ok, true);
assertRuntimeStatuses(gerritPlan, "gerrit");
assert.equal(gerritPlan.startupDownloads, false);

const gatewayPlan = await downloadRuntimeDependency({ userDataPath, targetId: "caddy", dryRun: true });
assert.equal(gatewayPlan.ok, true);
assertRuntimeStatuses(gatewayPlan, "caddy");

const languagePlan = await downloadRuntimeDependency({ userDataPath, targetId: "programming-runtimes", dryRun: true });
assert.equal(languagePlan.ok, true);
assert.ok(Array.isArray(languagePlan.results), "programming-runtimes should plan child runtimes");
assert.equal(languagePlan.startupDownloads, false);
assertRuntimeStatuses(languagePlan, "programming-runtimes");

const cloudPlan = await downloadRuntimeDependency({ userDataPath, targetId: "cloud-drives", dryRun: true });
assertRuntimeStatuses(cloudPlan, "cloud-drives");

const knowledgeAggregatePlan = await downloadRuntimeDependency({ userDataPath, targetId: "knowledge-backends", dryRun: true });
assertRuntimeStatuses(knowledgeAggregatePlan, "knowledge-backends");
assert.equal(Array.isArray(knowledgeAggregatePlan.results), true, "legacy knowledge-backends target should plan child providers");

console.log("[verify-runtime-dependency-downloads] ok");
