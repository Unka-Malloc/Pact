import { SECURITY_GOVERNANCE_GOAL_IDS } from "../security-governance-constants.mjs";

export const CLIENT_BOUNDARY_AUDIT_EVIDENCE_LIFECYCLE_CONTROLS = Object.freeze({
  goalId: SECURITY_GOVERNANCE_GOAL_IDS.AUDIT_EVIDENCE_LIFECYCLE,
  controls: Object.freeze([
    "access receipt",
    "loan record",
    "denied request",
    "trace/log redaction",
    "checkpoint node",
    "client lifecycle",
    "recovery evidence"
  ])
});
