import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { getRawMailObjectRoot } from "./raw-object-store.mjs";
import { getMetadataDatabasePath } from "./schema-manager.mjs";

function getJobsRootPath(userDataPath) {
  return path.join(userDataPath, "jobs");
}

function toPosixRelative(basePath, targetPath) {
  return path.relative(basePath, targetPath).split(path.sep).join("/");
}

function parseJsonArray(value, fallback = []) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function buildJobLocation(jobsRootPath, jobId) {
  const jobDirectory = path.join(jobsRootPath, jobId);
  return {
    jobId,
    directoryPath: jobDirectory,
    metaPath: path.join(jobDirectory, "meta.json"),
    payloadPath: path.join(jobDirectory, "payload.json"),
    resultPath: path.join(jobDirectory, "result.json"),
    meta: await readJsonIfExists(path.join(jobDirectory, "meta.json")),
    payload: await readJsonIfExists(path.join(jobDirectory, "payload.json")),
    result: await readJsonIfExists(path.join(jobDirectory, "result.json"))
  };
}

async function listFilesRecursively(rootPath) {
  const output = [];

  async function walk(currentPath) {
    let entries = [];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isFile()) {
        output.push(absolutePath);
      }
    }
  }

  await walk(rootPath);
  return output;
}

function getOpsPaths(userDataPath) {
  return {
    userDataPath,
    databasePath: getMetadataDatabasePath(userDataPath),
    jobsRootPath: getJobsRootPath(userDataPath),
    objectRootPath: getRawMailObjectRoot(userDataPath)
  };
}

function createDatabaseHandle(databasePath) {
  return new Database(databasePath, { fileMustExist: true });
}

