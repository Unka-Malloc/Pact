import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAuthorizationEngine } from "../platform/common/security/authorization/authorization-engine.mjs";
import { createAuthorizationStore } from "../platform/common/security/authorization/authorization-store.mjs";
import { createConsoleAuth } from "../platform/common/security/auth/console-auth.mjs";
import { createOperationAuditStore } from "../platform/common/security/operation-audit.mjs";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { authHeaders, installAuthenticatedFetch } from "./test-auth-helper.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    payload: text.trim() ? JSON.parse(text) : {}
  };
}

async function verifyAuthorizationTenantAbac(userDataPath) {
  const authorizationStore = createAuthorizationStore({ userDataPath });
  const authorizationEngine = createAuthorizationEngine({ store: authorizationStore });
  try {
    const subject = {
      type: "console-user",
      subjectId: "agent-a",
      username: "agent-a",
      roleId: "operator",
      tenantId: "tenant-a",
      scopes: ["workspace:read", "knowledge:read"],
      allowedWorkspaceIds: ["workspace-a"],
      allowedDataClasses: ["internal"],
      allowedEgress: ["searchResult", "evidenceRead"]
    };

    const tenantDenied = authorizationEngine.evaluate({
      operation: {
        id: "knowledge.evidence.get",
        requiredScopes: ["knowledge:read"],
        safety: { risk: "read_only" },
        readOnly: true
      },
      subject,
      input: {
        tenantId: "tenant-b",
        workspaceId: "workspace-a",
        dataClass: "internal",
        requestedEgress: "evidenceRead"
      },
      traceId: "trace_security_hardening_authz"
    });
    assert.equal(tenantDenied.allowed, false);
    assert.equal(tenantDenied.reasonCode, "tenant_mismatch");
    assert.equal(tenantDenied.tenant.subjectTenantId, "tenant-a");
    assert.equal(tenantDenied.tenant.resourceTenantId, "tenant-b");

    const workspaceDenied = authorizationEngine.evaluate({
      operation: {
        id: "workspace.file.list",
        requiredScopes: ["workspace:read"],
        safety: { risk: "read_only" },
        readOnly: true
      },
      subject,
      input: {
        tenantId: "tenant-a",
        workspaceId: "workspace-b",
        dataClass: "internal",
        requestedEgress: "searchResult"
      }
    });
    assert.equal(workspaceDenied.allowed, false);
    assert.equal(workspaceDenied.reasonCode, "workspace_not_allowed");

    const egressDenied = authorizationEngine.evaluate({
      operation: {
        id: "knowledge.export.request",
        requiredScopes: ["knowledge:read"],
        safety: { risk: "read_only" },
        readOnly: true
      },
      subject,
      input: {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        dataClass: "internal",
        requestedEgress: "exportFile"
      }
    });
    assert.equal(egressDenied.allowed, false);
    assert.equal(egressDenied.reasonCode, "egress_not_allowed");

    const allowed = authorizationEngine.evaluate({
      operation: {
        id: "knowledge.search",
        requiredScopes: ["knowledge:read"],
        safety: { risk: "read_only" },
        readOnly: true
      },
      subject,
      input: {
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
        dataClass: "internal",
        requestedEgress: "searchResult"
      }
    });
    assert.equal(allowed.allowed, true);
    assert.ok(allowed.evaluatedLayers.includes("tenant_boundary_policy"));
    assert.ok(allowed.evaluatedLayers.includes("abac_resource_policy"));

    const storedTenantDenied = authorizationStore.listDecisions({
      traceId: "trace_security_hardening_authz",
      tenantId: "tenant-b",
      limit: 10
    });
    assert.equal(storedTenantDenied.length, 1);
    assert.equal(storedTenantDenied[0].reasonCode, "tenant_mismatch");

    const deniedRequests = authorizationStore.listDeniedRequests({ tenantId: "tenant-b", limit: 10 });
    assert.equal(deniedRequests.length, 1);
    assert.equal(deniedRequests[0].reasonCode, "tenant_mismatch");
  } finally {
    authorizationStore.close();
  }
}

async function verifyConsoleTenantCli(userDataPath) {
  const auth = createConsoleAuth({ userDataPath });
  try {
    const user = await auth.createUser({
      username: "tenant-viewer",
      password: "tenant-viewer-password",
      roleId: "viewer",
      tenantId: "tenant-a",
      orgId: "org-a",
      teamIds: ["team-a"],
      allowedWorkspaceIds: ["workspace-a"],
      allowedDataClasses: ["internal"],
      allowedEgress: ["searchResult"]
    });
    assert.equal(user.tenantId, "tenant-a");
    assert.deepEqual(user.allowedWorkspaceIds, ["workspace-a"]);

    const updated = await auth.updateUser(user.userId, {
      tenantId: "tenant-b",
      allowedWorkspaceIds: ["workspace-b"],
      allowedEgress: ["evidenceRead"]
    });
    assert.equal(updated.tenantId, "tenant-b");
    assert.deepEqual(updated.allowedWorkspaceIds, ["workspace-b"]);
    assert.deepEqual(updated.allowedEgress, ["evidenceRead"]);
  } finally {
    auth.close();
  }
}

