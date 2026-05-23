<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import StatusPill from "../../components/StatusPill.vue";
import { bridge } from "../../lib/bridge";
import type { ProductionHealthGate, ProductionHealthResponse } from "../../lib/types";

const health = ref<ProductionHealthResponse | null>(null);
const loading = ref(false);
const loadError = ref("");

const statusLabels: Record<string, string> = {
  pass: "通过",
  fail: "失败",
  timeout: "超时",
  blocked: "阻塞",
  missing: "缺失",
  partial: "部分",
  warning: "预警",
  unknown: "未知"
};

const overallLabel = computed(() => statusLabel(health.value?.status || "missing"));
const reportGeneratedAt = computed(() => formatDateTime(health.value?.latestReport?.generatedAt || health.value?.generatedAt || ""));
const latestCommit = computed(() => {
  const commit = health.value?.latestReport?.git?.commit || "";
  return commit ? commit.slice(0, 12) : "unknown";
});
const failedGates = computed(() => (health.value?.gates || []).filter((gate) => gate.status !== "pass"));

function statusLabel(status: string) {
  return statusLabels[status] || status || "未知";
}

function statusTone(status: string) {
  if (status === "pass") return "success";
  if (status === "fail" || status === "timeout" || status === "blocked") return "danger";
  if (status === "missing" || status === "partial" || status === "warning") return "warning";
  return "neutral";
}

