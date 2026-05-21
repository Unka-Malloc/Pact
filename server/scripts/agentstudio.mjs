#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  SERVER_API_OPERATIONS,
  buildApiPathForCliOperation,
  findCliOperation,
  formatInterfaceCatalogMarkdown,
  listInterfaceCatalog
} from "../platform/common/operation-dispatcher/operation-registry.mjs";
import {
  filterOperationsForFeatures,
  resolveFeatureRuntimeFromEnv
} from "../platform/interactive/features/feature-manifest.mjs";

const DEFAULT_SERVER_URL = process.env.AGENTSTUDIO_SERVER_URL || "http://127.0.0.1:8787";
const DEFAULT_CHUNK_SIZE = 1024 * 1024;

function parseArgs(argv) {
  const args = {
    _: [],
    file: [],
    header: [],
    path: [],
    input: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      args._.push(item);
      continue;
    }

    const keyValue = item.slice(2);
    const equalIndex = keyValue.indexOf("=");
    const key = equalIndex >= 0 ? keyValue.slice(0, equalIndex) : keyValue;
    const inlineValue = equalIndex >= 0 ? keyValue.slice(equalIndex + 1) : null;
    const next = argv[index + 1];
    const value =
      inlineValue !== null
        ? inlineValue
        : !next || next.startsWith("--")
          ? true
          : next;

    if (inlineValue === null && value !== true) {
      index += 1;
    }

    if (key === "file" || key === "header" || key === "path" || key === "input") {
      args[key].push(String(value));
      continue;
    }

    args[key] = value;
  }

  return args;
}

function usage() {
  return [
    "Usage:",
    "  agentstudio --file a.txt [--wait] [--output-result result.json]",
    "  agentstudio --path ./local [--wait] [--output-result result.json]",
    "  agentstudio upload --path ./local --server-url http://127.0.0.1:8787",
    "  agentstudio rpc --method GET --path /api/healthz",
    "  agentstudio rpc-call jobs.list --params '{\"limit\":20}'",
    "  agentstudio interfaces --format markdown",
    "  agentstudio health",
    "  agentstudio jobs list|get|result|delete ...",
    "  agentstudio jobs normalized-docs --id JOB_ID",
    "  agentstudio jobs normalized-doc --id JOB_ID --document-id DOC_ID --output out.docx",
    "  agentstudio settings get|set --body settings.json",
    "  agentstudio agents create --name NAME --model MODEL [--provider deepseek] [--api-key KEY]",
    "  agentstudio agents update --id AGENT_UID [--name NAME] [--model MODEL] [--system-prompt TEXT]",
    "  agentstudio agents delete --id AGENT_UID",
    "  agentstudio tools catalog|toolsets|toolsets resolve|execute|dry-run|audit|metrics ...",
    "  agentstudio tools grants list|create|rotate|revoke ...",
    "  agentstudio tools policy preview --body preview.json",
    "",
    "Global options:",
    "  --server-url URL        Defaults to AGENTSTUDIO_SERVER_URL or http://127.0.0.1:8787",
    "  --body JSON_OR_FILE     JSON string or path to a JSON file",
    "  --body-file FILE        JSON request body file",
    "  --params JSON_OR_FILE   JSON-RPC params string or path to a JSON file",
    "  --params-file FILE      JSON-RPC params file",
    "  --raw-file FILE         Raw request body file for rpc/named HTTP calls",
    "  --content-type TYPE     Content-Type for --raw-file; defaults to application/octet-stream",
    "  --header 'K: V'         Extra request header; repeatable",
    "  --confirm              Add confirm=true for repair_write operations",
    "  --output FILE           Save response body",
    "  --pretty               Pretty-print JSON responses",
    "",
    "Upload options:",
    "  --file FILE             Upload one file; repeatable",
    "  --path FILE_OR_DIR      Upload file or folder; repeatable",
    "  --wait                  Poll job until completed",
    "  --output-result FILE    Save completed job result JSON",
    "  --settings JSON_OR_FILE Inline settings JSON or path to JSON file",
    "  --checkpoint-id ID      Defaults to a digest of the upload manifest",
    "  --chunk-size BYTES      Defaults to 1048576"
  ].join("\n");
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_SERVER_URL).replace(/\/+$/, "");
}

