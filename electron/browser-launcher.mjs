import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseArgs(input) {
  const result = [];
  const matcher = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match = matcher.exec(input);

  while (match) {
    result.push(match[1] || match[2] || match[3] || "");
    match = matcher.exec(input);
  }

  return result;
}

function getPlatformCandidates() {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env.ProgramFiles || "";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "";

    return [
      localAppData
        ? path.join(localAppData, "Qaxbrowser", "Application", "qaxbrowser.exe")
        : "",
      programFiles
        ? path.join(programFiles, "Qaxbrowser", "Application", "qaxbrowser.exe")
        : "",
      programFilesX86
        ? path.join(programFilesX86, "Qaxbrowser", "Application", "qaxbrowser.exe")
        : "",
      "qaxbrowser.exe"
    ];
  }

  if (process.platform === "linux") {
    return [
      "/usr/bin/qaxbrowser-safe-stable",
      "/usr/bin/qaxbrowser-safe",
      "/opt/qaxbrowser-safe/qaxbrowser-safe",
      "qaxbrowser-safe-stable",
      "qaxbrowser-safe"
    ];
  }

  return [];
}

async function pathExists(candidate) {
  if (!candidate || (!path.isAbsolute(candidate) && !candidate.startsWith("."))) {
    return true;
  }

  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function tryLaunch(command, args) {
  if (!(await pathExists(command))) {
    throw new Error(`Path not found: ${command}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      detached: false
    });

    const cleanup = () => {
      child.removeAllListeners("error");
      child.removeAllListeners("spawn");
    };

    child.once("error", (error) => {
      cleanup();
      reject(error);
    });

    child.once("spawn", () => {
      cleanup();
      child.unref();
      resolve({
        child,
        command
      });
    });
  });
}

export async function launchQianxinBrowser({ url, settings }) {
  const requestedPath =
    settings.qianxinBrowserPath.trim() || process.env.SPLITALL_QAX_BROWSER_PATH || "";
  const requestedArgs =
    settings.qianxinBrowserArgs.trim() ||
    process.env.SPLITALL_QAX_BROWSER_ARGS ||
    "";
  const commands = unique([requestedPath, ...getPlatformCandidates()]);
  const args = [...parseArgs(requestedArgs), url];
  const failures = [];

  for (const command of commands) {
    try {
      return await tryLaunch(command, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${command}: ${message}`);
    }
  }

  throw new Error(
    [
      "未能启动奇安信浏览器。",
      "请在设置中填写“奇安信浏览器路径”，或通过环境变量 SPLITALL_QAX_BROWSER_PATH 指定可执行文件。",
      failures.length > 0 ? `尝试记录：${failures.join(" | ")}` : ""
    ]
      .filter(Boolean)
      .join("\n")
  );
}
