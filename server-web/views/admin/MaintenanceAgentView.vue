<script setup lang="ts">
import { useConsole } from '../../composables/useConsole';
import AgentModelOptionBar from '../../components/AgentModelOptionBar.vue';
import ConfigFoldCard from '../../components/ConfigFoldCard.vue';
import OptionBar from '../../components/OptionBar.vue';
import StatusPill from '../../components/StatusPill.vue';
const {
  adminView,
  agentSelectorOptions,
  approveMaintenanceAgentRun,
  autoApproveRiskOptionBarOptions,
  busyKey,
  canAdminMaintenanceAgent,
  canApproveMaintenanceAgent,
  canRunMaintenanceAgent,
  cancelMaintenanceAgentRun,
  chatMaintenanceAgent,
  currentAgentModelOptionLabel,
  currentView,
  displayedMaintenanceAgentRuns,
  enabledBooleanOptionBarOptions,
  error,
  formatCompactDate,
  hasFeature,
  isAuthenticated,
  jsonPreview,
  latestMaintenanceAgentRun,
  maintenanceAgentConfig,
  maintenanceAgentMessage,
  maintenanceAgentModelAlias,
  maintenanceAgentResultJson,
  maintenanceAgentRiskLabel,
  maintenanceAgentRunbook,
  maintenanceAgentRunbookOptionBarOptions,
  maintenanceAgentRunbooks,
  maintenanceAgentStatusLabel,
  maintenanceAgentStatusTone,
  maintenanceAgentSummary,
  nextMaintenanceAgentRunAt,
  pendingMaintenanceApprovalCount,
  plannerModeOptionBarOptions,
  refreshMaintenanceAgent,
  runMaintenanceAgentKnowledgeMaintenance,
  runMaintenanceAgentRunbook,
  saveMaintenanceAgentConfig,
  selectedMaintenanceAgentRun,
} = useConsole();
</script>

