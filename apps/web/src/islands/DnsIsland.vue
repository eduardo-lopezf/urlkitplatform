<script setup lang="ts">
/**
 * DNS island (002/T073). Calls POST /v1/dns only when the visitor presses "Consultar". Record
 * data is shown as escaped text; long TXT records wrap instead of widening the page.
 */
import { computed, onMounted, ref } from 'vue';
import { RECORD_TYPES, type DnsScope } from '@urlkit/core';
import CopyButton from '@urlkit/ui/components/CopyButton.vue';
import ErrorMessage from '@urlkit/ui/components/ErrorMessage.vue';
import SendTo from '@urlkit/ui/components/SendTo.vue';
import UrlInput from '@urlkit/ui/components/UrlInput.vue';
import { callTool, type ServerTools, type ToolOutcome } from '../lib/api.ts';
import { useText, type Lang } from '../lib/i18n.ts';
import { track } from '../lib/metrics.ts';
import { readFragment, sendTargets, shareLink, shareWarning, toolHref } from '../lib/share.ts';

type Lookup = ServerTools['dns']['response'];
type Record_ = Lookup['records']['A']['records'][number];

const props = defineProps<{ lang: Lang }>();
const { text, part } = useText(props.lang);

const target = ref('');
const scope = ref<DnsScope>('host');
const loading = ref(false);
const outcome = ref<ToolOutcome<Lookup> | null>(null);

onMounted(() => {
  const shared = readFragment<{ target: string; scope: DnsScope }>('dns');
  if (shared) {
    target.value = shared.target;
    scope.value = shared.scope;
  }
});

async function run() {
  if (!target.value.trim() || loading.value) return;
  loading.value = true;
  outcome.value = null;
  const input = { target: target.value.trim(), scope: scope.value };
  // The fragment follows the input, so the page can be shared as it is (never sent anywhere).
  history.replaceState(null, '', toolHref(props.lang, 'dns', input));
  outcome.value = await callTool('dns', input);
  loading.value = false;
  track('dns', outcome.value.kind === 'ok' ? 'success' : 'error');
}

