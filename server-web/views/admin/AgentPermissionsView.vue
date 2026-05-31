<script setup lang="ts">
import ConfigFoldCard from '../../components/ConfigFoldCard.vue';
import FeatureToggle from '../../components/FeatureToggle.vue';
import OptionBar from '../../components/OptionBar.vue';
import ScopeSelector from '../../components/ScopeSelector.vue';
import AuthorizationGovernanceCard from '../../components/admin/AuthorizationGovernanceCard.vue';
import { provideAgentPermissionsView } from '../../composables/agentPermissionsViewContext';
import { useAgentPermissionsViewConsole } from '../../composables/console-agent-permissions-view-controller';

const agentPermissionsView = useAgentPermissionsViewConsole();
provideAgentPermissionsView(agentPermissionsView);

const {
  addAgentPermissionGroup,
  busyKey,
  copyIssuedToolToken,
  createGrant,
  deleteGrant,
  enabledToolGrantCount,
  ensureAgentPermissionGroupsDraft,
  formatCompactDate,
  grantHasToolset,
  grantToolRuleState,
  handleSelectedToolChange,
  issuedToolToken,
  jsonPreview,
  newGrantLabel,
  newGrantScopes,
  newGrantToolsets,
  permissionGroupHasToolset,
  permissionGroupToolRuleState,
  policyPreviewGrantId,
  policyPreviewProfileId,
  policyPreviewProfileOptionBarOptions,
  policyPreviewResult,
  policyPreviewToolId,
  policyPreviewToolOptionBarOptions,
  previewToolPolicy,
  removeAgentPermissionGroup,
  rotateGrant,
  saveAgentPermissionSettings,
  selectedToolManagementTool,
  setGrantToolRule,
  setPermissionGroupToolRule,
  settingsDraft,
  toggleGrantToolset,
  toggleNewGrantToolset,
  togglePermissionGroupToolset,
  toolGrants,
  toolManagementTools,
  toolManagementToolsets,
  toolRiskLabel,
  toolScopes,
  toolsetLabel,
  updateGrant,
} = agentPermissionsView;
</script>

