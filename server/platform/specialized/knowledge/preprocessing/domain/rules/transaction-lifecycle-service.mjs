import { randomUUID } from "node:crypto";
import {
  buildSearchTerms,
  computeTimeWeight,
  dayDiff,
  formatFreshness,
  normalizeWhitespace
} from "./index.mjs";
import {
  asJson,
  jaccardSimilarityFromArrays,
  parseJsonArray,
  participantOverlap,
  scopedId
} from "../../../../../common/storage/metadata-helpers.mjs";

function continuityWindowDays(transaction, settings) {
  const transactionWindowDays = Math.max(1, Number(settings?.transactionWindowDays) || 45);
  const staleAfterDays = Math.max(
    transactionWindowDays * 2,
    Number(settings?.staleAfterDays) || 180
  );

  if (transaction.cadence === "weekly") {
    return Math.max(21, Math.ceil(transactionWindowDays * 1.5));
  }

  if (transaction.cadence === "monthly") {
    return Math.max(95, transactionWindowDays * 3);
  }

  if ((transaction.categories || []).includes("long-running")) {
    return Math.max(staleAfterDays, transactionWindowDays * 3);
  }

  return Math.max(transactionWindowDays * 2, 45);
}

function inferLineageLifecycleState({ lastSeenAt, cadence, categories, referenceTime, settings }) {
  const ageDays = Math.max(0, Math.floor((new Date(referenceTime) - new Date(lastSeenAt)) / 86400000));
  const staleAfterDays = Math.max(1, Number(settings?.staleAfterDays) || 180);
  if (!Number.isFinite(ageDays)) {
    return "active";
  }

  if (ageDays > staleAfterDays) {
    return "archived";
  }

  const interruptionWindow = continuityWindowDays(
    {
      cadence,
      categories
    },
    settings
  );

  if (ageDays > interruptionWindow) {
    return "interrupted";
  }

  return "active";
}

function hydrateLineageRow(row) {
  if (!row) {
    return null;
  }

  return {
    lineageId: row.lineage_id,
    title: row.title || "",
    normalizedSubject: row.normalized_subject || "",
    cadence: row.cadence || "unknown",
    categories: parseJsonArray(row.categories_json),
    keywords: parseJsonArray(row.keywords_json),
    participantIds: parseJsonArray(row.participant_ids_json),
    sourceDepartments: parseJsonArray(row.source_departments_json),
    lifecycleState: row.lifecycle_state || "active",
    firstSeenAt: row.first_seen_at || "",
    lastSeenAt: row.last_seen_at || "",
    lastBatchId: row.last_batch_id || "",
    lastTransactionId: row.last_transaction_id || "",
    lastTransactionRecordId: row.last_transaction_record_id || "",
    occurrenceCount: Number(row.occurrence_count || 0),
    batchCount: Number(row.batch_count || 0),
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || ""
  };
}

function buildLineageSubjectTokens(transaction, rules) {
  return buildSearchTerms(
    `${transaction.normalizedSubject || transaction.title || ""}\n${transaction.keywords?.join(" ") || ""}`,
    rules
  );
}

