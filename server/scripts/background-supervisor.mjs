#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  backgroundDefinitionForRole,
  normalizeBackgroundRoleList,
  writeBackgroundProcessState
} from "../platform/common/devops/process-status/background-process-status.mjs";
import {
  createRuntimeLogger,
  setRuntimeLogger,
  summarizeError,
  summarizeForLog
} from "../platform/common/observability/runtime-logger.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const workerEntryPath = path.join(projectRoot, "server", "scripts", "background-worker.mjs");

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function normalizePositiveInteger(value, fallback, min = 1, max = 3600) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function nowIso() {
  return new Date().toISOString();
}

function processRecordForRole(role, patch = {}) {
  const definition = backgroundDefinitionForRole(role);
  return {
    role,
    label: definition.label,
    description: definition.description,
    desired: true,
    pid: 0,
    status: "starting",
    startedAt: "",
    lastHeartbeatAt: "",
    restartCount: 0,
    lastExit: null,
    details: {},
    error: "",
    ...patch
  };
}

const args = parseArgs(process.argv.slice(2));
const userDataPath = path.resolve(
  String(
    args["data-dir"] ||
      process.env.SPLITALL_SERVER_DATA_DIR ||
      path.join(projectRoot, ".splitall-server-data")
  )
);
const roles = normalizeBackgroundRoleList(args.roles || args.role);
const intervalMs = normalizePositiveInteger(args["interval-ms"], 2500, 500, 60000);
const restartDelayMs = normalizePositiveInteger(args["restart-delay-ms"], 1500, 200, 60000);
const logger = createRuntimeLogger({
  userDataPath,
  runtimeOptions: {
    cwd: projectRoot,
    logDir: args["log-dir"] || process.env.SPLITALL_LOG_DIR || ""
  },
  component: "background-supervisor"
});
setRuntimeLogger(logger);
const children = new Map();
const records = new Map(roles.map((role) => [role, processRecordForRole(role)]));
let closing = false;
let stateTimer = null;

function serializeState() {
  return {
    supervisor: {
      pid: process.pid,
      startedAt,
      status: closing ? "stopping" : "running",
      intervalMs,
      restartDelayMs,
      roles
    },
    processes: roles.map((role) => records.get(role) || processRecordForRole(role))
  };
}

async function persistState() {
  logger.debug("background.supervisor.state.persist.requested", {
    roles,
    childCount: children.size
  });
  await writeBackgroundProcessState(userDataPath, serializeState());
  logger.debug("background.supervisor.state.persisted", {
    roles,
    records: summarizeForLog(roles.map((role) => records.get(role) || processRecordForRole(role)))
  });
}

function spawnRole(role) {
  if (closing) {
    logger.debug("background.supervisor.spawn.skipped", {
      role,
      reason: "closing"
    });
    return;
  }
  const previous = records.get(role) || processRecordForRole(role);
  logger.info("background.supervisor.spawn.requested", {
    role,
    intervalMs,
    restartDelayMs,
    restartCount: previous.restartCount || 0
  });
  const child = spawn(process.execPath, [
    workerEntryPath,
    "--role",
    role,
    "--data-dir",
    userDataPath,
    "--interval-ms",
    String(intervalMs),
    "--log-dir",
    logger.logDir
  ], {
    cwd: projectRoot,
    env: {
      ...process.env,
      SPLITALL_BACKGROUND_WORKER_ROLE: role,
      SPLITALL_IMPORT_WORKER_EXTERNAL: role === "import-worker" ? "0" : process.env.SPLITALL_IMPORT_WORKER_EXTERNAL || ""
    },
    stdio: ["ignore", "ignore", "ignore", "ipc"]
  });
  const record = processRecordForRole(role, {
    restartCount: previous.restartCount || 0,
    pid: child.pid || 0,
    status: "starting",
    startedAt: nowIso(),
    details: previous.details || {}
  });
  records.set(role, record);
  children.set(role, child);
  logger.info("background.supervisor.spawned", {
    role,
    pid: child.pid || 0
  });
  void persistState();

  child.on("message", (message) => {
    if (!message || message.type !== "heartbeat") {
      logger.warn("background.supervisor.child_message.ignored", {
        role,
        message: summarizeForLog(message || {})
      });
      return;
    }
    const payload = message.payload || {};
    logger.debug("background.supervisor.child_heartbeat", {
      role,
      pid: child.pid || payload.pid || 0,
      status: payload.status || "",
      mode: payload.mode || "",
      details: summarizeForLog(payload.details || {}),
      error: payload.error || ""
    });
    records.set(role, {
      ...processRecordForRole(role),
      ...records.get(role),
      ...payload,
      pid: child.pid || payload.pid || 0,
      restartCount: records.get(role)?.restartCount || 0
    });
    void persistState();
  });

  child.once("exit", (code, signal) => {
    const current = records.get(role) || processRecordForRole(role);
    children.delete(role);
    logger.warn("background.supervisor.child_exited", {
      role,
      pid: child.pid || 0,
      code,
      signal,
      closing
    });
    records.set(role, {
      ...current,
      status: closing ? "stopped" : "exited",
      lastExit: {
        code,
        signal,
        at: nowIso()
      },
      pid: 0,
      restartCount: Number(current.restartCount || 0) + (closing ? 0 : 1)
    });
    void persistState();
    if (!closing) {
      logger.info("background.supervisor.restart_scheduled", {
        role,
        restartDelayMs
      });
      setTimeout(() => spawnRole(role), restartDelayMs).unref?.();
    }
  });

  child.once("error", (error) => {
    const current = records.get(role) || processRecordForRole(role);
    logger.error("background.supervisor.child_error", {
      role,
      pid: child.pid || 0,
      error: summarizeError(error)
    });
    records.set(role, {
      ...current,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      lastHeartbeatAt: nowIso()
    });
    void persistState();
  });
}

async function shutdown(code = 0) {
  logger.info("background.supervisor.shutdown.started", {
    code,
    childCount: children.size
  });
  closing = true;
  if (stateTimer) {
    clearInterval(stateTimer);
  }
  await persistState();
  for (const child of children.values()) {
    try {
      child.kill("SIGTERM");
    } catch {
      // Ignore shutdown races.
    }
  }
  setTimeout(() => {
    for (const child of children.values()) {
      try {
        child.kill("SIGKILL");
      } catch {
        // Ignore already exited workers.
      }
    }
    logger.info("background.supervisor.shutdown.completed", {
      code
    });
    logger.close().finally(() => process.exit(code));
  }, 3000).unref?.();
}

const startedAt = nowIso();
logger.info("background.supervisor.starting", {
  roles,
  userDataPath,
  intervalMs,
  restartDelayMs,
  pid: process.pid
});
for (const role of roles) {
  spawnRole(role);
}
stateTimer = setInterval(() => {
  void persistState();
}, intervalMs);
stateTimer.unref?.();
await persistState();

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

process.on("uncaughtException", (error) => {
  logger.error("background.supervisor.uncaught_exception", {
    error: summarizeError(error)
  });
  records.set("supervisor", processRecordForRole("supervisor", {
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    lastHeartbeatAt: nowIso()
  }));
  void persistState().finally(() => logger.close().finally(() => process.exit(1)));
});

process.on("unhandledRejection", (error) => {
  logger.error("background.supervisor.unhandled_rejection", {
    error: summarizeError(error)
  });
  records.set("supervisor", processRecordForRole("supervisor", {
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    lastHeartbeatAt: nowIso()
  }));
  void persistState().finally(() => logger.close().finally(() => process.exit(1)));
});
