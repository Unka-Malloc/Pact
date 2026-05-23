#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { createPublicKey, randomBytes, verify } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));

const DEFAULT_TOKEN_ENV = "PACT_MCP_TOKEN";
const DEFAULT_CODEX_BIN = "codex";
const DEFAULT_GEMINI_BIN = "gemini";
const DEFAULT_KILO_BIN = "kilo";
const DEFAULT_COPILOT_BIN = "copilot";
const DEFAULT_ORB_BIN = "orb";
const DEFAULT_DOCKER_BIN = "docker";
const DEFAULT_PODMAN_BIN = "podman";
const DEFAULT_WSL_BIN = "wsl.exe";
const CLAW_COMPATIBLE_COMMANDS = ["openclaw", "ironclaw", "zeroclaw"];
const AGENT_CLI_TARGETS = [
  {
    target: "codex",
    label: "Codex",
    binOption: "codex-bin",
    commandNames: ["codex"]
  },
  {
    target: "gemini-cli",
    label: "Gemini CLI",
    binOption: "gemini-bin",
    commandNames: ["gemini"]
  },
  {
    target: "copilot",
    label: "Copilot",
    binOption: "copilot-bin",
    commandNames: ["copilot"]
  },
  {
    target: "kilo-code",
    label: "Kilo Code",
    binOption: "kilo-bin",
    commandNames: ["kilo"]
  }
];
const ORB_AGENT_CLI_TARGETS = AGENT_CLI_TARGETS.filter((descriptor) => descriptor.target !== "codex");
const APP_DISCOVERY_NAME_HINTS = [
  "pact",
  "antigravity",
  "aider",
  "anthropic",
  "chatgpt",
  "claude",
  "cline",
  "codex",
  "codeium",
  "continue",
  "copilot",
  "cursor",
  "devin",
  "gemini",
  "goose",
  "hermes",
  "kilo",
  "openclaw",
  "qodo",
  "roo",
  "serena",
  "tabnine",
  "trae",
  "windsurf",
  "zeroclaw"
];
const APP_DISCOVERY_WORD_HINTS = ["agent", "bot", "claw", "code"];
const PLUGIN_NAME = "pact-mcp";
const MARKETPLACE_NAME = "pact-local";
const GEMINI_EXTENSION_NAME = "Pact";
const MCP_SERVER_NAME = "pact";
const MCP_STABLE_TOOL_NAME = "pact.call";
const MCP_INTERFACE_VERSION = "pact.mcp.v1";
const HTTP_TIMEOUT_MS = 300000;
const SUPPORTED_TARGETS = [
  "codex",
  "gemini-cli",
  "kilo-code",
  "copilot",
  "openclaw",
  "hermes",
  "antigravity"
];
const PACT_MCP_URL_ENV = "PACT_MCP_URL";
const PACT_MCP_DISCOVERY_URL_ENV = "PACT_MCP_DISCOVERY_URL";
const PACT_MCP_DISCOVERY_FILE_ENV = "PACT_MCP_DISCOVERY_FILE";
const DEFAULT_DISCOVERY_REGISTRY = path.join(os.homedir(), ".pact", "mcp", "servers.json");
const DEFAULT_SCAN_PORTS = [7228, 7229, 7230, 7231, 7232, 7233, 7234, 7235, 7236, 7237];
const TARGET_ALIASES = new Map([
  ["gemini", "gemini-cli"],
  ["gemini_cli", "gemini-cli"],
  ["kilo", "kilo-code"],
  ["kilocode", "kilo-code"],
  ["kilo_code", "kilo-code"],
  ["github-copilot", "copilot"],
  ["openclaw-kate", "openclaw"],
  ["hermes-agent", "hermes"],
  ["hermes-serena", "hermes"]
]);
const TARGET_LABELS = {
  codex: "Codex",
  "gemini-cli": "Gemini CLI",
  "kilo-code": "Kilo Code",
  copilot: "Copilot",
  openclaw: "OpenClaw",
  hermes: "Hermes Agent",
  antigravity: "Antigravity"
};
const TARGET_INSTALL_MODES = {
  codex: "codex-release-plugin-and-mcp-cli",
  "gemini-cli": "gemini-release-mcp-cli",
  "kilo-code": "kilo-release-global-kilo-json",
  copilot: "copilot-release-mcp-cli",
  openclaw: "openclaw-release-mcp-cli",
  hermes: "hermes-release-mcp-cli",
  antigravity: "antigravity-release-mcp-config"
};
const SCAN_COMMAND_TIMEOUT_MS = 3000;
const REMOTE_SCAN_COMMAND_TIMEOUT_MS = 8000;
const HOST_PLATFORM = Object.freeze({
  MACOS: "darwin",
  LINUX: "linux",
  WINDOWS: "win32"
});
const PACKAGE_SOURCE_KIND = Object.freeze({
  STATIC_DIRS: "static-dirs",
  COMMAND_DIR: "command-dir",
  VERSIONED_DIRS: "versioned-dirs",
  COMMAND_PATHS: "command-paths",
  COMMAND_PREFIX_DIRS: "command-prefix-dirs"
});

function usage() {
  return [
    "Usage:",
    "  pact-mcp register",
    "  pact-mcp install",
    "  pact-mcp install --target codex",
    "  pact-mcp uninstall",
    "  pact-mcp uninstall --target codex",
    "  pact-mcp scan --json",
    "  pact-mcp discover-local",
    "  pact-mcp doctor",
    "  pact-mcp discover",
    "  pact-mcp server-config --set --url http://host:port --name local",
    "  pact-mcp server-config --switch local",
    "  pact-mcp server-config --refresh",
    "  pact-mcp server-config --reset",
    "",
    "Options:",
    "  --target LIST                 Comma-separated targets for non-interactive install. Default: codex.",
    "  --url URL                     Explicit Pact base URL. Still requires signed MCP handshake.",
    "  --scan-ports LIST            Local ports to scan when --url is omitted. Default: 7228-7237.",
    "  --token TOKEN                 Pact MCP token. Prefer --token-stdin or --token-env.",
    "  --token-stdin                 Read token from stdin.",
    "  --token-env NAME              Token environment variable. Default: PACT_MCP_TOKEN.",
    "  --no-auto-token               Require an explicit token instead of requesting a local grant.",
    "  --no-verify                   Skip post-install MCP HTTP verification.",
    "  --json                        Emit JSON.",
    "  --pretty                      Pretty-print JSON output.",
    "  --no-env                      Do not publish launchctl environment variables during register.",
    "  --discovery-file PATH         Registry file used by register/discover-local. Default: ~/.pact/mcp/servers.json.",
    "  --auto-update                 Enable automatic push updates when installing (non-interactive mode).",
    "  --codex-bin COMMAND           Codex CLI command or explicit path. Default: codex.",
    "  --gemini-bin COMMAND          Gemini CLI command or explicit path. Default: gemini.",
    "  --kilo-bin COMMAND            Kilo Code CLI command or explicit path. Default: kilo.",
    "  --copilot-bin COMMAND         Copilot CLI command or explicit path. Default: copilot.",
    "  --orb-bin COMMAND             OrbStack CLI command or explicit path. Default: orb.",
    "  --docker-bin COMMAND          Docker CLI command or explicit path. Default: docker.",
    "  --podman-bin COMMAND          Podman CLI command or explicit path. Default: podman.",
    "  --wsl-bin COMMAND             WSL CLI command or explicit path. Default: wsl.exe.",
    "  --vm NAME                     Shared OrbStack VM name for OpenClaw/Hermes.",
    "  --vm-user USER                Shared OrbStack VM user for OpenClaw/Hermes.",
    "  --openclaw-vm NAME            Explicit OrbStack VM for non-interactive OpenClaw install.",
    "  --openclaw-user USER          Explicit OrbStack VM user for non-interactive OpenClaw install.",
    "  --openclaw-bin PATH           Explicit OpenClaw-like CLI path. No default path is assumed.",
    "  --hermes-vm NAME              Explicit OrbStack VM for non-interactive Hermes install.",
    "  --hermes-user USER            Explicit OrbStack VM user for non-interactive Hermes install.",
    "  --hermes-bin PATH             Explicit Hermes CLI path. No default path is assumed.",
    "",
    "Interactive install:",
    "  When --target is omitted in a TTY, install opens a multi-select menu.",
    "  Use Up/Down or j/k to move, Space to toggle, a to toggle detected clients, Enter to install.",
    "",
    "Interactive uninstall:",
    "  When --target is omitted in a TTY, uninstall scans the same clients and opens a multi-select removal menu."
  ].join("\n");
}

function parseArgs(argv) {
  const options = {};
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      positionals.push(item);
      continue;
    }
    const keyValue = item.slice(2);
    const equalIndex = keyValue.indexOf("=");
    const key = equalIndex >= 0 ? keyValue.slice(0, equalIndex) : keyValue;
    const inlineValue = equalIndex >= 0 ? keyValue.slice(equalIndex + 1) : null;
    if (
      key === "help" ||
      key === "json" ||
      key === "pretty" ||
      key === "token-stdin" ||
      key === "no-verify" ||
      key === "no-auto-token" ||
      key === "no-scan" ||
      key === "set" ||
      key === "refresh" ||
      key === "reset" ||
      key === "list"
    ) {
      options[key] = true;
      continue;
    }
    const next = argv[index + 1];
    const value = inlineValue !== null ? inlineValue : !next || next.startsWith("--") ? true : next;
    if (inlineValue === null && value !== true) {
      index += 1;
    }
    options[key] = value;
  }
  return {
    command: positionals[0] || "",
    options
  };
}

function option(options, name, fallback = "") {
  return options[name] === undefined ? fallback : options[name];
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeTarget(value) {
  const raw = String(value || "").trim().toLowerCase();
  return TARGET_ALIASES.get(raw) || raw;
}

function parseTargets(rawTarget) {
  const values = String(rawTarget || "codex").split(",").map(normalizeTarget).filter(Boolean);
  const deduped = [...new Set(values)];
  for (const target of deduped) {
    if (!SUPPORTED_TARGETS.includes(target)) {
      throw new Error(`Unsupported install target: ${target}`);
    }
  }
  return deduped;
}

function targetLabel(target) {
  return TARGET_LABELS[target] || target;
}

function targetInstallMode(target) {
  return TARGET_INSTALL_MODES[target] || "pact-mcp-client-install";
}

function redactToken(value) {
  const text = String(value || "");
  if (text.length <= 12) {
    return "***";
  }
  return `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function vmBaseUrl(baseUrl) {
  const parsed = new URL(baseUrl);
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  return `${parsed.protocol}//host.orb.internal:${port}`;
}

function baseUrlWithHost(baseUrl, host) {
  const parsed = new URL(baseUrl);
  parsed.hostname = host;
  return normalizeBaseUrl(parsed.toString());
}

function isLoopbackHost(hostname) {
  const value = String(hostname || "").toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1" || value === "[::1]";
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function expandHomePath(value) {
  const text = String(value || "").trim();
  if (text === "~") {
    return os.homedir();
  }
  if (text.startsWith("~/")) {
    return path.join(os.homedir(), text.slice(2));
  }
  return text;
}

function discoveryRegistryPath(options = {}) {
  const requested = option(
    options,
    "discovery-file",
    process.env[PACT_MCP_DISCOVERY_FILE_ENV] || DEFAULT_DISCOVERY_REGISTRY
  );
  return path.resolve(expandHomePath(requested));
}

function deviceDiscoveryPaths(options = {}) {
  return [discoveryRegistryPath(options)];
}

function deviceDiscoveryEnv({ baseUrl, primaryPath }) {
  return {
    [PACT_MCP_URL_ENV]: `${baseUrl}/mcp`,
    [PACT_MCP_DISCOVERY_URL_ENV]: `${baseUrl}/.well-known/pact/mcp.json`,
    [PACT_MCP_DISCOVERY_FILE_ENV]: primaryPath
  };
}

async function run(command, args = [], options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...(options.env || {})
      },
      timeout: options.timeoutMs || 0,
      killSignal: options.killSignal || "SIGKILL",
      maxBuffer: 10 * 1024 * 1024
    });
    return {
      ok: true,
      stdout: result.stdout || "",
      stderr: result.stderr || ""
    };
  } catch (error) {
    if (options.allowFailure) {
      return {
        ok: false,
        stdout: error.stdout || "",
        stderr: error.stderr || error.message || ""
      };
    }
    const message = error.stderr || error.stdout || error.message || "command failed";
    throw new Error(`${command} failed: ${message}`);
  }
}

async function runWithInput(command, args = [], input = "", options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...(options.env || {})
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (options.allowFailure) {
        resolve({ ok: false, stdout, stderr: stderr || error.message || "" });
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true, stdout, stderr });
        return;
      }
      if (options.allowFailure) {
        resolve({ ok: false, stdout, stderr });
        return;
      }
      reject(new Error(`${command} exited with ${code}: ${stderr || stdout}`));
    });
    child.stdin.end(input);
  });
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])])
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function verifySignedPayload({ publicKeyJwk, payload, signature }) {
  const publicKey = createPublicKey({ key: publicKeyJwk, format: "jwk" });
  return verify(
    null,
    Buffer.from(stableStringify(payload)),
    publicKey,
    Buffer.from(String(signature || ""), "base64url")
  );
}

async function fetchJson(url, options = {}) {
  const { timeoutMs = 10000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: fetchOptions.signal || controller.signal
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      payload: text.trim() ? JSON.parse(text) : {}
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value);
}

async function backupIfExists(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    return "";
  }
  const backupPath = `${filePath}.pact-backup-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z")}`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

async function removeDirIfExists(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
}

async function removeCodexMarketplacePlugin({ marketplaceRoot }) {
  const marketplacePath = path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json");
  const marketplace = await readJson(marketplacePath, null);
  if (!marketplace?.plugins) {
    return "";
  }
  const plugins = marketplace.plugins.filter((plugin) => plugin?.name !== PLUGIN_NAME);
  if (plugins.length === marketplace.plugins.length) {
    return "";
  }
  const backupPath = await backupIfExists(marketplacePath);
  await writeJson(marketplacePath, {
    ...marketplace,
    plugins
  });
  return backupPath;
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function readLaunchctlEnv(name) {
  if (process.platform !== "darwin") {
    return "";
  }
  const result = await run("launchctl", ["getenv", name], { allowFailure: true });
  return result.ok ? result.stdout.trim() : "";
}

function explicitBaseUrl(options = {}) {
  return normalizeBaseUrl(option(options, "url", process.env.PACT_MCP_BASE_URL || ""));
}

function baseUrlFromEndpoint(value) {
  const text = normalizeBaseUrl(value);
  if (!text) {
    return "";
  }
  try {
    const parsed = new URL(text);
    if (parsed.pathname === "/mcp") {
      parsed.pathname = "/";
      parsed.search = "";
      parsed.hash = "";
      return normalizeBaseUrl(parsed.toString());
    }
    if (
      parsed.pathname === "/api/mcp/discovery" ||
      parsed.pathname === "/.well-known/pact/mcp.json" ||
      parsed.pathname === "/api/mcp/handshake"
    ) {
      parsed.pathname = "/";
      parsed.search = "";
      parsed.hash = "";
      return normalizeBaseUrl(parsed.toString());
    }
    return text;
  } catch {
    return "";
  }
}

function parseScanPorts(options = {}) {
  const raw = String(option(options, "scan-ports", process.env.PACT_MCP_SCAN_PORTS || "")).trim();
  const values = raw
    ? raw.split(",").map((item) => Number(item.trim()))
    : DEFAULT_SCAN_PORTS;
  return uniqueValues(values
    .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535)
    .map(String))
    .map(Number);
}

async function registryBaseUrls(options = {}) {
  const payload = await readJson(discoveryRegistryPath(options), null);
  const server = payload?.servers?.[MCP_SERVER_NAME] || payload?.mcpServers?.[MCP_SERVER_NAME] || {};
  const profiles = Object.values(payload?.serverConfig?.profiles || {});
  const activeProfile = payload?.serverConfig?.activeName
    ? payload?.serverConfig?.profiles?.[payload.serverConfig.activeName]
    : null;
  return uniqueValues([
    activeProfile?.baseUrl,
    baseUrlFromEndpoint(server.httpUrl),
    baseUrlFromEndpoint(server.url),
    baseUrlFromEndpoint(payload?.discovery?.preferredHttpDiscoveryUrl),
    baseUrlFromEndpoint(payload?.discovery?.preferredApiDiscoveryUrl),
    ...profiles.map((profile) => profile?.baseUrl)
  ]);
}

async function candidateBaseUrls(options = {}) {
  const explicit = explicitBaseUrl(options);
  if (explicit) {
    return [explicit];
  }
  const launchDiscoveryFile = await readLaunchctlEnv(PACT_MCP_DISCOVERY_FILE_ENV);
  const launchDiscoveryUrl = await readLaunchctlEnv(PACT_MCP_DISCOVERY_URL_ENV);
  const launchMcpUrl = await readLaunchctlEnv(PACT_MCP_URL_ENV);
  const fileCandidates = uniqueValues([
    discoveryRegistryPath(options),
    launchDiscoveryFile
  ]);
  const fromFiles = [];
  for (const filePath of fileCandidates) {
    const payload = await readJson(filePath, null);
    const server = payload?.servers?.[MCP_SERVER_NAME] || payload?.mcpServers?.[MCP_SERVER_NAME] || {};
    const profiles = Object.values(payload?.serverConfig?.profiles || {});
    const activeProfile = payload?.serverConfig?.activeName
      ? payload?.serverConfig?.profiles?.[payload.serverConfig.activeName]
      : null;
    fromFiles.push(
      activeProfile?.baseUrl,
      baseUrlFromEndpoint(server.httpUrl),
      baseUrlFromEndpoint(server.url),
      baseUrlFromEndpoint(payload?.discovery?.preferredHttpDiscoveryUrl),
      baseUrlFromEndpoint(payload?.discovery?.preferredApiDiscoveryUrl),
      ...profiles.map((profile) => profile?.baseUrl)
    );
  }
  const scanned = parseScanPorts(options).flatMap((port) => [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`
  ]);
  return uniqueValues([
    baseUrlFromEndpoint(process.env[PACT_MCP_URL_ENV]),
    baseUrlFromEndpoint(process.env[PACT_MCP_DISCOVERY_URL_ENV]),
    baseUrlFromEndpoint(launchMcpUrl),
    baseUrlFromEndpoint(launchDiscoveryUrl),
    ...fromFiles,
    ...scanned
  ]).map(normalizeBaseUrl);
}

async function fetchPactDiscovery(baseUrl) {
  const url = `${baseUrl}/api/mcp/discovery`;
  const result = await fetchJson(url, { timeoutMs: 1500 });
  const payload = result.payload || {};
  const identity = payload.identity || null;
  if (
    !result.ok ||
    payload.name !== "Pact" ||
    payload.interfaceVersion !== MCP_INTERFACE_VERSION ||
    payload.stableToolName !== MCP_STABLE_TOOL_NAME ||
    identity?.algorithm !== "Ed25519" ||
    !identity?.publicKeyJwk ||
    !payload.handshake?.url
  ) {
    throw new Error("not an Pact MCP discovery response");
  }
  return payload;
}

async function verifyPactHandshake(baseUrl, discovery) {
  const nonce = randomBytes(32).toString("base64url");
  const result = await fetchJson(`${baseUrl}/api/mcp/handshake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nonce,
      client: {
        name: packageJson.name,
        version: packageJson.version
      }
    }),
    timeoutMs: 2500
  });
  const payload = result.payload?.payload || {};
  const signature = result.payload?.signature || {};
  const publicKeyJwk = payload.identity?.publicKeyJwk;
  if (
    !result.ok ||
    result.payload?.ok !== true ||
    payload.schemaVersion !== "pact.mcp.handshake.v1" ||
    payload.nonce !== nonce ||
    payload.server?.name !== "Pact" ||
    payload.server?.interfaceVersion !== MCP_INTERFACE_VERSION ||
    payload.server?.stableToolName !== MCP_STABLE_TOOL_NAME ||
    payload.identity?.keyId !== discovery.identity?.keyId ||
    signature.algorithm !== "Ed25519" ||
    !verifySignedPayload({ publicKeyJwk, payload, signature: signature.value })
  ) {
    throw new Error("Pact MCP handshake signature verification failed");
  }
  return {
    ok: true,
    baseUrl,
    discovery,
    handshake: result.payload
  };
}

async function discoverPactHub(options = {}) {
  const attempts = [];
  const candidates = await candidateBaseUrls(options);
  for (const baseUrl of candidates) {
    try {
      const discovery = await fetchPactDiscovery(baseUrl);
      const verified = await verifyPactHandshake(baseUrl, discovery);
      return {
        ...verified,
        attempts: [
          ...attempts,
          { baseUrl, ok: true, verified: true }
        ]
      };
    } catch (error) {
      attempts.push({
        baseUrl,
        ok: false,
        verified: false,
        reason: error?.name === "AbortError" ? "timeout" : error?.message || String(error)
      });
    }
  }
  return {
    ok: false,
    attempts,
    reason: "No signed Pact MCP hub was discovered on this device."
  };
}

async function optionsWithDiscoveredBaseUrl(options = {}) {
  const discovered = await discoverPactHub(options);
  if (!discovered.ok) {
    throw new Error(`${discovered.reason} Use --url only if you know the Pact base URL; it will still be handshake-verified.`);
  }
  return {
    ...options,
    "resolved-url": discovered.baseUrl,
    __pactDiscovery: discovered
  };
}

