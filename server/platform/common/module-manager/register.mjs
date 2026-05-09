import { registerPlatformService } from "../../interactive/platform-registry.mjs";

export function registerModulePlatformServices(registry, {
  runtime = null,
  runtimeOptions = {}
} = {}) {
  return [
    registerPlatformService(registry, {
      id: "modules.serverRuntime",
      platform: "modules",
      label: "Server runtime and mount manager",
      kind: "runtime",
      ownerFeatureId: "mount-manager-core",
      value: runtime,
      metadata: {
        profile: runtimeOptions?.profile || "",
        mountNames: Object.keys(runtime?.mounts || {})
      }
    }),
    registerPlatformService(registry, {
      id: "modules.mounts",
      platform: "modules",
      label: "Active mounts",
      kind: "mounts",
      ownerFeatureId: "mount-manager-core",
      value: runtime?.mounts || {},
      metadata: {
        mountNames: Object.keys(runtime?.mounts || {})
      }
    })
  ];
}
