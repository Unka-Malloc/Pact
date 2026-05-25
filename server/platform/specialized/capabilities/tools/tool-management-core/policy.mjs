function nowIso() {
  return new Date().toISOString();
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

export function createToolPolicyEngine({ registry, store, securityPermissions = null }) {
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
    const authorizationDecision = (typeof securityPermissions?.evaluatePolicy === "function"
      ? securityPermissions.evaluatePolicy({
          tool,
          grant,
          profile,
          input,
          request,
          context: {
            ...context,
            toolExpected: true
          },
          dryRun,
          traceId,
          toolExecutionId,
          grantRequired: true
        })
      : null) || {
          effect: "deny",
          allowed: false,
          reasonCode: "authorization_provider_unavailable",
          redactedReason: "Security permissions provider is unavailable.",
          missingScopes: [],
          missingToolsets: [],
          evaluatedLayers: [],
          createdAt: nowIso()
        };
    const decision = {
      ...authorizationDecision,
      decisionId: `policy_${cryptoRandomSuffix()}`,
      toolExecutionId,
      traceId,
      toolId: tool?.id || "",
      grantId: grant?.id || "",
      missingScopes: uniqueStrings(authorizationDecision.missingScopes || []),
      missingToolsets: authorizationDecision.effect === "deny"
        ? uniqueStrings(authorizationDecision.missingToolsets || [])
        : [],
      evaluatedLayers: uniqueStrings([...(authorizationDecision.evaluatedLayers || []), ...evaluatedLayers]),
      createdAt: authorizationDecision.createdAt || nowIso()
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
