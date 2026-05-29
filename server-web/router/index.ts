import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";
export type { AdminSection, DebugTab, KnowledgeTab } from "./routes";
export { adminSectionToSlug, slugToAdminView, viewToPath } from "./routes";

// ─── Views ────────────────────────────────────────────────────────────────────
import WorkspacesView from "../views/WorkspacesView.vue";
import DashboardView from "../views/DashboardView.vue";
import DebugView from "../views/DebugView.vue";
import FeedView from "../views/FeedView.vue";
import KnowledgeView from "../views/KnowledgeView.vue";
import SourcesView from "../views/SourcesView.vue";
import AgentConfigView from "../views/admin/AgentConfigView.vue";
import AgentManagementView from "../views/admin/AgentManagementView.vue";
import AgentPermissionsView from "../views/admin/AgentPermissionsView.vue";
import ClientsView from "../views/admin/ClientsView.vue";
import ContextManagementView from "../views/admin/ContextManagementView.vue";
import JobsView from "../views/admin/JobsView.vue";
import LogsView from "../views/admin/LogsView.vue";
import MaintenanceAgentView from "../views/admin/MaintenanceAgentView.vue";
import ModulesView from "../views/admin/ModulesView.vue";
import OpsMonitorView from "../views/admin/OpsMonitorView.vue";
import ProductionHealthView from "../views/admin/ProductionHealthView.vue";
import StorageView from "../views/admin/StorageView.vue";
import ToolsView from "../views/admin/ToolsView.vue";

const validKnowledgeTabs = new Set(["management", "wordCloud", "conflicts", "maintenance"]);
const validDebugTabs = new Set(["knowledgeRecall", "agentRetrieval"]);

const routes: RouteRecordRaw[] = [
  // Agent workspace
  { path: "/workspaces", component: WorkspacesView, meta: { viewId: "workspaces" } },

  // Core views
  { path: "/", component: DashboardView, meta: { viewId: "dashboard" } },
  { path: "/feed", component: FeedView, meta: { viewId: "feed" } },
  { path: "/sources", component: SourcesView, meta: { viewId: "sources" } },
  { path: "/intelligence", redirect: "/" },

  // Knowledge sub-tabs
  { path: "/knowledge", redirect: "/knowledge/management" },
  {
    path: "/knowledge/:tab",
    component: KnowledgeView,
    beforeEnter: (to) =>
      validKnowledgeTabs.has(String(to.params.tab)) ? true : "/knowledge/management",
    meta: { viewId: "knowledge" },
  },

  // Debug sub-tabs
  {
    path: "/debug",
    redirect: "/debug/knowledgeRecall",
  },
  {
    path: "/debug/:tab",
    component: DebugView,
    beforeEnter: (to) =>
      validDebugTabs.has(String(to.params.tab)) ? true : "/debug/knowledgeRecall",
    meta: { viewId: "debug" },
  },

  // Admin views
  { path: "/admin", redirect: "/admin/storage" },
  { path: "/admin/storage", component: StorageView, meta: { viewId: "admin", adminView: "storage" } },
  { path: "/admin/jobs", component: JobsView, meta: { viewId: "admin", adminView: "jobs" } },
  { path: "/admin/logs", component: LogsView, meta: { viewId: "admin", adminView: "logs" } },
  { path: "/admin/ops-monitor", component: OpsMonitorView, meta: { viewId: "admin", adminView: "opsMonitor" } },
  { path: "/admin/production-health", component: ProductionHealthView, meta: { viewId: "admin", adminView: "productionHealth" } },
  { path: "/admin/clients", component: ClientsView, meta: { viewId: "admin", adminView: "clients" } },
  { path: "/admin/tools", component: ToolsView, meta: { viewId: "admin", adminView: "tools" } },
  { path: "/admin/modules", component: ModulesView, meta: { viewId: "admin", adminView: "modules" } },
  { path: "/admin/agent-management", component: AgentManagementView, meta: { viewId: "admin", adminView: "agentManagement" } },
  { path: "/admin/agent-permissions", component: AgentPermissionsView, meta: { viewId: "admin", adminView: "agentPermissions" } },
  { path: "/admin/agent-config", component: AgentConfigView, meta: { viewId: "admin", adminView: "agentConfig" } },
  { path: "/admin/context-management", component: ContextManagementView, meta: { viewId: "admin", adminView: "contextManagement" } },
  { path: "/admin/maintenance-agent", component: MaintenanceAgentView, meta: { viewId: "admin", adminView: "maintenanceAgent" } },

  // Catch-all → dashboard
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  // Hash history works without server-side routing configuration
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach((to) => {
  if (to.path.startsWith("/knowledge/") && !validKnowledgeTabs.has(String(to.params.tab))) {
    return { path: "/knowledge/management", replace: true };
  }
  if (to.path.startsWith("/debug/") && !validDebugTabs.has(String(to.params.tab))) {
    return { path: "/debug/knowledgeRecall", replace: true };
  }
  return true;
});
