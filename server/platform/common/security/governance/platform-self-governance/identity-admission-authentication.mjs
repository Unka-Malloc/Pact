import { SECURITY_GOVERNANCE_OBJECT_IDS } from "../security-governance-constants.mjs";

export const PLATFORM_SELF_GOVERNANCE_IDENTITY_ADMISSION_AUTHENTICATION_CONTROLS = Object.freeze({
  objectId: SECURITY_GOVERNANCE_OBJECT_IDS.IDENTITY_ADMISSION_AUTHENTICATION,
  controls: Object.freeze([
    "Console Auth",
    "SecretStore",
    "Binding Guard",
    "Capability Kernel",
    "credential redaction"
  ])
});