async function publishLaunchctlEnv(env) {
  if (process.platform === "darwin") {
    for (const [name, value] of Object.entries(env)) {
      await run("launchctl", ["setenv", name, value], { allowFailure: true });
    }
    return true;
  }
  
  if (process.platform === "win32") {
    for (const [name, value] of Object.entries(env)) {
      await run("setx", [name, value], { allowFailure: true });
    }
    return true;
  }

  console.log("\n[Notice] Please add the following to your ~/.bashrc or ~/.zshrc:");
  for (const [name, value] of Object.entries(env)) {
    console.log(`export ${name}="${value}"`);
  }
  console.log("");
  return false;
}

async function resolveToken(options, { required = false } = {}) {
  if (options.token) {
    return String(options.token).trim();
  }
  if (options["token-stdin"]) {
    return (await readStdin()).trim();
  }
  const tokenEnv = String(option(options, "token-env", DEFAULT_TOKEN_ENV));
  const envToken = String(process.env[tokenEnv] || "").trim();
  if (envToken) {
    return envToken;
  }
  const launchctlToken = await readLaunchctlEnv(tokenEnv);
  if (launchctlToken) {
    return launchctlToken;
  }
  if (required) {
    throw new Error(`Missing token. Provide --token-stdin, --token, or ${tokenEnv}.`);
  }
  return "";
}

async function ensureService(baseUrl) {
  const initialize = await fetchJson(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "pact-mcp-connector", version: packageJson.version }
      }
    })
  });
  if (!initialize.ok || initialize.payload?.result?.serverInfo?.name !== "Pact") {
    throw new Error(`Pact MCP is not available at ${baseUrl}/mcp.`);
  }
  return initialize;
}

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

async function verifyMcpTools({ baseUrl, token }) {
  const toolsList = await fetchJson(`${baseUrl}/mcp`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
  });
  const health = await fetchJson(`${baseUrl}/mcp`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: MCP_STABLE_TOOL_NAME,
        arguments: {
          apiVersion: MCP_INTERFACE_VERSION,
          operation: "system.health",
          input: {},
          clientVersion: packageJson.version
        }
      }
    })
  });
  const tools = toolsList.payload?.result?.tools || [];
  const hasStableOutlet = tools.some(t => t.name === MCP_STABLE_TOOL_NAME || t.name === "pact.help" || t.name === "pact.knowledge");
  if (
    !toolsList.ok
    || !health.ok
    || (tools.length !== 1 && tools.length !== 5)
    || !hasStableOutlet
    || health.payload?.result?.structuredContent?.payload?.ok !== true
  ) {
    throw new Error("MCP HTTP verification failed.");
  }
  return {
    toolCount: tools.length,
    stableToolName: tools.find(t => t.name === MCP_STABLE_TOOL_NAME || t.name === "pact.help")?.name || tools[0]?.name || "",
    systemHealthOk: health.payload?.result?.structuredContent?.payload?.ok === true
  };
}

async function createCodexPlugin({ marketplaceRoot, baseUrl, tokenEnv }) {
  const pluginRoot = path.join(marketplaceRoot, "plugins", PLUGIN_NAME);
  await fs.mkdir(path.join(pluginRoot, ".codex-plugin"), { recursive: true });
  await writeJson(path.join(pluginRoot, ".codex-plugin", "plugin.json"), {
    name: PLUGIN_NAME,
    version: packageJson.version,
    description: "Pact MCP integration for Codex.",
    author: {
      name: "Unka Y.Y.",
      url: "https://github.com/Unka-Malloc"
    },
    homepage: "https://github.com/Unka-Malloc/Pact",
    repository: "https://github.com/Unka-Malloc/Pact",
    license: "GPL-3.0-or-later",
    keywords: ["pact", "mcp", "workspace", "knowledge"],
    mcpServers: "./.mcp.json",
    interface: {
      displayName: "Pact MCP",
      shortDescription: "Connect Codex to Pact MCP",
      longDescription: "Use the Pact HTTP MCP endpoint through the stable pact.call tool.",
      developerName: "Unka-Malloc",
      category: "Coding",
      capabilities: ["Interactive", "Read", "Write"],
      websiteURL: "https://github.com/Unka-Malloc/Pact",
      privacyPolicyURL: "https://github.com/Unka-Malloc/Pact",
      termsOfServiceURL: "https://github.com/Unka-Malloc/Pact",
      defaultPrompt: ["Use Pact MCP through the stable pact.call tool"],
      brandColor: "#2563EB",
      screenshots: []
    }
  });
  await writeJson(path.join(pluginRoot, ".mcp.json"), {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        type: "http",
        url: `${baseUrl}/mcp`,
        bearer_token_env_var: tokenEnv,
        note: "Pact Unified Agent Workspace MCP. Provides five specialized outlets for Knowledge (Distillation/Sharing/Graph), Workspace (Shared Space), Resource Listing, Skill & Tooling, and Protocol Help. Token is provided through PACT_MCP_TOKEN by the connector installer."
      }
    }
  });
  await writeJson(path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json"), {
    name: MARKETPLACE_NAME,
    interface: {
      displayName: "Pact Local"
    },
    plugins: [
      {
        name: PLUGIN_NAME,
        source: {
          source: "local",
          path: `./plugins/${PLUGIN_NAME}`
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL"
        },
        category: "Coding"
      }
    ]
  });
  return {
    pluginRoot,
    marketplacePath: path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json")
  };
}

async function installCodex({ baseUrl, token, tokenEnv, codexBin, marketplaceRoot }) {
  await run("launchctl", ["setenv", tokenEnv, token], { allowFailure: true });
  process.env[tokenEnv] = token;
  const plugin = await createCodexPlugin({ marketplaceRoot, baseUrl, tokenEnv });
  await run(codexBin, ["plugin", "marketplace", "add", marketplaceRoot], { allowFailure: true });
  await run(codexBin, ["plugin", "remove", `${PLUGIN_NAME}@${MARKETPLACE_NAME}`], { allowFailure: true });
  const pluginAdd = await run(codexBin, ["plugin", "add", `${PLUGIN_NAME}@${MARKETPLACE_NAME}`], { allowFailure: true });
  await run(codexBin, ["mcp", "remove", MCP_SERVER_NAME], { allowFailure: true });
  await run(codexBin, [
    "mcp",
    "add",
    MCP_SERVER_NAME,
    "--url",
    `${baseUrl}/mcp`,
    "--bearer-token-env-var",
    tokenEnv
  ]);
  const mcpGet = await run(codexBin, ["mcp", "get", MCP_SERVER_NAME], {
    env: { [tokenEnv]: token }
  });
  return {
    installMode: "codex-release-plugin-and-mcp-cli",
    plugin: pluginAdd.ok ? `${PLUGIN_NAME}@${MARKETPLACE_NAME}` : null,
    pluginAddOk: pluginAdd.ok,
    pluginAddError: pluginAdd.ok ? null : `${(pluginAdd.stderr || pluginAdd.stdout || "").trim()}`,
    pluginRoot: plugin.pluginRoot,
    marketplacePath: plugin.marketplacePath,
    mcpGet: mcpGet.stdout
  };
}

async function createGeminiExtension({ extensionRoot, baseUrl, token }) {
  await writeJson(path.join(extensionRoot, "gemini-extension.json"), {
    name: GEMINI_EXTENSION_NAME,
    version: packageJson.version,
    description: "Connect Gemini CLI to the Pact MCP service.",
    mcpServers: {
      [MCP_SERVER_NAME]: {
        httpUrl: `${baseUrl}/mcp`,
        headers: {
          "X-Pact-Api-Key": token
        },
        timeout: HTTP_TIMEOUT_MS
      }
    }
  });
  await writeText(
    path.join(extensionRoot, "README.md"),
    "# Pact MCP\n\nGemini CLI extension generated by the `pact-mcp` connector release package.\n"
  );
}

async function installGemini({ baseUrl, token, geminiBin, extensionRoot }) {
  await createGeminiExtension({ extensionRoot, baseUrl, token });
  await run(geminiBin, ["extensions", "validate", extensionRoot]);
  await run(geminiBin, ["mcp", "remove", "--scope", "user", MCP_SERVER_NAME], { allowFailure: true });
  await run(geminiBin, [
    "mcp",
    "add",
    "--scope",
    "user",
    "--transport",
    "http",
    "--header",
    `X-Pact-Api-Key: ${token}`,
    "--timeout",
    String(HTTP_TIMEOUT_MS),
    "--trust",
    "--description",
    "Pact Unified Agent Workspace MCP. Provides five specialized outlets for Knowledge (Distillation/Sharing/Graph), Workspace (Shared Space), Resource Listing, Skill & Tooling, and Protocol Help.",
    MCP_SERVER_NAME,
    `${baseUrl}/mcp`
  ]);
  const list = await run(geminiBin, ["mcp", "list"]);
  const listOutput = `${list.stdout}\n${list.stderr}`;
  if (!listOutput.includes(MCP_SERVER_NAME)) {
    throw new Error("Gemini CLI MCP list does not include pact after install.");
  }
  return {
    installMode: "gemini-release-mcp-cli",
    extensionRoot,
    mcpListHasPact: true
  };
}

async function installGeminiOrb({ baseUrl, token, orbBin, vmName, vmUser, geminiBin }) {
  if (!vmName || !vmUser || !geminiBin) {
    throw new Error("Gemini VM install requires a discovered or explicit OrbStack VM, user, and gemini CLI path.");
  }
  const url = `${vmBaseUrl(baseUrl)}/mcp`;
  await run(orbBin, ["-m", vmName, "-u", vmUser, geminiBin, "mcp", "remove", "--scope", "user", MCP_SERVER_NAME], { allowFailure: true });
  await run(orbBin, [
    "-m",
    vmName,
    "-u",
    vmUser,
    geminiBin,
    "mcp",
    "add",
    "--scope",
    "user",
    "--transport",
    "http",
    "--header",
    `X-Pact-Api-Key: ${token}`,
    "--timeout",
    String(HTTP_TIMEOUT_MS),
    "--trust",
    "--description",
    "Pact Unified Agent Workspace MCP. Provides five specialized outlets for Knowledge (Distillation/Sharing/Graph), Workspace (Shared Space), Resource Listing, Skill & Tooling, and Protocol Help.",
    MCP_SERVER_NAME,
    url
  ]);
  const list = await run(orbBin, ["-m", vmName, "-u", vmUser, geminiBin, "mcp", "list"]);
  const listOutput = `${list.stdout}\n${list.stderr}`;
  if (!listOutput.includes(MCP_SERVER_NAME)) {
    throw new Error("Gemini CLI MCP list inside OrbStack does not include pact after install.");
  }
  return {
    installMode: "gemini-orbstack-mcp-cli",
    vm: vmName,
    vmUser,
    url,
    mcpListHasPact: true
  };
}

async function installGeminiRemote({ baseUrl, token, context, geminiBin }) {
  if (!context?.kind || !context?.id || !context?.bin || !geminiBin) {
    throw new Error("Gemini remote install requires a discovered remote context and gemini CLI path.");
  }
  const url = `${await remoteClientBaseUrl(context, baseUrl)}/mcp`;
  await runRemoteLinuxCommand(context, [geminiBin, "mcp", "remove", "--scope", "user", MCP_SERVER_NAME], { allowFailure: true });
  await runRemoteLinuxCommand(context, [
    geminiBin,
    "mcp",
    "add",
    "--scope",
    "user",
    "--transport",
    "http",
    "--header",
    `X-Pact-Api-Key: ${token}`,
    "--timeout",
    String(HTTP_TIMEOUT_MS),
    "--trust",
    "--description",
    "Pact Unified Agent Workspace MCP. Provides five specialized outlets for Knowledge (Distillation/Sharing/Graph), Workspace (Shared Space), Resource Listing, Skill & Tooling, and Protocol Help.",
    MCP_SERVER_NAME,
    url
  ]);
  const list = await runRemoteLinuxCommand(context, [geminiBin, "mcp", "list"]);
  const listOutput = `${list.stdout}\n${list.stderr}`;
  if (!listOutput.includes(MCP_SERVER_NAME)) {
    throw new Error(`Gemini CLI MCP list inside ${remoteContextLabel(context)} does not include pact after install.`);
  }
  return {
    installMode: `gemini-${context.kind}-mcp-cli`,
    remote: remoteContextLabel(context),
    url,
    mcpListHasPact: true
  };
}

async function installKilo({ baseUrl, token, kiloBin, kiloConfigPath }) {
  const config = await readJson(kiloConfigPath, {});
  const backupPath = await backupIfExists(kiloConfigPath);
  config.mcp = {
    ...(config.mcp || {}),
    [MCP_SERVER_NAME]: {
      type: "remote",
      url: `${baseUrl}/mcp`,
      enabled: true,
      headers: {
        "X-Pact-Api-Key": token
      },
      timeout: HTTP_TIMEOUT_MS
    }
  };
  await writeJson(kiloConfigPath, config);
  const list = await run(kiloBin, ["mcp", "list"], { allowFailure: true });
  return {
    installMode: "kilo-release-global-kilo-json",
    configPath: kiloConfigPath,
    backupPath,
    mcpListHasPact: list.stdout.includes(MCP_SERVER_NAME) || list.stderr.includes(MCP_SERVER_NAME)
  };
}

async function installKiloOrb({ baseUrl, token, orbBin, vmName, vmUser, kiloBin }) {
  if (!vmName || !vmUser || !kiloBin) {
    throw new Error("Kilo VM install requires a discovered or explicit OrbStack VM, user, and kilo CLI path.");
  }
  const url = `${vmBaseUrl(baseUrl)}/mcp`;
  const script = [
    "set -e",
    "IFS= read -r token",
    "node - \"$PACT_URL\" \"$token\" <<'NODE'",
    "const fs = require('fs');",
    "const os = require('os');",
    "const path = require('path');",
    "const url = process.argv[2];",
    "const token = process.argv[3];",
    "const filePath = path.join(os.homedir(), '.config', 'kilo', 'kilo.json');",
    "fs.mkdirSync(path.dirname(filePath), { recursive: true });",
    "let config = {};",
    "try { config = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}",
    "config.mcp = {",
    "  ...(config.mcp || {}),",
    "  pact: {",
    "    type: 'remote',",
    "    url,",
    "    enabled: true,",
    "    headers: { 'X-Pact-Api-Key': token },",
    `    timeout: ${HTTP_TIMEOUT_MS}`,
    "  }",
    "};",
    "fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\\n`);",
    "NODE",
    "\"$KILO_BIN\" mcp list >/dev/null 2>&1 || true"
  ].join("\n");
  await runWithInput(orbBin, [
    "-m",
    vmName,
    "-u",
    vmUser,
    "env",
    `KILO_BIN=${kiloBin}`,
    `PACT_URL=${url}`,
    "bash",
    "-lc",
    script
  ], `${token}\n`);
  return {
    installMode: "kilo-orbstack-global-kilo-json",
    vm: vmName,
    vmUser,
    url,
    configPath: "~/.config/kilo/kilo.json"
  };
}

async function installKiloRemote({ baseUrl, token, context, kiloBin }) {
  if (!context?.kind || !context?.id || !context?.bin || !kiloBin) {
    throw new Error("Kilo remote install requires a discovered remote context and kilo CLI path.");
  }
  const url = `${await remoteClientBaseUrl(context, baseUrl)}/mcp`;
  const script = [
    "set -e",
    "IFS= read -r token",
    "node - \"$PACT_URL\" \"$token\" <<'NODE'",
    "const fs = require('fs');",
    "const os = require('os');",
    "const path = require('path');",
    "const url = process.argv[2];",
    "const token = process.argv[3];",
    "const filePath = path.join(os.homedir(), '.config', 'kilo', 'kilo.json');",
    "fs.mkdirSync(path.dirname(filePath), { recursive: true });",
    "let config = {};",
    "try { config = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}",
    "config.mcp = {",
    "  ...(config.mcp || {}),",
    "  pact: {",
    "    type: 'remote',",
    "    url,",
    "    enabled: true,",
    "    headers: { 'X-Pact-Api-Key': token },",
    `    timeout: ${HTTP_TIMEOUT_MS}`,
    "  }",
    "};",
    "fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\\n`);",
    "NODE",
    "\"$KILO_BIN\" mcp list >/dev/null 2>&1 || true"
  ].join("\n");
  const result = await remoteLinuxShellWithInput(context, script, `${token}\n`, {
    KILO_BIN: kiloBin,
    PACT_URL: url
  });
  if (!result.ok) {
    throw new Error(`Kilo remote install failed in ${remoteContextLabel(context)}: ${result.stderr || result.stdout}`);
  }
  return {
    installMode: `kilo-${context.kind}-global-kilo-json`,
    remote: remoteContextLabel(context),
    url,
    configPath: "~/.config/kilo/kilo.json"
  };
}

async function installCopilot({ baseUrl, token, copilotBin }) {
  await run(copilotBin, ["mcp", "remove", MCP_SERVER_NAME], { allowFailure: true });
  await run(copilotBin, [
    "mcp",
    "add",
    "--transport",
    "http",
    "--header",
    `X-Pact-Api-Key: ${token}`,
    "--timeout",
    String(HTTP_TIMEOUT_MS),
    MCP_SERVER_NAME,
    `${baseUrl}/mcp`
  ]);
  const get = await run(copilotBin, ["mcp", "get", MCP_SERVER_NAME]);
  return {
    installMode: "copilot-release-mcp-cli",
    mcpGetHasPact: get.stdout.includes(MCP_SERVER_NAME) || get.stdout.includes(`${baseUrl}/mcp`)
  };
}

async function installCopilotOrb({ baseUrl, token, orbBin, vmName, vmUser, copilotBin }) {
  if (!vmName || !vmUser || !copilotBin) {
    throw new Error("Copilot VM install requires a discovered or explicit OrbStack VM, user, and copilot CLI path.");
  }
  const url = `${vmBaseUrl(baseUrl)}/mcp`;
  await run(orbBin, ["-m", vmName, "-u", vmUser, copilotBin, "mcp", "remove", MCP_SERVER_NAME], { allowFailure: true });
  await run(orbBin, [
    "-m",
    vmName,
    "-u",
    vmUser,
    copilotBin,
    "mcp",
    "add",
    "--transport",
    "http",
    "--header",
    `X-Pact-Api-Key: ${token}`,
    "--timeout",
    String(HTTP_TIMEOUT_MS),
    MCP_SERVER_NAME,
    url
  ]);
  const get = await run(orbBin, ["-m", vmName, "-u", vmUser, copilotBin, "mcp", "get", MCP_SERVER_NAME]);
  return {
    installMode: "copilot-orbstack-mcp-cli",
    vm: vmName,
    vmUser,
    url,
    mcpGetHasPact: get.stdout.includes(MCP_SERVER_NAME) || get.stdout.includes(url)
  };
}

async function installCopilotRemote({ baseUrl, token, context, copilotBin }) {
  if (!context?.kind || !context?.id || !context?.bin || !copilotBin) {
    throw new Error("Copilot remote install requires a discovered remote context and copilot CLI path.");
  }
  const url = `${await remoteClientBaseUrl(context, baseUrl)}/mcp`;
  await runRemoteLinuxCommand(context, [copilotBin, "mcp", "remove", MCP_SERVER_NAME], { allowFailure: true });
  await runRemoteLinuxCommand(context, [
    copilotBin,
    "mcp",
    "add",
    "--transport",
    "http",
    "--header",
    `X-Pact-Api-Key: ${token}`,
    "--timeout",
    String(HTTP_TIMEOUT_MS),
    MCP_SERVER_NAME,
    url
  ]);
  const get = await runRemoteLinuxCommand(context, [copilotBin, "mcp", "get", MCP_SERVER_NAME]);
  return {
    installMode: `copilot-${context.kind}-mcp-cli`,
    remote: remoteContextLabel(context),
    url,
    mcpGetHasPact: get.stdout.includes(MCP_SERVER_NAME) || get.stdout.includes(url)
  };
}

async function installAntigravity({ baseUrl, token, configPath }) {
  const config = await readJson(configPath, { mcpServers: {} });
  const backupPath = await backupIfExists(configPath);
  config.mcpServers = {
    ...(config.mcpServers || {}),
    [MCP_SERVER_NAME]: {
      serverUrl: `${baseUrl}/mcp`,
      headers: {
        "X-Pact-Api-Key": token
      },
      disabled: false
    }
  };
  await writeJson(configPath, config);
  return {
    installMode: "antigravity-release-mcp-config",
    configPath,
    backupPath
  };
}