function computeLineageMatch(currentTransaction, lineage, settings, rules) {
  const gapDays = Math.abs(dayDiff(lineage.lastSeenAt, currentTransaction.startedAt || currentTransaction.latestActivityAt));
  const allowedGapDays = continuityWindowDays(currentTransaction, settings);

  if (gapDays > allowedGapDays) {
    return {
      matched: false,
      score: 0,
      reasons: [],
      gapDays
    };
  }

  const currentSubject = (currentTransaction.normalizedSubject || currentTransaction.title || "").toLowerCase();
  const lineageSubject = (lineage.normalizedSubject || lineage.title || "").toLowerCase();
  const subjectExact = currentSubject && lineageSubject && currentSubject === lineageSubject;
  const subjectSimilarity = jaccardSimilarityFromArrays(
    buildLineageSubjectTokens(currentTransaction, rules),
    buildLineageSubjectTokens(lineage, rules)
  );
  const keywordSimilarity = jaccardSimilarityFromArrays(
    currentTransaction.keywords || [],
    lineage.keywords || []
  );
  const overlap = participantOverlap(
    currentTransaction.participantIds || [],
    lineage.participantIds || []
  );
  const cadenceMatch =
    currentTransaction.cadence &&
    lineage.cadence &&
    currentTransaction.cadence !== "unknown" &&
    currentTransaction.cadence === lineage.cadence;
  const categoryOverlap = jaccardSimilarityFromArrays(
    currentTransaction.categories || [],
    lineage.categories || []
  );
  const recencyScore = Math.max(0, 1 - gapDays / Math.max(allowedGapDays, 1));

  const score = Number(
    Math.max(
      subjectExact ? 0.99 : 0,
      (
        subjectSimilarity * 0.42 +
        keywordSimilarity * 0.24 +
        overlap * 0.18 +
        categoryOverlap * 0.08 +
        recencyScore * 0.08 +
        (cadenceMatch ? 0.1 : 0)
      ).toFixed(4)
    ).toFixed(4)
  );

  const reasons = [];
  if (subjectExact) {
    reasons.push("normalized-subject-exact");
  }
  if (subjectSimilarity >= 0.2) {
    reasons.push("subject-similar");
  }
  if (keywordSimilarity >= 0.2) {
    reasons.push("keywords-overlap");
  }
  if (overlap >= 0.3) {
    reasons.push("participants-overlap");
  }
  if (cadenceMatch) {
    reasons.push("cadence-match");
  }
  if (categoryOverlap >= 0.2) {
    reasons.push("category-overlap");
  }

  const matched =
    (subjectExact && gapDays <= allowedGapDays) ||
    (cadenceMatch && subjectSimilarity >= 0.22 && gapDays <= allowedGapDays) ||
    score >= 0.56;

  return {
    matched,
    score,
    reasons,
    gapDays
  };
}

