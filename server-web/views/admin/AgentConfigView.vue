<script setup lang="ts">
import { useConsole } from '../../composables/useConsole';
import AgentModelOptionBar from '../../components/AgentModelOptionBar.vue';
import BinaryCheckbox from '../../components/BinaryCheckbox.vue';
import ConfigFoldCard from '../../components/ConfigFoldCard.vue';
import OptionBar from '../../components/OptionBar.vue';
import StatusPill from '../../components/StatusPill.vue';
const {
  addModelProvider,
  addableModelProviderOptionBarOptions,
  adminView,
  agentExploreForm,
  agentExploreThinkingParameters,
  agentPermissionGroupOptionBarOptions,
  agentSelectorOptions,
  beginCodexOAuthLogin,
  busyKey,
  codexOAuthStatus,
  contextBuildRecordRows,
  contextEvaluationResult,
  contextPreviewRequiredEvidence,
  contextPreviewResult,
  contextPreviewTask,
  contextProfileRows,
  contextWindowOptionBarOptions,
  currentView,
  duplicateModelEntry,
  exportAgentModelEntryConfig,
  exportContextBuildRecords,
  filter,
  formatCompactDate,
  hasFeature,
  highlightedConfigTarget,
  intelligentModuleDefinitions,
  isAuthenticated,
  isModelLibraryCardExpanded,
  jsonPreview,
  modelEntryBindingSummary,
  modelEntryBindings,
  modelEntryIsBound,
  modelEntryModuleAccess,
  modelEntryProbeResult,
  modelEntryProbeStatusLabel,
  modelEntryProbeStatusTone,
  modelEntryStatusKey,
  modelLibrarySaveProbeNotices,
  modelProbeResults,
  modelProviderDefinition,
  moduleAccessModeOptionBarOptions,
  previewContextCompiler,
  probeModelEntry,
  providerLabel,
  refreshContextCompiler,
  removeModelProvider,
  runContextReplayEvaluation,
  saveModelLibrarySettings,
  saveSettings,
  selectedAgentExploreContextProfile,
  selectedAgentExploreThinkingMode,
  selectedModelProvider,
  setModelEntryModuleAccessMode,
  setModelEntryPermissionGroup,
  settingsDraft,
  thinkingModeOptionBarOptions,
  toggleModelEntryModuleAccess,
  toggleModelLibraryCard,
  visibleModelEntries,
} = useConsole();
</script>

