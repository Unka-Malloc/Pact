import fs from "node:fs/promises";
import path from "node:path";
import {
  atomicWriteJson,
  queueStateMutation,
  stateFileKey
} from "../../platform-core/state-coordinator.mjs";
import {
  composeUnifiedSystemStatus,
  unifiedRegistrationForProcess
} from "../unified-registration-core/unified-registration.mjs";

export const BACKGROUND_PROCESS_SCHEMA_VERSION = 1;

export const BACKGROUND_PROCESS_DEFINITIONS = [
  {
    role: "import-worker",
    label: "导入解析 Worker",
    description: "轮询导入队列并执行解析、断点续传和入库。",
    processType: "service",
    responsibility: "运行导入解析队列服务。",
    services: ["导入解析队列", "断点续传恢复", "知识入库"],
    features: ["工作队列", "知识库入库", "checkpoint 恢复"],
    monitors: ["import_parse_job 队列心跳", "checkpoint tree 更新"],
    alerts: ["queueInterrupted", "processNotRunning", "processStale", "processRestarted"]
  },
  {
    role: "source-watcher",
    label: "目录同步 Worker",
    description: "监听持续同步目录并提交导入任务。",
    processType: "service",
    responsibility: "运行数据源目录同步服务。",
    services: ["目录同步", "数据源变更扫描", "导入任务提交"],
    features: ["数据源", "知识库入库", "工作队列"],
    monitors: ["source watcher tick", "导入任务提交状态"],
    alerts: ["processNotRunning", "processStale", "processRestarted"]
  },
  {
    role: "maintenance-worker",
    label: "维护任务 Worker",
    description: "执行重建索引、清理、去重和进化学习等维护任务。",
    processType: "service",
    responsibility: "运行维护任务和智能巡检调度服务。",
    services: ["智能巡检调度", "索引重建", "清理去重", "进化学习"],
    features: ["智能巡检", "知识库维护", "工作队列"],
    monitors: ["maintenance-agent runs", "维护任务队列"],
    alerts: ["processNotRunning", "processStale", "processRestarted"]
  },
  {
    role: "agent-worker",
    label: "智能体 Worker",
    description: "执行智能检索、多智能体总结和评估任务。",
    processType: "service",
    responsibility: "运行智能体任务服务。",
    services: ["智能检索", "多智能体总结", "评估任务"],
    features: ["智能体", "信息流", "知识检索"],
    monitors: ["agent task tick", "智能体运行状态"],
    alerts: ["processNotRunning", "processStale", "processRestarted"]
  }
];

const ROLE_FEATURE_IDS = Object.freeze({
  "import-worker": ["work-queue-core"],
  "source-watcher": ["knowledge-core"],
  "maintenance-worker": ["maintenance-agent-runbooks"],
  "agent-worker": ["agent-exploration", "knowledge-distillation"]
});

function activeConsoleFeatureIdsFromEnv() {
  const explicit = String(process.env.SPLITALL_FEATURES || "").trim();
  if (!explicit) {
    return null;
  }
  return new Set(explicit.split(",").map((item) => item.trim()).filter(Boolean));
}

function isRoleEnabledByFeatures(role = "") {
  const active = activeConsoleFeatureIdsFromEnv();
  if (!active) {
    return true;
  }
  const requiredAny = ROLE_FEATURE_IDS[role] || [];
  return requiredAny.length === 0 || requiredAny.some((featureId) => active.has(featureId));
}

