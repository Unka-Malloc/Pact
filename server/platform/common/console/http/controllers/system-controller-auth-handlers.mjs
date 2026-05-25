export function createSystemControllerAuthHandlers({
  sendConsoleDomainOperation,
  parseJsonBody,
  consoleAuth,
  operationAuditStore,
  appendConsoleOperationLog
}) {
  return {
    async handleAuthSession({ operation, request, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "auth.session",
        response,
        context: { consoleAuth, request },
        errorMessage: "读取控制台登录状态失败。"
      });
    },
    async handleAuthLogin({ operation, request, requestBody, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "auth.login",
        input: parseJsonBody(requestBody),
        response,
        context: { consoleAuth, request, appendConsoleOperationLog },
        errorMessage: "登录失败。"
      });
    },
    async handleAuthLogout({ operation, request, authSession, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "auth.logout",
        response,
        context: { consoleAuth, request, authSession, appendConsoleOperationLog },
        errorMessage: "退出登录失败。"
      });
    },
    async handleAuthUsers({ operation, requestBody, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || (requestBody.length > 0 ? "auth.users.create" : "auth.users"),
        input: requestBody.length > 0 ? parseJsonBody(requestBody) : {},
        response,
        context: { consoleAuth },
        errorMessage: "读取控制台用户失败。"
      });
    },
    async handleAuthUpdateUser({ operation, userId, requestBody, authSession, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "auth.users.update",
        input: {
          ...parseJsonBody(requestBody),
          userId
        },
        response,
        context: { consoleAuth, authSession },
        errorMessage: "更新用户失败。"
      });
    },
    async handleAuthRole({ operation, roleId, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "auth.roles.get",
        input: { roleId },
        response,
        context: { consoleAuth },
        errorMessage: "读取角色失败。"
      });
    },
    async handleAuthOidc({ operation, requestBody, authSession, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || (requestBody.length > 0 ? "auth.oidc.set" : "auth.oidc.get"),
        input: requestBody.length > 0 ? parseJsonBody(requestBody) : {},
        response,
        context: { consoleAuth, authSession },
        errorMessage: "OIDC 操作失败。"
      });
    },
    async handleAuthAudit({ operation, url, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "auth.audit",
        input: {
          limit: Number(url.searchParams.get("limit") || 100),
          operationId: url.searchParams.get("operationId") || url.searchParams.get("operation-id") || "",
          userId: url.searchParams.get("userId") || url.searchParams.get("user-id") || "",
          status: url.searchParams.get("status") || ""
        },
        response,
        context: { consoleAuth, operationAuditStore },
        errorMessage: "读取认证审计失败。"
      });
    },
    async handleAuthSessions({ operation, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "auth.sessions",
        response,
        context: { consoleAuth },
        errorMessage: "读取控制台会话失败。"
      });
    },
    async handleAuthRevokeSession({ operation, sessionId, authSession, response }) {
      await sendConsoleDomainOperation({
        operationId: operation?.id || "auth.sessions.revoke",
        input: { sessionId },
        response,
        context: { consoleAuth, authSession },
        errorMessage: "撤销控制台会话失败。"
      });
    }
  };
}