async function installOpenClaw({ baseUrl, token, orbBin, vmName, vmUser, openclawBin }) {
  if (!openclawBin) {
    throw new Error("OpenClaw install requires a discovered or explicit OpenClaw-like CLI path.");
  }
  const isOrb = Boolean(vmName || vmUser);
  if (isOrb && (!vmName || !vmUser)) {
    throw new Error("OpenClaw VM install requires both OrbStack VM and user.");
  }
  const url = isOrb ? `${vmBaseUrl(baseUrl)}/mcp` : `${baseUrl}/mcp`;
  const config = {
    type: "http",
    url,
    headers: {
      "X-Pact-Api-Key": token
    },
    timeout: HTTP_TIMEOUT_MS,
    enabled: true
  };
  if (isOrb) {
    await run(orbBin, ["-m", vmName, "-u", vmUser, openclawBin, "mcp", "set", MCP_SERVER_NAME, JSON.stringify(config)]);
  } else {
    await run(openclawBin, ["mcp", "set", MCP_SERVER_NAME, JSON.stringify(config)]);
  }
  const show = isOrb
    ? await run(orbBin, ["-m", vmName, "-u", vmUser, openclawBin, "mcp", "show", MCP_SERVER_NAME])
    : await run(openclawBin, ["mcp", "show", MCP_SERVER_NAME]);
  return {
    installMode: isOrb ? "openclaw-orbstack-mcp-cli" : "openclaw-release-mcp-cli",
    vm: vmName,
    vmUser,
    url,
    mcpShowHasPact: show.stdout.includes(MCP_SERVER_NAME) || show.stdout.includes(url)
  };
}

async function installOpenClawRemote({ baseUrl, token, context, openclawBin }) {
  if (!context?.kind || !context?.id || !context?.bin || !openclawBin) {
    throw new Error("OpenClaw remote install requires a discovered remote context and OpenClaw-like CLI path.");
  }
  const url = `${await remoteClientBaseUrl(context, baseUrl)}/mcp`;
  const config = {
    type: "http",
    url,
    headers: {
      "X-Pact-Api-Key": token
    },
    timeout: HTTP_TIMEOUT_MS,
    enabled: true
  };
  await runRemoteLinuxCommand(context, [openclawBin, "mcp", "set", MCP_SERVER_NAME, JSON.stringify(config)]);
  const show = await runRemoteLinuxCommand(context, [openclawBin, "mcp", "show", MCP_SERVER_NAME]);
  return {
    installMode: `openclaw-${context.kind}-mcp-cli`,
    remote: remoteContextLabel(context),
    url,
    mcpShowHasPact: show.stdout.includes(MCP_SERVER_NAME) || show.stdout.includes(url)
  };
}

async function installHermes({ baseUrl, token, orbBin, vmName, vmUser, hermesBin }) {
  const url = `${vmBaseUrl(baseUrl)}/mcp`;
  const script = [
    "set -e",
    "IFS= read -r token",
    "export MCP_PACT_API_KEY=\"$token\"",
    "if [ -d \"$HOME/.hermes/hermes-agent\" ]; then",
    "  cd \"$HOME/.hermes/hermes-agent\"",
    "  if [ -f venv/bin/activate ]; then . venv/bin/activate; fi",
    "  python - <<'PY'",
    "import os",
    "from hermes_cli.config import save_env_value",
    "save_env_value('MCP_PACT_API_KEY', os.environ['MCP_PACT_API_KEY'])",
    "PY",
    "fi",
    "printf 'y\\n' | \"$HERMES_BIN\" mcp remove pact >/dev/null 2>&1 || true",
    "printf 'y\\ny\\n' | \"$HERMES_BIN\" mcp add pact --url \"$PACT_URL\" --auth header"
  ].join("\n");
  await runWithInput(orbBin, [
    "-m",
    vmName,
    "-u",
    vmUser,
    "env",
    `HERMES_BIN=${hermesBin}`,
    `PACT_URL=${url}`,
    "bash",
    "-lc",
    script
  ], `${token}\n`);
  const enableScript = [
    "set -e",
    "if [ -d \"$HOME/.hermes/hermes-agent\" ]; then",
    "  cd \"$HOME/.hermes/hermes-agent\"",
    "  if [ -f venv/bin/activate ]; then . venv/bin/activate; fi",
    "  python - <<'PY'",
    "from hermes_cli.config import load_config, save_config",
    "cfg = load_config()",
    "server = cfg.setdefault('mcp_servers', {}).setdefault('pact', {})",
    "server['enabled'] = True",
    "save_config(cfg)",
    "PY",
    "fi"
  ].join("\n");
  await run(orbBin, ["-m", vmName, "-u", vmUser, "bash", "-lc", enableScript]);
  await run(orbBin, ["-m", vmName, "-u", vmUser, hermesBin, "mcp", "test", MCP_SERVER_NAME]);
  const list = await run(orbBin, ["-m", vmName, "-u", vmUser, hermesBin, "mcp", "list"]);
  const listOutput = `${list.stdout}\n${list.stderr}`;
  return {
    installMode: "hermes-release-mcp-cli",
    vm: vmName,
    vmUser,
    url,
    mcpListHasPact: listOutput.includes(MCP_SERVER_NAME),
    mcpListEnabled: listOutput.includes("enabled")
  };
}

function buildDeviceHubManifest({
  baseUrl,
  targets,
  codex,
  marketplaceRoot,
  codexPluginRoot,
  discoveryPath = discoveryRegistryPath()
}) {
  const parsed = new URL(baseUrl);
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  const env = deviceDiscoveryEnv({ baseUrl, primaryPath: discoveryPath });
  const discoverCommand = `npx ${packageJson.name}@${packageJson.version} discover-local`;
  const interactiveInstallCommand = `npx ${packageJson.name}@${packageJson.version} install`;
  const scanCommand = `npx ${packageJson.name}@${packageJson.version} scan --json`;
  return {
    version: 1,
    schemaVersion: "pact.mcp.device-hub.v1",
    generatedAt: new Date().toISOString(),
    discovery: {
      strategy: "shared-device-hub",
      localEntry: {
        type: "pact-mcp-discover-local",
        command: discoverCommand,
        registryFile: discoveryPath
      },
      preferredHttpDiscoveryUrl: `${baseUrl}/.well-known/pact/mcp.json`,
      preferredApiDiscoveryUrl: `${baseUrl}/api/mcp/discovery`,
      registryFile: discoveryPath,
      localFiles: [discoveryPath],
      env,
      lookupOrder: [
        "pact-mcp discover-local",
        "PACT_MCP_URL",
        "PACT_MCP_DISCOVERY_URL",
        "PACT_MCP_DISCOVERY_FILE",
        "signed local port scan"
      ]
    },
    servers: {
      [MCP_SERVER_NAME]: {
        name: "Pact",
        transport: "streamable-http",
        httpUrl: `${baseUrl}/mcp`,
        vmHttpUrl: `${parsed.protocol}//host.orb.internal:${port}/mcp`,
        discoveryUrl: `${baseUrl}/.well-known/pact/mcp.json`,
        apiDiscoveryUrl: `${baseUrl}/api/mcp/discovery`,
        stableToolName: MCP_STABLE_TOOL_NAME,
        connector: {
          packageName: packageJson.name,
          packageVersion: packageJson.version,
          registerCommand: `npx ${packageJson.name}@${packageJson.version} register`,
          interactiveInstallCommand,
          installCommand: `npx ${packageJson.name}@${packageJson.version} install --target <client>`,
          uninstallCommand: `npx ${packageJson.name}@${packageJson.version} uninstall --target <client>`,
          discoverCommand,
          scanCommand
        },
        auth: {
          type: "auto-local-grant-or-provided-token",
          acceptedHeaders: ["Authorization: Bearer <token>", "X-Pact-Api-Key"],
          tokenEnv: DEFAULT_TOKEN_ENV
        },
        codex: codex || (codexPluginRoot
          ? {
              plugin: `${PLUGIN_NAME}@${MARKETPLACE_NAME}`,
              marketplaceRoot,
              pluginRoot: codexPluginRoot,
              tokenEnv: DEFAULT_TOKEN_ENV,
              installCommand: `npx ${packageJson.name}@${packageJson.version} install --target codex`
            }
          : null),
        targets
      }
    }
  };
}

async function publishDeviceHubManifest({ baseUrl, targets, codex, marketplaceRoot = "", codexPluginRoot = "", publishEnv = true, discoveryPath = discoveryRegistryPath() }) {
  const manifest = buildDeviceHubManifest({ baseUrl, targets, codex, marketplaceRoot, codexPluginRoot, discoveryPath });
  await writeJson(discoveryPath, manifest);
  const envPublished = publishEnv ? await publishLaunchctlEnv(manifest.discovery.env) : false;
  return {
    primaryPath: discoveryPath,
    paths: [discoveryPath],
    env: manifest.discovery.env,
    envPublished,
    manifest
  };
}

async function uninstallCodex({ tokenEnv, codexBin, marketplaceRoot }) {
  const removeMcp = await run(codexBin, ["mcp", "remove", MCP_SERVER_NAME], { allowFailure: true });
  const removePlugin = await run(codexBin, ["plugin", "remove", `${PLUGIN_NAME}@${MARKETPLACE_NAME}`], { allowFailure: true });
  await run("launchctl", ["unsetenv", tokenEnv], { allowFailure: true });
  const pluginRoot = path.join(marketplaceRoot, "plugins", PLUGIN_NAME);
  await removeDirIfExists(pluginRoot);
  const marketplaceBackupPath = await removeCodexMarketplacePlugin({ marketplaceRoot });
  return {
    uninstallMode: "codex-release-plugin-and-mcp-cli",
    removedMcp: removeMcp.ok,
    removedPlugin: removePlugin.ok,
    pluginRoot,
    marketplaceBackupPath
  };
}

async function uninstallGemini({ geminiBin, extensionRoot }) {
  const remove = await run(geminiBin, ["mcp", "remove", "--scope", "user", MCP_SERVER_NAME], { allowFailure: true });
  await removeDirIfExists(extensionRoot);
  return {
    uninstallMode: "gemini-release-mcp-cli",
    removedMcp: remove.ok,
    extensionRoot
  };
}

async function uninstallGeminiOrb({ orbBin, vmName, vmUser, geminiBin }) {
  if (!vmName || !vmUser || !geminiBin) {
    throw new Error("Gemini VM uninstall requires a discovered or explicit OrbStack VM, user, and gemini CLI path.");
  }
  const remove = await run(orbBin, ["-m", vmName, "-u", vmUser, geminiBin, "mcp", "remove", "--scope", "user", MCP_SERVER_NAME], { allowFailure: true });
  const list = await run(orbBin, ["-m", vmName, "-u", vmUser, geminiBin, "mcp", "list"], { allowFailure: true });
  const listOutput = `${list.stdout}\n${list.stderr}`;
  return {
    uninstallMode: "gemini-orbstack-mcp-cli",
    vm: vmName,
    vmUser,
    removedMcp: remove.ok,
    mcpListHasPact: listOutput.includes(MCP_SERVER_NAME)
  };
}

async function uninstallGeminiRemote({ context, geminiBin }) {
  if (!context?.kind || !context?.id || !context?.bin || !geminiBin) {
    throw new Error("Gemini remote uninstall requires a discovered remote context and gemini CLI path.");
  }
  const remove = await runRemoteLinuxCommand(context, [geminiBin, "mcp", "remove", "--scope", "user", MCP_SERVER_NAME], { allowFailure: true });
  const list = await runRemoteLinuxCommand(context, [geminiBin, "mcp", "list"], { allowFailure: true });
  const listOutput = `${list.stdout}\n${list.stderr}`;
  return {
    uninstallMode: `gemini-${context.kind}-mcp-cli`,
    remote: remoteContextLabel(context),
    removedMcp: remove.ok,
    mcpListHasPact: listOutput.includes(MCP_SERVER_NAME)
  };
}

async function removeNamedMcpEntry({ filePath, rootKey }) {
  const config = await readJson(filePath, null);
  if (!config?.[rootKey]?.[MCP_SERVER_NAME]) {
    return {
      removed: false,
      backupPath: ""
    };
  }
  const backupPath = await backupIfExists(filePath);
  delete config[rootKey][MCP_SERVER_NAME];
  await writeJson(filePath, config);
  return {
    removed: true,
    backupPath
  };
}

async function uninstallKilo({ kiloConfigPath, kiloBin }) {
  const removed = await removeNamedMcpEntry({ filePath: kiloConfigPath, rootKey: "mcp" });
  const list = await run(kiloBin, ["mcp", "list"], { allowFailure: true });
  return {
    uninstallMode: "kilo-release-global-kilo-json",
    configPath: kiloConfigPath,
    backupPath: removed.backupPath,
    removedConfigEntry: removed.removed,
    mcpListHasPact: list.stdout.includes(MCP_SERVER_NAME) || list.stderr.includes(MCP_SERVER_NAME)
  };
}

function kiloUninstallScript() {
  return [
    "set -e",
    "node <<'NODE'",
    "const fs = require('fs');",
    "const os = require('os');",
    "const path = require('path');",
    "const filePath = path.join(os.homedir(), '.config', 'kilo', 'kilo.json');",
    "let config = {};",
    "try { config = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { process.exit(0); }",
    "if (config.mcp && Object.prototype.hasOwnProperty.call(config.mcp, 'pact')) {",
    "  delete config.mcp.pact;",
    "  fs.mkdirSync(path.dirname(filePath), { recursive: true });",
    "  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\\n`);",
    "}",
    "NODE",
    "\"$KILO_BIN\" mcp list >/dev/null 2>&1 || true"
  ].join("\n");
}

async function uninstallKiloOrb({ orbBin, vmName, vmUser, kiloBin }) {
  if (!vmName || !vmUser || !kiloBin) {
    throw new Error("Kilo VM uninstall requires a discovered or explicit OrbStack VM, user, and kilo CLI path.");
  }
  const remove = await run(orbBin, [
    "-m",
    vmName,
    "-u",
    vmUser,
    "env",
    `KILO_BIN=${kiloBin}`,
    "bash",
    "-lc",
    kiloUninstallScript()
  ], { allowFailure: true });
  return {
    uninstallMode: "kilo-orbstack-global-kilo-json",
    vm: vmName,
    vmUser,
    configPath: "~/.config/kilo/kilo.json",
    removedConfigEntry: remove.ok
  };
}

async function uninstallKiloRemote({ context, kiloBin }) {
  if (!context?.kind || !context?.id || !context?.bin || !kiloBin) {
    throw new Error("Kilo remote uninstall requires a discovered remote context and kilo CLI path.");
  }
  const remove = await remoteLinuxShellWithInput(context, kiloUninstallScript(), "", {
    KILO_BIN: kiloBin
  });
  return {
    uninstallMode: `kilo-${context.kind}-global-kilo-json`,
    remote: remoteContextLabel(context),
    configPath: "~/.config/kilo/kilo.json",
    removedConfigEntry: remove.ok
  };
}

async function uninstallCopilot({ copilotBin }) {
  const remove = await run(copilotBin, ["mcp", "remove", MCP_SERVER_NAME], { allowFailure: true });
  return {
    uninstallMode: "copilot-release-mcp-cli",
    removedMcp: remove.ok
  };
}

async function uninstallCopilotOrb({ orbBin, vmName, vmUser, copilotBin }) {
  if (!vmName || !vmUser || !copilotBin) {
    throw new Error("Copilot VM uninstall requires a discovered or explicit OrbStack VM, user, and copilot CLI path.");
  }
  const remove = await run(orbBin, ["-m", vmName, "-u", vmUser, copilotBin, "mcp", "remove", MCP_SERVER_NAME], { allowFailure: true });
  const get = await run(orbBin, ["-m", vmName, "-u", vmUser, copilotBin, "mcp", "get", MCP_SERVER_NAME], { allowFailure: true });
  return {
    uninstallMode: "copilot-orbstack-mcp-cli",
    vm: vmName,
    vmUser,
    removedMcp: remove.ok,
    mcpGetHasPact: get.ok && get.stdout.includes(MCP_SERVER_NAME)
  };
}

async function uninstallCopilotRemote({ context, copilotBin }) {
  if (!context?.kind || !context?.id || !context?.bin || !copilotBin) {
    throw new Error("Copilot remote uninstall requires a discovered remote context and copilot CLI path.");
  }
  const remove = await runRemoteLinuxCommand(context, [copilotBin, "mcp", "remove", MCP_SERVER_NAME], { allowFailure: true });
  const get = await runRemoteLinuxCommand(context, [copilotBin, "mcp", "get", MCP_SERVER_NAME], { allowFailure: true });
  return {
    uninstallMode: `copilot-${context.kind}-mcp-cli`,
    remote: remoteContextLabel(context),
    removedMcp: remove.ok,
    mcpGetHasPact: get.ok && get.stdout.includes(MCP_SERVER_NAME)
  };
}

async function uninstallAntigravity({ configPath }) {
  const removed = await removeNamedMcpEntry({ filePath: configPath, rootKey: "mcpServers" });
  return {
    uninstallMode: "antigravity-release-mcp-config",
    configPath,
    backupPath: removed.backupPath,
    removedConfigEntry: removed.removed
  };
}

async function uninstallOpenClaw({ orbBin, vmName, vmUser, openclawBin }) {
  if (!openclawBin) {
    throw new Error("OpenClaw uninstall requires a discovered or explicit OpenClaw-like CLI path.");
  }
  const isOrb = Boolean(vmName || vmUser);
  if (isOrb && (!vmName || !vmUser)) {
    throw new Error("OpenClaw VM uninstall requires both OrbStack VM and user.");
  }
  const remove = isOrb
    ? await run(orbBin, ["-m", vmName, "-u", vmUser, openclawBin, "mcp", "unset", MCP_SERVER_NAME], { allowFailure: true })
    : await run(openclawBin, ["mcp", "unset", MCP_SERVER_NAME], { allowFailure: true });
  const show = isOrb
    ? await run(orbBin, ["-m", vmName, "-u", vmUser, openclawBin, "mcp", "show", MCP_SERVER_NAME], { allowFailure: true })
    : await run(openclawBin, ["mcp", "show", MCP_SERVER_NAME], { allowFailure: true });
  return {
    uninstallMode: isOrb ? "openclaw-orbstack-mcp-cli" : "openclaw-release-mcp-cli",
    vm: vmName,
    vmUser,
    removedMcp: remove.ok,
    mcpShowHasPact: show.ok && show.stdout.includes(MCP_SERVER_NAME)
  };
}

async function uninstallOpenClawRemote({ context, openclawBin }) {
  if (!context?.kind || !context?.id || !context?.bin || !openclawBin) {
    throw new Error("OpenClaw remote uninstall requires a discovered remote context and OpenClaw-like CLI path.");
  }
  const remove = await runRemoteLinuxCommand(context, [openclawBin, "mcp", "unset", MCP_SERVER_NAME], { allowFailure: true });
  const show = await runRemoteLinuxCommand(context, [openclawBin, "mcp", "show", MCP_SERVER_NAME], { allowFailure: true });
  return {
    uninstallMode: `openclaw-${context.kind}-mcp-cli`,
    remote: remoteContextLabel(context),
    removedMcp: remove.ok,
    mcpShowHasPact: show.ok && show.stdout.includes(MCP_SERVER_NAME)
  };
}

async function uninstallHermes({ orbBin, vmName, vmUser, hermesBin }) {
  const script = [
    "set -e",
    "printf 'y\\n' | \"$HERMES_BIN\" mcp remove pact >/dev/null 2>&1 || true",
    "if [ -d \"$HOME/.hermes/hermes-agent\" ]; then",
    "  cd \"$HOME/.hermes/hermes-agent\"",
    "  if [ -f venv/bin/activate ]; then . venv/bin/activate; fi",
    "  python - <<'PY'",
    "from hermes_cli.config import load_config, save_config",
    "cfg = load_config()",
    "cfg.get('mcp_servers', {}).pop('pact', None)",
    "save_config(cfg)",
    "PY",
    "fi"
  ].join("\n");
  const remove = await run(orbBin, [
    "-m",
    vmName,
    "-u",
    vmUser,
    "env",
    `HERMES_BIN=${hermesBin}`,
    "bash",
    "-lc",
    script
  ], { allowFailure: true });
  const list = await run(orbBin, ["-m", vmName, "-u", vmUser, hermesBin, "mcp", "list"], { allowFailure: true });
  const listOutput = `${list.stdout}\n${list.stderr}`;
  return {
    uninstallMode: "hermes-release-mcp-cli",
    vm: vmName,
    vmUser,
    removedMcp: remove.ok,
    mcpListHasPact: listOutput.includes(MCP_SERVER_NAME)
  };
}

async function writeDeviceDiscovery({ baseUrl, marketplaceRoot, codexPluginRoot, installed, token, publishEnv = true, discoveryPath = discoveryRegistryPath() }) {
  const manifestPath = discoveryPath;
  const existingManifest = await readJson(manifestPath, {});
  const existingServer = existingManifest?.servers?.[MCP_SERVER_NAME] || {};
  const existingTargets = existingServer.targets || {};
  const targetStatuses = Object.fromEntries(SUPPORTED_TARGETS.map((target) => [
    target,
    installed[target]
      ? installed[target].ok === false
        ? {
            installMode: installed[target].installMode || targetInstallMode(target),
            status: "failed",
            error: installed[target].error || "Install failed."
          }
        : {
          installMode: installed[target].installMode,
          status: "installed",
          tokenPrefix: redactToken(token)
        }
      : existingTargets[target] || {
          installMode: "supported",
          status: "not-installed"
        }
  ]));
  const published = await publishDeviceHubManifest({
    baseUrl,
    targets: targetStatuses,
    codex: normalizeCodexDiscovery(existingServer.codex),
    marketplaceRoot,
    codexPluginRoot,
    publishEnv,
    discoveryPath: manifestPath
  });
  return published.primaryPath;
}

