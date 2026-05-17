import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import Database from "better-sqlite3";

export const AGENT_WORKSPACE_PROTOCOL_VERSION = "splitall.agent-workspace.v1";
export const AGENT_WORKSPACE_CONTEXT_BUNDLE_VERSION = "splitall.workspace-context-bundle.v1";

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

function boundedInteger(value, fallback, min = 0, max = 1000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function truncateText(value, maxChars = 800) {
  const text = normalizeText(value);
  const limit = boundedInteger(maxChars, 800, 0, 10000);
  if (limit <= 0 || text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 15))}...<truncated>`;
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

function compactWorkspaceLayer(workspace = {}) {
  return {
    workspaceId: workspace.workspaceId,
    ownerUserId: workspace.ownerUserId || "",
    title: workspace.title,
    objective: truncateText(workspace.objective, 500),
    status: workspace.status,
    parentWorkspaceId: workspace.parentWorkspaceId || null,
    profile: workspace.profile || {},
    ownedSourceIds: asArray(workspace.ownedSourceIds),
    accessibleWorkspaceIds: asArray(workspace.accessibleWorkspaceIds),
    currentGeneration: Number(workspace.currentGeneration || 0),
    updatedAt: workspace.updatedAt || ""
  };
}

function compactRun(run = {}) {
  return {
    runId: run.runId,
    runType: run.runType,
    status: run.status,
    degraded: Boolean(run.degraded),
    artifactIds: asArray(run.artifactIds),
    error: truncateText(run.error, 500),
    startedAt: run.startedAt || "",
    completedAt: run.completedAt || "",
    updatedAt: run.updatedAt || ""
  };
}

function compactSubmission(submission = {}) {
  const payload = asObject(submission.payload);
  return {
    submissionId: submission.submissionId,
    runId: submission.runId,
    agentId: submission.agentId,
    type: submission.type,
    status: submission.status,
    confidence: Number(submission.confidence || 0),
    summary: submissionSummary(submission.type, payload),
    evidenceRefs: asArray(submission.evidenceRefs),
    gateReasons: asArray(submission.gate?.reasons),
    updatedAt: submission.updatedAt || ""
  };
}

function compactArtifact(artifact = {}, options = {}) {
  return {
    artifactId: artifact.artifactId,
    runId: artifact.runId,
    level: artifact.level,
    title: artifact.title,
    status: artifact.status,
    revision: Number(artifact.revision || 0),
    contentPreview: truncateText(artifact.content, options.contentPreviewChars),
    citations: asArray(artifact.citations),
    coverageKeys: Object.keys(asObject(artifact.coverageReport)),
    updatedAt: artifact.updatedAt || ""
  };
}

function compactIssue(issue = {}) {
  return {
    issueId: issue.issueId,
    runId: issue.runId,
    type: issue.type,
    status: issue.status,
    severity: issue.severity,
    title: issue.title,
    evidenceRefs: asArray(issue.evidenceRefs),
    updatedAt: issue.updatedAt || ""
  };
}

function compactDecision(decision = {}) {
  return {
    decisionId: decision.decisionId,
    runId: decision.runId,
    status: decision.status,
    title: decision.title,
    payloadKeys: Object.keys(asObject(decision.payload)),
    updatedAt: decision.updatedAt || ""
  };
}

function compactPrivateState(privateState = {}) {
  return {
    id: privateState.id,
    runId: privateState.runId,
    agentId: privateState.agentId,
    summary: truncateText(privateState.summary, 800),
    stateKeys: Object.keys(asObject(privateState.state)),
    updatedAt: privateState.updatedAt || ""
  };
}

function buildWorkspaceHandoffMarkdown(bundle = {}) {
  const context = bundle.context || {};
  const summary = bundle.summary || {};
  const recent = bundle.recent || {};
  const lines = [
    "# Workspace Context Bundle",
    `workspaceId: ${bundle.workspace?.workspaceId || ""}`,
    `generation: ${context.currentGeneration || 0}`,
    `contextFingerprint: ${context.contextFingerprint || ""}`,
    `contextProfileId: ${context.contextProfileId || ""}`,
    `modelAlias: ${context.modelAlias || ""}`,
    `toolGrantId: ${context.toolGrantId || ""}`,
    `knowledgeSourceCount: ${asArray(context.knowledgeSourceIds).length}`,
    `chain: ${asArray(context.chainGenerations).map((item) => `${item.workspaceId}@${item.generation}`).join(" -> ")}`,
    "",
    "## Summary",
    `runs: ${summary.runCount || 0}`,
    `submissions: ${summary.submissionCount || 0}`,
    `acceptedSubmissions: ${summary.acceptedSubmissionCount || 0}`,
    `openIssues: ${summary.openIssueCount || 0}`,
    `artifacts: ${summary.artifactCount || 0}`,
    "",
    "## Recent Runs",
    ...asArray(recent.runs).map((run) => `- ${run.runId} ${run.runType} ${run.status}`),
    "",
    "## Recent Artifacts",
    ...asArray(recent.artifacts).map((artifact) => `- ${artifact.artifactId} ${artifact.status} ${artifact.title}`),
    "",
    "## Open Issues",
    ...asArray(recent.issues)
      .filter((issue) => issue.status !== "resolved")
      .map((issue) => `- ${issue.issueId} ${issue.severity} ${issue.title}`)
  ];
  return lines.join("\n");
}

function decodeWorkspaceContextBundle(input = {}) {
  const payload = asObject(input.contextBundle || input.context_bundle || input);
  if (payload.bundle?.bundleVersion === AGENT_WORKSPACE_CONTEXT_BUNDLE_VERSION) {
    return payload.bundle;
  }
  if (payload.bundleVersion === AGENT_WORKSPACE_CONTEXT_BUNDLE_VERSION && payload.context) {
    return payload;
  }
  const compressed = asObject(
    payload.compressed ||
      payload.compressedBundle ||
      payload.bundleCompressed ||
      payload.contextBundleCompressed
  );
  const encoded = String(compressed.payload || payload.payload || "").trim();
  const encoding = String(compressed.encoding || payload.encoding || "").trim().toLowerCase();
  if (!encoded) {
    throw new Error("缺少工作空间上下文压缩包。");
  }
  if (!["gzip+base64", "base64+gzip"].includes(encoding)) {
    throw new Error("工作空间上下文压缩包编码不受支持。");
  }
  const jsonText = gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
  return JSON.parse(jsonText);
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
    ownerUserId: row.owner_user_id || "",
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Inheritance & profile fields (populated after schema evolution)
    parentWorkspaceId: row.parent_workspace_id || null,
    profile: parseJson(row.profile_json, {}),
    ownedSourceIds: parseJson(row.owned_source_ids_json, []),
    accessibleWorkspaceIds: parseJson(row.accessible_workspace_ids_json, []),
    currentGeneration: Number(row.current_generation || 1),
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

  // ── Schema evolution: add inheritance + profile + sharing columns ──────────
  // These run once on startup and are idempotent.
  [
    ["parent_workspace_id",          "TEXT"],
    ["profile_json",                 "TEXT NOT NULL DEFAULT '{}'"],
    ["owned_source_ids_json",        "TEXT NOT NULL DEFAULT '[]'"],
    ["accessible_workspace_ids_json","TEXT NOT NULL DEFAULT '[]'"],
    ["current_generation",           "INTEGER NOT NULL DEFAULT 1"],
    ["owner_user_id",                "TEXT NOT NULL DEFAULT ''"],
  ].forEach(([col, def]) => {
    const exists = db.prepare(`PRAGMA table_info(aw_workspaces)`).all().some((c) => c.name === col);
    if (!exists) db.exec(`ALTER TABLE aw_workspaces ADD COLUMN ${col} ${def}`);
  });
  // Create index on parent_workspace_id AFTER the column is guaranteed to exist
  db.exec("CREATE INDEX IF NOT EXISTS idx_aw_workspaces_parent ON aw_workspaces(parent_workspace_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_aw_workspaces_owner ON aw_workspaces(owner_user_id, updated_at DESC)");

  const insertWorkspaceStmt = db.prepare(`
    INSERT OR REPLACE INTO aw_workspaces (
      workspace_id, title, objective, status, owner_user_id, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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

  function workspaceAccess(input = {}) {
    return {
      actorUserId: String(input.actorUserId || input.userId || "").trim(),
      canAccessAll: input.canAccessAll === true || input.includeAllOwners === true
    };
  }

  function canAccessWorkspace(workspace, input = {}) {
    if (!workspace) {
      return false;
    }
    const { actorUserId, canAccessAll } = workspaceAccess(input);
    const ownerUserId = String(workspace.ownerUserId || workspace.owner_user_id || "").trim();
    return canAccessAll || !actorUserId || !ownerUserId || ownerUserId === actorUserId;
  }

  function canAccessWorkspaceId(workspaceId, input = {}) {
    const workspace = hydrateWorkspace(selectWorkspaceStmt.get(String(workspaceId || "")));
    return canAccessWorkspace(workspace, input);
  }

  function listWorkspaces(input = {}) {
    const limit = Math.max(1, Math.min(Number(input.limit || 50), 500));
    const status = String(input.status || "").trim();
    const includeSummary = input.includeSummary !== false;
    const access = workspaceAccess(input);
    let rows;
    if (access.actorUserId && !access.canAccessAll) {
      rows = status
        ? db.prepare(`
            SELECT * FROM aw_workspaces
            WHERE status = ? AND (owner_user_id = '' OR owner_user_id = ?)
            ORDER BY updated_at DESC
            LIMIT ?
          `).all(status, access.actorUserId, limit)
        : db.prepare(`
            SELECT * FROM aw_workspaces
            WHERE owner_user_id = '' OR owner_user_id = ?
            ORDER BY updated_at DESC
            LIMIT ?
          `).all(access.actorUserId, limit);
    } else {
      rows = status
        ? listWorkspacesByStatusStmt.all(status, limit)
        : listWorkspacesStmt.all(limit);
    }
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
      ownerUserId: String(input.ownerUserId || input.owner_user_id || input.userId || "").trim(),
      metadata: asObject(input.metadata),
      createdAt: input.createdAt || timestamp,
      updatedAt: timestamp
    };
    insertWorkspaceStmt.run(
      workspace.workspaceId,
      workspace.title,
      workspace.objective,
      workspace.status,
      workspace.ownerUserId,
      stringifyJson(workspace.metadata),
      workspace.createdAt,
      workspace.updatedAt
    );
    // Re-read from DB to capture new columns (profile, ownedSourceIds, etc.)
    const persisted = hydrateWorkspace(selectWorkspaceStmt.get(workspace.workspaceId)) || workspace;
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      workspace: persisted
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
    if (!canAccessWorkspaceId(current.workspaceId, input)) {
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
    if (!canAccessWorkspaceId(current.workspaceId, input)) {
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
    if (workspaceId && !canAccessWorkspaceId(workspaceId, input)) {
      return {
        protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
        ok: false,
        error: "workspace_forbidden"
      };
    }
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
    // M-6: cap lock TTL at 30 minutes to prevent agent lock starvation
    const ttlMs = Math.max(1000, Math.min(Number(input.ttlMs || 5 * 60 * 1000), 30 * 60 * 1000));
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
    if (!canAccessWorkspaceId(current.workspaceId, input)) {
      return {
        protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
        ok: false,
        released: false,
        error: "workspace_forbidden"
      };
    }
    // M-7: remove force bypass from public API — ownerAgentId is always enforced here.
    // Privileged force-release is only available via adminReleaseLock().
    if (ownerAgentId && current.ownerAgentId !== ownerAgentId) {
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
    if (!canAccessWorkspaceId(workspaceId, input)) {
      return [];
    }
    const limit = Math.max(1, Math.min(Number(input.limit || 100), 500));
    const rows = input.includeExpired
      ? db.prepare("SELECT * FROM aw_locks WHERE workspace_id = ? ORDER BY expires_at ASC LIMIT ?").all(workspaceId, limit)
      : db.prepare("SELECT * FROM aw_locks WHERE workspace_id = ? AND expires_at > ? ORDER BY expires_at ASC LIMIT ?").all(workspaceId, nowIso(), limit);
    return rows.map(hydrateLock);
  }

  function getWorkspace(input = {}) {
    const options = typeof input === "string" ? { workspaceId: input } : input;
    const workspaceId = options.workspaceId;
    const workspace = hydrateWorkspace(selectWorkspaceStmt.get(String(workspaceId || "")));
    if (!workspace) {
      return null;
    }
    if (!canAccessWorkspace(workspace, options)) {
      return null;
    }
    const queryRows = (baseSql, params, limitValue) => {
      const limit = optionalLimit(limitValue);
      return limit
        ? db.prepare(`${baseSql} LIMIT ?`).all(...params, limit)
        : db.prepare(baseSql).all(...params);
    };
    const includeRuns = options.includeRuns !== false;
    const includeRunDetails = options.includeRunDetails !== false;
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
      ? queryRows(runSql, [workspace.workspaceId], options.runLimit)
          .map((row) => hydrateRun(row, { includeDetails: includeRunDetails }))
      : [];
    const submissions = options.includeSubmissions === false
      ? []
      : queryRows(
          "SELECT * FROM aw_submissions WHERE workspace_id = ? ORDER BY updated_at DESC",
          [workspace.workspaceId],
          options.submissionLimit
        ).map(hydrateSubmission);
    const artifacts = options.includeArtifacts === false
      ? []
      : queryRows(
          "SELECT * FROM aw_artifacts WHERE workspace_id = ? ORDER BY updated_at DESC",
          [workspace.workspaceId],
          options.artifactLimit
        ).map(hydrateArtifact);
    const issues = options.includeIssues === false
      ? []
      : queryRows(
          "SELECT * FROM aw_issues WHERE workspace_id = ? ORDER BY updated_at DESC",
          [workspace.workspaceId],
          options.issueLimit
        ).map(hydrateIssue);
    const decisions = options.includeDecisions === false
      ? []
      : queryRows(
          "SELECT * FROM aw_decisions WHERE workspace_id = ? ORDER BY updated_at DESC",
          [workspace.workspaceId],
          options.decisionLimit
        ).map(hydrateDecision);
    const locks = options.includeLocks === false ? [] : listLocks({
      workspaceId: workspace.workspaceId,
      includeExpired: Boolean(options.includeExpiredLocks),
      limit: 100,
      actorUserId: options.actorUserId,
      canAccessAll: options.canAccessAll
    });
    const privateStates = options.includePrivate
      ? queryRows(
          "SELECT * FROM aw_private_state WHERE workspace_id = ? ORDER BY updated_at DESC",
          [workspace.workspaceId],
          options.privateStateLimit
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

  /**
   * M-7: Force-release a lock regardless of owner, for use by privileged
   * administrative handlers only.  Never expose input.force from request body.
   */
  function adminReleaseLock(input = {}) {
    cleanupExpiredLocks();
    const workspaceId = String(input.workspaceId || "");
    const lockId = String(input.lockId || "").trim();
    const targetType = String(input.targetType || input.type || "").trim();
    const targetId = String(input.targetId || input.id || "").trim();
    const current = lockId
      ? hydrateLock(selectLockStmt.get(lockId))
      : hydrateLock(selectTargetLockStmt.get(workspaceId, targetType, targetId));
    if (!current) {
      return { protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION, ok: true, released: false };
    }
    deleteLockStmt.run(current.lockId);
    updateWorkspaceTimeStmt.run(nowIso(), current.workspaceId);
    return { protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION, ok: true, released: true, lock: current };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Workspace inheritance, profile & knowledge-scope system
  // ═══════════════════════════════════════════════════════════════════════════

  const selectWorkspaceRawStmt = db.prepare("SELECT * FROM aw_workspaces WHERE workspace_id = ?");

  /**
   * Walk the parent chain upward and return an ordered array [root, ..., target].
   * Throws if a cycle is detected.
   */
  function resolveWorkspaceChain(workspaceId, _seen = new Set()) {
    if (_seen.has(workspaceId)) {
      throw new Error(`工作空间继承链存在循环: ${Array.from(_seen).join(" → ")} → ${workspaceId}`);
    }
    _seen.add(workspaceId);
    const row = selectWorkspaceRawStmt.get(workspaceId);
    if (!row) return [];
    const ws = hydrateWorkspace(row);
    const ancestors = ws.parentWorkspaceId
      ? resolveWorkspaceChain(ws.parentWorkspaceId, _seen)
      : [];
    return [...ancestors, ws];
  }

  /**
   * Walk the chain root→target, merge profiles: child overrides parent scalars.
   * knowledgeScope arrays are merged using + / - notation.
   */
  function resolveWorkspaceProfile(workspaceId) {
    const chain = resolveWorkspaceChain(workspaceId);
    let merged = {
      contextProfileId: "",
      toolGrantId: "",
      modelAlias: "",
      knowledgeScope: { includeSourceIds: [], excludeSourceIds: [] }
    };
    for (const ws of chain) {
      const p = ws.profile || {};
      if (p.contextProfileId) merged.contextProfileId = p.contextProfileId;
      if (p.toolGrantId) merged.toolGrantId = p.toolGrantId;
      if (p.modelAlias) merged.modelAlias = p.modelAlias;
      const scope = p.knowledgeScope || {};
      if (Array.isArray(scope.includeSourceIds)) {
        merged.knowledgeScope.includeSourceIds = [
          ...merged.knowledgeScope.includeSourceIds,
          ...scope.includeSourceIds
        ];
      }
      if (Array.isArray(scope.excludeSourceIds)) {
        merged.knowledgeScope.excludeSourceIds = [
          ...merged.knowledgeScope.excludeSourceIds,
          ...scope.excludeSourceIds
        ];
      }
    }
    return merged;
  }

  /**
   * Resolve the final set of knowledge source IDs visible in this workspace,
   * including inherited sources and accessible (shared) workspaces.
   *
   * Algorithm:
   *   1. Walk root→target, accumulate owned sources at each level
   *   2. Apply include/exclude from each profile layer
   *   3. Add sources from directly accessible workspaces
   *
   * @returns {string[]} distinct source IDs
   */
  function resolveWorkspaceSourceIds(workspaceId, _visited = new Set()) {
    if (_visited.has(workspaceId)) return [];  // break cycles in shared graph
    _visited.add(workspaceId);

    const chain = resolveWorkspaceChain(workspaceId);
    const sourceSet = new Set();
    const excludeSet = new Set();

    for (const ws of chain) {
      // Add each level's owned sources
      for (const id of ws.ownedSourceIds) sourceSet.add(id);
      // Apply explicit include/exclude in the profile at this level
      const scope = (ws.profile || {}).knowledgeScope || {};
      for (const id of (scope.includeSourceIds || [])) sourceSet.add(id);
      for (const id of (scope.excludeSourceIds || [])) excludeSet.add(id);
    }

    // Remove explicitly excluded
    for (const id of excludeSet) sourceSet.delete(id);

    // Add sources from accessible (shared) workspaces
    const target = chain[chain.length - 1];
    if (target) {
      for (const sharedId of target.accessibleWorkspaceIds) {
        for (const id of resolveWorkspaceSourceIds(sharedId, _visited)) {
          sourceSet.add(id);
        }
      }
    }

    return Array.from(sourceSet);
  }

  /**
   * Return the fully-resolved runtime context for an agent operating in this workspace.
   * This is the single call an agent needs to set up its knowledge scope, context,
   * tool grant, and model routing.
   */
  function getWorkspaceContext(workspaceId, options = {}) {
    const targetRow = selectWorkspaceRawStmt.get(String(workspaceId || ""));
    if (!canAccessWorkspace(hydrateWorkspace(targetRow), options)) {
      return null;
    }
    const chain = resolveWorkspaceChain(workspaceId);
    if (chain.length === 0) return null;
    const profile = resolveWorkspaceProfile(workspaceId);
    const sourceIds = resolveWorkspaceSourceIds(workspaceId);
    const target = chain[chain.length - 1];
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      workspaceId,
      currentGeneration: target.currentGeneration,
      chainGenerations: chain.map((ws) => ({
        workspaceId: ws.workspaceId,
        generation: ws.currentGeneration
      })),
      contextFingerprint: stableHash(
        "workspace-context",
        chain.map((ws) => `${ws.workspaceId}:${ws.currentGeneration}`).join("|"),
        stringifyJson(profile),
        sourceIds.join("|")
      ),
      inheritanceChain: chain.map((ws) => ({
        workspaceId: ws.workspaceId,
        title: ws.title,
      })),
      knowledgeSourceIds: sourceIds,         // pass to knowledge-core search
      contextProfileId: profile.contextProfileId,
      toolGrantId: profile.toolGrantId,
      modelAlias: profile.modelAlias,
    };
  }

  function exportWorkspaceContextBundle(workspaceId, options = {}) {
    const context = getWorkspaceContext(workspaceId, options);
    if (!context) {
      return null;
    }
    const includePrivate = options.includePrivate === true;
    const includeBundle = options.includeBundle !== false;
    const compress = options.compress !== false;
    const maxItems = boundedInteger(options.maxItems, 12, 1, 100);
    const contentPreviewChars = boundedInteger(options.contentPreviewChars, 600, 0, 4000);
    const snapshot = getWorkspace({
      workspaceId,
      actorUserId: options.actorUserId,
      canAccessAll: options.canAccessAll,
      includePrivate,
      includeRunDetails: false,
      runLimit: maxItems,
      submissionLimit: maxItems,
      artifactLimit: maxItems,
      issueLimit: maxItems,
      decisionLimit: maxItems,
      privateStateLimit: includePrivate ? maxItems : 0
    });
    if (!snapshot) {
      return null;
    }
    const chain = resolveWorkspaceChain(workspaceId);
    const bundle = {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      bundleVersion: AGENT_WORKSPACE_CONTEXT_BUNDLE_VERSION,
      generatedAt: nowIso(),
      workspace: compactWorkspaceLayer(snapshot.workspace),
      summary: snapshot.summary || {},
      context,
      resolvedProfile: resolveWorkspaceProfile(workspaceId),
      inheritanceChain: chain.map(compactWorkspaceLayer),
      options: {
        includePrivate,
        maxItems,
        contentPreviewChars
      },
      recent: {
        runs: asArray(snapshot.runs).slice(0, maxItems).map(compactRun),
        submissions: asArray(snapshot.submissions).slice(0, maxItems).map(compactSubmission),
        artifacts: asArray(snapshot.artifacts)
          .slice(0, maxItems)
          .map((artifact) => compactArtifact(artifact, { contentPreviewChars })),
        issues: asArray(snapshot.issues).slice(0, maxItems).map(compactIssue),
        decisions: asArray(snapshot.decisions).slice(0, maxItems).map(compactDecision),
        privateStates: includePrivate
          ? asArray(snapshot.privateStates).slice(0, maxItems).map(compactPrivateState)
          : []
      }
    };
    bundle.handoffMarkdown = buildWorkspaceHandoffMarkdown(bundle);

    const jsonText = stableJson(bundle);
    const uncompressedBytes = Buffer.byteLength(jsonText, "utf8");
    const compressedBuffer = compress ? gzipSync(Buffer.from(jsonText, "utf8")) : null;
    const compressedBytes = compressedBuffer?.length || 0;
    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      bundleVersion: AGENT_WORKSPACE_CONTEXT_BUNDLE_VERSION,
      workspaceId,
      generatedAt: bundle.generatedAt,
      currentGeneration: context.currentGeneration,
      contextFingerprint: context.contextFingerprint,
      bundleHash: stableHash("workspace-context-bundle", jsonText),
      restoreEvidence: {
        chainGenerations: context.chainGenerations,
        knowledgeSourceCount: asArray(context.knowledgeSourceIds).length,
        runCount: asArray(bundle.recent.runs).length,
        submissionCount: asArray(bundle.recent.submissions).length,
        artifactCount: asArray(bundle.recent.artifacts).length,
        issueCount: asArray(bundle.recent.issues).length,
        privateStateCount: asArray(bundle.recent.privateStates).length
      },
      compression: {
        algorithm: compress ? "gzip" : "none",
        uncompressedBytes,
        compressedBytes,
        ratio: compress && uncompressedBytes > 0
          ? Number((compressedBytes / uncompressedBytes).toFixed(4))
          : 1
      },
      compressed: compressedBuffer
        ? {
            encoding: "gzip+base64",
            payload: compressedBuffer.toString("base64")
          }
        : null,
      bundle: includeBundle ? bundle : undefined
    };
  }

  function restoreWorkspaceContextBundle(workspaceId, input = {}, options = {}) {
    const targetWorkspaceId = String(workspaceId || input.workspaceId || input.targetWorkspaceId || "").trim();
    const targetRow = selectWorkspaceRawStmt.get(targetWorkspaceId);
    if (!targetRow) {
      return { ok: false, error: "工作空间不存在" };
    }
    if (!canAccessWorkspace(hydrateWorkspace(targetRow), options)) {
      return { ok: false, error: "工作空间不可访问" };
    }

    let bundle;
    try {
      bundle = decodeWorkspaceContextBundle(input);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "工作空间上下文压缩包解析失败。"
      };
    }
    if (bundle?.bundleVersion !== AGENT_WORKSPACE_CONTEXT_BUNDLE_VERSION) {
      return { ok: false, error: "工作空间上下文压缩包版本不匹配。" };
    }

    const bundleHash = stableHash("workspace-context-bundle", stableJson(bundle));
    const expectedHash = String(
      input.bundleHash ||
        input.expectedBundleHash ||
        input.contextBundle?.bundleHash ||
        input.context_bundle?.bundleHash ||
        ""
    ).trim();
    if (expectedHash && expectedHash !== bundleHash) {
      return { ok: false, error: "工作空间上下文压缩包 hash 校验失败。" };
    }

    const context = asObject(bundle.context);
    const resolvedProfile = asObject(bundle.resolvedProfile);
    const profileKnowledgeScope = asObject(resolvedProfile.knowledgeScope);
    const restoredSourceIds = asArray(context.knowledgeSourceIds).length
      ? asArray(context.knowledgeSourceIds)
      : asArray(profileKnowledgeScope.includeSourceIds);
    const profilePatch = {
      ...resolvedProfile,
      contextProfileId: context.contextProfileId || resolvedProfile.contextProfileId || "",
      toolGrantId: context.toolGrantId || resolvedProfile.toolGrantId || "",
      modelAlias: context.modelAlias || resolvedProfile.modelAlias || "",
      knowledgeScope: {
        ...profileKnowledgeScope,
        includeSourceIds: restoredSourceIds,
        excludeSourceIds: asArray(profileKnowledgeScope.excludeSourceIds)
      }
    };
    const swapResult = hotSwapProfile(targetWorkspaceId, profilePatch, options);
    if (!swapResult.ok) {
      return swapResult;
    }

    const sourceWorkspace = asObject(bundle.workspace);
    const timestamp = nowIso();
    const runId = stableId("context_restore_run", targetWorkspaceId, bundleHash);
    const artifactId = stableId("context_restore_artifact", targetWorkspaceId, bundleHash);
    createRun({
      runId,
      workspaceId: targetWorkspaceId,
      runType: "context_bundle_restore",
      status: "completed",
      input: {
        sourceWorkspaceId: sourceWorkspace.workspaceId || context.workspaceId || "",
        sourceContextFingerprint: context.contextFingerprint || "",
        bundleHash
      },
      steps: [
        {
          id: "decode",
          status: "completed",
          at: timestamp
        },
        {
          id: "apply_profile",
          status: "completed",
          at: timestamp
        }
      ],
      coverage: {
        restoredProfile: Boolean(profilePatch.contextProfileId || profilePatch.modelAlias || profilePatch.toolGrantId),
        restoredKnowledgeSourceCount: restoredSourceIds.length,
        restoredArtifactCount: asArray(bundle.recent?.artifacts).length,
        restoredRunCount: asArray(bundle.recent?.runs).length
      },
      artifactIds: [artifactId],
      startedAt: timestamp,
      completedAt: timestamp
    });
    const handoffMarkdown = normalizeText(bundle.handoffMarkdown)
      ? bundle.handoffMarkdown
      : buildWorkspaceHandoffMarkdown(bundle);
    createArtifact({
      artifactId,
      workspaceId: targetWorkspaceId,
      runId,
      level: "ContextBundleHandoff",
      title: `Restored context bundle: ${sourceWorkspace.title || sourceWorkspace.workspaceId || "workspace"}`,
      content: handoffMarkdown,
      citations: [],
      coverageReport: {
        bundleHash,
        sourceWorkspaceId: sourceWorkspace.workspaceId || context.workspaceId || "",
        sourceContextFingerprint: context.contextFingerprint || "",
        restoredKnowledgeSourceCount: restoredSourceIds.length
      },
      status: "accepted",
      createdBy: String(options.actorUserId || "context-bundle-restore")
    });

    return {
      protocolVersion: AGENT_WORKSPACE_PROTOCOL_VERSION,
      bundleVersion: AGENT_WORKSPACE_CONTEXT_BUNDLE_VERSION,
      ok: true,
      workspace: hydrateWorkspace(selectWorkspaceRawStmt.get(targetWorkspaceId)),
      restoredContext: getWorkspaceContext(targetWorkspaceId, options),
      source: {
        workspaceId: sourceWorkspace.workspaceId || context.workspaceId || "",
        contextFingerprint: context.contextFingerprint || "",
        generatedAt: bundle.generatedAt || ""
      },
      bundleHash,
      runId,
      artifactId,
      applied: {
        contextProfileId: profilePatch.contextProfileId,
        toolGrantId: profilePatch.toolGrantId,
        modelAlias: profilePatch.modelAlias,
        knowledgeSourceCount: restoredSourceIds.length
      }
    };
  }

  // ── Inheritance management ─────────────────────────────────────────────────

  /**
   * Set or clear a workspace's parent (inheritance). Validates no cycles.
   * @param {string} childId
   * @param {string|null} parentId  null = remove inheritance
   */
  function setWorkspaceParent(childId, parentId, options = {}) {
    if (!selectWorkspaceRawStmt.get(childId)) {
      return { ok: false, error: "子工作空间不存在" };
    }
    if (!canAccessWorkspaceId(childId, options)) {
      return { ok: false, error: "工作空间不可访问" };
    }
    if (parentId) {
      if (!selectWorkspaceRawStmt.get(parentId)) {
        return { ok: false, error: "父工作空间不存在" };
      }
      if (!canAccessWorkspaceId(parentId, options)) {
        return { ok: false, error: "父工作空间不可访问" };
      }
      // Cycle detection: parentId must not be in childId's existing subtree
      try {
        resolveWorkspaceChain(parentId);  // will throw if parentId already descends from childId
      } catch {
        return { ok: false, error: "设置会导致继承链循环" };
      }
      // Also check: childId must not be an ancestor of parentId
      const chainOfParent = resolveWorkspaceChain(parentId);
      if (chainOfParent.some((ws) => ws.workspaceId === childId)) {
        return { ok: false, error: "设置会导致继承链循环" };
      }
    }
    const ts = nowIso();
    db.prepare(
      "UPDATE aw_workspaces SET parent_workspace_id = ?, current_generation = current_generation + 1, updated_at = ? WHERE workspace_id = ?"
    ).run(parentId || null, ts, childId);
    return { ok: true, workspace: hydrateWorkspace(selectWorkspaceRawStmt.get(childId)) };
  }

  // ── Profile / hot-swap ────────────────────────────────────────────────────

  /**
   * Update a workspace's profile layer and increment currentGeneration.
   * In-flight agents that already have a context snapshot will finish with the
   * old configuration.  New calls to getWorkspaceContext() will see the new profile.
   *
   * @param {string} workspaceId
   * @param {object} profilePatch  Partial profile; only declared fields are overwritten.
   * @returns {{ ok: boolean, workspace, newGeneration }}
   */
  function hotSwapProfile(workspaceId, profilePatch, options = {}) {
    const row = selectWorkspaceRawStmt.get(workspaceId);
    if (!row) return { ok: false, error: "工作空间不存在" };
    if (!canAccessWorkspace(hydrateWorkspace(row), options)) {
      return { ok: false, error: "工作空间不可访问" };
    }
    const existing = hydrateWorkspace(row);
    const existingProfile = existing.profile || {};

    // Deep-merge the profile patch
    const newProfile = {
      ...existingProfile,
      ...profilePatch,
      knowledgeScope: {
        ...(existingProfile.knowledgeScope || {}),
        ...(profilePatch.knowledgeScope || {}),
      }
    };

    const ts = nowIso();
    db.prepare(
      "UPDATE aw_workspaces SET profile_json = ?, current_generation = current_generation + 1, updated_at = ? WHERE workspace_id = ?"
    ).run(stringifyJson(newProfile), ts, workspaceId);

    const updated = hydrateWorkspace(selectWorkspaceRawStmt.get(workspaceId));
    return { ok: true, workspace: updated, newGeneration: updated.currentGeneration };
  }

  /**
   * Add or update owned source IDs for a workspace (the workspace "owns" this knowledge).
   */
  function setOwnedSourceIds(workspaceId, sourceIds, options = {}) {
    const row = selectWorkspaceRawStmt.get(workspaceId);
    if (!row) return { ok: false, error: "工作空间不存在" };
    if (!canAccessWorkspace(hydrateWorkspace(row), options)) {
      return { ok: false, error: "工作空间不可访问" };
    }
    const unique = [...new Set(asArray(sourceIds).filter(Boolean))];
    const ts = nowIso();
    db.prepare(
      "UPDATE aw_workspaces SET owned_source_ids_json = ?, current_generation = current_generation + 1, updated_at = ? WHERE workspace_id = ?"
    ).run(stringifyJson(unique), ts, workspaceId);
    return { ok: true, workspace: hydrateWorkspace(selectWorkspaceRawStmt.get(workspaceId)) };
  }

  // ── Workspace sharing ─────────────────────────────────────────────────────

  /**
   * Grant workspace `targetId` access to workspace `sourceId`'s resolved knowledge.
   * After this call, resolveWorkspaceSourceIds(targetId) will include
   * all sources from sourceId.
   *
   * @param {string} sourceId  The workspace granting access ("I share MY knowledge")
   * @param {string} targetId  The workspace receiving access ("they get access to MY knowledge")
   */
  function shareWorkspace(sourceId, targetId, options = {}) {
    if (!selectWorkspaceRawStmt.get(sourceId)) return { ok: false, error: "来源工作空间不存在" };
    const targetRow = selectWorkspaceRawStmt.get(targetId);
    if (!targetRow) return { ok: false, error: "目标工作空间不存在" };
    if (!canAccessWorkspaceId(sourceId, options) || !canAccessWorkspace(hydrateWorkspace(targetRow), options)) {
      return { ok: false, error: "工作空间不可访问" };
    }
    if (sourceId === targetId) return { ok: false, error: "不能共享给自身" };
    const target = hydrateWorkspace(targetRow);
    const existing = new Set(target.accessibleWorkspaceIds);
    if (existing.has(sourceId)) return { ok: true, workspace: target, alreadyShared: true };
    existing.add(sourceId);
    const ts = nowIso();
    db.prepare(
      "UPDATE aw_workspaces SET accessible_workspace_ids_json = ?, current_generation = current_generation + 1, updated_at = ? WHERE workspace_id = ?"
    ).run(JSON.stringify([...existing]), ts, targetId);
    return { ok: true, workspace: hydrateWorkspace(selectWorkspaceRawStmt.get(targetId)) };
  }

  /**
   * Revoke workspace `targetId`'s access to `sourceId`'s knowledge.
   */
  function unshareWorkspace(sourceId, targetId, options = {}) {
    const targetRow = selectWorkspaceRawStmt.get(targetId);
    if (!targetRow) return { ok: false, error: "目标工作空间不存在" };
    if (!canAccessWorkspaceId(sourceId, options) || !canAccessWorkspace(hydrateWorkspace(targetRow), options)) {
      return { ok: false, error: "工作空间不可访问" };
    }
    const target = hydrateWorkspace(targetRow);
    const updated = target.accessibleWorkspaceIds.filter((id) => id !== sourceId);
    if (updated.length === target.accessibleWorkspaceIds.length) {
      return { ok: true, workspace: target, wasShared: false };
    }
    const ts = nowIso();
    db.prepare(
      "UPDATE aw_workspaces SET accessible_workspace_ids_json = ?, current_generation = current_generation + 1, updated_at = ? WHERE workspace_id = ?"
    ).run(JSON.stringify(updated), ts, targetId);
    return { ok: true, workspace: hydrateWorkspace(selectWorkspaceRawStmt.get(targetId)), wasShared: true };
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
    adminReleaseLock,
    listLocks,
    // ── New: inheritance, profile, sharing ──
    resolveWorkspaceChain,
    resolveWorkspaceProfile,
    resolveWorkspaceSourceIds,
    getWorkspaceContext,
    exportWorkspaceContextBundle,
    restoreWorkspaceContextBundle,
    setWorkspaceParent,
    hotSwapProfile,
    setOwnedSourceIds,
    shareWorkspace,
    unshareWorkspace,
    close
  };
}

export default createAgentWorkspace;
