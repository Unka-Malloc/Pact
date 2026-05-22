#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { createPublicKey, randomBytes, verify } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));

const DEFAULT_TOKEN_ENV = "AGENTSTUDIO_MCP_TOKEN";
const DEFAULT_CODEX_BIN = "/Applications/Codex.app/Contents/Resources/codex";
const DEFAULT_GEMINI_BIN = "gemini";
const DEFAULT_KILO_BIN = "kilo";
const DEFAULT_COPILOT_BIN = "copilot";
const DEFAULT_ORB_BIN = "orb";
const PLUGIN_NAME = "agentstudio-mcp";
const MARKETPLACE_NAME = "agentstudio-local";
const GEMINI_EXTENSION_NAME = "AgentStudio";
const MCP_SERVER_NAME = "agentstudio";
const MCP_STABLE_TOOL_NAME = "agentstudio.call";
const MCP_INTERFACE_VERSION = "agentstudio.mcp.v1";
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
const AGENTSTUDIO_MCP_URL_ENV = "AGENTSTUDIO_MCP_URL";
const AGENTSTUDIO_MCP_DISCOVERY_URL_ENV = "AGENTSTUDIO_MCP_DISCOVERY_URL";
const AGENTSTUDIO_MCP_DISCOVERY_FILE_ENV = "AGENTSTUDIO_MCP_DISCOVERY_FILE";
const DEFAULT_DISCOVERY_REGISTRY = path.join(os.homedir(), ".agentstudio", "mcp", "servers.json");
const DEFAULT_SCAN_PORTS = [8787, 8788, 8789, 8790, 8791, 8792, 8793, 8794, 8795, 8796, 8797];
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

function usage() {
  return [
    "Usage:",
    "  agentstudio-mcp register",
    "  agentstudio-mcp install",
    "  agentstudio-mcp install --target codex",
    "  agentstudio-mcp uninstall --target codex",
    "  agentstudio-mcp scan --json",
    "  agentstudio-mcp discover-local",
    "  agentstudio-mcp doctor",
    "  agentstudio-mcp discover",
    "  agentstudio-mcp server-config --set --url http://host:port --name local",
    "  agentstudio-mcp server-config --switch local",
    "  agentstudio-mcp server-config --refresh",
    "  agentstudio-mcp server-config --reset",
    "",
    "Options:",
    "  --target LIST                 Comma-separated targets for non-interactive install. Default: codex.",
    "  --url URL                     Explicit AgentStudio base URL. Still requires signed MCP handshake.",
    "  --scan-ports LIST            Local ports to scan when --url is omitted. Default: 8787-8797.",
    "  --token TOKEN                 AgentStudio MCP token. Prefer --token-stdin or --token-env.",
    "  --token-stdin                 Read token from stdin.",
    "  --token-env NAME              Token environment variable. Default: AGENTSTUDIO_MCP_TOKEN.",
    "  --no-auto-token               Require an explicit token instead of requesting a local grant.",
    "  --no-verify                   Skip post-install MCP HTTP verification.",
    "  --json                        Emit compact JSON.",
    "  --no-env                      Do not publish launchctl environment variables during register.",
    "  --discovery-file PATH         Registry file used by register/discover-local. Default: ~/.agentstudio/mcp/servers.json.",
    "  --codex-bin PATH              Codex CLI path.",
    "  --gemini-bin PATH             Gemini CLI path.",
    "  --kilo-bin PATH               Kilo Code CLI path.",
    "  --copilot-bin PATH            Copilot CLI path.",
    "  --orb-bin PATH                OrbStack CLI path.",
    "  --vm NAME                     Shared OrbStack VM name for OpenClaw/Hermes.",
    "  --vm-user USER                Shared OrbStack VM user for OpenClaw/Hermes.",
    "  --openclaw-vm NAME            Default: kate.",
    "  --openclaw-user USER          Default: kate.",
    "  --openclaw-bin PATH           Default: /home/kate/.npm-global/bin/openclaw.",
    "  --hermes-vm NAME              Default: serena.",
    "  --hermes-user USER            Default: serena.",
    "  --hermes-bin PATH             Default: /home/serena/.local/bin/hermes.",
    "",
    "Interactive install:",
    "  When --target is omitted in a TTY, install opens a multi-select menu.",
    "  Use Up/Down or j/k to move, Space to toggle, a to toggle detected clients, Enter to install."
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
    process.env[AGENTSTUDIO_MCP_DISCOVERY_FILE_ENV] || DEFAULT_DISCOVERY_REGISTRY
  );
  return path.resolve(expandHomePath(requested));
}

function deviceDiscoveryPaths(options = {}) {
  return [discoveryRegistryPath(options)];
}

