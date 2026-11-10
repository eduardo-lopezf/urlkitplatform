<script setup lang="ts">
/**
 * URL Parser island (T061): every component, an editable query table and the rebuilt URL.
 * Every edit goes through the core, which validates and re-encodes it (FR-021).
 */
import { computed, onMounted, ref, watch } from 'vue';
import {
  addParam,
  moveParam,
  parseUrl,
  removeParam,
  setComponent,
  setParam,
  type EditableComponent,
  type ParsedUrl,
  type Result,
  type ToolError,
} from '@urlkit/core';
import CopyButton from '@urlkit/ui/components/CopyButton.vue';
import ErrorMessage from '@urlkit/ui/components/ErrorMessage.vue';
import ResultBox from '@urlkit/ui/components/ResultBox.vue';
import SendTo from '@urlkit/ui/components/SendTo.vue';
import UrlInput from '@urlkit/ui/components/UrlInput.vue';
import { useText, type Lang } from '../lib/i18n.ts';
import { runTracker, track } from '../lib/metrics.ts';
import { readFragment, sendTargets, shareLink, shareWarning } from '../lib/share.ts';

const props = defineProps<{ lang: Lang }>();
const { text, part } = useText(props.lang);

const url = ref('');
const showPassword = ref(false);
const editError = ref<ToolError | null>(null);

onMounted(() => {
  const shared = readFragment<{ url: string }>('parse');
  if (shared) url.value = shared.url;
});

const result = computed(() => (url.value.trim() ? parseUrl(url.value) : null));
const parsed = computed<ParsedUrl | null>(() => (result.value?.ok ? result.value.value : null));
const error = computed(() => (result.value && !result.value.ok ? result.value.error : null));

const tracker = runTracker('parse');
watch(result, (r) => r && tracker(url.value, r.ok));
watch(url, () => (editError.value = null));

function apply(edit: (current: ParsedUrl) => Result<ParsedUrl>) {
  if (!parsed.value) return;
  const next = edit(parsed.value);
  if (next.ok) {
    editError.value = null;
    url.value = next.value.href;
  } else {
    editError.value = next.error;
  }
}

const valueOf = (event: Event) => (event.target as HTMLInputElement).value;
const edit = (component: EditableComponent) => (event: Event) =>
  apply((p) => setComponent(p, component, valueOf(event)));

const fields = computed(() => {
  const p = parsed.value;
  if (!p) return [];
  return [
    { key: 'scheme', label: text('ui.parse.scheme'), value: p.scheme, edit: 'scheme' as const },
    {
      key: 'username',
      label: text('ui.parse.username'),
      value: p.username,
      edit: 'username' as const,
    },
    {
      key: 'hostUnicode',
      label: text('ui.parse.hostUnicode'),
      value: p.host.unicode,
      edit: 'host' as const,
    },
    { key: 'hostAscii', label: text('ui.parse.hostAscii'), value: p.host.ascii },
    {
      key: 'registrable',
      label: text('ui.parse.registrableDomain'),
      value: p.registrableDomain ?? text('ui.parse.none'),
    },
    {
      key: 'subdomain',
      label: text('ui.parse.subdomain'),
      value: p.subdomain ?? text('ui.parse.none'),
    },
    {
      key: 'port',
      label: text('ui.parse.port'),
      value: p.port.isDefault ? '' : String(p.port.value),
      placeholder:
        p.port.value === null ? '' : text('ui.parse.defaultPort', { port: p.port.value }),
      edit: 'port' as const,
    },
    { key: 'path', label: text('ui.parse.path'), value: p.path.raw, edit: 'path' as const },
    { key: 'pathDecoded', label: text('ui.parse.pathDecoded'), value: p.path.decoded },
    {
      key: 'fragment',
      label: text('ui.parse.fragment'),
      value: p.fragment ?? '',
      edit: 'fragment' as const,
    },
  ];
});

const link = computed(() =>
  parsed.value ? shareLink(props.lang, 'parse', { url: parsed.value.href }) : '',
);
const targets = computed(() =>
  parsed.value ? sendTargets(props.lang, 'parse', parsed.value.href) : [],
);
</script>

