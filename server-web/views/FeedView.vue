<script setup lang="ts">
import { ref } from 'vue';
import { useConsole } from '../composables/useConsole';
import AgentModelOptionBar from '../components/AgentModelOptionBar.vue';
import BrowseSelectButton from '../components/BrowseSelectButton.vue';
import ConfigFoldCard from '../components/ConfigFoldCard.vue';
import HistorySessionPanel from '../components/HistorySessionPanel.vue';
import InfoFeedResultRow from '../components/InfoFeedResultRow.vue';
import OptionBar from '../components/OptionBar.vue';
import SafeHtmlBlock from '../components/SafeHtmlBlock.vue';
import StatusPill from '../components/StatusPill.vue';
const {
  agentSelectorOptions,
  agentExploreStepSummary,
  chooseInfoFeedClarification,
  continueInfoFeedAfterModelSelection,
  continueInfoFeedAfterRetry,
  busyKey,
  contextWindowOptionBarOptions,
  copyInfoFeedSummary,
  currentView,
  deleteInfoFeedHistoryItem,
  error,
  exportInfoFeedSummary,
  filter,
  formatCompactDate,
  formatFileSize,
  handleAgentAnswerClick,
  handleInfoFeedAttachmentFiles,
  highlightedConfigTarget,
  infoFeedAgentAnswer,
  infoFeedAgentSteps,
  infoFeedAllKeywordItems,
  infoFeedAttachments,
  infoFeedClarification,
  infoFeedContextGateNotice,
  infoFeedCurrentRun,
  infoFeedCurrentUserQuestion,
  infoFeedExpertFeedbackFor,
  infoFeedExpertFeedbackForRun,
  infoFeedForm,
  infoFeedHistory,
  infoFeedHistoryPanelItems,
  infoFeedInputPlaceholder,
  infoFeedKeywordItems,
  infoFeedKeywordProgressLabel,
  infoFeedLowRelevanceKeywordItems,
  infoFeedModelOptions,
  infoFeedModelSelectionMessage,
  infoFeedNeedsModelSelection,
  infoFeedNeedsRetryContinue,
  infoFeedParentRunForCurrent,
  infoFeedParentSummaryHtml,
  infoFeedReadyForSummary,
  infoFeedRetryMessage,
  infoFeedRetryStageLabel,
  infoFeedStatusLabel,
  infoFeedStatusTone,
  infoFeedStreamingSummaryHtml,
  infoFeedSubmitLabel,
  infoFeedSummaryIsStreaming,
  infoFeedSummaryMarkdown,
  infoFeedSummaryRuntime,
  infoFeedTurnAttachments,
  infoFeedTurnQuestion,
  infoFeedTurnSummaryHtml,
  infoFeedTurnTitle,
  infoFeedUserCardTitle,
  isAuthenticated,
  openAgentEvidencePreview,
  removeInfoFeedAttachment,
  runInfoFeed,
  runInfoFeedSummaryAgent,
  saveSettings,
  selectInfoFeedHistoryItem,
  selectedInfoFeedModel,
  settingsDraft,
  thinkingModeOptionBarOptions,
  truncateInfoFeedText,
} = useConsole();

const infoFeedAdvancedOptionsOpen = ref(false);

function openInfoFeedAdvancedOptions() {
  infoFeedAdvancedOptionsOpen.value = true;
}

function closeInfoFeedAdvancedOptions() {
  infoFeedAdvancedOptionsOpen.value = false;
}
</script>

