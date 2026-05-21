<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useConsole } from "./composables/useConsole";

// ─── Theme toggle ────────────────────────────────────────────────────────────
const THEME_KEY = 'agentstudio-theme';
type ThemeMode = 'system' | 'dark' | 'light';
const themeMode = ref<ThemeMode>('system');

function applyTheme(mode: ThemeMode) {
  const html = document.documentElement;
  html.classList.remove('theme-dark', 'theme-light');
  if (mode === 'dark') html.classList.add('theme-dark');
  if (mode === 'light') html.classList.add('theme-light');
  try { localStorage.setItem(THEME_KEY, mode); } catch (e) {}
  themeMode.value = mode;
}

function cycleTheme() {
  const next: Record<ThemeMode, ThemeMode> = { system: 'dark', dark: 'light', light: 'system' };
  applyTheme(next[themeMode.value]);
}

onMounted(() => {
  try {
    const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
    if (saved === 'dark' || saved === 'light') themeMode.value = saved;
  } catch (e) {}
});
import {
  AgentModelOptionBar,
  BinaryCheckbox,
  BrowseSelectButton,
  ConfigFoldCard,
  FeatureToggle,
  HistorySessionPanel,
  InfoFeedResultRow,
  OptionBar,
  StatusPill,
} from "./components/common";

const {
  adminView,
  agentEvidencePreviewOpen,
  authBootstrapping,
  authSessions,
  authUsers,
  busyKey,
  closeDrawer,
  closeServerPathPicker,
  consoleState,
  currentUser,
  currentView,
  debugTab,
  discoveryDraft,
  discoveryDraftDirty,
  discoveryModeOptionBarOptions,
  drawerOpen,
  drawerTab,
  error,
  errorNeedsKnowledgeImportAction,
  expertVocabularyDraft,
  expertVocabularyDraftDirty,
  formatMachineDate,
  hasAnyFeature,
  hasFeature,
  isAuthenticated,
  jsonPreview,
  jumpToKnowledgeFileImport,
  knowledgeTab,
  knowledgeTabDisplayLabel,
  logoutConsole,
  mountDraft,
  mountDraftDirty,
  newGrantLabel,
  newGrantScopes,
  newGrantToolsets,
  oidcAllowedDomainsText,
  oidcDraft,
  oidcRoleMappingText,
  openAdmin,
  openDebugTab,
  openDrawer,
  openKnowledgeTab,
  pathPicker,
  refreshState,
  rulesDraftDirty,
  rulesText,
  saveDiscovery,
  saveExpertVocabulary,
  saveOidcConfig,
  saveRules,
  saveSettings,
  evidenceReadableHtml,
  selectedEvidence,
  selectedEvidenceDisplayTitle,
  evidenceLoadError,
  evidenceReadableKind,
  evidenceSourceDetails,
  settingsDraft,
  settingsDraftDirty,
  sideNavOpen,
  switchView,
  viewTitle,
  visibleDebugTabs,
  visibleKnowledgeTabs,
  authAudit,
  authRoleOptionBarOptions,
  canAdminAuth,
  canBrowseServerPaths,
  canWriteJobs,
  closeAgentEvidencePreview,
  confirmServerPathPicker,
  enabledBooleanOptionBarOptions,
  formatBytes,
  formatCompactDate,
  loginForm,
  openAgentEvidencePreview,
  openLocalSourceDirectoryPicker,
  openMountPathPicker,
  openPathEntry,
  pathEntryMeta,
  pathPickerModeLabel,
  moduleGroups,
  enabledMountCount,
  totalMountCount,
  moduleAvailabilityLabel,
  moduleCapabilityText,
  moduleStatusText,
  currentModulePathPlaceholder,
  isMountPathEditing,
  toggleMountPathEdit,
  refreshAuthAdmin,
  refreshKnowledgeSource,
  refreshKnowledgeSources,
  refreshServerPathBrowser,
  reloadModules,
  revokeConsoleSession,
  addKnowledgeSource,
  saveMountModules,
  selectServerPath,
  activeKnowledgeSources,
  localSourceForm,
  syncLocalSourceLabelFromPath,
  sourceSyncTone,
  sourceSyncLabel,
  sourceDownloadStatusLabel,
  sourceIndexStatusLabel,
  sourceJobProgress,
  splitJobStatusLabel,
  updateKnowledgeSource,
  deleteKnowledgeSource,
  shortId,
  selectedEvidenceId,
  submitLoginAuth,
  updateConsoleUser,
  updateConsoleUserRole,
} = useConsole();
</script>

