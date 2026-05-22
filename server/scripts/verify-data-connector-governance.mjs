#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createDataConnectorGovernance,
  DATA_CONNECTOR_GOVERNANCE_PROTOCOL_VERSION,
  LOCAL_MIRROR_PROTOCOL_VERSION,
  validateDataConnectorManifest
} from "../platform/specialized/knowledge/connectors/data-connector-governance/index.mjs";
import { SERVER_API_OPERATIONS } from "../platform/common/operation-dispatcher/operation-registry.mjs";
import { createToolCatalog } from "../platform/specialized/capabilities/tools/tool-management-core/catalog.mjs";

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-data-connector-governance-"));

const manifest = {
  providerId: "drive-enterprise",
  sourceType: "file",
  displayName: "Drive Enterprise",
  version: "2.4.0",
  capabilities: ["sync", "localQuery"],
  auth: {
    type: "oauth2",
    refreshRequired: true,
    scopes: ["files.read"]
  },
  sync: {
    mode: "incrementalCursor",
    cursorField: "nextPageToken",
    conflictPolicy: "newerCapturedAtWins",
    hashCollisionPolicy: "quarantine",
    rateLimit: {
      maxItemsPerSync: 2
    }
  },
  localQuery: {
    enabled: true,
    remoteCallsAllowed: false
  },
  mirror: {
    cleanupRequired: true,
    dedupeKeys: ["providerId", "sourceType", "externalId", "contentHash"]
  },
  uninstall: {
    removeMirrorDefault: true,
    retainIngestedKnowledge: true
  },
  security: {
    secretRefs: ["secret://drive-enterprise/oauth"],
    dataClasses: ["business-file"]
  }
};