async function writeDeviceUninstall({ baseUrl, uninstalled, publishEnv = true, discoveryPath = discoveryRegistryPath() }) {
  const manifestPath = discoveryPath;
  const existingManifest = await readJson(manifestPath, {});
  const existingServer = existingManifest?.servers?.[MCP_SERVER_NAME] || {};
  const existingTargets = existingServer.targets || {};
  const targets = Object.fromEntries(SUPPORTED_TARGETS.map((target) => [
    target,
    uninstalled[target]
      ? uninstalled[target].ok === false
        ? {
            installMode: uninstalled[target].uninstallMode || targetInstallMode(target),
            status: "failed",
            error: uninstalled[target].error || "Uninstall failed."
          }
        : {
          installMode: uninstalled[target].uninstallMode,
          status: "not-installed"
        }
      : existingTargets[target] || {
          installMode: "supported",
          status: "not-installed"
        }
  ]));
  const published = await publishDeviceHubManifest({
    baseUrl,
    targets,
    codex: normalizeCodexDiscovery(existingServer.codex),
    publishEnv,
    discoveryPath: manifestPath
  });
  return published.primaryPath;
}

function defaultTargetStatuses(existingTargets = {}) {
  return Object.fromEntries(SUPPORTED_TARGETS.map((target) => [
    target,
    existingTargets[target] || {
      installMode: "supported",
      status: "not-installed"
    }
  ]));
}

function profileFromDiscovery({ name, discovered }) {
  const baseUrl = discovered.baseUrl;
  return {
    name,
    baseUrl,
    mcpUrl: `${baseUrl}/mcp`,
    discoveryUrl: `${baseUrl}/api/mcp/discovery`,
    identityKeyId: discovered.handshake?.payload?.identity?.keyId || "",
    serverId: discovered.discovery?.serverId || discovered.handshake?.payload?.server?.serverId || "",
    serverVersion: discovered.discovery?.serverVersion || discovered.handshake?.payload?.server?.serverVersion || "",
    interfaceVersion: discovered.discovery?.interfaceVersion || MCP_INTERFACE_VERSION,
    stableToolName: discovered.discovery?.stableToolName || MCP_STABLE_TOOL_NAME,
    updatedAt: new Date().toISOString()
  };
}

function normalizeCodexDiscovery(codex) {
  if (!codex) {
    return null;
  }
  return {
    ...codex,
    installCommand: `npx ${packageJson.name}@${packageJson.version} install --target codex`
  };
}

async function writeServerConfigProfile({ options, name = "default", discovered, publishEnv = true }) {
  const discoveryPath = discoveryRegistryPath(options);
  const existingManifest = await readJson(discoveryPath, {});
  const existingServer = existingManifest?.servers?.[MCP_SERVER_NAME] || {};
  const published = await publishDeviceHubManifest({
    baseUrl: discovered.baseUrl,
    targets: defaultTargetStatuses(existingServer.targets || {}),
    codex: normalizeCodexDiscovery(existingServer.codex),
    publishEnv,
    discoveryPath
  });
  const manifest = await readJson(discoveryPath, {});
  manifest.serverConfig = {
    ...(manifest.serverConfig || {}),
    activeName: name,
    profiles: {
      ...(existingManifest.serverConfig?.profiles || {}),
      [name]: profileFromDiscovery({ name, discovered })
    },
    updatedAt: new Date().toISOString()
  };
  await writeJson(discoveryPath, manifest);
  return {
    ok: true,
    path: published.primaryPath,
    activeName: name,
    profile: manifest.serverConfig.profiles[name]
  };
}

async function resetServerConfig({ options, publishEnv = true }) {
  const discoveryPath = discoveryRegistryPath(options);
  const existingManifest = await readJson(discoveryPath, {});
  const resetManifest = {
    version: 1,
    schemaVersion: "pact.mcp.device-hub.v1",
    generatedAt: new Date().toISOString(),
    discovery: {
      strategy: "shared-device-hub",
      localEntry: {
        type: "pact-mcp-discover-local",
        command: `npx ${packageJson.name}@${packageJson.version} discover-local`,
        registryFile: discoveryPath
      },
      registryFile: discoveryPath,
      localFiles: [discoveryPath],
      env: {},
      lookupOrder: [
        "pact-mcp discover-local",
        "signed local port scan"
      ]
    },
    servers: {},
    serverConfig: {
      activeName: "",
      profiles: {},
      updatedAt: new Date().toISOString(),
      previousActiveName: existingManifest?.serverConfig?.activeName || ""
    }
  };
  await writeJson(discoveryPath, resetManifest);
  if (publishEnv && process.platform === "darwin") {
    await run("launchctl", ["unsetenv", PACT_MCP_URL_ENV], { allowFailure: true });
    await run("launchctl", ["unsetenv", PACT_MCP_DISCOVERY_URL_ENV], { allowFailure: true });
    await run("launchctl", ["unsetenv", PACT_MCP_DISCOVERY_FILE_ENV], { allowFailure: true });
  }
  return {
    ok: true,
    path: discoveryPath,
    reset: true
  };
}

