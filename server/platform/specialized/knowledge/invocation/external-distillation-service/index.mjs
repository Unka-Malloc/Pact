export const EXTERNAL_KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION =
  "pact.external-knowledge-distillation.v1";

const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeUrl(value = "") {
  const text = normalizeText(value).replace(/\/+$/, "");
  if (!text) {
    return "";
  }
  const url = new URL(text);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("外部知识蒸馏服务地址必须是 HTTP(S) URL。");
  }
  return url.href.replace(/\/+$/, "");
}

function pickConfigValue(input = {}, settings = {}, keys = []) {
  const externalSettings =
    settings.externalKnowledgeDistillation &&
    typeof settings.externalKnowledgeDistillation === "object" &&
    !Array.isArray(settings.externalKnowledgeDistillation)
      ? settings.externalKnowledgeDistillation
      : {};
  for (const key of keys) {
    const direct = normalizeText(input[key]);
    if (direct) {
      return direct;
    }
    const configured = normalizeText(externalSettings[key]);
    if (configured) {
      return configured;
    }
  }
  return "";
}

export function resolveExternalKnowledgeDistillationConfig({
  input = {},
  settings = {},
  env = process.env
} = {}) {
  const baseUrl = normalizeUrl(
    pickConfigValue(input, settings, ["baseUrl", "serviceUrl", "endpoint"]) ||
      env.PACT_EXTERNAL_KNOWLEDGE_DISTILLATION_URL ||
      env.PACT_EXTERNAL_DISTILLATION_URL ||
      ""
  );
  const token =
    pickConfigValue(input, settings, ["token", "apiKey"]) ||
    env.PACT_EXTERNAL_KNOWLEDGE_DISTILLATION_TOKEN ||
    env.PACT_EXTERNAL_DISTILLATION_TOKEN ||
    "";
  const timeoutMs = Number(
    pickConfigValue(input, settings, ["timeoutMs"]) ||
      env.PACT_EXTERNAL_KNOWLEDGE_DISTILLATION_TIMEOUT_MS ||
      DEFAULT_TIMEOUT_MS
  );
  return {
    protocolVersion: EXTERNAL_KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
    baseUrl,
    token,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS
  };
}

async function readResponseBody(response, { binary = false } = {}) {
  const contentType = response.headers.get("content-type") || "";
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!binary && contentType.includes("application/json")) {
    const text = buffer.toString("utf8").trim();
    return text ? JSON.parse(text) : {};
  }
  return {
    buffer,
    text: buffer.toString("utf8"),
    contentType
  };
}

function fileNameFromDisposition(disposition = "", fallback = "external-distillation.bin") {
  const match = String(disposition || "").match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const value = decodeURIComponent(match?.[1] || match?.[2] || "").trim();
  return value || fallback;
}

