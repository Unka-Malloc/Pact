import crypto from "node:crypto";
import { sendJson } from "../console/http/http-utils.mjs";
import {
  buildMcpHandshakePayload,
  publicMcpIdentity,
  signMcpHandshake
} from "./identity.mjs";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const DEFAULT_TIMEOUT_MS = 300_000;
export const MCP_INTERFACE_VERSION = "pact.mcp.v1";
export const MCP_TOOLSET_VERSION = "2026-05-25.1";
export const MCP_STABLE_TOOL_NAME = "pact.call";
export const MCP_DISCOVERY_TOOL_NAME = "pact.discovery";
export const MCP_KNOWLEDGE_TOOL_NAME = "pact.knowledge";
export const MCP_SHAREDSPACE_TOOL_NAME = "pact.sharedspace";
export const MCP_CODESPACE_TOOL_NAME = "pact.codespace";
export const MCP_SKILL_HUB_TOOL_NAME = "pact.skillHub";

const CATEGORIZED_TOOL_NAMES = new Set([
  MCP_DISCOVERY_TOOL_NAME,
  MCP_KNOWLEDGE_TOOL_NAME,
  MCP_SHAREDSPACE_TOOL_NAME,
  MCP_CODESPACE_TOOL_NAME,
  MCP_SKILL_HUB_TOOL_NAME
]);

const ACCEPTED_OUTLET_TOOL_NAMES = new Set([
  ...CATEGORIZED_TOOL_NAMES
]);

const activeSseConnections = new Set();

const LOCAL_GRANT_WRITE_TOOLSETS = Object.freeze([
  "pact.runtime.read",
  "pact.storage.read",
  "pact.jobs.read",
  "pact.knowledge.read",
  "pact.knowledge.write",
  "pact.storage.write",
  "pact.agent.workspace.read",
  "pact.agent.workspace",
  "pact.document.parse",
  "pact.result.export",
  "pact.repo.read"
]);

const LOCAL_GRANT_TARGET_MATCH = Object.freeze({
  codex: {
    toolsets: LOCAL_GRANT_WRITE_TOOLSETS,
    agentProfileId: "pact.mcp.codex"
  },
  "gemini-cli": {
    toolsets: LOCAL_GRANT_WRITE_TOOLSETS,
    agentProfileId: "pact.mcp.gemini-cli"
  },
  "kilo-code": {
    toolsets: LOCAL_GRANT_WRITE_TOOLSETS,
    agentProfileId: "pact.mcp.kilo-code"
  },
  copilot: {
    toolsets: LOCAL_GRANT_WRITE_TOOLSETS,
    agentProfileId: "pact.mcp.copilot"
  },
  openclaw: {
    toolsets: LOCAL_GRANT_WRITE_TOOLSETS,
    agentProfileId: "pact.mcp.openclaw"
  },
  hermes: {
    toolsets: LOCAL_GRANT_WRITE_TOOLSETS,
    agentProfileId: "pact.mcp.hermes"
  },
  antigravity: {
    toolsets: LOCAL_GRANT_WRITE_TOOLSETS,
    agentProfileId: "pact.mcp.antigravity"
  },
  opencode: {
    toolsets: LOCAL_GRANT_WRITE_TOOLSETS,
    agentProfileId: "pact.mcp.opencode"
  }
});

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

function grantMetadata(grant) {
  return grant?.metadata && typeof grant.metadata === "object" && !Array.isArray(grant.metadata)
    ? grant.metadata
    : {};
}

function localMcpGrantTargets(grant) {
  const metadata = grantMetadata(grant);
  return [
    ...normalizeGrantTargets(metadata.targets),
    ...normalizeGrantTargets(metadata.mcpTarget)
  ].filter((target, index, values) => values.indexOf(target) === index);
}

function isLocalMcpGrant(grant) {
  const metadata = grantMetadata(grant);
  return (
    String(metadata.issuedBy || "").trim() === "pact-mcp-local-pairing" ||
    String(grant?.type || "").trim() === "mcp-client" ||
    String(metadata.mcpServer || "").trim() === MCP_SERVER_NAME
  );
}

function normalizeGrantValues(value, limit = 64) {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, limit);
}

function normalizedTargetKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

function localGrantTargetMatch(targets = []) {
  const matchedTargets = [];
  const unmatchedTargets = [];
  const toolsets = new Set();
  let agentProfileId = "";
  for (const target of targets) {
    const key = normalizedTargetKey(target);
    const profile = LOCAL_GRANT_TARGET_MATCH[key] || null;
    if (!profile) {
      unmatchedTargets.push(target);
      continue;
    }
    matchedTargets.push(target);
    if (!agentProfileId) {
      agentProfileId = profile.agentProfileId || "";
    }
    for (const toolset of profile.toolsets || []) {
      toolsets.add(toolset);
    }
  }
  return {
    matched: matchedTargets.length > 0,
    matchedTargets,
    unmatchedTargets,
    toolsets: [...toolsets],
    agentProfileId
  };
}

function hasMcpAuthToken(request = null) {
  const authorization = String(request?.headers?.authorization || "").trim();
  return Boolean(
    /^Bearer\s+.+/i.test(authorization) ||
      String(request?.headers?.["x-pact-tool-token"] || "").trim() ||
      String(request?.headers?.["x-pact-api-key"] || "").trim()
  );
}

function randomMcpId(prefix) {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString("hex")}`;
}

function grantVisibleRisk(grant = null) {
  const metadata = grantMetadata(grant);
  return String(metadata.maxRisk || grant?.maxRisk || "read_only").trim() || "read_only";
}

function grantCanSeeTool(tool, grant = null) {
  if (!tool || tool.status !== "active" || !grant) {
    return false;
  }
  const deniedTools = new Set(normalizeGrantValues(grant.toolDeny || [], 256));
  if (deniedTools.has(tool.id)) {
    return false;
  }
  const allowedTools = new Set(normalizeGrantValues(grant.toolAllow || [], 256));
  if (allowedTools.size > 0 && !allowedTools.has(tool.id)) {
    return false;
  }
  const grantScopes = new Set(normalizeGrantValues(grant.scopes || [], 512));
  const missingScopes = (tool.requiredScopes || []).filter((scope) => !grantScopes.has(scope));
  if (missingScopes.length > 0) {
    return false;
  }
  const grantToolsets = new Set(normalizeGrantValues(grant.toolsets || [], 256));
  if (grantToolsets.size > 0 && !(tool.toolsets || []).some((toolset) => grantToolsets.has(toolset))) {
    return false;
  }
  return localGrantRiskRank(tool.risk || "read_only") <= localGrantRiskRank(grantVisibleRisk(grant));
}

function mcpSubjectFromGrant(grant = null) {
  if (!grant) {
    return {
      type: "anonymous",
      subjectId: "",
      label: "",
      scopes: [],
      toolsets: []
    };
  }
  return {
    type: "tool-grant",
    subjectId: String(grant.id || ""),
    label: String(grant.label || grant.id || ""),
    scopes: normalizeGrantValues(grant.scopes || [], 512),
    toolsets: normalizeGrantValues(grant.toolsets || [], 256)
  };
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
    },
    _meta: {
      operationId: tool.operationId || tool.id,
      toolsets: tool.toolsets || [],
      requiredScopes: tool.requiredScopes || [],
      risk: tool.risk || "read_only"
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

function activeMcpTools(toolManagementPlatform, authorization = null) {
  const catalog = toolManagementPlatform?.catalog?.() || { tools: [] };
  const grant = authorization?.grant || null;
  return (catalog.tools || [])
    .filter((tool) => tool.status === "active")
    .filter((tool) => !grant || grantCanSeeTool(tool, grant))
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
        description: "Concrete Pact operation id to execute, for example 'pact.knowledge.health'. Do not use an outlet tool name itself here, such as 'pact.discovery' or 'pact.knowledge'. If unsure, first call tool 'pact.discovery' with operation 'pact.capabilities.list' and then use one returned operations[].name value."
      },
      input: {
        type: "object",
        description: "Operation input payload.",
        additionalProperties: true,
        default: {}
      },
      subject: {
        type: "object",
        description: "Optional caller subject. If omitted, Pact injects the authenticated grant subject.",
        additionalProperties: true
      },
      operatorId: {
        type: "string",
        description: "External agent or operator id that initiated this intent."
      },
      agentProfileId: {
        type: "string",
        description: "Agent profile id used for policy, audit, and reply routing."
      },
      workspaceId: {
        type: "string",
        description: "Workspace id or public workspace reference targeted by this intent."
      },
      traceId: {
        type: "string",
        description: "Caller trace id. Pact generates one when omitted."
      },
      idempotencyKey: {
        type: "string",
        description: "Caller idempotency key. Pact generates one when omitted."
      },
      intent: {
        type: "string",
        description: "Human or agent intent label for audit and asynchronous replies."
      },
      dryRun: {
        type: "boolean",
        description: "Preview policy and execution effects without mutating state.",
        default: false
      },
      requestedScopes: {
        type: "array",
        description: "Optional scopes the caller believes are needed for this operation.",
        items: { type: "string" },
        default: []
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
      name: MCP_DISCOVERY_TOOL_NAME,
      title: "Pact Discovery",
      description: "Discovery outlet/router for capability discovery, tool descriptions, doctor checks, available commands, and connection state. Start here with operation='pact.capabilities.list', then use one returned operations[].name as the operation value for a Pact outlet.",
      inputSchema: commonSchema,
      annotations: { readOnlyHint: true, destructiveHint: false },
      _meta: {
        ...toolMeta,
        architectureCategory: "Discovery"
      }
    },
    {
      name: MCP_KNOWLEDGE_TOOL_NAME,
      title: "Pact Knowledge",
      description: "AgentLibrary-governed Knowledge outlet/router for search, evidence, asset, and export operations. Do not call operation='pact.knowledge'. First discover concrete operation ids by calling tool 'pact.discovery' with operation='pact.capabilities.list'.",
      inputSchema: commonSchema,
      annotations: { readOnlyHint: true, destructiveHint: false },
      _meta: {
        ...toolMeta,
        architectureCategory: "Knowledge"
      }
    },
    {
      name: MCP_SHAREDSPACE_TOOL_NAME,
      title: "Pact Sharedspace",
      description: "Sharedspace outlet/router for context, files, artifacts, proposals, and shared workspace state governed by StateCommit-compatible operation ledger and checkpoint semantics. Do not call operation='pact.sharedspace'. First discover concrete operation ids by calling tool 'pact.discovery' with operation='pact.capabilities.list'.",
      inputSchema: commonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: {
        ...toolMeta,
        architectureCategory: "Sharedspace"
      }
    },
    {
      name: MCP_CODESPACE_TOOL_NAME,
      title: "Pact Codespace",
      description: "Codespace outlet/router for code spaces, repository state, diffs, commits, and GitHub/Gerrit provider operations. Do not call operation='pact.codespace'. First discover concrete operation ids by calling tool 'pact.discovery' with operation='pact.capabilities.list'.",
      inputSchema: commonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: {
        ...toolMeta,
        architectureCategory: "Codespace"
      }
    },
    {
      name: MCP_SKILL_HUB_TOOL_NAME,
      title: "Pact Skill Hub",
      description: "Skill Hub outlet/router for skills, tools, toolsets, grants, risk, policy, and audit operations. Do not call operation='pact.skillHub'. First discover concrete operation ids by calling tool 'pact.discovery' with operation='pact.capabilities.list'.",
      inputSchema: commonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: {
        ...toolMeta,
        architectureCategory: "Skill Hub"
      }
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
    capabilitiesSummary: "Pact MCP Plugin capability layer. Outlets: Discovery, Knowledge, Sharedspace, Codespace, and Skill Hub.",
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
    description: "Pact MCP Plugin capability layer. Provides five architecture outlets for Discovery, Knowledge, Sharedspace, Codespace, and Skill Hub.",
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
  requestedMaxRisk,
  matchedLocalTarget = false
}) {
  const resolvedRisk = String(resolved.maxRisk || "read_only");
  if (localGrantRiskRank(resolvedRisk) <= localGrantRiskRank("read_only")) {
    return null;
  }
  if (matchedLocalTarget && localGrantRiskRank(resolvedRisk) <= localGrantRiskRank("safe_write")) {
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
  const targetMatch = localGrantTargetMatch(targets);
  const hasExplicitGrantRequest = requestedToolsets.length > 0 || requestedScopes.length > 0 || toolAllow.length > 0;
  const effectiveToolsets = hasExplicitGrantRequest ? requestedToolsets : targetMatch.toolsets;

  const resolved = toolManagementPlatform.registry.resolveToolset({
    toolsets: effectiveToolsets,
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
    requestedMaxRisk,
    matchedLocalTarget: targetMatch.matched && !hasExplicitGrantRequest
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
    toolAllow,
    toolDeny: [...new Set([...toolDeny, "pact.admin"])],
    metadata: {
      issuedBy: "pact-mcp-local-pairing",
      connectorVersion: String(body.connectorVersion || ""),
      autoUpdate: Boolean(body.autoUpdate),
      targets,
      targetMatch: targetMatch.matched,
      matchedTargets: targetMatch.matchedTargets,
      unmatchedTargets: targetMatch.unmatchedTargets,
      agentProfileId: String(body.agentProfileId || body.agent_profile_id || targetMatch.agentProfileId || ""),
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
      targets,
      targetMatch: {
        matched: targetMatch.matched,
        matchedTargets: targetMatch.matchedTargets,
        unmatchedTargets: targetMatch.unmatchedTargets,
        agentProfileId: targetMatch.agentProfileId
      }
    }
  };
}

async function markLocalMcpGrantUninstalled({ request, requestBody, toolManagementPlatform }) {
  if (!isLocalMcpPairingRequest(request)) {
    return {
      status: 403,
      body: {
        ok: false,
        error: {
          code: "local_pairing_required",
          message: "MCP local uninstall updates are only available from the local machine."
        }
      }
    };
  }

  const body = parseRequestBody(requestBody);
  const targets = normalizeGrantTargets(body.targets || body.target || body.clientId);
  if (targets.length === 0) {
    return denyLocalGrant(
      400,
      "targets_required",
      "MCP local uninstall updates require at least one target."
    );
  }

  const store = toolManagementPlatform?.store;
  if (typeof store?.listGrants !== "function" || typeof store?.updateGrant !== "function") {
    return denyLocalGrant(
      503,
      "tool_management_unavailable",
      "Tool management storage is not available."
    );
  }

  const targetSet = new Set(targets);
  const uninstalledAt = new Date().toISOString();
  const updated = [];
  const grants = store.listGrants({ includeRevoked: true });
  for (const grant of grants) {
    if (!isLocalMcpGrant(grant)) {
      continue;
    }
    const grantTargets = localMcpGrantTargets(grant);
    const matchedTargets = grantTargets.filter((target) => targetSet.has(target));
    if (matchedTargets.length === 0) {
      continue;
    }

    const metadata = grantMetadata(grant);
    const uninstalledTargets = [
      ...normalizeGrantTargets(metadata.uninstalledTargets),
      ...matchedTargets
    ].filter((target, index, values) => values.indexOf(target) === index);
    const remainingTargets = grantTargets.filter((target) => !uninstalledTargets.includes(target));
    const nextMetadata = {
      ...metadata,
      uninstalledTargets,
      lastUninstalledAt: uninstalledAt,
      lastUninstallConnectorVersion: String(body.connectorVersion || "")
    };
    if (remainingTargets.length === 0) {
      nextMetadata.uninstalledAt = nextMetadata.uninstalledAt || uninstalledAt;
      nextMetadata.currentDeviceVisible = false;
    } else if (nextMetadata.currentDeviceVisible === false) {
      nextMetadata.currentDeviceVisible = true;
    }

    const nextGrant = store.updateGrant(grant.id, {
      enabled: remainingTargets.length > 0 ? grant.enabled !== false : false,
      metadata: nextMetadata,
      reason: grant.reason || "Updated by local Pact MCP connector uninstall."
    });
    if (nextGrant) {
      updated.push({
        grantId: nextGrant.id,
        targets: matchedTargets,
        currentDeviceVisible: remainingTargets.length > 0
      });
    }
  }

  return {
    status: 200,
    body: {
      ok: true,
      schemaVersion: 1,
      targets,
      updatedCount: updated.length,
      updated
    }
  };
}

function authorizeMcpRequest({ request, toolManagementPlatform }) {
  normalizeApiKeyHeader(request);
  const authorization = toolManagementPlatform.store.authorizeRequest({
    request,
    requiredScopes: []
  });
  if (!authorization.ok && typeof toolManagementPlatform.authorizationStore?.appendDecision === "function") {
    toolManagementPlatform.authorizationStore.appendDecision({
      decisionId: `authz_mcp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      traceId: request?.__pactTraceContext?.traceId || request?.__pactRequestId || "",
      operationId: "mcp.request",
      toolId: "",
      grantId: authorization.grant?.id || "",
      subject: authorization.grant
        ? {
            type: "tool-grant",
            subjectId: authorization.grant.id,
            username: authorization.grant.label || authorization.grant.id,
            scopes: authorization.grant.scopes || []
          }
        : {
            type: "anonymous",
            subjectId: "",
            scopes: []
          },
      resource: {
        operationId: "mcp.request",
        toolId: "",
        risk: "read_only"
      },
      action: "mcp.authorize",
      effect: "deny",
      allowed: false,
      reasonCode: authorization.reasonCode || "mcp_authorization_denied",
      redactedReason: authorization.error || "MCP authorization denied.",
      requiredScopes: [],
      missingScopes: authorization.missingScopes || [],
      evaluatedLayers: ["mcp_token_authorization"],
      createdAt: new Date().toISOString()
    });
  }
  return authorization;
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

