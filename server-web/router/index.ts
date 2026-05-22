import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

// ─── Views ────────────────────────────────────────────────────────────────────
import WorkspacesView from "../views/WorkspacesView.vue";
import DashboardView from "../views/DashboardView.vue";
import DebugView from "../views/DebugView.vue";
import FeedView from "../views/FeedView.vue";
import IntelligenceView from "../views/IntelligenceView.vue";
import KnowledgeView from "../views/KnowledgeView.vue";
import SourcesView from "../views/SourcesView.vue";
import AgentConfigView from "../views/admin/AgentConfigView.vue";
import AgentManagementView from "../views/admin/AgentManagementView.vue";
import AgentPermissionsView from "../views/admin/AgentPermissionsView.vue";
import ClientsView from "../views/admin/ClientsView.vue";
import JobsView from "../views/admin/JobsView.vue";
import LogsView from "../views/admin/LogsView.vue";
import MaintenanceAgentView from "../views/admin/MaintenanceAgentView.vue";
import ModulesView from "../views/admin/ModulesView.vue";
import OpsMonitorView from "../views/admin/OpsMonitorView.vue";
import ProductionHealthView from "../views/admin/ProductionHealthView.vue";
import StorageView from "../views/admin/StorageView.vue";
import ToolsView from "../views/admin/ToolsView.vue";

// ─── Route definitions ─────────────────────────────────────────────────────
export type KnowledgeTab = "wordCloud" | "chunking" | "parsing" | "retrieval" | "distillation" | "review" | "rules" | "maintenance";
export type DebugTab = "knowledgeRecall" | "agentRetrieval";
export type AdminSection =
  | "storage"
  | "jobs"
  | "logs"
  | "ops-monitor"
  | "clients"
  | "tools"
  | "modules"
  | "productionHealth"
  | "agent-management"
  | "agent-permissions"
  | "agent-config"
  | "maintenance-agent";

const routes: RouteRecordRaw[] = [
  // Agent workspace
  { path: "/workspaces", component: WorkspacesView, meta: { viewId: "workspaces" } },

  // Core views
  { path: "/", component: DashboardView, meta: { viewId: "dashboard" } },
  { path: "/feed", component: FeedView, meta: { viewId: "feed" } },
  { path: "/sources", component: SourcesView, meta: { viewId: "sources" } },
  { path: "/intelligence", component: IntelligenceView, meta: { viewId: "intelligence" } },

  // Knowledge sub-tabs
  { path: "/knowledge", redirect: "/knowledge/wordCloud" },
  {
    path: "/knowledge/:tab",
    component: KnowledgeView,
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

// ─── Route → AppView helpers ───────────────────────────────────────────────

/** Maps AppView to its canonical route path. */
export function viewToPath(
  view: string,
  opts?: { tab?: string; adminSection?: string },
): string {
  switch (view) {
    case "dashboard":   return "/";
    case "feed":        return "/feed";
    case "sources":     return "/sources";
    case "intelligence": return "/intelligence";
    case "knowledge":
      return `/knowledge/${opts?.tab ?? "wordCloud"}`;
    case "debug":
      return `/debug/${opts?.tab ?? "knowledgeRecall"}`;
    case "admin":
      return `/admin/${adminSectionToSlug(opts?.adminSection ?? "storage")}`;
    default:            return "/";
  }
}

/** Maps AdminView key to URL slug. */
export function adminSectionToSlug(section: string): string {
  const map: Record<string, string> = {
    storage: "storage",
    jobs: "jobs",
    logs: "logs",
    opsMonitor: "ops-monitor",
    clients: "clients",
    tools: "tools",
    modules: "modules",
    productionHealth: "production-health",
    agentManagement: "agent-management",
    agentPermissions: "agent-permissions",
    agentConfig: "agent-config",
    maintenanceAgent: "maintenance-agent",
  };
  return map[section] ?? "storage";
}

/** Maps URL slug back to AdminView key. */
export function slugToAdminView(slug: string): string {
  const map: Record<string, string> = {
    storage: "storage",
    jobs: "jobs",
    logs: "logs",
    "ops-monitor": "opsMonitor",
    clients: "clients",
    tools: "tools",
    modules: "modules",
    "production-health": "productionHealth",
    "agent-management": "agentManagement",
    "agent-permissions": "agentPermissions",
    "agent-config": "agentConfig",
    "maintenance-agent": "maintenanceAgent",
  };
  return map[slug] ?? "storage";
}
