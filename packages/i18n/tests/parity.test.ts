import { describe, expect, it } from 'vitest';
import { CODES } from '@urlkit/core';
import en from '../src/en.json' with { type: 'json' };
import es from '../src/es.json' with { type: 'json' };
import { t } from '../src/index.ts';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n catalogs', () => {
  it('es and en have exactly the same keys', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it('has a text for every code the core emits', () => {
    const missing = CODES.filter((code) => !(code in es) || !(code in en));
    expect(missing).toEqual([]);
  });

  it('uses the same placeholders in both languages', () => {
    for (const [key, text] of Object.entries(es)) {
      expect(placeholders(text), key).toEqual(
        placeholders((en as Record<string, string>)[key] ?? ''),
      );
    }
  });

  it('has no empty texts', () => {
    for (const [key, text] of [...Object.entries(es), ...Object.entries(en)]) {
      expect(text.trim(), key).not.toBe('');
    }
  });
});

describe('t()', () => {
  it('interpolates parameters', () => {
    expect(
      t(
        { code: 'explain.part.param.tracking', params: { name: 'utm_source', platform: 'UTM' } },
        'en',
      ),
    ).toContain('utm_source');
  });

  it('falls back to English, then to the code itself', () => {
    expect(t('ui.test-only-en' as never, 'es', { 'ui.test-only-en': 'Only English' })).toBe(
      'Only English',
    );
    expect(t('does.not.exist' as never, 'es')).toBe('does.not.exist');
  });

  it('keeps unknown placeholders visible instead of dropping them', () => {
    expect(t({ code: 'explain.part.host', params: {} }, 'es')).toMatch(/\{\w+\}|.+/);
  });
});
