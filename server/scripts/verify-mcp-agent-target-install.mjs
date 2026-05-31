import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHttpServer } from "../services/server-runtime/http-server.mjs";
import { installAuthenticatedFetch } from "./test-auth-helper.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const connectorScript = path.join(repoRoot, "mcp-connector", "bin", "pact-mcp.mjs");
const DECLARED_AGENT_TARGETS = Object.freeze([
  "codex",
  "claude-code",
  "gemini-cli",
  "kilo-code",
  "copilot",
  "openclaw",
  "hermes",
  "antigravity",
  "opencode"
]);
const PRIORITY_AGENT_TARGETS = Object.freeze(["codex", "claude-code", "openclaw"]);
const EXPECTED_AGENT_PROFILES = Object.freeze(Object.fromEntries(
  DECLARED_AGENT_TARGETS.map((target) => [target, `pact.mcp.${target}`])
));

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { timeout: options.timeoutMs || 5000, ...options });
  const text = await response.text();
  return { status: response.status, ok: response.ok, payload: text.trim() ? JSON.parse(text) : {} };
}

let passed = 0;
let failed = 0;

function check(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    fn();
    passed++;
    console.log("ok");
  } catch (error) {
    failed++;
    console.log(`FAIL\n      ${error.message}`);
  }
}

async function testAsync(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    passed++;
    console.log("ok");
  } catch (error) {
    failed++;
    console.log(`FAIL\n      ${error.message}`);
  }
}

function spawnConnector(args, timeoutMs = 30000, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [connectorScript, ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code: code || 0, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 1, stdout: "", stderr: err.message }));
  });
}

function unsetLaunchctlEnv(name) {
  if (process.platform !== "darwin") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const child = spawn("launchctl", ["unsetenv", name], { stdio: "ignore" });
    child.on("close", () => resolve());
    child.on("error", () => resolve());
  });
}

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-agent-target-install-"));
const opencodeConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), "pact-agent-target-config-"));
const opencodeConfigPath = path.join(opencodeConfigDir, "opencode.jsonc");
const autoOpencodeConfigPath = path.join(opencodeConfigDir, "opencode-auto.jsonc");
const tempRegistryPath = path.join(opencodeConfigDir, "pact-servers.json");
const autoRegistryPath = path.join(opencodeConfigDir, "pact-auto-servers.json");
const autoMarketplaceRoot = path.join(opencodeConfigDir, "codex-marketplace");
const autoKiloConfigPath = path.join(opencodeConfigDir, "kilo", "kilo.json");
const autoAntigravityConfigPath = path.join(opencodeConfigDir, "antigravity", "mcp_config.json");
const noDetectHome = path.join(opencodeConfigDir, "no-detect-home");
const noDetectRegistryPath = path.join(opencodeConfigDir, "pact-no-detect-servers.json");
const autoTokenEnv = `PACT_VERIFY_AUTO_MCP_TOKEN_${randomBytes(4).toString("hex").toUpperCase()}`;
const fakeAgentCommandLog = path.join(opencodeConfigDir, "fake-agent-commands.log");
const fakeBinDir = path.join(opencodeConfigDir, "bin");
const fakeCodexPath = path.join(fakeBinDir, process.platform === "win32" ? "codex.cmd" : "codex");
const fakeClaudePath = path.join(fakeBinDir, process.platform === "win32" ? "claude.cmd" : "claude");
const fakeGeminiPath = path.join(fakeBinDir, process.platform === "win32" ? "gemini.cmd" : "gemini");
const fakeKiloPath = path.join(fakeBinDir, process.platform === "win32" ? "kilo.cmd" : "kilo");
const fakeCopilotPath = path.join(fakeBinDir, process.platform === "win32" ? "copilot.cmd" : "copilot");
const fakeOpenClawPath = path.join(fakeBinDir, process.platform === "win32" ? "openclaw.cmd" : "openclaw");
const fakeOpencodePath = path.join(fakeBinDir, process.platform === "win32" ? "opencode.cmd" : "opencode");

