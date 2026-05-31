<script setup lang="ts">
import { computed } from 'vue';
import { useServerConsoleShellContext } from '../composables/serverConsoleShellContext';
import StatusPill from '../components/StatusPill.vue';

const {
  busyKey,
  consoleState,
  dashboardAlertInboxId,
  dashboardAlertSummary,
  dashboardAlerts,
  dismissDashboardAlert,
  knowledgeConsole,
  openDashboardAlert,
} = useServerConsoleShellContext();

const clientTotalCount = computed(() => consoleState.value?.clients?.summary?.totalCount || 0);
const clientOfflineCount = computed(() => consoleState.value?.clients?.summary?.offlineCount || 0);
const clientOnlineCount = computed(() => Math.max(0, clientTotalCount.value - clientOfflineCount.value));
</script>

<template>
  <section class="dashboard-view">
    <div class="metric-grid">
      <article class="metric-card">
        <div class="metric-card-header">
          <span>邮件 / 文档</span>
        </div>
        <h3>{{ (consoleState?.storage?.emailCount || 0).toLocaleString() }}</h3>
        <p>{{ (consoleState?.storage?.rawObjectCount || 0).toLocaleString() }} 个原始对象</p>
      </article>
      <article class="metric-card">
        <div class="metric-card-header">
          <span>知识事务</span>
          <StatusPill
            :tone="knowledgeConsole?.available ? 'success' : 'neutral'"
            :label="knowledgeConsole?.available ? '已启用' : '未启用'"
            :show-dot="false"
          />
        </div>
        <h3>{{ (consoleState?.storage?.transactionCount || 0).toLocaleString() }}</h3>
        <p>{{ (consoleState?.storage?.threadCount || 0).toLocaleString() }} 条线索</p>
      </article>
      <article class="metric-card">
        <div class="metric-card-header">
          <span>客户端</span>
          <StatusPill
            :tone="clientOnlineCount > 0 ? 'success' : 'neutral'"
            :label="clientTotalCount > 0 ? `${clientOnlineCount} 在线` : '无客户端'"
            :show-dot="false"
          />
        </div>
        <h3>{{ clientTotalCount }}</h3>
        <p>离线 {{ clientOfflineCount }}</p>
      </article>
      <article class="metric-card">
        <div class="metric-card-header">
          <span>任务队列</span>
          <StatusPill
            :tone="(consoleState?.jobs?.summary?.runningCount || 0) > 0 ? 'running' : 'neutral'"
            :label="(consoleState?.jobs?.summary?.runningCount || 0) > 0 ? `${consoleState?.jobs?.summary?.runningCount || 0} 运行中` : '空闲'"
            :show-dot="false"
          />
        </div>
        <h3>{{ (consoleState?.jobs?.summary?.queuedCount || 0) + (consoleState?.jobs?.summary?.runningCount || 0) }}</h3>
        <p>{{ (consoleState?.jobs?.summary?.completedCount || 0).toLocaleString() }} 已完成</p>
      </article>
    </div>
    <article class="surface-card configuration-alert-card">
      <div class="section-header">
        <div>
          <h3>报警</h3>
          <p>{{ dashboardAlertSummary }}</p>
        </div>
        <StatusPill
          :tone="dashboardAlerts.length ? 'warning' : 'success'"
          :label="dashboardAlerts.length ? `${dashboardAlerts.length} 项` : '已就绪'"
        />
      </div>
      <div v-if="dashboardAlerts.length" class="configuration-alert-list">
        <article
          v-for="alertItem in dashboardAlerts"
          :key="dashboardAlertInboxId(alertItem)"
          class="configuration-alert-item"
          :data-tone="alertItem.tone"
          :data-live="alertItem.live === false ? 'false' : 'true'"
        >
          <span class="configuration-alert-category">{{ alertItem.category }}</span>
          <strong>{{ alertItem.title }}</strong>
          <span>{{ alertItem.detail }}</span>
          <em>{{ alertItem.status }}</em>
          <div class="configuration-alert-actions">
            <button
              class="configuration-alert-action"
              type="button"
              :disabled="busyKey === `monitor-alert:ack:${alertItem.alertId}`"
              @click="openDashboardAlert(alertItem)"
            >
              {{ alertItem.source === "configuration" ? "去配置" : "查看报警" }}
            </button>
            <button
              class="configuration-alert-action danger-action"
              type="button"
              :disabled="busyKey === `monitor-alert:ack:${alertItem.alertId}`"
              @click="dismissDashboardAlert(alertItem)"
            >
              {{ busyKey === `monitor-alert:ack:${alertItem.alertId}` ? "确认中" : "确认关闭" }}
            </button>
          </div>
        </article>
      </div>
      <div v-else class="configuration-alert-empty">
        <strong>没有报警</strong>
        <span>空配置、中断和后台巡检当前都没有需要处理的事项。</span>
      </div>
    </article>
  </section>
</template>
