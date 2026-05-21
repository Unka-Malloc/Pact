import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TOOL_MANAGEMENT_API_PREFIX = "/api/tool-management/v1";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENTITY_CONFIG_ROOT = path.resolve(MODULE_DIR, "../../../../../config/entity-config/tools");

function loadEntityConfigList(kind, fallback = []) {
  const directory = path.join(ENTITY_CONFIG_ROOT, kind);
  let entries = [];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return fallback;
  }
  const items = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === "manifest.json") {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        items.push(parsed);
      }
    } catch (error) {
      throw new Error(`Invalid tool entity config ${filePath}: ${error.message}`);
    }
  }
  if (!items.length) {
    return fallback;
  }
  return items.sort((left, right) => String(left.id || "").localeCompare(String(right.id || "")));
}

const DEFAULT_TOOL_MANAGEMENT_SCOPES = Object.freeze([
  {
    id: "knowledge:read",
    label: "Read knowledge",
    description: "Search and read knowledge items, evidence, graph, skills, and agent context."
  },
  {
    id: "knowledge:write",
    label: "Write knowledge proposals",
    description: "Submit feedback, proposals, summaries, locks, and other non-admin knowledge changes."
  },
  {
    id: "knowledge:maintain",
    label: "Maintain knowledge",
    description: "Run review, learning, evaluation, evolution, and maintenance tasks."
  },
  {
    id: "knowledge:admin",
    label: "Administer knowledge",
    description: "Modify knowledge and context runtime settings."
  },
  {
    id: "storage:read",
    label: "Read storage",
    description: "Read server storage summaries."
  },
  {
    id: "jobs:read",
    label: "Read jobs",
    description: "Read job lists and job details."
  },
  {
    id: "agent_sync:publish",
    label: "Publish agent sync",
    description: "Publish policy-filtered agent sync events."
  }
]);

const DEFAULT_TOOL_MANAGEMENT_TOOLSETS = Object.freeze([
  {
    id: "agentstudio.knowledge.read",
    label: "Knowledge read",
    requiredScopes: ["knowledge:read"],
    maxRisk: "read_only",
    grantable: true,
    defaultForAgents: true
  },
  {
    id: "agentstudio.knowledge.write",
    label: "Knowledge write",
    requiredScopes: ["knowledge:read", "knowledge:write"],
    maxRisk: "safe_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "agentstudio.knowledge.maintain",
    label: "Knowledge maintenance",
    requiredScopes: ["knowledge:read", "knowledge:write", "knowledge:maintain"],
    maxRisk: "repair_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "agentstudio.knowledge.admin",
    label: "Knowledge admin",
    requiredScopes: ["knowledge:read", "knowledge:write", "knowledge:maintain", "knowledge:admin"],
    maxRisk: "repair_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "agentstudio.storage.read",
    label: "Storage read",
    requiredScopes: ["storage:read"],
    maxRisk: "read_only",
    grantable: true,
    defaultForAgents: true
  },
  {
    id: "agentstudio.jobs.read",
    label: "Jobs read",
    requiredScopes: ["jobs:read"],
    maxRisk: "read_only",
    grantable: true,
    defaultForAgents: true
  },
  {
    id: "agentstudio.document.parse",
    label: "Document parse",
    requiredScopes: ["knowledge:read"],
    maxRisk: "read_only",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "agentstudio.document.convert",
    label: "Document convert",
    requiredScopes: ["knowledge:write"],
    maxRisk: "safe_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "agentstudio.mail.import",
    label: "Mail import",
    requiredScopes: ["knowledge:write"],
    maxRisk: "safe_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "agentstudio.result.export",
    label: "Result export",
    requiredScopes: ["knowledge:read"],
    maxRisk: "read_only",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "agentstudio.agent.workspace",
    label: "Agent workspace",
    requiredScopes: ["knowledge:read", "knowledge:write"],
    maxRisk: "safe_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "agentstudio.agent.sync.publish",
    label: "Agent sync publish",
    requiredScopes: ["agent_sync:publish"],
    maxRisk: "safe_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "agentstudio.runtime.read",
    label: "Runtime read",
    requiredScopes: ["storage:read", "jobs:read"],
    maxRisk: "read_only",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "agentstudio.runtime.maintain",
    label: "Runtime maintain",
    requiredScopes: ["knowledge:maintain"],
    maxRisk: "repair_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "agentstudio.mount.dev",
    label: "Mount development",
    requiredScopes: ["knowledge:admin"],
    maxRisk: "repair_write",
    grantable: false,
    defaultForAgents: false
  },
  {
    id: "agentstudio.admin",
    label: "AgentStudio admin",
    requiredScopes: ["knowledge:admin", "storage:read", "jobs:read", "agent_sync:publish"],
    maxRisk: "repair_write",
    grantable: false,
    defaultForAgents: false
  }
]);

