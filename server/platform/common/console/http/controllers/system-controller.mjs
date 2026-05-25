import {
  contentDispositionFileName,
  sendJson
} from "../http-utils.mjs";
import { createSystemControllerAgentSettingsHandlers } from "./system-controller-agent-settings-handlers.mjs";
import { createSystemControllerAuthHandlers } from "./system-controller-auth-handlers.mjs";
import { createSystemControllerCapabilityEcosystemHandlers } from "./system-controller-capability-ecosystem-handlers.mjs";
import { createSystemControllerContexts } from "./system-controller-contexts.mjs";
import { createSystemControllerFoundationHandlers } from "./system-controller-foundation-handlers.mjs";
import { createSystemControllerKnowledgeOperationsHandlers } from "./system-controller-knowledge-operations-handlers.mjs";
import { createSystemControllerKnowledgeRuntimeHandlers } from "./system-controller-knowledge-runtime-handlers.mjs";
import { createSystemControllerOpsObservationHandlers } from "./system-controller-ops-observation-handlers.mjs";
import { createSystemControllerRuntimeHandlers } from "./system-controller-runtime-handlers.mjs";
import { createSystemControllerWorkspaceProtocolHandlers } from "./system-controller-workspace-protocol-handlers.mjs";
import { createSystemControllerWorkspaceRuntimeHandlers } from "./system-controller-workspace-runtime-handlers.mjs";

function parseJsonBody(requestBody) {
  return requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
}

