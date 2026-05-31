<script setup lang="ts">
import AgentModelOptionBar from "../AgentModelOptionBar.vue";
import BrowseSelectButton from "../BrowseSelectButton.vue";
import StatusPill from "../StatusPill.vue";
import { useKnowledgeViewContext } from "../../composables/knowledgeViewContext";

const {
  addChildWordCloud,
  addManualWordCloud,
  addTermActionToCloud,
  addTermInputToCloud,
  autoFillCloudWithAgent,
  busyKey,
  canBrowseServerPaths,
  canWriteKnowledge,
  clearRemovedTermsFromCloud,
  clearWordCloudCorpusPaths,
  collapsedWordBagIds,
  expandedAdvancedIds,
  expandedSummaryIds,
  fillingWordBagIds,
  formatMachineDate,
  formatWordCloudThreshold,
  jumpToCloud,
  openWordCloudCorpusDirectoryPicker,
  openWordCloudCorpusFilePicker,
  pinWordCloud,
  pinnedWordBagIds,
  proposeWordCloud,
  removeTermFromCloud,
  removeWordCloudCorpusPath,
  saveWordCloud,
  selectWordCloud,
  selectedWordCloud,
  selectedWordCloudModel,
  setWordCloudTermInput,
  titleFocusedWordBagId,
  toggleAdvancedExpanded,
  toggleSummaryExpanded,
  toggleWordCloudActionMenu,
  toggleWordCloudCollapsed,
  updateWordCloudField,
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
  wordCloudState,
  wordCloudTermInputs,
  wordCloudTerms,
  wordCloudVisibleTerms,
} = useKnowledgeViewContext();
</script>

