const MCP_PLUGIN_CONNECTION = {
  kind: "mcp-plugin",
  method: "MCP 插件连接"
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compactText(value) {
  return String(value || "").trim();
}

function slugText(value, fallback = "target") {
  const normalized = compactText(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function isMcpPluginGrant(grant) {
  const metadata = asObject(grant?.metadata);
  return (
    compactText(grant?.type) === "mcp-client" ||
    compactText(metadata.issuedBy) === "pact-mcp-local-pairing"
  );
}

function mcpGrantTargets(grant) {
  const metadata = asObject(grant?.metadata);
  const targets = asArray(metadata.targets).map(compactText).filter(Boolean);
  if (targets.length > 0) {
    return targets;
  }
  const label = compactText(grant?.label).replace(/\s*\(MCP Client\)\s*$/i, "");
  return [label || compactText(grant?.id) || "MCP 插件"];
}

function isMcpGrantTargetUninstalled(grant, target) {
  const metadata = asObject(grant?.metadata);
  const uninstalledTargets = asArray(metadata.uninstalledTargets).map(compactText).filter(Boolean);
  if (uninstalledTargets.includes(compactText(target))) {
    return true;
  }
  return metadata.currentDeviceVisible === false && Boolean(compactText(metadata.uninstalledAt));
}

function mcpGrantConnectionState(grant, { offlineAfterSeconds = 300 } = {}) {
  if (compactText(grant?.revokedAt)) {
    return { state: "revoked", label: "已撤销", migrationState: "offline" };
  }
  if (grant?.enabled === false) {
    return { state: "disabled", label: "停用", migrationState: "offline" };
  }

  const lastUsedAt = compactText(grant?.lastUsedAt);
  if (!lastUsedAt) {
    return { state: "offline", label: "离线", migrationState: "offline" };
  }

  const ageSeconds = Math.max(0, Math.floor((Date.now() - new Date(lastUsedAt).getTime()) / 1000));
  if (!Number.isFinite(ageSeconds) || ageSeconds > Math.max(30, Number(offlineAfterSeconds) || 300)) {
    return { state: "offline", label: "离线", migrationState: "offline" };
  }

  return { state: "connected", label: "在线", migrationState: "unknown" };
}

export function buildToolManagementClientConnectionRows(
  toolManagementPlatform,
  { offlineAfterSeconds = 300 } = {}
) {
  const listGrants = toolManagementPlatform?.store?.listGrants;
  if (typeof listGrants !== "function") {
    return [];
  }

  try {
    return listGrants.call(toolManagementPlatform.store, { includeRevoked: true })
      .filter(isMcpPluginGrant)
      .flatMap((grant) => {
        const connection = mcpGrantConnectionState(grant, { offlineAfterSeconds });
        const metadata = asObject(grant.metadata);
        const targets = mcpGrantTargets(grant).filter((target) => !isMcpGrantTargetUninstalled(grant, target));
        return targets.map((target, index) => {
          const targetKey = targets.length > 1 ? `${slugText(target)}-${index + 1}` : slugText(target);
          const lastSeenAt = compactText(grant.lastUsedAt || grant.updatedAt || grant.createdAt);
          return {
            clientId: `mcp:${grant.id}:${targetKey}`,
            clientLabel: target || grant.label || grant.id,
            appVersion: compactText(metadata.connectorVersion),
            platform: "MCP 插件",
            hostname: target || "",
            bootstrapUrl: "",
            currentServiceUrl: "",
            desiredServiceUrl: "",
            currentJobServiceUrl: "",
            configVersion: "",
            migrationState: connection.migrationState,
            connectionKind: MCP_PLUGIN_CONNECTION.kind,
            connectionMethod: MCP_PLUGIN_CONNECTION.method,
            connectionState: connection.state,
            connectionStatusLabel: connection.label,
            connectionDetail: "Tool Management 授权",
            supportsMigration: false,
            sourceGrantId: grant.id,
            busy: false,
            lastJobId: "",
            lastError: "",
            firstSeenAt: compactText(grant.createdAt),
            lastSeenAt,
            lastSeenServerId: compactText(metadata.serverId)
          };
        });
      });
  } catch {
    return [];
  }
}
