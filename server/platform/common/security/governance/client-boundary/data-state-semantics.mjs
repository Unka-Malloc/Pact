import { SECURITY_GOVERNANCE_GOAL_IDS } from "../security-governance-constants.mjs";

export const CLIENT_BOUNDARY_DATA_STATE_SEMANTICS_CONTROLS = Object.freeze({
  goalId: SECURITY_GOVERNANCE_GOAL_IDS.DATA_STATE_SEMANTICS,
  controls: Object.freeze([
    "upload semantics",
    "file validation",
    "path safety",
    "context semantics",
    "export/download semantics",
    "asset lifecycle",
    "local bridge transport semantics"
  ])
});
