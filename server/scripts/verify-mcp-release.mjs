import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(new URL("../..", import.meta.url).pathname);

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

async function sha256(filePath) {
  const hash = createHash("sha256");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pact-mcp-release-"));
try {
  const release = await run("node", [
    "server/scripts/mcp-release.mjs",
    "--output-dir",
    tempDir,
    "--json"
  ]);
  const result = JSON.parse(release.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.packageName, "pact-mcp-connector");
  assert.equal(result.packageVersion, "0.2.8");

  const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8"));
  const manifestText = JSON.stringify(manifest);
  assert.equal(manifest.packageType, "pact.mcp-connector-release.v1");
  assert.equal(manifest.stableToolName, "pact.call");
  assert.doesNotMatch(manifestText, new RegExp(projectRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(Object.hasOwn(manifest.connector, "tarballPath"), false);
  assert.equal(Object.hasOwn(manifest.portable, "tarballPath"), false);
  assert.equal(Object.hasOwn(manifest.portable, "zipPath"), false);
  assert.equal(Object.hasOwn(manifest.bootstrap, "scriptPath"), false);
  assert.equal(manifest.connector.sha256, await sha256(result.tarballPath));
  assert.equal(manifest.portable.requiresInstalledNode, false);
  assert.equal(manifest.portable.includesNodeRuntime ?? true, true);
  assert.equal(manifest.portable.preferredArchive, "zip");
  assert.equal(manifest.portable.sha256, await sha256(result.portableTarballPath));
  assert.equal(manifest.portable.zipSha256, await sha256(result.portableZipPath));
  assert.equal(result.portableZipSha256, await sha256(result.portableZipPath));
  assert.ok(manifest.install.registryCommand.includes("npx pact-mcp-connector@latest register"));
  assert.ok(manifest.install.githubOneLineCommand.includes("pact-mcp-install.sh"));
  assert.ok(manifest.install.githubOneLineUninstallCommand.includes("pact-mcp-uninstall.sh"));
  assert.ok(manifest.install.githubOneLineCommand.startsWith("/bin/sh -c"));
  assert.ok(manifest.install.githubOneLineUninstallCommand.startsWith("/bin/sh -c"));
  assert.ok(manifest.install.portableCommand.includes("pact-mcp register"));
  assert.ok(manifest.install.interactiveInstallCommand.includes("pact-mcp-connector@latest install"));
  assert.ok(manifest.install.interactiveUninstallCommand.includes("pact-mcp-connector@latest uninstall"));
  assert.ok(manifest.install.clientInstallCommand.includes("--target <client>"));
  assert.equal(Object.hasOwn(manifest.install, "bulkInstallCommand"), false);
  assert.ok(manifest.install.uninstallCommand.includes("npx pact-mcp-connector@latest uninstall"));
  assert.ok(manifest.install.discoverCommand.includes("pact-mcp-connector@latest discover-local"));
  assert.ok(manifest.install.scanCommand.includes("pact-mcp-connector@latest scan"));
  assert.equal(manifest.bootstrap.scriptName, "pact-mcp-install.sh");
  assert.equal(manifest.bootstrap.uninstallScriptName, "pact-mcp-uninstall.sh");
  assert.equal(manifest.bootstrap.startsInteractiveInstaller, true);
  assert.equal(manifest.bootstrap.startsInteractiveUninstaller, true);
  assert.equal(manifest.bootstrap.supportsMultiSelect, true);
  assert.equal(manifest.bootstrap.strategy, "installed-node-source-tarball-with-portable-runtime-fallback");
  assert.equal(manifest.bootstrap.preferredDownload, path.basename(result.tarballPath));
  assert.equal(manifest.bootstrap.fallbackDownload, path.basename(result.portableZipPath));
  assert.equal(manifest.bootstrap.sourceSizeBytes, manifest.connector.sizeBytes);
  assert.equal(manifest.bootstrap.fallbackSizeBytes, manifest.portable.zipSizeBytes);
  assert.equal(manifest.bootstrap.sha256, await sha256(result.bootstrapInstallerPath));
  assert.equal(manifest.bootstrap.uninstallSha256, await sha256(result.bootstrapUninstallerPath));
  assert.ok(manifest.publish.npmCommand.includes("npm publish"));
  assert.ok(manifest.publish.releaseFiles.includes("pact-mcp-install.sh"));
  assert.ok(manifest.publish.releaseFiles.includes("pact-mcp-uninstall.sh"));
  assert.equal(result.bootstrapInstallerSha256, await sha256(result.bootstrapInstallerPath));
  assert.equal(result.bootstrapUninstallerSha256, await sha256(result.bootstrapUninstallerPath));
  assert.ok(result.githubOneLineCommand.includes("pact-mcp-install.sh"));
  assert.ok(result.githubOneLineUninstallCommand.includes("pact-mcp-uninstall.sh"));
  await run("sh", ["-n", result.bootstrapInstallerPath]);
  await run("sh", ["-n", result.bootstrapUninstallerPath]);
  const bootstrapScript = await fs.readFile(result.bootstrapInstallerPath, "utf8");
  const bootstrapUninstallScript = await fs.readFile(result.bootstrapUninstallerPath, "utf8");
  assert.match(bootstrapScript, /curl -fL --retry 3/);
  assert.match(bootstrapScript, /node_is_usable/);
  assert.match(bootstrapScript, /install_from_source_tarball/);
  assert.match(bootstrapScript, /install_from_portable_zip/);
  assert.match(bootstrapScript, /SOURCE_TARBALL=/);
  assert.match(bootstrapScript, /archive_sha256=/);
  assert.doesNotMatch(bootstrapScript, /127\.0\.0\.1:8787/);
  assert.doesNotMatch(bootstrapScript, /register --url/);
  assert.doesNotMatch(bootstrapScript, /install --url/);
  assert.doesNotMatch(bootstrapScript, /register >\/dev\/null/);
  assert.match(bootstrapScript, /pact-mcp" install/);
  assert.match(bootstrapScript, /node "\$target_dir\/bin\/pact-mcp\.mjs" install/);
  assert.match(bootstrapUninstallScript, /pact-mcp" uninstall/);
  assert.match(bootstrapUninstallScript, /node "\$target_dir\/bin\/pact-mcp\.mjs" uninstall/);
  assert.match(bootstrapUninstallScript, /client removal selector/);

  const list = await run("tar", ["-tzf", result.tarballPath]);
  assert.match(list.stdout, /package\/bin\/pact-mcp\.mjs/);
  assert.match(list.stdout, /package\/package\.json/);
  assert.doesNotMatch(list.stdout, /package\/server\//);

  const portableList = await run("tar", ["-tzf", result.portableTarballPath]);
  assert.match(portableList.stdout, /pact-mcp$/m);
  assert.match(portableList.stdout, /runtime\/node/m);
  assert.match(portableList.stdout, /app\/bin\/pact-mcp\.mjs/m);
  assert.match(portableList.stdout, /install\.command/m);
  assert.match(portableList.stdout, /uninstall\.command/m);
  assert.doesNotMatch(portableList.stdout, /server\//);

  const zipList = await run("unzip", ["-l", result.portableZipPath]);
  assert.match(zipList.stdout, /pact-mcp$/m);
  assert.match(zipList.stdout, /runtime\/node/m);
  assert.match(zipList.stdout, /app\/bin\/pact-mcp\.mjs/m);
  assert.match(zipList.stdout, /install\.command/m);
  assert.match(zipList.stdout, /uninstall\.command/m);
  assert.doesNotMatch(zipList.stdout, /server\//);

  const extractDir = path.join(tempDir, "extract");
  await fs.mkdir(extractDir, { recursive: true });
  await run("tar", ["-xzf", result.tarballPath, "-C", extractDir]);
  const version = await run("node", [path.join(extractDir, "package", "bin", "pact-mcp.mjs"), "version", "--json"]);
  const versionPayload = JSON.parse(version.stdout);
  assert.equal(versionPayload.packageName, "pact-mcp-connector");
  assert.equal(versionPayload.packageVersion, "0.2.8");
  assert.equal(versionPayload.stableToolName, "pact.call");
  const help = await run("node", [path.join(extractDir, "package", "bin", "pact-mcp.mjs"), "help"]);
  assert.match(help.stdout, /pact-mcp register/);
  assert.match(help.stdout, /pact-mcp install/);
  assert.match(help.stdout, /pact-mcp uninstall/);
  assert.match(help.stdout, /multi-select menu/);
  assert.match(help.stdout, /multi-select removal menu/);
  assert.match(help.stdout, /pact-mcp scan --json/);
  assert.match(help.stdout, /pact-mcp discover-local/);
  assert.match(help.stdout, /pact-mcp server-config --set/);
  assert.match(help.stdout, /--no-auto-token/);
  assert.match(help.stdout, /--docker-bin/);
  assert.match(help.stdout, /--podman-bin/);
  assert.match(help.stdout, /--wsl-bin/);
  assert.doesNotMatch(help.stdout, /\/home\/kate/);
  assert.doesNotMatch(help.stdout, /\/home\/serena/);
  const scan = await run("node", [
    path.join(extractDir, "package", "bin", "pact-mcp.mjs"),
    "scan",
    "--no-scan",
    "--url",
    "http://127.0.0.1:9",
    "--orb-bin",
    "/nonexistent/orb",
    "--json"
  ], {
    env: {
      HOME: path.join(tempDir, "scan-home")
    }
  });
  const scanPayload = JSON.parse(scan.stdout);
  assert.equal(scanPayload.ok, true);
  assert.equal(scanPayload.candidates.some((candidate) => candidate.target === "codex"), true);
  assert.equal(scanPayload.serverDiscovery.ok, false);

  const uninstallHome = path.join(tempDir, "uninstall-home");
  const kiloConfigPath = path.join(uninstallHome, ".config", "kilo", "kilo.json");
  await fs.mkdir(path.dirname(kiloConfigPath), { recursive: true });
  await fs.writeFile(kiloConfigPath, JSON.stringify({
    mcp: {
      pact: { type: "remote", url: "http://example.invalid/mcp" },
      other: { type: "remote", url: "http://other.invalid/mcp" }
    }
  }, null, 2));
  const fakeKilo = path.join(tempDir, "fake-kilo");
  await fs.writeFile(fakeKilo, [
    "#!/bin/sh",
    "if [ \"$1\" = \"mcp\" ] && [ \"$2\" = \"list\" ]; then",
    "  printf 'other\\n'",
    "  exit 0",
    "fi",
    "exit 0",
    ""
  ].join("\n"), { mode: 0o755 });
  const uninstall = await run("node", [
    path.join(extractDir, "package", "bin", "pact-mcp.mjs"),
    "uninstall",
    "--target",
    "kilo-code",
    "--kilo-config",
    kiloConfigPath,
    "--kilo-bin",
    fakeKilo,
    "--json"
  ], {
    env: {
      HOME: uninstallHome
    }
  });
  const uninstallPayload = JSON.parse(uninstall.stdout);
  assert.equal(uninstallPayload.ok, true);
  assert.equal(uninstallPayload.uninstalled["kilo-code"].status, "not-installed");
  const kiloConfig = JSON.parse(await fs.readFile(kiloConfigPath, "utf8"));
  assert.equal(Object.hasOwn(kiloConfig.mcp, "pact"), false);
  assert.equal(Object.hasOwn(kiloConfig.mcp, "other"), true);

  const layeredHome = path.join(tempDir, "layered-home");
  const fakeNvmBin = path.join(layeredHome, ".nvm", "versions", "node", "v99.0.0", "bin");
  await fs.mkdir(fakeNvmBin, { recursive: true });
  const fakeGemini = path.join(fakeNvmBin, "gemini");
  await fs.writeFile(fakeGemini, [
    "#!/bin/sh",
    "if [ \"$1\" = \"mcp\" ] && [ \"$2\" = \"--help\" ]; then",
    "  printf 'Usage: gemini mcp add list remove\\n'",
    "  exit 0",
    "fi",
    "exit 1",
    ""
  ].join("\n"), { mode: 0o755 });
  const plainAppGemini = path.join(layeredHome, "Applications", "Plain.app", "Contents", "Resources", "gemini");
  const agentAppGemini = path.join(layeredHome, "Applications", "Gemini Agent.app", "Contents", "Resources", "gemini");
  for (const appGemini of [plainAppGemini, agentAppGemini]) {
    await fs.mkdir(path.dirname(appGemini), { recursive: true });
    await fs.writeFile(appGemini, [
      "#!/bin/sh",
      "if [ \"$1\" = \"mcp\" ] && [ \"$2\" = \"--help\" ]; then",
      "  printf 'Usage: gemini mcp add list remove\\n'",
      "  exit 0",
      "fi",
      "exit 1",
      ""
    ].join("\n"), { mode: 0o755 });
  }
  const layeredScan = await run(process.execPath, [
    path.join(extractDir, "package", "bin", "pact-mcp.mjs"),
    "scan",
    "--url",
    "http://127.0.0.1:9",
    "--orb-bin",
    "/nonexistent/orb",
    "--docker-bin",
    "/nonexistent/docker",
    "--podman-bin",
    "/nonexistent/podman",
    "--wsl-bin",
    "/nonexistent/wsl",
    "--json"
  ], {
    env: {
      HOME: layeredHome,
      NVM_DIR: path.join(layeredHome, ".nvm"),
      PATH: "/usr/bin:/bin"
    }
  });
  const layeredScanPayload = JSON.parse(layeredScan.stdout);
  assert.ok(["darwin", "linux", "win32"].includes(layeredScanPayload.hostOs));
  const layeredGemini = layeredScanPayload.candidates.find((candidate) =>
    candidate.target === "gemini-cli" && candidate.optionOverrides?.["execution-location"] === "local"
  );
  assert.equal(layeredGemini?.optionOverrides?.["gemini-bin"], fakeGemini);
  const layeredGeminiBins = layeredScanPayload.candidates
    .filter((candidate) => candidate.target === "gemini-cli")
    .map((candidate) => candidate.optionOverrides?.["gemini-bin"] || "");
  assert.equal(layeredGeminiBins.includes(plainAppGemini), false);
  if (process.platform === "darwin") {
    assert.equal(layeredGeminiBins.includes(agentAppGemini), true);
  }

  const fakeOrb = path.join(tempDir, "fake-orb");
  await fs.writeFile(fakeOrb, [
    "#!/bin/sh",
    "if [ \"$1\" = \"list\" ]; then",
    "  printf 'NAME STATE\\n'",
    "  printf 'kate running\\n'",
    "  exit 0",
    "fi",
    "if [ \"$1\" = \"-m\" ]; then",
    "  vm=\"$2\"",
    "  user=\"$4\"",
    "  shift 4",
    "  if [ \"$1\" = \"bash\" ] && [ \"$2\" = \"-lc\" ]; then",
    "    if [ \"$vm\" = \"kate\" ] && [ \"$user\" = \"kate\" ] && printf '%s' \"$3\" | grep -q \"command_name='openclaw'\"; then",
    "      printf '/usr/bin/openclaw\\n'",
    "      exit 0",
    "    fi",
    "    if [ \"$vm\" = \"kate\" ] && [ \"$user\" = \"kate\" ] && printf '%s' \"$3\" | grep -q \"command_name='ironclaw'\"; then",
    "      printf '/usr/local/bin/ironclaw\\n'",
    "      exit 0",
    "    fi",
    "    if [ \"$vm\" = \"kate\" ] && [ \"$user\" = \"kate\" ] && printf '%s' \"$3\" | grep -q \"command_name='gemini'\"; then",
    "      printf '/usr/bin/gemini\\n'",
    "      exit 0",
    "    fi",
    "    if [ \"$vm\" = \"kate\" ] && [ \"$user\" = \"kate\" ] && printf '%s' \"$3\" | grep -q \"command_name='copilot'\"; then",
    "      printf '/usr/bin/copilot\\n'",
    "      exit 0",
    "    fi",
    "    exit 1",
    "  fi",
    "  if [ \"$vm\" = \"kate\" ] && [ \"$user\" = \"kate\" ] && [ \"$1\" = \"/usr/bin/openclaw\" ] && [ \"$2\" = \"mcp\" ]; then",
    "    printf 'openclaw mcp help\\n'",
    "    exit 0",
    "  fi",
    "  if [ \"$vm\" = \"kate\" ] && [ \"$user\" = \"kate\" ] && [ \"$1\" = \"/usr/local/bin/ironclaw\" ] && [ \"$2\" = \"mcp\" ]; then",
    "    printf 'ironclaw mcp help\\n'",
    "    exit 0",
    "  fi",
    "  if [ \"$vm\" = \"kate\" ] && [ \"$user\" = \"kate\" ] && [ \"$1\" = \"/usr/bin/gemini\" ] && [ \"$2\" = \"mcp\" ]; then",
    "    printf 'gemini mcp help\\n'",
    "    exit 0",
    "  fi",
    "  if [ \"$vm\" = \"kate\" ] && [ \"$user\" = \"kate\" ] && [ \"$1\" = \"/usr/bin/copilot\" ] && [ \"$2\" = \"mcp\" ]; then",
    "    printf 'copilot mcp help\\n'",
    "    exit 0",
    "  fi",
    "fi",
    "exit 1",
    ""
  ].join("\n"), { mode: 0o755 });
  const clawScan = await run("node", [
    path.join(extractDir, "package", "bin", "pact-mcp.mjs"),
    "scan",
    "--url",
    "http://127.0.0.1:9",
    "--orb-bin",
    fakeOrb,
    "--docker-bin",
    "/nonexistent/docker",
    "--podman-bin",
    "/nonexistent/podman",
    "--wsl-bin",
    "/nonexistent/wsl",
    "--json"
  ], {
    env: {
      HOME: path.join(tempDir, "scan-home")
    }
  });
  const clawScanPayload = JSON.parse(clawScan.stdout);
  const openClawCandidates = clawScanPayload.candidates.filter((candidate) => candidate.target === "openclaw");
  assert.equal(openClawCandidates.length, 1);
  assert.equal(openClawCandidates[0].status, "detected");
  assert.equal(openClawCandidates[0].label, "OpenClaw (kate)");
  assert.match(openClawCandidates[0].detail, /\/usr\/bin\/openclaw/);
  assert.equal(openClawCandidates[0].optionOverrides["execution-location"], "orb");
  assert.equal(openClawCandidates[0].optionOverrides["orb-vm"], "kate");
  assert.equal(openClawCandidates[0].optionOverrides["orb-user"], "kate");
  assert.equal(openClawCandidates[0].optionOverrides["openclaw-vm"], "kate");
  assert.equal(openClawCandidates[0].optionOverrides["openclaw-user"], "kate");
  assert.equal(openClawCandidates[0].optionOverrides["openclaw-bin"], "/usr/bin/openclaw");
  const vmGemini = clawScanPayload.candidates.find((candidate) =>
    candidate.target === "gemini-cli" && candidate.optionOverrides?.["execution-location"] === "orb"
  );
  assert.equal(vmGemini?.optionOverrides?.["gemini-bin"], "/usr/bin/gemini");
  assert.equal(vmGemini?.optionOverrides?.["orb-vm"], "kate");
  assert.equal(vmGemini?.optionOverrides?.["orb-user"], "kate");
  const vmCopilot = clawScanPayload.candidates.find((candidate) =>
    candidate.target === "copilot" && candidate.optionOverrides?.["execution-location"] === "orb"
  );
  assert.equal(vmCopilot?.optionOverrides?.["copilot-bin"], "/usr/bin/copilot");
  assert.equal(vmCopilot?.optionOverrides?.["orb-vm"], "kate");
  assert.equal(vmCopilot?.optionOverrides?.["orb-user"], "kate");

  const fakeDocker = path.join(tempDir, "fake-docker");
  await fs.writeFile(fakeDocker, [
    "#!/bin/sh",
    "if [ \"$1\" = \"ps\" ]; then",
    "  printf 'box123\\tagentbox\\n'",
    "  exit 0",
    "fi",
    "if [ \"$1\" = \"exec\" ]; then",
    "  if [ \"$2\" = \"box123\" ] && [ \"$3\" = \"sh\" ] && [ \"$4\" = \"-lc\" ]; then",
    "    if printf '%s' \"$5\" | grep -q \"command_name='copilot'\"; then",
    "      printf '/usr/local/bin/copilot\\n'",
    "      exit 0",
    "    fi",
    "    exit 0",
    "  fi",
    "  if [ \"$2\" = \"box123\" ] && [ \"$3\" = \"/usr/local/bin/copilot\" ] && [ \"$4\" = \"mcp\" ]; then",
    "    printf 'Usage: copilot mcp add list remove\\n'",
    "    exit 0",
    "  fi",
    "fi",
    "exit 1",
    ""
  ].join("\n"), { mode: 0o755 });
  const dockerScan = await run(process.execPath, [
    path.join(extractDir, "package", "bin", "pact-mcp.mjs"),
    "scan",
    "--url",
    "http://127.0.0.1:9",
    "--orb-bin",
    "/nonexistent/orb",
    "--docker-bin",
    fakeDocker,
    "--podman-bin",
    "/nonexistent/podman",
    "--wsl-bin",
    "/nonexistent/wsl",
    "--json"
  ], {
    env: {
      HOME: path.join(tempDir, "docker-scan-home")
    }
  });
  const dockerScanPayload = JSON.parse(dockerScan.stdout);
  const dockerCopilot = dockerScanPayload.candidates.find((candidate) =>
    candidate.target === "copilot" && candidate.optionOverrides?.["execution-location"] === "docker"
  );
  assert.equal(dockerCopilot?.optionOverrides?.["copilot-bin"], "/usr/local/bin/copilot");
  assert.equal(dockerCopilot?.optionOverrides?.["remote-id"], "box123");
  assert.equal(dockerCopilot?.optionOverrides?.["remote-name"], "agentbox");
  assert.equal(dockerCopilot?.optionOverrides?.["remote-bin"], fakeDocker);

  const portableExtractDir = path.join(tempDir, "portable");
  await fs.mkdir(portableExtractDir, { recursive: true });
  await run("tar", ["-xzf", result.portableTarballPath, "-C", portableExtractDir]);
  const portableVersion = await run(path.join(portableExtractDir, manifest.portable.tarball.replace(/\.tar\.gz$/, ""), "pact-mcp"), ["version", "--json"]);
  const portablePayload = JSON.parse(portableVersion.stdout);
  assert.equal(portablePayload.packageName, "pact-mcp-connector");
  assert.equal(portablePayload.packageVersion, "0.2.8");
  const portableReset = await run(path.join(portableExtractDir, manifest.portable.tarball.replace(/\.tar\.gz$/, ""), "pact-mcp"), [
    "server-config",
    "--reset",
    "--json"
  ], {
    env: {
      HOME: path.join(tempDir, "portable-home")
    }
  });
  const resetPayload = JSON.parse(portableReset.stdout);
  assert.equal(resetPayload.ok, true);
  assert.equal(resetPayload.reset, true);

  const portableZipExtractDir = path.join(tempDir, "portable-zip");
  await fs.mkdir(portableZipExtractDir, { recursive: true });
  await run("unzip", ["-q", result.portableZipPath, "-d", portableZipExtractDir]);
  const zipRoot = path.join(portableZipExtractDir, manifest.portable.zipArchive.replace(/\.zip$/, ""));
  const portableZipVersion = await run(path.join(zipRoot, "pact-mcp"), ["version", "--json"]);
  const portableZipPayload = JSON.parse(portableZipVersion.stdout);
  assert.equal(portableZipPayload.packageName, "pact-mcp-connector");
  assert.equal(portableZipPayload.packageVersion, "0.2.8");
  assert.equal(await fs.access(path.join(zipRoot, "install.command")).then(() => true), true);
  assert.equal(await fs.access(path.join(zipRoot, "uninstall.command")).then(() => true), true);

  console.log("mcp-release verification passed");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
