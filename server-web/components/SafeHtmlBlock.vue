<script setup lang="ts">
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    html: string;
    source: "markdownToSafeHtml" | "renderEvidenceReadableHtml";
    tag?: string;
  }>(),
  {
    tag: "div",
  },
);
</script>

<template>
  <component
    :is="props.tag"
    v-bind="$attrs"
    :data-safe-html-source="props.source"
    v-html="props.html"
  ></component>
</template>
