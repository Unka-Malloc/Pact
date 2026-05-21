<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { AgentModelOptionBar, StatusPill } from "./common";
import { bridge } from "../lib/bridge";
import type { AgentModelConfig, AgentSettings, ModelProbeResponse, NormalizedDocumentsManifest, SplitJob } from "../lib/types";

type WorkbenchStage = {
  stageId: string;
  title: string;
  actionLabel: string;
  description: string;
  status: string;
  tone?: string;
  progressPercent?: number;
  preview?: string;
  exportFormats?: string[];
  metrics?: Record<string, unknown>;
  versions?: Array<{
    versionId?: string;
    archivedAt?: string;
    status?: string;
    markdownLength?: number;
    jsonAvailable?: boolean;
  }>;
  checkpoint?: {
    durable?: boolean;
    resumable?: boolean;
    continuationToken?: string;
  };
  error?: string;
};

type WorkbenchRun = {
  runId: string;
  title: string;
  status: string;
  progressPercent?: number;
  jobId?: string;
  batchId?: string;
  createdAt?: string;
  updatedAt?: string;
  waitingFor?: Record<string, unknown> | null;
  error?: string;
  priority?: string;
  modelAlias?: string;
  modelEnabled?: boolean;
  prompt?: string;
  tokenBudget?: number;
  payloadBudget?: number;
  rawCorpusBatchMaxCharacters?: number;
  mergeStrategy?: string;
  maxRounds?: number;
  taskManagement?: Record<string, unknown>;
  stages: WorkbenchStage[];
  storage?: {
    durable?: boolean;
    rootRelativePath?: string;
    checkpointFile?: string;
  };
};

type AgentModelOption = {
  agentUid?: string;
  value?: string | number | boolean;
  label?: string;
  selectable?: boolean;
  enabled?: boolean;
  disabled?: boolean;
  reason?: string;
  disabledReason?: string;
  provider?: string;
  model?: string;
};

const props = defineProps<{
  canReadKnowledge: boolean;
  canMaintainKnowledge: boolean;
  ingestJob: SplitJob | null;
  normalizedManifest: NormalizedDocumentsManifest | null;
  formatCompactDate: (value: string) => string;
  modelOptions?: AgentModelOption[];
}>();

const runs = ref<WorkbenchRun[]>([]);
const selectedRunId = ref("");
const selectedRun = ref<WorkbenchRun | null>(null);
const busy = ref("");
const error = ref("");
const createOptions = ref({
  modelAlias: "",
  prompt: "项目全部文档通用知识蒸馏，保留目录、时间线、因果顺序、图表和证据引用。",
  tokenBudget: 24000,
  payloadBudget: 120000,
  rawCorpusBatchMaxCharacters: 64000,
  mergeStrategy: "timeline_then_topic",
  maxRounds: 3,
  priority: "normal",
});
const compareRightRunId = ref("");
const compareResult = ref<Record<string, unknown> | null>(null);
const modelProbeState = ref<"unknown" | "checking" | "online" | "offline" | "unconfigured">("unknown");
const modelProbeMessage = ref("");
const modelProbeCheckedAt = ref("");
let pollTimer: ReturnType<typeof setInterval> | null = null;
let modelProbeTimer: ReturnType<typeof setTimeout> | null = null;
let modelProbeSequence = 0;

