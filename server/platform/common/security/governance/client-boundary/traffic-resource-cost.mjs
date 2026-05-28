import { SECURITY_GOVERNANCE_GOAL_IDS } from "../security-governance-constants.mjs";

export const CLIENT_BOUNDARY_TRAFFIC_RESOURCE_COST_CONTROLS = Object.freeze({
  goalId: SECURITY_GOVERNANCE_GOAL_IDS.TRAFFIC_RESOURCE_COST,
  controls: Object.freeze([
    "QPS/burst",
    "concurrency",
    "upload bandwidth",
    "storage quota",
    "context quota",
    "runtime distribution",
    "retry/backoff"
  ])
});
