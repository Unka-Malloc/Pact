import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadSettings } from "../../../common/platform-core/settings.mjs";
import { TIKA_VERSION } from "../../../modules/knowledge/file-processor/FileNormalizer/Tika/tika.mjs";
import { cloudDriveConfigPath } from "../../agent/cloud-drive-port/index.mjs";
import { resolveGatewayRuntimePlan } from "../agent-ingress/traffic-gateway/index.mjs";
import { knowledgeBackendConfigPath } from "../../knowledge/storage/knowledge-backend-port/index.mjs";

export const RUNTIME_DEPENDENCIES_PROTOCOL_VERSION = "pact.runtime-dependencies.v1";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../../../../..");
const platformKey = `${process.platform}-${process.arch}`;
const executableSuffix = process.platform === "win32" ? ".exe" : "";
const GERRIT_VERSION = process.env.PACT_GERRIT_VERSION || "3.14.0";
const KNOWLEDGE_MODULE_ROOT = path.join(repoRoot, "server", "platform", "modules", "knowledge");
const KNOWLEDGE_BACKEND_TARGETS = Object.freeze([
  Object.freeze({
    targetId: "dify",
    providerId: "dify",
    label: "Dify",
    description: "Dify backend knowledge base adapter configuration and optional local image cache."
  }),
  Object.freeze({
    targetId: "rag-flow",
    providerId: "ragflow",
    label: "RAG Flow",
    description: "RAG Flow backend knowledge base adapter configuration and optional local image cache."
  })
]);
const TOP_LEVEL_TARGETS = Object.freeze([
  "dify",
  "rag-flow",
  "cloud-drives",
  "docker",
  "programming-runtimes",
  "caddy",
  "nginx",
  "gerrit"
]);
const SOURCE_CONFIG_RELATIVE_PATH = path.join("runtime", "runtime-dependency-sources.json");
const INSTALL_STATUS = Object.freeze({
  PRESENT: "present",
  INSTALLED: "installed",
  FAILED: "failed"
});
const PYTHON_VERSION = process.env.PACT_PYTHON_RUNTIME_VERSION || "3.13.5";
const NGINX_VERSION = process.env.PACT_NGINX_RUNTIME_VERSION || "1.27.5";

function nowIso() {
  return new Date().toISOString();
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeTargetId(value = "") {
  return text(value).toLowerCase().replace(/_/g, "-");
}

function runtimeCacheRoot(input = {}) {
  const explicit = text(input.cacheRoot || input.runtimeCacheRoot || process.env.PACT_RUNTIME_DEPENDENCY_CACHE_DIR);
  if (explicit) {
    return path.resolve(explicit);
  }
  const xdgCacheHome = text(process.env.XDG_CACHE_HOME);
  return path.join(xdgCacheHome ? path.resolve(xdgCacheHome) : path.join(os.homedir(), ".cache"), "pact", "runtime-dependencies");
}

function dataRoot(input = {}) {
  const explicit = text(input.userDataPath || process.env.PACT_SERVER_DATA_DIR);
  return explicit ? path.resolve(explicit) : path.join(os.homedir(), ".pact-server-data");
}

export function runtimeDependencySourceConfigPath(input = {}) {
  return path.join(dataRoot(input), SOURCE_CONFIG_RELATIVE_PATH);
}

function gatewayCaddyArch() {
  if (process.arch === "arm64") return "arm64";
  if (process.arch === "x64") return "amd64";
  return process.arch;
}

function sourcePlatformKeys() {
  return [
    `${process.platform}-${process.arch}`,
    `${process.platform}-${gatewayCaddyArch()}`,
    process.platform,
    "default"
  ];
}

function defaultPythonPackageFileName() {
  if (process.platform === "darwin") return `python-${PYTHON_VERSION}-macos11.pkg`;
  if (process.platform === "win32") return `python-${PYTHON_VERSION}-amd64.exe`;
  return `python-${PYTHON_VERSION}.tgz`;
}

function defaultPythonPackageUrl() {
  if (process.platform === "darwin") {
    return `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-macos11.pkg`;
  }
  if (process.platform === "win32") {
    return `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-amd64.exe`;
  }
  return `https://www.python.org/ftp/python/${PYTHON_VERSION}/Python-${PYTHON_VERSION}.tgz`;
}

function defaultJreSourceEntry() {
  if (platformKey === "darwin-arm64") {
    return {
      fileName: "OpenJDK21U-jre_aarch64_mac_hotspot_21.0.10_7.tar.gz",
      url: "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.10%2B7/OpenJDK21U-jre_aarch64_mac_hotspot_21.0.10_7.tar.gz"
    };
  }
  return {
    fileName: `jre-${platformKey}.tar.gz`,
    url: ""
  };
}

function defaultCaddyPackageUrl() {
  const osName = process.platform === "win32" ? "windows" : process.platform;
  return `https://caddyserver.com/api/download?os=${encodeURIComponent(osName)}&arch=${encodeURIComponent(gatewayCaddyArch())}`;
}

function defaultCaddyPackageFileName() {
  const extension = process.platform === "win32" ? "zip" : "tar.gz";
  return `caddy-${process.platform}-${process.arch}.${extension}`;
}

function defaultSourceConfig() {
  const dockerUrl = dockerDefaultInstallerUrl();
  const gerritVersion = process.env.PACT_GERRIT_VERSION || GERRIT_VERSION;
  return {
    schemaVersion: 1,
    protocolVersion: RUNTIME_DEPENDENCIES_PROTOCOL_VERSION,
    generatedAt: nowIso(),
    note: "User-triggered runtime dependency sources. Edit mirror URLs here when built-in sources are unreachable.",
    platform: {
      os: process.platform,
      arch: process.arch,
      key: platformKey
    },
    sources: {
      dify: {
        images: [],
        mirrorPrefix: ""
      },
      "rag-flow": {
        images: [],
        mirrorPrefix: ""
      },
      docker: {
        default: {
          url: dockerUrl,
          fileName: dockerUrl ? `Docker-${platformKey}.dmg` : `docker-${platformKey}`
        },
        mirrors: []
      },
      jre: {
        default: defaultJreSourceEntry(),
        mirrors: []
      },
      tika: {
        default: {
          url: `https://repo.maven.apache.org/maven2/org/apache/tika/tika-app/${TIKA_VERSION}/tika-app-${TIKA_VERSION}.jar`,
          fileName: `tika-app-${TIKA_VERSION}.jar`
        },
        mirrors: []
      },
      python: {
        default: {
          url: defaultPythonPackageUrl(),
          fileName: defaultPythonPackageFileName()
        },
        mirrors: []
      },
      caddy: {
        default: {
          url: defaultCaddyPackageUrl(),
          fileName: defaultCaddyPackageFileName()
        },
        mirrors: []
      },
      nginx: {
        default: {
          url: `https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz`,
          fileName: `nginx-${NGINX_VERSION}.tar.gz`
        },
        mirrors: []
      },
      gerrit: {
        version: gerritVersion,
        default: {
          warUrl: `https://repo1.maven.org/maven2/com/google/gerrit/gerrit-war/${gerritVersion}/gerrit-war-${gerritVersion}.war`
        },
        mirrors: [
          `https://gerrit-releases.storage.googleapis.com/gerrit-${gerritVersion}.war`
        ]
      }
    }
  };
}

function mergePlainObject(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return base;
  }
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergePlainObject(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function ensureRuntimeDependencySourceConfig(context = {}) {
  const configPath = runtimeDependencySourceConfigPath(context);
  const defaults = defaultSourceConfig();
  let config = defaults;
  let shouldWrite = false;
  try {
    const existing = JSON.parse(await fs.readFile(configPath, "utf8"));
    config = mergePlainObject(defaults, existing);
    shouldWrite = JSON.stringify(config) !== JSON.stringify(existing);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      config = {
        ...defaults,
        lastReadError: error instanceof Error ? error.message : String(error)
      };
    }
    shouldWrite = true;
  }
  if (shouldWrite) {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }
  return { configPath, config };
}

function sourceEntry(sourceConfig = {}, targetId = "") {
  const root = sourceConfig?.sources?.[targetId];
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    return {};
  }
  for (const key of sourcePlatformKeys()) {
    const candidate = root[key];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return { ...root.default, ...candidate };
    }
  }
  return root.default && typeof root.default === "object" ? root.default : root;
}

