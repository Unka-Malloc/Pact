export type KnowledgeTab =
  | "management"
  | "wordCloud"
  | "maintenance";

export type DebugTab = "knowledgeRecall" | "agentRetrieval" | "knowledgeDistillation";

export type AdminSection =
  | "storage"
  | "jobs"
  | "logs"
  | "ops-monitor"
  | "clients"
  | "tools"
  | "toolList"
  | "toolStats"
  | "tool-list"
  | "tool-stats"
  | "modules"
  | "productionHealth"
  | "runtimeDownloads"
  | "agent-permissions"
  | "agent-config"
  | "context-management"
  | "maintenance-agent";

/** Maps AppView to its canonical route path. */
export function viewToPath(
  view: string,
  opts?: { tab?: string; adminSection?: string },
): string {
  switch (view) {
    case "dashboard":   return "/";
    case "feed":        return "/feed";
    case "approval":    return "/approval";
    case "sources":     return "/sources";
    case "workspaces":  return "/workspaces";
    case "knowledge":
      return `/knowledge/${opts?.tab ?? "management"}`;
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
    tools: "tool-list",
    toolList: "tool-list",
    toolStats: "tool-stats",
    modules: "modules",
    productionHealth: "production-health",
    runtimeDownloads: "runtime-downloads",
    agentPermissions: "agent-permissions",
    agentConfig: "agent-config",
    contextManagement: "context-management",
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
    tools: "toolList",
    "tool-list": "toolList",
    "tool-stats": "toolStats",
    modules: "modules",
    "production-health": "productionHealth",
    "runtime-downloads": "runtimeDownloads",
    "agent-permissions": "agentPermissions",
    "agent-config": "agentConfig",
    "context-management": "contextManagement",
    "maintenance-agent": "maintenanceAgent",
  };
  return map[slug] ?? "storage";
}
