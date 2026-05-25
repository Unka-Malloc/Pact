<script setup lang="ts">
import { ref } from "vue";
import { useConsole } from '../../composables/useConsole';
import ConfigFoldCard from '../../components/ConfigFoldCard.vue';
import FeatureToggle from '../../components/FeatureToggle.vue';
import OptionBar from '../../components/OptionBar.vue';
import SegmentedToggle from '../../components/SegmentedToggle.vue';
import StatusPill from '../../components/StatusPill.vue';
import ScopeSelector from '../../components/ScopeSelector.vue';
const {
  activeToolManagementToolCount,
  adminView,
  busyKey,
  copyIssuedToolToken,
  createGrant,
  currentView,
  deleteGrant,
  enabledToolGrantCount,
  filter,
  formatCompactDate,
  grantHasScope,
  grantHasToolset,
  grantToolRuleState,
  hasFeature,
  internalToolManagementToolCount,
  isAuthenticated,
  issuedToolToken,
  jsonPreview,
  newGrantLabel,
  newGrantScopes,
  newGrantToolsets,
  policyPreviewGrantId,
  policyPreviewProfileId,
  policyPreviewProfileOptionBarOptions,
  policyPreviewResult,
  policyPreviewToolId,
  policyPreviewToolOptionBarOptions,
  previewToolPolicy,
  refreshToolManagement,
  rotateGrant,
  scopeLabel,
  selectToolForManagement,
  selectedToolManagementTool,
  setGrantToolRule,
  toggleGrantScope,
  toggleGrantToolset,
  toggleNewGrantScope,
  toggleNewGrantToolset,
  toolGrants,
  toolManagementAuditItems,
  toolManagementCatalogState,
  toolManagementMetricsState,
  toolManagementProfiles,
  toolManagementRiskRows,
  toolManagementStatusRows,
  toolManagementTools,
  toolManagementToolsets,
  toolRiskLabel,
  toolScopes,
  toolStatusLabel,
  toolsetLabel,
  updateGrant,
} = useConsole();

const activeTab = ref("catalog");
</script>

