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

function spawnConnector(args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [connectorScript, ...args], {
      env: { ...process.env },
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

const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), "pact-opencode-install-"));
const opencodeConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), "pact-opencode-config-"));
const opencodeConfigPath = path.join(opencodeConfigDir, "opencode.jsonc");
const tempRegistryPath = path.join(opencodeConfigDir, "pact-servers.json");

let serverUrl = "";
console.log("\n=== Pact OpenCode MCP Install Verification ===\n");

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

  // ── SECTION 3: Config manipulation (simulating installOpenCode) ──
  console.log("\n[3] Config file manipulation");

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

  // ── SECTION 5: Verify installed config works ──
  console.log("\n[5] Verify installed config");
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

  // ── SECTION 6: End-to-end CLI uninstall ──
  console.log("\n[6] End-to-end CLI uninstall --target opencode");
  await testAsync("cli uninstall succeeds", async () => {
    const result = await spawnConnector([
      "uninstall",
      "--target", "opencode",
      "--url", serverUrl,
      "--opencode-config", opencodeConfigPath,
      "--discovery-file", tempRegistryPath
    ]);
    if (result.code !== 0) {
      console.log(`\n      stdout: ${result.stdout.slice(0, 300)}`);
      console.log(`      stderr: ${result.stderr.slice(0, 300)}`);
    }
    assert.equal(result.code, 0, `exit code ${result.code}`);

    const config = JSON.parse(await fs.readFile(opencodeConfigPath, "utf8"));
    assert.equal(config.mcp?.pact, undefined, "pact should be removed after uninstall");
  });

  // ── SECTION 7: Scan detection ──
  console.log("\n[7] Scan detection");
  await testAsync("scan --json includes opencode", async () => {
    const result = await spawnConnector(["scan", "--json", "--url", serverUrl, "--no-scan"]);
    const scan = JSON.parse(result.stdout);
    const oc = scan.candidates.find((c) => c.target === "opencode");
    assert.ok(oc, "scan should include opencode");
    assert.equal(oc.label, "OpenCode");
  });

  // ── SECTION 8: Connector self-checks ──
  console.log("\n[8] Connector self-checks");
  await testAsync("--version works", async () => {
    const result = await spawnConnector(["--version"]);
    assert.equal(result.code, 0);
    const v = JSON.parse(result.stdout);
    assert.equal(v.packageName, "pact-mcp-connector");
    assert.ok(v.packageVersion);
  });

  await testAsync("usage (help) includes opencode", async () => {
    const result = await spawnConnector([]);
    assert.match(result.stdout, /opencode/);
  });

  await testAsync("supported targets include opencode", async () => {
    const result = await spawnConnector(["scan", "--json", "--url", serverUrl, "--no-scan"]);
    const scan = JSON.parse(result.stdout);
    const targets = scan.candidates.map((c) => c.target);
    assert.ok(targets.includes("opencode"), `targets: ${targets.join(", ")}`);
  });

} catch (error) {
  console.error(`\nUNEXPECTED ERROR: ${error.message}`);
  failed++;
} finally {
  if (server?.close) {
    await server.close();
  }
  await fs.rm(userDataPath, { recursive: true, force: true }).catch(() => {});
  await fs.rm(opencodeConfigDir, { recursive: true, force: true }).catch(() => {});
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${passed + failed} total ===`);
process.exit(failed > 0 ? 1 : 0);
