<script setup lang="ts">
import { useConsole } from '../composables/useConsole';
import {
  AgentModelOptionBar,
  BinaryCheckbox,
  ConfigFoldCard,
  HistorySessionPanel,
  InfoFeedResultRow,
  OptionBar,
} from '../components/common';
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
  isAgentExploreDraftSession,
  isAuthenticated,
  jsonPreview,
  knowledgeConsole,
  knowledgeFusionSummary,
  knowledgeRecallDebugForm,
  knowledgeRecallDebugGridStyle,
  knowledgeRecallDebugParameterSummary,
  knowledgeRecallDebugRuns,
  knowledgeSourceState,
  knowledgeStatus,
  openAgentEvidencePreview,
  resetKnowledgeAgentExplore,
  retrievalModeOptionBarOptions,
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
</script>

<template>
          <section class="debug-panel-shell">
            <article v-if="debugTab === 'knowledgeRecall'" class="surface-card debug-panel-card knowledge-recall-debug-card">
              <div class="section-header">
                <div>
                  <h3>知识库召回</h3>
                  <p>只调试底层知识库召回，不调用大模型。适合对比 TopK、融合策略、学习开关和证据可读性。</p>
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
                <label>
                  <span>TopK 对比</span>
                  <input
                    v-model="knowledgeRecallDebugForm.topKValues"
                    type="text"
                    placeholder="10 20 30"
                  />
                </label>
                <OptionBar
                  v-model="knowledgeRecallDebugForm.retrievalMode"
                  label="召回模式"
                  :options="retrievalModeOptionBarOptions"
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
                  {{ busyKey === "debug:knowledge-recall" ? "批量召回中" : "批量对比召回" }}
                </button>
              </form>

              <div class="debug-parameter-summary">
                <strong>参数说明</strong>
                <span>{{ knowledgeRecallDebugParameterSummary }}</span>
              </div>

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

            <article v-if="debugTab === 'agentRetrieval'" class="surface-card agent-explore-card agent-explore-home debug-panel-card">
            <div class="section-header">
              <div>
                <h3>智能体检索</h3>
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
