import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const flutterClientRoot = path.join(workspaceRoot, "client-gui");

function findLinuxBundle() {
  const linuxBuildRoot = path.join(flutterClientRoot, "build", "linux");
  const candidates = [];
  for (const arch of existsSync(linuxBuildRoot) ? readdirSync(linuxBuildRoot) : []) {
    const bundleDir = path.join(linuxBuildRoot, arch, "release", "bundle");
    if (existsSync(path.join(bundleDir, "flutter_client"))) {
      candidates.push(bundleDir);
    }
  }
  if (candidates.length === 0) {
    throw new Error("No Linux bundle found. Run npm run client:build:linux first.");
  }
  candidates.sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  return candidates[0];
}

function runJson(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: path.dirname(command),
    env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(command)} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Command did not return JSON: ${result.stdout}\n${error.message}`);
  }
}

function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        reject(new Error(`Timed out waiting for ${label}`));
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
}

function writeMailWorkspace(dataDir) {
  const mailDir = path.join(dataDir, "mail-imports");
  const indexDir = path.join(mailDir, "index");
  mkdirSync(indexDir, { recursive: true });
  writeFileSync(
    path.join(mailDir, "expert-vocabulary.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        version: 11,
        updatedAt: "unix:11",
        publishedAt: "unix:11",
        source: "ubuntu-smoke",
        checksum: "checksum-ubuntu-smoke",
        entries: [
          {
            id: "contract",
            pathSegments: ["专家", "合同"],
            label: "合同",
            keywords: ["msa", "framework agreement"],
            domains: ["legal.example"],
            status: "active",
            notes: "",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(indexDir, "docs.tsv"),
    [
      "1\tm1\tmail-1.eml\tMSA review\tLegal <counsel@legal.example>\t\t\t\t\t\tInbox\tok\t\t\t\t0\t未分类",
      "2\tm2\tmail-2.eml\tInternal note\tteam@example.com\t\t\t\t\t\tInbox\tok\t\t\t\t0\t未分类",
      "",
    ].join("\n"),
  );
}

async function main() {
  if (process.platform !== "linux") {
    throw new Error("Linux bundle smoke tests must run inside Linux.");
  }

  const bundleDir = findLinuxBundle();
  const flutterBinary = path.join(bundleDir, "flutter_client");
  const cli = path.join(bundleDir, "pact-client");
  const daemon = path.join(bundleDir, "pact-clientd");
  const packagingManifest = path.join(bundleDir, "portable-data", "future-client", "packaging-modules.json");
  for (const file of [flutterBinary, cli, daemon]) {
    if (!existsSync(file)) {
      throw new Error(`Bundle binary is missing: ${file}`);
    }
  }
  if (!existsSync(packagingManifest)) {
    throw new Error(`Packaging manifest is missing: ${packagingManifest}`);
  }
  const manifest = JSON.parse(readFileSync(packagingManifest, "utf8"));
  const enabledModuleIds = new Set(
    manifest.modules?.map((item) => item.id) || []
  );
  const skippedModuleIds = new Set(manifest.skippedModules?.map((item) => item.id) || []);
  for (const moduleId of ["client-cli", "client-daemon", "upload-queue", "knowledge-mirror"]) {
    if (!enabledModuleIds.has(moduleId)) {
      throw new Error(`Packaging manifest does not include required module: ${moduleId}`);
    }
  }
  for (const moduleId of ["macos-mail-import"]) {
    if (enabledModuleIds.has(moduleId) || skippedModuleIds.has(moduleId)) {
      throw new Error(`Linux bundle manifest must not include macOS-only module: ${moduleId}`);
    }
  }
  const macOSMailTool = path.join(bundleDir, "pact-macos-mail-tool");
  if (existsSync(macOSMailTool)) {
    throw new Error(`Linux bundle must not include macOS Mail sidecar: ${macOSMailTool}`);
  }

  const dataDir = path.join(os.tmpdir(), `pact-ubuntu-smoke-${process.pid}-${Date.now()}`);
  mkdirSync(dataDir, { recursive: true });
  const env = { ...process.env, PACT_PORTABLE_DIR: dataDir };
  try {
    writeMailWorkspace(dataDir);
    const rebuild = runJson(cli, ["index", "rebuild"], env);
    if (rebuild.documentCount !== 2 || rebuild.updatedDocumentCount !== 1) {
      throw new Error(`Unexpected rebuild result: ${JSON.stringify(rebuild)}`);
    }
    const search = runJson(cli, ["mail", "search", "msa"], env);
    if (search.total !== 1 || search.results?.[0]?.taxonomyPath !== "专家/合同") {
      throw new Error(`Unexpected search result: ${JSON.stringify(search)}`);
    }

    const child = spawn(daemon, [], {
      cwd: bundleDir,
      env,
      stdio: "ignore",
      detached: false,
    });
    try {
      await waitFor(
        () => existsSync(path.join(dataDir, "backend", "runtime-state.json")),
        10000,
        "runtime-state.json",
      );
      const status = runJson(cli, ["daemon", "status"], env);
      if (status.status !== "running") {
        throw new Error(`Unexpected daemon status: ${JSON.stringify(status)}`);
      }
      runJson(cli, ["daemon", "stop"], env);
      await waitFor(() => {
        const stateFile = path.join(dataDir, "backend", "runtime-state.json");
        if (!existsSync(stateFile)) {
          return false;
        }
        try {
          return JSON.parse(readFileSync(stateFile, "utf8")).daemonStatus === "stopped";
        } catch {
          return false;
        }
      }, 10000, "daemon stopped state");
    } finally {
      if (child.exitCode == null) {
        child.kill("SIGTERM");
      }
    }

    console.log(JSON.stringify({
      ok: true,
      bundleDir,
      checks: [
        "bundle binaries exist",
        "packaging manifest includes required modules",
        "packaging manifest excludes macOS-only Mail module",
        "bundle excludes macOS Mail sidecar",
        "CLI rebuild applies expert vocabulary",
        "CLI search reads updated taxonomy",
        "daemon starts and stops with shared workspace",
      ],
    }, null, 2));
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
