#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadMonitorAlertConfig,
  runMonitorAlertCycle
} from "../platform/common/devops/monitor-alert-core/monitor-alerts.mjs";
import { inspectQueueMonitor } from "../services/client/work-queue-core/queue-monitor.mjs";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--project-root") {
      args.projectRoot = argv[index + 1] || "";
      index += 1;
    } else if (item === "--data-dir") {
      args.dataDir = argv[index + 1] || "";
      index += 1;
    }
  }
  return args;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

const args = parseArgs(process.argv.slice(2));
const projectRoot =
  args.projectRoot ||
  path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const dataDir =
  args.dataDir ||
  process.env.SPLITALL_SERVER_DATA_DIR ||
  path.join(projectRoot, ".splitall-server-data");

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loop() {
  while (true) {
    let intervalMs = 5000;
    try {
      const config = await loadMonitorAlertConfig(dataDir);
      intervalMs = normalizeInteger(config.intervalMs, 5000, 1000, 600000);
      await runMonitorAlertCycle(dataDir, {
        queueMonitor: {
          inspect: (input) => inspectQueueMonitor({ userDataPath: dataDir, ...input })
        },
        inspectionDaemon: {
          pid: process.pid,
          status: "running",
          updatedAt: nowIso(),
          projectRoot,
          dataDir,
          supervisorServiceLabel: config.serviceLabel || "dev.splitall.background-supervisor",
          runtime: "node"
        }
      });
    } catch (error) {
      console.error(`[system-inspection] ${error?.stack || error?.message || error}`);
    }
    await sleep(intervalMs);
  }
}

await loop();