function deviceDiscoveryEnv({ baseUrl, primaryPath }) {
  return {
    [AGENTSTUDIO_MCP_URL_ENV]: `${baseUrl}/mcp`,
    [AGENTSTUDIO_MCP_DISCOVERY_URL_ENV]: `${baseUrl}/.well-known/agentstudio/mcp.json`,
    [AGENTSTUDIO_MCP_DISCOVERY_FILE_ENV]: primaryPath
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
  const backupPath = `${filePath}.agentstudio-backup-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z")}`;
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
  return normalizeBaseUrl(option(options, "url", process.env.AGENTSTUDIO_MCP_BASE_URL || ""));
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
      parsed.pathname === "/.well-known/agentstudio/mcp.json" ||
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
  const raw = String(option(options, "scan-ports", process.env.AGENTSTUDIO_MCP_SCAN_PORTS || "")).trim();
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
  const launchDiscoveryFile = await readLaunchctlEnv(AGENTSTUDIO_MCP_DISCOVERY_FILE_ENV);
  const launchDiscoveryUrl = await readLaunchctlEnv(AGENTSTUDIO_MCP_DISCOVERY_URL_ENV);
  const launchMcpUrl = await readLaunchctlEnv(AGENTSTUDIO_MCP_URL_ENV);
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
    baseUrlFromEndpoint(process.env[AGENTSTUDIO_MCP_URL_ENV]),
    baseUrlFromEndpoint(process.env[AGENTSTUDIO_MCP_DISCOVERY_URL_ENV]),
    baseUrlFromEndpoint(launchMcpUrl),
    baseUrlFromEndpoint(launchDiscoveryUrl),
    ...fromFiles,
    ...scanned
  ]).map(normalizeBaseUrl);
}

async function fetchAgentStudioDiscovery(baseUrl) {
  const url = `${baseUrl}/api/mcp/discovery`;
  const result = await fetchJson(url, { timeoutMs: 1500 });
  const payload = result.payload || {};
  const identity = payload.identity || null;
  if (
    !result.ok ||
    payload.name !== "AgentStudio" ||
    payload.interfaceVersion !== MCP_INTERFACE_VERSION ||
    payload.stableToolName !== MCP_STABLE_TOOL_NAME ||
    identity?.algorithm !== "Ed25519" ||
    !identity?.publicKeyJwk ||
    !payload.handshake?.url
  ) {
    throw new Error("not an AgentStudio MCP discovery response");
  }
  return payload;
}

async function verifyAgentStudioHandshake(baseUrl, discovery) {
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
    payload.schemaVersion !== "agentstudio.mcp.handshake.v1" ||
    payload.nonce !== nonce ||
    payload.server?.name !== "AgentStudio" ||
    payload.server?.interfaceVersion !== MCP_INTERFACE_VERSION ||
    payload.server?.stableToolName !== MCP_STABLE_TOOL_NAME ||
    payload.identity?.keyId !== discovery.identity?.keyId ||
    signature.algorithm !== "Ed25519" ||
    !verifySignedPayload({ publicKeyJwk, payload, signature: signature.value })
  ) {
    throw new Error("AgentStudio MCP handshake signature verification failed");
  }
  return {
    ok: true,
    baseUrl,
    discovery,
    handshake: result.payload
  };
}

async function discoverAgentStudioHub(options = {}) {
  const attempts = [];
  const candidates = await candidateBaseUrls(options);
  for (const baseUrl of candidates) {
    try {
      const discovery = await fetchAgentStudioDiscovery(baseUrl);
      const verified = await verifyAgentStudioHandshake(baseUrl, discovery);
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
    reason: "No signed AgentStudio MCP hub was discovered on this device."
  };
}

async function optionsWithDiscoveredBaseUrl(options = {}) {
  const discovered = await discoverAgentStudioHub(options);
  if (!discovered.ok) {
    throw new Error(`${discovered.reason} Use --url only if you know the AgentStudio base URL; it will still be handshake-verified.`);
  }
  return {
    ...options,
    "resolved-url": discovered.baseUrl,
    __agentstudioDiscovery: discovered
  };
}

async function publishLaunchctlEnv(env) {
  if (process.platform !== "darwin") {
    return false;
  }
  for (const [name, value] of Object.entries(env)) {
    await run("launchctl", ["setenv", name, value], { allowFailure: true });
  }
  return true;
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
        clientInfo: { name: "agentstudio-mcp-connector", version: packageJson.version }
      }
    })
  });
  if (!initialize.ok || initialize.payload?.result?.serverInfo?.name !== "AgentStudio") {
    throw new Error(`AgentStudio MCP is not available at ${baseUrl}/mcp.`);
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
  if (
    !toolsList.ok
    || !health.ok
    || tools.length !== 1
    || tools[0]?.name !== MCP_STABLE_TOOL_NAME
    || health.payload?.result?.structuredContent?.payload?.ok !== true
  ) {
    throw new Error("MCP HTTP verification failed.");
  }
  return {
    toolCount: tools.length,
    stableToolName: tools[0]?.name || "",
    systemHealthOk: health.payload?.result?.structuredContent?.payload?.ok === true
  };
}

