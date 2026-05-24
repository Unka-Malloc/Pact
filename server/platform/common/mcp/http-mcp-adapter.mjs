import { sendJson } from "../console/http/http-utils.mjs";
import {
  buildMcpHandshakePayload,
  publicMcpIdentity,
  signMcpHandshake
} from "./identity.mjs";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const DEFAULT_TIMEOUT_MS = 300_000;
export const MCP_INTERFACE_VERSION = "pact.mcp.v1";
export const MCP_TOOLSET_VERSION = "2026-05-24.3";
export const MCP_STABLE_TOOL_NAME = "pact.call";
export const MCP_KNOWLEDGE_TOOL_NAME = "pact.knowledge";
export const MCP_WORKSPACE_TOOL_NAME = "pact.workspace";
export const MCP_LIST_TOOL_NAME = "pact.list";
export const MCP_SKILL_TOOL_NAME = "pact.skill";
export const MCP_HELP_TOOL_NAME = "pact.help";

const CATEGORIZED_TOOL_NAMES = new Set([
  MCP_KNOWLEDGE_TOOL_NAME,
  MCP_WORKSPACE_TOOL_NAME,
  MCP_LIST_TOOL_NAME,
  MCP_SKILL_TOOL_NAME,
  MCP_HELP_TOOL_NAME
]);

const activeSseConnections = new Set();

const LOCAL_GRANT_RISK_RANK = Object.freeze({
  read_only: 0,
  safe_write: 1,
  repair_write: 2,
  destructive: 3
});

export const MCP_SERVER_NAME = "pact-mcp-server";
export const MCP_SERVER_VERSION = "0.0.1";
export const MCP_CONNECTOR_PACKAGE_NAME = "pact-mcp-connector";
export const MCP_CONNECTOR_VERSION = "0.0.1";
export const MCP_CONNECTOR_GITHUB_REPO = "Unka-Malloc/Pact";
export const PACT_MCP_URL_ENV = "PACT_MCP_URL";
export const PACT_MCP_DISCOVERY_URL_ENV = "PACT_MCP_DISCOVERY_URL";
export const PACT_MCP_DISCOVERY_FILE_ENV = "PACT_MCP_DISCOVERY_FILE";
export const PACT_MCP_DISCOVERY_FILE = "~/.pact/mcp/servers.json";

function jsonRpcResult(id, result = {}) {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function jsonRpcError(id, code, message, data = {}) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      data
    }
  };
}

function jsonRpcNotification(method, params = {}) {
  return {
    jsonrpc: "2.0",
    method,
    params
  };
}

function normalizedLocalHost(value) {
  const host = String(value || "").trim().toLowerCase();
  return host === "::1" || host === "[::1]" ? "localhost" : host.split(":")[0];
}

function isAllowedOrigin(request) {
  const origin = String(request?.headers?.origin || "").trim();
  if (!origin) {
    return true;
  }
  try {
    const parsed = new URL(origin);
    const host = normalizedLocalHost(parsed.hostname);
    return new Set(["localhost", "127.0.0.1", "host.orb.internal"]).has(host);
  } catch {
    return false;
  }
}

function normalizeApiKeyHeader(request) {
  const headers = request.headers || {};
  if (!headers.authorization && !headers["x-pact-tool-token"] && headers["x-pact-api-key"]) {
    headers["x-pact-tool-token"] = String(headers["x-pact-api-key"] || "").trim();
  }
}

function isLocalMcpPairingRequest(request) {
  const address = String(request?.socket?.remoteAddress || "").toLowerCase();
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1" ||
    address === "localhost"
  );
}

function normalizeGrantTargets(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 16);
}

function normalizeGrantValues(value, limit = 64) {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, limit);
}

function hasSafetyConfirm(request = null) {
  const value = String(
    request?.headers?.["x-pact-safety-confirm"] ||
      request?.headers?.["x-pact-confirm"] ||
      ""
  ).toLowerCase();
  return ["1", "true", "yes"].includes(value);
}

function localGrantRiskRank(risk = "read_only") {
  return LOCAL_GRANT_RISK_RANK[String(risk || "read_only")] ?? 0;
}

function parseRequestBody(requestBody) {
  if (!requestBody || requestBody.length === 0) {
    return {};
  }
  return JSON.parse(requestBody.toString("utf8"));
}

function publicMcpTool(tool) {
  const inputSchema = publicMcpInputSchema(tool.inputSchema || { type: "object" });
  const workspaceHint = schemaMentionsWorkspaceId(tool.inputSchema)
    ? " MCP clients should use workspaceRef, workspaceIndex, or workspaceName instead of internal workspaceId."
    : "";
  return {
    name: tool.id,
    title: tool.label || tool.id,
    description: `${tool.description || tool.label || tool.id}${workspaceHint}`,
    inputSchema,
    annotations: {
      readOnlyHint: tool.readOnly !== false,
      destructiveHint: tool.destructive === true
    }
  };
}

function schemaMentionsWorkspaceId(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(schemaMentionsWorkspaceId);
  }
  return Object.entries(value).some(([key, child]) =>
    /workspaceId$/i.test(key) || schemaMentionsWorkspaceId(child)
  );
}

