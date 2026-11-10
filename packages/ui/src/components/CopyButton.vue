<script setup lang="ts">
/** One-click copy (Principio III) with an accessible confirmation. */
import { onBeforeUnmount, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    value: string;
    label: string;
    copiedLabel: string;
    variant?: 'primary' | 'default';
    description?: string;
  }>(),
  { variant: 'default', description: '' },
);
const emit = defineEmits<{ copied: [] }>();
const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copy() {
  try {
    await navigator.clipboard.writeText(props.value);
  } catch {
    // Older browsers or denied permission: fall back to a temporary selection.
    const area = document.createElement('textarea');
    area.value = props.value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  copied.value = true;
  emit('copied');
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = false), 2000);
}

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <button
    type="button"
    class="uk-button"
    :data-variant="variant"
    :aria-description="description || undefined"
    @click="copy"
  >
    {{ copied ? copiedLabel : label }}
  </button>
  <span class="uk-visually-hidden" role="status">{{ copied ? copiedLabel : '' }}</span>
</template>
