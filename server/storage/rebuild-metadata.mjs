import fs from "node:fs/promises";
import path from "node:path";
import { loadEmailRules } from "../email-rules.mjs";
import { createMetadataStore } from "./metadata-store.mjs";
import { getMetadataDatabasePath } from "./schema-manager.mjs";

function getJobsRootPath(userDataPath) {
  return path.join(userDataPath, "jobs");
}

function toPersistedSource(source = {}, batchId) {
  const rawObjectId = String(source.rawObjectId || "").trim();
  const originalRelativePath = String(source.originalRelativePath || source.originalFileName || "");
  return {
    id: source.id,
    name: source.name,
    path: source.path || source.originalRelativePath || "",
    kind: source.kind || "email",
    sourceCreatedAt: source.sourceCreatedAt || "",
    sourceUpdatedAt: source.sourceUpdatedAt || "",
    sourceCollectedAt: source.sourceCollectedAt || "",
    text: source.text || "",
    mediaType: source.mediaType || "message/rfc822",
    imageDataUrl: source.imageDataUrl || "",
    documentParserId: source.documentParserId || "",
    documentMetadata: source.documentMetadata || {},
    embeddedDocuments: source.embeddedDocuments || [],
    rawObject: rawObjectId
      ? {
          objectId: rawObjectId,
          ingestOrigin: "filesystem",
          originalFileName: source.originalFileName || path.posix.basename(originalRelativePath),
          originalRelativePath,
          originalSourcePath: source.path || "",
          sourceContainerPath: "",
          storageRelativePath: path
            .join("objects", "mail", batchId, rawObjectId, originalRelativePath)
            .split(path.sep)
            .join("/"),
          mediaType: source.mediaType || "message/rfc822",
          sha256: source.rawObjectSha256 || "",
          byteSize: Number(source.rawObjectByteSize || 0),
          sourceCreatedAt: source.sourceCreatedAt || "",
          sourceUpdatedAt: source.sourceUpdatedAt || "",
          sourceCollectedAt: source.sourceCollectedAt || "",
          createdAt: source.sourceCollectedAt || source.sourceUpdatedAt || source.sourceCreatedAt || ""
        }
      : null
  };
}

export async function rebuildMetadataStore({ userDataPath }) {
  await fs.rm(path.dirname(getMetadataDatabasePath(userDataPath)), {
    recursive: true,
    force: true
  });
  const metadataStore = createMetadataStore({ userDataPath });
  const rules = await loadEmailRules(userDataPath);
  const jobsRootPath = getJobsRootPath(userDataPath);
  await fs.mkdir(jobsRootPath, { recursive: true });
  const entries = await fs.readdir(jobsRootPath, {
    withFileTypes: true
  });
  const batches = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const jobDirectory = path.join(jobsRootPath, entry.name);
    const metaPath = path.join(jobDirectory, "meta.json");
    const resultPath = path.join(jobDirectory, "result.json");
    const payloadPath = path.join(jobDirectory, "payload.json");

    let meta = null;
    let result = null;
    let payload = {};

    try {
      meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
    } catch {
      continue;
    }

    try {
      result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    } catch {
      result = null;
    }

    try {
      payload = JSON.parse(await fs.readFile(payloadPath, "utf8"));
    } catch {
      payload = {};
    }

    batches.push({
      jobId: meta.id || entry.name,
      meta,
      result,
      payload
    });
  }

  batches.sort((left, right) =>
    String(left.meta.createdAt || "").localeCompare(String(right.meta.createdAt || ""))
  );

  const summary = {
    rebuiltBatchCount: 0,
    rebuiltCompletedCount: 0,
    rebuiltFailedCount: 0,
    skippedCount: 0
  };

  try {
    for (const batch of batches) {
      const batchId = batch.jobId;
      metadataStore.beginBatch({
        batchId,
        jobId: batchId,
        generatedAt:
          batch.result?.generatedAt || batch.meta.generatedAt || batch.meta.createdAt || new Date().toISOString(),
        settings: batch.payload?.settings || {}
      });

      if (batch.meta.status === "completed" && batch.result) {
        const sources = (batch.result.sourceFiles || []).map((source) =>
          toPersistedSource(source, batchId)
        );
        const warnings = batch.result.warnings || [];
        metadataStore.persistSources({
          batchId,
          sources,
          warnings
        });
        metadataStore.persistAnalysis({
          batchId,
          result: batch.result,
          warnings,
          rules
        });
        summary.rebuiltCompletedCount += 1;
        summary.rebuiltBatchCount += 1;
        continue;
      }

      if (batch.meta.status === "failed") {
        metadataStore.markBatchFailed(batchId, batch.meta.error || "执行失败");
        summary.rebuiltFailedCount += 1;
        summary.rebuiltBatchCount += 1;
        continue;
      }

      metadataStore.updateBatchStatus(batchId, batch.meta.status || "queued", batch.meta.error || "");
      summary.rebuiltBatchCount += 1;
    }
  } finally {
    metadataStore.close();
  }

  return summary;
}
