#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizePort(value) {
  const port = Number(value || 8787);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`无效端口号：${value}`);
  }
  return port;
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || projectRoot,
      env: options.env || process.env,
      stdio: options.stdio || "inherit"
    });
    let stdout = "";
    let stderr = "";
    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });
    }
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} ${args.join(" ")} 被信号 ${signal} 终止`));
        return;
      }
      if (code !== 0 && options.allowFailure !== true) {
        reject(new Error(`${command} ${args.join(" ")} 退出码 ${code}\n${stderr || stdout}`));
        return;
      }
      resolve({ code: code || 0, stdout, stderr });
    });
  });
}

async function killPortListeners(port) {
  const result = await runCommand("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
    stdio: ["ignore", "pipe", "pipe"],
    allowFailure: true
  });
  const pids = result.stdout
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (pids.length === 0) {
    return;
  }
  await runCommand("kill", pids, { stdio: "ignore", allowFailure: true });
  await new Promise((resolve) => setTimeout(resolve, 700));
  const stillAlive = await runCommand("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
    stdio: ["ignore", "pipe", "pipe"],
    allowFailure: true
  });
  const remaining = stillAlive.stdout
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (remaining.length > 0) {
    await runCommand("kill", ["-9", ...remaining], { stdio: "ignore", allowFailure: true });
  }
}

function buildPlist({ label, programArguments, logPath, errorLogPath, environment = {} }) {
  const argumentsXml = programArguments
    .map((item) => `    <string>${xmlEscape(item)}</string>`)
    .join("\n");
  const pathValue = [
    path.dirname(process.execPath),
    process.env.PATH || "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  ].join(":");
  const environmentXml = Object.entries({
    PATH: pathValue,
    ...environment
  })
    .map(([key, value]) => `    <key>${xmlEscape(key)}</key>\n    <string>${xmlEscape(value)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(label)}</string>
  <key>ProgramArguments</key>
  <array>
