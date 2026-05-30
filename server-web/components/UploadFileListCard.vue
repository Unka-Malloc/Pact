<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import BridgeDownloadButton from "./BridgeDownloadButton.vue";
import BrowseSelectButton from "./BrowseSelectButton.vue";
import StatusPill from "./StatusPill.vue";
import type { SplitJob } from "../lib/types";

type FileWithRelativePath = File & {
  webkitRelativePath?: string;
};

type UploadFileEntry = {
  key: string;
  name: string;
  relativePath: string;
  directory: string;
  extension: string;
  size: number;
  detail?: string;
  href?: string;
  actionLabel?: string;
  downloadName?: string;
  statusLabel?: string;
  statusTone?: string;
};

export type FileListResultEntry = {
  key?: string;
  name: string;
  relativePath?: string;
  extension?: string;
  size?: number;
  detail?: string;
  href?: string;
  actionLabel?: string;
  downloadName?: string;
  statusLabel?: string;
  statusTone?: string;
};

type ProgressState = {
  completedSteps: number;
  detail: string;
  label: string;
  tone: string;
};

const props = withDefaults(defineProps<{
  files?: File[];
  mode?: "upload" | "download";
  title?: string;
  summary?: string;
  resultFiles?: FileListResultEntry[];
  canSubmit?: boolean;
  canWriteJobs?: boolean;
  busyKey?: string;
  ingestJob?: SplitJob | null;
  ingestProgress?: string;
  jobStatusLabels?: Record<string, string>;
  jobStatusTone?: (status: string) => string;
  formatBytes?: (bytes: number) => string;
}>(), {
  files: () => [],
  mode: "upload",
  title: "文件列表",
  summary: "",
  resultFiles: () => [],
  canSubmit: false,
  canWriteJobs: false,
  busyKey: "",
  ingestJob: null,
  ingestProgress: "",
  jobStatusLabels: () => ({}),
  jobStatusTone: () => "neutral",
  formatBytes: (bytes: number) => `${Math.max(0, Number(bytes) || 0)} B`,
});

const emit = defineEmits<{
  preview: [];
  select: [files: File[]];
  upload: [];
}>();

const fileIconUrl = "/icons/octicon-file-24.svg";
const folderIconUrl = "/icons/octicon-file-directory-fill-24.svg";
const uploadIconUrl = "/icons/octicon-upload-24.svg";
const chevronDownIconUrl = "/icons/octicon-chevron-down-16.svg";
const progressStepLabels = ["已选择", "上传", "解析", "入库", "完成"];
const totalProgressSteps = progressStepLabels.length;
const uploadMenuOpen = ref(false);
const uploadMenuRoot = ref<HTMLElement | null>(null);

const isBusy = computed(() => props.busyKey === "knowledge:ingest");
const isDownloadMode = computed(() => props.mode === "download");

const fileEntries = computed<UploadFileEntry[]>(() => {
  if (isDownloadMode.value) {
    return props.resultFiles.map((file, index) => {
      const relativePath = String(file.relativePath || file.name);
      const name = String(file.name || relativePath || "result");
      const extension = String(file.extension || (name.includes(".") ? name.split(".").pop() : "FILE") || "FILE").toUpperCase();
      return {
        key: String(file.key || `${relativePath}:${file.size || 0}:${index}`),
        name,
        relativePath,
        directory: "",
        extension,
        size: Number(file.size || 0),
        detail: file.detail,
        href: file.href,
        actionLabel: file.actionLabel,
        downloadName: file.downloadName,
        statusLabel: file.statusLabel,
        statusTone: file.statusTone,
      };
    });
  }
  return props.files.map((file, index) => {
    const relativePath = String((file as FileWithRelativePath).webkitRelativePath || file.name);
    const segments = relativePath.split(/[\\/]/g).filter(Boolean);
    const name = segments.at(-1) || file.name;
    const directory = segments.length > 1 ? segments.slice(0, -1).join("/") : "";
    const extension = name.includes(".") ? name.split(".").pop()?.toUpperCase() || "FILE" : "FILE";
    return {
      key: `${relativePath}:${file.size}:${file.lastModified}:${index}`,
      name,
      relativePath,
      directory,
      extension,
      size: file.size,
    };
  });
});

