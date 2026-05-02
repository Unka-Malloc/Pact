import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { startHttpServer } from "../http-server.mjs";
import { SERVER_API_OPERATIONS } from "../interfaces/api/operation-registry.mjs";
import { createOperationAuditStore } from "../security/operation-audit.mjs";
import { authHeaders, installAuthenticatedFetch } from "./test-auth-helper.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function* walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "build", ".git"].includes(entry.name)) {
        continue;
      }
      yield* walk(filePath);
      continue;
    }
    if (entry.isFile() && filePath.endsWith(".mjs")) {
      yield filePath;
    }
  }
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    payload: text.trim() ? JSON.parse(text) : {}
  };
}

async function assertStaticDispatcherGuard() {
  const dispatcherPath = path.join(repoRoot, "server", "interfaces", "api", "operation-dispatcher.mjs");
  const selfPath = fileURLToPath(import.meta.url);
  const offenders = [];
  for await (const filePath of walk(path.join(repoRoot, "server"))) {
    const text = await readText(filePath);
    if (filePath !== dispatcherPath && filePath !== selfPath && text.includes("invokeRegisteredOperation")) {
      offenders.push(path.relative(repoRoot, filePath));
    }
  }
  assert.deepEqual(offenders, [], "invokeRegisteredOperation must stay private to OperationDispatcher");

  const httpServer = await readText(path.join(repoRoot, "server", "http-server.mjs"));
  assert.equal(
    httpServer.includes("handledToolManagement = await toolManagementPlatform.router.handleToolManagementHttpRequest"),
    false,
    "HTTP server must not route Tool Management around OperationDispatcher"
  );

  const toolRuntime = await readText(path.join(repoRoot, "server", "tool-management", "runtime.mjs"));
  assert.equal(toolRuntime.includes("dispatchOperation({"), true);
  assert.equal(toolRuntime.includes("invokeRegisteredOperation"), false);

  const maintenanceTools = await readText(path.join(repoRoot, "server", "application", "MaintenanceAgent", "tool-registry.mjs"));
  assert.equal(maintenanceTools.includes("dispatchOperation({"), true);
  assert.equal(maintenanceTools.includes(".run(input"), false);
}

async function main() {
  await assertStaticDispatcherGuard();
  for (const operation of SERVER_API_OPERATIONS) {
    assert.ok(operation.log?.redaction, `${operation.id} must declare log redaction policy`);
  }

  const migrationDir = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-operation-audit-migration-"));
  const securityDir = path.join(migrationDir, "security");
  await fs.mkdir(securityDir, { recursive: true });
  const legacyDb = new Database(path.join(securityDir, "operation-audit.sqlite"));
  legacyDb.exec(`
    CREATE TABLE operation_audit_log (
      audit_id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL,
      transport TEXT NOT NULL,
      actor_json TEXT NOT NULL DEFAULT '{}',
      risk TEXT NOT NULL DEFAULT '',
      read_only INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      input_hash TEXT NOT NULL DEFAULT '',
      redacted_input_json TEXT NOT NULL DEFAULT '{}',
      redacted_output_summary_json TEXT NOT NULL DEFAULT '{}',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);
  legacyDb.close();
  const migratedStore = createOperationAuditStore({ userDataPath: migrationDir });
  migratedStore.append({
    operationId: "verify.migration",
    transport: "test",
    traceId: "trace_verify",
    requestId: "request_verify",
    status: "ok"
  });
  assert.equal(migratedStore.list({ operationId: "verify.migration" })[0].traceId, "trace_verify");
  migratedStore.close();
  await fs.rm(migrationDir, { recursive: true, force: true });

  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-dispatcher-unified-"));
  const server = await startHttpServer({
    userDataPath,
    runtimeOptions: { profile: "minimal" }
  });
  try {
    const auth = await installAuthenticatedFetch(server);
    const health = await requestJson(`${server.url}/api/healthz`);
    assert.equal(health.status, 200);
    assert.ok(health.headers.get("x-splitall-trace-id"));

    const rpcHealth = await requestJson(`${server.url}/api/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "dispatcher-rpc-health",
        method: "system.health",
        params: {}
      })
    });
    assert.equal(rpcHealth.status, 200);
    assert.equal(rpcHealth.payload.jsonrpc, "2.0");

    const grant = await requestJson(`${server.url}/api/tool-management/v1/grants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(auth, { method: "POST", safetyConfirm: true })
      },
      body: JSON.stringify({
        label: "dispatcher-unified",
        scopes: ["knowledge:read"]
      })
    });
    assert.equal(grant.status, 201);
    assert.ok(grant.payload.token);

    const tool = await requestJson(`${server.url}/api/tool-management/v1/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${grant.payload.token}`
      },
      body: JSON.stringify({
        toolId: "splitall.knowledge.health",
        input: {}
      })
    });
    assert.equal(tool.status, 200);
    assert.equal(tool.payload.schemaVersion, 1);

    const audit = await requestJson(`${server.url}/api/auth/audit?limit=300`, {
      headers: authHeaders(auth)
    });
    assert.equal(audit.status, 200);
    const entries = audit.payload.items || [];
    for (const operationId of ["system.health", "tool_management.create_grant", "tool_management.execute"]) {
      assert.ok(
        entries.some((entry) => entry.operationId === operationId && entry.traceId),
        `central audit missing traced ${operationId}`
      );
    }
  } finally {
    await server.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
}

await main();
console.log("dispatcher-unified verification passed");
