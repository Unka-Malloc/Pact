import { SECURITY_GOVERNANCE_OBJECT_IDS } from "../security-governance-constants.mjs";

export const PLATFORM_SELF_GOVERNANCE_AUDIT_FACT_VERIFICATION_CONTROLS = Object.freeze({
  objectId: SECURITY_GOVERNANCE_OBJECT_IDS.AUDIT_FACT_VERIFICATION,
  controls: Object.freeze([
    "Audit",
    "Operation Ledger",
    "Checkpoint Tree",
    "runtime logger",
    "production readiness report",
    "security recovery package"
  ])
});