function normalizeApiPath(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error("--path is required");
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function parseJsonText(raw, label = "JSON") {
  try {
    return JSON.parse(String(raw || "{}"));
  } catch (error) {
    throw new Error(`${label} 不是有效 JSON：${error instanceof Error ? error.message : "未知错误"}`);
  }
}

async function readJsonInput(value, label = "JSON") {
  if (value === undefined || value === null || value === true || value === "") {
    return {};
  }

  const text = String(value);
  if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
    return parseJsonText(text, label);
  }

  try {
    return parseJsonText(await fsp.readFile(path.resolve(text), "utf8"), text);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return parseJsonText(text, label);
    }
    throw error;
  }
}

async function readBody(args) {
  if (args["body-file"]) {
    return readJsonInput(String(args["body-file"]), "--body-file");
  }
  if (args.body !== undefined) {
    return readJsonInput(args.body, "--body");
  }
  return {};
}

function coerceCliBodyValue(value, type) {
  if (type === "number") {
    return Number(value || 0);
  }
  if (type === "boolean") {
    return value === true || value === "1" || value === "true" || value === "yes";
  }
  if (type === "json") {
    return typeof value === "string" ? parseJsonText(value, "--parameters") : value;
  }
  if (type === "string-list") {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean);
    }
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}

function findCliArgValue(args, aliases = []) {
  for (const alias of aliases) {
    const value = args[alias];
    if (Array.isArray(value)) {
      const last = value[value.length - 1];
      if (last !== undefined && last !== null && last !== true && last !== "") {
        return last;
      }
      continue;
    }
    if (value !== undefined && value !== null && value !== true && value !== "") {
      return value;
    }
  }
  return undefined;
}

function buildBodyFromCliParams(operation, args) {
  const bodyParams = operation.cli?.bodyParams || [];
  if (bodyParams.length === 0) {
    return null;
  }
  const body = {};
  for (const param of bodyParams) {
    const aliases = [param.name, ...(param.aliases || [])];
    const value = findCliArgValue(args, aliases);
    if ((value === undefined || value === null || value === "") && param.required) {
      throw new Error(`--${aliases[1] || param.name} is required`);
    }
    if (value !== undefined && value !== null && value !== "") {
      body[param.name] = coerceCliBodyValue(value, param.type || "string");
    }
  }
  return Object.keys(body).length > 0 ? body : null;
}

function applyCommonSafetyFlags(args, body) {
  if (!hasConfirmArg(args)) {
    return body;
  }
  if (body === undefined || body === null) {
    return { confirm: true };
  }
  if (Buffer.isBuffer(body) || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }
  return {
    ...body,
    confirm: body.confirm === undefined ? true : body.confirm
  };
}

function hasConfirmArg(args) {
  return ["true", "1", "yes"].includes(String(args.confirm || "").trim().toLowerCase());
}

function applyCommonSafetyHeaders(args, headers = {}) {
  if (!hasConfirmArg(args)) {
    return headers;
  }
  return {
    ...headers,
    "x-agentstudio-safety-confirm": headers["x-agentstudio-safety-confirm"] || "true"
  };
}

async function readRpcParams(args) {
  if (args["params-file"]) {
    return readJsonInput(String(args["params-file"]), "--params-file");
  }
  if (args.params !== undefined) {
    return readJsonInput(args.params, "--params");
  }
  return {};
}

function readHeaders(args) {
  const headers = {
    ...envAuthHeaders()
  };
  for (const entry of args.header || []) {
    const text = String(entry);
    const separatorIndex = text.indexOf(":");
    if (separatorIndex <= 0) {
      throw new Error(`--header 必须使用 "Name: value" 格式：${text}`);
    }
    headers[text.slice(0, separatorIndex).trim()] = text.slice(separatorIndex + 1).trim();
  }
  return headers;
}

