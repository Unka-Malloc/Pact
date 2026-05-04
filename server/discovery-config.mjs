import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  atomicWriteJson,
  queueStateMutation,
  waitForStateIdle
} from "./application/state-coordinator.mjs";

const DEFAULT_DISCOVERY_CONFIG = {
  serverId: "",
  serverLabel: "",
  bootstrapBaseUrl: "",
  advertisedBaseUrl: "",
  activeServiceUrl: "",
  forwardBaseUrl: "",
  mode: "active",
  configVersion: "",
  refreshIntervalSeconds: 15,
  checkInIntervalSeconds: 30,
  offlineAfterSeconds: 300
};

export function getDiscoveryConfigPath(userDataPath) {
  return path.join(userDataPath, "discovery.json");
}

function discoveryStateKey(userDataPath) {
  return `discovery:${path.resolve(userDataPath)}`;
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function normalizeMode(value) {
  return value === "forward" ? "forward" : "active";
}

function normalizeDiscoveryConfig(config = {}, context = {}) {
  const listenUrl = normalizeBaseUrl(context.listenUrl);
  const advertisedBaseUrl = normalizeBaseUrl(
    config.advertisedBaseUrl || listenUrl || DEFAULT_DISCOVERY_CONFIG.advertisedBaseUrl
  );
  const bootstrapBaseUrl = normalizeBaseUrl(
    config.bootstrapBaseUrl || advertisedBaseUrl
  );
  const activeServiceUrl = normalizeBaseUrl(
    config.activeServiceUrl || advertisedBaseUrl
  );
  const forwardBaseUrl = normalizeBaseUrl(config.forwardBaseUrl);
  const mode = normalizeMode(config.mode);

  return {
    serverId: String(config.serverId || context.serverId || randomUUID()).trim(),
    serverLabel: String(config.serverLabel || context.serverLabel || os.hostname() || "SplitAll")
      .trim(),
    bootstrapBaseUrl,
    advertisedBaseUrl,
    activeServiceUrl,
    forwardBaseUrl,
    mode,
    configVersion: String(
      config.configVersion || context.configVersion || new Date().toISOString()
    ).trim(),
    refreshIntervalSeconds: normalizePositiveInteger(
      config.refreshIntervalSeconds,
      DEFAULT_DISCOVERY_CONFIG.refreshIntervalSeconds
    ),
    checkInIntervalSeconds: normalizePositiveInteger(
      config.checkInIntervalSeconds,
      DEFAULT_DISCOVERY_CONFIG.checkInIntervalSeconds
    ),
    offlineAfterSeconds: normalizePositiveInteger(
      config.offlineAfterSeconds,
      DEFAULT_DISCOVERY_CONFIG.offlineAfterSeconds
    )
  };
}

async function loadDiscoveryConfigUnlocked(userDataPath) {
  const configPath = getDiscoveryConfigPath(userDataPath);

  try {
    const content = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(content);
    return normalizeDiscoveryConfig(parsed);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    return normalizeDiscoveryConfig();
  }
}

export async function loadDiscoveryConfig(userDataPath) {
  await waitForStateIdle(discoveryStateKey(userDataPath));
  return loadDiscoveryConfigUnlocked(userDataPath);
}

async function saveDiscoveryConfigUnlocked(userDataPath, incomingConfig, context = {}) {
  const configPath = getDiscoveryConfigPath(userDataPath);
  const current = await loadDiscoveryConfigUnlocked(userDataPath);
  const merged = normalizeDiscoveryConfig(
    {
      ...current,
      ...(incomingConfig || {})
    },
    context
  );

  await atomicWriteJson(configPath, merged, { trailingNewline: false });
  return merged;
}

export async function saveDiscoveryConfig(userDataPath, incomingConfig, context = {}) {
  return queueStateMutation(discoveryStateKey(userDataPath), () =>
    saveDiscoveryConfigUnlocked(userDataPath, incomingConfig, context)
  );
}

export async function resolveDiscoveryState(userDataPath, context = {}) {
  const saved = await loadDiscoveryConfig(userDataPath);
  return normalizeDiscoveryConfig(
    {
      ...saved,
      ...(context.overrides || {})
    },
    context
  );
}

export function buildBootstrapPayload(discoveryState) {
  return {
    ok: true,
    serverId: discoveryState.serverId,
    serverLabel: discoveryState.serverLabel,
    bootstrapBaseUrl: discoveryState.bootstrapBaseUrl,
    advertisedBaseUrl: discoveryState.advertisedBaseUrl,
    activeServiceUrl: discoveryState.activeServiceUrl,
    forwardBaseUrl: discoveryState.forwardBaseUrl,
    mode: discoveryState.mode,
    configVersion: discoveryState.configVersion,
    refreshIntervalSeconds: discoveryState.refreshIntervalSeconds,
    checkInIntervalSeconds: discoveryState.checkInIntervalSeconds,
    offlineAfterSeconds: discoveryState.offlineAfterSeconds,
    migrationRequired:
      Boolean(discoveryState.activeServiceUrl) &&
      discoveryState.activeServiceUrl !== discoveryState.advertisedBaseUrl
  };
}
