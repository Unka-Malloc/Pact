<script setup lang="ts">
import { useConsole } from '../../composables/useConsole';
import DataTable from '../../components/DataTable.vue';
import OptionBar from '../../components/OptionBar.vue';
import StatusPill from '../../components/StatusPill.vue';
const {
  adminView,
  busyKey,
  currentView,
  error,
  exportKnowledgeLogRows,
  filteredKnowledgeLogRows,
  formatMachineDate,
  handleKnowledgeLogTableScroll,
  isAuthenticated,
  knowledgeLogAdvancedOpen,
  knowledgeLogColumnWidths,
  knowledgeLogFilters,
  knowledgeLogStatusOptionBarOptions,
  knowledgeLogTableShellRef,
  monitorAlertSummary,
  workQueueSummary,
  refreshSystemStatusLogs,
  serverLogRows,
} = useConsole();

function handleHeaderDragend(newWidth: number, oldWidth: number, column: any) {
  const key = column.property;
  if (key && key in knowledgeLogColumnWidths.value) {
    knowledgeLogColumnWidths.value[key as keyof typeof knowledgeLogColumnWidths.value] = newWidth;
  }
}
</script>

<template>
          <section id="system-logs" class="surface-card knowledge-log-report">
            <div class="section-header">
              <div>
                <h3>日志记录</h3>
                <p>汇总服务端上传、知识库、工作队列、任务、进程、报警、认证和工具调用日志。</p>
              </div>
              <div class="section-tags">
                <span>总计 {{ serverLogRows.length }}</span>
                <span>显示 {{ filteredKnowledgeLogRows.length }}</span>
                <span>队列 {{ workQueueSummary.total }}</span>
                <span>报警 {{ monitorAlertSummary.visibleCount || monitorAlertSummary.activeCount }}</span>
              </div>
            </div>
            <div class="source-actions">
              <button
                class="tool-button"
                type="button"
                :disabled="busyKey === 'refresh'"
                @click="refreshSystemStatusLogs"
              >
                {{ busyKey === "refresh" ? "刷新中" : "刷新日志" }}
              </button>
              <button class="tool-button" type="button" @click="knowledgeLogAdvancedOpen = !knowledgeLogAdvancedOpen">
                {{ knowledgeLogAdvancedOpen ? "收起筛选" : "高级筛选" }}
              </button>
              <button class="tool-button" type="button" @click="exportKnowledgeLogRows">
                导出 CSV
              </button>
            </div>
            <div v-if="knowledgeLogAdvancedOpen" class="knowledge-log-filters">
              <input v-model="knowledgeLogFilters.id" type="search" placeholder="筛选 ID / 对象" />
              <OptionBar
                v-model="knowledgeLogFilters.status"
                :options="knowledgeLogStatusOptionBarOptions"
              />
              <input v-model="knowledgeLogFilters.stage" type="search" placeholder="阶段 / 详情关键词" />
              <input v-model="knowledgeLogFilters.from" type="date" />
              <input v-model="knowledgeLogFilters.to" type="date" />
            </div>
            <div
              ref="knowledgeLogTableShellRef"
              class="knowledge-log-table-shell" style="width: 100%; min-width: 0; overflow: hidden; border-radius: var(--radius-md);"
            >
              <DataTable
                :data="filteredKnowledgeLogRows"
                row-key="logId"
                empty-text="暂无系统日志"
                @scroll="handleKnowledgeLogTableScroll"
                @header-dragend="handleHeaderDragend"
              >
                <el-table-column prop="kind" label="类型" :min-width="knowledgeLogColumnWidths.kind">
                  <template #default="{ row }">{{ row.kindLabel }}</template>
                </el-table-column>
                <el-table-column prop="target" label="对象" :min-width="knowledgeLogColumnWidths.target" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="knowledge-log-target">
                      <span class="mono-compact" :title="row.logId">{{ row.displayId }}</span>
                      <small>{{ row.target }}</small>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column prop="status" label="状态" :min-width="knowledgeLogColumnWidths.status">
                  <template #default="{ row }">
                    <StatusPill :tone="row.tone" :label="row.statusLabel" />
                  </template>
                </el-table-column>
                <el-table-column prop="stage" label="阶段" :min-width="knowledgeLogColumnWidths.stage" show-overflow-tooltip />
                <el-table-column prop="progress" label="进度" :min-width="knowledgeLogColumnWidths.progress">
                  <template #default="{ row }">
                    {{ Math.round(Number(row.progressPercent || 0)) }}%
                  </template>
                </el-table-column>
                <el-table-column prop="time" label="时间" :min-width="knowledgeLogColumnWidths.time">
                  <template #default="{ row }">
                    <span :title="formatMachineDate(row.occurredAt, 'full')">
                      {{ formatMachineDate(row.occurredAt, 'compact') }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column prop="detail" label="详情" :min-width="knowledgeLogColumnWidths.detail" show-overflow-tooltip />
                <el-table-column prop="error" label="错误" :min-width="knowledgeLogColumnWidths.error" show-overflow-tooltip />
              </DataTable>
            </div>
          </section>
</template>
