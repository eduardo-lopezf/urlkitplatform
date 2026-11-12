<script setup lang="ts">
/** Thin-stroke line icon for each tool. Decorative: the tool name sits next to it. */
defineProps<{
  tool:
    | 'clean'
    | 'parse'
    | 'inspect'
    | 'diff'
    | 'explain'
    | 'headers'
    | 'metadata'
    | 'tls'
    | 'dns'
    | 'security';
}>();
</script>

<template>
  <svg
    class="uk-icon"
    viewBox="0 0 24 24"
    width="24"
    height="24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="tool === 'clean'">
      <path d="M10 4l1.6 4.4L16 10l-4.4 1.6L10 16l-1.6-4.4L4 10l4.4-1.6z" />
      <circle cx="18" cy="5" r="1.5" />
    </template>
    <template v-else-if="tool === 'parse'">
      <path
        d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"
      />
      <circle cx="11.5" cy="11.5" r="3" />
      <path d="M13.7 13.7L16 16" />
    </template>
    <template v-else-if="tool === 'inspect'">
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M6 8v5a3 3 0 0 0 3 3h7" />
    </template>
    <template v-else-if="tool === 'diff'">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
      <path d="M7.5 11v4.5H13" />
    </template>
    <template v-else-if="tool === 'headers'">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 12h8M8 15h5" />
    </template>
    <template v-else-if="tool === 'metadata'">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 16l-5-5-8 8" />
    </template>
    <template v-else-if="tool === 'tls'">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </template>
    <template v-else-if="tool === 'dns'">
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.2 2.5 13.8 0 16M12 4c-2.5 2.2-2.5 13.8 0 16" />
    </template>
    <template v-else>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </template>
  </svg>
</template>

<style scoped>
.uk-icon {
  flex: none;
}
</style>
