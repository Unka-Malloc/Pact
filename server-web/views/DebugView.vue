<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useConsole } from '../composables/useConsole';
import type { DebugTab } from '../composables/useConsole';
import AgentModelOptionBar from '../components/AgentModelOptionBar.vue';
import BinaryCheckbox from '../components/BinaryCheckbox.vue';
import BrowseSelectButton from '../components/BrowseSelectButton.vue';
import ConfigFoldCard from '../components/ConfigFoldCard.vue';
import HistorySessionPanel from '../components/HistorySessionPanel.vue';
import InfoFeedResultRow from '../components/InfoFeedResultRow.vue';
import OptionBar from '../components/OptionBar.vue';
import UploadFileListCard, { type FileListResultEntry } from '../components/UploadFileListCard.vue';
import { bridge } from '../lib/bridge';
import { createKnowledgeUploadSession } from '../lib/knowledge-upload-session';
import type { SplitJob } from '../lib/types';
const {
  agentExploreActiveTabId,
  agentExploreAgentOptions,
  agentExploreAnswerHtml,
  agentExploreDocumentMarkdown,
  agentExploreEventLabel,
  agentExploreEventStatus,
  agentExploreEventTime,
  agentExploreForm,
  agentExploreHistory,
  agentExploreHistoryPanelItems,
  agentExploreLinkedEvidenceRefs,
  agentExploreProgress,
  agentExploreProgressVisible,
  agentExploreResult,
  agentExploreResultKey,
  agentExploreSplitDragging,
  agentExploreSplitLeftPercent,
  agentExploreSplitRef,
  agentExploreSplitStyle,
  agentExploreStepOpen,
  agentExploreStepSummary,
  agentExploreSteps,
  agentExploreTabBusy,
  agentExploreTabMeta,
  agentExploreTabTitle,
  agentExploreTabs,
  agentExploreTraceOpen,
  agentExploreWorkspaceId,
  busyKey,
  closeAgentExploreTab,
  contextWindowOptionBarOptions,
  copyAgentExploreDocument,
  currentView,
  debugTab,
  deleteAgentExploreHistoryItem,
  error,
  exportAgentExploreDocument,
  handleAgentAnswerClick,
  handleAgentExploreSplitKeydown,
  handleAgentExploreTraceToggle,
  highlightedConfigTarget,
  infoFeedModelOptions,
  isAgentExploreDraftSession,
  isAuthenticated,
  jsonPreview,
  knowledgeConsole,
  knowledgeFusionSummary,
  knowledgeRecallDebugForm,
  knowledgeRecallDebugGridStyle,
  knowledgeRecallDebugModeOptionBarOptions,
  knowledgeRecallDebugRuns,
  knowledgeRecallDebugTargetOptions,
  knowledgeSourceState,
  knowledgeStatus,
  openAgentEvidencePreview,
  resetKnowledgeAgentExplore,
  runKnowledgeAgentExplore,
  runKnowledgeRecallDebugBatch,
  selectAgentExploreHistoryItem,
  selectedAgentExploreModel,
  shortId,
  startAgentExploreSplitResize,
  switchAgentExploreTab,
  thinkingModeOptionBarOptions,
  visibleDebugTabs,
} = useConsole();

const route = useRoute();
const activeDebugTab = computed<DebugTab>(() => {
  const tab = String(route.params.tab ?? "");
  return tab === "knowledgeRecall" || tab === "agentRetrieval" || tab === "knowledgeDistillation"
    ? tab
    : debugTab.value;
});

type DistillationStep = "idle" | "uploading" | "parsing" | "distilling" | "completed" | "failed";
type DistillationRun = Record<string, unknown> & {
  runId?: string;
  status?: string;
  progressPercent?: number;
  error?: string;
  stages?: Array<Record<string, unknown>>;
};

const distillationFile = ref<File | null>(null);
const distillationStep = ref<DistillationStep>("idle");
const distillationUploadPercent = ref(0);
const distillationJob = ref<SplitJob | null>(null);
const distillationRun = ref<DistillationRun | null>(null);
const distillationError = ref("");
const distillationStatusMessage = ref("等待文件");
const distillationModelAlias = ref("");
let distillationSequence = 0;

const defaultDistillationPrompt = [
  "对上传文件做核心知识提炼。",
  "优先保留关键事实、时间线、实体、决策依据、结论边界和不确定项。",
  "不要做小模型训练，不要扩写原文没有的信息。"
].join("\n");

