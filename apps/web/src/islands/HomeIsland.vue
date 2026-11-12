<script setup lang="ts">
/**
 * Home input (T054, T097): one URL goes to the cleaner by default; two URLs suggest URL Diff and
 * a known short link suggests Redirect Inspector. The decision comes from the core.
 */
import { computed, ref } from 'vue';
import { suggestTool, type ToolId } from '@urlkit/core';
import UrlInput from '@urlkit/ui/components/UrlInput.vue';
import ToolIcon from '@urlkit/ui/components/ToolIcon.vue';
import { useText, type Lang } from '../lib/i18n.ts';
import { toolHref } from '../lib/share.ts';
import { ANALYSIS_TOOLS, MVP_TOOLS } from '../lib/tools.ts';

const props = defineProps<{ lang: Lang }>();
const { text } = useText(props.lang);
const input = ref('');

const suggestion = computed(() => suggestTool(input.value));

function href(tool: ToolId): string {
  const s = suggestion.value;
  if (!s) return toolHref(props.lang, tool);
  if (tool === 'diff')
    return toolHref(props.lang, 'diff', { a: s.urls[0] ?? '', b: s.urls[1] ?? '' });
  return toolHref(props.lang, tool, { url: s.urls[0] ?? '' });
}

function open() {
  if (suggestion.value) window.location.assign(href(suggestion.value.tool));
}

const others = computed(() => MVP_TOOLS.filter((id) => id !== suggestion.value?.tool));
</script>

<template>
  <div class="uk-stack">
    <form class="uk-stack" @submit.prevent="open">
      <UrlInput
        id="home-input"
        v-model="input"
        :label="text('ui.home.input')"
        :paste-label="text('ui.input.paste')"
        :clear-label="text('ui.input.clear')"
        catch-paste
        :hint="text('ui.local')"
        autofocus
      />
    </form>

    <section v-if="suggestion" class="uk-card" aria-labelledby="home-suggestion" aria-live="polite">
      <h2 id="home-suggestion" class="uk-label">{{ text('ui.home.suggested') }}</h2>
      <p>{{ text(`ui.home.reason.${suggestion.tool}` as never) }}</p>
      <a class="uk-button" data-variant="primary" :href="href(suggestion.tool)">
        {{ text('ui.home.open', { tool: text(`ui.tool.${suggestion.tool}.name`) }) }}
      </a>
    </section>

    <section aria-labelledby="home-tools">
      <h2 id="home-tools" class="uk-label">{{ text('ui.home.tools') }}</h2>
      <ul class="tools">
        <li v-for="id in suggestion ? others : MVP_TOOLS" :key="id">
          <a :href="href(id)">
            <ToolIcon :tool="id" />
            <strong>{{ text(`ui.tool.${id}.name`) }}</strong>
            <span class="tip" role="tooltip">{{ text(`ui.tool.${id}.summary`) }}</span>
          </a>
        </li>
      </ul>
    </section>

    <section v-if="ANALYSIS_TOOLS.length > 0" aria-labelledby="home-analysis">
      <h2 id="home-analysis" class="uk-label">{{ text('ui.home.analysis') }}</h2>
      <ul class="tools">
        <li v-for="id in ANALYSIS_TOOLS" :key="id">
          <!-- Network tools never receive the input from home: they need an explicit action. -->
          <a :href="toolHref(props.lang, id)">
            <ToolIcon :tool="id" />
            <strong>{{ text(`ui.tool.${id}.name`) }}</strong>
            <span class="tip" role="tooltip">{{ text(`ui.tool.${id}.summary`) }}</span>
          </a>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.tools {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.tools a {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text);
  text-decoration: none;
}
.tools a :deep(.uk-icon) {
  margin-bottom: var(--space-1);
}
.tools a {
  position: relative;
}
/* The summary stays in the DOM (screen readers read it) and shows as a tooltip on hover/focus. */
.tip {
  position: absolute;
  left: var(--space-4);
  bottom: calc(100% + var(--space-1));
  z-index: 1;
  max-width: 18rem;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.875em;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 120ms;
}
.tools a:hover .tip,
.tools a:focus-visible .tip {
  opacity: 1;
  visibility: visible;
}
.tools a:hover {
  background: var(--color-surface);
}
</style>
