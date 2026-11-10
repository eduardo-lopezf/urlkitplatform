<script setup lang="ts">
/**
 * URL input: trims pasted text and emits the value 150 ms after typing stops (web-routes.md).
 * Paste is processed at once. No domain knowledge: it only handles text.
 *
 * The field is uncontrolled (no `:value` binding): hydration never touches it, so whatever was
 * typed or pasted before the island hydrated is kept and adopted on mount.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    label: string;
    id: string;
    placeholder?: string;
    hint?: string;
    autofocus?: boolean;
    /** Labels for the floating buttons; without them the buttons are not shown. */
    pasteLabel?: string;
    clearLabel?: string;
    /** Take a paste made anywhere on the page when no other field has focus. */
    catchPaste?: boolean;
  }>(),
  {
    placeholder: 'https://',
    hint: '',
    autofocus: false,
    pasteLabel: '',
    clearLabel: '',
    catchPaste: false,
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const field = ref<HTMLTextAreaElement | null>(null);
// Read before hydration too, in case hydration replaces the server-rendered node.
const early =
  typeof document === 'undefined'
    ? ''
    : ((document.getElementById(props.id) as HTMLTextAreaElement | null)?.value ?? '');
let timer: ReturnType<typeof setTimeout> | undefined;
/** Last value this component emitted: when it comes back through v-model it is not news. */
let emitted: string | null = null;

/** Rendered height of the empty field; it grows with the text up to five times this. */
let baseHeight = 0;

function grow() {
  const el = field.value;
  if (!el) return;
  if (!baseHeight) baseHeight = el.offsetHeight;
  el.style.height = 'auto';
  const needed = el.scrollHeight + el.offsetHeight - el.clientHeight;
  el.style.height = `${Math.max(baseHeight, Math.min(needed, baseHeight * 5))}px`;
}

function publish(value: string) {
  emitted = value;
  filled.value = value !== '';
  grow();
  emit('update:modelValue', value);
}

function set(value: string) {
  if (field.value && field.value.value !== value) field.value.value = value;
  filled.value = value !== '';
  grow();
}

/** Whether the field has text: decides which floating button is shown. */
const filled = ref(false);
/** The clipboard is read only on a click, never on its own (privacy). */
const canRead = ref(false);

function onPageKeydown(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'v') return;
  const active = document.activeElement;
  if (active === field.value) return;
  if (active instanceof HTMLElement && active.closest('input, textarea, select, [contenteditable]'))
    return;
  // Focus before the paste event fires, so the browser pastes into the field.
  field.value?.focus();
}

onMounted(() => {
  canRead.value = typeof navigator.clipboard?.readText === 'function';
  if (props.catchPaste) document.addEventListener('keydown', onPageKeydown);
  const typed = field.value?.value || early;
  if (typed) {
    set(typed);
    publish(typed.trim());
  } else set(props.modelValue);
});

watch(
  () => props.modelValue,
  (value) => {
    // Only external changes (a shared link, "Enviar a", an edit in the parser) rewrite the field.
    if (value !== emitted) set(value);
  },
);

function onInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value;
  filled.value = value !== '';
  grow();
  clearTimeout(timer);
  timer = setTimeout(() => publish(value), 150);
}

function onPaste(event: ClipboardEvent) {
  const pasted = event.clipboardData?.getData('text');
  if (pasted === undefined) return;
  event.preventDefault();
  const target = event.target as HTMLTextAreaElement;
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? target.value.length;
  const value = (target.value.slice(0, start) + pasted + target.value.slice(end)).trim();
  target.value = value;
  clearTimeout(timer);
  publish(value);
}

async function pasteFromClipboard() {
  try {
    const value = (await navigator.clipboard.readText()).trim();
    if (!value) return;
    set(value);
    clearTimeout(timer);
    publish(value);
  } catch {
    // Permission denied or no text: the field stays as it was.
  }
  field.value?.focus();
}

function clear() {
  set('');
  clearTimeout(timer);
  publish('');
  field.value?.focus();
}

onBeforeUnmount(() => {
  clearTimeout(timer);
  document.removeEventListener('keydown', onPageKeydown);
});
</script>

<template>
  <div class="uk-url-input">
    <label class="uk-label" :for="id">{{ label }}</label>
    <div class="field-wrap">
      <textarea
        :id="id"
        ref="field"
        class="uk-field"
        rows="2"
        inputmode="url"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :autofocus="autofocus"
        :placeholder="placeholder"
        :aria-describedby="hint ? `${id}-hint` : undefined"
        @input="onInput"
        @paste="onPaste"
      ></textarea>
      <button
        v-if="filled && clearLabel"
        type="button"
        class="float"
        :aria-label="clearLabel"
        :title="clearLabel"
        @click="clear"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <button
        v-else-if="!filled && canRead && pasteLabel"
        type="button"
        class="float"
        @click="pasteFromClipboard"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="8" y="3" width="8" height="4" rx="1" />
          <path d="M16 5h1a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1" />
        </svg>
        <span>{{ pasteLabel }}</span>
      </button>
    </div>
    <p v-if="hint" :id="`${id}-hint`" class="uk-muted">{{ hint }}</p>
  </div>
</template>

<style scoped>
.field-wrap {
  position: relative;
}
.float {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  font-size: 0.875em;
  cursor: pointer;
}
.float:hover {
  border-color: currentColor;
}
textarea {
  padding-right: 6.5rem;
  resize: vertical;
  word-break: break-all;
}
p {
  margin: var(--space-1) 0 0;
}
</style>