const distillationBusy = computed(() =>
  distillationStep.value === "uploading" ||
  distillationStep.value === "parsing" ||
  distillationStep.value === "distilling"
);

const distillationFileLabel = computed(() => {
  if (!distillationFile.value) return "未选择文件";
  return `${distillationFile.value.name} · ${formatFileSize(distillationFile.value.size)}`;
});

const distillationRunId = computed(() => String(distillationRun.value?.runId || ""));
const distillationCoreStage = computed(() =>
  (distillationRun.value?.stages || []).find((stage) => String(stage.stageId || "") === "knowledge-distillation") || null
);
const distillationCoreOutput = computed<Record<string, unknown>>(() => {
  const output = distillationCoreStage.value?.output;
  return output && typeof output === "object" && !Array.isArray(output)
    ? output as Record<string, unknown>
    : {};
});
const distillationResultMarkdown = computed(() => String(distillationCoreOutput.value.markdown || ""));
const distillationResultMarkdownLength = computed(() => {
  return Number(distillationCoreOutput.value.markdownLength || distillationResultMarkdown.value.length || 0);
});
const distillationDownloadUrl = computed(() => {
  if (
    !distillationRunId.value ||
    distillationCoreStage.value?.status !== "completed" ||
    distillationResultMarkdownLength.value <= 0
  ) return "";
  return bridge.knowledgeDistillationWorkbenchExportUrl(distillationRunId.value, "knowledge-distillation", "markdown");
});
const distillationPackageUrl = computed(() =>
  distillationRunId.value &&
    distillationRun.value?.status === "completed" &&
    distillationResultMarkdownLength.value > 0
    ? bridge.knowledgeDistillationWorkbenchPackageUrl(distillationRunId.value)
    : ""
);
const distillationResultBaseName = computed(() => {
  const sourceName = distillationFile.value?.name || String(distillationRun.value?.title || "知识蒸馏结果");
  return safeDownloadFileName(stripFileExtension(sourceName) || "知识蒸馏结果");
});
const distillationResultFiles = computed<FileListResultEntry[]>(() => {
  if (!distillationDownloadUrl.value) {
    return [];
  }
  const runId = distillationRunId.value;
  const baseName = distillationResultBaseName.value;
  const outputJson = distillationCoreOutput.value.json;
  const jsonText = outputJson && typeof outputJson === "object"
    ? JSON.stringify(outputJson, null, 2)
    : "";
  return [
    {
      key: "markdown",
      name: `${baseName}.md`,
      extension: "MD",
      size: encodedByteLength(distillationResultMarkdown.value),
      detail: "核心提炼文档",
      href: bridge.knowledgeDistillationWorkbenchExportUrl(runId, "knowledge-distillation", "markdown"),
      actionLabel: "下载",
      downloadName: `${baseName}.md`,
    },
    {
      key: "docx",
      name: `${baseName}.docx`,
      extension: "DOCX",
      detail: "Word 文档",
      href: bridge.knowledgeDistillationWorkbenchExportUrl(runId, "knowledge-distillation", "docx"),
      actionLabel: "下载",
      downloadName: `${baseName}.docx`,
    },
    {
      key: "json",
      name: `${baseName}.json`,
      extension: "JSON",
      size: encodedByteLength(jsonText),
      detail: "结构化结果",
      href: bridge.knowledgeDistillationWorkbenchExportUrl(runId, "knowledge-distillation", "json"),
      actionLabel: "下载",
      downloadName: `${baseName}.json`,
    },
    {
      key: "package",
      name: `${baseName}-workspace-package.zip`,
      extension: "ZIP",
      detail: "蒸馏整包",
      href: distillationPackageUrl.value,
      actionLabel: "下载",
      downloadName: `${baseName}-workspace-package.zip`,
    },
  ].filter((file) => file.href);
});
const distillationProgressSegments = computed(() => {
  const step = distillationStep.value;
  const jobStatus = String(distillationJob.value?.status || "");
  const runStatus = String(distillationRun.value?.status || "");
  const coreStatus = String(distillationCoreStage.value?.status || "");
  const uploadCompleted =
    distillationUploadPercent.value >= 100 ||
    step === "parsing" ||
    step === "distilling" ||
    step === "completed" ||
    (step === "failed" && distillationUploadPercent.value >= 100);
  const parseCompleted =
    jobStatus === "completed" ||
    step === "distilling" ||
    step === "completed" ||
    (step === "failed" && jobStatus === "completed");
  const distillCompleted =
    step === "completed" &&
    runStatus === "completed" &&
    coreStatus === "completed" &&
    distillationResultMarkdownLength.value > 0;
  return [
    {
      key: "upload",
      label: "上传",
      state: uploadCompleted ? "complete" : step === "uploading" ? "active" : "pending",
    },
    {
      key: "parse",
      label: "解析",
      state: parseCompleted ? "complete" : step === "parsing" ? "active" : jobStatus === "failed" ? "failed" : "pending",
    },
    {
      key: "distill",
      label: "蒸馏",
      state: distillCompleted ? "complete" : step === "failed" ? "failed" : step === "distilling" ? "active" : "pending",
    },
  ];
});
const distillationProgressSummary = computed(() => {
  const completed = distillationProgressSegments.value.filter((segment) => segment.state === "complete").length;
  return `${completed}/${distillationProgressSegments.value.length}`;
});
const distillationModelOptions = computed(() => infoFeedModelOptions.value || []);
const selectedDistillationModel = computed(() =>
  distillationModelOptions.value.find((option) => debugModelOptionValue(option) === distillationModelAlias.value) || null,
);
const distillationModelReady = computed(() =>
  Boolean(selectedDistillationModel.value && debugModelOptionEnabled(selectedDistillationModel.value)),
);
const distillationModelLabel = computed(() => String(selectedDistillationModel.value?.label || "").trim());

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function encodedByteLength(value: string) {
  return new TextEncoder().encode(value || "").length;
}

