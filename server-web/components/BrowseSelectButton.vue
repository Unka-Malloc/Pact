<script setup lang="ts">
import { computed, ref } from "vue";

type BrowseSelectKind =
  | "local-files"
  | "local-directory"
  | "server-file"
  | "server-directory";

const props = withDefaults(
  defineProps<{
    kind: BrowseSelectKind;
    buttonText?: string;
    buttonType?: string;
    buttonClass?: string;
    size?: string;
    disabled?: boolean;
    plain?: boolean;
    multiple?: boolean;
    accept?: string;
  }>(),
  {
    buttonText: "",
    buttonType: "",
    buttonClass: "",
    size: "default",
    disabled: false,
    plain: false,
    multiple: true,
    accept: "",
  },
);

const emit = defineEmits<{
  browse: [];
  select: [files: File[]];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const directoryInput = ref<HTMLInputElement | null>(null);

const isLocalFiles = computed(() => props.kind === "local-files");
const isLocalDirectory = computed(() => props.kind === "local-directory");
const isLocal = computed(() => isLocalFiles.value || isLocalDirectory.value);
const resolvedButtonText = computed(() => {
  if (props.buttonText) {
    return props.buttonText;
  }
  if (props.kind === "local-directory") {
    return "选择文件夹";
  }
  if (props.kind === "local-files") {
    return "选择文件";
  }
  return "浏览";
});

function openLocalPicker() {
  const input = isLocalDirectory.value ? directoryInput.value : fileInput.value;
  if (!input) {
    return;
  }
  input.value = "";
  input.click();
}

function onClick() {
  if (props.disabled) {
    return;
  }
  if (isLocal.value) {
    openLocalPicker();
    return;
  }
  emit("browse");
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  emit("select", Array.from(input.files || []));
}
</script>

<template>
  <span class="browse-select-button">
    <el-button
      :class="buttonClass"
      :type="buttonType"
      :plain="plain"
      :size="size"
      :disabled="disabled"
      @click="onClick"
    >
      {{ resolvedButtonText }}
    </el-button>
    <input
      v-if="isLocalDirectory"
      ref="directoryInput"
      class="native-file-input"
      type="file"
      multiple
      webkitdirectory
      directory
      tabindex="-1"
      aria-hidden="true"
      @change="onFileChange"
    />
    <input
      v-else-if="isLocalFiles"
      ref="fileInput"
      class="native-file-input"
      type="file"
      :multiple="multiple"
      :accept="accept"
      tabindex="-1"
      aria-hidden="true"
      @change="onFileChange"
    />
  </span>
</template>