const selectedSummary = computed(() => {
  if (props.summary) {
    return props.summary;
  }
  if (isDownloadMode.value) {
    if (fileEntries.value.length === 0) {
      return "0 个文件";
    }
    const knownBytes = fileEntries.value.reduce((sum, file) => sum + Math.max(0, Number(file.size || 0)), 0);
    return knownBytes > 0
      ? `${fileEntries.value.length} 个文件 · ${props.formatBytes(knownBytes)}`
      : `${fileEntries.value.length} 个文件`;
  }
  if (props.files.length === 0) {
    return "0 个文件";
  }
  const totalBytes = props.files.reduce((sum, file) => sum + file.size, 0);
  return `${props.files.length} 个文件 · ${props.formatBytes(totalBytes)}`;
});

const progressState = computed<ProgressState>(() => {
  const job = props.ingestJob;
  if (props.files.length === 0) {
    return {
      completedSteps: 0,
      detail: "等待文件",
      label: "未选择",
      tone: "neutral",
    };
  }
  if (!job) {
    return {
      completedSteps: isBusy.value ? 2 : 1,
      detail: props.ingestProgress || (isBusy.value ? "正在准备上传" : "等待入库"),
      label: isBusy.value ? "上传中" : "待处理",
      tone: isBusy.value ? "running" : "neutral",
    };
  }
  if (job.status === "completed") {
    return {
      completedSteps: totalProgressSteps,
      detail: job.stage || "处理完成",
      label: props.jobStatusLabels[job.status] || "已完成",
      tone: props.jobStatusTone(job.status),
    };
  }
  if (job.status === "failed") {
    return {
      completedSteps: Math.max(2, Math.min(totalProgressSteps - 1, Math.ceil(Number(job.progressPercent || 0) / 25))),
      detail: job.error || job.stage || "处理失败",
      label: props.jobStatusLabels[job.status] || "失败",
      tone: props.jobStatusTone(job.status),
    };
  }
  const progressPercent = Math.max(0, Math.min(100, Number(job.progressPercent || 0)));
  return {
    completedSteps: Math.max(2, Math.min(totalProgressSteps - 1, Math.ceil(progressPercent / 25) + 1)),
    detail: job.stage || props.ingestProgress || "队列处理中",
    label: props.jobStatusLabels[job.status] || job.status,
    tone: props.jobStatusTone(job.status),
  };
});

const canStartUpload = computed(() =>
  !isDownloadMode.value &&
  props.canWriteJobs &&
  props.canSubmit &&
  props.files.length > 0 &&
  !isBusy.value,
);

const canChooseFiles = computed(() => props.canWriteJobs && !isBusy.value);

function closeUploadMenu() {
  uploadMenuOpen.value = false;
}

function toggleUploadMenu() {
  if (!canChooseFiles.value) {
    return;
  }
  uploadMenuOpen.value = !uploadMenuOpen.value;
}

function handleDirectorySelected(files: File[]) {
  closeUploadMenu();
  emit("select", files);
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!uploadMenuOpen.value) {
    return;
  }
  const target = event.target;
  if (!(target instanceof Node) || uploadMenuRoot.value?.contains(target)) {
    return;
  }
  closeUploadMenu();
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeUploadMenu();
  }
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeydown);
});
</script>

