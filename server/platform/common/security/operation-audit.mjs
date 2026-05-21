import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "../storage/sqlite-migrations.mjs";

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|passwd|authorization|cookie|api[-_]?key|client[-_]?secret|csrf/i;
const SENSITIVE_VALUE_PATTERN =
  /(Bearer\s+[A-Za-z0-9._~+/=-]+|sk-[A-Za-z0-9._-]+|xox[baprs]-[A-Za-z0-9-]+|(?:(?:api[-_]?key|token|secret|password)\s*[:=]\s*)[^\s"',;]+)/gi;
// M-8: extended pattern — covers any Unix absolute path (not just well-known roots)
// and Windows UNC/drive paths.  Extra roots (data, srv, app, …) are now included.
const ABSOLUTE_PATH_PATTERN =
  /(?:[A-Za-z]:\\[^\s"'<>]+|\\\\[^\s"'<>]+|\/[a-zA-Z][a-zA-Z0-9._-]*(?:\/[^\s"',<>]+)+)/g;
const MAX_JSON_BYTES = 12 * 1024;

function nowIso() {
  return new Date().toISOString();
}

function stableJson(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function hashValue(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function truncateJson(value) {
  const text = JSON.stringify(value ?? {});
  if (Buffer.byteLength(text, "utf8") <= MAX_JSON_BYTES) {
    return value;
  }
  return {
    redacted: true,
    reason: "payload_too_large",
    byteLength: Buffer.byteLength(text, "utf8"),
    sha256: crypto.createHash("sha256").update(text).digest("hex")
  };
}

export function redactOperationAuditValue(value, depth = 0) {
  if (depth > 8) {
    return "<redacted-depth>";
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return value
      .replace(SENSITIVE_VALUE_PATTERN, (match) => {
        const prefix = match.match(/^\s*(api[-_]?key|token|secret|password)\s*[:=]/i)?.[0] || "";
        return prefix ? `${prefix}<redacted>` : "<redacted-secret>";
      })
      .replace(ABSOLUTE_PATH_PATTERN, "<redacted-path>");
  }
  if (typeof value !== "object") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return {
      redacted: true,
      reason: "buffer",
      byteLength: value.length,
      sha256: crypto.createHash("sha256").update(value).digest("hex")
    };
  }
  if (Array.isArray(value)) {
    return truncateJson(value.map((item) => redactOperationAuditValue(item, depth + 1)));
  }
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? "<redacted>"
      : redactOperationAuditValue(nested, depth + 1);
  }
  return truncateJson(output);
}

function summarizeOutput(value) {
  if (value === null || value === undefined) {
    return {};
  }
  if (Buffer.isBuffer(value)) {
    return { type: "buffer", byteLength: value.length };
  }
  if (typeof value !== "object") {
    return { value: redactOperationAuditValue(value) };
  }
  if (Array.isArray(value)) {
    return { type: "array", length: value.length };
  }
  const summary = {};
  for (const [key, nested] of Object.entries(value).slice(0, 40)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      summary[key] = "<redacted>";
    } else if (Array.isArray(nested)) {
      summary[key] = { type: "array", length: nested.length };
    } else if (nested && typeof nested === "object") {
      summary[key] = { type: "object", keys: Object.keys(nested).slice(0, 20) };
    } else {
      summary[key] = redactOperationAuditValue(nested);
    }
  }
  return truncateJson(summary);
}

function actorFrom(value = {}) {
  const user = value.user || value;
  return {
    type: value.type || (user?.userId ? "console-user" : "anonymous"),
    userId: user?.userId || "",
    username: user?.username || "",
    roleId: user?.roleId || ""
  };
}

function ensureOperationAuditColumns(db) {
  const cols = new Set(db.prepare("PRAGMA table_info(operation_audit_log)").all().map((row) => row.name));
  if (!cols.has("trace_id")) {
    db.exec("ALTER TABLE operation_audit_log ADD COLUMN trace_id TEXT NOT NULL DEFAULT ''");
  }
  if (!cols.has("request_id")) {
    db.exec("ALTER TABLE operation_audit_log ADD COLUMN request_id TEXT NOT NULL DEFAULT ''");
  }
}

function ensureSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS operation_audit_log (
      audit_id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL DEFAULT '',
      request_id TEXT NOT NULL DEFAULT '',
      operation_id TEXT NOT NULL,
      transport TEXT NOT NULL,
      actor_json TEXT NOT NULL DEFAULT '{}',
      risk TEXT NOT NULL DEFAULT '',
      read_only INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      input_hash TEXT NOT NULL DEFAULT '',
      redacted_input_json TEXT NOT NULL DEFAULT '{}',
      redacted_output_summary_json TEXT NOT NULL DEFAULT '{}',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);

  // Version-controlled migrations.
  runMigrations(db, [
    {
      version: 1,
      up: (d) => {
        ensureOperationAuditColumns(d);
      }
    }
  ]);

  // Keep startup tolerant of databases whose user_version was advanced by
  // earlier ad-hoc migrations before these columns were present.
  ensureOperationAuditColumns(db);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_operation_audit_created ON operation_audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_operation_audit_trace ON operation_audit_log(trace_id);
    CREATE INDEX IF NOT EXISTS idx_operation_audit_operation ON operation_audit_log(operation_id);
    CREATE INDEX IF NOT EXISTS idx_operation_audit_status ON operation_audit_log(status);
  `);
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

export function createOperationAuditStore({ userDataPath }) {
  const rootPath = path.join(userDataPath, "security");
  fs.mkdirSync(rootPath, { recursive: true });
  const db = new Database(path.join(rootPath, "operation-audit.sqlite"));
  ensureSchema(db);
  const insertStmt = db.prepare(`
    INSERT INTO operation_audit_log (
      audit_id, trace_id, request_id, operation_id, transport, actor_json, risk, read_only, status, duration_ms,
      input_hash, redacted_input_json, redacted_output_summary_json, error, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  function append(entry = {}) {
    const input = entry.input ?? {};
    const redactedInput = redactOperationAuditValue(input);
    const outputSummary = summarizeOutput(entry.output);
    const auditId = entry.auditId || `op_audit_${crypto.randomUUID()}`;
    insertStmt.run(
      auditId,
      String(entry.traceId || ""),
      String(entry.requestId || ""),
      String(entry.operationId || ""),
      String(entry.transport || "unknown"),
      JSON.stringify(actorFrom(entry.actor || {})),
      String(entry.risk || ""),
      entry.readOnly ? 1 : 0,
      String(entry.status || ""),
      Math.max(0, Number(entry.durationMs || 0)),
      hashValue(input),
      JSON.stringify(redactedInput),
      JSON.stringify(outputSummary),
      String(entry.error || "").replace(ABSOLUTE_PATH_PATTERN, "<redacted-path>").slice(0, 2000),
      entry.createdAt || nowIso()
    );
    return { auditId };
  }

  function list({ limit = 100, operationId = "", status = "", userId = "" } = {}) {
    const clauses = [];
    const params = [];
    if (operationId) {
      clauses.push("operation_id = ?");
      params.push(String(operationId));
    }
    if (status) {
      clauses.push("status = ?");
      params.push(String(status));
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = db.prepare(`
      SELECT * FROM operation_audit_log
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, Math.max(1, Math.min(Number(limit || 100), 500)));
    return rows
      .map((row) => ({
        auditId: row.audit_id,
        traceId: row.trace_id || "",
        requestId: row.request_id || "",
        operationId: row.operation_id,
        transport: row.transport,
        actor: parseJson(row.actor_json, {}),
        risk: row.risk,
        readOnly: Boolean(row.read_only),
        status: row.status,
        durationMs: row.duration_ms,
        inputHash: row.input_hash,
        redactedInput: parseJson(row.redacted_input_json, {}),
        redactedOutputSummary: parseJson(row.redacted_output_summary_json, {}),
        error: row.error,
        createdAt: row.created_at
      }))
      .filter((entry) => !userId || entry.actor?.userId === String(userId));
  }

  return {
    db,
    rootPath,
    append,
    list,
    close() {
      db.close();
    }
  };
}

export default createOperationAuditStore;