function sourceField(sourceConfig = {}, targetId = "", fieldName = "url") {
  return text(sourceEntry(sourceConfig, targetId)?.[fieldName]);
}

function fileNameFromUrl(url = "", fallback = "runtime-artifact") {
  const sourceUrl = text(url);
  if (!sourceUrl) return fallback;
  try {
    return path.basename(new URL(sourceUrl).pathname) || fallback;
  } catch {
    return fallback;
  }
}

function downloadSourceFailure(targetId, sourceState, reason = "builtin_source_unavailable") {
  return {
    ok: false,
    status: INSTALL_STATUS.FAILED,
    reason,
    sourceConfigPath: sourceState?.configPath || "",
    mirrorRequired: true,
    mirrorHint: "内置下载源不可达或当前平台默认源不可用，请在本地下载源配置中配置镜像源后重试。"
  };
}

function safePath(value = "") {
  const candidate = text(value);
  return candidate ? path.resolve(candidate) : "";
}

function pathExists(targetPath = "") {
  if (!targetPath) return false;
  try {
    fsSync.accessSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function executableExists(targetPath = "") {
  if (!targetPath) return false;
  try {
    fsSync.accessSync(targetPath, fsSync.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value = "") {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function commandPath(commandName = "") {
  const command = text(commandName);
  if (!command) return "";
  const result = process.platform === "win32"
    ? spawnSync("where", [command], {
        encoding: "utf8",
        timeout: 3000
      })
    : spawnSync("sh", ["-c", `command -v ${shellQuote(command)}`], {
        encoding: "utf8",
        timeout: 3000
      });
  if (result.status !== 0) {
    return "";
  }
  return text(result.stdout).split(/\r?\n/).map(text).find(Boolean) || "";
}

function runCommand(command, args = [], options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
    maxBuffer: options.maxBuffer || 1024 * 1024 * 12,
    timeout: options.timeoutMs || 600000
  });
}

function commandVersion(command, args = ["--version"]) {
  const executablePath = commandPath(command);
  if (!executablePath) {
    return "";
  }
  const result = runCommand(executablePath, args, { timeoutMs: 5000 });
  return text([result.stdout, result.stderr].filter(Boolean).join("\n")).split(/\r?\n/)[0] || "";
}

function clipOutput(value = "", limit = 4000) {
  const content = String(value || "");
  if (content.length <= limit) {
    return content;
  }
  return `${content.slice(0, 1200)}\n...\n${content.slice(-limit + 1206)}`;
}

function commandSummary(result = {}) {
  return {
    status: result.status ?? null,
    signal: result.signal || "",
    stdout: clipOutput(result.stdout || ""),
    stderr: clipOutput(result.stderr || "")
  };
}

async function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }
    return { __readError: error instanceof Error ? error.message : String(error) };
  }
}