<template>
  <section class="upload-file-list-card" aria-label="文件列表" :data-mode="mode">
    <header class="upload-file-list-header">
      <div class="upload-file-list-title">
        <h4>{{ title }}</h4>
        <span>{{ selectedSummary }}</span>
      </div>
      <div v-if="!isDownloadMode" ref="uploadMenuRoot" class="upload-split-button" aria-label="上传文件">
        <BrowseSelectButton
          kind="local-files"
          button-class="upload-split-main"
          button-text="上传文件"
          :disabled="!canChooseFiles"
          :multiple="true"
          @select="emit('select', $event)"
        >
          <img :src="uploadIconUrl" alt="" aria-hidden="true" />
          <span>上传文件</span>
        </BrowseSelectButton>
        <button
          class="upload-split-arrow"
          type="button"
          :disabled="!canChooseFiles"
          aria-haspopup="menu"
          :aria-expanded="uploadMenuOpen"
          aria-label="展开上传选项"
          @click="toggleUploadMenu"
        >
          <img :src="chevronDownIconUrl" alt="" aria-hidden="true" />
        </button>
        <div v-if="uploadMenuOpen" class="upload-split-menu" role="menu">
          <BrowseSelectButton
            kind="local-directory"
            button-class="upload-split-menu-item"
            button-text="上传文件夹"
            :disabled="!canChooseFiles"
            @select="handleDirectorySelected"
          >
            <img :src="folderIconUrl" alt="" aria-hidden="true" />
            <span>上传文件夹</span>
          </BrowseSelectButton>
        </div>
      </div>
    </header>

    <div class="upload-file-list-body">
      <div v-if="fileEntries.length === 0" class="upload-file-list-empty">
        <img :src="folderIconUrl" alt="" aria-hidden="true" />
        <span>暂无文件</span>
      </div>
      <div
        v-for="entry in fileEntries"
        :key="entry.key"
        class="upload-file-row"
        :data-mode="isDownloadMode ? 'download' : 'upload'"
      >
        <div class="upload-file-identity">
          <img :src="fileIconUrl" alt="" aria-hidden="true" />
          <div class="upload-file-name-block">
            <span class="upload-file-name" :title="entry.relativePath">{{ entry.relativePath }}</span>
            <small>
              {{ entry.extension }}<template v-if="entry.size > 0"> · {{ formatBytes(entry.size) }}</template>
            </small>
          </div>
        </div>

        <div v-if="!isDownloadMode" class="upload-file-progress">
          <div class="upload-file-progress-meta">
            <span>{{ progressState.detail }}</span>
            <small>{{ progressStepLabels[Math.max(0, Math.min(totalProgressSteps - 1, progressState.completedSteps - 1))] }}</small>
          </div>
          <div
            class="upload-step-track"
            role="progressbar"
            :aria-valuemin="0"
            :aria-valuemax="totalProgressSteps"
            :aria-valuenow="progressState.completedSteps"
            :aria-label="`${entry.name} 处理进度`"
          >
            <span
              v-for="(step, index) in progressStepLabels"
              :key="step"
              class="upload-step-segment"
              :data-complete="index < progressState.completedSteps"
            />
          </div>
        </div>
        <div v-else class="upload-file-result-meta">
          <span>{{ entry.detail || "可下载文件" }}</span>
          <small v-if="entry.size > 0">{{ formatBytes(entry.size) }}</small>
        </div>

        <div v-if="!isDownloadMode" class="upload-file-status">
          <StatusPill :tone="progressState.tone" :label="progressState.label" />
        </div>
        <div v-else class="upload-file-download-actions">
          <BridgeDownloadButton
            v-if="entry.href"
            :href="entry.href"
            :download-name="entry.downloadName || entry.name"
            :label="entry.actionLabel || '下载'"
            button-class="tool-button"
          />
          <StatusPill
            v-else
            :tone="entry.statusTone || 'neutral'"
            :label="entry.statusLabel || '未生成'"
          />
        </div>
      </div>
    </div>

    <footer v-if="!isDownloadMode" class="upload-file-list-footer">
      <div class="upload-file-job-summary">
        <span v-if="ingestJob">任务 {{ ingestJob.id }}</span>
        <span v-else>{{ ingestProgress || "等待开始" }}</span>
      </div>
      <div class="upload-file-actions">
        <button
          class="tool-button tool-button-ghost"
          type="button"
          :disabled="!canWriteJobs || files.length === 0 || isBusy"
          @click="emit('preview')"
        >
          预览解析
        </button>
        <button
          class="primary-action"
          type="button"
          :disabled="!canStartUpload"
          @click="emit('upload')"
        >
          {{ isBusy ? "入库中" : "开始入库" }}
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.upload-file-list-card {
  display: grid;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
}