async function createCodexPlugin({ marketplaceRoot, baseUrl, tokenEnv }) {
  const pluginRoot = path.join(marketplaceRoot, "plugins", PLUGIN_NAME);
  await fs.mkdir(path.join(pluginRoot, ".codex-plugin"), { recursive: true });
  await writeJson(path.join(pluginRoot, ".codex-plugin", "plugin.json"), {
    name: PLUGIN_NAME,
    version: packageJson.version,
    description: "AgentStudio MCP integration for Codex.",
    author: {
      name: "Unka Y.Y.",
      url: "https://github.com/Unka-Malloc"
    },
    homepage: "https://github.com/Unka-Malloc/AgentStudio",
    repository: "https://github.com/Unka-Malloc/AgentStudio",
    license: "GPL-3.0-or-later",
    keywords: ["agentstudio", "mcp", "workspace", "knowledge"],
    mcpServers: "./.mcp.json",
    interface: {
      displayName: "AgentStudio MCP",
      shortDescription: "Connect Codex to AgentStudio MCP",
      longDescription: "Use the AgentStudio HTTP MCP endpoint through the stable agentstudio.call tool.",
      developerName: "Unka-Malloc",
      category: "Coding",
      capabilities: ["Interactive", "Read", "Write"],
      websiteURL: "https://github.com/Unka-Malloc/AgentStudio",
      privacyPolicyURL: "https://github.com/Unka-Malloc/AgentStudio",
      termsOfServiceURL: "https://github.com/Unka-Malloc/AgentStudio",
      defaultPrompt: ["Use AgentStudio MCP through the stable agentstudio.call tool"],
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
        note: "AgentStudio HTTP MCP service. Token is provided through AGENTSTUDIO_MCP_TOKEN by the connector installer."
      }
    }
  });
  await writeJson(path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json"), {
    name: MARKETPLACE_NAME,
    interface: {
      displayName: "AgentStudio Local"
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
  await run(codexBin, ["plugin", "add", `${PLUGIN_NAME}@${MARKETPLACE_NAME}`]);
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
    plugin: `${PLUGIN_NAME}@${MARKETPLACE_NAME}`,
    pluginRoot: plugin.pluginRoot,
    marketplacePath: plugin.marketplacePath,
    mcpGet: mcpGet.stdout
  };
}

async function createGeminiExtension({ extensionRoot, baseUrl, token }) {
  await writeJson(path.join(extensionRoot, "gemini-extension.json"), {
    name: GEMINI_EXTENSION_NAME,
    version: packageJson.version,
    description: "Connect Gemini CLI to the AgentStudio MCP service.",
    mcpServers: {
      [MCP_SERVER_NAME]: {
        httpUrl: `${baseUrl}/mcp`,
        headers: {
          "X-AgentStudio-Api-Key": token
        },
        timeout: HTTP_TIMEOUT_MS
      }
    }
  });
  await writeText(
    path.join(extensionRoot, "README.md"),
    "# AgentStudio MCP\n\nGemini CLI extension generated by the `agentstudio-mcp` connector release package.\n"
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
    `X-AgentStudio-Api-Key: ${token}`,
    "--timeout",
    String(HTTP_TIMEOUT_MS),
    "--trust",
    "--description",
    "AgentStudio HTTP MCP service.",
    MCP_SERVER_NAME,
    `${baseUrl}/mcp`
  ]);
  const list = await run(geminiBin, ["mcp", "list"]);
  const listOutput = `${list.stdout}\n${list.stderr}`;
  if (!listOutput.includes(MCP_SERVER_NAME)) {
    throw new Error("Gemini CLI MCP list does not include agentstudio after install.");
  }
  return {
    installMode: "gemini-release-mcp-cli",
    extensionRoot,
    mcpListHasAgentStudio: true
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
        "X-AgentStudio-Api-Key": token
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
    mcpListHasAgentStudio: list.stdout.includes(MCP_SERVER_NAME) || list.stderr.includes(MCP_SERVER_NAME)
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
    `X-AgentStudio-Api-Key: ${token}`,
    "--timeout",
    String(HTTP_TIMEOUT_MS),
    MCP_SERVER_NAME,
    `${baseUrl}/mcp`
  ]);
  const get = await run(copilotBin, ["mcp", "get", MCP_SERVER_NAME]);
  return {
    installMode: "copilot-release-mcp-cli",
    mcpGetHasAgentStudio: get.stdout.includes(MCP_SERVER_NAME) || get.stdout.includes(`${baseUrl}/mcp`)
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
        "X-AgentStudio-Api-Key": token
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
  const url = `${vmBaseUrl(baseUrl)}/mcp`;
  const config = {
    type: "http",
    url,
    headers: {
      "X-AgentStudio-Api-Key": token
    },
    timeout: HTTP_TIMEOUT_MS,
    enabled: true
  };
  await run(orbBin, ["-m", vmName, "-u", vmUser, openclawBin, "mcp", "set", MCP_SERVER_NAME, JSON.stringify(config)]);
  const show = await run(orbBin, ["-m", vmName, "-u", vmUser, openclawBin, "mcp", "show", MCP_SERVER_NAME]);
  return {
    installMode: "openclaw-release-mcp-cli",
    vm: vmName,
    vmUser,
    url,
    mcpShowHasAgentStudio: show.stdout.includes(MCP_SERVER_NAME) || show.stdout.includes(url)
  };
}

