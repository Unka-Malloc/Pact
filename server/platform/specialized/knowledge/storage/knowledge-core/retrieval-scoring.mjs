import {
  queryTermsForIntentSearch,
  resolveQueryIntentProfile as resolveTaxonomyQueryIntentProfile
} from "../../preprocessing/domain/knowledge-taxonomy/default-taxonomy.mjs";
import {
  clampNumber,
  normalizeText,
  parseJson
} from "./core-utils.mjs";

function rawLexicalTokens(value) {
  return String(value || "").match(/[\p{L}\p{N}_-]+/gu) || [];
}

function splitIdentifierToken(value) {
  const token = String(value || "").trim();
  if (!token) {
    return [];
  }
  return token
    .replace(/[-_]+/g, " ")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.length <= 64);
}

export function tokenize(value) {
  const terms = new Set();
  for (const rawToken of rawLexicalTokens(value)) {
    const lowerToken = rawToken.toLowerCase();
    if (lowerToken.length > 0 && lowerToken.length <= 64) {
      terms.add(lowerToken);
    }
    for (const part of splitIdentifierToken(rawToken)) {
      const lowerPart = part.toLowerCase();
      if (lowerPart.length > 0 && lowerPart.length <= 64) {
        terms.add(lowerPart);
      }
    }
  }
  return [...terms];
}

export function queryTerms(value) {
  const terms = new Set(tokenize(value));
  for (const token of [...terms]) {
    for (const part of token.split(/[-_]+/)) {
      if (part && part.length <= 64) {
        terms.add(part);
      }
    }
    if (!/[\p{Script=Han}]/u.test(token) || token.length <= 2) {
      continue;
    }
    for (const size of [2, 3, 4]) {
      if (token.length < size) {
        continue;
      }
      for (let index = 0; index <= token.length - size; index += 1) {
        terms.add(token.slice(index, index + size));
      }
    }
  }
  return [...terms].filter((term) => term.length > 0 && term.length <= 64).slice(0, 32);
}

export function resolveQueryIntentProfile(query, taxonomy = null) {
  return resolveTaxonomyQueryIntentProfile(query, taxonomy);
}

export function queryTermsForSearch(query, intentProfile = null) {
  return queryTermsForIntentSearch(queryTerms(query), intentProfile, 80);
}

export function tokenOverlapScore(text, queryTokens) {
  if (!queryTokens.length) {
    return 1;
  }
  const textTokens = new Set(queryTerms(text));
  const hits = queryTokens.filter((token) => textTokens.has(token)).length;
  return hits / queryTokens.length;
}

export function termPresenceScore(text, terms) {
  if (!terms.length) {
    return 1;
  }
  const normalized = String(text || "").toLowerCase();
  const textTokens = new Set(tokenize(text));
  const hits = terms.filter((term) => normalized.includes(String(term).toLowerCase()) || textTokens.has(term)).length;
  return hits / terms.length;
}

export function queryMatchQualityScore(query = "", text = "", queryTokens = queryTerms(query)) {
  const terms = [...new Set((Array.isArray(queryTokens) ? queryTokens : queryTerms(query))
    .map((term) => String(term || "").toLowerCase())
    .filter((term) => term.length > 0))];
  if (!terms.length) {
    return {
      score: 1,
      coverage: 1,
      orderedCoverage: 1,
      proximity: 1,
      exactPhrase: false
    };
  }
  const normalizedText = normalizeText(text).toLowerCase();
  if (!normalizedText) {
    return {
      score: 0,
      coverage: 0,
      orderedCoverage: 0,
      proximity: 0,
      exactPhrase: false
    };
  }
  const positions = terms.map((term) => normalizedText.indexOf(term));
  const presentPositions = positions.filter((position) => position >= 0);
  const coverage = presentPositions.length / terms.length;
  let orderedHits = 0;
  let previous = -1;
  for (const position of positions) {
    if (position >= 0 && position >= previous) {
      orderedHits += 1;
      previous = position;
    }
  }
  const orderedCoverage = orderedHits / terms.length;
  const minPosition = presentPositions.length ? Math.min(...presentPositions) : -1;
  const maxPosition = presentPositions.length ? Math.max(...presentPositions) : -1;
  const span = minPosition >= 0 && maxPosition >= minPosition ? maxPosition - minPosition + 1 : 0;
  const queryFootprint = terms.reduce((sum, term) => sum + term.length, 0);
  const proximity = presentPositions.length === terms.length && span > 0
    ? clampNumber(queryFootprint / span, 0, 1, 0)
    : 0;
  const exactPhrase = Boolean(
    normalizeText(query) &&
    normalizedText.includes(normalizeText(query).toLowerCase())
  );
  const score = clampNumber(
    coverage * 0.52 +
      orderedCoverage * 0.18 +
      proximity * 0.14 +
      (exactPhrase ? 0.16 : 0),
    0,
    1,
    0
  );
  return {
    score: Number(score.toFixed(6)),
    coverage: Number(coverage.toFixed(6)),
    orderedCoverage: Number(orderedCoverage.toFixed(6)),
    proximity: Number(proximity.toFixed(6)),
    exactPhrase
  };
}

export function parseTimestampMs(value) {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function firstTimestamp(...values) {
  for (const value of values) {
    const timestamp = parseTimestampMs(value);
    if (timestamp > 0) {
      return {
        value: String(value),
        timestamp
      };
    }
  }
  return {
    value: "",
    timestamp: 0
  };
}

export function candidateTemporalSource(row = {}) {
  const metadata = parseJson(row.metadata_json, {});
  const sourceLocator = parseJson(row.source_locator_json, {});
  const documentMetadata = parseJson(row.document_metadata_json, {});
  return firstTimestamp(
    sourceLocator.latestActivityAt,
    sourceLocator.sentAt,
    sourceLocator.timestamp,
    sourceLocator.updatedAt,
    sourceLocator.createdAt,
    metadata.latestActivityAt,
    metadata.sentAt,
    metadata.timestamp,
    metadata.updatedAt,
    metadata.createdAt,
    metadata.collectedAt,
    documentMetadata.latestActivityAt,
    documentMetadata.sentAt,
    documentMetadata.timestamp,
    documentMetadata.updatedAt,
    documentMetadata.createdAt,
    row.updated_at,
    row.created_at,
    row.document_updated_at,
    row.document_created_at
  );
}

export function exponentialRecencyScore(timestampMs, referenceMs, retrievalSettings = {}) {
  if (!timestampMs || !referenceMs) {
    return 1;
  }
  const halfLifeDays = clampNumber(retrievalSettings.recencyHalfLifeDays, 1, 3650, 45);
  const floor = clampNumber(retrievalSettings.recencyFloor, 0, 1, 0.05);
  const ageDays = Math.max(0, (referenceMs - timestampMs) / 86_400_000);
  const raw = Math.exp((-Math.log(2) * ageDays) / halfLifeDays);
  return clampNumber(Number(raw.toFixed(6)), floor, 1, 1);
}

export function tokenOverlapRatio(query = "", text = "") {
  const queryTokens = tokenize(query).filter((token) => token.length >= 2);
  if (queryTokens.length === 0) {
    return 0;
  }
  const haystack = normalizeText(text).toLowerCase();
  if (!haystack) {
    return 0;
  }
  const hitCount = queryTokens.filter((token) => haystack.includes(token)).length;
  return clampNumber(hitCount / queryTokens.length, 0, 1, 0);
}

export function firstNonEmptyText(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) {
      return text;
    }
  }
  return "";
}
