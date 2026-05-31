<script setup lang="ts">
import { computed } from 'vue';
import { useServerConsoleShellContext } from '../../composables/serverConsoleShellContext';
import ConfigFoldCard from '../../components/ConfigFoldCard.vue';
import StatusPill from '../../components/StatusPill.vue';
import type { MonitorAlertItem } from '../../lib/types';

const {
  acknowledgeMonitorAlert,
  activeMonitorAlerts,
  adminView,
  backgroundProcessLabel,
  backgroundProcessStatus,
  backgroundProcessTone,
  backgroundProcesses,
  backgroundRunningCount,
  backgroundSupervisorLabel,
  busyKey,
  canAdminMaintenanceAgent,
  clientRuntimeCoolingLabel,
  clientRuntimeCoolingTone,
  clientRuntimeHeatRows,
  clientRuntimeHeatStyle,
  clientRuntimeReasonLabel,
  clientRuntimeSummary,
  clientRuntimeSurfaceText,
  clientRuntimeTaskText,
  currentView,
  formatCompactDate,
  isAuthenticated,
  monitorAlertConfigText,
  monitorAlertSeverityLabel,
  monitorAlertSeverityTone,
  monitorAlertState,
  monitorAlertSummary,
  processRelationText,
  processTypeLabel,
  recentMonitorAlertHistory,
  saveMonitorAlertConfig,
} = useServerConsoleShellContext();

type MonitorAlertDetailBullet = {
  label: string;
  text: string;
};

function splitMonitorAlertMessage(message: string) {
  return String(message || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[。；;])\s*/u)
    .map((item) => item.replace(/[。；;]+$/u, "").trim())
    .filter(Boolean);
}

function monitorAlertMessageLabel(text: string, index: number) {
  if (/^(请|建议|检查|确认|修复|处理)/u.test(text)) {
    return "处理";
  }
  if (/(PID|当前状态|未运行|离线|失败|中断|超时|stopped|missing)/iu.test(text)) {
    return "状态";
  }
  if (/(负责|影响|导致|依赖|关联|拉起|管理)/u.test(text)) {
    return "影响";
  }
  return index === 0 ? "详情" : "补充";
}

function monitorAlertLifecycleText(alert: MonitorAlertItem) {
  if (alert.ackRequired || alert.active === false || alert.status === "recovered") {
    return "已恢复";
  }
  return alert.status || monitorAlertSeverityLabel(alert.severity);
}

function monitorAlertDetailBullets(alert: MonitorAlertItem, includeLifecycle = false): MonitorAlertDetailBullet[] {
  const bullets: MonitorAlertDetailBullet[] = [];
  if (includeLifecycle) {
    bullets.push({ label: "状态", text: monitorAlertLifecycleText(alert) });
  }
  if (alert.queueId) {
    bullets.push({ label: "队列 ID", text: alert.queueId });
  }
  splitMonitorAlertMessage(alert.message).forEach((text, index) => {
    bullets.push({ label: monitorAlertMessageLabel(text, index), text });
  });
  const sourceParts = [alert.source, alert.role].filter((item, index, list) => item && list.indexOf(item) === index);
  if (sourceParts.length > 0) {
    bullets.push({ label: "来源", text: sourceParts.join(" / ") });
  }
  return bullets.length > 0 ? bullets : [{ label: "详情", text: "—" }];
}

function monitorAlertMergeKey(alert: MonitorAlertItem) {
  return [
    alert.alertId,
    alert.resolvedAt || "",
    alert.acknowledgedAt || "",
    alert.ackRequired || alert.active === false ? "recovered" : "active",
  ].join(":");
}

function shouldIncludeMonitorAlertLifecycle(alert: MonitorAlertItem) {
  return alert.ackRequired || alert.active === false || alert.status === "recovered";
}