async function installFakeAgentCli(filePath) {
  await fs.mkdir(fakeBinDir, { recursive: true });
  if (process.platform === "win32") {
    await fs.writeFile(filePath, [
      "@echo off",
      "if not \"%PACT_FAKE_AGENT_LOG%\"==\"\" (",
      "  if \"%1\"==\"mcp\" if \"%2\"==\"add-json\" echo %~n0^|mcp add-json^|%3^|%4^|%5>>\"%PACT_FAKE_AGENT_LOG%\"",
      "  if \"%1\"==\"mcp\" if \"%2\"==\"set\" echo %~n0^|mcp set^|%3>>\"%PACT_FAKE_AGENT_LOG%\"",
      "  if \"%1\"==\"mcp\" if \"%2\"==\"show\" echo %~n0^|mcp show^|%3>>\"%PACT_FAKE_AGENT_LOG%\"",
      "  if \"%1\"==\"mcp\" if \"%2\"==\"add\" if \"%~n0\"==\"codex\" echo %~n0^|mcp add^|%3^|%4^|%5^|%6^|%7>>\"%PACT_FAKE_AGENT_LOG%\"",
      ")",
      "if \"%1\"==\"mcp\" if \"%2\"==\"--help\" (",
      "  echo Usage: fake-agent mcp add add-json get list remove set show",
      "  exit /b 0",
      ")",
      "if \"%1\"==\"plugin\" (",
      "  exit /b 0",
      ")",
      "if \"%1\"==\"extensions\" (",
      "  exit /b 0",
      ")",
      "if \"%1\"==\"mcp\" if \"%2\"==\"remove\" exit /b 0",
      "if \"%1\"==\"mcp\" if \"%2\"==\"add\" exit /b 0",
      "if \"%1\"==\"mcp\" if \"%2\"==\"add-json\" exit /b 0",
      "if \"%1\"==\"mcp\" if \"%2\"==\"set\" exit /b 0",
      "if \"%1\"==\"mcp\" if \"%2\"==\"get\" (",
      "  echo pact http://127.0.0.1/mcp",
      "  exit /b 0",
      ")",
      "if \"%1\"==\"mcp\" if \"%2\"==\"show\" (",
      "  echo pact http://127.0.0.1/mcp",
      "  exit /b 0",
      ")",
      "if \"%1\"==\"mcp\" if \"%2\"==\"list\" echo pact",
      "exit /b 0",
      ""
    ].join("\r\n"));
    return;
  }
  await fs.writeFile(filePath, [
    "#!/bin/sh",
    "if [ -n \"$PACT_FAKE_AGENT_LOG\" ]; then",
    "  command_name=$(basename \"$0\")",
    "  if [ \"$1\" = \"mcp\" ] && [ \"$2\" = \"add-json\" ]; then",
    "    printf '%s|mcp add-json|%s|%s|%s\\n' \"$command_name\" \"$3\" \"$4\" \"$5\" >> \"$PACT_FAKE_AGENT_LOG\"",
    "  elif [ \"$1\" = \"mcp\" ] && [ \"$2\" = \"set\" ]; then",
    "    printf '%s|mcp set|%s\\n' \"$command_name\" \"$3\" >> \"$PACT_FAKE_AGENT_LOG\"",
    "  elif [ \"$1\" = \"mcp\" ] && [ \"$2\" = \"show\" ]; then",
    "    printf '%s|mcp show|%s\\n' \"$command_name\" \"$3\" >> \"$PACT_FAKE_AGENT_LOG\"",
    "  elif [ \"$command_name\" = \"codex\" ] && [ \"$1\" = \"mcp\" ] && [ \"$2\" = \"add\" ]; then",
    "    printf '%s|mcp add|%s|%s|%s|%s|%s\\n' \"$command_name\" \"$3\" \"$4\" \"$5\" \"$6\" \"$7\" >> \"$PACT_FAKE_AGENT_LOG\"",
    "  fi",
    "fi",
    "if [ \"$1\" = \"mcp\" ] && [ \"$2\" = \"--help\" ]; then",
    "  echo 'Usage: fake-agent mcp add add-json get list remove set show'",
    "  exit 0",
    "fi",
    "if [ \"$1\" = \"plugin\" ]; then exit 0; fi",
    "if [ \"$1\" = \"extensions\" ]; then exit 0; fi",
    "if [ \"$1\" = \"mcp\" ]; then",
    "  case \"$2\" in",
    "    remove|add|add-json|set) exit 0 ;;",
    "    get|show) printf 'pact http://127.0.0.1/mcp\\n'; exit 0 ;;",
    "    list) printf 'pact\\n'; exit 0 ;;",
    "  esac",
    "fi",
    "exit 0",
    ""
  ].join("\n"));
  await fs.chmod(filePath, 0o755);
}

