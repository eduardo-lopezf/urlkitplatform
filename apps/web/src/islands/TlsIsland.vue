<script setup lang="ts">
/**
 * TLS island (002/T061). Calls POST /v1/tls only when the visitor presses "Analizar". An invalid
 * certificate is shown in full, with its problems: it is the result, not an error.
 */
import { computed, onMounted, ref } from 'vue';
import CopyButton from '@urlkit/ui/components/CopyButton.vue';
import ErrorMessage from '@urlkit/ui/components/ErrorMessage.vue';
import SendTo from '@urlkit/ui/components/SendTo.vue';
import UrlInput from '@urlkit/ui/components/UrlInput.vue';
import { callTool, type ServerTools, type ToolOutcome } from '../lib/api.ts';
import { useText, type Lang } from '../lib/i18n.ts';
import { track } from '../lib/metrics.ts';
import { readFragment, sendTargets, shareLink, shareWarning } from '../lib/share.ts';

type Analysis = ServerTools['tls']['response'];
type Cert = Analysis['chain'][number];

const props = defineProps<{ lang: Lang }>();
const { text, part } = useText(props.lang);

const target = ref('');
const loading = ref(false);
const outcome = ref<ToolOutcome<Analysis> | null>(null);

onMounted(() => {
  const shared = readFragment<{ target: string }>('tls');
  if (shared) target.value = shared.target;
});

