<script setup lang="ts">
/** Accessible on/off switch built on a native checkbox. */
defineProps<{ modelValue: boolean; label: string; id: string; description?: string | undefined }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <div class="uk-toggle">
    <input
      :id="id"
      type="checkbox"
      role="switch"
      :checked="modelValue"
      :aria-describedby="description ? `${id}-desc` : undefined"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <label :for="id">{{ label }}</label>
    <p v-if="description" :id="`${id}-desc`" class="uk-muted">{{ description }}</p>
  </div>
</template>

<style scoped>
.uk-toggle {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0 var(--space-2);
  align-items: center;
}
input {
  width: 1.25rem;
  height: 1.25rem;
  accent-color: var(--color-accent);
}
label {
  font-weight: 600;
  font-size: var(--text-sm);
}
p {
  grid-column: 2;
  margin: 0;
}
</style>
