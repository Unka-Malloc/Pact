import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const portableRoot = path.join(workspaceRoot, "portable-client");
const releaseRoot = path.join(workspaceRoot, "release", "portable-client");
const appExecutableName = "SplitAllPortable";

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
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

function resolveBinary(name) {
  const extension = process.platform === "win32" ? ".exe" : "";
  const candidates = [
    process.env[`${name.toUpperCase()}_BIN`],
    path.join(os.homedir(), ".cargo", "bin", `${name}${extension}`),
    name,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(`找不到 ${name}，请先安装 Rust 工具链。`);
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: workspaceRoot,
    stdio: "inherit",
    ...options,
  });
}

function readCommand(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    ...options,
  }).trim();
}

function detectTarget(rustcBin) {
  const version = readCommand(rustcBin, ["-vV"]);
  const hostLine = version
    .split(/\r?\n/)
    .find((line) => line.startsWith("host: "));

  if (!hostLine) {
    throw new Error("无法从 rustc -vV 解析当前 host triple。");
  }

  return hostLine.slice("host: ".length).trim();
}

function describeTarget(target) {
  const normalized = target.toLowerCase();
  const platform = normalized.includes("windows")
    ? "windows"
    : normalized.includes("linux")
      ? "linux"
      : normalized.includes("darwin")
        ? "macos"
        : "unknown";
  const arch = normalized.includes("aarch64") || normalized.includes("arm64")
    ? "arm64"
    : normalized.includes("x86_64")
      ? "x64"
      : "unknown";

  return { platform, arch };
}

function binaryNameForTarget(target) {
  return target.toLowerCase().includes("windows")
    ? `${appExecutableName}.exe`
    : appExecutableName;
}

