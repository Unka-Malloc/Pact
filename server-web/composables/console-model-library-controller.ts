import { computed, type ComputedRef, type Ref } from "vue";
import { bridge } from "../lib/bridge";
import type {
  AgentModelConfig,
  AgentModuleAccess,
  AgentSettings,
  CodexOAuthStatus,
  ModelProbeResponse,
  ModuleAgentProfile,
} from "../lib/types";
import type { CloudProvider, ModelEntryBinding } from "../types/app";
import {
  intelligentModuleDefinitions,
  modelLibraryProviderDefinitions,
} from "./console-defaults";
import {
  modelEntryParameters,
  normalizeAgentModuleAccess,
  normalizeModelLibraryEntries,
  normalizeModuleAgentProfile,
} from "./console-model-utils";

type ConsoleModelLibraryControllerOptions = {
  agentExploreModelAlias: () => string;
  codexOAuthStatus: Ref<CodexOAuthStatus | null>;
  clearAllBusy: () => void;
  currentAgentModelOptionLabel: (value?: string) => string;
  ensureCodexOAuthReady: (startLogin?: boolean) => Promise<boolean>;
  error: Ref<string>;
  infoFeedModelAlias: () => string;
  infoFeedRunningSummary: () => { modelAlias?: string; runId?: string; status?: string };
  modelLibraryExpandedCards: Ref<Record<string, boolean>>;
  modelProbeResults: Ref<Record<string, ModelProbeResponse>>;
  moduleAgentCandidateDrafts: Ref<Record<string, string>>;
  normalizeModelEntry: (entry: Partial<AgentModelConfig>, index?: number) => AgentModelConfig;
  replaceSettingsDraftFromServer: (settings: AgentSettings, options?: { markClean?: boolean }) => void;
  ruleAuthoringModelAlias: () => string;
  selectedModelProvider: Ref<CloudProvider>;
  setBusy: (key: string) => void;
  settingsDraft: Ref<AgentSettings>;
  settingsPayloadForSave: () => AgentSettings;
};

