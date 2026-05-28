import { SECURITY_GOVERNANCE_GOAL_IDS } from "../security-governance-constants.mjs";

export const EXTERNAL_SERVICE_BOUNDARY_AUDIT_EVIDENCE_LIFECYCLE_CONTROLS = Object.freeze({
  goalId: SECURITY_GOVERNANCE_GOAL_IDS.AUDIT_EVIDENCE_LIFECYCLE,
  controls: Object.freeze([
    "provider receipt",
    "webhook evidence",
    "credential lifecycle",
    "connector lifecycle",
    "mirror cleanup",
    "compliance retention",
    "external failure evidence"
  ])
});