function evidenceQueryString(input = {}) {
  const params = new URLSearchParams();
  for (const [key, aliases] of Object.entries({
    entity: ["entity", "entityQuery", "entity-query"],
    relationship: ["relationship", "relationshipQuery", "relationship-query"],
    claimStatus: ["claimStatus", "claim-status", "status"],
    claim: ["claim", "claimQuery", "claim-query"],
    sourceId: ["sourceId", "source-id", "documentId", "document-id"],
    groupId: ["groupId", "group-id", "communityId", "community-id"],
    timeFrom: ["timeFrom", "time-from", "from"],
    timeTo: ["timeTo", "time-to", "to"],
    mode: ["mode"],
    runLimit: ["runLimit", "run-limit"],
    limit: ["limit", "pageSize", "page-size"]
  })) {
    const value = aliases.map((alias) => input[alias]).find((item) => normalizeText(item));
    if (value !== undefined) {
      params.set(key, normalizeText(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function createExternalKnowledgeDistillationClient({
  baseUrl,
  token = "",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch
} = {}) {
  const normalizedBaseUrl = normalizeUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new Error("外部知识蒸馏服务未配置，请设置 PACT_EXTERNAL_KNOWLEDGE_DISTILLATION_URL。");
  }

  async function request(pathname, {
    method = "GET",
    body = undefined,
    binary = false
  } = {}) {
    const headers = new Headers();
    headers.set("accept", binary ? "*/*" : "application/json");
    if (body !== undefined) {
      headers.set("content-type", "application/json");
    }
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
    const response = await fetchImpl(`${normalizedBaseUrl}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const payload = await readResponseBody(response, { binary });
    if (!response.ok) {
      const message = payload?.error || payload?.message || `外部知识蒸馏服务请求失败：${response.status}`;
      const error = new Error(message);
      error.statusCode = response.status;
      error.payload = payload;
      throw error;
    }
    if (binary) {
      return {
        buffer: payload.buffer || Buffer.from(payload.text || ""),
        contentType: response.headers.get("content-type") || payload.contentType || "application/octet-stream",
        fileName: fileNameFromDisposition(response.headers.get("content-disposition"), "external-distillation.bin")
      };
    }
    return payload;
  }

  return Object.freeze({
    protocolVersion: EXTERNAL_KNOWLEDGE_DISTILLATION_PROTOCOL_VERSION,
    baseUrl: normalizedBaseUrl,
    health() {
      return request("/health");
    },
    capabilities() {
      return request("/v1/capabilities");
    },
    runtimeHealth() {
      return request("/v1/runtime/health");
    },
    listRuns(input = {}) {
      const limit = Number(input.limit || 50);
      const query = Number.isFinite(limit) && limit > 0 ? `?limit=${Math.min(200, Math.floor(limit))}` : "";
      return request(`/v1/distillation/runs${query}`);
    },
    createRun(input = {}) {
      const {
        baseUrl: _baseUrl,
        serviceUrl: _serviceUrl,
        endpoint: _endpoint,
        token: _token,
        apiKey: _apiKey,
        timeoutMs: _timeoutMs,
        ...body
      } = input || {};
      return request("/v1/distillation/runs", {
        method: "POST",
        body
      });
    },
    getRun(input = {}) {
      const runId = normalizeText(input.runId || input.id || input["run-id"]);
      if (!runId) {
        throw new Error("读取外部知识蒸馏任务需要 runId。");
      }
      return request(`/v1/distillation/runs/${encodeURIComponent(runId)}`);
    },
    cancelRun(input = {}) {
      const runId = normalizeText(input.runId || input.id || input["run-id"]);
      if (!runId) {
        throw new Error("取消外部知识蒸馏任务需要 runId。");
      }
      return request(`/v1/distillation/runs/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        body: {
          reason: input.reason || input.message || ""
        }
      });
    },
    queryEvidence(input = {}) {
      const runId = normalizeText(input.runId || input.id || input["run-id"]);
      if (!runId) {
        throw new Error("查询外部知识蒸馏证据需要 runId。");
      }
      return request(`/v1/distillation/runs/${encodeURIComponent(runId)}/evidence${evidenceQueryString(input)}`);
    },
    queryProjectEvidence(input = {}) {
      const projectId = normalizeText(input.projectId || input["project-id"] || input.id || input["id"]);
      if (!projectId) {
        throw new Error("查询外部知识蒸馏项目证据需要 projectId。");
      }
      return request(`/v1/projects/${encodeURIComponent(projectId)}/evidence${evidenceQueryString(input)}`);
    },
    exportArtifact(input = {}) {
      const runId = normalizeText(input.runId || input.id || input["run-id"]);
      const artifactId = normalizeText(input.artifactId || input.artifact || input["artifact-id"] || "portable-markdown");
      if (!runId) {
        throw new Error("导出外部知识蒸馏产物需要 runId。");
      }
      return request(
        `/v1/distillation/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}`,
        { binary: true }
      );
    }
  });
}
