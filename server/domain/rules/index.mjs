const DAY_MS = 24 * 60 * 60 * 1000;

export const BASE_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "have",
  "will",
  "are",
  "was",
  "is",
  "of",
  "to",
  "in",
  "on",
  "by",
  "or",
  "a",
  "an",
  "cc",
  "re",
  "fw",
  "fwd",
  "subject",
  "date",
  "邮件",
  "事务",
  "今天",
  "昨天",
  "已经",
  "需要",
  "目前",
  "进行",
  "相关",
  "一个",
  "这个",
  "我们",
  "你们",
  "他们",
  "发件人",
  "收件人"
]);

export const DEFAULT_MERGE_RULES = {
  highSimilarity: 0.32,
  mediumSimilarity: 0.18,
  mediumParticipantOverlap: 0.34,
  highParticipantOverlap: 0.6
};

export function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function truncateText(value, maxChars = 180) {
  const normalized = normalizeWhitespace(value);

  if (normalized.length <= maxChars) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export function normalizeTimestamp(value, fallback = "") {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString();
}

export function dayDiff(earlier, later) {
  const earlierTime = new Date(earlier).getTime();
  const laterTime = new Date(later).getTime();

  if (Number.isNaN(earlierTime) || Number.isNaN(laterTime)) {
    return 0;
  }

  return Math.max(0, Math.floor((laterTime - earlierTime) / DAY_MS));
}

export function absoluteDayGap(leftTimestamp, rightTimestamp) {
  const leftTime = new Date(leftTimestamp).getTime();
  const rightTime = new Date(rightTimestamp).getTime();

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return 0;
  }

  return Math.floor(Math.abs(leftTime - rightTime) / DAY_MS);
}

export function addDays(timestamp, days) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return new Date(parsed.getTime() + days * DAY_MS).toISOString();
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function clampLimit(value, fallback = 20, max = 200) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

export function formatFreshness(timestamp, referenceTime, staleAfterDays) {
  const ageDays = dayDiff(timestamp, referenceTime);

  if (ageDays > staleAfterDays) {
    return "historical";
  }

  if (ageDays > Math.floor(staleAfterDays / 2)) {
    return "aging";
  }

  return "current";
}

export function computeTimeWeight(timestamp, referenceTime, halfLifeDays) {
  const ageDays = dayDiff(timestamp, referenceTime);
  const safeHalfLife = Math.max(1, Number(halfLifeDays) || 1);
  const value = Math.exp((-Math.log(2) * ageDays) / safeHalfLife);
  return clamp(Number(value.toFixed(4)), 0.05, 1);
}

export function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function uniqueNormalizedStrings(values = []) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(normalized);
  }

  return output;
}