function dependencyStatus({ present = false, cached = false }) {
  if (present) return INSTALL_STATUS.PRESENT;
  if (cached) return INSTALL_STATUS.INSTALLED;
  return INSTALL_STATUS.FAILED;
}

function asDependency({
  id,
  label,
  category,
  description,
  status,
  present = false,
  cached = false,
  downloadable = false,
  children = [],
  detection = {},
  actions = {},
  accepts = {}
}) {
  return {
    id,
    label,
    category,
    description,
    status,
    present,
    cached,
    downloadable,
    children,
    detection,
    actions,
    accepts
  };
}

function knowledgeBackendTarget(targetId = "") {
  const normalized = normalizeTargetId(targetId);
  if (normalized === "ragflow" || normalized === "rag-flow" || normalized === "rag-flow-backend") {
    return KNOWLEDGE_BACKEND_TARGETS.find((target) => target.providerId === "ragflow");
  }
  if (normalized === "dify" || normalized === "dify-backend") {
    return KNOWLEDGE_BACKEND_TARGETS.find((target) => target.providerId === "dify");
  }
  return null;
}

function knowledgeBackendConfiguredImages(context = {}, targetId = "") {
  const configuredImages = context.sourceConfig?.sources?.[targetId]?.images;
  return Array.isArray(configuredImages) ? configuredImages.map(text).filter(Boolean) : [];
}

async function detectKnowledgeBackendProvider(target, context = {}) {
  const userDataPath = text(context.userDataPath);
  const configPath = knowledgeBackendConfigPath(userDataPath);
  const config = await readJson(configPath, {});
  const provider = config && typeof config.providers === "object" && !Array.isArray(config.providers)
    ? config.providers[target.providerId]
    : null;
  const docker = detectDockerSync(context);
  const configuredImages = knowledgeBackendConfiguredImages(context, target.targetId);
  const images = docker.ready
    ? configuredImages.map((image) => ({
        image,
        present: dockerImagePresent(image)
      }))
    : configuredImages.map((image) => ({ image, present: false }));
  const imageCount = images.filter((item) => item.present).length;
  const configured = pathExists(configPath) && Boolean(provider);
  const present = configured || (images.length > 0 && imageCount === images.length);
  return asDependency({
    id: target.targetId,
    label: target.label,
    category: "knowledge",
    description: target.description,
    status: dependencyStatus({ present }),
    present,
    downloadable: docker.ready && images.length > 0,
    detection: {
      configPath,
      provider: target.providerId,
      configured,
      credentialConfigured: Boolean(provider?.credentialConfigured),
      mode: text(provider?.mode || ""),
      dockerReady: docker.ready,
      images,
      sourcePolicy: `${target.label} config first; optional Docker images only when configured in local source config`
    },
    actions: {
      download: configured
        ? "already-configured"
        : images.length === 0
          ? "configure-provider-or-images"
          : docker.ready
            ? "docker-pull"
            : "install-docker-first"
    }
  });
}

async function detectKnowledgeBackends(context = {}) {
  const dependencies = await Promise.all(
    KNOWLEDGE_BACKEND_TARGETS.map((target) => detectKnowledgeBackendProvider(target, context))
  );
  const missing = dependencies.filter((item) => !item.present);
  return asDependency({
    id: "knowledge-backends",
    label: "Knowledge backends",
    category: "knowledge",
    description: "Compatibility aggregate for Dify and RAG Flow backend knowledge adapters.",
    status: dependencyStatus({ present: missing.length === 0 }),
    present: missing.length === 0,
    downloadable: dependencies.some((item) => item.downloadable),
    children: dependencies,
    detection: {
      sourcePolicy: "compatibility aggregate; console lists Dify and RAG Flow separately"
    },
    actions: {
      download: missing.length === 0 ? "already-present" : "prepare-children"
    }
  });
}

