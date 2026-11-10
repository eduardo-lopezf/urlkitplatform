<script setup lang="ts">
/**
 * "Enviar a" (FR-004). Receives ready-made targets: the island computes them from the tool
 * registry, so this component stays free of domain knowledge.
 */
defineProps<{ label: string; targets: Array<{ id: string; label: string; href: string }> }>();
const emit = defineEmits<{ send: [id: string] }>();
</script>

<template>
  <nav class="uk-send-to" :aria-label="label">
    <span class="uk-muted">{{ label }}</span>
    <ul class="uk-row">
      <li v-for="target in targets" :key="target.id">
        <a class="uk-button" :href="target.href" @click="emit('send', target.id)">{{
          target.label
        }}</a>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.uk-send-to {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
