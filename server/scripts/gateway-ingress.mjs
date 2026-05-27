#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DIRECT_BASE_URL,
  DEFAULT_GATEWAY_ADAPTER,
  DEFAULT_GATEWAY_BASE_URL,
  getDefaultGatewayRuntimeCacheRoot,
  listGatewayAdapters,
  normalizeGatewayIngressProfile,
  renderGatewayConfig,
  resolveGatewayRuntimePlan,
  validateGatewayIngressPlan
} from "../platform/specialized/capabilities/agent-ingress/traffic-gateway/index.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

function parseArgs(argv = []) {
  const args = { _: [] };
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
    if (inlineValue !== null) {
      args[key] = inlineValue;
    } else if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function printUsageAndExit(code = 0) {
  console.log(`Pact Agent Traffic Gateway

Usage:
  node server/scripts/gateway-ingress.mjs list
  node server/scripts/gateway-ingress.mjs plan [--gateway caddy|nginx]
  node server/scripts/gateway-ingress.mjs render --gateway caddy|nginx
  node server/scripts/gateway-ingress.mjs write --gateway caddy|nginx|all [--output DIR]
  node server/scripts/gateway-ingress.mjs switch --gateway caddy|nginx|direct
  node server/scripts/gateway-ingress.mjs runtime-plan --gateway caddy|nginx
  node server/scripts/gateway-ingress.mjs runtime-pull --gateway caddy|nginx [--runtime-url URL|--runtime-binary PATH]
  node server/scripts/gateway-ingress.mjs verify --gateway caddy|nginx

Options:
  --gateway             Gateway adapter. Default: ${DEFAULT_GATEWAY_ADAPTER}
  --direct-base-url     Direct Pact endpoint kept as required fallback. Default: ${DEFAULT_DIRECT_BASE_URL}
  --public-base-url     Gateway public endpoint. Default: ${DEFAULT_GATEWAY_BASE_URL}
  --upstream            Upstream Pact endpoints, comma-separated. Default: direct-base-url
  --listen-host         Gateway listen host. Default: public-base-url host
  --listen-port         Gateway listen port. Default: public-base-url port
  --server-name         Nginx server_name / Caddy host label. Default: public-base-url host
  --max-body-size       Upload/request limit passed to gateway config. Default: 512m
  --stream-timeout      SSE/MCP/upload read timeout. Default: 3600s
  --runtime-cache-dir   Local runtime cache root. Default: ${getDefaultGatewayRuntimeCacheRoot()}
  --runtime-binary      Existing gateway binary to copy into the local cache
  --runtime-url         Runtime artifact URL to pull into the local cache
  --output              Output directory. Default: runtime-cache-dir/configs
  --json                Print JSON for list/plan/verify
  --help                Show this message
`);
  process.exit(code);
}

function profileInputFromArgs(args = {}, gatewayOverride = "") {
  return {
    adapterId: gatewayOverride || args.gateway,
    directBaseUrl: args["direct-base-url"],
    publicBaseUrl: args["public-base-url"],
    upstream: args.upstream,
    maxBodySize: args["max-body-size"],
    streamTimeout: args["stream-timeout"],
    listen: {
      host: args["listen-host"],
      port: args["listen-port"],
      serverName: args["server-name"]
    }
  };
}

function defaultOutputRoot(args = {}) {
  return path.resolve(String(args.output || path.join(defaultRuntimeCacheRoot(args), "configs")));
}

function defaultRuntimeCacheRoot(args = {}) {
  return path.resolve(String(args["runtime-cache-dir"] || getDefaultGatewayRuntimeCacheRoot()));
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function writeGatewayArtifacts(args = {}, adapterId) {
  const rendered = renderGatewayConfig(profileInputFromArgs(args, adapterId));
  const root = path.join(defaultOutputRoot(args), rendered.adapterId);
  await fs.mkdir(root, { recursive: true });
  const configPath = path.join(root, rendered.fileName);
  const profilePath = path.join(root, "gateway-profile.json");
  const routeManifestPath = path.join(root, "route-manifest.json");
  await fs.writeFile(configPath, rendered.config, "utf8");
  await fs.writeFile(profilePath, `${JSON.stringify(rendered.profile, null, 2)}\n`, "utf8");
  await fs.writeFile(routeManifestPath, `${JSON.stringify(rendered.routeManifest, null, 2)}\n`, "utf8");
  return {
    adapterId: rendered.adapterId,
    configPath,
    profilePath,
    routeManifestPath
  };
}

async function writeActiveGatewayPointer(args = {}, adapterId) {
  const root = defaultOutputRoot(args);
  await fs.mkdir(root, { recursive: true });
  const profile = normalizeGatewayIngressProfile(profileInputFromArgs(args, adapterId));
  const activePath = path.join(root, "active-gateway.json");
  await fs.writeFile(
    activePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        activeAdapterId: profile.gatewayMode.adapterId,
        publicBaseUrl: profile.gatewayMode.publicBaseUrl,
        directBaseUrl: profile.directMode.baseUrl,
        configDir: path.join(root, profile.gatewayMode.adapterId),
        directModeRequired: true,
        gatewayCanBeRemoved: true
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return activePath;
}

async function writeDirectGatewayPointer(args = {}) {
  const root = defaultOutputRoot(args);
  await fs.mkdir(root, { recursive: true });
  const profile = normalizeGatewayIngressProfile(profileInputFromArgs(args, DEFAULT_GATEWAY_ADAPTER));
  const activePath = path.join(root, "active-gateway.json");
  await fs.writeFile(
    activePath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        activeAdapterId: "direct",
        publicBaseUrl: profile.directMode.baseUrl,
        directBaseUrl: profile.directMode.baseUrl,
        configDir: null,
        directModeRequired: true,
        gatewayCanBeRemoved: true
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return activePath;
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function commandExists(command) {
  const which = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(which, args, { encoding: "utf8", shell: process.platform !== "win32" });
  return result.status === 0 ? String(result.stdout || "").trim().split(/\r?\n/)[0] : "";
}

async function downloadFile(url, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.download`;
  await new Promise((resolve, reject) => {
    const child = spawn("curl", ["-L", "--fail", "--retry", "3", "--connect-timeout", "20", "-o", tempPath, url], {
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Gateway runtime download failed: ${url}`));
        return;
      }
      resolve();
    });
  });
  await fs.rename(tempPath, targetPath);
}

