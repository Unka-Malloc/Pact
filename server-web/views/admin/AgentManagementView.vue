<script setup lang="ts">
import { useConsole } from '../../composables/useConsole';
import {
  ConfigFoldCard,
  OptionBar,
  StatusPill,
} from '../../components/common';
const {
  addModelProvider,
  addableModelProviderOptionBarOptions,
  adminView,
  agentPermissionGroupOptionBarOptions,
  agentPermissionGroups,
  busyKey,
  currentView,
  duplicateModelEntry,
  hasFeature,
  isAuthenticated,
  modelEntryBindingSummary,
  modelEntryIsBound,
  modelEntryStatusKey,
  modelEntryStatusLabel,
  modelEntryStatusTone,
  modelProbeResults,
  modelProviderDefinition,
  probeModelEntry,
  providerLabel,
  removeModelProvider,
  saveModelLibrarySettings,
  selectedModelProvider,
  setModelEntryPermissionGroup,
  visibleModelEntries,
} = useConsole();
</script>

<template>
          <section class="agent-management-layout">
            <article class="surface-card">
              <form class="drawer-panel" @submit.prevent="saveModelLibrarySettings">
                <div class="section-header">
                  <div>
                    <h3>智能体管理</h3>
                    <p>系统当前按四类平台管理：模块管理、工具管理、智能体管理、知识管理；本页负责智能体实例的新增、修改、删除和权限组绑定。</p>
                  </div>
                  <div class="section-tags">
                    <span>智能体 {{ visibleModelEntries.length }}</span>
                    <span>权限组 {{ agentPermissionGroups.length }}</span>
                  </div>
                </div>

                <div class="model-library-toolbar">
                  <OptionBar
                    v-model="selectedModelProvider"
                    :options="addableModelProviderOptionBarOptions"
                  />
                  <button class="tool-button" type="button" @click="addModelProvider">
                    新增智能体
                  </button>
                  <button class="tool-button" type="submit" :disabled="busyKey === 'model-library-save'">
                    {{ busyKey === "model-library-save" ? "保存中" : "保存智能体" }}
                  </button>
                </div>

                <div v-if="visibleModelEntries.length > 0" class="agent-management-grid">
                  <article
                    v-for="entry in visibleModelEntries"
                    :key="entry.instanceId"
                    class="agent-management-card"
                  >
                    <div class="agent-management-card-header">
                      <div>
                        <strong>{{ entry.label || modelEntryStatusKey(entry) }}</strong>
                        <span>{{ modelProviderDefinition(entry.provider)?.label || providerLabel(entry.provider) }} / {{ entry.model || "未配置模型" }}</span>
                      </div>
                      <StatusPill :tone="modelEntryStatusTone(entry)" :label="modelEntryStatusLabel(entry)" />
                    </div>
                    <div class="form-grid compact-form-grid">
                      <label>
                        <span>智能体名称</span>
                        <input v-model="entry.label" autocomplete="off" />
                      </label>
                      <label>
                        <span>模型 ID</span>
                        <input v-model="entry.model" autocomplete="off" />
                      </label>
                      <label>
                        <span>权限组</span>
                        <OptionBar
                          :model-value="entry.permissionGroupId || ''"
                          :options="agentPermissionGroupOptionBarOptions"
                          @update:model-value="setModelEntryPermissionGroup(entry, String($event))"
                        />
                      </label>
                    </div>
                    <ConfigFoldCard title="调用参数">
                      <template #summary>
                        <span>调用参数</span>
                        <small class="fold-dropdown-hint">点击展开 ▾</small>
                      </template>
                      <label>
                        <span>系统提示词</span>
                        <textarea v-model="entry.systemPrompt" rows="4" autocomplete="off"></textarea>
                      </label>
                      <label>
                        <span>参数 JSON</span>
                        <textarea v-model="entry.parametersText" rows="5" spellcheck="false"></textarea>
                      </label>
                    </ConfigFoldCard>
                    <ConfigFoldCard title="连接信息">
                      <template #summary>
                        <span>连接信息</span>
                        <small class="fold-dropdown-hint">点击展开 ▾</small>
                      </template>
                      <div class="form-grid compact-form-grid">
                        <label v-if="entry.provider === 'deepseek' || entry.provider === 'openrouter' || entry.provider === 'custom-http'">
                          <span>Base URL / URL</span>
                          <input v-model="entry.baseUrl" autocomplete="off" />
                        </label>
                        <label v-if="entry.provider === 'custom-http'">
                          <span>HTTP URL</span>
                          <input v-model="entry.url" autocomplete="off" />
                        </label>
                        <label v-if="entry.provider === 'deepseek'">
                          <span>Key / Token</span>
                          <input v-model="entry.apiKey" type="password" autocomplete="off" placeholder="留空保持已保存密钥" />
                        </label>
                        <label v-if="entry.provider === 'custom-http'">
                          <span>Token</span>
                          <input v-model="entry.token" type="password" autocomplete="off" placeholder="留空保持已保存 Token" />
                        </label>
                        <label>
                          <span>Timeout(ms)</span>
                          <input v-model.number="entry.timeoutMs" type="number" min="1000" step="1000" />
                        </label>
                      </div>
                    </ConfigFoldCard>
                    <div class="source-actions">
                      <button class="tool-button tool-button-ghost compact-action" type="button" :disabled="busyKey === `model-probe:${modelEntryStatusKey(entry)}`" @click="probeModelEntry(entry)">
                        {{ busyKey === `model-probe:${modelEntryStatusKey(entry)}` ? "探测中" : "探测" }}
                      </button>
                      <button class="tool-button tool-button-ghost compact-action" type="button" @click="duplicateModelEntry(entry)">
                        复制
                      </button>
                      <button
                        class="table-action danger-action"
                        type="button"
                        :disabled="busyKey === `model-remove:${modelEntryStatusKey(entry)}` || modelEntryIsBound(entry)"
                        :title="modelEntryIsBound(entry) ? `已绑定到 ${modelEntryBindingSummary(entry)}，请先解除引用。` : ''"
                        @click="removeModelProvider(entry)"
                      >
                        删除
                      </button>
                    </div>
                    <p v-if="modelProbeResults[modelEntryStatusKey(entry)]" class="model-probe-result" :data-ok="modelProbeResults[modelEntryStatusKey(entry)].ok ? 'true' : 'false'">
                      {{ modelProbeResults[modelEntryStatusKey(entry)].message }}
                    </p>
                  </article>
                </div>
                <div v-else class="empty-state">
                  <strong>当前没有智能体</strong>
                  <span>选择一个模型提供方后新增智能体。</span>
                </div>
              </form>
            </article>
          </section>
</template>
