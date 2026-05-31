import { computed, type Ref } from "vue";
import type { AgentSettings, ServerConsoleState } from "../lib/types";
import type { PathPickerMode } from "../types/app";
import {
  moduleGroupDefinitions,
  moduleNameDescriptions,
  moduleNameLabels,
} from "./console-defaults";
import { analysisModuleDescriptionForModule } from "./console-status-utils";

type RuntimeMount = ServerConsoleState["runtime"]["mounts"][number];

export type RuntimeModuleRow = {
  name: string;
  label: string;
  description: string;
  modulePath: string;
  configuredPath: string;
  runtimeMount: RuntimeMount | undefined;
  externalEnabled: boolean;
  pathHint: string;
};

export type ConsoleRuntimeMountControllerOptions = {
  consoleState: Ref<ServerConsoleState | null>;
  editingMountPaths: Ref<Record<string, boolean>>;
  mountDraft: Ref<Record<string, string>>;
  settingsDraft: Ref<AgentSettings>;
  openServerPathPicker: (options: {
    title: string;
    mode: PathPickerMode;
    value?: string;
    extensions?: string[];
    closeOnSelect?: boolean;
    applyPath: (nextPath: string) => void;
  }) => void;
  saveMountModules: (busy?: string) => Promise<unknown>;
};

export function createConsoleRuntimeMountController(options: ConsoleRuntimeMountControllerOptions) {
  const enabledMountCount = computed(
    () => (options.consoleState.value?.runtime?.mounts || []).filter((mount) => mount.enabled).length || 0,
  );

  const totalMountCount = computed(
    () => (options.consoleState.value?.runtime?.mounts || []).length || 0,
  );

  const moduleRows = computed<RuntimeModuleRow[]>(() => {
    const configured = options.consoleState.value?.runtime?.mountModules || {};
    const runtimeMounts = options.consoleState.value?.runtime?.mounts || [];
    const names = Array.from(
      new Set([
        ...Object.keys(moduleNameLabels),
        ...Object.keys(configured),
        ...runtimeMounts.map((mount) => mount.name),
      ]),
    );

    return names.map((name) => {
      const runtimeMount = runtimeMounts.find((mount) => mount.name === name);
      const modulePath = options.mountDraft.value[name] ?? configured[name] ?? "";
      const configuredPath = String(modulePath || "").trim();
      const runtimeAvailable = Boolean(runtimeMount) && runtimeMount?.enabled !== false;

      return {
        name,
        label: moduleNameLabels[name] || name,
        description:
          moduleNameDescriptions[name] || "自定义外置能力模块，可通过路径接入。",
        modulePath,
        configuredPath,
        runtimeMount,
        externalEnabled: runtimeAvailable || configuredPath.length > 0,
        pathHint: configuredPath || (runtimeAvailable
          ? `当前使用内置模块：${runtimeMount?.id || name}`
          : "填写外置模块 .mjs 路径"),
      };
    });
  });

  const moduleGroups = computed(() => {
    const rows = moduleRows.value;
    const groupedNames = new Set(
      moduleGroupDefinitions.flatMap((group) => group.names),
    );
    const configuredGroups = moduleGroupDefinitions
      .map((group) => ({
        ...group,
        rows: group.names
          .map((name) => rows.find((row) => row.name === name))
          .filter((row): row is RuntimeModuleRow => Boolean(row)),
      }))
      .filter((group) => group.rows.length > 0);
    const customRows = rows.filter((row) => !groupedNames.has(row.name));

    if (customRows.length === 0) {
      return configuredGroups;
    }

    return [
      ...configuredGroups,
      {
        id: "custom",
        label: "自定义模块",
        description: "运行时发现的自定义外置能力模块。",
        names: customRows.map((row) => row.name),
        rows: customRows,
      },
    ];
  });

  const currentAnalysisModule = computed(() => {
    const moduleId =
      options.settingsDraft.value.analysisModuleId ||
      options.consoleState.value?.runtime?.currentAnalysisModuleId;
    return (
      (options.consoleState.value?.runtime?.analysisModules || []).find((item) => item.id === moduleId) || null
    );
  });

  function moduleCapabilityText(item: RuntimeModuleRow) {
    const mount = item.runtimeMount;

    if (!mount) {
      return "未加载运行实例";
    }

    const capabilities = [
      mount.supportsStructuredDocument ? "结构化文档" : "",
      mount.supportsTextExtraction ? "文本提取" : "",
      mount.supportsBatchHook ? "批次回调" : "",
    ].filter(Boolean);

    return capabilities.length > 0 ? capabilities.join(" / ") : "基础运行";
  }

  function analysisModuleDescription() {
    return analysisModuleDescriptionForModule(currentAnalysisModule.value);
  }

  function moduleStatusText(item: RuntimeModuleRow) {
    if (!item.runtimeMount) {
      return item.configuredPath ? "等待重载" : "未加载运行实例";
    }

    if (item.runtimeMount?.enabled === false) {
      const reason = String(item.runtimeMount.reason || "").trim();
      return !reason || reason === "disabled" ? "已禁用" : reason;
    }

    return "可用";
  }

  function moduleEnabledLabel(enabled: boolean) {
    return enabled ? "已开启" : "已关闭";
  }

  function moduleAvailabilityLabel(item: RuntimeModuleRow) {
    return item.runtimeMount?.enabled === false || !item.externalEnabled ? "不可用" : "可用";
  }

  function isMountPathEditing(name: string) {
    return options.editingMountPaths.value[name] === true;
  }

  function currentModulePathPlaceholder(item: RuntimeModuleRow) {
    return item.pathHint || "填写外置模块 .mjs 路径";
  }

  async function toggleMountPathEdit(item: RuntimeModuleRow) {
    if (!isMountPathEditing(item.name)) {
      options.editingMountPaths.value = {
        ...options.editingMountPaths.value,
        [item.name]: true,
      };
      return;
    }

    await options.saveMountModules(`mount:${item.name}`);
    options.editingMountPaths.value = {
      ...options.editingMountPaths.value,
      [item.name]: false,
    };
  }

  function openMountPathPicker(name: string) {
    options.editingMountPaths.value = {
      ...options.editingMountPaths.value,
      [name]: true,
    };
    options.openServerPathPicker({
      title: `选择${moduleNameLabels[name] || name}模块文件`,
      mode: "file",
      value: String(options.mountDraft.value[name] || ""),
      extensions: [".mjs", ".js", ".cjs"],
      applyPath: (nextPath) => {
        options.mountDraft.value = {
          ...options.mountDraft.value,
          [name]: nextPath,
        };
      },
    });
  }

  return {
    analysisModuleDescription,
    currentAnalysisModule,
    currentModulePathPlaceholder,
    enabledMountCount,
    isMountPathEditing,
    moduleAvailabilityLabel,
    moduleCapabilityText,
    moduleEnabledLabel,
    moduleGroups,
    moduleRows,
    moduleStatusText,
    openMountPathPicker,
    toggleMountPathEdit,
    totalMountCount,
  };
}
