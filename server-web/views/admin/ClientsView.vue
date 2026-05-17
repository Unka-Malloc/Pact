<script setup lang="ts">
import { computed } from 'vue';
import { useConsole } from '../../composables/useConsole';
import {
  OptionBar,
  StatusPill,
} from '../../components/common';
const {
  adminView,
  busyKey,
  canAdminRuntime,
  clientMigrationMessages,
  clientSearchQuery,
  clientStateFilter,
  clientStateFilterOptionBarOptions,
  consoleState,
  currentView,
  exportClients,
  filter,
  filteredClientList,
  formatCompactDate,
  importClients,
  isAuthenticated,
  migrationStateLabels,
  migrationTone,
  requestClientMigration,
} = useConsole();

const latestClient = computed(() => {
  const sorted = [...filteredClientList.value].sort((a, b) =>
    String(b.lastSeenAt ?? '').localeCompare(String(a.lastSeenAt ?? ''))
  );
  return sorted[0] ?? null;
});
</script>

<template>
          <section id="clients-list" class="surface-card clients-card">
              <div class="section-header">
                <div>
                  <h3>设备管理</h3>
              </div>
              <div class="section-tags">
                <span
                  >总计
                  {{ consoleState?.clients?.summary?.totalCount || 0 }}</span
                >
                <span
                  >在线
                    {{
                    (consoleState?.clients?.summary?.totalCount || 0) -
                    (consoleState?.clients?.summary?.offlineCount || 0)
                  }}</span
                >
              </div>
            </div>

            <div class="table-toolbar">
              <div class="toolbar-left">
                <input
                  v-model="clientSearchQuery"
                  class="search-input"
                  placeholder="搜索 标签、ID、主机或系统…"
                />
                <OptionBar
                  v-model="clientStateFilter"
                  class="filter-select"
                  :options="clientStateFilterOptionBarOptions"
                />
              </div>
              <div class="toolbar-actions">
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  @click="importClients"
                >
                  导入
                </button>
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  @click="exportClients"
                >
                  导出
                </button>
              </div>
            </div>

            <div class="table-shell">
              <table class="jobs-table">
                <thead>
                  <tr>
                    <th>客户端信息</th>
                    <th>平台环境</th>
                    <th>版本</th>
                    <th>当前服务</th>
                    <th>最近活跃</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody v-if="filteredClientList.length > 0">
                  <tr
                    v-for="item in filteredClientList"
                    :key="item.clientId"
                  >
                    <td>
                      <div class="primary-cell">
                        <strong>{{ item.clientLabel || item.clientId }}</strong>
                        <span>{{ item.clientId }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="primary-cell">
                        <strong>{{ item.platform }}</strong>
                        <span>{{ item.hostname }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="primary-cell">
                        <strong>{{ item.appVersion || "未上报" }}</strong>
                        <span>配置 {{ item.configVersion || "未上报" }}</span>
                      </div>
                    </td>
                    <td>
                      <span class="url-badge">{{
                        item.currentServiceUrl || "未接入"
                      }}</span>
                    </td>
                    <td>
                      <div class="time-cell">
                        <strong>{{ formatCompactDate(item.lastSeenAt) }}</strong>
                        <span>{{ item.lastSeenServerId || "N/A" }}</span>
                      </div>
                    </td>
                    <td>
	                      <StatusPill
	                        :tone="migrationTone(item.migrationState)"
	                        :label="migrationStateLabels[item.migrationState]"
	                      />
                    </td>
                  </tr>
                </tbody>
              </table>

              <div
                v-if="filteredClientList.length === 0"
                class="empty-state"
              >
                <strong>暂无匹配客户端</strong>
                <span>请尝试更换搜索条件或检查网络连接。</span>
              </div>
            </div>
          </section>

          <aside id="network" class="surface-card migration-card">
            <div class="section-header">
              <div>
                <h3>迁移控制</h3>
              </div>
              <div class="section-tags">
                <span
                  >已切换
                  {{ consoleState?.clients?.summary?.alignedCount || 0 }}</span
                >
                <span
                  >迁移中
                  {{ consoleState?.clients?.summary?.drainingCount || 0 }}</span
                >
              </div>
            </div>

            <div class="migration-form-list" v-if="filteredClientList.length > 0">
              <form
                v-for="item in filteredClientList"
                :key="item.clientId"
                class="module-panel migration-control-form"
                :data-tone="migrationTone(item.migrationState)"
                @submit.prevent="requestClientMigration(item)"
              >
                <div class="migration-item-header">
                  <div>
                    <strong>{{ item.clientLabel || item.clientId }}</strong>
                    <span>{{
                      item.hostname || item.platform || item.clientId
                    }}</span>
                  </div>
                  <em>{{ migrationStateLabels[item.migrationState] }}</em>
                </div>

                <div class="form-grid compact-form-grid">
                  <label>
                    <span>客户端版本</span>
                    <input :value="item.appVersion || '未上报'" readonly />
                  </label>
                  <label>
                    <span>配置版本</span>
                    <input :value="item.configVersion || '未上报'" readonly />
                  </label>
                  <label>
                    <span>当前服务</span>
                    <input :value="item.currentServiceUrl || '未上报'" readonly />
                  </label>
                  <label>
                    <span>目标服务</span>
                    <input :value="item.desiredServiceUrl || consoleState?.discovery?.value?.activeServiceUrl || '未设置'" readonly />
                  </label>
                  <label>
                    <span>任务服务</span>
                    <input :value="item.currentJobServiceUrl || '无运行任务'" readonly />
                  </label>
                  <label>
                    <span>最近上报</span>
                    <input :value="formatCompactDate(item.lastSeenAt)" readonly />
                  </label>
                </div>

                <p v-if="item.lastError" class="module-note danger-text">
                  {{ item.lastError }}
                </p>
                <p v-if="clientMigrationMessages[item.clientId]" class="module-note">
                  {{ clientMigrationMessages[item.clientId] }}
                </p>

                <div class="module-panel-footer">
                  <button
                    class="tool-button"
                    type="submit"
                    :disabled="!canAdminRuntime || busyKey === `client:migration:${item.clientId}`"
                  >
                    {{ busyKey === `client:migration:${item.clientId}` ? "发布中" : "拉起迁移" }}
                  </button>
                </div>
              </form>
            </div>

            <div v-else class="migration-empty">
              <strong>暂无客户端迁移流量</strong>
              <p>
                引导地址
                  {{ consoleState?.discovery?.value?.bootstrapBaseUrl || "未配置" }}
              </p>
              <p>
                离线判定
                  {{ consoleState?.discovery?.value?.offlineAfterSeconds || 0 }} 秒
              </p>
              <p>
                最近客户端
                {{
                  latestClient
                    ? formatCompactDate(latestClient.lastSeenAt)
                    : "暂无上报"
                }}
              </p>
            </div>
          </aside>
</template>
