import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  atomicWriteJsonThroughState,
  mutateState,
  readJsonFile
} from "../platform/common/platform-core/state-coordinator.mjs";
import { saveSettings } from "../platform/common/platform-core/settings.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function readText(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

async function pathExists(relativePath) {
  try {
    await fs.access(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function assertStaticStateGuard() {
  const guardedFiles = [
    "server/platform/common/platform-core/settings.mjs",
    "server/services/client/work-queue-core/jobs/job-manager.mjs",
    "server/platform/specialized/knowledge/preprocessing/domain/rules/expert-vocabulary.mjs",
    "server/protocols/pubsub/event-bus.mjs"
  ];
  if (await pathExists("server/services/agent/maintenance-agent/config.mjs")) {
    guardedFiles.push("server/services/agent/maintenance-agent/config.mjs");
  }
  for (const relativePath of guardedFiles) {
    const text = await readText(relativePath);
    assert.equal(
      text.includes("queueStateMutation"),
      false,
      `${relativePath} must use StateMutationDispatcher instead of direct queueStateMutation`
    );
    assert.equal(
      /import\s*\{[^}]*\batomicWriteJson\b[^}]*\}/s.test(text),
      false,
      `${relativePath} must not import raw atomicWriteJson for guarded state`
    );
    assert.ok(
      text.includes("mutateState") || text.includes("atomicWriteJsonThroughState"),
      `${relativePath} must route guarded writes through StateMutationDispatcher`
    );
  }
}

async function main() {
  await assertStaticStateGuard();

  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-state-mutations-"));
  try {
    const settings = await saveSettings(userDataPath, {
      analysisModuleId: "builtin:state-mutations"
    });
    assert.equal(settings.analysisModuleId, "builtin:state-mutations");

    if (await pathExists("server/services/agent/maintenance-agent/config.mjs")) {
      const { saveMaintenanceAgentConfig } = await import("../services/agent/maintenance-agent/config.mjs");
      const maintenance = await saveMaintenanceAgentConfig(userDataPath, {
        enabled: false,
        schedules: []
      });
      assert.equal(maintenance.enabled, false);
    }

    const customPath = path.join(userDataPath, "custom", "state.json");
    await mutateState({
      key: `verify:${customPath}`,
      kind: "verify.state.write",
      task: () => atomicWriteJsonThroughState(customPath, { ok: true })
    });
    assert.deepEqual(await readJsonFile(customPath), { ok: true });
  } finally {
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
}

await main();
console.log("state-mutations verification passed");
