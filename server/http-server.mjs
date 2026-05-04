import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createBatchDeletionCoordinator } from "./application/batch-deletion-coordinator.mjs";
import { createMaintenanceAgentService } from "./application/MaintenanceAgent/index.mjs";
import { createKnowledgeSourceService } from "./application/knowledge-source-service.mjs";
import { createConsoleAuth } from "./auth/console-auth.mjs";
import { createOperationAuditStore } from "./security/operation-audit.mjs";
import { createToolManagementPlatform } from "./tool-management/index.mjs";
import { createAgentWorkspace } from "./modules/AgentWorkspace/index.mjs";
import { createContextRuntime } from "./modules/ContextRuntime/index.mjs";
import { createAgentExplorationRuntime } from "./modules/AgentExplorationRuntime/index.mjs";
import { createAgentEvaluationRuntime } from "./modules/AgentEvaluationRuntime/index.mjs";
import { createEvidenceSufficiencyGate } from "./modules/EvidenceSufficiencyGate/index.mjs";
import { createKnowledgeAgentSkillRuntime } from "./modules/KnowledgeAgentSkillRuntime/index.mjs";
import { createGoldenRuleRuntime } from "./modules/GoldenRuleRuntime/index.mjs";
import { createKnowledgeRuleAuthoringRuntime } from "./modules/KnowledgeRuleAuthoringRuntime/index.mjs";
import { createKnowledgeSkillRuntime } from "./modules/KnowledgeSkillRuntime/index.mjs";
import { createKnowledgeDistillationRuntime } from "./modules/KnowledgeDistillationRuntime/index.mjs";
import { createKnowledgeEvolutionRuntime } from "./modules/KnowledgeEvolutionRuntime/index.mjs";
import { createModelDecisionRuntime } from "./modules/ModelDecisionRuntime/index.mjs";
import { createSummarizationRuntime } from "./modules/SummarizationRuntime/index.mjs";
import { loadSettings } from "./config.mjs";
import { callAgentGateway } from "./modules/AgentGateway/index.mjs";
import {
  loadDiscoveryConfig,
  resolveDiscoveryState,
  saveDiscoveryConfig
} from "./discovery-config.mjs";
import { createJobManager } from "./jobs/job-manager.mjs";
import {
  createRuntimeLogger,
  setRuntimeLogger,
  summarizeError
} from "./observability/runtime-logger.mjs";
import {
  createTraceContext,
  runWithTraceContext,
  setTraceContextOnRequest
} from "./observability/trace-context.mjs";
import { createProtocolEventBus } from "./protocols/pubsub/event-bus.mjs";
import { loadAgentSyncConfig } from "./protocols/agent-sync/policy.mjs";
import { createServerRuntime } from "./runtime/server-runtime.mjs";
import {
  dispatchRegisteredHttpOperation,
  dispatchRpcOperation,
  shouldProxyRegisteredApiRequest
} from "./interfaces/api/operation-dispatcher.mjs";
import {
  SERVER_API_OPERATIONS,
  listInterfaceCatalog
} from "./interfaces/api/operation-registry.mjs";
import { createJobsController } from "./interfaces/http/controllers/jobs-controller.mjs";
import { createSystemController } from "./interfaces/http/controllers/system-controller.mjs";
import { buildConsoleState } from "./interfaces/http/api-facade.mjs";
import {
  defaultAdvertisedHost,
  formatUrlHost,
  readRequestBody,
  sendJson,
  serveStaticFile
} from "./interfaces/http/http-utils.mjs";

