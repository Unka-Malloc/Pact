import { registerPlatformService } from "../../interactive/platform-registry.mjs";
import {
  checkpointTreeId,
  checkpointTreeSummary,
  deleteCheckpointTree,
  diffCheckpointTree,
  finishCheckpointTree,
  listCheckpointTrees,
  loadCheckpointTree,
  previewCheckpointRestore,
  queryCheckpointScope,
  restoreCheckpointTree,
  startCheckpointTree,
  upsertCheckpointNode
} from "./checkpoint-tree-store.mjs";

function legacyCheckpointTreePort() {
  return Object.freeze({
    checkpointTreeId,
    checkpointTreeSummary,
    deleteCheckpointTree,
    diffCheckpointTree,
    finishCheckpointTree,
    listCheckpointTrees,
    loadCheckpointTree,
    previewCheckpointRestore,
    queryCheckpointScope,
    restoreCheckpointTree,
    startCheckpointTree,
    upsertCheckpointNode
  });
}

export function registerDataStructurePlatformServices(registry, {
  dataStructures = null
} = {}) {
  const checkpointTree = dataStructures?.checkpointTree || legacyCheckpointTreePort();
  return [
    registerPlatformService(registry, {
      id: "data-structure.provider",
      platform: "data-structure",
      label: "Data structure provider",
      kind: "provider",
      ownerFeatureId: "data-structure-core",
      value: dataStructures,
      metadata: {
        protocolVersion: dataStructures?.protocolVersion || "",
        capabilityIds: dataStructures?.listCapabilities
          ? dataStructures.listCapabilities().capabilities.map((capability) => capability.id)
          : ["checkpoint-tree"]
      }
    }),
    registerPlatformService(registry, {
      id: "data-structure.checkpointTree",
      platform: "data-structure",
      label: "Checkpoint tree data structure",
      kind: "checkpoint-tree",
      ownerFeatureId: "data-structure-core",
      value: checkpointTree,
      metadata: {
        protocolVersion: dataStructures?.protocolVersion || ""
      }
    }),
    registerPlatformService(registry, {
      id: "data-structure.merkleState",
      platform: "data-structure",
      label: "Merkle state substrate",
      kind: "algorithm-substrate",
      ownerFeatureId: "data-structure-core",
      value: dataStructures?.merkleState || null,
      metadata: {
        protocolVersion: dataStructures?.merkleState?.protocolVersion || dataStructures?.protocolVersion || ""
      }
    })
  ];
}
