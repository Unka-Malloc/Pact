<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import StatusPill from "../../components/StatusPill.vue";
import { usePageRefreshHandler } from "../../composables/usePageRefresh";
import { bridge } from "../../lib/bridge";

type RuntimeDependency = {
  id: string;
  label: string;
  category?: string;
  description?: string;
  status: string;
  present?: boolean;
  cached?: boolean;
  downloadable?: boolean;
  children?: RuntimeDependency[];
  detection?: Record<string, unknown>;
  actions?: Record<string, unknown>;
  accepts?: Record<string, boolean>;
};

type RuntimeDependencyListResponse = {
  ok: boolean;
  generatedAt?: string;
  cacheRoot?: string;
  sourceConfigPath?: string;
  triggerMode?: string;
  dependencies?: RuntimeDependency[];
  summary?: Record<string, number>;
};

type RuntimeDependencyActionResult = {
  ok: boolean;
  targetId?: string;
  status?: string;
  reason?: string;
  mirrorHint?: string;
  sourceConfigPath?: string;
  detection?: RuntimeDependency;
  results?: RuntimeDependencyActionResult[];
};

const dependencies = ref<RuntimeDependency[]>([]);
const cacheRoot = ref("");
const sourceConfigPath = ref("");
const generatedAt = ref("");
const loading = ref(false);
const loadError = ref("");
const actionBusyId = ref("");
const actionError = ref("");
const actionResult = ref<RuntimeDependencyActionResult | null>(null);

const readyCount = computed(() => dependencies.value.filter((item) => item.present).length);
const installedCount = computed(() => dependencies.value.filter((item) => item.status === "installed").length);
const failedCount = computed(() => dependencies.value.filter((item) => item.status === "failed").length);

function statusLabel(status = "") {
  const labels: Record<string, string> = {
    present: "已存在",
    installed: "安装成功",
    failed: "安装失败"
  };
  return labels[status] || status || "未知";
}

function statusTone(status = "") {
  if (status === "present" || status === "installed") return "success";
  if (status === "failed") return "danger";
  return "neutral";
}

function formatDateTime(value = "") {
  if (!value) return "未生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function childSummary(item: RuntimeDependency) {
  const children = item.children || [];
  if (!children.length) return "";
  return children.map((child) => `${child.label}: ${statusLabel(child.status)}`).join(" / ");
}

function sourceHint(item: RuntimeDependency) {
  const detection = item.detection || {};
  const policy = String(detection.sourcePolicy || "");
  if (policy) return policy;
  return item.downloadable ? "检测本机后按本地源配置安装" : "检测本机连接状态";
}

function canTrigger(item: RuntimeDependency) {
  return item.downloadable !== false && item.status !== "present";
}

function preparePayload(item: RuntimeDependency) {
  return { targetId: item.id };
}

