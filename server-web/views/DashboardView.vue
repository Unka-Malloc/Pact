<script setup lang="ts">
import { useConsole } from '../composables/useConsole';
import {
  AgentModelOptionBar,
  ConfigFoldCard,
  OptionBar,
  StatusPill,
} from '../components/common';
const {
  busyKey,
  consoleState,
  currentView,
  dashboardAlertInboxId,
  dashboardAlertSummary,
  dashboardAlerts,
  dismissDashboardAlert,
  highlightedConfigTarget,
  isAuthenticated,
  jsonPreview,
  knowledgeConsole,
  openDashboardAlert,
  publishRuleAuthoringPackage,
  ruleActionOptionBarOptions,
  ruleAuthoringCanSubmit,
  ruleAuthoringDraftPayload,
  ruleAuthoringForm,
  ruleAuthoringManualSummary,
  ruleAuthoringModelOptions,
  ruleAuthoringResult,
  ruleAuthoringStatusLabel,
  ruleCreationMode,
  ruleMatchStrategyOptionBarOptions,
  ruleScopeOptionBarOptions,
  runRuleAuthoringChat,
  shortId,
} = useConsole();
</script>

<template>
  <section class="dashboard-view">
    <div class="metric-grid">
      <article class="metric-card">
        <div class="metric-card-header">
          <span>邮件 / 文档</span>
        </div>
        <h3>{{ (consoleState?.storage?.emailCount || 0).toLocaleString() }}</h3>
        <p>{{ (consoleState?.storage?.rawObjectCount || 0).toLocaleString() }} 个原始对象</p>
      </article>
      <article class="metric-card">
        <div class="metric-card-header">
          <span>知识事务</span>
          <StatusPill
            :tone="knowledgeConsole?.available ? 'success' : 'neutral'"
            :label="knowledgeConsole?.available ? '已启用' : '未启用'"
            :show-dot="false"
          />
        </div>
        <h3>{{ (consoleState?.storage?.transactionCount || 0).toLocaleString() }}</h3>
        <p>{{ (consoleState?.storage?.threadCount || 0).toLocaleString() }} 条线索</p>
      </article>
      <article class="metric-card">
        <div class="metric-card-header">
          <span>客户端设备</span>
          <StatusPill
            :tone="(consoleState?.clients?.summary?.totalCount || 0) > 0 ? 'success' : 'neutral'"
            :label="(consoleState?.clients?.summary?.totalCount || 0) > 0 ? '在线' : '无设备'"
            :show-dot="false"
          />
        </div>
        <h3>{{ consoleState?.clients?.summary?.totalCount || 0 }}</h3>
        <p>{{ consoleState?.discovery?.value?.mode || "active" }} 模式</p>
      </article>
      <article class="metric-card">
        <div class="metric-card-header">
          <span>工作队列</span>
          <StatusPill
            :tone="(consoleState?.jobs?.summary?.runningCount || 0) > 0 ? 'running' : 'neutral'"
            :label="(consoleState?.jobs?.summary?.runningCount || 0) > 0 ? `${consoleState?.jobs?.summary?.runningCount || 0} 运行中` : '空闲'"
            :show-dot="false"
          />
        </div>
        <h3>{{ (consoleState?.jobs?.summary?.queuedCount || 0) + (consoleState?.jobs?.summary?.runningCount || 0) }}</h3>
        <p>{{ (consoleState?.jobs?.summary?.completedCount || 0).toLocaleString() }} 已完成</p>
      </article>
    </div>
    <article class="surface-card configuration-alert-card">
      <div class="section-header">
        <div>
          <h3>报警</h3>
          <p>{{ dashboardAlertSummary }}</p>
        </div>
        <StatusPill
          :tone="dashboardAlerts.length ? 'warning' : 'success'"
          :label="dashboardAlerts.length ? `${dashboardAlerts.length} 项` : '已就绪'"
        />
      </div>
      <div v-if="dashboardAlerts.length" class="configuration-alert-list">
        <article
          v-for="alertItem in dashboardAlerts"
          :key="dashboardAlertInboxId(alertItem)"
          class="configuration-alert-item"
          :data-tone="alertItem.tone"
          :data-live="alertItem.live === false ? 'false' : 'true'"
        >
          <span class="configuration-alert-category">{{ alertItem.category }}</span>
          <strong>{{ alertItem.title }}</strong>
          <span>{{ alertItem.detail }}</span>
          <em>{{ alertItem.status }}</em>
          <div class="configuration-alert-actions">
            <button
              class="configuration-alert-action"
              type="button"
              :disabled="busyKey === `monitor-alert:ack:${alertItem.alertId}`"
              @click="openDashboardAlert(alertItem)"
            >
              {{ alertItem.source === "configuration" ? "去配置" : "查看报警" }}
            </button>
            <button
              class="configuration-alert-action danger-action"
              type="button"
              :disabled="busyKey === `monitor-alert:ack:${alertItem.alertId}`"
              @click="dismissDashboardAlert(alertItem)"
            >
              {{ busyKey === `monitor-alert:ack:${alertItem.alertId}` ? "确认中" : "确认关闭" }}
            </button>
          </div>
        </article>
      </div>
      <div v-else class="configuration-alert-empty">
        <strong>没有报警</strong>
        <span>空配置、中断和后台巡检当前都没有需要处理的事项。</span>
      </div>
    </article>
    <article class="surface-card rule-authoring-card">
      <div class="section-header">
        <div>
          <h3>创建规则</h3>
          <p>同一份规则草稿支持智能对话和人工配置两种创建方式，任一侧修改都会同步到另一侧。</p>
        </div>
        <div class="rule-creation-toggle" role="tablist" aria-label="创建规则方式">
          <button
            type="button"
            role="tab"
            :aria-selected="ruleCreationMode === 'chat'"
            :data-active="ruleCreationMode === 'chat'"
            @click="ruleCreationMode = 'chat'"
          >
            智能对话
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="ruleCreationMode === 'manual'"
            :data-active="ruleCreationMode === 'manual'"
            @click="ruleCreationMode = 'manual'"
          >
            人工配置
          </button>
        </div>
      </div>
      <form class="rule-authoring-form" :data-mode="ruleCreationMode" @submit.prevent="runRuleAuthoringChat">
        <template v-if="ruleCreationMode === 'chat'">
          <label class="full-row">
            <span>需求</span>
            <textarea
              v-model="ruleAuthoringForm.message"
              rows="4"
              placeholder="例如：生成一个黄金规则，完全一样的知识直接跳过"
            ></textarea>
          </label>
          <AgentModelOptionBar
            data-config-target="rule-authoring-agent"
            :data-config-highlighted="highlightedConfigTarget === 'rule-authoring-agent'"
            v-model="ruleAuthoringForm.modelAlias"
            label="智能体"
            placeholder="未分配智能体"
            :options="ruleAuthoringModelOptions"
          />
        </template>
        <template v-else>
          <label>
            <span>规则名称</span>
            <input
              v-model="ruleAuthoringForm.ruleName"
              type="text"
              placeholder="例如：重复知识处理规则"
            />
          </label>
          <OptionBar
            v-model="ruleAuthoringForm.scope"
            label="适用范围"
            :options="ruleScopeOptionBarOptions"
          />
          <OptionBar
            v-model="ruleAuthoringForm.matchStrategy"
            label="匹配方式"
            :options="ruleMatchStrategyOptionBarOptions"
          />
          <OptionBar
            v-model="ruleAuthoringForm.action"
            label="执行动作"
            :options="ruleActionOptionBarOptions"
          />
          <label>
            <span>最低置信度</span>
            <input
              v-model.number="ruleAuthoringForm.confidence"
              type="number"
              min="0"
              max="1"
              step="0.01"
            />
          </label>
          <label class="full-row">
            <span>补充说明</span>
            <textarea
              v-model="ruleAuthoringForm.notes"
              rows="3"
              placeholder="写清楚边界条件、例外情况或需要人工审核的场景"
            ></textarea>
          </label>
        </template>
        <button
          class="primary-action"
          type="submit"
          :disabled="busyKey === 'knowledge:rule-authoring' || !ruleAuthoringCanSubmit"
        >
          {{ busyKey === "knowledge:rule-authoring" ? "生成中" : (ruleCreationMode === "manual" ? "按配置创建规则" : "生成规则草稿") }}
        </button>
      </form>
      <div class="rule-authoring-sync-preview">
        <strong>同步草稿</strong>
        <span>{{ ruleAuthoringManualSummary }}</span>
        <div class="rule-authoring-config-label">机器可读配置</div>
        <pre>{{ jsonPreview(ruleAuthoringDraftPayload) }}</pre>
      </div>
      <div v-if="ruleAuthoringResult" class="rule-authoring-result">
        <div class="rule-authoring-status">
          <strong>{{ ruleAuthoringStatusLabel(ruleAuthoringResult.status) }}</strong>
          <span v-if="ruleAuthoringResult.runId">{{ shortId(ruleAuthoringResult.runId) }}</span>
        </div>
        <div class="rule-authoring-pipeline">
          <span
            v-for="(step, stepIndex) in ruleAuthoringResult.steps || []"
            :key="`${String(step.stage || 'stage')}:${stepIndex}`"
            :data-status="String(step.status || '')"
          >
            {{ step.stage }} · {{ step.status }}
          </span>
        </div>
        <div v-if="ruleAuthoringResult.confirmation" class="rule-authoring-confirm">
          <span>
            规则包 {{ ruleAuthoringResult.confirmation.packageId }} v{{ ruleAuthoringResult.confirmation.version }}
            已保存为草稿。
          </span>
          <button
            class="tool-button"
            type="button"
            :disabled="busyKey === 'knowledge:rule-authoring:publish'"
            @click="publishRuleAuthoringPackage"
          >
            {{ busyKey === "knowledge:rule-authoring:publish" ? "发布中" : "确认发布" }}
          </button>
        </div>
        <ConfigFoldCard title="门禁结果">
          <pre>{{ jsonPreview(ruleAuthoringResult.gate || {}) }}</pre>
        </ConfigFoldCard>
        <ConfigFoldCard title="生成的 JSON 规则包">
          <pre>{{ jsonPreview(ruleAuthoringResult.package || {}) }}</pre>
        </ConfigFoldCard>
      </div>
    </article>
  </section>
</template>