async function proxyApiRequest({
  request,
  response,
  requestBody,
  targetBaseUrl,
  discoveryState,
  logger = null
}) {
  const upstreamUrl = new URL(request.url || "/", targetBaseUrl);
  const startedAt = Date.now();
  logger?.info?.("http.proxy.started", {
    requestId: request.__splitallRequestId || "",
    method: request.method || "GET",
    route: upstreamUrl.pathname,
    targetBaseUrl,
    serverId: discoveryState.serverId,
    activeServiceUrl: discoveryState.activeServiceUrl,
    bodyBytes: requestBody?.length || 0
  });
  const headers = new Headers();
  const allowedRequestHeaders = new Set([
    "accept",
    "authorization",
    "content-type",
    "cookie",
    "x-splitall-csrf",
    "x-splitall-safety-confirm",
    "x-splitall-confirm",
    "x-splitall-tool-token"
  ]);

  for (const [name, value] of Object.entries(request.headers || {})) {
    if (!value) {
      continue;
    }

    const lower = name.toLowerCase();
    if (!allowedRequestHeaders.has(lower)) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
      continue;
    }

    headers.set(name, value);
  }

  headers.set("x-splitall-forwarded-by", discoveryState.serverId);
  headers.set("x-splitall-active-service", discoveryState.activeServiceUrl);
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("content-length", String(requestBody?.length || 0));
  }

  let upstream;
  try {
    upstream = await new Promise((resolve, reject) => {
      const client = upstreamUrl.protocol === "https:" ? https : http;
      const upstreamRequest = client.request(
        upstreamUrl,
        {
          method: request.method || "GET",
          headers: Object.fromEntries(headers.entries()),
          timeout: 30_000
        },
        (upstreamResponse) => {
          const chunks = [];
          upstreamResponse.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          upstreamResponse.on("end", () => {
            resolve({
              status: upstreamResponse.statusCode || 502,
              headers: upstreamResponse.headers,
              body: Buffer.concat(chunks)
            });
          });
        }
      );
      upstreamRequest.on("timeout", () => {
        upstreamRequest.destroy(new Error("上游服务请求超时。"));
      });
      upstreamRequest.on("error", reject);
      if (request.method !== "GET" && request.method !== "HEAD" && requestBody?.length) {
        upstreamRequest.write(requestBody);
      }
      upstreamRequest.end();
    });
  } catch (error) {
    logger?.error?.("http.proxy.failed", {
      requestId: request.__splitallRequestId || "",
      method: request.method || "GET",
      route: upstreamUrl.pathname,
      targetBaseUrl,
      durationMs: Date.now() - startedAt,
      error: summarizeError(error)
    });
    throw error;
  }
  const upstreamHeaders = {};
  for (const [name, value] of Object.entries(upstream.headers || {})) {
    const lower = name.toLowerCase();
    if (lower === "transfer-encoding" || lower === "content-length") {
      continue;
    }

    upstreamHeaders[name] = value;
  }
  upstreamHeaders["x-splitall-forwarded-by"] = discoveryState.serverId;
  upstreamHeaders["x-splitall-active-service"] = discoveryState.activeServiceUrl;

  response.writeHead(upstream.status, upstreamHeaders);
  response.end(upstream.body);
  logger?.info?.("http.proxy.completed", {
    requestId: request.__splitallRequestId || "",
    method: request.method || "GET",
    route: upstreamUrl.pathname,
    targetBaseUrl,
    statusCode: upstream.status,
    responseBytes: upstream.body?.length || 0,
    durationMs: Date.now() - startedAt
  });
}

async function handleStaticFallback({ url, response, distPath, discoveryState }) {
  if (url.pathname === "/" && !distPath) {
    sendJson(response, 200, {
      ok: true,
      service: "SplitAll Server",
      serverId: discoveryState.serverId,
      activeServiceUrl: discoveryState.activeServiceUrl
    });
    return;
  }

  const served = await serveStaticFile(response, distPath, url.pathname);
  if (served) {
    return;
  }

  if (path.extname(url.pathname)) {
    sendJson(response, 404, {
      error: `资源不存在：${url.pathname}`
    });
    return;
  }

  if (!distPath) {
    sendJson(response, 404, {
      error: `接口不存在：${url.pathname}`
    });
    return;
  }

  const fallback = await fs.readFile(path.join(distPath, "index.html"));
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(fallback);
}