function publicMcpInputSchema(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(publicMcpInputSchema);
  }
  const next = { ...value };
  if (Array.isArray(next.required)) {
    next.required = next.required.filter((item) => !/workspaceId$/i.test(String(item || "")));
  }
  if (next.properties && typeof next.properties === "object" && !Array.isArray(next.properties)) {
    const properties = {};
    for (const [key, child] of Object.entries(next.properties)) {
      if (/workspaceId$/i.test(key)) {
        const refKey = key.replace(/Id$/i, "Ref");
        properties[refKey] = {
          type: "string",
          description: "Public Pact MCP workspace reference, for example 'workspace-1'. Discover it with operation 'pact.agentWorkspace.list'."
        };
        if (key === "workspaceId") {
          properties.workspaceIndex = {
            type: "integer",
            description: "Public Pact MCP workspace index from operation 'pact.agentWorkspace.list', for example 1."
          };
          properties["workspace-index"] = {
            type: "integer",
            description: "Alias for workspaceIndex. Public Pact MCP workspace index from operation 'pact.agentWorkspace.list', for example 1."
          };
          properties.workspaceName = {
            type: "string",
            description: "Workspace title/name from operation 'pact.agentWorkspace.list'."
          };
          properties["workspace-name"] = {
            type: "string",
            description: "Alias for workspaceName. Workspace title/name from operation 'pact.agentWorkspace.list'."
          };
        }
        continue;
      }
      properties[key] = publicMcpInputSchema(child);
    }
    next.properties = properties;
  }
  for (const key of ["items", "oneOf", "anyOf", "allOf"]) {
    if (next[key]) {
      next[key] = publicMcpInputSchema(next[key]);
    }
  }
  return next;
}

function workspaceName(workspace = {}) {
  return String(workspace.name || workspace.title || workspace.workspaceName || "").trim();
}

function publicWorkspaceRef(index) {
  return `workspace-${index + 1}`;
}

function workspaceDirectoryFromWorkspaces(workspaces = []) {
  const entries = [];
  const byId = new Map();
  const byRef = new Map();
  const byName = new Map();
  workspaces.forEach((workspace, index) => {
    const id = String(workspace?.workspaceId || "").trim();
    if (!id) {
      return;
    }
    const entry = {
      id,
      ref: publicWorkspaceRef(index),
      index: index + 1,
      name: workspaceName(workspace)
    };
    entries.push(entry);
    byId.set(id, entry);
    byRef.set(entry.ref.toLowerCase(), entry);
    byRef.set(String(entry.index), entry);
    if (entry.name) {
      byName.set(entry.name.toLowerCase(), entry);
    }
  });
  return { entries, byId, byRef, byName };
}

function collectWorkspaces(value, output = []) {
  if (!value || typeof value !== "object") {
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectWorkspaces(item, output);
    }
    return output;
  }
  if (Array.isArray(value.workspaces)) {
    output.push(...value.workspaces.filter((item) => item && typeof item === "object"));
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      collectWorkspaces(child, output);
    }
  }
  return output;
}

function executeToolPayload(result = {}) {
  return result.payload?.result !== undefined ? result.payload.result : result.payload;
}

async function loadMcpWorkspaceDirectory({ toolManagementPlatform, request, context = {} }) {
  const result = await toolManagementPlatform.runtime.executeTool({
    toolId: "pact.agentWorkspace.list",
    input: {},
    request,
    context: {
      ...context,
      transport: "mcp",
      internalPurpose: "workspace-reference-resolution"
    }
  });
  if (!result.ok) {
    return workspaceDirectoryFromWorkspaces([]);
  }
  return workspaceDirectoryFromWorkspaces(collectWorkspaces(executeToolPayload(result)));
}

function resolveWorkspaceReference(directory, value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  if (directory.byId.has(raw)) {
    return raw;
  }
  const byRef = directory.byRef.get(raw.toLowerCase());
  if (byRef) {
    return byRef.id;
  }
  const byName = directory.byName.get(raw.toLowerCase());
  if (byName) {
    return byName.id;
  }
  return "";
}

function inputMayNeedWorkspaceResolution(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(inputMayNeedWorkspaceResolution);
  }
  return Object.entries(value).some(([key, child]) => {
    if (/workspace(Ref|Refs|Index|Name)$/i.test(key) || /^workspace-(ref|refs|index|name)$/i.test(key)) {
      return true;
    }
    if (/workspaceId$/i.test(key) && typeof child === "string" && !String(child).startsWith("workspace_")) {
      return true;
    }
    return inputMayNeedWorkspaceResolution(child);
  });
}

function resolveWorkspaceReferencesInInput(value, directory) {
  if (!value || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveWorkspaceReferencesInInput(item, directory));
  }
  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (/workspaceRef$/i.test(key)) {
      const idKey = key.replace(/Ref$/i, "Id");
      const resolved = resolveWorkspaceReference(directory, child);
      if (resolved) {
        next[idKey] = resolved;
      }
      next[key] = child;
      continue;
    }
    if (/workspaceRefs$/i.test(key) && Array.isArray(child)) {
      const idKey = key.replace(/Refs$/i, "Ids");
      const resolved = child.map((item) => resolveWorkspaceReference(directory, item)).filter(Boolean);
      if (resolved.length) {
        next[idKey] = resolved;
      }
      next[key] = child;
      continue;
    }
    if (/workspaceIndex$/i.test(key) || /workspaceName$/i.test(key)) {
      const resolved = resolveWorkspaceReference(directory, child);
      if (resolved && !next.workspaceId) {
        next.workspaceId = resolved;
      }
      next[key] = child;
      continue;
    }
    if (/^workspace-(index|name)$/i.test(key)) {
      const resolved = resolveWorkspaceReference(directory, child);
      if (resolved && !next.workspaceId) {
        next.workspaceId = resolved;
      }
      next[key] = child;
      continue;
    }
    if (/workspaceId$/i.test(key) && typeof child === "string") {
      next[key] = resolveWorkspaceReference(directory, child) || child;
      continue;
    }
    next[key] = resolveWorkspaceReferencesInInput(child, directory);
  }
  return next;
}

async function resolveMcpWorkspaceInput({ input, toolManagementPlatform, request, context }) {
  if (!inputMayNeedWorkspaceResolution(input)) {
    return { input, workspaceDirectory: null };
  }
  const workspaceDirectory = await loadMcpWorkspaceDirectory({ toolManagementPlatform, request, context });
  return {
    input: resolveWorkspaceReferencesInInput(input, workspaceDirectory),
    workspaceDirectory
  };
}

