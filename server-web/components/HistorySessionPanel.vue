<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  items: Array<{
    id: string;
    label: string;
    sublabel?: string;
    active?: boolean;
  }>;
  title?: string;
  maxHeight?: string;
  open?: boolean;
}>();

const emit = defineEmits<{
  (e: "select", id: string): void;
  (e: "delete", id: string): void;
}>();

const resolvedTitle = computed(() => props.title || "历史记录");
const resolvedMaxHeight = computed(() => props.maxHeight || "235px");
</script>

<template>
  <details class="history-session-panel" :open="open">
    <summary>
      {{ resolvedTitle }}
      <small v-if="items.length">{{ items.length }}</small>
    </summary>

    <ul class="history-session-list" :style="{ maxHeight: resolvedMaxHeight }">
      <li
        v-for="item in items"
        :key="item.id"
        class="history-session-item"
        :data-active="item.active"
        @click="emit('select', item.id)"
      >
        <div class="history-session-main">
          <span class="history-session-label">{{ item.label }}</span>
          <span v-if="item.sublabel" class="history-session-sublabel">{{ item.sublabel }}</span>
        </div>
        <button
          v-if="$attrs['onDelete'] !== undefined"
          class="history-session-delete"
          type="button"
          :aria-label="`删除 ${item.label}`"
          @click.stop="emit('delete', item.id)"
        >×</button>
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

.history-session-delete {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: var(--space-1);
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-base);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-std),
              color var(--dur-fast) var(--ease-std);
}

.history-session-delete:hover {
  background: var(--danger-surface);
  color: var(--danger);
}

.history-session-empty {
  padding: var(--space-3) var(--space-2-5);
  font-size: var(--text-sm);
  color: var(--text-muted);
  text-align: center;
}
</style>
