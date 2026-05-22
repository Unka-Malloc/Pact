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

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentstudio-mcp-release-"));
try {
  const release = await run("node", [
    "server/scripts/mcp-release.mjs",
    "--output-dir",
    tempDir,
    "--json"
  ]);
  const result = JSON.parse(release.stdout);
  assert.equal(result.ok, true);
  assert.equal(result.packageName, "agentstudio-mcp-connector");
  assert.equal(result.packageVersion, "0.2.6");

  const manifest = JSON.parse(await fs.readFile(result.manifestPath, "utf8"));
  const manifestText = JSON.stringify(manifest);
  assert.equal(manifest.packageType, "agentstudio.mcp-connector-release.v1");
  assert.equal(manifest.stableToolName, "agentstudio.call");
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
  assert.ok(manifest.install.registryCommand.includes("npx agentstudio-mcp-connector@latest register"));
  assert.ok(manifest.install.githubOneLineCommand.includes("agentstudio-mcp-install.sh"));
  assert.ok(manifest.install.githubOneLineCommand.startsWith("/bin/sh -c"));
  assert.ok(manifest.install.portableCommand.includes("agentstudio-mcp register"));
  assert.ok(manifest.install.interactiveInstallCommand.includes("agentstudio-mcp-connector@latest install"));
  assert.ok(manifest.install.clientInstallCommand.includes("--target <client>"));
  assert.equal(Object.hasOwn(manifest.install, "bulkInstallCommand"), false);
  assert.ok(manifest.install.uninstallCommand.includes("npx agentstudio-mcp-connector@latest uninstall"));
  assert.ok(manifest.install.discoverCommand.includes("agentstudio-mcp-connector@latest discover-local"));
  assert.ok(manifest.install.scanCommand.includes("agentstudio-mcp-connector@latest scan"));
  assert.equal(manifest.bootstrap.scriptName, "agentstudio-mcp-install.sh");
  assert.equal(manifest.bootstrap.startsInteractiveInstaller, true);
  assert.equal(manifest.bootstrap.supportsMultiSelect, true);
  assert.equal(manifest.bootstrap.strategy, "installed-node-source-tarball-with-portable-runtime-fallback");
  assert.equal(manifest.bootstrap.preferredDownload, path.basename(result.tarballPath));
  assert.equal(manifest.bootstrap.fallbackDownload, path.basename(result.portableZipPath));
  assert.equal(manifest.bootstrap.sourceSizeBytes, manifest.connector.sizeBytes);
  assert.equal(manifest.bootstrap.fallbackSizeBytes, manifest.portable.zipSizeBytes);
  assert.equal(manifest.bootstrap.sha256, await sha256(result.bootstrapInstallerPath));
  assert.ok(manifest.publish.npmCommand.includes("npm publish"));
  assert.ok(manifest.publish.releaseFiles.includes("agentstudio-mcp-install.sh"));
  assert.equal(result.bootstrapInstallerSha256, await sha256(result.bootstrapInstallerPath));
  assert.ok(result.githubOneLineCommand.includes("agentstudio-mcp-install.sh"));
  await run("sh", ["-n", result.bootstrapInstallerPath]);
  const bootstrapScript = await fs.readFile(result.bootstrapInstallerPath, "utf8");
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
  assert.match(bootstrapScript, /agentstudio-mcp" install/);
  assert.match(bootstrapScript, /node "\$target_dir\/bin\/agentstudio-mcp\.mjs" install/);

  const list = await run("tar", ["-tzf", result.tarballPath]);
  assert.match(list.stdout, /package\/bin\/agentstudio-mcp\.mjs/);
  assert.match(list.stdout, /package\/package\.json/);
  assert.doesNotMatch(list.stdout, /package\/server\//);

  const portableList = await run("tar", ["-tzf", result.portableTarballPath]);
  assert.match(portableList.stdout, /agentstudio-mcp$/m);
  assert.match(portableList.stdout, /runtime\/node/m);
  assert.match(portableList.stdout, /app\/bin\/agentstudio-mcp\.mjs/m);
  assert.match(portableList.stdout, /install\.command/m);
  assert.doesNotMatch(portableList.stdout, /server\//);

  const zipList = await run("unzip", ["-l", result.portableZipPath]);
  assert.match(zipList.stdout, /agentstudio-mcp$/m);
  assert.match(zipList.stdout, /runtime\/node/m);
  assert.match(zipList.stdout, /app\/bin\/agentstudio-mcp\.mjs/m);
  assert.match(zipList.stdout, /install\.command/m);
  assert.doesNotMatch(zipList.stdout, /server\//);

  const extractDir = path.join(tempDir, "extract");
  await fs.mkdir(extractDir, { recursive: true });
  await run("tar", ["-xzf", result.tarballPath, "-C", extractDir]);
  const version = await run("node", [path.join(extractDir, "package", "bin", "agentstudio-mcp.mjs"), "version", "--json"]);
  const versionPayload = JSON.parse(version.stdout);
  assert.equal(versionPayload.packageName, "agentstudio-mcp-connector");
  assert.equal(versionPayload.packageVersion, "0.2.6");
  assert.equal(versionPayload.stableToolName, "agentstudio.call");
  const help = await run("node", [path.join(extractDir, "package", "bin", "agentstudio-mcp.mjs"), "help"]);
  assert.match(help.stdout, /agentstudio-mcp register/);
  assert.match(help.stdout, /agentstudio-mcp install/);
  assert.match(help.stdout, /multi-select menu/);
  assert.match(help.stdout, /agentstudio-mcp scan --json/);
  assert.match(help.stdout, /agentstudio-mcp discover-local/);
  assert.match(help.stdout, /agentstudio-mcp server-config --set/);
  assert.match(help.stdout, /--no-auto-token/);
  assert.doesNotMatch(help.stdout, /\/home\/kate/);
  assert.doesNotMatch(help.stdout, /\/home\/serena/);
  const scan = await run("node", [
    path.join(extractDir, "package", "bin", "agentstudio-mcp.mjs"),
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
    "    if [ \"$vm\" = \"kate\" ] && [ \"$user\" = \"kate\" ] && printf '%s' \"$3\" | grep -q \"type -a -p 'openclaw'\"; then",
    "      printf '/usr/bin/openclaw\\n'",
    "      exit 0",
    "    fi",
    "    if [ \"$vm\" = \"kate\" ] && [ \"$user\" = \"kate\" ] && printf '%s' \"$3\" | grep -q \"type -a -p 'ironclaw'\"; then",
    "      printf '/usr/local/bin/ironclaw\\n'",
    "      exit 0",
    "    fi",
    "    if [ \"$vm\" = \"kate\" ] && [ \"$user\" = \"kate\" ] && printf '%s' \"$3\" | grep -q \"type -a -p 'gemini'\"; then",
    "      printf '/usr/bin/gemini\\n'",
    "      exit 0",
    "    fi",
    "    if [ \"$vm\" = \"kate\" ] && [ \"$user\" = \"kate\" ] && printf '%s' \"$3\" | grep -q \"type -a -p 'copilot'\"; then",
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
    path.join(extractDir, "package", "bin", "agentstudio-mcp.mjs"),
    "scan",
    "--url",
    "http://127.0.0.1:9",
    "--orb-bin",
    fakeOrb,
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

  const portableExtractDir = path.join(tempDir, "portable");
  await fs.mkdir(portableExtractDir, { recursive: true });
  await run("tar", ["-xzf", result.portableTarballPath, "-C", portableExtractDir]);
  const portableVersion = await run(path.join(portableExtractDir, manifest.portable.tarball.replace(/\.tar\.gz$/, ""), "agentstudio-mcp"), ["version", "--json"]);
  const portablePayload = JSON.parse(portableVersion.stdout);
  assert.equal(portablePayload.packageName, "agentstudio-mcp-connector");
  assert.equal(portablePayload.packageVersion, "0.2.6");
  const portableReset = await run(path.join(portableExtractDir, manifest.portable.tarball.replace(/\.tar\.gz$/, ""), "agentstudio-mcp"), [
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
  const portableZipVersion = await run(path.join(zipRoot, "agentstudio-mcp"), ["version", "--json"]);
  const portableZipPayload = JSON.parse(portableZipVersion.stdout);
  assert.equal(portableZipPayload.packageName, "agentstudio-mcp-connector");
  assert.equal(portableZipPayload.packageVersion, "0.2.6");
  assert.equal(await fs.access(path.join(zipRoot, "install.command")).then(() => true), true);

  console.log("mcp-release verification passed");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
