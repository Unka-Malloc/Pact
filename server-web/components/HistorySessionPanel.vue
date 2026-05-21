<script setup lang="ts">
import { computed } from "vue";
import type { HistorySessionPanelItem } from "../types/app";

const props = defineProps<{
  items: Array<HistorySessionPanelItem & { label?: string; sublabel?: string }>;
  title?: string;
  subtitle?: string;
  maxHeight?: string;
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "select", id: string): void;
  (e: "action", id: string): void;
  (e: "delete", id: string): void;
}>();

const resolvedTitle = computed(() => props.title || "历史记录");
const resolvedMaxHeight = computed(() => props.maxHeight || "235px");

function itemTitle(item: HistorySessionPanelItem & { label?: string }) {
  return item.title || item.label || item.id;
}

function itemMeta(item: HistorySessionPanelItem & { sublabel?: string }) {
  return item.meta || item.sublabel || "";
}

function selectItem(item: HistorySessionPanelItem) {
  if (item.disabled) {
    return;
  }
  emit("select", item.id);
}

function runItemAction(item: HistorySessionPanelItem) {
  if (item.disabled || item.actionDisabled) {
    return;
  }
  emit("action", item.id);
}
</script>

<template>
  <details class="history-session-panel" :open="open">
    <summary>
      {{ resolvedTitle }}
      <small>{{ subtitle || (items.length ? String(items.length) : "") }}</small>
    </summary>

    <ul class="history-session-list" :style="{ maxHeight: resolvedMaxHeight }">
      <li
        v-for="item in items"
        :key="item.id"
        class="history-session-item"
        :data-active="item.active"
        :data-disabled="item.disabled"
        @click="selectItem(item)"
      >
        <div class="history-session-main">
          <span class="history-session-label">{{ itemTitle(item) }}</span>
          <span v-if="itemMeta(item)" class="history-session-sublabel">{{ itemMeta(item) }}</span>
          <span v-if="item.preview" class="history-session-preview">{{ item.preview }}</span>
        </div>
        <button
          v-if="item.actionLabel"
          class="history-session-action"
          type="button"
          :disabled="item.disabled || item.actionDisabled"
          :aria-label="item.actionAriaLabel || item.actionLabel"
          @click.stop="runItemAction(item)"
        >{{ item.actionLabel }}</button>
        <button
          v-if="$attrs['onDelete'] !== undefined"
          class="history-session-delete"
          type="button"
          :disabled="item.disabled"
          :aria-label="item.deleteLabel || `删除 ${itemTitle(item)}`"
          :title="item.deleteLabel || `删除 ${itemTitle(item)}`"
          @click.stop="emit('delete', item.id)"
        >{{ item.deleteText || "删除" }}</button>
      </li>
      <li v-if="!items.length" class="history-session-empty">
        暂无历史记录
      </li>
    </ul>
  </details>
</template>

<style scoped>
.history-session-panel {
  padding: var(--space-2);
  border: 1px solid var(--info-border);
  border-radius: var(--radius-md);
  background: var(--info-surface);
  box-shadow: inset 0 0 0 1px rgba(88, 166, 255, 0.06);
  transition:
    background var(--dur-base) var(--ease-std),
    border-color var(--dur-base) var(--ease-std);
}

.history-session-panel:not([open]) {
  background: var(--brand-subtle);
  box-shadow:
    inset 0 0 0 1px rgba(88, 166, 255, 0.10),
    var(--shadow-xs);
}

.history-session-panel:hover {
  border-color: var(--brand);
  box-shadow:
    inset 0 0 0 1px rgba(88, 166, 255, 0.16),
    var(--shadow-sm);
}

.history-session-panel > summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 34px;
  padding: 0 var(--space-2-5);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--brand);
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  list-style: none;
  user-select: none;
}

.history-session-panel > summary::-webkit-details-marker { display: none; }
.history-session-panel > summary::marker { content: ""; }

.history-session-panel > summary::before {
  content: "▸";
  display: inline-grid;
  width: 14px;
  place-items: center;
  color: var(--brand);
  font-size: var(--text-xs);
  transition: transform var(--dur-base) var(--ease-std);
}

.history-session-panel[open] > summary::before {
  transform: rotate(90deg);
}

.history-session-panel > summary small {
  margin-left: auto;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
}

.history-session-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-top: var(--space-1-5);
  overflow-y: auto;
  padding: 0 var(--space-1) var(--space-1);
  list-style: none;
  scrollbar-gutter: stable;
}

.history-session-item {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  cursor: pointer;
  transition:
    background var(--dur-fast) var(--ease-std),
    border-color var(--dur-fast) var(--ease-std);
}

.history-session-item:hover {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
}

.history-session-item[data-active="true"] {
  border-color: var(--brand);
  background: var(--brand-subtle);
}

.history-session-item[data-disabled="true"] {
  opacity: 0.62;
  cursor: progress;
}

.history-session-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
  padding: var(--space-1-5) var(--space-2-5);
}

.history-session-label {
  font-size: var(--text-base);
  font-weight: var(--font-medium);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-session-sublabel {
  font-size: var(--text-xs);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-session-preview {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-session-delete {
  flex-shrink: 0;
  min-width: 64px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: var(--space-1);
  padding: 0 var(--space-1-5);
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease-std),
              color var(--dur-fast) var(--ease-std);
}

.history-session-action {
  flex-shrink: 0;
  max-width: 76px;
  min-width: 64px;
  height: 28px;
  margin-right: var(--space-1);
  padding: 0 var(--space-1-5);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--brand);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: background var(--dur-fast) var(--ease-std),
              border-color var(--dur-fast) var(--ease-std),
              color var(--dur-fast) var(--ease-std);
}

.history-session-action:hover {
  border-color: var(--brand);
  background: var(--brand-subtle);
  color: var(--brand-strong);
}

.history-session-action:disabled {
  cursor: progress;
  opacity: 0.55;
}

.history-session-delete:hover {
  background: var(--danger-surface);
  color: var(--danger);
}

.history-session-delete:disabled {
  cursor: progress;
  opacity: 0.55;
}

.history-session-empty {
  padding: var(--space-3) var(--space-2-5);
  font-size: var(--text-sm);
  color: var(--text-muted);
  text-align: center;
}
</style>
