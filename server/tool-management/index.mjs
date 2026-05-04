import {
  TOOL_MANAGEMENT_SCOPES,
  TOOL_MANAGEMENT_TOOLSETS,
  TOOL_MANAGEMENT_PROFILES,
  createToolCatalogRegistry,
  legacyToolPlatformToolsFromCatalog
} from "./catalog.mjs";
import { createToolManagementStore, getToolManagementDatabasePath } from "./store.mjs";
import { createToolPolicyEngine } from "./policy.mjs";
import { createToolExecutionRuntime } from "./runtime.mjs";
import { createToolManagementHttpRouter } from "./http.mjs";
import { getRuntimeLogger } from "../observability/runtime-logger.mjs";

let defaultRegistry = null;

export {
  TOOL_MANAGEMENT_SCOPES,
  TOOL_MANAGEMENT_TOOLSETS,
  TOOL_MANAGEMENT_PROFILES,
  getToolManagementDatabasePath
};

export function createToolManagementPlatform({
  userDataPath,
  operations,
  controllers,
  operationAuditStore = null,
  operationConcurrencyScope = "tool-management",
  protocolEventBus = null,
  consoleAuth = null,
  logger = getRuntimeLogger()
}) {
  const registry = createToolCatalogRegistry({ operations });
  defaultRegistry = registry;
  const store = createToolManagementStore({ userDataPath });
  const policyEngine = createToolPolicyEngine({ registry, store });
  const runtime = createToolExecutionRuntime({
    registry,
    store,
    policyEngine,
    operations,
    controllers,
    operationAuditStore,
    operationConcurrencyScope,
    protocolEventBus,
    logger
  });
  const router = createToolManagementHttpRouter({
    platform: {
      registry,
      store,
      policyEngine,
      runtime,
      catalog: () => registry.getCatalog()
    },
    consoleAuth,
    logger
  });
  store.saveCatalogSnapshot(registry.getCatalog());

  return {
    registry,
    store,
    policyEngine,
    runtime,
    router,
    catalog: () => registry.getCatalog(),
    legacyToolPlatformState() {
      const catalog = registry.getCatalog();
      return {
        schemaVersion: 2,
        updatedAt: catalog.generatedAt,
        scopes: TOOL_MANAGEMENT_SCOPES,
        toolsets: TOOL_MANAGEMENT_TOOLSETS,
        profiles: TOOL_MANAGEMENT_PROFILES,
        tools: legacyToolPlatformToolsFromCatalog(catalog),
        grants: store.listGrants(),
        storage: {
          path: getToolManagementDatabasePath(userDataPath),
          engine: "sqlite"
        },
        catalogFingerprint: catalog.fingerprint
      };
    },
    close() {
      store.close();
    }
  };
}

export function legacyToolPlatformTools(operations = []) {
  const registry = defaultRegistry || createToolCatalogRegistry({ operations });
  return legacyToolPlatformToolsFromCatalog(registry.getCatalog());
}