const SERVER_PROCESS_DEFINITIONS = [
  {
    role: "server-main",
    label: "SplitAll 服务端",
    description: "承载控制台、HTTP API、JSON-RPC、CLI 转发和本地运行时的主服务进程。",
    processType: "service",
    responsibility: "运行服务端主调用面和控制台 API。",
    services: ["HTTP API", "JSON-RPC", "CLI 转发", "Server Console"],
    features: ["系统配置", "工作队列", "知识库", "智能体", "运维监控"],
    monitors: ["进程存活", "请求入口"],
    alerts: ["processNotRunning", "processStale"]
  },
  {
    role: "background-supervisor",
    label: "后台进程守护器",
    description: "守护并重启后台 Worker 进程，持续写入后台进程状态。",
    processType: "daemon",
    responsibility: "守护后台 Worker 进程。",
    services: [],
    features: ["运维监控", "工作队列"],
    monitors: ["import-worker", "source-watcher", "maintenance-worker", "agent-worker"],
    alerts: ["supervisorStopped", "processNotRunning", "processRestarted"]
  },
  {
    role: "system-inspection",
    label: "系统巡检",
    description: "由 Node.js 执行的系统巡检守护进程，负责写入后台告警状态。",
    processType: "daemon",
    responsibility: "巡检服务端进程和工作队列，生成运维报警。",
    services: [],
    features: ["运维监控", "报警", "工作队列恢复"],
    monitors: ["后台进程状态", "queue-monitor 队列闭环", "checkpoint/log 证据"],
    alerts: ["processNotRunning", "processStale", "queueInterrupted"]
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
  return [...new Set(roles)].filter(isRoleEnabledByFeatures);
}

export function backgroundDefinitionForRole(role) {
  return [...BACKGROUND_PROCESS_DEFINITIONS, ...SERVER_PROCESS_DEFINITIONS].find((item) => item.role === role) || {
    role,
    label: role,
    description: "",
    processType: "service",
    responsibility: "",
    services: [],
    features: [],
    monitors: [],
    alerts: []
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

function serverMainProcess(nowMs) {
  const definition = backgroundDefinitionForRole("server-main");
  return withRuntimeStatus(
    {
      ...definition,
      desired: true,
      pid: process.pid,
      alive: true,
      stale: false,
      status: "running",
      mode: "node-service",
      startedAt: new Date(nowMs - Math.round(process.uptime() * 1000)).toISOString(),
      lastHeartbeatAt: nowIso(),
      restartCount: 0,
      lastExit: null,
      details: {
        nodeVersion: process.version,
        platform: process.platform,
        cwd: process.cwd()
      },
      error: ""
    },
    nowMs
  );
}

function backgroundSupervisorProcess(supervisor, nowMs, stateUpdatedAt = "") {
  const definition = backgroundDefinitionForRole("background-supervisor");
  const alive = isPidAlive(supervisor?.pid);
  return withRuntimeStatus(
    {
      ...definition,
      desired: true,
      pid: Number(supervisor?.pid || 0),
      alive,
      stale: !alive,
      status: alive ? "running" : "stopped",
      mode: "node-daemon",
      startedAt: supervisor?.startedAt || "",
      lastHeartbeatAt: stateUpdatedAt || supervisor?.updatedAt || supervisor?.startedAt || "",
      restartCount: 0,
      lastExit: null,
      details: {
        intervalMs: supervisor?.intervalMs || 0,
        restartDelayMs: supervisor?.restartDelayMs || 0,
        roles: supervisor?.roles || []
      },
      error: ""
    },
    nowMs
  );
}

function attachProcessRegistration(processItem) {
  return {
    ...processItem,
    unifiedRegistration: unifiedRegistrationForProcess(processItem)
  };
}

function buildProcessSystemStatus(processes, updatedAt = "") {
  return composeUnifiedSystemStatus(
    processes.map((item) => item.unifiedRegistration || unifiedRegistrationForProcess(item)),
    {
      source: "background-process-status",
      updatedAt: updatedAt || nowIso()
    }
  );
}

export async function getBackgroundProcessStatus(userDataPath) {
  const state = await readStateFile(userDataPath);
  const nowMs = Date.now();
  const definitions = BACKGROUND_PROCESS_DEFINITIONS;
  if (!state) {
    const supervisor = {
      pid: 0,
      alive: false,
      status: "stopped"
    };
    const processes = [
      serverMainProcess(nowMs),
      backgroundSupervisorProcess(supervisor, nowMs),
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
    ].map(attachProcessRegistration);
    return {
      schemaVersion: BACKGROUND_PROCESS_SCHEMA_VERSION,
      ok: false,
      status: "unavailable",
      updatedAt: "",
      statePath: backgroundStatePath(userDataPath),
      supervisor,
      processes,
      systemStatus: buildProcessSystemStatus(processes)
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
  processes.unshift(backgroundSupervisorProcess(supervisor, nowMs, state.updatedAt || ""));
  processes.unshift(serverMainProcess(nowMs));
  processes.push(await getSystemInspectionProcess(userDataPath, nowMs));
  const registeredProcesses = processes.map(attachProcessRegistration);
  const failedCount = registeredProcesses.filter((item) =>
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
    processes: registeredProcesses,
    systemStatus: buildProcessSystemStatus(registeredProcesses, state.updatedAt || "")
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
  const definition = backgroundDefinitionForRole("system-inspection");
  return withRuntimeStatus(
    {
      ...definition,
      role: "system-inspection",
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
