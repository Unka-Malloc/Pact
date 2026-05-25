import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ServerConfig } from "../../config/ServerConfig.mjs";

export const LOCAL_SECRET_STORE_VERSION = "pact.local-secret-store.v1";

const SECRET_STORE_DIR = "secrets";
const REGISTRY_FILE = "registry.json";
const AUDIT_FILE = "audit.jsonl";
const VALUES_DIR = "values";
const CONFIG_REFS_FILE = path.join("config", "refs.json");

const CODESPACE_CAPABILITIES = Object.freeze([
  "repository.status",
  "tree.list",
  "file.read",
  "diff.read",
  "change.prepare",
  "change.upload",
  "review.comment",
  "review.requestChanges",
  "review.approve",
  "review.status.sync"
]);

const KNOWLEDGE_CAPABILITIES = Object.freeze([
  "backend.connect",
  "space.list",
  "search",
  "evidence.get",
  "export.request",
  "permission.request"
]);

export const LOCAL_SECRET_TARGETS = Object.freeze({
  github: {
    provider: "github",
    aliases: ["github", "gh"],
    family: "codespace",
    configProvider: "github",
    secretRef: "secret://pact/codespace/github-app",
    endpointRef: "config://pact/codespace/github-endpoint",
    authType: "githubApp",
    defaultMode: "contract",
    envSecrets: [
      { name: "PACT_GITHUB_TOKEN", key: "token" },
      { name: "GITHUB_TOKEN", key: "token" }
    ]
  },
  gerrit: {
    provider: "gerrit",
    aliases: ["gerrit"],
    family: "codespace",
    configProvider: "gerrit",
    secretRef: "secret://pact/codespace/gerrit-service-account",
    endpointRef: "config://pact/codespace/gerrit-endpoint",
    authType: "serviceAccount",
    defaultMode: "contract",
    envSecrets: [
      { name: "PACT_GERRIT_HTTP_PASSWORD", key: "httpPassword" },
      { name: "PACT_GERRIT_PASSWORD", key: "httpPassword" },
      { name: "PACT_GERRIT_TOKEN", key: "token" },
      { name: "PACT_GERRIT_BEARER_TOKEN", key: "token" }
    ]
  },
  dify: {
    provider: "dify",
    aliases: ["dify"],
    family: "knowledge",
    configProvider: "dify",
    secretRef: "secret://pact/knowledge/dify-api-key",
    endpointRef: "config://pact/knowledge/dify-endpoint",
    authType: "apiKey",
    defaultMode: "contract",
    envSecrets: [
      { name: "PACT_DIFY_API_KEY", key: "apiKey" },
      { name: "DIFY_API_KEY", key: "apiKey" }
    ]
  },
  ragflow: {
    provider: "ragflow",
    aliases: ["ragflow", "rag-flow"],
    family: "knowledge",
    configProvider: "ragflow",
    secretRef: "secret://pact/knowledge/ragflow-api-key",
    endpointRef: "config://pact/knowledge/ragflow-endpoint",
    authType: "apiKey",
    defaultMode: "contract",
    envSecrets: [
      { name: "PACT_RAGFLOW_API_KEY", key: "apiKey" },
      { name: "RAGFLOW_API_KEY", key: "apiKey" }
    ]
  },
  onedrive: {
    provider: "onedrive",
    aliases: ["onedrive", "one-drive", "one_drive"],
    family: "cloud-drive",
    configProvider: "onedrive",
    secretRef: "secret://pact/drive/onedrive-oauth",
    endpointRef: "config://pact/drive/onedrive-endpoint",
    authType: "oauth2",
    oauthRedirect: true,
    defaultMode: "contract",
    envSecrets: [{ name: "PACT_ONEDRIVE_OAUTH_JSON", key: "oauth" }]
  },
  "google-drive": {
    provider: "google-drive",
    aliases: ["google-drive", "gdrive", "google"],
    family: "cloud-drive",
    configProvider: "google-drive",
    secretRef: "secret://pact/drive/google-drive-oauth",
    endpointRef: "config://pact/drive/google-drive-endpoint",
    authType: "oauth2",
    oauthRedirect: true,
    defaultMode: "contract",
    envSecrets: [{ name: "PACT_GOOGLE_DRIVE_OAUTH_JSON", key: "oauth" }]
  },
  dropbox: {
    provider: "dropbox",
    aliases: ["dropbox"],
    family: "cloud-drive",
    configProvider: "dropbox",
    secretRef: "secret://pact/drive/dropbox-oauth",
    endpointRef: "config://pact/drive/dropbox-endpoint",
    authType: "oauth2",
    oauthRedirect: true,
    defaultMode: "contract",
    envSecrets: [{ name: "PACT_DROPBOX_OAUTH_JSON", key: "oauth" }]
  }
});

