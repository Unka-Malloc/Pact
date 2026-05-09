import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createBatchDeletionCoordinator } from "../client/work-queue-core/batch-deletion-coordinator.mjs";
import { resolveArchiveBatchIdentity } from "../client/work-queue-core/archive-batch-id.mjs";
import { createClientRuntimeAllocator } from "../client/client-runtime-core/client-runtime-allocator.mjs";
import {
  checkpointTreeSummary,
  listCheckpointTrees,
  loadCheckpointTree
} from "../../platform/common/data-structure/checkpoint-tree-store.mjs";
import {
  acknowledgeQueueMonitorAlert,
  inspectQueueMonitor,
  registerQueueClosed,
  registerQueueHeartbeat,
  registerQueueStarted
} from "../client/work-queue-core/queue-monitor.mjs";
import { requirePlatformInterface } from "../../platform/interactive/platform-registry.mjs";
import {
  createServerCompositionRoot,
  ensureConsoleOwner
} from "../../platform/interactive/composition-root.mjs";
import { createToolManagementPlatform } from "../../platform/specialized/agent/agent-tools/tool-management-core/index.mjs";
import { createServerRuntimeProviders } from "../../platform/interactive/server-runtime-providers.mjs";
import { createContextRuntime } from "../../platform/specialized/agent/agent-context/context-runtime/index.mjs";
import { loadSettings } from "../../platform/common/platform-core/settings.mjs";
import {
  loadDiscoveryConfig,
  resolveDiscoveryState,
  saveDiscoveryConfig
} from "../../platform/common/platform-core/discovery/config.mjs";
import { createJobManager } from "../client/work-queue-core/jobs/job-manager.mjs";
import {
  createRuntimeLogger,
  setRuntimeLogger,
  summarizeError
} from "../../platform/common/observability/runtime-logger.mjs";
import {
  createTraceContext,
  runWithTraceContext,
  setTraceContextOnRequest
} from "../../platform/common/observability/trace-context.mjs";
import {
  acknowledgeMonitorAlert,
  getMonitorAlertState,
  saveMonitorAlertConfig
} from "../../platform/common/devops/monitor-alert-core/monitor-alerts.mjs";
import {
  dispatchRegisteredHttpOperation,
  dispatchRpcOperation,
  shouldProxyRegisteredApiRequest
} from "../../platform/common/operation-dispatcher/operation-dispatcher.mjs";
import { listInterfaceCatalog } from "../../platform/common/operation-dispatcher/operation-registry.mjs";
import { createJobsController } from "../../platform/common/console/http/controllers/jobs-controller.mjs";
import { createSystemController } from "../../platform/common/console/http/controllers/system-controller.mjs";
import { buildConsoleState } from "../../platform/common/console/http/api-facade.mjs";
import {
  defaultAdvertisedHost,
  formatUrlHost,
  readRequestBody,
  sendJson,
  serveStaticFile
} from "../../platform/common/console/http/http-utils.mjs";

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
  const compositionRoot = await createServerCompositionRoot({
    userDataPath,
    runtimeOptions,
    runtimeLogger
  });
  const {
    featureRuntime,
    allApiOperationCount,
    activeApiOperations,
    publicFeatures,
    isFeatureActive,
    isAnyFeatureActive,
    platformRegistry,
    runtime,
    consoleAuth,
    operationAuditStore,
    operationConcurrencyScope,
    protocolEventBus,
    metadataStore
  } = compositionRoot;
  const callAgentGatewayIfAvailable = async (input = {}, options = {}) => {
    if (!isFeatureActive("agent-gateway")) {
      throw new Error("AgentGateway feature is not active in this feature edition.");
    }
    const { callAgentGateway } = await import("../../platform/specialized/agent/agent-gateway/index.mjs");
    return callAgentGateway({
      ...options,
      input,
      userDataPath,
      clientRuntimeAllocator
    });
  };
  runtimeLogger.info("features.resolved", {
    edition: featureRuntime.edition,
    activeFeatureCount: featureRuntime.activeFeatureIds.length,
    disabledFeatureCount: featureRuntime.disabledFeatureIds.length,
    activeOperationCount: activeApiOperations.length,
    disabledOperationCount: allApiOperationCount - activeApiOperations.length
  });
  const serverLabel = os.hostname();
  const consoleAuthEnabled = resolveConsoleAuthEnabled({ runtimeOptions });
  const initialOwner = await ensureConsoleOwner({
    consoleAuth,
    enabled: consoleAuthEnabled
  });
  if (initialOwner.created) {
    console.log(`Console initial owner username: ${initialOwner.username}`);
    console.log(`Console initial owner password: ${initialOwner.password}`);
    console.log("Console initial owner password is shown once and is not written to disk.");
    console.log("Change/reset it with: npm run server:auth -- set-password --username owner --generate-password");
  }
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
  const registeredMetadataStore = requirePlatformInterface(platformRegistry, "storage.metadataStore").value;
  const deletionCoordinator = createBatchDeletionCoordinator({
    userDataPath,
    jobManager,
    metadataStore: registeredMetadataStore,
    runtime
  });
  const queueMonitorAdapter = {
    registerStarted: (input) => registerQueueStarted(userDataPath, input),
    registerHeartbeat: (input) => registerQueueHeartbeat(userDataPath, input),
    registerClosed: (input) => registerQueueClosed(userDataPath, input),
    inspect: (input) => inspectQueueMonitor({ userDataPath, ...input }),
    acknowledge: (alertId) => acknowledgeQueueMonitorAlert(userDataPath, alertId)
  };
  const clientRuntimeAllocator = createClientRuntimeAllocator({ userDataPath });
  const contextRuntime = createContextRuntime({
    userDataPath,
    clientRuntimeAllocator,
    agentGatewayCall: async (input = {}) => callAgentGatewayIfAvailable(input, {
      settings: await loadSettings(userDataPath)
    })
  });
  let discoveryState = await loadDiscoveryConfig(userDataPath);
  let listenUrl = "";
  let controllersRef = null;
  const runtimeProviders = await createServerRuntimeProviders({
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
    queueMonitor: queueMonitorAdapter,
    runtimeLogger,
    clientRuntimeAllocator,
    isFeatureActive,
    isAnyFeatureActive,
    callAgentGatewayIfAvailable
  });
  const {
    maintenanceAgent,
    knowledgeSourceService,
    agentWorkspace,
    modelDecisionRuntime,
    evidenceSufficiencyGate,
    knowledgeAgentSkill,
    goldenRuleRuntime,
    knowledgeRuleAuthoringRuntime,
    knowledgeSkillRuntime,
    agentEvaluationRuntime,
    knowledgeDistillationRuntime,
    knowledgeEvolutionRuntime,
    summarizationRuntime,
    agentExplorationRuntime
  } = runtimeProviders;
  let toolManagementPlatformRef = null;
  const exposedMaintenanceAgent = maintenanceAgent;
  const exposedKnowledgeSourceService = knowledgeSourceService;

  const jobsController = createJobsController({
    userDataPath,
    jobManager,
    metadataStore,
    deletionCoordinator,
    getDiscoveryState: () => discoveryState,
    proxyApiRequest,
    protocolEventBus,
    resolveArchiveBatchIdentity
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
    getInterfaceCatalog: () => listInterfaceCatalog(activeApiOperations),
    getFeatureEntries: publicFeatures,
    protocolEventBus,
    consoleAuth,
    operationAuditStore,
    maintenanceAgent: exposedMaintenanceAgent,
    knowledgeSourceService: exposedKnowledgeSourceService,
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
    clientRuntimeAllocator,
    checkpointTreeApi: {
      checkpointTreeSummary,
      listCheckpointTrees,
      loadCheckpointTree
    },
    monitorAlertApi: {
      getState: () => getMonitorAlertState(userDataPath, { queueMonitor: queueMonitorAdapter }),
      saveConfig: (input) => saveMonitorAlertConfig(userDataPath, input),
      acknowledge: (alertId) => acknowledgeMonitorAlert(userDataPath, alertId, { queueMonitor: queueMonitorAdapter })
    },
    getToolManagementPlatform: () => toolManagementPlatformRef
  });
  const controllers = {
    jobs: jobsController,
    system: systemController
  };
  controllersRef = controllers;
  const toolManagementPlatform = createToolManagementPlatform({
    userDataPath,
    operations: activeApiOperations,
    featureRuntime: publicFeatures(),
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
          operations: activeApiOperations,
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

      if (
        shouldProxyRegisteredApiRequest({
          pathname: url.pathname,
          discoveryState,
          operations: activeApiOperations
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
        operations: activeApiOperations,
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
      interfaces: listInterfaceCatalog(activeApiOperations),
      features: publicFeatures()
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
  if (isFeatureActive("agent-gateway")) {
    const { loadAgentSyncConfig } = await import("../../protocols/agent-sync/policy.mjs");
    await protocolEventBus.publish(
      "agent_sync.config",
      await loadAgentSyncConfig(userDataPath),
      { type: "agent_sync.config.snapshot" }
    );
  }
  if (exposedMaintenanceAgent) {
    await exposedMaintenanceAgent.start();
  }
  if (exposedKnowledgeSourceService) {
    await exposedKnowledgeSourceService.start();
  }
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
          maintenanceAgent: exposedMaintenanceAgent,
          clientRuntimeAllocator,
          features: publicFeatures()
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
    mode: discoveryState.mode,
    featureEdition: featureRuntime.edition,
    activeFeatures: featureRuntime.activeFeatureIds
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
            if (typeof maintenanceAgent?.close === "function") {
              await maintenanceAgent.close();
            }
            if (typeof knowledgeSourceService?.close === "function") {
              await knowledgeSourceService.close();
            }
            if (typeof agentWorkspace?.close === "function") {
              agentWorkspace.close();
            }
            if (typeof knowledgeSkillRuntime?.close === "function") {
              knowledgeSkillRuntime.close();
            }
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
