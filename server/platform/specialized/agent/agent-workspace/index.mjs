import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const AGENT_WORKSPACE_PROTOCOL_VERSION = "splitall.agent-workspace.v1";

const ACCEPTED_SUBMISSION_TYPES = new Set([
  "evidenceCard",
  "evidenceRef",
  "claim",
  "artifact",
  "issue",
  "decisionProposal",
  "taskState",
  "contextSummary",
  "canonicalChange",
  "entityMerge",
  "relationChange",
  "taxonomyChange"
]);

const REVIEW_ONLY_TYPES = new Set([
  "canonicalChange",
  "entityMerge",
  "relationChange",
  "taxonomyChange"
]);

function nowIso() {
  return new Date().toISOString();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseJson(value, fallback = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function stringifyJson(value, fallback = {}) {
  return JSON.stringify(value === undefined ? fallback : value);
}

function stableHash(...parts) {
  return crypto
    .createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("\n"))
    .digest("hex");
}

function stableId(prefix, ...parts) {
  return `${prefix}_${stableHash(prefix, ...parts).slice(0, 24)}`;
}

function optionalLimit(value, max = 500) {
  if (value === undefined || value === null || value === false) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.max(1, Math.min(Math.floor(numeric), max));
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEvidenceRefs(value, payload = {}) {
  const refs = [
    ...asArray(value),
    ...asArray(payload.evidenceRefs),
    payload.evidenceId,
    payload.sourceEvidenceId
  ]
    .map((item) => {
      if (!item) {
        return "";
      }
      if (typeof item === "string") {
        return item.trim();
      }
      return String(item.evidenceId || item.id || item.ref || "").trim();
    })
    .filter(Boolean);
  return [...new Set(refs)];
}

function submissionSummary(type, payload) {
  return normalizeText(
    payload.claim ||
      payload.summary ||
      payload.title ||
      payload.content ||
      payload.question ||
      payload.status ||
      type
  ).slice(0, 500);
}

function hydrateWorkspace(row) {
  if (!row) {
    return null;
  }
  return {
    workspaceId: row.workspace_id,
    title: row.title,
    objective: row.objective,
    status: row.status,
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function hydrateRun(row, options = {}) {
  if (!row) {
    return null;
  }
  const includeDetails = options.includeDetails !== false;
  return {
    runId: row.run_id,
    workspaceId: row.workspace_id,
    runType: row.run_type,
    status: row.status,
    input: parseJson(row.input_json, {}),
    steps: includeDetails ? parseJson(row.steps_json, []) : [],
    coverage: includeDetails ? parseJson(row.coverage_json, {}) : {},
    artifactIds: parseJson(row.artifact_ids_json, []),
    error: row.error,
    degraded: Boolean(row.degraded),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at
  };
}

function hydrateSubmission(row) {
  if (!row) {
    return null;
  }
  return {
    submissionId: row.submission_id,
    workspaceId: row.workspace_id,
    runId: row.run_id,
    agentId: row.agent_id,
    type: row.type,
    status: row.status,
    confidence: Number(row.confidence || 0),
    payload: parseJson(row.payload_json, {}),
    evidenceRefs: parseJson(row.evidence_refs_json, []),
    gate: parseJson(row.gate_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function hydratePrivateState(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    runId: row.run_id,
    agentId: row.agent_id,
    summary: row.summary,
    state: parseJson(row.state_json, {}),
    updatedAt: row.updated_at
  };
}

function hydrateArtifact(row) {
  if (!row) {
    return null;
  }
  return {
    artifactId: row.artifact_id,
    workspaceId: row.workspace_id,
    runId: row.run_id,
    level: row.level,
    title: row.title,
    content: row.content,
    citations: parseJson(row.citations_json, []),
    coverageReport: parseJson(row.coverage_json, {}),
    revision: Number(row.revision || 1),
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function hydrateIssue(row) {
  if (!row) {
    return null;
  }
  return {
    issueId: row.issue_id,
    workspaceId: row.workspace_id,
    runId: row.run_id,
    type: row.type,
    status: row.status,
    severity: row.severity,
    title: row.title,
    payload: parseJson(row.payload_json, {}),
    evidenceRefs: parseJson(row.evidence_refs_json, []),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function hydrateDecision(row) {
  if (!row) {
    return null;
  }
  return {
    decisionId: row.decision_id,
    workspaceId: row.workspace_id,
    runId: row.run_id,
    status: row.status,
    title: row.title,
    payload: parseJson(row.payload_json, {}),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function hydrateLock(row) {
  if (!row) {
    return null;
  }
  return {
    lockId: row.lock_id,
    workspaceId: row.workspace_id,
    targetType: row.target_type,
    targetId: row.target_id,
    ownerAgentId: row.owner_agent_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };
}

function gateSubmission({ existingDuplicate = null, submission, writePolicy = {} }) {
  const reasons = [];
  const type = String(submission.type || "").trim();
  const payload = asObject(submission.payload);
  const evidenceRefs = normalizeEvidenceRefs(submission.evidenceRefs, payload);
  const confidence = Math.max(0, Math.min(1, Number(submission.confidence || payload.confidence || 0)));
  const allowedTypes = new Set(asArray(writePolicy.allowedTypes).filter(Boolean));

  if (!ACCEPTED_SUBMISSION_TYPES.has(type)) {
    reasons.push("unsupported_type");
  }
  if (allowedTypes.size && !allowedTypes.has(type)) {
    reasons.push("role_not_allowed");
  }
  if (existingDuplicate) {
    reasons.push("duplicate_submission");
  }
  if ((type === "claim" || type === "evidenceCard") && evidenceRefs.length === 0) {
    reasons.push("missing_evidence");
  }
  if ((type === "claim" || type === "evidenceCard") && confidence < 0.45) {
    reasons.push("low_confidence");
  }
  if (REVIEW_ONLY_TYPES.has(type)) {
    reasons.push("canonical_change_requires_review");
  }

  let status = "proposed";
  if (type === "evidenceRef" && evidenceRefs.length > 0) {
    status = "accepted";
  }
  if (type === "artifact" || type === "taskState" || type === "contextSummary") {
    status = "accepted";
  }
  if (type === "issue" || type === "decisionProposal") {
    status = "proposed";
  }
  if (reasons.includes("duplicate_submission") || reasons.includes("unsupported_type") || reasons.includes("role_not_allowed")) {
    status = "rejected";
  } else if (
    reasons.includes("missing_evidence") ||
    reasons.includes("low_confidence") ||
    reasons.includes("canonical_change_requires_review")
  ) {
    status = "needs_review";
  }

  return {
    status,
    confidence,
    evidenceRefs,
    acceptedByGate: status === "accepted",
    reasons,
    duplicateOf: existingDuplicate?.submission_id || "",
    reviewedRequired: status === "needs_review" || REVIEW_ONLY_TYPES.has(type)
  };
}

export function createAgentWorkspace({ userDataPath }) {
  const rootPath = path.join(userDataPath, "agent-workspaces");
  fs.mkdirSync(rootPath, { recursive: true });
  const db = new Database(path.join(rootPath, "agent-workspace.sqlite"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS aw_workspaces (
      workspace_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      objective TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS aw_runs (
      run_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      run_type TEXT NOT NULL,
      status TEXT NOT NULL,
      input_json TEXT NOT NULL DEFAULT '{}',
      steps_json TEXT NOT NULL DEFAULT '[]',
      coverage_json TEXT NOT NULL DEFAULT '{}',
      artifact_ids_json TEXT NOT NULL DEFAULT '[]',
      error TEXT NOT NULL DEFAULT '',
      degraded INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_aw_runs_workspace ON aw_runs(workspace_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS aw_private_state (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      state_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      UNIQUE(workspace_id, run_id, agent_id)
    );
    CREATE TABLE IF NOT EXISTS aw_submissions (
      submission_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      duplicate_key TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      gate_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_aw_submissions_workspace ON aw_submissions(workspace_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_aw_submissions_duplicate ON aw_submissions(workspace_id, type, duplicate_key);
    CREATE TABLE IF NOT EXISTS aw_artifacts (
      artifact_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      level TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      citations_json TEXT NOT NULL DEFAULT '[]',
      coverage_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'draft',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_aw_artifacts_run ON aw_artifacts(run_id, level, updated_at DESC);
    CREATE TABLE IF NOT EXISTS aw_issues (
      issue_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      title TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_aw_issues_workspace ON aw_issues(workspace_id, status, updated_at DESC);
    CREATE TABLE IF NOT EXISTS aw_decisions (
      decision_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS aw_locks (
      lock_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      owner_agent_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_aw_locks_target ON aw_locks(workspace_id, target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_aw_locks_expiry ON aw_locks(expires_at);
  `);

  const insertWorkspaceStmt = db.prepare(`
    INSERT OR REPLACE INTO aw_workspaces (
      workspace_id, title, objective, status, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const selectWorkspaceStmt = db.prepare("SELECT * FROM aw_workspaces WHERE workspace_id = ?");
  const listWorkspacesStmt = db.prepare("SELECT * FROM aw_workspaces ORDER BY updated_at DESC LIMIT ?");
  const listWorkspacesByStatusStmt = db.prepare("SELECT * FROM aw_workspaces WHERE status = ? ORDER BY updated_at DESC LIMIT ?");
  const insertRunStmt = db.prepare(`
    INSERT OR REPLACE INTO aw_runs (
      run_id, workspace_id, run_type, status, input_json, steps_json, coverage_json,
      artifact_ids_json, error, degraded, created_at, updated_at, started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const selectRunStmt = db.prepare("SELECT * FROM aw_runs WHERE run_id = ?");
  const updateWorkspaceTimeStmt = db.prepare("UPDATE aw_workspaces SET updated_at = ? WHERE workspace_id = ?");
  const selectSubmissionStmt = db.prepare("SELECT * FROM aw_submissions WHERE submission_id = ?");
  const updateSubmissionStatusStmt = db.prepare("UPDATE aw_submissions SET status = ?, gate_json = ?, updated_at = ? WHERE submission_id = ?");
  const selectIssueStmt = db.prepare("SELECT * FROM aw_issues WHERE issue_id = ?");
  const updateIssueStatusStmt = db.prepare("UPDATE aw_issues SET status = ?, payload_json = ?, updated_at = ? WHERE issue_id = ?");
  const selectLockStmt = db.prepare("SELECT * FROM aw_locks WHERE lock_id = ?");
  const selectTargetLockStmt = db.prepare("SELECT * FROM aw_locks WHERE workspace_id = ? AND target_type = ? AND target_id = ?");
  const insertLockStmt = db.prepare(`
    INSERT INTO aw_locks (
      lock_id, workspace_id, target_type, target_id, owner_agent_id, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, target_type, target_id) DO UPDATE SET
      lock_id = excluded.lock_id,
      owner_agent_id = excluded.owner_agent_id,
      expires_at = excluded.expires_at,
      created_at = excluded.created_at
  `);
  const deleteLockStmt = db.prepare("DELETE FROM aw_locks WHERE lock_id = ?");
  const deleteExpiredLocksStmt = db.prepare("DELETE FROM aw_locks WHERE expires_at <= ?");
  const selectDuplicateStmt = db.prepare(`
    SELECT * FROM aw_submissions
    WHERE workspace_id = ? AND type = ? AND duplicate_key = ? AND status != 'rejected'
    LIMIT 1
  `);
  const insertSubmissionStmt = db.prepare(`
    INSERT OR REPLACE INTO aw_submissions (
      submission_id, workspace_id, run_id, agent_id, type, status, confidence, duplicate_key,
      payload_json, evidence_refs_json, gate_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPrivateStmt = db.prepare(`
    INSERT INTO aw_private_state (
      id, workspace_id, run_id, agent_id, summary, state_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, run_id, agent_id) DO UPDATE SET
      summary = excluded.summary,
      state_json = excluded.state_json,
      updated_at = excluded.updated_at
  `);
  const insertArtifactStmt = db.prepare(`
    INSERT OR REPLACE INTO aw_artifacts (
      artifact_id, workspace_id, run_id, level, title, content, citations_json,
      coverage_json, revision, status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertIssueStmt = db.prepare(`
    INSERT OR REPLACE INTO aw_issues (
      issue_id, workspace_id, run_id, type, status, severity, title,
      payload_json, evidence_refs_json, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDecisionStmt = db.prepare(`
    INSERT OR REPLACE INTO aw_decisions (
      decision_id, workspace_id, run_id, status, title, payload_json, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  function workspaceSummary(workspaceId) {
    const runCount = db.prepare("SELECT COUNT(*) AS count FROM aw_runs WHERE workspace_id = ?").get(workspaceId)?.count || 0;
    const submissionRows = db.prepare("SELECT status, COUNT(*) AS count FROM aw_submissions WHERE workspace_id = ? GROUP BY status").all(workspaceId);
    const artifactCount = db.prepare("SELECT COUNT(*) AS count FROM aw_artifacts WHERE workspace_id = ?").get(workspaceId)?.count || 0;
    const openIssueCount = db.prepare("SELECT COUNT(*) AS count FROM aw_issues WHERE workspace_id = ? AND status != 'resolved'").get(workspaceId)?.count || 0;
    const activeLockCount = db.prepare("SELECT COUNT(*) AS count FROM aw_locks WHERE workspace_id = ? AND expires_at > ?").get(workspaceId, nowIso())?.count || 0;
    const submissionCounts = Object.fromEntries(submissionRows.map((row) => [row.status, Number(row.count || 0)]));
    return {
      runCount: Number(runCount),
      submissionCount: Object.values(submissionCounts).reduce((sum, count) => sum + count, 0),
      acceptedSubmissionCount: submissionCounts.accepted || 0,
      reviewSubmissionCount: submissionCounts.needs_review || 0,
      artifactCount: Number(artifactCount),
      openIssueCount: Number(openIssueCount),
      activeLockCount: Number(activeLockCount)
    };
  }

  function listWorkspaces(input = {}) {
    const limit = Math.max(1, Math.min(Number(input.limit || 50), 500));
    const status = String(input.status || "").trim();
    const includeSummary = input.includeSummary !== false;
    const rows = status
      ? listWorkspacesByStatusStmt.all(status, limit)
      : listWorkspacesStmt.all(limit);
    const workspaces = rows.map(hydrateWorkspace);
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      workspaces: workspaces.map((workspace) => ({
        ...workspace,
        summary: includeSummary ? workspaceSummary(workspace.workspaceId) : undefined
      })),
      count: workspaces.length
    };
  }

  function createWorkspace(input = {}) {
    const timestamp = nowIso();
    const workspaceId =
      String(input.workspaceId || "").trim() ||
      stableId("workspace", input.title || "", input.objective || "", timestamp);
    const workspace = {
      workspaceId,
      title: normalizeText(input.title || "Knowledge Agent Workspace") || "Knowledge Agent Workspace",
      objective: normalizeText(input.objective || input.query || ""),
      status: String(input.status || "active"),
      metadata: asObject(input.metadata),
      createdAt: input.createdAt || timestamp,
      updatedAt: timestamp
    };
    insertWorkspaceStmt.run(
      workspace.workspaceId,
      workspace.title,
      workspace.objective,
      workspace.status,
      stringifyJson(workspace.metadata),
      workspace.createdAt,
      workspace.updatedAt
    );
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      workspace
    };
  }

  function createRun(input = {}) {
    const timestamp = nowIso();
    const runId = String(input.runId || "").trim() || stableId("run", input.workspaceId || "", input.runType || "", timestamp);
    const run = {
      runId,
      workspaceId: String(input.workspaceId || ""),
      runType: String(input.runType || "multi_agent"),
      status: String(input.status || "queued"),
      input: asObject(input.input),
      steps: asArray(input.steps),
      coverage: asObject(input.coverage),
      artifactIds: asArray(input.artifactIds),
      error: String(input.error || ""),
      degraded: input.degraded === true,
      createdAt: input.createdAt || timestamp,
      updatedAt: timestamp,
      startedAt: input.startedAt || "",
      completedAt: input.completedAt || ""
    };
    insertRunStmt.run(
      run.runId,
      run.workspaceId,
      run.runType,
      run.status,
      stringifyJson(run.input),
      stringifyJson(run.steps, []),
      stringifyJson(run.coverage),
      stringifyJson(run.artifactIds, []),
      run.error,
      run.degraded ? 1 : 0,
      run.createdAt,
      run.updatedAt,
      run.startedAt,
      run.completedAt
    );
    updateWorkspaceTimeStmt.run(timestamp, run.workspaceId);
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      run
    };
  }

  function updateRun(runId, patch = {}) {
    const current = hydrateRun(selectRunStmt.get(String(runId || "")));
    if (!current) {
      return null;
    }
    const timestamp = nowIso();
    const next = {
      ...current,
      ...patch,
      input: patch.input === undefined ? current.input : patch.input,
      steps: patch.steps === undefined ? current.steps : patch.steps,
      coverage: patch.coverage === undefined ? current.coverage : patch.coverage,
      artifactIds: patch.artifactIds === undefined ? current.artifactIds : patch.artifactIds,
      degraded: patch.degraded === undefined ? current.degraded : patch.degraded === true,
      updatedAt: timestamp
    };
    insertRunStmt.run(
      next.runId,
      next.workspaceId,
      next.runType,
      next.status,
      stringifyJson(next.input),
      stringifyJson(next.steps, []),
      stringifyJson(next.coverage),
      stringifyJson(next.artifactIds, []),
      next.error || "",
      next.degraded ? 1 : 0,
      next.createdAt,
      next.updatedAt,
      next.startedAt || "",
      next.completedAt || ""
    );
    updateWorkspaceTimeStmt.run(timestamp, next.workspaceId);
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      run: next
    };
  }

  function getRun(runId) {
    return hydrateRun(selectRunStmt.get(String(runId || "")));
  }

  function savePrivateState(input = {}) {
    const timestamp = nowIso();
    const id = stableId(
      "private",
      input.workspaceId || "",
      input.runId || "",
      input.agentId || ""
    );
    insertPrivateStmt.run(
      id,
      String(input.workspaceId || ""),
      String(input.runId || ""),
      String(input.agentId || ""),
      normalizeText(input.summary || "").slice(0, 4000),
      stringifyJson(asObject(input.state)),
      timestamp
    );
    updateWorkspaceTimeStmt.run(timestamp, String(input.workspaceId || ""));
    return hydratePrivateState(db.prepare("SELECT * FROM aw_private_state WHERE id = ?").get(id));
  }

  function submit(input = {}) {
    const payload = asObject(input.payload);
    const type = String(input.type || payload.type || "").trim();
    const evidenceRefs = normalizeEvidenceRefs(input.evidenceRefs, payload);
    const duplicateKey = stableHash(
      type,
      submissionSummary(type, payload).toLowerCase(),
      evidenceRefs.join("|")
    );
    const existingDuplicate = selectDuplicateStmt.get(
      String(input.workspaceId || ""),
      type,
      duplicateKey
    );
    const gate = gateSubmission({
      existingDuplicate,
      submission: {
        type,
        payload,
        evidenceRefs,
        confidence: input.confidence ?? payload.confidence
      },
      writePolicy: asObject(input.writePolicy)
    });
    const timestamp = nowIso();
    const submissionId =
      String(input.submissionId || "").trim() ||
      stableId("submission", input.workspaceId || "", input.runId || "", input.agentId || "", type, duplicateKey, timestamp);
    insertSubmissionStmt.run(
      submissionId,
      String(input.workspaceId || ""),
      String(input.runId || ""),
      String(input.agentId || ""),
      type,
      gate.status,
      gate.confidence,
      duplicateKey,
      stringifyJson(payload),
      stringifyJson(gate.evidenceRefs, []),
      stringifyJson(gate),
      timestamp,
      timestamp
    );
    updateWorkspaceTimeStmt.run(timestamp, String(input.workspaceId || ""));
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      submission: hydrateSubmission(db.prepare("SELECT * FROM aw_submissions WHERE submission_id = ?").get(submissionId))
    };
  }

  function resolveSubmission(input = {}) {
    const submissionId = String(input.submissionId || "").trim();
    const current = hydrateSubmission(selectSubmissionStmt.get(submissionId));
    if (!current) {
      return null;
    }
    if (input.workspaceId && current.workspaceId !== String(input.workspaceId)) {
      return null;
    }
    const allowed = new Set(["accepted", "rejected", "needs_review", "proposed"]);
    const rawStatus = String(input.status || input.action || "").trim();
    const rawResolution = String(input.resolution || "").trim();
    const normalizedDecision = (rawStatus || rawResolution).toLowerCase();
    const status = allowed.has(rawStatus)
      ? rawStatus
      : ["accept", "accepted", "approve", "approved"].includes(normalizedDecision)
        ? "accepted"
        : ["reject", "rejected", "deny", "denied"].includes(normalizedDecision)
          ? "rejected"
          : "needs_review";
    const timestamp = nowIso();
    const gate = {
      ...(current.gate || {}),
      reviewedRequired: status === "needs_review",
      resolvedBy: String(input.reviewerId || input.agentId || input.clientId || ""),
      resolvedAt: timestamp,
      resolutionNote: normalizeText(input.note || input.reason || "").slice(0, 1000),
      previousStatus: current.status
    };
    updateSubmissionStatusStmt.run(status, stringifyJson(gate), timestamp, submissionId);
    updateWorkspaceTimeStmt.run(timestamp, current.workspaceId);
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      submission: hydrateSubmission(selectSubmissionStmt.get(submissionId))
    };
  }

  function createArtifact(input = {}) {
    const timestamp = nowIso();
    const runId = String(input.runId || "");
    const artifactId =
      String(input.artifactId || "").trim() ||
      stableId("artifact", input.workspaceId || "", runId, input.level || "", input.title || "", timestamp);
    const current = db.prepare("SELECT * FROM aw_artifacts WHERE artifact_id = ?").get(artifactId);
    const revision = current ? Number(current.revision || 1) + 1 : Number(input.revision || 1);
    insertArtifactStmt.run(
      artifactId,
      String(input.workspaceId || ""),
      runId,
      String(input.level || "Artifact"),
      normalizeText(input.title || "Untitled Artifact") || "Untitled Artifact",
      String(input.content || ""),
      stringifyJson(asArray(input.citations), []),
      stringifyJson(asObject(input.coverageReport || input.coverage), {}),
      revision,
      String(input.status || "draft"),
      String(input.createdBy || input.agentId || ""),
      input.createdAt || timestamp,
      timestamp
    );
    const run = getRun(runId);
    if (run) {
      updateRun(runId, {
        artifactIds: [...new Set([...run.artifactIds, artifactId])]
      });
    }
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      artifact: hydrateArtifact(db.prepare("SELECT * FROM aw_artifacts WHERE artifact_id = ?").get(artifactId))
    };
  }

  function updateArtifactsStatus(runId, status) {
    const timestamp = nowIso();
    db.prepare("UPDATE aw_artifacts SET status = ?, updated_at = ? WHERE run_id = ?").run(
      String(status || "draft"),
      timestamp,
      String(runId || "")
    );
    return listRunArtifacts(runId);
  }

  function createIssue(input = {}) {
    const timestamp = nowIso();
    const issueId =
      String(input.issueId || "").trim() ||
      stableId("issue", input.workspaceId || "", input.runId || "", input.title || "", timestamp);
    insertIssueStmt.run(
      issueId,
      String(input.workspaceId || ""),
      String(input.runId || ""),
      String(input.type || "issue"),
      String(input.status || "open"),
      String(input.severity || "medium"),
      normalizeText(input.title || "Workspace issue") || "Workspace issue",
      stringifyJson(asObject(input.payload)),
      stringifyJson(normalizeEvidenceRefs(input.evidenceRefs, asObject(input.payload)), []),
      String(input.createdBy || input.agentId || ""),
      input.createdAt || timestamp,
      timestamp
    );
    updateWorkspaceTimeStmt.run(timestamp, String(input.workspaceId || ""));
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      issue: hydrateIssue(db.prepare("SELECT * FROM aw_issues WHERE issue_id = ?").get(issueId))
    };
  }

  function updateIssue(input = {}) {
    const issueId = String(input.issueId || "").trim();
    const current = hydrateIssue(selectIssueStmt.get(issueId));
    if (!current) {
      return null;
    }
    if (input.workspaceId && current.workspaceId !== String(input.workspaceId)) {
      return null;
    }
    const rawStatus = String(input.status || input.action || "resolved").trim() || "resolved";
    const status = rawStatus === "resolve"
      ? "resolved"
      : rawStatus === "reject"
        ? "rejected"
        : rawStatus === "reopen"
          ? "open"
          : rawStatus;
    const timestamp = nowIso();
    const payload = {
      ...(current.payload || {}),
      resolution: {
        action: status,
        note: normalizeText(input.note || input.reason || "").slice(0, 1000),
        resolvedBy: String(input.reviewerId || input.agentId || input.clientId || ""),
        resolvedAt: timestamp
      }
    };
    updateIssueStatusStmt.run(status, stringifyJson(payload), timestamp, issueId);
    updateWorkspaceTimeStmt.run(timestamp, current.workspaceId);
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      issue: hydrateIssue(selectIssueStmt.get(issueId))
    };
  }

  function createDecision(input = {}) {
    const timestamp = nowIso();
    const decisionId =
      String(input.decisionId || "").trim() ||
      stableId("decision", input.workspaceId || "", input.runId || "", input.title || "", timestamp);
    insertDecisionStmt.run(
      decisionId,
      String(input.workspaceId || ""),
      String(input.runId || ""),
      String(input.status || "proposed"),
      normalizeText(input.title || "Decision proposal") || "Decision proposal",
      stringifyJson(asObject(input.payload)),
      String(input.createdBy || input.agentId || ""),
      input.createdAt || timestamp,
      timestamp
    );
    updateWorkspaceTimeStmt.run(timestamp, String(input.workspaceId || ""));
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      decision: hydrateDecision(db.prepare("SELECT * FROM aw_decisions WHERE decision_id = ?").get(decisionId))
    };
  }

  function listRunArtifacts(runId) {
    return db.prepare("SELECT * FROM aw_artifacts WHERE run_id = ? ORDER BY updated_at DESC").all(String(runId || "")).map(hydrateArtifact);
  }

  function cleanupExpiredLocks() {
    deleteExpiredLocksStmt.run(nowIso());
  }

  function acquireLock(input = {}) {
    cleanupExpiredLocks();
    const workspaceId = String(input.workspaceId || "");
    const targetType = String(input.targetType || input.type || "").trim();
    const targetId = String(input.targetId || input.id || "").trim();
    const ownerAgentId = String(input.ownerAgentId || input.agentId || "").trim();
    if (!workspaceId || !targetType || !targetId || !ownerAgentId) {
      return {
        protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
        ok: false,
        error: "missing_lock_fields"
      };
    }
    const existing = hydrateLock(selectTargetLockStmt.get(workspaceId, targetType, targetId));
    if (existing && existing.ownerAgentId !== ownerAgentId && existing.expiresAt > nowIso()) {
      return {
        protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
        ok: false,
        error: "lock_held",
        lock: existing
      };
    }
    const timestamp = nowIso();
    const ttlMs = Math.max(1000, Math.min(Number(input.ttlMs || 5 * 60 * 1000), 24 * 60 * 60 * 1000));
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    const lockId =
      String(input.lockId || "").trim() ||
      existing?.lockId ||
      stableId("lock", workspaceId, targetType, targetId, ownerAgentId);
    insertLockStmt.run(lockId, workspaceId, targetType, targetId, ownerAgentId, expiresAt, timestamp);
    updateWorkspaceTimeStmt.run(timestamp, workspaceId);
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      ok: true,
      lock: hydrateLock(selectLockStmt.get(lockId))
    };
  }

  function releaseLock(input = {}) {
    cleanupExpiredLocks();
    const workspaceId = String(input.workspaceId || "");
    const lockId = String(input.lockId || "").trim();
    const targetType = String(input.targetType || input.type || "").trim();
    const targetId = String(input.targetId || input.id || "").trim();
    const ownerAgentId = String(input.ownerAgentId || input.agentId || "").trim();
    const current = lockId
      ? hydrateLock(selectLockStmt.get(lockId))
      : hydrateLock(selectTargetLockStmt.get(workspaceId, targetType, targetId));
    if (!current) {
      return {
        protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
        ok: true,
        released: false
      };
    }
    if (!input.force && ownerAgentId && current.ownerAgentId !== ownerAgentId) {
      return {
        protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
        ok: false,
        released: false,
        error: "lock_owner_mismatch",
        lock: current
      };
    }
    deleteLockStmt.run(current.lockId);
    updateWorkspaceTimeStmt.run(nowIso(), current.workspaceId);
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      ok: true,
      released: true,
      lock: current
    };
  }

  function listLocks(input = {}) {
    if (!input.includeExpired) {
      cleanupExpiredLocks();
    }
    const workspaceId = String(input.workspaceId || "");
    const limit = Math.max(1, Math.min(Number(input.limit || 100), 500));
    const rows = input.includeExpired
      ? db.prepare("SELECT * FROM aw_locks WHERE workspace_id = ? ORDER BY expires_at ASC LIMIT ?").all(workspaceId, limit)
      : db.prepare("SELECT * FROM aw_locks WHERE workspace_id = ? AND expires_at > ? ORDER BY expires_at ASC LIMIT ?").all(workspaceId, nowIso(), limit);
    return rows.map(hydrateLock);
  }

  function getWorkspace(input = {}) {
    const workspaceId = typeof input === "string" ? input : input.workspaceId;
    const workspace = hydrateWorkspace(selectWorkspaceStmt.get(String(workspaceId || "")));
    if (!workspace) {
      return null;
    }
    const queryRows = (baseSql, params, limitValue) => {
      const limit = optionalLimit(limitValue);
      return limit
        ? db.prepare(`${baseSql} LIMIT ?`).all(...params, limit)
        : db.prepare(baseSql).all(...params);
    };
    const includeRuns = input.includeRuns !== false;
    const includeRunDetails = input.includeRunDetails !== false;
    const runSql = includeRunDetails
      ? "SELECT * FROM aw_runs WHERE workspace_id = ? ORDER BY updated_at DESC"
      : `
        SELECT
          run_id, workspace_id, run_type, status, input_json,
          '[]' AS steps_json, '{}' AS coverage_json, artifact_ids_json,
          error, degraded, created_at, updated_at, started_at, completed_at
        FROM aw_runs
        WHERE workspace_id = ?
        ORDER BY updated_at DESC
      `;
    const runs = includeRuns
      ? queryRows(runSql, [workspace.workspaceId], input.runLimit)
          .map((row) => hydrateRun(row, { includeDetails: includeRunDetails }))
      : [];
    const submissions = input.includeSubmissions === false
      ? []
      : queryRows(
          "SELECT * FROM aw_submissions WHERE workspace_id = ? ORDER BY updated_at DESC",
          [workspace.workspaceId],
          input.submissionLimit
        ).map(hydrateSubmission);
    const artifacts = input.includeArtifacts === false
      ? []
      : queryRows(
          "SELECT * FROM aw_artifacts WHERE workspace_id = ? ORDER BY updated_at DESC",
          [workspace.workspaceId],
          input.artifactLimit
        ).map(hydrateArtifact);
    const issues = input.includeIssues === false
      ? []
      : queryRows(
          "SELECT * FROM aw_issues WHERE workspace_id = ? ORDER BY updated_at DESC",
          [workspace.workspaceId],
          input.issueLimit
        ).map(hydrateIssue);
    const decisions = input.includeDecisions === false
      ? []
      : queryRows(
          "SELECT * FROM aw_decisions WHERE workspace_id = ? ORDER BY updated_at DESC",
          [workspace.workspaceId],
          input.decisionLimit
        ).map(hydrateDecision);
    const locks = input.includeLocks === false ? [] : listLocks({
      workspaceId: workspace.workspaceId,
      includeExpired: Boolean(input.includeExpiredLocks),
      limit: 100
    });
    const privateStates = input.includePrivate
      ? queryRows(
          "SELECT * FROM aw_private_state WHERE workspace_id = ? ORDER BY updated_at DESC",
          [workspace.workspaceId],
          input.privateStateLimit
        ).map(hydratePrivateState)
      : [];
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      workspace,
      runs,
      submissions,
      artifacts,
      issues,
      decisions,
      locks,
      privateStates,
      summary: workspaceSummary(workspace.workspaceId)
    };
  }

  function close() {
    db.close();
  }

  return {
    protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
    rootPath,
    createWorkspace,
    listWorkspaces,
    getWorkspace,
    createRun,
    updateRun,
    getRun,
    savePrivateState,
    submit,
    resolveSubmission,
    createArtifact,
    updateArtifactsStatus,
    createIssue,
    updateIssue,
    createDecision,
    listRunArtifacts,
    acquireLock,
    releaseLock,
    listLocks,
    close
  };
}

export default createAgentWorkspace;
