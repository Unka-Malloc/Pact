<script setup lang="ts">
import { onMounted } from 'vue';
import { useConsole } from '../composables/useConsole';
import StatusPill from '../components/StatusPill.vue';
import SegmentedToggle from '../components/SegmentedToggle.vue';
import { watch } from 'vue';

const {
  busyKey,
  consoleState,
  dashboardAlertInboxId,
  dashboardAlertSummary,
  dashboardAlerts,
  dismissDashboardAlert,
  knowledgeConsole,
  openDashboardAlert,
  mcpAuthorizationRequests,
  mcpAuthorizationStatus,
  mcpAuthorizationStatusOptionBarOptions,
  fuseKnowledgeReview,
  knowledgeReviewCanResolveWithDocument,
  knowledgeReviewItems,
  knowledgeReviewReasonLabel,
  knowledgeReviewSimilarity,
  knowledgeReviewStatus,
  knowledgeReviewStatusLabel,
  knowledgeReviewStatusOptionBarOptions,
  knowledgeReviewTitle,
  knowledgeReviewTone,
  refreshMcpAuthorizationRequests,
  refreshKnowledgeConflicts,
  resolveKnowledgeReview,
  resolveMcpAuthorizationRequest,
  selectedKnowledgeReviewFusionModel,
} = useConsole();

watch(mcpAuthorizationStatus, () => {
  refreshMcpAuthorizationRequests();
});

watch(knowledgeReviewStatus, () => {
  refreshKnowledgeConflicts();
});

