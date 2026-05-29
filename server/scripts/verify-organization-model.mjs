#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createOrganizationModelStore,
  PACT_ROOT_ORGANIZATION_ID,
  PACT_ROOT_ORGANIZATION_LABEL
} from "../platform/common/security/authorization/organization-model.mjs";
import { createConsoleAuth } from "../platform/common/security/auth/console-auth.mjs";
import { listKernelCapabilityPermissions } from "../platform/common/security/authorization/authorization-engine.mjs";

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-organization-model-"));

try {
  const organizationStore = createOrganizationModelStore({ userDataPath });
  try {
    const root = organizationStore.getNode(PACT_ROOT_ORGANIZATION_ID);
    assert.equal(root.nodeType, "root");
    assert.equal(root.label, PACT_ROOT_ORGANIZATION_LABEL);
    assert.equal(root.parentId, "");
    assert.equal(root.metadata.authorizationBoundary, false);

    const engineering = organizationStore.upsertOrganization({
      organizationId: "org-engineering",
      label: "Engineering"
    });
    assert.equal(engineering.parentId, PACT_ROOT_ORGANIZATION_ID);

    const platform = organizationStore.upsertOrganization({
      organizationId: "org-platform",
      parentId: engineering.nodeId,
      label: "Platform"
    });
    assert.deepEqual(
      organizationStore.pathForNode(platform.nodeId).map((node) => node.nodeId),
      [PACT_ROOT_ORGANIZATION_ID, engineering.nodeId, platform.nodeId]
    );

    const owner = organizationStore.attachUser({
      userId: "user-owner",
      username: "owner",
      label: "Owner"
    });
    assert.equal(owner.parentId, PACT_ROOT_ORGANIZATION_ID);
    assert.equal(owner.nodeType, "user");

    const alice = organizationStore.attachUser({
      userId: "user-alice",
      username: "alice",
      parentId: platform.nodeId
    });
    assert.equal(alice.parentId, platform.nodeId);

    assert.throws(
      () => organizationStore.upsertOrganization({ organizationId: "org-invalid", parentId: alice.nodeId }),
      /Users cannot have child/
    );
    assert.throws(
      () => organizationStore.moveNode(engineering.nodeId, platform.nodeId),
      /cycles/
    );
    assert.throws(
      () => organizationStore.moveNode(PACT_ROOT_ORGANIZATION_ID, engineering.nodeId),
      /Pact Root cannot be moved/
    );
    assert.throws(
      () => organizationStore.upsertOrganization({ organizationId: PACT_ROOT_ORGANIZATION_ID }),
      /reserved|immutable/
    );

    const summary = organizationStore.describeModel();
    assert.equal(summary.authorizationBoundary, false);
    assert.equal(summary.capabilityKernelBoundary, "excluded");
    assert.equal(summary.organizationCount, 2);
    assert.equal(summary.userCount, 2);
  } finally {
    organizationStore.close();
  }

  const auth = createConsoleAuth({ userDataPath });
  try {
    const initialOwner = await auth.ensureInitialOwner();
    assert.equal(initialOwner.created, true);
    assert.equal(initialOwner.user.orgId, PACT_ROOT_ORGANIZATION_ID);

    const user = await auth.createUser({
      username: "alice",
      password: "correct horse battery staple",
      roleId: "viewer"
    });
    assert.equal(user.orgId, PACT_ROOT_ORGANIZATION_ID);

    const movedUser = await auth.updateUser(user.userId, { orgId: "org-platform" });
    assert.equal(movedUser.orgId, "org-platform");
    const rootUser = await auth.updateUser(user.userId, { orgId: "" });
    assert.equal(rootUser.orgId, PACT_ROOT_ORGANIZATION_ID);
  } finally {
    auth.close();
  }

  assert.equal(
    listKernelCapabilityPermissions().some((capability) => capability.includes(PACT_ROOT_ORGANIZATION_ID)),
    false,
    "Pact Root must not appear as a kernel capability permission"
  );

  console.log("organization model verifier passed");
} finally {
  await fs.rm(userDataPath, { recursive: true, force: true });
}