export function createConsoleModelLibraryController(options: ConsoleModelLibraryControllerOptions) {
  function providerLabel(provider: CloudProvider | string) {
    switch (provider) {
      case "openai-chatgpt":
        return "ChatGPT";
      case "google-gemini":
        return "Gemini";
      case "openrouter":
        return "OpenRouter";
      case "deepseek":
        return "DeepSeek";
      case "copilot":
        return "Copilot";
      case "custom-http":
        return "HTTP Adapter";
      case "local-model":
        return "本地模型";
      default:
        return provider || "未知";
    }
  }

  function modelRef(provider: string, model: string) {
    return `${provider}:${model || ""}`;
  }

  function parseModelRef(refValue: string) {
    const [provider, ...modelParts] = String(refValue || "").split(":");
    return {
      provider: (provider || "") as CloudProvider,
      model: modelParts.join(":") || "",
    };
  }

  function customHttpAdapterAlias() {
    return String(
      options.settingsDraft.value.customModelAlias ||
        options.settingsDraft.value.customHttpAdapter?.alias ||
        options.settingsDraft.value.customModelLabel ||
        "external-agent",
    ).trim();
  }

  function customHttpAdapterLabel() {
    return String(
      options.settingsDraft.value.customModelLabel ||
        options.settingsDraft.value.customHttpAdapter?.label ||
        "自定义 HTTP 模型",
    ).trim();
  }

  function modelProviderDefinition(provider: CloudProvider | string) {
    return modelLibraryProviderDefinitions.find((item) => item.id === provider);
  }

  const visibleModelProviders = computed(() =>
    normalizeModelLibraryEntries(options.settingsDraft.value.modelLibraryEntries),
  );

  const visibleModelEntries = computed(() => options.settingsDraft.value.modelLibraryAgents || []);
  const addableModelProviders = computed(() => modelLibraryProviderDefinitions);

  function providerConfigured(provider: CloudProvider) {
    switch (provider) {
      case "google-gemini":
        return options.settingsDraft.value.googleApiKeyConfigured || Boolean(options.settingsDraft.value.googleApiKey);
      case "openai-chatgpt":
        return Boolean(options.codexOAuthStatus.value?.valid);
      case "deepseek":
        return options.settingsDraft.value.deepSeekApiKeyConfigured || Boolean(options.settingsDraft.value.deepSeekApiKey);
      case "openrouter":
        return options.settingsDraft.value.openRouterApiKeyConfigured || Boolean(options.settingsDraft.value.openRouterApiKey);
      case "copilot":
        return Boolean(options.settingsDraft.value.copilotEndpoint || options.settingsDraft.value.copilotApiKeyConfigured || options.settingsDraft.value.copilotApiKey);
      case "custom-http":
        return Boolean(options.settingsDraft.value.customHttpAdapter?.url || options.settingsDraft.value.customHttpAdapter?.tokenConfigured || options.settingsDraft.value.customHttpAdapter?.token);
      case "local-model":
        return Boolean(options.settingsDraft.value.localModelEndpoint);
      default:
        return false;
    }
  }

  function modelEntryConfigured(entry: AgentModelConfig) {
    const hasModel = Boolean(String(entry.model ?? entry.engine ?? "").trim());
    if (entry.provider === "deepseek") {
      return hasModel && Boolean(entry.apiKey || entry.apiKeyConfigured || options.settingsDraft.value.deepSeekApiKey || options.settingsDraft.value.deepSeekApiKeyConfigured);
    }
    if (entry.provider === "custom-http") {
      return hasModel && Boolean((entry.url || options.settingsDraft.value.customHttpAdapter?.url) && (entry.token || entry.tokenConfigured || options.settingsDraft.value.customHttpAdapter?.tokenConfigured));
    }
    return hasModel && providerConfigured(entry.provider as CloudProvider);
  }

  function modelEntryStatusKey(entry: AgentModelConfig) {
    return entry.uid || entry.instanceId || entry.alias;
  }

  function agentExploreModelOptionLabel(entry: AgentModelConfig) {
    const modelName = String(
      entry.label || entry.agentName || entry.alias || modelEntryStatusKey(entry),
    ).trim();
    const modelId = String(entry.model || entry.engine || modelEntryStatusKey(entry)).trim();
    return modelId && modelId !== modelName ? `${modelName} · ${modelId}` : modelName;
  }

  function modelEntryUidSet(entry: AgentModelConfig) {
    return new Set(
      [
        entry.uid,
        entry.instanceId,
        entry.alias,
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    );
  }

  function modelEntryMatchesUid(entry: AgentModelConfig, value?: string) {
    const normalized = String(value || "").trim();
    return Boolean(normalized && modelEntryUidSet(entry).has(normalized));
  }

  function modelEntryMatchesAssignment(
    entry: AgentModelConfig,
    provider?: string,
    modelUid?: string,
  ) {
    const normalizedProvider = String(provider || "").trim();
    const normalizedModelUid = String(modelUid || "").trim();
    if (!normalizedProvider || !normalizedModelUid || normalizedProvider !== entry.provider) {
      return false;
    }
    return modelEntryUidSet(entry).has(normalizedModelUid);
  }

  function addModelEntryBinding(
    bindings: ModelEntryBinding[],
    binding: ModelEntryBinding,
  ) {
    if (bindings.some((item) => item.bindingId === binding.bindingId)) {
      return;
    }
    bindings.push(binding);
  }

  function collectModelEntryBindings(entry: AgentModelConfig): ModelEntryBinding[] {
    const bindings: ModelEntryBinding[] = [];
    if (modelEntryMatchesUid(entry, options.infoFeedModelAlias())) {
      addModelEntryBinding(bindings, {
        bindingId: "info-feed:form",
        category: "信息流",
        label: "信息流智能体",
        detail: "当前信息流页面选用的智能体。",
        source: "draft",
      });
    }
    const infoFeedSummary = options.infoFeedRunningSummary();
    if (
      modelEntryMatchesUid(entry, infoFeedSummary.modelAlias) &&
      infoFeedSummary.status === "running"
    ) {
      addModelEntryBinding(bindings, {
        bindingId: `info-feed:running:${infoFeedSummary.runId}`,
        category: "信息流",
        label: "正在运行的信息流",
        detail: `运行 ${infoFeedSummary.runId} 正在使用该智能体。`,
        source: "runtime",
      });
    }
    if (modelEntryMatchesUid(entry, options.agentExploreModelAlias())) {
      addModelEntryBinding(bindings, {
        bindingId: "agent-explore:form",
        category: "信息流",
        label: "智能检索",
        detail: "信息流中的智能检索面板显式选用了该智能体。",
        source: "draft",
      });
    }
    if (modelEntryMatchesUid(entry, options.ruleAuthoringModelAlias())) {
      addModelEntryBinding(bindings, {
        bindingId: "rule-authoring:form",
        category: "知识库",
        label: "规则生成",
        detail: "知识库规则库的智能生成入口正在引用该智能体。",
        source: "draft",
      });
    }
    if (
      modelEntryMatchesUid(
        entry,
        options.settingsDraft.value.agentExploreDefaults?.reviewFusionModelAlias,
      )
    ) {
      addModelEntryBinding(bindings, {
        bindingId: "knowledge-review:fusion",
        category: "知识库",
        label: "知识融合智能体",
        detail: "工作台审批流中的知识融合流程显式绑定该智能体。",
        source: "settings",
      });
    }
    for (const moduleDefinition of intelligentModuleDefinitions) {
      if (!moduleNeedsIntelligence(moduleDefinition.id)) {
        continue;
      }
      const assignment = options.settingsDraft.value.moduleModelAssignments?.[moduleDefinition.id];
      if (modelEntryMatchesAssignment(entry, assignment?.provider, assignment?.model)) {
        addModelEntryBinding(bindings, {
          bindingId: `module:${moduleDefinition.id}`,
          category: "模块模型分配",
          label: moduleDefinition.label,
          detail: moduleDefinition.description,
          source: "settings",
        });
      }
      const profileGroup = options.settingsDraft.value.moduleAgentProfiles?.[moduleDefinition.id];
      if (profileGroup?.agents?.[modelEntryStatusKey(entry)]) {
        addModelEntryBinding(bindings, {
          bindingId: `module-profile:${moduleDefinition.id}:${modelEntryStatusKey(entry)}`,
          category: "模块专属参数",
          label: `${moduleDefinition.label} 专属配置`,
          detail: "该智能体保存了模块/功能专属调用参数或依赖上下文。",
          source: "settings",
        });
      }
    }
    return bindings;
  }

  const modelEntryBindingsByKey = computed<Record<string, ModelEntryBinding[]>>(() => {
    const next: Record<string, ModelEntryBinding[]> = {};
    for (const entry of visibleModelEntries.value) {
      next[modelEntryStatusKey(entry)] = collectModelEntryBindings(entry);
    }
    return next;
  });

  function modelEntryBindings(entry: AgentModelConfig): ModelEntryBinding[] {
    return modelEntryBindingsByKey.value[modelEntryStatusKey(entry)] || [];
  }

  function modelEntryIsBound(entry: AgentModelConfig) {
    return modelEntryBindings(entry).length > 0;
  }

  function modelEntryBindingSummary(entry: AgentModelConfig) {
    const bindings = modelEntryBindings(entry);
    if (bindings.length === 0) {
      return "";
    }
    return bindings.map((item) => item.label).join("、");
  }

  function isModelLibraryCardExpanded(entry: AgentModelConfig) {
    return options.modelLibraryExpandedCards.value[modelEntryStatusKey(entry)] === true;
  }

  function toggleModelLibraryCard(entry: AgentModelConfig) {
    const key = modelEntryStatusKey(entry);
    options.modelLibraryExpandedCards.value = {
      ...options.modelLibraryExpandedCards.value,
      [key]: !options.modelLibraryExpandedCards.value[key],
    };
  }

  function modelEntryStatusLabel(entry: AgentModelConfig) {
    const probe = options.modelProbeResults.value[modelEntryStatusKey(entry)];
    if (probe) {
      return probe.ok ? "探测通过" : "探测失败";
    }
    return modelEntryConfigured(entry) ? "已配置" : "未配置";
  }

  function modelEntryStatusTone(entry: AgentModelConfig) {
    const probe = options.modelProbeResults.value[modelEntryStatusKey(entry)];
    if (probe) {
      return probe.ok ? "success" : "danger";
    }
    return modelEntryConfigured(entry) ? "neutral" : "muted";
  }

  function modelEntryProbeResult(entry: AgentModelConfig) {
    return options.modelProbeResults.value[modelEntryStatusKey(entry)] || null;
  }

  function modelEntryProbeStatusLabel(entry: AgentModelConfig) {
    const probe = modelEntryProbeResult(entry);
    if (!probe) {
      return "";
    }
    return probe.ok ? "探测通过" : "探测失败";
  }

  function modelEntryProbeStatusTone(entry: AgentModelConfig) {
    const probe = modelEntryProbeResult(entry);
    if (!probe) {
      return "neutral";
    }
    return probe.ok ? "success" : "danger";
  }

  function providerStatusLabel(provider: CloudProvider) {
    const probe = options.modelProbeResults.value[provider];
    if (probe) {
      return probe.ok ? "探测通过" : "探测失败";
    }
    return providerConfigured(provider) ? "已配置" : "未配置";
  }

  function providerStatusTone(provider: CloudProvider) {
    const probe = options.modelProbeResults.value[provider];
    if (probe) {
      return probe.ok ? "success" : "danger";
    }
    return providerConfigured(provider) ? "neutral" : "muted";
  }

  function addModelProvider() {
    const provider = options.selectedModelProvider.value;
    if (!provider) {
      return;
    }
    const entry = options.normalizeModelEntry({
      provider,
      model: "",
      label: `${providerLabel(provider)} 智能体`,
      baseUrl: provider === "deepseek" ? options.settingsDraft.value.deepSeekBaseUrl : "",
      timeoutMs: provider === "deepseek" ? options.settingsDraft.value.deepSeekTimeoutMs : 120000,
    }, Date.now());
    const key = modelEntryStatusKey(entry);
    options.settingsDraft.value.modelLibraryAgents = [
      entry,
      ...visibleModelEntries.value,
    ];
    options.modelLibraryExpandedCards.value = {
      ...options.modelLibraryExpandedCards.value,
      [key]: true,
    };
  }

  async function removeModelProvider(provider: CloudProvider | AgentModelConfig) {
    const entry = typeof provider === "string" ? null : provider;
    const removeKey = entry ? modelEntryStatusKey(entry) : String(provider);
    if (entry && modelEntryIsBound(entry)) {
      options.error.value = `智能体已绑定到 ${modelEntryBindingSummary(entry)}，请先解除引用后再删除。`;
      return;
    }
    const previousModels = [...visibleModelEntries.value];
    const previousEntries = [...visibleModelProviders.value];
    options.settingsDraft.value.modelLibraryAgents = entry
      ? visibleModelEntries.value.filter((item) => modelEntryStatusKey(item) !== removeKey)
      : visibleModelEntries.value.filter((item) => item.provider !== provider);
    const remainingExpandedCards = { ...options.modelLibraryExpandedCards.value };
    delete remainingExpandedCards[removeKey];
    options.modelLibraryExpandedCards.value = remainingExpandedCards;
    options.settingsDraft.value.modelLibraryEntries = [
      ...new Set(options.settingsDraft.value.modelLibraryAgents.map((item) => item.provider)),
    ] as CloudProvider[];
    options.setBusy(`model-remove:${removeKey}`);
    options.error.value = "";
    try {
      const saved = await bridge.saveSettings(options.settingsPayloadForSave());
      options.replaceSettingsDraftFromServer(saved);
    } catch (nextError) {
      options.settingsDraft.value.modelLibraryAgents = previousModels;
      options.settingsDraft.value.modelLibraryEntries = previousEntries;
      options.error.value =
        nextError instanceof Error ? nextError.message : "移除模型配置失败。";
    } finally {
      options.clearAllBusy();
    }
  }

  function duplicateModelEntry(entry: AgentModelConfig) {
    const copy = options.normalizeModelEntry({
      ...entry,
      uid: "",
      instanceId: "",
      alias: "",
      label: `${entry.label || entry.alias} 副本`,
      apiKey: "",
      token: "",
    }, Date.now());
    const key = modelEntryStatusKey(copy);
    options.settingsDraft.value.modelLibraryAgents = [copy, ...visibleModelEntries.value];
    options.modelLibraryExpandedCards.value = {
      ...options.modelLibraryExpandedCards.value,
      [key]: true,
    };
  }

  function modelProbeFailureResult(entry: AgentModelConfig, message: string): ModelProbeResponse {
    return {
      ok: false,
      configured: modelEntryConfigured(entry),
      provider: entry.provider,
      model: String(entry.model || entry.engine || ""),
      statusCode: 0,
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
      message,
    };
  }

  function modelProbeSettingsForEntry(entry: AgentModelConfig) {
    const settings = options.settingsPayloadForSave();
    const cleanParameters = modelEntryParameters(entry);
    if (entry.provider === "google-gemini") {
      settings.googleModel = String(entry.model ?? "");
    }
    if (entry.provider === "openai-chatgpt") {
      settings.openAiModel = String(entry.model ?? "");
    }
    if (entry.provider === "deepseek") {
      settings.deepSeekBaseUrl = entry.baseUrl || settings.deepSeekBaseUrl;
      settings.deepSeekModel = String(entry.model ?? "");
      settings.deepSeekApiKey = entry.apiKey || "";
      settings.deepSeekApiKeyConfigured = Boolean(entry.apiKey || entry.apiKeyConfigured);
      settings.deepSeekTimeoutMs = Number(entry.timeoutMs || settings.deepSeekTimeoutMs);
    }
    if (entry.provider === "openrouter") {
      settings.openRouterModel = String(entry.model ?? "");
    }
    if (entry.provider === "copilot") {
      settings.copilotModel = String(entry.model ?? "");
    }
    if (entry.provider === "local-model") {
      settings.localModelName = String(entry.model ?? "");
    }
    if (entry.provider === "custom-http") {
      settings.customModelAlias = modelEntryStatusKey(entry);
      settings.customModelLabel = entry.label || modelEntryStatusKey(entry);
      const adapter = {
        ...settings.customHttpAdapter,
        alias: modelEntryStatusKey(entry),
        label: entry.label || modelEntryStatusKey(entry),
        url: entry.url || "",
        token: entry.token || "",
        tokenConfigured: entry.tokenConfigured,
        tokenHeader: entry.tokenHeader || "token",
        tokenPrefix: entry.tokenPrefix || "",
        agentName: entry.label || "",
        engine: entry.engine || entry.model || "",
        pluginList: entry.pluginList || [],
        parameters: cleanParameters,
        timeoutMs: Number(entry.timeoutMs || 120000),
      };
      settings.customHttpAdapter = adapter;
      settings.customHttpAdapters = [adapter];
    }
    return settings;
  }

  async function runModelEntryProbe(entry: AgentModelConfig): Promise<ModelProbeResponse> {
    if (!modelEntryConfigured(entry)) {
      return modelProbeFailureResult(entry, "模型配置不完整，未执行远程探测。");
    }
    return bridge.probeModel({
      provider: entry.provider,
      modelAlias: modelEntryStatusKey(entry),
      settings: modelProbeSettingsForEntry(entry),
    });
  }

  async function probeModelEntry(entry: AgentModelConfig) {
    const key = modelEntryStatusKey(entry);
    options.setBusy(`model-probe:${key}`);
    options.error.value = "";
    try {
      const result = await runModelEntryProbe(entry);
      options.modelProbeResults.value = {
        ...options.modelProbeResults.value,
        [key]: result,
      };
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "模型探测失败。";
      options.modelProbeResults.value = {
        ...options.modelProbeResults.value,
        [key]: modelProbeFailureResult(entry, message),
      };
      options.error.value = message;
    } finally {
      options.clearAllBusy();
    }
  }

  async function probeModelLibraryBeforeSave() {
    const failures: Array<{ entry: AgentModelConfig; result: ModelProbeResponse }> = [];
    const nextResults: Record<string, ModelProbeResponse> = {};
    for (const entry of visibleModelEntries.value) {
      const key = modelEntryStatusKey(entry);
      try {
        const result = await runModelEntryProbe(entry);
        nextResults[key] = result;
        if (!result.ok) {
          failures.push({ entry, result });
        }
      } catch (nextError) {
        const message = nextError instanceof Error ? nextError.message : "模型探测失败。";
        const result = modelProbeFailureResult(entry, message);
        nextResults[key] = result;
        failures.push({ entry, result });
      }
    }
    options.modelProbeResults.value = {
      ...options.modelProbeResults.value,
      ...nextResults,
    };
    return failures;
  }

  const agentModelAssignmentOptions = computed(() =>
    visibleModelEntries.value
      .map((entry) => ({
        provider: entry.provider as CloudProvider,
        value: modelEntryStatusKey(entry),
        label: agentExploreModelOptionLabel(entry),
        ref: modelRef(entry.provider, modelEntryStatusKey(entry)),
        enabled: modelEntryConfigured(entry),
      })),
  );

  function modelEntryModuleAccess(entry: AgentModelConfig): AgentModuleAccess {
    return normalizeAgentModuleAccess(entry.moduleAccess);
  }

  function modelEntryAllowsModule(entry: AgentModelConfig, moduleId: string) {
    const access = modelEntryModuleAccess(entry);
    return access.mode !== "selected" || access.moduleIds.includes(moduleId);
  }

  function setModelEntryModuleAccessMode(entry: AgentModelConfig, mode: string) {
    entry.moduleAccess = {
      ...modelEntryModuleAccess(entry),
      mode: mode === "selected" ? "selected" : "all",
    };
  }

  function toggleModelEntryModuleAccess(entry: AgentModelConfig, moduleId: string, checked: boolean) {
    const access = modelEntryModuleAccess(entry);
    const next = new Set(access.moduleIds);
    if (checked) {
      next.add(moduleId);
    } else {
      next.delete(moduleId);
    }
    entry.moduleAccess = {
      mode: "selected",
      moduleIds: [...next],
    };
  }

  function moduleModelAssignmentOptions(moduleId: string) {
    return agentModelAssignmentOptions.value.filter((option) => {
      const entry = visibleModelEntries.value.find((model) => modelEntryStatusKey(model) === option.value);
      return Boolean(entry && modelEntryAllowsModule(entry, moduleId));
    });
  }

  function modelProviderFromRef(refValue: string) {
    return parseModelRef(refValue).provider;
  }

  function moduleNeedsIntelligence(moduleId: string) {
    if (moduleModelRef(moduleId)) {
      return true;
    }
    return options.settingsDraft.value.moduleIntelligence?.[moduleId] !== false;
  }

  function setModuleNeedsIntelligence(moduleId: string, enabled: boolean) {
    options.settingsDraft.value.moduleIntelligence = {
      ...(options.settingsDraft.value.moduleIntelligence || {}),
      [moduleId]: enabled,
    };
  }

  function ensureModuleAgentGroup(moduleId: string) {
    const groups = { ...(options.settingsDraft.value.moduleAgentProfiles || {}) };
    const group = groups[moduleId] || { primaryAgent: "", agents: {} };
    groups[moduleId] = {
      primaryAgent: String(group.primaryAgent || "").trim(),
      agents: { ...(group.agents || {}) },
    };
    options.settingsDraft.value.moduleAgentProfiles = groups;
    return groups[moduleId];
  }

  function ensureModuleAgentProfile(moduleId: string, agentId: string, defaults: Partial<ModuleAgentProfile> = {}) {
    const normalizedAgentId = String(agentId || "").trim();
    if (!normalizedAgentId) {
      return null;
    }
    const group = ensureModuleAgentGroup(moduleId);
    group.agents[normalizedAgentId] = normalizeModuleAgentProfile({
      ...(group.agents[normalizedAgentId] || {}),
      ...defaults,
      role: defaults.role || (group.primaryAgent === normalizedAgentId ? "primary" : "assistant"),
    });
    return group.agents[normalizedAgentId];
  }

  function removeModuleAgentProfile(moduleId: string, agentId: string) {
    const group = ensureModuleAgentGroup(moduleId);
    delete group.agents[agentId];
    if (group.primaryAgent === agentId) {
      group.primaryAgent = "";
      const nextAssignments = { ...(options.settingsDraft.value.moduleModelAssignments || {}) };
      delete nextAssignments[moduleId];
      options.settingsDraft.value.moduleModelAssignments = nextAssignments;
    }
  }

  function moduleAgentProfileRows(moduleId: string) {
    const group = options.settingsDraft.value.moduleAgentProfiles?.[moduleId];
    const agents = group?.agents || {};
    return Object.entries(agents).map(([agentId, profile]) => {
      const entry = visibleModelEntries.value.find((model) => modelEntryStatusKey(model) === agentId);
      return {
        agentId,
        label: entry ? agentExploreModelOptionLabel(entry) : options.currentAgentModelOptionLabel(agentId) || agentId,
        isPrimary: group?.primaryAgent === agentId,
        profile,
      };
    });
  }

  function moduleModelRef(moduleId: string) {
    const assignment = options.settingsDraft.value.moduleModelAssignments?.[moduleId];
    if (!assignment?.provider || !assignment?.model) {
      return "";
    }
    const refValue = modelRef(assignment.provider, assignment.model);
    return moduleModelAssignmentOptions(moduleId).some((option) => option.ref === refValue)
      ? refValue
      : "";
  }

  function setModuleModelRef(moduleId: string, refValue: string) {
    if (!String(refValue || "").trim()) {
      const nextAssignments = { ...(options.settingsDraft.value.moduleModelAssignments || {}) };
      delete nextAssignments[moduleId];
      options.settingsDraft.value.moduleModelAssignments = nextAssignments;
      const group = ensureModuleAgentGroup(moduleId);
      group.primaryAgent = "";
      const moduleDefinition = intelligentModuleDefinitions.find((item) => item.id === moduleId);
      if (moduleDefinition?.alertRequired === false) {
        setModuleNeedsIntelligence(moduleId, false);
      }
      return;
    }
    const parsed = parseModelRef(refValue);
    options.settingsDraft.value.moduleModelAssignments = {
      ...(options.settingsDraft.value.moduleModelAssignments || {}),
      [moduleId]: {
        provider: parsed.provider,
        model: parsed.model,
      },
    };
    const group = ensureModuleAgentGroup(moduleId);
    group.primaryAgent = parsed.model;
    ensureModuleAgentProfile(moduleId, parsed.model, { role: "primary" });
    setModuleNeedsIntelligence(moduleId, true);
    if (parsed.provider === "openai-chatgpt") {
      void options.ensureCodexOAuthReady(true);
    }
  }

  function setModuleAgentProfileEnabled(moduleId: string, agentId: string, enabled: boolean) {
    const profile = ensureModuleAgentProfile(moduleId, agentId);
    if (profile) {
      profile.enabled = enabled;
    }
  }

  function addModuleAgentProfileFromDraft(moduleId: string) {
    const refValue = String(options.moduleAgentCandidateDrafts.value[moduleId] || "").trim();
    if (!refValue) {
      return;
    }
    const parsed = parseModelRef(refValue);
    ensureModuleAgentProfile(moduleId, parsed.model, { role: "assistant" });
    options.moduleAgentCandidateDrafts.value = {
      ...options.moduleAgentCandidateDrafts.value,
      [moduleId]: "",
    };
  }

  const moduleModelAssignmentStats = computed(() => {
    const enabled = intelligentModuleDefinitions.filter((item) => moduleNeedsIntelligence(item.id)).length;
    const assigned = intelligentModuleDefinitions.filter((item) => moduleNeedsIntelligence(item.id) && moduleModelRef(item.id)).length;
    return {
      assigned,
      enabled,
      total: intelligentModuleDefinitions.length,
    };
  });

  function hasOpenAiModelUsage() {
    return intelligentModuleDefinitions.some(
      (item) =>
        moduleNeedsIntelligence(item.id) &&
        moduleModelRef(item.id) &&
        modelProviderFromRef(moduleModelRef(item.id)) === "openai-chatgpt",
    );
  }

  return {
    addModelEntryBinding,
    addModelProvider,
    addModuleAgentProfileFromDraft,
    addableModelProviders,
    agentExploreModelOptionLabel,
    agentModelAssignmentOptions,
    collectModelEntryBindings,
    customHttpAdapterAlias,
    customHttpAdapterLabel,
    duplicateModelEntry,
    ensureModuleAgentGroup,
    ensureModuleAgentProfile,
    hasOpenAiModelUsage,
    isModelLibraryCardExpanded,
    modelEntryBindingSummary,
    modelEntryBindings,
    modelEntryBindingsByKey,
    modelEntryAllowsModule,
    modelEntryConfigured,
    modelEntryIsBound,
    modelEntryMatchesAssignment,
    modelEntryMatchesUid,
    modelEntryModuleAccess,
    modelEntryProbeResult,
    modelEntryProbeStatusLabel,
    modelEntryProbeStatusTone,
    modelEntryStatusKey,
    modelEntryStatusLabel,
    modelEntryStatusTone,
    modelEntryUidSet,
    modelProbeFailureResult,
    modelProbeSettingsForEntry,
    modelProviderDefinition,
    modelProviderFromRef,
    modelRef,
    moduleAgentProfileRows,
    moduleModelAssignmentOptions,
    moduleModelAssignmentStats,
    moduleModelRef,
    moduleNeedsIntelligence,
    parseModelRef,
    probeModelEntry,
    probeModelLibraryBeforeSave,
    providerConfigured,
    providerLabel,
    providerStatusLabel,
    providerStatusTone,
    removeModelProvider,
    removeModuleAgentProfile,
    runModelEntryProbe,
    setModelEntryModuleAccessMode,
    setModuleAgentProfileEnabled,
    setModuleModelRef,
    setModuleNeedsIntelligence,
    toggleModelEntryModuleAccess,
    toggleModelLibraryCard,
    visibleModelEntries,
    visibleModelProviders,
  };
}
