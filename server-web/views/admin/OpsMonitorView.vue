<script setup lang="ts">
import { useConsole } from '../../composables/useConsole';
import ConfigFoldCard from '../../components/ConfigFoldCard.vue';
import StatusPill from '../../components/StatusPill.vue';
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
  clientRuntimeCoolingPolicyText,
  clientRuntimeCoolingTone,
  clientRuntimeHeatRows,
  clientRuntimeHeatStyle,
  clientRuntimeReasonLabel,
  clientRuntimeStatus,
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
  refreshBackgroundProcesses,
  refreshClientRuntimeStatus,
  refreshMonitorAlerts,
  saveMonitorAlertConfig,
} = useConsole();
</script>

<template>
          <section class="maintenance-agent-layout ops-monitor-layout">
            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>运维监控</h3>
                  <p>统一查看服务端进程状态、守护巡检和报警队列。</p>
                </div>
                <div class="section-tags">
                  <span>{{ backgroundSupervisorLabel }}</span>
                  <span>进程 {{ backgroundRunningCount }} / {{ backgroundProcesses.length }}</span>
                  <span>报警 {{ monitorAlertSummary.activeCount }}</span>
                </div>
              </div>
              <div class="source-actions">
                <button
                  class="tool-button"
                  type="button"
                  :disabled="busyKey === 'background-processes:refresh'"
                  @click="refreshBackgroundProcesses()"
                >
                  {{ busyKey === "background-processes:refresh" ? "刷新中" : "刷新进程" }}
                </button>
                <button
                  class="tool-button"
                  type="button"
                  :disabled="busyKey === 'client-runtime:refresh'"
                  @click="refreshClientRuntimeStatus()"
                >
                  {{ busyKey === "client-runtime:refresh" ? "刷新中" : "刷新热力图" }}
                </button>
                <button
                  class="tool-button"
                  type="button"
                  :disabled="busyKey === 'monitor-alerts:refresh'"
                  @click="refreshMonitorAlerts()"
                >
                  {{ busyKey === "monitor-alerts:refresh" ? "刷新中" : "刷新报警" }}
                </button>
              </div>
            </article>

            <article class="surface-card client-runtime-card">
              <div class="section-header">
                <div>
                  <h3>客户端热力图</h3>
                  <p>按协议层 clientUid 收敛工作空间、上下文和使用热度，低频连接会进入冷却状态。</p>
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
              <p class="module-note">
                冷却策略：{{ clientRuntimeCoolingPolicyText }}；状态文件：{{ clientRuntimeStatus?.usagePath || "未生成" }}
              </p>
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
                  <span>PID / 心跳</span>
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
                    <small>{{ formatCompactDate(processItem.lastHeartbeatAt || "") }}</small>
                  </span>
                  <span>
                    <strong>{{ processItem.responsibility || processItem.description }}</strong>
                    <small>{{ processRelationText(processItem) }}</small>
                  </span>
                </div>
              </div>
              <p v-if="backgroundProcessStatus?.statePath" class="module-note">
                状态文件：{{ backgroundProcessStatus.statePath }}
              </p>
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
                  v-for="alert in activeMonitorAlerts"
                  :key="alert.alertId"
                  class="job-row"
                >
                  <StatusPill
                    :tone="alert.ackRequired ? 'success' : monitorAlertSeverityTone(alert.severity)"
                    :label="alert.ackRequired ? '已恢复' : monitorAlertSeverityLabel(alert.severity)"
                  />
                  <span>
                    <strong>{{ alert.title }}</strong>
                    <small>{{ alert.queueId ? `队列 ID：${alert.queueId} · ` : "" }}{{ alert.message }}</small>
                  </span>
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
              <div v-if="activeMonitorAlerts.length === 0" class="empty-state">
                <strong>暂无活跃报警</strong>
              </div>
              <ConfigFoldCard title="报警报文配置 JSON" open>
                <label class="json-editor">
                  <span>配置会保存到后台文件，守护巡检下一轮自动读取</span>
                  <textarea v-model="monitorAlertConfigText" rows="14" spellcheck="false" />
                </label>
              </ConfigFoldCard>
              <ConfigFoldCard title="最近报警历史">
                <div class="job-table compact-job-table monitor-alert-table">
                  <div class="job-table-header">
                    <span>级别</span>
                    <span>报警</span>
                    <span>时间</span>
                  </div>
                  <div
                    v-for="alert in recentMonitorAlertHistory"
                    :key="`${alert.alertId}:${alert.lastSeenAt}:${alert.resolvedAt || ''}`"
                    class="job-row"
                  >
                    <StatusPill :tone="monitorAlertSeverityTone(alert.severity)" :label="monitorAlertSeverityLabel(alert.severity)" />
                    <span>
                      <strong>{{ alert.title }}</strong>
                      <small>{{ alert.active ? "活跃" : "已恢复" }} · {{ alert.message }}</small>
                    </span>
                    <span>{{ formatCompactDate(alert.lastSeenAt || alert.resolvedAt || alert.firstSeenAt) }}</span>
                  </div>
                </div>
              </ConfigFoldCard>
              <p v-if="monitorAlertState?.configPath" class="module-note">
                配置文件：{{ monitorAlertState.configPath }}；sh 配置：{{ monitorAlertState.shellConfigPath || "未生成" }}；状态文件：{{ monitorAlertState.statePath }}
              </p>
            </article>
          </section>
</template>