function formatDateTime(value: string) {
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

function elapsedText(gate: ProductionHealthGate) {
  const ms = Number(gate.commandSummary?.elapsedMs || 0);
  if (!ms) return "0ms";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
}

async function refreshProductionHealth() {
  loading.value = true;
  loadError.value = "";
  try {
    health.value = await bridge.getProductionHealth();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void refreshProductionHealth();
});
</script>

<template>
  <section class="production-health-layout">
    <article class="surface-card production-health-hero">
      <div class="section-header">
        <div>
          <h3>生产健康</h3>
          <p>汇总生产准入报告、质量门禁、运行时治理、权限安全、备份恢复和发版连续性状态。</p>
        </div>
        <div class="section-tags">
          <StatusPill :tone="statusTone(health?.status || 'missing')" :label="overallLabel" />
          <span>{{ health?.latestReport?.runId || "无报告" }}</span>
          <span>{{ reportGeneratedAt }}</span>
        </div>
      </div>

      <div class="source-actions">
        <button
          class="tool-button tool-button-ghost"
          type="button"
          :disabled="loading"
          @click="refreshProductionHealth"
        >
          {{ loading ? "刷新中" : "刷新" }}
        </button>
      </div>

      <div v-if="loadError" class="status-strip danger">
        <strong>读取失败</strong>
        <span>{{ loadError }}</span>
      </div>

      <div class="detail-metrics production-health-metrics">
        <div>
          <span>通过门禁</span>
          <strong>{{ health?.summary.pass || 0 }}</strong>
        </div>
        <div>
          <span>失败门禁</span>
          <strong>{{ health?.summary.fail || 0 }}</strong>
        </div>
        <div>
          <span>超时门禁</span>
          <strong>{{ health?.summary.timeout || 0 }}</strong>
        </div>
        <div>
          <span>P0 阻塞</span>
          <strong>{{ health?.summary.blockedP0 || 0 }}</strong>
        </div>
      </div>

      <dl class="module-status-list production-health-meta">
        <div>
          <dt>报告目录</dt>
          <dd>{{ health?.reportRoot || "reports/production-readiness" }}</dd>
        </div>
        <div>
          <dt>分支</dt>
          <dd>{{ health?.latestReport?.git.branch || "unknown" }}</dd>
        </div>
        <div>
          <dt>提交</dt>
          <dd>{{ latestCommit }}</dd>
        </div>
        <div>
          <dt>脏文件</dt>
          <dd>{{ health?.latestReport?.git.dirtyFileCount ?? 0 }}</dd>
        </div>
      </dl>
    </article>

    <article v-if="health?.coverage.missing.length" class="surface-card production-health-warning">
      <div class="section-header">
        <div>
          <h3>覆盖缺口</h3>
        </div>
        <div class="section-tags">
          <span>{{ health.coverage.missing.length }} 项</span>
        </div>
      </div>
      <div class="production-token-list">
        <span v-for="item in health.coverage.missing" :key="item">{{ item }}</span>
      </div>
    </article>

    <section class="production-section-grid">
      <article
        v-for="section in health?.sections || []"
        :key="section.id"
        class="surface-card production-section-card"
      >
        <div class="section-header compact-section-header">
          <div>
            <h3>{{ section.label }}</h3>
            <p>{{ section.description }}</p>
          </div>
          <StatusPill :tone="section.tone" :label="statusLabel(section.status)" />
        </div>
        <div class="production-section-score">
          <strong>{{ section.passed }} / {{ section.total }}</strong>
          <span>门禁通过</span>
        </div>
        <div class="production-gate-chips">
          <span
            v-for="gate in section.gates"
            :key="gate.id"
            :data-tone="gate.tone"
          >
            {{ gate.title }}
          </span>
          <span
            v-for="gateId in section.missingGateIds"
            :key="gateId"
            data-tone="warning"
          >
            {{ gateId }}
          </span>
        </div>
      </article>
    </section>

    <article class="surface-card">
      <div class="section-header">
        <div>
          <h3>门禁明细</h3>
        </div>
        <div class="section-tags">
          <span>{{ health?.gates.length || 0 }} 项</span>
          <span>未通过 {{ failedGates.length }}</span>
        </div>
      </div>
      <div v-if="health?.gates.length" class="job-table compact-job-table production-gate-table">
        <div class="job-table-header">
          <span>门禁</span>
          <span>状态</span>
          <span>负责人</span>
          <span>命令</span>
          <span>证据和下一步</span>
        </div>
        <div v-for="gate in health.gates" :key="gate.id" class="job-row">
          <span>
            <strong>{{ gate.title }}</strong>
            <small>{{ gate.id }} · {{ gate.blockerLevel || "未分级" }}</small>
          </span>
          <span>
            <StatusPill :tone="gate.tone" :label="statusLabel(gate.status)" />
          </span>
          <span>
            <strong>{{ gate.owner || "未声明" }}</strong>
            <small>{{ gate.coverage.join(" / ") || "无覆盖声明" }}</small>
          </span>
          <span>
            <strong>{{ gate.commandSummary.total }} 条</strong>
            <small>失败 {{ gate.commandSummary.failed }} · 超时 {{ gate.commandSummary.timedOut }} · {{ elapsedText(gate) }}</small>
          </span>
          <span>
            <strong>{{ gate.evidencePath || "无证据路径" }}</strong>
            <small>{{ gate.status === "pass" ? "已闭环" : gate.nextStep }}</small>
          </span>
        </div>
      </div>
      <div v-else class="empty-state">
        <strong>暂无生产准入报告</strong>
        <span>执行生产准入 verifier 后会在这里显示最新门禁。</span>
      </div>
    </article>

    <section class="production-health-bottom-grid">
      <article class="surface-card">
        <div class="section-header compact-section-header">
          <div>
            <h3>报告历史</h3>
          </div>
          <div class="section-tags">
            <span>{{ health?.history?.length || 0 }} 条</span>
          </div>
        </div>
        <div v-if="health?.history?.length" class="production-history-list">
          <div v-for="item in health.history" :key="item.runId">
            <StatusPill :tone="statusTone(item.status)" :label="statusLabel(item.status)" />
            <strong>{{ item.runId }}</strong>
            <span>{{ formatDateTime(item.generatedAt) }}</span>
          </div>
        </div>
        <div v-else class="empty-state compact-empty-state">
          <strong>没有历史报告</strong>
        </div>
      </article>

      <article class="surface-card">
        <div class="section-header compact-section-header">
          <div>
            <h3>执行入口</h3>
          </div>
        </div>
        <div class="production-action-list">
          <div v-for="action in health?.actions || []" :key="action.id">
            <strong>{{ action.label }}</strong>
            <code>{{ action.command }}</code>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.production-health-layout {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.production-health-hero {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.production-health-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.production-health-meta {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.production-health-warning {
  border-color: var(--warning-border);
  background: var(--warning-surface);
}

.production-token-list,
.production-gate-chips,
.production-action-list,
.production-history-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.production-token-list span,
.production-gate-chips span {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 var(--space-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
}

.production-gate-chips span[data-tone="success"] {
  border-color: var(--success-border);
  background: var(--success-surface);
  color: var(--success);
}

.production-gate-chips span[data-tone="warning"] {
  border-color: var(--warning-border);
  background: var(--warning-surface);
  color: var(--warning-text);
}

.production-gate-chips span[data-tone="danger"] {
  border-color: var(--danger-border);
  background: var(--danger-surface);
  color: var(--danger);
}

.production-section-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.production-section-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 220px;
}

.compact-section-header {
  align-items: flex-start;
}

.production-section-score {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.production-section-score strong {
  color: var(--text-primary);
  font-size: var(--text-2xl);
  line-height: 1;
}

.production-section-score span {
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.production-gate-table {
  --table-columns: minmax(210px, 1.2fr) minmax(90px, 0.5fr) minmax(160px, 0.8fr) minmax(160px, 0.8fr) minmax(280px, 1.4fr);
}

.production-gate-table .job-table-header,
.production-gate-table .job-row {
  grid-template-columns: var(--table-columns);
}

.production-health-bottom-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-4);
}

.production-history-list {
  flex-direction: column;
}

.production-history-list div,
.production-action-list div {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-2);
  min-height: 36px;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border-subtle);
}

.production-history-list div:last-child,
.production-action-list div:last-child {
  border-bottom: 0;
}

.production-history-list strong,
.production-action-list strong {
  min-width: 0;
  color: var(--text-primary);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.production-history-list span {
  color: var(--text-muted);
  font-size: var(--text-xs);
  white-space: nowrap;
}

.production-action-list {
  flex-direction: column;
}

.production-action-list div {
  grid-template-columns: minmax(120px, 0.35fr) minmax(0, 1fr);
}

.production-action-list code {
  min-width: 0;
  padding: var(--space-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  overflow-wrap: anywhere;
}

.compact-empty-state {
  min-height: 96px;
}

@media (max-width: 1120px) {
  .production-section-grid,
  .production-health-bottom-grid {
    grid-template-columns: 1fr;
  }

  .production-health-metrics,
  .production-health-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .production-gate-table {
    overflow-x: auto;
  }

  .production-gate-table .job-table-header,
  .production-gate-table .job-row {
    min-width: 980px;
  }
}

@media (max-width: 680px) {
  .production-health-metrics,
  .production-health-meta {
    grid-template-columns: 1fr;
  }

  .production-history-list div,
  .production-action-list div {
    grid-template-columns: 1fr;
    align-items: flex-start;
  }
}
</style>
