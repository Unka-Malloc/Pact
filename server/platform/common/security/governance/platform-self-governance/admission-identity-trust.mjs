import { SECURITY_GOVERNANCE_GOAL_IDS } from "../security-governance-constants.mjs";

export const PLATFORM_SELF_GOVERNANCE_ADMISSION_IDENTITY_TRUST_CONTROLS = Object.freeze({
  goalId: SECURITY_GOVERNANCE_GOAL_IDS.ADMISSION_IDENTITY_TRUST,
  controls: Object.freeze([
    "Console Auth",
    "SecretStore",
    "Binding Guard",
    "Capability Kernel",
    "credential redaction"
  ])
});
