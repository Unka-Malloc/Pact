<script setup lang="ts">
import { useAgentPermissionsViewContext } from "../../composables/agentPermissionsViewContext";

const {
  authorizationGovernance,
  authorizationGovernanceEditorBody,
  authorizationGovernanceEditorKind,
  authorizationGovernanceEditorKinds,
  authorizationGovernanceEditorStatus,
  authorizationGovernanceError,
  authorizationGovernanceMetrics,
  authorizationGovernanceSaving,
  itemText,
  policyCount,
  resetAuthorizationGovernanceEditor,
  saveAuthorizationGovernanceEditor,
  shortList,
} = useAgentPermissionsViewContext();
</script>

<template>
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
