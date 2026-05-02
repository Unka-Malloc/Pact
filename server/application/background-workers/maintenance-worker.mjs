import { createMaintenanceAgentService } from "../MaintenanceAgent/index.mjs";
import { loadDiscoveryConfig } from "../../discovery-config.mjs";
import { createJobManager } from "../../jobs/job-manager.mjs";
import { createProtocolEventBus } from "../../protocols/pubsub/event-bus.mjs";
import { createServerRuntime } from "../../runtime/server-runtime.mjs";

export async function createMaintenanceWorkerRuntime({ userDataPath }) {
  const protocolEventBus = createProtocolEventBus({ userDataPath });
  const runtime = await createServerRuntime({ userDataPath });
  const jobManager = createJobManager({
    userDataPath,
    processingEnabled: false,
    protocolEventBus
  });
  const discoveryState = await loadDiscoveryConfig(userDataPath).catch(() => ({}));
  const maintenanceAgent = createMaintenanceAgentService({
    userDataPath,
    runtime,
    jobManager,
    metadataStore: runtime.metadataStore,
    protocolEventBus,
    getDiscoveryState: () => discoveryState,
    getListenUrl: () => discoveryState.activeServiceUrl || discoveryState.listenUrl || "",
    schedulerEnabled: true
  });
  await maintenanceAgent.start();

  return {
    mode: "active",
    async tick() {
      await maintenanceAgent.tickScheduler();
      const summary = await maintenanceAgent.getConsoleSummary();
      return {
        status: "running",
        details: {
          mode: "external_maintenance_scheduler",
          enabled: summary.config?.enabled === true,
          activeRunId: summary.activeRunId || "",
          queuedRunIds: summary.queuedRunIds || [],
          pendingApprovalCount: summary.pendingApprovalCount || 0,
          nextRunAt: summary.nextRunAt || "",
          latestRunStatus: summary.latestRun?.status || ""
        }
      };
    },
    async close() {
      await maintenanceAgent.close();
      await jobManager.close();
      await runtime.close();
      await protocolEventBus.close?.();
    }
  };
}
