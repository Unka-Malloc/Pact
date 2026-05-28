export function createGovernanceControlMap(...controlGroups) {
  return Object.freeze(Object.fromEntries(controlGroups.map(({ goalId, controls }) => [goalId, controls])));
}
