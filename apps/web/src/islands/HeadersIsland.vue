<script setup lang="ts">
/**
 * HTTP Headers island (002/T034). Calls POST /v1/headers only when the visitor presses
 * "Analizar": opening a shared link only fills the input. Every value from the server is shown
 * as escaped text, and cookie values never reach the page (the API omits them).
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
import { readFragment, sendTargets, shareLink, shareWarning, toolHref } from '../lib/share.ts';
import { PUBLISHED_TOOLS } from '../lib/tools.ts';

type Analysis = ServerTools['headers']['response'];

const props = defineProps<{ lang: Lang }>();
const { text, part } = useText(props.lang);

const url = ref('');
const loading = ref(false);
const outcome = ref<ToolOutcome<Analysis> | null>(null);

onMounted(() => {
  const shared = readFragment<{ url: string }>('headers');
  if (shared) url.value = shared.url;
});

async function run() {
  if (!url.value.trim() || loading.value) return;
  loading.value = true;
  outcome.value = null;
  outcome.value = await callTool('headers', { url: url.value.trim() });
  loading.value = false;
  track('headers', outcome.value.kind === 'ok' ? 'success' : 'error');
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
const headerText = computed(() =>
  (result.value?.headers ?? []).map((h) => `${h.name}: ${h.value}`).join('\n'),
);
const link = computed(() =>
  url.value.trim() ? shareLink(props.lang, 'headers', { url: url.value.trim() }) : '',
);
const targets = computed(() =>
  result.value?.finalUrl ? sendTargets(props.lang, 'headers', result.value.finalUrl) : [],
);

/** `strict-transport-security` → `Strict-Transport-Security`. */
const display = (header: string) =>
  header
    .split('-')
    .map((w) => (w === 'x' ? 'X' : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('-');
</script>

<template>
  <div class="uk-stack">
    <form class="uk-stack" @submit.prevent="run">
      <UrlInput
        id="headers-input"
        v-model="url"
        :label="text('ui.input.url')"
        :paste-label="text('ui.input.paste')"
        :clear-label="text('ui.input.clear')"
        catch-paste
        :hint="text('ui.headers.hint')"
        autofocus
      />
      <div class="uk-row">
        <button
          type="submit"
          class="uk-button"
          data-variant="primary"
          :disabled="loading || !url.trim()"
        >
          {{ text('ui.headers.button') }}
        </button>
        <span v-if="loading" role="status" class="uk-muted">{{ text('ui.headers.loading') }}</span>
      </div>
    </form>

    <div v-if="outcome?.kind === 'quota'" class="notice" role="alert">
      <p>{{ text('ui.headers.quota', { minutes }) }}</p>
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
      <section class="uk-card" aria-labelledby="headers-final">
        <h2 id="headers-final" class="uk-label">{{ text('ui.headers.final') }}</h2>
        <p v-if="result.status !== null" class="status">
          <span class="tag">{{ text('ui.headers.status', { status: result.status }) }}</span>
        </p>
        <p v-if="result.finalUrl" class="mono url">
          <InertLink :href="result.finalUrl" :text="result.finalUrl" />
        </p>
        <p v-else role="status">{{ text(`ui.inspect.stop.${result.stopReason}`) }}</p>
        <ErrorMessage v-if="result.error" :message="text(result.error)" />
        <p v-if="result.error?.code === 'inspect.tls' && PUBLISHED_TOOLS.includes('tls')">
          <a
            class="uk-button"
            :href="toolHref(lang, 'tls', { target: result.input })"
            @click="track('headers', 'sent-to')"
            >{{ text('ui.headers.toTls') }}</a
          >
        </p>
        <p v-if="result.hops > 0" class="uk-row">
          <span class="uk-muted">{{ text('ui.headers.hops', { count: result.hops }) }}</span>
          <a
            class="uk-button"
            :href="toolHref(lang, 'inspect', { url: result.input })"
            @click="track('headers', 'sent-to')"
            >{{ text('ui.headers.viewChain') }}</a
          >
        </p>
      </section>

      <p v-if="result.headers.length === 0" class="uk-muted">{{ text('ui.headers.noResponse') }}</p>

      <section v-if="result.security.length" aria-labelledby="headers-security" class="uk-stack">
        <h2 id="headers-security" class="uk-label">{{ text('ui.headers.security') }}</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">{{ text('ui.headers.header') }}</th>
              <th scope="col">{{ text('ui.headers.state') }}</th>
              <th scope="col">{{ text('ui.headers.detail') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="check in result.security" :key="check.header" :data-state="check.state">
              <th scope="row" class="mono">{{ display(check.header) }}</th>
              <td>
                <span class="state">{{ text(`ui.headers.state.${check.state}`) }}</span>
              </td>
              <td>
                <ul v-if="check.findings.length" class="findings">
                  <li v-for="finding in check.findings" :key="finding.code">{{ text(finding) }}</li>
                </ul>
                <span v-else-if="check.state === 'not-applicable'" class="uk-muted">{{
                  text('ui.headers.na')
                }}</span>
                <span v-else class="uk-muted">{{ text('ui.headers.ok') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="result.cookies.length" aria-labelledby="headers-cookies" class="uk-stack">
        <h2 id="headers-cookies" class="uk-label">{{ text('ui.headers.cookies') }}</h2>
        <p class="uk-muted">{{ text('ui.headers.cookieNote') }}</p>
        <table>
          <thead>
            <tr>
              <th scope="col">{{ text('ui.headers.cookie') }}</th>
              <th scope="col">Secure</th>
              <th scope="col">HttpOnly</th>
              <th scope="col">SameSite</th>
              <th scope="col">{{ text('ui.headers.detail') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(cookie, i) in result.cookies" :key="`${i}-${cookie.name}`">
              <td class="mono">{{ cookie.name }}</td>
              <td>{{ text(cookie.secure ? 'ui.headers.yes' : 'ui.headers.no') }}</td>
              <td>{{ text(cookie.httpOnly ? 'ui.headers.yes' : 'ui.headers.no') }}</td>
              <td>{{ cookie.sameSite ?? '—' }}</td>
              <td>
                <ul v-if="cookie.findings.length" class="findings">
                  <li v-for="finding in cookie.findings" :key="finding.code">
                    {{ text(finding) }}
                  </li>
                </ul>
                <span v-else class="uk-muted">{{ text('ui.headers.ok') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="result.headers.length" aria-labelledby="headers-list" class="uk-stack">
        <div class="uk-row between">
          <h2 id="headers-list" class="uk-label">{{ text('ui.headers.list') }}</h2>
          <CopyButton
            :value="headerText"
            :label="text('ui.headers.copy')"
            :copied-label="text('ui.headers.copied')"
            @copied="track('headers', 'copied')"
          />
        </div>
        <table>
          <thead>
            <tr>
              <th scope="col">{{ text('ui.headers.name') }}</th>
              <th scope="col">{{ text('ui.headers.value') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(h, i) in result.headers" :key="`${i}-${h.name}`">
              <td class="mono">{{ h.name }}</td>
              <td class="mono value">{{ h.value }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <p v-if="remaining !== null" class="uk-muted">
        {{ text('ui.headers.remaining', { remaining }) }}
      </p>
      <SendTo
        v-if="targets.length"
        :label="text('ui.sendTo')"
        :targets="targets"
        @send="track('headers', 'sent-to')"
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
.status {
  margin: 0 0 var(--space-2);
}
.tag {
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-accent-soft);
  font-size: var(--text-xs);
  font-weight: 600;
}
.url {
  margin: 0;
  word-break: break-all;
}
.between {
  justify-content: space-between;
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
.value {
  word-break: break-all;
}
.findings {
  margin: 0;
  padding-left: var(--space-4);
  font-size: var(--text-sm);
}
tr[data-state='missing'] .state,
tr[data-state='misconfigured'] .state {
  color: var(--color-caution);
  font-weight: 600;
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