function sendJsonWithHeaders(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

export function createSystemController({
  userDataPath,
  distPath,
  runtime,
  jobManager,
  metadataStore,
  serverLabel,
  getDiscoveryState,
  setDiscoveryState,
  getListenUrl,
  getInterfaceCatalog = () => [],
  protocolEventBus = null,
  consoleAuth = null,
  operationAuditStore = null,
  maintenanceAgent = null,
  knowledgeSourceService = null,
  agentWorkspace = null,
  contextRuntime = null,
  evidenceSufficiencyGate = null,
  knowledgeAgentSkill = null,
  goldenRuleRuntime = null,
  knowledgeRuleAuthoringRuntime = null,
  knowledgeSkillRuntime = null,
  knowledgeDistillationRuntime = null,
  agentEvaluationRuntime = null,
  modelDecisionRuntime = null,
  knowledgeEvolutionRuntime = null,
  summarizationRuntime = null,
  agentExplorationRuntime = null,
  clientRuntimeAllocator = null,
  clientRuntimeBootstrap = null,
  checkpointTreeApi = null,
  queueMonitor = null,
  monitorAlertApi = null,
  getFeatureEntries = () => null,
  getToolManagementPlatform = () => null,
  consoleDomainServices = null
}) {
  const {
    executeConsoleDomainOperation,
    knowledgeDomainContext,
    knowledgeWorkflowContext,
    settingsAgentGatewayContext,
    authorizationFacadeContext,
    accessControlContext,
    appendConsoleOperationLog,
    isFeatureActive,
    resumeKnowledgeWordCloudTasks
  } = createSystemControllerContexts({
    userDataPath,
    runtime,
    jobManager,
    metadataStore,
    protocolEventBus,
    consoleAuth,
    operationAuditStore,
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
    queueMonitor,
    getFeatureEntries,
    consoleDomainServices
  });

  function protocolPayload(requestBody, url = null) {
    if (requestBody?.length > 0) {
      return parseJsonBody(requestBody);
    }
    return url ? Object.fromEntries(url.searchParams.entries()) : {};
  }

  function queryPayload(url = null) {
    if (!url) {
      return {};
    }
    const payload = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        payload[key] = Array.isArray(payload[key]) ? [...payload[key], value] : [payload[key], value];
      } else {
        payload[key] = value;
      }
    }
    return payload;
  }

  function workspaceIdFrom(input = {}, fallback = "") {
    return String(input.workspaceId || input.workspace || fallback || "default").trim() || "default";
  }

  async function sendConsoleDomainOperation({
    operationId,
    input = {},
    response,
    context = {},
    errorMessage = "Console domain operation failed."
  }) {
    try {
      const operationResult = await runConsoleDomainOperation({ operationId, input, context });
      if (operationResult.payload?.__responseHandled) {
        return;
      }
      if (operationResult.payload?.__binaryResponse) {
        const disposition = operationResult.payload.disposition || "inline";
        response.writeHead(operationResult.status || 200, {
          "Content-Type": operationResult.payload.contentType || "application/octet-stream",
          "Content-Disposition": `${disposition}; filename="${contentDispositionFileName(operationResult.payload.fileName || "asset.bin")}"`,
          "Cache-Control": "no-store",
          ...(operationResult.payload.headers || {})
        });
        response.end(operationResult.payload.buffer || Buffer.alloc(0));
        return;
      }
      if (operationResult.payload?.__htmlResponse) {
        response.writeHead(operationResult.status || 200, {
          "Content-Type": operationResult.payload.contentType || "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          ...(operationResult.payload.headers || {})
        });
        response.end(String(operationResult.payload.body || ""));
        return;
      }
      if (operationResult.payload?.__headers) {
        const { __headers: headers, ...payload } = operationResult.payload;
        sendJsonWithHeaders(response, operationResult.status || 200, payload, headers);
        return;
      }
      sendJson(response, operationResult.status || 200, operationResult.payload ?? operationResult);
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        operationId,
        error: error instanceof Error ? error.message : errorMessage
      });
    }
  }

  async function runConsoleDomainOperation({ operationId, input = {}, context = {} }) {
    return executeConsoleDomainOperation({
      operationId,
      input,
      context: {
        userDataPath,
        ...context
      }
    });
  }

  const controller = {
    ...createSystemControllerAuthHandlers({
      sendConsoleDomainOperation,
      parseJsonBody,
      consoleAuth,
      operationAuditStore,
      appendConsoleOperationLog
    }),
    ...createSystemControllerFoundationHandlers({
      sendConsoleDomainOperation,
      protocolPayload,
      workspaceIdFrom,
      authorizationFacadeContext,
      accessControlContext,
      getToolManagementPlatform,
      agentWorkspace,
      runtime
    }),
    ...createSystemControllerRuntimeHandlers({
      sendConsoleDomainOperation,
      parseJsonBody,
      queryPayload,
      isFeatureActive,
      knowledgeWorkflowContext,
      getInterfaceCatalog,
      getFeatureEntries,
      protocolEventBus,
      getDiscoveryState,
      setDiscoveryState,
      getListenUrl,
      serverLabel,
      distPath,
      runtime,
      jobManager,
      metadataStore,
      consoleAuth,
      maintenanceAgent,
      clientRuntimeAllocator,
      getToolManagementPlatform,
      consoleDomainServices
    }),
    ...createSystemControllerAgentSettingsHandlers({
      sendConsoleDomainOperation,
      parseJsonBody,
      settingsAgentGatewayContext
    }),
    ...createSystemControllerWorkspaceProtocolHandlers({
      sendConsoleDomainOperation,
      protocolPayload,
      operationAuditStore,
      checkpointTreeApi
    }),
    ...createSystemControllerCapabilityEcosystemHandlers({
      sendConsoleDomainOperation,
      parseJsonBody
    }),
    ...createSystemControllerKnowledgeOperationsHandlers({
      sendConsoleDomainOperation,
      parseJsonBody,
      queryPayload,
      knowledgeWorkflowContext,
      metadataStore
    }),
    ...createSystemControllerOpsObservationHandlers({
      sendConsoleDomainOperation,
      parseJsonBody,
      jobManager,
      checkpointTreeApi,
      monitorAlertApi
    }),
    ...createSystemControllerKnowledgeRuntimeHandlers({
      sendConsoleDomainOperation,
      parseJsonBody,
      protocolPayload,
      queryPayload,
      knowledgeDomainContext,
      knowledgeWorkflowContext,
      runtime,
      jobManager,
      knowledgeSourceService,
      metadataStore,
      clientRuntimeAllocator,
      modelDecisionRuntime,
      agentWorkspace,
      consoleDomainServices
    }),
    ...createSystemControllerWorkspaceRuntimeHandlers({
      sendConsoleDomainOperation,
      parseJsonBody,
      protocolPayload,
      contextRuntime,
      agentWorkspace,
      clientRuntimeAllocator,
      clientRuntimeBootstrap
    }),
  };
  setImmediate(() => {
    void resumeKnowledgeWordCloudTasks();
  });
  return controller;
}
