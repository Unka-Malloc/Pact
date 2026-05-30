<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useConsole } from '../../composables/useConsole';
import { usePageRefreshHandler } from '../../composables/usePageRefresh';
import { bridge } from '../../lib/bridge';
import ConfigFoldCard from '../../components/ConfigFoldCard.vue';
import FeatureToggle from '../../components/FeatureToggle.vue';
import OptionBar from '../../components/OptionBar.vue';
import ScopeSelector from '../../components/ScopeSelector.vue';

type GovernanceItem = Record<string, unknown>;

type GovernanceSummary = {
  roles: GovernanceItem[];
  teams: GovernanceItem[];
  userPolicies: GovernanceItem[];
  agentBindings: GovernanceItem[];
  agentGroups: GovernanceItem[];
  approvals: GovernanceItem[];
};

type GovernanceEditorKind = 'role' | 'team' | 'userPolicy' | 'agentGroup' | 'agentBinding' | 'approval';

const emptyGovernanceSummary = (): GovernanceSummary => ({
  roles: [],
  teams: [],
  userPolicies: [],
  agentBindings: [],
  agentGroups: [],
  approvals: [],
});

const authorizationGovernance = ref<GovernanceSummary>(emptyGovernanceSummary());
const authorizationGovernanceLoading = ref(false);
const authorizationGovernanceError = ref('');
const authorizationGovernanceSaving = ref(false);
const authorizationGovernanceEditorKind = ref<GovernanceEditorKind>('team');
const authorizationGovernanceEditorBody = ref('');
const authorizationGovernanceEditorStatus = ref('');

function asList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function shortList(value: unknown, fallback = '未配置'): string {
  const items = asList(value);
  if (items.length === 0) return fallback;
  return items.slice(0, 3).join(', ') + (items.length > 3 ? ` +${items.length - 3}` : '');
}

function itemText(item: GovernanceItem, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value);
    }
  }
  return fallback;
}

function policyCount(item: GovernanceItem): number {
  const policies = item.resourcePolicies;
  return Array.isArray(policies) ? policies.length : 0;
}

async function refreshAuthorizationGovernance() {
  authorizationGovernanceLoading.value = true;
  authorizationGovernanceError.value = '';
  try {
    const payload = await bridge.getAuthorizationGovernance();
    authorizationGovernance.value = {
      ...emptyGovernanceSummary(),
      ...(payload?.governance || {}),
    };
  } catch (error) {
    authorizationGovernanceError.value = error instanceof Error ? error.message : '读取统一权限治理失败。';
  } finally {
    authorizationGovernanceLoading.value = false;
  }
}

const authorizationGovernanceMetrics = computed(() => [
  { label: '角色', value: authorizationGovernance.value.roles.length },
  { label: '团队', value: authorizationGovernance.value.teams.length },
  { label: '用户策略', value: authorizationGovernance.value.userPolicies.length },
  { label: '智能体绑定', value: authorizationGovernance.value.agentBindings.length },
  { label: '审批', value: authorizationGovernance.value.approvals.length },
]);

const authorizationGovernanceEditorKinds = [
  { value: 'role', label: '角色' },
  { value: 'team', label: '团队' },
  { value: 'userPolicy', label: '用户策略' },
  { value: 'agentGroup', label: '智能体分组' },
  { value: 'agentBinding', label: '智能体绑定' },
  { value: 'approval', label: '审批' },
] as const;

