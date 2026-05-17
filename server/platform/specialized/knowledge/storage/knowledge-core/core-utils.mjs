import { createHash } from "node:crypto";

export function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entry]) => entry !== undefined && entry !== null && entry !== "")
  );
}

export function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

export function stringifyJson(value, fallback = {}) {
  return JSON.stringify(value ?? fallback);
}

export function stableJson(value) {
  try {
    return JSON.stringify(value || {}, Object.keys(value || {}).sort());
  } catch {
    return "";
  }
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export function uniqueStrings(values = [], limit = 120) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    const item = normalizeText(value);
    if (!item) {
      continue;
    }
    const key = item.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

export function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

export function truncateText(value, maxLength = 360) {
  const text = normalizeText(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

export function hashText(value, length = 32) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, length);
}
