<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useConsole } from '../composables/useConsole';
import SegmentedToggle from '../components/SegmentedToggle.vue';

const {
  busyKey,
  fuseKnowledgeReview,
  knowledgeReviewCanResolveWithDocument,
  knowledgeReviewItems,
  knowledgeReviewReasonLabel,
  knowledgeReviewSimilarity,
  knowledgeReviewStatus,
  knowledgeReviewStatusLabel,
  knowledgeReviewTitle,
  knowledgeReviewTone,
  mcpAuthorizationRequests,
  mcpAuthorizationStatus,
  mcpAuthorizationStatusOptionBarOptions,
  refreshKnowledgeConflicts,
  refreshMcpAuthorizationRequests,
  resolveKnowledgeReview,
  resolveMcpAuthorizationRequest,
  selectedKnowledgeReviewFusionModel,
} = useConsole();

type ApprovalFlowCard =
  | {
      key: string;
      kind: 'authorization';
      tone: string;
      label: string;
      title: string;
      summary: string;
      meta: string[];
      request: (typeof mcpAuthorizationRequests.value)[number];
    }
  | {
      key: string;
      kind: 'review';
      tone: string;
      label: string;
      title: string;
      summary: string;
      meta: string[];
      review: (typeof knowledgeReviewItems.value)[number];
    };

function mcpAuthorizationStatusLabel(status: unknown) {
  if (status === 'pending') return '待审批';
  if (status === 'approved') return '已批准';
  if (status === 'rejected') return '已拒绝';
  return String(status || '未知状态');
}

function knowledgeReviewStatusFromApprovalStatus(status: string) {
  if (status === 'approved') return 'resolved';
  return status;
}

const approvalFlowStatus = computed({
  get: () => mcpAuthorizationStatus.value,
  set: (status: 'all' | 'pending' | 'approved' | 'rejected') => {
    mcpAuthorizationStatus.value = status;
    knowledgeReviewStatus.value = knowledgeReviewStatusFromApprovalStatus(status);
    refreshMcpAuthorizationRequests();
    refreshKnowledgeConflicts();
  },
});

const approvalFlowCards = computed<ApprovalFlowCard[]>(() => [
  ...mcpAuthorizationRequests.value.map((request) => ({
    key: `authorization:${request.requestId}`,
    kind: 'authorization' as const,
    tone: request.status === 'pending' ? 'warning' : request.status === 'approved' ? 'success' : 'danger',
    label: 'MCP 客户端授权',
    title: request.clientName || 'Unknown Client',
    summary: `用途说明：${request.reason || '无'}`,
    meta: [
      mcpAuthorizationStatusLabel(request.status),
      `工具 ${request.requestedTools?.length || 0} 个`,
      `权限域 ${request.requestedScopes?.length || 0} 个`,
    ],
    request,
  })),
  ...knowledgeReviewItems.value.map((review) => ({
    key: `review:${review.reviewId}`,
    kind: 'review' as const,
    tone: knowledgeReviewTone(review),
    label: '知识入库冲突',
    title: knowledgeReviewTitle(review),
    summary: review.summary || '系统检测到该记录需要人工确认。',
    meta: [
      knowledgeReviewStatusLabel(review.status),
      knowledgeReviewReasonLabel(review.reason),
      knowledgeReviewSimilarity(review).label,
    ],
    review,
  })),
]);

function refreshApprovalFlow() {
  mcpAuthorizationStatus.value = 'pending';
  knowledgeReviewStatus.value = 'pending';
  refreshMcpAuthorizationRequests();
  refreshKnowledgeConflicts();
}

onMounted(() => {
  refreshApprovalFlow();
});
</script>

<template>
  <section class="dashboard-view approval-flow-view">
    <article class="surface-card configuration-alert-card">
      <div class="section-header">
        <div>
          <h3>全平台审批流</h3>
          <p>统一处理需要人工决策的事项。</p>
        </div>
        <div class="source-actions">
          <SegmentedToggle
            v-model="approvalFlowStatus"
            :options="mcpAuthorizationStatusOptionBarOptions"
            aria-label="审批流状态"
            size="small"
          />
        </div>
      </div>

      <div class="approval-card-list">
        <article
          v-for="card in approvalFlowCards"
          :key="card.key"
          class="approval-request-card"
          :data-tone="card.tone"
        >
          <header class="approval-request-card-header">
            <div>
              <span class="approval-request-card-label">{{ card.label }}</span>
              <strong>{{ card.title }}</strong>
            </div>
            <div class="approval-request-card-meta">
              <span v-for="item in card.meta" :key="`${card.key}:${item}`">{{ item }}</span>
            </div>
          </header>
          <p>{{ card.summary }}</p>

          <div
            v-if="card.kind === 'authorization' && card.request.status === 'pending'"
            class="approval-request-card-actions"
          >
            <button
              class="configuration-alert-action"
              type="button"
              :disabled="busyKey === `mcp-authorization-requests:resolve:${card.request.requestId}`"
              @click="resolveMcpAuthorizationRequest(card.request.requestId, 'approved')"
            >
              批准
            </button>
            <button
              class="configuration-alert-action danger-action"
              type="button"
              :disabled="busyKey === `mcp-authorization-requests:resolve:${card.request.requestId}`"
              @click="resolveMcpAuthorizationRequest(card.request.requestId, 'rejected')"
            >
              拒绝
            </button>
          </div>

          <div
            v-else-if="card.kind === 'review' && card.review.status === 'pending'"
            class="approval-request-card-actions"
          >
            <template v-if="knowledgeReviewCanResolveWithDocument(card.review)">
              <button
                v-if="card.review.reason === 'source_path_content_conflict'"
                class="configuration-alert-action"
                type="button"
                :disabled="busyKey.startsWith(`knowledge:review:${card.review.reviewId}:`)"
                @click="resolveKnowledgeReview(card.review, 'replace')"
              >
                覆盖旧知识
              </button>
              <button
                class="configuration-alert-action"
                type="button"
                :disabled="knowledgeReviewSimilarity(card.review).disableKeepBoth || busyKey.startsWith(`knowledge:review:${card.review.reviewId}:`)"
                @click="resolveKnowledgeReview(card.review, 'keep_both')"
              >
                保留两者
              </button>
              <button
                class="configuration-alert-action"
                type="button"
                :disabled="busyKey.startsWith(`knowledge:review:${card.review.reviewId}:`) || !selectedKnowledgeReviewFusionModel.enabled"
                @click="fuseKnowledgeReview(card.review)"
              >
                知识融合
              </button>
            </template>
            <button
              v-else
              class="configuration-alert-action"
              type="button"
              :disabled="busyKey.startsWith(`knowledge:review:${card.review.reviewId}:`)"
              @click="resolveKnowledgeReview(card.review, 'accept')"
            >
              接受
            </button>
            <button
              class="configuration-alert-action danger-action"
              type="button"
              :disabled="busyKey.startsWith(`knowledge:review:${card.review.reviewId}:`)"
              @click="resolveKnowledgeReview(card.review, 'reject')"
            >
              放弃
            </button>
          </div>
        </article>

        <article v-if="approvalFlowCards.length === 0" class="approval-request-card approval-request-empty-card">
          <strong>没有待处理的授权请求</strong>
          <span>当前没有需要人工处理的审批事项。</span>
        </article>
      </div>
    </article>
  </section>
</template>
