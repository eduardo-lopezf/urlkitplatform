import { describe, expect, it } from 'vitest';
import { createLimiter } from '../../src/quota/limiter.ts';
import { ANONYMOUS_PLAN } from '../../src/quota/plans.ts';
import { MemoryStore, type QuotaStore } from '../../src/quota/store.ts';
import type { Subject } from '../../src/quota/types.ts';
import { post, T0, testApp } from '../helpers.ts';

const anon: Subject = { type: 'anon-ip', hash: 'a'.repeat(64) };

function recordingStore(
  now: () => number,
): QuotaStore & { calls: Array<{ key: string; ttl: number }> } {
  const inner = new MemoryStore(now);
  const calls: Array<{ key: string; ttl: number }> = [];
  return {
    calls,
    async increment(key, ttl) {
      calls.push({ key, ttl });
      return inner.increment(key, ttl);
    },
  };
}

describe('quota limiter', () => {
  it('uses the anonymous plan from the spec', () => {
    expect(ANONYMOUS_PLAN).toEqual({
      id: 'anonymous',
      limits: {
        inspect: { hour: 10, day: 50 },
        local: { hour: 600 },
        metrics: { hour: 300 },
        // v2 network tools (002/T012, research R9)
        headers: { hour: 10, day: 50 },
        metadata: { hour: 10, day: 50 },
        tls: { hour: 10, day: 50 },
        dns: { hour: 10, day: 50 },
        security: { hour: 10, day: 50 },
      },
    });
  });

  it('refunds one use in every window, never below zero (002/T072)', async () => {
    const now = T0;
    const limiter = createLimiter({ store: new MemoryStore(() => now), now: () => now });
    await limiter.consume(anon, 'dns');
    await limiter.consume(anon, 'dns');
    await limiter.refund(anon, 'dns');
    expect(await limiter.consume(anon, 'dns')).toMatchObject({ remaining: 8 });
    await limiter.refund(anon, 'tls'); // nothing consumed: stays at zero
    expect(await limiter.consume(anon, 'tls')).toMatchObject({ remaining: 9 });
  });

  it('keeps every v2 network tool in its own bucket (FR-005)', async () => {
    const now = T0;
    const limiter = createLimiter({ store: new MemoryStore(() => now), now: () => now });
    for (let i = 1; i <= 10; i++)
      expect(await limiter.consume(anon, 'headers')).toMatchObject({ allowed: true });
    expect(await limiter.consume(anon, 'headers')).toMatchObject({ allowed: false });
    for (const bucket of ['inspect', 'metadata', 'tls', 'dns', 'security'] as const) {
      const decision = await limiter.consume(anon, bucket);
      expect(decision).toMatchObject({ allowed: true, limit: 10, remaining: 9 });
      expect(Object.keys(decision).sort()).toEqual([
        'allowed',
        'limit',
        'remaining',
        'resetSeconds',
      ]);
    }
  });

  it('counts in fixed hour and day windows with a TTL equal to the remaining window', async () => {
    const now = T0 + 25 * 60 * 1000; // 10:25 UTC
    const store = recordingStore(() => now);
    const limiter = createLimiter({ store, now: () => now });
    await limiter.consume(anon, 'inspect');
    const hourStart = Math.floor(now / 1000 / 3600) * 3600;
    const dayStart = Math.floor(now / 1000 / 86_400) * 86_400;
    expect(store.calls).toEqual([
      { key: `quota:inspect:hour:${hourStart}:anon-ip:${anon.hash}`, ttl: 35 * 60 },
      {
        key: `quota:inspect:day:${dayStart}:anon-ip:${anon.hash}`,
        ttl: dayStart + 86_400 - now / 1000,
      },
    ]);
  });

  it('allows 10 inspections per hour and reports the most restrictive window', async () => {
    let now = T0;
    const limiter = createLimiter({ store: new MemoryStore(() => now), now: () => now });
    for (let i = 1; i <= 10; i++) {
      const d = await limiter.consume(anon, 'inspect');
      expect(d).toMatchObject({ allowed: true, limit: 10, remaining: 10 - i });
    }
    const denied = await limiter.consume(anon, 'inspect');
    expect(denied).toMatchObject({
      allowed: false,
      limit: 10,
      remaining: 0,
      retryAfterSeconds: 3600,
    });
    now += 3600 * 1000;
    expect(await limiter.consume(anon, 'inspect')).toMatchObject({ allowed: true });
  });

  it('enforces 50 inspections per day across hours', async () => {
    let now = T0;
    const limiter = createLimiter({ store: new MemoryStore(() => now), now: () => now });
    for (let hour = 0; hour < 5; hour++) {
      for (let i = 0; i < 10; i++)
        expect((await limiter.consume(anon, 'inspect')).allowed).toBe(true);
      now += 3600 * 1000;
    }
    const denied = await limiter.consume(anon, 'inspect');
    expect(denied).toMatchObject({ allowed: false, limit: 50 });
    expect(denied.retryAfterSeconds).toBe(
      Math.floor(T0 / 86_400_000) * 86_400 + 86_400 - now / 1000,
    );
  });

  it('expires counters in the memory store', async () => {
    let now = T0;
    const store = new MemoryStore(() => now);
    expect(await store.increment('k', 10)).toBe(1);
    expect(await store.increment('k', 10)).toBe(2);
    now += 10_000;
    expect(await store.increment('k', 10)).toBe(1);
  });
});

describe('quota over HTTP', () => {
  it('sends RateLimit-* headers on every tool response', async () => {
    const { app } = testApp();
    const res = await post(app, '/v1/parse', { url: 'https://ejemplo.com/' });
    expect(res.status).toBe(200);
    expect(res.headers.get('RateLimit-Limit')).toBe('600');
    expect(res.headers.get('RateLimit-Remaining')).toBe('599');
    expect(Number(res.headers.get('RateLimit-Reset'))).toBeGreaterThan(0);
  });

  it('answers 429 quota.exceeded with Retry-After after 10 inspections in an hour', async () => {
    const { app } = testApp();
    for (let i = 0; i < 10; i++)
      expect((await post(app, '/v1/inspect', { url: 'https://ejemplo.com/' })).status).toBe(200);
    const res = await post(app, '/v1/inspect', { url: 'https://ejemplo.com/' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect(await res.json()).toMatchObject({
      code: 'quota.exceeded',
      message: { code: 'quota.exceeded' },
      retryAfterSeconds: 3600,
    });
    // Other tools keep working (separate bucket).
    expect((await post(app, '/v1/clean', { url: 'https://ejemplo.com/' })).status).toBe(200);
  });

  it('limits metrics events to 300 per hour per visitor and returns 429', async () => {
    const { app } = testApp();
    for (let i = 0; i < 300; i++) {
      expect(
        (await post(app, '/v1/metrics/events', { tool: 'clean', outcome: 'success' })).status,
      ).toBe(204);
    }
    expect(
      (await post(app, '/v1/metrics/events', { tool: 'clean', outcome: 'success' })).status,
    ).toBe(429);
    // Another visitor is unaffected.
    expect(
      (
        await post(
          app,
          '/v1/metrics/events',
          { tool: 'clean', outcome: 'success' },
          { 'x-test-ip': '198.51.100.9' },
        )
      ).status,
    ).toBe(204);
  });

  it('does not count invalid requests against the quota', async () => {
    const { app } = testApp();
    expect((await post(app, '/v1/inspect', { nope: true })).status).toBe(400);
    const ok = await post(app, '/v1/inspect', { url: 'https://ejemplo.com/' });
    expect(ok.headers.get('RateLimit-Remaining')).toBe('9');
  });
});