function isInternalAbsolutePath(value) {
  const text = String(value || "");
  return (
    /^\/(?:Users|home|root|private|var|tmp|opt|usr|Volumes)\//.test(text) ||
    /^[A-Za-z]:[\\/]/.test(text)
  );
}

function valueContainsWorkspaceId(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(valueContainsWorkspaceId);
  }
  return Object.entries(value).some(([key, child]) =>
    /workspaceId$/i.test(key) || valueContainsWorkspaceId(child)
  );
}

function sanitizeMcpOutputValue(value, directory = workspaceDirectoryFromWorkspaces([])) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMcpOutputValue(item, directory));
  }
  if (!value || typeof value !== "object") {
    return typeof value === "string" && isInternalAbsolutePath(value) ? "[server-internal-path]" : value;
  }
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (/^(fsPath|absolutePath|rootPath|databasePath|userDataPath)$/i.test(key)) {
      continue;
    }
    if (/path$/i.test(key) && typeof child === "string" && isInternalAbsolutePath(child)) {
      continue;
    }
    if (/ownerUserId$/i.test(key)) {
      continue;
    }
    if (/workspaceIds$/i.test(key) && Array.isArray(child)) {
      const refKey = key.replace(/Ids$/i, "Refs");
      result[refKey] = child.map((item) => {
        const entry = directory.byId.get(String(item || ""));
        return entry?.ref || "workspace-hidden";
      });
      continue;
    }
    if (/workspaceId$/i.test(key)) {
      const refKey = key.replace(/Id$/i, "Ref");
      if (child === null || child === undefined || child === "") {
        result[refKey] = null;
        continue;
      }
      const entry = directory.byId.get(String(child || ""));
      result[refKey] = entry?.ref || "workspace-hidden";
      if (key === "workspaceId" && entry) {
        result.workspaceIndex = entry.index;
        result["workspace-index"] = entry.index;
        result.workspaceName = entry.name;
        result["workspace-name"] = entry.name;
      }
      continue;
    }
    result[key] = sanitizeMcpOutputValue(child, directory);
  }
  if (value.workspaceId && !result.workspaceRef) {
    const entry = directory.byId.get(String(value.workspaceId || ""));
    result.workspaceRef = entry?.ref || "workspace-hidden";
    if (entry) {
      result.workspaceIndex = entry.index;
      result.workspaceName = entry.name;
    }
  }
  if (value.title && !result.workspaceName && value.workspaceId) {
    result.workspaceName = String(value.title || "");
    result["workspace-name"] = String(value.title || "");
  }
  return result;
}

async function publicMcpToolPayload({ payload, workspaceDirectory, toolManagementPlatform, request, context }) {
  const workspaces = collectWorkspaces(payload);
  let directory = workspaces.length ? workspaceDirectoryFromWorkspaces(workspaces) : workspaceDirectory;
  if (!directory && valueContainsWorkspaceId(payload)) {
    directory = await loadMcpWorkspaceDirectory({ toolManagementPlatform, request, context });
  }
  return sanitizeMcpOutputValue(payload, directory || workspaceDirectoryFromWorkspaces([]));
}

function activeMcpTools(toolManagementPlatform) {
  const catalog = toolManagementPlatform?.catalog?.() || { tools: [] };
  return (catalog.tools || [])
    .filter((tool) => tool.status === "active")
    .map(publicMcpTool);
}

function pactCategorizedTools() {
  const commonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["operation"],
    properties: {
      apiVersion: {
        type: "string",
        description: "Pact MCP interface version expected by the caller.",
        default: MCP_INTERFACE_VERSION,
        enum: [MCP_INTERFACE_VERSION]
      },
      operation: {
        type: "string",
        description: "Concrete Pact operation id to execute, for example 'pact.knowledge.health'. Do not use the outlet tool name itself here, such as 'pact.knowledge'. If unsure, first call tool 'pact.help' with operation 'pact.capabilities.list' and then use one returned operations[].name value."
      },
      input: {
        type: "object",
        description: "Operation input payload.",
        additionalProperties: true,
        default: {}
      },
      clientVersion: {
        type: "string",
        description: "Optional client-side integration version for diagnostics."
      }
    }
  };

  const toolMeta = {
    interfaceVersion: MCP_INTERFACE_VERSION,
    toolsetVersion: MCP_TOOLSET_VERSION,
    stableTool: true,
    upgradeNotification: "notifications/tools/list_changed"
  };

  return [
    {
      name: MCP_KNOWLEDGE_TOOL_NAME,
      title: "Pact Knowledge",
      description: "Knowledge outlet/router. Do not call operation='pact.knowledge'. First discover concrete operation ids by calling tool 'pact.help' with operation 'pact.capabilities.list'. Then call this outlet with one returned operations[].name, for example operation='pact.knowledge.health'.",
      inputSchema: commonSchema,
      annotations: { readOnlyHint: true, destructiveHint: false },
      _meta: toolMeta
    },
    {
      name: MCP_WORKSPACE_TOOL_NAME,
      title: "Pact Workspace",
      description: "Workspace outlet/router. Do not call operation='pact.workspace'. First discover concrete operation ids by calling tool 'pact.help' with operation 'pact.capabilities.list'. Then call this outlet with one returned workspace operation id, for example an operation beginning with 'pact.workspace.' or 'pact.agentWorkspace.'.",
      inputSchema: commonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: toolMeta
    },
    {
      name: MCP_LIST_TOOL_NAME,
      title: "Pact Resource Listing",
      description: "Resource listing outlet/router. Do not call operation='pact.list'. First discover concrete operation ids by calling tool 'pact.help' with operation 'pact.capabilities.list'. Then call this outlet with one returned listing/read operation id.",
      inputSchema: commonSchema,
      annotations: { readOnlyHint: true, destructiveHint: false },
      _meta: toolMeta
    },
    {
      name: MCP_SKILL_TOOL_NAME,
      title: "Pact Skill & Tooling",
      description: "Skill and tooling outlet/router. Do not call operation='pact.skill'. First discover concrete operation ids by calling tool 'pact.help' with operation 'pact.capabilities.list'. Then call this outlet with one returned skill/tool operation id.",
      inputSchema: commonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: toolMeta
    },
    {
      name: MCP_HELP_TOOL_NAME,
      title: "Pact Help & Protocol",
      description: "Start here. This help outlet discovers valid Pact operation ids. Call this tool with operation='pact.capabilities.list' and input={}. Then use one returned operations[].name as the operation value for pact.knowledge, pact.workspace, pact.list, pact.skill, or pact.help.",
      inputSchema: commonSchema,
      annotations: { readOnlyHint: true, destructiveHint: false },
      _meta: toolMeta
    }
  ];
}

