import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

function assertTextIncludes(text, needle, message) {
  assert.equal(text.includes(needle), true, message);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertTextExcludes(text, needles, file) {
  const found = needles.filter((needle) =>
    new RegExp(`\\b${escapeRegExp(needle)}\\b`).test(text)
  );
  assert.deepEqual(found, [], `${file} must keep platform assembly behind the composition root`);
}

async function assertHttpServerUsesCompositionRoot() {
  const file = "server/services/server-runtime/http-server.mjs";
  const text = await read(file);
  assertTextIncludes(
    text,
    "createServerCompositionRoot",
    "server/services/server-runtime/http-server.mjs must create its runtime through the composition root"
  );
  assertTextIncludes(
    text,
    "ensureConsoleOwner",
    "server/services/server-runtime/http-server.mjs must delegate owner bootstrapping to the composition root helper"
  );
  assertTextIncludes(
    text,
    "createServerRuntimeProviders",
    "server/services/server-runtime/http-server.mjs must create feature runtime services through the provider registry"
  );
  assertTextExcludes(
    text,
    [
      "createOptionalRuntime",
      "createPlatformRegistry",
      "registerCorePlatformServices",
      "registerSecurityPlatformServices",
      "registerDataStructurePlatformServices",
      "registerModuleManagementPlatformServices",
      "registerStoragePlatformServices",
      "registerDevopsPlatformServices",
      "createConsoleAuth",
      "createOperationAuditStore",
      "createServerRuntime",
      "createProtocolEventBus",
      "resolveFeatureRuntimeFromEnv",
      "filterOperationsForFeatures",
      "publicFeatureRuntime",
      "SERVER_API_OPERATIONS"
    ],
    file
  );
}

async function assertCompositionRootOwnsAssembly() {
  const file = "server/platform/interactive/composition-root.mjs";
  const text = await read(file);
  for (const needle of [
    "createPlatformRegistry",
    "registerCorePlatformServices",
    "registerSecurityPlatformServices",
    "registerDataStructurePlatformServices",
    "registerModuleManagementPlatformServices",
    "registerStoragePlatformServices",
    "registerDevopsPlatformServices",
    "createConsoleAuth",
    "createOperationAuditStore",
    "createServerRuntime",
    "createProtocolEventBus",
    "resolveFeatureRuntimeFromEnv",
    "filterOperationsForFeatures",
    "publicFeatureRuntime",
    "SERVER_API_OPERATIONS"
  ]) {
    assertTextIncludes(text, needle, `${file} must own ${needle}`);
  }
}

async function assertRuntimeProvidersOwnProviderImports() {
  const file = "server/platform/interactive/server-runtime-providers.mjs";
  const text = await read(file);
  for (const needle of [
    "createProvider",
    "createServerRuntimeProviders",
    "maintenance-agent-runbooks",
    "knowledge-distillation",
    "agent-exploration",
    "await import(specifier)"
  ]) {
    assertTextIncludes(text, needle, `${file} must own runtime provider selection`);
  }
}

async function assertCoreArchitectureDocsCoverMainline() {
  const architectureFile = "docs/Architecture.md";
  const workspaceFile = "docs/WORKSPACE-ASSET-GOVERNANCE.md";
  const protocolsFile = "docs/PROTOCOLS.md";
  const architecture = await read(architectureFile);
  const workspace = await read(workspaceFile);
  const protocols = await read(protocolsFile);

  for (const needle of [
    "Team Workspace Asset Governance System",
    "中间狭窄地带",
    "两个问题，一个能力，三个兼容",
    "知识库缺少面向智能体的权限管控",
    "本地智能体相对独立，难以协同",
    "工作空间管理",
    "智能体兼容",
    "信息源兼容",
    "工作空间环境兼容",
    "资产贡献统计报表",
    "上游知识库太粗",
    "下游本地智能体太细",
    "权限精加工",
    "共享工作空间",
    "AgentLibrary",
    "图书馆",
    "资产是主体",
    "不信任智能体",
    "权限从源头治理",
    "图书馆",
    "derivedKnowledgeSpace",
    "上游知识库的信息和资源权限再分配",
    "authorizationOverlay",
    "上游知识库 A/B 权限再授权演示",
    "对话页面",
    "权限错误",
    "公共工作空间",
    "终端贡献是第二信息源",
    "ContributionRegistry",
    "SkillLibrary",
    "LeaderboardRuntime",
    "Operation Ledger",
    "Checkpoint Tree",
    "统一 Checkpoint Tree",
    "所有访问请求",
    "所有文件变动",
    "所有知识贡献",
    "所有技能调用",
    "checkpointNodeId",
    "effectKind",
    "恢复到此节点",
    "git worktree",
    "Context Compiler",
    "OpenClaw",
    "OpenClaw 文档互通演示",
    "Skill 贡献排行榜演示",
    "AgentStudio MCP service",
    "rankScoreV0",
    "usageCount * successRate",
    "A2A",
    "MCP",
    "不复制外部实现代码"
  ]) {
    assertTextIncludes(architecture, needle, `${architectureFile} must keep workspace-first architecture evidence for ${needle}`);
  }

  for (const needle of [
    "Workspace Asset Governance System",
    "中间狭窄地带",
    "两个问题，一个能力，三个兼容",
    "知识库缺少面向智能体的权限管控",
    "本地智能体相对独立，难以协同",
    "智能体兼容",
    "信息源兼容",
    "工作空间环境兼容",
    "上游知识库太粗",
    "下游本地智能体太细",
    "终端贡献型资产",
    "排行榜与统计面板",
    "资产贡献统计报表",
    "assetContributionReportV0",
    "贡献授权",
    "演示场景：OpenClaw 文档互通",
    "演示场景：Skill 贡献排行榜",
    "workspace.contribution.submit",
    "workspace.skill.list",
    "rankScoreV0",
    "usageCount * successRate",
    "goldenRule",
    "expertOpinion",
    "Operation Ledger",
    "统一 Checkpoint Tree",
    "所有的一切都必须进入同一棵树",
    "访问请求",
    "文件变动",
    "知识贡献",
    "技能调用",
    "checkpointNode",
    "effectKind",
    "Snapshot Boundary",
    "演示场景：Checkpoint Tree 安全恢复",
    "workspace.checkpoint.restore",
    "恢复到此节点",
    "git worktree",
    "Proposal To Decision",
    "资产门禁模型",
    "knowledgeAccessReceipt",
    "loanRecord",
    "上游知识库隔离",
    "上游知识库的信息和资源权限再分配",
    "upstreamKnowledgeRef",
    "authorizationOverlay",
    "演示场景：上游知识库 A/B 权限再授权",
    "管控台",
    "权限错误",
    "readInPlace",
    "checkoutAllowed",
    "Context Compiler",
    "智能体不能直接覆盖 canonical state"
  ]) {
    assertTextIncludes(workspace, needle, `${workspaceFile} must keep asset governance evidence for ${needle}`);
  }

  for (const needle of [
    "agentstudio.workspace.v1",
    "agentstudio.operation.v1",
    "agentstudio.knowledge.v1",
    "agentstudio.context-bundle.v1",
    "agentstudio.knowledge-access.v1",
    "agentstudio.agent-library.v1",
    "agentstudio.workspace-contribution.v1",
    "Middle Layer Strategy",
    "Compatibility Strategy",
    "两个问题，一个能力，三个兼容",
    "智能体兼容",
    "信息源兼容",
    "工作空间环境兼容",
    "AgentStudio 管理软件",
    "上游资源经过 AgentStudio 后变细",
    "下游本地智能体经过 AgentStudio 后能共享部分资产和能力",
    "Workspace Contribution Protocol",
    "contributionGrant",
    "rankScore",
    "assetContributionReportV0",
    "workspaceId/contributions/report",
    "agentstudio.checkpoint-tree.v1",
    "Unified Checkpoint Tree Protocol",
    "checkpointNodeId",
    "effectKind",
    "access.requested",
    "access.denied",
    "file.changed",
    "skill.invoked",
    "workspace.checkpoint.restore.preview",
    "workspace.operation.revert.scope",
    "checkpoint.restored",
    "git worktree",
    "MCP Demo Flows",
    "AgentStudio MCP service",
    "OpenClaw 文档互通演示",
    "Skill 贡献排行榜演示",
    "workspace.skill.usage.report",
    "rankScoreV0",
    "usageCount * successRate",
    "Knowledge Access Protocol",
    "knowledgeAccessReceipt",
    "loanRecord",
    "upstreamKnowledgeRef",
    "derivedViewRef",
    "upstreamAccessDenied",
    "Upstream Permission Demo Flow",
    "上游知识库 A/B 权限再授权演示",
    "requestedEgress=exportFile",
    "权限错误",
    "denied request audit",
    "A2A adapter",
    "MCP server",
    "OpenAI-compatible model gateway"
  ]) {
    assertTextIncludes(protocols, needle, `${protocolsFile} must keep protocol adapter evidence for ${needle}`);
  }
}

async function main() {
  await assertHttpServerUsesCompositionRoot();
  await assertCompositionRootOwnsAssembly();
  await assertRuntimeProvidersOwnProviderImports();
  await assertCoreArchitectureDocsCoverMainline();
}

await main();
console.log("architecture-patterns verification passed");
