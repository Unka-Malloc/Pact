import { createJobPipeline } from "../job-pipeline.mjs";
import { resolveArchiveBatchIdentity } from "../archive-batch-id.mjs";
import { createServerRuntime } from "../../../../platform/interactive/product-api.mjs";

function noop() {}

function getTestJobDelayMs(runtimeOptions = {}) {
  const delayValue = runtimeOptions?.testHooks?.jobDelayMs;
  const delay = Number(delayValue || 0);
  return Number.isFinite(delay) && delay > 0 ? delay : 0;
}

export async function runSplitJob(userDataPath, payload, options = {}) {
  const reportProgress =
    typeof options.onProgress === "function" ? options.onProgress : noop;
  const generatedAt = new Date().toISOString();
  const jobId = String(options.jobId || options.batchId || generatedAt);
  const archiveBatchIdentity = resolveArchiveBatchIdentity({
    archiveBatchId:
      payload?.checkpointReceipt?.archiveBatchId ||
      payload?.archiveBatchId ||
      payload?.checkpoint?.archiveBatchId ||
      "",
    batchId: payload?.batchId || payload?.checkpoint?.batchId || "",
    clientBatchId: payload?.clientBatchId || payload?.checkpoint?.clientBatchId || "",
    checkpointId:
      payload?.checkpointReceipt?.checkpointId ||
      payload?.checkpointId ||
      payload?.checkpoint?.checkpointId ||
      "",
    manifestDigest:
      payload?.checkpointReceipt?.manifestSha256 ||
      payload?.checkpointReceipt?.manifestDigest ||
      payload?.checkpoint?.manifestDigest ||
      payload?.manifestSha256 ||
      "",
    inputDigest: payload?.checkpoint?.inputDigest || payload?.inputDigest || ""
  });
  const archiveBatchId = archiveBatchIdentity.archiveBatchId || String(options.batchId || jobId);
  const testJobDelayMs = getTestJobDelayMs(options.runtimeOptions || {});
  const runtime = await createServerRuntime({
    userDataPath,
    runtimeOptions: options.runtimeOptions || {}
  });
  const { metadataStore } = runtime;

  try {
    if (testJobDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, testJobDelayMs));
    }

    const pipeline = createJobPipeline({
      userDataPath,
      payload,
      runtime,
      reportProgress,
      jobId,
      generatedAt
    });
    const context = pipeline.createContext();
    return await pipeline.run(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : "执行失败";
    metadataStore.markBatchFailed(archiveBatchId, message);
    throw error;
  } finally {
    await runtime.close();
  }
}
