import crypto, { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ServerConfig } from "../../../../common/config/ServerConfig.mjs";

export const CODESPACE_PROTOCOL_VERSION = "pact.codespace.v1";

const REGISTRY_FILE = path.join("code-management", "codespace-registry.json");
const CODE_PAYLOAD_KINDS = new Set(["sourceCode", "patch", "gitDiff", "repositoryChange", "codeChange"]);
const REVIEW_STATUS = new Set(["draft", "open", "reviewed", "submitted", "merged", "abandoned", "conflict", "failed"]);
const SUBMIT_STATUS = new Set(["notSubmitted", "submitted", "merged", "failed"]);

function nowIso() {
  return new Date().toISOString();
}

function text(value) {
  return String(value ?? "").trim();
}

function asObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function uniqueStrings(value = []) {
  return [...new Set(asArray(value).map(text).filter(Boolean))];
}

function stableJson(value) {
  if (value === undefined || value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function digest(value, length = 20) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, length);
}

function stableId(prefix, value) {
  return `${prefix}_${digest(stableJson(value), 24)}`;
}

function registryPath(userDataPath = "") {
  return path.join(userDataPath || ServerConfig.getDataDir(), REGISTRY_FILE);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function emptyRegistry() {
  return {
    schemaVersion: 1,
    protocolVersion: CODESPACE_PROTOCOL_VERSION,
    updatedAt: nowIso(),
    targets: {},
    changes: {},
    events: []
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function workspaceIdFrom(input = {}) {
  return text(input.workspaceId || input.workspace || "default") || "default";
}

function repositoryRefFrom(input = {}) {
  return text(input.repositoryRef || input.repositoryId || input.repositoryHint || input.project || input.remoteUrl || "");
}

function branchFrom(input = {}) {
  return text(input.branch || input.branchHint || "main") || "main";
}

function targetProviderFor(input = {}, routeDecision = "") {
  return text(input.targetProvider || input.provider || (routeDecision === "gerritChange" ? "gerrit" : "workspace"));
}

function routeDecisionFor(input = {}) {
  const explicit = text(input.routeDecision || input.route || "");
  if (explicit) return explicit;
  if (input.forceFallback === true || text(input.requestedAction) === "draft" || text(input.policyDecision) === "needsApproval") {
    return "proposalFallback";
  }
  const payloadKind = text(input.payloadKind || "");
  if (CODE_PAYLOAD_KINDS.has(payloadKind)) return "gerritChange";
  if (input.requestedAction === "review" && repositoryRefFrom(input)) return "gerritChange";
  return "workspaceContribution";
}

function normalizeReviewStatus(value, fallback = "draft") {
  const raw = text(value || fallback);
  const mapped = {
    NEW: "open",
    MERGED: "merged",
    ABANDONED: "abandoned",
    SUBMITTED: "submitted",
    DRAFT: "draft"
  }[raw.toUpperCase?.()] || raw;
  return REVIEW_STATUS.has(mapped) ? mapped : fallback;
}

function normalizeSubmitStatus(value, reviewStatus = "") {
  const raw = text(value || "");
  if (SUBMIT_STATUS.has(raw)) return raw;
  if (reviewStatus === "merged") return "merged";
  if (reviewStatus === "submitted") return "submitted";
  if (reviewStatus === "failed") return "failed";
  return "notSubmitted";
}

function appendEvent(registry, type, payload = {}) {
  const event = {
    eventId: stableId("code_event", { type, payload, nonce: randomUUID() }),
    protocolVersion: CODESPACE_PROTOCOL_VERSION,
    type,
    workspaceId: workspaceIdFrom(payload),
    codeChangeId: text(payload.codeChangeId || ""),
    targetId: text(payload.targetId || ""),
    payload: clone(asObject(payload)),
    createdAt: nowIso()
  };
  registry.events.push(event);
  return event;
}

function targetIdFor(input = {}) {
  return text(input.targetId || "") || stableId("code_target", {
    workspaceId: workspaceIdFrom(input),
    taskId: input.taskId || "",
    payloadKind: input.payloadKind || "",
    repositoryRef: repositoryRefFrom(input),
    branch: branchFrom(input),
    requestedAction: input.requestedAction || "",
    idempotencyKey: input.idempotencyKey || ""
  });
}

function normalizeTarget(input = {}) {
  const routeDecision = routeDecisionFor(input);
  const targetProvider = targetProviderFor(input, routeDecision);
  const repositoryRef = repositoryRefFrom(input);
  const branch = branchFrom(input);
  const policyDecision = text(input.policyDecision || (routeDecision === "reject" ? "deny" : "allow"));
  const accepted = routeDecision !== "reject" && policyDecision !== "deny";
  return {
    protocolVersion: CODESPACE_PROTOCOL_VERSION,
    targetId: targetIdFor(input),
    workspaceId: workspaceIdFrom(input),
    subject: text(input.subject || input.subjectId || ""),
    operatorId: text(input.operatorId || input.actorId || input.createdBy || ""),
    taskId: text(input.taskId || input.runId || ""),
    payloadKind: text(input.payloadKind || ""),
    payloadRefs: uniqueStrings(input.payloadRefs || input.payloadRef),
    requestedAction: text(input.requestedAction || "review"),
    routeDecision,
    accepted,
    policyDecision,
    fallbackReason: text(input.fallbackReason || ""),
    targetKind: routeDecision === "gerritChange"
      ? "gerritChange"
      : routeDecision === "proposalFallback"
        ? "workspaceProposal"
        : "workspaceContribution",
    targetProvider,
    repositoryId: text(input.repositoryId || input.repositoryHint || input.project || ""),
    repositoryRef,
    branch,
    reviewUrl: text(input.reviewUrl || input.gerritChangeUrl || ""),
    changeRef: text(input.changeRef || input.changeId || input.changeNumber || ""),
    status: "evaluated",
    metadata: asObject(input.metadata),
    createdAt: text(input.createdAt || nowIso()),
    updatedAt: nowIso()
  };
}

function compatibleTarget(target) {
  return {
    targetId: target.targetId,
    targetKind: target.targetKind,
    targetProvider: target.targetProvider,
    repositoryId: target.repositoryId,
    repositoryRef: target.repositoryRef,
    branch: target.branch,
    changeRef: target.changeRef,
    reviewUrl: target.reviewUrl,
    reason: target.routeDecision === "gerritChange"
      ? "source code changes require review"
      : target.routeDecision === "proposalFallback"
        ? "code route requires a workspace proposal fallback"
        : "payload can remain a workspace contribution"
  };
}

function codeChangeIdFor(input = {}) {
  return text(input.codeChangeId || input.changeSetId || "") || stableId("code_change", {
    workspaceId: workspaceIdFrom(input),
    targetId: input.targetId || "",
    repositoryRef: repositoryRefFrom(input),
    branch: branchFrom(input),
    diff: input.diff || input.patch || "",
    idempotencyKey: input.idempotencyKey || ""
  });
}

function normalizeChangeSet(input = {}) {
  const files = asArray(input.files || input.fileChanges).map((item) => asObject(item)).filter((item) => Object.keys(item).length);
  const diff = text(input.diff || input.patch || "");
  const commitPlan = asArray(input.commitPlan).map((item) => asObject(item, { message: text(item) }));
  const payload = {
    payloadKind: text(input.payloadKind || "repositoryChange"),
    payloadRefs: uniqueStrings(input.payloadRefs || input.payloadRef),
    diff,
    files,
    commitPlan
  };
  return {
    changeSetId: text(input.changeSetId || "") || stableId("change_set", payload),
    ...payload,
    diffSha256: diff ? digest(diff, 64) : "",
    fileCount: files.length
  };
}

function publicCodeChange(change = {}) {
  return {
    protocolVersion: CODESPACE_PROTOCOL_VERSION,
    codeChangeId: change.codeChangeId,
    workspaceId: change.workspaceId,
    targetId: change.targetId,
    repositoryId: change.repositoryId,
    repositoryRef: change.repositoryRef,
    branch: change.branch,
    changeId: change.changeId,
    changeNumber: change.changeNumber,
    changeRef: change.changeRef,
    gerritChangeUrl: change.gerritChangeUrl,
    reviewUrl: change.reviewUrl,
    patchSetRefs: change.patchSetRefs || [],
    reviewStatus: change.reviewStatus,
    submitStatus: change.submitStatus,
    operationId: change.operationId,
    checkpointNodeId: change.checkpointNodeId,
    auditId: change.auditId,
    changeSet: clone(change.changeSet || {}),
    target: clone(change.target || {}),
    completion: clone(change.completion || {}),
    statusHistory: clone(change.statusHistory || []),
    createdAt: change.createdAt,
    updatedAt: change.updatedAt
  };
}

function findChange(registry, input = {}) {
  const codeChangeId = text(input.codeChangeId || "");
  if (codeChangeId && registry.changes[codeChangeId]) return registry.changes[codeChangeId];
  const changeId = text(input.changeId || input.changeRef || "");
  if (changeId) {
    return Object.values(registry.changes).find((item) =>
      item.changeId === changeId || item.changeRef === changeId || String(item.changeNumber || "") === changeId
    ) || null;
  }
  return null;
}

function statusFromGerritChange(change = {}) {
  const reviewStatus = normalizeReviewStatus(change.status || change.reviewStatus || "open", "open");
  return {
    reviewStatus,
    submitStatus: normalizeSubmitStatus(change.submitStatus, reviewStatus),
    changeId: text(change.change_id || change.changeId || ""),
    changeNumber: text(change._number || change.changeNumber || ""),
    currentRevision: text(change.current_revision || change.currentRevision || "")
  };
}

export function createCodespaceRegistry({
  userDataPath,
  executeGerritCommonOperation,
  uploadGerritGitChange
} = {}) {
  const filePath = registryPath(userDataPath);

  async function loadRegistry() {
    const registry = await readJson(filePath, emptyRegistry());
    return {
      ...emptyRegistry(),
      ...registry,
      targets: asObject(registry.targets),
      changes: asObject(registry.changes),
      events: asArray(registry.events)
    };
  }

  async function saveRegistry(registry) {
    registry.updatedAt = nowIso();
    await writeJson(filePath, registry);
    return registry;
  }

  async function mutate(mutator) {
    const registry = await loadRegistry();
    const output = await mutator(registry);
    await saveRegistry(registry);
    return output;
  }

  async function evaluateTarget(input = {}) {
    return mutate(async (registry) => {
      const target = normalizeTarget(input);
      const existing = registry.targets[target.targetId];
      registry.targets[target.targetId] = {
        ...existing,
        ...target,
        createdAt: existing?.createdAt || target.createdAt,
        updatedAt: nowIso()
      };
      const audit = appendEvent(registry, "code.route.evaluated", {
        workspaceId: target.workspaceId,
        targetId: target.targetId,
        routeDecision: target.routeDecision,
        policyDecision: target.policyDecision
      });
      let fallback = null;
      if (target.routeDecision === "proposalFallback") {
        const fallbackAudit = appendEvent(registry, "code.change.fallback.created", {
          workspaceId: target.workspaceId,
          targetId: target.targetId,
          reason: target.fallbackReason || "proposal fallback requested"
        });
        fallback = {
          targetKind: "workspaceProposal",
          operationId: "workspace.proposal.create",
          reason: target.fallbackReason || "code route requires proposal fallback",
          auditId: fallbackAudit.eventId
        };
      }
      return {
        ok: true,
        protocolVersion: CODESPACE_PROTOCOL_VERSION,
        accepted: target.accepted,
        routeDecision: target.routeDecision,
        compatibleTargets: [compatibleTarget(target)],
        policyDecision: target.policyDecision,
        fallbackReason: target.fallbackReason,
        fallback,
        auditId: audit.eventId,
        target: clone(registry.targets[target.targetId])
      };
    });
  }

  async function prepareChange(input = {}) {
    return mutate(async (registry) => {
      const targetId = text(input.targetId || "");
      const target = targetId && registry.targets[targetId]
        ? registry.targets[targetId]
        : normalizeTarget(input);
      registry.targets[target.targetId] = {
        ...registry.targets[target.targetId],
        ...target,
        updatedAt: nowIso()
      };
      const changeSet = normalizeChangeSet(input);
      const codeChangeId = codeChangeIdFor({
        ...input,
        targetId: target.targetId,
        changeSetId: changeSet.changeSetId
      });
      const timestamp = nowIso();
      const previous = registry.changes[codeChangeId];
      const audit = appendEvent(registry, "code.change.prepared", {
        workspaceId: target.workspaceId,
        targetId: target.targetId,
        codeChangeId,
        changeSetId: changeSet.changeSetId
      });
      const change = {
        protocolVersion: CODESPACE_PROTOCOL_VERSION,
        ...(previous || {}),
        codeChangeId,
        workspaceId: target.workspaceId,
        targetId: target.targetId,
        repositoryId: text(input.repositoryId || target.repositoryId),
        repositoryRef: text(input.repositoryRef || target.repositoryRef || target.repositoryId),
        branch: branchFrom({ ...target, ...input }),
        changeId: text(input.changeId || previous?.changeId || ""),
        changeNumber: text(input.changeNumber || previous?.changeNumber || ""),
        changeRef: text(input.changeRef || previous?.changeRef || ""),
        gerritChangeUrl: text(input.gerritChangeUrl || input.reviewUrl || previous?.gerritChangeUrl || ""),
        reviewUrl: text(input.reviewUrl || input.gerritChangeUrl || previous?.reviewUrl || ""),
        patchSetRefs: uniqueStrings(input.patchSetRefs || previous?.patchSetRefs),
        reviewStatus: normalizeReviewStatus(input.reviewStatus || previous?.reviewStatus || "draft"),
        submitStatus: normalizeSubmitStatus(input.submitStatus || previous?.submitStatus || "notSubmitted"),
        operationId: "workspace.code.change.prepare",
        checkpointNodeId: text(input.checkpointNodeId || previous?.checkpointNodeId || ""),
        auditId: audit.eventId,
        changeSet,
        target: compatibleTarget(target),
        completion: asObject(previous?.completion),
        statusHistory: [
          ...(previous?.statusHistory || []),
          { status: "prepared", at: timestamp, auditId: audit.eventId }
        ],
        createdAt: previous?.createdAt || timestamp,
        updatedAt: timestamp
      };
      registry.changes[codeChangeId] = change;
      return {
        ok: true,
        ...publicCodeChange(change),
        prepared: true
      };
    });
  }

  async function linkChange(input = {}) {
    return mutate(async (registry) => {
      const timestamp = nowIso();
      const existing = findChange(registry, input);
      const targetId = text(input.targetId || existing?.targetId || "");
      const target = targetId && registry.targets[targetId]
        ? registry.targets[targetId]
        : normalizeTarget({
            ...input,
            payloadKind: input.payloadKind || "repositoryChange",
            routeDecision: input.routeDecision || "gerritChange"
          });
      registry.targets[target.targetId] = {
        ...registry.targets[target.targetId],
        ...target,
        changeRef: text(input.changeRef || input.changeId || input.changeNumber || target.changeRef),
        reviewUrl: text(input.reviewUrl || input.gerritChangeUrl || target.reviewUrl),
        updatedAt: timestamp
      };
      const codeChangeId = existing?.codeChangeId || codeChangeIdFor({ ...input, targetId: target.targetId });
      const audit = appendEvent(registry, "code.change.linked", {
        workspaceId: target.workspaceId,
        targetId: target.targetId,
        codeChangeId,
        changeId: input.changeId || ""
      });
      const reviewStatus = normalizeReviewStatus(
        input.reviewStatus || (existing?.reviewStatus && existing.reviewStatus !== "draft" ? existing.reviewStatus : "open"),
        "open"
      );
      const change = {
        protocolVersion: CODESPACE_PROTOCOL_VERSION,
        ...(existing || {}),
        codeChangeId,
        workspaceId: target.workspaceId,
        targetId: target.targetId,
        repositoryId: text(input.repositoryId || existing?.repositoryId || target.repositoryId),
        repositoryRef: text(input.repositoryRef || existing?.repositoryRef || target.repositoryRef),
        branch: branchFrom({ ...target, ...existing, ...input }),
        changeId: text(input.changeId || existing?.changeId || ""),
        changeNumber: text(input.changeNumber || existing?.changeNumber || ""),
        changeRef: text(input.changeRef || input.changeId || input.changeNumber || existing?.changeRef || ""),
        gerritChangeUrl: text(input.gerritChangeUrl || input.reviewUrl || existing?.gerritChangeUrl || ""),
        reviewUrl: text(input.reviewUrl || input.gerritChangeUrl || existing?.reviewUrl || ""),
        patchSetRefs: uniqueStrings(input.patchSetRefs || existing?.patchSetRefs),
        reviewStatus,
        submitStatus: normalizeSubmitStatus(input.submitStatus || existing?.submitStatus, reviewStatus),
        operationId: "workspace.code.change.link",
        checkpointNodeId: text(input.checkpointNodeId || existing?.checkpointNodeId || ""),
        auditId: audit.eventId,
        changeSet: asObject(existing?.changeSet),
        target: compatibleTarget(registry.targets[target.targetId]),
        completion: asObject(existing?.completion),
        statusHistory: [
          ...(existing?.statusHistory || []),
          { status: "linked", at: timestamp, auditId: audit.eventId }
        ],
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp
      };
      registry.changes[codeChangeId] = change;
      return {
        ok: true,
        ...publicCodeChange(change),
        linked: true
      };
    });
  }

  async function syncStatus(input = {}) {
    return mutate(async (registry) => {
      let existing = findChange(registry, input);
      if (!existing) {
        const target = normalizeTarget({
          ...input,
          payloadKind: input.payloadKind || "repositoryChange",
          routeDecision: input.routeDecision || "gerritChange"
        });
        registry.targets[target.targetId] = {
          ...registry.targets[target.targetId],
          ...target,
          updatedAt: nowIso()
        };
        const codeChangeId = codeChangeIdFor({ ...input, targetId: target.targetId });
        existing = {
          protocolVersion: CODESPACE_PROTOCOL_VERSION,
          codeChangeId,
          workspaceId: target.workspaceId,
          targetId: target.targetId,
          repositoryId: text(input.repositoryId || target.repositoryId),
          repositoryRef: text(input.repositoryRef || target.repositoryRef),
          branch: branchFrom({ ...target, ...input }),
          changeId: text(input.changeId || ""),
          changeNumber: text(input.changeNumber || ""),
          changeRef: text(input.changeRef || input.changeId || input.changeNumber || ""),
          gerritChangeUrl: text(input.gerritChangeUrl || input.reviewUrl || ""),
          reviewUrl: text(input.reviewUrl || input.gerritChangeUrl || ""),
          patchSetRefs: [],
          reviewStatus: "open",
          submitStatus: "notSubmitted",
          operationId: "workspace.code.change.link",
          checkpointNodeId: text(input.checkpointNodeId || ""),
          auditId: "",
          changeSet: {},
          target: compatibleTarget(target),
          completion: {},
          statusHistory: [],
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        registry.changes[codeChangeId] = existing;
      }
      let providerReceipt = asObject(input.providerReceipt || input.gerritResult);
      if (
        executeGerritCommonOperation &&
        input.fetchFromGerrit === true &&
        text(input.changeId || existing.changeId || existing.changeRef)
      ) {
        const gerrit = await executeGerritCommonOperation({
          mode: "read",
          input: {
            ...input,
            action: input.action || "changes.detail",
            changeId: input.changeId || existing.changeId || existing.changeRef
          }
        });
        providerReceipt = {
          ok: gerrit.ok,
          action: gerrit.action,
          mode: gerrit.mode,
          gerrit: gerrit.gerrit,
          result: gerrit.result,
          error: gerrit.error || ""
        };
      }
      const statusSource = asObject(providerReceipt.result || providerReceipt.change || providerReceipt, {});
      const mapped = statusFromGerritChange({
        ...statusSource,
        reviewStatus: input.reviewStatus || statusSource.reviewStatus,
        submitStatus: input.submitStatus || statusSource.submitStatus
      });
      const timestamp = nowIso();
      const audit = appendEvent(registry, "code.change.status.synced", {
        workspaceId: existing.workspaceId,
        targetId: existing.targetId,
        codeChangeId: existing.codeChangeId,
        reviewStatus: mapped.reviewStatus,
        submitStatus: mapped.submitStatus
      });
      const change = {
        ...existing,
        changeId: text(input.changeId || existing.changeId || mapped.changeId),
        changeNumber: text(input.changeNumber || existing.changeNumber || mapped.changeNumber),
        changeRef: text(input.changeRef || existing.changeRef || input.changeId || mapped.changeId || mapped.changeNumber),
        reviewStatus: mapped.reviewStatus,
        submitStatus: mapped.submitStatus,
        operationId: "workspace.code.change.status.sync",
        auditId: audit.eventId,
        completion: {
          ...asObject(existing.completion),
          providerReceipt
        },
        statusHistory: [
          ...(existing.statusHistory || []),
          { status: "status_synced", at: timestamp, auditId: audit.eventId, reviewStatus: mapped.reviewStatus, submitStatus: mapped.submitStatus }
        ],
        updatedAt: timestamp
      };
      registry.changes[change.codeChangeId] = change;
      return {
        ok: true,
        ...publicCodeChange(change),
        synced: true,
        providerReceipt
      };
    });
  }

  async function uploadChange(input = {}) {
    if (typeof uploadGerritGitChange !== "function") {
      return {
        ok: false,
        status: 503,
        error: "Gerrit upload provider is not registered."
      };
    }
    const upload = await uploadGerritGitChange(input);
    const target = {
      targetKind: "codespace",
      targetProvider: upload.targetProvider || "gerrit",
      repositoryRef: upload.repositoryRef || input.repositoryRef || input.repositoryId || input.project || "",
      branch: upload.branch || branchFrom(input),
      changeRef: upload.changeRef || upload.changeId || upload.changeNumber || "",
      reviewUrl: upload.reviewUrl || ""
    };
    return mutate(async (registry) => {
      const timestamp = nowIso();
      const existing = findChange(registry, input);
      const targetRecord = normalizeTarget({
        ...input,
        routeDecision: "gerritChange",
        targetProvider: target.targetProvider,
        repositoryRef: target.repositoryRef,
        branch: target.branch,
        changeRef: target.changeRef,
        reviewUrl: target.reviewUrl
      });
      registry.targets[targetRecord.targetId] = {
        ...registry.targets[targetRecord.targetId],
        ...targetRecord,
        targetKind: "gerritChange",
        status: upload.ok ? "uploaded" : "upload_failed",
        updatedAt: timestamp
      };
      const codeChangeId = existing?.codeChangeId || codeChangeIdFor({ ...input, targetId: targetRecord.targetId });
      const eventType = upload.ok ? "code.change.uploaded" : "code.change.upload.failed";
      const audit = appendEvent(registry, eventType, {
        workspaceId: workspaceIdFrom(input),
        targetId: targetRecord.targetId,
        codeChangeId,
        uploadId: upload.uploadId || "",
        dryRun: upload.dryRun === true
      });
      const reviewStatus = upload.ok && upload.dryRun !== true
        ? "open"
        : upload.ok
          ? "draft"
          : "failed";
      const submitStatus = upload.ok ? "notSubmitted" : "failed";
      const change = {
        protocolVersion: CODESPACE_PROTOCOL_VERSION,
        ...(existing || {}),
        codeChangeId,
        workspaceId: workspaceIdFrom(input),
        targetId: targetRecord.targetId,
        repositoryId: text(input.repositoryId || target.repositoryRef),
        repositoryRef: target.repositoryRef,
        branch: target.branch,
        changeId: text(upload.changeId || existing?.changeId || ""),
        changeNumber: text(upload.changeNumber || existing?.changeNumber || ""),
        changeRef: text(target.changeRef || existing?.changeRef || ""),
        gerritChangeUrl: text(upload.reviewUrl || existing?.gerritChangeUrl || ""),
        reviewUrl: text(upload.reviewUrl || existing?.reviewUrl || ""),
        patchSetRefs: uniqueStrings(existing?.patchSetRefs),
        reviewStatus,
        submitStatus,
        operationId: "workspace.code.change.upload",
        checkpointNodeId: text(input.checkpointNodeId || existing?.checkpointNodeId || ""),
        auditId: audit.eventId,
        changeSet: asObject(existing?.changeSet),
        target,
        completion: {
          confirmed: upload.completion?.confirmed === true,
          dryRun: upload.dryRun === true,
          uploadId: upload.uploadId || "",
          provider: upload.provider || "gerrit",
          receipt: clone(upload.completion || {}),
          error: upload.error || ""
        },
        statusHistory: [
          ...(existing?.statusHistory || []),
          { status: upload.ok ? "uploaded" : "upload_failed", at: timestamp, auditId: audit.eventId }
        ],
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp
      };
      registry.changes[codeChangeId] = change;
      return {
        ok: upload.ok,
        status: upload.status || (upload.ok ? 200 : 400),
        schemaVersion: 1,
        operationId: "workspace.code.change.upload",
        protocolVersion: CODESPACE_PROTOCOL_VERSION,
        ...upload,
        codeChange: publicCodeChange(change),
        codeChangeId,
        target,
        auditId: audit.eventId
      };
    });
  }

  async function getChange(input = {}) {
    const registry = await loadRegistry();
    const change = findChange(registry, input);
    return change
      ? { ok: true, ...publicCodeChange(change) }
      : { ok: false, status: 404, error: "Code change not found." };
  }

  async function listChanges(input = {}) {
    const registry = await loadRegistry();
    const workspaceId = text(input.workspaceId || "");
    const items = Object.values(registry.changes)
      .filter((item) => !workspaceId || item.workspaceId === workspaceId)
      .map(publicCodeChange)
      .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
    return {
      ok: true,
      protocolVersion: CODESPACE_PROTOCOL_VERSION,
      count: items.length,
      items
    };
  }

  return {
    protocolVersion: CODESPACE_PROTOCOL_VERSION,
    evaluateTarget,
    prepareChange,
    uploadChange,
    linkChange,
    syncStatus,
    getChange,
    listChanges
  };
}
