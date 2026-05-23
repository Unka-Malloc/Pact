<script setup lang="ts">
import { useConsole } from '../composables/useConsole';
import AgentModelOptionBar from '../components/AgentModelOptionBar.vue';
import BrowseSelectButton from '../components/BrowseSelectButton.vue';
import ConfigFoldCard from '../components/ConfigFoldCard.vue';
import FeatureToggle from '../components/FeatureToggle.vue';
import OptionBar from '../components/OptionBar.vue';
import StatusPill from '../components/StatusPill.vue';
const {
  addModuleAgentProfileFromDraft,
  analysisModuleOptionBarOptions,
  busyKey,
  canBrowseServerPaths,
  consoleState,
  enabledMountCount,
  totalMountCount,
  contextWindowOptionBarOptions,
  currentView,
  analysisExecutionModeLabel,
  analysisModuleDescription,
  currentAnalysisModule,
  hasFeature,
  highlightedConfigTarget,
  intelligentModuleDefinitions,
  isAuthenticated,
  moduleAgentCandidateDrafts,
  moduleAgentProfileRows,
  moduleModelAssignmentSelectOptions,
  moduleModelAssignmentStats,
  moduleModelRef,
  moduleNeedsIntelligence,
  openSettingsPathPicker,
  reloadModules,
  removeModuleAgentProfile,
  saveModuleSettings,
  setModuleAgentProfileEnabled,
  setModuleModelRef,
  setModuleNeedsIntelligence,
  settingsDraft,
} = useConsole();
</script>