async function installGatewayRuntime(args = {}) {
  const plan = resolveGatewayRuntimePlan({
    adapterId: args.gateway,
    cacheRoot: defaultRuntimeCacheRoot(args),
    runtimeBinary: args["runtime-binary"],
    runtimeUrl: args["runtime-url"],
    platform: args.platform
  });
  await fs.mkdir(plan.binDir, { recursive: true });

  let source = "";
  let sourceType = "";
  if (plan.configuredBinary) {
    source = plan.configuredBinary;
    sourceType = "configured-binary";
  } else if (await fileExists(plan.cachedExecutablePath)) {
    return {
      ...plan,
      sourceType: "local-cache",
      executablePath: plan.cachedExecutablePath,
      installed: false
    };
  } else {
    const systemBinary = commandExists(plan.executableName);
    if (systemBinary) {
      source = systemBinary;
      sourceType = "path";
    }
  }

  if (source) {
    await fs.copyFile(source, plan.cachedExecutablePath);
    await fs.chmod(plan.cachedExecutablePath, 0o755).catch(() => {});
    return {
      ...plan,
      sourceType,
      executablePath: plan.cachedExecutablePath,
      installed: true
    };
  }

  if (plan.runtimeUrl) {
    const archivePath = path.join(plan.runtimeRoot, "downloads", path.basename(new URL(plan.runtimeUrl).pathname) || `${plan.adapterId}-runtime`);
    await downloadFile(plan.runtimeUrl, archivePath);
    return {
      ...plan,
      sourceType: "runtime-url",
      artifactPath: archivePath,
      executablePath: "",
      installed: true,
      note: "Runtime artifact was cached. Extract it or pass --runtime-binary for executable installation."
    };
  }

  return {
    ...plan,
    sourceType: "missing",
    executablePath: "",
    installed: false,
    note: "No configured binary, cached runtime, PATH binary, or runtime URL was available."
  };
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0] || "plan";

