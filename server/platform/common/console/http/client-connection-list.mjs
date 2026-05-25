const PACT_CLIENT_CONNECTION = {
  kind: "pact-client",
  method: "pact-client 封装",
  state: "active",
  statusLabel: ""
};

const MCP_PLUGIN_CONNECTION = {
  kind: "mcp-plugin"
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactText(value) {
  return String(value || "").trim();
}

function normalizePactClientRow(item) {
  const migrationState = compactText(item.migrationState) || "unknown";
  return {
    ...item,
    connectionKind: compactText(item.connectionKind) || PACT_CLIENT_CONNECTION.kind,
    connectionMethod: compactText(item.connectionMethod) || PACT_CLIENT_CONNECTION.method,
    connectionState: compactText(item.connectionState) || (migrationState === "offline" ? "offline" : PACT_CLIENT_CONNECTION.state),
    connectionStatusLabel: compactText(item.connectionStatusLabel) || PACT_CLIENT_CONNECTION.statusLabel,
    supportsMigration: item.supportsMigration !== false
  };
}

function buildClientConnectionSummary(items) {
  return {
    totalCount: items.length,
    alignedCount: items.filter((item) => item.migrationState === "aligned").length,
    outdatedCount: items.filter((item) => item.migrationState === "outdated").length,
    drainingCount: items.filter((item) => item.migrationState === "draining").length,
    bootstrapOnlyCount: items.filter((item) => item.migrationState === "bootstrap-only").length,
    offlineCount: items.filter((item) => item.migrationState === "offline").length,
    unknownCount: items.filter((item) => item.migrationState === "unknown").length,
    pactClientCount: items.filter((item) => item.connectionKind === PACT_CLIENT_CONNECTION.kind).length,
    mcpPluginCount: items.filter((item) => item.connectionKind === MCP_PLUGIN_CONNECTION.kind).length,
    migratableCount: items.filter((item) => item.supportsMigration !== false).length
  };
}

export function buildClientConnectionList(clientRegistrations, additionalConnectionRows = []) {
  const pactClientRows = asArray(clientRegistrations?.items).map(normalizePactClientRow);
  const mcpRows = asArray(additionalConnectionRows);
  const items = [...pactClientRows, ...mcpRows].sort((left, right) =>
    compactText(right.lastSeenAt).localeCompare(compactText(left.lastSeenAt))
  );
  return {
    summary: buildClientConnectionSummary(items),
    items
  };
}