async function serverConfigCommand(options) {
  const discoveryPath = discoveryRegistryPath(options);
  if (options.reset) {
    return resetServerConfig({ options, publishEnv: !options["no-env"] });
  }
  if (options.list) {
    const manifest = await readJson(discoveryPath, {});
    return {
      ok: true,
      path: discoveryPath,
      activeName: manifest?.serverConfig?.activeName || "",
      profiles: manifest?.serverConfig?.profiles || {},
      currentServer: manifest?.servers?.[MCP_SERVER_NAME] || null
    };
  }
  if (options.set) {
    const url = explicitBaseUrl(options);
    if (!url) {
      throw new Error("server-config --set requires --url.");
    }
    const discovered = await discoverPactHub({ ...options, url });
    if (!discovered.ok) {
      throw new Error(`Failed to verify Pact MCP server at ${url}: ${discovered.reason}`);
    }
    return writeServerConfigProfile({
      options,
      name: String(option(options, "name", "default")).trim() || "default",
      discovered,
      publishEnv: !options["no-env"]
    });
  }
  if (options.switch) {
    const name = String(options.switch || "").trim();
    const manifest = await readJson(discoveryPath, {});
    const profile = manifest?.serverConfig?.profiles?.[name];
    if (!profile?.baseUrl) {
      throw new Error(`No Pact MCP server profile named ${name}.`);
    }
    const discovered = await discoverPactHub({ ...options, url: profile.baseUrl });
    if (!discovered.ok) {
      throw new Error(`Failed to verify Pact MCP server profile ${name}: ${discovered.reason}`);
    }
    return writeServerConfigProfile({
      options,
      name,
      discovered,
      publishEnv: !options["no-env"]
    });
  }
  if (options.refresh) {
    const manifest = await readJson(discoveryPath, {});
    const activeName = manifest?.serverConfig?.activeName || "default";
    const discovered = await discoverPactHub(options);
    if (!discovered.ok) {
      throw new Error(discovered.reason);
    }
    return writeServerConfigProfile({
      options,
      name: activeName,
      discovered,
      publishEnv: !options["no-env"]
    });
  }
  return serverConfigCommand({ ...options, list: true });
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function detectHostOs() {
  if (process.platform === HOST_PLATFORM.MACOS || process.platform === HOST_PLATFORM.LINUX || process.platform === HOST_PLATFORM.WINDOWS) {
    return process.platform;
  }
  return process.platform;
}

function executableNamesForPlatform(command, platform = detectHostOs()) {
  const value = String(command || "").trim();
  if (!value) {
    return [];
  }
  if (platform !== "win32" || path.extname(value)) {
    return [value];
  }
  return [value, `${value}.exe`, `${value}.cmd`, `${value}.bat`, `${value}.ps1`];
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() || stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function nodeModulesBinProjectRoot(candidatePath, platform = detectHostOs()) {
  const normalized = String(candidatePath || "").replace(/\\/g, "/");
  const comparable = platform === "win32" ? normalized.toLowerCase() : normalized;
  const marker = "/node_modules/.bin/";
  const index = comparable.lastIndexOf(marker);
  if (index < 0) {
    return "";
  }
  return normalized.slice(0, index);
}

async function isProjectLocalPackageExecutable(candidatePath, platform = detectHostOs()) {
  const projectDir = nodeModulesBinProjectRoot(candidatePath, platform);
  if (!projectDir) {
    return false;
  }
  return fileExists(path.join(projectDir, "package.json"));
}

async function filterProjectLocalPackageExecutables(paths, platform = detectHostOs()) {
  const filtered = [];
  for (const item of paths) {
    if (!await isProjectLocalPackageExecutable(item, platform)) {
      filtered.push(item);
    }
  }
  return filtered;
}

async function collectExecutablePathsFromDirs(dirs, command, platform = detectHostOs()) {
  const paths = [];
  for (const dir of uniqueValues(dirs.map((item) => expandHomePath(item)))) {
    if (!dir || !await directoryExists(dir)) {
      continue;
    }
    for (const executableName of executableNamesForPlatform(command, platform)) {
      const candidate = path.join(dir, executableName);
      if (await fileExists(candidate)) {
        paths.push(candidate);
      }
    }
  }
  return paths;
}

async function detectPathCommandPaths(command, platform = detectHostOs()) {
  const value = String(command || "").trim();
  if (!value) {
    return [];
  }
  if (path.isAbsolute(value) || value.includes(path.sep)) {
    return await pathExists(value) ? [value] : [];
  }
  if (platform === "win32") {
    const names = executableNamesForPlatform(value, platform);
    const paths = [];
    for (const executableName of names) {
      const result = await run("where.exe", [executableName], { allowFailure: true, timeoutMs: SCAN_COMMAND_TIMEOUT_MS });
      if (result.ok) {
        paths.push(...result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
      }
    }
    return uniqueResolvedLocalPaths(await filterProjectLocalPackageExecutables(paths, platform));
  }
  const result = await run("bash", [
    "-c",
    `type -a -p ${shellQuote(value)} 2>/dev/null | awk '!seen[$0]++'`
  ], { allowFailure: true, timeoutMs: SCAN_COMMAND_TIMEOUT_MS });
  if (!result.ok) {
    return [];
  }
  const paths = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return uniqueResolvedLocalPaths(await filterProjectLocalPackageExecutables(paths, platform));
}

function packageSourceContext(platform = detectHostOs()) {
  const home = os.homedir();
  const userProfile = process.env.USERPROFILE || home;
  const appData = process.env.APPDATA || path.join(userProfile, "AppData", "Roaming");
  const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, "AppData", "Local");
  return {
    platform,
    home,
    userProfile,
    appData,
    localAppData,
    programData: process.env.ProgramData || "C:\\ProgramData"
  };
}

function sourceValues(value, context) {
  const resolved = typeof value === "function" ? value(context) : value;
  if (Array.isArray(resolved)) {
    return resolved.flatMap((item) => sourceValues(item, context));
  }
  return resolved ? [resolved] : [];
}

function outputLines(stdout) {
  return String(stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function lastOutputLine(stdout) {
  return outputLines(stdout).at(-1) || "";
}

function packageSource(id, kind, options = {}) {
  return { id, kind, ...options };
}

const POSIX_PACKAGE_DIR_SOURCES = [
  packageSource("homebrew-prefix", PACKAGE_SOURCE_KIND.COMMAND_DIR, {
    executable: "brew",
    args: ["--prefix"],
    mapOutput: (stdout) => {
      const prefix = lastOutputLine(stdout);
      return prefix ? [path.join(prefix, "bin"), path.join(prefix, "sbin")] : [];
    }
  }),
  packageSource("posix-standard-dirs", PACKAGE_SOURCE_KIND.STATIC_DIRS, {
    dirs: [
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/bin",
      "/usr/local/sbin",
      "/opt/local/bin",
      "/opt/local/sbin",
      "/opt/sw/bin"
    ]
  }),
  packageSource("npm-prefix", PACKAGE_SOURCE_KIND.COMMAND_DIR, {
    executable: "npm",
    args: ["prefix", "-g"],
    mapOutput: (stdout) => {
      const prefix = lastOutputLine(stdout);
      return prefix ? path.join(prefix, "bin") : "";
    }
  }),
  packageSource("pnpm-bin", PACKAGE_SOURCE_KIND.COMMAND_DIR, { executable: "pnpm", args: ["bin", "-g"] }),
  packageSource("yarn-global-bin", PACKAGE_SOURCE_KIND.COMMAND_DIR, { executable: "yarn", args: ["global", "bin"] }),
  packageSource("bun-global-bin", PACKAGE_SOURCE_KIND.COMMAND_DIR, { executable: "bun", args: ["pm", "bin", "-g"] }),
  packageSource("uv-tool-bin", PACKAGE_SOURCE_KIND.COMMAND_DIR, { executable: "uv", args: ["tool", "dir", "--bin"] }),
  packageSource("pipx-bin", PACKAGE_SOURCE_KIND.COMMAND_DIR, { executable: "pipx", args: ["environment", "--value", "PIPX_BIN_DIR"] }),
  packageSource("nvm-node-versions", PACKAGE_SOURCE_KIND.VERSIONED_DIRS, {
    root: ({ home }) => path.join(process.env.NVM_DIR || path.join(home, ".nvm"), "versions", "node")
  }),
  packageSource("fnm-node-versions", PACKAGE_SOURCE_KIND.VERSIONED_DIRS, {
    root: ({ home }) => path.join(process.env.FNM_DIR || path.join(home, ".local", "share", "fnm"), "node-versions"),
    toDir: (root, version) => path.join(root, version, "installation", "bin")
  }),
  packageSource("nodenv-versions", PACKAGE_SOURCE_KIND.VERSIONED_DIRS, {
    root: ({ home }) => path.join(home, ".nodenv", "versions")
  }),
  packageSource("asdf-nodejs-versions", PACKAGE_SOURCE_KIND.VERSIONED_DIRS, {
    root: ({ home }) => path.join(home, ".asdf", "installs", "nodejs")
  }),
  packageSource("mise-node-versions", PACKAGE_SOURCE_KIND.VERSIONED_DIRS, {
    root: ({ home }) => [
      path.join(home, ".local", "share", "mise", "installs", "node"),
      path.join(home, ".local", "share", "mise", "installs", "nodejs"),
      path.join(home, ".mise", "installs", "node"),
      path.join(home, ".mise", "installs", "nodejs")
    ]
  }),
  packageSource("language-runtime-bins", PACKAGE_SOURCE_KIND.STATIC_DIRS, {
    dirs: ({ home }) => [
      path.join(process.env.VOLTA_HOME || path.join(home, ".volta"), "bin"),
      path.join(home, ".asdf", "shims"),
      path.join(home, ".local", "share", "mise", "shims"),
      path.join(home, ".mise", "shims"),
      path.join(home, ".nodenv", "shims"),
      path.join(process.env.CARGO_HOME || path.join(home, ".cargo"), "bin"),
      process.env.GOBIN || "",
      path.join(process.env.GOPATH || path.join(home, "go"), "bin"),
      path.join(process.env.DENO_INSTALL || path.join(home, ".deno"), "bin"),
      path.join(home, ".pixi", "bin"),
      path.join(home, ".pkgx", "bin"),
      path.join(home, ".rye", "shims"),
      path.join(home, "miniconda3", "bin"),
      path.join(home, "anaconda3", "bin"),
      path.join(home, ".conda", "bin"),
      path.join(home, ".local", "bin")
    ]
  })
];

const PLATFORM_PACKAGE_DIR_SOURCES = {
  [HOST_PLATFORM.MACOS]: POSIX_PACKAGE_DIR_SOURCES,
  [HOST_PLATFORM.LINUX]: [
    ...POSIX_PACKAGE_DIR_SOURCES,
    packageSource("linux-system-dirs", PACKAGE_SOURCE_KIND.STATIC_DIRS, {
      dirs: [
        "/usr/bin",
        "/usr/sbin",
        "/bin",
        "/sbin",
        "/opt/bin"
      ]
    }),
    packageSource("linux-desktop-package-dirs", PACKAGE_SOURCE_KIND.STATIC_DIRS, {
      dirs: ({ home }) => [
        "/snap/bin",
        "/var/lib/flatpak/exports/bin",
        path.join(home, ".local", "share", "flatpak", "exports", "bin")
      ]
    })
  ],
  [HOST_PLATFORM.WINDOWS]: [
    packageSource("npm-prefix", PACKAGE_SOURCE_KIND.COMMAND_DIR, { executable: "npm.cmd", args: ["prefix", "-g"] }),
    packageSource("pnpm-bin", PACKAGE_SOURCE_KIND.COMMAND_DIR, { executable: "pnpm.cmd", args: ["bin", "-g"] }),
    packageSource("yarn-global-bin", PACKAGE_SOURCE_KIND.COMMAND_DIR, { executable: "yarn.cmd", args: ["global", "bin"] }),
    packageSource("bun-global-bin", PACKAGE_SOURCE_KIND.COMMAND_DIR, { executable: "bun.exe", args: ["pm", "bin", "-g"] }),
    packageSource("pipx-bin", PACKAGE_SOURCE_KIND.COMMAND_DIR, { executable: "pipx.exe", args: ["environment", "--value", "PIPX_BIN_DIR"] }),
    packageSource("uv-tool-bin", PACKAGE_SOURCE_KIND.COMMAND_DIR, { executable: "uv.exe", args: ["tool", "dir", "--bin"] }),
    packageSource("windows-package-manager-dirs", PACKAGE_SOURCE_KIND.STATIC_DIRS, {
      dirs: ({ appData, localAppData, programData, userProfile }) => [
        path.join(userProfile, "scoop", "shims"),
        path.join(programData, "scoop", "shims"),
        process.env.SCOOP ? path.join(process.env.SCOOP, "shims") : "",
        path.join(process.env.ChocolateyInstall || path.join(programData, "chocolatey"), "bin"),
        path.join(localAppData, "Microsoft", "WinGet", "Links"),
        path.join(appData, "npm"),
        path.join(localAppData, "pnpm")
      ]
    }),
    packageSource("windows-node-version-managers", PACKAGE_SOURCE_KIND.STATIC_DIRS, {
      dirs: ({ appData, localAppData, userProfile }) => [
        process.env.NVM_SYMLINK || "",
        process.env.NVM_HOME || "",
        path.join(process.env.VOLTA_HOME || path.join(localAppData, "Volta"), "bin"),
        path.join(appData, "fnm"),
        path.join(appData, "fnm", "aliases", "default"),
        path.join(userProfile, ".nodenv", "shims"),
        path.join(userProfile, ".asdf", "shims"),
        path.join(localAppData, "mise", "shims"),
        path.join(userProfile, ".local", "share", "mise", "shims"),
        path.join(userProfile, ".mise", "shims")
      ]
    }),
    packageSource("windows-language-runtime-bins", PACKAGE_SOURCE_KIND.STATIC_DIRS, {
      dirs: ({ appData, localAppData, programData, userProfile }) => [
        path.join(userProfile, ".cargo", "bin"),
        process.env.GOBIN || "",
        path.join(process.env.GOPATH || path.join(userProfile, "go"), "bin"),
        path.join(process.env.DENO_INSTALL || path.join(userProfile, ".deno"), "bin"),
        path.join(userProfile, ".local", "bin"),
        path.join(userProfile, ".rye", "shims"),
        path.join(userProfile, ".pixi", "bin"),
        path.join(localAppData, "Programs", "Python", "Scripts"),
        path.join(appData, "Python", "Scripts"),
        path.join(programData, "chocolatey", "bin"),
        "C:\\Program Files\\nodejs",
        "C:\\Program Files (x86)\\Nodist\\bin"
      ]
    }),
    packageSource("fnm-node-versions", PACKAGE_SOURCE_KIND.VERSIONED_DIRS, {
      root: ({ appData }) => path.join(process.env.FNM_DIR || path.join(appData, "fnm"), "node-versions"),
      toDir: (root, version) => path.join(root, version, "installation")
    }),
    packageSource("nodenv-versions", PACKAGE_SOURCE_KIND.VERSIONED_DIRS, {
      root: ({ userProfile }) => path.join(userProfile, ".nodenv", "versions")
    }),
    packageSource("asdf-nodejs-versions", PACKAGE_SOURCE_KIND.VERSIONED_DIRS, {
      root: ({ userProfile }) => path.join(userProfile, ".asdf", "installs", "nodejs")
    }),
    packageSource("mise-node-versions", PACKAGE_SOURCE_KIND.VERSIONED_DIRS, {
      root: ({ localAppData }) => [
        path.join(localAppData, "mise", "installs", "node"),
        path.join(localAppData, "mise", "installs", "nodejs")
      ]
    })
  ]
};

const PLATFORM_PACKAGE_EXECUTABLE_PATH_SOURCES = {
  [HOST_PLATFORM.MACOS]: [
    packageSource("homebrew-package-prefix", PACKAGE_SOURCE_KIND.COMMAND_PREFIX_DIRS, {
      executable: "brew",
      argsForCommand: (command) => ["--prefix", command],
      mapOutput: (stdout) => {
        const prefix = lastOutputLine(stdout);
        return prefix ? [path.join(prefix, "bin"), path.join(prefix, "sbin")] : [];
      }
    })
  ],
  [HOST_PLATFORM.LINUX]: [
    packageSource("homebrew-package-prefix", PACKAGE_SOURCE_KIND.COMMAND_PREFIX_DIRS, {
      executable: "brew",
      argsForCommand: (command) => ["--prefix", command],
      mapOutput: (stdout) => {
        const prefix = lastOutputLine(stdout);
        return prefix ? [path.join(prefix, "bin"), path.join(prefix, "sbin")] : [];
      }
    })
  ],
  [HOST_PLATFORM.WINDOWS]: [
    packageSource("scoop-which", PACKAGE_SOURCE_KIND.COMMAND_PATHS, {
      executables: ["scoop.cmd", "scoop"],
      argsForCommand: (command) => ["which", command]
    })
  ]
};

async function scanStaticDirSource(source, context) {
  return sourceValues(source.dirs, context);
}

async function scanCommandDirSource(source, context) {
  const result = await run(source.executable, sourceValues(source.args, context), {
    allowFailure: true,
    timeoutMs: source.timeoutMs || SCAN_COMMAND_TIMEOUT_MS
  });
  if (!result.ok || !result.stdout.trim()) {
    return [];
  }
  if (source.mapOutput) {
    return sourceValues(source.mapOutput(result.stdout, context), context);
  }
  return [lastOutputLine(result.stdout)].filter(Boolean);
}

async function scanVersionedDirSource(source, context) {
  const dirs = [];
  const toDir = source.toDir || ((root, version) => path.join(root, version, "bin"));
  for (const root of sourceValues(source.root, context)) {
    if (!await directoryExists(root)) {
      continue;
    }
    const versions = await fs.readdir(root).catch(() => []);
    dirs.push(...versions.map((version) => toDir(root, version, context)));
  }
  return dirs;
}

const PACKAGE_SOURCE_SCANNERS = {
  [PACKAGE_SOURCE_KIND.STATIC_DIRS]: scanStaticDirSource,
  [PACKAGE_SOURCE_KIND.COMMAND_DIR]: scanCommandDirSource,
  [PACKAGE_SOURCE_KIND.VERSIONED_DIRS]: scanVersionedDirSource
};

async function scanPackageSourceDirs(source, context) {
  const scanner = PACKAGE_SOURCE_SCANNERS[source.kind];
  return scanner ? scanner(source, context) : [];
}

async function packageManagerExecutableDirs(platform = detectHostOs()) {
  const context = packageSourceContext(platform);
  const sources = PLATFORM_PACKAGE_DIR_SOURCES[platform] || [];
  const dirs = [];
  for (const source of sources) {
    dirs.push(...await scanPackageSourceDirs(source, context));
  }
  return uniqueValues(dirs.filter(Boolean));
}

async function scanCommandSpecificPathSource(source, command, platform) {
  if (source.kind === PACKAGE_SOURCE_KIND.COMMAND_PREFIX_DIRS) {
    const result = await run(source.executable, sourceValues(source.argsForCommand(command), packageSourceContext(platform)), {
      allowFailure: true,
      timeoutMs: source.timeoutMs || SCAN_COMMAND_TIMEOUT_MS
    });
    if (!result.ok || !result.stdout.trim()) {
      return [];
    }
    const dirs = source.mapOutput ? sourceValues(source.mapOutput(result.stdout, packageSourceContext(platform)), packageSourceContext(platform)) : [lastOutputLine(result.stdout)];
    return collectExecutablePathsFromDirs(dirs, command, platform);
  }
  if (source.kind === PACKAGE_SOURCE_KIND.COMMAND_PATHS) {
    const paths = [];
    for (const executable of sourceValues(source.executables, packageSourceContext(platform))) {
      const result = await run(executable, sourceValues(source.argsForCommand(command), packageSourceContext(platform)), {
        allowFailure: true,
        timeoutMs: source.timeoutMs || SCAN_COMMAND_TIMEOUT_MS
      });
      if (result.ok) {
        paths.push(...outputLines(result.stdout));
      }
    }
    return paths;
  }
  return [];
}

async function packageManagerExecutablePaths(command, platform = detectHostOs()) {
  const paths = await collectExecutablePathsFromDirs(await packageManagerExecutableDirs(platform), command, platform);
  for (const source of PLATFORM_PACKAGE_EXECUTABLE_PATH_SOURCES[platform] || []) {
    paths.push(...await scanCommandSpecificPathSource(source, command, platform));
  }
  return uniqueResolvedLocalPaths(await filterProjectLocalPackageExecutables(paths, platform));
}

function appNameLooksAgentRelated(name, command = "") {
  const lower = String(name || "").toLowerCase();
  const normalized = lower.replace(/[^a-z0-9]+/g, " ").trim();
  const commandLower = String(command || "").toLowerCase();
  if (commandLower && normalized.includes(commandLower)) {
    return true;
  }
  if (APP_DISCOVERY_NAME_HINTS.some((hint) => normalized.includes(hint))) {
    return true;
  }
  return APP_DISCOVERY_WORD_HINTS.some((hint) => {
    const pattern = new RegExp(`(^|\\s|-)${hint}(\\s|-|$)`);
    return pattern.test(normalized) || normalized.endsWith(hint);
  });
}

async function macAppExecutablePaths(command) {
  if (process.platform !== "darwin") {
    return [];
  }
  const roots = ["/Applications", path.join(os.homedir(), "Applications")];
  const apps = [];
  for (const root of roots) {
    if (!await directoryExists(root)) {
      continue;
    }
    const found = await run("find", [root, "-maxdepth", "3", "-name", "*.app", "-type", "d"], { allowFailure: true, timeoutMs: 5000 });
    if (found.ok) {
      apps.push(...found.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    }
  }
  const paths = [];
  for (const appPath of apps) {
    const appName = path.basename(appPath, ".app");
    if (!appNameLooksAgentRelated(appName, command)) {
      continue;
    }
    // Do not probe Contents/MacOS/CFBundleExecutable: that is usually the GUI app
    // and may trigger login/keychain prompts. Only pick embedded CLI helper paths.
    paths.push(...await collectExecutablePathsFromDirs([
      path.join(appPath, "Contents", "Resources"),
      path.join(appPath, "Contents", "Resources", "bin"),
      path.join(appPath, "Contents", "Resources", "app", "bin"),
      path.join(appPath, "Contents", "Helpers")
    ], command, "darwin"));
  }
  return paths;
}

function parseDesktopExec(value) {
  const text = String(value || "").replace(/%[fFuUdDnNickvm]/g, "").trim();
  const match = text.match(/^"([^"]+)"/) || text.match(/^'([^']+)'/) || text.match(/^(\S+)/);
  return match?.[1] || "";
}

async function linuxDesktopExecutablePaths(command) {
  if (process.platform !== "linux") {
    return [];
  }
  const roots = [
    "/usr/share/applications",
    "/usr/local/share/applications",
    path.join(os.homedir(), ".local", "share", "applications"),
    "/var/lib/flatpak/exports/share/applications",
    path.join(os.homedir(), ".local", "share", "flatpak", "exports", "share", "applications")
  ];
  const paths = [];
  for (const root of roots) {
    if (!await directoryExists(root)) {
      continue;
    }
    const found = await run("find", [root, "-maxdepth", "2", "-name", "*.desktop", "-type", "f"], { allowFailure: true, timeoutMs: 5000 });
    for (const filePath of found.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
      const content = await fs.readFile(filePath, "utf8").catch(() => "");
      const nameLine = content.split(/\r?\n/).find((line) => line.startsWith("Name="));
      const execLine = content.split(/\r?\n/).find((line) => line.startsWith("Exec="));
      const executable = parseDesktopExec(execLine?.slice("Exec=".length));
      if (!executable) {
        continue;
      }
      const basename = path.basename(executable).toLowerCase();
      const discoveryName = `${path.basename(filePath, ".desktop")} ${nameLine?.slice("Name=".length) || ""} ${basename}`;
      if (!basename.includes(String(command).toLowerCase()) && !appNameLooksAgentRelated(discoveryName, command)) {
        continue;
      }
      if (path.isAbsolute(executable)) {
        paths.push(executable);
      } else {
        paths.push(...await detectPathCommandPaths(executable, "linux"));
      }
    }
  }
  return paths;
}

async function windowsAppExecutablePaths(command) {
  if (process.platform !== "win32") {
    return [];
  }
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$needle = ${JSON.stringify(String(command || "").toLowerCase())}`,
    "$paths = @()",
    "$appPathRoots = @('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths')",
    "foreach ($root in $appPathRoots) {",
    "  Get-ChildItem $root | Where-Object { $_.PSChildName.ToLower().Contains($needle) } | ForEach-Object {",
    "    $value = (Get-Item $_.PSPath).GetValue('')",
    "    if ($value) { $paths += $value }",
    "  }",
    "}",
    "$shell = New-Object -ComObject WScript.Shell",
    "$shortcutRoots = @([Environment]::GetFolderPath('StartMenu'), [Environment]::GetFolderPath('CommonStartMenu'))",
    "foreach ($root in $shortcutRoots) {",
    "  Get-ChildItem $root -Filter *.lnk -Recurse | Where-Object { $_.BaseName.ToLower().Contains($needle) } | ForEach-Object {",
    "    $target = $shell.CreateShortcut($_.FullName).TargetPath",
    "    if ($target) { $paths += $target }",
    "  }",
    "}",
    "$paths | Select-Object -Unique"
  ].join("\n");
  const result = await run("powershell.exe", ["-NoProfile", "-Command", script], { allowFailure: true, timeoutMs: 5000 });
  if (!result.ok) {
    return [];
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function appDesktopExecutablePaths(command, platform = detectHostOs()) {
  if (platform === "darwin") {
    return macAppExecutablePaths(command);
  }
  if (platform === "linux") {
    return linuxDesktopExecutablePaths(command);
  }
  if (platform === "win32") {
    return windowsAppExecutablePaths(command);
  }
  return [];
}

async function detectLocalCommandPaths(command) {
  const value = String(command || "").trim();
  if (!value) {
    return [];
  }
  const platform = detectHostOs();
  const paths = [
    ...await detectPathCommandPaths(value, platform),
    ...await packageManagerExecutablePaths(value, platform),
    ...await appDesktopExecutablePaths(value, platform)
  ];
  return uniqueResolvedLocalPaths(paths);
}

async function uniqueResolvedLocalPaths(paths) {
  const seen = new Set();
  const deduped = [];
  for (const item of paths) {
    const key = await fs.realpath(item).catch(() => item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

async function directoryExists(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function detectOrbVms(orbBin) {
  const result = await run(orbBin, ["list"], { allowFailure: true, timeoutMs: SCAN_COMMAND_TIMEOUT_MS });
  if (!result.ok) {
    return [];
  }
  const names = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^NAME\s+/i.test(trimmed)) {
      continue;
    }
    const [name] = trimmed.split(/\s+/);
    if (name && !name.startsWith("-")) {
      names.push(name);
    }
  }
  return uniqueValues(names);
}

function linuxExecutableScanScript(command) {
  return [
    "set +e",
    `command_name=${shellQuote(command)}`,
    "candidate_rows() {",
    "  type -a -p \"$command_name\" 2>/dev/null | while IFS= read -r item; do printf '%s\\n' \"$item\"; done",
    "  for manager in brew npm pnpm yarn bun; do",
    "    if command -v \"$manager\" >/dev/null 2>&1; then",
    "      case \"$manager\" in",
    "        brew) dir=$($manager --prefix 2>/dev/null); [ -n \"$dir\" ] && printf '%s\\n' \"$dir/bin/$command_name\" \"$dir/sbin/$command_name\"; package_dir=$($manager --prefix \"$command_name\" 2>/dev/null); [ -n \"$package_dir\" ] && printf '%s\\n' \"$package_dir/bin/$command_name\" \"$package_dir/sbin/$command_name\" ;;",
    "        npm) dir=$($manager prefix -g 2>/dev/null); [ -n \"$dir\" ] && printf '%s\\n' \"$dir/bin/$command_name\" ;;",
    "        pnpm) dir=$($manager bin -g 2>/dev/null); [ -n \"$dir\" ] && printf '%s\\n' \"$dir/$command_name\" ;;",
    "        yarn) dir=$($manager global bin 2>/dev/null | tail -n 1); [ -n \"$dir\" ] && printf '%s\\n' \"$dir/$command_name\" ;;",
    "        bun) dir=$($manager pm bin -g 2>/dev/null | tail -n 1); [ -n \"$dir\" ] && printf '%s\\n' \"$dir/$command_name\" ;;",
    "      esac",
    "    fi",
    "  done",
    "  printf '%s\\n' \"/usr/local/bin/$command_name\" \"/usr/local/sbin/$command_name\" \"/usr/bin/$command_name\" \"/usr/sbin/$command_name\" \"/bin/$command_name\" \"/sbin/$command_name\" \"/opt/bin/$command_name\"",
    "  printf '%s\\n' \"/opt/homebrew/bin/$command_name\" \"/opt/homebrew/sbin/$command_name\" \"/opt/local/bin/$command_name\" \"/opt/local/sbin/$command_name\" \"/opt/sw/bin/$command_name\"",
    "  nvm_dir=${NVM_DIR:-$HOME/.nvm}",
    "  [ -d \"$nvm_dir/versions/node\" ] && find \"$nvm_dir/versions/node\" -maxdepth 3 -type f -path \"*/bin/$command_name\" 2>/dev/null",
    "  fnm_dir=${FNM_DIR:-$HOME/.local/share/fnm}",
    "  [ -d \"$fnm_dir/node-versions\" ] && find \"$fnm_dir/node-versions\" -maxdepth 4 -type f -path \"*/installation/bin/$command_name\" 2>/dev/null",
    "  [ -d \"$HOME/.nodenv/versions\" ] && find \"$HOME/.nodenv/versions\" -maxdepth 3 -type f -path \"*/bin/$command_name\" 2>/dev/null",
    "  [ -d \"$HOME/.asdf/installs/nodejs\" ] && find \"$HOME/.asdf/installs/nodejs\" -maxdepth 3 -type f -path \"*/bin/$command_name\" 2>/dev/null",
    "  [ -d \"$HOME/.local/share/mise/installs/node\" ] && find \"$HOME/.local/share/mise/installs/node\" -maxdepth 3 -type f -path \"*/bin/$command_name\" 2>/dev/null",
    "  [ -d \"$HOME/.local/share/mise/installs/nodejs\" ] && find \"$HOME/.local/share/mise/installs/nodejs\" -maxdepth 3 -type f -path \"*/bin/$command_name\" 2>/dev/null",
    "  [ -d \"$HOME/.mise/installs/node\" ] && find \"$HOME/.mise/installs/node\" -maxdepth 3 -type f -path \"*/bin/$command_name\" 2>/dev/null",
    "  [ -d \"$HOME/.mise/installs/nodejs\" ] && find \"$HOME/.mise/installs/nodejs\" -maxdepth 3 -type f -path \"*/bin/$command_name\" 2>/dev/null",
    "  printf '%s\\n' \"${VOLTA_HOME:-$HOME/.volta}/bin/$command_name\" \"$HOME/.asdf/shims/$command_name\" \"$HOME/.local/share/mise/shims/$command_name\" \"$HOME/.mise/shims/$command_name\" \"$HOME/.nodenv/shims/$command_name\"",
    "  printf '%s\\n' \"${CARGO_HOME:-$HOME/.cargo}/bin/$command_name\" \"${GOPATH:-$HOME/go}/bin/$command_name\" \"${DENO_INSTALL:-$HOME/.deno}/bin/$command_name\"",
    "  [ -n \"${GOBIN:-}\" ] && printf '%s\\n' \"$GOBIN/$command_name\"",
    "  printf '%s\\n' \"$HOME/.local/bin/$command_name\" \"$HOME/.rye/shims/$command_name\" \"$HOME/.pixi/bin/$command_name\" \"$HOME/.pkgx/bin/$command_name\" \"$HOME/miniconda3/bin/$command_name\" \"$HOME/anaconda3/bin/$command_name\" \"$HOME/.conda/bin/$command_name\" \"/snap/bin/$command_name\"",
    "  printf '%s\\n' \"/var/lib/flatpak/exports/bin/$command_name\" \"$HOME/.local/share/flatpak/exports/bin/$command_name\"",
    "  if command -v pipx >/dev/null 2>&1; then",
    "    pipx_dir=$(pipx environment --value PIPX_BIN_DIR 2>/dev/null)",
    "    [ -n \"$pipx_dir\" ] && printf '%s\\n' \"$pipx_dir/$command_name\"",
    "  fi",
    "  if command -v uv >/dev/null 2>&1; then",
    "    uv_dir=$(uv tool dir --bin 2>/dev/null)",
    "    [ -n \"$uv_dir\" ] && printf '%s\\n' \"$uv_dir/$command_name\"",
    "  fi",
    "  for desktop_root in /usr/share/applications /usr/local/share/applications \"$HOME/.local/share/applications\" /var/lib/flatpak/exports/share/applications \"$HOME/.local/share/flatpak/exports/share/applications\"; do",
    "    [ -d \"$desktop_root\" ] || continue",
    "    find \"$desktop_root\" -maxdepth 2 -name '*.desktop' -type f 2>/dev/null | while IFS= read -r desktop_file; do",
    "      exec_line=$(grep -m 1 '^Exec=' \"$desktop_file\" 2>/dev/null | sed 's/^Exec=//' | sed 's/%[fFuUdDnNickvm]//g')",
    "      [ -n \"$exec_line\" ] || continue",
    "      executable=$(printf '%s\\n' \"$exec_line\" | awk '{print $1}' | sed 's/^\"//;s/\"$//')",
    "      base=$(basename \"$executable\")",
    "      case \"$base\" in *\"$command_name\"*) if printf '%s' \"$executable\" | grep -q '^/'; then printf '%s\\n' \"$executable\"; else command -v \"$executable\" 2>/dev/null; fi ;; esac",
    "    done",
    "  done",
    "}",
    "candidate_rows | while IFS= read -r candidate; do",
    "  [ -n \"$candidate\" ] || continue",
    "  [ -f \"$candidate\" ] || [ -L \"$candidate\" ] || continue",
    "  case \"$candidate\" in",
    "    */node_modules/.bin/*) project_dir=${candidate%%/node_modules/.bin/*}; [ -f \"$project_dir/package.json\" ] && continue ;;",
    "  esac",
    "  resolved=$(readlink -f \"$candidate\" 2>/dev/null || printf '%s' \"$candidate\")",
    "  printf '%s\\t%s\\n' \"$candidate\" \"$resolved\"",
    "done | awk -F '\\t' '!seen[$2]++ { print $1 }'"
  ].join("\n");
}

async function detectOrbCommand({ orbBin, vmName, vmUser, command }) {
  const paths = await detectOrbCommandPaths({ orbBin, vmName, vmUser, command });
  return {
    ok: paths.length > 0,
    path: paths[0] || ""
  };
}

async function detectOrbCommandPaths({ orbBin, vmName, vmUser, command }) {
  const value = String(command || "").trim();
  if (!value || !vmName || !vmUser) {
    return [];
  }
  const probe = path.isAbsolute(value) || value.includes("/")
    ? `command -v ${shellQuote(value)}`
    : linuxExecutableScanScript(value);
  const result = await run(orbBin, [
    "-m",
    vmName,
    "-u",
    vmUser,
    "bash",
    "-lc",
    probe
  ], { allowFailure: true, timeoutMs: REMOTE_SCAN_COMMAND_TIMEOUT_MS });
  if (!result.ok) {
    return [];
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function detectDockerContainers(runtimeBin, kind) {
  const result = await run(runtimeBin, ["ps", "--format", "{{.ID}}\t{{.Names}}"], { allowFailure: true, timeoutMs: SCAN_COMMAND_TIMEOUT_MS });
  if (!result.ok) {
    return [];
  }
  return result.stdout.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, name] = line.split(/\t/);
      return { kind, id, name: name || id, bin: runtimeBin };
    })
    .filter((item) => item.id);
}

async function detectWslDistros(wslBin) {
  if (detectHostOs() !== "win32") {
    return [];
  }
  const result = await run(wslBin, ["-l", "-q"], { allowFailure: true, timeoutMs: SCAN_COMMAND_TIMEOUT_MS });
  if (!result.ok) {
    return [];
  }
  return result.stdout.split(/\r?\n/)
    .map((line) => line.replace(/\0/g, "").trim())
    .filter(Boolean)
    .map((name) => ({ kind: "wsl", id: name, name, bin: wslBin }));
}

async function remoteLinuxShell(context, script, options = {}) {
  if (context.kind === "docker" || context.kind === "podman") {
    return run(context.bin, ["exec", context.id, "sh", "-lc", script], { allowFailure: true, timeoutMs: options.timeoutMs });
  }
  if (context.kind === "wsl") {
    return run(context.bin, ["-d", context.id, "--", "bash", "-lc", script], { allowFailure: true, timeoutMs: options.timeoutMs });
  }
  return { ok: false, stdout: "", stderr: `Unsupported remote context: ${context.kind}` };
}

async function remoteLinuxShellWithInput(context, script, input = "", env = {}) {
  const envArgs = Object.entries(env).map(([name, value]) => `${name}=${value}`);
  if (context.kind === "docker" || context.kind === "podman") {
    const runtimeEnvArgs = Object.entries(env).flatMap(([name, value]) => ["-e", `${name}=${value}`]);
    return runWithInput(context.bin, ["exec", "-i", ...runtimeEnvArgs, context.id, "sh", "-lc", script], input, { allowFailure: true });
  }
  if (context.kind === "wsl") {
    return runWithInput(context.bin, ["-d", context.id, "--", "env", ...envArgs, "bash", "-lc", script], input, { allowFailure: true });
  }
  return { ok: false, stdout: "", stderr: `Unsupported remote context: ${context.kind}` };
}

async function runRemoteLinuxCommand(context, args = [], options = {}) {
  if (context.kind === "docker" || context.kind === "podman") {
    return run(context.bin, ["exec", context.id, ...args], { allowFailure: options.allowFailure, timeoutMs: options.timeoutMs });
  }
  if (context.kind === "wsl") {
    return run(context.bin, ["-d", context.id, "--", ...args], { allowFailure: options.allowFailure, timeoutMs: options.timeoutMs });
  }
  const message = `Unsupported remote context: ${context.kind}`;
  if (options.allowFailure) {
    return { ok: false, stdout: "", stderr: message };
  }
  throw new Error(message);
}

async function detectRemoteLinuxCommandPaths(context, command) {
  const value = String(command || "").trim();
  if (!value) {
    return [];
  }
  const probe = path.isAbsolute(value) || value.includes("/")
    ? `command -v ${shellQuote(value)}`
    : linuxExecutableScanScript(value);
  const result = await remoteLinuxShell(context, probe, { timeoutMs: REMOTE_SCAN_COMMAND_TIMEOUT_MS });
  if (!result.ok) {
    return [];
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function remoteLinuxCommandSupportsMcp(context, command) {
  const result = await runRemoteLinuxCommand(context, [command, "mcp", "--help"], { allowFailure: true, timeoutMs: SCAN_COMMAND_TIMEOUT_MS });
  return mcpProbeSupported(result);
}

async function remoteClientBaseUrl(context, baseUrl) {
  if (context.kind === "orb") {
    return vmBaseUrl(baseUrl);
  }
  const parsed = new URL(baseUrl);
  if (!isLoopbackHost(parsed.hostname)) {
    return baseUrl;
  }
  if (context.kind === "podman") {
    return baseUrlWithHost(baseUrl, "host.containers.internal");
  }
  if (context.kind === "docker") {
    if (detectHostOs() === "linux") {
      const gateway = await run(context.bin, [
        "inspect",
        "-f",
        "{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}",
        context.id
      ], { allowFailure: true });
      const host = gateway.stdout.trim().split(/\s+/).find(Boolean);
      if (host) {
        return baseUrlWithHost(baseUrl, host);
      }
    }
    return baseUrlWithHost(baseUrl, "host.docker.internal");
  }
  if (context.kind === "wsl") {
    const nameserver = await remoteLinuxShell(context, "awk '/^nameserver / { print $2; exit }' /etc/resolv.conf 2>/dev/null", { timeoutMs: SCAN_COMMAND_TIMEOUT_MS });
    const host = nameserver.stdout.trim().split(/\s+/).find(Boolean);
    return host ? baseUrlWithHost(baseUrl, host) : baseUrl;
  }
  return baseUrl;
}

function candidateLocation(candidate) {
  return String(candidate?.optionOverrides?.["execution-location"] || "local");
}

function isGenericRemoteLocation(location) {
  return ["docker", "podman", "wsl"].includes(location);
}

function candidateIdentity(candidate) {
  const overrides = candidate.optionOverrides || {};
  const location = candidateLocation(candidate);
  if (candidate?.target === "openclaw") {
    if (location === "orb") {
      const vmName = String(overrides["orb-vm"] || overrides["openclaw-vm"] || "").trim();
      const vmUser = String(overrides["orb-user"] || overrides["openclaw-user"] || "").trim();
      return vmName && vmUser ? `openclaw:orb:${vmName}:${vmUser}` : "";
    }
    if (isGenericRemoteLocation(location)) {
      const remoteId = String(overrides["remote-id"] || "").trim();
      return remoteId ? `openclaw:${location}:${remoteId}` : "";
    }
    const openclawBin = String(overrides["openclaw-bin"] || "").trim();
    return openclawBin ? `openclaw:local:${openclawBin}` : "";
  }
  if (location === "orb" && ["gemini-cli", "copilot", "kilo-code"].includes(candidate?.target)) {
    const vmName = String(overrides["orb-vm"] || "").trim();
    const vmUser = String(overrides["orb-user"] || "").trim();
    return vmName && vmUser ? `${candidate.target}:orb:${vmName}:${vmUser}` : "";
  }
  if (isGenericRemoteLocation(location) && ["gemini-cli", "copilot", "kilo-code"].includes(candidate?.target)) {
    const remoteId = String(overrides["remote-id"] || "").trim();
    return remoteId ? `${candidate.target}:${location}:${remoteId}` : "";
  }
  if (location === "local" && ["codex", "gemini-cli", "copilot", "kilo-code"].includes(candidate?.target)) {
    const descriptor = AGENT_CLI_TARGETS.find((item) => item.target === candidate.target);
    const binPath = descriptor ? String(overrides[descriptor.binOption] || "").trim() : "";
    return binPath ? `${candidate.target}:local:${binPath}` : "";
  }
  return "";
}

function mergeInstallCandidate(candidates, candidate) {
  const identity = candidateIdentity(candidate);
  if (!identity) {
    candidates.push(candidate);
    return;
  }
  const existingIndex = candidates.findIndex((item) => candidateIdentity(item) === identity);
  if (existingIndex < 0) {
    candidates.push(candidate);
    return;
  }
  const existing = candidates[existingIndex];
  if (existing.status !== "detected" && candidate.status === "detected") {
    candidates[existingIndex] = {
      ...existing,
      status: "detected",
      detail: candidate.detail,
      optionOverrides: {
        ...(existing.optionOverrides || {}),
        ...(candidate.optionOverrides || {})
      }
    };
    return;
  }
  if (existing.status === "detected" && candidate.status === "detected") {
    return;
  }
  if (existing.status === candidate.status && existing.detail !== candidate.detail) {
    candidates[existingIndex] = {
      ...existing,
      detail: existing.status === "detected" ? existing.detail : candidate.detail,
      optionOverrides: {
        ...(existing.optionOverrides || {}),
        ...(candidate.optionOverrides || {})
      }
    };
  }
}

function mcpProbeSupported(result) {
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.toLowerCase();
  const normalized = output.replace(/\s+/g, " ").trim();
  const hasMcpSignal = /\bmcp\b/.test(normalized) || normalized.includes("model context protocol");
  if (!hasMcpSignal) {
    return false;
  }
  const negativePatterns = [
    /\bunknown (?:command|subcommand)\b/,
    /\bunrecognized (?:command|subcommand)\b/,
    /\bno such (?:command|subcommand)\b/,
    /\bcommand not found\b/,
    /\bnot (?:a )?recognized (?:as )?(?:a )?command\b/,
    /\binvalid choice\b.*\bmcp\b/,
    /\bno help topic\b.*\bmcp\b/,
    /\bmcp\b.*\b(?:does not exist|not found|not supported|unsupported)\b/,
    /\b(?:does not support|unsupported)\b.*\bmcp\b/
  ];
  if (negativePatterns.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  const positivePatterns = [
    /\busage:\s*[^\r\n]*\bmcp\b/,
    /\bcommands?:\b/,
    /\bmcp\b.{0,120}\b(?:add|remove|list|get|enable|disable|login|logout|auth|server|configuration|protocol)\b/,
    /\bmanage\b.{0,80}\bmcp\b/,
    /\bmodel context protocol\b/
  ];
  return positivePatterns.some((pattern) => pattern.test(normalized)) || Boolean(result.ok);
}

async function commandSupportsMcp(command, argsPrefix = []) {
  const result = await run(command, [...argsPrefix, "mcp", "--help"], { allowFailure: true, timeoutMs: SCAN_COMMAND_TIMEOUT_MS });
  return mcpProbeSupported(result);
}

async function orbCommandSupportsMcp({ orbBin, vmName, vmUser, command }) {
  const result = await run(orbBin, [
    "-m",
    vmName,
    "-u",
    vmUser,
    command,
    "mcp",
    "--help"
  ], { allowFailure: true, timeoutMs: SCAN_COMMAND_TIMEOUT_MS });
  return mcpProbeSupported(result);
}

async function detectLocalClawCompatibleTargets() {
  const candidates = [];
  for (const commandName of CLAW_COMPATIBLE_COMMANDS) {
    const paths = await detectLocalCommandPaths(commandName);
    for (const detectedPath of paths) {
      if (!await commandSupportsMcp(detectedPath)) {
        continue;
      }
      candidates.push({
        id: `claw-compatible:local:${detectedPath}`,
        target: "openclaw",
        label: `${commandName} (local)`,
        status: "detected",
        detail: `claw-compatible MCP CLI at ${detectedPath}`,
        optionOverrides: {
          "execution-location": "local",
          "openclaw-bin": detectedPath
        }
      });
    }
  }
  return candidates;
}

async function detectLocalAgentCliTargets() {
  const candidates = [];
  for (const descriptor of AGENT_CLI_TARGETS) {
    for (const commandName of descriptor.commandNames) {
      const paths = await detectLocalCommandPaths(commandName);
      for (const detectedPath of paths) {
        if (!await commandSupportsMcp(detectedPath)) {
          continue;
        }
        candidates.push({
          id: `${descriptor.target}:local:${detectedPath}`,
          target: descriptor.target,
          label: descriptor.label,
          status: "detected",
          detail: detectedPath,
          optionOverrides: {
            "execution-location": "local",
            [descriptor.binOption]: detectedPath
          }
        });
      }
    }
  }
  return candidates;
}

function orbUserCandidates(settings, vmName) {
  return uniqueValues([
    settings.orbUser,
    settings.openclawVmUser,
    settings.hermesVmUser,
    vmName
  ]);
}

async function detectOrbClawCompatibleTargets(settings, vmNames = null) {
  const names = vmNames || await detectOrbVms(settings.orbBin);
  const candidates = [];
  for (const vmName of names) {
    const userCandidates = orbUserCandidates(settings, vmName);
    for (const vmUser of userCandidates) {
      for (const commandName of CLAW_COMPATIBLE_COMMANDS) {
        const paths = await detectOrbCommandPaths({
          orbBin: settings.orbBin,
          vmName,
          vmUser,
          command: commandName
        });
        for (const detectedPath of paths) {
          if (!await orbCommandSupportsMcp({ orbBin: settings.orbBin, vmName, vmUser, command: detectedPath })) {
            continue;
          }
          candidates.push({
            id: `claw-compatible:orb:${vmName}:${vmUser}:${detectedPath}`,
            target: "openclaw",
            label: `${targetLabel("openclaw")} (${vmName})`,
            status: "detected",
            detail: `claw-compatible MCP CLI at ${detectedPath}, user ${vmUser}`,
            optionOverrides: {
              "execution-location": "orb",
              "orb-vm": vmName,
              "orb-user": vmUser,
              "openclaw-vm": vmName,
              "openclaw-user": vmUser,
              "openclaw-bin": detectedPath
            }
          });
        }
      }
    }
  }
  return candidates;
}

async function detectOrbAgentCliTargets(settings, vmNames = null) {
  const names = vmNames || await detectOrbVms(settings.orbBin);
  const candidates = [];
  for (const vmName of names) {
    const userCandidates = orbUserCandidates(settings, vmName);
    for (const vmUser of userCandidates) {
      for (const descriptor of ORB_AGENT_CLI_TARGETS) {
        for (const commandName of descriptor.commandNames) {
          const paths = await detectOrbCommandPaths({
            orbBin: settings.orbBin,
            vmName,
            vmUser,
            command: commandName
          });
          for (const detectedPath of paths) {
            if (!await orbCommandSupportsMcp({ orbBin: settings.orbBin, vmName, vmUser, command: detectedPath })) {
              continue;
            }
            candidates.push({
              id: `${descriptor.target}:orb:${vmName}:${vmUser}:${detectedPath}`,
              target: descriptor.target,
              label: `${descriptor.label} (${vmName})`,
              status: "detected",
              detail: `${descriptor.label} CLI at ${detectedPath}, user ${vmUser}`,
              optionOverrides: {
                "execution-location": "orb",
                "orb-vm": vmName,
                "orb-user": vmUser,
                [descriptor.binOption]: detectedPath
              }
            });
          }
        }
      }
    }
  }
  return candidates;
}

async function detectContainerVmContexts(settings) {
  const contexts = [
    ...await detectDockerContainers(settings.dockerBin, "docker"),
    ...await detectDockerContainers(settings.podmanBin, "podman"),
    ...await detectWslDistros(settings.wslBin)
  ];
  const seen = new Set();
  return contexts.filter((context) => {
    const key = `${context.kind}:${context.id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function remoteContextLabel(context) {
  return `${context.kind}:${context.name || context.id}`;
}

function remoteContextOptionOverrides(context, extra = {}) {
  return {
    "execution-location": context.kind,
    "remote-kind": context.kind,
    "remote-id": context.id,
    "remote-name": context.name || context.id,
    "remote-bin": context.bin,
    ...extra
  };
}

async function detectRemoteLinuxClawCompatibleTargets(contexts) {
  const candidates = [];
  for (const context of contexts) {
    for (const commandName of CLAW_COMPATIBLE_COMMANDS) {
      const paths = await detectRemoteLinuxCommandPaths(context, commandName);
      for (const detectedPath of paths) {
        if (!await remoteLinuxCommandSupportsMcp(context, detectedPath)) {
          continue;
        }
        candidates.push({
          id: `claw-compatible:${context.kind}:${context.id}:${detectedPath}`,
          target: "openclaw",
          label: `${targetLabel("openclaw")} (${remoteContextLabel(context)})`,
          status: "detected",
          detail: `claw-compatible MCP CLI at ${detectedPath}`,
          optionOverrides: remoteContextOptionOverrides(context, {
            "openclaw-bin": detectedPath
          })
        });
      }
    }
  }
  return candidates;
}

async function detectRemoteLinuxAgentCliTargets(contexts) {
  const candidates = [];
  for (const context of contexts) {
    for (const descriptor of ORB_AGENT_CLI_TARGETS) {
      for (const commandName of descriptor.commandNames) {
        const paths = await detectRemoteLinuxCommandPaths(context, commandName);
        for (const detectedPath of paths) {
          if (!await remoteLinuxCommandSupportsMcp(context, detectedPath)) {
            continue;
          }
          candidates.push({
            id: `${descriptor.target}:${context.kind}:${context.id}:${detectedPath}`,
            target: descriptor.target,
            label: `${descriptor.label} (${remoteContextLabel(context)})`,
            status: "detected",
            detail: `${descriptor.label} CLI at ${detectedPath}`,
            optionOverrides: remoteContextOptionOverrides(context, {
              [descriptor.binOption]: detectedPath
            })
          });
        }
      }
    }
  }
  return candidates;
}

async function scanInstallTargets(options = {}) {
  const settings = installerOptions(options);
  const candidates = [];
  if (!options["no-scan"]) {
    const vmNames = await detectOrbVms(settings.orbBin);
    const remoteContexts = await detectContainerVmContexts(settings);
    const discoveredCandidates = [
      ...await detectLocalAgentCliTargets(settings),
      ...await detectLocalClawCompatibleTargets(settings),
      ...await detectOrbClawCompatibleTargets(settings, vmNames),
      ...await detectOrbAgentCliTargets(settings, vmNames),
      ...await detectRemoteLinuxClawCompatibleTargets(remoteContexts),
      ...await detectRemoteLinuxAgentCliTargets(remoteContexts)
    ];
    for (const candidate of discoveredCandidates) {
      mergeInstallCandidate(candidates, candidate);
    }
  } else {
    for (const descriptor of AGENT_CLI_TARGETS) {
      candidates.push({
        id: descriptor.target,
        target: descriptor.target,
        label: descriptor.label,
        status: "not-detected",
        detail: `${descriptor.commandNames.join("/")} executable scan disabled`
      });
    }
  }
  const antigravityConfigDir = path.dirname(settings.antigravityConfigPath);
  const antigravityDetected = await pathExists(settings.antigravityConfigPath) || await directoryExists(antigravityConfigDir);
  candidates.push({
    id: "antigravity",
    target: "antigravity",
    label: targetLabel("antigravity"),
    status: antigravityDetected ? "detected" : "not-detected",
    detail: antigravityDetected ? `config: ${settings.antigravityConfigPath}` : "Antigravity config path not found yet"
  });

  return {
    ok: true,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    hostOs: settings.hostOs,
    baseUrl: settings.baseUrl,
    mcpUrl: settings.baseUrl ? `${settings.baseUrl}/mcp` : "",
    candidates
  };
}

function installerOptions(options) {
  const sharedVmName = option(options, "vm", "");
  const sharedVmUser = option(options, "vm-user", "");
  const hasVmTarget = Boolean(
    sharedVmName ||
    sharedVmUser ||
    option(options, "orb-vm", "") ||
    option(options, "orb-user", "") ||
    option(options, "openclaw-vm", "") ||
    option(options, "openclaw-user", "") ||
    option(options, "hermes-vm", "") ||
    option(options, "hermes-user", "")
  );
  return {
    hostOs: detectHostOs(),
    baseUrl: normalizeBaseUrl(option(options, "resolved-url", explicitBaseUrl(options))),
    tokenEnv: String(option(options, "token-env", DEFAULT_TOKEN_ENV)),
    codexBin: String(option(options, "codex-bin", process.env.CODEX_CLI_PATH || DEFAULT_CODEX_BIN)),
    geminiBin: String(option(options, "gemini-bin", process.env.GEMINI_CLI_PATH || DEFAULT_GEMINI_BIN)),
    kiloBin: String(option(options, "kilo-bin", process.env.KILO_CLI_PATH || DEFAULT_KILO_BIN)),
    copilotBin: String(option(options, "copilot-bin", process.env.COPILOT_CLI_PATH || DEFAULT_COPILOT_BIN)),
    orbBin: String(option(options, "orb-bin", process.env.ORB_CLI_PATH || DEFAULT_ORB_BIN)),
    dockerBin: String(option(options, "docker-bin", process.env.DOCKER_CLI_PATH || DEFAULT_DOCKER_BIN)),
    podmanBin: String(option(options, "podman-bin", process.env.PODMAN_CLI_PATH || DEFAULT_PODMAN_BIN)),
    wslBin: String(option(options, "wsl-bin", process.env.WSL_CLI_PATH || DEFAULT_WSL_BIN)),
    executionLocation: String(option(options, "execution-location", hasVmTarget ? "orb" : "local")),
    remoteKind: String(option(options, "remote-kind", "")),
    remoteId: String(option(options, "remote-id", "")),
    remoteName: String(option(options, "remote-name", "")),
    remoteBin: String(option(options, "remote-bin", "")),
    orbVm: String(option(options, "orb-vm", sharedVmName)),
    orbUser: String(option(options, "orb-user", sharedVmUser)),
    marketplaceRoot: path.resolve(String(option(options, "marketplace-root", path.join(os.homedir(), ".pact", "codex-plugin-marketplace")))),
    geminiExtensionRoot: path.resolve(String(option(options, "gemini-extension-root", path.join(os.homedir(), ".pact", "gemini-extensions", PLUGIN_NAME)))),
    kiloConfigPath: path.resolve(String(option(options, "kilo-config", path.join(os.homedir(), ".config", "kilo", "kilo.json")))),
    antigravityConfigPath: path.resolve(String(option(options, "antigravity-config", path.join(os.homedir(), ".gemini", "antigravity", "mcp_config.json")))),
    openclawVm: String(option(options, "openclaw-vm", sharedVmName)),
    openclawVmUser: String(option(options, "openclaw-user", sharedVmUser)),
    openclawBin: String(option(options, "openclaw-bin", "")),
    hermesVm: String(option(options, "hermes-vm", sharedVmName)),
    hermesVmUser: String(option(options, "hermes-user", sharedVmUser)),
    hermesBin: String(option(options, "hermes-bin", ""))
  };
}

function hasExplicitTarget(options) {
  return Object.hasOwn(options, "target");
}

function canUseInstallTui(options) {
  return !hasExplicitTarget(options)
    && !options.json
    && process.stdin.isTTY
    && process.stdout.isTTY;
}

function canUseUninstallTui(options) {
  return canUseInstallTui(options);
}

function statusGlyph(status) {
  if (status === "detected") {
    return "ok";
  }
  if (status === "not-detected") {
    return "--";
  }
  return "??";
}

function selectionGlyph(selected) {
  return selected ? "x" : " ";
}

function renderInstallMenu({ candidates, index, selectedIds, baseUrl, message = "", mode = "install" }) {
  const action = mode === "uninstall" ? "uninstall" : "install";
  const title = mode === "uninstall" ? "Pact MCP uninstall" : "Pact MCP install";
  const mcpLine = baseUrl ? `MCP: ${baseUrl}/mcp` : "MCP: no server URL required for local client removal";
  const rows = [
    "\x1b[2J\x1b[H",
    title,
    "",
    mcpLine,
    `Use Up/Down or j/k, Space to toggle, a to toggle detected, Enter to ${action}, q to cancel.`,
    "",
    ...candidates.map((candidate, candidateIndex) => {
      const pointer = candidateIndex === index ? ">" : " ";
      const selected = selectedIds.has(candidate.id);
      const label = `${candidate.label}`.padEnd(28, " ");
      return `${pointer} [${selectionGlyph(selected)}] [${statusGlyph(candidate.status)}] ${label} ${candidate.detail || ""}`;
    }),
    "",
    message
  ];
  process.stdout.write(rows.join("\n"));
}
function renderAutoUpdateMenu({ enabled }) {
  const rows = [
    "\x1b[2J\x1b[H",
    "Pact MCP Auto-Update Preference",
    "",
    "Do you want to enable automatic push updates?",
    "If enabled, your local AI agent will automatically download and install updates when the server pushes them.",
    "(This is disabled by default for security).",
    "",
    `  [${enabled ? "x" : " "}] Enable automatic push updates`,
    `> [${enabled ? " " : "x"}] Disable automatic push updates (Recommended)`,
    "",
    "Use Up/Down to toggle, Enter to confirm."
  ];
  if (enabled) {
    rows[7] = `> [x] Enable automatic push updates`;
    rows[8] = `  [ ] Disable automatic push updates (Recommended)`;
  }
  process.stdout.write(rows.join("\n") + "\n");
}

async function chooseAutoUpdate() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }
  let enabled = false;
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    const cleanup = () => {
      stdin.off("data", onData);
      if (stdin.setRawMode) {
        stdin.setRawMode(Boolean(wasRaw));
      }
      stdin.pause();
      process.stdout.write("\x1b[?25h\n");
    };
    
    renderAutoUpdateMenu({ enabled });
    
    const onData = (chunk) => {
      const key = chunk.toString("utf8");
      if (key === "\u0003") {
        cleanup();
        reject(new Error("Interactive install cancelled."));
        return;
      }
      if (key === "\r" || key === "\n") {
        cleanup();
        resolve(enabled);
        return;
      }
      if (key === "\u001b[A" || key === "k" || key === "K" || key === "\u001b[B" || key === "j" || key === "J" || key === " ") {
        enabled = !enabled;
        renderAutoUpdateMenu({ enabled });
      }
    };
    
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.on("data", onData);
    process.stdout.write("\x1b[?25l");
  });
}

async function chooseInstallCandidates({ candidates, baseUrl }) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive install requires a TTY. Pass --target for non-interactive use.");
  }
  let index = Math.max(0, candidates.findIndex((candidate) => candidate.status === "detected"));
  if (index < 0) {
    index = 0;
  }
  const selectedIds = new Set();
  let message = "Space selects one or more clients. Enter installs selected clients.";
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    const cleanup = () => {
      stdin.off("data", onData);
      if (stdin.setRawMode) {
        stdin.setRawMode(Boolean(wasRaw));
      }
      stdin.pause();
      process.stdout.write("\x1b[?25h\n");
    };
    const onData = (chunk) => {
      const key = chunk.toString("utf8");
      if (key === "\u0003") {
        cleanup();
        reject(new Error("Interactive install cancelled."));
        return;
      }
      if (key === "q" || key === "Q" || key === "\u001b") {
        cleanup();
        resolve(null);
        return;
      }
      if (key === "\r" || key === "\n") {
        const selected = candidates.filter((candidate) => selectedIds.has(candidate.id));
        if (selected.length === 0) {
          message = "No clients selected. Press Space to select at least one client.";
          renderInstallMenu({ candidates, index, selectedIds, baseUrl, message });
          return;
        }
        cleanup();
        resolve(selected);
        return;
      }
      if (key === " ") {
        const selected = candidates[index];
        if (selectedIds.has(selected.id)) {
          selectedIds.delete(selected.id);
        } else {
          selectedIds.add(selected.id);
        }
        message = selectedIds.size === 1 ? "1 client selected." : `${selectedIds.size} clients selected.`;
      } else if (key === "a" || key === "A") {
        const detected = candidates.filter((candidate) => candidate.status === "detected");
        const shouldSelect = detected.some((candidate) => !selectedIds.has(candidate.id));
        for (const candidate of detected) {
          if (shouldSelect) {
            selectedIds.add(candidate.id);
          } else {
            selectedIds.delete(candidate.id);
          }
        }
        message = shouldSelect
          ? `${detected.length} detected clients selected.`
          : "Detected clients cleared.";
      }
      if (key === "\u001b[A" || key === "k" || key === "K") {
        index = (index - 1 + candidates.length) % candidates.length;
      } else if (key === "\u001b[B" || key === "j" || key === "J") {
        index = (index + 1) % candidates.length;
      }
      renderInstallMenu({ candidates, index, selectedIds, baseUrl, message });
    };
    process.stdout.write("\x1b[?25l");
    renderInstallMenu({ candidates, index, selectedIds, baseUrl, message });
    stdin.setEncoding("utf8");
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function chooseUninstallCandidates({ candidates, baseUrl }) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive uninstall requires a TTY. Pass --target for non-interactive use.");
  }
  let index = Math.max(0, candidates.findIndex((candidate) => candidate.status === "detected"));
  if (index < 0) {
    index = 0;
  }
  const selectedIds = new Set();
  let message = "Space selects one or more clients. Enter removes Pact MCP from selected clients.";
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    const cleanup = () => {
      stdin.off("data", onData);
      if (stdin.setRawMode) {
        stdin.setRawMode(Boolean(wasRaw));
      }
      stdin.pause();
      process.stdout.write("\x1b[?25h\n");
    };
    const onData = (chunk) => {
      const key = chunk.toString("utf8");
      if (key === "\u0003") {
        cleanup();
        reject(new Error("Interactive uninstall cancelled."));
        return;
      }
      if (key === "q" || key === "Q" || key === "\u001b") {
        cleanup();
        resolve(null);
        return;
      }
      if (key === "\r" || key === "\n") {
        const selected = candidates.filter((candidate) => selectedIds.has(candidate.id));
        if (selected.length === 0) {
          message = "No clients selected. Press Space to select at least one client.";
          renderInstallMenu({ candidates, index, selectedIds, baseUrl, message, mode: "uninstall" });
          return;
        }
        cleanup();
        resolve(selected);
        return;
      }
      if (key === " ") {
        const selected = candidates[index];
        if (selectedIds.has(selected.id)) {
          selectedIds.delete(selected.id);
        } else {
          selectedIds.add(selected.id);
        }
        message = selectedIds.size === 1 ? "1 client selected for removal." : `${selectedIds.size} clients selected for removal.`;
      } else if (key === "a" || key === "A") {
        const detected = candidates.filter((candidate) => candidate.status === "detected");
        const shouldSelect = detected.some((candidate) => !selectedIds.has(candidate.id));
        for (const candidate of detected) {
          if (shouldSelect) {
            selectedIds.add(candidate.id);
          } else {
            selectedIds.delete(candidate.id);
          }
        }
        message = shouldSelect
          ? `${detected.length} detected clients selected for removal.`
          : "Detected clients cleared.";
      }
      if (key === "\u001b[A" || key === "k" || key === "K") {
        index = (index - 1 + candidates.length) % candidates.length;
      } else if (key === "\u001b[B" || key === "j" || key === "J") {
        index = (index + 1) % candidates.length;
      }
      renderInstallMenu({ candidates, index, selectedIds, baseUrl, message, mode: "uninstall" });
    };
    process.stdout.write("\x1b[?25l");
    renderInstallMenu({ candidates, index, selectedIds, baseUrl, message, mode: "uninstall" });
    stdin.setEncoding("utf8");
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function promptLine(prompt, { hidden = false } = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive prompt requires a TTY.");
  }
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let value = "";
    const cleanup = () => {
      stdin.off("data", onData);
      if (stdin.setRawMode) {
        stdin.setRawMode(Boolean(wasRaw));
      }
      stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk) => {
      const key = chunk.toString("utf8");
      if (key === "\u0003") {
        cleanup();
        reject(new Error("Interactive install cancelled."));
        return;
      }
      if (key === "\r" || key === "\n") {
        cleanup();
        resolve(value.trim());
        return;
      }
      if (key === "\u007f") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          if (!hidden) {
            process.stdout.write("\b \b");
          }
        }
        return;
      }
      if (key >= " ") {
        value += key;
        if (!hidden) {
          process.stdout.write(key);
        }
      }
    };
    process.stdout.write(prompt);
    stdin.setEncoding("utf8");
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function resolveInteractiveToken(options) {
  const token = await resolveToken(options, { required: false });
  if (token) {
    return token;
  }
  const tokenEnv = String(option(options, "token-env", DEFAULT_TOKEN_ENV));
  const entered = await promptLine(`Pact MCP token (${tokenEnv}): `, { hidden: true });
  if (!entered) {
    throw new Error(`Missing token. Provide --token-stdin, --token, or ${tokenEnv}.`);
  }
  return entered;
}

