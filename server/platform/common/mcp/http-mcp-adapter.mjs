import { sendJson } from "../console/http/http-utils.mjs";

export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const DEFAULT_TIMEOUT_MS = 300_000;
export const MCP_INTERFACE_VERSION = "agentstudio.mcp.v1";
export const MCP_TOOLSET_VERSION = "2026-05-22.1";
export const MCP_STABLE_TOOL_NAME = "agentstudio.call";
export const MCP_SERVER_VERSION = "0.2.0";
export const MCP_CONNECTOR_PACKAGE_NAME = "agentstudio-mcp-connector";
export const MCP_CONNECTOR_VERSION = "0.2.0";
export const MCP_CONNECTOR_GITHUB_REPO = "Unka-Malloc/AgentStudio";
export const AGENTSTUDIO_MCP_URL_ENV = "AGENTSTUDIO_MCP_URL";
export const AGENTSTUDIO_MCP_DISCOVERY_URL_ENV = "AGENTSTUDIO_MCP_DISCOVERY_URL";
export const AGENTSTUDIO_MCP_DISCOVERY_FILE_ENV = "AGENTSTUDIO_MCP_DISCOVERY_FILE";
export const AGENTSTUDIO_MCP_DISCOVERY_FILE = "~/.agentstudio/mcp/servers.json";

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
  if (!headers.authorization && !headers["x-agentstudio-tool-token"] && headers["x-agentstudio-api-key"]) {
    headers["x-agentstudio-tool-token"] = String(headers["x-agentstudio-api-key"] || "").trim();
  }
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

