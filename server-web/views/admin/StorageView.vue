<script setup lang="ts">
import { useConsole } from '../../composables/useConsole';
import {
  BinaryCheckbox,
  BrowseSelectButton,
  ConfigFoldCard,
  OptionBar,
  StatusPill,
} from '../../components/common';
const {
  adminView,
  agentEvidencePreviewOpen,
  authAudit,
  authRoleOptionBarOptions,
  authSessions,
  authUsers,
  busyKey,
  canAdminAuth,
  canBrowseServerPaths,
  closeAgentEvidencePreview,
  closeDrawer,
  closeServerPathPicker,
  confirmServerPathPicker,
  consoleState,
  currentView,
  enabledMountCount,
  totalMountCount,
  activeJobCount,
  attentionClientCount,
  discoveryDraft,
  discoveryModeOptionBarOptions,
  drawerOpen,
  drawerTab,
  enabledBooleanOptionBarOptions,
  error,
  evidenceLoadError,
  evidenceReadableHtml,
  evidenceReadableKind,
  evidenceSourceDetails,
  formatCompactDate,
  hasFeature,
  isAuthenticated,
  mountDraft,
  oidcAllowedDomainsText,
  oidcDraft,
  oidcRoleMappingText,
  openAgentEvidencePreview,
  openDrawer,
  openMountPathPicker,
  openPathEntry,
  moduleGroups,
  moduleAvailabilityLabel,
  moduleCapabilityText,
  moduleStatusText,
  currentModulePathPlaceholder,
  isMountPathEditing,
  toggleMountPathEdit,
  pathEntryMeta,
  pathPicker,
  pathPickerModeLabel,
  refreshAuthAdmin,
  refreshServerPathBrowser,
  reloadModules,
  revokeConsoleSession,
  saveDiscovery,
  saveMountModules,
  saveOidcConfig,
  selectServerPath,
  selectedEvidence,
  selectedEvidenceDisplayTitle,
  selectedEvidenceId,
  switchView,
  updateConsoleUser,
  updateConsoleUserRole,
  currentUser,
  logoutConsole,
} = useConsole();
</script>

