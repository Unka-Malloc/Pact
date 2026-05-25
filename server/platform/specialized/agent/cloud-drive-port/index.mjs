import crypto, { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { ServerConfig } from "../../../common/config/ServerConfig.mjs";

export const CLOUD_DRIVE_PORT_PROTOCOL_VERSION = "pact.cloud-drive-port.v1";

const CLOUD_DRIVE_CONFIG_FILE = path.join("agent-workspaces", "cloud-drive-connections.json");
const CLOUD_DRIVE_LEDGER_FILE = path.join("agent-workspaces", "cloud-drive-ledger.json");
const SUPPORTED_PROVIDERS = Object.freeze(["icloud", "onedrive", "google-drive", "dropbox"]);
const OAUTH_PROVIDERS = new Set(["onedrive", "google-drive", "dropbox"]);
const SECRET_REF_BY_PROVIDER = Object.freeze({
  onedrive: "secret://pact/drive/onedrive-oauth",
  "google-drive": "secret://pact/drive/google-drive-oauth",
  dropbox: "secret://pact/drive/dropbox-oauth"
});
const SECRET_VALUE_KEYS = new Set([
  "apiKey",
  "api_key",
  "token",
  "accessToken",
  "refreshToken",
  "clientSecret",
  "client_secret",
  "password",
  "authorization"
]);

function nowIso() {
  return new Date().toISOString();
}

function text(value) {
  return String(value ?? "").trim();
}

function asObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function stableJson(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function digest(value, length = 24) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, length);
}

function stableId(prefix, value) {
  return `${prefix}::${digest(stableJson(value), 24)}`;
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function dataRoot(userDataPath = "") {
  return userDataPath || ServerConfig.getDataDir();
}

export function cloudDriveConfigPath(userDataPath = "") {
  return path.join(dataRoot(userDataPath), CLOUD_DRIVE_CONFIG_FILE);
}

function cloudDriveLedgerPath(userDataPath = "") {
  return path.join(dataRoot(userDataPath), CLOUD_DRIVE_LEDGER_FILE);
}

function defaultICloudRootPath() {
  return path.join(os.homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs");
}

function defaultConfig() {
  return {
    schemaVersion: 1,
    protocolVersion: CLOUD_DRIVE_PORT_PROTOCOL_VERSION,
    updatedAt: nowIso(),
    connections: {}
  };
}

function defaultLedger() {
  return {
    schemaVersion: 1,
    protocolVersion: CLOUD_DRIVE_PORT_PROTOCOL_VERSION,
    updatedAt: nowIso(),
    events: [],
    transfers: {},
    checkpoints: {},
    accessReceipts: {}
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return clone(fallback);
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeProvider(value = "") {
  const provider = text(value || "icloud").toLowerCase().replace(/_/g, "-");
  if (provider === "google" || provider === "gdrive" || provider === "google-drive") return "google-drive";
  if (provider === "one-drive" || provider === "one_drive" || provider === "onedrive") return "onedrive";
  if (provider === "icloud-drive" || provider === "icloud") return "icloud";
  return provider;
}

function providerLabel(provider) {
  return {
    icloud: "iCloud Drive",
    onedrive: "OneDrive",
    "google-drive": "Google Drive",
    dropbox: "Dropbox"
  }[provider] || provider;
}

function assertSupportedProvider(provider) {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    const error = new Error(`Unsupported cloud drive provider: ${provider}`);
    error.code = "UNSUPPORTED_PROVIDER";
    throw error;
  }
}

function containsSecretValue(value = {}, depth = 0) {
  if (!value || typeof value !== "object" || depth > 4) {
    return "";
  }
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_VALUE_KEYS.has(key) && text(child)) {
      return key;
    }
    if (child && typeof child === "object") {
      const nested = containsSecretValue(child, depth + 1);
      if (nested) return nested;
    }
  }
  return "";
}

function normalizeDriveRelativePath(value = "", { allowEmpty = true } = {}) {
  const raw = text(value).replace(/\\/g, "/");
  if (!raw || raw === ".") {
    if (allowEmpty) return "";
    throw new Error("云盘路径不能为空。");
  }
  if (raw.includes("\0") || raw.startsWith("/") || /^[A-Za-z]:\//.test(raw)) {
    throw new Error("云盘路径必须是 provider 内部相对路径。");
  }
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === ".") {
    if (allowEmpty) return "";
    throw new Error("云盘路径不能为空。");
  }
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error("云盘路径不能跳出受控根目录。");
  }
  return normalized.replace(/^\/+/, "");
}