function mcpVersionInfo() {
  return {
    interfaceVersion: MCP_INTERFACE_VERSION,
    toolsetVersion: MCP_TOOLSET_VERSION,
    serverVersion: MCP_SERVER_VERSION,
    stableToolName: MCP_STABLE_TOOL_NAME,
    categorizedOutlets: Array.from(CATEGORIZED_TOOL_NAMES),
    capabilitiesSummary: "Pact Unified Agent Workspace MCP. Outlets: Knowledge (Distillation/Sharing/Graph), Workspace (Shared Space), List (Resources), Skill (Skills & Tool Management), and Help (Protocol/Discovery).",
    listChanged: true,
    upgradeNotification: "notifications/tools/list_changed",
    connector: {
      packageName: MCP_CONNECTOR_PACKAGE_NAME,
      packageVersion: MCP_CONNECTOR_VERSION
    }
  };
}

function mcpDiscoveryBase({ listenUrl = "", discoveryState = null } = {}) {
  const baseUrl = String(discoveryState?.activeServiceUrl || listenUrl || "").replace(/\/+$/, "");
  let vmBaseUrl = "";
  try {
    const parsed = new URL(baseUrl);
    vmBaseUrl = `${parsed.protocol}//host.orb.internal:${parsed.port || (parsed.protocol === "https:" ? "443" : "80")}`;
  } catch {
    // Keep the conservative default.
  }
  return { baseUrl, vmBaseUrl };
}

export function buildPactMcpDiscovery({ listenUrl = "", discoveryState = null } = {}) {
  const { baseUrl, vmBaseUrl } = mcpDiscoveryBase({ listenUrl, discoveryState });
  const installCommand = `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest register`;
  const clientInstallCommand = `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest install --target <client>`;
  const interactiveInstallCommand = `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest install`;
  const githubOneLineCommand = `/bin/sh -c "$(curl -fsSL https://github.com/${MCP_CONNECTOR_GITHUB_REPO}/releases/latest/download/pact-mcp-install.sh)"`;
  const uninstallCommand = `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest uninstall --target <client>`;
  const doctorCommand = `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest doctor`;
  const discoverCommand = `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest discover-local`;
  const scanCommand = `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest scan --json`;
  return {
    schemaVersion: 1,
    name: "Pact",
    description: "Pact Unified Agent Workspace MCP. Provides five specialized outlets for Knowledge (Distillation/Sharing/Graph), Workspace (Shared Space), Resource Listing, Skill & Tooling, and Protocol Help.",
    interfaceVersion: MCP_INTERFACE_VERSION,
    toolsetVersion: MCP_TOOLSET_VERSION,
    serverVersion: MCP_SERVER_VERSION,
    serverId: discoveryState?.serverId || "",
    stableToolName: MCP_STABLE_TOOL_NAME,
    sharedHub: {
      canonicalMcpUrl: `${baseUrl}/mcp`,
      vmMcpUrl: `${vmBaseUrl}/mcp`,
      clientPolicy: "discover-shared-hub-then-opt-in",
      defaultClientMutation: "none",
      directHttp: true
    },
    localDiscovery: {
      entrypoint: {
        command: discoverCommand,
        registryFile: PACT_MCP_DISCOVERY_FILE,
        schemaVersion: "pact.mcp.device-hub.v1"
      },
      env: {
        [PACT_MCP_URL_ENV]: `${baseUrl}/mcp`,
        [PACT_MCP_DISCOVERY_URL_ENV]: `${baseUrl}/.well-known/pact/mcp.json`,
        [PACT_MCP_DISCOVERY_FILE_ENV]: PACT_MCP_DISCOVERY_FILE
      },
      files: [
        PACT_MCP_DISCOVERY_FILE
      ],
      http: [
        `${baseUrl}/.well-known/pact/mcp.json`,
        `${baseUrl}/api/mcp/discovery`
      ],
      lookupOrder: [
        "pact-mcp discover-local",
        "PACT_MCP_URL",
        "PACT_MCP_DISCOVERY_URL",
        "PACT_MCP_DISCOVERY_FILE",
        "signed local port scan"
      ]
    },
    installer: {
      packageName: MCP_CONNECTOR_PACKAGE_NAME,
      packageVersion: MCP_CONNECTOR_VERSION,
      releaseChannel: "stable",
      githubOneLineCommand,
      oneCommandInstall: githubOneLineCommand,
      installCommand,
      interactiveInstallCommand,
      clientInstallCommand,
      uninstallCommand,
      doctorCommand,
      discoverCommand,
      scanCommand,
      tokenInput: "auto-local-grant-or-stdin-or-env",
      localGrantEndpoint: `${baseUrl}/api/mcp/local-grant`,
      npmExec: `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest`,
      portable: {
        requiresInstalledNode: false,
        strategy: "embedded-node-runtime",
        preferredArchive: "zip",
        bootstrapScript: "pact-mcp-install.sh",
        githubLatestBootstrapUrl: `https://github.com/${MCP_CONNECTOR_GITHUB_REPO}/releases/latest/download/pact-mcp-install.sh`,
        githubOneLineCommand,
        supportsMultiSelect: true,
        releaseAssetPattern: `${MCP_CONNECTOR_PACKAGE_NAME}-${MCP_CONNECTOR_VERSION}-<platform>.zip`,
        tarballReleaseAssetPattern: `${MCP_CONNECTOR_PACKAGE_NAME}-${MCP_CONNECTOR_VERSION}-<platform>.tar.gz`,
        zipInstallEntry: "install.command",
        installCommand: "./pact-mcp register",
        interactiveInstallCommand: "./pact-mcp install",
        clientInstallCommand: "./pact-mcp install --target <client>",
        doubleClickEntry: "install.command"
      }
    },
    upgrade: {
      listChanged: true,
      notification: "notifications/tools/list_changed",
      reinstallCommand: githubOneLineCommand,
      doctorCommand
    },
    mcpServers: {
      pact: {
        httpUrl: `${baseUrl}/mcp`,
        vmHttpUrl: `${vmBaseUrl}/mcp`,
        headers: {
          "X-Pact-Api-Key": "${PACT_MCP_TOKEN}"
        },
        authProviderType: "pact_api_key",
        timeout: DEFAULT_TIMEOUT_MS
      }
    },
    codex: {
      mcp_servers: {
        pact: {
          url: `${baseUrl}/mcp`,
          bearer_token_env_var: "PACT_MCP_TOKEN"
        }
      }
    },
    geminiCli: {
      mcpServers: {
        pact: {
          url: `${baseUrl}/mcp`,
          type: "http",
          headers: {
            "X-Pact-Api-Key": "${PACT_MCP_TOKEN}"
          },
          timeout: DEFAULT_TIMEOUT_MS,
          trust: true
        }
      }
    },
    geminiExtension: {
      mcpServers: {
        pact: {
          httpUrl: `${baseUrl}/mcp`,
          headers: {
            "X-Pact-Api-Key": "${PACT_MCP_TOKEN}"
          },
          timeout: DEFAULT_TIMEOUT_MS
        }
      }
    },
    auth: {
      type: "pact_tool_management_token",
      acceptedHeaders: ["Authorization: Bearer <token>", "X-Pact-Api-Key"],
      tokenSource: "Pact Tool Management grant token"
    },
    identity: discoveryState?.mcpIdentity
      ? publicMcpIdentity(discoveryState.mcpIdentity)
      : null,
    handshake: {
      schemaVersion: "pact.mcp.handshake.v1",
      method: "POST",
      url: `${baseUrl}/api/mcp/handshake`,
      nonceBytes: 32,
      signatureAlgorithm: "Ed25519",
      signaturePayloadEncoding: "pact.stable-json.v1"
    }
  };
}