<template>
          <section class="maintenance-agent-layout">
            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>智能巡检</h3>
                </div>
                <div class="section-tags">
                  <span>{{ maintenanceAgentConfig?.enabled ? "已启用" : "未启用" }}</span>
                  <span>待审批 {{ pendingMaintenanceApprovalCount }}</span>
                  <span>下次 {{ formatCompactDate(nextMaintenanceAgentRunAt) }}</span>
                </div>
              </div>
              <div class="detail-metrics knowledge-metrics">
                <div>
                  <span>最近运行</span>
                  <strong>{{ latestMaintenanceAgentRun ? maintenanceAgentStatusLabel(latestMaintenanceAgentRun.status) : "无" }}</strong>
                </div>
                <div>
                  <span>风险</span>
                  <strong>{{ latestMaintenanceAgentRun ? maintenanceAgentRiskLabel(latestMaintenanceAgentRun.risk) : "无" }}</strong>
                </div>
                <div>
                  <span>Runbook</span>
                  <strong>{{ maintenanceAgentRunbooks.length }}</strong>
                </div>
                <div>
                  <span>工具</span>
                  <strong>{{ maintenanceAgentSummary?.tools.length || 0 }}</strong>
                </div>
              </div>
              <div class="source-actions">
                <button
                  class="tool-button"
                  type="button"
                  :disabled="busyKey === 'maintenance-agent:refresh'"
                  @click="refreshMaintenanceAgent"
                >
                  {{ busyKey === "maintenance-agent:refresh" ? "刷新中" : "刷新" }}
                </button>
              </div>
            </article>

            <article v-if="maintenanceAgentConfig" class="surface-card">
              <div class="section-header">
                <div>
                  <h3>调度策略</h3>
                </div>
              </div>
              <div class="form-grid compact-form-grid">
                <OptionBar
                  v-model="maintenanceAgentConfig.enabled"
                  label="启用"
                  :options="enabledBooleanOptionBarOptions"
                />
                <OptionBar
                  v-model="maintenanceAgentConfig.plannerMode"
                  label="Planner"
                  :options="plannerModeOptionBarOptions"
                />
                <OptionBar
                  v-model="maintenanceAgentConfig.autoApproveRisk"
                  label="自动批准"
                  :options="autoApproveRiskOptionBarOptions"
                />
                <label>
                  <span>Tick 秒</span>
                  <input v-model.number="maintenanceAgentConfig.scheduler.tickSeconds" type="number" min="1" max="3600" />
                </label>
              </div>
              <div class="job-table compact-job-table maintenance-schedule-table">
                <div class="job-table-header">
                  <span>计划</span>
                  <span>间隔</span>
                  <span>状态</span>
                </div>
                <div
                  v-for="schedule in maintenanceAgentConfig.schedules"
                  :key="schedule.id"
                  class="job-row"
                >
                  <span>
                    <strong>{{ schedule.label }}</strong>
                    <small>{{ schedule.runbook }} / {{ formatCompactDate(schedule.nextRunAt) }}</small>
                  </span>
                  <input v-model.number="schedule.intervalMinutes" type="number" min="1" max="525600" />
                  <button
                    class="table-action"
                    type="button"
                    @click="schedule.enabled = !schedule.enabled"
                  >
                    {{ schedule.enabled ? "停用" : "启用" }}
                  </button>
                </div>
              </div>
              <div class="source-actions maintenance-agent-policy-actions">
                <button
                  class="primary-action"
                  type="button"
                  :disabled="!canAdminMaintenanceAgent || busyKey === 'maintenance-agent:config'"
                  @click="saveMaintenanceAgentConfig"
                >
                  {{ busyKey === "maintenance-agent:config" ? "保存中" : "保存策略" }}
                </button>
              </div>
            </article>

            <article class="surface-card maintenance-agent-grid">
              <section class="module-panel">
                <div class="module-panel-heading">
                  <strong>对话入口</strong>
                  <span>{{ maintenanceAgentConfig?.plannerMode || "fixed_runbook" }} · {{ currentAgentModelOptionLabel(maintenanceAgentModelAlias) || "默认智能体" }}</span>
                </div>
                <AgentModelOptionBar
                  v-model="maintenanceAgentModelAlias"
                  class="module-field"
	                  label="巡检智能体"
	                  include-empty
	                  :options="agentSelectorOptions"
	                />
                <label class="json-editor">
                  <span>指令</span>
                  <textarea v-model="maintenanceAgentMessage" rows="4" />
                </label>
                <button
                  class="tool-button"
                  type="button"
                  :disabled="!canRunMaintenanceAgent || busyKey === 'maintenance-agent:chat'"
                  @click="chatMaintenanceAgent"
                >
                  {{ busyKey === "maintenance-agent:chat" ? "执行中" : "发送" }}
                </button>
              </section>

              <section class="module-panel">
                <div class="module-panel-heading">
                  <strong>Runbook</strong>
                  <span>{{ maintenanceAgentRunbooks.length }}</span>
                </div>
                <OptionBar
                  v-model="maintenanceAgentRunbook"
                  class="module-field"
                  label="选择"
                  :options="maintenanceAgentRunbookOptionBarOptions"
                />
                <button
                  class="tool-button"
                  type="button"
                  :disabled="!canRunMaintenanceAgent || busyKey === 'maintenance-agent:run'"
                  @click="runMaintenanceAgentRunbook"
                >
                  {{ busyKey === "maintenance-agent:run" ? "执行中" : "运行" }}
                </button>
                <div class="maintenance-agent-quick-actions">
                  <button
                    class="tool-button tool-button-ghost"
                    type="button"
                    :disabled="!canRunMaintenanceAgent || busyKey === 'maintenance-agent:run'"
                    @click="runMaintenanceAgentKnowledgeMaintenance"
                  >
                    知识库维护巡检
                  </button>
                  <small class="field-hint">
                    知识库维护任务已收敛到智能巡检，运行后进入记录、审批和审计链路。
                  </small>
                </div>
              </section>
            </article>

            <article class="surface-card">
              <div class="section-header">
                <div>
                  <h3>运行记录</h3>
                </div>
              </div>
              <div class="job-table compact-job-table maintenance-run-table">
                <div class="job-table-header">
                  <span>运行</span>
                  <span>状态</span>
                  <span>操作</span>
                </div>
                <div
                  v-for="run in displayedMaintenanceAgentRuns"
                  :key="run.runId"
                  class="job-row"
                >
                  <button
                    class="table-action text-action"
                    type="button"
                    @click="selectedMaintenanceAgentRun = run"
                  >
                    {{ run.intent }} / {{ formatCompactDate(run.updatedAt) }}
                  </button>
                  <StatusPill
                    :tone="maintenanceAgentStatusTone(run.status)"
                    :label="`${maintenanceAgentStatusLabel(run.status)} / ${maintenanceAgentRiskLabel(run.risk)}`"
                  />
                  <span class="table-actions-inline">
                    <button
                      v-if="run.status === 'awaiting_approval'"
                      class="table-action"
                      type="button"
                      :disabled="!canApproveMaintenanceAgent || busyKey === `maintenance-agent:approve:${run.runId}`"
                      @click="approveMaintenanceAgentRun(run)"
                    >
                      批准
                    </button>
                    <button
                      v-if="!['completed', 'completed_with_errors', 'failed', 'cancelled', 'rejected'].includes(run.status)"
                      class="table-action danger-action"
                      type="button"
                      :disabled="!canRunMaintenanceAgent || busyKey === `maintenance-agent:cancel:${run.runId}`"
                      @click="cancelMaintenanceAgentRun(run)"
                    >
                      取消
                    </button>
                  </span>
                </div>
              </div>
              <div v-if="displayedMaintenanceAgentRuns.length === 0" class="empty-state">
                <strong>暂无维护运行</strong>
              </div>
            </article>

            <article v-if="selectedMaintenanceAgentRun" class="surface-card">
              <div class="section-header">
                <div>
                  <h3>{{ selectedMaintenanceAgentRun.summary }}</h3>
                </div>
                <div class="section-tags">
                  <span>{{ selectedMaintenanceAgentRun.planHash.slice(0, 12) }}</span>
                  <span>{{ selectedMaintenanceAgentRun.source }}</span>
                </div>
              </div>
              <div class="maintenance-agent-step-list">
                <section
                  v-for="step in selectedMaintenanceAgentRun.steps"
                  :key="step.stepId"
                  class="module-panel"
                >
                  <div class="module-panel-heading">
                    <strong>{{ step.toolId }}</strong>
                    <span>{{ maintenanceAgentStatusLabel(step.status) }} / {{ maintenanceAgentRiskLabel(step.risk) }}</span>
                  </div>
                  <p class="module-note">{{ step.reason }}</p>
                  <pre v-if="step.output">{{ jsonPreview(step.output) }}</pre>
                  <p v-if="step.error" class="module-note danger-text">{{ step.error }}</p>
                </section>
              </div>
              <section v-if="maintenanceAgentResultJson" class="markdown-preview">
                <h4>最近输出</h4>
                <pre>{{ maintenanceAgentResultJson }}</pre>
              </section>
            </article>
          </section>
</template>
