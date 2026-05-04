import { uniqueNormalizedStrings } from "../domain/rules/index.mjs";

export function asJson(value) {
  return JSON.stringify(value ?? []);
}

export function asBoolInt(value) {
  return value ? 1 : 0;
}

export function scopedId(batchId, entityType, localId) {
  return `${batchId}::${entityType}::${localId}`;
}

export function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function jaccardSimilarityFromArrays(leftValues, rightValues) {
  const left = new Set(uniqueNormalizedStrings(leftValues).map((value) => value.toLowerCase()));
  const right = new Set(uniqueNormalizedStrings(rightValues).map((value) => value.toLowerCase()));

  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const value of left) {
    if (right.has(value)) {
      overlap += 1;
    }
  }

  return overlap / (left.size + right.size - overlap);
}

export function participantOverlap(leftValues, rightValues) {
  const left = new Set(leftValues || []);
  const right = new Set(rightValues || []);

  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const value of left) {
    if (right.has(value)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(left.size, right.size);
}
