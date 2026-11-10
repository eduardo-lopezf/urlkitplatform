/** Presentation helpers for the islands: text lookup bound to a language. */
import { t, type Lang, type TextKey } from '@urlkit/i18n';

export type { Lang };

/** A message from the core or from the API contract (whose codes include quota and auth). */
type Message = { code: string; params?: Record<string, string | number> | undefined };

export function useText(lang: Lang) {
  const text = (key: TextKey | Message, params?: Record<string, string | number>) => {
    const ref = typeof key === 'string' ? { code: key, ...(params ? { params } : {}) } : key;
    return t(
      { code: ref.code, ...(ref.params ? { params: ref.params } : {}) } as Parameters<typeof t>[0],
      lang,
    );
  };
  /** Label for the `part` of an error (`host`, `a.port`…). */
  const part = (value: string | undefined) =>
    value === undefined
      ? undefined
      : value
          .split('.')
          .map((p) => t(`ui.part.${p}` as TextKey, lang))
          .join(' · ');
  return { text, part };
}
