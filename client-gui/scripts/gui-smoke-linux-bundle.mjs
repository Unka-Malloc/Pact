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

function requireTool(name) {
  const result = spawnSync("bash", ["-lc", `command -v ${name}`], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Required GUI test tool is missing: ${name}`);
  }
  return result.stdout.trim();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result.stdout;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = predicate();
    if (value) {
      return value;
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function captureWindow(pathname, env, windowId) {
  const result = spawnSync("import", ["-window", windowId, pathname], {
    env,
    encoding: "utf8",
  });
  if (result.status === 0) {
    return;
  }
  run("scrot", [pathname], { env });
}

function screenshot(pathname, env, windowId) {
  captureWindow(pathname, env, windowId);
  const size = statSync(pathname).size;
  if (size < 1_000) {
    throw new Error(`Screenshot is unexpectedly small: ${pathname} (${size} bytes)`);
  }
  const colorsRaw = run("identify", ["-format", "%k", pathname], { env }).trim();
  const colors = Number.parseInt(colorsRaw, 10);
  if (!Number.isFinite(colors) || colors < 8) {
    throw new Error(`Screenshot appears blank: ${pathname} (${colorsRaw} colors)`);
  }
  return { path: pathname, byteSize: size, colors };
}

async function waitForScreenshot(pathname, env, windowId, timeoutMs) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      return screenshot(pathname, env, windowId);
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }
  throw lastError || new Error(`Timed out waiting for screenshot: ${pathname}`);
}

function writeSmokeWorkspace(dataDir) {
  const mailDir = path.join(dataDir, "mail-imports");
  const indexDir = path.join(mailDir, "index");
  mkdirSync(indexDir, { recursive: true });
  writeFileSync(
    path.join(dataDir, "settings.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        bootstrapBaseUrl: "",
        resolvedServiceBaseUrl: "",
        expertVocabularySyncPolicy: "manual",
        indexHotUpdatePolicy: "automatic",
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(mailDir, "expert-vocabulary.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        version: 101,
        updatedAt: "unix:101",
        publishedAt: "unix:101",
        source: "linux-gui-smoke",
        checksum: "linux-gui-smoke-checksum",
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
    throw new Error("Linux GUI smoke tests must run inside Linux.");
  }

  requireTool("Xvfb");
  requireTool("xdotool");
  requireTool("scrot");
  requireTool("identify");

  const bundleDir = findLinuxBundle();
  const flutterBinary = path.join(bundleDir, "flutter_client");
  const cli = path.join(bundleDir, "splitall-client");
  const daemon = path.join(bundleDir, "splitall-clientd");
  const packagingManifest = path.join(bundleDir, "portable-data", "backend", "packaging-modules.json");
  for (const file of [flutterBinary, cli, daemon]) {
    if (!existsSync(file)) {
      throw new Error(`Bundle binary is missing: ${file}`);
    }
  }
  if (!existsSync(packagingManifest)) {
    throw new Error(`Packaging manifest is missing: ${packagingManifest}`);
  }

  const artifactDir = path.resolve(
    process.env.SPLITALL_GUI_ARTIFACT_DIR ||
      path.join(flutterClientRoot, "build", "linux-gui-smoke"),
  );
  mkdirSync(artifactDir, { recursive: true });

  const dataDir = path.join(os.tmpdir(), `splitall-linux-gui-${process.pid}-${Date.now()}`);
  mkdirSync(dataDir, { recursive: true });
  writeSmokeWorkspace(dataDir);

  const display = `:${100 + (process.pid % 400)}`;
  const env = {
    ...process.env,
    DISPLAY: display,
    GDK_BACKEND: "x11",
    GDK_GL: "software",
    LIBGL_ALWAYS_SOFTWARE: "1",
    NO_AT_BRIDGE: "1",
    SPLITALL_PORTABLE_DIR: dataDir,
    SPLITALL_CLIENTD_PATH: daemon,
  };
  const xvfb = spawn(
    "Xvfb",
    [display, "-screen", "0", "1440x900x24", "-ac", "+extension", "GLX", "+render", "-noreset", "-nolisten", "tcp"],
    { stdio: "ignore" },
  );
  const stdout = [];
  const stderr = [];
  let app;

  try {
    await sleep(500);
    if (xvfb.exitCode != null) {
      throw new Error(`Xvfb exited early with code ${xvfb.exitCode}`);
    }

    app = spawn(flutterBinary, ["--enable-software-rendering"], {
      cwd: bundleDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    app.stdout.on("data", (chunk) => stdout.push(chunk.toString()));
    app.stderr.on("data", (chunk) => stderr.push(chunk.toString()));

    const windowId = await waitFor(() => {
      if (app.exitCode != null) {
        throw new Error(
          `Flutter app exited early with code ${app.exitCode}\nstdout:\n${stdout.join("")}\nstderr:\n${stderr.join("")}`,
        );
      }
      for (const args of [
        ["search", "--onlyvisible", "--name", "SplitAll|splitall|flutter_client|Flutter"],
        ["search", "--onlyvisible", "--name", ".*"],
      ]) {
        const result = spawnSync("xdotool", args, {
          env,
          encoding: "utf8",
        });
        const windowId = result.status === 0
          ? result.stdout.trim().split(/\s+/).find(Boolean)
          : "";
        if (windowId) {
          return windowId;
        }
      }
      return "";
    }, 20_000, "visible Flutter window");

    spawnSync("xdotool", ["windowmap", windowId], { env, stdio: "ignore" });
    spawnSync("xdotool", ["windowmove", windowId, "40", "40"], { env, stdio: "ignore" });
    spawnSync("xdotool", ["windowsize", windowId, "1280", "800"], { env, stdio: "ignore" });

    await sleep(1500);
    const initial = await waitForScreenshot(
      path.join(artifactDir, "splitall-linux-initial.png"),
      env,
      windowId,
      30_000,
    );
    run("xdotool", ["mousemove", "360", "280", "click", "1", "key", "Tab", "key", "Tab"], {
      env,
    });
    await sleep(750);
    const afterInteraction = await waitForScreenshot(
      path.join(artifactDir, "splitall-linux-after-interaction.png"),
      env,
      windowId,
      10_000,
    );

    const stateFile = path.join(dataDir, "backend", "runtime-state.json");
    const state = existsSync(stateFile)
      ? JSON.parse(readFileSync(stateFile, "utf8"))
      : null;

    console.log(JSON.stringify({
      ok: true,
      bundleDir,
      artifactDir,
      dataDir,
      windowId,
      runtimeStateSeen: Boolean(state),
      screenshots: [initial, afterInteraction],
      checks: [
        "Flutter Linux bundle launches under Ubuntu X11",
        "visible window is discoverable",
        "screenshots are nonblank",
        "basic pointer and keyboard interaction does not crash",
        "sidecar daemon path is available to the app",
      ],
    }, null, 2));
  } finally {
    writeFileSync(path.join(artifactDir, "splitall-linux-app-stdout.log"), stdout.join(""));
    writeFileSync(path.join(artifactDir, "splitall-linux-app-stderr.log"), stderr.join(""));
    if (app && app.exitCode == null) {
      app.kill("SIGTERM");
      await sleep(500);
      if (app.exitCode == null) {
        app.kill("SIGKILL");
      }
    }
    spawnSync(cli, ["daemon", "stop"], { env, stdio: "ignore" });
    if (xvfb.exitCode == null) {
      xvfb.kill("SIGTERM");
    }
    rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
