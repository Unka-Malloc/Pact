import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  acknowledgeMonitorAlert,
  runMonitorAlertCycle,
  saveMonitorAlertConfig
} from "../platform/common/devops/monitor-alert-core/monitor-alerts.mjs";
import {
  acknowledgeQueueMonitorAlert,
  inspectQueueMonitor,
  queueMonitorId,
  queueMonitorStatePath,
  registerQueueHeartbeat
} from "../services/client/work-queue-core/queue-monitor.mjs";

function oldIso(ms = 120000) {
  return new Date(Date.now() - ms).toISOString();
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "agentstudio-monitor-alerts-"));
const queueMonitor = {
  inspect: (input) => inspectQueueMonitor({ userDataPath, ...input }),
  acknowledge: (alertId) => acknowledgeQueueMonitorAlert(userDataPath, alertId)
};

try {
  await saveMonitorAlertConfig(userDataPath, {
    enabled: true,
    intervalMs: 5000,
    heartbeatStaleMs: 15000,
    queueHeartbeatStaleMs: 5000,
    recoverInterruptedQueues: true,
    rules: {
      supervisorStopped: { enabled: false },
      processNotRunning: { enabled: false },
      processStale: { enabled: false },
      processRestarted: { enabled: false },
      queueInterrupted: {
        enabled: true,
        severity: "critical",
        titleTemplate: "{{queueLabel}} 中断",
        messageTemplate: "{{queueLabel}} 已中断，恢复状态 {{recoveryStatus}}。"
      }
    }
  });

  const jobId = "verify-interrupted-job";
  const queueId = queueMonitorId("import_parse_job", jobId);
  const staleAt = oldIso();
  const jobDir = path.join(userDataPath, "jobs", jobId);
  await writeJson(path.join(jobDir, "payload.json"), {
    inputText: "monitor alert interrupted queue verification",
    uploadedFiles: [],
    settings: {}
  });
  await writeJson(path.join(jobDir, "meta.json"), {
    id: jobId,
    queueId,
    status: "running",
    createdAt: staleAt,
    updatedAt: staleAt,
    startedAt: staleAt,
    progressPercent: 32,
    stage: "验证队列运行中",
    checkpointId: "checkpoint_verify",
    checkpointTreeId: "",
    uploadSessionId: ""
  });
  await writeJson(queueMonitorStatePath(userDataPath), {
    schemaVersion: 1,
    updatedAt: staleAt,
    items: {
      [queueId]: {
        queueId,
        kind: "import_parse_job",
        ownerId: jobId,
        label: "验证导入解析队列",
        source: "function-self-check",
        sources: ["function-self-check"],
        lifecycleStatus: "open",
        phase: "running",
        status: "running",
        startedAt: staleAt,
        lastHeartbeatAt: staleAt,
        checkpointId: "checkpoint_verify",
        checkpointTreeId: "",
        metadata: {}
      }
    }
  });

  const interruptedState = await runMonitorAlertCycle(userDataPath, { queueMonitor });
  const interruptedAlerts = interruptedState.activeAlerts.filter(
    (alert) => alert.ruleId === "queueInterrupted"
  );
  assert.equal(interruptedAlerts.length, 1, "同一队列只能生成一个中断报警");
  assert.equal(interruptedAlerts[0].queueId, queueId);
  assert.equal(interruptedAlerts[0].active, true);

  const recoveredJob = JSON.parse(await fs.readFile(path.join(jobDir, "meta.json"), "utf8"));
  assert.equal(recoveredJob.status, "queued", "中断恢复切面应把运行中 job 拉回 queued");

  const dedupedState = await runMonitorAlertCycle(userDataPath, { queueMonitor });
  assert.equal(
    dedupedState.activeAlerts.filter((alert) => alert.ruleId === "queueInterrupted").length,
    1,
    "重复巡检不能为同一队列追加第二个中断报警"
  );

  const runningAt = new Date().toISOString();
  await writeJson(path.join(jobDir, "meta.json"), {
    ...recoveredJob,
    status: "running",
    stage: "恢复后重新运行",
    updatedAt: runningAt
  });
  await registerQueueHeartbeat(userDataPath, {
    queueId,
    kind: "import_parse_job",
    ownerId: jobId,
    label: "验证导入解析队列",
    phase: "running",
    status: "running",
    source: "function-self-check"
  });

  const restoredState = await runMonitorAlertCycle(userDataPath, { queueMonitor });
  const restoredAlerts = restoredState.activeAlerts.filter(
    (alert) => alert.ruleId === "queueInterrupted"
  );
  assert.equal(restoredAlerts.length, 1, "恢复信息应沿用同一个报警 ID");
  assert.equal(restoredAlerts[0].alertId, interruptedAlerts[0].alertId);
  assert.equal(restoredAlerts[0].active, false);
  assert.equal(restoredAlerts[0].ackRequired, true);
  assert.equal(restoredState.status, "recovered");

  const acknowledged = await acknowledgeMonitorAlert(userDataPath, restoredAlerts[0].alertId, { queueMonitor });
  assert.equal(
    acknowledged.activeAlerts.some((alert) => alert.alertId === restoredAlerts[0].alertId),
    false,
    "确认恢复信息后应从报警列表关闭"
  );

  const afterAck = await runMonitorAlertCycle(userDataPath, { queueMonitor });
  assert.equal(
    afterAck.activeAlerts.some((alert) => alert.alertId === restoredAlerts[0].alertId),
    false,
    "ACK 后再次巡检不应重新显示已恢复信息"
  );

  console.log("Monitor alerts verification passed.");
} finally {
  await fs.rm(userDataPath, { recursive: true, force: true });
}