const activeJobCompleted = computed(() => props.ingestJob?.status === "completed");
const activeRunStages = computed(() => selectedRun.value?.stages || []);
const activeRunProgress = computed(() => {
  const stages = activeRunStages.value;
  if (!stages.length) return 0;
  const completed = stages.filter((stage) => stage.status === "completed").length;
  const running = stages.find((stage) => stage.status === "running");
  return Math.round(((completed + (running ? Number(running.progressPercent || 0) / 100 : 0)) / stages.length) * 100);
});
const needsPolling = computed(() =>
  ["queued", "running", "waiting"].includes(String(selectedRun.value?.status || "")),
);
const modelProbeLabel = computed(() => {
  if (modelProbeState.value === "checking") return "检测中";
  if (modelProbeState.value === "online") return "模型在线";
  if (modelProbeState.value === "offline") return "模型离线";
  if (modelProbeState.value === "unconfigured") return "模型未配置";
  return "未检测";
});
const modelProbeTone = computed(() => {
  if (modelProbeState.value === "online") return "success";
  if (modelProbeState.value === "offline" || modelProbeState.value === "unconfigured") return "danger";
  if (modelProbeState.value === "checking") return "info";
  return "neutral";
});
const modelProbeTooltip = computed(() =>
  [
    modelProbeMessage.value,
    modelProbeCheckedAt.value ? `检测时间：${props.formatCompactDate(modelProbeCheckedAt.value)}` : ""
  ].filter(Boolean).join(" · ") || "模型状态尚未检测"
);
const distillationModelOptions = computed(() => props.modelOptions || []);
const distillationModelOptionValues = computed(() =>
  new Set(distillationModelOptions.value.map((option) => String(option.agentUid ?? option.value ?? "").trim()).filter(Boolean)),
);
const selectedModelOption = computed(() => {
  const selected = String(createOptions.value.modelAlias || "").trim();
  return distillationModelOptions.value.find((option) => optionValue(option) === selected) || null;
});
const selectedModelReady = computed(() => Boolean(selectedModelOption.value && optionSelectable(selectedModelOption.value)));
const canStart = computed(() => props.canMaintainKnowledge && activeJobCompleted.value && selectedModelReady.value && !busy.value);

function asRun(value: unknown): WorkbenchRun {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    runId: String(record.runId || ""),
    title: String(record.title || "知识蒸馏工作台"),
    status: String(record.status || "unknown"),
    progressPercent: Number(record.progressPercent || 0),
    jobId: String(record.jobId || ""),
    batchId: String(record.batchId || ""),
    createdAt: String(record.createdAt || ""),
    updatedAt: String(record.updatedAt || ""),
    waitingFor: record.waitingFor && typeof record.waitingFor === "object" ? record.waitingFor as Record<string, unknown> : null,
    error: String(record.error || ""),
    priority: String(record.priority || "normal"),
    modelAlias: String(record.modelAlias || ""),
    modelEnabled: record.modelEnabled === true,
    prompt: String(record.prompt || ""),
    tokenBudget: Number(record.tokenBudget || 0),
    payloadBudget: Number(record.payloadBudget || 0),
    rawCorpusBatchMaxCharacters: Number(record.rawCorpusBatchMaxCharacters || 0),
    mergeStrategy: String(record.mergeStrategy || ""),
    maxRounds: Number(record.maxRounds || 0),
    taskManagement: record.taskManagement && typeof record.taskManagement === "object" ? record.taskManagement as Record<string, unknown> : undefined,
    stages: Array.isArray(record.stages) ? record.stages.map((stage) => stage as WorkbenchStage) : [],
    storage: record.storage && typeof record.storage === "object" ? record.storage as WorkbenchRun["storage"] : undefined,
  };
}

function statusLabel(status = "") {
  const labels: Record<string, string> = {
    queued: "排队中",
    running: "运行中",
    waiting: "等待",
    completed: "已完成",
    failed: "失败",
    canceled: "已取消",
    archived: "已归档",
    pending: "未开始",
  };
  return labels[status] || status || "未知";
}

function modelEntryKey(entry: AgentModelConfig) {
  return String(entry.uid || entry.instanceId || entry.alias || "").trim();
}

function optionValue(option: AgentModelOption) {
  return String(option.agentUid ?? option.value ?? "").trim();
}

function optionSelectable(option: AgentModelOption) {
  return option.disabled !== true && option.selectable !== false && option.enabled !== false;
}

function firstSelectableModelAlias() {
  return optionValue(distillationModelOptions.value.find(optionSelectable) || distillationModelOptions.value[0] || {});
}

function normalizeDistillationModelAlias() {
  const current = String(createOptions.value.modelAlias || "").trim();
  if (current && distillationModelOptionValues.value.has(current)) {
    return;
  }
  const fallback = firstSelectableModelAlias();
  if (fallback && fallback !== current) {
    createOptions.value.modelAlias = fallback;
  } else if (!fallback && current) {
    createOptions.value.modelAlias = "";
  }
}

