const DEFAULT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true
});

function schema(required = [], properties = {}) {
  return {
    type: "object",
    required,
    additionalProperties: true,
    properties
  };
}

function protocolOperation({
  id,
  feature,
  label,
  description = "",
  targetMethod,
  method = "POST",
  path = "",
  query = [],
  params = [],
  scopes = [],
  risk = "read_only",
  readOnly = undefined,
  requiresConfirmation = false,
  approvalScope = "",
  inputSchema = DEFAULT_SCHEMA,
  aliases = []
}) {
  const command = id.split(".");
  const normalizedMethod = String(method || "POST").toUpperCase();
  const bodyBound = !["GET", "HEAD", "OPTIONS"].includes(normalizedMethod);
  const httpPath = path || `/api/protocol/${command.join("/")}`;
  return {
    id,
    feature,
    label,
    description: description || `Protocol operation for ${id}.`,
    aliases,
    target: { controller: "system", method: targetMethod },
    http: { method: normalizedMethod, path: httpPath, query, localInForwardMode: true },
    rpc: bodyBound
      ? { method: id, body: "params", params }
      : { method: id, params, query },
    cli: {
      command,
      usage: bodyBound
        ? `${command.join(" ")} --body request.json`
        : `${command.join(" ")}`
    },
    requiredScopes: scopes,
    inputSchema,
    safety: {
      risk,
      requiresConfirmation,
      requiresConfirmationExplicit: true,
      approvalScope: approvalScope || (risk === "read_only" ? "" : scopes[0] || "maintenance:approve")
    },
    ...(readOnly === undefined ? {} : { readOnly })
  };
}

const WORKSPACE_ID_QUERY = [
  { name: "workspaceId", aliases: ["workspace-id", "workspaceId", "id"] }
];

const FILE_QUERY = [
  ...WORKSPACE_ID_QUERY,
  { name: "path", aliases: ["path", "filePath", "file-path"] },
  { name: "limit", aliases: ["limit"] },
  { name: "recursive", aliases: ["recursive"] }
];

