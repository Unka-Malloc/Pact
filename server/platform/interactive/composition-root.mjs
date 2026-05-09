import path from "node:path";
import { resolveFeatureRuntimeFromEnv, filterOperationsForFeatures, publicFeatureRuntime } from "./features/feature-manifest.mjs";
import { createProtocolEventBus } from "../../protocols/pubsub/event-bus.mjs";
import { registerCorePlatformServices } from "../common/platform-core/register.mjs";
import { createConsoleAuth } from "../common/platform-core/auth/console-auth.mjs";
import { createOperationAuditStore } from "../common/platform-core/security/operation-audit.mjs";
import { createServerRuntime } from "../common/module-manager/server-runtime.mjs";
import { registerModulePlatformServices } from "../common/module-manager/register.mjs";
import { SERVER_API_OPERATIONS } from "../common/operation-dispatcher/operation-registry.mjs";
import { registerStoragePlatformServices } from "../common/storage/register.mjs";
import { registerOpsPlatformServices } from "../common/devops/register.mjs";
import { createPlatformRegistry } from "./platform-registry.mjs";

export async function createServerCompositionRoot({
  userDataPath,
  runtimeOptions = {},
  runtimeLogger
}) {
  const featureRuntime = await resolveFeatureRuntimeFromEnv({ runtimeOptions });
  const platformRegistry = createPlatformRegistry({
    scope: path.resolve(userDataPath)
  });
  const runtimeOptionsWithFeatures = {
    ...runtimeOptions,
    featureRuntime,
    featureEdition: featureRuntime.edition
  };
  const activeApiOperations = filterOperationsForFeatures(
    SERVER_API_OPERATIONS,
    featureRuntime
  );
  const publicFeatures = () =>
    publicFeatureRuntime(featureRuntime, SERVER_API_OPERATIONS);
  const isFeatureActive = (featureId) =>
    featureRuntime.activeFeatureIds.includes(featureId);
  const isAnyFeatureActive = (...featureIds) =>
    featureIds.some((featureId) => isFeatureActive(featureId));

  const runtime = await createServerRuntime({
    userDataPath,
    runtimeOptions: runtimeOptionsWithFeatures
  });
  const consoleAuth = createConsoleAuth({ userDataPath });
  const operationAuditStore = createOperationAuditStore({ userDataPath });
  const operationConcurrencyScope = path.resolve(userDataPath);
  const protocolEventBus = createProtocolEventBus({ userDataPath, logger: runtimeLogger });

  registerCorePlatformServices(platformRegistry, {
    consoleAuth,
    operationAuditStore,
    protocolEventBus,
    runtimeLogger,
    featureRuntime,
    operationConcurrencyScope
  });
  registerModulePlatformServices(platformRegistry, {
    runtime,
    runtimeOptions: runtimeOptionsWithFeatures
  });
  registerOpsPlatformServices(platformRegistry, { userDataPath });
  registerStoragePlatformServices(platformRegistry, {
    metadataStore: runtime.metadataStore,
    userDataPath
  });

  return Object.freeze({
    userDataPath,
    runtimeOptions: runtimeOptionsWithFeatures,
    featureRuntime,
    allApiOperationCount: SERVER_API_OPERATIONS.length,
    activeApiOperations,
    publicFeatures,
    isFeatureActive,
    isAnyFeatureActive,
    platformRegistry,
    runtime,
    consoleAuth,
    operationAuditStore,
    operationConcurrencyScope,
    protocolEventBus,
    metadataStore: runtime.metadataStore
  });
}

export async function ensureConsoleOwner({ consoleAuth, enabled }) {
  if (!enabled) {
    return { created: false };
  }
  return consoleAuth.ensureInitialOwner();
}
