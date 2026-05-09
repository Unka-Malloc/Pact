import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildSearchTerms } from "../../specialized/knowledge/domain/rules/index.mjs";
import { getRawMailObjectRoot } from "./raw-object-store.mjs";
import { asBoolInt, asJson, scopedId } from "./metadata-helpers.mjs";

function asObjectJson(value) {
  return JSON.stringify(value && typeof value === "object" && !Array.isArray(value) ? value : {});
}

export function createBatchRepository({ db, userDataPath }) {
  const insertBatchStmt = db.prepare(`
    INSERT INTO import_batches (
      batch_id, job_id, status, created_at, updated_at, generated_at, settings_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(batch_id) DO UPDATE SET
      job_id = excluded.job_id,
      status = excluded.status,
      updated_at = excluded.updated_at,
      generated_at = excluded.generated_at,
      settings_json = excluded.settings_json
  `);
  const updateBatchProgressStmt = db.prepare(`
    UPDATE import_batches
    SET
      status = ?,
      updated_at = ?,
      source_count = ?,
      raw_object_count = ?,
      warnings_json = ?,
      error = ''
    WHERE batch_id = ?
  `);
  const updateBatchStatusStmt = db.prepare(`
    UPDATE import_batches
    SET status = ?, updated_at = ?, error = ?
    WHERE batch_id = ?
  `);
  const failBatchStmt = db.prepare(`
    UPDATE import_batches
    SET status = 'failed', updated_at = ?, error = ?
    WHERE batch_id = ?
  `);
  const persistRawObjectStmt = db.prepare(`
    INSERT INTO raw_mail_objects (
      object_id, batch_id, source_ref, ingest_origin, original_file_name, original_relative_path,
      client_uid, source_type, provider_id, external_id, sync_batch_id, content_hash,
      captured_at, source_metadata_json, archive_file_name, original_source_path, source_container_path,
      storage_rel_path, sha256, byte_size, media_type,
      source_created_at, source_updated_at, source_collected_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const persistSourceStmt = db.prepare(`
    INSERT INTO source_files (
      record_id, batch_id, source_ref, name, source_path, kind, raw_object_id,
      source_created_at, source_updated_at, source_collected_at, provider_id, external_id,
      sync_batch_id, content_hash, captured_at, source_metadata_json, media_type, extracted_text,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPersonStmt = db.prepare(`
    INSERT INTO people (
      record_id, batch_id, person_id, name, primary_email, aliases_json, organization,
      primary_department, departments_json, relation, role, sent_count, received_count,
      cc_count, bcc_count, transaction_count, first_seen_at, last_seen_at, top_topics_json,
      top_counterparties_json, summary, time_weight, freshness, formal_use_allowed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMessageStmt = db.prepare(`
    INSERT INTO email_messages (
      record_id, batch_id, message_id, source_ref, raw_object_id, subject, normalized_subject,
      sent_at, excerpt, body, keywords_json, chunk_ids_json, message_id_header, in_reply_to,
      references_json, previous_message_ids_json, conversation_key, thread_id, transaction_id,
      participant_ids_json, time_weight, freshness, status, formal_use_allowed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMessageParticipantStmt = db.prepare(`
    INSERT INTO email_message_participants (
      batch_id, message_record_id, person_id, role, position
    ) VALUES (?, ?, ?, ?, ?)
  `);
  const insertThreadStmt = db.prepare(`
    INSERT INTO email_threads (
      record_id, batch_id, thread_id, subject, normalized_subject, summary, message_ids_json,
      participant_ids_json, sender_ids_json, started_at, latest_activity_at, keywords_json,
      status, cadence, categories_json, pending_signals_json, transaction_id, time_weight,
      freshness, formal_use_allowed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertThreadMessageStmt = db.prepare(`
    INSERT INTO email_thread_messages (
      batch_id, thread_record_id, message_record_id, position
    ) VALUES (?, ?, ?, ?)
  `);
  const insertTransactionStmt = db.prepare(`
    INSERT INTO transactions (
      record_id, batch_id, transaction_id, title, normalized_subject, summary, status, started_at, latest_activity_at,
      thread_ids_json, message_ids_json, participant_ids_json, timeline_event_ids_json, keywords_json,
      decisions_json, pending_items_json, cadence, categories_json, source_departments_json, lineage_id,
      lifecycle_stage, lifecycle_previous_state, lifecycle_next_state, lifecycle_match_score,
      lifecycle_match_reasons_json, lifecycle_matched_batch_id, lifecycle_matched_transaction_id,
      lifecycle_pulled_event_count, lifecycle_pulled_batch_count, lifecycle_pulled_transaction_count,
      source_spread, time_weight, freshness, formal_use_allowed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTransactionThreadStmt = db.prepare(`
    INSERT INTO transaction_threads (
      batch_id, transaction_record_id, thread_record_id, position
    ) VALUES (?, ?, ?, ?)
  `);
  const insertTimelineStmt = db.prepare(`
    INSERT INTO timeline_events (
      record_id, batch_id, timeline_event_id, timestamp, title, summary, type, source,
      message_id, thread_id, transaction_id, lineage_id, timeline_phase, origin_batch_id,
      origin_transaction_id, participant_ids_json, time_weight, freshness
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRetrievalStmt = db.prepare(`
    INSERT INTO retrieval_documents (
      record_id, batch_id, retrieval_id, entity_type, entity_id, title, text, snippet,
      timestamp, source, keywords_json, participant_ids_json, transaction_id, thread_id,
      raw_object_id, time_weight, freshness, status, formal_use_allowed, review_due_at,
      search_terms_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRetrievalFtsStmt = db.prepare(`
    INSERT INTO retrieval_fts (
      record_id, title, search_text, source, keywords
    ) VALUES (?, ?, ?, ?, ?)
  `);
  const completeBatchStmt = db.prepare(`
    UPDATE import_batches
    SET
      status = 'completed',
      updated_at = ?,
      warnings_json = ?,
      overview_json = ?,
      email_count = ?,
      thread_count = ?,
      transaction_count = ?,
      people_count = ?,
      retrieval_count = ?,
      error = ''
    WHERE batch_id = ?
  `);
  const selectRawObjectStmt = db.prepare(`
    SELECT * FROM raw_mail_objects WHERE object_id = ?
  `);
  const listRawObjectStoragePathsByBatchStmt = db.prepare(`
    SELECT storage_rel_path
    FROM raw_mail_objects
    WHERE batch_id = ?
    ORDER BY created_at ASC
  `);
  const selectSummaryStmt = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM import_batches) AS batch_count,
      (SELECT COUNT(*) FROM raw_mail_objects) AS raw_object_count,
      (SELECT COUNT(*) FROM source_files) AS source_count,
      (SELECT COUNT(*) FROM email_messages) AS email_count,
      (SELECT COUNT(*) FROM email_threads) AS thread_count,
      (SELECT COUNT(*) FROM transactions) AS transaction_count,
      (SELECT COUNT(*) FROM transaction_lineages) AS lineage_count,
      (SELECT COUNT(*) FROM transaction_lineage_runs) AS lineage_run_count,
      (SELECT COUNT(*) FROM client_registrations) AS client_count,
      (SELECT COUNT(*) FROM people) AS people_count,
      (SELECT COUNT(*) FROM retrieval_documents) AS retrieval_count
  `);
  const selectBatchExistsStmt = db.prepare(`
    SELECT batch_id FROM import_batches WHERE batch_id = ?
  `);
  const selectBatchStmt = db.prepare(`
    SELECT * FROM import_batches WHERE batch_id = ?
  `);
  const insertDeletionOperationStmt = db.prepare(`
    INSERT INTO batch_deletion_operations (
      operation_id, batch_id, job_id, status, state_json, error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(batch_id) DO UPDATE SET
      job_id = excluded.job_id,
      status = excluded.status,
      state_json = excluded.state_json,
      error = excluded.error,
      updated_at = excluded.updated_at
  `);
  const updateDeletionOperationStmt = db.prepare(`
    UPDATE batch_deletion_operations
    SET status = ?, state_json = ?, error = ?, updated_at = ?
    WHERE operation_id = ?
  `);
  const selectDeletionOperationByBatchStmt = db.prepare(`
    SELECT * FROM batch_deletion_operations WHERE batch_id = ?
  `);
  const selectDeletionOperationByIdStmt = db.prepare(`
    SELECT * FROM batch_deletion_operations WHERE operation_id = ?
  `);
  const listDeletionOperationsStmt = db.prepare(`
    SELECT * FROM batch_deletion_operations
    WHERE status <> 'completed'
    ORDER BY updated_at ASC
  `);
  const deleteDeletionOperationStmt = db.prepare(`
    DELETE FROM batch_deletion_operations WHERE operation_id = ?
  `);
  const deleteBatchStmt = db.prepare("DELETE FROM import_batches WHERE batch_id = ?");

  function hydrateDeletionOperation(row) {
    if (!row) {
      return null;
    }

    let state = {};
    try {
      state = JSON.parse(row.state_json || "{}");
    } catch {
      state = {};
    }

    return {
      operationId: row.operation_id,
      batchId: row.batch_id,
      jobId: row.job_id || "",
      status: row.status,
      state,
      error: row.error || "",
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function deleteBatchDataRecords(batchId) {
    db.exec("BEGIN");
    try {
      db.prepare(`
        DELETE FROM retrieval_fts
        WHERE record_id IN (
          SELECT record_id FROM retrieval_documents WHERE batch_id = ?
        )
      `).run(batchId);
      db.prepare("DELETE FROM retrieval_documents WHERE batch_id = ?").run(batchId);
      db.prepare("DELETE FROM timeline_events WHERE batch_id = ?").run(batchId);
      db.prepare("DELETE FROM transaction_threads WHERE batch_id = ?").run(batchId);
      db.prepare("DELETE FROM transaction_lineage_runs WHERE batch_id = ?").run(batchId);
      db.prepare("DELETE FROM transactions WHERE batch_id = ?").run(batchId);
      db.prepare("DELETE FROM email_thread_messages WHERE batch_id = ?").run(batchId);
      db.prepare("DELETE FROM email_threads WHERE batch_id = ?").run(batchId);
      db.prepare("DELETE FROM email_message_participants WHERE batch_id = ?").run(batchId);
      db.prepare("DELETE FROM email_messages WHERE batch_id = ?").run(batchId);
      db.prepare("DELETE FROM people WHERE batch_id = ?").run(batchId);
      db.prepare("DELETE FROM source_files WHERE batch_id = ?").run(batchId);
      db.prepare("DELETE FROM raw_mail_objects WHERE batch_id = ?").run(batchId);
      db.prepare(`
        DELETE FROM transaction_lineages
        WHERE lineage_id NOT IN (
          SELECT DISTINCT lineage_id FROM transaction_lineage_runs
        )
      `).run();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  return {
    get objectRootPath() {
      return getRawMailObjectRoot(userDataPath);
    },
    beginBatch({ batchId, jobId, generatedAt, settings }) {
      const now = new Date().toISOString();
      insertBatchStmt.run(
        batchId,
        jobId,
        "ingesting",
        now,
        now,
        generatedAt,
        JSON.stringify(settings || {})
      );
    },
    updateBatchStatus(batchId, status, error = "") {
      updateBatchStatusStmt.run(status, new Date().toISOString(), String(error || ""), batchId);
    },
    persistSources({ batchId, sources, warnings }) {
      const now = new Date().toISOString();
      deleteBatchDataRecords(batchId);
      db.exec("BEGIN");
      try {
        let rawObjectCount = 0;

        for (const source of sources || []) {
          if (source.rawObject) {
            rawObjectCount += 1;
            persistRawObjectStmt.run(
              source.rawObject.objectId,
              batchId,
              source.id,
              source.rawObject.ingestOrigin,
              source.rawObject.originalFileName,
              source.rawObject.originalRelativePath,
              source.rawObject.clientUid || "",
              source.rawObject.sourceType || "",
              source.rawObject.providerId || "",
              source.rawObject.externalId || "",
              source.rawObject.syncBatchId || "",
              source.rawObject.contentHash || source.rawObject.sha256 || "",
              source.rawObject.capturedAt || "",
              asObjectJson(source.rawObject.sourceMetadata),
              source.rawObject.archiveFileName || "",
              source.rawObject.originalSourcePath,
              source.rawObject.sourceContainerPath,
              source.rawObject.storageRelativePath,
              source.rawObject.sha256,
              source.rawObject.byteSize,
              source.rawObject.mediaType,
              source.rawObject.sourceCreatedAt,
              source.rawObject.sourceUpdatedAt,
              source.rawObject.sourceCollectedAt,
              source.rawObject.createdAt
            );
          }

          persistSourceStmt.run(
            scopedId(batchId, "source", source.id),
            batchId,
            source.id,
            source.name,
            source.path || "",
            source.kind,
            source.rawObject?.objectId || null,
            source.sourceCreatedAt || "",
            source.sourceUpdatedAt || "",
            source.sourceCollectedAt || "",
            source.providerId || source.rawObject?.providerId || "",
            source.externalId || source.rawObject?.externalId || "",
            source.syncBatchId || source.rawObject?.syncBatchId || "",
            source.contentHash || source.rawObject?.contentHash || source.originalSha256 || "",
            source.capturedAt || source.rawObject?.capturedAt || "",
            asObjectJson(source.sourceMetadata || source.rawObject?.sourceMetadata),
            source.mediaType || "",
            source.text || "",
            now
          );
        }

        updateBatchProgressStmt.run(
          "analyzing",
          now,
          sources.length,
          rawObjectCount,
          JSON.stringify(warnings || []),
          batchId
        );
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    persistAnalysis({ batchId, result, warnings, rules, afterCorePersist }) {
      const now = new Date().toISOString();
      const sourceToRawObjectId = new Map(
        (result.sourceFiles || [])
          .filter((source) => source.rawObjectId)
          .map((source) => [source.id, source.rawObjectId])
      );
      const messageIdToRawObjectId = new Map(
        (result.emails || []).map((email) => [
          email.id,
          email.rawObjectId || sourceToRawObjectId.get(email.sourceId) || ""
        ])
      );

      db.exec("BEGIN");
      try {
        for (const person of result.people || []) {
          const recordId = scopedId(batchId, "person", person.id);
          insertPersonStmt.run(
            recordId,
            batchId,
            person.id,
            person.name,
            person.primaryEmail || "",
            asJson(person.aliases),
            person.organization,
            person.primaryDepartment || "",
            asJson(person.departments),
            person.relation,
            person.role,
            person.sentCount,
            person.receivedCount,
            person.ccCount,
            person.bccCount,
            person.transactionCount,
            person.firstSeenAt,
            person.lastSeenAt,
            asJson(person.topTopics),
            asJson(person.topCounterparties),
            person.summary,
            person.timeWeight,
            person.freshness,
            asBoolInt(person.formalUseAllowed)
          );
        }

        for (const email of result.emails || []) {
          const recordId = scopedId(batchId, "message", email.id);
          insertMessageStmt.run(
            recordId,
            batchId,
            email.id,
            email.sourceId,
            email.rawObjectId || sourceToRawObjectId.get(email.sourceId) || null,
            email.subject,
            email.normalizedSubject || "",
            email.sentAt,
            email.excerpt,
            email.body,
            asJson(email.keywords),
            asJson(email.chunkIds),
            email.messageIdHeader || "",
            email.inReplyTo || "",
            asJson(email.references),
            asJson(email.previousMessageIds),
            email.conversationKey || "",
            email.threadId || "",
            email.transactionId || "",
            asJson(email.participantIds),
            email.timeWeight,
            email.freshness,
            email.status,
            asBoolInt(email.formalUseAllowed)
          );

          const participantBuckets = [
            [email.from ? [email.from] : [], "from"],
            [email.to || [], "to"],
            [email.cc || [], "cc"],
            [email.bcc || [], "bcc"]
          ];

          for (const [participants, role] of participantBuckets) {
            participants.forEach((participant, index) => {
              insertMessageParticipantStmt.run(batchId, recordId, participant.id, role, index);
            });
          }
        }

        for (const thread of result.threads || []) {
          const threadRecordId = scopedId(batchId, "thread", thread.id);
          insertThreadStmt.run(
            threadRecordId,
            batchId,
            thread.id,
            thread.subject,
            thread.normalizedSubject || "",
            thread.summary,
            asJson(thread.messageIds),
            asJson(thread.participantIds),
            asJson(thread.senderIds),
            thread.startedAt,
            thread.latestActivityAt,
            asJson(thread.keywords),
            thread.status,
            thread.cadence,
            asJson(thread.categories),
            asJson(thread.pendingSignals),
            thread.transactionId || "",
            thread.timeWeight,
            thread.freshness,
            asBoolInt(thread.formalUseAllowed)
          );

          thread.messageIds.forEach((messageId, index) => {
            insertThreadMessageStmt.run(
              batchId,
              threadRecordId,
              scopedId(batchId, "message", messageId),
              index
            );
          });
        }

        for (const transaction of result.transactions || []) {
          const transactionRecordId = scopedId(batchId, "transaction", transaction.id);
          insertTransactionStmt.run(
            transactionRecordId,
            batchId,
            transaction.id,
            transaction.title,
            transaction.normalizedSubject || "",
            transaction.summary,
            transaction.status,
            transaction.startedAt,
            transaction.latestActivityAt,
            asJson(transaction.threadIds),
            asJson(transaction.messageIds),
            asJson(transaction.participantIds),
            asJson(transaction.timelineEventIds),
            asJson(transaction.keywords),
            asJson(transaction.decisions),
            asJson(transaction.pendingItems),
            transaction.cadence,
            asJson(transaction.categories),
            asJson(transaction.sourceDepartments),
            transaction.lineageId || "",
            transaction.lifecycle?.stage || "",
            transaction.lifecycle?.previousState || "",
            transaction.lifecycle?.nextState || "",
            Number(transaction.lifecycle?.matchScore || 0),
            asJson(transaction.lifecycle?.matchReasons),
            transaction.lifecycle?.matchedBatchId || "",
            transaction.lifecycle?.matchedTransactionId || "",
            Number(transaction.lifecycle?.pulledEventCount || 0),
            Number(transaction.lifecycle?.pulledBatchCount || 0),
            Number(transaction.lifecycle?.pulledTransactionCount || 0),
            transaction.sourceSpread,
            transaction.timeWeight,
            transaction.freshness,
            asBoolInt(transaction.formalUseAllowed)
          );

          transaction.threadIds.forEach((threadId, index) => {
            insertTransactionThreadStmt.run(
              batchId,
              transactionRecordId,
              scopedId(batchId, "thread", threadId),
              index
            );
          });
        }

        for (const event of result.timeline || []) {
          insertTimelineStmt.run(
            scopedId(batchId, "timeline", event.id),
            batchId,
            event.id,
            event.timestamp,
            event.title,
            event.summary,
            event.type,
            event.source,
            event.messageId || "",
            event.threadId || "",
            event.transactionId || "",
            event.lineageId || "",
            event.timelinePhase || "current",
            event.originBatchId || batchId,
            event.originTransactionId || event.transactionId || "",
            asJson(event.participantIds),
            event.timeWeight,
            event.freshness
          );
        }

        for (const item of result.retrieval?.items || []) {
          const searchTerms = buildSearchTerms(
            [item.title, item.text, ...(item.keywords || [])].join("\n"),
            rules
          );
          insertRetrievalStmt.run(
            scopedId(batchId, "retrieval", item.id),
            batchId,
            item.id,
            item.entityType,
            item.entityType === "message"
              ? item.id.replace(/^retrieval::message::/, "")
              : item.entityType === "thread"
                ? item.id.replace(/^retrieval::thread::/, "")
                : item.entityType === "transaction"
                  ? item.id.replace(/^retrieval::transaction::/, "")
                  : item.id.replace(/^retrieval::person::/, ""),
            item.title,
            item.text,
            item.snippet,
            item.timestamp,
            item.source,
            asJson(item.keywords),
            asJson(item.participantIds),
            item.transactionId || "",
            item.threadId || "",
            item.entityType === "message"
              ? messageIdToRawObjectId.get(item.id.replace(/^retrieval::message::/, "")) || ""
              : "",
            item.timeWeight,
            item.freshness,
            item.status,
            asBoolInt(item.formalUseAllowed),
            item.reviewDueAt || "",
            asJson(searchTerms),
            now
          );
          insertRetrievalFtsStmt.run(
            scopedId(batchId, "retrieval", item.id),
            item.title,
            searchTerms.join(" "),
            item.source,
            (item.keywords || []).join(" ")
          );
        }

        if (typeof afterCorePersist === "function") {
          afterCorePersist({ batchId, result, now });
        }

        completeBatchStmt.run(
          now,
          JSON.stringify(warnings || []),
          JSON.stringify(result.overview || {}),
          result.emails?.length || 0,
          result.threads?.length || 0,
          result.transactions?.length || 0,
          result.people?.length || 0,
          result.retrieval?.items?.length || 0,
          batchId
        );

        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    markBatchFailed(batchId, errorMessage) {
      failBatchStmt.run(new Date().toISOString(), String(errorMessage || "执行失败"), batchId);
    },
    getRawMailObject(objectId) {
      return selectRawObjectStmt.get(objectId) || null;
    },
    listRawObjectStoragePathsByBatch(batchId) {
      return listRawObjectStoragePathsByBatchStmt
        .all(batchId)
        .map((row) => String(row.storage_rel_path || ""))
        .filter(Boolean);
    },
    hasBatch(batchId) {
      return Boolean(selectBatchExistsStmt.get(batchId));
    },
    getBatch(batchId) {
      return selectBatchStmt.get(batchId) || null;
    },
    getStorageSummary() {
      const counts = selectSummaryStmt.get() || {};
      return {
        batchCount: counts.batch_count || 0,
        rawObjectCount: counts.raw_object_count || 0,
        sourceCount: counts.source_count || 0,
        emailCount: counts.email_count || 0,
        threadCount: counts.thread_count || 0,
        transactionCount: counts.transaction_count || 0,
        lineageCount: counts.lineage_count || 0,
        lineageRunCount: counts.lineage_run_count || 0,
        clientCount: counts.client_count || 0,
        peopleCount: counts.people_count || 0,
        retrievalCount: counts.retrieval_count || 0
      };
    },
    deleteBatchRecords(batchId) {
      deleteBatchDataRecords(batchId);
    },
    deleteBatchRow(batchId) {
      deleteBatchStmt.run(batchId);
    },
    upsertDeletionOperation({ batchId, jobId = "", status, state = {}, error = "", operationId = "" }) {
      const now = new Date().toISOString();
      const existing =
        (operationId && selectDeletionOperationByIdStmt.get(operationId)) ||
        selectDeletionOperationByBatchStmt.get(batchId);
      const nextOperationId = existing?.operation_id || operationId || randomUUID();
      insertDeletionOperationStmt.run(
        nextOperationId,
        batchId,
        jobId,
        status,
        JSON.stringify(state || {}),
        String(error || ""),
        existing?.created_at || now,
        now
      );
      return hydrateDeletionOperation(selectDeletionOperationByIdStmt.get(nextOperationId));
    },
    updateDeletionOperation(operationId, { status, state = {}, error = "" }) {
      updateDeletionOperationStmt.run(
        status,
        JSON.stringify(state || {}),
        String(error || ""),
        new Date().toISOString(),
        operationId
      );
      return hydrateDeletionOperation(selectDeletionOperationByIdStmt.get(operationId));
    },
    getDeletionOperationByBatchId(batchId) {
      return hydrateDeletionOperation(selectDeletionOperationByBatchStmt.get(batchId));
    },
    listPendingDeletionOperations() {
      return listDeletionOperationsStmt.all().map(hydrateDeletionOperation);
    },
    deleteDeletionOperation(operationId) {
      deleteDeletionOperationStmt.run(operationId);
    },
    getBatchArtifactPaths(batchId) {
      return {
        batchId,
        objectRootPath: getRawMailObjectRoot(userDataPath),
        legacyObjectBatchPath: path.join(getRawMailObjectRoot(userDataPath), "mail", batchId)
      };
    }
  };
}