.upload-file-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-width: 0;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-subtle);
}

.upload-file-list-title {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.upload-file-list-title h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--text-2xl);
  font-weight: 800;
}

.upload-file-list-title span,
.upload-file-job-summary,
.upload-file-progress-meta small {
  min-width: 0;
  color: var(--text-muted);
  font-size: var(--text-sm);
  font-weight: 700;
}

.upload-split-button {
  --upload-split-control-height: 40px;
  --upload-split-control-bg: var(--success);
  --upload-split-control-bg-hover: #15803d;
  --upload-split-control-color: #ffffff;
  --upload-split-control-icon-size: 18px;
  --upload-split-control-font-size: var(--text-lg);
  --upload-split-control-font-weight: 800;
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  min-width: 0;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
}

.upload-split-button :deep(.browse-select-button) {
  display: inline-flex;
}

.upload-split-button :deep(.upload-split-main.el-button),
.upload-split-arrow {
  height: var(--upload-split-control-height);
  margin-left: 0;
  padding: 0 16px;
  border-color: var(--upload-split-control-bg);
  background: var(--upload-split-control-bg);
  color: var(--upload-split-control-color);
  font-size: var(--upload-split-control-font-size);
  font-weight: var(--upload-split-control-font-weight);
  line-height: 1;
}

.upload-split-button :deep(.upload-split-main.el-button:hover),
.upload-split-button :deep(.upload-split-main.el-button:focus-visible),
.upload-split-arrow:hover,
.upload-split-arrow:focus-visible {
  border-color: var(--upload-split-control-bg-hover);
  background: var(--upload-split-control-bg-hover);
  color: var(--upload-split-control-color);
  outline: none;
}

.upload-split-button :deep(.upload-split-main.el-button.is-disabled),
.upload-split-button :deep(.upload-split-main.el-button.is-disabled:hover),
.upload-split-arrow:disabled,
.upload-split-arrow:disabled:hover {
  border-color: var(--border-strong);
  background: var(--bg-inset);
  color: var(--text-muted);
  cursor: not-allowed;
}

.upload-split-button :deep(.upload-split-main.el-button) {
  gap: var(--space-2);
  min-width: 132px;
  border-radius: var(--radius-md) 0 0 var(--radius-md);
}

.upload-split-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  padding: 0;
  border-width: 1px;
  border-style: solid;
  border-left-color: rgba(255, 255, 255, 0.3);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
}

.upload-split-button :deep(.upload-split-main.el-button img),
.upload-split-arrow > img,
.upload-split-menu :deep(.upload-split-menu-item.el-button img) {
  width: var(--upload-split-control-icon-size);
  height: var(--upload-split-control-icon-size);
  flex: 0 0 auto;
  filter: brightness(0) invert(1);
}

.upload-split-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: var(--z-dropdown);
  width: 100%;
  min-width: 100%;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  box-shadow: none;
  overflow: visible;
}

.upload-split-menu :deep(.browse-select-button) {
  display: flex;
  width: 100%;
}

