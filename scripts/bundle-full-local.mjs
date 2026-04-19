import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const builderConfigPath = path.join(projectRoot, "electron-builder.full-local.json");
const tikaJarPath = path.join(projectRoot, "vendor", "tika", "tika-app-3.2.3.jar");

const RUNTIME_EXECUTABLES = {
  "darwin-arm64": {
    jre: ["vendor/jre/darwin-arm64/bin/java"],
    ocr: [
      "vendor/ocr-runtime/darwin-arm64/bin/python3",
      "vendor/ocr-runtime/darwin-arm64/bin/python",
      "vendor/ocr-runtime/darwin-arm64/python/bin/python3",
      "vendor/ocr-runtime/darwin-arm64/.venv/bin/python",
      "vendor/ocr-runtime/darwin-arm64/venv/bin/python"
    ]
  },
  "linux-x64": {
    jre: ["vendor/jre/linux-x64/bin/java"],
    ocr: [
      "vendor/ocr-runtime/linux-x64/bin/python3",
      "vendor/ocr-runtime/linux-x64/bin/python",
      "vendor/ocr-runtime/linux-x64/python/bin/python3",
      "vendor/ocr-runtime/linux-x64/.venv/bin/python",
      "vendor/ocr-runtime/linux-x64/venv/bin/python"
    ]
  },
  "linux-arm64": {
    jre: ["vendor/jre/linux-arm64/bin/java"],
    ocr: [
      "vendor/ocr-runtime/linux-arm64/bin/python3",
      "vendor/ocr-runtime/linux-arm64/bin/python",
      "vendor/ocr-runtime/linux-arm64/python/bin/python3",
      "vendor/ocr-runtime/linux-arm64/.venv/bin/python",
      "vendor/ocr-runtime/linux-arm64/venv/bin/python"
    ]
  },
  "win32-x64": {
    jre: ["vendor/jre/win32-x64/bin/java.exe"],
    ocr: [
      "vendor/ocr-runtime/win32-x64/python.exe",
      "vendor/ocr-runtime/win32-x64/Scripts/python.exe",
      "vendor/ocr-runtime/win32-x64/.venv/Scripts/python.exe",
      "vendor/ocr-runtime/win32-x64/venv/Scripts/python.exe"
    ]
  }
};

function commandName(base) {
  return process.platform === "win32" ? `${base}.cmd` : base;
}

function parseArgs(argv) {
  const flags = new Set(argv);

  if (flags.has("--mac")) {
    return {
      platform: "mac",
      runtimes: ["darwin-arm64"],
      builderArgs: ["--mac", "dir", "--arm64"]
    };
  }

  if (flags.has("--win")) {
    return {
      platform: "win",
      runtimes: ["win32-x64"],
      builderArgs: ["--win", "nsis", "portable", "--x64"]
    };
  }

  if (flags.has("--linux") && flags.has("--arm64")) {
    return {
      platform: "linux",
      runtimes: ["linux-arm64"],
      builderArgs: ["--linux", "AppImage", "deb", "--arm64"]
    };
  }

  if (flags.has("--linux")) {
    return {
      platform: "linux",
      runtimes: ["linux-x64"],
      builderArgs: ["--linux", "AppImage", "deb", "--x64"]
    };
  }

  throw new Error(
    "用法：node scripts/bundle-full-local.mjs --mac | --win | --linux [--arm64|--x64]"
  );
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function requireOneOf(paths, label) {
  for (const relativePath of paths) {
    const absolutePath = path.join(projectRoot, relativePath);
    if (await pathExists(absolutePath)) {
      return absolutePath;
    }
  }

  throw new Error(
    `${label} 未准备好。请确认以下路径之一存在：\n${paths
      .map((value) => `- ${value}`)
      .join("\n")}`
  );
}

async function validateRuntimeBundle(runtimeKey) {
  const descriptor = RUNTIME_EXECUTABLES[runtimeKey];
  if (!descriptor) {
    throw new Error(`不支持的运行时目录：${runtimeKey}`);
  }

  await requireOneOf(descriptor.jre, `${runtimeKey} 的 JRE 17`);
  await requireOneOf(descriptor.ocr, `${runtimeKey} 的 PaddleOCR Python 运行时`);
}

async function validateInputs(runtimeKeys) {
  if (!(await pathExists(tikaJarPath))) {
    throw new Error("缺少 Tika JAR：vendor/tika/tika-app-3.2.3.jar");
  }

  for (const runtimeKey of runtimeKeys) {
    await validateRuntimeBundle(runtimeKey);
  }
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      env: process.env
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} 失败，退出码 ${code ?? 1}`));
    });
  });
}

async function main() {
  const selection = parseArgs(process.argv.slice(2));
  await validateInputs(selection.runtimes);
  await runCommand(commandName("npm"), ["run", "build:renderer"]);
  await runCommand(commandName("npx"), [
    "electron-builder",
    "--config",
    builderConfigPath,
    ...selection.builderArgs
  ]);
}

main().catch((error) => {
  console.error(
    `[bundle-full-local] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
