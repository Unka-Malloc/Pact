import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SERVER_API_OPERATIONS } from "../platform/common/operation-dispatcher/operation-registry.mjs";
import { createToolCatalog } from "../platform/specialized/agent/agent-tools/tool-management-core/catalog.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function read(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(text, needle, message) {
  assert.equal(text.includes(needle), true, message);
}

function assertAllIncludes(text, needles, file) {
  for (const needle of needles) {
    assertIncludes(text, needle, `${file} must include ${needle}`);
  }
}

async function assertGovernanceDoc() {
  const file = "docs/KNOWLEDGE-ARCHITECTURE-GOVERNANCE.md";
  const text = await read(file);

  assertAllIncludes(text, [
    "七大设计原则",
    "Single Responsibility",
    "Open-Closed",
    "Dependency Inversion",
    "Interface Segregation",
    "Explicit State",
    "Evidence-First",
    "UX-Observable Governance",
    "knowledgeBase",
    "splitall.knowledge.v1",
    "SERVER_API_OPERATIONS",
    "Tool Management v1",
    "server/config/frontend-feature-registry.yaml",
    "npm run server:verify:knowledge-architecture-governance",
    "npm run server:verify:knowledge-markdown-chunking",
    "npm run server:verify:knowledge-docx-export",
    "/knowledge/:tab",
    "/workspaces",
    "/debug/:tab",
    "/admin/tools",
    "/admin/modules",
    "raw-corpus-construction",
    "knowledge-index-construction",
    "knowledge-distillation",
    "knowledge.export.docx",
    "GET /api/knowledge/export/docx",
    "external-knowledge-corpus",
    "knowledge.docx-export.download",
    "knowledge.normalized-docx.download",
    "词云属于知识管理辅助视图",
    "Markdown 文档切分基线",
    "markdown-section-v1",
    "sectionId",
    "sourceRange"
  ], file);

  assertAllIncludes(text, [
    "Composition Root",
    "Provider Registry",
    "Facade",
    "Adapter",
    "Strategy",
    "Policy",
    "Observer",
    "State Machine"
  ], file);
}

async function assertProtocolDocs() {
  const protocols = await read("docs/PROTOCOLS.md");
  const server = await read("docs/SERVER.md");
  const patterns = await read("docs/ARCHITECTURE-PATTERNS.md");

  assertAllIncludes(protocols, [
    "server/protocols/knowledge/",
    "splitall.knowledge.v1",
    "knowledgeBase",
    "KnowledgeCore",
    "EmbeddingRuntime",
    "VectorStore",
    "assetStore",
    "retrieval",
    "metadata/splitall.sqlite",
    "knowledge.search",
    "knowledge.export.docx",
    "knowledge.document.structure",
    "GET /api/knowledge/export/docx",
    "Tool Management v1",
    "knowledge:read",
    "knowledge:write",
    "knowledge:maintain",
    "knowledge:admin"
  ], "docs/PROTOCOLS.md");

  assertAllIncludes(protocols, [
    "server/platform/specialized/knowledge/storage/external-knowledge-base/index.mjs",
    "qdrant",
    "opensearch",
    "pgvector",
    "SPLITALL_EXTERNAL_KB_PROVIDER"
  ], "docs/PROTOCOLS.md");

  assertAllIncludes(server, [
    "knowledgeBase",
    "KnowledgeCore",
    "splitall.knowledge.v1",
    "mount-modules.json",
    "热插拔",
    "热切换",
    "热重载",
    "knowledge-core/knowledge.sqlite",
    "knowledge-core/assets/",
    "GET /api/knowledge/assets/:assetId",
    "GET /api/knowledge/export/docx",
    "knowledge export-docx --output knowledge.docx",
    "evidence pack",
    "DocumentOutlineRuntime"
  ], "docs/SERVER.md");

  assertAllIncludes(server, [
    "server/platform/specialized/knowledge/storage/external-knowledge-base/index.mjs",
    "SPLITALL_SERVER_KNOWLEDGE_BASE_MODULE",
    "SPLITALL_EXTERNAL_KB_PROVIDER",
    "SPLITALL_EXTERNAL_KB_CONNECTION_STRING"
  ], "docs/SERVER.md");

  assertAllIncludes(patterns, [
    "docs/KNOWLEDGE-ARCHITECTURE-GOVERNANCE.md",
    "npm run server:verify:knowledge-architecture-governance",
    "Adapter",
    "Facade",
    "Strategy",
    "Provider Registry",
    "Observer",
    "State Machine",
    "Policy",
    "组合根"
  ], "docs/ARCHITECTURE-PATTERNS.md");
}

