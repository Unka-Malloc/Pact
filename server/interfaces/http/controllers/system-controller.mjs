import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getSettingsPath,
  loadSettings,
  normalizeSettings,
  saveSettings
} from "../../../config.mjs";
import {
  buildBootstrapPayload,
  getDiscoveryConfigPath,
  saveDiscoveryConfig
} from "../../../discovery-config.mjs";
import { getEmailRulesPath, loadEmailRules, saveEmailRules } from "../../../email-rules.mjs";
import {
  getExpertVocabularyPath,
  getExpertVocabularySummary,
  listExpertVocabularyVersions,
  listKnowledgePackages,
  loadExpertVocabulary,
  saveExpertVocabulary,
  getKnowledgePackage,
  createOrUpdateKnowledgePackage,
  publishKnowledgePackage,
  rollbackKnowledgePackage
} from "../../../expert-vocabulary.mjs";
import {
  getKnowledgeGuidanceSummary,
  getKnowledgeTaxonomyPath,
  listKnowledgeTaxonomyVersions,
  loadKnowledgeTaxonomy,
  saveKnowledgeTaxonomy
} from "../../../knowledge-taxonomy.mjs";
import { getCodexOAuthStatus, startCodexDeviceLogin } from "../../../application/codex-oauth-service.mjs";
import {
  checkpointTreeSummary,
  listCheckpointTrees,
  loadCheckpointTree
} from "../../../application/checkpoint-tree-store.mjs";
import { enhanceAffairTaxonomy } from "../../../application/knowledge-taxonomy-service.mjs";
import { getBackgroundProcessStatus } from "../../../application/background-process-status.mjs";
import {
  getMonitorAlertState,
  saveMonitorAlertConfig
} from "../../../application/monitor-alerts.mjs";
import {
  getSourceFileEvidence,
  isSourceEvidenceId,
  searchSourceFiles
} from "../../../application/source-file-search-service.mjs";
import {
  callAgentGateway,
  publicAgentGatewayConfig,
  publicAgentGatewayRegistry
} from "../../../modules/AgentGateway/index.mjs";
import { probeModelConnection } from "../../../modules/ModelProbe/index.mjs";
import {
  getMountConfigPath,
  getMountConfigPaths,
  loadMountConfig,
  mergeMountRouting,
  saveMountConfig
} from "../../../runtime/mount-config.mjs";
import {
  authorizeAgentToolRequest,
  createToolGrant,
  deleteToolGrant,
  getToolPlatformPath,
  loadToolPlatform,
  rotateToolGrantToken,
  updateToolGrant
} from "../../../tool-platform.mjs";
import {
  buildConsoleState,
  buildKnowledgeConsoleSummary,
  buildRuntimeInfo
} from "../api-facade.mjs";
import {
  contentDispositionFileName,
  parseBooleanFlag,
  parseEntityTypes,
  sendJson
} from "../http-utils.mjs";
import { hashClientString, serverToken } from "../../../security/client-strings.mjs";
import { reconcileStorage, runStorageDoctor } from "../../../storage/ops-tools.mjs";
import {
  filterAgentSyncSubscriptionResult,
  filterRequestedSubscriptionTopics,
  loadAgentSyncConfig,
  normalizeAgentSyncTopic,
  publishAgentSyncEvent,
  saveAgentSyncConfig
} from "../../../protocols/agent-sync/policy.mjs";

function parseJsonBody(requestBody) {
  return requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
}

const PATH_BROWSER_MAX_ENTRIES = 600;
const PATH_BROWSER_IGNORED_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "__pycache__"
]);

function normalizePathBrowserMode(value) {
  return value === "file" ? "file" : "directory";
}

function normalizePathBrowserExtensions(value) {
  const items = Array.isArray(value) ? value : [];
  return items
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .map((item) => (item.startsWith(".") ? item : `.${item}`));
}

function createPathBrowserRoots({ userDataPath, distPath }) {
  const roots = new Map();
  const addRoot = (label, value) => {
    const nextPath = String(value || "").trim();
    if (!nextPath) {
      return;
    }
    roots.set(path.resolve(nextPath), label);
  };

  addRoot("当前项目", process.cwd());
  addRoot("服务端数据", userDataPath);
  addRoot("当前用户", os.homedir());
  const cloudStoragePath = path.join(os.homedir(), "Library", "CloudStorage");
  try {
    for (const entry of fsSync.readdirSync(cloudStoragePath, { withFileTypes: true })) {
      if (entry.isDirectory() && /^OneDrive/i.test(entry.name)) {
        addRoot(`OneDrive · ${entry.name.replace(/^OneDrive[- ]?/i, "") || "本机"}`, path.join(cloudStoragePath, entry.name));
      }
    }
  } catch {
    // CloudStorage is platform/user dependent; absence should not affect path browsing.
  }
  try {
    for (const entry of fsSync.readdirSync(os.homedir(), { withFileTypes: true })) {
      if (entry.isDirectory() && /^OneDrive/i.test(entry.name)) {
        addRoot(`OneDrive · ${entry.name.replace(/^OneDrive[- ]?/i, "") || "本机"}`, path.join(os.homedir(), entry.name));
      }
    }
  } catch {
    // Ignore unreadable home entries.
  }
  if (distPath) {
    addRoot("控制台构建", distPath);
  }

  const rootPath = path.parse(process.cwd()).root;
  addRoot(rootPath === "/" ? "根目录" : rootPath, rootPath);
  if (process.platform === "darwin") {
    addRoot("Volumes", "/Volumes");
  }

  return [...roots.entries()].map(([rootPathValue, label]) => ({
    label,
    path: rootPathValue
  }));
}

async function resolvePathBrowserDirectory(inputPath) {
  const requestedPath = String(inputPath || "").trim();
  const absolutePath = path.resolve(requestedPath || process.cwd());
  try {
    const stats = await fs.stat(absolutePath);
    if (stats.isDirectory()) {
      return absolutePath;
    }
    return path.dirname(absolutePath);
  } catch {
    return path.dirname(absolutePath);
  }
}

async function statPathBrowserEntry({ absolutePath, name, mode, extensions }) {
  const stats = await fs.stat(absolutePath);
  const type = stats.isDirectory() ? "directory" : stats.isFile() ? "file" : "other";
  const extension = path.extname(name).toLowerCase();
  const fileAllowed = extensions.length === 0 || extensions.includes(extension);
  return {
    name,
    path: absolutePath,
    type,
    byteSize: stats.isFile() ? stats.size : 0,
    modifiedAt: stats.mtime.toISOString(),
    hidden: name.startsWith("."),
    selectable:
      (mode === "directory" && type === "directory") ||
      (mode === "file" && type === "file" && fileAllowed),
    browsable: type === "directory"
  };
}

async function browseServerPath({
  requestedPath,
  mode,
  extensions,
  includeHidden,
  userDataPath,
  distPath
}) {
  const currentPath = await resolvePathBrowserDirectory(requestedPath);
  const roots = createPathBrowserRoots({ userDataPath, distPath });
  const parentPath = path.dirname(currentPath);
  let entries = [];
  let error = "";

  try {
    const directoryEntries = await fs.readdir(currentPath, { withFileTypes: true });
    const names = directoryEntries
      .map((entry) => entry.name)
      .filter((name) => includeHidden || !name.startsWith("."))
      .filter((name) => !PATH_BROWSER_IGNORED_NAMES.has(name))
      .sort((left, right) => left.localeCompare(right, "zh-CN"));

    const listed = [];
    for (const name of names) {
      const absolutePath = path.join(currentPath, name);
      try {
        listed.push(await statPathBrowserEntry({ absolutePath, name, mode, extensions }));
      } catch {
        // Ignore unreadable entries; the browser is for choosing paths, not diagnostics.
      }
      if (listed.length >= PATH_BROWSER_MAX_ENTRIES) {
        break;
      }
    }

    entries = listed.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "directory" ? -1 : 1;
      }
      return left.name.localeCompare(right.name, "zh-CN");
    });
  } catch (browseError) {
    error = browseError instanceof Error ? browseError.message : "无法读取目录。";
  }

  return {
    currentPath,
    parentPath: parentPath === currentPath ? "" : parentPath,
    mode,
    extensions,
    roots,
    entries,
    truncated: entries.length >= PATH_BROWSER_MAX_ENTRIES,
    error
  };
}

function modelForProbeProvider(settings = {}, provider = "") {
  switch (provider) {
    case "google-gemini":
      return settings.googleModel;
    case "openai-chatgpt":
      return settings.openAiModel;
    case "deepseek":
      return settings.deepSeekModel;
    case "openrouter":
      return settings.openRouterModel;
    case "copilot":
      return settings.copilotModel;
    case "local-model":
      return settings.localModelName;
    case "custom-http":
      return settings.customModelAlias || settings.agentGateway?.alias || settings.customHttpAdapter?.alias;
    default:
      return "";
  }
}

function mergeSettingsForModelProbe(currentSettings = {}, incomingSettings = {}, provider = "") {
  const current = normalizeSettings(currentSettings);
  const incoming = incomingSettings && typeof incomingSettings === "object" ? incomingSettings : {};
  const nextSettings = {
    ...current,
    ...incoming
  };

  for (const key of [
    "googleApiKey",
    "openRouterApiKey",
    "deepSeekApiKey",
    "copilotApiKey",
    "customModelApiKey"
  ]) {
    if (!String(incoming?.[key] || "").trim() && current[key]) {
      nextSettings[key] = current[key];
    }
  }

  if (
    !String(incoming?.customHttpAdapter?.token || "").trim() &&
    current.customHttpAdapter?.token
  ) {
    nextSettings.customHttpAdapter = {
      ...(nextSettings.customHttpAdapter || {}),
      token: current.customHttpAdapter.token
    };
  }
  if (!String(incoming?.agentGateway?.token || "").trim() && current.agentGateway?.token) {
    nextSettings.agentGateway = {
      ...(nextSettings.agentGateway || {}),
      token: current.agentGateway.token
    };
  }

  if (nextSettings.customHttpAdapter || nextSettings.agentGateway) {
    const mergedAdapter = {
      ...(nextSettings.agentGateway || {}),
      ...(nextSettings.customHttpAdapter || {}),
      ...(incoming.agentGateway || {}),
      ...(incoming.customHttpAdapter || {})
    };
    nextSettings.customHttpAdapter = mergedAdapter;
    nextSettings.agentGateway = mergedAdapter;
  }

  return normalizeSettings(nextSettings);
}

