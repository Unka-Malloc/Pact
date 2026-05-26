import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createDurableWorkflowRuntime,
  DURABLE_WORKFLOW_PROTOCOL_VERSION,
  workflowId
} from "../platform/common/workflow/durable-workflow-store.mjs";

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-durable-workflow-"));

try {
  const runtime = createDurableWorkflowRuntime({ userDataPath });
  const id = workflowId("verify", "durable-workflow");
  const started = await runtime.startWorkflow({
    workflowId: id,
    workflowType: "external_kb_ingest",
    ownerKind: "external_kb_ingest",
    ownerId: "verify-ingest",
    idempotencyKey: "verify-ingest-v1",
    input: {
      providerId: "qdrant",
      batchId: "batch-1"
    },
    checkpointTreeId: "checkpoint_tree_verify"
  });
  assert.equal(started.protocolVersion, DURABLE_WORKFLOW_PROTOCOL_VERSION);
  assert.equal(started.status, "running");

  const scheduled = await runtime.scheduleActivity(id, {
    activityId: "parse-documents",
    activityType: "document_parse",
    idempotencyKey: "parse-documents:batch-1",
    input: { batchId: "batch-1" },
    retryPolicy: { maxAttempts: 5 },
    compensation: { action: "delete_staged_parse_outputs" }
  });
  assert.equal(scheduled.reused, false);
  await runtime.startActivity(id, "parse-documents");
  await runtime.heartbeatActivity(id, "parse-documents", {
    cursor: { offset: 4 },
    progressPercent: 40
  });

  const partialWrite = await runtime.beginExternalWrite(id, {
    writeId: "external-index-upsert",
    providerId: "qdrant",
    targetRef: "collection://pact/verify",
    idempotencyKey: "external-index-upsert:batch-1",
    input: { documentIds: ["doc-1"] },
    compensation: { action: "delete_vectors_by_batch", batchId: "batch-1" }
  });
  assert.equal(partialWrite.workflow.status, "paused");
  assert.equal(partialWrite.workflow.waitingReason, "external_partial_write_resolution");

  const humanReview = await runtime.requestHumanReview(id, {
    reviewType: "publish_gate",
    requestedBy: "workflow-verifier",
    reasons: ["external partial write needs confirmation"]
  });
  assert.equal(humanReview.workflow.status, "paused");

  const timer = await runtime.scheduleTimer(id, {
    timerName: "review-timeout",
    fireAt: "2000-01-01T00:00:00.000Z",
    payload: { reviewId: humanReview.humanReview.reviewId }
  });
  assert.equal(timer.timer.status, "scheduled");

  const afterCrashRuntime = createDurableWorkflowRuntime({ userDataPath });
  const recovered = await afterCrashRuntime.recoverWorkflow(id, {
    reason: "simulated_process_crash"
  });
  assert.equal(recovered.historyVerification.ok, true);
  assert.equal(recovered.workflow.status, "paused");
  assert.equal(recovered.workflow.waitingReason, "external_partial_write_resolution");
  assert.equal(
    recovered.workflow.activities.find((activity) => activity.activityId === "parse-documents").status,
    "scheduled"
  );
  assert.equal(recovered.workflow.externalWrites.find((write) => write.writeId === "external-index-upsert").status, "partial");

  const fired = await afterCrashRuntime.fireDueTimers({ now: "2026-01-01T00:00:00.000Z" });
  assert.equal(fired.count, 1);

  const resolved = await afterCrashRuntime.resolveHumanReview(id, humanReview.humanReview.reviewId, {
    decision: "approved",
    resolvedBy: "human-reviewer"
  });
  assert.equal(resolved.humanReview.status, "approved");
  assert.equal(resolved.workflow.waitingReason, "external_partial_write_resolution");

  const committed = await afterCrashRuntime.commitExternalWrite(id, "external-index-upsert", {
    confirmation: { providerId: "qdrant", batchId: "batch-1", persisted: true },
    output: { vectorCount: 1 }
  });
  assert.equal(committed.externalWrite.status, "committed");
  assert.equal(committed.workflow.status, "running");

  await afterCrashRuntime.startActivity(id, "parse-documents");
  const reused = await afterCrashRuntime.scheduleActivity(id, {
    activityType: "document_parse",
    idempotencyKey: "parse-documents:batch-1",
    input: { batchId: "batch-1" }
  });
  assert.equal(reused.reused, true);
  assert.equal(reused.activity.activityId, "parse-documents");

  await afterCrashRuntime.completeActivity(id, "parse-documents", {
    parsedDocumentCount: 1
  });
  const completed = await afterCrashRuntime.completeWorkflow(id, {
    indexed: true,
    batchId: "batch-1"
  });
  assert.equal(completed.status, "completed");
  assert.match(completed.outputHash, /^[a-f0-9]{64}$/);

  const finalRuntime = createDurableWorkflowRuntime({ userDataPath });
  const finalWorkflow = await finalRuntime.getWorkflowWithHistory(id);
  const verification = await finalRuntime.verifyWorkflow(id);
  assert.equal(verification.ok, true);
  assert.equal(finalWorkflow.status, "completed");
  assert.ok(finalWorkflow.history.some((event) => event.eventType === "workflow.recovered"));
  assert.ok(finalWorkflow.history.some((event) => event.eventType === "human_review.queued"));
  assert.ok(finalWorkflow.history.some((event) => event.eventType === "external_write.partial"));
  assert.ok(finalWorkflow.history.some((event) => event.eventType === "external_write.committed"));

  console.log("durable workflow verification passed");
} finally {
  await fs.rm(userDataPath, { recursive: true, force: true });
}
