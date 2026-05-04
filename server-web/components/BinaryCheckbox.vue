<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: boolean;
  label: string;
  disabled?: boolean;
}>(), {
  disabled: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  change: [value: boolean];
}>();

function toggle() {
  if (props.disabled) {
    return;
  }
  const nextValue = !props.modelValue;
  emit("update:modelValue", nextValue);
  emit("change", nextValue);
}
</script>

<template>
  <button
    class="binary-checkbox"
    type="button"
    role="checkbox"
    :aria-checked="modelValue"
    :data-checked="modelValue"
    :disabled="disabled"
    @click="toggle"
  >
    <span class="binary-checkbox-icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" focusable="false">
        <path d="M3.3 8.2 6.5 11.3 12.8 4.8" />
      </svg>
    </span>
    <span class="binary-checkbox-spacer" aria-hidden="true"></span>
    <span class="binary-checkbox-label">{{ label }}</span>
  </button>
</template>

<style scoped>
.binary-checkbox {
  --binary-checkbox-icon-size: 16px;
  display: inline-flex;
  width: fit-content;
  min-width: max-content;
  align-items: center;
  justify-content: center;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary, #111827);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease;
}

.binary-checkbox[data-checked="true"] {
  border-color: transparent;
  background: transparent;
  color: var(--brand, #2563eb);
}

.binary-checkbox:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.binary-checkbox:hover:not(:disabled),
.binary-checkbox:focus-visible {
  border-color: rgba(37, 99, 235, 0.32);
  background: #eff6ff;
  box-shadow: inset 0 0 0 999px rgba(37, 99, 235, 0.02);
  color: var(--brand, #2563eb);
  outline: none;
}

.binary-checkbox-icon {
  display: inline-grid;
  width: var(--binary-checkbox-icon-size);
  height: var(--binary-checkbox-icon-size);
  flex: 0 0 var(--binary-checkbox-icon-size);
  place-items: center;
  border: 1px solid currentColor;
  border-radius: 4px;
}

.binary-checkbox[data-checked="true"] .binary-checkbox-icon {
  border-color: var(--brand, #2563eb);
  background: var(--brand, #2563eb);
  color: #fff;
}

.binary-checkbox-icon svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.1;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0;
}

.binary-checkbox[data-checked="true"] .binary-checkbox-icon svg {
  opacity: 1;
}

.binary-checkbox-spacer {
  display: inline-block;
  width: 1em;
  flex: 0 0 1em;
}

.binary-checkbox-label {
  min-width: 0;
}
</style>
