<script setup lang="ts">
import type { KnowledgeSearchResult } from "../lib/types";

const props = defineProps<{
  item: KnowledgeSearchResult;
  tier?: "high" | "low" | "debug";
}>();

const emit = defineEmits<{
  open: [evidenceId: string];
}>();

function truncateText(value: unknown, maxLength = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

const evidenceId = () =>
  String(props.item.evidenceId || props.item.documentId || "").trim();

const localMirror = () =>
  props.item.localMirror && typeof props.item.localMirror === "object"
    ? props.item.localMirror
    : null;

const sourceLabel = () => {
  const mirror = localMirror();
  if (mirror?.providerId || mirror?.sourceType) {
    return [mirror.providerId, mirror.sourceType].filter(Boolean).join(" / ");
  }
  const source = props.item.source;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const record = source as Record<string, unknown>;
    return [record.providerId, record.sourceType].filter(Boolean).join(" / ");
  }
  return "";
};

function openEvidence() {
  const id = evidenceId();
  if (id) {
    emit("open", id);
  }
}
</script>

<template>
  <button
    class="info-feed-result-row"
    :data-tier="tier || undefined"
    :data-local-mirror="localMirror()?.matched ? 'true' : undefined"
    type="button"
    :disabled="!evidenceId()"
    @click="openEvidence"
  >
    <strong>
      {{ item.title || "未命名来源" }}
      <em v-if="localMirror()?.matched">本地 mirror</em>
    </strong>
    <span>{{ truncateText(item.snippet || "无片段", 180) }}</span>
    <small>
      {{ item.evidenceId || item.documentId || "无证据编号" }}
      <template v-if="item.score !== undefined"> · {{ Number(item.score).toFixed(3) }}</template>
      <template v-if="sourceLabel()"> · {{ sourceLabel() }}</template>
    </small>
  </button>
</template>