function verifyAuditRetentionExport(userDataPath) {
  const auditStore = createOperationAuditStore({ userDataPath });
  try {
    auditStore.setRetentionPolicy({ retentionDays: 30, maxExportItems: 25, updatedBy: { userId: "owner" } });
    const policy = auditStore.getRetentionPolicy();
    assert.equal(policy.retentionDays, 30);
    assert.equal(policy.maxExportItems, 25);

    auditStore.append({
      traceId: "trace_security_hardening_audit",
      tenantId: "tenant-a",
      operationId: "knowledge.export.request",
      transport: "http",
      actor: { userId: "agent-a", username: "agent-a", tenantId: "tenant-a" },
      status: "ok",
      input: {
        token: "secret-token-value",
        nested: { apiKey: "api-key-value" },
        path: "/Users/unka/private/file.txt",
        requestedEgress: "exportFile"
      },
      output: {
        downloadUrl: "https://example.local/download?token=secret-token-value"
      }
    });

    const listed = auditStore.list({ traceId: "trace_security_hardening_audit", tenantId: "tenant-a" });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].redactedInput.token, "<redacted>");
    assert.equal(listed[0].redactedInput.nested.apiKey, "<redacted>");
    assert.equal(listed[0].redactedInput.path, "<redacted-path>");

    const exported = auditStore.exportRedacted({
      traceId: "trace_security_hardening_audit",
      tenantId: "tenant-a"
    });
    assert.equal(exported.manifest.protocolVersion, "pact.audit-export.v1");
    assert.equal(exported.items.length, 1);
    assert.doesNotMatch(exported.jsonl, /secret-token-value|api-key-value|\/Users\/unka\/private/);

    auditStore.append({
      traceId: "trace_security_hardening_old",
      operationId: "old.operation",
      createdAt: "2000-01-01T00:00:00.000Z",
      status: "ok"
    });
    const prune = auditStore.pruneExpired({ retentionDays: 1 });
    assert.ok(prune.deletedCount >= 1);
    assert.equal(auditStore.list({ traceId: "trace_security_hardening_old" }).length, 0);
  } finally {
    auditStore.close();
  }
}

async function verifyHttpTraceDrilldown() {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-security-hardening-http-"));
  const server = await startHttpServer({
    userDataPath,
    runtimeOptions: {
      profile: "minimal",
      cwd: repoRoot
    }
  });
  try {
    const auth = await installAuthenticatedFetch(server);
    const settings = await requestJson(`${server.url}/api/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(auth, { method: "POST", safetyConfirm: true })
      },
      body: JSON.stringify({
        analysisModuleId: "builtin:security-hardening"
      })
    });
    assert.equal(settings.status, 200);
    const traceId = settings.headers.get("x-pact-trace-id");
    assert.match(traceId, /^trace_/);

    const trace = await requestJson(`${server.url}/api/observability/traces/${encodeURIComponent(traceId)}?limit=50`, {
      headers: authHeaders(auth)
    });
    assert.equal(trace.status, 200);
    assert.equal(trace.payload.protocolVersion, "pact.trace-drilldown.v1");
    assert.equal(trace.payload.traceId, traceId);
    assert.ok(
      trace.payload.auditItems.some((item) => item.operationId === "settings.set"),
      "trace drill-down must include the audited operation"
    );

    const retention = await requestJson(`${server.url}/api/auth/audit/retention`, {
      headers: authHeaders(auth)
    });
    assert.equal(retention.status, 200);
    assert.equal(retention.payload.policy.policyVersion, "pact.audit-retention.v1");

    const auditExport = await requestJson(`${server.url}/api/auth/audit/export?limit=50&traceId=${encodeURIComponent(traceId)}`, {
      headers: authHeaders(auth)
    });
    assert.equal(auditExport.status, 200);
    assert.equal(auditExport.payload.export.manifest.protocolVersion, "pact.audit-export.v1");
    assert.ok(auditExport.payload.export.manifest.itemCount >= 1);
  } finally {
    await server.close();
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-security-hardening-"));
try {
  await verifyAuthorizationTenantAbac(userDataPath);
  await verifyConsoleTenantCli(userDataPath);
  verifyAuditRetentionExport(userDataPath);
  await verifyHttpTraceDrilldown();
} finally {
  await fs.rm(userDataPath, { recursive: true, force: true });
}

console.log("security hardening verification passed");
