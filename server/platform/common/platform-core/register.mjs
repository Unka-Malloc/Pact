import { registerPlatformService } from "../../interactive/platform-registry.mjs";

export function registerCorePlatformServices(registry, {
  protocolEventBus = null,
  runtimeLogger = null,
  featureRuntime = null,
  operationConcurrencyScope = ""
} = {}) {
  return [
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
    })
  ];
}
