import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  AGENT_WORKSPACE_PROTOCOL_VERSION,
  createAgentWorkspace
} from "../platform/specialized/agent/agent-workspace/index.mjs";

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-agent-workspace-"));
const workspace = createAgentWorkspace({ userDataPath });

try {
  assert.equal(workspace.protocolVersion, AGENT_WORKSPACE_PROTOCOL_VERSION);
  const created = workspace.createWorkspace({
    title: "Verify workspace",
    objective: "Validate shared-space gate"
  }).workspace;
  assert.ok(created.workspaceId);

  const run = workspace.createRun({
    workspaceId: created.workspaceId,
    runType: "verify",
    status: "running",
    input: {
      query: "verify"
    }
  }).run;
  assert.ok(run.runId);

  const missingEvidence = workspace.submit({
    workspaceId: created.workspaceId,
    runId: run.runId,
    agentId: "Extractor",
    type: "evidenceCard",
    payload: {
      claim: "A claim without evidence must be reviewed.",
      confidence: 0.9
    },
    confidence: 0.9
  }).submission;
  assert.equal(missingEvidence.status, "needs_review");
  assert.equal(missingEvidence.gate.reasons.includes("missing_evidence"), true);

  const duplicate = workspace.submit({
    workspaceId: created.workspaceId,
    runId: run.runId,
    agentId: "Extractor",
    type: "evidenceCard",
    payload: {
      claim: "A claim without evidence must be reviewed.",
      confidence: 0.9
    },
    confidence: 0.9
  }).submission;
  assert.equal(duplicate.status, "rejected");
  assert.equal(duplicate.gate.reasons.includes("duplicate_submission"), true);

  const evidenceRef = workspace.submit({
    workspaceId: created.workspaceId,
    runId: run.runId,
    agentId: "Extractor",
    type: "evidenceRef",
    payload: {
      summary: "accepted evidence ref",
      evidenceId: "ev-1"
    },
    evidenceRefs: ["ev-1"],
    confidence: 0.8
  }).submission;
  assert.equal(evidenceRef.status, "accepted");

  const canonicalChange = workspace.submit({
    workspaceId: created.workspaceId,
    runId: run.runId,
    agentId: "Analyst",
    type: "canonicalChange",
    payload: {
      summary: "canonical fact edits require review",
      evidenceId: "ev-1"
    },
    evidenceRefs: ["ev-1"],
    confidence: 0.95
  }).submission;
  assert.equal(canonicalChange.status, "needs_review");
  assert.equal(canonicalChange.gate.reviewedRequired, true);

  const denied = workspace.submit({
    workspaceId: created.workspaceId,
    runId: run.runId,
    agentId: "Writer",
    type: "claim",
    payload: {
      claim: "Writer is not allowed to submit claims in this policy.",
      evidenceId: "ev-1"
    },
    confidence: 0.9,
    writePolicy: {
      allowedTypes: ["artifact"]
    }
  }).submission;
  assert.equal(denied.status, "rejected");
  assert.equal(denied.gate.reasons.includes("role_not_allowed"), true);

  const privateState = workspace.savePrivateState({
    workspaceId: created.workspaceId,
    runId: run.runId,
    agentId: "Extractor",
    summary: "private scratch summary",
    state: {
      localOnly: true
    }
  });
  assert.equal(privateState.agentId, "Extractor");

  const artifact = workspace.createArtifact({
    workspaceId: created.workspaceId,
    runId: run.runId,
    level: "ExecutiveSummary",
    title: "Verify artifact",
    content: "Artifact content [ev-1]",
    citations: [{ evidenceId: "ev-1" }],
    coverageReport: {
      totalEvidence: 1,
      coveredEvidence: 1,
      score: 1
    },
    createdBy: "Merger"
  }).artifact;
  assert.equal(artifact.revision, 1);

  const issue = workspace.createIssue({
    workspaceId: created.workspaceId,
    runId: run.runId,
    type: "missing_important_evidence",
    title: "Missing important evidence",
    evidenceRefs: ["ev-1"],
    createdBy: "Reviewer"
  }).issue;
  assert.equal(issue.status, "open");

  const decision = workspace.createDecision({
    workspaceId: created.workspaceId,
    runId: run.runId,
    title: "Publish candidate",
    payload: {
      action: "publish"
    },
    createdBy: "Merger"
  }).decision;
  assert.equal(decision.status, "proposed");

  const full = workspace.getWorkspace({
    workspaceId: created.workspaceId,
    includePrivate: true
  });
  assert.equal(full.summary.runCount, 1);
  assert.equal(full.summary.artifactCount, 1);
  assert.equal(full.privateStates.length, 1);
  assert.equal(full.submissions.some((item) => item.status === "needs_review"), true);

  const listed = workspace.listWorkspaces({
    status: "active",
    includeSummary: true
  });
  assert.equal(listed.count, 1);
  assert.equal(listed.workspaces[0].summary.openIssueCount, 1);

  const resolvedSubmission = workspace.resolveSubmission({
    workspaceId: created.workspaceId,
    submissionId: canonicalChange.submissionId,
    resolution: "reject",
    reviewerId: "Reviewer",
    note: "canonical changes require human merge"
  }).submission;
  assert.equal(resolvedSubmission.status, "rejected");
  assert.equal(resolvedSubmission.gate.resolvedBy, "Reviewer");

  const resolvedIssue = workspace.updateIssue({
    workspaceId: created.workspaceId,
    issueId: issue.issueId,
    status: "resolved",
    reviewerId: "Reviewer",
    note: "verified in test"
  }).issue;
  assert.equal(resolvedIssue.status, "resolved");
  assert.equal(resolvedIssue.payload.resolution.resolvedBy, "Reviewer");

  const lock = workspace.acquireLock({
    workspaceId: created.workspaceId,
    targetType: "artifact",
    targetId: artifact.artifactId,
    ownerAgentId: "Merger",
    ttlMs: 60_000
  });
  assert.equal(lock.ok, true);
  assert.equal(lock.lock.ownerAgentId, "Merger");

  const deniedLock = workspace.acquireLock({
    workspaceId: created.workspaceId,
    targetType: "artifact",
    targetId: artifact.artifactId,
    ownerAgentId: "Reviewer",
    ttlMs: 60_000
  });
  assert.equal(deniedLock.ok, false);
  assert.equal(deniedLock.error, "lock_held");
  assert.equal(workspace.listLocks({ workspaceId: created.workspaceId }).length, 1);

  const released = workspace.releaseLock({
    workspaceId: created.workspaceId,
    targetType: "artifact",
    targetId: artifact.artifactId,
    ownerAgentId: "Merger"
  });
  assert.equal(released.released, true);
  assert.equal(workspace.listLocks({ workspaceId: created.workspaceId }).length, 0);

  const approvedArtifacts = workspace.updateArtifactsStatus(run.runId, "approved");
  assert.equal(approvedArtifacts.every((item) => item.status === "approved"), true);
} finally {
  workspace.close();
  await fs.rm(userDataPath, {
    recursive: true,
    force: true
  });
}

console.log("Agent workspace verification passed.");
