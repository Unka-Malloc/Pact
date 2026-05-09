import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertServerToken, resolveWithin, serverToken } from "../platform-core/security/client-strings.mjs";

const CHECKPOINT_TREE_SCHEMA_VERSION = 1;
const MAX_EVENTS = 500;
const TERMINAL_STATUSES = new Set(["completed", "failed", "skipped", "canceled"]);
const VALID_STATUSES = new Set([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "paused",
  "canceled"
]);

const treeLocks = new Map();

function nowIso() {
  return new Date().toISOString();
}

function normalizeStatus(value, fallback = "pending") {
  const text = String(value || "").trim().toLowerCase();
  return VALID_STATUSES.has(text) ? text : fallback;
}

function normalizeNodeId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160) || "root";
}

function asPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function checkpointTreeRoot(userDataPath) {
  return resolveWithin(userDataPath, "checkpoint-trees");
}

function checkpointTreePath(userDataPath, treeId) {
  assertServerToken(treeId, "checkpoint_tree");
  return resolveWithin(checkpointTreeRoot(userDataPath), `${treeId}.json`);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, filePath);
}

async function withTreeLock(treeId, action) {
  const previous = treeLocks.get(treeId) || Promise.resolve();
  const run = previous.catch(() => null).then(action);
  const cleanup = run.finally(() => {
    if (treeLocks.get(treeId) === cleanup) {
      treeLocks.delete(treeId);
    }
  });
  treeLocks.set(treeId, cleanup);
  return run;
}

function createEmptyTree({
  treeId,
  kind = "long_task",
  ownerId = "",
  inputHash = "",
  rootNodeId = "root",
  rootLabel = "root",
  metadata = {},
  resumePolicy = {}
}) {
  const timestamp = nowIso();
  const normalizedRootNodeId = normalizeNodeId(rootNodeId);
  return {
    schemaVersion: CHECKPOINT_TREE_SCHEMA_VERSION,
    treeId,
    kind: String(kind || "long_task"),
    ownerId: String(ownerId || ""),
    status: "running",
    inputHash: String(inputHash || ""),
    resumePolicy: asPlainObject(resumePolicy),
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: timestamp,
    completedAt: "",
    failedAt: "",
    attempt: 0,
    rootNodeId: normalizedRootNodeId,
    metadata: asPlainObject(metadata),
    nodes: {
      [normalizedRootNodeId]: {
        nodeId: normalizedRootNodeId,
        parentId: "",
        label: String(rootLabel || normalizedRootNodeId),
        status: "running",
        cursor: {},
        totals: {},
        metadata: {},
        createdAt: timestamp,
        updatedAt: timestamp,
        startedAt: timestamp,
        completedAt: "",
        error: ""
      }
    },
    events: []
  };
}

function appendTreeEvent(tree, event) {
  const timestamp = nowIso();
  tree.events = [
    ...(Array.isArray(tree.events) ? tree.events : []),
    {
      eventId: `event_${randomUUID()}`,
      at: timestamp,
      type: String(event.type || "checkpoint.event"),
      nodeId: event.nodeId ? normalizeNodeId(event.nodeId) : "",
      message: String(event.message || ""),
      data: asPlainObject(event.data)
    }
  ].slice(-MAX_EVENTS);
}

async function mutateCheckpointTree({ userDataPath, treeId, createInput = {}, mutator }) {
  assertServerToken(treeId, "checkpoint_tree");
  return withTreeLock(treeId, async () => {
    const filePath = checkpointTreePath(userDataPath, treeId);
    let tree = await readJson(filePath);
    if (!tree || tree.schemaVersion !== CHECKPOINT_TREE_SCHEMA_VERSION) {
      tree = createEmptyTree({
        treeId,
        ...createInput
      });
      appendTreeEvent(tree, {
        type: "checkpoint.tree.created",
        nodeId: tree.rootNodeId,
        message: "Checkpoint tree created."
      });
    }
    const result = await mutator(tree);
    tree.updatedAt = nowIso();
    await writeJsonAtomic(filePath, tree);
    return result === undefined ? tree : result;
  });
}

export function checkpointTreeId(kind, ...parts) {
  return serverToken("checkpoint_tree", kind, ...parts);
}

export function getCheckpointTreePath(userDataPath, treeId) {
  return checkpointTreePath(userDataPath, treeId);
}

