import { createPlatformSelfGovernanceProfile } from "../security-governance-model.mjs";
export { PLATFORM_SELF_GOVERNANCE_CONTROLS } from "./controls.mjs";

export function describePlatformSelfGovernance() {
  return createPlatformSelfGovernanceProfile();
}

export function listPlatformSelfGovernanceControls() {
  return describePlatformSelfGovernance().controlsByGoal;
}