function findModelEntry(settings: AgentSettings, alias = "") {
  const normalizedAlias = String(alias || "").trim();
  const models = Array.isArray(settings.modelLibraryAgents) ? settings.modelLibraryAgents : [];
  return models.find((entry) => {
    const identifiers = [
      modelEntryKey(entry),
      entry.alias,
      entry.instanceId,
      entry.uid,
      entry.model,
      entry.engine,
    ].map((value) => String(value || "").trim());
    return identifiers.includes(normalizedAlias);
  }) || null;
}

function providerForModel(settings: AgentSettings, alias = "", entry: AgentModelConfig | null = null) {
  if (entry?.provider) {
    return String(entry.provider);
  }
  const normalizedAlias = String(alias || "").trim().toLowerCase();
  if (normalizedAlias.startsWith("deepseek")) {
    return "deepseek";
  }
  return String(settings.defaultModelProvider || "deepseek");
}

function probeSettingsForModel(settings: AgentSettings, alias = "", entry: AgentModelConfig | null = null) {
  const provider = providerForModel(settings, alias, entry);
  const nextSettings = {
    ...settings,
    modelLibraryAgents: Array.isArray(settings.modelLibraryAgents) ? settings.modelLibraryAgents : [],
  };
  if (provider === "deepseek") {
    nextSettings.deepSeekModel = String(entry?.model || entry?.engine || alias || settings.deepSeekModel || "").trim();
  }
  if (provider === "custom-http" && entry) {
    nextSettings.customHttpAdapter = {
      ...(settings.customHttpAdapter || {}),
      ...entry,
      alias: modelEntryKey(entry) || entry.alias || alias,
      engine: String(entry.engine || entry.model || "").trim(),
    };
  }
  return nextSettings;
}

function applyModelProbeResult(result: ModelProbeResponse) {
  modelProbeCheckedAt.value = result.checkedAt || "";
  modelProbeMessage.value = result.message || "";
  if (result.ok) {
    modelProbeState.value = "online";
  } else if (result.configured === false) {
    modelProbeState.value = "unconfigured";
  } else {
    modelProbeState.value = "offline";
  }
}

async function refreshModelProbeStatus() {
  const sequence = ++modelProbeSequence;
  modelProbeState.value = "checking";
  modelProbeMessage.value = "";
  try {
    const settings = await bridge.getSettings();
    const alias = String(createOptions.value.modelAlias || "").trim();
    if (!alias) {
      if (sequence === modelProbeSequence) {
        modelProbeState.value = "unconfigured";
        modelProbeCheckedAt.value = new Date().toISOString();
        modelProbeMessage.value = "当前模型库为空，请先配置模型/智能体。";
      }
      return;
    }
    const entry = findModelEntry(settings, alias);
    const provider = providerForModel(settings, alias, entry);
    const result = await bridge.probeModel({
      provider,
      modelAlias: entry ? modelEntryKey(entry) : alias,
      settings: probeSettingsForModel(settings, alias, entry),
    });
    if (sequence === modelProbeSequence) {
      applyModelProbeResult(result);
    }
  } catch (nextError) {
    if (sequence === modelProbeSequence) {
      modelProbeState.value = "offline";
      modelProbeCheckedAt.value = new Date().toISOString();
      modelProbeMessage.value = nextError instanceof Error ? nextError.message : "模型状态检测失败。";
    }
  }
}

function scheduleModelProbeStatus() {
  if (modelProbeTimer) {
    clearTimeout(modelProbeTimer);
  }
  modelProbeTimer = setTimeout(() => {
    refreshModelProbeStatus().catch(() => undefined);
  }, 700);
}

function statusTone(status = "") {
  if (status === "completed") return "success";
  if (status === "running" || status === "queued") return "warning";
  if (status === "failed" || status === "canceled") return "danger";
  return "muted";
}