export async function loadCheckpointTree({ userDataPath, treeId } = {}) {
  try {
    const tree = await readJson(checkpointTreePath(userDataPath, treeId));
    return tree?.schemaVersion === CHECKPOINT_TREE_SCHEMA_VERSION ? tree : null;
  } catch (error) {
    if (/token 格式无效/.test(String(error?.message || ""))) {
      return null;
    }
    throw error;
  }
}

export async function listCheckpointTrees({ userDataPath, ownerId = "", kind = "", limit = 100 } = {}) {
  const rootPath = checkpointTreeRoot(userDataPath);
  await fs.mkdir(rootPath, { recursive: true });
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const trees = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^checkpoint_tree_[a-f0-9]{32}\.json$/.test(entry.name)) {
      continue;
    }
    const tree = await readJson(path.join(rootPath, entry.name));
    if (!tree || tree.schemaVersion !== CHECKPOINT_TREE_SCHEMA_VERSION) {
      continue;
    }
    if (ownerId && tree.ownerId !== ownerId) {
      continue;
    }
    if (kind && tree.kind !== kind) {
      continue;
    }
    trees.push(tree);
  }
  return trees
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
    .slice(0, Math.max(1, Math.min(500, Number(limit || 100))));
}

export async function startCheckpointTree({
  userDataPath,
  treeId,
  kind = "long_task",
  ownerId = "",
  inputHash = "",
  rootNodeId = "root",
  rootLabel = "root",
  metadata = {},
  resumePolicy = {},
  resetOnInputHashChange = true
} = {}) {
  return mutateCheckpointTree({
    userDataPath,
    treeId,
    createInput: {
      kind,
      ownerId,
      inputHash,
      rootNodeId,
      rootLabel,
      metadata,
      resumePolicy
    },
    mutator(tree) {
      const normalizedInputHash = String(inputHash || "");
      if (
        resetOnInputHashChange &&
        normalizedInputHash &&
        tree.inputHash &&
        tree.inputHash !== normalizedInputHash
      ) {
        const replacement = createEmptyTree({
          treeId,
          kind,
          ownerId,
          inputHash: normalizedInputHash,
          rootNodeId,
          rootLabel,
          metadata,
          resumePolicy
        });
        replacement.createdAt = tree.createdAt || replacement.createdAt;
        replacement.attempt = Number(tree.attempt || 0);
        Object.assign(tree, replacement);
        appendTreeEvent(tree, {
          type: "checkpoint.tree.reset",
          nodeId: tree.rootNodeId,
          message: "Input hash changed; checkpoint tree was reset."
        });
      }
      const timestamp = nowIso();
      const normalizedRootNodeId = normalizeNodeId(rootNodeId || tree.rootNodeId || "root");
      tree.kind = String(kind || tree.kind || "long_task");
      tree.ownerId = String(ownerId || tree.ownerId || "");
      tree.inputHash = normalizedInputHash || tree.inputHash || "";
      tree.resumePolicy = {
        ...asPlainObject(tree.resumePolicy),
        ...asPlainObject(resumePolicy)
      };
      tree.metadata = {
        ...asPlainObject(tree.metadata),
        ...asPlainObject(metadata)
      };
      tree.status = "running";
      tree.startedAt = tree.startedAt || timestamp;
      tree.completedAt = "";
      tree.failedAt = "";
      tree.attempt = Number(tree.attempt || 0) + 1;
      tree.rootNodeId = normalizedRootNodeId;
      tree.nodes = asPlainObject(tree.nodes);
      tree.nodes[normalizedRootNodeId] = {
        ...(tree.nodes[normalizedRootNodeId] || {}),
        nodeId: normalizedRootNodeId,
        parentId: "",
        label: String(rootLabel || tree.nodes[normalizedRootNodeId]?.label || normalizedRootNodeId),
        status: "running",
        createdAt: tree.nodes[normalizedRootNodeId]?.createdAt || timestamp,
        updatedAt: timestamp,
        startedAt: tree.nodes[normalizedRootNodeId]?.startedAt || timestamp,
        completedAt: "",
        error: tree.nodes[normalizedRootNodeId]?.error || "",
        cursor: asPlainObject(tree.nodes[normalizedRootNodeId]?.cursor),
        totals: asPlainObject(tree.nodes[normalizedRootNodeId]?.totals),
        metadata: asPlainObject(tree.nodes[normalizedRootNodeId]?.metadata)
      };
      appendTreeEvent(tree, {
        type: tree.attempt > 1 ? "checkpoint.tree.resumed" : "checkpoint.tree.started",
        nodeId: normalizedRootNodeId,
        message: tree.attempt > 1 ? "Checkpoint tree resumed." : "Checkpoint tree started."
      });
      return tree;
    }
  });
}