function envAuthHeaders() {
  const headers = {};
  if (process.env.AGENTSTUDIO_CONSOLE_COOKIE) {
    headers.Cookie = process.env.AGENTSTUDIO_CONSOLE_COOKIE;
  }
  if (process.env.AGENTSTUDIO_CONSOLE_CSRF) {
    headers["x-agentstudio-csrf"] = process.env.AGENTSTUDIO_CONSOLE_CSRF;
  }
  if (["1", "true", "yes"].includes(String(process.env.AGENTSTUDIO_SAFETY_CONFIRM || "").toLowerCase())) {
    headers["x-agentstudio-safety-confirm"] = "true";
  }
  return headers;
}

async function readHttpPayload(args, method) {
  const normalizedMethod = String(method || "GET").toUpperCase();
  const headers = readHeaders(args);
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") {
    return {
      body: undefined,
      headers
    };
  }

  if (args["raw-file"]) {
    headers["content-type"] = headers["content-type"] || args["content-type"] || "application/octet-stream";
    return {
      body: await fsp.readFile(path.resolve(String(args["raw-file"]))),
      headers
    };
  }

  return {
    body: await readBody(args),
    headers
  };
}

async function requestRaw({
  serverUrl,
  method = "GET",
  apiPath,
  body,
  headers = {},
  binary = false,
  okStatuses = []
}) {
  const baseUrl = normalizeBaseUrl(serverUrl);
  const normalizedMethod = String(method || "GET").toUpperCase();
  const url = `${baseUrl}${normalizeApiPath(apiPath)}`;
  const requestHeaders = {
    accept: binary ? "*/*" : "application/json",
    ...envAuthHeaders(),
    ...headers
  };
  let requestBody;

  if (body !== undefined && normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
    if (Buffer.isBuffer(body)) {
      requestBody = body;
    } else {
      requestHeaders["content-type"] = requestHeaders["content-type"] || "application/json";
      requestBody = JSON.stringify(body);
    }
  }

  const response = await fetch(url, {
    method: normalizedMethod,
    headers: requestHeaders,
    body: requestBody
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok && !okStatuses.includes(response.status)) {
    const details = buffer.toString("utf8");
    throw new Error(`${normalizedMethod} ${url} failed: ${response.status} ${details}`);
  }

  return {
    response,
    buffer
  };
}

async function requestJson(input) {
  const { buffer } = await requestRaw(input);
  const text = buffer.toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

async function writeResponse({ args, result, rawBuffer = null, contentType = "" }) {
  if (args.output) {
    const outputPath = path.resolve(String(args.output));
    await fsp.mkdir(path.dirname(outputPath), { recursive: true });
    await fsp.writeFile(
      outputPath,
      rawBuffer || Buffer.from(JSON.stringify(result, null, 2), "utf8")
    );
    process.stderr.write(`output: ${outputPath}\n`);
    return;
  }

  if (rawBuffer && !/json/i.test(contentType)) {
    process.stdout.write(rawBuffer);
    return;
  }

  process.stdout.write(
    `${args.pretty === false ? JSON.stringify(result) : JSON.stringify(result, null, 2)}\n`
  );
}

async function walkInput(inputPath, rootPath = inputPath) {
  const stats = await fsp.stat(inputPath);
  if (stats.isDirectory()) {
    const names = await fsp.readdir(inputPath);
    const nested = [];
    for (const name of names) {
      if (name === ".DS_Store") {
        continue;
      }
      nested.push(...(await walkInput(path.join(inputPath, name), rootPath)));
    }
    return nested;
  }

  if (!stats.isFile()) {
    return [];
  }

  return [
    {
      absolutePath: path.resolve(inputPath),
      relativePath: path.relative(path.dirname(rootPath), inputPath).replace(/\\/g, "/"),
      byteSize: stats.size
    }
  ];
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function digestManifest(files) {
  return createHash("sha256")
    .update(JSON.stringify(files.map((file) => [file.relativePath, file.sha256, file.byteSize])))
    .digest("hex");
}

async function collectUploadFiles(args) {
  const inputs = [...args.file, ...args.path, ...args.input];
  if (inputs.length === 0) {
    throw new Error("请使用 --file、--path 或 --input 指定上传内容。");
  }

  const files = [];
  for (const input of inputs) {
    files.push(...(await walkInput(path.resolve(String(input)))));
  }
  if (files.length === 0) {
    throw new Error("没有找到可上传的文件。");
  }

  for (const file of files) {
    file.name = path.basename(file.relativePath);
    file.mediaType = "application/octet-stream";
    file.sha256 = await sha256File(file.absolutePath);
  }

  return files;
}

async function uploadFileChunks({ serverUrl, sessionId, file, fileIndex, chunkSize, receivedBytes }) {
  let offset = Number(receivedBytes || 0);
  const handle = await fsp.open(file.absolutePath, "r");
  try {
    while (offset < file.byteSize) {
      const length = Math.min(chunkSize, file.byteSize - offset);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, offset);
      const session = await requestJson({
        serverUrl,
        method: "PUT",
        apiPath: `/api/upload-sessions/${encodeURIComponent(sessionId)}/files/${fileIndex}?offset=${offset}`,
        body: buffer,
        okStatuses: [409],
        headers: {
          "content-type": "application/octet-stream"
        }
      });
      if (session?.code) {
        if (
          session.code !== "offset_mismatch" &&
          session.code !== "chunk_too_large" &&
          session.code !== "sha256_mismatch"
        ) {
          throw new Error(session.error || `上传分块失败：${session.code}`);
        }
        const remoteSession = session.session || {};
        const remoteFile = (remoteSession.files || []).find((item) => item.index === fileIndex);
        offset = Number(session.expectedOffset ?? remoteFile?.receivedBytes ?? 0);
        process.stderr.write(
          `realigned ${file.relativePath}: ${session.code}, offset ${offset}\n`
        );
        continue;
      }
      const remoteFile = session.files.find((item) => item.index === fileIndex);
      offset = Number(remoteFile?.receivedBytes || offset + length);
      process.stderr.write(`uploaded ${file.relativePath}: ${offset}/${file.byteSize}\n`);
    }
  } finally {
    await handle.close();
  }
}

async function waitForJob({ serverUrl, jobId }) {
  let current = await requestJson({
    serverUrl,
    method: "GET",
    apiPath: `/api/jobs/${encodeURIComponent(jobId)}`
  });
  while (!["completed", "failed", "cancelled", "deleted"].includes(current.status)) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    current = await requestJson({
      serverUrl,
      method: "GET",
      apiPath: `/api/jobs/${encodeURIComponent(jobId)}`
    });
    process.stderr.write(`${current.status} ${current.progressPercent || 0}% ${current.stage || ""}\n`);
  }
  if (current.status !== "completed") {
    throw new Error(current.error || `Job ended with status ${current.status}`);
  }
  return current;
}

async function runUpload(args) {
  const serverUrl = args["server-url"] || DEFAULT_SERVER_URL;
  const chunkSize = Math.max(64 * 1024, Number(args["chunk-size"] || DEFAULT_CHUNK_SIZE));
  const files = await collectUploadFiles(args);
  const manifestDigest = digestManifest(files);
  const checkpointId = String(args["checkpoint-id"] || `cli-${manifestDigest.slice(0, 24)}`);
  const settings = args.settings ? await readJsonInput(args.settings, "--settings") : {};

  let session = await requestJson({
    serverUrl,
    method: "POST",
    apiPath: "/api/upload-sessions",
    body: {
      checkpoint: { checkpointId, mode: "agentstudio-cli" },
      manifest: { manifestDigest, inputDigest: manifestDigest },
      files: files.map(({ name, relativePath, mediaType, sha256, byteSize }) => ({
        name,
        relativePath,
        mediaType,
        sha256,
        byteSize
      }))
    }
  });

  for (const [fallbackIndex, file] of files.entries()) {
    const remote = session.files.find(
      (item) =>
        item.index === fallbackIndex &&
        item.sha256 === file.sha256 &&
        Number(item.byteSize || 0) === Number(file.byteSize || 0)
    );
    if (!remote) {
      throw new Error(`上传会话缺少文件：${file.relativePath}`);
    }
    if (!remote.completed) {
      await uploadFileChunks({
        serverUrl,
        sessionId: session.sessionId,
        file,
        fileIndex: remote.index,
        chunkSize,
        receivedBytes: remote.receivedBytes
      });
      session = await requestJson({
        serverUrl,
        method: "GET",
        apiPath: `/api/upload-sessions/${encodeURIComponent(session.sessionId)}`
      });
    }
  }

  const job = await requestJson({
    serverUrl,
    method: "POST",
    apiPath: "/api/jobs",
    body: {
      checkpoint: { checkpointId, mode: "agentstudio-cli" },
      uploadSessionId: session.sessionId,
      uploadedFiles: [],
      settings
    }
  });

  if (!args.wait) {
    await writeResponse({ args, result: job });
    return;
  }

  await waitForJob({ serverUrl, jobId: job.id });
  const result = await requestJson({
    serverUrl,
    method: "GET",
    apiPath: `/api/jobs/${encodeURIComponent(job.id)}/result`
  });

  if (args["output-result"]) {
    const outputPath = path.resolve(String(args["output-result"]));
    await fsp.mkdir(path.dirname(outputPath), { recursive: true });
    await fsp.writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
    process.stderr.write(`result: ${outputPath}\n`);
  }

  await writeResponse({ args, result });
}

function requireValue(args, key) {
  const value = Array.isArray(args[key]) ? args[key][args[key].length - 1] : args[key];
  if (!value || value === true) {
    throw new Error(`--${key} is required`);
  }
  return String(value);
}

async function runRpc(args) {
  const method = String(args.method || args.m || "GET").toUpperCase();
  const apiPath = normalizeApiPath(requireValue(args, "path"));
  const { body, headers } = await readHttpPayload(args, method);
  const { response, buffer } = await requestRaw({
    serverUrl: args["server-url"],
    method,
    apiPath,
    body,
    headers,
    binary: Boolean(args.output)
  });
  const contentType = response.headers.get("content-type") || "";

  if (/json/i.test(contentType)) {
    await writeResponse({
      args,
      result: JSON.parse(buffer.toString("utf8") || "{}"),
      rawBuffer: args.output ? buffer : null,
      contentType
    });
    return;
  }

  await writeResponse({
    args,
    result: {},
    rawBuffer: buffer,
    contentType
  });
}

async function runServerRpcCall(args) {
  const rpcMethod = args["rpc-method"] || args._[1];
  if (!rpcMethod || rpcMethod === true) {
    throw new Error("rpc-call requires a RPC method, for example: agentstudio rpc-call jobs.list");
  }
  const params = applyCommonSafetyFlags(args, await readRpcParams(args));
  const result = await requestJson({
    serverUrl: args["server-url"],
    method: "POST",
    apiPath: "/api/rpc",
    headers: applyCommonSafetyHeaders(args, readHeaders(args)),
    body: {
      jsonrpc: "2.0",
      id: args.id || Date.now(),
      method: String(rpcMethod),
      params
    }
  });
  await writeResponse({ args, result });
}

function toolIdArg(args) {
  return String(args["tool-id"] || args.toolId || args.id || args._[2] || "").trim();
}

async function runToolsCommand(args) {
  const command = String(args._[1] || "catalog");
  const subcommand = String(args._[2] || "");
  if (command === "catalog") {
    await writeResponse({
      args,
      result: await requestJson({
        serverUrl: args["server-url"],
        method: "GET",
        apiPath: "/api/tool-management/v1/catalog",
        headers: readHeaders(args)
      })
    });
    return;
  }
  if (command === "toolsets") {
    if (subcommand === "resolve") {
      await writeResponse({
        args,
        result: await requestJson({
          serverUrl: args["server-url"],
          method: "POST",
          apiPath: "/api/tool-management/v1/toolsets/resolve",
          headers: applyCommonSafetyHeaders(args, readHeaders(args)),
          body: await readBody(args)
        })
      });
      return;
    }
    await writeResponse({
      args,
      result: await requestJson({
        serverUrl: args["server-url"],
        method: "GET",
        apiPath: "/api/tool-management/v1/toolsets",
        headers: readHeaders(args)
      })
    });
    return;
  }
  if (command === "profiles") {
    await writeResponse({
      args,
      result: await requestJson({
        serverUrl: args["server-url"],
        method: "GET",
        apiPath: "/api/tool-management/v1/profiles",
        headers: readHeaders(args)
      })
    });
    return;
  }
  if (command === "execute" || command === "dry-run") {
    const body = await readBody(args);
    const toolId = String(body.toolId || toolIdArg(args));
    if (!toolId) {
      throw new Error("tools execute requires --tool-id or body.toolId");
    }
    const { toolId: _toolId, schemaVersion: _schemaVersion, context = {}, dryRun = false, input: explicitInput, ...inlineInput } = body;
    await writeResponse({
      args,
      result: await requestJson({
        serverUrl: args["server-url"],
        method: "POST",
        apiPath: command === "dry-run" ? "/api/tool-management/v1/dry-run" : "/api/tool-management/v1/execute",
        headers: readHeaders(args),
        body: {
          schemaVersion: 1,
          ...body,
          toolId,
          context,
          dryRun,
          input: explicitInput || inlineInput
        }
      })
    });
    return;
  }
  if (command === "audit") {
    const query = new URLSearchParams();
    if (args.limit) {
      query.set("limit", String(args.limit));
    }
    if (args["tool-id"] || args.toolId) {
      query.set("toolId", String(args["tool-id"] || args.toolId));
    }
    if (args["grant-id"] || args.grantId) {
      query.set("grantId", String(args["grant-id"] || args.grantId));
    }
    if (args.status) {
      query.set("status", String(args.status));
    }
    await writeResponse({
      args,
      result: await requestJson({
        serverUrl: args["server-url"],
        method: "GET",
        apiPath: `/api/tool-management/v1/audit${query.toString() ? `?${query}` : ""}`,
        headers: readHeaders(args)
      })
    });
    return;
  }
  if (command === "metrics") {
    const query = new URLSearchParams();
    if (args.limit) {
      query.set("limit", String(args.limit));
    }
    if (args.since) {
      query.set("since", String(args.since));
    }
    if (args.until) {
      query.set("until", String(args.until));
    }
    await writeResponse({
      args,
      result: await requestJson({
        serverUrl: args["server-url"],
        method: "GET",
        apiPath: `/api/tool-management/v1/metrics/summary${query.toString() ? `?${query}` : ""}`,
        headers: readHeaders(args)
      })
    });
    return;
  }
  if (command === "grants") {
    if (!subcommand || subcommand === "list") {
      await writeResponse({
        args,
        result: await requestJson({
          serverUrl: args["server-url"],
          method: "GET",
          apiPath: "/api/tool-management/v1/grants",
          headers: readHeaders(args)
        })
      });
      return;
    }
    if (subcommand === "create") {
      await writeResponse({
        args,
        result: await requestJson({
          serverUrl: args["server-url"],
          method: "POST",
          apiPath: "/api/tool-management/v1/grants",
          headers: applyCommonSafetyHeaders(args, readHeaders(args)),
          body: await readBody(args)
        })
      });
      return;
    }
    if (subcommand === "rotate" || subcommand === "revoke") {
      const grantId = String(args["grant-id"] || args.grantId || args.id || args._[3] || "").trim();
      if (!grantId) {
        throw new Error(`tools grants ${subcommand} requires --id GRANT_ID`);
      }
      await writeResponse({
        args,
        result: await requestJson({
          serverUrl: args["server-url"],
          method: "POST",
          apiPath: `/api/tool-management/v1/grants/${encodeURIComponent(grantId)}/${subcommand}`,
          headers: applyCommonSafetyHeaders(args, readHeaders(args)),
          body: subcommand === "revoke" ? await readBody(args) : {}
        })
      });
      return;
    }
  }
  if (command === "policy" && subcommand === "preview") {
    await writeResponse({
      args,
      result: await requestJson({
        serverUrl: args["server-url"],
        method: "POST",
        apiPath: "/api/tool-management/v1/policy/preview",
        headers: applyCommonSafetyHeaders(args, readHeaders(args)),
        body: await readBody(args)
      })
    });
    return;
  }
  throw new Error(`未知 tools 命令：${args._.join(" ")}`);
}

async function getActiveCliOperations(args = {}) {
  const featureRuntime = await resolveFeatureRuntimeFromEnv({ args });
  return filterOperationsForFeatures(SERVER_API_OPERATIONS, featureRuntime);
}

function writeLocalInterfaceCatalog(args, operations) {
  if (String(args.format || "").toLowerCase() === "markdown") {
    process.stdout.write(`${formatInterfaceCatalogMarkdown(operations)}\n`);
    return true;
  }
  if (args.local) {
    process.stdout.write(`${JSON.stringify({ interfaces: listInterfaceCatalog(operations) }, null, 2)}\n`);
    return true;
  }
  return false;
}

async function runNamedRpc(args) {
  const activeOperations = await getActiveCliOperations(args);
  const cliMatch = findCliOperation(args._, activeOperations);
  if (!cliMatch) {
    throw new Error(`未知命令：${args._[0] || ""}\n${usage()}`);
  }
  const operation = cliMatch.operation;
  if (operation.id === "system.interfaces" && writeLocalInterfaceCatalog(args, activeOperations)) {
    return;
  }

  const apiPath = buildApiPathForCliOperation(operation, args);
  let body;
  let headers = applyCommonSafetyHeaders(args, readHeaders(args));
  if (operation.http.method !== "GET" && operation.http.method !== "HEAD") {
    const cliBody = args.body === undefined && !args["body-file"]
      ? buildBodyFromCliParams(operation, args)
      : null;
    if (cliBody) {
      body = cliBody;
    } else {
      const payload = await readHttpPayload(args, operation.http.method);
      body = payload.body;
      headers = applyCommonSafetyHeaders(args, payload.headers);
    }
    body = applyCommonSafetyFlags(args, body);
  }

  const { response, buffer } = await requestRaw({
    serverUrl: args["server-url"],
    method: operation.http.method,
    apiPath,
    body,
    headers,
    binary: operation.binary || Boolean(args.output)
  });
  const contentType = response.headers.get("content-type") || "";
  if (/json/i.test(contentType)) {
    await writeResponse({
      args,
      result: JSON.parse(buffer.toString("utf8") || "{}"),
      rawBuffer: args.output ? buffer : null,
      contentType
    });
    return;
  }
  await writeResponse({ args, result: {}, rawBuffer: buffer, contentType });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(usage());
    return;
  }

  if (args._[0] === "rpc") {
    await runRpc(args);
    return;
  }

  if (args._[0] === "rpc-call") {
    await runServerRpcCall(args);
    return;
  }

  if (args._[0] === "tools") {
    await runToolsCommand(args);
    return;
  }

  if (args.file.length > 0 || args.path.length > 0 || args._[0] === "upload") {
    if (args._[0] === "upload") {
      args.input.push(...args._.slice(1));
    }
    await runUpload(args);
    return;
  }

  await runNamedRpc(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