function exportUrl(stage: WorkbenchStage, format: string) {
  if (!selectedRun.value?.runId || stage.status !== "completed") return "#";
  return bridge.knowledgeDistillationWorkbenchExportUrl(selectedRun.value.runId, stage.stageId, format);
}

async function refreshRuns() {
  if (!props.canReadKnowledge) return;
  const result = await bridge.listKnowledgeDistillationWorkbenchRuns(50);
  const items = Array.isArray((result as { items?: unknown[] }).items)
    ? (result as { items: unknown[] }).items.map(asRun)
    : [];
  runs.value = items;
  if (!selectedRunId.value && items.length > 0) {
    selectedRunId.value = items[0].runId;
  }
  if (selectedRunId.value) {
    const found = items.find((run) => run.runId === selectedRunId.value);
    if (found) selectedRun.value = found;
  }
}

async function refreshSelectedRun() {
  if (!selectedRunId.value || !props.canReadKnowledge) return;
  try {
    selectedRun.value = asRun(await bridge.getKnowledgeDistillationWorkbenchRun(selectedRunId.value));
    const index = runs.value.findIndex((run) => run.runId === selectedRun.value?.runId);
    if (index >= 0 && selectedRun.value) {
      runs.value[index] = selectedRun.value;
    }
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "读取知识蒸馏任务失败。";
  }
}

async function startWorkbenchRun() {
  if (!props.ingestJob?.id) {
    error.value = "请先在页面顶部导入项目目录并完成解析。";
    return;
  }
  if (props.ingestJob.status !== "completed") {
    error.value = "解析任务尚未完成，不能开始知识蒸馏。";
    return;
  }
  busy.value = "create";
  error.value = "";
  try {
    const run = asRun(await bridge.createKnowledgeDistillationWorkbenchRun({
      title: `${props.ingestJob.id} 项目知识蒸馏`,
      jobId: props.ingestJob.id,
      batchId: props.normalizedManifest?.batchId || props.ingestJob.id,
      query: "项目全部文档通用知识蒸馏",
      ...createOptions.value,
      modelEnabled: true,
    }));
    selectedRunId.value = run.runId;
    selectedRun.value = run;
    await refreshRuns();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "创建知识蒸馏工作台任务失败。";
  } finally {
    busy.value = "";
  }
}

async function cancelRun() {
  if (!selectedRun.value?.runId) return;
  if (!window.confirm("确认取消当前知识蒸馏任务？")) return;
  busy.value = "cancel";
  error.value = "";
  try {
    selectedRun.value = asRun(await bridge.cancelKnowledgeDistillationWorkbenchRun(selectedRun.value.runId, "用户在工作台取消任务"));
    await refreshRuns();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "取消知识蒸馏工作台任务失败。";
  } finally {
    busy.value = "";
  }
}

async function archiveRun() {
  if (!selectedRun.value?.runId) return;
  if (!window.confirm("确认归档当前知识蒸馏任务？归档后默认不在任务列表展示。")) return;
  busy.value = "archive";
  error.value = "";
  try {
    selectedRun.value = asRun(await bridge.archiveKnowledgeDistillationWorkbenchRun(selectedRun.value.runId));
    await refreshRuns();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "归档知识蒸馏工作台任务失败。";
  } finally {
    busy.value = "";
  }
}

async function deleteRun() {
  if (!selectedRun.value?.runId) return;
  if (!window.confirm("确认删除当前知识蒸馏任务及其工作台记录？")) return;
  busy.value = "delete";
  error.value = "";
  const deletedId = selectedRun.value.runId;
  try {
    await bridge.deleteKnowledgeDistillationWorkbenchRun(deletedId);
    if (selectedRunId.value === deletedId) {
      selectedRunId.value = "";
      selectedRun.value = null;
    }
    await refreshRuns();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "删除知识蒸馏工作台任务失败。";
  } finally {
    busy.value = "";
  }
}

