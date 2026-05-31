<script setup lang="ts">
import { useServerConsoleShellContext } from "../../composables/serverConsoleShellContext";

const {
  activeRouteAdminView,
  activeRouteDebugTab,
  activeRouteKnowledgeTab,
  activeRouteView,
  consoleState,
  hasAnyFeature,
  hasFeature,
  isAuthenticated,
  localizedDebugTabLabel,
  localizedKnowledgeTabLabel,
  msg,
  openAdmin,
  openDebugTab,
  openDrawer,
  openKnowledgeTab,
  sideNavOpen,
  switchView,
  visibleDebugTabs,
  visibleKnowledgeTabs,
} = useServerConsoleShellContext();
</script>

<template>
  <aside v-if="isAuthenticated" class="side-nav" :class="{ 'is-open': sideNavOpen }">
    <div class="brand-block" :class="{ 'is-loading': !consoleState }">
      <div class="brand-mark" aria-hidden="true">S</div>
      <div class="brand-text">
        <h1>Pact</h1>
        <p class="brand-subtitle">
          <span v-if="!consoleState" class="brand-loading-label" aria-live="polite">
            {{ msg.loading }}
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
        :class="{ active: activeRouteView === 'dashboard' }"
        type="button"
        @click="switchView('dashboard')"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="side-link-icon"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
        {{ msg.nav.dashboard }}
      </button>
      <button
        class="side-link"
        :class="{ active: activeRouteView === 'feed' }"
        type="button"
        @click="switchView('feed')"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="side-link-icon"><path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m3 15 2 2 4-4"/></svg>
        {{ msg.nav.feed }}
      </button>
      <button
        class="side-link"
        :class="{ active: activeRouteView === 'approval' }"
        type="button"
        @click="switchView('approval')"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="side-link-icon"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        {{ msg.nav.approvalFlow }}
      </button>
      <button
        class="side-link"
        :class="{ active: activeRouteView === 'admin' && activeRouteAdminView === 'agentPermissions' }"
        type="button"
        @click="openAdmin('agentPermissions')"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="side-link-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
        {{ msg.nav.permissionGroups }}
      </button>
      <button
        class="side-link"
        :class="{ active: activeRouteView === 'sources' }"
        type="button"
        @click="switchView('sources')"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="side-link-icon"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
        {{ msg.nav.sources }}
      </button>

      <section class="side-nav-section" :aria-label="msg.nav.teamPanel">
        <p class="side-nav-section-title">{{ msg.nav.teamPanel }}</p>
        <button
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'workspaces' }"
          type="button"
          @click="switchView('workspaces')"
        >
          {{ msg.nav.workspaces }}
        </button>
        <button
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'admin' && activeRouteAdminView === 'clients' }"
          type="button"
          @click="openAdmin('clients')"
        >
          {{ msg.nav.devices }}
        </button>
      </section>

      <section v-if="hasFeature('knowledge-core')" class="side-nav-section" :aria-label="msg.nav.knowledge">
        <p class="side-nav-section-title">{{ msg.nav.knowledge }}</p>
        <button
          v-for="tab in visibleKnowledgeTabs"
          :key="tab.id"
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'knowledge' && activeRouteKnowledgeTab === tab.id }"
          type="button"
          @click="openKnowledgeTab(tab.id)"
        >
          {{ localizedKnowledgeTabLabel(tab) }}
        </button>
      </section>

      <section
        v-if="hasAnyFeature(['agent-gateway', 'agent-exploration'])"
        class="side-nav-section"
        :aria-label="msg.nav.agents"
      >
        <p class="side-nav-section-title">{{ msg.nav.agents }}</p>
        <button
          v-if="hasFeature('agent-gateway')"
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'admin' && activeRouteAdminView === 'agentConfig' }"
          type="button"
          @click="openAdmin('agentConfig')"
        >
          {{ msg.nav.agentConfig }}
        </button>
        <button
          v-if="hasFeature('agent-gateway')"
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'admin' && activeRouteAdminView === 'contextManagement' }"
          type="button"
          @click="openAdmin('contextManagement')"
        >
          {{ msg.nav.contextManagement }}
        </button>
      </section>

      <section
        v-if="hasFeature('agent-gateway') || hasFeature('agent-management')"
        class="side-nav-section"
        :aria-label="msg.nav.skillHub"
      >
        <p class="side-nav-section-title">{{ msg.nav.skillHub }}</p>
        <button
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'admin' && (activeRouteAdminView === 'tools' || activeRouteAdminView === 'toolList') }"
          type="button"
          @click="openAdmin('toolList')"
        >
          {{ msg.nav.toolList }}
        </button>
        <button
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'admin' && activeRouteAdminView === 'toolStats' }"
          type="button"
          @click="openAdmin('toolStats')"
        >
          {{ msg.nav.toolStats }}
        </button>
      </section>

      <section class="side-nav-section" :aria-label="msg.nav.systemStatus">
        <p class="side-nav-section-title">{{ msg.nav.systemStatus }}</p>
        <button
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'admin' && activeRouteAdminView === 'storage' }"
          type="button"
          @click="openAdmin('storage')"
        >
          {{ msg.nav.overview }}
        </button>
        <button
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'admin' && activeRouteAdminView === 'jobs' }"
          type="button"
          @click="openAdmin('jobs')"
        >
          {{ msg.nav.jobs }}
        </button>
        <button
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'admin' && activeRouteAdminView === 'opsMonitor' }"
          type="button"
          @click="openAdmin('opsMonitor')"
        >
          {{ msg.nav.opsMonitor }}
        </button>
        <button
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'admin' && activeRouteAdminView === 'runtimeDownloads' }"
          type="button"
          @click="openAdmin('runtimeDownloads')"
        >
          {{ msg.nav.runtimeDownloads }}
        </button>
        <button
          v-if="hasFeature('maintenance-agent-runbooks')"
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'admin' && activeRouteAdminView === 'maintenanceAgent' }"
          type="button"
          @click="openAdmin('maintenanceAgent')"
        >
          {{ msg.nav.maintenanceAgent }}
        </button>
        <button
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'admin' && activeRouteAdminView === 'productionHealth' }"
          type="button"
          @click="openAdmin('productionHealth')"
        >
          {{ msg.nav.productionHealth }}
        </button>
        <button
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'admin' && activeRouteAdminView === 'logs' }"
          type="button"
          @click="openAdmin('logs')"
        >
          {{ msg.nav.logs }}
        </button>
      </section>

      <section v-if="visibleDebugTabs.length > 0" class="side-nav-section" :aria-label="msg.nav.debugPanel">
        <p class="side-nav-section-title">{{ msg.nav.debugPanel }}</p>
        <button
          v-for="tab in visibleDebugTabs"
          :key="tab.id"
          class="side-link side-link-subtle"
          :class="{ active: activeRouteView === 'debug' && activeRouteDebugTab === tab.id }"
          type="button"
          @click="openDebugTab(tab.id)"
        >
          {{ localizedDebugTabLabel(tab) }}
        </button>
      </section>
    </nav>

    <div class="side-nav-footer">
      <button class="side-cta" type="button" @click="sideNavOpen = false; openDrawer('preferences')">
        {{ msg.nav.systemConfig }}
      </button>
    </div>
  </aside>

  <div
    v-if="isAuthenticated && sideNavOpen"
    class="side-nav-backdrop"
    aria-hidden="true"
    @click="sideNavOpen = false"
  ></div>
</template>