<template>
  <section id="storage" class="detail-grid">
    <article class="surface-card detail-card system-overview-card">
      <div class="section-header">
        <div>
          <h3>概览</h3>
        </div>
      </div>

      <section class="metric-grid system-overview-metrics">
        <article class="metric-card" data-tone="primary">
          <div class="metric-card-header">
            <span>数据源能力</span>
            <strong>{{ enabledMountCount }}/{{ totalMountCount }}</strong>
          </div>
          <h3>{{ enabledMountCount }}</h3>
          <div class="metric-progress">
            <div
              class="metric-progress-bar"
              :style="{
                width: `${totalMountCount ? (enabledMountCount / totalMountCount) * 100 : 0}%`,
              }"
            />
          </div>
          <p>当前可用的导入、解析与索引能力。</p>
        </article>

        <article class="metric-card" data-tone="accent">
          <div class="metric-card-header">
            <span>活跃任务</span>
            <strong>{{ activeJobCount }}</strong>
          </div>
          <h3>{{ consoleState?.jobs?.summary?.totalCount || 0 }}</h3>
          <p>
            运行中
            {{ consoleState?.jobs?.summary?.runningCount || 0 }}，排队
            {{ consoleState?.jobs?.summary?.queuedCount || 0 }}
          </p>
        </article>

        <article class="metric-card" data-tone="neutral">
          <div class="metric-card-header">
            <span>存储批次</span>
            <strong>{{ consoleState?.storage?.batchCount || 0 }}</strong>
          </div>
          <h3>{{ consoleState?.storage?.sourceCount || 0 }}</h3>
          <p>
            邮件 {{ consoleState?.storage?.emailCount || 0 }}，事务
            {{ consoleState?.storage?.transactionCount || 0 }}
          </p>
        </article>

        <article class="metric-card" data-tone="success">
          <div class="metric-card-header">
            <span>待关注</span>
            <strong>{{
              consoleState?.clients?.summary?.totalCount || 0
            }}</strong>
          </div>
          <h3>{{ attentionClientCount }}</h3>
          <p>任务、设备或服务状态需要处理。</p>
        </article>
      </section>

      <div class="detail-metrics">
        <div>
          <span>原始对象</span>
          <strong>{{
            consoleState?.storage?.rawObjectCount || 0
          }}</strong>
        </div>
        <div>
          <span>线程</span>
          <strong>{{ consoleState?.storage?.threadCount || 0 }}</strong>
        </div>
        <div>
          <span>人物</span>
          <strong>{{ consoleState?.storage?.peopleCount || 0 }}</strong>
        </div>
        <div>
          <span>检索项</span>
          <strong>{{
            consoleState?.storage?.retrievalCount || 0
          }}</strong>
        </div>
      </div>

      <dl class="meta-list">
        <div>
          <dt>批次</dt>
          <dd>{{ consoleState?.storage?.batchCount || 0 }}</dd>
        </div>
        <div>
          <dt>数据源</dt>
          <dd>{{ consoleState?.storage?.sourceCount || 0 }}</dd>
        </div>
      </dl>
    </article>

    <article class="surface-card detail-card">
      <div class="section-header">
        <div>
          <h3>运行状态</h3>
        </div>
        <button
          class="inline-link"
          type="button"
          @click="switchView('intelligence')"
        >
          查看智能设置
        </button>
      </div>

      <dl class="meta-list">
        <div>
          <dt>运行档位</dt>
          <dd>{{ consoleState?.runtime?.profile || "default" }}</dd>
        </div>
        <div>
          <dt>挂载代次</dt>
          <dd>{{ consoleState?.runtime?.mountGeneration || 0 }}</dd>
        </div>
        <div>
          <dt>挂载模块</dt>
          <dd>{{ enabledMountCount }}/{{ totalMountCount }}</dd>
        </div>
      </dl>
    </article>

    <article class="surface-card detail-card">
      <div class="section-header">
        <div>
          <h3>引导网络</h3>
        </div>
        <button
          class="inline-link"
          type="button"
          @click="openDrawer('discovery')"
        >
          修改
        </button>
      </div>

      <dl class="meta-list">
        <div>
          <dt>服务 ID</dt>
          <dd>
            {{ consoleState?.discovery?.value?.serverId || "未配置" }}
          </dd>
        </div>
        <div>
          <dt>对外服务地址</dt>
          <dd>
            {{
              consoleState?.discovery?.value?.advertisedBaseUrl ||
              "未配置"
            }}
          </dd>
        </div>
        <div>
          <dt>活跃服务地址</dt>
          <dd>
            {{
              consoleState?.discovery?.value?.activeServiceUrl || "未配置"
            }}
          </dd>
        </div>
        <div>
          <dt>配置版本</dt>
          <dd>
            {{
              consoleState?.discovery?.value?.configVersion || "未配置"
            }}
          </dd>
        </div>
      </dl>
    </article>

    <article class="surface-card detail-card">
      <div class="section-header">
        <div>
          <h3>当前会话</h3>
        </div>
      </div>
      <dl class="meta-list" v-if="currentUser">
        <div>
          <dt>用户</dt>
          <dd>{{ currentUser.displayName }}</dd>
        </div>
        <div>
          <dt>角色</dt>
          <dd>{{ currentUser.roleLabel }}</dd>
        </div>
      </dl>
      <div class="section-actions" style="margin-top: 12px;">
        <button
          class="tool-button tool-button-ghost"
          type="button"
          :disabled="busyKey === 'auth:logout'"
          @click="logoutConsole"
        >
          退出登录
        </button>
      </div>
    </article>
  </section>
</template>