async function detectCloudDrives(context = {}) {
  const userDataPath = text(context.userDataPath);
  const configPath = cloudDriveConfigPath(userDataPath);
  const config = await readJson(configPath, {});
  const connections = config && typeof config.connections === "object" && !Array.isArray(config.connections)
    ? Object.keys(config.connections)
    : [];
  const cloudStorageRoot = path.join(os.homedir(), "Library", "CloudStorage");
  const icloudRoot = path.join(os.homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs");
  const present = connections.length > 0 || pathExists(icloudRoot) || pathExists(cloudStorageRoot);
  return asDependency({
    id: "cloud-drives",
    label: "Cloud drives",
    category: "cloud",
    description: "iCloud local folder and OAuth-backed OneDrive/Google Drive/Dropbox connection manifests.",
    status: dependencyStatus({ present }),
    present,
    downloadable: false,
    detection: {
      configPath,
      configuredConnections: connections,
      icloudRoot,
      icloudAvailable: pathExists(icloudRoot),
      cloudStorageRoot,
      cloudStorageAvailable: pathExists(cloudStorageRoot),
      sourcePolicy: "local folder or OAuth/secret-ref adapter configuration"
    },
    actions: {
      download: "local-provider-auth"
    }
  });
}

function dockerDefaultInstallerUrl() {
  if (process.platform !== "darwin") {
    return "";
  }
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  return `https://desktop.docker.com/mac/main/${arch}/Docker.dmg`;
}

function detectDockerSync(context = {}) {
  const dockerPath = commandPath("docker");
  const appPath = process.platform === "darwin" ? "/Applications/Docker.app" : "";
  const installerFileName = sourceField(context.sourceConfig, "docker", "fileName") || `Docker-${platformKey}.dmg`;
  const installerPath = path.join(runtimeCacheRoot(context), "docker", installerFileName);
  return {
    id: "docker",
    ready: Boolean(dockerPath),
    present: Boolean(dockerPath) || pathExists(appPath),
    cached: pathExists(installerPath),
    dockerPath,
    appPath,
    installerPath,
    version: dockerPath ? commandVersion("docker", ["--version"]) : ""
  };
}

async function detectDocker(context = {}) {
  const docker = detectDockerSync(context);
  return asDependency({
    id: "docker",
    label: "Docker",
    category: "container",
    description: "Docker CLI/Desktop used only when the user explicitly pulls container-backed runtimes.",
    status: dependencyStatus({ present: docker.present, cached: docker.cached }),
    present: docker.present,
    cached: docker.cached,
    downloadable: true,
    detection: {
      dockerPath: docker.dockerPath,
      appPath: docker.appPath,
      appPresent: docker.appPath ? pathExists(docker.appPath) : false,
      installerPath: docker.installerPath,
      installerCached: docker.cached,
      version: docker.version,
      sourcePolicy: "PATH or Docker Desktop app, then cached installer, then local source config"
    },
    actions: {
      download: docker.present ? "already-present" : docker.cached ? "already-installed" : "download-installer"
    }
  });
}

function dockerImagePresent(image) {
  if (!commandPath("docker")) {
    return false;
  }
  const result = runCommand("docker", ["image", "inspect", image], { timeoutMs: 4000, maxBuffer: 1024 * 1024 });
  return result.status === 0;
}

async function detectJre(context = {}) {
  const settings = await loadSettings(dataRoot(context), { redactSecrets: true }).catch(() => ({}));
  const javaName = `java${executableSuffix}`;
  const candidates = [
    safePath(settings.javaBinPath || process.env.PACT_JAVA_BIN_PATH || ""),
    path.join(KNOWLEDGE_MODULE_ROOT, "runtime", "jre", platformKey, "bin", javaName),
    path.join(KNOWLEDGE_MODULE_ROOT, "runtime", "jre", platformKey, "Contents", "Home", "bin", javaName),
    commandPath("java")
  ].filter(Boolean);
  const javaPath = candidates.find((candidate) => executableExists(candidate) || candidate === "java" || pathExists(candidate)) || "";
  const tikaJarPath = [
    safePath(settings.tikaJarPath || process.env.PACT_TIKA_JAR_PATH || ""),
    path.join(KNOWLEDGE_MODULE_ROOT, "tika", `tika-app-${TIKA_VERSION}.jar`),
    path.join(KNOWLEDGE_MODULE_ROOT, "tika", "tika-app.jar")
  ].find(pathExists) || "";
  return asDependency({
    id: "jre",
    label: "JRE",
    category: "language-runtime",
    description: "Java runtime for Java-backed document parsing and Gerrit WAR runner.",
    status: dependencyStatus({ present: Boolean(javaPath) }),
    present: Boolean(javaPath),
    downloadable: true,
    detection: {
      javaPath,
      javaVersion: javaPath ? commandVersion(javaPath, ["-version"]) : "",
      tikaJarPath,
      tikaVersion: TIKA_VERSION,
      sourcePolicy: "settings -> bundled runtime -> PATH -> local source config"
    },
    actions: {
      download: javaPath ? "already-present" : "download-temurin-jre"
    }
  });
}

async function detectPython(context = {}) {
  const explicitPaths = [
    process.env.PACT_OCR_PYTHON_PATH,
    process.env.PACT_PDF_VISUAL_PYTHON_PATH,
    process.env.PACT_PYTHON_BIN_PATH
  ].map(safePath).filter(Boolean);
  const moduleCandidates = [
    path.join(KNOWLEDGE_MODULE_ROOT, "ocr", "runtime", platformKey, "bin", `python${executableSuffix}`),
    path.join(KNOWLEDGE_MODULE_ROOT, "pdf", "runtime", platformKey, "bin", `python${executableSuffix}`),
    path.join(repoRoot, ".venv-pdf", "bin", "python"),
    path.join(repoRoot, ".venv", "bin", "python")
  ];
  const pathCandidates = ["python3", "python"].map(commandPath).filter(Boolean);
  const pythonPath = [...explicitPaths, ...moduleCandidates, ...pathCandidates]
    .find((candidate) => executableExists(candidate) || pathExists(candidate)) || "";
  const artifactFileName = sourceField(context.sourceConfig, "python", "fileName") || `python-${platformKey}`;
  const artifactPath = path.join(runtimeCacheRoot(context), "python", artifactFileName);
  return asDependency({
    id: "python",
    label: "Python",
    category: "language-runtime",
    description: "Python runtime used by optional OCR and PDF visual sidecars.",
    status: dependencyStatus({ present: Boolean(pythonPath), cached: pathExists(artifactPath) }),
    present: Boolean(pythonPath),
    cached: pathExists(artifactPath),
    downloadable: true,
    detection: {
      pythonPath,
      pythonVersion: pythonPath ? commandVersion(pythonPath, ["--version"]) : "",
      artifactPath,
      artifactCached: pathExists(artifactPath),
      sourcePolicy: "env/bundled venv -> PATH -> local source config"
    },
    actions: {
      download: pythonPath ? "already-present" : pathExists(artifactPath) ? "already-installed" : "download-runtime"
    }
  });
}

async function detectProgrammingRuntimes(context = {}) {
  const [jre, python] = await Promise.all([
    detectJre(context),
    detectPython(context)
  ]);
  const nodePath = commandPath("node") || process.execPath;
  const node = asDependency({
    id: "node",
    label: "Node.js",
    category: "language-runtime",
    description: "Current server runtime.",
    status: dependencyStatus({ present: Boolean(nodePath) }),
    present: Boolean(nodePath),
    downloadable: false,
    detection: {
      nodePath,
      version: process.version
    },
    actions: {
      download: "skip-current-runtime"
    }
  });
  const children = [jre, python, node];
  const missing = children.filter((item) => !item.present);
  return asDependency({
    id: "programming-runtimes",
    label: "JRE / Python runtimes",
    category: "language-runtime",
    description: "Language runtimes Pact can prepare on demand for supported adapters.",
    status: dependencyStatus({ present: missing.length === 0 }),
    present: missing.length === 0,
    downloadable: true,
    children,
    detection: {
      sourcePolicy: "detect each runtime first; download only the missing runtime when explicitly requested"
    },
    actions: {
      download: missing.length === 0 ? "already-present" : "prepare-missing-children"
    }
  });
}

async function detectGateway(adapterId, context = {}) {
  const sourceConfig = context.sourceConfig || {};
  const configuredRuntimeUrl = sourceField(sourceConfig, adapterId, "url");
  const plan = resolveGatewayRuntimePlan({
    adapterId,
    runtimeUrl: configuredRuntimeUrl,
    cacheRoot: context.gatewayRuntimeCacheRoot
  });
  const configuredPresent = plan.configuredBinary ? executableExists(plan.configuredBinary) || pathExists(plan.configuredBinary) : false;
  const cachedPresent = executableExists(plan.cachedExecutablePath) || pathExists(plan.cachedExecutablePath);
  const pathBinary = commandPath(plan.executableName);
  const present = configuredPresent || cachedPresent || Boolean(pathBinary);
  return asDependency({
    id: adapterId,
    label: adapterId === "nginx" ? "Nginx" : "Caddy",
    category: "gateway",
    description: `${adapterId} gateway binary for optional ingress runtime.`,
    status: dependencyStatus({ present }),
    present,
    downloadable: true,
    detection: {
      adapterId,
      configuredBinary: plan.configuredBinary,
      configuredPresent,
      cachedExecutablePath: plan.cachedExecutablePath,
      cachedPresent,
      pathBinary,
      runtimeUrl: plan.runtimeUrl,
      sourceConfigPath: context.sourceConfigPath || "",
      sourcePolicy: "configured binary -> local cache -> PATH -> local source config"
    },
    actions: {
      download: present ? "already-present" : "download-runtime"
    }
  });
}

async function detectGerrit(context = {}) {
  const version = text(context.version || process.env.PACT_GERRIT_VERSION || GERRIT_VERSION);
  const root = path.resolve(text(context.root || process.env.PACT_GERRIT_ROOT) || path.join(repoRoot, "build", "local-data", "gerrit"));
  const warPath = path.join(root, "downloads", `gerrit-${version}.war`);
  const present = pathExists(warPath);
  return asDependency({
    id: "gerrit",
    label: "Gerrit",
    category: "code-review",
    description: "Official Gerrit WAR cached for local code review workflows.",
    status: dependencyStatus({ present }),
    present,
    downloadable: true,
    detection: {
      version,
      root,
      warPath,
      sourcePolicy: "local WAR cache -> official Maven/Google Gerrit release download"
    },
    actions: {
      download: present ? "already-present" : "download-war"
    }
  });
}

async function detectTarget(targetId, context = {}) {
  const knowledgeTarget = knowledgeBackendTarget(targetId);
  if (knowledgeTarget) {
    return detectKnowledgeBackendProvider(knowledgeTarget, context);
  }
  switch (normalizeTargetId(targetId)) {
    case "knowledge-backends":
      return detectKnowledgeBackends(context);
    case "cloud-drives":
      return detectCloudDrives(context);
    case "docker":
      return detectDocker(context);
    case "programming-runtimes":
    case "language-runtimes":
      return detectProgrammingRuntimes(context);
    case "jre":
    case "java":
      return detectJre(context);
    case "python":
      return detectPython(context);
    case "caddy":
      return detectGateway("caddy", context);
    case "nginx":
      return detectGateway("nginx", context);
    case "gerrit":
      return detectGerrit(context);
    default:
      throw new Error(`Unsupported runtime dependency target: ${targetId}`);
  }
}

export async function listRuntimeDependencies(context = {}) {
  const sourceState = await ensureRuntimeDependencySourceConfig(context);
  const dependencyContext = {
    ...context,
    sourceConfig: sourceState.config,
    sourceConfigPath: sourceState.configPath
  };
  const dependencies = await Promise.all(TOP_LEVEL_TARGETS.map((targetId) => detectTarget(targetId, dependencyContext)));
  const summary = dependencies.reduce((acc, item) => {
    acc.total += 1;
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, { total: 0 });
  return {
    ok: true,
    schemaVersion: 1,
    protocolVersion: RUNTIME_DEPENDENCIES_PROTOCOL_VERSION,
    generatedAt: nowIso(),
    cacheRoot: runtimeCacheRoot(context),
    sourceConfigPath: sourceState.configPath,
    startupDownloads: false,
    triggerMode: "user-requested",
    dependencies,
    summary
  };
}

async function downloadRemoteArtifact({ url, targetPath, dryRun = false, timeoutMs = 600000, targetId = "", sourceState = null }) {
  const sourceUrl = text(url);
  if (!sourceUrl) {
    return downloadSourceFailure(targetId, sourceState, "builtin_source_missing");
  }
  if (pathExists(targetPath)) {
    return {
      ok: true,
      status: INSTALL_STATUS.INSTALLED,
      artifactPath: targetPath,
      alreadyAvailable: true,
      reason: "artifact_already_available"
    };
  }
  if (dryRun) {
    return {
      ok: true,
      status: INSTALL_STATUS.INSTALLED,
      artifactPath: targetPath,
      url: sourceUrl,
      planned: true
    };
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.download`;
  await fs.rm(tempPath, { force: true }).catch(() => {});
  const result = runCommand("curl", ["-L", "--fail", "--retry", "3", "--connect-timeout", "20", "-o", tempPath, sourceUrl], {
    timeoutMs
  });
  if (result.status !== 0) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    return {
      ok: false,
      status: INSTALL_STATUS.FAILED,
      reason: "download_failed",
      sourceConfigPath: sourceState?.configPath || "",
      mirrorRequired: true,
      mirrorHint: "内置下载源不可达，请在本地下载源配置中配置镜像源后重试。",
      command: ["curl", "-L", "--fail", "-o", targetPath, sourceUrl],
      commandResult: commandSummary(result)
    };
  }
  await fs.rename(tempPath, targetPath);
  return {
    ok: true,
    status: INSTALL_STATUS.INSTALLED,
    artifactPath: targetPath,
    url: sourceUrl
  };
}

async function downloadDocker(context = {}) {
  const detection = await detectDocker(context);
  if (detection.present) {
    return downloadResult("docker", INSTALL_STATUS.PRESENT, { detection, reason: "present" });
  }
  const url = sourceField(context.sourceConfig, "docker", "url") || text(process.env.PACT_DOCKER_RUNTIME_URL || dockerDefaultInstallerUrl());
  const fileName = sourceField(context.sourceConfig, "docker", "fileName") || fileNameFromUrl(url, `Docker-${platformKey}.dmg`);
  const artifactPath = path.join(runtimeCacheRoot(context), "docker", fileName);
  const artifactResult = await downloadRemoteArtifact({
    url,
    targetPath: artifactPath,
    dryRun: context.dryRun === true,
    timeoutMs: Number(context.timeoutMs || 600000),
    targetId: "docker",
    sourceState: context.sourceState
  });
  return downloadResult("docker", artifactResult.status, {
    detection,
    ...artifactResult
  });
}

async function downloadJre(context = {}) {
  const detection = await detectJre(context);
  if (detection.present) {
    return downloadResult("jre", INSTALL_STATUS.PRESENT, { detection, reason: "present" });
  }
  const jreUrl = sourceField(context.sourceConfig, "jre", "url");
  const jreFileName = sourceField(context.sourceConfig, "jre", "fileName");
  const tikaUrl = sourceField(context.sourceConfig, "tika", "url");
  const tikaFileName = sourceField(context.sourceConfig, "tika", "fileName");
  if (!jreUrl || !tikaUrl) {
    return downloadResult("jre", INSTALL_STATUS.FAILED, {
      detection,
      ...downloadSourceFailure("jre", context.sourceState, !jreUrl ? "builtin_jre_source_missing" : "builtin_tika_source_missing")
    });
  }
  if (context.dryRun === true) {
    return downloadResult("jre", INSTALL_STATUS.INSTALLED, {
      detection,
      command: [process.execPath, "server/scripts/setup-local-runtime.mjs"],
      planned: true
    });
  }
  const result = runCommand(process.execPath, [path.join(repoRoot, "server", "scripts", "setup-local-runtime.mjs")], {
    env: {
      ...(context.userDataPath ? { PACT_SERVER_DATA_DIR: path.resolve(context.userDataPath) } : {}),
      PACT_JRE_DOWNLOAD_URL: jreUrl,
      PACT_JRE_DOWNLOAD_FILE: jreFileName,
      PACT_TIKA_DOWNLOAD_URL: tikaUrl,
      PACT_TIKA_DOWNLOAD_FILE: tikaFileName
    },
    timeoutMs: Number(context.timeoutMs || 900000)
  });
  if (result.status !== 0) {
    return downloadResult("jre", INSTALL_STATUS.FAILED, {
      detection,
      sourceConfigPath: context.sourceState?.configPath || "",
      mirrorRequired: true,
      mirrorHint: "内置下载源不可达，请在本地下载源配置中配置镜像源后重试。",
      command: [process.execPath, "server/scripts/setup-local-runtime.mjs"],
      commandResult: commandSummary(result)
    });
  }
  return downloadResult("jre", INSTALL_STATUS.INSTALLED, {
    before: detection,
    detection: await detectJre(context),
    commandResult: commandSummary(result)
  });
}

async function downloadPython(context = {}) {
  const detection = await detectPython(context);
  if (detection.present) {
    return downloadResult("python", INSTALL_STATUS.PRESENT, { detection, reason: "present" });
  }
  const url = sourceField(context.sourceConfig, "python", "url") || text(process.env.PACT_PYTHON_RUNTIME_URL);
  const fileName = sourceField(context.sourceConfig, "python", "fileName") || fileNameFromUrl(url, `python-${platformKey}`);
  const artifactPath = path.join(runtimeCacheRoot(context), "python", fileName);
  const artifactResult = await downloadRemoteArtifact({
    url,
    targetPath: artifactPath,
    dryRun: context.dryRun === true,
    timeoutMs: Number(context.timeoutMs || 600000),
    targetId: "python",
    sourceState: context.sourceState
  });
  return downloadResult("python", artifactResult.status, {
    detection,
    ...artifactResult
  });
}

async function downloadGateway(adapterId, context = {}) {
  const detection = await detectGateway(adapterId, context);
  if (detection.present) {
    return downloadResult(adapterId, INSTALL_STATUS.PRESENT, { detection, reason: "present" });
  }
  const runtimeUrl = sourceField(context.sourceConfig, adapterId, "url");
  if (!runtimeUrl) {
    return downloadResult(adapterId, INSTALL_STATUS.FAILED, {
      detection,
      ...downloadSourceFailure(adapterId, context.sourceState, "builtin_source_missing")
    });
  }
  if (context.dryRun === true) {
    return downloadResult(adapterId, INSTALL_STATUS.INSTALLED, {
      detection,
      command: ["node", "server/scripts/gateway-ingress.mjs", "runtime-pull", "--gateway", adapterId],
      planned: true
    });
  }
  const args = [path.join(repoRoot, "server", "scripts", "gateway-ingress.mjs"), "runtime-pull", "--gateway", adapterId];
  args.push("--runtime-url", runtimeUrl);
  const result = runCommand(process.execPath, args, { timeoutMs: Number(context.timeoutMs || 600000) });
  if (result.status !== 0) {
    return downloadResult(adapterId, INSTALL_STATUS.FAILED, {
      detection,
      sourceConfigPath: context.sourceState?.configPath || "",
      mirrorRequired: true,
      mirrorHint: "内置下载源不可达，请在本地下载源配置中配置镜像源后重试。",
      command: [process.execPath, ...args.slice(1)],
      commandResult: commandSummary(result)
    });
  }
  return downloadResult(adapterId, INSTALL_STATUS.INSTALLED, {
    before: detection,
    detection: await detectGateway(adapterId, context),
    commandResult: commandSummary(result)
  });
}

async function downloadGerrit(context = {}) {
  const detection = await detectGerrit(context);
  if (detection.present) {
    return downloadResult("gerrit", INSTALL_STATUS.PRESENT, { detection, reason: "present" });
  }
  const warUrl = sourceField(context.sourceConfig, "gerrit", "warUrl");
  if (context.dryRun === true) {
    return downloadResult("gerrit", INSTALL_STATUS.INSTALLED, {
      detection,
      command: [process.execPath, "server/scripts/gerrit-local.mjs", "download"],
      planned: true
    });
  }
  const args = [path.join(repoRoot, "server", "scripts", "gerrit-local.mjs"), "download"];
  if (context.version) {
    args.push("--version", text(context.version));
  }
  if (context.root) {
    args.push("--root", path.resolve(text(context.root)));
  }
  if (warUrl) {
    args.push("--war-url", warUrl);
  }
  const result = runCommand(process.execPath, args, {
    env: context.userDataPath ? { PACT_SERVER_DATA_DIR: path.resolve(context.userDataPath) } : {},
    timeoutMs: Number(context.timeoutMs || 900000)
  });
  if (result.status !== 0) {
    return downloadResult("gerrit", INSTALL_STATUS.FAILED, {
      detection,
      sourceConfigPath: context.sourceState?.configPath || "",
      mirrorRequired: true,
      mirrorHint: "内置下载源不可达，请在本地下载源配置中配置镜像源后重试。",
      command: [process.execPath, ...args.slice(1)],
      commandResult: commandSummary(result)
    });
  }
  return downloadResult("gerrit", INSTALL_STATUS.INSTALLED, {
    before: detection,
    detection: await detectGerrit(context),
    commandResult: commandSummary(result)
  });
}

async function downloadKnowledgeBackendProvider(target, context = {}) {
  const detection = await detectKnowledgeBackendProvider(target, context);
  if (detection.present) {
    return downloadResult(target.targetId, INSTALL_STATUS.PRESENT, { detection, reason: "present_or_configured" });
  }
  const detectedImages = Array.isArray(detection.detection?.images) ? detection.detection.images : [];
  if (detectedImages.length === 0) {
    return downloadResult(target.targetId, INSTALL_STATUS.FAILED, {
      detection,
      reason: "provider_config_or_image_source_required"
    });
  }
  const docker = detectDockerSync(context);
  if (!docker.ready) {
    return downloadResult(target.targetId, INSTALL_STATUS.FAILED, {
      detection,
      reason: "docker_required_for_container_image_download",
      nextTarget: "docker"
    });
  }
  const images = knowledgeBackendConfiguredImages(context, target.targetId);
  if (context.dryRun === true) {
    return downloadResult(target.targetId, INSTALL_STATUS.INSTALLED, {
      detection,
      images,
      planned: true
    });
  }
  const results = [];
  for (const image of images) {
    if (dockerImagePresent(image)) {
      results.push({ image, status: INSTALL_STATUS.PRESENT, reason: "present" });
      continue;
    }
    const pull = runCommand("docker", ["pull", image], { timeoutMs: Number(context.timeoutMs || 900000) });
    results.push({
      image,
      status: pull.status === 0 ? INSTALL_STATUS.INSTALLED : INSTALL_STATUS.FAILED,
      mirrorRequired: pull.status !== 0,
      mirrorHint: pull.status !== 0 ? "内置镜像源不可达，请在本地下载源配置中配置镜像源后重试。" : undefined,
      commandResult: commandSummary(pull)
    });
  }
  const failed = results.filter((item) => item.status === INSTALL_STATUS.FAILED);
  return downloadResult(target.targetId, failed.length ? INSTALL_STATUS.FAILED : INSTALL_STATUS.INSTALLED, {
    before: detection,
    detection: await detectKnowledgeBackendProvider(target, context),
    sourceConfigPath: context.sourceState?.configPath || "",
    images: results
  });
}

async function downloadKnowledgeBackends(context = {}) {
  const results = [];
  for (const target of KNOWLEDGE_BACKEND_TARGETS) {
    results.push(await downloadKnowledgeBackendProvider(target, context));
  }
  const failed = results.filter((item) => item.status === INSTALL_STATUS.FAILED);
  const status = failed.length
    ? INSTALL_STATUS.FAILED
    : results.every((item) => item.status === INSTALL_STATUS.PRESENT)
      ? INSTALL_STATUS.PRESENT
      : INSTALL_STATUS.INSTALLED;
  return downloadResult("knowledge-backends", status, {
    results,
    detection: await detectKnowledgeBackends(context)
  });
}

async function downloadCloudDrives(context = {}) {
  const detection = await detectCloudDrives(context);
  return downloadResult("cloud-drives", detection.present ? INSTALL_STATUS.PRESENT : INSTALL_STATUS.FAILED, {
    detection,
    reason: detection.present ? "present_or_configured" : "cloud_drive_adapters_require_local_folder_or_oauth_authorization"
  });
}

async function downloadProgrammingRuntimes(context = {}) {
  const results = [];
  results.push(await downloadJre(context));
  results.push(await downloadPython(context));
  const failed = results.filter((item) => item.status === INSTALL_STATUS.FAILED);
  const status = failed.length
    ? INSTALL_STATUS.FAILED
    : results.every((item) => item.status === INSTALL_STATUS.PRESENT)
      ? INSTALL_STATUS.PRESENT
      : INSTALL_STATUS.INSTALLED;
  return downloadResult("programming-runtimes", status, {
    results,
    detection: await detectProgrammingRuntimes(context)
  });
}

async function downloadAll(context = {}) {
  const results = [];
  for (const targetId of TOP_LEVEL_TARGETS) {
    results.push(await downloadRuntimeDependency({ ...context, targetId }));
  }
  const failed = results.filter((item) => item.status === INSTALL_STATUS.FAILED);
  const status = failed.length
    ? INSTALL_STATUS.FAILED
    : results.every((item) => item.status === INSTALL_STATUS.PRESENT)
      ? INSTALL_STATUS.PRESENT
      : INSTALL_STATUS.INSTALLED;
  return downloadResult("all", status, {
    results,
    detection: await listRuntimeDependencies(context)
  });
}

function downloadResult(targetId, status, payload = {}) {
  const ok = status !== INSTALL_STATUS.FAILED;
  return {
    ok,
    schemaVersion: 1,
    protocolVersion: RUNTIME_DEPENDENCIES_PROTOCOL_VERSION,
    targetId,
    status,
    generatedAt: nowIso(),
    startupDownloads: false,
    triggerMode: "user-requested",
    ...payload
  };
}

export async function downloadRuntimeDependency(input = {}) {
  const targetId = normalizeTargetId(input.targetId || input.target || input.id || "");
  const sourceState = await ensureRuntimeDependencySourceConfig(input);
  const context = {
    ...input,
    sourceState,
    sourceConfig: sourceState.config,
    sourceConfigPath: sourceState.configPath,
    dryRun: input.dryRun === true || input.planOnly === true
  };
  const knowledgeTarget = knowledgeBackendTarget(targetId);
  if (knowledgeTarget) {
    return downloadKnowledgeBackendProvider(knowledgeTarget, context);
  }
  switch (targetId) {
    case "all":
      return downloadAll(context);
    case "knowledge-backends":
      return downloadKnowledgeBackends(context);
    case "cloud-drives":
      return downloadCloudDrives(context);
    case "docker":
      return downloadDocker(context);
    case "programming-runtimes":
    case "language-runtimes":
      return downloadProgrammingRuntimes(context);
    case "jre":
    case "java":
      return downloadJre(context);
    case "python":
      return downloadPython(context);
    case "caddy":
      return downloadGateway("caddy", context);
    case "nginx":
      return downloadGateway("nginx", context);
    case "gerrit":
      return downloadGerrit(context);
    default:
      throw new Error(`Unsupported runtime dependency target: ${targetId || "(empty)"}`);
  }
}