if (args.help || command === "help") {
  printUsageAndExit(0);
}

if (command === "list") {
  const adapters = listGatewayAdapters();
  if (args.json) {
    printJson({ adapters });
  } else {
    for (const adapter of adapters) {
      console.log(`${adapter.adapterId}\t${adapter.fileName}`);
    }
  }
  process.exit(0);
}

if (command === "plan") {
  const profile = normalizeGatewayIngressProfile(profileInputFromArgs(args));
  printJson(profile);
  process.exit(0);
}

if (command === "runtime-plan") {
  const plan = resolveGatewayRuntimePlan({
    adapterId: args.gateway,
    cacheRoot: defaultRuntimeCacheRoot(args),
    runtimeBinary: args["runtime-binary"],
    runtimeUrl: args["runtime-url"],
    platform: args.platform
  });
  printJson({
    ...plan,
    cached: await fileExists(plan.cachedExecutablePath),
    pathBinary: commandExists(plan.executableName)
  });
  process.exit(0);
}

if (command === "runtime-pull") {
  const result = await installGatewayRuntime(args);
  printJson(result);
  process.exit(result.sourceType === "missing" ? 1 : 0);
}

if (command === "render") {
  const rendered = renderGatewayConfig(profileInputFromArgs(args));
  if (args.json) {
    printJson(rendered);
  } else {
    process.stdout.write(rendered.config);
  }
  process.exit(0);
}

if (command === "verify") {
  const report = validateGatewayIngressPlan(profileInputFromArgs(args));
  if (args.json) {
    printJson(report);
  } else if (report.ok) {
    console.log(`[gateway-ingress] ${report.adapterId} ok (${report.routeCount} routes)`);
  } else {
    console.error(report.failures.join("\n"));
  }
  process.exit(report.ok ? 0 : 1);
}

if (command === "write" || command === "switch") {
  const requestedGateway = String(args.gateway || DEFAULT_GATEWAY_ADAPTER).trim().toLowerCase();
  if (command === "switch" && requestedGateway === "direct") {
    const activePath = await writeDirectGatewayPointer(args);
    const report = {
      outputRoot: defaultOutputRoot(args),
      activePath,
      written: []
    };
    if (args.json) {
      printJson(report);
    } else {
      console.log(`Switched active gateway pointer to direct mode: ${activePath}`);
    }
    process.exit(0);
  }
  const adapters =
    requestedGateway === "all"
      ? listGatewayAdapters().map((adapter) => adapter.adapterId)
      : [requestedGateway];
  const written = [];
  for (const adapterId of adapters) {
    written.push(await writeGatewayArtifacts(args, adapterId));
  }
  const activeAdapterId = requestedGateway === "all" ? DEFAULT_GATEWAY_ADAPTER : requestedGateway;
  const activePath = await writeActiveGatewayPointer(args, activeAdapterId);
  const report = {
    outputRoot: defaultOutputRoot(args),
    activePath,
    written
  };
  if (args.json) {
    printJson(report);
  } else {
    console.log(`Wrote gateway ingress artifacts under ${report.outputRoot}`);
    console.log(`Active gateway pointer: ${activePath}`);
    for (const item of written) {
      console.log(`${item.adapterId}: ${path.relative(repoRoot, item.configPath)}`);
    }
  }
  process.exit(0);
}

console.error(`Unknown gateway-ingress command: ${command}`);
printUsageAndExit(1);
