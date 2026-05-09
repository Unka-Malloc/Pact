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

const TOOL_ID_BY_OPERATION_ID = Object.freeze({
  "storage.summary": "splitall.storageSummary",
  "jobs.list": "splitall.jobs.list",
  "jobs.get": "splitall.jobs.get",
  "knowledge.affair_taxonomy": "splitall.knowledge.affairTaxonomy",
  "knowledge.console": "splitall.knowledge.console",
  "knowledge.config_schema": "splitall.knowledge.configSchema",
  "knowledge.capabilities": "splitall.knowledge.capabilities",
  "knowledge.health": "splitall.knowledge.health",
  "knowledge.maintenance.get": "splitall.knowledge.maintenance.get",
  "knowledge.maintenance.set": "splitall.knowledge.maintenance.set",
  "knowledge.reindex": "splitall.knowledge.reindex",
  "knowledge.maintenance.run": "splitall.knowledge.maintenance.run",
  "knowledge.sync": "splitall.knowledge.sync",
  "knowledge.changes": "splitall.knowledge.changes",
  "knowledge.review_items": "splitall.knowledge.reviewItems",
  "knowledge.review_resolve": "splitall.knowledge.reviewResolve",
  "knowledge.feedback": "splitall.knowledge.feedback",
  "knowledge.suggestions": "splitall.knowledge.suggestions",
  "knowledge.suggestion_resolve": "splitall.knowledge.suggestionResolve",
  "knowledge.learning.jobs": "splitall.knowledge.learning.jobs",
  "knowledge.learning.health": "splitall.knowledge.learning.health",
  "knowledge.evidence_gate.evaluate": "splitall.knowledge.evidenceGate.evaluate",
  "knowledge.agent_skill.describe": "splitall.knowledge.agentSkill",
  "knowledge.agent_skill.plan": "splitall.knowledge.agentSkill.plan",
  "knowledge.agent_skill.run": "splitall.knowledge.agentSkill.run",
  "knowledge.skills.list": "splitall.knowledge.skills.list",
  "knowledge.skills.get": "splitall.knowledge.skills.get",
  "knowledge.skills.generate": "splitall.knowledge.skills.generate",
  "knowledge.skills.propose": "splitall.knowledge.skills.propose",
  "knowledge.skills.resolve": "splitall.knowledge.skills.resolve",
  "knowledge.skills.framework": "splitall.knowledge.skillFramework",
  "knowledge.skills.framework_save": "splitall.knowledge.skillFramework.set",
  "knowledge.golden_rules.list": "splitall.knowledge.goldenRules.list",
  "knowledge.golden_rules.save": "splitall.knowledge.goldenRules.set",
  "knowledge.golden_rules.publish": "splitall.knowledge.goldenRules.publish",
  "knowledge.golden_rules.rollback": "splitall.knowledge.goldenRules.rollback",
  "knowledge.rule_authoring.chat": "splitall.knowledge.ruleAuthoring.chat",
  "knowledge.rule_authoring.runs.get": "splitall.knowledge.ruleAuthoring.run",
  "knowledge.gold_cases.list": "splitall.knowledge.goldCases.list",
  "knowledge.gold_cases.save": "splitall.knowledge.goldCases.set",
  "knowledge.distillation.runs.create": "splitall.knowledge.distillation.runs.create",
  "knowledge.distillation.runs.get": "splitall.knowledge.distillation.runs.get",
  "knowledge.skills.evaluation.runs.create": "splitall.knowledge.skills.evaluation.runs.create",
  "knowledge.skills.deployments.create": "splitall.knowledge.skills.deployments.create",
  "knowledge.skills.deployments.rollback": "splitall.knowledge.skills.deployments.rollback",
  "knowledge.training_sets.export": "splitall.knowledge.trainingSets.export",
  "knowledge.evaluation.runs.create": "splitall.knowledge.evaluation.runs.create",
  "knowledge.evaluation.runs.list": "splitall.knowledge.evaluation.runs.list",
  "knowledge.evaluation.runs.get": "splitall.knowledge.evaluation.runs.get",
  "knowledge.model_roles": "splitall.knowledge.modelRoles",
  "knowledge.model_decision": "splitall.knowledge.modelDecision",
  "knowledge.evolution.describe": "splitall.knowledge.evolution",
  "knowledge.evolution.runs.create": "splitall.knowledge.evolution.runs.create",
  "knowledge.evolution.runs.list": "splitall.knowledge.evolution.runs.list",
  "knowledge.evolution.runs.get": "splitall.knowledge.evolution.runs.get",
  "knowledge.hierarchy.audit": "splitall.knowledge.hierarchy.audit",
  "knowledge.evolution.deployments.list": "splitall.knowledge.evolution.deployments.list",
  "knowledge.evolution.deployments.promote": "splitall.knowledge.evolution.deployments.promote",
  "knowledge.evolution.deployments.rollback": "splitall.knowledge.evolution.deployments.rollback",
  "context.profiles.get": "splitall.context.profiles",
  "context.profiles.set": "splitall.context.profiles.set",
  "client_runtime.profiles.get": "splitall.clientRuntime.profiles",
  "client_runtime.profiles.set": "splitall.clientRuntime.profiles.set",
  "client_runtime.resolve": "splitall.clientRuntime.resolve",
  "client_runtime.status": "splitall.clientRuntime.status",
  "agent_workspaces.list": "splitall.agentWorkspace.list",
  "agent_workspaces.get": "splitall.agentWorkspace.get",
  "agent_workspaces.submissions.resolve": "splitall.agentWorkspace.submissionResolve",
  "agent_workspaces.issues.resolve": "splitall.agentWorkspace.issueResolve",
  "agent_workspaces.locks.list": "splitall.agentWorkspace.locks",
  "agent_workspaces.locks.write": "splitall.agentWorkspace.lock",
  "knowledge.summarization.runs.create": "splitall.knowledge.summarization.runs.create",
  "knowledge.summarization.runs.get": "splitall.knowledge.summarization.runs.get",
  "knowledge.summarization.runs.approve": "splitall.knowledge.summarization.runs.approve",
  "knowledge.search": "splitall.knowledge.search",
  "knowledge.document_structure": "splitall.knowledge.documentStructure",
  "knowledge.item": "splitall.knowledge.item",
  "knowledge.evidence": "splitall.knowledge.evidence",
  "knowledge.asset": "splitall.knowledge.asset",
  "knowledge.render_markdown": "splitall.knowledge.renderMarkdown",
  "knowledge.graph": "splitall.knowledge.graph",
  "agent_sync.publish": "splitall.agentSync.publish"
});

