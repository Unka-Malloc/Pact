<script setup lang="ts">
import { useConsole } from '../../composables/useConsole';
import ConfigFoldCard from '../../components/ConfigFoldCard.vue';
import FeatureToggle from '../../components/FeatureToggle.vue';
import ScopeSelector from '../../components/ScopeSelector.vue';
const {
  addAgentPermissionGroup,
  adminView,
  agentPermissionGroups,
  busyKey,
  currentView,
  ensureAgentPermissionGroupsDraft,
  filter,
  hasFeature,
  isAuthenticated,
  permissionGroupHasScope,
  permissionGroupHasToolset,
  removeAgentPermissionGroup,
  saveAgentPermissionSettings,
  settingsDraft,
  togglePermissionGroupScope,
  togglePermissionGroupToolset,
  toolManagementTools,
  toolManagementToolsets,
  toolRiskLabel,
  toolScopes,
} = useConsole();
</script>

<template>
          <section class="agent-permissions-layout">
            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>智能体权限</h3>
                  <p>权限组是智能体管理页可选择的预设；详细的权限层级、工具集和单工具例外只在这里维护。</p>
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
              <ConfigFoldCard title="第一层：权限控制层级" open>
                <ScopeSelector
                  v-model="group.scopeIds"
                  :scopes="toolScopes"
                  compact
                />
              </ConfigFoldCard>
              <ConfigFoldCard title="第二层：工具集权限" open>
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
            </article>
            <div v-if="settingsDraft.agentPermissionGroups.length === 0" class="empty-state">
              <strong>暂无权限组</strong>
              <span>先生成默认组或新增自定义权限组。</span>
            </div>
          </section>
</template>
