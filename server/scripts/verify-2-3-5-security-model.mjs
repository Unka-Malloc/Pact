import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SECURITY_BOUNDARY_IDS,
  SECURITY_ENVIRONMENT_IDS,
  SECURITY_GOVERNANCE_GOAL_IDS,
  SECURITY_GOVERNANCE_GOAL_ORDER,
  SECURITY_GOVERNANCE_MODEL_VERSION,
  assertSecurityGovernanceModelComplete
} from "../platform/common/security/governance/security-governance-model.mjs";
import {
  CLIENT_BOUNDARY_GOVERNANCE_CONTROLS,
  describeClientBoundaryGovernance
} from "../platform/common/security/governance/client-boundary/index.mjs";
import {
  EXTERNAL_SERVICE_BOUNDARY_GOVERNANCE_CONTROLS,
  describeExternalServiceBoundaryGovernance
} from "../platform/common/security/governance/external-service-boundary/index.mjs";
import {
  PLATFORM_SELF_GOVERNANCE_CONTROLS,
  describePlatformSelfGovernance
} from "../platform/common/security/governance/platform-self-governance/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), "../..");

async function readProjectFile(relativePath) {
  return fs.readFile(path.join(projectRoot, relativePath), "utf8");
}

async function assertProjectFileExists(relativePath) {
  await fs.access(path.join(projectRoot, relativePath));
}

function assertEveryGoalCovered(profile, label) {
  assert.equal(profile.goals.length, 5, `${label} must expose five governance goals`);
  assert.equal(profile.controlsByGoal.length, 5, `${label} must expose five control groups`);
  const goalIds = new Set(Object.values(SECURITY_GOVERNANCE_GOAL_IDS));
  for (const entry of profile.controlsByGoal) {
    assert.equal(goalIds.has(entry.goalId), true, `${label} has an unknown goal ${entry.goalId}`);
    assert.equal(Array.isArray(entry.controls), true, `${label} ${entry.goalId} controls must be an array`);
    assert.ok(entry.controls.length > 0, `${label} ${entry.goalId} must list real governance controls`);
  }
}

function assertControlMapCoversEveryGoal(controlMap, label) {
  assert.deepEqual(
    Object.keys(controlMap).sort(),
    [...SECURITY_GOVERNANCE_GOAL_ORDER].sort(),
    `${label} must split controls by every governance goal`
  );
  for (const goalId of SECURITY_GOVERNANCE_GOAL_ORDER) {
    assert.ok(Array.isArray(controlMap[goalId]), `${label} ${goalId} controls must be an array`);
    assert.ok(controlMap[goalId].length > 0, `${label} ${goalId} must list controls`);
  }
}

const governanceSplitFiles = [
  "server/platform/common/security/governance/security-governance-constants.mjs",
  "server/platform/common/security/governance/control-map.mjs",
  "server/platform/common/security/governance/boundaries.mjs",
  "server/platform/common/security/governance/environments.mjs",
  "server/platform/common/security/governance/goals.mjs",
  "server/platform/common/security/governance/client-boundary/controls.mjs",
  "server/platform/common/security/governance/client-boundary/admission-identity-trust.mjs",
  "server/platform/common/security/governance/client-boundary/permission-behavior-policy.mjs",
  "server/platform/common/security/governance/client-boundary/data-state-semantics.mjs",
  "server/platform/common/security/governance/client-boundary/traffic-resource-cost.mjs",
  "server/platform/common/security/governance/client-boundary/audit-evidence-lifecycle.mjs",
  "server/platform/common/security/governance/external-service-boundary/controls.mjs",
  "server/platform/common/security/governance/external-service-boundary/admission-identity-trust.mjs",
  "server/platform/common/security/governance/external-service-boundary/permission-behavior-policy.mjs",
  "server/platform/common/security/governance/external-service-boundary/data-state-semantics.mjs",
  "server/platform/common/security/governance/external-service-boundary/traffic-resource-cost.mjs",
  "server/platform/common/security/governance/external-service-boundary/audit-evidence-lifecycle.mjs",
  "server/platform/common/security/governance/platform-self-governance/controls.mjs",
  "server/platform/common/security/governance/platform-self-governance/admission-identity-trust.mjs",
  "server/platform/common/security/governance/platform-self-governance/permission-behavior-policy.mjs",
  "server/platform/common/security/governance/platform-self-governance/data-state-semantics.mjs",
  "server/platform/common/security/governance/platform-self-governance/traffic-resource-cost.mjs",
  "server/platform/common/security/governance/platform-self-governance/audit-evidence-lifecycle.mjs"
];