<template>
          <section class="info-feed-shell">
            <div class="info-feed-dialog">
              <div class="info-feed-render">
                <HistorySessionPanel
                  class="info-feed-history-panel"
                  title="历史记录"
                  :subtitle="`${infoFeedHistory.length} 条`"
                  :items="infoFeedHistoryPanelItems"
                  @select="selectInfoFeedHistoryItem"
                  @delete="deleteInfoFeedHistoryItem"
                />

                <div v-if="!infoFeedCurrentRun" class="info-feed-empty">
                  <strong>信息流</strong>
                  <span>输入问题后，会同时启动原文检索和智能规划，最后由总结智能体合并结果。</span>
                </div>

                <div v-else class="info-feed-flow">
                  <section
                    v-if="infoFeedParentRunForCurrent && infoFeedExpertFeedbackForRun(infoFeedParentRunForCurrent, 'summary').length"
                    class="info-feed-summary-filter info-feed-parent-context-card"
                  >
                    <div class="info-feed-summary-header">
                      <div>
                        <h3>知识归纳</h3>
                        <span>上一轮专家确认</span>
                      </div>
                      <StatusPill tone="success" label="已选择" />
                    </div>
                    <div class="info-feed-expert-feedback-list">
                      <article
                        v-for="feedbackItem in infoFeedExpertFeedbackForRun(infoFeedParentRunForCurrent, 'summary')"
                        :key="feedbackItem.feedbackId"
                        class="info-feed-expert-feedback"
                        :data-sync="feedbackItem.syncStatus"
                      >
                        <div>
                          <strong>人类专家意见</strong>
                          <span>{{ feedbackItem.selectedLabel }}</span>
                        </div>
                        <p>{{ feedbackItem.prompt }}</p>
                        <small>{{ feedbackItem.followUpQuestion }}</small>
                      </article>
                    </div>
                  </section>

                  <article
                    v-if="infoFeedParentRunForCurrent?.summary.answer"
                    class="info-feed-final-card info-feed-parent-context-card"
                  >
                    <div class="compact-section-header">
                      <h3>输出报告</h3>
                      <div class="agent-result-actions">
                        <span>上一轮</span>
                      </div>
                    </div>
                    <SafeHtmlBlock
                      class="evidence-rendered-content info-feed-summary-content"
                      :html="infoFeedParentSummaryHtml"
                      source="markdownToSafeHtml"
                      @click="handleAgentAnswerClick"
                    />
                    <div
                      v-if="infoFeedExpertFeedbackForRun(infoFeedParentRunForCurrent, 'report').length"
                      class="info-feed-expert-feedback-list"
                    >
                      <article
                        v-for="feedbackItem in infoFeedExpertFeedbackForRun(infoFeedParentRunForCurrent, 'report')"
                        :key="feedbackItem.feedbackId"
                        class="info-feed-expert-feedback"
                        :data-sync="feedbackItem.syncStatus"
                      >
                        <div>
                          <strong>人类专家意见</strong>
                          <span>{{ feedbackItem.selectedLabel }}</span>
                        </div>
                        <p>{{ feedbackItem.prompt }}</p>
                        <small>{{ feedbackItem.followUpQuestion }}</small>
                      </article>
                    </div>
                  </article>

                  <template
                    v-for="(turn, turnIndex) in infoFeedCurrentRun.turns || []"
                    :key="turn.turnId"
                  >
                    <article class="info-feed-final-card info-feed-user-turn-card">
                      <div class="compact-section-header">
                        <div>
                          <h3>{{ infoFeedUserCardTitle(turn) }}</h3>
                          <span>{{ infoFeedTurnTitle(turn, turnIndex) }}</span>
                        </div>
                        <div class="agent-result-actions">
                          <span>{{ formatCompactDate(turn.completedAt) }}</span>
                        </div>
                      </div>
                      <div class="info-feed-user-message">
                        <p>{{ infoFeedTurnQuestion(turn) }}</p>
                        <div
                          v-if="infoFeedTurnAttachments(turn).length"
                          class="info-feed-user-attachment-list"
                        >
                          <span
                            v-for="attachment in infoFeedTurnAttachments(turn)"
                            :key="attachment.id"
                            class="info-feed-user-attachment"
                            :data-tone="infoFeedStatusTone(attachment.status)"
                          >
                            <strong>{{ attachment.name }}</strong>
                            <small>{{ formatFileSize(attachment.size) }} · {{ infoFeedStatusLabel(attachment.status) }}</small>
                          </span>
                        </div>
                      </div>
                    </article>

                    <article class="info-feed-final-card info-feed-turn-card">
                      <div class="compact-section-header">
                        <div>
                          <h3>输出报告</h3>
                          <span>{{ infoFeedTurnTitle(turn, turnIndex) }} · {{ infoFeedTurnQuestion(turn) }}</span>
                        </div>
                        <div class="agent-result-actions">
                          <span v-if="turn.summaryFallback">兜底摘要</span>
                          <span>{{ formatCompactDate(turn.completedAt) }}</span>
                        </div>
                      </div>
                      <SafeHtmlBlock
                        v-if="turn.summaryAnswer"
                        class="evidence-rendered-content info-feed-summary-content"
                        :html="infoFeedTurnSummaryHtml(turn)"
                        source="markdownToSafeHtml"
                        @click="handleAgentAnswerClick"
                      />
                      <p v-if="turn.summaryError" class="module-note danger-note">
                        {{ turn.summaryError }}
                      </p>
                      <div
                        v-if="turn.expertFeedback.length"
                        class="info-feed-expert-feedback-list"
                      >
                        <article
                          v-for="feedbackItem in turn.expertFeedback"
                          :key="feedbackItem.feedbackId"
                          class="info-feed-expert-feedback"
                          :data-sync="feedbackItem.syncStatus"
                        >
                          <div>
                            <strong>人类专家意见</strong>
                            <span>{{ feedbackItem.selectedLabel }}</span>
                          </div>
                          <p>{{ feedbackItem.prompt }}</p>
                          <small>{{ feedbackItem.followUpQuestion }}</small>
                        </article>
                      </div>
                    </article>
                  </template>

                  <article class="info-feed-final-card info-feed-user-turn-card">
                    <div class="compact-section-header">
                      <div>
                        <h3>{{ infoFeedUserCardTitle(infoFeedCurrentRun) }}</h3>
                        <span>{{ infoFeedCurrentRun.followUp ? "本轮追问" : "本轮输入" }}</span>
                      </div>
                      <div class="agent-result-actions">
                        <span>{{ formatCompactDate(infoFeedCurrentRun.startedAt) }}</span>
                      </div>
                    </div>
                    <div class="info-feed-user-message">
                      <p>{{ infoFeedCurrentUserQuestion(infoFeedCurrentRun) }}</p>
                      <div
                        v-if="infoFeedCurrentRun.attachments.length"
                        class="info-feed-user-attachment-list"
                      >
                        <span
                          v-for="attachment in infoFeedCurrentRun.attachments"
                          :key="attachment.id"
                          class="info-feed-user-attachment"
                          :data-tone="infoFeedStatusTone(attachment.status)"
                        >
                          <strong>{{ attachment.name }}</strong>
                          <small>{{ formatFileSize(attachment.size) }} · {{ infoFeedStatusLabel(attachment.status) }}</small>
                        </span>
                      </div>
                    </div>
                  </article>

                  <div
                    class="info-feed-track-grid"
                    :data-has-attachments="infoFeedCurrentRun.attachments.length > 0"
                  >
                    <article
                      v-if="infoFeedCurrentRun.attachments.length > 0"
                      class="info-feed-track-card"
                    >
                      <div class="info-feed-track-header">
                        <div>
                          <h3>附件处理</h3>
                          <span>{{ infoFeedCurrentRun.attachments.length }} 个附件</span>
                        </div>
                        <StatusPill tone="info" label="页面读取" />
                      </div>
                      <div class="info-feed-track-body">
                        <div
                          v-for="attachment in infoFeedCurrentRun.attachments"
                          :key="attachment.id"
                          class="info-feed-attachment-row"
                          :data-tone="infoFeedStatusTone(attachment.status)"
                        >
                          <strong>{{ attachment.name }}</strong>
                          <span>{{ formatFileSize(attachment.size) }} · {{ infoFeedStatusLabel(attachment.status) }}</span>
                          <small v-if="attachment.error">{{ attachment.error }}</small>
                          <small v-else-if="attachment.text">{{ truncateInfoFeedText(attachment.text, 120) }}</small>
                          <div class="info-feed-progress-track">
                            <span :style="{ width: `${attachment.progress}%` }"></span>
                          </div>
                        </div>
                      </div>
                    </article>

                    <article class="info-feed-track-card" data-track="source-search">
                      <div class="info-feed-track-header">
                        <div>
                          <h3>原文检索</h3>
                          <span v-if="infoFeedCurrentRun.keyword.status === 'completed'">
                            高关联 {{ infoFeedKeywordItems.length }} · 低关联 {{ infoFeedLowRelevanceKeywordItems.length }}{{ infoFeedCurrentRun.keyword.fromCache ? " · 缓存" : "" }}
                          </span>
                          <span v-else>直接扫描服务端原始文件{{ infoFeedCurrentRun.keyword.fromCache ? " · 缓存" : "" }}</span>
                        </div>
                        <StatusPill
                          :tone="infoFeedStatusTone(infoFeedCurrentRun.keyword.status)"
                          :label="infoFeedStatusLabel(infoFeedCurrentRun.keyword.status)"
                        />
                      </div>
                      <div
                        class="info-feed-progress-track"
                        :data-indeterminate="infoFeedCurrentRun.keyword.status === 'running'"
                      >
                        <span :style="{ width: `${infoFeedCurrentRun.keyword.progress}%` }"></span>
                      </div>
                      <div class="info-feed-track-body">
                        <div v-if="infoFeedCurrentRun.keyword.status === 'running'" class="empty-note">
                          {{ infoFeedKeywordProgressLabel }}
                        </div>
                        <div v-else-if="infoFeedCurrentRun.keyword.error" class="empty-note">
                          {{ infoFeedCurrentRun.keyword.error }}
                        </div>
                        <div
                          v-else-if="infoFeedCurrentRun.keyword.status === 'completed' && infoFeedKeywordProgressLabel"
                          class="empty-note"
                        >
                          {{ infoFeedKeywordProgressLabel }}
                        </div>
                        <div
                          v-if="infoFeedCurrentRun.keyword.status === 'completed' && infoFeedContextGateNotice.message"
                          class="info-feed-context-gate-card"
                        >
                          <strong>上下文门禁</strong>
                          <span>{{ infoFeedContextGateNotice.message }}</span>
                          <small>
                            高关联 {{ infoFeedContextGateNotice.includedHigh }}/{{ infoFeedContextGateNotice.highCount }}
                            · 低关联 {{ infoFeedContextGateNotice.includedLow }}/{{ infoFeedContextGateNotice.lowCount }}
                            · 剩余约 {{ Number(infoFeedContextGateNotice.remainingTokens || 0).toLocaleString() }} tokens
                          </small>
                        </div>
                        <InfoFeedResultRow
                          v-for="item in infoFeedKeywordItems"
                          :key="item.evidenceId || item.itemId || item.documentId || item.title"
                          :item="item"
                          @open="openAgentEvidencePreview"
                        />
                        <div
                          v-if="infoFeedCurrentRun.keyword.status === 'completed' && infoFeedKeywordItems.length === 0 && infoFeedLowRelevanceKeywordItems.length"
                          class="empty-note"
                        >
                          未找到可读正文同时命中的高关联邮件；已展开低关联原始命中。
                        </div>
                        <details
                          v-if="infoFeedCurrentRun.keyword.status === 'completed' && infoFeedLowRelevanceKeywordItems.length"
                          class="info-feed-low-relevance-panel"
                          :open="infoFeedKeywordItems.length === 0"
                        >
                          <summary>
                            低关联邮件 {{ infoFeedLowRelevanceKeywordItems.length }} 封
                            <small>原始 EML 命中，但主要命中在 URL、HTML 参数、编码块或不可读区域</small>
                          </summary>
                          <InfoFeedResultRow
                            v-for="item in infoFeedLowRelevanceKeywordItems"
                            :key="item.evidenceId || item.itemId || item.documentId || item.title"
                            :item="item"
                            tier="low"
                            @open="openAgentEvidencePreview"
                          />
                        </details>
                        <div
                          v-if="infoFeedCurrentRun.keyword.status === 'completed' && infoFeedAllKeywordItems.length === 0"
                          class="empty-note"
                        >
                          没有找到原文检索结果。
                        </div>
                      </div>
                    </article>

                    <article class="info-feed-track-card" data-track="agent-plan">
                      <div class="info-feed-track-header">
                        <div>
                          <h3>智能规划</h3>
                          <span>{{ selectedInfoFeedModel.label }}</span>
                        </div>
                        <StatusPill
                          :tone="infoFeedStatusTone(infoFeedCurrentRun.agent.status)"
                          :label="infoFeedStatusLabel(infoFeedCurrentRun.agent.status)"
                        />
                      </div>
                      <div class="info-feed-progress-track">
                        <span :style="{ width: `${infoFeedCurrentRun.agent.progress}%` }"></span>
                      </div>
                      <div class="info-feed-track-body">
                        <div v-if="infoFeedCurrentRun.agent.status === 'running'" class="empty-note">
                          正在规划工具调用和检索证据。
                        </div>
                        <div v-if="infoFeedAgentSteps.length" class="info-feed-step-list">
                          <div
                            v-for="step in infoFeedAgentSteps"
                            :key="`info-feed-step-${step.iteration}`"
                            class="info-feed-step-row"
                          >
                            <strong>第 {{ step.iteration }} 轮</strong>
                            <span>{{ agentExploreStepSummary(step) }}</span>
                          </div>
                        </div>
                        <div v-if="infoFeedCurrentRun.agent.error" class="empty-note">
                          {{ infoFeedCurrentRun.agent.error }}
                        </div>
                        <div v-if="infoFeedAgentAnswer" class="info-feed-agent-answer">
                          {{ truncateInfoFeedText(infoFeedAgentAnswer, 520) }}
                        </div>
                      </div>
                    </article>
                  </div>

                  <section v-if="infoFeedNeedsModelSelection" class="info-feed-model-pause">
                    <div>
	                      <h3>需要选择可用智能体</h3>
                      <p>{{ infoFeedModelSelectionMessage }}</p>
                    </div>
                    <AgentModelOptionBar
                      data-config-target="info-feed-summary-agent"
                      :data-config-highlighted="highlightedConfigTarget === 'info-feed-summary-agent'"
	                      v-model="infoFeedForm.modelAlias"
	                      label="智能体"
	                      placeholder="未分配智能体"
	                      :options="infoFeedModelOptions"
	                    />
                    <button
                      class="primary-action"
                      type="button"
                      :disabled="!selectedInfoFeedModel.enabled"
                      @click="continueInfoFeedAfterModelSelection"
                    >
                      继续
                    </button>
                  </section>

                  <section v-if="infoFeedNeedsRetryContinue" class="info-feed-model-pause info-feed-retry-pause">
                    <div>
                      <h3>{{ infoFeedRetryStageLabel(infoFeedCurrentRun?.pausedForRetry) }}请求中断</h3>
                      <p>{{ infoFeedRetryMessage }}</p>
                    </div>
                    <button
                      class="primary-action"
                      type="button"
                      :disabled="infoFeedCurrentRun?.summary.status === 'running'"
                      @click="continueInfoFeedAfterRetry"
                    >
                      继续
                    </button>
                  </section>

                  <section v-if="infoFeedReadyForSummary" class="info-feed-summary-filter">
                    <div class="info-feed-summary-header">
                      <div>
                        <h3>知识归纳</h3>
                        <span>融合原文检索、智能规划和附件处理结果</span>
                      </div>
                      <StatusPill
                        :tone="infoFeedStatusTone(infoFeedCurrentRun.summary.status)"
                        :label="`总结${infoFeedStatusLabel(infoFeedCurrentRun.summary.status)}`"
                      />
                    </div>
                    <div class="info-feed-summary-main">
                      <div class="info-feed-summary-meta" aria-label="总结运行参数">
	                        <span><strong>总结智能体</strong>{{ infoFeedSummaryRuntime.model }}</span>
                        <span><strong>temperature</strong>{{ infoFeedSummaryRuntime.temperature }}</span>
                        <span><strong>max_tokens</strong>{{ infoFeedSummaryRuntime.maxTokens }}</span>
                      </div>
                      <button
                        class="tool-button compact-action"
                        type="button"
                        :disabled="infoFeedCurrentRun.summary.status === 'running'"
                        @click="runInfoFeedSummaryAgent()"
                      >
                        重新总结
                      </button>
                    </div>
                    <div
                      v-if="infoFeedExpertFeedbackFor('summary').length"
                      class="info-feed-expert-feedback-list"
                    >
                      <article
                        v-for="feedbackItem in infoFeedExpertFeedbackFor('summary')"
                        :key="feedbackItem.feedbackId"
                        class="info-feed-expert-feedback"
                        :data-sync="feedbackItem.syncStatus"
                      >
                        <div>
                          <strong>人类专家意见</strong>
                          <span>{{ feedbackItem.selectedLabel }}</span>
                        </div>
                        <p>{{ feedbackItem.prompt }}</p>
                        <small>{{ feedbackItem.followUpQuestion }}</small>
                      </article>
                    </div>
                  </section>

                  <article
                    v-if="infoFeedCurrentRun.summary.answer || infoFeedCurrentRun.summary.status === 'running'"
                    class="info-feed-final-card"
                  >
                    <div class="compact-section-header">
                      <h3>输出报告</h3>
                      <div class="agent-result-actions">
                        <span v-if="infoFeedCurrentRun.summary.fallback">兜底摘要</span>
                        <button
                          class="tool-button tool-button-ghost compact-action"
                          type="button"
                          :disabled="!infoFeedSummaryMarkdown"
                          @click="copyInfoFeedSummary"
                        >
                          <svg class="button-inline-icon" viewBox="0 0 24 24" aria-hidden="true">
                            <rect x="9" y="9" width="13" height="13" rx="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          复制
                        </button>
                        <button
                          class="tool-button compact-action"
                          type="button"
                          :disabled="!infoFeedSummaryMarkdown"
                          @click="exportInfoFeedSummary"
                        >
                          导出 Markdown
                        </button>
                      </div>
                    </div>
                    <div v-if="infoFeedCurrentRun.summary.status === 'running'" class="info-feed-summary-running">
                      <span>总结智能体正在融合两路结果。</span>
                      <div class="info-feed-progress-track">
                        <span :style="{ width: `${infoFeedCurrentRun.summary.progress}%` }"></span>
                      </div>
                    </div>
                    <SafeHtmlBlock
                      v-else
                      class="evidence-rendered-content info-feed-summary-content"
                      :data-streaming="infoFeedSummaryIsStreaming"
                      :html="infoFeedStreamingSummaryHtml"
                      source="markdownToSafeHtml"
                      @click="handleAgentAnswerClick"
                    />
                    <p v-if="infoFeedCurrentRun.summary.error" class="module-note danger-note">
                      {{ infoFeedCurrentRun.summary.error }}
                    </p>
                    <div
                      v-if="infoFeedExpertFeedbackFor('report').length"
                      class="info-feed-expert-feedback-list"
                    >
                      <article
                        v-for="feedbackItem in infoFeedExpertFeedbackFor('report')"
                        :key="feedbackItem.feedbackId"
                        class="info-feed-expert-feedback"
                        :data-sync="feedbackItem.syncStatus"
                      >
                        <div>
                          <strong>人类专家意见</strong>
                          <span>{{ feedbackItem.selectedLabel }}</span>
                        </div>
                        <p>{{ feedbackItem.prompt }}</p>
                        <small>{{ feedbackItem.followUpQuestion }}</small>
                      </article>
                    </div>
                  </article>

                  <section
                    v-if="infoFeedClarification?.options.length"
                    class="info-feed-clarification-card info-feed-clarification-inline"
                  >
                    <div class="info-feed-summary-header">
                      <div>
                        <h3>需要确认</h3>
                        <span>{{ infoFeedClarification.reason || "选择一个方向继续。" }}</span>
                      </div>
                      <StatusPill
                        :tone="infoFeedClarification.status === 'answered' ? 'success' : 'warning'"
                        :label="infoFeedClarification.status === 'answered' ? '已选择' : '待选择'"
                      />
                    </div>
                    <p>{{ infoFeedClarification.prompt }}</p>
                    <div class="info-feed-clarification-options">
                      <button
                        v-for="option in infoFeedClarification.options"
                        :key="option.optionId"
                        class="info-feed-clarification-option"
                        type="button"
                        :data-selected="infoFeedClarification.selectedOptionId === option.optionId"
                        :disabled="infoFeedCurrentRun?.summary.status === 'running'"
                        @click="chooseInfoFeedClarification(option)"
                      >
                        <strong>{{ option.label }}</strong>
                        <span>{{ option.description || option.followUpQuestion }}</span>
                      </button>
                    </div>
                  </section>
                </div>
              </div>

              <div class="info-feed-dialog-divider" aria-hidden="true"></div>

              <div class="info-feed-input-stack">
                <form class="info-feed-input-dock" @submit.prevent="runInfoFeed">
                  <div v-if="infoFeedAttachments.length" class="info-feed-attachment-chips">
                    <span
                      v-for="attachment in infoFeedAttachments"
                      :key="attachment.id"
                      class="info-feed-attachment-chip"
                      :data-tone="infoFeedStatusTone(attachment.status)"
                    >
                      {{ attachment.name }}
                      <small>{{ infoFeedStatusLabel(attachment.status) }}</small>
                      <button type="button" @click="removeInfoFeedAttachment(attachment.id)">×</button>
                    </span>
                  </div>
                  <textarea
                    v-model="infoFeedForm.query"
                    rows="4"
                    :placeholder="infoFeedInputPlaceholder"
                  ></textarea>
                  <div class="info-feed-input-actions">
                    <BrowseSelectButton
                      kind="local-files"
                      button-class="tool-button tool-button-ghost info-feed-attachment-button"
                      button-text="附件"
                      :multiple="true"
                      @select="handleInfoFeedAttachmentFiles"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 1 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                      附件
                    </BrowseSelectButton>
                    <button
                      class="tool-button tool-button-ghost info-feed-advanced-button"
                      type="button"
                      @click="openInfoFeedAdvancedOptions"
                    >
                      高级选项
                    </button>
                    <AgentModelOptionBar
	                      v-model="infoFeedForm.modelAlias"
	                      label="智能体"
	                      placeholder="未分配智能体"
	                      :options="infoFeedModelOptions"
	                    />
                    <button
                      class="primary-action"
                      type="submit"
                      :disabled="!infoFeedForm.query.trim() || !selectedInfoFeedModel.enabled || infoFeedCurrentRun?.summary.status === 'running'"
                    >
                      {{ infoFeedSubmitLabel }}
                    </button>
                  </div>
                </form>
              </div>
            </div>
            <div
              v-if="infoFeedAdvancedOptionsOpen"
              class="info-feed-advanced-backdrop"
              @click.self="closeInfoFeedAdvancedOptions"
            >
              <section
                class="info-feed-advanced-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="info-feed-advanced-title"
              >
                <header class="info-feed-advanced-header">
                  <div>
                    <h3 id="info-feed-advanced-title">高级选项</h3>
                    <span>配置用于信息流智能检索、知识融合和总结前置检索的默认参数。</span>
                  </div>
                  <button
                    class="dialog-close-button"
                    type="button"
                    aria-label="关闭"
                    title="关闭"
                    @click="closeInfoFeedAdvancedOptions"
                  >
                    ×
                  </button>
                </header>
                <form class="drawer-panel info-feed-advanced-form" @submit.prevent="saveSettings">
                  <label>
                    <span>系统提示词</span>
                    <textarea v-model="settingsDraft.agentExploreDefaults.systemPrompt" rows="5" spellcheck="false"></textarea>
                  </label>
                  <label>
                    <span>工具策略提示词</span>
                    <textarea v-model="settingsDraft.agentExploreDefaults.toolPolicyPrompt" rows="4" spellcheck="false"></textarea>
                  </label>
                  <label>
                    <span>继续轮次提示词</span>
                    <textarea v-model="settingsDraft.agentExploreDefaults.continuationPrompt" rows="3" spellcheck="false"></textarea>
                  </label>
                  <label>
                    <span>答案模板</span>
                    <textarea v-model="settingsDraft.agentExploreDefaults.answerTemplate" rows="14" spellcheck="false"></textarea>
                  </label>
                  <div class="form-grid compact-form-grid">
                    <OptionBar
                      v-model="settingsDraft.agentExploreDefaults.contextProfileId"
                      label="上下文窗口"
                      :options="contextWindowOptionBarOptions"
                    />
                    <OptionBar
                      v-model="settingsDraft.agentExploreDefaults.thinkingMode"
                      label="Thinking"
                      :options="thinkingModeOptionBarOptions"
                    />
                    <label>
                      <span>temperature</span>
                      <input v-model.number="settingsDraft.agentExploreDefaults.temperature" type="number" min="0" max="2" step="0.1" />
                    </label>
                    <label>
                      <span>max_tokens</span>
                      <input v-model.number="settingsDraft.agentExploreDefaults.maxTokens" type="number" min="128" step="128" />
                    </label>
                    <label>
                      <span>默认循环轮数</span>
                      <input v-model.number="settingsDraft.agentExploreDefaults.maxIterations" type="number" min="1" max="8" />
                    </label>
                    <label>
                      <span>默认每次召回</span>
                      <input v-model.number="settingsDraft.agentExploreDefaults.limit" type="number" min="1" max="20" />
                    </label>
                    <label>
                      <span>tool_choice</span>
                      <input v-model="settingsDraft.agentExploreDefaults.toolChoice" autocomplete="off" />
                    </label>
                  </div>
                  <ConfigFoldCard title="知识融合智能体" open>
                    <div class="form-grid compact-form-grid">
                      <AgentModelOptionBar
                        v-model="settingsDraft.agentExploreDefaults.reviewFusionModelAlias"
                        label="智能体"
                        placeholder="未分配智能体"
                        include-empty
                        :options="agentSelectorOptions"
                      />
                      <label>
                        <span>temperature</span>
                        <input
                          v-model.number="settingsDraft.agentExploreDefaults.reviewFusionTemperature"
                          type="number"
                          min="0"
                          max="2"
                          step="0.1"
                        />
                      </label>
                      <label>
                        <span>max_tokens</span>
                        <input
                          v-model.number="settingsDraft.agentExploreDefaults.reviewFusionMaxTokens"
                          type="number"
                          min="128"
                          step="128"
                        />
                      </label>
                    </div>
                    <label>
                      <span>融合提示词</span>
                      <textarea
                        v-model="settingsDraft.agentExploreDefaults.reviewFusionSystemPrompt"
                        rows="4"
                        spellcheck="false"
                      ></textarea>
                    </label>
                  </ConfigFoldCard>
                  <div class="source-actions">
                    <button class="tool-button" type="submit" :disabled="busyKey === 'settings'">
                      {{ busyKey === "settings" ? "保存中" : "保存高级选项" }}
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </section>
</template>
