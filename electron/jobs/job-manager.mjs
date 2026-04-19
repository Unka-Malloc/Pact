import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workerEntryPath = fileURLToPath(new URL("./job-worker.mjs", import.meta.url));
const RESTART_ABORT_MESSAGE = "服务已重启，未完成任务已中断。";
const CLOSE_ABORT_MESSAGE = "服务已关闭，任务已中止。";
const QUEUE_ABORT_MESSAGE = "服务已关闭，任务未执行。";

function getJobsRootPath(userDataPath) {
  return path.join(userDataPath, "jobs");
}

function getJobDirectory(userDataPath, jobId) {
  return path.join(getJobsRootPath(userDataPath), jobId);
}

function getJobMetaPath(userDataPath, jobId) {
  return path.join(getJobDirectory(userDataPath, jobId), "meta.json");
}

function getJobResultPath(userDataPath, jobId) {
  return path.join(getJobDirectory(userDataPath, jobId), "result.json");
}

function cloneJob(job) {
  if (!job) {
    return null;
  }

  return {
    ...job,
    resultSummary: job.resultSummary
      ? {
          ...job.resultSummary
        }
      : undefined
  };
}

async function persistJobMeta(userDataPath, job) {
  const jobDirectory = getJobDirectory(userDataPath, job.id);
  await fs.mkdir(jobDirectory, { recursive: true });
  await fs.writeFile(getJobMetaPath(userDataPath, job.id), JSON.stringify(job, null, 2), "utf8");
}

async function persistJobResult(userDataPath, jobId, result) {
  const jobDirectory = getJobDirectory(userDataPath, jobId);
  await fs.mkdir(jobDirectory, { recursive: true });
  await fs.writeFile(
    getJobResultPath(userDataPath, jobId),
    JSON.stringify(result, null, 2),
    "utf8"
  );
}

async function loadPersistedJobs(userDataPath) {
  const rootPath = getJobsRootPath(userDataPath);
  await fs.mkdir(rootPath, { recursive: true });
  const directoryEntries = await fs.readdir(rootPath, {
    withFileTypes: true
  });
  const jobs = [];

  for (const directoryEntry of directoryEntries) {
    if (!directoryEntry.isDirectory()) {
      continue;
    }

    try {
      const metaPath = getJobMetaPath(userDataPath, directoryEntry.name);
      const content = await fs.readFile(metaPath, "utf8");
      const parsed = JSON.parse(content);

      if (parsed.status === "queued" || parsed.status === "running") {
        const now = new Date().toISOString();
        parsed.status = "failed";
        parsed.stage = "任务已中断";
        parsed.error = RESTART_ABORT_MESSAGE;
        parsed.finishedAt = now;
        parsed.updatedAt = now;
        await persistJobMeta(userDataPath, parsed);
      }

      jobs.push(parsed);
    } catch {
      // Ignore malformed historical entries.
    }
  }

  jobs.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return jobs;
}