<template>
          <section class="tools-layout">
            <div class="segmented-control-container" style="display: flex; justify-content: center; margin-bottom: 24px;">
              <SegmentedToggle
                v-model="activeTab"
                :options="[
                  { value: 'catalog', label: '工具目录与微调' },
                  { value: 'grants', label: '网关授权分配' },
                  { value: 'sandbox', label: '策略与调用分析' }
                ]"
                size="large"
              />
            </div>

            <template v-if="activeTab === 'catalog'">
            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>工具管理平台</h3>
                </div>
                <div class="section-tags">
                  <span>目录指纹 {{ toolManagementCatalogState?.fingerprint?.slice(0, 12) || "未加载" }}</span>
                  <span>工具 {{ activeToolManagementToolCount }}/{{ toolManagementTools.length }}</span>
                  <span>内部 {{ internalToolManagementToolCount }}</span>
                  <span>授权 {{ enabledToolGrantCount }}/{{ toolGrants.length }}</span>
                </div>
              </div>
              <div class="detail-metrics knowledge-metrics">
                <div>
                  <span>调用总量</span>
                  <strong>{{ toolManagementMetricsState?.callsTotal || 0 }}</strong>
                </div>
                <div>
                  <span>拒绝</span>
                  <strong>{{ toolManagementMetricsState?.byStatus?.denied || 0 }}</strong>
                </div>
                <div>
                  <span>限流</span>
                  <strong>{{ toolManagementMetricsState?.rateLimitedTotal || 0 }}</strong>
                </div>
                <div>
                  <span>平均耗时</span>
                  <strong>{{ Math.round(toolManagementMetricsState?.averageDurationMs || 0) }}ms</strong>
                </div>
              </div>
              <div class="source-actions">
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  :disabled="busyKey === 'tool-management'"
                  @click="refreshToolManagement"
                >
                  {{ busyKey === "tool-management" ? "刷新中" : "刷新" }}
                </button>
              </div>

              <div class="tool-catalog-management-grid">
                <div class="tool-catalog-card-list">
                  <button
                    v-for="tool in toolManagementTools"
                    :key="tool.id"
                    class="tool-catalog-card"
                    :class="{ active: selectedToolManagementTool?.id === tool.id }"
                    type="button"
                    @click="selectToolForManagement(tool.id)"
                  >
                    <div>
                      <strong>{{ tool.label }}</strong>
                      <span>{{ tool.id }} / {{ tool.source }}</span>
                    </div>
                    <StatusPill :tone="tool.risk" :label="toolRiskLabel(tool.risk)" />
                  </button>
                </div>

                <aside v-if="selectedToolManagementTool" class="tool-editor-panel">
                  <div class="module-panel-heading">
                    <div>
                      <strong>{{ selectedToolManagementTool.label }}</strong>
                      <span>{{ selectedToolManagementTool.id }}</span>
                    </div>
                    <StatusPill :tone="selectedToolManagementTool.risk" :label="toolRiskLabel(selectedToolManagementTool.risk)" />
                  </div>
                  <p>{{ selectedToolManagementTool.description }}</p>
                  <dl class="module-status-list">
                    <div>
                      <dt>工具集</dt>
                      <dd>{{ selectedToolManagementTool.toolsets.map(toolsetLabel).join(" / ") || "未声明" }}</dd>
                    </div>
                    <div>
                      <dt>权限层级</dt>
                      <dd>{{ selectedToolManagementTool.requiredScopes.map(scopeLabel).join(" / ") || "未声明" }}</dd>
                    </div>
                    <div>
                      <dt>执行状态</dt>
                      <dd>{{ toolStatusLabel(selectedToolManagementTool.status) }}</dd>
                    </div>
                  </dl>
                  <ConfigFoldCard title="按权限组编辑工具例外" open>
                    <div class="permission-list compact-permission-list">
                      <article
                        v-for="grant in toolGrants"
                        :key="grant.id"
                        class="permission-card tool-rule-card"
                        :data-enabled="grant.enabled"
                      >
                        <div class="permission-card-main">
                          <strong>{{ grant.label }}</strong>
                          <small>{{ grant.id }} · {{ grantToolRuleState(grant, selectedToolManagementTool.id) }}</small>
                        </div>
                        <div class="permission-actions">
                          <button
                            class="table-action"
                            type="button"
                            :disabled="busyKey === `grant:${grant.id}`"
                            @click="setGrantToolRule(grant, selectedToolManagementTool.id, 'inherit')"
                          >
                            继承
                          </button>
                          <button
                            class="table-action"
                            type="button"
                            :disabled="busyKey === `grant:${grant.id}`"
                            @click="setGrantToolRule(grant, selectedToolManagementTool.id, 'allow')"
                          >
                            允许
                          </button>
                          <button
                            class="table-action danger-action"
                            type="button"
                            :disabled="busyKey === `grant:${grant.id}`"
                            @click="setGrantToolRule(grant, selectedToolManagementTool.id, 'deny')"
                          >
                            未启用
                          </button>
                        </div>
                      </article>
                      <div v-if="toolGrants.length === 0" class="empty-note">
                        暂无授权组，先创建工具授权后再编辑工具例外。
                      </div>
                    </div>
                  </ConfigFoldCard>
                </aside>
              </div>
              <div v-if="toolManagementTools.length === 0" class="empty-state">
                <strong>尚未加载工具目录</strong>
              </div>
            </article>
            </template>

            <template v-if="activeTab === 'sandbox'">
            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>工具集 / 智能体档案</h3>
                </div>
              </div>
              <div class="tool-management-grid">
                <article
                  v-for="toolset in toolManagementToolsets"
                  :key="toolset.id"
                  class="tool-management-card"
                >
                  <div class="tool-management-card-header">
                    <div>
                      <strong>{{ toolset.label }}</strong>
                      <span>{{ toolset.id }}</span>
                    </div>
                    <em>{{ toolRiskLabel(toolset.maxRisk) }}</em>
                  </div>
                  <p>{{ toolset.requiredScopes.map(scopeLabel).join(" / ") }}</p>
                </article>
              </div>
              <div class="job-table compact-job-table">
                <div class="job-table-header">
                  <span>档案</span>
                  <span>工具集</span>
                  <span>风险</span>
                </div>
                <div
                  v-for="profile in toolManagementProfiles"
                  :key="profile.id"
                  class="job-row"
                >
                  <span>
                    <strong>{{ profile.label }}</strong>
                    <small>{{ profile.id }} / {{ profile.agentType }}</small>
                  </span>
                  <span>{{ profile.toolsets.map(toolsetLabel).join(" / ") }}</span>
                  <span>{{ toolRiskLabel(profile.maxRisk) }}</span>
                </div>
              </div>
            </article>

            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>策略预览</h3>
                </div>
              </div>
              <div class="form-grid compact-form-grid">
                <OptionBar
                  v-model="policyPreviewToolId"
                  label="工具"
                  :options="policyPreviewToolOptionBarOptions"
                />
                <OptionBar
                  v-model="policyPreviewProfileId"
                  label="智能体档案"
                  :options="policyPreviewProfileOptionBarOptions"
                />
                <label>
                  <span>授权 ID</span>
                  <input v-model="policyPreviewGrantId" autocomplete="off" placeholder="留空时使用当前工具的模拟 grant" />
                </label>
              </div>
              <div class="source-actions">
                <button
                  class="tool-button"
                  type="button"
                  :disabled="busyKey === 'tool-policy-preview'"
                  @click="previewToolPolicy"
                >
                  {{ busyKey === "tool-policy-preview" ? "评估中" : "评估策略" }}
                </button>
              </div>
              <pre v-if="policyPreviewResult">{{ jsonPreview(policyPreviewResult) }}</pre>
            </article>
            </template>

            <template v-if="activeTab === 'grants'">
            <article class="surface-card permission-create-card">
              <div class="section-header">
                <div>
                  <h3>创建工具授权</h3>
                </div>
              </div>

              <form class="permission-form" @submit.prevent="createGrant">
                <label class="module-field">
                  <span>授权名称</span>
                  <input v-model="newGrantLabel" autocomplete="off" />
                </label>

                <ScopeSelector
                  v-model="newGrantScopes"
                  :scopes="toolScopes"
                />
                <div class="scope-grid">
                  <button
                    v-for="toolset in toolManagementToolsets.filter((item) => item.grantable !== false)"
                    :key="toolset.id"
                    class="scope-chip"
                    :class="{ active: newGrantToolsets.includes(toolset.id) }"
                    type="button"
                    @click="toggleNewGrantToolset(toolset.id)"
                  >
                    <strong>{{ toolset.label }}</strong>
                    <span>{{ toolRiskLabel(toolset.maxRisk) }}</span>
                  </button>
                </div>

                <button class="tool-button" type="submit" :disabled="busyKey === 'grant:create'">
                  {{ busyKey === "grant:create" ? "创建中" : "创建授权" }}
                </button>
              </form>

              <div v-if="issuedToolToken" class="token-panel">
                <div>
                  <strong>新令牌只显示一次</strong>
                  <p>{{ issuedToolToken }}</p>
                </div>
                <button class="tool-button tool-button-ghost" type="button" @click="copyIssuedToolToken">
                  复制
                </button>
              </div>
            </article>

            <article class="surface-card permission-list-card">
              <div class="section-header">
                <div>
                  <h3>工具授权</h3>
                </div>
                <div class="section-tags">
                  <span>启用 {{ enabledToolGrantCount }}</span>
                  <span>总计 {{ toolGrants.length }}</span>
                </div>
              </div>

              <div class="permission-list" v-if="toolGrants.length > 0">
                <article
                  v-for="grant in toolGrants"
                  :key="grant.id"
                  class="permission-card"
                  :data-enabled="grant.enabled"
                >
                  <div class="permission-card-main">
                    <label class="module-field">
                      <span>名称</span>
                      <input v-model="grant.label" autocomplete="off" @change="updateGrant(grant, { label: grant.label })" />
                    </label>
                    <dl class="module-status-list">
                      <div>
                        <dt>令牌</dt>
                        <dd>{{ grant.tokenPrefix || "未生成" }}</dd>
                      </div>
                      <div>
                        <dt>最近使用</dt>
                        <dd>{{ grant.lastUsedAt ? formatCompactDate(grant.lastUsedAt) : "未使用" }}</dd>
                      </div>
                      <div>
                        <dt>工具集</dt>
                        <dd>{{ (grant.toolsets || []).map(toolsetLabel).join(" / ") || "未声明" }}</dd>
                      </div>
                    </dl>
                  </div>

                  <div class="permission-card-controls">
                    <ScopeSelector
                      :model-value="grant.scopes"
                      :scopes="toolScopes"
                      :disabled="busyKey === `grant:${grant.id}`"
                      @update:model-value="(v) => updateGrant(grant, { scopes: v })"
                      compact
                    />
                    <div class="scope-grid compact-scope-grid">
                      <button
                        v-for="toolset in toolManagementToolsets.filter((item) => item.grantable !== false)"
                        :key="toolset.id"
                        class="scope-chip"
                        :class="{ active: grantHasToolset(grant, toolset.id) }"
                        type="button"
                        :disabled="busyKey === `grant:${grant.id}`"
                        @click="toggleGrantToolset(grant, toolset.id)"
                      >
                        <strong>{{ toolset.label }}</strong>
                      </button>
                    </div>
                    <div class="permission-actions">
                      <FeatureToggle
                        :model-value="grant.enabled"
                        on-label="授权已启用"
                        off-label="授权已停用"
                        :aria-label="grant.enabled ? '停用授权' : '启用授权'"
                        :disabled="busyKey === `grant:${grant.id}`"
                        @update:model-value="updateGrant(grant, { enabled: $event })"
                      />
                      <button class="table-action" type="button" :disabled="busyKey === `grant:${grant.id}`" @click="rotateGrant(grant)">
                        轮换
                      </button>
                      <button class="table-action danger-action" type="button" :disabled="busyKey === `grant:${grant.id}`" @click="deleteGrant(grant)">
                        撤销
                      </button>
                    </div>
                  </div>
                </article>
              </div>

              <div v-else class="empty-state">
                <strong>暂无工具授权</strong>
                <span>创建授权后，智能体才能调用受限工具入口。</span>
              </div>
            </article>
            </template>

            <template v-if="activeTab === 'sandbox'">
            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>调用记录 / 指标</h3>
                </div>
                <div class="section-tags">
                  <span v-for="row in toolManagementStatusRows" :key="`status:${row.label}`">{{ row.label }} {{ row.value }}</span>
                  <span v-for="row in toolManagementRiskRows" :key="`risk:${row.label}`">{{ toolRiskLabel(row.label) }} {{ row.value }}</span>
                </div>
              </div>
              <div class="job-table compact-job-table">
                <div class="job-table-header">
                  <span>执行</span>
                  <span>工具</span>
                  <span>状态</span>
                  <span>耗时</span>
                </div>
                <div
                  v-for="item in toolManagementAuditItems"
                  :key="item.toolExecutionId"
                  class="job-row"
                >
                  <span>
                    <strong>{{ item.toolExecutionId }}</strong>
                    <small>{{ item.traceId }} / {{ formatCompactDate(item.finishedAt || item.startedAt) }}</small>
                  </span>
                  <span>{{ item.toolId }}</span>
                  <span>{{ item.status }}{{ item.errorCode ? ` / ${item.errorCode}` : "" }}</span>
                  <span>{{ item.durationMs }}ms</span>
                </div>
              </div>
              <div v-if="toolManagementAuditItems.length === 0" class="empty-state">
                <strong>暂无工具调用记录</strong>
              </div>
            </article>
            </template>
          </section>
</template>
