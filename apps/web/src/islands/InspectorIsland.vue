<script setup lang="ts">
/**
 * Redirect Inspector island (T075). The only tool that calls the API (FR-006). It never runs on
 * its own: opening a shared link only fills the input; the visitor must press "Inspeccionar".
 */
import { computed, onMounted, ref } from 'vue';
import CopyButton from '@urlkit/ui/components/CopyButton.vue';
import ErrorMessage from '@urlkit/ui/components/ErrorMessage.vue';
import SendTo from '@urlkit/ui/components/SendTo.vue';
import UrlInput from '@urlkit/ui/components/UrlInput.vue';
import { inspect, type InspectOutcome } from '../lib/api.ts';
import { useText, type Lang } from '../lib/i18n.ts';
import { track } from '../lib/metrics.ts';
import { readFragment, sendTargets, shareLink, shareWarning, toolHref } from '../lib/share.ts';

const props = defineProps<{ lang: Lang }>();
const { text, part } = useText(props.lang);

const url = ref('');
const loading = ref(false);
const outcome = ref<InspectOutcome | null>(null);

onMounted(() => {
  const shared = readFragment<{ url: string }>('inspect');
  if (shared) url.value = shared.url;
});

async function run() {
  if (!url.value.trim() || loading.value) return;
  loading.value = true;
  outcome.value = null;
  outcome.value = await inspect(url.value.trim());
  loading.value = false;
}

const chain = computed(() => (outcome.value?.kind === 'ok' ? outcome.value.chain : null));
const finalUrl = computed(() => chain.value?.final ?? null);
const minutes = computed(() =>
  outcome.value?.kind === 'quota'
    ? Math.max(1, Math.ceil(outcome.value.retryAfterSeconds / 60))
    : 0,
);
const remaining = computed(() =>
  outcome.value?.kind === 'ok' ? outcome.value.rate.remaining : null,
);
const link = computed(() =>
  url.value.trim() ? shareLink(props.lang, 'inspect', { url: url.value.trim() }) : '',
);
const targets = computed(() =>
  finalUrl.value ? sendTargets(props.lang, 'inspect', finalUrl.value) : [],
);
</script>

<template>
  <div class="uk-stack">
    <form class="uk-stack" @submit.prevent="run">
      <UrlInput
        id="inspect-input"
        v-model="url"
        :label="text('ui.input.url')"
        :paste-label="text('ui.input.paste')"
        :clear-label="text('ui.input.clear')"
        catch-paste
        :hint="text('ui.inspect.hint')"
        autofocus
      />
      <div class="uk-row">
        <button
          type="submit"
          class="uk-button"
          data-variant="primary"
          :disabled="loading || !url.trim()"
        >
          {{ text('ui.inspect.button') }}
        </button>
        <span v-if="loading" role="status" class="uk-muted">{{ text('ui.inspect.loading') }}</span>
      </div>
    </form>

    <div v-if="outcome?.kind === 'quota'" class="notice" role="alert">
      <p>{{ text('ui.inspect.quota', { minutes }) }}</p>
      <p class="uk-muted">{{ text('ui.inspect.quotaShared') }}</p>
    </div>
    <ErrorMessage
      v-else-if="outcome?.kind === 'invalid'"
      :message="text(outcome.error.message)"
      :part="part(outcome.error.part)"
      :part-label="text('ui.error.part')"
    />
    <ErrorMessage v-else-if="outcome?.kind === 'network'" :message="text('ui.inspect.network')" />

    <template v-if="chain">
      <section aria-labelledby="inspect-chain" class="uk-stack">
        <h2 id="inspect-chain" class="uk-label">{{ text('ui.inspect.chain') }}</h2>
        <p role="status">
          {{ text(`ui.inspect.stop.${chain.stopReason}`) }}
          <span class="uk-muted">{{
            text('ui.inspect.total', { count: chain.hops.length, ms: chain.totalMs })
          }}</span>
        </p>
        <ol class="hops">
          <li v-for="hop in chain.hops" :key="hop.index" class="uk-card" :data-type="hop.type">
            <div class="uk-row head">
              <strong>{{ text('ui.inspect.step', { n: hop.index + 1 }) }}</strong>
              <span v-if="hop.status !== null" class="tag">{{
                text('ui.inspect.status', { status: hop.status })
              }}</span>
              <span class="uk-muted"
                >{{ text(`ui.inspect.type.${hop.type}`) }} ·
                {{ text('ui.inspect.duration', { ms: hop.durationMs }) }}</span
              >
            </div>
            <p class="mono url">{{ hop.url }}</p>
            <ul v-if="hop.flags.length" class="flags">
              <li v-for="flag in hop.flags" :key="flag">{{ text(`ui.inspect.flag.${flag}`) }}</li>
            </ul>
            <p v-if="hop.error" class="error">{{ text(hop.error) }}</p>
          </li>
        </ol>
      </section>

      <section v-if="finalUrl" class="uk-card" aria-labelledby="inspect-final">
        <h2 id="inspect-final" class="uk-label">{{ text('ui.inspect.final') }}</h2>
        <p class="mono url">{{ finalUrl }}</p>
        <div class="uk-row">
          <CopyButton
            :value="finalUrl"
            :label="text('ui.copy')"
            :copied-label="text('ui.copied')"
            variant="primary"
            @copied="track('inspect', 'copied')"
          />
          <a
            class="uk-button"
            :href="toolHref(lang, 'clean', { url: finalUrl })"
            @click="track('inspect', 'sent-to')"
            >{{ text('ui.inspect.cleanFinal') }}</a
          >
        </div>
      </section>
      <p v-if="remaining !== null" class="uk-muted">
        {{ text('ui.inspect.remaining', { remaining }) }}
      </p>
      <SendTo
        v-if="finalUrl"
        :label="text('ui.sendTo')"
        :targets="targets"
        @send="track('inspect', 'sent-to')"
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
.hops {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.hops li[data-type='final'] {
  border-color: var(--color-accent);
}
.head {
  justify-content: flex-start;
}
.tag {
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-accent-soft);
  font-size: var(--text-xs);
  font-weight: 600;
}
.url {
  margin: var(--space-2) 0 0;
  word-break: break-all;
}
.flags {
  margin: var(--space-2) 0 0;
  padding-left: var(--space-5);
  color: var(--color-caution);
  font-size: var(--text-sm);
}
.error {
  margin: var(--space-2) 0 0;
  color: var(--color-danger);
  font-size: var(--text-sm);
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
