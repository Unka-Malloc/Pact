import { computed, ref, type ComputedRef, type Ref } from "vue";
import { intelligentModuleDefinitions } from "./console-defaults";
import { monitorAlertSeverityLabel } from "./console-status-utils";
import type {
  AgentModelConfig,
  AgentSettings,
  BackgroundProcessStatus,
  MonitorAlertState,
} from "../lib/types";
import type {
  AdminView,
  AgentConfigurationAlert,
  DashboardAlert,
} from "../types/app";

type DashboardAgentOption = {
  value: string;
  label?: string;
  enabled: boolean;
  disabledReason?: string;
  ref?: string;
};

type MonitorAlertItem = NonNullable<MonitorAlertState["activeAlerts"]>[number];
type BackgroundProcessItem = NonNullable<BackgroundProcessStatus["processes"]>[number];

type DashboardAlertControllerOptions = {
  acknowledgeMonitorAlert: (alertId: string) => Promise<void>;
  activeMonitorAlerts: ComputedRef<MonitorAlertItem[]>;
  agentExploreAgentOptions: ComputedRef<DashboardAgentOption[]>;
  agentExploreForm: Ref<{ modelAlias?: string }>;
  agentModelAssignmentOptions: ComputedRef<DashboardAgentOption[]>;
  agentSelectorOptions: ComputedRef<DashboardAgentOption[]>;
  backgroundProcesses: ComputedRef<BackgroundProcessItem[]>;
  error: Ref<string>;
  infoFeedForm: Ref<{ modelAlias?: string }>;
  infoFeedModelOptions: ComputedRef<DashboardAgentOption[]>;
  moduleModelRef: (moduleId: string) => string;
  moduleNeedsIntelligence: (moduleId: string) => boolean;
  openAdmin: (tab: AdminView) => void;
  openAgentConfigurationAlert: (alertItem: AgentConfigurationAlert) => Promise<void>;
  refreshMonitorAlerts: (options?: { silent?: boolean }) => Promise<void>;
  ruleAuthoringForm: Ref<{ modelAlias?: string }>;
  ruleAuthoringModelOptions: ComputedRef<DashboardAgentOption[]>;
  settingsDraft: Ref<AgentSettings>;
  visibleModelEntries: ComputedRef<AgentModelConfig[]>;
};

function agentSelectionAlert(
  params: Omit<AgentConfigurationAlert, "status" | "tone"> & {
    value: string;
    options: DashboardAgentOption[];
  },
): AgentConfigurationAlert | null {
  const value = String(params.value || "").trim();
  if (!value) {
    return {
      alertId: params.alertId,
      category: params.category,
      title: params.title,
      detail: params.detail,
      status: "未配置智能体",
      tone: "warning",
      view: params.view,
      adminView: params.adminView,
      targetId: params.targetId,
    };
  }
  const option = params.options.find((item) => item.value === value);
  if (!option?.enabled) {
    return {
      alertId: params.alertId,
      category: params.category,
      title: params.title,
      detail: option?.disabledReason
        ? `${params.detail} 当前选择不可用：${option.disabledReason}。`
        : `${params.detail} 当前选择已不在模型库或尚未完成授权。`,
      status: "智能体不可用",
      tone: "danger",
      view: params.view,
      adminView: params.adminView,
      targetId: params.targetId,
    };
  }
  return null;
}