async function requestLocalMcpGrant(options, { targets = [], autoUpdate = false } = {}) {
  const settings = installerOptions(options);
  const targetList = [...new Set(targets.map(normalizeTarget).filter(Boolean))];
  const response = await fetchJson(`${settings.baseUrl}/api/mcp/local-grant`, {
    method: "POST",
    timeoutMs: 10000,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      targets: targetList,
      label: `Pact MCP ${targetList.length ? targetList.map(targetLabel).join(", ") : "local agent"}`,
      connectorVersion: packageJson.version,
      autoUpdate
    })
  });
  if (!response.ok || !response.payload?.token) {
    const reason = response.payload?.error?.message || response.payload?.error || `HTTP ${response.status}`;
    throw new Error(`Failed to request local Pact MCP token: ${reason}`);
  }
  return {
    token: String(response.payload.token || "").trim(),
    source: "local-grant",
    grant: response.payload.grant || null,
    tokenPrefix: response.payload.tokenPrefix || response.payload.grant?.tokenPrefix || "",
    toolsets: response.payload.toolsets || [],
    scopes: response.payload.scopes || []
  };
}

async function resolveInstallToken(options, { targets = [], autoUpdate = false } = {}) {
  const explicit = await resolveToken(options, { required: false });
  if (explicit) {
    return {
      token: explicit,
      source: "provided",
      tokenPrefix: redactToken(explicit)
    };
  }
  if (options["no-auto-token"]) {
    const tokenEnv = String(option(options, "token-env", DEFAULT_TOKEN_ENV));
    throw new Error(`Missing token. Provide --token-stdin, --token, or ${tokenEnv}.`);
  }
  return requestLocalMcpGrant(options, { targets, autoUpdate });
}

