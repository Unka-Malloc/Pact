<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{
  modelValue: boolean;
  onLabel?: string;
  offLabel?: string;
  ariaLabel?: string;
  disabled?: boolean;
}>(), {
  onLabel: "已开启",
  offLabel: "已关闭",
  ariaLabel: "",
  disabled: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  change: [value: boolean];
}>();

const currentLabel = computed(() => (props.modelValue ? props.onLabel : props.offLabel));
const accessibleLabel = computed(() => props.ariaLabel || currentLabel.value);

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
    class="feature-toggle"
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="accessibleLabel"
    :disabled="disabled"
    :data-enabled="modelValue"
    @click="toggle"
  >
    <span class="feature-toggle-track" aria-hidden="true">
      <span class="feature-toggle-knob" />
    </span>
  </button>
</template>

<style scoped>
.feature-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  line-height: 1;
  transition:
    background 140ms ease,
    color 140ms ease,
    opacity 140ms ease;
}

.feature-toggle:hover:not(:disabled),
.feature-toggle:focus-visible {
  background: transparent;
  color: var(--brand);
  outline: none;
}

.feature-toggle:focus-visible .feature-toggle-track,
.feature-toggle:hover:not(:disabled) .feature-toggle-track {
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
}

.feature-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.feature-toggle-track {
  width: 40px;
  height: 22px;
  padding: 2px;
  border-radius: 999px;
  background: #c6c6c6;
  transition: background 140ms ease;
}

.feature-toggle[data-enabled="true"] .feature-toggle-track {
  background: var(--success);
}

.feature-toggle-knob {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(22, 22, 22, 0.25);
  transform: translateX(0);
  transition: transform 140ms ease;
}

.feature-toggle[data-enabled="true"] .feature-toggle-knob {
  transform: translateX(18px);
}
</style>
