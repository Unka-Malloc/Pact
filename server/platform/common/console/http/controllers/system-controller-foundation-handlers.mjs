export function createSystemControllerFoundationHandlers({
  sendConsoleDomainOperation,
  protocolPayload,
  workspaceIdFrom,
  authorizationFacadeContext,
  accessControlContext,
  getToolManagementPlatform,
  getStrategyManagementProvider = () => null,
  agentWorkspace,
  runtime
}) {
  return {
    async handleAuthorizationSubjectResolve({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "authorization.subject.resolve",
        input: protocolPayload(requestBody),
        response,
        context: authorizationFacadeContext(authSession),
        errorMessage: "解析授权主体失败。"
      });
    },
    async handleAuthorizationPolicyEvaluate({ operation, request, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "authorization.policy.evaluate",
        input: protocolPayload(requestBody),
        response,
        context: authorizationFacadeContext(authSession, { request }),
        errorMessage: "统一授权策略裁决失败。"
      });
    },
    async handleAuthorizationReceiptsList({ operation, url, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "authorization.receipts.list",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: authorizationFacadeContext(authSession),
        errorMessage: "读取授权回执失败。"
      });
    },
    async handleAuthorizationLoanRecordsList({ operation, url, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "authorization.loan_records.list",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: authorizationFacadeContext(authSession),
        errorMessage: "读取授权借用记录失败。"
      });
    },
    async handleAuthorizationDeniedRequestsList({ operation, url, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "authorization.denied_requests.list",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: authorizationFacadeContext(authSession),
        errorMessage: "读取授权拒绝请求失败。"
      });
    },
    async handleAuthorizationGrantCreate({ operation, requestBody, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "authorization.grants.create",
        input: protocolPayload(requestBody),
        response,
        context: { toolManagementPlatform: getToolManagementPlatform() },
        errorMessage: "创建统一授权 grant 失败。"
      });
    },
    async handleAuthorizationGrantRevoke({ operation, grantId, requestBody, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "authorization.grants.revoke",
        input: {
          ...protocolPayload(requestBody),
          grantId
        },
        response,
        context: { toolManagementPlatform: getToolManagementPlatform() },
        errorMessage: "撤销统一授权 grant 失败。"
      });
    },
    async handleCreateMcpAuthorizationRequest({ operation, request, requestBody, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "tool_management.mcp.request_authorization",
        input: protocolPayload(requestBody),
        response,
        context: { toolManagementPlatform: getToolManagementPlatform(), request },
        errorMessage: "MCP Authorization API request failed."
      });
    },
    async handleListMcpAuthorizationRequests({ operation, url, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "tool_management.mcp.list_requests",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: { toolManagementPlatform: getToolManagementPlatform() },
        errorMessage: "MCP Authorization API list failed."
      });
    },
    async handleResolveMcpAuthorizationRequest({ operation, requestId, requestBody, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "tool_management.mcp.resolve_request",
        input: {
          ...protocolPayload(requestBody),
          requestId
        },
        response,
        context: { toolManagementPlatform: getToolManagementPlatform() },
        errorMessage: "MCP Authorization API resolve failed."
      });
    },
    async handleToolManagementPassthrough({ operation, request, requestBody, url, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "tool_management.http.passthrough",
        input: {},
        response,
        context: {
          toolManagementPlatform: getToolManagementPlatform(),
          strategyManagementProvider: getStrategyManagementProvider(),
          request,
          response,
          requestBody,
          url,
          method: operation?.http?.method || request?.method || "GET"
        },
        errorMessage: "Tool Management API request failed."
      });
    },
    async handleWorkspaceProtocolInfo({ operation, url, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.info",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: { agentWorkspace, authSession },
        errorMessage: "读取 workspace 信息失败。"
      });
    },
    async handleWorkspaceProtocolFileUpload({ operation, requestBody, response, authSession }) {
      const payload = protocolPayload(requestBody);
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.file.upload",
        input: {
          ...payload,
          workspaceId: workspaceIdFrom(payload)
        },
        response,
        context: { agentWorkspace, authSession },
        errorMessage: "上传 workspace 文件失败。"
      });
    },
    async handleWorkspaceProtocolFileList({ operation, url, response, authSession }) {
      const payload = protocolPayload(Buffer.alloc(0), url);
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.file.list",
        input: {
          ...payload,
          workspaceId: workspaceIdFrom(payload)
        },
        response,
        context: { agentWorkspace, authSession },
        errorMessage: "列出 workspace 文件失败。"
      });
    },
    async handleWorkspaceProtocolFileDownload({ operation, url, response, authSession }) {
      const payload = protocolPayload(Buffer.alloc(0), url);
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.file.download",
        input: {
          ...payload,
          workspaceId: workspaceIdFrom(payload)
        },
        response,
        context: { agentWorkspace, authSession },
        errorMessage: "下载 workspace 文件失败。"
      });
    },
    async handleWorkspaceProtocolFileWrite({ operation, requestBody, response, authSession }) {
      const payload = protocolPayload(requestBody);
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.file.write",
        input: {
          ...payload,
          workspaceId: workspaceIdFrom(payload)
        },
        response,
        context: { agentWorkspace, authSession },
        errorMessage: "写入 workspace 文件失败。"
      });
    },
    async handleWorkspaceProtocolFilePatch({ operation, requestBody, response, authSession }) {
      const payload = protocolPayload(requestBody);
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.file.patch",
        input: {
          ...payload,
          workspaceId: workspaceIdFrom(payload)
        },
        response,
        context: { agentWorkspace, authSession },
        errorMessage: "补丁更新 workspace 文件失败。"
      });
    },
    async handleWorkspaceContributionSubmit({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.contribution.submit",
        input: protocolPayload(requestBody),
        response,
        context: accessControlContext(authSession),
        errorMessage: "提交贡献失败。"
      });
    },
    async handleWorkspaceContributionList({ operation, url, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.contribution.list",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: accessControlContext(authSession),
        errorMessage: "读取贡献列表失败。"
      });
    },
    async handleWorkspaceContributionLeaderboard({ operation, url, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.contribution.leaderboard",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: accessControlContext(authSession),
        errorMessage: "读取贡献排行榜失败。"
      });
    },
    async handleWorkspaceContributionStats({ operation, url, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.contribution.stats",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: accessControlContext(authSession),
        errorMessage: "读取贡献统计失败。"
      });
    },
    async handleWorkspaceContributionReport({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.contribution.report",
        input: protocolPayload(requestBody),
        response,
        context: accessControlContext(authSession),
        errorMessage: "生成贡献报告失败。"
      });
    },
    async handleWorkspaceContributionPermissionRequest({ operation, contributionId, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.contribution.permission.request",
        input: {
          ...protocolPayload(requestBody),
          contributionId
        },
        response,
        context: accessControlContext(authSession, { contributionId }),
        errorMessage: "请求贡献权限失败。"
      });
    },
    async handleWorkspaceContributionPermissionGrant({ operation, contributionId, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.contribution.permission.grant",
        input: {
          ...protocolPayload(requestBody),
          contributionId
        },
        response,
        context: accessControlContext(authSession, { contributionId }),
        errorMessage: "授予贡献权限失败。"
      });
    },
    async handleKnowledgeAccessEvaluate({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "knowledge.access.evaluate",
        input: protocolPayload(requestBody),
        response,
        context: accessControlContext(authSession),
        errorMessage: "知识访问裁决失败。"
      });
    },
    async handleKnowledgeAccessReceiptList({ operation, url, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "knowledge.access.receipt.list",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: accessControlContext(authSession),
        errorMessage: "读取知识访问回执失败。"
      });
    },
    async handleKnowledgeAccessLoanRecordList({ operation, url, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "knowledge.access.loan_record.list",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: accessControlContext(authSession),
        errorMessage: "读取知识访问借用记录失败。"
      });
    },
    async handleKnowledgeAccessDeniedRequestList({ operation, url, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "knowledge.access.denied_request.list",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: accessControlContext(authSession),
        errorMessage: "读取知识访问拒绝记录失败。"
      });
    },
    async handleKnowledgeProtocolEvidenceGet({ operation, url, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "knowledge.evidence",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: { runtime, authSession },
        errorMessage: "读取知识证据失败。"
      });
    },
    async handleWorkspaceSkillUpload({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.skill.upload",
        input: protocolPayload(requestBody),
        response,
        context: accessControlContext(authSession),
        errorMessage: "上传 workspace skill 失败。"
      });
    },
    async handleWorkspaceSkillList({ operation, url, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.skill.list",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: accessControlContext(authSession),
        errorMessage: "读取 workspace skill 列表失败。"
      });
    },
    async handleWorkspaceSkillDownload({ operation, url, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.skill.download",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: accessControlContext(authSession),
        errorMessage: "下载 workspace skill 失败。"
      });
    },
    async handleWorkspaceSkillUsageReport({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.skill.usage.report",
        input: protocolPayload(requestBody),
        response,
        context: accessControlContext(authSession),
        errorMessage: "上报 skill 使用失败。"
      });
    },
    async handleWorkspaceAssetPolicySet({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.asset.policy.set",
        input: protocolPayload(requestBody),
        response,
        context: authorizationFacadeContext(authSession),
        errorMessage: "设置工作空间资产策略失败。"
      });
    },
    async handleWorkspaceAssetPermissionCheck({ operation, request, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.asset.permission.check",
        input: protocolPayload(requestBody),
        response,
        context: authorizationFacadeContext(authSession, { request }),
        errorMessage: "检查工作空间资产权限失败。"
      });
    }
  };
}
