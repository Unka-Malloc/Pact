import { registerPlatformService } from "../../interactive/platform-registry.mjs";

export function registerModuleManagementPlatformServices(registry, {
  moduleManagement = null,
  runtime = null,
  runtimeOptions = {}
} = {}) {
  const runtimeState = moduleManagement?.getRuntimeState
    ? moduleManagement.getRuntimeState()
    : {
        profile: runtimeOptions?.profile || "",
        mountNames: Object.keys(runtime?.mounts || {})
      };
  const mountList = moduleManagement?.listMounts
    ? moduleManagement.listMounts()
    : Object.entries(runtime?.mounts || {}).map(([name, mount]) => ({
        name,
        id: mount?.id || "",
        kind: mount?.kind || name,
        enabled: mount?.enabled !== false,
        reason: mount?.reason || ""
      }));
  const mountNames = mountList.map((mount) => mount.name).filter(Boolean);
  return [
    registerPlatformService(registry, {
      id: "module-management.provider",
      platform: "module-management",
      label: "Module management provider",
      kind: "provider",
      ownerFeatureId: "module-management-core",
      value: moduleManagement,
      metadata: {
        protocolVersion: moduleManagement?.protocolVersion || "",
        profile: runtimeState.profile || "",
        mountNames
      }
    }),
    registerPlatformService(registry, {
      id: "module-management.serverRuntime",
      platform: "module-management",
      label: "Module management runtime port",
      kind: "provider",
      ownerFeatureId: "module-management-core",
      value: moduleManagement || runtime,
      metadata: {
        protocolVersion: moduleManagement?.protocolVersion || "",
        profile: runtimeState.profile || "",
        mountNames
      }
    }),
    registerPlatformService(registry, {
      id: "module-management.mounts",
      platform: "module-management",
      label: "Active mounts",
      kind: "mounts",
      ownerFeatureId: "module-management-core",
      value: mountList,
      metadata: {
        protocolVersion: moduleManagement?.protocolVersion || "",
        mountNames
      }
    })
  ];
}
