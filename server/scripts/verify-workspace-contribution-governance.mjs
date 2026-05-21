import assert from "node:assert/strict";
import {
  CONTRIBUTION_STATES,
  CONTRIBUTION_TYPES,
  WORKSPACE_CONTRIBUTION_PROTOCOL_VERSION,
  computeRankScoreV0,
  createContributionRegistry
} from "../platform/specialized/agent/workspace-contribution/index.mjs";

function assertCatalogs() {
  for (const state of ["submitted", "scanned", "reviewed", "published", "adopted", "deprecated", "revoked"]) {
    assert.ok(CONTRIBUTION_STATES.includes(state), `missing state ${state}`);
  }
  for (const type of ["knowledge", "skill", "tool", "script", "file", "goldenRule", "expertOpinion"]) {
    assert.ok(CONTRIBUTION_TYPES.includes(type), `missing contribution type ${type}`);
  }
}

function publishSkillContribution(registry) {
  const submitted = registry.submitContribution({
    workspaceId: "workspace-main",
    contributorId: "agent-a",
    contributorKind: "agent",
    contributionType: "skill",
    title: "Renewal Review Skill",
    skillManifestRef: "workspace/skills/renewal-review/skill.json",
    requestedVisibility: "public",
    requestedActions: ["discover", "download", "install", "execute"],
    license: "MIT",
    risk: "low"
  }).contribution;
  assert.equal(submitted.protocolVersion, WORKSPACE_CONTRIBUTION_PROTOCOL_VERSION);
  assert.equal(submitted.status, "submitted");

  registry.scanContribution(submitted.contributionId, { actorId: "scanner", reason: "license_and_risk_scan" });
  registry.reviewContribution(submitted.contributionId, { actorId: "reviewer", reason: "approved_for_public_workspace" });
  const published = registry.publishContribution(submitted.contributionId, { actorId: "reviewer" }).contribution;
  assert.equal(published.status, "published");
  return published;
}

function assertPermissionGrantAndLoan(registry, contributionId) {
  const permission = registry.requestPermission(contributionId, {
    requesterId: "agent-b",
    targetWorkspaceId: "workspace-secondary",
    actions: ["download", "install", "execute"],
    purpose: "reuse renewal skill"
  });
  assert.ok(permission.permissionRequest.permissionRequestId);
  assert.equal(permission.permissionRequest.status, "requested");

  const grant = registry.grantPermission(contributionId, {
    granteeId: "agent-b",
    targetWorkspaceId: "workspace-secondary",
    actions: ["download", "install", "execute"],
    canRetain: true,
    canShare: false
  });
  assert.ok(grant.contributionGrant.contributionGrantId);
  assert.ok(grant.loanRecord.loanRecordId);
  assert.equal(grant.loanRecord.canRetain, true);
  assert.equal(grant.loanRecord.canShare, false);
  assert.ok(grant.audit.auditId);
}

function assertUsageAndRanking(registry, contributionId) {
  registry.recordUsage(contributionId, {
    actorId: "agent-b",
    workspaceId: "workspace-secondary",
    action: "skill.used",
    successful: true
  });
  registry.recordUsage(contributionId, {
    actorId: "agent-c",
    workspaceId: "workspace-third",
    action: "skill.used",
    successful: true
  });
  const contribution = registry.getContribution(contributionId);
  assert.equal(contribution.metrics.usageCount, 2);
  assert.equal(contribution.metrics.skillExecutionCount, 2);
  assert.equal(contribution.metrics.uniqueWorkspaceAdoptions, 2);
  assert.equal(contribution.metrics.rankScore, computeRankScoreV0(contribution.metrics));
  assert.equal(contribution.metrics.rankScore, 4);

  const leaderboard = registry.getLeaderboard();
  assert.equal(leaderboard[0].contributionId, contributionId);
  assert.equal(leaderboard[0].acceptedCount >= 1, true, "acceptedCount must remain a report dimension");
  assert.equal(leaderboard[0].rankScore, 4);
}

function assertReport(registry) {
  const stats = registry.getStats();
  assert.equal(stats.protocolVersion, WORKSPACE_CONTRIBUTION_PROTOCOL_VERSION);
  assert.equal(stats.contributionCount, 1);
  assert.equal(stats.permissionRequestCount, 1);
  assert.equal(stats.permissionGrantCount, 1);
  assert.equal(stats.skillExecutionCount, 2);

  const report = registry.getContributionReport({ timeRange: "all" });
  assert.ok(report.reportId);
  assert.equal(report.assetContributionReportV0, 6);
  assert.equal(report.topReusableAssets.length, 1);
  assert.ok(Object.hasOwn(report.permissionFlowBreakdown, "requested"));
  assert.ok(Array.isArray(report.highDemandRestrictedAssets));
}

function assertInvalidTransitionRejected() {
  const registry = createContributionRegistry({ workspaceId: "workspace-invalid" });
  const contribution = registry.submitContribution({
    contributorId: "agent-x",
    contributionType: "file",
    fileRefs: ["workspace/files/raw.md"]
  }).contribution;
  assert.throws(
    () => registry.publishContribution(contribution.contributionId, { actorId: "reviewer" }),
    /Invalid contribution state transition/
  );
}

assertCatalogs();
const registry = createContributionRegistry({ workspaceId: "workspace-main" });
const published = publishSkillContribution(registry);
assertPermissionGrantAndLoan(registry, published.contributionId);
assertUsageAndRanking(registry, published.contributionId);
assertReport(registry);
assertInvalidTransitionRejected();

console.log("workspace contribution governance verification passed");