async function validateLocalICloudRoot(rootPath) {
  const rawPath = text(rootPath || defaultICloudRootPath());
  if (!rawPath) {
    throw new Error("iCloud rootPath 不能为空。");
  }
  const absolutePath = path.resolve(rawPath);
  if (absolutePath === path.parse(absolutePath).root) {
    throw new Error("不能把文件系统根目录作为 iCloud 受控根目录。");
  }
  const stat = await fs.lstat(absolutePath);
  if (stat.isSymbolicLink()) {
    throw new Error("不允许连接符号链接 iCloud 根目录。");
  }
  if (!stat.isDirectory()) {
    throw new Error("iCloud rootPath 必须是目录。");
  }
  return {
    absolutePath,
    realPath: await fs.realpath(absolutePath),
    stat
  };
}

function safeJoinLocal(rootPath, drivePath = "", { allowRoot = true } = {}) {
  const relativePath = normalizeDriveRelativePath(drivePath, { allowEmpty: allowRoot });
  const root = path.resolve(rootPath);
  const absolutePath = relativePath ? path.resolve(root, ...relativePath.split("/")) : root;
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("云盘路径不能跳出受控根目录。");
  }
  return { relativePath, absolutePath };
}

async function assertExistingLocalItemWithinRoot(rootPath, drivePath = "") {
  const target = safeJoinLocal(rootPath, drivePath);
  const stat = await fs.lstat(target.absolutePath);
  if (stat.isSymbolicLink()) {
    throw new Error("不允许访问云盘受控根目录内的符号链接。");
  }
  const realPath = await fs.realpath(target.absolutePath);
  const rootRealPath = await fs.realpath(rootPath);
  if (realPath !== rootRealPath && !realPath.startsWith(`${rootRealPath}${path.sep}`)) {
    throw new Error("云盘真实路径不能跳出受控根目录。");
  }
  return { ...target, stat, realPath };
}

async function statfsSummary(rootPath) {
  if (typeof fs.statfs !== "function") {
    return { available: false };
  }
  try {
    const stats = await fs.statfs(rootPath);
    return {
      available: true,
      totalBytes: Number(stats.blocks || 0) * Number(stats.bsize || 0),
      freeBytes: Number(stats.bavail || stats.bfree || 0) * Number(stats.bsize || 0)
    };
  } catch {
    return { available: false };
  }
}

function publicConnection(connection = {}, { configFilePath = "" } = {}) {
  const provider = normalizeProvider(connection.provider);
  return {
    driveRef: text(connection.driveRef),
    provider,
    label: text(connection.label || providerLabel(provider)),
    mode: text(connection.mode || (provider === "icloud" ? "local" : "contract")),
    requestedMode: text(connection.requestedMode || ""),
    status: text(connection.status || "active"),
    authType: text(connection.authType || (provider === "icloud" ? "localDirectory" : "oauth2")),
    secretRef: text(connection.secretRef || ""),
    endpointRef: text(connection.endpointRef || ""),
    rootName: text(connection.rootName || ""),
    rootHash: text(connection.rootHash || ""),
    metadataOnly: true,
    secretPolicy: "secretRefOnly",
    contractVerified: connection.contractVerified === true,
    localAdapterVerified: connection.localAdapterVerified === true,
    stateSemantics: {
      providerState: connection.contractVerified === true ? "contractVerified" : "projected",
      canonicalState: "pactSharedspace",
      driveRole: "externalAdapterProjection"
    },
    connectedAt: text(connection.connectedAt || ""),
    updatedAt: text(connection.updatedAt || ""),
    ...(configFilePath ? { configPath: configFilePath } : {})
  };
}