function normalizeMcpSubject(value, authorization) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      ...mcpSubjectFromGrant(authorization?.grant || null),
      ...value
    };
  }
  return mcpSubjectFromGrant(authorization?.grant || null);
}

function normalizeMcpOperationEnvelope(input, authorization) {
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
  const grant = authorization?.grant || null;
  const metadata = grantMetadata(grant);
  const operationInput = payload.input && typeof payload.input === "object" && !Array.isArray(payload.input)
    ? payload.input
    : {};
  const workspaceId = String(
    payload.workspaceId ||
      operationInput.workspaceId ||
      operationInput.workspaceRef ||
      operationInput["workspace-ref"] ||
      ""
  ).trim();
  const agentProfileId = String(
    payload.agentProfileId ||
      payload.agent_profile_id ||
      metadata.agentProfileId ||
      metadata.agentProfile ||
      ""
  ).trim();
  const targets = localMcpGrantTargets(grant);
  const operatorId = String(
    payload.operatorId ||
      payload.operator_id ||
      metadata.operatorId ||
      metadata.operator ||
      targets[0] ||
      grant?.id ||
      "mcp-agent"
  ).trim();
  const traceId = String(payload.traceId || payload.trace_id || requestTraceIdFromAuthorization(authorization) || randomMcpId("mcp_trace")).trim();
  const idempotencyKey = String(payload.idempotencyKey || payload.idempotency_key || randomMcpId("mcp_intent")).trim();
  const envelope = {
    apiVersion,
    operation,
    intent: String(payload.intent || operation).trim(),
    input: operationInput,
    subject: normalizeMcpSubject(payload.subject, authorization),
    operatorId,
    agentProfileId,
    workspaceId,
    traceId,
    idempotencyKey,
    dryRun: payload.dryRun === true,
    requestedScopes: normalizeGrantValues(payload.requestedScopes || payload.requested_scopes || [], 128),
    clientVersion: String(payload.clientVersion || "").trim()
  };
  return {
    ok: true,
    operation,
    input: operationInput,
    envelope
  };
}

