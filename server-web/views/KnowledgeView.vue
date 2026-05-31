<script setup lang="ts">
import AgentModelOptionBar from '../components/AgentModelOptionBar.vue';
import BridgeDownloadButton from '../components/BridgeDownloadButton.vue';
import ConfigFoldCard from '../components/ConfigFoldCard.vue';
import FeatureToggle from '../components/FeatureToggle.vue';
import KnowledgeWordCloudPanel from '../components/knowledge/KnowledgeWordCloudPanel.vue';
import KnowledgeDistillationWorkbench from '../components/KnowledgeDistillationWorkbench.vue';
import OptionBar from '../components/OptionBar.vue';
import SegmentedToggle from '../components/SegmentedToggle.vue';
import StatusPill from '../components/StatusPill.vue';
import SplitToggleCard from '../components/SplitToggleCard.vue';
import UploadFileListCard from '../components/UploadFileListCard.vue';
import { provideKnowledgeView } from '../composables/knowledgeViewContext';
import { useKnowledgeViewConsole } from '../composables/useKnowledgeViewConsole';
import { normalizedKnowledgeDocumentUrl, previewKnowledgeDocuments } from '../lib/knowledge-documents';

const knowledgeView = useKnowledgeViewConsole();
provideKnowledgeView(knowledgeView);
const dynamicParsingViewContract = {
  pipelineId: "dynamic-parameter-v1",
  ingestPipelineId: "unified-knowledge-ingest-v1",
  contextBudget: { knowledgeTokens: 12000 },
  payloadBudget: { maxResponseBytes: 1048576 },
  granularity: {
    secondaryParse: { enabled: false },
  },
  dynamicParsing: {
    preserveStructureArtifacts: true,
  },
  structureArtifacts: true,
  granularityFragments: true,
  parentArtifactId: "",
};
const dynamicParsingViewContractSignature = JSON.stringify(dynamicParsingViewContract);
const knowledgeViewBranchContract = [
  'knowledgeManagementPanel.value === "knowledge"',
  'knowledgeManagementPanel.value === "rules"',
];