<template>
          <section class="agent-permissions-layout">
            <AuthorizationGovernanceCard />

            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>权限组</h3>
                  <p>权限组是全系统权限配置入口；团队策略、用户策略、智能体绑定、工具授权和单工具例外只在这里维护。</p>
                </div>
                <div class="source-actions">
                  <button class="tool-button tool-button-ghost" type="button" @click="ensureAgentPermissionGroupsDraft">
                    生成默认组
                  </button>
                  <button class="tool-button tool-button-ghost" type="button" @click="addAgentPermissionGroup">
                    新增权限组
                  </button>
                  <button class="tool-button" type="button" :disabled="busyKey === 'agent-permissions-save'" @click="saveAgentPermissionSettings">
                    {{ busyKey === "agent-permissions-save" ? "保存中" : "保存权限组" }}
                  </button>
                </div>
              </div>
              <div class="detail-metrics knowledge-metrics">
                <div>
                  <span>权限层级</span>
                  <strong>{{ toolScopes.length }}</strong>
                </div>
                <div>
                  <span>工具集</span>
                  <strong>{{ toolManagementToolsets.length }}</strong>
                </div>
                <div>
                  <span>工具</span>
                  <strong>{{ toolManagementTools.length }}</strong>
                </div>
                <div>
                  <span>预设组</span>
                  <strong>{{ settingsDraft.agentPermissionGroups.length }}</strong>
                </div>
              </div>
            </article>

            <article
              v-for="group in settingsDraft.agentPermissionGroups"
              :key="group.id"
              class="surface-card agent-permission-group-card"
              :data-enabled="group.enabled"
            >
              <div class="section-header">
                <div class="form-grid compact-form-grid permission-group-title-grid">
                  <label>
                    <span>权限组名称</span>
                    <input v-model="group.label" autocomplete="off" />
                  </label>
                  <label>
                    <span>权限组 ID</span>
                    <input v-model="group.id" autocomplete="off" />
                  </label>
                </div>
                <div class="permission-actions">
                  <FeatureToggle
                    :model-value="group.enabled"
                    :aria-label="group.enabled ? '停用权限组' : '启用权限组'"
                    @update:model-value="group.enabled = Boolean($event)"
                  />
                  <button class="table-action danger-action" type="button" @click="removeAgentPermissionGroup(group)">
                    删除
                  </button>
                </div>
              </div>
              <label class="module-field">
                <span>说明</span>
                <input v-model="group.description" autocomplete="off" />
              </label>
              <ConfigFoldCard title="第一层：权限控制层级">
                <ScopeSelector
                  v-model="group.scopeIds"
                  :scopes="toolScopes"
                  compact
                />
              </ConfigFoldCard>
              <ConfigFoldCard title="第二层：工具集权限">
                <div class="scope-grid compact-scope-grid">
                  <button
                    v-for="toolset in toolManagementToolsets.filter((item) => item.grantable !== false)"
                    :key="toolset.id"
                    class="scope-chip"
                    :class="{ active: permissionGroupHasToolset(group, toolset.id) }"
                    type="button"
                    @click="togglePermissionGroupToolset(group, toolset.id)"
                  >
                    <strong>{{ toolset.label }}</strong>
                    <span>{{ toolRiskLabel(toolset.maxRisk) }}</span>
                  </button>
                </div>
              </ConfigFoldCard>
              <ConfigFoldCard title="第三层：单工具例外">
                <div class="job-table compact-job-table permission-tool-rule-table">
                  <div class="job-table-header">
                    <span>工具</span>
                    <span>当前规则</span>
                    <span>操作</span>
                  </div>
                  <div
                    v-for="tool in toolManagementTools"
                    :key="`${group.id}:${tool.id}`"
                    class="job-row"
                  >
                    <span>
                      <strong>{{ tool.label }}</strong>
                      <small>{{ tool.id }}</small>
                    </span>
                    <span>{{ permissionGroupToolRuleState(group, tool.id) }}</span>
                    <span class="permission-actions">
                      <button
                        class="table-action"
                        type="button"
                        @click="setPermissionGroupToolRule(group, tool.id, 'inherit')"
                      >
                        继承
                      </button>
                      <button
                        class="table-action"
                        type="button"
                        @click="setPermissionGroupToolRule(group, tool.id, 'allow')"
                      >
                        允许
                      </button>
                      <button
                        class="table-action danger-action"
                        type="button"
                        @click="setPermissionGroupToolRule(group, tool.id, 'deny')"
                      >
                        未启用
                      </button>
                    </span>
                  </div>
                </div>
                <div v-if="toolManagementTools.length === 0" class="empty-state">
                  <strong>尚未加载工具目录</strong>
                </div>
              </ConfigFoldCard>
            </article>
            <div v-if="settingsDraft.agentPermissionGroups.length === 0" class="empty-state">
              <strong>暂无权限组</strong>
              <span>先生成默认组或新增自定义权限组。</span>
            </div>

            <article class="surface-card permission-create-card">
              <div class="section-header">
                <div>
                  <h3>网关工具授权</h3>
                  <p>所有工具令牌、授权范围和撤销操作都在权限组页集中维护。</p>
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
                  <h3>授权列表</h3>
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

            <article class="surface-card permission-list-card">
              <div class="section-header">
                <div>
                  <h3>授权工具例外</h3>
                  <p>按工具调整网关授权的允许或未启用规则。</p>
                </div>
                <label class="module-field compact-select-field">
                  <span>工具</span>
                  <select :value="selectedToolManagementTool?.id || ''" @change="handleSelectedToolChange">
                    <option
                      v-for="tool in toolManagementTools"
                      :key="tool.id"
                      :value="tool.id"
                    >
                      {{ tool.label }}
                    </option>
                  </select>
                </label>
              </div>
              <div v-if="selectedToolManagementTool" class="job-table compact-job-table grant-tool-rule-table">
                <div class="job-table-header">
                  <span>授权</span>
                  <span>当前规则</span>
                  <span>操作</span>
                </div>
                <div
                  v-for="grant in toolGrants"
                  :key="`${grant.id}:${selectedToolManagementTool.id}`"
                  class="job-row"
                >
                  <span>
                    <strong>{{ grant.label }}</strong>
                    <small>{{ grant.id }}</small>
                  </span>
                  <span>{{ grantToolRuleState(grant, selectedToolManagementTool.id) }}</span>
                  <span class="permission-actions">
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
                  </span>
                </div>
              </div>
              <div v-if="toolGrants.length === 0" class="empty-state">
                <strong>暂无授权</strong>
              </div>
            </article>

            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>策略裁决预览</h3>
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
                  <input v-model="policyPreviewGrantId" autocomplete="off" placeholder="留空时使用当前工具的模拟授权" />
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
          </section>
</template>
