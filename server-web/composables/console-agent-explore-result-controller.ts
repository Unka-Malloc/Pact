import { computed, type Ref } from "vue";
import { bridge } from "../lib/bridge";
import {
  extractEvidenceRefsFromText,
  linkifyEvidenceRefsInMarkdown,
  markdownToSafeHtml,
  uniqueEvidenceRefs,
} from "../lib/rendering";
import type { AgentExploreRunResponse } from "../lib/types";
import {
  copyTextToClipboard,
  downloadTextFile,
  formatCompactDate,
  formatMachineDate,
  safeDownloadName,
} from "./console-format-utils";
import { asRecord } from "./console-model-utils";
import {
  agentExplorePhaseLabel,
  agentExploreRunStatus,
  type AgentExploreFormState,
} from "./console-agent-explore-utils";

type ReadonlyRef<T> = {
  readonly value: T;
};

type ConsoleAgentExploreResultControllerOptions = {
  agentExploreForm: Ref<AgentExploreFormState>;
  agentExploreResult: Ref<AgentExploreRunResponse | null>;
  busyKey: ReadonlyRef<string>;
  error: Ref<string>;
  infoFeedQuery: () => string;
  infoFeedRunId: () => string;
  knowledgeSearchQuery: () => string;
};

export function createConsoleAgentExploreResultController(
  options: ConsoleAgentExploreResultControllerOptions,
) {
  const agentExploreSteps = computed(() => options.agentExploreResult.value?.steps || []);
  const agentExploreWorkspaceId = computed(
    () =>
      String(
        options.agentExploreResult.value?.workspace?.workspaceId ||
          options.agentExploreForm.value.workspaceId ||
          "",
      ),
  );
  const agentExploreRunInput = computed(() => asRecord(options.agentExploreResult.value?.run?.input) || {});
  const agentExploreRunCoverage = computed(() => asRecord(options.agentExploreResult.value?.run?.coverage) || {});
  const agentExploreMaxIterations = computed(() =>
    Math.max(
      1,
      Math.min(
        Number(agentExploreRunInput.value.maxIterations || options.agentExploreForm.value.maxIterations || 1),
        8,
      ),
    ),
  );
  const agentExploreActiveIteration = computed(() => {
    const explicit = Number(agentExploreRunCoverage.value.activeIteration || 0);
    if (Number.isFinite(explicit) && explicit > 0) {
      return Math.min(explicit, agentExploreMaxIterations.value);
    }
    const lastStep = agentExploreSteps.value[agentExploreSteps.value.length - 1];
    const iteration = Number(lastStep?.iteration || 0);
    return Number.isFinite(iteration) && iteration > 0
      ? Math.min(iteration, agentExploreMaxIterations.value)
      : 0;
  });
  const agentExploreProgress = computed(() => {
    const status = agentExploreRunStatus(options.agentExploreResult.value);
    const maxIterations = agentExploreMaxIterations.value;
    if (!options.agentExploreResult.value) {
      return {
        percent: options.busyKey.value === "knowledge:agent-explore" ? 4 : 0,
        label: options.busyKey.value === "knowledge:agent-explore" ? "准备检索" : "未开始",
      };
    }
    if (status === "completed") {
      return {
        percent: 100,
        label: `已完成 ${maxIterations} 轮上限`,
      };
    }
    const phase = String(
      agentExploreRunCoverage.value.activePhase ||
        agentExploreSteps.value[agentExploreSteps.value.length - 1]?.phase ||
        status ||
        "running",
    );
    const phaseWeight =
      phase === "model_calling"
        ? 0.15
        : phase === "tool_selected" || phase === "answer_ready"
          ? 0.38
          : phase === "tool_calling"
            ? 0.68
            : phase === "tool_result" || phase === "completed"
              ? 0.92
              : 0.08;
    const activeIteration = Math.max(1, agentExploreActiveIteration.value || 1);
    const percent = Math.max(
      4,
      Math.min(99, Math.round(((activeIteration - 1 + phaseWeight) / maxIterations) * 100)),
    );
    return {
      percent: status === "failed" ? Math.min(percent, 100) : percent,
      label: `第 ${activeIteration} / ${maxIterations} 轮 · ${agentExplorePhaseLabel(phase)}`,
    };
  });
  const agentExploreProgressVisible = computed(() => {
    if (agentExploreProgress.value.percent >= 100) {
      return false;
    }
    if (options.busyKey.value === "knowledge:agent-explore") {
      return true;
    }
    return ["queued", "running"].includes(agentExploreRunStatus(options.agentExploreResult.value));
  });
  const agentExploreEvidenceRefs = computed(() => options.agentExploreResult.value?.evidenceRefs || []);
  const agentExploreLinkedEvidenceRefs = computed(() =>
    uniqueEvidenceRefs([
      ...agentExploreEvidenceRefs.value,
      ...extractEvidenceRefsFromText(options.agentExploreResult.value?.answer || ""),
    ]),
  );
  const agentExploreAnswerHtml = computed(() =>
    markdownToSafeHtml(
      linkifyEvidenceRefsInMarkdown(
        options.agentExploreResult.value?.answer || "",
        agentExploreLinkedEvidenceRefs.value,
      ),
    ),
  );
  const agentExploreDocumentMarkdown = computed(() => {
    const result = options.agentExploreResult.value;
    const answer = String(result?.answer || "").trim();
    if (!answer) {
      return "";
    }
    const run = asRecord(result?.run) || {};
    const input = asRecord(run.input) || {};
    const runId = String(run.runId || "");
    const workspaceId = String(asRecord(result?.workspace)?.workspaceId || "");
    const query = String(input.query || options.agentExploreForm.value.query || "");
    const modelAlias = String(input.modelAlias || options.agentExploreForm.value.modelAlias || "");
    const contextProfileId = String(input.contextProfileId || options.agentExploreForm.value.contextProfileId || "");
    const updatedAt = String(run.completedAt || run.updatedAt || new Date().toISOString());
    const refs = agentExploreEvidenceRefs.value;
    const metaLines = [
      `- 问题：${query || "未记录"}`,
      `- 模型：${modelAlias || "未记录"}`,
      `- 上下文：${contextProfileId || "未记录"}`,
      `- 状态：${agentExploreRunStatus(result) || "unknown"}`,
      runId ? `- Run：${runId}` : "",
      workspaceId ? `- Workspace：${workspaceId}` : "",
      `- 生成时间：${formatMachineDate(updatedAt, "full")}`,
    ].filter(Boolean);
    const citationLines = refs.length
      ? refs.map((refId, index) => `${index + 1}. \`${refId}\``)
      : ["无"];
    return [
      "# 智能检索结果",
      "",
      ...metaLines,
      "",
      "## 结论",
      "",
      answer,
      "",
      "## 引用证据",
      "",
      ...citationLines,
      "",
    ].join("\n");
  });

  function agentExploreContextBuildRecordId() {
    return String(asRecord(options.agentExploreResult.value?.contextPack)?.contextBuildRecordId || "");
  }

  function agentExploreStepOpen(step: unknown) {
    const value = asRecord(step) || {};
    const status = agentExploreRunStatus(options.agentExploreResult.value);
    return (
      status === "running" &&
      Number(value.iteration || 0) === agentExploreActiveIteration.value
    );
  }

  function agentExploreEventTime(event: unknown) {
    const value = asRecord(event) || {};
    return formatCompactDate(String(value.createdAt || ""));
  }

  function currentAgentExploreQuery() {
    return String(agentExploreRunInput.value.query || options.agentExploreForm.value.query || "").trim();
  }

  function recordConsoleKnowledgeFeedback(action: string, context: Record<string, unknown> = {}) {
    const query = String(
      context.query ||
        currentAgentExploreQuery() ||
        options.infoFeedQuery() ||
        options.knowledgeSearchQuery() ||
        "",
    ).trim();
    const agentRunId = String(asRecord(options.agentExploreResult.value?.run)?.runId || "");
    void bridge.recordKnowledgeFeedback({
      clientId: "server-console-ui",
      query,
      action,
      itemId: String(context.itemId || agentRunId || options.infoFeedRunId() || ""),
      evidenceId: String(context.evidenceId || ""),
      resultRank: Number(context.resultRank || 0),
      createdAt: new Date().toISOString(),
      context: {
        source: "server_console",
        ...context,
      },
    }).catch(() => {
      // Feedback must not block user actions.
    });
  }

  async function copyAgentExploreDocument() {
    const content = agentExploreDocumentMarkdown.value.trim();
    if (!content) {
      options.error.value = "暂无可复制的智能检索结果。";
      return;
    }
    try {
      await copyTextToClipboard(content);
      recordConsoleKnowledgeFeedback("copy", {
        surface: "agent_explore",
        query: currentAgentExploreQuery(),
        evidenceRefs: agentExploreEvidenceRefs.value,
        contextBuildRecordId: agentExploreContextBuildRecordId(),
      });
      options.error.value = "";
    } catch (nextError) {
      options.error.value = nextError instanceof Error ? nextError.message : "复制智能检索结果失败。";
    }
  }

  function exportAgentExploreDocument() {
    const content = agentExploreDocumentMarkdown.value.trim();
    if (!content) {
      options.error.value = "暂无可导出的智能检索结果。";
      return;
    }
    const query = String(agentExploreRunInput.value.query || options.agentExploreForm.value.query || "智能检索");
    const timestamp = formatMachineDate(new Date().toISOString(), "full").replace(/[: ]/g, "-");
    downloadTextFile(
      `${safeDownloadName(query, "agent-search")}-${timestamp}.md`,
      `${content}\n`,
      "text/markdown;charset=utf-8",
    );
    recordConsoleKnowledgeFeedback("export", {
      surface: "agent_explore",
      query,
      evidenceRefs: agentExploreEvidenceRefs.value,
      contextBuildRecordId: agentExploreContextBuildRecordId(),
    });
    options.error.value = "";
  }

  return {
    agentExploreActiveIteration,
    agentExploreAnswerHtml,
    agentExploreContextBuildRecordId,
    agentExploreDocumentMarkdown,
    agentExploreEventTime,
    agentExploreEvidenceRefs,
    agentExploreLinkedEvidenceRefs,
    agentExploreMaxIterations,
    agentExploreProgress,
    agentExploreProgressVisible,
    agentExploreRunCoverage,
    agentExploreRunInput,
    agentExploreStepOpen,
    agentExploreSteps,
    agentExploreWorkspaceId,
    copyAgentExploreDocument,
    currentAgentExploreQuery,
    exportAgentExploreDocument,
    recordConsoleKnowledgeFeedback,
  };
}