function sendJsonWithHeaders(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function getKnowledgeCore(runtime) {
  const mount = runtime?.mounts?.knowledgeBase;
  if (!mount || mount.enabled === false) {
    return null;
  }
  return mount;
}

function parseKnowledgeSearchInput({ requestBody, url }) {
  const payload = parseJsonBody(requestBody);
  const parsed = requestBody.length > 0
    ? payload
    : {
        query: url.searchParams.get("query") || url.searchParams.get("q") || "",
        limit: Number(url.searchParams.get("limit") || 20),
        batchId: url.searchParams.get("batchId") || url.searchParams.get("batch-id") || "",
        retrievalProfileId:
          url.searchParams.get("retrievalProfileId") ||
          url.searchParams.get("profile-id") ||
          url.searchParams.get("profile") ||
          "",
        profileKey:
          url.searchParams.get("profileKey") ||
          url.searchParams.get("profile-key") ||
          url.searchParams.get("retrievalProfileKey") ||
          "",
        clientId:
          url.searchParams.get("clientId") ||
          url.searchParams.get("client-id") ||
          "",
        learningEnabled: parseBooleanFlag(url.searchParams.get("learningEnabled") || url.searchParams.get("learning-enabled") || url.searchParams.get("learning") || "true"),
        explain: parseBooleanFlag(url.searchParams.get("explain") || "false"),
        format: url.searchParams.get("format") || ""
      };
  return enforceMultimodalKnowledgeSearch(parsed);
}

function enforceMultimodalKnowledgeSearch(payload = {}) {
  const {
    modality: _modality,
    modalities: _modalities,
    mediaType: _mediaType,
    mediaTypes: _mediaTypes,
    filters,
    ...rest
  } = payload || {};
  const nextFilters = { ...(filters && typeof filters === "object" && !Array.isArray(filters) ? filters : {}) };
  delete nextFilters.modality;
  delete nextFilters.modalities;
  delete nextFilters.mediaType;
  delete nextFilters.mediaTypes;
  return {
    ...rest,
    ...(Object.keys(nextFilters).length ? { filters: nextFilters } : {}),
    modalityPolicy: "multimodal"
  };
}

function createCapturedJsonResponse() {
  return {
    statusCode: 200,
    headers: {},
    chunks: [],
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = {
        ...this.headers,
        ...headers
      };
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    getHeader(name) {
      const lowerName = String(name || "").toLowerCase();
      const entry = Object.entries(this.headers).find(
        ([headerName]) => headerName.toLowerCase() === lowerName
      );
      return entry?.[1];
    },
    write(chunk) {
      if (chunk !== undefined && chunk !== null) {
        this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
    },
    end(chunk) {
      this.write(chunk);
      this.ended = true;
    }
  };
}

function parseCapturedJson(captured) {
  const text = Buffer.concat(captured.chunks || []).toString("utf8").trim();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function parseTopicQuery(url) {
  const values = [
    ...url.searchParams.getAll("topic"),
    ...url.searchParams.getAll("topics")
  ];
  return values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

async function publishProtocolEvent(protocolEventBus, topic, payload, options = {}) {
  if (!protocolEventBus || typeof protocolEventBus.publish !== "function") {
    return null;
  }
  return protocolEventBus.publish(topic, payload, options);
}

function hasClientSuppliedString(value, keys) {
  if (!value || typeof value !== "object") {
    return false;
  }
  return keys.some((key) => typeof value[key] === "string" && value[key].trim());
}

function clientVersionString(value) {
  const text = String(value || "").trim().slice(0, 80);
  return /^[A-Za-z0-9._:@+ -]*$/.test(text) ? text : hashClientString(text, "client.version");
}

function stripClientDiscoveryStrings(value = {}) {
  return {
    mode: value.mode === "forward" ? "forward" : "active",
    refreshIntervalSeconds: value.refreshIntervalSeconds,
    checkInIntervalSeconds: value.checkInIntervalSeconds,
    offlineAfterSeconds: value.offlineAfterSeconds
  };
}

async function requireAgentToolScope({ userDataPath, request, response, scopes }) {
  const authorization = await authorizeAgentToolRequest({
    userDataPath,
    request,
    requiredScopes: scopes
  });
  if (!authorization.ok) {
    sendJson(response, authorization.status || 403, {
      error: authorization.error || "工具权限不足。"
    });
    return null;
  }
  return authorization;
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
  getToolManagementPlatform = () => null
}) {
  function requireMaintenanceAgent(response) {
    if (!maintenanceAgent) {
      sendJson(response, 503, {
        error: "维护智能体模块不可用。"
      });
      return false;
    }
    return true;
  }

  async function sendAgentToolKnowledgeJson({ request, response, scopes, run }) {
    const authorization = await requireAgentToolScope({
      userDataPath,
      request,
      response,
      scopes
    });
    if (!authorization) {
      return;
    }

    const captured = createCapturedJsonResponse();
    await run(captured);
    const result = parseCapturedJson(captured);
    const statusCode = captured.statusCode || 200;
    if (statusCode >= 400) {
      sendJson(response, statusCode, {
        grant: authorization.grant,
        ...(result && typeof result === "object" && !Array.isArray(result)
          ? result
          : { error: "工具调用失败。", result })
      });
      return;
    }
    sendJson(response, statusCode, {
      grant: authorization.grant,
      result
    });
  }

  function normalizeAgentStringList(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean);
    }
    if (typeof value === "string") {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
    return [];
  }

  function normalizeAgentParameters(value) {
    if (!value) {
      return {};
    }
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeAgentModelPayload(payload = {}) {
    const source = payload?.agent || payload?.value || payload?.config || payload || {};
    const patch = {};
    const assignString = (target, keys) => {
      for (const key of keys) {
        if (Object.hasOwn(source, key)) {
          const value = source[key];
          patch[target] = String(value ?? "").trim();
          return;
        }
      }
    };

    assignString("uid", ["uid", "agentId"]);
    assignString("provider", ["provider", "modelProvider"]);
    assignString("label", ["name", "label", "agentName"]);
    assignString("model", ["model", "modelId", "engine"]);
    assignString("baseUrl", ["baseUrl", "base_url"]);
    assignString("url", ["url", "endpoint"]);
    assignString("apiKey", ["apiKey", "api_key", "key"]);
    assignString("token", ["token"]);
    assignString("tokenHeader", ["tokenHeader", "token_header"]);
    assignString("tokenPrefix", ["tokenPrefix", "token_prefix"]);
    assignString("systemPrompt", ["systemPrompt", "prompt"]);

    if (Object.hasOwn(patch, "label") && !Object.hasOwn(patch, "agentName")) {
      patch.agentName = patch.label;
    }
    if (Object.hasOwn(patch, "model") && !Object.hasOwn(patch, "engine")) {
      patch.engine = patch.model;
    }
    if (source.parameters !== undefined || source.parametersText !== undefined) {
      patch.parameters = normalizeAgentParameters(source.parameters ?? source.parametersText);
    }
    if (source.pluginList !== undefined || source.plugins !== undefined) {
      patch.pluginList = normalizeAgentStringList(source.pluginList ?? source.plugins);
    }
    if (source.timeoutMs !== undefined && source.timeoutMs !== null && source.timeoutMs !== "") {
      const timeoutMs = Number(source.timeoutMs);
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        patch.timeoutMs = timeoutMs;
      }
    }
    return patch;
  }

  function createAgentUid(entry = {}) {
    const digest = crypto
      .createHash("sha256")
      .update(
        [
          entry.provider || "deepseek",
          entry.label || entry.agentName || "",
          entry.model || entry.engine || "",
          entry.baseUrl || entry.url || "",
          crypto.randomUUID()
        ].join("\n")
      )
      .digest("hex")
      .slice(0, 16);
    return `agent_${digest}`;
  }

  function agentModelIdentity(entry = {}) {
    return [entry.uid, entry.instanceId, entry.alias, entry.id]
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  function findAgentModelIndex(models = [], agentId = "") {
    const id = String(agentId || "").trim();
    if (!id) {
      return -1;
    }
    const directIndex = models.findIndex((entry) => agentModelIdentity(entry).includes(id));
    if (directIndex >= 0) {
      return directIndex;
    }
    const nameMatches = models
      .map((entry, index) => ({
        index,
        name: String(entry.label || entry.agentName || "").trim()
      }))
      .filter((entry) => entry.name && entry.name === id);
    return nameMatches.length === 1 ? nameMatches[0].index : -1;
  }

  function agentModelProviders(models = []) {
    return [
      ...new Set(
        models
          .map((entry) => String(entry.provider || "").trim())
          .filter(Boolean)
      )
    ];
  }

  async function saveAgentModelLibrary(current, models) {
    const saved = await saveSettings(userDataPath, {
      ...current,
      modelLibraryModels: models,
      modelLibraryEntries: agentModelProviders(models)
    });
    const redactedSettings = await loadSettings(userDataPath, { redactSecrets: true });
    await publishProtocolEvent(
      protocolEventBus,
      "settings.current",
      redactedSettings,
      { type: "settings.updated" }
    );
    return {
      saved,
      registry: publicAgentGatewayRegistry(saved)
    };
  }

  const controller = {
    async handleBootstrap({ response }) {
      sendJson(response, 200, {
        ...buildBootstrapPayload(getDiscoveryState()),
        expertVocabulary: await getExpertVocabularySummary(userDataPath),
        knowledgeGuidance: await getKnowledgeGuidanceSummary(userDataPath),
        resolvedAt: new Date().toISOString()
      });
    },
    async handleAuthSession({ request, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      sendJson(response, 200, consoleAuth.getSummary(request));
    },
    async handleAuthBootstrap({ request, requestBody, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      sendJson(response, 410, {
        error: "旧初始化接口已停用；首次 owner 由服务端启动时自动创建。"
      });
    },
    async handleAuthLogin({ request, requestBody, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      try {
        const login = await consoleAuth.login(parseJsonBody(requestBody), request);
        consoleAuth.audit({
          user: login.session?.user,
          operationId: "auth.login",
          action: "login",
          method: "POST",
          path: "/api/auth/login",
          status: "ok"
        });
        sendJsonWithHeaders(
          response,
          200,
          {
            ok: true,
            session: login.session,
            csrfToken: login.csrfToken,
            roles: consoleAuth.roleList()
          },
          { "Set-Cookie": login.cookies }
        );
      } catch (error) {
        sendJson(response, 401, {
          error: error instanceof Error ? error.message : "登录失败。"
        });
      }
    },
    async handleAuthLogout({ request, authSession, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      const result = consoleAuth.logout(request);
      consoleAuth.audit({
        user: authSession?.user,
        operationId: "auth.logout",
        action: "logout",
        method: "POST",
        path: "/api/auth/logout",
        status: "ok"
      });
      sendJsonWithHeaders(response, 200, { ok: true }, { "Set-Cookie": result.cookies });
    },
    async handleAuthUsers({ requestBody, authSession, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      if (requestBody.length === 0) {
        sendJson(response, 200, { users: consoleAuth.listUsers(), roles: consoleAuth.roleList() });
        return;
      }
      sendJson(response, 405, {
        error: "用户创建和初始密码设置仅允许在服务端命令行执行。"
      });
    },
    async handleAuthUpdateUser({ userId, requestBody, authSession, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      try {
        const payload = parseJsonBody(requestBody);
        if (payload.password || payload.newPassword) {
          sendJson(response, 405, {
            error: "密码修改仅允许在服务端命令行执行。"
          });
          return;
        }
        const user = await consoleAuth.updateUser(userId, payload);
        if (!user) {
          sendJson(response, 404, { error: "用户不存在。" });
          return;
        }
        consoleAuth.audit({
          user: authSession?.user,
          operationId: "auth.users.update",
          action: "update-user",
          method: "POST",
          path: `/api/auth/users/${userId}`,
          status: "ok",
          target: { userId: user.userId, roleId: user.roleId, enabled: user.enabled }
        });
        sendJson(response, 200, { user, users: consoleAuth.listUsers() });
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "更新用户失败。"
        });
      }
    },
    async handleAuthRole({ roleId, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      const role = consoleAuth.roleList().find((item) => item.roleId === roleId);
      if (!role) {
        sendJson(response, 404, { error: "角色不存在。" });
        return;
      }
      sendJson(response, 200, { role });
    },
    async handleAuthOidc({ requestBody, authSession, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      if (requestBody.length === 0) {
        sendJson(response, 200, { oidc: consoleAuth.getOidcConfig() });
        return;
      }
      const oidc = consoleAuth.setOidcConfig(parseJsonBody(requestBody));
      consoleAuth.audit({
        user: authSession?.user,
        operationId: "auth.oidc",
        action: "set-oidc",
        method: "POST",
        path: "/api/auth/oidc",
        status: "ok",
        target: { enabled: oidc.enabled, issuer: oidc.issuer, clientId: oidc.clientId }
      });
      sendJson(response, 200, { oidc });
    },
    async handleAuthAudit({ url, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      if (operationAuditStore) {
        sendJson(response, 200, {
          items: operationAuditStore.list({
            limit: Number(url.searchParams.get("limit") || 100),
            operationId: url.searchParams.get("operationId") || "",
            userId: url.searchParams.get("userId") || "",
            status: url.searchParams.get("status") || ""
          })
        });
        return;
      }
      sendJson(response, 200, {
        items: consoleAuth.listAudit({
          limit: Number(url.searchParams.get("limit") || 100),
          userId: url.searchParams.get("userId") || "",
          status: url.searchParams.get("status") || ""
        })
      });
    },
    async handleAuthSessions({ response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      sendJson(response, 200, { sessions: consoleAuth.listSessions() });
    },
    async handleAuthRevokeSession({ sessionId, authSession, response }) {
      if (!consoleAuth) {
        sendJson(response, 503, { error: "控制台认证模块不可用。" });
        return;
      }
      const result = consoleAuth.revokeSession(sessionId);
      consoleAuth.audit({
        user: authSession?.user,
        operationId: "auth.sessions.revoke",
        action: "revoke-session",
        method: "POST",
        path: `/api/auth/sessions/${sessionId}/revoke`,
        status: result.ok ? "ok" : "not_found",
        target: { sessionId }
      });
      sendJson(response, result.ok ? 200 : 404, result.ok ? result : { error: "会话不存在。" });
    },
    async handleListInterfaces({ response }) {
      sendJson(response, 200, {
        transport: {
          http: "direct",
          rpc: "POST /api/rpc",
          events: "GET /api/events"
        },
        interfaces: getInterfaceCatalog()
      });
    },
    async handleSubscribeEvents({ request, url, response }) {
      if (!protocolEventBus || typeof protocolEventBus.subscribe !== "function") {
        sendJson(response, 503, {
          error: "事件总线不可用。"
        });
        return;
      }

      const agentSyncConfig = await loadAgentSyncConfig(userDataPath);
      const requestedTopics = parseTopicQuery(url);
      const topicFilter = filterRequestedSubscriptionTopics(agentSyncConfig, requestedTopics);
      if (topicFilter.denyAll) {
        const cursor = Number(url.searchParams.get("cursor") || 0);
        sendJson(response, 200, {
          cursor,
          nextCursor: cursor,
          topics: topicFilter.topics,
          requestedTopics: topicFilter.requested,
          events: [],
          snapshots: parseBooleanFlag(
            url.searchParams.get("includeSnapshot") || url.searchParams.get("snapshot") || ""
          )
            ? []
            : undefined
        });
        return;
      }

      const abortController = new AbortController();
      response.once?.("close", () => abortController.abort());
      const result = await protocolEventBus.subscribe({
        cursor: Number(url.searchParams.get("cursor") || 0),
        topics: topicFilter.topics,
        timeoutMs: Number(url.searchParams.get("timeoutMs") || url.searchParams.get("timeout") || 0),
        limit: Number(url.searchParams.get("limit") || 100),
        includeSnapshot: parseBooleanFlag(
          url.searchParams.get("includeSnapshot") || url.searchParams.get("snapshot") || ""
        ),
        signal: request?.aborted ? AbortSignal.abort() : abortController.signal
      });
      if (response.destroyed) {
        return;
      }
      sendJson(response, 200, {
        ...filterAgentSyncSubscriptionResult(agentSyncConfig, result),
        requestedTopics: topicFilter.requested
      });
    },
    async handleAgentSyncConfig({ requestBody, response }) {
      if (requestBody.length === 0) {
        sendJson(response, 200, {
          config: await loadAgentSyncConfig(userDataPath)
        });
        return;
      }
      const payload = parseJsonBody(requestBody);
      const saved = await saveAgentSyncConfig(userDataPath, payload.value || payload.config || payload);
      await publishProtocolEvent(
        protocolEventBus,
        "agent_sync.config",
        saved,
        { type: "agent_sync.config.updated" }
      );
      sendJson(response, 200, {
        config: saved
      });
    },
    async handleAgentSyncPublish({ request, requestBody, response }) {
      const authorization = await requireAgentToolScope({
        userDataPath,
        request,
        response,
        scopes: ["agent_sync:publish"]
      });
      if (!authorization) {
        return;
      }
      const result = await publishAgentSyncEvent({
        userDataPath,
        protocolEventBus,
        input: parseJsonBody(requestBody),
        grant: authorization.grant
      });
      if (!result.ok) {
        sendJson(response, result.status || 400, {
          error: result.error || "发布智能体同步事件失败。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleAgentSyncSubscribe({ request, url, response }) {
      if (!protocolEventBus || typeof protocolEventBus.subscribe !== "function") {
        sendJson(response, 503, {
          error: "事件总线不可用。"
        });
        return;
      }
      const config = await loadAgentSyncConfig(userDataPath);
      const requested = parseTopicQuery(url).map(normalizeAgentSyncTopic);
      const topicFilter = filterRequestedSubscriptionTopics(config, requested);
      const cursor = Number(url.searchParams.get("cursor") || 0);
      const includeSnapshot = parseBooleanFlag(
        url.searchParams.get("includeSnapshot") || url.searchParams.get("snapshot") || ""
      );
      if (topicFilter.denyAll) {
        sendJson(response, 200, {
          cursor,
          nextCursor: cursor,
          topics: [],
          requestedTopics: topicFilter.requested,
          events: [],
          snapshots: includeSnapshot ? [] : undefined
        });
        return;
      }
      const abortController = new AbortController();
      response.once?.("close", () => abortController.abort());
      const result = await protocolEventBus.subscribe({
        cursor,
        topics: topicFilter.topics.length > 0
          ? topicFilter.topics
          : config.topics.filter((topic) => topic.enabled).map((topic) => topic.topic),
        timeoutMs: Number(url.searchParams.get("timeoutMs") || url.searchParams.get("timeout") || 0),
        limit: Number(url.searchParams.get("limit") || 100),
        includeSnapshot,
        signal: request?.aborted ? AbortSignal.abort() : undefined
      });
      if (response.destroyed) {
        return;
      }
      sendJson(response, 200, {
        ...filterAgentSyncSubscriptionResult(config, result),
        requestedTopics: topicFilter.requested
      });
    },
    async handleDiscoveryCheckIn({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const discoveryState = getDiscoveryState();
      const clientId = serverToken(
        "client",
        payload.clientId || payload.hostname || payload.currentServiceUrl || "anonymous"
      );
      const record = metadataStore.recordClientCheckIn({
        clientId,
        clientLabel: hashClientString(payload.clientLabel || payload.hostname || clientId, "client.label"),
        appVersion: clientVersionString(payload.appVersion || ""),
        platform: hashClientString(payload.platform || "", "client.platform"),
        hostname: hashClientString(payload.hostname || "", "client.hostname"),
        bootstrapUrl: "",
        currentServiceUrl: hashClientString(payload.currentServiceUrl || "", "service.url"),
        desiredServiceUrl:
          hashClientString(discoveryState.activeServiceUrl || "", "service.url"),
        currentJobServiceUrl: payload.currentJobServiceUrl
          ? hashClientString(payload.currentJobServiceUrl || "", "service.url")
          : "",
        configVersion: clientVersionString(payload.configVersion || ""),
        busy: Boolean(payload.busy),
        lastJobId: hashClientString(payload.lastJobId || "", "client.last_job_id"),
        lastError: hashClientString(payload.lastError || "", "client.last_error"),
        serverId: discoveryState.serverId,
        offlineAfterSeconds: discoveryState.offlineAfterSeconds
      });
      await publishProtocolEvent(
        protocolEventBus,
        "discovery.clients",
        {
          client: record,
          serverId: discoveryState.serverId
        },
        { type: "discovery.client.checked_in" }
      );
      sendJson(response, 200, {
        ok: true,
        client: record,
        bootstrap: {
          ...buildBootstrapPayload(discoveryState),
          expertVocabulary: await getExpertVocabularySummary(userDataPath),
          knowledgeGuidance: await getKnowledgeGuidanceSummary(userDataPath)
        }
      });
    },
    async handleListDiscoveryClients({ response }) {
      sendJson(
        response,
        200,
        metadataStore.listClientRegistrations({
          offlineAfterSeconds: getDiscoveryState().offlineAfterSeconds
        })
      );
    },
    async handleRequestClientMigration({ clientId, requestBody, response, authSession }) {
      const payload = parseJsonBody(requestBody);
      const targetClientId = String(clientId || payload.clientId || "").trim();
      if (!targetClientId) {
        sendJson(response, 400, {
          error: "缺少客户端 ID。"
        });
        return;
      }

      const discoveryState = getDiscoveryState();
      const clients = metadataStore.listClientRegistrations({
        offlineAfterSeconds: discoveryState.offlineAfterSeconds
      });
      const client = clients.items.find((item) => item.clientId === targetClientId);
      if (!client) {
        sendJson(response, 404, {
          error: "未找到目标客户端。"
        });
        return;
      }

      const command = {
        schemaVersion: 1,
        command: "migrate_to_active_service",
        clientId: targetClientId,
        desiredServiceUrl: discoveryState.activeServiceUrl || "",
        configVersion: discoveryState.configVersion || "",
        serverId: discoveryState.serverId || "",
        requestedAt: new Date().toISOString(),
        reason: String(payload.reason || "console").trim() || "console",
        requestedBy: authSession?.user?.username || "console"
      };
      const event = await publishProtocolEvent(
        protocolEventBus,
        `discovery.client.migration.${targetClientId}`,
        {
          client,
          command
        },
        {
          type: "discovery.client.migration.requested",
          publisher: "console",
          retain: true
        }
      );
      await publishProtocolEvent(
        protocolEventBus,
        "discovery.client.migration",
        {
          clientId: targetClientId,
          command
        },
        {
          type: "discovery.client.migration.requested",
          publisher: "console",
          retain: true
        }
      );
      sendJson(response, 200, {
        ok: true,
        client,
        command,
        event
      });
    },
    async handleGetDiscoveryConfig({ response }) {
      const discoveryState = getDiscoveryState();
      sendJson(response, 200, {
        path: getDiscoveryConfigPath(userDataPath),
        value: discoveryState,
        bootstrap: buildBootstrapPayload(discoveryState)
      });
    },
    async handleSetDiscoveryConfig({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const value = payload?.value || payload;
      if (
        hasClientSuppliedString(value, [
          "bootstrapBaseUrl",
          "advertisedBaseUrl",
          "activeServiceUrl",
          "forwardBaseUrl",
          "serverId",
          "serverLabel",
          "configVersion"
        ])
      ) {
        sendJson(response, 400, {
          error: "discovery 配置不接受客户端传入的 URL、服务标识或标签字符串。"
        });
        return;
      }
      const discoveryState = await saveDiscoveryConfig(userDataPath, stripClientDiscoveryStrings(value), {
        listenUrl: getListenUrl(),
        serverLabel
      });
      setDiscoveryState(discoveryState);
      await publishProtocolEvent(
        protocolEventBus,
        "discovery.config",
        {
          value: discoveryState,
          bootstrap: buildBootstrapPayload(discoveryState)
        },
        { type: "discovery.config.updated" }
      );
      sendJson(response, 200, {
        path: getDiscoveryConfigPath(userDataPath),
        value: discoveryState,
        bootstrap: buildBootstrapPayload(discoveryState)
      });
    },
    async handleGetRuntimeInfo({ response }) {
      sendJson(
        response,
        200,
        await buildRuntimeInfo({
          userDataPath,
          distPath,
          runtime,
          discoveryState: getDiscoveryState(),
          metadataStore,
          serverUrl: getListenUrl(),
          consoleAuth
        })
      );
    },
    async handleBrowseServerPath({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const mode = normalizePathBrowserMode(payload.mode);
      sendJson(
        response,
        200,
        await browseServerPath({
          requestedPath: payload.path || payload.currentPath || "",
          mode,
          extensions: normalizePathBrowserExtensions(payload.extensions),
          includeHidden: Boolean(payload.includeHidden),
          userDataPath,
          distPath
        })
      );
    },
    async handleGetMounts({ response }) {
      const settings = await loadSettings(userDataPath, { redactSecrets: true });
      const savedConfig = await loadMountConfig(userDataPath);
      sendJson(response, 200, {
        path: getMountConfigPath(userDataPath),
        paths: getMountConfigPaths(userDataPath),
        value: savedConfig,
        runtime: {
          mountGeneration: runtime.mountGeneration || 0,
          mountModules: runtime.runtimeOptions.mountModules,
          mountRouting: runtime.runtimeOptions.mountRouting,
          mounts: Object.entries(runtime.mounts || {}).map(([name, mount]) => ({
            name,
            id: mount?.id || "",
            kind: mount?.kind || name,
            enabled: mount?.enabled !== false,
            reason: mount?.reason || ""
          }))
        },
        analysisModules: await buildRuntimeInfo({
          userDataPath,
          distPath,
          runtime,
          discoveryState: getDiscoveryState(),
          metadataStore,
          serverUrl: getListenUrl(),
          consoleAuth
        }).then((info) => info.runtime.analysisModules),
        currentAnalysisModuleId: settings.analysisModuleId
      });
    },
    async handleSetMounts({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const value = payload?.value || payload;
      const incomingMountModules =
        value?.mountModules && typeof value.mountModules === "object" && !Array.isArray(value.mountModules)
          ? value.mountModules
          : {};
      const nextMountModules = {
        ...(runtime.runtimeOptions.mountModules || {}),
        ...incomingMountModules
      };
      const nextMountRouting = {
        ...mergeMountRouting(runtime.runtimeOptions.mountRouting || {}, (value && value.mountRouting) || {})
      };
      const savedConfig = await saveMountConfig(userDataPath, {
        mountModules: nextMountModules,
        mountRouting: nextMountRouting
      });
      const settings = await loadSettings(userDataPath);
      await runtime.applyMountConfig(savedConfig, { settings });
      const result = {
        path: getMountConfigPath(userDataPath),
        paths: getMountConfigPaths(userDataPath),
        value: savedConfig,
        runtime: {
          mountGeneration: runtime.mountGeneration || 0,
          mountModules: runtime.runtimeOptions.mountModules,
          mountRouting: runtime.runtimeOptions.mountRouting
        }
      };
      await publishProtocolEvent(
        protocolEventBus,
        "runtime.mounts",
        result,
        { type: "runtime.mounts.updated" }
      );
      sendJson(response, 200, {
        ...result
      });
    },
    async handleReloadMounts({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const settings = payload?.settings
        ? await saveSettings(userDataPath, payload.settings, { redactSecrets: false })
        : await loadSettings(userDataPath);
      const savedConfig = await loadMountConfig(userDataPath);
      await runtime.applyMountConfig(savedConfig, { settings });
      const result = {
        ok: true,
        path: getMountConfigPath(userDataPath),
        paths: getMountConfigPaths(userDataPath),
        value: savedConfig,
        mountGeneration: runtime.mountGeneration || 0,
        mountModules: runtime.runtimeOptions.mountModules,
        mountRouting: runtime.runtimeOptions.mountRouting,
        runtime: {
          mountGeneration: runtime.mountGeneration || 0,
          mountModules: runtime.runtimeOptions.mountModules,
          mountRouting: runtime.runtimeOptions.mountRouting
        }
      };
      await publishProtocolEvent(
        protocolEventBus,
        "runtime.mounts",
        result,
        { type: "runtime.mounts.reloaded" }
      );
      sendJson(response, 200, result);
    },
    async handleGetConsoleState({ response }) {
      sendJson(
        response,
        200,
        await buildConsoleState({
          userDataPath,
          distPath,
          runtime,
          discoveryState: getDiscoveryState(),
          jobManager,
          metadataStore,
          serverUrl: getListenUrl(),
          consoleAuth,
          maintenanceAgent
        })
      );
    },
    async handleMaintenanceAgentConfig({ requestBody, authSession, response }) {
      if (!requireMaintenanceAgent(response)) {
        return;
      }
      try {
        if (requestBody.length === 0) {
          sendJson(response, 200, await maintenanceAgent.getConfig());
          return;
        }
        const payload = parseJsonBody(requestBody);
        sendJson(
          response,
          200,
          await maintenanceAgent.setConfig(payload?.config || payload?.value || payload, {
            authSession
          })
        );
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "维护智能体配置保存失败。"
        });
      }
    },
    async handleMaintenanceAgentChat({ requestBody, authSession, response }) {
      if (!requireMaintenanceAgent(response)) {
        return;
      }
      try {
        sendJson(
          response,
          200,
          await maintenanceAgent.chat(parseJsonBody(requestBody), { authSession })
        );
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "维护智能体对话失败。"
        });
      }
    },
    async handleMaintenanceAgentRuns({ requestBody, url, authSession, response }) {
      if (!requireMaintenanceAgent(response)) {
        return;
      }
      try {
        if (requestBody.length === 0) {
          sendJson(
            response,
            200,
            await maintenanceAgent.listRuns({
              limit: Number(url.searchParams.get("limit") || 50)
            })
          );
          return;
        }
        sendJson(
          response,
          200,
          await maintenanceAgent.startRun(parseJsonBody(requestBody), { authSession })
        );
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "维护智能体运行创建失败。"
        });
      }
    },
    async handleMaintenanceAgentRun({ runId, response }) {
      if (!requireMaintenanceAgent(response)) {
        return;
      }
      const run = await maintenanceAgent.getRun(runId);
      if (!run) {
        sendJson(response, 404, {
          error: "维护运行不存在。"
        });
        return;
      }
      sendJson(response, 200, { run });
    },
    async handleMaintenanceAgentApprove({ runId, requestBody, authSession, response }) {
      if (!requireMaintenanceAgent(response)) {
        return;
      }
      try {
        const run = await maintenanceAgent.approveRun(runId, parseJsonBody(requestBody), {
          authSession
        });
        if (!run) {
          sendJson(response, 404, {
            error: "维护运行不存在。"
          });
          return;
        }
        sendJson(response, 200, { run });
      } catch (error) {
        sendJson(response, 409, {
          error: error instanceof Error ? error.message : "维护运行审批失败。"
        });
      }
    },
    async handleMaintenanceAgentCancel({ runId, requestBody, authSession, response }) {
      if (!requireMaintenanceAgent(response)) {
        return;
      }
      try {
        const run = await maintenanceAgent.cancelRun(runId, parseJsonBody(requestBody), {
          authSession
        });
        if (!run) {
          sendJson(response, 404, {
            error: "维护运行不存在。"
          });
          return;
        }
        sendJson(response, 200, { run });
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : "维护运行取消失败。"
        });
      }
    },
    async handleGetSettings({ response }) {
      const settings = await loadSettings(userDataPath, { redactSecrets: true });
      sendJson(response, 200, settings);
    },
    async handleSetSettings({ requestBody, response }) {
      const settings = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const saved = await saveSettings(userDataPath, settings, {
        redactSecrets: false
      });
      await runtime.refreshMounts({ settings: saved });
      const redactedSettings = await loadSettings(userDataPath, { redactSecrets: true });
      await publishProtocolEvent(
        protocolEventBus,
        "settings.current",
        redactedSettings,
        { type: "settings.updated" }
      );
      sendJson(response, 200, redactedSettings);
    },
    async handleProbeModel({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const provider = String(payload.provider || payload.modelProvider || "").trim();
      const current = await loadSettings(userDataPath);
      const candidateSettings = mergeSettingsForModelProbe(
        current,
        payload.settings || payload.value || {},
        provider
      );
      sendJson(
        response,
        200,
        await probeModelConnection({
          provider,
          settings: candidateSettings,
          userDataPath
        })
      );
    },
    async handleAgentGatewayConfig({ requestBody, response }) {
      const method = requestBody.length > 0 ? "POST" : "GET";
      if (method === "GET") {
        const settings = await loadSettings(userDataPath);
        sendJson(response, 200, {
          config: publicAgentGatewayConfig(settings)
        });
        return;
      }

      const payload = parseJsonBody(requestBody);
      const current = await loadSettings(userDataPath);
      const adapterPatch = payload.value || payload.config || payload;
      const nextAdapter = {
        ...(current.agentGateway || {}),
        ...(current.customHttpAdapter || {}),
        ...adapterPatch
      };
      const saved = await saveSettings(userDataPath, {
        ...current,
        modelLibraryEntries: [
          ...new Set([...(current.modelLibraryEntries || []), "custom-http"])
        ],
        customModelAlias:
          adapterPatch.alias || adapterPatch.modelAlias || current.customModelAlias,
        customHttpAdapter: nextAdapter,
        agentGateway: nextAdapter
      });
      const redactedSettings = await loadSettings(userDataPath, { redactSecrets: true });
      await publishProtocolEvent(
        protocolEventBus,
        "settings.current",
        redactedSettings,
        { type: "settings.updated" }
      );
      sendJson(response, 200, {
        config: publicAgentGatewayConfig(saved)
      });
    },
    async handleAgentGatewayCall({ requestBody, response }) {
      const input = parseJsonBody(requestBody);
      const settings = await loadSettings(userDataPath);
      sendJson(
        response,
        200,
        await callAgentGateway({
          settings,
          input,
          userDataPath,
          contextRuntime,
          contextCompactionSource: "api.agent_gateway.call"
        })
      );
    },
    async handleAgentRegistry({ response }) {
      const settings = await loadSettings(userDataPath);
      sendJson(response, 200, publicAgentGatewayRegistry(settings));
    },
    async handleCreateAgent({ requestBody, response }) {
      const patch = normalizeAgentModelPayload(parseJsonBody(requestBody));
      const provider = patch.provider || "deepseek";
      const model = patch.model || patch.engine || "";
      const current = await loadSettings(userDataPath);
      const fallbackLabel = `${provider} ${model}`.trim();
      const entry = {
        provider,
        ...patch,
        uid: patch.uid || createAgentUid({ ...patch, provider, model }),
        label: Object.hasOwn(patch, "label") ? patch.label : fallbackLabel,
        agentName: Object.hasOwn(patch, "agentName")
          ? patch.agentName
          : (Object.hasOwn(patch, "label") ? patch.label : fallbackLabel),
        model,
        engine: Object.hasOwn(patch, "engine") ? patch.engine : model
      };
      const models = [entry, ...(current.modelLibraryModels || [])];
      const { registry } = await saveAgentModelLibrary(current, models);
      const agent = registry.agents.find((item) => item.alias === entry.uid) || null;
      sendJson(response, 200, {
        ok: true,
        action: "created",
        agentId: entry.uid,
        agent,
        registry
      });
    },
    async handleUpdateAgent({ agentId, requestBody, response }) {
      const patch = normalizeAgentModelPayload(parseJsonBody(requestBody));
      const current = await loadSettings(userDataPath);
      const models = [...(current.modelLibraryModels || [])];
      const index = findAgentModelIndex(models, agentId);
      if (index < 0) {
        sendJson(response, 404, { error: "智能体模型配置不存在。" });
        return;
      }
      const previous = models[index];
      const next = {
        ...previous,
        ...patch,
        uid: previous.uid || previous.instanceId || previous.alias || String(agentId || ""),
        instanceId: previous.instanceId || previous.uid || previous.alias || String(agentId || ""),
        alias: previous.alias || previous.uid || previous.instanceId || String(agentId || "")
      };
      if (Object.hasOwn(patch, "label") && !Object.hasOwn(patch, "agentName")) {
        next.agentName = patch.label;
      }
      if (Object.hasOwn(patch, "model") && !Object.hasOwn(patch, "engine")) {
        next.engine = patch.model;
      }
      models[index] = next;
      const { registry } = await saveAgentModelLibrary(current, models);
      const agent = registry.agents.find((item) => item.alias === next.uid) || null;
      sendJson(response, 200, {
        ok: true,
        action: "updated",
        agentId: next.uid,
        agent,
        registry
      });
    },
    async handleDeleteAgent({ agentId, response }) {
      const current = await loadSettings(userDataPath);
      const models = [...(current.modelLibraryModels || [])];
      const index = findAgentModelIndex(models, agentId);
      if (index < 0) {
        sendJson(response, 404, { error: "智能体模型配置不存在。" });
        return;
      }
      const [removed] = models.splice(index, 1);
      const { registry } = await saveAgentModelLibrary(current, models);
      sendJson(response, 200, {
        ok: true,
        action: "deleted",
        agentId: removed.uid || removed.instanceId || removed.alias || String(agentId || ""),
        registry
      });
    },
    async handleGetCodexOAuthStatus({ response }) {
      sendJson(response, 200, await getCodexOAuthStatus());
    },
    async handleStartCodexOAuthLogin({ response }) {
      sendJson(response, 200, await startCodexDeviceLogin());
    },
    async handleCodexOAuthReturn({ response }) {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8"
      });
      response.end(`<!doctype html>
<html lang="zh-CN" translate="no" class="notranslate">
  <head><meta charset="utf-8"><meta name="google" content="notranslate"><title>Codex OAuth 验证</title></head>
  <body translate="no" class="notranslate">
    <p>Codex OAuth 验证已返回。可以关闭此页，SplitAll 控制台会自动刷新状态。</p>
    <script>setTimeout(() => window.close(), 800);</script>
  </body>
</html>`);
    },
    async handleGetRules({ response }) {
      const rules = await loadEmailRules(userDataPath);
      sendJson(response, 200, {
        path: getEmailRulesPath(userDataPath),
        rules
      });
    },
    async handleSetRules({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const saved = await saveEmailRules(userDataPath, payload?.rules || payload);
      await publishProtocolEvent(
        protocolEventBus,
        "email_rules.current",
        {
          path: getEmailRulesPath(userDataPath),
          rules: saved
        },
        { type: "email_rules.updated" }
      );
      sendJson(response, 200, {
        path: getEmailRulesPath(userDataPath),
        rules: saved
      });
    },
    async handleGetExpertVocabulary({ response }) {
      const vocabulary = await loadExpertVocabulary(userDataPath);
      sendJson(response, 200, {
        path: getExpertVocabularyPath(userDataPath),
        vocabulary
      });
    },
    async handleSetExpertVocabulary({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const saved = await saveExpertVocabulary(userDataPath, payload?.vocabulary || payload);
      await publishProtocolEvent(
        protocolEventBus,
        "expert_vocabulary.current",
        {
          path: getExpertVocabularyPath(userDataPath),
          vocabulary: saved
        },
        { type: "expert_vocabulary.updated" }
      );
      sendJson(response, 200, {
        path: getExpertVocabularyPath(userDataPath),
        vocabulary: saved
      });
    },
    async handleListExpertVocabularyVersions({ response }) {
      sendJson(response, 200, await listExpertVocabularyVersions(userDataPath));
    },
    async handleListKnowledgePackages({ response }) {
      sendJson(response, 200, await listKnowledgePackages(userDataPath));
    },
    async handleGetKnowledgePackage({ packageId, version, response }) {
      const result = await getKnowledgePackage(userDataPath, { packageId, version });
      if (!result) {
        sendJson(response, 404, { error: "知识包不存在。" });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleCreateKnowledgePackage({ requestBody, authSession, response }) {
      const payload = parseJsonBody(requestBody);
      const result = await createOrUpdateKnowledgePackage(userDataPath, payload, {
        createdBy: authSession?.user?.username || ""
      });
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge_package.current",
        result,
        { type: "knowledge_package.updated" }
      );
      sendJson(response, 200, result);
    },
    async handleUpdateKnowledgePackage({ packageId, requestBody, authSession, response }) {
      const payload = {
        ...parseJsonBody(requestBody),
        packageId
      };
      const result = await createOrUpdateKnowledgePackage(userDataPath, payload, {
        createdBy: authSession?.user?.username || ""
      });
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge_package.current",
        result,
        { type: "knowledge_package.updated" }
      );
      sendJson(response, 200, result);
    },
    async handlePublishKnowledgePackage({ packageId, requestBody, authSession, response }) {
      const payload = {
        ...parseJsonBody(requestBody),
        packageId
      };
      const result = await publishKnowledgePackage(userDataPath, payload, {
        createdBy: authSession?.user?.username || ""
      });
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge_package.published",
        result,
        { type: "knowledge_package.published" }
      );
      sendJson(response, 200, result);
    },
    async handleRollbackKnowledgePackage({ packageId, requestBody, authSession, response }) {
      const payload = {
        ...parseJsonBody(requestBody),
        packageId
      };
      const result = await rollbackKnowledgePackage(userDataPath, payload, {
        createdBy: authSession?.user?.username || ""
      });
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge_package.rolled_back",
        result,
        { type: "knowledge_package.rolled_back" }
      );
      sendJson(response, 200, result);
    },
    async handleExportKnowledgePackage({ packageId, version, response }) {
      const result = await getKnowledgePackage(userDataPath, { packageId, version });
      if (!result) {
        sendJson(response, 404, { error: "知识包不存在。" });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleGetKnowledgeTaxonomy({ response }) {
      const taxonomy = await loadKnowledgeTaxonomy(userDataPath);
      sendJson(response, 200, {
        path: getKnowledgeTaxonomyPath(userDataPath),
        taxonomy,
        guidance: await getKnowledgeGuidanceSummary(userDataPath)
      });
    },
    async handleSetKnowledgeTaxonomy({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const saved = await saveKnowledgeTaxonomy(userDataPath, payload?.taxonomy || payload);
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge_taxonomy.current",
        {
          path: getKnowledgeTaxonomyPath(userDataPath),
          taxonomy: saved
        },
        { type: "knowledge_taxonomy.updated" }
      );
      sendJson(response, 200, {
        path: getKnowledgeTaxonomyPath(userDataPath),
        taxonomy: saved,
        guidance: await getKnowledgeGuidanceSummary(userDataPath)
      });
    },
    async handleListKnowledgeTaxonomyVersions({ response }) {
      sendJson(response, 200, await listKnowledgeTaxonomyVersions(userDataPath));
    },
    async handleGetStorageSummary({ response }) {
      sendJson(response, 200, metadataStore.getStorageSummary());
    },
    async handleStorageDoctor({ response }) {
      sendJson(response, 200, await runStorageDoctor({ userDataPath }));
    },
    async handleStorageReconcile({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      sendJson(response, 200, await reconcileStorage({
        userDataPath,
        apply: payload.apply !== false,
        pruneOrphanObjects: payload.pruneOrphanObjects === true
      }));
    },
    async handleFailedJobsReview({ limit, response }) {
      const jobs = await jobManager.listJobs({
        limit: Number(limit || 50)
      });
      const failed = (jobs.items || []).filter((job) => job.status === "failed");
      sendJson(response, 200, {
        ok: true,
        summary: jobs.summary,
        failedCount: failed.length,
        failedJobs: failed.map((job) => ({
          id: job.id,
          stage: job.stage || "",
          error: job.error || "",
          createdAt: job.createdAt || "",
          updatedAt: job.updatedAt || ""
        })),
        suggestions:
          failed.length > 0
            ? [
                "查看失败任务的输入来源与解析器路由。",
                "确认外部挂载、Tika、OCR 与模型配置是否可用。",
                "需要重跑时由管理员在任务面板或 CLI 明确触发。"
              ]
            : ["最近任务未发现失败项。"]
      });
    },
    async handleGetBackgroundProcesses({ response }) {
      sendJson(response, 200, await getBackgroundProcessStatus(userDataPath));
    },
    async handleListCheckpointTrees({ url, response }) {
      const trees = await listCheckpointTrees({
        userDataPath,
        ownerId: url.searchParams.get("ownerId") || url.searchParams.get("owner-id") || "",
        kind: url.searchParams.get("kind") || "",
        limit: Number(url.searchParams.get("limit") || 100)
      });
      sendJson(response, 200, {
        schemaVersion: 1,
        count: trees.length,
        items: trees.map(checkpointTreeSummary)
      });
    },
    async handleGetCheckpointTree({ treeId, response }) {
      const tree = await loadCheckpointTree({
        userDataPath,
        treeId
      });
      if (!tree) {
        sendJson(response, 404, {
          error: "checkpoint tree 不存在。"
        });
        return;
      }
      sendJson(response, 200, tree);
    },
    async handleMonitorAlerts({ requestBody, response }) {
      if (requestBody.length === 0) {
        sendJson(response, 200, await getMonitorAlertState(userDataPath));
        return;
      }
      const payload = parseJsonBody(requestBody);
      const config = await saveMonitorAlertConfig(userDataPath, payload.config || payload);
      const state = await getMonitorAlertState(userDataPath);
      sendJson(response, 200, {
        ...state,
        config
      });
    },
    async handleEnhanceAffairTaxonomy({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const settings = await loadSettings(userDataPath);
      const result = await enhanceAffairTaxonomy({
        documents: Array.isArray(payload?.documents) ? payload.documents : [],
        settings,
        userDataPath
      });
      sendJson(response, 200, result);
    },
    async handleKnowledgeConsole({ response }) {
      const summary = await buildKnowledgeConsoleSummary(runtime, jobManager);
      sendJson(response, 200, {
        ...summary,
        sources: knowledgeSourceService ? await knowledgeSourceService.listSources() : undefined
      });
    },
    async handleKnowledgeSources({ response }) {
      if (!knowledgeSourceService) {
        sendJson(response, 503, { error: "知识库目录同步服务不可用。" });
        return;
      }
      sendJson(response, 200, await knowledgeSourceService.listSources());
    },
    async handleCreateKnowledgeSource({ requestBody, response }) {
      if (!knowledgeSourceService) {
        sendJson(response, 503, { error: "知识库目录同步服务不可用。" });
        return;
      }
      sendJson(response, 200, await knowledgeSourceService.createSource(parseJsonBody(requestBody)));
    },
    async handleUpdateKnowledgeSource({ sourceId, requestBody, response }) {
      if (!knowledgeSourceService) {
        sendJson(response, 503, { error: "知识库目录同步服务不可用。" });
        return;
      }
      const result = await knowledgeSourceService.updateSource(sourceId, parseJsonBody(requestBody));
      if (!result) {
        sendJson(response, 404, { error: "知识库目录不存在。" });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleDeleteKnowledgeSource({ sourceId, response }) {
      if (!knowledgeSourceService) {
        sendJson(response, 503, { error: "知识库目录同步服务不可用。" });
        return;
      }
      const result = await knowledgeSourceService.deleteSource(sourceId);
      if (!result) {
        sendJson(response, 404, { error: "知识库目录不存在。" });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleRefreshKnowledgeSource({ sourceId, requestBody, response }) {
      if (!knowledgeSourceService) {
        sendJson(response, 503, { error: "知识库目录同步服务不可用。" });
        return;
      }
      sendJson(response, 200, await knowledgeSourceService.refreshSource(sourceId, parseJsonBody(requestBody)));
    },
    async handleRefreshAllKnowledgeSources({ requestBody, response }) {
      if (!knowledgeSourceService) {
        sendJson(response, 503, { error: "知识库目录同步服务不可用。" });
        return;
      }
      sendJson(response, 200, await knowledgeSourceService.refreshAll(parseJsonBody(requestBody)));
    },
    async handleKnowledgeConfigSchema({ response }) {
      sendJson(response, 200, {
        schemaVersion: 1,
        groups: [
          {
            id: "retrieval",
            label: "检索融合",
            fields: [
              { name: "retrieval.topK", type: "number", min: 1, max: 100, defaultValue: 20, label: "Top K" },
              { name: "retrieval.bm25Weight", type: "number", min: 0, max: 1, step: 0.05, defaultValue: 0.55, label: "BM25 权重" },
              { name: "retrieval.vectorWeight", type: "number", min: 0, max: 1, step: 0.05, defaultValue: 0.3, label: "向量权重" },
              { name: "retrieval.imageWeight", type: "number", min: 0, max: 1, step: 0.05, defaultValue: 0.15, label: "图片权重" },
              { name: "retrieval.graphWeight", type: "number", min: 0, max: 1, step: 0.05, defaultValue: 0.05, label: "图谱提示权重" },
              { name: "retrieval.feedbackBoost", type: "number", min: 0, max: 1, step: 0.05, defaultValue: 0.08, label: "反馈提升权重" },
              { name: "retrieval.recencyWeight", type: "number", min: 0, max: 1, step: 0.01, defaultValue: 0.08, label: "时间新鲜度权重", description: "按指数半衰期为更近的资料提供轻量排序加成，0 表示关闭。" },
              { name: "retrieval.recencyHalfLifeDays", type: "number", min: 1, max: 3650, defaultValue: 45, label: "时间新鲜度半衰期（天）", description: "指数衰减参数：资料年龄达到该天数时，新鲜度分约降为 50%。" },
              { name: "retrieval.recencyFloor", type: "number", min: 0, max: 1, step: 0.01, defaultValue: 0.05, label: "新鲜度最低保留", description: "避免旧资料被时间因子完全压制，只影响排序，不删除或屏蔽知识。" },
              { name: "retrieval.parentExpansionDepth", type: "number", min: 0, max: 5, defaultValue: 1, label: "父级扩展深度" },
              { name: "retrieval.hierarchicalIndexEnabled", type: "boolean", defaultValue: true, label: "启用分层索引" },
              { name: "retrieval.hierarchyWeight", type: "number", min: 0, max: 1, step: 0.05, defaultValue: 0.18, label: "分层路径权重" },
              { name: "retrieval.hierarchyBranchTopK", type: "number", min: 3, max: 50, defaultValue: 12, label: "粗层候选分支数" },
              { name: "retrieval.hierarchyBackoffLimit", type: "number", min: 1, max: 80, defaultValue: 16, label: "分层回退片段数" },
              { name: "retrieval.hierarchyMinBranchCandidates", type: "number", min: 1, max: 20, defaultValue: 3, label: "分支最少细候选数" }
            ]
          },
          {
            id: "learning",
            label: "进化学习",
            fields: [
              { name: "learning.enabled", type: "boolean", defaultValue: true, label: "启用学习闭环" },
              { name: "learning.autoApplyRetrievalProfiles", type: "boolean", defaultValue: true, label: "自动发布检索 profile" },
              { name: "learning.feedbackWindowHours", type: "number", min: 1, max: 8760, defaultValue: 168, label: "反馈窗口小时数" },
              { name: "learning.minFeedbackForAutoTune", type: "number", min: 1, max: 10000, defaultValue: 1, label: "自动调参最少反馈数" },
              { name: "learning.requireEvaluationBeforeProfileActivation", type: "boolean", defaultValue: true, label: "激活前必须离线评估" },
              { name: "learning.canaryEnabled", type: "boolean", defaultValue: true, label: "启用检索策略灰度" },
              { name: "learning.canaryTrafficPercent", type: "number", min: 1, max: 100, defaultValue: 10, label: "默认灰度流量百分比" }
            ]
          },
          {
            id: "maintenance",
            label: "维护策略",
            fields: [
              { name: "maintenance.reindexBatchSize", type: "number", min: 1, max: 5000, defaultValue: 500, label: "重建批大小" },
              { name: "maintenance.staleIndexHours", type: "number", min: 1, max: 8760, defaultValue: 72, label: "过期索引小时数" },
              { name: "maintenance.requireOcrOrCaption", type: "boolean", defaultValue: true, label: "图片必须带 OCR 或说明" }
            ]
          },
          {
            id: "embeddingModel",
            label: "Embedding",
            fields: [
              { name: "embeddingModel.version", type: "string", defaultValue: "", label: "模型版本" },
              { name: "embeddingModel.text", type: "string", defaultValue: "builtin:hashing-multilingual-v1", label: "文本 provider" },
              { name: "embeddingModel.image", type: "string", defaultValue: "builtin:asset-ocr-caption-v1", label: "图片 provider" }
            ]
          }
        ],
        maintenanceTasks: [
          { id: "validate_assets", label: "校验资产", danger: "low", requiresConfirm: false },
          { id: "repair_missing_thumbnails", label: "修复缩略图", danger: "low", requiresConfirm: false },
          { id: "delete_orphan_objects", label: "删除孤立对象", danger: "high", requiresConfirm: true },
          { id: "garbage_cleanup", label: "垃圾清理", danger: "high", requiresConfirm: true, supportsDryRun: true },
          { id: "compare_retrieval_profiles", label: "比较检索参数", danger: "low", requiresConfirm: false },
          { id: "learning_run", label: "执行学习调参", danger: "low", requiresConfirm: false },
          { id: "validate_quality", label: "质量断言", danger: "low", requiresConfirm: false },
          { id: "reembed_by_model_version", label: "按模型重算 embedding", danger: "medium", requiresConfirm: true },
          { id: "reindex", label: "重建索引", danger: "medium", requiresConfirm: true }
        ]
      });
    },
    async handleKnowledgeCapabilities({ response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.capabilities === "function") {
        sendJson(response, 200, await knowledgeCore.capabilities());
        return;
      }
      sendJson(response, 503, {
        error: "知识库协议模块不可用。"
      });
    },
    async handleKnowledgeHealth({ response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.health === "function") {
        sendJson(response, 200, await knowledgeCore.health());
        return;
      }
      sendJson(response, 503, {
        ok: false,
        error: "知识库协议模块不可用。"
      });
    },
    async handleKnowledgeMaintenanceGet({ response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.getMaintenance === "function") {
        sendJson(response, 200, await knowledgeCore.getMaintenance());
        return;
      }
      sendJson(response, 503, {
        error: "知识库维护模块不可用。"
      });
    },
    async handleKnowledgeMaintenanceSet({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.setMaintenance === "function") {
        const result = await knowledgeCore.setMaintenance(payload?.value || payload);
        const recencyHalfLifeDays = Number(result?.retrieval?.recencyHalfLifeDays);
        if (Number.isFinite(recencyHalfLifeDays) && recencyHalfLifeDays > 0) {
          await saveSettings(userDataPath, { retrievalHalfLifeDays: recencyHalfLifeDays });
        }
        sendJson(response, 200, result);
        return;
      }
      sendJson(response, 503, {
        error: "知识库维护模块不可用。"
      });
    },
    async handleKnowledgeReindex({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      if (payload?.confirm !== true) {
        sendJson(response, 400, {
          error: "重建知识库索引需要 confirm=true。"
        });
        return;
      }
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.reindex === "function") {
        sendJson(response, 200, await knowledgeCore.reindex(payload));
        return;
      }
      sendJson(response, 503, {
        error: "知识库重建模块不可用。"
      });
    },
    async handleKnowledgeMaintenanceRun({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const taskType = String(payload.taskType || payload.task || "")
        .trim()
        .replace(/-/g, "_");
      if (
        [
          "delete_orphan_objects",
          "garbage_cleanup",
          "cleanup_garbage",
          "gc",
          "compact_storage",
          "reembed_by_model_version",
          "reindex",
          "rebuild_index"
        ].includes(taskType) &&
        payload.dryRun !== true &&
        payload.dry_run !== true &&
        payload.confirm !== true
      ) {
        sendJson(response, 400, {
          error: `维护任务 ${taskType} 需要 confirm=true。`
        });
        return;
      }
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.runMaintenance === "function") {
        sendJson(response, 200, await knowledgeCore.runMaintenance(payload));
        return;
      }
      sendJson(response, 503, {
        error: "知识库维护任务模块不可用。"
      });
    },
    async handleKnowledgeSync({ url, response }) {
      const scope = String(url.searchParams.get("scope") || "").trim().toLowerCase();
      if (scope === "mirror") {
        const knowledgeCore = getKnowledgeCore(runtime);
        if (knowledgeCore && typeof knowledgeCore.syncMirror === "function") {
          sendJson(
            response,
            200,
            await knowledgeCore.syncMirror({
              since: Number(url.searchParams.get("since") || 0),
              limit: Number(url.searchParams.get("limit") || 500)
            })
          );
          return;
        }
      }
      sendJson(
        response,
        200,
        metadataStore.syncKnowledge({
          since: Number(url.searchParams.get("since") || 0),
          limit: Number(url.searchParams.get("limit") || 500),
          scope
        })
      );
    },
    async handleKnowledgeChanges({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const result = metadataStore.submitKnowledgeChanges({
        changes: Array.isArray(payload?.changes)
          ? payload.changes
          : Array.isArray(payload?.outbox)
            ? payload.outbox
            : []
      });
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.changes",
        result,
        { type: "knowledge.changes.submitted" }
      );
      sendJson(response, 200, result);
    },
    async handleKnowledgeReviewItems({ url, response }) {
      const requestedStatus = url.searchParams.get("status") || "pending";
      const status = requestedStatus === "all" ? "" : requestedStatus;
      const limit = Number(url.searchParams.get("limit") || 100);
      const metadataItems = metadataStore.listKnowledgeReviewItems({
        status,
        limit
      });
      const knowledgeCore = getKnowledgeCore(runtime);
      const coreItems =
        knowledgeCore && typeof knowledgeCore.listReviewItems === "function"
          ? await knowledgeCore.listReviewItems({ status, limit })
          : { items: [] };
      const items = [
        ...(metadataItems.items || []).map((item) => ({
          ...item,
          source: item.source || "metadata-store"
        })),
        ...(coreItems.items || []).map((item) => ({
          ...item,
          source: item.source || "knowledge-core"
        }))
      ]
        .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
        .slice(0, Math.max(1, Math.min(limit, 500)));
      sendJson(response, 200, {
        status: requestedStatus,
        items,
        count: items.length,
        sources: {
          metadataStore: (metadataItems.items || []).length,
          knowledgeCore: (coreItems.items || []).length
        }
      });
    },
    async handleResolveKnowledgeReviewItem({ reviewId, requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      let result = metadataStore.resolveKnowledgeReviewItem({
        reviewId,
        resolution: payload?.resolution || payload?.action || "reject",
        patch: payload?.patch || payload?.fieldPatch || {}
      });
      if (!result) {
        const knowledgeCore = getKnowledgeCore(runtime);
        if (knowledgeCore && typeof knowledgeCore.resolveReviewItem === "function") {
          result = await knowledgeCore.resolveReviewItem({
            reviewId,
            resolution: payload?.resolution || payload?.action || "reject",
            patch: payload?.patch || payload?.fieldPatch || {}
          });
        }
      }
      if (!result) {
        sendJson(response, 404, {
          error: "审核项不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.review_items",
        result,
        { type: "knowledge.review_item.resolved" }
      );
      sendJson(response, 200, result);
    },
    async handleKnowledgeFeedback({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.recordFeedback === "function") {
        const result = await knowledgeCore.recordFeedback(payload || {});
        await publishProtocolEvent(
          protocolEventBus,
          "knowledge.feedback",
          result,
          { type: "knowledge.feedback.recorded" }
        );
        sendJson(response, 200, result);
        return;
      }
      sendJson(response, 503, {
        error: "知识库学习反馈模块不可用。"
      });
    },
    async handleKnowledgeSuggestions({ url, response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.listSuggestions === "function") {
        sendJson(
          response,
          200,
          await knowledgeCore.listSuggestions({
            status: url.searchParams.get("status") || "pending",
            limit: Number(url.searchParams.get("limit") || 100)
          })
        );
        return;
      }
      sendJson(response, 503, {
        error: "知识库建议模块不可用。"
      });
    },
    async handleGoldenRules({ response }) {
      if (!goldenRuleRuntime) {
        sendJson(response, 503, {
          error: "黄金规则运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await goldenRuleRuntime.listRulePackages());
    },
    async handleSaveGoldenRules({ requestBody, response }) {
      if (!goldenRuleRuntime) {
        sendJson(response, 503, {
          error: "黄金规则运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await goldenRuleRuntime.saveRulePackage(parseJsonBody(requestBody)));
    },
    async handlePublishGoldenRules({ packageId, requestBody, response }) {
      if (!goldenRuleRuntime) {
        sendJson(response, 503, {
          error: "黄金规则运行时不可用。"
        });
        return;
      }
      const result = await goldenRuleRuntime.publishRulePackage({
        ...parseJsonBody(requestBody),
        packageId
      });
      if (!result) {
        sendJson(response, 404, {
          error: "黄金规则包不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.golden_rules",
        result,
        { type: "knowledge.golden_rules.published" }
      );
      sendJson(response, 200, result);
    },
    async handleRollbackGoldenRules({ packageId, requestBody, response }) {
      if (!goldenRuleRuntime) {
        sendJson(response, 503, {
          error: "黄金规则运行时不可用。"
        });
        return;
      }
      const result = await goldenRuleRuntime.rollbackRulePackage({
        ...parseJsonBody(requestBody),
        packageId
      });
      if (!result) {
        sendJson(response, 404, {
          error: "黄金规则包不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.golden_rules",
        result,
        { type: "knowledge.golden_rules.rollback" }
      );
      sendJson(response, 200, result);
    },
    async handleKnowledgeRuleAuthoringChat({ requestBody, response }) {
      if (!knowledgeRuleAuthoringRuntime) {
        sendJson(response, 503, {
          error: "规则生成智能体运行时不可用。"
        });
        return;
      }
      const result = await knowledgeRuleAuthoringRuntime.chat(parseJsonBody(requestBody));
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.rule_authoring",
        result,
        { type: "knowledge.rule_authoring.completed" }
      );
      sendJson(response, 200, result);
    },
    async handleKnowledgeRuleAuthoringRunGet({ runId, response }) {
      if (!knowledgeRuleAuthoringRuntime) {
        sendJson(response, 503, {
          error: "规则生成智能体运行时不可用。"
        });
        return;
      }
      const result = await knowledgeRuleAuthoringRuntime.getRun({ runId });
      if (!result) {
        sendJson(response, 404, {
          error: "规则生成运行不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleGoldCases({ url, response }) {
      if (!goldenRuleRuntime) {
        sendJson(response, 503, {
          error: "黄金样本运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await goldenRuleRuntime.listGoldCases({
        limit: Number(url.searchParams.get("limit") || 100),
        tag: url.searchParams.get("tag") || ""
      }));
    },
    async handleSaveGoldCase({ requestBody, response }) {
      if (!goldenRuleRuntime) {
        sendJson(response, 503, {
          error: "黄金样本运行时不可用。"
        });
        return;
      }
      const result = await goldenRuleRuntime.saveGoldCase(parseJsonBody(requestBody));
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.gold_cases",
        result,
        { type: "knowledge.gold_case.saved" }
      );
      sendJson(response, 200, result);
    },
    async handleKnowledgeDistillationRuns({ requestBody, response }) {
      if (!knowledgeDistillationRuntime) {
        sendJson(response, 503, {
          error: "知识蒸馏运行时不可用。"
        });
        return;
      }
      const result = await knowledgeDistillationRuntime.runDistillation(parseJsonBody(requestBody));
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.distillation",
        result,
        { type: "knowledge.distillation.completed" }
      );
      sendJson(response, 201, result);
    },
    async handleKnowledgeDistillationRunGet({ runId, response }) {
      if (!knowledgeDistillationRuntime) {
        sendJson(response, 503, {
          error: "知识蒸馏运行时不可用。"
        });
        return;
      }
      const result = await knowledgeDistillationRuntime.getRun({ runId });
      if (!result) {
        sendJson(response, 404, {
          error: "知识蒸馏任务不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleResolveKnowledgeSuggestion({ suggestionId, requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.resolveSuggestion === "function") {
        const result = await knowledgeCore.resolveSuggestion({
          suggestionId,
          resolution: payload?.resolution || payload?.action || "reject",
          patch: payload?.patch || payload?.fieldPatch || {}
        });
        if (!result) {
          sendJson(response, 404, {
            error: "知识库建议不存在。"
          });
          return;
        }
        await publishProtocolEvent(
          protocolEventBus,
          "knowledge.suggestions",
          result,
          { type: "knowledge.suggestion.resolved" }
        );
        sendJson(response, 200, result);
        return;
      }
      sendJson(response, 503, {
        error: "知识库建议模块不可用。"
      });
    },
    async handleKnowledgeLearningJob({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.runLearningJob === "function") {
        const result = await knowledgeCore.runLearningJob(payload || {});
        await publishProtocolEvent(
          protocolEventBus,
          "knowledge.learning",
          result,
          { type: "knowledge.learning.completed" }
        );
        sendJson(response, 200, result);
        return;
      }
      sendJson(response, 503, {
        error: "知识库学习任务模块不可用。"
      });
    },
    async handleKnowledgeLearningHealth({ response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.learningHealth === "function") {
        sendJson(response, 200, await knowledgeCore.learningHealth());
        return;
      }
      sendJson(response, 503, {
        ok: false,
        error: "知识库学习运行时不可用。"
      });
    },
    async handleEvidenceGateEvaluate({ requestBody, response }) {
      if (!evidenceSufficiencyGate) {
        sendJson(response, 503, {
          error: "证据充分性门禁不可用。"
        });
        return;
      }
      sendJson(response, 200, evidenceSufficiencyGate.evaluate(parseJsonBody(requestBody)));
    },
    async handleKnowledgeAgentSkill({ response }) {
      if (!knowledgeAgentSkill) {
        sendJson(response, 503, {
          error: "知识库智能体技能不可用。"
        });
        return;
      }
      sendJson(response, 200, knowledgeAgentSkill.describe());
    },
    async handleKnowledgeAgentSkillPlan({ requestBody, response }) {
      if (!knowledgeAgentSkill) {
        sendJson(response, 503, {
          error: "知识库智能体技能不可用。"
        });
        return;
      }
      sendJson(response, 200, knowledgeAgentSkill.plan(parseJsonBody(requestBody)));
    },
    async handleKnowledgeAgentSkillRun({ requestBody, response }) {
      if (!knowledgeAgentSkill) {
        sendJson(response, 503, {
          error: "知识库智能体技能不可用。"
        });
        return;
      }
      sendJson(response, 200, await knowledgeAgentSkill.run(parseJsonBody(requestBody)));
    },
    async handleKnowledgeSkills({ url, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, knowledgeSkillRuntime.listSkills({
        status: url.searchParams.get("status") || "",
        query: url.searchParams.get("query") || url.searchParams.get("q") || "",
        limit: Number(url.searchParams.get("limit") || 50)
      }));
    },
    async handleKnowledgeSkillGet({ skillId, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      const skill = knowledgeSkillRuntime.getSkill(skillId);
      if (!skill) {
        sendJson(response, 404, {
          error: "知识 Skill 不存在。"
        });
        return;
      }
      sendJson(response, 200, skill);
    },
    async handleKnowledgeSkillGenerate({ requestBody, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      sendJson(response, 201, await knowledgeSkillRuntime.generateSkill(parseJsonBody(requestBody)));
    },
    async handleKnowledgeSkillPropose({ requestBody, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      sendJson(response, 201, await knowledgeSkillRuntime.proposeSkill(parseJsonBody(requestBody)));
    },
    async handleKnowledgeSkillResolve({ requestBody, skillId, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      const result = knowledgeSkillRuntime.resolveSkill({
        ...parseJsonBody(requestBody),
        skillId
      });
      if (!result) {
        sendJson(response, 404, {
          error: "知识 Skill 不存在。"
        });
        return;
      }
      if (result.ok !== false && goldenRuleRuntime && ["publish", "accept", "published", "reject", "rejected"].includes(String(result.action || "").trim())) {
        try {
          await goldenRuleRuntime.saveGoldCaseFromSkillResolution({
            skill: result.skill,
            action: result.action
          });
        } catch {
          // Gold-case creation must not block the human review action.
        }
      }
      sendJson(response, result.ok === false ? 409 : 200, result);
    },
    async handleKnowledgeSkillFramework({ response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, {
        protocolVersion: knowledgeSkillRuntime.protocolVersion,
        framework: await knowledgeSkillRuntime.loadFramework()
      });
    },
    async handleSaveKnowledgeSkillFramework({ requestBody, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await knowledgeSkillRuntime.saveFramework(parseJsonBody(requestBody)));
    },
    async handleKnowledgeSkillEvaluationRuns({ requestBody, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      sendJson(response, 201, await knowledgeSkillRuntime.runSkillEvaluation(parseJsonBody(requestBody)));
    },
    async handleKnowledgeSkillDeployments({ requestBody, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      const result = await knowledgeSkillRuntime.createSkillDeployment(parseJsonBody(requestBody));
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.skill_deployments",
        result,
        { type: "knowledge.skill_deployment.created" }
      );
      sendJson(response, result.ok === false ? 409 : 201, result);
    },
    async handleKnowledgeSkillDeploymentRollback({ deploymentId, requestBody, response }) {
      if (!knowledgeSkillRuntime) {
        sendJson(response, 503, {
          error: "知识 Skill 运行时不可用。"
        });
        return;
      }
      const result = await knowledgeSkillRuntime.rollbackSkillDeployment({
        ...parseJsonBody(requestBody),
        deploymentId
      });
      if (!result) {
        sendJson(response, 404, {
          error: "SkillSet 部署不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "knowledge.skill_deployments",
        result,
        { type: "knowledge.skill_deployment.rollback" }
      );
      sendJson(response, 200, result);
    },
    async handleKnowledgeTrainingSetExport({ requestBody, response }) {
      if (!goldenRuleRuntime) {
        sendJson(response, 503, {
          error: "训练集导出运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await goldenRuleRuntime.exportTrainingSet(parseJsonBody(requestBody)));
    },
    async handleAgentEvaluationRuns({ requestBody, response }) {
      if (!agentEvaluationRuntime) {
        sendJson(response, 503, {
          error: "智能体评估运行时不可用。"
        });
        return;
      }
      sendJson(response, 201, await agentEvaluationRuntime.runEvaluation(parseJsonBody(requestBody)));
    },
    async handleAgentEvaluationRunList({ url, response }) {
      if (!agentEvaluationRuntime) {
        sendJson(response, 503, {
          error: "智能体评估运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await agentEvaluationRuntime.listRuns({
        limit: Number(url.searchParams.get("limit") || 50)
      }));
    },
    async handleAgentEvaluationRun({ runId, response }) {
      if (!agentEvaluationRuntime) {
        sendJson(response, 503, {
          error: "智能体评估运行时不可用。"
        });
        return;
      }
      const result = await agentEvaluationRuntime.getRun(runId);
      if (!result) {
        sendJson(response, 404, {
          error: "智能体评估任务不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleModelDecisionRoles({ response }) {
      if (!modelDecisionRuntime) {
        sendJson(response, 503, {
          error: "模型决策运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, modelDecisionRuntime.describe());
    },
    async handleModelDecisionDecide({ requestBody, response }) {
      if (!modelDecisionRuntime) {
        sendJson(response, 503, {
          error: "模型决策运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await modelDecisionRuntime.decide(parseJsonBody(requestBody)));
    },
    async handleKnowledgeEvolutionDescribe({ response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, knowledgeEvolutionRuntime.describe());
    },
    async handleKnowledgeEvolutionRun({ requestBody, response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      sendJson(response, 201, await knowledgeEvolutionRuntime.runEvolution(parseJsonBody(requestBody)));
    },
    async handleKnowledgeEvolutionRuns({ url, response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await knowledgeEvolutionRuntime.listRuns({
        limit: Number(url.searchParams.get("limit") || 50)
      }));
    },
    async handleKnowledgeEvolutionRunGet({ runId, response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      const result = await knowledgeEvolutionRuntime.getRun(runId);
      if (!result) {
        sendJson(response, 404, {
          error: "知识进化任务不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleKnowledgeHierarchyAudit({ requestBody, response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await knowledgeEvolutionRuntime.auditHierarchy(parseJsonBody(requestBody)));
    },
    async handleKnowledgeEvolutionDeployments({ url, response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, knowledgeEvolutionRuntime.listDeployments({
        status: url.searchParams.get("status") || "",
        limit: Number(url.searchParams.get("limit") || 50)
      }));
    },
    async handleKnowledgeEvolutionDeploymentPromote({ deploymentId, requestBody, response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await knowledgeEvolutionRuntime.promote({
        deploymentId,
        ...parseJsonBody(requestBody)
      }));
    },
    async handleKnowledgeEvolutionDeploymentRollback({ deploymentId, requestBody, response }) {
      if (!knowledgeEvolutionRuntime) {
        sendJson(response, 503, {
          error: "知识进化运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await knowledgeEvolutionRuntime.rollback({
        deploymentId,
        ...parseJsonBody(requestBody)
      }));
    },
    async handleContextProfiles({ requestBody, response }) {
      if (!contextRuntime) {
        sendJson(response, 503, {
          error: "上下文运行时不可用。"
        });
        return;
      }
      if (requestBody.length > 0) {
        sendJson(response, 200, await contextRuntime.saveProfiles(parseJsonBody(requestBody)));
        return;
      }
      sendJson(response, 200, await contextRuntime.listProfiles());
    },
    async handleContextPreview({ requestBody, response }) {
      if (!contextRuntime || typeof contextRuntime.preview !== "function") {
        sendJson(response, 503, {
          error: "上下文预览运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await contextRuntime.preview(parseJsonBody(requestBody)));
    },
    async handleContextCompactionPreview({ requestBody, response }) {
      if (!contextRuntime || typeof contextRuntime.previewCompaction !== "function") {
        sendJson(response, 503, {
          error: "上下文压缩预览运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await contextRuntime.previewCompaction(parseJsonBody(requestBody)));
    },
    async handleContextCompactionRun({ requestBody, response }) {
      if (!contextRuntime || typeof contextRuntime.runCompaction !== "function") {
        sendJson(response, 503, {
          error: "上下文压缩运行时不可用。"
        });
        return;
      }
      sendJson(response, 200, await contextRuntime.runCompaction(parseJsonBody(requestBody)));
    },
    async handleContextCompactionRecords({ url, response }) {
      if (!contextRuntime || typeof contextRuntime.listCompactionRecords !== "function") {
        sendJson(response, 503, {
          error: "上下文压缩记录不可用。"
        });
        return;
      }
      sendJson(response, 200, await contextRuntime.listCompactionRecords({
        limit: Number(url.searchParams.get("limit") || 50)
      }));
    },
    async handleContextSessionMemory({ url, response }) {
      if (!contextRuntime || typeof contextRuntime.listSessionMemory !== "function") {
        sendJson(response, 503, {
          error: "上下文会话记忆不可用。"
        });
        return;
      }
      sendJson(response, 200, await contextRuntime.listSessionMemory({
        limit: Number(url.searchParams.get("limit") || 50),
        sessionId: url.searchParams.get("sessionId") || url.searchParams.get("session-id") || "",
        profileId: url.searchParams.get("profileId") || url.searchParams.get("profile-id") || ""
      }));
    },
    async handleContextSessionMemoryClear({ requestBody, response }) {
      if (!contextRuntime || typeof contextRuntime.clearSessionMemory !== "function") {
        sendJson(response, 503, {
          error: "上下文会话记忆不可用。"
        });
        return;
      }
      sendJson(response, 200, await contextRuntime.clearSessionMemory(parseJsonBody(requestBody)));
    },
    async handleContextBuildRecords({ url, response }) {
      if (!contextRuntime || typeof contextRuntime.listBuildRecords !== "function") {
        sendJson(response, 503, {
          error: "上下文编译记录不可用。"
        });
        return;
      }
      sendJson(response, 200, await contextRuntime.listBuildRecords({
        limit: Number(url.searchParams.get("limit") || 50)
      }));
    },
    async handleContextEvaluationRuns({ requestBody, response }) {
      if (!contextRuntime || typeof contextRuntime.runEvaluation !== "function") {
        sendJson(response, 503, {
          error: "上下文 replay 评估不可用。"
        });
        return;
      }
      sendJson(response, 201, await contextRuntime.runEvaluation(parseJsonBody(requestBody)));
    },
    async handleAgentWorkspaces({ url, response }) {
      if (!agentWorkspace) {
        sendJson(response, 503, {
          error: "智能体工作空间不可用。"
        });
        return;
      }
      sendJson(
        response,
        200,
        agentWorkspace.listWorkspaces({
          status: url.searchParams.get("status") || "",
          limit: Number(url.searchParams.get("limit") || 50),
          includeSummary: parseBooleanFlag(url.searchParams.get("includeSummary") || "true")
        })
      );
    },
    async handleAgentWorkspace({ workspaceId, url, response }) {
      if (!agentWorkspace) {
        sendJson(response, 503, {
          error: "智能体工作空间不可用。"
        });
        return;
      }
      const result = agentWorkspace.getWorkspace({
        workspaceId,
        includePrivate: parseBooleanFlag(url.searchParams.get("includePrivate") || url.searchParams.get("private") || "")
      });
      if (!result) {
        sendJson(response, 404, {
          error: "智能体工作空间不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleResolveAgentWorkspaceSubmission({ workspaceId, submissionId, requestBody, response }) {
      if (!agentWorkspace) {
        sendJson(response, 503, {
          error: "智能体工作空间不可用。"
        });
        return;
      }
      const result = agentWorkspace.resolveSubmission({
        workspaceId,
        submissionId,
        ...parseJsonBody(requestBody)
      });
      if (!result) {
        sendJson(response, 404, {
          error: "共享提交不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleResolveAgentWorkspaceIssue({ workspaceId, issueId, requestBody, response }) {
      if (!agentWorkspace) {
        sendJson(response, 503, {
          error: "智能体工作空间不可用。"
        });
        return;
      }
      const result = agentWorkspace.updateIssue({
        workspaceId,
        issueId,
        ...parseJsonBody(requestBody)
      });
      if (!result) {
        sendJson(response, 404, {
          error: "共享空间 issue 不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleAgentWorkspaceLocks({ workspaceId, url, response }) {
      if (!agentWorkspace) {
        sendJson(response, 503, {
          error: "智能体工作空间不可用。"
        });
        return;
      }
      sendJson(response, 200, {
        protocolVersion: agentWorkspace.protocolVersion,
        locks: agentWorkspace.listLocks({
          workspaceId,
          limit: Number(url.searchParams.get("limit") || 100),
          includeExpired: parseBooleanFlag(url.searchParams.get("includeExpired") || "")
        })
      });
    },
    async handleAgentWorkspaceLock({ workspaceId, requestBody, response }) {
      if (!agentWorkspace) {
        sendJson(response, 503, {
          error: "智能体工作空间不可用。"
        });
        return;
      }
      const payload = parseJsonBody(requestBody);
      const action = String(payload.action || payload.operation || "acquire").trim();
      const result = action === "release"
        ? agentWorkspace.releaseLock({ workspaceId, ...payload })
        : agentWorkspace.acquireLock({ workspaceId, ...payload });
      if (result?.ok === false) {
        sendJson(response, result.error === "lock_held" ? 409 : 400, result);
        return;
      }
      sendJson(response, 200, result);
    },
    async handleKnowledgeSummarizationRun({ requestBody, response }) {
      if (!summarizationRuntime) {
        sendJson(response, 503, {
          error: "多智能体总结运行时不可用。"
        });
        return;
      }
      const result = await summarizationRuntime.startRun(parseJsonBody(requestBody));
      sendJson(response, result.run?.status === "failed" ? 500 : 201, result);
    },
    async handleGetKnowledgeSummarizationRun({ runId, url, response }) {
      if (!summarizationRuntime) {
        sendJson(response, 503, {
          error: "多智能体总结运行时不可用。"
        });
        return;
      }
      const result = summarizationRuntime.getRun(runId, {
        includePrivate: parseBooleanFlag(url.searchParams.get("includePrivate") || url.searchParams.get("private") || "")
      });
      if (!result) {
        sendJson(response, 404, {
          error: "总结任务不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleApproveKnowledgeSummarizationRun({ runId, requestBody, response }) {
      if (!summarizationRuntime) {
        sendJson(response, 503, {
          error: "多智能体总结运行时不可用。"
        });
        return;
      }
      const result = await summarizationRuntime.approveRun({
        runId,
        ...parseJsonBody(requestBody)
      });
      if (!result) {
        sendJson(response, 404, {
          error: "总结任务不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleKnowledgeAgentExploreRun({ requestBody, response }) {
      if (!agentExplorationRuntime) {
        sendJson(response, 503, {
          error: "智能探索运行时不可用。"
        });
        return;
      }
      const result = await agentExplorationRuntime.run(parseJsonBody(requestBody));
      sendJson(response, result.ok === false ? 500 : 201, result);
    },
    async handleGetKnowledgeAgentExploreRun({ runId, url, response }) {
      if (!agentExplorationRuntime) {
        sendJson(response, 503, {
          error: "智能探索运行时不可用。"
        });
        return;
      }
      const result = agentExplorationRuntime.getRun({
        runId,
        workspaceId: url.searchParams.get("workspaceId") || "",
        includePrivate: parseBooleanFlag(url.searchParams.get("includePrivate") || "")
      });
      if (!result) {
        sendJson(response, 404, {
          error: "智能探索任务不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleKnowledgeSearch({ requestBody, url, response }) {
      const payload = parseKnowledgeSearchInput({ requestBody, url });
      if (payload?.rawSourceSearch === true || payload?.sourceSearch === true) {
        const result = await searchSourceFiles({
          userDataPath,
          query: payload?.query || payload?.q || "",
          limit: payload?.limit || 20,
          returnAll: payload?.returnAll === true || payload?.all === true
        });
        sendJson(response, 200, result);
        return;
      }
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.search === "function") {
      const result = await knowledgeCore.search({
        query: payload?.query || payload?.q || "",
        limit: payload?.limit || 20,
        itemTypes: payload?.itemTypes || payload?.types || [],
        batchId: payload?.batchId || "",
        retrievalMode: payload?.retrievalMode || payload?.mode || "",
        keywordOnly: payload?.keywordOnly === true,
        retrievalProfileId: payload?.retrievalProfileId || payload?.profileId || "",
        profileKey: payload?.profileKey || payload?.retrievalProfileKey || "",
        retrievalProfile:
          payload?.retrievalProfile ||
          payload?.retrieval ||
          payload?.profile?.retrieval ||
          {},
        profile: payload?.profile || null,
        clientId: payload?.clientId || payload?.client_id || "",
        learningEnabled: payload?.learningEnabled !== false,
        explain: Boolean(payload?.explain),
        modalityPolicy: "multimodal"
      });
        if (
          String(payload?.format || "").toLowerCase() === "markdown" &&
          typeof knowledgeCore.renderMarkdown === "function" &&
          result.items?.[0]?.evidenceId
        ) {
          const rendered = await knowledgeCore.renderMarkdown({
            evidenceId: result.items[0].evidenceId,
            format: "markdown"
          });
          sendJson(response, 200, {
            ...result,
            rendered
          });
          return;
        }
        sendJson(response, 200, result);
        return;
      }
      const fallbackResult = metadataStore.searchKnowledge({
          query: payload?.query || payload?.q || "",
          limit: payload?.limit || 20,
          itemTypes: payload?.itemTypes || payload?.types || [],
          batchId: payload?.batchId || ""
        });
      sendJson(response, 200, {
        ...fallbackResult,
        modalityPolicy: {
          mode: "multimodal",
          text: true,
          image: true,
          filtersAllowed: false
        }
      });
    },
    async handleGetKnowledgeItem({ itemId, response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.getItem === "function") {
        const item = await knowledgeCore.getItem({ itemId });
        if (item) {
          sendJson(response, 200, item);
          return;
        }
      }
      const result = metadataStore.getKnowledgeItem({
        itemId
      });
      if (!result) {
        sendJson(response, 404, {
          error: "知识对象不存在。"
        });
        return;
      }
      sendJson(response, 200, result);
    },
    async handleGetKnowledgeEvidence({ evidenceId, response }) {
      if (isSourceEvidenceId(evidenceId)) {
        const result = await getSourceFileEvidence({ userDataPath, evidenceId });
        if (result) {
          sendJson(response, 200, result);
          return;
        }
      }
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.getEvidence === "function") {
        const result = await knowledgeCore.getEvidence({ evidenceId });
        if (result) {
          sendJson(response, 200, result);
          return;
        }
      }
      sendJson(response, 404, {
        error: "知识证据不存在。"
      });
    },
    async handleGetKnowledgeAsset({ assetId, response }) {
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.getAssetContent === "function") {
        const result = await knowledgeCore.getAssetContent({ assetId });
        if (result) {
          response.writeHead(200, {
            "Content-Type": result.contentType || "application/octet-stream",
            "Content-Disposition": `inline; filename="${contentDispositionFileName(result.fileName)}"`,
            "Cache-Control": "no-store"
          });
          response.end(result.buffer);
          return;
        }
      }
      sendJson(response, 404, {
        error: "知识库资产不存在。"
      });
    },
    async handleRenderKnowledgeMarkdown({ requestBody, response }) {
      const payload = parseJsonBody(requestBody);
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.renderMarkdown === "function") {
        const result = await knowledgeCore.renderMarkdown(payload);
        if (result) {
          sendJson(response, 200, result);
          return;
        }
      }
      sendJson(response, 404, {
        error: "知识证据不存在，无法渲染 Markdown。"
      });
    },
    async handleKnowledgeGraph({ url, response }) {
      sendJson(
        response,
        200,
        metadataStore.getKnowledgeGraph({
          seed: url.searchParams.get("seed") || "",
          depth: Number(url.searchParams.get("depth") || 1),
          limit: Number(url.searchParams.get("limit") || 120)
        })
      );
    },
    async handleToolManagementPassthrough({ request, requestBody, url, response }) {
      const platform = getToolManagementPlatform();
      if (!platform?.router?.handleToolManagementHttpRequest) {
        sendJson(response, 503, {
          error: "Tool Management API is unavailable."
        });
        return;
      }
      const handled = await platform.router.handleToolManagementHttpRequest({
        request,
        response,
        requestBody,
        url,
        method: request?.method || "GET",
        dispatched: true
      });
      if (!handled) {
        sendJson(response, 404, {
          error: "Tool Management API route not found."
        });
      }
    },
    async handleGetToolPlatform({ response }) {
      sendJson(response, 200, {
        path: getToolPlatformPath(userDataPath),
        ...(await loadToolPlatform(userDataPath))
      });
    },
    async handleCreateToolGrant({ requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const result = await createToolGrant(userDataPath, payload);
      await publishProtocolEvent(
        protocolEventBus,
        "tool_platform.grants",
        result,
        { type: "tool_platform.grant.created" }
      );
      sendJson(response, 201, result);
    },
    async handleUpdateToolGrant({ grantId, requestBody, response }) {
      const payload = requestBody.length > 0 ? JSON.parse(requestBody.toString("utf8")) : {};
      const result = await updateToolGrant(userDataPath, grantId, payload);
      if (!result) {
        sendJson(response, 404, {
          error: "工具授权不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "tool_platform.grants",
        result,
        { type: "tool_platform.grant.updated" }
      );
      sendJson(response, 200, result);
    },
    async handleDeleteToolGrant({ grantId, response }) {
      const result = await deleteToolGrant(userDataPath, grantId);
      if (!result) {
        sendJson(response, 404, {
          error: "工具授权不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "tool_platform.grants",
        result,
        { type: "tool_platform.grant.deleted" }
      );
      sendJson(response, 200, result);
    },
    async handleRotateToolGrant({ grantId, response }) {
      const result = await rotateToolGrantToken(userDataPath, grantId);
      if (!result) {
        sendJson(response, 404, {
          error: "工具授权不存在。"
        });
        return;
      }
      await publishProtocolEvent(
        protocolEventBus,
        "tool_platform.grants",
        result,
        { type: "tool_platform.grant.rotated" }
      );
      sendJson(response, 200, result);
    },
    async handleAgentToolSearch({ request, url, response }) {
      const authorization = await requireAgentToolScope({
        userDataPath,
        request,
        response,
        scopes: ["knowledge:read"]
      });
      if (!authorization) {
        return;
      }
      const knowledgeCore = getKnowledgeCore(runtime);
      if (knowledgeCore && typeof knowledgeCore.search === "function") {
        sendJson(response, 200, {
          grant: authorization.grant,
          result: await knowledgeCore.search({
            query: url.searchParams.get("q") || "",
            limit: Number(url.searchParams.get("limit") || 20),
            batchId: url.searchParams.get("batchId") || "",
            learningEnabled: true,
            explain: true
          })
        });
        return;
      }
      const rules = await loadEmailRules(userDataPath);
      sendJson(response, 200, {
        grant: authorization.grant,
        result: metadataStore.search({
          query: url.searchParams.get("q") || "",
          limit: url.searchParams.get("limit") || 20,
          batchId: url.searchParams.get("batchId") || "",
          entityTypes: parseEntityTypes(url.searchParams),
          formalOnly: parseBooleanFlag(url.searchParams.get("formalOnly") || ""),
          rules
        })
      });
    },
    async handleAgentToolStorageSummary({ request, response }) {
      const authorization = await requireAgentToolScope({
        userDataPath,
        request,
        response,
        scopes: ["storage:read"]
      });
      if (!authorization) {
        return;
      }
      sendJson(response, 200, {
        grant: authorization.grant,
        result: metadataStore.getStorageSummary()
      });
    },
    async handleAgentToolJobs({ request, url, response }) {
      const authorization = await requireAgentToolScope({
        userDataPath,
        request,
        response,
        scopes: ["jobs:read"]
      });
      if (!authorization) {
        return;
      }
      sendJson(response, 200, {
        grant: authorization.grant,
        result: await jobManager.listJobs({
          limit: Number(url.searchParams.get("limit") || 50)
        })
      });
    },
    async handleAgentToolJob({ request, jobId, response }) {
      const authorization = await requireAgentToolScope({
        userDataPath,
        request,
        response,
        scopes: ["jobs:read"]
      });
      if (!authorization) {
        return;
      }
      const job = await jobManager.getJob(jobId);
      if (!job) {
        sendJson(response, 404, {
          error: "任务不存在。"
        });
        return;
      }
      sendJson(response, 200, {
        grant: authorization.grant,
        result: job
      });
    },
    async handleAgentToolEnhanceAffairTaxonomy({ request, requestBody, response }) {
      const authorization = await requireAgentToolScope({
        userDataPath,
        request,
        response,
        scopes: ["knowledge:write"]
      });
      if (!authorization) {
        return;
      }
      const payload = parseJsonBody(requestBody);
      const settings = await loadSettings(userDataPath);
      sendJson(response, 200, {
        grant: authorization.grant,
        result: await enhanceAffairTaxonomy({
          documents: Array.isArray(payload?.documents) ? payload.documents : [],
          settings,
          userDataPath
        })
      });
    },
    async handleAgentToolKnowledgeConsole({ request, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeConsole({ response: captured })
      });
    },
    async handleAgentToolKnowledgeConfigSchema({ request, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeConfigSchema({ response: captured })
      });
    },
    async handleAgentToolKnowledgeCapabilities({ request, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeCapabilities({ response: captured })
      });
    },
    async handleAgentToolKnowledgeHealth({ request, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeHealth({ response: captured })
      });
    },
    async handleAgentToolKnowledgeMaintenanceGet({ request, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeMaintenanceGet({ response: captured })
      });
    },
    async handleAgentToolKnowledgeMaintenanceSet({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:admin"],
        run: (captured) => controller.handleKnowledgeMaintenanceSet({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeReindex({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleKnowledgeReindex({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeMaintenanceRun({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleKnowledgeMaintenanceRun({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeSync({ request, url, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeSync({ url, response: captured })
      });
    },
    async handleAgentToolKnowledgeChanges({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:write"],
        run: (captured) => controller.handleKnowledgeChanges({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeReviewItems({ request, url, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeReviewItems({ url, response: captured })
      });
    },
    async handleAgentToolResolveKnowledgeReviewItem({ request, reviewId, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) =>
          controller.handleResolveKnowledgeReviewItem({ reviewId, requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeFeedback({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:write"],
        run: (captured) => controller.handleKnowledgeFeedback({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeSuggestions({ request, url, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeSuggestions({ url, response: captured })
      });
    },
    async handleAgentToolResolveKnowledgeSuggestion({ request, suggestionId, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) =>
          controller.handleResolveKnowledgeSuggestion({ suggestionId, requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeLearningJob({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleKnowledgeLearningJob({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeLearningHealth({ request, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeLearningHealth({ response: captured })
      });
    },
    async handleAgentToolEvidenceGateEvaluate({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleEvidenceGateEvaluate({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeAgentSkill({ request, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeAgentSkill({ response: captured })
      });
    },
    async handleAgentToolKnowledgeAgentSkillPlan({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeAgentSkillPlan({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeAgentSkillRun({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeAgentSkillRun({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeSkills({ request, url, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeSkills({ url, response: captured })
      });
    },
    async handleAgentToolKnowledgeSkillGet({ request, skillId, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeSkillGet({ skillId, response: captured })
      });
    },
    async handleAgentToolKnowledgeSkillGenerate({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleKnowledgeSkillGenerate({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeSkillPropose({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:write"],
        run: (captured) => controller.handleKnowledgeSkillPropose({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeSkillResolve({ request, skillId, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleKnowledgeSkillResolve({ skillId, requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeSkillFramework({ request, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeSkillFramework({ response: captured })
      });
    },
    async handleAgentToolSaveKnowledgeSkillFramework({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleSaveKnowledgeSkillFramework({ requestBody, response: captured })
      });
    },
    async handleAgentToolGoldenRules({ request, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleGoldenRules({ response: captured })
      });
    },
    async handleAgentToolSaveGoldenRules({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleSaveGoldenRules({ requestBody, response: captured })
      });
    },
    async handleAgentToolPublishGoldenRules({ request, packageId, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) =>
          controller.handlePublishGoldenRules({ packageId, requestBody, response: captured })
      });
    },
    async handleAgentToolRollbackGoldenRules({ request, packageId, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) =>
          controller.handleRollbackGoldenRules({ packageId, requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeRuleAuthoringChat({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleKnowledgeRuleAuthoringChat({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeRuleAuthoringRunGet({ request, runId, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeRuleAuthoringRunGet({ runId, response: captured })
      });
    },
    async handleAgentToolGoldCases({ request, url, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleGoldCases({ url, response: captured })
      });
    },
    async handleAgentToolSaveGoldCase({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleSaveGoldCase({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeDistillationRuns({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleKnowledgeDistillationRuns({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeDistillationRunGet({ request, runId, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeDistillationRunGet({ runId, response: captured })
      });
    },
    async handleAgentToolKnowledgeSkillEvaluationRuns({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleKnowledgeSkillEvaluationRuns({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeSkillDeployments({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleKnowledgeSkillDeployments({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeSkillDeploymentRollback({ request, deploymentId, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) =>
          controller.handleKnowledgeSkillDeploymentRollback({ deploymentId, requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeTrainingSetExport({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleKnowledgeTrainingSetExport({ requestBody, response: captured })
      });
    },
    async handleAgentToolAgentEvaluationRuns({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleAgentEvaluationRuns({ requestBody, response: captured })
      });
    },
    async handleAgentToolAgentEvaluationRunList({ request, url, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleAgentEvaluationRunList({ url, response: captured })
      });
    },
    async handleAgentToolAgentEvaluationRun({ request, runId, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleAgentEvaluationRun({ runId, response: captured })
      });
    },
    async handleAgentToolModelDecisionRoles({ request, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleModelDecisionRoles({ response: captured })
      });
    },
    async handleAgentToolModelDecisionDecide({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleModelDecisionDecide({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeEvolutionDescribe({ request, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeEvolutionDescribe({ response: captured })
      });
    },
    async handleAgentToolKnowledgeEvolutionRun({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleKnowledgeEvolutionRun({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeEvolutionRuns({ request, url, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeEvolutionRuns({ url, response: captured })
      });
    },
    async handleAgentToolKnowledgeEvolutionRunGet({ request, runId, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeEvolutionRunGet({ runId, response: captured })
      });
    },
    async handleAgentToolKnowledgeHierarchyAudit({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) => controller.handleKnowledgeHierarchyAudit({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeEvolutionDeployments({ request, url, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeEvolutionDeployments({ url, response: captured })
      });
    },
    async handleAgentToolKnowledgeEvolutionDeploymentPromote({ request, deploymentId, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) =>
          controller.handleKnowledgeEvolutionDeploymentPromote({ deploymentId, requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeEvolutionDeploymentRollback({ request, deploymentId, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) =>
          controller.handleKnowledgeEvolutionDeploymentRollback({ deploymentId, requestBody, response: captured })
      });
    },
    async handleAgentToolContextProfiles({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: [String(request.method || "GET").toUpperCase() === "POST" ? "knowledge:admin" : "knowledge:read"],
        run: (captured) => controller.handleContextProfiles({ requestBody, response: captured })
      });
    },
    async handleAgentToolAgentWorkspaces({ request, url, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleAgentWorkspaces({ url, response: captured })
      });
    },
    async handleAgentToolAgentWorkspace({ request, workspaceId, url, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleAgentWorkspace({ workspaceId, url, response: captured })
      });
    },
    async handleAgentToolResolveAgentWorkspaceSubmission({ request, workspaceId, submissionId, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) =>
          controller.handleResolveAgentWorkspaceSubmission({ workspaceId, submissionId, requestBody, response: captured })
      });
    },
    async handleAgentToolResolveAgentWorkspaceIssue({ request, workspaceId, issueId, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) =>
          controller.handleResolveAgentWorkspaceIssue({ workspaceId, issueId, requestBody, response: captured })
      });
    },
    async handleAgentToolAgentWorkspaceLocks({ request, workspaceId, url, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleAgentWorkspaceLocks({ workspaceId, url, response: captured })
      });
    },
    async handleAgentToolAgentWorkspaceLock({ request, workspaceId, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:write"],
        run: (captured) => controller.handleAgentWorkspaceLock({ workspaceId, requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeSummarizationRun({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:write"],
        run: (captured) => controller.handleKnowledgeSummarizationRun({ requestBody, response: captured })
      });
    },
    async handleAgentToolGetKnowledgeSummarizationRun({ request, runId, url, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleGetKnowledgeSummarizationRun({ runId, url, response: captured })
      });
    },
    async handleAgentToolApproveKnowledgeSummarizationRun({ request, runId, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:maintain"],
        run: (captured) =>
          controller.handleApproveKnowledgeSummarizationRun({ runId, requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeSearch({ request, requestBody, url, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeSearch({ requestBody, url, response: captured })
      });
    },
    async handleAgentToolGetKnowledgeItem({ request, itemId, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleGetKnowledgeItem({ itemId, response: captured })
      });
    },
    async handleAgentToolGetKnowledgeEvidence({ request, evidenceId, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleGetKnowledgeEvidence({ evidenceId, response: captured })
      });
    },
    async handleAgentToolGetKnowledgeAsset({ request, assetId, response }) {
      const authorization = await requireAgentToolScope({
        userDataPath,
        request,
        response,
        scopes: ["knowledge:read"]
      });
      if (!authorization) {
        return;
      }
      response.setHeader("X-SplitAll-Tool-Grant-Id", authorization.grant.id);
      await controller.handleGetKnowledgeAsset({ assetId, response });
    },
    async handleAgentToolRenderKnowledgeMarkdown({ request, requestBody, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleRenderKnowledgeMarkdown({ requestBody, response: captured })
      });
    },
    async handleAgentToolKnowledgeGraph({ request, url, response }) {
      await sendAgentToolKnowledgeJson({
        request,
        response,
        scopes: ["knowledge:read"],
        run: (captured) => controller.handleKnowledgeGraph({ url, response: captured })
      });
    },
    async handleSearch({ url, response }) {
      const rules = await loadEmailRules(userDataPath);
      const searchResult = metadataStore.search({
        query: url.searchParams.get("q") || "",
        limit: url.searchParams.get("limit") || 20,
        batchId: url.searchParams.get("batchId") || "",
        entityTypes: parseEntityTypes(url.searchParams),
        formalOnly: parseBooleanFlag(url.searchParams.get("formalOnly") || ""),
        rules
      });
      sendJson(response, 200, searchResult);
    },
    async handleHealthz({ response }) {
      const discoveryState = getDiscoveryState();
      sendJson(response, 200, {
        ok: true,
        serverId: discoveryState.serverId,
        mode: discoveryState.mode,
        activeServiceUrl: discoveryState.activeServiceUrl
      });
    }
  };
  return controller;
}
