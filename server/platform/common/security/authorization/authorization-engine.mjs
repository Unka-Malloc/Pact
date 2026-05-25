import crypto from "node:crypto";

export const AUTHORIZATION_PROTOCOL_VERSION = "pact.authorization.v1";

const RISK_RANK = Object.freeze({
  read_only: 0,
  safe_write: 1,
  repair_write: 2,
  destructive: 3
});

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function stringSet(values = []) {
  return new Set(uniqueStrings(values));
}

function riskRank(value = "read_only") {
  return RISK_RANK[String(value || "read_only")] ?? RISK_RANK.read_only;
}

function hasConfirmation(input = {}, request = null) {
  if (input?.confirm === true || input?.confirmed === true) {
    return true;
  }
  const header = String(
    request?.headers?.["x-pact-confirm"] ||
      request?.headers?.["x-pact-safety-confirm"] ||
      ""
  ).toLowerCase();
  return ["1", "true", "yes"].includes(header);
}

function requestOrigin(request) {
  const origin = String(request?.headers?.origin || "").trim();
  if (origin) {
    return origin.replace(/\/+$/, "");
  }
  const referer = String(request?.headers?.referer || "").trim();
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return "";
    }
  }
  return "";
}

function sourceIpFromRequest(request) {
  return String(
    request?.headers?.["x-forwarded-for"] ||
      request?.socket?.remoteAddress ||
      request?.connection?.remoteAddress ||
      ""
  ).split(",")[0].trim();
}

function normalizeIp(value) {
  const text = String(value || "").trim();
  return text.startsWith("::ffff:") ? text.slice("::ffff:".length) : text;
}

function ipv4ToInt(value) {
  const parts = normalizeIp(value).split(".");
  if (parts.length !== 4) {
    return null;
  }
  let output = 0;
  for (const part of parts) {
    const number = Number(part);
    if (!Number.isInteger(number) || number < 0 || number > 255) {
      return null;
    }
    output = (output << 8) + number;
  }
  return output >>> 0;
}

