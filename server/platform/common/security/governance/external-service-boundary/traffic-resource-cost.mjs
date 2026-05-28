import { SECURITY_GOVERNANCE_GOAL_IDS } from "../security-governance-constants.mjs";

export const EXTERNAL_SERVICE_BOUNDARY_TRAFFIC_RESOURCE_COST_CONTROLS = Object.freeze({
  goalId: SECURITY_GOVERNANCE_GOAL_IDS.TRAFFIC_RESOURCE_COST,
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