const PROVIDER_BY_ALIAS = new Map(
  Object.values(LOCAL_SECRET_TARGETS).flatMap((target) =>
    target.aliases.map((alias) => [alias, target.provider])
  )
);

function nowIso() {
  return new Date().toISOString();
}

function text(value) {
  return String(value ?? "").trim();
}

function asObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function stableJson(value) {
  if (value === undefined || value === null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function stableId(prefix, value, length = 24) {
  return `${prefix}_${sha256(stableJson(value)).slice(0, length)}`;
}

function resolveDataDir(dataDir = "") {
  return path.resolve(text(dataDir) || ServerConfig.getDataDir());
}

function storeRoot(dataDir = "") {
  return path.join(resolveDataDir(dataDir), SECRET_STORE_DIR);
}

export function localSecretStorePaths({ dataDir = "", secretRef = "" } = {}) {
  const root = storeRoot(dataDir);
  const valueId = secretRef ? sha256(secretRef).slice(0, 40) : "";
  return {
    dataDir: resolveDataDir(dataDir),
    root,
    registryPath: path.join(root, REGISTRY_FILE),
    auditPath: path.join(root, AUDIT_FILE),
    valuesDir: path.join(root, VALUES_DIR),
    valuePath: valueId ? path.join(root, VALUES_DIR, `${valueId}.json`) : "",
    configRefsPath: path.join(resolveDataDir(dataDir), CONFIG_REFS_FILE)
  };
}

async function ensurePrivateDir(dir) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.chmod(dir, 0o700).catch(() => {});
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return clone(fallback);
    throw error;
  }
}

async function writePrivateJson(filePath, value) {
  await ensurePrivateDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(filePath, 0o600).catch(() => {});
}

async function writeRuntimeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function appendAudit(dataDir, event) {
  const paths = localSecretStorePaths({ dataDir });
  await ensurePrivateDir(paths.root);
  await fs.appendFile(paths.auditPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.chmod(paths.auditPath, 0o600).catch(() => {});
}

function emptyRegistry() {
  return {
    schemaVersion: 1,
    protocolVersion: LOCAL_SECRET_STORE_VERSION,
    updatedAt: nowIso(),
    refs: {}
  };
}

export function normalizeLocalSecretProvider(provider = "") {
  const normalized = text(provider).toLowerCase().replace(/_/g, "-");
  return PROVIDER_BY_ALIAS.get(normalized) || normalized;
}

export function resolveLocalSecretTarget(provider = "") {
  const targetId = normalizeLocalSecretProvider(provider);
  return LOCAL_SECRET_TARGETS[targetId] || null;
}

export function defaultSecretRefForProvider(provider = "") {
  return resolveLocalSecretTarget(provider)?.secretRef || "";
}

export function defaultEndpointRefForProvider(provider = "") {
  return resolveLocalSecretTarget(provider)?.endpointRef || "";
}

function assertSecretRef(secretRef = "") {
  const value = text(secretRef);
  if (!value.startsWith("secret://")) {
    throw new Error("Pact secret init requires a secret:// secretRef.");
  }
  return value;
}

function redactedValue(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "object") return "[redacted-object]";
  const raw = String(value);
  return raw.length <= 4 ? "****" : `***${raw.slice(-4)}`;
}

function redactedPayload(payload = {}) {
  const output = {};
  for (const [key, value] of Object.entries(asObject(payload))) {
    output[key] = redactedValue(value);
  }
  return output;
}

async function readRegistry(dataDir = "") {
  const paths = localSecretStorePaths({ dataDir });
  const registry = await readJson(paths.registryPath, emptyRegistry());
  return {
    ...emptyRegistry(),
    ...registry,
    refs: asObject(registry.refs)
  };
}