const DEFAULT_TOOL_MANAGEMENT_PROFILES = Object.freeze([
  {
    id: "maintenance-agent",
    label: "Maintenance Agent",
    agentType: "maintenance",
    toolsets: ["agentstudio.runtime.read", "agentstudio.storage.read", "agentstudio.jobs.read", "agentstudio.knowledge.maintain"],
    toolAllow: [],
    toolDeny: ["agentstudio.admin"],
    maxRisk: "repair_write",
    approvalPolicy: "confirm_repair",
    concurrencyLimit: 1,
    sandboxPolicy: "server-runtime",
    auditTags: ["maintenance-agent"]
  },
  {
    id: "agent-exploration",
    label: "Agent Exploration",
    agentType: "exploration",
    toolsets: ["agentstudio.knowledge.read"],
    toolAllow: [],
    toolDeny: ["agentstudio.admin"],
    maxRisk: "read_only",
    approvalPolicy: "deny_repair",
    concurrencyLimit: 4,
    sandboxPolicy: "knowledge-only",
    auditTags: ["agent-exploration"]
  },
  {
    id: "document-ingestion-agent",
    label: "Document Ingestion Agent",
    agentType: "ingestion",
    toolsets: ["agentstudio.document.parse", "agentstudio.document.convert", "agentstudio.knowledge.write"],
    toolAllow: [],
    toolDeny: ["agentstudio.admin"],
    maxRisk: "safe_write",
    approvalPolicy: "deny_repair",
    concurrencyLimit: 2,
    sandboxPolicy: "document-runtime",
    auditTags: ["document-ingestion"]
  },
  {
    id: "mail-import-agent",
    label: "Mail Import Agent",
    agentType: "mail-import",
    toolsets: ["agentstudio.mail.import", "agentstudio.document.parse", "agentstudio.knowledge.write"],
    toolAllow: [],
    toolDeny: ["agentstudio.admin"],
    maxRisk: "safe_write",
    approvalPolicy: "deny_repair",
    concurrencyLimit: 2,
    sandboxPolicy: "document-runtime",
    auditTags: ["mail-import"]
  },
  {
    id: "external-knowledge-reader",
    label: "External Knowledge Reader",
    agentType: "external",
    toolsets: ["agentstudio.knowledge.read"],
    toolAllow: [],
    toolDeny: ["agentstudio.admin"],
    maxRisk: "read_only",
    approvalPolicy: "deny_write",
    concurrencyLimit: 4,
    sandboxPolicy: "remote-token",
    auditTags: ["external-reader"]
  },
  {
    id: "external-knowledge-writer",
    label: "External Knowledge Writer",
    agentType: "external",
    toolsets: ["agentstudio.knowledge.read", "agentstudio.knowledge.write"],
    toolAllow: [],
    toolDeny: ["agentstudio.admin"],
    maxRisk: "safe_write",
    approvalPolicy: "deny_repair",
    concurrencyLimit: 2,
    sandboxPolicy: "remote-token",
    auditTags: ["external-writer"]
  },
  {
    id: "admin-operator",
    label: "Admin Operator",
    agentType: "operator",
    toolsets: ["agentstudio.admin", "agentstudio.knowledge.admin", "agentstudio.runtime.maintain"],
    toolAllow: [],
    toolDeny: [],
    maxRisk: "repair_write",
    approvalPolicy: "confirm_repair",
    concurrencyLimit: 1,
    sandboxPolicy: "server-admin",
    auditTags: ["admin-operator"]
  }
]);

export const TOOL_MANAGEMENT_SCOPES = Object.freeze(
  loadEntityConfigList("scopes", DEFAULT_TOOL_MANAGEMENT_SCOPES)
);
export const TOOL_MANAGEMENT_TOOLSETS = Object.freeze(
  loadEntityConfigList("toolsets", DEFAULT_TOOL_MANAGEMENT_TOOLSETS)
);
export const TOOL_MANAGEMENT_PROFILES = Object.freeze(
  loadEntityConfigList("profiles", DEFAULT_TOOL_MANAGEMENT_PROFILES)
);

