import { registerPlatformService } from "../../interactive/platform-registry.mjs";

export function registerModuleManagementPlatformServices(registry, {
  runtime = null,
  runtimeOptions = {}
} = {}) {
  return [
    registerPlatformService(registry, {
      id: "module-management.serverRuntime",
      platform: "module-management",
      label: "Server runtime and mount manager",
      kind: "runtime",
      ownerFeatureId: "module-management-core",
      value: runtime,
      metadata: {
        profile: runtimeOptions?.profile || "",
        mountNames: Object.keys(runtime?.mounts || {})
      }
    }),
    registerPlatformService(registry, {
      id: "module-management.mounts",
      platform: "module-management",
      label: "Active mounts",
      kind: "mounts",
      ownerFeatureId: "module-management-core",
      value: runtime?.mounts || {},
      metadata: {
        mountNames: Object.keys(runtime?.mounts || {})
      }
    })
  ];
}