async function saveRegistry(dataDir, registry) {
  registry.updatedAt = nowIso();
  const paths = localSecretStorePaths({ dataDir });
  await writePrivateJson(paths.registryPath, registry);
}

function defaultCodespaceConfig() {
  return {
    schemaVersion: 1,
    protocolVersion: "pact.codespace.v1",
    updatedAt: nowIso(),
    providers: {
      github: {
        provider: "github",
        enabled: true,
        mode: "contract",
        authType: "githubApp",
        secretRef: "secret://pact/codespace/github-app",
        repositoryPort: true,
        reviewPort: true,
        capabilities: [...CODESPACE_CAPABILITIES]
      },
      gerrit: {
        provider: "gerrit",
        enabled: true,
        mode: "contract",
        authType: "serviceAccount",
        secretRef: "secret://pact/codespace/gerrit-service-account",
        repositoryPort: true,
        reviewPort: true,
        capabilities: [...CODESPACE_CAPABILITIES]
      }
    }
  };
}

function defaultKnowledgeConfig() {
  return {
    schemaVersion: 1,
    protocolVersion: "pact.knowledge-backend-port.v1",
    updatedAt: nowIso(),
    providers: {
      dify: {
        provider: "dify",
        enabled: true,
        mode: "contract",
        authType: "apiKey",
        secretRef: "secret://pact/knowledge/dify-api-key",
        endpointRef: "config://pact/knowledge/dify-endpoint",
        datasetPort: true,
        retrievalPort: true,
        evidencePort: true,
        exportPort: true,
        capabilities: [...KNOWLEDGE_CAPABILITIES],
        contractSpaces: [
          {
            spaceRef: "dify-contract-handbook",
            label: "Dify Contract Handbook",
            description: "Contract metadata fixture for Dify knowledge retrieval.",
            dataClass: "internal",
            sensitivity: "normal"
          }
        ]
      },
      ragflow: {
        provider: "ragflow",
        enabled: true,
        mode: "contract",
        authType: "apiKey",
        secretRef: "secret://pact/knowledge/ragflow-api-key",
        endpointRef: "config://pact/knowledge/ragflow-endpoint",
        datasetPort: true,
        retrievalPort: true,
        evidencePort: true,
        exportPort: true,
        capabilities: [...KNOWLEDGE_CAPABILITIES],
        contractSpaces: [
          {
            spaceRef: "ragflow-contract-handbook",
            label: "RAGFlow Contract Handbook",
            description: "Contract metadata fixture for RAGFlow knowledge retrieval.",
            dataClass: "internal",
            sensitivity: "normal"
          }
        ]
      }
    }
  };
}

function defaultCloudDriveConfig() {
  return {
    schemaVersion: 1,
    protocolVersion: "pact.cloud-drive-port.v1",
    updatedAt: nowIso(),
    connections: {}
  };
}

async function upsertConfigRef({ dataDir, endpointRef = "", endpoint = "", provider = "" } = {}) {
  if (!text(endpointRef) || !text(endpoint)) {
    return null;
  }
  const paths = localSecretStorePaths({ dataDir });
  const config = await readJson(paths.configRefsPath, {
    schemaVersion: 1,
    protocolVersion: "pact.runtime-config-refs.v1",
    updatedAt: nowIso(),
    refs: {}
  });
  config.refs = asObject(config.refs);
  config.refs[endpointRef] = {
    ref: endpointRef,
    kind: "endpoint",
    provider,
    value: text(endpoint),
    updatedAt: nowIso()
  };
  config.updatedAt = nowIso();
  await writeRuntimeJson(paths.configRefsPath, config);
  return {
    ref: endpointRef,
    path: paths.configRefsPath
  };
}

async function updateCodespaceManifest({ dataDir, target, secretRef, endpointRef, endpoint, mode, authType }) {
  const filePath = path.join(resolveDataDir(dataDir), "code-management", "codespace-providers.json");
  const existing = await readJson(filePath, null);
  const config = {
    ...defaultCodespaceConfig(),
    ...asObject(existing),
    providers: {
      ...defaultCodespaceConfig().providers,
      ...asObject(existing?.providers)
    }
  };
  const providerId = target.configProvider;
  config.providers[providerId] = {
    ...asObject(config.providers[providerId]),
    provider: providerId,
    enabled: true,
    mode,
    authType,
    secretRef,
    endpointRef: endpointRef || config.providers[providerId]?.endpointRef || "",
    credentialConfigured: true,
    lastSecretInitializedAt: nowIso()
  };
  config.updatedAt = nowIso();
  await writeRuntimeJson(filePath, config);
  const configRef = await upsertConfigRef({ dataDir, endpointRef, endpoint, provider: providerId });
  return {
    kind: "codespace-provider-manifest",
    provider: providerId,
    path: filePath,
    endpointRef: configRef?.ref || endpointRef || ""
  };
}