async function resolveHubForInstall(options) {
  const discovered = await discoverPactHub(options);
  if (discovered.ok) {
    return {
      ...options,
      "resolved-url": discovered.baseUrl,
      __pactDiscovery: discovered
    };
  }
  if (!canUseInstallTui(options)) {
    throw new Error(`${discovered.reason} Run pact-mcp server-config --set --url <pact-url>, or rerun install in a TTY and choose manual configuration.`);
  }
  console.log("No signed Pact MCP service was discovered on this device.");
  console.log("The installer will not write any agent client config until a server identity signature is verified.");
  console.log("");
  const answer = await promptLine("Choose: [c]onfigure server URL now, [s]kip, manually configure later [s]: ");
  if (!answer || answer.toLowerCase().startsWith("s")) {
    return {
      ...options,
      __pactSkippedDiscovery: {
        ok: false,
        skipped: true,
        attempts: discovered.attempts,
        reason: "Skipped. Manually configure later with pact-mcp server-config --set --url <pact-url>."
      }
    };
  }
  if (!answer.toLowerCase().startsWith("c")) {
    return resolveHubForInstall(options);
  }
  const url = await promptLine("Pact server URL: ");
  const manual = await discoverPactHub({ ...options, url });
  if (!manual.ok) {
    throw new Error(`Failed to verify ${url}: ${manual.reason}`);
  }
  await writeServerConfigProfile({
    options: { ...options, url },
    name: String(option(options, "name", "manual")).trim() || "manual",
    discovered: manual,
    publishEnv: !options["no-env"]
  });
  return {
    ...options,
    "resolved-url": manual.baseUrl,
    __pactDiscovery: manual
  };
}

function remoteContextFromSettings(settings) {
  const kind = settings.remoteKind || settings.executionLocation;
  if (!isGenericRemoteLocation(kind)) {
    return null;
  }
  const bin = settings.remoteBin
    || (kind === "docker" ? settings.dockerBin : kind === "podman" ? settings.podmanBin : settings.wslBin);
  if (!settings.remoteId || !bin) {
    throw new Error(`${kind} install requires a discovered remote context.`);
  }
  return {
    kind,
    id: settings.remoteId,
    name: settings.remoteName || settings.remoteId,
    bin
  };
}

async function installTargets({ options, targets, token, tokenInfo = null, optionOverrides = {} }) {
  const mergedOptions = {
    ...options,
    ...optionOverrides
  };
  const settings = installerOptions(mergedOptions);
  const remoteContext = remoteContextFromSettings(settings);
  const verify = !mergedOptions["no-verify"];

  await ensureService(settings.baseUrl);

  const installed = {};
  for (const target of targets) {
    try {
      let clientResult = null;
      if (target === "codex") {
        clientResult = await installCodex({
          baseUrl: settings.baseUrl,
          token,
          tokenEnv: settings.tokenEnv,
          codexBin: settings.codexBin,
          marketplaceRoot: settings.marketplaceRoot
        });
      } else if (target === "gemini-cli") {
        clientResult = remoteContext
          ? await installGeminiRemote({
              baseUrl: settings.baseUrl,
              token,
              context: remoteContext,
              geminiBin: settings.geminiBin
            })
          : settings.executionLocation === "orb"
          ? await installGeminiOrb({
              baseUrl: settings.baseUrl,
              token,
              orbBin: settings.orbBin,
              vmName: settings.orbVm,
              vmUser: settings.orbUser,
              geminiBin: settings.geminiBin
            })
          : await installGemini({
              baseUrl: settings.baseUrl,
              token,
              geminiBin: settings.geminiBin,
              extensionRoot: settings.geminiExtensionRoot
            });
      } else if (target === "kilo-code") {
        clientResult = remoteContext
          ? await installKiloRemote({
              baseUrl: settings.baseUrl,
              token,
              context: remoteContext,
              kiloBin: settings.kiloBin
            })
          : settings.executionLocation === "orb"
          ? await installKiloOrb({
              baseUrl: settings.baseUrl,
              token,
              orbBin: settings.orbBin,
              vmName: settings.orbVm,
              vmUser: settings.orbUser,
              kiloBin: settings.kiloBin
            })
          : await installKilo({
              baseUrl: settings.baseUrl,
              token,
              kiloBin: settings.kiloBin,
              kiloConfigPath: settings.kiloConfigPath
            });
      } else if (target === "copilot") {
        clientResult = remoteContext
          ? await installCopilotRemote({
              baseUrl: settings.baseUrl,
              token,
              context: remoteContext,
              copilotBin: settings.copilotBin
            })
          : settings.executionLocation === "orb"
          ? await installCopilotOrb({
              baseUrl: settings.baseUrl,
              token,
              orbBin: settings.orbBin,
              vmName: settings.orbVm,
              vmUser: settings.orbUser,
              copilotBin: settings.copilotBin
            })
          : await installCopilot({
              baseUrl: settings.baseUrl,
              token,
              copilotBin: settings.copilotBin
            });
      } else if (target === "openclaw") {
        clientResult = remoteContext
          ? await installOpenClawRemote({
              baseUrl: settings.baseUrl,
              token,
              context: remoteContext,
              openclawBin: settings.openclawBin
            })
          : await installOpenClaw({
              baseUrl: settings.baseUrl,
              token,
              orbBin: settings.orbBin,
              vmName: settings.openclawVm || settings.orbVm,
              vmUser: settings.openclawVmUser || settings.orbUser,
              openclawBin: settings.openclawBin
            });
      } else if (target === "hermes") {
        clientResult = await installHermes({
          baseUrl: settings.baseUrl,
          token,
          orbBin: settings.orbBin,
          vmName: settings.hermesVm,
          vmUser: settings.hermesVmUser,
          hermesBin: settings.hermesBin
        });
      } else if (target === "antigravity") {
        clientResult = await installAntigravity({
          baseUrl: settings.baseUrl,
          token,
          configPath: settings.antigravityConfigPath
        });
      }
      const httpVerification = verify ? await verifyMcpTools({ baseUrl: settings.baseUrl, token }) : null;
      installed[target] = {
        ok: true,
        status: "installed",
        ...(clientResult || {}),
        httpVerification
      };
    } catch (error) {
      installed[target] = {
        ok: false,
        status: "failed",
        installMode: targetInstallMode(target),
        error: error?.message || String(error)
      };
    }
  }

  const discoveryManifest = await writeDeviceDiscovery({
    baseUrl: settings.baseUrl,
    marketplaceRoot: settings.marketplaceRoot,
    codexPluginRoot: installed.codex?.pluginRoot || "",
    installed,
    token,
    discoveryPath: discoveryRegistryPath(mergedOptions)
  });

  return {
    ok: Object.values(installed).every((value) => value?.ok !== false),
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    targets,
    baseUrl: settings.baseUrl,
    discoveryManifest,
    installed: Object.fromEntries(Object.entries(installed).map(([target, value]) => [
      target,
      {
        installMode: value.installMode,
        status: value.status || (value.ok === false ? "failed" : "installed"),
        error: value.error || "",
        tokenSource: tokenInfo?.source || "provided",
        tokenPrefix: tokenInfo?.tokenPrefix || redactToken(token),
        httpVerification: value.httpVerification || null
      }
    ]))
  };
}

async function installTuiCommand(options) {
  const settings = installerOptions(options);
  await ensureService(settings.baseUrl);
  const scan = await scanInstallTargets(options);
  const selected = await chooseInstallCandidates({
    candidates: scan.candidates,
    baseUrl: settings.baseUrl
  });
  if (!selected || selected.length === 0) {
    return {
      ok: false,
      cancelled: true,
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      reason: "Interactive install cancelled."
    };
  }
  const selectedTargets = [...new Set(selected.map((candidate) => candidate.target))];
  const autoUpdate = await chooseAutoUpdate();
  options.__pactAutoUpdate = autoUpdate;
  const tokenInfo = await resolveInstallToken(options, { targets: selectedTargets, autoUpdate });
  const hasPerCandidateOverrides = selected.some((candidate) =>
    Object.keys(candidate.optionOverrides || {}).length > 0
  );
  const result = hasPerCandidateOverrides
    ? await installSelectedCandidates({ options, selected, tokenInfo })
    : await installTargets({
        options,
        targets: selectedTargets,
        token: tokenInfo.token,
        tokenInfo
      });
  return {
    ...result,
    interactive: true,
    selected: selected.map((candidate) => ({
      id: candidate.id,
      target: candidate.target,
      label: candidate.label,
      detail: candidate.detail
    }))
  };
}

async function installSelectedCandidates({ options, selected, tokenInfo }) {
  const partials = [];
  let discoveryManifest = "";
  let baseUrl = installerOptions(options).baseUrl;
  const installed = {};
  for (const candidate of selected) {
    const partial = await installTargets({
      options,
      targets: [candidate.target],
      token: tokenInfo.token,
      tokenInfo,
      optionOverrides: candidate.optionOverrides || {}
    });
    partials.push({
      target: candidate.target,
      id: candidate.id,
      label: candidate.label,
      ok: partial.ok,
      discoveryManifest: partial.discoveryManifest
    });
    discoveryManifest = partial.discoveryManifest;
    baseUrl = partial.baseUrl || baseUrl;
    Object.assign(installed, partial.installed || {});
  }
  return {
    ok: partials.every((partial) => partial.ok),
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    targets: [...new Set(selected.map((candidate) => candidate.target))],
    baseUrl,
    discoveryManifest,
    installed,
    partials
  };
}

async function installCommand(options) {
  const resolvedOptions = await resolveHubForInstall(options);
  if (resolvedOptions.__pactSkippedDiscovery) {
    return {
      ok: false,
      skipped: true,
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      ...resolvedOptions.__pactSkippedDiscovery
    };
  }
  if (canUseInstallTui(options)) {
    return installTuiCommand(resolvedOptions);
  }
  const targetOpt = option(resolvedOptions, "target", "");
  if (!targetOpt) {
    return {
      ok: false,
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      error: "Interactive mode requires a TTY. Please specify --target <client> for non-interactive use."
    };
  }
  const targets = parseTargets(targetOpt);
  const autoUpdate = Boolean(resolvedOptions["auto-update"]);
  resolvedOptions.__pactAutoUpdate = autoUpdate;
  const tokenInfo = await resolveInstallToken(resolvedOptions, { targets, autoUpdate });
  return installTargets({
    options: resolvedOptions,
    targets,
    token: tokenInfo.token,
    tokenInfo
  });
}

async function optionsWithStoredBaseUrl(options = {}) {
  if (explicitBaseUrl(options) || option(options, "resolved-url", "")) {
    return options;
  }
  const [storedBaseUrl] = await registryBaseUrls(options);
  return storedBaseUrl
    ? { ...options, "resolved-url": storedBaseUrl }
    : options;
}