export function createConsoleDashboardAlertController(options: DashboardAlertControllerOptions) {
  const dashboardAlertInbox = ref<Record<string, DashboardAlert>>({});
  const dismissedDashboardAlertIds = ref<Set<string>>(new Set());

  const agentConfigurationAlerts = computed<AgentConfigurationAlert[]>(() => {
    const alerts: AgentConfigurationAlert[] = [];
    if (options.visibleModelEntries.value.length === 0) {
      alerts.push({
        alertId: "model-library-empty",
        category: "模型库",
        title: "模型库为空",
        detail: "需要先新增至少一个智能体模型，后续功能和模块才能显式绑定。",
        status: "无可用智能体",
        tone: "danger",
        view: "admin",
        adminView: "agentConfig",
        targetId: "agent-model-library",
      });
    }
    for (const item of [
      agentSelectionAlert({
        alertId: "info-feed-summary-agent",
        category: "信息流",
        title: "信息流智能体",
        detail: "信息流最终报告需要一个可用智能体来融合原文检索、智能规划和附件结果。",
        value: options.infoFeedForm.value.modelAlias || "",
        options: options.infoFeedModelOptions.value,
        view: "feed",
        targetId: "info-feed-summary-agent",
      }),
      agentSelectionAlert({
        alertId: "agent-explore-agent",
        category: "信息流",
        title: "知识检索智能体",
        detail: "智能检索需要一个可用智能体来规划工具调用和打开证据。",
        value: options.agentExploreForm.value.modelAlias || "",
        options: options.agentExploreAgentOptions.value,
        view: "feed",
        targetId: "agent-explore-agent",
      }),
      agentSelectionAlert({
        alertId: "rule-authoring-agent",
        category: "工作台",
        title: "创建规则智能体",
        detail: "创建规则的智能对话模式需要一个可用智能体辅助生成规则草稿。",
        value: options.ruleAuthoringForm.value.modelAlias || "",
        options: options.ruleAuthoringModelOptions.value,
        view: "dashboard",
        targetId: "rule-authoring-agent",
      }),
      agentSelectionAlert({
        alertId: "knowledge-review-fusion-agent",
        category: "知识库",
        title: "知识融合智能体",
        detail: "知识融合分析需要显式绑定一个可用智能体，用于合并多路知识证据与结构化结果。",
        value: options.settingsDraft.value.agentExploreDefaults?.reviewFusionModelAlias || "",
        options: options.agentSelectorOptions.value,
        view: "admin",
        adminView: "agentConfig",
        targetId: "knowledge-review-fusion-agent",
      }),
    ]) {
      if (item) {
        alerts.push(item);
      }
    }
    for (const moduleDefinition of intelligentModuleDefinitions) {
      if (!options.moduleNeedsIntelligence(moduleDefinition.id)) {
        continue;
      }
      const refValue = options.moduleModelRef(moduleDefinition.id);
      const option = options.agentModelAssignmentOptions.value.find((item) => item.ref === refValue);
      if (!refValue) {
        if (moduleDefinition.alertRequired === false) {
          continue;
        }
        alerts.push({
          alertId: `module:${moduleDefinition.id}`,
          category: "模块模型分配",
          title: moduleDefinition.label,
          detail: moduleDefinition.description,
          status: "未配置智能体",
          tone: "warning",
          view: "admin",
          adminView: "agentConfig",
          targetId: "agent-model-library",
        });
        continue;
      }
      if (!option?.enabled) {
        alerts.push({
          alertId: `module:${moduleDefinition.id}`,
          category: "模块模型分配",
          title: moduleDefinition.label,
          detail: `${moduleDefinition.description} 当前绑定的智能体不可用或未完成授权。`,
          status: "智能体不可用",
          tone: "danger",
          view: "admin",
          adminView: "agentConfig",
          targetId: "agent-model-library",
        });
      }
    }
    return alerts;
  });

  const agentConfigurationAlertSummary = computed(() => {
    const dangerCount = agentConfigurationAlerts.value.filter((item) => item.tone === "danger").length;
    const warningCount = agentConfigurationAlerts.value.length - dangerCount;
    if (agentConfigurationAlerts.value.length === 0) {
      return "所有需要智能体的功能都已显式绑定可用智能体。";
    }
    return [
      dangerCount ? `${dangerCount} 项不可用` : "",
      warningCount ? `${warningCount} 项未配置` : "",
    ].filter(Boolean).join("，");
  });

  const dashboardMonitorAlerts = computed<DashboardAlert[]>(() =>
    options.activeMonitorAlerts.value.map((alert) => {
      const recovered = alert.ackRequired || alert.active === false || alert.status === "recovered";
      const isQueueInterruption = alert.ruleId === "queueInterrupted";
      return {
        alertId: alert.alertId,
        category: isQueueInterruption ? "中断报警" : "后台报警",
        title: alert.title,
        detail: alert.queueId ? `${alert.message} 队列 ID：${alert.queueId}` : alert.message,
        status: recovered ? "已恢复，待确认" : monitorAlertSeverityLabel(alert.severity),
        tone: recovered ? "success" : alert.severity === "critical" ? "danger" : "warning",
        actionLabel: recovered ? "确认关闭" : "查看报警",
        source: "monitor",
        monitorAlert: alert,
      };
    }),
  );

  const liveDashboardAlerts = computed<DashboardAlert[]>(() => [
    ...dashboardMonitorAlerts.value,
    ...agentConfigurationAlerts.value.map((alert) => ({
      alertId: alert.alertId,
      category: "空配置报警",
      title: alert.title,
      detail: alert.detail,
      status: alert.status,
      tone: alert.tone,
      actionLabel: "去配置",
      source: "configuration" as const,
      configAlert: alert,
    })),
  ]);

  function dashboardAlertInboxId(alertItem: DashboardAlert) {
    return `${alertItem.source}:${alertItem.alertId}`;
  }

  function shouldDropResolvedDashboardAlert(alertItem: DashboardAlert) {
    if (alertItem.source !== "monitor") {
      return false;
    }
    const alertId = String(alertItem.alertId || "");
    const processIsHealthy = (role: string) => {
      const processItem = options.backgroundProcesses.value.find((item) => item.role === role);
      return processItem?.alive === true && ["running", "standby"].includes(String(processItem.status || ""));
    };
    if (alertId === "monitor.supervisor.stopped") {
      return processIsHealthy("background-supervisor");
    }
    for (const role of ["background-supervisor", "system-inspection"]) {
      if (alertId.startsWith(`monitor.process.${role}.`)) {
        return processIsHealthy(role);
      }
    }
    const demandManagedRoles = ["import-worker", "source-watcher", "maintenance-worker", "agent-worker"];
    const role = demandManagedRoles.find((item) => alertId.startsWith(`monitor.process.${item}.`));
    if (!role) {
      return false;
    }
    const processItem = options.backgroundProcesses.value.find((item) => item.role === role);
    return processItem?.desired === false;
  }

  function syncDashboardAlertInbox(liveAlerts: DashboardAlert[]) {
    const now = new Date().toISOString();
    const liveById = new Map<string, DashboardAlert>(
      liveAlerts.map((alertItem) => [dashboardAlertInboxId(alertItem), alertItem]),
    );
    const nextDismissedIds = new Set<string>();
    for (const alertId of dismissedDashboardAlertIds.value) {
      if (liveById.has(alertId)) {
        nextDismissedIds.add(alertId);
      }
    }
    const nextInbox: Record<string, DashboardAlert> = {};
    for (const [alertId, previousAlert] of Object.entries(dashboardAlertInbox.value)) {
      if (nextDismissedIds.has(alertId)) {
        continue;
      }
      if (!liveById.has(alertId)) {
        if (shouldDropResolvedDashboardAlert(previousAlert)) {
          continue;
        }
        nextInbox[alertId] = previousAlert.live === false
          ? previousAlert
          : {
              ...previousAlert,
              status: "已恢复，待确认",
              tone: "success",
              actionLabel: "确认关闭",
              live: false,
              resolvedAt: now,
            };
      }
    }
    for (const [alertId, liveAlert] of liveById.entries()) {
      if (nextDismissedIds.has(alertId)) {
        continue;
      }
      const previousAlert = dashboardAlertInbox.value[alertId];
      nextInbox[alertId] = {
        ...previousAlert,
        ...liveAlert,
        firstSeenAt: previousAlert?.firstSeenAt || now,
        lastSeenAt: now,
        live: true,
        resolvedAt: "",
      };
    }
    dismissedDashboardAlertIds.value = nextDismissedIds;
    dashboardAlertInbox.value = nextInbox;
  }

  const dashboardAlerts = computed<DashboardAlert[]>(() => {
    const severityRank: Record<DashboardAlert["tone"], number> = {
      danger: 0,
      warning: 1,
      success: 2,
    };
    return Object.values(dashboardAlertInbox.value)
      .filter((alertItem) => !dismissedDashboardAlertIds.value.has(dashboardAlertInboxId(alertItem)))
      .sort((left, right) => {
        const severityDiff = severityRank[left.tone] - severityRank[right.tone];
        if (severityDiff !== 0) {
          return severityDiff;
        }
        return String(left.firstSeenAt || "").localeCompare(String(right.firstSeenAt || ""));
      });
  });

  const dashboardAlertSummary = computed(() => {
    const dangerCount = dashboardAlerts.value.filter((item) => item.tone === "danger").length;
    const warningCount = dashboardAlerts.value.filter((item) => item.tone === "warning").length;
    const recoveredCount = dashboardAlerts.value.filter((item) => item.tone === "success").length;
    if (dashboardAlerts.value.length === 0) {
      return "当前没有需要处理的报警。";
    }
    return [
      dangerCount ? `${dangerCount} 项严重` : "",
      warningCount ? `${warningCount} 项警告` : "",
      recoveredCount ? `${recoveredCount} 项已恢复待确认` : "",
    ].filter(Boolean).join("，");
  });

  async function openDashboardAlert(alertItem: DashboardAlert) {
    if (alertItem.source === "configuration" && alertItem.configAlert) {
      await options.openAgentConfigurationAlert(alertItem.configAlert);
      return;
    }
    options.openAdmin("opsMonitor");
    await options.refreshMonitorAlerts({ silent: true });
  }

  async function dismissDashboardAlert(alertItem: DashboardAlert) {
    const inboxId = dashboardAlertInboxId(alertItem);
    const monitorAlert = alertItem.monitorAlert;
    if (
      alertItem.source === "monitor" &&
      monitorAlert &&
      (monitorAlert.ackRequired || monitorAlert.active === false || monitorAlert.status === "recovered")
    ) {
      await options.acknowledgeMonitorAlert(alertItem.alertId);
      if (options.error.value) {
        return;
      }
    }
    dismissedDashboardAlertIds.value = new Set([
      ...dismissedDashboardAlertIds.value,
      inboxId,
    ]);
    const nextInbox = { ...dashboardAlertInbox.value };
    delete nextInbox[inboxId];
    dashboardAlertInbox.value = nextInbox;
  }

  async function refreshDashboardAlertsSnapshot(optionsOverride: { silent?: boolean } = {}) {
    await options.refreshMonitorAlerts({ silent: optionsOverride.silent !== false });
    syncDashboardAlertInbox(liveDashboardAlerts.value);
  }

  return {
    agentConfigurationAlertSummary,
    agentConfigurationAlerts,
    dashboardAlertInbox,
    dashboardAlertInboxId,
    dashboardAlertSummary,
    dashboardAlerts,
    dismissDashboardAlert,
    dismissedDashboardAlertIds,
    liveDashboardAlerts,
    openDashboardAlert,
    refreshDashboardAlertsSnapshot,
    syncDashboardAlertInbox,
  };
}
