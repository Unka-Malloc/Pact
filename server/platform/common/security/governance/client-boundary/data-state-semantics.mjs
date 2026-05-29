import { SECURITY_GOVERNANCE_OBJECT_IDS } from "../security-governance-constants.mjs";

export const CLIENT_BOUNDARY_DATA_STATE_SEMANTICS_CONTROLS = Object.freeze({
  objectId: SECURITY_GOVERNANCE_OBJECT_IDS.DATA_STATE_SEMANTICS,
  controls: Object.freeze([
    "upload semantics",
    "file validation",
    "path safety",
    "context semantics",
    "export/download semantics",
    "asset lifecycle",
    "client lifecycle state",
    "local bridge transport semantics"
  ])
});
