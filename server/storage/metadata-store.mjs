import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createClientRegistryService } from "../application/client-registry-service.mjs";
import { createSearchService } from "../application/search-service.mjs";
import { createTransactionLifecycleService } from "../application/transaction-lifecycle-service.mjs";
import { createBatchRepository } from "./batch-repository.mjs";
import { createKnowledgeRepository } from "./knowledge-repository.mjs";
import { getRawMailObjectRoot } from "./raw-object-store.mjs";
import { getMetadataDatabasePath, initializeMetadataSchema } from "./schema-manager.mjs";

export { getMetadataDatabasePath } from "./schema-manager.mjs";

export function createMetadataStore({ userDataPath }) {
  fs.mkdirSync(path.join(userDataPath, "metadata"), { recursive: true });
  const db = new Database(getMetadataDatabasePath(userDataPath));
  initializeMetadataSchema(db);

  const batchRepository = createBatchRepository({ db, userDataPath });
  const lifecycleService = createTransactionLifecycleService({ db });
  const clientRegistryService = createClientRegistryService({ db });
  const searchService = createSearchService({ db });
  const knowledgeRepository = createKnowledgeRepository({ db });

  return {
    get databasePath() {
      return getMetadataDatabasePath(userDataPath);
    },
    get objectRootPath() {
      return getRawMailObjectRoot(userDataPath);
    },
    close() {
      db.close();
    },
    beginBatch(input) {
      return batchRepository.beginBatch(input);
    },
    updateBatchStatus(batchId, status, error = "") {
      return batchRepository.updateBatchStatus(batchId, status, error);
    },
    persistSources(input) {
      return batchRepository.persistSources(input);
    },
    persistAnalysis({ batchId, result, warnings, rules }) {
      const canonicalKnowledge = knowledgeRepository.buildCanonicalKnowledge({
        batchId,
        result
      });
      result.knowledge = canonicalKnowledge;
      batchRepository.persistAnalysis({
        batchId,
        result,
        warnings,
        rules,
        afterCorePersist: () => {
          lifecycleService.persistTransactionLineages({
            batchId,
            result
          });
          knowledgeRepository.persistCanonicalKnowledge({
            batchId,
            knowledge: canonicalKnowledge
          });
        }
      });
    },
    markBatchFailed(batchId, errorMessage) {
      return batchRepository.markBatchFailed(batchId, errorMessage);
    },
    getRawMailObject(objectId) {
      return batchRepository.getRawMailObject(objectId);
    },
    hasBatch(batchId) {
      return batchRepository.hasBatch(batchId);
    },
    getStorageSummary() {
      return {
        databasePath: getMetadataDatabasePath(userDataPath),
        objectRootPath: getRawMailObjectRoot(userDataPath),
        ...batchRepository.getStorageSummary(),
        knowledge: knowledgeRepository.getStorageSummary()
      };
    },
    deleteBatchRecords(batchId) {
      knowledgeRepository.deleteBatch(batchId);
      return batchRepository.deleteBatchRecords(batchId);
    },
    deleteBatchRow(batchId) {
      return batchRepository.deleteBatchRow(batchId);
    },
    upsertDeletionOperation(input) {
      return batchRepository.upsertDeletionOperation(input);
    },
    updateDeletionOperation(operationId, patch) {
      return batchRepository.updateDeletionOperation(operationId, patch);
    },
    getDeletionOperationByBatchId(batchId) {
      return batchRepository.getDeletionOperationByBatchId(batchId);
    },
    listPendingDeletionOperations() {
      return batchRepository.listPendingDeletionOperations();
    },
    deleteDeletionOperation(operationId) {
      return batchRepository.deleteDeletionOperation(operationId);
    },
    getBatchArtifactPaths(batchId) {
      return batchRepository.getBatchArtifactPaths(batchId);
    },
    recordClientCheckIn(input) {
      return clientRegistryService.recordClientCheckIn(input);
    },
    listClientRegistrations(input) {
      return clientRegistryService.listClientRegistrations(input);
    },
    refreshTransactionLineageStates(referenceTime, settings = {}) {
      return lifecycleService.refreshTransactionLineageStates(referenceTime, settings);
    },
    resolveTransactionLifecycle(input) {
      return lifecycleService.resolveTransactionLifecycle(input);
    },
    search(input) {
      return searchService.search(input);
    },
    syncKnowledge(input) {
      return knowledgeRepository.sync(input);
    },
    submitKnowledgeChanges(input) {
      return knowledgeRepository.submitChanges(input);
    },
    listKnowledgeReviewItems(input) {
      return knowledgeRepository.listReviewItems(input);
    },
    resolveKnowledgeReviewItem(input) {
      return knowledgeRepository.resolveReviewItem(input);
    },
    searchKnowledge(input) {
      return knowledgeRepository.search(input);
    },
    getKnowledgeItem(input) {
      return knowledgeRepository.getItem(input);
    },
    getKnowledgeGraph(input) {
      return knowledgeRepository.getGraph(input);
    }
  };
}
