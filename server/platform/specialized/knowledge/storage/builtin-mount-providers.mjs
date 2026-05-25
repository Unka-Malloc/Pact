import { createKnowledgeCoreMount } from "./knowledge-core/index.mjs";

function isRuntimeFeatureActive(runtimeOptions = {}, featureId = "") {
  if (!featureId) {
    return true;
  }
  const activeFeatureIds = runtimeOptions.featureRuntime?.activeFeatureIds;
  if (!Array.isArray(activeFeatureIds) || activeFeatureIds.length === 0) {
    return true;
  }
  return activeFeatureIds.includes(featureId);
}

export function createKnowledgeBuiltinMountProviders({ userDataPath }) {
  const createKnowledgeBaseMount = ({ runtimeOptions } = {}) =>
    createKnowledgeCoreMount({
      userDataPath,
      outlineEnabled: isRuntimeFeatureActive(runtimeOptions, "knowledge-outline-reasoning")
    });

  return Object.freeze({
    knowledgeBase: {
      builtinFactory: createKnowledgeBaseMount,
      minimalFactory: createKnowledgeBaseMount
    }
  });
}