<template>
  <div class="uk-stack">
    <UrlInput
      id="parse-input"
      v-model="url"
      :label="text('ui.input.url')"
      :paste-label="text('ui.input.paste')"
      :clear-label="text('ui.input.clear')"
      catch-paste
      :hint="text('ui.local')"
      autofocus
    />
    <ErrorMessage
      v-if="error"
      :message="text(error.message)"
      :part="part(error.part)"
      :part-label="text('ui.error.part')"
    />

    <template v-if="parsed">
      <ResultBox id="parse-output" :label="text('ui.parse.rebuilt')" :value="parsed.href">
        <CopyButton
          :value="parsed.href"
          :label="text('ui.copy')"
          :copied-label="text('ui.copied')"
          variant="primary"
          @copied="track('parse', 'copied')"
        />
      </ResultBox>

      <ErrorMessage
        v-if="editError"
        :message="text(editError.message)"
        :part="part(editError.part)"
        :part-label="text('ui.error.part')"
      />

      <section v-if="parsed.warnings.length" class="uk-card" aria-labelledby="parse-warnings">
        <h2 id="parse-warnings" class="uk-label">{{ text('ui.parse.warnings') }}</h2>
        <ul>
          <li v-for="w in parsed.warnings" :key="w.code">{{ text(w) }}</li>
        </ul>
      </section>

      <section aria-labelledby="parse-components">
        <h2 id="parse-components" class="uk-label">{{ text('ui.parse.components') }}</h2>
        <dl class="grid">
          <template v-for="f in fields" :key="f.key">
            <dt>
              <label :for="`pf-${f.key}`">{{ f.label }}</label>
            </dt>
            <dd>
              <input
                :id="`pf-${f.key}`"
                class="uk-field"
                :value="f.value"
                :placeholder="f.placeholder"
                :readonly="!f.edit"
                spellcheck="false"
                @change="f.edit && edit(f.edit)($event)"
              />
            </dd>
          </template>
          <dt>
            <label for="pf-password">{{ text('ui.parse.password') }}</label>
          </dt>
          <dd class="uk-row">
            <input
              id="pf-password"
              class="uk-field grow"
              :type="showPassword ? 'text' : 'password'"
              :value="parsed.password"
              autocomplete="off"
              @change="edit('password')($event)"
            />
            <button
              type="button"
              class="uk-button"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? text('ui.parse.hide') : text('ui.parse.show') }}
            </button>
          </dd>
          <dt>{{ text('ui.parse.segments') }}</dt>
          <dd>
            <ol v-if="parsed.path.segments.length" class="segments">
              <li v-for="(s, i) in parsed.path.segments" :key="i">
                <code>{{ s }}</code>
              </li>
            </ol>
            <span v-else class="uk-muted">{{ text('ui.parse.none') }}</span>
          </dd>
        </dl>
      </section>

      <section aria-labelledby="parse-query">
        <h2 id="parse-query" class="uk-label">{{ text('ui.parse.query') }}</h2>
        <table v-if="parsed.query.length">
          <thead>
            <tr>
              <th scope="col">{{ text('ui.parse.name') }}</th>
              <th scope="col">{{ text('ui.parse.value') }}</th>
              <th scope="col"><span class="uk-visually-hidden">—</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(q, i) in parsed.query" :key="`${i}-${q.rawName}`">
              <td>
                <input
                  class="uk-field"
                  :value="q.name"
                  :aria-label="`${text('ui.parse.name')} ${i + 1}`"
                  spellcheck="false"
                  @change="apply((p) => setParam(p, i, { name: valueOf($event) }))"
                />
              </td>
              <td>
                <input
                  class="uk-field"
                  :value="q.value ?? ''"
                  :placeholder="q.value === null ? text('ui.parse.noValue') : ''"
                  :aria-label="`${text('ui.parse.value')} ${q.name}`"
                  spellcheck="false"
                  @change="apply((p) => setParam(p, i, { value: valueOf($event) }))"
                />
                <small v-if="!q.encodingValid" class="warn">{{
                  text('ui.parse.invalidEncoding')
                }}</small>
              </td>
              <td class="actions">
                <button
                  type="button"
                  class="uk-button"
                  :disabled="i === 0"
                  :aria-label="text('ui.parse.up', { name: q.name })"
                  @click="apply((p) => moveParam(p, i, i - 1))"
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="uk-button"
                  :disabled="i === parsed.query.length - 1"
                  :aria-label="text('ui.parse.down', { name: q.name })"
                  @click="apply((p) => moveParam(p, i, i + 1))"
                >
                  ↓
                </button>
                <button
                  type="button"
                  class="uk-button"
                  :aria-label="text('ui.parse.remove', { name: q.name })"
                  @click="apply((p) => removeParam(p, i))"
                >
                  ✕
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <button type="button" class="uk-button add" @click="apply((p) => addParam(p, 'param', ''))">
          {{ text('ui.parse.add') }}
        </button>
      </section>

      <SendTo :label="text('ui.sendTo')" :targets="targets" @send="track('parse', 'sent-to')" />
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
.grid {
  display: grid;
  grid-template-columns: minmax(8rem, max-content) 1fr;
  gap: var(--space-2) var(--space-3);
  align-items: center;
  margin: 0;
}
dt {
  font-size: var(--text-sm);
  font-weight: 600;
}
dd {
  margin: 0;
  min-width: 0;
}
.grow {
  flex: 1;
  min-width: 0;
}
.segments {
  margin: 0;
  padding-left: var(--space-5);
}
table {
  width: 100%;
  border-collapse: collapse;
}
th {
  text-align: left;
  font-size: var(--text-sm);
}
td {
  padding: var(--space-1);
  vertical-align: top;
}
.actions {
  white-space: nowrap;
}
.actions .uk-button {
  min-width: 2.5rem;
  justify-content: center;
}
.warn {
  color: var(--color-caution);
}
.add {
  margin-top: var(--space-2);
}
input[readonly] {
  background: var(--color-surface);
}
@media (max-width: 30rem) {
  .grid {
    grid-template-columns: 1fr;
  }
  thead {
    display: none;
  }
  tr {
    display: grid;
    grid-template-columns: 1fr;
    margin-bottom: var(--space-3);
  }
}
</style>
