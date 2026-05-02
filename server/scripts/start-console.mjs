import { spawn } from "node:child_process";
import process from "node:process";

function forwardSignals(childProcess) {
  const relay = (signal) => {
    if (childProcess.killed) {
      return;
    }

    childProcess.kill(signal);
  };

  process.on("SIGINT", () => relay("SIGINT"));
  process.on("SIGTERM", () => relay("SIGTERM"));
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      stdio: "inherit",
      env: options.env || process.env
    });

    childProcess.on("error", (error) => {
      reject(error);
    });

    childProcess.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(" ")} 被信号 ${signal} 终止`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} 退出码为 ${code}`));
        return;
      }

      resolve();
    });
  });
}

console.log("Building SplitAll server console...");
await runCommand("npm", ["run", "build:renderer"]);

const passthroughArgs = process.argv.slice(2);
const startupArgs = new Set(passthroughArgs);
startupArgs.add("--with-ui");

const finalArgs = ["server/scripts/start-server.mjs", ...Array.from(startupArgs)];

console.log("Starting SplitAll server with console...");
const serverProcess = spawn("node", finalArgs, {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env
});

forwardSignals(serverProcess);

const exitCode = await new Promise((resolve, reject) => {
  serverProcess.on("error", (error) => {
    reject(error);
  });

  serverProcess.on("exit", (code, signal) => {
    if (signal) {
      reject(new Error(`node ${finalArgs.join(" ")} 被信号 ${signal} 终止`));
      return;
    }

    resolve(code || 0);
  });
});

process.exit(exitCode);