.upload-split-menu :deep(.upload-split-menu-item.el-button) {
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  height: var(--upload-split-control-height);
  margin-left: 0;
  padding: 0 16px;
  border: 1px solid var(--upload-split-control-bg);
  border-radius: var(--radius-md);
  background: var(--upload-split-control-bg);
  color: var(--upload-split-control-color);
  font-size: var(--upload-split-control-font-size);
  font-weight: var(--upload-split-control-font-weight);
  line-height: 1;
  box-shadow: var(--shadow-xs);
}

.upload-split-menu :deep(.upload-split-menu-item.el-button:hover),
.upload-split-menu :deep(.upload-split-menu-item.el-button:focus-visible) {
  border-color: var(--upload-split-control-bg-hover);
  background: var(--upload-split-control-bg-hover);
  color: var(--upload-split-control-color);
  outline: none;
}

.upload-split-menu :deep(.upload-split-menu-item.el-button.is-disabled),
.upload-split-menu :deep(.upload-split-menu-item.el-button.is-disabled:hover) {
  border-color: var(--border-strong);
  background: var(--bg-inset);
  color: var(--text-muted);
  cursor: not-allowed;
}

.upload-file-list-body {
  display: grid;
  min-width: 0;
  max-height: 430px;
  overflow: auto;
}

.upload-file-list-empty {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 72px;
  padding: 18px 16px;
  color: var(--text-muted);
  font-weight: 700;
}

.upload-file-list-empty img {
  width: 24px;
  height: 24px;
  opacity: 0.64;
  filter: invert(52%) sepia(10%) saturate(472%) hue-rotate(176deg) brightness(91%) contrast(89%);
}

.upload-file-row {
  display: grid;
  grid-template-columns: minmax(260px, 1.05fr) minmax(260px, 0.9fr) minmax(116px, auto);
  gap: var(--space-4);
  align-items: center;
  min-width: 0;
  padding: 14px 16px;
  border-top: 1px solid var(--border-subtle);
}

.upload-file-row:first-child {
  border-top: 0;
}

.upload-file-row[data-mode="download"] {
  grid-template-columns: minmax(260px, 1.15fr) minmax(180px, 0.75fr) minmax(116px, auto);
}

.upload-file-identity {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.upload-file-identity > img {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  opacity: 0.82;
  filter: invert(52%) sepia(10%) saturate(472%) hue-rotate(176deg) brightness(91%) contrast(89%);
}

.upload-file-name-block {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.upload-file-name {
  min-width: 0;
  color: var(--text-primary);
  font-size: var(--text-2xl);
  font-weight: 800;
  line-height: var(--leading-snug);
  overflow-wrap: anywhere;
}

.upload-file-name-block small {
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 700;
}

.upload-file-progress {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

.upload-file-progress-meta {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  min-width: 0;
}

.upload-file-result-meta {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.upload-file-progress-meta span,
.upload-file-result-meta span {
  min-width: 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-file-result-meta small {
  min-width: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 700;
}

.upload-step-track {
  display: grid;
  grid-template-columns: repeat(5, minmax(24px, 1fr));
  gap: var(--space-2);
  min-width: 0;
}

.upload-step-segment {
  display: block;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--border-strong);
}

.upload-step-segment[data-complete="true"] {
  background: var(--success);
}

.upload-file-status {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}

.upload-file-download-actions {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}

.upload-file-download-actions .tool-button {
  min-height: 36px;
  text-decoration: none;
}

.upload-file-list-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-width: 0;
  padding: 12px 16px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-subtle);
}

.upload-file-job-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-file-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 880px) {
  .upload-file-list-header,
  .upload-file-list-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .upload-split-button,
  .upload-file-actions {
    width: 100%;
  }

  .upload-split-button :deep(.browse-select-button:first-child) {
    flex: 1 1 auto;
  }

  .upload-split-button :deep(.upload-split-main.el-button) {
    width: 100%;
  }

  .upload-file-actions > button {
    flex: 1 1 120px;
  }

  .upload-file-row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }

  .upload-file-status {
    justify-content: flex-start;
  }
}
</style>
