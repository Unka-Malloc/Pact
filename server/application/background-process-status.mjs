import fs from "node:fs/promises";
import path from "node:path";
import {
  atomicWriteJson,
  queueStateMutation,
  stateFileKey
} from "./state-coordinator.mjs";

export const BACKGROUND_PROCESS_SCHEMA_VERSION = 1;

export const BACKGROUND_PROCESS_DEFINITIONS = [
  {
    role: "import-worker",
    label: "导入解析 Worker",
    description: "轮询导入队列并执行解析、断点续传和入库。"
  },
  {
    role: "source-watcher",
    label: "目录同步 Worker",
    description: "监听持续同步目录并提交导入任务。"
  },
  {
    role: "maintenance-worker",
    label: "维护任务 Worker",
    description: "执行重建索引、清理、去重和进化学习等维护任务。"
  },
  {
    role: "agent-worker",
    label: "智能体 Worker",
    description: "执行智能检索、多智能体总结和评估任务。"
  }
];

function nowIso() {
  return new Date().toISOString();
}

export function backgroundStateDirectory(userDataPath) {
  return path.join(userDataPath, "background");
}

export function backgroundStatePath(userDataPath) {
  return path.join(backgroundStateDirectory(userDataPath), "processes.json");
}

function systemInspectionStatePath(userDataPath) {
  return path.join(backgroundStateDirectory(userDataPath), "monitor-alerts-state.json");
}

export function normalizeBackgroundRoleList(value) {
  const requested = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const known = new Set(BACKGROUND_PROCESS_DEFINITIONS.map((item) => item.role));
  const roles = requested.length
    ? requested.filter((item) => known.has(item))
    : BACKGROUND_PROCESS_DEFINITIONS.map((item) => item.role);
  return [...new Set(roles)];
}

export function backgroundDefinitionForRole(role) {
  return BACKGROUND_PROCESS_DEFINITIONS.find((item) => item.role === role) || {
    role,
    label: role,
    description: ""
  };
}

export async function writeBackgroundProcessState(userDataPath, state) {
  const filePath = backgroundStatePath(userDataPath);
  const payload = {
    schemaVersion: BACKGROUND_PROCESS_SCHEMA_VERSION,
    updatedAt: nowIso(),
    ...state
  };
  return queueStateMutation(stateFileKey(filePath), async () => {
    await atomicWriteJson(filePath, payload);
    return payload;
  });
}

async function readStateFile(userDataPath) {
  try {
    return JSON.parse(await fs.readFile(backgroundStatePath(userDataPath), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function isPidAlive(pid) {
  const numericPid = Number(pid || 0);
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    return false;
  }
  try {
    process.kill(numericPid, 0);
    return true;
  } catch {
    return false;
  }
}

function withRuntimeStatus(processRecord, nowMs) {
  const lastHeartbeatAt = String(processRecord.lastHeartbeatAt || "");
  const heartbeatMs = Date.parse(lastHeartbeatAt);
  const startedAtMs = Date.parse(String(processRecord.startedAt || ""));
  const withinStartupGrace =
    Number.isFinite(startedAtMs) && nowMs - startedAtMs <= 15000;
  const heartbeatAgeMs = Number.isFinite(heartbeatMs) ? Math.max(0, nowMs - heartbeatMs) : null;
  const alive = isPidAlive(processRecord.pid);
  const stale = !withinStartupGrace && (heartbeatAgeMs === null || heartbeatAgeMs > 15000);
  const desired = processRecord.desired !== false;
  let status = String(processRecord.status || "unknown");
  if (desired && (!alive || stale)) {
    status = alive ? "stale" : "stopped";
  }
  return {
    ...processRecord,
    alive,
    stale,
    status,
    heartbeatAgeMs
  };
}

export async function getBackgroundProcessStatus(userDataPath) {
  const state = await readStateFile(userDataPath);
  const nowMs = Date.now();
  const definitions = BACKGROUND_PROCESS_DEFINITIONS;
  if (!state) {
    return {
      schemaVersion: BACKGROUND_PROCESS_SCHEMA_VERSION,
      ok: false,
      status: "unavailable",
      updatedAt: "",
      statePath: backgroundStatePath(userDataPath),
      supervisor: {
        pid: 0,
        alive: false,
        status: "stopped"
      },
      processes: [
        ...definitions.map((definition) => ({
          ...definition,
          desired: true,
          pid: 0,
          alive: false,
          stale: true,
          status: "missing",
          restartCount: 0,
          heartbeatAgeMs: null
        })),
        await getSystemInspectionProcess(userDataPath, nowMs)
      ]
    };
  }

  const supervisor = {
    ...(state.supervisor || {}),
    alive: isPidAlive(state.supervisor?.pid),
    status: isPidAlive(state.supervisor?.pid) ? "running" : "stopped"
  };
  const byRole = new Map((state.processes || []).map((item) => [item.role, item]));
  const processes = definitions.map((definition) =>
    withRuntimeStatus(
      {
        ...definition,
        desired: true,
        pid: 0,
        status: "missing",
        restartCount: 0,
        ...(byRole.get(definition.role) || {})
      },
      nowMs
    )
  );
  processes.push(await getSystemInspectionProcess(userDataPath, nowMs));
  const failedCount = processes.filter((item) =>
    item.desired && !["running", "standby"].includes(item.status)
  ).length;
  return {
    ...state,
    ok: supervisor.alive && failedCount === 0,
    status: supervisor.alive
      ? failedCount === 0
        ? "healthy"
        : "degraded"
      : "supervisor_stopped",
    statePath: backgroundStatePath(userDataPath),
    supervisor,
    processes
  };
}

async function getSystemInspectionProcess(userDataPath, nowMs) {
  let state = null;
  try {
    state = JSON.parse(await fs.readFile(systemInspectionStatePath(userDataPath), "utf8"));
  } catch {
    state = null;
  }
  const daemon = state?.inspectionDaemon || {};
  return withRuntimeStatus(
    {
      role: "system-inspection",
      label: "系统巡检",
      description: "由 Node.js 执行的系统巡检守护进程，负责写入后台告警状态。",
      desired: true,
      pid: Number(daemon.pid || 0),
      status: state ? "running" : "missing",
      mode: "system-js",
      startedAt: "",
      lastHeartbeatAt: state?.updatedAt || "",
      restartCount: 0,
      lastExit: null,
      details: {
        alertStatus: state?.status || "unknown",
        activeCount: state?.summary?.activeCount || 0,
        criticalCount: state?.summary?.criticalCount || 0,
        warningCount: state?.summary?.warningCount || 0,
        shellConfigPath: state?.shellConfigPath || "",
        statePath: state?.statePath || systemInspectionStatePath(userDataPath)
      },
      error: ""
    },
    nowMs
  );
}
