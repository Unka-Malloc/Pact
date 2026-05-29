import { SECURITY_GOVERNANCE_OBJECT_IDS } from "../security-governance-constants.mjs";

export const EXTERNAL_SERVICE_BOUNDARY_AUDIT_FACT_VERIFICATION_CONTROLS = Object.freeze({
  objectId: SECURITY_GOVERNANCE_OBJECT_IDS.AUDIT_FACT_VERIFICATION,
  controls: Object.freeze([
    "provider receipt",
    "webhook evidence",
    "compliance retention",
    "external failure evidence"
  ])
});
