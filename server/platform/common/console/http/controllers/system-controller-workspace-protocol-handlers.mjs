export function createSystemControllerWorkspaceProtocolHandlers({
  sendConsoleDomainOperation,
  protocolPayload,
  operationAuditStore,
  checkpointTreeApi,
  agentWorkspace
}) {
  return {
    async handleWorkspaceAuditQuery({ operation, url, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.audit.query",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: { operationAuditStore },
        errorMessage: "查询 workspace 审计失败。"
      });
    },
    async handleWorkspaceOperationHistory({ operation, url, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.operation.history",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: { operationAuditStore },
        errorMessage: "查询 workspace 操作历史失败。"
      });
    },
    async handleWorkspaceCheckpointTreeList({ operation, url, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.checkpoint.tree.list",
        input: protocolPayload(Buffer.alloc(0), url),
        response,
        context: { checkpointTreeApi },
        errorMessage: "列出 workspace checkpoint tree 失败。"
      });
    },
    async handleWorkspaceCheckpointNodeGet({ operation, treeId, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.checkpoint.node.get",
        input: { treeId },
        response,
        context: { checkpointTreeApi },
        errorMessage: "读取 workspace checkpoint 节点失败。"
      });
    },
    async handleWorkspaceCheckpointDiff({ operation, requestBody, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.checkpoint.diff",
        input: protocolPayload(requestBody),
        response,
        context: { checkpointTreeApi },
        errorMessage: "生成 workspace checkpoint diff 失败。"
      });
    },
    async handleWorkspaceCheckpointRestorePreview({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.checkpoint.restore.preview",
        input: protocolPayload(requestBody),
        response,
        context: { checkpointTreeApi, agentWorkspace, authSession },
        errorMessage: "预览 workspace checkpoint 恢复失败。"
      });
    },
    async handleWorkspaceCheckpointRestore({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.checkpoint.restore",
        input: protocolPayload(requestBody),
        response,
        context: { checkpointTreeApi, agentWorkspace, authSession },
        errorMessage: "恢复 workspace checkpoint 失败。"
      });
    },
    async handleWorkspaceCheckpointScopeQuery({ operation, requestBody, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.checkpoint.scope.query",
        input: protocolPayload(requestBody),
        response,
        context: { checkpointTreeApi },
        errorMessage: "查询 workspace checkpoint 影响范围失败。"
      });
    },
    async handleWorkspaceOperationRevertScope({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.operation.revert.scope",
        input: protocolPayload(requestBody),
        response,
        context: { operationAuditStore, authSession },
        errorMessage: "预览 workspace 操作回滚范围失败。"
      });
    },
    async handleWorkspaceProposalCreate({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.proposal.create",
        input: protocolPayload(requestBody),
        response,
        context: { agentWorkspace, authSession },
        errorMessage: "创建 workspace 提案失败。"
      });
    },
    async handleWorkspaceProposalApply({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.proposal.apply",
        input: protocolPayload(requestBody),
        response,
        context: { agentWorkspace, authSession },
        errorMessage: "审核并应用 workspace 提案失败。"
      });
    },
    async handleWorkspaceCodeTargetEvaluate({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.code.target.evaluate",
        input: protocolPayload(requestBody),
        response,
        context: { authSession },
        errorMessage: "评估代码变更目标失败。"
      });
    },
    async handleWorkspaceCodeChangePrepare({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.code.change.prepare",
        input: protocolPayload(requestBody),
        response,
        context: { authSession },
        errorMessage: "准备代码变更失败。"
      });
    },
    async handleWorkspaceCodeChangeUpload({ requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: "workspace.code.change.upload",
        input: protocolPayload(requestBody),
        response,
        context: { authSession },
        errorMessage: "Workspace code change upload failed."
      });
    },
    async handleWorkspaceCodeChangeLink({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.code.change.link",
        input: protocolPayload(requestBody),
        response,
        context: { authSession },
        errorMessage: "关联代码变更与 workspace 失败。"
      });
    },
    async handleWorkspaceCodeChangeStatusSync({ operation, requestBody, response, authSession }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "workspace.code.change.status.sync",
        input: protocolPayload(requestBody),
        response,
        context: { authSession },
        errorMessage: "同步代码评审状态失败。"
      });
    },
    async handleRawCorpusFormatConvert({ operation, requestBody, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "raw-corpus.format.convert",
        input: protocolPayload(requestBody),
        response,
        errorMessage: "转换原始语料格式失败。"
      });
    },
    async handleKnowledgeDossierExport({ operation, requestBody, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "knowledge.dossier.export",
        input: protocolPayload(requestBody),
        response,
        errorMessage: "导出统一事项 dossier 失败。"
      });
    },
    async handleKnowledgeDistillationExport({ operation, requestBody, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "knowledge.distillation.export",
        input: protocolPayload(requestBody),
        response,
        errorMessage: "导出知识蒸馏结果失败。"
      });
    }
  };
}
