#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SERVER_API_OPERATIONS } from "../platform/common/operation-dispatcher/operation-registry.mjs";
import {
  capabilityPackageDigest,
  createCapabilityPackageRegistry,
  normalizeCapabilityPackageManifest,
  TOOL_PACKAGE_PROTOCOL_VERSION,
  SKILL_REGISTRY_PROTOCOL_VERSION,
  CAPABILITY_PACKAGE_LIFECYCLE_PROTOCOL_VERSION
} from "../platform/specialized/capabilities/package-lifecycle/index.mjs";
import { createToolCatalog } from "../platform/specialized/capabilities/tools/tool-management-core/catalog.mjs";

function signedManifest(input) {
  const normalized = normalizeCapabilityPackageManifest(input);
  return normalizeCapabilityPackageManifest({
    ...input,
    signature: {
      algorithm: "sha256",
      digestSha256: capabilityPackageDigest(normalized)
    }
  });
}

function toolManifest(version = "1.0.0") {
  return signedManifest({
    kind: "tool",
    name: "external-search-tool",
    version,
    title: "External Search Tool",
    description: "Searches an approved external index.",
    owner: "partner-team",
    source: "external-package",
    capabilities: ["search.external", "evidence.read"],
    risk: "safe_write",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" }
      }
    },
    outputSchema: { type: "object" },
    secretRefs: ["secret://external-search/token"],
    dependencies: [],
    compatibility: {
      minServerVersion: "0.1.0",
      featureIds: ["tool-management-core"]
    },
    sandbox: {
      policy: "remote-token",
      network: true,
      filesystem: "none"
    },
    license: "Apache-2.0"
  });
}

function skillManifest() {
  return signedManifest({
    kind: "skill",
    name: "contract-review-skill",
    version: "2.1.0",
    title: "Contract Review Skill",
    owner: "legal-ops",
    source: "workspace-contribution",
    capabilities: ["skill.contract.review"],
    risk: "read_only",
    inputSchema: {
      type: "object",
      properties: {
        evidenceRefs: { type: "array" }
      }
    },
    outputSchema: { type: "object" },
    dependencies: [
      {
        kind: "tool",
        name: "external-search-tool",
        versionRange: ">=1.0.0"
      }
    ],
    compatibility: {
      featureIds: ["knowledge-core", "tool-management-core"]
    },
    sandbox: {
      policy: "knowledge-only"
    },
    license: "MIT"
  });
}

async function verifyRegistryLifecycle() {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-capability-packages-"));
  try {
    const registry = createCapabilityPackageRegistry({ userDataPath });
    const toolV1 = toolManifest("1.0.0");
    const plan = await registry.plan(toolV1);
    assert.equal(plan.protocolVersion, CAPABILITY_PACKAGE_LIFECYCLE_PROTOCOL_VERSION);
    assert.equal(plan.ok, true);
    assert.equal(plan.approvalRequired, true);
    assert.equal(plan.checks.signature.ok, true);

    const invalidPlan = await registry.plan({
      ...toolV1,
      license: "",
      signature: { digestSha256: "wrong" }
    });
    assert.equal(invalidPlan.ok, false);
    assert.ok(invalidPlan.validation.issues.some((issue) => issue.field === "license"));
    assert.ok(invalidPlan.validation.issues.some((issue) => issue.field === "signature.digestSha256"));

    const submitted = await registry.submit(toolV1, { submittedBy: "verifier" });
    assert.equal(submitted.record.manifest.protocolVersion, TOOL_PACKAGE_PROTOCOL_VERSION);
    assert.equal(submitted.record.status, "submitted");
    const packageId = submitted.record.manifest.packageId;
    await registry.lifecycle(packageId, { action: "approve", actor: "reviewer" });
    await registry.lifecycle(packageId, { action: "install", actor: "installer" });
    const activeV1 = await registry.lifecycle(packageId, { action: "activate", actor: "release-manager" });
    assert.equal(activeV1.record.status, "active");

    const toolV2 = toolManifest("1.1.0");
    const v2 = await registry.submit(toolV2, { submittedBy: "verifier" });
    await registry.lifecycle(v2.record.manifest.packageId, { action: "approve" });
    await registry.lifecycle(v2.record.manifest.packageId, { action: "install" });
    await registry.lifecycle(v2.record.manifest.packageId, { action: "activate" });
    const rolledBack = await registry.rollback({
      kind: "tool",
      name: "external-search-tool",
      actor: "release-manager"
    });
    assert.equal(rolledBack.record.manifest.version, "1.0.0");
    assert.equal(rolledBack.record.status, "active");

    const skill = skillManifest();
    const skillSubmission = await registry.submit(skill, { submittedBy: "legal-ops" });
    assert.equal(skillSubmission.record.manifest.protocolVersion, SKILL_REGISTRY_PROTOCOL_VERSION);
    assert.equal(skillSubmission.record.status, "submitted");

    const described = await registry.describe();
    assert.equal(described.protocolVersion, CAPABILITY_PACKAGE_LIFECYCLE_PROTOCOL_VERSION);
    assert.equal(described.summary.byKind.tool, 2);
    assert.equal(described.summary.byKind.skill, 1);
    assert.ok(described.summary.activeCount >= 1);
    assert.ok(described.auditEvents.some((event) => event.action === "submit"));

    await assert.rejects(
      () => registry.lifecycle(packageId, { action: "approve" }),
      /Cannot approve package from status active/
    );
  } finally {
    await fs.rm(userDataPath, { recursive: true, force: true });
  }
}

function verifyOperationRegistry() {
  const operations = new Map(SERVER_API_OPERATIONS.map((operation) => [operation.id, operation]));
  for (const id of [
    "capability_packages.list",
    "capability_packages.plan",
    "capability_packages.submit",
    "capability_packages.lifecycle"
  ]) {
    assert.ok(operations.has(id), `${id} operation must be registered`);
  }
  assert.equal(operations.get("capability_packages.list").http.path, "/api/capability-packages");
  assert.equal(operations.get("capability_packages.lifecycle").http.path, "/api/capability-packages/:packageId/lifecycle");
  assert.ok(operations.get("capability_packages.submit").requiredScopes.includes("runtime:admin"));
}

function verifyToolCatalogExposure() {
  const catalog = createToolCatalog({ operations: SERVER_API_OPERATIONS });
  const toolIds = new Set(catalog.tools.map((tool) => tool.id));
  assert.ok(toolIds.has("pact.capabilityPackages.list"));
  assert.ok(toolIds.has("pact.capabilityPackages.plan"));
  assert.ok(toolIds.has("pact.capabilityPackages.submit"));
  assert.ok(toolIds.has("pact.capabilityPackages.lifecycle"));
  const submitTool = catalog.tools.find((tool) => tool.id === "pact.capabilityPackages.submit");
  assert.ok(submitTool.requiredScopes.includes("knowledge:maintain"));
  assert.ok(submitTool.toolsets.includes("pact.knowledge.maintain"));
}

async function main() {
  await verifyRegistryLifecycle();
  verifyOperationRegistry();
  verifyToolCatalogExposure();
  console.log("[capability-package-lifecycle] ok");
}

await main();