async function uninstallTargets({ options, targets, optionOverrides = {} }) {
  const mergedOptions = {
    ...options,
    ...optionOverrides
  };
  const settings = installerOptions(mergedOptions);
  const remoteContext = remoteContextFromSettings(settings);
  const uninstalled = {};
  for (const target of targets) {
    try {
      if (target === "codex") {
        uninstalled[target] = await uninstallCodex({
          tokenEnv: settings.tokenEnv,
          codexBin: settings.codexBin,
          marketplaceRoot: settings.marketplaceRoot
        });
      } else if (target === "gemini-cli") {
        uninstalled[target] = remoteContext
          ? await uninstallGeminiRemote({
              context: remoteContext,
              geminiBin: settings.geminiBin
            })
          : settings.executionLocation === "orb"
          ? await uninstallGeminiOrb({
              orbBin: settings.orbBin,
              vmName: settings.orbVm,
              vmUser: settings.orbUser,
              geminiBin: settings.geminiBin
            })
          : await uninstallGemini({
              geminiBin: settings.geminiBin,
              extensionRoot: settings.geminiExtensionRoot
            });
      } else if (target === "kilo-code") {
        uninstalled[target] = remoteContext
          ? await uninstallKiloRemote({
              context: remoteContext,
              kiloBin: settings.kiloBin
            })
          : settings.executionLocation === "orb"
          ? await uninstallKiloOrb({
              orbBin: settings.orbBin,
              vmName: settings.orbVm,
              vmUser: settings.orbUser,
              kiloBin: settings.kiloBin
            })
          : await uninstallKilo({
              kiloConfigPath: settings.kiloConfigPath,
              kiloBin: settings.kiloBin
            });
      } else if (target === "copilot") {
        uninstalled[target] = remoteContext
          ? await uninstallCopilotRemote({
              context: remoteContext,
              copilotBin: settings.copilotBin
            })
          : settings.executionLocation === "orb"
          ? await uninstallCopilotOrb({
              orbBin: settings.orbBin,
              vmName: settings.orbVm,
              vmUser: settings.orbUser,
              copilotBin: settings.copilotBin
            })
          : await uninstallCopilot({
              copilotBin: settings.copilotBin
            });
      } else if (target === "openclaw") {
        uninstalled[target] = remoteContext
          ? await uninstallOpenClawRemote({
              context: remoteContext,
              openclawBin: settings.openclawBin
            })
          : await uninstallOpenClaw({
              orbBin: settings.orbBin,
              vmName: settings.openclawVm || settings.orbVm,
              vmUser: settings.openclawVmUser || settings.orbUser,
              openclawBin: settings.openclawBin
            });
      } else if (target === "hermes") {
        uninstalled[target] = await uninstallHermes({
          orbBin: settings.orbBin,
          vmName: settings.hermesVm,
          vmUser: settings.hermesVmUser,
          hermesBin: settings.hermesBin
        });
      } else if (target === "antigravity") {
        uninstalled[target] = await uninstallAntigravity({
          configPath: settings.antigravityConfigPath
        });
      }
      uninstalled[target] = {
        ok: true,
        status: "not-installed",
        ...(uninstalled[target] || {})
      };
    } catch (error) {
      uninstalled[target] = {
        ok: false,
        status: "failed",
        uninstallMode: targetInstallMode(target),
        error: error?.message || String(error)
      };
    }
  }
  const discoveryManifest = settings.baseUrl
    ? await writeDeviceUninstall({
        baseUrl: settings.baseUrl,
        uninstalled,
        discoveryPath: discoveryRegistryPath(mergedOptions)
      })
    : "";
  return {
    ok: Object.values(uninstalled).every((value) => value?.ok !== false),
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    targets,
    baseUrl: settings.baseUrl,
    discoveryManifest,
    uninstalled
  };
}

async function uninstallSelectedCandidates({ options, selected }) {
  const partials = [];
  let discoveryManifest = "";
  let baseUrl = installerOptions(options).baseUrl;
  const uninstalled = {};
  for (const candidate of selected) {
    const partial = await uninstallTargets({
      options,
      targets: [candidate.target],
      optionOverrides: candidate.optionOverrides || {}
    });
    partials.push({
      target: candidate.target,
      id: candidate.id,
      label: candidate.label,
      ok: partial.ok,
      discoveryManifest: partial.discoveryManifest
    });
    discoveryManifest = partial.discoveryManifest || discoveryManifest;
    baseUrl = partial.baseUrl || baseUrl;
    Object.assign(uninstalled, partial.uninstalled || {});
  }
  return {
    ok: partials.every((partial) => partial.ok),
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    targets: [...new Set(selected.map((candidate) => candidate.target))],
    baseUrl,
    discoveryManifest,
    uninstalled,
    partials
  };
}

async function waitAnyKey(promptText) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return;
  }
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    const cleanup = () => {
      stdin.off("data", onData);
      if (stdin.setRawMode) {
        stdin.setRawMode(Boolean(wasRaw));
      }
      stdin.pause();
      process.stdout.write("\n");
      resolve();
    };
    const onData = () => cleanup();
    process.stdout.write(promptText);
    stdin.setEncoding("utf8");
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function uninstallTuiCommand(options) {
  const settings = installerOptions(options);
  const scan = await scanInstallTargets(options);
  
  const manifestPath = discoveryRegistryPath(options);
  const manifest = await readJson(manifestPath, null);
  let installedTargets = [];
  if (manifest) {
    const server = manifest.servers?.[MCP_SERVER_NAME] || {};
    installedTargets = Object.entries(server.targets || {})
      .filter(([, status]) => status?.status === "installed")
      .map(([target]) => target);
  }
  
  const filteredCandidates = scan.candidates.filter(c => installedTargets.includes(c.target));
  
  if (filteredCandidates.length === 0) {
    console.log(`\x1b[2J\x1b[HPact MCP uninstall\n`);
    console.log(`Scanned ${scan.candidates.length} supported MCP clients.`);
    console.log("None of these clients currently have Pact MCP installed.");
    await waitAnyKey("\nPress any key to escape...");
    return {
      ok: true,
      cancelled: true,
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      reason: "No installed Pact MCP clients found to uninstall."
    };
  }

  const selected = await chooseUninstallCandidates({
    candidates: filteredCandidates,
    baseUrl: settings.baseUrl
  });
  if (!selected || selected.length === 0) {
    return {
      ok: false,
      cancelled: true,
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      reason: "Interactive uninstall cancelled."
    };
  }
  const result = await uninstallSelectedCandidates({ options, selected });
  return {
    ...result,
    interactive: true,
    selected: selected.map((candidate) => ({
      id: candidate.id,
      target: candidate.target,
      label: candidate.label,
      detail: candidate.detail
    }))
  };
}

async function uninstallCommand(options) {
  const resolvedOptions = await optionsWithStoredBaseUrl(options);
  if (canUseUninstallTui(options)) {
    return uninstallTuiCommand(resolvedOptions);
  }
  const targetOpt = option(resolvedOptions, "target", "");
  if (!targetOpt) {
    return {
      ok: false,
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      error: "Interactive mode requires a TTY. Please specify --target <client> for non-interactive use."
    };
  }
  const targets = parseTargets(targetOpt);
  return uninstallTargets({
    options: resolvedOptions,
    targets
  });
}

async function registerCommand(options) {
  const resolvedOptions = await optionsWithDiscoveredBaseUrl(options);
  const settings = installerOptions(resolvedOptions);
  const profile = await writeServerConfigProfile({
    options: resolvedOptions,
    name: String(option(resolvedOptions, "name", "default")).trim() || "default",
    discovered: resolvedOptions.__pactDiscovery,
    publishEnv: !resolvedOptions["no-env"]
  });
  const discoveryManifest = profile.path;
  const localFiles = deviceDiscoveryPaths(resolvedOptions);
  const env = deviceDiscoveryEnv({ baseUrl: settings.baseUrl, primaryPath: discoveryManifest });
  return {
    ok: true,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    mode: "device-hub-registration",
    baseUrl: settings.baseUrl,
    mcpUrl: `${settings.baseUrl}/mcp`,
    discoveryManifest,
    localEntry: {
      command: "pact-mcp discover-local",
      registryFile: discoveryManifest
    },
    localFiles,
    env,
    clientInstall: `pact-mcp install --target <client>`,
    verifiedHandshake: resolvedOptions.__pactDiscovery?.handshake?.payload?.identity?.keyId || "",
    serverConfig: profile.profile,
    note: "Discovered and registered the signed Pact MCP endpoint without installing it into any client."
  };
}

async function readLocalDiscoveryFile(filePath) {
  const payload = await readJson(filePath, null);
  const server = payload?.servers?.[MCP_SERVER_NAME] || {};
  if (!server.httpUrl) {
    return null;
  }
  return {
    sourceType: "file",
    source: filePath,
    payload,
    mcpUrl: server.httpUrl,
    discoveryUrl: server.discoveryUrl || payload.discovery?.preferredHttpDiscoveryUrl || ""
  };
}

async function fetchDiscoveryUrl(url) {
  const response = await fetchJson(url);
  if (!response.ok) {
    return null;
  }
  const server = response.payload?.mcpServers?.[MCP_SERVER_NAME] || response.payload?.servers?.[MCP_SERVER_NAME] || {};
  const mcpUrl = server.httpUrl || server.url || "";
  if (!mcpUrl) {
    return null;
  }
  return {
    sourceType: "http",
    source: url,
    payload: response.payload,
    mcpUrl,
    discoveryUrl: url
  };
}

async function discoverLocalCommand(options) {
  const discovered = await discoverPactHub(options);
  if (!discovered.ok) {
    return {
      ok: false,
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      attempts: discovered.attempts,
      reason: discovered.reason
    };
  }
  return {
    ok: true,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    sourceType: "signed-handshake",
    source: discovered.baseUrl,
    baseUrl: discovered.baseUrl,
    mcpUrl: `${discovered.baseUrl}/mcp`,
    discoveryUrl: `${discovered.baseUrl}/api/mcp/discovery`,
    identityKeyId: discovered.handshake?.payload?.identity?.keyId || "",
    attempts: discovered.attempts,
    payload: discovered.discovery
  };
}

async function doctorCommand(options) {
  const resolvedOptions = await optionsWithDiscoveredBaseUrl(options);
  const settings = installerOptions(resolvedOptions);
  const discovered = resolvedOptions.__pactDiscovery || null;
  const token = await resolveToken(resolvedOptions, { required: false });
  const discovery = await fetchJson(`${settings.baseUrl}/api/mcp/discovery`);
  const initialize = await ensureService(settings.baseUrl);
  const checks = {
    signedDiscovery: {
      ok: Boolean(discovered?.ok),
      baseUrl: settings.baseUrl,
      identityKeyId: discovered?.handshake?.payload?.identity?.keyId || "",
      attempts: discovered?.attempts || []
    },
    discovery: {
      ok: discovery.ok,
      status: discovery.status,
      installerPackage: discovery.payload?.installer?.packageName || "",
      httpUrl: discovery.payload?.mcpServers?.pact?.httpUrl || ""
    },
    initialize: {
      ok: true,
      serverName: initialize.payload?.result?.serverInfo?.name || "",
      serverVersion: initialize.payload?.result?.serverInfo?.version || "",
      stableToolName: initialize.payload?.result?._meta?.stableToolName || "",
      listChanged: initialize.payload?.result?.capabilities?.tools?.listChanged === true
    },
    toolsList: {
      ok: false,
      skipped: true,
      toolCount: 0,
      stableToolOnly: false,
      reason: "Set PACT_MCP_TOKEN, pass --token, or use --token-stdin to verify tools/list."
    },
    systemHealth: {
      ok: false,
      skipped: true,
      healthy: false,
      reason: "Set PACT_MCP_TOKEN, pass --token, or use --token-stdin to verify tools/call system.health."
    },
    deviceManifest: {
      ok: false,
      exists: false,
      path: discoveryRegistryPath(resolvedOptions)
    }
  };

  if (token) {
    const verification = await verifyMcpTools({ baseUrl: settings.baseUrl, token });
    checks.toolsList = {
      ok: verification.toolCount === 1 && verification.stableToolName === MCP_STABLE_TOOL_NAME,
      skipped: false,
      toolCount: verification.toolCount,
      stableToolOnly: verification.toolCount === 1 && verification.stableToolName === MCP_STABLE_TOOL_NAME
    };
    checks.systemHealth = {
      ok: verification.systemHealthOk,
      skipped: false,
      healthy: verification.systemHealthOk,
      operation: "system.health"
    };
  }

  const manifestPath = checks.deviceManifest.path;
  const manifest = await readJson(manifestPath, null);
  if (manifest) {
    const server = manifest.servers?.[MCP_SERVER_NAME] || {};
    checks.deviceManifest = {
      ok: true,
      exists: true,
      path: manifestPath,
      httpUrl: server.httpUrl || "",
      connector: server.connector || null,
      installedTargets: Object.entries(server.targets || {})
        .filter(([, status]) => status?.status === "installed")
        .map(([target]) => target)
    };
  }

  return {
    ok: checks.signedDiscovery.ok
      && checks.discovery.ok
      && checks.initialize.ok
      && (!token || (checks.toolsList.ok && checks.systemHealth.ok)),
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    checks
  };
}

async function discoverCommand(options) {
  const resolvedOptions = await optionsWithDiscoveredBaseUrl(options);
  const baseUrl = installerOptions(resolvedOptions).baseUrl;
  const discovery = await fetchJson(`${baseUrl}/api/mcp/discovery`);
  if (!discovery.ok) {
    throw new Error(`Pact MCP discovery failed: HTTP ${discovery.status}`);
  }
  return {
    ...discovery.payload,
    signedHandshake: {
      ok: true,
      identityKeyId: resolvedOptions.__pactDiscovery?.handshake?.payload?.identity?.keyId || ""
    }
  };
}

function yesNo(value) {
  return value ? "yes" : "no";
}

function formatTargetInstallLine(target, item = {}) {
  const failed = item.status === "failed" || item.ok === false || Boolean(item.error);
  const status = failed ? "FAIL" : "OK";
  const lines = [`  [${status}] ${targetLabel(target)} (${target})`];
  if (failed) {
    lines.push(`      Reason: ${item.error || "Install failed."}`);
    return lines;
  }
  if (item.tokenSource || item.tokenPrefix) {
    lines.push(`      Auth: ${item.tokenSource || "provided"}${item.tokenPrefix ? ` (${item.tokenPrefix})` : ""}`);
  }
  if (item.httpVerification) {
    lines.push(
      `      MCP verify: tools=${item.httpVerification.toolCount}, stableTool=${item.httpVerification.stableToolName || ""}, health=${yesNo(item.httpVerification.systemHealthOk)}`
    );
  }
  return lines;
}

function formatInstallResult(result) {
  if (result.skipped) {
    return [
      "Pact MCP install skipped.",
      "",
      result.reason || "No client configuration was changed.",
      "Run later: pact-mcp server-config --set --url <pact-url>"
    ].join("\n");
  }
  if (result.cancelled) {
    return [
      "Pact MCP install cancelled.",
      "",
      result.reason || "No client configuration was changed."
    ].join("\n");
  }
  const lines = [
    result.ok ? "Pact MCP install completed." : "Pact MCP install completed with errors.",
    ""
  ];
  if (result.error) {
    lines.push(`Reason: ${result.error}`, "");
  }
  lines.push(
    "Server:",
    `  MCP URL: ${result.baseUrl ? `${result.baseUrl}/mcp` : "unknown"}`
  );
  if (result.discoveryManifest) {
    lines.push(`  Local registry: ${result.discoveryManifest}`);
  }
  lines.push("", "Clients:");
  const installed = result.installed || {};
  const targets = result.targets?.length ? result.targets : Object.keys(installed);
  for (const target of targets) {
    lines.push(...formatTargetInstallLine(target, installed[target] || {}));
  }
  lines.push("", "Next:");
  lines.push("  Run: pact-mcp doctor");
  lines.push("  Restart any selected agent app that was already running.");
  if (!result.ok) {
    lines.push("  Re-run failed clients after fixing the reason above.");
  }
  return lines.join("\n");
}

function formatRegisterResult(result) {
  return [
    "Pact MCP hub registered.",
    "",
    `MCP URL: ${result.mcpUrl || (result.baseUrl ? `${result.baseUrl}/mcp` : "unknown")}`,
    `Verified handshake: ${result.verifiedHandshake || "yes"}`,
    `Local registry: ${result.discoveryManifest || ""}`,
    "",
    "Next:",
    "  pact-mcp install"
  ].join("\n");
}

function formatUninstallResult(result) {
  const lines = [
    result.ok ? "Pact MCP uninstall completed." : "Pact MCP uninstall completed with errors.",
    ""
  ];
  if (result.error) {
    lines.push(`Reason: ${result.error}`, "");
  }
  for (const target of result.targets || []) {
    const item = result.uninstalled?.[target] || {};
    const failed = item.status === "failed" || item.ok === false || Boolean(item.error);
    if (failed) {
      lines.push(`  [FAIL] ${targetLabel(target)} (${target})`);
      lines.push(`      Reason: ${item.error || "Uninstall failed."}`);
      continue;
    }
    lines.push(`  [${item.removedMcp === false ? "WARN" : "OK"}] ${targetLabel(target)} (${target})`);
  }
  if (result.discoveryManifest) {
    lines.push("", `Local registry: ${result.discoveryManifest}`);
  }
  return lines.join("\n");
}

function formatDoctorResult(result) {
  const checks = result.checks || {};
  const lines = [
    result.ok ? "Pact MCP doctor passed." : "Pact MCP doctor found issues.",
    "",
    `  [${checks.signedDiscovery?.ok ? "OK" : "FAIL"}] Signed discovery${checks.signedDiscovery?.baseUrl ? `: ${checks.signedDiscovery.baseUrl}` : ""}`,
    `  [${checks.discovery?.ok ? "OK" : "FAIL"}] Discovery${checks.discovery?.httpUrl ? `: ${checks.discovery.httpUrl}` : ""}`,
    `  [${checks.initialize?.ok ? "OK" : "FAIL"}] MCP initialize${checks.initialize?.serverVersion ? `: ${checks.initialize.serverVersion}` : ""}`
  ];
  if (checks.toolsList?.skipped) {
    lines.push("  [SKIP] Authenticated tools/list: token not provided");
  } else {
    lines.push(`  [${checks.toolsList?.ok ? "OK" : "FAIL"}] Authenticated tools/list`);
  }
  if (checks.systemHealth?.skipped) {
    lines.push("  [SKIP] Authenticated system.health: token not provided");
  } else {
    lines.push(`  [${checks.systemHealth?.ok ? "OK" : "FAIL"}] Authenticated system.health`);
  }
  lines.push(`  [${checks.deviceManifest?.ok ? "OK" : "WARN"}] Local registry${checks.deviceManifest?.path ? `: ${checks.deviceManifest.path}` : ""}`);
  return lines.join("\n");
}

function formatServerConfigResult(result) {
  if (result.reset) {
    return [
      "Pact MCP server config reset.",
      "",
      `Local registry: ${result.path || ""}`,
      "Next install will scan for a signed Pact server again."
    ].join("\n");
  }
  if (result.profiles) {
    const names = Object.keys(result.profiles);
    return [
      "Pact MCP server config.",
      "",
      `Active profile: ${result.activeName || "(none)"}`,
      `Profiles: ${names.length ? names.join(", ") : "(none)"}`,
      `Local registry: ${result.path || ""}`
    ].join("\n");
  }
  return [
    "Pact MCP server config updated.",
    "",
    `Active profile: ${result.activeName || result.profile?.name || "default"}`,
    `MCP URL: ${result.profile?.mcpUrl || (result.profile?.baseUrl ? `${result.profile.baseUrl}/mcp` : "")}`,
    `Local registry: ${result.path || ""}`
  ].join("\n");
}

function formatHumanResult(command, result) {
  if (command === "install") {
    return formatInstallResult(result);
  }
  if (command === "register") {
    return formatRegisterResult(result);
  }
  if (command === "uninstall") {
    return formatUninstallResult(result);
  }
  if (command === "doctor") {
    return formatDoctorResult(result);
  }
  if (command === "server-config") {
    return formatServerConfigResult(result);
  }
  return JSON.stringify(result, null, 2);
}

function emitResult(result, options, command = "") {
  if (options.json) {
    console.log(JSON.stringify(result, null, options.pretty ? 2 : 0));
  } else {
    console.log(formatHumanResult(command, result));
  }
  if (result?.ok === false) {
    process.exitCode = 1;
  }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (options.version || command === "version" || command === "--version") {
    emitResult({
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      stableToolName: MCP_STABLE_TOOL_NAME,
      interfaceVersion: MCP_INTERFACE_VERSION
    }, options, "version");
    return;
  }
  if (options.help || command === "help" || !command) {
    console.log(usage());
    return;
  }
  if (command === "install") {
    emitResult(await installCommand(options), options, command);
    return;
  }
  if (command === "register") {
    emitResult(await registerCommand(options), options, command);
    return;
  }
  if (command === "scan") {
    const discovered = await discoverPactHub(options);
    const scanOptions = discovered.ok
      ? { ...options, "resolved-url": discovered.baseUrl, __pactDiscovery: discovered }
      : options;
    const scan = await scanInstallTargets(scanOptions);
    emitResult({
      ...scan,
      serverDiscovery: discovered.ok
        ? {
            ok: true,
            baseUrl: discovered.baseUrl,
            identityKeyId: discovered.handshake?.payload?.identity?.keyId || ""
          }
        : {
            ok: false,
            attempts: discovered.attempts,
            reason: discovered.reason
          }
    }, options, command);
    return;
  }
  if (command === "discover-local") {
    const result = await discoverLocalCommand(options);
    emitResult(result, options, command);
    return;
  }
  if (command === "uninstall") {
    emitResult(await uninstallCommand(options), options, command);
    return;
  }
  if (command === "doctor") {
    emitResult(await doctorCommand(options), options, command);
    return;
  }
  if (command === "discover") {
    emitResult(await discoverCommand(options), options, command);
    return;
  }
  if (command === "server-config") {
    emitResult(await serverConfigCommand(options), options, command);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
