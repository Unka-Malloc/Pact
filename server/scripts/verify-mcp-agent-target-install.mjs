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
const remoteOpenCodeHome = path.join(opencodeConfigDir, "remote-opencode-home");
const remoteOpenCodeRegistryPath = path.join(opencodeConfigDir, "pact-remote-opencode-servers.json");
const remoteCodexRegistryPath = path.join(opencodeConfigDir, "pact-remote-codex-servers.json");
const autoTokenEnv = `PACT_VERIFY_AUTO_MCP_TOKEN_${randomBytes(4).toString("hex").toUpperCase()}`;
const missingDoctorTokenEnv = `PACT_VERIFY_DOCTOR_TOKEN_${randomBytes(4).toString("hex").toUpperCase()}`;
const remoteCodexTokenEnv = `PACT_VERIFY_REMOTE_CODEX_TOKEN_${randomBytes(4).toString("hex").toUpperCase()}`;
const fakeAgentCommandLog = path.join(opencodeConfigDir, "fake-agent-commands.log");
const fakeBinDir = path.join(opencodeConfigDir, "bin");
const fakeCodexPath = path.join(fakeBinDir, process.platform === "win32" ? "codex.cmd" : "codex");
const fakeClaudePath = path.join(fakeBinDir, process.platform === "win32" ? "claude.cmd" : "claude");
const fakeGeminiPath = path.join(fakeBinDir, process.platform === "win32" ? "gemini.cmd" : "gemini");
const fakeKiloPath = path.join(fakeBinDir, process.platform === "win32" ? "kilo.cmd" : "kilo");
const fakeCopilotPath = path.join(fakeBinDir, process.platform === "win32" ? "copilot.cmd" : "copilot");
const fakeOpenClawPath = path.join(fakeBinDir, process.platform === "win32" ? "openclaw.cmd" : "openclaw");
const fakeOpencodePath = path.join(fakeBinDir, process.platform === "win32" ? "opencode.cmd" : "opencode");
const fakeDockerPath = path.join(fakeBinDir, process.platform === "win32" ? "docker.cmd" : "docker");

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