function providerManifest(config = {}, configFilePath = "") {
  const connections = Object.values(asObject(config.connections))
    .map((connection) => publicConnection(connection, { configFilePath }))
    .sort((left, right) => left.provider.localeCompare(right.provider) || left.driveRef.localeCompare(right.driveRef));
  const connectedProviders = new Set(connections.map((connection) => connection.provider));
  const providers = SUPPORTED_PROVIDERS.map((provider) => ({
    provider,
    label: providerLabel(provider),
    connected: connectedProviders.has(provider),
    authType: provider === "icloud" ? "localDirectory" : "oauth2",
    mode: provider === "icloud" ? "local" : "contract",
    secretRef: SECRET_REF_BY_PROVIDER[provider] || "",
    contractOnly: OAUTH_PROVIDERS.has(provider),
    capabilities: [
      "drive.connect",
      "drive.status",
      "drive.item.list",
      "drive.file.download",
      "drive.file.upload",
      "drive.sync.plan",
      "drive.sync.apply",
      "drive.permission.list"
    ]
  }));
  return {
    ok: true,
    schemaVersion: Number(config.schemaVersion || 1),
    protocolVersion: CLOUD_DRIVE_PORT_PROTOCOL_VERSION,
    configPath: configFilePath,
    providerCount: providers.length,
    connectedProviderCount: connectedProviders.size,
    providers,
    connections,
    count: connections.length,
    secretPolicy: "secretRefOnly",
    contractMode: connections.some((connection) => connection.contractVerified),
    updatedAt: text(config.updatedAt || "")
  };
}

function appendEvent(ledger, type, payload = {}) {
  const event = {
    eventId: stableId("cloud_drive_event", { type, payload, nonce: randomUUID() }),
    protocolVersion: CLOUD_DRIVE_PORT_PROTOCOL_VERSION,
    type,
    payload: clone(payload),
    createdAt: nowIso()
  };
  ledger.events.push(event);
  ledger.updatedAt = event.createdAt;
  return event;
}

function createAccessReceipt({ operationId, driveRef, drivePath = "", action = "metadata", state = "cached" } = {}) {
  const createdAt = nowIso();
  return {
    protocolVersion: "pact.cloud-drive.access-receipt.v1",
    receiptId: stableId("cloud_drive_access_receipt", { operationId, driveRef, drivePath, action, createdAt }),
    operationId,
    driveRef,
    drivePath,
    action,
    state,
    eventHash: digest(stableJson({ operationId, driveRef, drivePath, action, createdAt }), 64),
    createdAt
  };
}

function createCheckpoint({ operationId, driveRef, drivePath = "", action = "", state = "projected" } = {}) {
  const createdAt = nowIso();
  return {
    protocolVersion: "pact.cloud-drive.checkpoint.v1",
    checkpointId: stableId("cloud_drive_checkpoint", { operationId, driveRef, drivePath, action, createdAt }),
    checkpointRef: stableId("cloud_drive_checkpoint_ref", { operationId, driveRef, drivePath, action }),
    operationId,
    driveRef,
    drivePath,
    action,
    state,
    createdAt
  };
}

function createTransferReceipt({
  operationId,
  driveRef,
  drivePath = "",
  direction = "download",
  byteSize = 0,
  contentSha256 = "",
  state = "projected",
  contractVerified = false,
  localAdapterVerified = false
} = {}) {
  const createdAt = nowIso();
  return {
    protocolVersion: "pact.cloud-drive.transfer-receipt.v1",
    transferReceiptId: stableId("cloud_drive_transfer", {
      operationId,
      driveRef,
      drivePath,
      direction,
      byteSize,
      contentSha256,
      createdAt
    }),
    operationId,
    driveRef,
    drivePath,
    direction,
    byteSize,
    contentSha256,
    state,
    contractVerified,
    localAdapterVerified,
    createdAt
  };
}

function decodeUploadContent(input = {}) {
  if (input.contentBase64 !== undefined) {
    return Buffer.from(String(input.contentBase64 || ""), "base64");
  }
  return Buffer.from(String(input.content ?? ""), input.encoding || "utf8");
}

function contractItem(provider, connection, index = 0) {
  const name = `${provider}-contract-${index + 1}.txt`;
  return {
    itemId: stableId("cloud_drive_item", { provider, driveRef: connection.driveRef, name }),
    provider,
    driveRef: connection.driveRef,
    name,
    path: `contract/${name}`,
    itemType: "file",
    mimeType: "text/plain",
    sizeBytes: 128 + index,
    metadataOnly: true,
    contractVerified: true,
    localAdapterVerified: false,
    redactions: ["downloadUrl", "privatePath", "providerNativeId", "token"]
  };
}

