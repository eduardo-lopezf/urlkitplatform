<script setup lang="ts">
/**
 * Metadata island (002/T047). Calls POST /v1/metadata only when the visitor presses "Analizar".
 * Image, icon and canonical URLs are shown as text through InertLink: no <img> and no <link> is
 * ever created for them, so the third party never learns the visitor's IP (FR-009).
 */
import { computed, onMounted, ref } from 'vue';
import CopyButton from '@urlkit/ui/components/CopyButton.vue';
import ErrorMessage from '@urlkit/ui/components/ErrorMessage.vue';
import InertLink from '@urlkit/ui/components/InertLink.vue';
import SendTo from '@urlkit/ui/components/SendTo.vue';
import UrlInput from '@urlkit/ui/components/UrlInput.vue';
import { callTool, type ServerTools, type ToolOutcome } from '../lib/api.ts';
import { useText, type Lang } from '../lib/i18n.ts';
import { track } from '../lib/metrics.ts';
import { readFragment, sendTargets, shareLink, shareWarning } from '../lib/share.ts';

type Metadata = ServerTools['metadata']['response'];
type Field = keyof Metadata['effective'];

const FIELDS: Field[] = ['title', 'description', 'image', 'url', 'siteName', 'type'];
const URL_FIELDS = new Set<Field>(['image', 'url']);

const props = defineProps<{ lang: Lang }>();
const { text, part } = useText(props.lang);

const url = ref('');
const loading = ref(false);
const outcome = ref<ToolOutcome<Metadata> | null>(null);

onMounted(() => {
  const shared = readFragment<{ url: string }>('metadata');
  if (shared) url.value = shared.url;
});

async function run() {
  if (!url.value.trim() || loading.value) return;
  loading.value = true;
  outcome.value = null;
  outcome.value = await callTool('metadata', { url: url.value.trim() });
  loading.value = false;
  track('metadata', outcome.value.kind === 'ok' ? 'success' : 'error');
}

const result = computed(() => (outcome.value?.kind === 'ok' ? outcome.value.value : null));
const minutes = computed(() =>
  outcome.value?.kind === 'quota'
    ? Math.max(1, Math.ceil(outcome.value.retryAfterSeconds / 60))
    : 0,
);
const remaining = computed(() =>
  outcome.value?.kind === 'ok' ? outcome.value.rate.remaining : null,
);

/** Every tag found, as `og:title`, `twitter:card` or `title`, with its value. */
const rows = computed(() => {
  const s = result.value?.sources;
  if (!s) return [];
  return [
    ...Object.entries(s.openGraph).flatMap(([k, vs]) => vs.map((v) => [`og:${k}`, v] as const)),
    ...Object.entries(s.twitter).flatMap(([k, vs]) => vs.map((v) => [`twitter:${k}`, v] as const)),
    ...Object.entries(s.basic).map(([k, v]) => [k, v] as const),
  ];
});
const hasDocument = computed(
  () => result.value !== null && (rows.value.length > 0 || result.value.encoding !== undefined),
);
const link = computed(() =>
  url.value.trim() ? shareLink(props.lang, 'metadata', { url: url.value.trim() }) : '',
);
const targets = computed(() =>
  result.value?.finalUrl ? sendTargets(props.lang, 'metadata', result.value.finalUrl) : [],
);
</script>