async function installFakeDockerRuntime() {
  if (process.platform === "win32") {
    return false;
  }
  await fs.mkdir(fakeBinDir, { recursive: true });
  await fs.mkdir(remoteOpenCodeHome, { recursive: true });
  const fakeDockerRuntimePath = `${fakeDockerPath}.js`;
  await fs.writeFile(fakeDockerRuntimePath, [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "const path = require('path');",
    "const args = process.argv.slice(2);",
    "const remoteHome = process.env.PACT_FAKE_REMOTE_HOME || process.cwd();",
    "const logPath = process.env.PACT_FAKE_AGENT_LOG || '';",
    "function writeLog(line) { if (logPath) fs.appendFileSync(logPath, `${line}\\n`); }",
    "function writeJson(filePath, value) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\\n`); }",
    "function readJson(filePath, fallback) { try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; } }",
    "function openCodeConfigPath() { return path.join(remoteHome, '.config', 'opencode', 'opencode.jsonc'); }",
    "function writeOpenCode(url) { const filePath = openCodeConfigPath(); const config = readJson(filePath, {}); config.mcp = { ...(config.mcp || {}), pact: { type: 'remote', url, headers: { 'X-Pact-Api-Key': 'fake-token' }, enabled: true } }; writeJson(filePath, config); }",
    "function removeOpenCode() { const filePath = openCodeConfigPath(); const config = readJson(filePath, {}); if (config.mcp) delete config.mcp.pact; writeJson(filePath, config); }",
    "function hasOpenCode() { return Boolean(readJson(openCodeConfigPath(), {}).mcp?.pact); }",
    "function writeCodexEnv(envName) { const dir = path.join(remoteHome, '.pact', 'mcp'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'env'), `export ${envName}='fake-token-for-remote-codex-verifier'\\n`); const profile = path.join(remoteHome, '.profile'); const text = fs.existsSync(profile) ? fs.readFileSync(profile, 'utf8') : ''; if (!text.includes('Pact MCP token env')) fs.appendFileSync(profile, '\\n# Pact MCP token env\\n[ -f \"$HOME/.pact/mcp/env\" ] && . \"$HOME/.pact/mcp/env\"\\n'); }",
    "function handleCodex(cmd) { const marker = path.join(remoteHome, '.codex-pact-mcp-installed'); if (cmd[2] === '--help') { process.stdout.write('Usage: codex mcp add get list remove\\n'); return 0; } if (cmd[2] === 'add') { fs.mkdirSync(remoteHome, { recursive: true }); fs.writeFileSync(marker, 'installed\\n'); writeLog(`codex|mcp add|${cmd.slice(3, 8).join('|')}`); return 0; } if (cmd[2] === 'remove') { fs.rmSync(marker, { force: true }); return 0; } if (cmd[2] === 'get') { if (!fs.existsSync(marker)) return 1; process.stdout.write('pact http://127.0.0.1/mcp\\n'); return 0; } return 1; }",
    "if (args[0] === 'ps') { process.stdout.write('box123\\tagentbox\\n'); process.exit(0); }",
    "if (args[0] === 'inspect') { process.stdout.write('172.17.0.1\\n'); process.exit(0); }",
    "if (args[0] !== 'exec') process.exit(1);",
    "let index = 1;",
    "if (args[index] === '-i') index += 1;",
    "const env = {};",
    "while (args[index] === '-e') { const [name, ...rest] = String(args[index + 1] || '').split('='); env[name] = rest.join('='); index += 2; }",
    "const container = args[index++];",
    "let cmd = args.slice(index);",
    "if (container !== 'box123') process.exit(1);",
    "if ((cmd[0] === 'sh' || cmd[0] === 'bash') && cmd[1] === '-lc') { const script = String(cmd[2] || ''); if (script.includes(\"command_name='codex'\")) { process.stdout.write('/usr/local/bin/codex\\n'); process.exit(0); } if (env.PACT_TOKEN_ENV) { writeCodexEnv(env.PACT_TOKEN_ENV); process.exit(0); } if (script.includes('delete config.mcp.pact')) { removeOpenCode(); process.stdout.write('removed\\n'); process.exit(0); } if (script.includes(\".config', 'opencode'\")) { writeOpenCode(env.PACT_URL || ''); process.exit(0); } if (script.includes('.config/opencode/opencode.jsonc')) process.exit(hasOpenCode() ? 0 : 1); process.exit(0); }",
    "if (cmd[0] === 'env') { cmd = cmd.slice(1); while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(cmd[0] || '')) cmd = cmd.slice(1); }",
    "if (cmd[0] === '/usr/local/bin/codex' && cmd[1] === 'mcp') process.exit(handleCodex(cmd));",
    "process.exit(1);",
    ""
  ].join("\n"));
  await fs.writeFile(fakeDockerPath, [
    "#!/bin/bash",
    `exec "${process.execPath}" "${fakeDockerRuntimePath}" "$@"`,
    ""
  ].join("\n"), { mode: 0o755 });
  return true;
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
  await testAsync("refresh opencode grant for connector install flow", async () => {
    const g = await fetchJson(`${serverUrl}/api/mcp/local-grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets: ["opencode"], label: "opencode-install-test", connectorVersion: "verify" })
    });
    assert.equal(g.status, 201);
    assert.ok(g.payload.token);
    token = g.payload.token;
    localGrantId = g.payload.grant?.id || "";
    assert.ok(localGrantId);
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

  await testAsync("cli remote opencode install writes remote config", async () => {
    const canRun = await installFakeDockerRuntime();
    if (!canRun) {
      return;
    }
    const result = await spawnConnector([
      "install",
      "--target", "opencode",
      "--url", serverUrl,
      "--token", token,
      "--execution-location", "docker",
      "--remote-kind", "docker",
      "--remote-id", "box123",
      "--remote-name", "agentbox",
      "--remote-bin", fakeDockerPath,
      "--discovery-file", remoteOpenCodeRegistryPath,
      "--no-verify",
      "--json"
    ], 60000, {
      PACT_FAKE_REMOTE_HOME: remoteOpenCodeHome
    });
    if (result.code !== 0) {
      console.log(`\n      stdout: ${result.stdout.slice(0, 300)}`);
      console.log(`      stderr: ${result.stderr.slice(0, 300)}`);
    }
    assert.equal(result.code, 0, `exit code ${result.code}`);
    assert.equal(result.stdout.includes(token), false, "remote install output must not expose the grant token");
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.installed?.opencode?.status, "installed");
    assert.equal(payload.installed?.opencode?.installMode, "opencode-docker-mcp-config");

    const remoteConfig = JSON.parse(await fs.readFile(path.join(remoteOpenCodeHome, ".config", "opencode", "opencode.jsonc"), "utf8"));
    assert.equal(remoteConfig.mcp?.pact?.type, "remote");
    assert.match(remoteConfig.mcp?.pact?.url || "", /\/mcp$/);
    assert.ok(remoteConfig.mcp?.pact?.headers?.["X-Pact-Api-Key"]);
  });

  await testAsync("scan detects remote codex in container", async () => {
    const canRun = await installFakeDockerRuntime();
    if (!canRun) {
      return;
    }
    const result = await spawnConnector([
      "scan",
      "--json",
      "--url", serverUrl,
      "--orb-bin", "/nonexistent/orb",
      "--docker-bin", fakeDockerPath,
      "--podman-bin", "/nonexistent/podman",
      "--nerdctl-bin", "/nonexistent/nerdctl",
      "--wsl-bin", "/nonexistent/wsl",
      "--lima-bin", "/nonexistent/limactl",
      "--colima-bin", "/nonexistent/colima",
      "--multipass-bin", "/nonexistent/multipass",
      "--lxc-bin", "/nonexistent/lxc",
      "--incus-bin", "/nonexistent/incus",
      "--vagrant-bin", "/nonexistent/vagrant",
      "--parallels-bin", "/nonexistent/prlctl"
    ], 60000, {
      PACT_FAKE_REMOTE_HOME: remoteOpenCodeHome,
      PACT_FAKE_AGENT_LOG: fakeAgentCommandLog
    });
    assert.equal(result.code, 0, result.stderr || result.stdout);
    const payload = JSON.parse(result.stdout);
    const remoteCodex = payload.candidates?.find((candidate) =>
      candidate.target === "codex" &&
        candidate.optionOverrides?.["execution-location"] === "docker"
    );
    assert.ok(remoteCodex, "remote Docker Codex should be detected");
    assert.equal(remoteCodex.optionOverrides?.["codex-bin"], "/usr/local/bin/codex");
    assert.ok(remoteCodex.installCommand?.includes("--target codex"));
    assert.ok(remoteCodex.installCommand?.includes("--execution-location"));
  });

  await testAsync("cli remote codex install and uninstall use remote context", async () => {
    const canRun = await installFakeDockerRuntime();
    if (!canRun) {
      return;
    }
    const install = await spawnConnector([
      "install",
      "--target", "codex",
      "--url", serverUrl,
      "--token", token,
      "--token-env", remoteCodexTokenEnv,
      "--execution-location", "docker",
      "--remote-kind", "docker",
      "--remote-id", "box123",
      "--remote-name", "agentbox",
      "--remote-bin", fakeDockerPath,
      "--codex-bin", "/usr/local/bin/codex",
      "--discovery-file", remoteCodexRegistryPath,
      "--no-verify",
      "--json"
    ], 60000, {
      PACT_FAKE_REMOTE_HOME: remoteOpenCodeHome,
      PACT_FAKE_AGENT_LOG: fakeAgentCommandLog
    });
    if (install.code !== 0) {
      console.log(`\n      stdout: ${install.stdout.slice(0, 300)}`);
      console.log(`      stderr: ${install.stderr.slice(0, 300)}`);
    }
    assert.equal(install.code, 0, `exit code ${install.code}`);
    assert.equal(install.stdout.includes(token), false, "remote Codex install output must not expose the grant token");
    const installPayload = JSON.parse(install.stdout);
    assert.equal(installPayload.ok, true);
    assert.equal(installPayload.installed?.codex?.status, "installed");
    assert.equal(installPayload.installed?.codex?.installMode, "codex-docker-mcp-cli");
    const remoteEnv = await fs.readFile(path.join(remoteOpenCodeHome, ".pact", "mcp", "env"), "utf8");
    assert.match(remoteEnv, new RegExp(`export ${remoteCodexTokenEnv}=`));
    const commandLog = await fs.readFile(fakeAgentCommandLog, "utf8");
    assert.match(commandLog, /codex\|mcp add\|pact\|--url/);
    assert.equal(commandLog.includes(token), false, "remote Codex command log must not expose token values");

    const uninstall = await spawnConnector([
      "uninstall",
      "--target", "codex",
      "--execution-location", "docker",
      "--remote-kind", "docker",
      "--remote-id", "box123",
      "--remote-name", "agentbox",
      "--remote-bin", fakeDockerPath,
      "--codex-bin", "/usr/local/bin/codex",
      "--discovery-file", remoteCodexRegistryPath,
      "--json"
    ], 60000, {
      PACT_FAKE_REMOTE_HOME: remoteOpenCodeHome
    });
    assert.equal(uninstall.code, 0, uninstall.stderr || uninstall.stdout);
    const uninstallPayload = JSON.parse(uninstall.stdout);
    assert.equal(uninstallPayload.ok, true);
    assert.equal(uninstallPayload.uninstalled?.codex?.status, "not-installed");
    assert.equal(uninstallPayload.uninstalled?.codex?.uninstallMode, "codex-docker-mcp-cli");
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

  await testAsync("doctor without token returns executable auth repair command", async () => {
    const result = await spawnConnector([
      "doctor",
      "--url", serverUrl,
      "--discovery-file", tempRegistryPath,
      "--token-env", missingDoctorTokenEnv,
      "--json"
    ]);
    if (result.code !== 0) {
      console.log(`\n      stdout: ${result.stdout.slice(0, 1200)}`);
      console.log(`      stderr: ${result.stderr.slice(0, 400)}`);
    }
    assert.equal(result.code, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.checks?.toolsList?.skipped, true);
    assert.equal(payload.nextCommand, "pact-mcp doctor --token-stdin --json");
    assert.ok(payload.repairCommands?.includes("pact-mcp doctor --token-stdin --json"));
  });

  await testAsync("doctor human output redacts local registry path", async () => {
    const result = await spawnConnector([
      "doctor",
      "--url", serverUrl,
      "--discovery-file", tempRegistryPath,
      "--token-env", missingDoctorTokenEnv
    ]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /Local registry: <local-path>\/pact-servers\.json/);
    assert.equal(result.stdout.includes(tempRegistryPath), false, "doctor human output must not expose the registry path");
    assert.equal(result.stdout.includes(path.dirname(tempRegistryPath)), false, "doctor human output must not expose the registry directory");
  });

  await testAsync("doctor with token verifies installed target without leaking token", async () => {
    const config = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    const installedToken = config.mcp?.pact?.headers?.["X-Pact-Api-Key"];
    const result = await spawnConnector([
      "doctor",
      "--url", serverUrl,
      "--token", installedToken,
      "--discovery-file", tempRegistryPath,
      "--json"
    ]);
    if (result.code !== 0) {
      console.log(`\n      stdout: ${result.stdout.slice(0, 1200)}`);
      console.log(`      stderr: ${result.stderr.slice(0, 400)}`);
    }
    assert.equal(result.code, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.checks?.toolsList?.ok, true);
    assert.equal(payload.checks?.systemHealth?.ok, true);
    assert.deepEqual(payload.repairCommands, []);
    assert.equal(result.stdout.includes(installedToken), false, "doctor output must not expose token values");
  });

  await testAsync("doctor with invalid token returns executable reinstall command", async () => {
    const result = await spawnConnector([
      "doctor",
      "--url", serverUrl,
      "--token", "invalid-token-for-doctor",
      "--discovery-file", tempRegistryPath,
      "--json"
    ]);
    assert.equal(result.code, 1);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.checks?.toolsList?.ok, false);
    assert.equal(payload.checks?.systemHealth?.ok, false);
    assert.equal(payload.nextCommand, "pact-mcp install --target auto --json");
    assert.ok(payload.repairCommands?.includes("pact-mcp doctor --token-stdin --json"));
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

  await testAsync("cli remote opencode uninstall removes remote config", async () => {
    if (process.platform === "win32") {
      return;
    }
    const result = await spawnConnector([
      "uninstall",
      "--target", "opencode",
      "--execution-location", "docker",
      "--remote-kind", "docker",
      "--remote-id", "box123",
      "--remote-name", "agentbox",
      "--remote-bin", fakeDockerPath,
      "--discovery-file", remoteOpenCodeRegistryPath,
      "--json"
    ], 60000, {
      PACT_FAKE_REMOTE_HOME: remoteOpenCodeHome,
      PACT_MCP_URL: ""
    });
    if (result.code !== 0) {
      console.log(`\n      stdout: ${result.stdout.slice(0, 300)}`);
      console.log(`      stderr: ${result.stderr.slice(0, 300)}`);
    }
    assert.equal(result.code, 0, `exit code ${result.code}`);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.uninstalled?.opencode?.status, "not-installed");
    assert.equal(payload.uninstalled?.opencode?.uninstallMode, "opencode-docker-mcp-config");
    const remoteConfig = JSON.parse(await fs.readFile(path.join(remoteOpenCodeHome, ".config", "opencode", "opencode.jsonc"), "utf8"));
    assert.equal(remoteConfig.mcp?.pact, undefined);
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
  await unsetLaunchctlEnv(missingDoctorTokenEnv);
  await fs.rm(userDataPath, { recursive: true, force: true }).catch(() => {});
  await fs.rm(opencodeConfigDir, { recursive: true, force: true }).catch(() => {});
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${passed + failed} total ===`);
process.exit(failed > 0 ? 1 : 0);
