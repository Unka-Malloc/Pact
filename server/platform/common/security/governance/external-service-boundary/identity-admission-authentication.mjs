import { SECURITY_GOVERNANCE_OBJECT_IDS } from "../security-governance-constants.mjs";

export const EXTERNAL_SERVICE_BOUNDARY_IDENTITY_ADMISSION_AUTHENTICATION_CONTROLS = Object.freeze({
  objectId: SECURITY_GOVERNANCE_OBJECT_IDS.IDENTITY_ADMISSION_AUTHENTICATION,
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
