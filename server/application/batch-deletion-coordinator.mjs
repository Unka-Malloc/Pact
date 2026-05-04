import fs from "node:fs/promises";
import path from "node:path";

function getJobDirectory(userDataPath, jobId) {
  return path.join(userDataPath, "jobs", jobId);
}

async function removePath(targetPath) {
  if (!targetPath) {
    return;
  }

  await fs.rm(targetPath, {
    recursive: true,
    force: true
  });
}

export function createBatchDeletionCoordinator({ userDataPath, jobManager, metadataStore, runtime = null }) {
  async function executeOperation(operation) {
    let current = operation;
    const state = {
      jobDirectory: getJobDirectory(userDataPath, current.batchId),
      objectBatchPath: metadataStore.getBatchArtifactPaths(current.batchId).objectBatchPath,
      ...(current.state || {})
    };

    metadataStore.updateBatchStatus(current.batchId, "deleting", current.error || "");

    if (!state.runtimeDeleted) {
      const deletedJob = await jobManager.deleteJob(current.batchId);
      state.deletedJob = deletedJob || null;
      state.runtimeDeleted = true;
      current = metadataStore.updateDeletionOperation(current.operationId, {
        status: "metadata_pending",
        state
      });
    }

    if (!state.metadataDeleted) {
      const knowledgeCore = runtime?.mounts?.knowledgeBase;
      if (knowledgeCore && typeof knowledgeCore.deleteBatch === "function") {
        await knowledgeCore.deleteBatch(current.batchId);
      }
      metadataStore.deleteBatchRecords(current.batchId);
      metadataStore.deleteBatchRow(current.batchId);
      state.metadataDeleted = true;
      current = metadataStore.updateDeletionOperation(current.operationId, {
        status: "artifact_cleanup_pending",
        state
      });
    }

    if (!state.artifactsDeleted) {
      await removePath(state.objectBatchPath);
      await removePath(state.jobDirectory);
      state.artifactsDeleted = true;
      current = metadataStore.updateDeletionOperation(current.operationId, {
        status: "completed",
        state
      });
    }

    metadataStore.deleteDeletionOperation(current.operationId);
    return {
      ok: true,
      deletedJob: state.deletedJob || null,
      batchId: current.batchId
    };
  }

  return {
    async deleteBatch(batchId) {
      const existingJob = await jobManager.getJob(batchId);
      const hasBatch = metadataStore.hasBatch(batchId);
      const existing = metadataStore.getDeletionOperationByBatchId(batchId);
      if (!existing && !existingJob && !hasBatch) {
        return null;
      }
      const operation =
        existing ||
        metadataStore.upsertDeletionOperation({
          batchId,
          jobId: batchId,
          status: "runtime_pending",
          state: {
            jobDirectory: getJobDirectory(userDataPath, batchId),
            objectBatchPath: metadataStore.getBatchArtifactPaths(batchId).objectBatchPath,
            runtimeDeleted: false,
            metadataDeleted: false,
            artifactsDeleted: false
          }
        });

      try {
        return await executeOperation(operation);
      } catch (error) {
        const latest = metadataStore.getDeletionOperationByBatchId(batchId) || operation;
        metadataStore.updateDeletionOperation(operation.operationId, {
          status:
            latest.state?.metadataDeleted ? "artifact_cleanup_pending" : "metadata_pending",
          state: {
            ...latest.state
          },
          error: error instanceof Error ? error.message : "删除失败"
        });
        throw error;
      }
    },
    async resumePendingDeletions() {
      const operations = metadataStore.listPendingDeletionOperations();
      for (const operation of operations) {
        try {
          await executeOperation(operation);
        } catch {
          // Keep the pending operation for the next retry cycle.
        }
      }
    }
  };
}