function applySecurityHeaders(response) {
  if (response.headersSent) {
    return;
  }
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function resolveConsoleAuthEnabled({ runtimeOptions = {} }) {
  const mode = String(runtimeOptions.consoleAuth || process.env.SPLITALL_CONSOLE_AUTH || "enabled")
    .trim()
    .toLowerCase();
  if (mode === "disabled") {
    throw new Error(
      "SPLITALL_CONSOLE_AUTH=disabled 已被移除；服务端控制台认证必须始终开启。"
    );
  }
  return true;
}

function parseAllowPublicConsoleFlag(runtimeOptions = {}) {
  const value =
    runtimeOptions.allowPublicConsole ??
    process.env.SPLITALL_ALLOW_PUBLIC_CONSOLE ??
    "";
  return value === true || ["1", "true", "yes"].includes(String(value).trim().toLowerCase());
}

function normalizeListenHost(host) {
  return String(host || "").trim().toLowerCase();
}

function isLoopbackListenHost(host) {
  const value = normalizeListenHost(host);
  return !value ||
    value === "localhost" ||
    value === "127.0.0.1" ||
    value === "::1" ||
    value === "[::1]";
}

function assertSafeListenHost(host, runtimeOptions = {}) {
  if (isLoopbackListenHost(host) || parseAllowPublicConsoleFlag(runtimeOptions)) {
    return;
  }
  throw new Error(
    "服务端默认只允许监听本机回环地址。若确需暴露到局域网/公网，请显式设置 SPLITALL_ALLOW_PUBLIC_CONSOLE=1 或 --allow-public-console，并确保前置网络访问控制已配置。"
  );
}

export async function startHttpServer({
  userDataPath,
  distPath,
  jobManager: incomingJobManager,
  runtimeOptions = {},
  discoveryOptions = {},
  host = "127.0.0.1",
  port = 0,
  advertisedHost = ""
}) {
  assertSafeListenHost(host, runtimeOptions);
  const runtimeLogger = createRuntimeLogger({
    userDataPath,
    runtimeOptions,
    component: "server"
  });
  setRuntimeLogger(runtimeLogger);
  runtimeLogger.info("server.start.requested", {
    host,
    port,
    advertisedHost,
    distPath,
    userDataPath,
    profile: runtimeOptions?.profile || "",
    logDir: runtimeLogger.logDir,
    retentionDays: runtimeLogger.retentionDays
  });
  const serverLabel = os.hostname();
  const consoleAuthEnabled = resolveConsoleAuthEnabled({ runtimeOptions });
  const runtime = await createServerRuntime({
    userDataPath,
    runtimeOptions
  });
  const consoleAuth = createConsoleAuth({ userDataPath });
  const operationAuditStore = createOperationAuditStore({ userDataPath });
  const operationConcurrencyScope = path.resolve(userDataPath);
  const initialOwner = consoleAuthEnabled
    ? await consoleAuth.ensureInitialOwner()
    : { created: false };
  if (initialOwner.created) {
    console.log(`Console initial owner username: ${initialOwner.username}`);
    console.log(`Console initial owner password: ${initialOwner.password}`);
    console.log("Console initial owner password is shown once and is not written to disk.");
    console.log("Change/reset it with: npm run server:auth -- set-password --username owner --generate-password");
  }
  const protocolEventBus = createProtocolEventBus({ userDataPath, logger: runtimeLogger });
  const jobManager =
    incomingJobManager ||
    createJobManager({
      userDataPath,
      runtimeOptions: runtime.runtimeOptions,
      getRuntimeOptions: () => runtime.runtimeOptions,
      protocolEventBus,
      logger: runtimeLogger
    });
  const ownsJobManager = !incomingJobManager;
  const { metadataStore } = runtime;
  const deletionCoordinator = createBatchDeletionCoordinator({
    userDataPath,
    jobManager,
    metadataStore,
    runtime
  });
  const contextRuntime = createContextRuntime({
    userDataPath,
    agentGatewayCall: async (input = {}) => callAgentGateway({
      settings: await loadSettings(userDataPath),
      input,
      userDataPath
    })
  });
  let controllersRef = null;
  const maintenanceAgent = createMaintenanceAgentService({
    userDataPath,
    runtime,
    jobManager,
    metadataStore,
    protocolEventBus,
    getDiscoveryState: () => discoveryState,
    getListenUrl: () => listenUrl,
    contextRuntime,
    getControllers: () => controllersRef,
    operationAuditStore,
    operationConcurrencyScope,
    schedulerEnabled: process.env.SPLITALL_MAINTENANCE_WORKER_EXTERNAL !== "1",
    logger: runtimeLogger
  });
  const knowledgeSourceService = createKnowledgeSourceService({
    userDataPath,
    jobManager,
    protocolEventBus,
    watchingEnabled: process.env.SPLITALL_SOURCE_WATCHER_EXTERNAL !== "1"
  });
  const agentWorkspace = createAgentWorkspace({ userDataPath });
  const modelDecisionRuntime = createModelDecisionRuntime({
    agentGatewayCall: async (input = {}) => callAgentGateway({
      settings: await loadSettings(userDataPath),
      input,
      userDataPath,
      contextRuntime,
      contextCompactionSource: "model-decision-runtime"
    })
  });
  const evidenceSufficiencyGate = createEvidenceSufficiencyGate();
  const knowledgeAgentSkill = createKnowledgeAgentSkillRuntime({
    runtime,
    evidenceGate: evidenceSufficiencyGate,
    modelDecisionRuntime
  });
  const goldenRuleRuntime = createGoldenRuleRuntime({
    userDataPath,
    knowledgeCore: runtime?.mounts?.knowledgeBase
  });
  const knowledgeRuleAuthoringRuntime = createKnowledgeRuleAuthoringRuntime({
    userDataPath,
    goldenRuleRuntime,
    modelDecisionRuntime
  });
  const knowledgeSkillRuntime = createKnowledgeSkillRuntime({
    userDataPath,
    runtime,
    modelDecisionRuntime,
    goldenRuleRuntime
  });
  const agentEvaluationRuntime = createAgentEvaluationRuntime({
    userDataPath,
    knowledgeAgentSkill
  });
  const knowledgeDistillationRuntime = createKnowledgeDistillationRuntime({
    userDataPath,
    runtime,
    knowledgeSkillRuntime,
    goldenRuleRuntime,
    evidenceGate: evidenceSufficiencyGate,
    modelDecisionRuntime
  });
  const knowledgeEvolutionRuntime = createKnowledgeEvolutionRuntime({
    userDataPath,
    knowledgeCore: runtime?.mounts?.knowledgeBase,
    agentEvaluationRuntime,
    modelDecisionRuntime,
    knowledgeSkillRuntime,
    goldenRuleRuntime,
    knowledgeDistillationRuntime
  });
  const summarizationRuntime = createSummarizationRuntime({
    userDataPath,
    runtime,
    agentWorkspace,
    contextRuntime,
    protocolEventBus
  });
  const agentExplorationRuntime = createAgentExplorationRuntime({
    userDataPath,
    runtime,
    agentWorkspace,
    contextRuntime,
    agentGatewayCall: async (input = {}) => callAgentGateway({
      settings: await loadSettings(userDataPath),
      input,
      userDataPath,
      contextRuntime,
      contextCompactionSource: "agent-exploration-runtime"
    }),
    knowledgeSkillRuntime,
    knowledgeRuleAuthoringRuntime
  });
  let discoveryState = await loadDiscoveryConfig(userDataPath);
  let listenUrl = "";
  let toolManagementPlatformRef = null;

  const jobsController = createJobsController({
    userDataPath,
    jobManager,
    metadataStore,
    deletionCoordinator,
    getDiscoveryState: () => discoveryState,
    proxyApiRequest,
    protocolEventBus
  });
  const systemController = createSystemController({
    userDataPath,
    distPath,
    runtime,
    jobManager,
    metadataStore,
    serverLabel,
    getDiscoveryState: () => discoveryState,
    setDiscoveryState: (value) => {
      discoveryState = value;
    },
    getListenUrl: () => listenUrl,
    getInterfaceCatalog: () => listInterfaceCatalog(SERVER_API_OPERATIONS),
    protocolEventBus,
    consoleAuth,
    operationAuditStore,
    maintenanceAgent,
    knowledgeSourceService,
    agentWorkspace,
    contextRuntime,
    evidenceSufficiencyGate,
    knowledgeAgentSkill,
    goldenRuleRuntime,
    knowledgeRuleAuthoringRuntime,
    knowledgeSkillRuntime,
    knowledgeDistillationRuntime,
    agentEvaluationRuntime,
    modelDecisionRuntime,
    knowledgeEvolutionRuntime,
    summarizationRuntime,
    agentExplorationRuntime,
    getToolManagementPlatform: () => toolManagementPlatformRef
  });
  const controllers = {
    jobs: jobsController,
    system: systemController
  };
  controllersRef = controllers;
  const toolManagementPlatform = createToolManagementPlatform({
    userDataPath,
    operations: SERVER_API_OPERATIONS,
    controllers,
    operationAuditStore,
    operationConcurrencyScope,
    protocolEventBus,
    consoleAuth,
    logger: runtimeLogger
  });
  toolManagementPlatformRef = toolManagementPlatform;

  const server = http.createServer(async (request, response) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const traceContext = createTraceContext({
      requestId,
      transport: "http",
      actor: { type: "http-request" }
    });
    setTraceContextOnRequest(request, traceContext);
    response.setHeader("X-SplitAll-Trace-Id", traceContext.traceId);
    request.__splitallRequestId = requestId;
    let finished = false;
    response.once("finish", () => {
      finished = true;
      runtimeLogger.info("http.request.completed", {
        traceId: traceContext.traceId,
        requestId,
        method: request.method || "GET",
        route: (() => {
          try {
            return new URL(request.url || "/", "http://127.0.0.1").pathname;
          } catch {
            return request.url || "/";
          }
        })(),
        statusCode: response.statusCode,
        contentLength: response.getHeader("content-length") || "",
        durationMs: Date.now() - startedAt
      });
    });
    response.once("close", () => {
      if (finished) {
        return;
      }
      runtimeLogger.warn("http.request.closed", {
        traceId: traceContext.traceId,
        requestId,
        method: request.method || "GET",
        route: (() => {
          try {
            return new URL(request.url || "/", "http://127.0.0.1").pathname;
          } catch {
            return request.url || "/";
          }
        })(),
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt
      });
    });
    await runWithTraceContext(traceContext, async () => {
    try {
      applySecurityHeaders(response);
      const method = request.method || "GET";
      const url = new URL(request.url || "/", "http://127.0.0.1");
      runtimeLogger.info("http.request.started", {
        traceId: traceContext.traceId,
        requestId,
        method,
        route: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        remoteAddress: request.socket?.remoteAddress || "",
        userAgent: request.headers["user-agent"] || "",
        contentType: request.headers["content-type"] || "",
        contentLength: request.headers["content-length"] || ""
      });
      const requestBody =
        method === "GET" || method === "HEAD" ? Buffer.alloc(0) : await readRequestBody(request);

      if (method === "POST" && url.pathname === "/api/rpc") {
        await dispatchRpcOperation({
          operations: SERVER_API_OPERATIONS,
          controllers,
          request,
          response,
          requestBody,
          authorizeOperation: consoleAuthEnabled
            ? (input) => consoleAuth.authorizeOperation(input)
            : null,
          operationAuditStore,
          concurrencyScope: operationConcurrencyScope,
          logger: runtimeLogger
        });
        return;
      }

      const handledAgentToolCompat = await toolManagementPlatform.router.handleCompatAgentToolHttpRequest({
        request,
        response,
        requestBody,
        url,
        method
      });
      if (handledAgentToolCompat) {
        return;
      }

      if (
        shouldProxyRegisteredApiRequest({
          pathname: url.pathname,
          discoveryState,
          operations: SERVER_API_OPERATIONS
        })
      ) {
        await proxyApiRequest({
          request,
          response,
          requestBody,
          targetBaseUrl: discoveryState.forwardBaseUrl || discoveryState.activeServiceUrl,
          discoveryState,
          logger: runtimeLogger
        });
        return;
      }

      const handled = await dispatchRegisteredHttpOperation({
        operations: SERVER_API_OPERATIONS,
        controllers,
        method,
        url,
        request,
        response,
        requestBody,
        authorizeOperation: consoleAuthEnabled
          ? (input) => consoleAuth.authorizeOperation(input)
          : null,
        operationAuditStore,
        concurrencyScope: operationConcurrencyScope,
        logger: runtimeLogger
      });
      if (handled) {
        return;
      }

      await handleStaticFallback({
        url,
        response,
        distPath,
        discoveryState
      });
    } catch (error) {
      runtimeLogger.error("http.request.failed", {
        traceId: traceContext.traceId,
        requestId,
        method: request.method || "GET",
        route: (() => {
          try {
            return new URL(request.url || "/", "http://127.0.0.1").pathname;
          } catch {
            return request.url || "/";
          }
        })(),
        durationMs: Date.now() - startedAt,
        error: summarizeError(error)
      });
      const message = error instanceof Error ? error.message : "Internal error";
      sendJson(response, 500, {
        error: message
      });
    }
    });
  });
  const openSockets = new Set();
  server.on("connection", (socket) => {
    openSockets.add(socket);
    runtimeLogger.debug("http.connection.opened", {
      remoteAddress: socket.remoteAddress || "",
      remotePort: socket.remotePort || 0,
      openSocketCount: openSockets.size
    });
    socket.on("close", () => {
      openSockets.delete(socket);
      runtimeLogger.debug("http.connection.closed", {
        remoteAddress: socket.remoteAddress || "",
        remotePort: socket.remotePort || 0,
        openSocketCount: openSockets.size
      });
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("无法确定本地服务监听地址。");
  }
  runtimeLogger.info("server.listen.ready", {
    host,
    boundAddress: address.address,
    port: address.port
  });

  const listenHost = typeof address.address === "string" ? address.address : host;
  const resolvedAdvertisedHost = advertisedHost || defaultAdvertisedHost(host);
  listenUrl = `http://${formatUrlHost(resolvedAdvertisedHost)}:${address.port}`;
  discoveryState = await resolveDiscoveryState(userDataPath, {
    listenUrl,
    serverLabel,
    overrides: discoveryOptions
  });
  await saveDiscoveryConfig(userDataPath, discoveryState, {
    listenUrl,
    serverLabel
  });
  await protocolEventBus.publish(
    "server.lifecycle",
    {
      status: "started",
      serverId: discoveryState.serverId,
      listenUrl,
      activeServiceUrl: discoveryState.activeServiceUrl,
      mode: discoveryState.mode
    },
    { type: "server.started" }
  );
  await protocolEventBus.publish(
    "system.interfaces",
    {
      transport: {
        http: "direct",
        rpc: "POST /api/rpc",
        events: "GET /api/events"
      },
      interfaces: listInterfaceCatalog(SERVER_API_OPERATIONS)
    },
    { type: "system.interfaces.snapshot" }
  );
  await protocolEventBus.publish(
    "discovery.config",
    {
      value: discoveryState
    },
    { type: "discovery.config.snapshot" }
  );
  await protocolEventBus.publish(
    "agent_sync.config",
    await loadAgentSyncConfig(userDataPath),
    { type: "agent_sync.config.snapshot" }
  );
  await maintenanceAgent.start();
  await knowledgeSourceService.start();
  await protocolEventBus.publish(
    "system.console_state",
    {
        state: await buildConsoleState({
          userDataPath,
          distPath,
          runtime,
          discoveryState,
          jobManager,
          metadataStore,
          serverUrl: listenUrl,
          consoleAuth,
          maintenanceAgent
        })
    },
    { type: "system.console_state.snapshot" }
  );
  await protocolEventBus.publish(
    "storage.summary",
    metadataStore.getStorageSummary(),
    { type: "storage.summary.snapshot" }
  );
  await deletionCoordinator.resumePendingDeletions();
  runtimeLogger.info("server.started", {
    listenUrl,
    serverId: discoveryState.serverId,
    activeServiceUrl: discoveryState.activeServiceUrl,
    mode: discoveryState.mode
  });

  return {
    server,
    host: listenHost,
    port: address.port,
    url: listenUrl,
    discovery: discoveryState,
    initialOwner: initialOwner.created
      ? {
          created: true,
          username: initialOwner.username,
          password: initialOwner.password
        }
      : { created: false },
    close: () =>
      new Promise((resolve, reject) => {
        runtimeLogger.info("server.close.started", {
          openSocketCount: openSockets.size
        });
        for (const socket of openSockets) {
          socket.destroy();
        }
        server.close(async (error) => {
          try {
            if (ownsJobManager) {
              await jobManager.close();
            }
            await maintenanceAgent.close();
            await knowledgeSourceService.close();
            agentWorkspace.close();
            knowledgeSkillRuntime.close();
            toolManagementPlatform.close();
            await runtime.close();
            consoleAuth.close();
            operationAuditStore.close();

            if (error) {
              runtimeLogger.error("server.close.failed", {
                error: summarizeError(error)
              });
              await runtimeLogger.close();
              reject(error);
              return;
            }

            runtimeLogger.info("server.close.completed", {});
            await runtimeLogger.close();
            resolve();
          } catch (closeError) {
            runtimeLogger.error("server.close.failed", {
              error: summarizeError(closeError)
            });
            await runtimeLogger.close();
            reject(closeError);
          }
        });
      })
  };
}

export async function startLocalHttpServer(options) {
  return startHttpServer({
    host: "127.0.0.1",
    port: 0,
    ...options
  });
}