function stripFileExtension(name: string) {
  return String(name || "").replace(/\.[^/.]+$/, "");
}

function safeDownloadFileName(name: string) {
  return String(name || "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim() || "知识蒸馏结果";
}

function asDistillationRun(value: Record<string, unknown> | null | undefined): DistillationRun {
  return (value && typeof value === "object" ? value : {}) as DistillationRun;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function debugModelOptionValue(option: { agentUid?: unknown; value?: unknown }) {
  return String(option.agentUid ?? option.value ?? "").trim();
}

function debugModelOptionEnabled(option: { disabled?: boolean; selectable?: boolean; enabled?: boolean }) {
  return option.disabled !== true && option.selectable !== false && option.enabled !== false;
}

function normalizeDistillationModelSelection() {
  const current = String(distillationModelAlias.value || "").trim();
  if (current && distillationModelOptions.value.some((option) => debugModelOptionValue(option) === current)) {
    return;
  }
  const fallback = distillationModelOptions.value.find(debugModelOptionEnabled) || distillationModelOptions.value[0];
  distillationModelAlias.value = fallback ? debugModelOptionValue(fallback) : "";
}

function assertCurrentDistillation(sequence: number) {
  if (sequence !== distillationSequence) {
    throw new Error("知识蒸馏任务已取消。");
  }
}

function handleDebugDistillationFileSelected(files: File[]) {
  distillationFile.value = files[0] || null;
  distillationStep.value = "idle";
  distillationUploadPercent.value = 0;
  distillationJob.value = null;
  distillationRun.value = null;
  distillationError.value = "";
  distillationStatusMessage.value = distillationFile.value ? "文件已选择" : "等待文件";
}

async function waitForDistillationJob(jobId: string, sequence: number) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    assertCurrentDistillation(sequence);
    const job = await bridge.getJob(jobId);
    if (!job) {
      throw new Error("找不到解析任务。");
    }
    distillationJob.value = job;
    distillationStatusMessage.value = `文件解析：${job.stage || job.status}`;
    if (job.status === "completed") return job;
    if (job.status === "failed") {
      throw new Error(job.error || "文件解析失败。");
    }
    await delay(1000);
  }
  throw new Error("文件解析超时。");
}