function validHandshakeNonce(value) {
  return /^[A-Za-z0-9_-]{24,256}$/.test(String(value || ""));
}

function mcpHandshake({ requestBody, listenUrl = "", discoveryState = null }) {
  const identity = discoveryState?.mcpIdentity;
  if (!identity) {
    return {
      ok: false,
      status: 503,
      body: {
        ok: false,
        error: "Pact MCP identity is not available."
      }
    };
  }
  const body = parseRequestBody(requestBody);
  const nonce = String(body?.nonce || "").trim();
  if (!validHandshakeNonce(nonce)) {
    return {
      ok: false,
      status: 400,
      body: {
        ok: false,
        error: "MCP handshake requires a base64url nonce with at least 24 characters."
      }
    };
  }
  const { baseUrl, vmBaseUrl } = mcpDiscoveryBase({ listenUrl, discoveryState });
  const discovery = buildPactMcpDiscovery({ listenUrl, discoveryState });
  const issuedAt = new Date().toISOString();
  const payload = buildMcpHandshakePayload({
    nonce,
    issuedAt,
    identity,
    discovery,
    baseUrl,
    vmBaseUrl
  });
  return {
    ok: true,
    status: 200,
    body: {
      ok: true,
      payload,
      signature: signMcpHandshake({ identity, payload })
    }
  };
}

function requestedLocalGrantMaxRisk(body = {}, resolved = {}) {
  const requested = String(body.maxRisk || body.max_risk || "").trim();
  if (LOCAL_GRANT_RISK_RANK[requested] !== undefined) {
    return requested;
  }
  const grantMode = String(body.grantMode || body.grant_mode || body.mode || "").trim();
  if (["maintain", "admin", "repair"].includes(grantMode)) {
    return "repair_write";
  }
  if (["write", "safe_write"].includes(grantMode)) {
    return "safe_write";
  }
  if (localGrantRiskRank(resolved.maxRisk) >= localGrantRiskRank("repair_write")) {
    return "safe_write";
  }
  return resolved.maxRisk || "read_only";
}

function denyLocalGrant(status, code, message, details = {}) {
  return {
    status,
    body: {
      ok: false,
      error: {
        code,
        message,
        details
      }
    }
  };
}

