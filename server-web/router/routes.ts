export type KnowledgeTab =
  | "management"
  | "wordCloud"
  | "conflicts"
  | "maintenance";

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

/** Maps AppView to its canonical route path. */
export function viewToPath(
  view: string,
  opts?: { tab?: string; adminSection?: string },
): string {
  switch (view) {
    case "dashboard":   return "/";
    case "feed":        return "/feed";
    case "sources":     return "/sources";
    case "workspaces":  return "/workspaces";
    case "intelligence": return "/intelligence";
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