async function listLocalItems(rootPath, basePath = "", { recursive = false, limit = 200, includeHash = false } = {}) {
  const start = await assertExistingLocalItemWithinRoot(rootPath, basePath);
  if (!start.stat.isDirectory()) {
    return [];
  }
  const items = [];
  async function walk(relativePath) {
    const current = safeJoinLocal(rootPath, relativePath);
    const entries = await fs.readdir(current.absolutePath, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (items.length >= limit) return;
      const itemPath = normalizeDriveRelativePath(path.posix.join(relativePath, entry.name), { allowEmpty: false });
      const absolutePath = safeJoinLocal(rootPath, itemPath, { allowRoot: false }).absolutePath;
      const stat = await fs.lstat(absolutePath);
      const isDirectory = stat.isDirectory();
      const item = {
        itemId: stableId("cloud_drive_item", { root: await fs.realpath(rootPath), itemPath }),
        name: entry.name,
        path: itemPath,
        itemType: isDirectory ? "folder" : "file",
        sizeBytes: isDirectory ? 0 : stat.size,
        modifiedAt: stat.mtime.toISOString(),
        metadataOnly: true,
        localAdapterVerified: true,
        contractVerified: false
      };
      if (includeHash && stat.isFile()) {
        item.contentSha256 = sha256Buffer(await fs.readFile(absolutePath));
      }
      items.push(item);
      if (recursive && isDirectory && !stat.isSymbolicLink()) {
        await walk(itemPath);
      }
    }
  }
  await walk(start.relativePath);
  return items;
}

function syncPlanFromItems({ connection, items, direction = "import_to_sharedspace", scope = "" } = {}) {
  const fileItems = items.filter((item) => item.itemType === "file");
  const actions = fileItems.map((item) => ({
    action: direction === "export_from_sharedspace" ? "exportProjection" : "importProjection",
    driveRef: connection.driveRef,
    provider: connection.provider,
    drivePath: item.path,
    workspaceTargetPath: normalizeDriveRelativePath(path.posix.join(scope || "cloud-drive", item.path), { allowEmpty: false }),
    sizeBytes: item.sizeBytes,
    contentSha256: item.contentSha256 || "",
    contractVerified: item.contractVerified === true,
    localAdapterVerified: item.localAdapterVerified === true
  }));
  return {
    dryRun: true,
    direction,
    actionCount: actions.length,
    actions,
    summary: {
      importProjection: actions.filter((action) => action.action === "importProjection").length,
      exportProjection: actions.filter((action) => action.action === "exportProjection").length,
      conflict: 0,
      noop: 0
    }
  };
}

