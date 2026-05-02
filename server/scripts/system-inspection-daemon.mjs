import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

async function readTextIfExists(filePath, fallback = "") {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function readJsonIfExists(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function parseLegacyConfig(rawText) {
  const config = {};
  for (const line of String(rawText || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [rawKey, ...rawValueParts] = trimmed.split("=");
    const key = rawKey.trim();
    let value = rawValueParts.join("=").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) {
      config[key] = value;
    }
  }
  return config;
}

function normalizeInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function readSupervisorPid(processState) {
  const direct = Number(processState?.supervisor?.pid || 0);
  if (direct > 0) {
    return direct;
  }
  const processes = Array.isArray(processState?.processes) ? processState.processes : [];
  const supervisor = processes.find((item) => item?.role === "background-supervisor");
  return Number(supervisor?.pid || 0);
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function atomicWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

async function writeInspectionState(context) {
  const legacyConfig = parseLegacyConfig(await readTextIfExists(context.configPath));
  const alertsEnabled = String(legacyConfig.ALERTS_ENABLED ?? "1") !== "0";
  const serviceLabel = String(
    legacyConfig.SERVICE_LABEL ||
      process.env.SPLITALL_BACKGROUND_SUPERVISOR_LABEL ||
      "dev.splitall.background-supervisor",
  );
  const processState = await readJsonIfExists(context.processStatePath, {});
  const supervisorPid = readSupervisorPid(processState);
  const supervisorRunning = pidAlive(supervisorPid);
  const supervisorStatus = !alertsEnabled ? "disabled" : supervisorRunning ? "running" : "stopped";
  const ok = !alertsEnabled || supervisorRunning;
  const updatedAt = nowIso();
  const activeAlerts = ok
    ? []
    : [
        {
          alertId: "monitor.supervisor.stopped",
          ruleId: "supervisorStopped",
          severity: "critical",
          title: "后台 Supervisor 未正常运行",
          message: "后台 supervisor 未运行或心跳状态不可用。",
          source: "system-inspection",
          role: "background-supervisor",
          status: "stopped",
          active: true,
        },
      ];

  await atomicWriteJson(context.statePath, {
    schemaVersion: 1,
    ok,
    status: ok ? "healthy" : "alerting",
    updatedAt,
    configPath: path.join(context.backgroundDir, "monitor-alerts.json"),
    shellConfigPath: context.configPath,
    statePath: context.statePath,
    summary: {
      activeCount: activeAlerts.length,
      criticalCount: activeAlerts.filter((alert) => alert.severity === "critical").length,
      warningCount: activeAlerts.filter((alert) => alert.severity === "warning").length,
      historyCount: activeAlerts.length,
    },
    activeAlerts,
    history: activeAlerts,
    inspectionDaemon: {
      pid: process.pid,
      status: "running",
      updatedAt,
      projectRoot: context.projectRoot,
      dataDir: context.dataDir,
      supervisorServiceLabel: serviceLabel,
      supervisorPid,
      supervisorStatus,
      runtime: "node",
    },
  });
}

const args = parseArgs(process.argv.slice(2));
const projectRoot =
  args.projectRoot ||
  path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const dataDir =
  args.dataDir ||
  process.env.SPLITALL_SERVER_DATA_DIR ||
  path.join(projectRoot, "build", "server-data");
const backgroundDir = path.join(dataDir, "background");
const configPath = path.join(backgroundDir, "monitor-alerts.sh.conf");
const statePath = path.join(backgroundDir, "monitor-alerts-state.json");
const processStatePath = path.join(backgroundDir, "processes.json");

const context = {
  projectRoot,
  dataDir,
  backgroundDir,
  configPath,
  statePath,
  processStatePath,
};

async function loop() {
  const legacyConfig = parseLegacyConfig(await readTextIfExists(configPath));
  const intervalSeconds = normalizeInteger(legacyConfig.INTERVAL_SECONDS, 5, 1, 3600);
  while (true) {
    try {
      await writeInspectionState(context);
    } catch (error) {
      console.error(`[system-inspection] ${error?.stack || error?.message || error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
}

await loop();
