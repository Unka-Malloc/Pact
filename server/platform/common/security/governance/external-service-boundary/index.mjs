import {
  SECURITY_BOUNDARY_IDS,
  createSecurityBoundaryGovernanceProfile
} from "../security-governance-model.mjs";
export { EXTERNAL_SERVICE_BOUNDARY_GOVERNANCE_CONTROLS } from "./controls.mjs";

export const EXTERNAL_SERVICE_BOUNDARY_GOVERNANCE_ID = SECURITY_BOUNDARY_IDS.SERVER_API_EGRESS;

export function describeExternalServiceBoundaryGovernance() {
  return createSecurityBoundaryGovernanceProfile(EXTERNAL_SERVICE_BOUNDARY_GOVERNANCE_ID);
}

export function listExternalServiceBoundaryGovernanceControls() {
  return describeExternalServiceBoundaryGovernance().controlsByObject;
}
