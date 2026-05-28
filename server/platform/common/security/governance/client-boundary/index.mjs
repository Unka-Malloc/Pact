import {
  SECURITY_BOUNDARY_IDS,
  createSecurityBoundaryGovernanceProfile
} from "../security-governance-model.mjs";
export { CLIENT_BOUNDARY_GOVERNANCE_CONTROLS } from "./controls.mjs";

export const CLIENT_BOUNDARY_GOVERNANCE_ID = SECURITY_BOUNDARY_IDS.CLIENT_RUNTIME_PACT_PLATFORM;

export function describeClientBoundaryGovernance() {
  return createSecurityBoundaryGovernanceProfile(CLIENT_BOUNDARY_GOVERNANCE_ID);
}

export function listClientBoundaryGovernanceControls() {
  return describeClientBoundaryGovernance().controlsByGoal;
}
