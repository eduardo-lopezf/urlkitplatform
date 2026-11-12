<script setup lang="ts">
/**
 * Security Analysis island (002/T087). Calls POST /v1/security only when the visitor presses
 * "Analizar". It lists findings under severity headings, each linked to the tool that explains
 * it, and always shows what was not checked. It never shows a score or a verdict (FR-064).
 */
import { computed, onMounted, ref } from 'vue';
import type { ToolId } from '@urlkit/core';
import ErrorMessage from '@urlkit/ui/components/ErrorMessage.vue';
import InertLink from '@urlkit/ui/components/InertLink.vue';
import UrlInput from '@urlkit/ui/components/UrlInput.vue';
import { callTool, type ServerTools, type ToolOutcome } from '../lib/api.ts';
import { useText, type Lang } from '../lib/i18n.ts';
import { track } from '../lib/metrics.ts';
import { readFragment, shareLink, shareWarning, toolHref, toolInput } from '../lib/share.ts';
import { PUBLISHED_TOOLS } from '../lib/tools.ts';
import CopyButton from '@urlkit/ui/components/CopyButton.vue';

type Review = ServerTools['security']['response'];
type Severity = Review['findings'][number]['severity'];

const SEVERITIES: Severity[] = ['high', 'medium', 'low', 'info'];
const PARTS = ['explain', 'redirects', 'headers', 'tls', 'dns'] as const;

const props = defineProps<{ lang: Lang }>();
const { text, part } = useText(props.lang);

const url = ref('');
const loading = ref(false);
const outcome = ref<ToolOutcome<Review> | null>(null);

onMounted(() => {
  const shared = readFragment<{ url: string }>('security');
  if (shared) url.value = shared.url;
});

async function run() {
  if (!url.value.trim() || loading.value) return;
  loading.value = true;
  outcome.value = null;
  outcome.value = await callTool('security', { url: url.value.trim() });
  loading.value = false;
  track('security', outcome.value.kind === 'ok' ? 'success' : 'error');
}

const result = computed(() => (outcome.value?.kind === 'ok' ? outcome.value.value : null));
const groups = computed(() =>
  SEVERITIES.map((severity) => ({
    severity,
    findings: (result.value?.findings ?? []).filter((f) => f.severity === severity),
  })).filter((g) => g.findings.length > 0),
);
const minutes = computed(() =>
  outcome.value?.kind === 'quota'
    ? Math.max(1, Math.ceil(outcome.value.retryAfterSeconds / 60))
    : 0,
);
const remaining = computed(() =>
  outcome.value?.kind === 'ok' ? outcome.value.rate.remaining : null,
);
const link = computed(() =>
  url.value.trim() ? shareLink(props.lang, 'security', { url: url.value.trim() }) : '',
);

/** Link to the tool that explains a finding: the input, or the destination for TLS and DNS. */
function detail(tool: ToolId): string | null {
  const r = result.value;
  if (!r || !PUBLISHED_TOOLS.includes(tool)) return null;
  const subject = tool === 'tls' || tool === 'dns' ? (r.finalUrl ?? r.input) : r.input;
  return toolHref(props.lang, tool, toolInput(tool, subject));
}
</script>

<template>
  <div class="uk-stack">
    <form class="uk-stack" @submit.prevent="run">
      <UrlInput
        id="security-input"
        v-model="url"
        :label="text('ui.input.url')"
        :paste-label="text('ui.input.paste')"
        :clear-label="text('ui.input.clear')"
        catch-paste
        :hint="text('ui.security.hint')"
        autofocus
      />
      <div class="uk-row">
        <button
          type="submit"
          class="uk-button"
          data-variant="primary"
          :disabled="loading || !url.trim()"
        >
          {{ text('ui.security.button') }}
        </button>
        <span v-if="loading" role="status" class="uk-muted">{{ text('ui.security.loading') }}</span>
      </div>
    </form>

    <div v-if="outcome?.kind === 'quota'" class="notice" role="alert">
      <p>{{ text('ui.security.quota', { minutes }) }}</p>
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
      <p v-if="result.finalUrl" class="final">
        <span class="uk-label">{{ text('ui.security.final') }}</span>
        <span class="mono url"><InertLink :href="result.finalUrl" :text="result.finalUrl" /></span>
      </p>

      <section aria-labelledby="security-findings" class="uk-stack">
        <h2 id="security-findings" class="uk-label">{{ text('ui.security.findings') }}</h2>
        <p v-if="groups.length === 0">{{ text('ui.security.none') }}</p>
        <div
          v-for="group in groups"
          :key="group.severity"
          class="group"
          :data-severity="group.severity"
        >
          <h3>{{ text(`ui.security.severity.${group.severity}`) }}</h3>
          <ul>
            <li v-for="(finding, i) in group.findings" :key="`${finding.code}-${i}`">
              <span>{{ text(finding) }}</span>
              <a
                v-if="detail(finding.tool)"
                class="detail"
                :href="detail(finding.tool) ?? undefined"
                @click="track('security', 'sent-to')"
                >{{ text('ui.security.detail', { tool: text(`ui.tool.${finding.tool}.name`) }) }}</a
              >
            </li>
          </ul>
        </div>
      </section>

      <section class="uk-card not-checked" aria-labelledby="security-not-checked">
        <h2 id="security-not-checked" class="uk-label">{{ text('ui.security.notChecked') }}</h2>
        <ul>
          <li v-for="item in result.scope.notChecked" :key="item">
            {{ text(`security.not-checked.${item}`) }}
          </li>
        </ul>
        <p class="uk-muted">{{ text('ui.security.notCheckedNote') }}</p>
      </section>

      <section aria-labelledby="security-parts">
        <h2 id="security-parts" class="uk-label">{{ text('ui.security.parts') }}</h2>
        <dl class="parts">
          <template v-for="name in PARTS" :key="name">
            <dt>{{ text(`ui.security.part.${name}`) }}</dt>
            <dd :data-state="result.parts[name].state">
              {{ text(`ui.security.state.${result.parts[name].state}`) }}
              <span v-if="result.parts[name].reason" class="uk-muted reason">{{
                text(result.parts[name].reason!)
              }}</span>
            </dd>
          </template>
        </dl>
      </section>

      <p v-if="remaining !== null" class="uk-muted">
        {{ text('ui.security.remaining', { remaining }) }}
      </p>
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
.final {
  margin: 0;
}
.url {
  display: block;
  word-break: break-all;
}
.group {
  padding-left: var(--space-3);
  border-left: 4px solid var(--color-border);
}
.group[data-severity='high'] {
  border-left-color: var(--color-danger);
}
.group[data-severity='medium'] {
  border-left-color: var(--color-caution);
}
.group h3 {
  margin: 0 0 var(--space-1);
  font-size: var(--text-base);
}
.group ul,
.not-checked ul {
  margin: 0;
  padding-left: var(--space-5);
}
.group li + li {
  margin-top: var(--space-2);
}
.detail {
  display: block;
  font-size: var(--text-sm);
}
.not-checked p {
  margin: var(--space-2) 0 0;
}
.parts {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--space-1) var(--space-3);
  margin: 0;
}
.parts dt {
  font-size: var(--text-sm);
  font-weight: 600;
}
.parts dd {
  margin: 0;
}
.reason {
  display: block;
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
  .parts {
    grid-template-columns: 1fr;
  }
}
</style>
