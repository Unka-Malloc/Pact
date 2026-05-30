<script setup lang="ts">
import { useConsole } from '../../composables/useConsole';
import BinaryCheckbox from '../../components/BinaryCheckbox.vue';
import ConfigFoldCard from '../../components/ConfigFoldCard.vue';
import JsonConfigFileEditor from '../../components/JsonConfigFileEditor.vue';
import OptionBar from '../../components/OptionBar.vue';
import StatusPill from '../../components/StatusPill.vue';
import AgentConfigInvocationToggle from './AgentConfigInvocationToggle.vue';
const {
  addModelProvider,
  addableModelProviderOptionBarOptions,
  adminView,
  agentPermissionGroupOptionBarOptions,
  beginCodexOAuthLogin,
  busyKey,
  codexOAuthStatus,
  currentView,
  duplicateModelEntry,
  exportAgentModelEntryConfig,
  filter,
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
  modelProbeResults,
  modelProviderDefinition,
  moduleAccessModeOptionBarOptions,
  probeModelEntry,
  providerLabel,
  removeModelProvider,
  saveModelLibrarySettings,
  saveSettings,
  selectedModelProvider,
  setModelEntryModuleAccessMode,
  setModelEntryPermissionGroup,
  settingsDraft,
  toggleModelEntryModuleAccess,
  toggleModelLibraryCard,
  visibleModelEntries,
} = useConsole();

async function saveLocalCommandTemplates(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("本地命令模板必须是 JSON 数组。");
  }
  settingsDraft.value.agentToolExecution.local.commands = value as typeof settingsDraft.value.agentToolExecution.local.commands;
  await saveSettings();
}

async function saveFunctionCallSchema(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("function call schema 必须是 JSON 对象。");
  }
  settingsDraft.value.agentToolExecution.functionCallSchema = value as Record<string, unknown>;
  await saveSettings();
}
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
                          class="tool-button tool-button-ghost compact-action"
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
                      <span class="model-probe-response">
                        <strong v-if="modelProbeResults[modelEntryStatusKey(entry)].statusCode">
                          HTTP {{ modelProbeResults[modelEntryStatusKey(entry)].statusCode }}
                        </strong>
                        <span v-if="modelProbeResults[modelEntryStatusKey(entry)].statusCode" class="model-probe-separator">/</span>
                        <span>{{ modelProbeResults[modelEntryStatusKey(entry)].answerSnippet || modelProbeResults[modelEntryStatusKey(entry)].message }}</span>
                      </span>
                      <small>{{ modelProbeResults[modelEntryStatusKey(entry)].latencyMs }}ms</small>
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
              <form class="drawer-panel" @submit.prevent="saveSettings">
                <div class="section-header">
                  <div>
                    <h3>调用框架</h3>
                  </div>
                </div>
                <section class="settings-sub-card invocation-remote-card">
                  <div class="settings-sub-card-header">
                    <h4>远程调用</h4>
                  </div>
                  <div class="invocation-toggle-row">
                    <AgentConfigInvocationToggle
                      v-model="settingsDraft.agentToolExecution.http.enabled"
                      label="开启 HTTP 调用"
                    />
                  </div>
                  <div class="form-grid compact-form-grid invocation-config-grid">
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
                </section>
                <section class="settings-sub-card invocation-local-card">
                  <div class="settings-sub-card-header">
                    <h4>本地调用</h4>
                  </div>
                  <div class="invocation-toggle-row">
                    <AgentConfigInvocationToggle
                      v-model="settingsDraft.agentToolExecution.local.enabled"
                      label="开启 CLI 调用"
                    />
                  </div>
                  <div class="form-grid compact-form-grid invocation-config-grid">
                    <label>
                      <span>命令 Timeout(ms)</span>
                      <input v-model.number="settingsDraft.agentToolExecution.local.timeoutMs" type="number" min="1000" step="1000" />
                    </label>
                    <label>
                      <span>命令最大输出字节</span>
                      <input v-model.number="settingsDraft.agentToolExecution.local.maxOutputBytes" type="number" min="1024" step="1024" />
                    </label>
                  </div>
                  <JsonConfigFileEditor
                    title="本地命令模板 JSON"
                    file-key="tool-management/execution.json#agentToolExecution.local.commands"
                    :model-value="settingsDraft.agentToolExecution.local.commands"
                    :on-save="saveLocalCommandTemplates"
                    open
                    :rows="12"
                  />
                </section>
                <JsonConfigFileEditor
                  title="function call schema"
                  file-key="tool-management/execution.json#agentToolExecution.functionCallSchema"
                  :model-value="settingsDraft.agentToolExecution.functionCallSchema || {}"
                  :on-save="saveFunctionCallSchema"
                  :rows="12"
                />
                <div class="source-actions">
                  <button class="tool-button" type="submit" :disabled="busyKey === 'settings'">
                    {{ busyKey === "settings" ? "保存中" : "保存工具调用配置" }}
                  </button>
                </div>
              </form>
            </article>
          </section>
</template>