function ipMatchesRule(ip, rule) {
  const normalizedRule = String(rule || "").trim();
  const normalizedIp = normalizeIp(ip);
  if (!normalizedRule) {
    return false;
  }
  if (!normalizedRule.includes("/")) {
    return normalizedIp === normalizeIp(normalizedRule);
  }
  const [base, bitsText] = normalizedRule.split("/");
  const bits = Number(bitsText);
  const ipInt = ipv4ToInt(normalizedIp);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function maxRiskAllowed(profile = null, grant = null, subject = null, fallback = "safe_write") {
  const candidates = [
    profile?.maxRisk,
    grant?.maxRisk,
    grant?.metadata?.maxRisk,
    subject?.maxRisk
  ].filter(Boolean);
  if (candidates.length === 0) {
    return fallback;
  }
  return candidates.reduce((lowest, item) =>
    riskRank(item) < riskRank(lowest) ? item : lowest
  );
}

function inferOperationAction(operation = {}, tool = null) {
  if (operation?.action) {
    return String(operation.action);
  }
  const operationId = String(operation?.id || tool?.operationId || "");
  if (!operationId) {
    return tool?.readOnly === false ? "write" : "read";
  }
  const last = operationId.split(".").filter(Boolean).pop() || "";
  if (["list", "get", "read", "download", "query", "evaluate", "preview", "history", "info"].includes(last)) {
    return "read";
  }
  return "write";
}

function operationRisk(operation = {}, tool = null) {
  return String(tool?.risk || operation?.safety?.risk || (operation?.readOnly === false ? "safe_write" : "read_only"));
}

function requiredScopesFor(operation = {}, tool = null) {
  return uniqueStrings([
    ...(Array.isArray(operation?.requiredScopes) ? operation.requiredScopes : []),
    ...(Array.isArray(tool?.requiredScopes) ? tool.requiredScopes : [])
  ]);
}

function subjectScopes(subject = {}, actor = null, authSession = null, grant = null) {
  return uniqueStrings([
    ...(Array.isArray(subject.scopes) ? subject.scopes : []),
    ...(Array.isArray(actor?.scopes) ? actor.scopes : []),
    ...(Array.isArray(actor?.user?.scopes) ? actor.user.scopes : []),
    ...(Array.isArray(authSession?.user?.scopes) ? authSession.user.scopes : []),
    ...(Array.isArray(grant?.scopes) ? grant.scopes : [])
  ]);
}

function grantHasToolset(grant = null, tool = null) {
  if (!tool || !grant?.toolsets?.length) {
    return true;
  }
  return (tool.toolsets || []).some((toolset) => grant.toolsets.includes(toolset));
}

function toolsetMisses(grant = null, tool = null) {
  if (!tool || !grant?.toolsets?.length) {
    return [];
  }
  const grantToolsets = stringSet(grant.toolsets);
  return uniqueStrings(tool.toolsets || []).filter((toolset) => !grantToolsets.has(toolset));
}

function effectDetails(effect, reasonCode, redactedReason) {
  return { effect, reasonCode, redactedReason };
}

export function resolveAuthorizationSubject({
  subject = null,
  actor = null,
  authSession = null,
  grant = null
} = {}) {
  const user = authSession?.user || actor?.user || null;
  if (subject && typeof subject === "object" && !Array.isArray(subject)) {
    return {
      type: subject.type || subject.subjectType || (grant ? "tool-grant" : user ? "console-user" : "subject"),
      subjectId: String(subject.subjectId || subject.userId || subject.id || user?.userId || grant?.id || ""),
      username: String(subject.username || user?.username || grant?.label || ""),
      roleId: String(subject.roleId || user?.roleId || ""),
      scopes: uniqueStrings(subjectScopes(subject, actor, authSession, grant)),
      agentProfileId: String(subject.agentProfileId || subject.profileId || ""),
      maxRisk: subject.maxRisk || ""
    };
  }
  if (grant) {
    return {
      type: "tool-grant",
      subjectId: String(grant.id || ""),
      username: String(grant.label || grant.id || ""),
      roleId: "tool-grant",
      scopes: uniqueStrings(grant.scopes || []),
      agentProfileId: "",
      maxRisk: grant.maxRisk || grant.metadata?.maxRisk || ""
    };
  }
  if (user) {
    return {
      type: "console-user",
      subjectId: String(user.userId || user.username || ""),
      username: String(user.username || user.userId || ""),
      roleId: String(user.roleId || ""),
      scopes: uniqueStrings(user.scopes || []),
      agentProfileId: "",
      maxRisk: ""
    };
  }
  if (actor) {
    return {
      type: actor.type || "actor",
      subjectId: String(actor.userId || actor.subjectId || actor.id || actor.username || ""),
      username: String(actor.username || actor.label || ""),
      roleId: String(actor.roleId || ""),
      scopes: uniqueStrings(actor.scopes || []),
      agentProfileId: String(actor.agentProfileId || ""),
      maxRisk: actor.maxRisk || ""
    };
  }
  return {
    type: "anonymous",
    subjectId: "",
    username: "",
    roleId: "",
    scopes: [],
    agentProfileId: "",
    maxRisk: ""
  };
}

export function evaluateAuthorizationPolicy({
  operation = {},
  tool = null,
  grant = null,
  profile = null,
  subject = null,
  actor = null,
  authSession = null,
  input = {},
  request = null,
  context = {},
  dryRun = false,
  traceId = "",
  toolExecutionId = "",
  grantRequired = false,
  enforceConfirmation = true,
  store = null
} = {}) {
  const resolvedSubject = resolveAuthorizationSubject({ subject, actor, authSession, grant });
  const requiredScopes = requiredScopesFor(operation, tool);
  const scopeSet = stringSet(resolvedSubject.scopes);
  const missingScopes = requiredScopes.filter((scope) => !scopeSet.has(scope));
  const missingToolsets = toolsetMisses(grant, tool);
  const risk = operationRisk(operation, tool);
  const evaluatedLayers = uniqueStrings([
    "authorization_subject",
    "operation_scope_policy",
    tool ? "tool_catalog_policy" : "",
    grant ? "grant_policy" : "",
    profile ? "agent_profile_policy" : "",
    "runtime_safety_policy"
  ]);
  let details = effectDetails("allow", "allowed", "Request allowed.");

  if (tool === null && context?.toolExpected === true) {
    details = effectDetails("deny", "unknown_tool", "Tool is not registered.");
  } else if (tool && tool.status !== "active") {
    details = effectDetails("deny", "tool_inactive", "Tool is inactive.");
  } else if (grantRequired && !grant) {
    details = effectDetails("deny", "missing_grant", "No grant was provided.");
  } else if (grant?.expiresAt && Date.parse(grant.expiresAt) <= Date.now()) {
    details = effectDetails("deny", "grant_expired", "Grant is expired.");
  } else if (Number(grant?.maxUses || 0) > 0 && Number(grant?.useCount || 0) >= Number(grant?.maxUses || 0)) {
    details = effectDetails("deny", "grant_max_uses", "Grant has exceeded its maximum use count.");
  } else if (
    grant?.allowedOrigins?.length > 0 &&
    (!requestOrigin(request) || !grant.allowedOrigins.map((item) => String(item || "").replace(/\/+$/, "")).includes(requestOrigin(request)))
  ) {
    details = effectDetails("deny", "origin_not_allowed", "Request origin is not allowed by grant.");
  } else if (
    grant?.allowedCidrs?.length > 0 &&
    !grant.allowedCidrs.some((rule) => ipMatchesRule(sourceIpFromRequest(request), rule))
  ) {
    details = effectDetails("deny", "cidr_not_allowed", "Request source address is not allowed by grant.");
  } else if (context?.grantRateLimited === true || context?.rateLimited === true) {
    details = effectDetails("deny", "rate_limited", "Grant rate limit has been exceeded.");
  } else if (operation?.public === true || operation?.externalAuth === true) {
    details = effectDetails("allow", "allowed_public_or_external", "Public or externally authenticated operation.");
  } else if (missingScopes.length > 0) {
    details = effectDetails("deny", "missing_scopes", "Subject is missing required scopes.");
  } else if (!grantHasToolset(grant, tool)) {
    details = effectDetails("deny", "missing_toolsets", "Grant is missing a toolset that contains this tool.");
  } else if (tool?.id && grant?.toolDeny?.includes(tool.id)) {
    details = effectDetails("deny", "tool_denied", "Grant denies this tool.");
  } else if (tool?.id && grant?.toolAllow?.length > 0 && !grant.toolAllow.includes(tool.id)) {
    details = effectDetails("deny", "tool_not_allowed", "Tool is not in the grant allowlist.");
  } else if (tool?.id && profile?.toolDeny?.includes(tool.id)) {
    details = effectDetails("deny", "profile_tool_denied", "Agent profile denies this tool.");
  } else if (tool?.id && profile?.toolAllow?.length > 0 && !profile.toolAllow.includes(tool.id)) {
    details = effectDetails("deny", "profile_tool_not_allowed", "Tool is not in the profile allowlist.");
  } else if (riskRank(risk) > riskRank(maxRiskAllowed(
    profile,
    grant,
    resolvedSubject,
    grantRequired || grant || tool ? "safe_write" : "destructive"
  ))) {
    details = effectDetails("deny", "risk_exceeds_policy", "Requested risk exceeds effective policy.");
  } else if (enforceConfirmation && (tool?.destructive || tool?.requiresApproval || operation?.safety?.requiresConfirmation) && !hasConfirmation(input, request)) {
    details = effectDetails("require_confirmation", "confirmation_required", "Request requires confirmation.");
  } else if (dryRun) {
    details = effectDetails("dry_run_only", "dry_run", "Dry-run requested.");
  }

  const decision = {
    protocolVersion: AUTHORIZATION_PROTOCOL_VERSION,
    decisionId: randomId("authz_decision"),
    toolExecutionId,
    traceId,
    operationId: String(operation?.id || tool?.operationId || ""),
    toolId: String(tool?.id || ""),
    grantId: String(grant?.id || ""),
    subject: resolvedSubject,
    resource: {
      operationId: String(operation?.id || tool?.operationId || ""),
      toolId: String(tool?.id || ""),
      feature: String(operation?.feature || tool?.featureId || ""),
      risk
    },
    action: String(input.requestedAction || context.requestedAction || inferOperationAction(operation, tool)),
    requestedEgress: String(input.requestedEgress || context.requestedEgress || ""),
    effect: details.effect,
    allowed: ["allow", "dry_run_only"].includes(details.effect),
    reasonCode: details.reasonCode,
    redactedReason: details.redactedReason,
    requiredScopes,
    subjectScopes: resolvedSubject.scopes,
    missingScopes: uniqueStrings(missingScopes),
    missingToolsets: details.effect === "deny" ? uniqueStrings(missingToolsets) : [],
    requiredApproval: details.effect === "require_approval",
    requiredConfirmation: details.effect === "require_confirmation",
    evaluatedLayers,
    createdAt: nowIso()
  };

  if (store && typeof store.appendDecision === "function") {
    store.appendDecision(decision);
  }
  return decision;
}

export function createAuthorizationEngine({ store = null } = {}) {
  return {
    protocolVersion: AUTHORIZATION_PROTOCOL_VERSION,
    resolveSubject: resolveAuthorizationSubject,
    evaluate: (input = {}) => evaluateAuthorizationPolicy({ ...input, store })
  };
}