const TOOL_ID_BY_OPERATION_ID = Object.freeze({
  "runtime.info": "agentstudio.runtime.info",
  "runtime.mounts": "agentstudio.runtime.mounts",
  "runtime.set_mounts": "agentstudio.runtime.mounts.set",
  "runtime.reload_mounts": "agentstudio.runtime.mounts.reload",
  "architecture.live_map": "agentstudio.architecture.liveMap",
  "sample_business_pack.list": "agentstudio.sampleBusinessPack.list",
  "sample_business_pack.get": "agentstudio.sampleBusinessPack.get",
  "sample_business_pack.materialize": "agentstudio.sampleBusinessPack.materialize",
  "executive_report.list": "agentstudio.executiveReport.list",
  "executive_report.preview": "agentstudio.executiveReport.preview",
  "executive_report.generate": "agentstudio.executiveReport.generate",
  "module_ecosystem.templates": "agentstudio.modules.templates",
  "module_ecosystem.plan": "agentstudio.modules.plan",
  "module_ecosystem.scaffold": "agentstudio.modules.scaffold",
  "module_ecosystem.contract_test": "agentstudio.modules.contractTest",
  "storage.summary": "agentstudio.storageSummary",
  "storage.backups.list": "agentstudio.storageBackups.list",
  "storage.backups.create": "agentstudio.storageBackups.create",
  "storage.backups.restore_preview": "agentstudio.storageBackups.restorePreview",
  "storage.backups.restore": "agentstudio.storageBackups.restore",
  "jobs.list": "agentstudio.jobs.list",
  "jobs.get": "agentstudio.jobs.get",
  "knowledge.affair_taxonomy": "agentstudio.knowledge.affairTaxonomy",
  "knowledge.console": "agentstudio.knowledge.console",
  "knowledge.config_schema": "agentstudio.knowledge.configSchema",
  "knowledge.capabilities": "agentstudio.knowledge.capabilities",
  "knowledge.export_docx": "agentstudio.knowledge.exportDocx",
  "knowledge.health": "agentstudio.knowledge.health",
  "knowledge.maintenance.get": "agentstudio.knowledge.maintenance.get",
  "knowledge.maintenance.set": "agentstudio.knowledge.maintenance.set",
  "knowledge.reindex": "agentstudio.knowledge.reindex",
  "knowledge.maintenance.run": "agentstudio.knowledge.maintenance.run",
  "knowledge.sync": "agentstudio.knowledge.sync",
  "knowledge.changes": "agentstudio.knowledge.changes",
  "knowledge.review_items": "agentstudio.knowledge.reviewItems",
  "knowledge.review_resolve": "agentstudio.knowledge.reviewResolve",
  "knowledge.feedback": "agentstudio.knowledge.feedback",
  "knowledge.suggestions": "agentstudio.knowledge.suggestions",
  "knowledge.suggestion_resolve": "agentstudio.knowledge.suggestionResolve",
  "knowledge.learning.jobs": "agentstudio.knowledge.learning.jobs",
  "knowledge.learning.health": "agentstudio.knowledge.learning.health",
  "knowledge.evidence_gate.evaluate": "agentstudio.knowledge.evidenceGate.evaluate",
  "knowledge.agent_skill.describe": "agentstudio.knowledge.agentSkill",
  "knowledge.agent_skill.plan": "agentstudio.knowledge.agentSkill.plan",
  "knowledge.agent_skill.run": "agentstudio.knowledge.agentSkill.run",
  "knowledge.skills.list": "agentstudio.knowledge.skills.list",
  "knowledge.skills.get": "agentstudio.knowledge.skills.get",
  "knowledge.skills.generate": "agentstudio.knowledge.skills.generate",
  "knowledge.skills.propose": "agentstudio.knowledge.skills.propose",
  "knowledge.skills.resolve": "agentstudio.knowledge.skills.resolve",
  "knowledge.skills.framework": "agentstudio.knowledge.skillFramework",
  "knowledge.skills.framework_save": "agentstudio.knowledge.skillFramework.set",
  "knowledge.golden_rules.list": "agentstudio.knowledge.goldenRules.list",
  "knowledge.golden_rules.save": "agentstudio.knowledge.goldenRules.set",
  "knowledge.golden_rules.publish": "agentstudio.knowledge.goldenRules.publish",
  "knowledge.golden_rules.rollback": "agentstudio.knowledge.goldenRules.rollback",
  "knowledge.rule_authoring.chat": "agentstudio.knowledge.ruleAuthoring.chat",
  "knowledge.rule_authoring.runs.get": "agentstudio.knowledge.ruleAuthoring.run",
  "knowledge.gold_cases.list": "agentstudio.knowledge.goldCases.list",
  "knowledge.gold_cases.save": "agentstudio.knowledge.goldCases.set",
  "knowledge.distillation.runs.create": "agentstudio.knowledge.distillation.runs.create",
  "knowledge.distillation.runs.get": "agentstudio.knowledge.distillation.runs.get",
  "knowledge.skills.evaluation.runs.create": "agentstudio.knowledge.skills.evaluation.runs.create",
  "knowledge.skills.deployments.create": "agentstudio.knowledge.skills.deployments.create",
  "knowledge.skills.deployments.rollback": "agentstudio.knowledge.skills.deployments.rollback",
  "knowledge.training_sets.export": "agentstudio.knowledge.trainingSets.export",
  "knowledge.evaluation.runs.create": "agentstudio.knowledge.evaluation.runs.create",
  "knowledge.evaluation.runs.list": "agentstudio.knowledge.evaluation.runs.list",
  "knowledge.evaluation.runs.get": "agentstudio.knowledge.evaluation.runs.get",
  "knowledge.model_roles": "agentstudio.knowledge.modelRoles",
  "knowledge.model_decision": "agentstudio.knowledge.modelDecision",
  "knowledge.evolution.describe": "agentstudio.knowledge.evolution",
  "knowledge.evolution.runs.create": "agentstudio.knowledge.evolution.runs.create",
  "knowledge.evolution.runs.list": "agentstudio.knowledge.evolution.runs.list",
  "knowledge.evolution.runs.get": "agentstudio.knowledge.evolution.runs.get",
  "knowledge.hierarchy.audit": "agentstudio.knowledge.hierarchy.audit",
  "knowledge.evolution.deployments.list": "agentstudio.knowledge.evolution.deployments.list",
  "knowledge.evolution.deployments.promote": "agentstudio.knowledge.evolution.deployments.promote",
  "knowledge.evolution.deployments.rollback": "agentstudio.knowledge.evolution.deployments.rollback",
  "context.profiles.get": "agentstudio.context.profiles",
  "context.profiles.set": "agentstudio.context.profiles.set",
  "context.session_memory.get": "agentstudio.agentMemory.sessionMemory.get",
  "context.session_memory.clear": "agentstudio.agentMemory.sessionMemory.clear",
  "client_runtime.profiles.get": "agentstudio.clientRuntime.profiles",
  "client_runtime.profiles.set": "agentstudio.clientRuntime.profiles.set",
  "client_runtime.resolve": "agentstudio.clientRuntime.resolve",
  "client_runtime.status": "agentstudio.clientRuntime.status",
  "agent_workspaces.list": "agentstudio.agentWorkspace.list",
  "agent_workspaces.get": "agentstudio.agentWorkspace.get",
  "agent_workspaces.context.get": "agentstudio.agentWorkspace.context",
  "agent_workspaces.context_bundle.export": "agentstudio.agentWorkspace.contextBundle.export",
  "agent_workspaces.context_bundle.restore": "agentstudio.agentWorkspace.contextBundle.restore",
  "agent_workspaces.chain.get": "agentstudio.agentWorkspace.chain",
  "agent_workspaces.parent.set": "agentstudio.agentWorkspace.parent.set",
  "agent_workspaces.profile.hotswap": "agentstudio.agentWorkspace.profile.hotswap",
  "agent_workspaces.sources.set": "agentstudio.agentWorkspace.sources.set",
  "agent_workspaces.share": "agentstudio.agentWorkspace.share",
  "agent_workspaces.unshare": "agentstudio.agentWorkspace.unshare",
  "workspace_governance.describe": "agentstudio.workspaceGovernance.describe",
  "workspace_governance.policy.set": "agentstudio.workspaceGovernance.policy.set",
  "workspace_governance.evaluate": "agentstudio.workspaceGovernance.evaluate",
  "workspace_governance.share_grant": "agentstudio.workspaceGovernance.shareGrant",
  "asset_lineage.describe": "agentstudio.assetLineage.describe",
  "asset_lineage.record": "agentstudio.assetLineage.record",
  "asset_lineage.trace": "agentstudio.assetLineage.trace",
  "asset_lineage.reparse_plan": "agentstudio.assetLineage.reparsePlan",
  "agent_sessions.list": "agentstudio.agentSession.list",
  "agent_sessions.get": "agentstudio.agentSession.get",
  "agent_sessions.context.get": "agentstudio.agentSession.context",
  "agent_sessions.events.append": "agentstudio.agentSession.events.append",
  "agent_sessions.fork": "agentstudio.agentSession.fork",
  "agent_sessions.compare": "agentstudio.agentSession.compare",
  "agent_sessions.merge_proposal": "agentstudio.agentSession.mergeProposal",
  "agent_sessions.archive": "agentstudio.agentSession.archive",
  "agent_workspaces.submissions.resolve": "agentstudio.agentWorkspace.submissionResolve",
  "agent_workspaces.issues.resolve": "agentstudio.agentWorkspace.issueResolve",
  "agent_workspaces.locks.list": "agentstudio.agentWorkspace.locks",
  "agent_workspaces.locks.write": "agentstudio.agentWorkspace.lock",
  "knowledge.summarization.runs.create": "agentstudio.knowledge.summarization.runs.create",
  "knowledge.summarization.runs.get": "agentstudio.knowledge.summarization.runs.get",
  "knowledge.summarization.runs.approve": "agentstudio.knowledge.summarization.runs.approve",
  "knowledge.search": "agentstudio.knowledge.search",
  "knowledge.document_structure": "agentstudio.knowledge.documentStructure",
  "knowledge.item": "agentstudio.knowledge.item",
  "knowledge.evidence": "agentstudio.knowledge.evidence",
  "knowledge.asset": "agentstudio.knowledge.asset",
  "knowledge.render_markdown": "agentstudio.knowledge.renderMarkdown",
  "knowledge.graph": "agentstudio.knowledge.graph",
  "agent_sync.publish": "agentstudio.agentSync.publish",
  "data_connectors.governance.describe": "agentstudio.dataConnectors.governance",
  "data_connectors.governance.plan": "agentstudio.dataConnectors.governance.plan",
  "data_connectors.governance.conformance": "agentstudio.dataConnectors.governance.conformance",
  "performance.capacity.targets": "agentstudio.performance.capacity.targets",
  "performance.capacity.benchmark": "agentstudio.performance.capacity.benchmark",
  "capability_packages.list": "agentstudio.capabilityPackages.list",
  "capability_packages.plan": "agentstudio.capabilityPackages.plan",
  "capability_packages.submit": "agentstudio.capabilityPackages.submit",
  "capability_packages.lifecycle": "agentstudio.capabilityPackages.lifecycle"
});