export function createCloudDrivePort({ userDataPath = "" } = {}) {
  const configFilePath = cloudDriveConfigPath(userDataPath);
  const ledgerFilePath = cloudDriveLedgerPath(userDataPath);

  async function loadConfig() {
    const config = await readJson(configFilePath, defaultConfig());
    config.schemaVersion = 1;
    config.protocolVersion = CLOUD_DRIVE_PORT_PROTOCOL_VERSION;
    config.connections = asObject(config.connections);
    await fs.mkdir(path.dirname(configFilePath), { recursive: true });
    await fs.access(configFilePath).catch(() => writeJson(configFilePath, config));
    return config;
  }

  async function saveConfig(config) {
    config.updatedAt = nowIso();
    await writeJson(configFilePath, config);
  }

  async function loadLedger() {
    const ledger = await readJson(ledgerFilePath, defaultLedger());
    ledger.events = asArray(ledger.events);
    ledger.transfers = asObject(ledger.transfers);
    ledger.checkpoints = asObject(ledger.checkpoints);
    ledger.accessReceipts = asObject(ledger.accessReceipts);
    await fs.mkdir(path.dirname(ledgerFilePath), { recursive: true });
    await fs.access(ledgerFilePath).catch(() => writeJson(ledgerFilePath, ledger));
    return ledger;
  }

  async function saveLedger(ledger) {
    ledger.updatedAt = nowIso();
    await writeJson(ledgerFilePath, ledger);
  }

  async function resolveConnection(input = {}) {
    const config = await loadConfig();
    const driveRef = text(input.driveRef || input.driveId || input.mountRef || "");
    const provider = normalizeProvider(input.provider || "");
    const connections = Object.values(asObject(config.connections));
    const connection = driveRef
      ? connections.find((item) => text(item.driveRef) === driveRef)
      : connections.find((item) => normalizeProvider(item.provider) === provider);
    if (!connection) {
      const error = new Error("Cloud drive connection does not exist. Call sharedspace.drive.connect first.");
      error.code = "DRIVE_CONNECTION_NOT_FOUND";
      throw error;
    }
    return { config, connection };
  }

  async function manifest() {
    const config = await loadConfig();
    return providerManifest(config, configFilePath);
  }

  async function connect(input = {}) {
    const leakedKey = containsSecretValue(input);
    if (leakedKey) {
      const error = new Error(`Cloud drive secret value must be referenced by secretRef, not inline ${leakedKey}.`);
      error.code = "INLINE_SECRET_VALUE";
      throw error;
    }
    const provider = normalizeProvider(input.provider || input.driveProvider || "icloud");
    assertSupportedProvider(provider);
    const config = await loadConfig();
    const timestamp = nowIso();
    let connection;
    if (provider === "icloud") {
      const root = await validateLocalICloudRoot(input.rootPath || input.sourcePath || input.localPath || input.path);
      const driveRef = text(input.driveRef || input.driveId) || stableId("cloud_drive", {
        provider,
        root: root.realPath,
        workspaceId: input.workspaceId || ""
      });
      connection = {
        driveRef,
        provider,
        label: text(input.label || "iCloud Drive Local Adapter"),
        mode: "local",
        requestedMode: text(input.mode || "local"),
        authType: "localDirectory",
        rootPath: root.realPath,
        rootName: path.basename(root.realPath),
        rootHash: digest(root.realPath, 64),
        status: "active",
        contractVerified: false,
        localAdapterVerified: true,
        connectedAt: timestamp,
        updatedAt: timestamp
      };
    } else {
      const secretRef = text(input.secretRef || SECRET_REF_BY_PROVIDER[provider] || "");
      if (!secretRef.startsWith("secret://")) {
        const error = new Error("Cloud drive OAuth provider connection requires a secret:// secretRef.");
        error.code = "SECRET_REF_REQUIRED";
        throw error;
      }
      const driveRef = text(input.driveRef || input.driveId) || stableId("cloud_drive", {
        provider,
        secretRef,
        workspaceId: input.workspaceId || ""
      });
      connection = {
        driveRef,
        provider,
        label: text(input.label || `${providerLabel(provider)} Contract Adapter`),
        mode: "contract",
        requestedMode: text(input.mode || "contract"),
        authType: text(input.authType || "oauth2"),
        secretRef,
        endpointRef: text(input.endpointRef || `config://pact/drive/${provider}-endpoint`),
        rootName: `${provider}-contract-root`,
        rootHash: digest(`${provider}:${secretRef}`, 64),
        status: "active",
        contractVerified: true,
        localAdapterVerified: false,
        connectedAt: timestamp,
        updatedAt: timestamp
      };
    }
    config.connections[connection.driveRef] = {
      ...(config.connections[connection.driveRef] || {}),
      ...connection,
      connectedAt: config.connections[connection.driveRef]?.connectedAt || connection.connectedAt,
      updatedAt: timestamp
    };
    await saveConfig(config);
    const ledger = await loadLedger();
    appendEvent(ledger, "sharedspace.drive.connect", {
      driveRef: connection.driveRef,
      provider,
      mode: connection.mode,
      contractVerified: connection.contractVerified === true,
      localAdapterVerified: connection.localAdapterVerified === true
    });
    await saveLedger(ledger);
    return {
      ok: true,
      protocolVersion: CLOUD_DRIVE_PORT_PROTOCOL_VERSION,
      provider,
      drive: publicConnection(config.connections[connection.driveRef], { configFilePath }),
      manifest: providerManifest(config, configFilePath),
      secretPolicy: "secretRefOnly",
      contractVerified: connection.contractVerified === true,
      localAdapterVerified: connection.localAdapterVerified === true
    };
  }

  async function status(input = {}) {
    const config = await loadConfig();
    const manifestPayload = providerManifest(config, configFilePath);
    for (const connection of manifestPayload.connections) {
      if (connection.provider !== "icloud") continue;
      const privateConnection = config.connections[connection.driveRef];
      if (privateConnection?.rootPath) {
        connection.quota = await statfsSummary(privateConnection.rootPath);
        connection.syncStatus = fsSync.existsSync(privateConnection.rootPath)
          ? "localAdapterVerified"
          : "unavailable";
      }
    }
    const providerFilter = normalizeProvider(input.provider || "");
    const driveRef = text(input.driveRef || input.driveId || "");
    manifestPayload.connections = manifestPayload.connections.filter((connection) =>
      (!providerFilter || connection.provider === providerFilter) &&
      (!driveRef || connection.driveRef === driveRef)
    );
    manifestPayload.count = manifestPayload.connections.length;
    return manifestPayload;
  }

  async function listItems(input = {}) {
    const { connection } = await resolveConnection(input);
    const ledger = await loadLedger();
    const basePath = normalizeDriveRelativePath(input.path || input.folderPath || "", { allowEmpty: true });
    const recursive = ["1", "true", "yes"].includes(text(input.recursive ?? "false").toLowerCase());
    const includeHash = ["1", "true", "yes"].includes(text(input.includeHash ?? input["include-hash"] ?? "false").toLowerCase());
    const limit = Math.max(1, Math.min(Number(input.limit || 200) || 200, 1000));
    let items;
    if (connection.provider === "icloud") {
      items = await listLocalItems(connection.rootPath, basePath, { recursive, includeHash, limit });
      items = items.map((item) => ({
        ...item,
        provider: connection.provider,
        driveRef: connection.driveRef
      }));
    } else {
      items = [contractItem(connection.provider, connection, 0), contractItem(connection.provider, connection, 1)].slice(0, limit);
    }
    const accessReceipt = createAccessReceipt({
      operationId: input.operationId || "sharedspace.drive.item.list",
      driveRef: connection.driveRef,
      drivePath: basePath || "/",
      action: "drive.item.list",
      state: connection.contractVerified ? "contractVerified" : "cached"
    });
    ledger.accessReceipts[accessReceipt.receiptId] = accessReceipt;
    appendEvent(ledger, "sharedspace.drive.item.list", {
      driveRef: connection.driveRef,
      provider: connection.provider,
      basePath,
      itemCount: items.length,
      contractVerified: connection.contractVerified === true
    });
    await saveLedger(ledger);
    return {
      ok: true,
      protocolVersion: CLOUD_DRIVE_PORT_PROTOCOL_VERSION,
      drive: publicConnection(connection, { configFilePath }),
      basePath,
      items,
      paths: items.map((item) => item.path),
      count: items.length,
      metadataPolicy: "safeMetadataOnly",
      accessReceipt,
      contractVerified: connection.contractVerified === true,
      localAdapterVerified: connection.localAdapterVerified === true
    };
  }

  async function downloadFile(input = {}) {
    const { connection } = await resolveConnection(input);
    const ledger = await loadLedger();
    const drivePath = normalizeDriveRelativePath(input.path || input.filePath || input.itemPath || "", { allowEmpty: false });
    let content = Buffer.from(`Contract drive content for ${connection.provider}:${drivePath}\n`, "utf8");
    let localAdapterVerified = false;
    if (connection.provider === "icloud") {
      const target = await assertExistingLocalItemWithinRoot(connection.rootPath, drivePath);
      if (!target.stat.isFile()) {
        const error = new Error("云盘下载目标必须是文件。");
        error.code = "DRIVE_TARGET_NOT_FILE";
        throw error;
      }
      content = await fs.readFile(target.absolutePath);
      localAdapterVerified = true;
    }
    const contentSha256 = sha256Buffer(content);
    const transferReceipt = createTransferReceipt({
      operationId: input.operationId || "sharedspace.drive.file.download",
      driveRef: connection.driveRef,
      drivePath,
      direction: "download",
      byteSize: content.length,
      contentSha256,
      state: connection.contractVerified ? "contractVerified" : "staged",
      contractVerified: connection.contractVerified === true,
      localAdapterVerified
    });
    const accessReceipt = createAccessReceipt({
      operationId: input.operationId || "sharedspace.drive.file.download",
      driveRef: connection.driveRef,
      drivePath,
      action: "drive.file.download",
      state: connection.contractVerified ? "contractVerified" : "staged"
    });
    ledger.transfers[transferReceipt.transferReceiptId] = transferReceipt;
    ledger.accessReceipts[accessReceipt.receiptId] = accessReceipt;
    appendEvent(ledger, "sharedspace.drive.file.download", {
      driveRef: connection.driveRef,
      provider: connection.provider,
      drivePath,
      byteSize: content.length,
      contentSha256,
      contractVerified: connection.contractVerified === true,
      localAdapterVerified
    });
    await saveLedger(ledger);
    const includeText = !["0", "false", "no"].includes(text(input.includeText ?? input["include-text"] ?? "true").toLowerCase());
    return {
      ok: true,
      protocolVersion: CLOUD_DRIVE_PORT_PROTOCOL_VERSION,
      drive: publicConnection(connection, { configFilePath }),
      path: drivePath,
      byteSize: content.length,
      contentSha256,
      contentBase64: content.toString("base64"),
      ...(includeText ? { content: content.toString(input.encoding || "utf8") } : {}),
      transferReceipt,
      accessReceipt,
      contractVerified: connection.contractVerified === true,
      localAdapterVerified
    };
  }

  async function uploadFile(input = {}) {
    const { connection } = await resolveConnection(input);
    const ledger = await loadLedger();
    const drivePath = normalizeDriveRelativePath(
      input.path || input.filePath || path.posix.join(input.parentPath || "", input.name || "upload.txt"),
      { allowEmpty: false }
    );
    const content = decodeUploadContent(input);
    const contentSha256 = sha256Buffer(content);
    const policyDecision = {
      protocolVersion: "pact.cloud-drive.policy-decision.v1",
      decisionId: stableId("cloud_drive_policy", {
        driveRef: connection.driveRef,
        drivePath,
        contentSha256,
        operationId: input.operationId || "sharedspace.drive.file.upload"
      }),
      decision: "allow",
      reason: "v0.0.1 cloud drive upload is mediated by Pact operation and secretRef policy.",
      requiresCheckpoint: true,
      createdAt: nowIso()
    };
    let localAdapterVerified = false;
    if (connection.provider === "icloud") {
      const target = safeJoinLocal(connection.rootPath, drivePath, { allowRoot: false });
      const exists = fsSync.existsSync(target.absolutePath);
      if (exists && input.overwrite !== true) {
        const error = new Error("云盘目标文件已存在；覆盖需要 overwrite=true。");
        error.code = "DRIVE_TARGET_EXISTS";
        throw error;
      }
      await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
      await fs.writeFile(target.absolutePath, content);
      localAdapterVerified = true;
    }
    const checkpoint = createCheckpoint({
      operationId: input.operationId || "sharedspace.drive.file.upload",
      driveRef: connection.driveRef,
      drivePath,
      action: "drive.file.upload",
      state: connection.contractVerified ? "contractVerified" : "projected"
    });
    const transferReceipt = createTransferReceipt({
      operationId: input.operationId || "sharedspace.drive.file.upload",
      driveRef: connection.driveRef,
      drivePath,
      direction: "upload",
      byteSize: content.length,
      contentSha256,
      state: connection.contractVerified ? "contractVerified" : "projected",
      contractVerified: connection.contractVerified === true,
      localAdapterVerified
    });
    ledger.checkpoints[checkpoint.checkpointId] = checkpoint;
    ledger.transfers[transferReceipt.transferReceiptId] = transferReceipt;
    appendEvent(ledger, "sharedspace.drive.file.upload", {
      driveRef: connection.driveRef,
      provider: connection.provider,
      drivePath,
      byteSize: content.length,
      contentSha256,
      remoteWriteInvoked: connection.provider === "icloud",
      contractVerified: connection.contractVerified === true,
      localAdapterVerified
    });
    await saveLedger(ledger);
    return {
      ok: true,
      protocolVersion: CLOUD_DRIVE_PORT_PROTOCOL_VERSION,
      drive: publicConnection(connection, { configFilePath }),
      path: drivePath,
      byteSize: content.length,
      contentSha256,
      policyDecision,
      checkpoint,
      transferReceipt,
      remoteWriteInvoked: connection.provider === "icloud",
      contractVerified: connection.contractVerified === true,
      localAdapterVerified
    };
  }

  async function syncPlan(input = {}) {
    const { connection } = await resolveConnection(input);
    const basePath = normalizeDriveRelativePath(input.path || input.scope || "", { allowEmpty: true });
    const direction = text(input.direction || "import_to_sharedspace");
    const limit = Math.max(1, Math.min(Number(input.limit || 200) || 200, 1000));
    const items = connection.provider === "icloud"
      ? await listLocalItems(connection.rootPath, basePath, { recursive: true, includeHash: true, limit })
      : [contractItem(connection.provider, connection, 0)];
    const plan = syncPlanFromItems({
      connection,
      items,
      direction,
      scope: input.workspaceTargetPath || input.targetPath || "cloud-drive"
    });
    return {
      ok: true,
      protocolVersion: CLOUD_DRIVE_PORT_PROTOCOL_VERSION,
      drive: publicConnection(connection, { configFilePath }),
      basePath,
      ...plan,
      contractVerified: connection.contractVerified === true,
      localAdapterVerified: connection.localAdapterVerified === true
    };
  }

  async function syncApply(input = {}) {
    const { connection } = await resolveConnection(input);
    const ledger = await loadLedger();
    const plan = await syncPlan(input);
    const checkpoint = createCheckpoint({
      operationId: input.operationId || "sharedspace.drive.sync.apply",
      driveRef: connection.driveRef,
      drivePath: plan.basePath || "/",
      action: "drive.sync.apply",
      state: connection.contractVerified ? "contractVerified" : "projected"
    });
    const syncReceipt = {
      protocolVersion: "pact.cloud-drive.sync-receipt.v1",
      syncReceiptId: stableId("cloud_drive_sync", {
        driveRef: connection.driveRef,
        basePath: plan.basePath,
        direction: plan.direction,
        actionCount: plan.actionCount,
        createdAt: checkpoint.createdAt
      }),
      operationId: input.operationId || "sharedspace.drive.sync.apply",
      driveRef: connection.driveRef,
      direction: plan.direction,
      actionCount: plan.actionCount,
      state: connection.contractVerified ? "contractVerified" : "projected",
      remoteSyncInvoked: false,
      contractVerified: connection.contractVerified === true,
      localAdapterVerified: connection.localAdapterVerified === true,
      createdAt: nowIso()
    };
    ledger.checkpoints[checkpoint.checkpointId] = checkpoint;
    appendEvent(ledger, "sharedspace.drive.sync.apply", {
      driveRef: connection.driveRef,
      provider: connection.provider,
      direction: plan.direction,
      actionCount: plan.actionCount,
      syncReceiptId: syncReceipt.syncReceiptId,
      contractVerified: connection.contractVerified === true
    });
    await saveLedger(ledger);
    return {
      ...plan,
      dryRun: false,
      checkpoint,
      syncReceipt,
      appliedActions: connection.contractVerified ? [] : plan.actions,
      remoteSyncInvoked: false,
      contractVerified: connection.contractVerified === true,
      localAdapterVerified: connection.localAdapterVerified === true
    };
  }

  async function permissionList(input = {}) {
    const { connection } = await resolveConnection(input);
    const drivePath = normalizeDriveRelativePath(input.path || input.itemPath || "", { allowEmpty: true });
    return {
      ok: true,
      protocolVersion: CLOUD_DRIVE_PORT_PROTOCOL_VERSION,
      drive: publicConnection(connection, { configFilePath }),
      path: drivePath,
      permissions: [
        {
          permissionId: stableId("cloud_drive_permission", {
            driveRef: connection.driveRef,
            drivePath,
            principal: "pact-owner"
          }),
          principal: "pact-owner",
          role: connection.provider === "icloud" ? "local-owner" : "contract-owner",
          inherited: drivePath === "",
          metadataOnly: true,
          contractVerified: connection.contractVerified === true
        }
      ],
      redactions: ["shareLink", "providerNativeId", "token"],
      contractVerified: connection.contractVerified === true,
      localAdapterVerified: connection.localAdapterVerified === true
    };
  }

  return {
    manifest,
    connect,
    status,
    listItems,
    downloadFile,
    uploadFile,
    syncPlan,
    syncApply,
    permissionList
  };
}