async function rerunStage(stage: WorkbenchStage) {
  if (!selectedRun.value?.runId || !stage.stageId) return;
  if (!window.confirm(`确认从“${stage.title}”开始重跑？当前及后续阶段会保留历史版本后重新生成。`)) return;
  busy.value = `rerun:${stage.stageId}`;
  error.value = "";
  try {
    selectedRun.value = asRun(await bridge.rerunKnowledgeDistillationWorkbenchStage(selectedRun.value.runId, stage.stageId));
    await refreshRuns();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "重跑知识蒸馏阶段失败。";
  } finally {
    busy.value = "";
  }
}

async function compareRuns() {
  if (!selectedRun.value?.runId || !compareRightRunId.value) return;
  busy.value = "compare";
  error.value = "";
  compareResult.value = null;
  try {
    compareResult.value = await bridge.compareKnowledgeDistillationWorkbenchRuns(
      selectedRun.value.runId,
      compareRightRunId.value,
    );
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "比较知识蒸馏版本失败。";
  } finally {
    busy.value = "";
  }
}

function packageUrl() {
  if (!selectedRun.value?.runId) return "#";
  return bridge.knowledgeDistillationWorkbenchPackageUrl(selectedRun.value.runId);
}

async function resumeRun() {
  if (!selectedRun.value?.runId) return;
  busy.value = "resume";
  error.value = "";
  try {
    selectedRun.value = asRun(await bridge.resumeKnowledgeDistillationWorkbenchRun(selectedRun.value.runId));
    await refreshRuns();
  } catch (nextError) {
    error.value = nextError instanceof Error ? nextError.message : "恢复知识蒸馏工作台任务失败。";
  } finally {
    busy.value = "";
  }
}

function selectRun(runId: string) {
  selectedRunId.value = runId;
  const found = runs.value.find((run) => run.runId === runId);
  selectedRun.value = found || null;
  compareResult.value = null;
  refreshSelectedRun();
}

watch(needsPolling, (enabled) => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (enabled) {
    pollTimer = setInterval(() => {
      refreshSelectedRun();
    }, 1800);
  }
}, { immediate: true });

watch(() => createOptions.value.modelAlias, () => {
  scheduleModelProbeStatus();
});

watch(distillationModelOptions, () => {
  normalizeDistillationModelAlias();
}, { immediate: true });

onMounted(() => {
  refreshRuns().catch((nextError) => {
    error.value = nextError instanceof Error ? nextError.message : "加载知识蒸馏工作台失败。";
  });
  refreshModelProbeStatus().catch(() => undefined);
});

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (modelProbeTimer) {
    clearTimeout(modelProbeTimer);
    modelProbeTimer = null;
  }
});
</script>