const mergedMonitorAlerts = computed(() => {
  const seen = new Set<string>();
  return [...activeMonitorAlerts.value, ...recentMonitorAlertHistory.value].filter((alert) => {
    const key = monitorAlertMergeKey(alert);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
});
</script>

<template>
          <section class="maintenance-agent-layout ops-monitor-layout">
            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>运维监控</h3>
                </div>
                <div class="section-tags">
                  <span>{{ backgroundSupervisorLabel }}</span>
                  <span>进程 {{ backgroundRunningCount }} / {{ backgroundProcesses.length }}</span>
                  <span>报警 {{ monitorAlertSummary.activeCount }}</span>
                </div>
              </div>
            </article>

            <article class="surface-card client-runtime-card">
              <div class="section-header">
                <div>
                  <h3>客户端热力图</h3>
                </div>
                <div class="section-tags">
                  <span>客户端 {{ clientRuntimeSummary.totalClients }}</span>
                  <span>调用 {{ clientRuntimeSummary.totalCalls }}</span>
                  <span>热 {{ clientRuntimeSummary.hotClients }}</span>
                  <span>冷却 {{ clientRuntimeSummary.cooledClients }}</span>
                </div>
              </div>
              <div v-if="clientRuntimeHeatRows.length > 0" class="client-runtime-heatmap">
                <div class="client-runtime-heatmap-header">
                  <span>客户端</span>
                  <span>热度</span>
                  <span>工作空间</span>
                  <span>上下文</span>
                  <span>最近调用</span>
                  <span>调用面</span>
                </div>
                <div
                  v-for="row in clientRuntimeHeatRows"
                  :key="row.clientUid"
                  class="client-runtime-heatmap-row"
                  :data-heat="row.heatLevel"
                >
                  <span>
                    <strong>{{ row.clientUid }}</strong>
                    <small>{{ row.profileId }} · {{ row.matched ? "命中 profile" : "默认 profile" }}</small>
                  </span>
                  <span>
                    <StatusPill :tone="clientRuntimeCoolingTone(row.coolingState)" :label="clientRuntimeCoolingLabel(row.coolingState)" />
                    <small>{{ clientRuntimeReasonLabel(row.coolingReason) }}</small>
                    <span class="client-runtime-heatbar" :style="clientRuntimeHeatStyle(row)"><i /></span>
                  </span>
                  <span>
                    <strong>{{ row.workspaceId || "未分配" }}</strong>
                    <small>{{ row.retrievalProfileId || "无检索 profile" }}</small>
                  </span>
                  <span>
                    <strong>{{ row.contextProfileId || "未分配" }}</strong>
                    <small>{{ row.modelAlias || "未指定模型" }}</small>
                  </span>
                  <span>
                    <strong>{{ row.recentCalls }} / {{ row.totalCalls }}</strong>
                    <small>{{ formatCompactDate(row.lastSeenAt) }}</small>
                  </span>
                  <span>
                    <strong>{{ clientRuntimeTaskText(row) }}</strong>
                    <small>{{ clientRuntimeSurfaceText(row) }}</small>
                  </span>
                </div>
              </div>
              <div v-else class="empty-state">
                <strong>暂无客户端运行时热度</strong>
                <span>带 clientUid 的标准调用进入协议层后会在这里出现。</span>
              </div>
            </article>

            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>进程状态</h3>
                </div>
                <div class="section-tags">
                  <span>{{ backgroundProcessStatus?.status || "未读取" }}</span>
                  <span>运行 {{ backgroundRunningCount }}</span>
                </div>
              </div>
              <div class="job-table compact-job-table background-process-table ops-process-table">
                <div class="job-table-header">
                  <span>进程</span>
                  <span>类型</span>
                  <span>状态</span>
                  <span>PID</span>
                  <span>最后响应时间</span>
                  <span>作用和关联</span>
                </div>
                <div
                  v-for="processItem in backgroundProcesses"
                  :key="processItem.role"
                  class="job-row"
                >
                  <span>
                    <strong>{{ processItem.label }}</strong>
                    <small>{{ processItem.role }} · 重启 {{ processItem.restartCount || 0 }}</small>
                  </span>
                  <StatusPill tone="info" :label="processTypeLabel(processItem.processType)" />
                  <StatusPill :tone="backgroundProcessTone(processItem.status)" :label="backgroundProcessLabel(processItem.status)" />
                  <span>
                    <strong>{{ processItem.pid || "—" }}</strong>
                  </span>
                  <span>
                    <strong>{{ formatCompactDate(processItem.lastHeartbeatAt || "") }}</strong>
                  </span>
                  <span>
                    <strong>{{ processItem.responsibility || processItem.description }}</strong>
                    <small>{{ processRelationText(processItem) }}</small>
                  </span>
                </div>
              </div>
	              <div v-if="backgroundProcesses.length === 0" class="empty-state">
                <strong>暂无进程状态</strong>
              </div>
            </article>

            <article class="surface-card" style="display: flex; flex-direction: column; gap: 16px;">
              <div class="section-header">
                <div>
                  <h3>监控报警</h3>
                </div>
                <div class="section-tags">
                  <span>{{ monitorAlertState?.status || "未读取" }}</span>
                  <span>可见 {{ monitorAlertSummary.visibleCount || monitorAlertSummary.activeCount }}</span>
                  <span>严重 {{ monitorAlertSummary.criticalCount }}</span>
                </div>
              </div>
              <div class="source-actions">
                <button
                  class="primary-action"
                  type="button"
                  :disabled="!canAdminMaintenanceAgent || busyKey === 'monitor-alerts:save'"
                  @click="saveMonitorAlertConfig"
                >
                  {{ busyKey === "monitor-alerts:save" ? "保存中" : "保存报警配置" }}
                </button>
              </div>
              <div class="job-table compact-job-table monitor-alert-table">
                <div class="job-table-header">
                  <span>级别</span>
                  <span>报警</span>
                  <span>状态</span>
                </div>
                <div
                  v-for="alert in mergedMonitorAlerts"
                  :key="monitorAlertMergeKey(alert)"
                  class="job-row"
                >
                  <StatusPill
                    class="monitor-alert-severity-pill"
                    :tone="alert.ackRequired ? 'success' : monitorAlertSeverityTone(alert.severity)"
                    :label="alert.ackRequired ? '已恢复' : monitorAlertSeverityLabel(alert.severity)"
                  />
                  <div class="monitor-alert-detail">
                    <strong>{{ alert.title }}</strong>
                    <ul class="monitor-alert-detail-list">
                      <li
                        v-for="(bullet, bulletIndex) in monitorAlertDetailBullets(alert, shouldIncludeMonitorAlertLifecycle(alert))"
                        :key="`${alert.alertId}:${bullet.label}:${bulletIndex}`"
                      >
                        <span>{{ bullet.label }}：</span>
                        <span>{{ bullet.text }}</span>
                      </li>
                    </ul>
                  </div>
                  <span>
                    {{ formatCompactDate(alert.recoveredAt || alert.lastSeenAt || alert.firstSeenAt) }}
                    <button
                      v-if="alert.ackRequired"
                      class="tool-button tool-button-ghost"
                      type="button"
                      :disabled="busyKey === `monitor-alert:ack:${alert.alertId}`"
                      @click="acknowledgeMonitorAlert(alert.alertId)"
                    >
                      {{ busyKey === `monitor-alert:ack:${alert.alertId}` ? "确认中" : "确认关闭" }}
                    </button>
                  </span>
                </div>
              </div>
              <div v-if="mergedMonitorAlerts.length === 0" class="empty-state">
                <strong>暂无报警</strong>
              </div>
              <ConfigFoldCard title="报警报文配置 JSON" open>
                <label class="json-editor">
                  <textarea v-model="monitorAlertConfigText" rows="14" spellcheck="false" />
                </label>
              </ConfigFoldCard>
            </article>
          </section>
</template>
