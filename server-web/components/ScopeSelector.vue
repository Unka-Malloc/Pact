<script setup lang="ts">
import { computed } from 'vue';
import type { ToolManagementScope } from '../lib/types';
import ConfigFoldCard from './ConfigFoldCard.vue';

const props = defineProps<{
  modelValue: string[];
  scopes: ToolManagementScope[];
  disabled?: boolean;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void;
}>();

const groups = computed(() => {
  const result: Record<string, ToolManagementScope[]> = {};
  for (const scope of props.scopes) {
    const category = scope.id.split(':')[0] || '其它';
    if (!result[category]) {
      result[category] = [];
    }
    result[category].push(scope);
  }
  // Sort keys alphabetically
  return Object.keys(result)
    .sort()
    .reduce((obj, key) => {
      obj[key] = result[key];
      return obj;
    }, {} as Record<string, ToolManagementScope[]>);
});

const categoryLabels: Record<string, string> = {
  agent: '智能体 (Agent)',
  context: '上下文 (Context)',
  knowledge: '知识库 (Knowledge)',
  storage: '存储 (Storage)',
  tool: '工具 (Tool)',
  workspace: '工作空间 (Workspace)',
  system: '系统 (System)',
  jobs: '任务 (Jobs)',
};

const getCategoryLabel = (key: string) => categoryLabels[key] || key.charAt(0).toUpperCase() + key.slice(1);

const isCategoryAllSelected = (categoryScopes: ToolManagementScope[]) => {
  return categoryScopes.every(scope => props.modelValue.includes(scope.id));
};

const toggleCategory = (categoryScopes: ToolManagementScope[]) => {
  if (props.disabled) return;
  const allSelected = isCategoryAllSelected(categoryScopes);
  const ids = categoryScopes.map(s => s.id);

  let newValue = [...props.modelValue];
  if (allSelected) {
    // Remove all
    newValue = newValue.filter(id => !ids.includes(id));
  } else {
    // Add all missing
    for (const id of ids) {
      if (!newValue.includes(id)) {
        newValue.push(id);
      }
    }
  }
  emit('update:modelValue', newValue);
};

const toggleScope = (scopeId: string) => {
  if (props.disabled) return;
  let newValue = [...props.modelValue];
  if (newValue.includes(scopeId)) {
    newValue = newValue.filter(id => id !== scopeId);
  } else {
    newValue.push(scopeId);
  }
  emit('update:modelValue', newValue);
};
</script>

<template>
  <div class="scope-selector">
    <ConfigFoldCard
      v-for="(categoryScopes, category) in groups"
      :key="category"
      open
      style="margin-bottom: var(--space-2);"
    >
      <template #summary>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; padding-right: var(--space-2);">
          <span class="config-fold-title">{{ getCategoryLabel(category) }}</span>
          <button
            class="tool-button tool-button-ghost"
            style="padding: 2px 8px; font-size: 0.75rem; min-height: unset; height: 24px;"
            :disabled="disabled"
            @click.prevent.stop="toggleCategory(categoryScopes)"
          >
            {{ isCategoryAllSelected(categoryScopes) ? '取消全选' : '一键全选' }}
          </button>
        </div>
      </template>

      <div class="scope-grid" :class="{ 'compact-scope-grid': compact }">
        <button
          v-for="scope in categoryScopes"
          :key="scope.id"
          class="scope-chip"
          :class="{ active: modelValue.includes(scope.id) }"
          type="button"
          :disabled="disabled"
          @click="toggleScope(scope.id)"
        >
          <strong>{{ scope.label }}</strong>
          <span v-if="!compact">{{ scope.description }}</span>
          <span v-else>{{ scope.id }}</span>
        </button>
      </div>
    </ConfigFoldCard>
  </div>
</template>

<style scoped>
.scope-selector {
  display: flex;
  flex-direction: column;
}
</style>
