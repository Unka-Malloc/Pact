import { SECURITY_GOVERNANCE_GOAL_IDS } from "../security-governance-constants.mjs";

export const EXTERNAL_SERVICE_BOUNDARY_ADMISSION_IDENTITY_TRUST_CONTROLS = Object.freeze({
  goalId: SECURITY_GOVERNANCE_GOAL_IDS.ADMISSION_IDENTITY_TRUST,
  controls: Object.freeze([
    "provider registration",
    "provider account",
    "OAuth/PAT/API key/service account",
    "credential status",
    "tenant mapping",
    "webhook identity",
    "provider capability declaration"
  ])
});
