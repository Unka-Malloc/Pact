import { createMetadataStore } from "../storage/metadata-store.mjs";
import { createMountManager } from "./mount-manager.mjs";
import { getMountConfigPath, getMountConfigPaths } from "./mount-config.mjs";

export async function createServerRuntime({ userDataPath, runtimeOptions = {} }) {
  const metadataStore = createMetadataStore({ userDataPath });

  try {
    const mountManager = await createMountManager({
      userDataPath,
      runtimeOptions
    });

    return {
      userDataPath,
      metadataStore,
      mountConfigPath: getMountConfigPath(userDataPath),
      mountConfigPaths: getMountConfigPaths(userDataPath),
      mountManager,
      get mounts() {
        return mountManager.mounts;
      },
      get postCommitHooks() {
        return mountManager.createExecutionView().postCommitHooks;
      },
      get runtimeOptions() {
        return mountManager.runtimeOptions;
      },
      get mountGeneration() {
        return mountManager.generation;
      },
      createExecutionView() {
        return {
          userDataPath,
          metadataStore,
          ...mountManager.createExecutionView()
        };
      },
      async applyMountConfig(config, options = {}) {
        return mountManager.applyMountConfig(config, options);
      },
      async reloadMounts(options = {}) {
        return mountManager.reloadMounts(options);
      },
      async refreshMounts(options = {}) {
        return mountManager.refreshMounts(options);
      },
      async close() {
        metadataStore.close();
        await mountManager.close();
      }
    };
  } catch (error) {
    metadataStore.close();
    throw error;
  }
}