async function updateKnowledgeManifest({ dataDir, target, secretRef, endpointRef, endpoint, mode, authType }) {
  const filePath = path.join(resolveDataDir(dataDir), "knowledge", "knowledge-backends.json");
  const existing = await readJson(filePath, null);
  const config = {
    ...defaultKnowledgeConfig(),
    ...asObject(existing),
    providers: {
      ...defaultKnowledgeConfig().providers,
      ...asObject(existing?.providers)
    }
  };
  const providerId = target.configProvider;
  config.providers[providerId] = {
    ...asObject(config.providers[providerId]),
    provider: providerId,
    enabled: true,
    mode,
    authType,
    secretRef,
    endpointRef: endpointRef || config.providers[providerId]?.endpointRef || "",
    credentialConfigured: true,
    lastSecretInitializedAt: nowIso()
  };
  config.updatedAt = nowIso();
  await writeRuntimeJson(filePath, config);
  const configRef = await upsertConfigRef({ dataDir, endpointRef, endpoint, provider: providerId });
  return {
    kind: "knowledge-backend-manifest",
    provider: providerId,
    path: filePath,
    endpointRef: configRef?.ref || endpointRef || ""
  };
}

async function updateCloudDriveManifest({ dataDir, target, secretRef, endpointRef, endpoint, mode, authType, metadata }) {
  const filePath = path.join(resolveDataDir(dataDir), "agent-workspaces", "cloud-drive-connections.json");
  const existing = await readJson(filePath, null);
  const config = {
    ...defaultCloudDriveConfig(),
    ...asObject(existing),
    connections: asObject(existing?.connections)
  };
  const providerId = target.configProvider;
  const workspaceId = text(metadata.workspaceId || "default") || "default";
  const driveRef = text(metadata.driveRef || metadata.driveId) || stableId("cloud_drive", {
    provider: providerId,
    secretRef,
    workspaceId
  });
  const timestamp = nowIso();
  config.connections[driveRef] = {
    ...asObject(config.connections[driveRef]),
    driveRef,
    provider: providerId,
    workspaceId,
    label: text(metadata.label || `${providerId} OAuth Adapter`),
    mode: "contract",
    requestedMode: mode,
    authType,
    secretRef,
    endpointRef: endpointRef || `config://pact/drive/${providerId}-endpoint`,
    rootName: `${providerId}-contract-root`,
    rootHash: sha256(`${providerId}:${secretRef}`),
    status: "active",
    credentialConfigured: true,
    contractVerified: true,
    localAdapterVerified: false,
    connectedAt: config.connections[driveRef]?.connectedAt || timestamp,
    updatedAt: timestamp
  };
  config.updatedAt = timestamp;
  await writeRuntimeJson(filePath, config);
  const configRef = await upsertConfigRef({ dataDir, endpointRef, endpoint, provider: providerId });
  return {
    kind: "cloud-drive-connections",
    provider: providerId,
    path: filePath,
    driveRef,
    endpointRef: configRef?.ref || endpointRef || ""
  };
}

async function updateProviderManifest(input) {
  if (input.target.family === "codespace") {
    return updateCodespaceManifest(input);
  }
  if (input.target.family === "knowledge") {
    return updateKnowledgeManifest(input);
  }
  if (input.target.family === "cloud-drive") {
    return updateCloudDriveManifest(input);
  }
  return null;
}