<template>
  <article class="surface-card word-cloud-stage">
    <div class="section-header">
      <div>
        <h3>词云</h3>
        <p>{{ wordCloudDraft?.title || "语料词云" }} · {{ wordCloudTerms.length }} 个语料词 · {{ wordCloudCardRows.length }} 张卡片</p>
      </div>
      <div class="source-actions">
        <BrowseSelectButton
          kind="server-directory"
          button-class="tool-button tool-button-ghost"
          button-text="浏览目录"
          :disabled="!canBrowseServerPaths || busyKey === 'knowledge:word-clouds:scope'"
          @browse="openWordCloudCorpusDirectoryPicker"
        />
        <BrowseSelectButton
          kind="server-file"
          button-class="tool-button tool-button-ghost"
          button-text="浏览文件"
          :disabled="!canBrowseServerPaths || busyKey === 'knowledge:word-clouds:scope'"
          @browse="openWordCloudCorpusFilePicker"
        />
        <button class="tool-button" type="button" @click="addManualWordCloud">
          新增词云
        </button>
        <button
          class="primary-action"
          type="button"
          :disabled="!canWriteKnowledge || busyKey === 'knowledge:word-clouds:save'"
          @click="saveWordCloud"
        >
          {{ busyKey === "knowledge:word-clouds:save" ? "保存中" : "保存" }}
        </button>
      </div>
    </div>

    <div class="word-cloud-corpus-scope">
      <div>
        <strong>语料范围</strong>
        <span v-if="wordCloudCorpusPathSummary">{{ wordCloudCorpusPathSummary }}</span>
      </div>
      <div v-if="wordCloudCorpusPaths.length" class="word-cloud-corpus-path-list">
        <span
          v-for="(item, index) in wordCloudCorpusPaths"
          :key="`${item.type}:${item.path}`"
          class="word-cloud-corpus-path"
        >
          <em>{{ wordCloudCorpusPathLabel(item) }}</em>
          <span>{{ item.path }}</span>
          <button type="button" aria-label="移除语料路径" @click="removeWordCloudCorpusPath(index)">×</button>
        </span>
        <button class="inline-link" type="button" @click="clearWordCloudCorpusPaths">
          清空
        </button>
      </div>
    </div>

    <div
      class="word-cloud-architecture"
      :class="{ 'is-empty': wordCloudState !== null && wordCloudCardRows.length === 0 }"
    >
      <div class="word-cloud-card-list" role="list" aria-label="词云分类卡片">
        <article
          v-for="(row, index) in wordCloudCardRows"
          :key="row.cloud.wordBagId"
          class="word-cloud-class-card"
          :class="{ active: selectedWordCloud?.wordBagId === row.cloud.wordBagId }"
          :style="wordCloudCardStyle(row, index)"
          :data-word-bag-id="row.cloud.wordBagId"
          role="listitem"
          @click="selectWordCloud(row.cloud); toggleWordCloudCollapsed(row.cloud.wordBagId)"
        >
          <header class="word-cloud-card-header">
            <div class="word-cloud-title-wrap">
              <input
                class="word-cloud-card-title-input"
                :class="{ 'has-confirm': titleFocusedWordBagId === row.cloud.wordBagId && selectedWordCloudModel.enabled && !fillingWordBagIds.has(row.cloud.wordBagId) }"
                :value="row.cloud.label"
                type="text"
                autocomplete="off"
                placeholder="未命名词袋"
                @click.stop
                @focus="titleFocusedWordBagId = row.cloud.wordBagId"
                @blur="titleFocusedWordBagId = null"
                @input="updateWordCloudField(row.cloud.wordBagId, 'label', ($event.target as HTMLInputElement).value)"
              />
              <span v-if="fillingWordBagIds.has(row.cloud.wordBagId)" class="word-cloud-title-filling" title="智能体正在填充词云…">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="word-cloud-title-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
              </span>
              <button
                v-else-if="titleFocusedWordBagId === row.cloud.wordBagId && selectedWordCloudModel.enabled"
                class="word-cloud-title-confirm-btn"
                type="button"
                title="调用智能体填充相关词汇"
                aria-label="填充词汇"
                @mousedown.prevent
                @click.stop="autoFillCloudWithAgent(row.cloud.wordBagId)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 2a10 10 0 0 1 7.38 16.8"/>
                  <polyline points="16 12 12 8 8 12"/>
                  <line x1="12" y1="8" x2="12" y2="16"/>
                </svg>
              </button>
            </div>
            <div class="word-cloud-card-corner-actions" @click.stop>
              <button
                class="word-cloud-corner-btn"
                type="button"
                :class="{ active: pinnedWordBagIds.has(row.cloud.wordBagId) }"
                :title="pinnedWordBagIds.has(row.cloud.wordBagId) ? '取消置顶' : '置顶此词云'"
                :aria-label="pinnedWordBagIds.has(row.cloud.wordBagId) ? '取消置顶' : '置顶'"
                @click="pinWordCloud(row.cloud.wordBagId)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <line x1="12" y1="17" x2="12" y2="22"/>
                  <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
                </svg>
              </button>
              <div class="word-cloud-header-add-wrap">
                <button
                  class="word-cloud-corner-btn word-cloud-corner-add-btn"
                  type="button"
                  title="新增"
                  aria-label="新增"
                  @click.stop="toggleWordCloudActionMenu(row.cloud.wordBagId)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
                <div
                  v-if="wordBagActionMenuId === row.cloud.wordBagId"
                  class="word-cloud-action-popover"
                  @click.stop
                >
                  <button type="button" @click="addChildWordCloud(row.cloud.wordBagId)">新增分组</button>
                  <button type="button" @click="addTermActionToCloud(row.cloud.wordBagId)">新增词语</button>
                </div>
              </div>
              <button
                class="word-cloud-corner-btn"
                type="button"
                :aria-label="collapsedWordBagIds.has(row.cloud.wordBagId) ? '展开词云' : '收起词云'"
                :title="collapsedWordBagIds.has(row.cloud.wordBagId) ? '展开' : '收起'"
                @click="toggleWordCloudCollapsed(row.cloud.wordBagId)"
              >
                <svg v-if="collapsedWordBagIds.has(row.cloud.wordBagId)" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="18 15 12 9 6 15"/>
                </svg>
              </button>
            </div>
          </header>
          <div class="word-cloud-card-tag-bar" @click.stop>
            <span class="word-cloud-meta-badge">{{ row.cloud.terms.length }} 词汇</span>
            <template v-if="row.cloud.children?.length">
              <span class="word-cloud-meta-sep">·</span>
              <span class="word-cloud-meta-badge">{{ row.cloud.children.length }} 分组</span>
              <button
                v-for="child in row.cloud.children"
                :key="child.wordBagId"
                class="word-cloud-child-tag"
                type="button"
                @click.stop="jumpToCloud(child.wordBagId)"
              >{{ child.label || '未命名' }}</button>
            </template>
          </div>
          <div class="word-cloud-card-body" v-show="!collapsedWordBagIds.has(row.cloud.wordBagId)" @click.stop>
            <div class="word-cloud-summary-toggle" @click.stop="toggleAdvancedExpanded(row.cloud.wordBagId)">
              <span>高级参数</span>
              <svg
                class="word-cloud-summary-chevron"
                :class="{ expanded: expandedAdvancedIds.has(row.cloud.wordBagId) }"
                xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            <div class="word-cloud-summary-body" v-show="expandedAdvancedIds.has(row.cloud.wordBagId)">
              <label class="word-cloud-field word-cloud-threshold-field">
                <span>吸附阈值</span>
                <input
                  :value="formatWordCloudThreshold(row.cloud.absorbThreshold)"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  inputmode="decimal"
                  @input="updateWordCloudField(row.cloud.wordBagId, 'absorbThreshold', ($event.target as HTMLInputElement).value)"
                />
                <small>越高越保守，越低越容易自动吸词。</small>
              </label>
            </div>
            <div class="word-cloud-summary-toggle" @click.stop="toggleSummaryExpanded(row.cloud.wordBagId)">
              <span>分组说明</span>
              <svg
                class="word-cloud-summary-chevron"
                :class="{ expanded: expandedSummaryIds.has(row.cloud.wordBagId) }"
                xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            <div class="word-cloud-summary-body" v-show="expandedSummaryIds.has(row.cloud.wordBagId)">
              <textarea
                class="word-cloud-card-summary"
                :value="row.cloud.summary || ''"
                rows="3"
                placeholder="用一句话描述这个分组的用途，让智能体更准确地使用它。"
                @click.stop
                @input="updateWordCloudField(row.cloud.wordBagId, 'summary', ($event.target as HTMLTextAreaElement).value)"
              />
            </div>
            <div class="word-cloud-term-list">
              <div
                v-for="term in wordCloudVisibleTerms(row.cloud)"
                :key="`${row.cloud.wordBagId}:${term.removed ? 'removed' : 'active'}:${term.term}`"
                class="word-cloud-term-row"
                :class="{ removed: term.removed }"
              >
                <div class="word-cloud-term-label">
                  <span>{{ term.term }}</span>
                  <small>{{ term.frequency || 0 }}</small>
                </div>
                <button
                  v-if="!term.removed"
                  class="word-cloud-term-remove"
                  type="button"
                  title="移除"
                  @click.stop="removeTermFromCloud(row.cloud.wordBagId, term)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </div>
            </div>
            <div class="word-cloud-inline-add">
              <div class="word-cloud-inline-field">再加一个词</div>
              <input
                placeholder="直接输入词"
                :value="wordCloudTermInputs[row.cloud.wordBagId] || ''"
                type="text"
                autocomplete="off"
                @input="setWordCloudTermInput(row.cloud.wordBagId, ($event.target as HTMLInputElement).value)"
                @keydown.enter.prevent="addTermInputToCloud(row.cloud.wordBagId)"
              />
              <button class="tool-button compact-action" type="button" @click.stop="addTermInputToCloud(row.cloud.wordBagId)">
                加入词袋
              </button>
              <button
                v-if="row.cloud.removedTerms?.length"
                class="tool-button tool-button-ghost compact-action"
                type="button"
                @click.stop="clearRemovedTermsFromCloud(row.cloud.wordBagId)"
              >
                清理已移除
              </button>
            </div>
          </div>
        </article>
        <div v-if="wordCloudState === null && wordCloudCardRows.length === 0" class="word-cloud-loading">
          <svg class="word-cloud-loading-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          <span>正在加载词袋…</span>
        </div>
        <div v-else-if="wordCloudCardRows.length === 0" class="empty-state word-cloud-empty">
          <strong>暂无词袋</strong>
        </div>
      </div>
    </div>
  </article>

  <section class="word-cloud-lower-grid">
    <form class="info-feed-input-dock word-cloud-dialog" @submit.prevent="proposeWordCloud">
      <div class="section-header compact-section-header">
        <div>
          <h3>智能体分组</h3>
        </div>
        <StatusPill
          :tone="selectedWordCloudModel.enabled ? 'success' : 'warning'"
          :label="selectedWordCloudModel.enabled ? '可调用' : '未就绪'"
        />
      </div>
      <textarea
        v-model="wordCloudPrompt"
        spellcheck="false"
      />
      <div class="word-cloud-dialog-controls">
        <AgentModelOptionBar
          v-model="wordCloudModelAlias"
          class="word-cloud-agent-select"
          placeholder=""
          :options="wordCloudModelOptions"
        />
        <button
          class="primary-action word-cloud-agent-submit"
          type="submit"
          :disabled="!canWriteKnowledge || !selectedWordCloudModel.enabled || busyKey === 'knowledge:word-clouds:propose'"
        >
          {{ busyKey === "knowledge:word-clouds:propose" ? "启动中" : "启动分类任务" }}
        </button>
      </div>
      <div class="word-cloud-message-list">
        <article
          v-for="message in wordCloudMessages"
          :key="message.id"
          class="word-cloud-message"
          :data-role="message.role"
        >
          <strong>{{ message.role === "agent" ? "智能体" : message.role === "user" ? "人工监督" : "系统" }}</strong>
          <span>{{ formatMachineDate(message.at, "compact") }}</span>
          <p>{{ message.text }}</p>
        </article>
      </div>
    </form>
  </section>
</template>
