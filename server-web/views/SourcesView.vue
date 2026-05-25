<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useConsole } from '../composables/useConsole';
import StatusPill from '../components/StatusPill.vue';

const {
  activeKnowledgeSources,
  busyKey,
  consoleState,
  deleteKnowledgeSource,
  formatBytes,
  formatCompactDate,
  openAdmin,
  openDrawer,
  refreshKnowledgeSource,
  refreshKnowledgeSources,
  shortId,
  sourceDownloadStatusLabel,
  sourceIndexStatusLabel,
  sourceJobProgress,
  sourceSyncLabel,
  sourceSyncTone,
  splitJobStatusLabel,
  updateKnowledgeSource,
} = useConsole();

let pollTimer: number | null = null;

onMounted(() => {
  // Initial fetch if needed, and start polling
  refreshKnowledgeSources();
  pollTimer = window.setInterval(() => {
    refreshKnowledgeSources();
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
    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px;">
      <div>
        <h3 style="font-size: 1.1rem; margin-bottom: 4px;">数据源能力</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem;">配置并管理所有的本地或外部数据来源。</p>
      </div>
      <button
        class="primary-action"
        type="button"
        @click="openDrawer('syncDirectories')"
      >
        + 添加本地目录
      </button>
    </div>

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
            手动刷新
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
      <article v-if="activeKnowledgeSources.length === 0" class="surface-card source-card" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 48px 24px; text-align: center; color: var(--text-muted); border: 1px dashed var(--border-color); box-shadow: none;">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px; opacity: 0.5;"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
        <strong style="font-size: 1rem; color: var(--text-color);">暂无本地数据源</strong>
        <p style="margin-top: 8px; font-size: 0.85rem;">点击右上角「添加本地目录」后，文件变化会自动触发整理任务。</p>
      </article>

      <!-- 外部客户端卡片 -->
      <article class="surface-card source-card">
        <div class="source-card-header">
          <div>
            <h3>外部客户端</h3>
            <p>桌面客户端通过服务发现接入，服务端只提供任务、解析与工具能力。</p>
          </div>
          <StatusPill
            :enabled="(consoleState?.clients?.summary?.totalCount || 0) > 0"
            :label="`${consoleState?.clients?.summary?.totalCount || 0} 台`"
          />
        </div>
        <dl class="meta-list">
          <div>
            <dt>活跃服务</dt>
            <dd>{{ consoleState?.discovery?.value?.activeServiceUrl || "未配置" }}</dd>
          </div>
          <div>
            <dt>模式</dt>
            <dd>{{ consoleState?.discovery?.value?.mode || "active" }}</dd>
          </div>
        </dl>
        <div class="source-actions" style="margin-top: auto;">
          <button
            class="tool-button tool-button-ghost"
            type="button"
            @click="openAdmin('clients')"
          >
            设备管理
          </button>
        </div>
      </article>
    </section>
  </div>
</template>