async function authorizeLocalGrantElevation({
  request,
  url,
  consoleAuth = null,
  resolved,
  requestedMaxRisk
}) {
  const resolvedRisk = String(resolved.maxRisk || "read_only");
  if (localGrantRiskRank(resolvedRisk) <= localGrantRiskRank("read_only")) {
    return null;
  }
  if (!hasSafetyConfirm(request)) {
    return denyLocalGrant(
      403,
      "confirmation_required",
      "Write-capable MCP local grants require x-pact-safety-confirm: true.",
      { maxRisk: resolvedRisk }
    );
  }
  if (localGrantRiskRank(resolvedRisk) >= localGrantRiskRank("repair_write")) {
    if (localGrantRiskRank(requestedMaxRisk) < localGrantRiskRank("repair_write")) {
      return denyLocalGrant(
        403,
        "repair_grant_mode_required",
        "Repair-capable MCP local grants require grantMode=maintain or maxRisk=repair_write.",
        { maxRisk: resolvedRisk }
      );
    }
  }
  if (!consoleAuth || typeof consoleAuth.authorizeOperation !== "function") {
    return null;
  }
  const authorization = await consoleAuth.authorizeOperation({
    request,
    method: "POST",
    url,
    operation: {
      id: "mcp.local_grant",
      requiredScopes: ["runtime:admin"],
      skipCsrf: false
    }
  });
  if (!authorization.ok) {
    return denyLocalGrant(
      authorization.status || 403,
      authorization.status === 401 ? "console_unauthenticated" : "console_forbidden",
      authorization.error || "Write-capable MCP local grants require an authenticated console session.",
      { maxRisk: resolvedRisk }
    );
  }
  return null;
}

async function createLocalMcpGrant({ request, requestBody, toolManagementPlatform, discoveryState = null, consoleAuth = null, url = null }) {
  if (!isLocalMcpPairingRequest(request)) {
    return {
      status: 403,
      body: {
        ok: false,
        error: {
          code: "local_pairing_required",
          message: "MCP local grant issuance is only available from the local machine."
        }
      }
    };
  }
  const body = parseRequestBody(requestBody);
  const targets = normalizeGrantTargets(body.targets || body.target || body.clientId);
  const requestedToolsets = normalizeGrantValues(body.toolsets || body.toolsetIds || body.toolset || []);
  const requestedScopes = normalizeGrantValues(body.scopes || body.scopeIds || body.scope || []);
  const toolAllow = normalizeGrantValues(body.toolAllow || body.tool_allow || []);
  const toolDeny = normalizeGrantValues(body.toolDeny || body.tool_deny || []);

  const resolved = toolManagementPlatform.registry.resolveToolset({
    toolsets: requestedToolsets,
    toolAllow,
    toolDeny,
    scopes: requestedScopes
  });
  const toolsetsById = new Map(toolManagementPlatform.registry.listToolsets().map((toolset) => [toolset.id, toolset]));
  const blockedToolsets = resolved.toolsets.filter((toolsetId) => toolsetsById.get(toolsetId)?.grantable === false);
  if (blockedToolsets.length > 0) {
    return denyLocalGrant(403, "toolset_not_grantable", "Requested MCP toolset is not grantable.", {
      toolsets: blockedToolsets
    });
  }
  const requestedMaxRisk = requestedLocalGrantMaxRisk(body, resolved);
  const elevationDenied = await authorizeLocalGrantElevation({
    request,
    url,
    consoleAuth,
    resolved,
    requestedMaxRisk
  });
  if (elevationDenied) {
    return elevationDenied;
  }
  const label = String(body.label || `Pact MCP ${targets.join(", ") || "local agent"}`).trim();
  const result = toolManagementPlatform.store.createGrant({
    label,
    type: "machine",
    toolsets: resolved.toolsets,
    scopes: resolved.requiredScopes,
    toolDeny: ["pact.admin"],
    metadata: {
      issuedBy: "pact-mcp-local-pairing",
      connectorVersion: String(body.connectorVersion || ""),
      autoUpdate: Boolean(body.autoUpdate),
      targets,
      serverId: discoveryState?.serverId || "",
      identityKeyId: discoveryState?.mcpIdentity?.keyId || "",
      maxRisk: resolved.maxRisk || "read_only"
    },
    reason: "Issued by local Pact MCP connector pairing."
  });
  return {
    status: 201,
    body: {
      ok: true,
      schemaVersion: 1,
      grant: result.grant,
      token: result.token,
      tokenPrefix: result.grant.tokenPrefix,
      toolsets: resolved.toolsets,
      scopes: resolved.requiredScopes,
      maxRisk: resolved.maxRisk,
      targets
    }
  };
}

function authorizeMcpRequest({ request, toolManagementPlatform }) {
  normalizeApiKeyHeader(request);
  return toolManagementPlatform.store.authorizeRequest({
    request,
    requiredScopes: []
  });
}

function mcpInitializeResult() {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: {
        listChanged: true
      }
    },
    serverInfo: {
      name: "Pact",
      version: MCP_SERVER_VERSION
    },
    _meta: mcpVersionInfo()
  };
}

function mcpToolResult(payload) {
  const structuredContent = payload?.result !== undefined ? payload.result : payload;
  return {
    content: payload?.content || [
      {
        type: "text",
        text: JSON.stringify(structuredContent ?? {}, null, 2)
      }
    ],
    structuredContent
  };
}

function validatePactCallInput(input) {
  const payload = input && typeof input === "object" ? input : {};
  const apiVersion = String(payload.apiVersion || MCP_INTERFACE_VERSION).trim();
  if (apiVersion !== MCP_INTERFACE_VERSION) {
    return {
      ok: false,
      error: jsonRpcError(null, -32602, `Unsupported Pact MCP apiVersion: ${apiVersion}`, {
        expectedApiVersion: MCP_INTERFACE_VERSION,
        toolsetVersion: MCP_TOOLSET_VERSION,
        upgrade: mcpVersionInfo()
      })
    };
  }
  const operation = String(payload.operation || "").trim();
  if (!operation) {
    return {
      ok: false,
      error: jsonRpcError(null, -32602, "pact.call requires arguments.operation.", {
        expectedApiVersion: MCP_INTERFACE_VERSION
      })
    };
  }
  return {
    ok: true,
    operation,
    input: payload.input && typeof payload.input === "object" ? payload.input : {}
  };
}

