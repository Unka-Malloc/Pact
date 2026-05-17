import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { rebuildMetadataStore } from "../platform/common/storage/rebuild-metadata.mjs";
import { getMetadataDatabasePath } from "../platform/common/storage/schema-manager.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";

const mockDocumentParserModulePath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../tests/server/mock-structured-document-parser.mjs"
);

function buildUploadedFile(name, relativePath, text) {
  const buffer = Buffer.from(text, "utf8");
  const dataBase64 = buffer.toString("base64");
  return {
    name,
    relativePath,
    mediaType: "message/rfc822",
    dataBase64,
    byteSize: buffer.length
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function waitForJob(baseUrl, jobId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const job = await fetchJson(`${baseUrl}/api/jobs/${jobId}`);
    if (job.status === "completed") {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Job did not complete in time.");
}

async function rmWithRetry(targetPath) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rm(targetPath, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100
      });
      return;
    } catch (error) {
      if (attempt === 7) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
}

function inspectSourceDocumentStorage(userDataPath, query) {
  const db = new Database(getMetadataDatabasePath(userDataPath), {
    readonly: true
  });
  try {
    const profileCount = db.prepare("SELECT COUNT(*) AS count FROM source_document_profiles").get().count;
    const ftsCount = db.prepare("SELECT COUNT(*) AS count FROM source_document_fts WHERE source_document_fts MATCH ?").get(query).count;
    const vocabulary = db.prepare(`
      SELECT frequency, document_frequency, bm25_weight
      FROM source_vocabulary_terms
      ORDER BY frequency DESC, term ASC
      LIMIT 1
    `).get();
    const rawTerms = db.prepare(`
      SELECT frequency
      FROM source_corpus_raw_terms
      ORDER BY frequency DESC, term ASC
      LIMIT 1
    `).get();
    const rawTermColumns = db.prepare("PRAGMA table_info(source_corpus_raw_terms)")
      .all()
      .map((column) => column.name);
    return {
      profileCount,
      ftsCount,
      vocabulary,
      rawTerms,
      rawTermColumns
    };
  } finally {
    db.close();
  }
}

function getBatchIdForSource(userDataPath, sourcePath, sourceName) {
  const db = new Database(getMetadataDatabasePath(userDataPath), {
    readonly: true
  });
  try {
    const row = db.prepare(`
      SELECT batch_id
      FROM source_files
      WHERE source_path = ? OR name = ?
      ORDER BY created_at ASC
      LIMIT 1
    `).get(sourcePath, sourceName);
    return row?.batch_id || "";
  } finally {
    db.close();
  }
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "splitall-rebuild-"));
const server = await startHttpServer({
  userDataPath,
  runtimeOptions: {
    mountModules: {
      documentParser: mockDocumentParserModulePath
    }
  }
});
const auth = await installAuthenticatedFetch(server);
let serverClosed = false;

