import process from "node:process";
import { runSplitJob } from "../job-runner.mjs";

function send(message) {
  if (typeof process.send === "function") {
    process.send(message);
  }
}

async function executeRun(message) {
  try {
    const result = await runSplitJob(message.userDataPath, message.payload, {
      onProgress: ({ progressPercent, stage }) => {
        send({
          type: "progress",
          progressPercent,
          stage
        });
      }
    });

    send({
      type: "completed",
      result
    });
    process.exit(0);
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : "后台任务执行失败。";

    send({
      type: "failed",
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
  send({
    type: "failed",
    error: error instanceof Error ? error.message : "后台进程异常退出。"
  });
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  send({
    type: "failed",
    error: error instanceof Error ? error.message : "后台进程未处理拒绝。"
  });
  process.exit(1);
});
