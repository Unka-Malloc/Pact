import { SECURITY_GOVERNANCE_OBJECT_IDS } from "../security-governance-constants.mjs";

export const CLIENT_BOUNDARY_AUDIT_FACT_VERIFICATION_CONTROLS = Object.freeze({
  objectId: SECURITY_GOVERNANCE_OBJECT_IDS.AUDIT_FACT_VERIFICATION,
  controls: Object.freeze([
    "access receipt",
    "loan record",
    "denied request",
    "trace/log redaction",
    "checkpoint node",
    "recovery evidence"
  ])
});