<template>
  <div class="uk-stack">
    <form class="uk-stack" @submit.prevent="run">
      <UrlInput
        id="metadata-input"
        v-model="url"
        :label="text('ui.input.url')"
        :paste-label="text('ui.input.paste')"
        :clear-label="text('ui.input.clear')"
        catch-paste
        :hint="text('ui.metadata.hint')"
        autofocus
      />
      <div class="uk-row">
        <button
          type="submit"
          class="uk-button"
          data-variant="primary"
          :disabled="loading || !url.trim()"
        >
          {{ text('ui.metadata.button') }}
        </button>
        <span v-if="loading" role="status" class="uk-muted">{{ text('ui.metadata.loading') }}</span>
      </div>
    </form>

    <div v-if="outcome?.kind === 'quota'" class="notice" role="alert">
      <p>{{ text('ui.metadata.quota', { minutes }) }}</p>
      <p class="uk-muted">{{ text('ui.inspect.quotaShared') }}</p>
    </div>
    <ErrorMessage
      v-else-if="outcome?.kind === 'invalid'"
      :message="text(outcome.error.message)"
      :part="part(outcome.error.part)"
      :part-label="text('ui.error.part')"
    />
    <ErrorMessage
      v-else-if="outcome?.kind === 'network' || outcome?.kind === 'unavailable'"
      :message="text('ui.inspect.network')"
    />

    <template v-if="result">
      <ErrorMessage v-if="result.error" :message="text(result.error)" />

      <section v-if="hasDocument" class="uk-card" aria-labelledby="metadata-preview">
        <div class="uk-row between">
          <h2 id="metadata-preview" class="uk-label">{{ text('ui.metadata.preview') }}</h2>
          <CopyButton
            v-if="result.effective.title"
            :value="result.effective.title.value"
            :label="text('ui.metadata.copyTitle')"
            :copied-label="text('ui.metadata.copied')"
            @copied="track('metadata', 'copied')"
          />
        </div>
        <dl class="preview">
          <template v-for="field in FIELDS" :key="field">
            <dt>{{ text(`ui.metadata.field.${field}`) }}</dt>
            <dd>
              <template v-if="result.effective[field]">
                <span v-if="URL_FIELDS.has(field)" class="mono url">
                  <InertLink
                    :href="result.effective[field].value"
                    :text="result.effective[field].value"
                  />
                </span>
                <span v-else>{{ result.effective[field].value }}</span>
                <span class="uk-muted from">{{
                  text('ui.metadata.from', {
                    source: text(`ui.metadata.source.${result.effective[field].from}`),
                  })
                }}</span>
              </template>
              <span v-else class="uk-muted">{{ text('ui.metadata.none') }}</span>
            </dd>
          </template>
        </dl>
        <p v-if="result.effective.image" class="uk-muted">{{ text('ui.metadata.imageNote') }}</p>
      </section>

      <section v-if="hasDocument || result.warnings.length" aria-labelledby="metadata-warnings">
        <h2 id="metadata-warnings" class="uk-label">{{ text('ui.metadata.warnings') }}</h2>
        <ul v-if="result.warnings.length" class="warnings">
          <li v-for="warning in result.warnings" :key="warning.code">{{ text(warning) }}</li>
        </ul>
        <p v-else class="uk-muted">{{ text('ui.metadata.noWarnings') }}</p>
        <p v-if="result.encoding" class="uk-muted">
          {{ text('ui.metadata.encoding', { label: result.encoding.label }) }}
        </p>
      </section>

      <p v-if="!hasDocument && !result.warnings.length" class="uk-muted">
        {{ text('ui.metadata.empty') }}
      </p>

      <section v-if="rows.length" aria-labelledby="metadata-sources" class="uk-stack">
        <h2 id="metadata-sources" class="uk-label">{{ text('ui.metadata.sources') }}</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">{{ text('ui.metadata.key') }}</th>
              <th scope="col">{{ text('ui.metadata.value') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="([key, value], i) in rows" :key="`${i}-${key}`">
              <td class="mono">{{ key }}</td>
              <td class="value">{{ value }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section
        v-if="result.sources.links.canonical || result.sources.links.icon || result.sources.lang"
        aria-labelledby="metadata-links"
      >
        <h2 id="metadata-links" class="uk-label">{{ text('ui.metadata.links') }}</h2>
        <dl class="preview">
          <template v-if="result.sources.links.canonical">
            <dt>{{ text('ui.metadata.canonical') }}</dt>
            <dd class="mono url">
              <InertLink
                :href="result.sources.links.canonical"
                :text="result.sources.links.canonical"
              />
            </dd>
          </template>
          <template v-if="result.sources.links.icon">
            <dt>{{ text('ui.metadata.icons') }}</dt>
            <dd>
              <span v-for="icon in result.sources.links.icon" :key="icon" class="mono url block">{{
                icon
              }}</span>
            </dd>
          </template>
          <template v-if="result.sources.links.alternate">
            <dt>{{ text('ui.metadata.alternates') }}</dt>
            <dd>
              <span
                v-for="alt in result.sources.links.alternate"
                :key="alt.href"
                class="mono url block"
                >{{ alt.hreflang }}: {{ alt.href }}</span
              >
            </dd>
          </template>
          <template v-if="result.sources.lang">
            <dt>{{ text('ui.metadata.lang') }}</dt>
            <dd class="mono">{{ result.sources.lang }}</dd>
          </template>
        </dl>
      </section>

      <p v-if="remaining !== null" class="uk-muted">
        {{ text('ui.metadata.remaining', { remaining }) }}
      </p>
      <SendTo
        v-if="targets.length"
        :label="text('ui.sendTo')"
        :targets="targets"
        @send="track('metadata', 'sent-to')"
      />
    </template>

    <div v-if="url.trim()" class="uk-row">
      <CopyButton
        :value="link"
        :label="text('ui.copyLink')"
        :copied-label="text('ui.copyLink.copied')"
        :description="shareWarning(lang)"
      />
      <span class="uk-muted">{{ shareWarning(lang) }}</span>
    </div>
  </div>
</template>

<style scoped>
.between {
  justify-content: space-between;
}
.preview {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--space-1) var(--space-3);
  margin: 0;
}
.preview dt {
  font-size: var(--text-sm);
  font-weight: 600;
}
.preview dd {
  margin: 0;
}
.from {
  display: block;
}
.url,
.value {
  word-break: break-all;
}
.block {
  display: block;
}
.warnings {
  margin: 0;
  padding-left: var(--space-5);
  color: var(--color-caution);
}
table {
  width: 100%;
  border-collapse: collapse;
}
th {
  text-align: left;
  font-size: var(--text-sm);
}
th,
td {
  padding: var(--space-1) var(--space-2);
  vertical-align: top;
  border-bottom: 1px solid var(--color-border);
}
.notice {
  padding: var(--space-3) var(--space-4);
  border-left: 4px solid var(--color-caution);
  border-radius: var(--radius);
  background: var(--color-caution-soft);
}
.notice p {
  margin: 0;
}
.notice p + p {
  margin-top: var(--space-2);
}
@media (max-width: 30rem) {
  .preview {
    grid-template-columns: 1fr;
  }
  thead {
    display: none;
  }
  tr {
    display: grid;
    grid-template-columns: 1fr;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
  }
  th,
  td {
    border-bottom: 0;
    padding: 0 var(--space-1);
  }
}
</style>
