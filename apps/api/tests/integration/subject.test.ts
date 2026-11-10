import { describe, expect, it } from 'vitest';
import { createLimiter, rateLimitHeaders } from '../../src/quota/limiter.ts';
import { MemoryStore, type QuotaStore } from '../../src/quota/store.ts';
import { subjectKey } from '../../src/quota/subject.ts';
import type { Subject } from '../../src/quota/types.ts';
import { T0 } from '../helpers.ts';

const subjects: Subject[] = [
  { type: 'anon-ip', hash: 'f'.repeat(64) },
  { type: 'api-key', keyId: 'key_123', organizationId: 'org_9' },
  { type: 'organization', organizationId: 'org_9' },
];

describe('discriminated quota subject', () => {
  it.each(subjects)('resolves a quota for $type through the same interface', async (subject) => {
    const limiter = createLimiter({ store: new MemoryStore(() => T0), now: () => T0 });
    const decision = await limiter.consume(subject, 'local');
    expect(decision).toMatchObject({ allowed: true, limit: 600, remaining: 599 });
  });

  it('puts the subject type in the key prefix', () => {
    expect(subjectKey(subjects[0]!)).toBe(`anon-ip:${'f'.repeat(64)}`);
    expect(subjectKey(subjects[1]!)).toBe('api-key:key_123');
    expect(subjectKey(subjects[2]!)).toBe('organization:org_9');
  });

  it('keeps counters of different subject types apart', async () => {
    const keys: string[] = [];
    const inner = new MemoryStore(() => T0);
    const store: QuotaStore = {
      increment: (key, ttl) => (keys.push(key), inner.increment(key, ttl)),
    };
    const limiter = createLimiter({ store, now: () => T0 });
    for (const s of subjects) await limiter.consume(s, 'local');
    expect(new Set(keys).size).toBe(3);
    expect(keys.map((k) => k.split(':')[4])).toEqual(['anon-ip', 'api-key', 'organization']);
  });

  it('emits identical RateLimit-* headers for every variant', async () => {
    const shapes = await Promise.all(
      subjects.map(async (s) => {
        const limiter = createLimiter({ store: new MemoryStore(() => T0), now: () => T0 });
        return rateLimitHeaders(await limiter.consume(s, 'inspect'));
      }),
    );
    for (const headers of shapes) expect(headers).toEqual(shapes[0]);
    expect(Object.keys(shapes[0]!)).toEqual([
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
    ]);
  });
});
