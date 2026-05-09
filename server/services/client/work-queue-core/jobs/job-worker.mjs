import process from "node:process";
import { runSplitJob } from "./job-runner.mjs";

function send(message) {
  return new Promise((resolve, reject) => {
    if (typeof process.send !== "function") {
      resolve();
      return;
    }

    process.send(message, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function executeRun(message) {
  const trace = message.trace || {};
  try {
    const result = await runSplitJob(message.userDataPath, message.payload, {
      jobId: message.jobId,
      runtimeOptions: message.runtimeOptions || {},
      onProgress: ({ progressPercent, stage }) => {
        void send({
          type: "progress",
          trace,
          progressPercent,
          stage
        });
      }
    });

    await send({
      type: "completed",
      trace,
      result
    });
    process.exit(0);
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : "后台任务执行失败。";

    await send({
      type: "failed",
      trace,
      error: messageText
    });
    process.exit(1);
  }
}

process.on("message", (message) => {
  if (!message || message.type !== "run") {
    return;
  }

  void executeRun(message);
});

process.on("uncaughtException", (error) => {
  void send({
    type: "failed",
    error: error instanceof Error ? error.message : "后台进程异常退出。"
  }).finally(() => {
    process.exit(1);
  });
});

process.on("unhandledRejection", (error) => {
  void send({
    type: "failed",
    error: error instanceof Error ? error.message : "后台进程未处理拒绝。"
  }).finally(() => {
    process.exit(1);
  });
});
