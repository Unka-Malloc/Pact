#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  MCP_CONNECTOR_PACKAGE_NAME,
  MCP_CONNECTOR_VERSION,
  MCP_INTERFACE_VERSION,
  MCP_SERVER_VERSION,
  MCP_STABLE_TOOL_NAME,
  MCP_TOOLSET_VERSION
} from "../platform/common/mcp/http-mcp-adapter.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const connectorRoot = path.join(projectRoot, "mcp-connector");

function parseArgs(argv) {
  const args = {
    "output-dir": path.join(projectRoot, "build", "release", "mcp"),
    channel: "stable",
    json: false,
    publish: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const keyValue = item.slice(2);
    const equalIndex = keyValue.indexOf("=");
    const key = equalIndex >= 0 ? keyValue.slice(0, equalIndex) : keyValue;
    const inlineValue = equalIndex >= 0 ? keyValue.slice(equalIndex + 1) : null;
    if (key === "json") {
      args.json = true;
      continue;
    }
    if (key === "publish") {
      args.publish = true;
      continue;
    }
    const next = argv[index + 1];
    const value = inlineValue !== null ? inlineValue : !next || next.startsWith("--") ? true : next;
    if (inlineValue === null && value !== true) {
      index += 1;
    }
    args[key] = value;
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}

async function run(command, args = [], options = {}) {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd || projectRoot,
    env: {
      ...process.env,
      ...(options.env || {})
    },
    maxBuffer: 10 * 1024 * 1024
  });
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function currentPlatformKey() {
  const platformMap = {
    darwin: "macos",
    linux: "linux",
    win32: "windows"
  };
  const archMap = {
    x64: "x64",
    arm64: "arm64"
  };
  return `${platformMap[process.platform] || process.platform}-${archMap[process.arch] || process.arch}`;
}