try {
  const weeklyText = [
    "From: Alice <alice@example.com>",
    "To: Bob <bob@example.com>",
    "Subject: 华东项目周报",
    "Date: 2026-04-01T09:00:00Z",
    "",
    "本周完成接口联调，待确认上线窗口。",
    "Project invoice window remains open for storage profile verification."
  ].join("\n");
  const job = await fetchJson(`${server.url}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      uploadedFiles: [
        buildUploadedFile(
          "weekly.eml",
          "mailbox/weekly.eml",
          weeklyText
        )
      ],
      settings: {}
    })
  });

  await waitForJob(server.url, job.id);
  const weeklyBatchId = getBatchIdForSource(userDataPath, "mailbox/weekly.eml", "weekly.eml");
  assert.ok(weeklyBatchId);
  const singleSummary = await fetchJson(`${server.url}/api/storage/summary`);
  assert.ok(singleSummary.sourceCorpusRawTermCount > 0);
  assert.ok(singleSummary.sourceCorpusRawTotalFrequency > 0);
  assert.ok(singleSummary.sourceVocabularyTermCount > 0);
  assert.ok(singleSummary.sourceVocabularyUniqueFileCount > 0);
  const duplicateJob = await fetchJson(`${server.url}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      uploadedFiles: [
        buildUploadedFile(
          "weekly-copy.eml",
          "mailbox/weekly-copy.eml",
          weeklyText
        )
      ],
      settings: {}
    })
  });
  await waitForJob(server.url, duplicateJob.id);
  const duplicateSummary = await fetchJson(`${server.url}/api/storage/summary`);
  assert.ok(duplicateSummary.sourceCorpusRawTermCount > 0);
  assert.ok(duplicateSummary.sourceCorpusRawTotalFrequency > 0);
  assert.ok(duplicateSummary.sourceVocabularyTermCount > 0);
  assert.ok(duplicateSummary.sourceVocabularyTotalFrequency >= duplicateSummary.sourceVocabularyTermCount);
  assert.equal(
    duplicateSummary.sourceVocabularyUniqueFileCount,
    singleSummary.sourceVocabularyUniqueFileCount
  );
  assert.equal(
    duplicateSummary.sourceVocabularyTotalFrequency,
    singleSummary.sourceVocabularyTotalFrequency
  );
  assert.equal(
    duplicateSummary.sourceCorpusRawTotalFrequency,
    singleSummary.sourceCorpusRawTotalFrequency
  );
  const backgroundText = [
    "From: Carol <carol@example.com>",
    "To: Dave <dave@example.com>",
    "Subject: Engineering status",
    "Date: 2026-04-02T09:00:00Z",
    "",
    "Runtime logs mention queue heartbeat and deployment health checks."
  ].join("\n");
  const backgroundJob = await fetchJson(`${server.url}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      uploadedFiles: [
        buildUploadedFile(
          "engineering.eml",
          "mailbox/engineering.eml",
          backgroundText
        )
      ],
      settings: {}
    })
  });
  await waitForJob(server.url, backgroundJob.id);
  const significantTerms = await fetchJson(`${server.url}/api/knowledge/corpus/significant-terms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      scope: {
        batchId: weeklyBatchId
      },
      limit: 20
    })
  });
  assert.equal(significantTerms.ok, true);
  assert.equal(significantTerms.scope.batchId, weeklyBatchId);
  assert.ok(significantTerms.foregroundDocumentCount >= 1);
  assert.ok(significantTerms.backgroundDocumentCount >= 1);
  assert.ok(significantTerms.terms.some((term) => term.term === "invoice"));

  const beforeSummary = await fetchJson(`${server.url}/api/storage/summary`);
  const vocabularyRebuild = await fetchJson(`${server.url}/api/storage/source-vocabulary/rebuild`, {
    method: "POST"
  });
  assert.equal(vocabularyRebuild.ok, true);
  assert.equal(
    vocabularyRebuild.sourceVocabularyUniqueFileCount,
    beforeSummary.sourceVocabularyUniqueFileCount
  );
  assert.equal(
    vocabularyRebuild.sourceCorpusRawTotalFrequency,
    beforeSummary.sourceCorpusRawTotalFrequency
  );
  assert.equal(
    vocabularyRebuild.sourceVocabularyTotalFrequency,
    beforeSummary.sourceVocabularyTotalFrequency
  );
  const beforeSearch = await fetchJson(`${server.url}/api/search?q=${encodeURIComponent("上线窗口")}`);
  const beforeSourceDocuments = inspectSourceDocumentStorage(userDataPath, "invoice");
  assert.equal(beforeSummary.sourceDocumentProfileCount, beforeSummary.sourceCount);
  assert.ok(beforeSourceDocuments.profileCount >= 1);
  assert.ok(beforeSourceDocuments.ftsCount >= 1);
  assert.ok(beforeSourceDocuments.vocabulary.frequency > 0);
  assert.ok(beforeSourceDocuments.vocabulary.document_frequency > 0);
  assert.ok(beforeSourceDocuments.vocabulary.bm25_weight > 0);
  assert.ok(beforeSourceDocuments.rawTerms.frequency > 0);
  assert.deepEqual(beforeSourceDocuments.rawTermColumns, ["term", "frequency"]);

  await server.close();
  serverClosed = true;
  await rmWithRetry(path.dirname(getMetadataDatabasePath(userDataPath)));

  const rebuildSummary = await rebuildMetadataStore({
    userDataPath
  });
  assert.ok(rebuildSummary.rebuiltCompletedCount >= 1);

  const rebuiltServer = await startHttpServer({
    userDataPath,
    runtimeOptions: {
      mountModules: {
        documentParser: mockDocumentParserModulePath
      }
    }
  });
  await installAuthenticatedFetch(rebuiltServer, { auth });
  try {
    const afterSummary = await fetchJson(`${rebuiltServer.url}/api/storage/summary`);
    const afterSearch = await fetchJson(
      `${rebuiltServer.url}/api/search?q=${encodeURIComponent("上线窗口")}`
    );

    assert.equal(afterSummary.batchCount, beforeSummary.batchCount);
    assert.equal(afterSummary.sourceDocumentProfileCount, beforeSummary.sourceDocumentProfileCount);
    assert.equal(afterSummary.sourceCorpusRawTermCount, beforeSummary.sourceCorpusRawTermCount);
    assert.equal(
      afterSummary.sourceCorpusRawTotalFrequency,
      beforeSummary.sourceCorpusRawTotalFrequency
    );
    assert.equal(afterSummary.sourceVocabularyTermCount, beforeSummary.sourceVocabularyTermCount);
    assert.equal(
      afterSummary.sourceVocabularyUniqueFileCount,
      beforeSummary.sourceVocabularyUniqueFileCount
    );
    assert.equal(
      afterSummary.sourceVocabularyTotalFrequency,
      beforeSummary.sourceVocabularyTotalFrequency
    );
    assert.equal(afterSummary.preprocessBlockCount, beforeSummary.preprocessBlockCount);
    assert.equal(afterSummary.preprocessChunkCount, beforeSummary.preprocessChunkCount);
    assert.equal(afterSummary.transactionCount, beforeSummary.transactionCount);
    assert.equal(afterSummary.retrievalCount, beforeSummary.retrievalCount);
    const afterSourceDocuments = inspectSourceDocumentStorage(userDataPath, "invoice");
    assert.equal(afterSourceDocuments.profileCount, beforeSourceDocuments.profileCount);
    assert.equal(afterSourceDocuments.ftsCount, beforeSourceDocuments.ftsCount);
    assert.equal(afterSourceDocuments.vocabulary.frequency, beforeSourceDocuments.vocabulary.frequency);
    assert.equal(
      afterSourceDocuments.vocabulary.document_frequency,
      beforeSourceDocuments.vocabulary.document_frequency
    );
    assert.equal(afterSourceDocuments.rawTerms.frequency, beforeSourceDocuments.rawTerms.frequency);
    assert.deepEqual(afterSourceDocuments.rawTermColumns, ["term", "frequency"]);
    assert.ok(afterSearch.items.length >= beforeSearch.items.length);
  } finally {
    await rebuiltServer.close();
  }
} finally {
  if (!serverClosed) {
    await server.close().catch(() => {});
  }
  await rmWithRetry(userDataPath);
}

console.log("Metadata rebuild verification passed.");
