import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { getBackgroundProcessStatus } from "./background-process-status.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, "../config/default-monitor-alerts.json");
const ALERT_DIR = "background";
const ALERT_CONFIG_FILE = "monitor-alerts.json";
const ALERT_SHELL_CONFIG_FILE = "monitor-alerts.sh.conf";
const ALERT_STATE_FILE = "monitor-alerts-state.json";
const DEFAULT_SERVICE_LABEL = "dev.splitall.background-supervisor";

function nowIso() {
  return new Date().toISOString();
}

export function monitorAlertConfigPath(userDataPath) {
  return path.join(userDataPath, ALERT_DIR, ALERT_CONFIG_FILE);
}

export function monitorAlertShellConfigPath(userDataPath) {
  return path.join(userDataPath, ALERT_DIR, ALERT_SHELL_CONFIG_FILE);
}

export function monitorAlertStatePath(userDataPath) {
  return path.join(userDataPath, ALERT_DIR, ALERT_STATE_FILE);
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

async function atomicWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return value === true || value === "true" || value === "1" || value === "yes";
}

function normalizeInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function normalizeRule(input = {}, fallback = {}) {
  return {
    ...fallback,
    ...input,
    enabled: normalizeBoolean(input.enabled, fallback.enabled !== false),
    severity: String(input.severity || fallback.severity || "warning").trim() || "warning",
    statuses: normalizeStringArray(input.statuses || fallback.statuses),
    restartCountThreshold: normalizeInteger(
      input.restartCountThreshold ?? fallback.restartCountThreshold,
      Number(fallback.restartCountThreshold || 1),
      1,
      100000
    ),
    titleTemplate: String(input.titleTemplate || fallback.titleTemplate || "{{label}} 告警"),
    messageTemplate: String(input.messageTemplate || fallback.messageTemplate || "{{label}} {{status}}")
  };
}

export async function loadMonitorAlertConfig(userDataPath) {
  const defaults = asObject(await readJsonIfExists(DEFAULT_CONFIG_PATH, {}));
  const override = asObject(await readJsonIfExists(monitorAlertConfigPath(userDataPath), {}));
  const defaultRules = asObject(defaults.rules);
  const overrideRules = asObject(override.rules);
  const ruleIds = [...new Set([...Object.keys(defaultRules), ...Object.keys(overrideRules)])];
  const rules = {};
  for (const ruleId of ruleIds) {
    rules[ruleId] = normalizeRule(asObject(overrideRules[ruleId]), asObject(defaultRules[ruleId]));
  }
  return {
    ...defaults,
    ...override,
    schemaVersion: 1,
    enabled: normalizeBoolean(override.enabled, defaults.enabled !== false),
    intervalMs: normalizeInteger(override.intervalMs ?? defaults.intervalMs, 5000, 1000, 600000),
    heartbeatStaleMs: normalizeInteger(
      override.heartbeatStaleMs ?? defaults.heartbeatStaleMs,
      15000,
      1000,
      600000
    ),
    historyLimit: normalizeInteger(override.historyLimit ?? defaults.historyLimit, 200, 10, 5000),
    serviceLabel: String(override.serviceLabel || defaults.serviceLabel || DEFAULT_SERVICE_LABEL),
    rules
  };
}

export async function saveMonitorAlertConfig(userDataPath, input = {}) {
  const config = await normalizeMonitorAlertConfig(input);
  await atomicWriteJson(monitorAlertConfigPath(userDataPath), config);
  await writeMonitorAlertShellConfig(userDataPath, config);
  return config;
}

async function normalizeMonitorAlertConfig(input = {}) {
  const defaults = await readJsonIfExists(DEFAULT_CONFIG_PATH, {});
  const merged = {
    ...asObject(defaults),
    ...asObject(input),
    rules: {
      ...asObject(defaults.rules),
      ...asObject(input.rules)
    }
  };
  const ruleIds = Object.keys(asObject(merged.rules));
  const rules = {};
  for (const ruleId of ruleIds) {
    rules[ruleId] = normalizeRule(asObject(merged.rules[ruleId]), asObject(defaults.rules?.[ruleId]));
  }
  return {
    schemaVersion: 1,
    enabled: normalizeBoolean(merged.enabled, true),
    intervalMs: normalizeInteger(merged.intervalMs, 5000, 1000, 600000),
    heartbeatStaleMs: normalizeInteger(merged.heartbeatStaleMs, 15000, 1000, 600000),
    historyLimit: normalizeInteger(merged.historyLimit, 200, 10, 5000),
    serviceLabel: String(merged.serviceLabel || DEFAULT_SERVICE_LABEL),
    rules
  };
}