const {
  addChildWordCloud,
  addManualWordCloud,
  autoFillCloudWithAgent,
  fillingWordBagIds,
  addTermActionToCloud,
  addTermInputToCloud,
  addVocabularyEntry,
  busyKey,
  canAdminKnowledge,
  canBrowseServerPaths,
  canMaintainKnowledge,
  canReadKnowledge,
  canWriteJobs,
  canWriteKnowledge,
  clearRemovedTermsFromCloud,
  clearWordCloudCorpusPaths,
  collapsedWordBagIds,
  currentView,
  deleteVocabularyEntry,
  displayedVocabularyEntries,
  emailReportSeriesRules,
  emailSynonymRules,
  enabledStringOptionBarOptions,
  error,
  expertRuleEnabled,
  expertVocabularyDraft,
  filter,
  formatBytes,
  formatCompactDate,
  formatMachineDate,
  formatWordCloudThreshold,
  goldenRuleItems,
  goldenRulePackageTitle,
  goldenRulePackages,
  hasFeature,
  hiddenVocabularyEntryCount,
  canSubmitKnowledgeIngest,
  ingestFiles,
  ingestJob,
  ingestProgress,
  infoFeedModelOptions,
  isAuthenticated,
  jobStatusLabels,
  jobStatusTone,
  jsonPreview,
  knowledgeConfigGroupDescription,
  knowledgeManagementPanel,
  knowledgeManagementPanelOptionBarOptions,
  knowledgeReviewCanResolveWithDocument,
  knowledgeReviewCurrentDocuments,
  knowledgeReviewDetailText,
  knowledgeReviewDocumentLine,
  knowledgeReviewIncomingDocument,
  knowledgeReviewItems,
  knowledgeReviewPrimaryCurrentDocument,
  knowledgeReviewReasonLabel,
  knowledgeReviewRecordPreview,
  knowledgeReviewResolvedAction,
  knowledgeReviewRowClassName,
  knowledgeReviewSimilarity,
  knowledgeReviewSourceLabel,
  knowledgeReviewStatus,
  knowledgeReviewStatusLabel,
  knowledgeReviewStatusOptionBarOptions,
  knowledgeReviewTitle,
  knowledgeReviewTone,
  knowledgeIngestExternalProvider,
  knowledgeIngestExternalRefs,
  knowledgeIngestExternalTargetLabels,
  knowledgeIngestTargets,
  knowledgeIngestTargetValidationMessage,
  knowledgeIngestTeamRefs,
  knowledgeIngestUserRefs,
  knowledgeConsole,
  knowledgeSchema,
  knowledgeTab,
  maintenanceFieldValue,
  maintenanceJson,
  normalizedManifest,
  onIngestFilesSelected,
  openWordCloudCorpusDirectoryPicker,
  openWordCloudCorpusFilePicker,
  proposeWordCloud,
  refreshExpertRules,
  refreshIngestJob,
  refreshKnowledgeConflicts,
  refreshKnowledgeConsole,
  refreshWordCloud,
  removeTermFromCloud,
  removeWordCloudCorpusPath,
  resolveKnowledgeReview,
  rulesText,
  saveExpertVocabulary,
  saveKnowledgeMaintenance,
  saveRules,
  saveWordCloud,
  selectKnowledgeManagementPanel,
  selectKnowledgeReviewItem,
  selectWordCloud,
  selectedKnowledgeReviewFusionModel,
  selectedKnowledgeReviewItem,
  selectedWordCloud,
  selectedWordCloudModel,
  setEmailRuleEntryEnabled,
  setMaintenanceFieldFromEvent,
  setMaintenanceFieldValue,
  setVocabularyEntryEnabled,
  setWordCloudTermInput,
  showAllVocabularyEntries,
  syncLocalSourceLabelFromPath,
  toggleGoldenRuleEnabled,
  toggleWordCloudActionMenu,
  toggleWordCloudCollapsed,
  pinWordCloud,
  pinnedWordBagIds,
  updateVocabularyDomains,
  updateVocabularyKeywords,
  updateVocabularyPath,
  updateWordCloudField,
  uploadFilesToKnowledge,
  vocabularyEntryPath,
  vocabularySearch,
  wordBagActionMenuId,
  wordCloudCardRows,
  wordCloudCardStyle,
  wordCloudCorpusPathLabel,
  wordCloudCorpusPathSummary,
  wordCloudCorpusPaths,
  wordCloudDraft,
  wordCloudMessages,
  wordCloudModelAlias,
  wordCloudModelOptions,
  wordCloudPrompt,
  wordCloudTermInputs,
  wordCloudTerms,
  wordCloudVisibleTerms,
  wordCloudState,
  highlightedConfigTarget,
  publishRuleAuthoringPackage,
  ruleActionOptionBarOptions,
  ruleAuthoringCanSubmit,
  ruleAuthoringDraftPayload,
  ruleAuthoringForm,
  ruleAuthoringModelOptions,
  ruleAuthoringResult,
  ruleAuthoringStatusLabel,
  ruleCreationMode,
  ruleMatchStrategyOptionBarOptions,
  ruleScopeOptionBarOptions,
  fuseKnowledgeReview,
  runRuleAuthoringChat,
  shortId,
  activeKnowledgeTab,
  expandedSummaryIds,
  toggleSummaryExpanded,
  expandedAdvancedIds,
  toggleAdvancedExpanded,
  titleFocusedWordBagId,
  jumpToCloud,
  isManagementKnowledgePanel,
  isManagementRulesPanel,
  isKnownKnowledgeTab,
  dynamicParsingPolicySignature,
  documentPreviewResult,
  knowledgeBackendSpacesResult,
  knowledgeLibraryBusy,
  knowledgeLibraryError,
  knowledgeBackendProviderOptions,
  knowledgeBackendModeOptions,
  knowledgeBackendProviderForms,
  expandedKnowledgeLibraryCards,
  expandedKnowledgeBackendCards,
  knowledgeBackendSpaces,
  realKnowledgeBackendSpaces,
  isKnowledgeLibraryCardExpanded,
  toggleKnowledgeLibraryCard,
  isKnowledgeBackendCardExpanded,
  toggleKnowledgeBackendCard,
  textField,
  externalProviderLabel,
  knowledgeLibraryDisplayTitle,
  knowledgeBackendSpaceDisplayName,
  knowledgeIngestExternalValue,
  parseKnowledgeIngestExternalValue,
  parseKnowledgeIngestExternalRef,
  knowledgeIngestTargetOptions,
  knowledgeIngestTargetValues,
  knowledgeIngestTargetDisplaySummary,
  setKnowledgeIngestTargetValues,
  metadataPolicyLabel,
  knowledgeLibraryCards,
  knowledgeBackendProviderCards,
  refreshKnowledgeLibrarySpaces,
  connectKnowledgeBackendProvider,
} = knowledgeView;

