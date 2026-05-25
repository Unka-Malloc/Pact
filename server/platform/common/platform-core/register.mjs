import { registerPlatformService } from "../../interactive/platform-registry.mjs";
import { createCorePlatformProvider } from "./core-platform-provider.mjs";

export function registerCorePlatformServices(registry, {
  protocolEventBus = null,
  runtimeLogger = null,
  featureRuntime = null,
  operationConcurrencyScope = "",
  coreProvider = null
} = {}) {
  const effectiveCoreProvider = coreProvider || createCorePlatformProvider({
    protocolEventBus,
    runtimeLogger,
    featureRuntime,
    operationConcurrencyScope
  });
  return [
    registerPlatformService(registry, {
      id: "core.provider",
      platform: "core",
      label: "Core platform provider",
      kind: "provider",
      ownerFeatureId: "core-platform",
      value: effectiveCoreProvider,
      metadata: {
        protocolVersion: effectiveCoreProvider?.protocolVersion || "",
        capabilityIds: effectiveCoreProvider?.listCapabilities
          ? effectiveCoreProvider.listCapabilities().capabilities.map((capability) => capability.id)
          : []
      }
    }),
    registerPlatformService(registry, {
      id: "core.events.protocol",
      platform: "core",
      label: "Protocol event bus",
      kind: "events",
      ownerFeatureId: "core-platform",
      value: protocolEventBus
    }),
    registerPlatformService(registry, {
      id: "core.logging.runtime",
      platform: "core",
      label: "Runtime logger",
      kind: "logging",
      ownerFeatureId: "core-platform",
      value: runtimeLogger
    }),
    registerPlatformService(registry, {
      id: "core.features.runtime",
      platform: "core",
      label: "Feature runtime",
      kind: "features",
      ownerFeatureId: "core-platform",
      value: featureRuntime
    }),
    registerPlatformService(registry, {
      id: "core.operations.concurrencyScope",
      platform: "core",
      label: "Operation concurrency scope",
      kind: "dispatcher",
      ownerFeatureId: "core-platform",
      value: operationConcurrencyScope
    }),
    registerPlatformService(registry, {
      id: "core.operations.registry",
      platform: "core",
      label: "Operation registry governance",
      kind: "registry",
      ownerFeatureId: "core-platform",
      value: (input = {}) => effectiveCoreProvider.describeOperationRegistry(input),
      metadata: {
        protocolVersion: effectiveCoreProvider?.protocolVersion || ""
      }
    })
  ];
}
