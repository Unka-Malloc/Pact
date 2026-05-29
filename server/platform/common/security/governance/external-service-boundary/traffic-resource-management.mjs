import { SECURITY_GOVERNANCE_OBJECT_IDS } from "../security-governance-constants.mjs";

export const EXTERNAL_SERVICE_BOUNDARY_TRAFFIC_RESOURCE_MANAGEMENT_CONTROLS = Object.freeze({
  objectId: SECURITY_GOVERNANCE_OBJECT_IDS.TRAFFIC_RESOURCE_MANAGEMENT,
  controls: Object.freeze([
    "provider rate limit",
    "circuit breaker",
    "model cost",
    "API cost",
    "sync frequency",
    "batch policy",
    "external retry"
  ])
});