<template>
  <div class="dashboard-shell" :class="{ 'is-locked': !isAuthenticated }">
    <aside v-if="isAuthenticated" class="side-nav" :class="{ 'is-open': sideNavOpen }">
      <div class="brand-block" :class="{ 'is-loading': !consoleState }">
        <div class="brand-mark" aria-hidden="true">S</div>
        <div class="brand-text">
          <h1>AgentStudio</h1>
          <p class="brand-subtitle">
            <span v-if="!consoleState" class="brand-loading-label" aria-live="polite">
              正在初始化
              <span class="brand-loading-dots" aria-hidden="true">
                <span></span><span></span><span></span>
              </span>
            </span>
            <span v-else>Server Console</span>
          </p>
        </div>
        <div v-if="!consoleState" class="brand-progress-bar" aria-hidden="true">
          <div class="brand-progress-fill"></div>
        </div>
      </div>

      <nav class="side-nav-links">
        <button
          class="side-link"
          :class="{ active: currentView === 'dashboard' }"
          type="button"
          @click="switchView('dashboard')"
        >
          工作台
        </button>
        <button
          class="side-link"
          :class="{ active: currentView === 'feed' }"
          type="button"
          @click="switchView('feed')"
        >
          信息流
        </button>
        <button
          class="side-link"
          :class="{ active: currentView === 'sources' }"
          type="button"
          @click="switchView('sources')"
        >
          数据源
        </button>

        <button
          class="side-link"
          :class="{ active: currentView === 'workspaces' }"
          type="button"
          @click="$router.push('/workspaces')"
        >
          工作空间
        </button>

        <section v-if="hasFeature('knowledge-core')" class="side-nav-section" aria-label="知识库">
          <p class="side-nav-section-title">知识库</p>
          <button
            v-for="tab in visibleKnowledgeTabs"
            :key="tab.id"
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'knowledge' && knowledgeTab === tab.id }"
            type="button"
            @click="openKnowledgeTab(tab.id)"
          >
            {{ knowledgeTabDisplayLabel(tab) }}
          </button>
        </section>

        <section v-if="visibleDebugTabs.length > 0" class="side-nav-section" aria-label="调试面板">
          <p class="side-nav-section-title">调试面板</p>
          <button
            v-for="tab in visibleDebugTabs"
            :key="tab.id"
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'debug' && debugTab === tab.id }"
            type="button"
            @click="openDebugTab(tab.id)"
          >
            {{ tab.label }}
          </button>
        </section>

        <section
          v-if="hasAnyFeature(['agent-gateway', 'agent-management', 'agent-exploration', 'maintenance-agent-runbooks'])"
          class="side-nav-section"
          aria-label="智能体"
        >
          <p class="side-nav-section-title">智能体</p>
          <button
            v-if="hasFeature('agent-exploration')"
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'intelligence' }"
            type="button"
            @click="switchView('intelligence')"
          >
            智能分析
          </button>
          <button
            v-if="hasFeature('agent-management')"
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'agentManagement' }"
            type="button"
            @click="openAdmin('agentManagement')"
          >
            智能体管理
          </button>
          <button
            v-if="hasFeature('agent-gateway') || hasFeature('agent-management')"
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'tools' }"
            type="button"
            @click="openAdmin('tools')"
          >
            智能体工具
          </button>
          <button
            v-if="hasFeature('agent-management')"
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'agentPermissions' }"
            type="button"
            @click="openAdmin('agentPermissions')"
          >
            智能体权限
          </button>
          <button
            v-if="hasFeature('maintenance-agent-runbooks')"
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'maintenanceAgent' }"
            type="button"
            @click="openAdmin('maintenanceAgent')"
          >
            智能巡检
          </button>
          <button
            v-if="hasFeature('agent-gateway')"
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'agentConfig' }"
            type="button"
            @click="openAdmin('agentConfig')"
          >
            智能体配置
          </button>
        </section>

        <section class="side-nav-section" aria-label="客户端">
          <p class="side-nav-section-title">客户端</p>
          <button
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'clients' }"
            type="button"
            @click="openAdmin('clients')"
          >
            设备管理
          </button>
        </section>

        <section class="side-nav-section" aria-label="系统状态">
          <p class="side-nav-section-title">系统状态</p>
          <button
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'storage' }"
            type="button"
            @click="openAdmin('storage')"
          >
            概览
          </button>
          <button
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'jobs' }"
            type="button"
            @click="openAdmin('jobs')"
          >
            工作队列
          </button>
          <button
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'opsMonitor' }"
            type="button"
            @click="openAdmin('opsMonitor')"
          >
            运维监控
          </button>
          <button
            class="side-link side-link-subtle"
            :class="{ active: currentView === 'admin' && adminView === 'logs' }"
            type="button"
            @click="openAdmin('logs')"
          >
            日志记录
          </button>
        </section>

      </nav>

      <div class="side-nav-footer">
        <button class="side-cta" type="button" @click="openDrawer('discovery')">
          系统配置
        </button>
      </div>
    </aside>

    <div
      v-if="isAuthenticated && sideNavOpen"
      class="side-nav-backdrop"
      aria-hidden="true"
      @click="sideNavOpen = false"
    ></div>

    <main class="dashboard-canvas">
      <header v-if="isAuthenticated" class="topbar">
        <button
          class="topbar-hamburger"
          type="button"
          :aria-expanded="sideNavOpen"
          aria-label="切换导航"
          @click="sideNavOpen = !sideNavOpen"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div class="topbar-heading">
          <h2 class="topbar-page-title">{{ viewTitle }}</h2>
          <div class="identity-row">
            <span class="url-badge">{{
              consoleState?.server.url || "正在连接服务端…"
            }}</span>
            <span class="identity-chip">{{
              consoleState?.discovery?.value?.mode || "active"
            }}</span>
          </div>
        </div>

        <div class="topbar-tools">
          <span v-if="currentUser" class="identity-chip">
            {{ currentUser.displayName }} / {{ currentUser.roleLabel }}
          </span>
          <button
            class="tool-button tool-button-ghost tool-button-icon"
            type="button"
            :title="busyKey === 'refresh' ? '同步中…' : '刷新'"
            :disabled="busyKey === 'refresh'"
            :aria-label="busyKey === 'refresh' ? '同步中' : '刷新'"
            @click="refreshState({ forceDrafts: true })"
          >
            <!-- refresh/rotate icon -->
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="busyKey === 'refresh' ? 'animation:spin 1s linear infinite' : ''" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M8 16H3v5"/>
            </svg>
          </button>
          <button
            class="tool-button tool-button-ghost tool-button-icon"
            type="button"
            :title="themeMode === 'dark' ? '当前：深色模式（点击切换浅色）' : themeMode === 'light' ? '当前：浅色模式（点击切换跟随系统）' : '当前：跟随系统（点击切换深色）'"
            :aria-label="themeMode === 'dark' ? '深色模式' : themeMode === 'light' ? '浅色模式' : '跟随系统'"
            @click="cycleTheme"
          >
            <!-- moon: forced dark -->
            <svg v-if="themeMode === 'dark'" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
            <!-- sun: forced light -->
            <svg v-else-if="themeMode === 'light'" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
            </svg>
            <!-- monitor: system default -->
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <path d="M8 21h8M12 17v4"/>
            </svg>
          </button>
        </div>
      </header>

      <div class="view-content">
        <div v-if="error" class="status-strip danger">
          <strong>错误</strong>
          <span>{{ error }}</span>
          <button
            v-if="errorNeedsKnowledgeImportAction"
            class="status-strip-action"
            type="button"
            @click="jumpToKnowledgeFileImport"
          >
            去导入文件
          </button>
        </div>

        <template v-if="authBootstrapping || !isAuthenticated">
          <section class="auth-gate">
            <article class="surface-card auth-card">
              <div class="auth-brand">
                <div class="brand-mark" aria-hidden="true">S</div>
                <div>
                  <h1 class="auth-brand-name">AgentStudio</h1>
                  <p class="brand-subtitle">知识管理控制台</p>
                </div>
                <!-- connecting spinner -->
                <div v-if="authBootstrapping" class="auth-connecting" title="正在连接服务端…" aria-label="正在连接">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="auth-spinner-icon">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                </div>
              </div>
              <div class="section-header">
                <div>
                  <h3>{{ authBootstrapping ? '正在连接…' : '控制台登录' }}</h3>
                  <p>{{ authBootstrapping ? '正在确认登录状态，请稍候。' : '首次启动时服务端会自动创建 owner 并生成初始密码；账号创建和密码修改仅允许通过服务端命令行执行。' }}</p>
                </div>
              </div>

              <form class="form-grid auth-form" @submit.prevent="submitLoginAuth" :inert="authBootstrapping">
                <label>
                  <span>用户名</span>
                  <input v-model="loginForm.username" type="text" autocomplete="username" :disabled="authBootstrapping" />
                </label>
                <label>
                  <span>密码</span>
                  <input v-model="loginForm.password" type="password" autocomplete="current-password" :disabled="authBootstrapping" />
                </label>
                <button class="primary-action" type="submit" :disabled="authBootstrapping || busyKey === 'auth:login'">
                  {{ busyKey === "auth:login" ? "登录中" : "登录" }}
                </button>
              </form>
            </article>
          </section>
        </template>
        <!-- Authenticated: route-driven view rendering via Vue Router -->
        <template v-else-if="isAuthenticated">
          <RouterView />
        </template>
      </div>
    </main>
    <div v-if="isAuthenticated && drawerOpen" class="drawer-backdrop" @click="closeDrawer()"></div>

    <aside v-if="isAuthenticated" class="config-drawer" :class="{ open: drawerOpen }">
      <header class="drawer-header">
        <div>
          <h3>控制台选项</h3>
        </div>
        <button
          class="tool-button tool-button-ghost"
          type="button"
          @click="closeDrawer()"
        >
          关闭
        </button>
      </header>

      <div class="drawer-tabs">
        <button
          class="drawer-tab"
          :class="{ active: drawerTab === 'discovery' }"
          type="button"
          @click="openDrawer('discovery')"
        >
          服务发现
        </button>
        <button
          v-if="hasFeature('analysis-runtime')"
          class="drawer-tab"
          :class="{ active: drawerTab === 'users' }"
          type="button"
          @click="openDrawer('users')"
        >
          用户管理
        </button>
        <button
          class="drawer-tab"
          :class="{ active: drawerTab === 'modules' }"
          type="button"
          @click="openDrawer('modules')"
        >
          模块管理
        </button>
        <button
          v-if="hasFeature('knowledge-core')"
          class="drawer-tab"
          :class="{ active: drawerTab === 'syncDirectories' }"
          type="button"
          @click="openDrawer('syncDirectories')"
        >
          目录管理
        </button>
      </div>

      <div class="drawer-content">
        <form
          v-if="drawerTab === 'discovery'"
          class="drawer-panel"
          @submit.prevent="saveDiscovery"
        >
          <div class="panel-header">
            <h4>服务发现</h4>
          </div>

          <div class="form-grid">
            <label>
              <span>服务 ID</span>
              <input v-model="discoveryDraft.serverId" autocomplete="off" />
            </label>
            <label>
              <span>服务标签</span>
              <input v-model="discoveryDraft.serverLabel" autocomplete="off" />
            </label>
            <label>
              <span>引导地址</span>
              <input
                v-model="discoveryDraft.bootstrapBaseUrl"
                autocomplete="off"
              />
            </label>
            <label>
              <span>对外服务地址</span>
              <input
                v-model="discoveryDraft.advertisedBaseUrl"
                autocomplete="off"
              />
            </label>
            <label>
              <span>活跃服务地址</span>
              <input
                v-model="discoveryDraft.activeServiceUrl"
                autocomplete="off"
              />
            </label>
            <label>
              <span>转发目标地址</span>
              <input
                v-model="discoveryDraft.forwardBaseUrl"
                autocomplete="off"
              />
            </label>
            <OptionBar
              v-model="discoveryDraft.mode"
              label="运行模式"
              :options="discoveryModeOptionBarOptions"
            />
            <label>
              <span>配置版本</span>
              <input
                v-model="discoveryDraft.configVersion"
                autocomplete="off"
              />
            </label>
            <label>
              <span>刷新周期（秒）</span>
              <input
                v-model.number="discoveryDraft.refreshIntervalSeconds"
                min="5"
                type="number"
              />
            </label>
            <label>
              <span>签到周期（秒）</span>
              <input
                v-model.number="discoveryDraft.checkInIntervalSeconds"
                min="5"
                type="number"
              />
            </label>
            <label>
              <span>离线判定（秒）</span>
              <input
                v-model.number="discoveryDraft.offlineAfterSeconds"
                min="30"
                type="number"
              />
            </label>
          </div>

          <button
            class="tool-button"
            type="submit"
            :disabled="busyKey === 'discovery'"
          >
            {{ busyKey === "discovery" ? "保存中" : "保存服务发现" }}
          </button>
        </form>

        <section v-else-if="drawerTab === 'users'" class="drawer-panel">
          <div class="panel-header">
            <h4>用户与审计</h4>
            <p>用户创建和密码修改仅允许在服务端命令行执行。</p>
          </div>

          <template v-if="canAdminAuth">
            <div class="drawer-actions">
              <button class="tool-button tool-button-ghost" type="button" @click="refreshAuthAdmin">
                刷新
              </button>
            </div>

            <section class="module-panel">
              <div class="module-panel-heading">
                <strong>控制台用户</strong>
                <span>{{ authUsers.length }} 个账号</span>
              </div>
              <div class="job-table compact-job-table drawer-auth-table">
                <div class="job-table-header">
                  <span>用户</span>
                  <span>角色</span>
                  <span>状态</span>
                </div>
                <div v-for="user in authUsers" :key="user.userId" class="job-row">
                  <span>{{ user.displayName }} / {{ user.username }}</span>
                  <OptionBar
                    :model-value="user.roleId"
                    :options="authRoleOptionBarOptions"
                    @change="updateConsoleUserRole(user, String($event))"
                  />
                  <button
                    class="table-action"
                    type="button"
                    :disabled="busyKey === `auth:user:${user.userId}`"
                    @click="updateConsoleUser(user, { enabled: !user.enabled })"
                  >
                    {{ user.enabled ? "停用" : "启用" }}
                  </button>
                </div>
              </div>
            </section>

            <section class="module-panel">
              <div class="module-panel-heading">
                <strong>OIDC 配置</strong>
                <span>{{ oidcDraft.enabled ? "已启用" : "未启用" }}</span>
              </div>
              <div class="form-grid compact-form-grid">
                <OptionBar
                  v-model="oidcDraft.enabled"
                  label="启用"
                  :options="enabledBooleanOptionBarOptions"
                />
                <label>
                  <span>Issuer</span>
                  <input v-model="oidcDraft.issuer" autocomplete="off" />
                </label>
                <label>
                  <span>Client ID</span>
                  <input v-model="oidcDraft.clientId" autocomplete="off" />
                </label>
                <label>
                  <span>Client Secret</span>
                  <input v-model="oidcDraft.clientSecret" type="password" autocomplete="off" placeholder="只写不读" />
                </label>
                <label>
                  <span>Redirect URI</span>
                  <input v-model="oidcDraft.redirectUri" autocomplete="off" />
                </label>
              </div>
              <label class="json-editor">
                <span>Allowed Domains</span>
                <textarea v-model="oidcAllowedDomainsText" rows="3"></textarea>
              </label>
              <label class="json-editor">
                <span>Role Mapping JSON</span>
                <textarea v-model="oidcRoleMappingText" rows="4" spellcheck="false"></textarea>
              </label>
              <button
                class="tool-button"
                type="button"
                :disabled="busyKey === 'auth:oidc'"
                @click="saveOidcConfig"
              >
                {{ busyKey === "auth:oidc" ? "保存中" : "保存 OIDC" }}
              </button>
            </section>

            <section class="module-panel">
              <div class="module-panel-heading">
                <strong>会话与审计</strong>
                <span>{{ authSessions.length }} 个会话 / {{ authAudit.length }} 条审计</span>
              </div>
              <div class="job-table compact-job-table drawer-auth-table">
                <div class="job-table-header">
                  <span>会话</span>
                  <span>用户</span>
                  <span>操作</span>
                </div>
                <div v-for="session in authSessions" :key="String(session.sessionId)" class="job-row">
                  <span>{{ session.sessionId }}</span>
                  <span>{{ session.username }} / {{ session.roleId }}</span>
                  <button
                    class="table-action"
                    type="button"
                    :disabled="busyKey === `auth:session:${session.sessionId}`"
                    @click="revokeConsoleSession(String(session.sessionId))"
                  >
                    撤销
                  </button>
                </div>
              </div>
              <div class="job-table compact-job-table audit-table">
                <div class="job-table-header">
                  <span>时间</span>
                  <span>操作</span>
                  <span>结果</span>
                </div>
                <div v-for="item in authAudit" :key="item.auditId" class="job-row">
                  <span>{{ formatCompactDate(item.createdAt) }}</span>
                  <span>{{ item.username || "system" }} / {{ item.operationId || item.action }}</span>
                  <span>{{ item.status }} {{ item.error }}</span>
                </div>
              </div>
            </section>
          </template>

          <div v-else class="empty-state">
            <strong>权限不足</strong>
            <span>需要 auth:admin 权限才能管理用户、OIDC、会话和审计。</span>
          </div>
        </section>

        <section v-else-if="drawerTab === 'modules' && hasFeature('analysis-runtime')" class="drawer-panel">
          <div class="panel-header">
            <h4>模块管理</h4>
            <p>运行代次 {{ consoleState?.runtime?.mountGeneration || 0 }}，可用 {{ enabledMountCount }}/{{ totalMountCount }}</p>
          </div>

          <div class="drawer-actions">
            <button
              class="tool-button tool-button-ghost"
              type="button"
              :disabled="busyKey === 'module-reload'"
              @click="reloadModules"
            >
              {{ busyKey === "module-reload" ? "重载中" : "重载模块" }}
            </button>
            <button
              class="tool-button"
              type="button"
              :disabled="busyKey === 'mounts'"
              @click="saveMountModules"
            >
              {{ busyKey === "mounts" ? "保存中" : "保存配置" }}
            </button>
          </div>

          <section
            v-for="group in moduleGroups"
            :key="group.id"
            class="module-panel"
          >
            <div class="module-panel-heading">
              <strong>{{ group.label }}</strong>
              <span>{{ group.description }}</span>
            </div>

            <article
              v-for="item in group.rows"
              :key="item.name"
              class="mount-config-item drawer-mount-item"
              :data-enabled="item.externalEnabled"
            >
              <div class="mount-config-main">
                <div class="mount-config-heading">
                  <strong>{{ item.label }}</strong>
	                  <StatusPill
	                    :enabled="item.externalEnabled"
	                    :label="moduleAvailabilityLabel(item)"
	                  />
                </div>
                <p>{{ item.description }}</p>
                <dl class="module-status-list">
                  <div>
                    <dt>运行实例</dt>
                    <dd>{{ item.runtimeMount?.id || "未加载" }}</dd>
                  </div>
                  <div>
                    <dt>能力</dt>
                    <dd>{{ moduleCapabilityText(item) }}</dd>
                  </div>
                  <div>
                    <dt>运行状态</dt>
                    <dd>{{ moduleStatusText(item) }}</dd>
                  </div>
                </dl>
              </div>

              <div class="mount-config-controls">
                <label class="module-field">
                  <span>模块路径</span>
                  <div class="path-field">
                    <input
                      v-model="mountDraft[item.name]"
                      autocomplete="off"
                      :disabled="!isMountPathEditing(item.name)"
                      :placeholder="currentModulePathPlaceholder(item)"
                    />
                    <BrowseSelectButton
                      kind="server-file"
                      button-class="path-action-button"
                      button-text="浏览"
                      size="small"
                      :disabled="!canBrowseServerPaths"
                      plain
                      @browse="openMountPathPicker(item.name)"
                    />
                  </div>
                </label>
                <button
                  class="tool-button tool-button-ghost compact-action"
                  type="button"
                  :disabled="busyKey === `mount:${item.name}`"
                  @click="toggleMountPathEdit(item)"
                >
                  {{ isMountPathEditing(item.name) ? "确认" : "修改" }}
                </button>
              </div>
            </article>
          </section>
        </section>

        <section v-else-if="drawerTab === 'syncDirectories' && hasFeature('knowledge-core')" class="drawer-panel">
          <div class="panel-header">
            <h4>目录管理</h4>
            <p>填写服务端可访问的本地目录。目录变化后会自动整理并更新知识库，也可以手动刷新。</p>
          </div>

          <div class="drawer-actions">
            <button
              class="tool-button"
              type="button"
              :disabled="busyKey === 'knowledge:sources'"
              @click="refreshKnowledgeSources"
            >
              {{ busyKey === "knowledge:sources" ? "刷新中" : "刷新状态" }}
            </button>
          </div>

          <form class="knowledge-source-form" @submit.prevent="addKnowledgeSource">
            <label class="source-name-field">
              <span>目录名称</span>
              <input v-model="localSourceForm.label" type="text" placeholder="例如：公司共享资料" autocomplete="off" />
            </label>
            <label class="source-path-field">
              <span>本地路径</span>
              <div class="path-field">
                <input
                  v-model="localSourceForm.directoryPath"
                  type="text"
                  placeholder="/Users/you/Documents/Knowledge"
                  autocomplete="off"
                  @change="syncLocalSourceLabelFromPath"
                />
                <BrowseSelectButton
                  kind="server-directory"
                  button-class="path-action-button"
                  button-text="浏览"
                  size="small"
                  :disabled="!canBrowseServerPaths"
                  plain
                  @browse="openLocalSourceDirectoryPicker"
                />
              </div>
            </label>
            <div class="source-sync-row">
              <BinaryCheckbox
                v-model="localSourceForm.autoSync"
                label="自动监听变化"
              />
              <BinaryCheckbox
                v-model="localSourceForm.recursive"
                label="包含子目录"
              />
              <BinaryCheckbox
                v-model="localSourceForm.hydrationEnabled"
                label="自动下载"
              />
              <button
                class="primary-action"
                type="submit"
                :disabled="!canWriteJobs || busyKey === 'knowledge:sources:add'"
              >
                {{ busyKey === "knowledge:sources:add" ? "添加中" : "添加目录" }}
              </button>
            </div>
          </form>

          <div class="knowledge-source-list">
            <article
              v-for="source in activeKnowledgeSources"
              :key="source.sourceId"
              class="knowledge-source-card"
            >
              <div class="knowledge-source-card-header">
                <div>
                  <strong>{{ source.label }}</strong>
                  <span>{{ source.directoryPath }}</span>
                </div>
                <StatusPill :tone="sourceSyncTone(source)" :label="sourceSyncLabel(source)" />
              </div>
              <dl class="meta-list source-meta-list">
                <div>
                  <dt>文件</dt>
                  <dd>{{ source.lastFileCount || 0 }} 个 / {{ formatBytes(source.lastTotalBytes) }}</dd>
                </div>
                <div>
                  <dt>最近扫描</dt>
                  <dd>{{ formatCompactDate(source.lastScanAt) || "未扫描" }}</dd>
                </div>
                <div>
                  <dt>监听</dt>
                  <dd>{{ source.watcherStatus }} / {{ source.watcherCount || 0 }}</dd>
                </div>
                <div>
                  <dt>自动下载</dt>
                  <dd>
                    {{ sourceDownloadStatusLabel(source) }}
                    / {{ source.lastHydratedFileCount || 0 }} 可入库
                    <template v-if="source.lastHydrationFailedCount"> / {{ source.lastHydrationFailedCount }} 待处理</template>
                  </dd>
                </div>
                <div>
                  <dt>原文索引</dt>
                  <dd>
                    {{ sourceIndexStatusLabel(source) }}
                    / {{ source.lastIndexedFileCount || 0 }} 文件
                    <template v-if="source.lastIndexFailedCount"> / {{ source.lastIndexFailedCount }} 失败</template>
                  </dd>
                </div>
                <div>
                  <dt>最近任务</dt>
                  <dd>{{ source.lastJobId || "无" }}</dd>
                </div>
                <div>
                  <dt>断点树</dt>
                  <dd>
                    同步 {{ shortId(source.lastSyncCheckpointTreeId) }}
                    / 索引 {{ shortId(source.lastIndexCheckpointTreeId) }}
                  </dd>
                </div>
              </dl>
              <p
                v-if="source.lastHydrationFailureSamples?.length"
                class="module-note warning-note"
              >
                待下载：{{ source.lastHydrationFailureSamples.slice(0, 3).map((item) => `${item.relativePath || "文件"}：${item.reason || "未下载"}`).join("；") }}
              </p>
              <p v-if="source.lastIndexError" class="module-note warning-note">
                原文索引：{{ source.lastIndexError }}
              </p>
              <div v-if="source.lastJobId" class="source-progress">
                <div>
                  <span>{{ splitJobStatusLabel(source.lastJobStatus) }}</span>
                  <small>{{ source.lastJobStage || "等待开始" }}</small>
                </div>
                <progress :value="sourceJobProgress(source)" max="100" />
              </div>
              <p v-if="source.error" class="module-note danger-note">{{ source.error }}</p>
              <div class="source-actions">
                <button
                  class="tool-button"
                  type="button"
                  :disabled="busyKey === `knowledge:source:refresh:${source.sourceId}`"
                  @click="refreshKnowledgeSource(source)"
                >
                  手动刷新
                </button>
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  :disabled="busyKey === `knowledge:source:refresh:${source.sourceId}`"
                  @click="refreshKnowledgeSource(source, true)"
                >
                  重新整理
                </button>
                <button
                  class="tool-button tool-button-ghost"
                  type="button"
                  :disabled="busyKey === `knowledge:source:${source.sourceId}`"
                  @click="updateKnowledgeSource(source, { enabled: !source.enabled })"
                >
                  {{ source.enabled ? "暂停" : "启用" }}
                </button>
                <button
                  class="table-action"
                  type="button"
                  :disabled="busyKey === `knowledge:source:delete:${source.sourceId}`"
                  @click="deleteKnowledgeSource(source)"
                >
                  删除
                </button>
              </div>
            </article>
            <div v-if="activeKnowledgeSources.length === 0" class="empty-state">
              <strong>暂无目录</strong>
              <span>添加一个服务端本地目录后，文件变化会自动触发整理任务。</span>
            </div>
          </div>
        </section>
      </div>
    </aside>

    <div
      v-if="agentEvidencePreviewOpen"
      class="agent-evidence-preview-backdrop"
      @click.self="closeAgentEvidencePreview"
    >
      <section class="agent-evidence-preview-dialog" role="dialog" aria-modal="true" aria-label="证据预览">
        <div class="agent-evidence-preview-header">
          <div>
            <h3>{{ selectedEvidenceDisplayTitle }}</h3>
            <span v-if="selectedEvidenceId">{{ selectedEvidenceId }}</span>
          </div>
          <button
            class="tool-button tool-button-ghost compact-action"
            type="button"
            @click="closeAgentEvidencePreview"
          >
            关闭
          </button>
        </div>

        <template v-if="selectedEvidence">
          <section class="evidence-text agent-evidence-preview-body">
            <div class="evidence-text-heading">
              <h4>原始文件</h4>
              <span>{{ evidenceReadableKind }}</span>
            </div>
            <div class="evidence-rendered-content" v-html="evidenceReadableHtml"></div>
          </section>
          <ConfigFoldCard class="evidence-source-details" title="来源定位">
            <dl class="meta-list evidence-summary-list">
              <div
                v-for="item in evidenceSourceDetails()"
                :key="item.label"
              >
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </div>
            </dl>
          </ConfigFoldCard>
        </template>
        <div v-else-if="evidenceLoadError" class="knowledge-preview-empty evidence-preview-error">
          <strong>证据无法打开</strong>
          <span>{{ evidenceLoadError }}</span>
          <button
            class="tool-button tool-button-ghost compact-action"
            type="button"
            :disabled="!selectedEvidenceId || busyKey.startsWith('knowledge:evidence:')"
            @click="selectedEvidenceId ? openAgentEvidencePreview(selectedEvidenceId) : undefined"
          >
            重试
          </button>
        </div>
        <div v-else class="knowledge-preview-empty">
          <strong>{{ busyKey.startsWith("knowledge:evidence:") ? "正在加载证据" : "没有证据内容" }}</strong>
          <span>{{ busyKey.startsWith("knowledge:evidence:") ? "正在打开来源。" : "暂未选择来源。" }}</span>
        </div>
      </section>
    </div>

    <div v-if="pathPicker.open" class="path-picker-backdrop" @click.self="closeServerPathPicker">
      <section class="path-picker-dialog" role="dialog" aria-modal="true" :aria-label="pathPicker.title">
        <div class="path-picker-header">
          <div>
            <h3>{{ pathPicker.title }}</h3>
            <p>选择服务端可访问的{{ pathPickerModeLabel(pathPicker.mode) }}路径。</p>
          </div>
          <button
            class="path-picker-close-button"
            type="button"
            aria-label="关闭"
            @click="closeServerPathPicker"
          >
            ×
          </button>
        </div>

        <div class="path-picker-roots">
          <button
            v-for="root in pathPicker.response?.roots || []"
            :key="root.path"
            class="table-action"
            type="button"
            @click="refreshServerPathBrowser(root.path)"
          >
            {{ root.label }}
          </button>
        </div>

        <div class="path-picker-toolbar">
          <input :value="pathPicker.response?.currentPath || pathPicker.value" readonly />
          <button
            class="tool-button tool-button-ghost compact-action"
            type="button"
            :disabled="!pathPicker.response?.parentPath"
            @click="refreshServerPathBrowser(pathPicker.response?.parentPath)"
          >
            上一级
          </button>
          <button class="tool-button tool-button-ghost compact-action" type="button" @click="refreshServerPathBrowser()">
            刷新
          </button>
          <BinaryCheckbox
            v-model="pathPicker.includeHidden"
            label="显示隐藏项"
            @change="refreshServerPathBrowser()"
          />
        </div>

        <p v-if="pathPicker.extensions.length" class="module-note">
          只显示可选文件类型：{{ pathPicker.extensions.join(", ") }}
        </p>
        <p v-if="pathPicker.error" class="module-note danger-note">{{ pathPicker.error }}</p>
        <p v-if="pathPicker.response?.truncated" class="module-note">
          当前目录内容较多，只显示前 600 项。
        </p>

        <div class="path-picker-list">
          <article
            v-for="entry in pathPicker.response?.entries || []"
            :key="entry.path"
            class="path-picker-entry"
            :data-selectable="entry.selectable"
          >
            <span class="path-picker-entry-icon" :data-type="entry.type" aria-hidden="true"></span>
            <div
              class="path-picker-entry-main"
              :class="{ 'is-browsable': entry.browsable }"
              :role="entry.browsable ? 'button' : undefined"
              :tabindex="entry.browsable ? 0 : undefined"
              @click="entry.browsable ? openPathEntry(entry) : undefined"
              @keydown.enter="entry.browsable ? openPathEntry(entry) : undefined"
              @keydown.space.prevent="entry.browsable ? openPathEntry(entry) : undefined"
            >
              <strong>{{ entry.name }}</strong>
              <span>{{ entry.path }}</span>
              <small v-if="pathEntryMeta(entry)">{{ pathEntryMeta(entry) }}</small>
            </div>
            <div class="path-picker-entry-actions">
              <button
                v-if="entry.selectable"
                class="tool-button compact-action"
                type="button"
                @click="selectServerPath(entry.path)"
              >
                选择
              </button>
            </div>
          </article>
          <div v-if="!pathPicker.loading && (pathPicker.response?.entries || []).length === 0" class="empty-state">
            <strong>没有可显示的项目</strong>
            <span>可以切换根目录、上一级目录，或显示隐藏项。</span>
          </div>
          <div v-if="pathPicker.loading" class="empty-state">
            <strong>正在读取目录</strong>
            <span>请稍候。</span>
          </div>
        </div>

        <div class="path-picker-footer">
          <button
            v-if="!pathPicker.closeOnSelect"
            class="tool-button"
            type="button"
            @click="confirmServerPathPicker"
          >
            确认
          </button>
          <button class="tool-button tool-button-ghost" type="button" @click="closeServerPathPicker">
            取消
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
