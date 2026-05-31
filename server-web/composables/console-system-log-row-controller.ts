import { computed } from "vue";
import type {
  BackgroundProcessItem,
  BackgroundProcessStatus,
  ConsoleAuditItem,
  KnowledgeSource,
  MonitorAlertItem,
  ProtocolEvent,
  SplitJob,
  ToolManagementAuditItem,
} from "../lib/types";
import type {
  AgentConfigurationAlert,
  KnowledgeLogRow,
  WorkQueueRow,
} from "../types/app";
import { jobStatusLabels } from "./console-defaults";
import { shortId } from "./console-agent-explore-utils";
import { formatBytes, jobStatusTone, parseTime } from "./console-format-utils";
import {
  sourceJobProgress,
  sourceSyncLabel,
  sourceSyncTone,
  traceProgressPercent,
  uploadTraceDetailText,
  uploadTraceTone,
} from "./console-knowledge-source-utils";
import { asRecord } from "./console-model-utils";
import {
  backgroundProcessLabel,
  backgroundProcessTone,
  monitorAlertSeverityLabel,
  monitorAlertSeverityTone,
  queueLifecycleLabel,
  queueLifecycleTone,
} from "./console-status-utils";

type ReadonlyValue<T> = {
  readonly value: T;
};

type ConsoleSystemLogRowControllerOptions = {
  activeKnowledgeSources: ReadonlyValue<KnowledgeSource[]>;
  activeMonitorAlerts: ReadonlyValue<MonitorAlertItem[]>;
  agentConfigurationAlerts: ReadonlyValue<AgentConfigurationAlert[]>;
  agentSelectionReferenceLogs: ReadonlyValue<KnowledgeLogRow[]>;
  authAudit: ReadonlyValue<ConsoleAuditItem[]>;
  backgroundProcesses: ReadonlyValue<BackgroundProcessItem[]>;
  backgroundProcessStatus: ReadonlyValue<BackgroundProcessStatus | null>;
  jsonPreview: (value: unknown) => string;
  knowledgeRecentJobs: ReadonlyValue<SplitJob[]>;
  recentJobs: ReadonlyValue<SplitJob[]>;
  recentMonitorAlertHistory: ReadonlyValue<MonitorAlertItem[]>;
  toolManagementAuditItems: ReadonlyValue<ToolManagementAuditItem[]>;
  toolRiskLabel: (risk: string) => string;
  uploadTraceEvents: ReadonlyValue<ProtocolEvent[]>;
  workQueueRows: ReadonlyValue<WorkQueueRow[]>;
};

export function compactLogDetail(parts: Array<string | number | boolean | null | undefined>) {
  return parts
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

export function genericStatusTone(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (["failed", "error", "denied", "unauthorized", "critical", "interrupted", "blocked"].some((item) => normalized.includes(item))) {
    return "danger";
  }
  if (["warning", "warn", "pending", "queued", "stale", "awaiting"].some((item) => normalized.includes(item))) {
    return "warning";
  }
  if (["success", "ok", "completed", "allowed", "available", "active", "running", "recovered"].some((item) => normalized.includes(item))) {
    return "success";
  }
  return "info";
}

export function stateProgressPercent(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (["completed", "success", "ok", "closed", "available", "recovered"].some((item) => normalized.includes(item))) {
    return 100;
  }
  if (["running", "active", "allowed"].some((item) => normalized.includes(item))) {
    return 80;
  }
  if (["queued", "pending", "awaiting"].some((item) => normalized.includes(item))) {
    return 20;
  }
  if (["failed", "error", "interrupted", "critical", "denied"].some((item) => normalized.includes(item))) {
    return 0;
  }
  return 50;
}

function dedupeLogRows(rows: KnowledgeLogRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.logId)) {
      return false;
    }
    seen.add(row.logId);
    return true;
  });
}

