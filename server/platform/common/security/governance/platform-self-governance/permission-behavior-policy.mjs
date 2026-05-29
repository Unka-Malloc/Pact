import { SECURITY_GOVERNANCE_OBJECT_IDS } from "../security-governance-constants.mjs";

export const PLATFORM_SELF_GOVERNANCE_PERMISSION_BEHAVIOR_POLICY_CONTROLS = Object.freeze({
  objectId: SECURITY_GOVERNANCE_OBJECT_IDS.PERMISSION_BEHAVIOR_POLICY,
  controls: Object.freeze([
    "Capability manifest",
    "Capability Kernel verify",
    "Binding Guard verify",
    "Operation Policy",
    "Tool Management",
    "risk policy"
  ])
});
