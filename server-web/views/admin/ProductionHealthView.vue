<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import StatusPill from "../../components/StatusPill.vue";
import { usePageRefreshHandler } from "../../composables/usePageRefresh";
import { bridge } from "../../lib/bridge";
import type { ProductionHealthGate, ProductionHealthResponse, V001BaselineStatus } from "../../lib/types";

const health = ref<ProductionHealthResponse | null>(null);
const baseline = ref<V001BaselineStatus | null>(null);
const loading = ref(false);
const loadError = ref("");
const baselineError = ref("");

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

const reportGeneratedAt = computed(() => formatDateTime(health.value?.latestReport?.generatedAt || health.value?.generatedAt || ""));
const latestCommit = computed(() => {
  const commit = health.value?.latestReport?.git?.commit || "";
  return commit ? commit.slice(0, 12) : "unknown";
});
const capabilityKernel = computed(() => health.value?.capabilityKernel || null);
const capabilityBindingGuard = computed(() => health.value?.capabilityBindingGuard || null);
const failedGates = computed(() => (health.value?.gates || []).filter((gate) => gate.status !== "pass"));
const baselinePortLabels = computed(() => (baseline.value?.ports || []).map((port) => ({
  id: port.port,
  label: port.port,
  value: port.verificationMode || port.implementation
})));

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
  baselineError.value = "";
  try {
    const [healthState, baselineState] = await Promise.all([
      bridge.getProductionHealth(),
      bridge.getV001BaselineStatus()
    ]);
    health.value = healthState;
    baseline.value = baselineState;
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
    try {
      baseline.value = await bridge.getV001BaselineStatus();
    } catch (baselineLoadError) {
      baselineError.value = baselineLoadError instanceof Error ? baselineLoadError.message : String(baselineLoadError);
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void refreshProductionHealth();
});

usePageRefreshHandler(
  (detail) => detail.viewId === "admin" && detail.adminView === "productionHealth",
  refreshProductionHealth,
);
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
          <span>{{ health?.latestReport?.runId || "无报告" }}</span>
          <span>{{ reportGeneratedAt }}</span>
        </div>
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

      <div v-if="capabilityKernel" :class="['status-strip', capabilityKernel.degraded ? 'warning' : capabilityKernel.ok ? 'success' : 'danger']">
        <strong>Capability Kernel</strong>
        <span>{{ capabilityKernel.securityMode || capabilityKernel.status }} · {{ capabilityKernel.message }}</span>
      </div>

      <div v-if="capabilityBindingGuard" :class="['status-strip', capabilityBindingGuard.degraded ? 'warning' : capabilityBindingGuard.ok ? 'success' : 'danger']">
        <strong>Binding Guard</strong>
        <span>{{ capabilityBindingGuard.securityMode || capabilityBindingGuard.status }} · {{ capabilityBindingGuard.message }}</span>
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
        <div>
          <dt>权限内核</dt>
          <dd>{{ capabilityKernel?.provider || "unknown" }} / {{ capabilityKernel?.securityMode || "unknown" }}</dd>
        </div>
        <div>
          <dt>权限状态</dt>
          <dd>{{ capabilityKernel?.degraded ? "degraded" : capabilityKernel?.status || "unknown" }}</dd>
        </div>
        <div>
          <dt>权限绑定</dt>
          <dd>{{ capabilityKernel?.bindingCount ?? 0 }} keys / {{ capabilityKernel?.permissionBindingCount ?? 0 }} bindings</dd>
        </div>
        <div>
          <dt>恢复能力</dt>
          <dd>{{ capabilityKernel?.recoverySupported ? "recovery package" : "unavailable" }}</dd>
        </div>
        <div>
          <dt>绑定守卫</dt>
          <dd>{{ capabilityBindingGuard?.provider || "unknown" }} / {{ capabilityBindingGuard?.securityMode || "unknown" }}</dd>
        </div>
        <div>
          <dt>绑定状态</dt>
          <dd>{{ capabilityBindingGuard?.activeBindingCount ?? 0 }} active / {{ capabilityBindingGuard?.bindingCount ?? 0 }} total</dd>
        </div>
      </dl>
    </article>

    <article class="surface-card">
      <div class="section-header">
        <div>
          <h3>v0.0.1 基线</h3>
          <p>展示单机运行基线、五类 MCP 出口和本地通用切面状态。</p>
        </div>
      </div>
      <div class="production-baseline-summary">
        <div class="production-baseline-status">
          <span>基线状态</span>
          <StatusPill :tone="statusTone(baseline?.status === 'ready' ? 'pass' : 'missing')" :label="baseline?.status || '未读取'" />
        </div>
        <dl>
          <div>
            <dt>协议版本</dt>
            <dd>{{ baseline?.protocolVersion || "pact.v001.baseline.v1" }}</dd>
          </div>
          <div>
            <dt>验证模式</dt>
            <dd>{{ baseline?.verificationMode || "等待加载" }}</dd>
          </div>
        </dl>
      </div>
      <div v-if="baselineError" class="status-strip danger">
        <strong>读取失败</strong>
        <span>{{ baselineError }}</span>
      </div>
      <div class="detail-metrics production-health-metrics">
        <div>
          <span>MCP 出口</span>
          <strong>{{ baseline?.mcpOutlets.length || 0 }}</strong>
        </div>
        <div>
          <span>通用切面</span>
          <strong>{{ baseline?.ports.length || 0 }}</strong>
        </div>
        <div>
          <span>状态语义</span>
          <strong>{{ baseline?.storageStates.length || 0 }}</strong>
        </div>
        <div>
          <span>Secret 模式</span>
          <strong>{{ baseline?.ports.find((port) => port.port === 'SecretStorePort')?.verificationMode || "unknown" }}</strong>
        </div>
      </div>
      <div class="production-token-list">
        <span v-for="outlet in baseline?.mcpOutlets || []" :key="outlet">{{ outlet }}</span>
      </div>
      <div class="production-token-list">
        <span v-for="port in baselinePortLabels" :key="port.id">{{ port.label }} · {{ port.value }}</span>
      </div>
      <dl class="module-status-list production-health-meta">
        <div>
          <dt>运行配置</dt>
          <dd>{{ baseline?.rootPath || "ServerConfig.getDataDir()/v001-baseline" }}</dd>
        </div>
        <div>
          <dt>外部状态</dt>
          <dd>{{ baseline?.boundaries.externalState || "contract-mode adapters" }}</dd>
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

.production-baseline-summary {
  display: grid;
  grid-template-columns: minmax(180px, 0.45fr) minmax(0, 1fr);
  gap: var(--space-3);
  align-items: stretch;
}

.production-baseline-status,
.production-baseline-summary dl {
  min-width: 0;
  margin: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}

.production-baseline-status {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3);
}

.production-baseline-status > span,
.production-baseline-summary dt {
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.production-baseline-summary dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 0.42fr);
  overflow: hidden;
}

.production-baseline-summary dl > div {
  min-width: 0;
  padding: var(--space-3);
}

.production-baseline-summary dl > div + div {
  border-left: 1px solid var(--border-subtle);
}

.production-baseline-summary dd {
  min-width: 0;
  margin: var(--space-1) 0 0;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
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

  .production-baseline-summary {
    grid-template-columns: 1fr;
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

  .production-baseline-summary dl {
    grid-template-columns: 1fr;
  }

  .production-baseline-summary dl > div + div {
    border-left: 0;
    border-top: 1px solid var(--border-subtle);
  }

  .production-history-list div,
  .production-action-list div {
    grid-template-columns: 1fr;
    align-items: flex-start;
  }
}
</style>
