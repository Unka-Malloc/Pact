import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getBackgroundProcessStatus } from "../platform/common/devops/process-status/background-process-status.mjs";
import {
  inspectQueueMonitor,
  getQueueMonitorState,
  queueMonitorId,
  registerQueueStarted
} from "../services/client/work-queue-core/queue-monitor.mjs";
import {
  runMonitorAlertCycle,
  saveMonitorAlertConfig
} from "../platform/common/devops/monitor-alert-core/monitor-alerts.mjs";
import {
  AlertUnifiedRegistration,
  MonitorUnifiedRegistration,
  ProcessUnifiedRegistration,
  QueueUnifiedRegistration,
  TaskUnifiedRegistration,
  UnifiedRegistration,
  composeUnifiedSystemStatus,
  routeUnifiedRegistration
} from "../platform/common/devops/unified-registration-core/unified-registration.mjs";

assert.throws(
  () => new UnifiedRegistration().getOriginalType(),
  /must be implemented/,
  "UnifiedRegistration must behave like an abstract registration interface"
);

const processRegistration = new ProcessUnifiedRegistration({
  role: "server-main",
  label: "SplitAll 服务端",
  status: "running",
  processType: "service",
  pid: process.pid,
  lastHeartbeatAt: new Date().toISOString()
});
const queueRegistration = new QueueUnifiedRegistration({
  queueId: "queue_item_verify",
  kind: "verify_queue",
  ownerId: "verify-owner",
  label: "验证队列",
  lifecycleStatus: "open",
  status: "running",
  source: "function-self-check",
  lastHeartbeatAt: new Date().toISOString()
});
const taskRegistration = new TaskUnifiedRegistration(
  {
    id: "verify-task",
    status: "queued",
    progressPercent: 0,
    stage: "验证任务",
    createdAt: new Date().toISOString()
  },
  {
    taskType: "verify_task",
    queueId: "queue_item_verify",
    source: "verify"
  }
);
const monitorRegistration = new MonitorUnifiedRegistration({
  monitorId: "verify-monitor",
  label: "验证监控",
  status: "healthy",
  summary: { activeCount: 0 }
});
const alertRegistration = new AlertUnifiedRegistration({
  alertId: "verify-alert",
  ruleId: "verifyRule",
  title: "验证报警",
  severity: "warning",
  status: "warning",
  active: true,
  firstSeenAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString()
});

assert.equal(processRegistration.getOriginalType(), "process");
assert.equal(queueRegistration.getOriginalType(), "queue");
assert.equal(taskRegistration.getOriginalType(), "task");
assert.equal(monitorRegistration.getOriginalType(), "monitor");
assert.equal(alertRegistration.getOriginalType(), "alert");
assert.equal(routeUnifiedRegistration(processRegistration).section, "processes");
assert.equal(routeUnifiedRegistration(queueRegistration).section, "queues");
assert.equal(routeUnifiedRegistration(taskRegistration).section, "tasks");
assert.equal(routeUnifiedRegistration(monitorRegistration).section, "monitors");
assert.equal(routeUnifiedRegistration(alertRegistration).section, "alerts");

const composed = composeUnifiedSystemStatus([
  processRegistration,
  queueRegistration,
  taskRegistration,
  monitorRegistration,
  alertRegistration
]);
assert.equal(composed.summary.processCount, 1);
assert.equal(composed.summary.queueCount, 1);
assert.equal(composed.summary.taskCount, 1);
assert.equal(composed.summary.monitorCount, 1);
assert.equal(composed.summary.alertCount, 1);
assert.equal(composed.registrations.length, 5);

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-unified-registration-"));
const queueMonitorAdapter = {
  inspect: (input) => inspectQueueMonitor({ userDataPath, ...input })
};

try {
  const backgroundStatus = await getBackgroundProcessStatus(userDataPath);
  assert.ok(backgroundStatus.systemStatus, "background process status must publish a unified system status");
  assert.ok(
    backgroundStatus.processes.every((item) => item.unifiedRegistration?.originalType === "process"),
    "every process must carry a process unified registration"
  );

  const queueId = queueMonitorId("verify_queue", "verify-owner");
  await registerQueueStarted(userDataPath, {
    queueId,
    kind: "verify_queue",
    ownerId: "verify-owner",
    label: "验证队列",
    phase: "running",
    status: "running",
    source: "function-self-check"
  });
  const queueMonitor = await getQueueMonitorState(userDataPath);
  assert.ok(queueMonitor.systemStatus, "queue monitor must publish a unified system status");
  assert.ok(
    queueMonitor.items.some((item) => item.queueId === queueId && item.unifiedRegistration?.originalType === "queue"),
    "queue monitor items must carry queue unified registrations"
  );

  await saveMonitorAlertConfig(userDataPath, {
    enabled: true,
    queueHeartbeatStaleMs: 600000,
    rules: {
      supervisorStopped: { enabled: false },
      processNotRunning: { enabled: false },
      processStale: { enabled: false },
      processRestarted: { enabled: false },
      queueInterrupted: { enabled: true }
    }
  });
  const monitorState = await runMonitorAlertCycle(userDataPath, { queueMonitor: queueMonitorAdapter });
  assert.ok(monitorState.systemStatus, "monitor alerts must publish a unified system status");
  assert.ok(monitorState.systemStatus.summary.processCount >= 1);
  assert.ok(monitorState.systemStatus.summary.queueCount >= 1);
  assert.ok(monitorState.systemStatus.summary.monitorCount >= 1);
  assert.ok(
    monitorState.systemStatus.registrations.every((registration) => registration.route?.section),
    "every unified registration must route to a system status section"
  );

  console.log("Unified registration verification passed.");
} finally {
  await fs.rm(userDataPath, { recursive: true, force: true });
}