function renderTemplate(template, variables = {}) {
  return String(template || "").replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = variables[key];
    return value === undefined || value === null || value === "" ? "—" : String(value);
  });
}

function shellQuote(value) {
  return `'${String(value ?? "").replace(/'/g, `'\\''`)}'`;
}

async function writeMonitorAlertShellConfig(userDataPath, config) {
  const rule = config.rules?.processNotRunning || {};
  const payload = [
    `ALERTS_ENABLED=${config.enabled ? "1" : "0"}`,
    `INTERVAL_SECONDS=${Math.max(1, Math.round(Number(config.intervalMs || 5000) / 1000))}`,
    `HISTORY_LIMIT=${Number(config.historyLimit || 200)}`,
    `SERVICE_LABEL=${shellQuote(config.serviceLabel || DEFAULT_SERVICE_LABEL)}`,
    `PROCESS_NOT_RUNNING_ENABLED=${rule.enabled === false ? "0" : "1"}`,
    `PROCESS_NOT_RUNNING_SEVERITY=${shellQuote(rule.severity || "critical")}`,
    `PROCESS_NOT_RUNNING_TITLE_TEMPLATE=${shellQuote(rule.titleTemplate || "{{label}} 未正常运行")}`,
    `PROCESS_NOT_RUNNING_MESSAGE_TEMPLATE=${shellQuote(rule.messageTemplate || "{{label}} 当前状态为 {{status}}，PID {{pid}}。")}`,
    ""
  ].join("\n");
  const filePath = monitorAlertShellConfigPath(userDataPath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, payload, "utf8");
}

function buildAlert({ alertId, ruleId, rule, variables }) {
  return {
    alertId,
    ruleId,
    severity: rule.severity,
    title: renderTemplate(rule.titleTemplate, variables),
    message: renderTemplate(rule.messageTemplate, variables),
    source: variables.source || "",
    role: variables.role || "",
    status: variables.status || "",
    active: true,
    firstSeenAt: nowIso(),
    lastSeenAt: nowIso(),
    variables
  };
}

async function loadState(userDataPath) {
  return asObject(await readJsonIfExists(monitorAlertStatePath(userDataPath), {}));
}

function mergeAlertHistory({ previous = {}, activeAlerts = [], limit }) {
  const previousById = new Map((previous.activeAlerts || []).map((alert) => [alert.alertId, alert]));
  const active = activeAlerts.map((alert) => {
    const previousAlert = previousById.get(alert.alertId);
    return {
      ...alert,
      firstSeenAt: previousAlert?.firstSeenAt || alert.firstSeenAt,
      lastSeenAt: nowIso()
    };
  });
  const activeIds = new Set(active.map((alert) => alert.alertId));
  const resolved = (previous.activeAlerts || [])
    .filter((alert) => !activeIds.has(alert.alertId))
    .map((alert) => ({
      ...alert,
      active: false,
      resolvedAt: nowIso()
    }));
  const cycleIds = new Set([
    ...active.map((alert) => alert.alertId),
    ...resolved.map((alert) => alert.alertId)
  ]);
  const retainedHistory = dedupeAlertHistory(Array.isArray(previous.history) ? previous.history : [])
    .filter((alert) => !cycleIds.has(alert.alertId));
  const history = [
    ...active,
    ...resolved,
    ...retainedHistory
  ].slice(0, limit);
  return { active, history };
}

function dedupeAlertHistory(history = []) {
  const seen = new Set();
  return history.filter((alert) => {
    const key = String(alert.alertId || "");
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function evaluateAlerts({ backgroundStatus, config }) {
  if (!config.enabled) {
    return [];
  }
  const alerts = [];
  const rules = config.rules || {};
  const supervisorRule = rules.supervisorStopped || {};
  if (supervisorRule.enabled && !backgroundStatus.supervisor?.alive) {
    alerts.push(buildAlert({
      alertId: "monitor.supervisor.stopped",
      ruleId: "supervisorStopped",
      rule: supervisorRule,
      variables: {
        source: "supervisor",
        status: backgroundStatus.supervisor?.status || "stopped",
        pid: backgroundStatus.supervisor?.pid || "",
        serviceLabel: config.serviceLabel || DEFAULT_SERVICE_LABEL
      }
    }));
  }
  for (const processItem of backgroundStatus.processes || []) {
    const variables = {
      source: "background-process",
      role: processItem.role,
      label: processItem.label || processItem.role,
      description: processItem.description || "",
      status: processItem.status || "",
      mode: processItem.mode || "",
      pid: processItem.pid || "",
      restartCount: processItem.restartCount || 0,
      lastHeartbeatAt: processItem.lastHeartbeatAt || "",
      heartbeatAgeMs: processItem.heartbeatAgeMs ?? "",
      heartbeatAgeSeconds:
        processItem.heartbeatAgeMs === null || processItem.heartbeatAgeMs === undefined
          ? ""
          : Math.round(Number(processItem.heartbeatAgeMs || 0) / 1000)
    };
    const notRunningRule = rules.processNotRunning || {};
    if (
      notRunningRule.enabled &&
      normalizeStringArray(notRunningRule.statuses).includes(processItem.status)
    ) {
      alerts.push(buildAlert({
        alertId: `monitor.process.${processItem.role}.not_running`,
        ruleId: "processNotRunning",
        rule: notRunningRule,
        variables
      }));
    }
    const staleRule = rules.processStale || {};
    if (
      staleRule.enabled &&
      normalizeStringArray(staleRule.statuses).includes(processItem.status)
    ) {
      alerts.push(buildAlert({
        alertId: `monitor.process.${processItem.role}.stale`,
        ruleId: "processStale",
        rule: staleRule,
        variables
      }));
    }
    const restartedRule = rules.processRestarted || {};
    if (
      restartedRule.enabled &&
      Number(processItem.restartCount || 0) >= Number(restartedRule.restartCountThreshold || 1)
    ) {
      alerts.push(buildAlert({
        alertId: `monitor.process.${processItem.role}.restarted`,
        ruleId: "processRestarted",
        rule: restartedRule,
        variables
      }));
    }
  }
  return alerts;
}

export async function runMonitorAlertCycle(userDataPath) {
  const config = await loadMonitorAlertConfig(userDataPath);
  const backgroundStatus = await getBackgroundProcessStatus(userDataPath);
  const previous = await loadState(userDataPath);
  const evaluated = evaluateAlerts({ backgroundStatus, config });
  const { active, history } = mergeAlertHistory({
    previous,
    activeAlerts: evaluated,
    limit: config.historyLimit
  });
  const state = {
    schemaVersion: 1,
    ok: active.length === 0,
    status: !config.enabled ? "disabled" : active.length === 0 ? "healthy" : "alerting",
    updatedAt: nowIso(),
    configPath: monitorAlertConfigPath(userDataPath),
    shellConfigPath: monitorAlertShellConfigPath(userDataPath),
    statePath: monitorAlertStatePath(userDataPath),
    config,
    summary: {
      activeCount: active.length,
      criticalCount: active.filter((alert) => alert.severity === "critical").length,
      warningCount: active.filter((alert) => alert.severity === "warning").length,
      historyCount: history.length
    },
    activeAlerts: active,
    history
  };
  await atomicWriteJson(monitorAlertStatePath(userDataPath), state);
  return state;
}

export async function getMonitorAlertState(userDataPath) {
  const config = await loadMonitorAlertConfig(userDataPath);
  const state = await loadState(userDataPath);
  return {
    schemaVersion: 1,
    ok: state.ok !== false,
    status: state.status || (config.enabled ? "unknown" : "disabled"),
    updatedAt: state.updatedAt || "",
    configPath: monitorAlertConfigPath(userDataPath),
    shellConfigPath: state.shellConfigPath || monitorAlertShellConfigPath(userDataPath),
    statePath: monitorAlertStatePath(userDataPath),
    config,
    summary: state.summary || {
      activeCount: 0,
      criticalCount: 0,
      warningCount: 0,
      historyCount: 0
    },
    activeAlerts: Array.isArray(state.activeAlerts) ? state.activeAlerts : [],
    history: dedupeAlertHistory(Array.isArray(state.history) ? state.history : [])
  };
}