export function createConsoleSystemLogRowController(
  options: ConsoleSystemLogRowControllerOptions,
) {
  const baseServerLogRows = computed<KnowledgeLogRow[]>(() => {
    const traceRows = options.uploadTraceEvents.value.map((event) => {
      const payload = asRecord(event.payload) || {};
      const http = asRecord(payload.http) || {};
      const level = String(payload.level || "info");
      const functionName = String(payload.functionName || "");
      const stage = String(payload.stage || event.type || "");
      const message = String(payload.message || "");
      const layer = String(payload.layer || "");
      return {
        logId: `upload-trace:${event.id}`,
        kindLabel: layer === "store" ? "上传函数" : "上传报文",
        displayId: `#${event.offset}`,
        target: [http.method, http.path].filter(Boolean).join(" ") || functionName || String(payload.sessionId || ""),
        status: level,
        statusLabel: stage || level,
        tone: uploadTraceTone(level),
        stage: functionName || message,
        occurredAt: event.publishedAt || "",
        createdAt: event.publishedAt || "",
        progressPercent: traceProgressPercent(payload),
        detail: uploadTraceDetailText(payload),
        error: String(payload.error || ""),
      };
    });

    const jobRows = options.knowledgeRecentJobs.value.map((job) => {
      const summary = job.resultSummary
        ? [
            `邮件 ${job.resultSummary.emails || 0}`,
            `事务 ${job.resultSummary.transactions || 0}`,
            `人物 ${job.resultSummary.people || 0}`,
            `警告 ${job.resultSummary.warnings || 0}`,
          ].join(" / ")
        : "";
      return {
        logId: `job:${job.id}`,
        kindLabel: "入库任务",
        displayId: shortId(job.id),
        target: job.id,
        status: job.status,
        statusLabel: jobStatusLabels[job.status] || job.status,
        tone: jobStatusTone(job.status),
        stage: job.stage || "",
        occurredAt: job.updatedAt || job.finishedAt || job.startedAt || job.createdAt || "",
        createdAt: job.createdAt || "",
        progressPercent: Number(job.progressPercent || 0),
        detail: summary || job.error || "",
        error: job.error || "",
      };
    });

    const sourceRows = options.activeKnowledgeSources.value.map((source) => ({
      logId: `source:${source.sourceId}`,
      kindLabel: "目录管理",
      displayId: shortId(source.sourceId),
      target: source.label || source.directoryPath || source.sourceId,
      status: source.status || source.lastJobStatus || "",
      statusLabel: sourceSyncLabel(source),
      tone: sourceSyncTone(source),
      stage: source.lastJobStage || source.pendingReason || source.watcherStatus || "",
      occurredAt:
        source.lastJobUpdatedAt ||
        source.lastSyncedAt ||
        source.lastScanAt ||
        source.lastEventAt ||
        source.updatedAt ||
        source.createdAt ||
        "",
      createdAt: source.createdAt || "",
      progressPercent: sourceJobProgress(source),
      detail: [
        source.directoryPath,
        `${source.lastFileCount || 0} 个文件`,
        formatBytes(source.lastTotalBytes || 0),
        source.lastJobId ? `任务 ${shortId(source.lastJobId)}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      error: source.error || "",
    }));

    return [...traceRows, ...jobRows, ...sourceRows, ...options.agentSelectionReferenceLogs.value].sort(
      (left, right) => parseTime(right.occurredAt) - parseTime(left.occurredAt),
    );
  });

  function collectSystemStatusLogRows() {
    const queueRows = options.workQueueRows.value.map((row): KnowledgeLogRow => {
      const status = row.lifecycleStatus || row.status;
      return {
        logId: `queue:${row.rowId}`,
        kindLabel: "任务队列",
        displayId: shortId(row.queueId || row.rowId),
        target: row.label || row.queueId,
        status,
        statusLabel: queueLifecycleLabel(status),
        tone: row.tone || queueLifecycleTone(status),
        stage: compactLogDetail([row.sourceLabel, row.phase, row.status]),
        occurredAt: row.updatedAt || row.lastHeartbeatAt || row.startedAt || "",
        createdAt: row.startedAt || "",
        progressPercent: stateProgressPercent(status),
        detail: compactLogDetail([
          `队列 ${row.queueId}`,
          row.ownerId ? `owner ${row.ownerId}` : "",
          row.checkpointTreeId ? `checkpoint ${row.checkpointTreeId}` : "",
          row.registration?.registrationId ? `registration ${row.registration.registrationId}` : "",
          row.lastHeartbeatAt ? `heartbeat ${row.lastHeartbeatAt}` : "",
          row.detail,
        ]),
        error: ["failed", "interrupted"].includes(String(row.status || row.lifecycleStatus)) ? row.detail : "",
      };
    });

    const taskRows = options.recentJobs.value.map((job): KnowledgeLogRow => ({
      logId: `job:${job.id}`,
      kindLabel: "服务端任务",
      displayId: shortId(job.id),
      target: compactLogDetail([job.id, job.queueId ? `队列 ${job.queueId}` : ""]),
      status: job.status,
      statusLabel: jobStatusLabels[job.status] || job.status,
      tone: jobStatusTone(job.status),
      stage: job.stage || job.status,
      occurredAt: job.updatedAt || job.finishedAt || job.startedAt || job.createdAt || "",
      createdAt: job.createdAt || job.startedAt || "",
      progressPercent: Number(job.progressPercent || 0),
      detail: compactLogDetail([
        job.queueId ? `队列 ${job.queueId}` : "",
        job.checkpointTreeId ? `checkpoint ${job.checkpointTreeId}` : "",
        job.resultSummary ? options.jsonPreview(job.resultSummary) : "",
      ]),
      error: job.error || "",
    }));

    const processRows = options.backgroundProcesses.value.map((processItem): KnowledgeLogRow => ({
      logId: `process:${processItem.role}`,
      kindLabel: processItem.processType === "daemon" ? "守护进程" : "服务进程",
      displayId: processItem.role,
      target: processItem.label || processItem.role,
      status: processItem.status,
      statusLabel: backgroundProcessLabel(processItem.status),
      tone: backgroundProcessTone(processItem.status),
      stage: processItem.responsibility || processItem.description || processItem.mode || "",
      occurredAt: processItem.lastHeartbeatAt || processItem.startedAt || options.backgroundProcessStatus.value?.updatedAt || "",
      createdAt: processItem.startedAt || "",
      progressPercent: processItem.alive && !processItem.stale ? 100 : processItem.alive ? 50 : 0,
      detail: compactLogDetail([
        processItem.pid ? `PID ${processItem.pid}` : "",
        processItem.restartCount ? `重启 ${processItem.restartCount}` : "",
        processItem.services?.length ? `服务 ${processItem.services.join("/")}` : "",
        processItem.features?.length ? `功能 ${processItem.features.join("/")}` : "",
        processItem.monitors?.length ? `监控 ${processItem.monitors.join("/")}` : "",
        processItem.alerts?.length ? `报警 ${processItem.alerts.join("/")}` : "",
      ]),
      error: processItem.error || String(asRecord(processItem.lastExit)?.error || ""),
    }));

    const alertRows = [...options.activeMonitorAlerts.value, ...options.recentMonitorAlertHistory.value].map((alert): KnowledgeLogRow => {
      const status = alert.ackRequired ? "recovered" : alert.status || alert.severity;
      return {
        logId: `alert:${alert.alertId}:${alert.lastSeenAt || alert.resolvedAt || alert.firstSeenAt || ""}`,
        kindLabel: alert.ruleId === "queueInterrupted" ? "中断报警" : "监控报警",
        displayId: shortId(alert.alertId),
        target: alert.title,
        status,
        statusLabel: alert.ackRequired || alert.active === false ? "已恢复" : monitorAlertSeverityLabel(alert.severity),
        tone: alert.ackRequired || alert.active === false ? "success" : monitorAlertSeverityTone(alert.severity),
        stage: compactLogDetail([alert.ruleId, alert.source, alert.role, alert.queueId ? `队列 ${alert.queueId}` : ""]),
        occurredAt: alert.recoveredAt || alert.resolvedAt || alert.lastSeenAt || alert.firstSeenAt || "",
        createdAt: alert.firstSeenAt || "",
        progressPercent: alert.ackRequired || alert.active === false ? 100 : 0,
        detail: compactLogDetail([
          alert.message,
          alert.interruptedAt ? `中断 ${alert.interruptedAt}` : "",
          alert.recoveredAt ? `恢复 ${alert.recoveredAt}` : "",
          alert.acknowledgedAt ? `确认 ${alert.acknowledgedAt}` : "",
          alert.evidence ? options.jsonPreview(alert.evidence) : "",
        ]),
        error: alert.severity === "critical" && alert.active ? alert.message : "",
      };
    });

    const configAlertRows = options.agentConfigurationAlerts.value.map((alert): KnowledgeLogRow => ({
      logId: `config-alert:${alert.alertId}`,
      kindLabel: "配置报警",
      displayId: shortId(alert.alertId),
      target: `${alert.category} / ${alert.title}`,
      status: alert.status,
      statusLabel: alert.status,
      tone: alert.tone,
      stage: alert.targetId || "",
      occurredAt: "",
      createdAt: "",
      progressPercent: alert.tone === "danger" ? 0 : 20,
      detail: alert.detail,
      error: alert.tone === "danger" ? alert.detail : "",
    }));

    const toolAuditRows = options.toolManagementAuditItems.value.map((item): KnowledgeLogRow => ({
      logId: `tool-audit:${item.toolExecutionId}`,
      kindLabel: "调用记录",
      displayId: shortId(item.toolExecutionId),
      target: item.toolId || item.operationId || item.toolExecutionId,
      status: item.status,
      statusLabel: compactLogDetail([item.status, item.decision]),
      tone: genericStatusTone(`${item.status} ${item.decision} ${item.errorCode}`),
      stage: compactLogDetail([item.operationId, options.toolRiskLabel(item.risk), item.profileId, item.agentId]),
      occurredAt: item.finishedAt || item.startedAt || "",
      createdAt: item.startedAt || "",
      progressPercent: stateProgressPercent(item.status),
      detail: compactLogDetail([
        item.traceId ? `trace ${item.traceId}` : "",
        item.grantId ? `grant ${item.grantId}` : "",
        item.durationMs ? `${item.durationMs}ms` : "",
        item.resultSummary ? options.jsonPreview(item.resultSummary) : "",
      ]),
      error: item.errorCode || "",
    }));

    const authAuditRows = options.authAudit.value.map((item): KnowledgeLogRow => {
      const actor = asRecord(item.actor) || {};
      const target = asRecord(item.target) || null;
      const redactedInput = asRecord(item.redactedInput) || null;
      const redactedOutputSummary = asRecord(item.redactedOutputSummary) || null;
      const operationId = item.operationId || item.action || "operation";
      const isAuthOperation = operationId.startsWith("auth.");
      return {
        logId: `operation-audit:${item.auditId}`,
        kindLabel: isAuthOperation ? "认证日志" : "操作日志",
        displayId: shortId(item.auditId),
        target: compactLogDetail([
          String(item.username || actor.username || actor.userId || item.userId || "anonymous"),
          operationId,
        ]),
        status: item.status,
        statusLabel: item.status,
        tone: genericStatusTone(item.status || item.error),
        stage: compactLogDetail([
          item.method || item.transport,
          item.path,
          item.action || item.risk,
          item.durationMs ? `${item.durationMs}ms` : "",
        ]),
        occurredAt: item.createdAt,
        createdAt: item.createdAt,
        progressPercent: stateProgressPercent(item.status),
        detail: target
          ? options.jsonPreview(target)
          : redactedInput
            ? options.jsonPreview(redactedInput)
            : redactedOutputSummary
              ? options.jsonPreview(redactedOutputSummary)
              : "",
        error: item.error || "",
      };
    });

    return [
      ...queueRows,
      ...taskRows,
      ...processRows,
      ...alertRows,
      ...configAlertRows,
      ...toolAuditRows,
      ...authAuditRows,
    ];
  }

  const serverLogRows = computed<KnowledgeLogRow[]>(() =>
    dedupeLogRows([...collectSystemStatusLogRows(), ...baseServerLogRows.value]).sort(
      (left, right) => parseTime(right.occurredAt) - parseTime(left.occurredAt),
    ),
  );

  return {
    baseServerLogRows,
    collectSystemStatusLogRows,
    compactLogDetail,
    genericStatusTone,
    serverLogRows,
    stateProgressPercent,
  };
}
