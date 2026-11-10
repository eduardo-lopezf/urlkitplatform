<script setup lang="ts">
/**
 * Smart Cleaner island (T053). Runs the core in the browser: the URL never leaves the device
 * (FR-006). The catalog is injected from packages/rules; the mode is remembered in localStorage.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { clean, type CleanInput, type RemovedItem } from '@urlkit/core';
import { catalog } from '@urlkit/rules';
import CopyButton from '@urlkit/ui/components/CopyButton.vue';
import ErrorMessage from '@urlkit/ui/components/ErrorMessage.vue';
import ResultBox from '@urlkit/ui/components/ResultBox.vue';
import SendTo from '@urlkit/ui/components/SendTo.vue';
import ToggleSwitch from '@urlkit/ui/components/ToggleSwitch.vue';
import UrlInput from '@urlkit/ui/components/UrlInput.vue';
import { useText, type Lang } from '../lib/i18n.ts';
import { runTracker, track } from '../lib/metrics.ts';
import { readFragment, sendTargets, shareLink, shareWarning, toolHref } from '../lib/share.ts';
import { readPref, writePref } from '../lib/storage.ts';

const props = defineProps<{ lang: Lang }>();
const { text, part } = useText(props.lang);
const MODE_KEY = 'urlkit.clean.mode';

const url = ref('');
const max = ref(false);
const keep = ref<string[]>([]);

onMounted(() => {
  max.value = readPref(MODE_KEY) === 'max';
  const shared = readFragment<Required<CleanInput>>('clean');
  if (shared) {
    url.value = shared.url;
    max.value = shared.mode === 'max';
    keep.value = shared.keep;
  }
});

watch(max, (value) => writePref(MODE_KEY, value ? 'max' : 'safe'));
watch(url, () => (keep.value = []));

const mode = computed(() => (max.value ? 'max' : 'safe'));
const result = computed(() =>
  url.value.trim() ? clean({ url: url.value, mode: mode.value, keep: keep.value, catalog }) : null,
);
const ok = computed(() => (result.value?.ok ? result.value.value : null));
const error = computed(() => (result.value && !result.value.ok ? result.value.error : null));

const tracker = runTracker('clean');
watch(result, (r) => r && tracker(url.value, r.ok));

const kindLabel = (item: RemovedItem) => text(`ui.clean.kind.${item.kind}`);
const keepable = (item: RemovedItem) => item.kind === 'param';
function toggleKeep(name: string, checked: boolean) {
  keep.value = checked ? [...keep.value, name] : keep.value.filter((k) => k !== name);
}
const link = computed(() =>
  ok.value
    ? shareLink(props.lang, 'clean', { url: url.value, mode: mode.value, keep: keep.value })
    : '',
);
const targets = computed(() => (ok.value ? sendTargets(props.lang, 'clean', ok.value.output) : []));
</script>

<template>
  <div class="uk-stack">
    <UrlInput
      id="clean-input"
      v-model="url"
      :label="text('ui.input.url')"
      :paste-label="text('ui.input.paste')"
      :clear-label="text('ui.input.clear')"
      catch-paste
      :hint="text('ui.local')"
      autofocus
    />

    <ToggleSwitch
      id="clean-max"
      v-model="max"
      :label="text('ui.clean.mode.max')"
      :description="text('ui.clean.mode.maxDescription')"
    />

    <ErrorMessage
      v-if="error"
      :message="text(error.message)"
      :part="part(error.part)"
      :part-label="text('ui.error.part')"
    />

    <template v-if="ok">
      <ResultBox id="clean-output" :label="text('ui.clean.result')" :value="ok.output">
        <CopyButton
          :value="ok.output"
          :label="text('ui.copy')"
          :copied-label="text('ui.copied')"
          variant="primary"
          @copied="track('clean', 'copied')"
        />
        <a
          class="uk-button"
          :href="toolHref(lang, 'inspect', { url: ok.output })"
          :title="text('ui.clean.expandHint')"
          >{{ text('ui.clean.expand') }}</a
        >
      </ResultBox>

      <p v-if="!ok.changed" class="state" role="status">{{ text('ui.clean.alreadyClean') }}</p>
      <p v-if="ok.unwrapped.length" class="uk-muted">{{ text('ui.clean.unwrapped') }}</p>
      <p v-if="keep.length" class="uk-muted">
        {{ text('ui.clean.kept', { names: keep.join(', ') }) }}
      </p>

      <section v-if="ok.removed.length || keep.length" aria-labelledby="clean-removed">
        <h2 id="clean-removed" class="uk-label">{{ text('ui.clean.removed') }}</h2>
        <ul class="removed">
          <li
            v-for="(item, i) in ok.removed"
            :key="`${item.ruleId}-${item.name}-${i}`"
            class="uk-card"
          >
            <div class="head">
              <span class="tag">{{ kindLabel(item) }}</span>
              <code
                >{{ item.name
                }}<template v-if="item.value !== undefined && item.kind === 'param'"
                  >={{ item.value }}</template
                ></code
              >
              <span v-if="item.platform" class="uk-muted">· {{ item.platform }}</span>
            </div>
            <p>{{ text(item.reason) }}</p>
            <label v-if="keepable(item)" class="keep">
              <input
                type="checkbox"
                :checked="false"
                @change="toggleKeep(item.name, ($event.target as HTMLInputElement).checked)"
              />
              {{ text('ui.clean.keep', { name: item.name }) }}
            </label>
          </li>
          <li v-for="name in keep" :key="`kept-${name}`" class="uk-card">
            <label class="keep">
              <input
                type="checkbox"
                checked
                @change="toggleKeep(name, ($event.target as HTMLInputElement).checked)"
              />
              {{ text('ui.clean.keep', { name }) }}
            </label>
          </li>
        </ul>
      </section>

      <section v-if="ok.maxPreview" class="uk-card preview" aria-labelledby="clean-preview">
        <h2 id="clean-preview" class="uk-label">{{ text('ui.clean.preview') }}</h2>
        <output class="mono">{{ ok.maxPreview.output }}</output>
        <ul class="uk-muted">
          <li v-for="(item, i) in ok.maxPreview.extra" :key="`x-${i}`">
            {{ kindLabel(item) }} <code>{{ item.name }}</code> — {{ text(item.reason) }}
          </li>
        </ul>
        <button type="button" class="uk-button" @click="max = true">
          {{ text('ui.clean.previewApply') }}
        </button>
      </section>

      <SendTo :label="text('ui.sendTo')" :targets="targets" @send="track('clean', 'sent-to')" />
      <div class="uk-row">
        <CopyButton
          :value="link"
          :label="text('ui.copyLink')"
          :copied-label="text('ui.copyLink.copied')"
          :description="shareWarning(lang)"
        />
        <span class="uk-muted">{{ shareWarning(lang) }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.removed {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.removed p {
  margin: var(--space-1) 0;
}
.head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: baseline;
}
.tag {
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-accent-soft);
  font-size: var(--text-xs);
  font-weight: 600;
}
.keep {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  font-size: var(--text-sm);
}
.state {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius);
  background: var(--color-success-soft);
  color: var(--color-text);
}
.preview output {
  display: block;
  margin-bottom: var(--space-2);
  word-break: break-all;
}
</style>
