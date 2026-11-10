/**
 * Shareable links (T036, research R9): the input travels only in the URL fragment, which the
 * browser never sends to a server. Encoding comes from each tool's `share` in the registry.
 */
import type { ToolId } from '@urlkit/core';
import { getTool } from '@urlkit/core/tools';
import { t, type Lang } from '@urlkit/i18n';

export function readFragment<I>(
  tool: ToolId,
  hash = typeof location === 'undefined' ? '' : location.hash,
): I | null {
  if (!hash || hash === '#') return null;
  return getTool(tool).share.decode(hash) as I | null;
}

export function toolHref(lang: Lang, tool: ToolId, input?: unknown): string {
  const path = `/${lang}/${tool}`;
  if (input === undefined) return path;
  return `${path}#${getTool(tool).share.encode(input)}`;
}

/** Absolute shareable link for the current tool and input. */
export function shareLink(lang: Lang, tool: ToolId, input: unknown): string {
  return new URL(toolHref(lang, tool, input), location.origin).href;
}

/** Shown next to "Copiar enlace": the recipient will see the URL (FR-005). */
export const shareWarning = (lang: Lang) => t('ui.copyLink.warning', lang);

/** "Enviar a" targets for a URL, from the tool's `sendTo` list in the registry (FR-004). */
export function sendTargets(lang: Lang, from: ToolId, url: string) {
  return getTool(from).sendTo.map((id) => ({
    id,
    label: t(`ui.tool.${id}.name`, lang),
    href: toolHref(lang, id, id === 'diff' ? { a: url, b: '' } : { url }),
  }));
}