onMounted(() => {
  refreshMcpAuthorizationRequests();
  refreshKnowledgeConflicts();
});
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
    <article class="surface-card">
      <div class="section-header">
        <div>
          <h3>全平台审批流</h3>
          <p>统一处理 MCP 授权、知识入库冲突等需要人工决策的事项。</p>
        </div>
        <div class="source-actions">
          <SegmentedToggle
            v-model="mcpAuthorizationStatus"
            :options="mcpAuthorizationStatusOptionBarOptions"
            aria-label="MCP 授权请求状态"
            size="small"
          />
          <button
            class="tool-button"
            type="button"
            :disabled="busyKey === 'mcp-authorization-requests:refresh'"
            @click="refreshMcpAuthorizationRequests"
          >
            {{ busyKey === "mcp-authorization-requests:refresh" ? "刷新中" : "刷新授权" }}
          </button>
        </div>
      </div>

      <section class="approval-flow-section">
        <div class="section-header compact-section-header">
          <div>
            <h4>MCP 客户端授权</h4>
            <p>外部 MCP 客户端请求工具授权时，在这里统一批准或拒绝。</p>
          </div>
        </div>
      <div v-if="mcpAuthorizationRequests.length" class="configuration-alert-list">
        <article
          v-for="req in mcpAuthorizationRequests"
          :key="req.requestId"
          class="configuration-alert-item"
          data-tone="warning"
        >
          <span class="configuration-alert-category">MCP Request</span>
          <strong>{{ req.clientName || 'Unknown Client' }}</strong>
          <span>用途说明: {{ req.reason || '无' }}</span>
          <em>状态: {{ req.status === 'pending' ? '待审批' : req.status === 'approved' ? '已批准' : '已拒绝' }}</em>
          <em v-if="req.requestedTools?.length || req.requestedScopes?.length">
            请求 {{ req.requestedTools?.length || 0 }} 个工具, {{ req.requestedScopes?.length || 0 }} 个权限域
          </em>

          <div v-if="req.status === 'pending'" class="configuration-alert-actions">
            <button
              class="configuration-alert-action"
              type="button"
              :disabled="busyKey === `mcp-authorization-requests:resolve:${req.requestId}`"
              @click="resolveMcpAuthorizationRequest(req.requestId, 'approved')"
            >
              Approve (批准)
            </button>
            <button
              class="configuration-alert-action danger-action"
              type="button"
              :disabled="busyKey === `mcp-authorization-requests:resolve:${req.requestId}`"
              @click="resolveMcpAuthorizationRequest(req.requestId, 'rejected')"
            >
              Reject (拒绝)
            </button>
          </div>
        </article>
      </div>
      <div v-else class="configuration-alert-empty">
        <strong>没有待处理的授权请求</strong>
        <span>目前没有客户端发起新的 MCP 授权请求。</span>
      </div>
      </section>

      <section class="approval-flow-section">
        <div class="section-header compact-section-header">
          <div>
            <h4>知识入库冲突</h4>
            <p>知识录入发现重复来源、路径内容冲突或结构化版本冲突时，在工作台统一决策。</p>
          </div>
          <div class="source-actions">
            <SegmentedToggle
              v-model="knowledgeReviewStatus"
              :options="knowledgeReviewStatusOptionBarOptions"
              aria-label="知识冲突审批状态"
              size="small"
            />
            <button
              class="tool-button"
              type="button"
              :disabled="busyKey === 'knowledge:review-items'"
              @click="() => refreshKnowledgeConflicts()"
            >
              {{ busyKey === "knowledge:review-items" ? "刷新中" : "刷新冲突" }}
            </button>
          </div>
        </div>
        <div v-if="knowledgeReviewItems.length" class="configuration-alert-list">
          <article
            v-for="item in knowledgeReviewItems"
            :key="item.reviewId"
            class="configuration-alert-item"
            :data-tone="knowledgeReviewTone(item)"
          >
            <span class="configuration-alert-category">Knowledge Review</span>
            <strong>{{ knowledgeReviewTitle(item) }}</strong>
            <span>{{ item.summary || "系统检测到该知识录入需要人工确认。" }}</span>
            <em>
              {{ knowledgeReviewStatusLabel(item.status) }}
              · {{ knowledgeReviewReasonLabel(item.reason) }}
              · {{ knowledgeReviewSimilarity(item).label }}
            </em>
            <div v-if="item.status === 'pending'" class="configuration-alert-actions">
              <template v-if="knowledgeReviewCanResolveWithDocument(item)">
                <button
                  v-if="item.reason === 'source_path_content_conflict'"
                  class="configuration-alert-action"
                  type="button"
                  :disabled="busyKey.startsWith(`knowledge:review:${item.reviewId}:`)"
                  @click="resolveKnowledgeReview(item, 'replace')"
                >
                  覆盖旧知识
                </button>
                <button
                  class="configuration-alert-action"
                  type="button"
                  :disabled="knowledgeReviewSimilarity(item).disableKeepBoth || busyKey.startsWith(`knowledge:review:${item.reviewId}:`)"
                  @click="resolveKnowledgeReview(item, 'keep_both')"
                >
                  保留两者
                </button>
                <button
                  class="configuration-alert-action"
                  type="button"
                  :disabled="busyKey.startsWith(`knowledge:review:${item.reviewId}:`) || !selectedKnowledgeReviewFusionModel.enabled"
                  @click="fuseKnowledgeReview(item)"
                >
                  知识融合
                </button>
              </template>
              <button
                v-else
                class="configuration-alert-action"
                type="button"
                :disabled="busyKey.startsWith(`knowledge:review:${item.reviewId}:`)"
                @click="resolveKnowledgeReview(item, 'accept')"
              >
                接受
              </button>
              <button
                class="configuration-alert-action danger-action"
                type="button"
                :disabled="busyKey.startsWith(`knowledge:review:${item.reviewId}:`)"
                @click="resolveKnowledgeReview(item, 'reject')"
              >
                放弃
              </button>
            </div>
          </article>
        </div>
        <div v-else class="configuration-alert-empty">
          <strong>没有待处理的知识冲突</strong>
          <span>知识入库当前没有等待人工决策的记录。</span>
        </div>
      </section>
    </article>
  </section>
</template>