function assertOperationRegistry() {
  const byId = new Map(SERVER_API_OPERATIONS.map((operation) => [operation.id, operation]));
  const requiredIds = [
    "knowledge.capabilities",
    "knowledge.console",
    "knowledge.health",
    "knowledge.search",
    "knowledge.search.get",
    "knowledge.export_docx",
    "knowledge.document_structure",
    "knowledge.evidence",
    "knowledge.asset",
    "knowledge.render_markdown",
    "knowledge.maintenance.get",
    "knowledge.maintenance.run",
    "knowledge.review_items",
    "knowledge.review_resolve",
    "knowledge.feedback",
    "knowledge.learning.health",
    "knowledge.evidence_gate.evaluate",
    "knowledge.summarization.runs.create",
    "knowledge.agent_explore.runs.create",
    "runtime.mounts",
    "runtime.set_mounts",
    "runtime.reload_mounts",
    "tool_management.catalog",
    "tool_management.policy_preview",
    "tool_management.execute",
    "tool_management.audit",
    "tool_management.metrics_summary"
  ];

  for (const id of requiredIds) {
    assert.ok(byId.has(id), `operation registry must include ${id}`);
    const operation = byId.get(id);
    assert.ok(operation.http || operation.rpc || operation.cli, `${id} must expose at least one public surface`);
  }

  const knowledgeOperations = SERVER_API_OPERATIONS.filter((operation) => operation.id.startsWith("knowledge."));
  assert.ok(knowledgeOperations.length >= 50, "operation registry must expose a broad knowledge capability surface");

  for (const operation of knowledgeOperations) {
    assert.equal(operation.feature, "knowledge", `${operation.id} must be owned by the knowledge feature`);
    assert.ok(operation.http || operation.rpc || operation.cli, `${operation.id} must expose HTTP, RPC, or CLI`);
    assert.ok(
      Array.isArray(operation.requiredScopes) && operation.requiredScopes.length > 0,
      `${operation.id} must declare requiredScopes`
    );
  }

  assert.deepEqual(byId.get("runtime.set_mounts")?.requiredScopes, ["runtime:admin"]);
  assert.deepEqual(byId.get("runtime.reload_mounts")?.requiredScopes, ["runtime:admin"]);
  assert.equal(byId.get("knowledge.asset")?.binary, true, "knowledge.asset must keep binary asset semantics");
  assert.equal(byId.get("knowledge.export_docx")?.binary, true, "knowledge.export_docx must keep DOCX binary semantics");
  assert.equal(byId.get("knowledge.export_docx")?.http?.path, "/api/knowledge/export/docx");
  assert.equal(byId.get("knowledge.export_docx")?.rpc?.method, "knowledge.export.docx");
  assert.equal(byId.get("tool_management.execute")?.http?.path, "/api/tool-management/v1/execute");
  assert.equal(byId.get("tool_management.execute")?.safety?.risk, "safe_write");
}

function assertToolManagementCatalog() {
  const catalog = createToolCatalog({ operations: SERVER_API_OPERATIONS });
  const tool = catalog.tools.find((item) => item.id === "splitall.knowledge.exportDocx");
  assert.ok(tool, "Tool Management catalog must include splitall.knowledge.exportDocx");
  assert.equal(tool.operationId, "knowledge.export_docx");
  assert.deepEqual(tool.requiredScopes, ["knowledge:read"]);
  assert.equal(tool.outputSchema?.type, "binary");
  assert.equal(tool.transport?.http?.path, "/api/knowledge/export/docx");
}

