#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SERVER_API_OPERATIONS } from "../platform/common/operation-dispatcher/operation-registry.mjs";
import { createContributionRegistry } from "../platform/specialized/agent/workspace-contribution/index.mjs";
import {
  createWorkspaceGovernanceRegistry,
  normalizeWorkspaceGovernancePolicy,
  WORKSPACE_GOVERNANCE_PROTOCOL_VERSION
} from "../platform/specialized/agent/workspace-governance/index.mjs";
import { createToolCatalog } from "../platform/specialized/capabilities/tools/tool-management-core/catalog.mjs";

function samplePolicy() {
  return {
    workspaceId: "workspace-alpha",
    organizationId: "org-a",
    projectId: "project-a",
    departmentId: "legal",
    dataClass: "confidential",
    ownerSubjectIds: ["owner-a"],
    allowedSubjectIds: ["analyst-a"],
    externalCollaboratorIds: ["external-counsel"],
    allowedActions: ["discover", "read", "cite", "copy", "share", "delete"],
    copyPolicy: "withApproval",
    exportAllowed: false,
    checkoutAllowed: false,
    retention: {
      policyId: "legal-7y",
      retainUntil: "2026-01-01T00:00:00.000Z",
      disposalAction: "review"
    },
    legalHold: {
      enabled: true,
      holdIds: ["hold-001"],
      reason: "litigation"
    }
  };
}

async function verifyGovernanceRuntime(tempRoot) {
  const registry = createWorkspaceGovernanceRegistry({ userDataPath: tempRoot });
  const normalized = normalizeWorkspaceGovernancePolicy(samplePolicy());
  assert.equal(normalized.protocolVersion, WORKSPACE_GOVERNANCE_PROTOCOL_VERSION);
  assert.equal(normalized.dataClass, "confidential");
  assert.equal(normalized.copyPolicy, "withApproval");

  const upsert = await registry.upsertPolicy(samplePolicy());
  assert.equal(upsert.policy.workspaceId, "workspace-alpha");
  assert.equal(upsert.audit.eventType, "workspace_governance.policy.upserted");

  const allowedRead = await registry.evaluate({
    workspaceId: "workspace-alpha",
    action: "read",
    subject: {
      subjectId: "analyst-a",
      organizationId: "org-a",
      projectId: "project-a",
      clearance: "confidential"
    },
    now: "2025-12-01T00:00:00.000Z"
  });
  assert.equal(allowedRead.allowed, true);

  const lowClearance = await registry.evaluate({
    workspaceId: "workspace-alpha",
    action: "read",
    subject: {
      subjectId: "analyst-a",
      organizationId: "org-a",
      clearance: "internal"
    }
  });
  assert.equal(lowClearance.allowed, false);
  assert.ok(lowClearance.reasons.includes("insufficient_data_class_clearance"));

  const externalDenied = await registry.evaluate({
    workspaceId: "workspace-alpha",
    action: "read",
    subject: {
      subjectId: "vendor-a",
      organizationId: "org-b",
      clearance: "secret",
      external: true
    }
  });
  assert.equal(externalDenied.allowed, false);
  assert.ok(externalDenied.reasons.includes("external_collaborator_not_listed"));

  const legalHoldDelete = await registry.evaluate({
    workspaceId: "workspace-alpha",
    action: "delete",
    subject: {
      subjectId: "owner-a",
      organizationId: "org-a",
      clearance: "secret"
    }
  });
  assert.equal(legalHoldDelete.allowed, false);
  assert.ok(legalHoldDelete.reasons.includes("legal_hold_blocks_destructive_action"));

  const copyWithoutApproval = await registry.evaluate({
    workspaceId: "workspace-alpha",
    action: "copy",
    targetWorkspaceId: "workspace-beta",
    targetProjectId: "project-b",
    subject: {
      subjectId: "analyst-a",
      organizationId: "org-a",
      clearance: "confidential"
    }
  });
  assert.equal(copyWithoutApproval.allowed, false);
  assert.ok(copyWithoutApproval.reasons.includes("copy_requires_approval"));

  const copyWithApproval = await registry.evaluate({
    workspaceId: "workspace-alpha",
    action: "copy",
    targetWorkspaceId: "workspace-beta",
    targetProjectId: "project-b",
    approvals: ["approval-123"],
    subject: {
      subjectId: "analyst-a",
      organizationId: "org-a",
      clearance: "confidential"
    },
    now: "2026-05-22T00:00:00.000Z"
  });
  assert.equal(copyWithApproval.allowed, true);
  assert.ok(copyWithApproval.obligations.some((item) => item.type === "retention_expired" && item.blockedByLegalHold === true));

  const grant = await registry.createShareGrant({
    workspaceId: "workspace-alpha",
    action: "share",
    targetWorkspaceId: "workspace-beta",
    targetProjectId: "project-b",
    approvals: ["approval-123"],
    granteeId: "analyst-b",
    subject: {
      subjectId: "analyst-a",
      organizationId: "org-a",
      clearance: "confidential"
    },
    actions: ["read", "cite"]
  });
  assert.equal(grant.granted, true);
  assert.equal(grant.shareGrant.dataClass, "confidential");
  assert.equal(grant.shareGrant.legalHold.enabled, true);

  const described = await registry.describe();
  assert.equal(described.protocolVersion, WORKSPACE_GOVERNANCE_PROTOCOL_VERSION);
  assert.equal(described.policies.length, 1);
  assert.equal(described.shareGrants.length, 1);
  assert.ok(described.auditEvents.length >= 1);
}

function verifyContributionGovernanceFields() {
  const registry = createContributionRegistry({ workspaceId: "workspace-alpha" });
  const submitted = registry.submitContribution({
    contributionType: "knowledge",
    title: "Governed asset",
    organizationId: "org-a",
    projectId: "project-a",
    dataClass: "restricted",
    retention: { policyId: "project-retain" },
    legalHold: { enabled: true, holdIds: ["hold-asset"] },
    externalCollaboratorIds: ["external-counsel"],
    copyPolicy: "sameProject"
  });
  assert.equal(submitted.contribution.organizationId, "org-a");
  assert.equal(submitted.contribution.projectId, "project-a");
  assert.equal(submitted.contribution.dataClass, "restricted");
  assert.equal(submitted.contribution.legalHold.enabled, true);
  assert.deepEqual(submitted.contribution.externalCollaboratorIds, ["external-counsel"]);
}

function verifyOperationsAndTools() {
  const operations = new Map(SERVER_API_OPERATIONS.map((operation) => [operation.id, operation]));
  for (const id of [
    "workspace_governance.describe",
    "workspace_governance.policy.set",
    "workspace_governance.evaluate",
    "workspace_governance.share_grant"
  ]) {
    assert.ok(operations.has(id), `${id} must be registered`);
  }
  assert.equal(operations.get("workspace_governance.policy.set").http.path, "/api/workspace-governance/policies");
  assert.equal(operations.get("workspace_governance.share_grant").safety.requiresConfirmation, true);

  const catalog = createToolCatalog({ operations: SERVER_API_OPERATIONS });
  const policyTool = catalog.tools.find((tool) => tool.id === "pact.workspaceGovernance.policy.set");
  assert.ok(policyTool, "workspace governance policy tool must be exposed");
  assert.ok(policyTool.toolsets.includes("pact.agent.workspace"));
  assert.equal(policyTool.requiresApproval, true);
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pact-workspace-governance-"));
  try {
    await verifyGovernanceRuntime(tempRoot);
    verifyContributionGovernanceFields();
    verifyOperationsAndTools();
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
  console.log("[workspace-governance] ok");
}

await main();