export const PROTOCOL_OPERATION_DEFINITIONS = Object.freeze([
  protocolOperation({
    id: "authorization.subject.resolve",
    feature: "auth",
    label: "解析授权主体",
    targetMethod: "handleAuthorizationSubjectResolve",
    method: "POST",
    path: "/api/authorization/subject/resolve",
    scopes: ["auth:admin"],
    inputSchema: schema([], {
      subject: { type: "object" },
      actor: { type: "object" }
    })
  }),
  protocolOperation({
    id: "authorization.policy.evaluate",
    feature: "auth",
    label: "统一授权策略裁决",
    targetMethod: "handleAuthorizationPolicyEvaluate",
    method: "POST",
    path: "/api/authorization/policy/evaluate",
    scopes: ["auth:admin"],
    inputSchema: schema([], {
      operationId: { type: "string" },
      operation: { type: "object" },
      tool: { type: "object" },
      subject: { type: "object" },
      resource: { type: "object" },
      requestedAction: { type: "string" },
      requestedEgress: { type: "string" }
    })
  }),
  protocolOperation({
    id: "authorization.receipts.list",
    feature: "auth",
    label: "列出授权回执",
    targetMethod: "handleAuthorizationReceiptsList",
    method: "GET",
    path: "/api/authorization/receipts",
    query: [{ name: "limit", aliases: ["limit"] }, { name: "subjectId", aliases: ["subject-id", "subjectId"] }],
    scopes: ["auth:admin"]
  }),
  protocolOperation({
    id: "authorization.loan_records.list",
    feature: "auth",
    label: "列出授权借用记录",
    targetMethod: "handleAuthorizationLoanRecordsList",
    method: "GET",
    path: "/api/authorization/loan-records",
    query: [{ name: "limit", aliases: ["limit"] }, { name: "subjectId", aliases: ["subject-id", "subjectId"] }],
    scopes: ["auth:admin"]
  }),
  protocolOperation({
    id: "authorization.denied_requests.list",
    feature: "auth",
    label: "列出授权拒绝请求",
    targetMethod: "handleAuthorizationDeniedRequestsList",
    method: "GET",
    path: "/api/authorization/denied-requests",
    query: [{ name: "limit", aliases: ["limit"] }, { name: "subjectId", aliases: ["subject-id", "subjectId"] }],
    scopes: ["auth:admin"]
  }),
  protocolOperation({
    id: "authorization.grants.create",
    feature: "auth",
    label: "创建统一授权 grant",
    targetMethod: "handleAuthorizationGrantCreate",
    method: "POST",
    path: "/api/authorization/grants",
    scopes: ["auth:admin"],
    risk: "repair_write",
    requiresConfirmation: true,
    approvalScope: "auth:admin",
    inputSchema: schema([], {
      label: { type: "string" },
      scopes: { type: "array" },
      toolsets: { type: "array" },
      expiresAt: { type: "string" }
    })
  }),
  protocolOperation({
    id: "authorization.grants.revoke",
    feature: "auth",
    label: "撤销统一授权 grant",
    targetMethod: "handleAuthorizationGrantRevoke",
    method: "POST",
    path: "/api/authorization/grants/:grantId/revoke",
    params: [{ name: "grantId", aliases: ["grant-id", "id"], required: true }],
    scopes: ["auth:admin"],
    risk: "repair_write",
    requiresConfirmation: true,
    approvalScope: "auth:admin",
    inputSchema: schema([], {
      reason: { type: "string" }
    })
  }),

  protocolOperation({
    id: "workspace.info",
    feature: "agent_workspace",
    label: "读取 workspace 信息",
    targetMethod: "handleWorkspaceProtocolInfo",
    method: "GET",
    path: "/api/workspace/info",
    query: WORKSPACE_ID_QUERY,
    scopes: ["workspace:read"]
  }),
  protocolOperation({
    id: "workspace.file.upload",
    feature: "agent_workspace",
    label: "上传 workspace 文件",
    targetMethod: "handleWorkspaceProtocolFileUpload",
    path: "/api/workspace/files/upload",
    scopes: ["storage:write"],
    risk: "safe_write",
    inputSchema: schema(["workspaceId"], {
      workspaceId: { type: "string" },
      path: { type: "string" },
      content: { type: "string" },
      contentBase64: { type: "string" }
    })
  }),
  protocolOperation({
    id: "workspace.file.list",
    feature: "agent_workspace",
    label: "列出 workspace 文件",
    targetMethod: "handleWorkspaceProtocolFileList",
    method: "GET",
    path: "/api/workspace/files",
    query: FILE_QUERY,
    scopes: ["storage:read"]
  }),
  protocolOperation({
    id: "workspace.file.download",
    feature: "agent_workspace",
    label: "下载 workspace 文件",
    targetMethod: "handleWorkspaceProtocolFileDownload",
    method: "GET",
    path: "/api/workspace/files/download",
    query: FILE_QUERY,
    scopes: ["storage:read"]
  }),
  protocolOperation({
    id: "workspace.file.read",
    feature: "agent_workspace",
    label: "读取 workspace 文件",
    targetMethod: "handleWorkspaceProtocolFileDownload",
    method: "GET",
    path: "/api/workspace/files/read",
    query: FILE_QUERY,
    scopes: ["storage:read"]
  }),
  protocolOperation({
    id: "workspace.file.write",
    feature: "agent_workspace",
    label: "写入 workspace 文件",
    targetMethod: "handleWorkspaceProtocolFileWrite",
    path: "/api/workspace/files/write",
    scopes: ["storage:write"],
    risk: "safe_write",
    inputSchema: schema(["workspaceId", "path"], {
      workspaceId: { type: "string" },
      path: { type: "string" },
      content: { type: "string" },
      contentBase64: { type: "string" }
    })
  }),
  protocolOperation({
    id: "workspace.file.patch",
    feature: "agent_workspace",
    label: "补丁更新 workspace 文件",
    targetMethod: "handleWorkspaceProtocolFilePatch",
    path: "/api/workspace/files/patch",
    scopes: ["storage:write"],
    risk: "safe_write",
    inputSchema: schema(["workspaceId", "path"], {
      workspaceId: { type: "string" },
      path: { type: "string" },
      patch: { type: "string" },
      hunks: { type: "array" }
    })
  }),

  protocolOperation({
    id: "workspace.contribution.submit",
    feature: "agent_workspace",
    label: "提交 workspace 贡献资产",
    targetMethod: "handleWorkspaceContributionSubmit",
    path: "/api/workspace/contributions/submit",
    scopes: ["workspace:write"],
    risk: "safe_write"
  }),
  protocolOperation({
    id: "knowledge.contribution.submit",
    feature: "knowledge",
    label: "提交知识贡献资产",
    targetMethod: "handleWorkspaceContributionSubmit",
    path: "/api/knowledge/contributions/submit",
    scopes: ["knowledge:write"],
    risk: "safe_write"
  }),
  protocolOperation({
    id: "workspace.contribution.list",
    feature: "agent_workspace",
    label: "列出 workspace 贡献资产",
    targetMethod: "handleWorkspaceContributionList",
    method: "GET",
    path: "/api/workspace/contributions",
    query: WORKSPACE_ID_QUERY,
    scopes: ["workspace:read"]
  }),
  protocolOperation({
    id: "workspace.contribution.leaderboard",
    feature: "agent_workspace",
    label: "读取 workspace 贡献排行榜",
    targetMethod: "handleWorkspaceContributionLeaderboard",
    method: "GET",
    path: "/api/workspace/contributions/leaderboard",
    query: WORKSPACE_ID_QUERY,
    scopes: ["workspace:read"]
  }),
  protocolOperation({
    id: "workspace.contribution.stats",
    feature: "agent_workspace",
    label: "读取 workspace 贡献统计",
    targetMethod: "handleWorkspaceContributionStats",
    method: "GET",
    path: "/api/workspace/contributions/stats",
    query: WORKSPACE_ID_QUERY,
    scopes: ["workspace:read"]
  }),
  protocolOperation({
    id: "workspace.contribution.report",
    feature: "agent_workspace",
    label: "生成 workspace 贡献报告",
    targetMethod: "handleWorkspaceContributionReport",
    path: "/api/workspace/contributions/report",
    scopes: ["workspace:read"]
  }),
  protocolOperation({
    id: "workspace.contribution.permission.request",
    feature: "agent_workspace",
    label: "请求 workspace 贡献资产权限",
    targetMethod: "handleWorkspaceContributionPermissionRequest",
    path: "/api/workspace/contributions/:contributionId/permission/request",
    params: [{ name: "contributionId", aliases: ["contribution-id", "id"], required: true }],
    scopes: ["workspace:write"],
    risk: "safe_write"
  }),
  protocolOperation({
    id: "workspace.contribution.permission.grant",
    feature: "agent_workspace",
    label: "授予 workspace 贡献资产权限",
    targetMethod: "handleWorkspaceContributionPermissionGrant",
    path: "/api/workspace/contributions/:contributionId/permission/grant",
    params: [{ name: "contributionId", aliases: ["contribution-id", "id"], required: true }],
    scopes: ["workspace:maintain"],
    risk: "repair_write",
    requiresConfirmation: true,
    approvalScope: "workspace:maintain"
  }),

  protocolOperation({
    id: "workspace.proposal.create",
    feature: "agent_workspace",
    label: "创建 workspace 提案",
    targetMethod: "handleWorkspaceProposalCreate",
    path: "/api/workspace/proposals/create",
    scopes: ["workspace:write"],
    risk: "safe_write",
    inputSchema: schema(["workspaceId", "title"], {
      workspaceId: { type: "string" },
      runId: { type: "string" },
      title: { type: "string" },
      summary: { type: "string" },
      proposal: { type: "object" },
      evidenceRefs: { type: "array" }
    })
  }),
  protocolOperation({
    id: "workspace.proposal.apply",
    feature: "agent_workspace",
    label: "审核并应用 workspace 提案",
    targetMethod: "handleWorkspaceProposalApply",
    path: "/api/workspace/proposals/apply",
    scopes: ["workspace:maintain"],
    risk: "repair_write",
    requiresConfirmation: true,
    approvalScope: "workspace:maintain",
    inputSchema: schema(["workspaceId", "proposalId"], {
      workspaceId: { type: "string" },
      proposalId: { type: "string" },
      submissionId: { type: "string" },
      resolution: { type: "string" },
      note: { type: "string" },
      decision: { type: "object" }
    })
  }),

  protocolOperation({
    id: "knowledge.access.evaluate",
    feature: "knowledge",
    label: "AgentLibrary 知识访问裁决",
    targetMethod: "handleKnowledgeAccessEvaluate",
    path: "/api/knowledge/access/evaluate",
    scopes: ["knowledge:read"]
  }),
  protocolOperation({
    id: "knowledge.access.receipt.list",
    feature: "knowledge",
    label: "列出知识访问回执",
    targetMethod: "handleKnowledgeAccessReceiptList",
    method: "GET",
    path: "/api/knowledge/access/receipts",
    query: [{ name: "limit", aliases: ["limit"] }, { name: "subjectId", aliases: ["subject-id", "subjectId"] }],
    scopes: ["knowledge:read"]
  }),
  protocolOperation({
    id: "knowledge.access.loan_record.list",
    feature: "knowledge",
    label: "列出知识访问借用记录",
    targetMethod: "handleKnowledgeAccessLoanRecordList",
    method: "GET",
    path: "/api/knowledge/access/loan-records",
    query: [{ name: "limit", aliases: ["limit"] }, { name: "subjectId", aliases: ["subject-id", "subjectId"] }],
    scopes: ["knowledge:read"]
  }),
  protocolOperation({
    id: "knowledge.access.denied_request.list",
    feature: "knowledge",
    label: "列出知识访问拒绝请求",
    targetMethod: "handleKnowledgeAccessDeniedRequestList",
    method: "GET",
    path: "/api/knowledge/access/denied-requests",
    query: [{ name: "limit", aliases: ["limit"] }, { name: "subjectId", aliases: ["subject-id", "subjectId"] }],
    scopes: ["knowledge:read"]
  }),
  protocolOperation({
    id: "knowledge.evidence.get",
    feature: "knowledge",
    label: "读取知识证据",
    targetMethod: "handleKnowledgeProtocolEvidenceGet",
    method: "GET",
    path: "/api/knowledge/evidence/get",
    query: [
      { name: "id", aliases: ["id", "evidenceId", "evidence-id"] },
      { name: "batchId", aliases: ["batch-id", "batchId"] }
    ],
    scopes: ["knowledge:read"]
  }),

  protocolOperation({
    id: "workspace.skill.upload",
    feature: "agent_workspace",
    label: "上传 workspace skill",
    targetMethod: "handleWorkspaceSkillUpload",
    path: "/api/workspace/skills/upload",
    scopes: ["workspace:write"],
    risk: "safe_write"
  }),
  protocolOperation({
    id: "workspace.skill.list",
    feature: "agent_workspace",
    label: "列出 workspace skill",
    targetMethod: "handleWorkspaceSkillList",
    method: "GET",
    path: "/api/workspace/skills",
    query: WORKSPACE_ID_QUERY,
    scopes: ["workspace:read"]
  }),
  protocolOperation({
    id: "workspace.skill.download",
    feature: "agent_workspace",
    label: "下载 workspace skill",
    targetMethod: "handleWorkspaceSkillDownload",
    method: "GET",
    path: "/api/workspace/skills/download",
    query: [{ name: "skillId", aliases: ["skill-id", "skillId", "id"] }, ...WORKSPACE_ID_QUERY],
    scopes: ["workspace:read"]
  }),
  protocolOperation({
    id: "workspace.skill.usage.report",
    feature: "agent_workspace",
    label: "上报 workspace skill 使用",
    targetMethod: "handleWorkspaceSkillUsageReport",
    path: "/api/workspace/skills/usage/report",
    scopes: ["workspace:write"],
    risk: "safe_write"
  }),
  protocolOperation({
    id: "workspace.asset.policy.set",
    feature: "agent_workspace",
    label: "设置 workspace 资产策略",
    targetMethod: "handleWorkspaceAssetPolicySet",
    path: "/api/workspace/assets/policy",
    scopes: ["workspace:maintain"],
    risk: "repair_write",
    requiresConfirmation: true,
    approvalScope: "workspace:maintain"
  }),
  protocolOperation({
    id: "workspace.asset.permission.check",
    feature: "agent_workspace",
    label: "检查 workspace 资产权限",
    targetMethod: "handleWorkspaceAssetPermissionCheck",
    path: "/api/workspace/assets/permission/check",
    scopes: ["workspace:read"]
  }),
  protocolOperation({
    id: "workspace.audit.query",
    feature: "agent_workspace",
    label: "查询 workspace 审计",
    targetMethod: "handleWorkspaceAuditQuery",
    method: "GET",
    path: "/api/workspace/audit",
    query: [{ name: "limit", aliases: ["limit"] }, { name: "operationId", aliases: ["operation-id", "operationId"] }],
    scopes: ["workspace:read"]
  }),
  protocolOperation({
    id: "workspace.operation.history",
    feature: "agent_workspace",
    label: "查询 workspace 操作历史",
    targetMethod: "handleWorkspaceOperationHistory",
    method: "GET",
    path: "/api/workspace/operations/history",
    query: [{ name: "limit", aliases: ["limit"] }, { name: "operationId", aliases: ["operation-id", "operationId"] }],
    scopes: ["workspace:read"]
  }),

  protocolOperation({
    id: "workspace.checkpoint.tree.list",
    feature: "agent_workspace",
    label: "列出 workspace checkpoint tree",
    targetMethod: "handleWorkspaceCheckpointTreeList",
    method: "GET",
    path: "/api/workspace/checkpoints/trees",
    query: [{ name: "limit", aliases: ["limit"] }, { name: "kind", aliases: ["kind"] }, { name: "ownerId", aliases: ["owner-id", "ownerId"] }],
    scopes: ["workspace:read"]
  }),
  protocolOperation({
    id: "workspace.checkpoint.node.get",
    feature: "agent_workspace",
    label: "读取 workspace checkpoint 节点",
    targetMethod: "handleWorkspaceCheckpointNodeGet",
    method: "GET",
    path: "/api/workspace/checkpoints/nodes/:treeId",
    params: [{ name: "treeId", aliases: ["tree-id", "id"], required: true }],
    scopes: ["workspace:read"]
  }),
  protocolOperation({
    id: "workspace.checkpoint.diff",
    feature: "agent_workspace",
    label: "生成 workspace checkpoint diff",
    targetMethod: "handleWorkspaceCheckpointDiff",
    path: "/api/workspace/checkpoints/diff",
    scopes: ["workspace:read"]
  }),
  protocolOperation({
    id: "workspace.checkpoint.restore.preview",
    feature: "agent_workspace",
    label: "预览 workspace checkpoint 恢复",
    targetMethod: "handleWorkspaceCheckpointRestorePreview",
    path: "/api/workspace/checkpoints/restore/preview",
    scopes: ["workspace:maintain"],
    risk: "repair_write",
    requiresConfirmation: true,
    approvalScope: "workspace:maintain"
  }),
  protocolOperation({
    id: "workspace.checkpoint.restore",
    feature: "agent_workspace",
    label: "恢复 workspace checkpoint",
    targetMethod: "handleWorkspaceCheckpointRestore",
    path: "/api/workspace/checkpoints/restore",
    scopes: ["workspace:maintain"],
    risk: "repair_write",
    requiresConfirmation: true,
    approvalScope: "workspace:maintain"
  }),
  protocolOperation({
    id: "workspace.checkpoint.scope.query",
    feature: "agent_workspace",
    label: "查询 workspace checkpoint 影响范围",
    targetMethod: "handleWorkspaceCheckpointScopeQuery",
    path: "/api/workspace/checkpoints/scope/query",
    scopes: ["workspace:read"]
  }),
  protocolOperation({
    id: "workspace.operation.revert.scope",
    feature: "agent_workspace",
    label: "预览 workspace 操作回滚范围",
    targetMethod: "handleWorkspaceOperationRevertScope",
    path: "/api/workspace/operations/revert/scope",
    scopes: ["workspace:maintain"],
    risk: "repair_write",
    requiresConfirmation: true,
    approvalScope: "workspace:maintain"
  }),

  protocolOperation({
    id: "workspace.code.target.evaluate",
    feature: "agent_workspace",
    label: "评估代码变更目标",
    targetMethod: "handleWorkspaceCodeTargetEvaluate",
    path: "/api/workspace/code/target/evaluate",
    scopes: ["repo:read"]
  }),
  protocolOperation({
    id: "workspace.code.change.prepare",
    feature: "agent_workspace",
    label: "准备代码变更",
    targetMethod: "handleWorkspaceCodeChangePrepare",
    path: "/api/workspace/code/change/prepare",
    scopes: ["repo:write"],
    risk: "safe_write"
  }),
  protocolOperation({
    id: "workspace.code.change.upload",
    feature: "agent_workspace",
    label: "上传代码变更到评审系统",
    targetMethod: "handleWorkspaceCodeChangeUpload",
    path: "/api/workspace/code/change/upload",
    scopes: ["repo:maintain"],
    risk: "repair_write",
    requiresConfirmation: true,
    approvalScope: "repo:maintain"
  }),
  protocolOperation({
    id: "workspace.code.change.link",
    feature: "agent_workspace",
    label: "关联代码变更与 workspace",
    targetMethod: "handleWorkspaceCodeChangeLink",
    path: "/api/workspace/code/change/link",
    scopes: ["repo:write"],
    risk: "safe_write"
  }),
  protocolOperation({
    id: "workspace.code.change.status.sync",
    feature: "agent_workspace",
    label: "同步代码评审状态",
    targetMethod: "handleWorkspaceCodeChangeStatusSync",
    path: "/api/workspace/code/change/status/sync",
    scopes: ["repo:read"]
  }),

  protocolOperation({
    id: "raw-corpus.format.convert",
    feature: "knowledge",
    label: "转换原始语料格式",
    targetMethod: "handleRawCorpusFormatConvert",
    path: "/api/raw-corpus/format/convert",
    scopes: ["knowledge:write"],
    risk: "safe_write"
  }),
  protocolOperation({
    id: "knowledge.dossier.export",
    feature: "knowledge",
    label: "导出统一事项 dossier",
    targetMethod: "handleKnowledgeDossierExport",
    path: "/api/knowledge/dossier/export",
    scopes: ["knowledge:read"]
  }),
  protocolOperation({
    id: "knowledge.distillation.export",
    feature: "knowledge",
    label: "导出知识蒸馏结果",
    targetMethod: "handleKnowledgeDistillationExport",
    path: "/api/knowledge/distillation/export",
    scopes: ["knowledge:read"]
  })
]);

export const PROTOCOL_OPERATION_IDS = Object.freeze(
  PROTOCOL_OPERATION_DEFINITIONS.map((operation) => operation.id)
);
