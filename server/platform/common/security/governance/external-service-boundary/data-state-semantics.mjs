import { SECURITY_GOVERNANCE_OBJECT_IDS } from "../security-governance-constants.mjs";

export const EXTERNAL_SERVICE_BOUNDARY_DATA_STATE_SEMANTICS_CONTROLS = Object.freeze({
  objectId: SECURITY_GOVERNANCE_OBJECT_IDS.DATA_STATE_SEMANTICS,
  controls: Object.freeze([
    "import semantics",
    "export semantics",
    "sync semantics",
    "mirror semantics",
    "contract-mode semantics",
    "persistence semantics",
    "version semantics",
    "credential lifecycle state",
    "connector lifecycle state",
    "mirror cleanup state"
  ])
});
