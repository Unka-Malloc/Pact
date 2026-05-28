import { SECURITY_GOVERNANCE_GOAL_IDS } from "../security-governance-constants.mjs";

export const EXTERNAL_SERVICE_BOUNDARY_PERMISSION_BEHAVIOR_POLICY_CONTROLS = Object.freeze({
  goalId: SECURITY_GOVERNANCE_GOAL_IDS.PERMISSION_BEHAVIOR_POLICY,
  controls: Object.freeze([
    "provider scope mapping",
    "external side effect policy",
    "destructive operation policy",
    "provider object scope",
    "write target policy",
    "model policy",
    "connector conformance"
  ])
});
