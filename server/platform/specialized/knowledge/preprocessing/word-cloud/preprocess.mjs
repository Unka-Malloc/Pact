const WORD_CLOUD_PREPROCESS_MAX_TERMS = 120000;
const WORD_CLOUD_PREPROCESS_MIN_TERM_LENGTH = 2;
const WORD_CLOUD_PREPROCESS_MAX_TERM_LENGTH = 64;
const WORD_CLOUD_PREPROCESS_INTENT_BOOST = 0.35;
const WORD_CLOUD_PREPROCESS_LOW_QUALITY_SYMBOL_RATIO = 0.55;
const INTENT_MARKER_TOKENS = [
  "广告",
  "营销",
  "推广",
  "投放",
  "campaign",
  "market",
  "promotion",
  "ads",
  "ad"
];

const GENERIC_INTENT_SYNONYMS = {
  广告: ["ad", "ads", "推广", "营销", "宣传", "campaign", "market", "marketed"],
  营销: ["推广", "广告", "获客", "投放", "campaign", "promotion", "ads", "营销"],
  投放: ["ad", "ads", "推广", "campaign", "分发", "素材"]
};

function clampFiniteNumber(value, fallback = 0, min = 0, max = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, num));
}

function normalizeTerm(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeInputTerm(value) {
  return String(value || "").trim();
}

function uniqueStrings(values = [], limit = Number.POSITIVE_INFINITY) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const normalized = normalizeInputTerm(value).toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

function isLikelyLowQualityTerm(value = "") {
  const normalized = normalizeInputTerm(value);
  if (!normalized || normalized.length < 2) {
    return false;
  }

  const chars = Array.from(normalized);
  if (chars.length > 1 && chars.every((item) => item === chars[0])) {
    return true;
  }

  const hasAlphabetic = /[A-Za-z]/u.test(normalized);
  const hasNumeric = /\p{N}/u.test(normalized);
  const hasHan = /\p{Script=Han}/u.test(normalized);

  const symbolCount = Array.from(normalized).filter((ch) =>
    !(/[\p{L}\p{N}]/u.test(ch) || ch === "_")
  ).length;
  const symbolRatio = symbolCount / Math.max(1, chars.length);
  if (!hasAlphabetic && !hasNumeric && !hasHan && symbolRatio > 0) {
    return true;
  }

  if (symbolRatio >= WORD_CLOUD_PREPROCESS_LOW_QUALITY_SYMBOL_RATIO) {
    return true;
  }

  const shortRepeatedRuns = /(.)\1{2,}/u.test(normalized);
  if (shortRepeatedRuns && !hasHan && normalized.length <= 6) {
    return true;
  }

  const hasSingleCharacterWord = /^(.)\1+$/.test(normalized);
  if (hasSingleCharacterWord && normalized.length >= 4) {
    return true;
  }

  return false;
}

function parseIntentTerms(prompt = "") {
  const normalizedPrompt = normalizeInputTerm(prompt).toLowerCase();
  const candidates = normalizedPrompt
    .match(/[\p{L}\p{N}_-]+/gu) || [];
  const candidateSet = new Set();
  for (const token of INTENT_MARKER_TOKENS) {
    const marker = normalizeInputTerm(token).toLowerCase();
    if (marker && normalizedPrompt.includes(marker)) {
      candidateSet.add(marker);
    }
  }
  for (const token of uniqueStrings(candidates, 160)) {
    candidateSet.add(token);
  }
  const intentTerms = [];
  for (const token of candidateSet) {
    if (token.length < WORD_CLOUD_PREPROCESS_MIN_TERM_LENGTH) {
      continue;
    }
    intentTerms.push(token);
    const synonyms = GENERIC_INTENT_SYNONYMS[token] || [];
    for (const synonym of synonyms) {
      const normalized = normalizeInputTerm(synonym).toLowerCase();
      if (normalized) {
        intentTerms.push(normalized);
      }
    }
  }
  return uniqueStrings(intentTerms, 120);
}

function normalizeRawTerms(rawTerms = []) {
  const seen = new Set();
  const list = [];
  for (const raw of rawTerms) {
    const term = normalizeInputTerm(raw?.term || raw || "");
    const normalizedTerm = term.toLowerCase();
    if (
      !normalizedTerm ||
      normalizedTerm.length < WORD_CLOUD_PREPROCESS_MIN_TERM_LENGTH ||
      normalizedTerm.length > WORD_CLOUD_PREPROCESS_MAX_TERM_LENGTH
    ) {
      continue;
    }
    if (seen.has(normalizedTerm)) {
      continue;
    }
    seen.add(normalizedTerm);
    const frequency = Number(raw?.frequency || 0);
    list.push({
      term: normalizedTerm,
      frequency: Number.isFinite(frequency) ? Math.max(1, Math.floor(frequency)) : 1,
      rawFrequency: Number.isFinite(frequency) ? Math.max(0, Math.floor(frequency)) : 0
    });
  }
  return list;
}

function normalizeStats(rawStats = []) {
  const table = new Map();
  for (const entry of rawStats || []) {
    const term = normalizeTerm(entry?.term);
    if (!term) {
      continue;
    }
    table.set(term, {
      term,
      frequency: Number(entry.frequency || 0) || 0,
      documentFrequency: Number(entry.documentFrequency || 0) || 0,
      bm25Weight: Number(entry.bm25Weight || 0) || 0
    });
  }
  return table;
}

function clampLog(value, maxValue) {
  if (!maxValue || maxValue <= 0 || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.log1p(Math.max(0, value)) / Math.log1p(maxValue);
}

function scoreIntentMatch(term = "", intentSeeds = []) {
  const normalized = normalizeTerm(term);
  if (!normalized || intentSeeds.length === 0) {
    return 0;
  }
  let matched = 0;
  let maxMatchScore = 0;
  for (const seed of intentSeeds) {
    const normalizedSeed = normalizeTerm(seed);
    if (!normalizedSeed) {
      continue;
    }
    if (normalized === normalizedSeed) {
      matched += 1;
      maxMatchScore = Math.max(maxMatchScore, 1.2);
      continue;
    }
    if (normalized.includes(normalizedSeed) || normalizedSeed.includes(normalized)) {
      matched += 1;
      maxMatchScore = Math.max(maxMatchScore, 0.9);
      continue;
    }
  }
  return Number((maxMatchScore * (Math.min(1, matched / Math.max(1, intentSeeds.length)))).toFixed(3));
}

function buildTermEntry(rawTerm, statsLookup = new Map(), intentTerms = []) {
  const frequency = Math.max(1, Number(rawTerm.frequency || 0));
  const stats = statsLookup.get(rawTerm.term) || {
    frequency: 0,
    documentFrequency: 0,
    bm25Weight: 0
  };
  return {
    term: rawTerm.term,
    isLowQuality: isLikelyLowQualityTerm(rawTerm.term),
    frequency,
    documentFrequency: Number(stats.documentFrequency || 0),
    bm25Weight: Number(stats.bm25Weight || 0),
    sourceFrequency: Math.max(frequency, Number(stats.frequency || 0)),
    intentScore: scoreIntentMatch(rawTerm.term, intentTerms),
    sourceSnapshot: {
      sourceFrequency: Number(stats.frequency || 0),
      firstSeenAt: "",
      lastSeenAt: ""
    }
  };
}

function toWeight(score) {
  return clampFiniteNumber(Number(score || 0), 0, 0, 1000000) > 0
    ? Number(score.toFixed(6))
    : 0;
}

function rankTerm(entry = {}, maxValues = {}) {
  const freqNorm = clampLog(entry.frequency || 0, maxValues.maxFrequency);
  const docNorm = clampLog(entry.documentFrequency || 0, maxValues.maxDocumentFrequency);
  const bm25Norm = clampLog(entry.bm25Weight || 0, maxValues.maxBm25Weight);
  const intentBoost = (entry.intentScore || 0) * WORD_CLOUD_PREPROCESS_INTENT_BOOST;
  const finalScore = 0.55 * freqNorm + 0.2 * docNorm + 0.2 * bm25Norm + intentBoost;
  return {
    ...entry,
    frequencyScore: Number(freqNorm.toFixed(6)),
    documentFrequencyScore: Number(docNorm.toFixed(6)),
    bm25Score: Number(bm25Norm.toFixed(6)),
    relevanceScore: Number(clampFiniteNumber(finalScore, 0, 0, 1).toFixed(8))
  };
}

function splitByModelIntent(terms = [], modelTermCount = 6000, intentTerms = []) {
  const intentSet = new Set(intentTerms);
  const intentTopK = [];
  const remain = [];
  const lowQuality = [];
  for (const term of terms) {
    if (term.isLowQuality) {
      lowQuality.push(term);
      continue;
    }
    if (intentSet.has(term.term) || term.intentScore > 0.4) {
      intentTopK.push(term);
    } else {
      remain.push(term);
    }
  }
  const merged = [...intentTopK, ...remain].filter((entry, index, arr) =>
    arr.findIndex((other) => other.term === entry.term) === index
  );
  const keep = merged.slice(0, modelTermCount);
  const summary = {
    intentPromoted: Math.min(intentTopK.length, keep.length),
    totalConsidered: merged.length
  };
  const targetTerms = Array.from(new Map([...intentTopK, ...remain].map((item) => [item.term, item])).values())
    .filter((item) => item.intentScore > 0.2 || intentSet.has(item.term))
    .slice(0, modelTermCount);
  return {
    agentTerms: keep,
    targetTerms,
    lowQualityTerms: lowQuality,
    summary
  };
}

export function preprocessWordCloudVocabulary({
  prompt = "",
  rawTerms = [],
  termStats = [],
  limit = 300,
  modelTermLimit = 1800,
  minFrequency = 1
}) {
  const minFreq = clampFiniteNumber(
    Number.isFinite(Number(minFrequency)) ? Number(minFrequency) : 1,
    1,
    1,
    1000000000
  );
  const intentTerms = parseIntentTerms(prompt);
  const normalizedTerms = normalizeRawTerms(rawTerms).filter((entry) => entry.frequency >= minFreq);
  const statsLookup = normalizeStats(termStats);
  const maxValues = {
    maxFrequency: 0,
    maxDocumentFrequency: 0,
    maxBm25Weight: 0
  };
  const rankedByTerm = normalizedTerms.map((entry) => {
    const merged = buildTermEntry(entry, statsLookup, intentTerms);
    if (merged.sourceFrequency > maxValues.maxFrequency) {
      maxValues.maxFrequency = merged.sourceFrequency;
    }
    if (merged.documentFrequency > maxValues.maxDocumentFrequency) {
      maxValues.maxDocumentFrequency = merged.documentFrequency;
    }
    if (merged.bm25Weight > maxValues.maxBm25Weight) {
      maxValues.maxBm25Weight = merged.bm25Weight;
    }
    return merged;
  });
  const ranked = rankedByTerm
    .map((entry) => rankTerm(entry, maxValues))
    .sort((left, right) => {
      if (right.relevanceScore !== left.relevanceScore) {
        return right.relevanceScore - left.relevanceScore;
      }
      if (right.frequency !== left.frequency) {
        return right.frequency - left.frequency;
      }
      return left.term.localeCompare(right.term);
    })
    .slice(0, Math.max(1, clampFiniteNumber(limit || WORD_CLOUD_PREPROCESS_MAX_TERMS, 1, 1, WORD_CLOUD_PREPROCESS_MAX_TERMS)));
  const topN = splitByModelIntent(ranked, clampFiniteNumber(modelTermLimit, 50, 20, WORD_CLOUD_PREPROCESS_MAX_TERMS), intentTerms);
  const lowQualitySet = new Set(topN.lowQualityTerms.map((item) => item.term));
  const targetTerms = topN.targetTerms.map((item) => ({
    term: item.term,
    frequency: item.frequency,
    weight: toWeight(item.relevanceScore),
    intentScore: item.intentScore
  }));
  const otherTerms = ranked
    .filter((item) => lowQualitySet.has(item.term))
    .map((item) => ({
      term: item.term,
      frequency: item.frequency,
      weight: toWeight(item.relevanceScore),
      intentScore: item.intentScore
    }));
  const allTerms = ranked.map((item) => ({
    term: item.term,
    frequency: item.frequency,
    documentFrequency: item.documentFrequency,
    bm25Weight: Number(item.bm25Weight.toFixed(8)),
    relevanceScore: item.relevanceScore,
    intentScore: item.intentScore,
    sourceFrequency: item.sourceFrequency,
    quality: item.isLowQuality ? "low" : "normal"
  }));
  return {
    ok: true,
    promptLength: normalizeInputTerm(prompt).length,
    intentTerms,
    allTerms,
    agentTerms: topN.agentTerms.map((item) => ({
      term: item.term,
      frequency: item.frequency,
      weight: toWeight(item.relevanceScore),
      intentScore: item.intentScore
    })),
    targetTerms,
    lowQualityTerms: otherTerms,
    summary: {
      sourceCount: normalizedTerms.length,
      limitApplied: Math.max(1, clampFiniteNumber(limit || WORD_CLOUD_PREPROCESS_MAX_TERMS, 1, 1, WORD_CLOUD_PREPROCESS_MAX_TERMS)),
      allCount: ranked.length,
      modelCount: topN.agentTerms.length,
      targetCount: targetTerms.length,
      lowQualityCount: otherTerms.length,
      intentSignal: intentTerms.length,
      intentPromoted: topN.summary.intentPromoted,
      totalConsidered: topN.summary.totalConsidered
    }
  };
}