function lookUpAlternative(kind: DnsScope) {
  scope.value = kind;
  void run();
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
const targets = computed(() =>
  result.value && result.value.outcome === 'exists'
    ? sendTargets(props.lang, 'dns', `https://${result.value.name.ascii}/`)
    : [],
);
const link = computed(() =>
  target.value.trim()
    ? shareLink(props.lang, 'dns', { target: target.value.trim(), scope: scope.value })
    : '',
);

/** One line per record, as `dig` would print its data. */
function show(record: Record_): string {
  const d = record.data;
  if (typeof d === 'string') return d;
  if ('priority' in d) return `${d.priority} ${d.exchange}`;
  if ('tag' in d) return `${d.flags} ${d.tag} "${d.value}"`;
  if ('mname' in d)
    return `${d.mname} ${d.rname} ${d.serial} ${d.refresh} ${d.retry} ${d.expire} ${d.minimum}`;
  return JSON.stringify(d);
}
const copyText = (records: Record_[]) =>
  records.map((r) => `${r.name} ${r.ttl} ${show(r)}`).join('\n');
</script>

<template>
  <div class="uk-stack">
    <form class="uk-stack" @submit.prevent="run">
      <UrlInput
        id="dns-input"
        v-model="target"
        :label="text('ui.dns.input')"
        :paste-label="text('ui.input.paste')"
        :clear-label="text('ui.input.clear')"
        catch-paste
        :hint="text('ui.dns.hint')"
        autofocus
      />
      <div class="uk-row">
        <button
          type="submit"
          class="uk-button"
          data-variant="primary"
          :disabled="loading || !target.trim()"
        >
          {{ text('ui.dns.button') }}
        </button>
        <span v-if="loading" class="uk-muted">{{ text('ui.dns.loading') }}</span>
      </div>
    </form>

    <div v-if="outcome?.kind === 'quota'" class="notice" role="alert">
      <p>{{ text('ui.dns.quota', { minutes }) }}</p>
      <p class="uk-muted">{{ text('ui.inspect.quotaShared') }}</p>
    </div>
    <ErrorMessage
      v-else-if="outcome?.kind === 'invalid' || outcome?.kind === 'unavailable'"
      :message="text(outcome.error.message)"
      :part="outcome.kind === 'invalid' ? part(outcome.error.part) : undefined"
      :part-label="text('ui.error.part')"
    />
    <ErrorMessage v-else-if="outcome?.kind === 'network'" :message="text('ui.inspect.network')" />

    <template v-if="result">
      <section class="uk-card summary" :data-outcome="result.outcome" aria-labelledby="dns-name">
        <h2 id="dns-name" class="uk-label mono">
          {{ result.name.unicode
          }}<span v-if="result.name.unicode !== result.name.ascii" class="uk-muted">
            ({{ result.name.ascii }})</span
          >
        </h2>
        <p role="status">{{ text(`ui.dns.outcome.${result.outcome}`) }}</p>
        <p>{{ text(`ui.dns.dnssec.${result.dnssec}`) }}</p>
        <p class="uk-muted">
          {{ text('ui.dns.resolver', { resolver: text(`ui.dns.resolver.${result.resolver}`) }) }}
        </p>
        <button
          v-if="result.alternative"
          type="button"
          class="uk-button"
          :disabled="loading"
          @click="lookUpAlternative(result.alternative.kind)"
        >
          {{ text('ui.dns.also', { name: result.alternative.unicode }) }}
        </button>
      </section>

      <section v-if="result.warnings.length" aria-labelledby="dns-warnings">
        <h2 id="dns-warnings" class="uk-label">{{ text('ui.dns.warnings') }}</h2>
        <ul class="warnings">
          <li v-for="warning in result.warnings" :key="warning.code">{{ text(warning) }}</li>
        </ul>
      </section>

      <section v-if="result.outcome === 'exists'" aria-labelledby="dns-records" class="uk-stack">
        <h2 id="dns-records" class="uk-label">{{ text('ui.dns.records') }}</h2>
        <div
          v-for="type in RECORD_TYPES"
          :key="type"
          class="type"
          :data-state="result.records[type].state"
        >
          <div class="uk-row between">
            <h3 class="mono">{{ type }}</h3>
            <CopyButton
              v-if="result.records[type].records.length"
              :value="copyText(result.records[type].records)"
              :label="text('ui.dns.copyType', { type })"
              :copied-label="text('ui.dns.copied')"
              @copied="track('dns', 'copied')"
            />
          </div>
          <ul v-if="result.records[type].records.length" class="records">
            <li v-for="(record, i) in result.records[type].records" :key="i">
              <span class="mono data">{{ show(record) }}</span>
              <span class="uk-muted">{{ text('ui.dns.ttl', { ttl: record.ttl }) }}</span>
            </li>
          </ul>
          <p v-else class="uk-muted">
            {{ text(result.records[type].state === 'failed' ? 'ui.dns.failed' : 'ui.dns.empty') }}
          </p>
        </div>
      </section>

      <p v-if="remaining !== null" class="uk-muted">
        {{ text('ui.dns.remaining', { remaining }) }}
      </p>
      <SendTo
        v-if="targets.length"
        :label="text('ui.sendTo')"
        :targets="targets"
        @send="track('dns', 'sent-to')"
      />
    </template>

    <div v-if="target.trim()" class="uk-row">
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
.summary p {
  margin: 0 0 var(--space-2);
}
.summary[data-outcome='nxdomain'],
.summary[data-outcome='failed'] {
  border-left: 4px solid var(--color-danger);
}
.summary[data-outcome='exists'] {
  border-left: 4px solid var(--color-accent);
}
.between {
  justify-content: space-between;
}
.type {
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}
.type h3 {
  margin: 0;
  font-size: var(--text-base);
}
.type p {
  margin: var(--space-1) 0 0;
}
.records {
  display: grid;
  gap: var(--space-1);
  margin: var(--space-1) 0 0;
  padding: 0;
  list-style: none;
}
.records li {
  display: grid;
  min-width: 0;
}
.data {
  overflow-wrap: anywhere;
  word-break: break-all;
}
.warnings {
  margin: 0;
  padding-left: var(--space-5);
  color: var(--color-caution);
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
</style>