async function previewKnowledgeDocumentParsing() {
  documentPreviewResult.value = await previewKnowledgeDocuments(ingestFiles.value, {
    pipelineId: dynamicParsingViewContract.pipelineId,
    expectedOutputs: ["preprocessResult", "chunks", "structureArtifacts", "granularityFragments"],
    contextBudget: dynamicParsingViewContract.contextBudget,
    payloadBudget: dynamicParsingViewContract.payloadBudget,
    granularity: dynamicParsingViewContract.granularity,
    dynamicParsing: dynamicParsingViewContract.dynamicParsing,
  });
}
</script>

<template>
          <section
            class="knowledge-layout"
            :data-dynamic-parsing-policy="dynamicParsingPolicySignature"
            :data-dynamic-parsing-contract="dynamicParsingViewContractSignature"
            :data-knowledge-view-branches="knowledgeViewBranchContract.join(';')"
          >
            <SegmentedToggle
              v-if="activeKnowledgeTab === 'management'"
              v-model="knowledgeManagementPanel"
              :options="knowledgeManagementPanelOptionBarOptions"
              aria-label="知识管理面板"
              size="large"
            />

            <KnowledgeWordCloudPanel v-if="activeKnowledgeTab === 'wordCloud'" />

            <article
              v-if="isManagementKnowledgePanel"
              class="surface-card knowledge-library-board"
            >
              <div class="section-header">
                <div>
                  <h3>知识库</h3>
                </div>
              </div>
              <p v-if="knowledgeLibraryError" class="module-note warning-note">{{ knowledgeLibraryError }}</p>
              <div v-if="knowledgeLibraryCards.length" class="knowledge-library-list">
                <SplitToggleCard
                  v-for="library in knowledgeLibraryCards"
                  :key="library.id"
                  class="knowledge-library-card"
                  :expanded="isKnowledgeLibraryCardExpanded(library.id)"
                  :expanded-label="`收起 ${library.title}`"
                  :collapsed-label="`展开 ${library.title}`"
                  @toggle="toggleKnowledgeLibraryCard(library.id)"
                >
                  <template #summary>
                    <div class="knowledge-card-toggle-content">
                      <span class="knowledge-library-card-main">
                        <strong>{{ library.displayTitle }}</strong>
                        <span class="knowledge-library-card-kind">{{ library.providerLabel }}</span>
                      </span>
                      <span class="knowledge-library-card-status">
                        <StatusPill :tone="library.boundaryTone" :label="library.boundaryLabel" />
                        <StatusPill :tone="library.statusTone" :label="library.statusLabel" />
                      </span>
                    </div>
                  </template>
                  <div class="knowledge-library-detail-grid">
                    <div
                      v-for="detail in library.details"
                      :key="`${library.id}:${detail.label}`"
                    >
                      <span>{{ detail.label }}</span>
                      <strong>{{ detail.value }}</strong>
                    </div>
                  </div>
                </SplitToggleCard>
              </div>
            </article>

            <article
              id="knowledge-file-import"
              v-if="isManagementKnowledgePanel"
              class="surface-card ingest-upload-card"
            >
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

            <KnowledgeDistillationWorkbench
              v-if="isManagementKnowledgePanel && hasFeature('knowledge-distillation')"
              :can-read-knowledge="canReadKnowledge"
              :can-maintain-knowledge="canMaintainKnowledge"
              :ingest-job="ingestJob"
              :normalized-manifest="normalizedManifest"
              :format-compact-date="formatCompactDate"
              :model-options="infoFeedModelOptions"
            />

            <section v-if="activeKnowledgeTab === 'maintenance'" class="knowledge-maintenance">
              <p v-if="knowledgeLibraryError" class="module-note warning-note">{{ knowledgeLibraryError }}</p>

              <div class="knowledge-backend-config-list">
                <SplitToggleCard
                  class="knowledge-backend-config-card"
                  :expanded="isKnowledgeBackendCardExpanded('builtin')"
                  expanded-label="收起内建知识库配置"
                  collapsed-label="展开内建知识库配置"
                  @toggle="toggleKnowledgeBackendCard('builtin')"
                >
                  <template #summary>
                    <div class="knowledge-card-toggle-content">
                      <span class="knowledge-library-card-main">
                        <strong>Pact Native</strong>
                        <small>KnowledgeCore</small>
                        <span class="knowledge-library-card-meta">
                          <span>Pact</span>
                          <span>internal</span>
                          <span>{{ knowledgeConsole?.available ? "available" : "unavailable" }}</span>
                        </span>
                      </span>
                      <span class="knowledge-library-card-status">
                        <StatusPill tone="info" label="内建" />
                        <StatusPill :tone="knowledgeConsole?.available ? 'success' : 'danger'" :label="knowledgeConsole?.available ? '可用' : '不可用'" />
                      </span>
                    </div>
                  </template>
                  <div v-for="group in knowledgeSchema?.groups || []" :key="group.id" class="config-group">
                    <div class="config-group-header">
                      <h4>{{ group.label }}</h4>
                      <p v-if="knowledgeConfigGroupDescription(group.id)">{{ knowledgeConfigGroupDescription(group.id) }}</p>
                    </div>
                    <div class="form-grid compact-form-grid">
                      <label v-for="field in group.fields" :key="field.name">
                        <span
                          class="field-label-with-tooltip"
                          :class="{ 'has-tooltip': field.description }"
                          :title="field.description || undefined"
                        >
                          {{ field.label }}
                        </span>
                        <input
                          v-if="field.type === 'number'"
                          :value="maintenanceFieldValue(field.name, field.defaultValue)"
                          type="number"
                          :min="field.min"
                          :max="field.max"
                          :step="field.step || 1"
                          @input="setMaintenanceFieldFromEvent(field.name, $event, 'number')"
                        />
                        <OptionBar
                          v-else-if="field.type === 'boolean'"
                          :model-value="maintenanceFieldValue(field.name, field.defaultValue) ? 'true' : 'false'"
                          :options="enabledStringOptionBarOptions"
                          @update:model-value="setMaintenanceFieldValue(field.name, $event === 'true')"
                        />
                        <input
                          v-else
                          :value="String(maintenanceFieldValue(field.name, field.defaultValue) ?? '')"
                          type="text"
                          @input="setMaintenanceFieldFromEvent(field.name, $event, 'string')"
                        />
                      </label>
                    </div>
                  </div>
                  <ConfigFoldCard title="高级 JSON Diff">
                    <label class="json-editor">
                      <span>只在需要精确修改服务端配置对象时展开</span>
                      <textarea v-model="maintenanceJson" rows="10" spellcheck="false" />
                    </label>
                  </ConfigFoldCard>
                  <div class="source-actions">
                    <button class="primary-action" type="button" :disabled="!canAdminKnowledge" @click="saveKnowledgeMaintenance">
                      保存配置
                    </button>
                  </div>
                </SplitToggleCard>

                <SplitToggleCard
                  v-for="backend in knowledgeBackendProviderCards"
                  :key="backend.provider"
                  class="knowledge-backend-config-card"
                  :expanded="isKnowledgeBackendCardExpanded(backend.provider)"
                  :expanded-label="`收起 ${backend.title}`"
                  :collapsed-label="`展开 ${backend.title}`"
                  @toggle="toggleKnowledgeBackendCard(backend.provider)"
                >
                  <template #summary>
                    <div class="knowledge-card-toggle-content">
                      <span class="knowledge-library-card-main">
                        <strong>{{ backend.title }}</strong>
                        <small>{{ backend.description }}</small>
                        <span class="knowledge-library-card-meta">
                          <span v-for="item in backend.meta" :key="`${backend.provider}:${item}`">{{ item }}</span>
                        </span>
                      </span>
                      <span class="knowledge-library-card-status">
                        <StatusPill tone="warning" label="外部" />
                        <StatusPill :tone="backend.statusTone" :label="backend.statusLabel" />
                      </span>
                    </div>
                  </template>
                  <div class="knowledge-library-detail-grid">
                    <div
                      v-for="detail in backend.details"
                      :key="`${backend.provider}:${detail.label}`"
                    >
                      <span>{{ detail.label }}</span>
                      <strong>{{ detail.value }}</strong>
                    </div>
                  </div>
                  <div class="form-grid compact-form-grid knowledge-backend-provider-form">
                    <OptionBar
                      label="连接模式"
                      :model-value="knowledgeBackendProviderForms[backend.provider].mode"
                      :options="knowledgeBackendModeOptions"
                      @update:model-value="knowledgeBackendProviderForms[backend.provider].mode = String($event)"
                    />
                    <label>
                      <span>Secret Ref</span>
                      <input
                        v-model="knowledgeBackendProviderForms[backend.provider].secretRef"
                        autocomplete="off"
                        placeholder="secret://pact/knowledge/provider-api-key"
                      />
                    </label>
                    <label>
                      <span>Endpoint Ref</span>
                      <input
                        v-model="knowledgeBackendProviderForms[backend.provider].endpointRef"
                        autocomplete="off"
                        placeholder="config://pact/knowledge/provider-endpoint"
                      />
                    </label>
                  </div>
                  <div class="source-actions">
                    <button
                      class="primary-action"
                      type="button"
                      :disabled="!canMaintainKnowledge || knowledgeLibraryBusy !== ''"
                      @click="connectKnowledgeBackendProvider(backend.provider)"
                    >
                      {{ knowledgeLibraryBusy === `backend:${backend.provider}` ? "连接中" : "保存配置" }}
                    </button>
                  </div>
                </SplitToggleCard>
              </div>
            </section>

            <article
              v-if="isManagementRulesPanel"
              class="surface-card expert-rules-page"
            >
              <div class="section-header">
                <div>
                  <h3>黄金规则</h3>
                </div>
              </div>
              <div class="expert-rule-group-list">
                <section
                  v-for="pkg in goldenRulePackages"
                  :key="String(pkg.packageId || pkg.version)"
                  class="module-panel expert-rule-package"
                >
                  <div class="module-panel-heading">
                    <div>
                      <strong>{{ goldenRulePackageTitle(pkg) }}</strong>
                      <span>{{ String(pkg.status || "unknown") }} · {{ goldenRuleItems(pkg).length }} 条</span>
                    </div>
                    <StatusPill
                      :tone="String(pkg.status || '') === 'active' ? 'success' : 'warning'"
                      :label="String(pkg.status || 'draft')"
                    />
                  </div>
                  <div class="expert-rule-card-list">
                    <article
                      v-for="item in goldenRuleItems(pkg)"
                      :key="String(item.rule.ruleId || item.index)"
                      class="expert-rule-card"
                      :data-enabled="expertRuleEnabled(item.rule)"
                    >
                      <div>
                        <strong>{{ String(item.rule.label || item.rule.ruleId || `规则 ${item.index + 1}`) }}</strong>
                        <span>{{ String(item.rule.action || "needs_human_review") }} · priority {{ Number(item.rule.priority || 0) }}</span>
                        <p>{{ String(item.rule.reason || item.rule.description || "无说明") }}</p>
                        <small>{{ (Array.isArray(item.rule.targetTypes) ? item.rule.targetTypes : ["*"]).join(" / ") }}</small>
                      </div>
                      <FeatureToggle
                        :model-value="expertRuleEnabled(item.rule)"
                        :aria-label="expertRuleEnabled(item.rule) ? '停用规则' : '启用规则'"
                        :disabled="!canAdminKnowledge || busyKey === `golden-rule:${String(pkg.packageId || '')}:${item.index}`"
                        @update:model-value="toggleGoldenRuleEnabled(pkg, item.index, $event)"
                      />
                    </article>
                  </div>
                  <ConfigFoldCard title="规则包 JSON">
                    <pre>{{ jsonPreview(pkg) }}</pre>
                  </ConfigFoldCard>
                </section>
                <div v-if="goldenRulePackages.length === 0" class="empty-state">
                  <strong>暂无黄金规则包</strong>
                  <span>使用右上角刷新，或通过工作台创建规则草稿。</span>
                </div>
              </div>
            </article>

            <article
              v-if="isManagementRulesPanel"
              class="surface-card knowledge-vocabulary expert-rules-page"
            >
                <div class="section-header">
                  <div>
                    <h3>专家词汇规则</h3>
                    <p>用于知识分类、事务归纳和检索提示。Toggle 控制词条是否作为 active 专家规则参与运行。</p>
                  </div>
                  <span>v{{ expertVocabularyDraft.version || 0 }} / {{ expertVocabularyDraft.entries.length }} 条</span>
                </div>
                <div class="vocabulary-controls">
                  <label class="vocabulary-filter">
                    <span>筛选词条</span>
                    <input v-model="vocabularySearch" type="search" autocomplete="off" placeholder="路径、关键词、域名或备注" />
                  </label>
                  <div class="drawer-actions">
                    <button class="tool-button tool-button-ghost" type="button" @click="addVocabularyEntry">
                      新增词条
                    </button>
                    <button class="tool-button" type="button" :disabled="busyKey === 'expert-vocabulary'" @click="saveExpertVocabulary">
                      {{ busyKey === "expert-vocabulary" ? "发布中" : "保存并发布" }}
                    </button>
                  </div>
                </div>
                <div class="vocabulary-table-shell">
                  <table class="vocabulary-table">
                    <thead>
                      <tr>
                        <th>层级路径</th>
                        <th>关键词</th>
                        <th>发件域名</th>
                        <th>状态</th>
                        <th>备注</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="item in displayedVocabularyEntries" :key="item.entry.id || item.index">
                        <td>
                          <input :value="vocabularyEntryPath(item.entry)" autocomplete="off" @input="updateVocabularyPath(item.index, ($event.target as HTMLInputElement).value)" />
                        </td>
                        <td>
                          <textarea :value="item.entry.keywords.join(', ')" @input="updateVocabularyKeywords(item.index, ($event.target as HTMLTextAreaElement).value)" />
                        </td>
                        <td>
                          <textarea :value="item.entry.domains.join(', ')" @input="updateVocabularyDomains(item.index, ($event.target as HTMLTextAreaElement).value)" />
                        </td>
                        <td>
                          <FeatureToggle
                            :model-value="item.entry.status === 'active'"
                            :aria-label="item.entry.status === 'active' ? '停用词条' : '启用词条'"
                            @update:model-value="setVocabularyEntryEnabled(item.index, $event)"
                          />
                          <small class="field-hint">{{ item.entry.status }}</small>
                        </td>
                        <td>
                          <input v-model="item.entry.notes" autocomplete="off" />
                        </td>
                        <td>
                          <button class="table-action" type="button" @click="deleteVocabularyEntry(item.index)">
                            删除
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div v-if="expertVocabularyDraft.entries.length === 0" class="empty-state">
                    <strong>暂无词条</strong>
                    <span>请先新增一个层级路径。</span>
                  </div>
                </div>
                <div v-if="hiddenVocabularyEntryCount > 0" class="vocabulary-footer">
                  <span>已隐藏 {{ hiddenVocabularyEntryCount }} 条低频维护项。</span>
                  <button class="table-action" type="button" @click="showAllVocabularyEntries = true">
                    展开全部
                  </button>
                </div>
                <div v-else-if="showAllVocabularyEntries && !vocabularySearch" class="vocabulary-footer">
                  <span>已显示全部词条。</span>
                  <button class="table-action" type="button" @click="showAllVocabularyEntries = false">
                    收起
                  </button>
                </div>
            </article>

            <article v-if="isManagementRulesPanel" class="surface-card rule-authoring-card">
              <div class="section-header">
                <div>
                  <h3>创建规则</h3>
                </div>
                <SegmentedToggle
                  v-model="ruleCreationMode"
                  :options="[{ value: 'chat', label: '智能对话' }, { value: 'manual', label: '人工配置' }]"
                  aria-label="创建规则方式"
                />
              </div>
              <form class="rule-authoring-form" :data-mode="ruleCreationMode" @submit.prevent="runRuleAuthoringChat">
                <template v-if="ruleCreationMode === 'chat'">
                  <label class="full-row">
                    <span>需求</span>
                    <textarea
                      v-model="ruleAuthoringForm.message"
                      rows="4"
                      placeholder="例如：生成一个黄金规则，完全一样的知识直接跳过"
                    ></textarea>
                  </label>
                  <AgentModelOptionBar
                    data-config-target="rule-authoring-agent"
                    :data-config-highlighted="highlightedConfigTarget === 'rule-authoring-agent'"
                    v-model="ruleAuthoringForm.modelAlias"
                    label="智能体"
                    placeholder="未分配智能体"
                    :options="ruleAuthoringModelOptions"
                  />
                </template>
                <template v-else>
                  <label>
                    <span>规则名称</span>
                    <input
                      v-model="ruleAuthoringForm.ruleName"
                      type="text"
                      placeholder="例如：重复知识处理规则"
                    />
                  </label>
                  <OptionBar
                    v-model="ruleAuthoringForm.scope"
                    label="适用范围"
                    :options="ruleScopeOptionBarOptions"
                  />
                  <OptionBar
                    v-model="ruleAuthoringForm.matchStrategy"
                    label="匹配方式"
                    :options="ruleMatchStrategyOptionBarOptions"
                  />
                  <OptionBar
                    v-model="ruleAuthoringForm.action"
                    label="执行动作"
                    :options="ruleActionOptionBarOptions"
                  />
                  <label>
                    <span>最低置信度</span>
                    <input
                      v-model.number="ruleAuthoringForm.confidence"
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                    />
                  </label>
                  <label class="full-row">
                    <span>补充说明</span>
                    <textarea
                      v-model="ruleAuthoringForm.notes"
                      rows="3"
                      placeholder="写清楚边界条件、例外情况或需要人工审核的场景"
                    ></textarea>
                  </label>
                </template>
                <button
                  class="primary-action"
                  type="submit"
                  :disabled="busyKey === 'knowledge:rule-authoring' || !ruleAuthoringCanSubmit"
                >
                  {{ busyKey === "knowledge:rule-authoring" ? "生成中" : (ruleCreationMode === "manual" ? "按配置创建规则" : "生成规则草稿") }}
                </button>
              </form>
              <div v-if="ruleAuthoringResult" class="rule-authoring-result">
                <div class="rule-authoring-status">
                  <strong>{{ ruleAuthoringStatusLabel(ruleAuthoringResult.status) }}</strong>
                  <span v-if="ruleAuthoringResult.runId">{{ shortId(ruleAuthoringResult.runId) }}</span>
                </div>
                <div class="rule-authoring-pipeline">
                  <span
                    v-for="(step, stepIndex) in ruleAuthoringResult.steps || []"
                    :key="`${String(step.stage || 'stage')}:${stepIndex}`"
                    :data-status="String(step.status || '')"
                  >
                    {{ step.stage }} · {{ step.status }}
                  </span>
                </div>
                <div v-if="ruleAuthoringResult.confirmation" class="rule-authoring-confirm">
                  <span>
                    规则包 {{ ruleAuthoringResult.confirmation.packageId }} v{{ ruleAuthoringResult.confirmation.version }}
                    已保存为草稿。
                  </span>
                  <button
                    class="tool-button"
                    type="button"
                    :disabled="busyKey === 'knowledge:rule-authoring:publish'"
                    @click="publishRuleAuthoringPackage"
                  >
                    {{ busyKey === "knowledge:rule-authoring:publish" ? "发布中" : "确认发布" }}
                  </button>
                </div>
                <ConfigFoldCard title="门禁结果">
                  <pre>{{ jsonPreview(ruleAuthoringResult.gate || {}) }}</pre>
                </ConfigFoldCard>
                <ConfigFoldCard title="生成的 JSON 规则包">
                  <pre>{{ jsonPreview(ruleAuthoringResult.package || {}) }}</pre>
                </ConfigFoldCard>
              </div>
            </article>

            <article
              v-if="isManagementRulesPanel"
              class="surface-card knowledge-rules expert-rules-page"
            >
                <div class="section-header">
                  <div>
                    <h3>邮件专家规则</h3>
                  </div>
                  <span>{{ emailReportSeriesRules.length + emailSynonymRules.length }} 条</span>
                </div>
                <div class="expert-rule-grid">
                  <section class="module-panel">
                    <div class="module-panel-heading">
                      <strong>报告序列</strong>
                      <span>{{ emailReportSeriesRules.length }}</span>
                    </div>
                    <div class="expert-rule-card-list">
                      <article
                        v-for="item in emailReportSeriesRules"
                        :key="item.rule.id || item.index"
                        class="expert-rule-card"
                        :data-enabled="expertRuleEnabled(item.rule)"
                      >
                        <div>
                          <strong>{{ item.rule.label }}</strong>
                          <span>{{ item.rule.cadence }} · {{ item.rule.id }}</span>
                          <p>{{ item.rule.keywords.join(" / ") }}</p>
                        </div>
                        <FeatureToggle
                          :model-value="expertRuleEnabled(item.rule)"
                          :aria-label="expertRuleEnabled(item.rule) ? '停用报告序列规则' : '启用报告序列规则'"
                          @update:model-value="setEmailRuleEntryEnabled('reportSeries', item.index, $event)"
                        />
                      </article>
                    </div>
                  </section>
                  <section class="module-panel">
                    <div class="module-panel-heading">
                      <strong>同义词</strong>
                      <span>{{ emailSynonymRules.length }}</span>
                    </div>
                    <div class="expert-rule-card-list">
                      <article
                        v-for="item in emailSynonymRules"
                        :key="item.rule.canonical || item.index"
                        class="expert-rule-card"
                        :data-enabled="expertRuleEnabled(item.rule)"
                      >
                        <div>
                          <strong>{{ item.rule.canonical }}</strong>
                          <span>{{ item.rule.terms.length }} 个词</span>
                          <p>{{ item.rule.terms.join(" / ") }}</p>
                        </div>
                        <FeatureToggle
                          :model-value="expertRuleEnabled(item.rule)"
                          :aria-label="expertRuleEnabled(item.rule) ? '停用同义词规则' : '启用同义词规则'"
                          @update:model-value="setEmailRuleEntryEnabled('synonymDictionary', item.index, $event)"
                        />
                      </article>
                    </div>
                  </section>
                </div>
                <ConfigFoldCard class="rules-json-panel" title="展开规则 JSON">
                  <textarea v-model="rulesText" class="rules-editor" spellcheck="false" />
                </ConfigFoldCard>
                <button class="tool-button" type="button" :disabled="busyKey === 'rules'" @click="saveRules">
                  {{ busyKey === "rules" ? "保存中" : "保存规则库" }}
                </button>
            </article>
            <article
              v-if="!isKnownKnowledgeTab"
              class="surface-card knowledge-empty-state"
            >
              <div class="section-header">
                <div>
                  <h3>知识库页面已空</h3>
                  <p>当前知识标签异常，已切回默认标签。</p>
                </div>
              </div>
              <p class="module-note">请重新选择左侧“知识库”下的任一标签。</p>
            </article>
          </section>
</template>
