<script setup lang="ts">
import BridgeDownloadButton from "../BridgeDownloadButton.vue";
import OptionBar from "../OptionBar.vue";
import UploadFileListCard from "../UploadFileListCard.vue";
import { useKnowledgeViewContext } from "../../composables/knowledgeViewContext";
import { normalizedKnowledgeDocumentUrl, previewKnowledgeDocuments } from "../../lib/knowledge-documents";

const {
  busyKey,
  canSubmitKnowledgeIngest,
  canWriteJobs,
  documentPreviewResult,
  dynamicParsingPreviewConfig,
  formatBytes,
  ingestFiles,
  ingestJob,
  ingestProgress,
  jobStatusLabels,
  jobStatusTone,
  jsonPreview,
  knowledgeIngestTargetDisplaySummary,
  knowledgeIngestTargetOptions,
  knowledgeIngestTargetValidationMessage,
  knowledgeIngestTargetValues,
  normalizedManifest,
  onIngestFilesSelected,
  setKnowledgeIngestTargetValues,
  uploadFilesToKnowledge,
} = useKnowledgeViewContext();

async function previewKnowledgeDocumentParsing() {
  documentPreviewResult.value = await previewKnowledgeDocuments(ingestFiles.value, {
    pipelineId: dynamicParsingPreviewConfig.pipelineId,
    expectedOutputs: ["preprocessResult", "chunks", "structureArtifacts", "granularityFragments"],
    contextBudget: dynamicParsingPreviewConfig.contextBudget,
    payloadBudget: dynamicParsingPreviewConfig.payloadBudget,
    granularity: dynamicParsingPreviewConfig.granularity,
    dynamicParsing: dynamicParsingPreviewConfig.dynamicParsing,
  });
}
</script>

<template>
  <article id="knowledge-file-import" class="surface-card ingest-upload-card">
    <div class="section-header">
      <div>
        <h3>知识入库</h3>
      </div>
    </div>
    <div class="knowledge-ingest-target-select-panel">
      <OptionBar
        label="入库目标"
        placeholder="请选择入库目标"
        :model-value="knowledgeIngestTargetValues"
        :options="knowledgeIngestTargetOptions"
        multiple
        collapse-tags
        clearable
        @update:model-value="setKnowledgeIngestTargetValues"
      />
      <span>{{ knowledgeIngestTargetDisplaySummary }}</span>
    </div>
    <p v-if="knowledgeIngestTargetValidationMessage" class="module-note warning-note">
      {{ knowledgeIngestTargetValidationMessage }}
    </p>
    <div class="knowledge-ingest-section-spacer" aria-hidden="true"></div>
    <UploadFileListCard
      :files="ingestFiles"
      :can-submit="canSubmitKnowledgeIngest"
      :can-write-jobs="canWriteJobs"
      :busy-key="busyKey"
      :ingest-job="ingestJob"
      :ingest-progress="ingestProgress"
      :job-status-labels="jobStatusLabels"
      :job-status-tone="jobStatusTone"
      :format-bytes="formatBytes"
      @select="onIngestFilesSelected"
      @upload="uploadFilesToKnowledge"
      @preview="previewKnowledgeDocumentParsing"
    />
    <section v-if="documentPreviewResult" class="knowledge-document-preview-panel">
      <header class="knowledge-document-preview-header">
        <strong>解析预览</strong>
        <span>JSON</span>
      </header>
      <pre class="module-json-preview">{{ jsonPreview(documentPreviewResult) }}</pre>
    </section>
    <div v-if="normalizedManifest" class="job-table compact-job-table normalized-table">
      <div class="job-table-header">
        <span>生成文档</span>
        <span>类型</span>
        <span>大小</span>
      </div>
      <div
        v-for="doc in [...normalizedManifest.documents, ...normalizedManifest.sourceMaterials]"
        :key="doc.documentId"
        class="job-row"
      >
        <BridgeDownloadButton
          :href="normalizedKnowledgeDocumentUrl(normalizedManifest.batchId, doc.documentId)"
          :label="doc.title"
          button-class="bridge-download-link"
        />
        <span>{{ doc.granularity }}</span>
        <span>{{ formatBytes(doc.byteSize) }}</span>
      </div>
    </div>
  </article>
</template>
