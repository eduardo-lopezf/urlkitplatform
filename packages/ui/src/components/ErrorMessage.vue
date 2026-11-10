<script setup lang="ts">
/** Error that names the problematic part of the input (FR-008). */
defineProps<{ message: string; part?: string | undefined; partLabel?: string | undefined }>();
</script>

<template>
  <div class="uk-error" role="alert">
    <p>{{ message }}</p>
    <p v-if="part" class="part">
      {{ partLabel }} <code>{{ part }}</code>
    </p>
  </div>
</template>

<style scoped>
.uk-error {
  padding: var(--space-3) var(--space-4);
  border-left: 4px solid var(--color-danger);
  border-radius: var(--radius);
  background: var(--color-danger-soft);
  color: var(--color-text);
}
p {
  margin: 0;
}
.part {
  margin-top: var(--space-1);
  font-size: var(--text-sm);
}
</style>