<template>
          <section class="modules-layout">
            <article class="surface-card module-control-card">
              <div class="module-card-meta">
                <h3 class="module-card-title">智能设置</h3>
                <div class="section-tags">
                  <span>运行代次 {{ consoleState?.runtime?.mountGeneration || 0 }}</span>
                  <span>启用 {{ enabledMountCount }}/{{ totalMountCount }}</span>
                </div>
              </div>

              <form class="module-control-form" @submit.prevent="saveModuleSettings">
                <div class="module-grid">
                  <section class="module-panel">
                    <div class="module-panel-heading">
                      <strong>分析模块</strong>
                      <span>{{
                        analysisExecutionModeLabel(
                          currentAnalysisModule?.executionMode,
                        )
                      }}</span>
                    </div>
                    <label class="module-field">
                      <span>当前分析引擎</span>
                      <OptionBar
                        v-model="settingsDraft.analysisModuleId"
                        :options="analysisModuleOptionBarOptions"
                      />
                    </label>
                    <p class="module-note">
                      {{ analysisModuleDescription() }}
                    </p>
                  </section>

                  <section class="module-panel">
                    <div class="module-panel-heading">
                      <strong>事务时间策略</strong>
                      <span>邮件分析</span>
                    </div>
                    <div class="form-grid compact-form-grid">
                      <label>
                        <span>历史阈值（天）</span>
                        <input v-model.number="settingsDraft.staleAfterDays" min="1" type="number" />
                      </label>
                      <label>
                        <span>事务时间窗（天）</span>
                        <input v-model.number="settingsDraft.transactionWindowDays" min="1" type="number" />
                      </label>
                    </div>
                    <p class="module-note">
                      这两个参数参与邮件事务接续、历史状态判定和检索投影，不属于模型授权配置。
                    </p>
                  </section>

                  <section class="module-panel module-assignment-panel">
                    <div class="module-panel-heading module-assignment-heading">
                      <div class="module-panel-title">
                        <strong>模块模型分配</strong>
                        <span class="module-assignment-count">
                          {{ moduleModelAssignmentStats.assigned }}/{{ moduleModelAssignmentStats.enabled }} 已分配
                        </span>
                      </div>
                      <FeatureToggle
                        v-model="settingsDraft.modelIntelligenceEnabled"
                        on-label="智能模块已开启"
                        off-label="智能模块已关闭"
                        :aria-label="settingsDraft.modelIntelligenceEnabled ? '关闭云智能解析' : '开启云智能解析'"
                      />
                    </div>
                    <p class="module-note">
                      这里不设置全局模型。每个功能必须显式选择智能体；未选择时保持空，不会自动引用任何模型。
                    </p>
                    <div class="module-assignment-list">
                      <div
                        v-for="item in intelligentModuleDefinitions"
                        :key="item.id"
                        class="module-assignment-row"
                        :data-enabled="moduleNeedsIntelligence(item.id)"
                        :data-config-target="`module-agent-${item.id}`"
                        :data-config-highlighted="highlightedConfigTarget === `module-agent-${item.id}`"
                      >
                        <div class="module-assignment-card-head">
                          <div class="module-assignment-title-block">
                            <strong>{{ item.label }}</strong>
                            <small>{{ item.description }}</small>
                          </div>
                          <FeatureToggle
                            :model-value="moduleNeedsIntelligence(item.id)"
                            on-label="使用智能体"
                            off-label="不使用"
                            :aria-label="`${item.label}${moduleNeedsIntelligence(item.id) ? '关闭智能体分配' : '启用智能体分配'}`"
                            @update:model-value="setModuleNeedsIntelligence(item.id, $event)"
                          />
                        </div>
                        <div class="module-assignment-card-body">
                          <AgentModelOptionBar
                            class="module-model-field"
                            :model-value="moduleModelRef(item.id)"
                            label="分配智能体"
                            placeholder="未分配智能体"
                            clearable
                            :disabled="!moduleNeedsIntelligence(item.id)"
                            include-empty
                            :options="moduleModelAssignmentSelectOptions(item.id)"
                            @update:model-value="setModuleModelRef(item.id, String($event))"
                          />
                          <span class="module-assignment-hint">
                            {{
                              moduleNeedsIntelligence(item.id)
                                ? moduleModelRef(item.id)
                                  ? "已保存为模块专属智能体"
                                  : "未分配时不会隐式调用模型"
                                : "停用后保存会移除该模块分配"
                            }}
                          </span>
                        </div>
                        <ConfigFoldCard
                          v-if="moduleNeedsIntelligence(item.id)"
                          class="module-agent-profile-card"
                          title="模块/功能专属智能体参数"
                        >
                          <p class="module-note">
                            加载顺序：智能体通用连接配置 -> 本模块专属参数 -> 当前会话/任务上下文。
                          </p>
                          <div class="module-agent-add-row">
                            <AgentModelOptionBar
                              v-model="moduleAgentCandidateDrafts[item.id]"
                              label="新增辅助智能体"
                              placeholder="选择已授权开放的智能体"
                              clearable
                              include-empty
                              :options="moduleModelAssignmentSelectOptions(item.id)"
                            />
                            <button
                              class="tool-button tool-button-ghost compact-action"
                              type="button"
                              :disabled="!moduleAgentCandidateDrafts[item.id]"
                              @click="addModuleAgentProfileFromDraft(item.id)"
                            >
                              添加
                            </button>
                          </div>
                          <div class="module-agent-profile-list">
                            <article
                              v-for="row in moduleAgentProfileRows(item.id)"
                              :key="row.agentId"
                              class="module-agent-profile-item"
                            >
                              <div class="module-agent-profile-head">
                                <div>
                                  <strong>{{ row.label }}</strong>
                                  <span>{{ row.isPrimary ? "主智能体" : "辅助智能体" }}</span>
                                </div>
                                <div class="module-agent-profile-actions">
                                  <FeatureToggle
                                    :model-value="row.profile.enabled"
                                    :aria-label="row.profile.enabled ? '停用该模块智能体' : '启用该模块智能体'"
                                    @update:model-value="setModuleAgentProfileEnabled(item.id, row.agentId, $event)"
                                  />
                                  <button
                                    class="inline-link"
                                    type="button"
                                    @click="removeModuleAgentProfile(item.id, row.agentId)"
                                  >
                                    移除
                                  </button>
                                </div>
                              </div>
                              <div class="form-grid compact-form-grid">
                                <label>
                                  <span>角色</span>
                                  <input v-model="row.profile.role" autocomplete="off" />
                                </label>
                                <OptionBar
                                  v-model="row.profile.contextProfileId"
                                  label="上下文窗口"
                                  clearable
                                  :options="contextWindowOptionBarOptions"
                                />
                              </div>
                              <label>
                                <span>模块提示词</span>
                                <textarea v-model="row.profile.systemPrompt" rows="3" spellcheck="false"></textarea>
                              </label>
                              <div class="form-grid compact-form-grid">
                                <label>
                                  <span>调用参数 JSON</span>
                                  <textarea v-model="row.profile.parametersText" rows="4" spellcheck="false"></textarea>
                                </label>
                                <label>
                                  <span>功能依赖上下文 JSON</span>
                                  <textarea v-model="row.profile.dependencyContextText" rows="4" spellcheck="false"></textarea>
                                </label>
                              </div>
                            </article>
                            <div v-if="!moduleAgentProfileRows(item.id).length" class="empty-note">
                              尚未为该模块配置专属智能体参数。
                            </div>
                          </div>
                        </ConfigFoldCard>
                      </div>
                    </div>
                    <p class="module-note">
                      授权连接和自定义 Adapter 在“智能体配置 / 模型库”中维护。模块只保存智能体 UID；
                      未选择时保持空，不会隐式使用其它模型。
                    </p>
                  </section>

                  <section class="module-panel">
                    <div class="module-panel-heading">
                      <div class="module-panel-title">
                        <strong>本地 OCR</strong>
                      </div>
                      <StatusPill
                        :enabled="settingsDraft.ocrEnabled"
                        :label="settingsDraft.ocrEnabled ? '已启用' : '已关闭'"
                      />
                    </div>
                    <div class="form-grid compact-form-grid">
                      <label>
                        <span>OCR Python 路径</span>
                        <div class="path-field">
                          <input
                            v-model="settingsDraft.ocrPythonPath"
                            autocomplete="off"
                          />
                          <BrowseSelectButton
                            kind="server-file"
                            button-class="path-action-button"
                            button-text="浏览"
                            size="small"
                            :disabled="!canBrowseServerPaths"
                            plain
                            @browse="openSettingsPathPicker('ocrPythonPath', '选择 OCR Python 可执行文件')"
                          />
                        </div>
                      </label>
                      <label>
                        <span>OCR 语言</span>
                        <input
                          v-model="settingsDraft.ocrLanguage"
                          autocomplete="off"
                        />
                      </label>
                    </div>
                    <p class="module-note">
                      图片类输入将优先走 OCR 路由，关闭后跳过图片文本兜底。
                    </p>
                    <div class="module-panel-footer">
                      <FeatureToggle
                        v-model="settingsDraft.ocrEnabled"
                        :aria-label="settingsDraft.ocrEnabled ? '关闭本地 OCR' : '开启本地 OCR'"
                      />
                    </div>
                  </section>

                  <section class="module-panel">
                    <div class="module-panel-heading">
                      <strong>本地文档解析</strong>
                      <span>Tika / Java</span>
                    </div>
                    <div class="form-grid compact-form-grid">
                      <label>
                        <span>Tika JAR 路径</span>
                        <div class="path-field">
                          <input
                            v-model="settingsDraft.tikaJarPath"
                            autocomplete="off"
                          />
                          <BrowseSelectButton
                            kind="server-file"
                            button-class="path-action-button"
                            button-text="浏览"
                            size="small"
                            :disabled="!canBrowseServerPaths"
                            plain
                            @browse="openSettingsPathPicker('tikaJarPath', '选择 Tika JAR 文件', ['.jar'])"
                          />
                        </div>
                      </label>
                      <label>
                        <span>Java 路径</span>
                        <div class="path-field">
                          <input
                            v-model="settingsDraft.javaBinPath"
                            autocomplete="off"
                          />
                          <BrowseSelectButton
                            kind="server-file"
                            button-class="path-action-button"
                            button-text="浏览"
                            size="small"
                            :disabled="!canBrowseServerPaths"
                            plain
                            @browse="openSettingsPathPicker('javaBinPath', '选择 Java 可执行文件')"
                          />
                        </div>
                      </label>
                    </div>
                    <p class="module-note">
                      留空时使用内置查找逻辑，适合部署包自带运行时。
                    </p>
                  </section>
                </div>

                <div class="module-actions">
                  <button
                    class="tool-button tool-button-ghost"
                    type="button"
                    :disabled="busyKey === 'module-reload'"
                    @click="reloadModules"
                  >
                    {{ busyKey === "module-reload" ? "重载中" : "重载能力" }}
                  </button>
                  <button
                    class="tool-button"
                    type="submit"
                    :disabled="busyKey === 'modules'"
                  >
                    {{ busyKey === "modules" ? "保存中" : "保存设置" }}
                  </button>
                </div>
              </form>
            </article>

          </section>
</template>
