export function createGovernanceControlMap(...controlGroups) {
  return Object.freeze(Object.fromEntries(controlGroups.map(({ objectId, controls }) => [objectId, controls])));
}