function loadDatabaseSnapshot(db) {
  const batches = db
    .prepare(`
      SELECT batch_id, job_id, status, source_count, raw_object_count, email_count,
             thread_count, transaction_count, people_count, retrieval_count
      FROM import_batches
      ORDER BY created_at ASC
    `)
    .all();

  const rawObjects = db
    .prepare(`
      SELECT object_id, batch_id, source_ref, client_uid, source_type,
             archive_file_name, storage_rel_path, sha256, byte_size
      FROM raw_mail_objects
    `)
    .all();

  const sourceRawRefs = db
    .prepare(`
      SELECT batch_id, source_ref, raw_object_id
      FROM source_files
      WHERE raw_object_id IS NOT NULL AND raw_object_id <> ''
    `)
    .all();

  const messageRawRefs = db
    .prepare(`
      SELECT batch_id, message_id, raw_object_id
      FROM email_messages
      WHERE raw_object_id IS NOT NULL AND raw_object_id <> ''
    `)
    .all();

  const retrievalRows = db
    .prepare(`
      SELECT record_id, title, source, keywords_json, search_terms_json
      FROM retrieval_documents
    `)
    .all();

  const retrievalFtsIds = db.prepare(`SELECT record_id FROM retrieval_fts`).all();

  const deletionOperations = db
    .prepare(`
      SELECT operation_id, batch_id, job_id, status, error, updated_at
      FROM batch_deletion_operations
      ORDER BY updated_at ASC
    `)
    .all();

  const counts = db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM import_batches) AS batch_count,
        (SELECT COUNT(*) FROM raw_mail_objects) AS raw_object_count,
        (SELECT COUNT(*) FROM source_files) AS source_count,
        (SELECT COUNT(*) FROM email_messages) AS email_count,
        (SELECT COUNT(*) FROM email_threads) AS thread_count,
        (SELECT COUNT(*) FROM transactions) AS transaction_count,
        (SELECT COUNT(*) FROM people) AS people_count,
        (SELECT COUNT(*) FROM retrieval_documents) AS retrieval_count
    `)
    .get();

  return {
    batches,
    rawObjects,
    sourceRawRefs,
    messageRawRefs,
    retrievalRows,
    retrievalFtsIds: retrievalFtsIds.map((row) => row.record_id),
    deletionOperations,
    counts: {
      batchCount: counts?.batch_count || 0,
      rawObjectCount: counts?.raw_object_count || 0,
      sourceCount: counts?.source_count || 0,
      emailCount: counts?.email_count || 0,
      threadCount: counts?.thread_count || 0,
      transactionCount: counts?.transaction_count || 0,
      peopleCount: counts?.people_count || 0,
      retrievalCount: counts?.retrieval_count || 0
    }
  };
}

function buildGroupedCountMap(db, tableName) {
  const rows = db.prepare(`SELECT batch_id, COUNT(*) AS count FROM ${tableName} GROUP BY batch_id`).all();
  return new Map(rows.map((row) => [row.batch_id, row.count]));
}

async function inspectJobArtifacts(jobsRootPath, batches) {
  const issues = {
    missingJobMeta: [],
    missingJobPayload: [],
    missingJobResult: [],
    orphanJobDirectories: []
  };

  let directories = [];
  try {
    directories = await fs.readdir(jobsRootPath, { withFileTypes: true });
  } catch {
    directories = [];
  }

  const jobIds = new Set(batches.map((batch) => batch.job_id));

  for (const batch of batches) {
    const jobDirectory = path.join(jobsRootPath, batch.job_id);
    const metaPath = path.join(jobDirectory, "meta.json");
    const payloadPath = path.join(jobDirectory, "payload.json");
    const resultPath = path.join(jobDirectory, "result.json");

    if (!(await pathExists(metaPath))) {
      issues.missingJobMeta.push({
        jobId: batch.job_id,
        batchId: batch.batch_id,
        path: metaPath
      });
    }

    if (!(await pathExists(payloadPath))) {
      issues.missingJobPayload.push({
        jobId: batch.job_id,
        batchId: batch.batch_id,
        path: payloadPath
      });
    }

    if (batch.status === "completed" && !(await pathExists(resultPath))) {
      issues.missingJobResult.push({
        jobId: batch.job_id,
        batchId: batch.batch_id,
        path: resultPath
      });
    }
  }

  for (const directory of directories) {
    if (!directory.isDirectory()) {
      continue;
    }

    if (!jobIds.has(directory.name)) {
      issues.orphanJobDirectories.push({
        jobId: directory.name,
        path: path.join(jobsRootPath, directory.name)
      });
    }
  }

  return issues;
}

async function inspectObjectFiles({ userDataPath, objectRootPath, rawObjects }) {
  const issues = {
    missingRawObjectFiles: [],
    orphanRawObjectFiles: []
  };

  const expectedRelativePaths = new Set(rawObjects.map((row) => row.storage_rel_path));

  for (const row of rawObjects) {
    const absolutePath = path.join(userDataPath, row.storage_rel_path);
    if (!(await pathExists(absolutePath))) {
      issues.missingRawObjectFiles.push({
        objectId: row.object_id,
        batchId: row.batch_id,
        storageRelativePath: row.storage_rel_path,
        path: absolutePath
      });
    }
  }

  const objectFiles = await listFilesRecursively(objectRootPath);
  for (const filePath of objectFiles) {
    const relativePath = toPosixRelative(userDataPath, filePath);
    if (!expectedRelativePaths.has(relativePath)) {
      issues.orphanRawObjectFiles.push({
        storageRelativePath: relativePath,
        path: filePath
      });
    }
  }

  return issues;
}

function inspectReferenceIntegrity({ rawObjects, sourceRawRefs, messageRawRefs }) {
  const rawObjectIds = new Set(rawObjects.map((row) => row.object_id));

  return {
    danglingSourceRawObjectRefs: sourceRawRefs
      .filter((row) => !rawObjectIds.has(row.raw_object_id))
      .map((row) => ({
        batchId: row.batch_id,
        sourceId: row.source_ref,
        rawObjectId: row.raw_object_id
      })),
    danglingMessageRawObjectRefs: messageRawRefs
      .filter((row) => !rawObjectIds.has(row.raw_object_id))
      .map((row) => ({
        batchId: row.batch_id,
        messageId: row.message_id,
        rawObjectId: row.raw_object_id
      }))
  };
}

function inspectRetrievalIndex({ retrievalRows, retrievalFtsIds }) {
  const retrievalIds = new Set(retrievalRows.map((row) => row.record_id));
  const ftsIds = new Set(retrievalFtsIds);

  return {
    retrievalFtsMissingRows: retrievalRows
      .filter((row) => !ftsIds.has(row.record_id))
      .map((row) => ({
        recordId: row.record_id,
        title: row.title
      })),
    retrievalFtsOrphanRows: retrievalFtsIds
      .filter((recordId) => !retrievalIds.has(recordId))
      .map((recordId) => ({ recordId }))
  };
}

function inspectDeletionOperations({ deletionOperations, batches }) {
  const batchIds = new Set(batches.map((batch) => batch.batch_id));
  return {
    staleDeletionOperations: deletionOperations
      .filter((row) => !batchIds.has(row.batch_id))
      .map((row) => ({
        operationId: row.operation_id,
        batchId: row.batch_id,
        jobId: row.job_id,
        status: row.status,
        error: row.error,
        updatedAt: row.updated_at
      }))
  };
}

function inspectBatchCounts({ db, batches }) {
  const rawCountMap = buildGroupedCountMap(db, "raw_mail_objects");
  const sourceCountMap = buildGroupedCountMap(db, "source_files");
  const emailCountMap = buildGroupedCountMap(db, "email_messages");
  const threadCountMap = buildGroupedCountMap(db, "email_threads");
  const transactionCountMap = buildGroupedCountMap(db, "transactions");
  const peopleCountMap = buildGroupedCountMap(db, "people");
  const retrievalCountMap = buildGroupedCountMap(db, "retrieval_documents");

  return {
    batchCountMismatches: batches
      .map((batch) => {
        const actual = {
          rawObjectCount: rawCountMap.get(batch.batch_id) || 0,
          sourceCount: sourceCountMap.get(batch.batch_id) || 0,
          emailCount: emailCountMap.get(batch.batch_id) || 0,
          threadCount: threadCountMap.get(batch.batch_id) || 0,
          transactionCount: transactionCountMap.get(batch.batch_id) || 0,
          peopleCount: peopleCountMap.get(batch.batch_id) || 0,
          retrievalCount: retrievalCountMap.get(batch.batch_id) || 0
        };
        const stored = {
          rawObjectCount: batch.raw_object_count || 0,
          sourceCount: batch.source_count || 0,
          emailCount: batch.email_count || 0,
          threadCount: batch.thread_count || 0,
          transactionCount: batch.transaction_count || 0,
          peopleCount: batch.people_count || 0,
          retrievalCount: batch.retrieval_count || 0
        };
        const mismatchKeys = Object.keys(actual).filter((key) => actual[key] !== stored[key]);

        if (mismatchKeys.length === 0) {
          return null;
        }

        return {
          batchId: batch.batch_id,
          jobId: batch.job_id,
          stored,
          actual
        };
      })
      .filter(Boolean)
  };
}

function summarizeHealth(issues) {
  return Object.values(issues).every((entries) => Array.isArray(entries) && entries.length === 0);
}

export async function runStorageDoctor({ userDataPath }) {
  const paths = getOpsPaths(userDataPath);
  const databaseExists = await pathExists(paths.databasePath);
  const jobsRootExists = await pathExists(paths.jobsRootPath);
  const objectRootExists = await pathExists(paths.objectRootPath);

  if (!databaseExists) {
    const orphanJobDirectories = jobsRootExists
      ? (await fs.readdir(paths.jobsRootPath, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => ({
            jobId: entry.name,
            path: path.join(paths.jobsRootPath, entry.name)
          }))
      : [];
    const orphanRawObjectFiles = objectRootExists
      ? (await listFilesRecursively(paths.objectRootPath)).map((filePath) => ({
          storageRelativePath: toPosixRelative(userDataPath, filePath),
          path: filePath
        }))
      : [];

    return {
      ...paths,
      databasePresent: false,
      summary: {
        batchCount: 0,
        rawObjectCount: 0,
        sourceCount: 0,
        emailCount: 0,
        threadCount: 0,
        transactionCount: 0,
        peopleCount: 0,
        retrievalCount: 0
      },
      issues: {
        databaseMissing: [
          {
            databasePath: paths.databasePath
          }
        ],
        missingJobMeta: [],
        missingJobPayload: [],
        missingJobResult: [],
        orphanJobDirectories,
        missingRawObjectFiles: [],
        orphanRawObjectFiles,
        danglingSourceRawObjectRefs: [],
        danglingMessageRawObjectRefs: [],
        retrievalFtsMissingRows: [],
        retrievalFtsOrphanRows: [],
        staleDeletionOperations: [],
        batchCountMismatches: []
      },
      healthy: false
    };
  }

  const db = createDatabaseHandle(paths.databasePath);
  try {
    const snapshot = loadDatabaseSnapshot(db);
    const jobIssues = await inspectJobArtifacts(paths.jobsRootPath, snapshot.batches);
    const objectIssues = await inspectObjectFiles({
      userDataPath,
      objectRootPath: paths.objectRootPath,
      rawObjects: snapshot.rawObjects
    });
    const referenceIssues = inspectReferenceIntegrity(snapshot);
    const retrievalIssues = inspectRetrievalIndex(snapshot);
    const deletionIssues = inspectDeletionOperations(snapshot);
    const countIssues = inspectBatchCounts({
      db,
      batches: snapshot.batches
    });

    const issues = {
      databaseMissing: [],
      ...jobIssues,
      ...objectIssues,
      ...referenceIssues,
      ...retrievalIssues,
      ...deletionIssues,
      ...countIssues
    };

    return {
      ...paths,
      databasePresent: true,
      summary: snapshot.counts,
      issues,
      healthy: summarizeHealth(issues)
    };
  } finally {
    db.close();
  }
}

export async function locateStorageEntity({ userDataPath, jobId = "", batchId = "", objectId = "" }) {
  const paths = getOpsPaths(userDataPath);
  const databasePresent = await pathExists(paths.databasePath);
  const jobsRootPresent = await pathExists(paths.jobsRootPath);
  const objectRootPresent = await pathExists(paths.objectRootPath);

  if (!jobId && !batchId && !objectId) {
    throw new Error("至少需要提供 --job-id、--batch-id 或 --object-id 其中一个参数。");
  }

  const result = {
    ...paths,
    databasePresent,
    jobsRootPresent,
    objectRootPresent,
    query: {
      jobId: String(jobId || ""),
      batchId: String(batchId || ""),
      objectId: String(objectId || "")
    }
  };

  if (jobId || batchId) {
    const resolvedJobId = String(jobId || "");
    const fallbackJobId = resolvedJobId || String(batchId || "");
    result.job = await buildJobLocation(paths.jobsRootPath, fallbackJobId);
  }

  if (!databasePresent) {
    return result;
  }

  const db = createDatabaseHandle(paths.databasePath);
  try {
    if (jobId || batchId) {
      const resolvedJobId = String(jobId || "");
      const resolvedBatchId = String(batchId || "");
      const batchRow =
        db
          .prepare(
            `
              SELECT *
              FROM import_batches
              WHERE batch_id = ? OR job_id = ?
              LIMIT 1
            `
          )
          .get(resolvedBatchId || resolvedJobId, resolvedJobId || resolvedBatchId) || null;

      if (batchRow) {
        const effectiveBatchId = batchRow.batch_id;
        result.job = await buildJobLocation(paths.jobsRootPath, batchRow.job_id);
        result.batch = {
          batchId: effectiveBatchId,
          jobId: batchRow.job_id,
          status: batchRow.status,
          createdAt: batchRow.created_at,
          updatedAt: batchRow.updated_at,
          counts: {
            sourceCount: batchRow.source_count,
            rawObjectCount: batchRow.raw_object_count,
            emailCount: batchRow.email_count,
            threadCount: batchRow.thread_count,
            transactionCount: batchRow.transaction_count,
            peopleCount: batchRow.people_count,
            retrievalCount: batchRow.retrieval_count
          },
          deletionOperation:
            db
              .prepare(`SELECT operation_id, status, error, updated_at FROM batch_deletion_operations WHERE batch_id = ?`)
              .get(effectiveBatchId) || null,
          sampleObjects: db
            .prepare(
              `
                SELECT object_id, client_uid, source_type, archive_file_name,
                       storage_rel_path, sha256, byte_size
                FROM raw_mail_objects
                WHERE batch_id = ?
                ORDER BY created_at ASC
                LIMIT 20
              `
            )
            .all(effectiveBatchId),
          sampleSources: db
            .prepare(
              `
                SELECT source_ref, name, raw_object_id, kind
                FROM source_files
                WHERE batch_id = ?
                ORDER BY created_at ASC
                LIMIT 20
              `
            )
            .all(effectiveBatchId)
        };
      }
    }

    if (objectId) {
      const row =
        db
          .prepare(
            `
              SELECT *
              FROM raw_mail_objects
              WHERE object_id = ?
              LIMIT 1
            `
          )
          .get(objectId) || null;

      if (row) {
        const absolutePath = path.join(userDataPath, row.storage_rel_path);
        result.object = {
          objectId: row.object_id,
          batchId: row.batch_id,
          sourceId: row.source_ref,
          sha256: row.sha256,
          byteSize: row.byte_size,
          clientUid: row.client_uid || "",
          sourceType: row.source_type || "",
          archiveFileName: row.archive_file_name || "",
          originalFileName: row.original_file_name,
          originalRelativePath: row.original_relative_path,
          storageRelativePath: row.storage_rel_path,
          path: absolutePath,
          exists: await pathExists(absolutePath),
          source:
            db
              .prepare(
                `
                  SELECT source_ref, name, source_path, kind
                  FROM source_files
                  WHERE batch_id = ? AND raw_object_id = ?
                  LIMIT 1
                `
              )
              .get(row.batch_id, row.object_id) || null,
          messages: db
            .prepare(
              `
                SELECT message_id, subject, thread_id, transaction_id
                FROM email_messages
                WHERE batch_id = ? AND raw_object_id = ?
                ORDER BY sent_at ASC
                LIMIT 20
              `
            )
            .all(row.batch_id, row.object_id)
        };
      }
    }

    return result;
  } finally {
    db.close();
  }
}

export async function reconcileStorage({
  userDataPath,
  apply = false,
  pruneOrphanObjects = false
}) {
  const doctor = await runStorageDoctor({ userDataPath });
  const report = {
    userDataPath,
    apply,
    pruneOrphanObjects,
    databasePresent: doctor.databasePresent,
    plannedActions: {
      rebuildRetrievalFts:
        doctor.issues.retrievalFtsMissingRows.length + doctor.issues.retrievalFtsOrphanRows.length,
      syncBatchCounts: doctor.issues.batchCountMismatches.length,
      clearStaleDeletionOperations: doctor.issues.staleDeletionOperations.length,
      pruneOrphanRawObjectFiles: pruneOrphanObjects ? doctor.issues.orphanRawObjectFiles.length : 0
    },
    appliedActions: {
      rebuiltRetrievalFts: 0,
      syncedBatchCounts: 0,
      clearedStaleDeletionOperations: 0,
      prunedOrphanRawObjectFiles: 0
    },
    unresolvedIssues: {
      missingRawObjectFiles: doctor.issues.missingRawObjectFiles.length,
      missingJobMeta: doctor.issues.missingJobMeta.length,
      missingJobPayload: doctor.issues.missingJobPayload.length,
      missingJobResult: doctor.issues.missingJobResult.length,
      danglingSourceRawObjectRefs: doctor.issues.danglingSourceRawObjectRefs.length,
      danglingMessageRawObjectRefs: doctor.issues.danglingMessageRawObjectRefs.length,
      orphanJobDirectories: doctor.issues.orphanJobDirectories.length
    }
  };

  if (!apply || !doctor.databasePresent) {
    return {
      ...report,
      healthyAfter: doctor.healthy,
      doctor
    };
  }

  const db = createDatabaseHandle(doctor.databasePath);
  try {
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM retrieval_fts").run();
      const retrievalRows = db
        .prepare(`
          SELECT record_id, title, source, keywords_json, search_terms_json
          FROM retrieval_documents
        `)
        .all();
      const insertRetrievalFtsStmt = db.prepare(`
        INSERT INTO retrieval_fts (
          record_id, title, search_text, source, keywords
        ) VALUES (?, ?, ?, ?, ?)
      `);
      for (const row of retrievalRows) {
        insertRetrievalFtsStmt.run(
          row.record_id,
          row.title || "",
          parseJsonArray(row.search_terms_json).join(" "),
          row.source || "",
          parseJsonArray(row.keywords_json).join(" ")
        );
      }
      report.appliedActions.rebuiltRetrievalFts = retrievalRows.length;

      const rawCountMap = buildGroupedCountMap(db, "raw_mail_objects");
      const sourceCountMap = buildGroupedCountMap(db, "source_files");
      const emailCountMap = buildGroupedCountMap(db, "email_messages");
      const threadCountMap = buildGroupedCountMap(db, "email_threads");
      const transactionCountMap = buildGroupedCountMap(db, "transactions");
      const peopleCountMap = buildGroupedCountMap(db, "people");
      const retrievalCountMap = buildGroupedCountMap(db, "retrieval_documents");
      const batchRows = db
        .prepare(`SELECT batch_id FROM import_batches`)
        .all()
        .map((row) => row.batch_id);
      const updateBatchCountsStmt = db.prepare(`
        UPDATE import_batches
        SET source_count = ?, raw_object_count = ?, email_count = ?, thread_count = ?,
            transaction_count = ?, people_count = ?, retrieval_count = ?, updated_at = ?
        WHERE batch_id = ?
      `);
      const now = new Date().toISOString();
      for (const batchId of batchRows) {
        updateBatchCountsStmt.run(
          sourceCountMap.get(batchId) || 0,
          rawCountMap.get(batchId) || 0,
          emailCountMap.get(batchId) || 0,
          threadCountMap.get(batchId) || 0,
          transactionCountMap.get(batchId) || 0,
          peopleCountMap.get(batchId) || 0,
          retrievalCountMap.get(batchId) || 0,
          now,
          batchId
        );
      }
      report.appliedActions.syncedBatchCounts = batchRows.length;

      const staleOperations = db
        .prepare(`
          SELECT operation_id
          FROM batch_deletion_operations
          WHERE batch_id NOT IN (SELECT batch_id FROM import_batches)
        `)
        .all();
      const deleteStaleOperationStmt = db.prepare(`
        DELETE FROM batch_deletion_operations WHERE operation_id = ?
      `);
      for (const row of staleOperations) {
        deleteStaleOperationStmt.run(row.operation_id);
      }
      report.appliedActions.clearedStaleDeletionOperations = staleOperations.length;

      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    db.close();
  }

  if (pruneOrphanObjects) {
    for (const orphan of doctor.issues.orphanRawObjectFiles) {
      try {
        await fs.rm(orphan.path, { force: true });
        report.appliedActions.prunedOrphanRawObjectFiles += 1;
      } catch {
        // Keep best-effort file cleanup non-fatal for reconciliation.
      }
    }
  }

  const afterDoctor = await runStorageDoctor({ userDataPath });
  return {
    ...report,
    healthyAfter: afterDoctor.healthy,
    doctor: afterDoctor
  };
}