function requestTraceIdFromAuthorization(authorization = null) {
  return String(authorization?.traceId || authorization?.authorizationDecision?.traceId || "").trim();
}

function mcpEnvelopePublic(envelope = {}) {
  return {
    apiVersion: envelope.apiVersion || MCP_INTERFACE_VERSION,
    operation: envelope.operation || "",
    intent: envelope.intent || envelope.operation || "",
    traceId: envelope.traceId || "",
    idempotencyKey: envelope.idempotencyKey || "",
    operatorId: envelope.operatorId || "",
    agentProfileId: envelope.agentProfileId || "",
    workspaceId: envelope.workspaceId || "",
    requestedScopes: envelope.requestedScopes || [],
    dryRun: envelope.dryRun === true,
    subject: envelope.subject || {}
  };
}

function pactMetaResult({ operation, input, envelope, toolManagementPlatform, authorization }) {
  if (operation === "pact.mcp.version" || operation === "pact.version") {
    return mcpToolResult({
      result: {
        ...mcpVersionInfo(),
        envelope: mcpEnvelopePublic(envelope)
      }
    });
  }
  if (operation === "pact.capabilities.list") {
    return mcpToolResult({
      result: {
        ...mcpVersionInfo(),
        grant: {
          id: authorization?.grant?.id || "",
          label: authorization?.grant?.label || "",
          toolsets: authorization?.grant?.toolsets || [],
          scopes: authorization?.grant?.scopes || [],
          maxRisk: grantVisibleRisk(authorization?.grant || null)
        },
        envelope: mcpEnvelopePublic(envelope),
        operations: activeMcpTools(toolManagementPlatform, authorization)
      }
    });
  }
  if (operation === "pact.update") {
    const clientVersion = envelope?.clientVersion || input?.clientVersion || "0.0.0";
    const serverVersion = MCP_SERVER_VERSION;
    
    // 简单的版本差异检查作为触发更新的依据
    const updateAvailable = clientVersion !== serverVersion;
    
    if (updateAvailable) {
      const updatePayload = jsonRpcNotification("notifications/pact/update_available", {
        clientVersion,
        serverVersion,
        message: `An update to Pact MCP server is available (${serverVersion}).`
      });
      broadcastMcpNotification(updatePayload, { grantId: authorization?.grant?.id || "" });
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

function firstString(values = []) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function findFirstDeepString(value, keys = [], depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) {
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 20)) {
      const found = findFirstDeepString(item, keys, depth + 1);
      if (found) {
        return found;
      }
    }
    return "";
  }
  for (const key of keys) {
    const candidate = value[key];
    if (candidate !== undefined && candidate !== null && candidate !== "") {
      return String(candidate).trim();
    }
  }
  for (const child of Object.values(value)) {
    const found = findFirstDeepString(child, keys, depth + 1);
    if (found) {
      return found;
    }
  }
  return "";
}