export async function initializeLocalSecret({
  dataDir = "",
  provider = "",
  secretRef = "",
  endpointRef = "",
  endpoint = "",
  mode = "",
  authType = "",
  payload = {},
  metadata = {},
  updateManifest = true
} = {}) {
  const target = resolveLocalSecretTarget(provider);
  if (!target) {
    throw new Error(`Unsupported Pact secret provider: ${provider}`);
  }
  const resolvedSecretRef = assertSecretRef(secretRef || target.secretRef);
  const resolvedEndpointRef = text(endpointRef || target.endpointRef);
  const resolvedMode = text(mode || target.defaultMode || "contract") || "contract";
  const resolvedAuthType = text(authType || target.authType);
  const secretPayload = asObject(payload);
  if (Object.keys(secretPayload).length === 0) {
    throw new Error("Pact secret init requires a secret payload from --json-stdin, --token-stdin, --api-key-stdin, --http-password-stdin, --oauth-json-stdin, OAuth redirect flow, --body, --body-file, or --from-env.");
  }

  const paths = localSecretStorePaths({ dataDir, secretRef: resolvedSecretRef });
  await ensurePrivateDir(paths.root);
  await ensurePrivateDir(paths.valuesDir);

  const registry = await readRegistry(paths.dataDir);
  const existing = registry.refs[resolvedSecretRef] || null;
  const valueRecord = {
    schemaVersion: 1,
    protocolVersion: LOCAL_SECRET_STORE_VERSION,
    secretRef: resolvedSecretRef,
    provider: target.provider,
    family: target.family,
    authType: resolvedAuthType,
    mode: resolvedMode,
    endpointRef: resolvedEndpointRef,
    payload: secretPayload,
    metadata: asObject(metadata),
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  await writePrivateJson(paths.valuePath, valueRecord);

  const entry = {
    secretRef: resolvedSecretRef,
    provider: target.provider,
    family: target.family,
    authType: resolvedAuthType,
    mode: resolvedMode,
    endpointRef: resolvedEndpointRef,
    storageRef: `local:${path.basename(paths.valuePath)}`,
    valueKeys: Object.keys(secretPayload).sort(),
    redacted: redactedPayload(secretPayload),
    credentialConfigured: true,
    createdAt: existing?.createdAt || valueRecord.createdAt,
    updatedAt: valueRecord.updatedAt
  };
  registry.refs[resolvedSecretRef] = entry;
  await saveRegistry(paths.dataDir, registry);

  const manifestUpdate = updateManifest
    ? await updateProviderManifest({
        dataDir: paths.dataDir,
        target,
        secretRef: resolvedSecretRef,
        endpointRef: resolvedEndpointRef,
        endpoint,
        mode: resolvedMode,
        authType: resolvedAuthType,
        metadata: asObject(metadata)
      })
    : null;

  await appendAudit(paths.dataDir, {
    event: existing ? "secret.updated" : "secret.initialized",
    secretRef: resolvedSecretRef,
    provider: target.provider,
    family: target.family,
    mode: resolvedMode,
    authType: resolvedAuthType,
    valueKeys: entry.valueKeys,
    manifestUpdated: Boolean(manifestUpdate),
    createdAt: nowIso()
  });

  return {
    ok: true,
    protocolVersion: LOCAL_SECRET_STORE_VERSION,
    provider: target.provider,
    family: target.family,
    dataDir: paths.dataDir,
    secretRef: resolvedSecretRef,
    endpointRef: resolvedEndpointRef,
    mode: resolvedMode,
    authType: resolvedAuthType,
    credentialConfigured: true,
    valueStored: true,
    registryPath: paths.registryPath,
    auditPath: paths.auditPath,
    valuePath: paths.valuePath,
    manifestUpdate,
    entry
  };
}

export async function readLocalSecretRegistry({ dataDir = "" } = {}) {
  return readRegistry(resolveDataDir(dataDir));
}

export async function listLocalSecretEntries({ dataDir = "" } = {}) {
  const paths = localSecretStorePaths({ dataDir });
  const registry = await readRegistry(paths.dataDir);
  return Object.values(registry.refs).sort((left, right) =>
    String(left.provider || left.secretRef).localeCompare(String(right.provider || right.secretRef))
  );
}

export async function localSecretConfigured({ dataDir = "", provider = "", secretRef = "" } = {}) {
  const paths = localSecretStorePaths({ dataDir });
  const registry = await readRegistry(paths.dataDir);
  const refs = Object.values(registry.refs);
  const normalizedProvider = normalizeLocalSecretProvider(provider);
  return refs.some((entry) =>
    entry.credentialConfigured === true &&
    (!secretRef || entry.secretRef === secretRef) &&
    (!normalizedProvider || entry.provider === normalizedProvider)
  );
}