export function buildTextMatchers(patterns = []) {
  return uniqueNormalizedStrings(patterns)
    .map((pattern) => {
      try {
        return new RegExp(escapeRegExp(pattern), "i");
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function compileRuleSet(rawRules = {}) {
  const reportSeries = (rawRules.reportSeries || [])
    .map((entry, index) => ({
      id: normalizeWhitespace(entry?.id) || `report-series-${index + 1}`,
      label: normalizeWhitespace(entry?.label) || `规则 ${index + 1}`,
      cadence:
        entry?.cadence === "weekly" || entry?.cadence === "monthly"
          ? entry.cadence
          : "irregular",
      keywords: uniqueNormalizedStrings(entry?.keywords || []),
      matchers: buildTextMatchers(entry?.keywords || [])
    }))
    .filter((entry) => entry.matchers.length > 0);

  const synonymReplacements = (rawRules.synonymDictionary || [])
    .flatMap((entry) => {
      const canonical = normalizeWhitespace(entry?.canonical);
      if (!canonical) {
        return [];
      }

      return uniqueNormalizedStrings([canonical, ...(entry?.terms || [])]).map((term) => ({
        term,
        canonical,
        matcher: new RegExp(escapeRegExp(term), "gi")
      }));
    })
    .sort((left, right) => right.term.length - left.term.length);

  const departmentDictionary = (rawRules.departmentDictionary || [])
    .map((entry) => ({
      department: normalizeWhitespace(entry?.department),
      nameMatchers: buildTextMatchers(entry?.keywords),
      emailMatchers: buildTextMatchers(entry?.emailKeywords)
    }))
    .filter(
      (entry) =>
        entry.department && (entry.nameMatchers.length > 0 || entry.emailMatchers.length > 0)
    );

  const mergeRules = {
    highSimilarity:
      Number(rawRules?.transactionMergeRules?.highSimilarity) || DEFAULT_MERGE_RULES.highSimilarity,
    mediumSimilarity:
      Number(rawRules?.transactionMergeRules?.mediumSimilarity) ||
      DEFAULT_MERGE_RULES.mediumSimilarity,
    mediumParticipantOverlap:
      Number(rawRules?.transactionMergeRules?.mediumParticipantOverlap) ||
      DEFAULT_MERGE_RULES.mediumParticipantOverlap,
    highParticipantOverlap:
      Number(rawRules?.transactionMergeRules?.highParticipantOverlap) ||
      DEFAULT_MERGE_RULES.highParticipantOverlap
  };

  const stopwords = new Set([
    ...BASE_STOPWORDS,
    ...uniqueNormalizedStrings(rawRules.keywordStopwords || []).map((item) => item.toLowerCase())
  ]);

  return {
    reportSeries,
    synonymReplacements,
    departmentDictionary,
    mergeRules,
    stopwords
  };
}

export function canonicalizeForMatching(text, ruleSet) {
  let normalized = normalizeWhitespace(text).toLowerCase();

  for (const entry of ruleSet?.synonymReplacements || []) {
    normalized = normalized.replace(entry.matcher, entry.canonical.toLowerCase());
  }

  return normalized;
}

export function tokenizeText(text, ruleSet) {
  const normalized = canonicalizeForMatching(text, ruleSet);
  const counts = new Map();
  const stopwords = ruleSet?.stopwords || BASE_STOPWORDS;

  for (const word of normalized.match(/[a-z0-9][a-z0-9._-]{1,}/g) || []) {
    if (stopwords.has(word)) {
      continue;
    }

    counts.set(word, (counts.get(word) || 0) + 1);
  }

  for (const run of normalized.match(/[\u4e00-\u9fff]{2,}/g) || []) {
    for (let index = 0; index < run.length - 1; index += 1) {
      const bigram = run.slice(index, index + 2);
      if (stopwords.has(bigram)) {
        continue;
      }

      counts.set(bigram, (counts.get(bigram) || 0) + 1);
    }
  }

  return counts;
}

export function keywordList(text, limit = 8, ruleSet) {
  return [...tokenizeText(text, ruleSet).entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    })
    .slice(0, limit)
    .map(([token]) => token);
}

export function jaccardSimilarity(leftText, rightText, ruleSet) {
  const left = new Set(tokenizeText(leftText, ruleSet).keys());
  const right = new Set(tokenizeText(rightText, ruleSet).keys());

  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }

  return overlap / (left.size + right.size - overlap);
}

export function buildSearchTerms(text, ruleSet) {
  return [...tokenizeText(text, ruleSet).keys()];
}

export function buildFtsMatchQuery(query, ruleSet, maxTokens = 12) {
  const tokens = buildSearchTerms(query, ruleSet).slice(0, maxTokens);
  if (tokens.length === 0) {
    return {
      tokens: [],
      matchQuery: ""
    };
  }

  return {
    tokens,
    matchQuery: tokens.map((token) => `"${token.replace(/"/g, "\"\"")}"`).join(" OR ")
  };
}

export function countTokenOverlap(searchTerms, queryTokens) {
  if (!queryTokens.length) {
    return 1;
  }

  let parsedTerms = [];
  if (Array.isArray(searchTerms)) {
    parsedTerms = searchTerms;
  } else {
    try {
      parsedTerms = JSON.parse(searchTerms || "[]");
    } catch {
      parsedTerms = [];
    }
  }

  const termSet = new Set(Array.isArray(parsedTerms) ? parsedTerms : []);
  let overlap = 0;
  for (const token of queryTokens) {
    if (termSet.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(queryTokens.length, 1);
}
