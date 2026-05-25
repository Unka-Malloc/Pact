import { registerPlatformService } from "../../interactive/platform-registry.mjs";

export function registerStoragePlatformServices(registry, {
  storageProvider = null,
  metadataStore = null,
  userDataPath = ""
} = {}) {
  const effectiveMetadataStore = metadataStore || storageProvider?.getMetadataStore?.() || null;
  return [
    registerPlatformService(registry, {
      id: "storage.provider",
      platform: "storage",
      label: "Storage provider",
      kind: "provider",
      ownerFeatureId: "storage-core",
      value: storageProvider,
      metadata: {
        protocolVersion: storageProvider?.protocolVersion || "",
        capabilityIds: storageProvider?.listCapabilities
          ? storageProvider.listCapabilities().capabilities.map((capability) => capability.id)
          : []
      }
    }),
    registerPlatformService(registry, {
      id: "storage.metadataStore",
      platform: "storage",
      label: "Metadata store",
      kind: "repository",
      ownerFeatureId: "storage-core",
      value: effectiveMetadataStore,
      metadata: {
        userDataPath,
        protocolVersion: storageProvider?.protocolVersion || "",
        databasePath: effectiveMetadataStore?.databasePath || "",
        objectRootPath: effectiveMetadataStore?.objectRootPath || ""
      }
    })
  ];
}