async function run() {
  if (!target.value.trim() || loading.value) return;
  loading.value = true;
  outcome.value = null;
  outcome.value = await callTool('tls', { target: target.value.trim() });
  loading.value = false;
  track('tls', outcome.value.kind === 'ok' ? 'success' : 'error');
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
const hostName = computed(() => {
  const h = result.value?.host;
  return h ? ('ip' in h ? h.ip : h.ascii) : '';
});
/** The https URL the other tools receive through "Enviar a". */
const siteUrl = computed(() => {
  const r = result.value;
  if (!r || !hostName.value) return '';
  return `https://${hostName.value}${r.port === 443 ? '' : `:${r.port}`}/`;
});
const targets = computed(() =>
  siteUrl.value ? sendTargets(props.lang, 'tls', siteUrl.value) : [],
);
const link = computed(() =>
  target.value.trim() ? shareLink(props.lang, 'tls', { target: target.value.trim() }) : '',
);

const role = (cert: Cert, index: number, total: number) =>
  index === 0
    ? 'leaf'
    : index === total - 1 && cert.subject === cert.issuer
      ? 'root'
      : 'intermediate';
const day = (iso: string) => iso.slice(0, 10);
</script>

<template>
  <div class="uk-stack">
    <form class="uk-stack" @submit.prevent="run">
      <UrlInput
        id="tls-input"
        v-model="target"
        :label="text('ui.tls.input')"
        :paste-label="text('ui.input.paste')"
        :clear-label="text('ui.input.clear')"
        catch-paste
        :hint="text('ui.tls.hint')"
        autofocus
      />
      <div class="uk-row">
        <button
          type="submit"
          class="uk-button"
          data-variant="primary"
          :disabled="loading || !target.trim()"
        >
          {{ text('ui.tls.button') }}
        </button>
        <span v-if="loading" role="status" class="uk-muted">{{ text('ui.tls.loading') }}</span>
      </div>
    </form>

    <div v-if="outcome?.kind === 'quota'" class="notice" role="alert">
      <p>{{ text('ui.tls.quota', { minutes }) }}</p>
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
      <ErrorMessage v-if="result.blocked" :message="text(result.blocked)" />
      <ErrorMessage v-else-if="result.error" :message="text(result.error)" />

      <section
        v-if="result.trust"
        class="uk-card summary"
        :data-trust="result.trust"
        aria-labelledby="tls-summary"
      >
        <h2 id="tls-summary" class="uk-label">{{ hostName }}:{{ result.port }}</h2>
        <p role="status">{{ text(`ui.tls.${result.trust}`) }}</p>
        <h3 class="uk-label">{{ text('ui.tls.problems') }}</h3>
        <ul v-if="result.problems.length" class="problems">
          <li v-for="problem in result.problems" :key="problem.code">{{ text(problem) }}</li>
        </ul>
        <p v-else class="uk-muted">{{ text('ui.tls.noProblems') }}</p>
      </section>

      <section v-if="result.trust" aria-labelledby="tls-connection">
        <h2 id="tls-connection" class="uk-label">{{ text('ui.tls.connection') }}</h2>
        <dl class="facts">
          <dt>{{ text('ui.tls.protocol') }}</dt>
          <dd class="mono">{{ result.protocol ?? '—' }}</dd>
          <dt>{{ text('ui.tls.cipher') }}</dt>
          <dd class="mono">{{ result.cipher ?? '—' }}</dd>
          <dt>{{ text('ui.tls.alpn') }}</dt>
          <dd class="mono">{{ result.alpn ?? '—' }}</dd>
          <dt>{{ text('ui.tls.sni') }}</dt>
          <dd :class="{ mono: result.sniSent }">
            {{ result.sniSent ? hostName : text('ui.tls.sniNo') }}
          </dd>
        </dl>
      </section>

      <section v-if="result.chain.length" aria-labelledby="tls-chain" class="uk-stack">
        <h2 id="tls-chain" class="uk-label">{{ text('ui.tls.chain') }}</h2>
        <ol class="chain">
          <li v-for="(cert, i) in result.chain" :key="cert.fingerprint256" class="uk-card">
            <p class="uk-muted">{{ text(`ui.tls.role.${role(cert, i, result.chain.length)}`) }}</p>
            <h3 class="mono subject">{{ cert.subject }}</h3>
            <dl class="facts">
              <dt>{{ text('ui.tls.issuer') }}</dt>
              <dd class="mono">{{ cert.issuer }}</dd>
              <template v-if="cert.subjectAltNames.length">
                <dt>{{ text('ui.tls.names') }}</dt>
                <dd class="mono">{{ cert.subjectAltNames.join(', ') }}</dd>
              </template>
              <dt>{{ text('ui.tls.validity') }}</dt>
              <dd>
                {{
                  text('ui.tls.validRange', { from: day(cert.validFrom), to: day(cert.validTo) })
                }}
                <span class="days" :data-expired="cert.daysRemaining < 0">{{
                  text('ui.tls.days', { days: cert.daysRemaining })
                }}</span>
              </dd>
              <dt>{{ text('ui.tls.signature') }}</dt>
              <dd class="mono">{{ cert.signatureAlgorithm }}</dd>
              <dt>{{ text('ui.tls.serial') }}</dt>
              <dd class="mono">{{ cert.serialNumber }}</dd>
              <dt>{{ text('ui.tls.fingerprint') }}</dt>
              <dd class="mono fingerprint">
                {{ cert.fingerprint256 }}
                <CopyButton
                  :value="cert.fingerprint256"
                  :label="text('ui.tls.copyFingerprint')"
                  :copied-label="text('ui.tls.copied')"
                  @copied="track('tls', 'copied')"
                />
              </dd>
            </dl>
          </li>
        </ol>
      </section>

      <section v-if="result.trust" aria-labelledby="tls-ct">
        <h2 id="tls-ct" class="uk-label">{{ text('ui.tls.transparency') }}</h2>
        <p>
          {{
            text(`ui.tls.transparency.${result.transparency.status}`, {
              count: result.transparency.count,
            })
          }}
        </p>
        <p class="uk-muted">{{ text('ui.tls.transparencyNote') }}</p>
      </section>

      <p v-if="remaining !== null" class="uk-muted">
        {{ text('ui.tls.remaining', { remaining }) }}
      </p>
      <SendTo
        v-if="targets.length && !result.blocked"
        :label="text('ui.sendTo')"
        :targets="targets"
        @send="track('tls', 'sent-to')"
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
.summary[data-trust='untrusted'] {
  border-left: 4px solid var(--color-danger);
}
.summary[data-trust='trusted'] {
  border-left: 4px solid var(--color-accent);
}
.summary p {
  margin: 0 0 var(--space-3);
}
.problems {
  margin: 0;
  padding-left: var(--space-5);
}
.facts {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--space-1) var(--space-3);
  margin: 0;
}
.facts dt {
  font-size: var(--text-sm);
  font-weight: 600;
}
.facts dd {
  margin: 0;
  word-break: break-all;
}
.chain {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.chain p {
  margin: 0;
}
.subject {
  margin: var(--space-1) 0 var(--space-2);
  font-size: var(--text-base);
  word-break: break-all;
}
.days {
  display: block;
}
.days[data-expired='true'] {
  color: var(--color-danger);
  font-weight: 600;
}
.fingerprint {
  display: grid;
  gap: var(--space-1);
  justify-items: start;
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
  .facts {
    grid-template-columns: 1fr;
  }
}
</style>