function inferMcpTargetReceipt({ operation = "", input = {}, payload = {}, envelope = {} } = {}) {
  const operationId = String(operation || "").trim();
  const targetProvider = firstString([
    input.provider,
    input.targetProvider,
    input.reviewProvider,
    payload.provider,
    payload.targetProvider,
    findFirstDeepString(payload, ["provider", "targetProvider", "reviewProvider"])
  ]);
  let targetKind = "operation";
  if (/gerrit|repo|code|change|commit/i.test(operationId)) {
    targetKind = "codespace";
  } else if (/workspace|agentWorkspace|file|artifact|proposal|context/i.test(operationId)) {
    targetKind = "sharedspace";
  } else if (/knowledge|dossier|distillation|evidence|asset/i.test(operationId)) {
    targetKind = "knowledge";
  }
  const provider = targetProvider || (
    /gerrit/i.test(operationId)
      ? "gerrit"
      : /github/i.test(operationId)
        ? "github"
        : targetKind === "codespace"
          ? "repository"
          : "pact"
  );
  const workspaceId = firstString([
    envelope.workspaceId,
    input.workspaceRef,
    input.workspaceId,
    payload.workspaceRef,
    payload.workspaceId,
    findFirstDeepString(payload, ["workspaceRef", "workspaceId"])
  ]);
  const repositoryRef = firstString([
    input.repositoryRef,
    input.repositoryId,
    input.repo,
    input.project,
    payload.repositoryRef,
    payload.repositoryId,
    payload.project,
    findFirstDeepString(payload, ["repositoryRef", "repositoryId", "repo", "project"])
  ]);
  const changeRef = firstString([
    input.changeRef,
    input.changeId,
    input.changeNumber,
    payload.changeRef,
    payload.changeId,
    payload.changeNumber,
    findFirstDeepString(payload, ["changeRef", "changeId", "changeNumber"])
  ]);
  return {
    schemaVersion: 1,
    targetKind,
    targetProvider: provider,
    targetRef: firstString([
      input.targetRef,
      payload.targetRef,
      changeRef,
      repositoryRef,
      workspaceId
    ]),
    workspaceId,
    repositoryRef,
    branch: firstString([
      input.branch,
      input.branchName,
      payload.branch,
      payload.branchName,
      findFirstDeepString(payload, ["branch", "branchName"])
    ]),
    changeRef,
    reviewUrl: firstString([
      input.reviewUrl,
      input.url,
      payload.reviewUrl,
      payload.url,
      findFirstDeepString(payload, ["reviewUrl", "webUrl", "url"])
    ]),
    externalId: firstString([
      input.externalId,
      payload.externalId,
      findFirstDeepString(payload, ["externalId", "id"])
    ]),
    status: firstString([
      payload.status,
      payload.state,
      payload.ok === false ? "failed" : "",
      payload.ok === true ? "ok" : ""
    ]) || "completed"
  };
}

