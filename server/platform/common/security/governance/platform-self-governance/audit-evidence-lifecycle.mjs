import { SECURITY_GOVERNANCE_GOAL_IDS } from "../security-governance-constants.mjs";

export const PLATFORM_SELF_GOVERNANCE_AUDIT_EVIDENCE_LIFECYCLE_CONTROLS = Object.freeze({
  goalId: SECURITY_GOVERNANCE_GOAL_IDS.AUDIT_EVIDENCE_LIFECYCLE,
  controls: Object.freeze([
    "Audit",
    "Operation Ledger",
    "Checkpoint Tree",
    "runtime logger",
    "production readiness report",
    "security recovery package"
  ])
});