export async function upsertCheckpointNode({
  userDataPath,
  treeId,
  nodeId,
  parentId = "root",
  label = "",
  status = "running",
  cursor = undefined,
  totals = undefined,
  metadata = undefined,
  error = "",
  eventType = ""
} = {}) {
  const normalizedNodeId = normalizeNodeId(nodeId);
  return mutateCheckpointTree({
    userDataPath,
    treeId,
    createInput: {
      rootNodeId: parentId || "root"
    },
    mutator(tree) {
      const timestamp = nowIso();
      const normalizedStatus = normalizeStatus(status, "running");
      const current = tree.nodes?.[normalizedNodeId] || {};
      tree.nodes = asPlainObject(tree.nodes);
      tree.nodes[normalizedNodeId] = {
        ...current,
        nodeId: normalizedNodeId,
        parentId: normalizeNodeId(parentId || current.parentId || tree.rootNodeId || "root"),
        label: String(label || current.label || normalizedNodeId),
        status: normalizedStatus,
        cursor: cursor === undefined ? asPlainObject(current.cursor) : asPlainObject(cursor),
        totals: totals === undefined ? asPlainObject(current.totals) : asPlainObject(totals),
        metadata: metadata === undefined ? asPlainObject(current.metadata) : asPlainObject(metadata),
        createdAt: current.createdAt || timestamp,
        updatedAt: timestamp,
        startedAt: current.startedAt || (normalizedStatus === "running" ? timestamp : ""),
        completedAt: TERMINAL_STATUSES.has(normalizedStatus) ? timestamp : current.completedAt || "",
        error: String(error || (normalizedStatus === "failed" ? current.error || "failed" : ""))
      };
      if (normalizedStatus === "failed") {
        tree.status = "failed";
        tree.failedAt = timestamp;
      } else if (tree.status !== "failed" && normalizedStatus === "running") {
        tree.status = "running";
      }
      if (eventType) {
        appendTreeEvent(tree, {
          type: eventType,
          nodeId: normalizedNodeId,
          message: label || normalizedNodeId,
          data: {
            status: normalizedStatus
          }
        });
      }
      return tree.nodes[normalizedNodeId];
    }
  });
}

export async function finishCheckpointTree({
  userDataPath,
  treeId,
  status = "completed",
  message = "",
  metadata = {}
} = {}) {
  return mutateCheckpointTree({
    userDataPath,
    treeId,
    mutator(tree) {
      const timestamp = nowIso();
      const normalizedStatus = normalizeStatus(status, "completed");
      tree.status = normalizedStatus;
      tree.metadata = {
        ...asPlainObject(tree.metadata),
        ...asPlainObject(metadata)
      };
      if (normalizedStatus === "failed") {
        tree.failedAt = timestamp;
      }
      if (TERMINAL_STATUSES.has(normalizedStatus)) {
        tree.completedAt = timestamp;
      }
      const rootNodeId = tree.rootNodeId || "root";
      if (tree.nodes?.[rootNodeId]) {
        tree.nodes[rootNodeId].status = normalizedStatus;
        tree.nodes[rootNodeId].updatedAt = timestamp;
        tree.nodes[rootNodeId].completedAt = timestamp;
      }
      appendTreeEvent(tree, {
        type: `checkpoint.tree.${normalizedStatus}`,
        nodeId: rootNodeId,
        message: message || `Checkpoint tree ${normalizedStatus}.`
      });
      return tree;
    }
  });
}

export async function deleteCheckpointTree({ userDataPath, treeId } = {}) {
  assertServerToken(treeId, "checkpoint_tree");
  await fs.rm(checkpointTreePath(userDataPath, treeId), {
    force: true
  });
}

export function checkpointTreeSummary(tree) {
  const nodes = Object.values(asPlainObject(tree?.nodes));
  const byStatus = {};
  for (const node of nodes) {
    const status = String(node?.status || "pending");
    byStatus[status] = Number(byStatus[status] || 0) + 1;
  }
  return {
    treeId: tree?.treeId || "",
    kind: tree?.kind || "",
    ownerId: tree?.ownerId || "",
    status: tree?.status || "",
    inputHash: tree?.inputHash || "",
    nodeCount: nodes.length,
    byStatus,
    updatedAt: tree?.updatedAt || "",
    completedAt: tree?.completedAt || ""
  };
}
