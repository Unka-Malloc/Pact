import { createAgentWorkerRuntime } from "./agent-worker.mjs";
import { createImportWorkerRuntime } from "./import-worker.mjs";
import { createMaintenanceWorkerRuntime } from "./maintenance-worker.mjs";
import { createSourceWatcherWorkerRuntime } from "./source-watcher-worker.mjs";

const WORKER_FACTORIES = {
  "agent-worker": createAgentWorkerRuntime,
  "import-worker": createImportWorkerRuntime,
  "maintenance-worker": createMaintenanceWorkerRuntime,
  "source-watcher": createSourceWatcherWorkerRuntime
};

export async function createBackgroundWorkerRuntime({ role, userDataPath }) {
  const factory = WORKER_FACTORIES[role];
  if (!factory) {
    throw new Error(`Unknown background worker role: ${role}`);
  }
  return factory({ role, userDataPath });
}