async function installHermes({ baseUrl, token, orbBin, vmName, vmUser, hermesBin }) {
  const url = `${vmBaseUrl(baseUrl)}/mcp`;
  const script = [
    "set -e",
    "IFS= read -r token",
    "export MCP_AGENTSTUDIO_API_KEY=\"$token\"",
    "if [ -d \"$HOME/.hermes/hermes-agent\" ]; then",
    "  cd \"$HOME/.hermes/hermes-agent\"",
    "  if [ -f venv/bin/activate ]; then . venv/bin/activate; fi",
    "  python - <<'PY'",
    "import os",
    "from hermes_cli.config import save_env_value",
    "save_env_value('MCP_AGENTSTUDIO_API_KEY', os.environ['MCP_AGENTSTUDIO_API_KEY'])",
    "PY",
    "fi",
    "printf 'y\\n' | \"$HERMES_BIN\" mcp remove agentstudio >/dev/null 2>&1 || true",
    "printf 'y\\ny\\n' | \"$HERMES_BIN\" mcp add agentstudio --url \"$AGENTSTUDIO_URL\" --auth header"
  ].join("\n");
  await runWithInput(orbBin, [
    "-m",
    vmName,
    "-u",
    vmUser,
    "env",
    `HERMES_BIN=${hermesBin}`,
    `AGENTSTUDIO_URL=${url}`,
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
    "server = cfg.setdefault('mcp_servers', {}).setdefault('agentstudio', {})",
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
    mcpListHasAgentStudio: listOutput.includes(MCP_SERVER_NAME),
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
    schemaVersion: "agentstudio.mcp.device-hub.v1",
    generatedAt: new Date().toISOString(),
    discovery: {
      strategy: "shared-device-hub",
      localEntry: {
        type: "agentstudio-mcp-discover-local",
        command: discoverCommand,
        registryFile: discoveryPath
      },
      preferredHttpDiscoveryUrl: `${baseUrl}/.well-known/agentstudio/mcp.json`,
      preferredApiDiscoveryUrl: `${baseUrl}/api/mcp/discovery`,
      registryFile: discoveryPath,
      localFiles: [discoveryPath],
      env,
      lookupOrder: [
        "agentstudio-mcp discover-local",
        "AGENTSTUDIO_MCP_URL",
        "AGENTSTUDIO_MCP_DISCOVERY_URL",
        "AGENTSTUDIO_MCP_DISCOVERY_FILE",
        "signed local port scan"
      ]
    },
    servers: {
      [MCP_SERVER_NAME]: {
        name: "AgentStudio",
        transport: "streamable-http",
        httpUrl: `${baseUrl}/mcp`,
        vmHttpUrl: `${parsed.protocol}//host.orb.internal:${port}/mcp`,
        discoveryUrl: `${baseUrl}/.well-known/agentstudio/mcp.json`,
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
          acceptedHeaders: ["Authorization: Bearer <token>", "X-AgentStudio-Api-Key"],
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
    mcpListHasAgentStudio: list.stdout.includes(MCP_SERVER_NAME) || list.stderr.includes(MCP_SERVER_NAME)
  };
}

async function uninstallCopilot({ copilotBin }) {
  const remove = await run(copilotBin, ["mcp", "remove", MCP_SERVER_NAME], { allowFailure: true });
  return {
    uninstallMode: "copilot-release-mcp-cli",
    removedMcp: remove.ok
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
  const remove = await run(orbBin, [
    "-m",
    vmName,
    "-u",
    vmUser,
    openclawBin,
    "mcp",
    "unset",
    MCP_SERVER_NAME
  ], { allowFailure: true });
  const show = await run(orbBin, [
    "-m",
    vmName,
    "-u",
    vmUser,
    openclawBin,
    "mcp",
    "show",
    MCP_SERVER_NAME
  ], { allowFailure: true });
  return {
    uninstallMode: "openclaw-release-mcp-cli",
    vm: vmName,
    vmUser,
    removedMcp: remove.ok,
    mcpShowHasAgentStudio: show.ok && show.stdout.includes(MCP_SERVER_NAME)
  };
}

async function uninstallHermes({ orbBin, vmName, vmUser, hermesBin }) {
  const script = [
    "set -e",
    "printf 'y\\n' | \"$HERMES_BIN\" mcp remove agentstudio >/dev/null 2>&1 || true",
    "if [ -d \"$HOME/.hermes/hermes-agent\" ]; then",
    "  cd \"$HOME/.hermes/hermes-agent\"",
    "  if [ -f venv/bin/activate ]; then . venv/bin/activate; fi",
    "  python - <<'PY'",
    "from hermes_cli.config import load_config, save_config",
    "cfg = load_config()",
    "cfg.get('mcp_servers', {}).pop('agentstudio', None)",
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
    mcpListHasAgentStudio: listOutput.includes(MCP_SERVER_NAME)
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
      ? {
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
      ? {
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
    schemaVersion: "agentstudio.mcp.device-hub.v1",
    generatedAt: new Date().toISOString(),
    discovery: {
      strategy: "shared-device-hub",
      localEntry: {
        type: "agentstudio-mcp-discover-local",
        command: `npx ${packageJson.name}@${packageJson.version} discover-local`,
        registryFile: discoveryPath
      },
      registryFile: discoveryPath,
      localFiles: [discoveryPath],
      env: {},
      lookupOrder: [
        "agentstudio-mcp discover-local",
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
    await run("launchctl", ["unsetenv", AGENTSTUDIO_MCP_URL_ENV], { allowFailure: true });
    await run("launchctl", ["unsetenv", AGENTSTUDIO_MCP_DISCOVERY_URL_ENV], { allowFailure: true });
    await run("launchctl", ["unsetenv", AGENTSTUDIO_MCP_DISCOVERY_FILE_ENV], { allowFailure: true });
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
    const discovered = await discoverAgentStudioHub({ ...options, url });
    if (!discovered.ok) {
      throw new Error(`Failed to verify AgentStudio MCP server at ${url}: ${discovered.reason}`);
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
      throw new Error(`No AgentStudio MCP server profile named ${name}.`);
    }
    const discovered = await discoverAgentStudioHub({ ...options, url: profile.baseUrl });
    if (!discovered.ok) {
      throw new Error(`Failed to verify AgentStudio MCP server profile ${name}: ${discovered.reason}`);
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
    const discovered = await discoverAgentStudioHub(options);
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

async function commandExists(command) {
  const value = String(command || "").trim();
  if (!value) {
    return false;
  }
  if (path.isAbsolute(value) || value.includes(path.sep)) {
    return pathExists(value);
  }
  const result = await run("bash", ["-lc", `command -v ${shellQuote(value)}`], { allowFailure: true });
  return result.ok && result.stdout.trim().length > 0;
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
  const result = await run(orbBin, ["list"], { allowFailure: true });
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

async function detectOrbCommand({ orbBin, vmName, vmUser, command }) {
  const result = await run(orbBin, [
    "-m",
    vmName,
    "-u",
    vmUser,
    "bash",
    "-lc",
    `command -v ${shellQuote(command)}`
  ], { allowFailure: true });
  return {
    ok: result.ok && result.stdout.trim().length > 0,
    path: result.stdout.trim().split(/\r?\n/)[0] || ""
  };
}

async function detectClawCompatibleTargets(settings) {
  const vmNames = await detectOrbVms(settings.orbBin);
  const candidates = [];
  const commandNames = ["openclaw", "ironclaw", "zeroclaw"];
  for (const vmName of vmNames) {
    const userCandidates = uniqueValues([settings.openclawVmUser, settings.hermesVmUser, vmName]);
    for (const vmUser of userCandidates) {
      for (const commandName of commandNames) {
        const detected = await detectOrbCommand({
          orbBin: settings.orbBin,
          vmName,
          vmUser,
          command: commandName
        });
        if (!detected.ok) {
          continue;
        }
        const capability = await run(settings.orbBin, [
          "-m",
          vmName,
          "-u",
          vmUser,
          detected.path || commandName,
          "mcp",
          "--help"
        ], { allowFailure: true });
        const output = `${capability.stdout}\n${capability.stderr}`.toLowerCase();
        if (!output.includes("mcp")) {
          continue;
        }
        candidates.push({
          id: `claw-compatible:${vmName}:${vmUser}:${detected.path || commandName}`,
          target: "openclaw",
          label: `${commandName} (${vmName})`,
          status: "detected",
          detail: `claw-compatible MCP CLI at ${detected.path || commandName}, user ${vmUser}`,
          optionOverrides: {
            "openclaw-vm": vmName,
            "openclaw-user": vmUser,
            "openclaw-bin": detected.path || commandName
          }
        });
      }
    }
  }
  return candidates;
}

async function scanInstallTargets(options = {}) {
  const settings = installerOptions(options);
  const candidates = [];
  const codexDetected = await commandExists(settings.codexBin);
  candidates.push({
    id: "codex",
    target: "codex",
    label: targetLabel("codex"),
    status: codexDetected ? "detected" : "not-detected",
    detail: codexDetected ? settings.codexBin : "Codex CLI path not found"
  });

  const geminiDetected = await commandExists(settings.geminiBin);
  candidates.push({
    id: "gemini-cli",
    target: "gemini-cli",
    label: targetLabel("gemini-cli"),
    status: geminiDetected ? "detected" : "not-detected",
    detail: geminiDetected ? settings.geminiBin : "gemini command not found"
  });

  const copilotDetected = await commandExists(settings.copilotBin);
  candidates.push({
    id: "copilot",
    target: "copilot",
    label: targetLabel("copilot"),
    status: copilotDetected ? "detected" : "not-detected",
    detail: copilotDetected ? settings.copilotBin : "copilot command not found"
  });

  const kiloDetected = await commandExists(settings.kiloBin);
  const kiloConfigExists = await pathExists(settings.kiloConfigPath);
  candidates.push({
    id: "kilo-code",
    target: "kilo-code",
    label: targetLabel("kilo-code"),
    status: kiloDetected || kiloConfigExists ? "detected" : "not-detected",
    detail: kiloDetected ? settings.kiloBin : kiloConfigExists ? settings.kiloConfigPath : "kilo command/config not found"
  });

  const antigravityConfigDir = path.dirname(settings.antigravityConfigPath);
  const antigravityDetected = await pathExists(settings.antigravityConfigPath) || await directoryExists(antigravityConfigDir);
  candidates.push({
    id: "antigravity",
    target: "antigravity",
    label: targetLabel("antigravity"),
    status: antigravityDetected ? "detected" : "not-detected",
    detail: antigravityDetected ? settings.antigravityConfigPath : "Antigravity config path not found yet"
  });

  const openClawDetected = await detectOrbCommand({
    orbBin: settings.orbBin,
    vmName: settings.openclawVm,
    vmUser: settings.openclawVmUser,
    command: settings.openclawBin
  });
  candidates.push({
    id: "openclaw",
    target: "openclaw",
    label: `${targetLabel("openclaw")} (${settings.openclawVm})`,
    status: openClawDetected.ok ? "detected" : "not-detected",
    detail: openClawDetected.ok ? openClawDetected.path || settings.openclawBin : `OrbStack ${settings.openclawVm}:${settings.openclawVmUser} not detected`
  });

  const hermesDetected = await detectOrbCommand({
    orbBin: settings.orbBin,
    vmName: settings.hermesVm,
    vmUser: settings.hermesVmUser,
    command: settings.hermesBin
  });
  candidates.push({
    id: "hermes",
    target: "hermes",
    label: `${targetLabel("hermes")} (${settings.hermesVm})`,
    status: hermesDetected.ok ? "detected" : "not-detected",
    detail: hermesDetected.ok ? hermesDetected.path || settings.hermesBin : `OrbStack ${settings.hermesVm}:${settings.hermesVmUser} not detected`
  });

  if (!options["no-scan"]) {
    const dynamicClawTargets = await detectClawCompatibleTargets(settings);
    const existingKeys = new Set(candidates.map((candidate) => `${candidate.target}:${candidate.detail}`));
    for (const candidate of dynamicClawTargets) {
      const key = `${candidate.target}:${candidate.detail}`;
      if (!existingKeys.has(key)) {
        candidates.push(candidate);
        existingKeys.add(key);
      }
    }
  }

  return {
    ok: true,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    baseUrl: settings.baseUrl,
    mcpUrl: settings.baseUrl ? `${settings.baseUrl}/mcp` : "",
    candidates
  };
}

function installerOptions(options) {
  const sharedVmName = option(options, "vm", "");
  const sharedVmUser = option(options, "vm-user", "");
  return {
    baseUrl: normalizeBaseUrl(option(options, "resolved-url", explicitBaseUrl(options))),
    tokenEnv: String(option(options, "token-env", DEFAULT_TOKEN_ENV)),
    codexBin: String(option(options, "codex-bin", process.env.CODEX_CLI_PATH || DEFAULT_CODEX_BIN)),
    geminiBin: String(option(options, "gemini-bin", process.env.GEMINI_CLI_PATH || DEFAULT_GEMINI_BIN)),
    kiloBin: String(option(options, "kilo-bin", process.env.KILO_CLI_PATH || DEFAULT_KILO_BIN)),
    copilotBin: String(option(options, "copilot-bin", process.env.COPILOT_CLI_PATH || DEFAULT_COPILOT_BIN)),
    orbBin: String(option(options, "orb-bin", process.env.ORB_CLI_PATH || DEFAULT_ORB_BIN)),
    marketplaceRoot: path.resolve(String(option(options, "marketplace-root", path.join(os.homedir(), ".agentstudio", "codex-plugin-marketplace")))),
    geminiExtensionRoot: path.resolve(String(option(options, "gemini-extension-root", path.join(os.homedir(), ".agentstudio", "gemini-extensions", PLUGIN_NAME)))),
    kiloConfigPath: path.resolve(String(option(options, "kilo-config", path.join(os.homedir(), ".config", "kilo", "kilo.json")))),
    antigravityConfigPath: path.resolve(String(option(options, "antigravity-config", path.join(os.homedir(), ".gemini", "antigravity", "mcp_config.json")))),
    openclawVm: String(option(options, "openclaw-vm", sharedVmName || "kate")),
    openclawVmUser: String(option(options, "openclaw-user", sharedVmUser || "kate")),
    openclawBin: String(option(options, "openclaw-bin", "/home/kate/.npm-global/bin/openclaw")),
    hermesVm: String(option(options, "hermes-vm", sharedVmName || "serena")),
    hermesVmUser: String(option(options, "hermes-user", sharedVmUser || "serena")),
    hermesBin: String(option(options, "hermes-bin", "/home/serena/.local/bin/hermes"))
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

function renderInstallMenu({ candidates, index, selectedIds, baseUrl, message = "" }) {
  const rows = [
    "\x1b[2J\x1b[H",
    "AgentStudio MCP install",
    "",
    `MCP: ${baseUrl}/mcp`,
    "Use Up/Down or j/k, Space to toggle, a to toggle detected, Enter to install, q to cancel.",
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
  const entered = await promptLine(`AgentStudio MCP token (${tokenEnv}): `, { hidden: true });
  if (!entered) {
    throw new Error(`Missing token. Provide --token-stdin, --token, or ${tokenEnv}.`);
  }
  return entered;
}

async function requestLocalMcpGrant(options, { targets = [] } = {}) {
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
      label: `AgentStudio MCP ${targetList.length ? targetList.map(targetLabel).join(", ") : "local agent"}`,
      connectorVersion: packageJson.version
    })
  });
  if (!response.ok || !response.payload?.token) {
    const reason = response.payload?.error?.message || response.payload?.error || `HTTP ${response.status}`;
    throw new Error(`Failed to request local AgentStudio MCP token: ${reason}`);
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

async function resolveInstallToken(options, { targets = [] } = {}) {
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
  return requestLocalMcpGrant(options, { targets });
}

async function resolveHubForInstall(options) {
  const discovered = await discoverAgentStudioHub(options);
  if (discovered.ok) {
    return {
      ...options,
      "resolved-url": discovered.baseUrl,
      __agentstudioDiscovery: discovered
    };
  }
  if (!canUseInstallTui(options)) {
    throw new Error(`${discovered.reason} Run agentstudio-mcp server-config --set --url <agentstudio-url>, or rerun install in a TTY and choose manual configuration.`);
  }
  console.log("No signed AgentStudio MCP service was discovered on this device.");
  console.log("The installer will not write any agent client config until a server identity signature is verified.");
  console.log("");
  const answer = await promptLine("Choose: [c]onfigure server URL now, [s]kip, manually configure later [s]: ");
  if (!answer || answer.toLowerCase().startsWith("s")) {
    return {
      ...options,
      __agentstudioSkippedDiscovery: {
        ok: false,
        skipped: true,
        attempts: discovered.attempts,
        reason: "Skipped. Manually configure later with agentstudio-mcp server-config --set --url <agentstudio-url>."
      }
    };
  }
  if (!answer.toLowerCase().startsWith("c")) {
    return resolveHubForInstall(options);
  }
  const url = await promptLine("AgentStudio server URL: ");
  const manual = await discoverAgentStudioHub({ ...options, url });
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
    __agentstudioDiscovery: manual
  };
}

async function installTargets({ options, targets, token, tokenInfo = null, optionOverrides = {} }) {
  const mergedOptions = {
    ...options,
    ...optionOverrides
  };
  const settings = installerOptions(mergedOptions);
  const verify = !mergedOptions["no-verify"];

  await ensureService(settings.baseUrl);

  const installed = {};
  for (const target of targets) {
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
      clientResult = await installGemini({
        baseUrl: settings.baseUrl,
        token,
        geminiBin: settings.geminiBin,
        extensionRoot: settings.geminiExtensionRoot
      });
    } else if (target === "kilo-code") {
      clientResult = await installKilo({
        baseUrl: settings.baseUrl,
        token,
        kiloBin: settings.kiloBin,
        kiloConfigPath: settings.kiloConfigPath
      });
    } else if (target === "copilot") {
      clientResult = await installCopilot({
        baseUrl: settings.baseUrl,
        token,
        copilotBin: settings.copilotBin
      });
    } else if (target === "openclaw") {
      clientResult = await installOpenClaw({
        baseUrl: settings.baseUrl,
        token,
        orbBin: settings.orbBin,
        vmName: settings.openclawVm,
        vmUser: settings.openclawVmUser,
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
      ...(clientResult || {}),
      httpVerification
    };
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
    ok: true,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    targets,
    baseUrl: settings.baseUrl,
    discoveryManifest,
    installed: Object.fromEntries(Object.entries(installed).map(([target, value]) => [
      target,
      {
        installMode: value.installMode,
        tokenSource: tokenInfo?.source || "provided",
        tokenPrefix: tokenInfo?.tokenPrefix || redactToken(token),
        httpVerification: value.httpVerification
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
  const tokenInfo = await resolveInstallToken(options, { targets: selectedTargets });
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
  if (resolvedOptions.__agentstudioSkippedDiscovery) {
    return {
      ok: false,
      skipped: true,
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      ...resolvedOptions.__agentstudioSkippedDiscovery
    };
  }
  if (canUseInstallTui(options)) {
    return installTuiCommand(resolvedOptions);
  }
  const targets = parseTargets(option(resolvedOptions, "target", "codex"));
  const tokenInfo = await resolveInstallToken(resolvedOptions, { targets });
  return installTargets({
    options: resolvedOptions,
    targets,
    token: tokenInfo.token,
    tokenInfo
  });
}

async function uninstallCommand(options) {
  const targets = parseTargets(option(options, "target", "codex"));
  const settings = installerOptions(options);
  const uninstalled = {};
  for (const target of targets) {
    if (target === "codex") {
      uninstalled[target] = await uninstallCodex({
        tokenEnv: settings.tokenEnv,
        codexBin: settings.codexBin,
        marketplaceRoot: settings.marketplaceRoot
      });
    } else if (target === "gemini-cli") {
      uninstalled[target] = await uninstallGemini({
        geminiBin: settings.geminiBin,
        extensionRoot: settings.geminiExtensionRoot
      });
    } else if (target === "kilo-code") {
      uninstalled[target] = await uninstallKilo({
        kiloConfigPath: settings.kiloConfigPath,
        kiloBin: settings.kiloBin
      });
    } else if (target === "copilot") {
      uninstalled[target] = await uninstallCopilot({
        copilotBin: settings.copilotBin
      });
    } else if (target === "openclaw") {
      uninstalled[target] = await uninstallOpenClaw({
        orbBin: settings.orbBin,
        vmName: settings.openclawVm,
        vmUser: settings.openclawVmUser,
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
  }
  const discoveryManifest = await writeDeviceUninstall({
    baseUrl: settings.baseUrl,
    uninstalled,
    discoveryPath: discoveryRegistryPath(options)
  });
  return {
    ok: true,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    targets,
    discoveryManifest,
    uninstalled
  };
}

async function registerCommand(options) {
  const resolvedOptions = await optionsWithDiscoveredBaseUrl(options);
  const settings = installerOptions(resolvedOptions);
  const profile = await writeServerConfigProfile({
    options: resolvedOptions,
    name: String(option(resolvedOptions, "name", "default")).trim() || "default",
    discovered: resolvedOptions.__agentstudioDiscovery,
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
      command: "agentstudio-mcp discover-local",
      registryFile: discoveryManifest
    },
    localFiles,
    env,
    clientInstall: `agentstudio-mcp install --target <client>`,
    verifiedHandshake: resolvedOptions.__agentstudioDiscovery?.handshake?.payload?.identity?.keyId || "",
    serverConfig: profile.profile,
    note: "Discovered and registered the signed AgentStudio MCP endpoint without installing it into any client."
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
  const discovered = await discoverAgentStudioHub(options);
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
  const discovered = resolvedOptions.__agentstudioDiscovery || null;
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
      httpUrl: discovery.payload?.mcpServers?.agentstudio?.httpUrl || ""
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
      reason: "Set AGENTSTUDIO_MCP_TOKEN, pass --token, or use --token-stdin to verify tools/list."
    },
    systemHealth: {
      ok: false,
      skipped: true,
      healthy: false,
      reason: "Set AGENTSTUDIO_MCP_TOKEN, pass --token, or use --token-stdin to verify tools/call system.health."
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
    throw new Error(`AgentStudio MCP discovery failed: HTTP ${discovery.status}`);
  }
  return {
    ...discovery.payload,
    signedHandshake: {
      ok: true,
      identityKeyId: resolvedOptions.__agentstudioDiscovery?.handshake?.payload?.identity?.keyId || ""
    }
  };
}

function emitResult(result, options) {
  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (options.version || command === "version" || command === "--version") {
    emitResult({
      packageName: packageJson.name,
      packageVersion: packageJson.version,
      stableToolName: MCP_STABLE_TOOL_NAME,
      interfaceVersion: MCP_INTERFACE_VERSION
    }, options);
    return;
  }
  if (options.help || command === "help" || !command) {
    console.log(usage());
    return;
  }
  if (command === "install") {
    emitResult(await installCommand(options), options);
    return;
  }
  if (command === "register") {
    emitResult(await registerCommand(options), options);
    return;
  }
  if (command === "scan") {
    const discovered = await discoverAgentStudioHub(options);
    const scanOptions = discovered.ok
      ? { ...options, "resolved-url": discovered.baseUrl, __agentstudioDiscovery: discovered }
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
    }, options);
    return;
  }
  if (command === "discover-local") {
    const result = await discoverLocalCommand(options);
    emitResult(result, options);
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }
  if (command === "uninstall") {
    emitResult(await uninstallCommand(options), options);
    return;
  }
  if (command === "doctor") {
    emitResult(await doctorCommand(options), options);
    return;
  }
  if (command === "discover") {
    emitResult(await discoverCommand(options), options);
    return;
  }
  if (command === "server-config") {
    emitResult(await serverConfigCommand(options), options);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