function governanceEditorSample(kind: GovernanceEditorKind = authorizationGovernanceEditorKind.value): string {
  const samples = {
    role: {
      roleId: 'repo-maintainer',
      label: 'Repo Maintainer',
      scopes: ['repo:read', 'repo:write', 'repo:maintain'],
      resourcePolicies: [{ resourceType: 'repo', resourceId: 'owner/repo', actions: ['repo:write'], targetProviders: ['github'] }],
    },
    team: {
      teamId: 'team-code',
      label: 'Code Team',
      memberUserIds: ['console_user_id'],
      resourcePolicies: [{ resourceType: 'repo', resourceId: 'owner/repo', actions: ['repo:write', 'repo:maintain'], targetProviders: ['github', 'gerrit'] }],
    },
    userPolicy: {
      userId: 'console_user_id',
      teamIds: ['team-code'],
      resourcePolicies: [{ resourceType: 'repo', resourceId: 'owner/repo', actions: ['repo:write'], targetProviders: ['github'] }],
    },
    agentGroup: {
      groupId: 'code-submitters',
      label: 'Code Submitters',
      resourcePolicies: [{ resourceType: 'repo', resourceId: 'owner/repo', actions: ['repo:write'], targetProviders: ['github'] }],
    },
    agentBinding: {
      agentId: 'agent-codex',
      boundUserId: 'console_user_id',
      groupIds: ['code-submitters'],
      resourcePolicies: [],
    },
    approval: {
      approvalId: 'approval-once',
      userId: 'console_user_id',
      agentId: 'agent-codex',
      resourceType: 'repo',
      resourceId: 'owner/repo',
      actions: ['repo:write'],
      targetProviders: ['github'],
      grantKind: 'once',
    },
  } satisfies Record<GovernanceEditorKind, Record<string, unknown>>;
  return JSON.stringify(samples[kind], null, 2);
}

function resetAuthorizationGovernanceEditor() {
  authorizationGovernanceEditorBody.value = governanceEditorSample();
  authorizationGovernanceEditorStatus.value = '';
}

async function saveAuthorizationGovernanceEditor() {
  authorizationGovernanceSaving.value = true;
  authorizationGovernanceEditorStatus.value = '';
  authorizationGovernanceError.value = '';
  try {
    const payload = JSON.parse(authorizationGovernanceEditorBody.value || '{}') as Record<string, unknown>;
    await bridge.upsertAuthorizationGovernance(authorizationGovernanceEditorKind.value, payload);
    authorizationGovernanceEditorStatus.value = '已保存';
    await refreshAuthorizationGovernance();
  } catch (error) {
    authorizationGovernanceEditorStatus.value = error instanceof Error ? error.message : '保存失败';
  } finally {
    authorizationGovernanceSaving.value = false;
  }
}

watch(authorizationGovernanceEditorKind, () => {
  resetAuthorizationGovernanceEditor();
});

onMounted(() => {
  resetAuthorizationGovernanceEditor();
  void refreshAuthorizationGovernance();
});

usePageRefreshHandler(
  (detail) => detail.viewId === 'admin' && detail.adminView === 'agentPermissions',
  refreshAuthorizationGovernance,
);

const {
  addAgentPermissionGroup,
  adminView,
  agentPermissionGroups,
  busyKey,
  copyIssuedToolToken,
  createGrant,
  currentView,
  deleteGrant,
  enabledToolGrantCount,
  ensureAgentPermissionGroupsDraft,
  filter,
  formatCompactDate,
  grantHasToolset,
  grantToolRuleState,
  hasFeature,
  isAuthenticated,
  issuedToolToken,
  jsonPreview,
  newGrantLabel,
  newGrantScopes,
  newGrantToolsets,
  permissionGroupHasScope,
  permissionGroupHasToolset,
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
  scopeLabel,
  selectToolForManagement,
  selectedToolManagementTool,
  setGrantToolRule,
  settingsDraft,
  toggleGrantToolset,
  toggleNewGrantToolset,
  togglePermissionGroupScope,
  togglePermissionGroupToolset,
  toolGrants,
  toolManagementTools,
  toolManagementToolsets,
  toolRiskLabel,
  toolScopes,
  toolsetLabel,
  updateGrant,
} = useConsole();

function permissionGroupToolRuleState(
  group: { toolAllow?: string[]; toolDeny?: string[] },
  toolId: string,
) {
  if ((group.toolDeny || []).includes(toolId)) {
    return 'deny';
  }
  if ((group.toolAllow || []).includes(toolId)) {
    return 'allow';
  }
  return 'inherit';
}

function setPermissionGroupToolRule(
  group: { toolAllow?: string[]; toolDeny?: string[] },
  toolId: string,
  rule: 'inherit' | 'allow' | 'deny',
) {
  const allow = new Set(group.toolAllow || []);
  const deny = new Set(group.toolDeny || []);
  allow.delete(toolId);
  deny.delete(toolId);
  if (rule === 'allow') {
    allow.add(toolId);
  }
  if (rule === 'deny') {
    deny.add(toolId);
  }
  group.toolAllow = [...allow];
  group.toolDeny = [...deny];
}

