import { sendJson } from "../console/http/http-utils.mjs";
import {
  buildMcpHandshakePayload,
  publicMcpIdentity,
  signMcpHandshake
} from "./identity.mjs";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const DEFAULT_TIMEOUT_MS = 300_000;
export const MCP_INTERFACE_VERSION = "pact.mcp.v1";
export const MCP_TOOLSET_VERSION = "2026-05-22.1";
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

export const MCP_SERVER_NAME = "pact-mcp-server";
export const MCP_SERVER_VERSION = "0.0.4";
export const MCP_CONNECTOR_PACKAGE_NAME = "pact-mcp-connector";
export const MCP_CONNECTOR_VERSION = "0.0.4";
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

function parseRequestBody(requestBody) {
  if (!requestBody || requestBody.length === 0) {
    return {};
  }
  return JSON.parse(requestBody.toString("utf8"));
}

function publicMcpTool(tool) {
  return {
    name: tool.id,
    title: tool.label || tool.id,
    description: tool.description || tool.label || tool.id,
    inputSchema: tool.inputSchema || { type: "object" },
    annotations: {
      readOnlyHint: tool.readOnly !== false,
      destructiveHint: tool.destructive === true
    }
  };
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
        description: "Operation id within this category."
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
      description: "Unified knowledge engine outlet. Supports knowledge distillation, collaborative knowledge sharing, evidence retrieval, and graph co-construction.",
      inputSchema: commonSchema,
      annotations: { readOnlyHint: true, destructiveHint: false },
      _meta: toolMeta
    },
    {
      name: MCP_WORKSPACE_TOOL_NAME,
      title: "Pact Workspace",
      description: "Shared agent workspace and collaborative environment outlet. Supports managing shared context, collaborative sessions, verifiable execution history, and workspace-level state orchestration.",
      inputSchema: commonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: toolMeta
    },
    {
      name: MCP_LIST_TOOL_NAME,
      title: "Pact Resource Listing",
      description: "Global resource discovery outlet. Provides unified listing for workspaces, background jobs, installed skill packages, and currently active tool catalogs.",
      inputSchema: commonSchema,
      annotations: { readOnlyHint: true, destructiveHint: false },
      _meta: toolMeta
    },
    {
      name: MCP_SKILL_TOOL_NAME,
      title: "Pact Skill & Tooling",
      description: "Specialized capability execution and unified tool management outlet. Handles execution of high-level skills, agentic workflows, and external tool packages with cross-client grant management.",
      inputSchema: commonSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: toolMeta
    },
    {
      name: MCP_HELP_TOOL_NAME,
      title: "Pact Help & Protocol",
      description: "Protocol and diagnostic outlet. Supports system health checks, protocol version negotiation, and dynamic discovery of detailed capabilities within each functional category.",
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

function createLocalMcpGrant({ request, requestBody, toolManagementPlatform, discoveryState = null }) {
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
  const resolved = toolManagementPlatform.registry.resolveToolset({});
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
      targets,
      serverId: discoveryState?.serverId || "",
      identityKeyId: discoveryState?.mcpIdentity?.keyId || ""
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
    content: [
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

function pactMetaResult({ operation, input, toolManagementPlatform }) {
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
    
    return mcpToolResult({
      result: {
        clientVersion,
        serverVersion,
        updatePushed: updateAvailable,
        message: updateAvailable ? "Update notification pushed to clients." : "Server is up-to-date with client."
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
      toolManagementPlatform
    });
    if (metaResult) {
      return jsonRpcResult(id, metaResult);
    }
    normalizeApiKeyHeader(request);
    const result = await toolManagementPlatform.runtime.executeTool({
      toolId: parsedCall.operation,
      input: parsedCall.input,
      request,
      context: {
        transport: "mcp",
        client: request?.headers?.["user-agent"] || ""
      }
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
    return jsonRpcResult(id, mcpToolResult({
      result: {
        operation: parsedCall.operation,
        ...mcpVersionInfo(),
        payload: result.payload?.result !== undefined ? result.payload.result : result.payload
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
        discoveryState
      });
      sendJson(response, result.status, result.body);
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