function sourceBinaryPath(target) {
  const binaryFile = target.toLowerCase().includes("windows")
    ? "portable-client.exe"
    : "portable-client";
  const targetDir = path.join(
    portableRoot,
    "target",
    target,
    "release",
    binaryFile,
  );

  if (existsSync(targetDir)) {
    return targetDir;
  }

  const hostDir = path.join(portableRoot, "target", "release", binaryFile);
  if (existsSync(hostDir)) {
    return hostDir;
  }

  throw new Error(`未找到构建产物：${targetDir}`);
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function removePath(targetPath) {
  rmSync(targetPath, { recursive: true, force: true });
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function writePortableDefaults(bundleDir) {
  const settingsExample = {
    serverBaseUrl: "",
    apiBaseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4.1-mini",
    systemPrompt: "按服务端默认提示词生成结构化结果。",
  };
  const notes = [
    "SplitAll Portable",
    "",
    "1. 把服务地址填到 portable-data/settings.json 或界面里。",
    "2. 导出结果默认建议放到 portable-data/exports。",
    "3. 这个目录可以整体复制到另一台机器继续使用。",
    "",
  ].join("\n");

  const dataDir = path.join(bundleDir, "portable-data");
  ensureDir(path.join(dataDir, "exports"));
  writeFileSync(
    path.join(dataDir, "settings.example.json"),
    `${JSON.stringify(settingsExample, null, 2)}\n`,
  );
  writeFileSync(path.join(bundleDir, "README.txt"), notes);
}

function writeMacInfoPlist(plistPath) {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>${appExecutableName}</string>
  <key>CFBundleExecutable</key>
  <string>${appExecutableName}</string>
  <key>CFBundleIdentifier</key>
  <string>com.splitall.portable</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${appExecutableName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
</dict>
</plist>
`;

  writeFileSync(plistPath, plist);
}

function copyBundleFiles(bundleDir, binarySource, binaryTargetName, target) {
  ensureDir(bundleDir);
  copyFileSync(binarySource, path.join(bundleDir, binaryTargetName));
  if (!target.toLowerCase().includes("windows")) {
    chmodSync(path.join(bundleDir, binaryTargetName), 0o755);
  }

  copyFileSync(
    path.join(portableRoot, "README.md"),
    path.join(bundleDir, "README.md"),
  );
  writePortableDefaults(bundleDir);
}

function createMacAppBundle(artifactDir, binarySource) {
  const appDir = path.join(artifactDir, `${appExecutableName}.app`);
  const contentsDir = path.join(appDir, "Contents");
  const macosDir = path.join(contentsDir, "MacOS");
  const resourcesDir = path.join(contentsDir, "Resources");

  removePath(appDir);
  ensureDir(macosDir);
  ensureDir(resourcesDir);

  const binaryTarget = path.join(macosDir, appExecutableName);
  copyFileSync(binarySource, binaryTarget);
  chmodSync(binaryTarget, 0o755);
  copyFileSync(path.join(portableRoot, "README.md"), path.join(resourcesDir, "README.md"));
  writePortableDefaults(resourcesDir);
  writeMacInfoPlist(path.join(contentsDir, "Info.plist"));

  return appDir;
}

function archiveBundle(artifactDir, bundleName, target) {
  const bundleDir = path.join(artifactDir, bundleName);
  const created = [];
  const zipPath = path.join(artifactDir, `${bundleName}.zip`);
  removePath(zipPath);

  try {
    if (process.platform === "darwin") {
      run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", bundleDir, zipPath], {
        cwd: artifactDir,
      });
    } else {
      run("zip", ["-qr", zipPath, bundleName], { cwd: artifactDir });
    }
    created.push(zipPath);
  } catch (error) {
    console.warn(`跳过 zip 打包：${error.message}`);
  }

  if (!target.toLowerCase().includes("windows")) {
    const tarPath = path.join(artifactDir, `${bundleName}.tar.gz`);
    removePath(tarPath);
    try {
      run("tar", ["-czf", tarPath, bundleName], { cwd: artifactDir });
      created.push(tarPath);
    } catch (error) {
      console.warn(`跳过 tar.gz 打包：${error.message}`);
    }
  }

  return created;
}

function archiveMacApp(appDir, artifactDir, targetLabel) {
  const zipPath = path.join(artifactDir, `${appExecutableName}-${targetLabel}.app.zip`);
  removePath(zipPath);
  run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", path.basename(appDir), zipPath], {
    cwd: artifactDir,
  });
  return zipPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cargoBin = resolveBinary("cargo");
  const rustcBin = resolveBinary("rustc");
  const target = args.target || detectTarget(rustcBin);
  const { platform, arch } = describeTarget(target);
  const targetLabel = `${platform}-${arch}`;
  const packageName = `SplitAllPortable-${targetLabel}`;
  const artifactDir = path.join(releaseRoot, targetLabel);
  const bundleDir = path.join(artifactDir, packageName);

  ensureDir(artifactDir);

  const cargoArgs = ["build", "--release"];
  if (args.target) {
    cargoArgs.push("--target", target);
  }

  run(cargoBin, cargoArgs, { cwd: portableRoot });

  removePath(bundleDir);
  const binarySource = sourceBinaryPath(target);
  copyBundleFiles(bundleDir, binarySource, binaryNameForTarget(target), target);

  const archives = archiveBundle(artifactDir, packageName, target);
  const binaryTarget = path.join(bundleDir, binaryNameForTarget(target));
  const binarySize = formatSize(statSync(binaryTarget).size);
  let appBundlePath = null;
  let appArchivePath = null;

  if (platform === "macos") {
    appBundlePath = createMacAppBundle(artifactDir, binarySource);
    appArchivePath = archiveMacApp(appBundlePath, artifactDir, targetLabel);
  }

  console.log("");
  console.log(`Portable bundle ready: ${bundleDir}`);
  console.log(`Binary size: ${binarySize}`);

  for (const archive of archives) {
    console.log(`Archive: ${archive} (${formatSize(statSync(archive).size)})`);
  }

  if (appBundlePath) {
    console.log(`macOS app: ${appBundlePath}`);
  }
  if (appArchivePath) {
    console.log(`macOS app archive: ${appArchivePath} (${formatSize(statSync(appArchivePath).size)})`);
  }

  console.log("");
  console.log(
    `Portable data dir: ${path.join(bundleDir, "portable-data")}`,
  );
}

main();