async function installFakePriorityAgentClis() {
  for (const filePath of [
    fakeCodexPath,
    fakeClaudePath,
    fakeGeminiPath,
    fakeKiloPath,
    fakeCopilotPath,
    fakeOpenClawPath,
    fakeOpencodePath
  ]) {
    await installFakeAgentCli(filePath);
  }
}

let serverUrl = "";
console.log("\n=== Pact Agent Target MCP Install Verification ===\n");

let server;
try {
  server = await startHttpServer({
    userDataPath,
    distPath: "",
    port: 0,
    runtimeOptions: { profile: "minimal" }
  });
  serverUrl = server.url;
  console.log(`Server: ${serverUrl}`);
} catch (error) {
  console.error(`FAIL: could not start server: ${error.message}`);
  process.exit(1);
}
await installAuthenticatedFetch(server);

try {
  // ── SECTION 1: Server readiness ──
  console.log("\n[1] Server readiness");
  await testAsync("discovery endpoint", async () => {
    const d = await fetchJson(`${serverUrl}/api/mcp/discovery`);
    assert.equal(d.status, 200);
    assert.equal(d.payload.name, "Pact");
  });
  await testAsync("handshake verification", async () => {
    const nonce = randomBytes(32).toString("base64url");
    const h = await fetchJson(`${serverUrl}/api/mcp/handshake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce, client: { name: "opencode-test", version: "1" } })
    });
    assert.equal(h.status, 200);
    assert.equal(h.payload.ok, true);
    assert.equal(h.payload.payload.nonce, nonce);
  });

  // ── SECTION 2: Token acquisition ──
  console.log("\n[2] Token acquisition");
  let token = "";
  let localGrantId = "";
  await testAsync("local-grant for opencode", async () => {
    const g = await fetchJson(`${serverUrl}/api/mcp/local-grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: ["opencode"], label: "opencode-test", connectorVersion: "verify" })
    });
    assert.equal(g.status, 201);
    assert.ok(g.payload.token);
    assert.deepEqual(g.payload.targets, ["opencode"]);
    token = g.payload.token;
    localGrantId = g.payload.grant?.id || "";
    assert.ok(localGrantId);
  });
  await testAsync("discovery clients includes opencode after grant", async () => {
    const clients = await fetchJson(`${serverUrl}/api/discovery/clients`);
    assert.equal(clients.status, 200);
    assert.ok(
      clients.payload.items?.some((item) => item.sourceGrantId === localGrantId && item.clientLabel === "opencode"),
      "opencode grant should be visible as a current MCP client"
    );
  });
  await testAsync("MCP tools/list with token", async () => {
    const t = await fetchJson(`${serverUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Pact-Api-Key": token },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    });
    assert.equal(t.status, 200);
    assert.ok(t.payload.result?.tools?.length > 0);
  });
  await testAsync("local-grant target match for all supported agents", async () => {
    for (const [target, profileId] of Object.entries(EXPECTED_AGENT_PROFILES)) {
      const g = await fetchJson(`${serverUrl}/api/mcp/local-grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: [target], label: `${target}-test`, connectorVersion: "verify" })
      });
      assert.equal(g.status, 201, `${target} should issue local grant`);
      assert.equal(g.payload.targetMatch?.matched, true, `${target} should match an agent profile`);
      assert.deepEqual(g.payload.targetMatch?.matchedTargets, [target]);
      assert.equal(g.payload.targetMatch?.agentProfileId, profileId);
      assert.ok(g.payload.toolsets?.includes("pact.agent.workspace"), `${target} should include workspace toolset`);
    }
  });

  // ── SECTION 3: OpenCode config manipulation ──
  console.log("\n[3] OpenCode config manipulation");

  await testAsync("install to clean config", async () => {
    const clean = { "$schema": "https://opencode.ai/config.json" };
    await fs.writeFile(opencodeConfigPath, JSON.stringify(clean, null, 2));
    clean.mcp = { pact: { type: "remote", url: `${serverUrl}/mcp`, headers: { "X-Pact-Api-Key": token }, enabled: true } };
    await fs.writeFile(opencodeConfigPath, JSON.stringify(clean, null, 2));
    const r = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    assert.equal(r.mcp?.pact?.type, "remote");
    assert.equal(r.mcp?.pact?.url, `${serverUrl}/mcp`);
    assert.equal(r.mcp?.pact?.headers?.["X-Pact-Api-Key"], token);
    assert.equal(r.mcp?.pact?.enabled, true);
  });

  await testAsync("install preserves existing entries", async () => {
    const cfg = {
      "$schema": "https://opencode.ai/config.json",
      "mcp": {
        "context7": { "type": "remote", "url": "https://mcp.context7.com/mcp" },
        "sentry": { "type": "remote", "url": "https://mcp.sentry.dev/mcp", "oauth": {} }
      }
    };
    await fs.writeFile(opencodeConfigPath, JSON.stringify(cfg, null, 2));
    const config = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    config.mcp.pact = { type: "remote", url: `${serverUrl}/mcp`, headers: { "X-Pact-Api-Key": token }, enabled: true };
    await fs.writeFile(opencodeConfigPath, JSON.stringify(config, null, 2));
    const r = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    assert.equal(Object.keys(r.mcp).length, 3);
    assert.ok(r.mcp.context7);
    assert.ok(r.mcp.sentry);
    assert.ok(r.mcp.pact);
  });

  await testAsync("re-install overwrites token", async () => {
    const config = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    config.mcp.pact.headers["X-Pact-Api-Key"] = "new-token-v2";
    await fs.writeFile(opencodeConfigPath, JSON.stringify(config, null, 2));
    const r = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    assert.equal(r.mcp.pact.headers["X-Pact-Api-Key"], "new-token-v2");
  });

  await testAsync("uninstall removes pact, preserves others", async () => {
    const config = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    assert.ok(config.mcp.pact, "pact should exist");
    delete config.mcp.pact;
    await fs.writeFile(opencodeConfigPath, JSON.stringify(config, null, 2));
    const r = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    assert.equal(r.mcp.pact, undefined);
    assert.equal(Object.keys(r.mcp).length, 2);
  });

  await testAsync("uninstall when not installed (no-op)", async () => {
    const before = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    assert.equal(before.mcp.pact, undefined);
    const after = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    assert.deepEqual(after, before);
  });

  // ── SECTION 4: End-to-end CLI install ──
  console.log("\n[4] End-to-end CLI install --target opencode");
  let cliInstallResult = null;
  await testAsync("cli install succeeds", async () => {
    cliInstallResult = await spawnConnector([
      "install",
      "--target", "opencode",
      "--url", serverUrl,
      "--token", token,
      "--opencode-config", opencodeConfigPath,
      "--discovery-file", tempRegistryPath,
      "--no-verify"
    ]);
    if (cliInstallResult.code !== 0) {
      console.log(`\n      stdout: ${cliInstallResult.stdout.slice(0, 200)}`);
      console.log(`      stderr: ${cliInstallResult.stderr.slice(0, 200)}`);
    }
    assert.equal(cliInstallResult.code, 0, `exit code ${cliInstallResult.code}`);

    const config = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    assert.equal(config.mcp?.pact?.type, "remote");
    assert.equal(config.mcp?.pact?.url, `${serverUrl}/mcp`);
    assert.ok(config.mcp?.pact?.enabled);
    assert.ok(config.mcp?.pact?.headers?.["X-Pact-Api-Key"]);
  });

  await testAsync("cli install json output mentions opencode", () => {
    const output = cliInstallResult.stdout;
    assert.ok(
      output.includes("opencode") || output.includes("OpenCode"),
      `Output should mention opencode: ${output.slice(0, 200)}`
    );
  });

  // ── SECTION 5: Non-interactive auto install ──
  console.log("\n[5] Non-interactive auto install");
  await testAsync("--target auto installs explicitly detected supported agents", async () => {
    await installFakePriorityAgentClis();
    await fs.mkdir(path.dirname(autoAntigravityConfigPath), { recursive: true });
    const result = await spawnConnector([
      "install",
      "--target", "auto",
      "--url", serverUrl,
      "--token", token,
      "--token-env", autoTokenEnv,
      "--codex-bin", fakeCodexPath,
      "--claude-bin", fakeClaudePath,
      "--gemini-bin", fakeGeminiPath,
      "--kilo-bin", fakeKiloPath,
      "--copilot-bin", fakeCopilotPath,
      "--openclaw-bin", fakeOpenClawPath,
      "--opencode-bin", fakeOpencodePath,
      "--marketplace-root", autoMarketplaceRoot,
      "--kilo-config", autoKiloConfigPath,
      "--opencode-config", autoOpencodeConfigPath,
      "--antigravity-config", autoAntigravityConfigPath,
      "--discovery-file", autoRegistryPath,
      "--no-scan",
      "--no-verify",
      "--json"
    ], 60000, {
      PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH || ""}`,
      PACT_FAKE_AGENT_LOG: fakeAgentCommandLog
    });
    if (result.code !== 0) {
      console.log(`\n      stdout: ${result.stdout.slice(0, 300)}`);
      console.log(`      stderr: ${result.stderr.slice(0, 300)}`);
    }
    assert.equal(result.code, 0, `exit code ${result.code}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true, JSON.stringify(payload, null, 2));
    assert.equal(payload.autoDetected, true);
    for (const target of PRIORITY_AGENT_TARGETS) {
      assert.equal(payload.selected?.some((item) => item.target === target), true, `${target} should be selected by auto install`);
    }
    assert.equal(payload.selected?.some((item) => item.target === "gemini-cli"), true);
    assert.equal(payload.selected?.some((item) => item.target === "kilo-code"), true);
    assert.equal(payload.selected?.some((item) => item.target === "copilot"), true);
    assert.equal(payload.selected?.some((item) => item.target === "antigravity"), true);
    assert.equal(payload.selected?.some((item) => item.target === "opencode"), true);
    for (const target of PRIORITY_AGENT_TARGETS) {
      assert.equal(payload.installed?.[target]?.status, "installed", `${target} should be installed by auto install`);
    }
    for (const target of PRIORITY_AGENT_TARGETS) {
      const selected = payload.selected?.find((item) => item.target === target);
      assert.ok(selected?.installCommand?.includes(`pact-mcp install --target ${target}`), `${target} should include a copyable install command`);
      assert.equal(selected.installCommand.includes(token), false, `${target} install command must not expose token values`);
    }
    assert.equal(payload.installed?.["gemini-cli"]?.status, "installed");
    assert.equal(payload.installed?.["kilo-code"]?.status, "installed");
    assert.equal(payload.installed?.copilot?.status, "installed");
    assert.equal(payload.installed?.antigravity?.status, "installed");
    assert.equal(payload.installed?.opencode?.status, "installed");

    const config = JSON.parse(await fs.readFile(autoOpencodeConfigPath, "utf8"));
    assert.equal(config.mcp?.pact?.type, "remote");
    assert.equal(config.mcp?.pact?.url, `${serverUrl}/mcp`);
    assert.ok(config.mcp?.pact?.headers?.["X-Pact-Api-Key"]);
    const kiloConfig = JSON.parse(await fs.readFile(autoKiloConfigPath, "utf8"));
    assert.equal(kiloConfig.mcp?.pact?.type, "remote");
    assert.equal(kiloConfig.mcp?.pact?.url, `${serverUrl}/mcp`);
    const antigravityConfig = JSON.parse(await fs.readFile(autoAntigravityConfigPath, "utf8"));
    assert.equal(antigravityConfig.mcpServers?.pact?.serverUrl, `${serverUrl}/mcp`);

    const commandLog = await fs.readFile(fakeAgentCommandLog, "utf8");
    assert.match(commandLog, new RegExp(`codex\\|mcp add\\|pact\\|--url\\|${serverUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/mcp\\|--bearer-token-env-var\\|${autoTokenEnv}`));
    assert.match(commandLog, /claude\|mcp add-json\|--scope\|user\|pact/);
    assert.match(commandLog, /openclaw\|mcp set\|pact/);
    assert.match(commandLog, /openclaw\|mcp show\|pact/);
    assert.equal(commandLog.includes(token), false, "fake agent command log must not persist grant token values");
  });

  // ── SECTION 6: Verify installed config works ──
  console.log("\n[6] Verify installed config");
  await testAsync("installed token calls MCP tools/list", async () => {
    const config = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    const installedToken = config.mcp?.pact?.headers?.["X-Pact-Api-Key"];
    assert.ok(installedToken);
    const t = await fetchJson(`${serverUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Pact-Api-Key": installedToken },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    });
    assert.equal(t.status, 200);
    assert.ok(t.payload.result?.tools?.length > 0);
  });

  await testAsync("installed token calls MCP initialize", async () => {
    const config = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    const installedToken = config.mcp?.pact?.headers?.["X-Pact-Api-Key"];
    const t = await fetchJson(`${serverUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Pact-Api-Key": installedToken },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "opencode", version: "1" } }
      })
    });
    assert.equal(t.status, 200);
    assert.equal(t.payload.result.serverInfo.name, "Pact");
    assert.equal(t.payload.result.capabilities.tools.listChanged, true);
  });

  await testAsync("unauthenticated tools/list is rejected", async () => {
    const t = await fetchJson(`${serverUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    });
    assert.equal(t.status, 401);
    assert.equal(t.payload.error.data.code, "missing_token");
  });

  // ── SECTION 7: End-to-end CLI uninstall ──
  console.log("\n[7] End-to-end CLI uninstall --target opencode");
  let cliUninstallPayload = null;
  await testAsync("cli uninstall succeeds", async () => {
    const result = await spawnConnector([
      "uninstall",
      "--target", "opencode",
      "--url", serverUrl,
      "--opencode-config", opencodeConfigPath,
      "--discovery-file", tempRegistryPath,
      "--json"
    ]);
    if (result.code !== 0) {
      console.log(`\n      stdout: ${result.stdout.slice(0, 300)}`);
      console.log(`      stderr: ${result.stderr.slice(0, 300)}`);
    }
    assert.equal(result.code, 0, `exit code ${result.code}`);
    cliUninstallPayload = JSON.parse(result.stdout);
    assert.equal(cliUninstallPayload.serverUninstall?.ok, true);
    assert.ok(cliUninstallPayload.serverUninstall?.updatedCount >= 1);

    const config = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    assert.equal(config.mcp?.pact, undefined, "pact should be removed after uninstall");
  });
  await testAsync("discovery clients removes opencode after uninstall", async () => {
    const clients = await fetchJson(`${serverUrl}/api/discovery/clients`);
    assert.equal(clients.status, 200);
    assert.equal(
      clients.payload.items?.some((item) => item.sourceGrantId === localGrantId && item.clientLabel === "opencode"),
      false,
      "uninstalled opencode should not remain in the current device list"
    );
  });
  await testAsync("tool grant record remains with uninstall metadata", async () => {
    const grants = await fetchJson(`${serverUrl}/api/tool-management/v1/grants`);
    assert.equal(grants.status, 200);
    const grant = grants.payload.grants?.find((item) => item.id === localGrantId);
    assert.ok(grant, "grant record should remain after uninstall");
    assert.equal(grant.enabled, false);
    assert.ok(grant.metadata?.uninstalledTargets?.includes("opencode"));
    assert.ok(grant.metadata?.uninstalledAt);
  });

  // ── SECTION 8: Scan detection ──
  console.log("\n[8] Scan detection");
  await testAsync("scan --json includes opencode", async () => {
    const result = await spawnConnector(["scan", "--json", "--url", serverUrl, "--no-scan"]);
    const scan = JSON.parse(result.stdout);
    const oc = scan.candidates.find((c) => c.target === "opencode");
    assert.ok(oc, "scan should include opencode");
    assert.equal(oc.label, "OpenCode");
    assert.ok(oc.repairCommand?.includes("pact-mcp install --target opencode"), "scan should include an opencode repair command");
  });

  // ── SECTION 9: Connector self-checks ──
  console.log("\n[9] Connector self-checks");
  await testAsync("--version works", async () => {
    const result = await spawnConnector(["--version"]);
    assert.equal(result.code, 0);
    const v = JSON.parse(result.stdout);
    assert.equal(v.packageName, "pact-mcp-connector");
    assert.ok(v.packageVersion);
  });

  await testAsync("usage (help) includes supported agent targets", async () => {
    const result = await spawnConnector([]);
    assert.match(result.stdout, /--codex-bin/);
    assert.match(result.stdout, /--claude-bin/);
    assert.match(result.stdout, /--gemini-bin/);
    assert.match(result.stdout, /--kilo-bin/);
    assert.match(result.stdout, /--copilot-bin/);
    assert.match(result.stdout, /--openclaw-bin/);
    assert.match(result.stdout, /opencode/);
  });

  await testAsync("supported targets include all declared agents", async () => {
    const result = await spawnConnector(["scan", "--json", "--url", serverUrl, "--no-scan"]);
    const scan = JSON.parse(result.stdout);
    const targets = scan.candidates.map((c) => c.target);
    for (const target of DECLARED_AGENT_TARGETS) {
      assert.ok(targets.includes(target), `targets: ${targets.join(", ")}`);
    }
    for (const target of PRIORITY_AGENT_TARGETS) {
      const candidate = scan.candidates.find((c) => c.target === target);
      assert.ok(candidate?.repairCommand?.includes(`pact-mcp install --target ${target}`), `${target} should include a repair command`);
      assert.equal(candidate.doctorCommand, "pact-mcp doctor --json");
    }
  });

  // ── SECTION 10: Machine-readable install failures ──
  console.log("\n[10] Machine-readable install failures");
  await testAsync("unsupported target returns next executable command", async () => {
    const result = await spawnConnector([
      "install",
      "--target", "not-a-real-agent",
      "--url", serverUrl,
      "--token", token,
      "--json"
    ]);
    assert.equal(result.code, 1);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.errorCode, "UNSUPPORTED_TARGET");
    assert.equal(payload.nextCommand, "pact-mcp scan --json");
    assert.ok(payload.repairCommands?.includes("pact-mcp scan --json"));
    for (const target of PRIORITY_AGENT_TARGETS) {
      assert.ok(payload.supportedTargets?.includes(target), `${target} should be listed as supported`);
    }
  });

  await testAsync("auto install with no detected clients returns machine-readable repair commands", async () => {
    await fs.mkdir(noDetectHome, { recursive: true });
    const result = await spawnConnector([
      "install",
      "--target", "auto",
      "--url", serverUrl,
      "--token", token,
      "--discovery-file", noDetectRegistryPath,
      "--no-scan",
      "--json"
    ], 30000, {
      HOME: noDetectHome,
      PATH: ["/usr/bin", "/bin"].join(path.delimiter)
    });
    assert.equal(result.code, 1);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.errorCode, "NO_SUPPORTED_MCP_CLIENTS_DETECTED");
    assert.equal(payload.nextCommand, "pact-mcp scan --json");
    assert.ok(payload.repairCommands?.some((command) => command.includes("pact-mcp install --target codex")));
    assert.equal(payload.candidates?.some((candidate) => candidate.target === "codex"), true);
    assert.equal(payload.candidates?.some((candidate) => candidate.target === "claude-code"), true);
    assert.equal(payload.candidates?.some((candidate) => candidate.target === "openclaw"), true);
    for (const target of PRIORITY_AGENT_TARGETS) {
      const candidate = payload.candidates?.find((item) => item.target === target);
      assert.ok(candidate?.repairCommand?.includes(`pact-mcp install --target ${target}`), `${target} should provide a repair command`);
    }
  });

} catch (error) {
  console.error(`\nUNEXPECTED ERROR: ${error.message}`);
  failed++;
} finally {
  if (server?.close) {
    await server.close();
  }
  await unsetLaunchctlEnv(autoTokenEnv);
  await fs.rm(userDataPath, { recursive: true, force: true }).catch(() => {});
  await fs.rm(opencodeConfigDir, { recursive: true, force: true }).catch(() => {});
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${passed + failed} total ===`);
process.exit(failed > 0 ? 1 : 0);
