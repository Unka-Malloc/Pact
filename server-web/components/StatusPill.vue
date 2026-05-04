<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{
  label: string | number;
  tone?: string;
  enabled?: boolean | null;
  showDot?: boolean;
  ariaLabel?: string;
}>(), {
  tone: "",
  enabled: null,
  showDot: true,
  ariaLabel: "",
});

const normalizedTone = computed(() => {
  const tone = String(props.tone || "").trim();
  if (tone) {
    return tone;
  }
  if (props.enabled === true) {
    return "success";
  }
  if (props.enabled === false) {
    return "neutral";
  }
  return "neutral";
});

const displayLabel = computed(() => String(props.label ?? ""));
const accessibleLabel = computed(() => props.ariaLabel || displayLabel.value);
</script>

<template>
  <span
    class="standard-status-pill status-pill"
    :data-tone="normalizedTone"
    :data-enabled="enabled === null ? undefined : enabled"
    :aria-label="accessibleLabel"
  >
    <span v-if="showDot" class="standard-status-pill-dot" aria-hidden="true" />
    <span class="standard-status-pill-label">{{ displayLabel }}</span>
  </span>
</template>

<style scoped>
.standard-status-pill {
  --status-pill-border: var(--border-subtle);
  --status-pill-bg: var(--bg-surface);
  --status-pill-color: var(--text-secondary);
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  min-height: 24px;
  max-width: 100%;
  padding: 0 9px;
  border: 1px solid var(--status-pill-border);
  border-radius: 999px;
  background: var(--status-pill-bg);
  color: var(--status-pill-color);
  font-size: 0.76rem;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

.standard-status-pill[data-tone="queued"],
.standard-status-pill[data-tone="warning"] {
  --status-pill-border: var(--warning);
  --status-pill-bg: var(--warning-surface);
  --status-pill-color: var(--warning-text);
}

.standard-status-pill[data-tone="running"],
.standard-status-pill[data-tone="info"] {
  --status-pill-border: var(--info);
  --status-pill-bg: var(--info-surface);
  --status-pill-color: var(--info);
}

.standard-status-pill[data-tone="completed"],
.standard-status-pill[data-tone="success"] {
  --status-pill-border: var(--success);
  --status-pill-bg: var(--success-surface);
  --status-pill-color: var(--success);
}

.standard-status-pill[data-tone="failed"],
.standard-status-pill[data-tone="danger"],
.standard-status-pill[data-tone="high"] {
  --status-pill-border: var(--danger);
  --status-pill-bg: var(--danger-surface);
  --status-pill-color: var(--danger);
}

.standard-status-pill[data-tone="muted"],
.standard-status-pill[data-tone="neutral"],
.standard-status-pill[data-tone="medium"],
.standard-status-pill[data-tone="low"] {
  --status-pill-border: var(--border-subtle);
  --status-pill-bg: var(--bg-subtle);
  --status-pill-color: var(--text-secondary);
}

.standard-status-pill-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: currentColor;
}

.standard-status-pill-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
