import { registerPlatformService } from "../../interactive/platform-registry.mjs";

export function registerStoragePlatformServices(registry, {
  metadataStore = null,
  userDataPath = ""
} = {}) {
  return [
    registerPlatformService(registry, {
      id: "storage.metadataStore",
      platform: "storage",
      label: "Metadata store",
      kind: "repository",
      ownerFeatureId: "storage-core",
      value: metadataStore,
      metadata: {
        userDataPath,
        databasePath: metadataStore?.databasePath || "",
        objectRootPath: metadataStore?.objectRootPath || ""
      }
    })
  ];
}