const SCOPE_BY_OPERATION_ID = Object.freeze({
  "storage.summary": "storage:read",
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
  "client_runtime.profiles.set": "knowledge:admin",
  "agent_workspaces.submissions.resolve": "knowledge:maintain",
  "agent_workspaces.issues.resolve": "knowledge:maintain",
  "agent_workspaces.locks.write": "knowledge:write",
  "knowledge.summarization.runs.create": "knowledge:write",
  "knowledge.summarization.runs.approve": "knowledge:maintain",
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
  const operationId = String(operation.id || "");
  if (
    operationId.startsWith("knowledge.") ||
    operationId.startsWith("context.") ||
    operationId.startsWith("client_runtime.") ||
    operationId.startsWith("agent_workspaces.")
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
      description: "Search published SplitAll KnowledgeSkills inside the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.knowledge_skill_search",
      toolsets: ["splitall.knowledge.read"],
      requiredScopes: ["knowledge:read"],
      featureId: "agent-exploration",
      tags: ["agent-exploration"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.keyword_search",
      label: "Agent exploration keyword search",
      description: "Run local knowledge recall inside the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.keyword_search",
      toolsets: ["splitall.knowledge.read"],
      requiredScopes: ["knowledge:read"],
      featureId: "agent-exploration",
      tags: ["agent-exploration"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.knowledge_aggregate",
      label: "Agent exploration aggregate",
      description: "Run knowledge aggregation inside the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.knowledge_aggregate",
      toolsets: ["splitall.knowledge.read"],
      requiredScopes: ["knowledge:read"],
      featureId: "agent-exploration",
      tags: ["agent-exploration"]
    }),
    createInternalToolDefinition({
      id: "agent-exploration.open_evidence",
      label: "Agent exploration open evidence",
      description: "Open a specific evidence pack inside the agent exploration runtime.",
      handlerId: "AgentExplorationRuntime.open_evidence",
      toolsets: ["splitall.knowledge.read", "splitall.document.parse"],
      requiredScopes: ["knowledge:read"],
      featureId: "agent-exploration",
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
      featureId: "agent-exploration",
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
      featureId: "agent-exploration",
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
      featureId: "agent-exploration",
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
      owner: "splitall",
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
