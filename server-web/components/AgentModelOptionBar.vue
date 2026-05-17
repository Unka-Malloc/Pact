<script setup lang="ts">
import { computed } from "vue";

defineOptions({ name: "AgentModelOptionBar" });

type AgentOptionValue = string | number | boolean;

type AgentOption = {
  agentUid?: string;
  value?: AgentOptionValue;
  label?: string;
  selectable?: boolean;
  enabled?: boolean;
  disabled?: boolean;
  reason?: string;
  disabledReason?: string;
  status?: string;
};

const props = withDefaults(defineProps<{
  modelValue?: AgentOptionValue;
  options: AgentOption[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  includeEmpty?: boolean;
  emptyLabel?: string;
  showDisabledReason?: boolean;
  filterable?: boolean;
  teleported?: boolean;
  persistent?: boolean;
  popperClass?: string;
  clearable?: boolean;
  size?: string;
}>(), {
  modelValue: "",
  label: "",
  placeholder: "未选择智能体",
  disabled: false,
  includeEmpty: false,
  emptyLabel: "未分配智能体",
  showDisabledReason: true,
  filterable: false,
  teleported: true,
  persistent: false,
  popperClass: "",
  clearable: false,
  size: "default",
});

const emit = defineEmits<{
  "update:modelValue": [value: AgentOptionValue];
  change: [value: AgentOptionValue];
}>();

function normalizedValue(option: AgentOption) {
  return option.agentUid ?? option.value ?? "";
}

function optionDisabled(option: AgentOption) {
  return option.disabled === true || option.selectable === false || option.enabled === false;
}

function normalizedLabel(option: AgentOption) {
  const label = String(option.label || normalizedValue(option) || "").trim();
  if (!props.showDisabledReason || !optionDisabled(option)) {
    return label;
  }
  const reason = String(option.reason || option.disabledReason || "").trim();
  return reason ? `${label}（${reason}）` : `${label}（不可用）`;
}

const selectOptions = computed(() => {
  const seen = new Set<string>();
  return props.options
    .map((option) => ({
      value: normalizedValue(option),
      label: normalizedLabel(option),
      disabled: optionDisabled(option),
    }))
    .filter((option) => {
      const key = String(option.value || "").trim();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
});

function emitValue(value: AgentOptionValue) {
  emit("update:modelValue", value);
  emit("change", value);
}

function handleChange(event: Event) {
  emitValue((event.target as HTMLSelectElement | null)?.value || "");
}
</script>

<template>
  <label
    class="agent-option-bar"
    :data-has-label="Boolean(label)"
    :data-size="size"
    :data-disabled="disabled"
  >
    <span v-if="label" class="agent-option-label">{{ label }}</span>
    <span class="agent-option-shell">
      <select
        class="agent-option-select"
        :value="String(modelValue ?? '')"
        :disabled="disabled"
        @change="handleChange"
      >
        <option v-if="includeEmpty" value="">{{ emptyLabel }}</option>
        <option v-else-if="!modelValue" value="" disabled>{{ placeholder }}</option>
        <option
          v-for="option in selectOptions"
          :key="String(option.value)"
          :value="String(option.value)"
          :disabled="option.disabled"
        >
          {{ option.label }}
        </option>
      </select>
      <span class="agent-option-chevron" aria-hidden="true"></span>
    </span>
  </label>
</template>

<style scoped>
.agent-option-bar {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
}

.agent-option-bar[data-has-label="false"] { gap: 0; }

.agent-option-label {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-secondary);
}

.agent-option-shell {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 40px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  transition:
    border-color var(--dur-fast) var(--ease-std),
    box-shadow var(--dur-fast) var(--ease-std),
    background var(--dur-fast) var(--ease-std);
}

.agent-option-shell:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
}

.agent-option-select {
  width: 100%;
  min-width: 0;
  min-height: 38px;
  padding: 0 38px 0 12px;
  border: 0;
  border-radius: 7px;
  outline: 0;
  background: transparent;
  color: var(--text-primary, #111827);
  font: inherit;
  font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  appearance: none;
  cursor: pointer;
}

.agent-option-select:disabled {
  color: var(--text-muted, #6b7280);
  cursor: not-allowed;
}

.agent-option-chevron {
  pointer-events: none;
  position: absolute;
  right: 12px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  color: var(--text-secondary, #4b5563);
  transform: translateY(-65%) rotate(45deg);
}

.agent-option-bar[data-disabled="true"] .agent-option-shell {
  background: var(--bg-subtle, #f9fafb);
}
</style>