export function createJobManager({ userDataPath }) {
  const jobs = new Map();
  const queue = [];
  let activeController = null;
  let closed = false;
  const ready = (async () => {
    const persistedJobs = await loadPersistedJobs(userDataPath);

    for (const job of persistedJobs) {
      jobs.set(job.id, job);
    }
  })();

  async function updateJob(jobId, patch) {
    const currentJob = jobs.get(jobId);

    if (!currentJob) {
      return null;
    }

    Object.assign(currentJob, patch, {
      updatedAt: new Date().toISOString()
    });
    await persistJobMeta(userDataPath, currentJob);
    return currentJob;
  }

  async function failJob(jobId, errorMessage, stage) {
    const finishedAt = new Date().toISOString();
    return updateJob(jobId, {
      status: "failed",
      stage,
      error: errorMessage,
      finishedAt
    });
  }

  async function pumpQueue() {
    await ready;

    if (closed || activeController || queue.length === 0) {
      return;
    }

    const nextEntry = queue.shift();
    if (!nextEntry) {
      return;
    }

    const currentJob = jobs.get(nextEntry.jobId);
    if (!currentJob) {
      void pumpQueue();
      return;
    }

    let worker;

    try {
      worker = fork(workerEntryPath, [], {
        stdio: ["ignore", "ignore", "ignore", "ipc"]
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "后台执行进程启动失败。";
      await failJob(currentJob.id, message, "任务启动失败");
      void pumpQueue();
      return;
    }

    let settled = false;
    const finalizeJob = async ({
      status,
      stage,
      errorMessage,
      result
    }) => {
      if (settled) {
        return;
      }

      settled = true;

      if (activeController?.jobId === currentJob.id) {
        activeController = null;
      }

      const finishedAt = new Date().toISOString();

      if (result) {
        await persistJobResult(userDataPath, currentJob.id, result);
      }

      await updateJob(currentJob.id, {
        status,
        stage,
        error: errorMessage,
        finishedAt,
        progressPercent: status === "completed" ? 100 : currentJob.progressPercent,
        resultSummary: result
          ? {
              documents: result.documents.length,
              qaPairs: result.qaPairs.length,
              warnings: result.warnings.length
            }
          : currentJob.resultSummary
      });

      if (!worker.killed) {
        try {
          worker.kill("SIGTERM");
        } catch {
          // Ignore late kill failures.
        }
      }

      void pumpQueue();
    };

    activeController = {
      jobId: currentJob.id,
      stop: async () => {
        await finalizeJob({
          status: "failed",
          stage: "任务已中止",
          errorMessage: CLOSE_ABORT_MESSAGE
        });
      }
    };

    await updateJob(currentJob.id, {
      status: "running",
      stage: "后台任务已启动",
      startedAt: new Date().toISOString(),
      finishedAt: undefined,
      error: "",
      progressPercent: 3
    });

    worker.on("message", (message) => {
      if (!message || typeof message !== "object") {
        return;
      }

      if (message.type === "progress") {
        void updateJob(currentJob.id, {
          stage: message.stage || "处理中",
          progressPercent:
            typeof message.progressPercent === "number"
              ? message.progressPercent
              : currentJob.progressPercent
        });
        return;
      }

      if (message.type === "completed") {
        void finalizeJob({
          status: "completed",
          stage: "任务已完成",
          result: message.result
        });
        return;
      }

      if (message.type === "failed") {
        void finalizeJob({
          status: "failed",
          stage: "执行失败",
          errorMessage: message.error || "后台任务执行失败。"
        });
      }
    });

    worker.once("exit", (code, signal) => {
      if (settled) {
        return;
      }

      const codeText = typeof code === "number" ? String(code) : "null";
      const signalText = signal || "none";
      void finalizeJob({
        status: "failed",
        stage: "执行失败",
        errorMessage: `后台执行进程异常退出（code=${codeText}, signal=${signalText}）。`
      });
    });

    worker.send({
      type: "run",
      jobId: currentJob.id,
      userDataPath,
      payload: nextEntry.payload
    });
  }

  return {
    async createJob(payload) {
      await ready;

      if (closed) {
        throw new Error("后台任务管理器已经关闭。");
      }

      const now = new Date().toISOString();
      const job = {
        id: randomUUID(),
        status: "queued",
        createdAt: now,
        updatedAt: now,
        progressPercent: 0,
        stage: "等待执行"
      };

      jobs.set(job.id, job);
      await persistJobMeta(userDataPath, job);
      queue.push({
        jobId: job.id,
        payload
      });
      void pumpQueue();
      return cloneJob(job);
    },

    async getJob(jobId) {
      await ready;
      return cloneJob(jobs.get(jobId) || null);
    },

    async getJobResult(jobId) {
      await ready;
      const currentJob = jobs.get(jobId);

      if (!currentJob) {
        return null;
      }

      if (currentJob.status !== "completed") {
        throw new Error("任务尚未完成，暂时不能读取结果。");
      }

      const content = await fs.readFile(getJobResultPath(userDataPath, jobId), "utf8");
      return JSON.parse(content);
    },

    async close() {
      await ready;
      closed = true;

      while (queue.length > 0) {
        const queuedEntry = queue.shift();
        if (!queuedEntry) {
          continue;
        }

        await failJob(queuedEntry.jobId, QUEUE_ABORT_MESSAGE, "任务未执行");
      }

      if (activeController) {
        await activeController.stop();
      }
    }
  };
}