const SCOPE_BY_OPERATION_ID = Object.freeze({
  "runtime.info": "storage:read",
  "runtime.mounts": "storage:read",
  "runtime.set_mounts": "knowledge:maintain",
  "runtime.reload_mounts": "knowledge:maintain",
  "architecture.live_map": "storage:read",
  "sample_business_pack.list": "storage:read",
  "sample_business_pack.get": "storage:read",
  "sample_business_pack.materialize": "knowledge:maintain",
  "executive_report.list": "storage:read",
  "executive_report.preview": "storage:read",
  "executive_report.generate": "knowledge:maintain",
  "module_ecosystem.templates": "storage:read",
  "module_ecosystem.plan": "knowledge:admin",
  "module_ecosystem.scaffold": "knowledge:admin",
  "module_ecosystem.contract_test": "knowledge:admin",
  "storage.summary": "storage:read",
  "storage.backups.list": "storage:read",
  "storage.backups.create": "knowledge:maintain",
  "storage.backups.restore_preview": "storage:read",
  "storage.backups.restore": "knowledge:maintain",
  "jobs.list": "jobs:read",
  "jobs.get": "jobs:read",
  "knowledge.affair_taxonomy": "knowledge:write",
  "knowledge.maintenance.set": "knowledge:admin",
  "knowledge.reindex": "knowledge:maintain",
  "knowledge.maintenance.run": "knowledge:maintain",
  "knowledge.changes": "knowledge:write",
  "knowledge.review_resolve": "knowledge:maintain",
  "knowledge.feedback": "knowledge:write",
  "knowledge.suggestion_resolve": "knowledge:maintain",
  "knowledge.learning.jobs": "knowledge:maintain",
  "knowledge.skills.generate": "knowledge:maintain",
  "knowledge.skills.propose": "knowledge:write",
  "knowledge.skills.resolve": "knowledge:maintain",
  "knowledge.skills.framework_save": "knowledge:maintain",
  "knowledge.golden_rules.save": "knowledge:maintain",
  "knowledge.golden_rules.publish": "knowledge:maintain",
  "knowledge.golden_rules.rollback": "knowledge:maintain",
  "knowledge.rule_authoring.chat": "knowledge:maintain",
  "knowledge.gold_cases.save": "knowledge:maintain",
  "knowledge.distillation.runs.create": "knowledge:maintain",
  "knowledge.skills.evaluation.runs.create": "knowledge:maintain",
  "knowledge.skills.deployments.create": "knowledge:maintain",
  "knowledge.skills.deployments.rollback": "knowledge:maintain",
  "knowledge.training_sets.export": "knowledge:maintain",
  "knowledge.evaluation.runs.create": "knowledge:maintain",
  "knowledge.evolution.runs.create": "knowledge:maintain",
  "knowledge.hierarchy.audit": "knowledge:maintain",
  "knowledge.evolution.deployments.promote": "knowledge:maintain",
  "knowledge.evolution.deployments.rollback": "knowledge:maintain",
  "context.profiles.set": "knowledge:admin",
  "context.session_memory.clear": "knowledge:admin",
  "client_runtime.profiles.set": "knowledge:admin",
  "agent_workspaces.submissions.resolve": "knowledge:maintain",
  "agent_workspaces.issues.resolve": "knowledge:maintain",
  "agent_workspaces.context_bundle.restore": "knowledge:maintain",
  "agent_workspaces.parent.set": "knowledge:maintain",
  "agent_workspaces.profile.hotswap": "knowledge:maintain",
  "agent_workspaces.sources.set": "knowledge:maintain",
  "agent_workspaces.share": "knowledge:maintain",
  "agent_workspaces.unshare": "knowledge:maintain",
  "workspace_governance.describe": "knowledge:read",
  "workspace_governance.policy.set": "knowledge:admin",
  "workspace_governance.evaluate": "knowledge:read",
  "workspace_governance.share_grant": "knowledge:maintain",
  "asset_lineage.describe": "knowledge:read",
  "asset_lineage.record": "knowledge:maintain",
  "asset_lineage.trace": "knowledge:read",
  "asset_lineage.reparse_plan": "knowledge:maintain",
  "agent_workspaces.locks.write": "knowledge:write",
  "agent_sessions.events.append": "knowledge:write",
  "agent_sessions.fork": "knowledge:write",
  "agent_sessions.merge_proposal": "knowledge:write",
  "agent_sessions.archive": "knowledge:write",
  "knowledge.summarization.runs.create": "knowledge:write",
  "knowledge.summarization.runs.approve": "knowledge:maintain",
  "agent_sync.publish": "agent_sync:publish",
  "data_connectors.governance.describe": "knowledge:read",
  "data_connectors.governance.plan": "knowledge:maintain",
  "data_connectors.governance.conformance": "knowledge:maintain",
  "performance.capacity.targets": "knowledge:read",
  "performance.capacity.benchmark": "knowledge:maintain",
  "capability_packages.list": "knowledge:read",
  "capability_packages.plan": "knowledge:maintain",
  "capability_packages.submit": "knowledge:maintain",
  "capability_packages.lifecycle": "knowledge:maintain"
});