function agentStudioCallTool() {
  return {
    name: MCP_STABLE_TOOL_NAME,
    title: "AgentStudio Call",
    description: "Stable AgentStudio MCP entrypoint. Pass an AgentStudio operation id and input; AgentStudio handles routing, authorization, versioning, and audit.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["operation"],
      properties: {
        apiVersion: {
          type: "string",
          description: "AgentStudio MCP interface version expected by the caller.",
          default: MCP_INTERFACE_VERSION,
          enum: [MCP_INTERFACE_VERSION]
        },
        operation: {
          type: "string",
          description: "Internal AgentStudio operation id, for example system.health or agentstudio.knowledge.search."
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
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false
    },
    _meta: {
      interfaceVersion: MCP_INTERFACE_VERSION,
      toolsetVersion: MCP_TOOLSET_VERSION,
      stableTool: true,
      upgradeNotification: "notifications/tools/list_changed"
    }
  };
}

function mcpVersionInfo() {
  return {
    interfaceVersion: MCP_INTERFACE_VERSION,
    toolsetVersion: MCP_TOOLSET_VERSION,
    serverVersion: MCP_SERVER_VERSION,
    stableToolName: MCP_STABLE_TOOL_NAME,
    listChanged: true,
    upgradeNotification: "notifications/tools/list_changed",
    connector: {
      packageName: MCP_CONNECTOR_PACKAGE_NAME,
      packageVersion: MCP_CONNECTOR_VERSION
    }
  };
}

function mcpDiscoveryBase({ listenUrl = "", discoveryState = null } = {}) {
  const baseUrl = String(discoveryState?.activeServiceUrl || listenUrl || "http://127.0.0.1:8787").replace(/\/+$/, "");
  let vmBaseUrl = "http://host.orb.internal:8787";
  try {
    const parsed = new URL(baseUrl);
    vmBaseUrl = `${parsed.protocol}//host.orb.internal:${parsed.port || (parsed.protocol === "https:" ? "443" : "80")}`;
  } catch {
    // Keep the conservative default.
  }
  return { baseUrl, vmBaseUrl };
}

export function buildAgentStudioMcpDiscovery({ listenUrl = "", discoveryState = null } = {}) {
  const { baseUrl, vmBaseUrl } = mcpDiscoveryBase({ listenUrl, discoveryState });
  const installCommand = `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest register --url ${baseUrl}`;
  const clientInstallCommand = `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest install --url ${baseUrl} --target <client> --token-stdin`;
  const interactiveInstallCommand = `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest install`;
  const githubOneLineCommand = `/bin/sh -c "$(curl -fsSL https://github.com/${MCP_CONNECTOR_GITHUB_REPO}/releases/latest/download/agentstudio-mcp-install.sh)"`;
  const uninstallCommand = `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest uninstall --target <client>`;
  const doctorCommand = `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest doctor --url ${baseUrl}`;
  const discoverCommand = `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest discover-local`;
  const scanCommand = `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest scan --json`;
  return {
    schemaVersion: 1,
    name: "AgentStudio",
    interfaceVersion: MCP_INTERFACE_VERSION,
    toolsetVersion: MCP_TOOLSET_VERSION,
    serverVersion: MCP_SERVER_VERSION,
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
        registryFile: AGENTSTUDIO_MCP_DISCOVERY_FILE,
        schemaVersion: "agentstudio.mcp.device-hub.v1"
      },
      env: {
        [AGENTSTUDIO_MCP_URL_ENV]: `${baseUrl}/mcp`,
        [AGENTSTUDIO_MCP_DISCOVERY_URL_ENV]: `${baseUrl}/.well-known/agentstudio/mcp.json`,
        [AGENTSTUDIO_MCP_DISCOVERY_FILE_ENV]: AGENTSTUDIO_MCP_DISCOVERY_FILE
      },
      files: [
        AGENTSTUDIO_MCP_DISCOVERY_FILE
      ],
      http: [
        `${baseUrl}/.well-known/agentstudio/mcp.json`,
        `${baseUrl}/api/mcp/discovery`
      ],
      lookupOrder: [
        "agentstudio-mcp discover-local",
        "AGENTSTUDIO_MCP_URL",
        "AGENTSTUDIO_MCP_DISCOVERY_URL",
        "AGENTSTUDIO_MCP_DISCOVERY_FILE",
        "localhost HTTP discovery"
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
      tokenInput: "stdin-or-env",
      npmExec: `npx ${MCP_CONNECTOR_PACKAGE_NAME}@latest`,
      portable: {
        requiresInstalledNode: false,
        strategy: "embedded-node-runtime",
        preferredArchive: "zip",
        bootstrapScript: "agentstudio-mcp-install.sh",
        githubLatestBootstrapUrl: `https://github.com/${MCP_CONNECTOR_GITHUB_REPO}/releases/latest/download/agentstudio-mcp-install.sh`,
        githubOneLineCommand,
        supportsMultiSelect: true,
        releaseAssetPattern: `${MCP_CONNECTOR_PACKAGE_NAME}-${MCP_CONNECTOR_VERSION}-<platform>.zip`,
        tarballReleaseAssetPattern: `${MCP_CONNECTOR_PACKAGE_NAME}-${MCP_CONNECTOR_VERSION}-<platform>.tar.gz`,
        zipInstallEntry: "install.command",
        installCommand: "./agentstudio-mcp register --url <agentstudio-url>",
        interactiveInstallCommand: "./agentstudio-mcp install",
        clientInstallCommand: "./agentstudio-mcp install --url <agentstudio-url> --target <client> --token-stdin",
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
      agentstudio: {
        httpUrl: `${baseUrl}/mcp`,
        vmHttpUrl: `${vmBaseUrl}/mcp`,
        headers: {
          "X-AgentStudio-Api-Key": "${AGENTSTUDIO_MCP_TOKEN}"
        },
        authProviderType: "agentstudio_api_key",
        timeout: DEFAULT_TIMEOUT_MS
      }
    },
    codex: {
      mcp_servers: {
        agentstudio: {
          url: `${baseUrl}/mcp`,
          bearer_token_env_var: "AGENTSTUDIO_MCP_TOKEN"
        }
      }
    },
    geminiCli: {
      mcpServers: {
        agentstudio: {
          url: `${baseUrl}/mcp`,
          type: "http",
          headers: {
            "X-AgentStudio-Api-Key": "${AGENTSTUDIO_MCP_TOKEN}"
          },
          timeout: DEFAULT_TIMEOUT_MS,
          trust: true
        }
      }
    },
    geminiExtension: {
      mcpServers: {
        agentstudio: {
          httpUrl: `${baseUrl}/mcp`,
          headers: {
            "X-AgentStudio-Api-Key": "${AGENTSTUDIO_MCP_TOKEN}"
          },
          timeout: DEFAULT_TIMEOUT_MS
        }
      }
    },
    auth: {
      type: "agentstudio_tool_management_token",
      acceptedHeaders: ["Authorization: Bearer <token>", "X-AgentStudio-Api-Key"],
      tokenSource: "AgentStudio Tool Management grant token"
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
      name: "AgentStudio",
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

function validateAgentStudioCallInput(input) {
  const payload = input && typeof input === "object" ? input : {};
  const apiVersion = String(payload.apiVersion || MCP_INTERFACE_VERSION).trim();
  if (apiVersion !== MCP_INTERFACE_VERSION) {
    return {
      ok: false,
      error: jsonRpcError(null, -32602, `Unsupported AgentStudio MCP apiVersion: ${apiVersion}`, {
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
      error: jsonRpcError(null, -32602, "agentstudio.call requires arguments.operation.", {
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

function agentStudioMetaResult({ operation, toolManagementPlatform }) {
  if (operation === "agentstudio.mcp.version" || operation === "agentstudio.version") {
    return mcpToolResult({
      result: mcpVersionInfo()
    });
  }
  if (operation === "agentstudio.capabilities.list") {
    return mcpToolResult({
      result: {
        ...mcpVersionInfo(),
        operations: activeMcpTools(toolManagementPlatform)
      }
    });
  }
  return null;
}

function sendMcpSseVersionEvent(response) {
  const payload = jsonRpcNotification("notifications/tools/list_changed", {
    ...mcpVersionInfo(),
    reason: "AgentStudio MCP tool surface or schema version changed."
  });
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive"
  });
  response.write(`event: message\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
  response.end();
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
      tools: [agentStudioCallTool()],
      _meta: mcpVersionInfo()
    });
  }

  if (method === "tools/call") {
    const toolName = String(params.name || "").trim();
    if (!toolName) {
      return jsonRpcError(id, -32602, "tools/call requires params.name.");
    }
    if (toolName !== MCP_STABLE_TOOL_NAME) {
      return jsonRpcError(id, -32602, `AgentStudio MCP exposes only ${MCP_STABLE_TOOL_NAME}.`, {
        stableToolName: MCP_STABLE_TOOL_NAME,
        expectedArguments: {
          operation: toolName,
          input: {}
        },
        upgrade: mcpVersionInfo()
      });
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
    const parsedCall = validateAgentStudioCallInput(params.arguments);
    if (!parsedCall.ok) {
      const error = parsedCall.error;
      error.id = id;
      return error;
    }
    const metaResult = agentStudioMetaResult({
      operation: parsedCall.operation,
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

export async function handleAgentStudioMcpHttpRequest({
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
  if (url.pathname === "/.well-known/agentstudio/mcp.json" || url.pathname === "/api/mcp/discovery") {
    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, { Allow: "GET", "Cache-Control": "no-store" });
      response.end();
      return true;
    }
    sendJson(response, 200, buildAgentStudioMcpDiscovery({ listenUrl, discoveryState }));
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
    sendMcpSseVersionEvent(response);
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
      requestId: request?.__agentstudioRequestId || ""
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