async function refreshRuntimeDependencies() {
  loading.value = true;
  loadError.value = "";
  try {
    const payload = await bridge.listRuntimeDependencies() as RuntimeDependencyListResponse;
    dependencies.value = payload.dependencies || [];
    cacheRoot.value = payload.cacheRoot || "";
    sourceConfigPath.value = payload.sourceConfigPath || "";
    generatedAt.value = payload.generatedAt || "";
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

async function prepareDependency(item: RuntimeDependency) {
  if (!canTrigger(item)) return;
  actionBusyId.value = item.id;
  actionError.value = "";
  actionResult.value = null;
  try {
    actionResult.value = await bridge.downloadRuntimeDependency(preparePayload(item)) as RuntimeDependencyActionResult;
    await refreshRuntimeDependencies();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error);
  } finally {
    actionBusyId.value = "";
  }
}

onMounted(() => {
  void refreshRuntimeDependencies();
});

usePageRefreshHandler(
  (detail) => detail.viewId === "admin" && detail.adminView === "runtimeDownloads",
  refreshRuntimeDependencies,
);
</script>

<template>
  <section class="runtime-download-layout">
    <article class="surface-card">
      <div class="section-header">
        <div>
          <h3>运行时下载</h3>
          <p>按需检测本机能力，只有点击安装时才下载或缓存缺失依赖。</p>
        </div>
        <div class="section-tags">
          <span>已存在 {{ readyCount }}</span>
          <span>安装成功 {{ installedCount }}</span>
          <span>安装失败 {{ failedCount }}</span>
          <span>{{ formatDateTime(generatedAt) }}</span>
        </div>
      </div>
      <div v-if="loadError" class="status-strip danger">
        <strong>检测失败</strong>
        <span>{{ loadError }}</span>
      </div>
      <dl class="module-status-list">
        <div>
          <dt>触发方式</dt>
          <dd>用户请求</dd>
        </div>
        <div>
          <dt>启动下载</dt>
          <dd>关闭</dd>
        </div>
        <div>
          <dt>缓存目录</dt>
          <dd>{{ cacheRoot || "未读取" }}</dd>
        </div>
        <div>
          <dt>源配置</dt>
          <dd>{{ sourceConfigPath || "未读取" }}</dd>
        </div>
      </dl>
    </article>

    <article class="surface-card">
      <div class="runtime-dependency-list">
        <div class="runtime-dependency-header">
          <span>依赖</span>
          <span>状态</span>
          <span>检测来源</span>
          <span>操作</span>
        </div>
        <div
          v-for="item in dependencies"
          :key="item.id"
          class="runtime-dependency-row"
        >
          <div class="runtime-dependency-name">
            <strong>{{ item.label }}</strong>
            <small>{{ item.id }}</small>
            <small v-if="childSummary(item)">{{ childSummary(item) }}</small>
          </div>
          <div>
            <StatusPill :tone="statusTone(item.status)" :label="statusLabel(item.status)" />
          </div>
          <div class="runtime-dependency-source">
            <span>{{ sourceHint(item) }}</span>
          </div>
          <div>
            <button
              class="tool-button"
              type="button"
              :disabled="actionBusyId === item.id || !canTrigger(item)"
              @click="prepareDependency(item)"
            >
              {{ actionBusyId === item.id ? "安装中" : item.present ? "已存在" : "安装" }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="!loading && dependencies.length === 0" class="empty-state">
        <strong>暂无依赖状态</strong>
        <span>刷新后会显示当前平台可检测的运行时依赖。</span>
      </div>
    </article>

    <article v-if="actionResult || actionError" class="surface-card">
      <div class="section-header">
        <div>
          <h3>最近结果</h3>
        </div>
        <div v-if="actionResult" class="section-tags">
          <span>{{ actionResult.targetId }}</span>
          <span>{{ statusLabel(actionResult.status || "") }}</span>
        </div>
      </div>
      <div v-if="actionError" class="status-strip danger">
        <strong>执行失败</strong>
        <span>{{ actionError }}</span>
      </div>
      <div v-else-if="actionResult" :class="['status-strip', statusTone(actionResult.status || '')]">
        <strong>{{ statusLabel(actionResult.status || "") }}</strong>
        <span>{{ actionResult.mirrorHint || actionResult.reason || "操作完成" }}</span>
      </div>
    </article>
  </section>
</template>

<style scoped>
.runtime-download-layout {
  display: grid;
  gap: 16px;
}

.runtime-dependency-list {
  display: grid;
  gap: 8px;
}

.runtime-dependency-header,
.runtime-dependency-row {
  display: grid;
  grid-template-columns: minmax(190px, 1.2fr) minmax(96px, 0.5fr) minmax(260px, 1.4fr) minmax(92px, 0.4fr);
  gap: 12px;
  align-items: center;
}

.runtime-dependency-header {
  color: var(--muted-text);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.runtime-dependency-row {
  min-height: 72px;
  padding: 12px 0;
  border-top: 1px solid var(--border-subtle);
}

.runtime-dependency-name,
.runtime-dependency-source {
  display: grid;
  gap: 4px;
}

.runtime-dependency-name small,
.runtime-dependency-source span {
  color: var(--muted-text);
  font-size: 12px;
  line-height: 1.45;
}

@media (max-width: 980px) {
  .runtime-dependency-header {
    display: none;
  }

  .runtime-dependency-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }
}
</style>
