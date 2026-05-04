import { createJobPipeline } from "./application/job-pipeline.mjs";
import { createServerRuntime } from "./runtime/server-runtime.mjs";

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
    metadataStore.markBatchFailed(jobId, message);
    throw error;
  } finally {
    await runtime.close();
  }
}