export function createTransactionLifecycleService({ db }) {
  const selectLineageByIdStmt = db.prepare(`
    SELECT * FROM transaction_lineages WHERE lineage_id = ?
  `);
  const selectLineagesByNormalizedSubjectStmt = db.prepare(`
    SELECT * FROM transaction_lineages
    WHERE lower(normalized_subject) = ?
    ORDER BY last_seen_at DESC
    LIMIT ?
  `);
  const selectRecentLineagesStmt = db.prepare(`
    SELECT * FROM transaction_lineages
    ORDER BY last_seen_at DESC
    LIMIT ?
  `);
  const selectAllLineagesStmt = db.prepare(`
    SELECT * FROM transaction_lineages
    ORDER BY last_seen_at DESC
  `);
  const updateLineageLifecycleStmt = db.prepare(`
    UPDATE transaction_lineages
    SET lifecycle_state = ?, updated_at = ?
    WHERE lineage_id = ?
  `);
  const insertLineageStmt = db.prepare(`
    INSERT INTO transaction_lineages (
      lineage_id, title, normalized_subject, cadence, categories_json, keywords_json,
      participant_ids_json, source_departments_json, lifecycle_state, first_seen_at, last_seen_at,
      last_batch_id, last_transaction_id, last_transaction_record_id, occurrence_count, batch_count,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateLineageStmt = db.prepare(`
    UPDATE transaction_lineages
    SET
      title = ?,
      normalized_subject = ?,
      cadence = ?,
      categories_json = ?,
      keywords_json = ?,
      participant_ids_json = ?,
      source_departments_json = ?,
      lifecycle_state = ?,
      first_seen_at = ?,
      last_seen_at = ?,
      last_batch_id = ?,
      last_transaction_id = ?,
      last_transaction_record_id = ?,
      occurrence_count = ?,
      batch_count = ?,
      updated_at = ?
    WHERE lineage_id = ?
  `);
  const insertLineageRunStmt = db.prepare(`
    INSERT INTO transaction_lineage_runs (
      record_id, lineage_id, batch_id, local_transaction_id, local_transaction_record_id,
      stage, previous_state, next_state, match_score, match_reasons_json, pulled_event_count,
      pulled_batch_count, pulled_transaction_count, matched_batch_id, matched_transaction_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(batch_id, local_transaction_id) DO UPDATE SET
      lineage_id = excluded.lineage_id,
      local_transaction_record_id = excluded.local_transaction_record_id,
      stage = excluded.stage,
      previous_state = excluded.previous_state,
      next_state = excluded.next_state,
      match_score = excluded.match_score,
      match_reasons_json = excluded.match_reasons_json,
      pulled_event_count = excluded.pulled_event_count,
      pulled_batch_count = excluded.pulled_batch_count,
      pulled_transaction_count = excluded.pulled_transaction_count,
      matched_batch_id = excluded.matched_batch_id,
      matched_transaction_id = excluded.matched_transaction_id,
      created_at = excluded.created_at
  `);
  const selectLineageHistoryTimelineStmt = db.prepare(`
    SELECT
      r.batch_id,
      r.local_transaction_id,
      t.timeline_event_id,
      t.timestamp,
      t.title,
      t.summary,
      t.type,
      t.source,
      t.message_id,
      t.thread_id,
      t.transaction_id,
      t.participant_ids_json
    FROM transaction_lineage_runs r
    JOIN timeline_events t
      ON t.batch_id = r.batch_id
     AND t.transaction_id = r.local_transaction_id
    WHERE r.lineage_id = ?
      AND r.batch_id <> ?
      AND COALESCE(NULLIF(t.timeline_phase, ''), 'current') = 'current'
    ORDER BY t.timestamp ASC, t.record_id ASC
  `);
  const selectLineageAggregateStmt = db.prepare(`
    SELECT
      COUNT(*) AS occurrence_count,
      COUNT(DISTINCT batch_id) AS batch_count
    FROM transaction_lineage_runs
    WHERE lineage_id = ?
  `);

  return {
    refreshTransactionLineageStates(referenceTime, settings = {}) {
      const lineages = selectAllLineagesStmt.all().map(hydrateLineageRow);
      const now = new Date().toISOString();

      db.exec("BEGIN");
      try {
        for (const lineage of lineages) {
          const nextState = inferLineageLifecycleState({
            lastSeenAt: lineage.lastSeenAt,
            cadence: lineage.cadence,
            categories: lineage.categories,
            referenceTime,
            settings
          });

          if (nextState !== lineage.lifecycleState) {
            updateLineageLifecycleStmt.run(nextState, now, lineage.lineageId);
            lineage.lifecycleState = nextState;
            lineage.updatedAt = now;
          }
        }

        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      return lineages;
    },
    resolveTransactionLifecycle({
      batchId,
      transactions = [],
      timeline = [],
      settings = {},
      rules = {},
      generatedAt = new Date().toISOString()
    }) {
      const refreshedLineages = this.refreshTransactionLineageStates(generatedAt, settings);
      const lineageById = new Map(
        refreshedLineages.map((lineage) => [lineage.lineageId, lineage])
      );
      const matchedLineageIds = new Set();
      const pulledBatchIds = new Set();
      const pulledTransactionKeys = new Set();
      const currentTransactions = [...transactions].sort((left, right) =>
        String(left.startedAt || "").localeCompare(String(right.startedAt || ""))
      );
      const nextTransactions = [];
      const pulledEvents = [];

      for (const transaction of currentTransactions) {
        const normalizedSubject = normalizeWhitespace(
          transaction.normalizedSubject || transaction.title || ""
        ).toLowerCase();
        const candidateRows = normalizedSubject
          ? [
              ...selectLineagesByNormalizedSubjectStmt.all(normalizedSubject, 48),
              ...selectRecentLineagesStmt.all(240)
            ]
          : selectRecentLineagesStmt.all(240);
        const candidates = [];
        const seenLineageIds = new Set();

        for (const row of candidateRows) {
          const lineage = hydrateLineageRow(row);
          if (!lineage || seenLineageIds.has(lineage.lineageId)) {
            continue;
          }

          seenLineageIds.add(lineage.lineageId);
          candidates.push(lineageById.get(lineage.lineageId) || lineage);
        }

        let bestMatch = null;
        for (const lineage of candidates) {
          if (!lineage || matchedLineageIds.has(lineage.lineageId)) {
            continue;
          }

          const match = computeLineageMatch(transaction, lineage, settings, rules);
          if (!match.matched) {
            continue;
          }

          if (
            !bestMatch ||
            match.score > bestMatch.match.score ||
            (match.score === bestMatch.match.score &&
              String(lineage.lastSeenAt).localeCompare(String(bestMatch.lineage.lastSeenAt)) > 0)
          ) {
            bestMatch = {
              lineage,
              match
            };
          }
        }

        if (!bestMatch) {
          const lineageId = randomUUID();
          nextTransactions.push({
            ...transaction,
            lineageId,
            lifecycle: {
              stage: "new",
              previousState: "",
              nextState: "active",
              matchScore: 0,
              matchReasons: [],
              matchedBatchId: "",
              matchedTransactionId: "",
              pulledEventCount: 0,
              pulledBatchCount: 0,
              pulledTransactionCount: 0
            }
          });
          matchedLineageIds.add(lineageId);
          continue;
        }

        matchedLineageIds.add(bestMatch.lineage.lineageId);
        const previousState = bestMatch.lineage.lifecycleState || "active";
        const stage = previousState === "active" ? "matched" : "recovered";
        const historyRows = selectLineageHistoryTimelineStmt.all(
          bestMatch.lineage.lineageId,
          batchId
        );
        const lineageBatchIds = new Set();
        const lineageTransactionKeys = new Set();
        const transactionPulledEvents = historyRows.map((row, index) => {
          lineageBatchIds.add(row.batch_id);
          lineageTransactionKeys.add(`${row.batch_id}::${row.local_transaction_id}`);
          pulledBatchIds.add(row.batch_id);
          pulledTransactionKeys.add(`${row.batch_id}::${row.local_transaction_id}`);

          return {
            id: `history::${bestMatch.lineage.lineageId}::${row.batch_id}::${row.timeline_event_id || index + 1}`,
            timestamp: row.timestamp,
            title: row.title,
            summary: row.summary,
            type: row.type,
            source: row.source,
            messageId: row.message_id || "",
            threadId: row.thread_id || "",
            transactionId: transaction.id,
            lineageId: bestMatch.lineage.lineageId,
            timelinePhase: "history",
            originBatchId: row.batch_id,
            originTransactionId: row.local_transaction_id,
            participantIds: parseJsonArray(row.participant_ids_json),
            timeWeight: computeTimeWeight(
              row.timestamp,
              generatedAt,
              settings.retrievalHalfLifeDays
            ),
            freshness: formatFreshness(
              row.timestamp,
              generatedAt,
              settings.staleAfterDays
            )
          };
        });
        pulledEvents.push(...transactionPulledEvents);

        nextTransactions.push({
          ...transaction,
          lineageId: bestMatch.lineage.lineageId,
          lifecycle: {
            stage,
            previousState,
            nextState: "active",
            matchScore: bestMatch.match.score,
            matchReasons: bestMatch.match.reasons,
            matchedBatchId: bestMatch.lineage.lastBatchId || "",
            matchedTransactionId: bestMatch.lineage.lastTransactionId || "",
            pulledEventCount: transactionPulledEvents.length,
            pulledBatchCount: lineageBatchIds.size,
            pulledTransactionCount: lineageTransactionKeys.size
          }
        });
      }

      const lineageIdByTransactionId = new Map(
        nextTransactions.map((transaction) => [transaction.id, transaction.lineageId || ""])
      );
      const currentTimeline = (timeline || []).map((event) => ({
        ...event,
        lineageId: lineageIdByTransactionId.get(event.transactionId) || "",
        timelinePhase: "current",
        originBatchId: batchId,
        originTransactionId: event.transactionId || ""
      }));
      const mergedTimeline = [...currentTimeline, ...pulledEvents].sort((left, right) => {
        const timeOrder = String(left.timestamp).localeCompare(String(right.timestamp));
        if (timeOrder !== 0) {
          return timeOrder;
        }

        return String(left.id).localeCompare(String(right.id));
      });

      const timelineEventIdsByTransactionId = new Map();
      for (const event of mergedTimeline) {
        if (!event.transactionId) {
          continue;
        }

        if (!timelineEventIdsByTransactionId.has(event.transactionId)) {
          timelineEventIdsByTransactionId.set(event.transactionId, []);
        }

        timelineEventIdsByTransactionId.get(event.transactionId).push(event.id);
      }

      const enrichedTransactions = nextTransactions.map((transaction) => ({
        ...transaction,
        timelineEventIds: timelineEventIdsByTransactionId.get(transaction.id) || []
      }));
      const finalLineageStates = new Map(
        refreshedLineages.map((lineage) => [lineage.lineageId, lineage.lifecycleState])
      );
      for (const transaction of enrichedTransactions) {
        if (transaction.lineageId) {
          finalLineageStates.set(transaction.lineageId, "active");
        }
      }

      const summary = {
        newCount: enrichedTransactions.filter((transaction) => transaction.lifecycle?.stage === "new")
          .length,
        matchedCount: enrichedTransactions.filter(
          (transaction) => transaction.lifecycle?.stage === "matched"
        ).length,
        recoveredCount: enrichedTransactions.filter(
          (transaction) => transaction.lifecycle?.stage === "recovered"
        ).length,
        pulledEventCount: pulledEvents.length,
        pulledBatchCount: pulledBatchIds.size,
        pulledTransactionCount: pulledTransactionKeys.size,
        activeLineageCount: [...finalLineageStates.values()].filter((state) => state === "active")
          .length,
        interruptedLineageCount: [...finalLineageStates.values()].filter(
          (state) => state === "interrupted"
        ).length,
        archivedLineageCount: [...finalLineageStates.values()].filter(
          (state) => state === "archived"
        ).length
      };

      return {
        transactions: enrichedTransactions,
        timeline: mergedTimeline,
        summary
      };
    },
    persistTransactionLineages({ batchId, result }) {
      const now = new Date().toISOString();
      const touchedLineageIds = new Set();

      for (const transaction of result.transactions || []) {
        if (!transaction.lineageId) {
          continue;
        }

        const transactionRecordId = scopedId(batchId, "transaction", transaction.id);
        const existingLineage = hydrateLineageRow(
          selectLineageByIdStmt.get(transaction.lineageId)
        );
        const firstSeenAt =
          existingLineage?.firstSeenAt && existingLineage.firstSeenAt.localeCompare(transaction.startedAt) <= 0
            ? existingLineage.firstSeenAt
            : transaction.startedAt;
        const baseLineageValues = [
          transaction.title,
          transaction.normalizedSubject || "",
          transaction.cadence || "unknown",
          asJson(transaction.categories),
          asJson(transaction.keywords),
          asJson(transaction.participantIds),
          asJson(transaction.sourceDepartments),
          transaction.lifecycle?.nextState || "active",
          firstSeenAt,
          transaction.latestActivityAt,
          batchId,
          transaction.id,
          transactionRecordId
        ];

        if (existingLineage) {
          updateLineageStmt.run(
            ...baseLineageValues,
            existingLineage.occurrenceCount,
            existingLineage.batchCount,
            now,
            transaction.lineageId
          );
        } else {
          insertLineageStmt.run(
            transaction.lineageId,
            ...baseLineageValues,
            0,
            0,
            now,
            now
          );
        }

        insertLineageRunStmt.run(
          scopedId(batchId, "lineage-run", transaction.id),
          transaction.lineageId,
          batchId,
          transaction.id,
          transactionRecordId,
          transaction.lifecycle?.stage || "new",
          transaction.lifecycle?.previousState || "",
          transaction.lifecycle?.nextState || "active",
          Number(transaction.lifecycle?.matchScore || 0),
          asJson(transaction.lifecycle?.matchReasons),
          Number(transaction.lifecycle?.pulledEventCount || 0),
          Number(transaction.lifecycle?.pulledBatchCount || 0),
          Number(transaction.lifecycle?.pulledTransactionCount || 0),
          transaction.lifecycle?.matchedBatchId || "",
          transaction.lifecycle?.matchedTransactionId || "",
          now
        );
        touchedLineageIds.add(transaction.lineageId);
      }

      for (const lineageId of touchedLineageIds) {
        const aggregate = selectLineageAggregateStmt.get(lineageId) || {};
        const lineage = hydrateLineageRow(selectLineageByIdStmt.get(lineageId));
        if (!lineage) {
          continue;
        }

        updateLineageStmt.run(
          lineage.title,
          lineage.normalizedSubject,
          lineage.cadence,
          asJson(lineage.categories),
          asJson(lineage.keywords),
          asJson(lineage.participantIds),
          asJson(lineage.sourceDepartments),
          lineage.lifecycleState,
          lineage.firstSeenAt,
          lineage.lastSeenAt,
          lineage.lastBatchId,
          lineage.lastTransactionId,
          lineage.lastTransactionRecordId,
          Number(aggregate.occurrence_count || 0),
          Number(aggregate.batch_count || 0),
          now,
          lineageId
        );
      }
    }
  };
}
