import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "../../../../common/storage/sqlite-migrations.mjs";
import {
  TOOL_MANAGEMENT_SCOPES,
  scopesToToolsets,
  toolsetsToScopes
} from "./catalog.mjs";

const TOKEN_PREFIX = "sat_";
const DEFAULT_RATE_LIMIT_PER_MINUTE = 0;

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString("hex")}`;
}

function createToken() {
  return `${TOKEN_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readBearerToken(request) {
  const authorization = String(request?.headers?.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (match) {
    return match[1].trim();
  }
  return String(request?.headers?.["x-pact-tool-token"] || "").trim();
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  }
  if (typeof value === "string") {
    return normalizeStringList(value.split(","));
  }
  return [];
}

function normalizeScopes(scopes) {
  const valid = new Set(TOOL_MANAGEMENT_SCOPES.map((scope) => scope.id));
  return normalizeStringList(scopes).filter((scope) => valid.has(scope));
}

function normalizeRateLimit(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { perMinute: DEFAULT_RATE_LIMIT_PER_MINUTE };
  }
  return {
    perMinute: Math.max(0, Number(value.perMinute || value.per_minute || 0) || 0)
  };
}

function normalizeGrantInput(input = {}, fallback = {}) {
  const explicitScopes = normalizeScopes(input.scopes ?? fallback.scopes);
  const toolsets = normalizeStringList(input.toolsets ?? fallback.toolsets);
  const scopes = explicitScopes.length ? explicitScopes : normalizeScopes(toolsetsToScopes(toolsets));
  const normalizedToolsets = toolsets.length ? toolsets : scopesToToolsets(scopes);
  const createdAt = fallback.createdAt || nowIso();
  return {
    id: String(input.id || fallback.id || randomId("grant")),
    label: String(input.label ?? fallback.label ?? "Agent Tool Grant").trim() || "Agent Tool Grant",
    type: String(input.type ?? fallback.type ?? "machine").trim() || "machine",
    enabled: input.enabled !== undefined ? input.enabled !== false : fallback.enabled !== false,
    toolsets: normalizedToolsets,
    toolAllow: normalizeStringList(input.toolAllow ?? fallback.toolAllow),
    toolDeny: normalizeStringList(input.toolDeny ?? fallback.toolDeny),
    scopes,
    expiresAt: String(input.expiresAt ?? fallback.expiresAt ?? ""),
    maxUses: Math.max(0, Number(input.maxUses ?? fallback.maxUses ?? 0) || 0),
    rateLimit: normalizeRateLimit(input.rateLimit ?? fallback.rateLimit),
    allowedOrigins: normalizeStringList(input.allowedOrigins ?? fallback.allowedOrigins),
    allowedCidrs: normalizeStringList(input.allowedCidrs ?? fallback.allowedCidrs),
    metadata: input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? input.metadata
      : fallback.metadata || {},
    reason: String(input.reason ?? fallback.reason ?? ""),
    tokenHash: String(input.tokenHash ?? fallback.tokenHash ?? ""),
    tokenPrefix: String(input.tokenPrefix ?? fallback.tokenPrefix ?? ""),
    tokenFamilyId: String(input.tokenFamilyId ?? fallback.tokenFamilyId ?? randomId("token_family")),
    useCount: Math.max(0, Number(input.useCount ?? fallback.useCount ?? 0) || 0),
    createdAt,
    updatedAt: String(input.updatedAt ?? fallback.updatedAt ?? createdAt),
    revokedAt: String(input.revokedAt ?? fallback.revokedAt ?? ""),
    lastUsedAt: String(input.lastUsedAt ?? fallback.lastUsedAt ?? "")
  };
}

function ensureSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS tool_grants (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      toolsets_json TEXT NOT NULL DEFAULT '[]',
      tool_allow_json TEXT NOT NULL DEFAULT '[]',
      tool_deny_json TEXT NOT NULL DEFAULT '[]',
      scopes_json TEXT NOT NULL DEFAULT '[]',
      expires_at TEXT NOT NULL DEFAULT '',
      max_uses INTEGER NOT NULL DEFAULT 0,
      rate_limit_json TEXT NOT NULL DEFAULT '{}',
      allowed_origins_json TEXT NOT NULL DEFAULT '[]',
      allowed_cidrs_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      reason TEXT NOT NULL DEFAULT '',
      token_hash TEXT NOT NULL DEFAULT '',
      token_prefix TEXT NOT NULL DEFAULT '',
      token_family_id TEXT NOT NULL DEFAULT '',
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      revoked_at TEXT NOT NULL DEFAULT '',
      last_used_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS tool_grant_events (
      event_id TEXT PRIMARY KEY,
      grant_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tool_policy_decisions (
      decision_id TEXT PRIMARY KEY,
      tool_execution_id TEXT NOT NULL DEFAULT '',
      trace_id TEXT NOT NULL DEFAULT '',
      tool_id TEXT NOT NULL,
      grant_id TEXT NOT NULL DEFAULT '',
      effect TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      missing_scopes_json TEXT NOT NULL DEFAULT '[]',
      missing_toolsets_json TEXT NOT NULL DEFAULT '[]',
      evaluated_layers_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tool_executions (
      tool_execution_id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      tool_version TEXT NOT NULL DEFAULT '',
      toolset_ids_json TEXT NOT NULL DEFAULT '[]',
      subject_type TEXT NOT NULL DEFAULT '',
      subject_id TEXT NOT NULL DEFAULT '',
      grant_id TEXT NOT NULL DEFAULT '',
      agent_id TEXT NOT NULL DEFAULT '',
      profile_id TEXT NOT NULL DEFAULT '',
      operation_id TEXT NOT NULL DEFAULT '',
      risk TEXT NOT NULL DEFAULT '',
      decision TEXT NOT NULL DEFAULT '',
      input_hash TEXT NOT NULL DEFAULT '',
      redacted_input_json TEXT NOT NULL DEFAULT '{}',
      result_summary_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT '',
      error_code TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      policy_decision_id TEXT NOT NULL DEFAULT '',
      approval_id TEXT NOT NULL DEFAULT '',
      source_ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tool_metric_events (
      metric_id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL DEFAULT '',
      tool_id TEXT NOT NULL,
      grant_id TEXT NOT NULL DEFAULT '',
      profile_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      risk TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      result_bytes INTEGER NOT NULL DEFAULT 0,
      reason_code TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tool_catalog_snapshots (
      fingerprint TEXT PRIMARY KEY,
      catalog_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tool_grants_enabled ON tool_grants(enabled);
    CREATE INDEX IF NOT EXISTS idx_tool_executions_created ON tool_executions(started_at);
    CREATE INDEX IF NOT EXISTS idx_tool_executions_tool ON tool_executions(tool_id);
    CREATE INDEX IF NOT EXISTS idx_tool_executions_status ON tool_executions(status);
    CREATE INDEX IF NOT EXISTS idx_tool_metric_events_created ON tool_metric_events(created_at);
  `);

  // Version-controlled migrations — add new steps here as the schema evolves.
  runMigrations(db, [
    // version 1: baseline — all tables above were created by the initial db.exec.
    // Reserve this slot so existing databases get user_version = 1 applied.
    { version: 1, up: () => {} }
  ]);
}

function rowToGrant(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    label: row.label,
    type: row.type,
    enabled: Boolean(row.enabled),
    toolsets: parseJson(row.toolsets_json, []),
    toolAllow: parseJson(row.tool_allow_json, []),
    toolDeny: parseJson(row.tool_deny_json, []),
    scopes: parseJson(row.scopes_json, []),
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    rateLimit: parseJson(row.rate_limit_json, {}),
    allowedOrigins: parseJson(row.allowed_origins_json, []),
    allowedCidrs: parseJson(row.allowed_cidrs_json, []),
    metadata: parseJson(row.metadata_json, {}),
    reason: row.reason,
    tokenHash: row.token_hash,
    tokenPrefix: row.token_prefix,
    tokenFamilyId: row.token_family_id,
    useCount: row.use_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at
  };
}

function publicGrant(grant) {
  if (!grant) {
    return null;
  }
  const { tokenHash, ...rest } = grant;
  return {
    ...rest,
    hasToken: Boolean(tokenHash)
  };
}

function sourceIpFromRequest(request) {
  return String(
    request?.headers?.["x-forwarded-for"] ||
      request?.socket?.remoteAddress ||
      request?.connection?.remoteAddress ||
      ""
  ).split(",")[0].trim();
}

function normalizeIp(value) {
  const text = String(value || "").trim();
  return text.startsWith("::ffff:") ? text.slice("::ffff:".length) : text;
}

function ipv4ToInt(value) {
  const parts = normalizeIp(value).split(".");
  if (parts.length !== 4) {
    return null;
  }
  let output = 0;
  for (const part of parts) {
    const number = Number(part);
    if (!Number.isInteger(number) || number < 0 || number > 255) {
      return null;
    }
    output = (output << 8) + number;
  }
  return output >>> 0;
}

function ipMatchesRule(ip, rule) {
  const normalizedRule = String(rule || "").trim();
  const normalizedIp = normalizeIp(ip);
  if (!normalizedRule) {
    return false;
  }
  if (!normalizedRule.includes("/")) {
    return normalizedIp === normalizeIp(normalizedRule);
  }
  const [base, bitsText] = normalizedRule.split("/");
  const bits = Number(bitsText);
  const ipInt = ipv4ToInt(normalizedIp);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function requestOrigin(request) {
  const origin = String(request?.headers?.origin || "").trim();
  if (origin) {
    return origin.replace(/\/+$/, "");
  }
  const referer = String(request?.headers?.referer || "").trim();
  if (referer) {
    try {
      const url = new URL(referer);
      return url.origin;
    } catch {
      return "";
    }
  }
  return "";
}

function hashValue(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function summarizeValue(value) {
  if (value === null || value === undefined) {
    return {};
  }
  if (Buffer.isBuffer(value)) {
    return { type: "buffer", byteLength: value.length, sha256: crypto.createHash("sha256").update(value).digest("hex") };
  }
  if (typeof value !== "object") {
    return { value };
  }
  if (Array.isArray(value)) {
    return { type: "array", length: value.length };
  }
  const summary = {};
  for (const [key, nested] of Object.entries(value).slice(0, 40)) {
    if (/token|secret|password|authorization|cookie|api[-_]?key/i.test(key)) {
      summary[key] = "<redacted>";
    } else if (Array.isArray(nested)) {
      summary[key] = { type: "array", length: nested.length };
    } else if (nested && typeof nested === "object") {
      summary[key] = { type: "object", keys: Object.keys(nested).slice(0, 20) };
    } else {
      summary[key] = nested;
    }
  }
  return summary;
}

export function getToolManagementDatabasePath(userDataPath) {
  return path.join(userDataPath, "tool-management", "tool-management.sqlite");
}

export function createToolManagementStore({ userDataPath }) {
  const rootPath = path.join(userDataPath, "tool-management");
  fs.mkdirSync(rootPath, { recursive: true });
  const db = new Database(getToolManagementDatabasePath(userDataPath));
  ensureSchema(db);

  const upsertGrantStmt = db.prepare(`
    INSERT INTO tool_grants (
      id, label, type, enabled, toolsets_json, tool_allow_json, tool_deny_json, scopes_json,
      expires_at, max_uses, rate_limit_json, allowed_origins_json, allowed_cidrs_json,
      metadata_json, reason, token_hash, token_prefix, token_family_id, use_count,
      created_at, updated_at, revoked_at, last_used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      type = excluded.type,
      enabled = excluded.enabled,
      toolsets_json = excluded.toolsets_json,
      tool_allow_json = excluded.tool_allow_json,
      tool_deny_json = excluded.tool_deny_json,
      scopes_json = excluded.scopes_json,
      expires_at = excluded.expires_at,
      max_uses = excluded.max_uses,
      rate_limit_json = excluded.rate_limit_json,
      allowed_origins_json = excluded.allowed_origins_json,
      allowed_cidrs_json = excluded.allowed_cidrs_json,
      metadata_json = excluded.metadata_json,
      reason = excluded.reason,
      token_hash = excluded.token_hash,
      token_prefix = excluded.token_prefix,
      token_family_id = excluded.token_family_id,
      use_count = excluded.use_count,
      updated_at = excluded.updated_at,
      revoked_at = excluded.revoked_at,
      last_used_at = excluded.last_used_at
  `);

  function upsertGrant(grant) {
    upsertGrantStmt.run(
      grant.id,
      grant.label,
      grant.type,
      grant.enabled ? 1 : 0,
      stringifyJson(grant.toolsets),
      stringifyJson(grant.toolAllow),
      stringifyJson(grant.toolDeny),
      stringifyJson(grant.scopes),
      grant.expiresAt,
      grant.maxUses,
      stringifyJson(grant.rateLimit),
      stringifyJson(grant.allowedOrigins),
      stringifyJson(grant.allowedCidrs),
      stringifyJson(grant.metadata),
      grant.reason,
      grant.tokenHash,
      grant.tokenPrefix,
      grant.tokenFamilyId,
      grant.useCount,
      grant.createdAt,
      grant.updatedAt,
      grant.revokedAt,
      grant.lastUsedAt
    );
    return grant;
  }

  function appendGrantEvent(grantId, eventType, details = {}) {
    db.prepare(`
      INSERT INTO tool_grant_events (event_id, grant_id, event_type, details_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomId("grant_event"), String(grantId || ""), String(eventType || ""), stringifyJson(details), nowIso());
  }

  function getGrant(grantId) {
    return rowToGrant(db.prepare("SELECT * FROM tool_grants WHERE id = ?").get(String(grantId || "")));
  }

  function listGrants({ includeRevoked = false } = {}) {
    const rows = includeRevoked
      ? db.prepare("SELECT * FROM tool_grants ORDER BY created_at DESC").all()
      : db.prepare("SELECT * FROM tool_grants WHERE revoked_at = '' ORDER BY created_at DESC").all();
    return rows.map(rowToGrant).map(publicGrant);
  }

  function createGrant(input = {}) {
    const token = createToken();
    const grant = normalizeGrantInput({
      ...input,
      tokenHash: hashToken(token),
      tokenPrefix: `${token.slice(0, 10)}...`,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    upsertGrant(grant);
    appendGrantEvent(grant.id, "created", { scopes: grant.scopes, toolsets: grant.toolsets });
    return {
      grant: publicGrant(grant),
      token
    };
  }

  function updateGrant(grantId, patch = {}) {
    const existing = getGrant(grantId);
    if (!existing) {
      return null;
    }
    const updated = normalizeGrantInput(
      {
        ...patch,
        id: existing.id,
        tokenHash: existing.tokenHash,
        tokenPrefix: existing.tokenPrefix,
        tokenFamilyId: existing.tokenFamilyId,
        createdAt: existing.createdAt,
        updatedAt: nowIso(),
        useCount: existing.useCount,
        lastUsedAt: existing.lastUsedAt,
        revokedAt: existing.revokedAt
      },
      existing
    );
    upsertGrant(updated);
    appendGrantEvent(updated.id, "updated", { patch: summarizeValue(patch) });
    return publicGrant(updated);
  }

  function deleteGrant(grantId) {
    const existing = getGrant(grantId);
    if (!existing) {
      return false;
    }
    db.prepare("DELETE FROM tool_grants WHERE id = ?").run(existing.id);
    appendGrantEvent(existing.id, "deleted", {});
    return true;
  }

  function revokeGrant(grantId, reason = "") {
    const existing = getGrant(grantId);
    if (!existing) {
      return null;
    }
    const updated = {
      ...existing,
      enabled: false,
      revokedAt: nowIso(),
      updatedAt: nowIso(),
      reason: reason || existing.reason
    };
    upsertGrant(updated);
    appendGrantEvent(updated.id, "revoked", { reason: updated.reason });
    return publicGrant(updated);
  }

  function rotateGrantToken(grantId) {
    const existing = getGrant(grantId);
    if (!existing) {
      return null;
    }
    const token = createToken();
    const updated = {
      ...existing,
      enabled: true,
      tokenHash: hashToken(token),
      tokenPrefix: `${token.slice(0, 10)}...`,
      tokenFamilyId: randomId("token_family"),
      updatedAt: nowIso(),
      revokedAt: ""
    };
    upsertGrant(updated);
    appendGrantEvent(updated.id, "rotated", { tokenPrefix: updated.tokenPrefix });
    return {
      grant: publicGrant(updated),
      token
    };
  }

  function authorizeRequest({ request, requiredScopes = [], tool = null } = {}) {
    const token = readBearerToken(request);
    if (!token) {
      return {
        ok: false,
        status: 401,
        error: "缺少工具访问令牌。",
        reasonCode: "missing_token"
      };
    }
    const tokenHash = hashToken(token);
    const rows = db.prepare("SELECT * FROM tool_grants WHERE enabled = 1 AND revoked_at = ''").all();
    const grant = rows.map(rowToGrant).find((item) => safeCompare(item.tokenHash, tokenHash));
    if (!grant) {
      return {
        ok: false,
        status: 401,
        error: "工具访问令牌无效或已停用。",
        reasonCode: "invalid_token"
      };
    }
    if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now()) {
      return {
        ok: false,
        status: 403,
        error: "工具授权已过期。",
        reasonCode: "grant_expired",
        grant: publicGrant(grant)
      };
    }
    if (grant.maxUses > 0 && grant.useCount >= grant.maxUses) {
      return {
        ok: false,
        status: 403,
        error: "工具授权已超过最大使用次数。",
        reasonCode: "grant_max_uses",
        grant: publicGrant(grant)
      };
    }
    const origin = requestOrigin(request);
    if (grant.allowedOrigins.length > 0 && (!origin || !grant.allowedOrigins.map((item) => item.replace(/\/+$/, "")).includes(origin))) {
      return {
        ok: false,
        status: 403,
        error: "工具授权不允许当前请求来源。",
        reasonCode: "origin_not_allowed",
        grant: publicGrant(grant)
      };
    }
    const sourceIp = sourceIpFromRequest(request);
    if (grant.allowedCidrs.length > 0 && !grant.allowedCidrs.some((rule) => ipMatchesRule(sourceIp, rule))) {
      return {
        ok: false,
        status: 403,
        error: "工具授权不允许当前来源地址。",
        reasonCode: "cidr_not_allowed",
        grant: publicGrant(grant)
      };
    }
    const perMinute = Math.max(0, Number(grant.rateLimit?.perMinute || 0));
    if (perMinute > 0) {
      const since = new Date(Date.now() - 60_000).toISOString();
      const count = db.prepare(`
        SELECT count(*) AS count FROM tool_metric_events
        WHERE grant_id = ? AND created_at >= ?
      `).get(grant.id, since).count;
      if (count >= perMinute) {
        return {
          ok: false,
          status: 429,
          error: "工具授权已超过限流阈值。",
          reasonCode: "rate_limited",
          grant: publicGrant(grant)
        };
      }
    }
    const scopes = normalizeScopes(requiredScopes.length ? requiredScopes : tool?.requiredScopes || []);
    const missingScopes = scopes.filter((scope) => !grant.scopes.includes(scope));
    if (missingScopes.length > 0) {
      return {
        ok: false,
        status: 403,
        error: `工具权限不足：${missingScopes.join(", ")}。`,
        reasonCode: "missing_scopes",
        missingScopes,
        grant: publicGrant(grant)
      };
    }
    if (tool?.id && grant.toolDeny.includes(tool.id)) {
      return {
        ok: false,
        status: 403,
        error: `工具已被授权策略拒绝：${tool.id}。`,
        reasonCode: "tool_denied",
        grant: publicGrant(grant)
      };
    }
    if (tool?.id && grant.toolAllow.length > 0 && !grant.toolAllow.includes(tool.id)) {
      return {
        ok: false,
        status: 403,
        error: `工具不在授权白名单中：${tool.id}。`,
        reasonCode: "tool_not_allowed",
        grant: publicGrant(grant)
      };
    }
    const usedAt = nowIso();
    const updated = {
      ...grant,
      useCount: grant.useCount + 1,
      lastUsedAt: usedAt,
      updatedAt: grant.updatedAt || usedAt
    };
    upsertGrant(updated);
    return {
      ok: true,
      grant: publicGrant(updated),
      sourceIp
    };
  }

  function appendPolicyDecision(entry = {}) {
    const decisionId = entry.decisionId || randomId("policy");
    db.prepare(`
      INSERT INTO tool_policy_decisions (
        decision_id, tool_execution_id, trace_id, tool_id, grant_id, effect, reason_code,
        missing_scopes_json, missing_toolsets_json, evaluated_layers_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      decisionId,
      String(entry.toolExecutionId || ""),
      String(entry.traceId || ""),
      String(entry.toolId || ""),
      String(entry.grantId || ""),
      String(entry.effect || ""),
      String(entry.reasonCode || ""),
      stringifyJson(entry.missingScopes || []),
      stringifyJson(entry.missingToolsets || []),
      stringifyJson(entry.evaluatedLayers || []),
      entry.createdAt || nowIso()
    );
    return { decisionId };
  }

  function appendExecution(entry = {}) {
    db.prepare(`
      INSERT INTO tool_executions (
        tool_execution_id, trace_id, tool_id, tool_version, toolset_ids_json, subject_type,
        subject_id, grant_id, agent_id, profile_id, operation_id, risk, decision, input_hash,
        redacted_input_json, result_summary_json, status, error_code, duration_ms,
        policy_decision_id, approval_id, source_ip, user_agent, started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(entry.toolExecutionId || randomId("tool_exec")),
      String(entry.traceId || ""),
      String(entry.toolId || ""),
      String(entry.toolVersion || ""),
      stringifyJson(entry.toolsetIds || []),
      String(entry.subjectType || ""),
      String(entry.subjectId || ""),
      String(entry.grantId || ""),
      String(entry.agentId || ""),
      String(entry.profileId || ""),
      String(entry.operationId || ""),
      String(entry.risk || ""),
      String(entry.decision || ""),
      String(entry.inputHash || hashValue(entry.input || {})),
      stringifyJson(entry.redactedInput || summarizeValue(entry.input || {})),
      stringifyJson(entry.resultSummary || summarizeValue(entry.result || {})),
      String(entry.status || ""),
      String(entry.errorCode || ""),
      Math.max(0, Number(entry.durationMs || 0)),
      String(entry.policyDecisionId || ""),
      String(entry.approvalId || ""),
      String(entry.sourceIp || ""),
      String(entry.userAgent || ""),
      String(entry.startedAt || nowIso()),
      String(entry.finishedAt || nowIso())
    );
  }

  function appendMetric(entry = {}) {
    db.prepare(`
      INSERT INTO tool_metric_events (
        metric_id, trace_id, tool_id, grant_id, profile_id, status, risk, duration_ms,
        result_bytes, reason_code, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomId("metric"),
      String(entry.traceId || ""),
      String(entry.toolId || ""),
      String(entry.grantId || ""),
      String(entry.profileId || ""),
      String(entry.status || ""),
      String(entry.risk || ""),
      Math.max(0, Number(entry.durationMs || 0)),
      Math.max(0, Number(entry.resultBytes || 0)),
      String(entry.reasonCode || ""),
      entry.createdAt || nowIso()
    );
  }

  function saveCatalogSnapshot(catalog = {}) {
    if (!catalog.fingerprint) {
      return null;
    }
    db.prepare(`
      INSERT OR IGNORE INTO tool_catalog_snapshots (fingerprint, catalog_json, created_at)
      VALUES (?, ?, ?)
    `).run(catalog.fingerprint, stringifyJson(catalog), nowIso());
    return { fingerprint: catalog.fingerprint };
  }

  function listAudit({ limit = 100, toolId = "", grantId = "", status = "" } = {}) {
    const clauses = [];
    const params = [];
    if (toolId) {
      clauses.push("tool_id = ?");
      params.push(String(toolId));
    }
    if (grantId) {
      clauses.push("grant_id = ?");
      params.push(String(grantId));
    }
    if (status) {
      clauses.push("status = ?");
      params.push(String(status));
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = db.prepare(`
      SELECT * FROM tool_executions
      ${where}
      ORDER BY started_at DESC
      LIMIT ?
    `).all(...params, Math.max(1, Math.min(Number(limit || 100), 500)));
    return rows.map((row) => ({
      toolExecutionId: row.tool_execution_id,
      traceId: row.trace_id,
      toolId: row.tool_id,
      toolVersion: row.tool_version,
      toolsetIds: parseJson(row.toolset_ids_json, []),
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      grantId: row.grant_id,
      agentId: row.agent_id,
      profileId: row.profile_id,
      operationId: row.operation_id,
      risk: row.risk,
      decision: row.decision,
      inputHash: row.input_hash,
      redactedInput: parseJson(row.redacted_input_json, {}),
      resultSummary: parseJson(row.result_summary_json, {}),
      status: row.status,
      errorCode: row.error_code,
      durationMs: row.duration_ms,
      policyDecisionId: row.policy_decision_id,
      approvalId: row.approval_id,
      sourceIp: row.source_ip,
      userAgent: row.user_agent,
      startedAt: row.started_at,
      finishedAt: row.finished_at
    }));
  }

  function getAudit(toolExecutionId) {
    const row = db.prepare("SELECT * FROM tool_executions WHERE tool_execution_id = ?").get(String(toolExecutionId || ""));
    if (!row) {
      return null;
    }
    return {
      toolExecutionId: row.tool_execution_id,
      traceId: row.trace_id,
      toolId: row.tool_id,
      toolVersion: row.tool_version,
      toolsetIds: parseJson(row.toolset_ids_json, []),
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      grantId: row.grant_id,
      agentId: row.agent_id,
      profileId: row.profile_id,
      operationId: row.operation_id,
      risk: row.risk,
      decision: row.decision,
      inputHash: row.input_hash,
      redactedInput: parseJson(row.redacted_input_json, {}),
      resultSummary: parseJson(row.result_summary_json, {}),
      status: row.status,
      errorCode: row.error_code,
      durationMs: row.duration_ms,
      policyDecisionId: row.policy_decision_id,
      approvalId: row.approval_id,
      sourceIp: row.source_ip,
      userAgent: row.user_agent,
      startedAt: row.started_at,
      finishedAt: row.finished_at
    };
  }

  function metricsSummary({ limit = 2000, since = "", until = "" } = {}) {
    const clauses = [];
    const params = [];
    if (since) {
      clauses.push("created_at >= ?");
      params.push(String(since));
    }
    if (until) {
      clauses.push("created_at <= ?");
      params.push(String(until));
    }
    params.push(Math.max(1, Math.min(Number(limit || 2000), 10000)));
    const rows = db.prepare(`
      SELECT * FROM tool_metric_events
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params);
    const byStatus = {};
    const byTool = {};
    const byProfile = {};
    const byGrant = {};
    const byRisk = {};
    const deniedByReason = {};
    let durationTotal = 0;
    let resultBytesTotal = 0;
    let timeoutTotal = 0;
    let rateLimitedTotal = 0;
    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
      byTool[row.tool_id] = (byTool[row.tool_id] || 0) + 1;
      if (row.profile_id) {
        byProfile[row.profile_id] = (byProfile[row.profile_id] || 0) + 1;
      }
      if (row.grant_id) {
        byGrant[row.grant_id] = (byGrant[row.grant_id] || 0) + 1;
      }
      if (row.risk) {
        byRisk[row.risk] = (byRisk[row.risk] || 0) + 1;
      }
      if (row.status === "denied") {
        deniedByReason[row.reason_code || "unknown"] = (deniedByReason[row.reason_code || "unknown"] || 0) + 1;
      }
      if (row.reason_code === "tool_timeout") {
        timeoutTotal += 1;
      }
      if (row.reason_code === "rate_limited") {
        rateLimitedTotal += 1;
      }
      durationTotal += Number(row.duration_ms || 0);
      resultBytesTotal += Number(row.result_bytes || 0);
    }
    const activeExecutions = db.prepare("SELECT count(*) AS count FROM tool_executions WHERE status = 'running'").get().count;
    return {
      callsTotal: rows.length,
      byStatus,
      byTool,
      byProfile,
      byGrant,
      byRisk,
      deniedByReason,
      timeoutTotal,
      rateLimitedTotal,
      activeExecutions,
      averageDurationMs: rows.length ? Number((durationTotal / rows.length).toFixed(2)) : 0,
      resultBytesTotal
    };
  }

  return {
    db,
    rootPath,
    listGrants,
    getGrant: (grantId) => publicGrant(getGrant(grantId)),
    getRawGrant: getGrant,
    createGrant,
    updateGrant,
    deleteGrant,
    revokeGrant,
    rotateGrantToken,
    authorizeRequest,
    appendGrantEvent,
    appendPolicyDecision,
    appendExecution,
    appendMetric,
    saveCatalogSnapshot,
    listAudit,
    getAudit,
    metricsSummary,
    close() {
      try {
        db.pragma("wal_checkpoint(TRUNCATE)");
      } catch {
        // Closing must remain best-effort; verification cleanup should not depend on WAL support.
      }
      db.close();
    }
  };
}
