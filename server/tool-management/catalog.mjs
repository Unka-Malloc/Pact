import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TOOL_MANAGEMENT_API_PREFIX = "/api/tool-management/v1";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENTITY_CONFIG_ROOT = path.resolve(MODULE_DIR, "../config/entity-config/tools");

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
    id: "splitall.knowledge.read",
    label: "Knowledge read",
    requiredScopes: ["knowledge:read"],
    maxRisk: "read_only",
    grantable: true,
    defaultForAgents: true
  },
  {
    id: "splitall.knowledge.write",
    label: "Knowledge write",
    requiredScopes: ["knowledge:read", "knowledge:write"],
    maxRisk: "safe_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "splitall.knowledge.maintain",
    label: "Knowledge maintenance",
    requiredScopes: ["knowledge:read", "knowledge:write", "knowledge:maintain"],
    maxRisk: "repair_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "splitall.knowledge.admin",
    label: "Knowledge admin",
    requiredScopes: ["knowledge:read", "knowledge:write", "knowledge:maintain", "knowledge:admin"],
    maxRisk: "repair_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "splitall.storage.read",
    label: "Storage read",
    requiredScopes: ["storage:read"],
    maxRisk: "read_only",
    grantable: true,
    defaultForAgents: true
  },
  {
    id: "splitall.jobs.read",
    label: "Jobs read",
    requiredScopes: ["jobs:read"],
    maxRisk: "read_only",
    grantable: true,
    defaultForAgents: true
  },
  {
    id: "splitall.document.parse",
    label: "Document parse",
    requiredScopes: ["knowledge:read"],
    maxRisk: "read_only",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "splitall.document.convert",
    label: "Document convert",
    requiredScopes: ["knowledge:write"],
    maxRisk: "safe_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "splitall.mail.import",
    label: "Mail import",
    requiredScopes: ["knowledge:write"],
    maxRisk: "safe_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "splitall.result.export",
    label: "Result export",
    requiredScopes: ["knowledge:read"],
    maxRisk: "read_only",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "splitall.agent.workspace",
    label: "Agent workspace",
    requiredScopes: ["knowledge:read", "knowledge:write"],
    maxRisk: "safe_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "splitall.agent.sync.publish",
    label: "Agent sync publish",
    requiredScopes: ["agent_sync:publish"],
    maxRisk: "safe_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "splitall.runtime.read",
    label: "Runtime read",
    requiredScopes: ["storage:read", "jobs:read"],
    maxRisk: "read_only",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "splitall.runtime.maintain",
    label: "Runtime maintain",
    requiredScopes: ["knowledge:maintain"],
    maxRisk: "repair_write",
    grantable: true,
    defaultForAgents: false
  },
  {
    id: "splitall.mount.dev",
    label: "Mount development",
    requiredScopes: ["knowledge:admin"],
    maxRisk: "repair_write",
    grantable: false,
    defaultForAgents: false
  },
  {
    id: "splitall.admin",
    label: "SplitAll admin",
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
    toolsets: ["splitall.runtime.read", "splitall.storage.read", "splitall.jobs.read", "splitall.knowledge.maintain"],
    toolAllow: [],
    toolDeny: ["splitall.admin"],
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
    toolsets: ["splitall.knowledge.read"],
    toolAllow: [],
    toolDeny: ["splitall.admin"],
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
    toolsets: ["splitall.document.parse", "splitall.document.convert", "splitall.knowledge.write"],
    toolAllow: [],
    toolDeny: ["splitall.admin"],
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
    toolsets: ["splitall.mail.import", "splitall.document.parse", "splitall.knowledge.write"],
    toolAllow: [],
    toolDeny: ["splitall.admin"],
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
    toolsets: ["splitall.knowledge.read"],
    toolAllow: [],
    toolDeny: ["splitall.admin"],
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
    toolsets: ["splitall.knowledge.read", "splitall.knowledge.write"],
    toolAllow: [],
    toolDeny: ["splitall.admin"],
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
    toolsets: ["splitall.admin", "splitall.knowledge.admin", "splitall.runtime.maintain"],
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

const LEGACY_TOOL_ID_BY_OPERATION_ID = Object.freeze({
  "agent_tools.search": "splitall.search",
  "agent_tools.storage_summary": "splitall.storageSummary",
  "agent_tools.jobs": "splitall.jobs.list",
  "agent_tools.job": "splitall.jobs.get",
  "agent_tools.knowledge_affair_taxonomy": "splitall.knowledge.affairTaxonomy",
  "agent_tools.knowledge_console": "splitall.knowledge.console",
  "agent_tools.knowledge_config_schema": "splitall.knowledge.configSchema",
  "agent_tools.knowledge_capabilities": "splitall.knowledge.capabilities",
  "agent_tools.knowledge_health": "splitall.knowledge.health",
  "agent_tools.knowledge_maintenance_get": "splitall.knowledge.maintenance.get",
  "agent_tools.knowledge_maintenance_set": "splitall.knowledge.maintenance.set",
  "agent_tools.knowledge_reindex": "splitall.knowledge.reindex",
  "agent_tools.knowledge_maintenance_run": "splitall.knowledge.maintenance.run",
  "agent_tools.knowledge_sync": "splitall.knowledge.sync",
  "agent_tools.knowledge_changes": "splitall.knowledge.changes",
  "agent_tools.knowledge_review_items": "splitall.knowledge.reviewItems",
  "agent_tools.knowledge_review_resolve": "splitall.knowledge.reviewResolve",
  "agent_tools.knowledge_feedback": "splitall.knowledge.feedback",
  "agent_tools.knowledge_suggestions": "splitall.knowledge.suggestions",
  "agent_tools.knowledge_suggestion_resolve": "splitall.knowledge.suggestionResolve",
  "agent_tools.knowledge_learning_jobs": "splitall.knowledge.learning.jobs",
  "agent_tools.knowledge_learning_health": "splitall.knowledge.learning.health",
  "agent_tools.knowledge_evidence_gate_evaluate": "splitall.knowledge.evidenceGate.evaluate",
  "agent_tools.knowledge_agent_skill": "splitall.knowledge.agentSkill",
  "agent_tools.knowledge_agent_skill_plan": "splitall.knowledge.agentSkill.plan",
  "agent_tools.knowledge_agent_skill_run": "splitall.knowledge.agentSkill.run",
  "agent_tools.knowledge_skills_list": "splitall.knowledge.skills.list",
  "agent_tools.knowledge_skills_get": "splitall.knowledge.skills.get",
  "agent_tools.knowledge_skills_generate": "splitall.knowledge.skills.generate",
  "agent_tools.knowledge_skills_propose": "splitall.knowledge.skills.propose",
  "agent_tools.knowledge_skills_resolve": "splitall.knowledge.skills.resolve",
  "agent_tools.knowledge_skill_framework": "splitall.knowledge.skillFramework",
  "agent_tools.knowledge_skill_framework_save": "splitall.knowledge.skillFramework.set",
  "agent_tools.knowledge_golden_rules_list": "splitall.knowledge.goldenRules.list",
  "agent_tools.knowledge_golden_rules_save": "splitall.knowledge.goldenRules.set",
  "agent_tools.knowledge_golden_rules_publish": "splitall.knowledge.goldenRules.publish",
  "agent_tools.knowledge_golden_rules_rollback": "splitall.knowledge.goldenRules.rollback",
  "agent_tools.knowledge_rule_authoring_chat": "splitall.knowledge.ruleAuthoring.chat",
  "agent_tools.knowledge_rule_authoring_run_get": "splitall.knowledge.ruleAuthoring.run",
  "agent_tools.knowledge_gold_cases_list": "splitall.knowledge.goldCases.list",
  "agent_tools.knowledge_gold_cases_save": "splitall.knowledge.goldCases.set",
  "agent_tools.knowledge_distillation_runs_create": "splitall.knowledge.distillation.runs.create",
  "agent_tools.knowledge_distillation_runs_get": "splitall.knowledge.distillation.runs.get",
  "agent_tools.knowledge_skill_evaluation_runs_create": "splitall.knowledge.skills.evaluation.runs.create",
  "agent_tools.knowledge_skill_deployments_create": "splitall.knowledge.skills.deployments.create",
  "agent_tools.knowledge_skill_deployments_rollback": "splitall.knowledge.skills.deployments.rollback",
  "agent_tools.knowledge_training_sets_export": "splitall.knowledge.trainingSets.export",
  "agent_tools.knowledge_evaluation_runs_create": "splitall.knowledge.evaluation.runs.create",
  "agent_tools.knowledge_evaluation_runs_list": "splitall.knowledge.evaluation.runs.list",
  "agent_tools.knowledge_evaluation_runs_get": "splitall.knowledge.evaluation.runs.get",
  "agent_tools.knowledge_model_roles": "splitall.knowledge.modelRoles",
  "agent_tools.knowledge_model_decision": "splitall.knowledge.modelDecision",
  "agent_tools.knowledge_evolution_describe": "splitall.knowledge.evolution",
  "agent_tools.knowledge_evolution_runs_create": "splitall.knowledge.evolution.runs.create",
  "agent_tools.knowledge_evolution_runs_list": "splitall.knowledge.evolution.runs.list",
  "agent_tools.knowledge_evolution_runs_get": "splitall.knowledge.evolution.runs.get",
  "agent_tools.knowledge_hierarchy_audit": "splitall.knowledge.hierarchy.audit",
  "agent_tools.knowledge_evolution_deployments_list": "splitall.knowledge.evolution.deployments.list",
  "agent_tools.knowledge_evolution_deployments_promote": "splitall.knowledge.evolution.deployments.promote",
  "agent_tools.knowledge_evolution_deployments_rollback": "splitall.knowledge.evolution.deployments.rollback",
  "agent_tools.context_profiles_get": "splitall.context.profiles",
  "agent_tools.context_profiles_set": "splitall.context.profiles.set",
  "agent_tools.agent_workspaces": "splitall.agentWorkspace.list",
  "agent_tools.agent_workspace": "splitall.agentWorkspace.get",
  "agent_tools.agent_workspace_submission_resolve": "splitall.agentWorkspace.submissionResolve",
  "agent_tools.agent_workspace_issue_resolve": "splitall.agentWorkspace.issueResolve",
  "agent_tools.agent_workspace_locks": "splitall.agentWorkspace.locks",
  "agent_tools.agent_workspace_lock": "splitall.agentWorkspace.lock",
  "agent_tools.knowledge_summarization_runs_create": "splitall.knowledge.summarization.runs.create",
  "agent_tools.knowledge_summarization_runs_get": "splitall.knowledge.summarization.runs.get",
  "agent_tools.knowledge_summarization_runs_approve": "splitall.knowledge.summarization.runs.approve",
  "agent_tools.knowledge_search": "splitall.knowledge.search",
  "agent_tools.knowledge_search_get": "splitall.knowledge.search.get",
  "agent_tools.knowledge_item": "splitall.knowledge.item",
  "agent_tools.knowledge_evidence": "splitall.knowledge.evidence",
  "agent_tools.knowledge_asset": "splitall.knowledge.asset",
  "agent_tools.knowledge_render_markdown": "splitall.knowledge.renderMarkdown",
  "agent_tools.knowledge_graph": "splitall.knowledge.graph",
  "agent_sync.publish": "splitall.agentSync.publish"
});

const SCOPE_BY_OPERATION_ID = Object.freeze({
  "agent_tools.storage_summary": "storage:read",
  "agent_tools.jobs": "jobs:read",
  "agent_tools.job": "jobs:read",
  "agent_tools.knowledge_affair_taxonomy": "knowledge:write",
  "agent_tools.knowledge_maintenance_set": "knowledge:admin",
  "agent_tools.knowledge_reindex": "knowledge:maintain",
  "agent_tools.knowledge_maintenance_run": "knowledge:maintain",
  "agent_tools.knowledge_changes": "knowledge:write",
  "agent_tools.knowledge_review_resolve": "knowledge:maintain",
  "agent_tools.knowledge_feedback": "knowledge:write",
  "agent_tools.knowledge_suggestion_resolve": "knowledge:maintain",
  "agent_tools.knowledge_learning_jobs": "knowledge:maintain",
  "agent_tools.knowledge_skills_generate": "knowledge:maintain",
  "agent_tools.knowledge_skills_propose": "knowledge:write",
  "agent_tools.knowledge_skills_resolve": "knowledge:maintain",
  "agent_tools.knowledge_skill_framework_save": "knowledge:maintain",
  "agent_tools.knowledge_golden_rules_save": "knowledge:maintain",
  "agent_tools.knowledge_golden_rules_publish": "knowledge:maintain",
  "agent_tools.knowledge_golden_rules_rollback": "knowledge:maintain",
  "agent_tools.knowledge_rule_authoring_chat": "knowledge:maintain",
  "agent_tools.knowledge_gold_cases_save": "knowledge:maintain",
  "agent_tools.knowledge_distillation_runs_create": "knowledge:maintain",
  "agent_tools.knowledge_skill_evaluation_runs_create": "knowledge:maintain",
  "agent_tools.knowledge_skill_deployments_create": "knowledge:maintain",
  "agent_tools.knowledge_skill_deployments_rollback": "knowledge:maintain",
  "agent_tools.knowledge_training_sets_export": "knowledge:maintain",
  "agent_tools.knowledge_evaluation_runs_create": "knowledge:maintain",
  "agent_tools.knowledge_evolution_runs_create": "knowledge:maintain",
  "agent_tools.knowledge_hierarchy_audit": "knowledge:maintain",
  "agent_tools.knowledge_evolution_deployments_promote": "knowledge:maintain",
  "agent_tools.knowledge_evolution_deployments_rollback": "knowledge:maintain",
  "agent_tools.context_profiles_set": "knowledge:admin",
  "agent_tools.agent_workspace_submission_resolve": "knowledge:maintain",
  "agent_tools.agent_workspace_issue_resolve": "knowledge:maintain",
  "agent_tools.agent_workspace_lock": "knowledge:write",
  "agent_tools.knowledge_summarization_runs_create": "knowledge:write",
  "agent_tools.knowledge_summarization_runs_approve": "knowledge:maintain",
  "agent_sync.publish": "agent_sync:publish"
});

const TOOLSET_BY_SCOPE = Object.freeze({
  "knowledge:read": "splitall.knowledge.read",
  "knowledge:write": "splitall.knowledge.write",
  "knowledge:maintain": "splitall.knowledge.maintain",
  "knowledge:admin": "splitall.knowledge.admin",
  "storage:read": "splitall.storage.read",
  "jobs:read": "splitall.jobs.read",
  "agent_sync:publish": "splitall.agent.sync.publish"
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
  if (String(operation.id || "").startsWith("agent_tools.")) {
    return "knowledge:read";
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
  if (toolId.startsWith("splitall.agentWorkspace.")) {
    toolsets.add("splitall.agent.workspace");
  }
  if (toolId.includes(".renderMarkdown")) {
    toolsets.add("splitall.result.export");
  }
  if (toolId.includes(".asset") || toolId.includes(".evidence")) {
    toolsets.add("splitall.document.parse");
  }
  if (operation.id === "agent_sync.publish") {
    toolsets.add("splitall.agent.sync.publish");
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
  owner = "splitall",
  source = "handler-backed",
  handlerId,
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
    tags: uniqueStrings([source, risk, ...tags])
  };
}

function createInternalToolDefinitions() {
  return [
    createInternalToolDefinition({
      id: "agent-exploration.knowledge_skill_search",
      label: "Agent exploration skill search",
      description: "Search published SplitAll KnowledgeSkills inside the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.knowledge_skill_search",
      toolsets: ["splitall.knowledge.read"],
      requiredScopes: ["knowledge:read"],
      tags: ["agent-exploration"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.keyword_search",
      label: "Agent exploration keyword search",
      description: "Run local knowledge recall inside the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.keyword_search",
      toolsets: ["splitall.knowledge.read"],
      requiredScopes: ["knowledge:read"],
      tags: ["agent-exploration"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.knowledge_aggregate",
      label: "Agent exploration aggregate",
      description: "Run knowledge aggregation inside the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.knowledge_aggregate",
      toolsets: ["splitall.knowledge.read"],
      requiredScopes: ["knowledge:read"],
      tags: ["agent-exploration"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.open_evidence",
      label: "Agent exploration open evidence",
      description: "Open a specific evidence pack inside the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.open_evidence",
      toolsets: ["splitall.knowledge.read", "splitall.document.parse"],
      requiredScopes: ["knowledge:read"],
      tags: ["agent-exploration"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.knowledge_skill_propose",
      label: "Agent exploration skill proposal",
      description: "Create a pending-review KnowledgeSkill from evidence found by an exploration run.",
      handlerId: "AgentExplorationRuntime.knowledge_skill_propose",
      toolsets: ["splitall.knowledge.write", "splitall.agent.workspace"],
      requiredScopes: ["knowledge:read", "knowledge:write"],
      risk: "safe_write",
      tags: ["agent-exploration"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.http_request",
      label: "Agent exploration HTTP request",
      description: "Call an allowlisted HTTP endpoint from the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.http_request",
      toolsets: ["splitall.agent.workspace"],
      requiredScopes: ["knowledge:read", "knowledge:write"],
      risk: "safe_write",
      tags: ["agent-exploration", "allowlisted-http"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.local_command",
      label: "Agent exploration local command",
      description: "Run an allowlisted local command from the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.local_command",
      toolsets: ["splitall.mount.dev"],
      requiredScopes: ["knowledge:admin"],
      risk: "repair_write",
      tags: ["agent-exploration", "allowlisted-command"]
    }),
    ...[
      ["system.health", "System health", "splitall.runtime.read", "storage:read", "read_only"],
      ["runtime.info", "Runtime info", "splitall.runtime.read", "storage:read", "read_only"],
      ["storage.summary", "Storage summary", "splitall.storage.read", "storage:read", "read_only"],
      ["storage.doctor", "Storage doctor", "splitall.runtime.read", "storage:read", "read_only"],
      ["storage.reconcile", "Storage reconcile", "splitall.runtime.maintain", "knowledge:maintain", "repair_write"],
      ["jobs.list", "Jobs list", "splitall.jobs.read", "jobs:read", "read_only"],
      ["jobs.failed_review", "Failed jobs review", "splitall.jobs.read", "jobs:read", "read_only"],
      ["knowledge.health", "Knowledge health", "splitall.knowledge.read", "knowledge:read", "read_only"],
      ["knowledge.maintenance.settings", "Knowledge maintenance settings", "splitall.knowledge.maintain", "knowledge:maintain", "read_only"],
      ["knowledge.maintenance.run", "Knowledge maintenance run", "splitall.knowledge.maintain", "knowledge:maintain", "safe_write"],
      ["knowledge.reindex", "Knowledge reindex", "splitall.knowledge.maintain", "knowledge:maintain", "repair_write"],
      ["runtime.reload_mounts", "Runtime reload mounts", "splitall.runtime.maintain", "knowledge:maintain", "repair_write"]
    ].map(([toolName, label, toolset, scope, risk]) =>
      createInternalToolDefinition({
        id: `maintenance-agent.${toolName}`,
        label: `Maintenance agent ${label}`,
        description: `Run ${label.toLowerCase()} through the MaintenanceAgent internal tool registry.`,
        handlerId: `MaintenanceAgent.${toolName}`,
        toolsets: [toolset],
        requiredScopes: [scope],
        risk,
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

export function createToolCatalog({ operations = [] } = {}) {
  const operationsById = new Map(operations.map((operation) => [operation.id, operation]));
  const tools = [];
  for (const operation of operations) {
    if (operation.feature !== "agent_tools" && operation.id !== "agent_sync.publish") {
      continue;
    }
    const toolId = LEGACY_TOOL_ID_BY_OPERATION_ID[operation.id];
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
      owner: "splitall",
      source: "operation-backed",
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
      tags: uniqueStrings([operation.feature, operation.binary ? "binary" : "", risk]),
      legacy: {
        method,
        endpoint,
        scope
      }
    });
  }
  tools.push(...createInternalToolDefinitions());
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

export function createToolCatalogRegistry({ operations = [] } = {}) {
  let catalog = createToolCatalog({ operations });
  let toolsById = new Map(catalog.tools.map((tool) => [tool.id, tool]));
  let toolsByOperationId = new Map(catalog.tools.filter((tool) => tool.operationId).map((tool) => [tool.operationId, tool]));

  function refresh(nextOperations = operations) {
    catalog = createToolCatalog({ operations: nextOperations });
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

export function legacyToolPlatformToolsFromCatalog(catalog) {
  return (catalog.tools || [])
    .filter((tool) => tool.operationId || tool.legacy?.endpoint)
    .map((tool) => ({
    id: tool.id,
    label: tool.label,
    method: tool.legacy?.method || tool.transport?.http?.method || "POST",
    endpoint: tool.legacy?.endpoint || tool.transport?.http?.path || "",
    scope: tool.legacy?.scope || tool.requiredScopes?.[0] || "",
    description: tool.description
  }));
}
