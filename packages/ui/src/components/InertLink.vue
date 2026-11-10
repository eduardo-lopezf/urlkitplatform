<script setup lang="ts">
/**
 * Shows a URL as a link only for http(s); dangerous schemes (`javascript:`, `data:`…) are plain
 * text (Principio V). Text is always escaped by Vue.
 */
import { computed } from 'vue';

const props = defineProps<{ href: string; text?: string | undefined }>();
const safe = computed(() => /^https?:\/\//i.test(props.href.trim()));
</script>

<template>
  <a
    v-if="safe"
    class="mono"
    :href="href"
    rel="noopener noreferrer nofollow"
    referrerpolicy="no-referrer"
    target="_blank"
    >{{ text ?? href }}</a
  >
  <span v-else class="mono">{{ text ?? href }}</span>
</template>