const TOOLSET_BY_SCOPE = Object.freeze({
  "knowledge:read": "agentstudio.knowledge.read",
  "knowledge:write": "agentstudio.knowledge.write",
  "knowledge:maintain": "agentstudio.knowledge.maintain",
  "knowledge:admin": "agentstudio.knowledge.admin",
  "storage:read": "agentstudio.storage.read",
  "jobs:read": "agentstudio.jobs.read",
  "agent_sync:publish": "agentstudio.agent.sync.publish"
});

const RISK_RANK = Object.freeze({
  read_only: 0,
  safe_write: 1,
  repair_write: 2,
  destructive: 3
});

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function stableJson(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function operationScope(operation) {
  if (SCOPE_BY_OPERATION_ID[operation.id]) {
    return SCOPE_BY_OPERATION_ID[operation.id];
  }
  const operationId = String(operation.id || "");
  if (
    operationId.startsWith("knowledge.") ||
    operationId.startsWith("context.") ||
    operationId.startsWith("client_runtime.") ||
    operationId.startsWith("agent_workspaces.") ||
    operationId.startsWith("agent_sessions.")
  ) {
    return "knowledge:read";
  }
  if (operationId.startsWith("jobs.")) {
    return "jobs:read";
  }
  return "";
}

function normalizeRisk(operation = {}) {
  if (operation.destructive) {
    return "destructive";
  }
  const risk = String(operation.safety?.risk || "").trim();
  if (risk && RISK_RANK[risk] !== undefined) {
    return risk;
  }
  return operation.readOnly === false ? "safe_write" : "read_only";
}

function inferToolsets(operation, scopes = [], toolId = "") {
  const toolsets = new Set(scopes.map((scope) => TOOLSET_BY_SCOPE[scope]).filter(Boolean));
  if (toolId.startsWith("agentstudio.runtime.")) {
    if (operation.id === "runtime.info" || operation.id === "runtime.mounts") {
      toolsets.add("agentstudio.runtime.read");
    } else {
      toolsets.add("agentstudio.runtime.maintain");
    }
  }
  if (toolId.startsWith("agentstudio.architecture.")) {
    toolsets.add("agentstudio.runtime.read");
  }
  if (toolId.startsWith("agentstudio.sampleBusinessPack.")) {
    toolsets.add(operation.id === "sample_business_pack.materialize" ? "agentstudio.knowledge.maintain" : "agentstudio.runtime.read");
  }
  if (toolId.startsWith("agentstudio.storageBackups.")) {
    toolsets.add(
      operation.id === "storage.backups.list" || operation.id === "storage.backups.restore_preview"
        ? "agentstudio.runtime.read"
        : "agentstudio.runtime.maintain"
    );
  }
  if (toolId.startsWith("agentstudio.modules.")) {
    toolsets.add(operation.id === "module_ecosystem.templates" ? "agentstudio.runtime.read" : "agentstudio.mount.dev");
  }
  if (toolId.startsWith("agentstudio.executiveReport.")) {
    toolsets.add(operation.id === "executive_report.generate" ? "agentstudio.knowledge.maintain" : "agentstudio.runtime.read");
  }
  if (
    toolId.startsWith("agentstudio.agentWorkspace.") ||
    toolId.startsWith("agentstudio.agentSession.") ||
    toolId.startsWith("agentstudio.workspaceGovernance.")
  ) {
    toolsets.add("agentstudio.agent.workspace");
  }
  if (toolId.includes(".renderMarkdown")) {
    toolsets.add("agentstudio.result.export");
  }
  if (toolId.includes(".asset") || toolId.includes(".evidence")) {
    toolsets.add("agentstudio.document.parse");
  }
  if (toolId.startsWith("agentstudio.assetLineage.")) {
    toolsets.add("agentstudio.document.parse");
    toolsets.add("agentstudio.knowledge.maintain");
  }
  if (operation.id === "agent_sync.publish") {
    toolsets.add("agentstudio.agent.sync.publish");
  }
  return [...toolsets];
}

function normalizeHttpEndpoint(operation = {}) {
  const method = String(operation.http?.method || "POST").toUpperCase();
  const path = String(operation.http?.path || "");
  const query = Array.isArray(operation.http?.query) && operation.http.query.length
    ? `?${operation.http.query.map((item) => `${item.name.toUpperCase()}=${item.name}`).join("&")}`
    : "";
  return { method, endpoint: `${path}${query}` };
}

function createInternalToolDefinition({
  id,
  label,
  description,
  owner = "agentstudio",
  source = "handler-backed",
  handlerId,
  featureId = "core-platform",
  toolsets,
  requiredScopes,
  risk = "read_only",
  inputSchema = { type: "object" },
  tags = []
}) {
  const writeCapable = risk !== "read_only";
  const approvalRequired = risk === "repair_write" || risk === "destructive";
  return {
    id,
    version: "1",
    label,
    description,
    owner,
    source,
    featureId,
    operationId: "",
    handlerId,
    transport: {
      internal: true
    },
    toolsets: uniqueStrings(toolsets),
    requiredScopes: uniqueStrings(requiredScopes),
    inputSchema,
    outputSchema: { type: "object" },
    risk,
    readOnly: !writeCapable,
    destructive: risk === "destructive",
    concurrencySafe: risk === "read_only",
    requiresApproval: approvalRequired,
    approvalScope: approvalRequired ? "tool:approve" : "",
    timeoutMs: 30_000,
    maxResultBytes: 2 * 1024 * 1024,
    redactionPolicy: {
      input: "default",
      output: "summary"
    },
    auditPolicy: {
      enabled: true,
      recordInput: true,
      recordOutput: false
    },
    telemetryPolicy: {
      enabled: true
    },
    status: "internal",
    tags: uniqueStrings([source, featureId, risk, ...tags])
  };
}

function createInternalToolDefinitions() {
  return [
    createInternalToolDefinition({
      id: "agent-exploration.knowledge_skill_search",
      label: "Agent exploration skill search",
      description: "Search published AgentStudio KnowledgeSkills inside the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.knowledge_skill_search",
      toolsets: ["agentstudio.knowledge.read"],
      requiredScopes: ["knowledge:read"],
      featureId: "agent-exploration",
      tags: ["agent-exploration"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.keyword_search",
      label: "Agent exploration keyword search",
      description: "Run local knowledge recall inside the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.keyword_search",
      toolsets: ["agentstudio.knowledge.read"],
      requiredScopes: ["knowledge:read"],
      featureId: "agent-exploration",
      tags: ["agent-exploration"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.knowledge_aggregate",
      label: "Agent exploration aggregate",
      description: "Run knowledge aggregation inside the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.knowledge_aggregate",
      toolsets: ["agentstudio.knowledge.read"],
      requiredScopes: ["knowledge:read"],
      featureId: "agent-exploration",
      tags: ["agent-exploration"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.open_evidence",
      label: "Agent exploration open evidence",
      description: "Open a specific evidence pack inside the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.open_evidence",
      toolsets: ["agentstudio.knowledge.read", "agentstudio.document.parse"],
      requiredScopes: ["knowledge:read"],
      featureId: "agent-exploration",
      tags: ["agent-exploration"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.knowledge_skill_propose",
      label: "Agent exploration skill proposal",
      description: "Create a pending-review KnowledgeSkill from evidence found by an exploration run.",
      handlerId: "AgentExplorationRuntime.knowledge_skill_propose",
      toolsets: ["agentstudio.knowledge.write", "agentstudio.agent.workspace"],
      requiredScopes: ["knowledge:read", "knowledge:write"],
      risk: "safe_write",
      featureId: "agent-exploration",
      tags: ["agent-exploration"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.http_request",
      label: "Agent exploration HTTP request",
      description: "Call an allowlisted HTTP endpoint from the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.http_request",
      toolsets: ["agentstudio.agent.workspace"],
      requiredScopes: ["knowledge:read", "knowledge:write"],
      risk: "safe_write",
      featureId: "agent-exploration",
      tags: ["agent-exploration", "allowlisted-http"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.local_command",
      label: "Agent exploration local command",
      description: "Run an allowlisted local command from the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.local_command",
      toolsets: ["agentstudio.mount.dev"],
      requiredScopes: ["knowledge:admin"],
      risk: "repair_write",
      featureId: "agent-exploration",
      tags: ["agent-exploration", "allowlisted-command"]
    }),
    ...[
      ["system.health", "System health", "agentstudio.runtime.read", "storage:read", "read_only"],
      ["runtime.info", "Runtime info", "agentstudio.runtime.read", "storage:read", "read_only"],
      ["storage.summary", "Storage summary", "agentstudio.storage.read", "storage:read", "read_only"],
      ["storage.doctor", "Storage doctor", "agentstudio.runtime.read", "storage:read", "read_only"],
      ["storage.reconcile", "Storage reconcile", "agentstudio.runtime.maintain", "knowledge:maintain", "repair_write"],
      ["jobs.list", "Jobs list", "agentstudio.jobs.read", "jobs:read", "read_only"],
      ["jobs.failed_review", "Failed jobs review", "agentstudio.jobs.read", "jobs:read", "read_only"],
      ["knowledge.health", "Knowledge health", "agentstudio.knowledge.read", "knowledge:read", "read_only"],
      ["knowledge.maintenance.settings", "Knowledge maintenance settings", "agentstudio.knowledge.maintain", "knowledge:maintain", "read_only"],
      ["knowledge.maintenance.run", "Knowledge maintenance run", "agentstudio.knowledge.maintain", "knowledge:maintain", "safe_write"],
      ["knowledge.reindex", "Knowledge reindex", "agentstudio.knowledge.maintain", "knowledge:maintain", "repair_write"],
      ["runtime.reload_mounts", "Runtime reload mounts", "agentstudio.runtime.maintain", "knowledge:maintain", "repair_write"]
    ].map(([toolName, label, toolset, scope, risk]) =>
      createInternalToolDefinition({
        id: `maintenance-agent.${toolName}`,
        label: `Maintenance agent ${label}`,
        description: `Run ${label.toLowerCase()} through the MaintenanceAgent internal tool registry.`,
        handlerId: `MaintenanceAgent.${toolName}`,
        toolsets: [toolset],
        requiredScopes: [scope],
        risk,
        featureId: "maintenance-agent-runbooks",
        tags: ["maintenance-agent"]
      })
    )
  ];
}

function validateToolDefinitions(tools = [], operationsById = new Map()) {
  const ids = new Set();
  const validScopes = new Set(TOOL_MANAGEMENT_SCOPES.map((scope) => scope.id));
  const validToolsets = new Set(TOOL_MANAGEMENT_TOOLSETS.map((toolset) => toolset.id));
  const toolsetById = new Map(TOOL_MANAGEMENT_TOOLSETS.map((toolset) => [toolset.id, toolset]));
  for (const tool of tools) {
    if (!tool.id) {
      throw new Error("Tool definition is missing id.");
    }
    if (ids.has(tool.id)) {
      throw new Error(`Duplicate tool id: ${tool.id}`);
    }
    ids.add(tool.id);
    if (tool.operationId && !operationsById.has(tool.operationId)) {
      throw new Error(`Tool ${tool.id} references unknown operation: ${tool.operationId}`);
    }
    for (const scope of tool.requiredScopes || []) {
      if (!validScopes.has(scope)) {
        throw new Error(`Tool ${tool.id} references unknown scope: ${scope}`);
      }
    }
    for (const toolset of tool.toolsets || []) {
      if (!validToolsets.has(toolset)) {
        throw new Error(`Tool ${tool.id} references unknown toolset: ${toolset}`);
      }
    }
    if (!tool.toolsets?.length) {
      throw new Error(`Tool ${tool.id} must belong to at least one toolset.`);
    }
    const toolsetCoversRisk = (tool.toolsets || []).some((toolset) => {
      const declaredRisk = toolsetById.get(toolset)?.maxRisk || "read_only";
      return RISK_RANK[tool.risk] <= RISK_RANK[declaredRisk];
    });
    if (!toolsetCoversRisk) {
      throw new Error(`Tool ${tool.id} risk ${tool.risk} exceeds declared toolset risk.`);
    }
    if (tool.readOnly === false && tool.auditPolicy?.enabled !== true) {
      throw new Error(`Write-capable tool ${tool.id} must enable audit.`);
    }
    if ((tool.destructive || tool.requiresApproval) && !tool.approvalScope) {
      throw new Error(`Approval-capable tool ${tool.id} must declare approvalScope.`);
    }
  }
}

export function scopesToToolsets(scopes = []) {
  return uniqueStrings(scopes.map((scope) => TOOLSET_BY_SCOPE[scope]).filter(Boolean));
}

export function toolsetsToScopes(toolsets = []) {
  const selected = new Set(toolsets);
  const scopes = [];
  for (const toolset of TOOL_MANAGEMENT_TOOLSETS) {
    if (!selected.has(toolset.id)) {
      continue;
    }
    scopes.push(...(toolset.requiredScopes || []));
  }
  return uniqueStrings(scopes);
}

export function createToolCatalog({ operations = [], activeFeatureIds = null } = {}) {
  const operationsById = new Map(operations.map((operation) => [operation.id, operation]));
  const activeFeatureSet = activeFeatureIds?.length ? new Set(activeFeatureIds) : null;
  const tools = [];
  for (const operation of operations) {
    const toolId = TOOL_ID_BY_OPERATION_ID[operation.id];
    if (!toolId) {
      continue;
    }
    const scope = operationScope(operation);
    const requiredScopes = scope ? [scope] : [];
    const { method, endpoint } = normalizeHttpEndpoint(operation);
    const risk = normalizeRisk(operation);
    const requiresApproval = operation.destructive === true || risk === "destructive" || operation.safety?.requiresConfirmation === true;
    tools.push({
      id: toolId,
      version: "1",
      label: String(operation.label || toolId),
      description: String(operation.description || operation.label || toolId),
      owner: "agentstudio",
      source: "operation-backed",
      featureId: operation.featureId || "",
      operationId: operation.id,
      handlerId: operation.target?.method || "",
      transport: {
        http: {
          method,
          path: operation.http?.path || "",
          query: operation.http?.query || []
        },
        rpc: operation.rpc || null,
        cli: operation.cli || null,
        binary: operation.binary === true
      },
      toolsets: inferToolsets(operation, requiredScopes, toolId),
      requiredScopes,
      inputSchema: operation.inputSchema || { type: "object" },
      outputSchema: operation.binary ? { type: "binary" } : { type: "object" },
      risk,
      readOnly: operation.readOnly !== false,
      destructive: operation.destructive === true || risk === "destructive",
      concurrencySafe: operation.concurrencySafe === true,
      requiresApproval,
      approvalScope: requiresApproval ? operation.safety?.approvalScope || "tool:approve" : "",
      timeoutMs: 30_000,
      maxResultBytes: operation.binary ? 32 * 1024 * 1024 : 2 * 1024 * 1024,
      redactionPolicy: {
        input: "default",
        output: operation.audit?.recordOutput === true ? "default" : "summary"
      },
      auditPolicy: {
        enabled: true,
        recordInput: operation.audit?.recordInput !== false,
        recordOutput: operation.audit?.recordOutput === true
      },
      telemetryPolicy: {
        enabled: true
      },
      status: "active",
      tags: uniqueStrings([operation.featureId || "", operation.feature, operation.binary ? "binary" : "", risk])
    });
  }
  tools.push(
    ...createInternalToolDefinitions().filter((tool) =>
      !activeFeatureSet || activeFeatureSet.has(tool.featureId || "core-platform")
    )
  );
  const catalog = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scopes: TOOL_MANAGEMENT_SCOPES,
    toolsets: TOOL_MANAGEMENT_TOOLSETS,
    profiles: TOOL_MANAGEMENT_PROFILES,
    tools
  };
  validateToolDefinitions(tools, operationsById);
  return {
    ...catalog,
    fingerprint: fingerprint(tools.map((tool) => ({
      id: tool.id,
      version: tool.version,
      operationId: tool.operationId,
      toolsets: tool.toolsets,
      scopes: tool.requiredScopes,
      risk: tool.risk
    })))
  };
}

export function createToolCatalogRegistry({ operations = [], activeFeatureIds = null } = {}) {
  let catalog = createToolCatalog({ operations, activeFeatureIds });
  let toolsById = new Map(catalog.tools.map((tool) => [tool.id, tool]));
  let toolsByOperationId = new Map(catalog.tools.filter((tool) => tool.operationId).map((tool) => [tool.operationId, tool]));

  function refresh(nextOperations = operations) {
    catalog = createToolCatalog({ operations: nextOperations, activeFeatureIds });
    toolsById = new Map(catalog.tools.map((tool) => [tool.id, tool]));
    toolsByOperationId = new Map(catalog.tools.filter((tool) => tool.operationId).map((tool) => [tool.operationId, tool]));
    return catalog;
  }

  function listTools(filters = {}) {
    return catalog.tools.filter((tool) => {
      if (filters.status && tool.status !== filters.status) {
        return false;
      }
      if (filters.toolset && !tool.toolsets.includes(filters.toolset)) {
        return false;
      }
      if (filters.scope && !tool.requiredScopes.includes(filters.scope)) {
        return false;
      }
      if (filters.risk && tool.risk !== filters.risk) {
        return false;
      }
      if (filters.owner && tool.owner !== filters.owner) {
        return false;
      }
      return true;
    });
  }

  function resolveToolset(input = {}) {
    const requestedToolsets = uniqueStrings(input.toolsets || input.toolsetIds || []);
    const allow = new Set(uniqueStrings(input.toolAllow || []));
    const deny = new Set(uniqueStrings(input.toolDeny || []));
    const selected = requestedToolsets.length
      ? new Set(requestedToolsets)
      : new Set(TOOL_MANAGEMENT_TOOLSETS.filter((toolset) => toolset.defaultForAgents).map((toolset) => toolset.id));
    const tools = catalog.tools.filter((tool) => {
      if (deny.has(tool.id)) {
        return false;
      }
      if (allow.size > 0 && !allow.has(tool.id)) {
        return false;
      }
      return tool.toolsets.some((toolset) => selected.has(toolset));
    });
    return {
      toolsets: [...selected],
      tools,
      toolIds: tools.map((tool) => tool.id),
      requiredScopes: uniqueStrings(tools.flatMap((tool) => tool.requiredScopes)),
      maxRisk: tools.reduce((max, tool) => (RISK_RANK[tool.risk] > RISK_RANK[max] ? tool.risk : max), "read_only")
    };
  }

  return {
    refresh,
    getCatalog: () => catalog,
    listTools,
    getTool: (toolId) => toolsById.get(String(toolId || "")) || null,
    getToolByOperationId: (operationId) => toolsByOperationId.get(String(operationId || "")) || null,
    listToolsets: () => TOOL_MANAGEMENT_TOOLSETS,
    listProfiles: () => TOOL_MANAGEMENT_PROFILES,
    resolveToolset
  };
}