function handleSelectedToolChange(event: Event) {
  const target = event.target as HTMLSelectElement | null;
  selectToolForManagement(target?.value || '');
}

onMounted(() => {
  ensureAgentPermissionGroupsDraft();
});
</script>

<template>
          <section class="agent-permissions-layout">
            <article class="surface-card authorization-governance-card">
              <div class="section-header">
                <div>
                  <h3>统一权限治理</h3>
                  <p>团队权限作为上限，用户策略与审批、智能体绑定与分组共同形成最终裁决。</p>
                </div>
              </div>
              <div class="detail-metrics knowledge-metrics">
                <div v-for="metric in authorizationGovernanceMetrics" :key="metric.label">
                  <span>{{ metric.label }}</span>
                  <strong>{{ metric.value }}</strong>
                </div>
              </div>
              <div v-if="authorizationGovernanceError" class="inline-alert">
                {{ authorizationGovernanceError }}
              </div>
              <div class="authorization-governance-editor">
                <label>
                  <span>对象</span>
                  <select v-model="authorizationGovernanceEditorKind">
                    <option v-for="kind in authorizationGovernanceEditorKinds" :key="kind.value" :value="kind.value">
                      {{ kind.label }}
                    </option>
                  </select>
                </label>
                <label class="governance-editor-body">
                  <span>配置</span>
                  <textarea v-model="authorizationGovernanceEditorBody" spellcheck="false" />
                </label>
                <div class="source-actions">
                  <button class="tool-button tool-button-ghost" type="button" @click="resetAuthorizationGovernanceEditor">
                    重置模板
                  </button>
                  <button class="tool-button" type="button" :disabled="authorizationGovernanceSaving" @click="saveAuthorizationGovernanceEditor">
                    {{ authorizationGovernanceSaving ? "保存中" : "保存配置" }}
                  </button>
                  <span v-if="authorizationGovernanceEditorStatus" class="governance-editor-status">
                    {{ authorizationGovernanceEditorStatus }}
                  </span>
                </div>
              </div>
              <div class="authorization-governance-grid">
                <section class="authorization-governance-panel">
                  <div class="panel-title">
                    <strong>角色</strong>
                    <span>{{ authorizationGovernance.roles.length }}</span>
                  </div>
                  <div class="governance-list">
                    <div v-for="role in authorizationGovernance.roles.slice(0, 6)" :key="itemText(role, ['roleId', 'id'])" class="governance-row">
                      <strong>{{ itemText(role, ['label', 'roleId', 'id']) }}</strong>
                      <span>{{ shortList(role.scopes) }}</span>
                      <small>{{ policyCount(role) }} 个资源模板</small>
                    </div>
                    <div v-if="authorizationGovernance.roles.length === 0" class="governance-empty">暂无角色</div>
                  </div>
                </section>
                <section class="authorization-governance-panel">
                  <div class="panel-title">
                    <strong>团队</strong>
                    <span>{{ authorizationGovernance.teams.length }}</span>
                  </div>
                  <div class="governance-list">
                    <div v-for="team in authorizationGovernance.teams.slice(0, 6)" :key="itemText(team, ['teamId', 'id'])" class="governance-row">
                      <strong>{{ itemText(team, ['label', 'teamId', 'id']) }}</strong>
                      <span>{{ shortList(team.memberUserIds || team.members, '无成员') }}</span>
                      <small>{{ policyCount(team) }} 个资源授权</small>
                    </div>
                    <div v-if="authorizationGovernance.teams.length === 0" class="governance-empty">暂无团队</div>
                  </div>
                </section>
                <section class="authorization-governance-panel">
                  <div class="panel-title">
                    <strong>用户策略</strong>
                    <span>{{ authorizationGovernance.userPolicies.length }}</span>
                  </div>
                  <div class="governance-list">
                    <div v-for="policy in authorizationGovernance.userPolicies.slice(0, 6)" :key="itemText(policy, ['userId', 'id'])" class="governance-row">
                      <strong>{{ itemText(policy, ['userId', 'id']) }}</strong>
                      <span>{{ shortList(policy.teamIds || policy.teams, '无团队') }}</span>
                      <small>{{ policyCount(policy) }} 个资源授权</small>
                    </div>
                    <div v-if="authorizationGovernance.userPolicies.length === 0" class="governance-empty">暂无用户策略</div>
                  </div>
                </section>
                <section class="authorization-governance-panel">
                  <div class="panel-title">
                    <strong>智能体</strong>
                    <span>{{ authorizationGovernance.agentBindings.length }}</span>
                  </div>
                  <div class="governance-list">
                    <div v-for="binding in authorizationGovernance.agentBindings.slice(0, 6)" :key="itemText(binding, ['agentId', 'id'])" class="governance-row">
                      <strong>{{ itemText(binding, ['agentId', 'id']) }}</strong>
                      <span>{{ itemText(binding, ['boundUserId', 'userId'], '未绑定用户') }}</span>
                      <small>{{ shortList(binding.groupIds || binding.groups, '无分组') }}</small>
                    </div>
                    <div v-if="authorizationGovernance.agentBindings.length === 0" class="governance-empty">暂无智能体绑定</div>
                  </div>
                </section>
                <section class="authorization-governance-panel">
                  <div class="panel-title">
                    <strong>智能体分组</strong>
                    <span>{{ authorizationGovernance.agentGroups.length }}</span>
                  </div>
                  <div class="governance-list">
                    <div v-for="group in authorizationGovernance.agentGroups.slice(0, 6)" :key="itemText(group, ['groupId', 'id'])" class="governance-row">
                      <strong>{{ itemText(group, ['label', 'groupId', 'id']) }}</strong>
                      <span>{{ policyCount(group) }} 个资源授权</span>
                      <small>{{ itemText(group, ['enabled'], 'true') === 'false' ? '停用' : '启用' }}</small>
                    </div>
                    <div v-if="authorizationGovernance.agentGroups.length === 0" class="governance-empty">暂无智能体分组</div>
                  </div>
                </section>
                <section class="authorization-governance-panel">
                  <div class="panel-title">
                    <strong>审批</strong>
                    <span>{{ authorizationGovernance.approvals.length }}</span>
                  </div>
                  <div class="governance-list">
                    <div v-for="approval in authorizationGovernance.approvals.slice(0, 6)" :key="itemText(approval, ['approvalId', 'id'])" class="governance-row">
                      <strong>{{ itemText(approval, ['grantKind', 'kind'], 'once') }}</strong>
                      <span>{{ itemText(approval, ['agentId'], '全部智能体') }} / {{ itemText(approval, ['userId'], '全部用户') }}</span>
                      <small>{{ itemText(approval, ['resourceId'], '*') }}</small>
                    </div>
                    <div v-if="authorizationGovernance.approvals.length === 0" class="governance-empty">暂无审批</div>
                  </div>
                </section>
              </div>
            </article>

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

