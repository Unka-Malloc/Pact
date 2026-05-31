import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useConsole } from "./useConsole";
import { collectPageRefreshTasks } from "./usePageRefresh";
import { CONSOLE_LANGUAGE_KEY, consoleLocales, consoleMessages, installConsoleDomLocalizer, localizeConsoleText, setConsoleLocaleState, type ConsoleLocale } from "../i18n/console";

export function useServerConsoleShell() {
  // ─── Theme toggle ────────────────────────────────────────────────────────────
  const THEME_KEY = 'pact-theme';
  const LANGUAGE_KEY = CONSOLE_LANGUAGE_KEY;
  type ThemeMode = 'system' | 'dark' | 'light';
  const themeMode = ref<ThemeMode>('system');
  const languageMode = ref<ConsoleLocale>('zh-CN');
  let consoleDomLocalizer: ReturnType<typeof installConsoleDomLocalizer> | null = null;
  const languageOptionBarOptions = computed(() =>
    consoleLocales.map((locale) => ({
      value: locale.value,
      label:
        languageMode.value === 'en'
          ? locale.value === 'en'
            ? 'English'
            : 'Simplified Chinese'
          : locale.label,
    })),
  );
  const msg = computed(() => consoleMessages[languageMode.value]);

  function applyTheme(mode: ThemeMode) {
    const html = document.documentElement;
    html.classList.remove('theme-dark', 'theme-light');
    if (mode === 'dark') html.classList.add('theme-dark');
    if (mode === 'light') html.classList.add('theme-light');
    try { window.localStorage.setItem(THEME_KEY, mode); } catch (e) {}
    themeMode.value = mode;
  }

  function cycleTheme() {
    const next: Record<ThemeMode, ThemeMode> = { system: 'dark', dark: 'light', light: 'system' };
    applyTheme(next[themeMode.value]);
  }

  function applyLanguage(mode: ConsoleLocale) {
    document.documentElement.lang = mode === 'en' ? 'en' : 'zh-CN';
    document.title = consoleMessages[mode].appTitle;
    try { window.localStorage.setItem(LANGUAGE_KEY, mode); } catch (e) {}
    setConsoleLocaleState(mode);
    languageMode.value = mode;
    void nextTick(() => consoleDomLocalizer?.refresh());
  }

  function setLanguage(value: string | number | boolean) {
    applyLanguage(value === 'en' ? 'en' : 'zh-CN');
  }

  function toggleLanguage() {
    applyLanguage(languageMode.value === 'en' ? 'zh-CN' : 'en');
  }

  function tt(text: string) {
    return localizeConsoleText(text, languageMode.value);
  }

  onMounted(() => {
    try {
      const saved = window.localStorage.getItem(THEME_KEY) as ThemeMode | null;
      if (saved === 'dark' || saved === 'light') themeMode.value = saved;
    } catch (e) {}
    try {
      const savedLanguage = window.localStorage.getItem(LANGUAGE_KEY) as ConsoleLocale | null;
      if (savedLanguage === 'en' || savedLanguage === 'zh-CN') {
        applyLanguage(savedLanguage);
      } else {
        applyLanguage(languageMode.value);
      }
    } catch (e) {
      applyLanguage(languageMode.value);
    }
    consoleDomLocalizer = installConsoleDomLocalizer(() => languageMode.value);
  });

  watch(languageMode, async () => {
    await nextTick();
    consoleDomLocalizer?.refresh();
  });

  onBeforeUnmount(() => {
    consoleDomLocalizer?.disconnect();
    consoleDomLocalizer = null;
  });

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
    serverAvailable,
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
    refreshAuthAdmin,
    refreshAuthState,
    refreshBackgroundProcesses,
    refreshClientRuntimeStatus,
    refreshCodexOAuthStatus,
    refreshContextCompiler,
    refreshDashboardAlertsSnapshot,
    refreshExpertRules,
    refreshKnowledgeConflicts,
    refreshKnowledgeConsole,
    refreshKnowledgeSources,
    refreshMaintenanceAgent,
    refreshMcpAuthorizationRequests,
    refreshMonitorAlerts,
    refreshState,
    refreshToolManagement,
    refreshWordCloud,
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
    refreshKnowledgeSource,
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

  const route = useRoute();
  const activeRouteView = computed(() => String(route.meta?.viewId || currentView.value));
  const activeRouteKnowledgeTab = computed(() => String(route.params.tab || knowledgeTab.value));
  const activeRouteDebugTab = computed(() => String(route.params.tab || debugTab.value));
  const activeRouteAdminView = computed(() => String(route.meta?.adminView || adminView.value));
  const serviceUrl = computed(() => consoleState.value?.server.url || msg.value.connecting);
  const serviceStatusLabel = computed(() =>
    serverAvailable.value ? msg.value.topbar.serverAvailable : msg.value.topbar.serverUnavailable
  );
  const pageRefreshBusy = ref(false);
  const pageRefreshTitle = computed(() =>
    pageRefreshBusy.value ? `${msg.value.actions.refreshing}...` : msg.value.actions.refreshPage
  );
  const pageRefreshAriaLabel = computed(() =>
    pageRefreshBusy.value ? msg.value.actions.refreshing : msg.value.actions.refreshPage
  );

  async function waitForPageRefreshTasks(tasks: Promise<unknown>[]) {
    const results = await Promise.allSettled(tasks);
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) {
      throw failed.reason;
    }
  }

  async function refreshAdminRoute() {
    switch (activeRouteAdminView.value) {
      case 'storage':
        await Promise.all([
          refreshAuthAdmin(),
          reloadModules(),
          refreshState({ silent: true, forceDrafts: false }),
        ]);
        return;
      case 'jobs':
        await Promise.all([
          refreshState({ silent: true, forceDrafts: true }),
          refreshMaintenanceAgent({ silent: true }),
          refreshMonitorAlerts({ silent: true }),
        ]);
        return;
      case 'logs':
        await Promise.all([
          refreshState({ silent: true }),
          hasFeature('knowledge-core') ? refreshKnowledgeConsole() : Promise.resolve(),
          hasFeature('maintenance-agent-runbooks') ? refreshMaintenanceAgent({ silent: true }) : Promise.resolve(),
          hasFeature('agent-gateway') || hasFeature('agent-management') ? refreshToolManagement({ silent: true }) : Promise.resolve(),
          refreshBackgroundProcesses({ silent: true }),
          refreshMonitorAlerts({ silent: true }),
          refreshAuthAdmin(),
        ]);
        return;
      case 'opsMonitor':
        await Promise.all([
          refreshBackgroundProcesses({ silent: true }),
          refreshClientRuntimeStatus({ silent: true }),
          refreshMonitorAlerts({ silent: true }),
        ]);
        return;
      case 'productionHealth':
        return;
      case 'clients':
        await refreshState({ silent: true });
        return;
      case 'tools':
      case 'toolList':
      case 'toolStats':
        await refreshToolManagement();
        return;
      case 'modules':
        await reloadModules();
        return;
      case 'agentPermissions':
        await Promise.all([
          refreshAuthAdmin(),
          refreshToolManagement(),
        ]);
        return;
      case 'agentConfig':
        await refreshCodexOAuthStatus();
        return;
      case 'contextManagement':
        await refreshContextCompiler();
        return;
      case 'maintenanceAgent':
        await refreshMaintenanceAgent();
        return;
      default:
        await refreshState({ silent: true });
    }
  }

  async function refreshCurrentRouteDefaults() {
    switch (activeRouteView.value) {
      case 'dashboard':
        await refreshDashboardAlertsSnapshot({ silent: false });
        return;
      case 'approval':
        await Promise.all([
          refreshMcpAuthorizationRequests(),
          refreshKnowledgeConflicts(),
        ]);
        return;
      case 'feed':
        await refreshState({ silent: true });
        return;
      case 'sources':
        await Promise.all([
          refreshKnowledgeSources(),
          refreshClientRuntimeStatus({ silent: true }),
          refreshState({ silent: true }),
        ]);
        return;
      case 'workspaces':
        await refreshAuthState();
        return;
      case 'knowledge':
        if (activeRouteKnowledgeTab.value === 'wordCloud') {
          await refreshWordCloud();
          return;
        }
        if (activeRouteKnowledgeTab.value === 'maintenance') {
          await refreshExpertRules({ forceDrafts: true });
          return;
        }
        await refreshKnowledgeConsole();
        return;
      case 'debug':
        await refreshKnowledgeConsole();
        return;
      case 'admin':
        await refreshAdminRoute();
        return;
      default:
        await refreshState({ silent: true });
    }
  }

  async function refreshCurrentPage() {
    if (pageRefreshBusy.value) {
      return;
    }
    pageRefreshBusy.value = true;
    try {
      const pageTasks = collectPageRefreshTasks({
        viewId: activeRouteView.value,
        adminView: activeRouteAdminView.value,
        knowledgeTab: activeRouteKnowledgeTab.value,
        debugTab: activeRouteDebugTab.value,
        routePath: route.fullPath,
      });
      await waitForPageRefreshTasks([
        refreshCurrentRouteDefaults(),
        ...pageTasks,
      ]);
    } finally {
      pageRefreshBusy.value = false;
    }
  }

  const localizedViewTitle = computed(() => {
    const m = msg.value;
    if (activeRouteView.value === 'admin') {
      switch (activeRouteAdminView.value) {
        case 'agentPermissions': return m.nav.permissionGroups;
        case 'tools': return m.nav.toolList;
        case 'toolList': return m.nav.toolList;
        case 'toolStats': return m.nav.toolStats;
        case 'agentConfig': return m.nav.agentConfig;
        case 'contextManagement': return m.nav.contextManagement;
        case 'maintenanceAgent': return m.nav.maintenanceAgent;
        case 'clients': return m.nav.devices;
        case 'jobs': return m.nav.jobs;
        case 'logs': return m.nav.logs;
        case 'opsMonitor': return m.nav.opsMonitor;
        case 'runtimeDownloads': return m.nav.runtimeDownloads;
        case 'productionHealth': return m.nav.productionHealth;
        case 'modules': return m.title.modules;
        case 'storage': return m.title.storage;
        default: return m.title.admin;
      }
    }
    switch (activeRouteView.value) {
      case 'dashboard': return m.nav.dashboard;
      case 'feed': return m.nav.feed;
      case 'approval': return m.nav.approvalFlow;
      case 'sources': return m.nav.sources;
      case 'knowledge': return m.nav.knowledge;
      case 'workspaces': return m.nav.workspaces;
      case 'debug': return m.nav.debugPanel;
      default: return '';
    }
  });

  function localizedKnowledgeTabLabel(tab: { id: string; label: string }) {
    switch (tab.id) {
      case 'management': return msg.value.nav.knowledgeManagement;
      case 'wordCloud': return msg.value.nav.wordCloud;
      case 'maintenance': return msg.value.nav.knowledgeConfig;
      default: return tab.label;
    }
  }

  function localizedDebugTabLabel(tab: { id: string; label: string }) {
    switch (tab.id) {
      case 'knowledgeRecall': return msg.value.nav.knowledgeRecall;
      case 'agentRetrieval': return msg.value.nav.agentRetrieval;
      case 'knowledgeDistillation': return msg.value.nav.knowledgeDistillation;
      default: return tab.label;
    }
  }

  return {
    adminView,
    agentEvidencePreviewOpen,
    authBootstrapping,
    authSessions,
    authUsers,
    busyKey,
    closeDrawer,
    closeServerPathPicker,
    consoleState,
    serverAvailable,
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
    refreshAuthAdmin,
    refreshAuthState,
    refreshBackgroundProcesses,
    refreshClientRuntimeStatus,
    refreshCodexOAuthStatus,
    refreshContextCompiler,
    refreshDashboardAlertsSnapshot,
    refreshExpertRules,
    refreshKnowledgeConflicts,
    refreshKnowledgeConsole,
    refreshKnowledgeSources,
    refreshMaintenanceAgent,
    refreshMcpAuthorizationRequests,
    refreshMonitorAlerts,
    refreshState,
    refreshToolManagement,
    refreshWordCloud,
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
    refreshKnowledgeSource,
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
    themeMode,
    languageMode,
    languageOptionBarOptions,
    msg,
    applyTheme,
    cycleTheme,
    applyLanguage,
    setLanguage,
    toggleLanguage,
    tt,
    activeRouteView,
    activeRouteKnowledgeTab,
    activeRouteDebugTab,
    activeRouteAdminView,
    serviceUrl,
    serviceStatusLabel,
    pageRefreshBusy,
    pageRefreshTitle,
    pageRefreshAriaLabel,
    refreshCurrentPage,
    localizedViewTitle,
    localizedKnowledgeTabLabel,
    localizedDebugTabLabel,
  };
}
