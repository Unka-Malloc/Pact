<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<template>
  <details class="config-fold-card advanced-config">
    <summary>
      <slot name="summary">
        <span>{{ title }}</span>
        <small v-if="subtitle">{{ subtitle }}</small>
      </slot>
    </summary>
    <slot />
  </details>
</template>

<style scoped>
.config-fold-card summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.config-fold-card summary span {
  min-width: 0;
}

.config-fold-card summary small {
  color: var(--text-muted, #6b7280);
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
}
</style>
