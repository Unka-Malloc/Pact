export const SECURITY_GOVERNANCE_MODEL_VERSION = "pact.security-governance.2-3-5.v1";

export const SECURITY_BOUNDARY_IDS = Object.freeze({
  CLIENT_RUNTIME_PACT_PLATFORM: "client-runtime-pact-platform",
  EXTERNAL_SERVICE_PACT_PLATFORM: "external-service-pact-platform"
});

export const SECURITY_ENVIRONMENT_IDS = Object.freeze({
  CLIENT_RUNTIME: "client-runtime",
  PACT_PLATFORM: "pact-platform",
  EXTERNAL_SERVICE: "external-service"
});

export const SECURITY_GOVERNANCE_GOAL_IDS = Object.freeze({
  ADMISSION_IDENTITY_TRUST: "admission-identity-trust",
  PERMISSION_BEHAVIOR_POLICY: "permission-behavior-policy",
  DATA_STATE_SEMANTICS: "data-state-semantics",
  TRAFFIC_RESOURCE_COST: "traffic-resource-cost",
  AUDIT_EVIDENCE_LIFECYCLE: "audit-evidence-lifecycle"
});

export const SECURITY_GOVERNANCE_GOAL_ORDER = Object.freeze([
  SECURITY_GOVERNANCE_GOAL_IDS.ADMISSION_IDENTITY_TRUST,
  SECURITY_GOVERNANCE_GOAL_IDS.PERMISSION_BEHAVIOR_POLICY,
  SECURITY_GOVERNANCE_GOAL_IDS.DATA_STATE_SEMANTICS,
  SECURITY_GOVERNANCE_GOAL_IDS.TRAFFIC_RESOURCE_COST,
  SECURITY_GOVERNANCE_GOAL_IDS.AUDIT_EVIDENCE_LIFECYCLE
]);