<template>
  <section class="knowledge-distillation-workbench">
    <article class="surface-card distillation-command-card">
      <div class="section-header">
        <div>
          <h3>知识蒸馏</h3>
          <p>把项目目录的所有文档按阶段转化、导出、索引，再生成一个自包含的大文档。</p>
        </div>
        <div class="source-actions">
          <button
            class="tool-button tool-button-ghost"
            type="button"
            :disabled="busy === 'refresh'"
            @click="refreshRuns"
          >
            刷新任务
          </button>
          <button
            class="primary-action"
            type="button"
            :disabled="!canStart"
            @click="startWorkbenchRun"
          >
            {{ busy === "create" ? "创建中" : "开始蒸馏" }}
          </button>
        </div>
      </div>

      <p v-if="!activeJobCompleted" class="module-note">
        请先在页面顶部选择项目文件夹并点击“开始解析”。解析完成后，这里会把该解析任务作为蒸馏输入。
      </p>
      <p v-if="error" class="module-note danger">{{ error }}</p>

      <div class="distillation-config-grid">
        <div class="config-field readonly-field">
          <span>模型状态</span>
          <StatusPill
            :label="modelProbeLabel"
            :tone="modelProbeTone"
            :aria-label="modelProbeTooltip"
            :title="modelProbeTooltip"
          />
        </div>
        <AgentModelOptionBar
          v-model="createOptions.modelAlias"
          class="distillation-model-select"
          label="模型"
          placeholder="选择已配置模型"
          :options="distillationModelOptions"
        />
        <label class="config-field">
          <span>优先级</span>
          <select v-model="createOptions.priority">
            <option value="high">高</option>
            <option value="normal">普通</option>
            <option value="low">低</option>
          </select>
        </label>
        <label class="config-field">
          <span>知识上下文预算</span>
          <input v-model.number="createOptions.tokenBudget" type="number" min="1024" step="1024" />
        </label>
        <label class="config-field">
          <span>回包预算</span>
          <input v-model.number="createOptions.payloadBudget" type="number" min="4096" step="4096" />
        </label>
        <label class="config-field">
          <span>原文批次字符</span>
          <input v-model.number="createOptions.rawCorpusBatchMaxCharacters" type="number" min="4096" step="4096" />
        </label>
        <label class="config-field">
          <span>合并策略</span>
          <select v-model="createOptions.mergeStrategy">
            <option value="timeline_then_topic">先时间线后主题</option>
            <option value="topic_then_timeline">先主题后时间线</option>
            <option value="source_order">按源文件顺序</option>
          </select>
        </label>
        <label class="config-field">
          <span>多轮上限</span>
          <input v-model.number="createOptions.maxRounds" type="number" min="1" max="20" />
        </label>
        <label class="config-field prompt-field">
          <span>蒸馏 Prompt</span>
          <textarea v-model="createOptions.prompt" rows="3" />
        </label>
      </div>

      <div class="distillation-run-selector" v-if="runs.length">
        <button
          v-for="run in runs"
          :key="run.runId"
          class="distillation-run-chip"
          :class="{ active: selectedRunId === run.runId }"
          type="button"
          @click="selectRun(run.runId)"
        >
          <span>{{ run.title }}</span>
          <StatusPill :tone="statusTone(run.status)" :label="statusLabel(run.status)" />
        </button>
      </div>
    </article>

    <article v-if="selectedRun" class="surface-card distillation-run-overview">
      <div class="section-header">
        <div>
          <h3>{{ selectedRun.title }}</h3>
          <p>
            {{ selectedRun.runId }} · Job {{ selectedRun.jobId || "n/a" }}
            <span v-if="selectedRun.updatedAt"> · {{ formatCompactDate(selectedRun.updatedAt) }}</span>
          </p>
        </div>
        <div class="source-actions">
          <StatusPill :tone="statusTone(selectedRun.status)" :label="statusLabel(selectedRun.status)" />
          <button
            class="tool-button tool-button-ghost"
            type="button"
            :disabled="busy === 'resume' || selectedRun.status === 'completed'"
            @click="resumeRun"
          >
            {{ busy === "resume" ? "恢复中" : "继续任务" }}
          </button>
          <button
            class="tool-button tool-button-ghost"
            type="button"
            :disabled="busy === 'cancel' || !['queued', 'running', 'waiting'].includes(selectedRun.status)"
            @click="cancelRun"
          >
            {{ busy === "cancel" ? "取消中" : "取消" }}
          </button>
          <button
            class="tool-button tool-button-ghost"
            type="button"
            :disabled="busy === 'archive'"
            @click="archiveRun"
          >
            {{ busy === "archive" ? "归档中" : "归档" }}
          </button>
          <button
            class="tool-button tool-button-ghost danger-action"
            type="button"
            :disabled="busy === 'delete'"
            @click="deleteRun"
          >
            {{ busy === "delete" ? "删除中" : "删除" }}
          </button>
          <a
            class="tool-button tool-button-ghost"
            :href="packageUrl()"
            target="_blank"
            rel="noreferrer"
          >
            下载工作台产物包
          </a>
        </div>
      </div>
      <div class="ingest-queue-progress">
        <progress :value="activeRunProgress" max="100" />
        <small>{{ activeRunProgress }}%</small>
      </div>
      <dl class="module-status-list">
        <div>
          <dt>持久化</dt>
          <dd>{{ selectedRun.storage?.rootRelativePath || "knowledge-distillation-workbench" }}</dd>
        </div>
        <div>
          <dt>断点</dt>
          <dd>{{ selectedRun.storage?.checkpointFile || "run.json" }}</dd>
        </div>
        <div>
          <dt>等待</dt>
          <dd>{{ selectedRun.waitingFor ? JSON.stringify(selectedRun.waitingFor) : "无" }}</dd>
        </div>
        <div>
          <dt>模型</dt>
          <dd>{{ selectedRun.modelAlias || "未记录模型" }} · {{ selectedRun.priority || "normal" }}</dd>
        </div>
        <div>
          <dt>队列</dt>
          <dd>{{ selectedRun.taskManagement?.queue || "queue-monitor" }} · {{ selectedRun.taskManagement?.worker || "workbench" }}</dd>
        </div>
      </dl>
      <div v-if="runs.length > 1" class="distillation-compare-row">
        <select v-model="compareRightRunId">
          <option value="">选择另一个版本比较</option>
          <option
            v-for="run in runs.filter((item) => item.runId !== selectedRun?.runId)"
            :key="run.runId"
            :value="run.runId"
          >
            {{ run.title }} · {{ formatCompactDate(run.updatedAt || "") }}
          </option>
        </select>
        <button
          class="tool-button"
          type="button"
          :disabled="!compareRightRunId || busy === 'compare'"
          @click="compareRuns"
        >
          {{ busy === "compare" ? "比较中" : "比较版本" }}
        </button>
      </div>
      <pre v-if="compareResult" class="distillation-compare-preview">{{ JSON.stringify(compareResult.summary || compareResult, null, 2) }}</pre>
      <p v-if="selectedRun.error" class="module-note danger">{{ selectedRun.error }}</p>
    </article>

    <div v-if="selectedRun" class="distillation-stage-feed">
      <article
        v-for="(stage, index) in activeRunStages"
        :key="stage.stageId"
        class="surface-card distillation-stage-card"
        :class="{ completed: stage.status === 'completed', running: stage.status === 'running' }"
      >
        <div class="distillation-stage-index">{{ index + 1 }}</div>
        <div class="distillation-stage-main">
          <div class="section-header">
            <div>
              <h3>{{ stage.title }}</h3>
              <p>{{ stage.description }}</p>
            </div>
            <StatusPill :tone="stage.tone || statusTone(stage.status)" :label="statusLabel(stage.status)" />
          </div>

          <div class="ingest-queue-progress">
            <progress :value="Number(stage.progressPercent || 0)" max="100" />
            <small>{{ Number(stage.progressPercent || 0) }}%</small>
          </div>

          <section class="distillation-preview-card">
            <div class="compact-section-header">
              <div>
                <h4>结果预览</h4>
                <span>{{ stage.actionLabel }}</span>
              </div>
              <div class="distillation-export-actions">
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  :disabled="!canMaintainKnowledge || busy === `rerun:${stage.stageId}` || selectedRun.status === 'running'"
                  @click="rerunStage(stage)"
                >
                  {{ busy === `rerun:${stage.stageId}` ? "重跑中" : "重跑本阶段" }}
                </button>
                <a
                  v-for="format in (stage.exportFormats || ['markdown', 'docx', 'html', 'json'])"
                  :key="`${stage.stageId}:${format}`"
                  class="tool-button tool-button-ghost"
                  :class="{ disabled: stage.status !== 'completed' }"
                  :href="exportUrl(stage, format)"
                  target="_blank"
                  rel="noreferrer"
                >
                  导出 {{ format.toUpperCase() }}
                </a>
              </div>
            </div>
            <pre>{{ stage.preview || (stage.status === "completed" ? "该阶段已完成，暂无预览文本。" : "等待阶段完成后展示结果预览。") }}</pre>
          </section>

          <dl class="module-status-list distillation-stage-meta">
            <div>
              <dt>任务管理</dt>
              <dd>后台运行，离开页面后可从任务列表恢复查看。</dd>
            </div>
            <div>
              <dt>断点续传</dt>
              <dd>{{ stage.checkpoint?.durable ? "已持久化" : "未启用" }} · {{ stage.checkpoint?.resumable ? "可恢复" : "不可恢复" }}</dd>
            </div>
            <div>
              <dt>指标</dt>
              <dd>{{ stage.metrics ? JSON.stringify(stage.metrics) : "{}" }}</dd>
            </div>
            <div>
              <dt>历史版本</dt>
              <dd>{{ stage.versions?.length || 0 }} 个</dd>
            </div>
          </dl>
          <div v-if="stage.versions?.length" class="stage-version-strip">
            <span
              v-for="version in stage.versions"
              :key="version.versionId"
            >
              {{ version.versionId }} · {{ version.status }} · {{ version.markdownLength || 0 }} 字
            </span>
          </div>
          <p v-if="stage.error" class="module-note danger">{{ stage.error }}</p>
        </div>
      </article>
    </div>

    <article v-else class="surface-card distillation-empty-card">
      <h3>暂无知识蒸馏任务</h3>
      <p>完成项目解析后点击“开始蒸馏”，这里会按阶段展示每一步的说明、结果预览、导出和断点状态。</p>
    </article>
  </section>
