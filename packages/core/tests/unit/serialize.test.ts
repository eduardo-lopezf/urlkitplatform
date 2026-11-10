import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseUrl, serializeUrl, toParts } from '../../src/index.ts';

const vectors = (
  JSON.parse(
    readFileSync(new URL('../vectors/urltestdata.json', import.meta.url), 'utf8'),
  ) as unknown[]
).filter((v): v is { input: string; base: string | null; href?: string } => typeof v === 'object');

describe('serializeUrl', () => {
  it('round-trips every WPT vector that parses', () => {
    let checked = 0;
    for (const v of vectors) {
      const parsed = parseUrl(v.input, { standard: true, ...(v.base ? { base: v.base } : {}) });
      if (!parsed.ok) continue;
      const rebuilt = serializeUrl(toParts(parsed.value));
      expect(rebuilt, v.input).toEqual({ ok: true, value: parsed.value.href });
      checked++;
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('round-trips the edge cases kept raw by the parser', () => {
    for (const input of [
      'https://ejemplo.com/?a=1&&b=2&',
      'https://ejemplo.com/?',
      'https://ejemplo.com/?q=%E0%A4%A&x',
      'https://u:p@ejemplo.com:8080/a%20b?x=1#',
      'mailto:alguien@ejemplo.com?subject=hola',
    ]) {
      const parsed = parseUrl(input);
      if (!parsed.ok) throw new Error(input);
      expect(serializeUrl(toParts(parsed.value))).toEqual({ ok: true, value: parsed.value.href });
    }
  });

  it('rejects an invalid port or host naming the part', () => {
    const parsed = parseUrl('https://ejemplo.com/');
    if (!parsed.ok) throw new Error();
    const parts = toParts(parsed.value);
    expect(serializeUrl({ ...parts, port: 70_000 })).toMatchObject({
      ok: false,
      error: { part: 'port' },
    });
    expect(serializeUrl({ ...parts, host: 'a b' })).toMatchObject({
      ok: false,
      error: { part: 'host' },
    });
  });
});