async function waitForDistillationRun(runId: string, sequence: number) {
  for (let attempt = 0; attempt < 360; attempt += 1) {
    assertCurrentDistillation(sequence);
    const run = asDistillationRun(await bridge.getKnowledgeDistillationWorkbenchRun(runId));
    distillationRun.value = run;
    distillationStatusMessage.value = `知识蒸馏：${String(run.status || "running")}`;
    const status = String(run.status || "");
    if (status === "completed") {
      const coreStage = (run.stages || []).find((stage) => String(stage.stageId || "") === "knowledge-distillation");
      const output = coreStage?.output;
      const markdownLength =
        output && typeof output === "object" && !Array.isArray(output)
          ? Number((output as { markdownLength?: unknown }).markdownLength || 0)
          : 0;
      if (coreStage?.status !== "completed" || markdownLength <= 0) {
        throw new Error("知识蒸馏已结束，但结果文档未生成。");
      }
      return run;
    }
    if (status === "failed" || status === "canceled") {
      throw new Error(run.error || "知识蒸馏失败。");
    }
    await delay(1500);
  }
  throw new Error("知识蒸馏超时。");
}

async function startDebugKnowledgeDistillation() {
  const file = distillationFile.value;
  if (!file) {
    distillationError.value = "请先选择文件。";
    return;
  }
  if (!distillationModelReady.value) {
    distillationError.value =
      String(selectedDistillationModel.value?.reason || selectedDistillationModel.value?.disabledReason || "").trim() ||
      "请选择一个可用模型。";
    return;
  }
  const sequence = ++distillationSequence;
  distillationStep.value = "uploading";
  distillationUploadPercent.value = 0;
  distillationJob.value = null;
  distillationRun.value = null;
  distillationError.value = "";
  distillationStatusMessage.value = "上传文件";
  try {
    const [{ session }, settings] = await Promise.all([
      createKnowledgeUploadSession([file], {
        checkpointPrefix: "knowledge-distillation-debug",
        checkpointMode: "debug-panel",
        checkpointSource: "knowledge-distillation-debug",
        onProgress: (progress) => {
          distillationUploadPercent.value = progress.percent;
          distillationStatusMessage.value = progress.message;
        },
      }),
      bridge.getSettings(),
    ]);
    assertCurrentDistillation(sequence);
    distillationStep.value = "parsing";
    distillationStatusMessage.value = "创建解析任务";
    const job = await bridge.createJob({
      inputText: "",
      filePaths: [],
      uploadedFiles: [],
      uploadSessionId: session.sessionId,
      settings,
    });
    distillationJob.value = job;
    const completedJob = await waitForDistillationJob(job.id, sequence);
    distillationStep.value = "distilling";
    distillationStatusMessage.value = "创建知识蒸馏任务";
    const run = asDistillationRun(await bridge.createKnowledgeDistillationWorkbenchRun({
      title: `${file.name} 知识蒸馏`,
      jobId: completedJob.id,
      batchId: completedJob.id,
      query: "上传文件核心知识提炼",
      prompt: defaultDistillationPrompt,
      modelAlias: distillationModelAlias.value,
      tokenBudget: 24000,
      payloadBudget: 120000,
      rawCorpusBatchMaxCharacters: 64000,
      mergeStrategy: "timeline_then_topic",
      maxRounds: 3,
      priority: "normal",
      modelEnabled: true,
    }));
    distillationRun.value = run;
    if (!run.runId) {
      throw new Error("知识蒸馏任务没有返回 runId。");
    }
    const completedRun = await waitForDistillationRun(run.runId, sequence);
    distillationRun.value = completedRun;
    distillationStep.value = "completed";
    distillationStatusMessage.value = "知识蒸馏完成，可下载结果";
  } catch (nextError) {
    if (sequence !== distillationSequence) return;
    distillationStep.value = "failed";
    distillationError.value = nextError instanceof Error ? nextError.message : "知识蒸馏失败。";
    distillationStatusMessage.value = "任务失败";
  }
}

watch(distillationModelOptions, normalizeDistillationModelSelection, { immediate: true });

onBeforeUnmount(() => {
  distillationSequence += 1;
});
</script>

