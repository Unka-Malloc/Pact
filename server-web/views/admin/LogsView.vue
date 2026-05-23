<script setup lang="ts">
import { useConsole } from '../../composables/useConsole';
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
  handleKnowledgeLogColumnDividerKeydown,
  handleKnowledgeLogTableScroll,
  isAuthenticated,
  knowledgeLogAdvancedOpen,
  knowledgeLogColumnDividers,
  knowledgeLogColumnWidths,
  knowledgeLogFilters,
  knowledgeLogResizing,
  knowledgeLogStatusOptionBarOptions,
  knowledgeLogTableShellRef,
  monitorAlertSummary,
  workQueueSummary,
  refreshSystemStatusLogs,
  serverLogRows,
  startKnowledgeLogColumnResize,
} = useConsole();
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
              class="knowledge-log-table-shell"
              :class="{ 'is-resizing-column': Boolean(knowledgeLogResizing) }"
            >
              <el-table
                :data="filteredKnowledgeLogRows"
                row-key="logId"
                border
                stripe
                size="small"
                class="knowledge-log-table"
                empty-text="暂无系统日志"
                @scroll="handleKnowledgeLogTableScroll"
              >
                <el-table-column prop="kindLabel" label="类型" :width="knowledgeLogColumnWidths.kind" />
                <el-table-column label="对象" :width="knowledgeLogColumnWidths.target" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="knowledge-log-target">
                      <span class="mono-compact" :title="row.logId">{{ row.displayId }}</span>
                      <small>{{ row.target }}</small>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="状态" :width="knowledgeLogColumnWidths.status">
                  <template #default="{ row }">
                    <StatusPill :tone="row.tone" :label="row.statusLabel" />
                  </template>
                </el-table-column>
                <el-table-column prop="stage" label="阶段" :width="knowledgeLogColumnWidths.stage" show-overflow-tooltip />
                <el-table-column label="进度" :width="knowledgeLogColumnWidths.progress">
                  <template #default="{ row }">
                    {{ Math.round(Number(row.progressPercent || 0)) }}%
                  </template>
                </el-table-column>
                <el-table-column label="时间" :width="knowledgeLogColumnWidths.time">
                  <template #default="{ row }">
                    <span :title="formatMachineDate(row.occurredAt, 'full')">
                      {{ formatMachineDate(row.occurredAt, 'compact') }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column prop="detail" label="详情" :width="knowledgeLogColumnWidths.detail" show-overflow-tooltip />
                <el-table-column prop="error" label="错误" :width="knowledgeLogColumnWidths.error" show-overflow-tooltip />
              </el-table>
              <div class="knowledge-log-resize-layer">
                <button
                  v-for="divider in knowledgeLogColumnDividers"
                  :key="divider.key"
                  class="knowledge-log-column-divider"
                  type="button"
                  :aria-label="`拖拽调整${divider.label}列宽`"
                  :data-active="divider.active"
                  :style="{ left: `${divider.left}px` }"
                  :title="`拖拽调整${divider.label}列宽`"
                  @pointerdown="startKnowledgeLogColumnResize($event, divider.key)"
                  @keydown="handleKnowledgeLogColumnDividerKeydown($event, divider.key)"
                >
                  <span />
                </button>
              </div>
            </div>
          </section>
</template>
