import {
  SECURITY_BOUNDARY_IDS,
  SECURITY_ENVIRONMENT_IDS,
  SECURITY_GOVERNANCE_OBJECT_ORDER,
  SECURITY_GOVERNANCE_MODEL_VERSION
} from "./security-governance-constants.mjs";
import { SECURITY_BOUNDARIES } from "./boundaries.mjs";
import { SECURITY_ENVIRONMENTS } from "./environments.mjs";
import { SECURITY_GOVERNANCE_OBJECTS } from "./objects.mjs";
import { CLIENT_BOUNDARY_GOVERNANCE_CONTROLS } from "./client-boundary/controls.mjs";
import { EXTERNAL_SERVICE_BOUNDARY_GOVERNANCE_CONTROLS } from "./external-service-boundary/controls.mjs";
import { PLATFORM_SELF_GOVERNANCE_CONTROLS } from "./platform-self-governance/controls.mjs";

export {
  SECURITY_BOUNDARY_IDS,
  SECURITY_ENVIRONMENT_IDS,
  SECURITY_GOVERNANCE_OBJECT_IDS,
  SECURITY_GOVERNANCE_OBJECT_ORDER,
  SECURITY_GOVERNANCE_MODEL_VERSION
} from "./security-governance-constants.mjs";
export { SECURITY_BOUNDARIES } from "./boundaries.mjs";
export { SECURITY_ENVIRONMENTS } from "./environments.mjs";
export { SECURITY_GOVERNANCE_OBJECTS } from "./objects.mjs";
export { PLATFORM_SELF_GOVERNANCE_CONTROLS } from "./platform-self-governance/controls.mjs";

export const CLIENT_BOUNDARY_CONTROLS = CLIENT_BOUNDARY_GOVERNANCE_CONTROLS;
export const EXTERNAL_SERVICE_BOUNDARY_CONTROLS = EXTERNAL_SERVICE_BOUNDARY_GOVERNANCE_CONTROLS;

const BOUNDARY_CONTROLS = Object.freeze({
  [SECURITY_BOUNDARY_IDS.CLIENT_MCP_INGRESS]: CLIENT_BOUNDARY_CONTROLS,
  [SECURITY_BOUNDARY_IDS.SERVER_API_EGRESS]: EXTERNAL_SERVICE_BOUNDARY_CONTROLS
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function controlsForObject(controlMap, objectId) {
  return Array.isArray(controlMap?.[objectId]) ? [...controlMap[objectId]] : [];
}

export function listSecurityGovernanceBoundaries() {
  return clone(SECURITY_BOUNDARIES);
}

export function listSecurityGovernanceEnvironments() {
  return clone(SECURITY_ENVIRONMENTS);
}

export function listSecurityGovernanceObjects() {
  return clone(SECURITY_GOVERNANCE_OBJECTS);
}

export function getSecurityGovernanceBoundary(boundaryId = "") {
  return clone(SECURITY_BOUNDARIES.find((boundary) => boundary.id === boundaryId) || null);
}

export function getSecurityGovernanceEnvironment(environmentId = "") {
  return clone(SECURITY_ENVIRONMENTS.find((environment) => environment.id === environmentId) || null);
}

export function governanceControlsForBoundary(boundaryId = "") {
  const controlMap = BOUNDARY_CONTROLS[boundaryId];
  if (!controlMap) {
    return [];
  }
  return SECURITY_GOVERNANCE_OBJECT_ORDER.map((objectId) => ({
    objectId,
    controls: controlsForObject(controlMap, objectId)
  }));
}

export function platformSelfGovernanceControls() {
  return SECURITY_GOVERNANCE_OBJECT_ORDER.map((objectId) => ({
    objectId,
    controls: controlsForObject(PLATFORM_SELF_GOVERNANCE_CONTROLS, objectId)
  }));
}

export function createSecurityBoundaryGovernanceProfile(boundaryId = "") {
  const boundary = getSecurityGovernanceBoundary(boundaryId);
  if (!boundary) {
    throw new Error(`Unknown security governance boundary: ${boundaryId}`);
  }
  return {
    modelVersion: SECURITY_GOVERNANCE_MODEL_VERSION,
    boundary,
    objects: listSecurityGovernanceObjects(),
    controlsByObject: governanceControlsForBoundary(boundaryId)
  };
}

export function createPlatformSelfGovernanceProfile() {
  return {
    modelVersion: SECURITY_GOVERNANCE_MODEL_VERSION,
    environment: getSecurityGovernanceEnvironment(SECURITY_ENVIRONMENT_IDS.PLATFORM_RUNTIME),
    objects: listSecurityGovernanceObjects(),
    controlsByObject: platformSelfGovernanceControls()
  };
}

export function describeSecurityGovernanceModel() {
  return {
    modelVersion: SECURITY_GOVERNANCE_MODEL_VERSION,
    boundaryCount: SECURITY_BOUNDARIES.length,
    environmentCount: SECURITY_ENVIRONMENTS.length,
    objectCount: SECURITY_GOVERNANCE_OBJECTS.length,
    boundaries: listSecurityGovernanceBoundaries(),
    environments: listSecurityGovernanceEnvironments(),
    objects: listSecurityGovernanceObjects(),
    boundaryProfiles: SECURITY_BOUNDARIES.map((boundary) => createSecurityBoundaryGovernanceProfile(boundary.id)),
    platformSelfGovernance: createPlatformSelfGovernanceProfile()
  };
}

export function assertSecurityGovernanceModelComplete() {
  const errors = [];
  if (SECURITY_BOUNDARIES.length !== 2) {
    errors.push(`Expected 2 security boundaries, got ${SECURITY_BOUNDARIES.length}.`);
  }
  if (SECURITY_ENVIRONMENTS.length !== 3) {
    errors.push(`Expected 3 security environments, got ${SECURITY_ENVIRONMENTS.length}.`);
  }
  if (SECURITY_GOVERNANCE_OBJECTS.length !== 5) {
    errors.push(`Expected 5 security governance objects, got ${SECURITY_GOVERNANCE_OBJECTS.length}.`);
  }
  for (const boundary of SECURITY_BOUNDARIES) {
    const controls = BOUNDARY_CONTROLS[boundary.id];
    if (!controls) {
      errors.push(`Missing controls for security boundary ${boundary.id}.`);
      continue;
    }
    for (const objectId of SECURITY_GOVERNANCE_OBJECT_ORDER) {
      if (controlsForObject(controls, objectId).length === 0) {
        errors.push(`Boundary ${boundary.id} is missing controls for object ${objectId}.`);
      }
    }
  }
  for (const objectId of SECURITY_GOVERNANCE_OBJECT_ORDER) {
    if (controlsForObject(PLATFORM_SELF_GOVERNANCE_CONTROLS, objectId).length === 0) {
      errors.push(`Platform self governance is missing controls for object ${objectId}.`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Security governance model is incomplete:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
  return describeSecurityGovernanceModel();
}
