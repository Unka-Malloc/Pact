import { SECURITY_GOVERNANCE_OBJECT_IDS } from "../security-governance-constants.mjs";

export const CLIENT_BOUNDARY_TRAFFIC_RESOURCE_MANAGEMENT_CONTROLS = Object.freeze({
  objectId: SECURITY_GOVERNANCE_OBJECT_IDS.TRAFFIC_RESOURCE_MANAGEMENT,
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
