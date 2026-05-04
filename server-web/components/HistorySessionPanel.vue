<script setup lang="ts">
type HistorySessionPanelItem = {
  id: string;
  title: string;
  meta?: string;
  preview?: string;
  active?: boolean;
  disabled?: boolean;
  deleteLabel?: string;
};

withDefaults(defineProps<{
  title?: string;
  subtitle?: string;
  items: HistorySessionPanelItem[];
}>(), {
  title: "历史会话",
  subtitle: "",
});

const emit = defineEmits<{
  select: [id: string];
  delete: [id: string];
}>();

function selectItem(item: HistorySessionPanelItem) {
  if (!item.disabled) {
    emit("select", item.id);
  }
}

function deleteItem(item: HistorySessionPanelItem) {
  if (!item.disabled) {
    emit("delete", item.id);
  }
}
</script>

<template>
  <details v-if="items.length" class="history-session-panel">
    <summary>
      <span>{{ title }}</span>
      <small>{{ subtitle || `${items.length} 条，滚动查看` }}</small>
    </summary>
    <div class="history-session-list">
      <article
        v-for="item in items"
        :key="item.id"
        class="history-session-item"
        :data-active="item.active"
      >
        <button
          class="history-session-main"
          type="button"
          :disabled="item.disabled"
          @click="selectItem(item)"
        >
          <strong>{{ item.title }}</strong>
          <span v-if="item.meta">{{ item.meta }}</span>
          <small v-if="item.preview">{{ item.preview }}</small>
        </button>
        <button
          class="history-session-delete"
          type="button"
          title="删除历史会话"
          :aria-label="item.deleteLabel || `删除历史会话 ${item.title}`"
          :disabled="item.disabled"
          @click.stop="deleteItem(item)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M6 6l1 15h10l1-15" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      </article>
    </div>
  </details>
</template>

<style scoped>
.history-session-panel {
  --history-session-list-gap: 8px;
  --history-session-list-inset: 4px;
  padding: 8px;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  background: #f8fbff;
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.04);
  transition:
    background 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.history-session-panel:not([open]) {
  background: linear-gradient(180deg, #eff6ff 0%, #f8fbff 100%);
  box-shadow:
    inset 0 0 0 1px rgba(37, 99, 235, 0.08),
    0 1px 3px rgba(15, 23, 42, 0.06);
}

.history-session-panel:hover {
  border-color: #93c5fd;
  box-shadow:
    inset 0 0 0 1px rgba(37, 99, 235, 0.1),
    0 2px 7px rgba(15, 23, 42, 0.08);
}

.history-session-panel > summary {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--brand, #2563eb);
  font-weight: 700;
  list-style: none;
  user-select: none;
}

.history-session-panel > summary::-webkit-details-marker {
  display: none;
}

.history-session-panel > summary::marker {
  content: "";
}

.history-session-panel > summary::before {
  content: "▸";
  display: inline-grid;
  width: 14px;
  margin-right: 6px;
  place-items: center;
  color: var(--brand, #2563eb);
  font-size: 0.78rem;
  transition: transform 160ms ease;
}

.history-session-panel[open] > summary::before {
  transform: rotate(90deg);
}

.history-session-panel > summary small {
  margin-left: auto;
  color: var(--text-secondary, #4b5563);
  font-size: 0.78rem;
  font-weight: 600;
}

.history-session-list {
  display: grid;
  gap: var(--history-session-list-gap);
  margin-top: 10px;
  max-height: 235px;
  overflow-y: auto;
  padding: 0 var(--history-session-list-inset) var(--history-session-list-inset);
  scrollbar-gutter: stable;
}

.history-session-item {
  position: relative;
  min-width: 0;
  border: 1px solid var(--border-subtle, #d1d5db);
  border-radius: 8px;
  background: #fff;
}

.history-session-item[data-active="true"] {
  border-color: var(--brand, #2563eb);
  background: #edf5ff;
}

.history-session-main {
  display: grid;
  gap: 3px;
  min-width: 0;
  width: 100%;
  padding: 9px 42px 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary, #111827);
  text-align: left;
  cursor: pointer;
}

.history-session-main:disabled,
.history-session-delete:disabled {
  cursor: wait;
  opacity: 0.62;
}

.history-session-main strong,
.history-session-main span,
.history-session-main small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-session-main span,
.history-session-main small {
  color: var(--text-secondary, #4b5563);
  font-size: 0.78rem;
  padding: 0;
}

.history-session-delete {
  position: absolute;
  top: 6px;
  right: 6px;
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary, #4b5563);
  cursor: pointer;
}

.history-session-delete:hover:not(:disabled),
.history-session-delete:focus-visible:not(:disabled) {
  border-color: #fecaca;
  background: #fef2f2;
  color: #dc2626;
  outline: none;
}

.history-session-delete svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
