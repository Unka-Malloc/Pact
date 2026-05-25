import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ServerConfig } from "../../config/ServerConfig.mjs";

function nowIso() {
  return new Date().toISOString();
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || "");
    return parsed === undefined || parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function asLimit(value, fallback = 100) {
  return Math.max(1, Math.min(Number(value || fallback) || fallback, 500));
}

function subjectIdFrom(value = {}) {
  return String(
    value.subjectId ||
      value.userId ||
      value.username ||
      value.id ||
      value.subject?.subjectId ||
      value.subject?.id ||
      ""
  );
}

function ensureSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS authorization_decisions (
      decision_id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL DEFAULT '',
      subject_type TEXT NOT NULL DEFAULT '',
      subject_id TEXT NOT NULL DEFAULT '',
      operation_id TEXT NOT NULL DEFAULT '',
      tool_id TEXT NOT NULL DEFAULT '',
      grant_id TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL DEFAULT '',
      effect TEXT NOT NULL DEFAULT '',
      reason_code TEXT NOT NULL DEFAULT '',
      missing_scopes_json TEXT NOT NULL DEFAULT '[]',
      missing_toolsets_json TEXT NOT NULL DEFAULT '[]',
      required_scopes_json TEXT NOT NULL DEFAULT '[]',
      evaluated_layers_json TEXT NOT NULL DEFAULT '[]',
      decision_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS authorization_receipts (
      receipt_id TEXT PRIMARY KEY,
      decision_id TEXT NOT NULL DEFAULT '',
      subject_id TEXT NOT NULL DEFAULT '',
      workspace_id TEXT NOT NULL DEFAULT '',
      access_mode TEXT NOT NULL DEFAULT '',
      receipt_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS authorization_loan_records (
      loan_record_id TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL DEFAULT '',
      decision_id TEXT NOT NULL DEFAULT '',
      subject_id TEXT NOT NULL DEFAULT '',
      workspace_id TEXT NOT NULL DEFAULT '',
      access_mode TEXT NOT NULL DEFAULT '',
      loan_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS authorization_denied_requests (
      denied_request_id TEXT PRIMARY KEY,
      decision_id TEXT NOT NULL DEFAULT '',
      subject_id TEXT NOT NULL DEFAULT '',
      operation_id TEXT NOT NULL DEFAULT '',
      tool_id TEXT NOT NULL DEFAULT '',
      reason_code TEXT NOT NULL DEFAULT '',
      denied_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_authorization_decisions_created ON authorization_decisions(created_at);
    CREATE INDEX IF NOT EXISTS idx_authorization_decisions_subject ON authorization_decisions(subject_id);
    CREATE INDEX IF NOT EXISTS idx_authorization_decisions_operation ON authorization_decisions(operation_id);
    CREATE INDEX IF NOT EXISTS idx_authorization_receipts_created ON authorization_receipts(created_at);
    CREATE INDEX IF NOT EXISTS idx_authorization_loans_created ON authorization_loan_records(created_at);
    CREATE INDEX IF NOT EXISTS idx_authorization_denied_created ON authorization_denied_requests(created_at);
  `);
}

function rowToDecision(row) {
  return {
    decisionId: row.decision_id,
    traceId: row.trace_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    operationId: row.operation_id,
    toolId: row.tool_id,
    grantId: row.grant_id,
    action: row.action,
    effect: row.effect,
    reasonCode: row.reason_code,
    missingScopes: parseJson(row.missing_scopes_json, []),
    missingToolsets: parseJson(row.missing_toolsets_json, []),
    requiredScopes: parseJson(row.required_scopes_json, []),
    evaluatedLayers: parseJson(row.evaluated_layers_json, []),
    decision: parseJson(row.decision_json, {}),
    createdAt: row.created_at
  };
}

function rowToReceipt(row) {
  return {
    receiptId: row.receipt_id,
    decisionId: row.decision_id,
    subjectId: row.subject_id,
    workspaceId: row.workspace_id,
    accessMode: row.access_mode,
    receipt: parseJson(row.receipt_json, {}),
    createdAt: row.created_at
  };
}

function rowToLoanRecord(row) {
  return {
    loanRecordId: row.loan_record_id,
    receiptId: row.receipt_id,
    decisionId: row.decision_id,
    subjectId: row.subject_id,
    workspaceId: row.workspace_id,
    accessMode: row.access_mode,
    loanRecord: parseJson(row.loan_json, {}),
    createdAt: row.created_at
  };
}

function rowToDeniedRequest(row) {
  return {
    deniedRequestId: row.denied_request_id,
    decisionId: row.decision_id,
    subjectId: row.subject_id,
    operationId: row.operation_id,
    toolId: row.tool_id,
    reasonCode: row.reason_code,
    deniedRequest: parseJson(row.denied_json, {}),
    createdAt: row.created_at
  };
}

export function createAuthorizationStore({ userDataPath = "", rootPath = "" } = {}) {
  const resolvedRoot = rootPath ||
    path.join(userDataPath || ServerConfig.getDataDir(), "security", "authorization");
  fs.mkdirSync(resolvedRoot, { recursive: true });
  const db = new Database(path.join(resolvedRoot, "authorization.sqlite"));
  ensureSchema(db);

  function appendDeniedRequest(entry = {}) {
    const deniedRequest = entry.deniedRequest || entry;
    const deniedRequestId = String(
      entry.deniedRequestId ||
        deniedRequest.deniedRequestId ||
        deniedRequest.auditId ||
        randomId("authz_denied")
    );
    db.prepare(`
      INSERT OR REPLACE INTO authorization_denied_requests (
        denied_request_id, decision_id, subject_id, operation_id, tool_id, reason_code, denied_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      deniedRequestId,
      String(entry.decisionId || deniedRequest.decisionId || ""),
      String(entry.subjectId || subjectIdFrom(deniedRequest.subject || deniedRequest) || ""),
      String(entry.operationId || deniedRequest.operationId || ""),
      String(entry.toolId || deniedRequest.toolId || ""),
      String(entry.reasonCode || deniedRequest.reasonCode || deniedRequest.filteredReason || "denied"),
      stringifyJson(deniedRequest),
      String(entry.createdAt || deniedRequest.createdAt || nowIso())
    );
    return { deniedRequestId };
  }

  function appendDecision(decision = {}) {
    const decisionId = String(decision.decisionId || randomId("authz_decision"));
    const subject = decision.subject || {};
    db.prepare(`
      INSERT OR REPLACE INTO authorization_decisions (
        decision_id, trace_id, subject_type, subject_id, operation_id, tool_id, grant_id, action,
        effect, reason_code, missing_scopes_json, missing_toolsets_json, required_scopes_json,
        evaluated_layers_json, decision_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      decisionId,
      String(decision.traceId || ""),
      String(subject.type || decision.subjectType || ""),
      String(subject.subjectId || decision.subjectId || ""),
      String(decision.operationId || decision.operation?.id || ""),
      String(decision.toolId || decision.tool?.id || ""),
      String(decision.grantId || decision.grant?.id || ""),
      String(decision.action || ""),
      String(decision.effect || ""),
      String(decision.reasonCode || ""),
      stringifyJson(decision.missingScopes || []),
      stringifyJson(decision.missingToolsets || []),
      stringifyJson(decision.requiredScopes || []),
      stringifyJson(decision.evaluatedLayers || []),
      stringifyJson({ ...decision, decisionId }),
      String(decision.createdAt || nowIso())
    );
    if (decision.allowed === false || decision.effect === "deny") {
      appendDeniedRequest({
        decisionId,
        subjectId: subject.subjectId || "",
        operationId: decision.operationId || "",
        toolId: decision.toolId || "",
        reasonCode: decision.reasonCode || "denied",
        deniedRequest: { ...decision, decisionId }
      });
    }
    return { decisionId };
  }

  function appendReceipt(receipt = {}, options = {}) {
    const receiptId = String(receipt.receiptId || options.receiptId || randomId("authz_receipt"));
    db.prepare(`
      INSERT OR REPLACE INTO authorization_receipts (
        receipt_id, decision_id, subject_id, workspace_id, access_mode, receipt_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      receiptId,
      String(options.decisionId || receipt.decisionId || ""),
      String(options.subjectId || subjectIdFrom(receipt.subject || receipt) || ""),
      String(options.workspaceId || receipt.workspaceId || ""),
      String(options.accessMode || receipt.accessMode || ""),
      stringifyJson({ ...receipt, receiptId }),
      String(options.createdAt || receipt.createdAt || nowIso())
    );
    return { receiptId };
  }

  function appendLoanRecord(loanRecord = {}, options = {}) {
    const loanRecordId = String(loanRecord.loanRecordId || options.loanRecordId || randomId("authz_loan"));
    db.prepare(`
      INSERT OR REPLACE INTO authorization_loan_records (
        loan_record_id, receipt_id, decision_id, subject_id, workspace_id, access_mode, loan_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      loanRecordId,
      String(options.receiptId || loanRecord.receiptId || ""),
      String(options.decisionId || loanRecord.decisionId || ""),
      String(options.subjectId || subjectIdFrom(loanRecord.subject || loanRecord) || ""),
      String(options.workspaceId || loanRecord.workspaceId || ""),
      String(options.accessMode || loanRecord.accessMode || ""),
      stringifyJson({ ...loanRecord, loanRecordId }),
      String(options.createdAt || loanRecord.createdAt || loanRecord.issuedAt || nowIso())
    );
    return { loanRecordId };
  }

  function listDecisions({ limit = 100, subjectId = "", operationId = "", effect = "" } = {}) {
    const clauses = [];
    const params = [];
    if (subjectId) {
      clauses.push("subject_id = ?");
      params.push(String(subjectId));
    }
    if (operationId) {
      clauses.push("operation_id = ?");
      params.push(String(operationId));
    }
    if (effect) {
      clauses.push("effect = ?");
      params.push(String(effect));
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return db.prepare(`
      SELECT * FROM authorization_decisions
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, asLimit(limit)).map(rowToDecision);
  }

  function listReceipts({ limit = 100, subjectId = "" } = {}) {
    const where = subjectId ? "WHERE subject_id = ?" : "";
    const params = subjectId ? [String(subjectId)] : [];
    return db.prepare(`
      SELECT * FROM authorization_receipts
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, asLimit(limit)).map(rowToReceipt);
  }

  function listLoanRecords({ limit = 100, subjectId = "" } = {}) {
    const where = subjectId ? "WHERE subject_id = ?" : "";
    const params = subjectId ? [String(subjectId)] : [];
    return db.prepare(`
      SELECT * FROM authorization_loan_records
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, asLimit(limit)).map(rowToLoanRecord);
  }

  function listDeniedRequests({ limit = 100, subjectId = "" } = {}) {
    const where = subjectId ? "WHERE subject_id = ?" : "";
    const params = subjectId ? [String(subjectId)] : [];
    return db.prepare(`
      SELECT * FROM authorization_denied_requests
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, asLimit(limit)).map(rowToDeniedRequest);
  }

  return {
    db,
    rootPath: resolvedRoot,
    appendDecision,
    appendReceipt,
    appendLoanRecord,
    appendDeniedRequest,
    listDecisions,
    listReceipts,
    listLoanRecords,
    listDeniedRequests,
    close() {
      db.close();
    }
  };
}

let globalAuthorizationStore = null;

export function getGlobalAuthorizationStore() {
  if (!globalAuthorizationStore) {
    globalAuthorizationStore = createAuthorizationStore();
  }
  return globalAuthorizationStore;
}
