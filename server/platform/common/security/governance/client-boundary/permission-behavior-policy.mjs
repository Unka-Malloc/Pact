import { SECURITY_GOVERNANCE_GOAL_IDS } from "../security-governance-constants.mjs";

export const CLIENT_BOUNDARY_PERMISSION_BEHAVIOR_POLICY_CONTROLS = Object.freeze({
  goalId: SECURITY_GOVERNANCE_GOAL_IDS.PERMISSION_BEHAVIOR_POLICY,
  controls: Object.freeze([
    "operation permission",
    "tool/skill permission",
    "workspace scope",
    "dataClass policy",
    "egress policy",
    "high-risk confirmation",
    "capability discovery",
    "deny semantics"
  ])
});
