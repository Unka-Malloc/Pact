import { SECURITY_GOVERNANCE_OBJECT_IDS } from "../security-governance-constants.mjs";

export const CLIENT_BOUNDARY_IDENTITY_ADMISSION_AUTHENTICATION_CONTROLS = Object.freeze({
  objectId: SECURITY_GOVERNANCE_OBJECT_IDS.IDENTITY_ADMISSION_AUTHENTICATION,
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
