import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getRuntimeLogger, summarizeError, summarizeForLog } from "../observability/runtime-logger.mjs";

const stateQueues = new Map();
let defaultStateMutationDispatcher = null;

function normalizeKey(key) {
  return String(key || "default");
}

export function queueStateMutation(key, task) {
  if (typeof task !== "function") {
    throw new TypeError("queueStateMutation requires a task function.");
  }
  const normalizedKey = normalizeKey(key);
  const logger = getRuntimeLogger();
  const queueDepthBefore = stateQueues.has(normalizedKey) ? 1 : 0;
  const queuedAt = Date.now();
  logger?.debug?.("state.queue.enqueued", {
    queueKey: summarizeForLog(normalizedKey),
    queueDepthBefore
  });
  const previousEntry = stateQueues.get(normalizedKey);
  const previous = previousEntry?.settled || Promise.resolve();
  // L-5: task timeout — a hung task would permanently block the entire queue
  const TASK_TIMEOUT_MS = 60_000;
  const operation = previous.catch(() => null).then(async () => {
    const startedAt = Date.now();
    logger?.debug?.("state.queue.started", {
      queueKey: summarizeForLog(normalizedKey),
      waitedMs: startedAt - queuedAt
    });
    let timeoutId = null;
    try {
      const result = await Promise.race([
        task(),
        new Promise((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error(`State mutation timed out after ${TASK_TIMEOUT_MS} ms (key: ${normalizedKey})`)),
            TASK_TIMEOUT_MS
          );
          timeoutId.unref?.();
        })
      ]);
      logger?.debug?.("state.queue.completed", {
        queueKey: summarizeForLog(normalizedKey),
        waitedMs: startedAt - queuedAt,
        durationMs: Date.now() - startedAt
      });
      return result;
    } catch (error) {
      logger?.error?.("state.queue.failed", {
        queueKey: summarizeForLog(normalizedKey),
        waitedMs: startedAt - queuedAt,
        durationMs: Date.now() - startedAt,
        error: summarizeError(error)
      });
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  });
  const entry = {
    settled: operation.catch(() => null).finally(() => {
      if (stateQueues.get(normalizedKey) === entry) {
        stateQueues.delete(normalizedKey);
      }
    })
  };
  stateQueues.set(normalizedKey, entry);
  return operation;
}

export function createStateMutationDispatcher({ logger = null } = {}) {
  const currentLogger = () => logger || getRuntimeLogger();

  async function mutate({ key = "default", kind = "state.mutation", task, metadata = {} } = {}) {
    if (typeof task !== "function") {
      throw new TypeError("StateMutationDispatcher.mutate requires a task function.");
    }
    const normalizedKey = normalizeKey(key);
    currentLogger()?.debug?.("state.dispatch.enqueued", {
      mutationKind: kind,
      queueKey: summarizeForLog(normalizedKey),
      metadata: summarizeForLog(metadata)
    });
    return queueStateMutation(normalizedKey, async () => {
      const startedAt = Date.now();
      currentLogger()?.debug?.("state.dispatch.started", {
        mutationKind: kind,
        queueKey: summarizeForLog(normalizedKey),
        metadata: summarizeForLog(metadata)
      });
      try {
        const result = await task();
        currentLogger()?.debug?.("state.dispatch.completed", {
          mutationKind: kind,
          queueKey: summarizeForLog(normalizedKey),
          durationMs: Date.now() - startedAt
        });
        return result;
      } catch (error) {
        currentLogger()?.error?.("state.dispatch.failed", {
          mutationKind: kind,
          queueKey: summarizeForLog(normalizedKey),
          durationMs: Date.now() - startedAt,
          error: summarizeError(error)
        });
        throw error;
      }
    });
  }

  return {
    mutate,
    async writeJson(filePath, value, options = {}) {
      return mutate({
        key: stateFileKey(filePath),
        kind: options.kind || "state.file.write_json",
        metadata: { filePath, ...(options.metadata || {}) },
        task: () => atomicWriteJson(filePath, value, options)
      });
    },
    async appendJsonLine(filePath, value, options = {}) {
      return mutate({
        key: stateFileKey(filePath),
        kind: options.kind || "state.file.append_jsonl",
        metadata: { filePath, ...(options.metadata || {}) },
        task: () => appendJsonLine(filePath, value)
      });
    }
  };
}

export function getStateMutationDispatcher() {
  if (!defaultStateMutationDispatcher) {
    defaultStateMutationDispatcher = createStateMutationDispatcher();
  }
  return defaultStateMutationDispatcher;
}

export function mutateState(input = {}) {
  return getStateMutationDispatcher().mutate(input);
}

export async function waitForStateIdle(key) {
  const entry = stateQueues.get(normalizeKey(key));
  if (entry) {
    await entry.settled.catch(() => null);
  }
}

export function stateFileKey(filePath) {
  return `file:${path.resolve(filePath)}`;
}

export async function atomicWriteFile(filePath, data, options = "utf8") {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`
  );
  try {
    await fs.writeFile(tempPath, data, options);
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => null);
    throw error;
  }
}

export async function atomicWriteJson(filePath, value, { trailingNewline = true } = {}) {
  const payload = `${JSON.stringify(value, null, 2)}${trailingNewline ? "\n" : ""}`;
  await atomicWriteFile(filePath, payload, "utf8");
}

export async function atomicWriteJsonThroughState(filePath, value, options = {}) {
  return getStateMutationDispatcher().writeJson(filePath, value, options);
}

export async function readJsonFile(filePath, fallback = undefined) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    if (!content.trim()) {
      return fallback;
    }
    return JSON.parse(content);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function appendJsonLine(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

export async function appendJsonLineSerialized(filePath, value) {
  return queueStateMutation(stateFileKey(filePath), () => appendJsonLine(filePath, value));
}

export function setBoundedMapEntry(map, key, value, maxEntries) {
  if (!map || typeof map.set !== "function") {
    return;
  }
  if (map.has(key)) {
    map.delete(key);
  }
  map.set(key, value);
  const safeMax = Math.max(1, Number(maxEntries || 1));
  while (map.size > safeMax) {
    const oldestKey = map.keys().next().value;
    map.delete(oldestKey);
  }
}
