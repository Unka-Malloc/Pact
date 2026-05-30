<script setup lang="ts">
import { computed, ref } from 'vue';
import { onMounted, onUnmounted } from 'vue';
import { useConsole } from '../composables/useConsole';
import BinaryCheckbox from '../components/BinaryCheckbox.vue';
import BrowseSelectButton from '../components/BrowseSelectButton.vue';
import StatusPill from '../components/StatusPill.vue';

const {
  activeKnowledgeSources,
  addKnowledgeSource,
  busyKey,
  canBrowseServerPaths,
  canWriteJobs,
  clientRuntimeHeatRows,
  clientRuntimeTaskText,
  consoleState,
  deleteKnowledgeSource,
  formatBytes,
  formatCompactDate,
  localSourceForm,
  openAdmin,
  openLocalSourceDirectoryPicker,
  refreshClientRuntimeStatus,
  refreshKnowledgeSource,
  refreshKnowledgeSources,
  refreshState,
  shortId,
  sourceDownloadStatusLabel,
  sourceIndexStatusLabel,
  sourceJobProgress,
  sourceSyncLabel,
  sourceSyncTone,
  splitJobStatusLabel,
  syncLocalSourceLabelFromPath,
  updateKnowledgeSource,
} = useConsole();

type DataSourceType = '' | 'localDirectory' | 'client';

let pollTimer: number | null = null;
const addDataSourceDialogOpen = ref(false);
const selectedDataSourceType = ref<DataSourceType>('');

const clientTotalCount = computed(() => consoleState.value?.clients?.summary?.totalCount || 0);
const clientOfflineCount = computed(() => consoleState.value?.clients?.summary?.offlineCount || 0);
const clientOnlineCount = computed(() => Math.max(0, clientTotalCount.value - clientOfflineCount.value));
const clientRequestRows = computed(() => {
  const heatRows = clientRuntimeHeatRows.value || [];
  if (heatRows.length) {
    return heatRows.map((row) => ({
      key: row.clientUid,
      label: row.clientUid,
      detail: clientRuntimeTaskText(row),
      requestPerMinute: Number(row.recentCalls || 0),
      totalCalls: Number(row.totalCalls || 0),
      lastSeenAt: row.lastSeenAt || "",
    }));
  }
  return (consoleState.value?.clients?.items || []).map((client) => ({
    key: client.clientId,
    label: client.clientLabel || client.clientId,
    detail: client.hostname || client.platform || "无请求记录",
    requestPerMinute: 0,
    totalCalls: 0,
    lastSeenAt: client.lastSeenAt || "",
  }));
});
const clientRequestChartMax = computed(() =>
  Math.max(1, ...clientRequestRows.value.map((row) => Number(row.requestPerMinute || 0))),
);
const clientRequestChartRows = computed(() =>
  clientRequestRows.value.map((row) => {
    const requestPerMinute = Number(row.requestPerMinute || 0);
    return {
      ...row,
      barPercent: requestPerMinute > 0 ? Math.max(8, Math.round((requestPerMinute / clientRequestChartMax.value) * 100)) : 0,
      lastSeenLabel: formatCompactDate(row.lastSeenAt) || "暂无上报",
    };
  }),
);

function openAddDataSourceDialog() {
  selectedDataSourceType.value = '';
  addDataSourceDialogOpen.value = true;
}

function closeAddDataSourceDialog() {
  addDataSourceDialogOpen.value = false;
  selectedDataSourceType.value = '';
}

async function submitSelectedDataSource() {
  if (selectedDataSourceType.value === 'localDirectory') {
    const added = await addKnowledgeSource();
    if (added) {
      closeAddDataSourceDialog();
    }
    return;
  }
  if (selectedDataSourceType.value === 'client') {
    closeAddDataSourceDialog();
    openAdmin('clients');
  }
}

onMounted(() => {
  // Initial fetch if needed, and start polling
  refreshKnowledgeSources();
  refreshClientRuntimeStatus({ silent: true });
  refreshState({ silent: true });
  pollTimer = window.setInterval(() => {
    refreshKnowledgeSources();
    refreshClientRuntimeStatus({ silent: true });
    refreshState({ silent: true });
  }, 3000); // poll every 3 seconds
});

onUnmounted(() => {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
});
</script>

