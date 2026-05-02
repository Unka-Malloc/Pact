import {
  buildFtsMatchQuery,
  clampLimit,
  compileRuleSet,
  countTokenOverlap,
  normalizeWhitespace,
  uniqueNormalizedStrings
} from "../domain/rules/index.mjs";

export function createSearchService({ db }) {
  return {
    search({
      query = "",
      limit = 20,
      batchId = "",
      entityTypes = [],
      formalOnly = false,
      rules = {}
    }) {
      const safeLimit = clampLimit(limit);
      const candidateLimit = clampLimit(safeLimit * 8, 80, 400);
      const compiledRules = compileRuleSet(rules);
      const { tokens, matchQuery } = buildFtsMatchQuery(query, compiledRules);
      const filters = [];
      const params = [];

      if (batchId) {
        filters.push("d.batch_id = ?");
        params.push(batchId);
      }

      const normalizedEntityTypes = uniqueNormalizedStrings(entityTypes).map((item) =>
        item.toLowerCase()
      );
      if (normalizedEntityTypes.length > 0) {
        filters.push(`d.entity_type IN (${normalizedEntityTypes.map(() => "?").join(", ")})`);
        params.push(...normalizedEntityTypes);
      }

      if (formalOnly) {
        filters.push("d.formal_use_allowed = 1");
      }

      let rows;

      if (tokens.length > 0) {
        const where = filters.length > 0 ? ` AND ${filters.join(" AND ")}` : "";
        rows = db
          .prepare(`
            SELECT
              d.*,
              bm25(retrieval_fts, 8.0, 1.0, 0.5, 0.5) AS lexical_rank
            FROM retrieval_fts
            JOIN retrieval_documents d ON d.record_id = retrieval_fts.record_id
            WHERE retrieval_fts MATCH ?${where}
            ORDER BY lexical_rank
            LIMIT ?
          `)
          .all(matchQuery, ...params, candidateLimit);
      } else if (normalizeWhitespace(query)) {
        const where = filters.length > 0 ? ` AND ${filters.join(" AND ")}` : "";
        const likeValue = `%${normalizeWhitespace(query)}%`;
        rows = db
          .prepare(`
            SELECT d.*, 0 AS lexical_rank
            FROM retrieval_documents d
            WHERE (d.title LIKE ? OR d.text LIKE ? OR d.snippet LIKE ?)${where}
            ORDER BY d.time_weight DESC, d.timestamp DESC
            LIMIT ?
          `)
          .all(likeValue, likeValue, likeValue, ...params, candidateLimit);
      } else {
        const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
        rows = db
          .prepare(`
            SELECT d.*, 0 AS lexical_rank
            FROM retrieval_documents d
            ${where}
            ORDER BY d.time_weight DESC, d.timestamp DESC
            LIMIT ?
          `)
          .all(...params, candidateLimit);
      }

      const items = rows
        .map((row) => {
          const relevanceScore = Number(
            countTokenOverlap(row.search_terms_json, tokens).toFixed(4)
          );
          const finalScore = Number(
            ((tokens.length > 0 ? relevanceScore : 1) * Number(row.time_weight || 0)).toFixed(4)
          );

          return {
            itemId: row.retrieval_id,
            batchId: row.batch_id,
            entityType: row.entity_type,
            entityId: row.entity_id,
            title: row.title,
            snippet: row.snippet,
            timestamp: row.timestamp,
            source: row.source,
            relevanceScore: tokens.length > 0 ? relevanceScore : 1,
            timeWeight: Number(row.time_weight || 0),
            finalScore,
            freshness: row.freshness,
            status: row.status,
            transactionId: row.transaction_id || undefined,
            threadId: row.thread_id || undefined,
            formalUseAllowed: Boolean(row.formal_use_allowed),
            reviewDueAt: row.review_due_at || "",
            rawObjectId: row.raw_object_id || undefined
          };
        })
        .sort((left, right) => {
          if (right.finalScore !== left.finalScore) {
            return right.finalScore - left.finalScore;
          }

          return String(right.timestamp).localeCompare(String(left.timestamp));
        })
        .slice(0, safeLimit);

      return {
        query: normalizeWhitespace(query),
        batchId: batchId || "",
        limit: safeLimit,
        formalOnly: Boolean(formalOnly),
        entityTypes: normalizedEntityTypes,
        items
      };
    }
  };
}
