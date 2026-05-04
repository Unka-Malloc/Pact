import { createJobManager } from "../../jobs/job-manager.mjs";
import { createProtocolEventBus } from "../../protocols/pubsub/event-bus.mjs";

export async function createImportWorkerRuntime({ userDataPath }) {
  const protocolEventBus = createProtocolEventBus({ userDataPath });
  const jobManager = createJobManager({
    userDataPath,
    processingEnabled: true,
    protocolEventBus
  });

  return {
    mode: "active",
    async tick() {
      const scan = await jobManager.scanPersistedQueue();
      const jobs = await jobManager.listJobs({ limit: 1 });
      return {
        status: "running",
        details: {
          mode: "external_import_queue_worker",
          scan,
          jobs: jobs.summary
        }
      };
    },
    async close() {
      await jobManager.close();
      await protocolEventBus.close?.();
    }
  };
}