<style scoped>
.authorization-governance-card {
  display: grid;
  gap: var(--space-4);
}

.authorization-governance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
}

.authorization-governance-editor {
  display: grid;
  gap: var(--space-3);
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}

.authorization-governance-editor label {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.authorization-governance-editor select,
.authorization-governance-editor textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-primary);
}

.authorization-governance-editor select {
  min-height: 36px;
  padding: 0 10px;
}

.authorization-governance-editor textarea {
  min-height: 160px;
  resize: vertical;
  padding: 10px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.governance-editor-status {
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 700;
}

.authorization-governance-panel {
  min-width: 0;
  display: grid;
  gap: var(--space-2);
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}

.panel-title,
.governance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-width: 0;
}

.panel-title span {
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 700;
}

.governance-list {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}

.governance-row {
  align-items: flex-start;
  padding: 8px 0;
  border-top: 1px solid var(--border-subtle);
}

.governance-row strong,
.governance-row span,
.governance-row small {
  min-width: 0;
  overflow-wrap: anywhere;
}

.governance-row strong {
  flex: 1 1 35%;
}

.governance-row span {
  flex: 1 1 45%;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.governance-row small {
  flex: 0 0 auto;
  color: var(--text-muted);
}

.governance-empty,
.inline-alert {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}
</style>
