#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHttpServer } from "../../server/services/server-runtime/http-server.mjs";
import { installAuthenticatedFetch } from "../../server/scripts/test-auth-helper.mjs";

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${rawText}`);
  }
  return JSON.parse(rawText);
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "agentstudio-server-smoke-"));
let server = null;

try {
  server = await startHttpServer({
    userDataPath,
    host: "127.0.0.1",
    port: 0,
    runtimeOptions: {
      profile: "minimal"
    },
    discoveryOptions: {
      mode: "active"
    }
  });
  await installAuthenticatedFetch(server);

  const health = await fetchJson(`${server.url}/api/healthz`);
  assert.equal(health.ok, true);
  assert.equal(health.mode, "active");

  const bootstrap = await fetchJson(`${server.url}/api/bootstrap`);
  assert.ok(bootstrap.serverId);
  assert.ok(bootstrap.activeServiceUrl);

  const session = await fetchJson(`${server.url}/api/auth/session`);
  assert.equal(session.session.authenticated, true);

  const interfaces = await fetchJson(`${server.url}/api/interfaces`);
  const operations = interfaces.operations || interfaces.catalog || interfaces.interfaces || [];
  assert.ok(Array.isArray(operations));
  assert.ok(operations.some((item) => item.id === "knowledge.evidence"));
  assert.ok(operations.some((item) => item.id === "context.compaction.preview"));

  const runtime = await fetchJson(`${server.url}/api/runtime/info`);
  assert.ok(runtime.runtime || runtime.node || runtime.platform);

  console.log("server lifecycle smoke passed");
} finally {
  if (server) {
    await server.close();
  }
  await fs.rm(userDataPath, { recursive: true, force: true });
}
