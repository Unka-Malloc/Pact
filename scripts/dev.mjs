import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const rendererUrl = "http://127.0.0.1:5173";
const children = [];

function spawnChild(command, args, extra = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: process.env,
    ...extra
  });

  children.push(child);
  return child;
}

async function waitForServer(url, timeoutMs = 20000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore connection errors while Vite is booting.
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const renderer = spawnChild(npmCommand, ["run", "dev:renderer"]);

renderer.on("exit", (code) => {
  if (code && code !== 0) {
    shutdown(code);
  }
});

await waitForServer(rendererUrl);

const electron = spawnChild(npxCommand, ["electron", "."], {
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: rendererUrl
  }
});

electron.on("exit", (code) => {
  shutdown(code ?? 0);
});
