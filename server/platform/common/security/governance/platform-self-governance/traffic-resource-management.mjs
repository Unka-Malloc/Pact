import { SECURITY_GOVERNANCE_OBJECT_IDS } from "../security-governance-constants.mjs";

export const PLATFORM_SELF_GOVERNANCE_TRAFFIC_RESOURCE_MANAGEMENT_CONTROLS = Object.freeze({
  objectId: SECURITY_GOVERNANCE_OBJECT_IDS.TRAFFIC_RESOURCE_MANAGEMENT,
  controls: Object.freeze([
    "Budget Policy",
    "queue control",
    "durable workflow",
    "performance capacity gate",
    "idempotency"
  ])
});
