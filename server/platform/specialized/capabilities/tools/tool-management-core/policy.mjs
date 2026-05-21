const RISK_RANK = Object.freeze({
  read_only: 0,
  safe_write: 1,
  repair_write: 2,
  destructive: 3
});

function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function hasConfirmation(input = {}, request = null) {
  if (input?.confirm === true || input?.confirmed === true) {
    return true;
  }
  const header = String(
    request?.headers?.["x-agentstudio-confirm"] ||
      request?.headers?.["x-agentstudio-safety-confirm"] ||
      ""
  ).toLowerCase();
  return ["1", "true", "yes"].includes(header);
}

function maxRiskAllowed(profile = null, grant = null) {
  const candidates = [
    profile?.maxRisk,
    grant?.maxRisk,
    grant?.metadata?.maxRisk
  ].filter(Boolean);
  if (candidates.length === 0) {
    return "safe_write";
  }
  return candidates.reduce((lowest, item) =>
    RISK_RANK[item] < RISK_RANK[lowest] ? item : lowest
  );
}

export function createToolPolicyEngine({ registry, store }) {
  function evaluate({
    tool,
    grant = null,
    profile = null,
    input = {},
    request = null,
    context = {},
    dryRun = false,
    traceId = "",
    toolExecutionId = ""
  } = {}) {
    const evaluatedLayers = [
      "platform_default",
      "server_policy",
      grant ? "grant_policy" : "",
      profile ? "agent_profile_policy" : "",
      "session_task_policy",
      "runtime_safety_policy"
    ].filter(Boolean);
    const missingScopes = tool?.requiredScopes?.filter((scope) => !grant?.scopes?.includes(scope)) || [];
    const missingToolsets = tool?.toolsets?.filter((toolset) => !grant?.toolsets?.includes(toolset)) || [];
    const grantHasToolset = !tool || !grant?.toolsets?.length || tool.toolsets?.some((toolset) => grant.toolsets.includes(toolset));
    let effect = "allow";
    let reasonCode = "allowed";
    let redactedReason = "Tool call allowed.";

    if (!tool) {
      effect = "deny";
      reasonCode = "unknown_tool";
      redactedReason = "Tool is not registered.";
    } else if (tool.status !== "active") {
      effect = "deny";
      reasonCode = "tool_inactive";
      redactedReason = "Tool is inactive.";
    } else if (!grant) {
      effect = "deny";
      reasonCode = "missing_grant";
      redactedReason = "No tool grant was provided.";
    } else if (missingScopes.length > 0) {
      effect = "deny";
      reasonCode = "missing_scopes";
      redactedReason = "Grant is missing required scopes.";
    } else if (!grantHasToolset) {
      effect = "deny";
      reasonCode = "missing_toolsets";
      redactedReason = "Grant is missing a toolset that contains this tool.";
    } else if (grant.toolDeny?.includes(tool.id)) {
      effect = "deny";
      reasonCode = "tool_denied";
      redactedReason = "Grant denies this tool.";
    } else if (grant.toolAllow?.length > 0 && !grant.toolAllow.includes(tool.id)) {
      effect = "deny";
      reasonCode = "tool_not_allowed";
      redactedReason = "Tool is not in the grant allowlist.";
    } else if (profile?.toolDeny?.includes(tool.id)) {
      effect = "deny";
      reasonCode = "profile_tool_denied";
      redactedReason = "Agent profile denies this tool.";
    } else if (profile?.toolAllow?.length > 0 && !profile.toolAllow.includes(tool.id)) {
      effect = "deny";
      reasonCode = "profile_tool_not_allowed";
      redactedReason = "Tool is not in the profile allowlist.";
    } else if (RISK_RANK[tool.risk] > RISK_RANK[maxRiskAllowed(profile, grant)]) {
      effect = "deny";
      reasonCode = "risk_exceeds_policy";
      redactedReason = "Tool risk exceeds effective policy.";
    } else if ((tool.destructive || tool.requiresApproval) && !hasConfirmation(input, request)) {
      effect = "require_confirmation";
      reasonCode = "confirmation_required";
      redactedReason = "Tool requires confirmation.";
    } else if (dryRun) {
      effect = "dry_run_only";
      reasonCode = "dry_run";
      redactedReason = "Dry-run requested.";
    }

    const decision = {
      decisionId: `policy_${cryptoRandomSuffix()}`,
      toolExecutionId,
      traceId,
      toolId: tool?.id || "",
      grantId: grant?.id || "",
      effect,
      reasonCode,
      missingScopes: uniqueStrings(missingScopes),
      missingToolsets: effect === "deny" ? uniqueStrings(missingToolsets) : [],
      requiredApproval: effect === "require_approval",
      requiredConfirmation: effect === "require_confirmation",
      evaluatedLayers,
      redactedReason,
      createdAt: nowIso()
    };

    if (store) {
      store.appendPolicyDecision(decision);
    }
    return decision;
  }

  function preview(input = {}) {
    const tool = registry.getTool(input.toolId);
    const grant = input.grantId ? store.getRawGrant(input.grantId) : input.grant || null;
    const profile = input.profileId
      ? registry.listProfiles().find((item) => item.id === input.profileId)
      : input.profile || null;
    return evaluate({
      tool,
      grant,
      profile,
      input: input.input || {},
      context: input.context || {},
      dryRun: input.dryRun === true
    });
  }

  return {
    evaluate,
    preview
  };
}

function cryptoRandomSuffix() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
