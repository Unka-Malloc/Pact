import { registerPlatformService } from "../../interactive/platform-registry.mjs";
import {
  checkpointTreeId,
  checkpointTreeSummary,
  deleteCheckpointTree,
  finishCheckpointTree,
  listCheckpointTrees,
  loadCheckpointTree,
  startCheckpointTree,
  upsertCheckpointNode
} from "./checkpoint-tree-store.mjs";

export function registerDataStructurePlatformServices(registry) {
  return [
    registerPlatformService(registry, {
      id: "data-structure.checkpointTree",
      platform: "data-structure",
      label: "Checkpoint tree data structure",
      kind: "checkpoint-tree",
      ownerFeatureId: "data-structure-core",
      value: Object.freeze({
        checkpointTreeId,
        checkpointTreeSummary,
        deleteCheckpointTree,
        finishCheckpointTree,
        listCheckpointTrees,
        loadCheckpointTree,
        startCheckpointTree,
        upsertCheckpointNode
      })
    })
  ];
}
