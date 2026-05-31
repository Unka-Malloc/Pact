import { computed, ref, type ComputedRef, type Ref } from "vue";
import { bridge } from "../lib/bridge";
import type {
  AgentModelConfig,
  AgentPermissionGroup,
  AgentSettings,
  ToolManagementAuditItem,
  ToolManagementCatalog,
  ToolManagementGrant,
  ToolManagementMetrics,
  ToolManagementProfile,
  ToolManagementTool,
  ToolManagementToolset,
} from "../lib/types";
import type { OptionBarOption } from "../types/app";
import { maintenanceAgentRiskLabel } from "./console-status-utils";
import {
  normalizeAgentPermissionGroupDraft,
  normalizeAgentPermissionGroupsDraft,
} from "./console-model-utils";

type ConsoleToolManagementControllerOptions = {
  clearAllBusy: () => void;
  error: Ref<string>;
  setBusy: (key: string) => void;
  settingsDraft: Ref<AgentSettings>;
  visibleModelEntries: ComputedRef<AgentModelConfig[]>;
};

export function createConsoleToolManagementController(
  options: ConsoleToolManagementControllerOptions,
) {
  const newGrantLabel = ref("默认智能体");
  const newGrantScopes = ref<string[]>(["knowledge:read"]);
  const newGrantToolsets = ref<string[]>(["pact.knowledge.read"]);
  const issuedToolToken = ref("");
  const toolManagementCatalogState = ref<ToolManagementCatalog | null>(null);
  const toolManagementGrantsState = ref<ToolManagementGrant[]>([]);
  const toolManagementMetricsState = ref<ToolManagementMetrics | null>(null);
  const toolManagementAuditItems = ref<ToolManagementAuditItem[]>([]);
  const selectedToolManagementToolId = ref("pact.knowledge.health");
  const policyPreviewToolId = ref("pact.knowledge.health");
  const policyPreviewProfileId = ref("external-knowledge-reader");
  const policyPreviewGrantId = ref("");
  const policyPreviewResult = ref<Record<string, unknown> | null>(null);

  const toolScopes = computed(() => toolManagementCatalogState.value?.scopes || []);
  const toolCatalog = computed(() => toolManagementCatalogState.value?.tools || []);
  const toolGrants = computed(() => toolManagementGrantsState.value);
  const enabledToolGrantCount = computed(
    () => toolGrants.value.filter((grant) => grant.enabled).length,
  );
  const toolManagementTools = computed<ToolManagementTool[]>(() => toolManagementCatalogState.value?.tools || []);
  const toolManagementToolsets = computed<ToolManagementToolset[]>(
    () => toolManagementCatalogState.value?.toolsets || [],
  );
  const toolManagementProfiles = computed<ToolManagementProfile[]>(
    () => toolManagementCatalogState.value?.profiles || [],
  );
  const activeToolManagementToolCount = computed(
    () => toolManagementTools.value.filter((tool) => tool.status === "active").length,
  );
  const internalToolManagementToolCount = computed(
    () => toolManagementTools.value.filter((tool) => tool.status === "internal").length,
  );
  const toolManagementStatusRows = computed(() =>
    Object.entries(toolManagementMetricsState.value?.byStatus || {}).map(([label, value]) => ({
      label,
      value,
    })),
  );
  const toolManagementRiskRows = computed(() =>
    Object.entries(toolManagementMetricsState.value?.byRisk || {}).map(([label, value]) => ({
      label,
      value,
    })),
  );

  const defaultAgentPermissionGroups = computed<AgentPermissionGroup[]>(() => {
    const readScopes = toolScopes.value
      .filter((scope) => /read|knowledge/i.test(scope.id))
      .map((scope) => scope.id);
    const writeScopes = toolScopes.value
      .filter((scope) => /write|execute|tool|maintenance|admin/i.test(scope.id))
      .map((scope) => scope.id);
    const readToolsets = toolManagementToolsets.value
      .filter((toolset) => toolset.maxRisk === "read_only" && toolset.grantable !== false)
      .map((toolset) => toolset.id);
    const safeToolsets = toolManagementToolsets.value
      .filter((toolset) => ["read_only", "safe_write"].includes(toolset.maxRisk) && toolset.grantable !== false)
      .map((toolset) => toolset.id);
    const allToolsets = toolManagementToolsets.value
      .filter((toolset) => toolset.grantable !== false)
      .map((toolset) => toolset.id);
    return [
      {
        id: "agent-permission-knowledge-reader",
        label: "知识读取组",
        description: "只允许读取知识、执行只读召回和健康检查。",
        enabled: true,
        scopeIds: readScopes,
        toolsetIds: readToolsets,
        toolAllow: [],
        toolDeny: [],
      },
      {
        id: "agent-permission-operator",
        label: "运维操作组",
        description: "允许只读和安全写入工具，适合巡检、索引校验和轻量维护。",
        enabled: true,
        scopeIds: [...new Set([...readScopes, ...writeScopes])],
        toolsetIds: safeToolsets,
        toolAllow: [],
        toolDeny: [],
      },
      {
        id: "agent-permission-admin-review",
        label: "管理员审批组",
        description: "保留全部工具集入口，高风险工具仍受审批和策略预览约束。",
        enabled: true,
        scopeIds: toolScopes.value.map((scope) => scope.id),
        toolsetIds: allToolsets,
        toolAllow: [],
        toolDeny: [],
      },
    ];
  });

  const agentPermissionGroups = computed<AgentPermissionGroup[]>(() =>
    normalizeAgentPermissionGroupsDraft(options.settingsDraft.value.agentPermissionGroups),
  );

  const agentPermissionGroupOptionBarOptions = computed<OptionBarOption[]>(() => [
    { value: "", label: "未分配" },
    ...agentPermissionGroups.value
      .filter((group) => group.enabled)
      .map((group) => ({
        value: group.id,
        label: group.label || group.id,
      })),
  ]);

  const selectedToolManagementTool = computed(() => {
    const selectedId = selectedToolManagementToolId.value || policyPreviewToolId.value;
    return toolManagementTools.value.find((tool) => tool.id === selectedId) || toolManagementTools.value[0] || null;
  });

  const policyPreviewToolOptionBarOptions = computed<OptionBarOption[]>(() =>
    toolManagementTools.value.map((tool) => ({
      value: tool.id,
      label: `${tool.label} / ${tool.id}`,
    })),
  );

  const policyPreviewProfileOptionBarOptions = computed<OptionBarOption[]>(() => [
    { value: "", label: "不绑定档案" },
    ...toolManagementProfiles.value.map((profile) => ({
      value: profile.id,
      label: `${profile.label} / ${profile.id}`,
    })),
  ]);

  function scopeLabel(scopeId: string) {
    return (
      toolScopes.value.find((scope) => scope.id === scopeId)?.label || scopeId
    );
  }

  function toolRiskLabel(risk: string) {
    return maintenanceAgentRiskLabel(risk);
  }

  function toolStatusLabel(status: string) {
    const labels: Record<string, string> = {
      active: "可执行",
      internal: "内部运行时",
      disabled: "停用",
      deprecated: "兼容中",
    };
    return labels[status] || status || "未知";
  }

  function toolsetLabel(toolsetId: string) {
    return toolManagementToolsets.value.find((toolset) => toolset.id === toolsetId)?.label || toolsetId;
  }

  function profileLabel(profileId: string) {
    return toolManagementProfiles.value.find((profile) => profile.id === profileId)?.label || profileId;
  }

  function previewToolDefinition() {
    return toolManagementTools.value.find((tool) => tool.id === policyPreviewToolId.value) || null;
  }

  function ensureAgentPermissionGroupsDraft() {
    if (options.settingsDraft.value.agentPermissionGroups?.length) {
      options.settingsDraft.value.agentPermissionGroups = agentPermissionGroups.value;
      return;
    }
    options.settingsDraft.value.agentPermissionGroups = defaultAgentPermissionGroups.value.map((group, index) =>
      normalizeAgentPermissionGroupDraft(group, index),
    );
  }

  function addAgentPermissionGroup() {
    ensureAgentPermissionGroupsDraft();
    const group = normalizeAgentPermissionGroupDraft(
      {
        id: `agent-permission-custom-${Date.now()}`,
        label: "自定义权限组",
        description: "按权限层级和工具明细定义智能体可调用范围。",
        enabled: true,
        scopeIds: [],
        toolsetIds: [],
        toolAllow: [],
        toolDeny: [],
      },
      options.settingsDraft.value.agentPermissionGroups.length,
    );
    options.settingsDraft.value.agentPermissionGroups = [group, ...options.settingsDraft.value.agentPermissionGroups];
  }

  function removeAgentPermissionGroup(group: AgentPermissionGroup) {
    if (!window.confirm(`删除权限组“${group.label || group.id}”？`)) {
      return;
    }
    options.settingsDraft.value.agentPermissionGroups = agentPermissionGroups.value.filter((item: any) => item.id !== group.id);
    for (const entry of options.visibleModelEntries.value) {
      if (entry.permissionGroupId === group.id) {
        entry.permissionGroupId = "";
      }
    }
  }

  function permissionGroupLabel(groupId?: string) {
    const normalized = String(groupId || "").trim();
    if (!normalized) {
      return "未分配";
    }
    return agentPermissionGroups.value.find((group) => group.id === normalized)?.label || normalized;
  }

  function setModelEntryPermissionGroup(entry: AgentModelConfig, groupId: string) {
    entry.permissionGroupId = String(groupId || "").trim();
  }

  function permissionGroupHasScope(group: AgentPermissionGroup, scopeId: string) {
    return group.scopeIds.includes(scopeId);
  }

  function permissionGroupHasToolset(group: AgentPermissionGroup, toolsetId: string) {
    return group.toolsetIds.includes(toolsetId);
  }

  function togglePermissionGroupScope(group: AgentPermissionGroup, scopeId: string) {
    const next = new Set(group.scopeIds || []);
    if (next.has(scopeId)) {
      next.delete(scopeId);
    } else {
      next.add(scopeId);
    }
    group.scopeIds = [...next];
  }

  function togglePermissionGroupToolset(group: AgentPermissionGroup, toolsetId: string) {
    const next = new Set(group.toolsetIds || []);
    if (next.has(toolsetId)) {
      next.delete(toolsetId);
    } else {
      next.add(toolsetId);
    }
    group.toolsetIds = [...next];
  }

  function selectToolForManagement(toolId: string) {
    selectedToolManagementToolId.value = toolId;
    policyPreviewToolId.value = toolId;
  }

  function grantToolRuleState(grant: ToolManagementGrant, toolId: string) {
    if ((grant.toolDeny || []).includes(toolId)) {
      return "deny";
    }
    if ((grant.toolAllow || []).includes(toolId)) {
      return "allow";
    }
    return "inherit";
  }

  async function setGrantToolRule(grant: ToolManagementGrant, toolId: string, rule: "inherit" | "allow" | "deny") {
    const allow = new Set(grant.toolAllow || []);
    const deny = new Set(grant.toolDeny || []);
    allow.delete(toolId);
    deny.delete(toolId);
    if (rule === "allow") {
      allow.add(toolId);
    }
    if (rule === "deny") {
      deny.add(toolId);
    }
    await updateGrant(grant, {
      toolAllow: [...allow],
      toolDeny: [...deny],
    });
  }

  function policyPreviewGrant() {
    const tool = previewToolDefinition();
    return {
      id: "console-preview-grant",
      label: "Console preview grant",
      enabled: true,
      scopes: tool?.requiredScopes || [],
      toolsets: tool?.toolsets || [],
      toolAllow: [],
      toolDeny: [],
      metadata: {},
    };
  }

  function toggleNewGrantScope(scopeId: string) {
    const current = new Set(newGrantScopes.value);
    if (current.has(scopeId)) {
      current.delete(scopeId);
    } else {
      current.add(scopeId);
    }
    newGrantScopes.value = [...current];
  }

  function toggleNewGrantToolset(toolsetId: string) {
    const current = new Set(newGrantToolsets.value);
    if (current.has(toolsetId)) {
      current.delete(toolsetId);
    } else {
      current.add(toolsetId);
    }
    newGrantToolsets.value = [...current];
  }

  function grantHasScope(grant: ToolManagementGrant, scopeId: string) {
    return grant.scopes.includes(scopeId);
  }

  function grantHasToolset(grant: ToolManagementGrant, toolsetId: string) {
    return (grant.toolsets || []).includes(toolsetId);
  }

  async function refreshToolManagement(optionsArg: { silent?: boolean } = {}) {
    const showBusy = !optionsArg.silent;
    if (showBusy) {
      options.setBusy("tool-management");
    }
    options.error.value = "";

    try {
      const [grants, catalog, audit, metrics] = await Promise.all([
        bridge.getToolManagementGrants(),
        bridge.getToolManagementCatalog(),
        bridge.getToolManagementAudit(50),
        bridge.getToolManagementMetrics(),
      ]);
      toolManagementGrantsState.value = grants.grants;
      toolManagementCatalogState.value = catalog;
      toolManagementAuditItems.value = audit.items;
      toolManagementMetricsState.value = metrics.metrics;
      if (!policyPreviewToolId.value && catalog.tools.length > 0) {
        policyPreviewToolId.value = catalog.tools[0].id;
      }
      if (!selectedToolManagementToolId.value && catalog.tools.length > 0) {
        selectedToolManagementToolId.value = catalog.tools[0].id;
      }
    } catch (nextError) {
      options.error.value =
        nextError instanceof Error ? nextError.message : "刷新智能体工具失败。";
    } finally {
      if (showBusy) {
        options.clearAllBusy();
      }
    }
  }

  async function previewToolPolicy() {
    if (!policyPreviewToolId.value) {
      options.error.value = "请选择需要预览的工具。";
      return;
    }
    options.setBusy("tool-policy-preview");
    options.error.value = "";
    try {
      const payload: Record<string, unknown> = {
        toolId: policyPreviewToolId.value,
        input: {},
        dryRun: false,
      };
      if (policyPreviewGrantId.value.trim()) {
        payload.grantId = policyPreviewGrantId.value.trim();
      } else {
        payload.grant = policyPreviewGrant();
      }
      if (policyPreviewProfileId.value.trim()) {
        payload.profileId = policyPreviewProfileId.value.trim();
      }
      policyPreviewResult.value = await bridge.previewToolPolicy(payload);
    } catch (nextError) {
      options.error.value =
        nextError instanceof Error ? nextError.message : "工具策略预览失败。";
    } finally {
      options.clearAllBusy();
    }
  }

  async function createGrant() {
    if (newGrantScopes.value.length === 0 && newGrantToolsets.value.length === 0) {
      options.error.value = "请至少选择一个工具权限范围或工具集。";
      return;
    }

    options.setBusy("grant:create");
    options.error.value = "";
    issuedToolToken.value = "";

    try {
      const result = await bridge.createToolGrant({
        label: newGrantLabel.value,
        scopes: newGrantScopes.value,
        toolsets: newGrantToolsets.value,
      });
      issuedToolToken.value = result.token;
      await refreshToolManagement({ silent: true });
    } catch (nextError) {
      options.error.value =
        nextError instanceof Error ? nextError.message : "创建工具授权失败。";
    } finally {
      options.clearAllBusy();
    }
  }

  async function updateGrant(grant: ToolManagementGrant, patch: Partial<ToolManagementGrant>) {
    options.setBusy(`grant:${grant.id}`);
    options.error.value = "";

    try {
      await bridge.updateToolGrant(grant.id, {
        label: patch.label,
        enabled: patch.enabled,
        scopes: patch.scopes,
        toolsets: patch.toolsets,
        toolAllow: patch.toolAllow,
        toolDeny: patch.toolDeny,
      });
      await refreshToolManagement({ silent: true });
    } catch (nextError) {
      options.error.value =
        nextError instanceof Error ? nextError.message : "更新工具授权失败。";
    } finally {
      options.clearAllBusy();
    }
  }

  async function toggleGrantScope(grant: ToolManagementGrant, scopeId: string) {
    const nextScopes = new Set(grant.scopes);
    if (nextScopes.has(scopeId)) {
      nextScopes.delete(scopeId);
    } else {
      nextScopes.add(scopeId);
    }
    await updateGrant(grant, {
      scopes: [...nextScopes],
    });
  }

  async function toggleGrantToolset(grant: ToolManagementGrant, toolsetId: string) {
    const nextToolsets = new Set(grant.toolsets || []);
    if (nextToolsets.has(toolsetId)) {
      nextToolsets.delete(toolsetId);
    } else {
      nextToolsets.add(toolsetId);
    }
    await updateGrant(grant, {
      toolsets: [...nextToolsets],
    });
  }

  async function rotateGrant(grant: ToolManagementGrant) {
    options.setBusy(`grant:${grant.id}`);
    options.error.value = "";
    issuedToolToken.value = "";

    try {
      const result = await bridge.rotateToolGrantToken(grant.id);
      issuedToolToken.value = result.token;
      await refreshToolManagement({ silent: true });
    } catch (nextError) {
      options.error.value =
        nextError instanceof Error ? nextError.message : "轮换工具令牌失败。";
    } finally {
      options.clearAllBusy();
    }
  }

  async function deleteGrant(grant: ToolManagementGrant) {
    if (!window.confirm(`撤销工具授权“${grant.label}”？`)) {
      return;
    }

    options.setBusy(`grant:${grant.id}`);
    options.error.value = "";

    try {
      await bridge.deleteToolGrant(grant.id);
      await refreshToolManagement({ silent: true });
    } catch (nextError) {
      options.error.value =
        nextError instanceof Error ? nextError.message : "撤销工具授权失败。";
    } finally {
      options.clearAllBusy();
    }
  }

  async function copyIssuedToolToken() {
    if (!issuedToolToken.value) {
      return;
    }
    await navigator.clipboard.writeText(issuedToolToken.value);
  }

  return {
    activeToolManagementToolCount,
    addAgentPermissionGroup,
    agentPermissionGroupOptionBarOptions,
    agentPermissionGroups,
    copyIssuedToolToken,
    createGrant,
    defaultAgentPermissionGroups,
    deleteGrant,
    enabledToolGrantCount,
    ensureAgentPermissionGroupsDraft,
    grantHasScope,
    grantHasToolset,
    grantToolRuleState,
    internalToolManagementToolCount,
    issuedToolToken,
    newGrantLabel,
    newGrantScopes,
    newGrantToolsets,
    permissionGroupHasScope,
    permissionGroupHasToolset,
    permissionGroupLabel,
    policyPreviewGrant,
    policyPreviewGrantId,
    policyPreviewProfileId,
    policyPreviewProfileOptionBarOptions,
    policyPreviewResult,
    policyPreviewToolId,
    policyPreviewToolOptionBarOptions,
    previewToolDefinition,
    previewToolPolicy,
    profileLabel,
    refreshToolManagement,
    removeAgentPermissionGroup,
    rotateGrant,
    scopeLabel,
    selectToolForManagement,
    selectedToolManagementTool,
    selectedToolManagementToolId,
    setGrantToolRule,
    setModelEntryPermissionGroup,
    toggleGrantScope,
    toggleGrantToolset,
    toggleNewGrantScope,
    toggleNewGrantToolset,
    togglePermissionGroupScope,
    togglePermissionGroupToolset,
    toolCatalog,
    toolGrants,
    toolManagementAuditItems,
    toolManagementCatalogState,
    toolManagementGrantsState,
    toolManagementMetricsState,
    toolManagementProfiles,
    toolManagementRiskRows,
    toolManagementStatusRows,
    toolManagementTools,
    toolManagementToolsets,
    toolRiskLabel,
    toolScopes,
    toolStatusLabel,
    toolsetLabel,
    updateGrant,
  };
}