<template>
  <div style="padding-bottom: 24px;">
    <!-- Top Action Bar -->
    <div class="sources-action-bar">
      <button
        class="primary-action"
        type="button"
        data-testid="add-data-source-button"
        @click="openAddDataSourceDialog"
      >
        添加数据源
      </button>
    </div>

    <!-- Outer Container for Cards -->
    <div class="sources-cards-container">
      <section class="sources-layout">
      <!-- 动态的本地文件夹数据源卡片 -->
      <article
        v-for="source in activeKnowledgeSources"
        :key="source.sourceId"
        class="knowledge-source-card surface-card source-card"
      >
        <div class="knowledge-source-card-header source-card-header" style="display: flex; justify-content: space-between; margin-bottom: 16px;">
          <div>
            <h3 style="font-size: 1rem; margin-bottom: 4px;">{{ source.label }}</h3>
            <p style="color: var(--text-muted); font-size: 0.8rem; word-break: break-all;">{{ source.directoryPath }}</p>
          </div>
          <StatusPill :tone="sourceSyncTone(source)" :label="sourceSyncLabel(source)" />
        </div>

        <dl class="meta-list source-meta-list" style="margin-bottom: 16px;">
          <div>
            <dt>文件</dt>
            <dd>{{ source.lastFileCount || 0 }} 个 / {{ formatBytes(source.lastTotalBytes) }}</dd>
          </div>
          <div>
            <dt>最近扫描</dt>
            <dd>{{ formatCompactDate(source.lastScanAt) || "未扫描" }}</dd>
          </div>
          <div>
            <dt>监听</dt>
            <dd>{{ source.watcherStatus }} / {{ source.watcherCount || 0 }}</dd>
          </div>
          <div>
            <dt>自动下载</dt>
            <dd>
              {{ sourceDownloadStatusLabel(source) }}
              / {{ source.lastHydratedFileCount || 0 }} 可入库
              <template v-if="source.lastHydrationFailedCount"> / {{ source.lastHydrationFailedCount }} 待处理</template>
            </dd>
          </div>
          <div>
            <dt>原文索引</dt>
            <dd>
              {{ sourceIndexStatusLabel(source) }}
              / {{ source.lastIndexedFileCount || 0 }} 文件
              <template v-if="source.lastIndexFailedCount"> / {{ source.lastIndexFailedCount }} 失败</template>
            </dd>
          </div>
          <div>
            <dt>最近任务</dt>
            <dd>{{ source.lastJobId || "无" }}</dd>
          </div>
          <div>
            <dt>断点树</dt>
            <dd>
              同步 {{ shortId(source.lastSyncCheckpointTreeId) }}
              / 索引 {{ shortId(source.lastIndexCheckpointTreeId) }}
            </dd>
          </div>
        </dl>

        <p
          v-if="source.lastHydrationFailureSamples?.length"
          class="module-note warning-note"
        >
          待下载：{{ source.lastHydrationFailureSamples.slice(0, 3).map((item) => `${item.relativePath || "文件"}：${item.reason || "未下载"}`).join("；") }}
        </p>
        <p v-if="source.lastIndexError" class="module-note warning-note">
          原文索引：{{ source.lastIndexError }}
        </p>

        <div v-if="source.lastJobId" class="source-progress" style="margin-top: 16px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
            <span>{{ splitJobStatusLabel(source.lastJobStatus) }}</span>
            <small style="color: var(--text-muted);">{{ source.lastJobStage || "等待开始" }}</small>
          </div>
          <progress :value="sourceJobProgress(source)" max="100" style="width: 100%; height: 6px; border-radius: 3px;" />
        </div>
        <p v-if="source.error" class="module-note danger-note" style="margin-top: 8px;">{{ source.error }}</p>

        <div class="source-actions" style="margin-top: auto; padding-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button
            class="tool-button"
            type="button"
            :disabled="busyKey === `knowledge:source:refresh:${source.sourceId}`"
            @click="refreshKnowledgeSource(source)"
          >
            同步目录
          </button>
          <button
            class="tool-button tool-button-ghost"
            type="button"
            :disabled="busyKey === `knowledge:source:refresh:${source.sourceId}`"
            @click="refreshKnowledgeSource(source, true)"
          >
            重新整理
          </button>
          <button
            class="tool-button tool-button-ghost"
            type="button"
            :disabled="busyKey === `knowledge:source:${source.sourceId}`"
            @click="updateKnowledgeSource(source, { enabled: !source.enabled })"
          >
            {{ source.enabled ? "暂停" : "启用" }}
          </button>
          <button
            class="table-action danger-action"
            type="button"
            :disabled="busyKey === `knowledge:source:delete:${source.sourceId}`"
            @click="deleteKnowledgeSource(source)"
            style="margin-left: auto;"
          >
            删除
          </button>
        </div>
      </article>

      <!-- 无本地数据源时的空占位卡片 -->
      <article v-if="activeKnowledgeSources.length === 0" class="surface-card source-card source-empty-card">
        <svg class="source-empty-card-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
        <strong>暂无本地数据源</strong>
        <p>点击右上角「添加数据源」后，按类型填写对应配置。</p>
      </article>


    </section>
  </div>

    <Teleport to="body">
      <div
        v-if="addDataSourceDialogOpen"
        class="data-source-dialog-backdrop"
        @click.self="closeAddDataSourceDialog"
      >
        <section
          class="data-source-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-data-source-title"
          data-testid="add-data-source-dialog"
          @keydown.esc="closeAddDataSourceDialog"
        >
          <header class="data-source-dialog-header">
            <div>
              <h3 id="add-data-source-title">添加数据源</h3>
              <p>先选择数据源类型，再填写该类型需要的配置。</p>
            </div>
            <button
              class="dialog-close-button"
              type="button"
              aria-label="关闭"
              title="关闭"
              @click="closeAddDataSourceDialog"
            >
              ×
            </button>
          </header>

          <form class="data-source-dialog-body" @submit.prevent="submitSelectedDataSource">
            <label class="data-source-type-field">
              <span>数据源类型</span>
              <select
                v-model="selectedDataSourceType"
                data-testid="data-source-type-select"
                autofocus
              >
                <option disabled value="">请选择数据源类型</option>
                <option value="localDirectory">本地目录</option>
                <option value="client">客户端接入</option>
              </select>
            </label>

            <section
              v-if="selectedDataSourceType === 'localDirectory'"
              class="data-source-config-panel"
              data-testid="local-directory-config"
            >
              <label class="source-name-field">
                <span>目录名称</span>
                <input
                  v-model="localSourceForm.label"
                  type="text"
                  placeholder="例如：公司共享资料"
                  autocomplete="off"
                />
              </label>
              <label class="source-path-field">
                <span>本地路径</span>
                <div class="path-field">
                  <input
                    v-model="localSourceForm.directoryPath"
                    type="text"
                    placeholder="/Users/you/Documents/Knowledge"
                    autocomplete="off"
                    @change="syncLocalSourceLabelFromPath"
                  />
                  <BrowseSelectButton
                    kind="server-directory"
                    button-class="path-action-button"
                    button-text="浏览"
                    size="small"
                    :disabled="!canBrowseServerPaths"
                    plain
                    @browse="openLocalSourceDirectoryPicker"
                  />
                </div>
              </label>
              <div class="source-sync-row">
                <BinaryCheckbox
                  v-model="localSourceForm.autoSync"
                  label="自动监听变化"
                />
                <BinaryCheckbox
                  v-model="localSourceForm.recursive"
                  label="包含子目录"
                />
                <BinaryCheckbox
                  v-model="localSourceForm.hydrationEnabled"
                  label="自动下载"
                />
              </div>
            </section>

            <section
              v-else-if="selectedDataSourceType === 'client'"
              class="data-source-config-panel"
              data-testid="client-source-config"
            >
              <div class="data-source-config-note">
                <strong>客户端接入</strong>
                <span>客户端无需在这里创建固定记录。客户端完成接入并上报后，会自动出现在客户端列表和请求统计表中。</span>
              </div>
            </section>

            <footer
              v-if="selectedDataSourceType"
              class="data-source-dialog-actions"
            >
              <button
                class="tool-button tool-button-ghost"
                type="button"
                @click="closeAddDataSourceDialog"
              >
                取消
              </button>
              <button
                v-if="selectedDataSourceType === 'localDirectory'"
                class="primary-action"
                type="submit"
                :disabled="!canWriteJobs || busyKey === 'knowledge:sources:add'"
              >
                {{ busyKey === "knowledge:sources:add" ? "添加中" : "添加数据源" }}
              </button>
              <button
                v-else-if="selectedDataSourceType === 'client'"
                class="primary-action"
                type="submit"
              >
                查看客户端
              </button>
            </footer>
          </form>
        </section>
      </div>
    </Teleport>
  </div>
</template>
