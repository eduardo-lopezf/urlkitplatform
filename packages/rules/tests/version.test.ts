import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getTool } from '@urlkit/core/tools';
import pkg from '../package.json' with { type: 'json' };
import { catalog } from '../dist/compiled.ts';
import { checkLock, fingerprint } from '../build/compile.ts';

const lock = JSON.parse(readFileSync(new URL('../catalog.lock.json', import.meta.url), 'utf8')) as {
  version: string;
  fingerprint: string;
};

describe('catalog version', () => {
  it('exposes a semantic version taken from package.json', () => {
    expect(catalog.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(catalog.version).toBe(pkg.version);
  });

  it('fails when a rule file changes without a version bump', () => {
    expect(checkLock(lock, pkg.version, fingerprint())).toEqual({ ok: true });
    expect(checkLock(lock, lock.version, 'other-fingerprint')).toMatchObject({ ok: false });
    expect(checkLock(lock, '9.9.9', 'other-fingerprint')).toMatchObject({ ok: false });
  });

  it('echoes catalogVersion in clean and explain results', async () => {
    const url = 'https://ejemplo.com/?utm_source=x&id=1';
    const cleaned = await getTool('clean').run({ url }, { catalog });
    const explained = await getTool('explain').run({ url }, { catalog });
    expect(cleaned).toMatchObject({ ok: true, value: { catalogVersion: catalog.version } });
    expect(explained).toMatchObject({ ok: true, value: { catalogVersion: catalog.version } });
  });
});