function unixExecutableName(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

async function writeExecutable(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  if (process.platform !== "win32") {
    await fs.chmod(filePath, 0o755);
  }
}

async function createPortableBundle({ outputDir, packageJson }) {
  const platform = currentPlatformKey();
  const rootName = `${packageJson.name}-${packageJson.version}-${platform}`;
  const stagingRoot = path.join(outputDir, rootName);
  const appRoot = path.join(stagingRoot, "app");
  const runtimeRoot = path.join(stagingRoot, "runtime");
  const runtimeBinary = process.platform === "win32" ? "node.exe" : "node";
  const runtimePath = path.join(runtimeRoot, runtimeBinary);
  const archiveName = `${rootName}.tar.gz`;
  const archivePath = path.join(outputDir, archiveName);
  const zipArchiveName = `${rootName}.zip`;
  const zipArchivePath = path.join(outputDir, zipArchiveName);

  await fs.rm(stagingRoot, { recursive: true, force: true });
  await fs.rm(archivePath, { force: true });
  await fs.rm(zipArchivePath, { force: true });
  await fs.mkdir(path.join(appRoot, "bin"), { recursive: true });
  await fs.mkdir(runtimeRoot, { recursive: true });
  await fs.copyFile(process.execPath, runtimePath);
  if (process.platform !== "win32") {
    await fs.chmod(runtimePath, 0o755);
  }
  await fs.copyFile(path.join(connectorRoot, "package.json"), path.join(appRoot, "package.json"));
  await fs.copyFile(path.join(connectorRoot, "README.md"), path.join(appRoot, "README.md"));
  await fs.copyFile(
    path.join(connectorRoot, "bin", "agentstudio-mcp.mjs"),
    path.join(appRoot, "bin", "agentstudio-mcp.mjs")
  );

  await writeExecutable(path.join(stagingRoot, "agentstudio-mcp"), [
    "#!/usr/bin/env sh",
    "set -e",
    "DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)",
    "exec \"$DIR/runtime/node\" \"$DIR/app/bin/agentstudio-mcp.mjs\" \"$@\"",
    ""
  ].join("\n"));
  await writeExecutable(path.join(stagingRoot, "agentstudio-mcp.cmd"), [
    "@echo off",
    "set DIR=%~dp0",
    "\"%DIR%runtime\\node.exe\" \"%DIR%app\\bin\\agentstudio-mcp.mjs\" %*",
    ""
  ].join("\r\n"));
  await writeExecutable(path.join(stagingRoot, "install.command"), [
    "#!/usr/bin/env sh",
    "set -e",
    "DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)",
    "\"$DIR/agentstudio-mcp\" install",
    "printf '\\nDone. Press Enter to close.'",
    "IFS= read -r _",
    ""
  ].join("\n"));
  await writeExecutable(path.join(stagingRoot, "uninstall.command"), [
    "#!/usr/bin/env sh",
    "set -e",
    "DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)",
    "printf 'Target to uninstall [codex]: '",
    "IFS= read -r targets",
    "targets=${targets:-codex}",
    "\"$DIR/agentstudio-mcp\" uninstall --target \"$targets\"",
    "printf '\\nDone. Press Enter to close.'",
    "IFS= read -r _",
    ""
  ].join("\n"));
  await writeExecutable(path.join(stagingRoot, "doctor.command"), [
    "#!/usr/bin/env sh",
    "set -e",
    "DIR=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)",
    "\"$DIR/agentstudio-mcp\" doctor",
    "printf '\\nDone. Press Enter to close.'",
    "IFS= read -r _",
    ""
  ].join("\n"));
  await fs.writeFile(path.join(stagingRoot, "README.txt"), [
    "AgentStudio MCP Connector Portable Package",
    "",
    "This package includes its own Node.js runtime. The target machine does not need Node.js, npm, npx, or a package manager.",
    "",
    "Command-line hub registration:",
    "  ./agentstudio-mcp register",
    "",
    "The connector scans local AgentStudio candidates and verifies the MCP identity signature before using a URL.",
    "",
    "Discover the local shared hub:",
    "  ./agentstudio-mcp discover-local",
    "",
    "Connect clients interactively:",
    "  ./agentstudio-mcp install",
    "",
    "Connect one client from a script:",
    "  printf '%s\\n' '<issued-token>' | ./agentstudio-mcp install --target codex --token-stdin",
    "",
    "macOS double-click flow:",
    "  Open install.command, choose one or more clients, then enter the issued token.",
    "",
    "Uninstall:",
    "  ./agentstudio-mcp uninstall --target codex",
    "",
    `Platform: ${platform}`,
    `Connector: ${packageJson.name}@${packageJson.version}`,
    `Bundled Node: ${process.version}`,
    ""
  ].join("\n"));

  await run("tar", ["-czf", archivePath, "-C", outputDir, rootName]);
  await run("zip", ["-qry", zipArchivePath, rootName], { cwd: outputDir });
  const stat = await fs.stat(archivePath);
  const zipStat = await fs.stat(zipArchivePath);
  return {
    platform,
    archiveName,
    archivePath,
    sha256: await sha256(archivePath),
    sizeBytes: stat.size,
    zipArchiveName,
    zipArchivePath,
    zipSha256: await sha256(zipArchivePath),
    zipSizeBytes: zipStat.size,
    rootName,
    executable: unixExecutableName("agentstudio-mcp"),
    includesNodeRuntime: true,
    bundledNodeVersion: process.version
  };
}

function githubOwnerRepo(packageJson) {
  const repositoryUrl = String(packageJson.repository?.url || "");
  const match = repositoryUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return match?.[1] || "Unka-Malloc/AgentStudio";
}

async function createBootstrapInstaller({ outputDir, packageJson, tarballName, tarballSha256, portable }) {
  const scriptName = "agentstudio-mcp-install.sh";
  const scriptPath = path.join(outputDir, scriptName);
  const repo = githubOwnerRepo(packageJson);
  const minimumNodeMajor = Number(String(packageJson.engines?.node || ">=20").match(/\d+/)?.[0] || 20);
  const content = [
    "#!/usr/bin/env sh",
    "set -eu",
    "",
    `REPO=${JSON.stringify(repo)}`,
    `VERSION=${JSON.stringify(packageJson.version)}`,
    `PACKAGE_NAME=${JSON.stringify(packageJson.name)}`,
    `MINIMUM_NODE_MAJOR=${JSON.stringify(minimumNodeMajor)}`,
    `SOURCE_TARBALL=${JSON.stringify(tarballName)}`,
    `SOURCE_TARBALL_SHA256=${JSON.stringify(tarballSha256)}`,
    "BASE_URL=\"${AGENTSTUDIO_MCP_RELEASE_BASE_URL:-https://github.com/${REPO}/releases/latest/download}\"",
    "INSTALL_PARENT=\"${AGENTSTUDIO_MCP_INSTALL_DIR:-$HOME/.agentstudio/mcp/connector}\"",
    "",
    "require_command() {",
    "  if ! command -v \"$1\" >/dev/null 2>&1; then",
    "    echo \"Missing required command: $1\" >&2",
    "    exit 1",
    "  fi",
    "}",
    "",
    "hash_file() {",
    "  if command -v shasum >/dev/null 2>&1; then",
    "    shasum -a 256 \"$1\" | awk '{print $1}'",
    "    return",
    "  fi",
    "  if command -v sha256sum >/dev/null 2>&1; then",
    "    sha256sum \"$1\" | awk '{print $1}'",
    "    return",
    "  fi",
    "  echo \"Missing shasum or sha256sum for release verification.\" >&2",
    "  exit 1",
    "}",
    "",
    "os_name=$(uname -s | tr '[:upper:]' '[:lower:]')",
    "arch_name=$(uname -m | tr '[:upper:]' '[:lower:]')",
    "case \"$os_name\" in",
    "  darwin) os_name=\"macos\" ;;",
    "  linux) os_name=\"linux\" ;;",
    "esac",
    "case \"$arch_name\" in",
    "  x86_64|amd64) arch_name=\"x64\" ;;",
    "  arm64|aarch64) arch_name=\"arm64\" ;;",
    "esac",
    "platform=\"$os_name-$arch_name\"",
    "",
    "require_command curl",
    "require_command awk",
    "",
    "tmp_dir=$(mktemp -d)",
    "cleanup() { rm -rf \"$tmp_dir\"; }",
    "trap cleanup EXIT INT TERM",
    "",
    "node_is_usable() {",
    "  command -v node >/dev/null 2>&1 || return 1",
    "  node -e 'const minimum = Number(process.argv[1]); const major = Number(process.versions.node.split(\".\")[0]); process.exit(major >= minimum ? 0 : 1)' \"$MINIMUM_NODE_MAJOR\" >/dev/null 2>&1",
    "}",
    "",
    "install_from_source_tarball() {",
    "  require_command tar",
    "  tarball_path=\"$tmp_dir/$SOURCE_TARBALL\"",
    "  download_url=\"${BASE_URL%/}/$SOURCE_TARBALL\"",
    "  echo \"Downloading AgentStudio MCP connector $VERSION source package...\"",
    "  curl -fL --retry 3 --connect-timeout 20 -o \"$tarball_path\" \"$download_url\"",
    "  actual_sha256=$(hash_file \"$tarball_path\")",
    "  if [ \"$actual_sha256\" != \"$SOURCE_TARBALL_SHA256\" ]; then",
    "    echo \"Checksum mismatch for $SOURCE_TARBALL\" >&2",
    "    echo \"expected: $SOURCE_TARBALL_SHA256\" >&2",
    "    echo \"actual:   $actual_sha256\" >&2",
    "    exit 1",
    "  fi",
    "  extract_dir=\"$tmp_dir/source\"",
    "  mkdir -p \"$extract_dir\" \"$INSTALL_PARENT\"",
    "  tar -xzf \"$tarball_path\" -C \"$extract_dir\"",
    "  target_dir=\"$INSTALL_PARENT/$PACKAGE_NAME-$VERSION-node\"",
    "  rm -rf \"$target_dir\"",
    "  mv \"$extract_dir/package\" \"$target_dir\"",
    "  chmod +x \"$target_dir/bin/agentstudio-mcp.mjs\" 2>/dev/null || true",
    "  rm -f \"$INSTALL_PARENT/current\"",
    "  ln -s \"$target_dir\" \"$INSTALL_PARENT/current\" 2>/dev/null || true",
    "  echo \"Installed AgentStudio MCP connector at $target_dir\"",
    "  echo \"Opening AgentStudio MCP client selector...\"",
    "  exec node \"$target_dir/bin/agentstudio-mcp.mjs\" install \"$@\"",
    "}",
    "",
    "install_from_portable_zip() {",
    "  require_command unzip",
    "  case \"$platform\" in",
    `    ${portable.platform})`,
    `      archive=${JSON.stringify(portable.zipArchiveName)}`,
    `      archive_sha256=${JSON.stringify(portable.zipSha256)}`,
    `      archive_root=${JSON.stringify(portable.rootName)}`,
    "      ;;",
    "    *)",
    "      echo \"No usable Node.js runtime was found and this release has no portable zip for: $platform\" >&2",
    `      echo "This release contains ${portable.platform}. Build and upload the matching portable zip for this platform." >&2`,
    "      exit 1",
    "      ;;",
    "  esac",
    "  zip_path=\"$tmp_dir/$archive\"",
    "  download_url=\"${BASE_URL%/}/$archive\"",
    "  echo \"Downloading AgentStudio MCP connector $VERSION portable runtime for $platform...\"",
    "  curl -fL --retry 3 --connect-timeout 20 -o \"$zip_path\" \"$download_url\"",
    "  actual_sha256=$(hash_file \"$zip_path\")",
    "  if [ \"$actual_sha256\" != \"$archive_sha256\" ]; then",
    "    echo \"Checksum mismatch for $archive\" >&2",
    "    echo \"expected: $archive_sha256\" >&2",
    "    echo \"actual:   $actual_sha256\" >&2",
    "    exit 1",
    "  fi",
    "  extract_dir=\"$tmp_dir/portable\"",
    "  mkdir -p \"$extract_dir\" \"$INSTALL_PARENT\"",
    "  unzip -q \"$zip_path\" -d \"$extract_dir\"",
    "  target_dir=\"$INSTALL_PARENT/$archive_root\"",
    "  rm -rf \"$target_dir\"",
    "  mv \"$extract_dir/$archive_root\" \"$target_dir\"",
    "  rm -f \"$INSTALL_PARENT/current\"",
    "  ln -s \"$target_dir\" \"$INSTALL_PARENT/current\" 2>/dev/null || true",
    "  echo \"Installed AgentStudio MCP connector at $target_dir\"",
    "  echo \"Opening AgentStudio MCP client selector...\"",
    "  exec \"$target_dir/agentstudio-mcp\" install \"$@\"",
    "}",
    "",
    "if node_is_usable; then",
    "  install_from_source_tarball \"$@\"",
    "fi",
    "",
    "echo \"No usable Node.js $MINIMUM_NODE_MAJOR+ runtime found; falling back to the portable connector.\"",
    "install_from_portable_zip \"$@\"",
    ""
  ].join("\n");
  await fs.writeFile(scriptPath, content);
  await fs.chmod(scriptPath, 0o755);
  return {
    scriptName,
    scriptPath,
    sha256: await sha256(scriptPath),
    githubLatestUrl: `https://github.com/${repo}/releases/latest/download/${scriptName}`,
    oneLineCommand: `/bin/sh -c "$(curl -fsSL https://github.com/${repo}/releases/latest/download/${scriptName})"`
  };
}

function releaseManifest({ channel, packageJson, tarballName, tarballPath, checksum, sizeBytes, portable, bootstrap }) {
  return {
    schemaVersion: 1,
    packageType: "agentstudio.mcp-connector-release.v1",
    generatedAt: new Date().toISOString(),
    channel,
    interfaceVersion: MCP_INTERFACE_VERSION,
    toolsetVersion: MCP_TOOLSET_VERSION,
    serverVersion: MCP_SERVER_VERSION,
    stableToolName: MCP_STABLE_TOOL_NAME,
    connector: {
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      minimumNodeVersion: packageJson.engines?.node || ">=20",
      tarball: tarballName,
      tarballPath,
      sha256: checksum,
      sizeBytes
    },
    portable: {
      strategy: "embedded-node-runtime",
      requiresInstalledNode: false,
      preferredArchive: "zip",
      currentPlatform: portable.platform,
      tarball: portable.archiveName,
      tarballPath: portable.archivePath,
      sha256: portable.sha256,
      sizeBytes: portable.sizeBytes,
      zipArchive: portable.zipArchiveName,
      zipPath: portable.zipArchivePath,
      zipSha256: portable.zipSha256,
      zipSizeBytes: portable.zipSizeBytes,
      executable: portable.executable,
      includesNodeRuntime: portable.includesNodeRuntime,
      bundledNodeVersion: portable.bundledNodeVersion,
      zipInstallEntry: "install.command",
      installCommand: `./${portable.executable} register`,
      clientInstallCommand: `./${portable.executable} install --target <client> --token-stdin`,
      doubleClickEntry: process.platform === "win32" ? "" : "install.command"
    },
    install: {
      githubOneLineCommand: bootstrap.oneLineCommand,
      registryCommand: `npx ${packageJson.name}@latest register`,
      tarballCommand: `npm exec --package ./build/release/mcp/${tarballName} -- agentstudio-mcp register`,
      portableCommand: `./${portable.executable} register`,
      interactiveInstallCommand: `npx ${packageJson.name}@latest install`,
      clientInstallCommand: `npx ${packageJson.name}@latest install --target <client> --token-stdin`,
      uninstallCommand: `npx ${packageJson.name}@latest uninstall --target <client>`,
      doctorCommand: `npx ${packageJson.name}@latest doctor`,
      discoverCommand: `npx ${packageJson.name}@latest discover-local`,
      scanCommand: `npx ${packageJson.name}@latest scan --json`,
      supportedTargets: [
        "codex",
        "gemini-cli",
        "kilo-code",
        "copilot",
        "openclaw",
        "hermes",
        "antigravity"
      ]
    },
    bootstrap: {
      scriptName: bootstrap.scriptName,
      scriptPath: bootstrap.scriptPath,
      sha256: bootstrap.sha256,
      githubLatestUrl: bootstrap.githubLatestUrl,
      command: bootstrap.oneLineCommand,
      strategy: "installed-node-source-tarball-with-portable-runtime-fallback",
      preferredDownload: tarballName,
      fallbackDownload: portable.zipArchiveName,
      sourceSizeBytes: sizeBytes,
      fallbackSizeBytes: portable.zipSizeBytes,
      installsTo: "~/.agentstudio/mcp/connector",
      startsInteractiveInstaller: true,
      supportsMultiSelect: true
    },
    publish: {
      npmCommand: `npm publish ${path.relative(projectRoot, tarballPath)} --access public --tag ${channel}`,
      releaseFiles: [
        tarballName,
        portable.archiveName,
        portable.zipArchiveName,
        bootstrap.scriptName,
        "agentstudio-mcp-release.json",
        "latest.json"
      ]
    }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(String(args["output-dir"]));
  const channel = String(args.channel || "stable");
  const packageJson = await readJson(path.join(connectorRoot, "package.json"));
  assert.equal(packageJson.name, MCP_CONNECTOR_PACKAGE_NAME);
  assert.equal(packageJson.version, MCP_CONNECTOR_VERSION);

  await fs.mkdir(outputDir, { recursive: true });
  const pack = await run("npm", ["pack", "--json", "--pack-destination", outputDir], {
    cwd: connectorRoot
  });
  const packResult = JSON.parse(pack.stdout || "[]")[0];
  if (!packResult?.filename) {
    throw new Error("npm pack did not return a tarball filename.");
  }
  const tarballPath = path.join(outputDir, packResult.filename);
  const stat = await fs.stat(tarballPath);
  const checksum = await sha256(tarballPath);
  const portable = await createPortableBundle({
    outputDir,
    packageJson
  });
  const bootstrap = await createBootstrapInstaller({
    outputDir,
    packageJson,
    tarballName: packResult.filename,
    tarballSha256: checksum,
    portable
  });
  const manifest = releaseManifest({
    channel,
    packageJson,
    tarballName: packResult.filename,
    tarballPath,
    checksum,
    sizeBytes: stat.size,
    portable,
    bootstrap
  });
  const manifestPath = path.join(outputDir, "agentstudio-mcp-release.json");
  const latestPath = path.join(outputDir, "latest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(latestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const publishResult = args.publish
    ? await run("npm", ["publish", tarballPath, "--access", "public", "--tag", channel])
    : null;
  const result = {
    ok: true,
    outputDir,
    manifestPath,
    latestPath,
    bootstrapInstallerPath: bootstrap.scriptPath,
    tarballPath,
    portableTarballPath: portable.archivePath,
    portableZipPath: portable.zipArchivePath,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    sha256: checksum,
    portableSha256: portable.sha256,
    portableZipSha256: portable.zipSha256,
    bootstrapInstallerSha256: bootstrap.sha256,
    githubOneLineCommand: bootstrap.oneLineCommand,
    publishCommand: manifest.publish.npmCommand,
    installCommand: manifest.install.registryCommand,
    published: Boolean(publishResult),
    publishOutput: publishResult?.stdout?.trim() || ""
  };
  console.log(args.json ? JSON.stringify(result) : JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
