import { SECURITY_GOVERNANCE_GOAL_IDS } from "../security-governance-constants.mjs";

export const EXTERNAL_SERVICE_BOUNDARY_DATA_STATE_SEMANTICS_CONTROLS = Object.freeze({
  goalId: SECURITY_GOVERNANCE_GOAL_IDS.DATA_STATE_SEMANTICS,
  controls: Object.freeze([
    "import semantics",
    "export semantics",
    "sync semantics",
    "mirror semantics",
    "contract-mode semantics",
    "persistence semantics",
    "version semantics"
  ])
});
