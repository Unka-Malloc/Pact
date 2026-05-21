import {
  TOOL_MANAGEMENT_SCOPES,
  TOOL_MANAGEMENT_TOOLSETS,
  TOOL_MANAGEMENT_PROFILES,
  createToolCatalogRegistry
} from "./catalog.mjs";
import { createToolManagementStore, getToolManagementDatabasePath } from "./store.mjs";
import { createToolPolicyEngine } from "./policy.mjs";
import { createToolExecutionRuntime } from "./runtime.mjs";
import { createToolManagementHttpRouter } from "./http.mjs";
import { getRuntimeLogger } from "../../../../interactive/product-api.mjs";

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
  featureRuntime = null,
  logger = getRuntimeLogger()
}) {
  const registry = createToolCatalogRegistry({
    operations,
    activeFeatureIds: featureRuntime?.activeFeatureIds || null
  });
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
    close() {
      store.close();
    }
  };
}
