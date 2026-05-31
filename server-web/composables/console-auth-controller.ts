import type { ComputedRef, Ref } from "vue";
import { bridge } from "../lib/bridge";
import type {
  ConsoleAuditItem,
  ConsoleAuthSummary,
  ConsoleOidcConfig,
  ConsoleUser,
  ServerConsoleState,
} from "../lib/types";

type RefreshState = (options?: { silent?: boolean; forceDrafts?: boolean }) => Promise<unknown>;

export type ConsoleAuthControllerOptions = {
  authState: Ref<ConsoleAuthSummary | null>;
  authBootstrapping: Ref<boolean>;
  authUsers: Ref<ConsoleUser[]>;
  authAudit: Ref<ConsoleAuditItem[]>;
  authSessions: Ref<Array<Record<string, unknown>>>;
  canAdminAuth: ComputedRef<boolean>;
  consoleState: Ref<ServerConsoleState | null>;
  error: Ref<string>;
  loginForm: Ref<{ username: string; password: string }>;
  oidcAllowedDomainsText: Ref<string>;
  oidcDraft: Ref<ConsoleOidcConfig & { clientSecret?: string }>;
  oidcRoleMappingText: Ref<string>;
  clearAllBusy: () => void;
  refreshState: RefreshState;
  resetServerEventCursor: () => void;
  setBusy: (key: string) => void;
  startServerEventSubscription: () => void;
  stopServerEventSubscription: () => void;
};

export function createConsoleAuthController(options: ConsoleAuthControllerOptions) {
  async function refreshAuthState() {
    try {
      const session = await bridge.getAuthSession();
      options.authState.value = session;
      if (!session.session.authenticated) {
        options.consoleState.value = null;
        options.stopServerEventSubscription();
      }
      return session;
    } catch (nextError) {
      options.authState.value = null;
      options.consoleState.value = null;
      options.stopServerEventSubscription();
      options.error.value = nextError instanceof Error ? nextError.message : "加载认证状态失败。";
      return null;
    } finally {
      options.authBootstrapping.value = false;
    }
  }

  async function submitLoginAuth() {
    options.setBusy("auth:login");
    options.error.value = "";
    try {
      await bridge.loginAuth(options.loginForm.value);
      const session = await refreshAuthState();
      if (!session?.session.authenticated) {
        options.error.value = "登录已返回，但会话状态尚未生效，请重试。";
        return;
      }
      await options.refreshState({ silent: true });
      options.startServerEventSubscription();
    } catch (nextError) {
      options.error.value = nextError instanceof Error ? nextError.message : "登录失败。";
    } finally {
      options.clearAllBusy();
    }
  }

  async function logoutConsole() {
    options.setBusy("auth:logout");
    options.error.value = "";
    options.stopServerEventSubscription();
    options.resetServerEventCursor();
    try {
      await bridge.logoutAuth();
      options.consoleState.value = null;
      await refreshAuthState();
    } catch (nextError) {
      options.error.value = nextError instanceof Error ? nextError.message : "退出失败。";
    } finally {
      options.clearAllBusy();
    }
  }

  async function refreshAuthAdmin() {
    if (!options.canAdminAuth.value) {
      return;
    }
    try {
      const [users, audit, sessions, oidc] = await Promise.all([
        bridge.listAuthUsers(),
        bridge.listAuthAudit(80),
        bridge.listAuthSessions(),
        bridge.getAuthOidc(),
      ]);
      options.authUsers.value = users.users;
      options.authAudit.value = audit.items;
      options.authSessions.value = sessions.sessions;
      options.oidcDraft.value = {
        ...oidc.oidc,
        clientSecret: "",
      };
      options.oidcAllowedDomainsText.value = (oidc.oidc.allowedDomains || []).join("\n");
      options.oidcRoleMappingText.value = JSON.stringify(oidc.oidc.roleMapping || {}, null, 2);
    } catch (nextError) {
      options.error.value =
        nextError instanceof Error ? nextError.message : "加载认证管理数据失败。";
    }
  }

  async function updateConsoleUser(user: ConsoleUser, patch: Partial<ConsoleUser> & { password?: string }) {
    options.setBusy(`auth:user:${user.userId}`);
    options.error.value = "";
    try {
      const result = await bridge.updateAuthUser(user.userId, patch);
      options.authUsers.value = result.users;
    } catch (nextError) {
      options.error.value = nextError instanceof Error ? nextError.message : "更新用户失败。";
    } finally {
      options.clearAllBusy();
    }
  }

  function updateConsoleUserRoleFromEvent(user: ConsoleUser, event: Event) {
    const roleId = (event.target as HTMLSelectElement).value;
    void updateConsoleUser(user, { roleId });
  }

  function updateConsoleUserRole(user: ConsoleUser, roleId: string) {
    void updateConsoleUser(user, { roleId });
  }

  async function saveOidcConfig() {
    options.setBusy("auth:oidc");
    options.error.value = "";
    try {
      const result = await bridge.saveAuthOidc({
        ...options.oidcDraft.value,
        allowedDomains: options.oidcAllowedDomainsText.value
          .split(/[\n,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
        roleMapping: JSON.parse(options.oidcRoleMappingText.value || "{}") as Record<string, string>,
      });
      options.oidcDraft.value = {
        ...result.oidc,
        clientSecret: "",
      };
    } catch (nextError) {
      options.error.value = nextError instanceof Error ? nextError.message : "保存 OIDC 失败。";
    } finally {
      options.clearAllBusy();
    }
  }

  async function revokeConsoleSession(sessionId: string) {
    options.setBusy(`auth:session:${sessionId}`);
    options.error.value = "";
    try {
      await bridge.revokeAuthSession(sessionId);
      await refreshAuthAdmin();
    } catch (nextError) {
      options.error.value = nextError instanceof Error ? nextError.message : "撤销会话失败。";
    } finally {
      options.clearAllBusy();
    }
  }

  return {
    logoutConsole,
    refreshAuthAdmin,
    refreshAuthState,
    revokeConsoleSession,
    saveOidcConfig,
    submitLoginAuth,
    updateConsoleUser,
    updateConsoleUserRole,
    updateConsoleUserRoleFromEvent,
  };
}
