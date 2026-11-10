<script setup lang="ts">
/** Read-only result with an accessible live region. Actions go in the default slot. */
defineProps<{ label: string; value: string; id: string }>();
</script>

<template>
  <section class="uk-result" :aria-labelledby="`${id}-label`">
    <h2 :id="`${id}-label`" class="uk-label">{{ label }}</h2>
    <output :id="id" class="mono" aria-live="polite">{{ value }}</output>
    <div class="uk-row actions"><slot /></div>
  </section>
</template>

<style scoped>
.uk-result {
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}
h2 {
  margin: 0 0 var(--space-2);
}
output {
  display: block;
  padding: var(--space-3);
  border-radius: var(--radius);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  white-space: pre-wrap;
  word-break: break-all;
}
.actions {
  margin-top: var(--space-3);
}
.actions:empty {
  display: none;
}
</style>