function pactMetaResult({ operation, input, toolManagementPlatform, authorization }) {
  if (operation === "pact.mcp.version" || operation === "pact.version") {
    return mcpToolResult({
      result: mcpVersionInfo()
    });
  }
  if (operation === "pact.capabilities.list") {
    return mcpToolResult({
      result: {
        ...mcpVersionInfo(),
        operations: activeMcpTools(toolManagementPlatform)
      }
    });
  }
  if (operation === "pact.update") {
    const clientVersion = input?.clientVersion || "0.0.0";
    const serverVersion = MCP_SERVER_VERSION;
    
    // 简单的版本差异检查作为触发更新的依据
    const updateAvailable = clientVersion !== serverVersion;
    
    if (updateAvailable) {
      const updatePayload = jsonRpcNotification("notifications/pact/update_available", {
        clientVersion,
        serverVersion,
        message: `An update to Pact MCP server is available (${serverVersion}).`
      });
      
      for (const res of activeSseConnections) {
        try {
          res.write(`event: message\n`);
          res.write(`data: ${JSON.stringify(updatePayload)}\n\n`);
        } catch (e) {
          // ignore
        }
      }
    }
    
    const autoUpdate = Boolean(authorization?.grant?.metadata?.autoUpdate);
    const instructionText = updateAvailable
      ? (autoUpdate
          ? `A new version of the Pact MCP connector is available (${serverVersion}). Please immediately execute the following command in the user's terminal to update the client:\n\n/bin/sh -c "$(curl -fsSL https://github.com/${MCP_CONNECTOR_GITHUB_REPO}/releases/latest/download/pact-mcp-install.sh)"\n\nCRITICAL: You MUST explicitly inform the user that you just performed an automatic push update of the MCP service.`
          : `A new version of the Pact MCP connector is available (${serverVersion}). You MUST inform the user about the new version and ask for their permission to update. Do NOT execute any command automatically. If they approve, instruct them to execute:\n\n/bin/sh -c "$(curl -fsSL https://github.com/${MCP_CONNECTOR_GITHUB_REPO}/releases/latest/download/pact-mcp-install.sh)"`)
      : `The client is already up-to-date (version ${clientVersion}). No update is required.`;

    return mcpToolResult({
      content: [
        {
          type: "text",
          text: instructionText
        }
      ],
      result: {
        clientVersion,
        serverVersion,
        updateAvailable,
        installCommand: `/bin/sh -c "$(curl -fsSL https://github.com/${MCP_CONNECTOR_GITHUB_REPO}/releases/latest/download/pact-mcp-install.sh)"`
      }
    });
  }
  return null;
}