async function assertFrontendCoverage() {
  const registry = await read("server/config/frontend-feature-registry.yaml");
  const router = await read("server-web/router/index.ts");
  const bridge = await read("server-web/lib/bridge.ts");
  const knowledgeView = await read("server-web/views/KnowledgeView.vue");
  const workspacesView = await read("server-web/views/WorkspacesView.vue");
  const debugView = await read("server-web/views/DebugView.vue");
  const toolsView = await read("server-web/views/admin/ToolsView.vue");
  const modulesView = await read("server-web/views/admin/ModulesView.vue");
  const consoleComposable = await read("server-web/composables/useConsole.ts");

  assertAllIncludes(registry, [
    "workspace.knowledge-context",
    "knowledge.governance-console",
    "debug.knowledge-governance",
    "admin.tool-management-governance",
    "admin.knowledge-mount-governance",
    "knowledge.tab.chunking",
    "knowledge.document-chunking",
    "knowledge.docx-export.download",
    "knowledge.normalized-docx.download",
    "knowledge.console.inspect",
    "debug.knowledge-recall.compare",
    "admin.tools.policy.evaluate",
    "admin.modules.knowledge-mount.configure"
  ], "server/config/frontend-feature-registry.yaml");

  assertAllIncludes(router, [
    'path: "/knowledge/:tab"',
    'path: "/workspaces"',
    'path: "/debug/:tab"',
    'path: "/admin/tools"',
    'path: "/admin/modules"'
  ], "server-web/router/index.ts");

  assertAllIncludes(bridge, [
    "searchKnowledge",
    "getKnowledgeEvidence",
    "knowledgeAssetUrl",
    "knowledgeDocxExportUrl",
    "/api/knowledge/export/docx",
    "saveRuntimeMounts",
    "reloadRuntimeMounts",
    "getToolManagementCatalog",
    "getClientRuntimeStatus"
  ], "server-web/lib/bridge.ts");

  assertAllIncludes(knowledgeView, [
    "knowledgeTab === 'management'",
    "knowledgeTab === 'chunking'",
    "knowledgeTab === 'wordCloud'",
    "knowledgeTab === 'conflicts'",
    "knowledgeTab === 'maintenance'",
    "导出 DOCX",
    "knowledgeDocxExportUrl",
    "normalizedDocumentUrl"
  ], "server-web/views/KnowledgeView.vue");

  assertAllIncludes(workspacesView, [
    "knowledgeScope",
    "knowledgeSourceIds",
    "/api/agent-workspaces",
    "/context"
  ], "server-web/views/WorkspacesView.vue");

  assertAllIncludes(debugView, [
    "knowledgeRecall",
    "agentRetrieval",
    "runKnowledgeRecallDebugBatch",
    "runKnowledgeAgentExplore",
    "openAgentEvidencePreview"
  ], "server-web/views/DebugView.vue");

  assertAllIncludes(toolsView, [
    "toolManagementCatalogState",
    "toolManagementTools",
    "toolManagementProfiles",
    "tool-policy-preview",
    "toolGrants"
  ], "server-web/views/admin/ToolsView.vue");

  assertAllIncludes(modulesView, [
    "mountDraft",
    "moduleGroups",
    "enableMountModule",
    "disableMountModule",
    "mountGeneration"
  ], "server-web/views/admin/ModulesView.vue");

  assertAllIncludes(consoleComposable, [
    "knowledgeBase",
    "saveRuntimeMounts",
    "reloadRuntimeMounts",
    "enableMountModule",
    "disableMountModule"
  ], "server-web/composables/useConsole.ts");
}

async function main() {
  await assertGovernanceDoc();
  await assertProtocolDocs();
  assertOperationRegistry();
  assertToolManagementCatalog();
  await assertFrontendCoverage();
}

await main();
console.log("knowledge architecture governance verification passed");