await Promise.all(governanceSplitFiles.map((relativePath) => assertProjectFileExists(relativePath)));

const model = assertSecurityGovernanceModelComplete();
assert.equal(model.modelVersion, SECURITY_GOVERNANCE_MODEL_VERSION);
assert.equal(model.boundaryCount, 2);
assert.equal(model.environmentCount, 3);
assert.equal(model.goalCount, 5);
assert.deepEqual(
  model.boundaries.map((boundary) => boundary.id).sort(),
  [
    SECURITY_BOUNDARY_IDS.CLIENT_RUNTIME_PACT_PLATFORM,
    SECURITY_BOUNDARY_IDS.EXTERNAL_SERVICE_PACT_PLATFORM
  ].sort()
);
assert.deepEqual(
  model.environments.map((environment) => environment.id).sort(),
  [
    SECURITY_ENVIRONMENT_IDS.CLIENT_RUNTIME,
    SECURITY_ENVIRONMENT_IDS.PACT_PLATFORM,
    SECURITY_ENVIRONMENT_IDS.EXTERNAL_SERVICE
  ].sort()
);

const clientBoundary = describeClientBoundaryGovernance();
assert.equal(clientBoundary.boundary.id, SECURITY_BOUNDARY_IDS.CLIENT_RUNTIME_PACT_PLATFORM);
assertEveryGoalCovered(clientBoundary, "client boundary governance");
assertControlMapCoversEveryGoal(CLIENT_BOUNDARY_GOVERNANCE_CONTROLS, "client boundary governance split");

const externalServiceBoundary = describeExternalServiceBoundaryGovernance();
assert.equal(externalServiceBoundary.boundary.id, SECURITY_BOUNDARY_IDS.EXTERNAL_SERVICE_PACT_PLATFORM);
assertEveryGoalCovered(externalServiceBoundary, "external service boundary governance");
assertControlMapCoversEveryGoal(EXTERNAL_SERVICE_BOUNDARY_GOVERNANCE_CONTROLS, "external service boundary governance split");

const platformSelfGovernance = describePlatformSelfGovernance();
assert.equal(platformSelfGovernance.environment.id, SECURITY_ENVIRONMENT_IDS.PACT_PLATFORM);
assertEveryGoalCovered(platformSelfGovernance, "platform self governance");
assertControlMapCoversEveryGoal(PLATFORM_SELF_GOVERNANCE_CONTROLS, "platform self governance split");

const securityModelDoc = await readProjectFile("docs/2-3-5-Security-Model.md");
const architectureDoc = await readProjectFile("docs/Architecture.md");
const decisionDoc = await readProjectFile("docs/IMPLEMENTATION-DECISION-REGISTER.md");
const planDoc = await readProjectFile("docs/V0.0.1-IMPLEMENTATION-PLAN.md");

for (const phrase of [
  "两条边界",
  "三个环境",
  "五个治理目标",
  "客户端运行环境与 Pact 平台之间的边界",
  "外部服务与 Pact 平台之间的边界",
  "准入与身份信任",
  "权限与行为策略",
  "数据与状态语义",
  "流量、资源与成本控制",
  "审计、证据与生命周期",
  "client-boundary/admission-identity-trust.mjs",
  "external-service-boundary/permission-behavior-policy.mjs",
  "platform-self-governance/audit-evidence-lifecycle.mjs",
  "server/platform/common/security/governance"
]) {
  assert.match(securityModelDoc, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `2-3-5 security model doc must mention ${phrase}`);
}

for (const [label, content] of [
  ["Architecture.md", architectureDoc],
  ["IMPLEMENTATION-DECISION-REGISTER.md", decisionDoc],
  ["V0.0.1-IMPLEMENTATION-PLAN.md", planDoc]
]) {
  assert.match(content, /两条外部边界|两条安全边界|客户端运行环境与 Pact 平台/, `${label} must mention the 2-boundary security model`);
  assert.match(content, /准入与身份信任/, `${label} must mention the 5-goal governance taxonomy`);
}

console.log("2-3-5 security governance model verifier passed");
