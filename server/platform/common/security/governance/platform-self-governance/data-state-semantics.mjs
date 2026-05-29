import { SECURITY_GOVERNANCE_OBJECT_IDS } from "../security-governance-constants.mjs";

export const PLATFORM_SELF_GOVERNANCE_DATA_STATE_SEMANTICS_CONTROLS = Object.freeze({
  objectId: SECURITY_GOVERNANCE_OBJECT_IDS.DATA_STATE_SEMANTICS,
  controls: Object.freeze([
    "Pact canonical state",
    "Operation Ledger",
    "StateCommit",
    "CAS/Merkle state",
    "Checkpoint Tree",
    "state vocabulary",
    "security recovery lifecycle"
  ])
});
