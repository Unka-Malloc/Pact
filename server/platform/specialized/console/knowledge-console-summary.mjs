function redactModulePaths(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  const clone = JSON.parse(JSON.stringify(value));
  function walk(item) {
    if (!item || typeof item !== "object") {
      return;
    }
    delete item.rootPath;
    delete item.databasePath;
    delete item.extensionPath;
    for (const child of Object.values(item)) {
      if (child && typeof child === "object") {
        walk(child);
      }
    }
  }
  walk(clone);
  return clone;
}

export async function buildKnowledgeConsoleSummary(runtime, jobManager) {
  const knowledgeBase = runtime?.mounts?.knowledgeBase;
  const [health, capabilities, maintenance, jobs] = await Promise.all([
    typeof knowledgeBase?.health === "function" ? Promise.resolve(knowledgeBase.health()) : Promise.resolve(null),
    typeof knowledgeBase?.capabilities === "function"
      ? Promise.resolve(knowledgeBase.capabilities())
      : Promise.resolve(null),
    typeof knowledgeBase?.getMaintenance === "function"
      ? Promise.resolve(knowledgeBase.getMaintenance())
      : Promise.resolve(null),
    jobManager.listJobs({ limit: 8 })
  ]);
  return {
    available: Boolean(knowledgeBase && knowledgeBase.enabled !== false),
    health: redactModulePaths(health),
    capabilities: redactModulePaths(capabilities),
    maintenance,
    recentJobs: jobs.items || []
  };
}