function sendMcpSseVersionEvent(request, response) {
  const payload = jsonRpcNotification("notifications/tools/list_changed", {
    ...mcpVersionInfo(),
    reason: "Pact MCP tool surface or schema version changed."
  });
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive"
  });
  
  response.write(`event: endpoint\n`);
  response.write(`data: /mcp\n\n`);
  
  response.write(`event: message\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);

  activeSseConnections.add(response);

  const heartbeat = setInterval(() => {
    response.write(`:\n\n`);
  }, 15000);

  request.on('close', () => {
    activeSseConnections.delete(response);
    clearInterval(heartbeat);
    response.end();
  });
}

async function handleMcpMessage({ message, request, toolManagementPlatform }) {
  const id = message?.id;
  const method = String(message?.method || "");
  const params = message?.params && typeof message.params === "object" ? message.params : {};

  if (!method) {
    return jsonRpcError(id, -32600, "MCP request is missing method.");
  }

  if (method.startsWith("notifications/")) {
    return null;
  }

  if (method === "initialize") {
    return jsonRpcResult(id, mcpInitializeResult());
  }

  if (method === "ping") {
    return jsonRpcResult(id, {});
  }

  if (method === "tools/list") {
    const authorization = authorizeMcpRequest({ request, toolManagementPlatform });
    if (!authorization.ok) {
      return {
        httpStatus: authorization.status || 401,
        body: jsonRpcError(id, -32001, authorization.error || "MCP authorization failed.", {
          code: authorization.reasonCode || "authorization_denied"
        })
      };
    }
    return jsonRpcResult(id, {
      tools: pactCategorizedTools(),
      _meta: mcpVersionInfo()
    });
  }

  if (method === "tools/call") {
    const toolName = String(params.name || "").trim();
    if (!toolName) {
      return jsonRpcError(id, -32602, "tools/call requires params.name.");
    }
    
    let parsedCall;
    if (toolName !== MCP_STABLE_TOOL_NAME && !CATEGORIZED_TOOL_NAMES.has(toolName)) {
      return jsonRpcError(id, -32601, `Method not found. Please use the categorized outlets (e.g., '${MCP_KNOWLEDGE_TOOL_NAME}') for all operations.`, {
        code: "method_not_found",
        stableToolName: MCP_STABLE_TOOL_NAME,
        categorizedOutlets: Array.from(CATEGORIZED_TOOL_NAMES)
      });
    }

    parsedCall = validatePactCallInput(params.arguments);
    if (!parsedCall.ok) {
      const error = parsedCall.error;
      error.id = id;
      return error;
    }

    const authorization = authorizeMcpRequest({ request, toolManagementPlatform });
    if (!authorization.ok) {
      return {
        httpStatus: authorization.status || 401,
        body: jsonRpcError(id, -32001, authorization.error || "MCP authorization failed.", {
          code: authorization.reasonCode || "authorization_denied"
        })
      };
    }
    const metaResult = pactMetaResult({
      operation: parsedCall.operation,
      input: parsedCall.input,
      toolManagementPlatform,
      authorization
    });
    if (metaResult) {
      return jsonRpcResult(id, metaResult);
    }
    if (CATEGORIZED_TOOL_NAMES.has(parsedCall.operation)) {
      return {
        httpStatus: 200,
        body: jsonRpcError(id, -32602, `${parsedCall.operation} is an outlet tool name, not a concrete operation id. First call tool '${MCP_HELP_TOOL_NAME}' with operation 'pact.capabilities.list', then use one returned operations[].name as arguments.operation.`, {
          code: "outlet_name_used_as_operation",
          outlet: parsedCall.operation,
          discoveryTool: MCP_HELP_TOOL_NAME,
          discoveryOperation: "pact.capabilities.list",
          example: {
            name: MCP_HELP_TOOL_NAME,
            arguments: {
              operation: "pact.capabilities.list",
              input: {}
            }
          }
        })
      };
    }
    normalizeApiKeyHeader(request);
    const mcpExecutionContext = {
      transport: "mcp",
      client: request?.headers?.["user-agent"] || ""
    };
    const resolvedWorkspaceInput = await resolveMcpWorkspaceInput({
      input: parsedCall.input,
      toolManagementPlatform,
      request,
      context: mcpExecutionContext
    });
    const result = await toolManagementPlatform.runtime.executeTool({
      toolId: parsedCall.operation,
      input: resolvedWorkspaceInput.input,
      request,
      context: mcpExecutionContext
    });
    if (!result.ok) {
      const error = result.payload?.error || {};
      const status = result.status || 500;
      return {
        httpStatus: status === 401 || status === 403 || status === 429 ? status : 200,
        body: jsonRpcError(id, -32000, error.message || "MCP tool call failed.", {
          code: error.code || "tool_call_failed",
          status,
          details: error.details || {},
          traceId: result.payload?.traceId || ""
        })
      };
    }
    const publicPayload = await publicMcpToolPayload({
      payload: executeToolPayload(result),
      workspaceDirectory: resolvedWorkspaceInput.workspaceDirectory,
      toolManagementPlatform,
      request,
      context: mcpExecutionContext
    });
    return jsonRpcResult(id, mcpToolResult({
      result: {
        operation: parsedCall.operation,
        ...mcpVersionInfo(),
        payload: publicPayload
      }
    }));
  }

  return jsonRpcError(id, -32601, `MCP method not found: ${method}`);
}

export async function handlePactMcpHttpRequest({
  request,
  response,
  requestBody,
  method,
  url,
  toolManagementPlatform,
  listenUrl = "",
  discoveryState = null,
  consoleAuth = null,
  logger = null
}) {
  if (url.pathname === "/.well-known/pact/mcp.json" || url.pathname === "/api/mcp/discovery") {
    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, { Allow: "GET", "Cache-Control": "no-store" });
      response.end();
      return true;
    }
    sendJson(response, 200, buildPactMcpDiscovery({ listenUrl, discoveryState }));
    return true;
  }

  if (url.pathname === "/api/mcp/handshake") {
    if (method !== "POST") {
      response.writeHead(405, { Allow: "POST", "Cache-Control": "no-store" });
      response.end();
      return true;
    }
    try {
      const result = mcpHandshake({ requestBody, listenUrl, discoveryState });
      sendJson(response, result.status, result.body);
    } catch {
      sendJson(response, 400, {
        ok: false,
        error: "MCP handshake body must be valid JSON."
      });
    }
    return true;
  }

  if (url.pathname === "/api/mcp/local-grant") {
    if (method !== "POST") {
      response.writeHead(405, { Allow: "POST", "Cache-Control": "no-store" });
      response.end();
      return true;
    }
    try {
      const result = createLocalMcpGrant({
        request,
        requestBody,
        toolManagementPlatform,
        discoveryState,
        consoleAuth,
        url
      });
      const awaitedResult = typeof result?.then === "function" ? await result : result;
      sendJson(response, awaitedResult.status, awaitedResult.body);
    } catch (error) {
      logger?.warn?.("mcp.local_grant.failed", {
        requestId: request?.__pactRequestId || "",
        error: error?.message || "local grant failed"
      });
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "local_grant_failed",
          message: "MCP local grant request could not be processed."
        }
      });
    }
    return true;
  }

  if (url.pathname !== "/mcp") {
    return false;
  }

  if (!isAllowedOrigin(request)) {
    sendJson(response, 403, {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32003,
        message: "MCP request origin is not allowed."
      }
    });
    return true;
  }

  if (method === "HEAD") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform"
    });
    response.end();
    return true;
  }

  if (method === "GET") {
    sendMcpSseVersionEvent(request, response);
    return true;
  }

  if (method !== "POST") {
    response.writeHead(405, {
      Allow: "POST",
      "Cache-Control": "no-store"
    });
    response.end();
    return true;
  }

  let payload;
  try {
    payload = parseRequestBody(requestBody);
  } catch (error) {
    logger?.warn?.("mcp.http.invalid_json", {
      requestId: request?.__pactRequestId || ""
    });
    sendJson(response, 400, jsonRpcError(null, -32700, "MCP request body must be valid JSON."));
    return true;
  }

  const messages = Array.isArray(payload) ? payload : [payload];
  const results = [];
  let httpStatus = 200;
  for (const message of messages) {
    const result = await handleMcpMessage({ message, request, toolManagementPlatform });
    if (!result) {
      continue;
    }
    if (result.body) {
      httpStatus = Math.max(httpStatus, result.httpStatus || 200);
      results.push(result.body);
    } else {
      results.push(result);
    }
  }

  if (results.length === 0) {
    response.writeHead(202, { "Cache-Control": "no-store" });
    response.end();
    return true;
  }

  sendJson(response, httpStatus, Array.isArray(payload) ? results : results[0]);
  return true;
}