</template>

<style scoped>
.knowledge-distillation-workbench,
.distillation-stage-feed {
  display: grid;
  gap: 16px;
}

.distillation-command-card,
.distillation-run-overview,
.distillation-stage-card,
.distillation-empty-card {
  border-radius: 8px;
}

.distillation-run-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.distillation-config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.config-field {
  display: grid;
  gap: 5px;
  font-size: 12px;
  color: var(--text-muted, #64748b);
}

.config-field input,
.config-field select,
.config-field textarea,
.distillation-compare-row select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border-subtle, rgba(148, 163, 184, 0.34));
  border-radius: 8px;
  padding: 8px 10px;
  color-scheme: dark;
  background: color-mix(in srgb, var(--bg-subtle, #1c2128) 88%, #000 12%);
  color: var(--text-primary, #e6edf3);
  caret-color: var(--brand, #58a6ff);
}

.config-field input::placeholder,
.config-field textarea::placeholder {
  color: var(--text-muted, #6e7681);
}

.config-field select option,
.distillation-compare-row select option {
  background: var(--bg-subtle, #1c2128);
  color: var(--text-primary, #e6edf3);
}

.config-field input:hover,
.config-field select:hover,
.config-field textarea:hover,
.distillation-compare-row select:hover {
  border-color: var(--border-strong, rgba(148, 163, 184, 0.48));
}

.config-field input:focus,
.config-field select:focus,
.config-field textarea:focus,
.distillation-compare-row select:focus {
  border-color: var(--brand, #58a6ff);
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.18);
  outline: none;
}

.config-field.prompt-field {
  grid-column: 1 / -1;
}

.readonly-field {
  align-self: end;
  min-height: 66px;
}

.distillation-run-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 6px 10px;
  border: 1px solid var(--border-subtle, rgba(148, 163, 184, 0.3));
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.distillation-run-chip.active {
  border-color: var(--accent, #4f46e5);
  background: rgba(79, 70, 229, 0.08);
}

.distillation-stage-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 14px;
}

.distillation-stage-index {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.08);
  font-weight: 700;
}

.distillation-stage-card.completed .distillation-stage-index {
  background: rgba(34, 197, 94, 0.14);
}

.distillation-stage-card.running .distillation-stage-index {
  background: rgba(245, 158, 11, 0.16);
}

.distillation-stage-main {
  min-width: 0;
}

.distillation-preview-card {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--border-subtle, rgba(148, 163, 184, 0.24));
  border-radius: 8px;
}

.distillation-preview-card pre {
  max-height: 280px;
  overflow: auto;
  margin: 10px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.distillation-export-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.distillation-export-actions .disabled {
  opacity: 0.45;
  pointer-events: none;
}

.distillation-stage-meta {
  margin-top: 12px;
}

.distillation-compare-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-top: 12px;
}

.distillation-compare-preview,
.stage-version-strip {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid var(--border-subtle, rgba(148, 163, 184, 0.24));
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.03);
  white-space: pre-wrap;
}

.stage-version-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
}

.stage-version-strip span {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
}

.danger-action {
  color: #b91c1c;
}

.module-note.danger {
  color: #b91c1c;
}

@media (max-width: 720px) {
  .distillation-compare-row {
    grid-template-columns: 1fr;
  }
}
</style>