<template>
          <section class="agent-config-layout">
            <article
              class="surface-card"
              data-config-target="agent-model-library"
              :data-config-highlighted="highlightedConfigTarget === 'agent-model-library'"
            >
              <form class="drawer-panel" @submit.prevent="saveModelLibrarySettings">
                <div class="section-header">
                  <div>
                    <h3>模型库</h3>
                    <p>新增需要使用的模型后填写授权，并可直接探测连通性。</p>
                  </div>
                </div>

                <div class="model-library-toolbar">
                  <OptionBar
                    v-model="selectedModelProvider"
                    :options="addableModelProviderOptionBarOptions"
                  />
                  <button
                    class="tool-button"
                    type="button"
                    @click="addModelProvider"
                  >
                    新增模型
                  </button>
                </div>

                <p v-if="visibleModelEntries.length === 0" class="empty-note">
                  当前模型库为空。
                </p>

                <div v-else class="model-library-list">
                  <section
                    v-for="entry in visibleModelEntries"
                    :key="entry.instanceId"
                    class="model-library-card"
                    :data-expanded="isModelLibraryCardExpanded(entry) ? 'true' : 'false'"
                  >
                    <button
                      class="model-library-card-toggle"
                      type="button"
                      :aria-expanded="isModelLibraryCardExpanded(entry) ? 'true' : 'false'"
                      :aria-label="`${entry.label || modelEntryStatusKey(entry)} ${isModelLibraryCardExpanded(entry) ? '收起配置' : '展开配置'}`"
                      :title="isModelLibraryCardExpanded(entry) ? '收起配置' : '展开配置'"
                      @click="toggleModelLibraryCard(entry)"
                    >
                      <div class="model-library-card-header">
                        <div>
                          <strong>{{ entry.label || modelEntryStatusKey(entry) }}</strong>
                          <small>{{ modelProviderDefinition(entry.provider)?.label || providerLabel(entry.provider) }} / {{ entry.model || modelEntryStatusKey(entry) }}</small>
                        </div>
                        <div class="model-library-card-statuses">
                          <StatusPill
                            v-if="modelEntryIsBound(entry)"
                            tone="info"
                            label="已绑定"
                          />
                          <StatusPill
                            v-if="modelEntryProbeResult(entry)"
                            :tone="modelEntryProbeStatusTone(entry)"
                            :label="modelEntryProbeStatusLabel(entry)"
                          />
                        </div>
                      </div>
                      <span
                        class="model-library-expand-icon"
                        :data-expanded="isModelLibraryCardExpanded(entry)"
                        aria-hidden="true"
                      >
                        <span />
                      </span>
                    </button>

                    <div class="model-library-summary-row">
                      <div class="model-library-uid">
                        <span>UID</span>
                        <code>{{ modelEntryStatusKey(entry) }}</code>
                      </div>

                      <div class="model-library-card-actions">
                        <button class="tool-button tool-button-ghost compact-action" type="button" :disabled="busyKey === `model-probe:${modelEntryStatusKey(entry)}`" @click.stop="probeModelEntry(entry)">
                          {{ busyKey === `model-probe:${modelEntryStatusKey(entry)}` ? "探测中" : "探测" }}
                        </button>
                        <button class="tool-button tool-button-ghost compact-action" type="button" @click.stop="exportAgentModelEntryConfig(entry)">
                          导出
                        </button>
                        <button class="tool-button tool-button-ghost compact-action" type="button" @click.stop="duplicateModelEntry(entry)">
                          复制
                        </button>
                        <button
                          class="inline-link"
                          type="button"
                          :disabled="busyKey === `model-remove:${modelEntryStatusKey(entry)}` || modelEntryIsBound(entry)"
                          :title="modelEntryIsBound(entry) ? `已绑定到 ${modelEntryBindingSummary(entry)}，请先解除引用。` : ''"
                          @click.stop="removeModelProvider(entry)"
                        >
                          {{
                            busyKey === `model-remove:${modelEntryStatusKey(entry)}`
                              ? "移除中"
                              : "移除"
                          }}
                        </button>
                      </div>
                    </div>

                    <p v-if="modelProbeResults[modelEntryStatusKey(entry)]" class="model-probe-result" :data-ok="modelProbeResults[modelEntryStatusKey(entry)].ok ? 'true' : 'false'">
                      {{ modelProbeResults[modelEntryStatusKey(entry)].message }}
                      <small>
                        {{ modelProbeResults[modelEntryStatusKey(entry)].latencyMs }}ms
                        <template v-if="modelProbeResults[modelEntryStatusKey(entry)].statusCode">
                          / HTTP {{ modelProbeResults[modelEntryStatusKey(entry)].statusCode }}
                        </template>
                      </small>
                    </p>
                    <p
                      v-if="modelLibrarySaveProbeNotices[modelEntryStatusKey(entry)]"
                      class="model-library-save-notice"
                    >
                      {{ modelLibrarySaveProbeNotices[modelEntryStatusKey(entry)] }}
                    </p>

                    <div v-if="isModelLibraryCardExpanded(entry)" class="model-library-card-body">
                      <div class="form-grid compact-form-grid">
                        <label>
                          <span>智能体名称</span>
                          <input v-model="entry.label" autocomplete="off" />
                        </label>
                        <label>
                          <span>模型 ID</span>
                          <input v-model="entry.model" autocomplete="off" />
                        </label>
                      </div>

                      <template v-if="entry.provider === 'google-gemini'">
                        <label>
                          <span>Google API Key</span>
                          <input v-model="settingsDraft.googleApiKey" type="password" autocomplete="off" placeholder="留空则保留当前已配置 Key" />
                        </label>
                      </template>

                      <template v-else-if="entry.provider === 'openai-chatgpt'">
                        <p class="form-hint">
                          {{
                            codexOAuthStatus?.valid
                              ? `已连接 ${codexOAuthStatus.email || "ChatGPT"}`
                              : codexOAuthStatus?.reason || "需要连接 Codex OAuth。"
                          }}
                        </p>
                        <button class="tool-button tool-button-ghost compact-action" type="button" :disabled="busyKey === 'codex-oauth'" @click="beginCodexOAuthLogin">
                          {{ busyKey === "codex-oauth" ? "等待中" : "连接 Codex" }}
                        </button>
                      </template>

                      <template v-else-if="entry.provider === 'openrouter'">
                        <label>
                          <span>Base URL</span>
                          <input v-model="settingsDraft.openRouterBaseUrl" autocomplete="off" />
                        </label>
                        <label>
                          <span>API Key</span>
                          <input v-model="settingsDraft.openRouterApiKey" type="password" autocomplete="off" placeholder="留空则保留当前已配置 Key" />
                        </label>
                      </template>

                      <template v-else-if="entry.provider === 'deepseek'">
                        <label>
                          <span>Base URL</span>
                          <input v-model="entry.baseUrl" autocomplete="off" />
                        </label>
                        <label>
                          <span>API Key</span>
                          <input v-model="entry.apiKey" type="password" autocomplete="off" placeholder="留空则保留当前已配置 Key" />
                        </label>
                        <label>
                          <span>Timeout(ms)</span>
                          <input v-model.number="entry.timeoutMs" type="number" min="1000" step="1000" />
                        </label>
                      </template>

                      <template v-else-if="entry.provider === 'copilot'">
                        <label>
                          <span>Endpoint</span>
                          <input v-model="settingsDraft.copilotEndpoint" autocomplete="off" />
                        </label>
                        <label>
                          <span>Access Token</span>
                          <input v-model="settingsDraft.copilotApiKey" type="password" autocomplete="off" placeholder="留空则保留当前已配置 Token" />
                        </label>
                      </template>

                      <template v-else-if="entry.provider === 'local-model'">
                        <label>
                          <span>Endpoint</span>
                          <input v-model="settingsDraft.localModelEndpoint" autocomplete="off" />
                        </label>
                      </template>

                      <template v-else-if="entry.provider === 'custom-http'">
                        <label>
                          <span>URL</span>
                          <input v-model="entry.url" autocomplete="off" />
                        </label>
                        <label>
                          <span>Token</span>
                          <input v-model="entry.token" autocomplete="off" type="password" placeholder="留空保持已保存 Token" />
                        </label>
                        <ConfigFoldCard title="高级连接参数">
                          <div class="form-grid compact-form-grid">
                            <label>
                              <span>Token Header</span>
                              <input v-model="entry.tokenHeader" autocomplete="off" />
                            </label>
                            <label>
                              <span>Token Prefix</span>
                              <input v-model="entry.tokenPrefix" autocomplete="off" />
                            </label>
                            <label>
                              <span>Timeout(ms)</span>
                              <input v-model.number="entry.timeoutMs" type="number" min="1000" step="1000" />
                            </label>
                          </div>
                        </ConfigFoldCard>
                      </template>

                      <ConfigFoldCard title="功能可见性与授权">
                        <label class="module-field">
                          <span>权限组</span>
                          <OptionBar
                            :model-value="entry.permissionGroupId || ''"
                            :options="agentPermissionGroupOptionBarOptions"
                            @update:model-value="setModelEntryPermissionGroup(entry, String($event))"
                          />
                        </label>
                        <OptionBar
                          :model-value="modelEntryModuleAccess(entry).mode"
                          label="开放范围"
                          :options="moduleAccessModeOptionBarOptions"
                          @update:model-value="setModelEntryModuleAccessMode(entry, String($event))"
                        />
                        <div
                          v-if="modelEntryModuleAccess(entry).mode === 'selected'"
                          class="model-library-module-access-list"
                        >
                          <BinaryCheckbox
                            v-for="moduleDefinition in intelligentModuleDefinitions"
                            :key="moduleDefinition.id"
                            :model-value="modelEntryModuleAccess(entry).moduleIds.includes(moduleDefinition.id)"
                            :label="moduleDefinition.label"
                            @update:model-value="toggleModelEntryModuleAccess(entry, moduleDefinition.id, Boolean($event))"
                          />
                        </div>
                        <p class="module-note">
                          没有授权给某个功能时，该功能的智能体选项中不会出现这个智能体。
                        </p>
                      </ConfigFoldCard>

                      <ConfigFoldCard
                        v-if="modelEntryIsBound(entry)"
                        class="model-library-bindings"
                        :title="`被引用的功能（${modelEntryBindings(entry).length}）`"
                      >
                        <div class="model-library-binding-list">
                          <article
                            v-for="binding in modelEntryBindings(entry)"
                            :key="binding.bindingId"
                            class="model-library-binding-item"
                          >
                            <div>
                              <strong>{{ binding.label }}</strong>
                              <span>{{ binding.category }}</span>
                            </div>
                            <p>{{ binding.detail }}</p>
                          </article>
                        </div>
                      </ConfigFoldCard>

                      <ConfigFoldCard title="智能体提示词与调用参数">
                        <label>
                          <span>系统提示词</span>
                          <textarea v-model="entry.systemPrompt" rows="5" autocomplete="off"></textarea>
                        </label>
                        <label>
                          <span>调用参数 JSON</span>
                          <textarea v-model="entry.parametersText" rows="6" spellcheck="false"></textarea>
                        </label>
                      </ConfigFoldCard>
                    </div>
                  </section>
                </div>

                <div class="source-actions model-library-save-actions">
                  <button class="tool-button" type="submit" :disabled="busyKey === 'model-library-save'">
                    {{ busyKey === "model-library-save" ? "探测并保存中" : "保存配置" }}
                  </button>
                </div>
              </form>
            </article>
            <article class="surface-card">
              <div class="drawer-panel">
                <div class="section-header">
                  <div>
                    <h3>上下文编译器</h3>
                    <p>每次调用无状态模型前，本地把记忆、证据、专家意见和工具状态编译成可审计 ContextPack。</p>
                  </div>
                  <div class="section-actions">
                    <button
                      class="tool-button tool-button-ghost compact-action"
                      type="button"
                      :disabled="busyKey === 'context:refresh'"
                      @click="refreshContextCompiler()"
                    >
                      {{ busyKey === "context:refresh" ? "刷新中" : "刷新" }}
                    </button>
                    <button
                      class="tool-button compact-action"
                      type="button"
                      :disabled="!contextBuildRecordRows.length"
                      @click="exportContextBuildRecords"
                    >
                      导出记录
                    </button>
                  </div>
                </div>

                <div class="context-profile-grid">
                  <article
                    v-for="profile in contextProfileRows"
                    :key="profile.profileId"
                    class="context-profile-card"
                  >
                    <div>
                      <strong>{{ profile.label || profile.profileId }}</strong>
                      <span>{{ profile.profileId }} · {{ profile.compressionMode }} · {{ profile.strategy }}</span>
                    </div>
                    <dl>
                      <div>
                        <dt>窗口</dt>
                        <dd>{{ profile.contextWindowTokens.toLocaleString() }}</dd>
                      </div>
                      <div>
                        <dt>知识</dt>
                        <dd>{{ profile.knowledgeBudget.toLocaleString() }}</dd>
                      </div>
                      <div>
                        <dt>历史</dt>
                        <dd>{{ profile.historyBudget.toLocaleString() }}</dd>
                      </div>
                      <div>
                        <dt>专家权重</dt>
                        <dd>{{ Math.round(profile.expertGuidanceRatio * 100) }}%</dd>
                      </div>
                    </dl>
                    <small>
                      保护字段：{{ profile.protectedEvidenceFields.slice(0, 6).join(", ") || "默认" }}
                    </small>
                    <small>
                      模型压缩：{{ profile.modelCompressionEnabled ? (profile.modelCompressionAlias || "已启用") : "关闭" }}
                    </small>
                  </article>
                  <div v-if="!contextProfileRows.length" class="empty-note">
                    尚未加载上下文 profile。
                  </div>
                </div>

                <div class="form-grid compact-form-grid">
                  <label class="full-row">
                    <span>预览任务</span>
                    <textarea v-model="contextPreviewTask" rows="3" spellcheck="false"></textarea>
                  </label>
                  <label>
                    <span>必须保留的 evidenceId</span>
                    <input v-model="contextPreviewRequiredEvidence" placeholder="ev_1, evidence::abc" autocomplete="off" />
                  </label>
                </div>
                <div class="source-actions">
                  <button
                    class="tool-button"
                    type="button"
                    :disabled="busyKey === 'context:preview'"
                    @click="previewContextCompiler"
                  >
                    {{ busyKey === "context:preview" ? "预览中" : "预览 ContextPack" }}
                  </button>
                  <button
                    class="tool-button tool-button-ghost"
                    type="button"
                    :disabled="busyKey === 'context:evaluation'"
                    @click="runContextReplayEvaluation"
                  >
                    {{ busyKey === "context:evaluation" ? "评估中" : "运行 Replay 评估" }}
                  </button>
                </div>

                <ConfigFoldCard v-if="contextPreviewResult" title="本轮上下文包" open>
                  <pre>{{ jsonPreview(contextPreviewResult) }}</pre>
                </ConfigFoldCard>
                <ConfigFoldCard v-if="contextEvaluationResult" title="Replay 评估结果" open>
                  <pre>{{ jsonPreview(contextEvaluationResult) }}</pre>
                </ConfigFoldCard>

                <ConfigFoldCard
                  title="最近上下文编译记录"
                  data-config-target="knowledge-review-fusion-agent"
                  :data-config-highlighted="highlightedConfigTarget === 'knowledge-review-fusion-agent'"
                  open
                >
                  <div class="context-build-record-list">
                    <article
                      v-for="record in contextBuildRecordRows"
                      :key="record.recordId"
                      class="context-build-record"
                    >
                      <div>
                        <strong>{{ record.profileId }}</strong>
                        <span>{{ formatCompactDate(record.createdAt) }} · {{ record.compressionMode }} · {{ record.triggerReason }}</span>
                      </div>
                      <small>
                        token {{ record.totalTokens.toLocaleString() }} / source {{ record.sourceTokens.toLocaleString() }}
                        · 保留证据 {{ record.preservedEvidenceIds.length }}
                        · 丢弃 {{ record.droppedKnowledgeCount }}
                        · 专家意见 {{ record.humanExpertGuidanceCount }}
                      </small>
                      <code>{{ record.recordId }}</code>
                    </article>
                    <div v-if="!contextBuildRecordRows.length" class="empty-note">
                      暂无上下文编译记录。
                    </div>
                  </div>
                </ConfigFoldCard>
              </div>
            </article>
            <article class="surface-card">
              <form class="drawer-panel" @submit.prevent="saveSettings">
                <div class="section-header">
                  <div>
                    <h3>智能检索参数</h3>
                    <p>这里公开智能检索实际传给模型的默认提示词、工具策略和调用参数。</p>
                  </div>
                </div>
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
                  <textarea v-model="settingsDraft.agentExploreDefaults.answerTemplate" rows="18" spellcheck="false"></textarea>
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
	                <ConfigFoldCard title="运行时变量">
	                  <pre>{{ jsonPreview({
	                    modelAlias: agentExploreForm.modelAlias,
                    contextProfileId: selectedAgentExploreContextProfile.value,
                    thinkingMode: selectedAgentExploreThinkingMode,
                    tools: ['knowledge_aggregate', 'keyword_search', 'open_evidence', 'http_request', 'local_command'],
                    stateMachine: ['model_calling', 'tool_selected', 'tool_calling', 'tool_result', 'completed', 'failed'],
	                    requestParameters: {
	                      ...agentExploreThinkingParameters(),
	                      temperature: settingsDraft.agentExploreDefaults.temperature,
	                      max_tokens: settingsDraft.agentExploreDefaults.maxTokens,
	                      max_iterations: settingsDraft.agentExploreDefaults.maxIterations,
	                      per_search_limit: settingsDraft.agentExploreDefaults.limit,
	                      tool_choice: settingsDraft.agentExploreDefaults.toolChoice,
	                      stream: false
	                    },
	                    reviewFusionAgent: {
	                      modelAlias: settingsDraft.agentExploreDefaults.reviewFusionModelAlias,
	                      temperature: settingsDraft.agentExploreDefaults.reviewFusionTemperature,
	                      max_tokens: settingsDraft.agentExploreDefaults.reviewFusionMaxTokens,
	                      systemPrompt: settingsDraft.agentExploreDefaults.reviewFusionSystemPrompt
	                    }
	                  }) }}</pre>
	                </ConfigFoldCard>
                <div class="source-actions">
                  <button class="tool-button" type="submit" :disabled="busyKey === 'settings'">
                    {{ busyKey === "settings" ? "保存中" : "保存智能检索参数" }}
                  </button>
                </div>
              </form>
            </article>
            <article class="surface-card">
              <form class="drawer-panel" @submit.prevent="saveSettings">
                <div class="section-header">
                  <div>
                    <h3>外层工具调用</h3>
                    <p>模型可输出 function call；服务端再按这里的 HTTP / 本地命令策略执行。命令使用 Node.js spawn，shell=false，跨平台。</p>
                  </div>
                </div>
                <div class="form-grid compact-form-grid">
                  <BinaryCheckbox
                    v-model="settingsDraft.agentToolExecution.http.enabled"
                    label="启用 HTTP 工具"
                  />
                  <label>
                    <span>HTTP 允许 Host（逗号分隔）</span>
                    <input
                      :value="settingsDraft.agentToolExecution.http.allowedHosts.join(', ')"
                      @input="settingsDraft.agentToolExecution.http.allowedHosts = String(($event.target as HTMLInputElement).value || '').split(',').map((item) => item.trim()).filter(Boolean)"
                    />
                  </label>
                  <label>
                    <span>HTTP Timeout(ms)</span>
                    <input v-model.number="settingsDraft.agentToolExecution.http.timeoutMs" type="number" min="1000" step="1000" />
                  </label>
                  <label>
                    <span>HTTP 最大响应字节</span>
                    <input v-model.number="settingsDraft.agentToolExecution.http.maxResponseBytes" type="number" min="1024" step="1024" />
                  </label>
                </div>
                <div class="form-grid compact-form-grid">
                  <BinaryCheckbox
                    v-model="settingsDraft.agentToolExecution.local.enabled"
                    label="启用本地命令工具"
                  />
                  <BinaryCheckbox
                    v-model="settingsDraft.agentToolExecution.local.allowDirectCommands"
                    label="允许直接命令"
                  />
                  <label>
                    <span>命令 Timeout(ms)</span>
                    <input v-model.number="settingsDraft.agentToolExecution.local.timeoutMs" type="number" min="1000" step="1000" />
                  </label>
                  <label>
                    <span>命令最大输出字节</span>
                    <input v-model.number="settingsDraft.agentToolExecution.local.maxOutputBytes" type="number" min="1024" step="1024" />
                  </label>
                </div>
                <ConfigFoldCard title="本地命令模板 JSON" open>
                  <textarea
                    :value="jsonPreview(settingsDraft.agentToolExecution.local.commands)"
                    rows="10"
                    spellcheck="false"
                    @change="settingsDraft.agentToolExecution.local.commands = JSON.parse(($event.target as HTMLTextAreaElement).value || '[]')"
                  ></textarea>
                </ConfigFoldCard>
                <ConfigFoldCard title="function call schema">
                  <pre>{{ jsonPreview({
                    http_request: {
                      method: 'GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS',
                      url: 'http://127.0.0.1:7228/api/tool-management/v1/execute',
                      headers: {},
                      query: {},
                      body: {},
                      timeoutMs: 30000
                    },
                    local_command: {
                      commandId: 'node-version',
                      args: [],
                      cwd: '',
                      stdin: '',
                      timeoutMs: 30000
                    }
                  }) }}</pre>
                </ConfigFoldCard>
                <div class="source-actions">
                  <button class="tool-button" type="submit" :disabled="busyKey === 'settings'">
                    {{ busyKey === "settings" ? "保存中" : "保存工具调用配置" }}
                  </button>
                </div>
              </form>
            </article>
          </section>
</template>
