import {
  decorateServerApiOperations,
  serializableOperationSafety
} from "./operation-decorators.mjs";

const SERVER_API_OPERATION_DEFINITIONS = [
  {
    id: "system.health",
    feature: "system",
    label: "健康检查",
    target: { controller: "system", method: "handleHealthz" },
    http: { method: "GET", path: "/api/healthz", localInForwardMode: true },
    rpc: { method: "system.health" },
    cli: { command: ["health"], usage: "health" }
  },
  {
    id: "system.bootstrap",
    feature: "system",
    label: "客户端启动配置",
    target: { controller: "system", method: "handleBootstrap" },
    http: { method: "GET", path: "/api/bootstrap", localInForwardMode: true },
    rpc: { method: "system.bootstrap" },
    cli: { command: ["bootstrap"], usage: "bootstrap" }
  },
  {
    id: "system.interfaces",
    feature: "system",
    label: "接口注册表",
    target: { controller: "system", method: "handleListInterfaces" },
    http: { method: "GET", path: "/api/interfaces", localInForwardMode: true },
    rpc: { method: "system.interfaces" },
    cli: { command: ["interfaces"], usage: "interfaces [--format json|markdown]" },
    requiredScopes: ["console:read"]
  },
  {
    id: "production.health",
    feature: "production",
    label: "生产健康总览",
    target: { controller: "system", method: "handleProductionHealth" },
    http: { method: "GET", path: "/api/production/health", localInForwardMode: true },
    rpc: { method: "production.health" },
    cli: { command: ["production", "health"], usage: "production health" },
    requiredScopes: ["console:read"],
    readOnly: true,
    concurrencySafe: true,
    aspects: ["observability", "production-readiness"]
  },
  {
    id: "architecture.live_map",
    feature: "production",
    label: "架构运行状态映射",
    target: { controller: "system", method: "handleArchitectureLiveMap" },
    http: { method: "GET", path: "/api/architecture/live-map", localInForwardMode: true },
    rpc: { method: "architecture.live_map" },
    cli: { command: ["architecture", "live-map"], usage: "architecture live-map" },
    requiredScopes: ["console:read"],
    readOnly: true,
    concurrencySafe: true,
    aspects: ["architecture-live-map", "production-readiness"]
  },
  {
    id: "executive_report.list",
    feature: "production",
    label: "管理层报告列表",
    target: { controller: "system", method: "handleExecutiveReport" },
    http: { method: "GET", path: "/api/executive-report", localInForwardMode: true },
    rpc: { method: "executive_report.list" },
    cli: { command: ["executive-report"], usage: "executive-report" },
    requiredScopes: ["console:read"],
    readOnly: true,
    concurrencySafe: true,
    aspects: ["executive-report", "asset-value"]
  },
  {
    id: "executive_report.preview",
    feature: "production",
    label: "管理层报告预览",
    target: { controller: "system", method: "handleExecutiveReportPreview" },
    http: { method: "POST", path: "/api/executive-report/preview", localInForwardMode: true },
    rpc: { method: "executive_report.preview", body: "params" },
    cli: { command: ["executive-report", "preview"], usage: "executive-report preview --body report-input.json" },
    requiredScopes: ["console:read"],
    readOnly: true,
    safety: { risk: "read_only" },
    aspects: ["executive-report", "asset-value"]
  },
  {
    id: "executive_report.generate",
    feature: "production",
    label: "生成管理层报告",
    target: { controller: "system", method: "handleExecutiveReportGenerate" },
    http: { method: "POST", path: "/api/executive-report/generate", localInForwardMode: true },
    rpc: { method: "executive_report.generate", body: "params" },
    cli: { command: ["executive-report", "generate"], usage: "executive-report generate --body report-input.json" },
    requiredScopes: ["runtime:admin"],
    aspects: ["executive-report", "asset-value"],
    safety: { risk: "safe_write" }
  },
  {
    id: "module_ecosystem.templates",
    feature: "module_management",
    label: "模块生态模板",
    target: { controller: "system", method: "handleModuleTemplates" },
    http: { method: "GET", path: "/api/modules/templates", localInForwardMode: true },
    rpc: { method: "module_ecosystem.templates" },
    cli: { command: ["modules", "templates"], usage: "modules templates" },
    requiredScopes: ["console:read"],
    readOnly: true,
    concurrencySafe: true,
    aspects: ["module-ecosystem", "sdk"]
  },
  {
    id: "module_ecosystem.plan",
    feature: "module_management",
    label: "模块脚手架预案",
    target: { controller: "system", method: "handleModuleScaffoldPlan" },
    http: { method: "POST", path: "/api/modules/plan", localInForwardMode: true },
    rpc: { method: "module_ecosystem.plan", body: "params" },
    cli: { command: ["modules", "plan"], usage: "modules plan --body module.json" },
    requiredScopes: ["runtime:admin"],
    readOnly: true,
    concurrencySafe: false,
    aspects: ["module-ecosystem", "sdk"]
  },
  {
    id: "module_ecosystem.scaffold",
    feature: "module_management",
    label: "创建模块脚手架",
    target: { controller: "system", method: "handleModuleScaffold" },
    http: { method: "POST", path: "/api/modules/scaffold", localInForwardMode: true },
    rpc: { method: "module_ecosystem.scaffold", body: "params" },
    cli: { command: ["modules", "scaffold"], usage: "modules scaffold --body module.json" },
    requiredScopes: ["runtime:admin"],
    aspects: ["module-ecosystem", "sdk"],
    safety: { risk: "safe_write", requiresConfirmation: true, approvalScope: "runtime:admin" }
  },
  {
    id: "module_ecosystem.contract_test",
    feature: "module_management",
    label: "模块合同测试",
    target: { controller: "system", method: "handleModuleContractTest" },
    http: { method: "POST", path: "/api/modules/contract-test", localInForwardMode: true },
    rpc: { method: "module_ecosystem.contract_test", body: "params" },
    cli: { command: ["modules", "contract-test"], usage: "modules contract-test --body contract.json" },
    requiredScopes: ["runtime:admin"],
    readOnly: true,
    concurrencySafe: false,
    aspects: ["module-ecosystem", "sdk"]
  },
  {
    id: "workspace_governance.describe",
    feature: "agent_workspace",
    label: "工作空间组织治理总览",
    target: { controller: "system", method: "handleWorkspaceGovernance" },
    http: { method: "GET", path: "/api/workspace-governance", localInForwardMode: true },
    rpc: { method: "workspace_governance.describe" },
    cli: { command: ["workspace-governance"], usage: "workspace-governance" },
    requiredScopes: ["console:read"],
    readOnly: true,
    concurrencySafe: true,
    aspects: ["workspace-governance", "organization-policy"]
  },
  {
    id: "workspace_governance.policy.set",
    feature: "agent_workspace",
    label: "设置工作空间组织治理策略",
    target: { controller: "system", method: "handleWorkspaceGovernancePolicy" },
    http: { method: "POST", path: "/api/workspace-governance/policies", localInForwardMode: true },
    rpc: { method: "workspace_governance.policy.set", body: "params" },
    cli: { command: ["workspace-governance", "policy", "set"], usage: "workspace-governance policy set --body policy.json" },
    requiredScopes: ["runtime:admin"],
    aspects: ["workspace-governance", "organization-policy"],
    safety: { risk: "repair_write", requiresConfirmation: true, approvalScope: "runtime:admin" }
  },
  {
    id: "workspace_governance.evaluate",
    feature: "agent_workspace",
    label: "评估工作空间组织治理策略",
    target: { controller: "system", method: "handleWorkspaceGovernanceEvaluate" },
    http: { method: "POST", path: "/api/workspace-governance/evaluate", localInForwardMode: true },
    rpc: { method: "workspace_governance.evaluate", body: "params" },
    cli: { command: ["workspace-governance", "evaluate"], usage: "workspace-governance evaluate --body request.json" },
    requiredScopes: ["console:read"],
    readOnly: false,
    safety: { risk: "safe_write" },
    aspects: ["workspace-governance", "organization-policy"]
  },
  {
    id: "workspace_governance.share_grant",
    feature: "agent_workspace",
    label: "创建工作空间共享授权",
    target: { controller: "system", method: "handleWorkspaceGovernanceShareGrant" },
    http: { method: "POST", path: "/api/workspace-governance/share-grants", localInForwardMode: true },
    rpc: { method: "workspace_governance.share_grant", body: "params" },
    cli: { command: ["workspace-governance", "share-grant"], usage: "workspace-governance share-grant --body grant.json" },
    requiredScopes: ["runtime:admin"],
    aspects: ["workspace-governance", "organization-policy"],
    safety: { risk: "safe_write", requiresConfirmation: true, approvalScope: "runtime:admin" }
  },
  {
    id: "asset_lineage.describe",
    feature: "knowledge",
    label: "多模态资产血缘总览",
    target: { controller: "system", method: "handleAssetLineage" },
    http: { method: "GET", path: "/api/asset-lineage", localInForwardMode: true },
    rpc: { method: "asset_lineage.describe" },
    cli: { command: ["asset-lineage"], usage: "asset-lineage" },
    requiredScopes: ["console:read"],
    readOnly: true,
    concurrencySafe: true,
    aspects: ["asset-lineage", "multimodal"]
  },
  {
    id: "asset_lineage.record",
    feature: "knowledge",
    label: "记录多模态资产血缘",
    target: { controller: "system", method: "handleAssetLineageRecord" },
    http: { method: "POST", path: "/api/asset-lineage/records", localInForwardMode: true },
    rpc: { method: "asset_lineage.record", body: "params" },
    cli: { command: ["asset-lineage", "record"], usage: "asset-lineage record --body record.json" },
    requiredScopes: ["runtime:admin"],
    aspects: ["asset-lineage", "multimodal"],
    safety: { risk: "safe_write" }
  },
  {
    id: "asset_lineage.trace",
    feature: "knowledge",
    label: "追踪多模态资产血缘",
    target: { controller: "system", method: "handleAssetLineageTrace" },
    http: { method: "POST", path: "/api/asset-lineage/trace", localInForwardMode: true },
    rpc: { method: "asset_lineage.trace", body: "params" },
    cli: { command: ["asset-lineage", "trace"], usage: "asset-lineage trace --body trace.json" },
    requiredScopes: ["console:read"],
    readOnly: true,
    aspects: ["asset-lineage", "multimodal"]
  },
  {
    id: "asset_lineage.reparse_plan",
    feature: "knowledge",
    label: "多模态资产重解析计划",
    target: { controller: "system", method: "handleAssetLineageReparsePlan" },
    http: { method: "POST", path: "/api/asset-lineage/reparse-plan", localInForwardMode: true },
    rpc: { method: "asset_lineage.reparse_plan", body: "params" },
    cli: { command: ["asset-lineage", "reparse-plan"], usage: "asset-lineage reparse-plan --body runtime.json" },
    requiredScopes: ["runtime:admin"],
    readOnly: true,
    aspects: ["asset-lineage", "multimodal"]
  },
  {
    id: "data_connectors.governance.describe",
    feature: "knowledge",
    label: "数据连接器治理总览",
    target: { controller: "system", method: "handleDataConnectorGovernance" },
    http: { method: "GET", path: "/api/data-connectors/governance", localInForwardMode: true },
    rpc: { method: "data_connectors.governance.describe" },
    cli: { command: ["data-connectors", "governance"], usage: "data-connectors governance" },
    requiredScopes: ["console:read"],
    readOnly: true,
    concurrencySafe: true,
    aspects: ["knowledge", "connector-governance"]
  },
  {
    id: "data_connectors.governance.plan",
    feature: "knowledge",
    label: "数据连接器治理预检",
    target: { controller: "system", method: "handleDataConnectorGovernancePlan" },
    http: { method: "POST", path: "/api/data-connectors/governance/plan", localInForwardMode: true },
    rpc: { method: "data_connectors.governance.plan", body: "params" },
    cli: { command: ["data-connectors", "governance", "plan"], usage: "data-connectors governance plan --body manifest.json" },
    requiredScopes: ["runtime:admin"],
    aspects: ["knowledge", "connector-governance"]
  },
  {
    id: "data_connectors.governance.conformance",
    feature: "knowledge",
    label: "数据连接器一致性验收",
    target: { controller: "system", method: "handleDataConnectorGovernanceConformance" },
    http: { method: "POST", path: "/api/data-connectors/governance/conformance", localInForwardMode: true },
    rpc: { method: "data_connectors.governance.conformance", body: "params" },
    cli: { command: ["data-connectors", "governance", "conformance"], usage: "data-connectors governance conformance --body manifest.json" },
    requiredScopes: ["runtime:admin"],
    aspects: ["knowledge", "connector-governance"]
  },
  {
    id: "performance.capacity.targets",
    feature: "production",
    label: "性能容量目标",
    target: { controller: "system", method: "handlePerformanceCapacityTargets" },
    http: { method: "GET", path: "/api/performance/capacity/targets", localInForwardMode: true },
    rpc: { method: "performance.capacity.targets" },
    cli: { command: ["performance", "capacity", "targets"], usage: "performance capacity targets" },
    requiredScopes: ["console:read"],
    readOnly: true,
    concurrencySafe: true,
    aspects: ["production-readiness", "capacity"]
  },
  {
    id: "performance.capacity.benchmark",
    feature: "production",
    label: "性能容量基准",
    target: { controller: "system", method: "handlePerformanceCapacityBenchmark" },
    http: { method: "POST", path: "/api/performance/capacity/benchmark", localInForwardMode: true },
    rpc: { method: "performance.capacity.benchmark", body: "params" },
    cli: { command: ["performance", "capacity", "benchmark"], usage: "performance capacity benchmark --body profile.json" },
    requiredScopes: ["runtime:admin"],
    aspects: ["production-readiness", "capacity"]
  },
  {
    id: "events.subscribe",
    feature: "events",
    label: "订阅上游发布事件",
    target: { controller: "system", method: "handleSubscribeEvents" },
    http: {
      method: "GET",
      path: "/api/events",
      localInForwardMode: true,
      query: [
        { name: "cursor", aliases: ["cursor", "since"] },
        { name: "topic", aliases: ["topic", "topics"] },
        { name: "limit", aliases: ["limit"] },
        { name: "timeoutMs", aliases: ["timeout-ms", "timeoutMs", "timeout"] },
        { name: "includeSnapshot", aliases: ["include-snapshot", "includeSnapshot", "snapshot"] }
      ],
      coerce: {
        cursor: "number",
        limit: "number",
        timeoutMs: "number",
        includeSnapshot: "boolean"
      }
    },
    rpc: {
      method: "events.subscribe",
      query: [
        { name: "cursor", aliases: ["cursor", "since"] },
        { name: "topic", aliases: ["topic", "topics"] },
        { name: "limit", aliases: ["limit"] },
        { name: "timeoutMs", aliases: ["timeout-ms", "timeoutMs", "timeout"] },
        { name: "includeSnapshot", aliases: ["include-snapshot", "includeSnapshot", "snapshot"] }
      ]
    },
    cli: {
      command: ["events", "subscribe"],
      aliases: [["events"]],
      usage: "events subscribe [--cursor N] [--topic jobs.job] [--timeout-ms 10000] [--include-snapshot 1]"
    }
  },
  {
    id: "agent_sync.config.get",
    feature: "agent_sync",
    label: "读取智能体客户端同步策略",
    target: { controller: "system", method: "handleAgentSyncConfig" },
    http: { method: "GET", path: "/api/agent-sync/config", localInForwardMode: true },
    rpc: { method: "agent_sync.config.get" },
    cli: { command: ["agent-sync", "config"], usage: "agent-sync config" },
    requiredScopes: ["console:read"]
  },
  {
    id: "agent_sync.config.set",
    feature: "agent_sync",
    label: "保存智能体客户端同步策略",
    target: { controller: "system", method: "handleAgentSyncConfig" },
    http: { method: "POST", path: "/api/agent-sync/config", localInForwardMode: true },
    rpc: { method: "agent_sync.config.set", body: "params" },
    cli: { command: ["agent-sync", "config", "set"], usage: "agent-sync config set --body sync.json" },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "agent_sync.publish",
    feature: "agent_sync",
    label: "智能体发布客户端同步事件",
    target: { controller: "system", method: "handleAgentSyncPublish" },
    http: { method: "POST", path: "/api/agent-sync/publish", localInForwardMode: true },
    rpc: { method: "agent_sync.publish", body: "params" },
    cli: {
      command: ["agent-sync", "publish"],
      usage: "agent-sync publish --topic answer --body payload.json --header 'Authorization: Bearer ...'"
    }
  },
  {
    id: "agent_sync.subscribe",
    feature: "agent_sync",
    label: "客户端订阅智能体同步事件",
    target: { controller: "system", method: "handleAgentSyncSubscribe" },
    http: {
      method: "GET",
      path: "/api/agent-sync/events",
      localInForwardMode: true,
      query: [
        { name: "cursor", aliases: ["cursor", "since"] },
        { name: "topic", aliases: ["topic", "topics"] },
        { name: "limit", aliases: ["limit"] },
        { name: "timeoutMs", aliases: ["timeout-ms", "timeoutMs", "timeout"] },
        { name: "includeSnapshot", aliases: ["include-snapshot", "includeSnapshot", "snapshot"] }
      ],
      coerce: {
        cursor: "number",
        limit: "number",
        timeoutMs: "number",
        includeSnapshot: "boolean"
      }
    },
    rpc: {
      method: "agent_sync.subscribe",
      query: [
        { name: "cursor", aliases: ["cursor", "since"] },
        { name: "topic", aliases: ["topic", "topics"] },
        { name: "limit", aliases: ["limit"] },
        { name: "timeoutMs", aliases: ["timeout-ms", "timeoutMs", "timeout"] },
        { name: "includeSnapshot", aliases: ["include-snapshot", "includeSnapshot", "snapshot"] }
      ]
    },
    cli: {
      command: ["agent-sync", "subscribe"],
      usage: "agent-sync subscribe [--topic answer] [--cursor N] [--include-snapshot 1]"
    }
  },
  {
    id: "system.console_state",
    feature: "system",
    label: "控制台状态",
    target: { controller: "system", method: "handleGetConsoleState" },
    http: { method: "GET", path: "/api/console/state" },
    rpc: { method: "system.console_state" },
    cli: { command: ["console"], usage: "console" },
    requiredScopes: ["console:read"]
  },
  {
    id: "maintenance_agent.config.get",
    feature: "maintenance_agent",
    label: "读取维护智能体配置",
    target: { controller: "system", method: "handleMaintenanceAgentConfig" },
    http: { method: "GET", path: "/api/maintenance-agent/config", localInForwardMode: true },
    rpc: { method: "maintenance_agent.config.get" },
    cli: {
      command: ["maintenance-agent", "config"],
      aliases: [["maintenance", "config"]],
      usage: "maintenance-agent config"
    },
    requiredScopes: ["maintenance:read"]
  },
  {
    id: "maintenance_agent.config.set",
    feature: "maintenance_agent",
    label: "保存维护智能体配置",
    target: { controller: "system", method: "handleMaintenanceAgentConfig" },
    http: { method: "POST", path: "/api/maintenance-agent/config", localInForwardMode: true },
    rpc: { method: "maintenance_agent.config.set", body: "params" },
    cli: {
      command: ["maintenance-agent", "config", "set"],
      aliases: [["maintenance", "config", "set"]],
      usage: "maintenance-agent config set --body maintenance-agent.json"
    },
    requiredScopes: ["maintenance:admin"]
  },
  {
    id: "maintenance_agent.chat",
    feature: "maintenance_agent",
    label: "维护智能体对话规划",
    target: { controller: "system", method: "handleMaintenanceAgentChat" },
    http: { method: "POST", path: "/api/maintenance-agent/chat", localInForwardMode: true },
    rpc: { method: "maintenance_agent.chat", body: "params" },
    cli: {
      command: ["maintenance-agent", "chat"],
      aliases: [["maintenance", "chat"]],
      usage: "maintenance-agent chat --message MESSAGE",
      bodyParams: [
        { name: "message", aliases: ["message", "question", "q"], required: true },
        { name: "wait", aliases: ["wait"], type: "boolean" }
      ]
    },
    requiredScopes: ["maintenance:run"]
  },
  {
    id: "maintenance_agent.runs.create",
    feature: "maintenance_agent",
    label: "创建维护智能体运行",
    target: { controller: "system", method: "handleMaintenanceAgentRuns" },
    http: { method: "POST", path: "/api/maintenance-agent/runs", localInForwardMode: true },
    rpc: { method: "maintenance_agent.runs.create", body: "params" },
    cli: {
      command: ["maintenance-agent", "run"],
      aliases: [["maintenance", "run"]],
      usage: "maintenance-agent run --runbook health_smoke",
      bodyParams: [
        { name: "runbook", aliases: ["runbook", "intent"] },
        { name: "wait", aliases: ["wait"], type: "boolean" }
      ]
    },
    requiredScopes: ["maintenance:run"]
  },
  {
    id: "maintenance_agent.runs.list",
    feature: "maintenance_agent",
    label: "维护智能体运行列表",
    target: { controller: "system", method: "handleMaintenanceAgentRuns" },
    http: {
      method: "GET",
      path: "/api/maintenance-agent/runs",
      localInForwardMode: true,
      query: [{ name: "limit", aliases: ["limit"] }],
      coerce: { limit: "number" }
    },
    rpc: {
      method: "maintenance_agent.runs.list",
      query: [{ name: "limit", aliases: ["limit"] }]
    },
    cli: {
      command: ["maintenance-agent", "runs"],
      aliases: [["maintenance", "runs"]],
      usage: "maintenance-agent runs [--limit 50]"
    },
    requiredScopes: ["maintenance:read"]
  },
  {
    id: "maintenance_agent.runs.get",
    feature: "maintenance_agent",
    label: "维护智能体运行详情",
    target: { controller: "system", method: "handleMaintenanceAgentRun" },
    http: { method: "GET", path: "/api/maintenance-agent/runs/:runId", localInForwardMode: true },
    rpc: {
      method: "maintenance_agent.runs.get",
      params: [{ name: "runId", aliases: ["run-id", "runId", "id"], required: true }]
    },
    cli: {
      command: ["maintenance-agent", "run", "get"],
      aliases: [["maintenance", "run", "get"]],
      usage: "maintenance-agent run get --id RUN_ID",
      pathParams: { runId: ["run-id", "runId", "id"] }
    },
    requiredScopes: ["maintenance:read"]
  },
  {
    id: "maintenance_agent.runs.approve",
    feature: "maintenance_agent",
    label: "批准维护智能体运行",
    target: { controller: "system", method: "handleMaintenanceAgentApprove" },
    http: { method: "POST", path: "/api/maintenance-agent/runs/:runId/approve", localInForwardMode: true },
    rpc: {
      method: "maintenance_agent.runs.approve",
      body: "params",
      params: [{ name: "runId", aliases: ["run-id", "runId", "id"], required: true }]
    },
    cli: {
      command: ["maintenance-agent", "approve"],
      aliases: [["maintenance", "approve"]],
      usage: "maintenance-agent approve --id RUN_ID --plan-hash HASH",
      pathParams: { runId: ["run-id", "runId", "id"] },
      bodyParams: [
        { name: "planHash", aliases: ["plan-hash", "planHash"], required: true },
        { name: "wait", aliases: ["wait"], type: "boolean" }
      ]
    },
    requiredScopes: ["maintenance:approve"]
  },
  {
    id: "maintenance_agent.runs.cancel",
    feature: "maintenance_agent",
    label: "取消维护智能体运行",
    target: { controller: "system", method: "handleMaintenanceAgentCancel" },
    http: { method: "POST", path: "/api/maintenance-agent/runs/:runId/cancel", localInForwardMode: true },
    rpc: {
      method: "maintenance_agent.runs.cancel",
      body: "params",
      params: [{ name: "runId", aliases: ["run-id", "runId", "id"], required: true }]
    },
    cli: {
      command: ["maintenance-agent", "cancel"],
      aliases: [["maintenance", "cancel"]],
      usage: "maintenance-agent cancel --id RUN_ID",
      pathParams: { runId: ["run-id", "runId", "id"] },
      bodyParams: [{ name: "reason", aliases: ["reason"] }]
    },
    requiredScopes: ["maintenance:run"]
  },
  {
    id: "auth.session",
    feature: "auth",
    label: "控制台登录状态",
    target: { controller: "system", method: "handleAuthSession" },
    http: { method: "GET", path: "/api/auth/session", localInForwardMode: true },
    rpc: { method: "auth.session" },
    cli: { command: ["auth", "session"], usage: "auth session" }
  },
  {
    id: "auth.bootstrap",
    feature: "auth",
    label: "初始化控制台 owner",
    target: { controller: "system", method: "handleAuthBootstrap" },
    http: { method: "POST", path: "/api/auth/bootstrap", localInForwardMode: true },
    rpc: { method: "auth.bootstrap", body: "params" },
    cli: { command: ["auth", "bootstrap"], usage: "auth bootstrap --body bootstrap.json" },
    skipCsrf: true
  },
  {
    id: "auth.login",
    feature: "auth",
    label: "控制台登录",
    target: { controller: "system", method: "handleAuthLogin" },
    http: { method: "POST", path: "/api/auth/login", localInForwardMode: true },
    rpc: { method: "auth.login", body: "params" },
    cli: { command: ["auth", "login"], usage: "auth login --body login.json" },
    skipCsrf: true
  },
  {
    id: "auth.logout",
    feature: "auth",
    label: "控制台退出",
    target: { controller: "system", method: "handleAuthLogout" },
    http: { method: "POST", path: "/api/auth/logout", localInForwardMode: true },
    rpc: { method: "auth.logout" },
    cli: { command: ["auth", "logout"], usage: "auth logout" },
    requiredScopes: ["console:read"]
  },
  {
    id: "auth.users",
    feature: "auth",
    label: "控制台用户列表/创建",
    target: { controller: "system", method: "handleAuthUsers" },
    http: { method: "GET", path: "/api/auth/users", localInForwardMode: true },
    rpc: { method: "auth.users" },
    cli: { command: ["auth", "users"], usage: "auth users" },
    requiredScopes: ["auth:admin"]
  },
  {
    id: "auth.users.create",
    feature: "auth",
    label: "创建控制台用户",
    target: { controller: "system", method: "handleAuthUsers" },
    http: { method: "POST", path: "/api/auth/users", localInForwardMode: true },
    rpc: { method: "auth.users.create", body: "params" },
    cli: { command: ["auth", "users", "create"], usage: "auth users create --body user.json" },
    requiredScopes: ["auth:admin"]
  },
  {
    id: "auth.users.update",
    feature: "auth",
    label: "更新控制台用户",
    target: { controller: "system", method: "handleAuthUpdateUser" },
    http: { method: "POST", path: "/api/auth/users/:userId", localInForwardMode: true },
    rpc: {
      method: "auth.users.update",
      body: "params",
      params: [{ name: "userId", aliases: ["user-id", "id"], required: true }]
    },
    cli: {
      command: ["auth", "users", "update"],
      usage: "auth users update --id USER_ID --body user.json",
      pathParams: { userId: ["user-id", "id"] }
    },
    requiredScopes: ["auth:admin"]
  },
  {
    id: "auth.roles.get",
    feature: "auth",
    label: "读取控制台角色",
    target: { controller: "system", method: "handleAuthRole" },
    http: { method: "POST", path: "/api/auth/roles/:roleId", localInForwardMode: true },
    rpc: {
      method: "auth.roles.get",
      params: [{ name: "roleId", aliases: ["role-id", "id"], required: true }]
    },
    cli: {
      command: ["auth", "roles", "get"],
      usage: "auth roles get --id ROLE_ID",
      pathParams: { roleId: ["role-id", "id"] }
    },
    requiredScopes: ["auth:admin"]
  },
  {
    id: "auth.oidc.get",
    feature: "auth",
    label: "读取 OIDC 配置",
    target: { controller: "system", method: "handleAuthOidc" },
    http: { method: "GET", path: "/api/auth/oidc", localInForwardMode: true },
    rpc: { method: "auth.oidc.get" },
    cli: { command: ["auth", "oidc"], usage: "auth oidc" },
    requiredScopes: ["auth:admin"]
  },
  {
    id: "auth.oidc.set",
    feature: "auth",
    label: "保存 OIDC 配置",
    target: { controller: "system", method: "handleAuthOidc" },
    http: { method: "POST", path: "/api/auth/oidc", localInForwardMode: true },
    rpc: { method: "auth.oidc.set", body: "params" },
    cli: { command: ["auth", "oidc", "set"], usage: "auth oidc set --body oidc.json" },
    requiredScopes: ["auth:admin"]
  },
  {
    id: "auth.audit",
    feature: "auth",
    label: "控制台审计日志",
    target: { controller: "system", method: "handleAuthAudit" },
    http: {
      method: "GET",
      path: "/api/auth/audit",
      localInForwardMode: true,
      query: [
        { name: "limit", aliases: ["limit"] },
        { name: "userId", aliases: ["user-id", "userId"] },
        { name: "status", aliases: ["status"] }
      ],
      coerce: { limit: "number" }
    },
    rpc: {
      method: "auth.audit",
      query: [
        { name: "limit", aliases: ["limit"] },
        { name: "userId", aliases: ["user-id", "userId"] },
        { name: "status", aliases: ["status"] }
      ]
    },
    cli: { command: ["auth", "audit"], usage: "auth audit [--limit 100]" },
    requiredScopes: ["auth:admin"]
  },
  {
    id: "auth.sessions",
    feature: "auth",
    label: "控制台会话列表",
    target: { controller: "system", method: "handleAuthSessions" },
    http: { method: "GET", path: "/api/auth/sessions", localInForwardMode: true },
    rpc: { method: "auth.sessions" },
    cli: { command: ["auth", "sessions"], usage: "auth sessions" },
    requiredScopes: ["auth:admin"]
  },
  {
    id: "auth.sessions.revoke",
    feature: "auth",
    label: "撤销控制台会话",
    target: { controller: "system", method: "handleAuthRevokeSession" },
    http: { method: "POST", path: "/api/auth/sessions/:sessionId/revoke", localInForwardMode: true },
    rpc: {
      method: "auth.sessions.revoke",
      params: [{ name: "sessionId", aliases: ["session-id", "id"], required: true }]
    },
    cli: {
      command: ["auth", "sessions", "revoke"],
      usage: "auth sessions revoke --id SESSION_ID",
      pathParams: { sessionId: ["session-id", "id"] }
    },
    requiredScopes: ["auth:admin"]
  },
  {
    id: "discovery.check_in",
    feature: "discovery",
    label: "客户端迁移登记",
    target: { controller: "system", method: "handleDiscoveryCheckIn" },
    http: { method: "POST", path: "/api/discovery/check-in", localInForwardMode: true },
    rpc: { method: "discovery.check_in", body: "params" },
    cli: { command: ["discovery", "check-in"], usage: "discovery check-in --body check-in.json" }
  },
  {
    id: "discovery.clients",
    feature: "discovery",
    label: "客户端迁移列表",
    target: { controller: "system", method: "handleListDiscoveryClients" },
    http: { method: "GET", path: "/api/discovery/clients", localInForwardMode: true },
    rpc: { method: "discovery.clients" },
    cli: { command: ["discovery", "clients"], usage: "discovery clients" }
  },
  {
    id: "discovery.clients.migration",
    feature: "discovery",
    label: "向客户端发布迁移指令",
    target: { controller: "system", method: "handleRequestClientMigration" },
    http: {
      method: "POST",
      path: "/api/discovery/clients/:clientId/migration",
      localInForwardMode: true
    },
    rpc: {
      method: "discovery.clients.migration",
      body: "params",
      params: [{ name: "clientId", aliases: ["client-id", "id"], required: true }]
    },
    cli: {
      command: ["discovery", "clients", "migration"],
      usage: "discovery clients migration --client-id CLIENT_ID",
      pathParams: { clientId: ["client-id", "id"] }
    },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "discovery.get_config",
    feature: "discovery",
    label: "读取服务发现配置",
    target: { controller: "system", method: "handleGetDiscoveryConfig" },
    http: { method: "GET", path: "/api/discovery/config" },
    rpc: { method: "discovery.get_config" },
    cli: { command: ["discovery", "get"], aliases: [["discovery"]], usage: "discovery get" },
    requiredScopes: ["console:read"]
  },
  {
    id: "discovery.set_config",
    feature: "discovery",
    label: "保存服务发现配置",
    target: { controller: "system", method: "handleSetDiscoveryConfig" },
    http: { method: "POST", path: "/api/discovery/config" },
    rpc: { method: "discovery.set_config", body: "params" },
    cli: { command: ["discovery", "set"], usage: "discovery set --body discovery.json" },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "runtime.info",
    feature: "runtime",
    label: "运行时信息",
    target: { controller: "system", method: "handleGetRuntimeInfo" },
    http: { method: "GET", path: "/api/runtime/info" },
    rpc: { method: "runtime.info" },
    cli: { command: ["runtime"], usage: "runtime" },
    requiredScopes: ["console:read"]
  },
  {
    id: "runtime.path_browse",
    feature: "runtime",
    label: "服务端路径浏览",
    target: { controller: "system", method: "handleBrowseServerPath" },
    http: { method: "POST", path: "/api/runtime/path-browse", localInForwardMode: true },
    rpc: { method: "runtime.path_browse", body: "params" },
    cli: { command: ["runtime", "path-browse"], usage: "runtime path-browse --body request.json" },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "runtime.mounts",
    feature: "runtime",
    label: "读取挂载配置",
    target: { controller: "system", method: "handleGetMounts" },
    http: { method: "GET", path: "/api/runtime/mounts" },
    rpc: { method: "runtime.mounts" },
    cli: { command: ["runtime", "mounts"], aliases: [["mounts"]], usage: "runtime mounts" },
    requiredScopes: ["console:read"]
  },
  {
    id: "runtime.set_mounts",
    feature: "runtime",
    label: "保存挂载配置",
    target: { controller: "system", method: "handleSetMounts" },
    http: { method: "POST", path: "/api/runtime/mounts" },
    rpc: { method: "runtime.set_mounts", body: "params" },
    cli: { command: ["mounts", "set"], usage: "mounts set --body mount-config.json" },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "runtime.reload_mounts",
    feature: "runtime",
    label: "重载挂载配置",
    target: { controller: "system", method: "handleReloadMounts" },
    http: { method: "POST", path: "/api/runtime/mounts/reload" },
    rpc: { method: "runtime.reload_mounts", body: "params" },
    cli: { command: ["mounts", "reload"], usage: "mounts reload [--body settings.json]" },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "settings.get",
    feature: "settings",
    label: "读取服务设置",
    target: { controller: "system", method: "handleGetSettings" },
    http: { method: "GET", path: "/api/settings" },
    rpc: { method: "settings.get" },
    cli: { command: ["settings", "get"], aliases: [["settings"]], usage: "settings get" },
    requiredScopes: ["console:read"]
  },
  {
    id: "settings.set",
    feature: "settings",
    label: "保存服务设置",
    target: { controller: "system", method: "handleSetSettings" },
    http: { method: "POST", path: "/api/settings" },
    rpc: { method: "settings.set", body: "params" },
    cli: { command: ["settings", "set"], usage: "settings set --body settings.json" },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "settings.model_probe",
    feature: "settings",
    label: "探测模型连通性",
    target: { controller: "system", method: "handleProbeModel" },
    http: { method: "POST", path: "/api/settings/model-probe" },
    rpc: { method: "settings.model_probe", body: "params" },
    cli: {
      command: ["settings", "probe-model"],
      usage: "settings probe-model --provider PROVIDER [--body settings.json]",
      bodyParams: [
        { name: "provider", aliases: ["provider", "model-provider"], required: true }
      ]
    },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "agent_gateway.config.get",
    feature: "custom_http_adapter",
    label: "读取自定义 HTTP Adapter 配置",
    target: { controller: "system", method: "handleAgentGatewayConfig" },
    http: { method: "GET", path: "/api/agent-gateway/config" },
    rpc: { method: "agent_gateway.config.get" },
    cli: {
      command: ["agent-gateway", "config"],
      usage: "agent-gateway config"
    },
    requiredScopes: ["console:read"]
  },
  {
    id: "agent_gateway.config.set",
    feature: "custom_http_adapter",
    label: "保存自定义 HTTP Adapter 配置",
    target: { controller: "system", method: "handleAgentGatewayConfig" },
    http: { method: "POST", path: "/api/agent-gateway/config" },
    rpc: { method: "agent_gateway.config.set", body: "params" },
    cli: {
      command: ["agent-gateway", "config", "set"],
      usage: "agent-gateway config set --body agent-gateway.json"
    },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "agent_gateway.call",
    feature: "agent_gateway",
    label: "调用智能体模型接入点",
    target: { controller: "system", method: "handleAgentGatewayCall" },
    http: { method: "POST", path: "/api/agent-gateway/call" },
    rpc: { method: "agent_gateway.call", body: "params" },
    cli: {
      command: ["agent-gateway", "call"],
      usage: "agent-gateway call --question QUESTION [--workspace-id WORKSPACE_ID] [--agent-session-id SESSION_ID] [--tool-grant-id GRANT_ID] [--agent-name NAME] [--plugin-list a,b]",
      bodyParams: [
        { name: "agentName", aliases: ["agent-name", "agentName"] },
        { name: "pluginList", aliases: ["plugin-list", "pluginList"] },
        { name: "question", aliases: ["question", "q"], required: true },
        { name: "sessionId", aliases: ["session-id", "sessionId"] },
        { name: "agentSessionId", aliases: ["agent-session-id", "agentSessionId", "session-thread-id", "sessionThreadId"] },
        { name: "clientUid", aliases: ["client-uid", "clientUid"] },
        { name: "modelAlias", aliases: ["model-alias", "modelAlias", "alias", "model"] },
        { name: "contextProfileId", aliases: ["context-profile", "context-profile-id", "contextProfileId"] },
        { name: "toolGrantId", aliases: ["tool-grant-id", "toolGrantId", "grant-id", "grantId"] },
        { name: "workspaceId", aliases: ["workspace-id", "workspaceId"] },
        { name: "userId", aliases: ["user-id", "userId"] },
        { name: "projectId", aliases: ["project-id", "projectId"] },
        { name: "engine", aliases: ["engine"] }
      ]
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "model_routing.health",
    feature: "agent_gateway",
    label: "读取模型路由健康和成本台账",
    target: { controller: "system", method: "handleModelRoutingHealth" },
    http: {
      method: "GET",
      path: "/api/model-routing/health",
      query: [{ name: "limit", aliases: ["limit"] }],
      coerce: { limit: "number" }
    },
    rpc: { method: "model_routing.health" },
    cli: {
      command: ["model-routing", "health"],
      usage: "model-routing health [--limit 50]"
    },
    requiredScopes: ["console:read"],
    readOnly: true,
    concurrencySafe: true,
    aspects: ["model-routing", "cost-ledger", "circuit-breaker"]
  },
  {
    id: "capability_packages.list",
    feature: "tool_management",
    label: "列出外部工具与技能能力包",
    target: { controller: "system", method: "handleCapabilityPackages" },
    http: { method: "GET", path: "/api/capability-packages" },
    rpc: { method: "capability_packages.list" },
    cli: { command: ["capability-packages", "list"], usage: "capability-packages list" },
    requiredScopes: ["console:read"],
    readOnly: true,
    concurrencySafe: true,
    aspects: ["tool-package", "skill-registry", "lifecycle-governance"]
  },
  {
    id: "capability_packages.plan",
    feature: "tool_management",
    label: "预检外部工具与技能能力包",
    target: { controller: "system", method: "handleCapabilityPackagePlan" },
    http: { method: "POST", path: "/api/capability-packages/plan" },
    rpc: { method: "capability_packages.plan", body: "params" },
    cli: { command: ["capability-packages", "plan"], usage: "capability-packages plan --body manifest.json" },
    requiredScopes: ["runtime:admin"],
    readOnly: true,
    concurrencySafe: true,
    aspects: ["tool-package", "skill-registry", "signature", "compatibility"]
  },
  {
    id: "capability_packages.submit",
    feature: "tool_management",
    label: "提交外部工具与技能能力包",
    target: { controller: "system", method: "handleCapabilityPackages" },
    http: { method: "POST", path: "/api/capability-packages" },
    rpc: { method: "capability_packages.submit", body: "params" },
    cli: { command: ["capability-packages", "submit"], usage: "capability-packages submit --body manifest.json" },
    requiredScopes: ["runtime:admin"],
    aspects: ["tool-package", "skill-registry", "signature", "approval"]
  },
  {
    id: "capability_packages.lifecycle",
    feature: "tool_management",
    label: "推进外部工具与技能能力包生命周期",
    target: { controller: "system", method: "handleCapabilityPackageLifecycle" },
    http: { method: "POST", path: "/api/capability-packages/:packageId/lifecycle" },
    rpc: {
      method: "capability_packages.lifecycle",
      body: "params",
      params: [{ name: "packageId", aliases: ["package-id", "packageId", "id"], required: true }]
    },
    cli: {
      command: ["capability-packages", "lifecycle"],
      usage: "capability-packages lifecycle --id PACKAGE_ID --action approve|install|activate|deprecate|rollback",
      pathParams: { packageId: ["package-id", "packageId", "id"] }
    },
    requiredScopes: ["runtime:admin"],
    aspects: ["tool-package", "skill-registry", "approval", "rollback", "deprecation"]
  },
  {
    id: "agents.list",
    feature: "agent_gateway",
    label: "列出可用智能体模型接入点",
    target: { controller: "system", method: "handleAgentRegistry" },
    http: { method: "GET", path: "/api/agents" },
    rpc: { method: "agents.list" },
    cli: {
      command: ["agents", "list"],
      usage: "agents list"
    }
  },
  {
    id: "agents.create",
    feature: "agent_gateway",
    label: "创建智能体模型配置",
    target: { controller: "system", method: "handleCreateAgent" },
    http: { method: "POST", path: "/api/agents" },
    rpc: { method: "agents.create", body: "params" },
    cli: {
      command: ["agents", "create"],
      usage: "agents create --name NAME --model MODEL [--provider deepseek] [--api-key KEY]",
      bodyParams: [
        { name: "provider", aliases: ["provider", "model-provider"] },
        { name: "name", aliases: ["name", "agent-name", "agentName", "label"] },
        { name: "model", aliases: ["model", "model-id", "modelId", "engine"], required: true },
        { name: "baseUrl", aliases: ["base-url", "baseUrl"] },
        { name: "url", aliases: ["url", "endpoint"] },
        { name: "apiKey", aliases: ["api-key", "apiKey", "key"] },
        { name: "token", aliases: ["token"] },
        { name: "tokenHeader", aliases: ["token-header", "tokenHeader"] },
        { name: "tokenPrefix", aliases: ["token-prefix", "tokenPrefix"] },
        { name: "systemPrompt", aliases: ["system-prompt", "systemPrompt", "prompt"] },
        { name: "parameters", aliases: ["parameters", "params"], type: "json" },
        { name: "pluginList", aliases: ["plugin-list", "pluginList", "plugins"], type: "string-list" },
        { name: "timeoutMs", aliases: ["timeout-ms", "timeoutMs"], type: "number" }
      ]
    },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "agents.update",
    feature: "agent_gateway",
    label: "更新智能体模型配置",
    target: { controller: "system", method: "handleUpdateAgent" },
    http: { method: "POST", path: "/api/agents/:agentId" },
    rpc: {
      method: "agents.update",
      body: "params",
      params: [{ name: "agentId", aliases: ["agent-id", "agentId", "id"], required: true }]
    },
    cli: {
      command: ["agents", "update"],
      usage: "agents update --id AGENT_UID [--name NAME] [--model MODEL] [--body patch.json]",
      pathParams: { agentId: ["agent-id", "agentId", "id"] },
      bodyParams: [
        { name: "provider", aliases: ["provider", "model-provider"] },
        { name: "name", aliases: ["name", "agent-name", "agentName", "label"] },
        { name: "model", aliases: ["model", "model-id", "modelId", "engine"] },
        { name: "baseUrl", aliases: ["base-url", "baseUrl"] },
        { name: "url", aliases: ["url", "endpoint"] },
        { name: "apiKey", aliases: ["api-key", "apiKey", "key"] },
        { name: "token", aliases: ["token"] },
        { name: "tokenHeader", aliases: ["token-header", "tokenHeader"] },
        { name: "tokenPrefix", aliases: ["token-prefix", "tokenPrefix"] },
        { name: "systemPrompt", aliases: ["system-prompt", "systemPrompt", "prompt"] },
        { name: "parameters", aliases: ["parameters", "params"], type: "json" },
        { name: "pluginList", aliases: ["plugin-list", "pluginList", "plugins"], type: "string-list" },
        { name: "timeoutMs", aliases: ["timeout-ms", "timeoutMs"], type: "number" }
      ]
    },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "agents.delete",
    feature: "agent_gateway",
    label: "删除智能体模型配置",
    target: { controller: "system", method: "handleDeleteAgent" },
    http: { method: "DELETE", path: "/api/agents/:agentId" },
    rpc: {
      method: "agents.delete",
      params: [{ name: "agentId", aliases: ["agent-id", "agentId", "id"], required: true }]
    },
    cli: {
      command: ["agents", "delete"],
      usage: "agents delete --id AGENT_UID",
      pathParams: { agentId: ["agent-id", "agentId", "id"] }
    },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "oauth.codex_status",
    feature: "oauth",
    label: "Codex OAuth 状态",
    target: { controller: "system", method: "handleGetCodexOAuthStatus" },
    http: { method: "GET", path: "/api/oauth/codex/status", localInForwardMode: true },
    rpc: { method: "oauth.codex_status" },
    cli: { command: ["oauth", "status"], aliases: [["oauth"]], usage: "oauth status" }
  },
  {
    id: "oauth.codex_login",
    feature: "oauth",
    label: "Codex OAuth 登录",
    target: { controller: "system", method: "handleStartCodexOAuthLogin" },
    http: { method: "POST", path: "/api/oauth/codex/login", localInForwardMode: true },
    rpc: { method: "oauth.codex_login" },
    cli: { command: ["oauth", "login"], usage: "oauth login" }
  },
  {
    id: "oauth.codex_return",
    feature: "oauth",
    label: "Codex OAuth 回跳",
    target: { controller: "system", method: "handleCodexOAuthReturn" },
    http: { method: "GET", path: "/api/oauth/codex/return", localInForwardMode: true },
    rpc: { method: "oauth.codex_return" },
    cli: { command: ["oauth", "return"], usage: "oauth return" },
    binary: true
  },
  {
    id: "tool_management.catalog",
    feature: "tool_management",
    label: "工具管理目录",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "GET", path: "/api/tool-management/v1/catalog", localInForwardMode: true },
    rpc: {method:"tool_management.catalog",syntheticPath:"/api/tool-management/v1/catalog"},
    cli: { command: ["tools", "catalog"], usage: "tools catalog" },
    requiredScopes: ["console:read"]
  },
  {
    id: "tool_management.catalog_item",
    feature: "tool_management",
    label: "工具管理目录项",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "GET", path: "/api/tool-management/v1/catalog/:toolId", localInForwardMode: true },
    rpc: {method:"tool_management.catalog_item",syntheticPath:"/api/tool-management/v1/catalog/:toolId",params:[{name:"toolId",aliases:["toolId","tool-id","id"],required:true}]},
    requiredScopes: ["console:read"]
  },
  {
    id: "tool_management.toolsets",
    feature: "tool_management",
    label: "工具集列表",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "GET", path: "/api/tool-management/v1/toolsets", localInForwardMode: true },
    rpc: {method:"tool_management.toolsets",syntheticPath:"/api/tool-management/v1/toolsets"},
    cli: { command: ["tools", "toolsets"], usage: "tools toolsets" },
    requiredScopes: ["console:read"]
  },
  {
    id: "tool_management.toolsets_resolve",
    feature: "tool_management",
    label: "解析工具集",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "POST", path: "/api/tool-management/v1/toolsets/resolve", localInForwardMode: true },
    rpc: {method:"tool_management.toolsets_resolve",syntheticPath:"/api/tool-management/v1/toolsets/resolve",body:"params"},
    cli: { command: ["tools", "toolsets", "resolve"], usage: "tools toolsets resolve --body toolsets.json" },
    requiredScopes: ["console:read"],
    safety: { risk: "read_only", requiresConfirmation: false }
  },
  {
    id: "tool_management.profiles",
    feature: "tool_management",
    label: "工具 Agent Profile 列表",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "GET", path: "/api/tool-management/v1/profiles", localInForwardMode: true },
    rpc: {method:"tool_management.profiles",syntheticPath:"/api/tool-management/v1/profiles"},
    cli: { command: ["tools", "profiles"], usage: "tools profiles" },
    requiredScopes: ["console:read"]
  },
  {
    id: "tool_management.policy_evaluate",
    feature: "tool_management",
    label: "评估工具策略",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "POST", path: "/api/tool-management/v1/policy/evaluate", localInForwardMode: true },
    rpc: {method:"tool_management.policy_evaluate",syntheticPath:"/api/tool-management/v1/policy/evaluate",body:"params"},
    requiredScopes: ["console:read"],
    safety: { risk: "read_only", requiresConfirmation: false }
  },
  {
    id: "tool_management.policy_preview",
    feature: "tool_management",
    label: "预览工具策略",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "POST", path: "/api/tool-management/v1/policy/preview", localInForwardMode: true },
    rpc: {method:"tool_management.policy_preview",syntheticPath:"/api/tool-management/v1/policy/preview",body:"params"},
    cli: { command: ["tools", "policy", "preview"], usage: "tools policy preview --body preview.json" },
    requiredScopes: ["console:read"],
    safety: { risk: "read_only", requiresConfirmation: false }
  },
  {
    id: "tool_management.execute",
    feature: "tool_management",
    label: "执行工具",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "POST", path: "/api/tool-management/v1/execute", localInForwardMode: true },
    rpc: {method:"tool_management.execute",syntheticPath:"/api/tool-management/v1/execute",body:"params"},
    cli: { command: ["tools", "execute"], usage: "tools execute --tool-id TOOL_ID --body input.json" },
    safety: { risk: "safe_write", requiresConfirmation: false }
  },
  {
    id: "tool_management.batch",
    feature: "tool_management",
    label: "批量执行工具",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "POST", path: "/api/tool-management/v1/batch", localInForwardMode: true },
    rpc: {method:"tool_management.batch",syntheticPath:"/api/tool-management/v1/batch",body:"params"},
    safety: { risk: "safe_write", requiresConfirmation: false }
  },
  {
    id: "tool_management.dry_run",
    feature: "tool_management",
    label: "工具 Dry Run",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "POST", path: "/api/tool-management/v1/dry-run", localInForwardMode: true },
    rpc: {method:"tool_management.dry_run",syntheticPath:"/api/tool-management/v1/dry-run",body:"params"},
    cli: { command: ["tools", "dry-run"], usage: "tools dry-run --tool-id TOOL_ID --body input.json" },
    safety: { risk: "read_only", requiresConfirmation: false }
  },
  {
    id: "tool_management.grants",
    feature: "tool_management",
    label: "工具授权列表",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "GET", path: "/api/tool-management/v1/grants", localInForwardMode: true },
    rpc: {method:"tool_management.grants",syntheticPath:"/api/tool-management/v1/grants"},
    cli: { command: ["tools", "grants"], usage: "tools grants list" },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "tool_management.create_grant",
    feature: "tool_management",
    label: "创建工具授权",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "POST", path: "/api/tool-management/v1/grants", localInForwardMode: true },
    rpc: {method:"tool_management.create_grant",syntheticPath:"/api/tool-management/v1/grants",body:"params"},
    cli: { command: ["tools", "grants", "create"], usage: "tools grants create --body grant.json" },
    requiredScopes: ["runtime:admin"],
    safety: { risk: "repair_write" }
  },
  {
    id: "tool_management.update_grant",
    feature: "tool_management",
    label: "更新工具授权",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "POST", path: "/api/tool-management/v1/grants/:grantId", localInForwardMode: true },
    rpc: {method:"tool_management.update_grant",syntheticPath:"/api/tool-management/v1/grants/:grantId",params:[{name:"grantId",aliases:["grantId","grant-id","id"],required:true}],body:"params"},
    requiredScopes: ["runtime:admin"],
    safety: { risk: "repair_write" }
  },
  {
    id: "tool_management.rotate_grant",
    feature: "tool_management",
    label: "轮换工具授权 Token",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "POST", path: "/api/tool-management/v1/grants/:grantId/rotate", localInForwardMode: true },
    rpc: {method:"tool_management.rotate_grant",syntheticPath:"/api/tool-management/v1/grants/:grantId/rotate",params:[{name:"grantId",aliases:["grantId","grant-id","id"],required:true}],body:"params"},
    cli: { command: ["tools", "grants", "rotate"], usage: "tools grants rotate --id GRANT_ID" },
    requiredScopes: ["runtime:admin"],
    safety: { risk: "repair_write" }
  },
  {
    id: "tool_management.revoke_grant",
    feature: "tool_management",
    label: "吊销工具授权",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "POST", path: "/api/tool-management/v1/grants/:grantId/revoke", localInForwardMode: true },
    rpc: {method:"tool_management.revoke_grant",syntheticPath:"/api/tool-management/v1/grants/:grantId/revoke",params:[{name:"grantId",aliases:["grantId","grant-id","id"],required:true}],body:"params"},
    cli: { command: ["tools", "grants", "revoke"], usage: "tools grants revoke --id GRANT_ID" },
    requiredScopes: ["runtime:admin"],
    safety: { risk: "repair_write" }
  },
  {
    id: "tool_management.audit",
    feature: "tool_management",
    label: "工具审计列表",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: {
      method: "GET",
      path: "/api/tool-management/v1/audit",
      localInForwardMode: true,
      query: [
        { name: "limit", aliases: ["limit"] },
        { name: "toolId", aliases: ["tool-id", "toolId"] },
        { name: "grantId", aliases: ["grant-id", "grantId"] },
        { name: "status", aliases: ["status"] }
      ],
      coerce: { limit: "number" }
    },
    rpc: {method:"tool_management.audit",syntheticPath:"/api/tool-management/v1/audit",query:[{name:"limit",aliases:["limit"]},{name:"toolId",aliases:["tool-id","toolId"]},{name:"grantId",aliases:["grant-id","grantId"]},{name:"status",aliases:["status"]}]},
    cli: { command: ["tools", "audit"], usage: "tools audit [--limit 100]" },
    requiredScopes: ["console:read"]
  },
  {
    id: "tool_management.audit_item",
    feature: "tool_management",
    label: "工具审计详情",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: { method: "GET", path: "/api/tool-management/v1/audit/:toolExecutionId", localInForwardMode: true },
    rpc: {method:"tool_management.audit_item",syntheticPath:"/api/tool-management/v1/audit/:toolExecutionId",params:[{name:"toolExecutionId",aliases:["toolExecutionId","tool-execution-id","id"],required:true}]},
    requiredScopes: ["console:read"]
  },
  {
    id: "tool_management.metrics_summary",
    feature: "tool_management",
    label: "工具指标摘要",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: {
      method: "GET",
      path: "/api/tool-management/v1/metrics/summary",
      localInForwardMode: true,
      query: [
        { name: "limit", aliases: ["limit"] },
        { name: "since", aliases: ["since"] },
        { name: "until", aliases: ["until"] }
      ],
      coerce: { limit: "number" }
    },
    rpc: {method:"tool_management.metrics_summary",syntheticPath:"/api/tool-management/v1/metrics/summary",query:[{name:"limit",aliases:["limit"]},{name:"since",aliases:["since"]},{name:"until",aliases:["until"]}]},
    cli: { command: ["tools", "metrics"], usage: "tools metrics" },
    requiredScopes: ["console:read"]
  },
  {
    id: "tool_management.events",
    feature: "tool_management",
    label: "工具事件",
    target: { controller: "system", method: "handleToolManagementPassthrough" },
    http: {
      method: "GET",
      path: "/api/tool-management/v1/events",
      localInForwardMode: true,
      query: [{ name: "limit", aliases: ["limit"] }],
      coerce: { limit: "number" }
    },
    rpc: {method:"tool_management.events",syntheticPath:"/api/tool-management/v1/events",query:[{name:"limit",aliases:["limit"]}]},
    requiredScopes: ["console:read"]
  },
  {
    id: "email_rules.get",
    feature: "email_rules",
    label: "读取邮件规则",
    target: { controller: "system", method: "handleGetRules" },
    http: { method: "GET", path: "/api/email-rules" },
    rpc: { method: "email_rules.get" },
    cli: { command: ["email-rules", "get"], aliases: [["email-rules"]], usage: "email-rules get" },
    requiredScopes: ["console:read"]
  },
  {
    id: "email_rules.set",
    feature: "email_rules",
    label: "保存邮件规则",
    target: { controller: "system", method: "handleSetRules" },
    http: { method: "POST", path: "/api/email-rules" },
    rpc: { method: "email_rules.set", body: "params" },
    cli: { command: ["email-rules", "set"], usage: "email-rules set --body rules.json" },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "expert_vocabulary.get",
    feature: "expert_vocabulary",
    label: "读取专家词汇库",
    target: { controller: "system", method: "handleGetExpertVocabulary" },
    http: { method: "GET", path: "/api/expert-vocabulary" },
    rpc: { method: "expert_vocabulary.get" },
    cli: { command: ["expert-vocabulary", "get"], aliases: [["expert-vocabulary"]], usage: "expert-vocabulary get" },
    requiredScopes: ["console:read"]
  },
  {
    id: "expert_vocabulary.set",
    feature: "expert_vocabulary",
    label: "保存专家词汇库",
    target: { controller: "system", method: "handleSetExpertVocabulary" },
    http: { method: "POST", path: "/api/expert-vocabulary" },
    rpc: { method: "expert_vocabulary.set", body: "params" },
    cli: { command: ["expert-vocabulary", "set"], usage: "expert-vocabulary set --body vocabulary.json" },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "expert_vocabulary.versions",
    feature: "expert_vocabulary",
    label: "专家词汇库版本",
    target: { controller: "system", method: "handleListExpertVocabularyVersions" },
    http: { method: "GET", path: "/api/expert-vocabulary/versions" },
    rpc: { method: "expert_vocabulary.versions" },
    cli: { command: ["expert-vocabulary", "versions"], usage: "expert-vocabulary versions" },
    requiredScopes: ["console:read"]
  },
  {
    id: "knowledge_taxonomy.get",
    feature: "knowledge_taxonomy",
    label: "读取知识分类标准",
    target: { controller: "system", method: "handleGetKnowledgeTaxonomy" },
    http: { method: "GET", path: "/api/knowledge-taxonomy" },
    rpc: { method: "knowledge_taxonomy.get" },
    cli: { command: ["knowledge-taxonomy", "get"], aliases: [["knowledge-taxonomy"]], usage: "knowledge-taxonomy get" },
    requiredScopes: ["console:read"]
  },
  {
    id: "knowledge_taxonomy.set",
    feature: "knowledge_taxonomy",
    label: "保存知识分类标准",
    target: { controller: "system", method: "handleSetKnowledgeTaxonomy" },
    http: { method: "POST", path: "/api/knowledge-taxonomy" },
    rpc: { method: "knowledge_taxonomy.set", body: "params" },
    cli: { command: ["knowledge-taxonomy", "set"], usage: "knowledge-taxonomy set --body taxonomy.json" },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "knowledge_taxonomy.versions",
    feature: "knowledge_taxonomy",
    label: "知识分类标准版本",
    target: { controller: "system", method: "handleListKnowledgeTaxonomyVersions" },
    http: { method: "GET", path: "/api/knowledge-taxonomy/versions" },
    rpc: { method: "knowledge_taxonomy.versions" },
    cli: { command: ["knowledge-taxonomy", "versions"], usage: "knowledge-taxonomy versions" },
    requiredScopes: ["console:read"]
  },
  {
    id: "storage.summary",
    feature: "storage",
    label: "存储摘要",
    target: { controller: "system", method: "handleGetStorageSummary" },
    http: { method: "GET", path: "/api/storage/summary" },
    rpc: { method: "storage.summary" },
    cli: { command: ["storage"], usage: "storage" },
    requiredScopes: ["console:read"]
  },
  {
    id: "storage.source_vocabulary.rebuild",
    feature: "storage",
    label: "重建源文件词汇库",
    target: { controller: "system", method: "handleRebuildSourceVocabulary" },
    http: { method: "POST", path: "/api/storage/source-vocabulary/rebuild" },
    rpc: { method: "storage.source_vocabulary.rebuild" },
    cli: { command: ["storage", "source-vocabulary", "rebuild"], usage: "storage source-vocabulary rebuild" },
    requiredScopes: ["runtime:admin"],
    safety: { risk: "repair_write" }
  },
  {
    id: "knowledge.corpus.significant_terms",
    feature: "knowledge",
    label: "计算语料显著词",
    target: { controller: "system", method: "handleGetSignificantSourceTerms" },
    http: { method: "POST", path: "/api/knowledge/corpus/significant-terms" },
    rpc: { method: "knowledge.corpus.significant_terms", body: "params" },
    cli: {
      command: ["knowledge", "corpus", "significant-terms"],
      usage: "knowledge corpus significant-terms --batch-id BATCH_ID --limit 50",
      bodyParams: [
        { name: "batchId", aliases: ["batch-id", "batchId"], type: "string" },
        { name: "clientUid", aliases: ["client-uid", "clientUid"], type: "string" },
        { name: "sourceType", aliases: ["source-type", "sourceType"], type: "string" },
        { name: "providerId", aliases: ["provider-id", "providerId"], type: "string" },
        { name: "syncBatchId", aliases: ["sync-batch-id", "syncBatchId"], type: "string" },
        { name: "externalId", aliases: ["external-id", "externalId"], type: "string" },
        { name: "limit", aliases: ["limit"], type: "number" },
        { name: "minForegroundDocumentFrequency", aliases: ["min-df", "minDocumentFrequency"], type: "number" }
      ]
    },
    requiredScopes: ["console:read"]
  },
  {
    id: "knowledge.document_parse",
    feature: "knowledge",
    label: "统一文档解析",
    target: { controller: "system", method: "handleKnowledgeDocumentParse" },
    http: { method: "POST", path: "/api/knowledge/document-parser/parse", localInForwardMode: true },
    rpc: { method: "knowledge.document_parse", body: "params" },
    cli: {
      command: ["knowledge", "document-parse"],
      usage: "knowledge document-parse --body parse.json"
    },
    readOnly: true,
    concurrencySafe: true,
    requiredScopes: ["jobs:write"],
    inputSchema: {
      type: "object",
      properties: {
        pipelineId: { type: "string" },
        expectedOutput: { type: "string" },
        expectedOutputs: { type: "array" },
        inputText: { type: "string" },
        sources: { type: "array" },
        filePaths: { type: "array" },
        chunking: { type: "object" },
        contextBudget: { type: "object" },
        payloadBudget: { type: "object" },
        granularity: { type: "object" },
        dynamicParsing: { type: "object" },
        documentParsing: { type: "object" }
      }
    }
  },
  {
    id: "knowledge.word_clouds.get",
    feature: "knowledge",
    label: "读取语料词云",
    target: { controller: "system", method: "handleKnowledgeWordClouds" },
    http: {
      method: "GET",
      path: "/api/knowledge/word-clouds",
      query: [
        { name: "wordBagSetId", aliases: ["word-bag-set-id", "wordBagSetId"] },
        { name: "wordBagId", aliases: ["word-bag-id", "wordBagId", "id"] }
      ]
    },
    rpc: { method: "knowledge.word_clouds.get" },
    cli: {
      command: ["knowledge", "word-clouds"],
      usage: "knowledge word-clouds [--limit 300]",
      bodyParams: [
        { name: "wordBagSetId", aliases: ["word-bag-set-id", "wordBagSetId"], type: "string" },
        { name: "wordBagId", aliases: ["word-bag-id", "wordBagId", "id"], type: "string" },
        { name: "limit", aliases: ["limit"], type: "number" },
        { name: "minFrequency", aliases: ["min-frequency", "minFrequency"], type: "number" }
      ]
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.word_clouds.save",
    feature: "knowledge",
    label: "保存语料词云",
    target: { controller: "system", method: "handleSaveKnowledgeWordClouds" },
    http: { method: "POST", path: "/api/knowledge/word-clouds" },
    rpc: { method: "knowledge.word_clouds.save", body: "params" },
    cli: {
      command: ["knowledge", "word-clouds", "save"],
      usage: "knowledge word-clouds save --body word-cloud.json"
    },
    requiredScopes: ["knowledge:write"],
    safety: { risk: "content_write" }
  },
  {
    id: "knowledge.word_clouds.export",
    feature: "knowledge",
    label: "导出语料词袋",
    target: { controller: "system", method: "handleExportKnowledgeWordClouds" },
    http: {
      method: "POST",
      path: "/api/knowledge/word-clouds/export"
    },
    rpc: { method: "knowledge.word_clouds.export", body: "params" },
    cli: {
      command: ["knowledge", "word-clouds", "export"],
      usage: "knowledge word-clouds export --word-bag-set-id SET_ID",
      bodyParams: [
        { name: "wordBagSetId", aliases: ["word-bag-set-id", "wordBagSetId"], type: "string" }
      ]
    },
    requiredScopes: ["knowledge:read"],
    readOnly: true
  },
  {
    id: "knowledge.word_clouds.import",
    feature: "knowledge",
    label: "导入语料词袋",
    target: { controller: "system", method: "handleImportKnowledgeWordClouds" },
    http: { method: "POST", path: "/api/knowledge/word-clouds/import" },
    rpc: { method: "knowledge.word_clouds.import", body: "params" },
    cli: {
      command: ["knowledge", "word-clouds", "import"],
      usage: "knowledge word-clouds import --body word-cloud-export.json [--mode copy|overwrite]",
      bodyParams: [
        { name: "mode", aliases: ["mode", "strategy"], type: "string" },
        { name: "overwrite", aliases: ["overwrite"], type: "boolean" }
      ]
    },
    requiredScopes: ["knowledge:write"],
    safety: { risk: "content_write" }
  },
  {
    id: "knowledge.word_bags.add",
    feature: "knowledge",
    label: "新增语料词袋",
    target: { controller: "system", method: "handleAddKnowledgeWordBag" },
    http: { method: "POST", path: "/api/knowledge/word-clouds/word-bags" },
    rpc: { method: "knowledge.word_bags.add", body: "params" },
    cli: {
      command: ["knowledge", "word-bags", "add"],
      usage: "knowledge word-bags add --word-bag-set-id SET_ID --body word-bag.json",
      bodyParams: [
        { name: "wordBagSetId", aliases: ["word-bag-set-id", "wordBagSetId"], type: "string", required: true },
        { name: "parentWordBagId", aliases: ["parent-word-bag-id", "parentWordBagId"], type: "string" }
      ]
    },
    requiredScopes: ["knowledge:write"],
    safety: { risk: "content_write" }
  },
  {
    id: "knowledge.word_bags.terms",
    feature: "knowledge",
    label: "读取语料词袋全量词汇",
    target: { controller: "system", method: "handleGetKnowledgeWordBagTerms" },
    http: { method: "POST", path: "/api/knowledge/word-clouds/word-bags/terms" },
    rpc: { method: "knowledge.word_bags.terms", body: "params" },
    cli: {
      command: ["knowledge", "word-bags", "terms"],
      usage: "knowledge word-bags terms --word-bag-set-id SET_ID --word-bag-ids A,B",
      bodyParams: [
        { name: "wordBagSetId", aliases: ["word-bag-set-id", "wordBagSetId"], type: "string" },
        { name: "wordBagIds", aliases: ["word-bag-ids", "wordBagIds", "ids"], type: "array", required: true },
        { name: "includeChildren", aliases: ["include-children", "includeChildren"], type: "boolean" }
      ]
    },
    requiredScopes: ["knowledge:read"],
    readOnly: true
  },
  {
    id: "knowledge.word_bags.update",
    feature: "knowledge",
    label: "更新语料词袋",
    target: { controller: "system", method: "handleUpdateKnowledgeWordBag" },
    http: { method: "POST", path: "/api/knowledge/word-clouds/word-bags/:wordBagId" },
    rpc: {
      method: "knowledge.word_bags.update",
      body: "params",
      params: [{ name: "wordBagId", aliases: ["word-bag-id", "wordBagId", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "word-bags", "update"],
      usage: "knowledge word-bags update --id WORD_BAG_ID --word-bag-set-id SET_ID --body patch.json",
      pathParams: { wordBagId: ["word-bag-id", "wordBagId", "id"] },
      bodyParams: [
        { name: "wordBagSetId", aliases: ["word-bag-set-id", "wordBagSetId"], type: "string", required: true }
      ]
    },
    requiredScopes: ["knowledge:write"],
    safety: { risk: "content_write" }
  },
  {
    id: "knowledge.word_bags.delete",
    feature: "knowledge",
    label: "删除语料词袋",
    target: { controller: "system", method: "handleDeleteKnowledgeWordBag" },
    http: {
      method: "DELETE",
      path: "/api/knowledge/word-clouds/word-bags/:wordBagId",
      query: [{ name: "wordBagSetId", aliases: ["word-bag-set-id", "wordBagSetId"] }]
    },
    rpc: {
      method: "knowledge.word_bags.delete",
      params: [{ name: "wordBagId", aliases: ["word-bag-id", "wordBagId", "id"], required: true }],
      query: [{ name: "wordBagSetId", aliases: ["word-bag-set-id", "wordBagSetId"], required: true }]
    },
    cli: {
      command: ["knowledge", "word-bags", "delete"],
      usage: "knowledge word-bags delete --id WORD_BAG_ID --word-bag-set-id SET_ID",
      pathParams: { wordBagId: ["word-bag-id", "wordBagId", "id"] }
    },
    requiredScopes: ["knowledge:write"],
    safety: { risk: "content_write" }
  },
  {
    id: "knowledge.word_clouds.propose",
    feature: "knowledge",
    label: "智能体生成语料词云",
    target: { controller: "system", method: "handleProposeKnowledgeWordClouds" },
    http: { method: "POST", path: "/api/knowledge/word-clouds/propose" },
    rpc: { method: "knowledge.word_clouds.propose", body: "params" },
    cli: {
      command: ["knowledge", "word-clouds", "propose"],
      usage: "knowledge word-clouds propose --model-alias MODEL --prompt TEXT",
      bodyParams: [
        { name: "modelAlias", aliases: ["model-alias", "modelAlias"], type: "string" },
        { name: "prompt", aliases: ["prompt", "message"], type: "string", required: true }
      ]
    },
    requiredScopes: ["knowledge:write"],
    safety: { risk: "content_write" }
  },
  {
    id: "storage.doctor",
    feature: "storage",
    label: "诊断存储一致性",
    target: { controller: "system", method: "handleStorageDoctor" },
    http: { method: "GET", path: "/api/storage/doctor" },
    rpc: { method: "storage.doctor" },
    cli: { command: ["storage", "doctor"], usage: "storage doctor" },
    requiredScopes: ["console:read"]
  },
  {
    id: "storage.reconcile",
    feature: "storage",
    label: "修复存储一致性",
    target: { controller: "system", method: "handleStorageReconcile" },
    http: { method: "POST", path: "/api/storage/reconcile" },
    rpc: { method: "storage.reconcile", body: "params" },
    cli: {
      command: ["storage", "reconcile"],
      usage: "storage reconcile --confirm",
      bodyParams: [
        { name: "apply", aliases: ["apply"], type: "boolean" },
        { name: "pruneOrphanObjects", aliases: ["prune-orphan-objects", "pruneOrphanObjects"], type: "boolean" }
      ]
    },
    requiredScopes: ["runtime:admin"]
  },
  {
    id: "system.background_processes",
    feature: "system",
    label: "后台守护进程状态",
    target: { controller: "system", method: "handleGetBackgroundProcesses" },
    http: { method: "GET", path: "/api/system/background-processes", localInForwardMode: true },
    rpc: { method: "system.background_processes" },
    cli: { command: ["system", "background-processes"], usage: "system background-processes" },
    requiredScopes: ["console:read"]
  },
  {
    id: "system.checkpoint_trees.list",
    feature: "system",
    label: "长任务 checkpoint tree 列表",
    target: { controller: "system", method: "handleListCheckpointTrees" },
    http: { method: "GET", path: "/api/system/checkpoint-trees", localInForwardMode: true },
    rpc: { method: "system.checkpoint_trees.list" },
    cli: { command: ["system", "checkpoint-trees"], usage: "system checkpoint-trees [--kind KIND] [--owner-id ID]" },
    requiredScopes: ["console:read"]
  },
  {
    id: "system.checkpoint_trees.get",
    feature: "system",
    label: "读取长任务 checkpoint tree",
    target: { controller: "system", method: "handleGetCheckpointTree" },
    http: { method: "GET", path: "/api/system/checkpoint-trees/:treeId", localInForwardMode: true },
    rpc: {
      method: "system.checkpoint_trees.get",
      params: [{ name: "treeId", aliases: ["tree-id", "id"], required: true }]
    },
    cli: {
      command: ["system", "checkpoint-tree"],
      usage: "system checkpoint-tree --id CHECKPOINT_TREE_ID",
      pathParams: { treeId: ["tree-id", "id"] }
    },
    requiredScopes: ["console:read"]
  },
  {
    id: "system.monitor_alerts.get",
    feature: "system",
    label: "读取监控报警状态",
    target: { controller: "system", method: "handleMonitorAlerts" },
    http: { method: "GET", path: "/api/system/monitor-alerts", localInForwardMode: true },
    rpc: { method: "system.monitor_alerts.get" },
    cli: { command: ["system", "monitor-alerts"], usage: "system monitor-alerts" },
    requiredScopes: ["console:read"]
  },
  {
    id: "system.monitor_alerts.set",
    feature: "system",
    label: "保存监控报警配置",
    target: { controller: "system", method: "handleMonitorAlerts" },
    http: { method: "POST", path: "/api/system/monitor-alerts/config", localInForwardMode: true },
    rpc: { method: "system.monitor_alerts.set", body: "params" },
    cli: { command: ["system", "monitor-alerts", "set"], usage: "system monitor-alerts set --body monitor-alerts.json" },
    requiredScopes: ["maintenance:admin"]
  },
  {
    id: "system.monitor_alerts.ack",
    feature: "system",
    label: "确认监控报警",
    target: { controller: "system", method: "handleAcknowledgeMonitorAlert" },
    http: { method: "POST", path: "/api/system/monitor-alerts/:alertId/ack", localInForwardMode: true },
    rpc: {
      method: "system.monitor_alerts.ack",
      params: [{ name: "alertId", aliases: ["alert-id", "id"], required: true }]
    },
    cli: {
      command: ["system", "monitor-alerts", "ack"],
      usage: "system monitor-alerts ack --id ALERT_ID",
      pathParams: { alertId: ["alert-id", "id"] }
    },
    requiredScopes: ["maintenance:admin"]
  },
  {
    id: "knowledge.affair_taxonomy",
    feature: "knowledge",
    label: "事务分类增强",
    target: { controller: "system", method: "handleEnhanceAffairTaxonomy" },
    http: { method: "POST", path: "/api/knowledge/affair-taxonomy", localInForwardMode: true },
    rpc: { method: "knowledge.affair_taxonomy", body: "params" },
    cli: { command: ["knowledge"], usage: "knowledge --body taxonomy.json" },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "knowledge.console",
    feature: "knowledge",
    label: "知识库控制台聚合状态",
    target: { controller: "system", method: "handleKnowledgeConsole" },
    http: { method: "GET", path: "/api/knowledge/console" },
    rpc: { method: "knowledge.console" },
    cli: { command: ["knowledge", "console"], usage: "knowledge console" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.sources.list",
    feature: "knowledge",
    label: "知识库受管目录列表",
    target: { controller: "system", method: "handleKnowledgeSources" },
    http: { method: "GET", path: "/api/knowledge/sources", localInForwardMode: true },
    rpc: { method: "knowledge.sources.list" },
    cli: { command: ["knowledge", "sources"], usage: "knowledge sources" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.sources.create",
    feature: "knowledge",
    label: "新增知识库受管目录",
    target: { controller: "system", method: "handleCreateKnowledgeSource" },
    http: { method: "POST", path: "/api/knowledge/sources", localInForwardMode: true },
    rpc: { method: "knowledge.sources.create", body: "params" },
    cli: {
      command: ["knowledge", "sources", "add"],
      usage: "knowledge sources add --body source.json"
    },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "knowledge.sources.update",
    feature: "knowledge",
    label: "更新知识库受管目录",
    target: { controller: "system", method: "handleUpdateKnowledgeSource" },
    http: { method: "POST", path: "/api/knowledge/sources/:sourceId", localInForwardMode: true },
    rpc: {
      method: "knowledge.sources.update",
      body: "params",
      params: [{ name: "sourceId", aliases: ["source-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "sources", "update"],
      usage: "knowledge sources update --id SOURCE_ID --body patch.json",
      pathParams: { sourceId: ["source-id", "id"] }
    },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "knowledge.sources.delete",
    feature: "knowledge",
    label: "删除知识库受管目录",
    target: { controller: "system", method: "handleDeleteKnowledgeSource" },
    http: { method: "DELETE", path: "/api/knowledge/sources/:sourceId", localInForwardMode: true },
    rpc: {
      method: "knowledge.sources.delete",
      params: [{ name: "sourceId", aliases: ["source-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "sources", "delete"],
      usage: "knowledge sources delete --id SOURCE_ID",
      pathParams: { sourceId: ["source-id", "id"] }
    },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "knowledge.sources.refresh",
    feature: "knowledge",
    label: "刷新知识库受管目录",
    target: { controller: "system", method: "handleRefreshKnowledgeSource" },
    http: { method: "POST", path: "/api/knowledge/sources/:sourceId/refresh", localInForwardMode: true },
    rpc: {
      method: "knowledge.sources.refresh",
      body: "params",
      params: [{ name: "sourceId", aliases: ["source-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "sources", "refresh"],
      usage: "knowledge sources refresh --id SOURCE_ID",
      pathParams: { sourceId: ["source-id", "id"] }
    },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "knowledge.sources.refresh_all",
    feature: "knowledge",
    label: "刷新全部知识库受管目录",
    target: { controller: "system", method: "handleRefreshAllKnowledgeSources" },
    http: { method: "POST", path: "/api/knowledge/sources-refresh", localInForwardMode: true },
    rpc: { method: "knowledge.sources.refresh_all", body: "params" },
    cli: {
      command: ["knowledge", "sources", "refresh-all"],
      usage: "knowledge sources refresh-all"
    },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "knowledge.config_schema",
    feature: "knowledge",
    label: "知识库维护配置表单元数据",
    target: { controller: "system", method: "handleKnowledgeConfigSchema" },
    http: { method: "GET", path: "/api/knowledge/config-schema" },
    rpc: { method: "knowledge.config_schema" },
    cli: { command: ["knowledge", "config-schema"], usage: "knowledge config-schema" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.capabilities",
    feature: "knowledge",
    label: "知识库协议能力",
    target: { controller: "system", method: "handleKnowledgeCapabilities" },
    http: { method: "GET", path: "/api/knowledge/capabilities" },
    rpc: { method: "knowledge.capabilities" },
    cli: { command: ["knowledge", "capabilities"], usage: "knowledge capabilities" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.export_docx",
    feature: "knowledge",
    label: "导出知识库 DOCX",
    target: { controller: "system", method: "handleKnowledgeDocxExport" },
    http: {
      method: "GET",
      path: "/api/knowledge/export/docx",
      query: [
        { name: "documentId", aliases: ["document-id", "documentId"] },
        { name: "batchId", aliases: ["batch-id", "batchId"] },
        { name: "sourceId", aliases: ["source-id", "sourceId"] },
        { name: "limit", aliases: ["limit"], type: "number" },
        { name: "includeMachineReadable", aliases: ["include-machine-readable", "includeMachineReadable"], type: "boolean" }
      ],
      coerce: { limit: "number", includeMachineReadable: "boolean" }
    },
    rpc: {
      method: "knowledge.export.docx",
      query: [
        { name: "documentId", aliases: ["document-id", "documentId"] },
        { name: "batchId", aliases: ["batch-id", "batchId"] },
        { name: "sourceId", aliases: ["source-id", "sourceId"] },
        { name: "limit", aliases: ["limit"], type: "number" },
        { name: "includeMachineReadable", aliases: ["include-machine-readable", "includeMachineReadable"], type: "boolean" }
      ]
    },
    cli: {
      command: ["knowledge", "export-docx"],
      usage: "knowledge export-docx --output knowledge.docx [--document-id DOCUMENT_ID] [--batch-id BATCH_ID] [--source-id SOURCE_ID]",
      bodyParams: [
        { name: "documentId", aliases: ["document-id", "documentId"] },
        { name: "batchId", aliases: ["batch-id", "batchId"] },
        { name: "sourceId", aliases: ["source-id", "sourceId"] },
        { name: "limit", aliases: ["limit"], type: "number" },
        { name: "includeMachineReadable", aliases: ["include-machine-readable", "includeMachineReadable"], type: "boolean" }
      ]
    },
    requiredScopes: ["knowledge:read"],
    binary: true
  },
  {
    id: "knowledge.export_markdown",
    feature: "knowledge",
    label: "导出知识库 Markdown",
    target: { controller: "system", method: "handleKnowledgeMarkdownExport" },
    http: {
      method: "GET",
      path: "/api/knowledge/export/markdown",
      query: [
        { name: "documentId", aliases: ["document-id", "documentId"] },
        { name: "batchId", aliases: ["batch-id", "batchId"] },
        { name: "sourceId", aliases: ["source-id", "sourceId"] },
        { name: "limit", aliases: ["limit"], type: "number" }
      ],
      coerce: { limit: "number" }
    },
    rpc: { method: "knowledge.export.markdown" },
    cli: {
      command: ["knowledge", "export-markdown"],
      usage: "knowledge export-markdown --output knowledge.md [--document-id DOCUMENT_ID] [--batch-id BATCH_ID] [--source-id SOURCE_ID]",
      bodyParams: [
        { name: "documentId", aliases: ["document-id", "documentId"] },
        { name: "batchId", aliases: ["batch-id", "batchId"] },
        { name: "sourceId", aliases: ["source-id", "sourceId"] },
        { name: "limit", aliases: ["limit"], type: "number" }
      ]
    },
    requiredScopes: ["knowledge:read"],
    binary: true
  },
  {
    id: "knowledge.export_html",
    feature: "knowledge",
    label: "导出知识库 HTML",
    target: { controller: "system", method: "handleKnowledgeHtmlExport" },
    http: {
      method: "GET",
      path: "/api/knowledge/export/html",
      query: [
        { name: "documentId", aliases: ["document-id", "documentId"] },
        { name: "batchId", aliases: ["batch-id", "batchId"] },
        { name: "sourceId", aliases: ["source-id", "sourceId"] },
        { name: "limit", aliases: ["limit"], type: "number" }
      ],
      coerce: { limit: "number" }
    },
    rpc: { method: "knowledge.export.html" },
    cli: {
      command: ["knowledge", "export-html"],
      usage: "knowledge export-html --output knowledge.html [--document-id DOCUMENT_ID] [--batch-id BATCH_ID] [--source-id SOURCE_ID]",
      bodyParams: [
        { name: "documentId", aliases: ["document-id", "documentId"] },
        { name: "batchId", aliases: ["batch-id", "batchId"] },
        { name: "sourceId", aliases: ["source-id", "sourceId"] },
        { name: "limit", aliases: ["limit"], type: "number" }
      ]
    },
    requiredScopes: ["knowledge:read"],
    binary: true
  },
  {
    id: "knowledge.health",
    feature: "knowledge",
    label: "知识库健康状态",
    target: { controller: "system", method: "handleKnowledgeHealth" },
    http: { method: "GET", path: "/api/knowledge/health" },
    rpc: { method: "knowledge.health" },
    cli: { command: ["knowledge", "health"], usage: "knowledge health" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.maintenance.get",
    feature: "knowledge",
    label: "读取知识库维护参数",
    target: { controller: "system", method: "handleKnowledgeMaintenanceGet" },
    http: { method: "GET", path: "/api/knowledge/maintenance" },
    rpc: { method: "knowledge.maintenance.get" },
    cli: {
      command: ["knowledge", "maintenance", "get"],
      aliases: [["knowledge", "maintenance"]],
      usage: "knowledge maintenance get"
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.maintenance.settings",
    feature: "knowledge",
    label: "读取知识库维护参数（维护智能体别名）",
    target: { controller: "system", method: "handleKnowledgeMaintenanceGet" },
    http: { method: "GET", path: "/api/knowledge/maintenance/settings" },
    rpc: { method: "knowledge.maintenance.settings" },
    cli: {
      command: ["knowledge", "maintenance", "settings"],
      usage: "knowledge maintenance settings"
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.maintenance.set",
    feature: "knowledge",
    label: "设置知识库维护参数",
    target: { controller: "system", method: "handleKnowledgeMaintenanceSet" },
    http: { method: "POST", path: "/api/knowledge/maintenance" },
    rpc: { method: "knowledge.maintenance.set", body: "params" },
    cli: {
      command: ["knowledge", "maintenance", "set"],
      usage: "knowledge maintenance set --body maintenance.json"
    },
    requiredScopes: ["knowledge:admin"]
  },
  {
    id: "knowledge.reindex",
    feature: "knowledge",
    label: "重建知识库索引",
    target: { controller: "system", method: "handleKnowledgeReindex" },
    http: { method: "POST", path: "/api/knowledge/reindex" },
    rpc: { method: "knowledge.reindex", body: "params" },
    cli: {
      command: ["knowledge", "maintenance", "reindex"],
      aliases: [["knowledge", "reindex"]],
      usage: "knowledge maintenance reindex [--body reindex.json]"
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.maintenance.run",
    feature: "knowledge",
    label: "执行知识库维护任务",
    target: { controller: "system", method: "handleKnowledgeMaintenanceRun" },
    http: { method: "POST", path: "/api/knowledge/maintenance/run" },
    rpc: { method: "knowledge.maintenance.run", body: "params" },
    cli: {
      command: ["knowledge", "maintenance", "run"],
      usage: "knowledge maintenance run --task validate_assets",
      bodyParams: [
        { name: "taskType", aliases: ["task", "task-type", "taskType"] },
        { name: "query", aliases: ["query", "q"] },
        { name: "limit", aliases: ["limit"], type: "number" }
      ]
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.sync",
    feature: "knowledge",
    label: "知识库增量同步",
    target: { controller: "system", method: "handleKnowledgeSync" },
    http: {
      method: "GET",
      path: "/api/knowledge/sync",
      query: [
        { name: "since", aliases: ["since", "cursor"] },
        { name: "limit", aliases: ["limit"] },
        { name: "scope", aliases: ["scope"] }
      ]
    },
    rpc: {
      method: "knowledge.sync",
      query: [
        { name: "since", aliases: ["since", "cursor"] },
        { name: "limit", aliases: ["limit"] },
        { name: "scope", aliases: ["scope"] }
      ]
    },
    cli: { command: ["knowledge", "sync"], usage: "knowledge sync [--since CURSOR] [--scope summary|mirror]" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.changes",
    feature: "knowledge",
    label: "提交客户端结构化知识变更",
    target: { controller: "system", method: "handleKnowledgeChanges" },
    http: { method: "POST", path: "/api/knowledge/changes" },
    rpc: { method: "knowledge.changes", body: "params" },
    cli: { command: ["knowledge", "changes"], usage: "knowledge changes --body changes.json" },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "knowledge.review_items",
    feature: "knowledge",
    label: "知识冲突审核列表",
    target: { controller: "system", method: "handleKnowledgeReviewItems" },
    http: {
      method: "GET",
      path: "/api/knowledge/review-items",
      query: [
        { name: "status", aliases: ["status"] },
        { name: "limit", aliases: ["limit"] }
      ]
    },
    rpc: {
      method: "knowledge.review_items",
      query: [
        { name: "status", aliases: ["status"] },
        { name: "limit", aliases: ["limit"] }
      ]
    },
    cli: { command: ["knowledge", "review-items"], usage: "knowledge review-items [--status pending]" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.review_resolve",
    feature: "knowledge",
    label: "解决知识冲突审核项",
    target: { controller: "system", method: "handleResolveKnowledgeReviewItem" },
    http: { method: "POST", path: "/api/knowledge/review-items/:reviewId/resolve" },
    rpc: {
      method: "knowledge.review_resolve",
      body: "params",
      params: [{ name: "reviewId", aliases: ["review-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "review-resolve"],
      usage: "knowledge review-resolve --id REVIEW_ID --body resolution.json",
      pathParams: { reviewId: ["review-id", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.feedback",
    feature: "knowledge",
    label: "记录知识库学习反馈",
    target: { controller: "system", method: "handleKnowledgeFeedback" },
    http: { method: "POST", path: "/api/knowledge/feedback" },
    rpc: { method: "knowledge.feedback", body: "params" },
    cli: {
      command: ["knowledge", "feedback"],
      usage: "knowledge feedback --body feedback.json"
    },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "knowledge.suggestions",
    feature: "knowledge",
    label: "知识库自进化建议列表",
    target: { controller: "system", method: "handleKnowledgeSuggestions" },
    http: {
      method: "GET",
      path: "/api/knowledge/suggestions",
      query: [
        { name: "status", aliases: ["status"] },
        { name: "limit", aliases: ["limit"] }
      ],
      coerce: { limit: "number" }
    },
    rpc: {
      method: "knowledge.suggestions",
      query: [
        { name: "status", aliases: ["status"] },
        { name: "limit", aliases: ["limit"] }
      ]
    },
    cli: {
      command: ["knowledge", "suggestions"],
      usage: "knowledge suggestions [--status pending]"
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.suggestion_resolve",
    feature: "knowledge",
    label: "解决知识库自进化建议",
    target: { controller: "system", method: "handleResolveKnowledgeSuggestion" },
    http: { method: "POST", path: "/api/knowledge/suggestions/:suggestionId/resolve" },
    rpc: {
      method: "knowledge.suggestion_resolve",
      body: "params",
      params: [{ name: "suggestionId", aliases: ["suggestion-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "suggestion-resolve"],
      usage: "knowledge suggestion-resolve --id SUGGESTION_ID --body resolution.json",
      pathParams: { suggestionId: ["suggestion-id", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.learning.jobs",
    feature: "knowledge",
    label: "执行知识库学习任务",
    target: { controller: "system", method: "handleKnowledgeLearningJob" },
    http: { method: "POST", path: "/api/knowledge/learning/jobs" },
    rpc: { method: "knowledge.learning.jobs", body: "params" },
    cli: {
      command: ["knowledge", "learning", "run"],
      usage: "knowledge learning run --body learning-job.json"
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.learning.health",
    feature: "knowledge",
    label: "知识库学习运行时健康状态",
    target: { controller: "system", method: "handleKnowledgeLearningHealth" },
    http: { method: "GET", path: "/api/knowledge/learning/health" },
    rpc: { method: "knowledge.learning.health" },
    cli: {
      command: ["knowledge", "learning", "health"],
      usage: "knowledge learning health"
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.evidence_gate.evaluate",
    feature: "knowledge",
    label: "评估证据充分性",
    target: { controller: "system", method: "handleEvidenceGateEvaluate" },
    http: { method: "POST", path: "/api/knowledge/evidence-gate/evaluate" },
    rpc: { method: "knowledge.evidence_gate.evaluate", body: "params" },
    cli: {
      command: ["knowledge", "evidence-gate"],
      usage: "knowledge evidence-gate --body gate-input.json"
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.agent_skill.describe",
    feature: "knowledge",
    label: "读取知识库智能体技能",
    target: { controller: "system", method: "handleKnowledgeAgentSkill" },
    http: { method: "GET", path: "/api/knowledge/agent-skill" },
    rpc: { method: "knowledge.agent_skill.describe" },
    cli: { command: ["knowledge", "agent-skill"], usage: "knowledge agent-skill" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.agent_skill.plan",
    feature: "knowledge",
    label: "规划知识库智能体查询",
    target: { controller: "system", method: "handleKnowledgeAgentSkillPlan" },
    http: { method: "POST", path: "/api/knowledge/agent-skill/plan" },
    rpc: { method: "knowledge.agent_skill.plan", body: "params" },
    cli: {
      command: ["knowledge", "agent-skill", "plan"],
      usage: "knowledge agent-skill plan --query QUERY",
      bodyParams: [{ name: "query", aliases: ["query", "q"], required: true }]
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.agent_skill.run",
    feature: "knowledge",
    label: "执行知识库智能体查询技能",
    target: { controller: "system", method: "handleKnowledgeAgentSkillRun" },
    http: { method: "POST", path: "/api/knowledge/agent-skill/run" },
    rpc: { method: "knowledge.agent_skill.run", body: "params" },
    cli: {
      command: ["knowledge", "agent-skill", "run"],
      usage: "knowledge agent-skill run --query QUERY [--limit 20]",
      bodyParams: [
        { name: "query", aliases: ["query", "q"], required: true },
        { name: "limit", aliases: ["limit"], type: "number" }
      ]
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.skills.list",
    feature: "knowledge",
    label: "知识 Skill 列表",
    target: { controller: "system", method: "handleKnowledgeSkills" },
    http: {
      method: "GET",
      path: "/api/knowledge/skills",
      query: [
        { name: "status", aliases: ["status"] },
        { name: "query", aliases: ["query", "q"] },
        { name: "limit", aliases: ["limit"] }
      ],
      coerce: { limit: "number" }
    },
    rpc: {
      method: "knowledge.skills.list",
      query: [
        { name: "status", aliases: ["status"] },
        { name: "query", aliases: ["query", "q"] },
        { name: "limit", aliases: ["limit"] }
      ]
    },
    cli: { command: ["knowledge", "skills"], usage: "knowledge skills [--status published] [--query QUERY]" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.skills.get",
    feature: "knowledge",
    label: "读取知识 Skill",
    target: { controller: "system", method: "handleKnowledgeSkillGet" },
    http: { method: "GET", path: "/api/knowledge/skills/:skillId" },
    rpc: {
      method: "knowledge.skills.get",
      params: [{ name: "skillId", aliases: ["skill-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "skill"],
      usage: "knowledge skill --id SKILL_ID",
      pathParams: { skillId: ["skill-id", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.skills.generate",
    feature: "knowledge",
    label: "蒸馏生成知识 Skill",
    target: { controller: "system", method: "handleKnowledgeSkillGenerate" },
    http: { method: "POST", path: "/api/knowledge/skills/generate" },
    rpc: { method: "knowledge.skills.generate", body: "params" },
    cli: {
      command: ["knowledge", "skills", "generate"],
      usage: "knowledge skills generate --query QUERY [--limit 12]",
      bodyParams: [
        { name: "query", aliases: ["query", "q"], required: true },
        { name: "limit", aliases: ["limit"], type: "number" }
      ]
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.skills.propose",
    feature: "knowledge",
    label: "提交智能体知识 Skill 提案",
    target: { controller: "system", method: "handleKnowledgeSkillPropose" },
    http: { method: "POST", path: "/api/knowledge/skills/propose" },
    rpc: { method: "knowledge.skills.propose", body: "params" },
    cli: {
      command: ["knowledge", "skills", "propose"],
      usage: "knowledge skills propose --body skill-proposal.json"
    },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "knowledge.skills.resolve",
    feature: "knowledge",
    label: "发布或驳回知识 Skill",
    target: { controller: "system", method: "handleKnowledgeSkillResolve" },
    http: { method: "POST", path: "/api/knowledge/skills/:skillId/resolve" },
    rpc: {
      method: "knowledge.skills.resolve",
      body: "params",
      params: [{ name: "skillId", aliases: ["skill-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "skills", "resolve"],
      usage: "knowledge skills resolve --id SKILL_ID --body resolution.json",
      pathParams: { skillId: ["skill-id", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.skills.framework",
    feature: "knowledge",
    label: "读取知识 Skill 提炼框架",
    target: { controller: "system", method: "handleKnowledgeSkillFramework" },
    http: { method: "GET", path: "/api/knowledge/skill-framework" },
    rpc: { method: "knowledge.skills.framework" },
    cli: { command: ["knowledge", "skills", "framework"], usage: "knowledge skills framework" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.skills.framework_save",
    feature: "knowledge",
    label: "保存知识 Skill 提炼框架",
    target: { controller: "system", method: "handleSaveKnowledgeSkillFramework" },
    http: { method: "POST", path: "/api/knowledge/skill-framework" },
    rpc: { method: "knowledge.skills.framework_save", body: "params" },
    cli: { command: ["knowledge", "skills", "framework-save"], usage: "knowledge skills framework-save --body framework.json" },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.golden_rules.list",
    feature: "knowledge",
    label: "读取黄金规则包",
    target: { controller: "system", method: "handleGoldenRules" },
    http: { method: "GET", path: "/api/knowledge/golden-rules" },
    rpc: { method: "knowledge.golden_rules.list" },
    cli: { command: ["knowledge", "golden-rules"], usage: "knowledge golden-rules" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.golden_rules.save",
    feature: "knowledge",
    label: "保存黄金规则包",
    target: { controller: "system", method: "handleSaveGoldenRules" },
    http: { method: "POST", path: "/api/knowledge/golden-rules" },
    rpc: { method: "knowledge.golden_rules.save", body: "params" },
    cli: { command: ["knowledge", "golden-rules", "save"], usage: "knowledge golden-rules save --body rules.json" },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.golden_rules.publish",
    feature: "knowledge",
    label: "发布黄金规则包",
    target: { controller: "system", method: "handlePublishGoldenRules" },
    http: { method: "POST", path: "/api/knowledge/golden-rules/:packageId/publish" },
    rpc: {
      method: "knowledge.golden_rules.publish",
      body: "params",
      params: [{ name: "packageId", aliases: ["package-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "golden-rules", "publish"],
      usage: "knowledge golden-rules publish --id PACKAGE_ID --body publish.json",
      pathParams: { packageId: ["package-id", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.golden_rules.rollback",
    feature: "knowledge",
    label: "回滚黄金规则包",
    target: { controller: "system", method: "handleRollbackGoldenRules" },
    http: { method: "POST", path: "/api/knowledge/golden-rules/:packageId/rollback" },
    rpc: {
      method: "knowledge.golden_rules.rollback",
      body: "params",
      params: [{ name: "packageId", aliases: ["package-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "golden-rules", "rollback"],
      usage: "knowledge golden-rules rollback --id PACKAGE_ID --body rollback.json",
      pathParams: { packageId: ["package-id", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.rule_authoring.chat",
    feature: "knowledge",
    label: "对话生成黄金规则草稿",
    target: { controller: "system", method: "handleKnowledgeRuleAuthoringChat" },
    http: { method: "POST", path: "/api/knowledge/rule-authoring/chat" },
    rpc: { method: "knowledge.rule_authoring.chat", body: "params" },
    cli: {
      command: ["knowledge", "rule-authoring", "chat"],
      usage: "knowledge rule-authoring chat --message MESSAGE",
      bodyParams: [
        { name: "message", aliases: ["message", "m", "query", "q"], required: true },
        { name: "modelAlias", aliases: ["model", "model-alias"] },
        { name: "modelEnabled", aliases: ["model-enabled"], type: "boolean" }
      ]
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.rule_authoring.runs.get",
    feature: "knowledge",
    label: "读取规则生成运行",
    target: { controller: "system", method: "handleKnowledgeRuleAuthoringRunGet" },
    http: { method: "GET", path: "/api/knowledge/rule-authoring/runs/:runId" },
    rpc: {
      method: "knowledge.rule_authoring.runs.get",
      params: [{ name: "runId", aliases: ["run-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "rule-authoring", "get"],
      usage: "knowledge rule-authoring get --id RUN_ID",
      pathParams: { runId: ["run-id", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.gold_cases.list",
    feature: "knowledge",
    label: "黄金样本列表",
    target: { controller: "system", method: "handleGoldCases" },
    http: {
      method: "GET",
      path: "/api/knowledge/gold-cases",
      query: [
        { name: "limit", aliases: ["limit"] },
        { name: "tag", aliases: ["tag"] }
      ],
      coerce: { limit: "number" }
    },
    rpc: { method: "knowledge.gold_cases.list" },
    cli: { command: ["knowledge", "gold-cases"], usage: "knowledge gold-cases [--limit 100]" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.gold_cases.save",
    feature: "knowledge",
    label: "保存黄金样本",
    target: { controller: "system", method: "handleSaveGoldCase" },
    http: { method: "POST", path: "/api/knowledge/gold-cases" },
    rpc: { method: "knowledge.gold_cases.save", body: "params" },
    cli: { command: ["knowledge", "gold-cases", "save"], usage: "knowledge gold-cases save --body gold-case.json" },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.distillation.runs.create",
    feature: "knowledge",
    label: "创建知识蒸馏任务",
    target: { controller: "system", method: "handleKnowledgeDistillationRuns" },
    http: { method: "POST", path: "/api/knowledge/distillation/runs" },
    rpc: { method: "knowledge.distillation.runs.create", body: "params" },
    cli: {
      command: ["knowledge", "distillation", "run"],
      usage: "knowledge distillation run --query QUERY [--limit 30]",
      bodyParams: [
        { name: "query", aliases: ["query", "q"], required: true },
        { name: "limit", aliases: ["limit"], type: "number" }
      ]
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.distillation.runs.get",
    feature: "knowledge",
    label: "读取知识蒸馏任务",
    target: { controller: "system", method: "handleKnowledgeDistillationRunGet" },
    http: { method: "GET", path: "/api/knowledge/distillation/runs/:runId" },
    rpc: {
      method: "knowledge.distillation.runs.get",
      params: [{ name: "runId", aliases: ["run-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "distillation", "get"],
      usage: "knowledge distillation get --id RUN_ID",
      pathParams: { runId: ["run-id", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.distillation.workbench.runs.list",
    feature: "knowledge",
    label: "列出知识蒸馏工作台任务",
    target: { controller: "system", method: "handleKnowledgeDistillationWorkbenchRunsList" },
    http: { method: "GET", path: "/api/knowledge/distillation/workbench/runs" },
    rpc: {
      method: "knowledge.distillation.workbench.runs.list",
      params: [{ name: "limit", aliases: ["limit"], type: "number" }]
    },
    cli: {
      command: ["knowledge", "distillation", "workbench", "list"],
      usage: "knowledge distillation workbench list [--limit 50]"
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.distillation.workbench.runs.create",
    feature: "knowledge",
    label: "创建知识蒸馏工作台任务",
    target: { controller: "system", method: "handleKnowledgeDistillationWorkbenchRunsCreate" },
    http: { method: "POST", path: "/api/knowledge/distillation/workbench/runs" },
    rpc: { method: "knowledge.distillation.workbench.runs.create", body: "params" },
    cli: {
      command: ["knowledge", "distillation", "workbench", "run"],
      usage: "knowledge distillation workbench run --job-id JOB_ID [--query QUERY]",
      bodyParams: [
        { name: "jobId", aliases: ["job-id", "job"], required: true },
        { name: "query", aliases: ["query", "q"] },
        { name: "title", aliases: ["title"] },
        { name: "modelAlias", aliases: ["model", "model-alias"] }
      ]
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.distillation.workbench.runs.get",
    feature: "knowledge",
    label: "读取知识蒸馏工作台任务",
    target: { controller: "system", method: "handleKnowledgeDistillationWorkbenchRunGet" },
    http: { method: "GET", path: "/api/knowledge/distillation/workbench/runs/:runId" },
    rpc: {
      method: "knowledge.distillation.workbench.runs.get",
      params: [{ name: "runId", aliases: ["run-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "distillation", "workbench", "get"],
      usage: "knowledge distillation workbench get --id RUN_ID",
      pathParams: { runId: ["run-id", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.distillation.workbench.runs.resume",
    feature: "knowledge",
    label: "恢复知识蒸馏工作台任务",
    target: { controller: "system", method: "handleKnowledgeDistillationWorkbenchRunResume" },
    http: { method: "POST", path: "/api/knowledge/distillation/workbench/runs/:runId/resume" },
    rpc: {
      method: "knowledge.distillation.workbench.runs.resume",
      params: [{ name: "runId", aliases: ["run-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "distillation", "workbench", "resume"],
      usage: "knowledge distillation workbench resume --id RUN_ID",
      pathParams: { runId: ["run-id", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.distillation.workbench.runs.cancel",
    feature: "knowledge",
    label: "取消知识蒸馏工作台任务",
    target: { controller: "system", method: "handleKnowledgeDistillationWorkbenchRunCancel" },
    http: { method: "POST", path: "/api/knowledge/distillation/workbench/runs/:runId/cancel" },
    rpc: { method: "knowledge.distillation.workbench.runs.cancel", body: "params" },
    cli: {
      command: ["knowledge", "distillation", "workbench", "cancel"],
      usage: "knowledge distillation workbench cancel --id RUN_ID",
      pathParams: { runId: ["run-id", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.distillation.workbench.runs.archive",
    feature: "knowledge",
    label: "归档知识蒸馏工作台任务",
    target: { controller: "system", method: "handleKnowledgeDistillationWorkbenchRunArchive" },
    http: { method: "POST", path: "/api/knowledge/distillation/workbench/runs/:runId/archive" },
    rpc: {
      method: "knowledge.distillation.workbench.runs.archive",
      params: [{ name: "runId", aliases: ["run-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "distillation", "workbench", "archive"],
      usage: "knowledge distillation workbench archive --id RUN_ID",
      pathParams: { runId: ["run-id", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.distillation.workbench.runs.delete",
    feature: "knowledge",
    label: "删除知识蒸馏工作台任务",
    target: { controller: "system", method: "handleKnowledgeDistillationWorkbenchRunDelete" },
    http: { method: "DELETE", path: "/api/knowledge/distillation/workbench/runs/:runId" },
    rpc: {
      method: "knowledge.distillation.workbench.runs.delete",
      params: [{ name: "runId", aliases: ["run-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "distillation", "workbench", "delete"],
      usage: "knowledge distillation workbench delete --id RUN_ID",
      pathParams: { runId: ["run-id", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.distillation.workbench.stage.rerun",
    feature: "knowledge",
    label: "重跑知识蒸馏工作台阶段",
    target: { controller: "system", method: "handleKnowledgeDistillationWorkbenchStageRerun" },
    http: { method: "POST", path: "/api/knowledge/distillation/workbench/runs/:runId/stages/:stageId/rerun" },
    rpc: {
      method: "knowledge.distillation.workbench.stage.rerun",
      params: [
        { name: "runId", aliases: ["run-id", "id"], required: true },
        { name: "stageId", aliases: ["stage-id", "stage"], required: true }
      ]
    },
    cli: {
      command: ["knowledge", "distillation", "workbench", "rerun-stage"],
      usage: "knowledge distillation workbench rerun-stage --id RUN_ID --stage-id STAGE_ID",
      pathParams: { runId: ["run-id", "id"], stageId: ["stage-id", "stage"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.distillation.workbench.stage.export",
    feature: "knowledge",
    label: "导出知识蒸馏工作台阶段结果",
    target: { controller: "system", method: "handleKnowledgeDistillationWorkbenchStageExport" },
    http: { method: "GET", path: "/api/knowledge/distillation/workbench/runs/:runId/exports/:stageId" },
    rpc: {
      method: "knowledge.distillation.workbench.stage.export",
      params: [
        { name: "runId", aliases: ["run-id", "id"], required: true },
        { name: "stageId", aliases: ["stage-id", "stage"], required: true },
        { name: "format", aliases: ["format", "to"] }
      ]
    },
    cli: {
      command: ["knowledge", "distillation", "workbench", "export"],
      usage: "knowledge distillation workbench export --id RUN_ID --stage-id STAGE_ID --format markdown",
      pathParams: { runId: ["run-id", "id"], stageId: ["stage-id", "stage"] },
      queryParams: [
        { name: "format", aliases: ["format", "to"] }
      ]
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.distillation.workbench.runs.package",
    feature: "knowledge",
    label: "导出知识蒸馏工作台整包",
    target: { controller: "system", method: "handleKnowledgeDistillationWorkbenchRunPackageExport" },
    http: { method: "GET", path: "/api/knowledge/distillation/workbench/runs/:runId/package" },
    rpc: {
      method: "knowledge.distillation.workbench.runs.package",
      params: [{ name: "runId", aliases: ["run-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "distillation", "workbench", "package"],
      usage: "knowledge distillation workbench package --id RUN_ID",
      pathParams: { runId: ["run-id", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.distillation.workbench.runs.compare",
    feature: "knowledge",
    label: "比较知识蒸馏工作台版本",
    target: { controller: "system", method: "handleKnowledgeDistillationWorkbenchRunCompare" },
    http: { method: "GET", path: "/api/knowledge/distillation/workbench/runs/:runId/compare" },
    rpc: {
      method: "knowledge.distillation.workbench.runs.compare",
      params: [
        { name: "runId", aliases: ["run-id", "id"], required: true },
        { name: "rightRunId", aliases: ["right-run-id", "right"], required: true }
      ]
    },
    cli: {
      command: ["knowledge", "distillation", "workbench", "compare"],
      usage: "knowledge distillation workbench compare --id LEFT_RUN_ID --right-run-id RIGHT_RUN_ID",
      pathParams: { runId: ["run-id", "id"] },
      queryParams: [{ name: "rightRunId", aliases: ["right-run-id", "right"] }]
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.skills.evaluation.runs.create",
    feature: "knowledge",
    label: "创建知识 SkillSet 离线评估",
    target: { controller: "system", method: "handleKnowledgeSkillEvaluationRuns" },
    http: { method: "POST", path: "/api/knowledge/skills/evaluation/runs" },
    rpc: { method: "knowledge.skills.evaluation.runs.create", body: "params" },
    cli: { command: ["knowledge", "skills", "evaluation", "run"], usage: "knowledge skills evaluation run --body evaluation.json" },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.skills.deployments.create",
    feature: "knowledge",
    label: "发布知识 SkillSet 部署",
    target: { controller: "system", method: "handleKnowledgeSkillDeployments" },
    http: { method: "POST", path: "/api/knowledge/skills/deployments" },
    rpc: { method: "knowledge.skills.deployments.create", body: "params" },
    cli: { command: ["knowledge", "skills", "deployments", "create"], usage: "knowledge skills deployments create --body deployment.json" },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.skills.deployments.rollback",
    feature: "knowledge",
    label: "回滚知识 SkillSet 部署",
    target: { controller: "system", method: "handleKnowledgeSkillDeploymentRollback" },
    http: { method: "POST", path: "/api/knowledge/skills/deployments/:deploymentId/rollback" },
    rpc: {
      method: "knowledge.skills.deployments.rollback",
      body: "params",
      params: [{ name: "deploymentId", aliases: ["deployment-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "skills", "deployments", "rollback"],
      usage: "knowledge skills deployments rollback --id DEPLOYMENT_ID",
      pathParams: { deploymentId: ["deployment-id", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.training_sets.export",
    feature: "knowledge",
    label: "导出黄金训练集",
    target: { controller: "system", method: "handleKnowledgeTrainingSetExport" },
    http: { method: "POST", path: "/api/knowledge/training-sets/export" },
    rpc: { method: "knowledge.training_sets.export", body: "params" },
    cli: { command: ["knowledge", "training-sets", "export"], usage: "knowledge training-sets export --body export.json" },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.evaluation.runs.create",
    feature: "knowledge",
    label: "创建智能体知识评估运行",
    target: { controller: "system", method: "handleAgentEvaluationRuns" },
    http: { method: "POST", path: "/api/knowledge/evaluation/runs" },
    rpc: { method: "knowledge.evaluation.runs.create", body: "params" },
    cli: {
      command: ["knowledge", "evaluation", "run"],
      usage: "knowledge evaluation run --body evaluation.json"
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.evaluation.runs.list",
    feature: "knowledge",
    label: "列出智能体知识评估运行",
    target: { controller: "system", method: "handleAgentEvaluationRunList" },
    http: {
      method: "GET",
      path: "/api/knowledge/evaluation/runs",
      query: [{ name: "limit", aliases: ["limit"] }],
      coerce: { limit: "number" }
    },
    rpc: {
      method: "knowledge.evaluation.runs.list",
      query: [{ name: "limit", aliases: ["limit"] }]
    },
    cli: { command: ["knowledge", "evaluation", "runs"], usage: "knowledge evaluation runs [--limit 50]" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.evaluation.runs.get",
    feature: "knowledge",
    label: "读取智能体知识评估运行",
    target: { controller: "system", method: "handleAgentEvaluationRun" },
    http: { method: "GET", path: "/api/knowledge/evaluation/runs/:runId" },
    rpc: {
      method: "knowledge.evaluation.runs.get",
      params: [{ name: "runId", aliases: ["run-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "evaluation", "get"],
      usage: "knowledge evaluation get --id RUN_ID",
      pathParams: { runId: ["run-id", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.model_roles",
    feature: "knowledge",
    label: "读取知识库模型角色",
    target: { controller: "system", method: "handleModelDecisionRoles" },
    http: { method: "GET", path: "/api/knowledge/model-roles" },
    rpc: { method: "knowledge.model_roles" },
    cli: { command: ["knowledge", "model-roles"], usage: "knowledge model-roles" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.model_decision",
    feature: "knowledge",
    label: "执行知识库模型决策",
    target: { controller: "system", method: "handleModelDecisionDecide" },
    http: { method: "POST", path: "/api/knowledge/model-roles/decide" },
    rpc: { method: "knowledge.model_decision", body: "params" },
    cli: { command: ["knowledge", "model-roles", "decide"], usage: "knowledge model-roles decide --body decision.json" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.evolution.describe",
    feature: "knowledge",
    label: "读取知识进化闭环说明",
    target: { controller: "system", method: "handleKnowledgeEvolutionDescribe" },
    http: { method: "GET", path: "/api/knowledge/evolution" },
    rpc: { method: "knowledge.evolution.describe" },
    cli: { command: ["knowledge", "evolution"], usage: "knowledge evolution" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.evolution.runs.create",
    feature: "knowledge",
    label: "执行知识进化闭环",
    target: { controller: "system", method: "handleKnowledgeEvolutionRun" },
    http: { method: "POST", path: "/api/knowledge/evolution/runs" },
    rpc: { method: "knowledge.evolution.runs.create", body: "params" },
    cli: { command: ["knowledge", "evolution", "run"], usage: "knowledge evolution run --body evolution.json" },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.evolution.runs.list",
    feature: "knowledge",
    label: "列出知识进化闭环运行",
    target: { controller: "system", method: "handleKnowledgeEvolutionRuns" },
    http: {
      method: "GET",
      path: "/api/knowledge/evolution/runs",
      query: [{ name: "limit", aliases: ["limit"] }],
      coerce: { limit: "number" }
    },
    rpc: {
      method: "knowledge.evolution.runs.list",
      query: [{ name: "limit", aliases: ["limit"] }]
    },
    cli: { command: ["knowledge", "evolution", "runs"], usage: "knowledge evolution runs [--limit 50]" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.evolution.runs.get",
    feature: "knowledge",
    label: "读取知识进化闭环运行",
    target: { controller: "system", method: "handleKnowledgeEvolutionRunGet" },
    http: { method: "GET", path: "/api/knowledge/evolution/runs/:runId" },
    rpc: {
      method: "knowledge.evolution.runs.get",
      params: [{ name: "runId", aliases: ["run-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "evolution", "get"],
      usage: "knowledge evolution get --id RUN_ID",
      pathParams: { runId: ["run-id", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.hierarchy.audit",
    feature: "knowledge",
    label: "审计分层索引质量",
    target: { controller: "system", method: "handleKnowledgeHierarchyAudit" },
    http: { method: "POST", path: "/api/knowledge/hierarchy/audit" },
    rpc: { method: "knowledge.hierarchy.audit", body: "params" },
    cli: { command: ["knowledge", "hierarchy", "audit"], usage: "knowledge hierarchy audit --body audit.json" },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.evolution.deployments.list",
    feature: "knowledge",
    label: "列出检索 profile 部署",
    target: { controller: "system", method: "handleKnowledgeEvolutionDeployments" },
    http: {
      method: "GET",
      path: "/api/knowledge/evolution/deployments",
      query: [
        { name: "status", aliases: ["status"] },
        { name: "limit", aliases: ["limit"] }
      ],
      coerce: { limit: "number" }
    },
    rpc: {
      method: "knowledge.evolution.deployments.list",
      query: [
        { name: "status", aliases: ["status"] },
        { name: "limit", aliases: ["limit"] }
      ]
    },
    cli: { command: ["knowledge", "evolution", "deployments"], usage: "knowledge evolution deployments [--status canary]" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.evolution.deployments.promote",
    feature: "knowledge",
    label: "提升检索 profile 灰度部署",
    target: { controller: "system", method: "handleKnowledgeEvolutionDeploymentPromote" },
    http: { method: "POST", path: "/api/knowledge/evolution/deployments/:deploymentId/promote" },
    rpc: {
      method: "knowledge.evolution.deployments.promote",
      body: "params",
      params: [{ name: "deploymentId", aliases: ["deployment-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "evolution", "promote"],
      usage: "knowledge evolution promote --id DEPLOYMENT_ID",
      pathParams: { deploymentId: ["deployment-id", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.evolution.deployments.rollback",
    feature: "knowledge",
    label: "回滚检索 profile 部署",
    target: { controller: "system", method: "handleKnowledgeEvolutionDeploymentRollback" },
    http: { method: "POST", path: "/api/knowledge/evolution/deployments/:deploymentId/rollback" },
    rpc: {
      method: "knowledge.evolution.deployments.rollback",
      body: "params",
      params: [{ name: "deploymentId", aliases: ["deployment-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "evolution", "rollback"],
      usage: "knowledge evolution rollback --id DEPLOYMENT_ID",
      pathParams: { deploymentId: ["deployment-id", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.summarization.runs.create",
    feature: "knowledge",
    label: "创建多智能体知识总结任务",
    target: { controller: "system", method: "handleKnowledgeSummarizationRun" },
    http: { method: "POST", path: "/api/knowledge/summarization/runs" },
    rpc: { method: "knowledge.summarization.runs.create", body: "params" },
    cli: {
      command: ["knowledge", "summarize"],
      usage: "knowledge summarize --query QUERY [--body summarization.json]",
      bodyParams: [
        { name: "query", aliases: ["query", "q"] },
        { name: "batchId", aliases: ["batch-id", "batchId"] },
        { name: "limit", aliases: ["limit"], type: "number" },
        { name: "contextProfileId", aliases: ["context-profile", "contextProfileId"] }
      ]
    },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "knowledge.summarization.runs.get",
    feature: "knowledge",
    label: "读取多智能体知识总结任务",
    target: { controller: "system", method: "handleGetKnowledgeSummarizationRun" },
    http: {
      method: "GET",
      path: "/api/knowledge/summarization/runs/:runId",
      query: [{ name: "includePrivate", aliases: ["include-private", "includePrivate", "private"] }],
      coerce: { includePrivate: "boolean" }
    },
    rpc: {
      method: "knowledge.summarization.runs.get",
      params: [{ name: "runId", aliases: ["run-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "summarize", "get"],
      usage: "knowledge summarize get --id RUN_ID",
      pathParams: { runId: ["run-id", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.summarization.runs.approve",
    feature: "knowledge",
    label: "确认发布多智能体知识总结 artifact",
    target: { controller: "system", method: "handleApproveKnowledgeSummarizationRun" },
    http: { method: "POST", path: "/api/knowledge/summarization/runs/:runId/approve" },
    rpc: {
      method: "knowledge.summarization.runs.approve",
      body: "params",
      params: [{ name: "runId", aliases: ["run-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "summarize", "approve"],
      usage: "knowledge summarize approve --id RUN_ID",
      pathParams: { runId: ["run-id", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "knowledge.agent_explore.runs.create",
    feature: "knowledge",
    label: "创建智能探索任务",
    target: { controller: "system", method: "handleKnowledgeAgentExploreRun" },
    http: { method: "POST", path: "/api/knowledge/agent-explore/runs" },
    rpc: { method: "knowledge.agent_explore.runs.create", body: "params" },
    cli: {
      command: ["knowledge", "agent-explore"],
      usage: "knowledge agent-explore --query QUERY [--model-alias deepseek]",
      bodyParams: [
        { name: "query", aliases: ["query", "q"], required: true },
        { name: "modelAlias", aliases: ["model-alias", "modelAlias", "alias"] },
        { name: "contextProfileId", aliases: ["context-profile", "contextProfileId"] },
        { name: "thinkingMode", aliases: ["thinking", "thinking-mode", "thinkingMode"] },
        { name: "maxIterations", aliases: ["max-iterations", "maxIterations"], type: "number" },
        { name: "limit", aliases: ["limit"], type: "number" },
        { name: "workspaceId", aliases: ["workspace-id", "workspaceId"] }
      ]
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.agent_explore.runs.get",
    feature: "knowledge",
    label: "读取智能探索任务",
    target: { controller: "system", method: "handleGetKnowledgeAgentExploreRun" },
    http: {
      method: "GET",
      path: "/api/knowledge/agent-explore/runs/:runId",
      query: [
        { name: "workspaceId", aliases: ["workspace-id", "workspaceId"] },
        { name: "includePrivate", aliases: ["include-private", "includePrivate", "private"] }
      ],
      coerce: { includePrivate: "boolean" }
    },
    rpc: {
      method: "knowledge.agent_explore.runs.get",
      params: [{ name: "runId", aliases: ["run-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "agent-explore", "get"],
      usage: "knowledge agent-explore get --id RUN_ID",
      pathParams: { runId: ["run-id", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "agent_workspaces.create",
    feature: "agent_workspace",
    label: "创建智能体共享工作空间",
    target: { controller: "system", method: "handleCreateAgentWorkspace" },
    http: { method: "POST", path: "/api/agent-workspaces" },
    rpc: { method: "agent_workspaces.create", body: "params" },
    cli: {
      command: ["agent-workspaces", "create"],
      usage: "agent-workspaces create --body workspace.json"
    },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "agent_workspaces.list",
    feature: "agent_workspace",
    label: "列出智能体共享工作空间",
    target: { controller: "system", method: "handleAgentWorkspaces" },
    http: {
      method: "GET",
      path: "/api/agent-workspaces",
      query: [
        { name: "status", aliases: ["status"] },
        { name: "limit", aliases: ["limit"] },
        { name: "includeSummary", aliases: ["include-summary", "includeSummary"] }
      ],
      coerce: { limit: "number", includeSummary: "boolean" }
    },
    rpc: {
      method: "agent_workspaces.list",
      query: [
        { name: "status", aliases: ["status"] },
        { name: "limit", aliases: ["limit"] },
        { name: "includeSummary", aliases: ["include-summary", "includeSummary"] }
      ]
    },
    cli: {
      command: ["agent-workspaces"],
      usage: "agent-workspaces [--status active] [--limit 50]"
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "agent_workspaces.get",
    feature: "agent_workspace",
    label: "读取智能体共享工作空间",
    target: { controller: "system", method: "handleAgentWorkspace" },
    http: {
      method: "GET",
      path: "/api/agent-workspaces/:workspaceId",
      query: [{ name: "includePrivate", aliases: ["include-private", "includePrivate", "private"] }],
      coerce: { includePrivate: "boolean" }
    },
    rpc: {
      method: "agent_workspaces.get",
      params: [{ name: "workspaceId", aliases: ["workspace-id", "id"], required: true }]
    },
    cli: {
      command: ["agent-workspaces", "get"],
      usage: "agent-workspaces get --id WORKSPACE_ID",
      pathParams: { workspaceId: ["workspace-id", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "agent_sessions.list",
    feature: "agent_workspace",
    label: "列出团队共享会话线程",
    target: { controller: "system", method: "handleAgentSessions" },
    http: {
      method: "GET",
      path: "/api/agent-sessions",
      query: [
        { name: "status", aliases: ["status"] },
        { name: "workspaceId", aliases: ["workspace-id", "workspaceId"] },
        { name: "limit", aliases: ["limit"] },
        { name: "includeLastEvent", aliases: ["include-last-event", "includeLastEvent"] }
      ],
      coerce: { limit: "number", includeLastEvent: "boolean" }
    },
    rpc: {
      method: "agent_sessions.list",
      query: [
        { name: "status", aliases: ["status"] },
        { name: "workspaceId", aliases: ["workspace-id", "workspaceId"] },
        { name: "limit", aliases: ["limit"] }
      ]
    },
    cli: {
      command: ["agent-sessions"],
      usage: "agent-sessions [--workspace-id WORKSPACE_ID] [--status active] [--limit 100]"
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "agent_sessions.get",
    feature: "agent_workspace",
    label: "读取团队共享会话线程",
    target: { controller: "system", method: "handleAgentSession" },
    http: {
      method: "GET",
      path: "/api/agent-sessions/:sessionId",
      params: [{ name: "sessionId", aliases: ["session-id", "sessionId", "id"], required: true }],
      query: [
        { name: "includeEvents", aliases: ["include-events", "includeEvents"] },
        { name: "eventLimit", aliases: ["event-limit", "eventLimit", "limit"] }
      ],
      coerce: { includeEvents: "boolean", eventLimit: "number" }
    },
    rpc: {
      method: "agent_sessions.get",
      params: [{ name: "sessionId", aliases: ["session-id", "sessionId", "id"], required: true }]
    },
    cli: {
      command: ["agent-sessions", "get"],
      usage: "agent-sessions get --id SESSION_ID",
      pathParams: { sessionId: ["session-id", "sessionId", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "agent_sessions.context.get",
    feature: "agent_workspace",
    label: "读取会话线程运行上下文",
    target: { controller: "system", method: "handleGetAgentSessionContext" },
    http: {
      method: "GET",
      path: "/api/agent-sessions/:sessionId/context",
      params: [{ name: "sessionId", aliases: ["session-id", "sessionId", "id"], required: true }]
    },
    rpc: {
      method: "agent_sessions.context.get",
      params: [{ name: "sessionId", aliases: ["session-id", "sessionId", "id"], required: true }]
    },
    cli: {
      command: ["agent-sessions", "context"],
      usage: "agent-sessions context --id SESSION_ID",
      pathParams: { sessionId: ["session-id", "sessionId", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "agent_sessions.events.append",
    feature: "agent_workspace",
    label: "追加会话线程事件",
    target: { controller: "system", method: "handleAppendAgentSessionEvent" },
    http: {
      method: "POST",
      path: "/api/agent-sessions/:sessionId/events",
      params: [{ name: "sessionId", aliases: ["session-id", "sessionId", "id"], required: true }]
    },
    rpc: {
      method: "agent_sessions.events.append",
      body: "params",
      params: [{ name: "sessionId", aliases: ["session-id", "sessionId", "id"], required: true }]
    },
    cli: {
      command: ["agent-sessions", "events", "append"],
      usage: "agent-sessions events append --id SESSION_ID --body event.json",
      pathParams: { sessionId: ["session-id", "sessionId", "id"] }
    },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "agent_sessions.fork",
    feature: "agent_workspace",
    label: "从会话线程分叉新线程",
    target: { controller: "system", method: "handleForkAgentSession" },
    http: {
      method: "POST",
      path: "/api/agent-sessions/:sessionId/fork",
      params: [{ name: "sessionId", aliases: ["session-id", "sessionId", "id"], required: true }]
    },
    rpc: {
      method: "agent_sessions.fork",
      body: "params",
      params: [{ name: "sessionId", aliases: ["session-id", "sessionId", "id"], required: true }]
    },
    cli: {
      command: ["agent-sessions", "fork"],
      usage: "agent-sessions fork --id SESSION_ID --body fork.json",
      pathParams: { sessionId: ["session-id", "sessionId", "id"] }
    },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "agent_sessions.compare",
    feature: "agent_workspace",
    label: "比较会话线程分叉",
    target: { controller: "system", method: "handleCompareAgentSessions" },
    http: {
      method: "POST",
      path: "/api/agent-sessions/:sessionId/compare",
      params: [{ name: "sessionId", aliases: ["session-id", "sessionId", "id"], required: true }]
    },
    rpc: {
      method: "agent_sessions.compare",
      body: "params",
      params: [{ name: "sessionId", aliases: ["session-id", "sessionId", "id"], required: true }]
    },
    cli: {
      command: ["agent-sessions", "compare"],
      usage: "agent-sessions compare --id SESSION_ID --body compare.json",
      pathParams: { sessionId: ["session-id", "sessionId", "id"] }
    },
    requiredScopes: ["knowledge:read"],
    readOnly: true,
    concurrencySafe: true
  },
  {
    id: "agent_sessions.merge_proposal",
    feature: "agent_workspace",
    label: "创建会话线程合并提案",
    target: { controller: "system", method: "handleAgentSessionMergeProposal" },
    http: {
      method: "POST",
      path: "/api/agent-sessions/:sessionId/merge-proposal",
      params: [{ name: "sessionId", aliases: ["session-id", "sessionId", "id"], required: true }]
    },
    rpc: {
      method: "agent_sessions.merge_proposal",
      body: "params",
      params: [{ name: "sessionId", aliases: ["session-id", "sessionId", "id"], required: true }]
    },
    cli: {
      command: ["agent-sessions", "merge-proposal"],
      usage: "agent-sessions merge-proposal --id SESSION_ID --body proposal.json",
      pathParams: { sessionId: ["session-id", "sessionId", "id"] }
    },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "agent_sessions.archive",
    feature: "agent_workspace",
    label: "归档会话线程",
    target: { controller: "system", method: "handleArchiveAgentSession" },
    http: {
      method: "POST",
      path: "/api/agent-sessions/:sessionId/archive",
      params: [{ name: "sessionId", aliases: ["session-id", "sessionId", "id"], required: true }]
    },
    rpc: {
      method: "agent_sessions.archive",
      body: "params",
      params: [{ name: "sessionId", aliases: ["session-id", "sessionId", "id"], required: true }]
    },
    cli: {
      command: ["agent-sessions", "archive"],
      usage: "agent-sessions archive --id SESSION_ID --body archive.json",
      pathParams: { sessionId: ["session-id", "sessionId", "id"] }
    },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "agent_workspaces.submissions.resolve",
    feature: "agent_workspace",
    label: "审核智能体共享提交",
    target: { controller: "system", method: "handleResolveAgentWorkspaceSubmission" },
    http: { method: "POST", path: "/api/agent-workspaces/:workspaceId/submissions/:submissionId/resolve" },
    rpc: {
      method: "agent_workspaces.submissions.resolve",
      body: "params",
      params: [
        { name: "workspaceId", aliases: ["workspace-id", "workspaceId"], required: true },
        { name: "submissionId", aliases: ["submission-id", "submissionId", "id"], required: true }
      ]
    },
    cli: {
      command: ["agent-workspaces", "submission", "resolve"],
      usage: "agent-workspaces submission resolve --workspace-id WORKSPACE_ID --id SUBMISSION_ID --body resolution.json",
      pathParams: {
        workspaceId: ["workspace-id", "workspaceId"],
        submissionId: ["submission-id", "submissionId", "id"]
      }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "agent_workspaces.issues.resolve",
    feature: "agent_workspace",
    label: "解决智能体共享空间 issue",
    target: { controller: "system", method: "handleResolveAgentWorkspaceIssue" },
    http: { method: "POST", path: "/api/agent-workspaces/:workspaceId/issues/:issueId/resolve" },
    rpc: {
      method: "agent_workspaces.issues.resolve",
      body: "params",
      params: [
        { name: "workspaceId", aliases: ["workspace-id", "workspaceId"], required: true },
        { name: "issueId", aliases: ["issue-id", "issueId", "id"], required: true }
      ]
    },
    cli: {
      command: ["agent-workspaces", "issue", "resolve"],
      usage: "agent-workspaces issue resolve --workspace-id WORKSPACE_ID --id ISSUE_ID --body resolution.json",
      pathParams: {
        workspaceId: ["workspace-id", "workspaceId"],
        issueId: ["issue-id", "issueId", "id"]
      }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "agent_workspaces.locks.list",
    feature: "agent_workspace",
    label: "列出智能体共享空间锁",
    target: { controller: "system", method: "handleAgentWorkspaceLocks" },
    http: {
      method: "GET",
      path: "/api/agent-workspaces/:workspaceId/locks",
      query: [
        { name: "limit", aliases: ["limit"] },
        { name: "includeExpired", aliases: ["include-expired", "includeExpired"] }
      ],
      coerce: { limit: "number", includeExpired: "boolean" }
    },
    rpc: {
      method: "agent_workspaces.locks.list",
      params: [{ name: "workspaceId", aliases: ["workspace-id", "workspaceId", "id"], required: true }],
      query: [
        { name: "limit", aliases: ["limit"] },
        { name: "includeExpired", aliases: ["include-expired", "includeExpired"] }
      ]
    },
    cli: {
      command: ["agent-workspaces", "locks"],
      usage: "agent-workspaces locks --workspace-id WORKSPACE_ID",
      pathParams: { workspaceId: ["workspace-id", "workspaceId", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "agent_workspaces.locks.write",
    feature: "agent_workspace",
    label: "获取或释放智能体共享空间锁",
    target: { controller: "system", method: "handleAgentWorkspaceLock" },
    http: { method: "POST", path: "/api/agent-workspaces/:workspaceId/locks" },
    rpc: {
      method: "agent_workspaces.locks.write",
      body: "params",
      params: [{ name: "workspaceId", aliases: ["workspace-id", "workspaceId", "id"], required: true }]
    },
    cli: {
      command: ["agent-workspaces", "lock"],
      usage: "agent-workspaces lock --workspace-id WORKSPACE_ID --body lock.json",
      pathParams: { workspaceId: ["workspace-id", "workspaceId", "id"] }
    },
    requiredScopes: ["knowledge:write"]
  },

  // ── Workspace inheritance, profile & sharing operations ─────────────────
  {
    id: "agent_workspaces.context.get",
    feature: "agent_workspace",
    label: "获取工作空间完整运行上下文（继承链解析）",
    target: { controller: "system", method: "handleGetWorkspaceContext" },
    http: {
      method: "GET",
      path: "/api/agent-workspaces/:workspaceId/context",
      params: [{ name: "workspaceId", aliases: ["workspace-id", "workspaceId", "id"], required: true }]
    },
    rpc: { method: "agent_workspaces.context.get" },
    cli: {
      command: ["agent-workspaces", "context"],
      usage: "agent-workspaces context --workspace-id WORKSPACE_ID",
      pathParams: { workspaceId: ["workspace-id", "workspaceId", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "agent_workspaces.context_bundle.export",
    feature: "agent_workspace",
    label: "导出工作空间上下文压缩包",
    target: { controller: "system", method: "handleExportWorkspaceContextBundle" },
    http: {
      method: "GET",
      path: "/api/agent-workspaces/:workspaceId/context-bundle",
      params: [{ name: "workspaceId", aliases: ["workspace-id", "workspaceId", "id"], required: true }],
      query: [
        { name: "format", aliases: ["format"] },
        { name: "compress", aliases: ["compress"] },
        { name: "compressedOnly", aliases: ["compressed-only", "compressedOnly"] },
        { name: "includePrivate", aliases: ["include-private", "includePrivate", "private"] },
        { name: "maxItems", aliases: ["max-items", "maxItems", "limit"] },
        { name: "contentPreviewChars", aliases: ["content-preview-chars", "contentPreviewChars"] }
      ],
      coerce: {
        includePrivate: "boolean",
        compressedOnly: "boolean",
        maxItems: "number",
        contentPreviewChars: "number"
      }
    },
    rpc: {
      method: "agent_workspaces.context_bundle.export",
      params: [{ name: "workspaceId", aliases: ["workspace-id", "workspaceId", "id"], required: true }],
      query: [
        { name: "format", aliases: ["format"] },
        { name: "compress", aliases: ["compress"] },
        { name: "compressedOnly", aliases: ["compressed-only", "compressedOnly"] },
        { name: "includePrivate", aliases: ["include-private", "includePrivate", "private"] },
        { name: "maxItems", aliases: ["max-items", "maxItems", "limit"] },
        { name: "contentPreviewChars", aliases: ["content-preview-chars", "contentPreviewChars"] }
      ]
    },
    cli: {
      command: ["agent-workspaces", "context-bundle"],
      usage: "agent-workspaces context-bundle --workspace-id WORKSPACE_ID [--format compressed]",
      pathParams: { workspaceId: ["workspace-id", "workspaceId", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "agent_workspaces.context_bundle.restore",
    feature: "agent_workspace",
    label: "恢复工作空间上下文压缩包",
    target: { controller: "system", method: "handleRestoreWorkspaceContextBundle" },
    http: {
      method: "POST",
      path: "/api/agent-workspaces/:workspaceId/context-bundle/restore",
      params: [{ name: "workspaceId", aliases: ["workspace-id", "workspaceId", "id"], required: true }]
    },
    rpc: {
      method: "agent_workspaces.context_bundle.restore",
      body: "params",
      params: [{ name: "workspaceId", aliases: ["workspace-id", "workspaceId", "id"], required: true }]
    },
    cli: {
      command: ["agent-workspaces", "context-bundle", "restore"],
      usage: "agent-workspaces context-bundle restore --workspace-id WORKSPACE_ID --body bundle.json",
      pathParams: { workspaceId: ["workspace-id", "workspaceId", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "agent_workspaces.chain.get",
    feature: "agent_workspace",
    label: "读取工作空间继承链与解析后的知识范围",
    target: { controller: "system", method: "handleGetWorkspaceChain" },
    http: {
      method: "GET",
      path: "/api/agent-workspaces/:workspaceId/chain",
      params: [{ name: "workspaceId", aliases: ["workspace-id", "workspaceId", "id"], required: true }]
    },
    rpc: { method: "agent_workspaces.chain.get" },
    cli: {
      command: ["agent-workspaces", "chain"],
      usage: "agent-workspaces chain --workspace-id WORKSPACE_ID",
      pathParams: { workspaceId: ["workspace-id", "workspaceId", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "agent_workspaces.parent.set",
    feature: "agent_workspace",
    label: "设置工作空间继承父级",
    target: { controller: "system", method: "handleSetWorkspaceParent" },
    http: {
      method: "POST",
      path: "/api/agent-workspaces/:workspaceId/parent",
      params: [{ name: "workspaceId", aliases: ["workspace-id", "workspaceId", "id"], required: true }]
    },
    rpc: { method: "agent_workspaces.parent.set" },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "agent_workspaces.profile.hotswap",
    feature: "agent_workspace",
    label: "热切换工作空间 profile（模型/工具/上下文/知识范围）",
    target: { controller: "system", method: "handleHotSwapWorkspaceProfile" },
    http: {
      method: "POST",
      path: "/api/agent-workspaces/:workspaceId/profile",
      params: [{ name: "workspaceId", aliases: ["workspace-id", "workspaceId", "id"], required: true }]
    },
    rpc: { method: "agent_workspaces.profile.hotswap" },
    cli: {
      command: ["agent-workspaces", "profile"],
      usage: "agent-workspaces profile --workspace-id WORKSPACE_ID --body profile.json",
      pathParams: { workspaceId: ["workspace-id", "workspaceId", "id"] }
    },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "agent_workspaces.sources.set",
    feature: "agent_workspace",
    label: "设置工作空间自有知识源列表",
    target: { controller: "system", method: "handleSetWorkspaceOwnedSources" },
    http: {
      method: "POST",
      path: "/api/agent-workspaces/:workspaceId/sources",
      params: [{ name: "workspaceId", aliases: ["workspace-id", "workspaceId", "id"], required: true }]
    },
    rpc: { method: "agent_workspaces.sources.set" },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "agent_workspaces.share",
    feature: "agent_workspace",
    label: "将当前工作空间的知识访问权共享给另一工作空间",
    target: { controller: "system", method: "handleShareWorkspace" },
    http: {
      method: "POST",
      path: "/api/agent-workspaces/:workspaceId/share",
      params: [{ name: "workspaceId", aliases: ["workspace-id", "workspaceId", "id"], required: true }]
    },
    rpc: { method: "agent_workspaces.share" },
    requiredScopes: ["knowledge:maintain"]
  },
  {
    id: "agent_workspaces.unshare",
    feature: "agent_workspace",
    label: "撤销工作空间的访问共享",
    target: { controller: "system", method: "handleUnshareWorkspace" },
    http: {
      method: "POST",
      path: "/api/agent-workspaces/:workspaceId/unshare",
      params: [{ name: "workspaceId", aliases: ["workspace-id", "workspaceId", "id"], required: true }]
    },
    rpc: { method: "agent_workspaces.unshare" },
    requiredScopes: ["knowledge:maintain"]
  },

  {
    id: "context.profiles.get",
    feature: "context_runtime",
    label: "读取上下文预算 profile",
    target: { controller: "system", method: "handleContextProfiles" },
    http: { method: "GET", path: "/api/context/profiles" },
    rpc: { method: "context.profiles.get" },
    cli: { command: ["context", "profiles"], usage: "context profiles" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "context.profiles.set",
    feature: "context_runtime",
    label: "保存上下文预算 profile",
    target: { controller: "system", method: "handleContextProfiles" },
    http: { method: "POST", path: "/api/context/profiles" },
    rpc: { method: "context.profiles.set", body: "params" },
    cli: { command: ["context", "profiles", "set"], usage: "context profiles set --body profiles.json" },
    requiredScopes: ["knowledge:admin"]
  },
  {
    id: "client_runtime.profiles.get",
    feature: "client_runtime_allocator",
    label: "读取客户端运行时分配 profile",
    target: { controller: "system", method: "handleClientRuntimeProfiles" },
    http: { method: "GET", path: "/api/client-runtime/profiles" },
    rpc: { method: "client_runtime.profiles.get" },
    cli: { command: ["client-runtime", "profiles"], usage: "client-runtime profiles" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "client_runtime.profiles.set",
    feature: "client_runtime_allocator",
    label: "保存客户端运行时分配 profile",
    target: { controller: "system", method: "handleClientRuntimeProfiles" },
    http: { method: "POST", path: "/api/client-runtime/profiles" },
    rpc: { method: "client_runtime.profiles.set", body: "params" },
    cli: { command: ["client-runtime", "profiles", "set"], usage: "client-runtime profiles set --body profiles.json" },
    requiredScopes: ["knowledge:admin"]
  },
  {
    id: "client_runtime.resolve",
    feature: "client_runtime_allocator",
    label: "解析客户端运行时分配",
    target: { controller: "system", method: "handleClientRuntimeResolve" },
    http: { method: "POST", path: "/api/client-runtime/resolve" },
    rpc: { method: "client_runtime.resolve", body: "params" },
    cli: {
      command: ["client-runtime", "resolve"],
      usage: "client-runtime resolve --client-uid CLIENT_UID [--task-type knowledge.search]",
      bodyParams: [
        { name: "clientUid", aliases: ["client-uid", "clientUid"] },
        { name: "taskType", aliases: ["task-type", "taskType", "operationId"] },
        { name: "modelAlias", aliases: ["model-alias", "modelAlias", "alias", "model"] },
        { name: "contextProfileId", aliases: ["context-profile", "context-profile-id", "contextProfileId"] },
        { name: "retrievalProfileId", aliases: ["retrieval-profile", "retrieval-profile-id", "retrievalProfileId"] },
        { name: "workspaceId", aliases: ["workspace-id", "workspaceId"] }
      ]
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "client_runtime.status",
    feature: "client_runtime_allocator",
    label: "客户端运行时热度与冷却状态",
    target: { controller: "system", method: "handleClientRuntimeStatus" },
    http: { method: "GET", path: "/api/client-runtime/status" },
    rpc: { method: "client_runtime.status" },
    cli: { command: ["client-runtime", "status"], usage: "client-runtime status" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "context.preview",
    feature: "context_runtime",
    label: "预览上下文编译结果",
    target: { controller: "system", method: "handleContextPreview" },
    http: { method: "POST", path: "/api/context/preview" },
    rpc: { method: "context.preview", body: "params" },
    cli: { command: ["context", "preview"], usage: "context preview --body input.json" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "context.compaction.preview",
    feature: "context_runtime",
    label: "预览上下文压缩结果",
    target: { controller: "system", method: "handleContextCompactionPreview" },
    http: { method: "POST", path: "/api/context/compaction/preview" },
    rpc: { method: "context.compaction.preview", body: "params" },
    cli: { command: ["context", "compaction", "preview"], usage: "context compaction preview --body input.json" },
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        contextProfileId: { type: "string" },
        profileId: { type: "string" },
        sessionId: { type: "string" },
        messages: { type: "array" },
        transcript: { type: "array" },
        force: { type: "boolean" }
      }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "context.compaction.run",
    feature: "context_runtime",
    label: "执行上下文压缩",
    target: { controller: "system", method: "handleContextCompactionRun" },
    http: { method: "POST", path: "/api/context/compaction/run" },
    rpc: { method: "context.compaction.run", body: "params" },
    cli: { command: ["context", "compaction", "run"], usage: "context compaction run --body input.json" },
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        contextProfileId: { type: "string" },
        profileId: { type: "string" },
        sessionId: { type: "string" },
        messages: { type: "array" },
        transcript: { type: "array" },
        force: { type: "boolean" },
        persist: { type: "boolean" }
      }
    },
    requiredScopes: ["knowledge:write"]
  },
  {
    id: "context.compaction.records",
    feature: "context_runtime",
    label: "上下文压缩记录",
    target: { controller: "system", method: "handleContextCompactionRecords" },
    http: {
      method: "GET",
      path: "/api/context/compaction/records",
      query: [{ name: "limit", aliases: ["limit"], type: "number" }],
      coerce: { limit: "number" }
    },
    rpc: { method: "context.compaction.records" },
    cli: { command: ["context", "compaction", "records"], usage: "context compaction records --limit 50" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "context.session_memory.get",
    feature: "agent_memory",
    label: "读取上下文会话记忆",
    target: { controller: "system", method: "handleContextSessionMemory" },
    http: {
      method: "GET",
      path: "/api/context/session-memory",
      query: [
        { name: "limit", aliases: ["limit"], type: "number" },
        { name: "sessionId", aliases: ["session-id", "sessionId"] },
        { name: "profileId", aliases: ["profile-id", "profileId"] }
      ],
      coerce: { limit: "number" }
    },
    rpc: { method: "context.session_memory.get" },
    cli: { command: ["context", "session-memory"], usage: "context session-memory --limit 50" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "context.session_memory.clear",
    feature: "agent_memory",
    label: "清理上下文会话记忆",
    target: { controller: "system", method: "handleContextSessionMemoryClear" },
    http: { method: "POST", path: "/api/context/session-memory/clear" },
    rpc: { method: "context.session_memory.clear", body: "params" },
    cli: { command: ["context", "session-memory", "clear"], usage: "context session-memory clear --body clear.json" },
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        sessionId: { type: "string" },
        profileId: { type: "string" },
        reason: { type: "string" },
        confirm: { type: "boolean" }
      }
    },
    requiredScopes: ["knowledge:admin"]
  },
  {
    id: "context.build_records",
    feature: "context_runtime",
    label: "上下文编译记录",
    target: { controller: "system", method: "handleContextBuildRecords" },
    http: {
      method: "GET",
      path: "/api/context/build-records",
      query: [{ name: "limit", aliases: ["limit"], type: "number" }]
    },
    rpc: { method: "context.build_records" },
    cli: { command: ["context", "build-records"], usage: "context build-records --limit 50" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "context.evaluation.runs.create",
    feature: "context_runtime",
    label: "运行上下文 replay 评估",
    target: { controller: "system", method: "handleContextEvaluationRuns" },
    http: { method: "POST", path: "/api/context/evaluation/runs" },
    rpc: { method: "context.evaluation.runs.create", body: "params" },
    cli: { command: ["context", "evaluation", "run"], usage: "context evaluation run --body cases.json" },
    requiredScopes: ["knowledge:admin"]
  },
  {
    id: "knowledge.search",
    feature: "knowledge",
    label: "知识库统一检索",
    target: { controller: "system", method: "handleKnowledgeSearch" },
    http: { method: "POST", path: "/api/knowledge/search" },
    rpc: { method: "knowledge.search", body: "params" },
    cli: {
      command: ["knowledge", "search"],
      usage: "knowledge search --query QUERY [--limit 20] [--format markdown]",
      bodyParams: [
        { name: "query", aliases: ["query", "q"] },
        { name: "limit", aliases: ["limit"], type: "number" },
        { name: "batchId", aliases: ["batch-id", "batchId"] },
        { name: "clientUid", aliases: ["client-uid", "clientUid"] },
        { name: "clientId", aliases: ["client-id", "clientId"] },
        { name: "retrievalProfileId", aliases: ["profile", "profile-id", "retrievalProfileId"] },
        { name: "workspaceId", aliases: ["workspace-id", "workspaceId"] },
        { name: "learningEnabled", aliases: ["learning", "learning-enabled"], type: "boolean" },
        { name: "hierarchyReasoning", aliases: ["hierarchy-reasoning", "hierarchyReasoning"], type: "boolean" },
        { name: "modelEnabled", aliases: ["model-enabled", "modelEnabled", "use-model"], type: "boolean" },
        { name: "explain", aliases: ["explain"], type: "boolean" },
        { name: "format", aliases: ["format"] }
      ]
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.search.get",
    feature: "knowledge",
    label: "知识库统一检索 GET",
    target: { controller: "system", method: "handleKnowledgeSearch" },
    http: {
      method: "GET",
      path: "/api/knowledge/search",
      query: [
        { name: "query", aliases: ["query", "q"] },
        { name: "limit", aliases: ["limit"] },
        { name: "batchId", aliases: ["batch-id", "batchId"] },
        { name: "clientUid", aliases: ["client-uid", "clientUid"] },
        { name: "clientId", aliases: ["client-id", "clientId"] },
        { name: "retrievalProfileId", aliases: ["profile", "profile-id", "retrievalProfileId"] },
        { name: "workspaceId", aliases: ["workspace-id", "workspaceId"] },
        { name: "learningEnabled", aliases: ["learning", "learning-enabled"] },
        { name: "hierarchyReasoning", aliases: ["hierarchy-reasoning", "hierarchyReasoning"] },
        { name: "modelEnabled", aliases: ["model-enabled", "modelEnabled", "use-model"] },
        { name: "explain", aliases: ["explain"] },
        { name: "format", aliases: ["format"] }
      ],
      coerce: { limit: "number", learningEnabled: "boolean", hierarchyReasoning: "boolean", modelEnabled: "boolean", explain: "boolean" }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.document_structure",
    feature: "knowledge",
    label: "知识文档结构树",
    target: { controller: "system", method: "handleKnowledgeDocumentStructure" },
    http: {
      method: "GET",
      path: "/api/knowledge/documents/:documentId/structure",
      query: [
        { name: "maxNodes", aliases: ["max-nodes", "maxNodes"] }
      ],
      coerce: { maxNodes: "number" }
    },
    rpc: {
      method: "knowledge.document.structure",
      params: [{ name: "documentId", aliases: ["document-id", "id"], required: true }],
      query: [{ name: "maxNodes", aliases: ["max-nodes", "maxNodes"] }]
    },
    cli: {
      command: ["knowledge", "structure"],
      usage: "knowledge structure --document-id DOCUMENT_ID [--max-nodes 120]",
      pathParams: { documentId: ["document-id", "id"] },
      bodyParams: [{ name: "maxNodes", aliases: ["max-nodes", "maxNodes"], type: "number" }]
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.item",
    feature: "knowledge",
    label: "知识对象详情",
    target: { controller: "system", method: "handleGetKnowledgeItem" },
    http: { method: "GET", path: "/api/knowledge/items/:itemId" },
    rpc: {
      method: "knowledge.item",
      params: [{ name: "itemId", aliases: ["item-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "item"],
      usage: "knowledge item --id ITEM_ID",
      pathParams: { itemId: ["item-id", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.evidence",
    feature: "knowledge",
    label: "知识证据详情",
    target: { controller: "system", method: "handleGetKnowledgeEvidence" },
    http: { method: "GET", path: "/api/knowledge/evidence/:evidenceId" },
    rpc: {
      method: "knowledge.get.evidence",
      params: [{ name: "evidenceId", aliases: ["evidence-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "evidence"],
      usage: "knowledge evidence --id EVIDENCE_ID",
      pathParams: { evidenceId: ["evidence-id", "id"] }
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.asset",
    feature: "knowledge",
    label: "知识库图片/资产读取",
    target: { controller: "system", method: "handleGetKnowledgeAsset" },
    http: { method: "GET", path: "/api/knowledge/assets/:assetId" },
    rpc: {
      method: "knowledge.asset",
      params: [{ name: "assetId", aliases: ["asset-id", "id"], required: true }]
    },
    cli: {
      command: ["knowledge", "asset"],
      usage: "knowledge asset --id ASSET_ID --output image.bin",
      pathParams: { assetId: ["asset-id", "id"] }
    },
    requiredScopes: ["knowledge:read"],
    binary: true
  },
  {
    id: "knowledge.render_markdown",
    feature: "knowledge",
    label: "知识证据 Markdown 输出",
    target: { controller: "system", method: "handleRenderKnowledgeMarkdown" },
    http: { method: "POST", path: "/api/knowledge/render/markdown" },
    rpc: { method: "knowledge.render.markdown", body: "params" },
    cli: {
      command: ["knowledge", "render"],
      usage: "knowledge render --evidence-id EVIDENCE_ID --format markdown",
      bodyParams: [
        { name: "evidenceId", aliases: ["evidence-id", "id"], required: true },
        { name: "format", aliases: ["format"] }
      ]
    },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "knowledge.graph",
    feature: "knowledge",
    label: "知识局部图谱",
    target: { controller: "system", method: "handleKnowledgeGraph" },
    http: {
      method: "GET",
      path: "/api/knowledge/graph",
      query: [
        { name: "seed", aliases: ["seed", "id"] },
        { name: "depth", aliases: ["depth"] },
        { name: "limit", aliases: ["limit"] }
      ]
    },
    rpc: {
      method: "knowledge.graph",
      query: [
        { name: "seed", aliases: ["seed", "id"] },
        { name: "depth", aliases: ["depth"] },
        { name: "limit", aliases: ["limit"] }
      ]
    },
    cli: { command: ["knowledge", "graph"], usage: "knowledge graph --seed ITEM_ID [--depth 2]" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "search.query",
    feature: "search",
    label: "知识检索",
    target: { controller: "system", method: "handleSearch" },
    http: {
      method: "GET",
      path: "/api/search",
      query: [
        { name: "q", aliases: ["query", "q"] },
        { name: "limit", aliases: ["limit"] },
        { name: "batchId", aliases: ["batch-id", "batchId"] },
        { name: "entityType", aliases: ["entity-type", "entityType"] },
        { name: "formalOnly", aliases: ["formal-only", "formalOnly"] }
      ]
    },
    rpc: {
      method: "search.query",
      query: [
        { name: "q", aliases: ["query", "q"] },
        { name: "limit", aliases: ["limit"] },
        { name: "batchId", aliases: ["batch-id", "batchId"] },
        { name: "entityType", aliases: ["entity-type", "entityType"] },
        { name: "formalOnly", aliases: ["formal-only", "formalOnly"] }
      ]
    },
    cli: { command: ["search"], usage: "search --query QUERY [--limit 20]" },
    requiredScopes: ["knowledge:read"]
  },
  {
    id: "uploads.create_session",
    feature: "uploads",
    label: "创建或恢复上传会话",
    target: { controller: "jobs", method: "handleCreateUploadSession" },
    http: { method: "POST", path: "/api/upload-sessions", localInForwardMode: true },
    rpc: { method: "uploads.create_session", body: "params" },
    cli: { command: ["upload-session"], usage: "upload-session --body session.json" },
    requiredScopes: ["jobs:write"]
  },
  {
    id: "uploads.get_session",
    feature: "uploads",
    label: "读取上传会话",
    target: { controller: "jobs", method: "handleGetUploadSession" },
    http: { method: "GET", path: "/api/upload-sessions/:sessionId", localInForwardMode: true },
    rpc: {
      method: "uploads.get_session",
      params: [{ name: "sessionId", aliases: ["session-id", "id"], required: true }]
    },
    cli: {
      command: ["upload-session", "get"],
      usage: "upload-session get --id SESSION_ID",
      pathParams: { sessionId: ["session-id", "id"] }
    },
    requiredScopes: ["jobs:write"]
  },
  {
    id: "uploads.upload_chunk",
    feature: "uploads",
    label: "上传文件分块",
    target: { controller: "jobs", method: "handleUploadChunk" },
    http: {
      method: "PUT",
      path: "/api/upload-sessions/:sessionId/files/:fileIndex",
      localInForwardMode: true,
      query: [{ name: "offset", aliases: ["offset"] }],
      coerce: { fileIndex: "number", offset: "number" }
    },
    rpc: {
      method: "uploads.upload_chunk",
      body: "raw",
      params: [
        { name: "sessionId", aliases: ["session-id", "id"], required: true },
        { name: "fileIndex", aliases: ["file-index"], required: true, type: "number" },
        { name: "offset", aliases: ["offset"], type: "number" }
      ]
    },
    cli: {
      command: ["upload-session", "chunk"],
      usage: "upload-session chunk --id SESSION_ID --file-index 0 --offset 0 --raw-file chunk.bin",
      pathParams: { sessionId: ["session-id", "id"], fileIndex: ["file-index"] }
    },
    requiredScopes: ["jobs:write"]
  },
  {
    id: "jobs.create",
    feature: "jobs",
    label: "创建任务",
    target: { controller: "jobs", method: "handleCreateJob" },
    http: { method: "POST", path: "/api/jobs", localInForwardMode: true },
    rpc: { method: "jobs.create", body: "params" },
    cli: { command: ["jobs", "create"], usage: "jobs create --body job.json" },
    requiredScopes: ["jobs:write"]
  },
  {
    id: "jobs.list",
    feature: "jobs",
    label: "任务列表",
    target: { controller: "jobs", method: "handleListJobs" },
    http: {
      method: "GET",
      path: "/api/jobs",
      localInForwardMode: true,
      query: [{ name: "limit", aliases: ["limit"] }],
      coerce: { limit: "number" }
    },
    rpc: {
      method: "jobs.list",
      params: [{ name: "limit", aliases: ["limit"], type: "number" }]
    },
    cli: { command: ["jobs", "list"], aliases: [["jobs"]], usage: "jobs list [--limit 50]" },
    requiredScopes: ["jobs:read"]
  },
  {
    id: "jobs.failed_review",
    feature: "jobs",
    label: "失败任务复盘",
    target: { controller: "system", method: "handleFailedJobsReview" },
    http: {
      method: "GET",
      path: "/api/jobs/failed-review",
      query: [{ name: "limit", aliases: ["limit"] }],
      coerce: { limit: "number" }
    },
    rpc: {
      method: "jobs.failed_review",
      params: [{ name: "limit", aliases: ["limit"], type: "number" }]
    },
    cli: { command: ["jobs", "failed-review"], usage: "jobs failed-review [--limit 50]" },
    requiredScopes: ["jobs:read"]
  },
  {
    id: "jobs.get",
    feature: "jobs",
    label: "任务详情",
    target: { controller: "jobs", method: "handleGetJob" },
    http: { method: "GET", path: "/api/jobs/:jobId", localInForwardMode: true },
    rpc: {
      method: "jobs.get",
      params: [{ name: "jobId", aliases: ["job-id", "id"], required: true }]
    },
    cli: {
      command: ["jobs", "get"],
      usage: "jobs get --id JOB_ID",
      pathParams: { jobId: ["job-id", "id"] }
    },
    requiredScopes: ["jobs:read"]
  },
  {
    id: "jobs.reparse",
    feature: "jobs",
    label: "重新解析历史任务",
    target: { controller: "jobs", method: "handleReparseJob" },
    http: { method: "POST", path: "/api/jobs/:jobId/reparse", localInForwardMode: true },
    rpc: {
      method: "jobs.reparse",
      params: [{ name: "jobId", aliases: ["job-id", "id"], required: true }],
      body: "params"
    },
    cli: {
      command: ["jobs", "reparse"],
      usage: "jobs reparse --id JOB_ID --body options.json",
      pathParams: { jobId: ["job-id", "id"] }
    },
    requiredScopes: ["jobs:write"]
  },
  {
    id: "jobs.delete",
    feature: "jobs",
    label: "删除任务",
    target: { controller: "jobs", method: "handleDeleteJob" },
    http: { method: "DELETE", path: "/api/jobs/:jobId", localInForwardMode: true },
    rpc: {
      method: "jobs.delete",
      params: [{ name: "jobId", aliases: ["job-id", "id"], required: true }]
    },
    cli: {
      command: ["jobs", "delete"],
      usage: "jobs delete --id JOB_ID",
      pathParams: { jobId: ["job-id", "id"] }
    },
    requiredScopes: ["jobs:write"]
  },
  {
    id: "jobs.result",
    feature: "jobs",
    label: "任务结果",
    target: { controller: "jobs", method: "handleGetJobResult" },
    http: { method: "GET", path: "/api/jobs/:jobId/result", localInForwardMode: true },
    rpc: {
      method: "jobs.result",
      params: [{ name: "jobId", aliases: ["job-id", "id"], required: true }]
    },
    cli: {
      command: ["jobs", "result"],
      usage: "jobs result --id JOB_ID",
      pathParams: { jobId: ["job-id", "id"] }
    },
    requiredScopes: ["jobs:read"]
  },
  {
    id: "jobs.normalized_documents",
    feature: "jobs",
    label: "归一化 DOCX 文档清单",
    target: { controller: "jobs", method: "handleListNormalizedDocuments" },
    http: {
      method: "GET",
      path: "/api/jobs/:jobId/normalized-documents",
      localInForwardMode: true
    },
    rpc: {
      method: "jobs.normalized_documents",
      params: [{ name: "jobId", aliases: ["job-id", "id"], required: true }]
    },
    cli: {
      command: ["jobs", "normalized-docs"],
      usage: "jobs normalized-docs --id JOB_ID",
      pathParams: { jobId: ["job-id", "id"] }
    },
    requiredScopes: ["jobs:read"]
  },
  {
    id: "jobs.normalized_document.get",
    feature: "jobs",
    label: "下载归一化 DOCX 文档",
    target: { controller: "jobs", method: "handleGetNormalizedDocument" },
    http: {
      method: "GET",
      path: "/api/jobs/:jobId/normalized-documents/:documentId",
      localInForwardMode: true
    },
    rpc: {
      method: "jobs.normalized_document.get",
      params: [
        { name: "jobId", aliases: ["job-id", "id"], required: true },
        { name: "documentId", aliases: ["document-id"], required: true }
      ]
    },
    cli: {
      command: ["jobs", "normalized-doc"],
      usage: "jobs normalized-doc --id JOB_ID --document-id DOC_ID --output out.docx",
      pathParams: {
        jobId: ["job-id", "id"],
        documentId: ["document-id"]
      }
    },
    requiredScopes: ["jobs:read"],
    binary: true
  },
  {
    id: "raw_objects.get",
    feature: "raw_objects",
    label: "读取原始对象",
    target: { controller: "jobs", method: "handleGetRawObject" },
    http: { method: "GET", path: "/api/raw-objects/:objectId" },
    rpc: {
      method: "raw_objects.get",
      params: [{ name: "objectId", aliases: ["object-id", "id"], required: true }]
    },
    cli: {
      command: ["raw-object"],
      usage: "raw-object --id OBJECT_ID --output raw.eml",
      pathParams: { objectId: ["object-id", "id"] }
    },
    requiredScopes: ["jobs:read"],
    binary: true
  }
];

export const SERVER_API_OPERATIONS = decorateServerApiOperations(SERVER_API_OPERATION_DEFINITIONS);

export function listInterfaceCatalog(operations = SERVER_API_OPERATIONS) {
  return operations.map((operation) => ({
    id: operation.id,
    feature: operation.feature,
    label: operation.label,
    target: `${operation.target.controller}.${operation.target.method}`,
    http: `${operation.http.method} ${operation.http.path}`,
    rpc: operation.rpc?.method || "",
    cli: operation.cli?.usage || "",
    aliases: (operation.cli?.aliases || []).map((tokens) => tokens.join(" ")),
    localInForwardMode: Boolean(operation.http.localInForwardMode),
    binary: Boolean(operation.binary),
    aspects: operation.aspects || [],
    safety: serializableOperationSafety(operation),
    requiredScopes: operation.requiredScopes || [],
    readOnly: operation.readOnly === true,
    destructive: operation.destructive === true,
    public: operation.public === true,
    externalAuth: operation.externalAuth === true,
    concurrencySafe: operation.concurrencySafe === true,
    audit: operation.audit || {},
    log: operation.log || {},
    inputSchema: operation.inputSchema || {}
  }));
}

function normalizeCliTokens(tokens) {
  return (tokens || []).map((token) => String(token || "").trim()).filter(Boolean);
}

export function getCliEntries(operation) {
  const entries = [];
  if (operation.cli?.command) {
    entries.push({
      operation,
      tokens: normalizeCliTokens(operation.cli.command)
    });
  }
  for (const alias of operation.cli?.aliases || []) {
    entries.push({
      operation,
      tokens: normalizeCliTokens(alias)
    });
  }
  return entries;
}

export function findCliOperation(tokens, operations = SERVER_API_OPERATIONS) {
  const normalizedTokens = normalizeCliTokens(tokens);
  const entries = operations
    .flatMap(getCliEntries)
    .filter((entry) => entry.tokens.length > 0)
    .sort((left, right) => right.tokens.length - left.tokens.length);

  return entries.find((entry) =>
    entry.tokens.every((token, index) => normalizedTokens[index] === token)
  ) || null;
}

function getArgValue(args, aliases) {
  for (const alias of aliases || []) {
    const value = args[alias];
    if (Array.isArray(value)) {
      const last = value[value.length - 1];
      if (last !== undefined && last !== true && last !== "") {
        return last;
      }
      continue;
    }
    if (value !== undefined && value !== true && value !== "") {
      return value;
    }
  }
  return undefined;
}

function defaultParamAliases(name) {
  const kebab = String(name).replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  const aliases = [name, kebab];
  if (name.endsWith("Id")) {
    aliases.push("id");
  }
  return [...new Set(aliases)];
}

export function buildApiPathForCliOperation(operation, args) {
  const pathParamAliases = operation.cli?.pathParams || {};
  const apiPath = operation.http.path.replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
    const value = getArgValue(args, pathParamAliases[name] || defaultParamAliases(name));
    if (value === undefined || value === null || value === "") {
      throw new Error(`--${defaultParamAliases(name)[1] || name} is required`);
    }
    return encodeURIComponent(String(value));
  });
  const query = new URLSearchParams();
  for (const queryParam of operation.http.query || []) {
    const value = getArgValue(args, queryParam.aliases || [queryParam.name]);
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(queryParam.name, String(item));
      }
      continue;
    }
    query.set(queryParam.name, String(value));
  }
  const queryText = query.toString();
  return queryText ? `${apiPath}?${queryText}` : apiPath;
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

export function formatInterfaceCatalogMarkdown(operations = SERVER_API_OPERATIONS) {
  const rows = listInterfaceCatalog(operations);
  return [
    "| 功能ID | 功能层 | 功能目标 | HTTP接口 | RPC方法 | 命令行参数 | 风险 | 只读 | 并发安全 | 审计 | 权限 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) =>
      [
        row.id,
        row.feature,
        row.target,
        row.http,
        row.rpc,
        row.aliases.length > 0 ? `${row.cli}<br>alias: ${row.aliases.join(", ")}` : row.cli,
        `${row.safety.risk}${row.safety.dynamicRisk ? " (dynamic)" : ""}`,
        row.readOnly ? "yes" : "no",
        row.concurrencySafe ? "yes" : "no",
        row.audit?.enabled === false ? "disabled" : (row.audit?.write ? "write" : "read"),
        row.requiredScopes.join(", ")
      ].map(escapeMarkdownCell).join(" | ")
    ).map((line) => `| ${line} |`)
  ].join("\n");
}