function mcpReplyPayload(payload) {
  const text = JSON.stringify(payload ?? {});
  if (text.length <= 32_000) {
    return payload;
  }
  if (Array.isArray(payload)) {
    return { type: "array", length: payload.length };
  }
  if (payload && typeof payload === "object") {
    return { type: "object", keys: Object.keys(payload).slice(0, 40) };
  }
  return { value: payload };
}

function sseWrite(connection, payload) {
  try {
    connection.response.write(`event: message\n`);
    connection.response.write(`data: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function broadcastMcpNotification(payload, { grantId = "" } = {}) {
  for (const connection of activeSseConnections) {
    if (grantId && connection.grantId !== grantId) {
      continue;
    }
    if (!grantId && connection.privateOnly === true) {
      continue;
    }
    sseWrite(connection, payload);
  }
}

function broadcastMcpOperationReply({ envelope, operation, status, target, payload = {}, error = null, authorization = null }) {
  const grantId = authorization?.grant?.id || "";
  const message = status === "completed"
    ? `已完成 ${operation} 任务`
    : `${operation} 任务执行失败`;
  broadcastMcpNotification(jsonRpcNotification("notifications/pact/operation_reply", {
    schemaVersion: 1,
    status,
    operation,
    message,
    envelope: mcpEnvelopePublic(envelope),
    target,
    payload: mcpReplyPayload(payload),
    error,
    completedAt: new Date().toISOString()
  }), { grantId });
}

function sendMcpSseVersionEvent(request, response, toolManagementPlatform) {
  normalizeApiKeyHeader(request);
  const authorization = hasMcpAuthToken(request)
    ? authorizeMcpRequest({ request, toolManagementPlatform })
    : { ok: false };
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

  const connection = {
    response,
    grantId: authorization.ok ? authorization.grant?.id || "" : "",
    grant: authorization.ok ? authorization.grant : null,
    privateOnly: authorization.ok
  };
  activeSseConnections.add(connection);

  const heartbeat = setInterval(() => {
    response.write(`:\n\n`);
  }, 15000);

  request.on('close', () => {
    activeSseConnections.delete(connection);
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
    if (toolName !== MCP_STABLE_TOOL_NAME && !ACCEPTED_OUTLET_TOOL_NAMES.has(toolName)) {
      return jsonRpcError(id, -32601, `Method not found. Please use the categorized outlets (e.g., '${MCP_DISCOVERY_TOOL_NAME}' or '${MCP_KNOWLEDGE_TOOL_NAME}') for all operations.`, {
        code: "method_not_found",
        stableToolName: MCP_STABLE_TOOL_NAME,
        categorizedOutlets: Array.from(CATEGORIZED_TOOL_NAMES)
      });
    }

    normalizeApiKeyHeader(request);
    const authorization = authorizeMcpRequest({ request, toolManagementPlatform });
    if (!authorization.ok) {
      return {
        httpStatus: authorization.status || 401,
        body: jsonRpcError(id, -32001, authorization.error || "MCP authorization failed.", {
          code: authorization.reasonCode || "authorization_denied"
        })
      };
    }
    parsedCall = normalizeMcpOperationEnvelope(params.arguments, authorization);
    if (!parsedCall.ok) {
      const error = parsedCall.error;
      error.id = id;
      return error;
    }
    const metaResult = pactMetaResult({
      operation: parsedCall.operation,
      input: parsedCall.input,
      envelope: parsedCall.envelope,
      toolManagementPlatform,
      authorization
    });
    if (metaResult) {
      return jsonRpcResult(id, metaResult);
    }
    if (ACCEPTED_OUTLET_TOOL_NAMES.has(parsedCall.operation)) {
      return {
        httpStatus: 200,
        body: jsonRpcError(id, -32602, `${parsedCall.operation} is an outlet tool name, not a concrete operation id. First call tool '${MCP_DISCOVERY_TOOL_NAME}' with operation 'pact.capabilities.list', then use one returned operations[].name as arguments.operation.`, {
          code: "outlet_name_used_as_operation",
          outlet: parsedCall.operation,
          discoveryTool: MCP_DISCOVERY_TOOL_NAME,
          discoveryOperation: "pact.capabilities.list",
          example: {
            name: MCP_DISCOVERY_TOOL_NAME,
            arguments: {
              apiVersion: MCP_INTERFACE_VERSION,
              operation: "pact.capabilities.list",
              input: {}
            }
          }
        })
      };
    }
    const mcpExecutionContext = {
      transport: "mcp",
      client: request?.headers?.["user-agent"] || "",
      traceId: parsedCall.envelope.traceId,
      operatorId: parsedCall.envelope.operatorId,
      agentId: parsedCall.envelope.operatorId,
      profileId: parsedCall.envelope.agentProfileId,
      agentProfileId: parsedCall.envelope.agentProfileId,
      subject: parsedCall.envelope.subject,
      workspaceId: parsedCall.envelope.workspaceId,
      intent: parsedCall.envelope.intent,
      idempotencyKey: parsedCall.envelope.idempotencyKey,
      requestedScopes: parsedCall.envelope.requestedScopes
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
      context: mcpExecutionContext,
      dryRun: parsedCall.envelope.dryRun
    });
    if (!result.ok) {
      const error = result.payload?.error || {};
      const status = result.status || 500;
      const target = inferMcpTargetReceipt({
        operation: parsedCall.operation,
        input: resolvedWorkspaceInput.input,
        payload: result.payload || {},
        envelope: parsedCall.envelope
      });
      broadcastMcpOperationReply({
        envelope: parsedCall.envelope,
        operation: parsedCall.operation,
        status: "failed",
        target,
        payload: result.payload || {},
        error: {
          code: error.code || "tool_call_failed",
          message: error.message || "MCP tool call failed.",
          details: error.details || {}
        },
        authorization
      });
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
    const target = inferMcpTargetReceipt({
      operation: parsedCall.operation,
      input: resolvedWorkspaceInput.input,
      payload: publicPayload,
      envelope: parsedCall.envelope
    });
    broadcastMcpOperationReply({
      envelope: parsedCall.envelope,
      operation: parsedCall.operation,
      status: "completed",
      target,
      payload: publicPayload,
      authorization
    });
    return jsonRpcResult(id, mcpToolResult({
      result: {
        operation: parsedCall.operation,
        ...mcpVersionInfo(),
        envelope: mcpEnvelopePublic(parsedCall.envelope),
        target,
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

  if (url.pathname === "/api/mcp/local-uninstall") {
    if (method !== "POST") {
      response.writeHead(405, { Allow: "POST", "Cache-Control": "no-store" });
      response.end();
      return true;
    }
    try {
      const result = await markLocalMcpGrantUninstalled({
        request,
        requestBody,
        toolManagementPlatform
      });
      sendJson(response, result.status, result.body);
    } catch (error) {
      logger?.warn?.("mcp.local_uninstall.failed", {
        requestId: request?.__pactRequestId || "",
        error: error?.message || "local uninstall update failed"
      });
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "local_uninstall_failed",
          message: "MCP local uninstall update could not be processed."
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
    sendMcpSseVersionEvent(request, response, toolManagementPlatform);
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