try {
  const plan = validateDataConnectorManifest(manifest);
  assert.equal(plan.ok, true);
  assert.equal(plan.protocolVersion, DATA_CONNECTOR_GOVERNANCE_PROTOCOL_VERSION);
  assert.equal(plan.contract.localQueryRemoteCallsAllowed, false);
  assert.equal(plan.contract.mirrorProtocolVersion, LOCAL_MIRROR_PROTOCOL_VERSION);

  const invalidRemoteQuery = validateDataConnectorManifest({
    ...manifest,
    providerId: "bad-remote-query",
    localQuery: {
      remoteCallsAllowed: true
    }
  });
  assert.equal(invalidRemoteQuery.ok, true, "normalizer must force localQuery remote calls off");
  assert.equal(invalidRemoteQuery.manifest.localQuery.remoteCallsAllowed, false);

  const invalidOauth = validateDataConnectorManifest({
    ...manifest,
    providerId: "bad-oauth",
    auth: {
      type: "oauth2",
      refreshRequired: false
    }
  });
  assert.equal(invalidOauth.ok, false);
  assert.ok(invalidOauth.errors.some((error) => error.includes("refreshRequired")));

  const governance = createDataConnectorGovernance({ userDataPath });
  const registered = await governance.register(manifest, { actor: "verify" });
  assert.equal(registered.ok, true);
  assert.equal(registered.connector.providerId, "drive-enterprise");

  const first = await governance.applySyncBatch({
    providerId: "drive-enterprise",
    syncBatchId: "verify-sync-1",
    previousCursor: "",
    nextCursor: "cursor-1",
    items: [
      { externalId: "doc-1", title: "Q1 Budget", text: "Budget alpha", contentHash: "hash-alpha", capturedAt: "2026-05-21T00:00:00.000Z" },
      { externalId: "doc-2", title: "Q1 Plan", text: "Plan beta", contentHash: "hash-beta", capturedAt: "2026-05-21T00:01:00.000Z" }
    ]
  });
  assert.equal(first.ok, true);
  assert.equal(first.run.insertedCount, 2);
  assert.equal(first.run.nextCursor, "cursor-1");
  assert.equal(first.mirror.recordCount, 2);

  const second = await governance.applySyncBatch({
    providerId: "drive-enterprise",
    syncBatchId: "verify-sync-2",
    previousCursor: "cursor-1",
    nextCursor: "cursor-2",
    items: [
      { externalId: "doc-1", title: "Q1 Budget", text: "Budget alpha", contentHash: "hash-alpha", capturedAt: "2026-05-21T00:00:00.000Z" },
      { externalId: "doc-2", title: "Q1 Plan", text: "Plan beta revised", contentHash: "hash-beta-2", capturedAt: "2026-05-21T00:02:00.000Z" }
    ]
  });
  assert.equal(second.ok, true);
  assert.equal(second.run.skippedUnchangedCount, 1);
  assert.equal(second.run.conflictCount, 1);
  assert.equal(second.run.updatedCount, 1);

  const collision = await governance.applySyncBatch({
    providerId: "drive-enterprise",
    syncBatchId: "verify-sync-3",
    previousCursor: "cursor-2",
    nextCursor: "cursor-3",
    items: [
      { externalId: "doc-3", title: "Collision", text: "different payload", contentHash: "hash-alpha", capturedAt: "2026-05-21T00:03:00.000Z" }
    ]
  });
  assert.equal(collision.ok, true);
  assert.equal(collision.run.hashCollisionCount, 1);
  assert.equal(collision.run.quarantinedCount, 1);

  const rateLimited = await governance.applySyncBatch({
    providerId: "drive-enterprise",
    syncBatchId: "verify-rate-limit",
    items: [
      { externalId: "rate-1", text: "1" },
      { externalId: "rate-2", text: "2" },
      { externalId: "rate-3", text: "3" }
    ]
  });
  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.run.status, "rate_limited");

  const localPolicy = await governance.enforceLocalQueryPolicy({
    providerId: "drive-enterprise",
    requestedRemoteCallsAllowed: true
  });
  assert.equal(localPolicy.ok, false);
  assert.equal(localPolicy.remoteCallsAllowed, false);

  const cleanupPreview = await governance.cleanupMirror({
    providerId: "drive-enterprise",
    retainExternalIds: ["doc-1"],
    dryRun: true
  });
  assert.equal(cleanupPreview.dryRun, true);
  assert.deepEqual(cleanupPreview.plannedExternalIds, ["doc-2"]);

  const cleanup = await governance.cleanupMirror({
    providerId: "drive-enterprise",
    retainExternalIds: ["doc-1"],
    dryRun: false
  });
  assert.equal(cleanup.removedCount, 1);
  assert.equal(cleanup.mirror.recordCount, 1);

  const conformance = await governance.runConformance({
    ...manifest,
    providerId: "drive-conformance"
  });
  assert.equal(conformance.status, "pass");
  assert.deepEqual(
    conformance.checks.map((check) => check.id),
    [
      "manifest-validation",
      "oauth-refresh-policy",
      "incremental-cursor",
      "conflict-resolution",
      "hash-collision-detection",
      "rate-limit",
      "local-query-no-remote",
      "mirror-cleanup",
      "uninstall-policy"
    ]
  );

  const uninstalled = await governance.uninstall({
    providerId: "drive-enterprise",
    removeMirror: true,
    actor: "verify"
  });
  assert.equal(uninstalled.ok, true);
  assert.equal(uninstalled.removedMirror, true);

  const described = await governance.describe();
  assert.equal(described.summary.connectorCount, 2);
  assert.equal(described.connectors.some((connector) => connector.status === "uninstalled"), true);

  const operations = SERVER_API_OPERATIONS;
  for (const operationId of [
    "data_connectors.governance.describe",
    "data_connectors.governance.plan",
    "data_connectors.governance.conformance"
  ]) {
    assert.ok(operations.some((operation) => operation.id === operationId), `missing operation ${operationId}`);
  }

  const toolCatalog = createToolCatalog({ operations });
  for (const toolId of [
    "pact.dataConnectors.governance",
    "pact.dataConnectors.governance.plan",
    "pact.dataConnectors.governance.conformance"
  ]) {
    assert.ok(toolCatalog.tools.some((tool) => tool.id === toolId), `missing tool ${toolId}`);
  }

  console.log("[data-connector-governance] ok");
} finally {
  if (process.env.PACT_KEEP_TEST_DATA !== "1") {
    await fs.rm(userDataPath, { recursive: true, force: true });
  } else {
    console.log(`kept test data: ${userDataPath}`);
  }
}
