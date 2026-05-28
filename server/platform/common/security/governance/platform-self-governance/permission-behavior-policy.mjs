import { SECURITY_GOVERNANCE_GOAL_IDS } from "../security-governance-constants.mjs";

export const PLATFORM_SELF_GOVERNANCE_PERMISSION_BEHAVIOR_POLICY_CONTROLS = Object.freeze({
  goalId: SECURITY_GOVERNANCE_GOAL_IDS.PERMISSION_BEHAVIOR_POLICY,
  controls: Object.freeze([
    "Capability manifest",
    "Capability Kernel verify",
    "Binding Guard verify",
    "Operation Policy",
    "Tool Management",
    "risk policy"
  ])
});
