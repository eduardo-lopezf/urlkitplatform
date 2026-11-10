<script setup lang="ts">
/** URL Diff island (T082): two inputs, options and differences by component and param. */
import { computed, onMounted, ref, watch } from 'vue';
import {
  DEFAULT_DIFF_OPTIONS,
  diff,
  type DiffInput,
  type DiffOptions,
  type Difference,
} from '@urlkit/core';
import { catalog } from '@urlkit/rules';
import CopyButton from '@urlkit/ui/components/CopyButton.vue';
import ErrorMessage from '@urlkit/ui/components/ErrorMessage.vue';
import ToggleSwitch from '@urlkit/ui/components/ToggleSwitch.vue';
import UrlInput from '@urlkit/ui/components/UrlInput.vue';
import { useText, type Lang } from '../lib/i18n.ts';
import { runTracker, track } from '../lib/metrics.ts';
import { readFragment, shareLink, shareWarning } from '../lib/share.ts';

const props = defineProps<{ lang: Lang }>();
const { text, part } = useText(props.lang);

const a = ref('');
const b = ref('');
const options = ref<DiffOptions>({ ...DEFAULT_DIFF_OPTIONS });

onMounted(() => {
  const shared = readFragment<DiffInput>('diff');
  if (!shared) return;
  a.value = shared.a;
  b.value = shared.b;
  options.value = { ...DEFAULT_DIFF_OPTIONS, ...shared.options };
});

const result = computed(() =>
  a.value.trim() && b.value.trim()
    ? diff({ a: a.value, b: b.value, options: options.value, catalog })
    : null,
);
const ok = computed(() => (result.value?.ok ? result.value.value : null));
const error = computed(() => (result.value && !result.value.ok ? result.value.error : null));

const tracker = runTracker('diff');
watch(result, (r) => r && tracker(`${a.value}\n${b.value}`, r.ok));

const subject = (d: Difference) =>
  d.param
    ? d.param
    : d.component === 'query'
      ? text('ui.diff.order')
      : text(`ui.diff.component.${d.component}`);
const label = (d: Difference) =>
  d.param ? text('ui.diff.component.query') : text(`ui.diff.component.${d.component}`);
const show = (value: string | undefined) =>
  value === undefined || value === '' ? text('ui.diff.empty') : value;
const link = computed(() =>
  ok.value ? shareLink(props.lang, 'diff', { a: a.value, b: b.value, options: options.value }) : '',
);
</script>

<template>
  <div class="uk-stack">
    <UrlInput
      id="diff-a"
      :paste-label="text('ui.input.paste')"
      :clear-label="text('ui.input.clear')"
      v-model="a"
      :label="text('ui.diff.a')"
      autofocus
    />
    <UrlInput
      id="diff-b"
      :paste-label="text('ui.input.paste')"
      :clear-label="text('ui.input.clear')"
      v-model="b"
      :label="text('ui.diff.b')"
      :hint="text('ui.local')"
    />

    <fieldset class="uk-card uk-stack">
      <legend class="uk-label">{{ text('ui.diff.options') }}</legend>
      <ToggleSwitch
        id="diff-order"
        v-model="options.ignoreParamOrder"
        :label="text('ui.diff.ignoreParamOrder')"
      />
      <ToggleSwitch
        id="diff-tracking"
        v-model="options.ignoreTracking"
        :label="text('ui.diff.ignoreTracking')"
      />
      <ToggleSwitch
        id="diff-normalize"
        v-model="options.normalize"
        :label="text('ui.diff.normalize')"
        :description="text('ui.diff.normalizeDescription')"
      />
    </fieldset>

    <ErrorMessage
      v-if="error"
      :message="text(error.message)"
      :part="part(error.part)"
      :part-label="text('ui.error.part')"
    />

    <template v-if="ok">
      <p v-if="ok.equivalent" class="state" role="status">{{ text('ui.diff.equivalent') }}</p>
      <section v-else aria-labelledby="diff-list">
        <h2 id="diff-list" class="uk-label" role="status">
          {{ text('ui.diff.different', { count: ok.differences.length }) }}
        </h2>
        <ul class="diffs">
          <li v-for="(d, i) in ok.differences" :key="i" class="uk-card" :data-change="d.change">
            <div class="uk-row">
              <span class="tag">{{ text(`ui.diff.change.${d.change}`) }}</span>
              <span class="uk-muted">{{ label(d) }}</span>
              <code>{{ subject(d) }}</code>
            </div>
            <div class="sides">
              <del v-if="d.change !== 'added'" class="mono">{{ show(d.before) }}</del>
              <ins v-if="d.change !== 'removed'" class="mono">{{ show(d.after) }}</ins>
            </div>
          </li>
        </ul>
      </section>

      <details v-if="ok.cosmetic.length">
        <summary>{{ text('ui.diff.cosmetic', { count: ok.cosmetic.length }) }}</summary>
        <ul>
          <li v-for="(d, i) in ok.cosmetic" :key="i">
            {{ label(d) }} <code>{{ subject(d) }}</code
            >: <span class="mono">{{ show(d.before) }}</span> →
            <span class="mono">{{ show(d.after) }}</span>
          </li>
        </ul>
      </details>

      <div class="uk-row">
        <CopyButton
          :value="link"
          :label="text('ui.copyLink')"
          :copied-label="text('ui.copyLink.copied')"
          :description="shareWarning(lang)"
          @copied="track('diff', 'copied')"
        />
        <span class="uk-muted">{{ shareWarning(lang) }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
fieldset {
  margin: 0;
}
.diffs {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.tag {
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-accent-soft);
  font-size: var(--text-xs);
  font-weight: 600;
}
.sides {
  display: grid;
  gap: var(--space-1);
  margin-top: var(--space-2);
}
del,
ins {
  display: block;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  text-decoration: none;
  word-break: break-all;
}
del {
  background: var(--color-danger-soft);
}
del::before {
  content: '− ';
}
ins {
  background: var(--color-success-soft);
}
ins::before {
  content: '+ ';
}
.state {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  background: var(--color-success-soft);
}
</style>
