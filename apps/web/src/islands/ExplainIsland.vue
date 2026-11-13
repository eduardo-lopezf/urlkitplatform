<script setup lang="ts">
/**
 * Explain URL island (T091): the real site first, then every part in plain language and the
 * notices. Signals are information, never a "safe/unsafe" verdict (FR-054).
 */
import { computed, onMounted, ref, watch } from 'vue';
import { explain, hostToUnicode } from '@urlkit/core';
import { catalog } from '@urlkit/rules';
import CopyButton from '@urlkit/ui/components/CopyButton.vue';
import ErrorMessage from '@urlkit/ui/components/ErrorMessage.vue';
import SendTo from '@urlkit/ui/components/SendTo.vue';
import UrlInput from '@urlkit/ui/components/UrlInput.vue';
import { useText, type Lang } from '../lib/i18n.ts';
import { runTracker, track } from '../lib/metrics.ts';
import { readFragment, sendTargets, shareLink, shareWarning } from '../lib/share.ts';

const props = defineProps<{ lang: Lang }>();
const { text, part } = useText(props.lang);

const url = ref('');
onMounted(() => {
  const shared = readFragment<{ url: string }>('explain');
  if (shared) url.value = shared.url;
});

const result = computed(() => (url.value.trim() ? explain({ url: url.value, catalog }) : null));
const ok = computed(() => (result.value?.ok ? result.value.value : null));
const error = computed(() => (result.value && !result.value.ok ? result.value.error : null));

const tracker = runTracker('explain');
watch(result, (r) => r && tracker(url.value, r.ok));

/**
 * A homograph or mixed-script host is shown by its ASCII form first: its Unicode form reads as
 * the site it imitates (T103 rehearsal, SC-007). Other hosts keep their Unicode form.
 */
const deceptive = computed(
  () => ok.value?.signals.some((s) => s.id === 'homograph' || s.id === 'mixed-scripts') ?? false,
);

/** Host split so the registrable domain can be highlighted. */
const host = computed(() => {
  if (!ok.value) return null;
  const registrable = ok.value.url.registrableDomain;
  const full = deceptive.value ? ok.value.url.host.ascii : ok.value.url.host.unicode;
  const domain = registrable ? (deceptive.value ? registrable : hostToUnicode(registrable)) : null;
  if (!domain || !full.endsWith(domain)) return { before: '', domain: full };
  return { before: full.slice(0, full.length - domain.length), domain };
});

const link = computed(() => (ok.value ? shareLink(props.lang, 'explain', { url: url.value }) : ''));
const targets = computed(() =>
  ok.value ? sendTargets(props.lang, 'explain', ok.value.url.href) : [],
);
</script>

<template>
  <div class="uk-stack">
    <UrlInput
      id="explain-input"
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

    <template v-if="ok">
      <section
        v-if="host && ok.url.host.kind !== 'none'"
        class="uk-card site"
        aria-labelledby="explain-site"
      >
        <h2 id="explain-site" class="uk-label">{{ text('ui.explain.realSite') }}</h2>
        <p class="mono host">
          <span class="uk-muted">{{ host.before }}</span
          ><mark>{{ host.domain }}</mark>
        </p>
        <p v-if="deceptive" class="uk-muted mono">
          {{ text('ui.explain.looksLike', { host: ok.url.host.unicode }) }}
        </p>
        <p v-else-if="ok.url.host.ascii !== ok.url.host.unicode" class="uk-muted mono">
          {{ ok.url.host.ascii }}
        </p>
      </section>

      <section aria-labelledby="explain-signals" class="uk-stack">
        <h2 id="explain-signals" class="uk-label">{{ text('ui.explain.signals') }}</h2>
        <p class="uk-muted">{{ text('ui.explain.disclaimer') }}</p>
        <ul v-if="ok.signals.length" class="signals">
          <li v-for="s in ok.signals" :key="s.id" :data-severity="s.severity">
            <strong>{{ text(`ui.explain.severity.${s.severity}`) }}</strong>
            <span>{{ text(s.message) }}</span>
          </li>
        </ul>
        <p v-else role="status">{{ text('ui.explain.noSignals') }}</p>
      </section>

      <section aria-labelledby="explain-parts">
        <h2 id="explain-parts" class="uk-label">{{ text('ui.explain.parts') }}</h2>
        <dl class="parts">
          <template v-for="(p, i) in ok.parts" :key="i">
            <dt>
              {{ text(`ui.explain.component.${p.component}` as never) }}
              <code>{{ p.value }}</code>
            </dt>
            <dd>{{ text(p.message) }}</dd>
          </template>
        </dl>
      </section>

      <SendTo :label="text('ui.sendTo')" :targets="targets" @send="track('explain', 'sent-to')" />
      <div class="uk-row">
        <CopyButton
          :value="link"
          :label="text('ui.copyLink')"
          :copied-label="text('ui.copyLink.copied')"
          :description="shareWarning(lang)"
          @copied="track('explain', 'copied')"
        />
        <span class="uk-muted">{{ shareWarning(lang) }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.host {
  margin: 0;
  font-size: var(--text-lg);
  word-break: break-all;
}
mark {
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--color-mark);
  color: var(--color-text);
  font-weight: 700;
}
.site p + p {
  margin: var(--space-1) 0 0;
}
.signals {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.signals li {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border-left: 4px solid var(--color-accent);
  border-radius: var(--radius);
  background: var(--color-accent-soft);
}
.signals li[data-severity='caution'] {
  border-left-color: var(--color-caution);
  background: var(--color-caution-soft);
}
.parts {
  margin: 0;
}
.parts dt {
  margin-top: var(--space-3);
  font-weight: 600;
  font-size: var(--text-sm);
}
.parts dt code {
  font-weight: 400;
  word-break: break-all;
}
.parts dd {
  margin: var(--space-1) 0 0;
}
</style>
