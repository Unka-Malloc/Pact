import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadSettings, saveSettings } from "../config.mjs";
import { SERVER_API_OPERATIONS } from "../interfaces/api/operation-registry.mjs";
import { startHttpServer } from "../http-server.mjs";
import { createProtocolEventBus } from "../protocols/pubsub/event-bus.mjs";
import { loadMountConfig, saveMountConfig } from "../runtime/mount-config.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";

async function makeTempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "splitall-state-coordination-"));
}

function operation(id) {
  const item = SERVER_API_OPERATIONS.find((candidate) => candidate.id === id);
  assert.ok(item, `missing operation ${id}`);
  return item;
}

async function verifyOperationLockGroups() {
  assert.equal(operation("settings.set").concurrencyGroup, "settings");
  assert.equal(operation("agent_gateway.config.set").concurrencyGroup, "settings");
  assert.equal(operation("runtime.set_mounts").concurrencyGroup, "runtime.mounts");
  assert.equal(operation("runtime.reload_mounts").concurrencyGroup, "runtime.mounts");
  assert.equal(operation("knowledge_packages.publish").concurrencyGroup, "knowledge.packages");
  assert.equal(operation("context.compaction.run").concurrencyGroup, "context.compaction");
}

async function verifySettingsWriteSerialization() {
  const userDataPath = await makeTempRoot();
  await Promise.all([
    saveSettings(userDataPath, {
      analysisModuleId: "builtin:state-coordination-a",
      retrievalHalfLifeDays: 11
    }),
    saveSettings(userDataPath, {
      staleAfterDays: 222,
      agentGateway: {
        alias: "state-coordination-gateway",
        url: "http://127.0.0.1:65530/agent",
        token: "gateway-secret"
      }
    }),
    saveSettings(userDataPath, {
      transactionWindowDays: 44,
      modelIntelligenceEnabled: true
    })
  ]);

  const settings = await loadSettings(userDataPath);
  assert.equal(settings.analysisModuleId, "builtin:state-coordination-a");
  assert.equal(settings.retrievalHalfLifeDays, 11);
  assert.equal(settings.staleAfterDays, 222);
  assert.equal(settings.transactionWindowDays, 44);
  assert.equal(settings.modelIntelligenceEnabled, true);
  assert.equal(settings.agentGateway.url, "http://127.0.0.1:65530/agent");
  assert.equal(settings.agentGateway.token, "gateway-secret");
}

async function verifyMountConfigSerialization() {
  const userDataPath = await makeTempRoot();
  await Promise.all([
    saveMountConfig(userDataPath, {
      mountModules: {
        analysis: "./analysis-a.mjs"
      }
    }),
    saveMountConfig(userDataPath, {
      mountRouting: {
        extensionRoutes: {
          ".stateflow": {
            mountName: "documentParser",
            action: "extractDocument"
          }
        }
      }
    })
  ]);
  const config = await loadMountConfig(userDataPath);
  assert.equal(config.mountModules.analysis, "./analysis-a.mjs");
  assert.equal(config.mountRouting.extensionRoutes[".stateflow"].mountName, "documentParser");
}

async function verifyEventBusOffsetsAndHotReads() {
  const userDataPath = await makeTempRoot();
  const bus = createProtocolEventBus({ userDataPath });
  const published = await Promise.all(
    Array.from({ length: 80 }, (_, index) =>
      bus.publish("state.coordination", { index }, { type: "test.event" })
    )
  );
  const offsets = published.map((event) => event.offset);
  assert.equal(new Set(offsets).size, offsets.length);
  assert.deepEqual(offsets, Array.from({ length: 80 }, (_, index) => index + 1));

  const result = await bus.subscribe({
    cursor: 70,
    topics: ["state.coordination"],
    limit: 20,
    includeSnapshot: true
  });
  assert.equal(result.events.length, 10);
  assert.equal(result.events[0].offset, 71);
  assert.equal(result.nextCursor, 80);
  assert.equal(result.snapshots.at(-1).offset, 80);
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const payload = await response.json();
  assert.ok(response.status < 400, `${url} failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function verifyHttpConfigFlowSerialization() {
  const userDataPath = await makeTempRoot();
  const server = await startHttpServer({
    userDataPath,
    host: "127.0.0.1",
    port: 0,
    runtimeOptions: { profile: "minimal" }
  });
  try {
    await installAuthenticatedFetch(server);
    await Promise.all([
      fetchJson(`${server.url}/api/settings`, {
        method: "POST",
        body: JSON.stringify({
          analysisModuleId: "builtin:http-state-a",
          retrievalHalfLifeDays: 19
        })
      }),
      fetchJson(`${server.url}/api/agent-gateway/config`, {
        method: "POST",
        body: JSON.stringify({
          config: {
            alias: "http-state-gateway",
            url: "http://127.0.0.1:65529/agent",
            token: "http-secret"
          }
        })
      })
    ]);
    const settings = await fetchJson(`${server.url}/api/settings`);
    assert.equal(settings.analysisModuleId, "builtin:http-state-a");
    assert.equal(settings.retrievalHalfLifeDays, 19);
    assert.equal(settings.agentGateway.url, "http://127.0.0.1:65529/agent");
    assert.equal(settings.agentGateway.token, "");
    assert.equal(settings.agentGateway.tokenConfigured, true);

    const events = await fetchJson(`${server.url}/api/events?topic=settings.current&includeSnapshot=1&limit=10`);
    assert.ok((events.events || []).length > 0 || (events.snapshots || []).length > 0);
  } finally {
    await server.close();
  }
}

await verifyOperationLockGroups();
await verifySettingsWriteSerialization();
await verifyMountConfigSerialization();
await verifyEventBusOffsetsAndHotReads();
await verifyHttpConfigFlowSerialization();

console.log("State coordination verification passed.");