${argumentsXml}
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(projectRoot)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${environmentXml}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(errorLogPath)}</string>
</dict>
</plist>
`;
}

async function waitForHealth({ host, port, timeoutMs = 12000 }) {
  const startedAt = Date.now();
  const url = `http://${host}:${port}/api/healthz`;
  let lastError = "";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      const payload = await response.json();
      if (response.ok && payload?.ok === true) {
        return { url, payload };
      }
      lastError = `${response.status} ${JSON.stringify(payload)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`服务健康检查失败：${url}，最后错误：${lastError}`);
}

async function restartLaunchAgent({ launchTarget, serviceTarget, plistPath }) {
  await runCommand("/bin/launchctl", ["bootout", launchTarget, plistPath], {
    stdio: "ignore",
    allowFailure: true
  });
  await runCommand("/bin/launchctl", ["bootstrap", launchTarget, plistPath], {
    stdio: "inherit"
  });
  await runCommand("/bin/launchctl", ["kickstart", "-k", serviceTarget], {
    stdio: "ignore",
    allowFailure: true
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const host = String(args.host || "127.0.0.1").trim();
  const port = normalizePort(args.port);
  const label = String(args.label || `dev.splitall.server.${port}`).trim();
  const supervisorLabel = String(args["supervisor-label"] || "dev.splitall.background-supervisor").trim();
  const inspectionLabel = String(args["inspection-label"] || "dev.splitall.system-inspection").trim();
  const dataDir = path.resolve(
    String(args["data-dir"] || process.env.SPLITALL_SERVER_DATA_DIR || path.join(projectRoot, "build", "server-data"))
  );
  const logsDir = path.join(projectRoot, "build", "logs");
  const logPath = path.join(logsDir, `server-${port}.log`);
  const errorLogPath = path.join(logsDir, `server-${port}.err.log`);
  const supervisorLogPath = path.join(logsDir, "background-supervisor.log");
  const supervisorErrorLogPath = path.join(logsDir, "background-supervisor.err.log");
  const inspectionLogPath = path.join(logsDir, "system-inspection.log");
  const inspectionErrorLogPath = path.join(logsDir, "system-inspection.err.log");
  const launchAgentsDir = path.join(os.homedir(), "Library", "LaunchAgents");
  const plistPath = path.join(launchAgentsDir, `${label}.plist`);
  const supervisorPlistPath = path.join(launchAgentsDir, `${supervisorLabel}.plist`);
  const inspectionPlistPath = path.join(launchAgentsDir, `${inspectionLabel}.plist`);
  const launchTarget = `gui/${process.getuid()}`;
  const serviceTarget = `${launchTarget}/${label}`;
  const supervisorServiceTarget = `${launchTarget}/${supervisorLabel}`;
  const inspectionServiceTarget = `${launchTarget}/${inspectionLabel}`;

  if (args["skip-build"] !== true) {
    await runCommand("npm", ["run", "build:renderer"]);
  }

  await fs.mkdir(logsDir, { recursive: true });
  await fs.mkdir(launchAgentsDir, { recursive: true });
  await fs.writeFile(
    plistPath,
    buildPlist({
      label,
      programArguments: [
        process.execPath,
        path.join(projectRoot, "server", "scripts", "start-server.mjs"),
        "--host",
        host,
        "--port",
        String(port),
        "--with-ui",
        "--data-dir",
        dataDir
      ],
      logPath,
      errorLogPath,
      environment: {
        SPLITALL_SERVER_DATA_DIR: dataDir,
        SPLITALL_BACKGROUND_SUPERVISOR: "1",
        SPLITALL_IMPORT_WORKER_EXTERNAL: "1",
        SPLITALL_SOURCE_WATCHER_EXTERNAL: "1",
        SPLITALL_MAINTENANCE_WORKER_EXTERNAL: "1"
      }
    }),
    "utf8"
  );
  await fs.writeFile(
    supervisorPlistPath,
    buildPlist({
      label: supervisorLabel,
      programArguments: [
        process.execPath,
        path.join(projectRoot, "server", "scripts", "background-supervisor.mjs"),
        "--data-dir",
        dataDir
      ],
      logPath: supervisorLogPath,
      errorLogPath: supervisorErrorLogPath,
      environment: {
        SPLITALL_SERVER_DATA_DIR: dataDir
      }
    }),
    "utf8"
  );
  await fs.writeFile(
    inspectionPlistPath,
    buildPlist({
      label: inspectionLabel,
      programArguments: [
        process.execPath,
        path.join(projectRoot, "server", "scripts", "system-inspection-daemon.mjs"),
        "--project-root",
        projectRoot,
        "--data-dir",
        dataDir
      ],
      logPath: inspectionLogPath,
      errorLogPath: inspectionErrorLogPath,
      environment: {
        SPLITALL_SERVER_DATA_DIR: dataDir
      }
    }),
    "utf8"
  );

  await runCommand("/bin/launchctl", ["bootout", launchTarget, plistPath], {
    stdio: "ignore",
    allowFailure: true
  });
  await runCommand("/bin/launchctl", ["bootout", launchTarget, supervisorPlistPath], {
    stdio: "ignore",
    allowFailure: true
  });
  await runCommand("/bin/launchctl", ["bootout", launchTarget, inspectionPlistPath], {
    stdio: "ignore",
    allowFailure: true
  });
  await killPortListeners(port);
  await restartLaunchAgent({ launchTarget, serviceTarget, plistPath });
  await restartLaunchAgent({
    launchTarget,
    serviceTarget: supervisorServiceTarget,
    plistPath: supervisorPlistPath
  });
  await restartLaunchAgent({
    launchTarget,
    serviceTarget: inspectionServiceTarget,
    plistPath: inspectionPlistPath
  });

  const health = await waitForHealth({ host, port });
  console.log(
    JSON.stringify(
      {
        ok: true,
        service: serviceTarget,
        supervisorService: supervisorServiceTarget,
        inspectionService: inspectionServiceTarget,
        plistPath,
        supervisorPlistPath,
        inspectionPlistPath,
        logPath,
        errorLogPath,
        supervisorLogPath,
        supervisorErrorLogPath,
        inspectionLogPath,
        inspectionErrorLogPath,
        health
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
