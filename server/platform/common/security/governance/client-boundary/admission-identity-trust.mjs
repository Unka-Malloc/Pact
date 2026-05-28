import { SECURITY_GOVERNANCE_GOAL_IDS } from "../security-governance-constants.mjs";

export const CLIENT_BOUNDARY_ADMISSION_IDENTITY_TRUST_CONTROLS = Object.freeze({
  goalId: SECURITY_GOVERNANCE_GOAL_IDS.ADMISSION_IDENTITY_TRUST,
  controls: Object.freeze([
    "client registration",
    "agent identity",
    "user/operator identity",
    "device/runtime identity",
    "MCP grant",
    "opaque key binding",
    "token/session rotation",
    "discovery trust"
  ])
});