<template>
          <section class="debug-panel-shell">
            <article v-if="activeDebugTab === 'knowledgeRecall'" class="surface-card debug-panel-card knowledge-recall-debug-card">
              <div class="section-header">
                <div>
                  <h3>知识召回</h3>
                  <p>只调试底层知识召回，不调用大模型。适合检查融合策略、学习开关和证据可读性。</p>
                </div>
                <div class="section-tags">
                  <span>{{ knowledgeConsole?.available ? "KnowledgeCore 可用" : "KnowledgeCore 未启用" }}</span>
                  <span>{{ knowledgeStatus }}</span>
                  <span>目录 {{ knowledgeSourceState?.summary.totalCount || 0 }}</span>
                </div>
              </div>

              <form class="debug-parameter-panel" @submit.prevent="runKnowledgeRecallDebugBatch">
                <label class="full-row">
                  <span>召回问题</span>
                  <input
                    v-model="knowledgeRecallDebugForm.query"
                    type="search"
                    placeholder="例如：HSBC 账单"
                  />
                </label>
                <OptionBar
                  v-model="knowledgeRecallDebugForm.targetId"
                  label="知识库"
                  :options="knowledgeRecallDebugTargetOptions"
                />
                <OptionBar
                  v-model="knowledgeRecallDebugForm.retrievalMode"
                  label="召回模式"
                  :options="knowledgeRecallDebugModeOptionBarOptions"
                />
                <BinaryCheckbox
                  v-model="knowledgeRecallDebugForm.keywordOnly"
                  label="仅关键词"
                />
                <BinaryCheckbox
                  v-model="knowledgeRecallDebugForm.learningEnabled"
                  label="启用学习"
                />
                <BinaryCheckbox
                  v-model="knowledgeRecallDebugForm.explain"
                  label="返回解释"
                />
                <button
                  class="primary-action"
                  type="submit"
                  :disabled="busyKey === 'debug:knowledge-recall' || !knowledgeRecallDebugForm.query.trim()"
                >
                  {{ busyKey === "debug:knowledge-recall" ? "召回中" : "执行召回" }}
                </button>
              </form>

              <div
                v-if="knowledgeRecallDebugRuns.length"
                class="debug-compare-grid"
                :style="knowledgeRecallDebugGridStyle"
              >
                <section
                  v-for="run in knowledgeRecallDebugRuns"
                  :key="run.runId"
                  class="debug-compare-column"
                  :data-status="run.status"
                >
                  <header class="debug-compare-header">
                    <div>
                      <h4>{{ run.label }}</h4>
                      <span>{{ run.status }} · {{ run.elapsedMs }} ms · {{ run.items.length }} 条</span>
                      <small v-if="knowledgeFusionSummary(run.response)">{{ knowledgeFusionSummary(run.response) }}</small>
                    </div>
                  </header>
                  <div class="info-feed-results-list debug-result-list">
                    <InfoFeedResultRow
                      v-for="item in run.items"
                      :key="String(item.evidenceId || item.itemId || item.documentId || item.title)"
                      :item="item"
                      tier="debug"
                      @open="openAgentEvidencePreview"
                    />
                    <div v-if="run.status === 'running'" class="empty-note">正在召回。</div>
                    <div v-else-if="run.status === 'failed'" class="empty-note">{{ run.error }}</div>
                    <div v-else-if="run.status === 'completed' && run.items.length === 0" class="empty-note">没有召回结果。</div>
                  </div>
                  <ConfigFoldCard v-if="run.response" title="原始响应">
                    <pre>{{ jsonPreview(run.response || {}) }}</pre>
                  </ConfigFoldCard>
                </section>
              </div>
	            </article>

	            <article v-if="activeDebugTab === 'knowledgeDistillation'" class="surface-card debug-panel-card knowledge-distillation-debug-card">
	              <div class="section-header">
	                <div>
	                  <h3>知识蒸馏</h3>
	                  <p>上传文件后生成核心提炼文档，结果可下载为 Markdown 或整包。</p>
	                </div>
	                <div class="section-tags">
	                  <span>{{ distillationStep === "completed" ? "已完成" : distillationStep === "failed" ? "失败" : "调试模式" }}</span>
	                  <span v-if="distillationModelLabel">{{ distillationModelLabel }}</span>
	                  <span v-if="distillationRunId">Run {{ shortId(distillationRunId) }}</span>
	                </div>
	              </div>

	              <form class="debug-parameter-panel distillation-debug-form" @submit.prevent="startDebugKnowledgeDistillation">
	                <div class="full-row distillation-upload-field">
	                  <span>上传文件</span>
	                  <small>{{ distillationFileLabel }}</small>
	                </div>
	                <AgentModelOptionBar
	                  v-model="distillationModelAlias"
	                  class="full-row distillation-model-field"
	                  label="模型"
	                  placeholder="选择模型"
	                  :options="distillationModelOptions"
	                  empty-library-label="当前模型库为空，请前往配置模型。"
	                />
	                <div class="full-row distillation-debug-actions">
	                  <BrowseSelectButton
	                    kind="local-files"
	                    button-type="primary"
	                    button-text="选择文件"
	                    button-class="distillation-file-picker-button"
	                    :multiple="false"
	                    plain
	                    @select="handleDebugDistillationFileSelected"
	                  />
	                  <button
	                    class="primary-action distillation-start-action"
	                    type="submit"
	                    :disabled="distillationBusy || !distillationFile || !distillationModelReady"
	                  >
	                    {{ distillationBusy ? "蒸馏中" : "开始蒸馏" }}
	                  </button>
	                </div>
	              </form>

	              <div class="distillation-debug-progress" :data-state="distillationStep">
	                <div class="distillation-progress-header">
	                  <span>{{ distillationStatusMessage }}</span>
	                  <strong>{{ distillationProgressSummary }}</strong>
	                </div>
	                <div class="distillation-progress-segments" role="list" aria-label="知识蒸馏阶段进度">
	                  <span
	                    v-for="segment in distillationProgressSegments"
	                    :key="segment.key"
	                    role="listitem"
	                    :data-state="segment.state"
	                    :title="segment.label"
	                    :aria-label="`${segment.label}：${segment.state}`"
	                  ></span>
	                </div>
	              </div>

	              <div class="distillation-debug-status-grid">
	                <section>
	                  <span>上传</span>
	                  <strong>{{ distillationUploadPercent > 0 ? `${distillationUploadPercent}%` : "等待" }}</strong>
	                </section>
	                <section>
	                  <span>解析</span>
	                  <strong>{{ distillationJob?.status || "等待" }}</strong>
	                  <small v-if="distillationJob?.stage">{{ distillationJob.stage }}</small>
	                </section>
	                <section>
	                  <span>蒸馏</span>
	                  <strong>{{ distillationRun?.status || "等待" }}</strong>
	                  <small v-if="distillationCoreStage?.status">
	                    核心阶段 {{ distillationCoreStage.status }}
	                    <template v-if="distillationResultMarkdownLength"> · 结果 {{ distillationResultMarkdownLength }} 字</template>
	                  </small>
	                </section>
	              </div>

	              <UploadFileListCard
	                v-if="distillationResultFiles.length"
	                class="distillation-result-file-list"
	                mode="download"
	                title="蒸馏结果"
	                :result-files="distillationResultFiles"
	                :format-bytes="formatFileSize"
	              />

	              <div v-if="distillationError" class="debug-error-note">
	                {{ distillationError }}
	              </div>
		            </article>
		            <article v-if="activeDebugTab === 'agentRetrieval'" class="surface-card agent-explore-card agent-explore-home debug-panel-card">
            <div class="section-header">
              <div>
                <h3>智能检索</h3>
                <p>调试智能体如何规划工具调用、压缩上下文、打开证据并生成最终回答。</p>
              </div>
              <div class="section-actions">
                <button class="tool-button" type="button" @click="resetKnowledgeAgentExplore">
                  新会话
                </button>
              </div>
            </div>
            <div v-if="agentExploreTabs.length" class="agent-explore-tab-strip" role="tablist" aria-label="智能检索会话">
              <div
                v-for="session in agentExploreTabs"
                :key="session.runId"
                class="agent-explore-tab"
                role="tab"
                tabindex="0"
                :aria-selected="session.runId === agentExploreActiveTabId"
                :data-active="session.runId === agentExploreActiveTabId"
                :data-draft="isAgentExploreDraftSession(session)"
                :data-disabled="agentExploreTabBusy(session)"
                @click="agentExploreTabBusy(session) ? undefined : switchAgentExploreTab(session)"
                @keydown.enter.prevent="agentExploreTabBusy(session) ? undefined : switchAgentExploreTab(session)"
                @keydown.space.prevent="agentExploreTabBusy(session) ? undefined : switchAgentExploreTab(session)"
              >
                <div class="agent-explore-tab-main">
                  <strong>{{ agentExploreTabTitle(session) }}</strong>
                  <span>{{ agentExploreTabMeta(session) }}</span>
                </div>
                <button
                  class="agent-explore-tab-close"
                  type="button"
                  title="关闭标签"
                  :aria-label="`关闭标签 ${agentExploreTabTitle(session)}`"
                  :disabled="agentExploreTabBusy(session)"
                  @click.stop="closeAgentExploreTab(session)"
                >
                  ×
                </button>
              </div>
            </div>
            <form class="agent-explore-form" @submit.prevent="runKnowledgeAgentExplore">
              <label class="full-row">
                <span>问题</span>
                <input
                  v-model="agentExploreForm.query"
                  type="search"
                  placeholder="例如：帮我找最近的账单，并说明哪些证据真正相关"
                />
              </label>
              <AgentModelOptionBar
                class="wide-field"
                data-config-target="agent-explore-agent"
                :data-config-highlighted="highlightedConfigTarget === 'agent-explore-agent'"
                v-model="agentExploreForm.modelAlias"
                label="智能体"
                placeholder="未分配智能体"
                :options="agentExploreAgentOptions"
              />
              <div class="agent-debug-parameter-grid full-row">
                <OptionBar
                  v-model="agentExploreForm.contextProfileId"
                  label="上下文窗口"
                  :options="contextWindowOptionBarOptions"
                />
                <OptionBar
                  v-model="agentExploreForm.thinkingMode"
                  label="Thinking"
                  :options="thinkingModeOptionBarOptions"
                />
                <label>
                  <span>循环轮数</span>
                  <input v-model.number="agentExploreForm.maxIterations" type="number" min="1" max="8" />
                </label>
                <label>
                  <span>每次召回</span>
                  <input v-model.number="agentExploreForm.limit" type="number" min="1" max="20" />
                </label>
                <label>
                  <span>temperature</span>
                  <input v-model.number="agentExploreForm.temperature" type="number" min="0" max="2" step="0.1" />
                </label>
                <label>
                  <span>max_tokens</span>
                  <input v-model.number="agentExploreForm.maxTokens" type="number" min="128" step="128" />
                </label>
                <label>
                  <span>tool_choice</span>
                  <input v-model="agentExploreForm.toolChoice" autocomplete="off" />
                </label>
              </div>
              <button
                class="primary-action full-row"
                type="submit"
                :disabled="busyKey === 'knowledge:agent-explore' || !agentExploreForm.query.trim() || !selectedAgentExploreModel.enabled"
              >
                {{ busyKey === "knowledge:agent-explore" ? "检索中" : "开始检索" }}
              </button>
            </form>

            <div
              v-if="agentExploreProgressVisible"
              class="agent-explore-progress"
            >
              <div class="agent-explore-progress-header">
                <span>检索进度</span>
                <strong>{{ agentExploreProgress.label }}</strong>
              </div>
              <div class="agent-explore-progress-track">
                <span :style="{ width: `${agentExploreProgress.percent}%` }"></span>
              </div>
            </div>

            <HistorySessionPanel
              title="历史会话"
              :subtitle="`${agentExploreHistory.length} 条，滚动查看`"
              :items="agentExploreHistoryPanelItems"
              @select="selectAgentExploreHistoryItem"
              @delete="deleteAgentExploreHistoryItem"
            />

            <div
              v-if="agentExploreResult || busyKey === 'knowledge:agent-explore'"
              class="agent-explore-workspace"
              :class="{ 'is-resizing': agentExploreSplitDragging }"
              :style="agentExploreSplitStyle"
              ref="agentExploreSplitRef"
            >
              <details
                class="agent-explore-trace-card"
                :open="agentExploreTraceOpen"
                @toggle="handleAgentExploreTraceToggle"
              >
                <summary>
                  <span>工具轨迹</span>
                  <small>
                    {{ agentExploreSteps.length }} 轮<span v-if="agentExploreWorkspaceId"> · Workspace {{ shortId(agentExploreWorkspaceId) }}</span>
                  </small>
                </summary>
                <div class="agent-explore-trace-list">
                  <div v-if="busyKey === 'knowledge:agent-explore'" class="empty-note">模型正在选择本地工具。</div>
                  <details
                    v-for="step in agentExploreSteps"
                    :key="`agent-explore-step-${step.iteration}`"
                    class="agent-explore-step"
                    :open="agentExploreStepOpen(step)"
                  >
                    <summary class="agent-explore-step-header">
                      <strong>第 {{ step.iteration }} 轮</strong>
                      <span>{{ agentExploreStepSummary(step) }}</span>
                    </summary>
                    <div
                      v-if="step.events?.length || step.toolCalls?.length || step.toolResults?.length || step.contextBudget"
                      class="agent-explore-step-body"
                    >
                      <div v-if="step.events?.length" class="agent-state-timeline">
                        <div
                          v-for="(eventItem, eventIndex) in step.events"
                          :key="`agent-explore-event-${step.iteration}-${eventIndex}`"
                          class="agent-state-event"
                          :data-state="agentExploreEventStatus(eventItem)"
                        >
                          <span>{{ agentExploreEventLabel(eventItem) }}</span>
                          <small>{{ agentExploreEventTime(eventItem) }}</small>
                        </div>
                      </div>
                      <details
                        v-for="call in step.toolCalls || []"
                        :key="call.id"
                        class="agent-function-call"
                        :data-state="call.status || 'selected'"
                      >
                        <summary>
                          <strong>{{ call.name }}</strong>
                          <span>{{ call.status || "selected" }}</span>
                        </summary>
                        <pre>{{ jsonPreview(call.arguments || {}) }}</pre>
                      </details>
                      <details
                        v-for="(toolResult, toolResultIndex) in step.toolResults || []"
                        :key="agentExploreResultKey(step, toolResult, toolResultIndex)"
                        class="agent-tool-result"
                        :data-state="toolResult.status || 'completed'"
                      >
                        <summary>
                          <strong>{{ toolResult.tool }}</strong>
                          <span>{{ toolResult.status || "completed" }}</span>
                        </summary>
                        <pre v-if="toolResult.result">{{ jsonPreview(toolResult.result || {}) }}</pre>
                        <div v-else class="empty-note">工具调用中，等待返回。</div>
                      </details>
                      <small v-if="step.contextBudget">
                        上下文 {{ step.contextBudget.totalTokens || 0 }} /
                        {{ step.contextBudget.contextWindowTokens || 0 }}
                      </small>
                    </div>
                  </details>
                </div>
              </details>
              <div
                class="agent-explore-split-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="调整工具轨迹和检索结果宽度"
                tabindex="0"
                :aria-valuenow="Math.round(agentExploreSplitLeftPercent)"
                aria-valuemin="28"
                aria-valuemax="68"
                @pointerdown="startAgentExploreSplitResize"
                @keydown="handleAgentExploreSplitKeydown"
              >
                <span></span>
              </div>
              <section class="agent-explore-answer">
                <div class="compact-section-header">
                  <h3>检索结果</h3>
                  <div class="agent-result-actions">
                    <span v-if="agentExploreResult?.degraded">降级</span>
                    <button
                      class="tool-button tool-button-ghost compact-action"
                      type="button"
                      :disabled="!agentExploreDocumentMarkdown"
                      @click="copyAgentExploreDocument"
                    >
                      复制文档
                    </button>
                    <button
                      class="tool-button compact-action"
                      type="button"
                      :disabled="!agentExploreDocumentMarkdown"
                      @click="exportAgentExploreDocument"
                    >
                      导出 Markdown
                    </button>
                  </div>
                </div>
                <div
                  v-if="agentExploreResult?.answer"
                  class="evidence-rendered-content"
                  @click="handleAgentAnswerClick"
                  v-html="agentExploreAnswerHtml"
                ></div>
                <div v-else class="knowledge-preview-empty">
                  <strong>等待结果</strong>
                  <span>模型会调用本地工具检索，再决定是否打开证据。</span>
                </div>
                <ConfigFoldCard v-if="agentExploreLinkedEvidenceRefs.length" title="引用证据">
                  <div class="agent-evidence-ref-list">
                    <button
                      v-for="refId in agentExploreLinkedEvidenceRefs"
                      :key="refId"
                      class="evidence-ref-button"
                      type="button"
                      :disabled="busyKey === `knowledge:evidence:${refId}`"
                      @click="openAgentEvidencePreview(refId)"
                    >
                      {{ refId }}
                    </button>
                  </div>
                </ConfigFoldCard>
                <ConfigFoldCard v-if="agentExploreResult?.contextPack" title="上下文包">
                  <pre>{{ jsonPreview(agentExploreResult.contextPack || {}) }}</pre>
                </ConfigFoldCard>
                <ConfigFoldCard v-if="agentExploreResult" title="运行结构">
                  <pre>{{ jsonPreview(agentExploreResult || {}) }}</pre>
                </ConfigFoldCard>
              </section>
            </div>
          </article>
          </section>
</template>
